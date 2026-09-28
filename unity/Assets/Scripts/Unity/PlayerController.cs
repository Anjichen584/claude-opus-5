using UnityEngine;
using StarfallKnights.Combat;
using StarfallKnights.Core;
using StarfallKnights.Data;
using StarfallKnights.Skills;
using SysV2 = System.Numerics.Vector2;

namespace StarfallKnights.UnityLayer
{
    /// <summary>
    /// 主角控制(逻辑驱动):WASD 移动 / 鼠标瞄准 / 左键三段连击 /
    /// 空格翻滚 / Q·E·R 技能(BladeSkills,含怒气与符文位)。
    /// </summary>
    public sealed class PlayerController : MonoBehaviour
    {
        public readonly Actor Actor = new() { IsPlayer = true };
        public readonly BladeSkills Skills = new();

        private SysV2 _vel;
        private float _dashT, _dashCd, _iframes, _attackT, _comboTimer;
        private int _combo;
        private SysV2 _dashDir = new(1, 0);
        private float _dashSpeed;

        private static readonly float[] ComboMults = { 1.0f, 1.0f, 1.6f };
        private static readonly float[] ComboTimes = { 0.32f, 0.32f, 0.45f };

        private void Awake()
        {
            Actor.Unit.HpMax = Balance.PlayerHp;
            Actor.Unit.Hp = Balance.PlayerHp;
            Actor.Unit.Atk = Balance.PlayerAtk;
            Actor.Unit.CritRate = Balance.PlayerCritRate;
            Actor.Unit.CritDmg = Balance.PlayerCritDmg;
            Actor.Unit.IsPlayerTeam = true;
            // 开局赠一枚随机 Q 符文(镜像 web 开局赠符,体验元素连锁)
            Skills.RuneQ = RunePool.Blade[Random.Range(0, 3)];
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            var w = GameBootstrap.I.World;
            Skills.Tick(dt);
            if (_dashCd > 0) _dashCd -= dt;
            if (_iframes > 0) _iframes -= dt;
            if (_attackT > 0) _attackT -= dt;
            if (_comboTimer > 0) _comboTimer -= dt; else _combo = 0;

            // 瞄准
            Actor.Face = AimFace();

            // 翻滚/技能突进
            if (_dashT > 0)
            {
                _dashT -= dt;
                Actor.Pos += _dashDir * _dashSpeed * dt;
                Clamp();
                Sync();
                return;
            }
            if (Input.GetKeyDown(KeyCode.Space) && _dashCd <= 0)
            {
                StartDash(Balance.DashDistM, Balance.DashDurS, 1.6f);
                return;
            }

            // 技能
            if (Input.GetKeyDown(KeyCode.Q)) Skills.CastQ(w);
            if (Input.GetKeyDown(KeyCode.E))
            {
                var dash = Skills.CastE(w);
                if (dash.HasValue) StartDash(dash.Value.distM, dash.Value.durS, 0f);
            }
            if (Input.GetKeyDown(KeyCode.R)) Skills.CastR(w);

            // 移动(指数趋近)
            var ax = MoveAxis();
            float slow = _attackT > 0 ? 0.35f : 1f;
            var target = ax * Balance.PlayerMoveSpeed * slow;
            float k = 1f - Mathf.Exp(-dt / 0.06f);
            _vel += (target - _vel) * k;
            Actor.Pos += _vel * dt;
            Clamp();

            // 三段连击(命中攒怒气)
            if (Input.GetMouseButton(0) && _attackT <= 0)
            {
                _combo = _comboTimer > 0 ? _combo % 3 + 1 : 1;
                _attackT = ComboTimes[_combo - 1];
                _comboTimer = 0.9f + _attackT;
                foreach (var e in new System.Collections.Generic.List<Actor>(
                    w.EnemiesInCone(Actor.Pos, Actor.Face, 2.0f, 110f * Mathf.Deg2Rad)))
                {
                    DamagePipeline.Deal(new DealOpts
                    {
                        Source = Actor.Unit, Target = e.Unit,
                        Mult = ComboMults[_combo - 1], CanCrit = true,
                    });
                    Skills.Rage = Mathf.Min(100, Skills.Rage + 4);
                }
            }
            Sync();
        }

        public void Hurt(float amount)
        {
            if (_iframes > 0 || _dashT > 0) return;
            Actor.Unit.Hp -= amount;
            if (Actor.Unit.Hp <= 0) Debug.Log("Hero down!");
        }

        private void StartDash(float distM, float durS, float cd)
        {
            var ax = MoveAxis();
            _dashDir = ax.LengthSquared() > 0 ? SysV2.Normalize(ax)
                : new SysV2(Mathf.Cos(Actor.Face), Mathf.Sin(Actor.Face));
            _dashT = durS;
            _dashSpeed = distM / durS;
            if (cd > 0) _dashCd = cd;
            _iframes = Mathf.Max(_iframes, durS);
        }

        private static SysV2 MoveAxis()
        {
            var v = new SysV2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
            return v.LengthSquared() > 1 ? SysV2.Normalize(v) : v;
        }

        private float AimFace()
        {
            var plane = new Plane(Vector3.up, Vector3.zero);
            var ray = Camera.main.ScreenPointToRay(Input.mousePosition);
            if (plane.Raycast(ray, out float d))
            {
                var p = GameBootstrap.ToLogic(ray.GetPoint(d)) - Actor.Pos;
                if (p.LengthSquared() > 0.0001f) return Mathf.Atan2(p.Y, p.X);
            }
            return Actor.Face;
        }

        private void Clamp()
        {
            var b = GameBootstrap.I;
            Actor.Pos = new SysV2(
                Mathf.Clamp(Actor.Pos.X, 0.4f, b.ArenaW - 0.4f),
                Mathf.Clamp(Actor.Pos.Y, 0.4f, b.ArenaH - 0.4f));
        }

        private void Sync()
        {
            transform.position = GameBootstrap.ToUnity(Actor.Pos);
        }
    }
}
