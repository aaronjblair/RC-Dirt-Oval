/**
 * Lightweight synthesized audio (no asset files): a high-revving methanol-sprint
 * motor whose pitch tracks a modeled RPM (revs up on throttle, not just speed,
 * so blipping the gas snarls), a top-end bite that only comes in under load, and
 * a tire-scrub noise when the car slides. Must be created after a user gesture
 * (the Start button) so the AudioContext can run.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private oscA!: OscillatorNode;
  private oscB!: OscillatorNode;
  private oscC!: OscillatorNode; // octave-up bite
  private motorGain!: GainNode;
  private biteGain!: GainNode;
  private filter!: BiquadFilterNode;
  private scrub!: GainNode;
  private rpm = 0; // 0..1 modeled engine speed

  start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(c.destination);

    // motor body: two detuned saws through a lowpass
    this.filter = c.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 700;
    this.motorGain = c.createGain();
    this.motorGain.gain.value = 0.0;
    this.filter.connect(this.motorGain);
    this.motorGain.connect(this.master);

    this.oscA = c.createOscillator(); this.oscA.type = "sawtooth"; this.oscA.frequency.value = 120;
    this.oscB = c.createOscillator(); this.oscB.type = "sawtooth"; this.oscB.frequency.value = 121.5;
    this.oscA.connect(this.filter); this.oscB.connect(this.filter);
    this.oscA.start(); this.oscB.start();

    // top-end bite: an octave-up saw kept bright (bypasses the lowpass), gated by load
    this.biteGain = c.createGain();
    this.biteGain.gain.value = 0.0;
    this.biteGain.connect(this.master);
    this.oscC = c.createOscillator(); this.oscC.type = "sawtooth"; this.oscC.frequency.value = 240;
    this.oscC.connect(this.biteGain);
    this.oscC.start();

    // tire scrub: filtered white noise
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const nf = c.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1600; nf.Q.value = 0.7;
    this.scrub = c.createGain(); this.scrub.gain.value = 0;
    noise.connect(nf); nf.connect(this.scrub); this.scrub.connect(this.master);
    noise.start();
  }

  /** speed in u/s, throttle 0..1, slip lateral magnitude. */
  update(speed: number, throttle: number, slip: number) {
    if (!this.ctx) return;
    // modeled RPM: rises with speed and with throttle (wheelspin), attacks fast, falls slower
    const target = Math.min(1, (speed / 26) * 0.8 + throttle * 0.35);
    this.rpm += (target - this.rpm) * (target > this.rpm ? 0.12 : 0.06);
    const r = this.rpm;
    const f = 62 + r * 235; // throaty methanol-sprint sweep (kept well below a whine)
    this.oscA.frequency.value = f;
    this.oscB.frequency.value = f * 1.01 + 1.5;
    this.oscC.frequency.value = f * 2.0;
    this.filter.frequency.value = 380 + r * 1500 + throttle * 600;
    this.motorGain.gain.value = 0.035 + r * 0.07 + throttle * 0.02;
    this.biteGain.gain.value = throttle * r * 0.03; // snarl only under load
    this.scrub.gain.value = Math.min(0.14, Math.max(0, slip - 0.5) * 0.06);
  }
}
