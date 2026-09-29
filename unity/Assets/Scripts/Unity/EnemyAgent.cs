using UnityEngine;
using StarfallKnights.Core;
using SysV2 = System.Numerics.Vector2;

namespace StarfallKnights.UnityLayer
{
    /// <summary>
    /// 敌人视图(纯表现):位置同步 + 受击闪白 + 眩晕发暗。
    /// AI 全在逻辑层(Dungeon/CreatureAI、BossAI),本类不再自己走位——
    /// 这样"怪怎么打"能被 dotnet 测试覆盖,Unity 只负责把它画出来。
    /// </summary>
    public sealed class EnemyAgent : MonoBehaviour
    {
        public Actor Actor { get; private set; }

        private float _lastHp;
        private float _flash;
        private Renderer _rd;
        private Color _baseColor;

        public void Bind(Actor actor)
        {
            Actor = actor;
            _lastHp = actor.Unit.Hp;
            _rd = GetComponent<Renderer>();
            _baseColor = _rd.material.color;
            transform.position = GameBootstrap.ToUnity(actor.Pos);
        }

        private void Update()
        {
            if (Actor == null) return;
            float dt = Time.deltaTime;

            if (Actor.Unit.Hp < _lastHp) _flash = 0.09f;
            _lastHp = Actor.Unit.Hp;

            if (_flash > 0)
            {
                _flash -= dt;
                _rd.material.color = Color.Lerp(_baseColor, Color.white, Mathf.Clamp01(_flash * 11f));
            }
            else if (Actor.Unit.StunT > 0)
            {
                _rd.material.color = Color.Lerp(_baseColor, Color.black, 0.45f);
            }
            else
            {
                _rd.material.color = _baseColor;
            }

            transform.position = GameBootstrap.ToUnity(Actor.Pos);
        }
    }
}
