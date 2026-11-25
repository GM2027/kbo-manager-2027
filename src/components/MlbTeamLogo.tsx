import React, { useEffect, useState } from 'react';

export interface MlbClubMeta {
  englishName: string;
  koreanName: string;
  abbr: string;
  espnAbbr: string;
  mlbId: number;
  primaryColor: string;
  secondaryColor: string;
  aliases?: string[];
}

export const MLB_TEAM_META: Record<string, MlbClubMeta> = {
  'New York Yankees': {
    englishName: 'New York Yankees',
    koreanName: '뉴욕 양키스',
    abbr: 'NYY',
    espnAbbr: 'nyy',
    mlbId: 147,
    primaryColor: '#0C2340',
    secondaryColor: '#64748B',
    aliases: ['양키스', 'Yankees'],
  },
  'Los Angeles Dodgers': {
    englishName: 'Los Angeles Dodgers',
    koreanName: 'LA 다저스',
    abbr: 'LAD',
    espnAbbr: 'lad',
    mlbId: 119,
    primaryColor: '#005A9C',
    secondaryColor: '#EF3E42',
    aliases: ['다저스', '로스앤젤레스 다저스', 'Dodgers'],
  },
  'San Diego Padres': {
    englishName: 'San Diego Padres',
    koreanName: '샌디에이고 파드리스',
    abbr: 'SD',
    espnAbbr: 'sd',
    mlbId: 135,
    primaryColor: '#2F241D',
    secondaryColor: '#FFC425',
    aliases: ['샌디에이고', '파드리스', '파드레스', 'Padres'],
  },
  'San Francisco Giants': {
    englishName: 'San Francisco Giants',
    koreanName: '샌프란시스코 자이언츠',
    abbr: 'SF',
    espnAbbr: 'sf',
    mlbId: 137,
    primaryColor: '#FD5A1E',
    secondaryColor: '#27251F',
    aliases: ['샌프란시스코', 'Giants'],
  },
  'Boston Red Sox': {
    englishName: 'Boston Red Sox',
    koreanName: '보스턴 레드삭스',
    abbr: 'BOS',
    espnAbbr: 'bos',
    mlbId: 111,
    primaryColor: '#BD3039',
    secondaryColor: '#0C2340',
    aliases: ['보스턴', '레드삭스', 'Red Sox'],
  },
  'Seattle Mariners': {
    englishName: 'Seattle Mariners',
    koreanName: '시애틀 매리너스',
    abbr: 'SEA',
    espnAbbr: 'sea',
    mlbId: 136,
    primaryColor: '#0C2C56',
    secondaryColor: '#005C5C',
    aliases: ['시애틀', '매리너스', 'Mariners'],
  },
  'Toronto Blue Jays': {
    englishName: 'Toronto Blue Jays',
    koreanName: '토론토 블루제이스',
    abbr: 'TOR',
    espnAbbr: 'tor',
    mlbId: 141,
    primaryColor: '#134A8E',
    secondaryColor: '#E8291C',
    aliases: ['토론토', '블루제이스', '블루제이즈', 'Blue Jays'],
  },
  'Chicago Cubs': {
    englishName: 'Chicago Cubs',
    koreanName: '시카고 컵스',
    abbr: 'CHC',
    espnAbbr: 'chc',
    mlbId: 112,
    primaryColor: '#0E3386',
    secondaryColor: '#CC3433',
    aliases: ['컵스', 'Cubs'],
  },
  'Atlanta Braves': {
    englishName: 'Atlanta Braves',
    koreanName: '애틀랜타 브레이브스',
    abbr: 'ATL',
    espnAbbr: 'atl',
    mlbId: 144,
    primaryColor: '#CE1141',
    secondaryColor: '#13274F',
    aliases: ['애틀랜타', '브레이브스', 'Braves'],
  },
  'Houston Astros': {
    englishName: 'Houston Astros',
    koreanName: '휴스턴 애스트로스',
    abbr: 'HOU',
    espnAbbr: 'hou',
    mlbId: 117,
    primaryColor: '#002D62',
    secondaryColor: '#EB6E1F',
    aliases: ['휴스턴', '애스트로스', 'Astros'],
  },
  'Philadelphia Phillies': {
    englishName: 'Philadelphia Phillies',
    koreanName: '필라델피아 필리스',
    abbr: 'PHI',
    espnAbbr: 'phi',
    mlbId: 143,
    primaryColor: '#E81828',
    secondaryColor: '#002D72',
    aliases: ['필라델피아', '필리스', 'Phillies'],
  },
  'New York Mets': {
    englishName: 'New York Mets',
    koreanName: '뉴욕 메츠',
    abbr: 'NYM',
    espnAbbr: 'nym',
    mlbId: 121,
    primaryColor: '#002D72',
    secondaryColor: '#FF5910',
    aliases: ['메츠', 'Mets'],
  },
  'Texas Rangers': {
    englishName: 'Texas Rangers',
    koreanName: '텍사스 레인저스',
    abbr: 'TEX',
    espnAbbr: 'tex',
    mlbId: 140,
    primaryColor: '#003278',
    secondaryColor: '#C0111F',
    aliases: ['텍사스', '레인저스', 'Rangers'],
  },
  'Baltimore Orioles': {
    englishName: 'Baltimore Orioles',
    koreanName: '볼티모어 오리올스',
    abbr: 'BAL',
    espnAbbr: 'bal',
    mlbId: 110,
    primaryColor: '#DF4601',
    secondaryColor: '#000000',
    aliases: ['볼티모어', '오리올스', 'Orioles'],
  },
  'Minnesota Twins': {
    englishName: 'Minnesota Twins',
    koreanName: '미네소타 트윈스',
    abbr: 'MIN',
    espnAbbr: 'min',
    mlbId: 142,
    primaryColor: '#002B5C',
    secondaryColor: '#D31145',
    aliases: ['미네소타', '트윈스', 'Twins'],
  },
  'Arizona Diamondbacks': {
    englishName: 'Arizona Diamondbacks',
    koreanName: '애리조나 다이아몬드백스',
    abbr: 'ARI',
    espnAbbr: 'ari',
    mlbId: 109,
    primaryColor: '#A71930',
    secondaryColor: '#000000',
    aliases: ['애리조나', '다이아몬드백스', '디백스', 'Diamondbacks'],
  },
  'St. Louis Cardinals': {
    englishName: 'St. Louis Cardinals',
    koreanName: '세인트루이스 카디널스',
    abbr: 'STL',
    espnAbbr: 'stl',
    mlbId: 138,
    primaryColor: '#C41E3A',
    secondaryColor: '#0C2340',
    aliases: ['세인트루이스', '카디널스', 'Cardinals'],
  },
  'Cleveland Guardians': {
    englishName: 'Cleveland Guardians',
    koreanName: '클리블랜드 가디언스',
    abbr: 'CLE',
    espnAbbr: 'cle',
    mlbId: 114,
    primaryColor: '#00385D',
    secondaryColor: '#E50022',
    aliases: ['클리블랜드', '가디언스', '가디언즈', 'Guardians'],
  },
  'Detroit Tigers': {
    englishName: 'Detroit Tigers',
    koreanName: '디트로이트 타이거즈',
    abbr: 'DET',
    espnAbbr: 'det',
    mlbId: 116,
    primaryColor: '#0C2340',
    secondaryColor: '#FA4616',
    aliases: [
      '디트로이트 타이거스',
      '디트로이트 타이거즈',
      '디트로이트',
      '타이거즈',
      '타이거스',
      'Detroit',
      'Tigers',
      '톨레도 머드헨스',
    ],
  },
  'Tampa Bay Rays': {
    englishName: 'Tampa Bay Rays',
    koreanName: '탬파베이 레이스',
    abbr: 'TB',
    espnAbbr: 'tb',
    mlbId: 139,
    primaryColor: '#092C5C',
    secondaryColor: '#8FBCE6',
    aliases: ['탬파베이', '레이스', '레이즈', 'Rays'],
  },
  'Kansas City Royals': {
    englishName: 'Kansas City Royals',
    koreanName: '캔자스시티 로열스',
    abbr: 'KC',
    espnAbbr: 'kc',
    mlbId: 118,
    primaryColor: '#004687',
    secondaryColor: '#BD9B60',
    aliases: ['캔자스시티', '로열스', '로얄스', 'Royals'],
  },
  'Milwaukee Brewers': {
    englishName: 'Milwaukee Brewers',
    koreanName: '밀워키 브루어스',
    abbr: 'MIL',
    espnAbbr: 'mil',
    mlbId: 158,
    primaryColor: '#12284B',
    secondaryColor: '#FFC52F',
    aliases: ['밀워키', '브루어스', 'Brewers'],
  },
  'Cincinnati Reds': {
    englishName: 'Cincinnati Reds',
    koreanName: '신시내티 레즈',
    abbr: 'CIN',
    espnAbbr: 'cin',
    mlbId: 113,
    primaryColor: '#C6011F',
    secondaryColor: '#000000',
    aliases: ['신시내티', '레즈', 'Reds'],
  },
  'Pittsburgh Pirates': {
    englishName: 'Pittsburgh Pirates',
    koreanName: '피츠버그 파이리츠',
    abbr: 'PIT',
    espnAbbr: 'pit',
    mlbId: 134,
    primaryColor: '#27251F',
    secondaryColor: '#FDB827',
    aliases: ['피츠버그', '파이리츠', '파이어리츠', 'Pirates'],
  },
  'Los Angeles Angels': {
    englishName: 'Los Angeles Angels',
    koreanName: 'LA 에인절스',
    abbr: 'LAA',
    espnAbbr: 'laa',
    mlbId: 108,
    primaryColor: '#BA0021',
    secondaryColor: '#003263',
    aliases: ['에인절스', '로스앤젤레스 에인절스', 'Angels'],
  },
  Athletics: {
    englishName: 'Athletics',
    koreanName: '애슬레틱스',
    abbr: 'ATH',
    espnAbbr: 'oak',
    mlbId: 133,
    primaryColor: '#003831',
    secondaryColor: '#EFB21E',
    aliases: ['오클랜드', '오클랜드 애슬레틱스', 'Oakland Athletics', 'OAK'],
  },
  'Washington Nationals': {
    englishName: 'Washington Nationals',
    koreanName: '워싱턴 내셔널스',
    abbr: 'WSH',
    espnAbbr: 'wsh',
    mlbId: 120,
    primaryColor: '#AB0003',
    secondaryColor: '#14225A',
    aliases: ['워싱턴', '내셔널스', 'Nationals'],
  },
  'Miami Marlins': {
    englishName: 'Miami Marlins',
    koreanName: '마이애미 말린스',
    abbr: 'MIA',
    espnAbbr: 'mia',
    mlbId: 146,
    primaryColor: '#00A3E0',
    secondaryColor: '#EF3340',
    aliases: ['마이애미', '말린스', 'Marlins'],
  },
  'Chicago White Sox': {
    englishName: 'Chicago White Sox',
    koreanName: '시카고 화이트삭스',
    abbr: 'CWS',
    espnAbbr: 'chw',
    mlbId: 145,
    primaryColor: '#27251F',
    secondaryColor: '#C4CED4',
    aliases: ['화이트삭스', 'White Sox', 'CHW'],
  },
  'Colorado Rockies': {
    englishName: 'Colorado Rockies',
    koreanName: '콜로라도 로키스',
    abbr: 'COL',
    espnAbbr: 'col',
    mlbId: 115,
    primaryColor: '#333366',
    secondaryColor: '#C4CED4',
    aliases: ['콜로라도', '로키스', 'Rockies'],
  },
};

