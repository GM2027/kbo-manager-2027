import { ClubInvestments, SponsorContract, TeamId } from '../types/kbo';

// 2026 KBO 10개 구단 초기 기본 운영 자금 (구단 규모·시장성 차별화, 단위: 억 원)
export const TEAM_STARTING_CASH_BILLION: Record<TeamId, number> = {
  LG: 195,
  삼성: 185,
  SSG: 180,
  KIA: 175,
  한화: 170,
  롯데: 170,
  두산: 160,
  KT: 150,
  NC: 138,
  키움: 118,
};

export const DEFAULT_INVESTMENTS: ClubInvestments = {
  stadiumLevel: 1,
  marketingLevel: 1,
  academyLevel: 1,
  medicalLevel: 1,
};

// 직접 선택 가능한 실제 한국 대표 기업 메인 스폰서 후보 풀
export const CORPORATE_SPONSORS: SponsorContract[] = [
  {
    id: 'sp-samsung',
    name: '삼성전자 (갤럭시)',
    industry: '전자 · 모바일',
    tier: '프리미엄',
    brandCode: 'GALAXY',
    brandColor: '#1428A0',
    brandAccent: '#38BDF8',
    signingBonusBillion: 32,
    perSeriesBonusBillion: 0.75,
    winBonusBillion: 0.14,
    attendanceBonusBillion: 0.45,
    merchBoostPct: 16,
    contractYears: 2,
    description: '최고 수준의 계약금과 시리즈 기본 후원금을 제공하는 글로벌 IT 파트너',
  },
  {
    id: 'sp-hyundai',
    name: '현대자동차',
    industry: '자동차 · 모빌리티',
    tier: '프리미엄',
    brandCode: 'HYUNDAI',
    brandColor: '#002C5F',
    brandAccent: '#60A5FA',
    signingBonusBillion: 30,
    perSeriesBonusBillion: 0.7,
    winBonusBillion: 0.16,
    attendanceBonusBillion: 0.4,
    merchBoostPct: 15,
    contractYears: 2,
    description: '승리 수당 비중이 높아 강팀 운용 시 시즌 누적 수익이 극대화되는 파트너',
  },
  {
    id: 'sp-lg',
    name: 'LG전자 (올레드)',
    industry: '가전 · 디스플레이',
    tier: '프리미엄',
    brandCode: 'LG',
    brandColor: '#A50034',
    brandAccent: '#FB7185',
    signingBonusBillion: 28,
    perSeriesBonusBillion: 0.72,
    winBonusBillion: 0.13,
    attendanceBonusBillion: 0.42,
    merchBoostPct: 18,
    contractYears: 2,
    description: '안정적인 시리즈 후원금과 유니폼·굿즈 팬덤 시너지가 뛰어난 기업',
  },
  {
    id: 'sp-hanwha',
    name: '한화생명 · 한화그룹',
    industry: '금융 · 방산 · 에너지',
    tier: '프리미엄',
    brandCode: 'HANWHA',
    brandColor: '#F37321',
    brandAccent: '#FBBF24',
    signingBonusBillion: 30,
    perSeriesBonusBillion: 0.68,
    winBonusBillion: 0.15,
    attendanceBonusBillion: 0.44,
    merchBoostPct: 15,
    contractYears: 2,
    description: '파격적인 초기 계약금과 홈 구장 팬 마케팅 지원이 강점인 대기업 스폰서',
  },
  {
    id: 'sp-shinsegae',
    name: '신세계그룹 (SSG닷컴)',
    industry: '유통 · 이커머스',
    tier: '메이저',
    brandCode: 'SSG',
    brandColor: '#CE0E2D',
    brandAccent: '#F59E0B',
    signingBonusBillion: 24,
    perSeriesBonusBillion: 0.6,
    winBonusBillion: 0.12,
    attendanceBonusBillion: 0.38,
    merchBoostPct: 24,
    contractYears: 2,
    description: '유통망 연계를 통해 유니폼·MD 상품 판매 매출 +24% 보너스를 제공',
  },
  {
    id: 'sp-lotte',
    name: '롯데웰푸드 · 롯데온',
    industry: '식품 · 유통',
    tier: '메이저',
    brandCode: 'LOTTE',
    brandColor: '#C8102E',
    brandAccent: '#93C5FD',
    signingBonusBillion: 23,
    perSeriesBonusBillion: 0.62,
    winBonusBillion: 0.12,
    attendanceBonusBillion: 0.5,
    merchBoostPct: 20,
    contractYears: 2,
    description: '관중 보너스(+0.5억)와 유니폼 판매 촉진 프로모션에 특화된 스폰서',
  },
  {
    id: 'sp-kia',
    name: '기아 (KIA EV)',
    industry: '모빌리티',
    tier: '메이저',
    brandCode: 'KIA',
    brandColor: '#05141F',
    brandAccent: '#EF4444',
    signingBonusBillion: 25,
    perSeriesBonusBillion: 0.64,
    winBonusBillion: 0.14,
    attendanceBonusBillion: 0.36,
    merchBoostPct: 16,
    contractYears: 2,
    description: '균형 잡힌 계약금·시리즈 후원·승리 인센티브를 제공하는 모빌리티 파트너',
  },
  {
    id: 'sp-skt',
    name: 'SK텔레콤 (T우주)',
    industry: '통신 · 디지털 플랫폼',
    tier: '메이저',
    brandCode: 'SKT',
    brandColor: '#EA002C',
    brandAccent: '#FB923C',
    signingBonusBillion: 25,
    perSeriesBonusBillion: 0.65,
    winBonusBillion: 0.13,
    attendanceBonusBillion: 0.35,
    merchBoostPct: 14,
    contractYears: 2,
    description: '구장 미디어·구독 멤버십과 연동한 안정적 현금 흐름 지원',
  },
  {
    id: 'sp-kt',
    name: 'KT (5G · 지니)',
    industry: '통신 · 미디어',
    tier: '메이저',
    brandCode: 'KT',
    brandColor: '#18181B',
    brandAccent: '#E11D48',
    signingBonusBillion: 22,
    perSeriesBonusBillion: 0.6,
    winBonusBillion: 0.12,
    attendanceBonusBillion: 0.32,
    merchBoostPct: 14,
    contractYears: 1,
    description: '안정적인 경기장 중계·마케팅 파트너십 제공',
  },
  {
    id: 'sp-doosan',
    name: '두산에너빌리티',
    industry: '에너지 · 중공업',
    tier: '메이저',
    brandCode: 'DOOSAN',
    brandColor: '#005EB8',
    brandAccent: '#38BDF8',
    signingBonusBillion: 22,
    perSeriesBonusBillion: 0.62,
    winBonusBillion: 0.11,
    attendanceBonusBillion: 0.32,
    merchBoostPct: 12,
    contractYears: 2,
    description: '견실한 시리즈별 고정 후원금이 강점인 B2B 기업 파트너',
  },
  {
    id: 'sp-kb',
    name: 'KB국민은행',
    industry: '금융 · 은행',
    tier: '메이저',
    brandCode: 'KB',
    brandColor: '#6E5A3E',
    brandAccent: '#FACC15',
    signingBonusBillion: 26,
    perSeriesBonusBillion: 0.68,
    winBonusBillion: 0.1,
    attendanceBonusBillion: 0.34,
    merchBoostPct: 12,
    contractYears: 2,
    description: '고정 후원금 비중이 높아 리빌딩 시즌에도 재정 안정성을 보장',
  },
  {
    id: 'sp-naver',
    name: '네이버 (NAVER 스포츠)',
    industry: '플랫폼 · IT',
    tier: '메이저',
    brandCode: 'NAVER',
    brandColor: '#03C75A',
    brandAccent: '#A7F3D0',
    signingBonusBillion: 21,
    perSeriesBonusBillion: 0.56,
    winBonusBillion: 0.13,
    attendanceBonusBillion: 0.36,
    merchBoostPct: 22,
    contractYears: 1,
    description: '온라인 팬 유입과 온라인 유니폼 스토어 매출을 크게 끌어올리는 플랫폼 파트너',
  },
  {
    id: 'sp-coupang',
    name: '쿠팡 (로켓배송)',
    industry: '이커머스',
    tier: '메이저',
    brandCode: 'CPNG',
    brandColor: '#0074E9',
    brandAccent: '#F43F5E',
    signingBonusBillion: 20,
    perSeriesBonusBillion: 0.55,
    winBonusBillion: 0.12,
    attendanceBonusBillion: 0.35,
    merchBoostPct: 26,
    contractYears: 1,
    description: '유니폼·MD 판매 보너스 +26%로 팬 상품 매출 극대화에 최적화',
  },
  {
    id: 'sp-ncsoft',
    name: '엔씨소프트 (NCSOFT)',
    industry: '게임 · 엔터테인먼트',
    tier: '스탠다드',
    brandCode: 'NC',
    brandColor: '#1E3A8A',
    brandAccent: '#C5A059',
    signingBonusBillion: 18,
    perSeriesBonusBillion: 0.5,
    winBonusBillion: 0.12,
    attendanceBonusBillion: 0.28,
    merchBoostPct: 16,
    contractYears: 1,
    description: '젊은 팬층 타겟 콜라보 유니폼 프로모션 지원',
  },
  {
    id: 'sp-kiwoom',
    name: '키움증권 (영웅문)',
    industry: '증권 · 핀테크',
    tier: '스탠다드',
    brandCode: 'KIWOOM',
    brandColor: '#7A0026',
    brandAccent: '#EC4899',
    signingBonusBillion: 17,
    perSeriesBonusBillion: 0.48,
    winBonusBillion: 0.14,
    attendanceBonusBillion: 0.28,
    merchBoostPct: 12,
    contractYears: 1,
    description: '실속 있는 운영 자금과 높은 승리 인센티브 제공',
  },
  {
    id: 'sp-koreanair',
    name: '대한항공',
    industry: '항공 · 물류',
    tier: '프리미엄',
    brandCode: 'KE',
    brandColor: '#00256C',
    brandAccent: '#38BDF8',
    signingBonusBillion: 27,
    perSeriesBonusBillion: 0.66,
    winBonusBillion: 0.13,
    attendanceBonusBillion: 0.42,
    merchBoostPct: 15,
    contractYears: 2,
    description: '원정 이동 지원과 프리미엄 브랜드 스폰서십 제공',
  },
];

