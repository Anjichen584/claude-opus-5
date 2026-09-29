#!/usr/bin/env python3
"""图标管线 + 全局 64 色调色板(见 docs/04-ART-PIPELINE.md §2 / §9)。

两件事:
1) `iconize()`:把 web/art_src 里的 `icon_*.png` 源图 → 游戏用成品(24px 高,最近邻),
   抠幕布复用 process_art.key_out(品红按通道判、绿幕按色距判),处理完**删除源图**
   (源图 10 MB 不进仓库,提示词存 docs/08-ART-PROMPTS.md,可再生)。
2) `palette`:`--build-palette` 从**全部成品精灵**统计出一张真·64 色板并写出
   `web/public/assets/palette.png`;`--apply-palette` 用它把每张精灵量化到 64 色。
   这是 docs/04 §2「全项目统一 64 色主板」第一次真正落地 —— 之前只是文档承诺。

用法:
    python3 tools/iconize.py                 # 图标入库(删源图)
    python3 tools/iconize.py --build-palette  # 统计并写出 64 色板
    python3 tools/iconize.py --apply-palette  # 用色板量化全部精灵(会备份到 art_src/_backup)
    python3 tools/iconize.py --report         # 只报告色数/体积,不改文件
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "art_src"
OUT = ROOT / "web" / "public" / "sprites"
PALETTE = ROOT / "web" / "public" / "assets" / "palette.png"

sys.path.insert(0, str(ROOT / "tools"))
from process_art import key_out  # noqa: E402  (复用抠图逻辑,避免两份实现漂移)

# 图标目标高度(px,游戏内 1:1 绘制):物品/状态图标 24,技能图标 30(在 HUD 技能格里更醒目)
ICON_TARGETS = {
    "icon_item_weapon": 24, "icon_item_helmet": 24, "icon_item_chest": 24,
    "icon_item_boots": 24, "icon_item_ring": 24, "icon_item_amulet": 24,
    "icon_st_kill": 22, "icon_st_dps": 22, "icon_st_taken": 22,
    "icon_st_chest": 22, "icon_st_stardust": 22, "icon_st_time": 22,
    "icon_skill_blade": 30, "icon_skill_ranger": 30, "icon_skill_arcanist": 30,
    "icon_skill_warden": 30, "icon_skill_utility": 30, "icon_skill_ult": 30,
}


def iconize() -> int:
    """处理 art_src 里的图标源图 → 成品;成功即删源图(体积纪律)。"""
    done = 0
    for name, target_h in ICON_TARGETS.items():
        f = SRC / f"{name}.png"
        if not f.exists():
            continue
        img = key_out(Image.open(f))
        box = img.getbbox()
        if not box:
            print(f"{name}: 抠图后为空,跳过(源图保留)")
            continue
        img = img.crop(box)
        scale = target_h / img.height
        img = img.resize((max(1, round(img.width * scale)), target_h), Image.NEAREST)
        img.save(OUT / f"{name}.png")
        print(f"{name}: {img.width}x{img.height}  ✅ 入库")
        f.unlink()  # 源图不进仓库
        done += 1
    return done


def all_sprites() -> list[Path]:
    return sorted(p for p in OUT.glob("*.png") if p.name != "palette.png")


def build_palette() -> Image.Image:
    """从全部成品精灵统计 64 色板(中位切分;只统计不透明像素)。"""
    # 把所有不透明像素聚成一张长条图,交给 PIL 的中位切分
    px: list[tuple[int, int, int]] = []
    for p in all_sprites():
        im = Image.open(p).convert("RGBA")
        for r, g, b, a in im.getdata():
            if a > 128:
                px.append((r, g, b))
    strip = Image.new("RGB", (len(px), 1))
    strip.putdata(px)
    pal = strip.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.NONE)
    # 导出成 8×8 的色板图(工程用:人眼能看、代码能读)
    palette_cols = pal.getpalette()[: 64 * 3]
    # 存成 P 模式 PNG:调色板随文件走,`quantize(palette=...)` 能直接读(尺寸 8×8 便于人眼核对)
    swatch = Image.new("P", (8, 8))
    swatch.putpalette(palette_cols + [0] * (768 - len(palette_cols)))
    swatch.putdata(list(range(64)))
    PALETTE.parent.mkdir(parents=True, exist_ok=True)
    swatch.save(PALETTE)
    print(f"64 色板已写出:{PALETTE.relative_to(ROOT)}(源像素 {len(px)} 个)")
    return swatch


def apply_palette(backup: bool = True) -> None:
    """用 64 色板量化全部精灵(先备份原件,便于对比回滚)。"""
    swatch = Image.open(PALETTE)  # P 模式(自带调色板)
    bak = SRC / "_backup"
    if backup:
        bak.mkdir(parents=True, exist_ok=True)
    total_before = total_after = 0
    worst = []
    for p in all_sprites():
        before = p.stat().st_size
        im = Image.open(p).convert("RGBA")
        alpha = im.getchannel("A")
        q = im.convert("RGB").quantize(palette=swatch, dither=Image.NONE).convert("RGB")
        out = q.convert("RGBA")
        out.putalpha(alpha)
        if backup:
            shutil.copy2(p, bak / p.name)
        out.save(p)
        after = p.stat().st_size
        total_before += before
        total_after += after
        worst.append((after - before, p.name, before, after))
    worst.sort(reverse=True)
    print(f"量化完成:{len(worst)} 张,{total_before/1024:.0f} KB → {total_after/1024:.0f} KB "
          f"({(total_after/total_before - 1) * 100:+.1f}%)")
    print("体积变化最大的 5 张:")
    for d, n, b, a in worst[:5]:
        print(f"  {n:24} {b:6} → {a:6} ({d:+} B)")


def report() -> None:
    files = all_sprites()
    tot = sum(p.stat().st_size for p in files)
    cols = []
    for p in files:
        im = Image.open(p).convert("RGBA")
        cols.append(len({c for c in im.getdata() if c[3] > 0}))
    cols.sort()
    print(f"成品 {len(files)} 张 / {tot/1024:.0f} KB")
    print(f"单张不透明色数:中位 {cols[len(cols)//2]} · 最大 {cols[-1]} · 最小 {cols[0]}")
    print(f"超过 64 色的: {sum(1 for c in cols if c > 64)} 张")


def main() -> None:
    args = set(sys.argv[1:])
    if "--report" in args:
        report()
        return
    if "--build-palette" in args:
        build_palette()
        return
    if "--apply-palette" in args:
        apply_palette(backup="--no-backup" not in args)
        return
    n = iconize()
    print(f"入库 {n} 个图标;剩余源图 {len(list(SRC.glob('*.png')))} 张")


if __name__ == "__main__":
    main()
