---
name: commit-it
description: Verify, document, commit, and deploy all work on RCSprint. Use when the user says "commit it", "commit everything", or wants the project checkpointed to GitHub. Builds clean, reconciles docs + CLAUDE.md with reality, removes stray files, commits and pushes to origin/main, then verifies the public GitHub Pages deploy went live.
---

# commit-it — verify, document, commit, deploy RCSprint

A disciplined checkpoint for this repo. Do **every** step in order. Don't skip the build or the doc reconciliation just because the code "looks done" — drift between docs and code is the recurring failure this skill exists to prevent.

## 0. Make git usable (Windows gotcha)
Git is installed but **not on PATH** in this environment. Prepend it once per shell before any git command:
```powershell
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
```
Use `git --no-pager ...` for log/diff so output doesn't block.

## 1. Verify the build is green (the only gate)
```powershell
npm run build
```
Must end in `✓ built in …` with no TypeScript errors. The native-command stderr noise (chunk-size warning wrapped by PowerShell) is **not** a failure — look for the `✓` line and absence of `error TS…`. If it fails, fix it before committing. Never commit a red build.

## 2. Survey what changed — add / update / remove
```powershell
git status --short
git status --porcelain --untracked-files=all   # catch untracked files
git ls-files | Where-Object { $_ -match '\.(png|jpe?g|zip)$' }   # catch stray tracked binaries
```
Decide for each:
- **Add** — new source/assets that belong in the repo.
- **Update** — modified tracked files.
- **Remove** — anything now excluded by `.gitignore` but still tracked (e.g. root `*.png`/`*.jpeg` verification screenshots committed before the ignore rule). Untrack with `git rm --cached <file>` (the local file stays; it's ignored going forward). Don't commit `node_modules/`, `dist/`, `RCSprint-web.zip`, `.playwright-mcp/`, or `.claude/*.lock`.

## 3. Reconcile ALL documentation with the code (do not skip)
For every code change in this batch, check whether these still describe reality and fix any drift:
- **README.md** — feature list, the **Code map** (esp. the one-line description per `src/**` file), controls, architecture notes.
- **CLAUDE.md** — "What this is", Architecture, and the per-file Scenery/Field/etc. mentions.
- **prompt.txt** — the build-from-scratch spec; keep its GAME SHAPE / RENDERING / CARS sections truthful to current behavior.

Common drift to grep for: renamed/removed scenery (e.g. grandstands → mountains), new mechanics (rollovers, groove bands), changed defaults. If a doc names a file/feature that no longer exists, fix it.

## 4. Bake new lessons into CLAUDE.md so mistakes don't recur
If this batch revealed a trap that cost time, add a one-line entry to the **Gotchas** (or **Windows / PowerShell**) section of CLAUDE.md — concrete and actionable. Examples already learned:
- Git is at `C:\Program Files\Git\cmd\git.exe`, not on PATH — prepend it.
- Wheel/tire geometry: no sidewall/shoulder mesh may exceed the tread radius (the torus-bulge mistake); revolve the carcass with a lathe and set the tire material `backFaceCulling = false`.

## 5. Commit and push
```powershell
git add -A
git status --short            # confirm the staged set is what you intend
git commit -m "<concise, specific summary of this batch>"
git --no-pager log --oneline -3
git push origin main
```
Commit message: imperative, specific, one line of what changed (e.g. `Real Hoosier tires + mountain backdrop + doc sync`). Group the whole batch into one commit unless the user asked otherwise.

## 6. Deploy the game for public consumption (do not skip)
The push to `main` auto-triggers the GitHub Pages deploy (`.github/workflows/deploy.yml`), publishing the game to **https://aaronjblair.github.io/RC-Dirt-Oval/**. A green push is NOT a green deploy — verify it actually went live:
```powershell
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
$rid = gh run list --workflow=deploy.yml --branch main --limit 1 --json databaseId --jq ".[0].databaseId"
gh run watch $rid --exit-status --interval 8        # must end "success"
```
Then confirm the LIVE site serves the new build (bypass CDN/browser cache with a random query):
```powershell
(Invoke-WebRequest "https://aaronjblair.github.io/RC-Dirt-Oval/?cb=$(Get-Random)" -UseBasicParsing).StatusCode   # expect 200
```
If the run fails, surface the exact error. The trap that already bit once: **`public/` asset paths must be `import.meta.env.BASE_URL`-relative, not a leading slash**, or they 404 under the `/RC-Dirt-Oval/` subpath (build stays green, deploy serves a broken game). If Pages is disabled or the repo was made private again, free Pages won't deploy — say so rather than claiming success.

## 7. Report
Tell the user: build status, what was added/updated/removed, which docs were synced, the commit hash + message, that it's pushed to `origin/main`, AND the deploy result with the live URL. If the push or deploy fails, surface the exact error — don't claim success.

## Guardrails
- Never `--no-verify`, never force-push, never skip the build.
- If `git push` would overwrite remote work, stop and report rather than forcing.
- Picture-perfect rule still applies: if this batch touched `Car.ts`, `RaycastVehicle.placeWheels`, or spawning, the change should already be screenshot-verified before this skill runs.
- Deploy is part of the rule now: every commit-it ends with the public site verified live, not just pushed.
