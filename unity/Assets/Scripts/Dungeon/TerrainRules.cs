using System;
using System.Collections.Generic;
using StarfallKnights.Core;

namespace StarfallKnights.Dungeon
{
    /// <summary>
    /// 地形效果镜像(web: game/dungeon/Terrain.ts;数值: balance.json 的 layouts.terrain 段 + props.*.hp)。
    ///
    /// 两条机制:
    ///   1. **浅滩**:水里的实体移动 ×waterMoveMult;雷元素伤害 ×waterBoltAmp 并附带 waterStunS 秒麻痹
    ///      (玩家不吃麻痹——控制权被锁死最劝退;但玩家在水里挨雷也照样吃加成)。
    ///   2. **可打穿的障碍**:树/岩各有耐久,砍到 0 就碎(Body 摘掉,只剩残骸贴图)。
    ///
    /// Unity 端目前渲染层还没有房间生成,但规则先镜像过来:Unity 做房间时直接用同一套,
    /// 且 ParityTests 会盯着常量,免得两边各写一套数值。
    /// </summary>
    public static class TerrainRules
    {
        // ---- 常量(web balance.layouts.terrain / props.*.hp)----
        public const float WaterMoveMult = 0.72f;  // 水里移动乘区
        public const float WaterBoltAmp = 1.25f;   // 水里雷伤乘区
        public const float WaterStunS = 0.5f;      // 水里雷击的麻痹时长
        public const float SplashNoticeS = 2.5f;   // "踏入浅滩"提示的冷却
        public const float IceGripPerS = 3.0f;     // 冰面滑行:实际速度向意图速度的收敛速率(轮 12)
        public const float IceNoticeS = 2.5f;      // "踏上冰面"提示的冷却
        public const float StormClearS = 6.0f;     // 沙暴循环:晴的时长(轮 15)
        public const float StormActiveS = 4.0f;    // 沙暴循环:暴的时长
        public const float StormProjAgeMul = 1.6f; // 暴中投射物衰老乘区(射程缩短,双方公平)
        public const float StormNoticeS = 2.5f;    // 起暴提示的冷却
        public const float TreeHp = 80f;
        public const float RockHp = 120f;

        /// <summary>terrain 段与 props 耐久的逐键镜像(键名 = JSON 路径)</summary>
        public static readonly Dictionary<string, float> Parity = new Dictionary<string, float>
        {
            { "layouts.terrain.waterMoveMult", WaterMoveMult },
            { "layouts.terrain.waterBoltAmp", WaterBoltAmp },
            { "layouts.terrain.waterStunS", WaterStunS },
            { "layouts.terrain.splashNoticeS", SplashNoticeS },
            { "layouts.terrain.iceGripPerS", IceGripPerS },
            { "layouts.terrain.iceNoticeS", IceNoticeS },
            { "layouts.terrain.stormClearS", StormClearS },
            { "layouts.terrain.stormActiveS", StormActiveS },
            { "layouts.terrain.stormProjAgeMul", StormProjAgeMul },
            { "layouts.terrain.stormNoticeS", StormNoticeS },
            { "props.tree.hp", TreeHp },
            { "props.rock.hp", RockHp },
        };

        /// <summary>本房地形(水带按 x 轴横穿房间,和 web 的 shallow band 同一形状)</summary>
        public struct TerrainState
        {
            /// <summary>是否有水(浅滩房才有)</summary>
            public bool HasWater;
            /// <summary>水带中心 y(米)</summary>
            public float CenterY;
            /// <summary>水带高度(米)</summary>
            public float BandH;

            /// <summary>是否有冰面(冰湖裂面;椭圆 blob,轮 12 机制化)</summary>
            public bool HasIce;
            public float IceCx, IceCy, IceRx, IceRy;

            /// <summary>按布局模板初始化:浅滩房有水带;冰湖房有冰面椭圆</summary>
            public static TerrainState ForLayout(string layoutId, float heightM, float widthM = 26f)
            {
                if (layoutId == "shore")
                    return new TerrainState
                    {
                        HasWater = true,
                        CenterY = heightM * 0.62f,               // 与 web floorOf('shore') 一致
                        BandH = Math.Max(2.2f, heightM * 0.16f),
                    };
                if (layoutId == "icefield")
                    return new TerrainState
                    {
                        HasIce = true,                            // 与 web floorOf('icefield') 一致
                        IceCx = widthM * 0.52f,
                        IceCy = heightM * 0.5f,
                        IceRx = Math.Min(widthM * 0.56f, 16f) / 2f,
                        IceRy = Math.Min(heightM * 0.7f, 10.5f) / 2f,
                    };
                return new TerrainState();
            }

