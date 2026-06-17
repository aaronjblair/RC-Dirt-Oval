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
// How fast she runs her lap (units/s) — sets the lap duration as track.length / RUN_SPEED
// (a brisk run: a typical lap lands ~15–20 s).
const RUN_SPEED = 13;

function mat(scene: Scene, name: string, c: Color3, opts: { rough?: number; metallic?: number; emissive?: number } = {}): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c;
  m.roughness = opts.rough ?? 0.6;
  m.metallic = opts.metallic ?? 0;
  if (opts.emissive) m.emissiveColor = c.scale(opts.emissive);
  return m;
}

export interface StreakerFigure {
  root: TransformNode;
  hips: TransformNode[];      // leg pivots (run swing)
  shoulders: TransformNode[]; // arm pivots (run swing)
  hair: Mesh;                 // back drape (sways)
}

/**
 * Builds the tasteful low-poly bikini figure (clothed, swimwear only — no explicit anatomy), feet at
 * y=0, scaled to real-human size. Reused for the running streaker AND a look-alike on the stand
 * (different `hairColor`). `name` prefixes all meshes/materials so instances don't collide.
 */
export function buildStreakerFigure(scene: Scene, name: string, shadow: ShadowGenerator | null, hairColor?: Color3): StreakerFigure {
  const skinC = new Color3(0.95, 0.77, 0.66);
  const biC = new Color3(0.99, 0.86, 0.74);   // light tan — a touch BRIGHTER than her skin (reads as swimwear)
  const hairC = hairColor ?? new Color3(0.30, 0.17, 0.07); // glossy brunette by default
  // gentle, uniform emissive so the whole skin (face + body) reads as ONE tone — not a bright "mask"
  const skin = mat(scene, name + "Skin", skinC, { rough: 0.5, emissive: 0.06 });
  const bikini = mat(scene, name + "Bikini", biC, { rough: 0.5, emissive: 0.09 });
  const hairM = mat(scene, name + "Hair", hairC, { rough: 0.45 });
  const eyeW = mat(scene, name + "EyeW", new Color3(0.93, 0.93, 0.95), { rough: 0.4, emissive: 0.04 });
  const pupilM = mat(scene, name + "Pupil", new Color3(0.06, 0.05, 0.09), { rough: 0.3 });
  const lipM = mat(scene, name + "Lip", new Color3(0.82, 0.25, 0.34), { rough: 0.4, emissive: 0.05 });

  const root = new TransformNode(name, scene);
  root.scaling.setAll(FIG_SCALE);
  const hips: TransformNode[] = [];
  const shoulders: TransformNode[] = [];

  const add = (m: Mesh, material: PBRMaterial, parent: TransformNode = root): Mesh => {
    m.material = material; m.parent = parent; m.isPickable = false;
    if (shadow) shadow.addShadowCaster(m); m.receiveShadows = true;
    return m;
  };

  // --- legs on hip pivots (swing for the run) ---
  for (const sx of [1, -1]) {
    const hip = new TransformNode(name + "Hip" + sx, scene);
    hip.parent = root; hip.position.set(sx * 0.1, 0.74, 0);
    add(MeshBuilder.CreateCylinder(name + "Leg" + sx, { diameter: 0.13, height: 0.74, tessellation: 8 }, scene), skin, hip).position.set(0, -0.37, 0);
    add(MeshBuilder.CreateSphere(name + "Foot" + sx, { diameter: 0.16, segments: 6 }, scene), skin, hip).position.set(0, -0.72, 0.04);
    hips.push(hip);
  }

  // --- bikini bottom: a thin hip band + small front panel + side ties (briefer than shorts) ---
  add(MeshBuilder.CreateCylinder(name + "Hipband", { diameterTop: 0.30, diameterBottom: 0.33, height: 0.12, tessellation: 14 }, scene), bikini)
    .position.set(0, 0.9, 0);
  const front = add(MeshBuilder.CreateSphere(name + "Front", { diameter: 0.22, segments: 10 }, scene), bikini);
  front.position.set(0, 0.82, 0.1); front.scaling.set(1, 0.95, 0.42);
  for (const sx of [1, -1]) {
    add(MeshBuilder.CreateSphere(name + "Tie" + sx, { diameter: 0.06, segments: 6 }, scene), bikini).position.set(sx * 0.15, 0.93, 0);
  }
  // dark-gray downward-pointing triangle on the front of the bikini bottom (a 3-sided cone, apex down)
  const triM = mat(scene, name + "Tri", new Color3(0.20, 0.21, 0.23), { rough: 0.6 });
  const tri = add(MeshBuilder.CreateCylinder(name + "Tri", { diameterTop: 0.16, diameterBottom: 0, height: 0.18, tessellation: 3 }, scene), triM);
  tri.position.set(0, 0.84, 0.14); tri.rotation.x = -0.18; // apex points DOWN, tilted to hug the front

  // --- torso (skin), narrowed at the waist ---
  add(MeshBuilder.CreateCapsule(name + "Torso", { radius: 0.155, height: 0.46, tessellation: 12 }, scene), skin).position.set(0, 1.14, 0);

  // --- bust + ROUNDED bikini-top cups + a thin strap ---
  for (const sx of [1, -1]) {
    add(MeshBuilder.CreateSphere(name + "Bust" + sx, { diameter: 0.15, segments: 8 }, scene), skin).position.set(sx * 0.075, 1.2, 0.08);
    const cup = add(MeshBuilder.CreateSphere(name + "Cup" + sx, { diameter: 0.175, segments: 10 }, scene), bikini);
    cup.position.set(sx * 0.078, 1.2, 0.075); cup.scaling.set(1, 1, 0.9);
  }
  add(MeshBuilder.CreateBox(name + "Strap", { width: 0.34, height: 0.045, depth: 0.18 }, scene), bikini).position.set(0, 1.205, 0.01);

  // --- arms on shoulder pivots (swing for the run) ---
  for (const sx of [1, -1]) {
    const sh = new TransformNode(name + "Sh" + sx, scene);
    sh.parent = root; sh.position.set(sx * 0.21, 1.34, 0);
    add(MeshBuilder.CreateCylinder(name + "Arm" + sx, { diameter: 0.09, height: 0.52, tessellation: 8 }, scene), skin, sh).position.set(0, -0.26, 0);
    shoulders.push(sh);
  }

  // --- neck + head ---
  add(MeshBuilder.CreateCylinder(name + "Neck", { diameter: 0.09, height: 0.12, tessellation: 8 }, scene), skin, root).position.set(0, 1.46, 0);
  add(MeshBuilder.CreateSphere(name + "Head", { diameter: 0.25, segments: 14 }, scene), skin, root).position.set(0, 1.59, 0);
  // a pretty human face on the front (+z): slim almond eyes, brows, a little nose, soft lips
  for (const sx of [1, -1]) {
    const eye = add(MeshBuilder.CreateSphere(name + "Eye" + sx, { diameter: 0.045, segments: 10 }, scene), eyeW, root);
    eye.position.set(sx * 0.045, 1.614, 0.113); eye.scaling.set(1.35, 0.62, 0.5);
    add(MeshBuilder.CreateSphere(name + "Pup" + sx, { diameter: 0.02, segments: 8 }, scene), pupilM, root).position.set(sx * 0.045, 1.612, 0.127);
    const brow = add(MeshBuilder.CreateBox(name + "Brow" + sx, { width: 0.052, height: 0.011, depth: 0.02 }, scene), hairM, root);
    brow.position.set(sx * 0.045, 1.648, 0.116); brow.rotation.z = sx * 0.1;
  }
  add(MeshBuilder.CreateSphere(name + "Nose", { diameter: 0.028, segments: 6 }, scene), skin, root).position.set(0, 1.585, 0.132);
  const lips = add(MeshBuilder.CreateSphere(name + "Lips", { diameter: 0.045, segments: 8 }, scene), lipM, root);
  lips.position.set(0, 1.55, 0.122); lips.scaling.set(1.35, 0.42, 0.45);

  // --- long flowing hair: crown + bangs + side locks + a long back drape (its own node so it sways) ---
  const crown = add(MeshBuilder.CreateSphere(name + "HairTop", { diameter: 0.29, segments: 12 }, scene), hairM, root);
  crown.position.set(0, 1.62, -0.02); crown.scaling.y = 0.92;
  const bangs = add(MeshBuilder.CreateSphere(name + "Bangs", { diameter: 0.27, segments: 12 }, scene), hairM, root);
  bangs.position.set(0, 1.685, 0.05); bangs.scaling.set(1.02, 0.42, 0.7);
  for (const sx of [1, -1]) {
    add(MeshBuilder.CreateCapsule(name + "Lock" + sx, { radius: 0.045, height: 0.34, tessellation: 8 }, scene), hairM, root).position.set(sx * 0.135, 1.5, 0.02);
  }
  const hairNode = new TransformNode(name + "HairNode", scene);
  hairNode.parent = root; hairNode.position.set(0, 1.5, -0.12);
  const hair = add(MeshBuilder.CreateBox(name + "HairBack", { width: 0.26, height: 0.7, depth: 0.1 }, scene), hairM, hairNode);
  hair.position.set(0, -0.28, 0);

  return { root, hips, shoulders, hair };
}

