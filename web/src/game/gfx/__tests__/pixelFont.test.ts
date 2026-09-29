import { describe, expect, it } from 'vitest';
import font from '@data/font.json';
import {
  GLYPHS, GLYPH_H, GLYPH_ORDER, GLYPH_W, SPACING, drawHudNumber, drawPixelText, hasGlyph,
  lineHeight, litPixels, measure, supports,
} from '../pixelFont';
import { drawFloatText, floatScaleOf } from '../floatText';

/** 记录型 ctx:只关心 fillRect / fillText 的落点与参数,不需要真画布(含 save/restore 的 alpha 栈) */
interface Call { kind: 'rect' | 'text'; x: number; y: number; w?: number; h?: number; alpha: number }
function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  let alpha = 1;
  const stack: number[] = [];
  const ctx = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    get globalAlpha() { return alpha; },
    set globalAlpha(v: number) { alpha = v; },
    save() { stack.push(alpha); },
    restore() { alpha = stack.pop() ?? 1; },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ kind: 'rect', x, y, w, h, alpha });
    },
    fillText(text: string, x: number, y: number) {
      calls.push({ kind: 'text', x, y, w: text.length, alpha });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('像素数字字体 · 字模数据', () => {
  it('字模规格:5×7、间距 1,与 font.json 一致', () => {
    expect(GLYPH_W).toBe(5);
    expect(GLYPH_H).toBe(7);
    expect(SPACING).toBe(1);
    expect(font.glyphW).toBe(GLYPH_W);
    expect(font.glyphH).toBe(GLYPH_H);
  });

  it('收录 24 个字符:0-9 + . : / - + x , % 空格 + P F S K H;每个都是 7 行 × 5 列', () => {
    expect(GLYPH_ORDER).toHaveLength(24);
    expect(new Set(GLYPH_ORDER).size).toBe(GLYPH_ORDER.length); // 无重复
    for (const ch of '0123456789') expect(hasGlyph(ch), ch).toBe(true);
    for (const ch of ['.', ':', '/', '-', '+', 'x', ',', '%', ' ']) expect(hasGlyph(ch), ch).toBe(true);
    // HUD 真的会画的字母:P1(阶段) / FPS / HP / K(击杀)— 小写只保留 x(乘号)
    for (const ch of ['P', 'F', 'S', 'K', 'H']) expect(hasGlyph(ch), ch).toBe(true);
    expect(hasGlyph('p'), '小写 p 不收录').toBe(false);
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      expect(rows, ch).toHaveLength(GLYPH_H);
      for (const row of rows) {
        expect(row, ch).toHaveLength(GLYPH_W);
        expect(row, ch).toMatch(/^[.#]+$/);
      }
    }
  });

  it('字模不是空的、也不是全实心:每个字符都得有可辨认的笔画', () => {
    for (const ch of GLYPH_ORDER) {
      if (ch === ' ') {
        expect(litPixels(ch), ch).toBe(0); // 空格就是空格
        continue;
      }
      const lit = litPixels(ch);
      expect(lit, `${ch} 点亮像素数`).toBeGreaterThanOrEqual(4); // '.' / ',' 是 4 像素的矮字符
      expect(lit, `${ch} 点亮像素数`).toBeLessThan(GLYPH_W * GLYPH_H * 0.8);
    }
  });

  it('数字彼此可区分(不能出现两个字模完全相同)', () => {
    const seen = new Map<string, string>();
    for (const ch of '0123456789') {
      const key = GLYPHS[ch].join('|');
      expect(seen.has(key), `${ch} 与 ${seen.get(key)} 字模一模一样`).toBe(false);
      seen.set(key, ch);
    }
  });

  it('中文/未收录字符:hasGlyph=false,supports 整串判假', () => {
    expect(hasGlyph('生')).toBe(false);
    expect(hasGlyph('$')).toBe(false);
    expect(supports('12:34')).toBe(true);
    expect(supports('+1.25x')).toBe(true);
    expect(supports('P1')).toBe(true);
    expect(supports('FPS 60')).toBe(true);
    expect(supports('HP 128/200')).toBe(true);
    expect(supports('生命 12')).toBe(false); // 混排也走回退,避免中英像素比例打架
    expect(supports('')).toBe(true);
  });
});

describe('像素数字字体 · 度量与绘制', () => {
  it('宽度 = n×5×scale + (n-1)×1×scale;空串 0', () => {
    expect(measure('', 1)).toBe(0);
    expect(measure('1', 1)).toBe(5);
    expect(measure('12', 1)).toBe(11);
    expect(measure('123', 1)).toBe(17);
    expect(measure('123', 2)).toBe(34);
    expect(measure('12:34', 1)).toBe(5 * 5 + 4);
    expect(lineHeight(1)).toBe(7);
    expect(lineHeight(3)).toBe(21);
  });

  it('绘制:像素数 = 字模点亮数,且落点全是整数、尺寸 = scale', () => {
    const { ctx, calls } = recorder();
    const w = drawPixelText(ctx, '123', 10, 20, { color: '#fff', scale: 2 });
    expect(w).toBe(measure('123', 2));
    expect(calls).toHaveLength(litPixels('123'));
    for (const c of calls) {
      expect(c.kind).toBe('rect');
      expect(Number.isInteger(c.x)).toBe(true);
      expect(Number.isInteger(c.y)).toBe(true);
      expect(c.w).toBe(2);
      expect(c.h).toBe(2); // 一个"像素"= scale×scale 的方块
    }
  });

  it('居中对齐:整串以 x 为中心;右对齐:以 x 为右边界', () => {
    const w = measure('1234', 1);
    // 基准:左对齐时的最左点亮像素(字模自带左边距,'1' 的笔画不在第 0 列)
    const base = recorder();
    drawPixelText(base.ctx, '1234', 0, 0, { color: '#fff', align: 'left' });
    const leftLit = Math.min(...base.calls.map((c) => c.x));

    const center = recorder();
    drawPixelText(center.ctx, '1234', 100, 0, { color: '#fff', align: 'center' });
    expect(Math.min(...center.calls.map((c) => c.x))).toBe(100 - Math.floor(w / 2) + leftLit);

    const right = recorder();
    drawPixelText(right.ctx, '1234', 100, 0, { color: '#fff', align: 'right' });
    expect(Math.min(...right.calls.map((c) => c.x))).toBe(100 - w + leftLit);
  });

  it('小数坐标/小数缩放会被取整(像素画不允许半像素)', () => {
    const { ctx, calls } = recorder();
    drawPixelText(ctx, '7', 10.4, 20.6, { color: '#fff', scale: 1.6 });
    const scale = 2; // 1.6 → 2
    for (const c of calls) {
      expect(Number.isInteger(c.x)).toBe(true);
      expect(Number.isInteger(c.y)).toBe(true);
      expect(c.w).toBe(scale);
    }
    expect(Math.min(...calls.map((c) => c.x))).toBe(10);
    expect(Math.min(...calls.map((c) => c.y))).toBe(21);
  });

  it('描边两趟:先摊 3×3 的边框块、再落本体块,总数 = 2N(不是 9N)', () => {
    const plain = recorder();
    drawPixelText(plain.ctx, '8', 0, 0, { color: '#fff' });
    const lit = litPixels('8');
    expect(plain.calls).toHaveLength(lit);
    for (const c of plain.calls) expect(c.w).toBe(1); // 无描边:只有本体,1×1

    const outlined = recorder();
    drawPixelText(outlined.ctx, '8', 10, 20, { color: '#fff', outline: '#000' });
    expect(outlined.calls).toHaveLength(lit * 2);           // N 个边框 + N 个本体
    const borders = outlined.calls.filter((c) => c.w === 3);
    const bodies = outlined.calls.filter((c) => c.w === 1);
    expect(borders).toHaveLength(lit);
    expect(bodies).toHaveLength(lit);
    // 边框比本体左上角各外扩 1px(scale=1)
    expect(borders[0].x).toBe(bodies[0].x - 1);
    expect(borders[0].y).toBe(bodies[0].y - 1);
  });

  it('放大时描边同步变粗(scale=3 → 边框 9×9、本体 3×3)', () => {
    const { ctx, calls } = recorder();
    drawPixelText(ctx, '2', 0, 0, { color: '#fff', scale: 3, outline: '#000' });
    expect(calls.filter((c) => c.w === 9)).toHaveLength(litPixels('2'));
    expect(calls.filter((c) => c.w === 3)).toHaveLength(litPixels('2'));
  });

  it('未收录字符整串回退到平台字体(不留空洞,也不混排)', () => {
    const { ctx, calls } = recorder();
    const w = drawPixelText(ctx, '生命12', 5, 6, { color: '#fff', scale: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe('text');
    expect(w).toBe(measure('生命12', 2)); // 宽度口径仍按字模算,调用方排版不跳
    expect(ctx.font).toContain('14px'); // 7 × scale
  });

  it('drawHudNumber 与 drawPixelText 同口径(HUD 便捷入口不另开一套)', () => {
    const a = recorder();
    const b = recorder();
    const wa = drawHudNumber(a.ctx, '999', 40, 12, { color: '#fff', align: 'right' });
    const wb = drawPixelText(b.ctx, '999', 40, 12, { color: '#fff', align: 'right' });
    expect(wa).toBe(wb);
    expect(a.calls).toEqual(b.calls);
  });
});

describe('伤害飘字接入像素字体', () => {
  it('飘字只画像素方块,不调 canvas 文字(风格统一)', () => {
    const { ctx, calls } = recorder();
    drawFloatText(ctx, { text: '128', x: 50, y: 30, color: '#fff', scale: 1, alpha: 1 });
    expect(calls.length).toBe(litPixels('128') * 2); // 描边 + 本体
    for (const c of calls) expect(c.kind).toBe('rect');
  });

  it('字级分档:普通 1 / 强化 2 / 暴击 3,且只认整数倍', () => {
    expect(floatScaleOf(1)).toBe(1);
    expect(floatScaleOf(1.2)).toBe(2);
    expect(floatScaleOf(2)).toBe(3);
    expect(floatScaleOf(1.14)).toBe(1);
    expect(floatScaleOf(1.6)).toBe(3);
  });

  it('飘字画在锚点上方(与旧 canvas 基线观感一致)', () => {
    const { ctx, calls } = recorder();
    drawFloatText(ctx, { text: '1', x: 100, y: 50, color: '#fff', scale: 1, alpha: 1 });
    const top = Math.min(...calls.map((c) => c.y));
    expect(top).toBe(50 - lineHeight(1) - 1); // 顶部 = y - 字高,再向上 1px 给描边
  });

  it('透明度透传给每一次绘制,且画完把 ctx 的 alpha 还原', () => {
    const { ctx, calls } = recorder();
    drawFloatText(ctx, { text: '12', x: 0, y: 0, color: '#fff', scale: 1, alpha: 0.35 });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.alpha).toBeCloseTo(0.35, 5);
    expect((ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1); // save/restore 收尾干净
  });
});
