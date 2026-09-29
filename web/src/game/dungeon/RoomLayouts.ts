/**
 * 房间布局模板(web 主线 · GDD §9 房间生成)。
 *
 * 之前每间房都是"同一块空地 + 纯随机撒点",玩家看不出房间个性,怪也没有可绕的地形。
 * 现在分两步:
 *   ① 模板摆位(tmpl*):scatter 林间散布 / pillars 石柱阵 / grove 密林 / lane 林荫走廊 /
 *      narrow 窄道 / ring 环形擂台 / shore 溪畔浅滩 / boss Boss 场 / calm 静谧房间。
 *   ② 统一过一遍摆放规则(applyRules),规则数值全部来自 balance.layouts:
 *      · 入口净空:x < entryClearXM 不放实心物件(玩家落点在 2.5m,免得一进门卡墙)
 *      · 出口净空:x > W - exitClearXM 留给传送门(spawnPortals 在 W-2)
 *      · 交互净空:摊位/石碑/宝箱周围 reservedClearM 内不放实心物件(不然商品被树挡死)
 *      · 可穿行:松散实心物件两两间距 ≥ minGapM(岩 0.4 + 玩家 0.32 → 需 1.44m,取 1.6 留余量)
 *      · 墙体例外:窄道/环形是故意砌的墙,墙内间距 < minGapM 属设计意图,
 *        但模板保证通道净宽 ≥ minCorridorM,且审计(auditLayout)会验证
 *
 * 纯逻辑、零渲染依赖:同 seed 完全可复现,便于测试与回放。
 */

import { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';

export type PropKind = 'tree' | 'rock' | 'bush';
/** loose = 可穿插的散件;wall = 故意砌死的一段墙;reed = 无碰撞的芦苇/草丛 */
export type PropRole = 'loose' | 'wall' | 'reed';

export interface PlacedProp {
  readonly pk: PropKind;
  readonly xM: number;
  readonly yM: number;
  readonly role: PropRole;
}

/** 交互物净空区(圆心 + 半径,米) */
export interface Reserved {
  readonly xM: number;
  readonly yM: number;
  readonly rM: number;
}

export const LAYOUT_IDS = [
  'scatter', 'pillars', 'grove', 'lane', 'narrow', 'ring', 'shore', 'boss', 'calm',
] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export const LAYOUT_LABELS: Record<LayoutId, string> = {
  scatter: '林间散布',
  pillars: '石柱阵',
  grove: '密林',
  lane: '林荫走廊',
  narrow: '窄道',
  ring: '环形擂台',
  shore: '溪畔浅滩',
  boss: 'Boss 场',
  calm: '静谧房间',
};

/** 地面装饰:只影响背景烘焙,不参与碰撞(浅滩是可以趟过去的) */
export type FloorKind = 'none' | 'water' | 'moss' | 'sand' | 'path';
export interface FloorFeature {
  readonly kind: FloorKind;
  readonly shape: 'band' | 'blob';
  readonly xM: number;
  readonly yM: number;
  readonly wM: number;
  readonly hM: number;
}

export interface LayoutCtx {
  rng: Rng;
  widthM: number;
  heightM: number;
  /** 本房不可占用的交互区(摊位/石碑/宝箱/ Boss 落点) */
  reserved?: readonly Reserved[];
}

export interface LayoutResult {
  readonly id: LayoutId;
  readonly label: string;
  readonly props: PlacedProp[];
  readonly floor: FloorFeature;
}

const L = balance.layouts;

/** 摆放规则(数值全部来自 balance.layouts,禁止在这里写死) */
export const LAYOUT_RULES = {
  entryClearXM: L.entryClearXM,
  exitClearXM: L.exitClearXM,
  minGapM: L.minGapM,
  minCorridorM: L.minCorridorM,
  reservedClearM: L.reservedClearM,
  wallSpacingM: L.wallSpacingM,
  maxLooseSolids: L.maxLooseSolids,
  maxWallProps: L.maxWallProps,
  maxProps: L.maxProps,
} as const;

/** bush(灌木/芦苇)不挡路;tree/rock 是实心 */
export function propRadius(pk: PropKind): number {
  if (pk === 'tree') return balance.props.tree.bodyRadius;
  if (pk === 'rock') return balance.props.rock.bodyRadius;
  return 0;
}
export const isSolid = (pk: PropKind): boolean => propRadius(pk) > 0;

/** 该点是否落在"浅滩"水面里(水面不立树/石) */
export function insideWater(floor: FloorFeature, xM: number, yM: number, padM = 0): boolean {
  if (floor.kind !== 'water' || floor.shape !== 'band') return false;
  return (
    Math.abs(xM - floor.xM) <= floor.wM / 2 + padM &&
    Math.abs(yM - floor.yM) <= floor.hM / 2 + padM
  );
}

/** 该点是否有实心物件(生成怪物时避开,免得卡在石头里) */
export function isBlockedAt(layout: LayoutResult | null, xM: number, yM: number, padM = 0.55): boolean {
  if (!layout) return false;
  for (const p of layout.props) {
    if (!isSolid(p.pk)) continue;
    if (Math.hypot(p.xM - xM, p.yM - yM) < propRadius(p.pk) + padM) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 摆位模板
// ---------------------------------------------------------------------------

type Prop = { pk: PropKind; xM: number; yM: number; role: PropRole };

/** 在给定矩形里撒散件(默认绕开入口/出口净空,交给 applyRules 兜底) */
function dust(
  ctx: LayoutCtx, pk: PropKind, n: number,
  x0: number, x1: number, y0: number, y1: number, role: PropRole = 'loose',
): Prop[] {
  const out: Prop[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ pk, xM: ctx.rng.range(x0, x1), yM: ctx.rng.range(y0, y1), role });
  }
  return out;
}

const tmplScatter = (ctx: LayoutCtx): Prop[] => {
  const P = balance.props;
  const [W, H] = [ctx.widthM, ctx.heightM];
  return [
    ...dust(ctx, 'tree', ctx.rng.int(P.tree.perRoomMin, P.tree.perRoomMax), 5, W - 4.5, 1.6, H - 1.4),
    ...dust(ctx, 'rock', ctx.rng.int(P.rock.perRoomMin, P.rock.perRoomMax), 5, W - 4.5, 1.6, H - 1.4),
    ...dust(ctx, 'bush', ctx.rng.int(P.bush.perRoomMin, P.bush.perRoomMax), 5, W - 4.5, 1.6, H - 1.4),
  ];
};

/** 石柱阵:2 列 × 3 行岩柱,给玩家挡枪线、给怪绕背的空间 */
const tmplPillars = (ctx: LayoutCtx): Prop[] => {
  const [W, H] = [ctx.widthM, ctx.heightM];
  const out: Prop[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      out.push({
        pk: 'rock', role: 'loose',
        xM: 6.5 + (i * (W - 13)) / 2 + ctx.rng.range(-0.5, 0.5),
        yM: H * 0.16 + j * H * 0.68 + ctx.rng.range(-0.4, 0.4),
      });
    }
  }
  return [...out, ...dust(ctx, 'bush', 3, 6, W - 5, 2, H - 2)];
};

/** 密林:四角成丛,中场开阔(适合风筝怪) */
const tmplGrove = (ctx: LayoutCtx): Prop[] => {
  const [W, H] = [ctx.widthM, ctx.heightM];
  const out: Prop[] = [];
  for (const [cx, cy] of [[6, H * 0.14], [W - 5, H * 0.14], [6, H * 0.86], [W - 5, H * 0.86]] as const) {
    out.push({ pk: 'tree', xM: cx, yM: cy, role: 'loose' });
    out.push({
      pk: 'tree', role: 'loose',
      xM: cx + ctx.rng.range(-1.4, 1.4), yM: cy + ctx.rng.range(-0.8, 0.8),
    });
  }
  return [...out, ...dust(ctx, 'bush', 4, 6, W - 5, 2, H - 2)];
};

