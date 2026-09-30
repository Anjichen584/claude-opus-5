import { t } from '@game/i18n';
import type { System, World, Entity } from '@engine/ecs/World';
import type { Input } from '@engine/input/Input';
import { M, RARITY_COLORS, UI } from '@game/constants';
import {
  EventTotem, Health, Inventory, Pickup, Player, SfxEvent, ToastEvent, Transform, Velocity,
} from '@game/components';
import { CONSUMABLE_IDS, CONS_VISUAL, consumableDef } from '@game/loot/Consumables';
import {
  totemBlocker, totemBlockerText, totemName, resolveTotem, repayValue,
  type TotemChoice, type TotemKind,
} from '@game/loot/EventRules';
import { RUNE_POOL } from '@game/skills/SkillSystem';
import { recompute } from '@game/loot/Equip';
import type { ItemFactory } from '@game/loot/Items';
import { Rng } from '@engine/core/Rng';
import { bindOf } from '@game/meta/Bindings';

/**
 * 秘境房三选一图腾(轮 22 深化):碑池 6 座,每次抽 3 座(见 loot/EventRules.ts 的表)。
 * 结算走纯函数 «resolveTotem»,所以“该给什么”不写在这里 —— 这里只负责**落到世界**(改组件/掉东西/发提示)。
 * 选择其一后全部石化;不能选的碑(星尘不足/会把自己祭死)会明确说出原因。
 */
