import type { Input } from '@engine/input/Input';
import balance from '@data/balance.json';
import { basicSpec, describeBasic } from '@game/combat/BasicAttack';
import { UI } from '@game/constants';
import { altarCost } from '@game/dungeon/Scaling';
import { dailyChallenge, dailyKey, type DailyChallenge } from '@game/meta/Daily';
import { weeklyChallenge, weeklyKey, weeklyLabel, type WeeklyChallenge } from '@game/meta/Weekly';
import { LAYOUT_LABELS } from '@game/dungeon/RoomLayouts';
import { drawPanel9 } from '@game/gfx/nineSlice';
import { meta } from '@game/meta/Save';
import { BLUEPRINTS, blueprintOf, craftBlocker, blockerText } from '@game/loot/Blueprint';
import { specialDef } from '@game/loot/Specials';
import { ABYSS_LEVELS, NORMAL, abyssUnlocked, lockReason, summaryOf } from '@game/dungeon/Abyss';
import { ENEMY_KEYS, RUNE_KEYS, codexProgress, enemyEntry, isBossKey, runeEntry } from '@game/meta/Codex';
import { ACHIEVEMENTS, ACHV_CATS, achvProgress, achvInCat, isUnlocked, summaryLine } from '@game/meta/Achievements';
import {
  BOARD_HINT, BOARD_IDS, BOARD_LABEL, boardsFilled, formatScore, tagLabel,
} from '@game/meta/Leaderboard';

interface Rect { x: number; y: number; w: number; h: number }

type Klass = 'blade' | 'ranger' | 'arcanist' | 'warden';
export type CampPanel = 'none' | 'expedition' | 'altar' | 'classpick' | 'daily' | 'codex' | 'achv' | 'forge';

const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 铸台里显示的部位名(玩家看得懂的一句话,不是内部 key) */
const SLOT_LABEL: Record<string, string> = {
  weapon: '武器', helmet: '头盔', chest: '胸甲', boots: '靴子', ring: '戒指', amulet: '项链',
};
const slotLabel = (s: string): string => SLOT_LABEL[s] ?? s;

/**
 * 按宽度硬折行:画布没有自动换行(measureText 只给宽度),中文按字宽 ≈ 字号算。
 * 只用在铸台的描述行 —— 长描述不至于横穿面板。
 */
function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    line += ch;
    if (line.length >= cols) { out.push(line); line = ''; }
  }
  if (line) out.push(line);
  return out.slice(0, 3);
}

function panelBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  if (drawPanel9(ctx, x, y, w, h)) return;
  ctx.fillStyle = 'rgba(19,23,36,0.96)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3a4154';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

/**
 * 星陨营地面板层:出征(章节+出发)/ 星陨祭坛(三系升级)/ 职业试炼(换角色)/ 星辉铸台(蓝图)。
 * 出战职业/章节的唯一存储在此;铸台的"已学蓝图"存 meta.data.blueprints(只增不减)。
 */
export class CampUI {
  panel: CampPanel = 'none';
  selectedClass: Klass = 'blade';
  selectedChapter: 1 | 2 | 3 = 1;
  /** 图鉴页签(怪物 / 符文)与选中项 */
  codexTab: 'enemy' | 'rune' = 'enemy';
  codexPick: string | null = null;
  /** 混沌祭坛页签:今日(每日挑战)/ 本周(周常挑战) */
  dailyTab: 'today' | 'week' = 'today';
  /** 星陨殿堂页签:成就 / 排行榜 */
  hallTab: 'achv' | 'board' = 'achv';
  /** 选中的深渊难度档(0 = 普通远征;轮 23)。解锁状态每帧现读存档,不缓存(通关后应立刻可选) */
  selectedAbyss = NORMAL;
  /** 铸台选中的蓝图 id(默认第一张) */
  forgePick: string = BLUEPRINTS[0]?.id ?? '';
  /** 铸台当前提示:挡住了为什么 / 成功后一句话(菜单里没有 Toast,就地显示) */
  forgeNotice = '';

  private rects: Array<{ rect: Rect; act: string }> = [];

  constructor(private readonly input: Input) {}

  open(p: CampPanel): void {
    // 挂在营地久玩跨零点(或跨周)时重新取规则,否则玩家会拿着过期规则开跑
    if (p === 'daily') {
      this.daily = dailyChallenge(dailyKey(new Date()));
      this.weekly = weeklyChallenge(weeklyKey(new Date()));
    }
    this.panel = p;
  }

