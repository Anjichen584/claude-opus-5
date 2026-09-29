using System;
using System.Collections.Generic;
using StarfallKnights.Data;

namespace StarfallKnights.Loot
{
    /// <summary>
    /// 装备规则镜像(2026-09-29,M2 内容包 轮 19–21):橙装特效 9 个 / 消耗品 4 种 / 蓝图 6 张。
    ///
    /// 与 web 的对应关系(改任何一边都必须同时改另一边,否则 ParityTests 立刻红):
    /// - web/src/game/loot/Specials.ts      ↔ 本文件 Specials 区
    /// - web/src/game/loot/Consumables.ts   ↔ 本文件 Consumables 区
    /// - web/src/game/loot/Blueprint.ts     ↔ 本文件 Blueprints 区
    /// - 数值**不在**这里手抄:全部来自 Data/Bestiary.cs 的生成常量(SpecialXxx/ConsumableXxx/BlueprintXxx)。
    ///
    /// 这份镜像存在的意义:Unity 侧的掉落/装备系统要与 web 表现一致 —— 尤其"边界"
    /// (护盾不叠加、净化清不完、时缓对 Boss 打折、重铸至少留一条锚)这类容易在移植时被抹平的口径。
    /// </summary>
    public static class LootRules
    {
        public const float Tol = 1e-4f;

        // ---------------- 橙装特效(9 个,每部位 ≥1) ----------------

        /// <summary>特效 id → (部位, 物品名)。物品名是**玩家看到的装备名**,不是特效名。</summary>
        public static readonly (string Id, string Slot, string ItemName)[] Specials =
        {
            ("tempest", "weapon", "怒涛之刃"),
            ("frostfang", "weapon", "霜咬"),
            ("windhood", "helmet", "猎风兜帽"),
            ("starhelm", "helmet", "星陨兜帽"),
            ("stoneheart", "chest", "磐石胸甲"),
            ("thornmail", "chest", "棘刺胸甲"),
            ("emberstride", "boots", "焰行者之靴"),
            ("echo_ring", "ring", "回响之戒"),
            ("soulfeast", "amulet", "噬魂坠"),
        };

        public static readonly string[] AllSlots = { "weapon", "helmet", "chest", "boots", "ring", "amulet" };

        /// <summary>该部位带哪些特效(web: specialsForSlot)</summary>
        public static List<string> SpecialsForSlot(string slot)
        {
            var outp = new List<string>();
            foreach (var s in Specials) if (s.Slot == slot) outp.Add(s.Id);
            return outp;
        }

        /// <summary>没有任何特效的部位(应为空 —— 空部位 = 那个部位永远不出橙装特效)</summary>
        public static List<string> SlotsWithoutSpecial()
        {
            var outp = new List<string>();
            foreach (var slot in AllSlots) if (SpecialsForSlot(slot).Count == 0) outp.Add(slot);
            return outp;
        }

        /// <summary>装备了哪些特效时,第 hitCount 次命中的伤害倍率(web: hitDamageMult,每 5 击 ×2)</summary>
        public static float HitDamageMult(IReadOnlyCollection<string> ids, int hitCount)
        {
            if (hitCount <= 0 || ids == null) return 1f;      // 没有计数信息 → 不触发(不猜)
            if (!Contains(ids, "echo_ring")) return 1f;
            int every = (int)Bestiary.SpecialEchoEvery;
            return hitCount % every == 0 ? Bestiary.SpecialEchoMult : 1f;
        }

        /// <summary>霜咬:只在**当前没有元素**时补冰(不抢玩家已经在铺的元素链)</summary>
        public static (string Element, float Marks) StrikeElement(IReadOnlyCollection<string> ids, string current)
        {
            if (current != null) return (current, 0f);
            if (ids != null && Contains(ids, "frostfang"))
                return (FrostfangElement, Bestiary.SpecialFrostfangMarks);
            return (null, 0f);
        }

        /// <summary>噬魂坠:击杀回复量(没有这件装备回 0,不是 NaN)</summary>
        public static float KillHeal(IReadOnlyCollection<string> ids) =>
            ids != null && Contains(ids, "soulfeast") ? Bestiary.SpecialSoulfeastHeal : 0f;

