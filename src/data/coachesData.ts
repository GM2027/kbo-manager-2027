import { CareerSave, Coach, CoachRole, CoachSubRatings, TeamId } from '../types/kbo';
import { TEAM_IDS } from './kboTeams';

export const COACH_ROLES: CoachRole[] = [
  '감독',
  '수석코치',
  '투수코치',
  '타격코치',
  '배터리코치',
  '수비코치',
];

export interface CoachRoleMeta {
  role: CoachRole;
  duties: string;
  impactNote: string;
  subRatingDefs: { key: keyof CoachSubRatings; label: string }[];
}

export const COACH_ROLE_METADATA: Record<CoachRole, CoachRoleMeta> = {
  감독: {
    role: '감독',
    duties: '라인업·투수 교체·경기 전술, 경기 운영·선수 활용',
    impactNote: '승부처 작전 성공률, 불펜 교체 타이밍, 팀 분위기 및 선수단 활용도 상승',
    subRatingDefs: [
      { key: 'tactics', label: '경기 전술' },
      { key: 'lineupMgmt', label: '라인업·선수활용' },
      { key: 'pitchingChange', label: '투수교체·불펜' },
      { key: 'leadership', label: '경기운영·리더십' },
    ],
  },
  수석코치: {
    role: '수석코치',
    duties: '감독 보좌, 선수단 관리, 코칭스태프 조율 (계약·트레이드는 단장 전권)',
    impactNote: '선수 불만 선행 면담·보고, 선수 불만도 및 팀 분위기 소폭 안정화, 감독 공석 시 대행·차기 감독 후보',
    subRatingDefs: [
      { key: 'leadership', label: '리더십' },
      { key: 'playerManagement', label: '선수 관리' },
      { key: 'tacticalUnderstanding', label: '전술 이해도' },
    ],
  },
  투수코치: {
    role: '투수코치',
    duties: '구위·제구·구종 지도, 투수 성장·컨디션 관리',
    impactNote: '투수진 탈삼진·제구력 보정, 투수 유망주 성장 가속 및 피로·컨디션 회복 강화',
    subRatingDefs: [
      { key: 'stuffCoaching', label: '구위 지도' },
      { key: 'controlCoaching', label: '제구·구종 지도' },
      { key: 'development', label: '투수 성장' },
      { key: 'conditionMgmt', label: '컨디션 관리' },
    ],
  },
  타격코치: {
    role: '타격코치',
    duties: '컨택·장타·선구안 지도, 타자 성장·슬럼프 관리',
    impactNote: '팀 타율·장타율·출루율 보정, 타자 성장 가속 및 슬럼프 타자 빠른 반등',
    subRatingDefs: [
      { key: 'contactCoaching', label: '컨택 지도' },
      { key: 'powerCoaching', label: '장타 지도' },
      { key: 'eyeCoaching', label: '선구안 지도' },
      { key: 'slumpCare', label: '성장·슬럼프 관리' },
    ],
  },
  배터리코치: {
    role: '배터리코치',
    duties: '포수 프레이밍·볼배합·도루저지·투포수 호흡 지도',
    impactNote: '상대 득점 억제, 투수진 제구 안정화 및 포수진 수비·볼배합 시너지',
    subRatingDefs: [
      { key: 'framing', label: '프레이밍·볼배합' },
      { key: 'pitchCalling', label: '투수 리드' },
      { key: 'catcherDefense', label: '도루저지·블로킹' },
      { key: 'chemistry', label: '배터리 호흡' },
    ],
  },
  수비코치: {
    role: '수비코치',
    duties: '내야·외야 수비 범위·실책 억제·주루 및 중계 플레이 지도',
    impactNote: '인플레이 타구 실점 억제, 실책 감소 및 기동력·주루 플레이 효율 강화',
    subRatingDefs: [
      { key: 'infieldDefense', label: '내야 수비' },
      { key: 'outfieldDefense', label: '외야 수비' },
      { key: 'errorReduction', label: '실책 억제' },
      { key: 'baseRunning', label: '주루·중계' },
    ],
  },
};

export interface CoachSeed {
  role: CoachRole;
  name: string;
  ability: number;
  contractYears: number;
  annualSalaryBillion: number;
  signingBonusBillion: number;
  careerNote: string;
  nationality?: string;
  isVirtual?: boolean;
  subOverrides?: Partial<CoachSubRatings>;
}

