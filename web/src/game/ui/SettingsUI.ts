import type { Input } from '@engine/input/Input';
import { sfx } from '@engine/audio/Sfx';
import { music } from '@engine/audio/Music';
import { COLORBLIND_NAMES, COLORBLIND_PALETTES, UI, applyColorblind } from '@game/constants';
import { meta } from '@game/meta/Save';
import { ACTIONS, bindOf, keyLabel, resetBinds } from '@game/meta/Bindings';
import { drawPanel9 } from '@game/gfx/nineSlice';
import { exportCode, importCode } from '@game/meta/SaveCode';
import { LOCALES, LOCALE_NAMES, setLocale, t as tr } from '@game/i18n';

interface Rect { x: number; y: number; w: number; h: number }

const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * 设置面板(暂停菜单进入):音乐/音效音量滑条 + 按键改绑(点击后按任意键)。
 * 所有改动即时生效并写入存档。
 */
export class SettingsUI {
  /** 底部即时反馈(导出/导入结果) */
  private flash(msg: string): void {
    this.codeMsg = msg;
    this.codeMsgT = 2.5;
  }

  open = false;
  /** 营地/标题打开时显示“返回标题”按钮(战斗中用暂停面板自己的放弃) */
  showQuitToTitle = false;
  /** 正在等待新键的动作 id */
  private capturing: string | null = null;

