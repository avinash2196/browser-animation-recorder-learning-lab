/**
 * Configuration module for the Browser Animation Recorder.
 *
 * @module config
 *
 * @description
 * Centralises every tunable parameter in one place so callers never
 * scatter magic values across the codebase. Change values here to
 * target a different app, adjust quality, or fine-tune timing.
 *
 * Learning note:
 *   Externalising configuration is a core 12-Factor App principle (Factor III).
 *   In a production tool these values would typically be read from environment
 *   variables or a YAML/JSON config file so the binary stays unchanged
 *   between environments.
 *
 * Design note:
 *   A plain named-export module is used instead of a class because these are
 *   stateless, read-only settings — there is no encapsulation benefit from
 *   wrapping them in a class.
 */

/** Base URL of the dev-server to open in the headless browser. */
export const APP_URL = "http://localhost:5173";

/**
 * CSS selector for the animation container element.
 * This element must set `data-done="true"` when the animation finishes
 * so the recorder knows when to stop capturing frames.
 */
export const CONTAINER_SELECTOR = ".pipeline-capture";

/**
 * CSS selector for the element whose bounding box defines the capture area.
 * Should be the innermost element that contains all animated content.
 */
export const TARGET_SELECTOR = ".pipeline-inner";

/**
 * Frames per second to record at.
 * Lower values produce fewer frames (smaller file, less smooth playback).
 * Typical range: 10–30 fps.
 */
export const FPS = 15;

/**
 * Extra pixels added to all four sides of the target bounding box.
 * Useful when CSS animations produce overflow such as glows, drop-shadows,
 * or curves that extend beyond the element's layout rectangle.
 */
export const OVERSCAN = 100;

/**
 * Desired output GIF width in pixels.
 * `null` means "keep native resolution" (no FFmpeg scale filter is applied).
 */
export const OUTPUT_WIDTH = null;

/**
 * Safety cut-off in seconds.
 * If `data-done` never becomes `"true"`, the recorder stops after this
 * many seconds to prevent an infinite loop.
 */
export const MAX_SECONDS_FALLBACK = 15;

/**
 * Extra milliseconds to keep recording after the end condition fires.
 * A short tail prevents the GIF from feeling abruptly cut off.
 */
export const TAIL_MS = 600;

/**
 * PTS multiplier passed to FFmpeg's `setpts` filter.
 * Values > 1 slow the GIF down (e.g. 2.0 = half speed, 12.0 = very slow).
 * Values < 1 speed it up.
 */
export const SLOW_FACTOR = 12.0;

/** Directory to write captured PNG frames into (created automatically). */
export const FRAMES_DIR = "frames";

/** Filename for the generated output GIF. */
export const OUTPUT_GIF = "pipeline-animation.gif";
