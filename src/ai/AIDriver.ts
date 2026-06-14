import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { RaycastVehicle } from "../physics/RaycastVehicle";
import type { OvalTrack } from "../track/OvalTrack";
import type { SurfaceModel } from "../track/SurfaceModel";
import type { DriveInput } from "../core/Input";

/** A car's position on the track, projected once per frame by the Field. */
export interface CarState {
  v: RaycastVehicle;
  s: number; // distance along centerline
  lateral: number; // signed offset from centerline (+ = outward / toward the cushion)
}

function norm(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Dirt-oval racecraft AI. Reads the evolving surface and races whichever groove
 * is currently fast (bottom early, top cushion late), follows it with a
 * skill-scaled pace and physics-based corner speed, and actually RACES traffic:
 * to pass it takes the groove the leader isn't using, throws a slide job (dives
 * under in a corner then cuts up across the leader's nose), and — when leading —
 * covers the inside against a challenger. Per-driver preference and aggression
 * give the field varied, mostly-clean side-by-side racing.
 */
export class AIDriver {
  private baseLat: number; // the line this driver has settled into on open track
  private lineBias: number; // small personal lateral preference
  private prefersTop: number; // 0..1 willingness to commit to the high cushion
  private aggression: number; // 0..1 willingness to slide-job / defend
  private wobblePhase = Math.random() * 10;
  private slideTimer = 0; // >0 while committed to cutting up across a leader
  private paceWave = Math.random() * 10; // slow ebb/flow of pace over a stint
  private paceFreq = 0.25 + Math.random() * 0.25;
  private bobbleTimer = 4 + Math.random() * 12; // countdown to the next possible bobble
  private bobble = 0; // seconds remaining of a current bobble (brief off-corner lift)

  constructor(
    private vehicle: RaycastVehicle,
    private track: OvalTrack,
    private skill: number
  ) {
    this.lineBias = (Math.random() - 0.5) * track.def.width * 0.06;
    this.prefersTop = Math.random() * 0.55 + skill * 0.25;
    this.aggression = Math.min(1, 0.3 + skill * 0.6 + Math.random() * 0.2);
    this.baseLat = -track.def.width * 0.12;
  }

  update(dt: number, myIndex: number, states: CarState[], surface: SurfaceModel): DriveInput {
    const v = this.vehicle;
    const me = states[myIndex];
    const speed = v.speed;
    const W = this.track.def.width;
    const len = this.track.length;
    const maxLat = W / 2 - 1.0; // keep clear of the walls

    // --- which groove is fast right now? bottom early, cushion late ---
    const bottom = surface.bottomLateral;
    const cushion = surface.cushionLateral;
    const gB = surface.gripAt(bottom);
    const gC = surface.gripAt(cushion);
    const topFast = gC + (this.prefersTop - 0.5) * 0.04 > gB;
    let target = (topFast ? cushion : bottom) + this.lineBias;
    // drivers commit to a line gradually rather than darting across the track
    this.baseLat += (target - this.baseLat) * Math.min(1, dt * (0.4 + this.skill * 0.8));
    target = this.baseLat;

    // --- corner geometry just ahead (radius -> corner speed) ---
    const arc = 14;
    const a0 = this.track.sampleAt(me.s + 3);
    const a1 = this.track.sampleAt(me.s + 3 + arc);
    const dTheta = Math.abs(norm(
      Math.atan2(a1.tangent.x, a1.tangent.z) - Math.atan2(a0.tangent.x, a0.tangent.z)
    ));
    const radius = arc / Math.max(0.02, dTheta);
    const inCorner = radius < this.track.def.cornerRadius * 3;

    // --- traffic: nearest car ahead, nearest challenger just behind ---
    let lead: CarState | null = null, leadGap = Infinity;
    let challenger: CarState | null = null, chGap = Infinity;
    for (let i = 0; i < states.length; i++) {
      if (i === myIndex) continue;
      const o = states[i];
      let ds = o.s - me.s;
      if (ds > len / 2) ds -= len; else if (ds < -len / 2) ds += len;
      if (ds > 0 && ds < 16 && ds < leadGap) { leadGap = ds; lead = o; }
      if (ds < 0 && -ds < 6 && -ds < chGap) { chGap = -ds; challenger = o; }
    }

    // --- overtaking: take the groove the leader ISN'T using; slide-job in corners ---
    let passLift = 0;
    this.slideTimer = Math.max(0, this.slideTimer - dt);
    if (lead && leadGap < 10 && speed > lead.v.speed - 1.0) {
      const passHigh = lead.lateral < (bottom + cushion) / 2; // they're low -> drive around high
      target = passHigh ? cushion : bottom;
      // SLIDE JOB: under them and alongside in a corner -> cut up across the nose
      if (inCorner && leadGap < 3.2 && me.lateral < lead.lateral - 0.3 &&
          speed > lead.v.speed - 0.3 && this.aggression > 0.55) {
        target = Math.min(maxLat, lead.lateral + W * 0.16);
        this.slideTimer = 0.5;
      }
      passLift = 0.05; // lean on the throttle to complete the move
    }
    if (this.slideTimer > 0) target = Math.min(maxLat, Math.max(target, me.lateral + 0.6));

    // --- defense: cover the inside on the straight if someone's diving under ---
    if (challenger && challenger.lateral < me.lateral - 0.4 && this.aggression > 0.6 && !inCorner) {
      target = Math.min(target, challenger.lateral + 0.5);
    }

    target = Math.max(-maxLat, Math.min(maxLat, target));

    // --- pure-pursuit toward the aim point on the target line ---
    const Ld = Math.max(8, speed * (1.1 + this.skill * 0.4));
    const ahead = this.track.sampleAt(me.s + Ld);
    const aim = ahead.pos.add(ahead.outward.scale(target));
    const dir = aim.subtract(v.position);
    const alpha = norm(Math.atan2(dir.x, dir.z) - v.heading);

    // emergency dodge so we don't simply rear-end a car dead ahead in our lane
    let dodge = 0;
    if (lead && leadGap < 3.0) {
      const fwd = new Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
      const rel = lead.v.position.subtract(v.position);
      if (Vector3.Dot(rel, fwd) > 0) {
        const side = Vector3.Dot(rel, new Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading)));
        dodge = (side >= 0 ? -1 : 1) * 0.35;
      }
    }

    // --- pace variety: each driver ebbs and flows, and lower-skill drivers bobble ---
    this.paceWave += dt;
    const paceMod = Math.sin(this.paceWave * this.paceFreq) * 0.06 * (1 - this.skill);
    this.bobbleTimer -= dt;
    if (this.bobbleTimer <= 0) {
      this.bobbleTimer = 7 + Math.random() * 13;
      if (Math.random() < (1 - this.skill) * 0.5) this.bobble = 0.5 + Math.random() * 0.5;
    }
    let bobbleLift = 0;
    if (this.bobble > 0) { this.bobble -= dt; bobbleLift = 0.35; }

    this.wobblePhase += dt;
    const wobble = Math.sin(this.wobblePhase * 1.7) * (0.025 + bobbleLift * 0.04) * (1 - this.skill);
    const steer = Math.max(-1, Math.min(1, alpha * 1.6 + dodge + wobble));

    // --- throttle/brake to hold the physics-based corner speed (momentum oval) ---
    const muEff = v.cfg.tireGrip * v.gripMult;
    const margin = 0.82 + 0.14 * this.skill + paceMod;
    const vCorner = Math.sqrt(Math.max(4, muEff * 9.81 * radius)) * margin;
    const paceCap = 0.9 + 0.1 * this.skill + passLift - bobbleLift;
    let throttle: number, brake = 0;
    if (speed > vCorner + 0.4) {
      throttle = 0;
      brake = Math.min(1, (speed - vCorner) * 0.6);
    } else {
      throttle = Math.min(1, Math.max(0.3, paceCap));
      // ease off rather than shunt a car we're stuck directly behind in the same lane
      if (lead && leadGap < 2.2 && Math.abs(me.lateral - lead.lateral) < 1.0) throttle *= 0.8;
    }

    return { throttle, brake, steer, reset: false, usingGamepad: false };
  }
}
