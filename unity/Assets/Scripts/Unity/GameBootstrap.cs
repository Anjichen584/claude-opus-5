using System.Collections.Generic;
using UnityEngine;
using StarfallKnights.Combat;
using StarfallKnights.Core;
using StarfallKnights.Dungeon;
using StarfallKnights.Loot;
using StarfallKnights.Meta;
using SysV2 = System.Numerics.Vector2;

namespace StarfallKnights.UnityLayer
{
    /// <summary>
    /// 启动器(逻辑驱动版):LogicWorld + RunManagerLite 推进 9 房序列,
    /// 清房出传送门,Boss 死通关;Zone 有半透明圆盘可视化。挂空物体即玩。
    /// 逻辑坐标(米,XY)→ Unity (x, 0, z)。
    /// </summary>
    public sealed class GameBootstrap : MonoBehaviour
    {
        public static GameBootstrap I { get; private set; }

        [Header("场地(米)")] public float ArenaW = 20f;
        public float ArenaH = 11f;
        [Header("章节(1 翠语林地 / 2 霜语冰原 / 3 烬语荒漠)")] [Range(1, 3)] public int Chapter = 1;

        public readonly LogicWorld World = new();
        public readonly RunManagerLite Run = new();
        public readonly StarfallKnights.Dungeon.CreatureAI Mobs = new();
        public readonly StarfallKnights.Dungeon.BossAI Bosses = new();
        public ItemFactory Factory { get; private set; }
        public MetaSave Meta => _save.Meta;
        // ---- 局外状态(轮 42 面板数据源 / 轮 43 SaveCodec 落盘)----
        private SaveCodec.State _save = new();
        public Codex Codex => _save.Codex;
        public Leaderboard.Boards4 Boards => _save.Boards;
        public Dictionary<string, long> AchvUnlocked => _save.AchvUnlocked;
        private const string SaveKey = "sk_save";

        /// <summary>读档(坏档/缺档 = 全新状态;三重清洗在 SaveCodec 里)。</summary>
        private void LoadSave() => _save = SaveCodec.Decode(PlayerPrefs.GetString(SaveKey, ""));

        /// <summary>落盘(通关/解锁等关键节点调用;PlayerPrefs 只存一个字符串)。</summary>
        public void Persist()
        {
            Meta.updatedAt = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            PlayerPrefs.SetString(SaveKey, SaveCodec.Encode(_save));
            PlayerPrefs.Save();
        }
        /// <summary>职业中文名(排行榜行用;权威在 balance.json classes 段,这里是宿主注入位)</summary>
        public Leaderboard.BalanceKlassNames KlassNames = new()
        { Blade = "狂澜剑士", Ranger = "星弓猎手", Arcanist = "元素秘术师", Warden = "岩铠守卫" };
        private float _runTimeS;
        private int _runKills;
        public PlayerController Player { get; private set; }

        private readonly Dictionary<Actor, GameObject> _views = new();
        private readonly Dictionary<Zone, GameObject> _zoneViews = new();
        private readonly Dictionary<StarfallKnights.Combat.Telegraph, GameObject> _teleViews = new();
        private GameObject _portal;

        public static Vector3 ToUnity(SysV2 p) => new(p.X - 10f, 0.45f, p.Y - 5.5f);
        public static SysV2 ToLogic(Vector3 p) => new(p.x + 10f, p.z + 5.5f);

        private void Awake()
        {
            I = this;
            LoadSave();
            Factory = new ItemFactory((uint)System.Environment.TickCount);
            DamagePipeline.OnReaction = (r) => Debug.Log($"[Reaction] {r.Kind}");
            BuildArena();
            SpawnPlayer();
            World.OnEnemyDied = OnEnemyDied;
            Run.SetChapter(Chapter);
            Run.OnSpawn = SpawnEnemy;
            Run.OnRoomStart = (kind, depth) =>
            {
                Mobs.Clear();
                Bosses.Clear();
                Debug.Log($"[{Run.ChapterCfg.Name}] 第 {depth + 1} 房 · {kind}");
            };
            // Boss 召唤小怪:走同一条 SpawnEnemy,保证视图/属性一致
            Bosses.SpawnMinion = (k, pos) =>
            {
                SpawnEnemy(k, StarfallKnights.Data.Bestiary.Of(k).Hp,
                    StarfallKnights.Data.Bestiary.Of(k).Atk, StarfallKnights.Data.Bestiary.Of(k).Speed);
                var actor = World.Enemies[World.Enemies.Count - 1];
                actor.Pos = pos;
                if (_views.TryGetValue(actor, out var go)) go.transform.position = ToUnity(pos);
            };
            Bosses.OnPhaseChanged = (actor, phase, msg) => Debug.Log($"[Boss P{phase}] {msg}");
            Run.OnRoomCleared = (_) => ShowPortal();
            Run.OnVictory = () =>
            {
                Meta.clears++;
                if (Meta.bestTimeS <= 0 || _runTimeS < Meta.bestTimeS) Meta.bestTimeS = _runTimeS;
                Leaderboard.Submit(Boards, new Leaderboard.RunScore
                {
                    Cleared = true, TimeS = _runTimeS, Kills = _runKills, MaxHit = 0,
                    Klass = "blade", Chapter = Chapter,
                    At = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                });
                CheckAchievements();
                Persist();
                Debug.Log("★ 章节通关!");
                ShowPortal();
            };
            Meta.runs++;
            CheckAchievements();
            Run.NextRoom(World);
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            _runTimeS += dt;
            // 无敌帧交给逻辑层(敌人伤害/地带/预警都尊重它)
            World.PlayerInvulnerable = Player != null && Player.Invulnerable;
            Mobs.Update(World, dt);
            Bosses.Update(World, dt);
            World.Tick(dt);
            Run.Tick(World);
            SyncZoneViews();
            SyncTelegraphViews();

            // 踩传送门 → 下一房
            if (_portal != null && Player != null &&
                Vector3.Distance(Player.transform.position, _portal.transform.position) < 0.9f)
            {
                Destroy(_portal);
                _portal = null;
                if (!Run.NextRoom(World)) Debug.Log("序列结束,返回营地(宿主自行处理场景切换)");
            }
        }

