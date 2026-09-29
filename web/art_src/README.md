# art_src(AI 原画源图)

**本目录的 PNG 不进仓库**(见根 `.gitignore`),原因:源图 ~80 MB,而处理后的成品只有 ~0.5 MB,
128 MB 的沙箱快照装不下,曾导致大文件被静默丢弃(2026-09-29 事故)。

## 为什么删了也不慌

1. **成品在仓库里**:所有精灵都在 `web/public/sprites/`,是游戏实际使用的资源;
2. **源图可再生**:成品精灵本身就是最好的图生图参考 —— 把 `public/sprites/xxx.png`
   最近邻放大 8~16 倍当 reference,配一段描述角色的 prompt 重新生成即可(2026-09-29 补
   12 只怪第二帧就是这么做的),生成提示词见 `docs/08-ART-PROMPTS.md`;
3. **管线支持缺图**:`tools/process_art.py` 遇到不存在的源图直接跳过并打印提示,
   所以"源图不全"不会中断流程。

## 要改某张图时的标准流程

1. 用 `public/sprites/<name>.png` 放大版当参考图,生成新原画 → 存到本目录;
2. `python3 tools/process_art.py` 重新处理(双帧对会自动走主体对齐);
3. `npm test` —— `sprites.test.ts` 会守卫"登记表 ↔ 成品文件"是否一致;
4. 提交**只提成品**(`public/sprites/`),源图留在本地。
