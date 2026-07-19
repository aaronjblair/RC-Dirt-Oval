import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TrackDef, TrackShape } from "./TrackDef";

/**
 * One sample of a track centerline: world position (y carries ELEVATION for the
 * off-road jumps), unit travel tangent, a unit horizontal "outward" normal (the
 * +lateral / outer-wall side), and surface bank.
 */
export interface CenterSample {
  pos: Vector3;
  tangent: Vector3;
  outward: Vector3;
  bank: number;
}

/** A pluggable centerline: total arc length, the painted start/finish s, and a walker. */
export interface Centerline {
  length: number;
  startFinishS: number;
  pointAt(s: number): CenterSample;
}

/** Right-hand horizontal perpendicular of a tangent — matches the oval's old `outward`
 *  (front straight tangent +z → outward +x). Keeps banking/wall sign conventions intact. */
function outwardOf(tx: number, tz: number): Vector3 {
  return new Vector3(tz, 0, -tx);
}

/**
 * The original banked-oval walker, lifted VERBATIM from OvalTrack.pointAt so the
 * oval stays byte-for-byte identical. Stadium shape: two straights + two 180° turns,
 * counter-clockwise. `bank` is def.banking inside the turns, 0 on the straights
 * (OvalTrack still smooths the bank across entry/exit afterwards).
 */
function ovalCenterline(def: TrackDef): Centerline {
  const R = def.cornerRadius;
  const L = def.straightLength;
  const half = L / 2;
  const turn = Math.PI * R;
  const length = 2 * L + 2 * Math.PI * R;
  return {
    length,
    // The front straight (+x, where the grandstand sits) runs s ∈ [length−L/2 .. L/2] (z −L/2 → +L/2).
    // The start/finish line sits 3/4 of the way DOWN that stretch in the race direction — z = +L/4,
    // i.e. s = L/4 — directly in front of the stands. (The old 0.7*(length/2) was a units bug that
    // landed the line at the turn-1 exit on the far side of the track.)
    startFinishS: L / 4,
    pointAt(s: number): CenterSample {
      let pos: Vector3, tangent: Vector3, outward: Vector3, inTurn = false;
      if (s < half) {
        pos = new Vector3(R, 0, s);
        tangent = new Vector3(0, 0, 1);
        outward = new Vector3(1, 0, 0);
      } else if (s < half + turn) {
        const t = (s - half) / R;
        pos = new Vector3(R * Math.cos(t), 0, half + R * Math.sin(t));
        tangent = new Vector3(-Math.sin(t), 0, Math.cos(t));
        outward = new Vector3(Math.cos(t), 0, Math.sin(t));
        inTurn = true;
      } else if (s < half + turn + L) {
        const d = s - (half + turn);
        pos = new Vector3(-R, 0, half - d);
        tangent = new Vector3(0, 0, -1);
        outward = new Vector3(-1, 0, 0);
      } else if (s < half + turn + L + turn) {
        const t = (s - (half + turn + L)) / R;
        pos = new Vector3(-R * Math.cos(t), 0, -half - R * Math.sin(t));
        tangent = new Vector3(Math.sin(t), 0, -Math.cos(t));
        outward = new Vector3(-Math.cos(t), 0, -Math.sin(t));
        inTurn = true;
      } else {
        const d = s - (half + turn + L + turn);
        pos = new Vector3(R, 0, -half + d);
        tangent = new Vector3(0, 0, 1);
        outward = new Vector3(1, 0, 0);
      }
      return { pos, tangent, outward, bank: inTurn ? def.banking : 0 };
    },
  };
}

/**
 * Build an arc-length-parametrised centerline from a smooth periodic curve
 * `xz(u)` (u in [0,1)) and an optional elevation `elev(u)`. Densely samples the
 * curve, builds a cumulative arc-length table, then `pointAt(s)` binary-searches
 * it so travel speed is uniform along the centerline (cars don't speed up/slow
 * down through tight bits). Tangents/elevation slope come from finite differences.
 */
