# 《星陨骑士·序章》Unity C# 镜像

> Web(TypeScript)为**主线实现**;此目录是核心玩法逻辑的 **C# 镜像**,
> 供本地 Unity 工程使用。渲染/输入/场景由 Unity 侧自行搭建,
> 本目录提供的是**纯 C#、不依赖 UnityEngine 的可单测逻辑层**。

## 目录结构与 Web 端映射

| C# 文件 | 对应 Web 文件 | 内容 |
|---|---|---|
| `Core/Rng.cs` | `engine/core/Rng.ts` | mulberry32 确定性随机(同种子同序列,双端可复现掉落) |
| `Core/GameClock.cs` | `game/dungeon/Clock.ts` | 昼夜时钟(360s 周期,昼240/夜120,星灯 SkipNight) |
| `Core/LogicActor.cs` | `components(Transform/Velocity/敌人标记)` | 逻辑演员:位置+速度+战斗单元(System.Numerics,零 Unity 依赖) |
| `Core/LogicWorld.cs` | `World + 空间查询` | 玩家/敌人/Zone/弹幕容器 + 圆形/锥形查询 + 最近敌人 + 推进 |
| `Core/Projectiles.cs` | `game/combat/ProjectileSystem.ts` | 弹幕:直线/追踪(6 rad/s 转向上限)/落地范围,寿命与命中回收 |
| `Combat/Elements.cs` | `game/combat/Elements.ts` | 四元素 + 六反应表 |
| `Combat/Formulas.cs` | `game/combat/formulas.ts` | 防御减伤 def/(def+50)、最终伤害公式 |
| `Combat/CombatUnit.cs` | `components(Health/Stats/Marks/Buffs)` | 战斗单元聚合 + 计时器推进 |
| `Combat/DamagePipeline.cs` | `game/combat/DamagePipeline.ts` | 统一伤害入口:印记→反应→暴击/防御/易伤→上印记;连锁衰减 0.8^depth |
| `Combat/Zones.cs` | `Zone 组件 + ZoneSystem` | 持续区域(火海/毒沼/冰圈)按 tick 结算,可触发反应 |
| `Skills/SkillRuntime.cs` | `SkillSystem.ts`(共用骨架) | 冷却(含 CDR,只作用 Q/E)/怒气/延迟段队列/扇形偏移/符文地带落地 |
| `Skills/BladeSkills.cs` | `SkillSystem.ts`(剑士路径) | Q裂空斩三连/E潮涌步+残影爆炸/R万剑归宗(怒气驱动) |
| `Skills/RangerSkills.cs` | `SkillSystem.ts`(猎手路径) | Q瞬影三连/E疾风回旋+环箭/R星陨箭雨(准星区域,sqrt 均匀圆盘) |
| `Skills/ArcanistSkills.cs` | `SkillSystem.ts`(秘术师路径) | Q追星术追踪法球/E星幕闪现(限程瞬移+起点爆裂)/R元素风暴(怒气延长) |
| `Skills/WardenSkills.cs` | `SkillSystem.ts`(守卫路径) | Q岩震击(眩晕)/E壁垒冲锋(击退)/R大地怒吼(全周击退+减速) |
| `Skills/ClassSkillSet.cs` | `SkillSystem.ts(klass 分派)` | 四职业分派适配层:怒气/CDR/冷却/符文位统一代理,切职业只改一个枚举 |
| `Skills/RunePool.cs` | `data/runes/pool.json(全 36 枚)` | 符文定义镜像(id/技能/名称/元素/地带四参数) |
| `Dungeon/RunManagerLite.cs` | `game/dungeon/RunManager.ts` | 8 房序列(战战宝藏战精英战战Boss)/三章出怪池与精英编成/章节 Boss/夜间与章节缩放,OnSpawn/OnRoomCleared/OnVictory 回调 |
| `Meta/MetaSave.cs` | `game/meta/Save.ts` | 局外存档 POCO(JsonUtility 兼容)+ 祭坛升价公式 |
| `Meta/Codex.cs` | `game/meta/Codex.ts` | 图鉴(收录):只存"见过没有+次数",数值现读 `Bestiary`/`RunePool`;MarkKill/MarkRune/Sanitize/TopKills |
| `Loot/Items.cs` | `game/loot/Items.ts` | 稀有度权重+幸运+保底(200 次必橙)、词条工厂 |
| `Data/Balance.cs` | `data/balance.json`(节选) | 核心常量镜像 + `PxPerM`(=web 的 M=48)⚠ 双端修改需同步 |
| `Data/Bestiary.cs` | `data/balance.json`(全量) | **自动生成**:21 种敌人属性行 + 三章配置 + 304 个行为参数常量(`python3 tools/gen_bestiary.py`) |
| `Core/PixelFont.cs` | `game/gfx/pixelFont.ts` | 5×7 位图数字字体(24 字符):字模表 + 度量/对齐/Pixel 查询;字模权威是 web/src/data/font.json,`ParityTests` 逐字符逐行比对(改一行字模立刻红) |
| `Meta/Challenges.cs` | `game/meta/Daily.ts` + `Weekly.ts` | 挑战镜像:每日 10 条词条池 + 周常 8 条**铁律**(结构性:多一波怪/商店关门/祭坛失效/精英提前/地形定死)+ ISO 周键 + 与 web 同构的抽签链路(FNV-1a→雪崩→mulberry32,含 golden 向量);数据走 `Parity` 与 challenges.json 的 178 键逐项比对 |
| `Combat/Telegraphs.cs` | `TelegraphStrike` / Boss 预警 | 预警区域:亮圈 → 到点结算 → 可残留元素地带 |
| `Dungeon/CreatureAI.cs` | `EnemySystem/CritterSystem/EliteSystem/TundraSystem/DesertSystem` | 18 种杂兵 AI:炮台/风筝/滚撞/旋壳/俯冲/钻地/抛毒沼/瞬跳/精灵逃跑 |
| `Dungeon/TerrainRules.cs` | `game/dungeon/Terrain.ts` | 地形机制镜像:浅滩(水里移动 ×0.72 / 雷伤 ×1.25 / 麻痹 0.5s)+ 可打穿的障碍(树 80 / 岩 120 耐久,碎后不再挡路)+ `TerrainState.ForLayout`;数值走 `Parity`,与 balance.json 的 6 个键(terrain 段 + props.*.hp)逐项比对 |
| `Dungeon/RoomLayouts.cs` | `game/dungeon/RoomLayouts.ts` | 房间布局模板镜像:9 种模板清单 + 抽模板权重(战斗房加权、精英房不出散布、Boss/静谧房固定)+ 摆放常量(出入口净空/散件间距/通道净宽/墙砖间距);数值走 `Parity`,与 balance.json 的 layouts 段 16 键逐项比对 |
| `Dungeon/BossAI.cs` | `BossSystem/VelshaSystem/KazraSystem` | 三个 Boss:南弥尔(横扫/根须线/地刺矩阵/根须风暴 + 阶段硬直)、薇尔莎(冰弹环/暴风雪/召唤/寒风冲锋)、卡兹拉(钻地突袭/熔痕/召唤烬鼠);三阶段血线与 P3 提速 |