export interface TeamSponsorChoice extends SponsorContract {
  strategyLabel: string;
  fitReason: string;
  recommended: boolean;
}

const TEAM_SPONSOR_CURATIONS: Record<
  TeamId,
  { sponsorId: string; strategyLabel: string; fitReason: string; recommended: boolean }[]
> = {
  LG: [
    {
      sponsorId: 'sp-lg',
      strategyLabel: '모기업 · 잠실 빅마켓 시너지',
      fitReason: '잠실 최대 관중 동원력과 LG전자 MD 시너지(+18%)로 안정 수익 극대화',
      recommended: true,
    },
    {
      sponsorId: 'sp-hyundai',
      strategyLabel: '우승권 승리수당 집중형',
      fitReason: '디펜딩 챔피언 전력으로 1승당 +0.16억 보너스를 극대화하는 공격형 계약',
      recommended: false,
    },
    {
      sponsorId: 'sp-koreanair',
      strategyLabel: '프리미엄 글로벌 브랜드형',
      fitReason: '높은 관중 보너스(+0.42억)와 균형 잡힌 고정 후원금 제공',
      recommended: false,
    },
  ],
  한화: [
    {
      sponsorId: 'sp-hanwha',
      strategyLabel: '모기업 · 신구장 팬덤 시너지',
      fitReason: '대전 신구장 흥행과 한화그룹 계약금 +30억·관중보너스 +0.44억 최적 조합',
      recommended: true,
    },
    {
      sponsorId: 'sp-coupang',
      strategyLabel: '유니폼·MD 폭발 성장형',
      fitReason: '높은 전국 팬덤을 바탕으로 유니폼 매출 +26% 보너스 극대화',
      recommended: false,
    },
    {
      sponsorId: 'sp-kb',
      strategyLabel: '장기 육성 재정 안정형',
      fitReason: '높은 시리즈 고정 후원금(0.68억)으로 안정적 현금흐름 확보',
      recommended: false,
    },
  ],
  SSG: [
    {
      sponsorId: 'sp-shinsegae',
      strategyLabel: '모기업 · 유통 MD 특화형',
      fitReason: '인천 구장·유통망 연계로 유니폼·굿즈 매출 +24% 극대화',
      recommended: true,
    },
    {
      sponsorId: 'sp-koreanair',
      strategyLabel: '인천 공항 거점 파트너십',
      fitReason: '인천 연고지 시너지와 높은 계약금(+27억)·시리즈 고정 수익 제공',
      recommended: false,
    },
    {
      sponsorId: 'sp-skt',
      strategyLabel: '통신·미디어 멤버십형',
      fitReason: '안정적인 시리즈 후원(0.65억)과 승리 인센티브 균형 설계',
      recommended: false,
    },
  ],
  삼성: [
    {
      sponsorId: 'sp-samsung',
      strategyLabel: '모기업 · 최상위 글로벌 후원',
      fitReason: '리그 최고 계약금(+32억)과 대구 라팍 매진 관중보너스(+0.45억) 완비',
      recommended: true,
    },
    {
      sponsorId: 'sp-hyundai',
      strategyLabel: '강타선 승리 인센티브형',
      fitReason: '상위권 다승 페이스로 경기당 승리 수당(+0.16억) 극대화',
      recommended: false,
    },
    {
      sponsorId: 'sp-coupang',
      strategyLabel: '대구 팬덤 굿즈 확장형',
      fitReason: '최상위 관중 규모에 유니폼 판매 +26% 시너지 적용',
      recommended: false,
    },
  ],
  NC: [
    {
      sponsorId: 'sp-ncsoft',
      strategyLabel: '모기업 · 젊은 팬덤 콜라보',
      fitReason: '구단 정체성에 맞춘 1년 유연 계약 및 콜라보 MD 프로모션(+16%)',
      recommended: false,
    },
    {
      sponsorId: 'sp-kb',
      strategyLabel: '재정 안정 · 고정수익 우선형',
      fitReason: '중소마켓 운영비를 안정적으로 상쇄하는 계약금 +26억·시리즈 +0.68억',
      recommended: true,
    },
    {
      sponsorId: 'sp-naver',
      strategyLabel: '디지털 팬 유입 확장형',
      fitReason: '온라인 스토어 MD 매출 +22%로 창원 외 전국 팬 매출 강화',
      recommended: false,
    },
  ],
  KT: [
    {
      sponsorId: 'sp-kt',
      strategyLabel: '모기업 · 수원 미디어 파트너',
      fitReason: 'KT 5G·구장 중계 연계 1년 단기 유연 계약으로 재협상 여지 확보',
      recommended: false,
    },
    {
      sponsorId: 'sp-skt',
      strategyLabel: '프리미엄 통신 확장형',
      fitReason: '더 높은 2년 계약금(+25억)과 시리즈 후원(0.65억)으로 즉시 전력 보강 지원',
      recommended: true,
    },
    {
      sponsorId: 'sp-naver',
      strategyLabel: '수도권 온라인 MD 성장형',
      fitReason: '수도권 젊은 팬층 겨냥 유니폼 판매 보너스 +22% 확보',
      recommended: false,
    },
  ],
  롯데: [
    {
      sponsorId: 'sp-lotte',
      strategyLabel: '모기업 · 사직 만원관중 특화',
      fitReason: '리그 최고 관중보너스(+0.50억)와 사직 열기·MD(+20%) 완벽 조화',
      recommended: true,
    },
    {
      sponsorId: 'sp-coupang',
      strategyLabel: '전국구 팬덤 유니폼 극대화',
      fitReason: '최상위 유니폼 판매량에 +26% MD 보너스를 더해 폭발적 매출 창출',
      recommended: false,
    },
    {
      sponsorId: 'sp-koreanair',
      strategyLabel: '부산 원정 지원 프리미엄형',
      fitReason: '높은 초기 계약금(+27억)과 관중보너스(+0.42억) 동시 확보',
      recommended: false,
    },
  ],
  KIA: [
    {
      sponsorId: 'sp-kia',
      strategyLabel: '모기업 · 챔피언스필드 시너지',
      fitReason: '광주 팬덤과 모빌리티 브랜드의 균형 잡힌 2년(+25억·승리+0.14억) 계약',
      recommended: false,
    },
    {
      sponsorId: 'sp-hyundai',
      strategyLabel: '현대차그룹 통합 프리미엄형',
      fitReason: '그룹 시너지 최대화 · 계약금 +30억·승리보너스 +0.16억 최고 조건',
      recommended: true,
    },
    {
      sponsorId: 'sp-coupang',
      strategyLabel: '전국 팬덤 MD 판매 집중형',
      fitReason: '전국 최고 인기 구단 강점을 살린 유니폼·MD 매출 +26% 극대화',
      recommended: false,
    },
  ],
  두산: [
    {
      sponsorId: 'sp-doosan',
      strategyLabel: '모기업 · 잠실 고정수익형',
      fitReason: '견실한 시리즈 고정 후원금(0.62억)으로 안정적인 2년 운영 기반 확보',
      recommended: false,
    },
    {
      sponsorId: 'sp-kb',
      strategyLabel: '잠실 리빌딩 현금확보형',
      fitReason: '초기 계약금 +26억과 고정 후원금(0.68억)으로 FA·시설 투자 여력 극대화',
      recommended: true,
    },
    {
      sponsorId: 'sp-naver',
      strategyLabel: '서울 팬덤 온라인 MD형',
      fitReason: '잠실 인기 구단의 온라인 굿즈 매출 +22% 극대화 전략',
      recommended: false,
    },
  ],
  키움: [
    {
      sponsorId: 'sp-kiwoom',
      strategyLabel: '네이밍 파트너 · 고효율 승리형',
      fitReason: '구단 네이밍 정체성과 높은 승리 수당(+0.14억) 기반의 실속형 1년 계약',
      recommended: false,
    },
    {
      sponsorId: 'sp-kb',
      strategyLabel: '저예산 구단 재정안정 특화',
      fitReason: '고척 스몰마켓에서 계약금 +26억·시리즈 +0.68억으로 가장 확실한 흑자 보장',
      recommended: true,
    },
    {
      sponsorId: 'sp-naver',
      strategyLabel: '젊은 육성팀 디지털 MD형',
      fitReason: '온라인 팬층 확장과 유니폼 매출 +22%로 추가 운영 자금 창출',
      recommended: false,
    },
  ],
};

