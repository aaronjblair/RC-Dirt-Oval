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
 * Eye sits just above the helmet (clear of the helmet mesh), behind the steering wheel — looking out
 * over the nose with the roll cage to the sides and the top wing high overhead. Local car frame:
 * +Z forward, +Y up. (Helmet ~y0.5, halo ~y0.52, wheel z-0.02, nose z1.05.)
 */
const EYE = new Vector3(0, 0.72, -0.22); // driver's-eye mount, local to the car root (sits up & back
                                         //  over the tail so the long nose shows in the lower frame)
const BASE_FOV = 1.22; // wide so plenty of the track/surroundings reads (zoomed out, easy to see)
const BASE_PITCH = 0.06; // a hair nose-down so the track + the car's own nose fill the lower frame

export class CockpitCamera {
  readonly camera: UniversalCamera;
  private eye: TransformNode;
  private prevHeading = 0;
  private lean = 0;   // smoothed roll into the corner
  private look = 0;   // smoothed yaw bias toward the corner
  private shakeX = 0;
  private shakeY = 0;

  constructor(scene: Scene) {
    this.eye = new TransformNode("cockpitEye", scene);
    this.eye.position.copyFrom(EYE);
    this.camera = new UniversalCamera("cockpit", new Vector3(0, 0, 0), scene);
    this.camera.parent = this.eye;
    this.camera.minZ = 0.06;
    this.camera.maxZ = 6000;
    this.camera.fov = BASE_FOV;
    this.camera.rotation.set(BASE_PITCH, 0, 0); // look forward (+Z), a hair down
    this.camera.inputs.clear();
  }

  /** Mount the eye on the player car root so the camera rides with the car. */
  attachTo(carRoot: TransformNode): void {
    this.eye.parent = carRoot;
  }

  /** Per-frame subtle driver motion (lean into corners, light shake, speed-FOV). */
  update(dt: number, vehicle: RaycastVehicle): void {
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
    this.camera.rotation.set(BASE_PITCH + this.shakeY * 0.4, this.look, this.lean);
    this.camera.fov = BASE_FOV + Math.min(0.07, speed * 0.003); // subtle sense of speed (kept mild so it never goes fisheye)
  }
}
