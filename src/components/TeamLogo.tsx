import React, { useEffect, useState } from 'react';
import { KBO_TEAMS } from '../data/kboTeams';
import { FuturesTeamId, TeamId } from '../types/kbo';
import { resolvePublicAssetUrl } from '../utils/assetUrl';
import { preloadAllKboTeamLogos } from '../utils/logoPreloader';

interface TeamLogoProps {
  teamId: TeamId;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  wide?: boolean;
  bare?: boolean;
  className?: string;
}

const CREST_MOTIFS: Record<
  TeamId,
  { monogram: string; sub: string }
> = {
  한화: { monogram: 'H', sub: 'EAGLES' },
  LG: { monogram: 'LG', sub: 'TWINS' },
  KT: { monogram: 'kt', sub: 'WIZ' },
  SSG: { monogram: 'SSG', sub: 'LANDERS' },
  삼성: { monogram: 'S', sub: 'LIONS' },
  NC: { monogram: 'NC', sub: 'DINOS' },
  두산: { monogram: 'D', sub: 'BEARS' },
  KIA: { monogram: 'KIA', sub: 'TIGERS' },
  롯데: { monogram: 'G', sub: 'GIANTS' },
  키움: { monogram: 'K', sub: 'HEROES' },
};

const SPECIAL_FUTURES_LOGOS: Record<
  '상무' | '울산',
  {
    name: string;
    primary: string;
    secondary: string;
    accent: string;
    logoUrls: string[];
  }
> = {
  상무: {
    name: '상무 피닉스 (국군체육부대)',
    primary: '#111827',
    secondary: '#F59E0B',
    accent: '#FACC15',
    logoUrls: [
      '/logos/SM.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_SM.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2025/emblem_SM.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2024/emblem_SM.png',
    ],
  },
  울산: {
    name: '울산 웨일즈 (Ulsan Whales)',
    primary: '#111827',
    secondary: '#DC2626',
    accent: '#EF4444',
    logoUrls: [
      '/logos/UL.png',
      'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/2026/emblem_UL.png',
    ],
  },
};