/**
 * Easter egg (undocumented): if the player's driver name is "Streaker Lady", a tasteful, fully-clothed
 * low-poly woman in a bikini periodically sprints across a straight while a hi-vis marshal gives chase
 * — the classic broadcast "streaker" gag, played for laughs. Built/updated like FlagGirl from main.ts.
 */
export class Streaker {
  private root: TransformNode;
  private chaser: TransformNode;
  private hips: TransformNode[];
  private shoulders: TransformNode[];
  private hair: Mesh;

  private state: "waiting" | "waving" | "running" = "waiting";
  private timer = 6;
  private t = 0;
  private phase = 0;
  private lapStart = 0; // arc-length where the current lap began
  private faceY = 0;
  private runDur = 2.6;
  private waveT = 0;
  private photoLock = false; // ?streakcam: hold the infield wave pose for previews

  constructor(scene: Scene, private track: OvalTrack, shadow: ShadowGenerator | null) {
    const fig = buildStreakerFigure(scene, "streaker", shadow);
    this.root = fig.root;
    this.hips = fig.hips;
    this.shoulders = fig.shoulders;
    this.hair = fig.hair;

    // --- the chaser: a hi-vis marshal (reuses buildPerson), jogging behind ---
    this.chaser = buildPerson(scene, "streakChaser", {
      shirt: new Color3(0.95, 0.55, 0.05), pants: new Color3(0.13, 0.13, 0.16),
      skin: new Color3(0.7, 0.52, 0.4), hair: new Color3(0.1, 0.08, 0.06), hat: true, longHair: false,
    }, shadow);

    this.root.setEnabled(false);
    this.chaser.setEnabled(false);
  }

