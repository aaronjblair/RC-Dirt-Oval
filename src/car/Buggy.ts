import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import "@babylonjs/core/Meshes/Builders/ribbonBuilder";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { RaycastVehicle, type WheelDef, type VehicleConfig } from "../physics/RaycastVehicle";
import { cloneConfig } from "./CarSetup";
import {
  type CarOptions, type BuiltCar, type Draw,
  rgb, flakeNormal, paintMat, flatMat, decalMat, imageDecalMat, buildWheel, sidewallDraw,
} from "./Car";

/**
 * 1:10 RC Off-Road BUGGY — the third car class. Modeled on a modern 2WD/4WD competition
 * buggy (Team Associated RC10B6 / TLR 22X / Schumacher Cougar / Kyosho Ultima). The five
 * reads that say "RC buggy" instantly:
 *   1. KNOBBY OPEN WHEELS on long visible A-arms — narrow ribbed fronts, wide knobby rears,
 *      dished wheels with a center hex.
 *   2. HIGH GROUND CLEARANCE — a slim chassis tub riding well up on the suspension.
 *   3. FOUR EXPOSED ANGLED COILOVER SHOCKS on tall front/rear shock towers.
 *   4. A BIG FLAT HIGH-MOUNTED REAR WING (Gurney lip + end fences) + a low front splitter.
 *   5. A ONE-PIECE CAB-FORWARD LEXAN SHELL — pointed nose, molded cockpit, raised rear
 *      battery/motor hump.
 * Built from the same procedural helpers as Car.ts / LateModel.ts. Local +z = NOSE.
 */

/** Physics baseline: between the sprinter and the late model — moderate mass, tall suspension
 *  (high ride height), strong knobby grip, only a whisper of wing downforce, planted-but-lively. */
export const BUGGY_CONFIG: VehicleConfig = {
  mass: 1.9,
  bodySize: new Vector3(1.3, 0.5, 2.3),
  comOffsetY: -0.14,
  suspRest: 0.24,      // tall — high ground clearance
  wheelRadius: 0.3,
  suspStiffness: 60,
  suspDamping: 6.8,
  tireGrip: 2.0,       // grippy knobbies on dirt
  corneringStiffness: 10,
  rollResist: 0.9,
  engineForce: 22,     // brisk — between the sprint and sport-mod baselines (outdoor speed bump)
  brakeForce: 24,
  maxSteer: 0.58,
  steerSpeedFalloff: 0.05,
  downforce: 0.006,    // a touch of rear-wing grip, far less than the sprint car
  slipSteer: 0.5,      // lively but more controllable than the loose sprinter
  throttleSteer: 0.012,
};

/** Cab-forward shell side livery: car-color base, big number, white shoulder flash, name. */
function buggyLiveryDraw(color: Color3, num: number | string, name?: string, redOutline = false): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h);
    // white shoulder flash sweeping up to the rear
    ctx.fillStyle = "#f4f4f6";
    ctx.beginPath(); ctx.moveTo(0, h * 0.12); ctx.lineTo(w * 0.5, h * 0.02); ctx.lineTo(w * 0.5, h * 0.32); ctx.lineTo(0, h * 0.42); ctx.closePath(); ctx.fill();
    // black lower edge
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, h * 0.82, w, h * 0.18);
    // big side number
    ctx.font = `bold ${h * 0.62}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const cx = w * 0.68, cy = h * 0.52;
    if (redOutline) {
      ctx.lineWidth = h * 0.05; ctx.strokeStyle = "#0b0b0d"; ctx.lineJoin = "round";
      ctx.strokeText(String(num), cx, cy);
      ctx.fillStyle = "#d21414"; ctx.fillText(String(num), cx, cy);
    } else {
      ctx.fillStyle = "#0b0b0d"; ctx.fillText(String(num), cx, cy);
    }
    const label = name ? name.toUpperCase() : "BUGGY";
    ctx.fillStyle = "#0b0b0d"; ctx.font = `bold ${h * 0.13}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText(label, 10, h - 8);
  };
}

/** Ring of chunky tread knobs around a tire hub (the off-road buggy read). Axle is along X,
 *  so knobs ring in the Y-Z plane at the tread radius, in two columns across the width. */
