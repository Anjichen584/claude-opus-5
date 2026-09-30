#!/usr/bin/env python3
"""序列帧处理器:把 AI 生成的动作帧处理成同画布、同尺寸、脚底对齐的精灵序列。

为什么要有这一层:`process_art.py` 的 `PAIRS` 管的是"两帧对"(站立/迈步),
一旦动作变成 3~6 帧,原来那套"按主体 bbox 缩放到目标高"的做法会出两个坑 ——

1. **一大一小**:每帧各自缩放到目标高,抬手/抬腿/剑尖上挑的那一帧主体更高,
   缩放比例就不同 → 播放时身体一会儿大一会儿小(和双帧那次踩的是同一个坑);
2. **身体横移**:锚点若取整图中心,剑或披风伸出去的那一帧,身体会被推偏几个像素
   → 播放时整个人在抖。

所以这里的口径是:
- **统一缩放**:先量每帧**身体连通域**(最大域)的高度,取中位数当基准,所有帧用**同一个比例**缩放;
- **脚底锚定**:水平按身体域中心、垂直按身体域底边对齐到画布(脚踩在地上,剑伸到哪都不影响);
- **画布取所有帧的最大宽高**(再各留 2px 边),不裁剪单帧 —— 这样每帧画布完全一致,底锚绘制不会跳。

用法:
    python3 tools/process_frames.py            # 处理 SEQUENCES 里登记的全部序列
    python3 tools/process_frames.py knight     # 只处理名字以 knight 开头的源帧

源图放 `web/art_src/frames/<name>.png`(品红幕布),成品写 `web/public/sprites/<name>.png`,
命名约定 `<类别>_<动作>_<序号>.png`(见 docs/04-ART-PIPELINE.md §3)。
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import NamedTuple

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import process_art  # noqa: E402  复用抠幕布与连通域,避免两份实现漂移

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "art_src" / "frames"
OUT = ROOT / "web" / "public" / "sprites"

class Seq(NamedTuple):
    """一套序列的登记信息。

    - `frames`: 帧数(源文件 `<base>_1..N.png`);
    - `target_h`: 锚点帧的身体高度目标值(px)—— 与既有单帧精灵同高,否则切动作时会"变一个人大小";
    - `anchor`: **用第几帧来定缩放**(1 起)。这一项必须人工挑:身体连通域会把剑/披风一起框进去,
      挥砍帧比站立帧高一大截,按"身体高度取中位数"归一会把整个人缩错(第一版就是这么错的)。
      挑法:**选整套里最接近站立姿态的那一帧**,让它的身体高度落到 `target_h`。
    """
    frames: int
    target_h: int
    anchor: int


# 序列登记。成品名 = f"{基名}_{序号}.png"(序号 1 起,与 balance.anim 的帧数对齐)
SEQUENCES: dict[str, Seq] = {
    # 剑士走路 4 帧(10-FULL-PLAN 轮 27 动画批次 1)—— 目标高与既有 knight.png(46px)一致
    "knight_walk": Seq(frames=4, target_h=46, anchor=1),
    # 普攻 3 帧:锚点取收招帧(身体最直,剑挂在身前不算身高)
    "knight_atk": Seq(frames=3, target_h=46, anchor=3),
    # 翻滚 3 帧:锚点取起身帧(第 2 帧是抱团,本来就该比站立矮)
    "knight_dash": Seq(frames=3, target_h=46, anchor=3),
    # 受击 2 帧:锚点取踉跄帧
    "knight_hurt": Seq(frames=2, target_h=46, anchor=2),
    # 死亡 4 帧:锚点取第 1 帧(受创但还站着 —— 整套里最接近站立姿态的)
    "knight_die": Seq(frames=4, target_h=46, anchor=1),
    # 施法 3 帧:锚点取收招帧(剑回到肩上、身体站直)
    "knight_cast": Seq(frames=3, target_h=46, anchor=3),
    # ---- 猎手(远程职业:普攻在代码里走 cast 动作 —— 拉弓与挥剑本来就是两套姿态)----
    "ranger_walk": Seq(frames=4, target_h=46, anchor=1),
    "ranger_cast": Seq(frames=3, target_h=46, anchor=3),   # 锚点:收弓站直那帧
    "ranger_dash": Seq(frames=3, target_h=46, anchor=3),   # 锚点:起身站直那帧(第 3 帧)
    "ranger_hurt": Seq(frames=2, target_h=46, anchor=1),   # 锚点:中招瞬间(还站得直,第 2 帧是踉跄后仰)
    "ranger_die": Seq(frames=4, target_h=46, anchor=1),    # 锚点:第 1 帧(受创但还站着,整套里最接近站立)
    # ---- 秘术师(轮 28 下半场:法术吟唱风格 —— 起手聚元素 → 出手 → 收招)----
    "arcanist_walk": Seq(frames=4, target_h=46, anchor=1),  # 锚点:第 1 帧(接触姿势,躯干最直)
    "arcanist_cast": Seq(frames=3, target_h=46, anchor=3),  # 锚点:收招站直那帧(前两帧手掌前推/蓄力,身体姿态都偏离站立)
    "arcanist_dash": Seq(frames=3, target_h=46, anchor=3),  # 锚点:起身站直那帧(第 2 帧是抱团,本来就该比站立矮)
}

PAD = 2  # 画布四周留白

# 度量清单:管线**自己报**每套序列的锚点帧身体尺寸与画布尺寸。
# 为什么要落盘成文件:测试想断言的"锚点帧身体高度 = 目标高度"必须由管线提供 ——
# 让测试去解码 PNG 数连通域是杀鸡用牛刀,而"各帧画布一致 / 锚点选错"这两条
# 又是肉眼很难发现的坑(锚点选错 → 整套动作都偏大偏小,单帧看着都正常)。
METRICS = ROOT / "web" / "public" / "sprites" / "_anim_metrics.json"


def body_component(img: Image.Image):
    """身体连通域 = 面积最大的那块(剑/披风是独立域时不会抢锚点)。"""
    comps = process_art.components(img)
    if not comps:
        return None
    return max(comps, key=lambda c: c[0])[1]


def load_frames(seq: str, n: int) -> list[Image.Image] | None:
    frames = []
    for i in range(1, n + 1):
        f = SRC / f"{seq}_{i}.png"
        if not f.exists():
            print(f"{seq}: 缺源帧 {f.name},跳过")
            return None
        frames.append(process_art.key_out(Image.open(f)))
    return frames


metrics: dict[str, dict] = {}


def process_sequence(seq: str, spec: Seq) -> bool:
    n, target_h = spec.frames, spec.target_h
    frames = load_frames(seq, n)
    if frames is None:
        return False

    bodies = [body_component(f) for f in frames]
    if any(b is None for b in bodies):
        print(f"{seq}: 有帧找不到主体,跳过")
        return False
    if not 1 <= spec.anchor <= n:
        print(f"{seq}: anchor={spec.anchor} 越界(1..{n})")
        return False

    # 统一缩放:所有帧用**同一个**比例,比例由锚点帧(人工挑的最接近站立的那一帧)定。
    # 逐帧各自缩放到目标高会让抬手/挑剑那帧一大一小(双帧时代同一个坑)。
    ref_h = bodies[spec.anchor - 1][3] - bodies[spec.anchor - 1][1]
    scale = target_h / ref_h

    scaled: list[Image.Image] = []
    for img, body in zip(frames, bodies):
        nw = max(1, round(img.width * scale))
        nh = max(1, round(img.height * scale))
        scaled.append(img.resize((nw, nh), Image.NEAREST))

    # 画布:因为锚点是"身体中心",画布必须**以身体中心为轴左右对称**地够宽,
    # 否则某帧的剑会伸出画布被裁掉(裁掉的剑 = 播放时一闪一闪)。
    # 高度取"最高那一帧的脚底以上高度",脚底落在画布最后一行 —— 与单帧精灵的
    # "画布底边 = 地面"约定一致,切动作时不会上下跳。
    scaled_bodies = [[round(v * scale) for v in b] for b in bodies]
    half_w = max(max((b[0] + b[2]) // 2 - b[0], b[2] - (b[0] + b[2]) // 2) for b in scaled_bodies) + PAD
    cw = half_w * 2
    ch = max(b[3] for b in scaled_bodies) + PAD

    for i, (im, body) in enumerate(zip(scaled, scaled_bodies), start=1):
        bx0, by0, bx1, by1 = body
        cx = (bx0 + bx1) // 2          # 水平:身体中心
        feet = by1                      # 垂直:脚底
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        # 目标:身体中心落在画布水平中心,脚底落在画布最后一行
        canvas.alpha_composite(im, (cw // 2 - cx, ch - 1 - feet))
        canvas.save(OUT / f"{seq}_{i}.png")
        print(f"{seq}_{i}.png: {canvas.width}x{canvas.height}(身体 {bx1 - bx0}x{by1 - by0} @ {cx},{feet})")

    # 自查:同画布 + 脚底对齐(写在输出里,红了就是这套规则被改坏了)
    outs = [Image.open(OUT / f"{seq}_{i}.png") for i in range(1, n + 1)]
    sizes = {im.size for im in outs}
    assert len(sizes) == 1, f"{seq}: 各帧画布不一致 {sizes} —— 底锚绘制会跳"
    anchor_body = scaled_bodies[spec.anchor - 1]
    metrics[seq] = {
        "frames": n,
        "targetH": target_h,
        "anchor": spec.anchor,
        "canvas": [cw, ch],
        "anchorBody": [anchor_body[2] - anchor_body[0], anchor_body[3] - anchor_body[1]],
        "bodies": [[b[2] - b[0], b[3] - b[1]] for b in scaled_bodies],
    }
    return True


def reindex(seq: str, spec: Seq) -> bool:
    """源图已清(体积政策:art_src 不进仓库)时,直接量**已入库的成品帧**重建度量。

    量的是同一件事(身体连通域),只是对象从"处理中的图"换成"最终产物" ——
    清单因此永远是完整的,测试不会因为"这轮没重跑管线"而失去覆盖。
    """
    n = spec.frames
    frames = []
    for i in range(1, n + 1):
        f = OUT / f"{seq}_{i}.png"
        if not f.exists():
            print(f"{seq}: 成品缺 {f.name},跳过")
            return False
        frames.append(Image.open(f).convert("RGBA"))
    bodies = [body_component(f) for f in frames]
    if any(b is None for b in bodies):
        print(f"{seq}: 有成品帧找不到主体,跳过")
        return False
    if not 1 <= spec.anchor <= n:
        print(f"{seq}: anchor={spec.anchor} 越界")
        return False
    canvas = frames[0].size
    if any(f.size != canvas for f in frames):
        print(f"{seq}: 各帧画布不一致,跳过")
        return False
    a = bodies[spec.anchor - 1]
    metrics[seq] = {
        "frames": n,
        "targetH": spec.target_h,
        "anchor": spec.anchor,
        "canvas": [canvas[0], canvas[1]],
        "anchorBody": [a[2] - a[0], a[3] - a[1]],
        "bodies": [[b[2] - b[0], b[3] - b[1]] for b in bodies],
    }
    print(f"{seq}: 已入库 {n} 帧 @ {canvas[0]}x{canvas[1]}(锚点帧身体 {a[2] - a[0]}x{a[3] - a[1]})")
    return True


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    args = [a for a in sys.argv[1:]]
    only = None
    index_only = False
    for a in args:
        if a == "--reindex":
            index_only = True
        else:
            only = a
    done = 0
    for base, spec in SEQUENCES.items():
        if only and not base.startswith(only):
            continue
        ok = reindex(base, spec) if index_only else process_sequence(base, spec)
        if ok:
            done += 1
    # 度量清单(供测试断言:锚点帧身体高度 = 目标高度;画布一致;帧数)
    if metrics:
        existing = {}
        if METRICS.exists():
            import json
            existing = json.loads(METRICS.read_text(encoding="utf-8"))
        existing.update(metrics)
        import json
        METRICS.write_text(json.dumps(existing, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                           encoding="utf-8")
        print(f"📐 度量清单 {METRICS.name}:{', '.join(metrics)}")
    print(f"✅ 处理 {done} 套序列")


if __name__ == "__main__":
    main()
