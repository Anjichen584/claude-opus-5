import balance from '@data/balance.json';
import { runMods } from './RunMods';

/**
 * 局内昼夜时钟(GDD §9):1 昼夜 = 6 分钟(昼 4 / 夜 2)。
 * 夜晚:怪物增强、掉落翻倍、画面变暗。模块级单例,run 开始时 reset()。
 */
class GameClock {
  runTime = 0;

  reset(): void {
    this.runTime = 0;
  }

  tick(dt: number): void {
    this.runTime += dt;
  }

  /** 本局昼夜周期长度(挑战词条「长夜」会缩短);昼:夜比例保持不变 */
  private get cycleS(): number {
    return balance.night.cycleS * runMods.eff.cycle;
  }

  private get dayS(): number {
    return balance.night.dayS * runMods.eff.cycle;
  }

  isNight(): boolean {
    return this.runTime % this.cycleS >= this.dayS;
  }

  /** 当前周期进度 0..1(渲染昼夜表盘用) */
  cycleProgress(): number {
    return (this.runTime % this.cycleS) / this.cycleS;
  }

  /** 距下次昼夜切换的秒数 */
  untilSwitch(): number {
    const t = this.runTime % this.cycleS;
    return t < this.dayS ? this.dayS - t : this.cycleS - t;
  }

  /** 星灯买断:立即跳到下一个白天(GDD §9 决策点) */
  skipNight(): void {
    if (!this.isNight()) return;
    this.runTime = Math.ceil(this.runTime / this.cycleS) * this.cycleS;
  }
}

export const clock = new GameClock();
