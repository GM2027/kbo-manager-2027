import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { resolvePublicAssetUrl } from './assetUrl';

const loadedImageCache = new Map<string, HTMLImageElement>();
const readyUrlSet = new Set<string>();
let preloadedOnce = false;

/**
 * KBO 10개 구단 고해상도 공식 로고(SVG/고해상도 PNG) 및 주요 엠블럼을 앱 기동 시 사전 로딩·디코딩·캐싱.
 * - 팀 선택, 취임식, 대시보드, 순위표, 트레이드, 우승 애니메이션 전환 시 깜빡임 방지
 */
export function preloadAllKboTeamLogos(): void {
  if (preloadedOnce || typeof window === 'undefined' || typeof Image === 'undefined') return;
  preloadedOnce = true;

  const urls: string[] = [
    '/logos/KBO.svg',
    '/logos/SM.png',
    '/logos/UL.png',
    '/logos/kbo_korean_series_trophy.png',
    '/logos/kbo_golden_glove.png',
  ];
  for (const tid of TEAM_IDS) {
    const primary = KBO_TEAMS[tid]?.logoUrls?.[0];
    if (primary) urls.push(primary);
  }

  for (const rawUrl of urls) {
    const resolved = resolvePublicAssetUrl(rawUrl);
    if (loadedImageCache.has(resolved)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      readyUrlSet.add(resolved);
      if (typeof img.decode === 'function') {
        img.decode().catch(() => {});
      }
    };
    img.src = resolved;
    loadedImageCache.set(resolved, img);
  }
}

export function isLogoUrlCached(resolvedUrl: string): boolean {
  return readyUrlSet.has(resolvedUrl);
}
