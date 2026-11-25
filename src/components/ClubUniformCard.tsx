import React from 'react';
import { KBO_TEAMS } from '../data/kboTeams';
import { REAL_KBO_UNIFORM_SPECS } from '../data/realKboHistories';
import { ClubUniformEdition, TeamId } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface ClubUniformCardProps {
  edition: ClubUniformEdition;
  compact?: boolean;
}

function isLightHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 185;
}

/**
 * 현실 KBO 프로야구 유니폼 실루엣·핀스트라이프·버튼 플라켓·소매 파이핑·가슴 구단 로고·워드마크 정밀 SVG
 */
export const KboRealisticJerseySvg: React.FC<{
  uid: string;
  teamId?: TeamId;
  bodyColor: string;
  sleeveColor: string;
  trimColor: string;
  stripeColor?: string;
  pattern: ClubUniformEdition['pattern'];
  wordmark: string;
  iconicNumber?: string;
  kitSupplier?: string;
  label: string;
}> = ({
  uid,
  teamId,
  bodyColor,
  sleeveColor,
  trimColor,
  stripeColor,
  pattern,
  wordmark,
  iconicNumber,
  kitSupplier,
  label,
}) => {
  const lightBody = isLightHex(bodyColor);
  const textColor = lightBody ? trimColor : '#FFFFFF';
  const outlineColor = lightBody ? 'none' : trimColor;
  const placketLineColor = lightBody ? '#CBD5E1' : 'rgba(255,255,255,0.22)';
  const buttonFill = lightBody ? '#E2E8F0' : 'rgba(255,255,255,0.5)';
  const wordmarkFontSize =
    wordmark.length >= 7 ? 10.5 : wordmark.length >= 5 ? 12.5 : 15;
  const isScript = wordmark === 'Giants' || wordmark === 'Hanwha' || wordmark === 'kt wiz';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-24 h-26">
      <svg
        viewBox="0 0 120 132"
        className="w-24 h-26 drop-shadow-xs"
        role="img"
        aria-label={`${wordmark} ${label} 유니폼`}
      >
        <defs>
          <clipPath id={`body-clip-${uid}`}>
            <path d="M31 18 L45 14 C50 22, 70 22, 75 14 L89 18 L94 42 L91 118 C74 123, 46 123, 29 118 L26 42 Z" />
          </clipPath>
          <clipPath id={`sleeve-l-${uid}`}>
            <path d="M31 18 L6 42 L20 58 L31 46 Z" />
          </clipPath>
          <clipPath id={`sleeve-r-${uid}`}>
            <path d="M89 18 L114 42 L100 58 L89 46 Z" />
          </clipPath>
          <linearGradient id={`shade-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.11" />
            <stop offset="18%" stopColor="#FFFFFF" stopOpacity="0.06" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.02" />
            <stop offset="82%" stopColor="#000000" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
          </linearGradient>
        </defs>

        {/* 좌·우 소매 */}
        <path
          d="M31 18 L6 42 L20 58 L31 46 Z"
          fill={sleeveColor}
          stroke="#0F172A"
          strokeOpacity={lightBody ? '0.22' : '0.35'}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M89 18 L114 42 L100 58 L89 46 Z"
          fill={sleeveColor}
          stroke="#0F172A"
          strokeOpacity={lightBody ? '0.22' : '0.35'}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* 소매 핀스트라이프 (핀스트라이프 모델) */}
        {pattern === 'pinstripe' && (
          <>
            <g clipPath={`url(#sleeve-l-${uid})`} stroke={stripeColor ?? trimColor} strokeOpacity="0.35" strokeWidth="1">
              <line x1="12" y1="20" x2="12" y2="62" />
              <line x1="19" y1="20" x2="19" y2="62" />
              <line x1="26" y1="20" x2="26" y2="62" />
            </g>
            <g clipPath={`url(#sleeve-r-${uid})`} stroke={stripeColor ?? trimColor} strokeOpacity="0.35" strokeWidth="1">
              <line x1="94" y1="20" x2="94" y2="62" />
              <line x1="101" y1="20" x2="101" y2="62" />
              <line x1="108" y1="20" x2="108" y2="62" />
            </g>
          </>
        )}

        {/* 소매 끝단 이중 파이핑 (현실 KBO 저지 커프 디테일) */}
        <path d="M9 44 L21 57" stroke={trimColor} strokeWidth="3.2" strokeLinecap="butt" />
        <path d="M111 44 L99 57" stroke={trimColor} strokeWidth="3.2" strokeLinecap="butt" />
        {stripeColor && stripeColor !== trimColor && (
          <>
            <path d="M12 41 L24 54" stroke={stripeColor} strokeWidth="1.3" opacity="0.8" />
            <path d="M108 41 L96 54" stroke={stripeColor} strokeWidth="1.3" opacity="0.8" />
          </>
        )}

        {/* 좌측 소매 구단/KBO 패치 */}
        <rect
          x="15"
          y="36"
          width="7.5"
          height="5"
          rx="1"
          transform="rotate(-42 18.5 38.5)"
          fill={trimColor}
          opacity="0.88"
        />

        {/* 몸판 실루엣 */}
        <path
          d="M31 18 L45 14 C50 22, 70 22, 75 14 L89 18 L94 42 L91 118 C74 123, 46 123, 29 118 L26 42 Z"
          fill={bodyColor}
          stroke="#0F172A"
          strokeOpacity={lightBody ? '0.24' : '0.4'}
          strokeWidth="1.25"
          strokeLinejoin="round"
        />

        {/* 몸판 내부 패턴 (정밀 클리핑) */}
        <g clipPath={`url(#body-clip-${uid})`}>
          {pattern === 'pinstripe' && (
            <g stroke={stripeColor ?? trimColor} strokeOpacity="0.42" strokeWidth="1.15">
              {[33, 39, 45, 51, 57, 63, 69, 75, 81, 87].map((x) => (
                <line key={x} x1={x} y1="12" x2={x} y2="124" />
              ))}
            </g>
          )}
          {pattern === 'raglan' && (
            <>
              <path d="M26 14 L46 14 L30 48 L22 44 Z" fill={trimColor} opacity="0.92" />
              <path d="M94 14 L74 14 L90 48 L98 44 Z" fill={trimColor} opacity="0.92" />
            </>
          )}
          {pattern === 'modern-stripe' && (
            <>
              {/* 옆선 사이드 패널 컬러 블로킹 (SSG/KT/NC/KIA 모던 저지 스타일) */}
              <path d="M26 42 L34 45 L33 122 L26 122 Z" fill={trimColor} opacity="0.88" />
              <path d="M94 42 L86 45 L87 122 L94 122 Z" fill={trimColor} opacity="0.88" />
            </>
          )}
          {pattern === 'v-collar' && (
            <path d="M44 14 L60 34 L76 14" fill="none" stroke={trimColor} strokeWidth="3.2" />
          )}

          {/* 원단 입체 음영 */}
          <rect x="24" y="12" width="72" height="114" fill={`url(#shade-${uid})`} />
        </g>

        {/* 목 안쪽 칼라 백킹 */}
        <path
          d="M45 14 C50 20, 70 20, 75 14 C70 11, 50 11, 45 14 Z"
          fill={lightBody ? '#E2E8F0' : '#090B10'}
          opacity="0.7"
        />

        {/* 헤드스푼(넥→버튼) 파이핑 + 중앙 버튼 플라켓 */}
        <path
          d="M45 14 C50 23, 70 23, 75 14"
          fill="none"
          stroke={trimColor}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <line
          x1="57.5"
          y1="22"
          x2="57.5"
          y2="120"
          stroke={pattern === 'classic' ? trimColor : placketLineColor}
          strokeOpacity={pattern === 'classic' ? '0.68' : '0.8'}
          strokeWidth={pattern === 'classic' ? '1.3' : '0.9'}
        />
        <line
          x1="62.5"
          y1="22"
          x2="62.5"
          y2="120"
          stroke={pattern === 'classic' ? trimColor : placketLineColor}
          strokeOpacity={pattern === 'classic' ? '0.68' : '0.8'}
          strokeWidth={pattern === 'classic' ? '1.3' : '0.9'}
        />

        {/* 6개 저지 단추 */}
        {[31, 45, 59, 74, 89, 104].map((cy) => (
          <circle
            key={cy}
            cx="60"
            cy={cy}
            r="1.35"
            fill={buttonFill}
            stroke={lightBody ? '#94A3B8' : 'rgba(0,0,0,0.45)'}
            strokeWidth="0.45"
          />
        ))}

        {/* 우측 상단 킷 서플라이어 마크 */}
        {kitSupplier && (
          <text
            x="42"
            y="34"
            textAnchor="middle"
            fill={lightBody ? '#475569' : 'rgba(255,255,255,0.75)'}
            fontSize="4.6"
            fontWeight="800"
            letterSpacing="0.3"
          >
            {kitSupplier.slice(0, 8)}
          </text>
        )}

        {/* 구단 가슴 워드마크 */}
        <text
          x="60"
          y="61"
          textAnchor="middle"
          fill={textColor}
          stroke={outlineColor}
          strokeWidth={outlineColor === 'none' ? 0 : 0.45}
          paintOrder="stroke"
          fontSize={wordmarkFontSize}
          fontWeight="900"
          fontStyle={isScript ? 'italic' : 'normal'}
          letterSpacing={wordmark.length >= 6 ? '0.2' : '0.8'}
          fontFamily={isScript ? 'Georgia, serif' : 'system-ui, -apple-system, sans-serif'}
        >
          {wordmark}
        </text>

        {/* 좌측 하단(선수 정면 좌측 배번) 등번호 */}
        {iconicNumber && (
          <text
            x="77"
            y="84"
            textAnchor="middle"
            fill={textColor}
            fontSize="11.5"
            fontWeight="900"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
          >
            {iconicNumber}
          </text>
        )}
      </svg>
      {/* 좌측 가슴(선수 정면 기준 왼쪽 가슴) 구단 소형 엠블럼 (배경 없음) */}
      {teamId && (
        <div
          className="pointer-events-none absolute top-[21%] right-[24%] w-[18px] h-[18px] flex items-center justify-center"
          title={`${KBO_TEAMS[teamId].shortName} 구단 엠블럼`}
        >
          <TeamLogo
            teamId={teamId}
            size="xs"
            bare
            className="w-4 h-4 drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.35)]"
          />
        </div>
      )}
      </div>

      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
    </div>
  );
};

