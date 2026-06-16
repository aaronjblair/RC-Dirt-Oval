import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { OvalTrack } from "../track/OvalTrack";
import type { BuiltCar } from "../car/Car";

// Trackside PEOPLE are full real-human size, NOT 1:10 like the cars/track — they tower
// over the toy cars. (See the world-scale skill: 1 unit ≈ 1 ft, adult ≈ 5.7u.)
const PEOPLE_SCALE = 3.5;
const SIT_DROP = 0.45 * PEOPLE_SCALE; // lower a marshal this much to read as seated in the chair
const STALL_SPEED = 1.5;     // below this (units/s) ...
const STALL_TIME = 3.0;      // ... for this long while green = stalled, needs correcting
const REACH = 1.6;           // arrival distance to a car (center-to-center)
const WALK_SPEED = 9;        // brisk jog out to the incident

function mat(scene: Scene, name: string, c: Color3, emissive = 0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c; m.roughness = 0.8; m.metallic = 0;
  if (emissive > 0) m.emissiveColor = c.scale(emissive);
  return m;
}

/** Per-figure appearance so no two marshals look identical. */
export interface Look {
  shirt: Color3;    // shirt/vest colour
  pants: Color3;    // legs
  skin: Color3;     // head + hands
  hair: Color3;     // hair colour
  hat: boolean;     // wear a cap over the hair
  longHair: boolean;// add a hair drape down the back
}

/** A simple clothed person built from primitives: legs, torso + arms, head, hair/cap. Root at the
 *  feet, scaled to real-human size. Appearance varies per `Look`. */
export function buildPerson(scene: Scene, name: string, look: Look, shadow: ShadowGenerator | null): TransformNode {
  const root = new TransformNode(name, scene);
  const skin = mat(scene, name + "skin", look.skin);
  const pantsM = mat(scene, name + "pants", look.pants);
  const shirtM = mat(scene, name + "shirt", look.shirt, 0.35); // hi-vis pops a little
  const hairM = mat(scene, name + "hair", look.hair);
  const capM = mat(scene, name + "cap", new Color3(0.12, 0.12, 0.14));
  const add = (m: Mesh, material: PBRMaterial) => {
    m.material = material; m.parent = root; m.isPickable = false;
    if (shadow) shadow.addShadowCaster(m); m.receiveShadows = true; return m;
  };
  for (const sx of [1, -1]) {
    const leg = add(MeshBuilder.CreateCylinder(name + "leg" + sx, { diameter: 0.14, height: 0.74, tessellation: 8 }, scene), pantsM);
    leg.position.set(sx * 0.1, 0.37, 0);
  }
  add(MeshBuilder.CreateCapsule(name + "torso", { radius: 0.17, height: 0.54, tessellation: 10 }, scene), shirtM).position.set(0, 1.0, 0);
  for (const sx of [1, -1]) {
    const arm = add(MeshBuilder.CreateCylinder(name + "arm" + sx, { diameter: 0.1, height: 0.5, tessellation: 8 }, scene), shirtM);
    arm.position.set(sx * 0.24, 1.0, 0);
  }
  add(MeshBuilder.CreateCylinder(name + "neck", { diameter: 0.1, height: 0.13, tessellation: 8 }, scene), skin).position.set(0, 1.31, 0);
  add(MeshBuilder.CreateSphere(name + "head", { diameter: 0.26, segments: 10 }, scene), skin).position.set(0, 1.44, 0);
  // hair sphere (always), optional long drape down the back, optional cap on top
  const hair = add(MeshBuilder.CreateSphere(name + "hair", { diameter: 0.30, segments: 10 }, scene), hairM);
  hair.position.set(0, 1.46, 0); hair.scaling.y = 0.85;
  if (look.longHair) {
    const drape = add(MeshBuilder.CreateBox(name + "drape", { width: 0.26, height: 0.66, depth: 0.12 }, scene), hairM);
    drape.position.set(0, 1.12, -0.11);
  }
  if (look.hat) {
    add(MeshBuilder.CreateCylinder(name + "capm", { diameterTop: 0.30, diameterBottom: 0.34, height: 0.12, tessellation: 10 }, scene), capM)
      .position.set(0, 1.56, 0);
  }
  root.scaling.setAll(PEOPLE_SCALE); // real-human size (feet stay at y=0)
  return root;
}

