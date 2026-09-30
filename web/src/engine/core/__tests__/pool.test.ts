import { describe, expect, it } from 'vitest';
import { Pool, reapInto } from '../Pool';

interface P { t: number; life: number }

describe('对象池(轮 41)', () => {
  it('借出→归还→复用:第二轮不再新建', () => {
    const pool = new Pool<P>(() => ({ t: 0, life: 0 }), 100);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(pool.created).toBe(2);
    pool.release(a);
    pool.release(b);
    pool.acquire();
    pool.acquire();
    expect(pool.created, '有空闲就不 new').toBe(2);
  });

  it('池上限:超过 cap 的归还直接丢弃(内存不被一次爆发顶死)', () => {
    const pool = new Pool<P>(() => ({ t: 0, life: 0 }), 2);
    for (let i = 0; i < 5; i++) pool.release({ t: 0, life: 0 });
    expect(pool.idle).toBe(2);
  });

  it('reapInto:就地淘汰死对象并归还池,存活的全保留', () => {
    const pool = new Pool<P>(() => ({ t: 0, life: 0 }), 100);
    const list: P[] = [
      { t: 2, life: 1 }, { t: 0.5, life: 1 }, { t: 3, life: 1 }, { t: 0.2, life: 1 },
    ];
    reapInto(list, (p) => p.t >= p.life, pool);
    expect(list).toHaveLength(2);
    expect(list.every((p) => p.t < p.life)).toBe(true);
    expect(pool.idle, '死的都进了池').toBe(2);
    // 复用:下一次 acquire 不新建
    pool.acquire();
    expect(pool.created).toBe(0);
  });

  it('高峰循环:1000 轮生灭后 created 恒定(池真的在工作)', () => {
    const pool = new Pool<P>(() => ({ t: 0, life: 0 }), 64);
    const list: P[] = [];
    for (let round = 0; round < 1000; round++) {
      for (let i = 0; i < 20; i++) {
        const p = pool.acquire();
        p.t = 0;
        p.life = 0.01;
        list.push(p);
      }
      for (const p of list) p.t = 1;
      reapInto(list, (p) => p.t >= p.life, pool);
    }
    expect(pool.created, '稳态后不再分配').toBeLessThanOrEqual(64);
  });
});
