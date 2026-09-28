namespace StarfallKnights.Combat
{
    /// <summary>四系元素(对应 web Element 类型)。</summary>
    public enum Element { Fire, Ice, Bolt, Toxin }

    /// <summary>六种双元素连锁反应(docs/01-GDD.md §4)。</summary>
    public enum Reaction
    {
        None,
        Steam,    // 火+冰 蒸汽:范围伤害
        Overload, // 火+雷 超载:单体爆发
        Miasma,   // 火+毒 燃瘴:持续毒云
        Chain,    // 冰+雷 冻链:弹射传导
        Brittle,  // 冰+毒 脆蚀:易伤
        Numb,     // 雷+毒 麻痹:眩晕
    }

    /// <summary>元素反应表——与 web/src/game/combat/Elements.ts reactionOf 同构。</summary>
    public static class Elements
    {
        public static Reaction ReactionOf(Element mark, Element incoming)
        {
            if (mark == incoming) return Reaction.None;
            var pair = (Min(mark, incoming), Max(mark, incoming));
            return pair switch
            {
                (Element.Fire, Element.Ice) => Reaction.Steam,
                (Element.Fire, Element.Bolt) => Reaction.Overload,
                (Element.Fire, Element.Toxin) => Reaction.Miasma,
                (Element.Ice, Element.Bolt) => Reaction.Chain,
                (Element.Ice, Element.Toxin) => Reaction.Brittle,
                (Element.Bolt, Element.Toxin) => Reaction.Numb,
                _ => Reaction.None,
            };
        }

        private static Element Min(Element a, Element b) => a < b ? a : b;
        private static Element Max(Element a, Element b) => a > b ? a : b;
    }
}
