import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import {
  ABYSS_LEVELS, NIGHT_BONUS_MULT, NORMAL, abyssUnlocked, levelName, levelOf, lockReason,
  maxPlayable, multsOf, newlyUnlocked, recordClear, summaryOf, type AbyssProgress,
} from '@game/dungeon/Abyss';
import { runMods } from '@game/dungeon/RunMods';

const AB = balance.abyss;

/**
 * 轮 23 验收:**三层各有独立乘区与解锁条件**。
 * 三个考点(都是难度系统最容易做歪的地方):
 * 1. 乘区必须**逐列单调**(层数越高怪越硬、掉得越多),不能出现"III 的掉落比 II 低";
 * 2. 解锁必须**逐层**(不能跳级) —— 跳级会让玩家直接撞 3× 血量的墙;
 * 3. 乘区要**真的接进出怪与掉落**(规则写对但没人调用 = 假完成,前几轮踩过)。
 */
const prog = (clears: number, abyssClears: number[] = []): AbyssProgress => ({ clears, abyssClears });

describe('层表:三层各带独立乘区', () => {
  it('三层齐全,id 连续,名字带序号', () => {
    expect(ABYSS_LEVELS).toHaveLength(3);
    ABYSS_LEVELS.forEach((l, i) => {
      expect(l.id).toBe(i + 1);
      expect(l.name).toContain(['I', 'II', 'III'][i]);
    });
    expect(levelOf(NORMAL)).toBeNull();          // 0 是普通远征,不是"第 0 层"
    expect(levelOf(4)).toBeNull();
  });

  it('四条乘区**逐列单调递增**(越高越难,也越高收益)', () => {
    const cols = ['hpMult', 'atkMult', 'lootMult', 'dustMult'] as const;
    for (const c of cols) {
      for (let i = 1; i < ABYSS_LEVELS.length; i++) {
        expect(ABYSS_LEVELS[i][c], `${c} 在 ${i + 1} 层没有继续升高`).toBeGreaterThan(ABYSS_LEVELS[i - 1][c]);
      }
    }
  });

  it('危险与收益同向:每层掉落乘区都 > 1(难度要"值得打",不能只有惩罚)', () => {
    for (const l of ABYSS_LEVELS) {
      expect(l.lootMult).toBeGreaterThan(1);
      expect(l.dustMult).toBeGreaterThan(l.lootMult * 0.9);
    }
  });

  it('精英房额外波次非负且不夸张(超过 3 波会把一局拖成苦工)', () => {
    for (const l of ABYSS_LEVELS) {
      expect(l.eliteWaves).toBeGreaterThanOrEqual(0);
      expect(l.eliteWaves).toBeLessThanOrEqual(3);
    }
  });

  it('普通档全中性(系统侧不需要 if (abyss > 0))', () => {
    expect(multsOf(NORMAL)).toEqual({ hp: 1, atk: 1, loot: 1, dust: 1, eliteWaves: 0 });
    expect(multsOf(99)).toEqual(multsOf(NORMAL));   // 越界也回中性,不会乘出 NaN
  });

  it('摘要能说清是哪一层(UI 直接用)', () => {
    expect(summaryOf(NORMAL)).toContain('基准');
    expect(levelName(2)).toBe(ABYSS_LEVELS[1].name);
    expect(levelName(NORMAL)).toBe('远征');
    expect(summaryOf(2)).toContain(ABYSS_LEVELS[1].name);
    expect(summaryOf(2)).toContain(String(ABYSS_LEVELS[1].hpMult));
  });
});