function normalizeMlbName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/타이거스/g, '타이거즈')
    .replace(/가디언즈/g, '가디언스')
    .replace(/블루제이즈/g, '블루제이스')
    .replace(/레이즈/g, '레이스');
}

export function getMlbClubMeta(teamName: string): MlbClubMeta {
  const trimmed = teamName.trim();
  const direct = MLB_TEAM_META[trimmed];
  if (direct) return direct;

  const norm = normalizeMlbName(trimmed);
  const allMetas = Object.values(MLB_TEAM_META);

  // 1. Exact match against koreanName, englishName, abbr, or aliases
  const exact = allMetas.find(
    (m) =>
      normalizeMlbName(m.koreanName) === norm ||
      normalizeMlbName(m.englishName) === norm ||
      m.abbr.toLowerCase() === norm ||
      (m.aliases ?? []).some((a) => normalizeMlbName(a) === norm)
  );
  if (exact) return exact;

  // 2. Substring match for compound labels like 'MLB 디트로이트 타이거스 · AAA 톨레도' or '디트로이트 산하'
  const partial = allMetas.find(
    (m) =>
      norm.includes(normalizeMlbName(m.koreanName)) ||
      norm.includes(normalizeMlbName(m.englishName)) ||
      (m.aliases ?? []).some((a) => {
        const na = normalizeMlbName(a);
        return na.length >= 2 && norm.includes(na);
      })
  );
  if (partial) return partial;

  return {
    englishName: teamName,
    koreanName: teamName,
    abbr: trimmed.slice(0, 3).toUpperCase(),
    espnAbbr: '',
    mlbId: 0,
    primaryColor: '#1E293B',
    secondaryColor: '#475569',
  };
}

