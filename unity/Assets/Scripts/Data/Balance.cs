namespace StarfallKnights.Data
{
    /// <summary>
    /// 核心数值镜像(节选自 web/src/data/balance.json,双端修改需同步!)。
    /// 完整数据以 balance.json 为唯一权威;此处仅镜像核心逻辑所需常量。
    /// </summary>
    public static class Balance
    {
        // ---- 元素反应(reactions)----
        public const float MarkDurationS = 4f;   // 印记持续
        public const float ChainDecay = 0.8f;    // 连锁每层衰减 ×0.8
        public const int MaxChainDepth = 4;      // 连锁最大深度
        public const float SteamMult = 0.9f;     // 蒸汽范围倍率
        public const float OverloadMult = 1.6f;  // 超载单体倍率
        public const float BrittleVulnPct = 0.2f;// 脆蚀易伤 +20%
        public const float NumbStunS = 0.8f;     // 麻痹眩晕

        // ---- 玩家(player,狂澜剑士基准)----
        public const int PlayerHp = 100;
        public const int PlayerAtk = 12;
        public const float PlayerMoveSpeed = 4.6f; // m/s
        public const float PlayerCritRate = 0.05f;
        public const float PlayerCritDmg = 1.5f;
        public const float DashDurS = 0.22f;
        public const float DashDistM = 2.8f;
        public const float CdrCap = 0.4f; // 冷却缩减上限 40%

        // ---- 防御公式(formulas)----
        public const float DefK = 50f; // 减伤 = def / (def + K)

        // ---- 昼夜(night)----
        public const float CycleS = 360f;
        public const float DayS = 240f;
        public const float NightHpMult = 1.25f;
        public const float NightAtkMult = 1.15f;
        public const int NightLootMult = 2;
        public const int LanternCostCh1 = 120;
        public const int LanternCostCh2 = 156;

        // ---- 掉落(loot)----
        public const float DropEquip = 0.18f;
        public const float DropPotion = 0.06f;
        public const int PityLegendary = 200; // 保底
        public const int InvSize = 24;

        // ---- 章节 ----
        public const float Ch2StatMult = 1.35f;
        public const float Ch2LootMult = 1.3f;

        // ---- 深度成长(scaling)----
        public static float ScaleHp(float baseHp, int depth, bool night)
            => baseHp * (1f + 0.12f * depth) * (night ? NightHpMult : 1f);

        public static float ScaleAtk(float baseAtk, int depth, bool night)
            => baseAtk * (1f + 0.08f * depth) * (night ? NightAtkMult : 1f);
    }
}
