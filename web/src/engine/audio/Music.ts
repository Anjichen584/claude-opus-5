/**
 * 程序化 Chiptune BGM 引擎(WebAudio,零素材零版权)。
 * 每首曲 = 64 步循环(4 小节 × 16 分音符):方波主旋律 + 三角波贝斯 + 噪声鼓组 + 琶音层。
 * 前瞻调度(lookahead 0.18s),由游戏主循环每帧 tick() 驱动;crossfade 换曲。
 */

export type TrackId = 'camp' | 'ch1' | 'ch2' | 'ch3' | 'boss';

interface TrackDef {
  bpm: number;
  /** 主旋律(midi 音号,null=休止) */
  lead: Array<number | null>;
  /** 贝斯 */
  bass: Array<number | null>;
  /** 琶音/铺底(可选) */
  arp?: Array<number | null>;
  /** 鼓:k=底鼓 s=军鼓 h=踩镲 */
  drums: string;
  leadType: OscillatorType;
  leadVol: number;
}

const N = null;

/** 工具:根音序列 → 64 步贝斯(8 分音符 根/五度交替) */
function bassLine(roots: number[], fifthEvery = true): Array<number | null> {
  const out: Array<number | null> = [];
  for (const r of roots) {
    for (let i = 0; i < 16; i++) {
      if (i % 2 === 1) out.push(N);
      else out.push(i % 4 === 2 && fifthEvery ? r + 7 : r);
    }
  }
  return out;
}

