/**
 * 程序化 Chiptune BGM 引擎(WebAudio,零素材零版权)。
 * 每首曲 = 64 步循环(4 小节 × 16 分音符):方波主旋律 + 三角波贝斯 + 噪声鼓组 + 琶音层。
 * 前瞻调度(lookahead 0.18s),由游戏主循环每帧 tick() 驱动。
 *
 * 轮 26「音频第二遍」做了三件事:
 * 1. **8 首曲目**:营地 / 三章 / **三首 Boss 主题(各章一首)** 与无尽;
 * 2. **真正的交叉淡入淡出**:此前 «play()» 是硬切(注释写着 crossfade,实现只有换指针)——
 *    旧曲的音符立刻消失、新曲直接起,听感是“卡一下”。现在每条轨道有独立 GainNode,
 *    换曲时旧轨淡出、新轨淡入,**两边重叠**所以总响度不跳变;
 * 3. **环境声**:交给 «Ambience.ts»(风/水/熔岩),与音乐各自独立增益。
 *
 * 混音规则(crossfade 曲线、场景 → 曲目)提成纯函数导出 —— 它们是**听感规格**,不该只活在 WebAudio 调用里。
 */

export type TrackId = 'camp' | 'ch1' | 'ch2' | 'ch3' | 'boss1' | 'boss2' | 'boss3' | 'endless';

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
  // 一章 Boss(苔冠巨鹿/南弥尔):D 小调,沉重坚定 —— 低音区移动、鼓密但不快
  boss1: {
    bpm: 140,
    leadType: 'square',
    leadVol: 0.10,
    bass: [
      38, 38, 50, 38, 38, 50, 38, 50, 38, 38, 50, 38, 36, 36, 48, 36,
      34, 34, 46, 34, 34, 46, 34, 46, 36, 36, 48, 36, 38, 38, 50, 38,
      38, 38, 50, 38, 38, 50, 38, 50, 41, 41, 53, 41, 40, 40, 52, 40,
      38, 38, 50, 38, 36, 36, 48, 36, 34, 34, 46, 34, 33, 33, 45, 33,
    ],
    lead: [
      74, N, N, N, 72, N, 71, N, 69, N, N, N, 71, N, 72, N,
      N, N, 74, N, 76, N, 74, N, 72, N, 71, N, N, N, N, N,
      71, N, N, N, 69, N, 67, N, 69, N, N, N, 71, N, 72, N,
      N, N, 74, N, 72, N, 71, N, 69, N, N, N, N, N, N, N,
    ],
    drums: ('k.h.s.h.k.h.s.h.'.repeat(4)),
  },
  // 二章 Boss(薇尔莎):A 小调,冰面滑行感 —— 高音琶音 + 稀疏鼓,像暴风雪里的脚步
  boss2: {
    bpm: 126,
    leadType: 'triangle',
    leadVol: 0.14,
    bass: [
      33, 33, 45, 33, 33, 45, 33, 45, 36, 36, 48, 36, 36, 48, 36, 48,
      31, 31, 43, 31, 31, 43, 31, 43, 33, 33, 45, 33, 35, 35, 47, 35,
      33, 33, 45, 33, 33, 45, 33, 45, 36, 36, 48, 36, 40, 40, 52, 40,
      38, 38, 50, 38, 36, 36, 48, 36, 35, 35, 47, 35, 33, 33, 45, 33,
    ],
    lead: [
      81, N, N, 79, N, 81, N, N, 84, N, N, 81, N, N, 79, N,
      76, N, N, 79, N, 81, N, N, 83, N, N, 81, N, 79, N, N,
      81, N, N, 84, N, 83, N, N, 81, N, N, 79, N, 76, N, N,
      74, N, N, 76, N, 79, N, N, 81, N, N, N, N, N, N, N,
    ],
    arp: [
      69, 72, 76, 81, 76, 72, 69, 72, 71, 74, 79, 83, 79, 74, 71, 74,
      69, 72, 76, 81, 76, 72, 69, 72, 68, 71, 76, 80, 76, 71, 68, 71,
      69, 72, 76, 81, 76, 72, 69, 72, 71, 74, 79, 83, 79, 74, 71, 74,
      67, 71, 74, 79, 74, 71, 67, 71, 69, 72, 76, 81, 76, 72, 69, 72,
    ],
    drums: ('k..h..s..h..h...'.repeat(4)),
  },
  // 三章 Boss(卡兹拉):E 弗里吉亚(小调 + 降二级),沙暴 —— 半音冲撞、鼓最凶
  boss3: {
    bpm: 158,
    leadType: 'sawtooth',
    leadVol: 0.09,
    bass: [
      40, 40, 52, 40, 41, 41, 53, 41, 40, 40, 52, 40, 38, 38, 50, 38,
      40, 40, 52, 40, 41, 41, 53, 41, 45, 45, 57, 45, 44, 44, 56, 44,
      40, 40, 52, 40, 41, 41, 53, 41, 40, 40, 52, 40, 35, 35, 47, 35,
      40, 40, 52, 40, 39, 39, 51, 39, 41, 41, 53, 41, 40, 40, 52, 40,
    ],
    lead: [
      76, N, 77, N, 76, N, 71, N, 76, N, 77, N, 79, N, 77, N,
      76, N, 77, N, 81, N, 79, N, 77, N, 76, N, 71, N, N, N,
      76, N, 77, N, 76, N, 71, N, 79, N, 81, N, 83, N, 81, N,
      79, N, 77, N, 76, N, 74, N, 71, N, N, N, N, N, N, N,
    ],
    drums: ('khkshkhhkhkshkhh'.repeat(4)),
  },
  // 无尽:循环无终点 —— 4 小节动机首尾相接,和声只在一个循环内来回挪,不给“终止感”
  endless: {
    bpm: 132,
    leadType: 'square',
    leadVol: 0.11,
    bass: [
      33, 33, 45, 33, 33, 45, 33, 45, 36, 36, 48, 36, 36, 48, 36, 48,
      38, 38, 50, 38, 38, 50, 38, 50, 36, 36, 48, 36, 33, 33, 45, 33,
      33, 33, 45, 33, 33, 45, 33, 45, 40, 40, 52, 40, 40, 52, 40, 52,
      38, 38, 50, 38, 36, 36, 48, 36, 35, 35, 47, 35, 33, 33, 45, 33,
    ],
    lead: [
      69, N, 72, N, 76, N, 72, N, 69, N, 72, N, 74, N, 72, N,
      69, N, 72, N, 76, N, 79, N, 76, N, 74, N, 72, N, N, N,
      69, N, 72, N, 76, N, 72, N, 77, N, 76, N, 74, N, 72, N,
      74, N, 76, N, 77, N, 76, N, 74, N, 72, N, 69, N, N, N,
    ],
    arp: [
      57, 60, 64, 69, 64, 60, 57, 60, 60, 64, 67, 72, 67, 64, 60, 64,
      62, 65, 69, 74, 69, 65, 62, 65, 60, 64, 67, 72, 67, 64, 60, 64,
      57, 60, 64, 69, 64, 60, 57, 60, 64, 67, 71, 76, 71, 67, 64, 67,
      62, 65, 69, 74, 69, 65, 62, 65, 60, 64, 67, 72, 67, 64, 60, 64,
    ],
    drums: ('k.h.khs.k.h.khs.'.repeat(4)),
  },
};