/** Six distinct marshal looks (varied shirt/hair/skin/headwear). */
function marshalLooks(): Look[] {
  const C = (r: number, g: number, b: number) => new Color3(r, g, b);
  return [
    { shirt: C(0.95, 0.45, 0.05), pants: C(0.13, 0.13, 0.16), skin: C(0.85, 0.66, 0.52), hair: C(0.28, 0.18, 0.09), hat: true,  longHair: false }, // orange, brown, cap
    { shirt: C(0.95, 0.80, 0.10), pants: C(0.15, 0.20, 0.28), skin: C(0.62, 0.45, 0.34), hair: C(0.08, 0.07, 0.06), hat: false, longHair: false }, // yellow, black
    { shirt: C(0.55, 0.85, 0.10), pants: C(0.20, 0.18, 0.15), skin: C(0.50, 0.36, 0.27), hair: C(0.62, 0.62, 0.64), hat: true,  longHair: false }, // lime, gray, cap
    { shirt: C(0.10, 0.60, 0.85), pants: C(0.13, 0.13, 0.16), skin: C(0.85, 0.66, 0.52), hair: C(0.78, 0.64, 0.32), hat: false, longHair: true  }, // cyan, blonde long
    { shirt: C(0.25, 0.30, 0.80), pants: C(0.25, 0.22, 0.20), skin: C(0.62, 0.45, 0.34), hair: C(0.42, 0.16, 0.08), hat: true,  longHair: false }, // blue, auburn, cap
    { shirt: C(0.85, 0.40, 0.65), pants: C(0.18, 0.16, 0.20), skin: C(0.95, 0.78, 0.66), hair: C(0.20, 0.12, 0.06), hat: false, longHair: true  }, // pink, dark-brown long
  ];
}

/** Eight distinct fan looks for the drivers'-stand crowd (some ball caps, some long hair, varied
 *  shirts/skin/hair) — reuses the same `buildPerson` machinery as the marshals. */
export function spectatorLooks(): Look[] {
  const C = (r: number, g: number, b: number) => new Color3(r, g, b);
  return [
    { shirt: C(0.80, 0.18, 0.18), pants: C(0.16, 0.18, 0.24), skin: C(0.86, 0.67, 0.53), hair: C(0.10, 0.08, 0.06), hat: true,  longHair: false }, // red tee, ball cap
    { shirt: C(0.20, 0.40, 0.78), pants: C(0.20, 0.20, 0.22), skin: C(0.58, 0.42, 0.31), hair: C(0.06, 0.05, 0.05), hat: false, longHair: true  }, // blue, black long hair
    { shirt: C(0.92, 0.78, 0.22), pants: C(0.14, 0.13, 0.13), skin: C(0.90, 0.74, 0.62), hair: C(0.55, 0.40, 0.16), hat: true,  longHair: false }, // yellow, cap
    { shirt: C(0.22, 0.58, 0.34), pants: C(0.22, 0.20, 0.16), skin: C(0.48, 0.34, 0.25), hair: C(0.66, 0.66, 0.68), hat: false, longHair: false }, // green, gray hair
    { shirt: C(0.86, 0.86, 0.90), pants: C(0.12, 0.20, 0.30), skin: C(0.84, 0.64, 0.50), hair: C(0.80, 0.66, 0.34), hat: false, longHair: true  }, // white, blonde long hair
    { shirt: C(0.70, 0.38, 0.10), pants: C(0.16, 0.16, 0.18), skin: C(0.62, 0.45, 0.34), hair: C(0.30, 0.18, 0.09), hat: true,  longHair: false }, // burnt-orange, cap
    { shirt: C(0.52, 0.22, 0.72), pants: C(0.24, 0.22, 0.20), skin: C(0.95, 0.78, 0.66), hair: C(0.42, 0.16, 0.08), hat: false, longHair: true  }, // purple, auburn long hair
    { shirt: C(0.14, 0.58, 0.68), pants: C(0.18, 0.18, 0.20), skin: C(0.55, 0.40, 0.30), hair: C(0.08, 0.07, 0.06), hat: true,  longHair: false }, // teal, cap
  ];
}

