import type { Input } from '@engine/input/Input';
import { UI } from '@game/constants';
import { meta } from '@game/meta/Save';
import { altarCost } from '@game/dungeon/Scaling';
import balance from '@data/balance.json';

interface Rect { x: number; y: number; w: number; h: number }

export interface RunStats {
  victory: boolean;
  rooms: number;
  kills: number;
  timeS: number;
  stardustGained: number;
}

const BRANCHES: Array<{ key: 'hp' | 'atk' | 'luck'; name: string; desc: string }> = [
  { key: 'hp', name: '生命强化', desc: '+3%生命/级' },
  { key: 'atk', name: '攻击强化', desc: '+3%攻击/级' },
  { key: 'luck', name: '幸运祝福', desc: '+3幸运/级(紫橙掉率)' },
];

/** 主菜单(标题+祭坛+开始)与结算页。返回 'start' 表示玩家点了开始。 */
export class MenuUI {
  private startRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private altarRects: Array<{ rect: Rect; key: 'hp' | 'atk' | 'luck' }> = [];

  constructor(private readonly input: Input) {}

  /** 主菜单。返回 'start' | null */
  updateMenu(): 'start' | null {
    if (this.input.wasPressed('Enter')) return 'start';
    if (this.input.mousePressed) {
      const mx = this.input.mouseX;
      const my = this.input.mouseY;
      if (inside(this.startRect, mx, my)) return 'start';
      for (const ar of this.altarRects) {
        if (inside(ar.rect, mx, my)) this.tryUpgrade(ar.key);
      }
    }
    return null;
  }

  private tryUpgrade(key: 'hp' | 'atk' | 'luck'): void {
    const lvl = meta.data.altar[key];
    if (lvl >= balance.altar.maxLevel) return;
    const cost = altarCost(lvl);
    if (meta.data.stardust < cost) return;
    meta.data.stardust -= cost;
    meta.data.altar[key] = lvl + 1;
    meta.save();
  }

  renderMenu(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    // 标题
    ctx.textAlign = 'center';
    const pulse = 0.75 + 0.25 * Math.sin(t * 2);
    ctx.fillStyle = `rgba(242,163,60,${pulse})`;
    ctx.font = 'bold 46px monospace';
    ctx.fillText('星陨骑士 · 序章', w / 2, h * 0.2);
    ctx.fillStyle = UI.dim;
    ctx.font = '14px monospace';
    ctx.fillText('—— 翠语林地 · 第一章 ——', w / 2, h * 0.2 + 30);

    // 开始按钮
    const bw = 240;
    const bh = 52;
    this.startRect = { x: w / 2 - bw / 2, y: h * 0.32, w: bw, h: bh };
    const hov = inside(this.startRect, this.input.mouseX, this.input.mouseY);
    ctx.fillStyle = hov ? '#2a3147' : UI.panel;
    ctx.fillRect(this.startRect.x, this.startRect.y, bw, bh);
    ctx.strokeStyle = UI.gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.startRect.x, this.startRect.y, bw, bh);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('开始冒险 [Enter]', w / 2, this.startRect.y + 33);

    // 祭坛
    const ax = w / 2 - 260;
    const ay = h * 0.48;
    ctx.fillStyle = UI.panel;
    ctx.fillRect(ax, ay, 520, 170);
    ctx.strokeStyle = '#3a4154';
    ctx.strokeRect(ax, ay, 520, 170);
    ctx.fillStyle = UI.text;
    ctx.font = 'bold 15px monospace';
    ctx.fillText('✨ 星陨祭坛(永久成长)', w / 2, ay + 26);
    ctx.fillStyle = UI.gold;
    ctx.font = '13px monospace';
    ctx.fillText(`✦ 星尘 ${meta.data.stardust}`, w / 2, ay + 46);

    this.altarRects = [];
    BRANCHES.forEach((b, i) => {
      const lvl = meta.data.altar[b.key];
      const maxed = lvl >= balance.altar.maxLevel;
      const cost = maxed ? 0 : altarCost(lvl);
      const rowY = ay + 64 + i * 32;
      ctx.textAlign = 'left';
      ctx.fillStyle = UI.text;
      ctx.font = '13px monospace';
      ctx.fillText(`${b.name} Lv.${lvl}/${balance.altar.maxLevel}`, ax + 20, rowY + 16);
      ctx.fillStyle = UI.dim;
      ctx.font = '11px monospace';
      ctx.fillText(b.desc, ax + 190, rowY + 16);
      const btn: Rect = { x: ax + 380, y: rowY, w: 120, h: 24 };
      const afford = !maxed && meta.data.stardust >= cost;
      const bHov = inside(btn, this.input.mouseX, this.input.mouseY);
      ctx.fillStyle = maxed ? '#1a1f30' : bHov && afford ? '#3a4a2a' : '#232838';
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.strokeStyle = afford ? UI.hp : '#3a4154';
      ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
      ctx.textAlign = 'center';
      ctx.fillStyle = maxed ? UI.dim : afford ? UI.hp : UI.dim;
      ctx.font = '12px monospace';
      ctx.fillText(maxed ? '已满级' : `升级 ✦${cost}`, btn.x + btn.w / 2, btn.y + 16);
      this.altarRects.push({ rect: btn, key: b.key });
    });

    // 战绩与操作说明
    const s = meta.data.stats;
    ctx.fillStyle = UI.dim;
    ctx.font = '12px monospace';
    ctx.fillText(
      `通关 ${s.clears} 次 · 出击 ${s.runs} 次 · 总击杀 ${s.totalKills}` +
      (s.bestTimeS > 0 ? ` · 最速通关 ${fmtTime(s.bestTimeS)}` : ''),
      w / 2, ay + 200,
    );
    ctx.fillText('WASD移动 · 左键连斩 · 空格翻滚 · Q/E/R技能 · Tab背包 · 1药剂', w / 2, h - 24);
  }

  /** 结算页。返回 'menu' | null */
  updateResults(): 'menu' | null {
    if (this.input.wasPressed('Enter') || this.input.mousePressed) return 'menu';
    return null;
  }

  renderResults(ctx: CanvasRenderingContext2D, w: number, h: number, rs: RunStats): void {
    ctx.fillStyle = 'rgba(13,15,26,0.85)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = rs.victory ? UI.gold : UI.hpLow;
    ctx.font = 'bold 40px monospace';
    ctx.fillText(rs.victory ? '✦ 章节通关 ✦' : '骑士倒下了…', w / 2, h * 0.32);

    ctx.fillStyle = UI.text;
    ctx.font = '15px monospace';
    const lines = [
      `推进房间  ${rs.rooms} / ${balance.rooms.count + 1}`,
      `击杀  ${rs.kills}`,
      `用时  ${fmtTime(rs.timeS)}`,
      `星尘收入  ✦${rs.stardustGained}(已存入钱包)`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, w / 2, h * 0.42 + i * 26));

    ctx.fillStyle = UI.dim;
    ctx.font = '13px monospace';
    ctx.fillText('[Enter / 点击] 返回主菜单', w / 2, h * 0.42 + lines.length * 26 + 34);
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
