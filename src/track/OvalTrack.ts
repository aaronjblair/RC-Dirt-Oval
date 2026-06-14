import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeMesh } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { makeDirtPBR } from "../core/Textures";
import { GROUP_GROUND } from "../physics/RaycastVehicle";
import type { TrackDef } from "./TrackDef";

export interface TrackSample {
  pos: Vector3; // centerline (y=0 base)
  tangent: Vector3; // unit travel direction
  outward: Vector3; // unit horizontal, toward outer wall
  bank: number;
}

export interface TrackProjection {
  s: number; // distance along centerline
  lateral: number; // signed offset from centerline (+ = outward)
  center: Vector3;
  tangent: Vector3;
  outward: Vector3;
  bank: number;
}

const SAMPLES = 480;

/**
 * Procedural banked dirt oval (stadium shape: two straights + two 180° turns,
 * counter-clockwise / left-turn). Builds the driving surface (with collision),
 * infield/outfield, retaining walls, and start/finish, plus centerline helpers
 * for lap timing, AI and the camera.
 */
export class OvalTrack {
  readonly def: TrackDef;
  readonly length: number;
  readonly surface: Mesh;
  private samples: TrackSample[] = [];

  constructor(
    private scene: Scene,
    plugin: HavokPlugin,
    shadow: ShadowGenerator | null,
    def: TrackDef
  ) {
    this.def = def;
    const R = def.cornerRadius;
    const L = def.straightLength;
    this.length = 2 * L + 2 * Math.PI * R;

    void plugin;
    this.buildSamples();
    this.surface = this.buildSurface();
    this.buildInfieldOutfield(shadow);
    this.buildWalls(shadow);
    this.buildStartFinish();
    this.buildGroove();
    this.buildBanners();
  }

