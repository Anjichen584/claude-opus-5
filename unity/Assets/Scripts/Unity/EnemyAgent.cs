using UnityEngine;
using StarfallKnights.Core;
using SysV2 = System.Numerics.Vector2;

namespace StarfallKnights.UnityLayer
{
    /// <summary>敌人视图+基础追击 AI(逻辑驱动):追玩家/接触伤害/受击闪白/眩晕减速生效。</summary>
    public sealed class EnemyAgent : MonoBehaviour
    {
        public Actor Actor { get; private set; }

        private float _speed;
        private float _contactCd;
        private float _lastHp;
        private float _flash;
        private Renderer _rd;
        private Color _baseColor;

        public void Bind(Actor actor, float speedMps)
        {
            Actor = actor;
            _speed = speedMps;
            _lastHp = actor.Unit.Hp;
            _rd = GetComponent<Renderer>();
            _baseColor = _rd.material.color;
            transform.position = GameBootstrap.ToUnity(actor.Pos);
        }

        private void Update()
        {
            if (Actor == null) return;
            float dt = Time.deltaTime;
            _contactCd -= dt;

            // 受击闪白(血量下降侦测)
            if (Actor.Unit.Hp < _lastHp) _flash = 0.09f;
            _lastHp = Actor.Unit.Hp;
            if (_flash > 0)
            {
                _flash -= dt;
                _rd.material.color = Color.Lerp(_baseColor, Color.white, Mathf.Clamp01(_flash * 11f));
            }

            var boot = GameBootstrap.I;
            var player = boot.Player;
            if (player == null) return;
            var u = Actor.Unit;
            if (u.StunT > 0) { Sync(); return; }

            if (_speed > 0)
            {
                var to = player.Actor.Pos - Actor.Pos;
                float d = to.Length();
                if (d > 0.01f)
                {
                    float slow = u.SlowT > 0 ? 1f - u.SlowPct : 1f;
                    Actor.Pos += to / d * _speed * slow * dt;
                    Actor.Face = Mathf.Atan2(to.Y, to.X);
                }
                if (d < 0.85f && _contactCd <= 0)
                {
                    _contactCd = 0.8f;
                    player.Hurt(u.Atk);
                }
            }
            Sync();
        }

        private void Sync()
        {
            transform.position = GameBootstrap.ToUnity(Actor.Pos);
        }
    }
}
