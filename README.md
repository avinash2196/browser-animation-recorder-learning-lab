> **This repository is intended for learning, experimentation, and reference purposes. It is not designed as a production-grade system.**

# browser-animation-recorder-learning-lab

> Capture any CSS animation running in a real browser and export it as a smooth, palette-optimised GIF — entirely from the command line.

---

## Overview

This project automates the process of recording a web animation and encoding it as a GIF. It:

1. Launches a headless Chromium browser via **Puppeteer**.
2. Navigates to a running dev server and waits for the animation element to appear.
3. Screenshots the target element at a fixed frame-rate until the animation signals completion.
4. Pipes the captured PNG frames through **FFmpeg** using a two-pass palette strategy to produce a high-quality, looping GIF.

### Why this matters in real-world systems

Generating animated documentation assets programmatically is a common need in design systems, marketing tooling, and developer-documentation pipelines. Doing it manually (screen-recording, then editing) is slow and hard to reproduce. Automating it with a headless browser guarantees pixel-perfect, repeatable output every time the animation changes.

---

## Real-World Context

| Use Case | Where it's used |
|---|---|
| Design-system documentation | Animate component states → embed GIFs in Storybook or Notion |
| Marketing assets | Auto-generate product-feature previews on CI |
| Changelog / release notes | Show before/after animations linked to PRs |
| QA / visual regression | Diff animation output across branches |

---

## What This Repo Demonstrates

- **Headless browser automation** — navigating, waiting for selectors, resizing viewport via Puppeteer
- **CDP screenshot API** — using `captureBeyondViewport` and `fromSurface` to capture CSS overflow
- **FFmpeg two-pass encoding** — `palettegen` + `paletteuse` for maximum GIF quality
- **Modular ESM design** — separating config, I/O, and pure logic into testable units
- **Unit testing without I/O** — testing pure functions in isolation using Vitest mocks
- **Frame-pacing** — keeping screenshots aligned to a target FPS on variable-speed machines
- **CSS quirk handling** — neutralising zoom transforms and overflow clipping before capturing

---

