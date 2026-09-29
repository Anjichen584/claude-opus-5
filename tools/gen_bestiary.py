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
    'midboss_mossstag': 'MidBossMossstag',
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
    # 竞技场尺寸:中 Boss 的"撞墙自晕"要读它,顺手进 parity(此前 arena 一直是 parity 盲区)
    walk('Arena', b['arena'], json_path='arena', name_prefix='')
    # 新手引导的数值叶子(moveM/hintY/saveSlots);步骤 id/文案是字符串,由 ParityTests 的 CheckTutorial 比对
    walk('Tutorial', b['tutorial'], json_path='tutorial', name_prefix='')
    # 触屏手感数值(自动瞄准范围/粘性/续瞄、摇杆半径、按钮安全边距);autoAttack 是布尔 →
    # 生成器按规则跳过,由 ParityTests 的 CheckTouch 单独比对(与教程步骤同一套纪律)
    walk('Touch', b['touch'], json_path='touch', name_prefix='')
    # 角色动作表(帧数/帧率/起伏幅度);loop 是布尔 → 生成器跳过,由 ParityTests.CheckAnim 比对
    walk('Anim', b['anim'], json_path='anim', name_prefix='')
    # 玩家基准数值(player 段):此前是 Data/Balance.cs 里**手抄**的常量,已经漂了
    # (json hp 120/atk 14/速度 4.2,常量却是 100/12/4.6)。退役手抄,改生成 + parity。
    walk('Player', b['player'], json_path='player', name_prefix='')
    # 元素反应(reactions 段):同样是 Data/Balance.cs 里**手抄且已漂**的一批 ——
    # json 权威值 蒸汽 1.8 / 超载 2.2(+击退 2.0)/ 脆蚀 0.25、4s / 麻痹 1.2s,
    # 而手抄常量是 0.9 / 1.6 / 0.2 / 0.8。reactions 以前**根本没进 parity**,所以没人发现。
    walk('Reactions', b['reactions'], json_path='reactions', name_prefix='')
    # 橙装特效 / 消耗品 / 蓝图(2026-09-29,M2 内容包的轮 19–21):三段数值叶子全部进 parity。
    # 注意:这三段的**字符串叶子**(specials.frostfangElement、consumables.flask.element,
    # 以及 web/src/data/blueprints.json 里的 slot/rarity/special/affixes)**会被下面的规则跳过** ——
    # ParityTests.CheckLoot 用字符串比对补上,否则"把元素改了"这种改动会静默漏过去。
    walk('Special', b['specials'], json_path='specials', name_prefix='')
    walk('Consumable', b['consumables'], json_path='consumables', name_prefix='')
    walk('Blueprint', b['blueprint'], json_path='blueprint', name_prefix='')
    # 商店与秘境(轮 22):数值叶子走同一条 walk;**字符串清单**(events.totems)由
    # ParityTests.CheckShop 逐 id 比对 —— 生成器按规则跳过字符串,漏了比对就等于漏了实现。
    walk('Shop', b['shop'], json_path='shop', name_prefix='')
    walk('Event', b['events'], json_path='events', name_prefix='')
    # 深渊难度层(轮 23):三层乘区 + 解锁条件;levels 是数组 → 常量名带下标(AbyssLevels0HpMult)
    walk('Abyss', b['abyss'], json_path='abyss', name_prefix='')

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

    n_json = (sum(1 for _ in leaves(enemies)) + sum(1 for _ in leaves(chapters))
              + sum(1 for _ in leaves(b['arena'])) + sum(1 for _ in leaves(b['tutorial']))
              + sum(1 for _ in leaves(b['touch']))
              + sum(1 for _ in leaves(b['anim']))
              + sum(1 for _ in leaves(b['player']))
              + sum(1 for _ in leaves(b['reactions']))
              + sum(1 for _ in leaves(b['specials']))
              + sum(1 for _ in leaves(b['consumables']))
              + sum(1 for _ in leaves(b['blueprint']))
              + sum(1 for _ in leaves(b['shop'])) + sum(1 for _ in leaves(b['events']))
              + sum(1 for _ in leaves(b['abyss'])))
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

    # ---- 四职业普攻档案(classes.* 段):同样生成,不手抄 ----
    cls_consts, cls_parity, cls_used = [], [], set()

    def add_cls(name: str, key: str, val) -> str:
        if name in cls_used:
            i = 2
            while f'{name}{i}' in cls_used:
                i += 1
            name = f'{name}{i}'
        cls_used.add(name)
        cls_consts.append((name, fmt(val), key))
        cls_parity.append((key, name))
        return name

    def walk_cls(data, json_path: str, name_prefix: str) -> None:
        for k, v in data.items():
            if k.startswith('$') or isinstance(v, (str, bool)):
                continue
            nm = name_prefix + pascal(k)
            if isinstance(v, dict):
                walk_cls(v, f'{json_path}.{k}', nm)
            elif isinstance(v, list):
                for i, x in enumerate(v):
                    add_cls(f'Klass{nm}{i}', f'{json_path}.{k}.{i}', x)
            elif isinstance(v, (int, float)):
                add_cls(f'Klass{nm}', f'{json_path}.{k}', v)
            else:
                raise SystemExit(f'未处理的职业字段类型 {type(v)} @ {json_path}.{k}')

    class_paths = []  # 只取普攻档案(combo/bow),职业的 name/hero/hpMult 等不进 parity(它们是展示与乘区,另有归属)
    for klass, kv in b['classes'].items():
        for sect in ('combo', 'bow'):
            if sect in kv:
                walk_cls(kv[sect], f'classes.{klass}.{sect}', pascal(klass) + pascal(sect))
                class_paths.append((klass, sect))

    def arr(klass: str, sect: str, field: str) -> str:
        # 数组元素按 JSON 索引顺序收集(遍历即为顺序),不再按名字排序
        items = [n for n, _v, k in cls_consts if k.startswith(f'classes.{klass}.{sect}.{field}.')]
        body = ', '.join(items)
        name = f'Klass{pascal(klass)}{pascal(sect)}{pascal(field)}S'
        return f'        public static readonly float[] {name} = {{ {body} }};'

    cls_array_lines = '\n'.join(
        arr(klass, sect, field)
        for klass, sect in class_paths
        for field in ('attackTime', 'mults')
        if any(k.startswith(f'classes.{klass}.{sect}.{field}.') for _n, _v, k in cls_consts)
    )
    cls_const_lines = '\n'.join(
        f'        /// <summary>{key}</summary>\n        public const float {n} = {v};' for n, v, key in cls_consts)
    cls_parity_lines = '\n'.join(f'            {{ "{k}", {n} }},' for k, n in cls_parity)
    cls_block = f"""
    /// <summary>
    /// 四职业普攻档案(web: game/combat/BasicAttack.ts)。同样由生成器产出:
    /// 段数/倍率/前冲/破甲/穿透/溅射这些**行为参数**一旦两边漂移,玩法就不一样了,所以逐键 parity。
    /// </summary>
    public static class BestiaryKlass
    {{
{cls_const_lines}
{cls_array_lines}

        public static readonly Dictionary<string, float> Parity = new()
        {{
{cls_parity_lines}
        }};
    }}
"""
    out_marker = "\n    }}\n}}\n"


    # ---- 元素反应(reactions 段):单独一个类(与 player 同理由:不是图鉴条目,但必须 codegen)----
    rx_consts = [(n, v, k) for n, v, k in consts if k.startswith('reactions.')]
    consts = [(n, v, k) for n, v, k in consts if not k.startswith('reactions.')]
    parity = [(k, n) for k, n in parity if not k.startswith('reactions.')]
    rx_lines = '\n'.join(
        f'        /// <summary>{key}</summary>\n        public const float {n} = {v};'
        for n, v, key in rx_consts)
    rx_parity = '\n'.join(f'            {{ "{k}", {n} }},' for k, n in
                          [(k, n) for n, v, k in rx_consts])
    rx_block = f'''
    /// <summary>
    /// 元素反应数值(reactions 段)—— 由 balance.json 生成。
    /// 为什么必须生成:这几个数以前是 `Data/Balance.cs` 里手抄的,**而且全漂了**
    /// (蒸汽 0.9 vs 1.8、超载 1.6 vs 2.2、脆蚀 +20% vs +25%、麻痹 0.8s vs 1.2s),
    /// 根因是 `reactions` 段从来没进 parity —— 手抄必错,只有 parity 能自动发现。
    /// </summary>
    public static class BestiaryReactions
    {{
{rx_lines}

        public static readonly Dictionary<string, float> Parity = new()
        {{
{rx_parity}
        }};
    }}
'''

    # ---- 玩家基准(player 段):单独一个类 —— 它不是"图鉴条目",但同样必须 codegen ----
    player_consts = [(n, v, k) for n, v, k in consts if k.startswith('player.')]
    consts = [(n, v, k) for n, v, k in consts if not k.startswith('player.')]
    parity = [(k, n) for k, n in parity if not k.startswith('player.')]
    player_lines = '\n'.join(
        f'        /// <summary>{key}</summary>\n        public const float {n} = {v};'
        for n, v, key in player_consts)
    player_parity = '\n'.join(f'            {{ "{k}", {n} }},' for k, n in
                               [(k, n) for n, v, k in player_consts])
    player_block = f'''
    /// <summary>
    /// 玩家基准数值(player 段)—— 与 <see cref="Bestiary"/> 同样由 balance.json 生成。
    /// 为什么单独一类:它是"玩家"而不是"敌人图鉴";为什么也必须生成:手抄的旧常量已经漂了
    /// (hp 100/atk 12/速度 4.6 vs 真实 120/14/4.2),而 parity 是唯一能自动发现的机制。
    /// </summary>
    public static class BestiaryPlayer
    {{
{player_lines}

        public static readonly Dictionary<string, float> Parity = new()
        {{
{player_parity}
        }};
    }}
'''
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
{cls_block}
{rx_block}
{player_block}}}'''
    DST.write_text(out)
    print(f'✅ 生成 {DST.relative_to(ROOT)}:{len(consts)} 个数值常量 / {len(rows)} 行图鉴 / {len(parity)} 个 parity 键 '
          f'+ 职业普攻档案 {len(cls_consts)} 键 + 玩家基准 {len(player_consts)} 键 + 元素反应 {len(rx_consts)} 键')
    return 0


if __name__ == '__main__':
    sys.exit(main())
