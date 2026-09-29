import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { Rng } from '@engine/core/Rng';
import {
  applyRules, auditLayout, buildLayout, floorOf, floorPalette, insideWater, isBlockedAt,
  isSolid, LAYOUT_IDS, LAYOUT_LABELS, LAYOUT_RULES, pickLayout, propRadius,
  type LayoutCtx, type LayoutId, type PlacedProp,
} from '../RoomLayouts';

const W = balance.arena.widthM;
const H = balance.arena.heightM;

const ctxOf = (seed: number, reserved: LayoutCtx['reserved'] = []): LayoutCtx => ({
  rng: new Rng(seed), widthM: W, heightM: H, reserved,
});

const solidsOf = (props: readonly PlacedProp[]): PlacedProp[] => props.filter((p) => isSolid(p.pk));
const minPairDist = (props: readonly PlacedProp[]): number => {
  let min = Infinity;
  for (let i = 0; i < props.length; i++) {
    for (let j = i + 1; j < props.length; j++) {
      min = Math.min(min, Math.hypot(props[i].xM - props[j].xM, props[i].yM - props[j].yM));
    }
  }
  return min;
};

describe('房间布局模板', () => {
  it('九个模板都有中文名,且都能摆出东西', () => {
    expect(LAYOUT_IDS).toHaveLength(9);
    expect(new Set(LAYOUT_IDS).size).toBe(9);
    for (const id of LAYOUT_IDS) {
      expect(LAYOUT_LABELS[id]).toBeTruthy();
      const res = buildLayout(id, ctxOf(7));
      expect(res.props.length, id).toBeGreaterThan(0);
      expect(res.id).toBe(id);
    }
  });

  it('每个模板 × 多种子都通过摆放规则审计', () => {
    for (const id of LAYOUT_IDS) {
      for (const seed of [1, 2, 3, 99, 20260929]) {
        const ctx = ctxOf(seed, [{ xM: 14, yM: 8, rM: 1.5 }]);
        const bad = auditLayout(buildLayout(id, ctx), ctx);
        expect(bad, `${id}@${seed} → ${bad.join(' / ')}`).toEqual([]);
      }
    }
  });

  it('出入口净空:左右两头不放实心物件(玩家落点 2.5m,传送门 W-2)', () => {
    for (const id of LAYOUT_IDS) {
      const res = buildLayout(id, ctxOf(5));
      for (const p of solidsOf(res.props)) {
        if (p.role === 'wall') continue;
        expect(p.xM, `${id} 入口`).toBeGreaterThanOrEqual(LAYOUT_RULES.entryClearXM);
        expect(p.xM, `${id} 出口`).toBeLessThanOrEqual(W - LAYOUT_RULES.exitClearXM);
      }
    }
  });

  it('交互净空:摊位/石碑周围不放实心物件(商品不被树挡住)', () => {
    const reserved = [{ xM: 10, yM: 8, rM: 1.4 }, { xM: 15, yM: 10, rM: 1.4 }];
    for (const id of LAYOUT_IDS) {
      const res = buildLayout(id, ctxOf(11, reserved));
      for (const p of solidsOf(res.props)) {
        for (const r of reserved) {
          expect(Math.hypot(p.xM - r.xM, p.yM - r.yM), `${id} 压住摊位`).toBeGreaterThanOrEqual(
            r.rM + LAYOUT_RULES.reservedClearM - 1e-9,
          );
        }
      }
    }
  });

  it('可穿行:松散实心件两两间距 ≥ minGapM(否则会连成墙堵死走位)', () => {
    for (const id of LAYOUT_IDS) {
      const res = buildLayout(id, ctxOf(3));
      const loose = res.props.filter((p) => p.role === 'loose' && isSolid(p.pk));
      if (loose.length < 2) continue;
      expect(minPairDist(loose), id).toBeGreaterThanOrEqual(LAYOUT_RULES.minGapM);
    }
    // 数值本身也要立得住:间距必须大于"岩 + 玩家"直径
    const need = 2 * (balance.props.rock.bodyRadius + balance.player.bodyRadius);
    expect(LAYOUT_RULES.minGapM).toBeGreaterThan(need);
  });

  it('窄道:两道岩墙夹出走廊,墙体是砌死的,门洞够宽,中央不堵', () => {
    const res = buildLayout('narrow', ctxOf(17));
    const walls = res.props.filter((p) => p.role === 'wall');
    expect(walls.length).toBeGreaterThanOrEqual(16);
    // 墙砖间距 < 2×(岩 + 玩家) = 1.44 → 钻不过去
    const need = 2 * (balance.props.rock.bodyRadius + balance.player.bodyRadius);
    expect(LAYOUT_RULES.wallSpacingM).toBeLessThan(need);
    const rows = new Map<string, number[]>();
    for (const p of walls) {
      const key = p.yM.toFixed(2);
      rows.set(key, [...(rows.get(key) ?? []), p.xM]);
    }
    expect(rows.size).toBe(2); // 上下两道
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      let widest = 0;
      for (let i = 1; i < xs.length; i++) {
        const step = xs[i] - xs[i - 1];
        widest = Math.max(widest, step);
        if (step > need) continue; // 这是门洞,跳过
        expect(step).toBeLessThan(need);
      }
      expect(widest, '每道墙都要有门洞').toBeGreaterThan(need);
    }
    for (const p of solidsOf(res.props)) {
      expect(Math.abs(p.yM - H / 2), '走廊里不许有实心件').toBeGreaterThanOrEqual(
        LAYOUT_RULES.minCorridorM / 2 + propRadius('rock') - 1e-9,
      );
    }
  });

  it('环形擂台:中央是空场,外圈有环形排布', () => {
    const res = buildLayout('ring', ctxOf(23));
    const cx = W * 0.58;
    const cy = H / 2;
    const rad = Math.min(W, H) * 0.28;
    const ring = solidsOf(res.props);
    expect(ring.length).toBeGreaterThanOrEqual(6);
    for (const p of ring) {
      expect(Math.hypot(p.xM - cx, p.yM - cy), '中央空场').toBeGreaterThan(rad * 0.8);
    }
  });

  it('溪畔浅滩:水带横穿房间,水面不立树石,两岸有芦苇', () => {
    const res = buildLayout('shore', ctxOf(31));
    expect(res.floor.kind).toBe('water');
    expect(res.floor.shape).toBe('band');
    for (const p of solidsOf(res.props)) {
      expect(insideWater(res.floor, p.xM, p.yM, 0.3), `水里立了 ${p.pk}`).toBe(false);
    }
    const reeds = res.props.filter((p) => p.role === 'reed');
    expect(reeds.length).toBeGreaterThanOrEqual(12);
    // 芦苇不挡路(bush 碰撞半径 0)
    expect(propRadius('bush')).toBe(0);
  });

  it('同一种子完全可复现,换种子会换样子', () => {
    for (const id of LAYOUT_IDS) {
      const a = JSON.stringify(buildLayout(id, ctxOf(2024)));
      const b = JSON.stringify(buildLayout(id, ctxOf(2024)));
      expect(a, id).toBe(b);
    }
    const c = JSON.stringify(buildLayout('scatter', ctxOf(1)).props);
    const d = JSON.stringify(buildLayout('scatter', ctxOf(2)).props);
    expect(c).not.toBe(d);
  });

  it('规则过滤是幂等的:再跑一遍不会再掉件', () => {
    for (const id of LAYOUT_IDS) {
      const ctx = ctxOf(41);
      const once = buildLayout(id, ctx);
      const twice = applyRules(once.props, ctx, once.floor);
      expect(twice.length, id).toBe(once.props.length);
    }
  });

  it('未知模板名回退到散布(运行时不留 undefined)', () => {
    const res = buildLayout('nope' as LayoutId, ctxOf(9));
    expect(res.id).toBe('scatter');
    expect(res.props.length).toBeGreaterThan(0);
  });

  it('物件总量收敛在上限内', () => {
    for (const id of LAYOUT_IDS) {
      for (const seed of [1, 5, 50]) {
        const res = buildLayout(id, ctxOf(seed));
        expect(res.props.length, `${id}@${seed}`).toBeLessThanOrEqual(LAYOUT_RULES.maxProps);
        const loose = res.props.filter((p) => p.role === 'loose' && isSolid(p.pk));
        expect(loose.length).toBeLessThanOrEqual(LAYOUT_RULES.maxLooseSolids);
      }
    }
  });

  it('isBlockedAt 能挡住石头,放行空地(出怪点避开障碍用)', () => {
    const ctx = ctxOf(13);
    const res = buildLayout('pillars', ctx);
    const rock = res.props.find((p) => p.pk === 'rock')!;
    expect(isBlockedAt(res, rock.xM, rock.yM)).toBe(true);
    expect(isBlockedAt(res, 2.5, H / 2)).toBe(false); // 入口
    expect(isBlockedAt(null, 2.5, H / 2)).toBe(false);
  });
});

