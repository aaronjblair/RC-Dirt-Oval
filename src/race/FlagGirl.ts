import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { OvalTrack } from "../track/OvalTrack";

function mat(scene: Scene, name: string, c: Color3, opts: { rough?: number; metallic?: number; emissive?: number } = {}): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c;
  m.roughness = opts.rough ?? 0.7;
  m.metallic = opts.metallic ?? 0;
  if (opts.emissive) m.emissiveColor = c.scale(opts.emissive);
  return m;
}

/** Green starter's flag — bright cloth on a pole. */
function greenFlagTexture(scene: Scene): Texture {
  const t = new DynamicTexture("greenFlagTex", { width: 128, height: 96 }, scene, false);
  const c = t.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#13a52b"; c.fillRect(0, 0, 128, 96);
  c.fillStyle = "rgba(255,255,255,0.10)"; c.fillRect(0, 0, 128, 16);
  c.fillStyle = "rgba(0,0,0,0.12)"; c.fillRect(0, 80, 128, 16);
  t.update();
  return t;
}

/**
 * The flag girl: a stylized starter at the start/finish line who waves the green
 * flag to send the field off, then keeps a relaxed flag-in-hand idle. Built from
 * simple procedural meshes (hair in a ponytail, race-day outfit) on a small podium.
 */
export class FlagGirl {
  private flagPivot: TransformNode; // shoulder pivot we sweep for the wave
  private cloth: Mesh;
  private idleT = 0;
  private waveT = 0; // counts down while waving the green
  private baseArm = -0.42; // resting raised-arm angle (rad): pole near-vertical, leaned slightly forward

