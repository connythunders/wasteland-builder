// Sound: uses files from assets/audio/ when present (made with the elevenlabs / suno skills),
// otherwise falls back to synthesised sounds so the game always has audio.
// Recognised names: music, engine, shoot, explosion, pickup, hit  (.mp3 / .wav / .ogg)

export class Sfx {
  constructor() { this.ctx = null; this.buf = {}; this.eng = null; this.on = false; }

  async init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
    const n = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    await Promise.all(['music', 'engine', 'shoot', 'explosion', 'pickup', 'hit'].map((k) => this.load(k)));
    this.startEngine();
    if (this.buf.music) this.src(this.buf.music, 0.4, true);
    this.on = true;
  }

  async load(name) {
    for (const ext of ['mp3', 'wav', 'ogg']) {
      try {
        const r = await fetch(`../assets/audio/${name}.${ext}`);
        if (!r.ok || !(r.headers.get('content-type') || '').match(/audio|octet/)) continue;
        this.buf[name] = await this.ctx.decodeAudioData(await r.arrayBuffer());
        return;
      } catch { /* try next */ }
    }
  }

  src(buffer, gain = 1, loop = false, rate = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = buffer; s.loop = loop; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain; s.connect(g).connect(this.master); s.start();
    return { s, g };
  }

  startEngine() {
    const c = this.ctx;
    if (this.buf.engine) { this.eng = { file: this.src(this.buf.engine, 0.35, true) }; return; }
    const g = c.createGain(); g.gain.value = 0.0;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square';
    o1.connect(f); o2.connect(f); f.connect(g).connect(this.master); o1.start(); o2.start();
    this.eng = { o1, o2, g, f };
  }

  engine(speedRatio, throttle) {
    if (!this.eng) return;
    const t = this.ctx.currentTime;
    if (this.eng.file) { this.eng.file.s.playbackRate.setTargetAtTime(0.6 + speedRatio * 1.2, t, 0.1); return; }
    const hz = 38 + speedRatio * 95;
    this.eng.o1.frequency.setTargetAtTime(hz, t, 0.08);
    this.eng.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.08);
    this.eng.f.frequency.setTargetAtTime(300 + throttle * 500 + speedRatio * 500, t, 0.1);
    this.eng.g.gain.setTargetAtTime(0.10 + throttle * 0.07, t, 0.1);
  }

  burst({ dur, freq, q = 0.7, type = 'lowpass', gain = 0.5, sweep = 0 }) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + dur);
  }

  shoot() {
    if (!this.on) return;
    if (this.buf.shoot) return this.src(this.buf.shoot, 0.5, false, 0.95 + Math.random() * 0.1);
    this.burst({ dur: 0.07, freq: 1800, type: 'bandpass', gain: 0.35 });
  }
  explosion() {
    if (!this.on) return;
    if (this.buf.explosion) return this.src(this.buf.explosion, 0.9);
    this.burst({ dur: 1.0, freq: 900, gain: 0.9, sweep: 0.08 });
  }
  hit() {
    if (!this.on) return;
    if (this.buf.hit) return this.src(this.buf.hit, 0.7);
    this.burst({ dur: 0.25, freq: 300, gain: 0.7, sweep: 0.3 });
  }
  pickup() {
    if (!this.on) return;
    if (this.buf.pickup) return this.src(this.buf.pickup, 0.7);
    const c = this.ctx, t = c.currentTime;
    [660, 990].forEach((hz, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
      const g = c.createGain(); g.gain.setValueAtTime(0.25, t + i * 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
      o.connect(g).connect(this.master); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.22);
    });
  }
}