export function getTeamSponsorChoices(teamId: TeamId): TeamSponsorChoice[] {
  const list = TEAM_SPONSOR_CURATIONS[teamId] ?? TEAM_SPONSOR_CURATIONS.LG;
  return list
    .map((entry) => {
      const sponsor = CORPORATE_SPONSORS.find((s) => s.id === entry.sponsorId);
      if (!sponsor) return null;
      return {
        ...sponsor,
        strategyLabel: entry.strategyLabel,
        fitReason: entry.fitReason,
        recommended: entry.recommended,
      };
    })
    .filter((x): x is TeamSponsorChoice => Boolean(x));
}

export interface FacilityUpgradeDef {
  key: keyof ClubInvestments;
  name: string;
  shortDesc: string;
  effectPerLevel: string;
  costsByNextLevel: Record<number, number>; // nextLevel (2..5) -> cost in 억 KRW
}

export const FACILITY_UPGRADES: FacilityUpgradeDef[] = [
  {
    key: 'stadiumLevel',
    name: '홈 구장 VIP석 · 관중 편의시설 증축',
    shortDesc: '구장 좌석 등급 및 매점·VIP 존 확장으로 홈 경기 티켓 객단가와 관중 동원력을 높입니다.',
    effectPerLevel: '레벨당 홈 티켓 수입 +10% · 인기도 상승',
    costsByNextLevel: { 2: 12, 3: 18, 4: 26, 5: 36 },
  },
  {
    key: 'marketingLevel',
    name: '유니폼 MD 플래그십 · 팬 마케팅',
    shortDesc: '온·오프라인 유니폼 커스텀 샵과 팬 이벤트를 확대해 상품 매출을 키웁니다.',
    effectPerLevel: '레벨당 유니폼·MD 판매 수익 +18% · 인기도 +4',
    costsByNextLevel: { 2: 10, 3: 15, 4: 22, 5: 30 },
  },
  {
    key: 'academyLevel',
    name: '2군 퓨처스 아카데미 · 바이오메카닉스랩',
    shortDesc: '최신 투구·타격 트래킹 장비를 도입해 10경기 성장 평가 시 유망주 성장 확률을 높입니다.',
    effectPerLevel: '레벨당 10경기 성장 평가 보너스 +0.25',
    costsByNextLevel: { 2: 12, 3: 18, 4: 25, 5: 35 },
  },
  {
    key: 'medicalLevel',
    name: '메디컬 · 스포츠 사이언스 재활센터',
    shortDesc: '전담 재활·컨디셔닝 시스템을 구축해 경기 중 부상 위험을 줄이고 피로 회복을 앞당깁니다.',
    effectPerLevel: '레벨당 부상률 감소 · 일일 피로 회복량 +3',
    costsByNextLevel: { 2: 10, 3: 16, 4: 24, 5: 34 },
  },
];

