# RCSprint — build-from-scratch prompt

Paste this whole file to an AI coding agent to rebuild the game. It is the single source
of truth: current, deduplicated, and trimmed to what actually matters. Work in a **loop** —
every milestone ends in a runnable build you **verify on screen** (screenshot or read sim
state) before moving on.

## What to build
A polished, shareable **browser 3D, 1/10-scale dirt-oval RC sprint car** racing game,
modeled on the real **Team Losi 22S Sprint** (TLR 22 platform). It must be a real
deliverable: `npm run build` produces a static `dist/` that runs from any static host with
no server. Driver-stand camera, sim-leaning physics, a 15-round career, full ~8–10-car
fields of winged sprint cars. **Audio:** one subtle procedural electric-motor whine for the *player* car (Web Audio; pitch tracks throttle/speed; mute with **M** / HUD button, persisted) — otherwise quiet (no AI/ambient sound).

## Tech stack
- **Babylon.js 7** (`@babylonjs/core`, `@babylonjs/materials`) imported **à la carte** (not the
  barrel) for a small bundle. Remember the **side-effect imports**: standard/PBR materials,
  shadow + physics scene components, prepass + geometryBuffer (for SSAO2).
- **Havok** physics via `@babylonjs/havok` (WASM), async-initialized before the first step.
- **Vite 5 + TypeScript 5**, strict (`noUnusedLocals/Parameters/noImplicitReturns`).
- No test runner, no linter. **`npm run build` (tsc --noEmit then vite build) is the only gate.**
- `localStorage` for career/setup persistence.

## Core architecture (do these exactly — each was learned the hard way)
- **The vehicle is custom and KINEMATIC — never a Havok rigid body.** `RaycastVehicle`
  integrates its own planar velocity (slip-based friction-circle tires), its own yaw
  (bicycle model + slip oversteer), and raycasts the ground each step for ride height +
  banking. Havok is used **only** for static track collision and wheel rays. (Havok
  `applyForce` on a dynamic body desynced velocity from the mesh — that path is abandoned.)
- **Car-to-car contact and wall limits are POSITIONAL**, not physics — resolved in a `Field`
  class that also owns surface grip, tire wear, dust, and rollovers for the whole field.
- **Rollovers are marshal-gated.** A hard hit barrel-rolls the car about its long axis and
  leaves it **stuck upside down** (no control/velocity) until a marshal rights it; the player
  can tap **R** to bail out.
- **Fixed-timestep accumulator**: `FIXED = 1/60`, ≤6 catch-up steps/frame, so the sim runs at
  real-world speed when FPS dips. Each step: `Field.update(dt, input, raceFraction)`.
- Single entry point `main.ts` with a game-flow state machine: `attract → prerace → racing →
  finished`. Expose `window.__field/__track/__race/__marshals` for tests.

## WORLD SCALE (the rule that prevents the recurring sizing bug)
**Only the cars and the track are 1:10 scale. Everything else is FULL REAL-WORLD size** —
marshals, flag girl, drivers'-stand spectators, the lawnmower rider, the drivers' stand,
the timing booth, and any future person/prop/building.
- Working metric: **1 game unit ≈ 1 foot.**
- Targets: standing adult ≈ **5.7u**; drivers'-stand deck ≈ **5u** (5 ft); shack/booth ≈ **9u**;
  a 1:10 car ≈ **2.5u** long / ~2.5u tall to the wing. People read ~2× a car's height and
  clearly tower over the toy cars.
- Build procedural figures feet-anchored (root origin at the ground, y=0) and scale the root:
  `scale = 5.7 / nativeHeight` (~3.5× on a ~1.6u native figure). Seated/podium figures scale
  the whole assembly so the **person** lands near target.

## Game shape
- **Driver-stand camera**: an elevated trackside RC vantage that smoothly follows the player's
  car all the way around — aims at it (panning into corners), slides along the straight,
  telephoto-zooms to the far side. Toggle an aerial overview with **C**.
- **Attract intro** (once per tab session via `sessionStorage`): the whole field is AI-driven
  under a cinematic "broadcast" camera that cuts between crane orbit, low trackside, chase,
  and flyby; title card overlaid; any click/key flags seen and reloads into the menu with a
  fresh grid. Reads like a video (HUD hidden).
- **`?demo`** skips attract+menu straight into a live race; **`?round=N`** (1-based) forces a
  career round for previewing; combine them.
- **A flag girl** at the start/finish waves the green flag on the countdown GO.
- **HUD**: lap, position, interval gaps ahead/behind, last vs best lap, speed (mph-scaled),
  tire %, track state, minimap. A polished in-game **driver's manual** overlay opens from the
  title and pre-race screens.

