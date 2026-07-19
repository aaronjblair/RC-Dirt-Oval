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
  slipSteer: number; // how strongly a lateral slide rotates the car (oversteer "looseness": sprint loose, late model planted)
  throttleSteer: number; // how strongly throttle rotates the car through a corner (dirt power-steer)
}

export interface WheelDef {
  posLocal: Vector3;
  steer: boolean;
  drive: boolean;
  visual?: TransformNode;
  radius?: number; // visual tire radius (for proper sprint-car stagger); falls back to cfg.wheelRadius
}

export const DEFAULT_CONFIG: VehicleConfig = {
  mass: 1.6,
  bodySize: new Vector3(1.4, 0.5, 2.4),
  comOffsetY: -0.18,
  suspRest: 0.18,
  wheelRadius: 0.28,
  suspStiffness: 70,
  suspDamping: 6.5,
  tireGrip: 1.8,
  corneringStiffness: 9.6,
  rollResist: 0.85,
  engineForce: 24.5, // sprint baseline — top speed is engineForce/rollResist (outdoor-track speed bump, was 19.55)
  brakeForce: 25,
  maxSteer: 0.55,
  steerSpeedFalloff: 0.05,
  downforce: 0.015,
  slipSteer: 0.6,      // loose, throttle-rotated dirt sprinter
  throttleSteer: 0.015,
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
  private prevGroundY = 0; // ground height under the car last frame (ramp climb-rate → real jump launch)
  private climbRate = 0;   // vertical speed of the surface while climbing a ramp (u/s)
  private heldClimb = 0;   // peak recent climbRate (decays) so a flat tabletop crest still launches
  private airPitch = 0; // chassis pitch while airborne — nose follows the jump arc (up climbing, down falling)
  private landSquat = 0; // brief suspension compression on a clean jump landing (decays to 0)
  private pitch = 0; // visual chassis pitch (squat under power / dive under brakes)
  private rolling = false; // mid-tumble after a hard hit
  private rollTimer = 0; // seconds left in the active tumble
  private rollSpeed = 0; // tumble rate about the long axis (rad/s)
  private rollAngle = 0; // current roll about the long axis (rad)
  // multi-axis tumble: a smaller pitch (X) + yaw (Y) wobble rides along with the primary Z roll
  private pitchSpeed = 0; // tumble rate about the lateral axis (rad/s)
  private pitchAngle = 0; // current extra pitch from the tumble (rad)
  private yawWobSpeed = 0; // tumble rate about the up axis (rad/s)
  private yawWobAngle = 0; // current extra yaw wobble from the tumble (rad)
  private rollSettleTarget = Math.PI; // nearest stable inverted attitude we settle into (not forced exactly π)
  private wasAirborne = false; // edge-detect ground contact during a tumble (for the bounce)
  private stuck = false; // came to rest upside down — immobile until a marshal rights it
  private spawnPos: Vector3;
  private spawnYaw: number;

  /** Live grip scale from track surface state + tire wear (1 = full grip). */
  gripMult = 1;

  // --- temporary arcade BUFFS (RC Pro-Am pickups) ---
  // Per-channel multiplier + seconds remaining; all default to "off" (mult 1, timer 0).
  private buffMul = { grip: 1, accel: 1, top: 1 };
  private buffT = { grip: 0, accel: 0, top: 0 };
  private rollcageTimer = 0; // seconds of roll-cage IMMUNITY remaining (shrugs off rollovers)

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

    // Place wheels at their corners immediately so the car has tires before the
    // race starts (placeWheels otherwise only runs during update()).
    this.chassis.computeWorldMatrix(true);
    this.placeWheels(0);
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
  /** Current heading (yaw) in radians; matches forward = (sin,0,cos). */
  get heading(): number {
    return this.yaw;
  }
  /** World-space planar velocity (for impact/closing-speed detection). */
  get velX(): number { return this.vLong * Math.sin(this.yaw) + this.vLat * Math.cos(this.yaw); }
  get velZ(): number { return this.vLong * Math.cos(this.yaw) - this.vLat * Math.sin(this.yaw); }
  /** True while tumbling from a hard hit (drains control, used for FX). */
  get isRolling(): boolean { return this.rolling; }
  /** True once it has come to rest upside down — waiting for a marshal to right it. */
  get isStuck(): boolean { return this.stuck; }

  /** A marshal has flipped the car back onto its wheels — let it race again. */
  recover() {
    this.stuck = false;
    this.rolling = false;
    this.rollTimer = 0;
    this.vLong = 0; this.vLat = 0; this.vUp = 0;
    // kill the tumble rates so nothing keeps spinning; rollAngle + the pitch/yaw
    // wobble ease back to upright via the settle path in update()
    this.rollSpeed = 0; this.pitchSpeed = 0; this.yawWobSpeed = 0;
  }

  /**
   * Grant a temporary buff to one channel (arcade pickup). `mult` scales that
   * channel (grip/accel/top); `seconds` is its duration. Re-applying refreshes
   * to the longer remaining time. mult is clamped to a sane 0.3..2.5 range.
   */
  applyBuff(kind: "grip" | "accel" | "top", mult: number, seconds: number) {
    this.buffMul[kind] = Math.max(0.3, Math.min(2.5, mult));
    this.buffT[kind] = Math.max(this.buffT[kind], seconds);
  }

  /** Grant roll-cage IMMUNITY for `seconds` — the car shrugs off rollovers. */
  grantImmunity(seconds: number) {
    this.rollcageTimer = Math.max(this.rollcageTimer, seconds);
  }

  /** Seconds REMAINING per buff channel + immunity (0 = inactive). */
  buffState(): { grip: number; accel: number; top: number; immunity: number } {
    return {
      grip: Math.max(0, this.buffT.grip),
      accel: Math.max(0, this.buffT.accel),
      top: Math.max(0, this.buffT.top),
      immunity: Math.max(0, this.rollcageTimer),
    };
  }

  /**
   * Kick the car into a barrel roll after a hard hit: it pops into the air,
   * tumbles once or twice about its long axis, then auto-recovers upright so the
   * driver keeps racing — RC-Pro-Am-style wreck drama without ending the race.
   */
  triggerRollover(severity: number) {
    if (this.rolling || this.airborne || this.stuck || this.rollcageTimer > 0) return;
    this.rolling = true;
    const flips = severity > 1.5 ? 2 : 1;
    this.rollTimer = 0.5 * flips;
    const dir = Math.random() < 0.5 ? 1 : -1;
    // primary barrel roll about the long axis
    this.rollSpeed = ((Math.PI * 2 * flips) / this.rollTimer) * dir;
    this.rollAngle = 0;
    // a smaller, randomized end-over-end pitch + yaw twist so the tumble reads chaotic, not robotic
    this.pitchSpeed = this.rollSpeed * (0.18 + Math.random() * 0.22) * (Math.random() < 0.5 ? 1 : -1);
    this.yawWobSpeed = this.rollSpeed * (0.12 + Math.random() * 0.18) * (Math.random() < 0.5 ? 1 : -1);
    this.pitchAngle = 0;
    this.yawWobAngle = 0;
    // settle to the NATURAL nearest inverted attitude — π nudged a touch so cars don't all rest identically
    this.rollSettleTarget = Math.PI + (Math.random() - 0.5) * 0.5;
    this.wasAirborne = true;
    this.vUp = Math.min(6.5, 3 + severity * 1.4);
    this.airborne = true;
    this.vLong *= 0.45; this.vLat *= 0.45; // scrub speed in the impact
  }

  /** Add a world-space (x,z) velocity impulse — used for car-to-car contact. */
  shove(wx: number, wz: number, mag: number) {
    const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
    this.vLong += (wx * sinY + wz * cosY) * mag;
    this.vLat += (wx * cosY - wz * sinY) * mag;
  }

  /**
   * Bounce off a wall: reflect velocity about the wall's inward normal (nx,nz,
   * pointing back toward the track) with restitution e, plus a little scrub.
   * The car rebounds and keeps racing instead of dead-stopping on the wall.
   */
  bounceOffWall(nx: number, nz: number, e = 0.45) {
    const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
    let vx = this.vLong * sinY + this.vLat * cosY; // world velocity
    let vz = this.vLong * cosY - this.vLat * sinY;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const dot = vx * nx + vz * nz;
    if (dot < 0) { // moving into the wall -> reflect the normal component
      vx -= (1 + e) * dot * nx;
      vz -= (1 + e) * dot * nz;
    }
    vx *= 0.94; vz *= 0.94; // wall scrub
    this.vLong = vx * sinY + vz * cosY; // back to car frame
    this.vLat = vx * cosY - vz * sinY;
  }

  resetTo(pos?: Vector3, yaw?: number) {
    this.pos.copyFrom(pos ?? this.spawnPos);
    this.yaw = yaw ?? this.spawnYaw;
    this.vLong = 0;
    this.vLat = 0;
    this.vUp = 0;
    this.climbRate = 0;
    this.heldClimb = 0;
    // R bails the player out of a flip without waiting for a marshal
    this.stuck = false;
    this.rolling = false;
    this.rollTimer = 0;
    this.rollAngle = 0;
    // wipe all tumble residue — angles + rates on every axis
    this.rollSpeed = 0; this.pitchSpeed = 0; this.yawWobSpeed = 0;
    this.pitchAngle = 0; this.yawWobAngle = 0;
    this.wasAirborne = false;
    // a reset car is clean — drop any active buffs + immunity
    this.buffMul.grip = 1; this.buffMul.accel = 1; this.buffMul.top = 1;
    this.buffT.grip = 0; this.buffT.accel = 0; this.buffT.top = 0;
    this.rollcageTimer = 0;
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

    // --- tick arcade buffs: drain each channel, snap back to neutral when expired ---
    for (const k of ["grip", "accel", "top"] as const) {
      if (this.buffT[k] > 0) {
        this.buffT[k] -= dt;
        if (this.buffT[k] <= 0) { this.buffT[k] = 0; this.buffMul[k] = 1; }
      }
    }
    if (this.rollcageTimer > 0) { this.rollcageTimer = Math.max(0, this.rollcageTimer - dt); }

    const c = this.cfg;

    // --- forward (car-space) basis on flat plane ---
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const fwd = new Vector3(sinY, 0, cosY); // car forward (yaw 0 -> +Z)
    const right = new Vector3(cosY, 0, -sinY);

    // --- steering (smoothed, speed-sensitive) ---
    const ctl = (this.rolling || this.stuck) ? 0 : 1; // no driver authority mid-tumble or stuck inverted
    if (this.stuck) { this.vLong = 0; this.vLat = 0; } // parked upside down until a marshal arrives
    const steerLimit = c.maxSteer / (1 + Math.abs(this.vLong) * c.steerSpeedFalloff);
    const steerTarget = input.steer * steerLimit * ctl;
    this.steerCurrent += (steerTarget - this.steerCurrent) * Math.min(1, dt * 12);

    // --- grip budget (friction circle), boosted by wing downforce ---
    const speed = Math.hypot(this.vLong, this.vLat);
    const gripA = (c.tireGrip * this.gripMult * this.buffMul.grip + c.downforce * speed * speed) * G;

    // --- longitudinal accel ---
    let aLong = 0;
    aLong += input.throttle * c.engineForce * this.buffMul.accel * ctl;
    if (input.brake > 0 && !this.rolling) aLong -= input.brake * c.brakeForce * Math.sign(this.vLong || 1);
    aLong -= (this.vLong * c.rollResist) / this.buffMul.top; // drag / engine braking (top buff lowers drag -> raises max speed)

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
    yawRate += (this.vLat / Math.max(2, speed)) * c.slipSteer * Math.sign(this.vLong || 1);
    // throttle-steer: a touch of power rotates the car through the corner (dirt feel)
    yawRate += this.steerCurrent * input.throttle * Math.min(speed, 12) * c.throttleSteer * Math.sign(this.vLong || 1);
    this.yaw += yawRate * dt;

    // --- integrate world position ---
    const worldVel = fwd.scale(this.vLong).add(right.scale(this.vLat));
    this.pos.addInPlace(worldVel.scale(dt));

    // --- ground sampling: ride height + banking alignment + ramp jumps ---
    const center = this.groundAt(this.pos);
    const wasAir = this.airborne;
    if (center.hit) {
      this.groundNormal = center.normal;
      const targetY = center.y + c.wheelRadius + c.suspRest;
      const onGround = this.pos.y <= targetY + 0.05 && this.vUp <= 0;
      if (onGround) {
        // how fast the surface is RISING under us — a ramp climb stores upward speed
        this.climbRate = (center.y - this.prevGroundY) / Math.max(dt, 1e-4);
        // hold the peak recent climb (decaying) so a brief flat tabletop crest doesn't
        // zero it before the far lip — flat tracks keep climbRate≈0 so this stays 0 (no-op)
        this.heldClimb = Math.max(this.climbRate, this.heldClimb - 6 * dt);
        this.airborne = false;
        this.vUp = 0;
        this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 12); // soft suspension settle
      } else {
        // we're above the surface — if we just rolled off a rising ramp crest, convert the
        // built-up climb speed into a genuine launch (a parabola), not a dribble off the lip.
        // On flat tracks (oval) the car never leaves the ground here, so this never fires.
        // Bigger/steeper ramps at speed store more climb → more air; small whoops stay low.
        if (!wasAir && this.heldClimb > 1.5) this.vUp = Math.min(this.heldClimb, 16);
        this.airborne = true;
      }
      // gravity component along the banked surface pulls the car — only while grounded
      // (an airborne car is fully ballistic; slope-shoving it sideways would wreck the arc)
      if (!this.airborne) {
        const nDotG = -G * center.normal.y;
        const slopeAccel = new Vector3(0, -G, 0).subtract(center.normal.scale(nDotG));
        this.vLong += Vector3.Dot(slopeAccel, fwd) * dt;
        this.vLat += Vector3.Dot(slopeAccel, right) * dt;
      }
    } else {
      this.airborne = true;
    }
    this.prevGroundY = center.y;
    if (this.airborne) {
      this.vUp -= G * dt;
      this.pos.y += this.vUp * dt;
      if (center.hit && this.pos.y < center.y + c.wheelRadius) {
        this.pos.y = center.y + c.wheelRadius;
        this.airborne = false;
        this.climbRate = 0; this.heldClimb = 0; // landed — clear stored climb so it can't re-launch
        // mid-tumble, the body bounces off the dirt and sheds angular speed on each hit
        if (this.rollTimer > 0 && this.wasAirborne && this.vUp < -1) {
          this.vUp = -this.vUp * 0.4; // small bounce back up (restitution)
          this.rollSpeed *= 0.7; // shed roll momentum into the ground
          this.pitchSpeed *= 0.65;
          this.yawWobSpeed *= 0.65;
          this.vLong *= 0.6; this.vLat *= 0.6; // scrub forward/lateral speed on impact
        } else {
          // clean jump landing — FORGIVING: soak the impact into a brief suspension squat
          // plus a small speed scrub on a big drop. Never a tumble (the player wants forgiving).
          const impact = Math.max(0, -this.vUp);
          this.landSquat = Math.min(0.13, this.landSquat + impact * 0.012);
          if (impact > 4) { this.vLong *= 0.92; this.vLat *= 0.8; }
          this.vUp = 0;
        }
      }
    }

    // --- rollover tumble (set by triggerRollover on a hard hit) ---
    if (this.rollTimer > 0) {
      this.rollTimer -= dt;
      // angular-momentum decay: the tumble winds down instead of spinning at a fixed rate
      const decay = Math.max(0, 1 - dt * 1.2);
      this.rollSpeed *= decay;
      this.pitchSpeed *= decay;
      this.yawWobSpeed *= decay;
      this.rollAngle += this.rollSpeed * dt;
      this.pitchAngle += this.pitchSpeed * dt;
      this.yawWobAngle += this.yawWobSpeed * dt;
      if (this.rollTimer <= 0) {
        this.rolling = false;
        this.stuck = true; // tumble done — comes to rest upside down, needs a marshal
        this.rollSpeed = 0; this.pitchSpeed = 0; this.yawWobSpeed = 0;
      }
    } else if (this.stuck) {
      // settle to the NATURAL nearest inverted attitude with a brief damped wobble (not forced exactly π)
      this.rollAngle += (this.rollSettleTarget - this.rollAngle) * Math.min(1, dt * 6);
      this.pitchAngle += (0 - this.pitchAngle) * Math.min(1, dt * 6);
      this.yawWobAngle += (0 - this.yawWobAngle) * Math.min(1, dt * 6);
    } else if (
      Math.abs(this.rollAngle) > 0.001 ||
      Math.abs(this.pitchAngle) > 0.001 ||
      Math.abs(this.yawWobAngle) > 0.001
    ) {
      // settle upright after a marshal rights it — damp out any residual wobble on all axes
      this.rollAngle += (0 - this.rollAngle) * Math.min(1, dt * 5);
      this.pitchAngle += (0 - this.pitchAngle) * Math.min(1, dt * 5);
      this.yawWobAngle += (0 - this.yawWobAngle) * Math.min(1, dt * 5);
    } else {
      this.rollAngle = 0;
      this.pitchAngle = 0;
      this.yawWobAngle = 0;
    }
    this.wasAirborne = this.airborne;

    // --- visual squat / dive / wheelstand: pitch the body from longitudinal accel ---
    const launch = input.throttle * Math.max(0, 1 - speed / 6); // extra nose-up off the corner
    let targetPitch = -this.debug.drive * 0.01 - launch * 0.05;
    targetPitch = Math.max(-0.09, Math.min(0.05, targetPitch)); // ~5° up under power, ~3° dive on brakes
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);

    // --- airborne attitude: the nose follows the jump arc (up while rising, down while falling) ---
    // On flat tracks the car is never airborne, so airPitch/landSquat stay 0 here (oval byte-identical).
    if (this.airborne) {
      const horiz = Math.max(3, Math.abs(this.vLong)); // avoid huge angles when nearly stopped
      const airTarget = -Math.atan2(this.vUp, horiz) * 0.7; // negative = nose up (matches pitch sign)
      this.airPitch += (airTarget - this.airPitch) * Math.min(1, dt * 6);
    } else {
      this.airPitch += (0 - this.airPitch) * Math.min(1, dt * 8); // settle level once back on the ground
    }
    this.landSquat += (0 - this.landSquat) * Math.min(1, dt * 7); // suspension rebound after a landing

    // --- compose chassis orientation: yaw + pitch + roll (incl. multi-axis tumble), align up to ground normal ---
    const yawQuat = Quaternion.RotationAxis(UP, this.yaw + this.yawWobAngle);
    const pitchQuat = Quaternion.RotationAxis(new Vector3(1, 0, 0), this.pitch + this.pitchAngle + this.airPitch + this.landSquat);
    const rollQuat = Quaternion.RotationAxis(new Vector3(0, 0, 1), this.rollAngle);
    const align = this.quatFromTo(UP, this.groundNormal);
    align.multiplyToRef(yawQuat.multiply(pitchQuat).multiply(rollQuat), this.chassis.rotationQuaternion!);
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
        const wr = w.radius ?? this.cfg.wheelRadius; // sit each tire on its own radius (stagger)
        const contactLocal = Vector3.TransformCoordinates(
          new Vector3(attachWorld.x, g.y + wr, attachWorld.z),
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
