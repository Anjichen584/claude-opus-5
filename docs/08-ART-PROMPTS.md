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
