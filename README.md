# ÆTHER — An Infinite Machine

A single-file, zero-dependency real-time WebGL2 experience. No libraries, no images, no fonts, no network requests.

**[index.html](./index.html)** — that's the whole product.

## What's inside

| Layer | Technique |
|---|---|
| Scene | Apollonian gasket distance field, sphere-traced up to 172 steps/px, orbit-trap shading, 5-tap AO, 24-step soft shadows, cubic distance fog |
| Particles | 200,000 GPU points with **no attribute buffers** — positions derived from `gl_VertexID` hashes and advected through an analytic curl field in the vertex shader |
| Post | Bright-pass → 3-level ping-pong Gaussian bloom pyramid → ACES filmic tonemap → radial chromatic aberration → vignette → film grain → ordered dither |
| Perf | Closed-loop adaptive resolution controller (0.55×–1.0×) targeting 60 fps, live FPS sparkline HUD |
| Audio | Fully synthesised: 6-oscillator Lydian drone with per-voice LFOs, generative arpeggiator, convolution reverb built from a procedurally generated noise impulse response |
| UX | Custom inertial cursor, ⌘K fuzzy command palette wired into the render graph, boot sequence, scroll-driven camera rig, IntersectionObserver reveals, PNG frame capture |

## Controls

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `B` | Toggle bloom |
| `P` | Toggle particles |
| `C` | Toggle chromatic aberration |
| `Q` | Cycle quality (Ultra / High / Low) |
| `S` | Toggle procedural audio |
| `⇧S` | Capture frame as PNG |
| `Space` | Pause / resume the render loop |
| `1`–`5` | Jump to section |

## Run

```bash
python3 -m http.server 3000
# → http://localhost:3000
```

Requires WebGL2. Degrades to a notice if unavailable.

## Deploy

GitHub Pages: Settings → Pages → Branch `main` / root. Done — it's one static file.