/** 林荫走廊:上下两排树,中间一条踩出来的土路 */
const tmplLane = (ctx: LayoutCtx): Prop[] => {
  const [W, H] = [ctx.widthM, ctx.heightM];
  const out: Prop[] = [];
  for (let i = 0; i < 4; i++) {
    const x = 6.5 + (i * (W - 13)) / 3;
    out.push({ pk: 'tree', xM: x, yM: H * 0.125, role: 'loose' });
    out.push({ pk: 'tree', xM: x + 1.2, yM: H * 0.875, role: 'loose' });
  }
  return [...out, ...dust(ctx, 'bush', 3, 6, W - 5, 2, H - 2)];
};

/**
 * 窄道:两道岩墙夹出一条横向走廊,每道墙各开一个门洞(错开),外侧是打野的口袋。
 * 通道净宽 = 2*half - 2*岩半径 ≥ minCorridorM;门洞净宽 2.6m ≥ 2*(岩 0.4 + 玩家 0.32)。
 */
const tmplNarrow = (ctx: LayoutCtx): Prop[] => {
  const [W, H] = [ctx.widthM, ctx.heightM];
  const half = Math.max(LAYOUT_RULES.minCorridorM / 2 + propRadius('rock'), 2.6);
  const x0 = 6;
  const x1 = W - 6;
  const span = x1 - x0;
  const cy = H / 2;
  const wall = (y: number, doorX: number): Prop[] => {
    // 墙砖间距 < 2*(岩 0.4 + 玩家 0.32) = 1.44m 才是"砌死的墙"(test 里有这条不变量)
    const n = Math.max(2, Math.round(span / LAYOUT_RULES.wallSpacingM));
    const out: Prop[] = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + (span * i) / n;
      if (Math.abs(x - doorX) < 1.3) continue; // 门洞
      out.push({ pk: 'rock', xM: x, yM: y, role: 'wall' });
    }
    return out;
  };
  const pocketY: Array<[number, number]> = [
    [2.2, cy - half - 1.6],
    [cy + half + 1.6, H - 2.2],
  ];
  const bushes = pocketY.flatMap(([y0, y1]) => dust(ctx, 'bush', 3, 6.5, W - 6, y0, Math.max(y0 + 0.4, y1)));
  return [
    ...wall(cy - half, x0 + span * 0.32),
    ...wall(cy + half, x0 + span * 0.68),
    ...bushes,
  ];
};

/** 环形擂台:中央空场,外圈树石围成环,留两处缺口进出 */
const tmplRing = (ctx: LayoutCtx): Prop[] => {
  const [W, H] = [ctx.widthM, ctx.heightM];
  const cx = W * 0.58;
  const cy = H * 0.5;
  const rad = Math.min(W, H) * 0.28;
  const slots = 12;
  const out: Prop[] = [];
  for (let i = 0; i < slots; i++) {
    if (i % 5 === 0) continue; // 0 / 5 / 10 → 三处缺口,随便进
    const a = (i / slots) * Math.PI * 2;
    const r = rad * ctx.rng.range(0.95, 1.05);
    out.push({
      pk: i % 2 === 0 ? 'rock' : 'tree', role: 'loose',
      xM: cx + Math.cos(a) * r, yM: cy + Math.sin(a) * r,
    });
  }
  const inner = dust(ctx, 'bush', 3, cx - rad * 0.4, cx + rad * 0.4, cy - rad * 0.4, cy + rad * 0.4);
  return [...out, ...inner];
};