## 测试(不需要 Unity 编辑器)

```bash
bash unity/Tests/run.sh      # 414 项断言:随机数/元素反应/伤害管线/方向性弱点/地带/预警/弹幕/四职业技能/杂兵与双Boss AI/掉落/时钟/存档/三章出怪/本地排行榜/双端 parity
```

- 只编译 `Assets/Scripts` 下**不依赖 UnityEngine** 的目录(`Core/ Combat/ Skills/ Dungeon/ Meta/ Loot/ Data/`),`Unity/` 目录不参与。
- `unity/Tests/ParityTests.cs` 会**直接读 web 的数据文件**,与 C# 镜像逐键比对:
  88 个技能数值键 + 36 枚符文五字段 + **304 个图鉴数值键**(敌人/章节/Boss),任一边改了数值而另一边没跟上都会红。
- 图鉴是**生成的**:改 `balance.json` 后跑 `python3 tools/gen_bestiary.py` 再提交;
  手改 `Data/Bestiary.cs` 会被 parity 测试抓出来。
- CI(`.github/workflows/deploy.yml` 的 `logic-test` job)会跑同一套测试;本地缺 dotnet 时脚本会打印安装命令。

## 设计约定

1. **纯逻辑层零 Unity 依赖**:上表所有类只用 `System.*`,可在任意 C# 测试框架
   (NUnit/xUnit)直接单测;Unity 侧用 MonoBehaviour 包一层做渲染与输入。
2. **空间相关逻辑走回调**:蒸汽范围扩散、冻链弹射选目标需要空间查询,
   `DamagePipeline.OnReaction` 回调交由宿主(Unity 场景)实现,
   与 Web 端"帧事件总线"角色对应。
3. **数值权威**:`web/src/data/balance.json` 是唯一数值源;
   `Data/Balance.cs` 为手工镜像的核心子集,改数值时两边一起改
   (完整同步可后续用 codegen 从 JSON 生成)。