function fromParametric(
  xz: (u: number) => { x: number; z: number },
  elev: (u: number) => number,
  startFinishFrac: number,
  bankFn: (u: number) => number = () => 0,
): Centerline {
  const N = 4000;
  const px = new Float64Array(N + 1);
  const pz = new Float64Array(N + 1);
  const py = new Float64Array(N + 1);
  const pb = new Float64Array(N + 1); // banking (rad) at each node — 0 unless bankFn supplied
  const cum = new Float64Array(N + 1); // cumulative arc length (planar) at each node
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = xz(u);
    px[i] = p.x; pz[i] = p.z; py[i] = elev(u); pb[i] = bankFn(u);
  }
  for (let i = 1; i <= N; i++) {
    const dx = px[i] - px[i - 1];
    const dz = pz[i] - pz[i - 1];
    cum[i] = cum[i - 1] + Math.hypot(dx, dz);
  }
  const length = cum[N];

  const at = (s: number): CenterSample => {
    let q = ((s % length) + length) % length;
    // binary-search the cumulative table for the segment containing q
    let lo = 0, hi = N;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < q) lo = mid + 1; else hi = mid;
    }
    const i1 = Math.max(1, lo);
    const i0 = i1 - 1;
    const seg = cum[i1] - cum[i0] || 1e-6;
    const f = (q - cum[i0]) / seg;
    const x = px[i0] + (px[i1] - px[i0]) * f;
    const z = pz[i0] + (pz[i1] - pz[i0]) * f;
    const y = py[i0] + (py[i1] - py[i0]) * f;
    const bank = pb[i0] + (pb[i1] - pb[i0]) * f;
    // tangent in the xz plane from the local segment
    let tx = px[i1] - px[i0];
    let tz = pz[i1] - pz[i0];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    return {
      pos: new Vector3(x, y, z),
      tangent: new Vector3(tx, 0, tz),
      outward: outwardOf(tx, tz),
      bank,
    };
  };

  return { length, startFinishS: startFinishFrac * length, pointAt: at };
}

/**
 * Figure-8 (Gerono lemniscate): a single continuous closed loop that crosses
 * itself once at the infield "X" — cars on opposite lobes meet at grade, so
 * T-bones are on the table (the requested chaos). Flat (y=0, bank=0) so the
 * crossing is a true at-grade intersection. Sized from the def's footprint.
 */
function figure8Centerline(def: TrackDef): Centerline {
  // Footprint comparable to the oval: A = half-width (x), B = lobe reach (z).
  const A = def.cornerRadius + def.straightLength * 0.5 + 18;
  const B = def.cornerRadius * 1.7 + def.straightLength * 0.5 + 18;
  // u in [0,1) → t in [0,2π). x = A sin t (side to side), z = B sin t cos t (the two lobes).
  const xz = (u: number) => {
    const t = u * Math.PI * 2;
    return { x: A * Math.sin(t), z: B * Math.sin(t) * Math.cos(t) };
  };
  // Start/finish on a lobe, well away from the central X (t≈π/2 → first lobe, z≈0, x=A).
  return fromParametric(xz, () => 0, 0.25);
}

/**
 * Off-road STADIUM loop: a compact winding closed loop (no self-crossing) ringed
 * by an arena, with BANKED end-corners (packed berms) and a supercross-style mix
 * of jump types — tabletop, double, big single, step-up/plateau/step-down, and a
 * whoops/rhythm section. Each ramp raises the surface; its rising face plus the
 * vehicle's climb-rate launch throws the car into a real arc that lands on the
 * descending surface / flat ground. Buggy-only; defaults to NIGHT (lit arena).
 */
