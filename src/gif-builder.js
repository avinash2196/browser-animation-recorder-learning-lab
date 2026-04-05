/**
 * GIF-builder module — FFmpeg pipeline orchestration.
 *
 * @module gif-builder
 *
 * @description
 * Takes a directory of PNG frames and produces a looping, palette-optimised
 * GIF using a two-pass FFmpeg strategy:
 *
 *   Pass 1 (palettegen) — Analyses every frame and builds a custom 256-colour
 *                         palette tailored to the animation's actual colours.
 *
 *   Pass 2 (paletteuse) — Re-encodes the frames using that palette with
 *                         Sierra2_4a dithering to maximise perceived quality.
 *
 * Learning note:
 *   The GIF format allows at most 256 colours per frame. Using a custom
 *   palette built from the real pixel data of your animation produces
 *   dramatically better results than the default web-safe palette. This
 *   two-pass approach is the standard technique used by tools like gifski
 *   and high-quality Photoshop exports.
 *
 * Design note:
 *   `buildPaletteArgs` and `buildGifArgs` are pure functions — they receive
 *   a config object and return a plain array of strings. This makes them
 *   trivially unit-testable without spawning a real FFmpeg process. The
 *   `buildGif` function is the thin integration layer that does actual I/O.
 */

import { execFileSync } from "child_process";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

/**
 * Builds the FFmpeg argument list for palette generation (Pass 1).
 *
 * The generated palette file (`palette.png`) is consumed by Pass 2.
 *
 * @param {object} config
 * @param {number}      config.FPS         - Source frame-rate used during recording.
 * @param {string}      config.FRAMES_DIR  - Directory containing the PNG frames.
 * @param {number}      config.SLOW_FACTOR - PTS multiplier (> 1 slows the GIF down).
 * @param {number|null} config.OUTPUT_WIDTH - Resize width in pixels, or `null` to skip.
 * @returns {string[]} Command-line arguments ready to pass to `execFileSync`.
 */
export function buildPaletteArgs({ FPS, FRAMES_DIR, SLOW_FACTOR, OUTPUT_WIDTH }) {
  const scaleFilter = OUTPUT_WIDTH
    ? `,scale=${OUTPUT_WIDTH}:-1:flags=lanczos`
    : "";
  return [
    "-y",
    "-framerate", String(FPS),
    "-i", `${FRAMES_DIR}/frame_%04d.png`,
    "-vf", `setpts=${SLOW_FACTOR}*PTS${scaleFilter},palettegen`,
    "palette.png",
  ];
}

/**
 * Builds the FFmpeg argument list for GIF encoding using the palette (Pass 2).
 *
 * @param {object} config
 * @param {number}      config.FPS         - Source frame-rate.
 * @param {string}      config.FRAMES_DIR  - Directory containing the PNG frames.
 * @param {number}      config.SLOW_FACTOR - PTS multiplier.
 * @param {number|null} config.OUTPUT_WIDTH - Resize width in pixels, or `null`.
 * @param {string}      config.OUTPUT_GIF  - Output filename for the final GIF.
 * @returns {string[]} Command-line arguments ready to pass to `execFileSync`.
 */
export function buildGifArgs({ FPS, FRAMES_DIR, SLOW_FACTOR, OUTPUT_WIDTH, OUTPUT_GIF }) {
  const scaleFilter = OUTPUT_WIDTH
    ? `,scale=${OUTPUT_WIDTH}:-1:flags=lanczos`
    : "";
  return [
    "-y",
    "-framerate", String(FPS),
    "-i", `${FRAMES_DIR}/frame_%04d.png`,
    "-i", "palette.png",
    "-lavfi", `setpts=${SLOW_FACTOR}*PTS${scaleFilter}[x];[x][1:v]paletteuse=dither=sierra2_4a`,
    "-loop", "0",
    OUTPUT_GIF,
  ];
}

/**
 * Executes both FFmpeg passes to produce a GIF from the captured frames.
 *
 * FFmpeg's stdout/stderr is inherited (piped to the parent process terminal)
 * so progress information is visible during execution.
 *
 * @param {object} config - Full configuration object (see `src/config.js`).
 * @returns {void}
 * @throws {Error} If FFmpeg exits with a non-zero status code.
 */
export function buildGif(config) {
  const ffmpegPath = ffmpeg.path;

  console.log("Building colour palette (Pass 1)…");
  execFileSync(ffmpegPath, buildPaletteArgs(config), { stdio: "inherit" });

  console.log("Encoding GIF (Pass 2)…");
  execFileSync(ffmpegPath, buildGifArgs(config), { stdio: "inherit" });
}