/** 溪畔浅滩:一条横穿房间的水带(可趟过),两岸芦苇,树石只长在陆上 */
const tmplShore = (ctx: LayoutCtx): Prop[] => {
  const [W, H] = [ctx.widthM, ctx.heightM];
  const bandY = H * 0.62;
  const bandH = Math.max(2.2, H * 0.16);
  const reeds: Prop[] = [];
  for (let x = 6; x <= W - 6; x += 1.7) {
    reeds.push({ pk: 'bush', role: 'reed', xM: x + ctx.rng.range(-0.3, 0.3), yM: bandY - bandH / 2 - 0.4 + ctx.rng.range(-0.15, 0.15) });
    if (x > W - 12) continue; // 下岸少几丛,留出过水的视线
    reeds.push({ pk: 'bush', role: 'reed', xM: x + ctx.rng.range(-0.3, 0.3), yM: bandY + bandH / 2 + 0.4 + ctx.rng.range(-0.15, 0.15) });
  }
  return [
    ...reeds,
    ...dust(ctx, 'tree', 3, 6, W - 5, 2, bandY - bandH / 2 - 1),
    ...dust(ctx, 'rock', 3, 6, W - 5, bandY + bandH / 2 + 1, H - 2),
  ];
};

/** Boss 场:只在边角留两点装饰,保证 Boss 与玩家的走位空间 */
const tmplBoss = (ctx: LayoutCtx): Prop[] => {
  const [W, H] = [ctx.widthM, ctx.heightM];
  return [
    { pk: 'tree', xM: 6, yM: 2, role: 'loose' },
    { pk: 'tree', xM: W - 5, yM: H - 2, role: 'loose' },
    { pk: 'rock', xM: W / 2, yM: 1.8, role: 'loose' },
  ];
};

/** 静谧房间:商店/宝藏/秘境用,少量装饰 + 自动避开摊位净空 */
const tmplCalm = (ctx: LayoutCtx): Prop[] => {
  const [W, H] = [ctx.widthM, ctx.heightM];
  return [
    { pk: 'tree', xM: 6, yM: 2.6, role: 'loose' },
    { pk: 'tree', xM: W - 5, yM: H - 2.6, role: 'loose' },
    ...dust(ctx, 'bush', 5, 6, W - 5, 2, H - 2),
  ];
};

const TEMPLATES: Record<LayoutId, (ctx: LayoutCtx) => Prop[]> = {
  scatter: tmplScatter,
  pillars: tmplPillars,
  grove: tmplGrove,
  lane: tmplLane,
  narrow: tmplNarrow,
  ring: tmplRing,
  shore: tmplShore,
  boss: tmplBoss,
  calm: tmplCalm,
};

// ---------------------------------------------------------------------------
// 地面装饰(仅烘焙背景用)
// ---------------------------------------------------------------------------

export function floorOf(id: LayoutId, widthM: number, heightM: number): FloorFeature {
  const W = widthM;
  const H = heightM;
  switch (id) {
    case 'shore':
      return { kind: 'water', shape: 'band', xM: W / 2, yM: H * 0.62, wM: W - 6, hM: Math.max(2.2, H * 0.16) };
    case 'narrow':
      return { kind: 'path', shape: 'band', xM: W / 2, yM: H / 2, wM: W - 7.5, hM: 3.0 };
    case 'lane':
      return { kind: 'path', shape: 'band', xM: W / 2, yM: H / 2, wM: W - 11, hM: 4.4 };
    case 'grove':
      return { kind: 'moss', shape: 'blob', xM: W * 0.36, yM: H * 0.5, wM: 9, hM: 6 };
    case 'pillars':
      return { kind: 'sand', shape: 'blob', xM: W / 2, yM: H / 2, wM: 12, hM: 8.5 };
    case 'ring':
      return { kind: 'sand', shape: 'blob', xM: W * 0.58, yM: H * 0.5, wM: 10.5, hM: 10.5 };
    case 'scatter':
      return { kind: 'moss', shape: 'blob', xM: W * 0.62, yM: H * 0.42, wM: 6, hM: 4 };
    default:
      return { kind: 'none', shape: 'blob', xM: W / 2, yM: H / 2, wM: 0, hM: 0 };
  }
}

