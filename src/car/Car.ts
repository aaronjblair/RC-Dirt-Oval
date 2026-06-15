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

/** Real Hoosier dirt-tire sidewall: black rubber with mold ribs, raised "HOOSIER"
 *  arc up top + gold size line below, and a punched-out center so the rim shows. */
function sidewallDraw(): Draw {
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
function buildWheel(scene: Scene, name: string, radius: number, width: number, tireMat: PBRMaterial, hubMat: PBRMaterial, sideMat: PBRMaterial): TransformNode {
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
    const nut = MeshBuilder.CreateCylinder(name + "_n" + sx, { diameter: ri * 0.55, height: 0.05, tessellation: 6 }, scene);
    nut.rotation.z = Math.PI / 2; nut.position.x = sx * (hw + 0.02); nut.parent = hub; nut.material = hubMat;
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
  mTire.backFaceCulling = false; // revolved tire carcass is single-sided — show both faces
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

  // Round front nerf bar — the sprint car's signature nose bumper hoop
  const fhoop = add(MeshBuilder.CreateTorus("fhoop", { diameter: 0.52, thickness: 0.045, tessellation: 16 }, scene), mChrome, root);
  fhoop.rotation.x = Math.PI / 2; fhoop.position.set(0, -0.06, 1.4); fhoop.scaling.y = 0.8;

  // Tubular front axle + radius rods — the exposed straight-axle front end that
  // makes a sprint car instantly recognizable.
  const axle = add(MeshBuilder.CreateCylinder("faxle", { diameter: 0.07, height: 1.26, tessellation: 12 }, scene), mChrome, root);
  axle.rotation.z = Math.PI / 2; axle.position.set(0, -0.13, 0.78);
  for (const sx of [1, -1]) {
    const rod = add(MeshBuilder.CreateCylinder("frod" + sx, { diameter: 0.035, height: 0.64, tessellation: 8 }, scene), mChrome, root);
    rod.rotation.x = Math.PI / 2; rod.position.set(0.16 * sx, -0.11, 0.47);
  }

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

  // Nerf bars + rear bumper hoop
  for (const sx of [1, -1]) {
    const bar = add(MeshBuilder.CreateCylinder("nerf" + sx, { diameter: 0.05, height: 1.1, tessellation: 8 }, scene), mChrome, root);
    bar.rotation.x = Math.PI / 2; bar.position.set(0.6 * sx, -0.12, 0);
  }
  const hoop = add(MeshBuilder.CreateTorus("hoop", { diameter: 0.7, thickness: 0.05, tessellation: 16 }, scene), mChrome, root);
  hoop.rotation.x = Math.PI / 2; hoop.position.set(0, 0.0, -1.18);

  // --- Engine block + chrome injector velocity stacks (the trumpets up top) ---
  const mEngine = flatMat(scene, "engine", new Color3(0.13, 0.13, 0.15), 0.45, 0.6);
  add(MeshBuilder.CreateBox("engineBlk", { width: 0.5, height: 0.3, depth: 0.5 }, scene), mEngine, root).position.set(0, 0.08, 0.42);
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1; const sz = i % 2 === 0 ? 1 : -1;
    const stack = add(MeshBuilder.CreateCylinder("stack" + i, { diameterTop: 0.085, diameterBottom: 0.05, height: 0.15, tessellation: 12 }, scene), mChrome, root);
    stack.position.set(0.1 * sx, 0.27, 0.42 + 0.12 * sz);
  }

  // --- Steering wheel in front of the driver ---
  const wheel = add(MeshBuilder.CreateTorus("steerW", { diameter: 0.18, thickness: 0.025, tessellation: 14 }, scene), mBlack, root);
  wheel.position.set(0, 0.3, -0.02); wheel.rotation.x = 1.15;

  // --- Rear coilover shocks ---
  for (const sx of [1, -1]) {
    const shock = add(MeshBuilder.CreateCylinder("shock" + sx, { diameter: 0.05, height: 0.34, tessellation: 10 }, scene), mChrome, root);
    shock.position.set(0.17 * sx, 0.1, -0.55); shock.rotation.x = 0.28;
  }

  // --- Top wing: the dominant feature on a sprint car — a big cambered top foil on
  //     two tall lettered wing boards, raked nose-up, with a trailing wickerbill ---
  const wingPivot = new TransformNode("wingPivot", scene); wingPivot.parent = root;
  wingPivot.position.set(0, 0.99, -0.4); wingPivot.rotation.x = -0.18;
  const deck = add(MeshBuilder.CreateBox("topDeck", { width: 1.62, height: 0.04, depth: 1.04 }, scene),
    decalMat(scene, "wdeck", 512, 256, wingDeckDraw(color)), wingPivot as unknown as TransformNode);
  deck.position.set(0, 0, 0);
  // drooped leading lip fakes the foil's camber so the wing isn't a flat slab
  const lead = add(MeshBuilder.CreateBox("wlead", { width: 1.62, height: 0.035, depth: 0.2 }, scene), mPaintDark, wingPivot as unknown as TransformNode);
  lead.position.set(0, -0.035, 0.52); lead.rotation.x = 0.34;
  const wicker = add(MeshBuilder.CreateBox("wicker", { width: 1.62, height: 0.13, depth: 0.03 }, scene), mBlack, wingPivot as unknown as TransformNode);
  wicker.position.set(0, 0.09, -0.52);
  for (const sx of [1, -1]) {
    const plate = add(MeshBuilder.CreateBox("plate" + sx, { width: 0.03, height: 0.64, depth: 1.06 }, scene),
      decalMat(scene, "wplate" + sx, 512, 256, wingSideDraw(color, num), sx < 0), wingPivot as unknown as TransformNode);
    plate.position.set(0.81 * sx, 0.13, 0);
  }
  for (const sx of [1, -1]) {
    const post = add(MeshBuilder.CreateCylinder("wpost" + sx, { diameter: 0.05, height: 0.6, tessellation: 8 }, scene), mChrome, root);
    post.position.set(0.2 * sx, 0.66, -0.5);
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
