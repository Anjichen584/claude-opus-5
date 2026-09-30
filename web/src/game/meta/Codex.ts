import balance from '@data/balance.json';
import runePoolData from '@data/runes/pool.json';

/**
 * 图鉴(收录):已击杀的怪 / 见过的符文入库,跨局持久。
 *
 * 设计原则(docs/02 §9 存档规矩):
 * - 只存"见过没有 + 击杀数",图鉴的**展示数值全部现读 balance.json**,
 *   所以调平衡不会让老玩家的图鉴数值失真(也不会多一份要同步的数据);
 * - 加字段走逐层兜底,不改存档版本;未知 key 一律丢弃(旧档/手改档都不会炸)。
 *
 * 本模块只依赖两份 JSON 数据,不 import 任何 game 逻辑,避免循环依赖。
 */

export interface CodexData {
  /** 敌人 key → 击杀数(>0 即已收录) */
  enemies: Record<string, number>;
  /** 符文 id → 获得次数(>0 即已收录) */
  runes: Record<string, number>;
}

export const emptyCodex = (): CodexData => ({ enemies: {}, runes: {} });

// ---------------- 图鉴条目清单(与 balance.json / pool.json 对齐) ----------------

type EnemyCfg = { name?: string; hp: number; atk: number; def: number; speed: number; bodyRadius: number };

/** 一章 Boss 挂在 balance.boss.nanmir,其余在 balance.enemies */
const enemyTable = (): Record<string, EnemyCfg> => ({
  ...(balance.enemies as unknown as Record<string, EnemyCfg>),
  boss_nanmir: balance.boss.nanmir as unknown as EnemyCfg,
});

/** 出没章节(元素杂兵与星尘精灵三章通用,归一章) */
export const ENEMY_CHAPTER: Record<string, 1 | 2 | 3> = {
  snowpuff: 2, iceturtle: 2, blizzardhawk: 2, frostmage: 2, boss_velsha: 2,
  cinderrat: 3, dunebeetle: 3, flamedancer: 3, duststinger: 3, boss_kazra: 3,
};

/** Boss 级条目:章 Boss(boss_*)与中 Boss(midboss_*),图鉴里都带 ★ 并排在杂兵之后 */
export const isBossKey = (key: string): boolean =>
  key.startsWith('boss_') || key.startsWith('midboss_');

/** 中 Boss(每章 1 只,推图第 6 房):与章 Boss 区分开,用于图鉴文案与排序细调 */
export const isMidBossKey = (key: string): boolean => key.startsWith('midboss_');

/** 全部敌人 key(22:18 杂兵 + 1 中 Boss + 3 章 Boss),顺序 = 展示顺序(按章节,杂兵在前 Boss 在后) */
export const ENEMY_KEYS: string[] = Object.keys(enemyTable()).sort((a, b) =>
  chapterRank(a) - chapterRank(b) ||
  Number(isBossKey(a)) - Number(isBossKey(b)) ||
  a.localeCompare(b));

/** 章节排序值(未知 key 兜到章 1) */
function chapterRank(key: string): number {
  return ENEMY_CHAPTER[key] ?? 1;
}

const chapterOf = (key: string): 1 | 2 | 3 => ENEMY_CHAPTER[key] ?? 1;

/** 一句话行为提示(UI 文案;数值仍来自 balance) */
export const ENEMY_HINT: Record<string, string> = {
  shroomling: '缓慢游荡,贴身撞击;死后留下孢子雾(毒)',
  windbee: '绕着你盘旋 → 抖动预警 → 直线俯冲',
  blightwolf: '绕圈逼近 → 低吼预警 → 扑击 → 硬直(输出窗口)',
  thornvine: '固定炮台,在脚下召唤地刺预警',
  oakgolem: '拍地 AOE;背部弱点,绕后伤害 ×2',
  emberimp: '保持 3~5m 风筝,蓄力火球',
  frostslime: '蓄力跳跃接近,接触上冰印记',
  sparklizard: '抖动预警 → 闪电冲撞(雷)',
  toxintoad: '吊射毒沼,落地留毒地',
  stardustsprite: '见到你就跑,限时逃走;击杀给一大袋星尘',
  snowpuff: '缓慢逼近 → 蓄力滚撞',
  iceturtle: '旋壳冲撞;正面减伤 50%,打背后',
  blizzardhawk: '环绕盘旋 → 定住 → 俯冲',
  frostmage: '保持距离,吟唱冰弹',
  cinderrat: 'Z 字高速贴脸',
  dunebeetle: '钻地接近 → 预警 → 钻出爆发',
  flamedancer: '瞬跳走位 + 双火球',
  duststinger: '蝎尾抛毒沼,平时小跳接近',
  midboss_mossstag: '一章中 Boss:冲撞(撞墙自晕!)/ 孢子弹幕 / 脚下孢子云;半血狂怒',
  midboss_frosthuntress: '二章中 Boss:瞬步三连冰矢 / 冰牙陷阵 / 猎杀凝视(蓄力可打断!);半血狂怒',
  boss_nanmir: '一章 Boss:扫击 / 根须线 / 尖刺网格 / 环形风暴',
  boss_velsha: '二章 Boss:冰弹环 / 暴风雪 / 召唤雪绒球 / P3 寒风冲锋',
  boss_kazra: '三章 Boss:钻地突袭 / 熔痕 / 召唤烬鼠 / P3 熔核暴走',
};

