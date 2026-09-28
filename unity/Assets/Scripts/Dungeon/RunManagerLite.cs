using System;
using System.Collections.Generic;
using StarfallKnights.Core;
using StarfallKnights.Data;

namespace StarfallKnights.Dungeon
{
    public enum RoomKind { Battle, Treasure, Elite, Boss }

    /// <summary>
    /// 房间推进(镜像 web RunManager 第一章序列):
    /// 0-1战斗 → 2宝藏 → 3战斗 → 4精英 → 5战斗 → 6-7战斗 → 8Boss;
    /// 战斗房按预算加权出怪,夜间增强。实体生成/传送门交宿主(OnSpawn/OnRoomCleared)。
    /// </summary>
    public sealed class RunManagerLite
    {
        /// <summary>敌人基础表(hp, atk, speed m/s)——镜像 balance.enemies 第一章。</summary>
        public static readonly Dictionary<EnemyKind, (float hp, float atk, float speed)> STATS = new()
        {
            { EnemyKind.Shroomling, (45, 8, 1.9f) },
            { EnemyKind.WindBee, (30, 7, 3.2f) },
            { EnemyKind.BlightWolf, (90, 14, 4.8f) },
            { EnemyKind.ThornVine, (70, 10, 0f) },
            { EnemyKind.OakGolem, (260, 18, 1.2f) },
            { EnemyKind.BossNanmir, (4200, 20, 1.6f) },
        };

        public int Depth { get; private set; } = -1;
        public RoomKind Room { get; private set; } = RoomKind.Battle;
        public bool Cleared { get; private set; }

        /// <summary>宿主实现:实例化敌人(种类+缩放后血攻速)。</summary>
        public Action<EnemyKind, float, float, float> OnSpawn;
        /// <summary>房间清空(宿主放传送门/奖励)。</summary>
        public Action<RoomKind> OnRoomCleared;
        /// <summary>Boss 死亡=通关。</summary>
        public Action OnVictory;

        private readonly Random _rng = new();
        private const int RoomCount = 9;
        private const int BudgetBase = 5, BudgetPerDepth = 2;

        /// <summary>进入下一房。返回 false 表示已通关序列。</summary>
        public bool NextRoom(LogicWorld w)
        {
            Depth++;
            if (Depth >= RoomCount) return false;
            Room = Depth == 8 ? RoomKind.Boss
                : Depth == 4 ? RoomKind.Elite
                : Depth == 2 || Depth == 5 ? RoomKind.Treasure
                : RoomKind.Battle;
            Cleared = Room == RoomKind.Treasure;
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
            void spawn(EnemyKind k)
            {
                var (hp, atk, speed) = STATS[k];
                OnSpawn?.Invoke(k, Balance.ScaleHp(hp, Depth, night), Balance.ScaleAtk(atk, Depth, night), speed);
            }

            switch (Room)
            {
                case RoomKind.Treasure:
                    return;
                case RoomKind.Boss:
                    spawn(EnemyKind.BossNanmir);
                    return;
                case RoomKind.Elite:
                    spawn(EnemyKind.OakGolem);
                    spawn(EnemyKind.ThornVine);
                    spawn(EnemyKind.BlightWolf);
                    for (int i = 0; i < 3; i++) spawn(EnemyKind.WindBee);
                    return;
                default:
                {
                    // 加权预算池: [kind, 权重, 消耗, 解锁深度]
                    var pool = new (EnemyKind k, int w, int cost, int minD)[]
                    {
                        (EnemyKind.Shroomling, 30, 1, 0),
                        (EnemyKind.WindBee, 22, 1, 0),
                        (EnemyKind.ThornVine, 10, 2, 2),
                        (EnemyKind.BlightWolf, 12, 2, 3),
                    };
                    int budget = BudgetBase + Depth * BudgetPerDepth;
                    int guard = 40;
                    while (budget > 0 && guard-- > 0)
                    {
                        int total = 0;
                        foreach (var p in pool) if (Depth >= p.minD) total += p.w;
                        int roll = _rng.Next(total);
                        foreach (var p in pool)
                        {
                            if (Depth < p.minD) continue;
                            roll -= p.w;
                            if (roll < 0)
                            {
                                spawn(p.k);
                                budget -= p.cost;
                                break;
                            }
                        }
                    }
                    return;
                }
            }
        }
    }
}
