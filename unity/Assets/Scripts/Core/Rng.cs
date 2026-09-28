namespace StarfallKnights.Core
{
    /// <summary>
    /// 确定性随机(mulberry32)——与 web/src/engine/core/Rng.ts 完全同构,
    /// 同种子产生同序列,便于双端复现掉落。
    /// </summary>
    public sealed class Rng
    {
        private uint _state;

        public Rng(uint seed) => _state = seed;

        /// <summary>[0,1) 均匀分布。</summary>
        public double Next()
        {
            _state += 0x6D2B79F5u;
            uint t = _state;
            t = (t ^ (t >> 15)) * (t | 1u);
            t ^= t + (t ^ (t >> 7)) * (t | 61u);
            return ((t ^ (t >> 14)) & 0xFFFFFFFFu) / 4294967296.0;
        }

        /// <summary>[min,max] 整数(含端点)。</summary>
        public int Int(int min, int max) => min + (int)(Next() * (max - min + 1));

        /// <summary>[min,max) 浮点。</summary>
        public double Range(double min, double max) => min + Next() * (max - min);

        public bool Chance(double p) => Next() < p;

        public T Pick<T>(T[] arr) => arr[(int)(Next() * arr.Length)];
    }
}