export interface OneTimeSpendDef {
  id:
    | 'CAMP'
    | 'BONUS'
    | 'SCOUT'
    | 'ANALYTICS'
    | 'FAN_FEST'
    | 'REHAB_LAB'
    | 'BATTING_CLINIC'
    | 'PITCH_LAB'
    | 'BRAND_CAMPAIGN';
  name: string;
  costBillion: number;
  effectSummary: string;
}

export const ONE_TIME_SPEND_OPTIONS: OneTimeSpendDef[] = [
  {
    id: 'CAMP',
    name: '유망주·주전 집중 특훈 캠프 개최',
    costBillion: 8,
    effectSummary: '만 25세 이하 선수 컨디션 +2 및 전원 피로도 -15 회복',
  },
  {
    id: 'BONUS',
    name: '선수단 사기 진작 격려금 지급',
    costBillion: 5,
    effectSummary: '팀 분위기 [좋음], 구단 인기도 +3, 1군 선수 사기 [만족] 및 컨디션 +1',
  },
  {
    id: 'SCOUT',
    name: '국내외 스카우팅 네트워크 확장',
    costBillion: 10,
    effectSummary: '구단 인기도 +4 및 드래프트 상위 유망주 10명 정밀 스카우팅 자동 해금',
  },
  {
    id: 'ANALYTICS',
    name: '세이버메트릭스 전력분석실 고도화',
    costBillion: 9,
    effectSummary: '1군 핵심 주전 5명 컨디션 +2 및 외국인 선수 KBO 적응도 +12 상승',
  },
  {
    id: 'FAN_FEST',
    name: '홈 구장 팬 감사 페스티벌 · 사인회',
    costBillion: 6,
    effectSummary: '팬 여론 +12, 구단 인기도 +6, 향후 홈 관중 동원력 강화',
  },
  {
    id: 'REHAB_LAB',
    name: '집중 컨디셔닝 · 재활 클리닉 운영',
    costBillion: 7,
    effectSummary: '전 선수 피로도 -20 회복 및 현재 부상자 복귀 기간 -4일 단축',
  },
  {
    id: 'BATTING_CLINIC',
    name: '타격 메커니즘 바이오 클리닉 초빙',
    costBillion: 8,
    effectSummary: '1군 타자 전원 컨디션 +1 및 타격 훈련 유망주 능력치 +1 보너스',
  },
  {
    id: 'PITCH_LAB',
    name: '투구 트래킹 · 피칭 디자인 특강',
    costBillion: 8,
    effectSummary: '1군 투수 전원 피로도 -12 · 컨디션 +1 및 젊은 투수 구위 보강',
  },
  {
    id: 'BRAND_CAMPAIGN',
    name: '연고지 구단 브랜드 · 굿즈 프로모션',
    costBillion: 7,
    effectSummary: '구단 인기도 +5, 팬 여론 +8, 스폰서·구단주 신뢰도 +4 상승',
  },
];

