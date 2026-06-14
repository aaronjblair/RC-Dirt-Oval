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

function numberPanel(scene: Scene, n: number, color: Color3): PBRMaterial {
  const dt = new DynamicTexture("num" + n, { width: 256, height: 256 }, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = `rgb(${color.r * 255},${color.g * 255},${color.b * 255})`;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "white";
  ctx.beginPath(); ctx.arc(128, 128, 92, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#111";
  ctx.font = "bold 150px Arial Black, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(n), 128, 142);
  dt.update();
  const m = new PBRMaterial("numMat" + n, scene);
  m.albedoTexture = dt; m.roughness = 0.4; m.metallic = 0;
  return m;
}

/** Smooth tapered tire with a rounded sidewall and a spoked hub. */
function buildWheel(scene: Scene, name: string, radius: number, width: number, tireMat: PBRMaterial, hubMat: PBRMaterial): TransformNode {
  const hub = new TransformNode(name, scene);
  const tire = MeshBuilder.CreateCylinder(name + "_t", { diameter: radius * 2, height: width, tessellation: 32 }, scene);
  tire.rotation.z = Math.PI / 2; tire.parent = hub; tire.material = tireMat;
  // rounded sidewall bulges
  for (const sx of [1, -1]) {
    const wall = MeshBuilder.CreateTorus(name + "_sw" + sx, { diameter: radius * 1.7, thickness: radius * 0.5, tessellation: 24 }, scene);
    wall.rotation.z = Math.PI / 2; wall.position.x = sx * width * 0.5; wall.parent = hub; wall.material = tireMat;
  }
  const rim = MeshBuilder.CreateCylinder(name + "_w", { diameter: radius * 1.05, height: width + 0.04, tessellation: 18 }, scene);
  rim.rotation.z = Math.PI / 2; rim.parent = hub; rim.material = hubMat;
  for (let i = 0; i < 6; i++) {
    const sp = MeshBuilder.CreateBox(name + "_s" + i, { width: width + 0.05, height: radius * 0.85, depth: 0.05 }, scene);
    sp.parent = hub; sp.rotation.x = (i / 6) * Math.PI; sp.material = hubMat;
  }
  return hub;
}

/**
 * Winged 1/10 sprint car (Losi 22S silhouette), built from rounded forms
 * (capsule tub, lathe tail, cone nose, airfoil wings, smooth tires) for a less
 * blocky look. The collision root box stays invisible.
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
  const mPaintDark = paintMat(scene, "paintD", color.scale(0.8));
  const mCarbon = flatMat(scene, "carbon", new Color3(0.05, 0.05, 0.06), 0.4, 0.35);
  const mChrome = flatMat(scene, "chrome", new Color3(0.9, 0.9, 0.93), 0.06, 1.0);
  const mTire = flatMat(scene, "tire", new Color3(0.045, 0.045, 0.05), 0.85, 0.0);
  const mHub = flatMat(scene, "hub", color.scale(0.9), 0.2, 0.9);
  const mNum = numberPanel(scene, num, color);
  const mVisor = flatMat(scene, "visor", new Color3(0.08, 0.1, 0.14), 0.08, 0.9);

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
  const helmet = add(MeshBuilder.CreateSphere("helmet", { diameter: 0.27, segments: 14 }, scene), mPaintDark, root);
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

  // --- Top wing: slightly arched airfoil + curved end boards (number) ---
  const wingPivot = new TransformNode("wingPivot", scene); wingPivot.parent = root;
  wingPivot.position.set(0, 0.92, -0.35); wingPivot.rotation.x = -0.16;
  const topFoil = add(MeshBuilder.CreateCylinder("topFoil", { diameter: 1.15, height: 1.5, tessellation: 3 }, scene), mPaint, wingPivot as unknown as TransformNode);
  topFoil.rotation.z = Math.PI / 2; topFoil.scaling.set(0.06, 1, 1); // flat triangular-ish airfoil
  topFoil.position.set(0, 0, 0);
  const wicker = add(MeshBuilder.CreateBox("wicker", { width: 1.5, height: 0.12, depth: 0.03 }, scene), mPaintDark, wingPivot as unknown as TransformNode);
  wicker.position.set(0, 0.06, -0.56);
  for (const sx of [1, -1]) {
    const board = add(MeshBuilder.CreateBox("board" + sx, { width: 0.03, height: 0.55, depth: 1.1 }, scene), mNum, wingPivot as unknown as TransformNode);
    board.position.set(0.74 * sx, 0.0, 0);
  }
  const post = add(MeshBuilder.CreateCylinder("wpost", { diameter: 0.05, height: 0.5, tessellation: 8 }, scene), mChrome, root);
  post.position.set(0, 0.64, -0.5);

  // --- Front wing ---
  const fwPivot = new TransformNode("fwPivot", scene); fwPivot.parent = root;
  fwPivot.position.set(0, 0.12, 1.25); fwPivot.rotation.x = -0.12;
  add(MeshBuilder.CreateBox("frontFoil", { width: 0.95, height: 0.03, depth: 0.38 }, scene), mPaint, fwPivot as unknown as TransformNode);
  for (const sx of [1, -1]) {
    const ep = add(MeshBuilder.CreateBox("fep" + sx, { width: 0.03, height: 0.18, depth: 0.4 }, scene), mPaintDark, fwPivot as unknown as TransformNode);
    ep.position.set(0.48 * sx, 0.06, 0);
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
    const hub = buildWheel(scene, "wheel" + i, L.r, L.w, mTire, mHub);
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
