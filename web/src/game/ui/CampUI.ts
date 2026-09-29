import type { Input } from '@engine/input/Input';
import balance from '@data/balance.json';
import { UI } from '@game/constants';
import { altarCost } from '@game/dungeon/Scaling';
import { dailyChallenge, dailyKey, type DailyChallenge } from '@game/meta/Daily';
import { drawPanel9 } from '@game/gfx/nineSlice';
import { meta } from '@game/meta/Save';

interface Rect { x: number; y: number; w: number; h: number }

type Klass = 'blade' | 'ranger' | 'arcanist' | 'warden';
export type CampPanel = 'none' | 'expedition' | 'altar' | 'classpick' | 'daily';

const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function panelBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  if (drawPanel9(ctx, x, y, w, h)) return;
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
    // 挂在营地久玩跨零点时,重新取当天词条(否则玩家会拿着昨天的规则开跑)
    if (p === 'daily') this.daily = dailyChallenge(dailyKey(new Date()));
    this.panel = p;
  }

  /** 面板打开时每帧调用。返回 'start'(出发)| 'classChanged' | null;消费输入。 */
  update(): 'start' | 'startDaily' | 'classChanged' | null {
    if (this.panel === 'none') return null;
    if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyF') || this.input.wasPressed('PadB')) {
      this.panel = 'none';
      return null;
    }
    if (this.panel === 'expedition' && (this.input.wasPressed('Enter') || this.input.wasPressed('PadStart'))) {
      this.panel = 'none';
      return 'start';
    }
    if (this.panel === 'daily' && (this.input.wasPressed('Enter') || this.input.wasPressed('PadStart'))) {
      this.panel = 'none';
      return 'startDaily';
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
      if (r.act === 'goDaily') {
        this.panel = 'none';
        return 'startDaily';
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
    else if (this.panel === 'daily') this.renderDaily(ctx, w, h);
    else this.renderClasspick(ctx, w, h);
    ctx.restore();
  }

  /** 当日挑战信息(营地渲染与面板共用) */
  daily: DailyChallenge = dailyChallenge(dailyKey(new Date()));

  // ---- 每日挑战(混沌祭坛) ----
  private renderDaily(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 620;
    const ph = 380;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    panelBox(ctx, px, py, pw, ph);

    const d = meta.data.daily;
    const done = d.key === this.daily.key && d.cleared;

    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('🗓 每日挑战 · 混沌祭坛', w / 2, py + 34);
    ctx.font = '12px monospace';
    ctx.fillStyle = UI.text;
    ctx.fillText(`${this.daily.key} · 每日 0 点刷新 · 全服同种子`, w / 2, py + 56);

    // 今日词条(3 条)
    const ch = this.daily.mods;
    const cw = (pw - 48 - 16) / 3;
    ch.forEach((m, i) => {
      const rx = px + 24 + i * (cw + 8);
      const ry = py + 76;
      ctx.fillStyle = '#1a1f30';
      ctx.fillRect(rx, ry, cw, 108);
      ctx.strokeStyle = '#3a4154';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, cw, 108);
      ctx.fillStyle = UI.gold;
      ctx.font = 'bold 15px monospace';
      ctx.fillText(m.name, rx + cw / 2, ry + 28);
      ctx.fillStyle = UI.text;
      ctx.font = '11px monospace';
      // 描述按 12 字折行
      const words = m.desc.split('、');
      words.forEach((line, li) => {
        ctx.fillText(line, rx + cw / 2, ry + 54 + li * 16);
      });
    });

    // 记录
    ctx.font = '12px monospace';
    if (d.key === this.daily.key && (d.cleared || d.bestTimeS > 0)) {
      const t = Math.floor(d.bestTimeS / 60);
      const sec = Math.floor(d.bestTimeS % 60).toString().padStart(2, '0');
      ctx.fillStyle = d.cleared ? UI.gold : UI.dim;
      ctx.fillText(
        d.cleared
          ? `✅ 今日已通关 · 最佳 ${t}:${sec} · 击杀 ${d.bestKills}`
          : `今日最佳 ${t}:${sec} · 击杀 ${d.bestKills}(尚未通关)`,
        w / 2, py + 216,
      );
    } else {
      ctx.fillStyle = UI.dim;
      ctx.fillText('今日尚未挑战 —— 章节固定第一章,词条全服一致', w / 2, py + 216);
    }

    const go: Rect = { x: w / 2 - 110, y: py + ph - 84, w: 220, h: 46 };
    ctx.fillStyle = '#2a3147';
    ctx.fillRect(go.x, go.y, go.w, go.h);
    ctx.strokeStyle = UI.gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(go.x, go.y, go.w, go.h);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(done ? '⚔ 再挑战一次' : '⚔ 开始挑战', w / 2, go.y + 30);
    this.rects.push({ rect: go, act: 'goDaily' });

    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText('[Enter] 开始 · [Esc/F] 关闭 · 词条只在本局生效,不影响普通远征', w / 2, py + ph - 16);
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
