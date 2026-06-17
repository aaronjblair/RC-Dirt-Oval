# round-speed-boost — early-career player speed easing

Give the **player car only** a speed advantage in the early career rounds that tapers to nothing.
This is a "training-wheels" easing: the player is faster at the start, and the boost decreases by an
equal amount each level until it reaches zero.

## Spec
- **Player car only** (`field.player.vehicle` = `field.cars[0]`). AI cars and the per-class baselines
  are left untouched.
- **Career levels 1–7** only (the round index is **0-based** in `main.ts`, so this is `round` 0–6).
- Scale the speed knob **`engineForce`** (top speed ≈ `engineForce / rollResist`, so scaling power
  scales both acceleration and top speed — a true "% faster"). Class-agnostic.
- Boost factor: `boost = 1 + 0.15 * (7 - round) / 7` (round 0-based).
  Result: L1 +15.0%, L2 +12.9%, L3 +10.7%, L4 +8.6%, L5 +6.4%, L6 +4.3%, L7 +2.1%, **L8+ none**.

## The edit (single file: `src/main.ts`)
Find the line that builds the field (≈ line 140):
```ts
const field = new Field(scene, plugin, shadow, track, def, race, setup, carClassDef);
```
Insert **immediately after it** (the `round` variable, 0-based, is already in scope here, and the
player car's `cfg` has had its setup applied by the Field constructor):
```ts
// Early-career player speed easing: +15% on level 1, tapering to 0 by level 8 (player car only).
if (round < 7) {
  const boost = 1 + 0.15 * (7 - round) / 7;
  field.player.vehicle.cfg.engineForce *= boost;
}
```
Do **not** touch any other file. `engineForce` is a `VehicleConfig` field
(`src/physics/RaycastVehicle.ts`), mutable per-car because each car clones its config.

## Verify
1. `npx tsc --noEmit` → exit 0 (strict: `noUnusedLocals/Parameters/noImplicitReturns`).
2. Sanity-check the math: round 0 ⇒ ×1.15, round 6 ⇒ ×1.0214, round 7 ⇒ unchanged (×1.0).
3. Full gate: `npm run build` must end in `✓ built` with no `error TS…`.

## Guardrails
- Mutate only `field.player.vehicle.cfg.engineForce`; never the shared class config or AI cars.
- `round` is 0-based (level = round + 1). `round < 7` covers levels 1–7.
- No `git add` / commit — the parent handles staging and asks before committing.