/** A folding camp chair: seat + back + four legs. Root at the feet; scaled by the caller. */
function buildChair(scene: Scene, name: string, mt: PBRMaterial, shadow: ShadowGenerator | null): TransformNode {
  const root = new TransformNode(name, scene);
  const add = (m: Mesh) => { m.material = mt; m.parent = root; m.isPickable = false; if (shadow) shadow.addShadowCaster(m); return m; };
  add(MeshBuilder.CreateBox(name + "seat", { width: 0.5, height: 0.08, depth: 0.5 }, scene)).position.set(0, 0.5, 0);
  add(MeshBuilder.CreateBox(name + "back", { width: 0.5, height: 0.55, depth: 0.08 }, scene)).position.set(0, 0.78, -0.22);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const leg = add(MeshBuilder.CreateCylinder(name + "cl" + sx + sz, { diameter: 0.05, height: 0.5, tessellation: 6 }, scene));
    leg.position.set(sx * 0.2, 0.25, sz * 0.2);
  }
  return root;
}

type State = "idle" | "toCar" | "work" | "back";
interface Marshal {
  body: TransformNode;
  home: Vector3;
  faceHome: number;
  seated: boolean; // home posture: sitting in a chair (infield end) vs. standing (corner)
  state: State;
  target: BuiltCar | null;
  timer: number;
  bob: number;
}

/**
 * Track marshals. 6 hi-vis figures: TWO sit in camp chairs at the two infield ENDS of the oval,
 * and FOUR stand OUTSIDE the track, evenly spread at the corners (turns 1–4). They wait until
 * there's trouble. When a car WRECKS (flips and ends up stuck) OR STALLS (sits at ~zero speed for
 * a few seconds), the NEAREST available marshal — seated or standing — gets up/jogs across to it
 * and, instead of just righting it in place, **places it back on the racing line**, upright and
 * pointing the race direction (vehicle.resetTo), then returns to its post (re-seating or standing
 * back at its corner). The player can also tap R to bail out of a flip.
 */
export class Marshals {
  private marshals: Marshal[] = [];
  private targeted = new Set<BuiltCar>();
  private stall = new Map<BuiltCar, number>(); // low-speed dwell time per car
  private track: OvalTrack;

  constructor(scene: Scene, track: OvalTrack, shadow: ShadowGenerator | null) {
    this.track = track;
    const W = track.def.width, L = track.def.straightLength, R = track.def.cornerRadius;
    const infieldEndZ = L / 2 + (R - W / 2); // inner-edge z at the very end of the infield (x=0)
    const looks = marshalLooks(); // varied appearances
    const chairMat = mat(scene, "chairMat", new Color3(0.15, 0.3, 0.55)); // blue camp chairs
    let idx = 0;

    // --- TWO SEATED marshals: one camp chair at each infield END (centered on x=0) ---
    for (const sgn of [1, -1]) {
      const faceHome = sgn > 0 ? 0 : Math.PI;        // face out toward the near turn
      const home = new Vector3(0, 0, sgn * (infieldEndZ - 7)); // ~7u inside each end
      const chair = buildChair(scene, "chair" + idx, chairMat, shadow);
      chair.position.set(home.x, 0, home.z);
      chair.rotation.y = faceHome;
      chair.scaling.setAll(PEOPLE_SCALE);
      chair.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
      const body = buildPerson(scene, "marshal" + idx, looks[idx], shadow);
      body.position.set(home.x, -SIT_DROP, home.z); // seated in the chair
      body.rotation.y = faceHome;
      this.marshals.push({ body, home, faceHome, seated: true, state: "idle", target: null, timer: 0, bob: 0 });
      idx++;
    }

    // --- FOUR STANDING corner marshals OUTSIDE the track, evenly spread (turns 1–4) ---
    const half = L / 2, turn = Math.PI * R;
    const cornerS = [
      half + turn * 0.25, half + turn * 0.75,                       // turn 1 / 2 (the +z end)
      half + turn + L + turn * 0.25, half + turn + L + turn * 0.75, // turn 3 / 4 (the -z end)
    ];
    for (const s of cornerS) {
      const sm = track.sampleAt(s);
      const pos = sm.pos.add(sm.outward.scale(W / 2 + 4)); // a few units past the outer wall
      const home = new Vector3(pos.x, 0, pos.z);
      const faceHome = Math.atan2(-sm.outward.x, -sm.outward.z); // face IN toward the track
      const body = buildPerson(scene, "marshal" + idx, looks[idx], shadow);
      body.position.set(home.x, 0, home.z); // standing
      body.rotation.y = faceHome;
      this.marshals.push({ body, home, faceHome, seated: false, state: "idle", target: null, timer: 0, bob: 0 });
      idx++;
    }
  }

