/**
 * 秘境事件规则(2026-09-29,10-FULL-PLAN 轮 22 深化)。
 *
 * 轮 22 之前秘境房**永远是同样三座碑**(血之契约 / 星辰祝福 / 星尘涌泉),玩家第二局就背下来了。
 * 这里把“碑池”与“三选一”提成规则,并补三座新碑:
 *
 * | 碑 | 给什么 | 代价 | 为什么有意思 |
 * |---|---|---|---|
 * | 血之契约 blood | 紫装 | 生命上限 ×0.75 | 拿上限换装等,越早选越划算 |
 * | 星辰祝福 blessing | 攻/移 +10%(本局) | 无 | 白给的爽点,当“安全牌” |
 * | 星尘涌泉 fountain | ✦80~150 | 无 | 也是安全牌,但给的是**局外**成长 |
 * | 赌徒之骰 gamble | 押注 ✦«gambleCost» → «gambleWinChance» 概率 ×«gambleMult» | 输就没了 | 唯一“可能亏”的碑;星尘不够时不封印,可去别处凑 |
 * | 献祭之坛 sacrifice | «sacrificeCons» 瓶消耗品 | 当前生命的 «sacrificeHpFrac»(**不是上限**) | 满血时白嫖,残血时是自杀 |
 * | 陨星残骸 relic | 本职业一枚未拥有符文 | 无(集齐则折星尘) | 符文是局内最稀缺的东西,给一条非商店来路 |
 *
 * 轮 25 补到 **8 座**(验收门:8 个抉择全部有记录可回看):
 *
 * | 回响之碑 echo | 上一次抉择收益的 «echoFrac»(折星尘) | 无 | 让“记录”变成**玩法资源**:选过血之契约之后抽到它才是最值的;没记录则给兜底星尘 |
 * | 疗愈之碑 mend | 立刻回满生命 | 本局生命上限 ×«mendHpMult» | 残血进秘境时的救命稻草 —— 但它是**有代价的安全牌**,满血选就是纯亏(描述里直说) |
 *
 * 展示元数据(图标/名称/描述/颜色)也只有这里一份:**轮 22 的教训** —— 当时 GameScene 自带一张 3 座碑的小表,
 * 而池子有 6 座,抽中新碑就是渲染时 «info.color» 抛错(真崩)。现在 «totemVisual()» 是唯一入口,
 * 有测试守着“每座碑的元数据都齐”。
 *
 * 「可以选/不可以选」一律走 «totemBlocked»(纯函数)—— 菜单里最烦的就是“按了没反应”,
 * 所以每座碑在不能选时都要能说清**为什么**(UI 直接显示这句话)。
 */
