/**
 * 程序化音效合成器(WebAudio,零素材)。
 * Phase 2 过渡方案:全部音效由振荡器+噪声实时合成;Phase 5 可替换为采样。
 * 浏览器自动播放策略:首次用户手势后调用 unlock()。
 */
class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.35;

  /** 运行时调音量(0=静音);直接改 volume 字段不会作用于已创建的 master */
  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, lowpass = 2200): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  /** 统一入口:kind 见调用处;stage 影响音调(连段升调,GDD §3.1) */
  play(kind: string, stage = 1): void {
    switch (kind) {
      case 'hit':
        this.tone(180 + stage * 50, 0.08, 'square', 0.5);
        this.noise(0.05, 0.3, 3000);
        break;
      case 'crit':
        this.tone(660, 0.12, 'square', 0.6, 220);
        this.noise(0.08, 0.4, 4200);
        break;
      case 'kill':
        this.noise(0.22, 0.5, 1600);
        this.tone(140, 0.18, 'sawtooth', 0.4, 50);
        break;
      case 'dash':
        this.tone(300, 0.14, 'sine', 0.35, 700);
        break;
      case 'skill':
        this.tone(392, 0.1, 'triangle', 0.4);
        this.tone(523, 0.14, 'triangle', 0.35);
        break;
      case 'ult':
        this.tone(196, 0.5, 'sawtooth', 0.4, 392);
        this.tone(262, 0.5, 'triangle', 0.3, 523);
        this.noise(0.3, 0.25, 900);
        break;
      case 'reaction':
        this.tone(520, 0.2, 'square', 0.45, 130);
        this.noise(0.15, 0.4, 2600);
        break;
      case 'hurt':
        this.tone(120, 0.2, 'sawtooth', 0.5, 60);
        break;
      case 'beam':
        this.tone(880, 0.08, 'square', 0.2, 440);
        break;
      default:
        break;
    }
  }
}

/** 全局单例(引擎层不依赖游戏层,由游戏层事件驱动调用) */
export const sfx = new SfxEngine();
