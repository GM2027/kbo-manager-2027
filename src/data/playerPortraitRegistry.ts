import { Player, TeamId } from '../types/kbo';

export type PortraitUniformKey = TeamId | '상무' | 'FA' | 'RETIRED';

export interface ClubUniformPalette {
  key: PortraitUniformKey;
  label: string;
  capCrown: string;
  capBrim: string;
  capLogoText: string;
  capLogoColor: string;
  jerseyBase: string;
  jerseyPiping: string;
  jerseyPinstripe?: string;
  jerseyRaglan?: string;
  undershirt: string;
  bgFrom: string;
  bgTo: string;
  accent: string;
}

/**
 * KBO 10개 구단 + 상무 피닉스 + FA/은퇴 공식 유니폼·모자 컬러 팔레트
 * - 트레이드 및 FA 이적 시 player.teamId 변경만으로 즉시 구단 모자·유니폼 자동 전환
 */
export const CLUB_UNIFORM_PALETTES: Record<PortraitUniformKey, ClubUniformPalette> = {
  LG: {
    key: 'LG',
    label: 'LG 트윈스',
    capCrown: '#18181b',
    capBrim: '#a50034',
    capLogoText: 'LG',
    capLogoColor: '#ffffff',
    jerseyBase: '#f8fafc',
    jerseyPiping: '#a50034',
    jerseyPinstripe: '#334155',
    undershirt: '#18181b',
    bgFrom: '#3b0a18',
    bgTo: '#111827',
    accent: '#c30452',
  },
  한화: {
    key: '한화',
    label: '한화 이글스',
    capCrown: '#111827',
    capBrim: '#f37321',
    capLogoText: 'E',
    capLogoColor: '#f37321',
    jerseyBase: '#fafaf9',
    jerseyPiping: '#f37321',
    jerseyRaglan: '#1f2937',
    undershirt: '#111827',
    bgFrom: '#431407',
    bgTo: '#0f172a',
    accent: '#f37321',
  },
  삼성: {
    key: '삼성',
    label: '삼성 라이온즈',
    capCrown: '#074ca1',
    capBrim: '#053b7e',
    capLogoText: 'S',
    capLogoColor: '#ffffff',
    jerseyBase: '#f8fafc',
    jerseyPiping: '#074ca1',
    jerseyRaglan: '#074ca1',
    undershirt: '#074ca1',
    bgFrom: '#0c2d5e',
    bgTo: '#0f172a',
    accent: '#2563eb',
  },
  KIA: {
    key: 'KIA',
    label: 'KIA 타이거즈',
    capCrown: '#111827',
    capBrim: '#ea0029',
    capLogoText: 'T',
    capLogoColor: '#ea0029',
    jerseyBase: '#f8fafc',
    jerseyPiping: '#ea0029',
    undershirt: '#111827',
    bgFrom: '#450a0a',
    bgTo: '#111827',
    accent: '#ea0029',
  },
  두산: {
    key: '두산',
    label: '두산 베어스',
    capCrown: '#131230',
    capBrim: '#131230',
    capLogoText: 'D',
    capLogoColor: '#ffffff',
    jerseyBase: '#f8fafc',
    jerseyPiping: '#131230',
    undershirt: '#131230',
    bgFrom: '#1e1b4b',
    bgTo: '#0f172a',
    accent: '#ed1c24',
  },
  SSG: {
    key: 'SSG',
    label: 'SSG 랜더스',
    capCrown: '#ce0e2d',
    capBrim: '#9f0a22',
    capLogoText: 'L',
    capLogoColor: '#fef08a',
    jerseyBase: '#fffbeb',
    jerseyPiping: '#ce0e2d',
    undershirt: '#ce0e2d',
    bgFrom: '#4c0519',
    bgTo: '#18181b',
    accent: '#ce0e2d',
  },
  KT: {
    key: 'KT',
    label: 'KT 위즈',
    capCrown: '#111111',
    capBrim: '#111111',
    capLogoText: 'kt',
    capLogoColor: '#ef4444',
    jerseyBase: '#f8fafc',
    jerseyPiping: '#111111',
    jerseyRaglan: '#18181b',
    undershirt: '#111111',
    bgFrom: '#27272a',
    bgTo: '#09090b',
    accent: '#eb1c24',
  },
  롯데: {
    key: '롯데',
    label: '롯데 자이언츠',
    capCrown: '#041e42',
    capBrim: '#d00f31',
    capLogoText: 'G',
    capLogoColor: '#ffffff',
    jerseyBase: '#f8fafc',
    jerseyPiping: '#041e42',
    jerseyPinstripe: '#1e3a5f',
    undershirt: '#041e42',
    bgFrom: '#0c2340',
    bgTo: '#0f172a',
    accent: '#d00f31',
  },
  NC: {
    key: 'NC',
    label: 'NC 다이노스',
    capCrown: '#071d3d',
    capBrim: '#1d467d',
    capLogoText: 'N',
    capLogoColor: '#c7a079',
    jerseyBase: '#f8fafc',
    jerseyPiping: '#1d467d',
    undershirt: '#071d3d',
    bgFrom: '#0c2548',
    bgTo: '#0f172a',
    accent: '#315288',
  },
  키움: {
    key: '키움',
    label: '키움 히어로즈',
    capCrown: '#570514',
    capBrim: '#420410',
    capLogoText: 'H',
    capLogoColor: '#ffffff',
    jerseyBase: '#f8fafc',
    jerseyPiping: '#570514',
    undershirt: '#570514',
    bgFrom: '#3b0712',
    bgTo: '#18181b',
    accent: '#820024',
  },
  상무: {
    key: '상무',
    label: '상무 피닉스',
    capCrown: '#1e293b',
    capBrim: '#b45309',
    capLogoText: 'SM',
    capLogoColor: '#fde68a',
    jerseyBase: '#f8fafc',
    jerseyPiping: '#b45309',
    undershirt: '#1e293b',
    bgFrom: '#1e293b',
    bgTo: '#0f172a',
    accent: '#d97706',
  },
  FA: {
    key: 'FA',
    label: 'FA · 자유계약',
    capCrown: '#334155',
    capBrim: '#1e293b',
    capLogoText: 'KBO',
    capLogoColor: '#e2e8f0',
    jerseyBase: '#f1f5f9',
    jerseyPiping: '#475569',
    undershirt: '#334155',
    bgFrom: '#334155',
    bgTo: '#0f172a',
    accent: '#64748b',
  },
  RETIRED: {
    key: 'RETIRED',
    label: '은퇴 레전드',
    capCrown: '#292524',
    capBrim: '#78350f',
    capLogoText: '★',
    capLogoColor: '#fbbf24',
    jerseyBase: '#fafaf9',
    jerseyPiping: '#b45309',
    undershirt: '#292524',
    bgFrom: '#451a03',
    bgTo: '#0c0a09',
    accent: '#d97706',
  },
};

