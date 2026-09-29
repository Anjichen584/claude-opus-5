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
    /// 空格翻滚 / Q·E·R 技能(四职业可切,见 ClassSkillSet)。
    /// </summary>
    public sealed class PlayerController : MonoBehaviour
    {
        public readonly Actor Actor = new() { IsPlayer = true };
        public readonly ClassSkillSet Skills = new();
        [Header("职业(镜像 web 四职业)")] public HeroClass Hero = HeroClass.Blade;
        [Header("冷却缩减(0~0.4,装备/词条来)")] [Range(0f, 0.4f)] public float Cdr;

        private SysV2 _vel;
        private float _dashT, _dashCd, _iframes, _attackT, _comboTimer;
        private int _combo;
        private SysV2 _dashDir = new(1, 0);
        private float _dashSpeed;

        /// <summary>远程普攻运行时(猎手/秘术师;数值来自 codegen 的普攻档案)。</summary>
        private readonly ShotRuntime _shot = new();

        /// <summary>
        /// 击退的实现口径:一次性把目标沿命中方向推开 `knockbackM × 这个系数`。
        /// **这是个简化**(web 走伤害管线里的推力,由移动系统逐帧衰减);Unity 的敌人移动还没接推力通道,
        /// 所以先做"推一下",数值口径与 web 一致(距离 = knockbackM 的固定比例,不做速度曲线)。
        /// </summary>
        private const float KnockbackPushFrac = 0.12f;

        /// <summary>动作总时长(用于把"剩余时间"换算成"已进行";漏了它动画就永远停在第 1 帧)。</summary>
        private float _dashDurS, _attackDurS;

        /// <summary>
        /// 本帧该画的精灵名(渲染层接图后直接用;规则在 Core/PlayerAnim,可被逻辑层测试驱动)。
        /// 远程职业射箭时会返回 `{base}_cast_{i}` —— 普攻走 Cast 是代码口径,不是美术口径。
        /// </summary>
        public string AnimFrame(string baseName) => PlayerAnim.Frame(
            baseName, PlayerAnim.IsShotClass(Hero), Time.time,
            _dashT, _dashDurS, _attackT, _attackDurS, hurt: false,
            moving: _vel.LengthSquared() > 0.04f);

        /// <summary>当前是否处于无敌(翻滚/技能无敌帧)——逻辑层读它判定敌人伤害。</summary>
        public bool Invulnerable => _iframes > 0f || _dashT > 0f;

        // 这里原本手抄着 ComboMults/ComboTimes 两张表(1.0/1.0/1.6、0.32/0.32/0.45s),
        // 与 balance.classes.*.combo 的 attackTime(0.2/0.2/0.28)与攻击距离(2.2m)**都对不上** —— 
        // 又是一次"手抄必漂"。现在数值一律走 BasicAttack.ComboOf/ResolveCombo(生成常量 + parity)。

        private void Awake()
        {
            Actor.Unit.HpMax = BestiaryPlayer.PlayerHp;
            Actor.Unit.Hp = BestiaryPlayer.PlayerHp;
            Actor.Unit.Atk = BestiaryPlayer.PlayerAtk;
            Actor.Unit.CritRate = BestiaryPlayer.PlayerCritRate;
            Actor.Unit.CritDmg = BestiaryPlayer.PlayerCritDmg;
            Actor.Unit.IsPlayerTeam = true;
            Skills.Class = Hero;
            Skills.Cdr = Cdr;
            // 开局赠一枚随机 Q 符文(镜像 web 开局赠符,体验元素连锁)
            Skills.GrantRandomQRune(new StarfallKnights.Core.Rng((uint)System.Environment.TickCount));
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            var w = GameBootstrap.I.World;
            Skills.Tick(dt);
            if (_dashCd > 0) _dashCd -= dt;
            if (_iframes > 0) _iframes -= dt;
            if (_attackT > 0) _attackT -= dt;
            _shot.Tick(dt);
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
                StartDash(BestiaryPlayer.PlayerDashDistance, BestiaryPlayer.PlayerDashDuration, 1.6f);
                return;
            }

            // 技能(准星点用于猎手箭雨/秘术师闪现的限程,镜像 web renderer.mouseWorld)
            var aimPoint = MouseWorld();
            if (Input.GetKeyDown(KeyCode.Q)) Skills.CastQ(w);
            if (Input.GetKeyDown(KeyCode.E))
            {
                var dash = Skills.CastE(w, aimPoint);
                if (dash.HasValue)
                {
                    if (dash.Value.Teleported)
                    {
                        // 秘术师闪现:逻辑层已改坐标,宿主只补无敌帧 + 同步
                        _iframes = Mathf.Max(_iframes, dash.Value.IframesS);
                        Clamp();
                        Sync();
                    }
                    else
                    {
                        StartDash(dash.Value.DistM, dash.Value.DurS, 0f);
                        _iframes = Mathf.Max(_iframes, dash.Value.IframesS);
                    }
                }
            }
            if (Input.GetKeyDown(KeyCode.R)) Skills.CastR(w, null, aimPoint);

            // 移动(指数趋近)
            // 出招减速按**职业档案**算:猎手可走射(1.0)、秘术师施法 0.55
            // —— 以前这里写死 0.35,等于替两个远程职业各改了一次手感(与 web moveSlowOf 漂开)
            var ax = MoveAxis();
            bool isShot = BasicAttack.KindOf(Hero) == BasicAttack.Kind.Shot;
            float slow = _attackT > 0
                ? (isShot ? ShotRuntime.MoveSlowOf(BasicAttack.ShotOf(Hero)) : 0.35f)
                : 1f;
            var target = ax * BestiaryPlayer.PlayerMoveSpeed * slow;
            float k = 1f - Mathf.Exp(-dt / 0.06f);
            _vel += (target - _vel) * k;
            Actor.Pos += _vel * dt;
            Clamp();

            // 普攻:形态由职业档案决定 —— 远程**射击**(猎手连射 / 秘术师法球),近战三段连击
            if (isShot)
            {
                var spec = BasicAttack.ShotOf(Hero);
                if (Input.GetMouseButton(0) && _shot.TryFire(w, Actor.Pos, new SysV2(Mathf.Cos(Actor.Face), Mathf.Sin(Actor.Face)), spec))
                {
                    _attackT = spec.RateS;          // 拉弓动作的时长 = 射击节奏(动作走 Cast,见 AnimRules.AttackAction)
                    _attackDurS = spec.RateS;
                    _comboTimer = 1.0f;
                    Skills.Rage = Mathf.Min(100, Skills.Rage + 2);
                }
                Sync();
                return;
            }

            // 三段连击(命中攒怒气)。段数/时长/倍率/距离/弧角/击退/前冲/破甲**全读档案**,
            // 与 web 的 comboStep 同一条规则(以前是手抄常数,和 balance 对不上)
            if (Input.GetMouseButton(0) && _attackT <= 0)
            {
                var cspec = BasicAttack.ComboOf(Hero);
                var step = BasicAttack.ResolveCombo(cspec, _combo, _comboTimer);
                _combo = step.Stage;
                _attackT = step.TimeS;
                _attackDurS = step.TimeS;
                _comboTimer = cspec.WindowS + step.TimeS;
                foreach (var e in new System.Collections.Generic.List<Actor>(
                    w.EnemiesInCone(Actor.Pos, Actor.Face, step.RangePx / BasicAttack.PxPerM, step.ArcRad)))
                {
                    // 命中方向 = 从出手点指向目标(镜像 web hitAngle):带它才能算绕背/正面减伤
                    var to = e.Pos - Actor.Pos;
                    bool hasDir = to.LengthSquared() > 0.0001f;
                    DamagePipeline.Deal(new DealOpts
                    {
                        Source = Actor.Unit, Target = e.Unit,
                        Mult = step.Mult, CanCrit = true,
                        HasHitAngle = hasDir,
                        HitAngleRad = hasDir ? Mathf.Atan2(to.Y, to.X) : 0f,
                    });
                    // 终结段额外效果(与 web CombatSystem 一致):
                    // 击退 = 把目标沿命中方向推开一段;破甲 = 挂易伤,和元素"脆蚀"共用同一条通道
                    if (step.KnockbackM > 0f && hasDir && !e.IsPlayer)
                        e.Pos += SysV2.Normalize(to) * (step.KnockbackM * KnockbackPushFrac);
                    if (step.VulnS > 0f)
                    {
                        e.Unit.VulnT = Mathf.Max(e.Unit.VulnT, step.VulnS);
                        e.Unit.VulnPct = BestiaryReactions.ReactionsBrittlePct;
                    }
                    Skills.Rage = Mathf.Min(100, Skills.Rage + 4);
                }
                // 终结段前冲:位移是生存手段,不是特效(web lungeImpulse 同款)
                float imp = BasicAttack.LungeImpulse(step);
                if (imp > 0f) _vel += new SysV2(Mathf.Cos(Actor.Face), Mathf.Sin(Actor.Face)) * imp;
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
            _dashDurS = durS;
            _dashSpeed = distM / durS;
            if (cd > 0) _dashCd = cd;
            _iframes = Mathf.Max(_iframes, durS);
        }

        private static SysV2 MoveAxis()
        {
            var v = new SysV2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
            return v.LengthSquared() > 1 ? SysV2.Normalize(v) : v;
        }

        /// <summary>鼠标在逻辑平面上的位置(米);无相机时返回 null(退回朝向前方)。</summary>
        private SysV2? MouseWorld()
        {
            if (Camera.main == null) return null;
            var plane = new Plane(Vector3.up, Vector3.zero);
            var ray = Camera.main.ScreenPointToRay(Input.mousePosition);
            if (!plane.Raycast(ray, out float d)) return null;
            return GameBootstrap.ToLogic(ray.GetPoint(d));
        }

        private float AimFace()
        {
            var mw = MouseWorld();
            if (mw.HasValue)
            {
                var p = mw.Value - Actor.Pos;
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
