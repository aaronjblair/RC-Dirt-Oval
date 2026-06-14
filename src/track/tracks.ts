import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TrackDef } from "./TrackDef";

const NAMES = [
  "Red Clay Bullring", "River Bottom Speedway", "Thunder Valley Dirt", "Dusty Acres Oval",
  "Big Diamond Raceway", "Devil's Bowl Speedway", "Cornhusker Half-Mile", "Black Hills Outlaw Park",
  "Volusia Sands Speedway", "Knoxville Clay Classic", "Bristol Dirt Bowl", "Skyline High-Bank",
  "Badlands Motor Speedway", "Eldora Big Half", "The Dirt Mile — Finale",
];

const COLORS = [
  new Color3(0.42, 0.26, 0.17), new Color3(0.4, 0.27, 0.2), new Color3(0.36, 0.24, 0.18),
  new Color3(0.45, 0.28, 0.16), new Color3(0.38, 0.25, 0.2),
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Build the 15-round career calendar, scaling difficulty across the season. */
export function generateCareer(): TrackDef[] {
  const out: TrackDef[] = [];
  for (let d = 1; d <= 15; d++) {
    const t = (d - 1) / 14;
    out.push({
      id: `round-${d}`,
      name: NAMES[d - 1],
      cornerRadius: Math.round(lerp(24, 18, t)),
      straightLength: Math.round(lerp(40, 72, t)),
      width: +lerp(10, 7, t).toFixed(1),
      banking: +lerp(0.12, 0.3, t).toFixed(3),
      baseGrip: +lerp(1.85, 1.45, t).toFixed(2),
      gripFalloff: +lerp(0.015, 0.05, t).toFixed(3),
      rutIntensity: +lerp(0.15, 0.6, t).toFixed(2),
      aiSkill: +lerp(0.5, 0.95, t).toFixed(2),
      fieldSize: Math.round(lerp(8, 10, t)),
      laps: Math.round(lerp(8, 18, t)),
      dirtColor: COLORS[(d - 1) % COLORS.length],
      difficulty: d,
    });
  }
  return out;
}
