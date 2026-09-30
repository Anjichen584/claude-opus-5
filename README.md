# 星陨骑士 · 序章 (Starfall Knights: Prelude)

[![CI](https://github.com/Anjichen584/claude-opus-5/actions/workflows/deploy.yml/badge.svg)](https://github.com/Anjichen584/claude-opus-5/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-e8c07a.svg)](LICENSE)

**[English](#english) | [中文](#中文)**

> 🎮 **Play now / 在线试玩**: <https://anjichen584.github.io/claude-opus-5/>
> Keyboard & mouse / gamepad / touch all supported · in-game language toggle (中文/English) · auto-deployed to GitHub Pages on every push to `main`.

---

<a id="english"></a>
## English

An **original** pixel-art loot-and-slash ARPG: fight → loot → build → boss.
World, characters, art and naming are **all original** — only the genre-common
mechanics of "horde looter ARPGs" are borrowed.

**Three signature mechanics**

| Mechanic | One-liner |
|---|---|
| 🔥 **Elemental chains** | 4 elemental marks collide into 6 reactions (Steamburst / Overload / Miasma / Frostchain / Brittle / Numb) — triggered by both sides |
| ◈ **Rune modding** | 48 runes socket into Q/E/R and change a skill's element & zone behavior — four elemental builds per skill |
| 🌙 **Day-night surge** | 6-minute cycle: nights are harder but loot ×2; spend stardust on a lantern to "buy the dawn" |

Plus 🗓 **daily & weekly challenges** (same seed for everyone, fresh modifiers every day),
⚔ **3 abyss difficulty tiers**, ♾ **endless mode**, 🏆 **32 achievements**, 📖 a 30-monster codex,
and a full meta camp (altar growth / starforge blueprints / leaderboards).

### Current state

> **Phase 5 polish** — the vertical slice is closed: menu → camp → 8-room run → boss → results → permanent growth.
> **Full status board →** [docs/06-STATUS.md](docs/06-STATUS.md) (updated every commit)

| Dimension | Now |
|---|---|
| Classes | 4 (Tempest Blade / Star Ranger / Elemental Arcanist / Stone Warden), each with Q/E/R skills & 12 exclusive runes |
| Chapters / bosses | 3 chapters × 3 three-phase bosses + 3 mid-bosses (charger / skirmisher / baiter) |
| Monsters | 30 codex entries, two-frame animations + attack poses for all |
| Loot | 6 slots × 5 rarities, 24 affixes, pity at 200, 9 legendaries with unique effects, rune socket loop, reforging |
| Systems | elemental chains, day-night surge, 8 sanctum totems, shops with haggling, blueprint forging, altar growth, daily/weekly, abyss ×3, endless, local leaderboards ×4, save codes, 3 save slots, colorblind modes, key rebinding, gamepad cursor |
| i18n | UI fully bilingual (zh/en) with a ratchet guard — hardcoded strings can only go down |
| Code | ~44k lines dual-track: TypeScript engine (**574 tests green**) + Unity C# logic mirror (**952 assertions green**), numeric parity enforced both ways |

### Controls

| Action | KB & mouse | Gamepad | Touch |
|---|---|---|---|
| Move / aim | `WASD` / mouse | left / right stick | floating stick / auto-aim |
| Attack / roll | `J` / `Space` | `X` `RT` / `A` | button cluster |
| Skills Q/E/R | `Q` `E` `R` | `LB` `RB` `Y` | button cluster |
| Interact / potion / bag | `F` / `1` / `Tab` | `B` / D-pad up / `Back` | context `F` button |
| Lantern / settings | `L` / `Esc` | D-pad down / `Start` | night button / ⚙ |

> Every key is rebindable in the ⚙ settings panel, which also has screen-shake /
> hit-stop sliders (motion-sickness friendly) and the language toggle.

### Quick start

```bash
git clone https://github.com/Anjichen584/claude-opus-5.git
cd claude-opus-5/web
npm install
npm run dev        # → http://localhost:5173
npm test           # 574 tests
npm run build      # tsc --noEmit + vite build
```

C# logic-layer tests (auto-installs .NET SDK into `~/.local/dotnet`):

```bash
bash unity/Tests/run.sh   # 952 assertions incl. JSON↔C# numeric parity
```

### Repository layout

```
claude-opus-5/
├── docs/       ← single source of truth (design, numbers, art pipeline, status, full plan)
├── tools/      ← art pipeline / packaging / one-shot sync scripts
├── web/        ← main track: TypeScript custom engine (browser, instantly playable)
│   ├── src/engine/   ECS / loop / render / input / audio
│   ├── src/game/     systems / loot / skills / dungeon / meta / ui / i18n
│   └── src/data/     data-driven JSON: balance / skills / runes / affixes / achievements
└── unity/      ← side track: Unity C# mirror (logic layer fully unit-tested)
```

**Two-track rule**: every mechanic ships in `web/` first; validated logic is mirrored
to C#. Any number that drifts between the JSON and the C# mirror turns the test suite
red (`unity/Tests/run.sh`). Damage numbers are never hardcoded — everything reads
`web/src/data/balance.json`.

### Legal line

This project uses **no** assets, characters, names or text from any existing IP.
It only borrows genre-common mechanics (mechanics are not copyrightable); all content
is original. See [docs/04-ART-PIPELINE.md](docs/04-ART-PIPELINE.md) §1.

### License

Code & original assets: **MIT** (see LICENSE).

---

<a id="中文"></a>
## 中文

一款**原创**像素风刷宝割草 ARPG:打怪 → 掉宝 → Build 成长 → 打 Boss。
世界观、角色、美术、命名**全部原创**,只借鉴"割草刷宝 ARPG"的**品类通用机制**。

**三大差异化玩法**

| 玩法 | 一句话 |
|---|---|
| 🔥 **元素连锁** | 4 系元素印记互撞出 6 种反应(蒸爆 / 超载 / 燃瘴 / 冻链 / 脆蚀 / 麻痹),敌我双向触发 |
| ◈ **符文改装** | 48 枚符文镶嵌到 Q/E/R,改变技能元素与地带行为 —— 同一个技能四种元素流派任选 |
| 🌙 **昼夜怪潮** | 6 分钟一昼夜:夜晚怪更强但掉落 ×2;可选花星尘「买天亮」做风险决策 |

外加 🗓 **每日/周常挑战**(全服同种子,天天换规则)、⚔ **深渊三层难度**、♾ **无尽模式**、
🏆 **32 成就**、📖 **30 怪图鉴**,以及完整局外营地(祭坛成长 / 铸台图纸 / 本地排行榜)。

### 当前进度

> **Phase 5 打磨期** — 垂直切片已闭环:主菜单 → 营地 → 8 房推图 → Boss → 结算 → 祭坛永久成长。
> **完整进度看板 →** [docs/06-STATUS.md](docs/06-STATUS.md)(每次提交后更新)

| 维度 | 现状 |
|---|---|
| 职业 | 4 个(狂澜剑士「澜」/ 星弓猎手「絮」/ 元素秘术师「珀」/ 岩铠守卫「磐」),各带 Q/E/R 技能与 12 枚专属符文 |
| 章节 / Boss | 3 章(翠语林地 / 霜语冰原 / 烬语荒漠)× 3 个三阶段 Boss + 3 位性格迥异的中 Boss(莽 / 溜 / 钓) |
| 怪物 | 图鉴 30 种全收录,全员双帧动画 + 攻击姿势 |
| 刷宝 | 6 部位 × 5 稀有度、24 种词条、200 抽保底、9 件橙装专属特效、符文掉落镶嵌闭环、重铸 |
| 系统 | 元素连锁、昼夜怪潮、8 座秘境石碑、商店议价、图纸铸造、星陨祭坛、每日/周常、深渊 ×3、无尽、本地四榜、存档码、3 存档槽、色盲三模式、全键改绑、手柄光标 |
| i18n | UI 全量双语(中/英)+ 棘轮守卫 —— 硬编码文案只许降不许升 |
| 代码 | 双轨约 4.4 万行:TypeScript 自研引擎(**574 条单测全绿**)+ Unity C# 逻辑镜像(**952 条断言全绿**),数值双向 parity 锁死 |

### 操作

| 动作 | 键鼠 | 手柄 | 触屏 |
|---|---|---|---|
| 移动 / 瞄准 | `WASD` / 鼠标 | 左摇杆 / 右摇杆 | 浮动摇杆 / 自动瞄准 |
| 普攻 / 翻滚 | `J` / `空格` | `X` `RT` / `A` | 按钮簇 |
| 技能 Q/E/R | `Q` `E` `R` | `LB` `RB` `Y` | 按钮簇 |
| 交互 / 药剂 / 背包 | `F` / `1` / `Tab` | `B` / 十字上 / `Back` | 上下文 `F` 钮 |
| 星灯买天亮 / 设置 | `L` / `Esc` | 十字下 / `Start` | 夜间按钮 / ⚙ |

> 全部按键可在游戏内 ⚙ 设置面板改绑,附**屏震/顿帧强度**滑条(晕动友好)与语言切换。

### 快速开始

```bash
git clone https://github.com/Anjichen584/claude-opus-5.git
cd claude-opus-5/web
npm install
npm run dev        # → http://localhost:5173
npm test           # 574 条单测
npm run build      # tsc --noEmit + vite build
```

C# 逻辑层测试(自动装 .NET SDK 到 `~/.local/dotnet`):

```bash
bash unity/Tests/run.sh   # 952 条断言,含 JSON↔C# 双向数值 parity
```

### 仓库结构

```
claude-opus-5/
├── docs/       ← 单一事实来源(设计 / 数值 / 美术管线 / 进度看板 / 完整版计划)
├── tools/      ← 美术管线 / 打包 / 一键收尾脚本
├── web/        ← 主线:TypeScript 自研引擎(浏览器即开即玩)
│   ├── src/engine/   ECS / 主循环 / 渲染 / 输入 / 音频
│   ├── src/game/     systems / loot / skills / dungeon / meta / ui / i18n
│   └── src/data/     数据驱动 JSON:balance / skills / runes / affixes / achievements
└── unity/      ← 副线:Unity C# 镜像(逻辑层全量单测)
```

**双轨铁律**:所有玩法先在 `web/` 落地验证,再镜像成 C#;JSON 与 C# 镜像之间任何数值漂移都会让
`unity/Tests/run.sh` 变红。伤害数字禁止硬编码,一律走 `web/src/data/balance.json`。

### 新人上手路径

1. [docs/00-INDEX.md](docs/00-INDEX.md) — 文档地图与阅读顺序
2. [docs/06-STATUS.md](docs/06-STATUS.md) — **有了啥、还没有啥、下一步做啥**
3. [docs/07-CONTRIBUTING.md](docs/07-CONTRIBUTING.md) — 怎么跑起来、怎么加内容、收尾纪律
4. 改数值 → [docs/03-NUMBERS.md](docs/03-NUMBERS.md) + `web/src/data/` 下的 JSON
5. 改美术 → [docs/04-ART-PIPELINE.md](docs/04-ART-PIPELINE.md) + [docs/08-ART-PROMPTS.md](docs/08-ART-PROMPTS.md)
6. 工作量与规划 → [docs/09-SCOPE.md](docs/09-SCOPE.md) / [docs/10-FULL-PLAN.md](docs/10-FULL-PLAN.md)

### 法务红线(必读)

本项目**不使用**任何既有 IP 的美术素材、角色形象、名称、剧情文本。
致敬的是"割草刷宝 ARPG"的**品类通用机制**(机制不受版权保护),所有内容资产均为原创。
新增内容时必须遵守此红线,详见 [docs/04-ART-PIPELINE.md](docs/04-ART-PIPELINE.md) 第 1 节。

### 许可证

代码与原创资产:**MIT**(详见 LICENSE;发布前复核第三方依赖与生成式素材的合规性)。
