import React, { useState } from 'react';
import { KBO_TEAMS } from '../data/kboTeams';
import { TeamId } from '../types/kbo';
import { resolvePublicAssetUrl } from '../utils/assetUrl';
import { TeamLogo } from './TeamLogo';

/** 실제 골든듀 디자인 기반 투명 배경 KBO 한국시리즈 우승 트로피 이미지 */
export const KBO_OFFICIAL_TROPHY_PNG_URL = '/logos/kbo_korean_series_trophy.png';

interface KoreanSeriesTrophyLogoProps {
  teamId?: TeamId | null;
  championTeamId?: TeamId | null;
  season?: number;
  titleCount?: number;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showCaption?: boolean;
  className?: string;
}

/**
 * KBO 한국시리즈 공식 우승 트로피 아이콘/이미지 컴포넌트 (배경 투명)
 * - 브래킷, 시상식, 홈 카드, 타이틀 등 앱 전체에서 동일한 실제 트로피 이미지를 투명 배경으로 표시
 */
export const KboOfficialTrophySvg: React.FC<{
  className?: string;
  accentColor?: string;
  season?: number;
  ariaLabel?: string;
}> = ({ className = 'w-12 h-14', ariaLabel }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`${className} flex items-center justify-center text-amber-400 font-black text-xs`}
        aria-label={ariaLabel ?? 'KBO 한국시리즈 공식 우승 트로피'}
        role="img"
      >
        KBO
      </div>
    );
  }

  return (
    <img
      src={resolvePublicAssetUrl(KBO_OFFICIAL_TROPHY_PNG_URL)}
      alt={ariaLabel ?? 'KBO 한국시리즈 공식 우승 트로피'}
      onError={() => setFailed(true)}
      className={`${className} object-contain object-center select-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]`}
      draggable={false}
    />
  );
};

/**
 * 실제 KBO 한국시리즈 공식 우승 트로피 + 우승 구단 명판 전시 컴포넌트 (투명 배경)
 */
export const KoreanSeriesTrophyLogo: React.FC<KoreanSeriesTrophyLogoProps> = ({
  teamId,
  championTeamId,
  season,
  titleCount,
  size = 'md',
  showCaption = true,
  className = '',
}) => {
  const resolvedTeamId = teamId ?? championTeamId ?? null;
  const team = resolvedTeamId ? KBO_TEAMS[resolvedTeamId] : null;
  const altText = team
    ? `${season ?? ''} KBO 한국시리즈 ${team.name} 공식 우승 트로피`
    : 'KBO 한국시리즈 공식 우승 트로피';

  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <div className="relative flex items-center justify-center shrink-0">
          <KboOfficialTrophySvg className="w-9 h-12" season={season} ariaLabel={altText} />
          {resolvedTeamId && (
            <div className="absolute -bottom-1 -right-1 rounded-full bg-white/95 dark:bg-slate-900/95 p-0.5 ring-1 ring-amber-400/70 shadow-xs">
              <TeamLogo teamId={resolvedTeamId} size="xs" />
            </div>
          )}
        </div>
        {showCaption && (
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {season ? `${season} KBO 한국시리즈` : 'KBO 한국시리즈'}
              {titleCount ? ` · V${titleCount}` : ''}
            </div>
            <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
              {team ? `${team.name} 우승` : '공식 우승 트로피'}
            </div>
          </div>
        )}
      </div>
    );
  }

  const imageFrameClass =
    size === 'hero'
      ? 'w-40 h-56'
      : size === 'lg'
      ? 'w-28 h-40'
      : 'w-18 h-26';

  return (
    <div
      className={`inline-flex ${
        size === 'hero' ? 'flex-col items-center text-center gap-3' : 'items-center gap-3.5'
      } ${className}`}
    >
      {/* 배경 투명 공식 KBO 한국시리즈 트로피 */}
      <div
        className={`relative ${imageFrameClass} shrink-0 flex items-center justify-center bg-transparent`}
      >
        <KboOfficialTrophySvg
          className="w-full h-full drop-shadow-[0_10px_22px_rgba(0,0,0,0.42)]"
          season={season}
          ariaLabel={altText}
        />

        {/* 우승 구단 엠블럼 배지 */}
        {resolvedTeamId && (
          <div className="absolute -bottom-1 -right-1 rounded-full bg-white/95 dark:bg-slate-950/95 p-1 shadow-md ring-1 ring-amber-400/75">
            <TeamLogo teamId={resolvedTeamId} size={size === 'hero' ? 'sm' : 'xs'} />
          </div>
        )}
      </div>

      {/* 캡션 */}
      {showCaption && (
        <div className={size === 'hero' ? 'space-y-1 max-w-xs' : 'min-w-0 space-y-0.5'}>
          <div className="text-[11px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400">
            {season ? `${season} KBO KOREAN SERIES CHAMPION` : 'KBO KOREAN SERIES OFFICIAL TROPHY'}
            {titleCount ? ` · V${titleCount}` : ''}
          </div>
          <div
            className={`font-extrabold text-slate-900 dark:text-white ${
              size === 'hero' ? 'text-xl' : size === 'lg' ? 'text-base' : 'text-sm'
            }`}
          >
            {team ? `${team.name} 통합 우승 트로피` : 'KBO 한국시리즈 공식 우승 트로피'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            KBO 한국시리즈 공식 우승 트로피
          </div>
        </div>
      )}
    </div>
  );
};