        /// <summary>怒涛之刃:终结段的范围倍率(前两段不变)</summary>
        public static float ComboRangeMult(IReadOnlyCollection<string> ids, bool finisher) =>
            finisher && ids != null && Contains(ids, "tempest") ? Bestiary.SpecialTempestRangeMult : 1f;

        /// <summary>磐石胸甲:低血受伤倍率(乘区,不是免疫)</summary>
        public static float DamageTakenMult(IReadOnlyCollection<string> ids, float hpRatio)
        {
            if (ids == null || !Contains(ids, "stoneheart")) return 1f;
            return hpRatio < Bestiary.SpecialStoneheartThreshold ? 1f - Bestiary.SpecialStoneheartReduce : 1f;
        }

        /// <summary>棘刺胸甲:反伤(按比例 + 封顶;负伤害不倒贴)</summary>
        public static int ReflectOnHurt(IReadOnlyCollection<string> ids, float amount)
        {
            if (ids == null || !Contains(ids, "thornmail") || amount <= 0f) return 0;
            float raw = (float)Math.Round(amount * Bestiary.SpecialThornFrac, MidpointRounding.AwayFromZero);
            return (int)Math.Min(raw, Bestiary.SpecialThornCap);
        }

        /// <summary>猎风兜帽:移动中 +攻%(站着不动就没有)</summary>
        public static float WindhoodAtkPct(IReadOnlyCollection<string> ids, bool moving) =>
            moving && ids != null && Contains(ids, "windhood") ? Bestiary.SpecialWindhoodAtkPct : 0f;

        /// <summary>星陨兜帽:受击后窗口内 +攻%(窗口过了就没了)</summary>
        public static float StarhelmAtkPct(IReadOnlyCollection<string> ids, float sinceHurtS) =>
            ids != null && Contains(ids, "starhelm") && sinceHurtS <= Bestiary.SpecialStarhelmWindowS
                ? Bestiary.SpecialStarhelmAtkPct : 0f;

        /// <summary>焰行者之靴:翻滚留火</summary>
        public static bool DashLeavesFire(IReadOnlyCollection<string> ids) =>
            ids != null && Contains(ids, "emberstride");

        // ---------------- 消耗品(4 种) ----------------

        /// <summary>霜咬补的元素名(字符串叶子 → 生成器跳过,parity 里单独比对)</summary>
        public static string FrostfangElement => "ice";

        /// <summary>元素瓶附魔的元素(同上,字符串叶子)</summary>
        public static string FlaskElement => "fire";

        /// <summary>护盾上限 = 生命上限 × capPct,下限 1(残血时不至于给出 0 盾)</summary>
        public static int ShieldCap(float hpMax) =>
            Math.Max(1, (int)Math.Round(hpMax * Bestiary.ConsumableShieldCapPct, MidpointRounding.AwayFromZero));

        /// <summary>喝护盾药剂:**只刷新不叠加**(返回的剩余量永远等于上限)</summary>
        public static (float Amount, float T) ApplyShield(float hpMax) =>
            (ShieldCap(hpMax), Bestiary.ConsumableShieldDurS);

        /// <summary>伤害结算:先吃盾再进血;盾刚好破时多出来的部分照常进血</summary>
        public static (float Left, bool HasShield, float ShieldLeft, float ShieldT) AbsorbDamage(
            float shieldAmount, float shieldT, float damage)
        {
            if (shieldAmount <= 0f) return (damage, false, 0f, 0f);
            float left = damage - shieldAmount;
            if (left >= 0f) return (left, false, 0f, 0f);
            return (0f, true, shieldAmount - damage, shieldT);
        }

        /// <summary>盾到期即消失(不留 0 盾的僵尸状态)</summary>
        public static (bool Alive, float T) TickShield(float t, float dt) =>
            t - dt > 0f ? (true, t - dt) : (false, 0f);

        /// <summary>净化:一次最多清 debuffMax 项,并给一小段无敌</summary>
        public static (int Removed, float Iframes) Cleanse(int debuffCount)
        {
            int max = (int)Bestiary.ConsumableCleanseDebuffMax;
            return (Math.Min(Math.Max(debuffCount, 0), max), Bestiary.ConsumableCleanseIframesS);
        }

