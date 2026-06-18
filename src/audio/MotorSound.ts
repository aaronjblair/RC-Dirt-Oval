/**
 * MotorSound — a procedural HIGH-REVVING COMBUSTION sprint-car motor for the player's car.
 *
 * A winged dirt sprinter screams — a raspy, high-RPM engine note that climbs with throttle/speed.
 * We emulate that entirely with the Web Audio API (no audio file to ship): a sawtooth motor
 * fundamental + a couple of upper harmonics for rasp + a sub for body, plus an exhaust-rasp noise
 * component, all run through a low-pass that opens with throttle. Everything sits under a low
 * master-gain cap so it stays present but not overpowering.
 *
 * Browser autoplay policy: the AudioContext starts suspended; call resume() from a user gesture.
 */

type Ctx = AudioContext;

const MUTE_KEY = "rcdirtoval.muted";
const MUTE_KEY_OLD = "rcsprint.muted";

export class MotorSound {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private filter!: BiquadFilterNode;

  private fund!: OscillatorNode;   // motor fundamental (RPM)
  private harm2!: OscillatorNode;  // 2nd harmonic — raspy body
  private harm3!: OscillatorNode;  // higher harmonic — combustion bite/scream
  private sub!: OscillatorNode;    // an octave down for a little body
  private noise!: AudioBufferSourceNode; // exhaust rasp
  private gFund!: GainNode;
  private gHarm2!: GainNode;
  private gHarm3!: GainNode;
  private gSub!: GainNode;
  private gNoise!: GainNode;