/**
 * 场景 → 曲目(纯函数;**这就是“8 首曲目切换无断层”的规格**):
 * - 营地/菜单 → camp;
 * - 远征中:Boss 房用**本章**的 Boss 主题(三章三首,不是共用一首),其余房间用本章曲;
 * - 无尽模式:三章循环着跑,但主题固定用 endless —— 玩家要能听出“这一局没有终点”;
 * - 挑战局同上(音轨不区分难度,难度已经在乘区里)。
 */
export function trackFor(state: {
  scene: 'camp' | 'run';
  chapter?: number;
  boss?: boolean;
  endless?: boolean;
}): TrackId {
  if (state.scene !== 'run') return 'camp';
  if (state.endless) return 'endless';
  const raw = Number.isFinite(state.chapter) ? Math.floor(state.chapter as number) : 1;
  const ch = Math.min(3, Math.max(1, raw));
  if (state.boss) return (`boss${ch}`) as TrackId;
  return (`ch${ch}`) as TrackId;
}

/**
 * 交叉淡入淡出的增益曲线(纯函数,验收门的可测部分):
 * 返回 [旧轨增益, 新轨增益]。«t» 是切换后经过的时间(秒),«fadeS» 是重叠时长。
 * 两条曲线都单调、且**和为 1** —— 所以总响度全程恒定,既不会“切歌时音量掉一截”,也不会叠成两倍响。
 */
export function crossfadeGains(t: number, fadeS: number): [number, number] {
  // 注意 Math.max(1e-4, NaN) === NaN —— 坏输入必须显式挡在前面,否则 NaN 会一路乘进增益(静音或爆音)
  const d = Number.isFinite(fadeS) && fadeS > 1e-4 ? fadeS : 1e-4;
  const tt = Number.isFinite(t) ? t : d;
  const x = Math.min(1, Math.max(0, tt / d));
  // 平方包络(smoothstep 的听感近似):两端平缓、中间快,切歌点听不出接缝
  const inGain = x * x * (3 - 2 * x);
  return [1 - inGain, inGain];
}

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

interface Voice {
  id: TrackId;
  gain: GainNode | null;
  /** 淡出中的轨道:不再派新音符,等增益归零后移除 */
  dying: boolean;
  bornAt: number;
  step: number;
  nextT: number;
}

