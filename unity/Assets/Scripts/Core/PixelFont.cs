using System;
using System.Collections.Generic;

namespace StarfallKnights.Core
{
    /// <summary>
    /// 像素数字字体镜像(web: game/gfx/pixelFont.ts;字模权威: web/src/data/font.json)。
    ///
    /// 5×7 位图字模,覆盖"数字 + 常用符号 + HUD 用到的几个大写字母(P 阶段 / FPS / HP)";
    /// 中文走各自平台的字体,不进位图字模(硬塞进 5×7 只会糊成一团)。
    /// 用途:HUD 数字(伤害飘字/血量/计时)按整数倍放大绘制,避免字体缩放发虚。
    /// 字模与 font.json 同源生成,ParityTests 会逐字符逐行比对 —— 改一边忘另一边会立刻红。
    /// </summary>
    public static class PixelFont
    {
        public const int GlyphW = 5;
        public const int GlyphH = 7;
        public const int Spacing = 1;

        /// <summary>字模表:字符 → 7 行 × 5 列('#' 实 / '.' 空)</summary>
        public static readonly Dictionary<string, string[]> Glyphs = new Dictionary<string, string[]>
        {
            { "0", new[] { ".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###." } },
            { "1", new[] { "..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###." } },
            { "2", new[] { ".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####" } },
            { "3", new[] { "#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###." } },
            { "4", new[] { "...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#." } },
            { "5", new[] { "#####", "#....", "####.", "....#", "....#", "#...#", ".###." } },
            { "6", new[] { "..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###." } },
            { "7", new[] { "#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..." } },
            { "8", new[] { ".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###." } },
            { "9", new[] { ".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.." } },
            { ".", new[] { ".....", ".....", ".....", ".....", ".....", ".##..", ".##.." } },
            { ":", new[] { ".....", ".##..", ".##..", ".....", ".##..", ".##..", "....." } },
            { "/", new[] { "....#", "....#", "...#.", "..#..", ".#...", "#....", "#...." } },
            { "-", new[] { ".....", ".....", ".....", "#####", ".....", ".....", "....." } },
            { "+", new[] { ".....", "..#..", "..#..", "#####", "..#..", "..#..", "....." } },
            { "x", new[] { ".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#" } },
            { ",", new[] { ".....", ".....", ".....", ".....", ".##..", ".##..", ".#..." } },
            { "%", new[] { "##..#", "##.#.", "...#.", "..#..", ".#...", ".#.##", "#..##" } },
            { " ", new[] { ".....", ".....", ".....", ".....", ".....", ".....", "....." } },
            { "P", new[] { "####.", "#...#", "#...#", "####.", "#....", "#....", "#...." } },
            { "F", new[] { "#####", "#....", "#....", "####.", "#....", "#....", "#...." } },
            { "S", new[] { ".###.", "#...#", "#....", ".###.", "....#", "#...#", ".###." } },
            { "K", new[] { "#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#" } },
            { "H", new[] { "#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#" } },
        };

        /// <summary>按字模顺序(与 font.json 键序一致)。ParityTests 用它核对顺序。</summary>
        public static readonly string[] Order =
        {
            "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", ":", "/", "-", "+", "x", ",", "%", " " , "P", "F", "S", "K", "H",
        };
        public static bool Has(char c) => Glyphs.ContainsKey(c.ToString());

        /// <summary>整串是否全部可用位图字模绘制(否则调用方回退到平台字体)</summary>
        public static bool Supports(string text)
        {
            foreach (var c in text) if (!Has(c)) return false;
            return true;
        }

        /// <summary>像素宽度(整数倍缩放;字符间 1px × scale 的空隙,与 web measure 同口径)</summary>
        public static int Width(string text, int scale = 1)
        {
            if (string.IsNullOrEmpty(text)) return 0;
            return text.Length * GlyphW * scale + (text.Length - 1) * Spacing * scale;
        }

        /// <summary>对齐用的左上角 x:left / center / right 三种(与 web drawPixelText 同口径)</summary>
        public static int AlignX(int x, string text, int scale, string align)
        {
            int w = Width(text, scale);
            if (align == "center") return x - w / 2;
            if (align == "right") return x - w;
            return x;
        }

        /// <summary>某个字的第 row 行、第 col 列是否点亮(越界/未收录 = false)</summary>
        public static bool Pixel(char c, int row, int col)
        {
            if (!Glyphs.TryGetValue(c.ToString(), out var rows)) return false;
            if (row < 0 || row >= GlyphH || col < 0 || col >= GlyphW) return false;
            return rows[row][col] == '#';
        }

        /// <summary>整串点亮像素数(描边/尺寸估算用;也用于 parity 断言)</summary>
        public static int LitPixels(string text)
        {
            int n = 0;
            foreach (var c in text)
                for (int r = 0; r < GlyphH; r++)
                    for (int col = 0; col < GlyphW; col++)
                        if (Pixel(c, r, col)) n++;
            return n;
        }
    }
}
