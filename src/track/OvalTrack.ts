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
import logoUrl from "../assets/logo.png";

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
    this.buildInfield();
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
    dt.anisotropicFilteringLevel = 16; // banner wall is viewed at a grazing angle

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

  /**
   * The two racing lines: a darker, polished "blue groove" rubbered into the
   * bottom, and a lighter, drier CUSHION berm piled up near the outer wall. Both
   * hug the banking so they sit flush on the surface. (Grip on each evolves over
   * a race in SurfaceModel — bottom early, cushion late.)
   */
  private buildGroove() {
    const W = this.def.width;
    const band = (name: string, center: number, half: number, col: Color3, rough: number) => {
      const inner: Vector3[] = [];
      const outer: Vector3[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const sm = this.samples[i % SAMPLES];
        const lift = W * Math.tan(sm.bank); // surface rises linearly across the width on a bank
        const yAt = (lat: number) => lift * (0.5 + lat / W) + 0.02;
        const a = sm.pos.add(sm.outward.scale(center - half)); a.y = yAt(center - half);
        const b = sm.pos.add(sm.outward.scale(center + half)); b.y = yAt(center + half);
        inner.push(a); outer.push(b);
      }
      const ribbon = MeshBuilder.CreateRibbon(name, { pathArray: [inner, outer], closePath: true }, this.scene);
      const mat = new PBRMaterial(name + "Mat", this.scene);
      mat.albedoColor = col;
      mat.roughness = rough;
      mat.metallic = 0;
      mat.zOffset = -4; // sit cleanly on top of the track surface
      ribbon.material = mat;
      ribbon.receiveShadows = true;
      ribbon.isPickable = false;
      ribbon.freezeWorldMatrix();
    };
    // Lay CONTIGUOUS clay-toned bands across the FULL racing width (each abuts the
    // next, no overlap = no z-fighting on the flat straights) so no bare, pale
    // base surface shows as a gray strip. Inner apron -> rubbered bottom groove ->
    // dry-slick middle -> piled cushion -> loose marbles up against the wall.
    band("apron", -W * 0.42, W * 0.08, new Color3(0.30, 0.21, 0.14), 0.92);
    band("groove", -W * 0.17, W * 0.17, new Color3(0.17, 0.12, 0.1), 0.5); // rubbered, polished, dark
    band("slick", W * 0.1, W * 0.1, new Color3(0.40, 0.28, 0.19), 0.85); // dry-slick line
    band("cushion", W * 0.31, W * 0.11, new Color3(0.34, 0.24, 0.17), 0.9); // piled berm
    band("marbles", W * 0.46, W * 0.04, new Color3(0.44, 0.32, 0.22), 0.95); // loose marbles up top
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

    // packed red-clay racing surface (warm, saturated dirt — not gray concrete),
    // tied to this track's dirt colour with finer tiling so it reads as dirt
    const d = this.def.dirtColor;
    const clay = new Color3(d.r * 1.3, d.g * 0.85, d.b * 0.62); // warm, saturated red clay
    const mat = makeDirtPBR(this.scene, "trackMat", 4, Math.max(8, Math.round(this.length / 14)), clay);
    mat.roughness = 0.9;
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
    const mat = makeDirtPBR(this.scene, "infieldMat", 36, 36, this.def.dirtColor.scale(1.15));
    ground.material = mat;
    ground.receiveShadows = true;
    ground.isPickable = false;
    ground.freezeWorldMatrix();

    const body = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, this.scene);
    const shape = new PhysicsShapeMesh(ground, this.scene);
    shape.filterMembershipMask = GROUP_GROUND;
    body.shape = shape;
  }

  /**
   * Grassed infield filling the inside of the oval, with the speedway logo laid
   * flat and faded onto it so it reads as paint sprayed onto the surface.
   */
  private buildInfield() {
    const W = this.def.width;
    const R = this.def.cornerRadius;
    const y = -0.03; // just above the dirt base (-0.05), just below the track inner edge (~0)

    // Triangle-fan the inner-edge loop into a filled grass surface (the infield is convex).
    const positions: number[] = [0, y, 0];
    const uvs: number[] = [0.5, 0.5];
    const tile = 0.06;
    for (let i = 0; i < SAMPLES; i++) {
      const sm = this.samples[i];
      const p = sm.pos.add(sm.outward.scale(-W / 2 + 0.05)); // hold just inside the apron
      positions.push(p.x, y, p.z);
      uvs.push(0.5 + p.x * tile, 0.5 + p.z * tile);
    }
    const indices: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      indices.push(0, 1 + ((i + 1) % SAMPLES), 1 + i); // CW from above -> normal points up
    }
    const grass = new Mesh("infieldGrass", this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vd.normals = normals;
    vd.uvs = uvs;
    vd.applyToMesh(grass);
    const gmat = makeDirtPBR(this.scene, "infieldGrassMat", 26, 26, new Color3(0.34, 0.52, 0.22)); // mowed grass green
    gmat.roughness = 0.95;
    grass.material = gmat;
    grass.receiveShadows = true;
    grass.isPickable = false;
    grass.freezeWorldMatrix();

    // Logo "sprayed" onto the grass: matte, faded, alpha-blended, sitting on the surface.
    const logoMat = new PBRMaterial("infieldLogoMat", this.scene);
    const tex = new Texture(logoUrl, this.scene, false, false);
    tex.hasAlpha = true;
    tex.anisotropicFilteringLevel = 16;
    logoMat.albedoTexture = tex;
    logoMat.useAlphaFromAlbedoTexture = true;
    logoMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
    logoMat.alpha = 0.82; // weathered, painted-on
    logoMat.roughness = 1.0;
    logoMat.metallic = 0;
    logoMat.backFaceCulling = false;
    logoMat.zOffset = -8; // render on top of the grass without z-fighting

    const lw = Math.min((R - W / 2) * 1.5, 30); // fits inside the infield half-width
    const logo = MeshBuilder.CreatePlane("infieldLogo", { width: lw, height: lw / 2.85 }, this.scene);
    logo.rotation.x = -Math.PI / 2; // lay flat, image facing up (un-mirrored from above)
    logo.rotation.y = -Math.PI / 2; // run the wordmark along the straights, readable from the stand (flipped 180°)
    logo.position.set(0, y + 0.015, 0);
    logo.material = logoMat;
    logo.isPickable = false;
    logo.freezeWorldMatrix();
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
