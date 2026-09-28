import type { World, Entity } from '@engine/ecs/World';
import type { Input } from '@engine/input/Input';
import balance from '@data/balance.json';
import { RARITY_COLORS, UI } from '@game/constants';
import { Equipment, Health, Inventory, Player, Stats } from '@game/components';
import { equipFromInventory, unequipSlot } from '@game/loot/Equip';
import type { Item, Slot } from '@game/loot/Items';
import { SLOTS } from '@game/loot/Items';
import { RUNE_POOL } from '@game/skills/SkillSystem';
import { elementColor } from '@game/combat/Elements';
import type { Element } from '@game/components';

/** 技能 id → 快捷键标签 */
const SKILL_KEY: Record<string, string> = {
  blade_q_cleave: 'Q', blade_e_tidestep: 'E', blade_r_starfall: 'R',
  ranger_q_fan: 'Q', ranger_e_nova: 'E', ranger_r_storm: 'R',
};

interface Rect { x: number; y: number; w: number; h: number }

const SLOT_NAMES: Record<Slot, string> = {
  weapon: '武器', helmet: '头盔', chest: '胸甲', boots: '靴子', ring: '戒指', amulet: '护符',
};

/**
 * 背包界面(Tab 开关):左侧 6 装备位,右侧 4×6 背包格。
 * 悬停显示词条详情与同部位对比;左键穿戴/卸下。打开时游戏暂停(由 GameScene 控制)。
 */
export class InventoryUI {
  open = false;
  private invRects: Rect[] = [];
  private eqRects: Array<{ rect: Rect; slot: Slot }> = [];
  private runeRects: Array<{ rect: Rect; runeId: string }> = [];
  private hoverInv = -1;
  private hoverEq: Slot | null = null;
  private hoverRune: string | null = null;

  constructor(private readonly input: Input) {}

  /** 每帧调用(即使暂停)。返回 true 表示本帧消费了输入。 */
  handleInput(world: World, pe: Entity): boolean {
    if (this.input.wasPressed('Tab') || this.input.wasPressed('KeyB')) {
      this.open = !this.open;
    }
    if (!this.open) return false;
    if (this.input.wasPressed('Escape')) this.open = false;

    // 命中检测
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    this.hoverInv = this.invRects.findIndex((r) => inside(r, mx, my));
    this.hoverEq = null;
    for (const er of this.eqRects) {
      if (inside(er.rect, mx, my)) this.hoverEq = er.slot;
    }
    this.hoverRune = null;
    for (const rr of this.runeRects) {
      if (inside(rr.rect, mx, my)) this.hoverRune = rr.runeId;
    }

    if (this.input.mousePressed) {
      if (this.hoverInv >= 0) equipFromInventory(world, pe, this.hoverInv);
      else if (this.hoverEq) unequipSlot(world, pe, this.hoverEq);
      else if (this.hoverRune) this.toggleRune(world, pe, this.hoverRune);
    }
    return true;
  }

  /** 点击符文:镶嵌到其目标技能 / 已镶嵌则卸下 */
  private toggleRune(world: World, pe: Entity, runeId: string): void {
    const rune = RUNE_POOL.get(runeId);
    if (!rune) return;
    const p = world.mustGet(pe, Player);
    if (p.equippedRunes[rune.skill] === runeId) {
      delete p.equippedRunes[rune.skill];
    } else {
      p.equippedRunes[rune.skill] = runeId;
    }
  }

