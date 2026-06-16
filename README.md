# RCSprint

A browser 3D **1/10-scale dirt-oval RC sprint car racing game**, modeled on the real **Team Losi 22S Sprint** (TLR 22 platform). Built with **Babylon.js 7 + Havok (WASM) + Vite + TypeScript** — no engine install, no server. The production build is a static folder you can host anywhere.

- **Three camera views** — an elevated **driver-stand** vantage that smoothly **follows your car all the way around** (panning into the corners, telephoto-zooming to the far side), a high **aerial** spectator view, and a first-person **in-car / cockpit** view that rides in the seat looking out over the nose (roll cage + steering wheel framing it, with a subtle lean into the corners and a faint speed shake). The small **upper-left button cycles them** (In-Car → Track → Aerial), or press `V`; `C` still quick-toggles aerial. **Every race starts in the Track view** (a `?view=incar`/`aerial` link can override it). A flip is shown from outside, then snaps back to the cockpit.
- **Sim-leaning physics** — custom raycast vehicle, slip-based friction-circle tires, throttle-steer, and a visual wheelstand/squat/dive.
- **Uniform packed-dirt surface** — one even, earthy brown racing surface with no painted groove bands; grip still evolves invisibly per line in `SurfaceModel` (tacky → groove → slick), so the fast line migrates over a run.
- **Real dirt racecraft AI** — reads the fast groove, passes by taking the line you aren't on, throws **slide jobs**, defends the inside, and races with pace ebbs/bobbles for a dynamic, shuffling pack.
- **Contact that bites** — positional car-to-car and wall contact; a genuinely hard T-bone or wall slam triggers a **barrel-roll rollover** that leaves the car **stuck upside down until a track marshal runs out and rights it** (or you tap `R` to bail yourself out).
- **Track marshals** — **6 hi-vis marshals: 2 sit in camp chairs at the two infield ends, and 4 stand outside the track at the corners** (evenly spread, turns 1–4). When a car **wrecks** (stuck upside down) or **stalls** (stopped/pointing the wrong way), the **nearest available** one gets up/jogs across traffic and **places it back on the racing line — upright, facing race direction, ready to continue** — then returns to its post. The marshals all look a little different (varied shirts, hair, and caps).
- **Subtle electric-motor sound** — the cars are electric, so the player's #32 has a **procedural brushless-RC whine** (Web Audio): a motor note + ESC/PWM "scream" whose pitch rises with throttle and speed, with a faint tire-on-dirt hiss — kept deliberately subtle. It starts on your first click/keypress (browser autoplay rules); **mute with `M` or the 🔊 button** (remembered). AI cars stay silent.
- **A flag girl starts every race** — a starter at the start/finish line waves the green flag to send the field off.
- **You drive Super Jay's #32** — the player car is the vibrant **orange #32**: a plain-orange body with a small "Super Jay" by the cockpit and his **logo on top of the all-orange wing** (reading along the car as it passes).
- **Name your driver** — clicking **START** pops a quick name box (pre-filled **"Super Jay"** — keep it or type your own; blank stays "Super Jay"). Your name is title-cased, remembered between sessions, and shows on the leaderboard. The rest of the field race under **random full names** (e.g. Dale Hutchins, Rusty Calhoun) — stable per grid slot so the season championship adds up.
- **App loading bar** — a clean **RCSPRINT** splash with a progress bar fills as the app boots (engine → physics → track → ready), then fades into the game.
- **Driver's manual** — a polished in-game documentation overlay (controls, racecraft, setup, career) opens from the title screen and the pre-race panel; works on desktop and phone.
- **Cinematic attract intro** — open the app and a TV-style "broadcast" reel plays (AI field racing, cutting between a crane orbit, low trackside, a chase cam, and a flyby); click or press any key to enter the menu.
- **15-track career/championship** — progressively harder dirt ovals that **always roll on to the next track**. The game currently runs **at night** the whole way (forced via `def.night`): a dark sky with a crescent **moon** and a **starfield** (the **Big Dipper** picked out overhead), lit by **6 lamp towers** (four corners + two mid-straight). (The calendar's day/night rounds — night at 8/12/15 — return if that force-night line is removed.)
- **Full 8–12-car fields** (a random count each race) of winged sprint cars modeled on a real winged dirt sprinter — the **huge top wing** with a down-swept front scoop and tall number side boards, **big staggered tires** (biggest on the right-rear) on **orange beadlock wheels**, a detailed tube front end (axle, 4-bar radius rods, tie rod, front wing), nerf bars, and a roll cage with driver. Lettered **Hoosier** dirt slicks, right-rear rooster-tail dust, and **drafting/slingshot** pack racing.
- **A different horizon every round** — each track has its own dirt color and a distinct themed backdrop: red-rock mesas, pine forest, open plains (silos + barn), city skyline, sand dunes, or striped badlands, on a landscape that runs to the horizon. A **grassed infield** carries a large speedway logo sprayed boldly across the surface — with a guy on a red riding mower parked by it for fun. A roofed **timing booth/shack** (dark-gray gable roof) sits beside the drivers' stand on the +z end, with a row of **varied full-size spectators** up on the deck — different shirts, some in ball caps, some with long hair.
- **A toy on a real track** — only the **cars and the track** are 1:10 scale; every person, prop, and building (marshals, flag girl, stand, timing booth, lawnmower rider) is **full real-world size** (~1 unit ≈ 1 foot; a standing adult ≈ 5.7u, stand deck ≈ 5u, shack ≈ 9u), so the people clearly tower over the toy cars.
- **Live HUD** — lap/position, **interval gaps** to the cars ahead/behind, last vs best lap, tire wear, track state, minimap.
- **Gamepad / yoke + pedals primary, keyboard fallback.**

## Controls
| Input | Action |
|---|---|
| Arrows / WASD | steer, throttle, brake |
| Gamepad | stick = steer, RT/LT = throttle/brake |
| Yoke + pedals | auto-calibrated (steer = centered axis, throttle/brake = pedal axes) |
| `R` | reset car |
| `V` (or the upper-left button) | cycle camera view: In-Car / Track / Aerial |
| `C` | quick-toggle aerial / driver-stand camera |
| `M` | mute / unmute engine sound |
| `G` | garage / setup panel (gearing, wing, tire, camber, bias) |
| `K` / `J` | recalibrate input rig / swap throttle–brake (sim rigs) |

## Run it
```bash
npm install
npm run dev      # http://127.0.0.1:5173
```
Add **`?demo`** to the URL (`http://127.0.0.1:5173/?demo`) to skip the intro/menu and drop straight into a live race — handy for a quick spectate or sharing a clip. Add **`?round=N`** (1-based, e.g. `?round=11`) to preview a specific career round's track/backdrop without playing up to it; combine them (`?demo&round=11`). Add **`?view=incar`** (or `aerial`/`track`) to force the starting camera — e.g. `?demo&view=incar` for a shareable in-car ride.

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
                        # fixed-timestep loop (1/60), camera + HUD wiring, boot progress bar, START name prompt
  core/
    Environment.ts      # IBL, ACES tonemap, bloom, SSAO2, SkyMaterial — day and night setups (night: dark sky, crescent moon + starfield incl. the Big Dipper, lit towers)
    Textures.ts         # procedural dirt (canvas) + bundled PBR dirt; dust sprite
    Input.ts            # unified keyboard / gamepad / self-calibrating yoke+pedals input
    DriverStandCamera.ts# elevated stand camera that follows the car around (aims at it, pans into corners, telephoto zoom)
    CockpitCamera.ts    # first-person in-car camera (parented to the player car; subtle lean into corners + speed shake/FOV)
    CinematicCamera.ts  # attract-mode broadcast director (crane/trackside/chase/flyby cuts)
  audio/
    MotorSound.ts       # procedural Web Audio electric-motor whine for the player car (pitch tracks throttle/speed); M / HUD button mute, persisted
  physics/
    PhysicsWorld.ts     # Havok init — static track collision + wheel raycasts ONLY
    RaycastVehicle.ts   # custom KINEMATIC vehicle: velocity/yaw integration, tire model, per-wheel-radius placement (tire stagger)
  car/
    Car.ts              # procedural winged sprint car (swept top wing, staggered tires on orange beadlocks, detailed tube front end, livery, driver)
    CarSetup.ts         # tunable setup params + applySetup() (localStorage)
  track/
    TrackDef.ts         # the data shape for one oval
    OvalTrack.ts        # builds a banked stadium oval + grassed infield (large sprayed speedway logo) + centerline helpers (project/gridPose)
    tracks.ts           # generateCareer() — the 15-round calendar (night rounds 8/12/15)
    SurfaceModel.ts     # grip evolution over a race (tacky → groove → slick) — invisible; the surface is painted one uniform brown
    Scenery.ts          # drivers' stand (+ varied full-size spectators via buildPerson/spectatorLooks) + timing booth/shack, themed horizon backdrop (mesas/forest/plains/city/dunes/badlands) + world floor, 6 light towers, vegetation, start/finish gantry
  ai/AIDriver.ts        # racing-line follow, difficulty, avoidance
  race/
    Field.ts            # builds + drives the whole field; contacts, walls, tire wear, dust
    Marshals.ts         # 6 marshals — 2 seated in chairs at the infield ends, 4 standing outside the corners; nearest available recovers wrecked/stalled cars — placing them back on the racing line, upright and facing race direction. Exports buildPerson + marshalLooks/spectatorLooks (shared figure builder)
    FlagGirl.ts         # starter at the start/finish line who waves the green flag to send the field off
    LawnMower.ts        # easter egg: a guy on a red riding mower parked on the infield by the logo
    RaceManager.ts      # laps, positions, timing off the centerline
  career/Career.ts      # standings, points, unlocks, save/load (localStorage); driver names — player (saved name, default "Super Jay") + stable random AI names (AI_NAMES); titleCaseName
  ui/                   # Screens (attract/pre-race/results, START name prompt), Guide (driver's manual overlay), SetupPanel, Minimap
public/
  env/environment.env   # prefiltered IBL
  textures/dirt/*.jpg   # bundled PBR dirt (albedo/normal/ao/rough)
```

## Architecture notes
- **The vehicle is custom and kinematic — not a Havok rigid body.** `RaycastVehicle` integrates its own planar velocity (slip-based tires with a friction circle) and yaw, and raycasts the ground each step for ride height and banking alignment. Havok is used *only* for static track collision and those wheel rays. (Havok v2 `applyForce` on a dynamic body desynced velocity from the mesh, so that approach was abandoned.)
- **Car-to-car contact and wall limits are positional**, resolved in `Field.ts` — not physics bodies.
- **Fixed-timestep accumulator** (`FIXED = 1/60`, up to 6 catch-up steps/frame) keeps the sim at real-world speed regardless of frame rate. Each step calls `Field.update(dt, input, raceFraction)`.
- **Tracks are pure data.** `OvalTrack` builds a counter-clockwise banked oval (2 straights + 2 180° turns) from a `TrackDef`; `generateCareer()` scales radius/length/banking/grip/AI/laps across 15 rounds.
- **Rendering** imports Babylon à la carte (smaller bundle) with the required side-effect imports; environment provides IBL + ACES + bloom + SSAO + sky, with a separate night configuration (dark sky/fog, crescent moon + starfield with the Big Dipper, 6 lit lamp towers). The game currently runs night-forced via `def.night`.

## License / assets
Personal project. Dirt textures under `public/textures/` and the `.env` IBL are bundled assets; everything else (geometry, liveries, dust) is generated procedurally at runtime.