// 2026 KBO 10개 구단 실제 감독·투수코치·타격코치 명단
export const REAL_2026_TEAM_COACHES: Record<TeamId, CoachSeed[]> = {
  LG: [
    {
      role: '감독',
      name: '염경엽',
      ability: 87,
      contractYears: 3,
      annualSalaryBillion: 5,
      signingBonusBillion: 3,
      careerNote: 'LG 트윈스 통합 우승 사령탑 · 2026 현직 감독',
    },
    {
      role: '수석코치',
      name: '김정준',
      ability: 84,
      contractYears: 2,
      annualSalaryBillion: 2.0,
      signingBonusBillion: 0.6,
      careerNote: 'LG 1군 수석코치 · 데이터 분석·작전 보좌 및 선수단 조율 전문가',
    },
    {
      role: '투수코치',
      name: '장진용',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.5,
      careerNote: 'LG 1군 투수코치',
    },
    {
      role: '타격코치',
      name: '송지만',
      ability: 80,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.5,
      careerNote: 'LG 1군 타격코치',
    },
    {
      role: '배터리코치',
      name: '박경완',
      ability: 85,
      contractYears: 2,
      annualSalaryBillion: 1.6,
      signingBonusBillion: 0.5,
      careerNote: 'LG 1군 배터리코치 (KBO 레전드 포수 · 볼배합/프레이밍 최고 권위)',
    },
    {
      role: '수비코치',
      name: '김일경',
      ability: 80,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.4,
      careerNote: 'LG 1군 수비코치 (내야 시프트·실책 최소화 전문가)',
    },
  ],
  한화: [
    {
      role: '감독',
      name: '김경문',
      ability: 84,
      contractYears: 3,
      annualSalaryBillion: 5,
      signingBonusBillion: 2,
      careerNote: '2026 한화 이글스 감독 (두산·NC 감독 및 국가대표 감독 역임)',
    },
    {
      role: '수석코치',
      name: '양승관',
      ability: 82,
      contractYears: 2,
      annualSalaryBillion: 1.9,
      signingBonusBillion: 0.5,
      careerNote: '한화 1군 수석코치 · 김경문 감독 핵심 참모 및 코칭스태프·선수단 조율',
    },
    {
      role: '투수코치',
      name: '양상문',
      ability: 82,
      contractYears: 2,
      annualSalaryBillion: 2,
      signingBonusBillion: 1,
      careerNote: '한화 1군 투수코치 (LG·롯데 감독 역임)',
    },
    {
      role: '타격코치',
      name: '김민호',
      ability: 78,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.5,
      careerNote: '2026 한화 이글스 1군 타격코치',
    },
    {
      role: '배터리코치',
      name: '김정민',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.4,
      careerNote: '한화 1군 배터리코치 (젊은 포수진 볼배합·블로킹 육성)',
    },
    {
      role: '수비코치',
      name: '김우석',
      ability: 78,
      contractYears: 2,
      annualSalaryBillion: 1.2,
      signingBonusBillion: 0.3,
      careerNote: '한화 1군 수비코치 (내야 수비 기본기·중계 플레이 강화)',
    },
  ],
  SSG: [
    {
      role: '감독',
      name: '이숭용',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 3.5,
      signingBonusBillion: 1,
      careerNote: '2026 SSG 랜더스 감독',
    },
    {
      role: '수석코치',
      name: '조원우',
      ability: 81,
      contractYears: 2,
      annualSalaryBillion: 1.8,
      signingBonusBillion: 0.5,
      careerNote: 'SSG 1군 수석코치 · 전 롯데 감독 출신 베테랑 야전 참모',
    },
    {
      role: '투수코치',
      name: '경헌호',
      ability: 81,
      contractYears: 2,
      annualSalaryBillion: 1.8,
      signingBonusBillion: 0.5,
      careerNote: 'SSG 1군 투수 총괄코치',
    },
    {
      role: '타격코치',
      name: '임훈',
      ability: 77,
      contractYears: 2,
      annualSalaryBillion: 1.4,
      signingBonusBillion: 0.5,
      careerNote: 'SSG 1군 메인 타격코치',
    },
    {
      role: '배터리코치',
      name: '세리자와 유지',
      ability: 84,
      contractYears: 2,
      annualSalaryBillion: 1.8,
      signingBonusBillion: 0.5,
      nationality: '일본',
      careerNote: 'SSG 1군 배터리코치 (일본 NPB·KBO 다수 구단 포수 육성 명장)',
    },
    {
      role: '수비코치',
      name: '손시헌',
      ability: 81,
      contractYears: 2,
      annualSalaryBillion: 1.4,
      signingBonusBillion: 0.4,
      careerNote: 'SSG 1군 수비코치 (골든글러브 유격수 출신 내야 수비 전문가)',
    },
  ],
  삼성: [
    {
      role: '감독',
      name: '박진만',
      ability: 82,
      contractYears: 3,
      annualSalaryBillion: 4,
      signingBonusBillion: 1.5,
      careerNote: '2026 삼성 라이온즈 감독',
    },
    {
      role: '수석코치',
      name: '정대현',
      ability: 81,
      contractYears: 2,
      annualSalaryBillion: 1.8,
      signingBonusBillion: 0.5,
      careerNote: '삼성 1군 수석코치 · 선수단 소통과 코칭스태프 가교 역할',
    },
    {
      role: '투수코치',
      name: '최일언',
      ability: 83,
      contractYears: 2,
      annualSalaryBillion: 2,
      signingBonusBillion: 0.5,
      careerNote: '삼성 1군 수석·메인 투수코치',
    },
    {
      role: '타격코치',
      name: '박한이',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.5,
      careerNote: '삼성 1군 타격코치 (구단 레전드 외야수 출신)',
    },
    {
      role: '배터리코치',
      name: '채상병',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.3,
      careerNote: '삼성 1군 배터리코치 (베테랑·신예 포수 호흡 관리)',
    },
    {
      role: '수비코치',
      name: '손주인',
      ability: 80,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.4,
      careerNote: '삼성 1군 수비코치 (내야 안정성·더블플레이 완성도 지도)',
    },
  ],
  NC: [
    {
      role: '감독',
      name: '이호준',
      ability: 79,
      contractYears: 3,
      annualSalaryBillion: 3,
      signingBonusBillion: 1,
      careerNote: '2026 NC 다이노스 감독',
    },
    {
      role: '수석코치',
      name: '서재응',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.6,
      signingBonusBillion: 0.4,
      careerNote: 'NC 1군 수석코치 · 빅리그·대표팀 경험 기반 선수 관리·분위기 조율',
    },
    {
      role: '투수코치',
      name: '이용훈',
      ability: 78,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.5,
      careerNote: 'NC 1군 투수코치',
    },
    {
      role: '타격코치',
      name: '전민수',
      ability: 76,
      contractYears: 2,
      annualSalaryBillion: 1.4,
      signingBonusBillion: 0.4,
      careerNote: 'NC 1군 타격코치',
    },
    {
      role: '배터리코치',
      name: '윤수강',
      ability: 78,
      contractYears: 2,
      annualSalaryBillion: 1.2,
      signingBonusBillion: 0.3,
      careerNote: 'NC 1군 배터리코치 (김형준 포수 성장·볼배합 데이터 지도)',
    },
    {
      role: '수비코치',
      name: '진종길',
      ability: 78,
      contractYears: 2,
      annualSalaryBillion: 1.2,
      signingBonusBillion: 0.3,
      careerNote: 'NC 1군 수비·주루 코치',
    },
  ],
  KT: [
    {
      role: '감독',
      name: '이강철',
      ability: 86,
      contractYears: 3,
      annualSalaryBillion: 5,
      signingBonusBillion: 2,
      careerNote: '2026 KT 위즈 감독 · 2021 통합 우승 사령탑',
    },
    {
      role: '수석코치',
      name: '김태한',
      ability: 82,
      contractYears: 2,
      annualSalaryBillion: 1.9,
      signingBonusBillion: 0.5,
      careerNote: 'KT 1군 수석코치 · 이강철 감독 보좌 및 투타 코칭스태프 총괄 조율',
    },
    {
      role: '투수코치',
      name: '제춘모',
      ability: 80,
      contractYears: 2,
      annualSalaryBillion: 1.6,
      signingBonusBillion: 0.5,
      careerNote: 'KT 1군 투수코치',
    },
    {
      role: '타격코치',
      name: '유한준',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.5,
      careerNote: 'KT 1군 타격코치',
    },
    {
      role: '배터리코치',
      name: '최기문',
      ability: 80,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.4,
      careerNote: 'KT 1군 배터리코치 (국가대표 포수 출신 투수 리드 전문가)',
    },
    {
      role: '수비코치',
      name: '박기혁',
      ability: 81,
      contractYears: 2,
      annualSalaryBillion: 1.4,
      signingBonusBillion: 0.4,
      careerNote: 'KT 1군 수비코치 (안정적 유격·키스톤 수비 조직력 구축)',
    },
  ],
  롯데: [
    {
      role: '감독',
      name: '김태형',
      ability: 85,
      contractYears: 3,
      annualSalaryBillion: 6,
      signingBonusBillion: 3,
      careerNote: '2026 롯데 자이언츠 감독 · 한국시리즈 3회 우승',
    },
    {
      role: '수석코치',
      name: '강석천',
      ability: 80,
      contractYears: 2,
      annualSalaryBillion: 1.7,
      signingBonusBillion: 0.4,
      careerNote: '롯데 1군 수석코치 · 김태형 감독 보좌 및 선수단 기강·소통 관리',
    },
    {
      role: '투수코치',
      name: '김상진',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.6,
      signingBonusBillion: 0.5,
      careerNote: '롯데 1군 메인 투수코치',
    },
    {
      role: '타격코치',
      name: '이병규',
      ability: 80,
      contractYears: 2,
      annualSalaryBillion: 1.6,
      signingBonusBillion: 0.5,
      careerNote: '롯데 1군 타격코치',
    },
    {
      role: '배터리코치',
      name: '정상호',
      ability: 78,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.3,
      careerNote: '롯데 1군 배터리코치 (강한 송구·도루저지 지도)',
    },
    {
      role: '수비코치',
      name: '문규현',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.4,
      careerNote: '롯데 1군 수비코치 (내야 수비 안정화 담당)',
    },
  ],
  KIA: [
    {
      role: '감독',
      name: '이범호',
      ability: 84,
      contractYears: 3,
      annualSalaryBillion: 4.5,
      signingBonusBillion: 2,
      careerNote: '2026 KIA 타이거즈 감독 · 2024 통합 우승 사령탑',
    },
    {
      role: '수석코치',
      name: '진갑용',
      ability: 82,
      contractYears: 2,
      annualSalaryBillion: 1.9,
      signingBonusBillion: 0.5,
      careerNote: 'KIA 1군 수석코치 · 우승 경험 풍부한 베테랑 선수단 관리자',
    },
    {
      role: '투수코치',
      name: '이동걸',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.5,
      careerNote: 'KIA 1군 투수코치',
    },
    {
      role: '타격코치',
      name: '김주찬',
      ability: 78,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.5,
      careerNote: 'KIA 1군 타격코치',
    },
    {
      role: '배터리코치',
      name: '나카무라 다케시',
      ability: 83,
      contractYears: 2,
      annualSalaryBillion: 1.7,
      signingBonusBillion: 0.5,
      nationality: '일본',
      careerNote: 'KIA 1군 배터리코치 (NPB 주니치 명포수 출신 · 섬세한 볼배합)',
    },
    {
      role: '수비코치',
      name: '박기남',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.3,
      careerNote: 'KIA 1군 수비코치 (내·외야 수비 포지셔닝 전문가)',
    },
  ],
  두산: [
    {
      role: '감독',
      name: '김원형',
      ability: 83,
      contractYears: 3,
      annualSalaryBillion: 4,
      signingBonusBillion: 1.5,
      careerNote: '2026 두산 베어스 신임 감독 (SSG 와이어 투 와이어 우승 감독)',
    },
    {
      role: '수석코치',
      name: '홍원기',
      ability: 82,
      contractYears: 2,
      annualSalaryBillion: 1.9,
      signingBonusBillion: 0.5,
      careerNote: '두산 1군 수석코치 · 감독 경험 보유한 전략 보좌 및 선수단 조율 전문가',
    },
    {
      role: '투수코치',
      name: '정재훈',
      ability: 79,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.5,
      careerNote: '두산 1군 투수코치',
    },
    {
      role: '타격코치',
      name: '이진영',
      ability: 81,
      contractYears: 2,
      annualSalaryBillion: 1.8,
      signingBonusBillion: 0.5,
      careerNote: '두산 1·2군 타격 총괄코치',
    },
    {
      role: '배터리코치',
      name: '조인성',
      ability: 81,
      contractYears: 2,
      annualSalaryBillion: 1.4,
      signingBonusBillion: 0.4,
      careerNote: '두산 1군 배터리코치 (앉아쏴 레전드 포수 · 도루저지/리드 지도)',
    },
    {
      role: '수비코치',
      name: '고영민',
      ability: 80,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.4,
      careerNote: '두산 1군 수비·주루 코치 (넓은 수비 범위·기동력 야구)',
    },
  ],
  키움: [
    {
      role: '감독',
      name: '설종진',
      ability: 76,
      contractYears: 2,
      annualSalaryBillion: 2.5,
      signingBonusBillion: 0.5,
      careerNote: '2026 키움 히어로즈 감독',
    },
    {
      role: '수석코치',
      name: '오윤',
      ability: 78,
      contractYears: 2,
      annualSalaryBillion: 1.5,
      signingBonusBillion: 0.4,
      careerNote: '키움 1군 수석코치 · 젊은 선수단 밀착 관리 및 코칭스태프 조율',
    },
    {
      role: '투수코치',
      name: '김수경',
      ability: 77,
      contractYears: 2,
      annualSalaryBillion: 1.4,
      signingBonusBillion: 0.4,
      careerNote: '키움 투수 총괄코치',
    },
    {
      role: '타격코치',
      name: '김태완',
      ability: 76,
      contractYears: 2,
      annualSalaryBillion: 1.3,
      signingBonusBillion: 0.4,
      careerNote: '키움 1군 타격코치',
    },
    {
      role: '배터리코치',
      name: '박도현',
      ability: 76,
      contractYears: 2,
      annualSalaryBillion: 1.1,
      signingBonusBillion: 0.3,
      careerNote: '키움 1군 배터리코치 (젊은 투수진·포수진 육성 전담)',
    },
    {
      role: '수비코치',
      name: '권도영',
      ability: 77,
      contractYears: 2,
      annualSalaryBillion: 1.1,
      signingBonusBillion: 0.3,
      careerNote: '키움 1군 수비코치 (젊은 야수진 기본기·중계 플레이 지도)',
    },
  ],
};

