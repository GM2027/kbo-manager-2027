import {
  CLUB_UNIFORM_PALETTES,
  PortraitUniformKey,
  resolveLicensedRealPlayerPhoto,
} from '../data/playerPortraitRegistry';
import { getOrCreateCachedPortrait } from '../storage/portraitCacheStorage';
import { Player } from '../types/kbo';
import { isMilitaryServing } from './militaryEngine';

const PORTRAIT_SCHEMA_VERSION = 'v2_silhouette_transparent';

/**
 * 선수 고유 ID 기반 영구 식별키 (트레이드·FA 이적·시즌 경과와 무관하게 동일 선수 추적)
 */
export function getPlayerPortraitIdentityKey(player: Player): string {
  return player.permanentId || player.kboOfficialId || player.id;
}

/**
 * 현재 소속 구단·군복무·FA·은퇴 상태를 반영한 유니폼/모자 키 산출
 * - 트레이드·FA 이적 시 teamId가 바뀌므로 실루엣 모자와 유니폼이 즉시 새 구단으로 전환됩니다.
 */
export function getPlayerUniformKey(player: Player): PortraitUniformKey {
  if (player.rosterTier === '은퇴') return 'RETIRED';
  if (isMilitaryServing(player.militaryStatus)) return '상무';
  if (player.rosterTier === 'FA') return 'FA';
  return player.teamId;
}

/**
 * 가상 신인 · 가상 외국인 · 생성 선수 여부 판별
 */
export function isVirtualOrGeneratedPlayer(player: Player): boolean {
  if (player.originType === 'virtual') return true;
  if (player.originType === 'real') return false;
  if (player.kboOfficialId || player.v18SourceId) return false;
  if (
    player.id.startsWith('draft-') ||
    player.id.startsWith('ai-for-rep-') ||
    player.id.startsWith('dev-') ||
    player.id.startsWith('custom-') ||
    player.id.startsWith('vfor-') ||
    player.id.startsWith('virt-')
  ) {
    return true;
  }
  return false;
}

function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 배경 없는 투명 기본 선수 실루엣 SVG (구단 모자·유니폼 자동 반영)
 * - 사진 미등록 실존 선수, 가상 신인, 외국인, 생성 선수 및 로딩 실패 폴백 공용
 * - 배경 박스가 없는 투명 캔버스로 라이트/다크 모드 모두 깔끔하게 표시됩니다.
 */
export function renderPlayerSilhouetteDataUrl(
  uniformKey: PortraitUniformKey,
  uniformNumber?: number
): string {
  const pal = CLUB_UNIFORM_PALETTES[uniformKey] ?? CLUB_UNIFORM_PALETTES.FA;
  const numText = uniformNumber !== undefined ? `#${uniformNumber}` : '';
  const pinstripes = pal.jerseyPinstripe
    ? `<g opacity="0.24" stroke="${pal.jerseyPinstripe}" stroke-width="1.4">
        <line x1="36" y1="142" x2="36" y2="200"/>
        <line x1="50" y1="138" x2="50" y2="200"/>
        <line x1="64" y1="136" x2="64" y2="200"/>
        <line x1="96" y1="136" x2="96" y2="200"/>
        <line x1="110" y1="138" x2="110" y2="200"/>
        <line x1="124" y1="142" x2="124" y2="200"/>
      </g>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" width="160" height="200">
  <defs>
    <linearGradient id="sil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#64748b"/>
    </linearGradient>
    <clipPath id="jerseyClip">
      <path d="M12,200 C16,158 38,142 62,137 L98,137 C122,142 144,158 148,200 Z"/>
    </clipPath>
  </defs>
  <!-- Shoulders & Club Jersey (Transparent Background) -->
  <g clip-path="url(#jerseyClip)">
    <path d="M12,200 C16,158 38,142 62,137 L98,137 C122,142 144,158 148,200 Z" fill="${pal.jerseyBase}"/>
    ${pal.jerseyRaglan ? `<path d="M12,200 C16,158 38,142 58,138 L46,200 Z M148,200 C144,158 122,142 102,138 L114,200 Z" fill="${pal.jerseyRaglan}"/>` : ''}
    ${pinstripes}
    <path d="M62,137 L80,158 L98,137 Z" fill="${pal.undershirt}"/>
    <path d="M62,137 L80,158 L98,137" fill="none" stroke="${pal.jerseyPiping}" stroke-width="3.2" stroke-linejoin="round"/>
    <line x1="80" y1="158" x2="80" y2="200" stroke="${pal.jerseyPiping}" stroke-width="2.4"/>
  </g>
  <path d="M12,200 C16,158 38,142 62,137 L98,137 C122,142 144,158 148,200" fill="none" stroke="#64748b" stroke-opacity="0.42" stroke-width="1.5"/>
  <!-- Neck & Head Silhouette (Opaque, No Background) -->
  <path d="M67,112 L93,112 L94,139 Q80,149 66,139 Z" fill="#64748b"/>
  <ellipse cx="51" cy="88" rx="4.5" ry="8" fill="#64748b"/>
  <ellipse cx="109" cy="88" rx="4.5" ry="8" fill="#64748b"/>
  <ellipse cx="80" cy="86" rx="28" ry="34" fill="url(#sil)"/>
  <!-- Club Baseball Cap -->
  <path d="M47,70 C47,39 63,31 80,31 C97,31 113,39 113,70 Z" fill="${pal.capCrown}"/>
  <circle cx="80" cy="31" r="2.6" fill="${pal.capBrim}"/>
  <path d="M45,69 Q80,58 115,69 Q80,75 45,69 Z" fill="${pal.capBrim}"/>
  <text x="80" y="55" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="13" fill="${pal.capLogoColor}" letter-spacing="0.5">${pal.capLogoText}</text>
  ${numText ? `<text x="115" y="176" text-anchor="middle" font-family="monospace" font-weight="900" font-size="12.5" fill="${pal.jerseyPiping}" opacity="0.9">${numText}</text>` : ''}
</svg>`;
  return encodeSvgDataUrl(svg);
}

