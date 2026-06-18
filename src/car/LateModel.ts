import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import "@babylonjs/core/Meshes/Builders/tubeBuilder";
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
 * Dirt Late Model — the second car class. A SQUAT, SOLID, WIDE WEDGE — one continuous body
 * mass (a chopped & widened stock car), NOT an open-wheeler. The body is WIDER than the wheel
 * track, so all four tires tuck UNDER the bodywork and only the lower outer face of each tire
 * peeks out below the fender arch. Reads instantly as: low full-width hood + ground splitter,
 * continuous SLAB SIDES (closed doors — no see-through gap to the chassis), fender bulges that
 * are part of the body side (NOT separate floating pods), a small cab set center-to-rear, tall
 * solid SAIL PANELS closing the rear, a high rear deck, and a WIDE FLAT RAKED SPOILER spanning
 * nearly the full body width. No top wing (the visual opposite of the winged sprint car). No
 * exposed tube framework, no wheels on struts. Built from the same helpers as `Car.ts`.
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
  steerSpeedFalloff: 0.06,
  downforce: 0.0, // no wing
  slipSteer: 0.42,     // planted, momentum car — much less tail-happy than the sprinter
  throttleSteer: 0.009,
};

/** Late-model door livery: car-color base, black lower rocker, big numbered roundel + name.
 *  `redOutline`: draw the door number as RED glyphs with a BLACK outline (the #42 livery). */
function lateLiveryDraw(color: Color3, num: number, name?: string, redOutline = false): Draw {
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
    ctx.font = `bold ${r * 1.5}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (redOutline) {
      ctx.lineWidth = r * 0.16; ctx.strokeStyle = "#0b0b0d"; ctx.lineJoin = "round";
      ctx.strokeText(String(num), cx, cy + 2);
      ctx.fillStyle = "#d21414"; ctx.fillText(String(num), cx, cy + 2);
    } else {
      ctx.fillStyle = "#0b0b0d"; ctx.fillText(String(num), cx, cy + 2);
    }
    const label = name ? name.toUpperCase() : "LATE MODEL";
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * (name ? 0.15 : 0.12)}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(label, w - 12, h - 10);
  };
}

/** Roof number panel: black roof with the car's big number (most visible surface from above).
 *  `redOutline`: RED glyph + black outline (the #42 livery). */
function roofDraw(color: Color3, num: number, redOutline = false): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h * 0.12); ctx.fillRect(0, h * 0.88, w, h * 0.12);
    ctx.font = `bold ${h * 0.6}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (redOutline) {
      ctx.lineWidth = h * 0.05; ctx.strokeStyle = "#0b0b0d"; ctx.lineJoin = "round";
      ctx.strokeText(String(num), w / 2, h * 0.52);
      ctx.fillStyle = "#d21414"; ctx.fillText(String(num), w / 2, h * 0.52);
    } else {
      ctx.fillStyle = "#fff"; ctx.fillText(String(num), w / 2, h * 0.52);
    }
  };
}

/** A solid BODY-COLOR FENDER arching OVER a wheel — a rounded sheet-metal mass covering the
 *  top ~2/3 of the tire, flush with and continuous from the body side. Built as a lofted shell:
 *  cross-sections swept fore→aft over the top of the wheel, each cross-section running from the
 *  body's outer skin (inboard, `inX`) up over the crown and OUT to just past the tire's outer
 *  face (`outX`), then down the outboard side. So the fender is the WIDEST plane on the car,
 *  overhanging the tire — NOT a floating pod on an arm. Built centred on the wheel's local
 *  origin (its z is set by the caller); sweeps in Z, crowns over the tire in Y. */
function buildFender(scene: Scene, name: string, wheelR: number, inX: number, outX: number): Mesh {
  // Sweep fore↔aft (Z). At each Z station build a curved cross-section (an arch rib) that goes
  // from the inboard body skin, up over the wheel crown, and down to the outboard skirt — the
  // arch radius shrinks toward the front/back so the fender wraps down around the tire ends.
  const zSegs = 11;
  const rib = 7;                          // points per cross-section arch
  const z0 = -(wheelR + 0.16), z1 = wheelR + 0.16; // fender slightly longer than the tire
  const path: Vector3[][] = [];
  for (let i = 0; i <= zSegs; i++) {
    const t = i / zSegs;
    const z = z0 + (z1 - z0) * t;
    // how far over the tire this station crowns: full at centre, tucking down toward the ends
    const tube = Math.sqrt(Math.max(0, 1 - Math.pow((z) / (wheelR + 0.18), 2)));
    const crownY = wheelR * 1.05 * tube; // crown height above axle, drops at the fore/aft ends
    const sect: Vector3[] = [];
    for (let j = 0; j <= rib; j++) {
      const a = (j / rib) * Math.PI;       // 0 = inboard low, PI/2 = top crown, PI = outboard low
      // x sweeps inboard→outboard; y arches up to the crown
      const x = inX + (outX - inX) * (1 - Math.cos(a)) * 0.5;
      const y = Math.sin(a) * crownY - wheelR * 0.12;
      sect.push(new Vector3(x, y, z));
    }
    path.push(sect);
  }
  const m = MeshBuilder.CreateRibbon(name, { pathArray: path, closeArray: false, closePath: false, sideOrientation: Mesh.DOUBLESIDE }, scene);
  return m;
}

