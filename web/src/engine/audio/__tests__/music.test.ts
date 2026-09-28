import { describe, expect, it } from 'vitest';
import { TRACKS } from '../Music';

describe('BGM 曲谱数据', () => {
  const ids = Object.keys(TRACKS) as Array<keyof typeof TRACKS>;

  it('五首曲目齐全', () => {
    expect(ids.sort()).toEqual(['boss', 'camp', 'ch1', 'ch2', 'ch3']);
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