export interface EnemyEntry {
  key: string;
  name: string;
  chapter: 1 | 2 | 3;
  chapterName: string;
  boss: boolean;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  bodyRadius: number;
  hint: string;
}

/** 单个敌人的图鉴条目(数值现读 balance,不落存档) */
export function enemyEntry(key: string): EnemyEntry | null {
  const cfg = enemyTable()[key];
  if (!cfg) return null;
  const chapter = chapterOf(key);
  return {
    key,
    name: cfg.name ?? key,
    chapter,
    chapterName: balance.chapters[String(chapter) as '1' | '2' | '3'].name,
    boss: isBossKey(key),
    hp: cfg.hp,
    atk: cfg.atk,
    def: cfg.def,
    speed: cfg.speed,
    bodyRadius: cfg.bodyRadius,
    hint: ENEMY_HINT[key] ?? '',
  };
}

export interface RuneEntry {
  id: string;
  name: string;
  skill: string;
  element: string | null;
  desc: string;
  /** 所在技能位的职业展示名 */
  klassName: string;
  skillSlot: string;
}

const CLASS_NAME: Record<string, string> = {
  blade: '狂澜剑士', ranger: '星弓猎手', arcanist: '元素秘术师', warden: '岩铠守卫',
};

const SLOT_NAME: Record<string, string> = { q: 'Q', e: 'E', r: 'R' };

/** 全部符文 id(36) */
export const RUNE_KEYS: string[] = (runePoolData.runes as Array<{ id: string }>).map((r) => r.id);

export function runeEntry(id: string): RuneEntry | null {
  const r = (runePoolData.runes as Array<{
    id: string; name: string; skill: string; element?: string; desc: string;
  }>).find((x) => x.id === id);
  if (!r) return null;
  const [klass, slot] = r.skill.split('_');
  return {
    id: r.id,
    name: r.name,
    skill: r.skill,
    element: r.element ?? null,
    desc: r.desc,
    klassName: CLASS_NAME[klass] ?? klass,
    skillSlot: SLOT_NAME[slot] ?? slot,
  };
}

// ---------------- 条目数与进度 ----------------

export const ENEMY_TOTAL = ENEMY_KEYS.length;
export const RUNE_TOTAL = RUNE_KEYS.length;

export interface CodexProgress {
  enemyFound: number; enemyTotal: number;
  runeFound: number; runeTotal: number;
}

/** 统计已收录数量(只认表里存在的 key,防止旧档残留脏数据撑爆进度) */
export function codexProgress(codex: CodexData): CodexProgress {
  let enemyFound = 0;
  for (const k of ENEMY_KEYS) if ((codex.enemies[k] ?? 0) > 0) enemyFound++;
  let runeFound = 0;
  for (const id of RUNE_KEYS) if ((codex.runes[id] ?? 0) > 0) runeFound++;
  return { enemyFound, enemyTotal: ENEMY_TOTAL, runeFound, runeTotal: RUNE_TOTAL };
}

/** 收录率 0~1(怪物与符文等权拼在一起) */
export function codexPct(codex: CodexData): number {
  const p = codexProgress(codex);
  const total = p.enemyTotal + p.runeTotal;
  return total === 0 ? 0 : (p.enemyFound + p.runeFound) / total;
}

// ---------------- 写入(收进图鉴) ----------------

/**
 * 击杀记录 +1。返回 true = 这次是**首次收录**(宿主可以弹"新条目"提示)。
 * 未知 key(如 'monster' 兜底、'')一律忽略。
 */
export function markEnemyKill(codex: CodexData, key: string, n = 1): boolean {
  if (!key || !(key in enemyTable()) || n <= 0) return false;
  const first = (codex.enemies[key] ?? 0) === 0;
  codex.enemies[key] = (codex.enemies[key] ?? 0) + n;
  return first;
}

/** 获得符文 +1。返回 true = 首次收录。 */
export function markRuneOwned(codex: CodexData, id: string, n = 1): boolean {
  if (!id || !RUNE_KEYS.includes(id) || n <= 0) return false;
  const first = (codex.runes[id] ?? 0) === 0;
  codex.runes[id] = (codex.runes[id] ?? 0) + n;
  return first;
}

// ---------------- 存档清洗(逐层兜底,不升版本) ----------------

/** 把任意老档/脏数据洗成合法 CodexData:只留已知 key + 非负整数计数 */
export function sanitizeCodex(raw: unknown): CodexData {
  const out = emptyCodex();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { enemies?: unknown; runes?: unknown };
  const clean = (src: unknown, allow: (k: string) => boolean, dst: Record<string, number>): void => {
    if (!src || typeof src !== 'object') return;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!allow(k)) continue;
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
      if (n > 0) dst[k] = n;
    }
  };
  const table = enemyTable();
  clean(r.enemies, (k) => k in table, out.enemies);
  clean(r.runes, (k) => RUNE_KEYS.includes(k), out.runes);
  return out;
}

/** 最近最常击杀的条目(图鉴首页"战绩"用) */
export function topKills(codex: CodexData, n = 3): Array<{ key: string; name: string; kills: number }> {
  return Object.entries(codex.enemies)
    .filter(([k, v]) => v > 0 && k in enemyTable())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, name: enemyEntry(k)?.name ?? k, kills: v }));
}