/** 地面配色(按章节换材质:林地/雪原/荒漠) */
export interface FloorPalette {
  base: string;
  edge: string;
  spark: string;
}
export function floorPalette(kind: FloorKind, chapter: 1 | 2 | 3): FloorPalette | null {
  if (kind === 'none') return null;
  const t = chapter === 3 ? 'desert' : chapter === 2 ? 'snow' : 'forest';
  const table: Record<Exclude<FloorKind, 'none'>, Record<string, FloorPalette>> = {
    water: {
      forest: { base: '#2f6f7a', edge: '#c9b078', spark: '#7fd6d6' },
      snow: { base: '#37707f', edge: '#dfe9f0', spark: '#a8e6ef' },
      desert: { base: '#2e7b86', edge: '#e3d3a2', spark: '#8fe0dd' },
    },
    moss: {
      forest: { base: '#5f8f42', edge: '#78a84f', spark: '#9cc46a' },
      snow: { base: '#83988a', edge: '#a9bcae', spark: '#cfe0d4' },
      desert: { base: '#9aa15c', edge: '#b3b974', spark: '#cfd39b' },
    },
    sand: {
      forest: { base: '#c2ae7c', edge: '#d8c48c', spark: '#efe0b0' },
      snow: { base: '#c9d6dc', edge: '#e2edf2', spark: '#ffffff' },
      desert: { base: '#dcc691', edge: '#efdca8', spark: '#f7ecc4' },
    },
    path: {
      forest: { base: '#b09a72', edge: '#c9b384', spark: '#e0cfa2' },
      snow: { base: '#c3d2da', edge: '#dfeaf0', spark: '#ffffff' },
      desert: { base: '#cdb684', edge: '#e3d0a0', spark: '#f4e8bf' },
    },
  };
  return table[kind][t];
}

// ---------------------------------------------------------------------------
// 规则与审计
// ---------------------------------------------------------------------------

/** 按摆放规则过滤(见文件头);顺序确定 → 同 seed 结果一致 */
export function applyRules(props: readonly Prop[], ctx: LayoutCtx, floor: FloorFeature): PlacedProp[] {
  const [W, H] = [ctx.widthM, ctx.heightM];
  const R = LAYOUT_RULES;
  const reserved = ctx.reserved ?? [];
  const kept: PlacedProp[] = [];
  let looseSolids = 0;
  let wallProps = 0;

  for (const p of props) {
    const x = Math.min(Math.max(p.xM, 1.2), W - 1.2);
    const y = Math.min(Math.max(p.yM, 1.0), H - 1.0);
    const solid = isSolid(p.pk);

    if (solid) {
      if (p.role === 'loose') {
        if (x < R.entryClearXM || x > W - R.exitClearXM) continue; // 出入口净空
        if (looseSolids >= R.maxLooseSolids) continue;
      } else if (wallProps >= R.maxWallProps) continue;
      if (reserved.some((r) => Math.hypot(x - r.xM, y - r.yM) < r.rM + R.reservedClearM)) continue;
      if (insideWater(floor, x, y, 0.3)) continue;
      if (
        p.role === 'loose' &&
        kept.some((k) => k.role === 'loose' && isSolid(k.pk) && Math.hypot(k.xM - x, k.yM - y) < R.minGapM)
      ) continue; // 松散件不许贴太近,免得连成一道墙堵死走位
      if (p.role === 'loose') looseSolids++;
      else wallProps++;
    }

    kept.push({ pk: p.pk, xM: x, yM: y, role: p.role });
    if (kept.length >= R.maxProps) break;
  }
  return kept;
}

/**
 * 审计:返回违反摆放规则的条目(空数组 = 合格)。
 * 测试对全部模板 × 多个种子跑这个函数;布局模板改动后必须仍然全绿。
 */
