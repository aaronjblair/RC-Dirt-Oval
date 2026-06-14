import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { OvalTrack } from "./OvalTrack";

function mat(scene: Scene, name: string, c: Color3, rough = 0.7, metal = 0.0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c; m.roughness = rough; m.metallic = metal;
  return m;
}

export interface SceneryHandles {
  standPosition: Vector3;
}

/** Drivers' stand, grandstands, light towers and a start/finish gantry. */
export function buildScenery(scene: Scene, track: OvalTrack, shadow: ShadowGenerator | null): SceneryHandles {
  const R = track.def.cornerRadius;
  const L = track.def.straightLength;
  const W = track.def.width;
  const outerX = R + W / 2;

  const steel = mat(scene, "steel", new Color3(0.5, 0.52, 0.56), 0.4, 0.8);
  const concrete = mat(scene, "concrete", new Color3(0.7, 0.69, 0.66), 0.8);
  const seatA = mat(scene, "seatA", new Color3(0.2, 0.3, 0.6));
  const seatB = mat(scene, "seatB", new Color3(0.7, 0.2, 0.2));
  const lampMat = mat(scene, "lamp", new Color3(1, 0.97, 0.85), 0.3, 0.2);
  lampMat.emissiveColor = new Color3(1, 0.95, 0.8);

  const cast = (m: Mesh) => { if (shadow) shadow.addShadowCaster(m); m.receiveShadows = true; };

  // --- Drivers' stand on the front straight (outside +x), centered at z=0 ---
  const standX = outerX + 6;
  const standY = 5;
  const deck = MeshBuilder.CreateBox("standDeck", { width: 5, height: 0.3, depth: 12 }, scene);
  deck.position.set(standX, standY, 0); deck.material = steel; cast(deck);
  for (const dz of [-5.5, 5.5]) for (const dx of [-2, 2]) {
    const leg = MeshBuilder.CreateBox("standLeg", { width: 0.3, height: standY, depth: 0.3 }, scene);
    leg.position.set(standX + dx, standY / 2, dz); leg.material = steel; cast(leg);
  }
  const rail = MeshBuilder.CreateBox("standRail", { width: 0.1, height: 1, depth: 12 }, scene);
  rail.position.set(standX - 2.4, standY + 0.65, 0); rail.material = steel; cast(rail);
  const roof = MeshBuilder.CreateBox("standRoof", { width: 5.5, height: 0.15, depth: 13 }, scene);
  roof.position.set(standX, standY + 3, 0); roof.material = mat(scene, "roof", new Color3(0.25, 0.25, 0.28), 0.5); cast(roof);

  // --- Grandstands along both straights (outside) ---
  const buildGrandstand = (cx: number, faceSign: number) => {
    const tiers = 8;
    for (let t = 0; t < tiers; t++) {
      const step = MeshBuilder.CreateBox("gsStep", { width: 2.0, height: 0.6, depth: 40 }, scene);
      step.position.set(cx + faceSign * (3 + t * 1.4), 0.3 + t * 0.6, 0);
      step.material = concrete; cast(step);
      const seat = MeshBuilder.CreateBox("gsSeat", { width: 1.6, height: 0.25, depth: 40 }, scene);
      seat.position.set(cx + faceSign * (3 + t * 1.4), 0.65 + t * 0.6, 0);
      seat.material = t % 2 ? seatA : seatB; cast(seat);
    }
  };
  buildGrandstand(outerX + 14, 1); // +x straight, larger set back behind drivers' stand
  buildGrandstand(-outerX - 6, -1); // -x straight

  // --- Light towers at the 4 corners ---
  const towerAt = (x: number, z: number) => {
    const pole = MeshBuilder.CreateCylinder("pole", { diameter: 0.5, height: 16, tessellation: 8 }, scene);
    pole.position.set(x, 8, z); pole.material = steel; cast(pole);
    const bank = MeshBuilder.CreateBox("lampBank", { width: 4, height: 1.2, depth: 0.4 }, scene);
    bank.position.set(x, 16, z);
    bank.lookAt(new Vector3(0, 16, 0));
    bank.material = lampMat;
    for (let i = -1; i <= 1; i++) {
      const pl = new PointLight("towerL" + x + z + i, new Vector3(x + i * 1.2, 15.5, z), scene);
      pl.intensity = 0.0; // off by day; used for night tracks later
      pl.range = 60;
    }
  };
  const tx = outerX + 10, tz = L / 2 + 6;
  towerAt(tx, tz); towerAt(-tx, tz); towerAt(tx, -tz); towerAt(-tx, -tz);

  // --- Start/finish gantry over the front straight ---
  const gx = R;
  for (const dx of [-W / 2 - 1, W / 2 + 1]) {
    const post = MeshBuilder.CreateBox("sfPost", { width: 0.3, height: 5, depth: 0.3 }, scene);
    post.position.set(gx + dx, 2.5, 0); post.material = steel; cast(post);
  }
  const beam = MeshBuilder.CreateBox("sfBeam", { width: W + 2, height: 0.6, depth: 0.4 }, scene);
  beam.position.set(gx, 5, 0); beam.material = mat(scene, "sfBeam", new Color3(0.1, 0.1, 0.12), 0.5); cast(beam);

  return { standPosition: new Vector3(standX - 2.4, standY + 1.8, 0) };
}