        /// <summary>时缓对目标的强度:普通全效,精英居中,Boss 打折(冻不住 Boss,但也不是免疫)</summary>
        public static float SlowFactor(string tier)
        {
            float basePct = Bestiary.ConsumableTimeslowSlowPct;
            switch (tier)
            {
                case "normal": return basePct;
                case "elite": return basePct * (1f + Bestiary.ConsumableTimeslowBossFactor) / 2f;
                case "boss": return basePct * Bestiary.ConsumableTimeslowBossFactor;
                default: return basePct;
            }
        }

        /// <summary>元素瓶:覆盖式刷新(不叠加层数)</summary>
        public static (string Element, float T) ApplyFlask() => (FlaskElement, Bestiary.ConsumableFlaskElementS);

        /// <summary>元素瓶到期即失效(不会永久附魔)</summary>
        public static (bool Alive, float T) TickFlask(float t, float dt) =>
            t - dt > 0f ? (true, t - dt) : (false, 0f);

        // ---------------- 蓝图(6 张) ----------------

        /// <summary>蓝图表(web/src/data/blueprints.json 的镜像;**字符串字段生成器比对不到**,由 CheckLoot 逐项比)</summary>
        public static readonly (string Id, string Slot, string Rarity, string Special, string[] Affixes, int CostShards)[] Blueprints =
        {
            ("bp_tempest_blade", "weapon", "legendary", "tempest", new[] { "atk_pct", "crit_rate", "atk_flat" }, 5),
            ("bp_frost_fang", "weapon", "legendary", "frostfang", new[] { "atk_pct", "elem_dmg", "crit_dmg" }, 6),
            ("bp_wind_hood", "helmet", "legendary", "windhood", new[] { "hp_pct", "cdr", "rage_pct" }, 5),
            ("bp_stone_heart", "chest", "legendary", "stoneheart", new[] { "hp_pct", "dmg_reduce", "regen_pct" }, 6),
            ("bp_ember_step", "boots", "legendary", "emberstride", new[] { "move_pct", "swift" }, 5),
            ("bp_echo_ring", "ring", "legendary", "echo_ring", new[] { "crit_rate", "crit_dmg", "luck_flat" }, 6),
        };

        /// <summary>铸造阻挡原因:null = 可以造。"没图纸"与"找不到这张蓝图"要分开报(菜单里显示的文案不同)</summary>
        public static string CraftBlocker(string id, int shards, IReadOnlyCollection<string> owned)
        {
            int idx = IndexOfBlueprint(id);
            if (idx < 0) return "unknown";
            if (owned == null || !Contains(owned, id)) return "owned";
            if (shards < Blueprints[idx].CostShards) return "shards";
            return null;
        }

        /// <summary>铸造:扣碎片,返回该蓝图对应的特效 id(Unity 侧没有完整装备系统,这里校验"扣费 + 指定特效")</summary>
        public static (string Special, int ShardsLeft, string Slot) Craft(string id, int shards, IReadOnlyCollection<string> owned)
        {
            string blocker = CraftBlocker(id, shards, owned);
            if (blocker != null) return (null, shards, null);
            var bp = Blueprints[IndexOfBlueprint(id)];
            return (bp.Special, shards - bp.CostShards, bp.Slot);
        }

        /// <summary>重铸:只洗词条 —— 部位/稀有度/特效都不动,所以这里只返回"重掷几条"</summary>
        public static int ReforgeRerollCount(int affixCount)
        {
            int max = (int)Bestiary.BlueprintReforgeRerollMax;
            return Math.Min(max, Math.Max(0, affixCount - 1));   // 至少留一条锚点
        }

        public static bool CanReforge(int affixCount, int stardust) =>
            affixCount > 0 && stardust >= Bestiary.BlueprintReforgeCost;

        private static int IndexOfBlueprint(string id)
        {
            for (int i = 0; i < Blueprints.Length; i++) if (Blueprints[i].Id == id) return i;
            return -1;
        }

        private static bool Contains(IReadOnlyCollection<string> ids, string id)
        {
            foreach (var x in ids) if (x == id) return true;
            return false;
        }
    }
}
