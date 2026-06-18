import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";

/**
 * RC Pro-Am style camera: a high overhead view that keeps the PLAYER CAR fixed in the centre of
 * the screen while the track scrolls and rotates around it — exactly like the 1988 NES R.C. Pro-Am.
 *
 * The key trait: the camera does NOT yaw with the car's heading. It rides directly above the car
 * (with a small back-offset for a slight isometric tilt) at a FIXED look direction, so world-north
 * stays a constant screen direction. The car rotates to its heading WITHIN the centred frame and
 * the world appears to scroll/rotate beneath it. Because the position and the look-target shift by
 * the same per-frame car delta, the view angle stays constant (no rotation follow).
 */
const HEIGHT = 22;  // units above the car — high enough to read the oval, low enough to stay lit at night
const BACK = 9;     // pull the eye toward -z (south) so we look over the car at a steep iso angle (~65° down)

export class RCProAmCamera {
  readonly camera: UniversalCamera;

  constructor(scene: Scene) {
    this.camera = new UniversalCamera("rcproam", new Vector3(0, HEIGHT, -BACK), scene);
    this.camera.fov = 0.8;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 6000;
    this.camera.inputs.clear();
    this.camera.setTarget(new Vector3(0, 0, 0));
  }

  /** Keep the car centred: sit at a fixed offset above/behind the car and look straight at it.
   *  The constant offset means the look direction never changes — world-up stays screen-up. */
  update(carPos: Vector3): void {
    this.camera.position.set(carPos.x, carPos.y + HEIGHT, carPos.z - BACK);
    this.camera.setTarget(carPos);
  }
}
