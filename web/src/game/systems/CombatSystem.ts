import type { System, World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import {
  Body, Dummy, Faction, Health, HitEvent, KillEvent, MeleeSweep, Shroomling, Stats, Transform,
} from '@game/components';

/**
 * 伤害解析(Phase 1 精简版管线):
 * MeleeSweep → 扇形命中判定 → 攻方加成+暴击 → 上伤害 → 反馈事件 → 死亡/掉落。
 * Phase 2 扩展为完整 DamageIntent 管线(词条聚合/减免/元素反应),见 docs/02 §5。
 */
export class CombatSystem implements System {
  update(world: World, _dt: number): void {
    for (const sweep of world.read(MeleeSweep)) {
      const stats = world.get(sweep.source, Stats);
      if (!stats) continue;

      for (const target of world.query(Health, Transform, Body, Faction)) {
        if (target === sweep.source) continue;
        const fac = world.mustGet(target, Faction);
        if (fac.team === 'player') continue; // 玩家不打自己;敌我判定 Phase 2 泛化

        const ttr = world.mustGet(target, Transform);
        const tbody = world.mustGet(target, Body);
        const dx = ttr.x - sweep.x;
        const dy = ttr.y - sweep.y;
        const dist = Math.hypot(dx, dy);
        if (dist - tbody.radius * M > sweep.rangePx) continue;

        // 扇形角判定(目标中心相对挥砍方向)
        let dAng = Math.atan2(dy, dx) - sweep.angle;
        while (dAng > Math.PI) dAng -= Math.PI * 2;
        while (dAng < -Math.PI) dAng += Math.PI * 2;
        if (Math.abs(dAng) > sweep.arcRad / 2 + Math.atan2(tbody.radius * M, Math.max(dist, 1))) continue;

        // ---- 伤害计算(公式对齐 docs/03 §3,Phase 1 无防御项) ----
        const crit = Math.random() < stats.critRate;
        const amount = Math.max(1, Math.round(stats.atk * sweep.mult * (crit ? stats.critDmg : 1)));

        const hp = world.mustGet(target, Health);
        hp.flash = balance.feel.flashSec;

        const hitAngle = Math.atan2(dy, dx);
        const dummy = world.get(target, Dummy);
        if (dummy) {
          // 木桩:不死,只记录 DPS 并晃动
          dummy.hits.push([performance.now(), amount]);
          dummy.wobble = Math.min(dummy.wobble + 0.5, 1);
          world.emit(new HitEvent(ttr.x, ttr.y - 20, amount, crit, false, hitAngle));
          continue;
        }

        hp.hp -= amount;
        const kill = hp.hp <= 0;

        // 三段击退 / 击杀击退
        const shroom = world.get(target, Shroomling);
        if (shroom && (sweep.stage === 3 || kill)) {
          const kb = balance.player.combo.knockback3 * M;
          shroom.kx += Math.cos(hitAngle) * kb;
          shroom.ky += Math.sin(hitAngle) * kb;
        }

        world.emit(new HitEvent(ttr.x, ttr.y - 14, amount, crit, kill, hitAngle));
        if (kill) {
          world.emit(new KillEvent(ttr.x, ttr.y));
          world.destroy(target);
        }
      }
    }
  }
}
