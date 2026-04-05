/**
 * Frame-recorder module — Puppeteer browser automation.
 *
 * @module recorder
 *
 * @description
 * Manages the headless-browser lifecycle and captures a sequence of PNG
 * screenshots at a fixed frame-rate. Each screenshot is a clipped region
 * around the target animation element, optionally expanded by an overscan
 * margin to include CSS overflow (glows, drop-shadows, curves, etc.).
 *
 * Recording stops when either condition is met:
 *   - The container element sets `data-done="true"` AND a short tail period
 *     has elapsed (to avoid cutting off the last few frames).
 *   - The fallback timeout (`MAX_SECONDS_FALLBACK`) is reached.
 *
 * Learning note:
 *   Puppeteer wraps the Chrome DevTools Protocol (CDP). The screenshot API
 *   uses CDP's `Page.captureScreenshot` under the hood. The
 *   `captureBeyondViewport` flag invokes a composited-surface capture which
 *   renders nodes that overflow the visible scroll area — crucial for
 *   animations that extend beyond the element's layout rectangle.
 *
 * Design note:
 *   The recording loop tracks elapsed wall-clock time rather than frame
 *   count, so timing stays accurate even when a screenshot takes variable
 *   time (e.g. on a heavily loaded CI machine).
 */

import fs from "fs";
import puppeteer from "puppeteer";

/**
 * Pauses execution for the given number of milliseconds.
 *
 * @param {number} ms - Duration to wait.
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generates a zero-padded frame file path.
 *
 * @param {string} dir   - Output directory.
 * @param {number} index - Frame index (0-based).
 * @returns {string} Path string, e.g. `frames/frame_0042.png`.
 *
 * @example
 * buildFramePath("frames", 42); // "frames/frame_0042.png"
 */
export function buildFramePath(dir, index) {
  return `${dir}/frame_${String(index).padStart(4, "0")}.png`;
}

/**
 * Expands a bounding rectangle by a uniform overscan margin on every side.
 *
 * The result is clamped so that `x` and `y` never go below 0 (you cannot
 * screenshot outside the top-left corner of the page).
 *
 * @param {{ left: number, top: number, width: number, height: number }} baseRect
 *   The raw bounding-client-rect values returned by the browser.
 * @param {number} overscan - Pixels to expand on each side.
 * @returns {{ x: number, y: number, width: number, height: number }}
 *   A Puppeteer-compatible clip object with integer pixel values.
 */
export function computeClipRect(baseRect, overscan) {
  return {
    x: Math.max(0, Math.floor(baseRect.left - overscan)),
    y: Math.max(0, Math.floor(baseRect.top - overscan)),
    width: Math.ceil(baseRect.width + overscan * 2),
    height: Math.ceil(baseRect.height + overscan * 2),
  };
}

/**
 * Returns `true` when the maximum recording duration has been exceeded.
 *
 * @param {number} startTime  - `Date.now()` timestamp captured at recording start.
 * @param {number} maxSeconds - Safety cut-off duration in seconds.
 * @returns {boolean}
 */
export function hasReachedTimeout(startTime, maxSeconds) {
  return Date.now() - startTime >= maxSeconds * 1000;
}

/**
 * Clears and recreates the frames output directory.
 *
 * If the directory already exists, every file inside it is deleted first so
 * that a fresh recording does not mix frames from different runs.
 *
 * @param {string} dir - Path to the frames directory.
 */
export function prepareFramesDir(dir) {
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      fs.unlinkSync(`${dir}/${file}`);
    }
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Main recording function — launches a headless browser and captures frames.
 *
 * Steps performed:
 *   1. Navigate to the target URL and wait for the animation elements.
 *   2. Remove CSS zoom quirks and scroll the target into view.
 *   3. Resize the viewport to fit the target element plus overscan padding.
 *   4. Loop: screenshot the target clip area at `FPS` frames per second.
 *   5. Detect the end condition (`data-done="true"`) and stop after `TAIL_MS`.
 *
 * @param {object} config - Full configuration object (see `src/config.js`).
 * @returns {Promise<void>} Resolves when all frames have been written to disk.
 * @throws Will reject if the browser cannot reach the target URL or the
 *         animation selectors are not found within the timeout.
 */
