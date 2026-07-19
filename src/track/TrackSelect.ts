/**
 * Track selection + the two stand-alone track defs (figure-8 + off-road).
 *
 * The start-screen track picker chooses between the 15-round CAREER oval, a
 * self-crossing FIGURE-8, and a jump-laden OFF-ROAD loop. The pick is persisted
 * with a `?track=` URL override — mirrors Mode.ts / CarClass.ts.
 *
 * Figure-8 and off-road are EXHIBITION tracks: a single stand-alone race (no
 * career points, no arcade run-state). Off-road is BUGGY-ONLY and defaults to
 * NIGHT (the lit-arena stadium look); day/night is otherwise a player toggle.
 */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TrackDef } from "./TrackDef";

export type TrackChoice = "career" | "figure8" | "offroad";

const TRACK_KEY = "rcdirtoval.track";

export function isTrackChoice(v: string | null): v is TrackChoice {
  return v === "career" || v === "figure8" || v === "offroad";
}

export function loadTrackChoice(): TrackChoice {
  // Single-track game (2026-07-19): always the career dirt oval — the figure-8/off-road defs
  // stay in code (and ?track= dev override still works via main.ts) but the stored pick is ignored.
  return "career";
}

export function saveTrackChoice(t: TrackChoice): void {
  try { localStorage.setItem(TRACK_KEY, t); } catch { /* ignore */ }
}

/** `?track=career|figure8|offroad` override (null when absent/invalid). */
export function trackFromParam(param: string | null): TrackChoice | null {
  return isTrackChoice(param) ? param : null;
}

/** Time of day — any track can now be run in either (the old game-wide night rule is relaxed).
 *  The setup-screen toggle persists this; career mode re-rolls it randomly per round instead. */
export type TimeOfDay = "day" | "night";
const DAYNIGHT_KEY = "rcdirtoval.daynight";

export function loadDayNight(): TimeOfDay | null {
  try {
    const v = localStorage.getItem(DAYNIGHT_KEY);
    if (v === "day" || v === "night") return v;
  } catch { /* ignore */ }
  return null; // unset → caller keeps the track's AUTHORED default (off-road night / figure-8 night)
}

export function saveDayNight(t: TimeOfDay): void {
  try { localStorage.setItem(DAYNIGHT_KEY, t); } catch { /* ignore */ }
}

/** Self-crossing figure-8 — flat, wide, run at night under the lights. At-grade X = chaos. */
export const FIGURE8_DEF: TrackDef = {
  id: "figure8-crossroads",
  name: "Crossroads Figure-8",
  cornerRadius: 30,
  straightLength: 52,
  width: 13, // 20% wider (was 11)
  banking: 0,
  baseGrip: 1.7,
  gripFalloff: 0.02,
  rutIntensity: 0.18,
  aiSkill: 0.62,
  fieldSize: 8,
  laps: 12,
  dirtColor: new Color3(0.42, 0.28, 0.18),
  difficulty: 6,
  night: true,
  backdrop: "plains",
  shape: "figure8",
};

/** Stadium / supercross-style off-road arena: a compact bermed loop with a mix of jump
 *  types (tabletop, double, big single, step-up/plateau, whoops). BUGGY-ONLY field.
 *  Defaults to NIGHT (lit arena = the stadium look); the player can toggle it to day. */
export const OFFROAD_DEF: TrackDef = {
  id: "offroad-stadium",
  name: "Stadium Off-Road",
  cornerRadius: 34,
  straightLength: 48,
  width: 17, // wide stadium-truck track (20% wider than the original 14)
  banking: 0, // per-corner berm banking is authored in offroadCenterline's bankFn
  baseGrip: 1.62,
  gripFalloff: 0.015,
  rutIntensity: 0.3,
  aiSkill: 0.58,
  fieldSize: 8,
  laps: 6,
  dirtColor: new Color3(0.5, 0.36, 0.22),
  difficulty: 7,
  night: true, // default NIGHT — the lit-arena look reads most like a stadium; player can pick day on the toggle
  backdrop: "badlands",
  shape: "offroad",
};

/** The stand-alone def for a non-career track choice (a fresh clone each call), or null for career. */
export function trackDefFor(choice: TrackChoice): TrackDef | null {
  if (choice === "figure8") return { ...FIGURE8_DEF, dirtColor: FIGURE8_DEF.dirtColor.clone() };
  if (choice === "offroad") return { ...OFFROAD_DEF, dirtColor: OFFROAD_DEF.dirtColor.clone() };
  return null;
}
