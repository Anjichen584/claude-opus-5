import type { Input } from '@engine/input/Input';
import { t as tr } from '@game/i18n';
import { UI } from '@game/constants';
import { STAT_ICON, drawIconRow } from '@game/gfx/icons';
import { meta } from '@game/meta/Save';
import balance from '@data/balance.json';

interface Rect { x: number; y: number; w: number; h: number }

export interface RunStats {
  victory: boolean;
  rooms: number;
  kills: number;
  timeS: number;
  stardustGained: number;
  /** 本局受击次数(无伤判定用,结算页展示) */
  hitsTaken: number;
  /** 本局单次最高伤害(与排行榜共用同一数据源) */
  maxHit: number;
  /** 无尽模式:本局到达的层数与循环数(0 = 不是无尽局;结算页显示“撑到第几层”) */
  endlessFloor: number;
  endlessLoop: number;
  /** 无尽:本局是否刷新历史最高层 */
  endlessRecord: boolean;
}

/**
 * 标题页(职业/章节/祭坛/铸台已移入可行走的「星陨营地」→ ui/CampUI.ts)
 * 与结算页。返回 ‘start’ 表示进入营地。
 */
export class MenuUI {
  private startRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private slotRects: Rect[] = [];

  constructor(private readonly input: Input) {}

  /**
   * 标题页。返回 ‘start’ | null。
   * 存档槽选择也在这里:点别的槽 = 切换(切换前当前槽已写回,见 MetaStore.switchTo);
   * 长按/点空槽上的「新建」= 清空该槽重开。
   */
  updateMenu(): 'start' | 'slotChanged' | null {
    if (this.input.wasPressed('Enter') || this.input.wasPressed('PadStart')) return 'start';

    // 存档槽:先判槽(在按钮下层,互不重叠)
    if (this.input.mousePressed) {
      for (let i = 0; i < this.slotRects.length; i++) {
        const r = this.slotRects[i];
        if (!inside(r, this.input.mouseX, this.input.mouseY)) continue;
        if (i === meta.slotIndex) continue;
        meta.switchTo(i);
        // 调用方要同步引导进度与营地职业选择
        return 'slotChanged';
      }
    }
    if (this.input.mousePressed && inside(this.startRect, this.input.mouseX, this.input.mouseY)) return 'start';
    return null;
  }

  /** 清空槽 i(「新建」按钮;当前槽会立刻变成新档) */
  clearSlot(i: number): void {
    meta.resetSlot(i);
    if (i === meta.slotIndex) meta.save();
  }

  renderMenu(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    ctx.textAlign = 'center';
    const pulse = 0.75 + 0.25 * Math.sin(t * 2);
    ctx.fillStyle = `rgba(242,163,60,${pulse})`;
    ctx.font = 'bold 48px monospace';
    ctx.fillText(tr('menu.title'), w / 2, h * 0.26);
    ctx.fillStyle = UI.dim;
    ctx.font = '14px monospace';
    ctx.fillText(tr('menu.tagline'), w / 2, h * 0.26 + 32);

    // 进入营地
    const bw = 280;
    const bh = 56;
    this.startRect = { x: w / 2 - bw / 2, y: h * 0.46, w: bw, h: bh };
    const hov = inside(this.startRect, this.input.mouseX, this.input.mouseY);
    ctx.fillStyle = hov ? '#2a3147' : UI.panel;
    ctx.fillRect(this.startRect.x, this.startRect.y, bw, bh);
    ctx.strokeStyle = UI.gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.startRect.x, this.startRect.y, bw, bh);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(tr('menu.camp'), w / 2, this.startRect.y + 35);

    this.renderSlots(ctx, w, h);

