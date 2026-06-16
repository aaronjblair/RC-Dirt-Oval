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
import { buildPerson } from "./Marshals";

// Real-human size — she towers over the 1:10 toy cars, like the marshals/flag girl.
const FIG_SCALE = 3.3;

function mat(scene: Scene, name: string, c: Color3, opts: { rough?: number; metallic?: number; emissive?: number } = {}): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c;
  m.roughness = opts.rough ?? 0.6;
  m.metallic = opts.metallic ?? 0;
  if (opts.emissive) m.emissiveColor = c.scale(opts.emissive);
  return m;
}

/**
 * Easter egg (undocumented): if the player's driver name is "Naked Lady", a TASTEFUL, fully-clothed
 * low-poly woman in a bikini periodically sprints across a straight while a hi-vis marshal gives chase
 * — the classic broadcast "streaker" gag, played for laughs. Faceless cartoon style like the other
 * trackside figures; swimwear only, no explicit anatomy. Built/updated like FlagGirl from main.ts.
 */
export class Streaker {
  private root: TransformNode;          // the bikini figure (feet at y=0)
  private chaser: TransformNode;        // the marshal chasing her
  private hips: TransformNode[] = [];   // leg pivots (run swing)
  private shoulders: TransformNode[] = []; // arm pivots (run swing)
  private hair: Mesh;

  private state: "waiting" | "running" = "waiting";
  private timer = 6;                     // first dash a few seconds in
  private t = 0;                         // 0..1 progress across the track this run
  private phase = 0;                     // run-cycle phase
  private from = new Vector3();
  private to = new Vector3();
  private faceY = 0;
  private runDur = 2.6;

