using System.Collections.Generic;
using StarfallKnights.Core;

namespace StarfallKnights.Data
{
    /// <summary>
    /// 图鉴:全部 21 种敌人的属性行 + 三章配置 + 行为参数常量。
    /// ⚠ 本文件由 `python3 tools/gen_bestiary.py` 从 web/src/data/balance.json 生成,
    /// 请勿手改(数值唯一权威是 balance.json);ParityTests 会逐键双向比对。
    /// </summary>
    public static class Bestiary
    {
        /// <summary>敌人基础属性(未做章节/深度/昼夜缩放)。</summary>
        public readonly struct Stat
        {
            public readonly string Name;
            public readonly float Hp, Atk, Def, Speed, BodyRadius, ContactCd;

            public Stat(string name, float hp, float atk, float def, float speed, float bodyRadius, float contactCd)
            {
                Name = name; Hp = hp; Atk = atk; Def = def;
                Speed = speed; BodyRadius = bodyRadius; ContactCd = contactCd;
            }
        }

        public static readonly Dictionary<Core.EnemyKind, Stat> Stats = new()
        {
            { EnemyKind.Shroomling, new Stat("shroomling", 45f, 8f, 2f, 2f, 0.28f, 0.8f) },
            { EnemyKind.WindBee, new Stat("windbee", 18f, 6f, 0f, 5.5f, 0.18f, 0.8f) },
            { EnemyKind.BlightWolf, new Stat("blightwolf", 90f, 14f, 4f, 4.8f, 0.34f, 0.8f) },
            { EnemyKind.LeafWisp, new Stat("风叶精", 26f, 8f, 0f, 2.4f, 0.28f, 0.8f) },
            { EnemyKind.ThornVine, new Stat("thornvine", 70f, 12f, 3f, 0f, 0.3f, 0.8f) },
            { EnemyKind.OakGolem, new Stat("oakgolem", 320f, 18f, 8f, 1.6f, 0.5f, 0.8f) },
            { EnemyKind.EmberImp, new Stat("烬火小鬼", 34f, 9f, 0f, 2.6f, 0.28f, 0.8f) },
            { EnemyKind.FrostSlime, new Stat("霜核史莱姆", 60f, 8f, 2f, 1.6f, 0.34f, 0.9f) },
            { EnemyKind.SparkLizard, new Stat("雷纹蜥", 26f, 10f, 0f, 3f, 0.24f, 0.8f) },
            { EnemyKind.ToxinToad, new Stat("毒沼蟾", 55f, 9f, 1f, 1.2f, 0.34f, 0.9f) },
            { EnemyKind.StardustSprite, new Stat("星尘精灵", 20f, 0f, 0f, 4.4f, 0.22f, 0.8f) },
            { EnemyKind.SnowPuff, new Stat("雪绒球", 30f, 9f, 0f, 3.2f, 0.26f, 0.8f) },
            { EnemyKind.IceTurtle, new Stat("冰壳龟", 110f, 12f, 4f, 1f, 0.4f, 0.9f) },
            { EnemyKind.BlizzardHawk, new Stat("风雪隼", 34f, 11f, 0f, 3.4f, 0.26f, 0.8f) },
            { EnemyKind.FrostMage, new Stat("霜语法师", 40f, 10f, 1f, 2.2f, 0.28f, 0.8f) },
            { EnemyKind.IceSpike, new Stat("冰锥笋", 30f, 9f, 0f, 0f, 0.35f, 0.8f) },
            { EnemyKind.IceGlider, new Stat("霜刃滑手", 55f, 11f, 1f, 4.6f, 0.4f, 0.8f) },
            { EnemyKind.BossVelsha, new Stat("霜语女妖·薇尔莎", 5200f, 16f, 3f, 2f, 0.55f, 0.8f) },
            { EnemyKind.CinderRat, new Stat("烬鼠", 26f, 10f, 0f, 3.8f, 0.22f, 0.7f) },
            { EnemyKind.DuneBeetle, new Stat("沙暴甲虫", 80f, 13f, 3f, 1.4f, 0.36f, 0.9f) },
            { EnemyKind.FlameDancer, new Stat("火舞妖", 38f, 11f, 0f, 2.4f, 0.26f, 0.8f) },
            { EnemyKind.DustStinger, new Stat("岩尾蝎", 60f, 10f, 2f, 1.6f, 0.32f, 0.9f) },
            { EnemyKind.MirageBlossom, new Stat("沙蜃花", 45f, 10f, 2f, 0f, 0.38f, 0.8f) },
            { EnemyKind.EmberWhirl, new Stat("烬旋灵", 60f, 12f, 1f, 2.4f, 0.4f, 0.8f) },
            { EnemyKind.BossKazra, new Stat("熔核蝎皇·卡兹拉", 6400f, 18f, 4f, 2.2f, 0.6f, 0.8f) },
            { EnemyKind.MidBossMossstag, new Stat("苔冠巨鹿", 1500f, 12f, 4f, 1.5f, 0.55f, 0.8f) },
            { EnemyKind.MidBossFrosthuntress, new Stat("霜噬女猎", 1550f, 13f, 3f, 2.9f, 0.42f, 0.8f) },
            { EnemyKind.MidBossSandreaper, new Stat("沙暴刽子", 1650f, 14f, 5f, 2.2f, 0.5f, 0.8f) },
            { EnemyKind.BossNanmir, new Stat("腐木巨像·南弥尔", 4200f, 18f, 8f, 1.2f, 0.7f, 0.8f) },
        };

        public static Stat Of(Core.EnemyKind k) => Stats.TryGetValue(k, out var s) ? s : default;

        /// <summary>章节配置(1/2/3 章;statMult 是杂兵乘区,Boss 血攻已按章调好不再乘)。</summary>
        public readonly struct Chapter
        {
            public readonly string Name;
            public readonly float StatMult, LootMult, LanternCost;
            public readonly int UnlockClears;

            public Chapter(string name, float statMult, float lootMult, float lanternCost, int unlockClears)
            {
                Name = name; StatMult = statMult; LootMult = lootMult;
                LanternCost = lanternCost; UnlockClears = unlockClears;
            }
        }

        public static readonly Dictionary<int, Chapter> Chapters = new()
        {
            { 1, new Chapter("翠语林地", 1f, 1f, 120f, 0) },
            { 2, new Chapter("霜语冰原", 1.35f, 1.3f, 156f, 1) },
            { 3, new Chapter("烬语荒漠", 1.7f, 1.6f, 203f, 2) },
        };

        public static Chapter ChapterOf(int c) => Chapters.TryGetValue(c, out var v) ? v : Chapters[1];

        // ---- 行为参数(balance.json 的全部数值叶子,逐键镜像)----

