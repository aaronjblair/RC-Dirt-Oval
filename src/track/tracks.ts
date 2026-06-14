import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TrackDef } from "./TrackDef";

const NAMES = [
  "Red Clay Bullring", "River Bottom Speedway", "Thunder Valley Dirt", "Dusty Acres Oval",
  "Big Diamond Raceway", "Devil's Bowl Speedway", "Cornhusker Half-Mile", "Black Hills Outlaw Park",
  "Volusia Sands Speedway", "Knoxville Clay Classic", "Bristol Dirt Bowl", "Skyline High-Bank",
  "Badlands Motor Speedway", "Eldora Big Half", "The Dirt Mile — Finale",
];

// One distinct dirt tone per round (round 1..15) so every oval reads differently:
// red clay → river silt → grey-brown loam → dusty tan → dark gumbo → black dirt.
const DIRT: Color3[] = [
  new Color3(0.46, 0.24, 0.15), // 1  red clay
  new Color3(0.40, 0.29, 0.21), // 2  river bottom silt
  new Color3(0.33, 0.27, 0.22), // 3  grey loam
  new Color3(0.50, 0.36, 0.21), // 4  dusty tan
  new Color3(0.30, 0.22, 0.18), // 5  dark earth
  new Color3(0.44, 0.27, 0.18), // 6  devil's bowl red
  new Color3(0.47, 0.39, 0.27), // 7  cornhusker sand
  new Color3(0.22, 0.19, 0.17), // 8  black hills (night)
  new Color3(0.55, 0.45, 0.30), // 9  volusia sands
  new Color3(0.39, 0.25, 0.17), // 10 knoxville clay
  new Color3(0.34, 0.23, 0.20), // 11 bristol clay
  new Color3(0.26, 0.21, 0.20), // 12 skyline (night)
  new Color3(0.43, 0.31, 0.22), // 13 badlands
  new Color3(0.37, 0.24, 0.18), // 14 eldora brown
  new Color3(0.24, 0.18, 0.17), // 15 finale (night)
];

// Per-round turn banking in radians — flat bullrings early, big high-banks late.
const BANKING: number[] = [
  0, 0, 0, 0.05, 0.05, 0.09, 0.07, 0.12, 0.06, 0.13, 0.20, 0.22, 0.14, 0.24, 0.18,
];

// Rounds run under the lights with a dark sky.
const NIGHT = new Set([8, 12, 15]);

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
      banking: BANKING[d - 1],

      baseGrip: +lerp(1.85, 1.45, t).toFixed(2),
      gripFalloff: +lerp(0.015, 0.05, t).toFixed(3),
      rutIntensity: +lerp(0.15, 0.6, t).toFixed(2),
      aiSkill: +lerp(0.5, 0.95, t).toFixed(2),
      fieldSize: Math.round(lerp(8, 10, t)),
      laps: Math.round(lerp(8, 18, t)),
      dirtColor: DIRT[d - 1],
      difficulty: d,
      night: NIGHT.has(d),
    });
  }
  return out;
}
