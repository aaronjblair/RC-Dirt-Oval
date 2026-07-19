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

  private fund!: OscillatorNode;   // motor fundamental (V8 order-4 firing frequency)
  private harm2!: OscillatorNode;  // 2nd harmonic — raspy body
  private harm3!: OscillatorNode;  // higher harmonic — combustion bite
  private harm5!: OscillatorNode;  // 5th harmonic — thin top-end "scream", only near redline
  private sub!: OscillatorNode;    // an octave down for a little body
  private noise!: AudioBufferSourceNode; // exhaust rasp
  private band!: BiquadFilterNode;       // exhaust-rasp bandpass — center tracks RPM in update()
  private gFund!: GainNode;
  private gHarm2!: GainNode;
  private gHarm3!: GainNode;
  private gHarm5!: GainNode;
  private gSub!: GainNode;
  private gNoise!: GainNode;
  private gCrackle!: GainNode;           // decel overrun crackle-pop burst gain

  // Lightweight per-AI-car voices: one saw osc → gain → stereo panner → master. No filter/noise/sub
  // (the "light" tier), so a full field stays cheap. All sit under `master` so M mutes everything.
  private aiVoices: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; started: boolean }[] = [];

  private started = false;
  private _muted = false;
  private _paused = false;
  private prevGear = 0;      // last gear the player engine was in (for up-shift detection)
  private shiftBlip = 0;     // decaying "clutch-in" envelope fired on each up-shift
  private prevThrottle = 0;  // last frame's throttle (for decel-crackle lift detection)
  private lastCrackleAt = 0; // ctx time of the last crackle burst (rate limiter)

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
    [this.harm5, this.gHarm5] = osc("sawtooth", 0.01, +4); // top-end scream, gated to the last 30% of revs
    [this.sub, this.gSub] = osc("sawtooth", 0.03, 0);

    // exhaust rasp: 2s of looped white noise, band-passed mid for a gritty combustion edge.
    // The band CENTER tracks RPM in update() (~700 Hz idle → ~3.3 kHz redline) so the rasp
    // brightens with revs like a real open-stack exhaust; higher Q = grit, not flat hiss.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.band = ctx.createBiquadFilter();
    this.band.type = "bandpass"; this.band.frequency.value = 1400; this.band.Q.value = 1.4;
    this.gNoise = ctx.createGain();
    this.gNoise.gain.value = 0;
    this.noise.connect(this.band); this.band.connect(this.gNoise); this.gNoise.connect(this.master);

    // Decel overrun CRACKLE: a parallel high-passed tap off the same noise loop. update()
    // fires short gain-envelope grains through it on a sharp throttle lift — the methanol
    // "pop-pop-crackle" of unburned mixture lighting off in a hot exhaust.
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1500; hp.Q.value = 0.7;
    this.gCrackle = ctx.createGain();
    this.gCrackle.gain.value = 0;
    this.noise.connect(hp); hp.connect(this.gCrackle); this.gCrackle.connect(this.master);
  }

  /** Resume the context (call from a user gesture) and start the oscillators once. Idempotent —
   *  safe to call on every gesture. Oscillators start only AFTER the context actually resumes
   *  (starting them while still "suspended" can yield silence on some browsers). */
  resume(): void {
    if (!this.ctx) return;
    const startOscs = () => {
      if (this.started || !this.ctx) return;
      this.started = true;
      const t = this.ctx.currentTime;
      this.fund.start(t); this.harm2.start(t); this.harm3.start(t); this.harm5.start(t); this.sub.start(t); this.noise.start(t);
      for (const v of this.aiVoices) if (!v.started) { v.osc.start(t); v.started = true; }
    };
    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(startOscs).catch(() => { /* autoplay still blocked — a later gesture retries */ });
    } else {
      startOscs();
    }
  }

  /** Turn sound ON: unmute + resume in one call (used by the menu sound toggles). */
  enable(): void { this.setMuted(false); this.resume(); }

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
   * @param states  { speed (u/s), throttle 0..1, pan -1..1 (L..R vs camera), gain 0..1 (distance),
   *                  closing? (u/s, + = approaching the camera — adds a Doppler pitch-bend) }
   * Voices beyond `states.length` are silenced.
   */
  updateVoices(states: { speed: number; throttle: number; pan: number; gain: number; closing?: number }[]): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.aiVoices.length; i++) {
      const v = this.aiVoices[i];
      const s = states[i];
      if (!s) { v.gain.gain.setTargetAtTime(0, t, 0.1); continue; }
      const spd01 = Math.min(1, Math.max(0, s.speed / 26));
      const rpm = Math.min(1, Math.max(spd01, Math.min(1, Math.max(0, s.throttle)) * 0.7));
      // Doppler hint: pitch bends up on approach / down going away (damped, clamped ±4%)
      // so pass-bys read like real pack racing instead of a flat fade.
      const dop = Math.min(0.04, Math.max(-0.04, ((s.closing ?? 0) / 343) * 0.6));
      // pitched down in step with the player voice (~×0.65) so the pack matches its deeper rumble
      v.osc.frequency.setTargetAtTime((100 + rpm * 350) * (1 + dop), t, 0.06);
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

    // --- 3-SPEED GEARBOX (player car only): the engine revs CLIMB within each gear, then DROP on
    //     the up-shift, so the note reads as rev → shift → rev → shift → rev across the speed range
    //     instead of one long sweep. The frequency smoothing turns each drop into a quick blip. ---
    const GEARS = 3;
    const gear = Math.min(GEARS - 1, Math.floor(spd01 * GEARS)); // 0,1,2
    const within = spd01 * GEARS - gear;                          // 0..1 progress through this gear
    let rev = 0.4 + within * 0.6;                                 // revs 0.4 → 1.0 (redline) across the gear
    // TRUE IDLE: below a slow-roll the gearbox floor gives way to a real idle (rev→0 =
    // ~3,000 rpm with the full lope), so a parked car actually loafs instead of holding
    // mid-revs. Gone the moment the car rolls; throttle still blips the revs up.
    rev *= Math.min(1, spd01 / 0.06);
    rev = Math.min(1, Math.max(rev, load * 0.5));                 // throttle blips revs before the car rolls
    if (gear > this.prevGear) this.shiftBlip = 1;                 // fire a clutch-in blip on each up-shift
    this.prevGear = gear;
    this.shiftBlip *= 0.82;                                       // ~120ms decay tail at 60fps
    const shiftDip = 1 - this.shiftBlip * 0.55;                   // briefly back off bite/rasp like a throttle lift

    // --- V8 ORDER-4 PITCH: a cross-plane V8's dominant tone is its firing frequency,
    //     RPM × 8 cyl / 120 = RPM/15 Hz. A methanol sprint motor idles LOPEY and HIGH
    //     (~3,000 rpm — big cam, no idle circuit) and turns ~9,000 at the stones, so the
    //     fundamental sweeps 200 → 600 Hz. Real numbers, not an arbitrary ramp. ---
    // Pitched DOWN from the physically-pure rpm/15 (200–600 Hz) — it read as a whine.
    // A wider divisor sits the voice an octave-ish lower: ~130 → ~390 Hz, deep V8 rumble.
    const rpm = 2600 + rev * 5200;   // 2,600 idle … 7,800 redline
    let f = rpm / 20;                // 130 … 390 Hz fundamental

    // --- IDLE LOPE: big-cam alcohol V8s idle rough — a slow uneven surge, not a hum.
    //     A ~4.5 Hz wobble on pitch + level, fading out by ~50% revs so the top end stays clean.
    const lope = Math.sin(t * Math.PI * 2 * 4.5) + 0.4 * Math.sin(t * Math.PI * 2 * 7.3);
    const lopeDepth = Math.max(0, 1 - rev / 0.5);          // 1 at idle → 0 above half revs
    f *= 1 + lope * 0.022 * lopeDepth;                     // ±2.2% pitch surge at idle
    const lopeGain = 1 + lope * 0.12 * lopeDepth;          // ±12% level wobble at idle

    const k = 0.05; // a touch snappier so the shift drop reads as a quick blip
    this.fund.frequency.setTargetAtTime(f, t, k);
    this.harm2.frequency.setTargetAtTime(f * 2, t, k);   // raspy 2nd harmonic
    this.harm3.frequency.setTargetAtTime(f * 3, t, k);   // combustion bite up top
    this.harm5.frequency.setTargetAtTime(f * 5, t, k);   // thin redline scream
    this.sub.frequency.setTargetAtTime(f * 0.5, t, k);
    // Low-pass opens with REVS and LOAD separately — real exhaust brightens sharply on
    // tip-in, so throttle reads as a distinct bark instead of just following ground speed.
    // Floor stays high so it never goes silent.
    this.filter.frequency.setTargetAtTime(Math.min(5200, 900 + rev * 2800 + load * 1800), t, k);
    // Exhaust-rasp band center climbs with RPM (~500 Hz idle → ~2.4 kHz redline) — kept low so
    // the rasp reads as exhaust burble, not hiss.
    this.band.frequency.setTargetAtTime(500 + rev * 1900, t, 0.08);

    const eng = (0.3 + rev * 0.7) * lopeGain; // idle hum floor so it's never dead silent while racing
    const gk = 0.06;
    const bite = Math.pow(Math.max(load, rev), 1.5); // harmonics pile on under load/revs, not linearly
    // Loudness bumped ~1.7× so the player engine is clearly audible (it read too quiet before).
    // Balance shifted DOWN: sub up, high harmonics cut, scream gated later — less whine, more rumble.
    this.gFund.gain.setTargetAtTime(0.09 * eng, t, gk);
    this.gHarm2.gain.setTargetAtTime(0.048 * eng * shiftDip, t, gk);           // rasp present at idle too
    this.gHarm3.gain.setTargetAtTime(0.026 * bite * shiftDip, t, gk);          // bite mostly under load
    this.gHarm5.gain.setTargetAtTime(0.016 * Math.max(0, (rev - 0.8) / 0.2) * load * shiftDip, t, gk); // scream only near redline
    this.gSub.gain.setTargetAtTime(0.075 * eng, t, gk);
    this.gNoise.gain.setTargetAtTime(0.027 * Math.max(load * 0.5, spd01) * (0.6 + 0.4 * rev) * shiftDip, t, gk);

    // --- DECEL CRACKLE-POP: a sharp throttle lift at speed fires a short burst of
    //     high-passed noise grains — the methanol overrun crackle. Rate-limited so a
    //     wobbling throttle doesn't machine-gun it. ---
    const dThrottle = load - this.prevThrottle;
    this.prevThrottle = load;
    if (dThrottle < -0.35 && spd01 > 0.3 && t - this.lastCrackleAt > 0.15) {
      this.lastCrackleAt = t;
      const g = this.gCrackle.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0, t);
      let at = t + 0.01;
      const pops = 2 + ((t * 1000) | 0) % 4; // 2–5 pops, deterministic-ish spacing
      for (let p = 0; p < pops; p++) {
        const amp = 0.09 + 0.05 * (((t * 7919 + p * 131) | 0) % 10) / 10; // 0.09–0.14
        g.setValueAtTime(amp, at);
        g.setTargetAtTime(0, at + 0.008, 0.012); // ~8ms pop + ~30ms exponential tail
        at += 0.012 + 0.05 * ((((t * 6007 + p * 977) | 0) % 10) / 10); // 12–60ms apart
      }
    }
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
