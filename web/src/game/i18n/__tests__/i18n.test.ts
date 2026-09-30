import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { I18N_TABLES, LOCALES, getLocale, missingKeys, setLocale, t } from '../index';
import baseline from '../baseline.json';

describe('i18n 核心(轮 39)', () => {
  it('t():当前语言 → 中文回落 → 键名回落;{x} 占位替换', () => {
    setLocale('zh');
    expect(t('pause.title')).toBe('⏸ 暂停');
    setLocale('en');
    expect(t('pause.title')).toBe('⏸ Paused');
    expect(t('pause.mute', { state: 'X' })).toContain('X');
    expect(t('这个键不存在')).toBe('这个键不存在');
    expect(missingKeys.has('这个键不存在')).toBe(true);
    setLocale('zh');
  });

  it('setLocale:未知语言回 zh(存档脏数据不炸)', () => {
    setLocale('fr');
    expect(getLocale()).toBe('zh');
  });

  it('EN 表键集合 = ZH 表键集合(已抽取的切片必须两语齐;翻译欠账在这一行现形)', () => {
    const zh = Object.keys(I18N_TABLES.zh).sort();
    const en = Object.keys(I18N_TABLES.en).sort();
    expect(en).toEqual(zh);
    expect(LOCALES).toEqual(['zh', 'en']);
  });
});

describe('i18n 棘轮(硬编码中文只许降不许升)', () => {
  const CJK = /['"`][^'"`\n]*[\u4e00-\u9fa5]/g;
  const walk = (dir: string, out: string[]): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== '__tests__') walk(p, out);
      } else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
    }
  };

  it('每个文件的硬编码中文串 ≤ 基线;新文件必须从 0 开始(抽干净一片就重刷基线)', () => {
    const files: string[] = [];
    walk('src', files);
    const b = baseline as Record<string, number>;
    let total = 0;
    const regressions: string[] = [];
    for (const f of files) {
      const rel = f.replace(/\\/g, '/');
      const n = (readFileSync(f, 'utf8').match(CJK) ?? []).length;
      total += n;
      const allowed = b[rel] ?? 0;
      if (n > allowed) regressions.push(`${rel}: ${n} > 基线 ${allowed}`);
    }
    expect(regressions, '新增硬编码中文!用 t() 进文本表,或(仅限抽取轮)重刷基线').toEqual([]);
    expect(total).toBeLessThanOrEqual(b.__total__);
  });
});
