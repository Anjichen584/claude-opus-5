import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import runePool from '@data/runes/pool.json';
import {
  ENEMY_KEYS, ENEMY_TOTAL, RUNE_KEYS, RUNE_TOTAL, codexPct, codexProgress,
  emptyCodex, enemyEntry, isBossKey, markEnemyKill, markRuneOwned, runeEntry,
  sanitizeCodex, topKills,
} from '../Codex';
import { defaultSave, migrateSave } from '../migrations';

describe('图鉴条目表', () => {
  it('怪物条目 = balance.enemies + boss.nanmir,共 30 条(24 杂兵 + 3 中 Boss + 3 章 Boss)', () => {
    const jsonCount = Object.keys(balance.enemies).length + 1; // + boss.nanmir
    expect(ENEMY_TOTAL).toBe(jsonCount);
    expect(ENEMY_TOTAL).toBe(30);
  });

  it('符文条目 = pool.json 全量,共 36 条', () => {
    expect(RUNE_TOTAL).toBe(runePool.runes.length);
    expect(RUNE_TOTAL).toBe(36);
  });

  it('每条怪物都能取到条目,且名字与 balance 一致(三 Boss 也算)', () => {
    for (const k of ENEMY_KEYS) {
      const e = enemyEntry(k);
      expect(e, k).not.toBeNull();
      expect(e!.name.length).toBeGreaterThan(0);
      if (isBossKey(k)) expect(e!.boss).toBe(true);
      expect(e!.hint.length).toBeGreaterThan(0); // 行为提示不能空
    }
    expect(enemyEntry('boss_nanmir')!.name).toBe(balance.boss.nanmir.name);
    expect(enemyEntry('boss_velsha')!.name).toBe(balance.enemies.boss_velsha.name);
    expect(enemyEntry('boss_kazra')!.name).toBe(balance.enemies.boss_kazra.name);
  });

  it('三条 Boss 条目分属三章(章 2/3 的 Boss 不落在一章)', () => {
    expect(enemyEntry('boss_nanmir')!.chapter).toBe(1);
    expect(enemyEntry('boss_velsha')!.chapter).toBe(2);
    expect(enemyEntry('boss_kazra')!.chapter).toBe(3);
    expect(enemyEntry('snowpuff')!.chapterName).toBe(balance.chapters['2'].name);
  });

  it('展示数值直接来自 balance(不是拷贝的副本)', () => {
    const e = enemyEntry('oakgolem')!;
    expect(e.hp).toBe(balance.enemies.oakgolem.hp);
    expect(e.atk).toBe(balance.enemies.oakgolem.atk);
    expect(e.speed).toBe(balance.enemies.oakgolem.speed);
    const r = runeEntry('rune_emberseed')!;
    expect(r.name).toBe(runePool.runes[0].name);
    expect(r.klassName).toBe('狂澜剑士');
    expect(r.skillSlot).toBe('Q');
  });

  it('未知 key 返回 null(不会画出幽灵条目)', () => {
    expect(enemyEntry('dragon')).toBeNull();
    expect(runeEntry('rune_nope')).toBeNull();
  });
});