  /** Trackside sponsor banners on the outer fence. */
  private buildBanners() {
    const W = this.def.width;
    const dt = new DynamicTexture("bannerTex", { width: 1024, height: 128 }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const names = ["RCSPRINT", "LOSI", "HOOSIER", "DIRT NATION", "22S", "SPEKTRUM", "TLR", "CLAY CO"];
    const cols = ["#c0392b", "#2471a3", "#f1c40f", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#2c3e50"];
    const bw = 1024 / names.length;
    for (let i = 0; i < names.length; i++) {
      ctx.fillStyle = cols[i]; ctx.fillRect(i * bw, 0, bw, 128);
      ctx.fillStyle = "#fff"; ctx.font = "bold 40px Arial Black, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(names[i], i * bw + bw / 2, 70);
    }
    dt.update();
    dt.wrapU = Texture.WRAP_ADDRESSMODE;
    dt.uScale = Math.round(this.length / 9);

    const path: Vector3[][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const sm = this.samples[i % SAMPLES];
      const base = sm.pos.add(sm.outward.scale(W / 2 + 0.5)); base.y = 0.8;
      const top = base.add(new Vector3(0, 0.95, 0));
      path.push([base, top]);
    }
    const banner = MeshBuilder.CreateRibbon("banners", { pathArray: path, closeArray: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    const mat = new PBRMaterial("bannerMat", this.scene);
    mat.albedoTexture = dt;
    mat.emissiveTexture = dt; mat.emissiveColor = new Color3(0.25, 0.25, 0.25);
    mat.roughness = 0.7; mat.metallic = 0;
    banner.material = mat;
    banner.isPickable = false;
    banner.freezeWorldMatrix();
  }

  /** A darker, polished "blue groove" band rubbered into the racing line. */
  private buildGroove() {
    const W = this.def.width;
    const center = -W * 0.08;
    const half = W * 0.28;
    const inner: Vector3[] = [];
    const outer: Vector3[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const sm = this.samples[i % SAMPLES];
      const a = sm.pos.add(sm.outward.scale(center - half)); a.y = 0.02;
      const b = sm.pos.add(sm.outward.scale(center + half)); b.y = 0.02;
      inner.push(a); outer.push(b);
    }
    const groove = MeshBuilder.CreateRibbon("groove", { pathArray: [inner, outer], closePath: true }, this.scene);
    const mat = new PBRMaterial("grooveMat", this.scene);
    mat.albedoColor = new Color3(0.16, 0.12, 0.1);
    mat.roughness = 0.5; // polished/rubbered-in vs the dusty track
    mat.metallic = 0;
    mat.zOffset = -4; // sit cleanly on top of the track surface
    groove.material = mat;
    groove.receiveShadows = true;
    groove.isPickable = false;
    groove.freezeWorldMatrix();
  }

  // --- centerline walk ---
  private pointAt(s: number): TrackSample {
    const R = this.def.cornerRadius;
    const L = this.def.straightLength;
    const half = L / 2;
    const turn = Math.PI * R;
    let pos: Vector3, tangent: Vector3, outward: Vector3, inTurn = false;

    if (s < half) {
      pos = new Vector3(R, 0, s);
      tangent = new Vector3(0, 0, 1);
      outward = new Vector3(1, 0, 0);
    } else if (s < half + turn) {
      const t = (s - half) / R; // 0..π
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
    return { pos, tangent, outward, bank: inTurn ? this.def.banking : 0 };
  }

  private buildSamples() {
    for (let i = 0; i < SAMPLES; i++) {
      this.samples.push(this.pointAt((i / SAMPLES) * this.length));
    }
    // smooth banking across turn entry/exit for a continuous surface
    const bank = this.samples.map((s) => s.bank);
    for (let pass = 0; pass < 8; pass++) {
      const next = bank.slice();
      for (let i = 0; i < SAMPLES; i++) {
        const a = bank[(i - 1 + SAMPLES) % SAMPLES];
        const b = bank[(i + 1) % SAMPLES];
        next[i] = (a + bank[i] * 2 + b) / 4;
      }
      for (let i = 0; i < SAMPLES; i++) bank[i] = next[i];
    }
    this.samples.forEach((s, i) => (s.bank = bank[i]));
  }

  // --- driving surface mesh + collision ---
  private buildSurface(): Mesh {
    const W = this.def.width;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      const sm = this.samples[i];
      const lift = W * Math.tan(sm.bank);
      const inner = sm.pos.add(sm.outward.scale(-W / 2));
      const outer = sm.pos.add(sm.outward.scale(W / 2));
      outer.y = lift;
      positions.push(inner.x, inner.y, inner.z);
      positions.push(outer.x, outer.y, outer.z);
      const v = (i / SAMPLES) * (this.length / 6);
      uvs.push(0, v, 1, v);
    }
    for (let i = 0; i < SAMPLES; i++) {
      const n = (i + 1) % SAMPLES;
      const a = i * 2, b = i * 2 + 1, c = n * 2, d = n * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }

    const mesh = new Mesh("trackSurface", this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vd.normals = normals;
    vd.uvs = uvs;
    vd.applyToMesh(mesh);

    // packed, darker, rubbered-in racing surface
    const mat = makeDirtPBR(this.scene, "trackMat", 3, Math.max(8, Math.round(this.length / 9)), new Color3(0.5, 0.32, 0.22));
    mat.roughness = 0.8;
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();

    const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, this.scene);
    const shape = new PhysicsShapeMesh(mesh, this.scene);
    shape.material = { friction: 0.9, restitution: 0.02 };
    shape.filterMembershipMask = GROUP_GROUND;
    body.shape = shape;
    return mesh;
  }

  private buildInfieldOutfield(shadow: ShadowGenerator | null) {
    void shadow;
    const ground = MeshBuilder.CreateGround("infield", { width: 400, height: 400, subdivisions: 4 }, this.scene);
    ground.position.y = -0.05;
    // reddish clay infield/outfield, tinted from the track's dirt color
    const mat = makeDirtPBR(this.scene, "infieldMat", 90, 90, this.def.dirtColor.scale(1.15));
    ground.material = mat;
    ground.receiveShadows = true;
    ground.isPickable = false;
    ground.freezeWorldMatrix();

    const body = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, this.scene);
    const shape = new PhysicsShapeMesh(ground, this.scene);
    shape.filterMembershipMask = GROUP_GROUND;
    body.shape = shape;
  }

  private buildWalls(shadow: ShadowGenerator | null) {
    const W = this.def.width;
    const wallMat = new PBRMaterial("wallMat", this.scene);
    wallMat.albedoColor = new Color3(0.82, 0.82, 0.85);
    wallMat.roughness = 0.6;
    wallMat.metallic = 0;
    const fenceMat = new PBRMaterial("fenceMat", this.scene);
    fenceMat.albedoColor = new Color3(0.5, 0.5, 0.55);
    fenceMat.alpha = 0.25;
    fenceMat.roughness = 0.4;

    const makeRibbon = (offset: number, height: number, mat: PBRMaterial, yBase: number) => {
      const path: Vector3[][] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const sm = this.samples[i % SAMPLES];
        const lift = sm.bank > 0 ? W * Math.tan(sm.bank) * (offset > 0 ? 1 : 0) : 0;
        const base = sm.pos.add(sm.outward.scale(offset));
        base.y = yBase + lift;
        const top = base.add(new Vector3(0, height, 0));
        path.push([base, top]);
      }
      const ribbon = MeshBuilder.CreateRibbon("wall", { pathArray: path, closeArray: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
      ribbon.material = mat;
      ribbon.receiveShadows = true;
      ribbon.isPickable = false;
      ribbon.freezeWorldMatrix();
      if (shadow) shadow.addShadowCaster(ribbon);
      return ribbon;
    };

    makeRibbon(W / 2 + 0.4, 0.7, wallMat, 0); // outer wall
    makeRibbon(W / 2 + 0.45, 2.6, fenceMat, 0.7); // catch fence above outer wall
    makeRibbon(-W / 2 - 0.4, 0.5, wallMat, 0); // inner wall
  }

  private buildStartFinish() {
    const W = this.def.width;
    // start/finish line painted across the front straight at s=0 ((R,0))
    const line = MeshBuilder.CreateBox("sfLine", { width: W, height: 0.02, depth: 1.2 }, this.scene);
    const sm = this.samples[0];
    line.position = sm.pos.clone();
    line.position.y = 0.03;
    line.rotation.y = Math.atan2(sm.tangent.x, sm.tangent.z);
    const mat = new PBRMaterial("sfMat", this.scene);
    mat.albedoColor = new Color3(0.95, 0.95, 0.95);
    mat.roughness = 0.5;
    line.material = mat;
    line.isPickable = false;
    line.freezeWorldMatrix();
  }

  /** Nearest-centerline projection for laps/AI/camera. */
  project(point: Vector3): TrackProjection {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const dx = this.samples[i].pos.x - point.x;
      const dz = this.samples[i].pos.z - point.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    const sm = this.samples[best];
    const lateral = Vector3.Dot(point.subtract(sm.pos), sm.outward);
    return { s: (best / SAMPLES) * this.length, lateral, center: sm.pos, tangent: sm.tangent, outward: sm.outward, bank: sm.bank };
  }

  /** Down-sampled centerline (x,z) for the minimap. */
  outline(step = 6): { x: number; z: number }[] {
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < SAMPLES; i += step) pts.push({ x: this.samples[i].pos.x, z: this.samples[i].pos.z });
    return pts;
  }

  sampleAt(s: number): TrackSample {
    const i = Math.floor(((s % this.length) / this.length) * SAMPLES + SAMPLES) % SAMPLES;
    return this.samples[i];
  }

  /** Grid start position for car index (staggered double-file behind s=0). */
  gridPose(index: number): { pos: Vector3; yaw: number } {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const s = (this.length - 6 - row * 4) % this.length;
    const sm = this.sampleAt(s);
    const lateralOff = col === 0 ? -this.def.width * 0.22 : this.def.width * 0.22;
    const pos = sm.pos.add(sm.outward.scale(lateralOff));
    pos.y = 0.6;
    const yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
    return { pos, yaw };
  }
}
