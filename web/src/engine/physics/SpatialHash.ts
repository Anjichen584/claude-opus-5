/** 空间哈希网格:割草场景数百实体的近邻查询 O(1)。每帧 rebuild(实体量级下开销可忽略)。 */
export class SpatialHash<T> {
  private cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return cx * 73856093 ^ cy * 19349663; // 经典哈希混合
  }

  clear(): void {
    this.cells.clear();
  }

  insert(x: number, y: number, item: T): void {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    let list = this.cells.get(k);
    if (!list) {
      list = [];
      this.cells.set(k, list);
    }
    list.push(item);
  }

  /** 查询圆形范围覆盖的所有格子内容(粗筛,精确判定由调用方做) */
  queryCircle(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const minX = Math.floor((x - r) / this.cellSize);
    const maxX = Math.floor((x + r) / this.cellSize);
    const minY = Math.floor((y - r) / this.cellSize);
    const maxY = Math.floor((y + r) / this.cellSize);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const list = this.cells.get(this.key(cx, cy));
        if (list) for (const it of list) out.push(it);
      }
    }
    return out;
  }
}