## Tracks (data-driven)
- A `TrackDef` holds cornerRadius, straightLength, width, banking (rad), baseGrip, gripFalloff,
  rutIntensity, aiSkill, fieldSize, laps, dirtColor, difficulty, `night`, and `backdrop`
  (mesas/forest/plains/city/dunes/badlands).
- `OvalTrack` builds a **counter-clockwise banked stadium oval** (2 straights + 2 180° turns)
  with walls, **uniform brown packed-dirt racing surface** (contiguous full-width ribbons all
  one earthy brown — NO painted multi-shade groove bands; grip still evolves invisibly per
  line in `SurfaceModel`), a **grassed infield** carrying a large speedway logo sprayed flat
  onto it (bundled image asset, alpha/matte), start/finish, and centerline helpers
  `project()/sampleAt()/gridPose()`.
- `generateCareer()` → **15 progressively harder** ovals (radius shrinks, straights lengthen,
  width narrows, grip drops/falls off faster, ruts + AI rise, laps + field grow, banking ramps
  to ~0.20–0.24 rad). Distinct dirt color + backdrop per round. **Night rounds 8/12/15.** **Each race
  runs a random 8–12-car field** (`def.fieldSize = 8 + rand(0..4)` per load; keep the colour `PALETTE`
  + `DRIVER_NUMBERS` ≥ 12 long).
  (Night is currently force-enabled for the whole game via `def.night = true` in `main.ts`;
  remove that line to restore the day/night calendar.)

## Cars — must look PICTURE-PERFECT (hard visual bar)
Every car (player + AI) reads as a clean winged sprint car at all times: four corner tires,
top + front wings on, body/livery intact, driver + helmet, roll cage, nothing missing/
floating/clipping. Build procedurally (`Car.ts`):
- Body tub/tail/nose; a big raked **top wing** (down-swept front scoop, tall lettered side
  boards with car number, wickerbill) on a chrome wing tree; smaller front wing.
- Exposed sprint front end: round **nerf-bar nose hoop**, tubular **straight front axle** on
  4-bar radius rods + tie rod, king-pins, torsion shocks. Roll cage, nerf bars, engine block,
  rear coilovers, **chrome swept-up "zoomie" exhaust headers** (keep the headers; omit the
  upright intake velocity stacks for a cleaner look).
- **Staggered tires** (biggest right-rear) on **orange beadlock** wheels — each tire **revolved
  from a cross-section with a lathe** (rounded shoulders, square-ish tread). No sidewall/
  shoulder mesh may exceed the tread radius (a too-big torus bulge = Mickey-Mouse ears). Set
  the tire material `backFaceCulling = false` (revolved carcass is single-sided). Lettered
  Hoosier sidewall disc over a chrome dished wheel + center nut. Per-wheel radius feeds wheel
  placement so big tires don't sink/float.
- PBR paint + clearcoat; per-side liveries on canvas DynamicTextures (mirror text on the left).
- Hero car = **Super Jay's orange #32** (plain-orange body, small "Super Jay" by the cockpit,
  his logo laid on the all-orange wing). Field led by Super Jay, Aaron Blair, Carl Vandruff.
- **After ANY change to car building / wheel placement / spawning, screenshot the full grid and
  verify before calling it done.**

## Marshals, flag girl, easter egg (all REAL-WORLD size — see WORLD SCALE)
- **6 track marshals**: **2 sit in camp chairs at the two infield ends** (one chair per end) and
  **4 stand outside the track at the corners** (evenly spread, turns 1–4). They wait until there's
  trouble. When a car is **wrecked (stuck upside down)** OR **stalled** (stopped / pointing the
  wrong way at near-zero speed for ~3 s while green), the **nearest available** marshal (seated or
  standing) gets up/jogs across traffic to it and **places the car back on the racing line, upright,
  facing race direction, ready to continue** (via `vehicle.resetTo(pos, yaw)` using `track.project()`
  → nearest centerline + tangent), then returns to its post (re-seating or standing). (Rollover cars
  stay flipped until reached; the player can also tap **R**.) Give each marshal a `seated` flag so it
  returns to the right posture.
- **Flag girl** at the start/finish on a small podium; `greenFlag()` fires a big wave from the
  countdown GO and the `?demo` start, decaying to idle.
- **Marshal variety**: give the marshals varied looks (shirt/hair/skin/headwear/cap) so no two read
  identically.
- **Easter egg**: a guy on a red riding mower parked on the infield grass by the logo (static).
- Build figures from cheap primitives (cylinders/capsules/spheres) under one feet-anchored
  `TransformNode` root; freeze static meshes; animated parts go under a child pivot.

