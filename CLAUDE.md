# CLAUDE.md

## What this is
RCSprint — a browser 3D 1/10-scale dirt-oval RC sprint car game modeled on the **Team Losi 22S Sprint**. Stack: **Babylon.js 7 + Havok (WASM) + Vite + TypeScript**. Driver-stand camera, sim-leaning physics, 15-track career.

## Hard rules
- **It ships.** `npm run build` → `dist/` must build clean and run from any static host. Use procedural assets or files under `public/`; no server-side dependencies.
- **All cars must look picture-perfect** — every car (player and AI) reads as a clean winged sprint car: four corner tires, wing on, body/livery intact, nothing missing/floating/clipping.
- **Verify on screen, don't just describe.** Screenshot (full grid when touching `Car.ts`, `RaycastVehicle.placeWheels`, or spawning) or read sim state before calling a visual/physics change done.

## Commands
```
npm install
npm run dev      # Vite dev server at http://127.0.0.1:5173
npm run build    # tsc --noEmit (strict) then vite build -> dist/
npm run preview  # serve the production build
```
`npm run build` is the only gate (no test runner/linter). `tsconfig` is strict — `noUnusedLocals/Parameters/noImplicitReturns`, so an unused symbol fails the build. Use `npx tsc --noEmit` for a fast typecheck.

In-game: arrows/WASD drive, R reset, C aerial camera, G garage/setup. Gamepad/yoke+pedals take over on actual input.

