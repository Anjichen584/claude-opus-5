import { mergeMods, NEUTRAL_MODS, type MergedMods, type RunMod } from '@game/meta/Daily';
import { NEUTRAL_STRUCTURE, weeklyLabel, type StructureMods, type WeeklyRule } from '@game/meta/Weekly';
import { multsOf } from './Abyss';
import { loopMults, safeAtk, safeHp, safeMult } from './Endless';

/**
 * 本局生效的挑战词条(模块级单例,和 clock 一样)。
 * 普通局 = 空词条(全中性),每日挑战 = 当日词条 —— 系统侧只读乘区,不需要 if (isDaily)。
 */
class RunMods {
  /**
   * 深渊难度档(轮 23;0 = 普通远征)。乘区直接乘进 enemy()/dropMult ——
   * 这样已有的出怪与掉落调用点**一行都不用改**(与每日/周常同一套"系统侧只读乘区"的做法)。
   */
  abyss = 0;
  /**
   * 无尽模式的当前循环(轮 24;0 = 没开无尽)。乘区同样直接乘进 enemy()/dropMult ——
   * 出怪与掉落的调用点一行都不用改(与深渊/挑战同一套做法)。
   */
  endlessLoop = 0;
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

  /** 设定本局难度档(在 clear() 之后调用:普通远征也要显式设 0) */
  setAbyss(idx: number): void {
    this.abyss = idx;
  }

  /** 设定无尽循环数(普通局/挑战局传 0) */
  setEndlessLoop(loop: number): void {
    this.endlessLoop = Number.isFinite(loop) ? Math.max(0, Math.floor(loop)) : 0;
  }

  clear(): void {
    this.abyss = 0;
    this.endlessLoop = 0;
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

  /**
   * 出怪数值乘区(挑战词条 × 深渊档 × 无尽循环;夜战缩放由 Scaling 另行处理)。
   * **闸门在最后**:所有出怪路径都经过这里,所以无尽模式的溢出保护只需在这一处生效。
   */
  enemy(hp: number, atk: number): [number, number] {
    const a = multsOf(this.abyss);
    const e = loopMults(this.endlessLoop);
    return [
      safeHp(hp * this.eff.hp * a.hp * e.hp),
      safeAtk(atk * this.eff.atk * a.atk * e.atk),
    ];
  }

  /** 掉落判定乘区 */
  get dropMult(): number {
    return safeMult(this.eff.drop * multsOf(this.abyss).loot * loopMults(this.endlessLoop).loot);
  }

  /** 星尘结算乘区(深渊/无尽给更多星尘 —— 难度要"值得打",不能只有惩罚) */
  get dustMult(): number {
    return safeMult(multsOf(this.abyss).dust * loopMults(this.endlessLoop).dust);
  }

  /** HUD 展示用:当前深渊档的怪血/攻击乘区 */
  get abyssHpMult(): number { return multsOf(this.abyss).hp; }
  get abyssAtkMult(): number { return multsOf(this.abyss).atk; }

  /** 深渊层的精英房额外波次(0 = 基础) */
  get eliteWaves(): number {
    return multsOf(this.abyss).eliteWaves;
  }

  /** 冷却缩减上限:有 cdr 词条时放宽到 60%(否则 40% 上限会让「迅影」失效) */
  get cdrCap(): number {
    return this.eff.cdr > 0 ? 0.6 : 0.4;
  }
}

export const runMods = new RunMods();
