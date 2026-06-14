import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import "@babylonjs/core/Meshes/Builders/latheBuilder";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { RaycastVehicle, DEFAULT_CONFIG, type WheelDef } from "../physics/RaycastVehicle";

export interface CarOptions {
  color?: Color3;
  number?: number;
  spawn?: Vector3;
  yaw?: number;
}

export interface BuiltCar {
  root: Mesh;
  vehicle: RaycastVehicle;
  wheels: TransformNode[];
  bodyParts: Mesh[];
}

const rgb = (c: Color3) => `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;

function paintMat(scene: Scene, name: string, color: Color3): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color;
  m.metallic = 0.1;
  m.roughness = 0.32;
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 1.0;
  m.clearCoat.roughness = 0.06;
  return m;
}
function flatMat(scene: Scene, name: string, color: Color3, rough: number, metal: number): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color; m.roughness = rough; m.metallic = metal;
  return m;
}

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Build a clear-coated decal panel material from a canvas drawing. `mirror` flips
 *  it horizontally so lettering reads correctly on the car's opposite side. */
function decalMat(scene: Scene, name: string, w: number, h: number, draw: Draw, mirror = false, alpha = false): PBRMaterial {
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

/** Body side livery: car-color base, black lower swoosh, white lightning streak,
 *  numbered roundel and "RACE INSPIRED" — the Losi 22S graphic language. */
function liverySideDraw(color: Color3, num: number): Draw {
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
    // RACE INSPIRED
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * 0.12}px Arial, sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText("RACE INSPIRED", w - 12, h - 10);
  };
}

/** Wing side plate (dive plate): black with a color band, "SPRINT" + big number. */
function wingSideDraw(color: Color3, num: number): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h * 0.16);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * 0.20}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("SPRINT", w * 0.06, h * 0.20);
    ctx.font = `bold ${h * 0.62}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(String(num), w * 0.96, h * 0.62);
  };
}

/** Wing top deck: black with a center color chord stripe and sponsor text. */
function wingDeckDraw(color: Color3): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(color); ctx.fillRect(0, h * 0.38, w, h * 0.24);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * 0.16}px Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("RCSPRINT", w * 0.5, h * 0.5);
  };
}

