# 星陨骑士 · 序章 (Starfall Knights: Prelude)

> 🎮 **在线试玩**: https://anjichen584.github.io/claude-opus-5/ (键鼠 / 手柄 / 手机触屏均支持,push 自动部署)

> 一款**原创**像素风刷宝割草 ARPG。玩法致敬"打怪-掉宝-Build成长"的经典割草品类,
> 但世界观、角色、美术、命名**全部原创**,并有三大差异化玩法(元素连锁 / 符文改装 / 昼夜怪潮)。

**平台**: 浏览器(主线,TypeScript 自研引擎) + Unity 工程(副线,C# 移植)
**状态**: 🚧 Phase 0 — 文档与工程骨架已完成,核心引擎开发中
**当前进度一眼看**: 👉 [docs/06-STATUS.md](docs/06-STATUS.md)

---

## 新人 5 分钟上手路径

1. 读 [docs/00-INDEX.md](docs/00-INDEX.md) — 文档地图,按顺序读
2. 读 [docs/06-STATUS.md](docs/06-STATUS.md) — **有了啥、没有啥、下一步做啥**
3. 想跑起来 → [docs/07-CONTRIBUTING.md](docs/07-CONTRIBUTING.md) 开发环境章节
4. 想改玩法数值 → [docs/03-NUMBERS.md](docs/03-NUMBERS.md) + `web/src/data/` 下的 JSON
5. 想加内容(技能/怪物/装备)→ [docs/07-CONTRIBUTING.md](docs/07-CONTRIBUTING.md) "如何添加内容"章节

## 仓库结构

```
claude-opus-5/
├── README.md              ← 你在这里
├── docs/                  ← 全部设计与工程文档(先读这里)
│   ├── 00-INDEX.md        文档索引与阅读顺序
│   ├── 01-GDD.md          游戏设计文档(玩法的一切)
│   ├── 02-ARCHITECTURE.md 技术架构(引擎的一切)
│   ├── 03-NUMBERS.md      数值设计(公式与成长曲线)
│   ├── 04-ART-PIPELINE.md 美术规范与资源清单
│   ├── 05-ROADMAP.md      开发路线图(Phase 0~6)
│   ├── 06-STATUS.md       ★ 进度看板(每次提交后更新)
│   └── 07-CONTRIBUTING.md 开发指南与协作规范
├── web/                   ← 主线:TypeScript 自研引擎版
│   ├── index.html
│   ├── package.json
│   └── src/               (结构见 02-ARCHITECTURE.md)
└── unity/                 ← 副线:Unity C# 镜像工程(核心逻辑移植)
    └── Assets/Scripts/
```

## 双轨开发说明

| | web/(主线) | unity/(副线) |
|---|---|---|
| 语言 | TypeScript | C# |
| 用途 | 全部玩法先在这里实现并验证,浏览器即开即玩 | 验证过的核心逻辑移植成 Unity 脚本 |
| 谁维护 | Agent 全程开发 | 每个里程碑后移植一次 |
| 运行 | `cd web && npm install && npm run dev` | 本地 Unity 2022 LTS+ 打开 `unity/` |

## 法务红线(必读)

本项目**不使用**任何《元气骑士》系列的美术素材、角色形象、名称、剧情文本。
致敬的是"割草刷宝 ARPG"**品类通用机制**(机制不受版权保护),所有内容资产均为原创。
新增内容时必须遵守此红线,详见 [docs/04-ART-PIPELINE.md](docs/04-ART-PIPELINE.md) 第 1 节。

## 许可证

代码与原创资产:MIT(可改,见后续讨论)
