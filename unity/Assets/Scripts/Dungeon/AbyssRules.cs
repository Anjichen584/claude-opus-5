using System;
using System.Collections.Generic;
using StarfallKnights.Data;

namespace StarfallKnights.Dungeon
{
    /// <summary>
    /// 深渊难度层镜像(2026-09-29,10-FULL-PLAN 轮 23)。
    /// 与 web `web/src/game/dungeon/Abyss.ts` 是同一套规则;数值全部读 <see cref="Bestiary"/> 的生成常量
    /// (AbyssLevelsNAbc),**不在这里手抄** —— 手抄的难度系数漂了,玩家只会觉得"Unity 版手感怪"。
    ///
    /// 三条口径(与 web 一致):
    /// 1. 难度**只改乘区,不改内容**:三章的敌人/房间表原封不动;
    /// 2. 解锁**逐层**:II 要求 I 通关,III 要求 II —— 不能跳级(跳级 = 玩家撞 3× 血量的墙然后卸载);
    /// 3. 普通档(0)全中性:系统侧不需要 if (abyss > 0)。
    /// </summary>
    public static class AbyssRules
    {
        public const int Normal = 0;

        /// <summary>层数(与 balance.abyss.levels 同长)</summary>
        public const int LevelCount = 3;

        private static float At(int idx, string field)
        {
            // 用生成常量拼装:层号越界返回中性值,绝不抛异常(难度档来自存档,坏档不该让游戏进不去)
            if (idx < 1 || idx > LevelCount) return field == "eliteWaves" ? 0f : 1f;
            return field switch
            {
                "hpMult" => idx switch { 1 => Bestiary.AbyssLevels0HpMult, 2 => Bestiary.AbyssLevels1HpMult, _ => Bestiary.AbyssLevels2HpMult },
                "atkMult" => idx switch { 1 => Bestiary.AbyssLevels0AtkMult, 2 => Bestiary.AbyssLevels1AtkMult, _ => Bestiary.AbyssLevels2AtkMult },
                "lootMult" => idx switch { 1 => Bestiary.AbyssLevels0LootMult, 2 => Bestiary.AbyssLevels1LootMult, _ => Bestiary.AbyssLevels2LootMult },
                "dustMult" => idx switch { 1 => Bestiary.AbyssLevels0DustMult, 2 => Bestiary.AbyssLevels1DustMult, _ => Bestiary.AbyssLevels2DustMult },
                "eliteWaves" => idx switch { 1 => Bestiary.AbyssLevels0EliteWaves, 2 => Bestiary.AbyssLevels1EliteWaves, _ => Bestiary.AbyssLevels2EliteWaves },
                "unlockClears" => idx switch { 1 => Bestiary.AbyssLevels0UnlockClears, 2 => Bestiary.AbyssLevels1UnlockClears, _ => Bestiary.AbyssLevels2UnlockClears },
                _ => idx switch { 1 => Bestiary.AbyssLevels0UnlockAbyss, 2 => Bestiary.AbyssLevels1UnlockAbyss, _ => Bestiary.AbyssLevels2UnlockAbyss },
            };
        }

        public static float HpMult(int idx) => At(idx, "hpMult");
        public static float AtkMult(int idx) => At(idx, "atkMult");
        public static float LootMult(int idx) => At(idx, "lootMult");
        public static float DustMult(int idx) => At(idx, "dustMult");
        public static int EliteWaves(int idx) => (int)At(idx, "eliteWaves");
        public static float NightBonusMult => Bestiary.AbyssNightBonusMult;

        public static string LevelName(int idx) => idx switch
        {
            1 => "深渊 I",
            2 => "深渊 II",
            3 => "深渊 III",
            _ => "远征",
        };

        /// <summary>层表快照(下标 0 → 深渊 I);测试与 UI 用</summary>
        public static readonly (int Id, string Name, float Hp, float Atk, float Loot, float Dust, int EliteWaves)[] Levels =
        {
            (1, LevelName(1), HpMult(1), AtkMult(1), LootMult(1), DustMult(1), EliteWaves(1)),
            (2, LevelName(2), HpMult(2), AtkMult(2), LootMult(2), DustMult(2), EliteWaves(2)),
            (3, LevelName(3), HpMult(3), AtkMult(3), LootMult(3), DustMult(3), EliteWaves(3)),
        };

        /// <summary>解锁吗?逐层判定:III 只看 II 的通关数(II 的解锁已隐含 I)</summary>
        public static bool Unlocked(int idx, int clears, IReadOnlyList<int> abyssClears)
        {
            if (idx == Normal) return true;
            if (idx < 1 || idx > LevelCount) return false;
            if (clears < (int)At(idx, "unlockClears")) return false;
            int needPrev = (int)At(idx, "unlockAbyss");
            if (needPrev > 0)
            {
                int prev = abyssClears != null && idx - 2 < abyssClears.Count ? abyssClears[idx - 2] : 0;
                if (prev < needPrev) return false;
            }
            return true;
        }

        /// <summary>锁着的原因(UI 直接显示这句;null = 已解锁)</summary>
        public static string LockReason(int idx, int clears, IReadOnlyList<int> abyssClears)
        {
            if (idx == Normal) return null;
            if (idx < 1 || idx > LevelCount) return "没有这一层";
            int need = (int)At(idx, "unlockClears");
            if (clears < need) return $"普通局通关 {clears}/{need} 次";
            int needPrev = (int)At(idx, "unlockAbyss");
            if (needPrev > 0)
            {
                int prev = abyssClears != null && idx - 2 < abyssClears.Count ? abyssClears[idx - 2] : 0;
                if (prev < needPrev) return $"{LevelName(idx - 1)} 通关 {prev}/{needPrev} 次";
            }
            return null;
        }

        /// <summary>当前可玩的最高层(从高往低找第一个解锁的)</summary>
        public static int MaxPlayable(int clears, IReadOnlyList<int> abyssClears)
        {
            int best = Normal;
            for (int i = 1; i <= LevelCount; i++) if (Unlocked(i, clears, abyssClears)) best = i;
            return best;
        }

        /// <summary>通关后各层计数的**新**数组(不改入参;长度恒为层数 —— 形状稳定,免得存档随档位变来变去)</summary>
        public static int[] RecordClear(int idx, IReadOnlyList<int> abyssClears)
        {
            var outp = new int[LevelCount];
            for (int i = 0; i < LevelCount; i++) outp[i] = abyssClears != null && i < abyssClears.Count ? abyssClears[i] : 0;
            if (idx >= 1 && idx <= LevelCount) outp[idx - 1]++;
            return outp;
        }

        /// <summary>这一局是否刚解锁了新的一层(结算页提示用)</summary>
        public static int NewlyUnlocked(int clearsBefore, IReadOnlyList<int> before, int clearsAfter, IReadOnlyList<int> after)
        {
            for (int i = 1; i <= LevelCount; i++)
            {
                if (!Unlocked(i, clearsBefore, before) && Unlocked(i, clearsAfter, after)) return i;
            }
            return -1;
        }

        /// <summary>出怪乘区:三章 statMult 之后再过一层深渊乘区(与 web RunMods.enemy 同序)</summary>
        public static (float hp, float atk) Apply(int idx, float hp, float atk) =>
            (hp * HpMult(idx), atk * AtkMult(idx));
    }
}
