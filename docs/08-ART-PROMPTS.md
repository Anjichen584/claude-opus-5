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

### 动画序列 · 批次 1:剑士走路 4 帧(2026-09-29)

序列帧生成与单帧的关键差别:**一致性 > 单帧好看**。做法是拿成品 `public/sprites/knight.png`
最近邻放大 8 倍贴到品红幕布上当参考图(`web/art_src/frames/ref_knight.png`),每帧都用同一段
"same character / same style / same camera angle" 开头,只换姿势描述。

> **踩过的坑(值得记住)**:第一版 4 帧的走路姿势很好,但模型把**肩上的大剑改成了胸前握持** ——
> 单看每帧都漂亮,和待机帧放在一起就是"拔剑起手"。所以参考图 + 明确写死"sword stays resting on his
> shoulder, do not move it into his hands"才保住剪影连续性。**序列的第一条验收标准是"和相邻状态接得上",
> 不是"这一帧帅"**。

| 帧 | 姿势 | 提示词要点 |
|---|---|---|
| 1 | 接触姿势(右腿在前) | right leg stepped forward with the boot planted, left leg trailing behind, arms swinging naturally |
| 2 | 经过姿势 | both legs clearly together under the body, one knee lifted with the foot off the ground, body raised slightly |
| 3 | 接触姿势(左腿在前) | LEFT leg clearly stepped forward with the boot planted, right leg stretched behind, torso leaning a little forward |
| 4 | 经过姿势(另一侧) | legs close together with the OTHER knee lifted, arms swung the opposite way |

公共尾串:`three-quarter front view, flat solid magenta background (RGB 255,0,255), pixel art with crisp hard edges, no anti-aliasing, no shadow, no text.`

处理:`python3 tools/process_frames.py knight_walk` → 50×55 同画布 4 帧(身体统一缩放 + 脚底贴底),
接进 `balance.anim` + `gfx/anim.ts`(`knight_walk_1..4`)。

### 动画序列 · 批次 1 续:普攻 / 翻滚 / 受击(2026-09-29)

公共尾串同上(`three-quarter front view, flat solid magenta background, pixel art with crisp hard edges,
no anti-aliasing, no motion blur, no shadow, no text`)。**战斗动作的一致性要求比走路更高**:
走路只要剪影连贯,战斗动作还要"和实际判定对得上"——

| 序列 | 帧 | 姿势 | 与逻辑的对应 |
|---|---|---|---|
| `knight_atk` | 1 | 剑离肩、举到头顶后上方,身体后仰蓄力 | 起手(前摇)|
| | 2 | 挥砍到身前下方,前腿弓步 | `attackDur` 中点 ≈ 命中时刻 |
| | 3 | 收招,剑垂在身前,身体前倾 | 连招窗口 |
| `knight_dash` | 1 | 屈膝前扑,压缩成弹簧 | 翻滚起手 |
| | 2 | 抱成球(整体比站立矮一截,这是设计) | 无敌帧中段 |
| | 3 | 起身,剑回到肩上(与待机帧衔接) | 翻滚收尾 |
| `knight_hurt` | 1 | 仰头闭眼、双臂张开 | 受击瞬间(对应 `feel.flashSec`) |
| | 2 | 踉跄后退一步、抬手格挡 | 受击恢复 |

> **管线新增一条纪律(踩到了)**:序列帧的缩放**不能按"身体连通域高度取中位数"归一** ——
> 连通域会把剑一起框进去,挥砍帧比站立帧高一大截(`knight_atk_2` 量出来 854×871 vs `ref` 352×368)。
> 改为**登记表里人工指定"锚点帧"**(整套里最接近站立姿态的那一帧),所有帧按锚点帧算同一个比例。
> 锚点选错的后果有测试兜着:尺寸与单帧精灵差 >12px 直接红。

处理:`python3 tools/process_frames.py knight`(一次处理已登记的全部序列)。

### 动画序列 · 批次 1 收尾:死亡 4 帧 / 施法 3 帧(2026-09-29)