describe('解锁:逐层,不能跳级', () => {
  it('深渊 I 看普通局通关数', () => {
    const need = ABYSS_LEVELS[0].unlockClears;
    expect(need).toBeGreaterThan(0);
    expect(abyssUnlocked(1, prog(need - 1))).toBe(false);
    expect(abyssUnlocked(1, prog(need))).toBe(true);
    expect(lockReason(1, prog(0))).toContain('普通局');
  });

  it('深渊 II/III 必须上一层先通关(跳级 = 直接撞 3× 血量的墙)', () => {
    const many = 999;
    expect(abyssUnlocked(2, prog(many, [0, 0, 0]))).toBe(false);
    expect(abyssUnlocked(2, prog(many, [1, 0, 0]))).toBe(true);
    const needIII = ABYSS_LEVELS[2].unlockAbyss;
    expect(needIII).toBeGreaterThanOrEqual(ABYSS_LEVELS[1].unlockAbyss);
    expect(abyssUnlocked(3, prog(many, [5, 0, 0])), '深渊 I 打穿也开不了深渊 III').toBe(false);
    expect(abyssUnlocked(3, prog(many, [5, needIII - 1, 0]))).toBe(false);
    expect(abyssUnlocked(3, prog(many, [5, needIII, 0]))).toBe(true);
    expect(lockReason(3, prog(many, [5, 0, 0]))).toContain(ABYSS_LEVELS[1].name);
  });

  it('普通远征永远可选;越界层永远不可选', () => {
    expect(abyssUnlocked(NORMAL, prog(0, []))).toBe(true);
    expect(abyssUnlocked(4, prog(999, [9, 9, 9]))).toBe(false);
    expect(lockReason(NORMAL, prog(0, []))).toBeNull();
  });

  it('maxPlayable 给出当前能打的最高层(没通关时是 0)', () => {
    expect(maxPlayable(prog(0, []))).toBe(NORMAL);
    expect(maxPlayable(prog(3, [0, 0, 0]))).toBe(1);
    expect(maxPlayable(prog(3, [1, 1, 0]))).toBe(2);
    expect(maxPlayable(prog(3, [1, ABYSS_LEVELS[2].unlockAbyss, 0]))).toBe(3);
  });

  it('recordClear 只增不减,且不改入参(存档纯函数)', () => {
    const before = prog(2, [1, 0, 0]);
    const after = recordClear(2, before);
    expect(after.clears).toBe(3);
    expect(after.abyssClears).toEqual([1, 1, 0]);
    expect(before.abyssClears, '入参被改了(菜单里回滚就没法做)').toEqual([1, 0, 0]);
  });

  it('普通局通关只加 clears;越界档位不会写出长度为 4 的数组', () => {
    expect(recordClear(NORMAL, prog(0, [])).abyssClears).toHaveLength(ABYSS_LEVELS.length);
    expect(recordClear(99, prog(0, [])).abyssClears).toHaveLength(ABYSS_LEVELS.length);
    expect(recordClear(99, prog(0, [])).abyssClears.every((n) => n === 0)).toBe(true);
  });

  it('newlyUnlocked 只在"这一局刚好跨过去"时报一次', () => {
    const need = ABYSS_LEVELS[0].unlockClears;
    expect(newlyUnlocked(prog(need - 1, []), prog(need, []))).toBe(1);
    expect(newlyUnlocked(prog(need, []), prog(need + 1, [])), '已经解锁过不该反复提示').toBeNull();
    expect(newlyUnlocked(prog(0, [0, 0, 0]), prog(0, [1, 0, 0]))).toBe(2);
    expect(newlyUnlocked(prog(0, [0, 0, 0]), prog(0, [0, 0, 0]))).toBeNull();
  });
});

