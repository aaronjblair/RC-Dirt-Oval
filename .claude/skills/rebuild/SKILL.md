# rebuild — ship everything: docs → build all executables → publish → return links

A one-shot "release the game" ritual. Do **every** step in order. This is the heavier sibling of
**commit-it**: it also produces the cross-platform artifacts (installable **PWA** + a **Windows .exe**)
and ends by printing the install/download links for every platform. Do NOT skip the doc step or the
build gate.

Why PWA + .exe (not native iOS/Mac/Android installers): this is a Windows box with no Apple hardware
or Apple Developer account, and iOS can't sideload arbitrary apps. The installable PWA covers
**iOS, Android, Windows, and Mac** from the browser; the Electron **.exe** is a real Windows installer.
That decision is settled — don't re-litigate it here.

## 0. Make git usable (Windows gotcha)
Git is installed but **not on PATH**. Prepend it once per shell before any git command:
```powershell
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
```
PowerShell 5.1 has no `&&` — chain with `;`. `npm` is `npm.cmd` (run `npm ...`; never `Start-Process npm`).

## 1. Update ALL documentation & .md files FIRST (do not skip)
Reconcile every doc with the CURRENT code before building. Walk and fix drift in:
`CLAUDE.md`, `README.md`, `prompt.txt`/`prompt.md`, `RESUME.md`, `DISTRIBUTION.md`, everything under
`docs/**/*.md`, and every `.claude/skills/*/SKILL.md`. Common drift: renamed/removed features, new
mechanics, changed controls, the audio + **adaptive-quality** sections, and the **distribution/URL**
section (PWA install + .exe download). If a doc names a file/feature that no longer exists, fix it.

## 2. Build gate (the only hard gate)
```powershell
npm run build
```
Must end `✓ built in …` with no `error TS…`. The PowerShell-wrapped chunk-size warning is NOT a
failure. Never ship a red build. This also emits the **PWA** into `dist/` (the
`manifest.webmanifest` + service worker + icon PNGs come from `vite-plugin-pwa`).

## 3. Build the executables
- **PWA**: already produced by step 2 (`dist/`). Sanity-check `dist/manifest.webmanifest` (or
  `manifest.json`), a service worker (`sw.js`/`registerSW.js`), and `pwa-192/512` + `apple-touch-icon`
  PNGs exist.
- **Windows .exe**:
  ```powershell
  npm run build:win        # vite build + electron-builder --win nsis
  ```
  Produces the NSIS installer at `release/*Setup*.exe`. If electron-builder fails, surface the exact
  error (don't loop-retry). Note: the packaged app loads `dist/index.html` via `file://`; if the game
  is blank in the installed app, suspect the Havok `.wasm` path or a service-worker registration error
  under `file://`.

## 4. Publish (ASK FIRST — outward-facing)
This step is gated: **ask the user before committing/pushing and before creating the Release.**
- Stage only the intended files (never `git add -A` — a concurrent session leaves stray `tools/*`,
  `public/superjay-logo.png`). Commit with a concise one-line summary; `git push origin main`.
- The push auto-triggers GitHub Pages (`.github/workflows/deploy.yml`) → deploys the installable PWA.
  Watch it to success and verify the live URL serves (cache-bust):
  ```powershell
  $env:Path = "C:\Program Files\Git\cmd;" + $env:Path
  $rid = gh run list --workflow=deploy.yml --branch main --limit 1 --json databaseId --jq ".[0].databaseId"
  gh run watch $rid --exit-status --interval 8
  (Invoke-WebRequest "https://aaronjblair.github.io/RC-Dirt-Oval/?cb=$(Get-Random)" -UseBasicParsing).StatusCode  # expect 200
  ```
- Attach the Windows installer to a GitHub **Release** (binary lives as a Release asset, NOT committed
  into the tree):
  ```powershell
  gh release create v<x.y.z> "release/<RC Dirt Oval Setup x.y.z>.exe" -R aaronjblair/RC-Dirt-Oval `
    --title "RCSprint v<x.y.z>" --notes "Installable PWA + Windows installer."
  ```
  (Repo target follows whatever repo is currently public — update if the RC-Dirt-Oval rename has
  landed. Free GitHub Pages requires the serving repo to be **public**.)

## 5. Return the links (the skill's output)
Print a tidy block the user can copy:
- **Play / Install (PWA — iOS, Android, Windows, Mac):** `https://aaronjblair.github.io/RC-Dirt-Oval/`
  (iOS: Share → *Add to Home Screen*; Android & desktop Chrome/Edge: *Install app*).
- **Windows installer (.exe):** the GitHub Release asset URL from step 4.
- **Mac / iOS / Android:** install the PWA from the URL above (no native store build).

## Guardrails
- Never `--no-verify`, never force-push, never skip the build gate or the doc reconciliation.
- If a build/deploy/release step fails, surface the **exact** error — don't claim success.
- Verify the LIVE deploy (200) and that the Release shows the `.exe` asset — a green push is not a
  green release.
