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

function mat(scene: Scene, name: string, c: Color3, emissive = 0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c; m.roughness = 0.8; m.metallic = 0;
  if (emissive > 0) m.emissiveColor = c.scale(emissive);
  return m;
}

/** A simple standing person: legs, hi-vis torso + arms, head, cap. Root at the feet. */
function buildPerson(scene: Scene, name: string, vest: Color3, shadow: ShadowGenerator | null): TransformNode {
  const root = new TransformNode(name, scene);
  const skin = mat(scene, name + "skin", new Color3(0.82, 0.62, 0.5));
  const dark = mat(scene, name + "dark", new Color3(0.13, 0.13, 0.16));
  const vestM = mat(scene, name + "vest", vest, 0.4); // hi-vis pops a little
  const add = (m: Mesh, material: PBRMaterial) => {
    m.material = material; m.parent = root; m.isPickable = false;
    if (shadow) shadow.addShadowCaster(m); m.receiveShadows = true; return m;
  };
  for (const sx of [1, -1]) {
    const leg = add(MeshBuilder.CreateCylinder(name + "leg" + sx, { diameter: 0.14, height: 0.74, tessellation: 8 }, scene), dark);
    leg.position.set(sx * 0.1, 0.37, 0);
  }
  add(MeshBuilder.CreateCapsule(name + "torso", { radius: 0.17, height: 0.54, tessellation: 10 }, scene), vestM).position.set(0, 1.0, 0);
  for (const sx of [1, -1]) {
    const arm = add(MeshBuilder.CreateCylinder(name + "arm" + sx, { diameter: 0.1, height: 0.5, tessellation: 8 }, scene), vestM);
    arm.position.set(sx * 0.24, 1.0, 0);
  }
  add(MeshBuilder.CreateSphere(name + "head", { diameter: 0.26, segments: 10 }, scene), skin).position.set(0, 1.42, 0);
  add(MeshBuilder.CreateCylinder(name + "cap", { diameterTop: 0.3, diameterBottom: 0.32, height: 0.12, tessellation: 10 }, scene), dark).position.set(0, 1.55, 0);
  return root;
}

/** A folding camp chair: seat + back + four legs. */
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
interface Rescue {
  body: TransformNode;
  home: Vector3;
  faceHome: number;
  state: State;
  target: BuiltCar | null;
  timer: number;
  bob: number;
}

const SIT_DROP = 0.45; // lower a marshal this much to read as seated in the chair

/**
 * Track & pit marshals. Hi-vis figures stand around the track like real RC corner
 * workers; two rescue marshals sit in chairs at the infield ends and — when a car
 * flips and is stuck upside down — get up, walk out across traffic to it, right it
 * (vehicle.recover()), and return to their chairs. Cars stay flipped until reached.
 */
export class Marshals {
  private rescues: Rescue[] = [];
  private targeted = new Set<BuiltCar>();

  constructor(scene: Scene, track: OvalTrack, shadow: ShadowGenerator | null) {
    const W = track.def.width;
    const L = track.def.straightLength;

    // --- Standing corner marshals just outside the wall, facing the track ---
    const vestY = new Color3(0.95, 0.85, 0.1); // hi-vis yellow
    for (let k = 0; k < 8; k++) {
      const s = (k / 8) * track.length + track.length * 0.06;
      const sm = track.sampleAt(s);
      const pos = sm.pos.add(sm.outward.scale(W / 2 + 3.5 + (k % 2) * 1.5));
      const p = buildPerson(scene, "marshalS" + k, vestY, shadow);
      p.position.set(pos.x, 0, pos.z);
      p.rotation.y = Math.atan2(-sm.outward.x, -sm.outward.z); // face inward
      p.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
    }

    // --- Two seated rescue marshals at the infield ends, in chairs ---
    const vestO = new Color3(0.95, 0.45, 0.05); // hi-vis orange
    const chairMat = mat(scene, "chairMat", new Color3(0.15, 0.3, 0.55)); // blue camp chairs
    for (const sgn of [1, -1]) {
      const home = new Vector3(0, 0, sgn * L * 0.42); // infield, toward each turn end
      const faceHome = sgn > 0 ? 0 : Math.PI; // face out toward the near turn
      const chair = buildChair(scene, "chair" + sgn, chairMat, shadow);
      chair.position.set(home.x, 0, home.z);
      chair.rotation.y = faceHome; // chairs turned to face the opposite way
      chair.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
      const body = buildPerson(scene, "rescue" + sgn, vestO, shadow);
      body.position.set(home.x, -SIT_DROP, home.z); // seated
      body.rotation.y = faceHome;
      this.rescues.push({ body, home, faceHome, state: "idle", target: null, timer: 0, bob: 0 });
    }
  }

  /** Walk a marshal toward a ground target; returns true on arrival. Adds a footfall bob. */
  private walk(r: Rescue, destX: number, destZ: number, speed: number, dt: number): boolean {
    const dx = destX - r.body.position.x, dz = destZ - r.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) return true;
    const step = Math.min(dist, speed * dt);
    r.body.position.x += (dx / dist) * step;
    r.body.position.z += (dz / dist) * step;
    r.body.rotation.y = Math.atan2(dx, dz);
    r.bob += dt * 9;
    r.body.position.y = Math.abs(Math.sin(r.bob)) * 0.07;
    return false;
  }

  private pickStuck(r: Rescue, cars: BuiltCar[]): BuiltCar | null {
    let best: BuiltCar | null = null, bestD = Infinity;
    for (const c of cars) {
      if (!c.vehicle.isStuck || this.targeted.has(c)) continue;
      const dx = c.vehicle.position.x - r.body.position.x;
      const dz = c.vehicle.position.z - r.body.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  update(dt: number, cars: BuiltCar[]) {
    for (const r of this.rescues) {
      switch (r.state) {
        case "idle": {
          const car = this.pickStuck(r, cars);
          if (car) { r.target = car; this.targeted.add(car); r.state = "toCar"; r.body.position.y = 0; }
          break;
        }
        case "toCar": {
          const v = r.target!.vehicle;
          if (!v.isStuck) { this.release(r); break; } // someone else / a reset handled it
          if (this.walk(r, v.position.x, v.position.z, 7, dt)) { r.state = "work"; r.timer = 0.9; }
          break;
        }
        case "work": {
          r.timer -= dt;
          // face the car while righting it
          if (r.target) r.body.rotation.y = Math.atan2(r.target.vehicle.position.x - r.body.position.x, r.target.vehicle.position.z - r.body.position.z);
          if (r.timer <= 0) {
            r.target?.vehicle.recover();
            if (r.target) this.targeted.delete(r.target);
            r.target = null;
            r.state = "back";
          }
          break;
        }
        case "back": {
          if (this.walk(r, r.home.x, r.home.z, 7, dt)) {
            r.state = "idle";
            r.body.position.set(r.home.x, -SIT_DROP, r.home.z); // sit back down
            r.body.rotation.y = r.faceHome;
          }
          break;
        }
      }
    }
  }

  private release(r: Rescue) {
    if (r.target) this.targeted.delete(r.target);
    r.target = null;
    r.state = "back";
  }
}
