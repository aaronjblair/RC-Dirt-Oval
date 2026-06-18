/**
 * Arcade (RC Pro-Am style) on-track layer for RCSprint.
 *
 * Scatters interactive HAZARDS around the night banked-dirt oval:
 *  - SLICKS (any car): wet/oily patches that briefly kill grip → the car slides.
 *
 * The vehicle buff API (applyBuff / grantImmunity / buffState) is added to
 * RaycastVehicle in parallel — this file only CALLS it.
 */
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { OvalTrack } from "../track/OvalTrack";
import type { Field } from "../race/Field";

interface Slick {
  center: Vector3;
  radius: number;
}

const SLICK_R = 2.2;

export class ArcadeManager {
  private slicks: Slick[] = [];

  private score = 0;
  private lastField: Field | null = null; // cached each update() so HUD getters can be arg-free

  constructor(
    private scene: Scene,
    private track: OvalTrack,
    private shadow: ShadowGenerator | null,
  ) {
    void this.shadow; // slicks cast no shadows; kept for API parity
    this.build();
  }

  /** Place an item flat on the BANKED surface at arc-length `s`, signed lateral (+ outward). */
  private surfacePose(s: number, lateral: number, yOff: number): { pos: Vector3; yaw: number } {
    const sm = this.track.sampleAt(s);
    const W = this.track.def.width;
    const lift = W * Math.tan(sm.bank);
    const pos = sm.pos.add(sm.outward.scale(lateral));
    pos.y = lift * (0.5 + lateral / W) + yOff;
    const yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
    return { pos, yaw };
  }

  private build(): void {
    const len = this.track.length;
    const W = this.track.def.width;
    const R = this.track.def.cornerRadius;
    const Lstr = this.track.def.straightLength;
    const turn = Math.PI * R;
    const half = Lstr / 2;

    // --- SLICKS (any car): dark glossy wet/oil patches flat on the line ---
    const slickS = [half * 0.7, half + turn * 0.5, half + turn + Lstr * 0.8];
    for (let i = 0; i < slickS.length; i++) {
      const s = ((slickS[i] % len) + len) % len;
      const lateral = -W * 0.08;
      const yOff = 0.04;
      const { pos } = this.surfacePose(s, lateral, yOff);

      const disc = MeshBuilder.CreateDisc("slick" + i, { radius: SLICK_R * 0.85, tessellation: 24 }, this.scene);
      disc.parent = null;
      disc.position.copyFrom(pos);
      disc.rotation.x = Math.PI / 2; // lay flat
      const sm = new StandardMaterial("slickMat" + i, this.scene);
      sm.diffuseColor = new Color3(0.02, 0.02, 0.04);
      sm.specularColor = new Color3(0.5, 0.55, 0.7); // wet sheen
      sm.specularPower = 64;
      sm.emissiveColor = new Color3(0.02, 0.03, 0.05);
      sm.alpha = 0.85;
      disc.material = sm;
      disc.isPickable = false;
      disc.receiveShadows = true;
      disc.freezeWorldMatrix();

      this.slicks.push({ center: pos.clone(), radius: SLICK_R });
    }
  }

  // --- per-frame ---
  update(_dt: number, field: Field): void {
    this.lastField = field;

    // All-car proximity: SLICKS (direct XZ distance — no track.project).
    const cars = field.cars;
    for (let i = 0; i < cars.length; i++) {
      const v = cars[i].vehicle;
      const vp = v.position;
      for (const sl of this.slicks) {
        const dx = sl.center.x - vp.x;
        const dz = sl.center.z - vp.z;
        if (dx * dx + dz * dz <= sl.radius * sl.radius) {
          v.applyBuff("grip", 0.55, 0.3); // refreshes while on it → slides
        }
      }
    }
  }

  // --- HUD getters ---
  getScore(): number {
    return this.score;
  }

  getLetters(): string {
    return "";
  }

  isUpgraded(): boolean {
    return false;
  }

  playerBuffs(): { grip: number; accel: number; top: number; immunity: number } {
    if (this.lastField) return this.lastField.player.vehicle.buffState();
    return { grip: 1, accel: 1, top: 1, immunity: 0 };
  }

  // --- new race ---
  reset(): void {
    // Slicks are static hazards — nothing to re-show.
    this.score = 0;
  }
}