| 序列 | 帧 | 姿势 |
|---|---|---|
| `knight_die` | 1 | 受创仰头、双臂垂落、剑脱手开始下落(还站着 —— 也是本套的**缩放锚点帧**)|
| | 2 | 跪倒,躯干前倾头低垂,剑落在身旁地上 |
| | 3 | 侧倒,身体接近水平,一臂前伸 |
| | 4 | 躺平不动,姿态完全落定 |
| `knight_cast` | 1 | 双手举剑过顶,身体绷紧,剑身泛青光 |
| | 2 | 剑插地,青色冲击环扩散(命中时刻)|
| | 3 | 拔剑回肩上,起身(与待机帧衔接 —— 缩放锚点帧)|

> **两条重出教训(第二轮修图)**:
> 1. **"画小"是最隐蔽的失败**:`cast_1` 第一版人比参考图小一圈。锚点帧定比例意味着**整套序列都会跟着变小**,
>    而单看那一帧只是"构图松一点",根本看不出。修法是在提示词里显式写
>    `SAME SIZE as the reference — he must fill the frame`。序列生成时**每帧都要和参考图并排比大小**,
>    不能只看动作对不对。
> 2. **道具位置要写死在地面**:`die_3` 第一版把剑画在身体**上方**像在飞。倒地帧的道具要写
>    `the sword lies flat ON THE GROUND in front of and below his body, not floating above his body`。
>    (与走路那次"剑从肩上跑到手里"是同一类问题:模型爱把道具摆"好看",而序列要的是**前后一致**。)

### 动画序列 · 批次 28:猎手(2026-09-29)

远程职业的**普攻在代码里走 `cast` 动作**(近战挥剑与拉弓本来就是两套姿态),所以猎手第一批出的是
**走路 4 帧 + 拉弓 3 帧**(翻滚/受击/死亡三组随下批,提示词见本文末尾)。

参考图:`public/sprites/ranger.png` 放大 8 倍(银发 + 绿叶发夹 + 绿斗篷 + 木弓),公共尾串同上,
并沿用轮 27 的两条纪律:`SAME SIZE as the reference`(画小是锚点缩放下最隐蔽的失败)、
**道具位置写死**(弓始终在手里 —— 别让它跑到背上或消失)。

| 序列 | 帧 | 姿势 |
|---|---|---|
| `ranger_walk` | 1/3 | 接触姿势(右腿在前 / 左腿在前),弓在领先手上 |
| | 2/4 | 经过姿势(另一侧膝盖抬起) |
| `ranger_cast` | 1 | 搭箭拉弦,弓举在身前,视线锁定目标(起手)|
| | 2 | 撒放瞬间:弓臂完全伸展、弦手甩在身后(放箭)|
| | 3 | 收弓站直(缩放锚点帧,与待机帧衔接)|
| `ranger_dash` | 1 | 屈膝前扑,弓抱在胸前 |
| | 2 | 抱团滚过(整体比站立矮,设计如此)|
| | 3 | 起身落脚(下批补)|

> **本轮抓到的真 bug(与美术无关,值得记)**:接线时**漏传了 `cast` 的动作时钟** ——
> 表现是「拉弓永远停在第 1 帧」,肉眼看起来像美术/贴图问题,很容易往错的方向查。
> 修法不是补一行参数了事,而是把「组件字段 → 动作时钟」抽成纯函数 `clocksOf`(`gfx/anim.ts`)并补单测:
> 以后漏字段会被测试抓住,而不是靠人盯着画面猜。

### 动画序列 · 批次 28 下半:**猎手翻滚 3 / 受击 2 / 死亡 4**(2026-09-29 已出,**9 张一次过零重出**)

**这一批的结论(与轮 27 对比才有意义)**:轮 27 两次重出(`cast_1` 画小、`die_3` 剑飘),这一批 9 张**全部一次过**。
差别不在提示词更长,而在**参考图的选择**:这一批的姿势参考**只用同职业自己的帧** ——
`ref_ranger_cast3`(站直收弓)当翻滚第 3 帧的锚点,`ref_ranger_walk1/3` 当受击参考,身份参考仍是 `ref_ranger`(站立)。
拿剑士的帧当姿势参考会把铠甲和大剑一起带过来(上一批重出的正是这类漂移),而且模型的"同尺寸"判断会锚到错的人身上。

