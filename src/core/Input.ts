/**
 * Unified driver input from keyboard, standard gamepads, and a HOTAS-style sim
 * rig (Logitech Flight Yoke for steering + CH Pro Pedals for throttle/brake).
 *
 * The rig is handled WITHOUT hard-coded axis indices: every connected device is
 * calibrated by its resting axis positions. A steering axis rests centered
 * (~0); a pedal axis rests pinned at an extreme (~±1) and travels toward the
 * other end as it's pressed. That lets the same code adapt to a yoke, a wheel,
 * a flight stick, or pedals regardless of which axis slot the OS assigns.
 *
 * Control only switches away from the keyboard once the rig is actually moved,
 * so an idle (but connected) yoke/pedal set never hijacks the keys.
 */
export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. 1 (right)
  reset: boolean; // request car reset
  usingGamepad: boolean;
}

interface PadCal {
  id: string;
  isYoke: boolean; // device id looks like a yoke / wheel / flight controller
  isPedals: boolean; // device id looks like pedals
  steerAxis: number; // centered axis used for steering, -1 if none
  pedalAxes: number[]; // extreme-resting axes [throttle, brake] (order swappable)
  rest: number[]; // calibrated resting value per axis
  samples: number; // calibration frames collected
  ready: boolean;
}

const CAL_FRAMES = 18; // ~0.3s of "untouched" samples to learn rest positions
const CENTERED = 0.35; // |rest| below this => a steering-style axis
const EXTREME = 0.6; // |rest| above this => a pedal-style axis

export class InputManager {
  private keys = new Set<string>();
  private prevReset = false;
  private cals = new Map<number, PadCal>();
  private swapPedals = false; // throttle/brake reversed if a rig maps them backwards

  constructor() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyK") this.recalibrate();
      if (e.code === "KeyJ") { this.swapPedals = !this.swapPedals; console.log(`[RCSprint] pedals ${this.swapPedals ? "swapped" : "normal"}`); }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("gamepadconnected", (e) => {
      console.log(`[RCSprint] device connected [${e.gamepad.index}] ${e.gamepad.id} — ${e.gamepad.axes.length} axes, ${e.gamepad.buttons.length} buttons`);
    });
    window.addEventListener("gamepaddisconnected", (e) => this.cals.delete(e.gamepad.index));

