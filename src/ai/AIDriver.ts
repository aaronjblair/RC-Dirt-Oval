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

    // corner severity from upcoming curvature (compare headings ahead)
    const near = this.track.sampleAt(proj.s + 4);
    const far = this.track.sampleAt(proj.s + 16);
    const curve = Math.abs(norm(
      Math.atan2(far.tangent.x, far.tangent.z) - Math.atan2(near.tangent.x, near.tangent.z)
    ));

    // --- avoid a car right in front ---
    let avoid = 0;
    let lift = 0;
    const fwd = new Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
    for (const o of opponents) {
      if (o === v) continue;
      const rel = o.position.subtract(v.position);
      const ahead2 = Vector3.Dot(rel, fwd);
      const dist = rel.length();
      if (ahead2 > 0 && dist < 5.5) {
        const side = Vector3.Dot(rel, new Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading)));
        avoid += (side >= 0 ? -1 : 1) * (1 - dist / 5.5) * 0.6;
        lift = Math.max(lift, (1 - dist / 5.5) * 0.5);
      }
    }

    // small human-like wobble
    this.wobblePhase += dt;
    const wobble = Math.sin(this.wobblePhase * 1.7) * 0.03 * (1 - this.skill);

    const steer = Math.max(-1, Math.min(1, alpha * 1.5 + avoid + wobble));

    // pace: ease off through curves, scaled by skill
    const paceCap = 0.8 + 0.2 * this.skill;
    const cornerLift = Math.min(0.55, curve * 1.3);
    const throttle = Math.max(0.25, paceCap - cornerLift - lift);

    return { throttle, brake: 0, steer, reset: false, usingGamepad: false };
  }
}
