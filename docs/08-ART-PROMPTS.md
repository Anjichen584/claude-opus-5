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

### 物品图标 ×6(2026-09-29,第五批)
统一结尾:`single centered emblem, no frame, no circle, no text, no shadow, no background scenery…
isolated on a flat solid magenta (#FF00FF) background, 16-bit retro RPG item icon`(全部用品红幕布,白/金属主体安全)

- **icon_item_weapon**: short straight sword pointing up, pale steel blade with bright edge highlight, gold crossguard, dark leather grip, small blue gem in the pommel
- **icon_item_helmet**: knight helmet, rounded steel dome, dark rectangular visor slit, small gold crest ridge on top, side hinge rivets
- **icon_item_chest**: steel breastplate cuirass, curved chest plate, gold trim edging, central rivet, two shoulder straps
- **icon_item_boots**: **exactly one single** leather boot seen from the side, folded cuff, steel toe cap, tiny wing motif on the ankle
- **icon_item_ring**: gold ring band seen slightly at an angle, small square blue gemstone on top, engraved simple band
- **icon_item_amulet**: necklace amulet, short chain, amber-orange teardrop crystal pendant with inner glow, gold cap

### 统计/状态图标 ×4(2026-09-29,第五批)
- **icon_st_kill**: small pale grey-green mushroom sprite skull, rounded cap with two tiny spots, two empty eye sockets
- **icon_st_dps**: stylized flame with a white star-spark inside its core, warm yellow and orange
- **icon_st_taken**: **exactly one single** cracked red heart with a jagged dark crack down the middle
- **icon_st_chest**: closed wooden treasure chest in three-quarter view, gold metal bands, small gold lock, light escaping the lid seam

> 待生成(下一批):`icon_st_stardust`(琥珀四芒星)、`icon_st_time`(黄铜怀表)、技能图标 ×6。

### 统计图标补全 ×2 + 每技能专属图标 ×8(2026-09-29,第五批之二)
- **icon_st_stardust**: single amber-gold four-pointed star crystal shard, warm white glowing core, tiny sparkles at the points
- **icon_st_time**: small round brass pocket watch, dark indigo clock face, pale short hour and minute hands, tiny winding crown, short chain loop(要求 `no numerals`)
- **icon_cleave**(剑士 Q 裂空斩): three crescent slash arcs stacked diagonally, bright cyan-white wind blades with pale steel cores
- **icon_starfall**(剑士 R 万剑归宗): four swords falling from above at an angle, golden star trails, small impact star at the bottom
- **icon_fan**(猎手 Q 瞬影三连): three arrows fanning out from a single point, green fletching, faint cyan wind arcs
- **icon_arrowstorm**(猎手 R 星陨箭雨): small dark cloud with six arrows raining straight down, green fletching, amber streaks
- **icon_seeker**(秘术师 Q 追星术): violet glowing orb with a curved comet trail bending toward a small target star
- **icon_tempest**(秘术师 R 元素风暴): swirling vortex of four colored strands — orange flame, pale ice blue, yellow lightning, green poison curling inward
- **icon_quake**(守卫 Q 岩震击): heavy war hammer striking the ground, concentric beige shockwave ring, three angular stone chunks
- **icon_roar**(守卫 R 大地怒吼): wide roaring shockwave of concentric bronze-amber rings over cracked brown earth

> **命名规则**:技能 JSON 的 `icon` 字段直接对应 `public/sprites/icon_<名字>.png`(`iconOf()` 拼 `icon_` 前缀),
> 所以文件名不加 `skill_` 之类的中缀 —— 少一层映射就少一处漂移。缺图时 HUD 会静默降级为无图标,
> 由 `skills/__tests__/skillIcons.test.ts` 守卫(登记 + 文件在位 + Q/R 必须专属)。
>
> 待生成(下一批):**E 位专属图标 ×4**(潮涌步/疾风回旋/星幕闪现/壁垒冲锋,现用 `icon_dash` 原型)、技能特效贴图第一批。

### E 位专属图标 ×4 + 技能特效贴图 ×6(2026-09-29,第五批之三)
- **icon_tidestep**(剑士 E 潮涌步): water-surge dash trail, three crescent wave arcs of bright cyan-blue water with white foam tips
- **icon_gale**(猎手 E 疾风回旋): spinning gale ring of pale green wind blades, five curved blades around a small arrow, **no outer frame**
- **icon_blink**(秘术师 E 星幕闪现): violet magic blink, upright teardrop silhouette dissolving into rising star sparkles + arcane glyph ring
- **icon_bulwark**(守卫 E 壁垒冲锋): charging tower shield at an angle, bronze rim with beige stone face, two white speed streaks

特效贴图(统一风格锚点,但**结尾换成 VFX asset 句式**):
- **fx_swordfall**(剑士 R 星陨): a single vertical energy sword falling straight down, golden star trail streaking above, white spark burst at the tip — **竖向长条**,管线按高度缩放(150)
- **fx_vortex**(秘术师 R 元素风暴): elemental vortex seen slightly from above, four curling strands (orange fire / pale ice / yellow lightning / green poison) spiraling inward around a bright void
- **fx_shockwave**(守卫 Q 冲锋终点 / R 怒吼): flat expanding shockwave ring from above, three concentric bronze-amber rings, empty translucent center — **扁平**,按宽度缩放(168)
- **fx_crack**(守卫 Q 岩震击): ground impact crack decal from above, radial spiderweb of jagged fissures glowing amber from inside
- **fx_arrowrain**(猎手 R 星陨箭雨): downward arrow-rain impact marker, glowing green-gold targeting ring with four arrow tips stabbing in
- **fx_dash_trail**(冲刺残影): horizontal dash motion trail, three stretched cyan-white afterimage streaks tapering right

> **管线新增两条**:① 宽幅特效按**宽度**缩放(`tools/process_art.py` 的 `FX_WIDE`)——
> 按高度缩放的扁平冲击环会得到离谱的宽度;② 特效与技能的对应关系集中在 `web/src/game/gfx/skillFx.ts`,
> 由 `gfx/__tests__/skillFx.test.ts` 守卫(登记 + 文件在位 + 尺寸形态 + 回退链 + 四职业 R 必须专属)。

### 怪物第二帧(2026-09-29,12 只)
全部用「第一帧成品放大图 + same creature as the reference, but in a mid-walk / wing-down /
bouncing frame」句式生成;`snowpuff_f2` 第一版是细线稿被管线误吃,重绘为**实心白球**并强调
`solid opaque body` 后正常。
