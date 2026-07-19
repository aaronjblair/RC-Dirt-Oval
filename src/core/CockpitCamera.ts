import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { RaycastVehicle } from "../physics/RaycastVehicle";

/**
 * First-person "in the seat" camera for the player car. A `cockpitEye` node is parented to the car
 * root, so the camera inherits the car's heading/pitch/roll/position automatically (the banking and
 * wheelstand/squat are already part of the motion). On top of that it adds SUBTLE driver feel:
 * a small lean into the corner, a faint speed-scaled shake, and a touch of speed-FOV.
 *
 * Eye rides ABOVE the bodywork (clear of the sprint top wing, ~y1.5) and slightly behind the car,
 * pitched down so the TRACK AHEAD is always visible OVER the front of the car — the nose frames the
 * bottom of the view instead of blocking it. Local car frame: +Z forward, +Y up.
 */
/** Per-class cockpit mount: eye position (local to the car root), base look-down pitch, base FOV.
 *  The sprint baseline reads like a winged-sprint cockpit; each class can override (the low, small
 *  buggy needs a much lower eye, and we want its shock towers in frame). */
export interface CockpitConfig {
  eye: Vector3;
  basePitch: number;
  baseFov: number;
}

// Sprint/late-model baseline — raised over the top wing so the racing surface ahead is clearly
// visible over the nose (the old 1.45 eye put the wing/scoop in the driver's face).
const DEFAULT_COCKPIT: CockpitConfig = { eye: new Vector3(0, 1.95, -1.55), basePitch: 0.14, baseFov: 1.34 };

// Buggy: a much lower, shorter car — the eye still sits low so the shock towers frame the view,
// but high enough to see the dirt ahead over the buggy's nose.
export const BUGGY_COCKPIT: CockpitConfig = { eye: new Vector3(0, 0.85, -0.7), basePitch: 0.09, baseFov: 1.4 };

export class CockpitCamera {
  readonly camera: UniversalCamera;
  private eye: TransformNode;
  private basePitch: number;
  private baseFov: number;
  private prevHeading = 0;
  private lean = 0;   // smoothed roll into the corner
  private look = 0;   // smoothed yaw bias toward the corner
  private shakeX = 0;
  private shakeY = 0;

  constructor(scene: Scene, config: CockpitConfig = DEFAULT_COCKPIT) {
    this.basePitch = config.basePitch;
    this.baseFov = config.baseFov;
    this.eye = new TransformNode("cockpitEye", scene);
    this.eye.position.copyFrom(config.eye);
    this.camera = new UniversalCamera("cockpit", new Vector3(0, 0, 0), scene);
    this.camera.parent = this.eye;
    this.camera.minZ = 0.06;
    this.camera.maxZ = 6000;
    this.camera.fov = this.baseFov;
    this.camera.rotation.set(this.basePitch, 0, 0); // look forward (+Z), a hair down
    this.camera.inputs.clear();
  }

  /** Mount the eye on the player car root so the camera rides with the car. */
  attachTo(carRoot: TransformNode): void {
    this.eye.parent = carRoot;
  }

  /** Per-frame subtle driver motion (lean into corners, light shake, speed-FOV). `zoom` (1 = default,
   *  >1 = zoomed in) is the user's manual zoom, applied to the field of view. */
  update(dt: number, vehicle: RaycastVehicle, zoom = 1): void {
    if (dt <= 0) return;
    const speed = vehicle.speed;
    const heading = vehicle.heading;

    // Yaw rate (wrapped to [-PI, PI]) drives the lean.
    let dHead = heading - this.prevHeading;
    while (dHead > Math.PI) dHead -= Math.PI * 2;
    while (dHead < -Math.PI) dHead += Math.PI * 2;
    this.prevHeading = heading;
    const yawRate = dHead / dt; // rad/s
    const corner = Math.min(1, speed / 14); // no lean when crawling

    // Lean the head INTO the corner (banked-driver feel); a touch of look-into-corner too.
    const targetLean = Math.max(-0.06, Math.min(0.06, yawRate * 0.05 * corner));
    const targetLook = Math.max(-0.05, Math.min(0.05, yawRate * 0.04 * corner));
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 6);
    this.look += (targetLook - this.look) * Math.min(1, dt * 6);

    // Faint engine/dirt shake, scaled by speed and smoothed so it never jitters hard.
    const amp = 0.004 * Math.min(1, speed / 16);
    this.shakeX += ((Math.random() - 0.5) * amp - this.shakeX) * Math.min(1, dt * 12);
    this.shakeY += ((Math.random() - 0.5) * amp - this.shakeY) * Math.min(1, dt * 12);

    this.camera.position.set(this.shakeX, this.shakeY, 0);
    this.camera.rotation.set(this.basePitch + this.shakeY * 0.4, this.look, this.lean);
    this.camera.fov = this.baseFov / zoom + Math.min(0.12, speed * 0.004); // user zoom + sense of speed (stronger for the outdoor speed bump, still shy of fisheye)
  }
}