describe('收录与进度', () => {
  it('空图鉴:一条都没收录,收录率 0', () => {
    const c = emptyCodex();
    const p = codexProgress(c);
    expect(p).toEqual({ enemyFound: 0, enemyTotal: 30, runeFound: 0, runeTotal: 36 });
    expect(codexPct(c)).toBe(0);
  });

  it('首次击杀返回 true(宿主弹"新条目"),重复击杀返回 false', () => {
    const c = emptyCodex();
    expect(markEnemyKill(c, 'shroomling')).toBe(true);
    expect(markEnemyKill(c, 'shroomling')).toBe(false);
    expect(c.enemies.shroomling).toBe(2);
    expect(codexProgress(c).enemyFound).toBe(1);
  });

  it('符文同理:首次收录 true,计数累加', () => {
    const c = emptyCodex();
    expect(markRuneOwned(c, 'rune_emberseed')).toBe(true);
    expect(markRuneOwned(c, 'rune_emberseed')).toBe(false);
    expect(c.runes.rune_emberseed).toBe(2);
  });

  it("未知 key / 兜底 monster / 空串一律忽略(击杀 monster 不进图鉴)", () => {
    const c = emptyCodex();
    expect(markEnemyKill(c, 'monster')).toBe(false);
    expect(markEnemyKill(c, '')).toBe(false);
    expect(markEnemyKill(c, 'dragon')).toBe(false);
    expect(markRuneOwned(c, 'rune_fake')).toBe(false);
    expect(Object.keys(c.enemies)).toHaveLength(0);
  });

  it('种类名兜底键不污染进度:塞进 22 条未知 key 也只算已收录的', () => {
    const c = emptyCodex();
    for (let i = 0; i < 22; i++) c.enemies[`fake_${i}`] = 5;
    expect(codexProgress(c).enemyFound).toBe(0);
    expect(codexPct(c)).toBe(0);
  });

  it('全收录 = 100%', () => {
    const c = emptyCodex();
    for (const k of ENEMY_KEYS) markEnemyKill(c, k);
    for (const id of RUNE_KEYS) markRuneOwned(c, id);
    const p = codexProgress(c);
    expect(p.enemyFound).toBe(p.enemyTotal);
    expect(p.runeFound).toBe(p.runeTotal);
    expect(codexPct(c)).toBe(1);
  });

  it('topKills 只统计已知条目并按击杀数排序', () => {
    const c = emptyCodex();
    markEnemyKill(c, 'shroomling', 3);
    markEnemyKill(c, 'oakgolem', 9);
    c.enemies.ghost = 99;
    const top = topKills(c, 2);
    expect(top.map((t) => t.key)).toEqual(['oakgolem', 'shroomling']);
    expect(top[0].name).toBe(enemyEntry('oakgolem')!.name); // 一章部分怪没写 name,回退 key
    expect(top.some((t) => t.key === 'ghost')).toBe(false);
  });
});

describe('存档兼容(加字段不升版本)', () => {
  it('新档带 codex 且为空', () => {
    expect(defaultSave().codex).toEqual({ enemies: {}, runes: {} });
  });

  it('老档(没有 codex)迁移后补空图鉴,不报错', () => {
    const old = { v: 2, stardust: 5, altar: { hp: 1, atk: 0, luck: 0 }, stats: { runs: 1, clears: 0, totalKills: 3, bestTimeS: 0 } };
    const r = migrateSave(old);
    expect(r.data.codex).toEqual({ enemies: {}, runes: {} });
    expect(r.data.stardust).toBe(5);
  });

  it('脏图鉴被清洗:未知 key 丢弃、负数/NaN 归零、小数取整', () => {
    const bad = {
      v: 2,
      codex: {
        enemies: { shroomling: 3, dragon: 9, windbee: -2, oakgolem: Number.NaN, boss_kazra: 4.7 },
        runes: { rune_emberseed: 1, rune_fake: 5 },
      },
    };
    const c = migrateSave(bad).data.codex;
    expect(c.enemies).toEqual({ shroomling: 3, boss_kazra: 4 });
    expect(c.runes).toEqual({ rune_emberseed: 1 });
  });

  it('sanitizeCodex 对 null / 字符串 / 数组都返回空图鉴(不抛异常)', () => {
    expect(sanitizeCodex(null)).toEqual({ enemies: {}, runes: {} });
    expect(sanitizeCodex('nope')).toEqual({ enemies: {}, runes: {} });
    expect(sanitizeCodex([1, 2, 3])).toEqual({ enemies: {}, runes: {} });
  });

  it('图鉴跨局保留:migrate 后仍是同一份计数', () => {
    const save = defaultSave();
    markEnemyKill(save.codex, 'boss_velsha', 2);
    markRuneOwned(save.codex, 'rune_frostring');
    const round = migrateSave(JSON.parse(JSON.stringify(save))).data;
    expect(round.codex.enemies.boss_velsha).toBe(2);
    expect(round.codex.runes.rune_frostring).toBe(1);
  });
});

describe('Boss 击杀种类精细化(掉落判定不能被带崩)', () => {
  it('三 Boss 都算 boss:掉落用前缀判定,狼/傀儡判定不受影响', () => {
    const bossKinds = ['boss_nanmir', 'boss_velsha', 'boss_kazra'];
    for (const k of bossKinds) {
      expect(k.startsWith('boss')).toBe(true);
      expect(enemyEntry(k)!.boss).toBe(true);
    }
    // 精英/普通怪不能被当成 Boss
    for (const k of ['oakgolem', 'blightwolf', 'shroomling']) {
      expect(k.startsWith('boss')).toBe(false);
      expect(enemyEntry(k)!.boss).toBe(false);
    }
  });
});
