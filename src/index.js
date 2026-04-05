/**
 * Entry point — orchestrates the two phases of the recording pipeline.
 *
 * @description
 * Phase 1 — Frame capture:
 *   Launches a headless Chromium browser via Puppeteer, navigates to the
 *   target web app, and screenshots the animation element at a fixed
 *   frame-rate until the animation signals completion via `data-done="true"`.
 *
 * Phase 2 — GIF assembly:
 *   Feeds the captured PNG frames to FFmpeg, which applies slow-motion,
 *   optional resizing, and palette optimisation before writing the final GIF.
 *
 * Prerequisites:
 *   - A dev server must be running at the URL defined in `src/config.js`
 *     (default: http://localhost:5173).
 *   - The page must contain the CSS selectors defined in `src/config.js`.
 *   - The animation container must set `data-done="true"` when it finishes.
 *
 * Usage:
 *   node src/index.js
 */

import * as config from "./config.js";
import { recordFrames } from "./recorder.js";
import { buildGif } from "./gif-builder.js";

async function main() {
  console.log("Browser Animation Recorder");
  console.log(`Target : ${config.APP_URL}`);
  console.log(
    `FPS: ${config.FPS}  |  Slow factor: ${config.SLOW_FACTOR}x  |  Overscan: ${config.OVERSCAN}px`
  );
  console.log("─".repeat(52));

  await recordFrames(config);
  buildGif(config);

  console.log(`\nDone! GIF saved as ./${config.OUTPUT_GIF}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
