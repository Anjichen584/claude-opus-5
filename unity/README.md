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
| `Dungeon/RunManagerLite.cs` | `game/dungeon/RunManager.ts(一章)` | 9 房序列/精英房/加权预算出怪池/夜间缩放,OnSpawn/OnRoomCleared/OnVictory 回调 |
| `Meta/MetaSave.cs` | `game/meta/Save.ts` | 局外存档 POCO(JsonUtility 兼容)+ 祭坛升价公式 |
| `Loot/Items.cs` | `game/loot/Items.ts` | 稀有度权重+幸运+保底(200 次必橙)、词条工厂 |
| `Data/Balance.cs` | `data/balance.json`(节选) | 核心常量镜像 + `PxPerM`(=web 的 M=48)⚠ 双端修改需同步 |

## 测试(不需要 Unity 编辑器)

```bash
bash unity/Tests/run.sh      # 159 项断言:随机数/元素反应/伤害管线/地带/弹幕/四职业技能/掉落/时钟/存档/房间序列/双端 parity
```

- 只编译 `Assets/Scripts` 下**不依赖 UnityEngine** 的目录(`Core/ Combat/ Skills/ Dungeon/ Meta/ Loot/ Data/`),`Unity/` 目录不参与。
- `unity/Tests/ParityTests.cs` 会**直接读 `web/src/data/skills/*.json` 与 `runes/pool.json`**,
  与 C# 镜像逐键比对(本次 88 个技能数值键 + 36 枚符文五字段),任一边改了数值而另一边没跟上都会红。
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

- 第二三章(冰原/荒漠)出怪表与 Boss 薇尔莎/卡兹拉行为
- 商店/秘境/图纸/星灯交互、装备穿戴 recompute
- 存档落盘(MetaSave 已备好,宿主接 PlayerPrefs 两行即可)
- 普攻各职业差异(猎手连射弓/秘术师法杖/守卫重锤连击):参数在 `balance.json classes.*`,目前宿主仍用剑士三段连击

> 已知数据死字段:`blade_q_cleave.pullM`(1.5m 拉拽)在 web 与 C# 两边都还没有消费,仅作数据保留。

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