describe('房间类型 → 模板', () => {
  it('战斗房按权重抽,七个战斗模板都点得到', () => {
    const seen = new Map<string, number>();
    const rng = new Rng(2026);
    for (let i = 0; i < 4000; i++) {
      const id = pickLayout('battle', rng);
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const id of LAYOUT_IDS) {
      if (id === 'boss' || id === 'calm') continue;
      expect(seen.get(id) ?? 0, `${id} 抽不到`).toBeGreaterThan(0);
    }
    expect(seen.get('boss') ?? 0).toBe(0);
  });

  it('精英房不出散布(要地形),Boss 房给 Boss 场,商店/秘境给静谧房', () => {
    const rng = new Rng(88);
    for (let i = 0; i < 200; i++) {
      expect(pickLayout('elite', rng)).not.toBe('scatter');
      expect(pickLayout('boss', rng)).toBe('boss');
      expect(pickLayout('calm', rng)).toBe('calm');
    }
  });

  it('balance 的 byKind / combatWeights 没有死条目,且模板清单都点得到名字', () => {
    const ids = new Set<string>(LAYOUT_IDS);
    for (const [kind, list] of Object.entries(balance.layouts.byKind)) {
      expect(list.length, kind).toBeGreaterThan(0);
      for (const id of list) expect(ids.has(id), `${kind} 里的 ${id}`).toBe(true);
    }
    for (const [id, w] of Object.entries(balance.layouts.combatWeights)) {
      expect(ids.has(id), id).toBe(true);
      expect(w, id).toBeGreaterThan(0);
    }
    expect(balance.layouts.byKind.battle.sort()).toEqual(Object.keys(balance.layouts.combatWeights).sort());
  });
});

