import type { VehicleConfig } from "../physics/RaycastVehicle";
import { DEFAULT_CONFIG } from "../physics/RaycastVehicle";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Player-tunable setup, all normalized 0..1. */
export interface CarSetup {
  gearing: number; // 0 accel / low top  ->  1 top speed
  wing: number; // 0 low downforce/drag -> 1 high
  tire: number; // 0 soft (grip, wears fast) -> 1 hard (less grip, durable)
  camber: number; // 0 stable -> 1 sharp turn-in
  bias: number; // 0 front weight -> 1 rear weight
}

export const DEFAULT_SETUP: CarSetup = { gearing: 0.5, wing: 0.5, tire: 0.35, camber: 0.5, bias: 0.55 };

/** Deep-copy a vehicle config so each car owns a mutable instance (the class baselines stay
 *  pristine). bodySize is a Vector3 reference, so it must be cloned explicitly. */
export function cloneConfig(c: VehicleConfig): VehicleConfig {
  return { ...c, bodySize: (c.bodySize as Vector3).clone() };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Apply a setup to a vehicle config, scaled around a PRISTINE class baseline (`base`) so the
 * sliders mean the same thing for any class and re-applying never compounds. Returns the tire
 * wear rate the setup implies. `cfg` and `base` should be different objects (clone per car).
 */
export function applySetup(cfg: VehicleConfig, s: CarSetup, base: VehicleConfig = DEFAULT_CONFIG): number {
  cfg.engineForce = base.engineForce * lerp(1.12, 0.92, s.gearing);
  cfg.rollResist = base.rollResist * lerp(1.25, 0.72, s.gearing) * (1 + s.wing * 0.45);
  // Wing/downforce scales around the class baseline — a wingless class (base.downforce≈0) stays flat.
  cfg.downforce = base.downforce * lerp(0.27, 2.0, s.wing);
  cfg.tireGrip = base.tireGrip * lerp(1.147, 0.882, s.tire);
  cfg.corneringStiffness = base.corneringStiffness * lerp(0.88, 1.18, s.camber);
  cfg.maxSteer = base.maxSteer * lerp(0.92, 1.08, s.camber);

  // --- PLAYER-ONLY edge -------------------------------------------------------
  // applySetup runs ONLY for the player car (Field build + garage re-apply); AI
  // cars never call it, so these flat advantages are the player's alone and hold
  // in every game mode and car class. Recomputed from the pristine `base` each
  // call, so they never compound across re-applies.
  // 1) ~5% faster than any AI car. Top speed ≈ engineForce / rollResist. AI run the raw
  //    pristine baseline, but the player's setup adds wing DRAG (rollResist above), which can
  //    otherwise leave the player slower than the AI baseline. So: bump power 5%, then FLOOR the
  //    player's top speed at 1.05× the AI baseline (raising it only if the setup dragged it under).
  //    The player can still tune the setup to go FASTER than the floor; they just can't fall below it.
  cfg.engineForce *= 1.05;
  const aiTopSpeed = base.engineForce / base.rollResist;
  const minTopSpeed = aiTopSpeed * 1.05;
  if (cfg.engineForce / cfg.rollResist < minTopSpeed) cfg.rollResist = cfg.engineForce / minTopSpeed;
  // 2) easier to steer + more forgiving than the AI baseline:
  cfg.steerSpeedFalloff = base.steerSpeedFalloff * 0.85; // steering stays responsive at speed
  cfg.slipSteer = base.slipSteer * 0.8; // less tail-happy — harder to spin
  cfg.tireGrip *= 1.06; // a touch more grip
  cfg.corneringStiffness *= 1.08; // slides arrest faster — recovers instead of looping
  // ---------------------------------------------------------------------------

  // softer tires wear faster
  return lerp(0.00011, 0.00004, s.tire);
}

const SETUP_KEY = "rcdirtoval.setup";
const SETUP_KEY_OLD = "rcsprint.setup";

export function loadSetup(): CarSetup {
  try {
    let raw = localStorage.getItem(SETUP_KEY);
    if (raw == null) {
      // One-time prefix migration: carry over the old rcsprint.* save.
      const old = localStorage.getItem(SETUP_KEY_OLD);
      if (old != null) { raw = old; try { localStorage.setItem(SETUP_KEY, old); } catch { /* ignore */ } }
    }
    if (raw) return { ...DEFAULT_SETUP, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETUP };
}

export function saveSetup(s: CarSetup) {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
