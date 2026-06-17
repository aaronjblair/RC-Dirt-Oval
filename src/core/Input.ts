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
  private isTouch = false;
  private touch = { steer: 0, throttle: 0, brake: 0, reset: false };

  constructor() {
    this.setupTouch();
    window.addEventListener("keydown", (e) => {
      // Ignore keys while typing in a text field (the driver-name box) so Space/arrows/letters reach
      // the input instead of driving the car or firing K/J. Fixes not being able to type a space.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
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

  /**
   * On-screen touch controls for phones/tablets: a proportional steering pad on the
   * left and gas/brake/reset on the right. Built only on a coarse-pointer device
   * (or with `?touch` for testing). Feeds the same DriveInput as keys/gamepad.
   */
  private setupTouch() {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ||
      (("ontouchstart" in window) && navigator.maxTouchPoints > 1) ||
      location.search.includes("touch");
    if (!coarse) return;
    this.isTouch = true;
    document.body.classList.add("touch-active"); // reflows the HUD (see index.html)
    // Kill iOS Safari pinch-zoom: it ignores user-scalable=no, so a two-finger touch (steering while
    // on the gas) would zoom/pan the visual viewport and scroll the fixed controls out of view. These
    // gesture* events are Safari-only and fire ONLY for multi-finger zoom, so single-finger scrolling
    // (the Guide overlay, the name input) is unaffected.
    const noGesture = (e: Event) => e.preventDefault();
    window.addEventListener("gesturestart", noGesture, { passive: false });
    window.addEventListener("gesturechange", noGesture, { passive: false });
    // The reliable iOS Safari pinch-zoom block: cancel any MULTI-touch move (touch-action +
    // gesturestart alone don't stop it when each finger is captured by a control). A single finger
    // is never prevented, so the Guide overlay / name input still scroll normally.
    document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    const root = document.createElement("div");
    root.id = "touchControls";
    root.style.cssText =
      // left/top/width/height (not inset:0) so the visualViewport pin below can size + transform it.
      "position:fixed;left:0;top:0;width:100%;height:100%;z-index:15;pointer-events:none;touch-action:none;" +
      "font-family:system-ui,sans-serif;user-select:none;-webkit-user-select:none;";

    // --- Steering pad (bottom-left, proportional) ---
    const pad = document.createElement("div");
    pad.style.cssText =
      "position:absolute;left:max(14px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));" +
      "width:min(44vw,320px);height:104px;border-radius:18px;pointer-events:auto;touch-action:none;" +
      "background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.18);" +
      "display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.45);font-size:12px;letter-spacing:2px;";
    pad.textContent = "◄  STEER  ►";
    const knob = document.createElement("div");
    knob.style.cssText =
      "position:absolute;top:50%;left:50%;width:58px;height:58px;margin:-29px;border-radius:50%;touch-action:none;" +
      "background:rgba(255,211,77,0.9);box-shadow:0 2px 12px rgba(0,0,0,0.55);transition:none;";
    pad.appendChild(knob);
    let steerId = -1;
    const setSteer = (clientX: number) => {
      const r = pad.getBoundingClientRect();
      const x = (clientX - (r.left + r.width / 2)) / (r.width / 2 - 16);
      this.touch.steer = Math.max(-1, Math.min(1, x));
      knob.style.left = `${50 + this.touch.steer * 40}%`;
    };
    pad.addEventListener("pointerdown", (e) => { steerId = e.pointerId; pad.setPointerCapture(e.pointerId); setSteer(e.clientX); e.preventDefault(); });
    pad.addEventListener("pointermove", (e) => { if (e.pointerId === steerId) setSteer(e.clientX); });
    const endSteer = (e: PointerEvent) => { if (e.pointerId === steerId) { steerId = -1; this.touch.steer = 0; knob.style.left = "50%"; } };
    pad.addEventListener("pointerup", endSteer);
    pad.addEventListener("pointercancel", endSteer);
    pad.addEventListener("lostpointercapture", endSteer); // re-center if the capture is revoked
    root.appendChild(pad);

    // --- Gas / brake pedals (bottom-right, stacked) + reset ---
    const mkBtn = (label: string, bottom: string, bg: string, on: () => void, off: () => void) => {
      const b = document.createElement("div");
      b.style.cssText =
        `position:absolute;right:max(16px,env(safe-area-inset-right));bottom:${bottom};` +
        "width:104px;height:104px;border-radius:50%;pointer-events:auto;touch-action:none;" +
        `background:${bg};border:1px solid rgba(255,255,255,0.25);` +
        "display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;";
      b.textContent = label;
      let id = -1;
      const release = () => { id = -1; off(); b.style.filter = "none"; };
      b.addEventListener("pointerdown", (e) => {
        if (id !== -1) release(); // a fresh press while one is "stuck" — reset first, never hang on
        id = e.pointerId; b.setPointerCapture(e.pointerId); on(); b.style.filter = "brightness(1.45)"; e.preventDefault();
      });
      const end = (e: PointerEvent) => { if (e.pointerId === id) release(); };
      b.addEventListener("pointerup", end);
      b.addEventListener("pointercancel", end);
      // If the browser revokes the capture (gesture, focus loss), always fall back to released —
      // otherwise the button would hang ON/bright and the next tap couldn't re-engage it.
      b.addEventListener("lostpointercapture", end);
      root.appendChild(b);
      return b;
    };
    mkBtn("GAS", "max(18px,env(safe-area-inset-bottom))", "rgba(39,174,96,0.55)", () => (this.touch.throttle = 1), () => (this.touch.throttle = 0));
    mkBtn("BRAKE", "calc(max(18px,env(safe-area-inset-bottom)) + 120px)", "rgba(192,57,43,0.5)", () => (this.touch.brake = 1), () => (this.touch.brake = 0));

    const rst = document.createElement("div");
    rst.style.cssText =
      "position:absolute;left:max(14px,env(safe-area-inset-left));bottom:calc(max(18px,env(safe-area-inset-bottom)) + 116px);" +
      "padding:8px 14px;border-radius:10px;pointer-events:auto;touch-action:none;background:rgba(0,0,0,0.45);" +
      "border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:12px;font-weight:700;letter-spacing:1px;";
    rst.textContent = "RESET";
    rst.addEventListener("pointerdown", (e) => { this.touch.reset = true; e.preventDefault(); });
    root.appendChild(rst);

    document.body.appendChild(root);

    // Pin the control layer to the VISUAL viewport: counter-translate/scale so the bottom/right-anchored
    // buttons always sit in the visible area. Belt-and-suspenders — if iOS ever still zooms/pans, or the
    // Safari toolbar shows/hides, the controls track the visible screen instead of scrolling off.
    const vv = window.visualViewport;
    if (vv) {
      const pin = () => {
        root.style.transformOrigin = "0 0";
        root.style.transform = `translate(${vv.offsetLeft}px, ${vv.offsetTop}px) scale(${1 / vv.scale})`;
        root.style.width = `${vv.width}px`;
        root.style.height = `${vv.height}px`;
      };
      vv.addEventListener("resize", pin);
      vv.addEventListener("scroll", pin);
      pin();
    }
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

    // --- Keyboard + on-screen touch fallback ---
    const up = this.keys.has("ArrowUp") || this.keys.has("KeyW");
    const down = this.keys.has("ArrowDown") || this.keys.has("KeyS");
    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
    const right = this.keys.has("ArrowRight") || this.keys.has("KeyD");
    const kSteer = (right ? 1 : 0) - (left ? 1 : 0);
    const resetReq = this.keys.has("KeyR") || this.touch.reset;
    const justReset = resetReq && !this.prevReset;
    this.prevReset = resetReq;
    this.touch.reset = false; // one-shot
    return {
      throttle: Math.max(up ? 1 : 0, this.touch.throttle),
      brake: Math.max(down ? 1 : 0, this.touch.brake),
      steer: this.isTouch && this.touch.steer !== 0 ? this.touch.steer : kSteer,
      reset: justReset,
      usingGamepad: false,
    };
  }
}