    // 战绩
    const s = meta.data.stats;
    ctx.fillStyle = UI.dim;
    ctx.font = '12px monospace';
    ctx.fillText(
      tr('stats.line', { dust: meta.data.stardust, clears: s.clears, runs: s.runs, kills: s.totalKills }) +
      (s.bestTimeS > 0 ? tr('stats.fastest', { time: fmtTime(s.bestTimeS) }) : ''),
      w / 2, h * 0.46 + 96,
    );
    ctx.fillText(tr('menu.enter'), w / 2, h - 24);
  }

  /** 3 个存档槽卡片:槽号 / 星尘 / 祭坛等级 / 通关 / 上次游玩 */
  private renderSlots(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const slots = meta.slots();
    const cw = 168;
    const ch = 62;
    const gap = 12;
    const totalW = cw * slots.length + gap * (slots.length - 1);
    const x0 = w / 2 - totalW / 2;
    const y = h * 0.66;   // 与上方“战绩”一行留出间距(720p 下两者相距 ~50px)
    this.slotRects = [];
    ctx.textAlign = 'center';
    slots.forEach((sl, i) => {
      const x = x0 + i * (cw + gap);
      const r: Rect = { x, y, w: cw, h: ch };
      this.slotRects.push(r);
      const hov = inside(r, this.input.mouseX, this.input.mouseY);
      ctx.fillStyle = sl.active ? '#2a3147' : hov ? '#242a3d' : UI.panel;
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = sl.active ? UI.gold : '#3a4257';
      ctx.lineWidth = sl.active ? 2 : 1;
      ctx.strokeRect(x, y, cw, ch);

      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = sl.active ? UI.gold : UI.text;
      ctx.fillText(tr('slot.label', { n: i + 1, cur: sl.active ? tr('slot.current') : '' }), x + cw / 2, y + 17);
      ctx.font = '11px monospace';
      ctx.fillStyle = UI.dim;
      if (!sl.exists) {
        ctx.fillText(tr('menu.slot.empty1'), x + cw / 2, y + 38);
        ctx.fillText(tr('menu.slot.empty2'), x + cw / 2, y + 52);
      } else if (!sl.summary) {
        ctx.fillText(tr('menu.slot.broken1'), x + cw / 2, y + 38);
        ctx.fillText(tr('menu.slot.broken2'), x + cw / 2, y + 52);
      } else {
        const sm = sl.summary;
        ctx.fillText(tr('slot.meta1', { dust: sm.stardust, lv: sm.altarLv }), x + cw / 2, y + 36);
        ctx.fillText(tr('slot.meta2', { clears: sm.clears, runs: sm.runs }), x + cw / 2, y + 50);
      }
    });
    ctx.fillStyle = UI.dim;
    ctx.font = '10px monospace';
    ctx.fillText(tr('slot.hint'), w / 2, y + ch + 14);
  }

  /** 结算页。返回 ‘menu’ | null */
  updateResults(): 'menu' | null {
    if (this.input.wasPressed('Enter') || this.input.wasPressed('PadStart') || this.input.mousePressed) return 'menu';
    return null;
  }

  renderResults(ctx: CanvasRenderingContext2D, w: number, h: number, rs: RunStats): void {
    ctx.fillStyle = 'rgba(13,15,26,0.85)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = rs.victory ? UI.gold : UI.hpLow;
    ctx.font = 'bold 40px monospace';
    // 无尽模式没有“胜利”:标题按层数说话(这个模式唯一的成就感就是撑得更远)
    const title = rs.endlessFloor > 0
      ? (rs.endlessRecord ? tr('results.endless.record', { n: rs.endlessFloor }) : tr('results.endless.floor', { n: rs.endlessFloor }))
      : rs.victory ? tr('results.clear') : tr('results.dead');
    ctx.fillText(title, w / 2, h * 0.32);
    if (rs.endlessFloor > 0) {
      ctx.fillStyle = UI.dim;
      ctx.font = '14px monospace';
      ctx.fillText(tr('results.endless.loop', { loop: rs.endlessLoop + 1, best: meta.data.endlessBest }),
        w / 2, h * 0.32 + 26);
    }

    // 统计行:图标 + 左对齐文字(图标未就绪时自动只画文字,布局不塌)
    const rows: Array<[string, string]> = [
      [STAT_ICON.kill, tr('results.kills', { n: rs.kills })],
      [STAT_ICON.taken, tr('results.hits', { n: rs.hitsTaken, nohit: rs.hitsTaken === 0 ? tr('results.nohit') : '' })],
      [STAT_ICON.dps, tr('results.maxhit', { n: Math.round(rs.maxHit) })],
      [STAT_ICON.chest, rs.endlessFloor > 0
        ? tr('results.rooms.endless', { n: rs.rooms })
        : tr('results.rooms', { n: rs.rooms, total: balance.rooms.count + 1 })],
      [STAT_ICON.time, tr('results.time', { t: fmtTime(rs.timeS) })],
      [STAT_ICON.stardust, tr('results.dust', { n: rs.stardustGained })],
    ];
    const rowW = 360;
    const rx = w / 2 - rowW / 2;
    rows.forEach(([icon, text], i) => {
      drawIconRow(ctx, icon, rx, h * 0.42 + i * 28, 22, text, UI.text, '15px monospace');
    });
    ctx.textAlign = 'center';

    ctx.fillStyle = UI.dim;
    ctx.font = '13px monospace';
    ctx.fillText(tr('menu.back'), w / 2, h * 0.42 + rows.length * 28 + 40);
  }
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}
