# engine-sound — tune the procedural engine audio

All engine sound is **procedural Web Audio** in `src/audio/MotorSound.ts` — no audio file ships, and it
degrades to a **silent no-op** when `AudioContext` is unavailable (headless). The current voice is a
**high-revving combustion sprint-car engine** (not the old electric whine).

## How it's wired (`main.ts`)
- `const motor = new MotorSound()` — the `AudioContext` starts **suspended**; `motor.resume()` is called
  on the first `pointerdown`/`keydown` (browser autoplay rules).
- `motor.setVoiceCount(field.cars.length - 1)` — one lightweight voice per **AI** car.
- Each physics step **while racing**: `motor.update(throttle, playerVehicle.speed)` (the detailed player
  voice) and `motor.updateVoices([{ speed, throttle, pan, gain }, …])` (the AI pack, pitched + stereo-panned
  + distance-faded to the active camera; pan = dot of car-offset with the camera's right vector, gain falls
  off ~`1 - dist/70`).
- Mute: **M** key / the `#mute` HUD button → `motor.toggleMuted()` / `setMuted(b)`; persisted to
  `localStorage["rcdirtoval.muted"]` (one-time migration from the old `rcsprint.muted`), re-read on load.
- Pause: `motor.setPaused(b)` ramps the **master gain** to 0 and back (composes with mute — stays silent if
  muted); it does **not** touch `_muted`/storage. Exposed as `window.__audio`.

## The synth
- **Player voice:** sawtooth fundamental (high range, ~140–700 Hz, tracks throttle+speed) + upper harmonics
  (2nd saw rasp, 3rd square bite) + a sub for body + an **exhaust-rasp** noise band, through a low-pass that
  **opens with throttle**. Keep the filter cutoff high enough to stay audible — a too-low cutoff once silenced
  it entirely (*re-open the filter*).
- **AI voices:** the cheap tier — one saw osc → gain → **stereo panner** each, no filter/sub/noise, with a
  small **deterministic** per-car detune (no `Math.random`, so the pack is stable).
- Everything sits under one **master-gain cap** so the engine stays subtle, not a swarm.

## Tuning checklist
- Change character via the oscillator types, the harmonic ratios/detune, the RPM frequency range, and the
  rasp-noise level — not by raising the master cap (that just makes it loud).
- Verify audibly in a real browser (headless is silent). Confirm **M** still mutes everything, **pause**
  silences + restores, and the AI pack pans correctly as the camera moves. Keep the master cap low.
