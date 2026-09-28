using UnityEngine;
using StarfallKnights.Combat;
using StarfallKnights.Data;

namespace StarfallKnights.UnityLayer
{
    /// <summary>
    /// 主角控制(镜像 web PlayerSystem 手感参数):
    /// WASD 移动(指数趋近加减速)/ 鼠标瞄准 / 左键三段连击 / 空格翻滚(无敌帧)。
    /// </summary>
    public sealed class PlayerController : MonoBehaviour
    {
        public readonly CombatUnit Unit = new()
        {
            HpMax = Balance.PlayerHp, Hp = Balance.PlayerHp,
            Atk = Balance.PlayerAtk, CritRate = Balance.PlayerCritRate,
            CritDmg = Balance.PlayerCritDmg, IsPlayerTeam = true,
        };

        private Vector3 _vel;
        private float _dashT, _dashCd, _iframes, _attackT;
        private int _combo;
        private float _comboTimer;
        private Vector3 _dashDir = Vector3.right;

        private static readonly float[] ComboMults = { 1.0f, 1.0f, 1.6f };
        private static readonly float[] ComboTimes = { 0.32f, 0.32f, 0.45f };

        private void Update()
        {
            float dt = Time.deltaTime;
            Unit.TickTimers(dt);
            if (_dashCd > 0) _dashCd -= dt;
            if (_iframes > 0) _iframes -= dt;
            if (_attackT > 0) _attackT -= dt;
            if (_comboTimer > 0) _comboTimer -= dt; else _combo = 0;

            // ---- 翻滚 ----
            if (_dashT > 0)
            {
                _dashT -= dt;
                transform.position += _dashDir * (Balance.DashDistM / Balance.DashDurS) * dt;
                return;
            }
            if (Input.GetKeyDown(KeyCode.Space) && _dashCd <= 0)
            {
                var ax0 = MoveAxis();
                _dashDir = ax0.sqrMagnitude > 0 ? ax0.normalized : AimDir();
                _dashT = Balance.DashDurS;
                _dashCd = 1.6f;
                _iframes = Balance.DashDurS;
                return;
            }

            // ---- 移动(指数趋近) ----
            var ax = MoveAxis();
            float slow = _attackT > 0 ? 0.35f : 1f;
            var target = ax * Balance.PlayerMoveSpeed * slow;
            float k = 1f - Mathf.Exp(-dt / 0.06f);
            _vel += (target - _vel) * k;
            transform.position += _vel * dt;
            Clamp();

            // ---- 三段连击 ----
            if (Input.GetMouseButton(0) && _attackT <= 0)
            {
                _combo = _comboTimer > 0 ? _combo % 3 + 1 : 1;
                _attackT = ComboTimes[_combo - 1];
                _comboTimer = 0.9f + _attackT;
                MeleeSweep(AimDir(), 2.0f, 110f * Mathf.Deg2Rad, ComboMults[_combo - 1]);
            }
        }

        public void Hurt(float amount)
        {
            if (_iframes > 0 || _dashT > 0) return;
            Unit.Hp -= amount;
            if (Unit.Hp <= 0) Debug.Log("Hero down!");
        }

        private void MeleeSweep(Vector3 dir, float rangeM, float arcRad, float mult)
        {
            foreach (var e in GameBootstrap.I.Enemies)
            {
                if (e == null) continue;
                var to = e.transform.position - transform.position;
                to.y = 0;
                if (to.magnitude > rangeM) continue;
                if (Vector3.Angle(dir, to) * Mathf.Deg2Rad > arcRad / 2f) continue;
                int dmg = DamagePipeline.Deal(new DealOpts
                {
                    Source = Unit, Target = e.Unit, Mult = mult, CanCrit = true,
                });
                e.OnHit(dmg, to.normalized);
            }
        }

        private static Vector3 MoveAxis()
        {
            var v = new Vector3(Input.GetAxisRaw("Horizontal"), 0, Input.GetAxisRaw("Vertical"));
            return v.sqrMagnitude > 1 ? v.normalized : v;
        }

        private Vector3 AimDir()
        {
            var plane = new Plane(Vector3.up, Vector3.zero);
            var ray = Camera.main.ScreenPointToRay(Input.mousePosition);
            if (plane.Raycast(ray, out float d))
            {
                var p = ray.GetPoint(d) - transform.position;
                p.y = 0;
                if (p.sqrMagnitude > 0.01f) return p.normalized;
            }
            return Vector3.right;
        }

        private void Clamp()
        {
            var b = GameBootstrap.I;
            var p = transform.position;
            p.x = Mathf.Clamp(p.x, -b.ArenaW / 2 + 0.4f, b.ArenaW / 2 - 0.4f);
            p.z = Mathf.Clamp(p.z, -b.ArenaH / 2 + 0.4f, b.ArenaH / 2 - 0.4f);
            transform.position = p;
        }
    }
}