        /// <summary>shroomling.hp</summary>
        public const float ShroomlingHp = 45f;
        /// <summary>shroomling.atk</summary>
        public const float ShroomlingAtk = 8f;
        /// <summary>shroomling.def</summary>
        public const float ShroomlingDef = 2f;
        /// <summary>shroomling.speed</summary>
        public const float ShroomlingSpeed = 2f;
        /// <summary>shroomling.bodyRadius</summary>
        public const float ShroomlingBodyRadius = 0.28f;
        /// <summary>shroomling.aggroRange</summary>
        public const float ShroomlingAggroRange = 6f;
        /// <summary>shroomling.touchCooldown</summary>
        public const float ShroomlingTouchCooldown = 0.8f;
        /// <summary>shroomling.wanderSpeed</summary>
        public const float ShroomlingWanderSpeed = 0.7f;
        /// <summary>shroomling.spore.radiusM</summary>
        public const float ShroomlingSporeRadiusM = 1.2f;
        /// <summary>shroomling.spore.lifeS</summary>
        public const float ShroomlingSporeLifeS = 2f;
        /// <summary>shroomling.spore.intervalS</summary>
        public const float ShroomlingSporeIntervalS = 0.5f;
        /// <summary>shroomling.spore.mult</summary>
        public const float ShroomlingSporeMult = 0.5f;
        /// <summary>windbee.hp</summary>
        public const float WindBeeHp = 18f;
        /// <summary>windbee.atk</summary>
        public const float WindBeeAtk = 6f;
        /// <summary>windbee.def</summary>
        public const float WindBeeDef = 0f;
        /// <summary>windbee.speed</summary>
        public const float WindBeeSpeed = 5.5f;
        /// <summary>windbee.bodyRadius</summary>
        public const float WindBeeBodyRadius = 0.18f;
        /// <summary>windbee.orbitRadiusM</summary>
        public const float WindBeeOrbitRadiusM = 2.5f;
        /// <summary>windbee.diveSpeed</summary>
        public const float WindBeeDiveSpeed = 7f;
        /// <summary>windbee.diveDur</summary>
        public const float WindBeeDiveDur = 0.5f;
        /// <summary>windbee.diveIntervalMin</summary>
        public const float WindBeeDiveIntervalMin = 2f;
        /// <summary>windbee.diveIntervalMax</summary>
        public const float WindBeeDiveIntervalMax = 3.5f;
        /// <summary>windbee.telegraphS</summary>
        public const float WindBeeTelegraphS = 0.4f;
        /// <summary>windbee.touchCooldown</summary>
        public const float WindBeeTouchCooldown = 0.6f;
        /// <summary>blightwolf.hp</summary>
        public const float BlightWolfHp = 90f;
        /// <summary>blightwolf.atk</summary>
        public const float BlightWolfAtk = 14f;
        /// <summary>blightwolf.def</summary>
        public const float BlightWolfDef = 4f;
        /// <summary>blightwolf.speed</summary>
        public const float BlightWolfSpeed = 4.8f;
        /// <summary>blightwolf.bodyRadius</summary>
        public const float BlightWolfBodyRadius = 0.34f;
        /// <summary>blightwolf.circleRadiusM</summary>
        public const float BlightWolfCircleRadiusM = 3.5f;
        /// <summary>blightwolf.circleTimeMin</summary>
        public const float BlightWolfCircleTimeMin = 2f;
        /// <summary>blightwolf.circleTimeMax</summary>
        public const float BlightWolfCircleTimeMax = 4f;
        /// <summary>blightwolf.growlS</summary>
        public const float BlightWolfGrowlS = 0.5f;
        /// <summary>blightwolf.pounceSpeed</summary>
        public const float BlightWolfPounceSpeed = 9f;
        /// <summary>blightwolf.pounceDur</summary>
        public const float BlightWolfPounceDur = 0.4f;
        /// <summary>blightwolf.recoverS</summary>
        public const float BlightWolfRecoverS = 0.8f;
        /// <summary>blightwolf.touchCooldown</summary>
        public const float BlightWolfTouchCooldown = 1.2f;
        /// <summary>leafwisp.hp</summary>
        public const float LeafWispHp = 26f;
        /// <summary>leafwisp.atk</summary>
        public const float LeafWispAtk = 8f;
        /// <summary>leafwisp.def</summary>
        public const float LeafWispDef = 0f;
        /// <summary>leafwisp.speed</summary>
        public const float LeafWispSpeed = 2.4f;
        /// <summary>leafwisp.bodyRadius</summary>
        public const float LeafWispBodyRadius = 0.28f;
        /// <summary>leafwisp.keepMinM</summary>
        public const float LeafWispKeepMinM = 3f;
        /// <summary>leafwisp.keepMaxM</summary>
        public const float LeafWispKeepMaxM = 5.5f;
        /// <summary>leafwisp.bolt.cd</summary>
        public const float LeafWispBoltCd = 2.2f;
        /// <summary>leafwisp.bolt.aimS</summary>
        public const float LeafWispBoltAimS = 0.4f;
        /// <summary>leafwisp.bolt.speedM</summary>
        public const float LeafWispBoltSpeedM = 5.6f;
        /// <summary>leafwisp.bolt.radiusM</summary>
        public const float LeafWispBoltRadiusM = 0.26f;
        /// <summary>leafwisp.bolt.lifeS</summary>
        public const float LeafWispBoltLifeS = 1.3f;
        /// <summary>leafwisp.bolt.mult</summary>
        public const float LeafWispBoltMult = 0.8f;
        /// <summary>leafwisp.windBoostMul</summary>
        public const float LeafWispWindBoostMul = 1.8f;
        /// <summary>thornvine.hp</summary>
        public const float ThornVineHp = 70f;
        /// <summary>thornvine.atk</summary>
        public const float ThornVineAtk = 12f;
        /// <summary>thornvine.def</summary>
        public const float ThornVineDef = 3f;
        /// <summary>thornvine.bodyRadius</summary>
        public const float ThornVineBodyRadius = 0.3f;
        /// <summary>thornvine.idleS</summary>
        public const float ThornVineIdleS = 1.4f;
        /// <summary>thornvine.telegraphS</summary>
        public const float ThornVineTelegraphS = 0.6f;
        /// <summary>thornvine.spikeRadiusM</summary>
        public const float ThornVineSpikeRadiusM = 1f;
        /// <summary>thornvine.rangeM</summary>
        public const float ThornVineRangeM = 7f;
        /// <summary>oakgolem.hp</summary>
        public const float OakGolemHp = 320f;
        /// <summary>oakgolem.atk</summary>
        public const float OakGolemAtk = 18f;
        /// <summary>oakgolem.def</summary>
        public const float OakGolemDef = 8f;
        /// <summary>oakgolem.speed</summary>
        public const float OakGolemSpeed = 1.6f;
        /// <summary>oakgolem.bodyRadius</summary>
        public const float OakGolemBodyRadius = 0.5f;
        /// <summary>oakgolem.slamRangeM</summary>
        public const float OakGolemSlamRangeM = 2.2f;
        /// <summary>oakgolem.slamTelegraphS</summary>
        public const float OakGolemSlamTelegraphS = 0.7f;
        /// <summary>oakgolem.slamRadiusM</summary>
        public const float OakGolemSlamRadiusM = 1.8f;
        /// <summary>oakgolem.slamCdS</summary>
        public const float OakGolemSlamCdS = 2.6f;
        /// <summary>oakgolem.backstabMult</summary>
        public const float OakGolemBackstabMult = 2f;
        /// <summary>emberimp.hp</summary>
        public const float EmberImpHp = 34f;
        /// <summary>emberimp.atk</summary>
        public const float EmberImpAtk = 9f;
        /// <summary>emberimp.def</summary>
        public const float EmberImpDef = 0f;
        /// <summary>emberimp.speed</summary>
        public const float EmberImpSpeed = 2.6f;
        /// <summary>emberimp.bodyRadius</summary>
        public const float EmberImpBodyRadius = 0.28f;
        /// <summary>emberimp.keepMinM</summary>
        public const float EmberImpKeepMinM = 3.2f;
        /// <summary>emberimp.keepMaxM</summary>
        public const float EmberImpKeepMaxM = 5.5f;
        /// <summary>emberimp.fireball.cd</summary>
        public const float EmberImpFireballCd = 2.4f;
        /// <summary>emberimp.fireball.aimS</summary>
        public const float EmberImpFireballAimS = 0.5f;
        /// <summary>emberimp.fireball.speedM</summary>
        public const float EmberImpFireballSpeedM = 5.5f;
        /// <summary>emberimp.fireball.radiusM</summary>
        public const float EmberImpFireballRadiusM = 0.24f;
        /// <summary>emberimp.fireball.mult</summary>
        public const float EmberImpFireballMult = 1f;
        /// <summary>emberimp.fireball.lifeS</summary>
        public const float EmberImpFireballLifeS = 3f;
        /// <summary>frostslime.hp</summary>
        public const float FrostSlimeHp = 60f;
        /// <summary>frostslime.atk</summary>
        public const float FrostSlimeAtk = 8f;
        /// <summary>frostslime.def</summary>
        public const float FrostSlimeDef = 2f;
        /// <summary>frostslime.speed</summary>
        public const float FrostSlimeSpeed = 1.6f;
        /// <summary>frostslime.bodyRadius</summary>
        public const float FrostSlimeBodyRadius = 0.34f;
        /// <summary>frostslime.hop.cd</summary>
        public const float FrostSlimeHopCd = 1.1f;
        /// <summary>frostslime.hop.dur</summary>
        public const float FrostSlimeHopDur = 0.45f;
        /// <summary>frostslime.hop.speedM</summary>
        public const float FrostSlimeHopSpeedM = 3.6f;
        /// <summary>frostslime.split.count</summary>
        public const float FrostSlimeSplitCount = 2f;
        /// <summary>frostslime.split.hpMult</summary>
        public const float FrostSlimeSplitHpMult = 0.4f;
        /// <summary>frostslime.split.radiusMult</summary>
        public const float FrostSlimeSplitRadiusMult = 0.62f;
        /// <summary>frostslime.contactCd</summary>
        public const float FrostSlimeContactCd = 0.9f;
        /// <summary>sparklizard.hp</summary>
        public const float SparkLizardHp = 26f;
        /// <summary>sparklizard.atk</summary>
        public const float SparkLizardAtk = 10f;
        /// <summary>sparklizard.def</summary>
        public const float SparkLizardDef = 0f;
        /// <summary>sparklizard.speed</summary>
        public const float SparkLizardSpeed = 3f;
        /// <summary>sparklizard.bodyRadius</summary>
        public const float SparkLizardBodyRadius = 0.24f;
        /// <summary>sparklizard.dash.cd</summary>
        public const float SparkLizardDashCd = 2.2f;
        /// <summary>sparklizard.dash.telegraphS</summary>
        public const float SparkLizardDashTelegraphS = 0.35f;
        /// <summary>sparklizard.dash.speedM</summary>
        public const float SparkLizardDashSpeedM = 9f;
        /// <summary>sparklizard.dash.dur</summary>
        public const float SparkLizardDashDur = 0.35f;
        /// <summary>sparklizard.contactCd</summary>
        public const float SparkLizardContactCd = 0.8f;
        /// <summary>toxintoad.hp</summary>
        public const float ToxinToadHp = 55f;
        /// <summary>toxintoad.atk</summary>
        public const float ToxinToadAtk = 9f;
        /// <summary>toxintoad.def</summary>
        public const float ToxinToadDef = 1f;
        /// <summary>toxintoad.speed</summary>
        public const float ToxinToadSpeed = 1.2f;
        /// <summary>toxintoad.bodyRadius</summary>
        public const float ToxinToadBodyRadius = 0.34f;
        /// <summary>toxintoad.lob.cd</summary>
        public const float ToxinToadLobCd = 3.2f;
        /// <summary>toxintoad.lob.aimS</summary>
        public const float ToxinToadLobAimS = 0.45f;
        /// <summary>toxintoad.lob.rangeM</summary>
        public const float ToxinToadLobRangeM = 6f;
        /// <summary>toxintoad.lob.zoneRadiusM</summary>
        public const float ToxinToadLobZoneRadiusM = 1.1f;
        /// <summary>toxintoad.lob.zoneLifeS</summary>
        public const float ToxinToadLobZoneLifeS = 3f;
        /// <summary>toxintoad.lob.tickS</summary>
        public const float ToxinToadLobTickS = 0.5f;
        /// <summary>toxintoad.lob.mult</summary>
        public const float ToxinToadLobMult = 0.5f;
        /// <summary>toxintoad.hop.cd</summary>
        public const float ToxinToadHopCd = 1.4f;
        /// <summary>toxintoad.hop.dur</summary>
        public const float ToxinToadHopDur = 0.5f;
        /// <summary>toxintoad.hop.speedM</summary>
        public const float ToxinToadHopSpeedM = 2.6f;
        /// <summary>toxintoad.contactCd</summary>
        public const float ToxinToadContactCd = 0.9f;
        /// <summary>stardustsprite.hp</summary>
        public const float StardustSpriteHp = 20f;
        /// <summary>stardustsprite.atk</summary>
        public const float StardustSpriteAtk = 0f;
        /// <summary>stardustsprite.def</summary>
        public const float StardustSpriteDef = 0f;
        /// <summary>stardustsprite.speed</summary>
        public const float StardustSpriteSpeed = 4.4f;
        /// <summary>stardustsprite.bodyRadius</summary>
        public const float StardustSpriteBodyRadius = 0.22f;
        /// <summary>stardustsprite.lifeS</summary>
        public const float StardustSpriteLifeS = 9f;
        /// <summary>stardustsprite.bonusMin</summary>
        public const float StardustSpriteBonusMin = 40f;
        /// <summary>stardustsprite.bonusMax</summary>
        public const float StardustSpriteBonusMax = 80f;
        /// <summary>snowpuff.hp</summary>
        public const float SnowPuffHp = 30f;
        /// <summary>snowpuff.atk</summary>
        public const float SnowPuffAtk = 9f;
        /// <summary>snowpuff.def</summary>
        public const float SnowPuffDef = 0f;
        /// <summary>snowpuff.speed</summary>
        public const float SnowPuffSpeed = 3.2f;
        /// <summary>snowpuff.bodyRadius</summary>
        public const float SnowPuffBodyRadius = 0.26f;
        /// <summary>snowpuff.roll.cd</summary>
        public const float SnowPuffRollCd = 1.6f;
        /// <summary>snowpuff.roll.dur</summary>
        public const float SnowPuffRollDur = 0.6f;
        /// <summary>snowpuff.roll.speedM</summary>
        public const float SnowPuffRollSpeedM = 5f;
        /// <summary>snowpuff.contactCd</summary>
        public const float SnowPuffContactCd = 0.8f;
        /// <summary>iceturtle.hp</summary>
        public const float IceTurtleHp = 110f;
        /// <summary>iceturtle.atk</summary>
        public const float IceTurtleAtk = 12f;
        /// <summary>iceturtle.def</summary>
        public const float IceTurtleDef = 4f;
        /// <summary>iceturtle.speed</summary>
        public const float IceTurtleSpeed = 1f;
        /// <summary>iceturtle.bodyRadius</summary>
        public const float IceTurtleBodyRadius = 0.4f;
        /// <summary>iceturtle.spin.cd</summary>
        public const float IceTurtleSpinCd = 3.5f;
        /// <summary>iceturtle.spin.telegraphS</summary>
        public const float IceTurtleSpinTelegraphS = 0.6f;
        /// <summary>iceturtle.spin.dur</summary>
        public const float IceTurtleSpinDur = 1f;
        /// <summary>iceturtle.spin.speedM</summary>
        public const float IceTurtleSpinSpeedM = 4.5f;
        /// <summary>iceturtle.frontDR</summary>
        public const float IceTurtleFrontDR = 0.5f;
        /// <summary>iceturtle.contactCd</summary>
        public const float IceTurtleContactCd = 0.9f;
        /// <summary>blizzardhawk.hp</summary>
        public const float BlizzardHawkHp = 34f;
        /// <summary>blizzardhawk.atk</summary>
        public const float BlizzardHawkAtk = 11f;
        /// <summary>blizzardhawk.def</summary>
        public const float BlizzardHawkDef = 0f;
        /// <summary>blizzardhawk.speed</summary>
        public const float BlizzardHawkSpeed = 3.4f;
        /// <summary>blizzardhawk.bodyRadius</summary>
        public const float BlizzardHawkBodyRadius = 0.26f;
        /// <summary>blizzardhawk.dive.cd</summary>
        public const float BlizzardHawkDiveCd = 2.6f;
        /// <summary>blizzardhawk.dive.telegraphS</summary>
        public const float BlizzardHawkDiveTelegraphS = 0.45f;
        /// <summary>blizzardhawk.dive.speedM</summary>
        public const float BlizzardHawkDiveSpeedM = 10f;
        /// <summary>blizzardhawk.dive.dur</summary>
        public const float BlizzardHawkDiveDur = 0.4f;
        /// <summary>blizzardhawk.contactCd</summary>
        public const float BlizzardHawkContactCd = 0.8f;
        /// <summary>frostmage.hp</summary>
        public const float FrostMageHp = 40f;
        /// <summary>frostmage.atk</summary>
        public const float FrostMageAtk = 10f;
        /// <summary>frostmage.def</summary>
        public const float FrostMageDef = 1f;
        /// <summary>frostmage.speed</summary>
        public const float FrostMageSpeed = 2.2f;
        /// <summary>frostmage.bodyRadius</summary>
        public const float FrostMageBodyRadius = 0.28f;
        /// <summary>frostmage.keepMinM</summary>
        public const float FrostMageKeepMinM = 3.5f;
        /// <summary>frostmage.keepMaxM</summary>
        public const float FrostMageKeepMaxM = 6f;
        /// <summary>frostmage.bolt.cd</summary>
        public const float FrostMageBoltCd = 2.8f;
        /// <summary>frostmage.bolt.aimS</summary>
        public const float FrostMageBoltAimS = 0.55f;
        /// <summary>frostmage.bolt.speedM</summary>
        public const float FrostMageBoltSpeedM = 6f;
        /// <summary>frostmage.bolt.radiusM</summary>
        public const float FrostMageBoltRadiusM = 0.22f;
        /// <summary>frostmage.bolt.mult</summary>
        public const float FrostMageBoltMult = 1f;
        /// <summary>frostmage.bolt.lifeS</summary>
        public const float FrostMageBoltLifeS = 2.5f;
        /// <summary>icespike.hp</summary>
        public const float IceSpikeHp = 30f;
        /// <summary>icespike.atk</summary>
        public const float IceSpikeAtk = 9f;
        /// <summary>icespike.def</summary>
        public const float IceSpikeDef = 0f;
        /// <summary>icespike.speed</summary>
        public const float IceSpikeSpeed = 0f;
        /// <summary>icespike.bodyRadius</summary>
        public const float IceSpikeBodyRadius = 0.35f;
        /// <summary>icespike.spike.telegraphS</summary>
        public const float IceSpikeSpikeTelegraphS = 0.8f;
        /// <summary>icespike.spike.radiusM</summary>
        public const float IceSpikeSpikeRadiusM = 0.9f;
        /// <summary>icespike.spike.mult</summary>
        public const float IceSpikeSpikeMult = 1.1f;
        /// <summary>icespike.spike.cdS</summary>
        public const float IceSpikeSpikeCdS = 2.6f;
        /// <summary>icespike.spike.rangeM</summary>
        public const float IceSpikeSpikeRangeM = 8f;
        /// <summary>iceglider.hp</summary>
        public const float IceGliderHp = 55f;
        /// <summary>iceglider.atk</summary>
        public const float IceGliderAtk = 11f;
        /// <summary>iceglider.def</summary>
        public const float IceGliderDef = 1f;
        /// <summary>iceglider.speed</summary>
        public const float IceGliderSpeed = 4.6f;
        /// <summary>iceglider.bodyRadius</summary>
        public const float IceGliderBodyRadius = 0.4f;
        /// <summary>iceglider.glide.turnRadPerS</summary>
        public const float IceGliderGlideTurnRadPerS = 1.6f;
        /// <summary>iceglider.glide.contactCd</summary>
        public const float IceGliderGlideContactCd = 0.8f;
        /// <summary>boss_velsha.hp</summary>
        public const float BossVelshaHp = 5200f;
        /// <summary>boss_velsha.atk</summary>
        public const float BossVelshaAtk = 16f;
        /// <summary>boss_velsha.def</summary>
        public const float BossVelshaDef = 3f;
        /// <summary>boss_velsha.speed</summary>
        public const float BossVelshaSpeed = 2f;
        /// <summary>boss_velsha.bodyRadius</summary>
        public const float BossVelshaBodyRadius = 0.55f;
        /// <summary>boss_velsha.phase2At</summary>
        public const float BossVelshaPhase2At = 0.65f;
        /// <summary>boss_velsha.phase3At</summary>
        public const float BossVelshaPhase3At = 0.3f;
        /// <summary>boss_velsha.volley.cd</summary>
        public const float BossVelshaVolleyCd = 3.2f;
        /// <summary>boss_velsha.volley.count</summary>
        public const float BossVelshaVolleyCount = 8f;
        /// <summary>boss_velsha.volley.speedM</summary>
        public const float BossVelshaVolleySpeedM = 5.5f;
        /// <summary>boss_velsha.volley.radiusM</summary>
        public const float BossVelshaVolleyRadiusM = 0.2f;
        /// <summary>boss_velsha.volley.mult</summary>
        public const float BossVelshaVolleyMult = 0.9f;
        /// <summary>boss_velsha.volley.lifeS</summary>
        public const float BossVelshaVolleyLifeS = 3f;
        /// <summary>boss_velsha.blizzard.cd</summary>
        public const float BossVelshaBlizzardCd = 4f;
        /// <summary>boss_velsha.blizzard.count</summary>
        public const float BossVelshaBlizzardCount = 3f;
        /// <summary>boss_velsha.blizzard.radiusM</summary>
        public const float BossVelshaBlizzardRadiusM = 1.3f;
        /// <summary>boss_velsha.blizzard.telegraphS</summary>
        public const float BossVelshaBlizzardTelegraphS = 0.9f;
        /// <summary>boss_velsha.blizzard.mult</summary>
        public const float BossVelshaBlizzardMult = 1.2f;
        /// <summary>boss_velsha.blizzard.zoneLifeS</summary>
        public const float BossVelshaBlizzardZoneLifeS = 2.5f;
        /// <summary>boss_velsha.blizzard.tickS</summary>
        public const float BossVelshaBlizzardTickS = 0.5f;
        /// <summary>boss_velsha.blizzard.zoneMult</summary>
        public const float BossVelshaBlizzardZoneMult = 0.4f;
        /// <summary>boss_velsha.summon.cd</summary>
        public const float BossVelshaSummonCd = 8f;
        /// <summary>boss_velsha.summon.count</summary>
        public const float BossVelshaSummonCount = 2f;
        /// <summary>boss_velsha.charge.cd</summary>
        public const float BossVelshaChargeCd = 5f;
        /// <summary>boss_velsha.charge.telegraphS</summary>
        public const float BossVelshaChargeTelegraphS = 0.6f;
        /// <summary>boss_velsha.charge.speedM</summary>
        public const float BossVelshaChargeSpeedM = 9f;
        /// <summary>boss_velsha.charge.dur</summary>
        public const float BossVelshaChargeDur = 0.5f;
        /// <summary>cinderrat.hp</summary>
        public const float CinderRatHp = 26f;
        /// <summary>cinderrat.atk</summary>
        public const float CinderRatAtk = 10f;
        /// <summary>cinderrat.def</summary>
        public const float CinderRatDef = 0f;
        /// <summary>cinderrat.speed</summary>
        public const float CinderRatSpeed = 3.8f;
        /// <summary>cinderrat.bodyRadius</summary>
        public const float CinderRatBodyRadius = 0.22f;
        /// <summary>cinderrat.contactCd</summary>
        public const float CinderRatContactCd = 0.7f;
        /// <summary>dunebeetle.hp</summary>
        public const float DuneBeetleHp = 80f;
        /// <summary>dunebeetle.atk</summary>
        public const float DuneBeetleAtk = 13f;
        /// <summary>dunebeetle.def</summary>
        public const float DuneBeetleDef = 3f;
        /// <summary>dunebeetle.speed</summary>
        public const float DuneBeetleSpeed = 1.4f;
        /// <summary>dunebeetle.bodyRadius</summary>
        public const float DuneBeetleBodyRadius = 0.36f;
        /// <summary>dunebeetle.burrow.underSpeedM</summary>
        public const float DuneBeetleBurrowUnderSpeedM = 3.2f;
        /// <summary>dunebeetle.burrow.telegraphS</summary>
        public const float DuneBeetleBurrowTelegraphS = 0.7f;
        /// <summary>dunebeetle.burrow.emergeRadiusM</summary>
        public const float DuneBeetleBurrowEmergeRadiusM = 1.2f;
        /// <summary>dunebeetle.burrow.emergeMult</summary>
        public const float DuneBeetleBurrowEmergeMult = 1.3f;
        /// <summary>dunebeetle.burrow.surfaceS</summary>
        public const float DuneBeetleBurrowSurfaceS = 2.2f;
        /// <summary>dunebeetle.contactCd</summary>
        public const float DuneBeetleContactCd = 0.9f;
        /// <summary>flamedancer.hp</summary>
        public const float FlameDancerHp = 38f;
        /// <summary>flamedancer.atk</summary>
        public const float FlameDancerAtk = 11f;
        /// <summary>flamedancer.def</summary>
        public const float FlameDancerDef = 0f;
        /// <summary>flamedancer.speed</summary>
        public const float FlameDancerSpeed = 2.4f;
        /// <summary>flamedancer.bodyRadius</summary>
        public const float FlameDancerBodyRadius = 0.26f;
        /// <summary>flamedancer.keepMinM</summary>
        public const float FlameDancerKeepMinM = 3f;
        /// <summary>flamedancer.keepMaxM</summary>
        public const float FlameDancerKeepMaxM = 5.5f;
        /// <summary>flamedancer.hopM</summary>
        public const float FlameDancerHopM = 2f;
        /// <summary>flamedancer.twinshot.cd</summary>
        public const float FlameDancerTwinshotCd = 2.6f;
        /// <summary>flamedancer.twinshot.aimS</summary>
        public const float FlameDancerTwinshotAimS = 0.45f;
        /// <summary>flamedancer.twinshot.speedM</summary>
        public const float FlameDancerTwinshotSpeedM = 6.5f;
        /// <summary>flamedancer.twinshot.radiusM</summary>
        public const float FlameDancerTwinshotRadiusM = 0.2f;
        /// <summary>flamedancer.twinshot.mult</summary>
        public const float FlameDancerTwinshotMult = 0.9f;
        /// <summary>flamedancer.twinshot.lifeS</summary>
        public const float FlameDancerTwinshotLifeS = 2.2f;
        /// <summary>flamedancer.twinshot.spreadDeg</summary>
        public const float FlameDancerTwinshotSpreadDeg = 14f;
        /// <summary>duststinger.hp</summary>
        public const float DustStingerHp = 60f;
        /// <summary>duststinger.atk</summary>
        public const float DustStingerAtk = 10f;
        /// <summary>duststinger.def</summary>
        public const float DustStingerDef = 2f;
        /// <summary>duststinger.speed</summary>
        public const float DustStingerSpeed = 1.6f;
        /// <summary>duststinger.bodyRadius</summary>
        public const float DustStingerBodyRadius = 0.32f;
        /// <summary>duststinger.lob.cd</summary>
        public const float DustStingerLobCd = 3f;
        /// <summary>duststinger.lob.aimS</summary>
        public const float DustStingerLobAimS = 0.5f;
        /// <summary>duststinger.lob.rangeM</summary>
        public const float DustStingerLobRangeM = 5.5f;
        /// <summary>duststinger.lob.zoneRadiusM</summary>
        public const float DustStingerLobZoneRadiusM = 1f;
        /// <summary>duststinger.lob.zoneLifeS</summary>
        public const float DustStingerLobZoneLifeS = 2.8f;
        /// <summary>duststinger.lob.tickS</summary>
        public const float DustStingerLobTickS = 0.5f;
        /// <summary>duststinger.lob.mult</summary>
        public const float DustStingerLobMult = 0.5f;
        /// <summary>duststinger.hop.cd</summary>
        public const float DustStingerHopCd = 1.2f;
        /// <summary>duststinger.hop.dur</summary>
        public const float DustStingerHopDur = 0.45f;
        /// <summary>duststinger.hop.speedM</summary>
        public const float DustStingerHopSpeedM = 2.8f;
        /// <summary>duststinger.contactCd</summary>
        public const float DustStingerContactCd = 0.9f;
        /// <summary>mirageblossom.hp</summary>
        public const float MirageBlossomHp = 45f;
        /// <summary>mirageblossom.atk</summary>
        public const float MirageBlossomAtk = 10f;
        /// <summary>mirageblossom.def</summary>
        public const float MirageBlossomDef = 2f;
        /// <summary>mirageblossom.speed</summary>
        public const float MirageBlossomSpeed = 0f;
        /// <summary>mirageblossom.bodyRadius</summary>
        public const float MirageBlossomBodyRadius = 0.38f;
        /// <summary>mirageblossom.burst.triggerM</summary>
        public const float MirageBlossomBurstTriggerM = 3.2f;
        /// <summary>mirageblossom.burst.firstDelayS</summary>
        public const float MirageBlossomBurstFirstDelayS = 0.35f;
        /// <summary>mirageblossom.burst.count</summary>
        public const float MirageBlossomBurstCount = 8f;
        /// <summary>mirageblossom.burst.speedM</summary>
        public const float MirageBlossomBurstSpeedM = 5.2f;
        /// <summary>mirageblossom.burst.radiusM</summary>
        public const float MirageBlossomBurstRadiusM = 0.28f;
        /// <summary>mirageblossom.burst.lifeS</summary>
        public const float MirageBlossomBurstLifeS = 1.2f;
        /// <summary>mirageblossom.burst.mult</summary>
        public const float MirageBlossomBurstMult = 0.7f;
        /// <summary>mirageblossom.burst.cdS</summary>
        public const float MirageBlossomBurstCdS = 3.4f;
        /// <summary>emberwhirl.hp</summary>
        public const float EmberWhirlHp = 60f;
        /// <summary>emberwhirl.atk</summary>
        public const float EmberWhirlAtk = 12f;
        /// <summary>emberwhirl.def</summary>
        public const float EmberWhirlDef = 1f;
        /// <summary>emberwhirl.speed</summary>
        public const float EmberWhirlSpeed = 2.4f;
        /// <summary>emberwhirl.bodyRadius</summary>
        public const float EmberWhirlBodyRadius = 0.4f;
        /// <summary>emberwhirl.rush.telegraphS</summary>
        public const float EmberWhirlRushTelegraphS = 0.6f;
        /// <summary>emberwhirl.rush.speedM</summary>
        public const float EmberWhirlRushSpeedM = 7f;
        /// <summary>emberwhirl.rush.durS</summary>
        public const float EmberWhirlRushDurS = 0.9f;
        /// <summary>emberwhirl.rush.trailIntervalS</summary>
        public const float EmberWhirlRushTrailIntervalS = 0.18f;
        /// <summary>emberwhirl.rush.trailRadiusM</summary>
        public const float EmberWhirlRushTrailRadiusM = 0.55f;
        /// <summary>emberwhirl.rush.trailLifeS</summary>
        public const float EmberWhirlRushTrailLifeS = 1.8f;
        /// <summary>emberwhirl.rush.trailMult</summary>
        public const float EmberWhirlRushTrailMult = 0.25f;
        /// <summary>emberwhirl.rush.cdS</summary>
        public const float EmberWhirlRushCdS = 4.2f;
        /// <summary>emberwhirl.rush.recoverS</summary>
        public const float EmberWhirlRushRecoverS = 0.8f;
        /// <summary>boss_kazra.hp</summary>
        public const float BossKazraHp = 6400f;
        /// <summary>boss_kazra.atk</summary>
        public const float BossKazraAtk = 18f;
        /// <summary>boss_kazra.def</summary>
        public const float BossKazraDef = 4f;
        /// <summary>boss_kazra.speed</summary>
        public const float BossKazraSpeed = 2.2f;
        /// <summary>boss_kazra.bodyRadius</summary>
        public const float BossKazraBodyRadius = 0.6f;
        /// <summary>boss_kazra.phase2At</summary>
        public const float BossKazraPhase2At = 0.65f;
        /// <summary>boss_kazra.phase3At</summary>
        public const float BossKazraPhase3At = 0.3f;
        /// <summary>boss_kazra.volley.cd</summary>
        public const float BossKazraVolleyCd = 2.8f;
        /// <summary>boss_kazra.volley.count</summary>
        public const float BossKazraVolleyCount = 3f;
        /// <summary>boss_kazra.volley.spreadDeg</summary>
        public const float BossKazraVolleySpreadDeg = 20f;
        /// <summary>boss_kazra.volley.speedM</summary>
        public const float BossKazraVolleySpeedM = 6f;
        /// <summary>boss_kazra.volley.radiusM</summary>
        public const float BossKazraVolleyRadiusM = 0.22f;
        /// <summary>boss_kazra.volley.mult</summary>
        public const float BossKazraVolleyMult = 1f;
        /// <summary>boss_kazra.volley.lifeS</summary>
        public const float BossKazraVolleyLifeS = 2.8f;
        /// <summary>boss_kazra.burrow.cd</summary>
        public const float BossKazraBurrowCd = 7f;
        /// <summary>boss_kazra.burrow.dives</summary>
        public const float BossKazraBurrowDives = 2f;
        /// <summary>boss_kazra.burrow.telegraphS</summary>
        public const float BossKazraBurrowTelegraphS = 0.8f;
        /// <summary>boss_kazra.burrow.radiusM</summary>
        public const float BossKazraBurrowRadiusM = 1.5f;
        /// <summary>boss_kazra.burrow.mult</summary>
        public const float BossKazraBurrowMult = 1.4f;
        /// <summary>boss_kazra.summon.cd</summary>
        public const float BossKazraSummonCd = 9f;
        /// <summary>boss_kazra.summon.count</summary>
        public const float BossKazraSummonCount = 3f;
        /// <summary>boss_kazra.trail.intervalS</summary>
        public const float BossKazraTrailIntervalS = 0.5f;
        /// <summary>boss_kazra.trail.radiusM</summary>
        public const float BossKazraTrailRadiusM = 0.9f;
        /// <summary>boss_kazra.trail.lifeS</summary>
        public const float BossKazraTrailLifeS = 1.6f;
        /// <summary>boss_kazra.trail.tickS</summary>
        public const float BossKazraTrailTickS = 0.5f;
        /// <summary>boss_kazra.trail.mult</summary>
        public const float BossKazraTrailMult = 0.35f;
        /// <summary>boss_kazra.contactCd</summary>
        public const float BossKazraContactCd = 0.8f;
        /// <summary>midboss_mossstag.hp</summary>
        public const float MidBossMossstagHp = 1500f;
        /// <summary>midboss_mossstag.atk</summary>
        public const float MidBossMossstagAtk = 12f;
        /// <summary>midboss_mossstag.def</summary>
        public const float MidBossMossstagDef = 4f;
        /// <summary>midboss_mossstag.speed</summary>
        public const float MidBossMossstagSpeed = 1.5f;
        /// <summary>midboss_mossstag.bodyRadius</summary>
        public const float MidBossMossstagBodyRadius = 0.55f;
        /// <summary>midboss_mossstag.stalkM</summary>
        public const float MidBossMossstagStalkM = 4.6f;
        /// <summary>midboss_mossstag.charge.telegraphS</summary>
        public const float MidBossMossstagChargeTelegraphS = 0.75f;
        /// <summary>midboss_mossstag.charge.speedM</summary>
        public const float MidBossMossstagChargeSpeedM = 6.4f;
        /// <summary>midboss_mossstag.charge.durS</summary>
        public const float MidBossMossstagChargeDurS = 0.85f;
        /// <summary>midboss_mossstag.charge.recoverS</summary>
        public const float MidBossMossstagChargeRecoverS = 1.2f;
        /// <summary>midboss_mossstag.charge.mult</summary>
        public const float MidBossMossstagChargeMult = 1.15f;
        /// <summary>midboss_mossstag.charge.cdS</summary>
        public const float MidBossMossstagChargeCdS = 3.6f;
        /// <summary>midboss_mossstag.charge.wallStunS</summary>
        public const float MidBossMossstagChargeWallStunS = 2.2f;
        /// <summary>midboss_mossstag.charge.laneM</summary>
        public const float MidBossMossstagChargeLaneM = 7f;
        /// <summary>midboss_mossstag.volley.telegraphS</summary>
        public const float MidBossMossstagVolleyTelegraphS = 0.55f;
        /// <summary>midboss_mossstag.volley.count</summary>
        public const float MidBossMossstagVolleyCount = 5f;
        /// <summary>midboss_mossstag.volley.spreadDeg</summary>
        public const float MidBossMossstagVolleySpreadDeg = 36f;
        /// <summary>midboss_mossstag.volley.speedM</summary>
        public const float MidBossMossstagVolleySpeedM = 4.4f;
        /// <summary>midboss_mossstag.volley.lifeS</summary>
        public const float MidBossMossstagVolleyLifeS = 1.5f;
        /// <summary>midboss_mossstag.volley.radiusM</summary>
        public const float MidBossMossstagVolleyRadiusM = 0.34f;
        /// <summary>midboss_mossstag.volley.mult</summary>
        public const float MidBossMossstagVolleyMult = 0.8f;
        /// <summary>midboss_mossstag.volley.cdS</summary>
        public const float MidBossMossstagVolleyCdS = 4.4f;
        /// <summary>midboss_mossstag.spore.radiusM</summary>
        public const float MidBossMossstagSporeRadiusM = 1f;
        /// <summary>midboss_mossstag.spore.lifeS</summary>
        public const float MidBossMossstagSporeLifeS = 3.2f;
        /// <summary>midboss_mossstag.spore.intervalS</summary>
        public const float MidBossMossstagSporeIntervalS = 0.6f;
        /// <summary>midboss_mossstag.spore.mult</summary>
        public const float MidBossMossstagSporeMult = 0.3f;
        /// <summary>midboss_mossstag.phase2At</summary>
        public const float MidBossMossstagPhase2At = 0.5f;
        /// <summary>midboss_mossstag.enrageSpeedMul</summary>
        public const float MidBossMossstagEnrageSpeedMul = 1.25f;
        /// <summary>midboss_mossstag.enrageVolleyAdd</summary>
        public const float MidBossMossstagEnrageVolleyAdd = 2f;
        /// <summary>midboss_mossstag.runeDrop</summary>
        public const float MidBossMossstagRuneDrop = 1f;
        /// <summary>midboss_frosthuntress.hp</summary>
        public const float MidBossFrosthuntressHp = 1550f;
        /// <summary>midboss_frosthuntress.atk</summary>
        public const float MidBossFrosthuntressAtk = 13f;
        /// <summary>midboss_frosthuntress.def</summary>
        public const float MidBossFrosthuntressDef = 3f;
        /// <summary>midboss_frosthuntress.speed</summary>
        public const float MidBossFrosthuntressSpeed = 2.9f;
        /// <summary>midboss_frosthuntress.bodyRadius</summary>
        public const float MidBossFrosthuntressBodyRadius = 0.42f;
        /// <summary>midboss_frosthuntress.kiteM</summary>
        public const float MidBossFrosthuntressKiteM = 5.2f;
        /// <summary>midboss_frosthuntress.blink.telegraphS</summary>
        public const float MidBossFrosthuntressBlinkTelegraphS = 0.35f;
        /// <summary>midboss_frosthuntress.blink.rangeM</summary>
        public const float MidBossFrosthuntressBlinkRangeM = 4f;
        /// <summary>midboss_frosthuntress.blink.cdS</summary>
        public const float MidBossFrosthuntressBlinkCdS = 4.6f;
        /// <summary>midboss_frosthuntress.arrows.count</summary>
        public const float MidBossFrosthuntressArrowsCount = 3f;
        /// <summary>midboss_frosthuntress.arrows.intervalS</summary>
        public const float MidBossFrosthuntressArrowsIntervalS = 0.16f;
        /// <summary>midboss_frosthuntress.arrows.speedM</summary>
        public const float MidBossFrosthuntressArrowsSpeedM = 7.5f;
        /// <summary>midboss_frosthuntress.arrows.lifeS</summary>
        public const float MidBossFrosthuntressArrowsLifeS = 1.4f;
        /// <summary>midboss_frosthuntress.arrows.radiusM</summary>
        public const float MidBossFrosthuntressArrowsRadiusM = 0.3f;
        /// <summary>midboss_frosthuntress.arrows.mult</summary>
        public const float MidBossFrosthuntressArrowsMult = 0.7f;
        /// <summary>midboss_frosthuntress.traps.telegraphS</summary>
        public const float MidBossFrosthuntressTrapsTelegraphS = 0.75f;
        /// <summary>midboss_frosthuntress.traps.count</summary>
        public const float MidBossFrosthuntressTrapsCount = 3f;
        /// <summary>midboss_frosthuntress.traps.ringM</summary>
        public const float MidBossFrosthuntressTrapsRingM = 1.8f;
        /// <summary>midboss_frosthuntress.traps.radiusM</summary>
        public const float MidBossFrosthuntressTrapsRadiusM = 0.85f;
        /// <summary>midboss_frosthuntress.traps.mult</summary>
        public const float MidBossFrosthuntressTrapsMult = 0.9f;
        /// <summary>midboss_frosthuntress.traps.stepS</summary>
        public const float MidBossFrosthuntressTrapsStepS = 0.12f;
        /// <summary>midboss_frosthuntress.traps.cdS</summary>
        public const float MidBossFrosthuntressTrapsCdS = 7f;
        /// <summary>midboss_frosthuntress.mark.channelS</summary>
        public const float MidBossFrosthuntressMarkChannelS = 1.5f;
        /// <summary>midboss_frosthuntress.mark.segments</summary>
        public const float MidBossFrosthuntressMarkSegments = 6f;
        /// <summary>midboss_frosthuntress.mark.stepM</summary>
        public const float MidBossFrosthuntressMarkStepM = 1.2f;
        /// <summary>midboss_frosthuntress.mark.radiusM</summary>
        public const float MidBossFrosthuntressMarkRadiusM = 0.55f;
        /// <summary>midboss_frosthuntress.mark.mult</summary>
        public const float MidBossFrosthuntressMarkMult = 1.4f;
        /// <summary>midboss_frosthuntress.mark.rippleS</summary>
        public const float MidBossFrosthuntressMarkRippleS = 0.06f;
        /// <summary>midboss_frosthuntress.mark.interruptStunS</summary>
        public const float MidBossFrosthuntressMarkInterruptStunS = 1.8f;
        /// <summary>midboss_frosthuntress.mark.cdS</summary>
        public const float MidBossFrosthuntressMarkCdS = 11f;
        /// <summary>midboss_frosthuntress.phase2At</summary>
        public const float MidBossFrosthuntressPhase2At = 0.5f;
        /// <summary>midboss_frosthuntress.enrageArrowAdd</summary>
        public const float MidBossFrosthuntressEnrageArrowAdd = 1f;
        /// <summary>midboss_frosthuntress.enrageTrapAdd</summary>
        public const float MidBossFrosthuntressEnrageTrapAdd = 1f;
        /// <summary>midboss_frosthuntress.enrageSpeedMul</summary>
        public const float MidBossFrosthuntressEnrageSpeedMul = 1.15f;
        /// <summary>midboss_frosthuntress.enrageCdMul</summary>
        public const float MidBossFrosthuntressEnrageCdMul = 0.85f;
        /// <summary>midboss_frosthuntress.runeDrop</summary>
        public const float MidBossFrosthuntressRuneDrop = 1f;
        /// <summary>midboss_sandreaper.hp</summary>
        public const float MidBossSandreaperHp = 1650f;
        /// <summary>midboss_sandreaper.atk</summary>
        public const float MidBossSandreaperAtk = 14f;
        /// <summary>midboss_sandreaper.def</summary>
        public const float MidBossSandreaperDef = 5f;
        /// <summary>midboss_sandreaper.speed</summary>
        public const float MidBossSandreaperSpeed = 2.2f;
        /// <summary>midboss_sandreaper.bodyRadius</summary>
        public const float MidBossSandreaperBodyRadius = 0.5f;
        /// <summary>midboss_sandreaper.stalkM</summary>
        public const float MidBossSandreaperStalkM = 3.4f;
        /// <summary>midboss_sandreaper.hook.telegraphS</summary>
        public const float MidBossSandreaperHookTelegraphS = 0.5f;
        /// <summary>midboss_sandreaper.hook.speedM</summary>
        public const float MidBossSandreaperHookSpeedM = 10f;
        /// <summary>midboss_sandreaper.hook.rangeM</summary>
        public const float MidBossSandreaperHookRangeM = 7f;
        /// <summary>midboss_sandreaper.hook.radiusM</summary>
        public const float MidBossSandreaperHookRadiusM = 0.4f;
        /// <summary>midboss_sandreaper.hook.mult</summary>
        public const float MidBossSandreaperHookMult = 0.6f;
        /// <summary>midboss_sandreaper.hook.pullV</summary>
        public const float MidBossSandreaperHookPullV = 420f;
        /// <summary>midboss_sandreaper.hook.cdS</summary>
        public const float MidBossSandreaperHookCdS = 5.4f;
        /// <summary>midboss_sandreaper.cleave.telegraphS</summary>
        public const float MidBossSandreaperCleaveTelegraphS = 0.85f;
        /// <summary>midboss_sandreaper.cleave.leapS</summary>
        public const float MidBossSandreaperCleaveLeapS = 0.3f;
        /// <summary>midboss_sandreaper.cleave.radiusM</summary>
        public const float MidBossSandreaperCleaveRadiusM = 1.5f;
        /// <summary>midboss_sandreaper.cleave.mult</summary>
        public const float MidBossSandreaperCleaveMult = 1.6f;
        /// <summary>midboss_sandreaper.cleave.missStunS</summary>
        public const float MidBossSandreaperCleaveMissStunS = 2f;
        /// <summary>midboss_sandreaper.cleave.hitStunS</summary>
        public const float MidBossSandreaperCleaveHitStunS = 0.7f;
        /// <summary>midboss_sandreaper.cleave.cdS</summary>
        public const float MidBossSandreaperCleaveCdS = 6.2f;
        /// <summary>midboss_sandreaper.storm.count</summary>
        public const float MidBossSandreaperStormCount = 3f;
        /// <summary>midboss_sandreaper.storm.ringM</summary>
        public const float MidBossSandreaperStormRingM = 2.6f;
        /// <summary>midboss_sandreaper.storm.radiusM</summary>
        public const float MidBossSandreaperStormRadiusM = 1.1f;
        /// <summary>midboss_sandreaper.storm.lifeS</summary>
        public const float MidBossSandreaperStormLifeS = 5f;
        /// <summary>midboss_sandreaper.storm.intervalS</summary>
        public const float MidBossSandreaperStormIntervalS = 0.5f;
        /// <summary>midboss_sandreaper.storm.mult</summary>
        public const float MidBossSandreaperStormMult = 0.35f;
        /// <summary>midboss_sandreaper.storm.cdS</summary>
        public const float MidBossSandreaperStormCdS = 9f;
        /// <summary>midboss_sandreaper.phase2At</summary>
        public const float MidBossSandreaperPhase2At = 0.5f;
        /// <summary>midboss_sandreaper.enrageHookSpeedMul</summary>
        public const float MidBossSandreaperEnrageHookSpeedMul = 1.25f;
        /// <summary>midboss_sandreaper.enrageStormAdd</summary>
        public const float MidBossSandreaperEnrageStormAdd = 1f;
        /// <summary>midboss_sandreaper.enrageSpeedMul</summary>
        public const float MidBossSandreaperEnrageSpeedMul = 1.15f;
        /// <summary>midboss_sandreaper.enrageCdMul</summary>
        public const float MidBossSandreaperEnrageCdMul = 0.85f;
        /// <summary>midboss_sandreaper.runeDrop</summary>
        public const float MidBossSandreaperRuneDrop = 1f;
        /// <summary>boss_nanmir.hp</summary>
        public const float BossNanmirHp = 4200f;
        /// <summary>boss_nanmir.atk</summary>
        public const float BossNanmirAtk = 18f;
        /// <summary>boss_nanmir.def</summary>
        public const float BossNanmirDef = 8f;
        /// <summary>boss_nanmir.speed</summary>
        public const float BossNanmirSpeed = 1.2f;
        /// <summary>boss_nanmir.bodyRadius</summary>
        public const float BossNanmirBodyRadius = 0.7f;
        /// <summary>boss_nanmir.phase2At</summary>
        public const float BossNanmirPhase2At = 0.65f;
        /// <summary>boss_nanmir.phase3At</summary>
        public const float BossNanmirPhase3At = 0.3f;
        /// <summary>boss_nanmir.staggerS</summary>
        public const float BossNanmirStaggerS = 2f;
        /// <summary>boss_nanmir.idleS</summary>
        public const float BossNanmirIdleS = 1.2f;
        /// <summary>boss_nanmir.sweep.telegraphS</summary>
        public const float BossNanmirSweepTelegraphS = 0.8f;
        /// <summary>boss_nanmir.sweep.radiusM</summary>
        public const float BossNanmirSweepRadiusM = 1.3f;
        /// <summary>boss_nanmir.sweep.rangeM</summary>
        public const float BossNanmirSweepRangeM = 2.4f;
        /// <summary>boss_nanmir.sweep.mult</summary>
        public const float BossNanmirSweepMult = 1.2f;
        /// <summary>boss_nanmir.rootline.telegraphS</summary>
        public const float BossNanmirRootlineTelegraphS = 0.5f;
        /// <summary>boss_nanmir.rootline.stepS</summary>
        public const float BossNanmirRootlineStepS = 0.08f;
        /// <summary>boss_nanmir.rootline.count</summary>
        public const float BossNanmirRootlineCount = 6f;
        /// <summary>boss_nanmir.rootline.spacingM</summary>
        public const float BossNanmirRootlineSpacingM = 1.1f;
        /// <summary>boss_nanmir.rootline.radiusM</summary>
        public const float BossNanmirRootlineRadiusM = 0.9f;
        /// <summary>boss_nanmir.rootline.mult</summary>
        public const float BossNanmirRootlineMult = 1f;
        /// <summary>boss_nanmir.spikegrid.telegraphS</summary>
        public const float BossNanmirSpikegridTelegraphS = 0.9f;
        /// <summary>boss_nanmir.spikegrid.count</summary>
        public const float BossNanmirSpikegridCount = 12f;
        /// <summary>boss_nanmir.spikegrid.spreadM</summary>
        public const float BossNanmirSpikegridSpreadM = 4.5f;
        /// <summary>boss_nanmir.spikegrid.radiusM</summary>
        public const float BossNanmirSpikegridRadiusM = 1f;
        /// <summary>boss_nanmir.spikegrid.mult</summary>
        public const float BossNanmirSpikegridMult = 1.1f;
        /// <summary>boss_nanmir.summonCount</summary>
        public const float BossNanmirSummonCount = 4f;
        /// <summary>boss_nanmir.storm.telegraphS</summary>
        public const float BossNanmirStormTelegraphS = 1f;
        /// <summary>boss_nanmir.storm.rings.0</summary>
        public const float BossNanmirStormRings0 = 1.6f;
        /// <summary>boss_nanmir.storm.rings.1</summary>
        public const float BossNanmirStormRings1 = 2.7f;
        /// <summary>boss_nanmir.storm.rings.2</summary>
        public const float BossNanmirStormRings2 = 3.8f;
        /// <summary>boss_nanmir.storm.perRing</summary>
        public const float BossNanmirStormPerRing = 10f;
        /// <summary>boss_nanmir.storm.gapLanes</summary>
        public const float BossNanmirStormGapLanes = 2f;
        /// <summary>boss_nanmir.storm.radiusM</summary>
        public const float BossNanmirStormRadiusM = 0.9f;
        /// <summary>boss_nanmir.storm.mult</summary>
        public const float BossNanmirStormMult = 1f;
        /// <summary>chapters.1.statMult</summary>
        public const float Ch1StatMult = 1f;
        /// <summary>chapters.1.lootMult</summary>
        public const float Ch1LootMult = 1f;
        /// <summary>chapters.1.lanternCost</summary>
        public const float Ch1LanternCost = 120f;
        /// <summary>chapters.1.unlockClears</summary>
        public const float Ch1UnlockClears = 0f;
        /// <summary>chapters.2.statMult</summary>
        public const float Ch2StatMult = 1.35f;
        /// <summary>chapters.2.lootMult</summary>
        public const float Ch2LootMult = 1.3f;
        /// <summary>chapters.2.lanternCost</summary>
        public const float Ch2LanternCost = 156f;
        /// <summary>chapters.2.unlockClears</summary>
        public const float Ch2UnlockClears = 1f;
        /// <summary>chapters.3.statMult</summary>
        public const float Ch3StatMult = 1.7f;
        /// <summary>chapters.3.lootMult</summary>
        public const float Ch3LootMult = 1.6f;
        /// <summary>chapters.3.lanternCost</summary>
        public const float Ch3LanternCost = 203f;
        /// <summary>chapters.3.unlockClears</summary>
        public const float Ch3UnlockClears = 2f;
        /// <summary>arena.widthM</summary>
        public const float ArenaWidthM = 28f;
        /// <summary>arena.heightM</summary>
        public const float ArenaHeightM = 16f;
        /// <summary>arena.dummyCount</summary>
        public const float ArenaDummyCount = 3f;
        /// <summary>arena.shroomTarget</summary>
        public const float ArenaShroomTarget = 8f;
        /// <summary>arena.beeTarget</summary>
        public const float ArenaBeeTarget = 5f;
        /// <summary>arena.wolfTarget</summary>
        public const float ArenaWolfTarget = 2f;
        /// <summary>arena.spawnInterval</summary>
        public const float ArenaSpawnInterval = 1.2f;
        /// <summary>tutorial.moveM</summary>
        public const float TutorialMoveM = 3f;
        /// <summary>tutorial.hintY</summary>
        public const float TutorialHintY = 0.86f;
        /// <summary>tutorial.saveSlots</summary>
        public const float TutorialSaveSlots = 3f;
        /// <summary>touch.aimRangeM</summary>
        public const float TouchAimRangeM = 11f;
        /// <summary>touch.aimStickyM</summary>
        public const float TouchAimStickyM = 3f;
        /// <summary>touch.aimLatchS</summary>
        public const float TouchAimLatchS = 0.5f;
        /// <summary>touch.shotReachFrac</summary>
        public const float TouchShotReachFrac = 0.7f;
        /// <summary>touch.autoAttackPadM</summary>
        public const float TouchAutoAttackPadM = 0.4f;
        /// <summary>touch.joyRadiusPx</summary>
        public const float TouchJoyRadiusPx = 56f;
        /// <summary>touch.joyDeadPx</summary>
        public const float TouchJoyDeadPx = 8f;
        /// <summary>touch.btnTouchPadPx</summary>
        public const float TouchBtnTouchPadPx = 14f;
        /// <summary>touch.safeMarginPx</summary>
        public const float TouchSafeMarginPx = 26f;
        /// <summary>touch.btnScale</summary>
        public const float TouchBtnScale = 1f;
        /// <summary>anim.idle.frames</summary>
        public const float AnimIdleFrames = 1f;
        /// <summary>anim.idle.fps</summary>
        public const float AnimIdleFps = 4f;
        /// <summary>anim.walk.frames</summary>
        public const float AnimWalkFrames = 4f;
        /// <summary>anim.walk.fps</summary>
        public const float AnimWalkFps = 8f;
        /// <summary>anim.atk.frames</summary>
        public const float AnimAtkFrames = 3f;
        /// <summary>anim.atk.fps</summary>
        public const float AnimAtkFps = 15f;
        /// <summary>anim.dash.frames</summary>
        public const float AnimDashFrames = 3f;
        /// <summary>anim.dash.fps</summary>
        public const float AnimDashFps = 14f;
        /// <summary>anim.cast.frames</summary>
        public const float AnimCastFrames = 3f;
        /// <summary>anim.cast.fps</summary>
        public const float AnimCastFps = 12f;
        /// <summary>anim.hurt.frames</summary>
        public const float AnimHurtFrames = 2f;
        /// <summary>anim.hurt.fps</summary>
        public const float AnimHurtFps = 10f;
        /// <summary>anim.die.frames</summary>
        public const float AnimDieFrames = 4f;
        /// <summary>anim.die.fps</summary>
        public const float AnimDieFps = 8f;
        /// <summary>anim.bobAmplitudePx</summary>
        public const float AnimBobAmplitudePx = 1f;
        /// <summary>player.hp</summary>
        public const float PlayerHp = 120f;
        /// <summary>player.atk</summary>
        public const float PlayerAtk = 14f;
        /// <summary>player.def</summary>
        public const float PlayerDef = 6f;
        /// <summary>player.moveSpeed</summary>
        public const float PlayerMoveSpeed = 4.2f;
        /// <summary>player.critRate</summary>
        public const float PlayerCritRate = 0.05f;
        /// <summary>player.critDmg</summary>
        public const float PlayerCritDmg = 1.5f;
        /// <summary>player.accelTime</summary>
        public const float PlayerAccelTime = 0.08f;
        /// <summary>player.decelTime</summary>
        public const float PlayerDecelTime = 0.05f;
        /// <summary>player.bodyRadius</summary>
        public const float PlayerBodyRadius = 0.32f;
        /// <summary>player.dash.duration</summary>
        public const float PlayerDashDuration = 0.22f;
        /// <summary>player.dash.distance</summary>
        public const float PlayerDashDistance = 2.8f;
        /// <summary>player.dash.iframes</summary>
        public const float PlayerDashIframes = 0.35f;
        /// <summary>player.dash.cooldown</summary>
        public const float PlayerDashCooldown = 1.2f;
        /// <summary>player.combo.mults.0</summary>
        public const float PlayerComboMults0 = 1f;
        /// <summary>player.combo.mults.1</summary>
        public const float PlayerComboMults1 = 1f;
        /// <summary>player.combo.mults.2</summary>
        public const float PlayerComboMults2 = 1.6f;
        /// <summary>player.combo.window</summary>
        public const float PlayerComboWindow = 0.6f;
        /// <summary>player.combo.attackTime.0</summary>
        public const float PlayerComboAttackTime0 = 0.2f;
        /// <summary>player.combo.attackTime.1</summary>
        public const float PlayerComboAttackTime1 = 0.2f;
        /// <summary>player.combo.attackTime.2</summary>
        public const float PlayerComboAttackTime2 = 0.28f;
        /// <summary>player.combo.range</summary>
        public const float PlayerComboRange = 2.2f;
        /// <summary>player.combo.arcDeg</summary>
        public const float PlayerComboArcDeg = 110f;
        /// <summary>player.combo.knockback3</summary>
        public const float PlayerComboKnockback3 = 6f;
        /// <summary>player.combo.moveSlow</summary>
        public const float PlayerComboMoveSlow = 0.35f;
        /// <summary>player.regen.delay</summary>
        public const float PlayerRegenDelay = 4f;
        /// <summary>player.regen.ratePct</summary>
        public const float PlayerRegenRatePct = 0.06f;
        /// <summary>player.respawn.delay</summary>
        public const float PlayerRespawnDelay = 1.5f;
        /// <summary>player.respawn.invuln</summary>
        public const float PlayerRespawnInvuln = 2f;
        /// <summary>reactions.markDurS</summary>
        public const float ReactionsMarkDurS = 4f;
        /// <summary>reactions.chainDecay</summary>
        public const float ReactionsChainDecay = 0.8f;
        /// <summary>reactions.maxDepth</summary>
        public const float ReactionsMaxDepth = 4f;
        /// <summary>reactions.steam.radiusM</summary>
        public const float ReactionsSteamRadiusM = 2f;
        /// <summary>reactions.steam.mult</summary>
        public const float ReactionsSteamMult = 1.8f;
        /// <summary>reactions.overload.mult</summary>
        public const float ReactionsOverloadMult = 2.2f;
        /// <summary>reactions.overload.knockM</summary>
        public const float ReactionsOverloadKnockM = 2f;
        /// <summary>reactions.miasma.radiusM</summary>
        public const float ReactionsMiasmaRadiusM = 1.5f;
        /// <summary>reactions.miasma.lifeS</summary>
        public const float ReactionsMiasmaLifeS = 3f;
        /// <summary>reactions.miasma.intervalS</summary>
        public const float ReactionsMiasmaIntervalS = 0.5f;
        /// <summary>reactions.miasma.mult</summary>
        public const float ReactionsMiasmaMult = 0.4f;
        /// <summary>reactions.chain.targets</summary>
        public const float ReactionsChainTargets = 4f;
        /// <summary>reactions.chain.rangeM</summary>
        public const float ReactionsChainRangeM = 4f;
        /// <summary>reactions.chain.mult</summary>
        public const float ReactionsChainMult = 0.8f;
        /// <summary>reactions.chain.slowPct</summary>
        public const float ReactionsChainSlowPct = 0.4f;
        /// <summary>reactions.chain.slowS</summary>
        public const float ReactionsChainSlowS = 2f;
        /// <summary>reactions.brittle.vulnS</summary>
        public const float ReactionsBrittleVulnS = 4f;
        /// <summary>reactions.brittle.pct</summary>
        public const float ReactionsBrittlePct = 0.25f;
        /// <summary>reactions.numb.stunS</summary>
        public const float ReactionsNumbStunS = 1.2f;
        /// <summary>specials.echoEvery</summary>
        public const float SpecialEchoEvery = 5f;
        /// <summary>specials.echoMult</summary>
        public const float SpecialEchoMult = 2f;
        /// <summary>specials.thornFrac</summary>
        public const float SpecialThornFrac = 0.25f;
        /// <summary>specials.thornRadiusM</summary>
        public const float SpecialThornRadiusM = 2f;
        /// <summary>specials.thornCap</summary>
        public const float SpecialThornCap = 20f;
        /// <summary>specials.soulfeastHeal</summary>
        public const float SpecialSoulfeastHeal = 3f;
        /// <summary>specials.tempestRangeMult</summary>
        public const float SpecialTempestRangeMult = 1.4f;
        /// <summary>specials.windhoodAtkPct</summary>
        public const float SpecialWindhoodAtkPct = 12f;
        /// <summary>specials.starhelmAtkPct</summary>
        public const float SpecialStarhelmAtkPct = 20f;
        /// <summary>specials.starhelmWindowS</summary>
        public const float SpecialStarhelmWindowS = 3f;
        /// <summary>specials.stoneheartThreshold</summary>
        public const float SpecialStoneheartThreshold = 0.35f;
        /// <summary>specials.stoneheartReduce</summary>
        public const float SpecialStoneheartReduce = 0.2f;
        /// <summary>specials.frostfangMarks</summary>
        public const float SpecialFrostfangMarks = 1f;
        /// <summary>specials.emberstrideBurnS</summary>
        public const float SpecialEmberstrideBurnS = 2f;
        /// <summary>consumables.shield.price</summary>
        public const float ConsumableShieldPrice = 70f;
        /// <summary>consumables.shield.capPct</summary>
        public const float ConsumableShieldCapPct = 0.5f;
        /// <summary>consumables.shield.durS</summary>
        public const float ConsumableShieldDurS = 12f;
        /// <summary>consumables.cleanse.price</summary>
        public const float ConsumableCleansePrice = 60f;
        /// <summary>consumables.cleanse.debuffMax</summary>
        public const float ConsumableCleanseDebuffMax = 3f;
        /// <summary>consumables.cleanse.iframesS</summary>
        public const float ConsumableCleanseIframesS = 0.3f;
        /// <summary>consumables.timeslow.price</summary>
        public const float ConsumableTimeslowPrice = 90f;
        /// <summary>consumables.timeslow.radiusM</summary>
        public const float ConsumableTimeslowRadiusM = 4.5f;
        /// <summary>consumables.timeslow.slowPct</summary>
        public const float ConsumableTimeslowSlowPct = 0.5f;
        /// <summary>consumables.timeslow.durS</summary>
        public const float ConsumableTimeslowDurS = 3f;
        /// <summary>consumables.timeslow.bossFactor</summary>
        public const float ConsumableTimeslowBossFactor = 0.5f;
        /// <summary>consumables.flask.price</summary>
        public const float ConsumableFlaskPrice = 80f;
        /// <summary>consumables.flask.elementS</summary>
        public const float ConsumableFlaskElementS = 8f;
        /// <summary>consumables.flask.chargeMax</summary>
        public const float ConsumableFlaskChargeMax = 1f;
        /// <summary>blueprint.shardsPerBoss</summary>
        public const float BlueprintShardsPerBoss = 1f;
        /// <summary>blueprint.nightBonus</summary>
        public const float BlueprintNightBonus = 1f;
        /// <summary>blueprint.craftCost</summary>
        public const float BlueprintCraftCost = 5f;
        /// <summary>blueprint.reforgeCost</summary>
        public const float BlueprintReforgeCost = 120f;
        /// <summary>blueprint.reforgeRerollMax</summary>
        public const float BlueprintReforgeRerollMax = 3f;
        /// <summary>blueprint.dropChance</summary>
        public const float BlueprintDropChance = 0.35f;
        /// <summary>shop.prices.rare</summary>
        public const float ShopPricesRare = 60f;
        /// <summary>shop.prices.epic</summary>
        public const float ShopPricesEpic = 140f;
        /// <summary>shop.prices.legendary</summary>
        public const float ShopPricesLegendary = 320f;
        /// <summary>shop.potionPrice</summary>
        public const float ShopPotionPrice = 40f;
        /// <summary>shop.runePrice</summary>
        public const float ShopRunePrice = 90f;
        /// <summary>shop.thirdStandWeights.rare</summary>
        public const float ShopThirdStandWeightsRare = 0.6f;
        /// <summary>shop.thirdStandWeights.epic</summary>
        public const float ShopThirdStandWeightsEpic = 0.3f;
        /// <summary>shop.thirdStandWeights.legendary</summary>
        public const float ShopThirdStandWeightsLegendary = 0.1f;
        /// <summary>shop.shelfRunes</summary>
        public const float ShopShelfRunes = 2f;
        /// <summary>shop.consStands</summary>
        public const float ShopConsStands = 2f;
        /// <summary>shop.priceJitter</summary>
        public const float ShopPriceJitter = 0.12f;
        /// <summary>shop.dealChance</summary>
        public const float ShopDealChance = 0.4f;
        /// <summary>shop.dealOff</summary>
        public const float ShopDealOff = 0.3f;
        /// <summary>shop.haggle.bigChance</summary>
        public const float ShopHaggleBigChance = 0.15f;
        /// <summary>shop.haggle.successChance</summary>
        public const float ShopHaggleSuccessChance = 0.5f;
        /// <summary>shop.haggle.luckPerPoint</summary>
        public const float ShopHaggleLuckPerPoint = 0.02f;
        /// <summary>shop.haggle.luckMax</summary>
        public const float ShopHaggleLuckMax = 0.25f;
        /// <summary>shop.haggle.bigOff</summary>
        public const float ShopHaggleBigOff = 0.35f;
        /// <summary>shop.haggle.off</summary>
        public const float ShopHaggleOff = 0.15f;
        /// <summary>shop.haggle.markup</summary>
        public const float ShopHaggleMarkup = 0.2f;
        /// <summary>events.bloodHpMult</summary>
        public const float EventBloodHpMult = 0.75f;
        /// <summary>events.blessingAtk</summary>
        public const float EventBlessingAtk = 0.1f;
        /// <summary>events.blessingSpeed</summary>
        public const float EventBlessingSpeed = 0.1f;
        /// <summary>events.fountainMin</summary>
        public const float EventFountainMin = 80f;
        /// <summary>events.fountainMax</summary>
        public const float EventFountainMax = 150f;
        /// <summary>events.totemPick</summary>
        public const float EventTotemPick = 3f;
        /// <summary>events.gambleCost</summary>
        public const float EventGambleCost = 60f;
        /// <summary>events.gambleMult</summary>
        public const float EventGambleMult = 3f;
        /// <summary>events.gambleWinChance</summary>
        public const float EventGambleWinChance = 0.4f;
        /// <summary>events.sacrificeHpFrac</summary>
        public const float EventSacrificeHpFrac = 0.3f;
        /// <summary>events.sacrificeCons</summary>
        public const float EventSacrificeCons = 3f;
        /// <summary>events.relicDustFallback</summary>
        public const float EventRelicDustFallback = 60f;
        /// <summary>events.echoFrac</summary>
        public const float EventEchoFrac = 0.5f;
        /// <summary>events.echoFallbackDust</summary>
        public const float EventEchoFallbackDust = 40f;
        /// <summary>events.mendHpMult</summary>
        public const float EventMendHpMult = 0.85f;
        /// <summary>events.repay.blood</summary>
        public const float EventRepayBlood = 90f;
        /// <summary>events.repay.blessing</summary>
        public const float EventRepayBlessing = 80f;
        /// <summary>events.repay.cons</summary>
        public const float EventRepayCons = 45f;
        /// <summary>events.repay.rune</summary>
        public const float EventRepayRune = 100f;
        /// <summary>events.repay.mend</summary>
        public const float EventRepayMend = 70f;
        /// <summary>events.eventLogMax</summary>
        public const float EventEventLogMax = 12f;
        /// <summary>abyss.levels.0.id</summary>
        public const float AbyssLevels0Id = 1f;
        /// <summary>abyss.levels.0.hpMult</summary>
        public const float AbyssLevels0HpMult = 1.45f;
        /// <summary>abyss.levels.0.atkMult</summary>
        public const float AbyssLevels0AtkMult = 1.25f;
        /// <summary>abyss.levels.0.lootMult</summary>
        public const float AbyssLevels0LootMult = 1.25f;
        /// <summary>abyss.levels.0.dustMult</summary>
        public const float AbyssLevels0DustMult = 1.3f;
        /// <summary>abyss.levels.0.unlockClears</summary>
        public const float AbyssLevels0UnlockClears = 3f;
        /// <summary>abyss.levels.0.unlockAbyss</summary>
        public const float AbyssLevels0UnlockAbyss = 0f;
        /// <summary>abyss.levels.0.eliteWaves</summary>
        public const float AbyssLevels0EliteWaves = 1f;
        /// <summary>abyss.levels.1.id</summary>
        public const float AbyssLevels1Id = 2f;
        /// <summary>abyss.levels.1.hpMult</summary>
        public const float AbyssLevels1HpMult = 2.1f;
        /// <summary>abyss.levels.1.atkMult</summary>
        public const float AbyssLevels1AtkMult = 1.55f;
        /// <summary>abyss.levels.1.lootMult</summary>
        public const float AbyssLevels1LootMult = 1.5f;
        /// <summary>abyss.levels.1.dustMult</summary>
        public const float AbyssLevels1DustMult = 1.7f;
        /// <summary>abyss.levels.1.unlockClears</summary>
        public const float AbyssLevels1UnlockClears = 0f;
        /// <summary>abyss.levels.1.unlockAbyss</summary>
        public const float AbyssLevels1UnlockAbyss = 1f;
        /// <summary>abyss.levels.1.eliteWaves</summary>
        public const float AbyssLevels1EliteWaves = 1f;
        /// <summary>abyss.levels.2.id</summary>
        public const float AbyssLevels2Id = 3f;
        /// <summary>abyss.levels.2.hpMult</summary>
        public const float AbyssLevels2HpMult = 3f;
        /// <summary>abyss.levels.2.atkMult</summary>
        public const float AbyssLevels2AtkMult = 1.9f;
        /// <summary>abyss.levels.2.lootMult</summary>
        public const float AbyssLevels2LootMult = 1.8f;
        /// <summary>abyss.levels.2.dustMult</summary>
        public const float AbyssLevels2DustMult = 2.2f;
        /// <summary>abyss.levels.2.unlockClears</summary>
        public const float AbyssLevels2UnlockClears = 0f;
        /// <summary>abyss.levels.2.unlockAbyss</summary>
        public const float AbyssLevels2UnlockAbyss = 2f;
        /// <summary>abyss.levels.2.eliteWaves</summary>
        public const float AbyssLevels2EliteWaves = 2f;
        /// <summary>abyss.nightBonusMult</summary>
        public const float AbyssNightBonusMult = 1.1f;
        /// <summary>endless.loopHp</summary>
        public const float EndlessLoopHp = 1.35f;
        /// <summary>endless.loopAtk</summary>
        public const float EndlessLoopAtk = 1.18f;
        /// <summary>endless.loopLoot</summary>
        public const float EndlessLoopLoot = 1.12f;
        /// <summary>endless.loopDust</summary>
        public const float EndlessLoopDust = 1.15f;
        /// <summary>endless.maxMult</summary>
        public const float EndlessMaxMult = 1e+06f;
        /// <summary>endless.maxHp</summary>
        public const float EndlessMaxHp = 1e+09f;
        /// <summary>endless.maxAtk</summary>
        public const float EndlessMaxAtk = 1e+06f;
        /// <summary>endless.unlockClears</summary>
        public const float EndlessUnlockClears = 4f;

