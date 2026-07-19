import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import "@babylonjs/core/Meshes/Builders/latheBuilder";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { RaycastVehicle, DEFAULT_CONFIG, type WheelDef, type VehicleConfig } from "../physics/RaycastVehicle";
import { cloneConfig } from "./CarSetup";

export interface CarOptions {
  color?: Color3;
  number?: number | string; // car number — strings allowed for letter numbers (the "11X")
  spawn?: Vector3;
  yaw?: number;
  name?: string; // driver/livery name lettered on the wing deck + body sides
  logoUrl?: string; // image decal placed on the wing deck + body sides (overrides the lettered name)
  logoAspect?: number; // logo width / height (for sizing the decal plane)
  redOutlineNumber?: boolean; // special AI livery: render side + wing-top numbers as RED glyphs with a BLACK outline (overrides the luminance-contrast wing-top number). Set on the #42 car.
  config?: VehicleConfig; // class physics baseline (cloned per car); defaults to the sprint config
}

export interface BuiltCar {
  root: Mesh;
  vehicle: RaycastVehicle;
  wheels: TransformNode[];
  bodyParts: Mesh[];
}

export const rgb = (c: Color3) => `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;

/** Perceived (Rec. 709) relative luminance of a body colour, 0 (black) … 1 (white). */
export const luminance = (c: Color3) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Fine metalflake normal map (procedural): a tileable field of randomized micro-facet
 *  normals so the clear-coated paint sparkles like real metal-flake RC bodywork. */
export function flakeNormal(scene: Scene): Texture {
  const S = 256;
  const dt = new DynamicTexture("flake", { width: S, height: S }, scene, false);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 128 + (Math.random() * 2 - 1) * 46;     // nx jitter
    img.data[i + 1] = 128 + (Math.random() * 2 - 1) * 46; // ny jitter
    img.data[i + 2] = 255;                                 // nz mostly up
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  dt.update();
  dt.wrapU = Texture.WRAP_ADDRESSMODE; dt.wrapV = Texture.WRAP_ADDRESSMODE;
  dt.uScale = 9; dt.vScale = 9; // tile small so the flake is fine
  return dt;
}

export function paintMat(scene: Scene, name: string, color: Color3, flake?: Texture): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color;
  // Real 1:10 bodies are Lexan painted from the INSIDE — the outer shell is glass-smooth,
  // so the base paint sits glossy (low roughness) under a near-mirror clearcoat. This
  // "liquid" uniform gloss is THE defining RC-scale look (no orange peel, no brush texture).
  m.metallic = 0.04; // keep low so the colour stays vibrant (high metallic muddies coloured paint)
  m.roughness = 0.19;
  if (flake) { m.bumpTexture = flake; m.bumpTexture.level = 0.18; } // faint flake sparkle only
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 1.0;
  m.clearCoat.roughness = 0.045;
  m.enableSpecularAntiAliasing = true; // stop the glossy coat shimmering/sparkling as the car moves
  return m;
}
export function flatMat(scene: Scene, name: string, color: Color3, rough: number, metal: number): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color; m.roughness = rough; m.metallic = metal;
  return m;
}

export type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Build a clear-coated decal panel material from a canvas drawing. `mirror` flips
 *  it horizontally so lettering reads correctly on the car's opposite side. */
export function decalMat(scene: Scene, name: string, w: number, h: number, draw: Draw, mirror = false, alpha = false): PBRMaterial {
  const dt = new DynamicTexture(name, { width: w, height: h }, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  draw(ctx, w, h);
  dt.update();
  if (alpha) dt.hasAlpha = true;
  const m = new PBRMaterial(name + "M", scene);
  m.albedoTexture = dt;
  m.roughness = 0.3; m.metallic = 0.0;
  if (alpha) { m.useAlphaFromAlbedoTexture = true; m.transparencyMode = PBRMaterial.MATERIAL_ALPHATEST; }
  else { m.clearCoat.isEnabled = true; m.clearCoat.intensity = 0.85; m.clearCoat.roughness = 0.08; }
  return m;
}

/** A transparent image decal (e.g. a driver's logo sticker) as a clear-coated material. */
export function imageDecalMat(scene: Scene, name: string, url: string): PBRMaterial {
  const tex = new Texture(url, scene, false, true); // invertY=true: PNG → Babylon UV
  tex.hasAlpha = true;
  tex.anisotropicFilteringLevel = 16;
  const m = new PBRMaterial(name + "M", scene);
  m.albedoTexture = tex;
  m.useAlphaFromAlbedoTexture = true;
  m.transparencyMode = PBRMaterial.MATERIAL_ALPHATEST; // crisp sticker edge, no sort issues
  m.roughness = 0.32; m.metallic = 0.0;
  m.emissiveTexture = tex; m.emissiveColor = new Color3(0.16, 0.16, 0.16); // a little pop so it reads
  m.backFaceCulling = false;
  m.clearCoat.isEnabled = true; m.clearCoat.intensity = 0.7; m.clearCoat.roughness = 0.1;
  return m;
}

/** Body side livery: car-color base, black lower swoosh, white lightning streak,
 *  numbered roundel and "RACE INSPIRED" — the Losi 22S graphic language. */
function liverySideDraw(color: Color3, num: number | string, name?: string): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h);
    // black lower wedge
    ctx.fillStyle = "#0b0b0d";
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(w, h * 0.42); ctx.lineTo(0, h * 0.78); ctx.closePath(); ctx.fill();
    // white lightning streak
    ctx.fillStyle = "#f4f4f6";
    ctx.beginPath();
    ctx.moveTo(w * 0.30, h * 0.06); ctx.lineTo(w * 0.56, h * 0.06); ctx.lineTo(w * 0.40, h * 0.40);
    ctx.lineTo(w * 0.55, h * 0.40); ctx.lineTo(w * 0.20, h * 0.96); ctx.lineTo(w * 0.34, h * 0.46);
    ctx.lineTo(w * 0.20, h * 0.46); ctx.closePath(); ctx.fill();
    // numbered roundel
    const cx = w * 0.80, cy = h * 0.40, r = h * 0.30;
    ctx.fillStyle = "#0b0b0d"; ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0b0b0d"; ctx.font = `bold ${r * 1.5}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(num), cx, cy + 2);
    // driver name (a tribute when set) or the stock "RACE INSPIRED"
    const label = name ? name.toUpperCase() : "RACE INSPIRED";
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * (name ? 0.17 : 0.12)}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(label, w - 12, h - 10);
  };
}