参考图:主参考 `public/sprites/ranger.png`(8× 放大,身份/配色/尺寸),姿势参考用**同一职业的已有帧**
(不要拿剑士的帧当姿势参考 —— 模型会把铠甲一起带过来):

| 序列 | 帧 | 姿势 | 参考图 |
|---|---|---|---|
| `ranger_dash` | 3 | 起身落脚,站直、双脚落地、弓收回身侧(**本套缩放锚点帧**) | `ranger_cast_3.png`(站直收弓) |
| `ranger_hurt` | 1 | 仰头闭眼、双臂张开、弓横在身前(**锚点帧**) | `ranger_walk_1.png`(身体近乎直立) |
| | 2 | 踉跄后仰,一只脚后撤,头发/斗篷甩起 | `ranger_walk_3.png` |
| `ranger_die` | 1 | 受创仰头、双臂垂落、弓从手里松脱开始下落(**锚点帧**) | `ranger.png` |
| | 2 | 跪倒,躯干前倾头低垂,弓落在身旁地上 | `ranger_hurt_2.png` |
| | 3 | 侧倒,身体接近水平,一臂前伸 | — |
| | 4 | 躺平不动,姿态完全落定 | — |

**四条写进提示词的硬约束**(全是踩过的坑,逐条对应):

1. `SAME SIZE as the reference — she must fill the frame`(画小是锚点定比例下最隐蔽的失败,整套都会跟着小);
2. **弓的位置写死**:站立/受击 `bow held in her left hand at her side`,倒地 `the bow lies flat ON THE GROUND in front of her, not floating above her body`;
3. **绿斗篷不许变紫/变蓝**,银发 + 绿叶发夹是身份锚点;
4. `isolated on a flat solid magenta (#FF00FF) background, no shadow, no text`(公共尾串)。

```bash
# 实际执行(2026-09-29 下半批,一次跑通):
# 登记 ranger_hurt(2,anchor=1) / ranger_die(4,anchor=1);ranger_dash 已是 (3,anchor=3)
python3 tools/process_frames.py ranger
# → 42x48(ranger_dash)/ 42x50(ranger_hurt)/ 58x48(ranger_die),锚点帧身体高全部 = 46 ✅
```

**九张一次过之后的固定验收顺序**(照做就行,别跳):

1. **肉眼看拼图**:九帧拼成一张图,重点看三件事 —— 动作接得上不上、道具(弓/斗篷)有没有飘、
   有没有哪帧明显「画小」(画小是锚点定比例下最隐蔽的失败,单看一帧看不出来);
2. 管线打印的**锚点帧身体高必须 = 46**(不等于 46 就是锚点选错、或那一帧被画小了);
3. `SPRITE_NAMES` 补 9 名 → `npm test`:资产守卫(读 `_anim_metrics.json`)**自动纳入**新序列,
   帧数对不上 / 漏登记 / 画布不一致都会当场红;
4. 提交只提成品(`web/public/sprites/`),源帧按体积政策留在本地。

### 动画序列 · 批次 28 下半场:**秘术师走路 4 / 施法 3 / 翻滚 3**(2026-09-30,10 张一次出)

**风格口径(与剑士/猎手的关键差别)**:秘术师是**法术吟唱**,不是挥砍也不是射击,所以动作的"重量"落在
**手部与法球**上 —— 施法三帧的固定节拍是「**起手聚元素 → 出手 → 收招**」,而且**悬浮紫法球必须在场**
(它是身份锚点,丢了就变成"另一个穿紫袍的路人")。远程职业的普攻在代码里走 `cast`(`attackAction(true)`),
所以这套 `cast` 就是秘术师的普攻动画本身。

参考图:`public/sprites/arcanist.png` 放大 8 倍贴品红幕布(`web/art_src/frames/ref_arcanist.png`,
紫发 + 紫袍金边 + 悬浮紫法球)。**10 张全部一次出**,沿用轮 27/28 的四条纪律:

1. `SAME SIZE as the reference — he must fill the frame`(画小是锚点定比例下最隐蔽的失败);
2. **法球位置写死**:`the glowing purple orb stays floating just above his open right palm`;
3. **紫袍金边不许变色**(身份锚点);
4. `isolated on a flat solid magenta (#FF00FF) background, no shadow, no text`。

