import { describe, expect, it } from 'vitest';
import { exportCode, importCode } from '../SaveCode';
import { defaultSave } from '../migrations';

describe('存档码(轮 42)', () => {
  it('往返无损:导出 → 导入 → 数据一致(含中文字段)', () => {
    const d = defaultSave();
    d.stardust = 777;
    d.stats.clears = 3;
    const code = exportCode(d);
    expect(code.startsWith('SFK1.')).toBe(true);
    const res = importCode(code);
    expect(res.ok).toBe(true);
    expect(res.data!.stardust).toBe(777);
    expect(res.data!.stats.clears).toBe(3);
  });

  it('三道闸:格式不对/校验失败/JSON 坏,各给各的失败原因', () => {
    expect(importCode('随便一串').fail).toBe('format');
    expect(importCode('XXX1.abc.def').fail).toBe('format');
    const code = exportCode(defaultSave());
    const parts = code.split('.');
    expect(importCode(`${parts[0]}.${parts[1]}x.${parts[2]}`).fail, '截断/篡改 body').toBe('checksum');
    expect(importCode(`${parts[0]}.${parts[1]}.zzz`).fail, '校验对不上').toBe('checksum');
  });

  it('导入走完整迁移清洗:码里的脏数据进不了存档', () => {
    const d = defaultSave();
    (d.settings as { colorblind: number }).colorblind = 99;
    d.stardust = -50;
    const res = importCode(exportCode(d));
    expect(res.ok).toBe(true);
    expect(res.data!.settings.colorblind, '越界夹回').toBeLessThanOrEqual(3);
    expect(res.data!.stardust, '负星尘洗掉').toBeGreaterThanOrEqual(0);
  });

  it('首尾空白/换行容忍(聊天软件粘贴常见)', () => {
    const code = exportCode(defaultSave());
    expect(importCode(`  ${code}\n`).ok).toBe(true);
  });
});