/** Small "Super Jay" script for the cockpit side of the tribute car (transparent bg). */
function superJayTagDraw(): Draw {
  return (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `italic bold ${h * 0.62}px "Arial", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = h * 0.1; ctx.strokeStyle = "#0b0b0d"; ctx.lineJoin = "round";
    ctx.strokeText("Super Jay", w / 2, h / 2);
    ctx.fillStyle = "#f4f4f6"; ctx.fillText("Super Jay", w / 2, h / 2);
  };
}

/** Wing side plate (dive plate): black with a color band, "SPRINT" + big number.
 *  `redOutline`: draw the big number as RED glyphs with a BLACK outline (the #42 livery). */
function wingSideDraw(color: Color3, num: number | string, redOutline = false): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h * 0.16);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * 0.20}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("SPRINT", w * 0.06, h * 0.20);
    ctx.font = `bold ${h * 0.62}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    if (redOutline) {
      ctx.lineWidth = h * 0.05; ctx.strokeStyle = "#0b0b0d"; ctx.lineJoin = "round";
      ctx.strokeText(String(num), w * 0.96, h * 0.62);
      ctx.fillStyle = "#d21414"; ctx.fillText(String(num), w * 0.96, h * 0.62);
    } else {
      ctx.fillText(String(num), w * 0.96, h * 0.62);
    }
  };
}

/** Wing-TOP number, drawn on a TRANSPARENT canvas (the wing paint shows through) so it
 *  reads as a painted-on number from the driver-stand POV. The glyph fills ~75% of the
 *  deck height. Colour: a luminance-contrasting black/white against the body colour, or
 *  — when `redOutline` is set — RED glyphs with a BLACK outline (overrides the contrast). */
