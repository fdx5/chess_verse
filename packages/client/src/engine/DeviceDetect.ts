import * as THREE from 'three';
import { minTier, type QualityTier } from './QualityTier';

const LOW_GPU_SIGNATURE = /Mali-4|Adreno 3|Adreno 4|PowerVR SGX/i;

/** D9 §디바이스 자동 감지 1단계: GPU 렌더러 문자열로 후보 티어를 정한다. */
export function detectGpuCandidate(renderer: THREE.WebGLRenderer): QualityTier {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuString = ext !== null ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  if (LOW_GPU_SIGNATURE.test(gpuString)) return 'low';
  return 'high';
}

/** D9 2단계: CPU 코어 수. */
export function detectCoreCandidate(): QualityTier {
  const cores = navigator.hardwareConcurrency;
  if (cores === undefined) return 'medium';
  if (cores <= 4) return 'low';
  if (cores >= 8) return 'high';
  return 'medium';
}

/** D9 3단계: devicePixelRatio 원본값 — 고밀도 저사양 모바일 하향 가중치. */
export function detectPixelRatioCandidate(isMobile: boolean): QualityTier {
  if (isMobile && window.devicePixelRatio >= 3) return 'low';
  return 'high';
}

export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * D9 4단계: 임시 Medium 품질로 N프레임 실측해 평균 프레임타임으로 후보를 정한다.
 * 실측이 1~3의 휴리스틱보다 최종 우선(호출부에서 minTier로 합산할 때도 실측 비중이 가장 큼).
 */
export function measureRuntimeCandidate(
  frameFn: () => void,
  frameCount = 90
): Promise<{ candidate: QualityTier; avgFrameMs: number }> {
  return new Promise((resolve) => {
    let count = 0;
    let last = performance.now();
    let totalMs = 0;
    function tick(): void {
      const now = performance.now();
      totalMs += now - last;
      last = now;
      frameFn();
      count += 1;
      if (count >= frameCount) {
        const avgFrameMs = totalMs / count;
        const candidate: QualityTier = avgFrameMs > 20 ? 'low' : avgFrameMs < 12 ? 'high' : 'medium';
        resolve({ candidate, avgFrameMs });
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

export interface AutoDetectResult {
  tier: QualityTier;
  isMobile: boolean;
  avgFrameMs: number;
  gpuCandidate: QualityTier;
  coreCandidate: QualityTier;
  pixelRatioCandidate: QualityTier;
  runtimeCandidate: QualityTier;
}

/** D9 5단계: 전 후보 중 min()으로 최종 티어를 보수적으로 선택한다. */
export async function autoDetectQualityTier(
  renderer: THREE.WebGLRenderer,
  frameFn: () => void
): Promise<AutoDetectResult> {
  const isMobile = isMobileDevice();
  const gpuCandidate = detectGpuCandidate(renderer);
  const coreCandidate = detectCoreCandidate();
  const pixelRatioCandidate = detectPixelRatioCandidate(isMobile);
  const { candidate: runtimeCandidate, avgFrameMs } = await measureRuntimeCandidate(frameFn);
  const tier = minTier(gpuCandidate, coreCandidate, pixelRatioCandidate, runtimeCandidate);
  return { tier, isMobile, avgFrameMs, gpuCandidate, coreCandidate, pixelRatioCandidate, runtimeCandidate };
}
