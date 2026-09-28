import type { System, World, Entity } from '@engine/ecs/World';
import type { Input } from '@engine/input/Input';
import balance from '@data/balance.json';
import { M, RARITY_COLORS, UI } from '@game/constants';
import {
  EventTotem, Health, Inventory, Pickup, Player, SfxEvent, ToastEvent, Transform, Velocity,
} from '@game/components';
import { recompute } from '@game/loot/Equip';
import type { ItemFactory } from '@game/loot/Items';
import { Rng } from '@engine/core/Rng';

const EV = balance.events;

/**
 * 秘境房三选一图腾:
 * 血之契约(-25%生命上限 → 紫装)/ 星辰祝福(+10%攻速移速,本局)/ 星尘涌泉(+80~150✦)。
 * 选择其一后全部石化。走近按 F。
 */
export class EventSystem implements System {
  nearbyTotem: Entity | null = null;
  private rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);

  constructor(
    private readonly input: Input,
    private readonly factory: ItemFactory,
  ) {}

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
    if (best === null || !this.input.wasPressed('KeyF')) return;

    const totem = world.mustGet(best, EventTotem);
    const tr = world.mustGet(best, Transform);
    switch (totem.kind) {
      case 'blood': {
        p.runHpMult *= EV.bloodHpMult;
        recompute(world, pe);
        if (hp.hp > hp.max) hp.hp = hp.max;
        const item = this.factory.make(
          this.rng.pick(['weapon', 'helmet', 'chest', 'boots', 'ring', 'amulet'] as const), 'epic');
        const drop = world.create();
        world.add(drop, new Transform(tr.x, tr.y + 20));
        world.add(drop, new Velocity());
        world.add(drop, new Pickup('item', item));
        world.emit(new ToastEvent(`🩸 血之契约:生命上限 -25%,获得 ${item.name}`, RARITY_COLORS.epic));
        break;
      }
      case 'blessing': {
        p.runBuffAtk += EV.blessingAtk;
        p.runBuffSpeed += EV.blessingSpeed;
        recompute(world, pe);
        world.emit(new ToastEvent(`✨ 星辰祝福:攻击+${EV.blessingAtk * 100}% 移速+${EV.blessingSpeed * 100}%(本局)`, UI.gold));
        break;
      }
      case 'fountain': {
        const dust = this.rng.int(EV.fountainMin, EV.fountainMax);
        p.stardust += dust;
        world.emit(new ToastEvent(`⛲ 星尘涌泉:+${dust}✦`, UI.gold));
        break;
      }
    }
    world.emit(new SfxEvent('ult'));
    // 三选一:全部封印
    for (const e of world.query(EventTotem)) world.mustGet(e, EventTotem).used = true;
  }
}
