---
name: add-trackside-actor
description: Add a procedural figure or prop to the RCSprint track scene (marshal, flag girl, crew, sign) and verify it on screen. Use when the user wants a new person/character/object placed around the track that may animate or react to race state.
---

# add-trackside-actor — procedural figures & props around the track

RCSprint builds every trackside character from cheap primitive meshes (no asset files).
This is the repeatable recipe behind `src/race/Marshals.ts` and `src/race/FlagGirl.ts`.
Follow it so new actors place correctly, animate, and survive the build.

## 1. Build the figure from primitives
- One `TransformNode` **root**; parent every mesh to it. Move/rotate the root to place + aim the whole actor.
- Bodies = `CreateCylinder` (limbs), `CreateCapsule` (torso), `CreateSphere` (head); props = boxes/cylinders. Hair/outfit = extra tinted meshes.
- `PBRMaterial` per colour: `albedoColor`, `roughness ~0.6–0.8`, `metallic 0`; add a little `emissiveColor` for hi-vis vests so they pop.
- For each mesh: `material`, `parent = root`, `isPickable = false`, `shadow?.addShadowCaster(m)`, `receiveShadows = true`.
- **Freeze static meshes** with `m.freezeWorldMatrix()` — but NOT meshes you animate each frame (freezing locks their transform). Put animated parts under a child `TransformNode` pivot and rotate the pivot.
- A revolved/plane surface (flag cloth, tire) is single-sided → set `material.backFaceCulling = false`.

## 2. Place it on the track
Sample the centerline and offset — never hard-code x/z:
```ts
const sm = track.sampleAt(s);            // s in [0..track.length); 0 = start/finish
const W = track.def.width;
const pos = sm.pos.add(sm.outward.scale(W / 2 + k));  // +k outside the wall, -k into the infield
root.position.set(pos.x, 0, pos.z);
root.rotation.y = Math.atan2(-sm.outward.x, -sm.outward.z); // face the track
```
`sm` is a `TrackSample { pos, tangent, outward, bank }`. Infield ends sit at `z = ±(L/2 + (R - W/2))`.

## 3. Wire it into the game
- Construct it in `main.ts` right after `track`/`scenery`/`marshals` are built.
- Give it `update(dt)` and call it each frame in `scene.onBeforeRenderObservable` (next to `marshals.update`).
- React to race state by calling a method at the transition: e.g. the flag girl's `greenFlag()` fires from the countdown's GO callback (`Screens.countdown(() => { … flagGirl.greenFlag(); audio.greenFlag(); })`) and the `?demo` direct start.
- Animate with `this.t += dt` and `Math.sin` (NOT `Date.now`). A `waveT` countdown gives a one-shot burst that decays to idle.

## 4. Verify on screen (mind the traps)
**The Playwright MCP screenshot of this WebGL canvas is unreliable** — it captures a *stale* backbuffer, and `canvas.toDataURL()` through the post-process pipeline comes back garbled. Don't trust either for a fresh view.

Use **two reliable checks together**:
1. **Real GL render** via headless Chrome (see the `screenshot-game` skill): `--screenshot` of `/?demo` shows the true scene from the driver-stand cam. Great for the whole oval / infield; an actor at the start/finish reads small but confirms it's present and not broken.
2. **Functional probe** via `mcp__playwright__browser_evaluate` against `window.__field.cars[0].root.getScene()`:
   ```js
   const fg = scene.getTransformNodeByName('flagGirl');
   ({ pos: fg.position, meshes: fg.getChildMeshes().length, errs: /* console */ })
   ```
   Confirm position (on the ground, y≈0, at the intended line), child-mesh count, and **zero console errors**. For close-up pose, reason through the pivot rotation math in code — a wrong `rotation.x` sign points a raised arm down/backward.

`window.__field/__track/__race/__marshals` are exposed for exactly this. Add a `__<actor>` hook if it helps tests, and remember the picture-perfect rule: nothing floating, clipping, or missing.

## 5. Build gate
`npx tsc --noEmit` (strict — an unused import fails). Then the usual `npm run build`. Reference figures: `src/race/Marshals.ts`, `src/race/FlagGirl.ts`.
