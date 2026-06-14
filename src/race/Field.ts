import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { makeDustTexture } from "../core/Textures";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { createCar, type BuiltCar } from "../car/Car";
import { AIDriver } from "../ai/AIDriver";
import { SurfaceModel } from "../track/SurfaceModel";
import { applySetup, DEFAULT_SETUP, type CarSetup } from "../car/CarSetup";
import { driverName } from "../career/Career";
import type { OvalTrack } from "../track/OvalTrack";
import type { TrackDef } from "../track/TrackDef";
import type { RaceManager } from "./RaceManager";
import type { DriveInput } from "../core/Input";
import type { RaycastVehicle } from "../physics/RaycastVehicle";

const PALETTE: { c: Color3; n: number }[] = [
  { c: new Color3(0.9, 0.08, 0.12), n: 22 },
  { c: new Color3(0.1, 0.45, 0.95), n: 7 },
  { c: new Color3(0.95, 0.78, 0.1), n: 1 },
  { c: new Color3(0.1, 0.7, 0.35), n: 11 },
  { c: new Color3(0.85, 0.4, 0.05), n: 24 },
  { c: new Color3(0.6, 0.15, 0.8), n: 9 },
  { c: new Color3(0.9, 0.9, 0.95), n: 4 },
  { c: new Color3(0.1, 0.8, 0.8), n: 15 },
  { c: new Color3(0.95, 0.5, 0.7), n: 17 },
  { c: new Color3(0.3, 0.3, 0.35), n: 2 },
];

/** Builds and drives the full field: the player plus AI sprint cars. */
export class Field {
  cars: BuiltCar[] = [];
  private ai: (AIDriver | null)[] = [];
  private vehicles: RaycastVehicle[] = [];
  private wear: number[] = [];
  private wearRate: number[] = [];
  private dust: ParticleSystem[] = [];
  readonly player: BuiltCar;
  readonly surface: SurfaceModel;
  private wallLimit: number;
  private dirtTint: Color3;

  constructor(
    scene: Scene,
    plugin: HavokPlugin,
    shadow: ShadowGenerator | null,
    private track: OvalTrack,
    def: TrackDef,
    race: RaceManager,
    playerSetup: CarSetup = DEFAULT_SETUP
  ) {
    this.wallLimit = def.width / 2 - 0.7;
    this.surface = new SurfaceModel(def);
    // Dust takes on the track's dirt colour (lifted toward a dry, dusty tone).
    this.dirtTint = Color3.Lerp(def.dirtColor, new Color3(0.62, 0.5, 0.38), 0.45);
    const dustTex = makeDustTexture(scene);
    const n = Math.min(def.fieldSize, PALETTE.length);
    for (let i = 0; i < n; i++) {
      const grid = track.gridPose(i);
      const p = PALETTE[i];
      const car = createCar(scene, plugin, shadow, { color: p.c, number: p.n, spawn: grid.pos, yaw: grid.yaw });
      this.cars.push(car);
      this.vehicles.push(car.vehicle);
      this.wear.push(0);
      this.dust.push(this.makeDust(scene, car.root, dustTex, i));
      if (i === 0) {
        this.ai.push(null);
        this.wearRate.push(applySetup(car.vehicle.cfg, playerSetup));
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
    node.position.set(0, -0.1, -1.0);
    const ps = new ParticleSystem("dust" + i, 90, scene);
    ps.particleTexture = tex;
    // Alpha blend (NOT additive) so dust reads as opaque kicked-up dirt rather
    // than glowing embers — especially important under the night-race lights.
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitter = node as any;
    ps.minEmitBox = new Vector3(-0.4, 0, -0.1);
    ps.maxEmitBox = new Vector3(0.4, 0.2, 0.1);
    const dc = this.dirtTint;
    ps.color1 = new Color4(dc.r * 1.15, dc.g * 1.15, dc.b * 1.15, 0.55);
    ps.color2 = new Color4(dc.r * 0.8, dc.g * 0.8, dc.b * 0.8, 0.4);
    ps.colorDead = new Color4(dc.r * 0.8, dc.g * 0.8, dc.b * 0.8, 0);
    ps.minSize = 0.35; ps.maxSize = 1.4;
    ps.minLifeTime = 0.4; ps.maxLifeTime = 1.0;
    ps.emitRate = 0;
    ps.gravity = new Vector3(0, -2.5, 0);
    ps.direction1 = new Vector3(-0.6, 0.6, -1.5);
    ps.direction2 = new Vector3(0.6, 1.3, -2.6);
    ps.minEmitPower = 1; ps.maxEmitPower = 3.2;
    ps.updateSpeed = 0.02;
    ps.start();
    return ps;
  }

  /** Re-apply player setup (e.g. after editing it in the garage). */
  applyPlayerSetup(setup: CarSetup) {
    this.wearRate[0] = applySetup(this.player.vehicle.cfg, setup);
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

  update(dt: number, playerInput: DriveInput, raceFraction: number) {
    this.surface.update(raceFraction);

    // player
    this.player.vehicle.update(dt, playerInput);
    // ai
    for (let i = 1; i < this.cars.length; i++) {
      const input = this.ai[i]!.update(dt, this.vehicles);
      this.cars[i].vehicle.update(dt, input);
    }

    // surface grip + tire wear + retaining walls
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const proj = this.track.project(v.position);
      this.wear[i] = Math.min(1, this.wear[i] + v.speed * dt * this.wearRate[i]);
      v.gripMult = this.surface.gripAt(proj.lateral) * (1 - this.wear[i] * 0.28);
      // dirt rooster-tail: more when fast and sliding
      this.dust[i].emitRate = Math.min(220, Math.max(0, (v.speed - 1.5) * 8 + v.debug.slip * 35));
      if (Math.abs(proj.lateral) > this.wallLimit) {
        const np = proj.center.add(proj.outward.scale(Math.sign(proj.lateral) * this.wallLimit));
        v.position.x = np.x;
        v.position.z = np.z;
        v.collideWall();
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
          this.vehicles[i].bump(0.9);
          this.vehicles[j].bump(0.9);
        }
      }
    }
  }

  get playerVehicle(): RaycastVehicle {
    return this.player.vehicle;
  }
}