// v4.60.30 마스터 세이브 보존용 한화 코칭스태프 (류지현·양상문·장종훈 + 배터리·수비코치)
export const HANWHA_MASTER_COACHES: CoachSeed[] = [
  {
    role: '감독',
    name: '류지현',
    ability: 87,
    contractYears: 3,
    annualSalaryBillion: 4,
    signingBonusBillion: 3,
    careerNote: '한화 이글스 감독 (마스터 v4.60.30 확정 · 전 LG 감독/국가대표 감독)',
  },
  {
    role: '수석코치',
    name: '양승관',
    ability: 82,
    contractYears: 2,
    annualSalaryBillion: 1.9,
    signingBonusBillion: 0.5,
    careerNote: '한화 1군 수석코치 · 감독 보좌·선수단 관리·코칭스태프 조율',
  },
  {
    role: '투수코치',
    name: '양상문',
    ability: 82,
    contractYears: 2,
    annualSalaryBillion: 2,
    signingBonusBillion: 1,
    careerNote: '한화 1군 투수코치 (마스터 v4.60.30 확정)',
  },
  {
    role: '타격코치',
    name: '장종훈',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 2,
    signingBonusBillion: 1,
    careerNote: '한화 1군 타격코치 (마스터 v4.60.30 확정 · KBO 레전드)',
  },
  {
    role: '배터리코치',
    name: '김정민',
    ability: 79,
    contractYears: 2,
    annualSalaryBillion: 1.3,
    signingBonusBillion: 0.4,
    careerNote: '한화 1군 배터리코치 (허인서·최재훈 배터리 호흡 및 볼배합 지도)',
  },
  {
    role: '수비코치',
    name: '김우석',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 1.2,
    signingBonusBillion: 0.3,
    careerNote: '한화 1군 수비코치 (내·외야 수비 범위 및 주루 지도)',
  },
];

