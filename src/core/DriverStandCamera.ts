import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";

/**
 * Trackside "driver-stand" camera: an elevated vantage from the stand that
 * **follows your car all the way around** — it aims straight at the car (so it
 * pans right into the corners) and slides along the straight to keep the car
 * close, telephoto-zooming as it runs to the far end. High enough that the
 * infield (and its logo) still reads, but the car is always the subject.
 */
export class DriverStandCamera {
  readonly camera: UniversalCamera;
  private stand: Vector3;
  private target = new Vector3();
  private zFollow = 0;
  private home = new Vector3(34, 28, 0); // elevated eye position (computed from the oval)
  private span = 60; // half the oval's long (z) axis — drives height/zoom

  constructor(scene: Scene, _canvas: HTMLElement, stand = new Vector3(34, 6, 0)) {
    this.stand = stand.clone();
    this.camera = new UniversalCamera("driverStand", stand.clone(), scene);
    this.camera.fov = 0.7;
    this.camera.minZ = 0.2;
    this.camera.maxZ = 6000;
    this.camera.inputs.clear();
  }

  setStand(stand: Vector3) {
    this.stand = stand.clone();
    this.reframe();
  }

  /** Size the elevated vantage to the oval (bigger track → sit higher / further out). */
  frameTrack(def: { cornerRadius: number; straightLength: number; width: number }) {
    this.span = def.straightLength / 2 + def.cornerRadius; // half the long axis
    const outX = def.cornerRadius + def.width / 2; // outer edge on the stand side
    // High enough to look down into the bowl and see the infield, but close enough
    // that the followed car stays large. Scales with the oval.
    this.home.x = Math.max(this.stand.x, outX) + this.span * 0.18 + 7;
    this.home.y = this.span * 0.52 + 13;
    this.reframe();
  }

  private reframe() {
    this.home.x = Math.max(this.home.x, this.stand.x);
    this.camera.position.copyFrom(this.home);
  }

  update(carPos: Vector3, dt: number, zoom = 1.0) {
    // Aim straight at the car so the view pans all the way into the corners.
    Vector3.LerpToRef(this.target, carPos, Math.min(1, dt * 6), this.target);

    // Slide the elevated eye along the straight toward the car's end of the track,
    // so the car stays close and clearly visible even deep in a corner.
    const zWant = carPos.z * 0.6;
    this.zFollow += (zWant - this.zFollow) * Math.min(1, dt * 3);
    this.camera.position.set(this.home.x, this.home.y, this.zFollow);
    this.camera.setTarget(this.target);

    // Telephoto in as the car runs away so it never shrinks out of view; widen
    // when it's close so you still get the surrounding track and infield logo.
    const dist = Vector3.Distance(this.camera.position, carPos);
    // Divide by zoom so a zoom > 1 narrows the FOV (telephotos in); zoom = 1 is unchanged.
    const targetFov = Math.max(0.42, Math.min(0.9, this.span / dist)) / zoom;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
  }
}