/**
 * 구단별 현실 KBO 2025/2026 스타일 홈 · 원정 · 얼트 유니폼 미리보기 카드
 */
export const ClubUniformCard: React.FC<ClubUniformCardProps> = ({ edition, compact = false }) => {
  const team = KBO_TEAMS[edition.teamId];
  const fallbackSpec = REAL_KBO_UNIFORM_SPECS[edition.teamId];

  const kitSupplier = edition.kitSupplier ?? fallbackSpec.kitSupplier;
  const homeBody = edition.homeBodyHex ?? fallbackSpec.homeBodyHex;
  const awayBody = edition.awayBodyHex ?? fallbackSpec.awayBodyHex;
  const altBody = edition.altBodyHex ?? fallbackSpec.altBodyHex;
  const homeTrim = edition.homeTrimHex ?? fallbackSpec.homeTrimHex;
  const homeStripe = edition.homeStripeHex ?? fallbackSpec.homeStripeHex;
  const awayTrim = edition.awayTrimHex ?? fallbackSpec.awayTrimHex;
  const altTrim = edition.altTrimHex ?? fallbackSpec.altTrimHex;
  const homePattern = edition.homePattern ?? fallbackSpec.homePattern;
  const awayPattern = edition.awayPattern ?? fallbackSpec.awayPattern;
  const altPattern = edition.altPattern ?? fallbackSpec.altPattern;
  const homeWordmark = edition.homeWordmark ?? fallbackSpec.homeWordmark;
  const awayWordmark = edition.awayWordmark ?? fallbackSpec.awayWordmark;
  const altWordmark = edition.altWordmark ?? fallbackSpec.altWordmark;
  const iconicNumber = edition.iconicNumber ?? fallbackSpec.iconicNumber;

  const baseUid = `${edition.teamId}-${edition.season}`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <TeamLogo teamId={edition.teamId} size="xs" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {team.name}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {edition.editionName} · {kitSupplier}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-mono-stats font-bold text-emerald-700 dark:text-emerald-400">
            상품매출 +{edition.merchBoostPct}%
          </div>
          <div className="text-[10px] font-mono-stats text-slate-400">{edition.releasedDate}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-3 px-2 rounded-lg bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800/80">
        <KboRealisticJerseySvg
          uid={`${baseUid}-home`}
          teamId={edition.teamId}
          bodyColor={homeBody}
          sleeveColor={homePattern === 'raglan' ? homeTrim : homeBody}
          trimColor={homeTrim}
          stripeColor={homeStripe}
          pattern={homePattern}
          wordmark={homeWordmark}
          iconicNumber={iconicNumber}
          kitSupplier={kitSupplier}
          label="홈 유니폼"
        />
        <KboRealisticJerseySvg
          uid={`${baseUid}-away`}
          teamId={edition.teamId}
          bodyColor={awayBody}
          sleeveColor={awayPattern === 'raglan' ? awayTrim : awayBody}
          trimColor={awayTrim}
          stripeColor="#FFFFFF"
          pattern={awayPattern}
          wordmark={awayWordmark}
          iconicNumber={iconicNumber}
          kitSupplier={kitSupplier}
          label="원정 유니폼"
        />
        {!compact && (
          <KboRealisticJerseySvg
            uid={`${baseUid}-alt`}
            teamId={edition.teamId}
            bodyColor={altBody}
            sleeveColor={altPattern === 'raglan' ? altTrim : altBody}
            trimColor={altTrim}
            stripeColor={homeTrim}
            pattern={altPattern}
            wordmark={altWordmark}
            iconicNumber={iconicNumber}
            kitSupplier={kitSupplier}
            label="얼트 에디션"
          />
        )}
      </div>

      {!compact && (
        <div className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed flex flex-wrap items-center justify-between gap-1">
          <span className="truncate">
            홈 {edition.homeTheme} · 원정 {edition.awayTheme}
          </span>
        </div>
      )}
    </div>
  );
};