        /// <summary>与 balance.json 的逐键对照表(键 = JSON 路径;ParityTests 双向校验)。</summary>
        public static readonly Dictionary<string, float> Parity = new()
        {
            { "shroomling.hp", ShroomlingHp },
            { "shroomling.atk", ShroomlingAtk },
            { "shroomling.def", ShroomlingDef },
            { "shroomling.speed", ShroomlingSpeed },
            { "shroomling.bodyRadius", ShroomlingBodyRadius },
            { "shroomling.aggroRange", ShroomlingAggroRange },
            { "shroomling.touchCooldown", ShroomlingTouchCooldown },
            { "shroomling.wanderSpeed", ShroomlingWanderSpeed },
            { "shroomling.spore.radiusM", ShroomlingSporeRadiusM },
            { "shroomling.spore.lifeS", ShroomlingSporeLifeS },
            { "shroomling.spore.intervalS", ShroomlingSporeIntervalS },
            { "shroomling.spore.mult", ShroomlingSporeMult },
            { "windbee.hp", WindBeeHp },
            { "windbee.atk", WindBeeAtk },
            { "windbee.def", WindBeeDef },
            { "windbee.speed", WindBeeSpeed },
            { "windbee.bodyRadius", WindBeeBodyRadius },
            { "windbee.orbitRadiusM", WindBeeOrbitRadiusM },
            { "windbee.diveSpeed", WindBeeDiveSpeed },
            { "windbee.diveDur", WindBeeDiveDur },
            { "windbee.diveIntervalMin", WindBeeDiveIntervalMin },
            { "windbee.diveIntervalMax", WindBeeDiveIntervalMax },
            { "windbee.telegraphS", WindBeeTelegraphS },
            { "windbee.touchCooldown", WindBeeTouchCooldown },
            { "blightwolf.hp", BlightWolfHp },
            { "blightwolf.atk", BlightWolfAtk },
            { "blightwolf.def", BlightWolfDef },
            { "blightwolf.speed", BlightWolfSpeed },
            { "blightwolf.bodyRadius", BlightWolfBodyRadius },
            { "blightwolf.circleRadiusM", BlightWolfCircleRadiusM },
            { "blightwolf.circleTimeMin", BlightWolfCircleTimeMin },
            { "blightwolf.circleTimeMax", BlightWolfCircleTimeMax },
            { "blightwolf.growlS", BlightWolfGrowlS },
            { "blightwolf.pounceSpeed", BlightWolfPounceSpeed },
            { "blightwolf.pounceDur", BlightWolfPounceDur },
            { "blightwolf.recoverS", BlightWolfRecoverS },
            { "blightwolf.touchCooldown", BlightWolfTouchCooldown },
            { "leafwisp.hp", LeafWispHp },
            { "leafwisp.atk", LeafWispAtk },
            { "leafwisp.def", LeafWispDef },
            { "leafwisp.speed", LeafWispSpeed },
            { "leafwisp.bodyRadius", LeafWispBodyRadius },
            { "leafwisp.keepMinM", LeafWispKeepMinM },
            { "leafwisp.keepMaxM", LeafWispKeepMaxM },
            { "leafwisp.bolt.cd", LeafWispBoltCd },
            { "leafwisp.bolt.aimS", LeafWispBoltAimS },
            { "leafwisp.bolt.speedM", LeafWispBoltSpeedM },
            { "leafwisp.bolt.radiusM", LeafWispBoltRadiusM },
            { "leafwisp.bolt.lifeS", LeafWispBoltLifeS },
            { "leafwisp.bolt.mult", LeafWispBoltMult },
            { "leafwisp.windBoostMul", LeafWispWindBoostMul },
            { "thornvine.hp", ThornVineHp },
            { "thornvine.atk", ThornVineAtk },
            { "thornvine.def", ThornVineDef },
            { "thornvine.bodyRadius", ThornVineBodyRadius },
            { "thornvine.idleS", ThornVineIdleS },
            { "thornvine.telegraphS", ThornVineTelegraphS },
            { "thornvine.spikeRadiusM", ThornVineSpikeRadiusM },
            { "thornvine.rangeM", ThornVineRangeM },
            { "oakgolem.hp", OakGolemHp },
            { "oakgolem.atk", OakGolemAtk },
            { "oakgolem.def", OakGolemDef },
            { "oakgolem.speed", OakGolemSpeed },
            { "oakgolem.bodyRadius", OakGolemBodyRadius },
            { "oakgolem.slamRangeM", OakGolemSlamRangeM },
            { "oakgolem.slamTelegraphS", OakGolemSlamTelegraphS },
            { "oakgolem.slamRadiusM", OakGolemSlamRadiusM },
            { "oakgolem.slamCdS", OakGolemSlamCdS },
            { "oakgolem.backstabMult", OakGolemBackstabMult },
            { "emberimp.hp", EmberImpHp },
            { "emberimp.atk", EmberImpAtk },
            { "emberimp.def", EmberImpDef },
            { "emberimp.speed", EmberImpSpeed },
            { "emberimp.bodyRadius", EmberImpBodyRadius },
            { "emberimp.keepMinM", EmberImpKeepMinM },
            { "emberimp.keepMaxM", EmberImpKeepMaxM },
            { "emberimp.fireball.cd", EmberImpFireballCd },
            { "emberimp.fireball.aimS", EmberImpFireballAimS },
            { "emberimp.fireball.speedM", EmberImpFireballSpeedM },
            { "emberimp.fireball.radiusM", EmberImpFireballRadiusM },
            { "emberimp.fireball.mult", EmberImpFireballMult },
            { "emberimp.fireball.lifeS", EmberImpFireballLifeS },
            { "frostslime.hp", FrostSlimeHp },
            { "frostslime.atk", FrostSlimeAtk },
            { "frostslime.def", FrostSlimeDef },
            { "frostslime.speed", FrostSlimeSpeed },
            { "frostslime.bodyRadius", FrostSlimeBodyRadius },
            { "frostslime.hop.cd", FrostSlimeHopCd },
            { "frostslime.hop.dur", FrostSlimeHopDur },
            { "frostslime.hop.speedM", FrostSlimeHopSpeedM },
            { "frostslime.split.count", FrostSlimeSplitCount },
            { "frostslime.split.hpMult", FrostSlimeSplitHpMult },
            { "frostslime.split.radiusMult", FrostSlimeSplitRadiusMult },
            { "frostslime.contactCd", FrostSlimeContactCd },
            { "sparklizard.hp", SparkLizardHp },
            { "sparklizard.atk", SparkLizardAtk },
            { "sparklizard.def", SparkLizardDef },
            { "sparklizard.speed", SparkLizardSpeed },
            { "sparklizard.bodyRadius", SparkLizardBodyRadius },
            { "sparklizard.dash.cd", SparkLizardDashCd },
            { "sparklizard.dash.telegraphS", SparkLizardDashTelegraphS },
            { "sparklizard.dash.speedM", SparkLizardDashSpeedM },
            { "sparklizard.dash.dur", SparkLizardDashDur },
            { "sparklizard.contactCd", SparkLizardContactCd },
            { "toxintoad.hp", ToxinToadHp },
            { "toxintoad.atk", ToxinToadAtk },
            { "toxintoad.def", ToxinToadDef },
            { "toxintoad.speed", ToxinToadSpeed },
            { "toxintoad.bodyRadius", ToxinToadBodyRadius },
            { "toxintoad.lob.cd", ToxinToadLobCd },
            { "toxintoad.lob.aimS", ToxinToadLobAimS },
            { "toxintoad.lob.rangeM", ToxinToadLobRangeM },
            { "toxintoad.lob.zoneRadiusM", ToxinToadLobZoneRadiusM },
            { "toxintoad.lob.zoneLifeS", ToxinToadLobZoneLifeS },
            { "toxintoad.lob.tickS", ToxinToadLobTickS },
            { "toxintoad.lob.mult", ToxinToadLobMult },
            { "toxintoad.hop.cd", ToxinToadHopCd },
            { "toxintoad.hop.dur", ToxinToadHopDur },
            { "toxintoad.hop.speedM", ToxinToadHopSpeedM },
            { "toxintoad.contactCd", ToxinToadContactCd },
            { "stardustsprite.hp", StardustSpriteHp },
            { "stardustsprite.atk", StardustSpriteAtk },
            { "stardustsprite.def", StardustSpriteDef },
            { "stardustsprite.speed", StardustSpriteSpeed },
            { "stardustsprite.bodyRadius", StardustSpriteBodyRadius },
            { "stardustsprite.lifeS", StardustSpriteLifeS },
            { "stardustsprite.bonusMin", StardustSpriteBonusMin },
            { "stardustsprite.bonusMax", StardustSpriteBonusMax },
            { "snowpuff.hp", SnowPuffHp },
            { "snowpuff.atk", SnowPuffAtk },
            { "snowpuff.def", SnowPuffDef },
            { "snowpuff.speed", SnowPuffSpeed },
            { "snowpuff.bodyRadius", SnowPuffBodyRadius },
            { "snowpuff.roll.cd", SnowPuffRollCd },
            { "snowpuff.roll.dur", SnowPuffRollDur },
            { "snowpuff.roll.speedM", SnowPuffRollSpeedM },
            { "snowpuff.contactCd", SnowPuffContactCd },
            { "iceturtle.hp", IceTurtleHp },
            { "iceturtle.atk", IceTurtleAtk },
            { "iceturtle.def", IceTurtleDef },
            { "iceturtle.speed", IceTurtleSpeed },
            { "iceturtle.bodyRadius", IceTurtleBodyRadius },
            { "iceturtle.spin.cd", IceTurtleSpinCd },
            { "iceturtle.spin.telegraphS", IceTurtleSpinTelegraphS },
            { "iceturtle.spin.dur", IceTurtleSpinDur },
            { "iceturtle.spin.speedM", IceTurtleSpinSpeedM },
            { "iceturtle.frontDR", IceTurtleFrontDR },
            { "iceturtle.contactCd", IceTurtleContactCd },
            { "blizzardhawk.hp", BlizzardHawkHp },
            { "blizzardhawk.atk", BlizzardHawkAtk },
            { "blizzardhawk.def", BlizzardHawkDef },
            { "blizzardhawk.speed", BlizzardHawkSpeed },
            { "blizzardhawk.bodyRadius", BlizzardHawkBodyRadius },
            { "blizzardhawk.dive.cd", BlizzardHawkDiveCd },
            { "blizzardhawk.dive.telegraphS", BlizzardHawkDiveTelegraphS },
            { "blizzardhawk.dive.speedM", BlizzardHawkDiveSpeedM },
            { "blizzardhawk.dive.dur", BlizzardHawkDiveDur },
            { "blizzardhawk.contactCd", BlizzardHawkContactCd },
            { "frostmage.hp", FrostMageHp },
            { "frostmage.atk", FrostMageAtk },
            { "frostmage.def", FrostMageDef },
            { "frostmage.speed", FrostMageSpeed },
            { "frostmage.bodyRadius", FrostMageBodyRadius },
            { "frostmage.keepMinM", FrostMageKeepMinM },
            { "frostmage.keepMaxM", FrostMageKeepMaxM },
            { "frostmage.bolt.cd", FrostMageBoltCd },
            { "frostmage.bolt.aimS", FrostMageBoltAimS },
            { "frostmage.bolt.speedM", FrostMageBoltSpeedM },
            { "frostmage.bolt.radiusM", FrostMageBoltRadiusM },
            { "frostmage.bolt.mult", FrostMageBoltMult },
            { "frostmage.bolt.lifeS", FrostMageBoltLifeS },
            { "icespike.hp", IceSpikeHp },
            { "icespike.atk", IceSpikeAtk },
            { "icespike.def", IceSpikeDef },
            { "icespike.speed", IceSpikeSpeed },
            { "icespike.bodyRadius", IceSpikeBodyRadius },
            { "icespike.spike.telegraphS", IceSpikeSpikeTelegraphS },
            { "icespike.spike.radiusM", IceSpikeSpikeRadiusM },
            { "icespike.spike.mult", IceSpikeSpikeMult },
            { "icespike.spike.cdS", IceSpikeSpikeCdS },
            { "icespike.spike.rangeM", IceSpikeSpikeRangeM },
            { "iceglider.hp", IceGliderHp },
            { "iceglider.atk", IceGliderAtk },
            { "iceglider.def", IceGliderDef },
            { "iceglider.speed", IceGliderSpeed },
            { "iceglider.bodyRadius", IceGliderBodyRadius },
            { "iceglider.glide.turnRadPerS", IceGliderGlideTurnRadPerS },
            { "iceglider.glide.contactCd", IceGliderGlideContactCd },
            { "boss_velsha.hp", BossVelshaHp },
            { "boss_velsha.atk", BossVelshaAtk },
            { "boss_velsha.def", BossVelshaDef },
            { "boss_velsha.speed", BossVelshaSpeed },
            { "boss_velsha.bodyRadius", BossVelshaBodyRadius },
            { "boss_velsha.phase2At", BossVelshaPhase2At },
            { "boss_velsha.phase3At", BossVelshaPhase3At },
            { "boss_velsha.volley.cd", BossVelshaVolleyCd },
            { "boss_velsha.volley.count", BossVelshaVolleyCount },
            { "boss_velsha.volley.speedM", BossVelshaVolleySpeedM },
            { "boss_velsha.volley.radiusM", BossVelshaVolleyRadiusM },
            { "boss_velsha.volley.mult", BossVelshaVolleyMult },
            { "boss_velsha.volley.lifeS", BossVelshaVolleyLifeS },
            { "boss_velsha.blizzard.cd", BossVelshaBlizzardCd },
            { "boss_velsha.blizzard.count", BossVelshaBlizzardCount },
            { "boss_velsha.blizzard.radiusM", BossVelshaBlizzardRadiusM },
            { "boss_velsha.blizzard.telegraphS", BossVelshaBlizzardTelegraphS },
            { "boss_velsha.blizzard.mult", BossVelshaBlizzardMult },
            { "boss_velsha.blizzard.zoneLifeS", BossVelshaBlizzardZoneLifeS },
            { "boss_velsha.blizzard.tickS", BossVelshaBlizzardTickS },
            { "boss_velsha.blizzard.zoneMult", BossVelshaBlizzardZoneMult },
            { "boss_velsha.summon.cd", BossVelshaSummonCd },
            { "boss_velsha.summon.count", BossVelshaSummonCount },
            { "boss_velsha.charge.cd", BossVelshaChargeCd },
            { "boss_velsha.charge.telegraphS", BossVelshaChargeTelegraphS },
            { "boss_velsha.charge.speedM", BossVelshaChargeSpeedM },
            { "boss_velsha.charge.dur", BossVelshaChargeDur },
            { "cinderrat.hp", CinderRatHp },
            { "cinderrat.atk", CinderRatAtk },
            { "cinderrat.def", CinderRatDef },
            { "cinderrat.speed", CinderRatSpeed },
            { "cinderrat.bodyRadius", CinderRatBodyRadius },
            { "cinderrat.contactCd", CinderRatContactCd },
            { "dunebeetle.hp", DuneBeetleHp },
            { "dunebeetle.atk", DuneBeetleAtk },
            { "dunebeetle.def", DuneBeetleDef },
            { "dunebeetle.speed", DuneBeetleSpeed },
            { "dunebeetle.bodyRadius", DuneBeetleBodyRadius },
            { "dunebeetle.burrow.underSpeedM", DuneBeetleBurrowUnderSpeedM },
            { "dunebeetle.burrow.telegraphS", DuneBeetleBurrowTelegraphS },
            { "dunebeetle.burrow.emergeRadiusM", DuneBeetleBurrowEmergeRadiusM },
            { "dunebeetle.burrow.emergeMult", DuneBeetleBurrowEmergeMult },
            { "dunebeetle.burrow.surfaceS", DuneBeetleBurrowSurfaceS },
            { "dunebeetle.contactCd", DuneBeetleContactCd },
            { "flamedancer.hp", FlameDancerHp },
            { "flamedancer.atk", FlameDancerAtk },
            { "flamedancer.def", FlameDancerDef },
            { "flamedancer.speed", FlameDancerSpeed },
            { "flamedancer.bodyRadius", FlameDancerBodyRadius },
            { "flamedancer.keepMinM", FlameDancerKeepMinM },
            { "flamedancer.keepMaxM", FlameDancerKeepMaxM },
            { "flamedancer.hopM", FlameDancerHopM },
            { "flamedancer.twinshot.cd", FlameDancerTwinshotCd },
            { "flamedancer.twinshot.aimS", FlameDancerTwinshotAimS },
            { "flamedancer.twinshot.speedM", FlameDancerTwinshotSpeedM },
            { "flamedancer.twinshot.radiusM", FlameDancerTwinshotRadiusM },
            { "flamedancer.twinshot.mult", FlameDancerTwinshotMult },
            { "flamedancer.twinshot.lifeS", FlameDancerTwinshotLifeS },
            { "flamedancer.twinshot.spreadDeg", FlameDancerTwinshotSpreadDeg },
            { "duststinger.hp", DustStingerHp },
            { "duststinger.atk", DustStingerAtk },
            { "duststinger.def", DustStingerDef },
            { "duststinger.speed", DustStingerSpeed },
            { "duststinger.bodyRadius", DustStingerBodyRadius },
            { "duststinger.lob.cd", DustStingerLobCd },
            { "duststinger.lob.aimS", DustStingerLobAimS },
            { "duststinger.lob.rangeM", DustStingerLobRangeM },
            { "duststinger.lob.zoneRadiusM", DustStingerLobZoneRadiusM },
            { "duststinger.lob.zoneLifeS", DustStingerLobZoneLifeS },
            { "duststinger.lob.tickS", DustStingerLobTickS },
            { "duststinger.lob.mult", DustStingerLobMult },
            { "duststinger.hop.cd", DustStingerHopCd },
            { "duststinger.hop.dur", DustStingerHopDur },
            { "duststinger.hop.speedM", DustStingerHopSpeedM },
            { "duststinger.contactCd", DustStingerContactCd },
            { "mirageblossom.hp", MirageBlossomHp },
            { "mirageblossom.atk", MirageBlossomAtk },
            { "mirageblossom.def", MirageBlossomDef },
            { "mirageblossom.speed", MirageBlossomSpeed },
            { "mirageblossom.bodyRadius", MirageBlossomBodyRadius },
            { "mirageblossom.burst.triggerM", MirageBlossomBurstTriggerM },
            { "mirageblossom.burst.firstDelayS", MirageBlossomBurstFirstDelayS },
            { "mirageblossom.burst.count", MirageBlossomBurstCount },
            { "mirageblossom.burst.speedM", MirageBlossomBurstSpeedM },
            { "mirageblossom.burst.radiusM", MirageBlossomBurstRadiusM },
            { "mirageblossom.burst.lifeS", MirageBlossomBurstLifeS },
            { "mirageblossom.burst.mult", MirageBlossomBurstMult },
            { "mirageblossom.burst.cdS", MirageBlossomBurstCdS },
            { "emberwhirl.hp", EmberWhirlHp },
            { "emberwhirl.atk", EmberWhirlAtk },
            { "emberwhirl.def", EmberWhirlDef },
            { "emberwhirl.speed", EmberWhirlSpeed },
            { "emberwhirl.bodyRadius", EmberWhirlBodyRadius },
            { "emberwhirl.rush.telegraphS", EmberWhirlRushTelegraphS },
            { "emberwhirl.rush.speedM", EmberWhirlRushSpeedM },
            { "emberwhirl.rush.durS", EmberWhirlRushDurS },
            { "emberwhirl.rush.trailIntervalS", EmberWhirlRushTrailIntervalS },
            { "emberwhirl.rush.trailRadiusM", EmberWhirlRushTrailRadiusM },
            { "emberwhirl.rush.trailLifeS", EmberWhirlRushTrailLifeS },
            { "emberwhirl.rush.trailMult", EmberWhirlRushTrailMult },
            { "emberwhirl.rush.cdS", EmberWhirlRushCdS },
            { "emberwhirl.rush.recoverS", EmberWhirlRushRecoverS },
            { "boss_kazra.hp", BossKazraHp },
            { "boss_kazra.atk", BossKazraAtk },
            { "boss_kazra.def", BossKazraDef },
            { "boss_kazra.speed", BossKazraSpeed },
            { "boss_kazra.bodyRadius", BossKazraBodyRadius },
            { "boss_kazra.phase2At", BossKazraPhase2At },
            { "boss_kazra.phase3At", BossKazraPhase3At },
            { "boss_kazra.volley.cd", BossKazraVolleyCd },
            { "boss_kazra.volley.count", BossKazraVolleyCount },
            { "boss_kazra.volley.spreadDeg", BossKazraVolleySpreadDeg },
            { "boss_kazra.volley.speedM", BossKazraVolleySpeedM },
            { "boss_kazra.volley.radiusM", BossKazraVolleyRadiusM },
            { "boss_kazra.volley.mult", BossKazraVolleyMult },
            { "boss_kazra.volley.lifeS", BossKazraVolleyLifeS },
            { "boss_kazra.burrow.cd", BossKazraBurrowCd },
            { "boss_kazra.burrow.dives", BossKazraBurrowDives },
            { "boss_kazra.burrow.telegraphS", BossKazraBurrowTelegraphS },
            { "boss_kazra.burrow.radiusM", BossKazraBurrowRadiusM },
            { "boss_kazra.burrow.mult", BossKazraBurrowMult },
            { "boss_kazra.summon.cd", BossKazraSummonCd },
            { "boss_kazra.summon.count", BossKazraSummonCount },
            { "boss_kazra.trail.intervalS", BossKazraTrailIntervalS },
            { "boss_kazra.trail.radiusM", BossKazraTrailRadiusM },
            { "boss_kazra.trail.lifeS", BossKazraTrailLifeS },
            { "boss_kazra.trail.tickS", BossKazraTrailTickS },
            { "boss_kazra.trail.mult", BossKazraTrailMult },
            { "boss_kazra.contactCd", BossKazraContactCd },
            { "midboss_mossstag.hp", MidBossMossstagHp },
            { "midboss_mossstag.atk", MidBossMossstagAtk },
            { "midboss_mossstag.def", MidBossMossstagDef },
            { "midboss_mossstag.speed", MidBossMossstagSpeed },
            { "midboss_mossstag.bodyRadius", MidBossMossstagBodyRadius },
            { "midboss_mossstag.stalkM", MidBossMossstagStalkM },
            { "midboss_mossstag.charge.telegraphS", MidBossMossstagChargeTelegraphS },
            { "midboss_mossstag.charge.speedM", MidBossMossstagChargeSpeedM },
            { "midboss_mossstag.charge.durS", MidBossMossstagChargeDurS },
            { "midboss_mossstag.charge.recoverS", MidBossMossstagChargeRecoverS },
            { "midboss_mossstag.charge.mult", MidBossMossstagChargeMult },
            { "midboss_mossstag.charge.cdS", MidBossMossstagChargeCdS },
            { "midboss_mossstag.charge.wallStunS", MidBossMossstagChargeWallStunS },
            { "midboss_mossstag.charge.laneM", MidBossMossstagChargeLaneM },
            { "midboss_mossstag.volley.telegraphS", MidBossMossstagVolleyTelegraphS },
            { "midboss_mossstag.volley.count", MidBossMossstagVolleyCount },
            { "midboss_mossstag.volley.spreadDeg", MidBossMossstagVolleySpreadDeg },
            { "midboss_mossstag.volley.speedM", MidBossMossstagVolleySpeedM },
            { "midboss_mossstag.volley.lifeS", MidBossMossstagVolleyLifeS },
            { "midboss_mossstag.volley.radiusM", MidBossMossstagVolleyRadiusM },
            { "midboss_mossstag.volley.mult", MidBossMossstagVolleyMult },
            { "midboss_mossstag.volley.cdS", MidBossMossstagVolleyCdS },
            { "midboss_mossstag.spore.radiusM", MidBossMossstagSporeRadiusM },
            { "midboss_mossstag.spore.lifeS", MidBossMossstagSporeLifeS },
            { "midboss_mossstag.spore.intervalS", MidBossMossstagSporeIntervalS },
            { "midboss_mossstag.spore.mult", MidBossMossstagSporeMult },
            { "midboss_mossstag.phase2At", MidBossMossstagPhase2At },
            { "midboss_mossstag.enrageSpeedMul", MidBossMossstagEnrageSpeedMul },
            { "midboss_mossstag.enrageVolleyAdd", MidBossMossstagEnrageVolleyAdd },
            { "midboss_mossstag.runeDrop", MidBossMossstagRuneDrop },
            { "midboss_frosthuntress.hp", MidBossFrosthuntressHp },
            { "midboss_frosthuntress.atk", MidBossFrosthuntressAtk },
            { "midboss_frosthuntress.def", MidBossFrosthuntressDef },
            { "midboss_frosthuntress.speed", MidBossFrosthuntressSpeed },
            { "midboss_frosthuntress.bodyRadius", MidBossFrosthuntressBodyRadius },
            { "midboss_frosthuntress.kiteM", MidBossFrosthuntressKiteM },
            { "midboss_frosthuntress.blink.telegraphS", MidBossFrosthuntressBlinkTelegraphS },
            { "midboss_frosthuntress.blink.rangeM", MidBossFrosthuntressBlinkRangeM },
            { "midboss_frosthuntress.blink.cdS", MidBossFrosthuntressBlinkCdS },
            { "midboss_frosthuntress.arrows.count", MidBossFrosthuntressArrowsCount },
            { "midboss_frosthuntress.arrows.intervalS", MidBossFrosthuntressArrowsIntervalS },
            { "midboss_frosthuntress.arrows.speedM", MidBossFrosthuntressArrowsSpeedM },
            { "midboss_frosthuntress.arrows.lifeS", MidBossFrosthuntressArrowsLifeS },
            { "midboss_frosthuntress.arrows.radiusM", MidBossFrosthuntressArrowsRadiusM },
            { "midboss_frosthuntress.arrows.mult", MidBossFrosthuntressArrowsMult },
            { "midboss_frosthuntress.traps.telegraphS", MidBossFrosthuntressTrapsTelegraphS },
            { "midboss_frosthuntress.traps.count", MidBossFrosthuntressTrapsCount },
            { "midboss_frosthuntress.traps.ringM", MidBossFrosthuntressTrapsRingM },
            { "midboss_frosthuntress.traps.radiusM", MidBossFrosthuntressTrapsRadiusM },
            { "midboss_frosthuntress.traps.mult", MidBossFrosthuntressTrapsMult },
            { "midboss_frosthuntress.traps.stepS", MidBossFrosthuntressTrapsStepS },
            { "midboss_frosthuntress.traps.cdS", MidBossFrosthuntressTrapsCdS },
            { "midboss_frosthuntress.mark.channelS", MidBossFrosthuntressMarkChannelS },
            { "midboss_frosthuntress.mark.segments", MidBossFrosthuntressMarkSegments },
            { "midboss_frosthuntress.mark.stepM", MidBossFrosthuntressMarkStepM },
            { "midboss_frosthuntress.mark.radiusM", MidBossFrosthuntressMarkRadiusM },
            { "midboss_frosthuntress.mark.mult", MidBossFrosthuntressMarkMult },
            { "midboss_frosthuntress.mark.rippleS", MidBossFrosthuntressMarkRippleS },
            { "midboss_frosthuntress.mark.interruptStunS", MidBossFrosthuntressMarkInterruptStunS },
            { "midboss_frosthuntress.mark.cdS", MidBossFrosthuntressMarkCdS },
            { "midboss_frosthuntress.phase2At", MidBossFrosthuntressPhase2At },
            { "midboss_frosthuntress.enrageArrowAdd", MidBossFrosthuntressEnrageArrowAdd },
            { "midboss_frosthuntress.enrageTrapAdd", MidBossFrosthuntressEnrageTrapAdd },
            { "midboss_frosthuntress.enrageSpeedMul", MidBossFrosthuntressEnrageSpeedMul },
            { "midboss_frosthuntress.enrageCdMul", MidBossFrosthuntressEnrageCdMul },
            { "midboss_frosthuntress.runeDrop", MidBossFrosthuntressRuneDrop },
            { "midboss_sandreaper.hp", MidBossSandreaperHp },
            { "midboss_sandreaper.atk", MidBossSandreaperAtk },
            { "midboss_sandreaper.def", MidBossSandreaperDef },
            { "midboss_sandreaper.speed", MidBossSandreaperSpeed },
            { "midboss_sandreaper.bodyRadius", MidBossSandreaperBodyRadius },
            { "midboss_sandreaper.stalkM", MidBossSandreaperStalkM },
            { "midboss_sandreaper.hook.telegraphS", MidBossSandreaperHookTelegraphS },
            { "midboss_sandreaper.hook.speedM", MidBossSandreaperHookSpeedM },
            { "midboss_sandreaper.hook.rangeM", MidBossSandreaperHookRangeM },
            { "midboss_sandreaper.hook.radiusM", MidBossSandreaperHookRadiusM },
            { "midboss_sandreaper.hook.mult", MidBossSandreaperHookMult },
            { "midboss_sandreaper.hook.pullV", MidBossSandreaperHookPullV },
            { "midboss_sandreaper.hook.cdS", MidBossSandreaperHookCdS },
            { "midboss_sandreaper.cleave.telegraphS", MidBossSandreaperCleaveTelegraphS },
            { "midboss_sandreaper.cleave.leapS", MidBossSandreaperCleaveLeapS },
            { "midboss_sandreaper.cleave.radiusM", MidBossSandreaperCleaveRadiusM },
            { "midboss_sandreaper.cleave.mult", MidBossSandreaperCleaveMult },
            { "midboss_sandreaper.cleave.missStunS", MidBossSandreaperCleaveMissStunS },
            { "midboss_sandreaper.cleave.hitStunS", MidBossSandreaperCleaveHitStunS },
            { "midboss_sandreaper.cleave.cdS", MidBossSandreaperCleaveCdS },
            { "midboss_sandreaper.storm.count", MidBossSandreaperStormCount },
            { "midboss_sandreaper.storm.ringM", MidBossSandreaperStormRingM },
            { "midboss_sandreaper.storm.radiusM", MidBossSandreaperStormRadiusM },
            { "midboss_sandreaper.storm.lifeS", MidBossSandreaperStormLifeS },
            { "midboss_sandreaper.storm.intervalS", MidBossSandreaperStormIntervalS },
            { "midboss_sandreaper.storm.mult", MidBossSandreaperStormMult },
            { "midboss_sandreaper.storm.cdS", MidBossSandreaperStormCdS },
            { "midboss_sandreaper.phase2At", MidBossSandreaperPhase2At },
            { "midboss_sandreaper.enrageHookSpeedMul", MidBossSandreaperEnrageHookSpeedMul },
            { "midboss_sandreaper.enrageStormAdd", MidBossSandreaperEnrageStormAdd },
            { "midboss_sandreaper.enrageSpeedMul", MidBossSandreaperEnrageSpeedMul },
            { "midboss_sandreaper.enrageCdMul", MidBossSandreaperEnrageCdMul },
            { "midboss_sandreaper.runeDrop", MidBossSandreaperRuneDrop },
            { "boss_nanmir.hp", BossNanmirHp },
            { "boss_nanmir.atk", BossNanmirAtk },
            { "boss_nanmir.def", BossNanmirDef },
            { "boss_nanmir.speed", BossNanmirSpeed },
            { "boss_nanmir.bodyRadius", BossNanmirBodyRadius },
            { "boss_nanmir.phase2At", BossNanmirPhase2At },
            { "boss_nanmir.phase3At", BossNanmirPhase3At },
            { "boss_nanmir.staggerS", BossNanmirStaggerS },
            { "boss_nanmir.idleS", BossNanmirIdleS },
            { "boss_nanmir.sweep.telegraphS", BossNanmirSweepTelegraphS },
            { "boss_nanmir.sweep.radiusM", BossNanmirSweepRadiusM },
            { "boss_nanmir.sweep.rangeM", BossNanmirSweepRangeM },
            { "boss_nanmir.sweep.mult", BossNanmirSweepMult },
            { "boss_nanmir.rootline.telegraphS", BossNanmirRootlineTelegraphS },
            { "boss_nanmir.rootline.stepS", BossNanmirRootlineStepS },
            { "boss_nanmir.rootline.count", BossNanmirRootlineCount },
            { "boss_nanmir.rootline.spacingM", BossNanmirRootlineSpacingM },
            { "boss_nanmir.rootline.radiusM", BossNanmirRootlineRadiusM },
            { "boss_nanmir.rootline.mult", BossNanmirRootlineMult },
            { "boss_nanmir.spikegrid.telegraphS", BossNanmirSpikegridTelegraphS },
            { "boss_nanmir.spikegrid.count", BossNanmirSpikegridCount },
            { "boss_nanmir.spikegrid.spreadM", BossNanmirSpikegridSpreadM },
            { "boss_nanmir.spikegrid.radiusM", BossNanmirSpikegridRadiusM },
            { "boss_nanmir.spikegrid.mult", BossNanmirSpikegridMult },
            { "boss_nanmir.summonCount", BossNanmirSummonCount },
            { "boss_nanmir.storm.telegraphS", BossNanmirStormTelegraphS },
            { "boss_nanmir.storm.rings.0", BossNanmirStormRings0 },
            { "boss_nanmir.storm.rings.1", BossNanmirStormRings1 },
            { "boss_nanmir.storm.rings.2", BossNanmirStormRings2 },
            { "boss_nanmir.storm.perRing", BossNanmirStormPerRing },
            { "boss_nanmir.storm.gapLanes", BossNanmirStormGapLanes },
            { "boss_nanmir.storm.radiusM", BossNanmirStormRadiusM },
            { "boss_nanmir.storm.mult", BossNanmirStormMult },
            { "chapters.1.statMult", Ch1StatMult },
            { "chapters.1.lootMult", Ch1LootMult },
            { "chapters.1.lanternCost", Ch1LanternCost },
            { "chapters.1.unlockClears", Ch1UnlockClears },
            { "chapters.2.statMult", Ch2StatMult },
            { "chapters.2.lootMult", Ch2LootMult },
            { "chapters.2.lanternCost", Ch2LanternCost },
            { "chapters.2.unlockClears", Ch2UnlockClears },
            { "chapters.3.statMult", Ch3StatMult },
            { "chapters.3.lootMult", Ch3LootMult },
            { "chapters.3.lanternCost", Ch3LanternCost },
            { "chapters.3.unlockClears", Ch3UnlockClears },
            { "arena.widthM", ArenaWidthM },
            { "arena.heightM", ArenaHeightM },
            { "arena.dummyCount", ArenaDummyCount },
            { "arena.shroomTarget", ArenaShroomTarget },
            { "arena.beeTarget", ArenaBeeTarget },
            { "arena.wolfTarget", ArenaWolfTarget },
            { "arena.spawnInterval", ArenaSpawnInterval },
            { "tutorial.moveM", TutorialMoveM },
            { "tutorial.hintY", TutorialHintY },
            { "tutorial.saveSlots", TutorialSaveSlots },
            { "touch.aimRangeM", TouchAimRangeM },
            { "touch.aimStickyM", TouchAimStickyM },
            { "touch.aimLatchS", TouchAimLatchS },
            { "touch.shotReachFrac", TouchShotReachFrac },
            { "touch.autoAttackPadM", TouchAutoAttackPadM },
            { "touch.joyRadiusPx", TouchJoyRadiusPx },
            { "touch.joyDeadPx", TouchJoyDeadPx },
            { "touch.btnTouchPadPx", TouchBtnTouchPadPx },
            { "touch.safeMarginPx", TouchSafeMarginPx },
            { "touch.btnScale", TouchBtnScale },
            { "anim.idle.frames", AnimIdleFrames },
            { "anim.idle.fps", AnimIdleFps },
            { "anim.walk.frames", AnimWalkFrames },
            { "anim.walk.fps", AnimWalkFps },
            { "anim.atk.frames", AnimAtkFrames },
            { "anim.atk.fps", AnimAtkFps },
            { "anim.dash.frames", AnimDashFrames },
            { "anim.dash.fps", AnimDashFps },
            { "anim.cast.frames", AnimCastFrames },
            { "anim.cast.fps", AnimCastFps },
            { "anim.hurt.frames", AnimHurtFrames },
            { "anim.hurt.fps", AnimHurtFps },
            { "anim.die.frames", AnimDieFrames },
            { "anim.die.fps", AnimDieFps },
            { "anim.bobAmplitudePx", AnimBobAmplitudePx },
            { "player.hp", PlayerHp },
            { "player.atk", PlayerAtk },
            { "player.def", PlayerDef },
            { "player.moveSpeed", PlayerMoveSpeed },
            { "player.critRate", PlayerCritRate },
            { "player.critDmg", PlayerCritDmg },
            { "player.accelTime", PlayerAccelTime },
            { "player.decelTime", PlayerDecelTime },
            { "player.bodyRadius", PlayerBodyRadius },
            { "player.dash.duration", PlayerDashDuration },
            { "player.dash.distance", PlayerDashDistance },
            { "player.dash.iframes", PlayerDashIframes },
            { "player.dash.cooldown", PlayerDashCooldown },
            { "player.combo.mults.0", PlayerComboMults0 },
            { "player.combo.mults.1", PlayerComboMults1 },
            { "player.combo.mults.2", PlayerComboMults2 },
            { "player.combo.window", PlayerComboWindow },
            { "player.combo.attackTime.0", PlayerComboAttackTime0 },
            { "player.combo.attackTime.1", PlayerComboAttackTime1 },
            { "player.combo.attackTime.2", PlayerComboAttackTime2 },
            { "player.combo.range", PlayerComboRange },
            { "player.combo.arcDeg", PlayerComboArcDeg },
            { "player.combo.knockback3", PlayerComboKnockback3 },
            { "player.combo.moveSlow", PlayerComboMoveSlow },
            { "player.regen.delay", PlayerRegenDelay },
            { "player.regen.ratePct", PlayerRegenRatePct },
            { "player.respawn.delay", PlayerRespawnDelay },
            { "player.respawn.invuln", PlayerRespawnInvuln },
            { "reactions.markDurS", ReactionsMarkDurS },
            { "reactions.chainDecay", ReactionsChainDecay },
            { "reactions.maxDepth", ReactionsMaxDepth },
            { "reactions.steam.radiusM", ReactionsSteamRadiusM },
            { "reactions.steam.mult", ReactionsSteamMult },
            { "reactions.overload.mult", ReactionsOverloadMult },
            { "reactions.overload.knockM", ReactionsOverloadKnockM },
            { "reactions.miasma.radiusM", ReactionsMiasmaRadiusM },
            { "reactions.miasma.lifeS", ReactionsMiasmaLifeS },
            { "reactions.miasma.intervalS", ReactionsMiasmaIntervalS },
            { "reactions.miasma.mult", ReactionsMiasmaMult },
            { "reactions.chain.targets", ReactionsChainTargets },
            { "reactions.chain.rangeM", ReactionsChainRangeM },
            { "reactions.chain.mult", ReactionsChainMult },
            { "reactions.chain.slowPct", ReactionsChainSlowPct },
            { "reactions.chain.slowS", ReactionsChainSlowS },
            { "reactions.brittle.vulnS", ReactionsBrittleVulnS },
            { "reactions.brittle.pct", ReactionsBrittlePct },
            { "reactions.numb.stunS", ReactionsNumbStunS },
            { "specials.echoEvery", SpecialEchoEvery },
            { "specials.echoMult", SpecialEchoMult },
            { "specials.thornFrac", SpecialThornFrac },
            { "specials.thornRadiusM", SpecialThornRadiusM },
            { "specials.thornCap", SpecialThornCap },
            { "specials.soulfeastHeal", SpecialSoulfeastHeal },
            { "specials.tempestRangeMult", SpecialTempestRangeMult },
            { "specials.windhoodAtkPct", SpecialWindhoodAtkPct },
            { "specials.starhelmAtkPct", SpecialStarhelmAtkPct },
            { "specials.starhelmWindowS", SpecialStarhelmWindowS },
            { "specials.stoneheartThreshold", SpecialStoneheartThreshold },
            { "specials.stoneheartReduce", SpecialStoneheartReduce },
            { "specials.frostfangMarks", SpecialFrostfangMarks },
            { "specials.emberstrideBurnS", SpecialEmberstrideBurnS },
            { "consumables.shield.price", ConsumableShieldPrice },
            { "consumables.shield.capPct", ConsumableShieldCapPct },
            { "consumables.shield.durS", ConsumableShieldDurS },
            { "consumables.cleanse.price", ConsumableCleansePrice },
            { "consumables.cleanse.debuffMax", ConsumableCleanseDebuffMax },
            { "consumables.cleanse.iframesS", ConsumableCleanseIframesS },
            { "consumables.timeslow.price", ConsumableTimeslowPrice },
            { "consumables.timeslow.radiusM", ConsumableTimeslowRadiusM },
            { "consumables.timeslow.slowPct", ConsumableTimeslowSlowPct },
            { "consumables.timeslow.durS", ConsumableTimeslowDurS },
            { "consumables.timeslow.bossFactor", ConsumableTimeslowBossFactor },
            { "consumables.flask.price", ConsumableFlaskPrice },
            { "consumables.flask.elementS", ConsumableFlaskElementS },
            { "consumables.flask.chargeMax", ConsumableFlaskChargeMax },
            { "blueprint.shardsPerBoss", BlueprintShardsPerBoss },
            { "blueprint.nightBonus", BlueprintNightBonus },
            { "blueprint.craftCost", BlueprintCraftCost },
            { "blueprint.reforgeCost", BlueprintReforgeCost },
            { "blueprint.reforgeRerollMax", BlueprintReforgeRerollMax },
            { "blueprint.dropChance", BlueprintDropChance },
            { "shop.prices.rare", ShopPricesRare },
            { "shop.prices.epic", ShopPricesEpic },
            { "shop.prices.legendary", ShopPricesLegendary },
            { "shop.potionPrice", ShopPotionPrice },
            { "shop.runePrice", ShopRunePrice },
            { "shop.thirdStandWeights.rare", ShopThirdStandWeightsRare },
            { "shop.thirdStandWeights.epic", ShopThirdStandWeightsEpic },
            { "shop.thirdStandWeights.legendary", ShopThirdStandWeightsLegendary },
            { "shop.shelfRunes", ShopShelfRunes },
            { "shop.consStands", ShopConsStands },
            { "shop.priceJitter", ShopPriceJitter },
            { "shop.dealChance", ShopDealChance },
            { "shop.dealOff", ShopDealOff },
            { "shop.haggle.bigChance", ShopHaggleBigChance },
            { "shop.haggle.successChance", ShopHaggleSuccessChance },
            { "shop.haggle.luckPerPoint", ShopHaggleLuckPerPoint },
            { "shop.haggle.luckMax", ShopHaggleLuckMax },
            { "shop.haggle.bigOff", ShopHaggleBigOff },
            { "shop.haggle.off", ShopHaggleOff },
            { "shop.haggle.markup", ShopHaggleMarkup },
            { "events.bloodHpMult", EventBloodHpMult },
            { "events.blessingAtk", EventBlessingAtk },
            { "events.blessingSpeed", EventBlessingSpeed },
            { "events.fountainMin", EventFountainMin },
            { "events.fountainMax", EventFountainMax },
            { "events.totemPick", EventTotemPick },
            { "events.gambleCost", EventGambleCost },
            { "events.gambleMult", EventGambleMult },
            { "events.gambleWinChance", EventGambleWinChance },
            { "events.sacrificeHpFrac", EventSacrificeHpFrac },
            { "events.sacrificeCons", EventSacrificeCons },
            { "events.relicDustFallback", EventRelicDustFallback },
            { "events.echoFrac", EventEchoFrac },
            { "events.echoFallbackDust", EventEchoFallbackDust },
            { "events.mendHpMult", EventMendHpMult },
            { "events.repay.blood", EventRepayBlood },
            { "events.repay.blessing", EventRepayBlessing },
            { "events.repay.cons", EventRepayCons },
            { "events.repay.rune", EventRepayRune },
            { "events.repay.mend", EventRepayMend },
            { "events.eventLogMax", EventEventLogMax },
            { "abyss.levels.0.id", AbyssLevels0Id },
            { "abyss.levels.0.hpMult", AbyssLevels0HpMult },
            { "abyss.levels.0.atkMult", AbyssLevels0AtkMult },
            { "abyss.levels.0.lootMult", AbyssLevels0LootMult },
            { "abyss.levels.0.dustMult", AbyssLevels0DustMult },
            { "abyss.levels.0.unlockClears", AbyssLevels0UnlockClears },
            { "abyss.levels.0.unlockAbyss", AbyssLevels0UnlockAbyss },
            { "abyss.levels.0.eliteWaves", AbyssLevels0EliteWaves },
            { "abyss.levels.1.id", AbyssLevels1Id },
            { "abyss.levels.1.hpMult", AbyssLevels1HpMult },
            { "abyss.levels.1.atkMult", AbyssLevels1AtkMult },
            { "abyss.levels.1.lootMult", AbyssLevels1LootMult },
            { "abyss.levels.1.dustMult", AbyssLevels1DustMult },
            { "abyss.levels.1.unlockClears", AbyssLevels1UnlockClears },
            { "abyss.levels.1.unlockAbyss", AbyssLevels1UnlockAbyss },
            { "abyss.levels.1.eliteWaves", AbyssLevels1EliteWaves },
            { "abyss.levels.2.id", AbyssLevels2Id },
            { "abyss.levels.2.hpMult", AbyssLevels2HpMult },
            { "abyss.levels.2.atkMult", AbyssLevels2AtkMult },
            { "abyss.levels.2.lootMult", AbyssLevels2LootMult },
            { "abyss.levels.2.dustMult", AbyssLevels2DustMult },
            { "abyss.levels.2.unlockClears", AbyssLevels2UnlockClears },
            { "abyss.levels.2.unlockAbyss", AbyssLevels2UnlockAbyss },
            { "abyss.levels.2.eliteWaves", AbyssLevels2EliteWaves },
            { "abyss.nightBonusMult", AbyssNightBonusMult },
            { "endless.loopHp", EndlessLoopHp },
            { "endless.loopAtk", EndlessLoopAtk },
            { "endless.loopLoot", EndlessLoopLoot },
            { "endless.loopDust", EndlessLoopDust },
            { "endless.maxMult", EndlessMaxMult },
            { "endless.maxHp", EndlessMaxHp },
            { "endless.maxAtk", EndlessMaxAtk },
            { "endless.unlockClears", EndlessUnlockClears },
        };
    }