/** Lettered Hoosier sidewall ring with a transparent center (chrome shows through). */
function sidewallDraw(): Draw {
  return (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = "#0a0a0b"; ctx.beginPath(); ctx.arc(cx, cy, w * 0.5, 0, Math.PI * 2); ctx.fill();
    const curved = (text: string, base: number, flip: boolean) => {
      ctx.save(); ctx.fillStyle = "#dfe0e4"; ctx.font = `bold ${w * 0.085}px Arial, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const rad = w * 0.40, step = 0.19;
      for (let i = 0; i < text.length; i++) {
        const a = base + (i - (text.length - 1) / 2) * step * (flip ? -1 : 1);
        ctx.save();
        ctx.translate(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        ctx.rotate(a + (flip ? -Math.PI / 2 : Math.PI / 2));
        ctx.fillText(text[i], 0, 0);
        ctx.restore();
      }
      ctx.restore();
    };
    curved("HOOSIER", -Math.PI / 2, false);
    curved("HOOSIER", Math.PI / 2, true);
    // punch transparent center for the rim
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.30, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  };
}

/** Smooth tapered tire with rounded sidewall, lettered Hoosier face, chrome hub. */
function buildWheel(scene: Scene, name: string, radius: number, width: number, tireMat: PBRMaterial, hubMat: PBRMaterial, sideMat: PBRMaterial): TransformNode {
  const hub = new TransformNode(name, scene);
  const tire = MeshBuilder.CreateCylinder(name + "_t", { diameter: radius * 2, height: width, tessellation: 32 }, scene);
  tire.rotation.z = Math.PI / 2; tire.parent = hub; tire.material = tireMat;
  // rounded sidewall bulges
  for (const sx of [1, -1]) {
    const wall = MeshBuilder.CreateTorus(name + "_sw" + sx, { diameter: radius * 1.7, thickness: radius * 0.5, tessellation: 24 }, scene);
    wall.rotation.z = Math.PI / 2; wall.position.x = sx * width * 0.5; wall.parent = hub; wall.material = tireMat;
    // lettered sidewall disc just inside the outer face
    const face = MeshBuilder.CreateCylinder(name + "_lf" + sx, { diameter: radius * 1.85, height: 0.012, tessellation: 28 }, scene);
    face.rotation.z = Math.PI / 2; face.position.x = sx * (width * 0.5 + 0.006); face.parent = hub; face.material = sideMat;
  }
  const rim = MeshBuilder.CreateCylinder(name + "_w", { diameter: radius * 1.1, height: width + 0.05, tessellation: 18 }, scene);
  rim.rotation.z = Math.PI / 2; rim.parent = hub; rim.material = hubMat;
  for (let i = 0; i < 6; i++) {
    const sp = MeshBuilder.CreateBox(name + "_s" + i, { width: width + 0.06, height: radius * 0.9, depth: 0.05 }, scene);
    sp.parent = hub; sp.rotation.x = (i / 6) * Math.PI; sp.material = hubMat;
  }
  return hub;
}

/**
 * Winged 1/10 sprint car matched to the real Losi 22S: red/black body with white
 * lightning livery + "RACE INSPIRED", big black top wing with "SPRINT"/number dive
 * plates, chrome rims, lettered Hoosier slicks, roll cage, headers and nerf bars.
 */
export function createCar(
  scene: Scene,
  plugin: HavokPlugin,
  shadow: ShadowGenerator | null,
  opts: CarOptions = {}
): BuiltCar {
  const color = opts.color ?? new Color3(0.85, 0.12, 0.12);
  const num = opts.number ?? 22;

  const mPaint = paintMat(scene, "paint", color);
  const mPaintDark = paintMat(scene, "paintD", color.scale(0.55));
  const mBlack = flatMat(scene, "blk", new Color3(0.05, 0.05, 0.06), 0.35, 0.1);
  const mCarbon = flatMat(scene, "carbon", new Color3(0.05, 0.05, 0.06), 0.4, 0.35);
  const mChrome = flatMat(scene, "chrome", new Color3(0.9, 0.9, 0.93), 0.06, 1.0);
  const mRim = flatMat(scene, "rim", new Color3(0.86, 0.87, 0.91), 0.12, 1.0);
  const mTire = flatMat(scene, "tire", new Color3(0.045, 0.045, 0.05), 0.85, 0.0);
  const mVisor = flatMat(scene, "visor", new Color3(0.08, 0.1, 0.14), 0.08, 0.9);
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

  // Main tub — rounded capsule along Z, flattened
  const tub = add(MeshBuilder.CreateCapsule("tub", { radius: 0.33, height: 1.5, tessellation: 16, capSubdivisions: 6, orientation: new Vector3(0, 0, 1) }, scene), mPaint, root);
  tub.scaling.set(1.05, 0.82, 1.0);
  tub.position.set(0, 0.0, -0.05);

  // Body side livery panels (correct text on both sides)
  for (const sx of [1, -1]) {
    const panel = add(MeshBuilder.CreateBox("livery" + sx, { width: 0.02, height: 0.42, depth: 0.95 }, scene),
      decalMat(scene, "livery" + sx, 512, 256, liverySideDraw(color, num), sx < 0), root);
    panel.position.set(0.355 * sx, 0.02, -0.1);
  }

  // Tail cowl — smooth lathe teardrop (the sprint car fuel tank/tail)
  const tailProfile: Vector3[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; tailProfile.push(new Vector3(0.02 + Math.sin((1 - t) * Math.PI * 0.5) * 0.34, t * 0.8, 0)); }
  const tail = add(MeshBuilder.CreateLathe("tail", { shape: tailProfile, tessellation: 20 }, scene), mPaintDark, root);
  tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.05, -0.95); tail.scaling.y = 1.0;

  // Nose cone — smooth taper
  const nose = add(MeshBuilder.CreateCylinder("nose", { diameterTop: 0.06, diameterBottom: 0.46, height: 0.65, tessellation: 20 }, scene), mPaint, root);
  nose.rotation.x = -Math.PI / 2; nose.position.set(0, -0.05, 1.05);

  // Cockpit recess + seat
  add(MeshBuilder.CreateSphere("seat", { diameter: 0.5, segments: 12 }, scene), mCarbon, root).position.set(0, 0.16, -0.2);

  // Driver — rounded torso + helmet + visor
  add(MeshBuilder.CreateCapsule("torso", { radius: 0.17, height: 0.42, tessellation: 12 }, scene), mCarbon, root).position.set(0, 0.28, -0.2);
  const helmet = add(MeshBuilder.CreateSphere("helmet", { diameter: 0.27, segments: 14 }, scene), flatMat(scene, "helmet", new Color3(0.92, 0.92, 0.95), 0.2, 0.1), root);
  helmet.position.set(0, 0.5, -0.16);
  add(MeshBuilder.CreateBox("visorM", { width: 0.2, height: 0.08, depth: 0.07 }, scene), mVisor, root).position.set(0, 0.5, -0.03);

  // Roll cage — smooth tubes
  const tube = (n: string, x: number, z: number, h: number) => {
    const t = add(MeshBuilder.CreateCylinder(n, { diameter: 0.045, height: h, tessellation: 10 }, scene), mChrome, root);
    t.position.set(x, 0.2 + h / 2 - 0.1, z); return t;
  };
  tube("cf1", 0.2, 0.12, 0.5); tube("cf2", -0.2, 0.12, 0.5);
  tube("cb1", 0.22, -0.45, 0.66); tube("cb2", -0.22, -0.45, 0.66);
  const halo = add(MeshBuilder.CreateTorus("halo", { diameter: 0.5, thickness: 0.045, tessellation: 16 }, scene), mChrome, root);
  halo.position.set(0, 0.52, -0.16); halo.scaling.z = 1.2;

  // Headers — chrome side pipes
  for (let i = 0; i < 4; i++) {
    const p = add(MeshBuilder.CreateCylinder("hdr" + i, { diameter: 0.055, height: 0.5, tessellation: 10 }, scene), mChrome, root);
    p.rotation.z = Math.PI / 2; p.rotation.y = 0.3; p.position.set(0.42, 0.0, 0.3 - i * 0.18);
  }

  // Nerf bars + rear bumper hoop
  for (const sx of [1, -1]) {
    const bar = add(MeshBuilder.CreateCylinder("nerf" + sx, { diameter: 0.05, height: 1.1, tessellation: 8 }, scene), mChrome, root);
    bar.rotation.x = Math.PI / 2; bar.position.set(0.6 * sx, -0.12, 0);
  }
  const hoop = add(MeshBuilder.CreateTorus("hoop", { diameter: 0.7, thickness: 0.05, tessellation: 16 }, scene), mChrome, root);
  hoop.rotation.x = Math.PI / 2; hoop.position.set(0, 0.0, -1.18);

  // --- Top wing: flat cambered deck + tall lettered dive plates + wickerbill ---
  const wingPivot = new TransformNode("wingPivot", scene); wingPivot.parent = root;
  wingPivot.position.set(0, 0.95, -0.4); wingPivot.rotation.x = -0.16;
  const deck = add(MeshBuilder.CreateBox("topDeck", { width: 1.5, height: 0.035, depth: 0.98 }, scene),
    decalMat(scene, "wdeck", 512, 256, wingDeckDraw(color)), wingPivot as unknown as TransformNode);
  deck.position.set(0, 0, 0);
  const wicker = add(MeshBuilder.CreateBox("wicker", { width: 1.5, height: 0.1, depth: 0.025 }, scene), mBlack, wingPivot as unknown as TransformNode);
  wicker.position.set(0, 0.06, -0.49);
  for (const sx of [1, -1]) {
    const plate = add(MeshBuilder.CreateBox("plate" + sx, { width: 0.03, height: 0.5, depth: 1.0 }, scene),
      decalMat(scene, "wplate" + sx, 512, 256, wingSideDraw(color, num), sx < 0), wingPivot as unknown as TransformNode);
    plate.position.set(0.75 * sx, 0.06, 0);
  }
  for (const sx of [1, -1]) {
    const post = add(MeshBuilder.CreateCylinder("wpost" + sx, { diameter: 0.05, height: 0.55, tessellation: 8 }, scene), mChrome, root);
    post.position.set(0.18 * sx, 0.66, -0.5);
  }

  // --- Front wing: white-edged foil + black endplates ---
  const fwPivot = new TransformNode("fwPivot", scene); fwPivot.parent = root;
  fwPivot.position.set(0, 0.1, 1.28); fwPivot.rotation.x = -0.14;
  add(MeshBuilder.CreateBox("frontFoil", { width: 0.98, height: 0.03, depth: 0.4 }, scene), mPaint, fwPivot as unknown as TransformNode);
  add(MeshBuilder.CreateBox("frontLip", { width: 0.98, height: 0.05, depth: 0.04 }, scene), mBlack, fwPivot as unknown as TransformNode).position.set(0, 0.01, 0.2);
  for (const sx of [1, -1]) {
    const ep = add(MeshBuilder.CreateBox("fep" + sx, { width: 0.03, height: 0.2, depth: 0.42 }, scene), mBlack, fwPivot as unknown as TransformNode);
    ep.position.set(0.49 * sx, 0.07, 0);
  }

  // --- Wheels (staggered: bigger rears, big right-rear) ---
  const layout = [
    { x: 0.62, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.24 },
    { x: -0.62, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.24 },
    { x: 0.66, z: -0.82, steer: false, drive: true, r: 0.31, w: 0.36 },
    { x: -0.68, z: -0.82, steer: false, drive: true, r: 0.33, w: 0.42 },
  ];
  const wheels: TransformNode[] = [];
  const wheelDefs: WheelDef[] = [];
  for (let i = 0; i < layout.length; i++) {
    const L = layout[i];
    const hub = buildWheel(scene, "wheel" + i, L.r, L.w, mTire, mRim, mSidewall);
    hub.parent = root;
    wheels.push(hub);
    wheelDefs.push({ posLocal: new Vector3(L.x, -0.12, L.z), steer: L.steer, drive: L.drive, visual: hub });
  }

  if (shadow) {
    for (const m of parts) shadow.addShadowCaster(m);
    for (const w of wheels) for (const cm of w.getChildMeshes()) shadow.addShadowCaster(cm as Mesh);
  }
  for (const m of parts) m.receiveShadows = true;

  const vehicle = new RaycastVehicle(scene, plugin, root, wheelDefs, DEFAULT_CONFIG);
  return { root, vehicle, wheels, bodyParts: parts };
}
