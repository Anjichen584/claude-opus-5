import { mergeMods, NEUTRAL_MODS, type MergedMods, type RunMod } from '@game/meta/Daily';

/**
 * 本局生效的挑战词条(模块级单例,和 clock 一样)。
 * 普通局 = 空词条(全中性),每日挑战 = 当日词条 —— 系统侧只读乘区,不需要 if (isDaily)。
 */
class RunMods {
  active = false;
  /** 挑战日期键(普通局为空串) */
  key = '';
  mods: RunMod[] = [];
  eff: MergedMods = NEUTRAL_MODS;

  set(key: string, mods: readonly RunMod[]): void {
    this.active = true;
    this.key = key;
    this.mods = [...mods];
    this.eff = mergeMods(this.mods);
  }

  clear(): void {
    this.active = false;
    this.key = '';
    this.mods = [];
    this.eff = NEUTRAL_MODS;
  }

  /** 日期键的展示形式(M-D) */
  get label(): string {
    const [, m, d] = this.key.split('-');
    return m && d ? `${Number(m)}/${Number(d)}` : '';
  }

  /** 出怪数值乘区 */
  enemy(hp: number, atk: number): [number, number] {
    return [hp * this.eff.hp, atk * this.eff.atk];
  }

  /** 掉落判定乘区 */
  get dropMult(): number {
    return this.eff.drop;
  }

  /** 冷却缩减上限:有 cdr 词条时放宽到 60%(否则 40% 上限会让「迅影」失效) */
  get cdrCap(): number {
    return this.eff.cdr > 0 ? 0.6 : 0.4;
  }
}

export const runMods = new RunMods();
