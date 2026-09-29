import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { defaultSave, migrateSave } from '../migrations';
import {
  BOARD_ASC, BOARD_HINT, BOARD_IDS, BOARD_LABEL, MIN_HIT, MIN_KILLS, TOP_N,
  boardsFilled, emptyBoards, formatScore, rankOf, runScores, sanitizeLeaderboards,
  sortBoard, submitRun, tagLabel, type Klass, type RunScore,
} from '../Leaderboard';

const run = (over: Partial<RunScore> = {}): RunScore => ({
  cleared: true, noHit: false, timeS: 300, kills: 40, maxHit: 55,
  klass: 'blade', chapter: 1, tag: '', at: 1000, ...over,
});

describe('榜单配置', () => {
  it('四条榜,各有中文名与说明,升/降序方向明确', () => {
    expect(BOARD_IDS).toEqual(['speed', 'kills', 'hit', 'nohit']);
    for (const id of BOARD_IDS) {
      expect(BOARD_LABEL[id].length).toBeGreaterThan(0);
      expect(BOARD_HINT[id].length).toBeGreaterThan(0);
      expect(typeof BOARD_ASC[id]).toBe('boolean');
    }
    // 时间类升序(越小越好)、分数类降序
    expect(BOARD_ASC.speed).toBe(true);
    expect(BOARD_ASC.nohit).toBe(true);
    expect(BOARD_ASC.kills).toBe(false);
    expect(BOARD_ASC.hit).toBe(false);
  });

  it('榜单容量与门槛走 balance.json(不硬编码在 UI 里)', () => {
    expect(TOP_N).toBe(balance.leaderboard.topN);
    expect(MIN_KILLS).toBe(balance.leaderboard.minKills);
    expect(MIN_HIT).toBe(balance.leaderboard.minHit);
    expect(TOP_N).toBeGreaterThanOrEqual(3);
  });
});

describe('提交成绩(一次出征 → 进哪些榜)', () => {
  it('通关进速度榜,无伤通关才进无伤榜', () => {
    expect(runScores(run())).toHaveProperty('speed');
    expect(runScores(run())).not.toHaveProperty('nohit');
    expect(runScores(run({ noHit: true }))).toHaveProperty('nohit');
    // 没通关:速度/无伤都不进
    const lost = runScores(run({ cleared: false, noHit: false, timeS: 0 }));
    expect(lost).not.toHaveProperty('speed');
    expect(lost).not.toHaveProperty('nohit');
  });

  it('击杀/单次伤害有门槛:太低的局不上榜(免得榜被 1 杀刷满)', () => {
    expect(runScores(run({ kills: MIN_KILLS - 1 }))).not.toHaveProperty('kills');
    expect(runScores(run({ kills: MIN_KILLS }))).toHaveProperty('kills');
    expect(runScores(run({ maxHit: 0 }))).not.toHaveProperty('hit');
    expect(runScores(run({ maxHit: MIN_HIT }))).toHaveProperty('hit');
  });

  it('成绩条目带职业/章节/挑战标记/时间戳(榜单能显示"谁用什么打的")', () => {
    const e = runScores(run({ klass: 'arcanist', chapter: 3, tag: 'weekly:2026-W40', at: 777 })).speed!;
    expect(e).toEqual({ score: 300, klass: 'arcanist', chapter: 3, tag: 'weekly:2026-W40', at: 777 });
  });

  it('一次出征只提交一次:重复提交同一局不会把榜刷满自己', () => {
    const d = defaultSave();
    submitRun(d, run({ at: 1, timeS: 300 }));
    submitRun(d, run({ at: 2, timeS: 200 })); // 更好的成绩
    expect(d.leaderboard.speed).toHaveLength(2);
    // 但同样的成绩不会去重(同名次多局是合理的)
    submitRun(d, run({ at: 3, timeS: 200 }));
    expect(d.leaderboard.speed).toHaveLength(3);
  });

  it('返回"这局进了哪些榜"(结算提示用)', () => {
    const d = defaultSave();
    const hit = submitRun(d, run({ noHit: true }));
    expect(Object.keys(hit).sort()).toEqual(['hit', 'kills', 'nohit', 'speed']);
  });
});

describe('排序与截断', () => {
  it('时间榜升序、分数榜降序;同分时最近一次在前', () => {
    const mk = (s: number, at: number) => ({ score: s, klass: 'blade' as Klass, chapter: 1 as const, at, tag: '' });
    expect(sortBoard('kills', [mk(10, 1), mk(99, 2), mk(50, 3)]).map((e) => e.score)).toEqual([99, 50, 10]);
    expect(sortBoard('speed', [mk(300, 1), mk(120, 2), mk(200, 3)]).map((e) => e.score)).toEqual([120, 200, 300]);
    expect(sortBoard('speed', [mk(120, 1), mk(120, 9)]).map((e) => e.at)).toEqual([9, 1]);
  });

  it('只保留前 N 条:插入 9 条最好成绩后仍是最强 5 条', () => {
    const d = defaultSave();
    for (let i = 1; i <= 9; i++) submitRun(d, run({ kills: i * 10, at: i }));
    expect(d.leaderboard.kills).toHaveLength(TOP_N);
    expect(d.leaderboard.kills.map((e) => e.score)).toEqual([90, 80, 70, 60, 50]);
    // 再来一条更差的成绩:榜不动
    submitRun(d, run({ kills: 5, at: 99 }));
    expect(d.leaderboard.kills.map((e) => e.score)).toEqual([90, 80, 70, 60, 50]);
    // 破纪录:挤掉最后一名
    submitRun(d, run({ kills: 100, at: 100 }));
    expect(d.leaderboard.kills.map((e) => e.score)).toEqual([100, 90, 80, 70, 60]);
  });

  it('四条榜互不干扰', () => {
    const d = defaultSave();
    submitRun(d, run({ kills: 60, maxHit: 999, timeS: 200, noHit: true }));
    expect(d.leaderboard.speed[0].score).toBe(200);
    expect(d.leaderboard.nohit[0].score).toBe(200);
    expect(d.leaderboard.kills[0].score).toBe(60);
    expect(d.leaderboard.hit[0].score).toBe(999);
  });

  it('rankOf 给出名次(不在榜内返回 0)', () => {
    const d = defaultSave();
    submitRun(d, run({ kills: 30, at: 1 }));
    submitRun(d, run({ kills: 90, at: 2 }));
    expect(rankOf('kills', d.leaderboard.kills, d.leaderboard.kills[0])).toBe(1);
    expect(rankOf('kills', d.leaderboard.kills, d.leaderboard.kills[1])).toBe(2);
    expect(rankOf('kills', d.leaderboard.kills, { score: 1, klass: 'blade', chapter: 1, at: 9, tag: '' })).toBe(0);
  });
});

