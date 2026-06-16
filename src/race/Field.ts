import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
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

const PALETTE: { c: Color3; n: number }[] = [
  { c: new Color3(0.96, 0.42, 0.04), n: 32 }, // Super Jay #32 — vibrant orange (the player car, a tribute)
  { c: new Color3(0.1, 0.45, 0.95), n: 7 },
  { c: new Color3(0.95, 0.78, 0.1), n: 1 },
  { c: new Color3(0.1, 0.7, 0.35), n: 11 },
  { c: new Color3(0.85, 0.4, 0.05), n: 24 },
  { c: new Color3(0.6, 0.15, 0.8), n: 9 },
  { c: new Color3(0.9, 0.9, 0.95), n: 4 },
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
  private wear: number[] = [];
  private wearRate: number[] = [];
  private dust: ParticleSystem[] = [];
  readonly player: BuiltCar;
  readonly surface: SurfaceModel;
  private wallLimit: number;
  private dirtTint: Color3;
  private classDef: CarClassDef;

  constructor(
    scene: Scene,
    plugin: HavokPlugin,
    shadow: ShadowGenerator | null,
    private track: OvalTrack,
    def: TrackDef,
    race: RaceManager,
    playerSetup: CarSetup = DEFAULT_SETUP,
    classDef: CarClassDef = CAR_CLASSES.sprint
  ) {
    this.classDef = classDef;
    this.wallLimit = def.width / 2 - 0.7;
    this.surface = new SurfaceModel(def);
    // Dust takes on the track's dirt colour (lifted toward a dry, dusty tone).
    this.dirtTint = Color3.Lerp(def.dirtColor, new Color3(0.62, 0.5, 0.38), 0.45);
    const dustTex = makeDustTexture(scene);
    const n = Math.min(def.fieldSize, PALETTE.length);
    for (let i = 0; i < n; i++) {
      const grid = track.gridPose(i);
      const p = PALETTE[i];
      const car = classDef.build(scene, plugin, shadow, {
        color: p.c, number: p.n, spawn: grid.pos, yaw: grid.yaw,
        name: i === 0 ? "Super Jay" : undefined,
        logoUrl: i === 0 ? superJayLogo : undefined, // Super Jay's logo decal on the player car
        logoAspect: 686 / 1190,
        config: classDef.config, // per-class physics baseline (the builder clones it per car)
      });
      this.cars.push(car);
      this.vehicles.push(car.vehicle);
      this.wear.push(0);
      this.dust.push(this.makeDust(scene, car.root, dustTex, i));
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
    this.player = this.cars[0];
  }

  private makeDust(scene: Scene, root: import("@babylonjs/core/Meshes/mesh").Mesh, tex: ReturnType<typeof makeDustTexture>, i: number): ParticleSystem {
    const node = new TransformNode("dustE" + i, scene);
    node.parent = root;
    // off the RIGHT-REAR tire, like a real sprint car's rooster tail
    node.position.set(0.45, -0.05, -1.0);
    const ps = new ParticleSystem("dust" + i, 130, scene);
    ps.particleTexture = tex;
    // Alpha blend (NOT additive) so dust reads as opaque kicked-up dirt rather
    // than glowing embers — especially important under the night-race lights.
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitter = node as any;
    ps.minEmitBox = new Vector3(-0.25, 0, -0.15);
    ps.maxEmitBox = new Vector3(0.35, 0.15, 0.1);
    const dc = this.dirtTint;
    ps.color1 = new Color4(dc.r * 1.15, dc.g * 1.15, dc.b * 1.15, 0.55);
    ps.color2 = new Color4(dc.r * 0.8, dc.g * 0.8, dc.b * 0.8, 0.4);
    ps.colorDead = new Color4(dc.r * 0.8, dc.g * 0.8, dc.b * 0.8, 0);
    ps.minSize = 0.3; ps.maxSize = 1.6;
    ps.minLifeTime = 0.4; ps.maxLifeTime = 1.15;
    ps.emitRate = 0;
    ps.gravity = new Vector3(0, -3.0, 0);
    // fan up and back into a tall rooster behind the right rear
    ps.direction1 = new Vector3(-0.4, 0.9, -1.6);
    ps.direction2 = new Vector3(0.5, 1.9, -3.0);
    ps.minEmitPower = 1.5; ps.maxEmitPower = 4.2;
    ps.updateSpeed = 0.02;
    ps.start();
    return ps;
  }

  /** Re-apply player setup (e.g. after editing it in the garage). */
  applyPlayerSetup(setup: CarSetup) {
    this.wearRate[0] = applySetup(this.player.vehicle.cfg, setup, this.classDef.config);
    this.wear[0] = 0;
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
    return this.vehicles.map((v) => {
      const p = this.track.project(v.position);
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

  /** surface grip + tire wear + retaining walls + dust, then car-to-car contact */
  private postStep(dt: number) {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const proj = this.track.project(v.position);
      this.wear[i] = Math.min(1, this.wear[i] + v.speed * dt * this.wearRate[i]);
      v.gripMult = this.surface.gripAt(proj.lateral) * (1 - this.wear[i] * 0.28);
      // dirt rooster-tail: thrown up by speed, sliding, and wheelspin under power
      const wheelspin = Math.max(0, v.debug.drive); // longitudinal accel as a spin proxy
      this.dust[i].emitRate = Math.min(300, Math.max(0, (v.speed - 1.5) * 7 + v.debug.slip * 45 + wheelspin * 2.2));
      if (Math.abs(proj.lateral) > this.wallLimit) {
        const sgn = Math.sign(proj.lateral);
        const inx = -sgn * proj.outward.x, inz = -sgn * proj.outward.z; // inward normal
        const into = -(v.velX * inx + v.velZ * inz); // closing speed straight into the wall
        const np = proj.center.add(proj.outward.scale(sgn * this.wallLimit));
        v.position.x = np.x;
        v.position.z = np.z;
        v.bounceOffWall(inx, inz, 0.45); // rebound and keep racing
        if (into > 8.5) v.triggerRollover(into * 0.11); // slam it hard -> tumble
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
          // a genuinely hard T-bone flips them — closing speed along the contact normal
          const rvx = this.vehicles[j].velX - this.vehicles[i].velX;
          const rvz = this.vehicles[j].velZ - this.vehicles[i].velZ;
          const closing = -(rvx * nx + rvz * nz);
          if (closing > 6.5) {
            const sev = closing * 0.15;
            this.vehicles[i].triggerRollover(sev);
            this.vehicles[j].triggerRollover(sev);
          }
        }
      }
    }
  }

  get playerVehicle(): RaycastVehicle {
    return this.player.vehicle;
  }
}