        private void BuildArena()
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Quad);
            ground.name = "Ground";
            ground.transform.rotation = Quaternion.Euler(90, 0, 0);
            ground.transform.localScale = new Vector3(ArenaW, ArenaH, 1);
            ground.GetComponent<Renderer>().material.color = new Color(0.42f, 0.66f, 0.35f);
            var cam = Camera.main != null ? Camera.main : new GameObject("Main Camera", typeof(Camera)).GetComponent<Camera>();
            cam.tag = "MainCamera";
            cam.orthographic = true;
            cam.orthographicSize = 6.5f;
            cam.transform.position = new Vector3(0, 10, 0);
            cam.transform.rotation = Quaternion.Euler(90, 0, 0);
            if (cam.GetComponent<CameraFollow>() == null) cam.gameObject.AddComponent<CameraFollow>();
        }

        private void SpawnPlayer()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            go.name = "Hero";
            go.GetComponent<Renderer>().material.color = new Color(0.31f, 0.62f, 0.78f);
            Player = go.AddComponent<PlayerController>();
            World.Player = Player.Actor;
            Player.Actor.Pos = new SysV2(3.5f, ArenaH / 2f);
        }

        private void SpawnEnemy(EnemyKind kind, float hp, float atk, float speed)
        {
            var actor = new Actor { Kind = kind };
            actor.Unit.HpMax = hp;
            actor.Unit.Hp = hp;
            actor.Unit.Atk = atk;
            actor.Unit.Def = kind == EnemyKind.OakGolem ? 4 : 0;
            actor.Pos = new SysV2(
                Random.Range(ArenaW * 0.45f, ArenaW - 1.5f), Random.Range(1.2f, ArenaH - 1.2f));
            World.Enemies.Add(actor);

            bool boss = kind == EnemyKind.BossNanmir;
            var go = GameObject.CreatePrimitive(boss ? PrimitiveType.Cube : PrimitiveType.Sphere);
            go.name = kind.ToString();
            var stat = StarfallKnights.Data.Bestiary.Of(kind);
            float diameter = Mathf.Max(0.4f, stat.BodyRadius * 2f);
            go.transform.localScale = Vector3.one * diameter;
            go.GetComponent<Renderer>().material.color = ColorOf(kind);
            var agent = go.AddComponent<EnemyAgent>();
            agent.Bind(actor);
            _views[actor] = go;
        }

        /// <summary>聚合快照 → 幂等解锁;新解锁打日志(真 UI 弹条归后续渲染轮)。</summary>
        private void CheckAchievements()
        {
            var st = Achievements.AchvState.From(Meta);
            st.CodexEnemies = Codex.EnemyFound;
            st.CodexRunes = Codex.RuneFound;
            st.BoardsFilled = Boards.Filled();
            var fresh = Achievements.Unlock(AchvUnlocked, st,
                System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            foreach (var id in fresh)
            {
                var text = PanelModels.AchvText.TryGetValue(id, out var tx) ? tx.name : id;
                Debug.Log($"[Achv] 🏆 成就解锁「{text}」");
            }
        }

        private void OnEnemyDied(Actor a)
        {
            Meta.totalKills++;
            _runKills++;
            Meta.stardust += 3 + (int)(a.Unit.HpMax / 30);
            if (Codex.MarkKill(a.Kind)) Debug.Log($"[Codex] 新条目:{a.Kind}");
            CheckAchievements();
            if (_views.TryGetValue(a, out var go))
            {
                _views.Remove(a);
                Destroy(go);
            }
        }

        private void ShowPortal()
        {
            _portal = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            _portal.name = "Portal";
            _portal.transform.position = new Vector3(ArenaW / 2f - 1.5f - 10f, 0.05f, 0);
            _portal.transform.localScale = new Vector3(1.2f, 0.05f, 1.2f);
            _portal.GetComponent<Renderer>().material.color = new Color(0.95f, 0.85f, 0.4f);
        }

        private static Color ColorOf(EnemyKind kind) => kind switch
        {
            EnemyKind.Shroomling => new Color(0.85f, 0.30f, 0.28f),
            EnemyKind.WindBee => new Color(0.9f, 0.8f, 0.3f),
            EnemyKind.BlightWolf => new Color(0.45f, 0.35f, 0.6f),
            EnemyKind.ThornVine => new Color(0.25f, 0.5f, 0.3f),
            EnemyKind.OakGolem => new Color(0.5f, 0.36f, 0.2f),
            EnemyKind.EmberImp => new Color(1f, 0.45f, 0.25f),
            EnemyKind.FrostSlime => new Color(0.55f, 0.8f, 0.95f),
            EnemyKind.SparkLizard => new Color(0.95f, 0.9f, 0.35f),
            EnemyKind.ToxinToad => new Color(0.5f, 0.75f, 0.3f),
            EnemyKind.StardustSprite => new Color(1f, 0.9f, 0.6f),
            EnemyKind.SnowPuff => new Color(0.9f, 0.95f, 1f),
            EnemyKind.IceTurtle => new Color(0.4f, 0.6f, 0.7f),
            EnemyKind.BlizzardHawk => new Color(0.7f, 0.85f, 1f),
            EnemyKind.FrostMage => new Color(0.5f, 0.55f, 0.9f),
            EnemyKind.CinderRat => new Color(0.8f, 0.35f, 0.2f),
            EnemyKind.DuneBeetle => new Color(0.75f, 0.6f, 0.3f),
            EnemyKind.FlameDancer => new Color(1f, 0.55f, 0.3f),
            EnemyKind.DustStinger => new Color(0.7f, 0.55f, 0.35f),
            EnemyKind.BossNanmir => new Color(0.35f, 0.28f, 0.2f),
            EnemyKind.BossVelsha => new Color(0.45f, 0.62f, 0.85f),
            EnemyKind.BossKazra => new Color(0.85f, 0.4f, 0.2f),
            _ => new Color(0.55f, 0.2f, 0.2f),
        };

        /// <summary>预警圈可视化:红=敌方,黄=玩家侧;随生灭同步(闪烁交给半径缩放)。</summary>
        private void SyncTelegraphViews()
        {
            var list = World.Telegraphs;
            foreach (var t in list)
            {
                if (!_teleViews.TryGetValue(t, out var go))
                {
                    go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    go.name = "Telegraph";
                    Destroy(go.GetComponent<Collider>());
                    go.transform.localScale = new Vector3(t.RadiusM * 2f, 0.02f, t.RadiusM * 2f);
                    _teleViews[t] = go;
                }
                go.transform.position = ToUnity(t.Pos) + Vector3.down * 0.45f;
                var mat = go.GetComponent<Renderer>().material;
                float k = t.TelegraphS > 0f ? Mathf.Clamp01(t.ElapsedS / t.TelegraphS) : 1f;
                mat.color = t.EnemyTeam
                    ? new Color(1f, 0.35f, 0.35f, 0.2f + 0.35f * k)
                    : new Color(1f, 0.9f, 0.4f, 0.2f + 0.35f * k);
            }
            var dead = new List<StarfallKnights.Combat.Telegraph>();
            foreach (var kv in _teleViews) if (!list.Contains(kv.Key)) dead.Add(kv.Key);
            foreach (var k in dead)
            {
                Destroy(_teleViews[k]);
                _teleViews.Remove(k);
            }
        }

        /// <summary>Zone 可视化:半透明圆盘随生灭同步。</summary>
        private void SyncZoneViews()
        {
            foreach (var z in World.Zones)
            {
                if (_zoneViews.ContainsKey(z)) continue;
                var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                go.name = "Zone";
                Destroy(go.GetComponent<Collider>());
                go.transform.position = ToUnity(z.Pos) + Vector3.down * 0.35f;
                go.transform.localScale = new Vector3(z.RadiusM * 2, 0.03f, z.RadiusM * 2);
                var mat = go.GetComponent<Renderer>().material;
                mat.color = z.Element switch
                {
                    Element.Fire => new Color(1f, 0.55f, 0.35f, 0.45f),
                    Element.Ice => new Color(0.55f, 0.85f, 1f, 0.45f),
                    Element.Bolt => new Color(1f, 0.9f, 0.45f, 0.45f),
                    Element.Toxin => new Color(0.7f, 0.9f, 0.45f, 0.45f),
                    _ => new Color(1f, 1f, 1f, 0.35f),
                };
                _zoneViews[z] = go;
            }
            var dead = new List<Zone>();
            foreach (var kv in _zoneViews)
            {
                if (!World.Zones.Contains(kv.Key))
                {
                    Destroy(kv.Value);
                    dead.Add(kv.Key);
                }
            }
            foreach (var k in dead) _zoneViews.Remove(k);
        }
    }
}
