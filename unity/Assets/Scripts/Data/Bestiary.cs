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
            { EnemyKind.BossVelsha, new Stat("霜语女妖·薇尔莎", 5200f, 16f, 3f, 2f, 0.55f, 0.8f) },
            { EnemyKind.CinderRat, new Stat("烬鼠", 26f, 10f, 0f, 3.8f, 0.22f, 0.7f) },
            { EnemyKind.DuneBeetle, new Stat("沙暴甲虫", 80f, 13f, 3f, 1.4f, 0.36f, 0.9f) },
            { EnemyKind.FlameDancer, new Stat("火舞妖", 38f, 11f, 0f, 2.4f, 0.26f, 0.8f) },
            { EnemyKind.DustStinger, new Stat("岩尾蝎", 60f, 10f, 2f, 1.6f, 0.32f, 0.9f) },
            { EnemyKind.BossKazra, new Stat("熔核蝎皇·卡兹拉", 6400f, 18f, 4f, 2.2f, 0.6f, 0.8f) },
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

}
