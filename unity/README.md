# Unity 副线工程(骨架)

> 状态: Phase 0 — 仅目录结构,无代码。移植计划见 docs/05-ROADMAP.md Phase 6。

## 用途

Web 主线(`web/`)验证过的**核心玩法逻辑**(伤害管线/掉落/技能/元素反应)
将移植为纯 C# 类放入 `Assets/Scripts/`,与引擎解耦,便于任何 Unity 项目复用。

## 约定

- Unity 版本: 2022.3 LTS+
- 数据文件与 Web 版**共享同一套 JSON**(从 `web/src/data/` 同步到 `Assets/Resources/Data/`)
- 模块映射表见 docs/02-ARCHITECTURE.md §7
- 纯逻辑类禁止依赖 UnityEngine(除数学类型),保证可单测

## 目录

```
Assets/Scripts/
├── Combat/   # 伤害管线、元素反应(对应 web/src/game/combat)
├── Loot/     # 掉落与词条(对应 web/src/game/loot)
├── Skills/   # 技能与符文(对应 web/src/game/skills)
└── Data/     # JSON 加载与 DataRegistry
```
