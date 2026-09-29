using System;
using System.Collections.Generic;

namespace StarfallKnights.Dungeon
{
    /// <summary>
    /// 房间布局模板镜像(对应 web/src/game/dungeon/RoomLayouts.ts + balance.json 的 layouts 段)。
    ///
    /// Unity 端目前还没有做房间生成(见 docs/06-STATUS「Unity 副线」),
    /// 但"抽模板"这条规则先镜像过来:以后 Unity 端做房间时直接复用同一套规则,免得两边各写一套。
    /// 数值一律走 <see cref="Parity"/>,由 ParityTests 与 balance.json 逐键比对——改一边忘了另一边会立刻红。
    /// </summary>
    public static class RoomLayouts
    {
        /// <summary>战斗房可选模板(权重见 Parity:layouts.combatWeights.*)</summary>
        public static readonly string[] Combat =
            { "scatter", "pillars", "grove", "lane", "narrow", "ring", "shore" };

        /// <summary>精英房偏好有地形的模板(不出散布)</summary>
        public static readonly string[] Elite = { "pillars", "narrow", "ring", "shore" };

        /// <summary>Boss 场:边角两点装饰,给 Boss 走位留白</summary>
        public static readonly string[] BossRoom = { "boss" };

        /// <summary>静谧房间(商店/宝藏/秘境)</summary>
        public static readonly string[] Calm = { "calm" };

        /// <summary>房间类型 → 模板清单(battle / elite / boss / calm)</summary>
        public static string[] Kind(string kind)
        {
            switch (kind)
            {
                case "elite": return Elite;
                case "boss": return BossRoom;
                case "calm": return Calm;
                default: return Combat;
            }
        }

        public static bool IsKnown(string id)
        {
            if (Array.IndexOf(Combat, id) >= 0) return true;
            return id == "boss" || id == "calm";
        }

        public static int Weight(string id)
        {
            float w;
            return Parity.TryGetValue("layouts.combatWeights." + id, out w) ? (int)w : 0;
        }

        /// <summary>与 web 的 pickLayout 同一套规则:战斗房按权重抽,其余从清单均抽。</summary>
        public static string Pick(Random rng, string kind)
        {
            if (kind == "battle")
            {
                int total = 0;
                foreach (var id in Combat) total += Weight(id);
                double roll = rng.NextDouble() * total;
                foreach (var id in Combat)
                {
                    roll -= Weight(id);
                    if (roll < 0) return id;
                }
                return Combat[Combat.Length - 1];
            }
            var list = Kind(kind);
            return list[rng.Next(list.Length)];
        }

        // ---- 摆放规则(web LAYOUT_RULES;审计函数在 web 侧)----
        public const float EntryClearXM = 4.6f;   // 进门 x < 4.6m 不放实心件
        public const float ExitClearXM = 4.6f;    // 出口净空留给传送门
        public const float MinGapM = 1.6f;        // 散件最小间距(> 岩 0.4 + 玩家 0.32 的直径)
        public const float MinCorridorM = 3.2f;   // 窄道通道净宽
        public const float ReservedClearM = 1.6f; // 摊位/石碑净空
        public const float WallSpacingM = 0.7f;   // 墙砖间距(< 1.44 才算砌死的墙)
        public const int MaxLooseSolids = 18;
        public const int MaxWallProps = 60;
        public const int MaxProps = 64;

        /// <summary>layouts 段的逐键数值镜像(键名 = balance.json 里的 JSON 路径)</summary>
        public static readonly Dictionary<string, float> Parity = new Dictionary<string, float>
        {
            { "layouts.entryClearXM", EntryClearXM },
            { "layouts.exitClearXM", ExitClearXM },
            { "layouts.minGapM", MinGapM },
            { "layouts.minCorridorM", MinCorridorM },
            { "layouts.reservedClearM", ReservedClearM },
            { "layouts.wallSpacingM", WallSpacingM },
            { "layouts.maxLooseSolids", MaxLooseSolids },
            { "layouts.maxWallProps", MaxWallProps },
            { "layouts.maxProps", MaxProps },
            { "layouts.combatWeights.scatter", 20f },
            { "layouts.combatWeights.pillars", 16f },
            { "layouts.combatWeights.grove", 14f },
            { "layouts.combatWeights.lane", 16f },
            { "layouts.combatWeights.narrow", 14f },
            { "layouts.combatWeights.ring", 12f },
            { "layouts.combatWeights.shore", 10f },
        };
    }
}
