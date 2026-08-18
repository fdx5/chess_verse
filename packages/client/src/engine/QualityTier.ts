export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface PostFxBudget {
  ssao: boolean;
  bloom: boolean;
  aa: 'fxaa' | 'smaa' | 'taa';
  resolutionScale: number;
}

export interface QualitySettings {
  readonly tier: QualityTier;
  readonly shadowsEnabled: boolean;
  readonly postfx: PostFxBudget;
  readonly idleUpdateHz: number;
}

const TIER_RANK: Record<QualityTier, number> = { low: 0, medium: 1, high: 2, ultra: 3 };
const RANK_TIER: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

const TIER_SETTINGS: Record<QualityTier, QualitySettings> = {
  low: {
    tier: 'low',
    shadowsEnabled: false,
    postfx: { ssao: false, bloom: false, aa: 'fxaa', resolutionScale: 0.75 },
    idleUpdateHz: 10,
  },
  medium: {
    tier: 'medium',
    shadowsEnabled: false,
    postfx: { ssao: false, bloom: true, aa: 'fxaa', resolutionScale: 1.0 },
    idleUpdateHz: 10,
  },
  high: {
    tier: 'high',
    shadowsEnabled: true,
    postfx: { ssao: true, bloom: true, aa: 'smaa', resolutionScale: 1.0 },
    idleUpdateHz: 10,
  },
  ultra: {
    tier: 'ultra',
    shadowsEnabled: true,
    postfx: { ssao: true, bloom: true, aa: 'taa', resolutionScale: 1.0 },
    idleUpdateHz: 10,
  },
};

export function getQualitySettings(tier: QualityTier): QualitySettings {
  return TIER_SETTINGS[tier];
}

/** D9 §devicePixelRatio 클램프 정책: 데스크톱 상한 2.0, 모바일 Low/Medium 1.5, 모바일 High/Ultra 2.0. */
export function resolvePixelRatioCap(tier: QualityTier, isMobile: boolean): number {
  if (!isMobile) return 2.0;
  return TIER_RANK[tier] <= TIER_RANK.medium ? 1.5 : 2.0;
}

/** 여러 후보 티어 중 가장 보수적인(낮은) 티어를 고른다 — D9 자동 선택 알고리즘 5단계. */
export function minTier(...tiers: QualityTier[]): QualityTier {
  let lowest = TIER_RANK.ultra;
  for (const t of tiers) {
    const rank = TIER_RANK[t];
    if (rank < lowest) lowest = rank;
  }
  const resolved = RANK_TIER[lowest];
  if (resolved === undefined) throw new Error(`invalid quality tier rank: ${lowest}`);
  return resolved;
}