  /** 面板打开时每帧调用。返回 'start'(出发)| 'classChanged' | null;消费输入。 */
  update(): 'start' | 'startDaily' | 'startWeekly' | 'classChanged' | 'crafted' | null {
    if (this.panel === 'none') return null;
    if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyF') || this.input.wasPressed('PadB')) {
      this.panel = 'none';
      return null;
    }
    if (this.panel === 'expedition' && (this.input.wasPressed('Enter') || this.input.wasPressed('PadStart'))) {
      this.panel = 'none';
      return 'start';
    }
    // 混沌祭坛:Tab 切「今日 / 本周」,Enter 打当前页签
    if (this.panel === 'daily' && this.input.wasPressed('Tab')) {
      this.dailyTab = this.dailyTab === 'today' ? 'week' : 'today';
    }
    // 星陨殿堂:Tab 切「成就 / 排行榜」
    if (this.panel === 'achv' && this.input.wasPressed('Tab')) {
      this.hallTab = this.hallTab === 'achv' ? 'board' : 'achv';
    }
    if (this.panel === 'daily' && (this.input.wasPressed('Enter') || this.input.wasPressed('PadStart'))) {
      this.panel = 'none';
      return this.dailyTab === 'week' ? 'startWeekly' : 'startDaily';
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
      if (r.act === 'goWeekly') {
        this.panel = 'none';
        return 'startWeekly';
      }
      if (r.act === 'tabToday') this.dailyTab = 'today';
      if (r.act === 'tabWeek') this.dailyTab = 'week';
      if (r.act === 'hallAchv') this.hallTab = 'achv';
      if (r.act === 'hallBoard') this.hallTab = 'board';
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
      if (r.act.startsWith('ab') && r.act.length > 2) {
        // 深渊档(轮 23):锁着就**不切**(点一下锁定层却切过去,比不响应更糟)
        const idx = Number(r.act.slice(2));
        if (abyssUnlocked(idx, { clears: meta.data.stats.clears, abyssClears: meta.data.abyssClears })) {
          this.selectedAbyss = idx;
        }
      }
      if (r.act.startsWith('bp_')) { this.forgePick = r.act.slice(3); this.forgeNotice = ''; }
      if (r.act === 'forgeLearn') return this.tryLearn();
      if (r.act === 'forgeCraft') return this.tryCraft();
      if (r.act === 'codex_enemy') { this.codexTab = 'enemy'; this.codexPick = null; }
      if (r.act === 'codex_rune') { this.codexTab = 'rune'; this.codexPick = null; }
      if (r.act.startsWith('cx_')) this.codexPick = r.act.slice(3);
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

    if (this.panel === 'forge') this.renderForge(ctx, w, h);
    else if (this.panel === 'expedition') this.renderExpedition(ctx, w, h);
    else if (this.panel === 'altar') this.renderAltar(ctx, w, h);
    else if (this.panel === 'daily') this.renderDaily(ctx, w, h);
    else if (this.panel === 'codex') this.renderCodex(ctx, w, h);
    else if (this.panel === 'achv') this.renderAchv(ctx, w, h);
    else this.renderClasspick(ctx, w, h);
    ctx.restore();
  }



  // ---- 星陨殿堂:成就 / 排行榜 ----
  private renderAchv(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 720, ph = 470;
    const px = w / 2 - pw / 2, py = h / 2 - ph / 2;
    panelBox(ctx, px, py, pw, ph);
    this.renderHallTabs(ctx, w, py + 10);
    if (this.hallTab === 'board') { this.renderBoards(ctx, w, px, py, pw, ph); return; }

    const prog = achvProgress(meta.data);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('🏆 星陨殿堂 · 成就', w / 2, py + 62);
    ctx.font = '12px monospace';
    ctx.fillStyle = prog.unlocked >= prog.total ? UI.gold : UI.dim;
    ctx.fillText(
      prog.unlocked >= prog.total
        ? `★ 全成就达成 ${prog.unlocked}/${prog.total}`
        : `成就 ${prog.unlocked}/${prog.total} · ${(prog.pct * 100).toFixed(0)}%`,
      w / 2, py + 82);
    ctx.fillStyle = UI.text;
    ctx.fillText(summaryLine(meta.data), w / 2, py + 100);

    // 分类分栏(每类一行,行内放该类的成就格子)
    const cats = ACHV_CATS;
    const gx = px + 22;
    const gy = py + 116;
    const rowH = 46;
    cats.forEach((cat, ci) => {
      const list = achvInCat(cat);
      const ry = gy + ci * rowH;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#5a6377';
      ctx.font = '11px monospace';
      ctx.fillText(cat, gx, ry + 12);
      ctx.textAlign = 'center';
      const sub = ACHIEVEMENTS.filter((a) => a.cat === cat).length;
      const cellW = Math.min(150, Math.floor((pw - 100) / Math.max(1, sub)) - 6);
      list.forEach((a, i) => {
        const cx = gx + 44 + i * (cellW + 6);
        const cy = ry;
        const got = isUnlocked(meta.data, a.id);
        const { cur, goal } = a.progress(meta.data);
        const ratio = goal > 0 ? Math.min(1, cur / goal) : 0;

        ctx.fillStyle = got ? '#2a2a1c' : '#161a26';
        ctx.fillRect(cx, cy, cellW, 34);
        ctx.strokeStyle = got ? UI.gold : '#2a3147';
        ctx.lineWidth = got ? 2 : 1;
        ctx.strokeRect(cx, cy, cellW, 34);

        ctx.font = '13px monospace';
        ctx.fillStyle = got ? UI.gold : '#4a5164';
        ctx.fillText(got ? a.icon : '🔒', cx + 14, cy + 22);
        ctx.font = '10px monospace';
        ctx.fillStyle = got ? UI.text : UI.dim;
        ctx.textAlign = 'left';
        ctx.fillText(a.name, cx + 26, cy + 14);
        ctx.font = '9px monospace';
        ctx.fillStyle = UI.dim;
        ctx.fillText(got ? '已达成' : `${Math.min(cur, goal)}/${goal}`, cx + 26, cy + 27);
        ctx.textAlign = 'center';

        // 进度条(未解锁才画)
        if (!got && ratio > 0) {
          ctx.fillStyle = '#2a3147';
          ctx.fillRect(cx + 2, cy + 32, cellW - 4, 2);
          ctx.fillStyle = UI.gold;
          ctx.fillRect(cx + 2, cy + 32, (cellW - 4) * ratio, 2);
        }
      });
    });

    // 底部提示 + 最近解锁
    const recent = ACHIEVEMENTS
      .filter((a) => isUnlocked(meta.data, a.id))
      .sort((a, b) => (meta.data.achievements.unlocked[b.id] ?? 0) - (meta.data.achievements.unlocked[a.id] ?? 0))[0];
    ctx.font = '11px monospace';
    ctx.fillStyle = UI.dim;
    ctx.fillText(
      recent ? `最近解锁:${recent.icon} ${recent.name}(${recent.desc})` : '还没有解锁任何成就 —— 出去打一局吧',
      w / 2, py + ph - 26);
    ctx.fillText('[Esc/F] 关闭 · 成就跨局保留', w / 2, py + ph - 12);
  }