export const DEFAULT_ACTIVE_SPEND_IDS: OneTimeSpendDef['id'][] = ['CAMP', 'BONUS', 'SCOUT'];

export function getActiveOneTimeSpendOptions(activeIds?: string[]): OneTimeSpendDef[] {
  const ids = activeIds && activeIds.length === 3 ? activeIds : DEFAULT_ACTIVE_SPEND_IDS;
  const resolved = ids
    .map((id) => ONE_TIME_SPEND_OPTIONS.find((o) => o.id === id))
    .filter((x): x is OneTimeSpendDef => Boolean(x));
  return resolved.length > 0 ? resolved : ONE_TIME_SPEND_OPTIONS.slice(0, 3);
}

export const TICKET_PRICE_CONFIG: Record<
  '저가' | '표준' | '프리미엄',
  { priceMult: number; attendanceMult: number; sentimentDelta: number; label: string; desc: string }
> = {
  저가: {
    priceMult: 0.84,
    attendanceMult: 1.16,
    sentimentDelta: 2,
    label: '저가 정책 (-16%)',
    desc: '관중 동원 +16% · 팬 여론 호전',
  },
  표준: {
    priceMult: 1.0,
    attendanceMult: 1.0,
    sentimentDelta: 0,
    label: '표준 정책 (기본)',
    desc: '티켓 단가와 관중 점유율 균형',
  },
  프리미엄: {
    priceMult: 1.24,
    attendanceMult: 0.86,
    sentimentDelta: -2,
    label: '프리미엄 (+24%)',
    desc: '객단가 극대화 · 팬 여론 소폭 부담',
  },
};

