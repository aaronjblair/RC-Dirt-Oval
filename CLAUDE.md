# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RCSprint is a browser 3D **1/10-scale dirt-oval RC sprint car racing game** modeled on the real **Team Losi 22S Sprint** (TLR 22 platform). Stack: **Babylon.js 7 + Havok (WASM) + Vite + TypeScript**, no game engine install. Driver-stand camera, sim-leaning physics, a 15-track career/championship.

## Commands

```
npm install
npm run dev       # Vite dev server at http://127.0.0.1:5173 (host is pinned to 127.0.0.1)
npm run build     # tsc --noEmit (typecheck) then vite build -> dist/
npm run preview   # serve the production build
```

There is **no test runner and no linter** configured. `npm run build` is the only gate — it runs `tsc --noEmit` first, and `tsconfig.json` is strict (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`), so an unused import or variable fails the build. Run `npx tsc --noEmit` for a fast typecheck without bundling.

In-game controls: arrows/WASD drive, R resets the car, C toggles aerial camera, G opens the garage/setup panel. Gamepad is primary when present (RT/LT triggers = throttle/brake).

## Architecture

`src/main.ts` is the single entry point and game-flow state machine (`prerace -> racing -> finished`). It boots the engine, loads the career round, builds the track/field, and runs the render loop. There is no router or framework — everything is wired up imperatively in `boot()`.

### The vehicle is custom and kinematic — this is the core design decision

The car is **NOT a Havok dynamic/rigid body**. `src/physics/RaycastVehicle.ts` integrates its own planar velocity (a slip-based tire model with a friction circle), its own yaw (bicycle model + slip oversteer), and raycasts the ground each step for ride height and banking alignment. Havok (`src/physics/PhysicsWorld.ts`) is used **only** for static track collision and those wheel/ground raycasts — never to move a car.

Why: Havok v2 `applyForce` on a dynamic body desynced velocity from the mesh (position pinned while velocity integrated). Do not try to "fix" the vehicle by making it a Havok rigid body — that path was deliberately abandoned. Tune behavior through `VehicleConfig` (`DEFAULT_CONFIG`) and the slip/grip math instead.

Collision filter groups (`GROUP_GROUND=1`, `GROUP_CAR=2`) keep wheel rays hitting only the track. Car-to-car contact and wall limits are NOT physics — they are resolved positionally in `src/race/Field.ts` (`resolveContacts`, `wallLimit`), which also owns surface grip, tire wear, and dust particles for the whole field.

### Data flow per frame

`main.ts` uses a **fixed-timestep accumulator** (`FIXED = 1/60`, up to 6 catch-up steps/frame) so the sim runs at real-world speed even when FPS dips. Each physics step calls `Field.update(dt, playerInput, raceFraction)`, which advances the player vehicle, each `AIDriver` (`src/ai/AIDriver.ts`), the `SurfaceModel` (grip evolving over the race), tire wear, walls, and contacts. `RaceManager` (`src/race/RaceManager.ts`) tracks laps/positions/timing off the track centerline.

### Track and career are data-driven

A track is a `TrackDef` (`src/track/TrackDef.ts`): corner radius, straight length, banking, grip + falloff, AI skill, field size, laps, etc. `OvalTrack` (`src/track/OvalTrack.ts`) procedurally builds a banked stadium oval (2 straights + 2 180° turns, counter-clockwise) from those numbers, and exposes centerline helpers (`project`, `gridPose`) used by lap timing, AI, and the camera. `src/track/tracks.ts` `generateCareer()` produces the 15 progressively harder ovals. Career standings/points/save-load live in `src/career/Career.ts` (localStorage); player car setup in `src/car/CarSetup.ts` (also localStorage, applied via `applySetup`).

### Rendering

Babylon is imported **à la carte** (e.g. `@babylonjs/core/Meshes/mesh`), not from the barrel, to keep the bundle small — match this style and remember the **side-effect imports** (standard/PBR materials, shadow/physics scene components, prepass + geometryBuffer for SSAO2). `src/core/Environment.ts` sets up IBL (.env in `public/env/`), ACES tonemap, bloom, SSAO, and the SkyMaterial. Dirt/dust textures are procedural canvas textures in `src/core/Textures.ts`.

## Gotchas (these cost real time during the build)

- **Vite's watcher crashes (`EBUSY`) on writes into `public/`** while the dev server runs. Stop the dev server before writing/downloading assets into `public/`, then restart.
- **Headless Playwright renders at ~1–5 fps**, so the per-frame `dt` clamp makes the sim run in slow motion — timing assertions through the render loop are misleading. To verify physics/laps, step the sim **synchronously at fixed dt** in `browser_evaluate` (a sync for-loop blocks the render loop, so no interference) and read internal state (`vehicle.heading`, `vehicle.position`) — NOT `mesh.getDirection()`, whose world matrix is stale until a real render frame. `main.ts` exposes `window.__field`, `__track`, `__race` for this.
- **A Logitech Flight Yoke + CH Pro Pedals are connected** and show up as gamepads; a held yoke button can hijack keyboard input. Input only switches to the pad on throttle/brake/button press. For deterministic tests, override `navigator.getGamepads = () => []`.
- `Matrix.InvertToRef` is not static — use `matrix.invertToRef(out)`.
- The camera `maxZ` must stay above the skybox size or the sky clips to black.

## Verifying changes

The user judges on look and feel — when a change is visual or physical, confirm it by running the app and capturing a screenshot or reading sim state, not by describing the intended result.
