using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;

namespace StarfallKnights.Skills
{
    /// <summary>
    /// 狂澜剑士技能执行器(镜像 web SkillSystem 剑士路径 + data/skills/blade.json 数值)。
    /// 延迟段用内部调度队列;宿主每帧调 Tick(dt)。
    /// </summary>
    public sealed class BladeSkills
    {
        // ---- blade.json 数值镜像(改动需双端同步)----
        private const float QCd = 4.0f, ECd = 6.0f, RCd = 1.5f;
        private const int QCount = 3;
        private const float QIntervalS = 0.1f, QArcDeg = 110f, QRangeM = 2.2f, QMult = 1.4f;
        private const float EDistM = 3.5f, EDurS = 0.18f, EBlastDelayS = 1.0f, EBlastRadiusM = 1.8f, EBlastMult = 2.2f;
        private const int RMin = 8, RMax = 24;
        private const float RMult = 0.9f, RRingM = 3.2f, RDurS = 1.6f, RAoeM = 1.0f, RSeekM = 6.5f;
        private const int MinRage = 40;

        public float CdQ, CdE, CdR;
        /// <summary>怒气 0~100(宿主命中时加)。</summary>
        public float Rage;

        /// <summary>三技能位的已镶符文(null=无)。</summary>
        public RuneDef RuneQ, RuneE, RuneR;

        private readonly List<(float t, Action run)> _queue = new();
        private readonly Random _rng = new();

        public void Tick(float dt)
        {
            if (CdQ > 0) CdQ -= dt;
            if (CdE > 0) CdE -= dt;
            if (CdR > 0) CdR -= dt;
            for (int i = _queue.Count - 1; i >= 0; i--)
            {
                var (t, run) = _queue[i];
                t -= dt;
                if (t <= 0)
                {
                    _queue.RemoveAt(i);
                    run();
                }
                else
                {
                    _queue[i] = (t, run);
                }
            }
        }

        /// <summary>Q 裂空斩:三连扇形斩;符文可附元素+末段地带。</summary>
        public bool CastQ(LogicWorld w)
        {
            if (CdQ > 0 || w.Player == null) return false;
            CdQ = QCd;
            var element = RuneQ?.Element;
            for (int i = 0; i < QCount; i++)
            {
                _queue.Add((i * QIntervalS, () =>
                {
                    var p = w.Player;
                    foreach (var e in new List<Actor>(w.EnemiesInCone(p.Pos, p.Face, QRangeM, QArcDeg * MathF.PI / 180f)))
                    {
                        DamagePipeline.Deal(new DealOpts
                        {
                            Source = p.Unit, Target = e.Unit, Mult = QMult, Element = element, CanCrit = true,
                        });
                    }
                }));
            }
            if (RuneQ?.GroundZone != null)
            {
                var gz = RuneQ.GroundZone;
                _queue.Add((QCount * QIntervalS, () =>
                {
                    var p = w.Player;
                    var dir = new Vector2(MathF.Cos(p.Face), MathF.Sin(p.Face));
                    w.Zones.Add(new Zone
                    {
                        Pos = p.Pos + dir * 1.2f, RadiusM = gz[0], LifeS = gz[1], TickS = gz[2],
                        Atk = p.Unit.Atk, Mult = gz[3], Element = element, PlayerTeam = true,
                    });
                }));
            }
            return true;
        }

        /// <summary>E 潮涌步:突进(宿主执行位移)+ 残影延迟爆炸。返回突进参数。</summary>
        public (float distM, float durS)? CastE(LogicWorld w)
        {
            if (CdE > 0 || w.Player == null) return null;
            CdE = ECd;
            var element = RuneE?.Element;
            var origin = w.Player.Pos;
            _queue.Add((EBlastDelayS, () =>
            {
                foreach (var e in new List<Actor>(w.EnemiesWithin(origin, EBlastRadiusM)))
                {
                    DamagePipeline.Deal(new DealOpts
                    {
                        Source = w.Player.Unit, Target = e.Unit, Mult = EBlastMult, Element = element, CanCrit = true,
                    });
                }
                if (RuneE?.GroundZone != null)
                {
                    var gz = RuneE.GroundZone;
                    w.Zones.Add(new Zone
                    {
                        Pos = origin, RadiusM = gz[0], LifeS = gz[1], TickS = gz[2],
                        Atk = w.Player.Unit.Atk, Mult = gz[3], Element = element, PlayerTeam = true,
                    });
                }
            }));
            return (EDistM, EDurS);
        }

        /// <summary>R 星陨·万剑归宗:怒气驱动坠剑;每 4 剑一个符文地带。落点回调交宿主做特效。</summary>
        public bool CastR(LogicWorld w, Action<Vector2> onImpactFx = null)
        {
            if (CdR > 0 || Rage < MinRage || w.Player == null) return false;
            var element = RuneR?.Element;
            float ratio = (Rage - MinRage) / (100f - MinRage);
            int count = (int)Math.Round(RMin + ratio * (RMax - RMin));
            Rage = 0;
            CdR = RCd;
            for (int i = 0; i < count; i++)
            {
                int idx = i;
                _queue.Add((i / (float)count * RDurS, () =>
                {
                    var p = w.Player;
                    Vector2 at;
                    var seek = new List<Actor>(w.EnemiesWithin(p.Pos, RSeekM));
                    if (seek.Count > 0 && _rng.NextDouble() < 0.75)
                    {
                        var pick = seek[_rng.Next(seek.Count)];
                        at = pick.Pos + new Vector2((float)(_rng.NextDouble() - 0.5) * 0.6f, (float)(_rng.NextDouble() - 0.5) * 0.6f);
                    }
                    else
                    {
                        double a = _rng.NextDouble() * Math.PI * 2;
                        float r = 0.5f + (float)_rng.NextDouble() * (RRingM - 0.5f);
                        at = p.Pos + new Vector2(MathF.Cos((float)a), MathF.Sin((float)a)) * r;
                    }
                    onImpactFx?.Invoke(at);
                    foreach (var e in new List<Actor>(w.EnemiesWithin(at, RAoeM)))
                    {
                        DamagePipeline.Deal(new DealOpts
                        {
                            Source = p.Unit, Target = e.Unit, Mult = RMult, Element = element, CanCrit = true,
                        });
                    }
                    if (RuneR?.GroundZone != null && idx % 4 == 0)
                    {
                        var gz = RuneR.GroundZone;
                        w.Zones.Add(new Zone
                        {
                            Pos = at, RadiusM = gz[0], LifeS = gz[1], TickS = gz[2],
                            Atk = p.Unit.Atk, Mult = gz[3], Element = element, PlayerTeam = true,
                        });
                    }
                }));
            }
            return true;
        }
    }
}
