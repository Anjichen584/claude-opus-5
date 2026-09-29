import { describe, expect, it } from 'vitest';
import { TRACKS, crossfadeGains, trackFor } from '../Music';
import { AMBIENCE_DEFS, ambienceFor, ambienceVol } from '../Ambience';

describe('BGM 曲谱数据', () => {
  const ids = Object.keys(TRACKS) as Array<keyof typeof TRACKS>;

  it('八首曲目齐全(轮 26:三首 Boss 主题各一首 + 无尽)', () => {
    expect(ids.sort()).toEqual(['boss1', 'boss2', 'boss3', 'camp', 'ch1', 'ch2', 'ch3', 'endless']);
  });

  it('三首 Boss 主题**互不相同**(共用一首会让三个 Boss 战听起来是同一场)', () => {
    const sig = (id: 'boss1' | 'boss2' | 'boss3'): string =>
      TRACKS[id].lead.map((n) => (n === null ? '.' : n)).join('|') + `@${TRACKS[id].bpm}`;
    const a = sig('boss1'), b = sig('boss2'), c = sig('boss3');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('无尽主题与章节曲、Boss 曲都不同(玩家要能听出"这局没有终点")', () => {
    const end = TRACKS.endless.lead.join(',');
    for (const id of ['ch1', 'ch2', 'ch3', 'boss1', 'boss2', 'boss3', 'camp'] as const) {
      expect(TRACKS[id].lead.join(','), `${id} 与 endless 撞了`).not.toBe(end);
    }
  });

  it('每首 64 步且各声部对齐', () => {
    for (const id of ids) {
      const t = TRACKS[id];
      expect(t.lead.length, `${id}.lead`).toBe(64);
      expect(t.bass.length, `${id}.bass`).toBe(64);
      if (t.arp) expect(t.arp.length, `${id}.arp`).toBe(64);
      expect(t.drums.length, `${id}.drums`).toBeGreaterThanOrEqual(64);
    }
  });

  it('音域合法(midi 20..100)且 BPM 合理', () => {
    for (const id of ids) {
      const t = TRACKS[id];
      expect(t.bpm).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBeLessThanOrEqual(200);
      for (const seq of [t.lead, t.bass, t.arp ?? []]) {
        for (const n of seq) {
          if (n === null) continue;
          expect(n).toBeGreaterThan(20);
          expect(n).toBeLessThan(100);
        }
      }
      for (const c of t.drums) expect('ksh.'.includes(c), `${id} drum char ${c}`).toBe(true);
    }
  });
});

describe('轮 26:交叉淡入淡出(验收门「8 首曲目切换无断层」的可测部分)', () => {
  it('起点/终点干净:0 秒时旧轨满、新轨零;过完 fade 反向', () => {
    expect(crossfadeGains(0, 0.9)).toEqual([1, 0]);
    expect(crossfadeGains(0.9, 0.9)).toEqual([0, 1]);
    expect(crossfadeGains(5, 0.9)).toEqual([0, 1]);
  });

  it('**总增益恒为 1**:不会切歌时掉一截,也不会两首叠成两倍响', () => {
    for (let t = 0; t <= 1.2; t += 0.05) {
      const [oldG, newG] = crossfadeGains(t, 0.9);
      expect(oldG + newG, `t=${t.toFixed(2)}`).toBeCloseTo(1, 6);
      expect(oldG).toBeGreaterThanOrEqual(0);
      expect(newG).toBeGreaterThanOrEqual(0);
    }
  });

  it('两条曲线都单调(旧轨只降、新轨只升 —— 不来回抖)', () => {
    let prevOld = 1, prevNew = 0;
    for (let t = 0; t <= 1.0; t += 0.02) {
      const [oldG, newG] = crossfadeGains(t, 0.9);
      expect(oldG).toBeLessThanOrEqual(prevOld + 1e-9);
      expect(newG).toBeGreaterThanOrEqual(prevNew - 1e-9);
      prevOld = oldG; prevNew = newG;
    }
  });

  it('fade 时长非法时不炸(0/负/NaN 都按一个极小值处理)', () => {
    for (const bad of [0, -1, Number.NaN]) {
      const [oldG, newG] = crossfadeGains(0.5, bad);
      expect(Number.isFinite(oldG) && Number.isFinite(newG)).toBe(true);
      expect(oldG + newG).toBeCloseTo(1, 6);
    }
  });
});

describe('轮 26:场景 → 曲目(8 首各就各位)', () => {
  it('营地/菜单 → camp', () => {
    expect(trackFor({ scene: 'camp' })).toBe('camp');
  });

  it('章节房间用本章曲;Boss 房用**本章**的 Boss 主题', () => {
    for (const ch of [1, 2, 3]) {
      expect(trackFor({ scene: 'run', chapter: ch })).toBe(`ch${ch}`);
      expect(trackFor({ scene: 'run', chapter: ch, boss: true })).toBe(`boss${ch}`);
    }
  });

  it('无尽模式固定用 endless(循环三章,但主题不变)', () => {
    for (const ch of [1, 2, 3]) {
      expect(trackFor({ scene: 'run', chapter: ch, endless: true })).toBe('endless');
      expect(trackFor({ scene: 'run', chapter: ch, endless: true, boss: true })).toBe('endless');
    }
  });

  it('章节越界夹到 1~3(坏档不会拿到不存在的曲目)', () => {
    expect(trackFor({ scene: 'run', chapter: 0 })).toBe('ch1');
    expect(trackFor({ scene: 'run', chapter: 99 })).toBe('ch3');
    expect(trackFor({ scene: 'run', chapter: Number.NaN })).toBe('ch1');
  });
});

describe('轮 26:环境声(地形听得出来)', () => {
  it('地板 → 环境声', () => {
    expect(ambienceFor('water')).toBe('water');
    expect(ambienceFor('ice')).toBe('ice');
    expect(ambienceFor('sand')).toBe('wind');
    expect(ambienceFor('moss')).toBe('wind');
    expect(ambienceFor(null)).toBe('none');
    expect(ambienceFor('不认识的形状', { night: true })).toBe('wind');
    expect(ambienceFor('不认识的形状')).toBe('none');
  });

  it('每种环境声都有合成参数,且**永远小于音乐**(0.5 上限)', () => {
    for (const k of Object.keys(AMBIENCE_DEFS) as Array<keyof typeof AMBIENCE_DEFS>) {
      const d = AMBIENCE_DEFS[k];
      expect(d.freq).toBeGreaterThan(50);
      expect(d.lfo).toBeGreaterThan(0);
      expect(d.depth).toBeGreaterThan(0);
      expect(d.depth).toBeLessThanOrEqual(1);
    }
    expect(ambienceVol('none')).toBe(0);
    for (const k of ['wind', 'water', 'ember', 'ice'] as const) {
      expect(ambienceVol(k)).toBeGreaterThan(0);
      expect(ambienceVol(k, { night: true })).toBeGreaterThanOrEqual(ambienceVol(k));
      expect(ambienceVol(k, { night: true })).toBeLessThanOrEqual(0.5);
    }
  });
});
