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

        // ---- 玩家基准数值(player 段)**已移出本文件** ----
        // 以前这里是手抄的 PlayerHp/PlayerAtk/PlayerMoveSpeed/DashDurS/... —— 手抄必错,而且真漂了
        // (hp 100/atk 12/速度 4.6 vs balance.json 的 120/14/4.2,parity 当时没覆盖 player 段)。
        // 现在全部由 tools/gen_bestiary.py 生成到 BestiaryPlayer(逐键 parity 比对),本文件只放
        // 那些**不属于 balance.json 的**东西:公式常量、昼夜周期、坐标换算等。
        public const float CdrCap = 0.4f; // 冷却缩减上限 40%

        // ---- 体型(props 段由生成器搬;岩石体型是房间摆放规则用的推导常量)----
        public const float RockBodyRadius = 0.4f;

        // ---- 坐标(镜像 web/src/game/constants.ts M)----
        /// <summary>1 米 = 48 像素(web 端 M);web 里以像素写的常量在 C# 里统一换算成米。</summary>
        public const float PxPerM = 48f;

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
