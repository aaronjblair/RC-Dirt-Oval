---
name: import-asset
description: Add an image/texture/binary asset to RCSprint and reference it so it survives dev, the strict build, and the GitHub Pages subpath. Use when adding a logo/decal/texture/.env IBL or any non-code file, or when an asset 404s live but works locally.
---

# import-asset — add a bundled asset without breaking the build or the live site

Two ways to ship a non-code file. Pick by how it's loaded, then follow that path's rules — the traps below have each cost real time.

## A. Bundle it via an `import` (preferred — watcher-safe, hashed, base-correct automatically)
For images/decals the code references directly (e.g. the Super Jay logo, the infield logo):
1. Put the file under **`src/assets/`** (NOT `public/`).
2. `import logoUrl from "./assets/superjay.png";` then use `logoUrl` as the texture URL.
3. This needs **`src/vite-env.d.ts`** to exist with `/// <reference types="vite/client" />`, or strict `tsc` fails with *"Cannot find module './foo.png'"*. (It already exists — don't delete it.)
4. Vite emits the file as a hashed `dist/assets/…` and rewrites the import to the correct base-relative URL — works in dev AND under the `/RC-Dirt-Oval/` Pages subpath with zero extra work.

## B. Serve it from `public/` (only when a path must stay literal — e.g. the dirt textures, the IBL `.env`)
1. **Stop the dev server before writing into `public/`** — Vite's watcher crashes with `EBUSY` on writes there while running. Write the file, then restart `npm run dev`.
2. **Runtime paths must be base-relative**: prefix with `import.meta.env.BASE_URL` (e.g. `BASE_URL + "textures/dirt/albedo.jpg"`). **Never a leading slash** (`"/textures/…"`) — that points at the domain root and 404s under `/RC-Dirt-Oval/` (the build stays green; the live game silently breaks). Affects `Textures.ts` (dirt) and `Environment.ts` (IBL).

## Verify
- `npx tsc --noEmit` (strict) then `npm run build` — must be green.
- If the asset is visual, see it on screen via the **screenshot-game** skill.
- If it loads locally but you suspect the Pages subpath: confirm the reference is either an `import` (path A) or `BASE_URL`-prefixed (path B), never a leading slash.