// FA 신분 실제 KBO 감독·수석코치·투수코치·타격코치 풀
export const REAL_FA_COACH_SEEDS: CoachSeed[] = [
  // FA 수석코치
  {
    role: '수석코치',
    name: '조계현',
    ability: 83,
    contractYears: 2,
    annualSalaryBillion: 2.0,
    signingBonusBillion: 0.5,
    careerNote: 'FA · 전 삼성·LG·KIA 수석코치 및 KBO 전력강화위원장',
  },
  {
    role: '수석코치',
    name: '김성갑',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 1.8,
    signingBonusBillion: 0.4,
    careerNote: 'FA · 전 히어로즈·SK 수석코치 · 선수단 관리·전술 보좌 베테랑',
  },
  {
    role: '수석코치',
    name: '권명철',
    ability: 79,
    contractYears: 2,
    annualSalaryBillion: 1.6,
    signingBonusBillion: 0.4,
    careerNote: 'FA · 전 두산·KT 수석/코칭스태프 조율 전문가',
  },
  {
    role: '수석코치',
    name: '최태원',
    ability: 80,
    contractYears: 2,
    annualSalaryBillion: 1.7,
    signingBonusBillion: 0.4,
    careerNote: 'FA · 전 LG·삼성 수석코치 · 철인 리더십 및 라커룸 소통 강점',
  },
  {
    role: '수석코치',
    name: '이동수',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 1.5,
    signingBonusBillion: 0.3,
    careerNote: 'FA · 선수단 심리 케어 및 코칭스태프 협업 조율 전문 수석코치',
  },
  // FA 감독
  {
    role: '감독',
    name: '류지현',
    ability: 87,
    contractYears: 3,
    annualSalaryBillion: 4,
    signingBonusBillion: 2,
    careerNote: 'FA · 전 LG 트윈스 감독 및 대한민국 야구 대표팀 감독',
  },
  {
    role: '감독',
    name: '김경문',
    ability: 84,
    contractYears: 3,
    annualSalaryBillion: 5,
    signingBonusBillion: 2,
    careerNote: 'FA · 전 두산·NC·한화 감독 (올림픽 금메달 사령탑)',
  },
  {
    role: '감독',
    name: '김기태',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 3.5,
    signingBonusBillion: 1,
    careerNote: 'FA · 전 LG·KIA 감독 (2017 KIA 통합 우승)',
  },
  {
    role: '감독',
    name: '이승엽',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 3.5,
    signingBonusBillion: 1,
    careerNote: 'FA · 전 두산 베어스 감독 (KBO 국민타자 출신)',
  },
  {
    role: '감독',
    name: '이동욱',
    ability: 80,
    contractYears: 2,
    annualSalaryBillion: 3,
    signingBonusBillion: 1,
    careerNote: 'FA · 전 NC 다이노스 통합 우승(2020) 감독',
  },
  {
    role: '감독',
    name: '강인권',
    ability: 77,
    contractYears: 2,
    annualSalaryBillion: 2.5,
    signingBonusBillion: 0.8,
    careerNote: 'FA · 전 NC 다이노스 감독 및 국가대표 배터리코치',
  },
  {
    role: '감독',
    name: '조원우',
    ability: 77,
    contractYears: 2,
    annualSalaryBillion: 2.5,
    signingBonusBillion: 0.5,
    careerNote: 'FA · 전 롯데 자이언츠 감독',
  },

  // FA 투수코치
  {
    role: '투수코치',
    name: '정민철',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 2,
    signingBonusBillion: 0.5,
    careerNote: 'FA · 전 한화 투수코치/단장 · 국가대표 투수코치',
  },
  {
    role: '투수코치',
    name: '배영수',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 1.5,
    signingBonusBillion: 0.4,
    careerNote: 'FA · 전 KIA·롯데 1군 투수코치',
  },
  {
    role: '투수코치',
    name: '송진우',
    ability: 79,
    contractYears: 2,
    annualSalaryBillion: 1.6,
    signingBonusBillion: 0.5,
    careerNote: 'FA · 전 한화 1군 투수코치 (KBO 통산 210승)',
  },
  {
    role: '투수코치',
    name: '최상덕',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 1.5,
    signingBonusBillion: 0.4,
    careerNote: 'FA · 전 LG·삼성 투수 총괄코치',
  },
  {
    role: '투수코치',
    name: '이상훈',
    ability: 77,
    contractYears: 2,
    annualSalaryBillion: 1.4,
    signingBonusBillion: 0.3,
    careerNote: 'FA · 전 LG 투수코치 (좌완 육성 전문가)',
  },
  {
    role: '투수코치',
    name: '조규제',
    ability: 76,
    contractYears: 2,
    annualSalaryBillion: 1.2,
    signingBonusBillion: 0.3,
    careerNote: 'FA · 전 키움·SK 투수코치',
  },

  // FA 타격코치
  {
    role: '타격코치',
    name: '장종훈',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 2,
    signingBonusBillion: 0.8,
    careerNote: 'FA · 전 한화·롯데 1군 타격코치 (원조 거포)',
  },
  {
    role: '타격코치',
    name: '김민호',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 1.5,
    signingBonusBillion: 0.5,
    careerNote: 'FA · 전 한화·LG 타격·수비코치',
  },
  {
    role: '타격코치',
    name: '이종범',
    ability: 82,
    contractYears: 2,
    annualSalaryBillion: 2,
    signingBonusBillion: 0.6,
    careerNote: 'FA · 전 LG·KT 코치 (주루·타격 멀티 지도자)',
  },
  {
    role: '타격코치',
    name: '박흥식',
    ability: 80,
    contractYears: 2,
    annualSalaryBillion: 1.6,
    signingBonusBillion: 0.4,
    careerNote: 'FA · 전 KIA·삼성·롯데 타격코치 및 수석코치',
  },
  {
    role: '타격코치',
    name: '김용달',
    ability: 79,
    contractYears: 2,
    annualSalaryBillion: 1.5,
    signingBonusBillion: 0.4,
    careerNote: 'FA · 전 LG·현대 타격코치 (타격 이론 전문가)',
  },
  {
    role: '타격코치',
    name: '심재학',
    ability: 77,
    contractYears: 2,
    annualSalaryBillion: 1.4,
    signingBonusBillion: 0.3,
    careerNote: 'FA · 전 키움·히어로즈 타격코치 (전 KIA 단장)',
  },
  {
    role: '타격코치',
    name: '장성호',
    ability: 76,
    contractYears: 2,
    annualSalaryBillion: 1.3,
    signingBonusBillion: 0.3,
    careerNote: 'FA · KBO 통산 2100안타 정교한 좌타 지도 후보',
  },

  // FA 배터리코치
  {
    role: '배터리코치',
    name: '진갑용',
    ability: 83,
    contractYears: 2,
    annualSalaryBillion: 1.7,
    signingBonusBillion: 0.5,
    careerNote: 'FA · 전 삼성·KIA 수석/배터리코치 (왕조 포수 출신)',
  },
  {
    role: '배터리코치',
    name: '이도형',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 1.2,
    signingBonusBillion: 0.3,
    careerNote: 'FA · 전 한화·NC 배터리코치',
  },
  {
    role: '배터리코치',
    name: '신경현',
    ability: 77,
    contractYears: 2,
    annualSalaryBillion: 1.2,
    signingBonusBillion: 0.3,
    careerNote: 'FA · 전 한화 배터리코치 (베테랑 포수 육성)',
  },

  // FA 수비코치
  {
    role: '수비코치',
    name: '김민재',
    ability: 82,
    contractYears: 2,
    annualSalaryBillion: 1.6,
    signingBonusBillion: 0.4,
    careerNote: 'FA · 전 SSG·롯데 수석/수비코치 (국가대표 유격수 출신)',
  },
  {
    role: '수비코치',
    name: '정수성',
    ability: 79,
    contractYears: 2,
    annualSalaryBillion: 1.3,
    signingBonusBillion: 0.3,
    careerNote: 'FA · 전 KT·두산 외야수비 및 주루코치',
  },
  {
    role: '수비코치',
    name: '김재걸',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 1.2,
    signingBonusBillion: 0.3,
    careerNote: 'FA · 전 삼성·LG 내야수비·작전코치',
  },

  // 가상 감독 및 코치 (한국·일본·미국 등 해외 선진 야구 지도자 포함)
  {
    role: '감독',
    name: '다카하시 켄지',
    ability: 85,
    contractYears: 2,
    annualSalaryBillion: 4.8,
    signingBonusBillion: 1.5,
    nationality: '일본',
    isVirtual: true,
    careerNote: '가상(일본) · NPB 퍼시픽리그 출신 치밀한 불펜 운용 및 스몰볼 전략가',
    subOverrides: { tactics: 89, pitchingChange: 88, lineupMgmt: 83, leadership: 82 },
  },
  {
    role: '감독',
    name: '브래드 밀러슨',
    ability: 84,
    contractYears: 2,
    annualSalaryBillion: 5.2,
    signingBonusBillion: 1.8,
    nationality: '미국',
    isVirtual: true,
    careerNote: '가상(미국) · MLB 벤치코치 출신 세이버메트릭스·데이터 라인업 운영 전문가',
    subOverrides: { tactics: 86, lineupMgmt: 90, pitchingChange: 82, leadership: 81 },
  },
  {
    role: '감독',
    name: '한도윤',
    ability: 80,
    contractYears: 2,
    annualSalaryBillion: 3.0,
    signingBonusBillion: 0.8,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · KBO 퓨처스 우승 및 육성 시스템 총괄 출신 젊은 전략가',
    subOverrides: { tactics: 81, lineupMgmt: 84, pitchingChange: 78, leadership: 83 },
  },
  {
    role: '투수코치',
    name: '사토 히로시',
    ability: 85,
    contractYears: 2,
    annualSalaryBillion: 2.2,
    signingBonusBillion: 0.6,
    nationality: '일본',
    isVirtual: true,
    careerNote: '가상(일본) · NPB 스플리터·제구 교정 및 선발 컨디션 관리 마스터',
    subOverrides: { stuffCoaching: 83, controlCoaching: 91, development: 86, conditionMgmt: 88 },
  },
  {
    role: '투수코치',
    name: '마커스 레이놀즈',
    ability: 86,
    contractYears: 2,
    annualSalaryBillion: 2.5,
    signingBonusBillion: 0.7,
    nationality: '미국',
    isVirtual: true,
    careerNote: '가상(미국) · 드라이브라인 바이오메카닉스 구속·구위 및 스위퍼 개발 전문가',
    subOverrides: { stuffCoaching: 93, controlCoaching: 81, development: 89, conditionMgmt: 80 },
  },
  {
    role: '투수코치',
    name: '서진혁',
    ability: 79,
    contractYears: 2,
    annualSalaryBillion: 1.4,
    signingBonusBillion: 0.3,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · 랩소도·트랙맨 투구 데이터 분석 기반 불펜 육성 전문가',
    subOverrides: { stuffCoaching: 81, controlCoaching: 80, development: 84, conditionMgmt: 79 },
  },
  {
    role: '타격코치',
    name: '라이언 캘러핸',
    ability: 85,
    contractYears: 2,
    annualSalaryBillion: 2.3,
    signingBonusBillion: 0.6,
    nationality: '미국',
    isVirtual: true,
    careerNote: '가상(미국) · MLB 트리플A 타격코디네이터 출신 발사각·배럴 장타 지도 전문가',
    subOverrides: { contactCoaching: 80, powerCoaching: 92, eyeCoaching: 86, slumpCare: 82 },
  },
  {
    role: '타격코치',
    name: '야마모토 쇼타',
    ability: 83,
    contractYears: 2,
    annualSalaryBillion: 2.0,
    signingBonusBillion: 0.5,
    nationality: '일본',
    isVirtual: true,
    careerNote: '가상(일본) · 정교한 컨택·선구안·컨택 존 대응 및 슬럼프 교정 스페셜리스트',
    subOverrides: { contactCoaching: 90, powerCoaching: 76, eyeCoaching: 89, slumpCare: 87 },
  },
  {
    role: '타격코치',
    name: '강태우',
    ability: 79,
    contractYears: 2,
    annualSalaryBillion: 1.4,
    signingBonusBillion: 0.3,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · 젊은 타자 타격 메커니즘 교정 및 멘탈·슬럼프 관리 특화',
    subOverrides: { contactCoaching: 80, powerCoaching: 79, eyeCoaching: 78, slumpCare: 86 },
  },
  {
    role: '배터리코치',
    name: '고바야시 유타',
    ability: 84,
    contractYears: 2,
    annualSalaryBillion: 1.9,
    signingBonusBillion: 0.5,
    nationality: '일본',
    isVirtual: true,
    careerNote: '가상(일본) · 일본 프로야구 특유의 치밀한 볼배합·프레이밍·투수 리드 전문가',
    subOverrides: { framing: 90, pitchCalling: 89, catcherDefense: 82, chemistry: 85 },
  },
  {
    role: '배터리코치',
    name: '데이비드 모랄레스',
    ability: 82,
    contractYears: 2,
    annualSalaryBillion: 1.8,
    signingBonusBillion: 0.4,
    nationality: '미국',
    isVirtual: true,
    careerNote: '가상(미국) · MLB 프레이밍 데이터·원니(One-Knee) 포구 및 도루저지 전문가',
    subOverrides: { framing: 88, pitchCalling: 80, catcherDefense: 86, chemistry: 81 },
  },
  {
    role: '수비코치',
    name: '카를로스 멘도사',
    ability: 84,
    contractYears: 2,
    annualSalaryBillion: 1.8,
    signingBonusBillion: 0.5,
    nationality: '도미니카',
    isVirtual: true,
    careerNote: '가상(도미니카) · 라틴 아메리카 특유의 탄력적 내야 핸들링·송구·주루 코치',
    subOverrides: { infieldDefense: 90, outfieldDefense: 82, errorReduction: 86, baseRunning: 88 },
  },
  {
    role: '수비코치',
    name: '스즈키 마사토',
    ability: 83,
    contractYears: 2,
    annualSalaryBillion: 1.7,
    signingBonusBillion: 0.4,
    nationality: '일본',
    isVirtual: true,
    careerNote: '가상(일본) · 실책 제로 철학의 외야 타구 판단·중계 플레이 및 기동력 지도자',
    subOverrides: { infieldDefense: 83, outfieldDefense: 89, errorReduction: 90, baseRunning: 85 },
  },
  // 추가 가상 감독 및 코치 (한국·일본·미국·도미니카·대만·호주)
  {
    role: '감독',
    name: '윤태성',
    ability: 82,
    contractYears: 2,
    annualSalaryBillion: 3.4,
    signingBonusBillion: 1.0,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · 공격적 기동력 야구와 젊은 투타 세대교체에 특화된 신진 감독',
    subOverrides: { tactics: 83, lineupMgmt: 85, pitchingChange: 80, leadership: 84 },
  },
  {
    role: '감독',
    name: '나카무라 켄이치',
    ability: 83,
    contractYears: 2,
    annualSalaryBillion: 4.2,
    signingBonusBillion: 1.2,
    nationality: '일본',
    isVirtual: true,
    careerNote: '가상(일본) · NPB 센트럴리그 수석코치 출신 수비·투수 분업 중심 사령탑',
    subOverrides: { tactics: 85, pitchingChange: 87, lineupMgmt: 80, leadership: 81 },
  },
  {
    role: '감독',
    name: '스콧 벤슨',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 4.5,
    signingBonusBillion: 1.3,
    nationality: '미국',
    isVirtual: true,
    careerNote: '가상(미국) · 트리플A 우승 감독 출신 플래툰·데이터 기반 경기 운용가',
    subOverrides: { tactics: 84, lineupMgmt: 86, pitchingChange: 79, leadership: 78 },
  },
  {
    role: '감독',
    name: '최현민',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 2.8,
    signingBonusBillion: 0.6,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · 퓨처스리그 최우수 지도자상 출신 육성·소통형 감독',
    subOverrides: { tactics: 77, lineupMgmt: 80, pitchingChange: 78, leadership: 85 },
  },
  {
    role: '투수코치',
    name: '임재현',
    ability: 82,
    contractYears: 2,
    annualSalaryBillion: 1.6,
    signingBonusBillion: 0.4,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · 바이오메카닉스 투구폼 교정 및 부상 예방·선발 로테이션 관리 전문가',
    subOverrides: { stuffCoaching: 80, controlCoaching: 85, development: 84, conditionMgmt: 86 },
  },
  {
    role: '투수코치',
    name: '브라이언 콜',
    ability: 84,
    contractYears: 2,
    annualSalaryBillion: 2.2,
    signingBonusBillion: 0.6,
    nationality: '미국',
    isVirtual: true,
    careerNote: '가상(미국) · MLB 피칭랩 출신 커터·스위퍼·터널링 설계 전문가',
    subOverrides: { stuffCoaching: 89, controlCoaching: 82, development: 85, conditionMgmt: 79 },
  },
  {
    role: '투수코치',
    name: '후지모토 다이스케',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 1.8,
    signingBonusBillion: 0.4,
    nationality: '일본',
    isVirtual: true,
    careerNote: '가상(일본) · 좌완 제구 및 불펜 연투 피로 회복 루틴 전문 코치',
    subOverrides: { stuffCoaching: 78, controlCoaching: 87, development: 81, conditionMgmt: 85 },
  },
  {
    role: '투수코치',
    name: '페드로 산체스',
    ability: 80,
    contractYears: 2,
    annualSalaryBillion: 1.7,
    signingBonusBillion: 0.4,
    nationality: '도미니카',
    isVirtual: true,
    careerNote: '가상(도미니카) · 강속구·체인지업 피치 디자인 및 외국인 투수 적응 지원 전문가',
    subOverrides: { stuffCoaching: 86, controlCoaching: 76, development: 83, conditionMgmt: 78 },
  },
  {
    role: '타격코치',
    name: '정시원',
    ability: 82,
    contractYears: 2,
    annualSalaryBillion: 1.6,
    signingBonusBillion: 0.4,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · 타구 속도·선구안 데이터 분석과 좌타 거포 육성 전문가',
    subOverrides: { contactCoaching: 82, powerCoaching: 85, eyeCoaching: 84, slumpCare: 81 },
  },
  {
    role: '타격코치',
    name: '매튜 하퍼',
    ability: 84,
    contractYears: 2,
    annualSalaryBillion: 2.1,
    signingBonusBillion: 0.5,
    nationality: '미국',
    isVirtual: true,
    careerNote: '가상(미국) · 배트 스피드 트레이닝·고각 발사각 장타 생산 전문가',
    subOverrides: { contactCoaching: 79, powerCoaching: 90, eyeCoaching: 84, slumpCare: 80 },
  },
  {
    role: '타격코치',
    name: '오타니 마코토',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 1.8,
    signingBonusBillion: 0.4,
    nationality: '일본',
    isVirtual: true,
    careerNote: '가상(일본) · 2스트라이크 컨택 대응력·밀어치기 타격 기술 지도자',
    subOverrides: { contactCoaching: 88, powerCoaching: 75, eyeCoaching: 86, slumpCare: 84 },
  },
  {
    role: '타격코치',
    name: '루이스 알바레스',
    ability: 80,
    contractYears: 2,
    annualSalaryBillion: 1.7,
    signingBonusBillion: 0.4,
    nationality: '도미니카',
    isVirtual: true,
    careerNote: '가상(도미니카) · 폭발적 회전력 타격 메커니즘 및 중심타선 슬럼프 탈출 전문',
    subOverrides: { contactCoaching: 80, powerCoaching: 87, eyeCoaching: 76, slumpCare: 83 },
  },
  {
    role: '배터리코치',
    name: '권민수',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 1.4,
    signingBonusBillion: 0.3,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · ABS 스트라이크존 대응 프레이밍 및 젊은 포수 리드 육성 전문가',
    subOverrides: { framing: 85, pitchCalling: 84, catcherDefense: 80, chemistry: 83 },
  },
  {
    role: '배터리코치',
    name: '박성준',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 1.2,
    signingBonusBillion: 0.3,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · 도루 저지 팝타임 단축 및 블로킹 기본기 전담 배터리코치',
    subOverrides: { framing: 78, pitchCalling: 79, catcherDefense: 85, chemistry: 80 },
  },
  {
    role: '배터리코치',
    name: '천웨이린',
    ability: 79,
    contractYears: 2,
    annualSalaryBillion: 1.4,
    signingBonusBillion: 0.3,
    nationality: '대만',
    isVirtual: true,
    careerNote: '가상(대만) · 아시아권 대표팀 전력분석·볼배합 및 투포수 소통 전문가',
    subOverrides: { framing: 81, pitchCalling: 85, catcherDefense: 78, chemistry: 84 },
  },
  {
    role: '수비코치',
    name: '오지훈',
    ability: 81,
    contractYears: 2,
    annualSalaryBillion: 1.4,
    signingBonusBillion: 0.3,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · 키스톤 콤비 병살 풋워크·내야 시프트 및 주루 작전 전문가',
    subOverrides: { infieldDefense: 86, outfieldDefense: 79, errorReduction: 84, baseRunning: 83 },
  },
  {
    role: '수비코치',
    name: '리암 캠벨',
    ability: 80,
    contractYears: 2,
    annualSalaryBillion: 1.5,
    signingBonusBillion: 0.3,
    nationality: '호주',
    isVirtual: true,
    careerNote: '가상(호주) · 외야 첫발 스타트·펜스 플레이 및 공격적 베이스러닝 코치',
    subOverrides: { infieldDefense: 78, outfieldDefense: 86, errorReduction: 82, baseRunning: 87 },
  },
  {
    role: '수비코치',
    name: '배도현',
    ability: 78,
    contractYears: 2,
    annualSalaryBillion: 1.2,
    signingBonusBillion: 0.3,
    nationality: '한국',
    isVirtual: true,
    careerNote: '가상(한국) · 2군 수비 코디네이터 출신 실책 감소·송구 정확도 특화 지도자',
    subOverrides: { infieldDefense: 82, outfieldDefense: 80, errorReduction: 85, baseRunning: 78 },
  },
];