function offroadCenterline(def: TrackDef): Centerline {
  const R0 = def.cornerRadius + def.straightLength * 0.5 + 18; // base loop radius (compact arena footprint)
  // Winding radius: sum of sines makes sweeping curves + tighter kinks around the loop.
  const xz = (u: number) => {
    const t = u * Math.PI * 2;
    const r = R0 + 10 * Math.sin(2 * t) + 6 * Math.sin(3 * t + 0.7) + 4 * Math.sin(5 * t + 1.9);
    return { x: r * Math.cos(t), z: r * 1.15 * Math.sin(t) };
  };

  // BANKED BERM CORNERS: lift the two sweeping end-turns (~u 0.25 / 0.75) into packed
  // berms you can lean on. buildSurface lifts the outer edge by W·tan(bank) and the
  // vehicle reads slope grip off the ground normal, so the bank works for free.
  const bank = (u: number) => {
    const bump = (c: number) => {
      let d = u - c; if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
      const w = 0.085;
      return Math.abs(d) < w ? Math.cos((d / w) * (Math.PI / 2)) : 0;
    };
    return (bump(0.25) + bump(0.75)) * 0.2; // ~11.5° peak banking on the end-corners
  };

  // Each jump = a trapezoid (linear up-face / flat crest / linear fall); heights SUM,
  // so close ramps build doubles/whoops. Faces are authored in u-units: a SMALLER
  // rise/fall = a steeper, taller-launching face; a tiny crest = a peaked jump; a long
  // crest = a flat table (or a raised plateau between a step-up and a step-down). All
  // features sit clear of the start/finish (u≈0) and the banked corners (u≈0.25/0.75).
  const ramps = [
    // ~0.10  classic TABLETOP — the safe/forgiving jump (long flat deck)
    { u: 0.10, h: 3.0, rise: 0.0085, crest: 0.0140, fall: 0.0085 },
    // ~0.34/0.385  DOUBLE — two peaked humps with a valley between (fly hump-to-hump)
    { u: 0.340, h: 3.2, rise: 0.0060, crest: 0.0012, fall: 0.0055 },
    { u: 0.385, h: 3.2, rise: 0.0055, crest: 0.0012, fall: 0.0070 },
    // ~0.50  BIG SINGLE — tall, steep short takeoff, peaked, gentle landing (big air)
    { u: 0.50, h: 4.8, rise: 0.0058, crest: 0.0014, fall: 0.0130 },
    // ~0.60  STEP-UP → raised PLATEAU → STEP-DOWN (steep takeoff, long high deck, drop off)
    { u: 0.60, h: 3.6, rise: 0.0060, crest: 0.0380, fall: 0.0100 },
    // ~0.84–0.89  WHOOPS / RHYTHM — a run of small bumps to skim or double through
    { u: 0.840, h: 1.0, rise: 0.0040, crest: 0.0000, fall: 0.0040 },
    { u: 0.852, h: 1.1, rise: 0.0040, crest: 0.0000, fall: 0.0040 },
    { u: 0.864, h: 1.1, rise: 0.0040, crest: 0.0000, fall: 0.0040 },
    { u: 0.876, h: 1.1, rise: 0.0040, crest: 0.0000, fall: 0.0040 },
    { u: 0.888, h: 1.0, rise: 0.0040, crest: 0.0000, fall: 0.0040 },
  ];
  const elev = (u: number) => {
    let y = 0;
    for (const r of ramps) {
      // signed wrap-aware distance in u (− = before the crest / up-face, + = after / down-face)
      let d = u - r.u; if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
      const hc = r.crest / 2;
      const ad = Math.abs(d);
      if (ad <= hc) y += r.h;                                              // flat crest (deck / peak)
      else if (d > 0 && d < hc + r.fall) y += r.h * (1 - (d - hc) / r.fall);    // down-face
      else if (d < 0 && -d < hc + r.rise) y += r.h * (1 - (-d - hc) / r.rise);  // up-face
    }
    return y;
  };
  return fromParametric(xz, elev, 0.0, bank);
}

/** Build the centerline for a track def's shape. Oval is the verbatim original. */
export function makeCenterline(def: TrackDef): Centerline {
  const shape: TrackShape = def.shape ?? "oval";
  if (shape === "figure8") return figure8Centerline(def);
  if (shape === "offroad") return offroadCenterline(def);
  return ovalCenterline(def);
}
