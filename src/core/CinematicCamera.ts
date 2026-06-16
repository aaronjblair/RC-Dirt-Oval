import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * Attract-mode "broadcast director": a single camera that cuts between four
 * cinematic shots of the AI field — a slow crane orbit, a low trackside rise,
 * a chase behind the hero (Super Jay #32), and a flyby dolly across the pack. Positions
 * are eased each frame so every shot drifts smoothly like real TV coverage.
 */
export class CinematicCamera {
  readonly camera: UniversalCamera;
  private shot = 0;
  private t = 0;
  private readonly dur = 4.8; // seconds per shot
  private readonly shots = 4;
  private orbitA = Math.random() * Math.PI * 2;
  private anchor = new Vector3(0, 4, 0); // fixed start point for static shots
  private look = new Vector3();

  constructor(scene: Scene) {
    this.camera = new UniversalCamera("cine", new Vector3(0, 60, -120), scene);
    this.camera.minZ = 0.2;
    this.camera.maxZ = 6000;
    this.camera.fov = 0.7;
    this.camera.inputs.clear(); // no user control during the reel
  }

  private setupShot(focus: Vector3) {
    if (this.shot === 1) {
      // low trackside: stand just outside the pack, near the ground
      const out = new Vector3(focus.x, 0, focus.z);
      if (out.lengthSquared() < 1) out.set(1, 0, 0.5);
      out.normalize();
      this.anchor.copyFrom(focus).addInPlace(out.scale(16));
      this.anchor.y = 2.4;
    } else if (this.shot === 3) {
      // flyby: start off to one side and dolly across, low and close
      this.anchor.copyFrom(focus).addInPlace(new Vector3(26, 4.5, -16));
    }
  }

  private cut(focus: Vector3) {
    this.shot = (this.shot + 1) % this.shots;
    this.t = 0;
    this.orbitA = Math.atan2(this.camera.position.z, this.camera.position.x);
    this.setupShot(focus);
  }

  /** focus = pack centroid; hero = featured car position; heroHeading = its yaw. */
  update(dt: number, focus: Vector3, hero: Vector3, heroHeading: number) {
    this.t += dt;
    if (this.t > this.dur) this.cut(focus);

    const fwd = new Vector3(Math.sin(heroHeading), 0, Math.cos(heroHeading));
    let tgt: Vector3;
    let lookAt: Vector3;
    switch (this.shot) {
      case 0: // sweeping crane orbit — low and close so the cars read big
        this.orbitA += dt * 0.16;
        tgt = new Vector3(Math.cos(this.orbitA) * 60, 24, Math.sin(this.orbitA) * 60 * 1.2);
        lookAt = focus;
        break;
      case 1: // low trackside, slowly rising
        tgt = this.anchor.add(new Vector3(0, this.t * 0.3, 0));
        lookAt = focus;
        break;
      case 2: // chase low behind the hero
        tgt = hero.subtract(fwd.scale(7)).add(new Vector3(0, 2.4, 0));
        lookAt = hero.add(fwd.scale(14));
        break;
      default: // flyby dolly across the pack, low
        this.anchor.x -= dt * 7;
        tgt = this.anchor.clone();
        lookAt = focus;
        break;
    }

    const kp = 1 - Math.exp(-dt * 2.2);
    this.camera.position = Vector3.Lerp(this.camera.position, tgt, kp);
    this.look = Vector3.Lerp(this.look, lookAt, 1 - Math.exp(-dt * 3));
    this.camera.setTarget(this.look);
  }
}
