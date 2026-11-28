import React, { useEffect, useState } from 'react';
import {
  getPlayerPortraitIdentityKey,
  getPlayerUniformKey,
  resolvePlayerPortraitSync,
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
 * - 등록된 실존 선수: 선수 고유 ID에 연결된 투명 PNG 프로필 사진 최우선 적용
 * - 미등록 선수 · 가상 신인 · 외국인 · 생성 선수 · 로딩 실패 시: 배경 없는 구단 유니폼 기본 실루엣 표시
 * - 트레이드·FA 이적·군입대 시 실루엣 모자와 유니폼 자동 전환
 */
export const PlayerPortrait: React.FC<PlayerPortraitProps> = ({
  player,
  size = 'md',
  showTeamBadge = size !== 'xs',
  showSourceTag = size !== 'xs',
}) => {
  const identityKey = getPlayerPortraitIdentityKey(player);
  const uniformKey = getPlayerUniformKey(player);
  const resolved = resolvePlayerPortraitSync(player);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [identityKey, uniformKey, player.uniformNumber, player.licensedPhotoUrl, resolved.src]);

  const activeSrc = imgFailed ? resolved.fallbackSilhouetteSrc : resolved.src;
  const isSilhouette = imgFailed || resolved.sourceType === 'silhouette';
  const isTransparentPortrait =
    isSilhouette ||
    (resolved.sourceType === 'licensed_real' &&
      !imgFailed &&
      /\.png(\?.*)?$/i.test(resolved.src));

  const badgeText = imgFailed ? '기본 실루엣' : resolved.badgeLabel;

  return (
    <div
      data-testid={size === 'xs' ? 'player-list-portrait' : 'player-detail-portrait'}
      data-portrait-source={imgFailed ? 'error_silhouette' : resolved.sourceType}
      data-portrait-uniform={uniformKey}
      className={`relative shrink-0 ${SIZE_CLASSES[size]} overflow-hidden select-none ${
        isTransparentPortrait
          ? size === 'xs'
            ? 'bg-transparent border-0 shadow-none'
            : 'bg-transparent border border-slate-200/70 dark:border-slate-700/60'
          : 'border border-slate-300/90 dark:border-slate-700 bg-slate-900 shadow-sm'
      }`}
      title={
        !isSilhouette
          ? `${player.name} 실존 선수 프로필 (${resolved.license ?? 'CC'} · ${resolved.credit ?? '공식 프로필'})`
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
          isTransparentPortrait ? 'object-contain object-bottom' : 'object-cover object-top'
        }`}
      />

      {showSourceTag && (
        <div
          className={`absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] font-bold text-center tracking-tight truncate ${
            !isSilhouette
              ? 'bg-emerald-950/80 text-emerald-200'
              : 'bg-slate-900/70 text-slate-100'
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
