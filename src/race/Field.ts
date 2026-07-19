import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { makeDustTexture } from "../core/Textures";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { type BuiltCar } from "../car/Car";
import { CAR_CLASSES, type CarClassDef } from "../car/CarClass";
import superJayLogo from "../assets/superjay.png";
import { AIDriver, type CarState } from "../ai/AIDriver";
import { SurfaceModel } from "../track/SurfaceModel";
import { applySetup, DEFAULT_SETUP, type CarSetup } from "../car/CarSetup";
import { driverName } from "../career/Career";
import type { OvalTrack } from "../track/OvalTrack";
import type { TrackDef } from "../track/TrackDef";
import type { RaceManager } from "./RaceManager";
import type { DriveInput } from "../core/Input";
import type { RaycastVehicle } from "../physics/RaycastVehicle";

const PALETTE: { c: Color3; n: number | string }[] = [
  { c: new Color3(0.96, 0.42, 0.04), n: 32 }, // Super Jay #32 — vibrant orange (the player car, a tribute)
  { c: new Color3(0.94, 0.94, 0.96), n: "11X" }, // the 11X — white/black modified, orange 11 + purple X (always in the field)
  { c: new Color3(0.97, 0.97, 0.99), n: 46 }, // Aaron Blair's white #46 — always in the field (slot ≤ min fieldSize)
  { c: new Color3(0.1, 0.7, 0.35), n: 11 },
  { c: new Color3(0.55, 0.8, 0.12), n: 24 }, // lime/chartreuse (was burnt orange — keep only the player orange)
  { c: new Color3(0.6, 0.15, 0.8), n: 9 },
  { c: new Color3(0.93, 0.93, 0.96), n: 42 }, // the #42 — white livery, RED black-outlined numbers (set below)
  { c: new Color3(0.1, 0.8, 0.8), n: 15 },
  { c: new Color3(0.95, 0.5, 0.7), n: 17 },
  { c: new Color3(0.3, 0.3, 0.35), n: 2 },
  { c: new Color3(0.80, 0.10, 0.12), n: 5 },  // crimson  (slots 11/12 — fields run up to 12 cars)
  { c: new Color3(0.40, 0.55, 0.95), n: 21 }, // periwinkle
];

/** Builds and drives the full field: the player plus AI sprint cars. */
export class Field {
  cars: BuiltCar[] = [];
  private ai: (AIDriver | null)[] = [];
  private attractAI: AIDriver | null = null; // drives the player slot (Super Jay #32) during the attract reel
  private vehicles: RaycastVehicle[] = [];
  private lastS: number[] = []; // per-car projection hint (figure-8: keeps each car on its own leg)
  private wear: number[] = [];
  private wearRate: number[] = [];
  private dust: ParticleSystem[] = [];
  private dustEmitCap = 240; // per-device dust emit-rate cap (mobile keeps a smaller plume)
  private dustMobile = false; // coarse-pointer device → smaller particle budgets, no rooster-tail
  private roost: (ParticleSystem | null)[] = []; // desktop-only thrown-clod burst off the power tire
  readonly player: BuiltCar;
  readonly surface: SurfaceModel;
  private wallLimit: number;
  private dirtTint: Color3;
  private classDef: CarClassDef;
  private playerEngineBoost = 1; // persistent player-only engineForce multiplier (early-career easing) that survives garage re-applies

