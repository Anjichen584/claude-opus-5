using System.Collections.Generic;
using UnityEngine;
using StarfallKnights.Meta;

namespace StarfallKnights.UnityLayer
{
    /// <summary>
    /// U2 面板壳(轮 42):图鉴 / 成就 / 排行榜,IMGUI 版。
    ///
    /// 铁律:这里**只画字符串、收点击**——所有分组/排序/进度/文案都来自
    /// <see cref="PanelModels"/>(纯函数,Tests 里 TestPanelModels 全覆盖)。
    /// 壳里出现一句业务判断,就该搬去 PanelModels 挂测试。
    ///
    /// 用法:与 GameBootstrap 挂同一物体;F1 开合,页签切换。
    /// 数据源:宿主(GameBootstrap)持有的 Codex / Boards4 / unlocked;
    /// 本组件只读,不落盘(存档时机归宿主管)。
    /// </summary>
    public sealed class MetaPanelsGUI : MonoBehaviour
    {
        public KeyCode ToggleKey = KeyCode.F1;

        private bool _open;
        private int _tab;                        // 0 图鉴 / 1 成就 / 2 排行榜
        private int _achvCat;                    // 成就分类页签
        private int _board;                      // 排行榜页签
        private Vector2 _scroll;
        private static readonly string[] Tabs = { "📖 图鉴", "🏆 成就", "🥇 排行榜" };
        private static readonly string[] Cats = { "进度", "战斗", "极速", "图鉴", "局外" };

        private GameBootstrap Host => GameBootstrap.I;

        private void Update()
        {
            if (Input.GetKeyDown(ToggleKey)) _open = !_open;
        }

        private void OnGUI()
        {
            if (!_open || Host == null) return;
            const int W = 560, H = 420;
            var rect = new Rect((Screen.width - W) / 2f, (Screen.height - H) / 2f, W, H);
            GUILayout.BeginArea(rect, GUI.skin.window);

            _tab = GUILayout.Toolbar(_tab, Tabs);
            GUILayout.Space(4);
            _scroll = GUILayout.BeginScrollView(_scroll);
            switch (_tab)
            {
                case 0: DrawCodex(); break;
                case 1: DrawAchievements(); break;
                default: DrawBoards(); break;
            }
            GUILayout.EndScrollView();
            GUILayout.Label($"[{ToggleKey}] 关闭", GUI.skin.box);
            GUILayout.EndArea();
        }

        private void DrawCodex()
        {
            GUILayout.Label(PanelModels.CodexHeader(Host.Codex));
            GUILayout.Space(4);
            foreach (var cell in PanelModels.EnemyCells(Host.Codex))
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label(cell.Label, GUILayout.Width(220));
                if (cell.Found)
                {
                    foreach (var line in PanelModels.EnemyDetail(Host.Codex, cell.Kind))
                        GUILayout.Label(line, GUILayout.Width(160));
                }
                GUILayout.EndHorizontal();
            }
            GUILayout.Space(8);
            GUILayout.Label("—— 符文 ——");
            foreach (var row in PanelModels.RuneRows(Host.Codex)) GUILayout.Label(row);
        }

        private void DrawAchievements()
        {
            var state = BuildState();
            GUILayout.Label(PanelModels.AchvHeader(
                Achievements.UnlockedCount(Host.AchvUnlocked), Achievements.Total));
            GUILayout.Space(4);
            _achvCat = GUILayout.Toolbar(_achvCat, Cats);
            var cat = (Achievements.Cat)_achvCat;
            foreach (var row in PanelModels.AchvRows(cat, state, Host.AchvUnlocked))
            {
                GUILayout.BeginHorizontal(GUI.skin.box);
                GUILayout.Label(row.Icon, GUILayout.Width(28));
                GUILayout.Label(row.Done ? $"<b>{row.Name}</b>" : row.Name, GUILayout.Width(150));
                GUILayout.Label(row.Desc, GUILayout.Width(240));
                GUILayout.Label(row.ProgressText);
                GUILayout.EndHorizontal();
            }
        }

        private void DrawBoards()
        {
            GUILayout.Label(PanelModels.BoardSubtitle(Host.Boards));
            GUILayout.Space(4);
            var labels = new string[Leaderboard.Boards.Length];
            for (int i = 0; i < labels.Length; i++) labels[i] = Leaderboard.Label(Leaderboard.Boards[i]);
            _board = GUILayout.Toolbar(_board, labels);
            var b = Leaderboard.Boards[_board];
            GUILayout.Label(Leaderboard.Hint(b));
            var lines = PanelModels.BoardLines(Host.Boards, b, Host.KlassNames);
            if (lines.Count == 0) GUILayout.Label(PanelModels.BoardEmpty);
            foreach (var line in lines) GUILayout.Label(line);
        }

        /// <summary>聚合判定快照(图鉴/榜数从宿主实例现读;秘境/铸造等埋点宿主接好后自然生效)。</summary>
        private Achievements.AchvState BuildState()
        {
            var s = Achievements.AchvState.From(Host.Meta);
            s.CodexEnemies = Host.Codex.EnemyFound;
            s.CodexRunes = Host.Codex.RuneFound;
            s.BoardsFilled = Host.Boards.Filled();
            return s;
        }
    }
}
