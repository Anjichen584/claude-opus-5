using System.Collections.Generic;
using UnityEngine;
using StarfallKnights.Combat;
using StarfallKnights.Core;
using StarfallKnights.Data;
using StarfallKnights.Loot;

namespace StarfallKnights.UnityLayer
{
    /// <summary>
    /// 最小可玩启动器:挂在空 GameObject 上即可运行——
    /// 自动创建地面/主角/一波敌人,驱动时钟与波次。
    /// 渲染用原色 Quad/Capsule 占位;正式美术可把 web/public/sprites 下 PNG
    /// 以 Point Filter 导入替换。
    /// </summary>
    public sealed class GameBootstrap : MonoBehaviour
    {
        public static GameBootstrap I { get; private set; }

        [Header("场地(米)")] public float ArenaW = 20f;
        public float ArenaH = 11f;

        public readonly GameClock Clock = new();
        public ItemFactory Factory { get; private set; }
        public PlayerController Player { get; private set; }
        public readonly List<EnemyAgent> Enemies = new();

        private int _wave;

        private void Awake()
        {
            I = this;
            Factory = new ItemFactory((uint)System.Environment.TickCount);
            DamagePipeline.OnReaction = OnReaction;
            BuildArena();
            SpawnPlayer();
            SpawnWave();
        }

        private void Update()
        {
            Clock.Tick(Time.deltaTime);
            // 清波 → 下一波(镜像 web RunManager 的最小循环)
            Enemies.RemoveAll(e => e == null);
            if (Enemies.Count == 0)
            {
                _wave++;
                SpawnWave();
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
            cam.gameObject.AddComponent<CameraFollow>();
        }

        private void SpawnPlayer()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            go.name = "Hero";
            go.transform.position = new Vector3(-ArenaW * 0.35f, 0.5f, 0);
            go.GetComponent<Renderer>().material.color = new Color(0.31f, 0.62f, 0.78f);
            Player = go.AddComponent<PlayerController>();
        }

        private void SpawnWave()
        {
            bool night = Clock.IsNight;
            int n = 4 + _wave * 2;
            for (int i = 0; i < n; i++)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                go.name = $"Shroomling_{_wave}_{i}";
                go.transform.position = new Vector3(
                    Random.Range(0f, ArenaW * 0.45f), 0.4f, Random.Range(-ArenaH * 0.4f, ArenaH * 0.4f));
                go.transform.localScale = Vector3.one * 0.8f;
                go.GetComponent<Renderer>().material.color = night
                    ? new Color(0.75f, 0.35f, 0.5f) : new Color(0.85f, 0.3f, 0.28f);
                var agent = go.AddComponent<EnemyAgent>();
                agent.Init(Balance.ScaleHp(45, _wave, night), Balance.ScaleAtk(8, _wave, night), 1.9f);
                Enemies.Add(agent);
            }
        }

        private void OnReaction(ReactionResult r)
        {
            // 空间型反应的宿主实现:蒸汽范围伤害 / 冻链弹射(最近邻)
            Debug.Log($"[Reaction] {r.Kind} depth={r.ChainDepth}");
        }
    }
}
