# RCSprint

A browser 3D **1/10-scale dirt-oval RC sprint car racing game**, modeled on the real **Team Losi 22S Sprint** (TLR 22 platform). Built with **Babylon.js 7 + Havok (WASM) + Vite + TypeScript** — no engine install, no server. The production build is a static folder you can host anywhere.

- **Driver-stand camera** — an elevated trackside vantage that smoothly **follows your car all the way around**, panning into the corners and telephoto-zooming as it runs to the far side, the way you'd watch an RC car from up on the stand (toggle an aerial view with `C`).
- **Sim-leaning physics** — custom raycast vehicle, slip-based friction-circle tires, throttle-steer, and a visual wheelstand/squat/dive.
- **Two-groove dirt that evolves** — a fast bottom that rubbers in early and a top **cushion** that comes in as the track slicks off, so the racing line migrates over a run.
- **Real dirt racecraft AI** — reads the fast groove, passes by taking the line you aren't on, throws **slide jobs**, defends the inside, and races with pace ebbs/bobbles for a dynamic, shuffling pack.
- **Contact that bites** — positional car-to-car and wall contact; a genuinely hard T-bone or wall slam triggers a **barrel-roll rollover** that leaves the car **stuck upside down until a track marshal runs out and rights it** (or you tap `R` to bail yourself out).
- **Track & pit marshals** — hi-vis corner workers stand around the track like a real RC dirt oval, and two rescue marshals sit in chairs at the infield ends, getting up to walk out across traffic and flip wrecked cars back onto their wheels.
- **A flag girl starts every race** — a starter at the start/finish line waves the green flag (with a two-blast starter's whistle) to send the field off.
- **You drive Super Jay's #32** — the player car is the vibrant **orange #32** with a faint metalflake sparkle, carrying Super Jay's logo decal on the wing deck and body sides; the field is led by Super Jay, Aaron Blair, and Carl Vandruff.
- **Driver's manual** — a polished in-game documentation overlay (controls, racecraft, setup, career) opens from the title screen and the pre-race panel; works on desktop and phone.
- **Cinematic attract intro** — open the app and a TV-style "broadcast" reel plays (AI field racing, cutting between a crane orbit, low trackside, a chase cam, and a flyby); click or press any key to enter the menu.
- **15-track career/championship** — progressively harder dirt ovals that **always roll on to the next track**; night rounds under the lights.
- **Full ~8–10-car fields** of winged sprint cars (every car a clean winged sprint — big raked top wing, round front nerf bar, tubular front axle) on lettered **Hoosier** dirt slicks with chrome dished wheels, right-rear rooster-tail dust, and a throaty methanol engine note. The pack **drafts and slingshots** to keep the racing side-by-side.
- **A different horizon every round** — each track has its own dirt color and a distinct themed backdrop: red-rock mesas, pine forest, open plains (silos + barn), city skyline, sand dunes, or striped badlands, on a landscape that runs to the horizon. A **grassed infield** carries a large speedway logo sprayed boldly across the surface.
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
Add **`?demo`** to the URL (`http://127.0.0.1:5173/?demo`) to skip the intro/menu and drop straight into a live race — handy for a quick spectate or sharing a clip. Add **`?round=N`** (1-based, e.g. `?round=11`) to preview a specific career round's track/backdrop without playing up to it; combine them (`?demo&round=11`).

## Build & share
```bash
npm run build    # tsc --noEmit (strict typecheck) then vite build -> dist/
npm run preview  # serve the production build locally
```
`dist/` is the whole game. It must be **served over http(s)** — opening `index.html` from `file://` won't work (browsers block ES modules + WASM there). See **[DISTRIBUTION.md](DISTRIBUTION.md)** for itch.io / Netlify / local-server / same-Wi-Fi options.

## Play it / share a live link (GitHub Pages)
**Live:** **https://aaronjblair.github.io/RCSprint/** — open it on a phone or desktop and share it with anyone.

A workflow at `.github/workflows/deploy.yml` builds and publishes the game on every push to `main` (Pages source is **GitHub Actions**, set under **Settings → Pages**). **Runtime references to `public/` assets must be `import.meta.env.BASE_URL`-relative, not a leading slash**, or they 404 under the `/RCSprint/` subpath. GitHub Pages is free on **public** repos; private-repo Pages needs a paid plan. The relative `base` in `vite.config.ts` also lets you drag `dist/` straight onto Netlify/itch.io to keep a repo private.

> `npm run build` is the only gate — there is no test runner or linter. `tsconfig` is strict (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`), so an unused symbol fails the build. Use `npx tsc --noEmit` for a fast typecheck.

## Code map
```
index.html              # canvas + HUD shell
src/
  main.ts               # entry point + game-flow state machine (attract → prerace → racing → finished),
                        # fixed-timestep loop (1/60), camera + HUD wiring
  core/
    Environment.ts      # IBL, ACES tonemap, bloom, SSAO2, SkyMaterial — day and night setups
    Textures.ts         # procedural dirt (canvas) + bundled PBR dirt; dust sprite
    Input.ts            # unified keyboard / gamepad / self-calibrating yoke+pedals input
    DriverStandCamera.ts# elevated stand camera that follows the car around (aims at it, pans into corners, telephoto zoom)
    CinematicCamera.ts  # attract-mode broadcast director (crane/trackside/chase/flyby cuts)
    Audio.ts            # Web Audio: engine/scrub + subtle ambience bed + green-flag starter's whistle
  physics/
    PhysicsWorld.ts     # Havok init — static track collision + wheel raycasts ONLY
    RaycastVehicle.ts   # custom KINEMATIC vehicle: velocity/yaw integration, tire model, wheel placement
  car/
    Car.ts              # procedural winged sprint car (body, wings, wheels, livery, helmet)
    CarSetup.ts         # tunable setup params + applySetup() (localStorage)
  track/
    TrackDef.ts         # the data shape for one oval
    OvalTrack.ts        # builds a banked stadium oval + grassed infield (large sprayed speedway logo) + centerline helpers (project/gridPose)
    tracks.ts           # generateCareer() — the 15-round calendar (night rounds 8/12/15)
    SurfaceModel.ts     # grip evolution over a race (tacky → groove → slick)
    Scenery.ts          # drivers' stand, themed horizon backdrop (mesas/forest/plains/city/dunes/badlands) + world floor, light towers, vegetation, start/finish gantry
  ai/AIDriver.ts        # racing-line follow, difficulty, avoidance
  race/
    Field.ts            # builds + drives the whole field; contacts, walls, tire wear, dust
    Marshals.ts         # trackside corner workers + infield rescue marshals that right flipped cars
    FlagGirl.ts         # starter at the start/finish line who waves the green flag to send the field off
    RaceManager.ts      # laps, positions, timing off the centerline
  career/Career.ts      # standings, points, unlocks, save/load (localStorage)
  ui/                   # Screens (attract/pre-race/results), Guide (driver's manual overlay), SetupPanel, Minimap
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
