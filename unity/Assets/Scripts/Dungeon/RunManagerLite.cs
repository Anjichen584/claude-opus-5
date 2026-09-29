using System;
using System.Collections.Generic;
using StarfallKnights.Core;
using StarfallKnights.Data;

namespace StarfallKnights.Dungeon
{
    public enum RoomKind { Battle, Treasure, Elite, MidBoss, Boss }

    /// <summary>
    /// 房间推进(镜像 web RunManager):8 房 + Boss。序列
    /// 0战 → 1战 → 2宝藏 → 3战 → 4精英 → 5战 → 6战 → 7Boss(与 balance.rooms.count=8/eliteIndex=4 对齐);
    /// 三章各有自己的出怪池与精英编成,Boss 按章节选(南弥尔/薇尔莎/卡兹拉)。
    /// 实体生成/传送门交宿主(OnSpawn/OnRoomCleared/OnVictory)。
    /// </summary>
    public sealed class RunManagerLite
    {
        /// <summary>出怪池行:[种类, 权重, 预算消耗, 解锁深度](镜像 RunManager.spawnWave)。</summary>
        public readonly struct PoolRow
        {
            public readonly EnemyKind Kind;
            public readonly int Weight, Cost, MinDepth;
            public PoolRow(EnemyKind kind, int weight, int cost, int minDepth)
            {
                Kind = kind; Weight = weight; Cost = cost; MinDepth = minDepth;
            }
        }

        // ---- 三章出怪池(balance.rooms 的预算制;权重/消耗/解锁深度与 web 一致)----
        private static readonly PoolRow[] Ch1Pool =
        {
            new(EnemyKind.Shroomling, 30, 1, 0),
            new(EnemyKind.WindBee, 22, 1, 0),
            new(EnemyKind.FrostSlime, 16, 2, 1),
            new(EnemyKind.SparkLizard, 14, 1, 1),
            new(EnemyKind.EmberImp, 14, 2, 2),
            new(EnemyKind.ToxinToad, 12, 2, 2),
            new(EnemyKind.ThornVine, 10, 2, 2),
            new(EnemyKind.BlightWolf, 12, 2, 3),
        };

        private static readonly PoolRow[] Ch2Pool =
        {
            new(EnemyKind.SnowPuff, 30, 1, 0),
            new(EnemyKind.BlizzardHawk, 20, 1, 0),
            new(EnemyKind.FrostMage, 16, 2, 1),
            new(EnemyKind.SparkLizard, 12, 1, 1),
            new(EnemyKind.IceTurtle, 14, 2, 2),
            new(EnemyKind.EmberImp, 10, 2, 3),
        };

        private static readonly PoolRow[] Ch3Pool =
        {
            new(EnemyKind.CinderRat, 30, 1, 0),
            new(EnemyKind.DustStinger, 18, 2, 0),
            new(EnemyKind.FlameDancer, 16, 2, 1),
            new(EnemyKind.SparkLizard, 12, 1, 1),
            new(EnemyKind.DuneBeetle, 16, 2, 2),
            new(EnemyKind.FrostSlime, 10, 2, 3),
        };

        /// <summary>精英房固定编成(镜像 RunManager 的 elite 分支)。</summary>
        public static readonly Dictionary<int, EnemyKind[]> EliteComp = new()
        {
            { 1, new[] { EnemyKind.OakGolem, EnemyKind.ThornVine, EnemyKind.BlightWolf, EnemyKind.EmberImp, EnemyKind.EmberImp, EnemyKind.WindBee, EnemyKind.WindBee, EnemyKind.WindBee } },
            { 2, new[] { EnemyKind.IceTurtle, EnemyKind.IceTurtle, EnemyKind.FrostMage, EnemyKind.FrostMage, EnemyKind.BlizzardHawk, EnemyKind.BlizzardHawk, EnemyKind.BlizzardHawk } },
            { 3, new[] { EnemyKind.DuneBeetle, EnemyKind.DuneBeetle, EnemyKind.FlameDancer, EnemyKind.DustStinger, EnemyKind.CinderRat, EnemyKind.CinderRat, EnemyKind.CinderRat, EnemyKind.CinderRat } },
        };

        public int Depth { get; private set; } = -1;
        public RoomKind Room { get; private set; } = RoomKind.Battle;
        public bool Cleared { get; private set; }

        /// <summary>当前章节(1/2/3;镜像 web RunManager.chapter,由营地/菜单选择)。</summary>
        public int Chapter { get; private set; } = 1;

        /// <summary>章节配置(名称/乘区/星灯价)。</summary>
        public Bestiary.Chapter ChapterCfg => Bestiary.ChapterOf(Chapter);