const COACH_STYLE_MAP: Record<
  string,
  { style: NonNullable<Coach['tacticalStyle']>; specialty: NonNullable<Coach['devSpecialty']>; tactOffset?: number; devOffset?: number }
> = {
  염경엽: { style: '스몰볼·기동력', specialty: '수비·주루', tactOffset: 4, devOffset: 2 },
  김경문: { style: '밸런스', specialty: '팀케미·관리', tactOffset: 3, devOffset: 1 },
  류지현: { style: '육성·데이터', specialty: '수비·주루', tactOffset: 4, devOffset: 4 },
  이숭용: { style: '빅볼·공격야구', specialty: '장타·배럴', tactOffset: 1, devOffset: 2 },
  박진만: { style: '스몰볼·기동력', specialty: '수비·주루', tactOffset: 2, devOffset: 2 },
  이호준: { style: '빅볼·공격야구', specialty: '장타·배럴', tactOffset: 1, devOffset: 3 },
  이강철: { style: '투수전·불펜운용', specialty: '구속·구위', tactOffset: 5, devOffset: 3 },
  김태형: { style: '빅볼·공격야구', specialty: '팀케미·관리', tactOffset: 5, devOffset: 0 },
  이범호: { style: '빅볼·공격야구', specialty: '컨택·선구안', tactOffset: 3, devOffset: 3 },
  김원형: { style: '투수전·불펜운용', specialty: '제구·변화구', tactOffset: 3, devOffset: 3 },
  설종진: { style: '육성·데이터', specialty: '팀케미·관리', tactOffset: 0, devOffset: 4 },
  양상문: { style: '투수전·불펜운용', specialty: '제구·변화구', tactOffset: 2, devOffset: 4 },
  최일언: { style: '투수전·불펜운용', specialty: '구속·구위', tactOffset: 2, devOffset: 5 },
  장종훈: { style: '빅볼·공격야구', specialty: '장타·배럴', tactOffset: 1, devOffset: 4 },
  이종범: { style: '스몰볼·기동력', specialty: '수비·주루', tactOffset: 2, devOffset: 4 },
  정민철: { style: '투수전·불펜운용', specialty: '제구·변화구', tactOffset: 2, devOffset: 4 },
  박경완: { style: '투수전·불펜운용', specialty: '배터리·프레이밍', tactOffset: 3, devOffset: 5 },
  '세리자와 유지': { style: '투수전·불펜운용', specialty: '배터리·프레이밍', tactOffset: 3, devOffset: 5 },
  '나카무라 다케시': { style: '투수전·불펜운용', specialty: '배터리·프레이밍', tactOffset: 2, devOffset: 4 },
  손시헌: { style: '스몰볼·기동력', specialty: '수비·주루', tactOffset: 2, devOffset: 4 },
};

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function buildCoachSubRatings(
  role: CoachRole,
  ability: number,
  name: string,
  overrides?: Partial<CoachSubRatings>
): CoachSubRatings {
  const h = hashSeed(`${role}-${name}`);
  const clamp = (v: number) => Math.max(58, Math.min(97, Math.round(v)));
  const off = (shift: number) => ((h >> shift) % 9) - 4; // -4..+4

  let base: CoachSubRatings;
  if (role === '감독') {
    base = {
      tactics: clamp(ability + off(0)),
      lineupMgmt: clamp(ability + off(4)),
      pitchingChange: clamp(ability + off(8)),
      leadership: clamp(ability + off(12) + 1),
    };
  } else if (role === '수석코치') {
    // 수석코치 능력치는 리더십, 선수 관리, 전술 이해도 3가지만 사용
    base = {
      leadership: clamp(ability + off(0) + 1),
      playerManagement: clamp(ability + off(4) + 1),
      tacticalUnderstanding: clamp(ability + off(8)),
    };
  } else if (role === '투수코치') {
    base = {
      stuffCoaching: clamp(ability + off(0)),
      controlCoaching: clamp(ability + off(4) + 1),
      development: clamp(ability + off(8)),
      conditionMgmt: clamp(ability + off(12)),
    };
  } else if (role === '타격코치') {
    base = {
      contactCoaching: clamp(ability + off(0) + 1),
      powerCoaching: clamp(ability + off(4)),
      eyeCoaching: clamp(ability + off(8)),
      slumpCare: clamp(ability + off(12)),
    };
  } else if (role === '배터리코치') {
    base = {
      framing: clamp(ability + off(0) + 1),
      pitchCalling: clamp(ability + off(4) + 1),
      catcherDefense: clamp(ability + off(8)),
      chemistry: clamp(ability + off(12)),
    };
  } else {
    base = {
      infieldDefense: clamp(ability + off(0) + 1),
      outfieldDefense: clamp(ability + off(4)),
      errorReduction: clamp(ability + off(8) + 1),
      baseRunning: clamp(ability + off(12)),
    };
  }

  return overrides ? { ...base, ...overrides } : base;
}