  /** Run a FULL LAP around the oval (the marshal chasing the whole way), then back to waiting. */
  private beginRun(): void {
    this.lapStart = Math.random() * this.track.length; // start anywhere on the oval
    this.t = 0;
    this.runDur = this.track.length / RUN_SPEED;        // brisk, constant pace on any track
    this.shoulders[0].rotation.z = 0;                   // clear any wave abduction
    this.state = "running";
    this.root.setEnabled(true);
    this.chaser.setEnabled(true);
  }

  /** Stand in the MIDDLE OF THE INFIELD and wave toward the stand/cameras, then dash across. */
  private beginWave(): void {
    this.root.position.set(0, 0, 0);   // infield centre
    this.faceY = Math.PI / 2;          // face +x (toward the front straight / stand / cameras)
    this.root.rotation.y = this.faceY;
    this.hips[0].rotation.x = 0; this.hips[1].rotation.x = 0;
    this.shoulders[1].rotation.x = 0;
    this.waveT = 0; this.phase = 0;
    this.state = "waving";
    this.root.setEnabled(true);
    this.chaser.setEnabled(false);     // no chaser during the infield wave
  }

  private updateWave(dt: number): void {
    this.waveT += dt;
    this.phase += dt * 6;
    // right arm raised overhead, waving side to side
    this.shoulders[0].rotation.x = -2.5;
    this.shoulders[0].rotation.z = 0.5 + Math.sin(this.phase) * 0.5;
    this.hair.rotation.x = -0.1 + Math.sin(this.phase * 0.4) * 0.05;
    if (!this.photoLock && this.waveT >= 3.5) this.beginRun(); // then run across the track
  }

  /** Freeze her into the infield wave pose (for the hidden ?streakcam preview). Returns her
   *  approximate chest position so a camera can frame her. */
  poseForPhoto(): Vector3 {
    this.photoLock = true;
    this.beginWave();
    this.updateWave(0.4);
    return new Vector3(0, 1.6 * FIG_SCALE, 0);
  }

  update(dt: number): void {
    if (this.state === "waiting") {
      this.timer -= dt;
      if (this.timer <= 0) { if (Math.random() < 0.5) this.beginWave(); else this.beginRun(); }
      return;
    }
    if (this.state === "waving") { this.updateWave(dt); return; }

    this.t += dt / this.runDur;
    this.phase += dt * 13;
    if (this.t >= 1) {
      this.state = "waiting";
      this.timer = 25 + Math.random() * 10; // loop: next lap in 25–35s
      this.root.setEnabled(false);
      this.chaser.setEnabled(false);
      return;
    }

    // Run a full lap: drive arc-length s around the centerline, on the inner (bottom) groove.
    const len = this.track.length;
    const groove = -this.track.def.width * 0.15; // just inside the centerline
    const s = (this.lapStart + this.t * len) % len;
    const sm = this.track.sampleAt(s);
    const bob = Math.abs(Math.sin(this.phase)) * 0.06 * FIG_SCALE;
    this.root.position.set(sm.pos.x + sm.outward.x * groove, sm.pos.y + bob, sm.pos.z + sm.outward.z * groove);
    this.root.rotation.y = Math.atan2(sm.tangent.x, sm.tangent.z); // face the way she's running

    const legA = Math.sin(this.phase) * 0.85;
    this.hips[0].rotation.x = legA;
    this.hips[1].rotation.x = -legA;
    const armA = Math.sin(this.phase + Math.PI) * 0.7;
    this.shoulders[0].rotation.x = armA;
    this.shoulders[1].rotation.x = -armA;
    this.hair.rotation.x = -0.2 + Math.sin(this.phase * 0.5) * 0.12;

    // the marshal a few units back along the track, chasing the whole lap
    const sc = (((s - 3.5) % len) + len) % len;
    const cm = this.track.sampleAt(sc);
    const cbob = Math.abs(Math.sin(this.phase * 0.9 + 1)) * 0.07 * FIG_SCALE;
    this.chaser.position.set(cm.pos.x + cm.outward.x * groove, cm.pos.y + cbob, cm.pos.z + cm.outward.z * groove);
    this.chaser.rotation.y = Math.atan2(cm.tangent.x, cm.tangent.z);
  }
}
