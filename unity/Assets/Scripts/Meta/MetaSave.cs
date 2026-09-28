using System;

namespace StarfallKnights.Meta
{
    /// <summary>
    /// 局外存档(镜像 web meta/Save.ts):星尘/祭坛/保底/图纸/统计。
    /// 纯 POCO + JsonUtility 兼容字段;宿主用 PlayerPrefs 或文件持久化:
    ///   保存 PlayerPrefs.SetString("sk_save", JsonUtility.ToJson(meta));
    ///   读取 JsonUtility.FromJson&lt;MetaSave&gt;(PlayerPrefs.GetString("sk_save", "{}"))。
    /// </summary>
    [Serializable]
    public sealed class MetaSave
    {
        public int v = 1;
        public int stardust;
        public int altarHp;
        public int altarAtk;
        public int altarLuck;
        public int pity;
        public int blueprintShards;
        public bool craftQueued;
        public int runs;
        public int clears;
        public int totalKills;
        public float bestTimeS;

        /// <summary>祭坛升级价:50×1.6^lvl(镜像 web altarCost)。</summary>
        public static int AltarCost(int lvl) => (int)Math.Round(50 * Math.Pow(1.6, lvl));

        public bool TryUpgrade(ref int branchLvl, int maxLvl = 10)
        {
            if (branchLvl >= maxLvl) return false;
            int cost = AltarCost(branchLvl);
            if (stardust < cost) return false;
            stardust -= cost;
            branchLvl++;
            return true;
        }
    }
}
