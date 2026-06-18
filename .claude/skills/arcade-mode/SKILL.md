# arcade-mode — the RC Pro-Am arcade game mode

The player picks **Career/Sim** or **Arcade** at start (after class select). Arcade is the RC Pro-Am-style
mode: a score, a top-3-or-burn-a-continue gate, and the overhead car-centered camera.

## Persistence + selection (`src/game/Mode.ts`)
- `loadMode`/`saveMode` persist the pick → `localStorage["rcdirtoval.mode"]` (`?mode=career|arcade`
  override). Arcade run-state `{round, continues, score}` lives in `localStorage["rcdirtoval.arcade"]`
  (`loadArcadeRun`/`saveArcadeRun`/`resetArcadeRun`).
- Start flow (`main.ts`): class select → **mode select** (`Screens.modeSelect`) → pre-race menu. Switching
  either persists + reloads so the field/career rebuild.

## On-track items (`src/game/Arcade.ts` = `ArcadeManager`)
- **Only oil/wet SLICK patches remain** — discs that briefly cut grip on any car (`applyBuff("grip", …)`).
  The earlier box **pickups, collectible letters, and boost-strip chevrons were removed** ("get rid of the
  boxes"); `getScore()`/`getLetters()`/`isUpgraded()` are kept as no-op stubs so `main.ts` needs no
  branching. Built only in arcade mode; `update(dt, field)` runs each racing frame. Exposed as
  `window.__arcade`.
- Temporary buffs live on the vehicle: `RaycastVehicle.applyBuff("grip"|"accel"|"top", mult, sec)`,
  `grantImmunity(sec)`, `buffState()` — decayed in `update()`, identical behavior when no buff is active
  (so Career/Sim is untouched).

## Camera + start sequence
- Arcade defaults to the **RC Pro-Am overhead camera** (`view === "topdown"`, `core/RCProAmCamera.ts`) — see
  the **camera-system** skill.
- **Both modes** open each race with a drag-strip **light tree** (`Screens.arcadeLightTree`: staging dots →
  three ambers → GREEN) instead of the old 3-2-1 text, firing the green flag at ~2.4s; a **perfect-launch
  boost** (gas within ~350ms of green → a brief accel buff) is wired in `main.ts`.

## Advancement (`finalize()` in `main.ts`)
Branches by mode. Arcade: finish **top-3** to advance; otherwise burn one of ~3 **continues** (out of
continues → run resets). Score accrues. The Arcade HUD (`#arcadeHud`: Score / Continues) shows only in
arcade mode. Career/Sim is unchanged — always-advance, championship points.