| 序列 | 帧 | 姿势 | 锚点帧 |
|---|---|---|---|
| `arcanist_walk` | 1 / 3 | 接触姿势(右腿在前 / 左腿在前) | 1(躯干最直) |
| | 2 | 经过姿势,一膝抬起 | |
| | 4 | 经过姿势(另一侧) | |
| `arcanist_cast` | 1 | 双手举在胸前,能量球在掌心之间聚起来 | |
| | 2 | 双掌前推,大球飞出,衣袍与头发被反冲吹向身后 | |
| | 3 | 收招站直,小球回到右掌上方(与待机帧衔接) | 3(**本套缩放锚点**) |
| `arcanist_dash` | 1 | 屈膝下蹲,双臂把法球抱在胸前 | |
| | 2 | 抱成球滚过(整体比站立矮一截,设计如此) | |
| | 3 | 起身站直,双脚落地,法球回到掌心 | 3 |

处理:`python3 tools/process_frames.py arcanist` → 走路/翻滚 38×48、施法 40×48(施法多 2px 是手掌前推那帧),
锚点帧身体高度全部 46px(= 站立单帧高度)。

> **留一个待办(下批一起做)**:走路第 4 帧的**抬膝幅度不够** —— 逐帧像素对比显示
> `walk_1 vs walk_4` 只差 **14.4%**,而 `walk_1 vs walk_2` 差 **65%**:即第 4 帧更像"站着"而不是"迈过去"。
> 4 帧循环里有半拍缺动作,肉眼会读成轻微跛脚(单看每一帧都正常 —— 与锚点选错同一类"单帧看不出"的坑)。
> 下批(受击 2 + 死亡 4 + 这一帧)重出,提示词要把"**必须明显在半步中、不是站立待机**"写死。
> 这个对比方法本身值得留下:`process_frames.py` 的产物是 34×46 的成品,两两比不透明像素差异(%)就能把
> "复制了参考姿势"这类失败量化出来,不必靠肉眼逐帧盯。

### 动画序列 · 批次 28 收尾:**秘术师受击 2 / 死亡 4 / 走路第 4 帧重出**(2026-09-30,7 帧入库 → 秘术师 6/6)

**出图账目**:9 次调用 = 7 帧 + 2 次重出(`die_1` 首次调用模型没回图,原提示词重试一次过;
`die_4` 首版躺倒方向是**纵向**(俯视角),与横向侧倒的 `die_3` 接不上 —— 尸体会像原地转了 90°,
拿 `die_3` 成品 8× 当姿势参考重出,提示词写死 `SAME HORIZONTAL orientation / LOW and WIDE, never upright`)。

**源帧丢失后的重建方法(体积政策的代价,以后每批都会用到)**:`art_src` 已按体积政策清库,
walk 序列只重出第 4 帧时,前 3 帧源图没了 —— 管线的统一缩放需要**全序列同尺度**的源帧。解法两步:
① 帧 1–3 用成品精灵 **8× NEAREST 放大贴品红幕布**还原(NEAREST 放大再等比缩回是无损往返,
  管线里 46×8=368px 的身体高恰好给出 1/8 的缩放比,像素一个不差);
② 新生成的第 4 帧(生成尺度 ~1126px 身体高)按**镜像姿势同高**归一 —— 它是 walk_2 的镜像经过姿势,
  身体高度理应相同,故整图缩放到 `body_h(walk_2)×8 = 360px` 再入管线。

**走路第 4 帧验收(上批遗留的跛脚病灶)**:改用掩码 IoU 口径两两比(旧记录的 14.4%/65% 是逐像素口径,
数值不可直接比,**趋势可比**):`walk_1↔walk_2 = 21.5%`(公认的好帧作基准),重出后
`walk_1↔walk_4 = 28.2%`、`walk_2↔walk_4 = 29.8%` —— 第 4 帧的动作量**超过**基准帧,半拍缺动作补上了。

