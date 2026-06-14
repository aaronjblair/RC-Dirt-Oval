import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";

/**
 * Trackside "driver-stand" camera: a fixed elevated vantage that pans along the
 * straight to keep the car framed and zooms in as the car gets far away — the
 * way you watch a real RC car from the drivers' stand.
 */
export class DriverStandCamera {
  readonly camera: UniversalCamera;
  private stand: Vector3;
  private target = new Vector3();
  private zFollow = 0;

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
    this.camera.position.copyFrom(stand);
  }

  update(carPos: Vector3, dt: number) {
    const k = Math.min(1, dt * 4);
    Vector3.LerpToRef(this.target, carPos, k, this.target);

    // pan along the stand's straight (z) to follow the car, stay fixed in x/y
    this.zFollow += (carPos.z * 0.5 - this.zFollow) * Math.min(1, dt * 2.5);
    this.camera.position.set(this.stand.x, this.stand.y, this.zFollow);
    this.camera.setTarget(this.target);

    // zoom in as the car gets farther (telephoto), like squinting across the track
    const dist = Vector3.Distance(this.camera.position, carPos);
    const targetFov = Math.max(0.28, Math.min(0.8, 22 / dist));
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
  }
}