export function toCoach(
  seed: CoachSeed,
  teamId: TeamId | 'FA',
  idSuffix: string,
  confirmed: boolean,
  isIncumbent: boolean
): Coach {
  const totalBillion = Number(
    (seed.contractYears * seed.annualSalaryBillion + seed.signingBonusBillion).toFixed(2)
  );
  const preset = COACH_STYLE_MAP[seed.name];
  const defaultStyle: NonNullable<Coach['tacticalStyle']> =
    seed.role === '투수코치' || seed.role === '배터리코치'
      ? '투수전·불펜운용'
      : seed.role === '타격코치'
      ? '빅볼·공격야구'
      : seed.role === '수비코치'
      ? '스몰볼·기동력'
      : '밸런스';
  const defaultSpec: NonNullable<Coach['devSpecialty']> =
    seed.role === '투수코치'
      ? '제구·변화구'
      : seed.role === '타격코치'
      ? '컨택·선구안'
      : seed.role === '배터리코치'
      ? '배터리·프레이밍'
      : seed.role === '수비코치'
      ? '수비·주루'
      : '팀케미·관리';

  return {
    id: `coach-${idSuffix}`,
    teamId,
    role: seed.role,
    name: seed.name,
    ability: seed.ability,
    contractYears: seed.contractYears,
    annualSalaryBillion: seed.annualSalaryBillion,
    signingBonusBillion: seed.signingBonusBillion,
    totalBillion,
    confirmed,
    isIncumbent,
    isVirtual: seed.isVirtual ?? false,
    nationality: seed.nationality ?? '한국',
    careerNote: seed.careerNote,
    roleSummary: COACH_ROLE_METADATA[seed.role].duties,
    tacticalStyle: preset?.style ?? defaultStyle,
    devSpecialty: preset?.specialty ?? defaultSpec,
    tacticalRating: Math.min(96, Math.max(62, seed.ability + (preset?.tactOffset ?? 0))),
    developmentRating: Math.min(96, Math.max(62, seed.ability + (preset?.devOffset ?? 1))),
    subRatings: buildCoachSubRatings(seed.role, seed.ability, seed.name, seed.subOverrides),
  };
}