## Scenery & night sky (`Scenery.ts`, `Environment.ts`)
- Real-size **drivers' stand** (~5u/5 ft deck, rails, ~8 spectators) on the front straight; a
  small roofed **timing booth/shack** (~9u, dark-gray gable roof) beside it on the +z end; a
  start/finish gantry; **6 light towers** (4 corners + 2 mid-straight) whose PointLights light
  only at night.
- Per-round **themed backdrop** silhouette + a large **world floor** (~1700u) under everything
  (the 400m infield only covers ±200m, so distant scenery needs ground to the horizon). A
  backdrop instance must never reach inboard of the outfield (clamp its radius by half its
  width) or it clips the track.
- **Night sky**: dark SkyMaterial dome, cool dark fog, low IBL, dim moonlight sun + lit towers,
  plus a **crescent moon** (billboarded emissive disc with an offset punch-out), a **star dome**
  (emissive random-dot DynamicTexture, `applyFog=false`, emissive > 1 so bloom catches them), and
  a **Big Dipper** asterism (billboarded bright dots, north-up, pointer stars toward Polaris),
  all positioned UP among the stars.
- Rendering: prefiltered IBL `.env`, ACES tonemap, bloom, SSAO2, FXAA + sharpen, light haze.
  Dust = a `ParticleSystem` per car set to `BLENDMODE_STANDARD` (Babylon defaults to additive →
  glowing embers), tinted from dirtColor. Avoid ground moiré: `anisotropicFilteringLevel = 16`,
  modest tiling, low bump level. Camera `maxZ` must exceed the skybox size (or the sky clips to
  black) and the star-dome radius.

## Audio (subtle, player-car only — `src/audio/MotorSound.ts`)
Pure procedural **Web Audio** (no file to ship). Emulate an electric **brushless RC** motor: a
`sawtooth` fundamental whose frequency tracks player `speed`+throttle (~90–450 Hz), a detuned higher
`square` **ESC/PWM whine** (~4–5× the fundamental, the electric "scream"), a sub for body, and a
faint speed-scaled white-noise tire/dirt hiss — all through a **low-pass that opens with throttle**
(keep the cutoff high enough to stay audible) and under a **low master-gain cap** so it stays subtle.
The `AudioContext` starts suspended; `resume()` on the first user gesture (autoplay policy), then
`update(throttle, speed)` each physics step **only while racing**. Smooth params with
`setTargetAtTime` (no zipper). **Mute** with `M` / a HUD 🔊 button → master gain 0, persisted to
`localStorage["rcsprint.muted"]`. Degrade to a silent no-op if `AudioContext` is unavailable.

## AI, career, input
- 8–10 AI per field following the racing line with per-track difficulty + variance, drafting,
  slide jobs, inside defense, and pace bobbles for a shuffling pack. Sensible, varied finishes.
- Career: points (25,20,16,13,11,9,7,5,4,3,2,1), standings, save/load. The season **always
  advances** to the next (harder) round from results — no podium gate. Finale shows the champion.
- Input: keyboard (arrows/WASD, R reset, C camera, G garage, K/J rig calibrate); standard
  gamepad (stick steer, RT/LT throttle/brake); **self-calibrating Logitech Flight Yoke + CH Pro
  Pedals** (learn resting axes: centered = steering, extreme = pedals; only switch off keyboard
  once the rig actually moves). On-screen touch controls on phones.

## Verification (the user judges on look & feel)
- Headless renders at ~1–5 fps, so the dt clamp slows the sim. For deterministic tests, **step
  the sim synchronously at fixed dt in page script and read internal state** (`vehicle.heading`,
  `vehicle.position`) — not `mesh.getDirection()` (stale until a render frame).
- Use real-GPU headless Chrome screenshots of the dev server (the Playwright WebGL shot of this
  canvas is stale/garbled). `?demo` = driver-stand POV; plain `?round=N` = attract wide.
- **Backdrops and the night sky (moon/stars) barely show in the bowl-pitched cameras** — the
  upper sky sits above frame. Verify them by freezing the scene
  (`scene.onBeforeRenderObservable.clear()`), aiming a camera at the sky, `render()`, then
  screenshotting; or in the attract wide shots.
- **Verify figure scale deterministically**: read a figure's world bounding-box height via
  `browser_evaluate` and confirm ≈5.7u with feet at y≈0.

## Commands
```
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # tsc --noEmit (strict) then vite build -> dist/
npm run preview  # serve the production build
```
Deploys to GitHub Pages on push to `main`. **Runtime `public/` asset paths must be
`import.meta.env.BASE_URL`-relative, never a leading slash**, or they 404 under the
`/RCSprint/` subpath (build stays green; live game breaks). Bundle images via `import` from
`src/assets/` to dodge that entirely.