## 渲染层(Assets/Scripts/Unity,依赖 UnityEngine)

| 文件 | 内容 |
|---|---|
| `Unity/GameBootstrap.cs` | **挂到空物体即玩(逻辑驱动)**:LogicWorld+RunManagerLite 推进 9 房,清房出传送门踩过继续,Boss 死通关;Zone 元素色圆盘可视化;击杀入账 MetaSave |
| `Unity/PlayerController.cs` | WASD/鼠标瞄准/左键三段连击(攒怒气)/空格翻滚/**Q·E·R 技能**(四职业可切:Inspector 选 `Hero`,含 CDR 滑杆/开局随机 Q 符文/准星限程) |
| `Unity/EnemyAgent.cs` | 视图同步+追击 AI,眩晕/减速 Buff 生效,受击闪白(血量侦测) |
| `Unity/CameraFollow.cs` | 顶视角指数平滑跟随 |

> 占位渲染用原色几何体;正式像素美术把 `web/public/sprites/*.png`
> 以 Point(no filter)+ Sprite 模式导入,替换 primitive 即可。

## 尚未镜像(Web 端已有)

- 商店/秘境(事件房)/图纸/星灯交互、装备穿戴与词条 recompute
- 图鉴 / 成就面板(逻辑层 `Meta/Codex.cs` 已就绪,缺 Unity 面板;web 端实现见 `ui/CampUI.ts` 的 renderCodex / renderAchv)
- 成就判定(web 端 `meta/Achievements.ts` 20 条;Unity 侧尚未镜像)
- 存档落盘(MetaSave 已备好,宿主接 PlayerPrefs 两行即可)
- 普攻各职业差异(猎手连射弓/秘术师法杖/守卫重锤连击):参数在 `balance.json classes.*`,目前宿主仍用剑士三段连击
- 每日挑战词条(RunMods)对局内数值的乘区

> 已知数据死字段(web 与 C# 两边都未消费,仅作数据保留):
> `blade_q_cleave.pullM`(拉拽 1.5m)、`shroomling.spore`(孢子云)、`frostslime.split`(分裂)。

## 快速开始(Unity 2022.3 LTS+)

1. 新建 3D(URP 可选)工程,把 `Assets/Scripts` 拖入;
2. 写一个 `MonoBehaviour`:
   ```csharp
   var clock = new GameClock();
   var factory = new ItemFactory(seed: 42);
   var goblin = new CombatUnit { HpMax = 60, Hp = 60, Def = 2 };
   var hero = new CombatUnit { Atk = 12, CritRate = 0.05f, IsPlayerTeam = true };
   goblin.Marks[Element.Ice] = 4f; // 假设已有冰印记
   int dmg = DamagePipeline.Deal(new DealOpts {
       Source = hero, Target = goblin, Mult = 1.4f,
       Element = Element.Bolt, CanCrit = true, // 冰+雷 → 冻链!
   });
   ```
3. 每帧 `clock.Tick(dt)`、`unit.TickTimers(dt)`、`skills.Tick(dt)`(技能延迟段与冷却走它)。

## 与 web 的行为对齐清单(镜像时踩过的点)

1. **CDR 只作用于 Q/E**,R 冷却恒为表值(web `castR` 里 `p.cdR = def.cooldown`)。
2. **扇形展开**用 `(i-(count-1)/2)*spread`,三发是 −16°/0°/+16°,不是平分整段。
3. **符文地带落点各不相同**:剑士 Q 在身前 1.2m、剑士 E 在残影爆点、游侠 E 在**起点**、
   守卫 E 在落点**前方 0.8m**;秘术师 R 的领域时长随怒气 ×(1+0.5×ratio)。
4. **箭雨落点**是准星方向(限程 rangeM)周围按 `sqrt(rand)*radiusM` 的**均匀圆盘**,不是线性半径。
5. `M = 48 px/m`:web 里直接用像素写的常量(如落点抖动 30px)在 C# 里换算成米。
6. **Boss 不吃房间深度**:web 里 `scaleHp(cfg.hp, 0, night)` 用的是 depth **0**,只有杂兵才乘房间深度。
7. **方向性弱点**要传命中角(`DealOpts.HasHitAngle`):傀儡从背后打 ×2、冰龟从正面打 ×0.5,
   角度定义同 web = `atan2(目标 - 落点)`。
8. **杂兵与 Boss 的驱动权要分开**:`CreatureAI` 必须显式跳过薇尔莎/卡兹拉,否则两套 AI 会抢速度
   (这条是写测试时才发现的真 bug)。
