using System;
using System.Collections.Generic;

namespace StarfallKnights.Loot
{
    /// <summary>
    /// 装备穿戴 + 属性重算(轮 44,U3 收尾;镜像 web loot/Equip.ts 的核心公式)。
    ///
    /// 分层口径(docs/03-NUMBERS.md §5):**基础值 + 装备平铺(加法) → 百分比词条(乘法)**。
    /// web 侧的条件词条双面 / 橙装特效持续修正是内容层,Unity 的 Item 是简化镜像
    /// (八词条单面),所以这里只镜像公式骨架与三条上限:
    ///   critRate ≤ 1 / cdr ≤ 0.4(docs/03 §1) / 血量按比例保持(换装不回血)。
    /// </summary>
    public static class Equip
    {
        /// <summary>背包容量(镜像 balance.loot.invSize;parity 钉住)。</summary>
        public const int InvSize = 24;

        /// <summary>祭坛每级加成(镜像 balance.altar.hpPerLvl / atkPerLvl;parity 钉住)。</summary>
        public const float AltarHpPerLvl = 0.03f;
        public const float AltarAtkPerLvl = 0.03f;

        /// <summary>冷却缩减上限(docs/03 §1;web 侧挑战词条可放宽,Unity 镜像取默认档)。</summary>
        public const float CdrCap = 0.4f;

        public static readonly Dictionary<string, float> Parity = new()
        {
            { "loot.invSize", InvSize },
            { "altar.hpPerLvl", AltarHpPerLvl },
            { "altar.atkPerLvl", AltarAtkPerLvl },
        };

        // ================= 容器 =================

        /// <summary>六槽装备(web Equipment.slots)。</summary>
        public sealed class Equipment
        {
            private readonly Dictionary<Slot, Item> _slots = new();

            public Item Of(Slot s) => _slots.TryGetValue(s, out var it) ? it : null;

            /// <summary>穿上;返回被顶下来的旧件(可能为 null)。</summary>
            public Item Put(Item item)
            {
                var old = Of(item.Slot);
                _slots[item.Slot] = item;
                return old;
            }

            public Item Remove(Slot s)
            {
                var old = Of(s);
                _slots.Remove(s);
                return old;
            }

            public IEnumerable<Item> All()
            {
                foreach (var kv in _slots) if (kv.Value != null) yield return kv.Value;
            }
        }

        /// <summary>背包(上限 InvSize;满了装不进 —— 掉落转分解归宿主)。</summary>
        public sealed class Inventory
        {
            public readonly List<Item> Items = new();
            public bool Full => Items.Count >= InvSize;

            /// <summary>塞进背包;满了返回 false(调用方转分解)。</summary>
            public bool Add(Item item)
            {
                if (Full) return false;
                Items.Add(item);
                return true;
            }
        }

        /// <summary>穿上背包第 idx 件;旧件回背包(镜像 web equipFromInventory)。</summary>
        public static bool EquipFromInventory(Inventory inv, Equipment eq, int idx)
        {
            if (idx < 0 || idx >= inv.Items.Count) return false;
            var item = inv.Items[idx];
            inv.Items.RemoveAt(idx);
            var old = eq.Put(item);
            if (old != null) inv.Items.Add(old);   // 刚腾出一格,旧件必然放得下
            return true;
        }

        /// <summary>卸下某部位到背包;背包满则不动(镜像 web unequipSlot)。</summary>
        public static bool UnequipSlot(Inventory inv, Equipment eq, Slot slot)
        {
            var item = eq.Of(slot);
            if (item == null || inv.Full) return false;
            eq.Remove(slot);
            inv.Items.Add(item);
            return true;
        }

        // ================= 重算 =================

        /// <summary>重算输出(宿主拿去回写 CombatUnit / 面板直接画)。</summary>
        public struct StatSheet
        {
            public float Atk, HpMax, MoveSpeed, CritRate, CritDmg, Cdr, ElemDmg, Def;
        }

        /// <summary>
        /// 属性重算(镜像 web recompute 的公式骨架):
        ///   atk = round(baseAtk × (1 + 祭坛×3%/级) × (1 + atkPct%))
        ///   hp  = round(baseHp × (1 + 祭坛×3%/级) + hpFlat)   —— hpFlat 是平铺,加法在乘法前的口径
        ///   crit/critDmg/move/cdr/elem 按词条百分点累加;def 平铺。
        /// 词条八键与 ItemFactory.AffixPool 一字不差,新增词条两处都要动(有测试钉)。
        /// </summary>
        public static StatSheet Recompute(
            float baseAtk, float baseHp, float baseMoveSpeed, float baseCritRate, float baseCritDmg,
            Equipment eq, int altarAtkLvl = 0, int altarHpLvl = 0)
        {
            float atkPct = 0, hpFlat = 0, critRatePt = 0, critDmgPt = 0,
                movePt = 0, cdrPt = 0, elemPt = 0, defFlat = 0;
            foreach (var item in eq.All())
            {
                foreach (var a in item.Affixes)
                {
                    switch (a.Key)
                    {
                        case "atkPct": atkPct += a.Value; break;
                        case "hpFlat": hpFlat += a.Value; break;
                        case "critRate": critRatePt += a.Value; break;
                        case "critDmg": critDmgPt += a.Value; break;
                        case "moveSpd": movePt += a.Value; break;
                        case "cdr": cdrPt += a.Value; break;
                        case "elemDmg": elemPt += a.Value; break;
                        case "defFlat": defFlat += a.Value; break;
                        default: break;   // 未知词条静默忽略(老档/数据扩表无害)
                    }
                }
            }

            float atkBase = baseAtk * (1f + altarAtkLvl * AltarAtkPerLvl);
            float hpBase = baseHp * (1f + altarHpLvl * AltarHpPerLvl) + hpFlat;
            return new StatSheet
            {
                Atk = MathF.Round(atkBase * (1f + atkPct / 100f)),
                HpMax = MathF.Max(1f, MathF.Round(hpBase)),
                MoveSpeed = baseMoveSpeed * (1f + movePt / 100f),
                CritRate = MathF.Min(baseCritRate + critRatePt / 100f, 1f),
                CritDmg = baseCritDmg + critDmgPt / 100f,
                Cdr = MathF.Min(cdrPt / 100f, CdrCap),
                ElemDmg = elemPt / 100f,
                Def = defFlat,
            };
        }

        /// <summary>换装后的当前血:按比例保持,换装不回血也不凭空掉血(下限 1)。</summary>
        public static float KeepHpRatio(float hp, float oldMax, float newMax)
        {
            float ratio = oldMax > 0f ? hp / oldMax : 1f;
            return MathF.Min(newMax, MathF.Max(1f, MathF.Round(newMax * ratio)));
        }

        // ================= 自动穿戴(宿主拾取用) =================

        /// <summary>
        /// 拾取决策(Unity 场景没有背包 UI,先用规则代打):
        /// 同槽位空 → 穿;稀有度更高 → 换下旧的进背包;否则进背包。
        /// taken=false 表示没收下(背包满,新件转分解);overflow = 被顶下来却塞不进背包的旧件
        /// (同样转分解 —— 两条"溢出"都交还宿主,这里绝不静默丢装备)。
        /// </summary>
        public static (bool taken, Item overflow) AutoTake(Inventory inv, Equipment eq, Item item)
        {
            var cur = eq.Of(item.Slot);
            if (cur == null) { eq.Put(item); return (true, null); }
            if (item.Rarity > cur.Rarity)
            {
                eq.Put(item);
                return (true, inv.Add(cur) ? null : cur);
            }
            return (inv.Add(item), null);
        }
    }
}
