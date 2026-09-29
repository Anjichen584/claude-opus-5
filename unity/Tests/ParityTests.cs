using System;
using System.Collections.Generic;
using System.IO;
using StarfallKnights.Combat;
using StarfallKnights.Skills;

namespace StarfallKnights.Tests
{
    /// <summary>
    /// 双端数值 parity:直接读 web/src/data 下的 JSON,与 C# 镜像逐键比对。
    /// 这是"镜像层"能否被信任的唯一判据——任何一边改了数值而另一边没改,这里立刻红。
    /// 双向校验:C# 多出的键同样报错(JSON 删了字段却忘了删镜像)。
    /// </summary>
    public static class ParityTests
    {
        private const float Tol = 1e-3f;

        public static void Run(Action<bool, string> check, Action<float, float, float, string> near, Action<string> suite)
        {
            suite("双端 parity(web JSON ↔ C# 镜像)");
            string root = FindRepoRoot();
            if (root == null)
            {
                check(false, "找到仓库根目录(含 web/src/data)——parity 测试必须在仓库内运行");
                return;
            }
            CheckSkills(check, near, root);
            CheckRunes(check, near, root);
        }

        /// <summary>从当前程序集位置向上找含 web/src/data 的目录。</summary>
        private static string FindRepoRoot()
        {
            string env = Environment.GetEnvironmentVariable("SKREPO");
            if (!string.IsNullOrEmpty(env) && Directory.Exists(Path.Combine(env, "web/src/data"))) return env;
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            for (int i = 0; i < 12 && dir != null; i++)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "web/src/data"))) return dir.FullName;
                dir = dir.Parent;
            }
            return null;
        }

        private static void CheckSkills(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            var mirror = new Dictionary<string, float>();
            void Merge(Dictionary<string, float> d)
            {
                foreach (var kv in d) mirror[kv.Key] = kv.Value;
            }
            Merge(BladeSkills.Parity);
            Merge(RangerSkills.Parity);
            Merge(ArcanistSkills.Parity);
            Merge(WardenSkills.Parity);

            var seen = new HashSet<string>();
            int skillsSeen = 0, keysSeen = 0, mismatches = 0;

            foreach (var klass in new[] { "blade", "ranger", "arcanist", "warden" })
            {
                string path = Path.Combine(root, $"web/src/data/skills/{klass}.json");
                if (!File.Exists(path)) { check(false, $"存在 {klass}.json"); continue; }
                var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
                foreach (var so in MiniJson.Arr(doc["skills"]))
                {
                    var s = MiniJson.Obj(so);
                    string id = MiniJson.Str(s, "id");
                    skillsSeen++;

                    void Cmp(string key, double jsonVal)
                    {
                        keysSeen++;
                        seen.Add(key);
                        if (!mirror.TryGetValue(key, out float csVal))
                        {
                            mismatches++;
                            check(false, $"{key} 在 C# 镜像里缺失(JSON={jsonVal})");
                            return;
                        }
                        if (Math.Abs(csVal - jsonVal) > Tol)
                        {
                            mismatches++;
                            check(false, $"{key} 数值不一致(JSON={jsonVal} vs C#={csVal})");
                        }
                    }

                    Cmp($"{id}:cooldown", MiniJson.Num(s, "cooldown"));
                    double minRage = MiniJson.Num(s, "minRage");
                    if (!double.IsNaN(minRage)) Cmp($"{id}:minRage", minRage);

                    foreach (var po in MiniJson.Arr(s["phases"]))
                    {
                        var ph = MiniJson.Obj(po);
                        string type = MiniJson.Str(ph, "type");
                        foreach (var kv in ph)
                        {
                            if (kv.Key == "type" || !(kv.Value is double num)) continue;
                            Cmp($"{id}:{type}.{kv.Key}", num);
                        }
                    }
                }
            }

            check(skillsSeen == 12, $"web 侧 12 个技能全部读到(实际 {skillsSeen})");
            check(keysSeen > 80, $"比对了 {keysSeen} 个数值键");
            check(mismatches == 0, "所有技能数值与 JSON 一致");

            var extra = new List<string>();
            foreach (var k in mirror.Keys) if (!seen.Contains(k)) extra.Add(k);
            check(extra.Count == 0, $"C# 镜像无多余键(多出 {extra.Count} 个{(extra.Count > 0 ? ": " + string.Join(", ", extra) : "")})");
        }

        private static void CheckRunes(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            string path = Path.Combine(root, "web/src/data/runes/pool.json");
            if (!File.Exists(path)) { check(false, "存在 runes/pool.json"); return; }

            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var json = new Dictionary<string, Dictionary<string, object>>();
            foreach (var ro in MiniJson.Arr(doc["runes"]))
            {
                var r = MiniJson.Obj(ro);
                json[MiniJson.Str(r, "id")] = r;
            }

            var cs = new Dictionary<string, RuneDef>();
            foreach (var r in RunePool.All()) cs[r.Id] = r;

            check(json.Count == 36, $"web 侧 36 枚符文(实际 {json.Count})");
            check(cs.Count == 36, $"C# 侧 36 枚符文(实际 {cs.Count})");

            int bad = 0;
            var elemOf = new Dictionary<string, Element>
            {
                { "fire", Element.Fire }, { "ice", Element.Ice },
                { "bolt", Element.Bolt }, { "toxin", Element.Toxin },
            };

            foreach (var kv in json)
            {
                if (!cs.TryGetValue(kv.Key, out var r))
                {
                    bad++;
                    check(false, $"符文 {kv.Key} 在 C# 池中缺失");
                    continue;
                }
                var j = kv.Value;
                if (MiniJson.Str(j, "skill") != r.Skill) { bad++; check(false, $"符文 {kv.Key} 目标技能不一致"); }
                if (MiniJson.Str(j, "name") != r.Name) { bad++; check(false, $"符文 {kv.Key} 名称不一致({MiniJson.Str(j, "name")} vs {r.Name})"); }

                string je = MiniJson.Str(j, "element");
                if (je != null && elemOf.TryGetValue(je, out var el))
                {
                    if (!r.Element.HasValue || r.Element.Value != el)
                    {
                        bad++;
                        check(false, $"符文 {kv.Key} 元素不一致({je} vs {r.Element})");
                    }
                }

                var gz = MiniJson.Opt(j, "groundZone");
                if (gz == null)
                {
                    if (r.GroundZone != null) { bad++; check(false, $"符文 {kv.Key} C# 多了地带数据"); }
                }
                else if (r.GroundZone == null)
                {
                    bad++;
                    check(false, $"符文 {kv.Key} C# 缺少地带数据");
                }
                else
                {
                    // JSON: radiusM/lifeS/intervalS/mult  ↔  C#: [r, life, tick, mult]
                    double[] want = { MiniJson.Num(gz, "radiusM"), MiniJson.Num(gz, "lifeS"), MiniJson.Num(gz, "intervalS"), MiniJson.Num(gz, "mult") };
                    for (int i = 0; i < 4; i++)
                    {
                        if (Math.Abs(r.GroundZone[i] - want[i]) > Tol)
                        {
                            bad++;
                            check(false, $"符文 {kv.Key} 地带第 {i + 1} 个数不一致({want[i]} vs {r.GroundZone[i]})");
                        }
                    }
                }
            }
            check(bad == 0, "36 枚符文的 id/技能/名称/元素/地带与 JSON 完全一致");

            // 每技能位 3 枚 & 元素互斥(与 web 同规则,防止漏改一侧)
            var bySkill = new Dictionary<string, HashSet<Element>>();
            foreach (var r in cs.Values)
            {
                if (!bySkill.ContainsKey(r.Skill)) bySkill[r.Skill] = new HashSet<Element>();
                bySkill[r.Skill].Add(r.Element.Value);
            }
            bool ok = bySkill.Count == 12;
            foreach (var kv in bySkill) if (kv.Value.Count != 3) ok = false;
            check(ok, "12 技能位 × 3 元素互斥");
        }
    }
}
