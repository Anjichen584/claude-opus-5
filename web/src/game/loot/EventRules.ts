/**
 * 秘境事件规则(2026-09-29,10-FULL-PLAN 轮 22 深化)。
 *
 * 轮 22 之前秘境房**永远是同样三座碑**(血之契约 / 星辰祝福 / 星尘涌泉),玩家第二局就背下来了。
 * 这里把"碑池"与"三选一"提成规则,并补三座新碑:
 *
 * | 碑 | 给什么 | 代价 | 为什么有意思 |
 * |---|---|---|---|
 * | 血之契约 blood | 紫装 | 生命上限 ×0.75 | 拿上限换装等,越早选越划算 |
 * | 星辰祝福 blessing | 攻/移 +10%(本局) | 无 | 白给的爽点,当"安全牌" |
 * | 星尘涌泉 fountain | ✦80~150 | 无 | 也是安全牌,但给的是**局外**成长 |
 * | 赌徒之骰 gamble | 押注 ✦`gambleCost` → `gambleWinChance` 概率 ×`gambleMult` | 输就没了 | 唯一"可能亏"的碑;星尘不够时不封印,可去别处凑 |
 * | 献祭之坛 sacrifice | `sacrificeCons` 瓶消耗品 | 当前生命的 `sacrificeHpFrac`(**不是上限**) | 满血时白嫖,残血时是自杀 |
 * | 陨星残骸 relic | 本职业一枚未拥有符文 | 无(集齐则折星尘) | 符文是局内最稀缺的东西,给一条非商店来路 |
 *
 * 「可以选/不可以选」一律走 `totemBlocked`(纯函数)—— 菜单里最烦的就是"按了没反应",
 * 所以每座碑在不能选时都要能说清**为什么**(UI 直接显示这句话)。
 */
import type { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import type { ConsumableId } from './Consumables';

const EV = balance.events;

/**
 * 碑 id 以 **balance.events.totems 为权威**(不只是代码里的联合类型):
 * 数据表加一个 id 而代码没实现,`missingTotems` 会立刻报出来(web 测试与 Unity parity 都查)。
 */
export const TOTEM_IDS = EV.totems as readonly string[];
export type TotemKind = 'blood' | 'blessing' | 'fountain' | 'gamble' | 'sacrifice' | 'relic';

/** 代码里真正实现了的碑(顺序无关;与 TOTEM_IDS 对不上就是漏实现) */
export const IMPLEMENTED_TOTEMS: readonly TotemKind[] =
  ['blood', 'blessing', 'fountain', 'gamble', 'sacrifice', 'relic'];

/** 数据表里有、但代码没实现的碑 id(应为空;非空 = 数据加碑忘了写处理) */
export function missingTotems(): string[] {
  const done = new Set<string>(IMPLEMENTED_TOTEMS);
  return TOTEM_IDS.filter((id) => !done.has(id));
}

const TOTEM_NAMES: Record<TotemKind, string> = {
  blood: '血之契约',
  blessing: '星辰祝福',
  fountain: '星尘涌泉',
  gamble: '赌徒之骰',
  sacrifice: '献祭之坛',
  relic: '陨星残骸',
};

export const totemName = (id: string): string =>
  TOTEM_NAMES[id as TotemKind] ?? id;

/** 碑的图形记号(渲染层用;数值不在这里) */
export const TOTEM_GLYPH: Record<TotemKind, string> = {
  blood: '🩸', blessing: '✨', fountain: '⛲', gamble: '🎲', sacrifice: '🕯', relic: '☄',
};

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
 * - 赌徒之骰:星尘不够就点不动(否则点了"没反应",玩家以为卡了);
 * - 献祭之坛:生命不足以支付代价时点不动 —— 这条是**安全阀**:
 *   允许残血献祭会直接把人祭死,而 Roguelite 里"手滑点死自己"是最差的一种挫败。
 */
export function totemBlocker(kind: TotemKind, st: TotemState): TotemBlocker {
  if (kind === 'gamble' && st.stardust < EV.gambleCost) return 'noStardust';
  if (kind === 'sacrifice' && st.hp <= Math.max(1, Math.ceil(st.hp * EV.sacrificeHpFrac))) return 'hpTooLow';
  return null;
}

export function totemBlockerText(b: TotemBlocker): string {
  if (b === 'noStardust') return `星尘不足(需 ✦${EV.gambleCost})`;
  if (b === 'hpTooLow') return '生命不足:献祭会直接要命';
  return '';
}

export type TotemResult =
  | { kind: 'blood'; hpMult: number }
  | { kind: 'blessing'; atk: number; speed: number }
  | { kind: 'fountain'; dust: number }
  | { kind: 'gamble'; spent: number; won: boolean; dust: number; mult: number }
  | { kind: 'sacrifice'; hpCost: number; cons: ConsumableId[] }
  | { kind: 'relic'; runeId: string | null; dust: number };

/**
 * 结算一座碑(纯函数:不碰 World,只算"该给什么")。
 * 随机数一律从参数拿 —— 于是三件事都能测:赌局的两种结果、献祭的代价恰好吃掉三成**当前**生命、
 * 残骸在符文集齐时折成星尘而不是给一个空符文。
 */
export function resolveTotem(
  kind: TotemKind,
  rng: Rng,
  st: TotemState,
  pick: { runeId: string | null; consPool: readonly ConsumableId[] },
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
      // 尽量给不同的瓶(同种的第二瓶只能算"刷新",给三种不重复的才像奖励)
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
    default:
      return { kind: 'fountain', dust: rng.int(EV.fountainMin, EV.fountainMax) };
  }
}