| 序列 | 帧 | 姿势 | 参考图 | 锚点 |
|---|---|---|---|---|
| `arcanist_walk` | 4(重出) | 经过姿势镜像,**左膝高抬明显在半步中** | `ref_arcanist` + `walk_2` 成品 8× | 1(沿用) |
| `arcanist_hurt` | 1 | 中招瞬间:仰头闭眼、双臂张开、还站得直 | `ref_arcanist` + `walk_1` 成品 8× | **1** |
| | 2 | 踉跄后仰,一脚后撤,发袍前甩 | `ref_arcanist` + `walk_3` 成品 8× | |
| `arcanist_die` | 1 | 受创仰头、双臂垂落、法球从掌心滑落 | `ref_arcanist` | **1** |
| | 2 | 跪倒,躯干前倾头低垂,法球落地光衰 | `ref_arcanist` + `hurt_2` 生成原图 | |
| | 3 | 侧倒近水平,一臂前伸,法球在地暗淡 | `ref_arcanist` | |
| | 4 | **横向**躺平不动,法球熄成余烬(重出一次,见上) | `ref_arcanist` + `die_3` 成品 8× | |

处理:`python3 tools/process_frames.py arcanist` → walk 38×49 / hurt 40×51 / die 40×48,
锚点帧身体高全部 46 ✅;die_3/die_4 身体 35×26 / 34×23(低而宽,躺平口径一致)。
`SPRITE_NAMES` +6 → web 494;`ParityTests` 帧名契约扩到 51 帧、「清单含」守卫 +hurt/die → C# **810**。
teeth check:清单 die 帧数 4→5 → 「帧数与 C# 规则一致」1 红,还原绿
(还原时踩了个小坑:`git checkout` 会把清单回退到上一轮 —— 清单是管线产物,重跑管线才是正确的还原方式)。

### 动画序列 · 批次 29 上半场:**守卫走路 4 / 重锤攻击 3**(2026-09-30,9 次调用出 7 帧 + 1 次手工移植)

**风格口径**:守卫是**重锤三击**,动作的"重量"在锤和步伐上 —— 攻击三帧节拍「蓄力后仰 → 砸地命中 → 收锤起身」,
命中帧的锤头**必须触地**(与 `attackDur` 中点的判定时刻对应);身份锚点 = 灰绿重甲 + 角盔 + **左手星徽鸢盾** + 巨石战锤,
盾丢了就变成"另一个胖骑士"。

**本批三个新坑,两个进了管线一个进了手术台**:

1. **品红幕布带噪**(这批模型出图偏模糊,g 通道飘到 110+):`key_out` 的通道判定把噪声像素留下,
   幕布连成巨型连通域 → atk_1 的"主体"量出 1078×976(整张画布)。修法**进管线**:`process_frames.preclean`
   —— 近品红一律钉回纯品红(阈值收紧:r/b>150 且 g 低 80+,紫袍不会中招)+ 四周包 6px 纯品红边。
2. **内容蹭到画布角**:atk_3 首版模型自作主张画了地面土丘,蹭到下两角 → "四角取幕布色"被污染,
   连品红判定都失效。预清洗的包边治标,**根治靠提示词**:`ONLY the character … NO ground, NO rocks, NO debris`
   (重出一次过)。
3. **道具会丢**:atk_3 重出版把盾画没了(左手空拳),三帧连播盾会闪没。额度已打满(10/10),
   **手工移植**:从待机帧裁盾(x0..21,y19..44,盾自带暗色描边所以裁得干净),按身体中心 x / 脚底 y
   对齐贴回 —— 成品读作"收锤持盾站立"无违和。移植后把 7 帧源图统一固化为成品 8× 无损还原(管线可重跑)。

**量化验收(掩码 IoU,新校准了带甲职业的基准)**:剑士 `walk_1↔2 = 25.4% / 1↔3 = 2.5% / 2↔4 = 26.0%`。
守卫 `1↔3 = 2.9%`(接触帧镜像,正常);`1↔2 = 7.9%`(抬膝幅度比剑士小 —— 重甲小碎步,盾牌大剪影稀释,可接受);
**`2↔4 = 1.6%`(两次重出模型都不肯换腿,第 4 帧≈第 2 帧的复制)** —— 循环退化为 1-2-3-2 拍型
(经典像素走路循环的合法拍型,34px @ 8fps 肉眼读不出跛),**判定可入库**;
换腿版第 4 帧记入下批待办(与秘术师 walk_4 同一处理:参考图改用**处理后的成品**而不是生成原图,并考虑水平翻转 walk_2 当参考)。

