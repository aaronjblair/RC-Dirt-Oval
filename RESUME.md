# RESUME — RC Dirt Oval

**Project:** RC Dirt Oval (local folder still `RCSprint` until the rename script runs) — a browser 3D **night** dirt-oval RC racing game (Babylon.js 7 + Havok + Vite + TypeScript).
**Branch:** `main` · **Date:** 2026-06-18
**Live (PWA, installable iOS/Android/Win/Mac):** https://aaronjblair.github.io/RC-Dirt-Oval/ ✅ 200
**Repo:** https://github.com/aaronjblair/RC-Dirt-Oval · **Releases:** v0.4.0 `.exe`

## Where we left off
All requested mobile/UX + camera polish is shipped + live (latest commit `627bd55`). The last work was
tuning the **in-car (cockpit) camera** to read like a sprint-car cockpit again while still seeing the
track ahead. **First thing next:** any in-car follow-up tweak the user wants (eye height / pitch /
how much top-wing is pulled into the top of the frame).

## What shipped this segment
- **Mobile/touch fixes:** restored the visual-viewport counter-scale in `Input.ts` `pin()` (`6b19255` —
  dropping it made the controls render HUGE); moved the **⏸ pause button** to top-left as a big circle
  (`caf4969`/`30e1390` — it had been hidden behind the centered race HUD); moved the touch **zoom +/-
  buttons to the LEFT edge** out of the center (`df48f50`).
- **Start/zoom:** start light tree shrunk ~1/3 + moved down (`b7b32fc`); the **25%-zoomed-out start is
  ARCADE-ONLY** — sim starts at normal zoom (`caf4969`, `let zoom = gameMode === "arcade" ? 0.8 : 1.0`).
- **Pickups** (`24fcc83`): removed the east-side "backed to the track" group; all trucks park BEHIND the
  stand (count 6–9). Probe-verified: pk meshes x 36.8–63.1, track edge x29, stand x35 — 0 near the track.
- **In-car cockpit view** (`src/core/CockpitCamera.ts`, `627bd55`): **EYE (0,1.45,-1.30), BASE_PITCH 0.10,
  BASE_FOV 1.34** — back in the cockpit (wing side boards frame the nose) with the track clearly ahead;
  verified on both sprint + late model.

## Key decisions (why)
- The **counter-scale in `pin()` is load-bearing** — without it the touch controls balloon. Control drift
  on zoom is handled by the gesture/multi-touch/double-tap blocks instead, NOT by dropping the scale.
- **25% zoom-out at start is arcade-only** (RC Pro-Am feel); the sim should start at normal zoom.
- In-car eye is a **middle ground**: low enough to keep the sprint-cockpit framing, high/back enough to
  see the track ahead (old 1.22/-1.15 = too much hood; 1.85/-1.75 = floated, looked generic).

## Open notes / lower-priority
- **PWA service worker** serves the stale cached bundle in the in-app browser — the user kept seeing old
  placements. Force-refresh = close tab + reopen, or `?v=N`, or reinstall the Home-Screen PWA.
- **In-app browser (Claude app) pinch-zoom** can't be fully blocked by the page (it reflows the controls);
  the installed PWA avoids it. All JS blocks (gesture*, multi-touch, double-tap) are already in.
- **Local folder rename** (`scripts/rename-dirs.ps1`) is still a user-run handoff.
- A fresh **v0.4.x Windows `.exe`** can be rebuilt with `npm run build:win` if wanted.

## Resume this exact session
`cd C:\Users\aaron\Claude\Projects\RCSprint ; claude --resume d51c30d6-4dbf-45c7-826e-671af8f90a4e`
(Only works on the machine holding the local transcript; this RESUME.md is the cross-machine handoff.)

## Build / deploy
`npm run build` green (strict TS); `deploy.yml` success; live URL 200. Latest commit `627bd55`.
