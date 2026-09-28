using UnityEngine;

namespace StarfallKnights.UnityLayer
{
    /// <summary>顶视角平滑跟随(镜像 web Camera.follow 的指数趋近)。</summary>
    public sealed class CameraFollow : MonoBehaviour
    {
        private void LateUpdate()
        {
            var target = GameBootstrap.I != null ? GameBootstrap.I.Player : null;
            if (target == null) return;
            var want = target.transform.position + Vector3.up * 10f;
            float k = 1f - Mathf.Exp(-Time.deltaTime / 0.18f);
            transform.position = Vector3.Lerp(transform.position, want, k);
        }
    }
}
