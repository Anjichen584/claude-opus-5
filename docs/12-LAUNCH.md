# 12 — 上线清单(轮 49)

`最后更新: 2026-09-30` 发布日照单执行,不靠记性。

## 发布前(机器已备好,人工过一遍)
- [ ] `bash tools/package_itch.sh` 产包并本地开一局(index.html 双击即玩)
- [ ] 线上 Pages 版最新 commit 已部署且可通关第一章
- [ ] 三档基线全绿:web 测试 / C# 断言 / CI
- [ ] docs/11 的 AI 声明已贴进 itch 商店页"AI generation disclosure"
- [ ] 存档码导出/导入在两台设备间验证一次

## 发布操作(需要账号,人工)
1. `git tag v1.0.0 && git push origin v1.0.0` → Release 自动出双包
2. itch.io:新建项目 → 上传 itch.zip → 勾选 "This file will be played in the browser"
   → Viewport 960×540 · 勾 Mobile friendly · 定价 Free/PWYW
3. 商店页素材:截图 ≥5 + 封面(轮 45 产出目录 release/store/)

## 反馈渠道
- **Bug/建议**:GitHub Issues(仓库公开后);itch 评论区
- **崩溃上报**:无后端 —— 游戏内设置页"导出存档码"即最小复现载体,
  Issue 模板请玩家附:存档码 + 浏览器/设备 + 复现步骤

## FAQ 草案
- 存档在哪?→ 浏览器 localStorage,清缓存会丢;跨设备用"导出存档码"
- 手机能玩吗?→ 能,竖屏会自动转横屏;iOS 加到主屏幕体验最佳
- 支持手柄吗?→ 支持(战斗直控 + 菜单虚拟光标)
- 换语言?→ 设置 → 🌐 语言(外壳已双语,战斗内文案逐步迁移中)

## 已知问题(发布说明如实写)
- EN 本地化覆盖外壳链路,战斗内 Toast 仍为中文(棘轮基线 1253,逐轮消化)
- 图鉴怪物 29/30(差 1 随后续内容补)
