/**
 * Unit tests for src/gif-builder.js — pure argument-builder functions.
 *
 * `buildPaletteArgs` and `buildGifArgs` are pure functions that return
 * FFmpeg command-line argument arrays. Testing them does not require
 * spawning a real FFmpeg process — we simply assert that the correct flags,
 * filters, and filenames appear in the returned array.
 *
 * The `@ffmpeg-installer/ffmpeg` module is mocked so that importing
 * gif-builder.js does not trigger a real binary lookup.
 *
 * Integration tests that execute the full FFmpeg pipeline require a working
 * FFmpeg installation and a frames directory, and are out of scope here.
 */

import { describe, it, expect, vi } from "vitest";
import { buildPaletteArgs, buildGifArgs } from "../src/gif-builder.js";

vi.mock("@ffmpeg-installer/ffmpeg", () => ({
  default: { path: "/usr/bin/ffmpeg" },
}));

/** Default config used across most tests. Override individual fields as needed. */
const BASE_CONFIG = {
  FPS: 15,
  FRAMES_DIR: "frames",
  SLOW_FACTOR: 2.0,
  OUTPUT_WIDTH: null,
  OUTPUT_GIF: "out.gif",
};

// ── buildPaletteArgs() ───────────────────────────────────────────────────────

describe("buildPaletteArgs()", () => {
  it("includes the -framerate flag with the configured FPS value", () => {
    const args = buildPaletteArgs(BASE_CONFIG);
    const idx = args.indexOf("-framerate");

    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("15");
  });

  it("targets the correct frame input pattern for the configured directory", () => {
    const args = buildPaletteArgs(BASE_CONFIG);
    expect(args).toContain("frames/frame_%04d.png");
  });

  it("writes to palette.png as the last argument", () => {
    const args = buildPaletteArgs(BASE_CONFIG);
    expect(args[args.length - 1]).toBe("palette.png");
  });

  it("includes palettegen in the video filter string", () => {
    const args = buildPaletteArgs(BASE_CONFIG);
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("palettegen");
  });

  it("applies the SLOW_FACTOR in the setpts filter", () => {
    const args = buildPaletteArgs(BASE_CONFIG); // SLOW_FACTOR = 2.0 → "2"
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("setpts=2*PTS");
  });

  it("omits the scale filter when OUTPUT_WIDTH is null", () => {
    const args = buildPaletteArgs(BASE_CONFIG);
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).not.toContain("scale=");
  });

  it("includes a lanczos scale filter when OUTPUT_WIDTH is set", () => {
    const args = buildPaletteArgs({ ...BASE_CONFIG, OUTPUT_WIDTH: 800 });
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("scale=800:-1:flags=lanczos");
  });

  it("includes the -y overwrite flag", () => {
    expect(buildPaletteArgs(BASE_CONFIG)).toContain("-y");
  });

  it("uses the custom FRAMES_DIR when specified", () => {
    const args = buildPaletteArgs({ ...BASE_CONFIG, FRAMES_DIR: "output/frames" });
    expect(args).toContain("output/frames/frame_%04d.png");
  });
});

// ── buildGifArgs() ───────────────────────────────────────────────────────────

describe("buildGifArgs()", () => {
  it("writes to the configured OUTPUT_GIF filename as the last argument", () => {
    const args = buildGifArgs(BASE_CONFIG);
    expect(args[args.length - 1]).toBe("out.gif");
  });

  it("includes palette.png as one of the -i inputs", () => {
    const args = buildGifArgs(BASE_CONFIG);
    // Collect all values that follow a -i flag
    const inputs = args.reduce((acc, val, idx) => {
      if (val === "-i") acc.push(args[idx + 1]);
      return acc;
    }, []);
    expect(inputs).toContain("palette.png");
  });

  it("includes the frame input pattern for the configured directory", () => {
    const args = buildGifArgs(BASE_CONFIG);
    const inputs = args.reduce((acc, val, idx) => {
      if (val === "-i") acc.push(args[idx + 1]);
      return acc;
    }, []);
    expect(inputs).toContain("frames/frame_%04d.png");
  });

  it("applies paletteuse with Sierra2_4a dithering in the lavfi filter", () => {
    const args = buildGifArgs(BASE_CONFIG);
    const lavfi = args[args.indexOf("-lavfi") + 1];
    expect(lavfi).toContain("paletteuse=dither=sierra2_4a");
  });

  it("sets -loop to 0 for an infinite-loop GIF", () => {
    const args = buildGifArgs(BASE_CONFIG);
    const loopIdx = args.indexOf("-loop");

    expect(loopIdx).toBeGreaterThan(-1);
    expect(args[loopIdx + 1]).toBe("0");
  });

  it("omits the scale filter when OUTPUT_WIDTH is null", () => {
    const args = buildGifArgs(BASE_CONFIG);
    const lavfi = args[args.indexOf("-lavfi") + 1];
    expect(lavfi).not.toContain("scale=");
  });

  it("includes a lanczos scale filter when OUTPUT_WIDTH is set", () => {
    const args = buildGifArgs({ ...BASE_CONFIG, OUTPUT_WIDTH: 1000 });
    const lavfi = args[args.indexOf("-lavfi") + 1];
    expect(lavfi).toContain("scale=1000:-1:flags=lanczos");
  });

  it("includes the -y overwrite flag", () => {
    expect(buildGifArgs(BASE_CONFIG)).toContain("-y");
  });

  it("applies the SLOW_FACTOR in the setpts filter", () => {
    const args = buildGifArgs({ ...BASE_CONFIG, SLOW_FACTOR: 4.0 }); // → "4"
    const lavfi = args[args.indexOf("-lavfi") + 1];
    expect(lavfi).toContain("setpts=4*PTS");
  });
});
