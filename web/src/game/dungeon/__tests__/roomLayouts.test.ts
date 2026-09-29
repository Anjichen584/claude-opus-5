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
  it('14 个模板都有中文名,且都能摆出东西', () => {
    expect(LAYOUT_IDS).toHaveLength(14);
    expect(new Set(LAYOUT_IDS).size).toBe(14);
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
  it('战斗房按**章节**权重抽:每章权重里的模板都点得到,不该出的抽不到', () => {
    const rng = new Rng(2026);
    for (const chapter of [1, 2, 3] as const) {
      const seen = new Map<string, number>();
      for (let i = 0; i < 3000; i++) {
        const id = pickLayout('battle', rng, chapter);
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      const weights = balance.layouts.chapterWeights[String(chapter) as '1' | '2' | '3'];
      for (const id of Object.keys(weights)) {
        expect(seen.get(id) ?? 0, `第 ${chapter} 章抽不到 ${id}`).toBeGreaterThan(0);
      }
      expect(seen.get('boss') ?? 0, `第 ${chapter} 章不该出 boss 场`).toBe(0);
      expect(seen.get('calm') ?? 0, `第 ${chapter} 章不该出静谧房`).toBe(0);
    }
  });

  it('地貌分章:第一章抽不到冰原/荒漠模板,二章出冰原词、三章出荒漠词', () => {
    const cold = ['icefield', 'drift', 'crystal'];
    const hot = ['dunes', 'ruins'];
    const rng = new Rng(4242);
    const pick = (chapter: 1 | 2 | 3, n: number): Set<string> => {
      const s = new Set<string>();
      for (let i = 0; i < n; i++) s.add(pickLayout('battle', rng, chapter));
      return s;
    };
    const ch1 = pick(1, 2000);
    for (const id of [...cold, ...hot]) expect(ch1.has(id), `第一章不该出 ${id}`).toBe(false);
    const ch2 = pick(2, 2000);
    expect(cold.some((id) => ch2.has(id)), '第二章应当出冰原地貌').toBe(true);
    for (const id of hot) expect(ch2.has(id), `第二章不该出 ${id}`).toBe(false);
    const ch3 = pick(3, 2000);
    expect(hot.some((id) => ch3.has(id)), '第三章应当出荒漠地貌').toBe(true);
    for (const id of cold) expect(ch3.has(id), `第三章不该出 ${id}`).toBe(false);
  });

  it('精英房不出散布(要地形),Boss 房给 Boss 场,商店/秘境给静谧房', () => {
    const rng = new Rng(88);
    for (let i = 0; i < 200; i++) {
      expect(pickLayout('elite', rng)).not.toBe('scatter');
      expect(pickLayout('boss', rng)).toBe('boss');
      expect(pickLayout('calm', rng)).toBe('calm');
    }
  });

  it('balance 的 byKind / 章节权重没有死条目,且模板清单都点得到名字', () => {
    const ids = new Set<string>(LAYOUT_IDS);
    for (const [kind, list] of Object.entries(balance.layouts.byKind)) {
      expect(list.length, kind).toBeGreaterThan(0);
      for (const id of list) expect(ids.has(id), `${kind} 里的 ${id}`).toBe(true);
    }
    for (const chapter of ['1', '2', '3']) {
      const weights = (balance.layouts.chapterWeights as Record<string, Record<string, number>>)[chapter];
      expect(Object.keys(weights).length, `第 ${chapter} 章权重表`).toBeGreaterThan(0);
      for (const [id, w] of Object.entries(weights)) {
        expect(ids.has(id), `第 ${chapter} 章的 ${id}`).toBe(true);
        expect(w, `${chapter}.${id}`).toBeGreaterThan(0);
      }
    }
    // 兼容线:第一章权重必须等于老的 combatWeights(旧存档/旧代码都读它)
    expect(balance.layouts.chapterWeights['1']).toEqual(balance.layouts.combatWeights);
    // 模板清单的并集 = 全部模板(不许有"谁都不引用"的死模板,允许 boss/calm 走 byKind)
    const referenced = new Set<string>([
      ...Object.values(balance.layouts.byKind).flat(),
      ...Object.values(balance.layouts.chapterWeights).flatMap((w) => Object.keys(w)),
    ]);
    expect([...ids].filter((i) => !referenced.has(i)), '有模板没有任何入口引用').toEqual([]);
  });
});

describe('地面装饰', () => {
  it('14 个模板都有地面定义,band/blob 尺寸合法', () => {
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

  it('模板个性:冰面中央空、沙丘带里无实心件、废墟每列有门洞', () => {
    for (const seed of [3, 17, 2026]) {
      const ice = buildLayout('icefield', ctxOf(seed));
      for (const p of solidsOf(ice.props)) {
        expect(Math.hypot(p.xM - W * 0.52, p.yM - H / 2), `冰湖中央@${seed}`).toBeGreaterThanOrEqual(LAYOUT_RULES.centerFreeM);
      }
      const dunes = buildLayout('dunes', ctxOf(seed));
      const bandY = H * 0.52;
      const bandH = Math.max(2.6, H * 0.2);
      for (const p of solidsOf(dunes.props)) {
        expect(Math.abs(p.yM - bandY), `沙丘带@${seed}`).toBeGreaterThanOrEqual(bandH / 2);
      }
      const ruins = buildLayout('ruins', ctxOf(seed));
      for (const x of [7.5, W - 7.5]) {
        const col = solidsOf(ruins.props).filter((p) => Math.abs(p.xM - x) < 0.6).map((p) => p.yM).sort((a, b) => a - b);
        let gap = 0;
        for (let i = 1; i < col.length; i++) gap = Math.max(gap, col[i] - col[i - 1]);
        expect(gap, `废墟墙列@${seed} x=${x}`).toBeGreaterThanOrEqual(LAYOUT_RULES.doorM);
      }
    }
  });

  it('浅滩的水带 / 窄道的土路落在房间中段', () => {
    expect(floorOf('shore', W, H).kind).toBe('water');
    expect(floorOf('narrow', W, H).kind).toBe('path');
    expect(floorOf('icefield', W, H).kind).toBe('ice');
    expect(floorOf('drift', W, H).kind).toBe('path');
    expect(floorOf('dunes', W, H).kind).toBe('sand');
    // 冰面配色三章都有(雪原最亮,林地偏青)
    expect(floorPalette('ice', 2)!.base).not.toBe(floorPalette('ice', 1)!.base);
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
