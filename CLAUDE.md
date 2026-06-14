# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is
RCSprint — a browser 3D 1/10-scale dirt-oval RC sprint car game modeled on the **Team Losi 22S Sprint**. Stack: **Babylon.js 7 + Havok (WASM) + Vite + TypeScript**. Driver-stand camera, sim-leaning physics, 15-track career.

## Hard rules
- **It ships.** `npm run build` → `dist/` must build clean and run from any static host. Prefer self-contained/procedural assets (or files under `public/`); no server-side dependencies.
- **All cars must look picture-perfect** — every car (player and AI) reads as a clean winged sprint car: four corner tires, wing on, body/livery intact, nothing missing/floating/clipping. When you touch car building (`src/car/Car.ts`), wheel placement (`RaycastVehicle.placeWheels`), or spawning, **screenshot the full grid** and verify before calling it done.
- **Verify visual/physics changes on screen** (screenshot or read sim state), don't just describe them.

## Commands
```
npm install
npm run dev      # Vite dev server at http://127.0.0.1:5173
npm run build    # tsc --noEmit (strict) then vite build -> dist/
npm run preview  # serve the production build
```
No test runner / linter. `npm run build` is the only gate — `tsconfig` is strict (`noUnusedLocals/Parameters/noImplicitReturns`), so an unused symbol fails it. `npx tsc --noEmit` for a fast typecheck.

In-game: arrows/WASD drive, R reset, C aerial camera, G garage/setup. Gamepad/yoke+pedals primary when present.

## Architecture
- `src/main.ts` — single entry point + game-flow state machine (`prerace → racing → finished`); boots engine, loads career round, builds track/field, runs the fixed-timestep loop (`FIXED = 1/60`, ≤6 catch-up steps).
- **The vehicle is custom and kinematic — NOT a Havok body.** `src/physics/RaycastVehicle.ts` integrates its own velocity (slip/friction-circle tire model), yaw, and raycasts the ground for ride height + banking. Havok (`src/physics/PhysicsWorld.ts`) is used **only** for static track collision and wheel rays. Do not turn the car into a Havok rigid body — that path was abandoned (applyForce desynced velocity from the mesh). Tune via `VehicleConfig`/`DEFAULT_CONFIG` and the slip/grip math.
- Car-to-car contact and wall limits are **positional**, not physics — `src/race/Field.ts` (`resolveContacts`, `wallLimit`), which also owns surface grip, tire wear, and dust for the whole field.
- Tracks are data (`src/track/TrackDef.ts`); `OvalTrack` builds a banked oval from the numbers; `src/track/tracks.ts` `generateCareer()` produces the 15 rounds (incl. night rounds 8/12/15). Career save in `src/career/Career.ts` (localStorage), car setup in `src/car/CarSetup.ts`.
- Rendering: Babylon imported **à la carte** with the needed **side-effect imports** (materials, shadow/physics components, prepass+geometryBuffer for SSAO2). `src/core/Environment.ts` sets IBL/ACES/bloom/SSAO/SkyMaterial (day + night). Dust/dirt are procedural canvas textures (`src/core/Textures.ts`).

## Gotchas (cost real time)
- **Vite watcher crashes (`EBUSY`) on writes into `public/`** while dev server runs — stop it before writing assets there, then restart.
- **Headless Playwright renders at ~1–5 fps**, so the `dt` clamp slows the sim — timing assertions via the render loop mislead. Step the sim **synchronously at fixed dt** in `browser_evaluate` and read internal state (`vehicle.heading`, `vehicle.position`), not `mesh.getDirection()` (stale until a render frame). `main.ts` exposes `window.__field`, `__track`, `__race`.
- A **Logitech Flight Yoke + CH Pro Pedals** show up as gamepads; a held button can hijack keyboard. Input only switches to the rig on actual input. For deterministic tests, override `navigator.getGamepads = () => []`.
- Babylon `ParticleSystem` defaults to **additive blend** — dust looked like glowing embers until set to `BLENDMODE_STANDARD`.
- **Ground moiré** at grazing angles = over-tiled dirt textures; use `anisotropicFilteringLevel = 16`, keep tiling modest, lower `bumpTexture.level`.
- `Matrix.InvertToRef` is not static — use `matrix.invertToRef(out)`.
- Camera `maxZ` must stay above the skybox size or the sky clips to black.
