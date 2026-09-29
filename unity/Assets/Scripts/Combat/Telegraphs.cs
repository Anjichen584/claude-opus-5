using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Core;

namespace StarfallKnights.Combat
{
    /// <summary>
    /// 预警区域(镜像 web TelegraphStrike/BossSystem):
    /// 先亮圈给玩家反应窗口(telegraphS),到点结算一次 AoE,可再残留一段持续地带(冰雾/熔痕)。
    /// 逻辑层只做判定,圈的表现(闪烁/扩张)由宿主渲染。
    /// </summary>
    public sealed class Telegraph
    {
        public Vector2 Pos;
        public float RadiusM;
        public float TelegraphS;
        public float Atk;
        public float Mult;
        public Element? Element;
        /// <summary>true = 敌方预警(打玩家);false = 玩家侧预警。</summary>
        public bool EnemyTeam;
        /// <summary>结算后留下的持续地带(0 = 不留);ZoneMult = 地带每跳倍率。</summary>
        public float ZoneLifeS;
        public float ZoneTickS;
        public float ZoneMult;

        /// <summary>已过去的时间(宿主可直接读来做圈动画)。</summary>
        public float ElapsedS;

        /// <summary>结算回调(宿主做爆炸特效/音效);参数为落点。</summary>
        public Action<Vector2> OnResolve;
    }

    /// <summary>预警推进(每个 LogicWorld 一份,避免多世界/测试互相串场)。</summary>
    public static class TelegraphSystem
    {
        public static Telegraph Add(LogicWorld w, Vector2 pos, float radiusM, float telegraphS, float atk, float mult,
            Element? element, bool enemyTeam, float zoneLifeS = 0f, float zoneTickS = 0.5f, float zoneMult = 0f)
        {
            var t = new Telegraph
            {
                Pos = pos, RadiusM = radiusM, TelegraphS = telegraphS, Atk = atk, Mult = mult,
                Element = element, EnemyTeam = enemyTeam,
                ZoneLifeS = zoneLifeS, ZoneTickS = zoneTickS, ZoneMult = zoneMult,
            };
            w.Telegraphs.Add(t);
            return t;
        }

        public static void Tick(LogicWorld w, float dt)
        {
            for (int i = w.Telegraphs.Count - 1; i >= 0; i--)
            {
                var t = w.Telegraphs[i];
                t.ElapsedS += dt;
                if (t.ElapsedS < t.TelegraphS) continue;

                w.Telegraphs.RemoveAt(i);
                Resolve(w, t);
            }
        }

        private static void Resolve(LogicWorld w, Telegraph t)
        {
            if (t.EnemyTeam)
            {
                var p = w.Player;
                if (p != null && Vector2.Distance(p.Pos, t.Pos) <= t.RadiusM)
                {
                    int dmg = Formulas.FinalDamage(t.Atk, t.Mult, false, 1f, 0f, 0f);
                    // 玩家侧无敌帧/翻滚由宿主在 HurtPlayer 里处理:这里直接扣血,
                    // 但宿主可用 w.PlayerInvulnerable 标记跳过(见 LogicWorld)。
                    if (!w.PlayerInvulnerable) p.Unit.Hp -= dmg;
                }
            }
            else
            {
                foreach (var e in new List<Actor>(w.EnemiesWithin(t.Pos, t.RadiusM)))
                {
                    DamagePipeline.Deal(new DealOpts
                    {
                        Source = null, Target = e.Unit, Mult = t.Mult, Element = t.Element,
                        AtkOverride = t.Atk, CanCrit = false,
                    });
                }
            }

            if (t.ZoneLifeS > 0f)
            {
                w.Zones.Add(new Zone
                {
                    Pos = t.Pos, RadiusM = t.RadiusM, LifeS = t.ZoneLifeS, TickS = t.ZoneTickS,
                    Atk = t.Atk, Mult = t.ZoneMult <= 0f ? t.Mult : t.ZoneMult,
                    Element = t.Element, PlayerTeam = !t.EnemyTeam,
                });
            }

            t.OnResolve?.Invoke(t.Pos);
        }
    }
}
