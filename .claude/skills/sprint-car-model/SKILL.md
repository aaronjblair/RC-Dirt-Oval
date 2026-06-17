---
name: sprint-car-model
description: Trigger when building, restyling, or tuning the WINGED SPRINT CAR class in RCSprint (src/car/Car.ts, DEFAULT_CONFIG) — bodywork, livery, tires, or how it handles.
---

# sprint-car-model — the winged 410 dirt sprinter

The player's default class and the **Super Jay #32 tribute** (see the `project-rcsprint-superjay-tribute` memory — handle the orange #32 with care). Built by `createCar` in **`src/car/Car.ts`**; physics baseline is **`DEFAULT_CONFIG`** in `src/physics/RaycastVehicle.ts`. Sibling class: the **`late-car-model`** skill.

## Real-world reference (what we're modeling)
A 410 winged dirt sprint car (Team Losi 22S-style at 1:10):
- **~1400 lb with driver, ~410 ci / ~900 hp** → absurd power-to-weight. Direct drive, no gearbox, push-started.
- **Huge top wing + front wing** → aero grip that **grows with speed**; planted on the straights, twitchy at low speed.
- **Offset chassis, big left-side weight bias, staggered tires** (biggest right-rear) — built to turn left on banking.
- Solid axles, torsion-bar suspension. **Handling character: light, nervous, throttle-steered, big slip angles, instant direction change, power-oversteer.** It rotates on the throttle and drives sideways off the corner.

## How that maps to the config knobs (`DEFAULT_CONFIG`)
> In this kinematic model **`mass` is essentially cosmetic** (accels are already in u/s²). Feel comes from these:

| Knob | Sprint value | Why |
|---|---|---|
| `tireGrip` | `1.7` | modest **mechanical** grip (lower than the late model) — it slides |
| `downforce` | `0.015` | the **wing**: grip = `(tireGrip + downforce·v²)·g`, so it plants at speed |
| `corneringStiffness` | `9` | low — lateral slip is arrested slowly → it drifts |
| `slipSteer` | `0.6` | **loose**: a lateral slide rotates the car a lot (oversteer) |
| `throttleSteer` | `0.015` | strong **power-steer** — throttle rotates it through the corner |
| `engineForce` | `19.55` | violent acceleration (top speed = `engineForce/rollResist`) |
| `maxSteer` / `steerSpeedFalloff` | `0.55` / `0.05` | quick, darty turn-in |

To make it **looser/twitchier**, raise `slipSteer`/`throttleSteer` and lower `corneringStiffness`. To make the wing matter more, raise `downforce`. Garage sliders (`CarSetup`) scale **around** this baseline via `applySetup(cfg, setup, DEFAULT_CONFIG)`, so re-applying never compounds — tune the baseline, not the sliders.

## Bodywork anatomy (must stay picture-perfect)
`createCar` builds, under an invisible `chassis` box: a **big top wing with a down-swept front scoop + tall numbered side boards**, a **front wing/nerf bar + tube front axle**, the cage/cockpit + helmeted driver, and **staggered tires on orange beadlock wheels** (per-wheel `WheelDef.radius` — biggest on the **right-rear**). Livery: car-color metalflake paint (`paintMat`/`flakeNormal`) with the lettered name or the hero logo decal on the wing deck + side boards.

**Hard rules (cost real time if broken):**
- **Every car reads as a clean winged sprinter**: four corner tires, wing on, body/livery intact, nothing missing/floating/clipping.
- **Tire stagger needs per-wheel `radius`** in the `WheelDef` (feeds `RaycastVehicle.placeWheels`) — without it big tires sink/float.
- **No sidewall/shoulder mesh may exceed the tread radius** (the "Mickey-Mouse ears" bug). Revolve the carcass with `CreateLathe` and set the tire material `backFaceCulling = false`.
- Only the **car** is 1:10 — see the `world-scale` skill before adding anything near it.

## Verify (don't just describe — this is a hard repo rule)
1. `npm run build` green (strict TS).
2. **Screenshot the full grid** with the `screenshot-game` skill (`/?demo`) whenever you touch `Car.ts`, `placeWheels`, or spawning — confirm every car reads clean. Use `/?photo` for a close rear-3/4 of the player car.
3. **Handling**: step the sim at fixed dt and read `vehicle.heading`/`position`/`speed` (not stale mesh transforms). Drive `?class=sprint` and sanity-check it feels loose/quick vs the late model.
4. Ship with the `commit-it` skill (build → reconcile docs → commit → push → verify live).
