using System;
using System.Numerics;
using StarfallKnights.Core;

namespace StarfallKnights.Skills
{
    /// <summary>可选职业(镜像 web 四职业)。</summary>
    public enum HeroClass { Blade, Ranger, Arcanist, Warden }

    /// <summary>突进参数(宿主执行位移;瞬移类职业由逻辑层直接改坐标,这里 DurM=0)。</summary>
    public struct DashSpec
    {
        public float DistM;
        public float DurS;
        public float IframesS;
        /// <summary>true = 逻辑层已瞬移(秘术师闪现),宿主只需同步视图。</summary>
        public bool Teleported;
    }

    /// <summary>
    /// 职业技能集合:一个宿主(PlayerController)只持有一个 ClassSkillSet,
    /// 内部按 HeroClass 分派到四套执行器,怒气/CDR/符文位统一代理到当前职业。
    /// 这样 Unity 侧切职业只改一个枚举,与 web 端 SkillSystem(klass) 的结构一致。
    /// </summary>
    public sealed class ClassSkillSet
    {
        public HeroClass Class = HeroClass.Blade;

        public readonly BladeSkills Blade = new();
        public readonly RangerSkills Ranger = new();
        public readonly ArcanistSkills Arcanist = new();
        public readonly WardenSkills Warden = new();

        /// <summary>当前职业的执行器。</summary>
        public SkillRuntime Active => Class switch
        {
            HeroClass.Ranger => Ranger,
            HeroClass.Arcanist => Arcanist,
            HeroClass.Warden => Warden,
            _ => Blade,
        };

        /// <summary>怒气(代理到当前职业;切职业时不继承,避免跨职业攒大招)。</summary>
        public float Rage
        {
            get => Active.Rage;
            set => Active.Rage = value;
        }

        /// <summary>冷却缩减(四套都设,避免切职业后 CDR 丢失)。</summary>
        public float Cdr
        {
            set
            {
                Blade.Cdr = value;
                Ranger.Cdr = value;
                Arcanist.Cdr = value;
                Warden.Cdr = value;
            }
        }

        /// <summary>三个技能位镶符(按当前职业的技能 id 匹配;不匹配则忽略)。</summary>
        public void Equip(RuneDef q, RuneDef e, RuneDef r)
        {
            var rt = Active;
            rt.RuneQ = IdsMatch(q, rt, "Q") ? q : null;
            rt.RuneE = IdsMatch(e, rt, "E") ? e : null;
            rt.RuneR = IdsMatch(r, rt, "R") ? r : null;
        }

        private static bool IdsMatch(RuneDef rune, SkillRuntime rt, string slot)
        {
            if (rune == null) return false;
            return rune.Skill == SkillIdOf(rt, slot);
        }

        /// <summary>当前职业某技能位的技能 id(与 data/skills/*.json 一致)。</summary>
        public static string SkillIdOf(SkillRuntime rt, string slot) => rt switch
        {
            RangerSkills => slot == "Q" ? "ranger_q_fan" : slot == "E" ? "ranger_e_nova" : "ranger_r_storm",
            ArcanistSkills => slot == "Q" ? "arcanist_q_seeker" : slot == "E" ? "arcanist_e_blink" : "arcanist_r_tempest",
            WardenSkills => slot == "Q" ? "warden_q_quake" : slot == "E" ? "warden_e_charge" : "warden_r_roar",
            _ => slot == "Q" ? "blade_q_cleave" : slot == "E" ? "blade_e_tidestep" : "blade_r_starfall",
        };

        /// <summary>当前职业的技能 id(给 UI/HUD 用)。</summary>
        public string SkillId(string slot) => SkillIdOf(Active, slot);

        /// <summary>三技能剩余冷却(0=就绪),HUD 冷却遮罩用。</summary>
        public float Cooldown(string slot) => Active.CooldownOf(slot);

        public void Tick(float dt)
        {
            // 只推进当前职业(切职业后旧队列自然作废,与 web 重建 SkillSystem 同效)
            Active.Tick(dt);
        }

        /// <summary>Q(返回 false = 冷却中)。</summary>
        public bool CastQ(LogicWorld w) => Class switch
        {
            HeroClass.Ranger => Ranger.CastQ(w),
            HeroClass.Arcanist => Arcanist.CastQ(w),
            HeroClass.Warden => Warden.CastQ(w),
            _ => Blade.CastQ(w),
        };

        /// <summary>E:返回突进参数交宿主执行;秘术师返回 Teleported=true(已瞬移)。</summary>
        public DashSpec? CastE(LogicWorld w, Vector2? aimPoint = null)
        {
            switch (Class)
            {
                case HeroClass.Ranger:
                {
                    var d = Ranger.CastE(w);
                    if (!d.HasValue) return null;
                    return new DashSpec { DistM = d.Value.distM, DurS = d.Value.durS, IframesS = d.Value.iframesS };
                }
                case HeroClass.Warden:
                {
                    var d = Warden.CastE(w);
                    if (!d.HasValue) return null;
                    return new DashSpec { DistM = d.Value.distM, DurS = d.Value.durS, IframesS = d.Value.iframesS };
                }
                case HeroClass.Arcanist:
                {
                    var b = Arcanist.CastE(w, aimPoint);
                    if (!b.HasValue) return null;
                    // 瞬移已由逻辑层完成;宿主同步视图并给无敌帧
                    return new DashSpec { DistM = 0f, DurS = 0f, IframesS = b.Value.iframesS, Teleported = true };
                }
                default:
                {
                    var d = Blade.CastE(w);
                    if (!d.HasValue) return null;
                    // blade 的 dash.mult 只是数据镜像(web 也未消费),这里不透出
                    return new DashSpec { DistM = d.Value.distM, DurS = d.Value.durS, IframesS = d.Value.iframesS };
                }
            }
        }

        /// <summary>R(返回 false = 冷却中或怒气不足)。</summary>
        public bool CastR(LogicWorld w, Action<Vector2> onImpactFx = null, Vector2? aimPoint = null) => Class switch
        {
            HeroClass.Ranger => Ranger.CastR(w, onImpactFx, aimPoint),
            HeroClass.Arcanist => Arcanist.CastR(w),
            HeroClass.Warden => Warden.CastR(w),
            _ => Blade.CastR(w, onImpactFx),
        };

        /// <summary>开局赠符(镜像 web:随机一枚 Q 符文)。用项目确定性 Rng,便于复现。</summary>
        public RuneDef GrantRandomQRune(Rng rng)
        {
            var pool = RunePool.ForClass(Class switch
            {
                HeroClass.Ranger => "ranger",
                HeroClass.Arcanist => "arcanist",
                HeroClass.Warden => "warden",
                _ => "blade",
            });
            var qRunes = pool.FindAll(r => r.Skill == SkillId("Q"));
            if (qRunes.Count == 0) return null;
            var rune = qRunes[rng.Int(0, qRunes.Count - 1)];
            Active.RuneQ = rune;
            return rune;
        }
    }
}
