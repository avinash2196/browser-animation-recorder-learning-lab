// capture.js (ESM)
// Run with: node capture.js
import fs from "fs";
import { execFileSync } from "child_process";
import puppeteer from "puppeteer";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

/** ---------- CONFIG ---------- **/
const APP_URL = "http://localhost:5173";   // your dev server
const SELECTOR = ".doctor-animation";      // wrap CombinedAnimation root with this class
const FPS = 15;
const OUTPUT_WIDTH = 1000;                 // final GIF width (keeps aspect ratio)
const MAX_SEC_FALLBACK = 12;               // safety cap if end condition never appears
const END_TEXT = "Clinical note created";  // adjust if you changed clinicalNoteText
const OUT_DIR = "frames";
const OUT_GIF = "combined-animation.gif";
const SLOW_FACTOR = 12.0;                   // 2.0 = half speed, 1.0 = normal, 0.5 = double speed
/** ----------------------------- **/

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  });

  try {
    const page = await browser.newPage();

    // 1) Load app and locate the target element
    await page.goto(APP_URL, { waitUntil: "networkidle0" });
    await page.waitForSelector(SELECTOR, { timeout: 20000 });

    // Ensure the element is centered and layout has settled
    await page.$eval(SELECTOR, (el) =>
      el.scrollIntoView({ block: "center", inline: "center" })
    );
    await sleep(300);

    // 2) Compute clip rect of the entire CombinedAnimation container
    const clip = await page.$eval(SELECTOR, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });

    const frameIntervalMs = 1000 / FPS;
    const start = Date.now();
    const tailMs = 600; // record a small tail after we detect END_TEXT
    let endedAt = 0;
    let i = 0;

    console.log("Recording…");

    while (true) {
      const file = `${OUT_DIR}/frame_${String(i).padStart(4, "0")}.png`;
      await page.screenshot({ path: file, clip });

      // End condition: when the clinical note text appears
      const endHit = await page.evaluate((text) => {
        return Array.from(document.querySelectorAll("*")).some((el) =>
          (el.textContent || "").includes(text)
        );
      }, END_TEXT);

      const elapsed = Date.now() - start;
      if (endHit && endedAt === 0) endedAt = Date.now();

      if ((endedAt && Date.now() - endedAt > tailMs) || elapsed > MAX_SEC_FALLBACK * 1000) {
        break;
      }

      // Pace to FPS (best-effort)
      const targetT = start + (i + 1) * frameIntervalMs;
      const wait = targetT - Date.now();
      if (wait > 0) await sleep(wait);
      i++;
    }

    console.log("Frames captured. Building slow-motion GIF…");

    const ffmpegPath = ffmpeg.path;

    // 3) Build a palette with slow-motion effect
    execFileSync(ffmpegPath, [
      "-y",
      "-framerate", String(FPS),
      "-i", `${OUT_DIR}/frame_%04d.png`,
      "-vf", `setpts=${SLOW_FACTOR}*PTS,scale=${OUTPUT_WIDTH}:-1:flags=lanczos,palettegen`,
      "palette.png"
    ], { stdio: "inherit" });

    // 4) Apply palette to frames with slow-motion effect
    execFileSync(ffmpegPath, [
      "-y",
      "-framerate", String(FPS),
      "-i", `${OUT_DIR}/frame_%04d.png`,
      "-i", "palette.png",
      "-lavfi", `setpts=${SLOW_FACTOR}*PTS,scale=${OUTPUT_WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a`,
      "-loop", "0",
      OUT_GIF
    ], { stdio: "inherit" });

    console.log(`✅ Done! Slow-motion GIF saved as ./${OUT_GIF}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
