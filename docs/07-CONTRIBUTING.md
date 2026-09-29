# 07 — 开发指南与协作规范

`最后更新: 2026-09-28`

---

## 1. 环境与运行

```bash
# Web 主线(Node 18+)
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物在 web/dist
npm test           # Vitest 单测(Phase 1 起)

# Unity 副线
# Unity 2022.3 LTS+ 打开 unity/ 目录(Phase 6 前仅骨架)
```

## 2. 分支与提交规范

- 主分支 `main` 保持可运行;大功能可开 `feat/xxx` 分支。
- Commit 前缀: `feat:` 新功能 / `fix:` 修复 / `docs:` 文档 / `art:` 美术资源 /
  `data:` 数值内容 / `refactor:` / `perf:` / `test:` / `chore:`
- **每个 feat/data 提交必须同步更新 docs/06-STATUS.md**(打勾或登记进行中)。

## 3. 代码规范(web)

- TypeScript strict,禁 `any`(确需则 `// why-any:` 注释说明)。
- 分层铁律: engine 不 import game;game 不 import 具体数据文件(走 DataRegistry)。
- 数值禁止硬编码 → `data/balance.json`;颜色/稀有度等常量唯一出处 `src/game/constants.ts`。
- 系统(System)之间禁止直接调用,通过事件通信(见 02-ARCHITECTURE §3)。
- 公式类代码(伤害/掉落/经验)必须配 Vitest 单测锁行为。

## 4. 如何添加内容(数据驱动,常见任务菜谱)

**加一件装备**: `web/src/data/items/` 新建 JSON(照抄同类文件改字段)→
若带新词条,先在 `affixes/pool.json` 注册 → 挂进对应怪物/宝箱的掉落表 →
在 04 文档资源清单登记图标需求 → 更新 06-STATUS。

**加一个怪**: `data/enemies/` 建 JSON(数值抄 03-NUMBERS §7 的模板行)→
AI 选现有行为树模板或在 `game/ai/behaviors/` 新写节点 →
美术按 04 §3 尺寸规格出 spritesheet → 加入房间模板的刷怪表。

**加一个技能/符文**: `data/skills|runes/` 建 JSON → phases 用现有 type
(meleeSweep/dash/projectile/summon…)组合;需要新 phase type 才写代码
(`game/skills/phases/` 加执行器 + 单测)。

**改平衡**: 只动 `balance.json` + 03-NUMBERS.md,同 commit。

## 5. 美术资源提交

按 04-ART-PIPELINE §4 流程走;源文件/prompt 记录放 `webassets-src/`(不打包),
成品图集进 `web/public/assets/sprites/`。提交前缀 `art:`,并勾 04 §6 清单。

## 6. 给"下一个接手的人"的话

1. 先读 06-STATUS.md,那里永远是最新现状;文档与代码冲突时**以文档为准**。
2. 不要绕过伤害管线造伤害、不要在 System 里互相调用、不要硬编码数值——
   这三条是本工程最容易腐化的地方。
3. 保持垂直切片纪律: GDD §12 "不做的事"没有讨论前不要做。
4. 每个 Phase 完成后除了推代码,把 05-ROADMAP 的里程碑表也勾掉。

---

## 收尾纪律(沙箱环境必读)

构建沙箱的工作区快照上限约 **128 MB**,超过会**静默丢文件**(本会话丢过 `.git`、`node_modules`
和 80 MB 美术源图共三次)。因此每次写完一小块就执行:

```bash
tools/sync.sh "提交信息"     # 提交 → 推送 → 清沙箱,一条命令搞定
```

脚本做三件事:

1. `git add -A` + 提交(无改动则跳过);
2. 推送 `origin/main`(部署密钥走 `~/.ssh/github_deploy`,由 `~/.ssh/config` 指给 github.com);
3. 清理临时文件(外层目录的预览 PNG、`web/dist`、`/tmp/refs`),并打印工作区体积,
   超过 60 MB 告警。

### 铁律

- **大文件不进仓库**:AI 源图放 `web/art_src/`(已 gitignore)、临时拼图写到仓库外且用完即删;
- **只留一份仓库副本**:曾同时留 `repo_tmp` + `repo_sync` 两份(~112 MB)直接顶爆快照;
- **提交前先看体积**:`du -sh --exclude=node_modules .`;
- **每次改动都要推送**:环境随时可能被重建,只有 GitHub 上的东西是安全的。

### 已知的两次"配置丢失"(别浪费时间排查)

1. **`.git/config` 会被快照剥离**(它和 `.git/credentials`、`.netrc` 同属敏感路径)。
   现象:`git log` 正常,但 `git remote -v` 为空、`git push` 报
   `fatal: 'origin' does not appear to be a git repository` —— **不是密钥问题**。
   `tools/sync.sh` 已内置自愈(每次检查并重建 origin + 分支跟踪),手动修复:
   ```bash
   git remote add origin git@github.com:Anjichen584/claude-opus-5.git
   git config branch.main.remote origin && git config branch.main.merge refs/heads/main
   ```
2. **`/tmp` 会被清空**。部署密钥曾放 `/tmp/gh/`,每次重建都要重放;现已改到 `~/.ssh/github_deploy`。
3. **文件权限位不随快照保留**。表现为两个迷惑症状:① `ssh` 报 `Permission denied (publickey)`
   但其实密钥还在(只是变回了 644,ssh 会拒绝过宽的私钥权限);② `tools/sync.sh: Permission denied`
   其实是丢了 `+x`。`tools/sync.sh` 已在开头自愈这两处权限,手动修复:
   ```bash
   chmod 600 ~/.ssh/github_deploy && chmod +x tools/sync.sh
   ```
   稳妥起见也可以用 `bash tools/sync.sh "..."` 调用,不依赖执行位。

### 环境被重建后的恢复步骤

```bash
# 1. 放回部署密钥(内容见项目文档/交接说明,切勿提交进仓库)
install -m 600 /path/to/deploy_key ~/.ssh/github_deploy
# 2. 浅克隆:历史留在远端,本地只留一份,省体积
git clone --depth 1 git@github.com:Anjichen584/claude-opus-5.git repo && cd repo/web
# 3. 装依赖(node_modules 不进快照,每次都要装)
npm install && npm test
```
