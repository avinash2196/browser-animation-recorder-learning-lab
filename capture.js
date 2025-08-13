// capture.js (ESM)
// Run with: node capture.js
import fs from "fs";
import { execFileSync } from "child_process";
import puppeteer from "puppeteer";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

/** ---------- CONFIG ---------- **/
const APP_URL  = "http://localhost:5173";
const CONTAINER = ".pipeline-capture";   // has data-done
const TARGET    = ".pipeline-inner";     // element to screenshot
const FPS = 15;

// Keep native pixels by default. Set to a number to force resize (e.g., 1500).
const OUTPUT_WIDTH = null;               // null => no ffmpeg scaling
const MAX_SEC_FALLBACK = 15;
const OUT_DIR = "frames";
const OUT_GIF = "pipeline-animation.gif";
const SLOW_FACTOR = 12.0;

// Extra pixels on each side to include overflow (curves, glows, etc.)
const OVERSCAN = 100;
/** ----------------------------- **/

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  if (fs.existsSync(OUT_DIR)) {
    for (const f of fs.readdirSync(OUT_DIR)) fs.unlinkSync(`${OUT_DIR}/${f}`);
  } else {
    fs.mkdirSync(OUT_DIR);
  }

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();

    // Load & wait for layout
    await page.goto(APP_URL, { waitUntil: "networkidle0" });
    await page.waitForSelector(CONTAINER, { timeout: 30000 });
    await page.waitForSelector(TARGET, { timeout: 30000 });

    // Prevent clipping & responsive shrink
    await page.evaluate((CONTAINER, TARGET) => {
      const c = document.querySelector(CONTAINER);
      const t = document.querySelector(TARGET);
      if (c) c.style.overflow = "visible";
      // Remove any CSS transforms/zoom that could scale down
      document.documentElement.style.zoom = "1";
      document.body.style.zoom = "1";
      if (t) t.scrollIntoView({ block: "center", inline: "center" });
    }, CONTAINER, TARGET);

    await sleep(200);

    // Measure the target in CSS pixels and capture the devicePixelRatio
    const { cssW, cssH, dpr } = await page.$eval(TARGET, (el) => {
      const r = el.getBoundingClientRect();
      return {
        cssW: Math.ceil(r.width),
        cssH: Math.ceil(r.height),
        dpr: window.devicePixelRatio || 1
      };
    });

    // Make the viewport big enough so the TARGET (plus overscan) isn't squeezed smaller
    const pad = 20 + OVERSCAN; // include overscan in viewport sizing
    const CLAMP = 12000;
    await page.setViewport({
      width:  Math.min(Math.max(cssW + pad * 2, 800), CLAMP),
      height: Math.min(Math.max(cssH + pad * 2, 600), CLAMP),
      deviceScaleFactor: dpr,
    });

    // Recentre after viewport change
    await page.$eval(TARGET, (el) => el.scrollIntoView({ block: "center", inline: "center" }));
    await sleep(150);

    const frameIntervalMs = 1000 / FPS;
    const start = Date.now();
    const tailMs = 600;
    let endedAt = 0;
    let i = 0;

    console.log("Recording…");

    while (true) {
      const file = `${OUT_DIR}/frame_${String(i).padStart(4, "0")}.png`;

      // Build a fresh padded clip rect in CSS pixels (handles subtle layout shifts)
      const baseRect = await page.$eval(TARGET, (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });

      const clip = {
        x: Math.max(0, Math.floor(baseRect.left - OVERSCAN)),
        y: Math.max(0, Math.floor(baseRect.top - OVERSCAN)),
        width: Math.ceil(baseRect.width + OVERSCAN * 2),
        height: Math.ceil(baseRect.height + OVERSCAN * 2),
      };

      // Screenshot the padded clip (includes overflow like the top curve)
      await page.screenshot({
        path: file,
        clip,
        captureBeyondViewport: true,
        fromSurface: true,
      });

      // End condition via data-done
      const endHit = await page.$eval(CONTAINER, (el) => el.getAttribute("data-done") === "true");
      const elapsed = Date.now() - start;
      if (endHit && endedAt === 0) endedAt = Date.now();
      if ((endedAt && Date.now() - endedAt > tailMs) || elapsed > MAX_SEC_FALLBACK * 1000) break;

      const targetT = start + (i + 1) * frameIntervalMs;
      const wait = targetT - Date.now();
      if (wait > 0) await sleep(wait);
      i++;
    }

    console.log("Frames captured. Building GIF…");
    const ffmpegPath = ffmpeg.path;

    // Keep native size unless OUTPUT_WIDTH is set
    const scaleFilter = OUTPUT_WIDTH
      ? `,scale=${OUTPUT_WIDTH}:-1:flags=lanczos`
      : "";

    // Palette
    execFileSync(ffmpegPath, [
      "-y",
      "-framerate", String(FPS),
      "-i", `${OUT_DIR}/frame_%04d.png`,
      "-vf", `setpts=${SLOW_FACTOR}*PTS${scaleFilter},palettegen`,
      "palette.png",
    ], { stdio: "inherit" });

    // Apply palette
    execFileSync(ffmpegPath, [
      "-y",
      "-framerate", String(FPS),
      "-i", `${OUT_DIR}/frame_%04d.png`,
      "-i", "palette.png",
      "-lavfi", `setpts=${SLOW_FACTOR}*PTS${scaleFilter}[x];[x][1:v]paletteuse=dither=sierra2_4a`,
      "-loop", "0",
      OUT_GIF,
    ], { stdio: "inherit" });

    console.log(`✅ Done! GIF saved as ./${OUT_GIF}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
