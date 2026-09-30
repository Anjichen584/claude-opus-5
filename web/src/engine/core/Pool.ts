/**
 * 对象池(轮 41 性能):高频小对象(粒子/飘字)的分配复用。
 *
 * 为什么要它:FeedbackSystem 的粒子原先是"每次命中 new 6~14 个对象 + 每帧 filter() 重建数组"。
 * 割草高峰(30 怪 + 连锁反应)一秒能造几千个短命对象 —— GC 抖动就是从这来的。
 * 池化后:对象终身复用,回收用 swap-remove(不保序,粒子不在乎),零每帧分配。
 *
 * 用法:池只管"借/还",字段重置是调用方的活(reset 回调),避免池对对象结构做任何假设。
 */
export class Pool<T> {
  private free: T[] = [];
  /** 累计新建数(测试/调试用:池工作正常时它应该很快停止增长) */
  created = 0;

  constructor(
    private readonly make: () => T,
    /** 池上限:超过就丢弃归还的对象(防止一次爆发把内存顶死) */
    private readonly cap = 1024,
  ) {}

  acquire(): T {
    const t = this.free.pop();
    if (t !== undefined) return t;
    this.created += 1;
    return this.make();
  }

  release(t: T): void {
    if (this.free.length < this.cap) this.free.push(t);
  }

  /** 当前空闲数(测试用) */
  get idle(): number {
    return this.free.length;
  }
}

/**
 * 就地淘汰:把 list 里所有 dead(item) 的元素换到尾部弹出并归还池。
 * 代替 `list = list.filter(...)`:不新建数组、不保序(视觉粒子无所谓顺序)。
 */
export function reapInto<T>(list: T[], dead: (t: T) => boolean, pool: Pool<T>): void {
  for (let i = list.length - 1; i >= 0; i--) {
    if (!dead(list[i])) continue;
    const t = list[i];
    list[i] = list[list.length - 1];
    list.pop();
    pool.release(t);
  }
}
