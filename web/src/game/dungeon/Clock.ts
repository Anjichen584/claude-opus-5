import balance from '@data/balance.json';

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

  isNight(): boolean {
    return this.runTime % balance.night.cycleS >= balance.night.dayS;
  }

  /** 当前周期进度 0..1(渲染昼夜表盘用) */
  cycleProgress(): number {
    return (this.runTime % balance.night.cycleS) / balance.night.cycleS;
  }

  /** 距下次昼夜切换的秒数 */
  untilSwitch(): number {
    const t = this.runTime % balance.night.cycleS;
    return t < balance.night.dayS ? balance.night.dayS - t : balance.night.cycleS - t;
  }
}

export const clock = new GameClock();
