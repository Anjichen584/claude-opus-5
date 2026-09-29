# 02 — 技术架构文档

`最后更新: 2026-09-28` `状态: v1.0(骨架已建,实现进行中)`

---

## 1. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript (strict) | 类型安全,大工程可维护 |
| 构建 | Vite | 秒级热更,零配置 |
| 渲染 | Canvas 2D(分层)| 像素风 2D 完全够用;WebGL 粒子层为 Phase 5 优化项 |
| 架构 | 自研 ECS | 割草场景 500+ 实体,数据驱动+缓存友好 |
| 数据 | JSON(`src/data/`)| 全部玩法内容数据驱动,改数值不碰代码 |
| 存档 | localStorage + 版本迁移 | 局外成长持久化 |
| 测试 | Vitest | 数值公式/掉落表/ECS 核心必须有单测 |

## 2. 目录结构(web/)

```
web/
├── index.html
├── package.json / tsconfig.json / vite.config.ts
├── public/assets/            # 美术资源(spritesheet PNG + JSON 图集)
│   ├── sprites/  audio/  fonts/
└── src/
    ├── main.ts               # 入口:装配引擎与场景
    ├── engine/               # ★ 通用引擎层(不含任何游戏逻辑)
    │   ├── ecs/              # World / Entity / Component / System / Query
    │   ├── core/             # GameLoop(固定步长60Hz) / Time / Rng(可播种)
    │   ├── render/           # Renderer(分层) / Camera / SpriteBatch / ParticleSystem
    │   ├── input/            # 键鼠状态机,动作映射(action map)
    │   ├── audio/            # WebAudio 封装,音效池
    │   ├── physics/          # AABB+圆形碰撞,空间哈希网格
    │   ├── assets/           # 资源加载器,图集解析
    │   └── scene/            # 场景栈(菜单/战斗/结算)
    ├── game/                 # ★ 游戏逻辑层(只依赖 engine)
    │   ├── components/       # 30+ 组件定义(纯数据)
    │   ├── systems/          # 系统(纯逻辑),更新顺序见 §4
    │   ├── combat/           # 伤害管线 / 元素印记 / 连锁反应
    │   ├── skills/           # 技能执行器 + 符文修饰器(装饰器模式)
    │   ├── loot/             # 掉落表 / 词条滚动 / 稀有度
    │   ├── ai/               # 行为树(杂兵) + 状态机(Boss)
    │   ├── dungeon/          # 房间模板 / 程序化连接 / 昼夜调度
    │   ├── meta/             # 局外成长 / 存档 / 图纸
    │   └── ui/               # HUD 与界面(Canvas 绘制,不用 DOM)
    └── data/                 # ★ 内容数据层(策划改这里)
        ├── classes/  skills/  runes/  items/  affixes/
        ├── enemies/  bosses/  rooms/  chapters/
        └── balance.json      # 全局数值杠杆
```

**分层铁律**: `engine/` 禁止 import `game/`;`game/` 禁止 import `data/` 之外的具体内容
(内容一律经 `DataRegistry` 注入)。违反分层的 PR 不合并。

## 3. ECS 设计

- **Entity**: 数字 id。**Component**: 纯数据类,注册表分配位掩码。
- **Query**: 位掩码匹配 + 结果缓存,archetype 变更时失效。
- **事件**: `world.emit(event)` 帧末统一派发,系统间禁止直接互调。

核心组件清单(节选): `Transform, Velocity, Sprite, Animator, Health, Stats,
Hitbox, Hurtbox, Faction, InputState, SkillSlots, RuneSockets, ElementMark,
Buffs, AIBrain, LootTable, Pickup, Lifetime, CameraShake, DamageNumber…`

## 4. 系统更新顺序(固定步长 60Hz,顺序即契约)

```
Input → PlayerControl → AI → SkillCast → Movement → Physics(碰撞+空间哈希)
→ CombatResolve(伤害管线) → ElementReaction(连锁) → Buff/Dot → Death/Loot
→ Pickup → DayNight → CameraFollow+Shake → Animation → ParticleUpdate
—— 渲染(插值)——
BackgroundLayer → ShadowLayer → EntityLayer(Y排序) → FxLayer → UILayer
```

## 5. 伤害管线(combat/,所有伤害唯一入口)

```
DamageIntent { source, target, base, element?, tags[] }
  → 1.攻方加成(Stats+Buffs+词条聚合)
  → 2.暴击判定  → 3.守方减免  → 4.元素印记挂载/反应触发(可能派生新 DamageIntent,链深≤4)
  → 5.HealthApply → 6.反馈事件(顿帧/屏震/飘字/音效) → 7.死亡→LootSystem
```

公式与系数全部读 `data/balance.json`,禁止硬编码数字(单测锁公式)。

## 6. 数据驱动示例(技能 JSON Schema 节选)

```jsonc
// data/skills/blade_q_cleave.json
{
  "id": "blade_q_cleave", "class": "blade", "slot": "Q",
  "cooldown": 4.0, "castTime": 0.12,
  "phases": [{ "type": "meleeSweep", "arc": 110, "range": 2.2,
               "damage": { "scale": "atk", "mult": 1.4 }, "element": null }],
  "runeSlots": 3, "tags": ["melee", "combo"]
}
```
符文以**修饰器**实现:加载时按已镶嵌符文对 phases 做变换(替换/追加/参数改写),
运行时零判断,保证性能。

## 7. Unity 副线映射(unity/)

| web 模块 | Unity 对应 | 移植策略 |
|---|---|---|
| engine/ecs | 不移植 | 直接用 MonoBehaviour/或 Unity ECS |
| game/combat, loot, skills | `Assets/Scripts/Combat…` 纯 C# 类 | **逻辑逐行移植**,不依赖引擎 API |
| data/*.json | `Assets/Resources/Data/` 同一份 JSON | 两边共享同一套数据文件 ✔ |
| render/input | Unity 自带 | 不移植 |

原则:**数值和数据两边永远同源**(JSON 直接复用),只移植逻辑,不移植引擎。

## 8. 性能预算

60 FPS @ 同屏 300 实体 + 800 粒子(中端笔记本)。
手段: 空间哈希碰撞 O(n)、对象池(子弹/粒子/飘字)、脏矩形 UI、离屏 canvas 预烘焙地面。
性能回归基准场景: `web/src/dev/bench.ts`(Phase 2 建立)。

## 9. 存档格式

`localStorage["sk_save_v{N}"]`,JSON + 版本号,版本迁移函数写在 `meta/migrations.ts`(纯函数,可单测)。
存内容: 祭坛等级、图纸、货币、解锁职业、统计、设置(音量/界面缩放/屏震/顿帧/键位)。**局内进度不存档**(roguelite 规则)。

迁移铁律(`meta/migrations.ts` 头注释同款):
1. **加字段不用升版本** —— 老档缺的字段由逐层兜底合并补默认(`defaultSave()` 是唯一默认值出处);
2. **改语义/结构/存储键才升版本** —— 升版本时在 `migrateSave()` 里写显式转换,并立刻回写落盘;
3. **绝不因读到不认识的档而清空数据** —— 版本号高于当前的档先备份到 `sk_save_backup` 再另起新档;
4. 所有数值过 `clamp/num` 卫生化:NaN、负数、越界、断掉的键位绑定一律夹回合法值或恢复默认。