## Architecture / Component Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      src/index.js                           │
│         Reads config · orchestrates Phase 1 and 2          │
└────────────────────┬───────────────────────┬────────────────┘
                     │                       │
                     ▼                       ▼
       ┌─────────────────────┐   ┌───────────────────────┐
       │   src/recorder.js   │   │  src/gif-builder.js   │
       │                     │   │                       │
       │ • Launch Puppeteer  │   │ • Pass 1: palettegen  │
       │ • Navigate to URL   │   │ • Pass 2: paletteuse  │
       │ • Fix CSS quirks    │   │ • Write output GIF    │
       │ • Size viewport     │   │                       │
       │ • Screenshot loop   │   └───────────────────────┘
       │   → frames/*.png    │             ▲
       │ • Detect data-done  │             │
       └──────────┬──────────┘    PNG frames on disk
                  │
                  ▼
       ┌─────────────────────┐
       │    src/config.js    │
       │  (shared settings)  │
       └─────────────────────┘
```

**Step-by-step flow:**

1. `index.js` imports `config.js` and calls `recordFrames(config)`.
2. `recorder.js` launches a headless browser, navigates to `APP_URL`, and waits for `CONTAINER_SELECTOR` and `TARGET_SELECTOR` to appear in the DOM.
3. The viewport is resized to exactly fit the target element plus `OVERSCAN` padding, ensuring overflow content (glows, shadows, curves) is included in every screenshot.
4. The recording loop runs at `FPS` frames per second until `data-done="true"` is detected on the container (plus a `TAIL_MS` tail), or until `MAX_SECONDS_FALLBACK` is reached.
5. Each frame is saved as a zero-padded PNG: `frames/frame_0000.png`, `frames/frame_0001.png`, …
6. `buildGif(config)` in `gif-builder.js` runs FFmpeg twice:
   - Pass 1 generates an optimal `palette.png` from the pixel data of all frames.
   - Pass 2 encodes the final GIF using that palette with Sierra2_4a dithering.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Node.js (ESM) | Runtime |
| Puppeteer v23 | Headless Chrome automation |
| `@ffmpeg-installer/ffmpeg` | Bundles a platform FFmpeg binary — no separate install needed |
| Vitest v2 | Unit test runner (ESM-native) |

---

## Project Structure

```
browser-animation-recorder-learning-lab/
├── src/
│   ├── config.js          # All tunable parameters (URL, FPS, selectors, etc.)
│   ├── recorder.js        # Puppeteer browser automation and frame capture
│   ├── gif-builder.js     # FFmpeg two-pass GIF encoding
│   └── index.js           # Entry point — orchestrates recorder + gif-builder
├── tests/
│   ├── config.test.js     # Validates config shape and value ranges
│   ├── recorder.test.js   # Unit tests for pure recorder utilities
│   └── gif-builder.test.js# Unit tests for FFmpeg argument builders
├── frames/                # Runtime output — PNG frames (gitignored)
├── .gitignore
├── LICENSE
├── package.json
└── README.md
```

---

## How to Run Locally

### Prerequisites

- Node.js 18 or later
- A web app running at the URL set in `src/config.js` (default: `http://localhost:5173`)
- The page must have elements matching `CONTAINER_SELECTOR` and `TARGET_SELECTOR`
- The animation container must set `data-done="true"` when the animation finishes

### Install dependencies

```bash
npm install
```

### Record the animation

```bash
npm run record
```

This will:
1. Launch a headless browser and navigate to `APP_URL`.
2. Capture frames into the `frames/` directory.
3. Produce `pipeline-animation.gif` in the project root.

### Configuration

All settings live in [`src/config.js`](src/config.js). Key options:

| Constant | Default | Description |
|---|---|---|
| `APP_URL` | `http://localhost:5173` | Dev server URL |
| `CONTAINER_SELECTOR` | `.pipeline-capture` | Selector for the animation wrapper (must expose `data-done`) |
| `TARGET_SELECTOR` | `.pipeline-inner` | Selector for the element to screenshot |
| `FPS` | `15` | Frames per second |
| `SLOW_FACTOR` | `12.0` | GIF playback speed multiplier (> 1 = slower) |
| `OVERSCAN` | `100` | Extra pixels on each side to capture overflow |
| `OUTPUT_WIDTH` | `null` | Resize GIF width in pixels (`null` = keep native) |
| `MAX_SECONDS_FALLBACK` | `15` | Safety timeout if `data-done` never fires |

### Clean up generated files

```bash
npm run clean
```

---

## How to Run Tests

```bash
npm test
```

Run in watch mode during development:

```bash
npm run test:watch
```

### What is tested

| Test file | What it covers |
|---|---|
| `tests/config.test.js` | Type and range validation for every config export |
| `tests/recorder.test.js` | `buildFramePath`, `computeClipRect`, `hasReachedTimeout` |
| `tests/gif-builder.test.js` | `buildPaletteArgs`, `buildGifArgs` — all FFmpeg flag combinations |

> **Note:** Tests cover all pure logic. The full recording loop (`recordFrames`) and `buildGif` require a live browser and FFmpeg process respectively, so they are not unit-tested — treating them as integration-test territory.

---

## Example Usage

Target web app (`src/config.js` defaults):

```html
<!-- Animation wrapper: set data-done="true" when animation completes -->
<div class="pipeline-capture" data-done="false">
  <!-- Element to screenshot -->
  <div class="pipeline-inner">
    <!-- Your animated content here -->
  </div>
</div>
```

When animation finishes, the app sets:
```js
document.querySelector(".pipeline-capture").dataset.done = "true";
```

Then run:
```bash
npm run record
# → frames/frame_0000.png … frame_NNNN.png
# → palette.png (intermediate, auto-cleaned)
# → pipeline-animation.gif ✓
```

---

## Learning Outcomes

After studying this project you will understand:

- How headless browsers automate real browser rendering (vs. synthetic canvas drawing)
- Why CSS overflow requires viewport sizing and `captureBeyondViewport`
- The `data-done` pattern for signalling async completion across a browser/Node.js boundary
- Why GIF quality requires a custom palette — and how the two-pass FFmpeg strategy works
- How to design modular Node.js tooling with testable pure functions isolated from I/O
- Frame-pacing strategies for hitting a target FPS with variable screenshot latency

---

## Limitations

This is a simplified teaching project. It is **not** production-ready.

| Simplification | What a production tool would add |
|---|---|
| Single target selector | Dynamic selector discovery, multiple capture regions |
| `data-done` attribute | WebSocket or shared-state event bus for completion signalling |
| No retry logic | Exponential backoff for transient browser crashes |
| `execFileSync` (blocking) | Async FFmpeg execution with streaming progress |
| Local frames directory | Cloud storage / CDN upload for CI artefacts |
| Single-threaded | Worker pool for parallel multi-animation capture |
| No auth support | Cookie/token injection for authenticated pages |

---

## Future Improvements

- [ ] Accept CLI flags (`--url`, `--fps`, `--output`) via `process.argv`
- [ ] Add a `--format webp` option (WebP animations are ~30% smaller than GIFs)
- [ ] Watch mode: re-record on file changes during development
- [ ] Add integration tests with a lightweight fixture HTML page
- [ ] Docker image with Node + FFmpeg for zero-dependency CI usage

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

