import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { createCar, type BuiltCar } from "../car/Car";
import { AIDriver } from "../ai/AIDriver";
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
  readonly player: BuiltCar;
  private wallLimit: number;

  constructor(
    scene: Scene,
    plugin: HavokPlugin,
    shadow: ShadowGenerator | null,
    private track: OvalTrack,
    def: TrackDef,
    race: RaceManager
  ) {
    this.wallLimit = def.width / 2 - 0.7;
    const n = Math.min(def.fieldSize, PALETTE.length);
    for (let i = 0; i < n; i++) {
      const grid = track.gridPose(i);
      const p = PALETTE[i];
      const car = createCar(scene, plugin, shadow, { color: p.c, number: p.n, spawn: grid.pos, yaw: grid.yaw });
      this.cars.push(car);
      this.vehicles.push(car.vehicle);
      if (i === 0) {
        this.ai.push(null);
      } else {
        const skill = Math.max(0.2, Math.min(1, def.aiSkill + (Math.random() - 0.5) * 0.25));
        this.ai.push(new AIDriver(car.vehicle, track, skill));
      }
      race.add(i === 0 ? "player" : `ai${i}`, i === 0, () => car.vehicle.position);
    }
    this.player = this.cars[0];
  }

  update(dt: number, playerInput: DriveInput) {
    // player
    this.player.vehicle.update(dt, playerInput);
    // ai
    for (let i = 1; i < this.cars.length; i++) {
      const input = this.ai[i]!.update(dt, this.vehicles);
      this.cars[i].vehicle.update(dt, input);
    }
    // keep all cars on the racing surface
    for (const v of this.vehicles) {
      const proj = this.track.project(v.position);
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
