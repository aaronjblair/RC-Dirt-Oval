# Changelog — Super Jay RC

All notable changes to the game, newest first. Versions match `package.json` and the Windows
installer releases. Architecture lives in `CLAUDE.md`; current state / next steps in `RESUME.md`.

Live: https://aaronjblair.github.io/RC-Dirt-Oval/ · Releases: https://github.com/aaronjblair/RC-Dirt-Oval/releases

## Unreleased — 2026-07-19 (evening, after the 0.6.0 installer)

- **Sport Mod rebuilt as a true open-cage modified** (per the real #32 shop photo, verified through
  3 adversarial judge-agent rounds to a 7.2/10 PASS): open cockpit with interior/seat/steering
  wheel, cage pillars + rock screen, white hero roof, sloped sails, no spoiler, connected front
  hubs, lower stance, door-filling #32.
- **Sport Mod / Dirt Oval everywhere** — all remaining "Sprint Car / Losi 22S" branding replaced
  (HUD, titles, attract splash, Driver's Manual, PWA manifest); `?class=`/`?track=` URL overrides
  removed; dead picker code deleted. Audit-agent verified zero violations.
- **Showcase graphics**: GlowLayer, SSR reflections (High+ tiers), SSAO on the aerial/cinematic
  cameras, cinematic depth-of-field (photo/replay/intro), day color grade.
- Engine pitched down (~130–390 Hz fundamental, rebalanced harmonics — deep V8 rumble); AI pack
  matched. Intro hero-shot camera raised (user-verified framing).
- Fixed the weeks-broken Pages deploy (untracked asset + uncommitted APIs failed CI from a fresh
  checkout since 2026-07-02) and cleaned ~90 MB of repo debris; project hygiene rules added.

## 0.6.0 — 2026-07-19

**Focus / simplification**
- The game is now **single-class**: everyone races the **Dirt Sport Mod** (the IMCA-style open-wheel
  modified). The sprint car and buggy defs remain in code but are no longer offered.
- **Single track**: the career **Dirt Oval**. Figure-8 and off-road stadium defs stay in code
  (reachable via `?track=`) but are off the menu.
- Both game modes (Career/Sim and Arcade) remain.

**Presentation**
- **Opening hero shot** — on first load each tab session the #32 and 11X are parked nose-to-tail in a
  held side-view frame for ~4.5s before the attract reel rolls.
- **Winner's photo** — finishing P1 in any mode shows a full-screen victory photo gated behind a
  CONTINUE button; results/points resume only after the click.
- **Always-on leaderboard** — the live running order sits under the minimap for the whole race,
  player row highlighted.
- **Night lighting overhaul** — the floodlight towers gained glow halos and volumetric beam cones and
  brighter light pools; a ring of ~10 cobra-head **street lights** now fills the corner arcs.
- **Menus fit any screen** — the panel card scrolls (`max-height:92vh`) instead of overflowing.

**Cars**
- Dirt Sport Mod bodywork reshaped toward the reference photos: near-full-width greenhouse (the old
  narrow perched cab read as a pickup), tucked glass, larger door-livery panels.
- **Smooth slick tires** on the sport mod (`buildWheel(..., lugs=false)`); the sprint car keeps tread.

**Race / roster**
- Driver roster: **Jay Hank** (#32, the player default), **Jordan Eddleman** (11X),
  **Aaron Blair** (#46, white car, always in the field).
- The 11X runs a permanent engine boost making it the quickest AI — still ~2% off the player's pace.
- **Starting grids are fully randomized** every race (Fisher-Yates over all spawn slots), replacing
  the previous "grid seeded by last race's finish" rule.

**Fixed**
- `src/assets/aztec-speedway.png` was imported by `OvalTrack.ts` but never committed, so the GitHub
  Pages CI build failed from a fresh checkout and the live site served a stale bundle.

## 0.5.0 — 2026-06-18

- **1:10 RC Buggy** — third car class with its own career: knobby open wheels, long-travel coilovers,
  big rear wing, per-class cockpit eye.
- **Figure-8 track** — self-crossing lemniscate with an at-grade X; windowed projection
  (`OvalTrack.projectNear`) plus per-car `lastS` keeps cars on their own leg through the crossing.
- **Off-road track with real jumps** — ramp climb-rate converts into a genuine launch in
  `RaycastVehicle`; later reworked into a bermed stadium/supercross arena.
- **Post-race replay** — every car's pose is recorded each physics step and played back under the
  cinematic camera with scrub/play/speed/camera controls; **Watch Replay** on every results screen.
- **Track picker** on the setup screen; figure-8 and off-road run as exhibition races.
- **Pluggable centerlines** (`makeCenterline` by `TrackDef.shape`) — the oval stayed byte-identical.
- Career grids seeded from the previous race's finishing order (winner on pole).
- Touch controls swapped (steering right, pedals left); mid-race pause menu; engine-sound fix
  (oscillators start only after the AudioContext resumes) plus sound toggles on every menu.

## 0.4.0 — 2026-06-18

- **Unified setup screen** — name, class, mode, sound and auto-throttle in one place, all persisted.
- **Pause menu** — Resume / Restart / Quit to Menu with a live settings panel.
- **Auto-throttle** — full throttle, steering only.
- Dirt late model rebuilt; infield restored.

## 0.3.0 — 2026-06-17

- **Distribution**: installable PWA (service worker precaches the bundle including the Havok WASM)
  and a **Windows installer** via Electron + electron-builder, shipped as a GitHub Release asset.
- Graphics overhaul batch: manual zoom, pause, tailgate trucks, the #42 livery, the racing groove,
  relocated start/finish, race-end rules, high-RPM engine voice, richer night.
- **Arcade mode** (RC Pro-Am style) with the overhead car-centered camera.
- Rebranded RCSprint → RC Dirt Oval in-code (storage keys migrated).

## 0.1.0–0.2.0 — 2026-06-13 … 06-17

Foundation: Babylon.js 7 + Havok raycast-vehicle sim, the banked dirt oval, the 15-round career,
the winged sprint car modeled on the Team Losi 22S, procedural night scenery (drivers' stand,
spectators, marshals, flag girl, light towers), procedural engine audio, adaptive quality ladder,
and the Super Jay #32 tribute livery.