export const TeamLogo: React.FC<TeamLogoProps> = ({
  teamId,
  size = 'md',
  wide = false,
  bare = false,
  className = '',
}) => {
  const info = KBO_TEAMS[teamId];
  const motif = CREST_MOTIFS[teamId];
  const [urlIndex, setUrlIndex] = useState(0);

  useEffect(() => {
    preloadAllKboTeamLogos();
    setUrlIndex(0);
  }, [teamId]);

  const dims = wide
    ? size === 'xl'
      ? 'w-32 h-16'
      : size === 'lg'
      ? 'w-24 h-12'
      : size === 'md'
      ? 'w-16 h-8'
      : 'w-12 h-6'
    : size === 'xl'
    ? 'w-20 h-20'
    : size === 'lg'
    ? 'w-12 h-12'
    : size === 'md'
    ? 'w-9 h-9'
    : size === 'sm'
    ? 'w-6 h-6'
    : 'w-5 h-5';

  const padClass = bare
    ? ''
    : size === 'xl'
    ? 'p-1.5'
    : size === 'lg'
    ? 'p-1'
    : size === 'md'
    ? 'p-0.5'
    : 'p-[1px]';
  const currentUrl = info.logoUrls[urlIndex];

  if (currentUrl) {
    return (
      <div
        className={`${dims} ${padClass} shrink-0 flex items-center justify-center select-none overflow-hidden ${
          bare
            ? 'bg-transparent'
            : 'rounded bg-white/95 dark:bg-white/95 border border-slate-200/80 dark:border-slate-700/70'
        } ${className}`}
        title={info.name}
        aria-label={info.name}
      >
        <img
          src={resolvePublicAssetUrl(currentUrl)}
          alt={info.name}
          loading="eager"
          decoding="sync"
          draggable={false}
          onError={() => setUrlIndex((prev) => prev + 1)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  // Fallback SVG emblem only if all official logo images fail to load
  const uid = `crest-${teamId}`;
  const isTight = size === 'xs' || size === 'sm';

  return (
    <div
      className={`${dims} shrink-0 flex items-center justify-center select-none`}
      title={info.name}
      aria-label={info.name}
    >
      <svg
        viewBox="0 0 64 64"
        className="w-full h-full"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={info.primaryColor} />
            <stop offset="100%" stopColor={info.secondaryColor} />
          </linearGradient>
        </defs>
        <path
          d="M10 8 H54 V33 C54 47 32 58 32 58 C32 58 10 47 10 33 Z"
          fill={`url(#${uid})`}
          stroke="#FFFFFF"
          strokeOpacity="0.35"
          strokeWidth="2.2"
        />
        <text
          x="32"
          y={isTight ? '38' : '36'}
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize={motif.monogram.length >= 3 ? (isTight ? '17' : '15') : isTight ? '22' : '20'}
          fontWeight="900"
          fontFamily="Pretendard, Inter, system-ui, sans-serif"
        >
          {motif.monogram}
        </text>
        {!isTight && (
          <text
            x="32"
            y="47"
            textAnchor="middle"
            fill="#FFFFFF"
            fillOpacity="0.85"
            fontSize="6.8"
            fontWeight="800"
          >
            {motif.sub}
          </text>
        )}
      </svg>
    </div>
  );
};

interface FuturesTeamLogoProps {
  teamId: FuturesTeamId;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export const FuturesTeamLogo: React.FC<FuturesTeamLogoProps> = ({ teamId, size = 'sm' }) => {
  const [urlIndex, setUrlIndex] = useState(0);

  useEffect(() => {
    preloadAllKboTeamLogos();
    setUrlIndex(0);
  }, [teamId]);

  if (teamId !== '상무' && teamId !== '울산') {
    return <TeamLogo teamId={teamId} size={size} />;
  }

  const meta = SPECIAL_FUTURES_LOGOS[teamId];
  const dims =
    size === 'lg'
      ? 'w-12 h-12'
      : size === 'md'
      ? 'w-9 h-9'
      : size === 'sm'
      ? 'w-6 h-6'
      : 'w-5 h-5';
  const padClass = size === 'lg' ? 'p-1' : size === 'md' ? 'p-0.5' : 'p-[1px]';
  const currentUrl = meta.logoUrls[urlIndex];

  if (currentUrl) {
    return (
      <div
        className={`${dims} ${padClass} shrink-0 rounded bg-white/95 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-center select-none overflow-hidden`}
        title={meta.name}
        aria-label={meta.name}
      >
        <img
          src={resolvePublicAssetUrl(currentUrl)}
          alt={meta.name}
          loading="lazy"
          decoding="async"
          onError={() => setUrlIndex((prev) => prev + 1)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  const isTight = size === 'xs' || size === 'sm';

  if (teamId === '상무') {
    // 국군체육부대 상무 피닉스 현실형 불사조 방패 엠블럼
    return (
      <div
        className={`${dims} shrink-0 flex items-center justify-center select-none`}
        title={meta.name}
        aria-label={meta.name}
      >
        <svg viewBox="0 0 64 64" className="w-full h-full" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="sangmu-bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1B365D" />
              <stop offset="65%" stopColor="#1E293B" />
              <stop offset="100%" stopColor="#7F1D1D" />
            </linearGradient>
            <linearGradient id="sangmu-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>
          <path
            d="M8 7 H56 V32 C56 47 32 58 32 58 C32 58 8 47 8 32 Z"
            fill="url(#sangmu-bg)"
            stroke="url(#sangmu-gold)"
            strokeWidth="2.8"
          />
          {/* Phoenix wings */}
          <path
            d="M15 24 C20 17 26 20 32 28 C38 20 44 17 49 24 C45 31 40 34 32 39 C24 34 19 31 15 24 Z"
            fill="#DC2626"
            stroke="#FBBF24"
            strokeWidth="1.4"
          />
          {/* Military star crest */}
          <polygon
            points="32,11 33.8,15.5 38.6,15.8 34.9,18.8 36.1,23.4 32,20.8 27.9,23.4 29.1,18.8 25.4,15.8 30.2,15.5"
            fill="url(#sangmu-gold)"
          />
          <text
            x="32"
            y={isTight ? '49' : '47'}
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize={isTight ? '11' : '9.5'}
            fontWeight="900"
            fontFamily="Pretendard, Inter, system-ui, sans-serif"
          >
            PHOENIX
          </text>
        </svg>
      </div>
    );
  }

  // 울산 웨일스 현실형 고래·파도 엠블럼
  return (
    <div
      className={`${dims} shrink-0 flex items-center justify-center select-none`}
      title={meta.name}
      aria-label={meta.name}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="ulsan-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#082F49" />
            <stop offset="55%" stopColor="#0369A1" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="28" fill="url(#ulsan-bg)" stroke="#E0F2FE" strokeWidth="2.5" />
        {/* Stylized whale body & tail fluke */}
        <path
          d="M14 34 C16 22 27 17 37 21 C43 23 47 28 49 32 C45 34 40 35 34 35 C27 35 20 37 14 34 Z"
          fill="#F8FAFC"
        />
        <path
          d="M46 30 C50 25 53 22 55 24 C54 28 52 30 50 32 C53 33 55 36 53 38 C50 38 47 36 45 33 Z"
          fill="#BAE6FD"
        />
        {/* Ocean wave */}
        <path
          d="M10 42 Q21 37 32 42 T54 42"
          fill="none"
          stroke="#7DD3FC"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <text
          x="32"
          y={isTight ? '53' : '52'}
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize={isTight ? '10.5' : '9'}
          fontWeight="900"
          fontFamily="Pretendard, Inter, system-ui, sans-serif"
        >
          WHALES
        </text>
      </svg>
    </div>
  );
};
