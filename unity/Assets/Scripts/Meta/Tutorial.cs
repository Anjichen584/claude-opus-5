using System;
using System.Collections.Generic;

namespace StarfallKnights.Meta
{
    /// <summary>
    /// 新手引导(镜像 web `meta/Tutorial.ts` + `balance.tutorial`)。
    ///
    /// 这里只镜像**结构**(步骤顺序 / 步数 / 跳过键 / 存档槽数)与**推进规则**;
    /// 文案属于展示层,由宿主从 balance.json 读(Unity 侧的统一入口是 Data/Balance.cs)。
    /// 步骤顺序与文案长度由 `unity/Tests/ParityTests.cs` 的 CheckTutorial 逐项比对 balance.json —— 
    /// 少一步/换顺序会立刻见红,避免"web 教 5 步、Unity 只教 4 步"。
    /// </summary>
    public static class Tutorial
    {
        /// <summary>步骤 id(顺序即引导顺序;balance.tutorial.steps[].id 的镜像)</summary>
        public static readonly string[] StepIds = { "move", "dash", "skill", "bag", "altar" };

        public static int StepCount => StepIds.Length;

        /// <summary>走两步的判定距离(米,镜像 balance.tutorial.moveM)</summary>
        public const float MoveM = 3f;

        /// <summary>跳过键(固定键位,不可改绑:玩家想甩掉引导就该随时能甩)</summary>
        public const string SkipKey = "KeyH";

        public static bool IsValidStep(string id) => Array.IndexOf(StepIds, id) >= 0;

        /// <summary>把下标夹回合法区间(坏档/旧档不会让引导崩)</summary>
        public static int ClampStep(int step) => step < 0 ? 0 : step > StepCount ? StepCount : step;

        /// <summary>
        /// 推进一步。**只有当前步骤对应的动作才算数** —— 顺序可预测,
        /// "先翻滚再走动"不会把引导跳乱(镜像 web Tutorial.notify)。
        /// </summary>
        public static bool Notify(ref int step, ref bool done, string action)
        {
            if (done) return false;
            step = ClampStep(step);
            if (step >= StepCount) { done = true; return false; }
            if (StepIds[step] != action) return false;
            step++;
            if (step >= StepCount) done = true;
            return true;
        }

        /// <summary>跳过整段引导(玩家明确不要,就永远别再来烦他)。</summary>
        public static void Skip(ref int step, ref bool done)
        {
            step = StepCount;
            done = true;
        }

        /// <summary>重看引导。</summary>
        public static void Restart(ref int step, ref bool done)
        {
            step = 0;
            done = false;
        }
    }

    /// <summary>存档槽(镜像 web `MetaStore` 的 3 槽设计;槽 0 = 历史单档键,老玩家零迁移)。</summary>
    public static class SaveSlots
    {
        /// <summary>槽数量(镜像 balance.tutorial.saveSlots)</summary>
        public const int Count = 3;

        /// <summary>槽 i 的持久化键(PlayerPrefs / 文件名皆可;0 号槽沿用历史键)。</summary>
        public static string KeyOf(int i, string baseKey = "sk_save")
            => i <= 0 ? baseKey : $"{baseKey}_slot{i}";

        public static bool IsValid(int i) => i >= 0 && i < Count;

        /// <summary>全部槽键(宿主一次读出概览用)。</summary>
        public static IEnumerable<string> AllKeys(string baseKey = "sk_save")
        {
            for (int i = 0; i < Count; i++) yield return KeyOf(i, baseKey);
        }
    }
}