function wingTopNumberDraw(color: Color3, num: number | string, redOutline = false): Draw {
  return (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); // transparent — wing paint reads through
    ctx.font = `bold ${h * 0.75}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (redOutline) {
      ctx.lineWidth = h * 0.06; ctx.strokeStyle = "#0b0b0d"; ctx.lineJoin = "round";
      ctx.strokeText(String(num), w * 0.5, h * 0.52);
      ctx.fillStyle = "#d21414"; ctx.fillText(String(num), w * 0.5, h * 0.52);
    } else {
      // dark glyph on light bodies, light glyph on dark bodies, with a faint contrasting outline
      const dark = luminance(color) > 0.5;
      ctx.lineWidth = h * 0.04; ctx.lineJoin = "round";
      ctx.strokeStyle = dark ? "#f4f4f6" : "#0b0b0d";
      ctx.strokeText(String(num), w * 0.5, h * 0.52);
      ctx.fillStyle = dark ? "#0b0b0d" : "#f4f4f6";
      ctx.fillText(String(num), w * 0.5, h * 0.52);
    }
  };
}

/** Wing top deck: black with a center color chord stripe and the car's name (the
 *  most visible surface from the driver-stand view, so the tribute reads here). */
function wingDeckDraw(color: Color3, label = "SUPER JAY RC"): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(color); ctx.fillRect(0, h * 0.34, w, h * 0.32);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * 0.22}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // black outline so the name pops against the colour stripe
    ctx.lineWidth = h * 0.03; ctx.strokeStyle = "#0b0b0d"; ctx.lineJoin = "round";
    ctx.strokeText(label.toUpperCase(), w * 0.5, h * 0.52);
    ctx.fillText(label.toUpperCase(), w * 0.5, h * 0.52);
  };
}

/** Real Hoosier dirt-tire sidewall: black rubber with mold ribs, raised "HOOSIER"
 *  arc up top + gold size line below, and a punched-out center so the rim shows. */
export function sidewallDraw(): Draw {
  return (ctx, w) => {
    const cx = w / 2, cy = w / 2;
    // black rubber face
    ctx.fillStyle = "#0c0c0d"; ctx.beginPath(); ctx.arc(cx, cy, w * 0.5, 0, Math.PI * 2); ctx.fill();
    // faint concentric mold ribs for depth
    ctx.strokeStyle = "rgba(255,255,255,0.045)"; ctx.lineWidth = w * 0.006;
    for (const fr of [0.47, 0.43, 0.355]) { ctx.beginPath(); ctx.arc(cx, cy, w * fr, 0, Math.PI * 2); ctx.stroke(); }
    // raised-letter shading: draw a dark drop first, then the light face
    const curved = (text: string, base: number, flip: boolean, rad: number, size: number, color: string) => {
      ctx.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const step = (size * 0.95) / rad;
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? "rgba(0,0,0,0.6)" : color;
        const off = pass === 0 ? size * 0.04 : 0;
        for (let i = 0; i < text.length; i++) {
          const a = base + (i - (text.length - 1) / 2) * step * (flip ? -1 : 1);
          ctx.save();
          ctx.translate(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad + off);
          ctx.rotate(a + (flip ? -Math.PI / 2 : Math.PI / 2));
          ctx.fillText(text[i], 0, 0);
          ctx.restore();
        }
      }
    };
    curved("HOOSIER", -Math.PI / 2, false, w * 0.40, w * 0.105, "#ece9df");
    curved("DIRT 2.2", Math.PI / 2, true, w * 0.40, w * 0.066, "#d7b23a");
    // punch transparent center so the chrome dish shows through
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.285, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  };
}

/** A proper RC dirt tire: rounded-shoulder carcass revolved from a cross-section,
 *  lettered Hoosier sidewalls, and a chrome dished beadlock wheel with a center nut. */
export function buildWheel(scene: Scene, name: string, radius: number, width: number, tireMat: PBRMaterial, hubMat: PBRMaterial, sideMat: PBRMaterial, lugs = true): TransformNode {
  const hub = new TransformNode(name, scene);
  const r = radius, hw = width / 2, ri = r * 0.5; // ri = bead/rim seat radius
  // Tire cross-section (radius, axial) revolved about the axle -> rounded shoulders,
  // slightly square tread, tucked sidewalls. No part exceeds the tread radius r.
  const prof: Vector3[] = [
    new Vector3(ri, -hw, 0),
    new Vector3(r * 0.82, -hw, 0),
    new Vector3(r * 0.97, -hw * 0.66, 0),
    new Vector3(r, -hw * 0.24, 0),
    new Vector3(r, hw * 0.24, 0),
    new Vector3(r * 0.97, hw * 0.66, 0),
    new Vector3(r * 0.82, hw, 0),
    new Vector3(ri, hw, 0),
  ];
  const tire = MeshBuilder.CreateLathe(name + "_t", { shape: prof, tessellation: 32 }, scene);
  tire.rotation.z = Math.PI / 2; tire.parent = hub; tire.material = tireMat;
  // Tread lugs: a ring of small rubber blocks set INTO the tread (top at r*0.985, never past r)
  // so the tire reads as a knobby dirt tire from the stands without exceeding the tread radius.
  // Each lug is a thin instance of one source box so all four tires share one draw call.
  if (lugs) {
    const lugN = 14, lugTop = r * 0.985, lugBase = r * 0.9;
    const lugSrc = MeshBuilder.CreateBox(name + "_lug", { width: width * 0.22, height: (lugTop - lugBase), depth: r * 0.22 }, scene);
    lugSrc.parent = hub; lugSrc.material = tireMat; lugSrc.isVisible = false;
    const rr = (lugTop + lugBase) / 2;
    for (let i = 0; i < lugN; i++) {
      const a = (i / lugN) * Math.PI * 2;
      for (const zr of [-0.34, 0.34]) { // two staggered rows across the tread
        const ang = a + (zr < 0 ? 0 : Math.PI / lugN); // offset rows → staggered knob pattern
        const inst = lugSrc.createInstance(name + "_lug" + i + (zr < 0 ? "a" : "b"));
        inst.parent = hub;
        inst.position.set(zr * hw, Math.cos(ang) * rr, Math.sin(ang) * rr);
        inst.rotation.x = -ang;
      }
    }
  }
  // Lettered Hoosier sidewall on each outer face (sits just inside the shoulder).
  for (const sx of [1, -1]) {
    const face = MeshBuilder.CreateCylinder(name + "_lf" + sx, { diameter: r * 1.7, height: 0.01, tessellation: 32 }, scene);
    face.rotation.z = Math.PI / 2; face.position.x = sx * (hw + 0.004); face.parent = hub; face.material = sideMat;
  }
  // Chrome dished wheel: bead barrel, a shallow concave dish per side, center nut.
  const barrel = MeshBuilder.CreateCylinder(name + "_rb", { diameter: ri * 2, height: width * 0.98, tessellation: 24 }, scene);
  barrel.rotation.z = Math.PI / 2; barrel.parent = hub; barrel.material = hubMat;
  for (const sx of [1, -1]) {
    const dish = MeshBuilder.CreateCylinder(name + "_d" + sx, { diameterTop: ri * 2, diameterBottom: ri * 1.25, height: hw * 0.55, tessellation: 24 }, scene);
    dish.rotation.z = -sx * Math.PI / 2; dish.position.x = sx * hw * 0.72; dish.parent = hub; dish.material = hubMat;
    // Beadlock ring + bolt circle clamping the bead, just inboard of the sidewall lettering.
    const ring = MeshBuilder.CreateTorus(name + "_blr" + sx, { diameter: ri * 1.92, thickness: ri * 0.16, tessellation: 20 }, scene);
    ring.rotation.z = Math.PI / 2; ring.position.x = sx * (hw - 0.006); ring.parent = hub; ring.material = hubMat;
    const bolts = 8, br = ri * 0.86;
    const boltSrc = MeshBuilder.CreateCylinder(name + "_bl" + sx, { diameter: ri * 0.1, height: 0.02, tessellation: 5 }, scene);
    boltSrc.parent = hub; boltSrc.material = hubMat; boltSrc.isVisible = false;
    for (let b = 0; b < bolts; b++) {
      const ba = (b / bolts) * Math.PI * 2;
      const bolt = boltSrc.createInstance(name + "_bl" + sx + b);
      bolt.parent = hub; bolt.rotation.z = Math.PI / 2; // axle-aligned, flush on the dish face
      bolt.position.set(sx * (hw + 0.004), Math.cos(ba) * br, Math.sin(ba) * br);
    }
    const nut = MeshBuilder.CreateCylinder(name + "_n" + sx, { diameter: ri * 0.55, height: 0.05, tessellation: 6 }, scene);
    nut.rotation.z = Math.PI / 2; nut.position.x = sx * (hw + 0.02); nut.parent = hub; nut.material = hubMat;
  }
  return hub;
}

/** A 410-style sprint-car wing side board: one big flat panel whose side silhouette is
 *  the wing's profile — a tall flat-topped rear, the top edge sweeping DOWN to a low
 *  front point (following the down-foil). Flat (thin sheet), in the Y-Z plane at
 *  x = sign*halfW; the material is set double-sided by the caller. */
function wingSideBoard(scene: Scene, name: string, sign: number, halfW: number): Mesh {
  const x = sign * halfW;
  // profile (z, y) CCW from the rear-bottom corner
  const P: [number, number][] = [
    [-0.92, -0.52], // rear bottom
    [0.82, -0.52],  // front bottom
    [1.0, -0.04],   // front leading tip (low)
    [0.5, 0.30],    // down-foil top
    [-0.05, 0.52],  // flat-deck front-top junction
    [-0.92, 0.56],  // rear top
  ];
  const pos: number[] = [];
  for (const [z, y] of P) pos.push(x, y, z);
  const idx: number[] = [];
  for (let i = 1; i < P.length - 1; i++) idx.push(0, i, i + 1); // triangle-fan
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = pos; vd.indices = idx;
  const nrm: number[] = []; VertexData.ComputeNormals(pos, idx, nrm); vd.normals = nrm;
  vd.applyToMesh(m);
  return m;
}

/**
 * Winged 1/10 dirt sprint car (410-style): a huge ~square top wing — flat rear deck +
 * down-swept front foil between two big swept side boards — over big staggered tires on
 * orange beadlock wheels, a detailed tube front end (axle, 4-bar rods, tie rod, front
 * wing), roll cage with driver, velocity stacks and nerf bars. The hero (Super Jay #32)
 * car is plain orange with its logo on the wing top.
 */
export function createCar(
  scene: Scene,
  plugin: HavokPlugin,
  shadow: ShadowGenerator | null,
  opts: CarOptions = {}
): BuiltCar {
  const color = opts.color ?? new Color3(0.85, 0.12, 0.12);
  const num = opts.number ?? 22;
  const logoUrl = opts.logoUrl;
  const logoAspect = opts.logoAspect ?? 0.72; // width / height (portrait sticker)
  const redNum = !!opts.redOutlineNumber; // #42 livery: red glyph + black outline numbers
  // The lettered name is suppressed when an image logo is supplied (logo wins).
  const name = logoUrl ? undefined : opts.name;
  const logoMat = logoUrl ? imageDecalMat(scene, "carlogo", logoUrl) : null;

  const flake = flakeNormal(scene); // metalflake sparkle in the bodywork
  const mPaint = paintMat(scene, "paint", color, flake);
  const mPaintDark = paintMat(scene, "paintD", color.scale(0.55), flake);
  const mBlack = flatMat(scene, "blk", new Color3(0.05, 0.05, 0.06), 0.35, 0.1);
  const mCarbon = flatMat(scene, "carbon", new Color3(0.05, 0.05, 0.06), 0.4, 0.35);
  // Polished chromoly tube — bright, near-mirror so night lamps + bloom catch the cage/axle.
  const mChrome = flatMat(scene, "chrome", new Color3(0.9, 0.9, 0.93), 0.06, 1.0);
  // Brushed aluminium — less mirror than chrome, for panels/floor edges so they read as sheet metal not chrome.
  const mAlum = flatMat(scene, "alum", new Color3(0.78, 0.79, 0.82), 0.34, 0.9);
  const mRim = flatMat(scene, "rim", new Color3(0.96, 0.34, 0.04), 0.32, 0.6); // orange anodized beadlock (sprint-car look)
  mRim.clearCoat.isEnabled = true; mRim.clearCoat.intensity = 0.6; mRim.clearCoat.roughness = 0.18; // anodized sheen
  const mTire = flatMat(scene, "tire", new Color3(0.045, 0.045, 0.05), 0.88, 0.0);
  mTire.backFaceCulling = false; // revolved tire carcass is single-sided — show both faces
  const mVisor = flatMat(scene, "visor", new Color3(0.08, 0.1, 0.14), 0.08, 0.9);
  mVisor.clearCoat.isEnabled = true; mVisor.clearCoat.intensity = 1.0; mVisor.clearCoat.roughness = 0.04; // glossy face shield
  const mSidewall = decalMat(scene, "sidewall", 256, 256, sidewallDraw(), false, true);

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial, parent: TransformNode) => { m.material = mat; m.parent = parent; parts.push(m); return m; };

  // Invisible collision root
  const root = MeshBuilder.CreateBox("chassis", { width: 1.0, height: 0.3, depth: 2.0 }, scene);
  root.isVisible = false;
  root.position.copyFrom(opts.spawn ?? new Vector3(0, 0.7, 0));
  root.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), opts.yaw ?? 0);

  // Floor pan
  add(MeshBuilder.CreateBox("pan", { width: 0.86, height: 0.05, depth: 1.85 }, scene), mCarbon, root).position.set(0, -0.17, 0);
  // Aluminium frame rails running the length of the pan edges — subtle chassis read under the body.
  for (const sx of [1, -1]) {
    const rail = add(MeshBuilder.CreateBox("rail" + sx, { width: 0.04, height: 0.06, depth: 1.78 }, scene), mAlum, root);
    rail.position.set(0.4 * sx, -0.15, 0);
  }

  // Main tub — rounded capsule along Z, flattened
  const tub = add(MeshBuilder.CreateCapsule("tub", { radius: 0.33, height: 1.5, tessellation: 16, capSubdivisions: 6, orientation: new Vector3(0, 0, 1) }, scene), mPaint, root);
  tub.scaling.set(1.05, 0.82, 1.0);
  tub.position.set(0, 0.0, -0.05);
  // Thin carbon belly chord under the tub — a panel-seam read where body meets floor.
  const belt = add(MeshBuilder.CreateBox("bodyBelt", { width: 0.74, height: 0.035, depth: 1.46 }, scene), mCarbon, root);
  belt.position.set(0, -0.11, -0.05);

  // Body sides. The hero (Super Jay) car is plain body colour with only a small
  // "Super Jay" script by the cockpit; the rest carry the full lightning livery.
  for (const sx of [1, -1]) {
    if (logoUrl) {
      const tag = add(MeshBuilder.CreatePlane("sjtag" + sx, { width: 0.46, height: 0.15 }, scene),
        decalMat(scene, "sjtag" + sx, 256, 84, superJayTagDraw(), sx < 0, true), root);
      tag.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; // face outward
      tag.position.set(0.355 * sx, 0.2, 0.12); // up by the cockpit / windshield
    } else {
      const panel = add(MeshBuilder.CreateBox("livery" + sx, { width: 0.02, height: 0.42, depth: 0.95 }, scene),
        decalMat(scene, "livery" + sx, 512, 256, liverySideDraw(color, num, name), sx < 0), root);
      panel.position.set(0.355 * sx, 0.02, -0.1);
    }
  }

  // Tail cowl — smooth lathe teardrop (the sprint car fuel tank/tail)
  const tailProfile: Vector3[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; tailProfile.push(new Vector3(0.02 + Math.sin((1 - t) * Math.PI * 0.5) * 0.34, t * 0.8, 0)); }
  const tail = add(MeshBuilder.CreateLathe("tail", { shape: tailProfile, tessellation: 20 }, scene), mPaintDark, root);
  tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.05, -0.95); tail.scaling.y = 1.0;
  // Aluminium fuel cap + bung on the tail tank, and a thin panel seam ringing its mouth.
  const fcap = add(MeshBuilder.CreateCylinder("fuelCap", { diameter: 0.13, height: 0.05, tessellation: 16 }, scene), mAlum, root);
  fcap.rotation.x = Math.PI / 2; fcap.position.set(0, 0.2, -0.86);
  const fseam = add(MeshBuilder.CreateTorus("tailSeam", { diameter: 0.46, thickness: 0.012, tessellation: 20 }, scene), mCarbon, root);
  fseam.position.set(0, 0.05, -0.62);

  // Nose cone — smooth taper
  const nose = add(MeshBuilder.CreateCylinder("nose", { diameterTop: 0.06, diameterBottom: 0.46, height: 0.65, tessellation: 20 }, scene), mPaint, root);
  nose.rotation.x = -Math.PI / 2; nose.position.set(0, -0.05, 1.05);

  // Round front nerf bar — the sprint car's signature nose bumper hoop
  const fhoop = add(MeshBuilder.CreateTorus("fhoop", { diameter: 0.52, thickness: 0.045, tessellation: 16 }, scene), mChrome, root);
  fhoop.rotation.x = Math.PI / 2; fhoop.position.set(0, -0.06, 1.4); fhoop.scaling.y = 0.8;

  // Tubular front axle + 4-bar radius rods — the exposed straight-axle front end that
  // makes a sprint car instantly recognizable.
  const axle = add(MeshBuilder.CreateCylinder("faxle", { diameter: 0.07, height: 1.26, tessellation: 12 }, scene), mChrome, root);
  axle.rotation.z = Math.PI / 2; axle.position.set(0, -0.13, 0.78);
  for (const sx of [1, -1]) {
    // lower + upper radius rods (the 4-bar links locating the axle) — thin, splayed slightly
    // inboard at the chassis end like real birdcage-mounted bars.
    for (const yr of [-0.11, 0.0]) {
      const rod = add(MeshBuilder.CreateCylinder("frod" + sx + (yr < 0 ? "L" : "U"), { diameter: 0.026, height: 0.68, tessellation: 8 }, scene), mChrome, root);
      rod.rotation.x = Math.PI / 2; rod.rotation.y = sx * 0.09; rod.position.set(0.17 * sx, yr, 0.47);
      // rod-end heim joints (small chrome balls) at each rod's chassis end
      const heim = add(MeshBuilder.CreateSphere("fheim" + sx + (yr < 0 ? "L" : "U"), { diameter: 0.05, segments: 6 }, scene), mChrome, root);
      heim.position.set(0.17 * sx, yr, 0.15);
    }
    // king-pin / spindle barrel at each axle end
    const kp = add(MeshBuilder.CreateCylinder("kpin" + sx, { diameter: 0.075, height: 0.22, tessellation: 10 }, scene), mChrome, root);
    kp.position.set(0.6 * sx, -0.13, 0.78);
    // steering arm off the spindle to the tie rod
    const sarm = add(MeshBuilder.CreateCylinder("sarm" + sx, { diameter: 0.026, height: 0.2, tessellation: 8 }, scene), mChrome, root);
    sarm.rotation.x = Math.PI / 2; sarm.position.set(0.56 * sx, -0.1, 0.88);
    // angled front torsion-bar shock off the axle up to the frame
    const fsh = add(MeshBuilder.CreateCylinder("fshock" + sx, { diameter: 0.05, height: 0.42, tessellation: 10 }, scene), mChrome, root);
    fsh.position.set(0.24 * sx, 0.02, 0.62); fsh.rotation.x = -0.5;
    // torsion-arm stub the shock pivots on
    const tarm = add(MeshBuilder.CreateCylinder("ftarm" + sx, { diameter: 0.03, height: 0.26, tessellation: 8 }, scene), mAlum, root);
    tarm.rotation.z = Math.PI / 2; tarm.position.set(0.12 * sx, 0.14, 0.5);
  }
  // steering tie rod spanning behind the axle
  const tie = add(MeshBuilder.CreateCylinder("ftie", { diameter: 0.028, height: 1.12, tessellation: 8 }, scene), mChrome, root);
  tie.rotation.z = Math.PI / 2; tie.position.set(0, -0.1, 0.92);
  // drag link from the steering box to the tie rod (offset to one side, as on a real sprinter)
  const drag = add(MeshBuilder.CreateCylinder("fdrag", { diameter: 0.026, height: 0.62, tessellation: 8 }, scene), mChrome, root);
  drag.rotation.x = Math.PI / 2; drag.position.set(0.22, -0.08, 0.5);

  // Cockpit recess + seat
  add(MeshBuilder.CreateSphere("seat", { diameter: 0.5, segments: 12 }, scene), mCarbon, root).position.set(0, 0.16, -0.2);

  // Driver — rounded torso + helmet + visor
  add(MeshBuilder.CreateCapsule("torso", { radius: 0.17, height: 0.42, tessellation: 12 }, scene), mCarbon, root).position.set(0, 0.28, -0.2);
  const helmet = add(MeshBuilder.CreateSphere("helmet", { diameter: 0.27, segments: 14 }, scene), flatMat(scene, "helmet", new Color3(0.92, 0.92, 0.95), 0.2, 0.1), root);
  helmet.position.set(0, 0.5, -0.16);
  add(MeshBuilder.CreateBox("visorM", { width: 0.2, height: 0.08, depth: 0.07 }, scene), mVisor, root).position.set(0, 0.5, -0.03);

  // Roll cage — smooth tubes
  const tube = (n: string, x: number, z: number, h: number) => {
    const t = add(MeshBuilder.CreateCylinder(n, { diameter: 0.04, height: h, tessellation: 10 }, scene), mChrome, root);
    t.position.set(x, 0.2 + h / 2 - 0.1, z); return t;
  };
  tube("cf1", 0.2, 0.12, 0.5); tube("cf2", -0.2, 0.12, 0.5);
  tube("cb1", 0.22, -0.45, 0.66); tube("cb2", -0.22, -0.45, 0.66);
  // a thinner intermediate hoop tube each side tying front to rear of the cage
  for (const sx of [1, -1]) {
    const sideTube = add(MeshBuilder.CreateCylinder("cside" + sx, { diameter: 0.03, height: 0.58, tessellation: 8 }, scene), mChrome, root);
    sideTube.rotation.x = Math.PI / 2 - 0.18; sideTube.position.set(0.21 * sx, 0.5, -0.18);
  }
  // angled diagonal X-braces across the back of the cage (the visible rear-hoop bracing)
  for (const sx of [1, -1]) {
    const diag = add(MeshBuilder.CreateCylinder("cdiag" + sx, { diameter: 0.03, height: 0.6, tessellation: 8 }, scene), mChrome, root);
    diag.position.set(0, 0.32, -0.42); diag.rotation.z = sx * 0.62;
  }
  // forward dash hoop cross-tube tying the two front posts together
  const dash = add(MeshBuilder.CreateCylinder("cdash", { diameter: 0.03, height: 0.42, tessellation: 8 }, scene), mChrome, root);
  dash.rotation.z = Math.PI / 2; dash.position.set(0, 0.48, 0.12);
  const halo = add(MeshBuilder.CreateTorus("halo", { diameter: 0.5, thickness: 0.04, tessellation: 16 }, scene), mChrome, root);
  halo.position.set(0, 0.52, -0.16); halo.scaling.z = 1.2;

  // Nerf bars + rear bumper hoop
  for (const sx of [1, -1]) {
    const bar = add(MeshBuilder.CreateCylinder("nerf" + sx, { diameter: 0.05, height: 1.1, tessellation: 8 }, scene), mChrome, root);
    bar.rotation.x = Math.PI / 2; bar.position.set(0.6 * sx, -0.12, 0);
  }
  const hoop = add(MeshBuilder.CreateTorus("hoop", { diameter: 0.7, thickness: 0.05, tessellation: 16 }, scene), mChrome, root);
  hoop.rotation.x = Math.PI / 2; hoop.position.set(0, 0.0, -1.18);

  // --- Engine block + chrome side headers. The upright intake velocity stacks are
  //     omitted (cleaner look) but the iconic swept-up "zoomie" exhaust HEADERS stay. ---
  const mEngine = flatMat(scene, "engine", new Color3(0.13, 0.13, 0.15), 0.45, 0.6);
  add(MeshBuilder.CreateBox("engineBlk", { width: 0.5, height: 0.3, depth: 0.5 }, scene), mEngine, root).position.set(0, 0.08, 0.42);
  // Aluminium cam cover crowning the block + finned louver hints on the hood scoop area.
  const cover = add(MeshBuilder.CreateBox("camCover", { width: 0.46, height: 0.05, depth: 0.4 }, scene), mAlum, root);
  cover.position.set(0, 0.25, 0.42);
  for (let i = 0; i < 3; i++) {
    const louver = add(MeshBuilder.CreateBox("louver" + i, { width: 0.42, height: 0.012, depth: 0.03 }, scene), mCarbon, root);
    louver.position.set(0, 0.28, 0.3 + i * 0.085); louver.rotation.x = -0.35; // raked louver slats
  }
  for (const sx of [1, -1]) {
    // four chrome header pipes fanning back off each side of the block and sweeping up/out
    for (let i = 0; i < 4; i++) {
      const pipe = add(MeshBuilder.CreateCylinder("header" + sx + i, { diameter: 0.05, height: 0.34, tessellation: 10 }, scene), mChrome, root);
      pipe.position.set(0.26 * sx, 0.14, 0.30 + i * 0.085); // exit the engine side, staggered along the block
      pipe.rotation.z = sx * 0.95; // flare outboard
      pipe.rotation.x = -0.5;      // sweep up and back
    }
  }

  // --- Steering wheel in front of the driver ---
  const wheel = add(MeshBuilder.CreateTorus("steerW", { diameter: 0.18, thickness: 0.025, tessellation: 14 }, scene), mBlack, root);
  wheel.position.set(0, 0.3, -0.02); wheel.rotation.x = 1.15;

  // --- Rear coilover shocks ---
  for (const sx of [1, -1]) {
    const shock = add(MeshBuilder.CreateCylinder("shock" + sx, { diameter: 0.05, height: 0.34, tessellation: 10 }, scene), mChrome, root);
    shock.position.set(0.17 * sx, 0.1, -0.55); shock.rotation.x = 0.28;
  }

  // --- Top wing (410-style, ~25 sq ft / roughly 5'x5'): a flat rear deck + a down-swept
  //     front foil between two BIG swept side boards, on a chrome wing tree. The swept
  //     side board is THE defining sprint-wing silhouette. ---
  const WW = 1.82;   // wing width (~5 ft scaled)
  const FLAT = 0.86; // flat-top chord (rear); the front foil sweeps down ahead of it
  const wingPivot = new TransformNode("wingPivot", scene); wingPivot.parent = root;
  wingPivot.position.set(0, 1.26, -0.42); wingPivot.rotation.x = -0.1; // sits HIGH, slight rake
  // Double-sided body-colour panel material for the thin wing surfaces + side boards.
  const mBoard = new PBRMaterial("wboard", scene);
  mBoard.albedoColor = color; mBoard.roughness = 0.36; mBoard.metallic = 0.1;
  mBoard.backFaceCulling = false; mBoard.twoSidedLighting = true;
  // Flat top deck (rear). Hero: plain body colour (logo is the only marking). Others: deck graphic.
  const deckMat = logoUrl ? mBoard : decalMat(scene, "wdeck", 512, 256, wingDeckDraw(color, name ?? "SUPER JAY RC"));
  const deck = add(MeshBuilder.CreateBox("topDeck", { width: WW, height: 0.04, depth: FLAT }, scene), deckMat, wingPivot as unknown as TransformNode);
  deck.position.set(0, 0, -0.34);
  if (logoMat) {
    // Logo flat on the deck, turned a quarter-left and sized to fill the flat-top chord:
    // the tall "32" now reads along the car's LENGTH (nose-to-tail) from the stand.
    const dh = 0.84, dw = dh * logoAspect; // dh runs along the car length (Z), dw across (X)
    const deckLogo = add(MeshBuilder.CreatePlane("deckLogo", { width: dw, height: dh }, scene), logoMat, wingPivot as unknown as TransformNode);
    deckLogo.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(
      new Vector3(-1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, 1, 0),
    );
    deckLogo.position.set(0, 0.03, -0.34);
  } else {
    // AI: the car's number painted flat on the wing-top deck, ~75% of the deck size, on a
    // transparent panel (wing paint shows through), reading from the RIGHT (+x). Orientation
    // is derived like the player deckLogo, quarter-turned so the glyph top faces +x.
    const NS = FLAT * 0.92; // square number panel sized to most of the flat-top chord
    const numTop = add(MeshBuilder.CreatePlane("wdeckNum", { width: NS, height: NS }, scene),
      decalMat(scene, "wdeckNum", 256, 256, wingTopNumberDraw(color, num, redNum), false, true),
      wingPivot as unknown as TransformNode);
    numTop.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(
      new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0),
    );
    numTop.position.set(0, 0.03, -0.34);
  }
  // Down-swept front foil (the scoop) ahead of the flat deck.
  const front = add(MeshBuilder.CreateBox("wfront", { width: WW, height: 0.04, depth: 0.98 }, scene), mBoard, wingPivot as unknown as TransformNode);
  front.position.set(0, -0.18, 0.48); front.rotation.x = 0.52;
  // Foil/deck junction seam — a thin carbon spine across the kink where the scoop meets the flat deck.
  const fseamW = add(MeshBuilder.CreateBox("wfoilSeam", { width: WW, height: 0.05, depth: 0.03 }, scene), mCarbon, wingPivot as unknown as TransformNode);
  fseamW.position.set(0, 0.0, 0.02);
  // Center deck spine rib (top) — a fine raised stiffener down the wing centerline.
  const spine = add(MeshBuilder.CreateBox("wspine", { width: 0.05, height: 0.018, depth: FLAT * 0.96 }, scene), mCarbon, wingPivot as unknown as TransformNode);
  spine.position.set(0, 0.022, -0.34);
  // Wickerbill (Gurney) at the trailing edge.
  const wicker = add(MeshBuilder.CreateBox("wicker", { width: WW, height: 0.14, depth: 0.035 }, scene), logoUrl ? mBoard : mBlack, wingPivot as unknown as TransformNode);
  wicker.position.set(0, 0.085, -0.78);
  // A fine bright lip capping the wickerbill so its trailing edge catches a glint.
  const wlip = add(MeshBuilder.CreateBox("wickerLip", { width: WW, height: 0.016, depth: 0.045 }, scene), mAlum, wingPivot as unknown as TransformNode);
  wlip.position.set(0, 0.158, -0.78);
  // BIG swept side boards spanning the whole wing.
  for (const sx of [1, -1]) {
    add(wingSideBoard(scene, "plate" + sx, sx, WW / 2), mBoard, wingPivot as unknown as TransformNode);
    // Crisp rear edge bead on each end plate (matches the board's tall flat rear edge:
    // z=-0.92, y -0.52..0.56), in carbon, so the end-plate silhouette reads sharp under
    // night lighting. Sits flush on the board edge — no clipping, no floating.
    const rearBead = add(MeshBuilder.CreateBox("plRear" + sx, { width: 0.03, height: 1.08, depth: 0.04 }, scene), mCarbon, wingPivot as unknown as TransformNode);
    rearBead.position.set((WW / 2) * sx, 0.02, -0.92);
    if (logoMat) {
      // Hero: the Super Jay 32 logo on the side board — rotated 90° LEFT and enlarged.
      const lh = 1.0, lw = lh * logoAspect;
      const lp = add(MeshBuilder.CreatePlane("wlogo" + sx, { width: lw, height: lh }, scene), logoMat, wingPivot as unknown as TransformNode);
      // RotZ (in-plane spin) is applied before RotY (face outward); the (π/2)*sx sign keeps the
      // visual "left" rotation consistent across the mirrored (scaling.x = -1) left side.
      lp.rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, (Math.PI / 2) * sx);
      lp.scaling.x = sx; // un-mirror the left side
      lp.position.set((WW / 2) * sx + sx * 0.01, 0.13, -0.4);
    } else {
      // AI: a number panel on the rear-upper of the board, facing outward.
      const np = add(MeshBuilder.CreatePlane("wnum" + sx, { width: 0.66, height: 0.42 }, scene),
        decalMat(scene, "wnum" + sx, 512, 256, wingSideDraw(color, num, redNum), sx < 0, true), wingPivot as unknown as TransformNode);
      np.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      np.position.set((WW / 2) * sx + sx * 0.006, 0.16, -0.42);
    }
  }
  // White racing stripe with a thin black outline, down the centerline (hero / player car only).
  // ~1/4 the car's width (body = 1.0u) running nose → tub → tail AND up over the top wing.
  // Each segment is a white box riding the body/wing crown, sitting on a slightly larger black
  // box so a fine black border peeks out on every edge. The open cockpit interrupts the body run;
  // on the wing deck the Super Jay logo overlays the stripe's centre (logo wins, like the cockpit).
  if (logoUrl) {
    const SW = 0.25;   // stripe width ≈ 1/4 car width
    const EDGE = 0.03; // black outline that peeks out on each side / end
    const mStripe = flatMat(scene, "stripe", new Color3(0.95, 0.95, 0.97), 0.3, 0.05);
    const mStripeEdge = flatMat(scene, "stripeEdge", new Color3(0.02, 0.02, 0.02), 0.45, 0.05);
    const striped = (n: string, d: number, x: number, y: number, z: number, rx: number, parent: TransformNode) => {
      const e = add(MeshBuilder.CreateBox(n + "Edge", { width: SW + EDGE * 2, height: 0.02, depth: d + EDGE * 2 }, scene), mStripeEdge, parent);
      e.position.set(x, y - 0.004, z); e.rotation.x = rx;
      const s = add(MeshBuilder.CreateBox(n, { width: SW, height: 0.02, depth: d }, scene), mStripe, parent);
      s.position.set(x, y, z); s.rotation.x = rx; return s;
    };
    // Body: nose cone → forward tub → tail cowl (open cockpit z≈-0.2..0.12 left clear).
    striped("stripeNose", 0.62, 0, 0.12, 0.78, 0.5, root);
    striped("stripeFwd", 0.5, 0, 0.30, 0.27, 0, root);
    striped("stripeTail", 0.6, 0, 0.34, -0.78, -0.2, root);
    // Wing: across the down-swept front foil (logo-free) and the rear deck (logo overlays centre).
    striped("stripeWingFoil", 0.9, 0, -0.15, 0.48, 0.52, wingPivot);
    striped("stripeWingDeck", 0.78, 0, 0.027, -0.34, 0, wingPivot);
  }

  // Wing tree: tall main posts + raked front stays carrying the wing off the cage.
  for (const sx of [1, -1]) {
    const post = add(MeshBuilder.CreateCylinder("wpost" + sx, { diameter: 0.05, height: 0.92, tessellation: 8 }, scene), mChrome, root);
    post.position.set(0.18 * sx, 0.74, -0.5);
    const stay = add(MeshBuilder.CreateCylinder("wstay" + sx, { diameter: 0.032, height: 0.95, tessellation: 8 }, scene), mChrome, root);
    stay.position.set(0.2 * sx, 0.7, 0.0); stay.rotation.x = 0.6; // raked forward to the wing leading edge
    // diagonal brace tying each main post back to the cage (the slider/jack-arm look)
    const brace = add(MeshBuilder.CreateCylinder("wbrace" + sx, { diameter: 0.028, height: 0.5, tessellation: 8 }, scene), mChrome, root);
    brace.position.set(0.18 * sx, 0.7, -0.74); brace.rotation.x = -0.5;
  }
  // crossbar tying the two main posts together just under the deck
  const wcross = add(MeshBuilder.CreateCylinder("wcross", { diameter: 0.03, height: 0.4, tessellation: 8 }, scene), mChrome, root);
  wcross.rotation.z = Math.PI / 2; wcross.position.set(0, 1.14, -0.5);

  // --- Front wing: white-edged foil + black endplates ---
  const FWW = 1.12, FWD = 0.48; // front wing span + chord
  const fwPivot = new TransformNode("fwPivot", scene); fwPivot.parent = root;
  fwPivot.position.set(0, 0.12, 1.34); fwPivot.rotation.x = 0.22; // slopes down toward the front (nose-down for front grip)
  add(MeshBuilder.CreateBox("frontFoil", { width: FWW, height: 0.035, depth: FWD }, scene), mPaint, fwPivot as unknown as TransformNode);
  // body-colour leading stripe + black wickerbill at the trailing edge
  add(MeshBuilder.CreateBox("frontStripe", { width: FWW, height: 0.012, depth: 0.12 }, scene), mPaintDark, fwPivot as unknown as TransformNode).position.set(0, 0.024, FWD / 2 - 0.07);
  add(MeshBuilder.CreateBox("frontLip", { width: FWW, height: 0.07, depth: 0.035 }, scene), mBlack, fwPivot as unknown as TransformNode).position.set(0, 0.02, -FWD / 2 + 0.02);
  // tall end plates with a colour edge band
  for (const sx of [1, -1]) {
    const ep = add(MeshBuilder.CreateBox("fep" + sx, { width: 0.03, height: 0.28, depth: FWD + 0.06 }, scene), mBlack, fwPivot as unknown as TransformNode);
    ep.position.set((FWW / 2) * sx, 0.09, 0);
    const band = add(MeshBuilder.CreateBox("fepb" + sx, { width: 0.034, height: 0.05, depth: FWD + 0.06 }, scene), mPaint, fwPivot as unknown as TransformNode);
    band.position.set((FWW / 2) * sx, 0.2, 0);
  }
  // nose straps tying the wing down to the nose cone
  for (const sx of [1, -1]) {
    const strap = add(MeshBuilder.CreateCylinder("fstrap" + sx, { diameter: 0.028, height: 0.34, tessellation: 8 }, scene), mChrome, root);
    strap.position.set(0.12 * sx, 0.02, 1.16); strap.rotation.x = 0.7;
  }

  // --- Wheels: big sprint-car stagger — tall-skinny fronts, huge rears, biggest on
  //     the right-rear (the loaded outside tire on a left-turning dirt oval) ---
  const layout = [
    { x: 0.64, z: 0.80, steer: true, drive: false, r: 0.30, w: 0.28 },  // front right
    { x: -0.64, z: 0.80, steer: true, drive: false, r: 0.30, w: 0.28 }, // front left
    { x: 0.74, z: -0.84, steer: false, drive: true, r: 0.45, w: 0.60 }, // right rear (biggest)
    { x: -0.72, z: -0.84, steer: false, drive: true, r: 0.41, w: 0.52 }, // left rear
  ];
  const wheels: TransformNode[] = [];
  const wheelDefs: WheelDef[] = [];
  for (let i = 0; i < layout.length; i++) {
    const L = layout[i];
    const hub = buildWheel(scene, "wheel" + i, L.r, L.w, mTire, mRim, mSidewall);
    hub.parent = root;
    wheels.push(hub);
    wheelDefs.push({ posLocal: new Vector3(L.x, -0.12, L.z), steer: L.steer, drive: L.drive, visual: hub, radius: L.r });
  }

  if (shadow) {
    for (const m of parts) shadow.addShadowCaster(m);
    for (const w of wheels) for (const cm of w.getChildMeshes()) shadow.addShadowCaster(cm as Mesh);
  }
  for (const m of parts) m.receiveShadows = true;

  // Each car owns a cloned, mutable config (garage tuning mutates it); the class baseline stays pristine.
  const vehicle = new RaycastVehicle(scene, plugin, root, wheelDefs, cloneConfig(opts.config ?? DEFAULT_CONFIG));
  return { root, vehicle, wheels, bodyParts: parts };
}