  constructor(
    scene: Scene,
    plugin: HavokPlugin,
    shadow: ShadowGenerator | null,
    private track: OvalTrack,
    def: TrackDef,
    race: RaceManager,
    playerSetup: CarSetup = DEFAULT_SETUP,
    classDef: CarClassDef = CAR_CLASSES.sprint,
    lastRaceOrder?: number[] // career: previous race's finishing order as IDENTITY INDICES → seeds the grid
  ) {
    this.classDef = classDef;
    this.wallLimit = def.width / 2 - 0.7;
    this.surface = new SurfaceModel(def);
    // Dust takes on the track's dirt colour (lifted toward a dry, dusty tone).
    this.dirtTint = Color3.Lerp(def.dirtColor, new Color3(0.62, 0.5, 0.38), 0.45);
    const dustTex = makeDustTexture(scene);
    this.dustMobile = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    this.dustEmitCap = this.dustMobile ? 130 : 240;
    const blobTex = this.makeBlobTexture(scene);
    const n = Math.min(def.fieldSize, PALETTE.length);
    // Grid POSITION per identity slot: the WHOLE field (player included) draws a fully RANDOM
    // grid every race, in every mode — a Fisher-Yates shuffle of the spawn slots. Identity
    // (colour/number/name = PALETTE[i]/driverName(i)) is unchanged and cars[] stays in identity
    // order (cars[0] = the player) — only the spawn slot reorders.
    void lastRaceOrder; // retained in the signature for callers; superseded by the random draw
    const gridIndexFor: number[] = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gridIndexFor[i], gridIndexFor[j]] = [gridIndexFor[j], gridIndexFor[i]];
    }
    for (let i = 0; i < n; i++) {
      const grid = track.gridPose(gridIndexFor[i]);
      const p = PALETTE[i];
      const car = classDef.build(scene, plugin, shadow, {
        color: p.c, number: p.n, spawn: grid.pos, yaw: grid.yaw,
        name: i === 0 ? "Super Jay" : undefined,
        logoUrl: i === 0 ? superJayLogo : undefined, // Super Jay's logo decal on the player car
        logoAspect: 686 / 1190,
        redOutlineNumber: p.n === 42, // the #42 always runs RED black-outlined numbers (side + wing-top)
        config: classDef.config, // per-class physics baseline (the builder clones it per car)
      });
      this.cars.push(car);
      this.vehicles.push(car.vehicle);
      this.lastS.push(track.project(grid.pos).s);
      this.wear.push(0);
      this.dust.push(this.makeDust(scene, car.root, dustTex, i));
      this.roost.push(this.dustMobile ? null : this.makeRoost(scene, car.root, dustTex, i));
      this.makeBlob(scene, car, blobTex, i);
      if (i === 0) {
        this.ai.push(null);
        this.wearRate.push(applySetup(car.vehicle.cfg, playerSetup, classDef.config));
      } else {
        const skill = Math.max(0.2, Math.min(1, def.aiSkill + (Math.random() - 0.5) * 0.25));
        this.ai.push(new AIDriver(car.vehicle, track, skill));
        this.wearRate.push(0.00007);
      }
      race.add(i === 0 ? "player" : `ai${i}`, driverName(i), i === 0, () => car.vehicle.position);
    }
    // The 11X (identity 1) is the field's second hero: quickest AI, but ~2% slower than the
    // player's permanent +5% setup edge (1.05 × 0.98 ≈ 1.029 over the untouched AI baseline).
    if (this.cars.length > 1) this.cars[1].vehicle.cfg.engineForce *= 1.029;
    this.player = this.cars[0];
  }

  private makeDust(scene: Scene, root: import("@babylonjs/core/Meshes/mesh").Mesh, tex: ReturnType<typeof makeDustTexture>, i: number): ParticleSystem {
    const node = new TransformNode("dustE" + i, scene);
    node.parent = root;
    // off the RIGHT-REAR tire, like a real sprint car's rooster tail
    node.position.set(0.45, -0.05, -1.0);
    // Dust budget follows the existing mobile-starts-lower pattern: the richer plume
    // (~2.6× the old alive-particle population) is desktop-only; coarse-pointer devices
    // keep roughly the old population so 12 cars of alpha-blended quads can't tank fill rate.
    const ps = new ParticleSystem("dust" + i, this.dustMobile ? 190 : 340, scene);
    ps.particleTexture = tex;
    // Alpha blend (NOT additive) so dust reads as opaque kicked-up dirt rather
    // than glowing embers — especially important under the night-race lights.
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitter = node as any;
    ps.minEmitBox = new Vector3(-0.25, 0, -0.15);
    ps.maxEmitBox = new Vector3(0.35, 0.15, 0.1);
    const dc = this.dirtTint;
    // Real dust plumes are near-opaque and DARK at the tire, fading to a pale sun-lit
    // rim at the edge (video reference: dense #4A3020 core → mid #8A6A45 → pale #C4A87E),
    // so run a lifetime color GRADIENT from a dark rust core out to a bright dry edge.
    ps.addColorGradient(0.0, new Color4(dc.r * 0.6, dc.g * 0.58, dc.b * 0.55, 0.85));
    ps.addColorGradient(0.3, new Color4(dc.r * 1.05, dc.g * 1.0, dc.b * 0.95, 0.5));
    ps.addColorGradient(1.0, new Color4(dc.r * 1.45, dc.g * 1.42, dc.b * 1.35, 0));
    // Puffs GROW as they billow out (~3–4× over life) instead of holding one size.
    ps.addSizeGradient(0.0, 0.25, 0.55);
    ps.addSizeGradient(0.45, 0.8, 1.5);
    ps.addSizeGradient(1.0, 1.5, 2.6);
    ps.minLifeTime = 0.9; ps.maxLifeTime = 1.9; // hang in the air longer, like real track dust
    ps.emitRate = 0;
    // Softer settle + a constant WIND BIAS (world-space) so plumes billow diagonally
    // off the racing line rather than trailing dead straight behind every car.
    ps.gravity = new Vector3(0.7, -2.4, 0.35);
    // fan up and back into a tall rooster behind the right rear
    ps.direction1 = new Vector3(-0.4, 0.9, -1.6);
    ps.direction2 = new Vector3(0.5, 1.9, -3.0);
    ps.minEmitPower = 1.5; ps.maxEmitPower = 4.2;
    ps.updateSpeed = 0.02;
    ps.start();
    return ps;
  }

  /** ROOSTER-TAIL clod burst (desktop only): a second, short-lived, fast, heavy spray off the
   *  power tire that only fires while the car is really SLIDING/spinning up — a discrete arc of
   *  thrown dirt that dissolves into the softer dust plume within a few car lengths. */
  private makeRoost(scene: Scene, root: import("@babylonjs/core/Meshes/mesh").Mesh, tex: ReturnType<typeof makeDustTexture>, i: number): ParticleSystem {
    const node = new TransformNode("roostE" + i, scene);
    node.parent = root;
    node.position.set(0.45, -0.1, -1.0); // same right-rear contact patch as the dust
    const ps = new ParticleSystem("roost" + i, 140, scene);
    ps.particleTexture = tex;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitter = node as any;
    ps.minEmitBox = new Vector3(-0.15, 0, -0.1);
    ps.maxEmitBox = new Vector3(0.2, 0.08, 0.05);
    const dc = this.dirtTint;
    // chunky, dark, near-opaque clods — heavier and darker than the airborne dust
    ps.addColorGradient(0.0, new Color4(dc.r * 0.45, dc.g * 0.42, dc.b * 0.4, 0.95));
    ps.addColorGradient(0.6, new Color4(dc.r * 0.7, dc.g * 0.66, dc.b * 0.6, 0.8));
    ps.addColorGradient(1.0, new Color4(dc.r * 0.9, dc.g * 0.85, dc.b * 0.8, 0));
    ps.addSizeGradient(0.0, 0.08, 0.18);
    ps.addSizeGradient(1.0, 0.14, 0.3);
    ps.minLifeTime = 0.3; ps.maxLifeTime = 0.65; // real ballistic arcs — up, over, back to the dirt
    ps.emitRate = 0; // gated on slip in update()
    ps.gravity = new Vector3(0, -9.8, 0);
    ps.direction1 = new Vector3(-0.3, 1.2, -2.2);
    ps.direction2 = new Vector3(0.4, 2.4, -4.2);
    ps.minEmitPower = 3.0; ps.maxEmitPower = 6.0;
    ps.updateSpeed = 0.02;
    ps.start();
    return ps;
  }

  /** Soft CONTACT-SHADOW blob under the car: a dark radial gradient ground-plane parented to the
   *  chassis (the vehicle aligns itself to the ground normal, so the blob stays flat on the
   *  surface). Grounds every car visually even where the shadow map is soft/absent. */
  private makeBlobTexture(scene: Scene): DynamicTexture {
    const S = 128;
    const t = new DynamicTexture("carBlobTex", { width: S, height: S }, scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    // grayscale opacity mask: bright center (opaque shadow) fading to black (transparent)
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0.0, "rgb(150,150,150)");
    g.addColorStop(0.55, "rgb(80,80,80)");
    g.addColorStop(1.0, "rgb(0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    t.update();
    return t;
  }

  private makeBlob(scene: Scene, car: BuiltCar, tex: DynamicTexture, i: number): void {
    const cfg = car.vehicle.cfg;
    const blob = MeshBuilder.CreateGround("carBlob" + i, { width: 2.4, height: 3.2 }, scene);
    blob.parent = car.root;
    // chassis center rides at ground + wheelRadius + suspRest → park the blob just above the dirt
    blob.position.y = -(cfg.wheelRadius + cfg.suspRest) + 0.045;
    const m = new StandardMaterial("carBlobMat" + i, scene);
    m.diffuseColor = new Color3(0, 0, 0);
    m.specularColor = new Color3(0, 0, 0);
    m.disableLighting = true;
    m.opacityTexture = tex;
    m.opacityTexture.getAlphaFromRGB = true; // grayscale mask → alpha
    m.alpha = 0.42; // soft AO shadow, not a hard black pool
    blob.material = m;
    blob.isPickable = false;
    blob.alphaIndex = 1; // under the dust plumes
  }

  /** Re-apply player setup (e.g. after editing it in the garage). The early-career engine boost
   *  must be re-folded in, because applySetup recomputes engineForce from the pristine baseline. */
  applyPlayerSetup(setup: CarSetup) {
    this.wearRate[0] = applySetup(this.player.vehicle.cfg, setup, this.classDef.config);
    this.player.vehicle.cfg.engineForce *= this.playerEngineBoost;
    this.wear[0] = 0;
  }

  /** Set a persistent player-only engineForce multiplier (the early-career speed easing) that
   *  SURVIVES garage setup re-applies. Applied immediately; calling again replaces (no compounding). */
  setPlayerEngineBoost(mult: number) {
    this.player.vehicle.cfg.engineForce = (this.player.vehicle.cfg.engineForce / this.playerEngineBoost) * mult;
    this.playerEngineBoost = mult;
  }

  get playerTireWear(): number {
    return this.wear[0];
  }

  /** Positions + colors for the minimap. */
  miniStates(): { x: number; z: number; color: string; isPlayer: boolean }[] {
    return this.cars.map((c, i) => ({
      x: c.vehicle.position.x,
      z: c.vehicle.position.z,
      color: PALETTE[i].c.toHexString(),
      isPlayer: i === 0,
    }));
  }

  /** project the whole field once (s + lateral per car) for AI racecraft */
  private projectStates(): CarState[] {
    return this.vehicles.map((v, i) => {
      const p = this.track.projectNear(v.position, this.lastS[i]);
      this.lastS[i] = p.s;
      return { v, s: p.s, lateral: p.lateral };
    });
  }

  update(dt: number, playerInput: DriveInput, raceFraction: number) {
    this.surface.update(raceFraction);
    const states = this.projectStates();

    // player
    this.player.vehicle.update(dt, playerInput);
    // ai
    for (let i = 1; i < this.cars.length; i++) {
      const input = this.ai[i]!.update(dt, i, states, this.surface);
      this.cars[i].vehicle.update(dt, input);
    }
    this.postStep(dt);
  }

  /** Attract reel: every car (including Super Jay's #32) is AI-driven for a cinematic. */
  attractUpdate(dt: number, raceFraction: number) {
    this.surface.update(raceFraction);
    const states = this.projectStates();
    if (!this.attractAI) this.attractAI = new AIDriver(this.vehicles[0], this.track, 0.85);
    for (let i = 0; i < this.cars.length; i++) {
      const ai = i === 0 ? this.attractAI : this.ai[i]!;
      const input = ai.update(dt, i, states, this.surface);
      this.cars[i].vehicle.update(dt, input);
    }
    this.postStep(dt);
  }

  private rollPrev: number[] | null = null; // last frame's line-relative s per car (rolling-start crossing detector)

  /** Rolling start: true the frame ANY car first crosses the start/finish line going forward.
   *  Uses the per-car projection hints kept fresh by postStep. Call once per physics step. */
  checkLineCross(): boolean {
    const len = this.track.length, sf = this.track.startFinishS;
    const rel = this.lastS.map((s) => (s - sf + len) % len);
    let crossed = false;
    if (this.rollPrev) {
      for (let i = 0; i < rel.length; i++) {
        if (this.rollPrev[i] > len * 0.75 && rel[i] < len * 0.25) { crossed = true; break; }
      }
    }
    this.rollPrev = rel;
    return crossed;
  }

  /** surface grip + tire wear + retaining walls + dust, then car-to-car contact */
  private postStep(dt: number) {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const proj = this.track.projectNear(v.position, this.lastS[i]);
      this.lastS[i] = proj.s;
      this.wear[i] = Math.min(1, this.wear[i] + v.speed * dt * this.wearRate[i]);
      v.gripMult = this.surface.gripAt(proj.lateral) * (1 - this.wear[i] * 0.28);
      // dirt rooster-tail: thrown up by speed, sliding, and wheelspin under power
      const wheelspin = Math.max(0, v.debug.drive); // longitudinal accel as a spin proxy
      // cap matched to the per-device dust capacity at the longer particle lifetimes (~1.4s avg)
      this.dust[i].emitRate = Math.min(this.dustEmitCap, Math.max(0, (v.speed - 1.5) * 7 + v.debug.slip * 45 + wheelspin * 2.2));
      // rooster-tail clods only while genuinely SLIDING at speed (corner-exit power-on)
      const ro = this.roost[i];
      if (ro) ro.emitRate = v.debug.slip > 1.1 && v.speed > 8 ? 120 : 0;
      if (Math.abs(proj.lateral) > this.wallLimit) {
        const sgn = Math.sign(proj.lateral);
        const inx = -sgn * proj.outward.x, inz = -sgn * proj.outward.z; // inward normal
        const into = -(v.velX * inx + v.velZ * inz); // closing speed straight into the wall
        const np = proj.center.add(proj.outward.scale(sgn * this.wallLimit));
        v.position.x = np.x;
        v.position.z = np.z;
        v.bounceOffWall(inx, inz, 0.45); // rebound and keep racing
        // Wreck tolerance is per-car: the PLAYER resists flips (forgiving, but NOT immune); the AI
        // ("computer drivers") flip more easily. A hard enough slam still tumbles the player.
        if (into > (v === this.player.vehicle ? 12 : 6.5)) v.triggerRollover(into * 0.11);
      }
    }
    this.resolveContacts();
  }

  private resolveContacts() {
    const minDist = 1.7;
    for (let i = 0; i < this.vehicles.length; i++) {
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const a = this.vehicles[i].position;
        const b = this.vehicles[j].position;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < minDist) {
          const push = (minDist - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
          // jostle apart instead of stopping — they rub, bounce off and keep racing
          const s = Math.min(2.0, (minDist - d) * 6);
          this.vehicles[i].shove(-nx, -nz, s);
          this.vehicles[j].shove(nx, nz, s);
          // a genuinely hard T-bone flips them — closing speed along the contact normal. Evaluated
          // PER-CAR: the player resists the flip (forgiving, not immune), the AI flip more easily, so
          // an AI can tumble out of a hit the player shrugs off (and the player still flips if hit hard).
          const rvx = this.vehicles[j].velX - this.vehicles[i].velX;
          const rvz = this.vehicles[j].velZ - this.vehicles[i].velZ;
          const closing = -(rvx * nx + rvz * nz);
          if (closing > 5) {
            const sev = closing * 0.15;
            const wreckAt = (v: RaycastVehicle) => (v === this.player.vehicle ? 9.5 : 5);
            if (closing > wreckAt(this.vehicles[i])) this.vehicles[i].triggerRollover(sev);
            if (closing > wreckAt(this.vehicles[j])) this.vehicles[j].triggerRollover(sev);
          }
        }
      }
    }
  }

  get playerVehicle(): RaycastVehicle {
    return this.player.vehicle;
  }
}
