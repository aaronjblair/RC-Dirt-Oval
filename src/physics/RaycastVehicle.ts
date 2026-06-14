import { Scene } from "@babylonjs/core/scene";
import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { DriveInput } from "../core/Input";

/** Collision filter groups so wheel rays only hit the track, never cars. */
export const GROUP_GROUND = 1;
export const GROUP_CAR = 2;

export interface VehicleConfig {
  mass: number;
  bodySize: Vector3;
  comOffsetY: number;
  suspRest: number;
  wheelRadius: number;
  suspStiffness: number;
  suspDamping: number;
  tireGrip: number; // lateral friction coefficient (* g = max lateral accel)
  corneringStiffness: number; // how fast lateral slip is arrested
  rollResist: number; // linear drag (1/s)
  engineForce: number; // forward acceleration at full throttle (u/s^2)
  brakeForce: number; // braking acceleration (u/s^2)
  maxSteer: number; // radians
  steerSpeedFalloff: number;
  downforce: number; // extra grip per (u/s)^2
}

export interface WheelDef {
  posLocal: Vector3;
  steer: boolean;
  drive: boolean;
  visual?: TransformNode;
}

export const DEFAULT_CONFIG: VehicleConfig = {
  mass: 1.6,
  bodySize: new Vector3(1.4, 0.5, 2.4),
  comOffsetY: -0.18,
  suspRest: 0.18,
  wheelRadius: 0.28,
  suspStiffness: 70,
  suspDamping: 6.5,
  tireGrip: 1.7,
  corneringStiffness: 9,
  rollResist: 1.0,
  engineForce: 13,
  brakeForce: 20,
  maxSteer: 0.55,
  steerSpeedFalloff: 0.05,
  downforce: 0.015,
};

const UP = new Vector3(0, 1, 0);
const G = 9.81;

/**
 * Kinematic single-track-ish vehicle. We integrate our own velocity (a
 * slip-based tire model with a friction circle) and yaw, then sample the
 * ground with Havok raycasts to set ride height and align to banking. This is
 * deterministic and tunable, and behaves correctly on banked dirt ovals.
 */
export class RaycastVehicle {
  readonly chassis: AbstractMesh;
  readonly cfg: VehicleConfig;
  private wheels: WheelDef[];
  private ray = new PhysicsRaycastResult();
  private rayQuery = { collideWith: GROUP_GROUND };

  private pos: Vector3;
  private yaw: number;
  private vLong = 0; // forward velocity (u/s)
  private vLat = 0; // lateral velocity (u/s)
  private steerCurrent = 0;
  private wheelbase: number;
  private groundNormal = UP.clone();
  private airborne = false;
  private vUp = 0; // vertical velocity when airborne
  private spawnPos: Vector3;
  private spawnYaw: number;

  debug = { grounded: 0, load: 0, drive: 0, lat: 0, slip: 0 };
  private _m = new Matrix();

  constructor(
    _scene: Scene,
    private plugin: HavokPlugin,
    chassis: AbstractMesh,
    wheelDefs: WheelDef[],
    cfg: VehicleConfig = DEFAULT_CONFIG
  ) {
    this.chassis = chassis;
    this.cfg = cfg;
    this.wheels = wheelDefs;
    if (!chassis.rotationQuaternion) chassis.rotationQuaternion = Quaternion.Identity();
    this.pos = chassis.position.clone();
    this.yaw = chassis.rotationQuaternion.toEulerAngles().y;
    this.spawnPos = this.pos.clone();
    this.spawnYaw = this.yaw;

    const frontZ = Math.max(...wheelDefs.map((w) => w.posLocal.z));
    const rearZ = Math.min(...wheelDefs.map((w) => w.posLocal.z));
    this.wheelbase = Math.max(0.5, frontZ - rearZ);
  }

  get speed(): number {
    return Math.hypot(this.vLong, this.vLat);
  }
  get forwardSpeed(): number {
    return this.vLong;
  }
  get position(): Vector3 {
    return this.pos;
  }
  get upDot(): number {
    return Vector3.Dot(this.groundNormal, UP);
  }

  /** Scrub speed when scraping a wall (called by the bounds limiter). */
  collideWall() {
    this.vLong *= 0.9;
    this.vLat = 0;
  }

  resetTo(pos?: Vector3, yaw?: number) {
    this.pos.copyFrom(pos ?? this.spawnPos);
    this.yaw = yaw ?? this.spawnYaw;
    this.vLong = 0;
    this.vLat = 0;
    this.vUp = 0;
  }

  private groundAt(world: Vector3): { hit: boolean; y: number; normal: Vector3 } {
    const from = new Vector3(world.x, world.y + 2.5, world.z);
    const to = new Vector3(world.x, world.y - 4, world.z);
    this.plugin.raycast(from, to, this.ray, this.rayQuery);
    if (this.ray.hasHit) {
      return { hit: true, y: this.ray.hitPointWorld.y, normal: this.ray.hitNormalWorld.clone() };
    }
    return { hit: false, y: 0, normal: UP.clone() };
  }

