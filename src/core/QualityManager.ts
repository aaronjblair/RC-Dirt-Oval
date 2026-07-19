import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";

/** One rung of the detail ladder. `scaleMul` multiplies the BASE hardware-scaling
 *  level (so the mobile lighter base is preserved); >1 = render at lower internal
 *  resolution (cheaper). The other knobs map straight onto the post-FX pipeline. */
interface Tier {
  scaleMul: number;     // multiplies engine base hardware-scaling level (>1 = lower res)
  msaa: number;         // pipeline.samples (MSAA)
  ssaoSamples: number;  // ssao.samples
  bloom: boolean;       // pipeline.bloomEnabled
  sharpen: boolean;     // pipeline.sharpenEnabled
}

// Index 0..4: Min → Low → Med → High → Ultra. Top rungs match Environment's
// static `highQuality` initial values (8x MSAA, 16 SSAO samples, bloom+sharpen).
const TIERS: Tier[] = [
  { scaleMul: 1.5,  msaa: 1, ssaoSamples: 4,  bloom: false, sharpen: false }, // 0 Min
  { scaleMul: 1.25, msaa: 1, ssaoSamples: 6,  bloom: true,  sharpen: false }, // 1 Low
  { scaleMul: 1.0,  msaa: 2, ssaoSamples: 8,  bloom: true,  sharpen: false }, // 2 Med
  { scaleMul: 1.0,  msaa: 4, ssaoSamples: 12, bloom: true,  sharpen: true  }, // 3 High
  { scaleMul: 1.0,  msaa: 8, ssaoSamples: 16, bloom: true,  sharpen: true  }, // 4 Ultra
];

/**
 * Adaptive graphics quality. Samples FPS a few times a second and walks a small
 * tier ladder to hold ~60 FPS: steps DOWN after a short sustained dip, climbs back
 * UP after a longer sustained surplus, with a cooldown so it never oscillates.
 */
export class QualityManager {
  /** Highest tier index. */
  public readonly max = TIERS.length - 1;

  private readonly engine: AbstractEngine;
  private readonly pipeline: DefaultRenderingPipeline;
  private readonly ssao: SSAO2RenderingPipeline | null;
  /** Base hardware-scaling level captured at construction (mobile starts lighter). */
  private readonly baseScale: number;

  private _tier = 0;
  private _locked = false; // manual tier pick from the pause menu — the FPS controller stands down
  private onTier: ((tier: number) => void) | null = null; // fires after every applied tier change
  // Controller timers (seconds).
  private accum = 0;     // time since the last FPS sample
  private lowFor = 0;    // sustained time the FPS has been below the floor
  private highFor = 0;   // sustained time the FPS has been above the ceiling
  private cooldown = 0;  // lockout after a tier change so it can't oscillate

  constructor(
    engine: AbstractEngine,
    pipeline: DefaultRenderingPipeline,
    ssao: SSAO2RenderingPipeline | null,
    startTier: number,
  ) {
    this.engine = engine;
    this.pipeline = pipeline;
    this.ssao = ssao;
    this.baseScale = engine.getHardwareScalingLevel();
    this.apply(startTier);
  }

  /** Current tier index (0..max). */
  get tier(): number {
    return this._tier;
  }

  /** Apply a tier: hardware scaling + post-FX knobs. Clamps to the valid range. */
  private apply(tier: number): void {
    const tierIndex = Math.max(0, Math.min(this.max, tier));
    const t = TIERS[tierIndex];
    this.engine.setHardwareScalingLevel(this.baseScale * t.scaleMul);
    this.pipeline.samples = t.msaa;
    if (this.ssao) this.ssao.samples = t.ssaoSamples;
    this.pipeline.bloomEnabled = t.bloom;
    this.pipeline.sharpenEnabled = t.sharpen;
    this._tier = tierIndex;
    this.onTier?.(tierIndex);
  }

  /** Force a tier (test/override hook); resets the controller timers. */
  setTier(n: number): void {
    this.apply(n);
    this.accum = 0;
    this.lowFor = 0;
    this.highFor = 0;
    this.cooldown = 0;
  }

  /** Manual quality pick (pause menu): pin this tier — the FPS controller stops adjusting. */
  lockTier(n: number): void {
    this.setTier(n);
    this._locked = true;
  }

  /** Return to automatic FPS-driven tiering. */
  unlock(): void {
    this._locked = false;
    this.setTier(this._tier); // re-arm the controller timers from the current rung
  }

  /** True while a manual (pause-menu) tier pick is pinned. */
  get locked(): boolean {
    return this._locked;
  }

  /** Register a hook fired after every applied tier change (e.g. gate Ultra-only effects
   *  like motion blur). Fired immediately with the current tier on registration. */
  setTierCallback(cb: (tier: number) => void): void {
    this.onTier = cb;
    cb(this._tier);
  }

  /**
   * Tick the controller. Call EVERY frame with the frame delta in ms. Pass
   * `fpsOverride` to drive it deterministically in tests; otherwise it reads
   * `engine.getFps()`. Evaluates at most every 0.5s.
   */
  update(dtMs: number, fpsOverride?: number): void {
    if (this._locked) return; // manual pause-menu pick pinned — controller stands down
    let dt = dtMs / 1000;
    if (dt <= 0) return;
    if (dt > 0.1) dt = 0.1; // clamp big stalls so one hitch can't skew the timers

    if (this.cooldown > 0) this.cooldown -= dt;

    this.accum += dt;
    if (this.accum < 0.5) return; // only evaluate a couple of times a second
    this.accum = 0;

    const fps = fpsOverride ?? this.engine.getFps();
    if (fps < 50) {
      this.lowFor += 0.5;
      this.highFor = 0;
    } else if (fps > 58) {
      this.highFor += 0.5;
      this.lowFor = 0;
    } else {
      this.lowFor = 0;
      this.highFor = 0;
    }

    if (this.cooldown > 0) return;

    if (this.lowFor >= 1.0 && this._tier > 0) {
      // Sustained dip — drop a rung to recover headroom.
      this.apply(this._tier - 1);
      this.cooldown = 2;
      this.lowFor = 0;
      this.highFor = 0;
    } else if (this.highFor >= 3.0 && this._tier < this.max) {
      // Sustained surplus — climb a rung for more detail.
      this.apply(this._tier + 1);
      this.cooldown = 2;
      this.lowFor = 0;
      this.highFor = 0;
    }
  }
}
