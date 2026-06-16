import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { OvalTrack } from "./OvalTrack";
import type { BackdropTheme } from "./TrackDef";

function mat(scene: Scene, name: string, c: Color3, rough = 0.7, metal = 0.0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c; m.roughness = rough; m.metallic = metal;
  return m;
}

export interface SceneryHandles {
  standPosition: Vector3;
}

/** A simple standing spectator (legs, torso, head) at (x,y,z), facing the track. Static. */
function buildSpectator(
  scene: Scene, i: number, x: number, y: number, z: number, shirt: Color3,
  cast: (m: Mesh) => void,
): void {
  const skin = mat(scene, "spsk" + i, new Color3(0.82, 0.62, 0.5));
  const dark = mat(scene, "spdk" + i, new Color3(0.14, 0.14, 0.17));
  const top = mat(scene, "sptp" + i, shirt, 0.6);
  const place = (m: Mesh, material: PBRMaterial, px: number, py: number, pz: number) => {
    m.material = material; m.position.set(px, py, pz); cast(m);
  };
  for (const s of [0.1, -0.1]) {
    place(MeshBuilder.CreateCylinder("spleg" + i + s, { diameter: 0.16, height: 0.8, tessellation: 8 }, scene), dark, x, y + 0.4, z + s);
  }
  place(MeshBuilder.CreateCapsule("sptor" + i, { radius: 0.2, height: 0.62, tessellation: 10 }, scene), top, x, y + 1.05, z);
  place(MeshBuilder.CreateSphere("sphead" + i, { diameter: 0.28, segments: 10 }, scene), skin, x, y + 1.52, z);
}

/** Drivers' stand, grandstands, light towers and a start/finish gantry. */
export function buildScenery(scene: Scene, track: OvalTrack, shadow: ShadowGenerator | null, night = false): SceneryHandles {
  const R = track.def.cornerRadius;
  const L = track.def.straightLength;
  const W = track.def.width;
  const outerX = R + W / 2;

  const steel = mat(scene, "steel", new Color3(0.5, 0.52, 0.56), 0.4, 0.8);
  const lampMat = mat(scene, "lamp", new Color3(1, 0.97, 0.85), 0.3, 0.2);
  lampMat.emissiveColor = night ? new Color3(2.2, 2.1, 1.7) : new Color3(1, 0.95, 0.8);

  const cast = (m: Mesh) => {
    if (shadow) shadow.addShadowCaster(m);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix(); // static scenery — skip per-frame matrix work
  };

  // --- Raised drivers' walkway on the front straight (outside +x), centered at z=0:
  //     an open elevated platform (no roof) with rails and 8 people watching the track ---
  const standX = outerX + 6;
  const standY = 5;
  const deck = MeshBuilder.CreateBox("standDeck", { width: 3.2, height: 0.25, depth: 13 }, scene);
  deck.position.set(standX, standY, 0); deck.material = steel; cast(deck);
  for (const dz of [-6, 0, 6]) for (const dx of [-1.3, 1.3]) {
    const leg = MeshBuilder.CreateBox("standLeg", { width: 0.25, height: standY, depth: 0.25 }, scene);
    leg.position.set(standX + dx, standY / 2, dz); leg.material = steel; cast(leg);
  }
  // rails front (track side) and back, plus posts, so it reads as a walkway
  for (const dx of [-1.5, 1.5]) {
    const rail = MeshBuilder.CreateBox("standRail" + dx, { width: 0.08, height: 0.08, depth: 13 }, scene);
    rail.position.set(standX + dx, standY + 1.0, 0); rail.material = steel; cast(rail);
    const kick = MeshBuilder.CreateBox("standKick" + dx, { width: 0.06, height: 0.4, depth: 13 }, scene);
    kick.position.set(standX + dx, standY + 0.35, 0); kick.material = steel; cast(kick);
  }
  // 8 people standing along the track-side rail, facing the track (-x)
  const shirts = [
    new Color3(0.8, 0.2, 0.2), new Color3(0.2, 0.4, 0.8), new Color3(0.9, 0.75, 0.2),
    new Color3(0.2, 0.6, 0.35), new Color3(0.85, 0.85, 0.9), new Color3(0.7, 0.4, 0.1),
    new Color3(0.5, 0.2, 0.7), new Color3(0.15, 0.6, 0.7),
  ];
  for (let i = 0; i < 8; i++) {
    const z = -5.6 + i * (11.2 / 7); // spread across the walkway
    buildSpectator(scene, i, standX - 1.3, standY + 0.13, z, shirts[i], cast);
  }

  // --- Surrounding landscape floor (under the 400m infield) so distant scenery
  //     sits on real ground out to the horizon instead of floating over void ---
  const floorC = floorColor(track.def.backdrop);
  const floor = MeshBuilder.CreateGround("worldFloor", { width: 1700, height: 1700 }, scene);
  floor.position.y = -0.6;
  floor.material = mat(scene, "worldFloorM", night ? floorC.scale(0.4) : floorC, 1.0);
  floor.isPickable = false; floor.freezeWorldMatrix();

  // --- Distant backdrop + near vegetation, themed per round (see buildBackdrop) ---
  buildBackdrop(scene, track, night);
  buildVegetation(scene, track.def.backdrop, Math.max(L, R) + 55, night);

  // --- Light towers at the 4 corners ---
  const towerAt = (x: number, z: number) => {
    const pole = MeshBuilder.CreateCylinder("pole", { diameter: 0.5, height: 16, tessellation: 8 }, scene);
    pole.position.set(x, 8, z); pole.material = steel; cast(pole);
    const bank = MeshBuilder.CreateBox("lampBank", { width: 4, height: 1.2, depth: 0.4 }, scene);
    bank.position.set(x, 16, z);
    bank.lookAt(new Vector3(0, 16, 0));
    bank.material = lampMat;
    for (let i = -1; i <= 1; i++) {
      const pl = new PointLight("towerL" + x + z + i, new Vector3(x + i * 1.2, 15.5, z), scene);
      pl.intensity = night ? 420 : 0.0; // lit only at night (PBR falloff over ~90m)
      pl.range = 110;
      pl.diffuse = new Color3(1, 0.96, 0.85);
      pl.specular = new Color3(1, 0.97, 0.88);
    }
  };
  const tx = outerX + 10, tz = L / 2 + 6;
  towerAt(tx, tz); towerAt(-tx, tz); towerAt(tx, -tz); towerAt(-tx, -tz);

  // --- Start/finish gantry over the front straight ---
  const gx = R;
  for (const dx of [-W / 2 - 1, W / 2 + 1]) {
    const post = MeshBuilder.CreateBox("sfPost", { width: 0.3, height: 5, depth: 0.3 }, scene);
    post.position.set(gx + dx, 2.5, 0); post.material = steel; cast(post);
  }
  const beam = MeshBuilder.CreateBox("sfBeam", { width: W + 2, height: 0.6, depth: 0.4 }, scene);
  beam.position.set(gx, 5, 0); beam.material = mat(scene, "sfBeam", new Color3(0.1, 0.1, 0.12), 0.5); cast(beam);

  return { standPosition: new Vector3(standX - 2.4, standY + 1.8, 0) };
}

