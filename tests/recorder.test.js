/**
 * Unit tests for src/recorder.js — pure utility functions.
 *
 * The three functions tested here (`buildFramePath`, `computeClipRect`,
 * `hasReachedTimeout`) contain no I/O or browser interaction, so they
 * can be tested in complete isolation.
 *
 * The `puppeteer` and `fs` modules are mocked at the module level to
 * prevent Puppeteer from attempting to download Chrome and to avoid
 * touching the filesystem when the module is imported.
 *
 * Integration tests for the full recording loop (`recordFrames`) require a
 * live browser and dev server and are out of scope for this unit-test suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildFramePath, computeClipRect, hasReachedTimeout } from "../src/recorder.js";

// ── Module-level mocks (hoisted by Vitest before the import above) ──────────

vi.mock("puppeteer", () => ({
  default: { launch: vi.fn() },
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn(),
  },
}));

// ── buildFramePath() ─────────────────────────────────────────────────────────

describe("buildFramePath()", () => {
  it("zero-pads a single-digit index to 4 digits", () => {
    expect(buildFramePath("frames", 0)).toBe("frames/frame_0000.png");
    expect(buildFramePath("frames", 7)).toBe("frames/frame_0007.png");
  });

  it("zero-pads a two-digit index to 4 digits", () => {
    expect(buildFramePath("frames", 42)).toBe("frames/frame_0042.png");
  });

  it("zero-pads a three-digit index to 4 digits", () => {
    expect(buildFramePath("frames", 999)).toBe("frames/frame_0999.png");
  });

  it("does not truncate an index that already has 4 digits", () => {
    expect(buildFramePath("frames", 1234)).toBe("frames/frame_1234.png");
  });

  it("does not truncate an index larger than 4 digits", () => {
    expect(buildFramePath("frames", 10000)).toBe("frames/frame_10000.png");
  });

  it("uses the provided directory name", () => {
    expect(buildFramePath("output", 1)).toBe("output/frame_0001.png");
    expect(buildFramePath("tmp/frames", 5)).toBe("tmp/frames/frame_0005.png");
  });
});

// ── computeClipRect() ────────────────────────────────────────────────────────

describe("computeClipRect()", () => {
  it("expands the bounding rect by the overscan amount on each side", () => {
    const rect = { left: 100, top: 200, width: 400, height: 300 };
    const clip = computeClipRect(rect, 50);

    expect(clip.x).toBe(50);       // 100 - 50
    expect(clip.y).toBe(150);      // 200 - 50
    expect(clip.width).toBe(500);  // 400 + 50 * 2
    expect(clip.height).toBe(400); // 300 + 50 * 2
  });

  it("clamps x to 0 when overscan exceeds the element's left position", () => {
    const rect = { left: 10, top: 200, width: 300, height: 200 };
    const clip = computeClipRect(rect, 100);

    expect(clip.x).toBe(0); // Math.max(0, 10 - 100) = 0
  });

  it("clamps y to 0 when overscan exceeds the element's top position", () => {
    const rect = { left: 200, top: 5, width: 300, height: 200 };
    const clip = computeClipRect(rect, 100);

    expect(clip.y).toBe(0); // Math.max(0, 5 - 100) = 0
  });

  it("produces integer pixel values for fractional bounding rect inputs", () => {
    const rect = { left: 10.7, top: 20.3, width: 300.4, height: 200.6 };
    const clip = computeClipRect(rect, 0);

    expect(Number.isInteger(clip.x)).toBe(true);
    expect(Number.isInteger(clip.y)).toBe(true);
    expect(Number.isInteger(clip.width)).toBe(true);
    expect(Number.isInteger(clip.height)).toBe(true);
  });

  it("acts as a near-identity transform when overscan is 0", () => {
    const rect = { left: 50, top: 80, width: 300, height: 200 };
    const clip = computeClipRect(rect, 0);

    expect(clip.x).toBe(50);
    expect(clip.y).toBe(80);
    expect(clip.width).toBe(300);
    expect(clip.height).toBe(200);
  });

  it("handles very large overscan values without negative dimensions", () => {
    const rect = { left: 5, top: 5, width: 200, height: 150 };
    const clip = computeClipRect(rect, 1000);

    expect(clip.x).toBe(0);
    expect(clip.y).toBe(0);
    expect(clip.width).toBeGreaterThan(0);
    expect(clip.height).toBeGreaterThan(0);
  });
});

// ── hasReachedTimeout() ──────────────────────────────────────────────────────

describe("hasReachedTimeout()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when elapsed time is less than the timeout", () => {
    vi.setSystemTime(1_000); // current fake time = 1 second
    const start = 0;         // recording started at epoch 0

    expect(hasReachedTimeout(start, 5)).toBe(false); // 1s < 5s
  });

  it("returns true when elapsed time exactly equals the timeout", () => {
    vi.setSystemTime(5_000); // current fake time = 5 seconds
    const start = 0;

    expect(hasReachedTimeout(start, 5)).toBe(true); // 5s >= 5s
  });

  it("returns true when elapsed time exceeds the timeout", () => {
    vi.setSystemTime(30_000); // current fake time = 30 seconds
    const start = 0;

    expect(hasReachedTimeout(start, 5)).toBe(true); // 30s > 5s
  });

  it("works correctly when start is mid-sequence (not epoch zero)", () => {
    vi.setSystemTime(10_500); // current fake time
    const start = 9_000;      // recording started 1.5s ago

    expect(hasReachedTimeout(start, 2)).toBe(false); // 1.5s < 2s
    expect(hasReachedTimeout(start, 1)).toBe(true);  // 1.5s >= 1s
  });
});