  update(dt: number, input: DriveInput) {
    if (dt <= 0) return;
    if (input.reset) this.resetTo();

    const c = this.cfg;

    // --- forward (car-space) basis on flat plane ---
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const fwd = new Vector3(sinY, 0, cosY); // car forward (yaw 0 -> +Z)
    const right = new Vector3(cosY, 0, -sinY);

    // --- steering (smoothed, speed-sensitive) ---
    const steerLimit = c.maxSteer / (1 + Math.abs(this.vLong) * c.steerSpeedFalloff);
    const steerTarget = input.steer * steerLimit;
    this.steerCurrent += (steerTarget - this.steerCurrent) * Math.min(1, dt * 12);

    // --- grip budget (friction circle), boosted by wing downforce ---
    const speed = Math.hypot(this.vLong, this.vLat);
    const gripA = (c.tireGrip + c.downforce * speed * speed) * G;

    // --- longitudinal accel ---
    let aLong = 0;
    aLong += input.throttle * c.engineForce;
    if (input.brake > 0) aLong -= input.brake * c.brakeForce * Math.sign(this.vLong || 1);
    aLong -= this.vLong * c.rollResist; // drag / engine braking

    // --- lateral accel: tire resists sideways slip ---
    let aLat = -this.vLat * c.corneringStiffness;

    // friction circle clamp (traction loss => slides/drifts)
    const aMag = Math.hypot(aLong, aLat);
    if (aMag > gripA && aMag > 1e-4) {
      const s = gripA / aMag;
      aLong *= s;
      aLat *= s;
    }
    this.debug.drive = aLong;
    this.debug.lat = aLat;
    this.debug.slip = Math.abs(this.vLat);

    // integrate planar velocity
    this.vLong += aLong * dt;
    this.vLat += aLat * dt;

    // --- yaw from steering (bicycle model) + a little slip oversteer ---
    let yawRate = 0;
    if (Math.abs(this.vLong) > 0.05) {
      yawRate = (this.vLong / this.wheelbase) * Math.tan(this.steerCurrent);
    }
    yawRate += (this.vLat / Math.max(2, speed)) * 0.6 * Math.sign(this.vLong || 1);
    this.yaw += yawRate * dt;

    // --- integrate world position ---
    const worldVel = fwd.scale(this.vLong).add(right.scale(this.vLat));
    this.pos.addInPlace(worldVel.scale(dt));

    // --- ground sampling: ride height + banking alignment ---
    const center = this.groundAt(this.pos);
    if (center.hit) {
      this.groundNormal = center.normal;
      const targetY = center.y + c.wheelRadius + c.suspRest;
      if (this.pos.y <= targetY + 0.05) {
        this.airborne = false;
        this.vUp = 0;
        this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 12); // soft suspension settle
      } else {
        this.airborne = true;
      }
      // gravity component along the banked surface pulls the car
      const nDotG = -G * center.normal.y;
      const slopeAccel = new Vector3(0, -G, 0).subtract(center.normal.scale(nDotG));
      const aFwd = Vector3.Dot(slopeAccel, fwd);
      const aRight = Vector3.Dot(slopeAccel, right);
      this.vLong += aFwd * dt;
      this.vLat += aRight * dt;
    } else {
      this.airborne = true;
    }
    if (this.airborne) {
      this.vUp -= G * dt;
      this.pos.y += this.vUp * dt;
      if (this.pos.y < center.y + c.wheelRadius) {
        this.pos.y = center.y + c.wheelRadius;
        this.airborne = false;
        this.vUp = 0;
      }
    }

    // --- compose chassis orientation: yaw + align up to ground normal ---
    const yawQuat = Quaternion.RotationAxis(UP, this.yaw);
    const align = this.quatFromTo(UP, this.groundNormal);
    align.multiplyToRef(yawQuat, this.chassis.rotationQuaternion!);
    this.chassis.position.copyFrom(this.pos);

    // --- visual wheels (steer + roll + per-corner ground contact) ---
    this.placeWheels(dt);
  }

  private quatFromTo(from: Vector3, to: Vector3): Quaternion {
    const d = Vector3.Dot(from, to);
    if (d > 0.99999) return Quaternion.Identity();
    if (d < -0.99999) return Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI);
    const axis = Vector3.Cross(from, to);
    axis.normalize();
    return Quaternion.RotationAxis(axis, Math.acos(d));
  }

  private wheelSpin = 0;
  private placeWheels(dt: number) {
    this.wheelSpin += (this.vLong / Math.max(0.1, this.cfg.wheelRadius)) * dt;
    this.debug.grounded = 0;
    const world = this.chassis.getWorldMatrix();
    world.invertToRef(this._m);
    for (const w of this.wheels) {
      if (!w.visual) continue;
      const attachWorld = Vector3.TransformCoordinates(w.posLocal, world);
      const g = this.groundAt(attachWorld);
      let localY = w.posLocal.y;
      if (g.hit) {
        this.debug.grounded++;
        const contactLocal = Vector3.TransformCoordinates(
          new Vector3(attachWorld.x, g.y + this.cfg.wheelRadius, attachWorld.z),
          this._m
        );
        localY = contactLocal.y;
      }
      w.visual.position.set(w.posLocal.x, localY, w.posLocal.z);
      const yaw = w.steer ? this.steerCurrent : 0;
      w.visual.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, this.wheelSpin, 0);
    }
    this.debug.load = this.debug.grounded * this.cfg.mass * G * 0.25;
  }
}