  render(ctx: CanvasRenderingContext2D, world: World, pe: Entity, width: number, height: number): void {
    if (!this.open) return;
    const inv = world.mustGet(pe, Inventory);
    const eq = world.mustGet(pe, Equipment);
    const stats = world.mustGet(pe, Stats);
    const hp = world.mustGet(pe, Health);
    const p = world.mustGet(pe, Player);

    ctx.save();
    ctx.fillStyle = 'rgba(13,15,26,0.82)';
    ctx.fillRect(0, 0, width, height);

    const panelW = 660;
    const panelH = 486;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    panel(ctx, px, py, panelW, panelH);

    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('装备与背包', px + 18, py + 28);
    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText('[Tab] 关闭 · 点背包穿戴 · 点装备卸下', px + 150, py + 28);
    ctx.fillStyle = UI.gold;
    ctx.textAlign = 'right';
    ctx.fillText(`✦ 星尘 ${p.stardust}`, px + panelW - 18, py + 28);

    // ---- 左:属性面板 + 装备位 ----
    ctx.textAlign = 'left';
    ctx.fillStyle = UI.text;
    ctx.font = '12px monospace';
    const statLines = [
      `生命  ${Math.ceil(hp.hp)}/${hp.max}`,
      `攻击  ${stats.atk}`,
      `暴击  ${(stats.critRate * 100).toFixed(0)}% / ${(stats.critDmg * 100).toFixed(0)}%`,
      `移速  ${stats.moveSpeed.toFixed(1)}m/s`,
      `冷却  -${(p.cdr * 100).toFixed(0)}%  元素 +${(p.elemDmg * 100).toFixed(0)}%`,
    ];
    statLines.forEach((s, i) => ctx.fillText(s, px + 18, py + 56 + i * 17));

    this.eqRects = [];
    const eqX = px + 18;
    const eqY = py + 152;
    const cell = 56;
    const gap = 8;
    SLOTS.forEach((slot, i) => {
      const x = eqX + (i % 2) * (cell + gap + 60);
      const y = eqY + Math.floor(i / 2) * (cell + gap);
      const item = eq.slots[slot];
      this.drawCell(ctx, x, y, cell, item ?? null, this.hoverEq === slot);
      ctx.fillStyle = UI.dim;
      ctx.font = '11px monospace';
      ctx.fillText(SLOT_NAMES[slot], x + cell + 6, y + cell / 2 + 4);
      this.eqRects.push({ rect: { x, y, w: cell, h: cell }, slot });
    });

    // ---- 右:背包 4 列 × 6 行 ----
    this.invRects = [];
    const gridX = px + 300;
    const gridY = py + 56;
    const cols = 4;
    for (let i = 0; i < balance.loot.invSize; i++) {
      const x = gridX + (i % cols) * (cell + gap);
      const y = gridY + Math.floor(i / cols) * (cell + gap - 4);
      const item = inv.items[i] ?? null;
      this.drawCell(ctx, x, y, cell, item, this.hoverInv === i);
      this.invRects.push({ x, y, w: cell, h: cell });
    }

    // ---- 底部:符文镶嵌区 ----
    this.runeRects = [];
    const runeY = py + panelH - 62;
    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('符文(点击镶嵌到对应技能,精英/Boss/商店获取):', px + 18, runeY - 8);
    if (p.runeBag.length === 0) {
      ctx.fillText('—— 尚未获得符文 ——', px + 18, runeY + 26);
    }
    p.runeBag.forEach((id, i) => {
      const rune = RUNE_POOL.get(id);
      if (!rune) return;
      const rc = 44;
      const x = px + 18 + i * (rc + 8);
      const equipped = p.equippedRunes[rune.skill] === id;
      const col = rune.element ? elementColor(rune.element as Element) : UI.text;
      ctx.fillStyle = equipped ? '#2a3147' : '#1a1f30';
      ctx.fillRect(x, runeY, rc, rc);
      ctx.strokeStyle = equipped ? UI.gold : col;
      ctx.lineWidth = equipped ? 2.5 : 1.5;
      ctx.strokeRect(x + 1, runeY + 1, rc - 2, rc - 2);
      ctx.fillStyle = col;
      ctx.font = 'bold 17px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('◈', x + rc / 2, runeY + 22);
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = equipped ? UI.gold : UI.dim;
      ctx.fillText(SKILL_KEY[rune.skill] ?? '?', x + rc / 2, runeY + 37);
      this.runeRects.push({ rect: { x, y: runeY, w: rc, h: rc }, runeId: id });
    });
    // 符文悬停说明
    if (this.hoverRune) {
      const rune = RUNE_POOL.get(this.hoverRune);
      if (rune) {
        const tx = this.input.mouseX + 14;
        const ty = this.input.mouseY - 10;
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(13,15,26,0.95)';
        ctx.fillRect(tx, ty - 18, 320, 58);
        ctx.strokeStyle = '#3a4154';
        ctx.strokeRect(tx, ty - 18, 320, 58);
        ctx.fillStyle = rune.element ? elementColor(rune.element as Element) : UI.text;
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`◈ ${rune.name} [${SKILL_KEY[rune.skill] ?? '?'}技能]`, tx + 10, ty + 2);
        ctx.fillStyle = UI.text;
        ctx.font = '11px monospace';
        ctx.fillText(rune.desc, tx + 10, ty + 20);
        ctx.fillStyle = UI.dim;
        ctx.fillText(p.equippedRunes[rune.skill] === rune.id ? '点击卸下' : '点击镶嵌(替换该技能现有符文)', tx + 10, ty + 34);
      }
    }

    // ---- 悬停 tooltip(含同部位对比) ----
    const hovered: Item | null =
      this.hoverInv >= 0 ? inv.items[this.hoverInv] ?? null
      : this.hoverEq ? eq.slots[this.hoverEq] ?? null
      : null;
    if (hovered) {
      const compare = this.hoverInv >= 0 ? eq.slots[hovered.slot] ?? null : null;
      this.tooltip(ctx, hovered, compare, this.input.mouseX + 16, this.input.mouseY + 12, width, height);
    }
    ctx.restore();
  }

  private drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, item: Item | null, hover: boolean): void {
    ctx.fillStyle = hover ? '#2a3147' : '#1a1f30';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = item ? RARITY_COLORS[item.rarity] : '#3a4154';
    ctx.lineWidth = item && (item.rarity === 'epic' || item.rarity === 'legendary') ? 2.5 : 1.5;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    if (item) {
      ctx.fillStyle = RARITY_COLORS[item.rarity];
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(item.glyph, x + size / 2, y + size / 2 + 7);
      ctx.textAlign = 'left';
    }
  }

  private tooltip(ctx: CanvasRenderingContext2D, item: Item, compare: Item | null, x: number, y: number, vw: number, vh: number): void {
    const lines: Array<[string, string]> = [];
    lines.push([item.name, RARITY_COLORS[item.rarity]]);
    lines.push([`${item.baseStatName} +${item.baseValue}`, UI.text]);
    for (const a of item.affixes) lines.push([`${a.name} +${a.value}${a.suffix}`, '#9fc3e8']);
    if (item.specialDesc) lines.push([`★ ${item.specialDesc}`, UI.gold]);
    if (compare) {
      lines.push(['— 已装备 —', UI.dim]);
      lines.push([compare.name, RARITY_COLORS[compare.rarity]]);
      lines.push([`${compare.baseStatName} +${compare.baseValue}`, UI.dim]);
      for (const a of compare.affixes) lines.push([`${a.name} +${a.value}${a.suffix}`, UI.dim]);
    }

    const w = 230;
    const h = lines.length * 16 + 16;
    const tx = Math.min(x, vw - w - 8);
    const ty = Math.min(y, vh - h - 8);
    panel(ctx, tx, ty, w, h);
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    lines.forEach(([text, color], i) => {
      ctx.fillStyle = color;
      ctx.fillText(text, tx + 10, ty + 20 + i * 16);
    });
  }
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(19,23,38,0.96)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3a4154';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = '#5a6478';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
