import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '@engine/ecs/World';
import { dealDamage } from '@game/combat/DamagePipeline';
import {
  ElementMarks, Faction, Health, ReactionEvent, Stats, Transform, type Element,
} from '@game/components';

/**
 * 元素连锁的端到端(管线级)守卫:
 * 两个不同元素先后命中同一目标 → 必须触发反应,且反应事件带上触发它的两种元素
 * (反馈层用这两个元素画图标交汇演出,少了就只剩大字,演出会静默降级)。
 */
function makeTarget(world: World): number {
  const e = world.create();
  world.add(e, new Transform(0, 0));
  world.add(e, new Health(9999));
  world.add(e, new Stats(0, 0, 0, 1, 0));
  world.add(e, new Faction('enemy'));
  world.add(e, new ElementMarks());
  return e;
}

function makeSource(world: World): number {
  const e = world.create();
  world.add(e, new Transform(-40, 0));
  world.add(e, new Faction('player'));
  world.add(e, new Stats(100, 100, 0, 2, 0)); // critRate 0 → 测试可复现
  return e;
}

const hit = (world: World, src: number, tgt: number, element: Element) =>
  dealDamage(world, { source: src, target: tgt, mult: 1, element, hitAngle: 0, canCrit: false });

describe('元素印记 → 连锁反应(管线级)', () => {
  let world: World;
  let src: number;
  let tgt: number;

  beforeEach(() => {
    world = new World();
    src = makeSource(world);
    tgt = makeTarget(world);
  });

  it('单一元素只挂印记,不触发反应', () => {
    hit(world, src, tgt, 'fire');
    expect(world.read(ReactionEvent)).toHaveLength(0);
    const marks = world.mustGet(tgt, ElementMarks);
    expect(marks.marks.fire).toBeGreaterThan(0);
  });

  it('火后冰 → 蒸爆,事件带出 fire/ice 两种元素', () => {
    hit(world, src, tgt, 'fire');
    hit(world, src, tgt, 'ice');
    const events = world.read(ReactionEvent);
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('蒸爆');
    expect([events[0].elA, events[0].elB].sort()).toEqual(['fire', 'ice']);
  });

  it('反应后印记被清空(不会连续二次触发)', () => {
    hit(world, src, tgt, 'bolt');
    hit(world, src, tgt, 'toxin'); // 麻痹
    const marks = world.mustGet(tgt, ElementMarks);
    expect(Object.keys(marks.marks)).toHaveLength(0);
    expect(world.read(ReactionEvent)).toHaveLength(1);
  });

  it('相同元素反复命中不反应,只刷新印记计时', () => {
    hit(world, src, tgt, 'toxin');
    hit(world, src, tgt, 'toxin');
    expect(world.read(ReactionEvent)).toHaveLength(0);
  });

  it('全部 6 组反应对都能带上两种不同元素', () => {
    const pairs: Array<[Element, Element, string]> = [
      ['fire', 'ice', '蒸爆'],
      ['fire', 'bolt', '超载'],
      ['fire', 'toxin', '燃瘴'],
      ['bolt', 'ice', '冻链'],
      ['ice', 'toxin', '脆蚀'],
      ['bolt', 'toxin', '麻痹'],
    ];
    for (const [a, b, name] of pairs) {
      const w = new World();
      const s = makeSource(w);
      const t = makeTarget(w);
      hit(w, s, t, a);
      hit(w, s, t, b);
      const ev = w.read(ReactionEvent);
      expect(ev, `${a}+${b} 未触发反应`).toHaveLength(1);
      expect(ev[0].name).toBe(name);
      expect(ev[0].elA).not.toBe(ev[0].elB);
      expect([ev[0].elA, ev[0].elB].sort()).toEqual([a, b].sort());
    }
  });
});
