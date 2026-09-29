using System;
using StarfallKnights.Data;

namespace StarfallKnights.Dungeon
{
    /// <summary>
    /// 无尽模式镜像(2026-09-29,10-FULL-PLAN 轮 24)。
    /// 与 web `web/src/game/dungeon/Endless.ts` 是同一套规则;数值全部读 <see cref="Bestiary"/> 的生成常量
    /// (Endless…)—— 连"闸门的上限"都不手抄:上限漂了,两端"溢出后顶到多少"就会不一致,而这是本轮的验收门。
    ///
    /// 两条口径(与 web 一致):
    /// 1. **没有通关,只有撑到第几层**:三章跑完接无限循环章,章节按 1→2→3→1 循环(复用内容,不新增第四章);
    /// 2. **数值必须永远有限**:先把乘区 clamp 到 MaxMult,再把最终数值 clamp 到 MaxHp/MaxAtk 并保证是有限整数。
    ///    闸门集中在这里,而不是散在出怪代码里 —— 只要散开,总有一条出怪路径会绕过去。
    /// </summary>
    public static class EndlessRules
    {
        /// <summary>章节循环:1 → 2 → 3 → 1 …(循环 0 是第一章,循环 3 又回到第一章)</summary>
        public static readonly int[] ChapterCycle = { 1, 2, 3 };

        /// <summary>第 loop 循环跑哪一章。NaN 在 C# 里进不来,但要挡住负数与极端值(坏档不该让游戏进不去)。</summary>
        public static int ChapterOfLoop(int loop)
        {
            int len = ChapterCycle.Length;
            int n = loop % len;
            if (n < 0) n += len;
            return ChapterCycle[n];
        }

        /// <summary>乘区(hp/atk/loot/dust);与 web `LoopMults` 同形。</summary>
        public readonly struct Mults
        {
            public readonly float Hp, Atk, Loot, Dust;
            public Mults(float hp, float atk, float loot, float dust)
            {
                Hp = hp; Atk = atk; Loot = loot; Dust = dust;
            }
            public override string ToString() => $"hp×{Hp:0.###} atk×{Atk:0.###} loot×{Loot:0.###} dust×{Dust:0.###}";
        }

        /// <summary>
        /// 第 loop 循环的乘区(loop 0 = 第一遍,全 1)。几何增长 + 上限:
        /// 浮点 pow 在极端输入下会给出 Infinity,所以**先算再夹**,非有限值直接按上限处理 ——
        /// 宁可难到极致,也不能让 NaN 顺着乘法传进血量。
        /// </summary>
        public static Mults LoopMultsOf(int loop)
        {
            int n = loop < 0 ? 0 : loop;
            float cap = Bestiary.EndlessMaxMult;
            return new Mults(Grow(Bestiary.EndlessLoopHp, n, cap), Grow(Bestiary.EndlessLoopAtk, n, cap),
                             Grow(Bestiary.EndlessLoopLoot, n, cap), Grow(Bestiary.EndlessLoopDust, n, cap));
        }

        private static float Grow(float basev, int n, float cap)
        {
            double v = Math.Pow(basev, n);
            if (double.IsNaN(v) || double.IsInfinity(v)) return cap;
            return v >= cap ? cap : (float)v;
        }

        /// <summary>
        /// 最终数值闸门:夹到上限并保证是**有限整数**。出怪血量/攻击、星尘结算都走这里 ——
        /// 溢出时宁可"顶到上限"也不能出现 Infinity(那会让 UI 显示成 ∞、让伤害公式算出 NaN)。
        /// </summary>
        public static float SafeStat(float value, float max)
        {
            if (float.IsNaN(value) || float.IsInfinity(value)) return Math.Max(1f, MathF.Round(max));
            float v = MathF.Round(value);
            if (v < 1f) v = 1f;
            float hi = MathF.Round(max);
            return v > hi ? hi : v;
        }

        /// <summary>血量闸门(用数据表上限)</summary>
        public static float SafeHp(float v) => SafeStat(v, Bestiary.EndlessMaxHp);

        /// <summary>攻击闸门(用数据表上限)</summary>
        public static float SafeAtk(float v) => SafeStat(v, Bestiary.EndlessMaxAtk);

        /// <summary>通用乘区闸门(掉落/星尘这类"倍率"不该被夹成整数,单独一条)</summary>
        public static float SafeMult(float v)
        {
            if (float.IsNaN(v) || float.IsInfinity(v)) return Bestiary.EndlessMaxMult;
            if (v < 0f) return 0f;
            return v > Bestiary.EndlessMaxMult ? Bestiary.EndlessMaxMult : v;
        }

        /// <summary>把无尽乘区叠到已算好的血量/攻击上(镜像 web RunMods.enemy 的最后一步)</summary>
        public static (float hp, float atk) Apply(int loop, float hp, float atk)
        {
            Mults m = LoopMultsOf(loop);
            return (SafeHp(hp * m.Hp), SafeAtk(atk * m.Atk));
        }

        /// <summary>第 loop 循环的展示名(UI/结算用)</summary>
        public static string LoopLabel(int loop) => $"循环 {loop + 1} · 第{ChapterOfLoop(loop)}章";

        /// <summary>一局无尽里"层"的显示:第 N 层(下限 1)</summary>
        public static string FloorLabel(int floor) => $"第 {(floor < 1 ? 1 : floor)} 层";

        /// <summary>解锁吗(任意难度通关数门槛;数据表给)</summary>
        public static bool Unlocked(int clears) => (clears < 0 ? 0 : clears) >= Bestiary.EndlessUnlockClears;

        public static string LockReason(int clears)
        {
            int c = clears < 0 ? 0 : clears;
            return $"任意难度通关 {c}/{(int)Bestiary.EndlessUnlockClears} 次";
        }

        /// <summary>结算:这一局的层数/循环数是否刷新纪录(返回新的最好成绩,不改入参)</summary>
        public static (int bestFloor, int bestLoop) RecordRun(int floor, int loop, int bestFloor, int bestLoop)
        {
            int f = floor < 0 ? 0 : floor;
            int l = loop < 0 ? 0 : loop;
            return (f > bestFloor ? f : bestFloor, l > bestLoop ? l : bestLoop);
        }

        /// <summary>这次是不是刷新了纪录(结算页提示用)</summary>
        public static bool IsNewRecord(int floor, int bestFloor) => floor > bestFloor;
    }
}
