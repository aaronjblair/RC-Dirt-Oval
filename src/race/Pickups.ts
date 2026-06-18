import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { buildPerson, personRigs, spectatorLooks, type Look } from "./Marshals";

// Trackside vehicles/people are FULL real-world size (1u ≈ 1ft) — only the cars/track are 1:10.
// A pickup is ≈ 17u long; a person ≈ 5.7u tall (handled by buildPerson's PEOPLE_SCALE).

function mat(scene: Scene, name: string, c: Color3, rough = 0.55, metal = 0.1): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c; m.roughness = rough; m.metallic = metal;
  return m;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
function pick<T>(arr: T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

// A handful of believable truck body colors.
const TRUCK_COLORS: Color3[] = [
  new Color3(0.62, 0.10, 0.10), // red
  new Color3(0.10, 0.16, 0.42), // navy blue
  new Color3(0.08, 0.08, 0.09), // black
  new Color3(0.78, 0.78, 0.80), // silver
  new Color3(0.92, 0.92, 0.94), // white
  new Color3(0.20, 0.34, 0.22), // dark green
  new Color3(0.55, 0.42, 0.20), // tan/gold
  new Color3(0.30, 0.32, 0.36), // gunmetal
];

/**
 * One procedural pickup truck (boxes): cab + bed walls + tailgate dropped DOWN + 4 wheels +
 * front bumper + window glass. Real-world scale (~5.8u long). Built under `root` at native units;
 * the caller positions/yaws `root` and freezes. The truck faces +z local (so its TAILGATE is at
 * −z local — back the truck in by yawing the root so −z points the desired way).
 *
 * Each truck is randomized: body color, overall length/height (compact vs full-size), and bed depth.
 * 0–2 people are seated on the dropped tailgate and 0–2 stand behind it.
 */
// Full real-world truck size (1u ≈ 1ft): the body is modeled in small native units then scaled so a
// pickup reads ≈ 17u long / ≈ 6.5u wide — matching the full-scale people and the lawnmower (not 1:10).
const TRUCK_SCALE = 2.9;

function buildTruck(scene: Scene, parent: TransformNode, idx: number, shadow: ShadowGenerator | null): void {
  const root = new TransformNode("pickup" + idx, scene);
  root.parent = parent;
  // Truck body lives under a SCALED node so it's full real-world size; the people (already full
  // scale via buildPerson) parent to `root` directly and are positioned in scaled world units.
  const body = new TransformNode("pkChassis" + idx, scene);
  body.parent = root;
  body.scaling.setAll(TRUCK_SCALE);

  const bodyC = pick(TRUCK_COLORS);
  const bodyM = mat(scene, "pkBody" + idx, bodyC, 0.45, 0.25);
  const trimM = mat(scene, "pkTrim" + idx, new Color3(0.07, 0.07, 0.08), 0.6, 0.1);
  const tireM = mat(scene, "pkTire" + idx, new Color3(0.05, 0.05, 0.06), 0.85);
  const hubM = mat(scene, "pkHub" + idx, new Color3(0.78, 0.78, 0.82), 0.3, 0.9);
  const glassM = mat(scene, "pkGlass" + idx, new Color3(0.12, 0.16, 0.20), 0.15, 0.4);
  const chromeM = mat(scene, "pkChrome" + idx, new Color3(0.82, 0.83, 0.86), 0.2, 1.0);

  const add = (m: Mesh, material: PBRMaterial): Mesh => {
    m.material = material; m.parent = body; m.isPickable = false;
    if (shadow) shadow.addShadowCaster(m); m.receiveShadows = true; return m;
  };

  // --- random proportions (full-size vs compact pickup) ---
  const W = rand(2.0, 2.3);          // body width
  const cabLen = rand(2.4, 3.0);     // cab depth (z)
  const bedLen = rand(2.6, 3.4);     // bed depth (z)
  const frameH = rand(0.85, 1.05);   // floor height (chassis top above ground)
  const cabH = rand(1.5, 1.8);       // cab height above the floor
  const bedWallH = rand(0.7, 0.95);  // bed wall height above the floor
  const wheelR = rand(0.55, 0.70);
  const HL = bedLen + cabLen;        // overall body length

  // origin convention: cab toward +z (front), bed toward −z (tailgate at the −z end)
  const cabZ = HL / 2 - cabLen / 2;      // cab center
  const bedZ = -HL / 2 + bedLen / 2;     // bed center
  const tailZ = -HL / 2;                 // back of the bed (where the tailgate hangs)

  // --- floor / chassis slab spanning the whole body ---
  add(MeshBuilder.CreateBox("pkFloor" + idx, { width: W, height: 0.22, depth: HL }, scene), bodyM)
    .position.set(0, frameH, 0);

  // --- cab: lower box + greenhouse + glass ---
  add(MeshBuilder.CreateBox("pkCabLow" + idx, { width: W, height: 0.9, depth: cabLen }, scene), bodyM)
    .position.set(0, frameH + 0.45, cabZ);
  const greenhouse = add(MeshBuilder.CreateBox("pkCabTop" + idx, { width: W * 0.92, height: cabH - 0.9, depth: cabLen * 0.82 }, scene), bodyM);
  greenhouse.position.set(0, frameH + 0.9 + (cabH - 0.9) / 2, cabZ - cabLen * 0.04);
  // windshield + side glass band wrapping the greenhouse
  const glassY = frameH + 0.9 + (cabH - 0.9) * 0.55;
  add(MeshBuilder.CreateBox("pkWind" + idx, { width: W * 0.93, height: (cabH - 0.9) * 0.6, depth: 0.05 }, scene), glassM)
    .position.set(0, glassY, cabZ + cabLen * 0.41);
  for (const sx of [1, -1]) {
    add(MeshBuilder.CreateBox("pkSideG" + idx + sx, { width: 0.05, height: (cabH - 0.9) * 0.55, depth: cabLen * 0.6 }, scene), glassM)
      .position.set(sx * W * 0.46, glassY, cabZ - cabLen * 0.04);
  }

  // --- bed: floor sits at frameH; three fixed walls + dropped tailgate ---
  // bed side walls
  for (const sx of [1, -1]) {
    add(MeshBuilder.CreateBox("pkBedSide" + idx + sx, { width: 0.12, height: bedWallH, depth: bedLen }, scene), bodyM)
      .position.set(sx * (W / 2 - 0.06), frameH + 0.11 + bedWallH / 2, bedZ);
  }
  // front bed wall (against the cab)
  add(MeshBuilder.CreateBox("pkBedFront" + idx, { width: W, height: bedWallH, depth: 0.12 }, scene), bodyM)
    .position.set(0, frameH + 0.11 + bedWallH / 2, bedZ + bedLen / 2);
  // bed floor
  add(MeshBuilder.CreateBox("pkBedFloor" + idx, { width: W - 0.1, height: 0.08, depth: bedLen }, scene), trimM)
    .position.set(0, frameH + 0.12, bedZ);

  // --- TAILGATE: a panel hinged at the bottom-rear of the bed, dropped DOWN (~horizontal) ---
  // Hinge node at the bottom-back edge; rotating −π/2 about X drops the gate to horizontal,
  // sticking out behind the truck (−z) at floor level — people sit on it.
  const gateHinge = new TransformNode("pkGateHinge" + idx, scene);
  gateHinge.parent = body;
  gateHinge.position.set(0, frameH + 0.11, tailZ);
  gateHinge.rotation.x = -Math.PI / 2 + rand(-0.05, 0.05); // dropped, with a little slop
  const gate = add(MeshBuilder.CreateBox("pkGate" + idx, { width: W, height: bedWallH, depth: 0.1 }, scene), bodyM);
  gate.parent = gateHinge;
  gate.position.set(0, bedWallH / 2, 0); // extends out from the hinge along the (rotated) up axis
  // record the tailgate's world-ish top surface for seating people: when dropped, the gate lies
  // flat behind the truck centered at z ≈ tailZ − bedWallH/2, top at y ≈ frameH + 0.11 + 0.05.
  const gateCenterZ = tailZ - bedWallH / 2;
  const gateTopY = frameH + 0.11 + 0.06;

  // --- 4 wheels ---
  const axleZ = [cabZ - cabLen * 0.1, bedZ - bedLen * 0.18];
  for (const z of axleZ) for (const sx of [1, -1]) {
    const t = add(MeshBuilder.CreateCylinder("pkWheel" + idx + z + sx, { diameter: wheelR * 2, height: 0.34, tessellation: 16 }, scene), tireM);
    t.rotation.z = Math.PI / 2; t.position.set(sx * (W / 2 - 0.04), wheelR, z);
    const hub = add(MeshBuilder.CreateCylinder("pkHub" + idx + z + sx, { diameter: wheelR * 1.0, height: 0.36, tessellation: 10 }, scene), hubM);
    hub.rotation.z = Math.PI / 2; hub.position.set(sx * (W / 2 - 0.04), wheelR, z);
  }

  // --- front bumper + grille + headlights ---
  add(MeshBuilder.CreateBox("pkBumper" + idx, { width: W + 0.1, height: 0.3, depth: 0.18 }, scene), chromeM)
    .position.set(0, frameH + 0.1, HL / 2 + 0.05);
  add(MeshBuilder.CreateBox("pkGrille" + idx, { width: W * 0.8, height: 0.45, depth: 0.06 }, scene), trimM)
    .position.set(0, frameH + 0.5, HL / 2 + 0.02);
  for (const sx of [1, -1]) {
    add(MeshBuilder.CreateBox("pkHead" + idx + sx, { width: 0.4, height: 0.22, depth: 0.06 }, scene), chromeM)
      .position.set(sx * W * 0.32, frameH + 0.55, HL / 2 + 0.02);
  }

  // --- tailgate party: 0–2 sitting ON the dropped gate, 0–2 standing behind it ---
  const fans = spectatorLooks();
  const usedLook = (): Look => pick(fans);

  const seatCount = (Math.random() * 3) | 0; // 0,1,2
  for (let s = 0; s < seatCount; s++) {
    const lk = usedLook();
    const p = buildPerson(scene, "pkSit" + idx + "_" + s, lk, shadow);
    p.parent = root;
    // sit on the (scaled) gate: butt on the gate top (hips at gate height), feet hang off the back (−z).
    const offX = seatCount === 1 ? rand(-0.4, 0.4) : (s === 0 ? -0.5 : 0.5);
    const ps = p.scaling.x || 1; // PEOPLE_SCALE — the rig hips sit at local y≈0.74
    p.position.set(offX * TRUCK_SCALE, gateTopY * TRUCK_SCALE - 0.74 * ps, (gateCenterZ - 0.1) * TRUCK_SCALE);
    p.rotation.y = Math.PI; // face out, away from the truck (looking at whatever's behind, e.g. the track/stand)
    // bend hips forward so the thighs go out over the gate (seated read)
    const rig = personRigs.get(p);
    if (rig) {
      rig.hips[0].rotation.x = -1.4; rig.hips[1].rotation.x = -1.4; // thighs forward/horizontal
      rig.knees[0].rotation.x = 1.4; rig.knees[1].rotation.x = 1.4; // shins drop down off the gate
    }
    p.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
  }

  const standCount = (Math.random() * 3) | 0; // 0,1,2
  for (let s = 0; s < standCount; s++) {
    const lk = usedLook();
    const p = buildPerson(scene, "pkStand" + idx + "_" + s, lk, shadow);
    p.parent = root;
    const offX = standCount === 1 ? rand(-0.8, 0.8) : (s === 0 ? -0.9 : 0.9);
    p.position.set(offX * TRUCK_SCALE, 0, tailZ * TRUCK_SCALE - rand(2.5, 4.5)); // standing a few feet behind the tailgate
    p.rotation.y = 0; // face the truck/tailgate
    p.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
  }

  // freeze the truck's own meshes (people were frozen above as they were built)
  for (const m of root.getChildMeshes()) {
    if (!m.name.startsWith("pkSit") && !m.name.startsWith("pkStand")) m.freezeWorldMatrix();
  }
}

/**
 * Tailgate-party pickup trucks parked around the front-straight infield/outfield, full real-world
 * scale (~5.8u long) — only the cars/track are 1:10. Two groups:
 *   1. BEHIND the drivers' stand/booth (outboard, +x): 3–6 trucks backed in toward the stand
 *      (tailgate facing −x), spread along z, plus 1–2 tucked behind the timing booth (+z end).
 *   2. EAST-SIDE backed to the track (+x straight, just outside the wall): 3–5 trucks with their
 *      tailgates toward the track (−x), spread along z, kept clear of the stand around z≈0.
 * Each truck (`buildTruck`) is randomized and gets 0–2 people seated on the dropped tailgate plus
 * 0–2 standing behind it. Everything casts/receives shadows; the root is frozen after placement.
 *
 * `standPosition` is the drivers'-stand handle from Scenery (its .x ≈ standX − 2.4); we recover the
 * stand's outer x and place relative to it. Returns the group root.
 */
export function buildPickups(scene: Scene, shadow: ShadowGenerator | null, standPosition: Vector3): TransformNode {
  const root = new TransformNode("pickups", scene);

  // Scenery returns standPosition = (standX − 2.4, ...). Recover standX. (If callers pass the raw
  // stand x it's only ~2.4u off — harmless for parking lot placement.)
  const standX = standPosition.x + 2.4;
  let idx = 0;

  // Yaw the root so the truck's −z (tailgate) end points the desired way.
  // World forward for root yaw θ is (sin θ, 0, cos θ); the tailgate (−z) then points (−sin θ, 0, −cos θ).
  // Tailgate toward −x  ⇒ −sin θ = −1 ⇒ θ = +π/2.
  // Tailgate toward +z  ⇒ −cos θ = +1 ⇒ θ = π.
  const placeTruck = (x: number, z: number, yaw: number) => {
    const t = new TransformNode("pickupSlot" + idx, scene);
    t.parent = root;
    // Position + orient the slot FIRST, then build. buildTruck freezes its meshes' world matrices,
    // so the slot transform MUST be set (and the world matrix computed) before that — otherwise the
    // frozen trucks stay piled at the world origin (in the infield by the lawnmower) instead of here.
    t.position.set(x, 0, z);
    t.rotation.y = yaw + rand(-0.06, 0.06); // a little parking-lot scatter
    t.computeWorldMatrix(true);
    buildTruck(scene, t, idx, shadow);
    idx++;
  };

  // --- GROUP 1: behind the stand (outboard +x), backed in toward the stand (tailgate → −x). ---
  const behindCount = 6 + ((Math.random() * 4) | 0); // 6..9 — all pickups park behind the stand now
  for (let i = 0; i < behindCount; i++) {
    const x = standX + rand(14, 22);
    const z = rand(-7, 7) + (i - behindCount / 2) * rand(3.2, 4.5); // spread along z
    placeTruck(x, z, Math.PI / 2); // tailgate faces −x (toward the stand)
  }
  // 1–2 trucks tucked behind the timing booth (+z end of the stand)
  const boothCount = 1 + ((Math.random() * 2) | 0); // 1..2
  for (let i = 0; i < boothCount; i++) {
    const x = standX + rand(12, 20);
    const z = rand(18, 22) + i * rand(4, 6);
    placeTruck(x, z, Math.PI); // tailgate faces +z, away from the track
  }

  // (The old "east side, backed up to the track" group was removed — those trucks read as parked ON
  //  the track. All pickups now park BEHIND the stand + building only.)

  return root;
}