  // Lightweight per-AI-car voices: one saw osc → gain → stereo panner → master. No filter/noise/sub
  // (the "light" tier), so a full field stays cheap. All sit under `master` so M mutes everything.
  private aiVoices: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; started: boolean }[] = [];

  private started = false;
  private _muted = false;
  private _paused = false;

  constructor() {
    this._muted = (() => {
      try {
        let v = localStorage.getItem(MUTE_KEY);
        if (v == null) {
          // One-time prefix migration: carry over the old rcsprint.* mute setting.
          const old = localStorage.getItem(MUTE_KEY_OLD);
          if (old != null) { v = old; try { localStorage.setItem(MUTE_KEY, old); } catch { /* ignore */ } }
        }
        return v === "1";
      } catch { return false; }
    })();
    try {
      const AC: typeof AudioContext | undefined =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return; // no Web Audio (very old browser / headless) — stay a silent no-op
      this.ctx = new AC();
      this.build();
    } catch {
      this.ctx = null; // never let audio init break the game
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    // master gain — the single subtlety cap and the mute switch
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 1;
    this.master.connect(ctx.destination);

    // a low-pass that opens up with throttle (muffled off-throttle, bright/raspy on the gas).
    // Keep the floor high enough that the note is actually audible (a too-low cutoff once
    // silenced the whole engine — "re-open the filter").
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 800;
    this.filter.Q.value = 1.1; // a touch of resonance for combustion bite
    this.filter.connect(this.master);

    const osc = (type: OscillatorType, peak: number, detune = 0): [OscillatorNode, GainNode] => {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g); g.connect(this.filter);
      void peak; // peak applied in update()
      return [o, g];
    };
    // slight per-engine detune so it never sounds digitally pure
    [this.fund, this.gFund] = osc("sawtooth", 0.05, +6);
    [this.harm2, this.gHarm2] = osc("sawtooth", 0.03, -5); // raspy 2nd harmonic
    [this.harm3, this.gHarm3] = osc("square", 0.018, +9);  // combustion bite up top
    [this.sub, this.gSub] = osc("sawtooth", 0.03, 0);

    // exhaust rasp: 2s of looped white noise, band-passed mid for a gritty combustion edge
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass"; band.frequency.value = 1800; band.Q.value = 0.6;
    this.gNoise = ctx.createGain();
    this.gNoise.gain.value = 0;
    this.noise.connect(band); band.connect(this.gNoise); this.gNoise.connect(this.master);
  }

  /** Resume the context (call from a user gesture) and start the oscillators once. */
  resume(): void {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.fund.start(t); this.harm2.start(t); this.harm3.start(t); this.sub.start(t); this.noise.start(t);
    for (const v of this.aiVoices) if (!v.started) { v.osc.start(t); v.started = true; }
  }

  /** Ensure `n` lightweight AI motor voices exist (lazy, idempotent — only grows). */
  setVoiceCount(n: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    while (this.aiVoices.length < n) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 180;
      osc.detune.value = (this.aiVoices.length % 5 - 2) * 9; // slight per-car detune, no Math.random
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      osc.connect(gain); gain.connect(pan); pan.connect(this.master);
      const v = { osc, gain, pan, started: false };
      if (this.started) { osc.start(ctx.currentTime); v.started = true; }
      this.aiVoices.push(v);
    }
  }

  /**
   * Per-frame update for the AI field. Each state drives one voice:
   * @param states  { speed (u/s), throttle 0..1, pan -1..1 (L..R vs camera), gain 0..1 (distance) }
   * Voices beyond `states.length` are silenced.
   */
  updateVoices(states: { speed: number; throttle: number; pan: number; gain: number }[]): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.aiVoices.length; i++) {
      const v = this.aiVoices[i];
      const s = states[i];
      if (!s) { v.gain.gain.setTargetAtTime(0, t, 0.1); continue; }
      const spd01 = Math.min(1, Math.max(0, s.speed / 26));
      const rpm = Math.min(1, Math.max(spd01, Math.min(1, Math.max(0, s.throttle)) * 0.7));
      // higher combustion-RPM range than the old electric whine
      v.osc.frequency.setTargetAtTime(150 + rpm * 540, t, 0.06);
      // master cap is low; per-voice gain stays small so a 12-car field is a subtle pack, not a swarm
      const g = (0.012 + rpm * 0.02) * Math.min(1, Math.max(0, s.gain));
      v.gain.gain.setTargetAtTime(g, t, 0.08);
      v.pan.pan.setTargetAtTime(Math.min(1, Math.max(-1, s.pan)), t, 0.08);
    }
  }

  /**
   * Per-frame modulation from the PLAYER car only.
   * @param throttle 0..1 input throttle
   * @param speed    vehicle speed in world units/sec (~0..28)
   */
  update(throttle: number, speed: number): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    const spd01 = Math.min(1, Math.max(0, speed / 26));
    const load = Math.min(1, Math.max(0, throttle));
    // motor RPM is mostly speed, nudged up by throttle so it responds before the car moves
    const rpm = Math.min(1, Math.max(spd01, load * 0.7));

    const f = 140 + rpm * 560; // ~140 (idle) .. 700 Hz fundamental — high-revving combustion
    const k = 0.06;            // smoothing time-constant — kills zipper noise
    this.fund.frequency.setTargetAtTime(f, t, k);
    this.harm2.frequency.setTargetAtTime(f * 2, t, k);   // raspy 2nd harmonic
    this.harm3.frequency.setTargetAtTime(f * 3, t, k);   // combustion bite up top
    this.sub.frequency.setTargetAtTime(f * 0.5, t, k);
    // open the low-pass with throttle — keep the floor high so it never goes silent
    this.filter.frequency.setTargetAtTime(900 + rpm * 5200, t, k);

    const eng = 0.25 + rpm * 0.75; // idle hum floor so it's never dead silent while racing
    const gk = 0.08;
    this.gFund.gain.setTargetAtTime(0.05 * eng, t, gk);
    this.gHarm2.gain.setTargetAtTime(0.03 * eng, t, gk);                    // rasp present at idle too
    this.gHarm3.gain.setTargetAtTime(0.02 * Math.max(load, spd01), t, gk);  // bite mostly under load
    this.gSub.gain.setTargetAtTime(0.028 * eng, t, gk);
    this.gNoise.gain.setTargetAtTime(0.016 * Math.max(load * 0.5, spd01), t, gk); // exhaust rasp
  }

  setMuted(m: boolean): void {
    this._muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* ignore */ }
    this.applyGain();
  }

  /**
   * Pause the engine sound (e.g. when the game is paused) without touching the mute setting.
   * Ramps the master gain to 0 while paused; restores the normal level on resume — unless the
   * player has muted, in which case it stays silent. Separate from setMuted/_muted/localStorage.
   */
  setPaused(paused: boolean): void {
    this._paused = paused;
    this.applyGain();
  }

  /** Drive the master gain from the current muted + paused state. */
  private applyGain(): void {
    if (!this.ctx) return;
    const target = (this._muted || this._paused) ? 0 : 1;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  toggleMuted(): boolean { this.setMuted(!this._muted); return this._muted; }
  get muted(): boolean { return this._muted; }
}
