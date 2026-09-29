# 星陨骑士 · 序章 (Starfall Knights: Prelude)

[![CI](https://github.com/Anjichen584/claude-opus-5/actions/workflows/deploy.yml/badge.svg)](https://github.com/Anjichen584/claude-opus-5/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-e8c07a.svg)](LICENSE)

> 🎮 **在线试玩**: <https://anjichen584.github.io/claude-opus-5/>
> 键鼠 / 手柄 / 手机触屏均支持,push 到 `main` 自动构建并部署到 GitHub Pages。

一款**原创**像素风刷宝割草 ARPG:打怪 → 掉宝 → Build 成长 → 打 Boss。
世界观、角色、美术、命名**全部原创**,只借鉴"割草刷宝 ARPG"的**品类通用机制**。

**三大差异化玩法**

| 玩法 | 一句话 |
|---|---|
| 🔥 **元素连锁** | 4 系元素印记互撞出 6 种反应(蒸爆 / 超载 / 燃瘴 / 冻链 / 脆蚀 / 麻痹),敌我双向触发 |
| ◈ **符文改装** | 36 枚符文镶嵌到 Q/E/R,改变技能元素与地带行为 —— 同一个技能能玩出三种流派 |
| 🌙 **昼夜怪潮** | 6 分钟一昼夜:夜晚怪更强但掉落 ×2;可选花星尘「买天亮」做风险决策 |

外加 **🗓 每日挑战**:全服同种子的 3 条风险收益词条,每天换一套规则。

---

## 当前进度

> **Phase 5 打磨期** — 垂直切片已闭环:主菜单 → 营地 → 8 房推图 → Boss → 结算 → 祭坛永久成长。
> **完整进度看板 →** [docs/06-STATUS.md](docs/06-STATUS.md)(每次提交后更新)

| 维度 | 现状 |
|---|---|
| 职业 | 4 个(狂澜剑士「澜」/ 星弓猎手「絮」/ 元素秘术师「珀」/ 岩铠守卫「磐」),各带 Q/E/R 技能与专属符文 |
| 章节 / Boss | 3 章(翠语林地 / 霜语冰原 / 烬语荒漠)× 3 个三阶段 Boss(南弥尔 / 薇尔莎 / 卡兹拉) |
| 怪物 | 18 种杂兵 + 精英橡木傀儡 + 星尘精灵彩蛋;**12 对双帧走路动画** |
| 刷宝 | 6 部位 × 5 稀有度、8 种词条、200 抽保底、3 件橙装专属特效、符文掉落镶嵌闭环 |
| 系统 | 元素连锁、昼夜怪潮、秘境房、商店、图纸铸造、星陨祭坛永久成长、存档迁移(v2) |
| 美术 | 71 张正式精灵(AI 生成 → 管线规范化),UI 走 9-slice 面板贴图 |
| 代码 | TypeScript 自研引擎约 16.1k 行 · **340 条单测全绿** · Unity C# 镜像 34 文件 · **595 条逻辑层断言全绿** |

## 操作

| 动作 | 键鼠 | 手柄 | 触屏 |
|---|---|---|---|
| 移动 / 瞄准 | `WASD` / 鼠标 | 左摇杆 / 右摇杆 | 左半屏浮动摇杆 / 自动瞄准最近敌 |
| 普攻 / 翻滚 | `J` / `空格` | `X` `RT` / `A` | 按钮簇(按住连击) |
| 技能 Q/E/R | `Q` `E` `R` | `LB` `RB` `Y` | 按钮簇 |
| 交互 / 药剂 / 背包 | `F` / `1` / `Tab` | `B` / 十字上 / `Back` | 上下文 `F` 钮 |
| 星灯买天亮 / 设置 | `L` / `Esc` | 十字下 / `Start` | 夜间按钮 / ⚙ |

> 全部按键可在游戏内 ⚙ 设置面板改绑,并附**屏震/顿帧强度**滑条(晕动友好)。

## 快速开始

```bash
git clone https://github.com/Anjichen584/claude-opus-5.git
cd claude-opus-5/web
npm install
npm run dev        # → http://localhost:5173
npm test           # 78 条单测
npm run build      # tsc --noEmit + vite build
```

美术管线(可选,仅在需要重做精灵时):`python3 tools/process_art.py` —— 详见 [docs/04-ART-PIPELINE.md](docs/04-ART-PIPELINE.md)。

## 仓库结构

```
claude-opus-5/
├── README.md              ← 你在这里
├── docs/                  ← 设计与工程文档(单一事实来源,先读这里)
│   ├── 00-INDEX.md        文档索引与阅读顺序(从这篇进)
│   ├── 01-GDD.md          游戏设计文档:玩法与每个系统的设计意图
│   ├── 02-ARCHITECTURE.md 技术架构:引擎、数据流、铁律
│   ├── 03-NUMBERS.md      数值设计:伤害公式与成长曲线
│   ├── 04-ART-PIPELINE.md 美术规范、资源清单、抠图/双帧坑位
│   ├── 05-ROADMAP.md      路线图(Phase 0~6)
│   ├── 06-STATUS.md       ★ 进度看板(有了啥/缺啥/下一步)
│   ├── 07-CONTRIBUTING.md 开发指南、协作规范、收尾纪律
│   ├── 08-ART-PROMPTS.md  AI 原画提示词存档(源图不入库,靠这里可再生)
│   ├── 09-SCOPE.md        剩余工作量估算(还差多少轮做完,三种口径)
│   └── 10-FULL-PLAN.md    **完整版生产计划**(v1.0 规格书 / 里程碑 / 52 轮清单)
├── tools/
│   ├── process_art.py     AI 原画 → 游戏精灵(抠图/降采样/双帧主体对齐)
│   └── sync.sh            一键收尾:提交 → 推送 → 清沙箱
├── web/                   ← 主线:TypeScript 自研引擎版
│   ├── src/engine/        引擎层:ECS / 主循环 / 渲染 / 输入 / 音频 / 相机
│   ├── src/game/          玩法层:systems / loot / skills / dungeon / meta / ui
│   ├── src/data/          数据驱动:balance / skills / runes / affixes / items(JSON)
│   └── public/sprites/    正式精灵(唯一需要提交的美术产物)
└── unity/                 ← 副线:Unity C# 镜像工程(逻辑层已验证可单测)
    └── Assets/Scripts/
```

## 双轨开发

|  | `web/`(主线) | `unity/`(副线) |
|---|---|---|
| 语言 | TypeScript | C# |
| 定位 | 全部玩法先在这里实现并验证,浏览器即开即玩 | 验证过的核心逻辑移植成 Unity 脚本 |
| 现状 | 完整可玩(3 章 + 4 职业 + 每日挑战) | 逻辑层:RNG/元素连锁/伤害管线/装备工厂/存档;**渲染层最小可玩**(占位几何体) |
| 运行 | `cd web && npm install && npm run dev` | 本地 Unity 2022 LTS+ 打开 `unity/`(说明见 `unity/README.md`) |

## 新人上手路径

1. [docs/00-INDEX.md](docs/00-INDEX.md) — 文档地图与阅读顺序
2. [docs/06-STATUS.md](docs/06-STATUS.md) — **有了啥、还没有啥、下一步做啥**
3. [docs/07-CONTRIBUTING.md](docs/07-CONTRIBUTING.md) — 怎么跑起来、怎么加技能/怪物/装备、收尾纪律
4. 改玩法数值 → [docs/03-NUMBERS.md](docs/03-NUMBERS.md) + `web/src/data/` 下的 JSON
5. 改美术 → [docs/04-ART-PIPELINE.md](docs/04-ART-PIPELINE.md) + [docs/08-ART-PROMPTS.md](docs/08-ART-PROMPTS.md)
6. 想知道"还要多少工作量" → [docs/09-SCOPE.md](docs/09-SCOPE.md);"完整版怎么做" → [docs/10-FULL-PLAN.md](docs/10-FULL-PLAN.md)

> 铁律:伤害数字禁止硬编码,全部走 `web/src/data/balance.json`(见 02 §5)。

## 法务红线(必读)

本项目**不使用**任何《元气骑士》系列的美术素材、角色形象、名称、剧情文本。
致敬的是"割草刷宝 ARPG"的**品类通用机制**(机制不受版权保护),所有内容资产均为原创。
新增内容时必须遵守此红线,详见 [docs/04-ART-PIPELINE.md](docs/04-ART-PIPELINE.md) 第 1 节。

## 许可证

代码与原创资产:**MIT**(详见 LICENSE;发布前复核第三方依赖与生成式素材的合规性)。
