/**
 * 极简高效 ECS:实体是数字,组件是纯数据类,系统是纯逻辑。
 * 系统之间禁止直接互调,一律通过帧内事件通信(emit / read)。
 * 分层铁律:engine 层不得 import game 层(docs/02-ARCHITECTURE.md §2)。
 */
export type Entity = number;

// why-any: 组件/事件构造器签名各异,此处需要最宽的构造器类型做注册表键
export interface Ctor<T> { new (...args: any[]): T }

export interface System {
  update(world: World, dt: number): void;
}

export class World {
  private stores = new Map<Function, Map<Entity, unknown>>();
  private events = new Map<Function, unknown[]>();
  private deadQueue: Entity[] = [];
  private nextId: Entity = 1;

  // ---- 实体与组件 ----

  create(): Entity {
    return this.nextId++;
  }

  add<T extends object>(e: Entity, comp: T): T {
    let store = this.stores.get(comp.constructor);
    if (!store) {
      store = new Map();
      this.stores.set(comp.constructor, store);
    }
    store.set(e, comp);
    return comp;
  }

  get<T>(e: Entity, cls: Ctor<T>): T | undefined {
    return this.stores.get(cls)?.get(e) as T | undefined;
  }

  /** 确定存在时使用;不存在即抛错,尽早暴露逻辑漏洞。 */
  mustGet<T>(e: Entity, cls: Ctor<T>): T {
    const c = this.get(e, cls);
    if (c === undefined) throw new Error(`Entity ${e} missing ${cls.name}`);
    return c;
  }

  has<T>(e: Entity, cls: Ctor<T>): boolean {
    return this.stores.get(cls)?.has(e) ?? false;
  }

  remove<T>(e: Entity, cls: Ctor<T>): void {
    this.stores.get(cls)?.delete(e);
  }

  /** 延迟销毁:标记后在 flushDestroyed() 统一移除,避免遍历中修改。 */
  destroy(e: Entity): void {
    this.deadQueue.push(e);
  }

  flushDestroyed(): void {
    for (const e of this.deadQueue) {
      for (const store of this.stores.values()) store.delete(e);
    }
    this.deadQueue.length = 0;
  }

  /** 查询同时拥有全部组件的实体。以最小的组件仓为基准遍历。 */
  query(...classes: Ctor<unknown>[]): Entity[] {
    let smallest: Map<Entity, unknown> | undefined;
    for (const c of classes) {
      const s = this.stores.get(c);
      if (!s || s.size === 0) return [];
      if (!smallest || s.size < smallest.size) smallest = s;
    }
    const out: Entity[] = [];
    if (!smallest) return out;
    outer: for (const e of smallest.keys()) {
      for (const c of classes) {
        if (!this.stores.get(c)!.has(e)) continue outer;
      }
      out.push(e);
    }
    return out;
  }

  count(cls: Ctor<unknown>): number {
    return this.stores.get(cls)?.size ?? 0;
  }

  // ---- 帧内事件 ----

  emit<T extends object>(ev: T): void {
    let list = this.events.get(ev.constructor);
    if (!list) {
      list = [];
      this.events.set(ev.constructor, list);
    }
    list.push(ev);
  }

  read<T>(cls: Ctor<T>): readonly T[] {
    return (this.events.get(cls) as T[] | undefined) ?? [];
  }

  /** 每帧末由场景统一调用。 */
  clearEvents(): void {
    this.events.clear();
  }
}
