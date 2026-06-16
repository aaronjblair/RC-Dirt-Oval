import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import "@babylonjs/core/Meshes/Builders/tubeBuilder";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { RaycastVehicle, type WheelDef, type VehicleConfig } from "../physics/RaycastVehicle";
import { cloneConfig } from "./CarSetup";
import {
  type CarOptions, type BuiltCar, type Draw,
  rgb, flakeNormal, paintMat, flatMat, decalMat, imageDecalMat, buildWheel, sidewallDraw,
} from "./Car";

/**
 * Dirt Late Model — the second car class. A FULL-FENDERED WEDGE: a low pointed nose + front
 * air dam, a sloped hood rising to a tall greenhouse (windshield → roof set well back → rear
 * window), the signature SAIL PANELS bridging the roof to the rear deck, fender flares over all
 * four wheels, and a BIG rear spoiler with side boards. No top wing (the visual opposite of the
 * winged sprint car). Built from the same primitive/material helpers as `Car.ts`.
 *
 * Real Super Late Model reference: ~103" wheelbase, ~78" wide, ~2300 lb, 850+ HP V8, Hoosier
 * dirt tires with mild right-rear stagger. See the `late-car-model` skill.
 */

/** Physics baseline for the Late Model: heavier, grippier slick tin, NO wing downforce, a touch
 *  less power and more drag than the sprinter — so it carries momentum and feels planted. */
export const LATE_MODEL_CONFIG: VehicleConfig = {
  mass: 2.2,
  bodySize: new Vector3(1.5, 0.55, 2.4),
  comOffsetY: -0.16,
  suspRest: 0.18,
  wheelRadius: 0.3,
  suspStiffness: 64,
  suspDamping: 7.0,
  tireGrip: 2.0,
  corneringStiffness: 10.5,
  rollResist: 0.95,
  engineForce: 15,
  brakeForce: 20,
  maxSteer: 0.5,
  steerSpeedFalloff: 0.05,
  downforce: 0.0, // no wing
};

/** Late-model door livery: car-color base, black lower rocker, big numbered roundel + name. */
function lateLiveryDraw(color: Color3, num: number, name?: string): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h);
    // black lower rocker stripe
    ctx.fillStyle = "#0b0b0d";
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(w, h * 0.66); ctx.lineTo(0, h * 0.74); ctx.closePath(); ctx.fill();
    // diagonal accent slash
    ctx.fillStyle = "#f4f4f6";
    ctx.beginPath(); ctx.moveTo(w * 0.04, h * 0.10); ctx.lineTo(w * 0.24, h * 0.10); ctx.lineTo(w * 0.12, h * 0.6); ctx.lineTo(0, h * 0.6); ctx.closePath(); ctx.fill();
    // numbered roundel (door number)
    const cx = w * 0.5, cy = h * 0.40, r = h * 0.32;
    ctx.fillStyle = "#0b0b0d"; ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0b0b0d"; ctx.font = `bold ${r * 1.5}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(num), cx, cy + 2);
    const label = name ? name.toUpperCase() : "LATE MODEL";
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * (name ? 0.15 : 0.12)}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(label, w - 12, h - 10);
  };
}

/** Roof number panel: black roof with the car's big number (most visible surface from above). */
function roofDraw(color: Color3, num: number): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h * 0.12); ctx.fillRect(0, h * 0.88, w, h * 0.12);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * 0.6}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(num), w / 2, h * 0.52);
  };
}

/** A rounded fender flare: a half-ring tube arc that hoods over a wheel's top (front ~180°),
 *  so all four tires read as fendered. Lives in the Z-Y plane at the wheel's x, no geometry
 *  below the ground line. */