    // Console helpers for tuning against real hardware.
    (window as any).__rcInput = {
      recalibrate: () => this.recalibrate(),
      swapPedals: () => { this.swapPedals = !this.swapPedals; return this.swapPedals; },
      dump: () => this.dump(),
    };
  }

  /** Forget all device calibration; relearn rest positions over the next frames. */
  recalibrate() {
    this.cals.clear();
    console.log("[RCSprint] recalibrating input — leave the yoke/pedals at rest");
  }

  /** Print live axis/button values for every connected device (tuning aid). */
  dump() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const cal = this.cals.get(p.index);
      console.log(`[${p.index}] ${p.id}`,
        "axes", p.axes.map((a) => a.toFixed(2)).join(","),
        "| rest", cal?.rest.map((a) => a.toFixed(2)).join(","),
        "| steerAxis", cal?.steerAxis, "pedalAxes", cal?.pedalAxes);
    }
  }

  private deadzone(v: number, dz = 0.08): number {
    return Math.abs(v) < dz ? 0 : v;
  }

  /** Average rest readings, then classify each axis as steering / pedal / unused. */
  private calibrate(pad: Gamepad): PadCal {
    let cal = this.cals.get(pad.index);
    if (!cal) {
      const id = pad.id.toLowerCase();
      cal = {
        id: pad.id,
        isYoke: /yoke|wheel|flight|stick|joystick|logitech|saitek/.test(id),
        isPedals: /pedal|rudder| ch |chproducts|chpro/.test(id),
        steerAxis: -1,
        pedalAxes: [],
        rest: pad.axes.map((a) => a),
        samples: 1,
        ready: false,
      };
      this.cals.set(pad.index, cal);
      return cal;
    }
    if (!cal.ready) {
      // Running average of the resting axis values.
      for (let i = 0; i < pad.axes.length; i++) {
        cal.rest[i] = (cal.rest[i] * cal.samples + pad.axes[i]) / (cal.samples + 1);
      }
      cal.samples++;
      if (cal.samples >= CAL_FRAMES) {
        const centered: number[] = [];
        const extreme: number[] = [];
        cal.rest.forEach((r, i) => {
          if (Math.abs(r) < CENTERED) centered.push(i);
          else if (Math.abs(r) > EXTREME) extreme.push(i);
        });
        // Steering: first centered axis (yoke devices win, but any works).
        cal.steerAxis = centered.length ? centered[0] : (pad.axes.length ? 0 : -1);
        // Pedals: extreme-resting axes, lowest index first. Drop the steer axis.
        cal.pedalAxes = extreme.filter((i) => i !== cal!.steerAxis).slice(0, 2);
        cal.ready = true;
        console.log(`[RCSprint] calibrated [${pad.index}] ${pad.id} — steer axis ${cal.steerAxis}, pedal axes [${cal.pedalAxes}]`);
      }
    }
    return cal;
  }

  /** Map a pedal axis to 0..1 given its calibrated rest; polarity auto-detected. */
  private pedal(v: number, rest: number): number {
    const far = rest <= 0 ? 1 : -1; // pressed end is opposite the rest end
    const n = (v - rest) / (far - rest);
    return Math.max(0, Math.min(1, n));
  }

  sample(): DriveInput {
    const pads = navigator.getGamepads?.() ?? [];

    let steer = 0;
    let throttle = 0;
    let brake = 0;
    let reset = false;
    let active = false; // did the rig actually receive input this frame?

    for (const pad of pads) {
      if (!pad) continue;
      const cal = this.calibrate(pad);
      if (!cal.ready) continue;

      // --- Steering (centered axis) ---
      if (cal.steerAxis >= 0) {
        const raw = this.deadzone((pad.axes[cal.steerAxis] ?? 0) - cal.rest[cal.steerAxis]);
        if (raw !== 0 && (cal.isYoke || Math.abs(steer) < Math.abs(raw))) {
          steer = Math.max(-1, Math.min(1, raw));
          if (Math.abs(raw) > 0.15) active = true;
        }
      }

      // --- Throttle / brake from pedal axes ---
      if (cal.pedalAxes.length) {
        const tIdx = this.swapPedals ? cal.pedalAxes[1] ?? cal.pedalAxes[0] : cal.pedalAxes[0];
        const bIdx = this.swapPedals ? cal.pedalAxes[0] : cal.pedalAxes[1] ?? cal.pedalAxes[0];
        if (tIdx !== undefined) {
          const t = this.pedal(pad.axes[tIdx] ?? cal.rest[tIdx], cal.rest[tIdx]);
          if (t > throttle) throttle = t;
        }
        if (bIdx !== undefined && bIdx !== tIdx) {
          const b = this.pedal(pad.axes[bIdx] ?? cal.rest[bIdx], cal.rest[bIdx]);
          if (b > brake) brake = b;
        }
        if (throttle > 0.05 || brake > 0.05) active = true;
      }

      // --- Standard gamepad triggers (RT throttle / LT brake) as a fallback ---
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      if (rt > throttle) throttle = rt;
      if (lt > brake) brake = lt;
      if (rt > 0.05 || lt > 0.05) active = true;

      // --- Reset on any face/menu button ---
      if (pad.buttons.some((b) => b.pressed)) {
        active = true;
        if (pad.buttons[3]?.pressed || pad.buttons[8]?.pressed || pad.buttons[9]?.pressed) reset = true;
      }
    }

    if (active) {
      const justReset = reset && !this.prevReset;
      this.prevReset = reset;
      return { throttle, brake, steer, reset: justReset, usingGamepad: true };
    }

    // --- Keyboard fallback ---
    const up = this.keys.has("ArrowUp") || this.keys.has("KeyW");
    const down = this.keys.has("ArrowDown") || this.keys.has("KeyS");
    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
    const right = this.keys.has("ArrowRight") || this.keys.has("KeyD");
    const resetKey = this.keys.has("KeyR");
    const justReset = resetKey && !this.prevReset;
    this.prevReset = resetKey;
    return {
      throttle: up ? 1 : 0,
      brake: down ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      reset: justReset,
      usingGamepad: false,
    };
  }
}