  constructor(scene: Scene, private track: OvalTrack, shadow: ShadowGenerator | null) {
    const skinC = new Color3(0.95, 0.77, 0.66);
    const biC = new Color3(0.80, 0.69, 0.50); // light tan two-piece (kept distinct from skin so it reads as swimwear)
    const hairC = new Color3(0.30, 0.17, 0.07); // glossy brunette
    const skin = mat(scene, "stkSkin", skinC, { rough: 0.5 });
    const bikini = mat(scene, "stkBikini", biC, { rough: 0.55, emissive: 0.05 });
    const hairM = mat(scene, "stkHair", hairC, { rough: 0.45 });
    const eyeW = mat(scene, "stkEyeW", new Color3(0.98, 0.98, 1), { rough: 0.3, emissive: 0.15 });
    const pupilM = mat(scene, "stkPupil", new Color3(0.05, 0.04, 0.08), { rough: 0.3 });
    const lipM = mat(scene, "stkLip", new Color3(0.85, 0.12, 0.28), { rough: 0.35, emissive: 0.1 });

    const root = new TransformNode("streaker", scene);
    root.scaling.setAll(FIG_SCALE);
    this.root = root;

    const add = (m: Mesh, material: PBRMaterial, parent: TransformNode = root): Mesh => {
      m.material = material; m.parent = parent; m.isPickable = false;
      if (shadow) shadow.addShadowCaster(m); m.receiveShadows = true;
      return m;
    };

    // --- legs on hip pivots (swing for the run) ---
    for (const sx of [1, -1]) {
      const hip = new TransformNode("stkHip" + sx, scene);
      hip.parent = root; hip.position.set(sx * 0.1, 0.74, 0);
      const leg = add(MeshBuilder.CreateCylinder("stkLeg" + sx, { diameter: 0.13, height: 0.74, tessellation: 8 }, scene), skin, hip);
      leg.position.set(0, -0.37, 0);
      add(MeshBuilder.CreateSphere("stkFoot" + sx, { diameter: 0.16, segments: 6 }, scene), skin, hip).position.set(0, -0.72, 0.04);
      this.hips.push(hip);
    }

    // --- bikini bottom (a hip band, slightly wider than the waist → a hint of hip) ---
    add(MeshBuilder.CreateCylinder("stkBottom", { diameterTop: 0.30, diameterBottom: 0.36, height: 0.24, tessellation: 14 }, scene), bikini)
      .position.set(0, 0.86, 0);

    // --- torso (skin), narrowed at the waist ---
    add(MeshBuilder.CreateCapsule("stkTorso", { radius: 0.155, height: 0.46, tessellation: 12 }, scene), skin).position.set(0, 1.14, 0);

    // --- subtle bust + a bandeau bikini top over it (tasteful) ---
    for (const sx of [1, -1]) {
      add(MeshBuilder.CreateSphere("stkBust" + sx, { diameter: 0.15, segments: 8 }, scene), skin).position.set(sx * 0.075, 1.2, 0.08);
    }
    const top = add(MeshBuilder.CreateBox("stkTop", { width: 0.36, height: 0.11, depth: 0.22 }, scene), bikini);
    top.position.set(0, 1.21, 0.05);

    // --- arms on shoulder pivots (swing for the run) ---
    for (const sx of [1, -1]) {
      const sh = new TransformNode("stkSh" + sx, scene);
      sh.parent = root; sh.position.set(sx * 0.21, 1.34, 0);
      const arm = add(MeshBuilder.CreateCylinder("stkArm" + sx, { diameter: 0.09, height: 0.52, tessellation: 8 }, scene), skin, sh);
      arm.position.set(0, -0.26, 0);
      this.shoulders.push(sh);
    }

    // --- neck + head ---
    add(MeshBuilder.CreateCylinder("stkNeck", { diameter: 0.09, height: 0.12, tessellation: 8 }, scene), skin, root).position.set(0, 1.46, 0);
    add(MeshBuilder.CreateSphere("stkHead", { diameter: 0.25, segments: 14 }, scene), skin, root).position.set(0, 1.59, 0);
    // a pretty human face on the front (+z): slim almond eyes, brows, a little nose, soft lips
    for (const sx of [1, -1]) {
      const eye = add(MeshBuilder.CreateSphere("stkEye" + sx, { diameter: 0.045, segments: 10 }, scene), eyeW, root);
      eye.position.set(sx * 0.045, 1.614, 0.113); eye.scaling.set(1.35, 0.62, 0.5); // almond, not googly
      add(MeshBuilder.CreateSphere("stkPup" + sx, { diameter: 0.02, segments: 8 }, scene), pupilM, root).position.set(sx * 0.045, 1.612, 0.127);
      const brow = add(MeshBuilder.CreateBox("stkBrow" + sx, { width: 0.052, height: 0.011, depth: 0.02 }, scene), hairM, root);
      brow.position.set(sx * 0.045, 1.648, 0.116); brow.rotation.z = sx * 0.1;
    }
    add(MeshBuilder.CreateSphere("stkNose", { diameter: 0.028, segments: 6 }, scene), skin, root).position.set(0, 1.585, 0.132);
    const lips = add(MeshBuilder.CreateSphere("stkLips", { diameter: 0.045, segments: 8 }, scene), lipM, root);
    lips.position.set(0, 1.55, 0.122); lips.scaling.set(1.35, 0.42, 0.45);

    // --- long flowing hair: a crown + a long back drape (its own node so it sways) ---
    const crown = add(MeshBuilder.CreateSphere("stkHairTop", { diameter: 0.29, segments: 12 }, scene), hairM, root);
    crown.position.set(0, 1.62, -0.02); crown.scaling.y = 0.92;
    // bangs/fringe across the forehead + side locks so the face is framed (less bare-headed)
    const bangs = add(MeshBuilder.CreateSphere("stkBangs", { diameter: 0.27, segments: 12 }, scene), hairM, root);
    bangs.position.set(0, 1.685, 0.05); bangs.scaling.set(1.02, 0.42, 0.7);
    for (const sx of [1, -1]) {
      const lock = add(MeshBuilder.CreateCapsule("stkLock" + sx, { radius: 0.045, height: 0.34, tessellation: 8 }, scene), hairM, root);
      lock.position.set(sx * 0.135, 1.5, 0.02);
    }
    const hairNode = new TransformNode("stkHairNode", scene);
    hairNode.parent = root; hairNode.position.set(0, 1.5, -0.12);
    this.hair = add(MeshBuilder.CreateBox("stkHairBack", { width: 0.26, height: 0.7, depth: 0.1 }, scene), hairM, hairNode);
    this.hair.position.set(0, -0.28, 0);

    // --- the chaser: a hi-vis marshal (reuses buildPerson), jogging behind ---
    this.chaser = buildPerson(scene, "streakChaser", {
      shirt: new Color3(0.95, 0.55, 0.05), pants: new Color3(0.13, 0.13, 0.16),
      skin: new Color3(0.7, 0.52, 0.4), hair: new Color3(0.1, 0.08, 0.06), hat: true, longHair: false,
    }, shadow);

    root.setEnabled(false);
    this.chaser.setEnabled(false);
  }