function buildFender(scene: Scene, name: string, wheelR: number, mat: PBRMaterial): Mesh {
  const R = wheelR + 0.07;
  const path: Vector3[] = [];
  // sweep from just behind the contact patch, over the top, to just ahead of it
  for (let i = 0; i <= 18; i++) {
    const a = (-0.12 + (i / 18) * 1.24) * Math.PI; // ~ -22° .. 202°
    path.push(new Vector3(0, Math.sin(a) * R, Math.cos(a) * R));
  }
  const t = MeshBuilder.CreateTube(name, { path, radius: 0.06, tessellation: 8, cap: Mesh.CAP_ALL }, scene);
  t.material = mat;
  return t;
}

export function createLateModel(
  scene: Scene,
  plugin: HavokPlugin,
  shadow: ShadowGenerator | null,
  opts: CarOptions = {}
): BuiltCar {
  const color = opts.color ?? new Color3(0.1, 0.45, 0.95);
  const num = opts.number ?? 0;
  const logoUrl = opts.logoUrl;
  const logoAspect = opts.logoAspect ?? 0.72;
  const name = logoUrl ? undefined : opts.name;
  const logoMat = logoUrl ? imageDecalMat(scene, "lmlogo", logoUrl) : null;

  const flake = flakeNormal(scene);
  const mPaint = paintMat(scene, "lmpaint", color, flake);
  const mPaintDark = paintMat(scene, "lmpaintD", color.scale(0.5), flake);
  const mBlack = flatMat(scene, "lmblk", new Color3(0.05, 0.05, 0.06), 0.4, 0.1);
  const mCarbon = flatMat(scene, "lmcarbon", new Color3(0.05, 0.05, 0.06), 0.4, 0.35);
  const mChrome = flatMat(scene, "lmchrome", new Color3(0.9, 0.9, 0.93), 0.06, 1.0);
  const mRim = flatMat(scene, "lmrim", new Color3(0.55, 0.56, 0.6), 0.3, 0.85); // machined silver beadlock
  const mTire = flatMat(scene, "lmtire", new Color3(0.045, 0.045, 0.05), 0.85, 0.0);
  mTire.backFaceCulling = false;
  const mGlass = flatMat(scene, "lmglass", new Color3(0.05, 0.07, 0.1), 0.12, 0.6);
  const mVisor = flatMat(scene, "lmvisor", new Color3(0.08, 0.1, 0.14), 0.08, 0.9);
  const mSidewall = decalMat(scene, "lmsidewall", 256, 256, sidewallDraw(), false, true);

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial, parent: TransformNode) => { m.material = mat; m.parent = parent; parts.push(m); return m; };

  // Invisible collision root
  const root = MeshBuilder.CreateBox("chassis", { width: 1.3, height: 0.4, depth: 2.3 }, scene);
  root.isVisible = false;
  root.position.copyFrom(opts.spawn ?? new Vector3(0, 0.7, 0));
  root.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), opts.yaw ?? 0);

  // Floor pan
  add(MeshBuilder.CreateBox("lmpan", { width: 1.12, height: 0.05, depth: 2.05 }, scene), mCarbon, root).position.set(0, -0.18, -0.05);

  // --- Lower body (the wide slab quarter panels / doors) ---
  const lower = add(MeshBuilder.CreateBox("lmlower", { width: 1.0, height: 0.30, depth: 1.55 }, scene), mPaint, root);
  lower.position.set(0, 0.0, -0.12);
  // Door number / livery on each side (or the hero logo)
  for (const sx of [1, -1]) {
    if (logoMat) {
      const lh = 0.24, lw = lh / logoAspect;
      const lp = add(MeshBuilder.CreatePlane("lmdoor" + sx, { width: lw, height: lh }, scene), logoMat, root);
      lp.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; lp.scaling.x = sx;
      lp.position.set(0.505 * sx, 0.02, -0.05);
    } else {
      const door = add(MeshBuilder.CreateBox("lmdoor" + sx, { width: 0.02, height: 0.27, depth: 1.0 }, scene),
        decalMat(scene, "lmdoorD" + sx, 512, 256, lateLiveryDraw(color, num, name), sx < 0), root);
      door.position.set(0.505 * sx, 0.0, -0.1);
    }
  }

  // --- Front clip: low pointed nose + air dam, sloped hood up to the cowl ---
  add(MeshBuilder.CreateBox("lmvalance", { width: 1.08, height: 0.24, depth: 0.14 }, scene), mBlack, root).position.set(0, -0.04, 1.12);
  const noseTop = add(MeshBuilder.CreateBox("lmnoseTop", { width: 0.98, height: 0.05, depth: 0.26 }, scene), mPaint, root);
  noseTop.position.set(0, 0.06, 1.0);
  const hood = add(MeshBuilder.CreateBox("lmhood", { width: 0.98, height: 0.05, depth: 0.92 }, scene), mPaint, root);
  hood.position.set(0, 0.17, 0.55); hood.rotation.x = 0.18; // nose-down wedge
  // front fender tops (body color) between the hood and the front wheels
  for (const sx of [1, -1]) {
    const ff = add(MeshBuilder.CreateBox("lmff" + sx, { width: 0.14, height: 0.22, depth: 0.7 }, scene), mPaint, root);
    ff.position.set(0.48 * sx, 0.08, 0.7);
  }

  // --- Greenhouse: windshield, roof (set back), rear window, cabin sides ---
  const windshield = add(MeshBuilder.CreateBox("lmws", { width: 0.82, height: 0.42, depth: 0.04 }, scene), mGlass, root);
  windshield.position.set(0, 0.46, 0.30); windshield.rotation.x = -0.55;
  // cabin side body panels (carry the roof; leave the window area dark glass below)
  for (const sx of [1, -1]) {
    const cs = add(MeshBuilder.CreateBox("lmcs" + sx, { width: 0.05, height: 0.46, depth: 0.62 }, scene), mPaint, root);
    cs.position.set(0.40 * sx, 0.44, -0.04);
  }
  // A-pillars
  for (const sx of [1, -1]) {
    const ap = add(MeshBuilder.CreateCylinder("lmap" + sx, { diameter: 0.05, height: 0.5, tessellation: 8 }, scene), mChrome, root);
    ap.position.set(0.36 * sx, 0.44, 0.26); ap.rotation.x = -0.55;
  }
  const roof = add(MeshBuilder.CreateBox("lmroof", { width: 0.78, height: 0.05, depth: 0.66 }, scene),
    logoMat ? mPaint : decalMat(scene, "lmroofD", 256, 256, roofDraw(color, num)), root);
  roof.position.set(0, 0.71, -0.06);
  const rearWin = add(MeshBuilder.CreateBox("lmrw", { width: 0.78, height: 0.36, depth: 0.04 }, scene), mGlass, root);
  rearWin.position.set(0, 0.5, -0.44); rearWin.rotation.x = 0.6;

  // --- Sail panels (signature): bridge the roof rear edge down to the rear deck. The RIGHT sail
  //     is taller than the left, like a real dirt late model. ---
  for (const sx of [1, -1]) {
    const tall = sx > 0; // right side taller
    const sail = add(MeshBuilder.CreateBox("lmsail" + sx, { width: 0.05, height: tall ? 0.52 : 0.40, depth: 0.5 }, scene), mPaint, root);
    sail.position.set(0.36 * sx, tall ? 0.42 : 0.36, -0.6); sail.rotation.x = 0.5;
  }

  // --- Rear deck + tail ---
  const deck = add(MeshBuilder.CreateBox("lmdeck", { width: 0.95, height: 0.05, depth: 0.55 }, scene), mPaint, root);
  deck.position.set(0, 0.30, -0.78); deck.rotation.x = 0.2;
  add(MeshBuilder.CreateBox("lmtail", { width: 0.98, height: 0.24, depth: 0.06 }, scene), mPaintDark, root).position.set(0, 0.12, -1.12);

  // --- Big rear spoiler: a tall flat blade standing off the rear deck, between two triangular
  //     side boards (the signature dirt-late-model rear). ---
  const blade = add(MeshBuilder.CreateBox("lmspoiler", { width: 1.0, height: 0.05, depth: 0.36 }, scene), mPaint, root);
  blade.position.set(0, 0.56, -1.0); blade.rotation.x = 0.42; // stands up clearly above the deck
  add(MeshBuilder.CreateBox("lmspoilerLip", { width: 1.0, height: 0.10, depth: 0.04 }, scene), mBlack, root)
    .position.set(0, 0.62, -1.12); // black trailing wickerbill so it reads against the body
  for (const sx of [1, -1]) {
    const sb = add(MeshBuilder.CreateBox("lmsb" + sx, { width: 0.05, height: 0.34, depth: 0.42 }, scene), mPaint, root);
    sb.position.set(0.48 * sx, 0.42, -1.0);
  }

  // --- Driver (visible through the windshield) ---
  add(MeshBuilder.CreateSphere("lmseat", { diameter: 0.5, segments: 12 }, scene), mCarbon, root).position.set(0, 0.18, -0.15);
  add(MeshBuilder.CreateCapsule("lmtorso", { radius: 0.16, height: 0.4, tessellation: 12 }, scene), mCarbon, root).position.set(0, 0.32, -0.1);
  const helmet = add(MeshBuilder.CreateSphere("lmhelmet", { diameter: 0.26, segments: 14 }, scene), flatMat(scene, "lmhel", new Color3(0.92, 0.92, 0.95), 0.2, 0.1), root);
  helmet.position.set(0, 0.52, -0.04);
  add(MeshBuilder.CreateBox("lmvisorM", { width: 0.19, height: 0.08, depth: 0.07 }, scene), mVisor, root).position.set(0, 0.52, 0.08);

  // --- Exhaust headers down the right side ---
  for (let i = 0; i < 3; i++) {
    const pipe = add(MeshBuilder.CreateCylinder("lmhdr" + i, { diameter: 0.05, height: 0.5, tessellation: 10 }, scene), mChrome, root);
    pipe.rotation.z = Math.PI / 2; pipe.position.set(0.5, -0.06, 0.5 - i * 0.28);
  }

  // --- Wheels: fendered, MILD stagger (RR marginally biggest) — far less than a sprinter ---
  const layout = [
    { x: 0.66, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.40 },   // front right
    { x: -0.66, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.40 },  // front left
    { x: 0.68, z: -0.82, steer: false, drive: true, r: 0.31, w: 0.50 },  // right rear (biggest)
    { x: -0.66, z: -0.82, steer: false, drive: true, r: 0.30, w: 0.48 }, // left rear
  ];
  const wheels: TransformNode[] = [];
  const wheelDefs: WheelDef[] = [];
  for (let i = 0; i < layout.length; i++) {
    const L = layout[i];
    const hub = buildWheel(scene, "lmwheel" + i, L.r, L.w, mTire, mRim, mSidewall);
    hub.parent = root;
    wheels.push(hub);
    wheelDefs.push({ posLocal: new Vector3(L.x, -0.12, L.z), steer: L.steer, drive: L.drive, visual: hub, radius: L.r });
    // fender flare hooded over this tire
    const fen = add(buildFender(scene, "lmfen" + i, L.r, mPaint), mPaint, root);
    fen.position.set(L.x, -0.12, L.z);
  }

  if (shadow) {
    for (const m of parts) shadow.addShadowCaster(m);
    for (const w of wheels) for (const cm of w.getChildMeshes()) shadow.addShadowCaster(cm as Mesh);
  }
  for (const m of parts) m.receiveShadows = true;

  const vehicle = new RaycastVehicle(scene, plugin, root, wheelDefs, cloneConfig(opts.config ?? LATE_MODEL_CONFIG));
  return { root, vehicle, wheels, bodyParts: parts };
}