export const TRACKS: Record<TrackId, TrackDef> = {
  // 营地:C 大调五声,温暖慢板
  camp: {
    bpm: 88,
    leadType: 'triangle',
    leadVol: 0.16,
    bass: bassLine([36, 33, 41, 43], false),
    lead: [
      67, N, N, N, 64, N, 67, N, 69, N, N, N, N, N, 64, N,
      62, N, N, N, 60, N, 62, N, 64, N, N, N, N, N, N, N,
      67, N, N, N, 69, N, 72, N, 69, N, N, N, 67, N, 64, N,
      62, N, 64, N, 60, N, N, N, N, N, N, N, N, N, N, N,
    ],
    drums: ('h...'.repeat(16)),
  },
  // 第一章 翠语林地:A 小调,轻快冒险
  ch1: {
    bpm: 132,
    leadType: 'square',
    leadVol: 0.10,
    bass: bassLine([45, 41, 48, 43]),
    lead: [
      69, N, 72, N, 74, N, 72, N, 76, N, N, N, 74, N, 72, N,
      69, N, 72, N, 74, N, 76, N, 72, N, N, N, N, N, N, N,
      77, N, 76, N, 74, N, 72, N, 74, N, 76, N, 74, N, 72, N,
      69, N, 67, N, 69, N, N, N, N, N, N, N, N, N, N, N,
    ],
    arp: [
      57, N, N, N, 60, N, N, N, 57, N, N, N, 60, N, N, N,
      53, N, N, N, 57, N, N, N, 53, N, N, N, 57, N, N, N,
      60, N, N, N, 64, N, N, N, 60, N, N, N, 64, N, N, N,
      55, N, N, N, 59, N, N, N, 55, N, N, N, 59, N, N, N,
    ],
    drums: ('k.h.s.h.k.h.s.h.'.repeat(4)),
  },
  // 第二章 霜语冰原:D 多利亚,空灵铃音
  ch2: {
    bpm: 104,
    leadType: 'triangle',
    leadVol: 0.15,
    bass: bassLine([38, 34, 41, 36], false),
    lead: [
      74, N, N, N, N, N, 77, N, N, N, 81, N, N, N, N, N,
      79, N, N, N, N, N, 74, N, N, N, N, N, N, N, N, N,
      77, N, N, N, N, N, 81, N, N, N, 84, N, N, N, 81, N,
      79, N, N, N, 77, N, N, N, 74, N, N, N, N, N, N, N,
    ],
    arp: [
      62, N, 65, N, 69, N, 65, N, 62, N, 65, N, 69, N, 65, N,
      58, N, 62, N, 65, N, 62, N, 58, N, 62, N, 65, N, 62, N,
      65, N, 69, N, 72, N, 69, N, 65, N, 69, N, 72, N, 69, N,
      60, N, 64, N, 67, N, 64, N, 60, N, 64, N, 67, N, 64, N,
    ],
    drums: ('k.......h.......'.repeat(4)),
  },
  // 第三章 烬语荒漠:E 弗里几亚,推进感
  ch3: {
    bpm: 144,
    leadType: 'square',
    leadVol: 0.09,
    bass: [
      40, 40, N, 40, 40, N, 40, 41, 40, 40, N, 40, 40, N, 43, 41,
      40, 40, N, 40, 40, N, 40, 41, 40, 40, N, 40, 40, N, 38, 36,
      41, 41, N, 41, 41, N, 41, 43, 41, 41, N, 41, 41, N, 45, 43,
      38, 38, N, 38, 38, N, 38, 40, 36, 36, N, 36, 36, N, 40, 41,
    ],
    lead: [
      64, N, N, N, 65, N, 64, N, N, N, 62, N, 64, N, N, N,
      N, N, 67, N, 65, N, 64, N, 65, N, 64, N, 62, N, N, N,
      64, N, N, N, 69, N, 67, N, N, N, 65, N, 67, N, N, N,
      65, N, 64, N, 62, N, 60, N, 62, N, N, N, N, N, N, N,
    ],
    drums: ('k.h.k.h.s.h.k.h.'.repeat(4)),
  },
  // Boss 战:急促小调riff
  boss: {
    bpm: 152,
    leadType: 'square',
    leadVol: 0.10,
    bass: [
      33, 33, 45, 33, 33, 45, 33, 45, 33, 33, 45, 33, 36, 36, 48, 36,
      33, 33, 45, 33, 33, 45, 33, 45, 31, 31, 43, 31, 31, 31, 43, 31,
      33, 33, 45, 33, 33, 45, 33, 45, 36, 36, 48, 36, 38, 38, 50, 38,
      40, 40, 52, 40, 39, 39, 51, 39, 38, 38, 50, 38, 36, 36, 48, 36,
    ],
    lead: [
      69, N, N, 72, N, N, 71, N, 69, N, 67, N, 69, N, N, N,
      69, N, N, 72, N, N, 74, N, 72, N, 71, N, 67, N, N, N,
      69, N, N, 72, N, N, 71, N, 69, N, 72, N, 74, N, 76, N,
      77, N, 76, N, 74, N, 72, N, 71, N, N, N, N, N, N, N,
    ],
    drums: ('kh.hsh.hkh.hshhh'.repeat(4)),
  },
};

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private current: TrackId | null = null;
  private step = 0;
  private nextT = 0;
  /** 0~1 音乐总音量(M 静音置 0) */
  volume = 0.8;

  /** 与 sfx 一样在首次手势解锁 */
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
      // 噪声缓冲(鼓组)
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  /** 切曲(相同曲目无操作);null 停止 */
  play(track: TrackId | null): void {
    if (track === this.current) return;
    this.current = track;
    this.step = 0;
    if (this.ctx) this.nextT = this.ctx.currentTime + 0.08;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** 每帧调用:前瞻调度 */
  tick(): void {
    if (!this.ctx || !this.master || this.current === null) return;
    const def = TRACKS[this.current];
    const stepDur = 60 / def.bpm / 4;
    while (this.nextT < this.ctx.currentTime + 0.18) {
      this.schedule(def, this.step % 64, this.nextT, stepDur);
      this.step++;
      this.nextT += stepDur;
    }
  }

  private schedule(def: TrackDef, s: number, t: number, stepDur: number): void {
    const lead = def.lead[s];
    if (lead !== null && lead !== undefined) this.note(midi(lead), t, stepDur * 1.8, def.leadType, def.leadVol);
    const bass = def.bass[s];
    if (bass !== null && bass !== undefined) this.note(midi(bass), t, stepDur * 0.95, 'triangle', 0.20);
    const arp = def.arp?.[s];
    if (arp !== null && arp !== undefined) this.note(midi(arp), t, stepDur * 1.4, 'sawtooth', 0.045);
    const d = def.drums[s] ?? '.';
    if (d === 'k') this.kick(t);
    else if (d === 's') this.snare(t);
    else if (d === 'h') this.hat(t);
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  private noiseHit(t: number, dur: number, vol: number, filterType: BiquadFilterType, freq: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number): void {
    this.noiseHit(t, 0.12, 0.22, 'bandpass', 1800);
  }

  private hat(t: number): void {
    this.noiseHit(t, 0.04, 0.10, 'highpass', 6000);
  }
}

/** 全局单例 */
export const music = new MusicEngine();