  /** Walk a marshal toward a ground target; returns true on arrival. Adds a footfall bob. */
  private walk(m: Marshal, destX: number, destZ: number, dt: number): boolean {
    const dx = destX - m.body.position.x, dz = destZ - m.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < REACH) return true;
    const step = Math.min(dist, WALK_SPEED * dt);
    m.body.position.x += (dx / dist) * step;
    m.body.position.z += (dz / dist) * step;
    m.body.rotation.y = Math.atan2(dx, dz);
    m.bob += dt * 9;
    m.body.position.y = Math.abs(Math.sin(m.bob)) * 0.07 * PEOPLE_SCALE;
    return false;
  }

  /** A car needs a marshal if it's wrecked (stuck upside down) or has been stalled a while. */
  private needsHelp(c: BuiltCar): boolean {
    return c.vehicle.isStuck || (this.stall.get(c) ?? 0) >= STALL_TIME;
  }

  private pickIncident(m: Marshal, cars: BuiltCar[]): BuiltCar | null {
    let best: BuiltCar | null = null, bestD = Infinity;
    for (const c of cars) {
      if (this.targeted.has(c) || !this.needsHelp(c)) continue;
      const dx = c.vehicle.position.x - m.body.position.x;
      const dz = c.vehicle.position.z - m.body.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /** Drop the car back on the bottom groove, upright, facing the race direction. */
  private placeOnTrack(c: BuiltCar): void {
    const v = c.vehicle;
    const proj = this.track.project(v.position);
    const W = this.track.def.width;
    const pos = proj.center.add(proj.outward.scale(-W * 0.12)); // bottom groove (inboard)
    pos.y = proj.center.y + 0.6;                                // a touch up; ride height settles next step
    const yaw = Math.atan2(proj.tangent.x, proj.tangent.z);     // counter-clockwise race direction
    v.resetTo(pos, yaw);
    this.stall.set(c, -2.0); // grace so a momentarily-stopped car isn't re-flagged instantly
  }

  update(dt: number, cars: BuiltCar[]) {
    // 1. track each car's low-speed dwell (only matters when not flipped/rolling)
    for (const c of cars) {
      const v = c.vehicle;
      if (v.isStuck) { this.stall.set(c, 0); continue; }
      if (v.speed < STALL_SPEED && !v.isRolling) {
        this.stall.set(c, (this.stall.get(c) ?? 0) + dt);
      } else {
        this.stall.set(c, 0);
      }
    }

    // 2. run each marshal's state machine
    for (const m of this.marshals) {
      switch (m.state) {
        case "idle": { // seated in the chair until there's a wreck/stall
          const car = this.pickIncident(m, cars);
          if (car) { m.target = car; this.targeted.add(car); m.state = "toCar"; m.body.position.y = 0; } // stand up
          break;
        }
        case "toCar": {
          const car = m.target!;
          if (!this.needsHelp(car)) { this.release(m); break; } // recovered on its own / by R
          if (this.walk(m, car.vehicle.position.x, car.vehicle.position.z, dt)) { m.state = "work"; m.timer = 0.9; }
          break;
        }
        case "work": {
          m.timer -= dt;
          if (m.target) {
            const c = m.target;
            m.body.rotation.y = Math.atan2(c.vehicle.position.x - m.body.position.x, c.vehicle.position.z - m.body.position.z);
          }
          if (m.timer <= 0) {
            if (m.target) { this.placeOnTrack(m.target); this.targeted.delete(m.target); }
            m.target = null;
            m.state = "back";
          }
          break;
        }
        case "back": {
          if (this.walk(m, m.home.x, m.home.z, dt)) {
            m.state = "idle";
            m.body.position.set(m.home.x, m.seated ? -SIT_DROP : 0, m.home.z); // re-seat or stand
            m.body.rotation.y = m.faceHome;
          }
          break;
        }
      }
    }
  }

  private release(m: Marshal) {
    if (m.target) this.targeted.delete(m.target);
    m.target = null;
    m.state = "back";
  }
}