describe('地面装饰', () => {
  it('九个模板都有地面定义,band/blob 尺寸合法', () => {
    for (const id of LAYOUT_IDS) {
      const f = floorOf(id, W, H);
      expect(f.shape === 'band' || f.shape === 'blob').toBe(true);
      if (f.kind === 'none') continue;
      expect(f.wM, id).toBeGreaterThan(0);
      expect(f.hM, id).toBeGreaterThan(0);
      expect(f.xM - f.wM / 2, id).toBeGreaterThan(0);
      expect(f.xM + f.wM / 2, id).toBeLessThan(W);
    }
  });

  it('浅滩的水带 / 窄道的土路落在房间中段', () => {
    expect(floorOf('shore', W, H).kind).toBe('water');
    expect(floorOf('narrow', W, H).kind).toBe('path');
    expect(insideWater(floorOf('shore', W, H), W / 2, H * 0.62)).toBe(true);
    expect(insideWater(floorOf('shore', W, H), W / 2, 2)).toBe(false);
    // 土路在走廊里,不会被墙压住
    const lane = floorOf('narrow', W, H);
    expect(lane.hM / 2).toBeLessThan(LAYOUT_RULES.minCorridorM / 2 + 1.5);
  });

  it('配色:按章节换材质,none 不画', () => {
    expect(floorPalette('none', 1)).toBeNull();
    for (const kind of ['water', 'moss', 'sand', 'path'] as const) {
      const colors = [1, 2, 3].map((ch) => floorPalette(kind, ch as 1 | 2 | 3));
      for (const c of colors) {
        expect(c).not.toBeNull();
        for (const hex of [c!.base, c!.edge, c!.spark]) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      }
      // 雪原的水比林地的水更浅(不至于全是同一种颜色)
      expect(colors[1]!.base).not.toBe(colors[0]!.base);
    }
  });
});