export const KBO_RIVALRIES: { pair: [TeamId, TeamId]; name: string }[] = [
  { pair: ['LG', '두산'], name: '잠실 더비' },
  { pair: ['삼성', '롯데'], name: '클래식 시리즈' },
  { pair: ['KIA', '삼성'], name: '달빛 시리즈' },
  { pair: ['한화', 'LG'], name: '한국시리즈 리턴매치' },
  { pair: ['NC', '롯데'], name: '낙동강 더비' },
  { pair: ['SSG', '롯데'], name: '유통 라이벌전' },
  { pair: ['LG', '키움'], name: '엘키라시코' },
  { pair: ['KIA', 'LG'], name: '호랑이·쌍둥이 클래식' },
  { pair: ['SSG', '키움'], name: '가을야구 인연 매치' },
  { pair: ['KT', 'SSG'], name: '수도권 서해안 더비' },
  { pair: ['한화', 'KIA'], name: '충청·호남 화력전' },
  { pair: ['KT', 'LG'], name: '수도권 강호 매치' },
  { pair: ['두산', '키움'], name: '서울 잠실·고척 더비' },
  { pair: ['한화', '두산'], name: '독수리·곰 대전' },
  { pair: ['삼성', 'NC'], name: '영남 내륙 더비' },
  { pair: ['NC', 'KIA'], name: '남부 강타선 매치' },
  { pair: ['KT', '삼성'], name: '수원·대구 명승부 매치' },
];

export function getRivalryName(a: TeamId, b: TeamId): string | null {
  const hit = KBO_RIVALRIES.find(
    (r) => (r.pair[0] === a && r.pair[1] === b) || (r.pair[0] === b && r.pair[1] === a)
  );
  return hit ? hit.name : null;
}
