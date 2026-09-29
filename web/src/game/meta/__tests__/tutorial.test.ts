import { beforeEach, describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { Tutorial, STEPS, clampStep, formatHint } from '@game/meta/Tutorial';
import { meta, SLOT_COUNT, slotKey } from '@game/meta/Save';
import { DEFAULT_BINDS } from '@game/meta/migrations';

const T = balance.tutorial;

describe('新手引导 · 步骤表', () => {
  it('恰好 5 步,顺序 = 移动/翻滚/技能/背包/祭坛', () => {
    expect(T.steps.length).toBe(5);
    expect(T.steps.map((s) => s.id)).toEqual(['move', 'dash', 'skill', 'bag', 'altar']);
  });

  it('每步都有标题与文案,且**只有移动键**允许写死(它不在可改绑表里)', () => {
    // 例外的理由:移动是 WASD/方向键,全平台统一、不可改绑;其余动作都能改键,
    // 所以它们的按键**必须**走 {action} 占位符 —— 否则玩家改过键,引导就在骗人。
    const movementOnly = /WASD|方向键|摇杆/;
    for (const s of T.steps) {
      expect(s.title.length, s.id).toBeGreaterThan(0);
      expect(s.hint.length, s.id).toBeGreaterThan(0);
      const literal = s.hint.replace(/\{\w+\}/g, '');
      const stripped = literal.replace(new RegExp(movementOnly.source, 'g'), '');
      expect(stripped, `${s.id} 文案里疑似写死了可改绑的按键`).not.toMatch(/\b(Q|E|R|Tab|空格|F)\b/);
    }
  });

  it('占位符指向的动作全部可改绑(否则 {xxx} 会原样显示出来)', () => {
    const actions = new Set<string>();
    for (const s of T.steps) {
      for (const m of s.hint.matchAll(/\{(\w+)\}/g)) actions.add(m[1]);
    }
    expect(actions.size).toBeGreaterThan(0);
    for (const a of actions) {
      expect(DEFAULT_BINDS[a], `{${a}} 不是可改绑动作`).toBeTruthy();
    }
  });

  it('文案渲染成当前绑定键(改绑后跟着变)', () => {
    const step = STEPS.find((s) => s.id === 'dash')!;
    expect(formatHint(step.hint)).toContain('空格'); // 默认 dash = Space
    const prev = meta.data.settings.binds.dash;
    meta.data.settings.binds.dash = 'ShiftLeft';
    expect(formatHint(step.hint)).toContain('L-Shift');
    meta.data.settings.binds.dash = prev;
  });

  it('移动判定距离与跳过键有值(skipKey 是固定键,不在可改绑表里是刻意的)', () => {
    expect(T.moveM).toBeGreaterThan(1);
    expect(T.skipKey).toMatch(/^Key[A-Z]$/);
    expect(T.saveSlots).toBe(SLOT_COUNT);
  });
});

describe('新手引导 · 状态机', () => {
  let t: Tutorial;
  beforeEach(() => {
    t = new Tutorial();
  });

  it('初始:第 1 步、未完成、有文案', () => {
    expect(t.step).toBe(0);
    expect(t.done).toBe(false);
    expect(t.current?.id).toBe('move');
    expect(t.hint).toBeTruthy();
    expect(t.displayIndex).toBe(1);
  });

  it('顺序推进:只有当前步骤的动作才作数(先翻滚不会跳步)', () => {
    expect(t.notify('dash')).toBe(false); // 现在轮到 move
    expect(t.step).toBe(0);
    expect(t.notify('move')).toBe(true);
    expect(t.step).toBe(1);
    expect(t.current?.id).toBe('dash');
  });

  it('同一步重复上报不会多推(轮询每帧都在调)', () => {
    t.notify('move');
    t.notify('move');
    t.notify('move');
    expect(t.step).toBe(1);
  });

  it('走完 5 步:done 且不再有文案', () => {
    for (const s of T.steps) expect(t.notify(s.id as never)).toBe(true);
    expect(t.done).toBe(true);
    expect(t.current).toBeNull();
    expect(t.hint).toBeNull();
    expect(t.displayIndex).toBe(5);
    expect(t.notify('move')).toBe(false);
  });

  it('跳过:立刻结束,之后任何动作都不再推进(也永远不再显示)', () => {
    t.notify('move');
    t.skip();
    expect(t.done).toBe(true);
    expect(t.hint).toBeNull();
    expect(t.notify('dash')).toBe(false);
    expect(t.snapshot()).toEqual({ step: 5, done: true });
  });

  it('恢复进度:中途关掉游戏,回来接着下一步', () => {
    t.notify('move');
    t.notify('dash');
    const snap = t.snapshot();
    const t2 = new Tutorial();
    t2.restore(snap);
    expect(t2.step).toBe(2);
    expect(t2.current?.id).toBe('skill');
    expect(t2.done).toBe(false);
  });

  it('坏档/越界不崩:step 越界夹回,补一个 done 一致的语义', () => {
    const t2 = new Tutorial();
    t2.restore({ step: 999, done: false });
    expect(t2.step).toBe(5);
    expect(t2.done).toBe(true); // step 到顶 = 已完成
    const t3 = new Tutorial();
    t3.restore({ step: -3, done: true });
    expect(t3.step).toBe(0);
    expect(t3.done).toBe(true); // done 一旦为真不再回退
    expect(clampStep(Number.NaN)).toBe(0);
    expect(clampStep('3' as never)).toBe(0);
  });

  it('重看引导:restart 后从第 1 步重来', () => {
    t.skip();
    t.restart();
    expect(t.step).toBe(0);
    expect(t.done).toBe(false);
    expect(t.current?.id).toBe('move');
  });
});

describe('新手引导 · 存档槽(3 槽,槽 0 兼容历史单档)', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    } as unknown as Storage;
  });

  it('槽键命名:0 号槽用历史键,1/2 号槽加后缀(老玩家的档自动落在 0 号槽)', () => {
    expect(SLOT_COUNT).toBe(3);
    expect(slotKey(0)).toMatch(/^sk_save_v\d+$/);
    expect(slotKey(1)).toBe(`${slotKey(0)}_slot1`);
    expect(slotKey(2)).toBe(`${slotKey(0)}_slot2`);
  });

  it('槽互相隔离:一个槽的星尘/祭坛/引导互不影响', () => {
    meta.slotIndex = 0;
    meta.data.stardust = 111;
    meta.data.altar.hp = 3;
    meta.data.tutorial = { step: 2, done: false };
    meta.save();

    meta.switchTo(1);
    expect(meta.data.stardust, '空槽应当是全新档').toBe(0);
    expect(meta.data.altar.hp).toBe(0);
    expect(meta.data.tutorial.step).toBe(0);
    meta.data.stardust = 222;
    meta.data.tutorial = { step: 5, done: true };
    meta.save();

    meta.switchTo(0);
    expect(meta.data.stardust).toBe(111);
    expect(meta.data.altar.hp).toBe(3);
    expect(meta.data.tutorial).toEqual({ step: 2, done: false });
  });

  it('切槽前会把当前进度写回原槽(切换不丢数据)', () => {
    meta.slotIndex = 0;
    meta.data.stardust = 777;
    meta.switchTo(2);            // 没显式 save,也不该丢
    expect(meta.data.stardust).toBe(0);
    meta.switchTo(0);
    expect(meta.data.stardust).toBe(777);
  });

  it('槽概览:空槽 exists=false,有档给摘要(星尘/祭坛/通关/时间)', () => {
    meta.slotIndex = 0;
    meta.data.stardust = 50;
    meta.data.stats.clears = 2;
    meta.data.stats.runs = 5;
    meta.save();
    const slots = meta.slots();
    expect(slots.length).toBe(3);
    expect(slots[1].exists).toBe(false);
    expect(slots[1].summary).toBeNull();
    expect(slots[0].exists).toBe(true);
    expect(slots[0].summary?.stardust).toBe(50);
    expect(slots[0].summary?.clears).toBe(2);
    expect(slots[0].summary?.updatedAt, '存档要记最后写入时间').toBeGreaterThan(0);
    expect(slots[0].active).toBe(true);
  });

  it('清空槽只影响该槽', () => {
    meta.slotIndex = 1;
    meta.data.stardust = 9;
    meta.save();
    meta.resetSlot(1);
    expect(meta.data.stardust, '清的是当前槽 → 内存也重置').toBe(0);
    expect(meta.preview(1).exists).toBe(false);
    meta.switchTo(0);
    meta.data.stardust = 5;
    meta.save();
    meta.resetSlot(1);           // 清别的槽
    expect(meta.data.stardust, '不该动当前槽').toBe(5);
  });

  it('坏档不致崩:槽里是垃圾字符串时,概览标记为"有档但读不出摘要"', () => {
    store.set(slotKey(2), '{这不是 JSON');
    const p2 = meta.preview(2);
    expect(p2.exists).toBe(true);
    expect(p2.summary).toBeNull();
  });
});
