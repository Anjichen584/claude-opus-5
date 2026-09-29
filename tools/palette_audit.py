#!/usr/bin/env python3
"""色板审计:量化到 N 色会给现有精灵带来多大失真、省多少体积。

背景:`docs/04-ART-PIPELINE.md` §2 承诺"全项目统一 64 色主板",但**事后量化**是有代价的 ——
现有精灵是 AI 生成的高细节伪像素(中位 481 色)。本工具用真实数据回答"值不值得压",
而不是凭感觉拍板。输出用于 04 的实测结论表。

用法:
    python3 tools/palette_audit.py            # 64 / 128 / 256 三档对比
    python3 tools/palette_audit.py --detail   # 追加每张图最差 10 个
"""
from __future__ import annotations

import glob
import math
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "sprites"


def palette_strip(n: int) -> Image.Image:
    """统计全库不透明像素的 N 色板(中位切分)。"""
    px: list[tuple[int, int, int]] = []
    for f in sorted(glob.glob(str(OUT / "*.png"))):
        im = Image.open(f).convert("RGBA")
        px.extend((r, g, b) for r, g, b, a in im.getdata() if a > 128)
    strip = Image.new("RGB", (len(px), 1))
    strip.putdata(px)
    return strip.quantize(colors=n, method=Image.MEDIANCUT, dither=Image.NONE)


def audit(n: int, detail: bool = False) -> tuple[float, float, float]:
    """返回 (平均色偏, 95 分位色偏, 体积变化率)。"""
    pal_img = palette_strip(n)
    pal_raw = pal_img.getpalette()
    pal = [tuple(pal_raw[i * 3 : i * 3 + 3]) for i in range(n)]

    def dist(a, b) -> float:
        return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))

    before_bytes = after_bytes = 0
    rows = []
    for f in sorted(glob.glob(str(OUT / "*.png"))):
        im = Image.open(f).convert("RGBA")
        before_px = [c for c in im.getdata() if c[3] > 128]
        before_bytes += os.path.getsize(f)

        alpha = im.getchannel("A")
        q = im.convert("RGB").quantize(palette=pal_img, dither=Image.NONE)
        out = q.convert("RGBA")
        out.putalpha(alpha)
        tmp = Path("/tmp") / f".audit_{os.path.basename(f)}"
        out.save(tmp)
        after_bytes += os.path.getsize(tmp)
        tmp.unlink()

        ds = sorted(min(dist(b, c) for c in pal) for b in before_px[:15000])
        rows.append((os.path.basename(f), sum(ds) / len(ds), ds[int(len(ds) * 0.95)]))

    rows.sort(key=lambda r: -r[1])
    avg = sum(r[1] for r in rows) / len(rows)
    p95 = sorted(r[2] for r in rows)[int(len(rows) * 0.95)]
    print(f"{n:4} 色 → 平均色偏 {avg:5.1f} · 95 分位 {p95:5.1f} · 体积 "
          f"{before_bytes//1024} KB → {after_bytes//1024} KB ({(after_bytes/before_bytes - 1) * 100:+.0f}%) · "
          f"超阈值(>12)的图 {sum(1 for r in rows if r[1] > 12)}/{len(rows)}")
    if detail:
        print("  最差 10 张:")
        for name, a, p in rows[:10]:
            print(f"    {name:26} 平均 {a:5.1f} · 95分位 {p:5.1f}")
    return avg, p95, after_bytes / before_bytes


def main() -> None:
    detail = "--detail" in sys.argv
    print(f"审计对象:{len(glob.glob(str(OUT / '*.png')))} 张成品精灵")
    print("判定阈值:平均色偏 ≤12 = 肉眼基本无感;>12 = 会看出变脏(经验值,见 docs/04 §2)\n")
    for n in (64, 128, 256):
        audit(n, detail)
    print("\n结论写回 docs/04-ART-PIPELINE.md §2(不要凭感觉改项目色板规则)。")


if __name__ == "__main__":
    main()