## Architecture
- `src/main.ts` — entry point + game-flow state machine (`attract → prerace → racing → finished`); boots engine, loads the career round, builds track/field, runs the fixed-timestep loop (`FIXED = 1/60`, ≤6 catch-up steps). Exposes `window.__field`, `__track`, `__race`, `__marshals` for tests. **Attract reel:** on first open per tab session (`sessionStorage rcsprint.seen`) all cars are AI-driven (`Field.attractUpdate`) under a cutting `CinematicCamera`; any click/key sets the flag and reloads into the menu with a fresh grid. Career **always advances** to the next (harder) round — no podium gate.
- **The vehicle is custom and kinematic — NOT a Havok body.** `src/physics/RaycastVehicle.ts` integrates its own velocity (slip/friction-circle tire model) + yaw and raycasts the ground for ride height + banking. Havok (`src/physics/PhysicsWorld.ts`) is used **only** for static track collision and wheel rays. Don't make the car a Havok rigid body — that path was abandoned (applyForce desynced velocity from the mesh). Tune via `VehicleConfig`/`DEFAULT_CONFIG` and the slip/grip math.
- Car-to-car contact and wall limits are **positional**, not physics — `src/race/Field.ts` (`resolveContacts`, `wallLimit`), which also owns surface grip, tire wear, dust, and rollovers for the whole field.
- **Rollovers are marshal-gated.** A hard hit (`RaycastVehicle.triggerRollover`) tumbles the car then leaves it **stuck upside down** (`isStuck`, no control/velocity) until a marshal calls `recover()`; `R` (`resetTo`) clears it for the player. `src/race/Marshals.ts` builds standing corner marshals + two seated infield rescue marshals (updated each frame from `main.ts` with `field.cars`) that walk out to flipped cars and right them.
- Tracks are data (`src/track/TrackDef.ts`); `OvalTrack` builds the banked oval (plus a **grassed infield** filling the oval with the **Flora Vista speedway logo sprayed flat onto it** — `src/assets/logo.png`, imported as a bundled Vite asset, alpha-blended/matte so it reads as paint); `src/track/tracks.ts` `generateCareer()` produces the 15 rounds (night rounds 8/12/15). `Scenery.ts` builds trackside (drivers' stand, light towers, start/finish) plus a **per-round themed backdrop** (`TrackDef.backdrop`: mesas/forest/plains/city/dunes/badlands) and a large **world floor** under it (the 400m infield only covers ±200m, so distant scenery needs ground out to the horizon — half-buried sphere "hills/dunes" float without it). Career save in `src/career/Career.ts` (localStorage); car setup in `src/car/CarSetup.ts`.
- Rendering: Babylon imported **à la carte** with required **side-effect imports** (materials, shadow/physics components, prepass+geometryBuffer for SSAO2). `src/core/Environment.ts` sets IBL/ACES/bloom/SSAO/SkyMaterial (day + night). Dust/dirt are procedural canvas textures (`src/core/Textures.ts`).

## Gotchas (cost real time)
- **Vite watcher crashes (`EBUSY`) on writes into `public/`** while the dev server runs — stop it before writing assets there, then restart. To bundle an image, prefer importing it from `src/assets/` (watcher-safe) over `public/`.
- **Importing a non-code asset (`import x from "./foo.png"`) needs `src/vite-env.d.ts`** with `/// <reference types="vite/client" />`, or strict `tsc` fails with "Cannot find module". The `.png` is then emitted as a hashed `dist/assets/` file and the import is the URL — works in dev and the static build.
- **Runtime paths to `public/` assets must be base-relative** — prefix with `import.meta.env.BASE_URL` (e.g. `BASE_URL + "textures/dirt/"`), never a leading-slash `"/textures/..."`. A leading slash points at the domain root and 404s under the GitHub Pages subpath (`/RCSprint/`). Affects the dirt textures (`Textures.ts`) and IBL `.env` (`Environment.ts`).
- **Headless Playwright renders at ~1–5 fps**, so the `dt` clamp slows the sim and render-loop timing misleads. Step the sim **synchronously at fixed dt** in `browser_evaluate` and read internal state (`vehicle.heading`, `vehicle.position`), not `mesh.getDirection()` (stale until a render frame).
- **No MCP browser? Screenshot with headless Chrome on the real GPU:** `chrome.exe --headless=new --enable-gpu --window-size=1600,900 --virtual-time-budget=<ms> --screenshot=<abs.png> http://127.0.0.1:5173/?demo` then `Read` the PNG. Software/SwiftShader is far too slow (hundreds of virtual frames hang); the `?demo` URL skips the intro/menu straight into a race; `?round=N` (1-based) previews a specific round's track/backdrop; `--virtual-time-budget` also seeks the attract reel's shot cuts.
- **Backdrops barely show in the racing/driver-stand POV** — that camera pitches down at the car, so the distant horizon silhouettes sit above the frame. They read in the **aerial (C) / attract wide** views; verify backdrop changes there (attract reel via `?round=N`), and keep silhouettes tall/close enough to clear the horizon haze.
- **Backdrop instances must never reach inboard of the outfield** (a wide butte/mesa base sitting at the ring radius will overlap the racing surface and "cut off" the track). `buildBackdrop` clamps each instance's radius with `safeR(r, footprint)` to push it out by half its own width; a footprint is closest to the track along **x** (the z ring is stretched ×`zS`). Trim the base/height multipliers rather than relying only on distance.
- A **Logitech Flight Yoke + CH Pro Pedals** show up as gamepads; a held button can hijack the keyboard. For deterministic tests, override `navigator.getGamepads = () => []`.
- Babylon `ParticleSystem` defaults to **additive blend** — dust looked like glowing embers until set to `BLENDMODE_STANDARD`.
- **Ground moiré** at grazing angles = over-tiled dirt; use `anisotropicFilteringLevel = 16`, modest tiling, lower `bumpTexture.level`.
- `Matrix.InvertToRef` is not static — use `matrix.invertToRef(out)`.
- Camera `maxZ` must stay above the skybox size or the sky clips to black.
- **Tires/wheels: no sidewall or shoulder mesh may exceed the tread radius.** A torus "bulge" sized past the tread reads as Mickey-Mouse ears. Revolve the tire carcass from a cross-section with `MeshBuilder.CreateLathe` (rounded shoulders, square-ish tread) and set the tire material `backFaceCulling = false` (a revolved surface is single-sided). Hoosier lettering goes on a thin sidewall disc with a punched-out center; the chrome **dished** wheel + center nut shows through.

## Windows / PowerShell
- `npm` is `npm.cmd` — `Start-Process "npm"` fails. Run `npm run dev` as a background process instead.
- PowerShell 5.1 has no `&&`. Chain with `;` or `if ($?) { ... }`.
- **Git is installed but NOT on PATH.** Prepend it before any git command: `$env:Path = "C:\Program Files\Git\cmd;" + $env:Path`. Use `git --no-pager …` for log/diff. The repo's `origin` is the **public** GitHub repo `aaronjblair/RCSprint` (auto-deploys to GitHub Pages on push); commit + push to `main` via the `/commit-it` skill.