export interface ResolvedPlayerPortrait {
  src: string;
  fallbackSilhouetteSrc: string;
  sourceType: 'licensed_real' | 'silhouette';
  uniformKey: PortraitUniformKey;
  cacheKey: string;
  fromCache: boolean;
  badgeLabel: string;
  credit?: string;
  license?: string;
}

/**
 * 선수 프로필 이미지 동기 리졸버 (즉시 표시 · 플리커 방지)
 * - 등록된 실제 선수 프로필 사진이 있으면 최우선 반환
 * - 그 외 모든 선수(미등록 실존 선수·가상 신인·외국인·생성 선수)는 배경 없는 기본 실루엣 반환
 */
export function resolvePlayerPortraitSync(player: Player): ResolvedPlayerPortrait {
  const identityKey = getPlayerPortraitIdentityKey(player);
  const uniformKey = getPlayerUniformKey(player);
  const fallbackSilhouetteSrc = renderPlayerSilhouetteDataUrl(uniformKey, player.uniformNumber);

  const licensed = resolveLicensedRealPlayerPhoto(player);
  if (licensed) {
    return {
      src: licensed.url,
      fallbackSilhouetteSrc,
      sourceType: 'licensed_real',
      uniformKey,
      cacheKey: `${identityKey}::licensed`,
      fromCache: true,
      badgeLabel: '실제 프로필',
      credit: licensed.credit,
      license: licensed.license,
    };
  }

  return {
    src: fallbackSilhouetteSrc,
    fallbackSilhouetteSrc,
    sourceType: 'silhouette',
    uniformKey,
    cacheKey: `sil::${uniformKey}::${player.uniformNumber ?? 'x'}::${PORTRAIT_SCHEMA_VERSION}`,
    fromCache: true,
    badgeLabel: CLUB_UNIFORM_PALETTES[uniformKey]?.key === 'FA' ? 'FA 실루엣' : '기본 실루엣',
  };
}

/**
 * 선수 프로필 이미지 통합 비동기 리졸버 (호환 API 유지 · 캐싱 지원)
 */
export async function resolvePlayerPortraitAsync(
  player: Player,
  _season?: number
): Promise<ResolvedPlayerPortrait> {
  const syncResult = resolvePlayerPortraitSync(player);
  if (syncResult.sourceType === 'licensed_real') {
    return syncResult;
  }

  const { dataUrl, fromCache } = await getOrCreateCachedPortrait(
    syncResult.cacheKey,
    () => syncResult.fallbackSilhouetteSrc
  );
  return {
    ...syncResult,
    src: dataUrl,
    fromCache,
  };
}
