// WebAudio で合成する効果音（音声ファイルは使わない）
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastBlip = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  startAmbient() {
    // 水の中にいるような低いざわめき
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    // ポンプの連続音（ジェットの強さで音量が変わる）
    const src2 = this.ctx.createBufferSource();
    src2.buffer = this.noise; src2.loop = true;
    this.pumpFilter = this.ctx.createBiquadFilter();
    this.pumpFilter.type = 'bandpass'; this.pumpFilter.frequency.value = 500; this.pumpFilter.Q.value = 0.8;
    this.pumpGain = this.ctx.createGain(); this.pumpGain.gain.value = 0;
    src2.connect(this.pumpFilter).connect(this.pumpGain).connect(this.master);
    src2.start();
  }

  setFlow(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pumpGain.gain.setTargetAtTime(Math.min(0.5, level * 0.4), t, 0.05);
    this.pumpFilter.frequency.setTargetAtTime(300 + level * 700, t, 0.08);
  }

  press() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    // ポコッという押し込み音
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.2);
    // シュワッ
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(350, t + 0.35);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    n.connect(f).connect(ng).connect(this.master);
    n.start(t, Math.random()); n.stop(t + 0.45);
  }

  bubble() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    if (t - this.lastBlip < 0.03) return;
    this.lastBlip = t;
    const o = c.createOscillator(), g = c.createGain();
    const f0 = 500 + Math.random() * 900;
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.08);
  }

  bell(freq, when = 0, vol = 0.25, dur = 1.2) {
    const c = this.ctx, t = c.currentTime + when;
    for (const [mul, v] of [[1, 1], [2.76, 0.35], [5.4, 0.12], [2, 0.3]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (mul * 0.7));
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  hook(n) {
    if (!this.ok) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
    const f = 660 * Math.pow(2, scale[Math.min(n, scale.length - 1)] / 12);
    this.bell(f, 0, 0.22);
    this.bell(f * 1.5, 0.08, 0.12);
  }

  unhook() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.32);
  }

  fanfare() {
    if (!this.ok) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    const times = [0, 0.12, 0.24, 0.36, 0.52, 0.64, 0.8];
    notes.forEach((f, i) => this.bell(f, times[i], 0.2, i === notes.length - 1 ? 2.2 : 0.9));
  }

  shake() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.7);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    n.connect(f).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.85);
  }
}