  // ---- 图鉴(收录) ----
  private renderCodex(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 700, ph = 470;
    const px = w / 2 - pw / 2, py = h / 2 - ph / 2;
    panelBox(ctx, px, py, pw, ph);

    const prog = codexProgress(meta.data.codex);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('📖 星陨图鉴', w / 2, py + 32);
    ctx.font = '12px monospace';
    ctx.fillStyle = UI.dim;
    ctx.fillText(
      `怪物 ${prog.enemyFound}/${prog.enemyTotal} · 符文 ${prog.runeFound}/${prog.runeTotal}` +
      (prog.enemyFound >= prog.enemyTotal && prog.runeFound >= prog.runeTotal ? ' · ★ 全收录!' : ''),
      w / 2, py + 52);

    // 页签
    const tabs: Array<{ id: 'enemy' | 'rune'; label: string; act: string }> = [
      { id: 'enemy', label: `👾 怪物 ${prog.enemyFound}/${prog.enemyTotal}`, act: 'codex_enemy' },
      { id: 'rune', label: `◈ 符文 ${prog.runeFound}/${prog.runeTotal}`, act: 'codex_rune' },
    ];
    tabs.forEach((t, i) => {
      const r: Rect = { x: px + 24 + i * 172, y: py + 64, w: 164, h: 30 };
      const active = this.codexTab === t.id;
      ctx.fillStyle = active ? '#2a3147' : '#1a1f30';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = active ? UI.gold : '#3a4154';
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = active ? UI.text : UI.dim;
      ctx.font = '13px monospace';
      ctx.fillText(t.label, r.x + r.w / 2, r.y + 20);
      this.rects.push({ rect: r, act: t.act });
    });

    // 左侧网格
    const gx = px + 24, gy = py + 106;
    const cols = this.codexTab === 'enemy' ? 6 : 9;
    const cell = this.codexTab === 'enemy' ? 46 : 34;
    const keys = this.codexTab === 'enemy' ? ENEMY_KEYS : RUNE_KEYS;
    const owned = this.codexTab === 'enemy' ? meta.data.codex.enemies : meta.data.codex.runes;

    keys.forEach((k, i) => {
      const cx = gx + (i % cols) * cell;
      const cy = gy + Math.floor(i / cols) * cell;
      const got = (owned[k] ?? 0) > 0;
      const pick = this.codexPick === k;
      ctx.fillStyle = got ? '#1f2740' : '#141826';
      ctx.fillRect(cx, cy, cell - 6, cell - 6);
      ctx.strokeStyle = pick ? UI.gold : got ? '#3a4154' : '#242a3a';
      ctx.lineWidth = pick ? 2 : 1;
      ctx.strokeRect(cx, cy, cell - 6, cell - 6);
      ctx.fillStyle = got ? (isBossKey(k) ? UI.gold : UI.text) : '#3a4154';
      ctx.font = `${this.codexTab === 'enemy' ? 16 : 13}px monospace`;
      ctx.fillText(got ? this.codexGlyph(k) : '?', cx + (cell - 6) / 2, cy + (cell - 6) / 2 + 6);
      this.rects.push({ rect: { x: cx, y: cy, w: cell - 6, h: cell - 6 }, act: `cx_${k}` });
    });

    // 右侧详情
    const dx = gx + cols * cell + 16;
    const dw = px + pw - 24 - dx;
    ctx.fillStyle = 'rgba(19,23,36,0.7)';
    ctx.fillRect(dx, gy - 28, dw, ph - 150);
    ctx.strokeStyle = '#3a4154';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(dx, gy - 28, dw, ph - 150);
    ctx.textAlign = 'left';
    if (this.codexPick) this.renderCodexDetail(ctx, dx + 12, gy - 10, this.codexPick);
    else {
      ctx.fillStyle = UI.dim;
      ctx.font = '12px monospace';
      ctx.fillText('点左侧格子查看条目', dx + 12, gy - 8);
      ctx.fillText('★ = Boss · 未收录显示 ?', dx + 12, gy + 10);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText('图鉴跨局保留 · 数值来自 balance.json(调平衡不会让老档失真)· [Esc/F] 关闭', w / 2, py + ph - 12);
  }

  /** 未读条目用 ? 剪影,已读用图标(怪物用首字,Boss 用 ★) */
  private codexGlyph(key: string): string {
    if (this.codexTab === 'rune') {
      const r = runeEntry(key);
      return r?.element === 'fire' ? '🔥' : r?.element === 'ice' ? '❄' : r?.element === 'bolt' ? '⚡' : r?.element === 'toxin' ? '☠' : '◈';
    }
    if (isBossKey(key)) return '★';
    const name = enemyEntry(key)?.name ?? key;
    return name.slice(0, 1);
  }

  private renderCodexDetail(ctx: CanvasRenderingContext2D, x: number, y: number, key: string): void {
    const line = (text: string, dy: number, color: string = UI.text, font = '12px monospace'): void => {
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.fillText(text, x, y + dy);
    };
    if (this.codexTab === 'enemy') {
      const e = enemyEntry(key);
      if (!e) return;
      line(`${e.boss ? '★ ' : ''}${e.name}`, 14, e.boss ? UI.gold : UI.text, 'bold 15px monospace');
      line(`出没:第${e.chapter}章 ${e.chapterName}`, 36, UI.dim);
      const kills = meta.data.codex.enemies[key] ?? 0;
      line(`击杀:${kills}`, 54, UI.dim);
      line('── 属性 ──', 78, '#5a6377');
      line(`血量 ${e.hp}   攻击 ${e.atk}`, 96);
      line(`防御 ${e.def}   速度 ${e.speed} m/s`, 112);
      line(`体型 ${e.bodyRadius} m`, 128, UI.dim);
      line('── 行为 ──', 152, '#5a6377');
      // 按 15 字折行
      const chars = [...e.hint];
      for (let i = 0; i < chars.length; i += 15) {
        line(chars.slice(i, i + 15).join(''), 170 + (i / 15) * 16, UI.text);
      }
    } else {
      const r = runeEntry(key);
      if (!r) return;
      line(`◈ ${r.name}`, 14, '#B067E8', 'bold 15px monospace');
      line(`职业:${r.klassName} · 技能位 ${r.skillSlot}`, 36, UI.dim);
      line(`元素:${r.element ?? '无(纯净星辉)'}`, 54, UI.dim);
      line(`次数:${meta.data.codex.runes[key] ?? 0}`, 70, UI.dim);
      line('── 效果 ──', 94, '#5a6377');
      const chars = [...r.desc];
      for (let i = 0; i < chars.length; i += 15) {
        line(chars.slice(i, i + 15).join(''), 112 + (i / 15) * 16, UI.text);
      }
    }
  }

  /** 当日挑战信息(营地渲染与面板共用) */
  daily: DailyChallenge = dailyChallenge(dailyKey(new Date()));
  /** 本周挑战信息 */
  weekly: WeeklyChallenge = weeklyChallenge(weeklyKey(new Date()));

  // ---- 混沌祭坛:今日 / 本周 ----
  private renderDaily(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.dailyTab === 'week') return this.renderWeekly(ctx, w, h);
    this.renderDailyToday(ctx, w, h);
  }

