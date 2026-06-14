import { Color3 } from "@babylonjs/core/Maths/math.color";

/** Data-driven description of a dirt oval. The 15-track career varies these. */
export interface TrackDef {
  id: string;
  name: string;
  cornerRadius: number; // R
  straightLength: number; // L (length of each straight)
  width: number; // track width
  banking: number; // turn banking in radians
  baseGrip: number; // tire friction coefficient at race start
  gripFalloff: number; // how fast the surface goes slick over a race (per lap)
  rutIntensity: number; // 0..1 bumpiness
  aiSkill: number; // 0..1
  fieldSize: number; // number of cars including player
  laps: number;
  dirtColor: Color3;
  difficulty: number; // 1..15
  night: boolean; // run under the lights with a dark sky
}

/** Tier-1 practice oval used through M2–M4. */
export const TRACK_M2: TrackDef = {
  id: "redclay-bullring",
  name: "Red Clay Bullring",
  cornerRadius: 22,
  straightLength: 46,
  width: 9,
  banking: 0, // flat
  baseGrip: 1.7,
  gripFalloff: 0.02,
  rutIntensity: 0.2,
  aiSkill: 0.6,
  fieldSize: 8,
  laps: 15,
  dirtColor: new Color3(0.42, 0.26, 0.17),
  difficulty: 1,
  night: false,
};