    /// <summary>
    /// 四职业普攻档案(web: game/combat/BasicAttack.ts)。同样由生成器产出:
    /// 段数/倍率/前冲/破甲/穿透/溅射这些**行为参数**一旦两边漂移,玩法就不一样了,所以逐键 parity。
    /// </summary>
    public static class BestiaryKlass
    {
        /// <summary>classes.blade.combo.mults.0</summary>
        public const float KlassBladeComboMults0 = 1f;
        /// <summary>classes.blade.combo.mults.1</summary>
        public const float KlassBladeComboMults1 = 1f;
        /// <summary>classes.blade.combo.mults.2</summary>
        public const float KlassBladeComboMults2 = 1.6f;
        /// <summary>classes.blade.combo.window</summary>
        public const float KlassBladeComboWindow = 0.6f;
        /// <summary>classes.blade.combo.attackTime.0</summary>
        public const float KlassBladeComboAttackTime0 = 0.2f;
        /// <summary>classes.blade.combo.attackTime.1</summary>
        public const float KlassBladeComboAttackTime1 = 0.2f;
        /// <summary>classes.blade.combo.attackTime.2</summary>
        public const float KlassBladeComboAttackTime2 = 0.28f;
        /// <summary>classes.blade.combo.range</summary>
        public const float KlassBladeComboRange = 2.2f;
        /// <summary>classes.blade.combo.arcDeg</summary>
        public const float KlassBladeComboArcDeg = 110f;
        /// <summary>classes.blade.combo.knockback3</summary>
        public const float KlassBladeComboKnockback3 = 6f;
        /// <summary>classes.blade.combo.moveSlow</summary>
        public const float KlassBladeComboMoveSlow = 0.35f;
        /// <summary>classes.blade.combo.lungeM</summary>
        public const float KlassBladeComboLungeM = 0.6f;
        /// <summary>classes.blade.combo.vulnOnHitS</summary>
        public const float KlassBladeComboVulnOnHitS = 0f;
        /// <summary>classes.ranger.bow.rateS</summary>
        public const float KlassRangerBowRateS = 0.38f;
        /// <summary>classes.ranger.bow.mult</summary>
        public const float KlassRangerBowMult = 0.6f;
        /// <summary>classes.ranger.bow.speedM</summary>
        public const float KlassRangerBowSpeedM = 11f;
        /// <summary>classes.ranger.bow.radiusM</summary>
        public const float KlassRangerBowRadiusM = 0.12f;
        /// <summary>classes.ranger.bow.lifeS</summary>
        public const float KlassRangerBowLifeS = 0.9f;
        /// <summary>classes.ranger.bow.heavyEvery</summary>
        public const float KlassRangerBowHeavyEvery = 4f;
        /// <summary>classes.ranger.bow.heavyMult</summary>
        public const float KlassRangerBowHeavyMult = 1.35f;
        /// <summary>classes.ranger.bow.pierce</summary>
        public const float KlassRangerBowPierce = 1f;
        /// <summary>classes.ranger.bow.splashM</summary>
        public const float KlassRangerBowSplashM = 0f;
        /// <summary>classes.ranger.bow.splashMult</summary>
        public const float KlassRangerBowSplashMult = 0.6f;
        /// <summary>classes.ranger.bow.moveSlowPct</summary>
        public const float KlassRangerBowMoveSlowPct = 1f;
        /// <summary>classes.arcanist.bow.rateS</summary>
        public const float KlassArcanistBowRateS = 0.5f;
        /// <summary>classes.arcanist.bow.mult</summary>
        public const float KlassArcanistBowMult = 0.85f;
        /// <summary>classes.arcanist.bow.speedM</summary>
        public const float KlassArcanistBowSpeedM = 9f;
        /// <summary>classes.arcanist.bow.radiusM</summary>
        public const float KlassArcanistBowRadiusM = 0.18f;
        /// <summary>classes.arcanist.bow.lifeS</summary>
        public const float KlassArcanistBowLifeS = 1.1f;
        /// <summary>classes.arcanist.bow.heavyEvery</summary>
        public const float KlassArcanistBowHeavyEvery = 3f;
        /// <summary>classes.arcanist.bow.heavyMult</summary>
        public const float KlassArcanistBowHeavyMult = 1.4f;
        /// <summary>classes.arcanist.bow.splashM</summary>
        public const float KlassArcanistBowSplashM = 0.9f;
        /// <summary>classes.arcanist.bow.moveSlowPct</summary>
        public const float KlassArcanistBowMoveSlowPct = 0.55f;
        /// <summary>classes.arcanist.bow.pierce</summary>
        public const float KlassArcanistBowPierce = 0f;
        /// <summary>classes.arcanist.bow.splashMult</summary>
        public const float KlassArcanistBowSplashMult = 0.6f;
        /// <summary>classes.warden.combo.attackTime.0</summary>
        public const float KlassWardenComboAttackTime0 = 0.42f;
        /// <summary>classes.warden.combo.attackTime.1</summary>
        public const float KlassWardenComboAttackTime1 = 0.42f;
        /// <summary>classes.warden.combo.attackTime.2</summary>
        public const float KlassWardenComboAttackTime2 = 0.6f;
        /// <summary>classes.warden.combo.mults.0</summary>
        public const float KlassWardenComboMults0 = 1.2f;
        /// <summary>classes.warden.combo.mults.1</summary>
        public const float KlassWardenComboMults1 = 1.2f;
        /// <summary>classes.warden.combo.mults.2</summary>
        public const float KlassWardenComboMults2 = 2f;
        /// <summary>classes.warden.combo.arcDeg</summary>
        public const float KlassWardenComboArcDeg = 130f;
        /// <summary>classes.warden.combo.range</summary>
        public const float KlassWardenComboRange = 2f;
        /// <summary>classes.warden.combo.knockback3</summary>
        public const float KlassWardenComboKnockback3 = 2.5f;
        /// <summary>classes.warden.combo.moveSlow</summary>
        public const float KlassWardenComboMoveSlow = 0.3f;
        /// <summary>classes.warden.combo.window</summary>
        public const float KlassWardenComboWindow = 0.9f;
        /// <summary>classes.warden.combo.lungeM</summary>
        public const float KlassWardenComboLungeM = 0.25f;
        /// <summary>classes.warden.combo.vulnOnHitS</summary>
        public const float KlassWardenComboVulnOnHitS = 2f;
        public static readonly float[] KlassBladeComboAttackTimeS = { KlassBladeComboAttackTime0, KlassBladeComboAttackTime1, KlassBladeComboAttackTime2 };
        public static readonly float[] KlassBladeComboMultsS = { KlassBladeComboMults0, KlassBladeComboMults1, KlassBladeComboMults2 };
        public static readonly float[] KlassWardenComboAttackTimeS = { KlassWardenComboAttackTime0, KlassWardenComboAttackTime1, KlassWardenComboAttackTime2 };
        public static readonly float[] KlassWardenComboMultsS = { KlassWardenComboMults0, KlassWardenComboMults1, KlassWardenComboMults2 };

