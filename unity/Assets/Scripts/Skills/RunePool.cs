using System.Collections.Generic;
using StarfallKnights.Combat;

namespace StarfallKnights.Skills
{
    /// <summary>符文定义(镜像 web data/runes/pool.json 剑士 9 枚)。</summary>
    public sealed class RuneDef
    {
        public string Id;
        public string Skill; // blade_q_cleave / blade_e_tidestep / blade_r_starfall
        public string Name;
        public Element? Element;
        /// <summary>元素地带参数(radiusM, lifeS, tickS, mult);null=无地带。</summary>
        public float[] GroundZone;
    }

    public static class RunePool
    {
        public static readonly List<RuneDef> Blade = new()
        {
            new RuneDef { Id = "rune_emberseed", Skill = "blade_q_cleave", Name = "焚风之种", Element = Combat.Element.Fire, GroundZone = new[] { 1.6f, 2.0f, 0.5f, 0.6f } },
            new RuneDef { Id = "rune_glacialbloom", Skill = "blade_q_cleave", Name = "凝霜之绽", Element = Combat.Element.Ice, GroundZone = new[] { 1.4f, 1.8f, 0.5f, 0.4f } },
            new RuneDef { Id = "rune_venomfang", Skill = "blade_q_cleave", Name = "蚀绿毒牙", Element = Combat.Element.Toxin, GroundZone = null },
            new RuneDef { Id = "rune_frostcore", Skill = "blade_e_tidestep", Name = "霜核", Element = Combat.Element.Ice, GroundZone = null },
            new RuneDef { Id = "rune_emberwake", Skill = "blade_e_tidestep", Name = "燃焰余迹", Element = Combat.Element.Fire, GroundZone = new[] { 1.5f, 2.2f, 0.5f, 0.5f } },
            new RuneDef { Id = "rune_thunderecho", Skill = "blade_e_tidestep", Name = "雷鸣回响", Element = Combat.Element.Bolt, GroundZone = null },
            new RuneDef { Id = "rune_stormstring", Skill = "blade_r_starfall", Name = "引雷矢", Element = Combat.Element.Bolt, GroundZone = null },
            new RuneDef { Id = "rune_frostfall", Skill = "blade_r_starfall", Name = "霜陨", Element = Combat.Element.Ice, GroundZone = new[] { 0.9f, 1.4f, 0.5f, 0.3f } },
            new RuneDef { Id = "rune_cinderrain", Skill = "blade_r_starfall", Name = "烬雨", Element = Combat.Element.Fire, GroundZone = new[] { 0.9f, 1.4f, 0.5f, 0.4f } },
        };
    }
}