/** Surrounding-terrain tint per backdrop theme (green field, sand, desert, etc.). */
function floorColor(theme: BackdropTheme): Color3 {
  switch (theme) {
    case "forest": return new Color3(0.16, 0.27, 0.15);
    case "dunes": return new Color3(0.62, 0.52, 0.36);
    case "mesas": return new Color3(0.62, 0.46, 0.30);
    case "badlands": return new Color3(0.48, 0.36, 0.26);
    case "plains": return new Color3(0.42, 0.40, 0.22);
    case "city": return new Color3(0.20, 0.21, 0.23);
    default: return new Color3(0.30, 0.30, 0.27); // neutral fallback
  }
}

/** Distant horizon silhouette, one of seven themes. Instanced + frozen (static). */
function buildBackdrop(scene: Scene, track: OvalTrack, night: boolean): void {
  const R = track.def.cornerRadius, L = track.def.straightLength;
  const far = Math.max(L, R) + 92;
  const zS = 1.25; // match the oval's z-stretch so the ring reads as a circle
  // A backdrop instance must never reach inboard of the outfield. Its widest point is
  // closest to the track along the x axis (no z-stretch), so push any whose footprint
  // would overlap the track back out by half its own width. Guarantees no clipping.
  const clear = Math.max(L, R) + 60; // just beyond the vegetation ring (+55)
  const safeR = (rWanted: number, footprint: number) => Math.max(rWanted, clear + footprint / 2);
  const dim = (c: Color3, f = 0.4) => (night ? c.scale(f) : c);
  const cone = (name: string, top: number, tess: number, c: Color3) => {
    const m = MeshBuilder.CreateCylinder(name, { diameterTop: top, diameterBottom: 1, height: 1, tessellation: tess }, scene);
    m.material = mat(scene, name + "M", c, 1.0); m.isVisible = false; return m;
  };
  const box = (name: string, c: Color3, rough = 1.0, metal = 0.0) => {
    const m = MeshBuilder.CreateBox(name, { size: 1 }, scene);
    m.material = mat(scene, name + "M", c, rough, metal); m.isVisible = false; return m;
  };
  const dome = (name: string, c: Color3) => {
    const m = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 8 }, scene);
    m.material = mat(scene, name + "M", c, 1.0); m.isVisible = false; return m;
  };

  switch (track.def.backdrop) {
    case "mesas": {
      const m = cone("mesa", 0.8, 7, dim(new Color3(0.58, 0.25, 0.13), 0.4)); // deep red flat-topped butte
      for (const ring of [0, 1]) for (let a = ring * 0.08; a < Math.PI * 2; a += 0.16) {
        const h = (ring ? 82 : 58) + Math.random() * 48, base = h * (0.8 + Math.random() * 0.5);
        const r = safeR(far + ring * 55 + (Math.random() - 0.5) * 40, base);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = m.createInstance("mesa"); p.position.set(x, h / 2 - 4, z); p.scaling.set(base, h, base); p.rotation.y = Math.random() * Math.PI; p.freezeWorldMatrix();
      }
      break;
    }
    case "forest": {
      const hill = dome("fhill", dim(new Color3(0.16, 0.28, 0.16), 0.4));
      for (const ring of [0, 1]) for (let a = ring * 0.06; a < Math.PI * 2; a += 0.13) {
        const w = 90 + Math.random() * 100, h = 45 + Math.random() * 45;
        const r = safeR(far + ring * 60 + (Math.random() - 0.5) * 40, w);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = hill.createInstance("fhill"); p.position.set(x, -h * 0.15, z); p.scaling.set(w, h * 2, w * 0.8); p.freezeWorldMatrix();
      }
      break;
    }
    case "plains": {
      const hedge = box("hedge", dim(new Color3(0.20, 0.30, 0.18), 0.45)); // far windbreak so the horizon isn't bare
      for (let a = 0; a < Math.PI * 2; a += 0.10) {
        const h = 10 + Math.random() * 8, w = 40 + Math.random() * 30;
        const r = safeR(far + (Math.random() - 0.5) * 30, w); const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = hedge.createInstance("hedge"); p.position.set(x, h / 2, z); p.scaling.set(w, h, 12); p.rotation.y = a; p.freezeWorldMatrix();
      }
      const silo = MeshBuilder.CreateCylinder("silo", { diameter: 1, height: 1, tessellation: 12 }, scene);
      silo.material = mat(scene, "siloM", dim(new Color3(0.80, 0.80, 0.76), 0.5), 0.5, 0.05); silo.isVisible = false;
      const cap = dome("siloCap", dim(new Color3(0.7, 0.72, 0.74), 0.5));
      const barn = box("barn", dim(new Color3(0.55, 0.13, 0.10), 0.45));
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2 + 0.2, r = safeR(far - 20 + Math.random() * 40, 60);
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r * zS;
        const cnt = 2 + (Math.random() * 2 | 0);
        for (let s = 0; s < cnt; s++) {
          const h = 26 + Math.random() * 16, d = 7 + Math.random() * 3;
          const sx = cx + (Math.random() - 0.5) * 30, sz = cz + (Math.random() - 0.5) * 20;
          const p = silo.createInstance("silo"); p.position.set(sx, h / 2, sz); p.scaling.set(d, h, d); p.freezeWorldMatrix();
          const c = cap.createInstance("siloCap"); c.position.set(sx, h, sz); c.scaling.set(d, d * 0.5, d); c.freezeWorldMatrix();
        }
        const bh = 14; const b = barn.createInstance("barn"); b.position.set(cx + 12, bh / 2, cz + 10); b.scaling.set(26, bh, 16); b.rotation.y = Math.random(); b.freezeWorldMatrix();
      }
      break;
    }
    case "city": {
      const dark = box("bldgDark", night ? new Color3(0.07, 0.08, 0.12) : new Color3(0.26, 0.29, 0.37), 0.6, 0.1);
      let lit = dark;
      if (night) { lit = box("bldgLit", new Color3(0.16, 0.15, 0.12), 0.6, 0.1); (lit.material as PBRMaterial).emissiveColor = new Color3(0.7, 0.6, 0.35); }
      for (const ring of [0, 1, 2]) for (let a = ring * 0.05; a < Math.PI * 2; a += 0.07) {
        const h = 70 + Math.random() * 150, w = 20 + Math.random() * 18;
        const r = safeR(far + ring * 40 + (Math.random() - 0.5) * 30, w);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const src = (night && Math.random() < 0.45) ? lit : dark;
        const p = src.createInstance("bldg"); p.position.set(x, h / 2, z); p.scaling.set(w, h, w); p.rotation.y = a; p.freezeWorldMatrix();
      }
      break;
    }
    case "dunes": {
      const sand = dome("dune", dim(new Color3(0.66, 0.56, 0.38), 0.45));
      for (const ring of [0, 1]) for (let a = ring * 0.05; a < Math.PI * 2; a += 0.10) {
        const w = 90 + Math.random() * 90, h = 18 + Math.random() * 20;
        const r = safeR(far + ring * 50 + (Math.random() - 0.5) * 40, w);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = sand.createInstance("dune"); p.position.set(x, -h * 0.2, z); p.scaling.set(w, h * 2, w * 0.7); p.rotation.y = Math.random() * Math.PI; p.freezeWorldMatrix();
      }
      break;
    }
    case "badlands": {
      const lower = cone("blLow", 0.5, 6, dim(new Color3(0.50, 0.38, 0.27), 0.4));
      const upper = cone("blUp", 0.4, 6, dim(new Color3(0.64, 0.52, 0.37), 0.45)); // lighter top band
      for (const ring of [0, 1]) for (let a = ring * 0.07; a < Math.PI * 2; a += 0.11) {
        const h = 55 + Math.random() * 50, base = h * (0.9 + Math.random() * 0.5);
        const r = safeR(far + ring * 50 + (Math.random() - 0.5) * 40, base);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = lower.createInstance("bl"); p.position.set(x, h / 2 - 4, z); p.scaling.set(base, h, base); p.rotation.y = Math.random() * Math.PI; p.freezeWorldMatrix();
        const uh = h * 0.45; const u = upper.createInstance("blu"); u.position.set(x, h - 4 + uh / 2 - h * 0.2, z); u.scaling.set(base * 0.66, uh, base * 0.66); u.rotation.y = p.rotation.y; u.freezeWorldMatrix();
      }
      break;
    }
  }
}

