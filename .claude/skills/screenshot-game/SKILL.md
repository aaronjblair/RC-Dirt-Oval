---
name: screenshot-game
description: See the running RCSprint game on screen — screenshot the dev server with headless Chrome on the real GPU (no MCP/Playwright needed). Use for "screenshot the game", "show me the game", "see it on screen", verifying cars/tracks/backdrops/attract reel.
---

# screenshot-game — see RCSprint on the real GPU

This repo has a hard rule: **verify on screen, don't just describe.** There is no MCP browser / Playwright here, so this is the verified path — headless Chrome rendering the live dev server on the actual GPU, then `Read` the PNG to look at it.

## 0. Make sure the dev server is up
RCSprint serves at `http://127.0.0.1:5173`. Check it, and start it (background) if not:
```powershell
try { (Invoke-WebRequest -Uri "http://127.0.0.1:5173/" -UseBasicParsing -TimeoutSec 4).StatusCode } catch { "DOWN" }
```
If DOWN, start it with the PowerShell tool using `run_in_background: true` (npm is `npm.cmd`, so run the script, don't `Start-Process "npm"`):
```powershell
npm run dev
```
Give it a few seconds, then re-check for `200`.

## 1. Pick the URL for what you want to see
| Want to see | URL | Camera |
|---|---|---|
| Racing POV + full car grid (tires/livery up close) | `/?demo` | driver-stand (low, pitched at the cars) |
| A **specific round**'s track/backdrop | `/?round=N` (1-based) or `/?demo&round=N` | as above |
| The **attract reel** / wide cinematic / horizon backdrops | `/?round=N` (no `demo`) | CinematicCamera wide shots |

- **Backdrops barely show in the `?demo` driver-stand POV** — that camera pitches down at the car, so distant silhouettes sit above the frame. To judge a **backdrop**, use the plain `/?round=N` attract reel (wide/aerial shots).
- `&` in a PowerShell double-quoted URL must be escaped as `` `& `` (e.g. `"http://127.0.0.1:5173/?demo`&round=11"`).

## 2. Capture (real GPU — software/SwiftShader is far too slow and hangs)
```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$png = "C:\Users\aaron\Claude\Projects\RCSprint\run-shot.png"   # root run-*.png is gitignored
$url = "http://127.0.0.1:5173/?demo"
Start-Process -FilePath $chrome -ArgumentList @(
  "--headless=new","--ignore-gpu-blocklist","--enable-gpu",
  "--window-size=1600,900","--virtual-time-budget=5000",
  "--screenshot=$png",$url) -Wait
Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
```
Then **`Read` the PNG** — actually look at it. Do not call a visual change done off a description.

### `--virtual-time-budget=<ms>` does double duty
- It's the warm-up: `?demo` must load Havok + build the field + start the race, so give it **4500–6000 ms**. The attract reel renders earlier (~3400 ms+).
- For the attract reel it also **seeks the shot cuts** (each ~4.8 s): orbit ≈ 0–4.8 s, trackside rise ≈ 4.8–9.6 s, chase ≈ 9.6–14.4 s, flyby ≈ 14.4 s+. Use different budgets to land on different shots. (All attract shots pitch down at the oval; none frame a flat outward horizon.)

## 3. Blank shot? (the recurring trap)
A **~7.6 KB PNG is a blank frame** — the GPU wasn't ready when the shot fired (a race, not a fixed failure). Just retry the same URL with a **longer or slightly different** `--virtual-time-budget`. It usually renders on the next try. A real frame is ~1.3–2.5 MB.

## Guardrails / gotchas
- **Never** pipe a native exe's stderr with `2>$null` in PS 5.1 — it wraps each line as a NativeCommandError and breaks the run. stderr is captured for you.
- **Don't put `Remove-Item` and the `C:\Program …` chrome path in the same statement** — the sandbox false-positive-blocks it. Chrome's `--screenshot` overwrites anyway, so there's no need to delete first.
- Always `Stop-Process` chrome afterwards so headless instances don't pile up.
- Output to **root `run-*.png`** — it's gitignored, so captures never get committed.
- Touched `Car.ts` / `RaycastVehicle.placeWheels` / spawning? Screenshot the **full grid** (`/?demo`) and confirm every car reads as a clean winged sprint before calling it done.
