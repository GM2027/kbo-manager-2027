import React from 'react';

export interface CountryFlagProps {
  nationality?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'w-4 h-3',
  sm: 'w-5 h-3.5',
  md: 'w-6 h-4',
};

function normalizeCountryKey(nationality?: string): string {
  const raw = (nationality ?? '한국').trim();
  const upper = raw.toUpperCase();
  if (!raw || raw === '대한민국' || upper === 'KR' || upper === 'KOR' || upper === 'KOREA' || upper === 'SOUTH KOREA' || raw.includes('한국')) return 'KR';
  if (raw === '미국' || upper === 'US' || upper === 'USA' || upper === 'UNITED STATES') return 'US';
  if (raw === '일본' || upper === 'JP' || upper === 'JPN' || upper === 'JAPAN') return 'JP';
  if (raw === '베네수엘라' || upper === 'VE' || upper === 'VEN' || upper === 'VENEZUELA') return 'VE';
  if (raw.includes('도미니카') || upper === 'DO' || upper === 'DOM' || upper.includes('DOMINICAN')) return 'DO';
  if (raw === '쿠바' || upper === 'CU' || upper === 'CUB' || upper === 'CUBA') return 'CU';
  if (raw === '파나마' || upper === 'PA' || upper === 'PAN' || upper === 'PANAMA') return 'PA';
  if (raw.includes('푸에르토리코') || upper === 'PR' || upper === 'PRI' || upper.includes('PUERTO RICO')) return 'PR';
  if (raw === '콜롬비아' || upper === 'CO' || upper === 'COL' || upper === 'COLOMBIA') return 'CO';
  if (raw === '멕시코' || upper === 'MX' || upper === 'MEX' || upper === 'MEXICO') return 'MX';
  if (raw === '캐나다' || upper === 'CA' || upper === 'CAN' || upper === 'CANADA') return 'CA';
  if (raw === '호주' || raw === '오스트레일리아' || upper === 'AU' || upper === 'AUS' || upper === 'AUSTRALIA') return 'AU';
  if (raw === '대만' || raw === '타이완' || raw.includes('타이베이') || upper === 'TW' || upper === 'TPE' || upper === 'TAIWAN') return 'TW';
  if (raw === '네덜란드' || upper === 'NL' || upper === 'NED' || upper === 'NETHERLANDS') return 'NL';
  if (raw === '퀴라소' || upper === 'CW' || upper === 'CUR' || upper === 'CURACAO') return 'CW';
  if (raw === '니카라과' || upper === 'NI' || upper === 'NCA' || upper === 'NICARAGUA') return 'NI';
  if (raw === '브라질' || upper === 'BR' || upper === 'BRA' || upper === 'BRAZIL') return 'BR';
  if (raw === '이탈리아' || upper === 'IT' || upper === 'ITA' || upper === 'ITALY') return 'IT';
  return 'GLOBAL';
}

/**
 * 선명한 벡터 SVG 국기 로고 (Windows/Linux/macOS 폰트 이모지 깨짐 방지)
 */
