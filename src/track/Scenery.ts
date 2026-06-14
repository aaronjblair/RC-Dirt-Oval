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

  const cast = (m: Mesh) => {
    if (shadow) shadow.addShadowCaster(m);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix(); // static scenery — skip per-frame matrix work
  };

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

  // --- Crowd: instanced spectators (6 shirt colors, invisible source meshes) ---
  const shirtColors = [
    new Color3(0.85, 0.2, 0.2), new Color3(0.2, 0.4, 0.85), new Color3(0.9, 0.8, 0.2),
    new Color3(0.2, 0.7, 0.4), new Color3(0.85, 0.85, 0.9), new Color3(0.6, 0.3, 0.7),
  ];
  const crowdMasters = shirtColors.map((c, i) => {
    const m = MeshBuilder.CreateBox("fan" + i, { width: 0.28, height: 0.5, depth: 0.28 }, scene);
    m.material = mat(scene, "fanMat" + i, c, 0.8);
    m.isVisible = false; // instances still render
    return m;
  });
  let fanN = 0;
  const seatFan = (x: number, y: number, z: number) => {
    const inst = crowdMasters[fanN++ % crowdMasters.length].createInstance("f" + fanN);
    inst.position.set(x + (Math.random() - 0.5) * 0.3, y + 0.35, z);
  };

  // --- Grandstands along both straights (outside), filled with crowd ---
  const buildGrandstand = (cx: number, faceSign: number) => {
    const tiers = 8;
    for (let t = 0; t < tiers; t++) {
      const sx = cx + faceSign * (3 + t * 1.4);
      const step = MeshBuilder.CreateBox("gsStep", { width: 2.0, height: 0.6, depth: 40 }, scene);
      step.position.set(sx, 0.3 + t * 0.6, 0); step.material = concrete; cast(step);
      const seat = MeshBuilder.CreateBox("gsSeat", { width: 1.6, height: 0.25, depth: 40 }, scene);
      seat.position.set(sx, 0.65 + t * 0.6, 0); seat.material = t % 2 ? seatA : seatB; cast(seat);
      for (let z = -19; z <= 19; z += 1.1) if (Math.random() > 0.25) seatFan(sx, 0.65 + t * 0.6, z);
    }
  };
  buildGrandstand(outerX + 14, 1);
  buildGrandstand(-outerX - 6, -1);

  // --- Treeline + low hills around the outfield for backdrop ---
  const trunkMat = mat(scene, "trunk", new Color3(0.28, 0.2, 0.12), 0.9);
  const leafMat = mat(scene, "leaf", new Color3(0.18, 0.32, 0.16), 0.9);
  const trunkMaster = MeshBuilder.CreateCylinder("trunkM", { diameter: 0.5, height: 2, tessellation: 6 }, scene);
  trunkMaster.material = trunkMat; trunkMaster.isVisible = false;
  const leafMaster = MeshBuilder.CreateCylinder("leafM", { diameterTop: 0, diameterBottom: 3.2, height: 5, tessellation: 7 }, scene);
  leafMaster.material = leafMat; leafMaster.isVisible = false;
  const rad = Math.max(L, R) + 55;
  for (let a = 0; a < Math.PI * 2; a += 0.16) {
    const r = rad + (Math.random() - 0.5) * 18;
    const x = Math.cos(a) * r * 0.9, z = Math.sin(a) * r * 1.2;
    const tr = trunkMaster.createInstance("tr"); tr.position.set(x, 1, z);
    const lf = leafMaster.createInstance("lf"); lf.position.set(x, 4, z);
    const s = 0.7 + Math.random() * 0.8; lf.scaling.setAll(s);
  }
  const hillMat = mat(scene, "hill", new Color3(0.22, 0.3, 0.2), 1.0);
  const hillMaster = MeshBuilder.CreateSphere("hillM", { diameter: 1, segments: 8 }, scene);
  hillMaster.material = hillMat; hillMaster.isVisible = false;
  for (let a = 0; a < Math.PI * 2; a += 0.5) {
    const r = rad + 60;
    const h = hillMaster.createInstance("hill");
    h.position.set(Math.cos(a) * r, -2, Math.sin(a) * r * 1.3);
    h.scaling.set(40 + Math.random() * 30, 12 + Math.random() * 8, 40 + Math.random() * 30);
  }

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