/**
 * 해외·국내 가상 코치 스카우팅 (한국·일본·미국·도미니카)
 */
const VIRTUAL_COACH_TEMPLATES: {
  nationality: string;
  names: string[];
  roleFlavor: Record<CoachRole, string>;
}[] = [
  {
    nationality: '한국',
    names: ['김성훈', '박지훈', '이현우', '최도현', '윤재원', '정민석', '오승재', '배준호', '장태민', '신동혁', '서우진', '한승현'],
    roleFlavor: {
      감독: '가상(한국) · KBO 데이터 분석·육성 프로젝트 총괄 출신 신진 사령탑',
      수석코치: '가상(한국) · 라커룸 소통·선수단 관리 및 벤치 전술 보좌 전문 수석코치',
      투수코치: '가상(한국) · 구종 터널링 및 투수 컨디션 루틴 설계 전문가',
      타격코치: '가상(한국) · 스윙 궤적 교정·컨택 및 슬럼프 극복 전담 코치',
      배터리코치: '가상(한국) · 상대 타선 데이터 분석 기반 볼배합·포수 육성 전문가',
      수비코치: '가상(한국) · 내야 풋워크·실책 억제 및 공격적 주루 지도자',
    },
  },
  {
    nationality: '일본',
    names: ['다나카 신지', '이토 다이키', '나카지마 료', '와타나베 켄타', '모리타 유이치', '오카다 나오키', '마츠다 류지', '하야시 켄'],
    roleFlavor: {
      감독: '가상(일본) · NPB 세밀한 작전·투수 분업 야구 사령탑',
      수석코치: '가상(일본) · NPB 코칭스태프 조율·선수단 기강 및 벤치 작전 참모',
      투수코치: '가상(일본) · 정교한 커맨드·포크볼/스플리터 및 투구 밸런스 전문가',
      타격코치: '가상(일본) · 선구안·밀어치기·타석 접근법 교정 스페셜리스트',
      배터리코치: '가상(일본) · NPB 명문 구단 출신 프레이밍·배터리 호흡 지도자',
      수비코치: '가상(일본) · 수비 기본기·중계 송구 및 번트 시프트 전문가',
    },
  },
  {
    nationality: '미국',
    names: ['에릭 톰슨', '제이슨 로드리게스', '케빈 밀러', '트레버 핸슨', '조던 브룩스', '앤드류 스콧', '코디 넬슨', '그렉 카터'],
    roleFlavor: {
      감독: '가상(미국) · MLB 세이버메트릭스·매치업 최적화 경기 운영 감독',
      수석코치: '가상(미국) · MLB 벤치코치 출신 매치업 조율·클럽하우스 관리 전문가',
      투수코치: '가상(미국) · 드라이브라인 구속 증강·스위퍼/회전수 개발 전문가',
      타격코치: '가상(미국) · 배럴 타구·발사각 최적화 및 장타력 극대화 코치',
      배터리코치: '가상(미국) · MLB 프레이밍 애널리틱스·포구 메커니즘 지도자',
      수비코치: '가상(미국) · OAA(평균 대비 아웃 기여) 기반 수비 포지셔닝 전문가',
    },
  },
  {
    nationality: '도미니카',
    names: ['호세 마르티네스', '라파엘 구즈만', '미겔 페레즈', '알렉스 산타나', '헥터 라미레스'],
    roleFlavor: {
      감독: '가상(도미니카) · 윈터리그 우승 경력 카리스마·공격야구 사령탑',
      수석코치: '가상(도미니카) · 특유의 친화력과 리더십으로 선수단을 결속하는 수석코치',
      투수코치: '가상(도미니카) · 라틴 파이어볼러 구위·체인지업 육성 전문가',
      타격코치: '가상(도미니카) · 폭발적 스윙 스피드·장타 생산 특화 타격코치',
      배터리코치: '가상(도미니카) · 공격적 인코스 볼배합 및 포수 송구 코치',
      수비코치: '가상(도미니카) · 탄력적 내야 핸들링·글러브 워크·주루 코치',
    },
  },
];

