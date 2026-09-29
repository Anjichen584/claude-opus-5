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
        public const float TreeHp = 80f;
        public const float RockHp = 120f;

        /// <summary>terrain 段与 props 耐久的逐键镜像(键名 = JSON 路径)</summary>
        public static readonly Dictionary<string, float> Parity = new Dictionary<string, float>
        {
            { "layouts.terrain.waterMoveMult", WaterMoveMult },
            { "layouts.terrain.waterBoltAmp", WaterBoltAmp },
            { "layouts.terrain.waterStunS", WaterStunS },
            { "layouts.terrain.splashNoticeS", SplashNoticeS },
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

            /// <summary>按布局模板初始化:浅滩房才有水带</summary>
            public static TerrainState ForLayout(string layoutId, float heightM)
            {
                if (layoutId != "shore") return new TerrainState();
                return new TerrainState
                {
                    HasWater = true,
                    CenterY = heightM * 0.62f,               // 与 web floorOf('shore') 一致
                    BandH = Math.Max(2.2f, heightM * 0.16f),
                };
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
    }
}