        public static readonly Dictionary<string, float> Parity = new()
        {
            { "classes.blade.combo.mults.0", KlassBladeComboMults0 },
            { "classes.blade.combo.mults.1", KlassBladeComboMults1 },
            { "classes.blade.combo.mults.2", KlassBladeComboMults2 },
            { "classes.blade.combo.window", KlassBladeComboWindow },
            { "classes.blade.combo.attackTime.0", KlassBladeComboAttackTime0 },
            { "classes.blade.combo.attackTime.1", KlassBladeComboAttackTime1 },
            { "classes.blade.combo.attackTime.2", KlassBladeComboAttackTime2 },
            { "classes.blade.combo.range", KlassBladeComboRange },
            { "classes.blade.combo.arcDeg", KlassBladeComboArcDeg },
            { "classes.blade.combo.knockback3", KlassBladeComboKnockback3 },
            { "classes.blade.combo.moveSlow", KlassBladeComboMoveSlow },
            { "classes.blade.combo.lungeM", KlassBladeComboLungeM },
            { "classes.blade.combo.vulnOnHitS", KlassBladeComboVulnOnHitS },
            { "classes.ranger.bow.rateS", KlassRangerBowRateS },
            { "classes.ranger.bow.mult", KlassRangerBowMult },
            { "classes.ranger.bow.speedM", KlassRangerBowSpeedM },
            { "classes.ranger.bow.radiusM", KlassRangerBowRadiusM },
            { "classes.ranger.bow.lifeS", KlassRangerBowLifeS },
            { "classes.ranger.bow.heavyEvery", KlassRangerBowHeavyEvery },
            { "classes.ranger.bow.heavyMult", KlassRangerBowHeavyMult },
            { "classes.ranger.bow.pierce", KlassRangerBowPierce },
            { "classes.ranger.bow.splashM", KlassRangerBowSplashM },
            { "classes.ranger.bow.splashMult", KlassRangerBowSplashMult },
            { "classes.ranger.bow.moveSlowPct", KlassRangerBowMoveSlowPct },
            { "classes.arcanist.bow.rateS", KlassArcanistBowRateS },
            { "classes.arcanist.bow.mult", KlassArcanistBowMult },
            { "classes.arcanist.bow.speedM", KlassArcanistBowSpeedM },
            { "classes.arcanist.bow.radiusM", KlassArcanistBowRadiusM },
            { "classes.arcanist.bow.lifeS", KlassArcanistBowLifeS },
            { "classes.arcanist.bow.heavyEvery", KlassArcanistBowHeavyEvery },
            { "classes.arcanist.bow.heavyMult", KlassArcanistBowHeavyMult },
            { "classes.arcanist.bow.splashM", KlassArcanistBowSplashM },
            { "classes.arcanist.bow.moveSlowPct", KlassArcanistBowMoveSlowPct },
            { "classes.arcanist.bow.pierce", KlassArcanistBowPierce },
            { "classes.arcanist.bow.splashMult", KlassArcanistBowSplashMult },
            { "classes.warden.combo.attackTime.0", KlassWardenComboAttackTime0 },
            { "classes.warden.combo.attackTime.1", KlassWardenComboAttackTime1 },
            { "classes.warden.combo.attackTime.2", KlassWardenComboAttackTime2 },
            { "classes.warden.combo.mults.0", KlassWardenComboMults0 },
            { "classes.warden.combo.mults.1", KlassWardenComboMults1 },
            { "classes.warden.combo.mults.2", KlassWardenComboMults2 },
            { "classes.warden.combo.arcDeg", KlassWardenComboArcDeg },
            { "classes.warden.combo.range", KlassWardenComboRange },
            { "classes.warden.combo.knockback3", KlassWardenComboKnockback3 },
            { "classes.warden.combo.moveSlow", KlassWardenComboMoveSlow },
            { "classes.warden.combo.window", KlassWardenComboWindow },
            { "classes.warden.combo.lungeM", KlassWardenComboLungeM },
            { "classes.warden.combo.vulnOnHitS", KlassWardenComboVulnOnHitS },
        };
    }