| 序列 | 帧 | 姿势 | 锚点 |
|---|---|---|---|
| `warden_walk` | 1 / 3 | 接触姿势(右腿前 / 左腿前),锤扛肩、盾在体侧 | **1** |
| | 2 / 4 | 经过姿势抬膝(4 与 2 同侧,1-2-3-2 拍型,下批补镜像) | |
| `warden_atk` | 1 | 双手举锤过顶后仰蓄力 | |
| | 2 | 锤头砸进身前地面,弓步前倾(命中时刻) | |
| | 3 | 收锤起身、盾回左手(待机衔接;**锚点**;盾为待机帧移植) | **3** |

处理:`python3 tools/process_frames.py warden` → walk 54×50 / atk 56×51,锚点帧身体高全部 46 ✅。
`SPRITE_NAMES` +7 → web 494;`ParityTests`「清单含」守卫 +walk/atk → C# **812**。

### 动画序列 · 批次 29 下半场:**守卫翻滚 3 / 受击 2 / 死亡 4**(2026-09-30,10 次调用出 9 帧,1 次重出)

**一次过 8 张,重出 1 张**:`die_3` 首版又是跪姿 + 盾竖立(身高 46 = 站立高度,读不出"侧倒",且与 die_2 雷同)。
重出的修法是**双姿势参考夹逼**:同时给 die_2(跪倒)和 die_4(躺平)当参考,提示词写
`the pose BETWEEN the second reference and the third reference`+`about half standing height`——
模型对"中间帧"的理解比对"侧倒"可靠得多(身高 46→41,肘撑侧倒 + 盾平躺带透视椭圆,一次过)。
**经验入册:死亡序列先出 1/2/4 再夹逼出 3**,比按顺序出省重出次数(秘术师那批 die_4 重出、这批 die_3 重出,
病灶都是"倒下方向/幅度自由发挥"—— 夹逼参考直接锁死自由度)。

**职业味细节(设计意图,不是模型跑偏)**:翻滚第 2 帧是**抱盾团身**(盾面朝前、盔角从盾沿探出),
受击第 2 帧是**抬盾格挡踉跄** —— 守卫的"防"写进每个动作;die_4 头盔滑落在头旁(收尾戏剧点,3→4 衔接自然)。

| 序列 | 帧 | 姿势 | 参考图 | 锚点 |
|---|---|---|---|---|
| `warden_dash` | 1 | 屈膝压缩,盾收胸前 | `ref_warden` | |
| | 2 | 抱盾团身滚过(43px,矮于站立是设计) | `ref_warden` | |
| | 3 | 起身,锤回肩、盾回体侧(待机衔接) | `ref_warden` + `atk_3` 成品 8× | **3** |
| `warden_hurt` | 1 | 中招瞬间:仰头咬牙,甲片震起,还站得直 | `ref_warden` + `walk_1` 成品 8× | **1** |
| | 2 | 抬盾格挡踉跄,一脚后撤 | `ref_warden` + `walk_3` 成品 8× | |
| `warden_die` | 1 | 受创仰头,锤脱手下落、盾臂垂落 | `ref_warden` | **1** |
| | 2 | 跪倒,盾从臂上滑脱 | `ref_warden` + `hurt_2` 生成原图 | |
| | 3 | 肘撑侧倒近水平(重出,双参考夹逼) | `ref_warden` + `die_2` + `die_4` | |
| | 4 | 横向躺平,锤盾平躺身旁,盔滑落 | `ref_warden` + `die_3` 生成原图 | |

处理:`python3 tools/process_frames.py warden` → dash 56×48 / hurt 52×49 / die 56×54,锚点帧身体高全部 46 ✅;
9 帧源图照例固化为成品 8× 无损还原。`SPRITE_NAMES` +9 → web 494;「清单含」守卫 +dash/hurt/die → C# **815**。
守卫 5/6(剩施法 3);下批 = 施法 + walk_4 换腿版 + 营地 NPC → 批次 29 收官。