describe('接线:乘区真的作用到出怪与掉落', () => {
  const withAbyss = <T>(idx: number, f: () => T): T => {
    runMods.clear();
    runMods.setAbyss(idx);
    try { return f(); } finally { runMods.clear(); }
  };

  it('enemy(hp, atk) 在深渊档下按该层乘区放大', () => {
    const [h0, a0] = withAbyss(NORMAL, () => runMods.enemy(100, 20));
    expect([h0, a0]).toEqual([100, 20]);
    for (const l of ABYSS_LEVELS) {
      const [h, a] = withAbyss(l.id, () => runMods.enemy(100, 20));
      expect(h).toBeCloseTo(100 * l.hpMult, 6);
      expect(a).toBeCloseTo(20 * l.atkMult, 6);
    }
  });

  it('dropMult / dustMult 跟着层数走(打更难 = 拿更多)', () => {
    expect(withAbyss(NORMAL, () => runMods.dropMult)).toBe(1);
    expect(withAbyss(NORMAL, () => runMods.dustMult)).toBe(1);
    for (const l of ABYSS_LEVELS) {
      expect(withAbyss(l.id, () => runMods.dropMult)).toBeCloseTo(l.lootMult, 6);
      expect(withAbyss(l.id, () => runMods.dustMult)).toBeCloseTo(l.dustMult, 6);
    }
  });

  it('精英房波次随层增加,普通档不加波', () => {
    expect(withAbyss(NORMAL, () => runMods.eliteWaves)).toBe(0);
    expect(withAbyss(3, () => runMods.eliteWaves)).toBe(ABYSS_LEVELS[2].eliteWaves);
  });

  it('clear() 会把难度档归零(否则下一局会带着上一局的深渊乘区)', () => {
    runMods.setAbyss(3);
    runMods.clear();
    expect(runMods.abyss).toBe(NORMAL);
    expect(runMods.enemy(100, 10)).toEqual([100, 10]);
    expect(runMods.dropMult).toBe(1);
  });

  it('挑战词条与深渊是**相乘**关系(不是互相覆盖)', () => {
    runMods.clear();
    runMods.set('2026-01-01', [{ id: 'x', name: 't', desc: '测试词条', hp: 2 }]);
    runMods.setAbyss(1);
    const [h] = runMods.enemy(100, 10);
    expect(h).toBeCloseTo(100 * 2 * ABYSS_LEVELS[0].hpMult, 6);
    expect(runMods.dropMult).toBeCloseTo(ABYSS_LEVELS[0].lootMult, 6);
    runMods.clear();
  });

  /**
   * 源码守卫:接线点一旦被"改回去"(有人为了调难度把写死值加回 RunManager / 忘了乘 dustMult),
   * 上面那些纯函数断言**全都还是绿的** —— 只有读源码才咬得住(轮 27 的先例)。
   */
  it('接线点没有被绕开:RunManager 用 eliteWaves、LootSystem 乘 dustMult', () => {
    const run = readFileSync(resolve(process.cwd(), 'src/game/dungeon/RunManager.ts'), 'utf8');
    expect(run, '精英房波次没读 runMods.eliteWaves').toMatch(/pendingWaves\s*=\s*1\s*\+\s*runMods\.extraWaves\s*\+\s*runMods\.eliteWaves/);
    const loot = readFileSync(resolve(process.cwd(), 'src/game/loot/LootSystem.ts'), 'utf8');
    const dustUses = loot.match(/\*\s*runMods\.dustMult/g) ?? [];
    expect(dustUses.length, '星尘掉落(普通 + 星尘精灵两条路)都要乘 dustMult').toBeGreaterThanOrEqual(2);
    const scene = readFileSync(resolve(process.cwd(), 'src/game/GameScene.ts'), 'utf8');
    expect(scene, '开局没把选中的深渊档灌进 runMods').toMatch(/runMods\.setAbyss\(/);
    expect(scene, '结算没记录深渊通关数').toMatch(/recordClear\(/);
    const camp = readFileSync(resolve(process.cwd(), 'src/game/ui/CampUI.ts'), 'utf8');
    expect(camp, '营地面板没做解锁判定(锁着的层能被直接选)').toMatch(/abyssUnlocked\(/);
  });

  it('挑战局(每日/周常)固定普通档:挑战要全服同条件', () => {
    const scene = readFileSync(resolve(process.cwd(), 'src/game/GameScene.ts'), 'utf8');
    expect(scene).toMatch(/setAbyss\(mode === 'off' \? this\.campUI\.selectedAbyss : ABYSS_NORMAL\)/);
  });

  it('夜战加成是数据表里的数(不写死)', () => {
    expect(NIGHT_BONUS_MULT).toBeGreaterThan(1);
    expect(AB.nightBonusMult).toBe(NIGHT_BONUS_MULT);
  });
});