export function generateFreshVirtualCoaches(
  seedNum: number,
  existingNames: Set<string>,
  count = 5
): Coach[] {
  const results: Coach[] = [];
  let cursor = Math.abs(seedNum) + 17;
  const roles = COACH_ROLES;

  for (let i = 0; i < count; i++) {
    const role = roles[i % roles.length];
    const tpl = VIRTUAL_COACH_TEMPLATES[(cursor + i) % VIRTUAL_COACH_TEMPLATES.length];
    let pickedName = tpl.names[(cursor + i * 3) % tpl.names.length];
    let tries = 0;
    while (existingNames.has(pickedName) && tries < 12) {
      cursor += 5;
      pickedName = tpl.names[(cursor + tries) % tpl.names.length];
      tries++;
    }
    if (existingNames.has(pickedName)) {
      pickedName = `${pickedName} ${(cursor % 9) + 2}세`;
    }
    existingNames.add(pickedName);

    const ability = 74 + ((cursor + i * 7) % 15); // 74..88
    const isForeign = tpl.nationality !== '한국';
    const annual =
      role === '감독'
        ? Number((2.6 + (ability - 74) * 0.2 + (isForeign ? 0.6 : 0)).toFixed(1))
        : Number((1.1 + (ability - 74) * 0.09 + (isForeign ? 0.35 : 0)).toFixed(1));
    const bonus = Number((annual * 0.3).toFixed(1));

    results.push(
      toCoach(
        {
          role,
          name: pickedName,
          ability,
          contractYears: 2,
          annualSalaryBillion: annual,
          signingBonusBillion: bonus,
          nationality: tpl.nationality,
          isVirtual: true,
          careerNote: tpl.roleFlavor[role],
        },
        'FA',
        `virt-${seedNum}-${i}-${pickedName}`,
        false,
        false
      )
    );
  }
  return results;
}

export function buildInitialCoachesForMode(isPreservedMaster: boolean): {
  coaches: Record<TeamId, Coach[]>;
  faCoaches: Coach[];
} {
  const coaches: Record<TeamId, Coach[]> = {} as never;
  const activeNames = new Set<string>();

  for (const tid of TEAM_IDS) {
    const seeds =
      tid === '한화' && isPreservedMaster ? HANWHA_MASTER_COACHES : REAL_2026_TEAM_COACHES[tid];
    coaches[tid] = seeds.map((seed, idx) => {
      activeNames.add(seed.name);
      return toCoach(seed, tid, `${tid}-${seed.role}-${idx}`, true, true);
    });
  }

  // Exclude anyone already actively employed on one of the 10 teams so no person is duplicated
  const faCoaches: Coach[] = REAL_FA_COACH_SEEDS.filter((seed) => !activeNames.has(seed.name)).map(
    (seed, idx) => toCoach(seed, 'FA', `fa-${seed.role}-${idx}-${seed.name}`, false, false)
  );

  return { coaches, faCoaches };
}

/**
 * 기존 세이브 호환 마이그레이션:
 * - 기존 5보직 코치, 계약, 기록은 일절 건드리지 않고, 수석코치가 없는 구단에만 2026 수석코치 보충
 * - FA 수석코치가 없는 세이브에는 FA 수석코치 풀도 보충
 */
export function ensureBenchCoachesInPlace(career: CareerSave): void {
  if (!career.coaches) return;
  const activeNames = new Set<string>(
    TEAM_IDS.flatMap((tid) => (career.coaches[tid] ?? []).map((c) => c.name))
  );

  for (const tid of TEAM_IDS) {
    const list = career.coaches[tid] ?? [];
    // 이미 수석코치가 있으면 3개 전용 능력치만 안전 보정하고 기존 코치 유지
    const existingBench = list.find((c) => c.role === '수석코치');
    if (existingBench) {
      if (
        !existingBench.subRatings ||
        typeof existingBench.subRatings.playerManagement !== 'number' ||
        typeof existingBench.subRatings.tacticalUnderstanding !== 'number'
      ) {
        existingBench.subRatings = buildCoachSubRatings(
          '수석코치',
          existingBench.ability,
          existingBench.name
        );
      }
      continue;
    }

    const seed = REAL_2026_TEAM_COACHES[tid]?.find((s) => s.role === '수석코치');
    if (!seed) continue;

    // 이미 FA 풀에 동일 이름 수석코치가 있으면 재사용하고 FA에서 제외
    const faIdx = (career.faCoaches ?? []).findIndex((c) => c.name === seed.name);
    let benchCoach: Coach;
    if (faIdx >= 0 && career.faCoaches) {
      const picked = career.faCoaches[faIdx];
      career.faCoaches.splice(faIdx, 1);
      benchCoach = {
        ...picked,
        teamId: tid,
        role: '수석코치',
        confirmed: true,
        isIncumbent: true,
        subRatings: buildCoachSubRatings('수석코치', picked.ability, picked.name),
      };
    } else {
      benchCoach = toCoach(seed, tid, `${tid}-수석코치-migrated`, true, true);
    }

    activeNames.add(benchCoach.name);
    const mgrIdx = list.findIndex((c) => c.role === '감독');
    if (mgrIdx >= 0) {
      list.splice(mgrIdx + 1, 0, benchCoach);
    } else {
      list.unshift(benchCoach);
    }
    career.coaches[tid] = list;
  }

  // FA 수석코치 풀이 비어 있으면 기존 FA 코치 유지 + 수석코치 FA 시드 보충
  if (!Array.isArray(career.faCoaches)) {
    career.faCoaches = [];
  }
  const existingFaNames = new Set(career.faCoaches.map((c) => c.name));
  const hasBenchFa = career.faCoaches.some((c) => c.role === '수석코치');
  if (!hasBenchFa) {
    for (const seed of REAL_FA_COACH_SEEDS.filter((s) => s.role === '수석코치')) {
      if (activeNames.has(seed.name) || existingFaNames.has(seed.name)) continue;
      career.faCoaches.push(toCoach(seed, 'FA', `fa-bench-${seed.name}`, false, false));
      existingFaNames.add(seed.name);
    }
  }
}

