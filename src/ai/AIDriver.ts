import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { RaycastVehicle } from "../physics/RaycastVehicle";
import type { OvalTrack } from "../track/OvalTrack";
import type { DriveInput } from "../core/Input";

function norm(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Pure-pursuit dirt-oval AI: follows the racing line with a skill-scaled pace,
 * lifts for corners, takes a slightly low (inside) groove, and avoids cars
 * directly ahead. Skill 0..1 sets pace, lookahead and consistency.
 */
export class AIDriver {
  private lineBias: number; // preferred lateral offset (groove)
  private wobblePhase = Math.random() * 10;

  constructor(
    private vehicle: RaycastVehicle,
    private track: OvalTrack,
    private skill: number
  ) {
    this.lineBias = -track.def.width * (0.05 + 0.12 * skill); // better drivers run lower
  }

  update(dt: number, opponents: RaycastVehicle[]): DriveInput {
    const v = this.vehicle;
    const proj = this.track.project(v.position);
    const speed = v.speed;

    // pure-pursuit aim point on the racing line
    const Ld = Math.max(8, speed * (1.1 + this.skill * 0.4));
    const ahead = this.track.sampleAt(proj.s + Ld);
    const aim = ahead.pos.add(ahead.outward.scale(this.lineBias));
    const dir = aim.subtract(v.position);
    let desired = Math.atan2(dir.x, dir.z);
    let alpha = norm(desired - v.heading);

    // estimate the radius of the corner just ahead from how fast heading turns
    const arc = 14;
    const a0 = this.track.sampleAt(proj.s + 3);
    const a1 = this.track.sampleAt(proj.s + 3 + arc);
    const dTheta = Math.abs(norm(
      Math.atan2(a1.tangent.x, a1.tangent.z) - Math.atan2(a0.tangent.x, a0.tangent.z)
    ));
    const radius = arc / Math.max(0.02, dTheta); // big on straights, ~corner R in turns

    // physics-based corner speed: v = sqrt(mu * g * R), with a skill safety margin
    const muEff = v.cfg.tireGrip * v.gripMult;
    const margin = 0.82 + 0.14 * this.skill; // braver drivers carry more
    const vCorner = Math.sqrt(Math.max(4, muEff * 9.81 * radius)) * margin;

    // --- avoid a car right in front ---
    let avoid = 0;
    let avoidLift = 0;
    const fwd = new Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
    for (const o of opponents) {
      if (o === v) continue;
      const rel = o.position.subtract(v.position);
      const aheadDot = Vector3.Dot(rel, fwd);
      const dist = rel.length();
      if (aheadDot > 0 && dist < 5.0) {
        const side = Vector3.Dot(rel, new Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading)));
        avoid += (side >= 0 ? -1 : 1) * (1 - dist / 5.0) * 0.5;
        avoidLift = Math.max(avoidLift, (1 - dist / 5.0) * 0.4);
      }
    }

    // small human-like wobble (less for skilled drivers)
    this.wobblePhase += dt;
    const wobble = Math.sin(this.wobblePhase * 1.7) * 0.025 * (1 - this.skill);

    const steer = Math.max(-1, Math.min(1, alpha * 1.6 + avoid + wobble));

    // throttle/brake to track the target corner speed (momentum oval style)
    const paceCap = 0.9 + 0.1 * this.skill;
    let throttle: number, brake = 0;
    if (speed > vCorner + 0.4) {
      throttle = 0;
      brake = Math.min(1, (speed - vCorner) * 0.6);
    } else {
      throttle = Math.max(0.3, paceCap - avoidLift);
    }

    return { throttle, brake, steer, reset: false, usingGamepad: false };
  }
}
