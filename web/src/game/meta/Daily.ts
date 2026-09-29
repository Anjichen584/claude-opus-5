import { Rng } from '@engine/core/Rng';
import challenges from '@data/challenges.json';

/**
 * 每日挑战(docs/01-GDD.md §9 长线目标):
 * 同一日期 → 同一 seed → 同一组词条,玩家之间可比、隔天必换。
 * 本文件是纯函数逻辑(可单测),运行期状态在 dungeon/RunMods.ts。
 */
export interface RunMod {
  id: string;
  name: string;
  desc: string;
  /** 敌人生命乘区 */ hp?: number;
  /** 敌人攻击乘区 */ atk?: number;
  /** 掉落乘区 */ drop?: number;
  /** 玩家冷却缩减追加(0.25 = +25%,叠加在装备之上) */ cdr?: number;
  /** 玩家攻击乘区 */ playerAtk?: number;
  /** 玩家生命上限乘区 */ playerHp?: number;
  /** 初始药剂增减 */ potion?: number;
  /** 昼夜周期时长乘区(0.6 = 入夜更快) */ cycle?: number;
}

/**
 * 词条池:数据在 `src/data/challenges.json`(双端 parity 会逐键比对 C# 镜像)。
 * 铁律:每条都必须"有得有失",否则会出现白给的一天或没人玩的一天 —— 由单测守卫。
 */
export const MOD_POOL: readonly RunMod[] = challenges.daily.mods as readonly RunMod[];

/** 每天抽几条 */
export const DAILY_MOD_COUNT = challenges.daily.count;

/** 本地日期键 YYYY-MM-DD(玩家在哪个时区就按哪个时区算) */
export function dailyKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 日期键 → 稳定 seed(跨设备、跨浏览器一致):FNV-1a + 雪崩混洗。
 * 雪崩这步不能省 —— 连续日期只差最后一个字符,FNV 输出极为接近,
 * mulberry32 的第一个随机数会跟着相关,实测连续三天都抽到同一张词条。
 * 混洗常数取自 MurmurHash3 的 fmix32。
 */
export function keySeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0 || 1;
}

/** 每日键的 seed(与周常共用同一套散列,见 keySeed) */
export function dailySeed(key: string): number {
  return keySeed(key);
}

export interface DailyChallenge {
  key: string;
  seed: number;
  mods: RunMod[];
}

/** 当日挑战:seed → 抽 N 条不重复词条(顺序也确定) */
export function dailyChallenge(key: string): DailyChallenge {
  const seed = dailySeed(key);
  const rng = new Rng(seed);
  const pool = [...MOD_POOL];
  const mods: RunMod[] = [];
  for (let i = 0; i < DAILY_MOD_COUNT && pool.length > 0; i++) {
    mods.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  }
  return { key, seed, mods };
}

/** 合并后的局内乘区 */
export interface MergedMods {
  hp: number;
  atk: number;
  drop: number;
  cdr: number;
  playerAtk: number;
  playerHp: number;
  potion: number;
  cycle: number;
}

/** 无词条(普通局):全中性 */
export const NEUTRAL_MODS: MergedMods = {
  hp: 1, atk: 1, drop: 1, cdr: 0, playerAtk: 1, playerHp: 1, potion: 0, cycle: 1,
};

/** 乘区相乘、加区相加;空列表得到中性值(普通局与每日局走同一条代码路径) */
export function mergeMods(mods: readonly RunMod[]): MergedMods {
  const m: MergedMods = { ...NEUTRAL_MODS };
  for (const mod of mods) {
    m.hp *= mod.hp ?? 1;
    m.atk *= mod.atk ?? 1;
    m.drop *= mod.drop ?? 1;
    m.playerAtk *= mod.playerAtk ?? 1;
    m.playerHp *= mod.playerHp ?? 1;
    m.cycle *= mod.cycle ?? 1;
    m.cdr += mod.cdr ?? 0;
    m.potion += mod.potion ?? 0;
  }
  return m;
}