            /// <summary>该点是否在冰面上(椭圆判定,镜像 web insideIce)</summary>
            public bool IsIce(float xM, float yM)
            {
                if (!HasIce || IceRx <= 0f || IceRy <= 0f) return false;
                float dx = (xM - IceCx) / IceRx;
                float dy = (yM - IceCy) / IceRy;
                return dx * dx + dy * dy <= 1f;
            }

            public bool IsWater(float xM, float yM)
            {
                if (!HasWater) return false;
                return Math.Abs(yM - CenterY) <= BandH / 2f;
            }

            /// <summary>移动乘区(所有实体通用:玩家/怪/Boss/冲刺)</summary>
            public float MoveMult(float xM, float yM) => IsWater(xM, yM) ? WaterMoveMult : 1f;

            /// <summary>元素伤害乘区:只有雷元素吃水的加成</summary>
            public float ElemAmp(bool isBolt, float xM, float yM) => isBolt && IsWater(xM, yM) ? WaterBoltAmp : 1f;

            /// <summary>水里雷击的麻痹时长(玩家不吃麻痹,由调用方决定是否施加)</summary>
            public float StunOnBolt(bool isBolt, float xM, float yM) => isBolt && IsWater(xM, yM) ? WaterStunS : 0f;
        }

        // ---- 可打穿的障碍 ----

        /// <summary>障碍耐久(0 = 打不烂,如灌木/未知种类)</summary>
        public static float PropHp(string kind)
        {
            switch (kind)
            {
                case "tree": return TreeHp;
                case "rock": return RockHp;
                default: return 0f;
            }
        }

        /// <summary>可破坏障碍的状态(web PropObstacle.hp/broken 的镜像)</summary>
        public struct Breakable
        {
            public string Kind;
            public float Hp;
            public bool Broken;

            public static Breakable Make(string kind)
            {
                return new Breakable { Kind = kind, Hp = PropHp(kind), Broken = false };
            }
        }

        /// <summary>给障碍记一笔伤害;返回"刚好被打破"(用来放音效/开通道)。</summary>
        public static bool DamageProp(ref Breakable prop, float amount)
        {
            float max = PropHp(prop.Kind);
            if (max <= 0f || prop.Broken) return false;
            if (prop.Hp <= 0f) prop.Hp = max;
            prop.Hp -= Math.Max(0f, amount);
            if (prop.Hp > 0f) return false;
            prop.Hp = 0f;
            prop.Broken = true;
            return true;
        }

        /// <summary>打破要几刀(给 UI/文档一个能对外的说法,也用于断言)</summary>
        public static int HitsToBreak(string kind, float perHit)
        {
            float max = PropHp(kind);
            if (max <= 0f || perHit <= 0f) return 0;
            return (int)Math.Ceiling(max / perHit);
        }

        /// <summary>障碍是否还挡路(碎掉 = 只剩残骸贴图,不再参与碰撞)</summary>
        public static bool Blocks(Breakable prop) => !prop.Broken && PropHp(prop.Kind) > 0f;

        /// <summary>窄道墙由岩柱砌成:一排要砍几下才开得了口(给策划看的手感数字)</summary>
        public static int WallOpenSwings(float perHit) => HitsToBreak("rock", perHit);

        // ---- 沙暴视野(轮 15;镜像 web Terrain 的沙暴循环)----
        //
        // 三章沙地房独有:循环 = 先晴 StormClearS 秒,后暴 StormActiveS 秒。
        // 暴中投射物按 StormProjAgeMul 加速衰老(射程缩短,双方公平 —— 反制就是近身打)。

        /// <summary>沙暴循环:t(自进房起的秒数)当前是否在暴中。</summary>
        public static bool StormActive(float t)
        {
            float cycle = StormClearS + StormActiveS;
            float m = t % cycle;
            if (m < 0f) m += cycle;
            return m >= StormClearS;
        }

        /// <summary>暴中投射物衰老乘区(晴 = 1)。</summary>
        public static float ProjAgeMul(float t) => StormActive(t) ? StormProjAgeMul : 1f;

        // ---- 冰面滑行(轮 12;镜像 web PhysicsSystem 的滑行积分)----
        //
        // 只作用于玩家(怪的 AI 按"意图即位移"推演,冰上打滑会让追击/风筝数学失真);
        // 翻滚(dashing)不打滑 —— 这是冰面的反制:滑不动?滚。

        /// <summary>
        /// 冰面滑行一步:返回本帧用于位移的"实际速度"。
        /// onIce 且非翻滚 → 实际速度向意图速度按 IceGripPerS 收敛;否则直接听意图的。
        /// </summary>
        public static (float vx, float vy) SlideStep(
            float slideVx, float slideVy, float wantVx, float wantVy, bool onIce, bool dashing, float dt)
        {
            if (!onIce || dashing) return (wantVx, wantVy);
            float k = Math.Min(1f, IceGripPerS * dt);
            return (slideVx + (wantVx - slideVx) * k, slideVy + (wantVy - slideVy) * k);
        }
    }
}
