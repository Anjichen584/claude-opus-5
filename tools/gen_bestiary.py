#!/usr/bin/env python3
"""从 web/src/data/balance.json 生成 unity/Assets/Scripts/Data/Bestiary.cs。

为什么用生成而不是手抄:21 只敌人 + 3 章配置有 150+ 个数值叶子,
手抄必错;生成 + ParityTests 逐键比对,才是双端数值不漂移的唯一可靠做法。
(这也是 docs/06-STATUS.md「Unity 缺」里那条 balance.json codegen 的第一步。)

用法:  python3 tools/gen_bestiary.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'web/src/data/balance.json'
DST = ROOT / 'unity/Assets/Scripts/Data/Bestiary.cs'

# balance.json 里的敌键 → C# EnemyKind 枚举名(与 Core/LogicActor.cs 一致)
KIND = {
    'shroomling': 'Shroomling', 'windbee': 'WindBee', 'blightwolf': 'BlightWolf',
    'thornvine': 'ThornVine', 'oakgolem': 'OakGolem', 'emberimp': 'EmberImp',
    'frostslime': 'FrostSlime', 'sparklizard': 'SparkLizard', 'toxintoad': 'ToxinToad',
    'stardustsprite': 'StardustSprite', 'snowpuff': 'SnowPuff', 'iceturtle': 'IceTurtle',
    'blizzardhawk': 'BlizzardHawk', 'frostmage': 'FrostMage', 'cinderrat': 'CinderRat',
    'dunebeetle': 'DuneBeetle', 'flamedancer': 'FlameDancer', 'duststinger': 'DustStinger',
    'boss_nanmir': 'BossNanmir', 'boss_velsha': 'BossVelsha', 'boss_kazra': 'BossKazra',
}


def pascal(s: str) -> str:
    return ''.join(p[:1].upper() + p[1:] for p in re.split(r'[^0-9a-zA-Z]+', s) if p)


def fmt(v) -> str:
    return f'{float(v):g}f'


def main() -> int:
    b = json.load(open(SRC))
    enemies = dict(b['enemies'])
    enemies['boss_nanmir'] = b['boss']['nanmir']  # 一章 Boss 挂在 boss.nanmir 下
    chapters = b['chapters']

    consts, parity, used = [], [], set()

    def add(name: str, key: str, val) -> None:
        if name in used:  # 同名冲突(如 path.aB 与 path.a_b)→ 加序号
            i = 2
            while f'{name}{i}' in used:
                i += 1
            name = f'{name}{i}'
        used.add(name)
        consts.append((name, fmt(val), key))
        parity.append((key, name))

    def walk(kind: str, data, json_path: str, name_prefix: str) -> None:
        for k, v in data.items():
            if k.startswith('$'):
                continue
            if isinstance(v, dict):
                walk(kind, v, f'{json_path}.{k}', name_prefix + pascal(k))
            elif isinstance(v, list):
                for i, x in enumerate(v):
                    if isinstance(x, bool):
                        continue
                    if isinstance(x, (int, float)):
                        add(f'{kind}{name_prefix}{pascal(k)}{i}', f'{json_path}.{k}.{i}', x)
                    elif isinstance(x, dict):
                        walk(kind, x, f'{json_path}.{k}.{i}',
                             f'{name_prefix}{pascal(k)}{i}')
            elif isinstance(v, bool):
                continue
            elif isinstance(v, (int, float)):
                add(f'{kind}{name_prefix}{pascal(k)}', f'{json_path}.{k}', v)
            elif isinstance(v, str):
                continue
            else:
                raise SystemExit(f'未处理的类型 {type(v)} @ {json_path}.{k}')

    for kind, data in enemies.items():
        walk(pascal(KIND[kind]), data, json_path=kind, name_prefix='')
    for c, data in chapters.items():
        walk('Ch' + c, data, json_path=f'chapters.{c}', name_prefix='')

    # 覆盖性自检:JSON 里的每个数值叶子都必须落到一个 C# 常量
    def leaves(o, path=''):
        if isinstance(o, dict):
            for k, v in o.items():
                if not k.startswith('$'):
                    yield from leaves(v, f'{path}.{k}' if path else k)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                yield from leaves(v, f'{path}.{i}')
        elif isinstance(o, bool):
            return
        elif isinstance(o, (int, float)):
            yield path

    n_json = sum(1 for _ in leaves(enemies)) + sum(1 for _ in leaves(chapters))
    if n_json != len(consts):
        raise SystemExit(f'数值叶子数不符:JSON {n_json} vs C# {len(consts)}')

    rows = []
    for kind, d in enemies.items():
        nm = d.get('name') or kind
        rows.append('            {{ EnemyKind.{k}, new Stat("{nm}", {hp}, {atk}, {df}, {sp}, {br}, {cc}) }},'.format(
            k=KIND[kind], nm=nm, hp=fmt(d['hp']), atk=fmt(d['atk']), df=fmt(d.get('def', 0)),
            sp=fmt(d.get('speed', 0)), br=fmt(d['bodyRadius']), cc=fmt(d.get('contactCd', 0.8))))

    const_lines = '\n'.join(
        f'        /// <summary>{key}</summary>\n        public const float {n} = {v};'
        for n, v, key in consts)
    parity_lines = '\n'.join(f'            {{ "{k}", {n} }},' for k, n in parity)
    ch = {c: chapters[c] for c in ('1', '2', '3')}
    ch_lines = '\n'.join(
        '            { %s, new Chapter("%s", %s, %s, %s, %d) },' % (
            c, ch[c]['name'], fmt(ch[c]['statMult']), fmt(ch[c]['lootMult']),
            fmt(ch[c]['lanternCost']), int(ch[c]['unlockClears']))
        for c in ('1', '2', '3'))

    out = f'''using System.Collections.Generic;
using StarfallKnights.Core;

namespace StarfallKnights.Data
{{
    /// <summary>
    /// 图鉴:全部 21 种敌人的属性行 + 三章配置 + 行为参数常量。
    /// ⚠ 本文件由 `python3 tools/gen_bestiary.py` 从 web/src/data/balance.json 生成,
    /// 请勿手改(数值唯一权威是 balance.json);ParityTests 会逐键双向比对。
    /// </summary>
    public static class Bestiary
    {{
        /// <summary>敌人基础属性(未做章节/深度/昼夜缩放)。</summary>
        public readonly struct Stat
        {{
            public readonly string Name;
            public readonly float Hp, Atk, Def, Speed, BodyRadius, ContactCd;

            public Stat(string name, float hp, float atk, float def, float speed, float bodyRadius, float contactCd)
            {{
                Name = name; Hp = hp; Atk = atk; Def = def;
                Speed = speed; BodyRadius = bodyRadius; ContactCd = contactCd;
            }}
        }}

        public static readonly Dictionary<Core.EnemyKind, Stat> Stats = new()
        {{
{chr(10).join(rows)}
        }};

        public static Stat Of(Core.EnemyKind k) => Stats.TryGetValue(k, out var s) ? s : default;

        /// <summary>章节配置(1/2/3 章;statMult 是杂兵乘区,Boss 血攻已按章调好不再乘)。</summary>
        public readonly struct Chapter
        {{
            public readonly string Name;
            public readonly float StatMult, LootMult, LanternCost;
            public readonly int UnlockClears;

            public Chapter(string name, float statMult, float lootMult, float lanternCost, int unlockClears)
            {{
                Name = name; StatMult = statMult; LootMult = lootMult;
                LanternCost = lanternCost; UnlockClears = unlockClears;
            }}
        }}

        public static readonly Dictionary<int, Chapter> Chapters = new()
        {{
{ch_lines}
        }};

        public static Chapter ChapterOf(int c) => Chapters.TryGetValue(c, out var v) ? v : Chapters[1];

        // ---- 行为参数(balance.json 的全部数值叶子,逐键镜像)----

{const_lines}

        /// <summary>与 balance.json 的逐键对照表(键 = JSON 路径;ParityTests 双向校验)。</summary>
        public static readonly Dictionary<string, float> Parity = new()
        {{
{parity_lines}
        }};
    }}
}}
'''
    DST.write_text(out)
    print(f'✅ 生成 {DST.relative_to(ROOT)}:{len(consts)} 个数值常量 / {len(rows)} 行图鉴 / {len(parity)} 个 parity 键')
    return 0


if __name__ == '__main__':
    sys.exit(main())