### 动画序列 · 批次 29 收官:**守卫施法 3 / walk_4 换腿版 / 流浪商人 NPC**(2026-09-30,5 张一次过零重出)

**四职业动画就此全齐(批次 27–29,24 组 70 帧)。**

**施法与普攻的区分线(近战职业的第二套砸地怎么画)**:守卫 atk_2 是**弓步横砸**,cast_2 是
**单膝跪地、双手把锤垂直杵进地面**(顶端叠手、锤头触底、琥珀地脉能量迸裂)—— 同是"锤到地上",
纵横两个轴各占一个动作,34px 下一眼可分。cast_1 举锤过顶蓄能(锤头发光是与 atk_1 的区分点),cast_3 收锤衔接待机(锚点)。

**walk_4 换腿版一次过的方法(上批两次重出失败的病灶)**:不再用文字说"另一条腿"——
**把 walk_2 成品水平翻转当姿势参考**,提示词写 `copy the LEG POSE exactly from the second reference` +
`BUT the gear stays on the correct sides`(盾左锤右不许跟着镜像)。模型抄图比读文字可靠。
量化:2↔4 从 1.6%(同侧复制)升到 4.9% —— 到不了剑士的 26%,因为**大盾常年遮住左腿区域**,
剪影差异被结构性吃掉;肉眼验收:盾下换侧露靴,循环不再同手同脚,判定合格。
**经验入册:带大型遮挡道具的职业,IoU 阈值不可跨职业横比,以"换侧可见"的肉眼标准为准。**

**流浪商人 NPC**:`GameScene` 轮 22 就留好了 `drawSprite('npc_merchant')` 钩子(程序化兜帽人形兜底),
本批出图补位 —— 兜帽紫袍(#54406b/#3b2f4a 与兜底同色系)、木质货担、青蓝挎包(#8fd4c8)、抬手打招呼;
`process_art.TARGETS` 登记 44px(微驼背设定,比英雄矮 2px)。

| 内容 | 帧 | 参考图 | 锚点 |
|---|---|---|---|
| `warden_cast` 1 | 举锤过顶蓄能(锤头琥珀光) | `ref_warden` | |
| 2 | 单膝跪地垂直杵锤,地脉能量迸裂 | `ref_warden` | |
| 3 | 收锤起身衔接待机 | `ref_warden` + `atk_3` 成品 8× | **3** |
| `warden_walk` 4(重出) | 经过姿势换侧(左膝抬) | `ref_warden` + **walk_2 成品翻转 8×** | 1(沿用) |
| `npc_merchant` | 站立(游戏内自带上下浮动) | `ref_warden`(风格/尺寸锚) | — |

处理:cast 54×48 锚点 46 ✅;源图照例固化 8×。`SPRITE_NAMES` +4 → web 494;「清单含」+warden_cast → C# **816**。

### 立绘 · 轮 13:**霜噬女猎双帧**(2026-09-30,2 张一次过)

二章中 Boss 立绘(站立 / 引弓)。风格参考给了两张:`ranger` 成品 8×(弓手体型与 chibi 比例)+
`boss_velsha`(冰系配色);身份写死:银白长发、霜蓝肤色、冰晶弓、白毛边冰蓝兜帽半披风。
第二帧拿第一帧当身份参考(拉弓在弦、冰箭凝指间,兜帽戴起 = 进入战斗态,同人无违和)。
`process_art` 登记:TARGETS 56px(比英雄高一头、比巨鹿 80px 轻盈)+ PAIRS 帧对(同画布对齐)→ 47×58。


### 立绘 · 轮 16:**沙暴刽子双帧**(2026-09-30,2 张一次过)

三章中 Boss 立绘(站立拖刀 / 举刀处刑架势)。风格参考:`warden` 成品 8×(魁梧体型)+ `boss_kazra`(荒漠焦橙配色);
身份写死:破烂沙袍兜帽、余烬橙双眼、青铜裂纹肩甲、**比人还大的锈蚀处刑刀** + 腰间钩链(第三招的道具都在立绘里)。
第二帧拿第一帧当身份参考(举刀过顶、刀刃卷沙)。TARGETS 62px(女猎 56 < 刽子 62 < 巨鹿 80)+ PAIRS 帧对 → 70×64。
