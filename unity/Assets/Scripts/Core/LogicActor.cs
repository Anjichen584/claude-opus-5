using System.Numerics;
using StarfallKnights.Combat;

namespace StarfallKnights.Core
{
    /// <summary>敌人种类(第一章镜像;二三章后续补)。</summary>
    public enum EnemyKind { Shroomling, WindBee, BlightWolf, ThornVine, OakGolem, BossNanmir }

    /// <summary>
    /// 逻辑层演员:位置+速度+战斗单元(纯 C#,System.Numerics.Vector2)。
    /// Unity 侧 MonoBehaviour 持有一个 Actor 并同步 transform。
    /// </summary>
    public sealed class Actor
    {
        public Vector2 Pos;
        public Vector2 Vel;
        public readonly CombatUnit Unit = new();
        public EnemyKind Kind;
        public bool IsPlayer;
        /// <summary>朝向(弧度)。</summary>
        public float Face;
    }
}
