import React, { useEffect, useState } from 'react';
import { resolveLicensedRealPlayerPhoto } from '../data/playerPortraitRegistry';
import {
  getPlayerPortraitIdentityKey,
  getPlayerUniformKey,
  renderPlayerSilhouetteDataUrl,
  ResolvedPlayerPortrait,
  resolvePlayerPortraitAsync,
} from '../engine/playerPortraitEngine';
import { Player } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface PlayerPortraitProps {
  player: Player;
  season: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showTeamBadge?: boolean;
  showSourceTag?: boolean;
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'w-7 h-8 rounded-md',
  sm: 'w-14 h-[70px] rounded-lg',
  md: 'w-[78px] h-[98px] sm:w-[86px] sm:h-[108px] rounded-lg',
  lg: 'w-24 h-[120px] rounded-lg',
};

/**
 * 선수 프로필 사진 컴포넌트 (선수단 명단 · 선수 카드 · 선수 상세 정보 공용)
 * - 실존 선수: 선수 고유 ID에 연결된 프로필 사진 최우선 적용 (미등록/로딩 실패 시 구단 유니폼 실루엣 폴백)
 * - 가상 신인·가상 외국인·생성 선수: 최초 1회 생성 후 영구 캐싱된 AI 프로필 이미지 표시
 * - 트레이드·FA 이적·군입대 시 소속 구단 모자와 유니폼 자동 변경 (선수 고유 ID 기준 동일 얼굴 유지)
 */
export const PlayerPortrait: React.FC<PlayerPortraitProps> = ({
  player,
  season,
  size = 'md',
  showTeamBadge = size !== 'xs',
  showSourceTag = size !== 'xs',
}) => {
  const identityKey = getPlayerPortraitIdentityKey(player);
  const uniformKey = getPlayerUniformKey(player);
  const defaultSilhouette = renderPlayerSilhouetteDataUrl(uniformKey, player.uniformNumber);
  const syncLicensed = resolveLicensedRealPlayerPhoto(player);

  const [resolved, setResolved] = useState<ResolvedPlayerPortrait | null>(() =>
    syncLicensed
      ? {
          src: syncLicensed.url,
          fallbackSilhouetteSrc: defaultSilhouette,
          sourceType: 'licensed_real',
          uniformKey,
          cacheKey: `${identityKey}::licensed`,
          fromCache: true,
          badgeLabel: '실제 프로필',
          credit: syncLicensed.credit,
          license: syncLicensed.license,
        }
      : null
  );
  const [imgFailed, setImgFailed] = useState(false);

  // 외형 속성 변경(에디터 수정)이나 이적(uniformKey) 시 자동 재조회 (캐시 히트 시 즉시 반환)
  const appearanceSig = player.portraitProfile
    ? `${player.portraitProfile.faceSeed}-${player.portraitProfile.hairStyle}-${player.portraitProfile.hairColor}-${player.portraitProfile.facialHair}-${player.portraitProfile.glasses}-${player.portraitProfile.eyeBlack}-${player.portraitProfile.skinToneIndex}`
    : 'none';

  useEffect(() => {
    let active = true;
    setImgFailed(false);
    if (syncLicensed) {
      setResolved({
        src: syncLicensed.url,
        fallbackSilhouetteSrc: defaultSilhouette,
        sourceType: 'licensed_real',
        uniformKey,
        cacheKey: `${identityKey}::licensed`,
        fromCache: true,
        badgeLabel: '실제 프로필',
        credit: syncLicensed.credit,
        license: syncLicensed.license,
      });
      return () => {
        active = false;
      };
    }
    void resolvePlayerPortraitAsync(player, season).then((res) => {
      if (!active) return;
      setResolved(res);
    });
    return () => {
      active = false;
    };
  }, [
    identityKey,
    uniformKey,
    player.uniformNumber,
    player.licensedPhotoUrl,
    syncLicensed?.url,
    appearanceSig,
    season,
  ]);

  const activeSrc =
    imgFailed || !resolved
      ? resolved?.fallbackSilhouetteSrc ?? defaultSilhouette
      : resolved.src;

  const isSilhouetteFallback =
    imgFailed || !resolved || resolved.sourceType === 'silhouette_real';

  const isTransparentPngReal =
    resolved?.sourceType === 'licensed_real' &&
    !imgFailed &&
    /\.png(\?.*)?$/i.test(resolved.src);

  const badgeText = imgFailed
    ? '기본 실루엣'
    : resolved?.badgeLabel ?? '프로필';

  return (
    <div
      data-testid={size === 'xs' ? 'player-list-portrait' : 'player-detail-portrait'}
      data-portrait-source={imgFailed ? 'error_silhouette' : resolved?.sourceType ?? 'loading'}
      data-portrait-uniform={uniformKey}
      className={`relative shrink-0 ${SIZE_CLASSES[size]} overflow-hidden select-none ${
        isTransparentPngReal
          ? size === 'xs'
            ? 'bg-transparent border-0 shadow-none'
            : 'bg-transparent border border-slate-200/70 dark:border-slate-700/60'
          : 'border border-slate-300/90 dark:border-slate-700 bg-slate-900 shadow-sm'
      }`}
      title={
        resolved?.sourceType === 'licensed_real' && !imgFailed
          ? `${player.name} 실존 선수 프로필 (${resolved.license ?? 'CC'} · ${resolved.credit ?? 'Wikimedia Commons'})`
          : resolved?.sourceType === 'ai_virtual' && !imgFailed
          ? `${player.name} AI 프로필 (${uniformKey} 유니폼 · 고유 ID 영구 연결)`
          : `${player.name} 기본 선수 실루엣 (${uniformKey} 유니폼)`
      }
    >
      <img
        src={activeSrc}
        alt={`${player.name} 선수 프로필`}
        loading={size === 'xs' ? 'lazy' : 'eager'}
        decoding="async"
        onError={() => {
          if (!imgFailed) setImgFailed(true);
        }}
        className={`w-full h-full ${
          isTransparentPngReal ? 'object-contain object-bottom' : 'object-cover object-top'
        } ${isSilhouetteFallback ? 'opacity-95' : ''}`}
      />

      {showSourceTag && (
        <div
          className={`absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] font-bold text-center tracking-tight truncate ${
            resolved?.sourceType === 'licensed_real' && !imgFailed
              ? 'bg-emerald-950/80 text-emerald-200'
              : resolved?.sourceType === 'ai_virtual' && !imgFailed
              ? 'bg-indigo-950/80 text-indigo-200'
              : 'bg-slate-950/75 text-slate-300'
          }`}
        >
          {badgeText}
        </div>
      )}

      {showTeamBadge && uniformKey !== 'FA' && uniformKey !== 'RETIRED' && uniformKey !== '상무' && (
        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/95 dark:bg-slate-900/95 shadow border border-slate-200 dark:border-slate-700 flex items-center justify-center p-0.5">
          <TeamLogo teamId={player.teamId} size="xs" />
        </div>
      )}
    </div>
  );
};
