# RCSprint

A browser 3D **1/10-scale dirt-oval RC sprint car racing game**, modeled on the real **Team Losi 22S Sprint** (TLR 22 platform). Built with **Babylon.js 7 + Havok (WASM) + Vite + TypeScript** — no engine install, no server. The production build is a static folder you can host anywhere.

- **Driver-stand camera** — a fixed trackside RC vantage (toggle an aerial view with `C`).
- **Sim-leaning physics** — custom raycast vehicle, slip-based friction-circle tires, throttle-steer, and a visual wheelstand/squat/dive.
- **Two-groove dirt that evolves** — a fast bottom that rubbers in early and a top **cushion** that comes in as the track slicks off, so the racing line migrates over a run.
- **Real dirt racecraft AI** — reads the fast groove, passes by taking the line you aren't on, throws **slide jobs**, defends the inside, and races with pace ebbs/bobbles for a dynamic, shuffling pack.
- **15-track career/championship** — progressively harder dirt ovals; podium (top-3) to advance; night rounds under the lights.
- **Full ~8–10-car fields** of winged sprint cars (every car a clean winged sprint), with right-rear rooster-tail dust and a high-revving methanol engine note.
- **Live HUD** — lap/position, **interval gaps** to the cars ahead/behind, last vs best lap, tire wear, track state, minimap.
- **Gamepad / yoke + pedals primary, keyboard fallback.**

## Controls
| Input | Action |
|---|---|
| Arrows / WASD | steer, throttle, brake |
| Gamepad | stick = steer, RT/LT = throttle/brake |
| Yoke + pedals | auto-calibrated (steer = centered axis, throttle/brake = pedal axes) |
| `R` | reset car |
| `C` | toggle aerial / driver-stand camera |
| `G` | garage / setup panel (gearing, wing, tire, camber, bias) |
| `K` / `J` | recalibrate input rig / swap throttle–brake (sim rigs) |

## Run it
```bash
npm install
npm run dev      # http://127.0.0.1:5173
```

## Build & share
```bash
npm run build    # tsc --noEmit (strict typecheck) then vite build -> dist/
npm run preview  # serve the production build locally
```
`dist/` is the whole game. It must be **served over http(s)** — opening `index.html` from `file://` won't work (browsers block ES modules + WASM there). See **[DISTRIBUTION.md](DISTRIBUTION.md)** for itch.io / Netlify / local-server / same-Wi-Fi options.

## Share a live link (GitHub Pages)
A workflow at `.github/workflows/deploy.yml` builds and publishes the game on every push to `main`. To turn it on once: in the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. The next push deploys to `https://<user>.github.io/RCSprint/` — a link you can send to anyone. (GitHub Pages is free on **public** repos; private-repo Pages needs a paid plan. The relative `base` in `vite.config.ts` also lets you drag `dist/` straight onto Netlify/itch.io.)

> `npm run build` is the only gate — there is no test runner or linter. `tsconfig` is strict (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`), so an unused symbol fails the build. Use `npx tsc --noEmit` for a fast typecheck.

## Code map
```
index.html              # canvas + HUD shell
src/
  main.ts               # entry point + game-flow state machine (prerace → racing → finished),
                        # fixed-timestep loop (1/60), camera + HUD wiring
  core/
    Environment.ts      # IBL, ACES tonemap, bloom, SSAO2, SkyMaterial — day and night setups
    Textures.ts         # procedural dirt (canvas) + bundled PBR dirt; dust sprite
    Input.ts            # unified keyboard / gamepad / self-calibrating yoke+pedals input
    DriverStandCamera.ts# fixed trackside camera that tracks the player
    Audio.ts            # Web Audio engine/scrub/impact/crowd
  physics/
    PhysicsWorld.ts     # Havok init — static track collision + wheel raycasts ONLY
    RaycastVehicle.ts   # custom KINEMATIC vehicle: velocity/yaw integration, tire model, wheel placement
  car/
    Car.ts              # procedural winged sprint car (body, wings, wheels, livery, helmet)
    CarSetup.ts         # tunable setup params + applySetup() (localStorage)
  track/
    TrackDef.ts         # the data shape for one oval
    OvalTrack.ts        # builds a banked stadium oval + centerline helpers (project/gridPose)
    tracks.ts           # generateCareer() — the 15-round calendar (night rounds 8/12/15)
    SurfaceModel.ts     # grip evolution over a race (tacky → groove → slick)
    Scenery.ts          # stands, grandstands, light towers (lit at night), banners, treeline
  ai/AIDriver.ts        # racing-line follow, difficulty, avoidance
  race/
    Field.ts            # builds + drives the whole field; contacts, walls, tire wear, dust
    RaceManager.ts      # laps, positions, timing off the centerline
  career/Career.ts      # standings, points, unlocks, save/load (localStorage)
  ui/                   # Screens (pre-race/results), SetupPanel, Minimap
public/
  env/environment.env   # prefiltered IBL
  textures/dirt/*.jpg   # bundled PBR dirt (albedo/normal/ao/rough)
```

## Architecture notes
- **The vehicle is custom and kinematic — not a Havok rigid body.** `RaycastVehicle` integrates its own planar velocity (slip-based tires with a friction circle) and yaw, and raycasts the ground each step for ride height and banking alignment. Havok is used *only* for static track collision and those wheel rays. (Havok v2 `applyForce` on a dynamic body desynced velocity from the mesh, so that approach was abandoned.)
- **Car-to-car contact and wall limits are positional**, resolved in `Field.ts` — not physics bodies.
- **Fixed-timestep accumulator** (`FIXED = 1/60`, up to 6 catch-up steps/frame) keeps the sim at real-world speed regardless of frame rate. Each step calls `Field.update(dt, input, raceFraction)`.
- **Tracks are pure data.** `OvalTrack` builds a counter-clockwise banked oval (2 straights + 2 180° turns) from a `TrackDef`; `generateCareer()` scales radius/length/banking/grip/AI/laps across 15 rounds.
- **Rendering** imports Babylon à la carte (smaller bundle) with the required side-effect imports; environment provides IBL + ACES + bloom + SSAO + sky, with a separate night configuration (dark sky/fog, lit corner towers).

## License / assets
Personal project. Dirt textures under `public/textures/` and the `.env` IBL are bundled assets; everything else (geometry, liveries, dust) is generated procedurally at runtime.