export interface LicensedRealPortraitEntry {
  url: string;
  credit: string;
  license: string;
}

/**
 * 사용 권한이 공식 확보된 실존 KBO 선수 프로필 사진 레지스트리
 * - 키: KBO 공식 ID(kboOfficialId) 또는 영구 ID(permanentId)
 * - 저작권·초상권 준수를 위해 무단 외부 크롤링 URL은 포함하지 않으며,
 *   공식 라이선스 에셋(public/portraits/kbo/*) 또는 에디터로 등록된 허가 이미지 URL만 적용합니다.
 */
export const LICENSED_REAL_PLAYER_PORTRAITS: Record<string, LicensedRealPortraitEntry> = {};

/**
 * 실존 선수의 사용 권한 확보된 공식 사진 URL 조회 (없으면 null 반환)
 */
export function resolveLicensedRealPlayerPhoto(player: Player): LicensedRealPortraitEntry | null {
  if (player.licensedPhotoUrl && player.licensedPhotoUrl.trim().length > 0) {
    return {
      url: player.licensedPhotoUrl.trim(),
      credit: '사용자 등록 공식 프로필',
      license: 'verified-custom',
    };
  }
  if (player.kboOfficialId && LICENSED_REAL_PLAYER_PORTRAITS[player.kboOfficialId]) {
    return LICENSED_REAL_PLAYER_PORTRAITS[player.kboOfficialId];
  }
  if (player.permanentId && LICENSED_REAL_PLAYER_PORTRAITS[player.permanentId]) {
    return LICENSED_REAL_PLAYER_PORTRAITS[player.permanentId];
  }
  return null;
}
