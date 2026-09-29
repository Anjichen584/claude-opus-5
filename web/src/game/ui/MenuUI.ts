import type { Input } from '@engine/input/Input';
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
}

/**
 * 标题页(职业/章节/祭坛/铸台已移入可行走的「星陨营地」→ ui/CampUI.ts)
 * 与结算页。返回 'start' 表示进入营地。
 */
export class MenuUI {
  private startRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private readonly input: Input) {}

  /** 标题页。返回 'start' | null */
  updateMenu(): 'start' | null {
    if (this.input.wasPressed('Enter') || this.input.wasPressed('PadStart')) return 'start';
    if (this.input.mousePressed && inside(this.startRect, this.input.mouseX, this.input.mouseY)) return 'start';
    return null;
  }

  renderMenu(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    ctx.textAlign = 'center';
    const pulse = 0.75 + 0.25 * Math.sin(t * 2);
    ctx.fillStyle = `rgba(242,163,60,${pulse})`;
    ctx.font = 'bold 48px monospace';
    ctx.fillText('星陨骑士 · 序章', w / 2, h * 0.26);
    ctx.fillStyle = UI.dim;
    ctx.font = '14px monospace';
    ctx.fillText('—— 元素连锁 · 符文改装 · 昼夜怪潮 ——', w / 2, h * 0.26 + 32);

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
    ctx.fillText('🏕 进入星陨营地', w / 2, this.startRect.y + 35);

    // 战绩
    const s = meta.data.stats;
    ctx.fillStyle = UI.dim;
    ctx.font = '12px monospace';
    ctx.fillText(
      `✦ ${meta.data.stardust} · 通关 ${s.clears} 次 · 出击 ${s.runs} 次 · 总击杀 ${s.totalKills}` +
      (s.bestTimeS > 0 ? ` · 最速 ${fmtTime(s.bestTimeS)}` : ''),
      w / 2, h * 0.46 + 96,
    );
    ctx.fillText('[Enter / 点击] 进入 · 营地内可换职业/升祭坛/铸装备/选章节出征', w / 2, h - 24);
  }

  /** 结算页。返回 'menu' | null */
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
    ctx.fillText(rs.victory ? '✦ 章节通关 ✦' : '骑士倒下了…', w / 2, h * 0.32);

    // 统计行:图标 + 左对齐文字(图标未就绪时自动只画文字,布局不塌)
    const rows: Array<[string, string]> = [
      [STAT_ICON.kill, `击杀  ${rs.kills}`],
      [STAT_ICON.taken, `受击  ${rs.hitsTaken} 次${rs.hitsTaken === 0 ? '(无伤!)' : ''}`],
      [STAT_ICON.dps, `最高单次伤害  ${Math.round(rs.maxHit)}`],
      [STAT_ICON.chest, `推进房间  ${rs.rooms} / ${balance.rooms.count + 1}`],
      [STAT_ICON.time, `用时  ${fmtTime(rs.timeS)}`],
      [STAT_ICON.stardust, `星尘收入  ✦${rs.stardustGained}(已存入钱包)`],
    ];
    const rowW = 360;
    const rx = w / 2 - rowW / 2;
    rows.forEach(([icon, text], i) => {
      drawIconRow(ctx, icon, rx, h * 0.42 + i * 28, 22, text, UI.text, '15px monospace');
    });
    ctx.textAlign = 'center';

    ctx.fillStyle = UI.dim;
    ctx.font = '13px monospace';
    ctx.fillText('[Enter / 点击] 返回营地', w / 2, h * 0.42 + rows.length * 28 + 40);
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