export function auditLayout(res: LayoutResult, ctx: LayoutCtx): string[] {
  const [W, H] = [ctx.widthM, ctx.heightM];
  const R = LAYOUT_RULES;
  const reserved = ctx.reserved ?? [];
  const bad: string[] = [];
  const solids = res.props.filter((p) => isSolid(p.pk));
  const loose = solids.filter((p) => p.role === 'loose');

  if (res.props.length > R.maxProps) bad.push(`物件过多 ${res.props.length} > ${R.maxProps}`);
  if (loose.length > R.maxLooseSolids) bad.push(`散件过密 ${loose.length} > ${R.maxLooseSolids}`);
  if (solids.filter((p) => p.role === 'wall').length > R.maxWallProps) bad.push('墙体过多');

  for (const p of res.props) {
    if (p.xM < 1.1 || p.xM > W - 1.1 || p.yM < 0.9 || p.yM > H - 0.9) {
      bad.push(`${p.pk} 越界 (${p.xM.toFixed(1)}, ${p.yM.toFixed(1)})`);
    }
  }
  for (const p of loose) {
    if (p.xM < R.entryClearXM) bad.push(`入口净空被占 (x=${p.xM.toFixed(1)})`);
    if (p.xM > W - R.exitClearXM) bad.push(`出口净空被占 (x=${p.xM.toFixed(1)})`);
  }
  for (const p of solids) {
    for (const r of reserved) {
      const d = Math.hypot(p.xM - r.xM, p.yM - r.yM);
      if (d < r.rM + R.reservedClearM) bad.push(`压住交互区 (${p.pk} @${d.toFixed(1)}m)`);
    }
    if (insideWater(res.floor, p.xM, p.yM, 0.3)) bad.push(`水里立了 ${p.pk}`);
  }
  for (let i = 0; i < loose.length; i++) {
    for (let j = i + 1; j < loose.length; j++) {
      const d = Math.hypot(loose[i].xM - loose[j].xM, loose[i].yM - loose[j].yM);
      if (d < R.minGapM) bad.push(`散件过近 ${d.toFixed(2)}m < ${R.minGapM}m`);
    }
  }
  // 模板个性:窄道走廊得是空的、环形中央得是空的、浅滩水面得是空的
  if (res.id === 'narrow') {
    // 实心件中心离中线 ≥ minCorridorM/2 + 岩半径 ⇒ 通道净宽 ≥ minCorridorM
    const freeHalf = R.minCorridorM / 2 + propRadius('rock');
    for (const p of solids) if (Math.abs(p.yM - H / 2) < freeHalf) bad.push('窄道通道被堵');
  }
  if (res.id === 'ring') {
    const cx = W * 0.58;
    const cy = H / 2;
    const rad = Math.min(W, H) * 0.28;
    for (const p of solids) if (Math.hypot(p.xM - cx, p.yM - cy) < rad * 0.8) bad.push('环形擂台中央被堵');
  }
  return bad;
}

/** 摆好一间房:模板 → 过规则 */
export function buildLayout(id: LayoutId, ctx: LayoutCtx): LayoutResult {
  const safe: LayoutId = LAYOUT_IDS.includes(id) ? id : 'scatter';
  const floor = floorOf(safe, ctx.widthM, ctx.heightM);
  return {
    id: safe,
    label: LAYOUT_LABELS[safe],
    props: applyRules(TEMPLATES[safe](ctx), ctx, floor),
    floor,
  };
}

/** 房间类型 → 模板清单('battle' 用权重表抽,其余从 byKind 均抽) */
export type LayoutCtxKind = 'battle' | 'elite' | 'boss' | 'calm';

export function pickLayout(kind: LayoutCtxKind, rng: Rng): LayoutId {
  if (kind === 'battle') {
    const weights = L.combatWeights as Record<string, number>;
    const ids = LAYOUT_IDS.filter((i) => i in weights) as LayoutId[];
    let total = 0;
    for (const i of ids) total += weights[i] ?? 0;
    let roll = rng.next() * total;
    for (const i of ids) {
      roll -= weights[i] ?? 0;
      if (roll < 0) return i;
    }
    return ids[ids.length - 1] ?? 'scatter';
  }
  const list = (L.byKind as Record<string, string[]>)[kind] ?? [];
  const ids = list.filter((i): i is LayoutId => (LAYOUT_IDS as readonly string[]).includes(i));
  if (ids.length === 0) return 'scatter';
  return rng.pick(ids);
}