    /// <summary>
    /// 元素反应数值(reactions 段)—— 由 balance.json 生成。
    /// 为什么必须生成:这几个数以前是 `Data/Balance.cs` 里手抄的,**而且全漂了**
    /// (蒸汽 0.9 vs 1.8、超载 1.6 vs 2.2、脆蚀 +20% vs +25%、麻痹 0.8s vs 1.2s),
    /// 根因是 `reactions` 段从来没进 parity —— 手抄必错,只有 parity 能自动发现。
    /// </summary>
    public static class BestiaryReactions
    {
        /// <summary>reactions.markDurS</summary>
        public const float ReactionsMarkDurS = 4f;
        /// <summary>reactions.chainDecay</summary>
        public const float ReactionsChainDecay = 0.8f;
        /// <summary>reactions.maxDepth</summary>
        public const float ReactionsMaxDepth = 4f;
        /// <summary>reactions.steam.radiusM</summary>
        public const float ReactionsSteamRadiusM = 2f;
        /// <summary>reactions.steam.mult</summary>
        public const float ReactionsSteamMult = 1.8f;
        /// <summary>reactions.overload.mult</summary>
        public const float ReactionsOverloadMult = 2.2f;
        /// <summary>reactions.overload.knockM</summary>
        public const float ReactionsOverloadKnockM = 2f;
        /// <summary>reactions.miasma.radiusM</summary>
        public const float ReactionsMiasmaRadiusM = 1.5f;
        /// <summary>reactions.miasma.lifeS</summary>
        public const float ReactionsMiasmaLifeS = 3f;
        /// <summary>reactions.miasma.intervalS</summary>
        public const float ReactionsMiasmaIntervalS = 0.5f;
        /// <summary>reactions.miasma.mult</summary>
        public const float ReactionsMiasmaMult = 0.4f;
        /// <summary>reactions.chain.targets</summary>
        public const float ReactionsChainTargets = 4f;
        /// <summary>reactions.chain.rangeM</summary>
        public const float ReactionsChainRangeM = 4f;
        /// <summary>reactions.chain.mult</summary>
        public const float ReactionsChainMult = 0.8f;
        /// <summary>reactions.chain.slowPct</summary>
        public const float ReactionsChainSlowPct = 0.4f;
        /// <summary>reactions.chain.slowS</summary>
        public const float ReactionsChainSlowS = 2f;
        /// <summary>reactions.brittle.vulnS</summary>
        public const float ReactionsBrittleVulnS = 4f;
        /// <summary>reactions.brittle.pct</summary>
        public const float ReactionsBrittlePct = 0.25f;
        /// <summary>reactions.numb.stunS</summary>
        public const float ReactionsNumbStunS = 1.2f;

