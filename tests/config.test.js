/**
 * Unit tests for src/config.js
 *
 * Verifies that every exported constant has the correct type and falls
 * within a sensible range. These tests act as a living guard against
 * accidental misconfiguration (e.g. setting FPS to 0, a negative OVERSCAN,
 * or a malformed URL).
 */

import { describe, it, expect } from "vitest";
import * as config from "../src/config.js";

describe("APP_URL", () => {
  it("is a valid HTTP or HTTPS URL", () => {
    expect(config.APP_URL).toMatch(/^https?:\/\/.+/);
  });
});

describe("CONTAINER_SELECTOR / TARGET_SELECTOR", () => {
  it("CONTAINER_SELECTOR is a non-empty string", () => {
    expect(typeof config.CONTAINER_SELECTOR).toBe("string");
    expect(config.CONTAINER_SELECTOR.length).toBeGreaterThan(0);
  });

  it("TARGET_SELECTOR is a non-empty string", () => {
    expect(typeof config.TARGET_SELECTOR).toBe("string");
    expect(config.TARGET_SELECTOR.length).toBeGreaterThan(0);
  });
});

describe("FPS", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(config.FPS)).toBe(true);
    expect(config.FPS).toBeGreaterThan(0);
  });
});

describe("OVERSCAN", () => {
  it("is a non-negative number", () => {
    expect(typeof config.OVERSCAN).toBe("number");
    expect(config.OVERSCAN).toBeGreaterThanOrEqual(0);
  });
});

describe("OUTPUT_WIDTH", () => {
  it("is null or a positive integer", () => {
    if (config.OUTPUT_WIDTH !== null) {
      expect(Number.isInteger(config.OUTPUT_WIDTH)).toBe(true);
      expect(config.OUTPUT_WIDTH).toBeGreaterThan(0);
    } else {
      expect(config.OUTPUT_WIDTH).toBeNull();
    }
  });
});

describe("MAX_SECONDS_FALLBACK", () => {
  it("is a positive number", () => {
    expect(typeof config.MAX_SECONDS_FALLBACK).toBe("number");
    expect(config.MAX_SECONDS_FALLBACK).toBeGreaterThan(0);
  });
});

describe("TAIL_MS", () => {
  it("is a non-negative number", () => {
    expect(typeof config.TAIL_MS).toBe("number");
    expect(config.TAIL_MS).toBeGreaterThanOrEqual(0);
  });
});

describe("SLOW_FACTOR", () => {
  it("is a positive number", () => {
    expect(typeof config.SLOW_FACTOR).toBe("number");
    expect(config.SLOW_FACTOR).toBeGreaterThan(0);
  });
});

describe("FRAMES_DIR", () => {
  it("is a non-empty string", () => {
    expect(typeof config.FRAMES_DIR).toBe("string");
    expect(config.FRAMES_DIR.length).toBeGreaterThan(0);
  });
});

describe("OUTPUT_GIF", () => {
  it("ends with .gif", () => {
    expect(config.OUTPUT_GIF).toMatch(/\.gif$/);
  });

  it("is a non-empty string", () => {
    expect(config.OUTPUT_GIF.length).toBeGreaterThan(0);
  });
});