export const CountryFlag: React.FC<CountryFlagProps> = ({
  nationality = '한국',
  size = 'sm',
  className = '',
}) => {
  const code = normalizeCountryKey(nationality);
  const label = (nationality ?? '한국').trim() || '한국';
  const baseClass = `inline-block shrink-0 rounded-[2px] ring-1 ring-inset ring-black/15 dark:ring-white/20 shadow-[0_0.5px_1.5px_rgba(0,0,0,0.2)] overflow-hidden ${SIZE_CLASSES[size]} ${className}`;

  switch (code) {
    case 'KR':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#FFFFFF" />
          {/* Taegeuk */}
          <circle cx="12" cy="8" r="3.6" fill="#CD2E3A" />
          <path d="M8.4 8 A3.6 3.6 0 0 0 15.6 8 A1.8 1.8 0 0 1 12 8 A1.8 1.8 0 0 0 8.4 8 Z" fill="#0047A0" />
          {/* 4 Trigrams simplified crisp strokes */}
          <g stroke="#111827" strokeWidth="0.9" strokeLinecap="butt">
            <line x1="4" y1="3.2" x2="6.6" y2="5.2" />
            <line x1="3.2" y1="4.2" x2="5.8" y2="6.2" />
            <line x1="2.4" y1="5.2" x2="5.0" y2="7.2" />

            <line x1="17.4" y1="5.2" x2="20" y2="3.2" />
            <line x1="18.2" y1="6.2" x2="20.8" y2="4.2" />
            <line x1="19.0" y1="7.2" x2="21.6" y2="5.2" />

            <line x1="4" y1="12.8" x2="6.6" y2="10.8" />
            <line x1="3.2" y1="11.8" x2="5.8" y2="9.8" />

            <line x1="17.4" y1="10.8" x2="20" y2="12.8" />
            <line x1="18.2" y1="9.8" x2="20.8" y2="11.8" />
          </g>
        </svg>
      );

    case 'US':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#FFFFFF" />
          <rect y="0" width="24" height="1.5" fill="#B22234" />
          <rect y="3" width="24" height="1.5" fill="#B22234" />
          <rect y="6" width="24" height="1.5" fill="#B22234" />
          <rect y="9" width="24" height="1.5" fill="#B22234" />
          <rect y="12" width="24" height="1.5" fill="#B22234" />
          <rect y="14.7" width="24" height="1.3" fill="#B22234" />
          <rect width="10.5" height="8.5" fill="#3C3B6E" />
          <g fill="#FFFFFF">
            <circle cx="2" cy="1.8" r="0.65" />
            <circle cx="4.4" cy="1.8" r="0.65" />
            <circle cx="6.8" cy="1.8" r="0.65" />
            <circle cx="9.0" cy="1.8" r="0.65" />
            <circle cx="3.2" cy="3.6" r="0.65" />
            <circle cx="5.6" cy="3.6" r="0.65" />
            <circle cx="8.0" cy="3.6" r="0.65" />
            <circle cx="2" cy="5.4" r="0.65" />
            <circle cx="4.4" cy="5.4" r="0.65" />
            <circle cx="6.8" cy="5.4" r="0.65" />
            <circle cx="9.0" cy="5.4" r="0.65" />
            <circle cx="3.2" cy="7.1" r="0.65" />
            <circle cx="5.6" cy="7.1" r="0.65" />
            <circle cx="8.0" cy="7.1" r="0.65" />
          </g>
        </svg>
      );

    case 'JP':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#FFFFFF" />
          <circle cx="12" cy="8" r="4.6" fill="#BC002D" />
        </svg>
      );

    case 'VE':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="5.33" y="0" fill="#FFCC00" />
          <rect width="24" height="5.34" y="5.33" fill="#00247D" />
          <rect width="24" height="5.33" y="10.67" fill="#CF142B" />
          <g fill="#FFFFFF">
            <circle cx="7.8" cy="8.9" r="0.55" />
            <circle cx="9.2" cy="7.7" r="0.55" />
            <circle cx="11.0" cy="7.1" r="0.55" />
            <circle cx="13.0" cy="7.1" r="0.55" />
            <circle cx="14.8" cy="7.7" r="0.55" />
            <circle cx="16.2" cy="8.9" r="0.55" />
          </g>
        </svg>
      );

    case 'DO':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#FFFFFF" />
          <rect x="0" y="0" width="10.4" height="6.4" fill="#002D62" />
          <rect x="13.6" y="0" width="10.4" height="6.4" fill="#CE1126" />
          <rect x="0" y="9.6" width="10.4" height="6.4" fill="#CE1126" />
          <rect x="13.6" y="9.6" width="10.4" height="6.4" fill="#002D62" />
          <circle cx="12" cy="8" r="1.4" fill="#1E7B34" />
          <circle cx="12" cy="8" r="0.7" fill="#F2C94C" />
        </svg>
      );

    case 'CU':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#FFFFFF" />
          <rect y="0" width="24" height="3.2" fill="#002A8F" />
          <rect y="6.4" width="24" height="3.2" fill="#002A8F" />
          <rect y="12.8" width="24" height="3.2" fill="#002A8F" />
          <polygon points="0,0 11,8 0,16" fill="#CF142B" />
          <polygon points="4.1,5.6 4.7,7.3 6.5,7.3 5.0,8.4 5.6,10.1 4.1,9.0 2.6,10.1 3.2,8.4 1.7,7.3 3.5,7.3" fill="#FFFFFF" />
        </svg>
      );

    case 'PA':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#FFFFFF" />
          <rect x="12" y="0" width="12" height="8" fill="#DA121A" />
          <rect x="0" y="8" width="12" height="8" fill="#072357" />
          <polygon points="6,2.1 6.6,3.7 8.3,3.7 6.9,4.7 7.4,6.3 6,5.3 4.6,6.3 5.1,4.7 3.7,3.7 5.4,3.7" fill="#072357" />
          <polygon points="18,9.9 18.6,11.5 20.3,11.5 18.9,12.5 19.4,14.1 18,13.1 16.6,14.1 17.1,12.5 15.7,11.5 17.4,11.5" fill="#DA121A" />
        </svg>
      );

    case 'PR':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#FFFFFF" />
          <rect y="0" width="24" height="3.2" fill="#ED0000" />
          <rect y="6.4" width="24" height="3.2" fill="#ED0000" />
          <rect y="12.8" width="24" height="3.2" fill="#ED0000" />
          <polygon points="0,0 11,8 0,16" fill="#0050F0" />
          <polygon points="4.1,5.6 4.7,7.3 6.5,7.3 5.0,8.4 5.6,10.1 4.1,9.0 2.6,10.1 3.2,8.4 1.7,7.3 3.5,7.3" fill="#FFFFFF" />
        </svg>
      );

    case 'CO':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="8" y="0" fill="#FCD116" />
          <rect width="24" height="4" y="8" fill="#003893" />
          <rect width="24" height="4" y="12" fill="#CE1126" />
        </svg>
      );

    case 'MX':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="8" height="16" x="0" fill="#006847" />
          <rect width="8" height="16" x="8" fill="#FFFFFF" />
          <rect width="8" height="16" x="16" fill="#CE1126" />
          <circle cx="12" cy="8" r="1.8" fill="#8B5A2B" />
        </svg>
      );

    case 'CA':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="6" height="16" x="0" fill="#D80621" />
          <rect width="12" height="16" x="6" fill="#FFFFFF" />
          <rect width="6" height="16" x="18" fill="#D80621" />
          <path
            d="M12 3.2 L12.9 6.0 L14.8 5.2 L14.2 7.3 L16.0 7.6 L13.8 9.6 L14.3 10.8 L12.4 10.5 L12.4 12.8 L11.6 12.8 L11.6 10.5 L9.7 10.8 L10.2 9.6 L8.0 7.6 L9.8 7.3 L9.2 5.2 L11.1 6.0 Z"
            fill="#D80621"
          />
        </svg>
      );

    case 'AU':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#012169" />
          {/* Union Jack canton */}
          <rect width="11" height="8" fill="#012169" />
          <path d="M0 0 L11 8 M11 0 L0 8" stroke="#FFFFFF" strokeWidth="1.6" />
          <path d="M0 0 L11 8 M11 0 L0 8" stroke="#C8102E" strokeWidth="0.7" />
          <rect x="4.5" y="0" width="2" height="8" fill="#FFFFFF" />
          <rect x="0" y="3" width="11" height="2" fill="#FFFFFF" />
          <rect x="4.9" y="0" width="1.2" height="8" fill="#C8102E" />
          <rect x="0" y="3.4" width="11" height="1.2" fill="#C8102E" />
          {/* Commonwealth & Southern Cross stars */}
          <g fill="#FFFFFF">
            <circle cx="5.5" cy="12" r="1.4" />
            <circle cx="18" cy="3.5" r="0.9" />
            <circle cx="15.2" cy="7.5" r="0.85" />
            <circle cx="20.8" cy="6.8" r="0.85" />
            <circle cx="18" cy="12.2" r="0.9" />
            <circle cx="19.5" cy="9.4" r="0.55" />
          </g>
        </svg>
      );

    case 'TW':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#FE0000" />
          <rect width="12" height="8.5" fill="#000095" />
          <circle cx="6" cy="4.25" r="2.1" fill="#FFFFFF" />
          <circle cx="6" cy="4.25" r="1.25" fill="#000095" />
          <circle cx="6" cy="4.25" r="0.9" fill="#FFFFFF" />
        </svg>
      );

    case 'NL':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="5.33" y="0" fill="#AE1C28" />
          <rect width="24" height="5.34" y="5.33" fill="#FFFFFF" />
          <rect width="24" height="5.33" y="10.67" fill="#21468B" />
        </svg>
      );

    case 'CW':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#002B7F" />
          <rect y="10" width="24" height="2.4" fill="#F9E814" />
          <circle cx="4.5" cy="3.5" r="1.1" fill="#FFFFFF" />
          <circle cx="7.8" cy="5.8" r="1.4" fill="#FFFFFF" />
        </svg>
      );

    case 'NI':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="5.33" y="0" fill="#0067C6" />
          <rect width="24" height="5.34" y="5.33" fill="#FFFFFF" />
          <rect width="24" height="5.33" y="10.67" fill="#0067C6" />
          <polygon points="12,6.4 13.5,9.3 10.5,9.3" fill="#D4AF37" />
        </svg>
      );

    case 'BR':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#009C3B" />
          <polygon points="12,2 21.5,8 12,14 2.5,8" fill="#FFDF00" />
          <circle cx="12" cy="8" r="3.1" fill="#002776" />
          <path d="M9.1 7.6 Q12 6.8 14.9 8.4" stroke="#FFFFFF" strokeWidth="0.7" fill="none" />
        </svg>
      );

    case 'IT':
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="8" height="16" x="0" fill="#009246" />
          <rect width="8" height="16" x="8" fill="#FFFFFF" />
          <rect width="8" height="16" x="16" fill="#CE2B37" />
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 24 16" className={baseClass} role="img" aria-label={`${label} 국기`}>
          <rect width="24" height="16" fill="#1E293B" />
          <circle cx="12" cy="8" r="5" fill="none" stroke="#94A3B8" strokeWidth="1.2" />
          <ellipse cx="12" cy="8" rx="2.4" ry="5" fill="none" stroke="#94A3B8" strokeWidth="1" />
          <line x1="7" y1="8" x2="17" y2="8" stroke="#94A3B8" strokeWidth="1" />
        </svg>
      );
  }
};

export interface NationalityBadgeProps {
  nationality?: string;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

export const NationalityBadge: React.FC<NationalityBadgeProps> = ({
  nationality = '한국',
  size = 'xs',
  showLabel = true,
  className = '',
}) => {
  const label = (nationality ?? '한국').trim() || '한국';
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`}>
      <CountryFlag nationality={label} size={size} />
      {showLabel && <span>{label}</span>}
    </span>
  );
};