        public static readonly Dictionary<string, float> Parity = new()
        {
            { "reactions.markDurS", ReactionsMarkDurS },
            { "reactions.chainDecay", ReactionsChainDecay },
            { "reactions.maxDepth", ReactionsMaxDepth },
            { "reactions.steam.radiusM", ReactionsSteamRadiusM },
            { "reactions.steam.mult", ReactionsSteamMult },
            { "reactions.overload.mult", ReactionsOverloadMult },
            { "reactions.overload.knockM", ReactionsOverloadKnockM },
            { "reactions.miasma.radiusM", ReactionsMiasmaRadiusM },
            { "reactions.miasma.lifeS", ReactionsMiasmaLifeS },
            { "reactions.miasma.intervalS", ReactionsMiasmaIntervalS },
            { "reactions.miasma.mult", ReactionsMiasmaMult },
            { "reactions.chain.targets", ReactionsChainTargets },
            { "reactions.chain.rangeM", ReactionsChainRangeM },
            { "reactions.chain.mult", ReactionsChainMult },
            { "reactions.chain.slowPct", ReactionsChainSlowPct },
            { "reactions.chain.slowS", ReactionsChainSlowS },
            { "reactions.brittle.vulnS", ReactionsBrittleVulnS },
            { "reactions.brittle.pct", ReactionsBrittlePct },
            { "reactions.numb.stunS", ReactionsNumbStunS },
        };
    }


