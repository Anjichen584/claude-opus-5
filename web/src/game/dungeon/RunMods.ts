import { mergeMods, NEUTRAL_MODS, type MergedMods, type RunMod } from '@game/meta/Daily';
import { NEUTRAL_STRUCTURE, weeklyLabel, type StructureMods, type WeeklyRule } from '@game/meta/Weekly';

/**
 * 本局生效的挑战词条(模块级单例,和 clock 一样)。
 * 普通局 = 空词条(全中性),每日挑战 = 当日词条 —— 系统侧只读乘区,不需要 if (isDaily)。
 */
class RunMods {
  active = false;
  /** 'off' = 普通远征;'daily' = 每日挑战;'weekly' = 周常挑战 */
  mode: 'off' | 'daily' | 'weekly' = 'off';
  /** 挑战键:每日是 YYYY-MM-DD,周常是 YYYY-Www */
  key = '';
  mods: RunMod[] = [];
  eff: MergedMods = NEUTRAL_MODS;
  /** 周常铁律(结构性改动);每日/普通局全中性 */
  structure: StructureMods = NEUTRAL_STRUCTURE;

  set(key: string, mods: readonly RunMod[]): void {
    this.active = true;
    this.mode = 'daily';
    this.key = key;
    this.mods = [...mods];
    this.eff = mergeMods(this.mods);
    this.structure = NEUTRAL_STRUCTURE;
  }

  setWeekly(key: string, weekly: { rule: WeeklyRule; mods: readonly RunMod[]; structure: StructureMods }): void {
    this.active = true;
    this.mode = 'weekly';
    this.key = key;
    this.mods = [...weekly.mods];
    this.eff = mergeMods(this.mods);
    this.structure = weekly.structure;
  }

  clear(): void {
    this.active = false;
    this.mode = 'off';
    this.key = '';
    this.mods = [];
    this.eff = NEUTRAL_MODS;
    this.structure = NEUTRAL_STRUCTURE;
  }

  /** 挑战键的展示形式:每日 M/D,周常 第 N 周 */
  get label(): string {
    if (this.mode === 'weekly') return weeklyLabel(this.key);
    const [, m, d] = this.key.split('-');
    return m && d ? `${Number(m)}/${Number(d)}` : '';
  }

  // ---- 周常铁律的转发(系统侧只读,不需要 if (isWeekly)) ----
  get extraWaves(): number { return this.structure.extraWaves; }
  get shopClosed(): boolean { return this.structure.shopClosed; }
  get altarOff(): boolean { return this.structure.altarOff; }
  get eliteShift(): number { return this.structure.eliteShift; }
  get forcedLayout(): StructureMods['forcedLayout'] { return this.structure.forcedLayout; }

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
