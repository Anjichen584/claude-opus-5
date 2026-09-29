using System.Collections.Generic;
using StarfallKnights.Combat;

namespace StarfallKnights.Skills
{
    /// <summary>符文定义(镜像 web data/runes/pool.json)。</summary>
    public sealed class RuneDef
    {
        public string Id;
        public string Skill; // 例:blade_q_cleave / ranger_q_fan / warden_r_roar
        public string Name;
        public Element? Element;
        /// <summary>元素地带参数(radiusM, lifeS, tickS, mult);null=无地带。</summary>
        public float[] GroundZone;
    }

    /// <summary>
    /// 全 36 枚符文(12 技能 × 3 元素互斥),与 web 端逐字段对齐。
    /// 一致性由 unity/Tests 的 parity 测试守卫(直接读 web/src/data/runes/pool.json 比对)。
    /// </summary>
    public static class RunePool
    {
        /// <summary>Blade 9 枚(镜像 web data/runes/pool.json)。</summary>
        public static readonly List<RuneDef> Blade = new()
        {
            new RuneDef { Id = "rune_emberseed", Skill = "blade_q_cleave", Name = "焚风之种", Element = Element.Fire, GroundZone = new[] { 1.6f, 2f, 0.5f, 0.6f } },
            new RuneDef { Id = "rune_glacialbloom", Skill = "blade_q_cleave", Name = "凝霜之绽", Element = Element.Ice, GroundZone = new[] { 1.4f, 1.8f, 0.5f, 0.4f } },
            new RuneDef { Id = "rune_venomfang", Skill = "blade_q_cleave", Name = "蚀绿毒牙", Element = Element.Toxin, GroundZone = null },
            new RuneDef { Id = "rune_frostcore", Skill = "blade_e_tidestep", Name = "霜核", Element = Element.Ice, GroundZone = null },
            new RuneDef { Id = "rune_emberwake", Skill = "blade_e_tidestep", Name = "燃焰余迹", Element = Element.Fire, GroundZone = new[] { 1.5f, 2.2f, 0.5f, 0.5f } },
            new RuneDef { Id = "rune_thunderecho", Skill = "blade_e_tidestep", Name = "雷鸣回响", Element = Element.Bolt, GroundZone = null },
            new RuneDef { Id = "rune_stormstring", Skill = "blade_r_starfall", Name = "引雷矢", Element = Element.Bolt, GroundZone = null },
            new RuneDef { Id = "rune_frostfall", Skill = "blade_r_starfall", Name = "霜陨", Element = Element.Ice, GroundZone = new[] { 0.9f, 1.4f, 0.5f, 0.3f } },
            new RuneDef { Id = "rune_cinderrain", Skill = "blade_r_starfall", Name = "烬雨", Element = Element.Fire, GroundZone = new[] { 0.9f, 1.4f, 0.5f, 0.4f } },
        };

        /// <summary>Ranger 9 枚(镜像 web data/runes/pool.json)。</summary>
        public static readonly List<RuneDef> Ranger = new()
        {
            new RuneDef { Id = "rune_flamefeather", Skill = "ranger_q_fan", Name = "焰羽箭", Element = Element.Fire, GroundZone = null },
            new RuneDef { Id = "rune_frostring", Skill = "ranger_e_nova", Name = "霜环", Element = Element.Ice, GroundZone = new[] { 1.4f, 1.8f, 0.5f, 0.4f } },
            new RuneDef { Id = "rune_stormpierce", Skill = "ranger_r_storm", Name = "贯雷雨", Element = Element.Bolt, GroundZone = null },
            new RuneDef { Id = "rune_frostfeather", Skill = "ranger_q_fan", Name = "霜羽箭", Element = Element.Ice, GroundZone = null },
            new RuneDef { Id = "rune_venomfeather", Skill = "ranger_q_fan", Name = "毒羽箭", Element = Element.Toxin, GroundZone = null },
            new RuneDef { Id = "rune_emberring", Skill = "ranger_e_nova", Name = "焰环", Element = Element.Fire, GroundZone = new[] { 1.4f, 2f, 0.5f, 0.5f } },
            new RuneDef { Id = "rune_boltring", Skill = "ranger_e_nova", Name = "雷环", Element = Element.Bolt, GroundZone = null },
            new RuneDef { Id = "rune_pyrestorm", Skill = "ranger_r_storm", Name = "炎雨", Element = Element.Fire, GroundZone = null },
            new RuneDef { Id = "rune_rimestorm", Skill = "ranger_r_storm", Name = "凇雨", Element = Element.Ice, GroundZone = null },
        };