        /// <summary>宿主实现:实例化敌人(种类 + 已缩放的血/攻/速)。</summary>
        public Action<EnemyKind, float, float, float> OnSpawn;
        /// <summary>房间清空(宿主放传送门/奖励)。</summary>
        public Action<RoomKind> OnRoomCleared;
        /// <summary>Boss 死亡 = 通关。</summary>
        public Action OnVictory;
        /// <summary>房间开始(宿主播报章节/房间类型/预警清理)。</summary>
        public Action<RoomKind, int> OnRoomStart;

        private readonly Random _rng = new();
        private const int RoomCount = 8;      // 镜像 balance.rooms.count
        private const int EliteIndex = 4;     // 镜像 balance.rooms.eliteIndex
        private const int MidBossIndex = 6;   // 镜像 balance.rooms.midbossIndex
        private const int BudgetBase = 6;     // 镜像 balance.rooms.waveBudgetBase
        private const int BudgetPerDepth = 2;

        /// <summary>切换章节(重开一局时调用;章 1 无乘区,章 2/3 走 statMult)。</summary>
        public void SetChapter(int chapter)
        {
            Chapter = chapter < 1 ? 1 : chapter > 3 ? 3 : chapter;
            Depth = -1;
            Cleared = false;
        }

        public int CurrentChapter => Chapter;

        /// <summary>本章杂兵缩放(章节乘区 × 深度 × 夜间;Boss 不吃章节乘区,它自己表里已调好)。</summary>
        public (float hp, float atk) Scale(Bestiary.Stat s, bool night, bool boss)
        {
            float mul = boss ? 1f : ChapterCfg.StatMult;
            // 镜像 web:Boss 用 depth 0 缩放(它自己表里已按章调好),杂兵才吃房间深度
            int depth = boss ? 0 : (Depth < 0 ? 0 : Depth);
            return (Balance.ScaleHp(s.Hp, depth, night) * mul,
                    Balance.ScaleAtk(s.Atk, depth, night) * mul);
        }

        /// <summary>进入下一房。返回 false 表示已通关序列。</summary>
        public bool NextRoom(LogicWorld w)
        {
            Depth++;
            if (Depth >= RoomCount) return false;
            Room = Depth == RoomCount - 1 ? RoomKind.Boss
                : Depth == MidBossIndex && Chapter == 1 ? RoomKind.MidBoss   // 二三章中 Boss 未做(镜像 web 的章节门控)
                : Depth == EliteIndex ? RoomKind.Elite
                : Depth == 2 || Depth == 5 ? RoomKind.Treasure
                : RoomKind.Battle;
            Cleared = Room == RoomKind.Treasure;
            OnRoomStart?.Invoke(Room, Depth);
            SpawnWave(w);
            return true;
        }

        /// <summary>每帧:清房判定。</summary>
        public void Tick(LogicWorld w)
        {
            if (Cleared) return;
            if (w.Enemies.Count == 0)
            {
                Cleared = true;
                if (Room == RoomKind.Boss) OnVictory?.Invoke();
                else OnRoomCleared?.Invoke(Room);
            }
        }

        private void SpawnWave(LogicWorld w)
        {
            bool night = w.Clock.IsNight;

            void Spawn(EnemyKind k)
            {
                var s = Bestiary.Of(k);
                var (hp, atk) = Scale(s, night, EnemyKinds.IsBoss(k));
                OnSpawn?.Invoke(k, hp, atk, s.Speed);
            }

            switch (Room)
            {
                case RoomKind.Treasure:
                    return;
                case RoomKind.Boss:
                    Spawn(EnemyKinds.BossOf(Chapter));
                    return;
                case RoomKind.MidBoss:
                    // 中 Boss 房:只刷一只(它自己就是这场战斗的压力)
                    Spawn(EnemyKind.MidBossMossstag);
                    return;
                case RoomKind.Elite:
                {
                    var comp = EliteComp.TryGetValue(Chapter, out var c) ? c : EliteComp[1];
                    foreach (var k in comp) Spawn(k);
                    return;
                }
                default:
                {
                    var pool = Chapter == 3 ? Ch3Pool : Chapter == 2 ? Ch2Pool : Ch1Pool;
                    int budget = BudgetBase + Depth * BudgetPerDepth;
                    int total = 0;
                    foreach (var p in pool) if (Depth >= p.MinDepth) total += p.Weight;
                    int guard = 60;
                    while (budget > 0 && guard-- > 0 && total > 0)
                    {
                        int roll = _rng.Next(total);
                        foreach (var p in pool)
                        {
                            if (Depth < p.MinDepth) continue;
                            roll -= p.Weight;
                            if (roll >= 0) continue;
                            Spawn(p.Kind);
                            budget -= p.Cost;
                            break;
                        }
                    }
                    return;
                }
            }
        }
    }
}