describe('开榜进度', () => {
  it('boardsFilled 数的是"有几条榜有记录"', () => {
    const d = defaultSave();
    expect(boardsFilled(d)).toBe(0);
    submitRun(d, run({ kills: 1, maxHit: 0, cleared: false, timeS: 0 })); // 什么都不进
    expect(boardsFilled(d)).toBe(0);
    submitRun(d, run({ kills: 20, maxHit: 0, cleared: false, timeS: 0 })); // 只进击杀榜
    expect(boardsFilled(d)).toBe(1);
    submitRun(d, run({ noHit: true })); // 四条全进
    expect(boardsFilled(d)).toBe(BOARD_IDS.length);
  });
});

describe('展示格式', () => {
  it('时间类 mm:ss,分数类千分位', () => {
    expect(formatScore('speed', 200)).toBe('3:20');
    expect(formatScore('speed', 59)).toBe('0:59');
    expect(formatScore('speed', 3605)).toBe('60:05');
    expect(formatScore('kills', 1234)).toBe('1,234');
    expect(formatScore('hit', 9876)).toBe('9,876');
    expect(formatScore('nohit', 125)).toBe('2:05');
  });

  it('挑战徽标:每日/周常能认出来,普通局不显示', () => {
    expect(tagLabel('')).toBe('');
    expect(tagLabel('daily:2026-09-29')).toBe('🗓 2026-09-29');
    expect(tagLabel('weekly:2026-W40')).toBe('🏅 2026-W40');
    expect(tagLabel('garbage')).toBe('');
  });
});

describe('存档清洗与兼容', () => {
  it('脏数据一律丢掉:未知职业/章节、负数、NaN、超长榜', () => {
    const raw = {
      speed: [
        { score: 200, klass: 'blade', chapter: 1, at: 1, tag: '' },      // 好
        { score: -5, klass: 'blade', chapter: 1, at: 2, tag: '' },      // 负数
        { score: Number.NaN, klass: 'blade', chapter: 1, at: 3, tag: '' },
        { score: 100, klass: 'druid', chapter: 1, at: 4, tag: '' },     // 未知职业
        { score: 100, klass: 'blade', chapter: 9, at: 5, tag: '' },     // 未知章节
        null, 'nope', 42,
      ],
      kills: new Array(20).fill(null).map((_, i) => ({ score: i + 1, klass: 'ranger', chapter: 2, at: i, tag: '' })),
      hit: 'not-an-array',
    };
    const clean = sanitizeLeaderboards(raw);
    expect(clean.speed).toHaveLength(1);
    expect(clean.speed[0].score).toBe(200);
    expect(clean.kills).toHaveLength(TOP_N);                       // 截断到前 N
    expect(clean.kills.map((e) => e.score)).toEqual([20, 19, 18, 17, 16]);
    expect(clean.hit).toEqual([]);                                 // 非数组 → 空榜
    expect(clean.nohit).toEqual([]);
  });

  it('旧档(没有 leaderboard 字段)读进来是四条空榜,不报错', () => {
    const legacy = { version: 2, stardust: 100, stats: { runs: 3 } };
    const res = migrateSave(legacy);
    expect(res.data.leaderboard).toEqual(emptyBoards());
    expect(res.data.stardust).toBe(100);
  });

  it('榜单跨存档往返不丢,且顺序仍正确', () => {
    const d = defaultSave();
    submitRun(d, run({ kills: 30, at: 1 }));
    submitRun(d, run({ kills: 99, at: 2 }));
    const round = migrateSave(JSON.parse(JSON.stringify(d)));
    expect(round.data.leaderboard.kills.map((e) => e.score)).toEqual([99, 30]);
    expect(round.data.leaderboard.kills[0].klass).toBe('blade');
  });

  it('存档里的榜单超长/乱序会在迁移时被修正', () => {
    const d = defaultSave();
    d.leaderboard.kills = [
      { score: 10, klass: 'blade', chapter: 1, at: 1, tag: '' },
      { score: 90, klass: 'blade', chapter: 1, at: 2, tag: '' },
      { score: 50, klass: 'blade', chapter: 1, at: 3, tag: '' },
    ];
    const res = migrateSave(JSON.parse(JSON.stringify(d)));
    expect(res.data.leaderboard.kills.map((e) => e.score)).toEqual([90, 50, 10]);
  });
});