/**
 * 交叉淡入淡出的重叠时长(秒)。0.9s 的取舍:太短(≤0.3s)听得见接缝,太长(≥2s)两首曲会真的叠在一起
 * 变成“和声打架”。四拍 @88BPM 约 2.7s,所以 0.9s 落在“一个乐句内”—— 耳朵把它听成“上一句收尾”。
 */
const FADE_S = 0.9;

class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private voices: Voice[] = [];
  /** 未解锁(没有 AudioContext)时也记住想放哪首,unlock 之后第一帧就能起 */
  private pending: TrackId | null = null;
  /** 0~1 音乐总音量(M 静音置 0) */
  volume = 0.8;
  /** 当前正在淡入的曲目(UI/测试用;淡出中的旧曲不算) */
  get current(): TrackId | null {
    const v = this.voices.find((x) => !x.dying);
    return v ? v.id : this.pending;
  }

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
      if (this.pending !== null) {
        const want = this.pending;
        this.pending = null;
        this.play(want);
      }
    } catch {
      this.ctx = null;
    }
  }

  /** 切曲(相同曲目无操作;null = 全部淡出停下)。换曲是**重叠**的,不是硬切。 */
  play(track: TrackId | null): void {
    if (this.ctx === null || this.master === null) {
      this.pending = track;
      return;
    }
    const live = this.voices.filter((v) => !v.dying);
    if (track !== null && live.length === 1 && live[0].id === track) return;

    const now = this.ctx.currentTime;
    // 旧轨转淡出(不再派音符);新轨从 0 起,由 tick 里的增益曲线推上去
    for (const v of this.voices) {
      if (!v.dying) v.dying = true;
    }
    if (track === null) return;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    this.voices.push({ id: track, gain, dying: false, bornAt: now, step: 0, nextT: now + 0.08 });
  }

  /** 硬停(存档切换/结算回菜单用):不等淡出,立刻清空 —— 与 play(null) 的区别是它不重叠 */
  stopAll(): void {
    if (!this.ctx) {
      this.pending = null;
      return;
    }
    for (const v of this.voices) {
      if (v.gain) v.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    }
    this.voices = [];
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** 每帧调用:推进淡入淡出 + 前瞻调度 */
  tick(): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;

    // 增益曲线:与 crossfadeGains 同一套(淡入中的轨按经过时间取新轨增益,淡出中的轨取 1-g)
    const live = this.voices.filter((v) => !v.dying);
    for (const v of this.voices) {
      if (!v.gain) continue;
      if (v.dying) {
        const [, g] = crossfadeGains(now - v.bornAt, FADE_S);
        v.gain.gain.setTargetAtTime(1 - g, now, 0.06);
      } else {
        const [, g] = crossfadeGains(now - v.bornAt, FADE_S);
        // 多条淡入轨(连续快速切曲)时按条数均分,避免叠成两倍响
        v.gain.gain.setTargetAtTime(g / Math.max(1, live.length), now, 0.06);
      }
    }
    // 淡出完成 + 超过重叠余量 → 移出(它的音符已经排到 stop 时间,不会再派新的)
    this.voices = this.voices.filter((v) => !(v.dying && now - v.bornAt > FADE_S * 1.2));

    for (const v of this.voices) {
      if (v.dying) continue;
      const def = TRACKS[v.id];
      const stepDur = 60 / def.bpm / 4;
      while (v.nextT < now + 0.18) {
        this.schedule(def, v.step % 64, v.nextT, stepDur, v.gain);
        v.step++;
        v.nextT += stepDur;
      }
    }
  }

  private schedule(def: TrackDef, s: number, t: number, stepDur: number, out: GainNode | null): void {
    const lead = def.lead[s];
    if (lead !== null && lead !== undefined) this.note(midi(lead), t, stepDur * 1.8, def.leadType, def.leadVol, out);
    const bass = def.bass[s];
    if (bass !== null && bass !== undefined) this.note(midi(bass), t, stepDur * 0.95, 'triangle', 0.20, out);
    const arp = def.arp?.[s];
    if (arp !== null && arp !== undefined) this.note(midi(arp), t, stepDur * 1.4, 'sawtooth', 0.045, out);
    const d = def.drums[s] ?? '.';
    if (d === 'k') this.kick(t, out);
    else if (d === 's') this.snare(t, out);
    else if (d === 'h') this.hat(t, out);
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, out: GainNode | null): void {
    if (!this.ctx || !out) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number, out: GainNode | null): void {
    if (!this.ctx || !out) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  private noiseHit(t: number, dur: number, vol: number, filterType: BiquadFilterType, freq: number, out: GainNode | null): void {
    if (!this.ctx || !out || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number, out: GainNode | null): void {
    this.noiseHit(t, 0.12, 0.22, 'bandpass', 1800, out);
  }

  private hat(t: number, out: GainNode | null): void {
    this.noiseHit(t, 0.04, 0.10, 'highpass', 6000, out);
  }
}

/** 全局单例 */
export const music = new MusicEngine();
