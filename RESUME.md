# RESUME — RC Dirt Oval

**Project:** RC Dirt Oval (codebase/local folder still named `RCSprint` until the rename script runs) — a browser 3D **night** dirt-oval RC sprint-car game (Babylon.js 7 + Havok + Vite + TypeScript).
**Branch:** `main`
**Live (PWA, installable on iOS/Android/Win/Mac):** https://aaronjblair.github.io/RC-Dirt-Oval/  ✅ serving 200
**Repo:** https://github.com/aaronjblair/RC-Dirt-Oval  (renamed from RCSprint; old `/RCSprint/` URL is retired)
**Date:** 2026-06-17

## Where we left off
Shipped a large batch (commits `854930f` + `1c72129`), repo renamed to **RC-Dirt-Oval**, pushed, and the Pages deploy is **live + verified**. The **v0.3.0 Windows installer** is built (`release/RC Dirt Oval Setup 0.3.0.exe`). Remaining:
1. **GitHub Release** — publish v0.3.0 with that `.exe` (in progress).
2. **Rename the LOCAL folders** — run `scripts/rename-dirs.ps1` AFTER closing Claude + the dev server (Windows locks the in-use dir). It renames the project folder and this session's Claude transcript/memory folder so you can resume.

## Resume this exact Claude session
- **Before** running the rename script (folder still `RCSprint`):
  `cd C:\Users\aaron\Claude\Projects\RCSprint ; claude --resume d51c30d6-4dbf-45c7-826e-671af8f90a4e`
- **After** running `scripts/rename-dirs.ps1` (folder now `RC-Dirt-Oval`):
  `cd C:\Users\aaron\Claude\Projects\RC-Dirt-Oval ; claude --resume d51c30d6-4dbf-45c7-826e-671af8f90a4e`
- Only works on the machine holding the local transcript; this RESUME.md is the cross-machine handoff. Full backups: `C:\Users\aaron\Claude\Backups\` (project + Claude session/memory zips, 2026-06-17).

## What shipped this session
- **Rename → RC Dirt Oval**: in-code display + storage keys (migrated), URLs/repo refs, GitHub repo renamed, deploy verified.
- **RC Pro-Am overhead camera** (arcade default + cycleable) + removed the arcade box pickups/letters/boost chevrons (slicks kept).
- **Deferred backlog**: manual zoom (all views), pause (P/⏸), realistic rollovers, race-ends-one-lap-after-winner, S/F relocated ¾ down the front stretch, driven-groove darkening (≤40%), tailgate pickup trucks, doubled stand + banner + lit booth window, AI wing-top numbers + always-present red/white **#42**, high-revving combustion engine sound, V/M keycaps, opening "Created by Aaron Blair" credit.
- **Graphics overhaul** (render pipeline + procedural textures): night-tuned tonemap/grading/vignette/bloom, chromatic aberration + grain (desktop), deeper SSAO, moon halo + richer starfield; multi-scale dirt albedo + 3-octave bump, softer dust.
- Committed the Super Jay #32 photo asset.

## Also shipped (follow-up)
- **Geometry restyle** (the model half of the "full graphics overhaul"), commit `78d043f`: finer detail on the sprint car, late model, people, scenery, and track — silhouettes/picture-perfect verified, live. NOTE: the **v0.3.0 .exe predates this**; the live PWA has it. Rebuild the installer (`npm run build:win` → new release) if a fresh .exe is wanted.

## Deferred (explicitly held — next pass)
- **WebGPU backend** (WebGL2 fallback): held — can't be verified in this headless-Chrome/Havok/screenshot setup and risks the shippable build. WebGL2 path runs great.
- **Pre-race mute toggle** on the start screen (muting already works via M / HUD button / persisted).

## Build / deploy status
- `npm run build` green; typecheck clean. Live URL 200 at the new repo name.
- `npm run build:win` → `release/RC Dirt Oval Setup 0.3.0.exe` (114.8 MB).
