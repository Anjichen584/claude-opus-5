using System.Numerics;
using StarfallKnights.Combat;

namespace StarfallKnights.Core
{
    /// <summary>敌人种类(全 21 种:一章基础+元素杂兵+二三章+三 Boss,镜像 balance.enemies)。</summary>
    public enum EnemyKind
    {
        // 一章 翠语林地 基础
        Shroomling, WindBee, BlightWolf, ThornVine, OakGolem,
        // 元素杂兵(三章通用)
        EmberImp, FrostSlime, SparkLizard, ToxinToad, StardustSprite,
        // 二章 霜语冰原
        SnowPuff, IceTurtle, BlizzardHawk, FrostMage,
        // 三章 烬语荒漠
        CinderRat, DuneBeetle, FlameDancer, DustStinger,
        // 中 Boss(每章 1 只,推图第 6 房)
        MidBossMossstag,
        MidBossFrosthuntress,
        // Boss
        BossNanmir, BossVelsha, BossKazra,
    }

    /// <summary>敌人分类查询(章节归属 / 是否 Boss)。</summary>
    public static class EnemyKinds
    {
        /// <summary>所属章节(1/2/3;元素杂兵与精灵按 1 章算,它们三章都会出现)。</summary>
        public static int ChapterOf(EnemyKind k) => k switch
        {
            EnemyKind.SnowPuff or EnemyKind.IceTurtle or EnemyKind.BlizzardHawk
                or EnemyKind.FrostMage or EnemyKind.BossVelsha or EnemyKind.MidBossFrosthuntress => 2,
            EnemyKind.CinderRat or EnemyKind.DuneBeetle or EnemyKind.FlameDancer
                or EnemyKind.DustStinger or EnemyKind.BossKazra => 3,
            _ => 1,
        };

        public static bool IsBoss(EnemyKind k)
            => k == EnemyKind.BossNanmir || k == EnemyKind.BossVelsha || k == EnemyKind.BossKazra;

        /// <summary>中 Boss(推图中段的"半个 Boss")。</summary>
        public static bool IsMidBoss(EnemyKind k) => k == EnemyKind.MidBossMossstag || k == EnemyKind.MidBossFrosthuntress;

        /// <summary>Boss 级(中 Boss + 章 Boss):图鉴带 ★、掉落保底符文。</summary>
        public static bool IsBossTier(EnemyKind k) => IsBoss(k) || IsMidBoss(k);

        /// <summary>章节 Boss。</summary>
        public static EnemyKind BossOf(int chapter) => chapter switch
        {
            2 => EnemyKind.BossVelsha,
            3 => EnemyKind.BossKazra,
            _ => EnemyKind.BossNanmir,
        };
    }

    /// <summary>
    /// 逻辑层演员:位置+速度+战斗单元(纯 C#,System.Numerics.Vector2)。
    /// Unity 侧 MonoBehaviour 持有一个 Actor 并同步 transform。
    /// </summary>
    public sealed class Actor
    {
        public Vector2 Pos;
        public Vector2 Vel;
        public readonly CombatUnit Unit = new();
        public EnemyKind Kind;
        public bool IsPlayer;
        /// <summary>朝向(弧度)。</summary>
        public float Face;
    }
}
