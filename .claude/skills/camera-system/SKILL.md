# camera-system — the cameras, view cycling, zoom, and pause

The game runs several cameras, selected each frame in `main.ts` from a `view` enum. Get the wiring right
or a new camera renders without the post-FX (looks flat/wrong) or clips the sky.

## The cameras
- **`DriverStandCamera`** (`core/DriverStandCamera.ts`) — `view === "normal"` ("📺 Track"); the elevated
  follow cam. `update(carPos, dt, zoom)`.
- **`CockpitCamera`** (`core/CockpitCamera.ts`) — `view === "incar"`; first-person, **parented to the
  player car root** via a `cockpitEye` node, adds lean/shake/speed-FOV. `update(dt, vehicle, zoom)`. A flip
  (`isStuck`/`isRolling`) falls back to the external cam.
- **aerial** `UniversalCamera` — `view === "aerial"` (also the legacy **C** quick-toggle).
- **`RCProAmCamera`** (`core/RCProAmCamera.ts`) — `view === "topdown"` ("🎮 RC Pro-Am"); a high
  car-centered overhead that keeps the player fixed on screen while the world scrolls (fixed look dir, no
  yaw-follow). **Default view in Arcade mode.** `update(carPos)`.
- **`CinematicCamera`** — the attract reel only.
- **photoCam** — `?photo` dev/share close rear-3/4 lock on the player car.

## MANDATORY wiring for any new camera
1. `cam.inputs.clear()` (no built-in mouse/keyboard control).
2. `env.pipeline.addCamera(cam.camera)` — ACES/bloom/grading parity.
3. `scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", cam.camera)` in a
   try/catch (SSAO2 may be null on weak GPUs/headless).
4. `maxZ` must exceed the skybox/star-dome size or the sky clips to black.

## View cycling
`type View = "normal" | "incar" | "aerial" | "topdown"`. The upper-left `#view` button + **V** cycle them;
**C** still quick-toggles aerial. The view **always starts** at `"normal"` (career) / `"topdown"` (arcade),
with a `?view=incar|aerial|topdown` override. `reflectView()` writes the label (+ a desktop **V keycap**).

## Manual zoom (all views)
A shared `let zoom = 1.0` in `main.ts` (clamp 0.5–3.0; >1 = in). Inputs: mouse **wheel** (skip attract,
`preventDefault`), **`=`/`+`** and **`-`** keys (respect `typingInField`), and the touch **±** buttons via
`input.onZoom`. Applied per active camera each frame: driver-stand/cockpit take a `zoom` arg; aerial and
RC-Pro-Am set `camera.fov = 0.8 / zoom`.

## Pause
`let paused`, `pausedAccum`, `pauseStart` in `main.ts`. **P** / the `#pause` HUD button → `togglePause`:
gates the racing block (`state === "racing" && !paused`), feeds `race.update(performance.now() - pausedAccum)`
(and the HUD lap clock) so timing stays honest, calls `motor.setPaused`, swaps the ⏸/▶ glyph, and toggles
`#pauseOverlay`. The scene keeps drawing while paused.
