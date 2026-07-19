# RESUME — Super Jay RC

**What:** a browser 3D 1/10-scale dirt-oval RC racing game (Babylon.js 7 + Havok + Vite + TypeScript).
**Local folder:** `RCSprint` · **Branch:** `main` · **Updated:** 2026-07-19

- **Live (installable PWA):** https://aaronjblair.github.io/RC-Dirt-Oval/
- **Repo:** https://github.com/aaronjblair/RC-Dirt-Oval
- **Windows installer:** latest GitHub Release asset

## Current state
One class (**Dirt Sport Mod**), one track (**Dirt Oval**), two modes (Career/Sim, Arcade). Opens with
the #32 / 11X hero shot, then the attract reel. Night races run under floodlight towers plus corner
street lights. Winning shows the victory photo before results. Roster: Jay Hank #32 (player),
Jordan Eddleman 11X, Aaron Blair #46.

## Next up
- Confirm the GitHub Pages deploy is green (it was silently failing on a missing asset until 0.6.0).
- Cut a fresh Windows installer once the current build settles (`npm run build:win`).
- Open tuning questions: sport-mod handling feel, AI aggression, night light balance.

## Where things live
| | |
|---|---|
| Architecture, hard rules, gotchas | `CLAUDE.md` |
| Version history / what shipped when | `CHANGELOG.md` |
| Install & sharing | `DISTRIBUTION.md`, `README.md` |
| From-scratch rebuild specs | `prompt.md`, `designprompt.md` |
| Step-by-step recipes (screenshots, models, audio, cameras…) | `.claude/skills/` |

## Resume the exact session
`claude --resume <sessionId>` — the command is in `~/.claude/session-logs/last-session.json`
(`resumeCommand`). Works only on the machine holding the transcript; this file is the
cross-machine handoff.
