using System;
using System.Collections.Generic;
using StarfallKnights.Core;
using StarfallKnights.Data;
using StarfallKnights.Meta;

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
            new(EnemyKind.LeafWisp, 16, 1, 1),
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
            new(EnemyKind.IceSpike, 12, 1, 1),
            new(EnemyKind.IceGlider, 14, 1, 2),
            new(EnemyKind.FrostMoth, 12, 1, 1),
            new(EnemyKind.EmberImp, 10, 2, 3),
        };

        private static readonly PoolRow[] Ch3Pool =
        {
            new(EnemyKind.CinderRat, 30, 1, 0),
            new(EnemyKind.DustStinger, 18, 2, 0),
            new(EnemyKind.FlameDancer, 16, 2, 1),
            new(EnemyKind.SparkLizard, 12, 1, 1),
            new(EnemyKind.DuneBeetle, 16, 2, 2),
            new(EnemyKind.MirageBlossom, 12, 1, 1),
            new(EnemyKind.EmberWhirl, 14, 2, 2),
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

        /// <summary>深渊难度档(轮 23;0 = 普通远征)。乘区叠在章节乘区之后(见 Scale)。</summary>
        public int Abyss { get; private set; } = AbyssRules.Normal;

        /// <summary>无尽模式(轮 24)。挑战局请传 false:**挑战要全服同条件**(与深渊同款口径)。</summary>
        public bool Endless { get; private set; }

        /// <summary>挑战词条乘区(轮 43;中性 = 普通远征)。镜像 web RunMods.eff。</summary>
        public Challenges.Mods Eff { get; private set; } = Challenges.Mods.Neutral;

        /// <summary>周常铁律结构项(轮 43;中性 = 无)。镜像 web RunMods.structure。</summary>
        public Challenges.Structure Struct { get; private set; } = Challenges.Structure.Neutral;

        /// <summary>挑战局进行中(镜像 web runMods.active)。</summary>
        public bool ChallengeActive { get; private set; }

        /// <summary>
        /// 进入挑战局(每日 Merge 后的乘区 / 周常 rule 的乘区 + 结构)。
        /// **强制回普通远征 + 关无尽**:挑战要全服同条件,这两档是个人难度选择,
        /// 不能混进来(web GameScene.startRun 同款口径)。
        /// </summary>
        public void SetChallenge(Challenges.Mods eff, Challenges.Structure st)
        {
            Eff = eff;
            Struct = st;
            ChallengeActive = true;
            Abyss = AbyssRules.Normal;
            Endless = false;
            Loop = 0;
        }

        /// <summary>回普通远征(乘区/结构全部回中性)。</summary>
        public void ClearChallenge()
        {
            Eff = Challenges.Mods.Neutral;
            Struct = Challenges.Structure.Neutral;
            ChallengeActive = false;
        }

        /// <summary>第几循环(0 = 第一遍三章)。乘区见 <see cref="EndlessRules.LoopMultsOf"/>。</summary>
        public int Loop { get; private set; }

        /// <summary>进过的房间数(镜像 web RunManager.roomsEntered);<see cref="Floor"/> 由它推。</summary>
        public int RoomsEntered { get; private set; }

        /// <summary>宿主实现:实例化敌人(种类 + 已缩放的血/攻/速)。</summary>
        public Action<EnemyKind, float, float, float> OnSpawn;
        /// <summary>房间清空(宿主放传送门/奖励)。</summary>
        public Action<RoomKind> OnRoomCleared;
        /// <summary>Boss 死亡 = 通关。</summary>
        public Action OnVictory;
        /// <summary>房间开始(宿主播报章节/房间类型/预警清理)。</summary>
        public Action<RoomKind, int> OnRoomStart;
        /// <summary>无尽模式:Boss 房清空 = 进入下一循环(替代 <see cref="OnVictory"/>)。</summary>
        public Action OnLoop;

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

        /// <summary>
        /// 切换深渊难度档(轮 23)。**挑战局请传 AbyssRules.Normal**:挑战要全服同条件,
        /// 不是"谁解锁得高谁分高"(web 侧 GameScene.startRun 同款口径,有 parity 断言钉住)。
        /// </summary>
        public void SetAbyss(int idx)
        {
            if (ChallengeActive) return;   // 挑战局锁难度(全服同条件)
            Abyss = idx < AbyssRules.Normal ? AbyssRules.Normal
                : idx > AbyssRules.LevelCount ? AbyssRules.LevelCount : idx;
        }

        public int CurrentChapter => Chapter;

        /// <summary>当前层(镜像 web floor = roomsEntered + 1;下限 1 —— 还没进房间时是第 1 层)。</summary>
        public int Floor => RoomsEntered + 1 <= 1 ? 1 : RoomsEntered + 1;

        /// <summary>
        /// 开关无尽(轮 24)。开启时循环数归零、章节回到当前章(不是强改第 1 章 ——
        /// 玩家可能选二章开无尽,那就从二章起循环);关闭时乘区回到中性。
        /// </summary>
        public void SetEndless(bool on)
        {
            if (ChallengeActive) return;   // 挑战局固定关无尽(web 源码守卫同款)
            Endless = on;
            Loop = 0;
        }

        /// <summary>
        /// 进入下一循环(镜像 web RunManager.nextLoop):循环 +1、章节按 1→2→3→1 循环、深度清零、
        /// 立刻开第一间战斗房。**不清玩家积累**(装备/词条/星尘都是玩家的,横跨循环保留)。
        /// </summary>
        public void NextLoop(LogicWorld w)
        {
            Loop++;
            Chapter = EndlessRules.ChapterOfLoop(Loop);
            Depth = -1;
            Cleared = false;
            NextRoom(w);
        }

        /// <summary>
        /// 本章杂兵缩放(章节乘区 × 深度 × 夜间 × **深渊档**;Boss 不吃章节乘区,它自己表里已调好)。
        /// 顺序与 web 一致:深度/夜间 → 章节 → 深渊(Web 侧深渊乘区在 RunMods.enemy 里最后乘上)。
        /// </summary>
        public (float hp, float atk) Scale(Bestiary.Stat s, bool night, bool boss)
        {
            float mul = boss ? 1f : ChapterCfg.StatMult;
            // 镜像 web:Boss 用 depth 0 缩放(它自己表里已按章调好),杂兵才吃房间深度
            int depth = boss ? 0 : (Depth < 0 ? 0 : Depth);
            var (hp, atk) = AbyssRules.Apply(Abyss,
                Balance.ScaleHp(s.Hp, depth, night) * mul * Eff.Hp,
                Balance.ScaleAtk(s.Atk, depth, night) * mul * Eff.Atk);
            // 无尽乘区最后叠,并过数值闸门(镜像 web RunMods.enemy:所有出怪路径共用这一处闸门)
            return EndlessRules.Apply(Loop, hp, atk);
        }

        /// <summary>当前档的掉落乘区(镜像 web runMods.dropMult 里的深渊部分)</summary>
        public float LootMult => EndlessRules.SafeMult(Eff.Drop * AbyssRules.LootMult(Abyss) * EndlessRules.LoopMultsOf(Loop).Loot);

        /// <summary>当前档的星尘乘区(镜像 web runMods.dustMult)</summary>
        public float DustMult => EndlessRules.SafeMult(AbyssRules.DustMult(Abyss) * EndlessRules.LoopMultsOf(Loop).Dust);

        /// <summary>精英房额外波次(镜像 web RunManager 的 pendingWaves 加成;深渊 + 周常铁律)</summary>
        public int EliteExtraWaves => AbyssRules.EliteWaves(Abyss) + Struct.ExtraWaves;

        /// <summary>
        /// 精英房实际位置(镜像 web eliteIndexOf:eliteIndex + 铁律偏移,夹到 [1, MidBossIndex-1] ——
        /// 不许撞开局房,也不许撞中 Boss/Boss 房)。
        /// </summary>
        public int EliteAt
        {
            get
            {
                int at = EliteIndex + Struct.EliteShift;
                return at < 1 ? 1 : at > MidBossIndex - 1 ? MidBossIndex - 1 : at;
            }
        }

        /// <summary>进入下一房。返回 false 表示已通关序列。</summary>
        public bool NextRoom(LogicWorld w)
        {
            Depth++;
            RoomsEntered++;
            if (Depth >= RoomCount) return false;
            Room = Depth == RoomCount - 1 ? RoomKind.Boss
                : Depth == MidBossIndex ? RoomKind.MidBoss   // 三章中 Boss 齐编(轮 5/13/16;镜像 web)
                : Depth == EliteAt ? RoomKind.Elite          // 铁律可移位(轮 43;EliteAt 已夹取)
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
                // 无尽模式:Boss 房清空不是通关,是"进入下一循环"(镜像 web update 返回 'loop')
                if (Room == RoomKind.Boss) { if (Endless) OnLoop?.Invoke(); else OnVictory?.Invoke(); }
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
                    Spawn(Chapter == 3 ? EnemyKind.MidBossSandreaper : Chapter == 2 ? EnemyKind.MidBossFrosthuntress : EnemyKind.MidBossMossstag);
                    return;
                case RoomKind.Elite:
                {
                    var comp = EliteComp.TryGetValue(Chapter, out var c) ? c : EliteComp[1];
                    foreach (var k in comp) Spawn(k);
                    // 深渊档(轮 23):精英房多刷一轮 —— 只加"这一间更长",不动房间序列
                    for (int i = 0; i < EliteExtraWaves; i++)
                        foreach (var k in comp) Spawn(k);
                    return;
                }
                default:
                {
                    var pool = Chapter == 3 ? Ch3Pool : Chapter == 2 ? Ch2Pool : Ch1Pool;
                    // 周常「每房 +N 波」:Lite 没有波次制(web 是 pendingWaves),
                    // 等效成"预算 ×(1+N) 一次出完" —— 总压力一致,节奏差异是已知口径差(见 07 §4.1)
                    int budget = (BudgetBase + Depth * BudgetPerDepth) * (1 + Struct.ExtraWaves);
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
