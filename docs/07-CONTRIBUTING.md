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

### 4.0 改 balance 里的敌人/职业数值后,必须重新生成 C# 数据层

```bash
python3 tools/gen_bestiary.py     # balance.json → unity/Assets/Scripts/Data/Bestiary.cs(含 BestiaryKlass)
bash unity/Tests/run.sh           # parity 会逐键双向比对,漏生成/改一边立刻红
```

生成物带 `⚠ 请勿手改` 头注释;**不要手动编辑 `Bestiary.cs` / `BestiaryKlass`** ——
手抄 300+ 个数值叶子必错,这就是当初引入 codegen 的原因。新增职业普攻字段时:
先在 `balance.classes.<k>` 补齐字段(显式 0 优于缺省,生成器与 parity 都更简单)→ 重新生成 → 跑双端测试。

### 4.1 随机数必须播种(踩过的坑)

逻辑层里**任何** `new Random()` / `rand()` 都必须给固定种子,否则输出不可复现,测试会偶发变红
(2026-09-29 实测:「箭雨命中前方落点区域的敌人簇」断言时红时绿,根因是 `SkillRuntime.Rng` 用了未播种的 `new Random()`;
现已固定为 `SkillRuntime.ScatterSeed`,并补了「同序列两遍 → 逐项一致」的守卫测试)。
- Unity 逻辑层:`SkillRuntime.Rng`(散点)、`BossAI._rng`(0x5EED1)、`DamagePipeline.CritRng` 都是固定种子,照抄这个风格。
- web 侧 `Math.random()` 目前只用于**渲染抖动**(GameScene 里 90+ 处 jitter)与开启时的随机赠礼,不参与断言;
  若要在 web 写逻辑散点,请用可播种 RNG(`engine` 里的 rng),别用 `Math.random()`。

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

### 跑 C# 逻辑层测试(Unity 副线)

逻辑层是**零 UnityEngine 依赖**的纯 C#(`unity/Assets/Scripts` 下除 `Unity/` 以外的目录),
不需要装 Unity 编辑器就能跑:

```bash
bash unity/Tests/run.sh          # 356 项断言,约 3 秒(首次会先自动装 SDK,约 15 秒)
```

沙箱/CI 基础镜像里**没有 .NET SDK**,`run.sh` 会**自动装**(不需要 sudo),位置是
`$HOME/.local/dotnet` —— **这个位置是故意选的**:工作区快照按目录名排除 `.local`/`.cache` 等,
SDK(约 500 MB、4700 个文件)放在这里既不进快照、也不占工作区预算。

```bash
# 想手动装/换版本:
DOTNET_DIR=~/.local/dotnet SDK_CHANNEL=8.0 bash unity/Tests/run.sh
```

> **别装在 `~/.dotnet` 或仓库里**:2026-09-29 那次工作区 565 MB 超限(限 128 MB / 10000 文件),
> 4286 个文件没被快照保住,其中 500 MB 就是这个坑 —— SDK 装在了 `~/.dotnet`(不在快照排除名单里)。
> 系统目录(`/usr/share/dotnet`)在无 sudo 环境里装不了,也别试。
>
> 别用 apt 里的 `mono-*`:最高只支持 C# 7.2,而本工程用了 C# 9 的目标类型 `new()`;apt 也没有 `dotnet-sdk-8.0` 包。

**改数值的规矩**:web 的 `data/*.json` 是唯一权威。

- 敌人/章节数值(图鉴)是**生成**的:`python3 tools/gen_bestiary.py` → `unity/Assets/Scripts/Data/Bestiary.cs`,
  改完 balance.json 只要重跑脚本;手改生成物会被 parity 测试抓出来。
- 技能/符文数值目前是手写镜像:`Skills/*.cs` 的 const + 同文件里的 `Parity` 字典一起改,
  两边不一致会报"数值不一致 / 多出 / 缺失"。
- 别直接改 C# 而不动 JSON:测试会红(CI 也跑同一套)。

**加一只怪要动几处**:① `balance.json enemies` 加行 ② `EnemyKind` 加枚举 + `EnemyKinds.ChapterOf` 认章节
③ `Bestiary`(跑生成脚本) ④ `CreatureAI` 或 `BossAI` 加行为 ⑤ `GameBootstrap.ColorOf` 加个占位色
⑥ `unity/Tests/Program.cs` 补行为断言。

### 已知的三次"环境小坑"(别浪费时间排查)

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