  constructor(scene: Scene, track: OvalTrack, shadow: ShadowGenerator | null) {
    const sm = track.sampleAt(0); // start/finish line
    const W = track.def.width;
    const stand = sm.pos.add(sm.outward.scale(W / 2 + 2.6)); // just outside the wall

    const root = new TransformNode("flagGirl", scene);
    root.position.set(stand.x, 0, stand.z);
    root.rotation.y = Math.atan2(-sm.outward.x, -sm.outward.z); // face the track

    // --- materials ---
    const skin = mat(scene, "fgSkin", new Color3(0.93, 0.74, 0.62), { rough: 0.55 });
    const hair = mat(scene, "fgHair", new Color3(0.28, 0.16, 0.07), { rough: 0.5 });
    const top = mat(scene, "fgTop", new Color3(0.85, 0.1, 0.32), { rough: 0.45, emissive: 0.12 }); // racing red top
    const skirt = mat(scene, "fgSkirt", new Color3(0.08, 0.09, 0.12), { rough: 0.6 });
    const boot = mat(scene, "fgBoot", new Color3(0.05, 0.05, 0.07), { rough: 0.4 });
    const poleM = mat(scene, "fgPole", new Color3(0.85, 0.85, 0.88), { rough: 0.3, metallic: 0.8 });

    const add = (m: Mesh, material: PBRMaterial, parent: TransformNode = root, freeze = true): Mesh => {
      m.material = material; m.parent = parent; m.isPickable = false;
      if (shadow) shadow.addShadowCaster(m); m.receiveShadows = true;
      if (freeze) m.freezeWorldMatrix();
      return m;
    };

    // --- small starter's podium ---
    add(MeshBuilder.CreateCylinder("fgPodium", { diameter: 1.5, height: 0.35, tessellation: 18 }, scene),
      mat(scene, "fgPodiumM", new Color3(0.12, 0.13, 0.16), { rough: 0.7 })).position.set(0, 0.175, 0);
    const base = 0.35; // stand on top of the podium

    // --- legs + boots ---
    for (const sx of [1, -1]) {
      add(MeshBuilder.CreateCylinder("fgLeg" + sx, { diameter: 0.15, height: 0.86, tessellation: 10 }, scene), skin)
        .position.set(sx * 0.11, base + 0.5, 0);
      add(MeshBuilder.CreateCylinder("fgBoot" + sx, { diameter: 0.18, height: 0.34, tessellation: 10 }, scene), boot)
        .position.set(sx * 0.11, base + 0.17, 0.02);
    }
    // --- short skirt (flared) ---
    add(MeshBuilder.CreateCylinder("fgSkirt", { diameterTop: 0.34, diameterBottom: 0.5, height: 0.34, tessellation: 16 }, scene), skirt)
      .position.set(0, base + 0.95, 0);
    // --- torso (fitted top) + waist ---
    add(MeshBuilder.CreateCapsule("fgTorso", { radius: 0.17, height: 0.5, tessellation: 12 }, scene), top)
      .position.set(0, base + 1.32, 0);
    // --- left arm (relaxed at side) ---
    add(MeshBuilder.CreateCylinder("fgArmL", { diameter: 0.1, height: 0.56, tessellation: 8 }, scene), skin)
      .position.set(0.26, base + 1.28, 0);
    // --- head + ponytail ---
    add(MeshBuilder.CreateSphere("fgHead", { diameter: 0.27, segments: 12 }, scene), skin).position.set(0, base + 1.72, 0);
    add(MeshBuilder.CreateSphere("fgHairBack", { diameter: 0.3, segments: 12 }, scene), hair).position.set(0, base + 1.76, -0.05);
    const pony = add(MeshBuilder.CreateCapsule("fgPony", { radius: 0.06, height: 0.4, tessellation: 8 }, scene), hair);
    pony.position.set(0, base + 1.55, -0.16); pony.rotation.x = 0.35;

    // --- raised right arm + flag on a pivot we animate ---
    const shoulder = base + 1.5;
    this.flagPivot = new TransformNode("fgFlagPivot", scene);
    this.flagPivot.parent = root;
    this.flagPivot.position.set(-0.26, shoulder, 0);
    this.flagPivot.rotation.x = this.baseArm;

    const arm = add(MeshBuilder.CreateCylinder("fgArmR", { diameter: 0.1, height: 0.56, tessellation: 8 }, scene), skin, this.flagPivot);
    arm.position.set(0, 0.26, 0); arm.freezeWorldMatrix(); // local, pivot moves it
    const pole = add(MeshBuilder.CreateCylinder("fgPole", { diameter: 0.04, height: 1.5, tessellation: 8 }, scene), poleM, this.flagPivot);
    pole.position.set(0, 0.8, 0);

    // flag cloth at the top of the pole, on its own node so it can furl
    const flagNode = new TransformNode("fgFlagNode", scene);
    flagNode.parent = this.flagPivot;
    flagNode.position.set(0.32, 1.35, 0);
    const flagMat = new PBRMaterial("fgFlagMat", scene);
    flagMat.albedoTexture = greenFlagTexture(scene);
    flagMat.albedoColor = new Color3(1, 1, 1);
    flagMat.emissiveColor = new Color3(0.07, 0.5, 0.13);
    flagMat.roughness = 0.6; flagMat.metallic = 0;
    flagMat.backFaceCulling = false;
    this.cloth = MeshBuilder.CreatePlane("fgCloth", { width: 0.64, height: 0.44 }, scene);
    this.cloth.material = flagMat; this.cloth.parent = flagNode; this.cloth.isPickable = false;
    if (shadow) shadow.addShadowCaster(this.cloth);
  }

  /** Trigger the green-flag start wave (call when the race goes green). */
  greenFlag(): void { this.waveT = 3.2; }

  update(dt: number): void {
    this.idleT += dt;
    if (this.waveT > 0) {
      // Big enthusiastic sweeps of the whole arm + a furling cloth.
      this.waveT -= dt;
      const s = Math.sin(this.idleT * 11);
      this.flagPivot.rotation.x = this.baseArm + s * 0.5;
      this.flagPivot.rotation.z = Math.sin(this.idleT * 9) * 0.5;
      this.cloth.rotation.y = Math.sin(this.idleT * 16) * 0.6;
      this.cloth.rotation.z = Math.sin(this.idleT * 13 + 1) * 0.3;
    } else {
      // Relaxed idle: gentle hold, flag ripples in the breeze.
      this.flagPivot.rotation.x = this.baseArm + Math.sin(this.idleT * 1.5) * 0.05;
      this.flagPivot.rotation.z = Math.sin(this.idleT * 1.1) * 0.04;
      this.cloth.rotation.y = Math.sin(this.idleT * 3) * 0.25;
      this.cloth.rotation.z = Math.sin(this.idleT * 2.3) * 0.12;
    }
  }
}
