import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { World } from '@engine/ecs/World';
import { Rng } from '@engine/core/Rng';
import { M } from '@game/constants';
import {
  Body, Faction, Health, MidBossHuntress, MidBossReaper, MidBossStag,
  Player, Portal, Stats, Transform, Velocity,
} from '@game/components';
import { RunManager } from '@game/dungeon/RunManager';
import { ItemFactory } from '@game/loot/Items';

/**
 * QA 自动化(轮 43):三章连打模拟 —— 无头跑完整推图回路。
 * 不考战斗数值(那是各系统单测的活),考的是**接线**:
 * 房间序列 → 清房 → 出门 → 踩门换房 → 中 Boss 按章上岗 → 章 Boss → victory。
 * 这里断掉任何一环(清房漏登记/门不生成/序列错位),连打直接卡死报房号。
 */

function mkPlayer(w: World): number {
  const pe = w.create();
  w.add(pe, new Transform(4 * M, (balance.arena.heightM / 2) * M));
  w.add(pe, new Velocity());
  w.add(pe, new Body(0.3));
  w.add(pe, new Health(99999));
  w.add(pe, new Stats(999, 4.2, 0.05, 1.8, 0));
  w.add(pe, new Faction('player'));
  w.add(pe, new Player());
  return pe;
}

/** 清掉本房全部敌人(模拟"打赢了";波次一并掏空) */
function slayAll(w: World, run: RunManager): void {
  (run as unknown as { pendingWaves: number }).pendingWaves = 0;
  for (const e of w.query(Faction)) {
    if (w.mustGet(e, Faction).team === 'enemy') w.destroy(e);
  }
  w.flushDestroyed();
}

function playChapter(chapter: 1 | 2 | 3): { rooms: string[]; sawMid: boolean } {
  const w = new World();
  const pe = mkPlayer(w);
  const run = new RunManager(new ItemFactory(new Rng(20260930 + chapter)));
  run.chapter = chapter;
  run.startRoom(w, 'battle', pe);
  const rooms: string[] = [run.roomKind];
  let sawMid = false;
  let guard = 4000;

  while (guard-- > 0) {
    // 中 Boss 按章上岗(在场时立刻验明正身)
    if (run.roomKind === 'midboss') {
      const hit = chapter === 1 ? w.count(MidBossStag)
        : chapter === 2 ? w.count(MidBossHuntress) : w.count(MidBossReaper);
      expect(hit, `第 ${chapter} 章中 Boss 用错了(房 ${run.depth})`).toBe(1);
      sawMid = true;
    }
    slayAll(w, run);
    const outcome = run.update(w, 1 / 60, pe);
    if (outcome === 'victory') return { rooms, sawMid };
    expect(outcome, `第 ${chapter} 章第 ${run.depth} 房出了非法结局`).toBe('playing');
    // 门开了就踩第一扇(选路点固定走第一支)
    const portals = w.query(Portal);
    if (portals.length > 0) {
      const ptr = w.mustGet(pe, Transform);
      const door = w.mustGet(portals[0], Transform);
      ptr.x = door.x;
      ptr.y = door.y;
      const before = run.depth;
      run.update(w, 1 / 60, pe);
      if (run.depth !== before) rooms.push(run.roomKind);
    }
  }
  throw new Error(`第 ${chapter} 章连打卡死在第 ${run.depth} 房(${run.roomKind}):${rooms.join('→')}`);
}

describe('三章连打模拟(轮 43:推图回路无头全跑)', () => {
  for (const ch of [1, 2, 3] as const) {
    it(`第 ${ch} 章:一路打到 victory,中 Boss 按章上岗,房数对表`, () => {
      const { rooms, sawMid } = playChapter(ch);
      expect(sawMid, `第 ${ch} 章没遇到中 Boss`).toBe(true);
      expect(rooms[rooms.length - 1], '最后一房必须是章 Boss').toBe('boss');
      expect(rooms.length, `房序列:${rooms.join('→')}`).toBe(balance.rooms.count + 1);
      expect(rooms.filter((k) => k === 'midboss')).toHaveLength(1);
      expect(rooms.filter((k) => k === 'boss')).toHaveLength(1);
    });
  }
});