  private musicBar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private sfxBar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private scaleBar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private shakeBar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private stopBar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cbRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private exportRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private importRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private langRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** 导出/导入的即时反馈文案(2.5s 自动消失) */
  private codeMsg = '';
  private codeMsgT = 0;
  private bindRects: Array<{ rect: Rect; id: string }> = [];
  private resetRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private titleRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private readonly input: Input) {}

  /** 打开时每帧调用,消费全部输入。返回 ‘close’ | ‘title’ | null。 */
  update(): 'close' | 'title' | null {
    const s = meta.data.settings;

    // ---- 改绑捕获模式 ----
    if (this.capturing !== null) {
      if (this.input.wasPressed('Escape')) {
        this.capturing = null; // 取消
        return null;
      }
      const k = this.input.lastKey;
      if (k && k !== 'Escape') {
        // 与其它动作冲突 → 两键互换,避免重复绑定
        for (const a of ACTIONS) {
          if (a.id !== this.capturing && s.binds[a.id] === k) s.binds[a.id] = s.binds[this.capturing] ?? '';
        }
        s.binds[this.capturing] = k;
        meta.save();
        this.capturing = null;
      }
      return null;
    }

    if (this.input.wasPressed('Escape') || this.input.wasPressed('PadB')) {
      this.open = false;
      return 'close';
    }
    if (!this.input.mousePressed) return null;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;

    // 音量滑条:点击位置即音量
    const setBar = (bar: Rect, apply: (v: number) => void): boolean => {
      if (!inside({ x: bar.x - 8, y: bar.y - 10, w: bar.w + 16, h: bar.h + 20 }, mx, my)) return false;
      apply(Math.min(1, Math.max(0, (mx - bar.x) / bar.w)));
      meta.save();
      return true;
    };
    if (setBar(this.musicBar, (v) => {
      s.musicVol = v;
      music.setVolume(v);
    })) return null;
    if (setBar(this.sfxBar, (v) => {
      s.sfxVol = v;
      sfx.setVolume(v);
      // 试听
      sfx.play('hit1');
    })) return null;
    if (setBar(this.shakeBar, (v) => {
      s.screenShake = v;
    })) return null;
    if (setBar(this.stopBar, (v) => {
      s.hitstop = v;
    })) return null;
    if (setBar(this.scaleBar, (v) => {
      s.uiScale = Math.round((0.5 + v * 1.5) * 20) / 20; // 0.05 步进
    })) return null;

    if (inside(this.langRect, mx, my)) {
      const i = LOCALES.indexOf((s.language as 'zh' | 'en') ?? 'zh');
      s.language = LOCALES[(i + 1) % LOCALES.length];
      setLocale(s.language);
      meta.save();
      return null;
    }
    if (inside(this.cbRect, mx, my)) {
      s.colorblind = ((s.colorblind ?? 0) + 1) % COLORBLIND_PALETTES.length;
      applyColorblind(s.colorblind);
      meta.save();
      return null;
    }
    for (const b of this.bindRects) {
      if (inside(b.rect, mx, my)) {
        this.capturing = b.id;
        return null;
      }
    }
    if (inside(this.resetRect, mx, my)) {
      resetBinds();
      return null;
    }
    if (inside(this.exportRect, mx, my)) {
      const code = exportCode(meta.data);
      // 剪贴板优先;不可用(http/老浏览器)退 prompt 让玩家手动复制
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(code).catch(() => window.prompt(tr('settings.code.copyPrompt'), code));
        this.flash(tr('settings.code.copied'));
      } else {
        window.prompt(tr('settings.code.copyPrompt'), code);
        this.flash(tr('settings.code.made'));
      }
      return null;
    }
    if (inside(this.importRect, mx, my)) {
      const code = window.prompt(tr('settings.code.pastePrompt'));
      if (code === null || code.trim() === '') return null;
      const res = importCode(code);
      if (!res.ok || !res.data) {
        this.flash(res.fail === 'checksum' ? tr('settings.code.badChecksum') : tr('settings.code.badFormat'));
        return null;
      }
      meta.data = res.data;
      meta.save();
      applyColorblind(meta.data.settings.colorblind);
      this.flash(tr('settings.code.imported'));
      return null;
    }
    if (this.showQuitToTitle && inside(this.titleRect, mx, my)) {
      this.open = false;
      return 'title';
    }
    if (inside(this.closeRect, mx, my)) {
      this.open = false;
      return 'close';
    }
    return null;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const s = meta.data.settings;
    const pw = 560;
    const ph = 574;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(13,15,26,0.88)';
    ctx.fillRect(0, 0, w, h);
    if (!drawPanel9(ctx, px, py, pw, ph)) {
      // 回退:程序化面板
      ctx.fillStyle = 'rgba(19,23,36,0.98)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#3a4154';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, pw, ph);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(tr('settings.title'), w / 2, py + 32);

    // ---- 音量 ----
    const bar = (label: string, y: number, val: number): Rect => {
      ctx.textAlign = 'left';
      ctx.fillStyle = UI.text;
      ctx.font = '13px monospace';
      ctx.fillText(label, px + 28, y + 5);
      const r: Rect = { x: px + 130, y: y - 7, w: pw - 230, h: 14 };
      ctx.fillStyle = '#232838';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = UI.gold;
      ctx.fillRect(r.x, r.y, r.w * val, r.h);
      ctx.strokeStyle = '#3a4154';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      // 滑块
      ctx.fillStyle = '#dfe8f2';
      ctx.fillRect(r.x + r.w * val - 3, r.y - 3, 6, r.h + 6);
      ctx.textAlign = 'right';
      ctx.fillStyle = UI.dim;
      ctx.fillText(`${Math.round(val * 100)}%`, px + pw - 28, y + 5);
      return r;
    };
    this.musicBar = bar(tr('settings.music'), py + 62, s.musicVol);
    this.sfxBar = bar(tr('settings.sfx'), py + 94, s.sfxVol);
    this.scaleBar = bar(tr('settings.scale'), py + 126, (s.uiScale - 0.5) / 1.5);
    this.shakeBar = bar(tr('settings.shake'), py + 158, s.screenShake);
    this.stopBar = bar(tr('settings.hitstop'), py + 190, s.hitstop);
    // 色盲模式(轮 37):点击循环 关→红弱→绿弱→蓝黄弱;右侧四色小样即时预览
    ctx.textAlign = 'left';
    ctx.fillStyle = UI.text;
    ctx.font = '14px monospace';
    ctx.fillText(tr('settings.colorblind'), px + 28, py + 227);
    this.cbRect = { x: px + 150, y: py + 213, w: 120, h: 20 };
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(this.cbRect.x, this.cbRect.y, this.cbRect.w, this.cbRect.h);
    ctx.strokeStyle = UI.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(this.cbRect.x, this.cbRect.y, this.cbRect.w, this.cbRect.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI.text;
    ctx.font = '13px monospace';
    ctx.fillText(tr(COLORBLIND_NAMES[s.colorblind] ?? 'cb.off'), this.cbRect.x + this.cbRect.w / 2, this.cbRect.y + 15);
    // 语言切换(轮 39):点击循环 中文/English
    ctx.textAlign = 'left';
    ctx.fillStyle = UI.text;
    ctx.font = '14px monospace';
    ctx.fillText(tr('settings.language'), px + 300, py + 227);
    this.langRect = { x: px + 388, y: py + 213, w: 96, h: 20 };
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(this.langRect.x, this.langRect.y, this.langRect.w, this.langRect.h);
    ctx.strokeStyle = UI.dim;
    ctx.strokeRect(this.langRect.x, this.langRect.y, this.langRect.w, this.langRect.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI.text;
    ctx.font = '13px monospace';
    ctx.fillText(LOCALE_NAMES[(s.language as 'zh' | 'en')] ?? LOCALE_NAMES.zh, this.langRect.x + this.langRect.w / 2, this.langRect.y + 15);
    const pal = COLORBLIND_PALETTES[s.colorblind] ?? COLORBLIND_PALETTES[0];
    ([pal.fire, pal.ice, pal.bolt, pal.toxin]).forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(px + pw - 28 - (4 - i) * 18, py + 214, 14, 14);
    });
    // 缩放条右侧显示倍率而非百分比
    ctx.fillStyle = 'rgba(19,23,36,1)';
    ctx.fillRect(px + pw - 88, py + 114, 62, 20);
    ctx.textAlign = 'right';
    ctx.fillStyle = UI.dim;
    ctx.font = '13px monospace';
    ctx.fillText(`${s.uiScale.toFixed(2)}×`, px + pw - 28, py + 131);

    // ---- 按键绑定(两列) ----
    ctx.textAlign = 'left';
    ctx.fillStyle = UI.dim;
    ctx.font = '12px monospace';
    ctx.fillText(tr('settings.binds'), px + 28, py + 252);
    this.bindRects = [];
    ACTIONS.forEach((a, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = px + 28 + col * (pw / 2 - 14);
      const y = py + 270 + row * 46;
      const keyR: Rect = { x: x + 128, y, w: 104, h: 32 };
      ctx.fillStyle = UI.text;
      ctx.font = '12px monospace';
      ctx.fillText(tr(a.label), x, y + 21);
      const cap = this.capturing === a.id;
      ctx.fillStyle = cap ? '#2a3147' : '#1a1f30';
      ctx.fillRect(keyR.x, keyR.y, keyR.w, keyR.h);
      ctx.strokeStyle = cap ? UI.gold : '#3a4154';
      ctx.lineWidth = cap ? 2 : 1;
      ctx.strokeRect(keyR.x, keyR.y, keyR.w, keyR.h);
      ctx.textAlign = 'center';
      ctx.fillStyle = cap ? UI.gold : UI.text;
      ctx.font = cap ? 'bold 11px monospace' : 'bold 13px monospace';
      ctx.fillText(cap ? tr('settings.bind.waiting') : keyLabel(bindOf(a.id)), keyR.x + keyR.w / 2, keyR.y + 21);
      ctx.textAlign = 'left';
      this.bindRects.push({ rect: keyR, id: a.id });
    });

    // ---- 底部按钮 ----
    ctx.textAlign = 'center';
    const btn = (label: string, x: number, wid: number, gold: boolean): Rect => {
      const r: Rect = { x, y: py + ph - 56, w: wid, h: 36 };
      ctx.fillStyle = '#1a1f30';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = gold ? UI.gold : '#3a4154';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = gold ? UI.gold : UI.text;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(label, r.x + r.w / 2, r.y + 24);
      return r;
    };
    this.resetRect = btn(tr('settings.resetBinds'), px + 28, 160, false);
    this.exportRect = btn(tr('settings.exportCode'), px + 200, 120, false);
    this.importRect = btn(tr('settings.importCode'), px + 332, 120, false);
    if (this.showQuitToTitle) {
      this.titleRect = btn(tr('settings.toTitle'), px + pw / 2 - 60, 120, false);
    }
    this.closeRect = btn(tr('settings.close'), px + pw - 28 - 140, 140, true);
    if (this.codeMsgT > 0) {
      this.codeMsgT -= 1 / 60;
      ctx.textAlign = 'left';
      ctx.fillStyle = UI.gold;
      ctx.font = '12px monospace';
      ctx.fillText(this.codeMsg, px + 28, py + ph - 66);
    }
    ctx.restore();
  }
}