  /** 页签条(今日 / 本周),两页共用 */
  private renderChallengeTabs(ctx: CanvasRenderingContext2D, w: number, py: number): void {
    const tabs: Array<{ act: string; key: 'today' | 'week'; label: string }> = [
      { act: 'tabToday', key: 'today', label: '🗓 今日挑战' },
      { act: 'tabWeek', key: 'week', label: '🏅 本周挑战' },
    ];
    tabs.forEach((t, i) => {
      const rw = 132;
      const r: Rect = { x: w / 2 - rw - 4 + i * (rw + 8), y: py, w: rw, h: 26 };
      const on = this.dailyTab === t.key;
      ctx.fillStyle = on ? '#2a3147' : '#1a1f30';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = on ? UI.gold : '#3a4154';
      ctx.lineWidth = on ? 2 : 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = on ? UI.gold : UI.dim;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(t.label, r.x + r.w / 2, r.y + 17);
      this.rects.push({ rect: r, act: t.act });
    });
  }

  private renderDailyToday(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 620;
    const ph = 400;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    panelBox(ctx, px, py, pw, ph);

    const d = meta.data.daily;
    const done = d.key === this.daily.key && d.cleared;

    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('🗓 混沌祭坛', w / 2, py + 30);
    this.renderChallengeTabs(ctx, w, py + 42);
    ctx.font = '12px monospace';
    ctx.fillStyle = UI.text;
    ctx.fillText(`${this.daily.key} · 每日 0 点刷新 · 全服同种子 · 章节固定第一章`, w / 2, py + 88);

    // 今日词条(3 条)
    const ch = this.daily.mods;
    const cw = (pw - 48 - 16) / 3;
    ch.forEach((m, i) => {
      const rx = px + 24 + i * (cw + 8);
      const ry = py + 100;
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
        w / 2, py + 240,
      );
    } else {
      ctx.fillStyle = UI.dim;
      ctx.fillText('今日尚未挑战 —— 章节固定第一章,词条全服一致', w / 2, py + 240);
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
    ctx.fillText('[Tab] 切今日/本周 · [Enter] 开始 · [Esc/F] 关闭 · 词条只在本局生效', w / 2, py + ph - 16);
  }

  /** 本周页:1 条铁律(结构性)+ 2 条抽取的每日词条 + 结构摘要 + 记录 */
  private renderWeekly(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 620;
    const ph = 400;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    panelBox(ctx, px, py, pw, ph);

    const rec = meta.data.weekly;
    const done = rec.key === this.weekly.key && rec.cleared;
    const st = this.weekly.structure;

    ctx.fillStyle = '#8fd4c8';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('🏅 周常挑战 · 混沌祭坛', w / 2, py + 30);
    this.renderChallengeTabs(ctx, w, py + 42);
    ctx.font = '12px monospace';
    ctx.fillStyle = UI.text;
    ctx.fillText(`${this.weekly.key}(${weeklyLabel(this.weekly.key)})· 周一刷新 · 本周内成绩可比`, w / 2, py + 88);

    // 三张卡:第 0 张是铁律,其余是本周从每日池抽到的词条
    const cw = (pw - 48 - 16) / 3;
    this.weekly.mods.forEach((m, i) => {
      const isRule = i === 0;
      const rx = px + 24 + i * (cw + 8);
      const ry = py + 100;
      ctx.fillStyle = isRule ? '#2a2438' : '#1a1f30';
      ctx.fillRect(rx, ry, cw, 108);
      ctx.strokeStyle = isRule ? '#8fd4c8' : '#3a4154';
      ctx.lineWidth = isRule ? 2 : 1.5;
      ctx.strokeRect(rx, ry, cw, 108);
      ctx.fillStyle = isRule ? '#8fd4c8' : UI.gold;
      ctx.font = 'bold 15px monospace';
      ctx.fillText(m.name, rx + cw / 2, ry + 30);
      ctx.fillStyle = UI.dim;
      ctx.font = '10px monospace';
      ctx.fillText(isRule ? '本周铁律' : '周词条', rx + cw / 2, ry + 16);
      ctx.fillStyle = UI.text;
      ctx.font = '11px monospace';
      m.desc.split('、').forEach((line, li) => ctx.fillText(line, rx + cw / 2, ry + 58 + li * 16));
    });

    // 结构摘要(把铁律"改了什么"翻译成人话)
    const bits: string[] = [];
    if (st.extraWaves > 0) bits.push(`每房 +${st.extraWaves} 波`);
    if (st.shopClosed) bits.push('商店关门');
    if (st.altarOff) bits.push('祭坛成长失效');
    if (st.eliteShift !== 0) bits.push(`精英房${st.eliteShift < 0 ? '提前' : '推后'} ${Math.abs(st.eliteShift)} 间`);
    if (st.forcedLayout !== null) bits.push(`地形定死「${LAYOUT_LABELS[st.forcedLayout]}」`);
    ctx.font = '12px monospace';
    ctx.fillStyle = bits.length > 0 ? '#8fd4c8' : UI.dim;
    ctx.fillText(bits.length > 0 ? `本周结构:${bits.join(' · ')}` : '本周结构:无(纯词条)', w / 2, py + 232);

    ctx.font = '12px monospace';
    if (rec.key === this.weekly.key && (rec.cleared || rec.bestTimeS > 0)) {
      const t = Math.floor(rec.bestTimeS / 60);
      const sec = Math.floor(rec.bestTimeS % 60).toString().padStart(2, '0');
      ctx.fillStyle = rec.cleared ? UI.gold : UI.dim;
      ctx.fillText(
        rec.cleared
          ? `✅ 本周已通关 · 最佳 ${t}:${sec} · 击杀 ${rec.bestKills}`
          : `本周最佳 ${t}:${sec} · 击杀 ${rec.bestKills}(尚未通关)`,
        w / 2, py + 254,
      );
    } else {
      ctx.fillStyle = UI.dim;
      ctx.fillText('本周尚未挑战 —— 铁律一周一换,打完记一笔', w / 2, py + 254);
    }

    const go: Rect = { x: w / 2 - 110, y: py + ph - 84, w: 220, h: 46 };
    ctx.fillStyle = '#243a3a';
    ctx.fillRect(go.x, go.y, go.w, go.h);
    ctx.strokeStyle = '#8fd4c8';
    ctx.lineWidth = 2;
    ctx.strokeRect(go.x, go.y, go.w, go.h);
    ctx.fillStyle = '#8fd4c8';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(done ? '⚔ 再刷一次周常' : '⚔ 开始周常挑战', w / 2, go.y + 30);
    this.rects.push({ rect: go, act: 'goWeekly' });

    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText('[Tab] 切今日/本周 · [Enter] 开始 · [Esc/F] 关闭', w / 2, py + ph - 16);
  }

  /** 殿堂页签条(成就 / 排行榜) */
  private renderHallTabs(ctx: CanvasRenderingContext2D, w: number, py: number): void {
    const tabs: Array<{ act: string; key: 'achv' | 'board'; label: string }> = [
      { act: 'hallAchv', key: 'achv', label: '🏆 成就' },
      { act: 'hallBoard', key: 'board', label: '🥇 排行榜' },
    ];
    tabs.forEach((t, i) => {
      const rw = 132;
      const r: Rect = { x: w / 2 - rw - 4 + i * (rw + 8), y: py, w: rw, h: 26 };
      const on = this.hallTab === t.key;
      ctx.fillStyle = on ? '#2a3147' : '#1a1f30';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = on ? UI.gold : '#3a4154';
      ctx.lineWidth = on ? 2 : 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = on ? UI.gold : UI.dim;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(t.label, r.x + r.w / 2, r.y + 17);
      this.rects.push({ rect: r, act: t.act });
    });
  }

  /** 排行榜页:四条榜各一行(名次 / 成绩 / 职业 / 章节 / 挑战徽标) */
  private renderBoards(
    ctx: CanvasRenderingContext2D, w: number,
    px: number, py: number, pw: number, ph: number,
  ): void {
    const lb = meta.data.leaderboard;
    const filled = boardsFilled(meta.data);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('🥇 星陨殿堂 · 排行榜', w / 2, py + 62);
    ctx.font = '12px monospace';
    ctx.fillStyle = filled >= BOARD_IDS.length ? UI.gold : UI.dim;
    ctx.fillText(
      `本地榜(不上云)· 已开榜 ${filled}/${BOARD_IDS.length} · 每榜保留前 ${balance.leaderboard.topN}`,
      w / 2, py + 82);

    const colW = (pw - 44) / 2;
    const rowH = 16;
    const headH = 24;
    BOARD_IDS.forEach((id, i) => {
      const bx = px + 22 + (i % 2) * (colW + 4);
      const by = py + 100 + Math.floor(i / 2) * 176;
      const list = lb[id];
      // 榜头
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1f30';
      ctx.fillRect(bx, by, colW, headH);
      ctx.fillStyle = list.length > 0 ? UI.gold : UI.dim;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(BOARD_LABEL[id], bx + 6, by + 16);
      ctx.fillStyle = UI.dim;
      ctx.font = '10px monospace';
      ctx.fillText(BOARD_HINT[id], bx + 6, by + headH + 12);

      if (list.length === 0) {
        ctx.fillStyle = UI.dim;
        ctx.font = '11px monospace';
        ctx.fillText('—— 还没有记录,出征一次就上榜 ——', bx + 6, by + headH + 32);
        return;
      }
      list.forEach((e, rank) => {
        const ry = by + headH + 22 + rank * rowH;
        if (rank === 0) {
          ctx.fillStyle = 'rgba(232,192,122,0.10)'; // 榜首底色
          ctx.fillRect(bx, ry - 11, colW, rowH);
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = rank === 0 ? UI.gold : UI.dim;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`${rank + 1}.`, bx + 6, ry);
        ctx.fillStyle = rank === 0 ? UI.gold : UI.text;
        ctx.font = 'bold 12px monospace';
        ctx.fillText(formatScore(id, e.score), bx + 26, ry);
        // 职业 + 章节 + 挑战徽标
        ctx.fillStyle = UI.dim;
        ctx.font = '10px monospace';
        const kls = balance.classes[e.klass].name;
        ctx.fillText(`${kls} · 第${e.chapter}章`, bx + 82, ry);
        const tag = tagLabel(e.tag);
        if (tag) {
          ctx.fillStyle = '#8fd4c8';
          ctx.fillText(tag, bx + colW - 70, ry);
        }
      });
    });

    // 挑战区:今日 / 本周记录(与混沌祭坛共用同一份存档,这里只读)
    const d = meta.data.daily;
    const wk = meta.data.weekly;
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    const fmt = (s: number): string => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    ctx.fillStyle = UI.dim;
    ctx.fillText(
      `🗓 今日 ${d.key || '—'} ${d.cleared ? `已通关 ${fmt(d.bestTimeS)}` : d.bestKills > 0 ? `击杀 ${d.bestKills}` : '未挑战'}`
      + `   ·   🏅 本周 ${wk.key || '—'} ${wk.cleared ? `已通关 ${fmt(wk.bestTimeS)}` : wk.bestKills > 0 ? `击杀 ${wk.bestKills}` : '未挑战'}`,
      w / 2, py + ph - 30);
    ctx.fillStyle = UI.dim;
    ctx.font = '10px monospace';
    ctx.fillText('[Tab] 切成就/排行榜 · [Esc/F] 关闭 · 榜单只存在本机存档', w / 2, py + ph - 12);
  }

  // ---- 出征 ----
  private renderExpedition(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 620;
    const ph = 292;
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

    // ---- 深渊难度(轮 23):普通远征 + 三层;锁着的显示解锁条件 ----
    const prog = { clears: meta.data.stats.clears, abyssClears: meta.data.abyssClears };
    const tiers: number[] = [NORMAL, ...ABYSS_LEVELS.map((l) => l.id)];
    const tierW = (pw - 48 - 24) / 4;
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    ctx.fillStyle = UI.dim;
    ctx.fillText('深渊难度(乘区只作用于本局;解锁后永久可选)', w / 2, py + 138);
    tiers.forEach((idx, i) => {
      const rect: Rect = { x: px + 24 + i * (tierW + 8), y: py + 148, w: tierW, h: 62 };
      const unlocked = abyssUnlocked(idx, prog);
      const sel = this.selectedAbyss === idx;
      ctx.fillStyle = sel ? '#3a2531' : '#1a1f30';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = sel ? UI.hpLow : unlocked ? '#3a4154' : '#2a2f3d';
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      const name = idx === NORMAL ? '远征' : ABYSS_LEVELS[idx - 1].name;
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = unlocked ? (sel ? UI.hpLow : UI.text) : UI.dim;
      ctx.fillText(unlocked ? name : `🔒 ${name}`, rect.x + rect.w / 2, rect.y + 22);
      ctx.font = '10px monospace';
      ctx.fillStyle = UI.dim;
      const line2 = unlocked
        ? (idx === NORMAL ? '基准' : `血×${ABYSS_LEVELS[idx - 1].hpMult} 掉×${ABYSS_LEVELS[idx - 1].lootMult}`)
        : (lockReason(idx, prog) ?? '');
      ctx.fillText(line2, rect.x + rect.w / 2, rect.y + 38);
      if (unlocked && (meta.data.abyssClears[idx - 1] ?? 0) > 0 && idx > 0) {
        ctx.fillStyle = UI.gold;
        ctx.fillText(`已通关 ${meta.data.abyssClears[idx - 1]} 次`, rect.x + rect.w / 2, rect.y + 52);
      }
      this.rects.push({ rect, act: `ab${idx}` });
    });
    ctx.fillStyle = UI.dim;
    ctx.font = '10px monospace';
    ctx.fillText(summaryOf(this.selectedAbyss), w / 2, py + 228);

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

  // ---- 星辉铸台:学图纸 / 按图纸铸造 ----

  /**
   * 学会图纸:花碎片把它写进存档。
   * 为什么把"学会"和"铸造"拆成两步:图纸是**长期投资**(学了永久留着,可反复铸),
   * 铸造是**当次消费**(扣碎片换一件开局装备)。合成一步会让玩家误以为图纸是一次性的。
   */
  private tryLearn(): 'crafted' | null {
    const bp = blueprintOf(this.forgePick);
    if (!bp) { this.forgeNotice = '找不到这张蓝图'; return null; }
    if (meta.data.blueprints.includes(bp.id)) { this.forgeNotice = '这张图纸已经会了'; return null; }
    if (meta.data.blueprintShards < bp.costShards) {
      this.forgeNotice = `碎片不足:${meta.data.blueprintShards}/${bp.costShards}(Boss 掉落,夜战 +1)`;
      return null;
    }
    meta.data.blueprintShards -= bp.costShards;
    meta.data.blueprints.push(bp.id);
    meta.save();
    this.forgeNotice = `已学会「${bp.name}」—— 现在可以铸造了(图纸永久保留)`;
    return 'crafted';
  }

  /** 铸造:扣碎片 → 预约下局开局携带这件蓝图成品(部位/特效/词条都是定的) */
  private tryCraft(): 'crafted' | null {
    const bp = blueprintOf(this.forgePick);
    if (!bp) { this.forgeNotice = '找不到这张蓝图'; return null; }
    const blocker = craftBlocker(bp.id, {
      shards: meta.data.blueprintShards,
      owned: meta.data.blueprints,
      inventorySize: 0, inventoryMax: balance.loot.invSize,
    });
    if (blocker !== null) { this.forgeNotice = blockerText(blocker, bp.id); return null; }
    if (meta.data.craftQueued || meta.data.craftQueuedId) {
      this.forgeNotice = '铸台已在淬火:下局的开局装备已预订(不能同时预约两件)';
      return null;
    }
    meta.data.blueprintShards -= balance.blueprint.craftCost;
    meta.data.craftQueuedId = bp.id;
    meta.data.stats.crafts++;
    meta.save();
    this.forgeNotice = `铸造完成:下局开局自带「${bp.name}」成品`;
    return 'crafted';
  }

  /** 铸台面板:左列 6 张图纸(点选),右侧详情 + 两个按钮 */
  private renderForge(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = 700;
    const ph = 340;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    panelBox(ctx, px, py, pw, ph);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('📜 星辉铸台 · 蓝图', w / 2, py + 32);
    ctx.font = '12px monospace';
    ctx.fillStyle = UI.dim;
    ctx.fillText(`📜 碎片 ${meta.data.blueprintShards} · 已学 ${meta.data.blueprints.length}/${BLUEPRINTS.length} · 铸造价 ${balance.blueprint.craftCost} 碎片/件`,
      w / 2, py + 54);

    // 左:图纸列表
    const listW = 268;
    BLUEPRINTS.forEach((bp, i) => {
      const rect: Rect = { x: px + 20, y: py + 70 + i * 38, w: listW, h: 34 };
      const learned = meta.data.blueprints.includes(bp.id);
      const picked = bp.id === this.forgePick;
      ctx.fillStyle = picked ? '#26304a' : '#1a1f30';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = picked ? UI.gold : '#3a4154';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = learned ? UI.text : UI.dim;
      ctx.fillText(bp.name, rect.x + 10, rect.y + 15);
      ctx.font = '11px monospace';
      ctx.fillStyle = learned ? '#8fd4c8' : UI.dim;
      ctx.fillText(`${learned ? '已学' : '未学'} · ${slotLabel(bp.slot)} · 📜${bp.costShards}`, rect.x + 10, rect.y + 29);
      ctx.textAlign = 'center';
      this.rects.push({ rect, act: `bp_${bp.id}` });
    });

    // 右:详情 + 动作
    const bp = blueprintOf(this.forgePick);
    const dx = px + 20 + listW + 20;
    const dw = pw - 40 - listW - 20;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1a1f30';
    ctx.fillRect(dx, py + 70, dw, 196);
    ctx.strokeStyle = '#3a4154';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(dx, py + 70, dw, 196);
    if (!bp) {
      ctx.fillStyle = UI.dim;
      ctx.fillText('左边点一张图纸看详情', dx + 12, py + 96);
      return;
    }
    const sp = specialDef(bp.special);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`${bp.name} · ${bp.rarity === 'legendary' ? '橙装' : bp.rarity}`, dx + 12, py + 92);
    ctx.fillStyle = UI.text;
    ctx.font = '12px monospace';
    ctx.fillText(`部位:${slotLabel(bp.slot)}`, dx + 12, py + 114);
    ctx.fillStyle = '#B067E8';
    ctx.fillText(`特效:${sp?.itemName ?? bp.special}`, dx + 12, py + 132);
    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText(wrap(sp?.desc ?? '', 30).join(' / '), dx + 12, py + 148);
    ctx.fillStyle = UI.text;
    ctx.fillText(`固定词条:${bp.affixes.join(' · ')}`, dx + 12, py + 172);
    ctx.fillStyle = UI.dim;
    ctx.fillText(`「${bp.lore}」`, dx + 12, py + 190);
    ctx.fillStyle = meta.data.craftQueuedId === bp.id ? UI.gold : UI.dim;
    ctx.fillText(meta.data.craftQueuedId === bp.id ? '状态:已预约(下局开局携带)' : '铸造后下局开局直接上身', dx + 12, py + 212);

    // 按钮
    const learned = meta.data.blueprints.includes(bp.id);
    const btnW = (dw - 12) / 2;
    const learnRect: Rect = { x: dx, y: py + 274, w: btnW, h: 34 };
    const craftRect: Rect = { x: dx + btnW + 12, y: py + 274, w: btnW, h: 34 };
    const canLearn = !learned && meta.data.blueprintShards >= bp.costShards;
    const canCraftNow = learned && !meta.data.craftQueued && !meta.data.craftQueuedId
      && meta.data.blueprintShards >= balance.blueprint.craftCost;
    const paintBtn = (r: Rect, label: string, on: boolean): void => {
      ctx.fillStyle = on ? '#2b3a2b' : '#1a1f30';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = on ? UI.hp : '#3a4154';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = on ? UI.text : UI.dim;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, r.x + r.w / 2, r.y + 22);
      ctx.textAlign = 'left';
    };
    paintBtn(learnRect, learned ? '已学会' : `学会 📜${bp.costShards}`, canLearn);
    paintBtn(craftRect, `铸造 📜${balance.blueprint.craftCost}`, canCraftNow);
    this.rects.push({ rect: learnRect, act: 'forgeLearn' });
    this.rects.push({ rect: craftRect, act: 'forgeCraft' });

    ctx.fillStyle = this.forgeNotice ? UI.gold : UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText(this.forgeNotice || '点左侧选图纸 · 学会后可反复铸造 · [Esc/F] 关闭', w / 2, py + ph - 14);
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

    // 普攻描述**从 balance 现算**(combat/BasicAttack.describeBasic),不在 UI 里再抄一份 ——
    // 改平衡表时营地面板会跟着变,不会出现"面板说三段、实际四段"的漂移。
    const classes: Array<{ klass: Klass; icon: string; desc: string }> = [
      { klass: 'blade', icon: '⚔', desc: describeBasic(basicSpec('blade', balance)) },
      { klass: 'ranger', icon: '🏹', desc: describeBasic(basicSpec('ranger', balance)) },
      { klass: 'arcanist', icon: '✨', desc: describeBasic(basicSpec('arcanist', balance)) },
      { klass: 'warden', icon: '🛡', desc: describeBasic(basicSpec('warden', balance)) },
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
      ctx.font = '9px monospace';
      // 描述按「·」分段,每行最多 2 段(普攻档案比原来的四个字长得多)
      const parts = c.desc.split(' · ');
      const lines: string[] = [];
      for (let k = 0; k < parts.length; k += 2) lines.push(parts.slice(k, k + 2).join(' '));
      lines.slice(0, 3).forEach((ln, li) => ctx.fillText(ln, rect.x + bw / 2, rect.y + 74 + li * 11));
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
