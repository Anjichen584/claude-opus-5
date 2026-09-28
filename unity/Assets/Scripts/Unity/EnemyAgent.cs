using UnityEngine;
using StarfallKnights.Combat;

namespace StarfallKnights.UnityLayer
{
    /// <summary>基础追击怪(镜像 web EnemySystem 菇灵行为):追玩家 + 接触伤害 + 受击闪白/击退。</summary>
    public sealed class EnemyAgent : MonoBehaviour
    {
        public readonly CombatUnit Unit = new();

        private float _speed;
        private float _contactCd;
        private Vector3 _knock;
        private float _flash;
        private Renderer _rd;
        private Color _baseColor;

        public void Init(float hp, float atk, float speedMps)
        {
            Unit.HpMax = hp;
            Unit.Hp = hp;
            Unit.Atk = atk;
            _speed = speedMps;
            _rd = GetComponent<Renderer>();
            _baseColor = _rd.material.color;
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            Unit.TickTimers(dt);
            _contactCd -= dt;
            if (_flash > 0)
            {
                _flash -= dt;
                _rd.material.color = Color.Lerp(_baseColor, Color.white, Mathf.Clamp01(_flash * 12f));
            }

            var player = GameBootstrap.I.Player;
            if (player == null || Unit.StunT > 0) return;

            var to = player.transform.position - transform.position;
            to.y = 0;
            float slow = Unit.SlowT > 0 ? 1f - Unit.SlowPct : 1f;
            transform.position += to.normalized * _speed * slow * dt + _knock * dt;
            _knock = Vector3.Lerp(_knock, Vector3.zero, 8f * dt);

            if (to.magnitude < 0.8f && _contactCd <= 0)
            {
                _contactCd = 0.8f;
                player.Hurt(Unit.Atk);
            }
        }

        public void OnHit(int dmg, Vector3 dir)
        {
            _flash = 0.08f;
            _knock += dir * 3.5f;
            if (Unit.Dead) Destroy(gameObject);
        }
    }
}