  private beginRun(): void {
    // Pick a straight (front s≈0 or back s≈half) and a random spot along it; cross from one side to
    // the other. The driver-stand cam follows the player, so most runs are caught near the action;
    // it always reads in the aerial view.
    const len = this.track.length;
    const onFront = Math.random() < 0.5;
    const s = (onFront ? 0 : len / 2) + (Math.random() - 0.5) * len * 0.18;
    const sm = this.track.sampleAt(((s % len) + len) % len);
    const W = this.track.def.width;
    const side = Math.random() < 0.5 ? 1 : -1; // start infield vs outfield
    const a = sm.pos.add(sm.outward.scale(-side * (W / 2 + 3.5)));
    const b = sm.pos.add(sm.outward.scale(side * (W / 2 + 3.5)));
    this.from.copyFrom(a); this.to.copyFrom(b);
    this.faceY = Math.atan2(b.x - a.x, b.z - a.z); // face the run direction
    this.t = 0;
    this.runDur = 2.4 + Math.random() * 0.6;
    this.state = "running";
    this.root.setEnabled(true);
    this.chaser.setEnabled(true);
  }

  update(dt: number): void {
    if (this.state === "waiting") {
      this.timer -= dt;
      if (this.timer <= 0) this.beginRun();
      return;
    }

    // running
    this.t += dt / this.runDur;
    this.phase += dt * 13;
    if (this.t >= 1) {
      this.state = "waiting";
      this.timer = 25 + Math.random() * 10; // loop: next dash in 25–35s
      this.root.setEnabled(false);
      this.chaser.setEnabled(false);
      return;
    }

    // her position across the track + a running bob
    const p = Vector3.Lerp(this.from, this.to, this.t);
    const bob = Math.abs(Math.sin(this.phase)) * 0.06 * FIG_SCALE;
    this.root.position.set(p.x, bob, p.z);
    this.root.rotation.y = this.faceY;

    // pump the legs/arms (opposite phase) for a sprint
    const legA = Math.sin(this.phase) * 0.85;
    this.hips[0].rotation.x = legA;
    this.hips[1].rotation.x = -legA;
    const armA = Math.sin(this.phase + Math.PI) * 0.7;
    this.shoulders[0].rotation.x = armA;
    this.shoulders[1].rotation.x = -armA;
    this.hair.rotation.x = -0.2 + Math.sin(this.phase * 0.5) * 0.12; // hair streams behind

    // the marshal chases a few steps behind, jogging
    const lag = Math.max(0, this.t - 0.16);
    const cp = Vector3.Lerp(this.from, this.to, lag);
    const cbob = Math.abs(Math.sin(this.phase * 0.9 + 1)) * 0.07 * FIG_SCALE;
    this.chaser.position.set(cp.x, cbob, cp.z);
    this.chaser.rotation.y = this.faceY;
  }
}