export async function recordFrames(config) {
  const {
    APP_URL,
    CONTAINER_SELECTOR,
    TARGET_SELECTOR,
    FPS,
    OVERSCAN,
    MAX_SECONDS_FALLBACK,
    TAIL_MS,
    FRAMES_DIR,
  } = config;

  prepareFramesDir(FRAMES_DIR);

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();

    // ── Navigate and wait for the animation container ──────────────────────
    await page.goto(APP_URL, { waitUntil: "networkidle0" });
    await page.waitForSelector(CONTAINER_SELECTOR, { timeout: 30_000 });
    await page.waitForSelector(TARGET_SELECTOR, { timeout: 30_000 });

    // ── Neutralise CSS zoom quirks and scroll the target into view ─────────
    await page.evaluate((containerSel, targetSel) => {
      const container = document.querySelector(containerSel);
      const target = document.querySelector(targetSel);
      if (container) container.style.overflow = "visible";
      document.documentElement.style.zoom = "1";
      document.body.style.zoom = "1";
      if (target) target.scrollIntoView({ block: "center", inline: "center" });
    }, CONTAINER_SELECTOR, TARGET_SELECTOR);

    await sleep(200);

    // ── Expand viewport to fit the target element (plus overscan padding) ──
    const { cssW, cssH, dpr } = await page.$eval(TARGET_SELECTOR, (el) => {
      const r = el.getBoundingClientRect();
      return {
        cssW: Math.ceil(r.width),
        cssH: Math.ceil(r.height),
        dpr: window.devicePixelRatio || 1,
      };
    });

    const pad = 20 + OVERSCAN;
    const CLAMP = 12_000;
    await page.setViewport({
      width:  Math.min(Math.max(cssW + pad * 2, 800), CLAMP),
      height: Math.min(Math.max(cssH + pad * 2, 600), CLAMP),
      deviceScaleFactor: dpr,
    });

    // Re-centre after the viewport change
    await page.$eval(TARGET_SELECTOR, (el) =>
      el.scrollIntoView({ block: "center", inline: "center" })
    );
    await sleep(150);

    // ── Recording loop ─────────────────────────────────────────────────────
    const frameIntervalMs = 1_000 / FPS;
    const start = Date.now();
    let endedAt = 0;
    let frameIndex = 0;

    console.log("Recording frames…");

    while (true) {
      const filePath = buildFramePath(FRAMES_DIR, frameIndex);

      // Re-measure each iteration to handle subtle layout shifts
      const baseRect = await page.$eval(TARGET_SELECTOR, (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });

      const clip = computeClipRect(baseRect, OVERSCAN);
      await page.screenshot({
        path: filePath,
        clip,
        captureBeyondViewport: true,
        fromSurface: true,
      });

      // Check the end condition set by the animation component
      const done = await page.$eval(
        CONTAINER_SELECTOR,
        (el) => el.getAttribute("data-done") === "true"
      );

      const now = Date.now();
      if (done && endedAt === 0) endedAt = now;

      if (
        (endedAt && now - endedAt > TAIL_MS) ||
        hasReachedTimeout(start, MAX_SECONDS_FALLBACK)
      ) {
        break;
      }

      // Pace screenshots to the target FPS
      const targetTime = start + (frameIndex + 1) * frameIntervalMs;
      const waitMs = targetTime - Date.now();
      if (waitMs > 0) await sleep(waitMs);

      frameIndex++;
    }

    console.log(`Captured ${frameIndex + 1} frames.`);
  } finally {
    await browser.close();
  }
}