export class EventSystem implements System {
  nearbyTotem: Entity | null = null;
  /** 本局做过的秘境抉择(轮 25:汇总面板与回响之碑都读它) */
  readonly choices: TotemChoice[] = [];
  private rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);

  constructor(
    private readonly input: Input,
    private readonly factory: ItemFactory,
    /** 每次抉择后立刻回调(宿主负责落存档:中途退出也不丢记录) */
    private readonly onChoice?: (c: TotemChoice) => void,
    /** 当前层(宿主给:«() => run.floor»);拿不到就记 0,不猜 */
    private readonly floorOf?: () => number,
  ) {}

  /** 本职业还没拿到的符文里随机一枚(集齐返回 null → 残骸折星尘) */
  private pickUnusedRune(world: World, pe: Entity): string | null {
    const p = world.mustGet(pe, Player);
    const prefix = `${p.klass}_`;
    const bag = [...RUNE_POOL.values()].filter((r) => r.skill.startsWith(prefix) && !p.runeBag.includes(r.id));
    if (bag.length === 0) return null;
    return this.rng.pick(bag).id;
  }

  private runesLeft(world: World, pe: Entity): number {
    const p = world.mustGet(pe, Player);
    const prefix = `${p.klass}_`;
    return [...RUNE_POOL.values()].filter((r) => r.skill.startsWith(prefix) && !p.runeBag.includes(r.id)).length;
  }

  update(world: World, dt: number): void {
    this.nearbyTotem = null;
    const players = world.query(Player, Transform, Health, Inventory);
    if (players.length === 0) return;
    const pe = players[0];
    const p = world.mustGet(pe, Player);
    const ptr = world.mustGet(pe, Transform);
    const hp = world.mustGet(pe, Health);

    let best: Entity | null = null;
    let bestD = 1.1 * M;
    for (const e of world.query(EventTotem, Transform)) {
      const t = world.mustGet(e, EventTotem);
      t.animT += dt;
      if (t.used) continue;
      const tr = world.mustGet(e, Transform);
      const d = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    this.nearbyTotem = best;
    if (best === null || !(this.input.wasPressed(bindOf('interact')) || this.input.wasPressed('PadB'))) return;

    const totem = world.mustGet(best, EventTotem);
    const tr = world.mustGet(best, Transform);
    const kind = totem.kind as TotemKind;

    // 先问“能不能选”(纯函数):不能选就说清原因,而且**不封印**别的碑(玩家可以改选)
    const blocker = totemBlocker(kind, { hp: hp.hp, stardust: p.stardust, runesLeft: this.runesLeft(world, pe) });
    if (blocker !== null) {
      world.emit(new ToastEvent(`${totemName(kind)}:${totemBlockerText(blocker)}`, UI.dim));
      return;
    }

    const res = resolveTotem(kind, this.rng, { hp: hp.hp, stardust: p.stardust, runesLeft: 0 }, {
      runeId: this.pickUnusedRune(world, pe),
      consPool: CONSUMABLE_IDS,
      // 回响之碑要“上一次抉择值多少”(本局内累计;没记录 = 0 → 走兜底星尘)
      lastValue: this.choices.length > 0 ? this.choices[0].value : 0,
    });

    switch (res.kind) {
      case 'blood': {
        p.runHpMult *= res.hpMult;
        recompute(world, pe);
        if (hp.hp > hp.max) hp.hp = hp.max;
        const item = this.factory.make(
          this.rng.pick(['weapon', 'helmet', 'chest', 'boots', 'ring', 'amulet'] as const), 'epic');
        const drop = world.create();
        world.add(drop, new Transform(tr.x, tr.y + 20));
        world.add(drop, new Velocity());
        world.add(drop, new Pickup('item', item));
        world.emit(new ToastEvent(t('ev.blood', { mult: res.hpMult, name: item.name }), RARITY_COLORS.epic));
        break;
      }
      case 'blessing': {
        p.runBuffAtk += res.atk;
        p.runBuffSpeed += res.speed;
        recompute(world, pe);
        world.emit(new ToastEvent(t('ev.blessing', { atk: res.atk * 100, spd: res.speed * 100 }), UI.gold));
        break;
      }
      case 'fountain': {
        p.stardust += res.dust;
        world.emit(new ToastEvent(t('ev.fountain', { dust: res.dust }), UI.gold));
        break;
      }
      case 'gamble': {
        p.stardust -= res.spent;
        p.stardust += res.dust;
        world.emit(new ToastEvent(
          res.won ? t('ev.gamble.win', { spent: res.spent, dust: res.dust, mult: res.mult }) : t('ev.gamble.lose', { spent: res.spent }),
          res.won ? UI.gold : UI.hpLow));
        break;
      }
      case 'sacrifice': {
        hp.hp = Math.max(1, hp.hp - res.hpCost);   // 安全阀:无论如何留一口气
        for (const id of res.cons) p.consumables.push(id);
        const names = res.cons.map((id) => consumableDef(id)?.name ?? id).join(', ');
        world.emit(new ToastEvent(t('ev.sacrifice', { hp: res.hpCost, names }), CONS_VISUAL.shield.color));
        break;
      }
      case 'echo': {
        p.stardust += res.dust;
        world.emit(new ToastEvent(
          res.fromValue > 0
            ? t('ev.echo', { pct: Math.round(res.frac * 100), dust: res.dust })
            : t('ev.echo.none', { dust: res.dust }),
          '#7fd6d6'));
        break;
      }
      case 'mend': {
        // 代价是**上限**(不是当前血):回满血 + 上限 ×0.85 —— 满血时选它就是纯亏,描述里直说
        p.runHpMult *= res.hpMult;
        recompute(world, pe);
        hp.hp = hp.max;
        world.emit(new ToastEvent(t('ev.mend', { mult: res.hpMult }), '#8ee08e'));
        break;
      }
      case 'relic': {
        if (res.runeId) {
          p.runeBag.push(res.runeId);
          const rune = RUNE_POOL.get(res.runeId);
          world.emit(new ToastEvent(t('ev.relic', { name: rune?.name ?? res.runeId }), '#B067E8'));
        } else {
          p.stardust += res.dust;
          world.emit(new ToastEvent(t('ev.relic.ash', { dust: res.dust }), UI.dim));
        }
        break;
      }
    }
    // 抉择记录(轮 25):floor 用本局的房间计数口径;value 是星尘当量,回响与汇总面板都读
    const choice: TotemChoice = {
      floor: Math.max(0, Math.floor(this.floorOf?.() ?? 0)),
      totem: kind,
      value: repayValue(res),
    };
    this.choices.unshift(choice);
    this.onChoice?.(choice);

    world.emit(new SfxEvent('ult'));
    // 三选一:全部封印
    for (const e of world.query(EventTotem)) world.mustGet(e, EventTotem).used = true;
  }
}
