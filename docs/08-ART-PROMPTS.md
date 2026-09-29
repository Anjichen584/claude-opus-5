# 08 — AI 原画提示词与生成规范

`最后更新: 2026-09-29`

> 源图不进仓库(见 `web/art_src/README.md`),所以**提示词是唯一需要长期保存的生成依据**。
> 新增美术时:按本文模板写 prompt → 生成 → 过管线 → 把 prompt 追加到 §3。

---

## 1. 通用模板

```
<风格锚点> + <主体描述> + <像素规格> + <幕布与禁忌>
```

**风格锚点(每条必带,保证与全库同风格)**

> Stylized pixel art <类别> for a top-down action RPG.
> Chunky 3-4px pixels, bold 1px very dark navy outline, high saturation,
> light from upper-left, no anti-aliasing.

**像素规格**

| 类别 | 目标高(px) | 备注 |
|---|---|---|
| 主角 | 46~48 | 另有 `_walk` 迈步帧 |
| 杂兵 | 22~40 | 双帧动画对需成对生成 |
| 精英 | 64 | 橡木傀儡 |
| Boss | 128~132 | |
| 场景物件 | 30~116 | |
| 拾取物 | 24~30 | |
| UI 图标 | 20~26 | 元素/技能图标 |
| 9-slice 面板 | 32×32 | 四角 8px 不拉伸 |

**幕布与禁忌(结尾固定句式)**

> isolated on a flat solid magenta (#FF00FF) background, no shadow, no text, 16-bit retro
> <game asset | RPG item icon | ability icon>.

- **带白色/浅色主体时**必须强调幕布是品红(管线按通道判定,白色不会被误吃,但仍别让模型画白底);
- **绿色主体**(藤妖/毒系)**改用绿幕 `#00FF00`**,并明确 `no green screen` 之外不要画大面积绿色背景;
- 不要出现已有作品的角色、标志、UI 皮肤(法务红线见 04 §1)。

## 2. 三条实战经验

1. **双帧动画对**:第二帧用第一帧的放大版当 reference 做图生图,并明确写
   "same creature as the reference, but in a <动作> frame, keep the exact same colors,
   proportions and outline"。两帧主体尺寸不会自动一致,靠管线按主体连通域对齐(见 04)。
2. **一次只要一个主体**:要"单瓶药剂"就必须写 `exactly one single bottle, not two, no duplicates`,
   否则模型会给两个(实测踩过)。
3. **UI 面板别让模型画背景纹理**:写 `flat solid interior, no texture, no gradient`,
   否则内部噪点拉伸到大面板上会很明显(管线已用内缩铺平兜底,但仍以源头干净为准)。

## 3. 已生成资源提示词存档

> 早于本次会话的 49 张源图未存 prompt,可用 `public/sprites/<name>.png` 放大当参考图重生成。

### 拾取物(2026-09-29,第三批)
- **pickup_chest**: pixel art treasure chest item sprite… wooden chest, brass gold bands, tiny lock, lid slightly ajar leaking golden glow… magenta background
- **pickup_stardust**: pixel art golden stardust shard… glowing amber-gold four-pointed star crystal, warm yellow-white core… magenta
- **pickup_potion**: pixel art healing potion… exactly one single bottle, round glass flask with bright red liquid, cork stopper… green (#00FF00) screen
- **pickup_rune**: pixel art rune stone… flat grey-blue stone tablet with glowing violet arcane glyph… green screen

### 传送门与元素图标(2026-09-29)
- **portal_gate**: pixel art portal gate… single isolated stone archway, carved glowing cyan runes, swirling blue-cyan vortex inside… no surrounding wall tiles… magenta
- **elem_fire / elem_ice / elem_lightning**: 元素符号 glyph only, no frame, no circle… magenta
- **elem_poison**: 毒液滴(不是叶子!第一版生成成叶子,已回炉)—— `single thick toxic liquid droplet, pointed top, rounded bottom, dripping`… magenta

### UI(2026-09-29)
- **ui_panel**: pixel art UI frame panel, 9-slice style… flat solid dark indigo interior, 3px raised border, four gold corner studs… magenta
- **icon_slash / icon_shot / icon_dash / icon_ult**: 四个技能原型 emblem(斩击/投射/突进/大招)… single emblem centered, no frame, no circle… magenta

### 怪物第二帧(2026-09-29,12 只)
全部用「第一帧成品放大图 + same creature as the reference, but in a mid-walk / wing-down /
bouncing frame」句式生成;`snowpuff_f2` 第一版是细线稿被管线误吃,重绘为**实心白球**并强调
`solid opaque body` 后正常。