    /// <summary>
    /// 玩家基准数值(player 段)—— 与 <see cref="Bestiary"/> 同样由 balance.json 生成。
    /// 为什么单独一类:它是"玩家"而不是"敌人图鉴";为什么也必须生成:手抄的旧常量已经漂了
    /// (hp 100/atk 12/速度 4.6 vs 真实 120/14/4.2),而 parity 是唯一能自动发现的机制。
    /// </summary>
    public static class BestiaryPlayer
    {
        /// <summary>player.hp</summary>
        public const float PlayerHp = 120f;
        /// <summary>player.atk</summary>
        public const float PlayerAtk = 14f;
        /// <summary>player.def</summary>
        public const float PlayerDef = 6f;
        /// <summary>player.moveSpeed</summary>
        public const float PlayerMoveSpeed = 4.2f;
        /// <summary>player.critRate</summary>
        public const float PlayerCritRate = 0.05f;
        /// <summary>player.critDmg</summary>
        public const float PlayerCritDmg = 1.5f;
        /// <summary>player.accelTime</summary>
        public const float PlayerAccelTime = 0.08f;
        /// <summary>player.decelTime</summary>
        public const float PlayerDecelTime = 0.05f;
        /// <summary>player.bodyRadius</summary>
        public const float PlayerBodyRadius = 0.32f;
        /// <summary>player.dash.duration</summary>
        public const float PlayerDashDuration = 0.22f;
        /// <summary>player.dash.distance</summary>
        public const float PlayerDashDistance = 2.8f;
        /// <summary>player.dash.iframes</summary>
        public const float PlayerDashIframes = 0.35f;
        /// <summary>player.dash.cooldown</summary>
        public const float PlayerDashCooldown = 1.2f;
        /// <summary>player.combo.mults.0</summary>
        public const float PlayerComboMults0 = 1f;
        /// <summary>player.combo.mults.1</summary>
        public const float PlayerComboMults1 = 1f;
        /// <summary>player.combo.mults.2</summary>
        public const float PlayerComboMults2 = 1.6f;
        /// <summary>player.combo.window</summary>
        public const float PlayerComboWindow = 0.6f;
        /// <summary>player.combo.attackTime.0</summary>
        public const float PlayerComboAttackTime0 = 0.2f;
        /// <summary>player.combo.attackTime.1</summary>
        public const float PlayerComboAttackTime1 = 0.2f;
        /// <summary>player.combo.attackTime.2</summary>
        public const float PlayerComboAttackTime2 = 0.28f;
        /// <summary>player.combo.range</summary>
        public const float PlayerComboRange = 2.2f;
        /// <summary>player.combo.arcDeg</summary>
        public const float PlayerComboArcDeg = 110f;
        /// <summary>player.combo.knockback3</summary>
        public const float PlayerComboKnockback3 = 6f;
        /// <summary>player.combo.moveSlow</summary>
        public const float PlayerComboMoveSlow = 0.35f;
        /// <summary>player.regen.delay</summary>
        public const float PlayerRegenDelay = 4f;
        /// <summary>player.regen.ratePct</summary>
        public const float PlayerRegenRatePct = 0.06f;
        /// <summary>player.respawn.delay</summary>
        public const float PlayerRespawnDelay = 1.5f;
        /// <summary>player.respawn.invuln</summary>
        public const float PlayerRespawnInvuln = 2f;

        public static readonly Dictionary<string, float> Parity = new()
        {
            { "player.hp", PlayerHp },
            { "player.atk", PlayerAtk },
            { "player.def", PlayerDef },
            { "player.moveSpeed", PlayerMoveSpeed },
            { "player.critRate", PlayerCritRate },
            { "player.critDmg", PlayerCritDmg },
            { "player.accelTime", PlayerAccelTime },
            { "player.decelTime", PlayerDecelTime },
            { "player.bodyRadius", PlayerBodyRadius },
            { "player.dash.duration", PlayerDashDuration },
            { "player.dash.distance", PlayerDashDistance },
            { "player.dash.iframes", PlayerDashIframes },
            { "player.dash.cooldown", PlayerDashCooldown },
            { "player.combo.mults.0", PlayerComboMults0 },
            { "player.combo.mults.1", PlayerComboMults1 },
            { "player.combo.mults.2", PlayerComboMults2 },
            { "player.combo.window", PlayerComboWindow },
            { "player.combo.attackTime.0", PlayerComboAttackTime0 },
            { "player.combo.attackTime.1", PlayerComboAttackTime1 },
            { "player.combo.attackTime.2", PlayerComboAttackTime2 },
            { "player.combo.range", PlayerComboRange },
            { "player.combo.arcDeg", PlayerComboArcDeg },
            { "player.combo.knockback3", PlayerComboKnockback3 },
            { "player.combo.moveSlow", PlayerComboMoveSlow },
            { "player.regen.delay", PlayerRegenDelay },
            { "player.regen.ratePct", PlayerRegenRatePct },
            { "player.respawn.delay", PlayerRespawnDelay },
            { "player.respawn.invuln", PlayerRespawnInvuln },
        };
    }
}