/** A dark WHEEL-ARCH LIP skinning the rounded opening at the bottom of a fender (just the thin
 *  trim band around the wheel cut). Built centred on the wheel; lives at the fender's outer x. */
function buildArchSkirt(scene: Scene, name: string, wheelR: number, outerX: number, mat: PBRMaterial): Mesh {
  const segs = 9;
  const rArch = wheelR + 0.12;          // arch radius (just outside the tire)
  const a0 = -1.15, a1 = 1.15;          // sweep from front-low up over the top to rear-low
  const inX = outerX - 0.05;            // thin lip
  const path: Vector3[][] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (a1 - a0) * (i / segs);
    const z = Math.sin(a) * rArch;
    const y = Math.cos(a) * rArch - wheelR * 0.2; // crown above axle, drops fore/aft
    path.push([
      new Vector3(outerX, y, z),
      new Vector3(inX, y - 0.02, z),
    ]);
  }
  const m = MeshBuilder.CreateRibbon(name, { pathArray: path, sideOrientation: Mesh.DOUBLESIDE }, scene);
  m.material = mat;
  return m;
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
  const redNum = !!opts.redOutlineNumber; // #42 livery: red glyph + black outline numbers
  const name = logoUrl ? undefined : opts.name;
  const logoMat = logoUrl ? imageDecalMat(scene, "lmlogo", logoUrl) : null;

  const flake = flakeNormal(scene);
  const mPaint = paintMat(scene, "lmpaint", color, flake);
  const mPaintDark = paintMat(scene, "lmpaintD", color.scale(0.5), flake);
  const mBlack = flatMat(scene, "lmblk", new Color3(0.05, 0.05, 0.06), 0.4, 0.1);
  const mCarbon = flatMat(scene, "lmcarbon", new Color3(0.05, 0.05, 0.06), 0.4, 0.35);
  const mChrome = flatMat(scene, "lmchrome", new Color3(0.9, 0.9, 0.93), 0.06, 1.0);
  // Bare/brushed aluminum for the roll-cage tubes glimpsed through the glass — bright, a touch
  // rougher than chrome so night lighting + bloom read it as raw metal, not paint.
  const mAlu = flatMat(scene, "lmalu", new Color3(0.74, 0.75, 0.78), 0.22, 0.92);
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
  add(MeshBuilder.CreateBox("lmpan", { width: 1.3, height: 0.05, depth: 2.05 }, scene), mCarbon, root).position.set(0, -0.18, -0.05);

  // ===================================================================================
  //  DIRT LATE MODEL BODY — a LOW, WIDE, SQUAT, FULL-BODIED WEDGE (a chopped/widened stock
  //  car, NOT an open-wheeler). Local +z = NOSE (front), -z = TAIL. The silhouette a viewer
  //  reads instantly: a low full-width hood + air dam, continuous SLAB SIDES (one body side
  //  joining the front & rear fenders — no open-wheel gap), bulging fenders that the tires
  //  tuck UNDER, a small cab set center-to-rear, tall flat SAIL PANELS off the roof to the
  //  tail, a high rear deck, and a WIDE FLAT RAKED SPOILER spanning nearly the full width.
  //  The body is VERY WIDE — the slab + fenders are as wide as the track.
  // ===================================================================================
  const BOT = -0.26;   // slab body bottom (rocker line) — sits LOW, down around the tire faces
  const DECK = 0.06;   // top of the low slab deck / hood crown plateau (dropped — LOW squat wedge)
  const HW = 0.80;     // body half-width through the middle (fenders reach this far out;
                       // wheels at x≈0.66 tuck INSIDE, so the body is WIDER than the track)

  // --- MAIN SLAB BODY: ONE continuous skinned shell (CreateRibbon). A wide, flat-topped wedge
  //     that is FULL width (HW) and flat-sided down the WHOLE midsection — true slab sides from
  //     the deck down to a low rocker, with NO see-through gap. The side wall comes down low
  //     (BOT) so the body SWALLOWS the wheels: tires at x≈0.66 sit inboard of the HW=0.80 outer
  //     skin and below the fender crown, so only their lower outer face peeks out under the
  //     arch. The fender bulge is part of THIS body (the side wall *is* the fender) — there are
  //     NO separate floating pods. ---
  // station(z, halfWidth, topY): a flat-topped box-ish cross-section with a near-vertical slab
  // side and slightly tucked top corners so it reads as solid sheet metal, not a brick.
  const station = (z: number, hw: number, topY: number): Vector3[] => {
    const tw = hw * 0.94; // top only slightly narrower than the rocker (broad flat deck)
    const half = [
      new Vector3(hw * 0.86, BOT, z),                  // rocker tuck (bottom pulls in a touch)
      new Vector3(hw, BOT + 0.06, z),                  // full-width lower side
      new Vector3(hw, BOT + (topY - BOT) * 0.78, z),   // upper side (near-vertical slab)
      new Vector3(tw * 0.99, topY * 0.99, z),          // shoulder
      new Vector3(tw * 0.55, topY, z),                 // deck
      new Vector3(0, topY, z),                         // centre
    ];
    const left = half.slice().reverse().map((p) => new Vector3(-p.x, p.y, p.z));
    const right = half.slice(1);
    return left.concat(right);
  };

  // z runs tail(-1.18) → nose(+1.34).  Wedge: FULL width & flat through the middle (the slab is
  // HW wide from the rear fenders all the way to the front fenders, so the sides are one closed
  // wall). The nose stays WIDE (only a modest taper) and drops low; the tail keeps the high
  // deck. Front & rear fender bulges are simply where the side wall stays at full HW.
  const profiles: Vector3[][] = [
    station(-1.18, 0.70, 0.18),   // tail — HIGH rear deck (wedge rises to the rear; no sunken bed)
    station(-1.00, HW, 0.24),     // over the rear fenders — full width, high deck
    station(-0.82, HW, 0.26),     // rear-deck crown (peak of the wedge)
    station(-0.60, HW, 0.24),     // high rear deck
    station(-0.30, HW, 0.15),     // deck steps down toward the cab
    station(-0.10, HW, 0.07),     // mid body — full width, flat low slab top
    station(0.20, HW, 0.07),
    station(0.45, HW, 0.05),      // cowl
    station(0.66, HW, 0.02),      // front-fender crown — full width
    station(0.82, HW, -0.02),     // over the front fenders — full width
    station(0.98, 0.74, -0.07),   // wide low hood (taper begins ahead of the front wheels)
    station(1.18, 0.62, -0.16),
    station(1.34, 0.46, -0.22),   // low wide nose (blunt, not pointed)
  ];

  const shell = add(
    MeshBuilder.CreateRibbon("lmshell", { pathArray: profiles, closeArray: false, closePath: false, sideOrientation: Mesh.DOUBLESIDE }, scene),
    mPaint, root
  );
  shell.position.set(0, 0, 0);

  // close the two open ends so there is no hollow look
  const capEnd = (prof: Vector3[], nm: string, m: PBRMaterial) => {
    const pts = prof.map((p) => new Vector3(p.x, p.y, p.z));
    add(MeshBuilder.CreateRibbon(nm, { pathArray: [pts, pts.map((p) => new Vector3(0, p.y, p.z))], sideOrientation: Mesh.DOUBLESIDE }, scene), m, root);
  };
  capEnd(profiles[0], "lmcapTail", mPaintDark);
  capEnd(profiles[profiles.length - 1], "lmcapNose", mPaint);

  // --- DOOR LIVERY (number + name) on each continuous SLAB SIDE, set on the door panel
  //     between the front & rear fenders. The body side is full-height here, so the door is
  //     tall and reads big. ---
  const DOOR_X = HW - 0.01;
  for (const sx of [1, -1]) {
    if (logoMat) {
      // Super Jay logo on the door — portrait aspect, enlarged, rotated 90° to fit the
      // wide-short door (matches the sprint wing treatment).
      const lh = 0.42, lw = lh * logoAspect;
      const lp = add(MeshBuilder.CreatePlane("lmdoor" + sx, { width: lw, height: lh }, scene), logoMat, root);
      lp.rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, (Math.PI / 2) * sx);
      lp.scaling.x = sx;
      lp.position.set(DOOR_X * sx, -0.04, -0.02);
    } else {
      const door = add(MeshBuilder.CreateBox("lmdoor" + sx, { width: 0.02, height: 0.28, depth: 1.0 }, scene),
        decalMat(scene, "lmdoorD" + sx, 512, 256, lateLiveryDraw(color, num, name, redNum), sx < 0), root);
      door.position.set(DOOR_X * sx, -0.04, -0.06);
    }
  }

  // --- PLAYER-ONLY HERO LIVERY: a WHITE centerline racing stripe with a thin black outline
  //     running down the body crown (hood/nose + rear deck), plus a Super Jay logo decal laid
  //     flat on the hood. Same technique as the sprint car (Car.ts): a white box riding the
  //     crown over a slightly larger black box so a fine black border peeks out on every edge.
  //     The full-width cab/greenhouse interrupts the stripe (like the sprinter's open cockpit),
  //     so the run is split into a HOOD section (front) and a REAR-DECK section. Gated on the
  //     player car (logoMat / logoUrl set) — AI cars never get it. ---
  if (logoMat) {
    const SW = 0.40;   // stripe width ≈ 1/4 of the body (HW*2 = 1.6u)
    const EDGE = 0.03; // black outline that peeks out on each side / end
    const mStripe = flatMat(scene, "lmstripe", new Color3(0.95, 0.95, 0.97), 0.3, 0.05);
    const mStripeEdge = flatMat(scene, "lmstripeEdge", new Color3(0.02, 0.02, 0.02), 0.45, 0.05);
    // each segment rides the body crown at the local deck height (topY) for that z, with a small
    // rake (rx) so it follows the sloping hood/deck instead of floating
    const striped = (n: string, d: number, y: number, z: number, rx: number) => {
      const e = add(MeshBuilder.CreateBox(n + "Edge", { width: SW + EDGE * 2, height: 0.02, depth: d + EDGE * 2 }, scene), mStripeEdge, root);
      e.position.set(0, y - 0.004, z); e.rotation.x = rx;
      const s = add(MeshBuilder.CreateBox(n, { width: SW, height: 0.02, depth: d }, scene), mStripe, root);
      s.position.set(0, y, z); s.rotation.x = rx; return s;
    };
    // HOOD / NOSE: from the cowl forward over the dropping hood crown to the blunt nose
    // (z ≈ 0.45 → 1.30, topY drops ~0.04 → -0.20). Two raked segments follow the slope.
    striped("lmstripeHoodR", 0.30, 0.05, 0.58, 0.18);   // cowl → front-fender crown
    striped("lmstripeHoodF", 0.50, -0.07, 1.02, 0.42);  // front fenders → nose (steeper drop)
    // REAR DECK: along the high rear deck crown behind the cab (z ≈ -0.30 → -1.05, topY ~0.15 → 0.24).
    striped("lmstripeDeckF", 0.34, 0.18, -0.36, -0.22); // deck step up off the cab
    striped("lmstripeDeck", 0.56, 0.27, -0.76, 0.0);    // high rear-deck crown
    // SUPER JAY LOGO on the HOOD — a flat decal laid on the hood crown, reading from above/front,
    // raked to match the hood slope. In ADDITION to the door logo (kept above).
    const hl = 0.34, hlw = hl * (1 / logoAspect); // landscape on the hood (aspect inverted)
    const hood = add(MeshBuilder.CreatePlane("lmhoodLogo", { width: hlw, height: hl }, scene), logoMat, root);
    hood.rotation.set(Math.PI / 2 + 0.30, 0, 0); // lie flat on the hood, tilted up to face front/above
    hood.position.set(0, 0.07, 0.70);
  }

  // --- Slab-side panel detail: a beltline trim, a body-side rocker skirt, a centred hood
  //     seam + carbon vent slots, and a dark cowl strip at the windshield base. ---
  for (const sx of [1, -1]) {
    const belt = add(MeshBuilder.CreateBox("lmbelt" + sx, { width: 0.012, height: 0.026, depth: 1.7 }, scene), mBlack, root);
    belt.position.set(DOOR_X * sx, 0.045, -0.04);
    // low rocker / side-skirt panel running along the body bottom between the fenders (sits at
    // the new low rocker line, closing the body down to near the tire faces)
    const skirt = add(MeshBuilder.CreateBox("lmskirt" + sx, { width: 0.03, height: 0.14, depth: 1.1 }, scene), mBlack, root);
    skirt.position.set((DOOR_X - 0.04) * sx, -0.205, -0.05);
  }
  // hood centre seam (raised rib up the sloping nose) + two flanking carbon vent slots
  const hoodSeam = add(MeshBuilder.CreateBox("lmhoodseam", { width: 0.035, height: 0.025, depth: 0.95 }, scene), mPaintDark, root);
  hoodSeam.position.set(0, 0.02, 0.78); hoodSeam.rotation.x = 0.30;
  for (const sx of [1, -1]) {
    const vent = add(MeshBuilder.CreateBox("lmhoodvent" + sx, { width: 0.16, height: 0.012, depth: 0.30 }, scene), mCarbon, root);
    vent.position.set(0.26 * sx, 0.04, 0.72); vent.rotation.x = 0.30;
  }
  // dark cowl strip at the base of the windshield (separates hood from the full-width greenhouse)
  add(MeshBuilder.CreateBox("lmcowl", { width: HW * 1.9, height: 0.03, depth: 0.12 }, scene), mCarbon, root).position.set(0, DECK + 0.03, 0.40);

  // --- FRONT: low + wide. A full-width black air-dam valance under the nose + a wide matte
  //     SPLITTER lip jutting forward near the ground across the FULL width (the defining nose
  //     cue — a protruding full-width splitter, not a rounded snout). ---
  add(MeshBuilder.CreateBox("lmvalance", { width: 1.5, height: 0.22, depth: 0.14 }, scene), mBlack, root).position.set(0, -0.13, 1.18);
  const splitter = add(MeshBuilder.CreateBox("lmsplitter", { width: 1.74, height: 0.03, depth: 0.42 }, scene), mCarbon, root);
  splitter.position.set(0, -0.215, 1.36);
  // splitter front edge trim — emphasises the protruding full-width lip
  add(MeshBuilder.CreateBox("lmsplitterEdge", { width: 1.74, height: 0.05, depth: 0.03 }, scene), mBlack, root)
    .position.set(0, -0.205, 1.565);

  // ===================================================================================
  //  CAB / GREENHOUSE — FULL-WIDTH (edge to edge), set BACK toward the rear third, and LOW
  //  (chopped). A steeply RAKED windshield, A-pillars, a short flat roof, side windows, and a
  //  rear window. A wide chopped canopy spanning the body width — not a narrow cabin.
  // ===================================================================================
  const ROOF_Y = 0.40;      // roof underside ~at top, deck at DECK (0.06) — LOW chopped cab
  const CAB_Z = -0.16;      // cab centre, set back behind mid
  // FULL-WIDTH greenhouse: the cab spans nearly the WHOLE body width — "all the way across the
  // car," a wide chopped canopy, NOT a narrow cabin. Its half-width CAB_HW now EQUALS the body
  // half-width HW (0.80), so the windshield, roof, rear window, side windows, A-pillars and roof
  // number panel run from edge to edge (just inside the body skin, no overhang). Every greenhouse
  // part keys off CAB_HW so they stay full-width together.
  const CAB_HW = HW;        // cab half-width = body half-width (0.80) — FULL width, edge to edge
  // raked windshield (steep), set at the cab front — spans ~the full width just inside the edges
  const windshield = add(MeshBuilder.CreateBox("lmws", { width: CAB_HW * 1.86, height: 0.24, depth: 0.04 }, scene), mGlass, root);
  windshield.position.set(0, 0.26, CAB_Z + 0.28); windshield.rotation.x = -0.72;
  // A-pillars flanking the windshield (at the full-width cab edges)
  for (const sx of [1, -1]) {
    const pil = add(MeshBuilder.CreateBox("lmApil" + sx, { width: 0.035, height: 0.30, depth: 0.05 }, scene), mPaintDark, root);
    pil.position.set((CAB_HW - 0.04) * sx, 0.24, CAB_Z + 0.26); pil.rotation.x = -0.72;
  }
  // side windows (in the full-width cab sides)
  for (const sx of [1, -1]) {
    const win = add(MeshBuilder.CreateBox("lmsw" + sx, { width: 0.04, height: 0.16, depth: 0.40 }, scene), mGlass, root);
    win.position.set((CAB_HW - 0.02) * sx, 0.28, CAB_Z - 0.04);
  }
  // rear window (raked the other way) — full width
  const rearWin = add(MeshBuilder.CreateBox("lmrw", { width: CAB_HW * 1.82, height: 0.18, depth: 0.04 }, scene), mGlass, root);
  rearWin.position.set(0, 0.28, CAB_Z - 0.30); rearWin.rotation.x = 0.66;
  // SHORT FLAT ROOF (body-color cap) over the full-width cab — runs nearly edge to edge
  const roofCap = add(MeshBuilder.CreateBox("lmRoofCap", { width: CAB_HW * 1.9, height: 0.06, depth: 0.5 }, scene), mPaint, root);
  roofCap.position.set(0, ROOF_Y, CAB_Z); roofCap.rotation.x = -0.02;
  // roof number panel — wide on the now-full-width roof
  if (!logoMat) {
    const rp = add(MeshBuilder.CreateBox("lmroofPanel", { width: CAB_HW * 1.5, height: 0.02, depth: 0.40 }, scene),
      decalMat(scene, "lmroofD", 256, 256, roofDraw(color, num, redNum)), root);
    rp.position.set(0, ROOF_Y + 0.04, CAB_Z); rp.rotation.x = -0.02;
  }
  // dark drip rails along the roof edges + a centred carbon roof rib
  for (const sx of [1, -1]) {
    const rail = add(MeshBuilder.CreateBox("lmroofrail" + sx, { width: 0.018, height: 0.024, depth: 0.5 }, scene), mBlack, root);
    rail.position.set((CAB_HW - 0.02) * sx, ROOF_Y + 0.03, CAB_Z); rail.rotation.x = -0.02;
  }

  // --- A HINT OF THE ROLL CAGE visible through the windshield / side windows: a forward
  //     halo hoop + a windshield bar (aluminum tube), just inside the glass. Sized to the
  //     full-width cab. ---
  const cageHoop = add(MeshBuilder.CreateTorus("lmcage", { diameter: CAB_HW * 1.7, thickness: 0.022, tessellation: 14 }, scene), mAlu, root);
  cageHoop.rotation.x = Math.PI / 2 - 0.15; cageHoop.position.set(0, 0.30, CAB_Z + 0.02);
  const dashBar = add(MeshBuilder.CreateCylinder("lmcagebar", { diameter: 0.024, height: CAB_HW * 1.7, tessellation: 8 }, scene), mAlu, root);
  dashBar.rotation.z = Math.PI / 2; dashBar.position.set(0, 0.20, CAB_Z + 0.18);

  // ===================================================================================
  //  SAIL PANELS — THE DEFINING FEATURE. Two tall flat vertical body-color fins running
  //  from the roof's trailing edge straight back to the rear of the car, each with a
  //  cut-out window/opening. Built as flat quads in the Y-Z plane at the roof edges.
  // ===================================================================================
  for (const sx of [1, -1]) {
    // Sails rise from the WIDE rear QUARTERS at the body edges and sweep from the roof's trailing
    // edge straight back & gently down to the tail, closing the rear quarters. With the full-width
    // cab the sails sit just inboard of the body skin (HW) so they flank the roof/rear window.
    const SX = (HW - 0.06) * sx;
    // outline (z, y): top edge from roof rear, back & gently down to the tail; bottom on deck
    const fz = CAB_Z - 0.24;  // front (under the roof rear)
    const rz = -1.12;         // rear (tail)
    const topF = ROOF_Y - 0.02, topR = 0.30, botY = 0.23; // bottom raised to the HIGH rear deck so the sails are SHORT fins, not deep bed walls
    add(MeshBuilder.CreateRibbon("lmsail" + sx, {
      pathArray: [
        [new Vector3(SX, topF, fz), new Vector3(SX, topR, rz)],   // top edge
        [new Vector3(SX, botY, fz), new Vector3(SX, botY, rz)],   // bottom edge (deck)
      ],
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene), mPaint, root);
    // CUT-OUT window: a dark glass patch set on the sail (the late-model sail opening)
    const hole = add(MeshBuilder.CreateBox("lmsailwin" + sx, { width: 0.012, height: 0.13, depth: 0.34 }, scene), mGlass, root);
    hole.position.set(SX, 0.22, -0.72);
    // dark trailing-edge trim down the rear of the sail
    const sailEdge = add(MeshBuilder.CreateBox("lmsailEdge" + sx, { width: 0.018, height: 0.24, depth: 0.02 }, scene), mBlack, root);
    sailEdge.position.set(SX, 0.18, rz);
  }
  // a thin roof-rear cross panel tying the wide cab back down to the deck
  add(MeshBuilder.CreateBox("lmsailtie", { width: CAB_HW * 1.82, height: 0.025, depth: 0.36 }, scene), mPaintDark, root)
    .position.set(0, ROOF_Y - 0.04, CAB_Z - 0.36);

  // --- CLOSE THE REAR (no open bed): a SOLID full-width rear body block filling from behind the
  //     cab all the way back to the tail, so the back of the car reads as a closed solid wedge —
  //     NO pickup-bed cavity, no see-into-interior. The sails sweep down onto this solid deck. ---
  // solid rear body block spanning the full width, from the cab back to the tail, tall enough to
  // close the cavity from the deck top down into the body (one filled mass, not a thin lid)
  // FILL the rear SOLID — a full-width body-color block from the deck up to the roofline behind the
  // cab, so the back of the car is one solid fastback wedge with NO open bed/well at all (earlier
  // shorter/narrower caps still left a recessed bed). The sail fins sit on top of this solid mass.
  const deckPanel = add(MeshBuilder.CreateBox("lmreardeck", { width: 1.6, height: 0.44, depth: 0.9 }, scene), mPaint, root);
  deckPanel.position.set(0, 0.16, -0.72); // top ≈ ROOF_Y (fills deck→roof), behind the cab (z < cab)
  // a dark deck-top trim line where the solid deck meets the rear window/sails
  add(MeshBuilder.CreateBox("lmdecktrim", { width: HW * 1.7, height: 0.02, depth: 0.04 }, scene), mBlack, root)
    .position.set(0, DECK + 0.06, -0.18);
  // a sloped fill panel from the roof-rear cab tie down onto the deck (closes the cab-back drop)
  const backfill = add(MeshBuilder.CreateBox("lmbackfill", { width: CAB_HW * 1.78, height: 0.04, depth: 0.40 }, scene), mPaintDark, root);
  backfill.position.set(0, ROOF_Y - 0.14, CAB_Z - 0.34); backfill.rotation.x = 0.9;

  // --- TAIL: SOLID full-width rear panel closing the high deck down to the low rocker (no open
  //     struts) + a thin panel-line trim. The back of the car is closed bodywork. ---
  add(MeshBuilder.CreateBox("lmtail", { width: 1.42, height: 0.42, depth: 0.06 }, scene), mPaintDark, root).position.set(0, -0.05, -1.17);
  add(MeshBuilder.CreateBox("lmtailtrim", { width: 1.3, height: 0.02, depth: 0.04 }, scene), mBlack, root).position.set(0, 0.14, -1.175);
  // a black rocker/diffuser valance closing the very bottom rear (reads as bodywork, not tube)
  add(MeshBuilder.CreateBox("lmreardiff", { width: 1.34, height: 0.12, depth: 0.1 }, scene), mBlack, root).position.set(0, -0.22, -1.14);

  // ===================================================================================
  //  REAR SPOILER — WIDE, FLAT, RAKED single plane spanning nearly the FULL body width,
  //  mounted across the high rear deck at an angle, with end plates + support struts.
  // ===================================================================================
  const blade = add(MeshBuilder.CreateBox("lmspoiler", { width: 1.56, height: 0.028, depth: 0.36 }, scene), mPaint, root);
  blade.position.set(0, 0.22, -1.0); blade.rotation.x = 0.22; // wide flat low-rake blade
  // a dark leading-lip strip along the blade's top edge
  add(MeshBuilder.CreateBox("lmspoilerLip", { width: 1.56, height: 0.04, depth: 0.026 }, scene), mBlack, root)
    .position.set(0, 0.255, -1.06);
  // end plates (side boards) at the spoiler tips — near-full-width spoiler ends ±0.78
  for (const sx of [1, -1]) {
    const sb = add(MeshBuilder.CreateBox("lmsb" + sx, { width: 0.04, height: 0.18, depth: 0.36 }, scene), mPaint, root);
    sb.position.set(0.78 * sx, 0.18, -1.0); sb.rotation.x = 0.08;
  }
  // SOLID body-color support panels bracing the blade down to the deck (flat fins, not exposed
  // tube) — three across so the spoiler reads as part of the bodywork
  for (const sx of [0.5, 0, -0.5]) {
    const fin = add(MeshBuilder.CreateBox("lmspfin" + sx, { width: 0.03, height: 0.14, depth: 0.22 }, scene), mPaintDark, root);
    fin.position.set(0.5 * sx, 0.14, -0.96); fin.rotation.x = 0.4;
  }

  // --- Driver: reclined LOW in the cab (only the helmet shows through the windshield). ---
  add(MeshBuilder.CreateSphere("lmseat", { diameter: 0.42, segments: 12 }, scene), mCarbon, root).position.set(0, 0.06, CAB_Z - 0.08);
  add(MeshBuilder.CreateCapsule("lmtorso", { radius: 0.14, height: 0.34, tessellation: 12 }, scene), mCarbon, root).position.set(0, 0.15, CAB_Z);
  const helmet = add(MeshBuilder.CreateSphere("lmhelmet", { diameter: 0.22, segments: 14 }, scene), flatMat(scene, "lmhel", new Color3(0.92, 0.92, 0.95), 0.2, 0.1), root);
  helmet.position.set(0, 0.30, CAB_Z + 0.08);
  add(MeshBuilder.CreateBox("lmvisorM", { width: 0.16, height: 0.06, depth: 0.06 }, scene), mVisor, root).position.set(0, 0.30, CAB_Z + 0.18);

  // --- Wheels: fendered, MILD stagger (RR marginally biggest) — far less than a sprinter.
  //     Tucked UNDER the body fenders (x inboard of the body half-width HW). ---
  const layout = [
    { x: 0.64, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.40 },   // front right
    { x: -0.64, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.40 },  // front left
    { x: 0.66, z: -0.82, steer: false, drive: true, r: 0.31, w: 0.50 },  // right rear (biggest)
    { x: -0.64, z: -0.82, steer: false, drive: true, r: 0.30, w: 0.48 }, // left rear
  ];
  const wheels: TransformNode[] = [];
  const wheelDefs: WheelDef[] = [];
  for (let i = 0; i < layout.length; i++) {
    const L = layout[i];
    const hub = buildWheel(scene, "lmwheel" + i, L.r, L.w, mTire, mRim, mSidewall);
    hub.parent = root;
    // late-model wheel detail: a ring of lug bolts on each outer dish face + a bead-lock
    // retainer ring. All well inside the tread radius (no Mickey-Mouse shoulders).
    const lugR = L.r * 0.34, hww = L.w / 2;
    for (const sx of [1, -1]) {
      const bead = MeshBuilder.CreateTorus("lmbead" + i + sx, { diameter: L.r * 0.92, thickness: 0.02, tessellation: 18 }, scene);
      bead.rotation.z = Math.PI / 2; bead.position.x = sx * (hww + 0.006); bead.parent = hub; bead.material = mRim;
      for (let b = 0; b < 6; b++) {
        const a = (b / 6) * Math.PI * 2;
        const lug = MeshBuilder.CreateCylinder("lmlug" + i + sx + b, { diameter: 0.026, height: 0.02, tessellation: 6 }, scene);
        lug.rotation.z = Math.PI / 2;
        lug.position.set(sx * (hww + 0.014), Math.sin(a) * lugR, Math.cos(a) * lugR);
        lug.parent = hub; lug.material = mChrome;
      }
    }
    wheels.push(hub);
    wheelDefs.push({ posLocal: new Vector3(L.x, -0.12, L.z), steer: L.steer, drive: L.drive, visual: hub, radius: L.r });
    // BODY-COLOR FENDER over the tire: a solid rounded sheet-metal mass arching from the body's
    // outer skin (inboard) up over the wheel crown and OUT past the tire's outer face, so it is
    // the WIDEST plane on the car and hides the top ~2/3 of the tire. It is continuous with the
    // body side (its inboard edge sits at the slab outer skin, HW) — NOT a floating pod on an
    // arm. A thin dark wheel-arch lip trims the opening below it.
    const isFront = i < 2;
    const sgn = Math.sign(L.x) || 1;
    const innerX = (HW - 0.02) * sgn;        // inboard root, flush against the slab side (HW)
    // outboard skin just past the tire's outer face. The FRONT fender extends further out and
    // drapes LOWER so it encloses the front tire like the rears — only the lower outer ~1/3 of
    // the front tire peeks below the arch.
    const tireOuter = Math.abs(L.x) + L.w / 2;
    const outerX = (isFront ? tireOuter + 0.06 : Math.abs(L.x) + 0.22) * sgn;
    const fender = add(buildFender(scene, "lmfender" + i, L.r, innerX, outerX), mPaint, root);
    fender.position.set(0, isFront ? -0.08 : -0.06, L.z); // fronts extended out + drape lower to cover more tire
    const arch = add(buildArchSkirt(scene, "lmarch" + i, L.r, Math.abs(outerX) + 0.002, mBlack), mBlack, root);
    arch.position.set(0, isFront ? -0.15 : -0.12, L.z); arch.scaling.x = sgn; // mirror for the left side
  }

  if (shadow) {
    for (const m of parts) shadow.addShadowCaster(m);
    for (const w of wheels) for (const cm of w.getChildMeshes()) shadow.addShadowCaster(cm as Mesh);
  }
  for (const m of parts) m.receiveShadows = true;

  const vehicle = new RaycastVehicle(scene, plugin, root, wheelDefs, cloneConfig(opts.config ?? LATE_MODEL_CONFIG));
  return { root, vehicle, wheels, bodyParts: parts };
}
