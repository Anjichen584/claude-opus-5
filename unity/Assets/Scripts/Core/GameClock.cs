using StarfallKnights.Data;

namespace StarfallKnights.Core
{
    /// <summary>局内昼夜时钟——与 web/src/game/dungeon/Clock.ts 同构(1 昼夜 6 分钟,昼 4 夜 2)。</summary>
    public sealed class GameClock
    {
        public float RunTime { get; private set; }

        public void Reset() => RunTime = 0f;
        public void Tick(float dt) => RunTime += dt;

        public bool IsNight => RunTime % Balance.CycleS >= Balance.DayS;

        /// <summary>当前周期进度 0..1(渲染昼夜表盘)。</summary>
        public float CycleProgress => (RunTime % Balance.CycleS) / Balance.CycleS;

        /// <summary>距下次昼夜切换秒数。</summary>
        public float UntilSwitch
        {
            get
            {
                float t = RunTime % Balance.CycleS;
                return t < Balance.DayS ? Balance.DayS - t : Balance.CycleS - t;
            }
        }

        /// <summary>星灯买断:跳到下一个白天。</summary>
        public void SkipNight()
        {
            if (!IsNight) return;
            RunTime = (float)System.Math.Ceiling(RunTime / Balance.CycleS) * Balance.CycleS;
        }
    }
}