import { t } from '@game/i18n';
import type { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import type { ConsumableId } from './Consumables';

const EV = balance.events;

/**
 * 碑 id 以 **balance.events.totems 为权威**(不只是代码里的联合类型):
 * 数据表加一个 id 而代码没实现,«missingTotems» 会立刻报出来(web 测试与 Unity parity 都查)。
 */
export const TOTEM_IDS = EV.totems as readonly string[];
export type TotemKind = 'blood' | 'blessing' | 'fountain' | 'gamble' | 'sacrifice' | 'relic' | 'echo' | 'mend';

/** 代码里真正实现了的碑(顺序无关;与 TOTEM_IDS 对不上就是漏实现) */
export const IMPLEMENTED_TOTEMS: readonly TotemKind[] =
  ['blood', 'blessing', 'fountain', 'gamble', 'sacrifice', 'relic', 'echo', 'mend'];

/** 数据表里有、但代码没实现的碑 id(应为空;非空 = 数据加碑忘了写处理) */
export function missingTotems(): string[] {
  const done = new Set<string>(IMPLEMENTED_TOTEMS);
  return TOTEM_IDS.filter((id) => !done.has(id));
}

const TOTEM_NAMES: Record<TotemKind, string> = {
  echo: 'totem.echo',
  mend: 'totem.mend',
  blood: 'totem.blood',
  blessing: 'totem.blessing',
  fountain: 'totem.fountain',
  gamble: 'totem.gamble',
  sacrifice: 'totem.sacrifice',
  relic: 'totem.relic',
};

export const totemName = (id: string): string =>
  t(TOTEM_NAMES[id as TotemKind] ?? id);

/** 碑的图形记号(渲染层用;数值不在这里) */
export const TOTEM_GLYPH: Record<TotemKind, string> = {
  blood: '🩸', blessing: '✨', fountain: '⛲', gamble: '🎲', sacrifice: '🕯', relic: '☄',
  echo: '🔁', mend: '💚',
};

/** 一句话说清“给我什么、要我什么”(悬停与汇总面板都用它) */
export const TOTEM_DESC: Record<TotemKind, string> = {
  blood: 'totem.blood.desc',
  blessing: 'totem.blessing.desc',
  fountain: 'totem.fountain.desc',
  gamble: 'totem.gamble.desc',
  sacrifice: 'totem.sacrifice.desc',
  relic: 'totem.relic.desc',
  echo: 'totem.echo.desc',
  mend: 'totem.mend.desc',
};

/** desc 键的参数(数值全部来自 balance.json 的 EV,模板与数值分离) */
const TOTEM_DESC_PARAMS: Record<TotemKind, Record<string, string | number>> = {
  blood: { pct: Math.round((1 - EV.bloodHpMult) * 100) },
  blessing: { atk: EV.blessingAtk * 100, spd: EV.blessingSpeed * 100 },
  fountain: { min: EV.fountainMin, max: EV.fountainMax },
  gamble: { cost: EV.gambleCost, mult: EV.gambleMult, pct: (EV.gambleWinChance * 100).toFixed(0) },
  sacrifice: { pct: Math.round(EV.sacrificeHpFrac * 100), n: EV.sacrificeCons },
  relic: {},
  echo: { pct: Math.round(EV.echoFrac * 100), fallback: EV.echoFallbackDust },
  mend: { mult: EV.mendHpMult },
};

export const totemDesc = (k: TotemKind): string => t(TOTEM_DESC[k], TOTEM_DESC_PARAMS[k]);

export const TOTEM_COLOR: Record<TotemKind, string> = {
  blood: '#e05f5f', blessing: '#ffd94f', fountain: '#8fd4c8', gamble: '#c9a0ff',
  sacrifice: '#ffb066', relic: '#B067E8', echo: '#7fd6d6', mend: '#8ee08e',
};

/**
 * 渲染用的唯一入口(图标/名称/描述/颜色)。**不认识 id 时也给一块完整的碑** ——
 * 数据表加了碑而这里没跟上时,宁可显示一块灰色的“未知碑”,也不能在渲染循环里抛错(轮 22 的坑)。
 */
export function totemVisual(id: string): { icon: string; name: string; desc: string; color: string } {
  const k = id as TotemKind;
  if (k in TOTEM_NAMES) {
    return { icon: TOTEM_GLYPH[k], name: t(TOTEM_NAMES[k]), desc: totemDesc(k), color: TOTEM_COLOR[k] };
  }
  return { icon: '🗿', name: id, desc: t('totem.unknown'), color: '#9aa3ad' };
}

/** 抽 totemPick 座碑(不重复);池子比 totemPick 小时按池子大小来 */
export function pickTotems(rng: Rng): TotemKind[] {
  const bag = [...TOTEM_IDS];
  const out: TotemKind[] = [];
  const n = Math.min(EV.totemPick, bag.length);
  while (out.length < n) {
    const i = rng.int(0, bag.length - 1);
    out.push(bag[i] as TotemKind);
    bag.splice(i, 1);
  }
  return out;
}

export interface TotemState {
  /** 当前生命 / 生命上限(比例判断用) */
  hp: number;
  stardust: number;
  /** 本职业未拥有的符文数量(0 = 集齐 → 残骸折星尘) */
  runesLeft: number;
}

export type TotemBlocker = 'noStardust' | 'hpTooLow' | null;

/**
 * 这座碑现在为什么不能选(null = 能选)。
 * - 赌徒之骰:星尘不够就点不动(否则点了“没反应”,玩家以为卡了);
 * - 回响之碑 / 疗愈之碑:没有硬门槛(回响没记录时给兜底星尘;满血选疗愈是亏,但那是玩家的判断,拦下来更烦);
 * - 献祭之坛:生命不足以支付代价时点不动 —— 这条是**安全阀**:
 *   允许残血献祭会直接把人祭死,而 Roguelite 里“手滑点死自己”是最差的一种挫败。
 */
export function totemBlocker(kind: TotemKind, st: TotemState): TotemBlocker {
  if (kind === 'gamble' && st.stardust < EV.gambleCost) return 'noStardust';
  if (kind === 'sacrifice' && st.hp <= Math.max(1, Math.ceil(st.hp * EV.sacrificeHpFrac))) return 'hpTooLow';
  return null;
}

export function totemBlockerText(b: TotemBlocker): string {
  if (b === 'noStardust') return t('totem.blocker.noStardust', { cost: EV.gambleCost });
  if (b === 'hpTooLow') return t('totem.blocker.hpTooLow');
  return '';
}

export type TotemResult =
  | { kind: 'blood'; hpMult: number }
  | { kind: 'blessing'; atk: number; speed: number }
  | { kind: 'fountain'; dust: number }
  | { kind: 'gamble'; spent: number; won: boolean; dust: number; mult: number }
  | { kind: 'sacrifice'; hpCost: number; cons: ConsumableId[] }
  | { kind: 'relic'; runeId: string | null; dust: number }
  | { kind: 'echo'; dust: number; frac: number; fromValue: number }
  | { kind: 'mend'; hpMult: number };

/**
 * 结算一座碑(纯函数:不碰 World,只算“该给什么”)。
 * 随机数一律从参数拿 —— 于是三件事都能测:赌局的两种结果、献祭的代价恰好吃掉三成**当前**生命、
 * 残骸在符文集齐时折成星尘而不是给一个空符文。
 */
export function resolveTotem(
  kind: TotemKind,
  rng: Rng,
  st: TotemState,
  pick: { runeId: string | null; consPool: readonly ConsumableId[]; lastValue: number },
): TotemResult {
  switch (kind) {
    case 'blood':
      return { kind: 'blood', hpMult: EV.bloodHpMult };
    case 'blessing':
      return { kind: 'blessing', atk: EV.blessingAtk, speed: EV.blessingSpeed };
    case 'fountain':
      return { kind: 'fountain', dust: rng.int(EV.fountainMin, EV.fountainMax) };
    case 'gamble': {
      const won = rng.chance(EV.gambleWinChance);
      return {
        kind: 'gamble',
        spent: EV.gambleCost,
        won,
        dust: won ? Math.round(EV.gambleCost * EV.gambleMult) : 0,
        mult: EV.gambleMult,
      };
    }
    case 'sacrifice': {
      const hpCost = Math.max(1, Math.ceil(st.hp * EV.sacrificeHpFrac));
      // 尽量给不同的瓶(同种的第二瓶只能算“刷新”,给三种不重复的才像奖励)
      const out: ConsumableId[] = [];
      const bag = [...pick.consPool];
      while (out.length < EV.sacrificeCons && bag.length > 0) {
        const i = rng.int(0, bag.length - 1);
        out.push(bag[i]);
        bag.splice(i, 1);
      }
      return { kind: 'sacrifice', hpCost, cons: out };
    }
    case 'relic': {
      if (pick.runeId === null) return { kind: 'relic', runeId: null, dust: EV.relicDustFallback };
      return { kind: 'relic', runeId: pick.runeId, dust: 0 };
    }
    case 'echo': {
      // 回响的是**上一次抉择的价值**,不是上一次的物品 —— 复制物品会直接制造“刷装备”的漏洞
      const from = Number.isFinite(pick.lastValue) ? Math.max(0, pick.lastValue) : 0;
      const dust = from > 0 ? Math.round(from * EV.echoFrac) : EV.echoFallbackDust;
      return { kind: 'echo', dust, frac: EV.echoFrac, fromValue: from };
    }
    case 'mend':
      return { kind: 'mend', hpMult: EV.mendHpMult };
    default:
      return { kind: 'fountain', dust: rng.int(EV.fountainMin, EV.fountainMax) };
  }
}

/**
 * 一次抉择值多少星尘(纯函数,记录与回响都读它)。
 * 为什么要把“收益”数值化:① 回响之碑要按半量重放;② 汇总面板要显示“这次秘境赚了多少”;
 * ③ 平衡改动时能一眼看出哪座碑给太多(此前只有散落的 toast 文案,没法比较)。
 * 符文类给的是**机会价值**,按 «repay.rune» 计;赌博输了记负值(面板要能显示“这局亏了”)。
 */
export function repayValue(res: TotemResult, repay = EV.repay): number {
  switch (res.kind) {
    case 'blood': return repay.blood;
    case 'blessing': return repay.blessing;
    case 'fountain': return res.dust;
    case 'gamble': return res.won ? res.dust - res.spent : -res.spent;
    case 'sacrifice': return res.cons.length * repay.cons;
    case 'relic': return res.runeId ? repay.rune : res.dust;
    case 'echo': return res.dust;
    case 'mend': return repay.mend;
  }
}

/**
 * 秘境抉择记录(存档里保留最近 «balance.events.eventLogMax» 条,汇总面板可回看)。
 * «totem» 在类型上是 TotemKind,但**存档读回来的行只保证是字符串**(坏档容忍)—— 所以下面两个函数
 * 用结构性类型(行),让“存档里的行”与“当场记的行”都能进出,不必到处强转。
 */
export interface TotemChoice {
  /** 第几层做的这个抉择(与本局 floor 同口径) */
  floor: number;
  totem: TotemKind;
  /** 星尘当量收益(见 repayValue;可以为负) */
  value: number;
}

/** 结构性行类型:存档里的记录只保证 totem 是字符串(见 migrations 的逐条洗) */
export type TotemRow = { floor: number; totem: string; value: number };

/** 记录押进列表头部,并裁到上限(纯函数:不改入参、坏输入不污染) */
export function pushChoice<T extends TotemRow>(log: readonly T[], c: T, max = EV.eventLogMax): T[] {
  const clean = {
    ...c,
    floor: Number.isFinite(c.floor) ? Math.max(0, Math.floor(c.floor)) : 0,
    value: Number.isFinite(c.value) ? Math.round(c.value) : 0,
  };
  const cap = Math.max(1, Math.floor(max));
  return [clean, ...log].slice(0, cap);
}

/** 汇总:每座碑被选了几次、累计星尘当量(汇总面板的第二栏) */
export function summariseChoices(log: readonly TotemRow[]): {
  counts: Record<string, number>; total: number; byId: Record<string, number>;
} {
  const counts: Record<string, number> = {};
  const byId: Record<string, number> = {};
  let total = 0;
  for (const c of log) {
    counts[c.totem] = (counts[c.totem] ?? 0) + 1;
    byId[c.totem] = (byId[c.totem] ?? 0) + c.value;
    total += c.value;
  }
  return { counts, total, byId };
}