/**
 * Authentic Detroit Tigers Old English "D" vector emblem fallback (#23)
 * Rendered in official Detroit Navy (#0C2340) & Tigers Orange (#FA4616) whenever external CDN images cannot load.
 */
const DetroitTigersOldEnglishDSvg: React.FC = () => (
  <svg viewBox="0 0 64 64" className="w-full h-full" role="img" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="10" fill="#0C2340" stroke="#FA4616" strokeWidth="3" />
    {/* Subtle inner ring */}
    <rect x="6" y="6" width="52" height="52" rx="7" fill="none" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="1" />
    {/* Iconic Old English D silhouette with split gothic stem, flourishes & arched bowl */}
    <path
      d="M15 17 C19 14 25 13 33 13 C44 13 51 20 51 32 C51 44 43 51 31 51 L15 51 L17 47 C19 46 20 45 20 42 L20 22 C20 20 18 19 15 19 Z M28 20 L28 44 L31 44 C38 44 42 40 42 32 C42 24 38 20 31 20 Z"
      fill="#FFFFFF"
      fillRule="evenodd"
    />
    {/* Authentic Detroit Old English vertical inner hairline & gothic serif flourishes */}
    <path d="M23.5 18.5 L23.5 45.5" stroke="#0C2340" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M13 21 L22 15.5 L25 18.5" fill="none" stroke="#FA4616" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.5 48.5 L22 46 L25 49" fill="none" stroke="#FA4616" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface MlbTeamLogoProps {
  teamName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export const MlbTeamLogo: React.FC<MlbTeamLogoProps> = ({ teamName, size = 'sm' }) => {
  const meta = getMlbClubMeta(teamName);
  const urls =
    meta.mlbId > 0
      ? [
          `https://www.mlbstatic.com/team-logos/team-cap-on-light/${meta.mlbId}.svg`,
          ...(meta.espnAbbr ? [`https://a.espncdn.com/i/teamlogos/mlb/500/${meta.espnAbbr}.png`] : []),
          `https://www.mlbstatic.com/team-logos/${meta.mlbId}.svg`,
        ]
      : [];

  const [urlIndex, setUrlIndex] = useState(0);

  useEffect(() => {
    setUrlIndex(0);
  }, [teamName]);

  const dims =
    size === 'lg'
      ? 'w-11 h-11'
      : size === 'md'
      ? 'w-8 h-8'
      : size === 'sm'
      ? 'w-6 h-6'
      : 'w-5 h-5';

  const currentUrl = urls[urlIndex];

  if (currentUrl) {
    return (
      <div
        className={`${dims} p-0.5 shrink-0 rounded bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center select-none overflow-hidden`}
        title={`${meta.koreanName} (${meta.englishName})`}
        aria-label={meta.koreanName}
      >
        <img
          src={currentUrl}
          alt={meta.koreanName}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setUrlIndex((prev) => prev + 1)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  // Dedicated high-craft Detroit Tigers Old English "D" fallback emblem
  if (meta.abbr === 'DET') {
    return (
      <div
        className={`${dims} shrink-0 flex items-center justify-center select-none`}
        title={`${meta.koreanName} (${meta.englishName})`}
        aria-label={meta.koreanName}
      >
        <DetroitTigersOldEnglishDSvg />
      </div>
    );
  }

  const uid = `mlb-crest-${meta.abbr}-${meta.mlbId}`;
  return (
    <div
      className={`${dims} shrink-0 flex items-center justify-center select-none`}
      title={`${meta.koreanName} (${meta.englishName})`}
      aria-label={meta.koreanName}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={meta.primaryColor} />
            <stop offset="100%" stopColor={meta.secondaryColor} />
          </linearGradient>
        </defs>
        <path
          d="M10 8 H54 V33 C54 47 32 58 32 58 C32 58 10 47 10 33 Z"
          fill={`url(#${uid})`}
          stroke="#FFFFFF"
          strokeOpacity="0.4"
          strokeWidth="2.2"
        />
        <text
          x="32"
          y="38"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize={meta.abbr.length >= 3 ? '17' : '21'}
          fontWeight="900"
          fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
        >
          {meta.abbr}
        </text>
      </svg>
    </div>
  );
};