function addKnobs(scene: Scene, hub: TransformNode, r: number, width: number, count: number, mat: PBRMaterial) {
  const hw = width / 2;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    for (const col of [-1, 1]) {
      const k = MeshBuilder.CreateBox("knob", { width: 0.06, height: 0.05, depth: 0.09 }, scene);
      k.parent = hub;
      // sit just proud of the tread, staggered column to column so it reads chunky
      const rr = r - 0.01;
      k.position.set(col * hw * 0.55, Math.sin(a) * rr, Math.cos(a) * rr);
      k.rotation.x = a;
      k.material = mat;
      k.isPickable = false;
    }
  }
}

export function createBuggy(
  scene: Scene,
  plugin: HavokPlugin,
  shadow: ShadowGenerator | null,
  opts: CarOptions = {}
): BuiltCar {
  const color = opts.color ?? new Color3(0.95, 0.78, 0.1);
  const num = opts.number ?? 0;
  const logoUrl = opts.logoUrl;
  const logoAspect = opts.logoAspect ?? 0.72;
  const redNum = !!opts.redOutlineNumber;
  const name = logoUrl ? undefined : opts.name;
  const logoMat = logoUrl ? imageDecalMat(scene, "bglogo", logoUrl) : null;

  const flake = flakeNormal(scene);
  const mPaint = paintMat(scene, "bgpaint", color, flake);
  const mPaintDark = paintMat(scene, "bgpaintD", color.scale(0.5), flake);
  const mBlack = flatMat(scene, "bgblk", new Color3(0.05, 0.05, 0.06), 0.5, 0.1);
  const mCarbon = flatMat(scene, "bgcarbon", new Color3(0.06, 0.06, 0.07), 0.4, 0.3);
  const mChrome = flatMat(scene, "bgchrome", new Color3(0.9, 0.9, 0.93), 0.08, 1.0);
  const mShock = flatMat(scene, "bgshock", new Color3(0.15, 0.45, 0.9), 0.25, 0.85); // anodized-blue alloy shocks
  const mSpring = flatMat(scene, "bgspring", new Color3(0.85, 0.85, 0.9), 0.3, 0.85);
  const mRim = flatMat(scene, "bgrim", new Color3(0.82, 0.82, 0.86), 0.2, 0.9);        // white dish wheels
  const mTire = flatMat(scene, "bgtire", new Color3(0.04, 0.04, 0.045), 0.92, 0.0);
  mTire.backFaceCulling = false;
  const mGlass = flatMat(scene, "bgglass", new Color3(0.03, 0.04, 0.06), 0.42, 0.15); // dark tinted canopy (not a bright mirror slab)
  const mSidewall = decalMat(scene, "bgsidewall", 256, 256, sidewallDraw(), false, true);

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial, parent: TransformNode) => { m.material = mat; m.parent = parent; parts.push(m); return m; };

  // Invisible collision/integration root
  const root = MeshBuilder.CreateBox("chassis", { width: 1.2, height: 0.4, depth: 2.2 }, scene);
  root.isVisible = false;
  root.position.copyFrom(opts.spawn ?? new Vector3(0, 0.7, 0));
  root.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), opts.yaw ?? 0);

  // ===== CHASSIS TUB — a slim flat carbon pan riding HIGH (so the long A-arms + clearance show) =====
  const TUB_Y = -0.02; // tub sits up off the ground (high clearance)
  add(MeshBuilder.CreateBox("bgpan", { width: 0.5, height: 0.05, depth: 1.9 }, scene), mCarbon, root).position.set(0, TUB_Y - 0.06, -0.05);
  // side rails of the tub
  for (const sx of [1, -1]) {
    add(MeshBuilder.CreateBox("bgrail" + sx, { width: 0.04, height: 0.12, depth: 1.7 }, scene), mCarbon, root).position.set(0.26 * sx, TUB_Y, -0.05);
  }
  // center motor pod / gearbox block at the rear (a buggy cue under the rear hump)
  add(MeshBuilder.CreateBox("bgpod", { width: 0.34, height: 0.22, depth: 0.5 }, scene), mBlack, root).position.set(0, TUB_Y + 0.02, -0.62);
  // saddle battery pack laid in the tub
  add(MeshBuilder.CreateBox("bgbatt", { width: 0.36, height: 0.14, depth: 0.62 }, scene), mBlack, root).position.set(0, TUB_Y + 0.06, 0.18);

  // ===== ONE-PIECE CAB-FORWARD LEXAN SHELL — pointed nose, molded cockpit, raised rear hump =====
  // station(z, hw, topY): a smooth rounded cross-section (Lexan body), narrow tub flowing up to a
  // crowned cockpit and a raised rear hump, tapering to a pointed low nose.
  const BOT = 0.0; // shell bottom rides at the tub line (high off the ground)
  const station = (z: number, hw: number, topY: number): Vector3[] => {
    const half = [
      new Vector3(hw * 0.7, BOT, z),
      new Vector3(hw, BOT + (topY - BOT) * 0.5, z),
      new Vector3(hw * 0.8, topY, z),
      new Vector3(hw * 0.4, topY + 0.02, z),
      new Vector3(0, topY + 0.03, z),
    ];
    const left = half.slice().reverse().map((p) => new Vector3(-p.x, p.y, p.z));
    const right = half.slice(1);
    return left.concat(right);
  };
  const profiles: Vector3[][] = [
    station(-1.02, 0.30, 0.10),  // tail
    station(-0.82, 0.46, 0.22),  // rear hump (raised motor/battery cover) — peak
    station(-0.58, 0.50, 0.26),  // rear hump crown
    station(-0.30, 0.50, 0.24),  // behind cockpit
    station(0.02, 0.50, 0.30),   // cockpit crown (cab forward — highest, set forward of center)
    station(0.34, 0.46, 0.18),   // cowl dropping to the nose
    station(0.66, 0.36, 0.05),   // fore body
    station(0.92, 0.24, -0.04),  // nose taper
    station(1.16, 0.10, -0.10),  // pointed low nose
  ];
  const shell = add(
    MeshBuilder.CreateRibbon("bgshell", { pathArray: profiles, closeArray: false, closePath: false, sideOrientation: Mesh.DOUBLESIDE }, scene),
    mPaint, root
  );
  shell.position.set(0, 0.06, 0);
  // cap the tail end so it doesn't read hollow
  const tailPts = profiles[0].map((p) => new Vector3(p.x, p.y + 0.06, p.z));
  add(MeshBuilder.CreateRibbon("bgcapTail", { pathArray: [tailPts, tailPts.map((p) => new Vector3(0, p.y, p.z))], sideOrientation: Mesh.DOUBLESIDE }, scene), mPaintDark, root);

  // molded COCKPIT — a dark canopy patch + a driver helmet just visible inside
  const canopy = add(MeshBuilder.CreateBox("bgcanopy", { width: 0.5, height: 0.04, depth: 0.5 }, scene), mGlass, root);
  canopy.position.set(0, 0.34, 0.04); canopy.rotation.x = -0.1;
  const helmet = add(MeshBuilder.CreateSphere("bghelmet", { diameter: 0.18, segments: 12 }, scene), flatMat(scene, "bghel", new Color3(0.9, 0.2, 0.18), 0.3, 0.1), root);
  helmet.position.set(0, 0.30, 0.06);

  // shell side livery (number + name), set on the cab-forward flank
  const SIDE_X = 0.49;
  for (const sx of [1, -1]) {
    if (logoMat) {
      const lh = 0.34, lw = lh * logoAspect;
      const lp = add(MeshBuilder.CreatePlane("bgside" + sx, { width: lw, height: lh }, scene), logoMat, root);
      lp.rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      lp.scaling.x = sx;
      lp.position.set(SIDE_X * sx, 0.18, -0.1);
    } else {
      const side = add(MeshBuilder.CreateBox("bgside" + sx, { width: 0.02, height: 0.3, depth: 0.9 }, scene),
        decalMat(scene, "bgsideD" + sx, 512, 256, buggyLiveryDraw(color, num, name, redNum), sx < 0), root);
      side.position.set(SIDE_X * sx, 0.16, -0.05);
    }
  }
  // PLAYER hero stripe + hood logo (white centerline w/ black outline), matching the other classes.
  if (logoMat) {
    const SW = 0.18, EDGE = 0.025;
    const mStripe = flatMat(scene, "bgstripe", new Color3(0.95, 0.95, 0.97), 0.3, 0.05);
    const mStripeEdge = flatMat(scene, "bgstripeEdge", new Color3(0.02, 0.02, 0.02), 0.45, 0.05);
    const striped = (n: string, d: number, y: number, z: number, rx: number) => {
      const e = add(MeshBuilder.CreateBox(n + "E", { width: SW + EDGE * 2, height: 0.02, depth: d + EDGE * 2 }, scene), mStripeEdge, root);
      e.position.set(0, y - 0.004, z); e.rotation.x = rx;
      const s = add(MeshBuilder.CreateBox(n, { width: SW, height: 0.02, depth: d }, scene), mStripe, root);
      s.position.set(0, y, z); s.rotation.x = rx;
    };
    striped("bgstripeNose", 0.5, 0.18, 0.7, 0.5);   // over the dropping nose
    striped("bgstripeRear", 0.5, 0.34, -0.6, -0.05); // over the rear hump
    const hl = 0.26, hlw = hl * (1 / logoAspect);
    const hood = add(MeshBuilder.CreatePlane("bghoodLogo", { width: hlw, height: hl }, scene), logoMat, root);
    hood.rotation.set(Math.PI / 2 + 0.2, 0, 0);
    hood.position.set(0, 0.32, -0.5);
  }

  // ===== LOW FRONT SPLITTER (a wide flat lip jutting forward under the pointed nose) =====
  const splitter = add(MeshBuilder.CreateBox("bgsplitter", { width: 0.7, height: 0.02, depth: 0.26 }, scene), mCarbon, root);
  splitter.position.set(0, -0.12, 1.12);
  add(MeshBuilder.CreateBox("bgsplitterEdge", { width: 0.7, height: 0.03, depth: 0.02 }, scene), mBlack, root).position.set(0, -0.115, 1.24);

  // ===== BIG FLAT HIGH-MOUNTED REAR WING (Gurney lip + end fences, on two struts) =====
  const WING_W = 0.96, WING_Y = 0.46, WING_Z = -1.02;
  const wing = add(MeshBuilder.CreateBox("bgwing", { width: WING_W, height: 0.02, depth: 0.34 }, scene), mPaint, root);
  wing.position.set(0, WING_Y, WING_Z); wing.rotation.x = 0.14;
  // Gurney lip along the trailing edge
  add(MeshBuilder.CreateBox("bgwingGurney", { width: WING_W, height: 0.05, depth: 0.02 }, scene), mBlack, root).position.set(0, WING_Y + 0.04, WING_Z - 0.16);
  // end fences
  for (const sx of [1, -1]) {
    add(MeshBuilder.CreateBox("bgwingfence" + sx, { width: 0.02, height: 0.12, depth: 0.34 }, scene), mPaintDark, root).position.set((WING_W / 2) * sx, WING_Y + 0.04, WING_Z);
    // strut down to the rear deck
    const strut = add(MeshBuilder.CreateBox("bgwingstrut" + sx, { width: 0.03, height: 0.22, depth: 0.04 }, scene), mBlack, root);
    strut.position.set(0.3 * sx, WING_Y - 0.12, WING_Z + 0.04);
  }

  // ===== SHOCK TOWERS + FOUR EXPOSED ANGLED COILOVER SHOCKS =====
  const towerF = add(MeshBuilder.CreateBox("bgtowerF", { width: 0.4, height: 0.26, depth: 0.03 }, scene), mCarbon, root);
  towerF.position.set(0, 0.16, 0.76);
  const towerR = add(MeshBuilder.CreateBox("bgtowerR", { width: 0.42, height: 0.28, depth: 0.03 }, scene), mCarbon, root);
  towerR.position.set(0, 0.18, -0.78);

  // ===== WHEELS on visible A-ARMS — narrow ribbed fronts, wide knobby rears, dished w/ hex =====
  const layout = [
    { x: 0.62, z: 0.78, steer: true, drive: false, r: 0.30, w: 0.34, knobs: 8 },   // front right (narrower)
    { x: -0.62, z: 0.78, steer: true, drive: false, r: 0.30, w: 0.34, knobs: 8 },  // front left
    { x: 0.66, z: -0.80, steer: false, drive: true, r: 0.34, w: 0.52, knobs: 10 }, // rear right (wide knobby, slight stagger)
    { x: -0.65, z: -0.80, steer: false, drive: true, r: 0.33, w: 0.50, knobs: 10 },// rear left
  ];
  const wheels: TransformNode[] = [];
  const wheelDefs: WheelDef[] = [];
  for (let i = 0; i < layout.length; i++) {
    const L = layout[i];
    const hub = buildWheel(scene, "bgwheel" + i, L.r, L.w, mTire, mRim, mSidewall);
    hub.parent = root;
    addKnobs(scene, hub, L.r, L.w, L.knobs, mTire);
    // center hex / dish bolt
    for (const sx of [1, -1]) {
      const hex = MeshBuilder.CreateCylinder("bghex" + i + sx, { diameter: 0.07, height: 0.03, tessellation: 6 }, scene);
      hex.rotation.z = Math.PI / 2; hex.position.x = sx * (L.w / 2 + 0.01); hex.parent = hub; hex.material = mChrome;
    }
    wheels.push(hub);
    wheelDefs.push({ posLocal: new Vector3(L.x, -0.1, L.z), steer: L.steer, drive: L.drive, visual: hub, radius: L.r });

    // visible long A-ARMS (lower + upper) linking the tub to the wheel, plus a turnbuckle
    const sgn = Math.sign(L.x) || 1;
    const lower = add(MeshBuilder.CreateBox("bgarmL" + i, { width: 0.36, height: 0.04, depth: 0.1 }, scene), mBlack, root);
    lower.position.set((Math.abs(L.x) - 0.18) * sgn + 0.18 * sgn, -0.16, L.z);
    lower.position.x = (Math.abs(L.x) * 0.5) * sgn; // span from tub side to the hub
    lower.scaling.x = 1;
    const upper = add(MeshBuilder.CreateBox("bgarmU" + i, { width: 0.30, height: 0.03, depth: 0.06 }, scene), mBlack, root);
    upper.position.set((Math.abs(L.x) * 0.55) * sgn, -0.02, L.z);

    // EXPOSED ANGLED COILOVER SHOCK from the tower down-out to the wheel: a spring body + shaft.
    const towerTopY = L.z > 0 ? 0.28 : 0.31;
    const topX = 0.16 * sgn, topZ = L.z > 0 ? 0.76 : -0.78;
    const botX = (Math.abs(L.x) - 0.06) * sgn, botY = -0.14, botZ = L.z;
    const midX = (topX + botX) / 2, midY = (towerTopY + botY) / 2, midZ = (topZ + botZ) / 2;
    const len = Math.hypot(botX - topX, botY - towerTopY, botZ - topZ);
    const shock = add(MeshBuilder.CreateCylinder("bgshockBody" + i, { diameter: 0.07, height: len * 0.7, tessellation: 10 }, scene), mShock, root);
    const spring = add(MeshBuilder.CreateCylinder("bgshockSpring" + i, { diameter: 0.1, height: len * 0.62, tessellation: 10 }, scene), mSpring, root);
    for (const s of [shock, spring]) {
      s.position.set(midX, midY, midZ);
      // aim the cylinder (default +Y) along the shock axis
      const dir = new Vector3(botX - topX, botY - towerTopY, botZ - topZ).normalize();
      const axis = Vector3.Cross(new Vector3(0, 1, 0), dir);
      const ang = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(new Vector3(0, 1, 0), dir))));
      if (axis.lengthSquared() > 1e-6) s.rotationQuaternion = Quaternion.RotationAxis(axis.normalize(), ang);
    }
  }

  if (shadow) {
    for (const m of parts) shadow.addShadowCaster(m);
    for (const w of wheels) for (const cm of w.getChildMeshes()) shadow.addShadowCaster(cm as Mesh);
  }
  for (const m of parts) m.receiveShadows = true;

  const vehicle = new RaycastVehicle(scene, plugin, root, wheelDefs, cloneConfig(opts.config ?? BUGGY_CONFIG));
  return { root, vehicle, wheels, bodyParts: parts };
}
