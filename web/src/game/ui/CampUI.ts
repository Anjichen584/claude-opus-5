import type { Input } from '@engine/input/Input';
import balance from '@data/balance.json';
import { UI } from '@game/constants';
import { altarCost } from '@game/dungeon/Scaling';
import { meta } from '@game/meta/Save';

interface Rect { x: number; y: number; w: number; h: number }

type Klass = 'blade' | 'ranger' | 'arcanist' | 'warden';
export type CampPanel = 'none' | 'expedition' | 'altar' | 'classpick';

const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function panelBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(19,23,36,0.96)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3a4154';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

/**
 * 星陨营地面板层:出征(章节+出发)/ 星陨祭坛(三系升级)/ 职业试炼(换角色)。
 * 铸台为即时交互不开面板。出战职业/章节的唯一存储在此。
 */
export class CampUI {
  panel: CampPanel = 'none';
  selectedClass: Klass = 'blade';
  selectedChapter: 1 | 2 | 3 = 1;

  private rects: Array<{ rect: Rect; act: string }> = [];

  constructor(private readonly input: Input) {}

  open(p: CampPanel): void {
    this.panel = p;
  }

  /** 面板打开时每帧调用。返回 'start'(出发)| 'classChanged' | null;消费输入。 */
  update(): 'start' | 'classChanged' | null {
    if (this.panel === 'none') return null;
    if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyF') || this.input.wasPressed('PadB')) {
      this.panel = 'none';
      return null;
    }
    if (this.panel === 'expedition' && (this.input.wasPressed('Enter') || this.input.wasPressed('PadStart'))) {
      this.panel = 'none';
      return 'start';
    }
    if (!this.input.mousePressed) return null;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    let hit = false;
    for (const r of this.rects) {
      if (!inside(r.rect, mx, my)) continue;
      hit = true;
      if (r.act === 'go') {
        this.panel = 'none';
        return 'start';
      }
      if (r.act.startsWith('ch')) {
        const ch = Number(r.act.slice(2)) as 1 | 2 | 3;
        const cfg = balance.chapters[String(ch) as '1' | '2' | '3'];
        if (meta.data.stats.clears >= cfg.unlockClears) this.selectedChapter = ch;
      }
      if (r.act.startsWith('kl_')) {
        const k = r.act.slice(3) as Klass;
        if (k !== this.selectedClass) {
          this.selectedClass = k;
          this.panel = 'none';
          return 'classChanged';
        }
      }
      if (r.act.startsWith('up_')) this.tryUpgrade(r.act.slice(3) as 'hp' | 'atk' | 'luck');
    }
    if (!hit) this.panel = 'none'; // 点面板外关闭
    return null;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.panel === 'none') return;
    this.rects = [];
    ctx.save();
    ctx.fillStyle = 'rgba(13,15,26,0.6)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';

    if (this.panel === 'expedition') this.renderExpedition(ctx, w, h);
    else if (this.panel === 'altar') this.renderAltar(ctx, w, h);
    else this.renderClasspick(ctx, w, h);
    ctx.restore();
  }

  // ---- 出征 ----
  private renderExpedition(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 560;
    const ph = 250;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    panelBox(ctx, px, py, pw, ph);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('🌀 远征传送门', w / 2, py + 34);

    const chs: Array<1 | 2 | 3> = [1, 2, 3];
    chs.forEach((ch, i) => {
      const cfg = balance.chapters[String(ch) as '1' | '2' | '3'];
      const locked = meta.data.stats.clears < cfg.unlockClears;
      const rect: Rect = { x: px + 24 + i * ((pw - 48 - 24) / 3 + 12), y: py + 58, w: (pw - 48 - 24) / 3, h: 66 };
      const sel = this.selectedChapter === ch;
      ctx.fillStyle = sel ? '#2a3147' : '#1a1f30';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = sel ? UI.gold : '#3a4154';
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = locked ? UI.dim : sel ? UI.gold : UI.text;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(locked ? `🔒 第${ch}章` : `第${ch}章`, rect.x + rect.w / 2, rect.y + 26);
      ctx.font = '11px monospace';
      ctx.fillStyle = UI.dim;
      ctx.fillText(locked ? `通关${cfg.unlockClears}次解锁` : cfg.name, rect.x + rect.w / 2, rect.y + 48);
      this.rects.push({ rect, act: `ch${ch}` });
    });

    const go: Rect = { x: w / 2 - 110, y: py + ph - 78, w: 220, h: 46 };
    ctx.fillStyle = '#2a3147';
    ctx.fillRect(go.x, go.y, go.w, go.h);
    ctx.strokeStyle = UI.gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(go.x, go.y, go.w, go.h);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('⚔ 出发!', w / 2, go.y + 30);
    this.rects.push({ rect: go, act: 'go' });
    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText('[Enter] 出发 · [Esc/F] 关闭', w / 2, py + ph - 14);
  }

  // ---- 祭坛 ----
  private renderAltar(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 560;
    const ph = 268;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    panelBox(ctx, px, py, pw, ph);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('⭐ 星陨祭坛(永久成长)', w / 2, py + 34);
    ctx.font = '12px monospace';
    ctx.fillText(`✦ 星尘 ${meta.data.stardust}`, w / 2, py + 56);

    const branches: Array<{ key: 'hp' | 'atk' | 'luck'; name: string; per: string }> = [
      { key: 'hp', name: '生命祝福', per: `+3%生命/级` },
      { key: 'atk', name: '攻击祝福', per: `+3%攻击/级` },
      { key: 'luck', name: '幸运祝福', per: `+3幸运/级` },
    ];
    branches.forEach((b, i) => {
      const bw = (pw - 48 - 24) / 3;
      const rect: Rect = { x: px + 24 + i * (bw + 12), y: py + 72, w: bw, h: 128 };
      const lvl = meta.data.altar[b.key];
      const maxed = lvl >= balance.altar.maxLevel;
      const cost = altarCost(lvl);
      const afford = !maxed && meta.data.stardust >= cost;
      ctx.fillStyle = '#1a1f30';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = afford ? UI.hp : '#3a4154';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = UI.text;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(b.name, rect.x + bw / 2, rect.y + 24);
      ctx.fillStyle = UI.dim;
      ctx.font = '11px monospace';
      ctx.fillText(`Lv.${lvl}/${balance.altar.maxLevel}`, rect.x + bw / 2, rect.y + 44);
      ctx.fillText(b.per, rect.x + bw / 2, rect.y + 62);
      ctx.fillStyle = maxed ? UI.dim : afford ? UI.hp : UI.dim;
      ctx.font = '12px monospace';
      ctx.fillText(maxed ? '已满级' : `升级 ✦${cost}`, rect.x + bw / 2, rect.y + 104);
      this.rects.push({ rect, act: `up_${b.key}` });
    });
    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText('点击分支升级 · [Esc/F] 关闭', w / 2, py + ph - 14);
  }

  // ---- 职业试炼 ----
  private renderClasspick(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 640;
    const ph = 220;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    panelBox(ctx, px, py, pw, ph);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('🏵 职业试炼场', w / 2, py + 34);

    const classes: Array<{ klass: Klass; icon: string; desc: string }> = [
      { klass: 'blade', icon: '⚔', desc: '三段连斩·近战爆发' },
      { klass: 'ranger', icon: '🏹', desc: '连射弓·走位风筝' },
      { klass: 'arcanist', icon: '✨', desc: '追踪法球·闪现风暴' },
      { klass: 'warden', icon: '🛡', desc: '重锤眩晕·坦克冲锋' },
    ];
    classes.forEach((c, i) => {
      const bw = (pw - 48 - 36) / 4;
      const rect: Rect = { x: px + 24 + i * (bw + 12), y: py + 56, w: bw, h: 108 };
      const cfg = balance.classes[c.klass];
      const sel = this.selectedClass === c.klass;
      ctx.fillStyle = sel ? '#2a3147' : '#1a1f30';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = sel ? UI.gold : '#3a4154';
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.font = '22px monospace';
      ctx.fillText(c.icon, rect.x + bw / 2, rect.y + 34);
      ctx.fillStyle = sel ? UI.gold : UI.text;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`${cfg.hero}·${cfg.name}`, rect.x + bw / 2, rect.y + 58);
      ctx.fillStyle = UI.dim;
      ctx.font = '10px monospace';
      ctx.fillText(c.desc, rect.x + bw / 2, rect.y + 78);
      if (sel) ctx.fillText('(出战中)', rect.x + bw / 2, rect.y + 94);
      this.rects.push({ rect, act: `kl_${c.klass}` });
    });
    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText('点击切换出战职业(营地内立即换人试招)· [Esc/F] 关闭', w / 2, py + ph - 14);
  }

  private tryUpgrade(key: 'hp' | 'atk' | 'luck'): void {
    const lvl = meta.data.altar[key];
    if (lvl >= balance.altar.maxLevel) return;
    const cost = altarCost(lvl);
    if (meta.data.stardust < cost) return;
    meta.data.stardust -= cost;
    meta.data.altar[key] += 1;
    meta.save();
  }
}
