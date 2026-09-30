/**
 * 环境声层(2026-09-30,10-FULL-PLAN 轮 26「音频第二遍」)。
 *
 * 与 BGM 分开的第三条音频通道(第一是 Sfx,第二是 Music):一个**持续噪声源 + 滤波器**,
 * 参数随地形平滑过渡 —— 静音/切换都不该有“啪”声,和轮 26 给 BGM 做的交叉淡入同一条纪律。
 *
 * 为什么不放素材:项目全程零素材零版权(04 §1),环境声用噪声 + 滤波 + LFO 合成,
 * 风 = 带通噪声缓起伏、水 = 低通噪声快起伏、熔岩 = 低通 + 抖动、冰原 = 高通(细碎冰晶感)。
 *
 * 映射规则是纯函数(«ambienceFor»),因为它同时是**玩法反馈**:走到浅滩能听出水声,才说明
 * 地形是真的在起作用(玩家不看小地图也能感知)。
 */

export type AmbienceKind = 'none' | 'wind' | 'water' | 'ember' | 'ice';

/** 环境声层的地板类型 → 声音(纯函数;null = 营地/无地形) */
export function ambienceFor(floorKind: string | null, opts: { night?: boolean } = {}): AmbienceKind {
  if (floorKind === null) return 'none';
  switch (floorKind) {
    case 'water': return 'water';
    case 'ice': return 'ice';
    case 'lava': case 'ember': case 'fire': return 'ember';
    // 苔地/林间/土路/沙地都是“风”,只靠夜晚系数区分强弱(沙地夜里更吵 —— 风声是沙暴)
    case 'moss': case 'path': case 'sand': case 'dirt': case 'grass': return 'wind';
    default: return opts.night ? 'wind' : 'none';
  }
}

/**
 * 环境声的目标音量(纯函数,0~1)。设计口径:**永远小于音乐**(0.5 上限)——
 * 环境声是“底噪”,盖过 BGM 的玩家会去关音量,那就等于没做。
 * 夜晚整体 +25%(同一地形夜里更明显),但没有一种能超过 0.5。
 */
export function ambienceVol(kind: AmbienceKind, opts: { night?: boolean } = {}): number {
  const base: Record<AmbienceKind, number> = { none: 0, wind: 0.22, water: 0.30, ember: 0.34, ice: 0.26 };
  const v = base[kind] * (opts.night ? 1.25 : 1);
  return Math.min(0.5, Math.max(0, v));
}

/** 每种环境声的合成参数(噪声 → 滤波器 + LFO 起伏) */
interface AmbienceDef {
  filter: BiquadFilterType;
  freq: number;
  q: number;
  /** LFO 频率(Hz):越低越“呼吸”,越高越“翻滚” */
  lfo: number;
  /** LFO 对音量的调制深度(0~1) */
  depth: number;
}

export const AMBIENCE_DEFS: Record<Exclude<AmbienceKind, 'none'>, AmbienceDef> = {
  wind: { filter: 'bandpass', freq: 520, q: 0.7, lfo: 0.09, depth: 0.45 },
  water: { filter: 'lowpass', freq: 900, q: 0.5, lfo: 0.33, depth: 0.35 },
  ember: { filter: 'lowpass', freq: 300, q: 0.9, lfo: 0.55, depth: 0.5 },
  ice: { filter: 'highpass', freq: 3000, q: 0.6, lfo: 0.06, depth: 0.3 },
};

/** 换环境的过渡时长(秒):比 BGM 的 0.9s 更长 —— 环境声是背景,突变反而更显眼 */
const FADE_S = 1.4;

class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private current: AmbienceKind = 'none';
  private targetVol = 0;
  private night = false;

  /** 与 sfx/music 一样在首次手势解锁 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);

      // 2 秒循环的白噪声(可无缝循环:用交叉淡化首尾,避免接缝的“咔”)
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      const fade = ctx.sampleRate * 0.05;
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        data[i] = data[i] * k + data[len - fade + i] * (1 - k);
      }
      this.src = ctx.createBufferSource();
      this.src.buffer = buf;
      this.src.loop = true;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'bandpass';
      this.filter.frequency.value = 520;
      this.filter.Q.value = 0.7;
      // LFO → 滤波器频率(缓慢起伏;“呼吸”感就来自这里)
      this.lfo = ctx.createOscillator();
      this.lfo.type = 'sine';
      this.lfo.frequency.value = 0.09;
      this.lfoGain = ctx.createGain();
      this.lfoGain.gain.value = 140;
      this.lfo.connect(this.lfoGain).connect(this.filter.frequency);
      this.src.connect(this.filter).connect(this.master);
      this.src.start();
      this.lfo.start();
      this.applyTarget(0.5);
    } catch {
      this.ctx = null;
    }
  }

  /** 切环境(相同无操作);参数平滑过渡,不硬切 */
  play(kind: AmbienceKind, night = false): void {
    this.night = night;
    this.targetVol = ambienceVol(kind, { night });
    if (kind === this.current && this.ctx) {
      this.applyTarget(0.6);
      return;
    }
    this.current = kind;
    this.applyTarget(FADE_S);
  }

  private applyTarget(tau: number): void {
    if (!this.ctx || !this.master || !this.filter || !this.lfo || !this.lfoGain) return;
    const now = this.ctx.currentTime;
    const def = this.current === 'none' ? null : AMBIENCE_DEFS[this.current];
    this.master.gain.setTargetAtTime(this.targetVol, now, tau * 0.25);
    if (!def) return;
    this.filter.type = def.filter;
    this.filter.frequency.setTargetAtTime(def.freq, now, tau * 0.3);
    this.filter.Q.setTargetAtTime(def.q, now, tau * 0.3);
    this.lfo.frequency.setTargetAtTime(def.lfo, now, tau * 0.3);
    this.lfoGain.gain.setTargetAtTime(def.freq * def.depth, now, tau * 0.3);
  }

  /** 静音开关(与音乐同一份设置) */
  setEnabled(on: boolean): void {
    this.targetVol = on ? ambienceVol(this.current, { night: this.night }) : 0;
    this.applyTarget(0.4);
  }

  /** 当前环境(测试/UI 用) */
  get kind(): AmbienceKind {
    return this.current;
  }
}

/** 全局单例 */
export const ambience = new AmbienceEngine();
