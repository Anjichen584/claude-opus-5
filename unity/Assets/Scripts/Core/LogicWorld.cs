using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;

namespace StarfallKnights.Core
{
    /// <summary>
    /// 逻辑世界:玩家/敌人/持续区域(Zone)的最小容器 + 推进。
    /// 对应 web 端 World+ZoneSystem 的合并精简版;渲染/寻路由宿主负责。
    /// </summary>
    public sealed class LogicWorld
    {
        public Actor Player;
        public readonly List<Actor> Enemies = new();
        public readonly List<Zone> Zones = new();
        public readonly GameClock Clock = new();

        /// <summary>敌人死亡回调(掉落/特效由宿主接)。</summary>
        public Action<Actor> OnEnemyDied;

        public void Tick(float dt)
        {
            Clock.Tick(dt);
            Player?.Unit.TickTimers(dt);
            for (int i = Enemies.Count - 1; i >= 0; i--)
            {
                var e = Enemies[i];
                e.Unit.TickTimers(dt);
                if (e.Unit.Dead)
                {
                    Enemies.RemoveAt(i);
                    OnEnemyDied?.Invoke(e);
                }
            }
            ZoneSystem.Tick(this, dt);
        }

        /// <summary>半径内的敌人(米)。</summary>
        public IEnumerable<Actor> EnemiesWithin(Vector2 center, float radiusM)
        {
            foreach (var e in Enemies)
            {
                if (Vector2.Distance(e.Pos, center) <= radiusM) yield return e;
            }
        }

        /// <summary>锥形内的敌人(朝向±半角)。</summary>
        public IEnumerable<Actor> EnemiesInCone(Vector2 origin, float faceRad, float rangeM, float arcRad)
        {
            foreach (var e in Enemies)
            {
                var to = e.Pos - origin;
                float d = to.Length();
                if (d > rangeM || d < 0.0001f) continue;
                float ang = MathF.Atan2(to.Y, to.X) - faceRad;
                while (ang > MathF.PI) ang -= MathF.PI * 2;
                while (ang < -MathF.PI) ang += MathF.PI * 2;
                if (MathF.Abs(ang) <= arcRad / 2) yield return e;
            }
        }
    }
}