/** Near-field vegetation ringing the outfield — pines for green themes, sparse scrub for desert. */
function buildVegetation(scene: Scene, theme: BackdropTheme, rad: number, night: boolean): void {
  const desert = theme === "mesas" || theme === "dunes" || theme === "badlands";
  if (desert) {
    const scrub = MeshBuilder.CreateSphere("scrub", { diameter: 1, segments: 6 }, scene);
    scrub.material = mat(scene, "scrubM", night ? new Color3(0.12, 0.13, 0.10) : new Color3(0.30, 0.32, 0.18), 1.0);
    scrub.isVisible = false;
    for (let a = 0; a < Math.PI * 2; a += 0.22) {
      const r = rad + (Math.random() - 0.5) * 30;
      const x = Math.cos(a) * r * 0.9, z = Math.sin(a) * r * 1.2;
      const s = 2 + Math.random() * 3;
      const p = scrub.createInstance("scrub"); p.position.set(x, s * 0.3, z); p.scaling.set(s * 2, s, s * 2); p.freezeWorldMatrix();
    }
    return;
  }
  const trunkM = MeshBuilder.CreateCylinder("trunkM", { diameter: 0.5, height: 2, tessellation: 6 }, scene);
  trunkM.material = mat(scene, "trunk", night ? new Color3(0.12, 0.09, 0.06) : new Color3(0.28, 0.2, 0.12), 0.9);
  trunkM.isVisible = false;
  const leafM = MeshBuilder.CreateCylinder("leafM", { diameterTop: 0, diameterBottom: 3.2, height: 5, tessellation: 7 }, scene);
  leafM.material = mat(scene, "leaf", night ? new Color3(0.07, 0.13, 0.07) : new Color3(0.18, 0.32, 0.16), 0.9);
  leafM.isVisible = false;
  const step = theme === "forest" ? 0.10 : 0.16; // forest is denser
  for (let a = 0; a < Math.PI * 2; a += step) {
    const r = rad + (Math.random() - 0.5) * 18;
    const x = Math.cos(a) * r * 0.9, z = Math.sin(a) * r * 1.2;
    const tr = trunkM.createInstance("tr"); tr.position.set(x, 1, z); tr.freezeWorldMatrix();
    const lf = leafM.createInstance("lf"); lf.position.set(x, 4, z); lf.scaling.setAll(0.7 + Math.random() * 0.8); lf.freezeWorldMatrix();
  }
}