        /// <summary>Arcanist 9 枚(镜像 web data/runes/pool.json)。</summary>
        public static readonly List<RuneDef> Arcanist = new()
        {
            new RuneDef { Id = "rune_pyreseeker", Skill = "arcanist_q_seeker", Name = "炽星追曳", Element = Element.Fire, GroundZone = null },
            new RuneDef { Id = "rune_glacialveil", Skill = "arcanist_e_blink", Name = "霜幕", Element = Element.Ice, GroundZone = new[] { 1.5f, 1.8f, 0.5f, 0.4f } },
            new RuneDef { Id = "rune_miasmaheart", Skill = "arcanist_r_tempest", Name = "瘴风之心", Element = Element.Toxin, GroundZone = null },
            new RuneDef { Id = "rune_frostseeker", Skill = "arcanist_q_seeker", Name = "寒星追曳", Element = Element.Ice, GroundZone = null },
            new RuneDef { Id = "rune_voltseeker", Skill = "arcanist_q_seeker", Name = "电星追曳", Element = Element.Bolt, GroundZone = null },
            new RuneDef { Id = "rune_emberveil", Skill = "arcanist_e_blink", Name = "焰幕", Element = Element.Fire, GroundZone = new[] { 1.5f, 2f, 0.5f, 0.5f } },
            new RuneDef { Id = "rune_venomveil", Skill = "arcanist_e_blink", Name = "瘴幕", Element = Element.Toxin, GroundZone = new[] { 1.5f, 2f, 0.5f, 0.4f } },
            new RuneDef { Id = "rune_pyretempest", Skill = "arcanist_r_tempest", Name = "炽焰风暴", Element = Element.Fire, GroundZone = null },
            new RuneDef { Id = "rune_glacialtempest", Skill = "arcanist_r_tempest", Name = "凛冬风暴", Element = Element.Ice, GroundZone = null },
        };

        /// <summary>Warden 9 枚(镜像 web data/runes/pool.json)。</summary>
        public static readonly List<RuneDef> Warden = new()
        {
            new RuneDef { Id = "rune_thundershatter", Skill = "warden_q_quake", Name = "碎雷震", Element = Element.Bolt, GroundZone = null },
            new RuneDef { Id = "rune_moltenram", Skill = "warden_e_charge", Name = "熔岩冲角", Element = Element.Fire, GroundZone = new[] { 1.3f, 2f, 0.5f, 0.5f } },
            new RuneDef { Id = "rune_permafrost", Skill = "warden_r_roar", Name = "永冻怒吼", Element = Element.Ice, GroundZone = null },
            new RuneDef { Id = "rune_magmashatter", Skill = "warden_q_quake", Name = "熔岩震", Element = Element.Fire, GroundZone = null },
            new RuneDef { Id = "rune_toxinshatter", Skill = "warden_q_quake", Name = "腐土震", Element = Element.Toxin, GroundZone = null },
            new RuneDef { Id = "rune_glacialram", Skill = "warden_e_charge", Name = "冰川冲角", Element = Element.Ice, GroundZone = new[] { 1.3f, 2f, 0.5f, 0.4f } },
            new RuneDef { Id = "rune_stormram", Skill = "warden_e_charge", Name = "雷霆冲角", Element = Element.Bolt, GroundZone = null },
            new RuneDef { Id = "rune_pyreroar", Skill = "warden_r_roar", Name = "燎原怒吼", Element = Element.Fire, GroundZone = null },
            new RuneDef { Id = "rune_venomroar", Skill = "warden_r_roar", Name = "沼泽怒吼", Element = Element.Toxin, GroundZone = null },
        };

        /// <summary>按职业取 9 枚(klass: blade/ranger/arcanist/warden)。</summary>
        public static List<RuneDef> ForClass(string klass) => klass switch
        {
            "ranger" => Ranger,
            "arcanist" => Arcanist,
            "warden" => Warden,
            _ => Blade,
        };

        /// <summary>全部 36 枚(开局随机赠送/掉落池共用)。</summary>
        public static List<RuneDef> All()
        {
            var all = new List<RuneDef>();
            all.AddRange(Blade);
            all.AddRange(Ranger);
            all.AddRange(Arcanist);
            all.AddRange(Warden);
            return all;
        }
    }
}
