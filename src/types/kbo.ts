export type TeamId =
  | 'LG'
  | '한화'
  | 'SSG'
  | '삼성'
  | 'NC'
  | 'KT'
  | '롯데'
  | 'KIA'
  | '두산'
  | '키움';

export type PlayerCategory = '국내' | '외국인' | '아시아쿼터';
export type PlayerRole = '투수' | '타자';
export type Position =
  | 'SP'
  | 'RP'
  | 'CL'
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'LF'
  | 'CF'
  | 'RF'
  | 'DH';

export type RosterTier = '1군' | '2군' | '육성' | '대기' | 'FA' | '제외후보' | '은퇴' | '해외이적';
export type MilitaryStatus =
  | '군필'
  | '미필'
  | '복무 중'
  | '상무복무' // 레거시 세이브 호환용 ('복무 중'과 동일 취급)
  | '입대 예정'
  | '예술·체육요원'
  | '면제'
  | '해당 없음'
  | '미확인';
export type TrainingFocus = '타격' | '수비' | '주루' | '구위' | '제구' | '체력' | null;
export type MoraleState = '만족' | '보통' | '불만' | '평가 대기';
export type TeamAtmosphere = '좋음' | '보통' | '나쁨' | '평가 대기';
export type InjurySeverity = '경미' | '보통' | '장기';

export type GamePhase =
  | 'INTRO'
  | 'STAFF'
  | 'ROSTER_ANALYSIS'
  | 'REINFORCEMENT'
  | 'SPECIAL_DRAFT'
  | 'OPENING_ROSTER'
  | 'REGULAR_SEASON'
  | 'POSTSEASON'
  | 'OFFSEASON';

export type PostseasonRound = 'NONE' | 'WILDCARD' | 'SEMI_PO' | 'PO' | 'KOREAN_SERIES' | 'FINISHED';

export interface TeamInfo {
  id: TeamId;
  name: string;
  shortName: string;
  city: string;
  stadium: string;
  capacity: number;
  parkFactor: number; // <1.0 투수친화, >1.0 타자친화
  basePopularity: number; // 0..100 초기 구단 인기도
  ticketDemandMultiplier: number; // 구단별 관중 동원 배수
  ticketPriceAvg: number; // 평균 티켓 단가 (원)
  operatingCostPerSeriesBillion: number; // 3연전당 구단 기본 운영비 (억 원)
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  emblemCode: string;
  logoUrls: string[];
  prevRank2025: number;
}

export interface BatterStats {
  G: number | null;
  PA: number | null;
  AB: number | null;
  H: number | null;
  B2: number | null;
  B3: number | null;
  HR: number | null;
  BB: number | null;
  HBP: number | null;
  SF: number | null;
  SO: number | null;
  R: number | null;
  RBI: number | null;
  SB: number | null;
  TB: number | null;
  // For Hanwha G1-3 & G7-9 partial verified counts before full boxscore completeness
  confirmedMinHR?: number;
  confirmedMinRBI?: number;
  isPartial?: boolean;
  partialNote?: string;
  isSynthetic?: boolean;
  /** 해당 포지션 정규시즌 누적 수비이닝 (2026 KBO 골든글러브 720수비이닝 기준 판정용) */
  defensiveInnings?: number;
}

export interface PitcherStats {
  G: number | null;
  GS: number | null;
  outs: number | null;
  W: number | null;
  L: number | null;
  HLD: number | null;
  SV: number | null;
  H: number | null;
  BB: number | null;
  SO: number | null;
  ER: number | null;
  R: number | null;
  HR: number | null;
  PC: number | null;
  /** 블론세이브 (세이브 상황에서 동점·역전 허용) */
  BS?: number | null;
  /** 퀄리티스타트 (선발 6이닝 이상 3자책 이하) */
  QS?: number | null;
  /** 퀄리티스타트 플러스 (선발 7이닝 이상 3자책 이하) */
  QSP?: number | null;
  /** 완투 */
  CG?: number | null;
  /** 완봉 */
  SHO?: number | null;
  /** 노히트노런 */
  NH?: number | null;
  /** 퍼펙트게임 */
  PG?: number | null;
  confirmedMinG?: boolean;
  confirmedMinOuts?: boolean;
  isPartial?: boolean;
  partialNote?: string;
  isSynthetic?: boolean;
}

export interface PlayerContract {
  status: '확정' | '미확인' | '만료' | 'FA';
  currency: 'KRW' | 'USD';
  years: number;
  yearsRemaining: number;
  annualSalary: number; // in 억 KRW or USD
  signingBonus: number; // in 억 KRW or USD
  totalValue: number;
  note?: string;
  isFAEligible?: boolean;
  faGrade?: 'A' | 'B' | 'C' | null;
  optionType?: '없음' | '구단옵션' | '선수옵션';
  optionYearSalary?: number;
  incentiveTarget?: string;
  incentiveBonusBillion?: number;
  incentivePaid?: boolean;
  /** 해당 시즌 확정·지급된 옵션 금액 (억 원, 공식 다년계약 보수 합산용) */
  optionBonusPaidBillion?: number;
  startSeason?: number;
  endSeason?: number;
}

export interface InjuryRecord {
  id: string;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  description: string;
  severity: InjurySeverity;
  daysTotal: number;
  daysRemaining: number;
  occurredRound: number;
  occurredDate: string;
  rehabProgress?: number; // 0..100
  medicalClearance?: '재활중' | '조기복귀가능' | '완전회복';
  rushedReturn?: boolean;
}

export interface RookieProfile {
  draftId: number;
  pickNotation: string; // e.g. '1R 9순위'
  round: number;
  pickInRound: number;
  originType: '고졸' | '대학' | '독립리그';
  school: string;
  signingBonusBillion: number;
  amateurSummary: string;
}

export interface FuturesPlayerStats {
  G: number;
  AB: number;
  H: number;
  HR: number;
  RBI: number;
  outs: number;
  ER: number;
  SO: number;
  W: number;
  L: number;
  PA?: number;
  B2?: number;
  B3?: number;
  BB?: number;
  R?: number;
  SB?: number;
  GS?: number;
  SV?: number;
  HLD?: number;
  H_allowed?: number;
  BB_allowed?: number;
  HR_allowed?: number;
}

export interface V18BattingRatings {
  contact: number;
  power: number;
  discipline: number;
  avoid_k: number;
  steal_production: number;
  availability: number;
  fielding: number;
  arm: number;
  speed: number;
  injury_resistance: number;
  overall_offense: number;
}

export interface V18PitchingRatings {
  stuff: number;
  control: number;
  hr_prevention: number;
  stamina_proxy: number;
  run_prevention: number;
  traffic_control: number;
  clutch: number;
  injury_resistance: number;
  overall_pitching: number;
}

export interface V18SeasonStatRecord {
  season: number;
  playerId?: string | null;
  team?: string | null;
  /** 같은 시즌 다구단 분할 성적 순서 (1: 전반/이적 전, 2: 후반/이적 후) */
  stintOrder?: number;
  /** 시즌 중 이적·분할 기록 메모 */
  transferNote?: string;
  G?: number;
  PA?: number;
  AB?: number;
  R?: number;
  H?: number;
  B2?: number;
  B3?: number;
  HR?: number;
  RBI?: number;
  BB?: number;
  SO?: number;
  SB?: number;
  AVG?: number;
  OBP?: number;
  SLG?: number;
  OPS?: number;
  ERA?: number;
  W?: number;
  L?: number;
  SV?: number;
  HLD?: number;
  IP?: string;
  ER?: number;
  WHIP?: number;
}

export interface V18EvaluationMeta {
  previous_ovr: number;
  previous_pot: number;
  ovr: number;
  pot: number;
  basis: string;
  confidence: 'low' | 'medium' | 'high' | string;
  age_used: number | null;
  draft_pick_used: number | null;
  weighted_exposure: number;
  metric_ratings: Record<string, number>;
  potential_range: [number, number];
  records: V18SeasonStatRecord[];
}

export type TradeProtectionTier =
  | '프랜차이즈 스타'
  | '구단 핵심 선수'
  | '핵심 유망주'
  | '일반 선수'
  | '전력 외 선수';

export interface CareerBatterStats {
  seasons: number;
  G: number;
  AB: number;
  H: number;
  HR: number;
  RBI: number;
  R: number;
  BB: number;
  SB: number;
}

export interface CareerPitcherStats {
  seasons: number;
  G: number;
  outs: number;
  W: number;
  L: number;
  SV: number;
  HLD: number;
  SO: number;
  ER: number;
  BB: number;
  H: number;
}

export interface PlayerAcquisitionInfo {
  type: '드래프트' | '육성선수' | '외국인' | '아시아쿼터' | 'FA/트레이드';
  draftYear?: number;
  draftRound?: number;
  draftPick?: number; // 전체 순번 또는 라운드 내 순번
  wasDevelopmental?: boolean;
  label: string; // e.g. '2024 1R 전체 1번', '2022 1차지명', '육성선수 입단', '외국인 영입 (미국)'
}

export interface Player {
  id: string;
  name: string;
  teamId: TeamId;
  /** FA 자격 취득으로 소속 구단에서 자동 이탈했을 때의 직전 원소속 구단 */
  formerTeamId?: TeamId;
  category: PlayerCategory;
  role: PlayerRole;
  position: Position;
  pitchRole?: '선발' | '마무리' | '셋업맨' | '필승조' | '중간계투' | '중간' | '추격조' | '롱릴리프' | '예비';
  /** 사용자가 수동 지정한 투수 보직 유지 여부 */
  pitchRoleLockedByUser?: boolean;
  age: number; // 게임 내 현재 날짜·생년월일 기준 만 나이
  ability: number;
  potential: number;
  abilityStatus: '확정' | '제안' | '평가대기';
  form: number; // -5..+5
  fatigue: number; // 0..100
  lastPitchedRound: number;
  /** 최근 등판 일자 (YYYY-MM-DD · 4일 휴식/연투/장기 미등판 계산용) */
  lastPitchedDate?: string;
  /** 최근 연속 등판 일수 (연투 관리 · 부상 위험 · 불펜 보호용) */
  consecutivePitchDays?: number;
  /** 최근 3일 누적 투구 수 */
  recent3DayPitches?: number;
  /** 최근 투구 이력 (최대 10경기) */
  recentPitchLog?: {
    date: string;
    round: number;
    pitches: number;
    outs: number;
    isStarter: boolean;
  }[];
  /** 직전 등판 시 선발 운용 유형 */
  starterUsageType?: '정규선발' | '대체선발' | '임시선발' | '오프너';
  consecutiveAppearances: number;
  /** 야수/투수 최근 경기 출전 라운드 및 일자 (장기 미출전 후보 기회·로테이션 계산용) */
  lastPlayedRound?: number;
  lastPlayedDate?: string;
  /** 1군 건강한 상태에서 연속 미출전 경기 수 (후보 출전기회 · 불만도 연동) */
  benchIdleGames?: number;
  /** 유틸리티 선수 겸업 가능 보조 수비 포지션 */
  secondaryPositions?: Position[];
  rosterTier: RosterTier;
  gameDayActive: boolean;
  /** 웨이버 영입 확정 일자 (YYYY-MM-DD · 60일간 재웨이버 금지 기준) */
  waiverClaimedDate?: string;
  /** 재웨이버 금지 만료 일자 (YYYY-MM-DD · 영입 후 60일) */
  reWaiverBlockedUntilDate?: string;
  /** 8월 1일 이후 웨이버 이적 시 당해 시즌 포스트시즌 출전 제한 */
  postseasonIneligibleSeason?: number;
  contract: PlayerContract;
  injury: InjuryRecord | null;
  morale: MoraleState;
  trainingFocus: TrainingFocus;
  serviceYears: number;
  postedThisYear?: boolean;
  postingBlockedUntilNextNov?: boolean;
  seasonRatingDelta: number; // capped per season
  lastEvaluatedAtTeamGames: number;
  rookieInfo?: RookieProfile;
  stats: BatterStats | PitcherStats;
  ktSeriesBatting?: BatterStats; // exact KT 3-game record for Hanwha transparency
  postseasonStats: BatterStats | PitcherStats;
  // Extended franchise simulation attributes
  /** 실제 KBO 선수('real') vs 가상 생성 선수('virtual') 데이터 생성 로직 엄격 분리 */
  originType?: 'real' | 'virtual';
  militaryStatus?: MilitaryStatus;
  militaryNote?: string;
  militaryEnlistDate?: string; // YYYY-MM-DD
  militaryDischargeDate?: string; // YYYY-MM-DD
  militaryEnlistedSeason?: number;
  militaryEnlistedRound?: number;
  militaryReturnSeason?: number;
  militaryReturnRound?: number;
  /** 게임 진행 중 병역 상태(입대·전역·국제대회 특례)가 변동되었는지 여부 (세이브 마이그레이션 보존용) */
  militaryChangedInGame?: boolean;
  /** 공식 확인 프로필 (실제 선수의 미확인 항목은 null 유지 · 임의 생성 금지) */
  birthDate?: string | null; // YYYY-MM-DD
  heightCm?: number | null;
  weightKg?: number | null;
  bats?: 'L' | 'R' | 'S' | null;
  throws?: 'L' | 'R' | null;
  school?: string | null;
  debutYear?: number | null;
  draftYear?: number | null;
  dataVerification?: {
    verifiedAt?: string;
    militarySource?: string;
    bioSource?: string;
  };
  kboAdaptation?: number; // 0..100 for 외국인/아시아쿼터
  previousLeagueClub?: string; // e.g. 'MLB 샌프란시스코 · AAA 새크라멘토', 'NPB 소프트뱅크 호크스'
  injuryHistoryCount?: number;
  rehabGamesLeft?: number;
  recent3YrScore?: number; // 0..100 composite recent 3yr performance
  tradeRequested?: boolean;
  postingRequested?: boolean;
  /** 선수 불만도 (0~100): 0~19 만족, 20~39 보통, 40~59 불만, 60~79 높은 불만, 80~100 심각한 불만 */
  dissatisfaction?: number;
  /** 현재 활성화된 불만 원인 목록 (동일 원인 중복 방지) */
  activeDissatisfactionCauses?: DissatisfactionCause[];
  /** 마지막 단장 면담 일자 (YYYY-MM-DD · 동일 선수 30일 쿨다운) */
  lastMeetingDate?: string;
  /** 단장 면담 이후 실제 후속 조치 검증 추적 */
  pendingMeetingFollowUp?: PendingMeetingFollowUp | null;
  /** 재계약 거부 가능성 (%) — 불만 80+ 시 상승, 프랜차이즈 충성도 보정 반영 */
  reSignRefusalRiskPct?: number;
  /** 최근 2군 강등 시점의 팀 경기 수 */
  lastDemotedRound?: number;
  futuresStats?: FuturesPlayerStats;
  careerSeasons?: number;
  careerHits?: number;
  careerHR?: number;
  careerWins?: number;
  careerSO?: number;
  careerStats?: CareerBatterStats | CareerPitcherStats;
  nationality?: string; // e.g. '한국', '미국', '베네수엘라', '도미니카공화국', '일본', '대만', '호주'
  acquisitionInfo?: PlayerAcquisitionInfo;
  uniformNumber?: number;
  overseasTrainingReturnRound?: number;
  overseasTrainingLocation?: string;
  nationalTeamDuty?: NationalTeamDuty | null;
  // Deep franchise expansion (#1-#40)
  pitchRepertoire?: PitchRepertoire;
  battingProfile?: BattingProfile;
  hiddenTrait?: HiddenTrait;
  agent?: PlayerAgent;
  registrationDays?: number; // 누적 1군 등록일수 (145일 = 1시즌)
  overuse?: OveruseMetrics;
  acquiredRound?: number;
  acquiredSeason?: number;
  signedAsFaSeason?: number;
  overseasInterest?: '없음' | '관심' | '적극희망';
  potentialTrend?: '급상승' | '안정' | '정체' | '하락';
  salaryNegotiationStatus?: '미협상' | '협상완료' | '조정신청' | '보류제외';
  demandedSalaryBillion?: number;
  isReserveListed?: boolean;
  /** 현 소속 구단 누적 등록 시즌 수 (7시즌 이상 프랜차이즈 예외 선수 자격 판정용) */
  clubTenureSeasons?: number;
  /** 육성선수 출신 유형 (고졸 육성선수 선발 제한 관리용) */
  developmentalOrigin?: '고졸' | '대졸' | '독립리그' | '방출선수';
  /** 프랜차이즈 스타 장기 연장계약 체결 여부 */
  franchiseLongTermSigned?: boolean;
  /** 은퇴 후 지도자/스카우트 재영입 완료 여부 */
  hiredPostRetirementRole?: CoachRole | '스카우트';
  /** 영구 불변 선수 고유 ID (동명이인 구분 · 해외/대학/KBO 전 생애주기 유지) */
  permanentId?: string;
  /** 출생연도 (동명이인 구분 및 MLB/KBO 연령 규정 검증용) */
  birthYear?: number;
  /** 국가대표 국제대회 참가·입상 누적 FA 보상일수 */
  nationalTeamBonusDays?: number;
  nationalTeamBonusLog?: {
    season: number;
    tournamentName: string;
    resultTitle: string;
    daysAwarded: number;
  }[];
  /** 신인 드래프트 1라운더 특별 스포트라이트 여부 */
  firstRoundSpotlight?: boolean;
  /** 통산 소속 구단 이력 (입단~현재 순서대로) */
  careerTeamHistory?: PlayerTeamHistoryEntry[];
  /** 실제 KBO 원클럽맨 여부 (해외 진출 후 원소속 복귀 포함, 타 KBO 구단 이적 이력 없음) */
  isOneClubMan?: boolean;
  /** 전년도 연봉 (억 원, 전년 대비 연봉 인상·삭감률 계산용) */
  previousAnnualSalary?: number;
  /** 역대 공식 KBO 수상 기록 (MVP · 신인왕 · 골든글러브 · 한국시리즈 MVP 등 영구 저장) */
  awardHonors?: PlayerAwardHonor[];
  /** 시즌 종료 후 정리(방출) 예정 지정 여부 */
  markedForOffseasonRelease?: boolean;
  /** 직전 시즌 개인 주요 수상 효과 (MVP / 신인왕 / 골든글러브) */
  lastSeasonAwards?: ('MVP' | '신인왕' | '골든글러브')[];
  /** 최근 이적 시 등번호 중복 재배정 메모 */
  uniformChangeNote?: string;
  /** 시즌별 결정론적 커리어 흐름 (깜짝 활약 · 슬럼프 · 후반기 반등 · 평온) — 확정 후 저장 고정 */
  seasonArc?: PlayerSeasonArc;
  /** 유망주 성장 속도 · 베테랑 노쇠화 개인차 유형 */
  growthCurveProfile?: PlayerGrowthCurveProfile;
  /** v18 재보정 DB 고유 원본 ID (중복 ID 방지 및 2024~2026 기록 연동) */
  v18SourceId?: string;
  /** 게임 내 가상 트레이드·FA·방출·웨이버 이력이 발생했는지 추적 (세이브 마이그레이션 시 가상 이적 보존용) */
  teamHistoryChangedInGame?: boolean;
  /** 2026시즌 종료 후 실제 방출(재계약 불가 · 미계약 자유계약 신분) 여부 */
  releasedAfter2026?: boolean;
  releaseDate?: string;
  releaseNote?: string;
  /** KBO 공식 홈페이지 선수 고유 ID (예: 류현진 '76715', 김도영 '52605') */
  kboOfficialId?: string;
  /** 2026 퓨처스리그 공식 확인 성적 (미확인 선수는 null 유지 · 임의 생성 금지) */
  verifiedFutures2026?: {
    season: number;
    kind: 'batting' | 'pitching' | string;
    team?: string;
    source?: string;
    scope?: string;
    values: Record<string, number>;
  } | null;
  /** 2027 KBO 공식 FA 승인 등급 (공시된 22명만 지정) */
  faApproved2027Grade?: 'A' | 'B' | 'C';
  /** v18 세부 게임 능력치 (타격/투구) */
  v18Ratings?: {
    overall: number;
    potential: number;
    batting: V18BattingRatings | null;
    pitching: V18PitchingRatings | null;
  };
  /** v18 평가 근거 · 신뢰도 · 잠재력 범위 · 2024~2026 실제 성적 */
  v18Evaluation?: V18EvaluationMeta;
  /** v19 통합 능력치 재평가 변경 전/후 비교 메타데이터 */
  rebalanceMeta?: {
    prevOvr: number;
    prevPot: number;
    newOvr: number;
    newPot: number;
    ovrDelta: number;
    potDelta: number;
    tier: string;
    reason: string;
  };
  /** KBO 연도별 공식 과거 시즌 성적 아카이브 (2006~2026 보존 · 2027 새 시즌 기록 0과 분리 보존) */
  historicalSeasons?: V18SeasonStatRecord[];
  /** 프랜차이즈 지수 (0~100) 캐시 및 5단계 보호 등급 */
  franchiseIndex?: number;
  protectionTier?: TradeProtectionTier;
  /** 외국인/아시아쿼터 KBO 적응 성향 및 교체/재계약 추적 */
  foreignAdaptationProfile?: '빠른적응' | '표준' | '기복' | '적응난항';
  foreignReplacementReviewFlagged?: boolean;
  foreignReSignStatus?: '미협상' | '재계약완료' | '해외복귀' | '결별';
  /** 보직 변경으로 인한 최근 불만 사유 메모 */
  roleChangeDissatisfactionNote?: string;
}

export type PlayerGrowthCurveProfile = '조기개화' | '표준' | '대기만성' | '철강왕';

export interface PlayerSeasonArc {
  season: number;
  kind: '깜짝활약' | '슬럼프' | '후반기반등' | '평온';
  /** 전반기(1~72G) 능력치 보정 (-2.6 ~ +2.8, 실제 능력치를 압도하지 않도록 제한) */
  firstHalfDelta: number;
  /** 후반기(73~144G) 능력치 보정 (-2.6 ~ +3.0) */
  secondHalfDelta: number;
}

export interface PlayerTeamHistoryEntry {
  teamLabel: string;
  teamId?: TeamId;
  /** 소속 리그 구분 (KBO · MLB · NPB · MiLB · 해외) */
  league?: 'KBO' | 'MLB' | 'NPB' | 'MiLB' | '해외';
  /** MLB 공식 구단 로고 매칭용 영문/한글 구단명 */
  mlbTeamName?: string;
  fromSeason: number;
  toSeason?: number;
  /** 공식 이적·입단 날짜 (YYYY-MM-DD) */
  transferDate?: string;
  /** 해당 구단 퇴단·이적·방출 날짜 (YYYY-MM-DD) */
  endDate?: string;
  /** 이동 유형 (입단 · 트레이드 · FA 이적 · 2차 드래프트 · 웨이버 클레임 · 자유계약 · 방출 등) */
  moveType?: string;
  note?: string;
}

export type GameDifficulty = '보통' | '어려움' | '극한';

export type PitchTypeName =
  | '포심'
  | '투심'
  | '커터'
  | '슬라이더'
  | '스위퍼'
  | '커브'
  | '체인지업'
  | '포크볼'
  | '스플리터';

export interface PitchGrade {
  name: PitchTypeName;
  grade: number; // 45..99
  usagePct: number; // %
}

export interface PitchRepertoire {
  throws: '우투' | '좌투' | '우언' | '우사';
  avgVelocityKmh: number;
  maxVelocityKmh: number;
  command: number; // 제구력 45..99
  breakingSharpness: number; // 변화구 완성도 45..99
  stamina: number; // 구위 유지력 45..99
  pitches: PitchGrade[];
}

export interface BattingProfile {
  bats: '우타' | '좌타' | '양타';
  sprayTendency: '당겨치기' | '스프레이' | '밀어치기';
  pullPct: number;
  centerPct: number;
  oppoPct: number;
  vsLeftEdge: number; // -8..+8
  vsRightEdge: number; // -8..+8
  rispClutch: number; // 득점권 보정 -6..+10
  vsBreaking: number; // 변화구 대처 50..95
  /** KBO 트랙맨/스탯캐스트 타구 지표 */
  avgExitVelocityKmh?: number; // 평균 타구속도 (km/h, KBO 평균 ~141)
  maxExitVelocityKmh?: number; // 최고 타구속도 (km/h, ~165..184)
  launchAngleDeg?: number; // 평균 발사각 (도, 7..21)
  barrelPct?: number; // 배럴 타구 비율 (%, 2..19)
  hardHitPct?: number; // 강한 타구(153km/h+) 비율 (%, 24..56)
  sprintSpeedMs?: number; // 주력 스프린트 속도 (m/s, 7.4..9.3)
}

export type FranchiseStarTier = '레전드' | '핵심 프랜차이즈' | '준프랜차이즈' | '일반';

export interface FranchiseStarAssessment {
  playerId: string;
  playerName: string;
  teamId: TeamId;
  tier: FranchiseStarTier;
  /** 5단계 트레이드 보호 등급 (프랜차이즈 스타 · 구단 핵심 선수 · 핵심 유망주 · 일반 선수 · 전력 외 선수) */
  protectionTier?: TradeProtectionTier;
  /** 프랜차이즈 지수 95+ 절대 보호 여부 (자동 트레이드/AI 제안 영구 제외) */
  isHardTradeLocked?: boolean;
  score: number; // 0..100
  tenureSeasons: number;
  careerPoints: number;
  contributionPoints: number;
  popularityIndex: number; // 0..100
  annualMerchBillion: number;
  /** KBO 샐러리캡 프랜차이즈 예외 선수 지정 여부 (프랜차이즈 스타 지위와 별도 관리) */
  isSalaryCapException: boolean;
  summary: string;
}

export interface RetiredNumberReviewResult {
  playerId: string;
  playerName: string;
  teamId: TeamId;
  uniformNumber: number;
  totalScore: number; // 0..100
  careerScore: number;
  contributionScore: number;
  tenureScore: number;
  verdict: '만장일치 영구결번 추천' | '심사 통과' | '보류';
  eligible: boolean;
  reasons: string[];
}

export interface ClubLegendRecord {
  id: string;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  position: Position;
  uniformNumber?: number;
  inductedSeason: number;
  tenureSeasons: number;
  franchiseTier: FranchiseStarTier;
  retiredNumberApproved: boolean;
  careerSummary: string;
  hiredAsStaffRole?: CoachRole | '스카우트';
  isHistoricalBaseline?: boolean;
}

export interface TradePlayerValuationBreakdown {
  playerId: string;
  playerName: string;
  teamId: TeamId;
  /** 순수 실력·나이·연봉 기반 시장 트레이드 지수 */
  skillMarketIndex: number;
  baseSkillScore: number;
  ageAdjustment: number;
  salaryAdjustment: number;
  contractTermAdjustment: number;
  injuryAdjustment: number;
  /** 소속 구단 프랜차이즈 상징성 평가 프리미엄 (원소속팀과 타 구단 평가 차이) */
  homeClubSymbolicPremium: number;
  /** 선수 트레이드 요청 시 소속 구단 매각 저항 완화 */
  tradeRequestRelief: number;
  /** 원소속 구단 기준 내부 평가 점수 */
  homeClubValue: number;
  /** 타 구단 기준 영입 평가 점수 */
  marketClubValue: number;
  franchiseTier: FranchiseStarTier;
  /** 트레이드 지수가 낮은 구체적 사유 목록 */
  lowValueReasons: string[];
}

export type HiddenTrait =
  | '큰경기강세'
  | '유리몸'
  | '철강왕'
  | '꾸준함'
  | '슬로우스타터'
  | '클러치히터'
  | '멘탈에이스'
  | '분위기메이커'
  | '좌투킬러'
  | '우투킬러';

export type AgentPersona =
  | '강경 협상가'
  | '장기보장 선호'
  | '우승지향 에이전트'
  | '시장가치 극대화'
  | '원클럽 충성형'
  | '해외진출 전문';

export interface PlayerAgent {
  name: string;
  agency: string;
  persona: AgentPersona;
  greedFactor: number; // 0.92..1.25
  prefersContender: boolean;
  prefersBigMarket: boolean;
  prefersPlayingTime: boolean;
  loyaltyScore: number; // 0..100
}

export interface OveruseMetrics {
  consecutiveStarts: number; // 포수·야수 연속 선발
  consecutivePitchDays: number; // 투수 연투 일수
  highPitchCountGames: number; // 선발 105구+ 등판 횟수
  recent7dPitches: number;
  riskLevel: '정상' | '주의' | '위험';
}

export interface GameWeather {
  condition: '맑음' | '흐림' | '강풍' | '안개' | '소나기' | '돔구장';
  tempC: number;
  windDir: '외야뒷바람' | '외야맞바람' | '횡풍' | '무풍';
  windKmh: number;
  hrMult: number;
  xbhMult: number;
  pitchControlDelta: number;
  summary: string;
}

export interface LeagueEnvironmentState {
  season: number;
  regime: '투고타저' | '균형' | '타고투저';
  ballCOR: number; // 공인구 반발계수 0.408..0.422
  runMultiplier: number; // 0.92..1.08
  hrMultiplier: number; // 0.86..1.16
  note: string;
}

export interface FacilityConditionState {
  stadium: number; // 0..100
  academy: number; // 0..100 (훈련장)
  medical: number; // 0..100 (의료시설)
  marketing: number; // 0..100
  lastMaintSeason: number;
}

export interface TeamLeadershipState {
  captainPlayerId: string | null;
  /** 공식 주장이 부상·군복무·국대차출·말소 등으로 이탈 시 자동 선임되는 임시 주장 */
  actingCaptainPlayerId?: string | null;
  actingCaptainReason?: string;
  veteranLeadership: number; // 40..100
  managerRelation: number; // 40..100
  rookieAdaptationBonus: number; // -2..+5
}

export interface ExhibitionGameRecord {
  id: string;
  gameNo: number;
  opponent: TeamId;
  isHome: boolean;
  myRuns: number;
  oppRuns: number;
  result: '승' | '패' | '무';
  standoutNote: string;
  date: string;
}

export interface SpringCampState {
  season: number;
  location: '미국 애리조나' | '일본 오키나와' | '호주 멜버른' | '국내 제주·거제' | null;
  intensity: '고강도' | '균형' | '컨디션중심';
  costBillion: number;
  invitedProspectIds: string[];
  campCompleted: boolean;
  exhibitionGames: ExhibitionGameRecord[];
  summaryNote?: string;
}

export type OffseasonStep12 =
  | 'FINAL_SETTLEMENT'
  | 'OWNER_EVAL'
  | 'COACH_EVAL'
  | 'POWER_ANALYSIS'
  | 'RESERVE_AND_RELEASE'
  | 'FA_MARKET'
  | 'FOREIGN_ROSTER'
  | 'TRADE_MARKET'
  | 'SALARY_NEGOTIATION'
  | 'ROOKIE_DEVELOPMENT'
  | 'SPRING_CAMP'
  | 'OPENING_PREP';

export type OffseasonStep8 =
  | 'SETTLEMENT'
  | 'OWNER_EVAL'
  | 'COACH_STAFF'
  | 'ROSTER_CLEANUP'
  | 'PLAYER_CONTRACTS'
  | 'ROSTER_UPGRADE'
  | 'OPENING_PREP'
  | 'NEXT_SEASON_START';

export interface SalaryCapContributor {
  playerId: string;
  playerName: string;
  position: Position;
  years: number;
  rawAnnualBillion: number;
  signingBonusBillion: number;
  optionPaidBillion: number;
  baseCountedBillion: number;
  countedBillion: number;
  isException: boolean;
  clubTenureSeasons: number;
  formulaLabel: string;
}

export interface SalaryCapSummary {
  season: number;
  capBillion: number;
  capManwon: number;
  floorEnabled: boolean;
  floorBillion: number | null;
  floorManwon: number | null;
  grossTop40PayrollBillion: number;
  teamTop40PayrollBillion: number;
  franchiseExceptionPlayerId: string | null;
  franchiseExceptionPlayerName: string | null;
  franchiseExceptionSavedBillion: number;
  overCapBillion: number;
  currentStreak: number;
  exceedCount: number; // projected consecutive exceed count if season ended now
  luxuryTaxRatePct: number; // 0 | 30 | 50 | 100
  luxuryTaxBillion: number;
  draftPenaltyWarning: boolean;
  pendingDraftPenaltyForSeason: number | null;
  underFloorBillion: number;
  underFloorCurrentStreak: number;
  underFloorProjectedStreak: number;
  floorPenaltyRatePct: number; // 0 | 30 | 50 | 100
  floorPenaltyBillion: number;
  totalProjectedPenaltyBillion: number;
  topContributors: SalaryCapContributor[];
}

export interface ClubSalaryCapSeasonRecord {
  season: number;
  teamId: TeamId;
  capBillion: number;
  capManwon: number;
  floorBillion: number | null;
  floorManwon: number | null;
  grossTop40PayrollBillion: number;
  top40PayrollBillion: number;
  franchiseExceptionPlayerId: string | null;
  franchiseExceptionPlayerName: string | null;
  franchiseExceptionSavedBillion: number;
  overCapBillion: number;
  exceedStreakAfter: number;
  luxuryTaxRatePct: number;
  luxuryTaxBillion: number;
  draftPenaltyTriggered: boolean;
  draftPenaltyTargetSeason: number | null;
  draftPenaltyApplied: boolean;
  underFloorBillion: number;
  underFloorStreakAfter: number;
  floorPenaltyRatePct: number;
  floorPenaltyBillion: number;
  totalPenaltyBillion: number;
  deductedFromCash: boolean;
  settledAtDate: string;
}

export interface CompetitiveBalanceClubState {
  teamId: TeamId;
  exceedStreak: number;
  underFloorStreak: number;
  exceptionPlayerId: string | null;
  exceptionSeason: number;
  pendingDraftPenaltyForSeason: number | null;
  appliedDraftPenaltySeasons: number[];
  totalTaxPaidBillion: number;
  totalFloorPenaltyPaidBillion: number;
}

export interface CompetitiveBalanceState {
  schemaVersion: number;
  clubs: Record<TeamId, CompetitiveBalanceClubState>;
  settledSeasons: number[];
  seasonHistory: ClubSalaryCapSeasonRecord[];
}

export interface FaProtectionPending {
  signedPlayerId: string;
  signedPlayerName: string;
  fromTeamId: TeamId;
  faGrade: 'A' | 'B';
  protectionLimit: 20 | 25;
  protectedIds: string[];
  cashCompBillion: number;
}

export interface StaffPoachingOffer {
  id: string;
  date: string;
  staffType: '코치' | '스카우트' | '전력분석관';
  staffId?: string;
  staffName: string;
  currentRole: string;
  poachingTeamId: TeamId;
  offeredPosition: string;
  retainCostBillion: number;
  resolved?: boolean;
  outcome?: string;
}

export interface GmJobOffer {
  id: string;
  teamId: TeamId;
  contractYears: number;
  budgetBillion: number;
  targetRankLabel: string;
  pitchMessage: string;
}

export interface RetirementCeremonyRecord {
  id: string;
  season: number;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  position: Position;
  uniformNumber?: number;
  age: number;
  careerSummary: string;
  ceremonyHeadline: string;
  numberRetired: boolean;
  acknowledged?: boolean;
}

export interface OverseasReturnCandidate {
  id: string;
  playerName: string;
  /** KBO 포스팅·임의탈퇴 진출자는 원소속 구단 ID, 고교 졸업 후 해외 직행 선수는 null (원소속팀 없음) */
  originalKboTeamId: TeamId | null;
  returnPath?: '포스팅·임의탈퇴복귀' | '해외직행(원소속없음)';
  role: PlayerRole;
  position: Position;
  age: number;
  ability: number;
  potential: number;
  overseasClub: string;
  overseasSummary: string;
  demandedYears: number;
  demandedTotalBillion: number;
  signed?: boolean;
}

export interface IncomingTradeOffer {
  id: string;
  fromTeamId: TeamId;
  createdDate: string;
  expiresRound: number;
  /** 상대 구단이 우리 팀에 제시하는 선수 ID 목록 */
  offerPlayerIds: string[];
  /** 상대 구단이 우리 팀에 요구하는 선수 ID 목록 */
  requestPlayerIds: string[];
  /** 상대 구단이 추가로 제시하는 현금(억 원) */
  offerCashBillion: number;
  /** 상대 구단이 함께 제안하는 신인 지명권 라운드 */
  offerDraftPickRound?: 1 | 2 | 3 | null;
  reason: string;
  aiStance: '우승도전' | '리빌딩' | '균형운영';
  status: '대기' | '수락' | '거절' | '만료';
}

export interface UlsanWhalesPlayer {
  id: string;
  name: string;
  age: number;
  birthYear?: number;
  birthDate?: string | null;
  role: PlayerRole;
  position: Position;
  pitchRole?: Player['pitchRole'];
  ability: number;
  potential: number;
  isForeign: boolean;
  nationality: string;
  previousClub: string;
  /** 국내 선수 중 KBO 신인 드래프트 참가 이력 여부 (false면 KBO 신인 드래프트를 거쳐야 이적 가능) */
  hasKboDraftHistory: boolean;
  /** 해외 진출 후 KBO 미입단 자율 선발 선수 여부 */
  isOverseasUnentered?: boolean;
  /** 국내 선수 연봉(억 원, 최저 0.30억 = 3,000만 원) */
  salaryKrwBillion: number;
  /** 외국인 선수 연봉·계약금·옵션·이적료 포함 총액(USD, 최대 $100,000) */
  totalCapUsd?: number;
  uniformNumber: number;
  scoutingNote: string;
  futuresStats?: FuturesPlayerStats;
  /** 이적 완료 시 대상 구단 */
  transferredToTeamId?: TeamId;
  transferredSeason?: number;
  transferredDate?: string;
}

export interface UlsanWhalesTransferRecord {
  id: string;
  season: number;
  date: string;
  playerId: string;
  playerName: string;
  position: Position;
  isForeign: boolean;
  toTeamId: TeamId;
  transferFeeBillion: number;
  method: '시즌이적' | '신인드래프트';
}

export interface UlsanWhalesState {
  managerName: string;
  coachesSummary: string;
  roster: UlsanWhalesPlayer[];
  seasonTransfersUsed: number; // max 5 per season
  maxTransfersPerSeason: number; // 5
  maxForeignPlayers: number; // 6
  foreignCapUsd: number; // 100000
  domesticMinSalaryBillion: number; // 0.3 (3,000만 원)
  transferHistory: UlsanWhalesTransferRecord[];
}

export interface OptimizedLineupSlot {
  order: number; // 1..9
  roleTitle: string; // e.g. '출루형 타자'
  keyFactors: string; // e.g. '출루율, 주력, 선구안'
  playerId: string;
  playerName: string;
  naturalPosition: Position;
  assignedPosition: Position;
  ability: number;
  form: number;
  slotScore: number;
  reason: string;
}

export interface LineupOptimizationResult {
  teamId: TeamId;
  slots: OptimizedLineupSlot[];
  lineupOrder: string[];
  lineupPositions: Record<string, Position>;
  summary: string;
}

export interface NationalTeamDuty {
  tournamentName: string;
  startRound: number;
  endRound: number;
  returnDate: string;
}

export interface DevelopmentalCandidate {
  id: string;
  name: string;
  role: PlayerRole;
  position: Position;
  age: number;
  ability: number;
  potential: number;
  originNote: string;
  signingCostBillion: number;
  coachNote: string;
  season: number;
  signed?: boolean;
}

export type CoachRole = '감독' | '수석코치' | '투수코치' | '타격코치' | '배터리코치' | '수비코치';

export type CoachTacticalStyle =
  | '빅볼·공격야구'
  | '스몰볼·기동력'
  | '투수전·불펜운용'
  | '육성·데이터'
  | '밸런스';

export type CoachDevSpecialty =
  | '구속·구위'
  | '제구·변화구'
  | '장타·배럴'
  | '컨택·선구안'
  | '수비·주루'
  | '배터리·프레이밍'
  | '팀케미·관리';

export interface CoachSubRatings {
  // 감독
  tactics?: number; // 경기 전술
  lineupMgmt?: number; // 라인업·선수 활용
  pitchingChange?: number; // 투수 교체·불펜 운용
  leadership?: number; // 경기 운영·리더십 (수석코치 공용)
  // 수석코치 (리더십·선수 관리·전술 이해도 3종)
  playerManagement?: number; // 선수 관리
  tacticalUnderstanding?: number; // 전술 이해도
  // 투수코치
  stuffCoaching?: number; // 구위 지도
  controlCoaching?: number; // 제구·구종 지도
  development?: number; // 투수 성장 지도
  conditionMgmt?: number; // 컨디션·피로 관리
  // 타격코치
  contactCoaching?: number; // 컨택 지도
  powerCoaching?: number; // 장타 지도
  eyeCoaching?: number; // 선구안 지도
  slumpCare?: number; // 타자 성장·슬럼프 관리
  // 배터리코치
  framing?: number; // 프레이밍·볼배합
  pitchCalling?: number; // 투수 리드·경기운영
  catcherDefense?: number; // 도루저지·블로킹
  chemistry?: number; // 투포수 호흡
  // 수비코치
  infieldDefense?: number; // 내야 수비
  outfieldDefense?: number; // 외야 수비
  errorReduction?: number; // 실책 억제
  baseRunning?: number; // 주루·중계 플레이
}

export interface Coach {
  id: string;
  teamId: TeamId | 'FA';
  role: CoachRole;
  name: string;
  ability: number;
  contractYears: number;
  annualSalaryBillion: number;
  signingBonusBillion: number;
  totalBillion: number;
  confirmed: boolean;
  isIncumbent?: boolean;
  isVirtual?: boolean;
  nationality?: string; // '한국' | '일본' | '미국' | '도미니카' | '쿠바'
  careerNote?: string;
  roleSummary?: string;
  tacticalStyle?: CoachTacticalStyle;
  devSpecialty?: CoachDevSpecialty;
  tacticalRating?: number; // 65..95
  developmentRating?: number; // 65..95
  subRatings?: CoachSubRatings;
  /** 시즌 중 감독 경질 시 기존 코치가 맡는 감독대행 여부 */
  isActingManager?: boolean;
  /** 은퇴 선수 출신 코치인 경우 원 선수 영구 ID */
  formerPlayerPermanentId?: string;
  /** 코치 연수 수료 출처 메모 */
  coachTrainingOrigin?: string;
}

export interface BoxscoreBatterLine {
  playerId: string;
  name: string;
  position: string;
  /** 타순 (1~9번) */
  battingOrder?: number;
  /** 경기 중 교체 출전(대타·대주자·대수비·부상교체) 여부 */
  isSubstitute?: boolean;
  /** 교체 투입 역할 */
  subRole?: '대타' | '대주자' | '대수비' | '부상교체';
  /** 교체 투입 이닝 */
  enteredInning?: number;
  /** 교체 대상 원선수 ID / 이름 */
  replacedPlayerId?: string;
  replacedPlayerName?: string;
  PA: number;
  AB: number;
  H: number;
  B2: number;
  B3: number;
  HR: number;
  BB: number;
  HBP: number;
  SF: number;
  SO: number;
  R: number;
  RBI: number;
  SB: number;
  TB: number;
}

export interface BoxscorePitcherLine {
  playerId: string;
  name: string;
  GS: number;
  outs: number;
  W: number;
  L: number;
  HLD: number;
  SV: number;
  H: number;
  BB: number;
  SO: number;
  ER: number;
  R: number;
  HR: number;
  PC: number;
  BS?: number;
  QS?: number;
  QSP?: number;
  CG?: number;
  SHO?: number;
  NH?: number;
  PG?: number;
  pitchRoleUsed?: string;
  starterUsageType?: '정규선발' | '대체선발' | '임시선발' | '오프너';
}

export interface KeyPerformer {
  playerName: string;
  teamId: TeamId;
  role: '타자' | '투수';
  summary: string;
}

export interface GameRecord {
  id: string;
  round: number; // 1..144 for regular season, 1001+ for postseason
  date: string;
  awayTeam: TeamId;
  homeTeam: TeamId;
  awayRuns: number;
  homeRuns: number;
  awayHits: number | null;
  homeHits: number | null;
  awayErrors: number | null;
  homeErrors: number | null;
  innings: {
    away: number[];
    home: (number | null)[];
  } | null;
  winner: TeamId | '무승부';
  loser: TeamId | '무승부';
  isDraw: boolean;
  isPostseason: boolean;
  postseasonRound?: PostseasonRound;
  source: string;
  isSynthetic: boolean;
  verified?: boolean;
  validationNote?: string;
  keyPerformers: KeyPerformer[];
  extraInnings?: number;
  isRainoutRescheduled?: boolean;
  isDoubleheader?: boolean;
  doubleheaderGameNo?: 1 | 2;
  substitutionNotes?: string[];
  isRivalryGame?: boolean;
  rivalryName?: string;
  rivalryIntensity?: number;
  rivalryEffectNote?: string;
  weather?: GameWeather;
  boxscore: {
    awayBatters: BoxscoreBatterLine[];
    homeBatters: BoxscoreBatterLine[];
    awayPitchers: BoxscorePitcherLine[];
    homePitchers: BoxscorePitcherLine[];
  } | null;
}

export type RivalryTier = '경쟁' | '격돌' | '숙적';

export interface RivalryRecord {
  id: string;
  teamA: TeamId;
  teamB: TeamId;
  name: string;
  subtitle: string;
  intensity: number; // 45..100
  isDynamic?: boolean;
  /** 사용자 단장이 중점 숙적 라이벌로 지정한 경우 */
  userFocused?: boolean;
  seasonWinsA: number;
  seasonWinsB: number;
  seasonDraws: number;
  allTimeWinsA: number;
  allTimeWinsB: number;
  allTimeDraws: number;
  lastMeetingDate?: string;
  lastMeetingNote?: string;
}

export interface ScheduledSeries {
  seriesIndex: number; // 1..48+
  startRound: number;
  endRound: number;
  dates: string[];
  matchups: { away: TeamId; home: TeamId }[]; // 5 matchups per series
  completedRounds: number; // 0..dates.length
  hasMondayRestBefore?: boolean;
  isAllStarBreakBefore?: boolean;
  isChildrenDaySeries?: boolean;
  isMakeupWindow?: boolean;
  travelDistanceKm?: number;
  rainoutCount?: number;
  doubleheaderNote?: string;
  scheduleSource?: 'OFFICIAL' | 'PROJECTED';
  postponedDates?: string[];
}

export interface StandingsRow {
  rank: number;
  isTied: boolean;
  teamId: TeamId;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  pct: number;
  gb: number;
  streak: string;
  runsScored: number;
  runsAllowed: number;
  runDiff: number;
}

export interface GrowthLog {
  id: string;
  date: string;
  round: number;
  teamId: TeamId;
  playerId: string;
  playerName: string;
  age: number;
  sampleText: string;
  prevAbility: number;
  form: number;
  delta: number;
  nextAbility: number;
  reason: string;
  trainingFocus?: TrainingFocus;
  coachContribution?: number;
  facilityContribution?: number;
  playingTimeNote?: string;
}

export interface InjuryLog {
  id: string;
  date: string;
  round: number;
  teamId: TeamId;
  playerId: string;
  playerName: string;
  severity: InjurySeverity;
  days: number;
  description: string;
}

export interface TransactionLog {
  id: string;
  date: string;
  type: '계약' | '트레이드' | '드래프트' | '엔트리' | '포스팅' | '재정' | '육성' | '면담';
  teamId: TeamId;
  summary: string;
  detail?: string;
}

export interface UnpaidObligationItem {
  id: string;
  label: string;
  currency: 'KRW' | 'USD';
  amount: number; // 억 KRW or USD
  paidAmount: number;
}

export interface SponsorContract {
  id: string;
  name: string;
  industry: string;
  tier: '프리미엄' | '메이저' | '스탠다드';
  brandCode: string;
  brandColor: string;
  brandAccent: string;
  signingBonusBillion: number;
  perSeriesBonusBillion: number;
  winBonusBillion: number;
  attendanceBonusBillion: number; // 홈 관중 75% 초과 시 시리즈 보너스
  merchBoostPct: number;
  contractYears: number;
  yearsRemaining?: number;
  status?: '계약중' | '만료';
  negotiationFocus?: '균형' | '계약금' | '승리보너스' | '관중보너스';
  description: string;
  signedDate?: string;
}

export interface ClubInvestments {
  stadiumLevel: number; // 1..5
  marketingLevel: number; // 1..5
  academyLevel: number; // 1..5
  medicalLevel: number; // 1..5
}

export interface SeriesFinancialSummary {
  ticketBillion: number;
  uniformBillion: number;
  merchCogsBillion?: number;
  sponsorBillion: number;
  attendanceBonusBillion?: number;
  operatingCostBillion?: number;
  travelCostBillion?: number;
  payrollCostBillion?: number;
  incentiveCostBillion?: number;
  totalBillion: number;
  netBillion?: number;
  totalSpectators: number;
  uniformUnitsSold: number;
  rivalryName?: string;
  rivalryAttendanceBoostPct?: number;
  rivalryMerchBoostPct?: number;
}

export type TicketPricePolicy = '저가' | '표준' | '프리미엄';

export interface DeadMoneyEntry {
  id: string;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  releasedDate: string;
  releasedSeason: number;
  currency: 'KRW' | 'USD';
  annualObligationBillion: number;
  remainingSeasons: number;
  totalRemainingBillion: number;
  reason: string;
}

export interface FinancesLedger {
  krwUnpaidBillion: number;
  usdUnpaid: number;
  krwCashPaidBillion: number;
  usdCashPaid: number;
  cashBalanceBillion: number | null; // null => '미확인'
  startingCashBillion?: number;
  perazaContractNote: string;
  seasonRevenueBillion: number;
  seasonExpenseBillion: number;
  operatingExpenseBillion?: number;
  travelExpenseBillion?: number;
  merchCogsBillion?: number;
  payrollPaidBillion?: number;
  incentivePaidBillion?: number;
  signingBonusPaidBillion?: number;
  optionBonusPaidBillion?: number;
  compensationPaidBillion?: number;
  compensationReceivedBillion?: number;
  deadMoneyPaidBillion?: number;
  deadMoneyEntries?: DeadMoneyEntry[];
  cumulativeDeficitBillion?: number;
  consecutiveDeficitSeasons?: number;
  spendingFrozenReason?: string | null;
  ticketRevenueBillion?: number;
  uniformRevenueBillion?: number;
  sponsorRevenueBillion?: number;
  postingRevenueBillion?: number;
  sponsor?: SponsorContract | null;
  investments?: ClubInvestments;
  ticketPricePolicy?: TicketPricePolicy;
  activeSpendOfferIds?: string[];
  usedSpendOfferIds?: string[];
  obligations: UnpaidObligationItem[];
  facilityCondition?: FacilityConditionState;
  luxuryTaxPaidBillion?: number;
  salaryCapExceedStreak?: number;
  ownerBudgetCapBillion?: number; // 구단주 시즌 예산 한도
  maintenanceExpenseBillion?: number;
  franchiseMerchRevenueBillion?: number; // 프랜차이즈 스타 기념상품 시즌 누적 매출
}

export interface TeamState {
  teamId: TeamId;
  lineupOrder: string[]; // 9 player IDs
  lineupPositions: Record<string, Position>;
  rotationOrder: string[]; // 5 pitcher IDs
  bullpenOrder: string[]; // pitcher IDs
  benchOrder: string[]; // hitter IDs
  nextStarterIdx: number;
  atmosphere: TeamAtmosphere;
  popularity: number; // 0..100
  fanSentiment?: number; // 0..100
  fanSentimentReason?: string;
  clubReputation?: number; // 구단 평판 0..100 (프랜차이즈 스타 대우·트레이드·은퇴식 반영)
  leadership?: TeamLeadershipState;
  /** 매년 새로 발표되는 구단 유니폼 에디션 */
  currentUniform?: ClubUniformEdition;
  uniformHistory?: ClubUniformEdition[];
  /** 전년도 한국시리즈 우승에 따른 차기 시즌 구단 운영 예산 보너스(%) */
  championshipBudgetBoostPct?: number;
}

export interface ClubUniformEdition {
  season: number;
  teamId: TeamId;
  editionName: string;
  homeTheme: string;
  awayTheme: string;
  altTheme: string;
  pattern: 'pinstripe' | 'raglan' | 'classic' | 'modern-stripe' | 'v-collar';
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  releasedDate: string;
  merchBoostPct: number;
  headline: string;
  /** 현실 KBO 구단 유니폼 상세 사양 */
  kitSupplier?: string;
  homeWordmark?: string;
  awayWordmark?: string;
  altWordmark?: string;
  homeBodyHex?: string;
  awayBodyHex?: string;
  altBodyHex?: string;
  homePattern?: 'pinstripe' | 'raglan' | 'classic' | 'modern-stripe' | 'v-collar';
  awayPattern?: 'pinstripe' | 'raglan' | 'classic' | 'modern-stripe' | 'v-collar';
  altPattern?: 'pinstripe' | 'raglan' | 'classic' | 'modern-stripe' | 'v-collar';
  homeStripeHex?: string;
  homeTrimHex?: string;
  awayTrimHex?: string;
  altTrimHex?: string;
  iconicNumber?: string;
}

export interface DraftCandidate {
  id: number;
  name: string;
  age: number;
  originType: '고졸' | '대학' | '독립리그';
  school: string;
  role: PlayerRole;
  position: Position;
  ability: number;
  potential: number;
  scoutedAbility?: number;
  scoutedPotential?: number;
  scoutAccuracy?: '미확인' | '보통' | '정밀';
  hiddenTrait?: string;
  scoutGrade?: 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C';
  scoutTag?: string;
  amateurSummary: string;
  draftedBy?: TeamId;
  pickNotation?: string;
  signingBonusBillion: number;
  /** 영구 고유 ID (고교·대학·해외파·KBO 드래프트 전 구간 연동) */
  permanentId?: string;
  birthYear?: number;
  birthDate?: string | null;
  /** 해외파 복귀 신청 후 자격 심사 통과 여부 */
  isOverseasReturnee?: boolean;
  overseasReturnNote?: string;
  /** 신인 드래프트 행사장 공식 초청 선수 여부 */
  invitedToDraftCeremony?: boolean;
  /** 고교 최대어 / 대학 최대어 칭호 */
  topProspectBadge?: '고교 최대어' | '대학 최대어';
}

export interface DraftPickProvenance {
  round: number;
  originalTeamId: TeamId;
  ownerTeamId: TeamId;
  acquiredViaTradeNote?: string;
  acquiredDate?: string;
}

export interface DraftState {
  season: number;
  completed: boolean;
  currentRound: number; // 1..11
  currentPickInRound: number; // 1..10
  draftOrder: TeamId[]; // 10 teams (기본 2~11R 및 정상 1R 순서)
  /** 경쟁균형세 3년 연속 초과 제재(1R 9단계 하락)가 반영된 1라운드 전용 순서 */
  round1DraftOrder?: TeamId[];
  round1PenaltyNotes?: { teamId: TeamId; fromPick: number; toPick: number; reason: string }[];
  /** 지명권 출처(원소속 구단 vs 트레이드 획득 구단) 추적 */
  pickProvenance?: DraftPickProvenance[];
  candidates: DraftCandidate[];
  picks: {
    round: number;
    pickInRound: number;
    pickNotation: string;
    teamId: TeamId;
    originalTeamId?: TeamId;
    acquiredViaTradeNote?: string;
    candidateId: number;
    playerName: string;
    position: Position;
    ability: number;
    potential: number;
    signingBonusBillion: number;
  }[];
}

export interface PostingOffer {
  mlbTeam: string;
  years: number;
  guaranteedUsdMillions: number;
  postingFeeUsd: number;
}

export interface PostingRecord {
  id: string;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  requestedDate: string;
  announcedDate: string;
  deadlineDate: string;
  offers: PostingOffer[];
  status: '심사중' | '협상중' | '계약성사' | '협상결렬';
  acceptedOffer?: PostingOffer;
  feePaidUsd: number;
  fundsClaimedToCash?: boolean;
  convertedCashBillion?: number;
  rejectionReason?: string;
}

export interface PostseasonSeriesState {
  round: PostseasonRound;
  label: string;
  higherSeedTeam: TeamId;
  lowerSeedTeam: TeamId;
  higherSeedRank: number;
  lowerSeedRank: number;
  higherWins: number;
  lowerWins: number;
  winsRequiredHigher: number;
  winsRequiredLower: number;
  games: GameRecord[];
  winnerTeam: TeamId | null;
}

export interface ChampionRecord {
  season: number;
  championTeamId: TeamId;
  runnerUpTeamId: TeamId | null;
  seriesScore: string;
  ksMvpName: string;
  ksMvpSummary: string;
  rewardCashBillion: number;
  isHistoricalBaseline?: boolean;
  date: string;
}

export interface ChampionEventState {
  season: number;
  championTeamId: TeamId;
  runnerUpTeamId: TeamId;
  seriesScore: string;
  ksMvp: AwardEntry | null;
  isPlayerChampion: boolean;
  rewardCashBillion: number;
  popularityBoost: number;
  headline: string;
  details: string[];
  acknowledged?: boolean;
}

export interface PostseasonState {
  active: boolean;
  currentRound: PostseasonRound;
  standingsSeed: TeamId[]; // top 5 teams
  seriesHistory: PostseasonSeriesState[];
  currentSeries: PostseasonSeriesState | null;
  champion: TeamId | null;
  ksMvp?: AwardEntry | null;
  championEvent?: ChampionEventState | null;
}

export interface PlayerAwardHonor {
  season: number;
  awardType: 'MVP' | '신인왕' | '골든글러브' | '한국시리즈 MVP' | '최동원상';
  label: string;
  positionLabel?: string;
  teamId: TeamId;
  normalizedScore?: number;
  statSummary: string;
}

export interface AwardEntry {
  category: string;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  statSummary: string;
  votes?: number;
  note?: string;
  /** 골든글러브 공식 포지션명 (투수, 포수, 1루수, 2루수, 3루수, 유격수, 외야수, 지명타자) */
  positionLabel?: string;
  /** 투수·타자 직접 비교용 0~100 정규시즌 정규화 평가점수 */
  normalizedScore?: number;
  /** 2026 KBO 공식 후보 자격 근거 (규정이닝, 10승/30세이브/30홀드, 720수비이닝, DH 297타석, 타이틀홀더 예외 등) */
  eligibilityNote?: string;
  /** 공식 타이틀홀더 예외 자격으로 후보 등재 여부 */
  isTitleHolderException?: boolean;
  /** 해당 부문 공식 후보 수 */
  candidateCount?: number;
}

export interface ManagerOfYearAward {
  managerName: string;
  teamId: TeamId;
  wins: number;
  losses: number;
  draws: number;
  rank: number;
  summary: string;
  votes?: number;
}

export interface SeasonAwards {
  season: number;
  championTeamId?: TeamId | null;
  runnerUpTeamId?: TeamId | null;
  koreanSeriesMvp?: AwardEntry | null;
  managerOfTheYear?: ManagerOfYearAward | null;
  mvp: AwardEntry | null;
  rookieOfYear: AwardEntry | null;
  choiDongWon: AwardEntry | null;
  goldenGloves: AwardEntry[];
  defenseAwards: AwardEntry[];
  battingTitles: AwardEntry[];
  pitchingTitles: AwardEntry[];
  /** 단장이 시즌 시상식 화면을 확인하고 오프시즌으로 이동했는지 여부 */
  ceremonyConfirmed?: boolean;
  ceremonyConfirmedAt?: string;
  /** 적용된 공식 시상 규정 버전 */
  officialRuleVersion?: string;
}

export interface CoachSwapReport {
  id: string;
  coachName: string;
  coachRole: CoachRole;
  slumpingPlayerId: string;
  slumpingPlayerName: string;
  slumpingForm: number;
  recommendedPlayerId: string;
  recommendedPlayerName: string;
  recommendedForm: number;
  reason: string;
  applied?: boolean;
}

export interface SeriesFeedback {
  managerName: string;
  summary: string;
  offenseNote: string;
  pitchingNote: string;
  nextSeriesFocus: string;
  rainoutNote?: string;
}

export interface SeriesReport {
  id: string;
  title: string;
  isPostseason: boolean;
  playerTeamGames: GameRecord[];
  allGamesInWindow: GameRecord[];
  newInjuries: InjuryLog[];
  newGrowths: GrowthLog[];
  financialSummary?: SeriesFinancialSummary;
  seriesFeedback?: SeriesFeedback;
  coachReports?: CoachSwapReport[];
  createdAt: string;
}

export interface NewsArticle {
  id: string;
  date: string;
  season: number;
  category:
    | '경기·시리즈'
    | '타구단소식'
    | 'MLB소식'
    | '구단사건'
    | '이적·계약'
    | '수상·이달의선수'
    | '국제·병역'
    | '규정·웨이버';
  headline: string;
  body: string;
  teamId?: TeamId;
  isHighlight?: boolean;
  fanSentimentImpact?: number;
  attendanceImpactPct?: number;
  ownerTrustImpact?: number;
  verifiedStats?: boolean;
}

export interface ClubEventChoice {
  id: string;
  label: string;
  effectPreview: string;
}

export interface ClubEventRecord {
  id: string;
  date: string;
  type:
    | '선수부진'
    | '깜짝성장'
    | '코치갈등'
    | '구단주투자'
    | '이달의선수'
    | '부상속보'
    | '팬여론'
    | '감독경질'
    | '구단주긴급면담'
    | '스타이적요청'
    | 'FA경쟁입찰'
    | '코치스카우트'
    | '핵심해외진출'
    | '비상운영';
  title: string;
  description: string;
  targetPlayerId?: string;
  targetTeamId?: TeamId;
  targetCoachId?: string;
  metaCostBillion?: number;
  choices?: ClubEventChoice[];
  resolved?: boolean;
  resolutionSummary?: string;
}

export type DissatisfactionLevel = '만족' | '보통' | '불만' | '높은 불만' | '심각한 불만';

export type DissatisfactionCause =
  | '출전 기회 부족'
  | '2군 강등'
  | '연봉 불만'
  | '감독 갈등'
  | '계약 문제'
  | '보직/역할 변경';

export type GmMeetingAction =
  | '출전 기회 검토'
  | '계약 협상'
  | '감독 면담'
  | '트레이드 검토';

export interface PendingMeetingFollowUp {
  action: GmMeetingAction;
  meetingDate: string;
  meetingRound: number;
  evalAfterRound: number;
  startGames: number;
  startSalary: number;
  startContractYears: number;
  startTier: RosterTier;
  resolved?: boolean;
  outcomeNote?: string;
}

export interface PlayerMeetingRecord {
  id: string;
  date: string;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  action: GmMeetingAction;
  beforeScore: number;
  afterScore: number;
  causesAtMeeting: DissatisfactionCause[];
  summary: string;
}

export interface PlayerComplaint {
  id: string;
  playerId: string;
  playerName: string;
  position: Position;
  reason:
    | '출장기회'
    | '연봉불만'
    | '포스팅희망'
    | '트레이드요구'
    | '2군강등'
    | '보직변경'
    | '감독갈등'
    | '계약문제';
  severity: '경고' | '심각';
  message: string;
  createdDate: string;
  unresolvedSeries: number;
  resolved?: boolean;
  resolutionNote?: string;
  dissatisfactionScore?: number;
}

export type FuturesTeamId = TeamId | '상무' | '울산';
export type FuturesDivision = '북부리그' | '남부리그';

export interface FuturesStandingRow {
  teamId: FuturesTeamId;
  division?: FuturesDivision;
  officialName?: string;
  homeCity?: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface OverseasTrainingRecord {
  id: string;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  programId: 'US_DRIVELINE' | 'JP_MIYAZAKI' | 'AUS_WINTER';
  location: string;
  costBillion: number;
  startRound: number;
  returnRound: number;
  status: '연수중' | '복귀완료';
  resultSummary?: string;
}

export interface ManagerFiringRecord {
  id: string;
  season: number;
  date: string;
  teamId: TeamId;
  firedManagerName: string;
  newManagerName: string;
  reason: string;
  rankAtFiring: number;
  winPctAtFiring: number;
}

export interface SeasonHistorySummary {
  season: number;
  regularChampionTeamId: TeamId;
  koreanSeriesChampionTeamId: TeamId | null;
  runnerUpTeamId: TeamId | null;
  playerTeamId: TeamId;
  playerTeamRank: number;
  playerTeamRecord: string;
  seasonMvpName: string;
  ksMvpName: string;
  managerOfTheYearName?: string;
  hrLeader: string;
  avgLeader: string;
  winsLeader: string;
  eraLeader: string;
}

export interface MlbExportPlayerRecord {
  id: string;
  playerName: string;
  fromKboTeamId: TeamId;
  position: Position;
  role: PlayerRole;
  mlbTeam: string;
  seasonExported: number;
  contractYears: number;
  guaranteedUsdMillions: number;
  status: '메이저리그 주전' | '메이저리그 로스터' | '마이너 AAA' | '부상자 명단' | '올스타급 활약';
  latestStatLine: string;
  lastUpdatedDate: string;
  mlbGames: number;
  mlbHR?: number;
  mlbAVG?: number;
  mlbWins?: number;
  mlbERA?: number;
  mlbSO?: number;
  /** MLB 진출 경로 (포스팅 / 해외FA / 외국인역수출) */
  exportRoute?: '포스팅' | '해외FA' | '외국인역수출';
}

export interface KboRuleItem {
  id: string;
  name: string;
  category: '경기운영' | '로스터·외국인' | '판정·장비' | 'FA·드래프트';
  description: string;
  introducedSeason: number;
  effectSummary: string;
  runEnvDelta?: number; // e.g. +0.03 타자친화, -0.03 투수친화
  extraInningCap?: number; // e.g. 11 or 12
  extraInningTiebreaker?: boolean; // 승부치기 여부
  asiaQuotaLimit?: number; // default 1, can expand to 2
  foreignSalaryCapUsd?: number; // default 4000000
}

export interface KboRuleChangeLog {
  id: string;
  season: number;
  action: '추가' | '수정' | '폐지';
  ruleName: string;
  detail: string;
}

export interface NationalTeamEvent {
  id: string;
  season: number;
  tournamentName: string; // e.g. '2026 WBC', '2026 아시안게임', '2027 프리미어12', '2028 LA 올림픽'
  date: string;
  selectedPlayers: { playerId: string; playerName: string; teamId: TeamId; position: Position }[];
  resultTitle: string; // '우승' | '준우승' | '동메달' | '4강 진출' | '조별리그 탈락'
  mvpName: string;
  summary: string;
  militaryExemptionGranted?: boolean;
  isAutoCalledUp?: boolean;
  /** 대회 및 최종 성적에 따라 대표 선수단 전원에게 부여된 KBO 공식 FA 보상일수 */
  compensationDaysAwarded?: number;
  compensationRuleLabel?: string;
}

export interface WaiverPlayerItem {
  id: string;
  player: Player;
  fromTeamId: TeamId;
  waivedDate: string;
  /** 7일 영입 신청 마감일 (YYYY-MM-DD) */
  expiresDate?: string;
  /** 공식 KBO 웨이버 이적료 (기본 300만 원 = 0.003억 원) */
  claimCostBillion: number;
  /** 공식 KBO 웨이버 이적료 만원 표기 (300) */
  claimFeeManwon?: number;
  /** 7일 내 영입 신청을 접수한 구단 목록 (복수 신청 시 하위 순위 우선권) */
  claimTeamIds?: TeamId[];
  /** 승계 대상 원소속 계약 정보 */
  preservedContract?: PlayerContract;
  reason: string;
  expiresAtRound: number;
}

export type UnclaimedFreeAgentStatus =
  | '당해시즌계약금지'
  | '계약가능'
  | '독립리그'
  | '은퇴'
  | '재계약완료';

export interface UnclaimedFreeAgentItem {
  id: string;
  player: Player;
  formerTeamId: TeamId;
  waivedDate: string;
  enteredFreeAgentDate: string;
  /** 웨이버 미영입 시즌 (해당 시즌에는 KBO 계약 금지) */
  waivedSeason: number;
  /** 계약 가능 시즌 (waivedSeason + 1) */
  eligibleSeason: number;
  status: UnclaimedFreeAgentStatus;
  /** 독립리그 진출 시 소속 구단명 */
  independentClubName?: string;
  /** 은퇴 또는 독립리그 이동 사유/일자 */
  statusUpdatedDate?: string;
  statusNote?: string;
  /** 재계약 완료 시 영입 구단 */
  signedTeamId?: TeamId;
}

export interface ScoutDispatchMission {
  id: string;
  region: '미국 AAA' | '일본 NPB 2군' | '중남미 윈터리그' | '대만 CPBL';
  costBillion: number;
  dispatchedDate: string;
  completedRound: number;
  status: '진행중' | '완료';
  discoveredCandidate?: VirtualForeignPoolItem;
}

export interface OwnerEvaluationBreakdown {
  /** 성적 목표 달성 (최대 40점) */
  performanceScore: number;
  /** 재정 건전성 및 경쟁균형세 관리 (최대 20점) */
  financeScore: number;
  /** 유망주 육성 및 미래 전력 (최대 15점) */
  developmentScore: number;
  /** 팬 만족도 · 관중 · 라이벌전 (최대 15점) */
  fanScore: number;
  /** 선수단 기강 · 리더십 · 프랜차이즈 예우 (최대 10점) */
  leadershipScore: number;
  /** 종합 점수 (0..100) */
  totalScore: number;
  projectedGrade: 'S' | 'A' | 'B' | 'C' | 'F';
  highlights: string[];
  concerns: string[];
  budgetDirective: string;
  nextSeasonBudgetDeltaPct: number;
}

export interface OwnerEvaluationState {
  season: number;
  targetRank: number;
  targetRankLabel: string;
  targetProfitNote: string;
  ownerTrust: number; // 0..100
  lastSeasonGrade?: 'S' | 'A' | 'B' | 'C' | 'F';
  lastSeasonVerdict?: '장기 재계약' | '재계약' | '유임 (경고)' | '해임 통보';
  evaluationComment?: string;
  isFired?: boolean;
  breakdown?: OwnerEvaluationBreakdown;
}

// =============================================================================
// AMATEUR BASEBALL, MLB 30-CLUB INTERNATIONAL SCOUTING & OVERSEAS AUTO-MANAGER
// =============================================================================

export type AmateurCareerPath =
  | '재학중'
  | 'KBO드래프트참가'
  | '국내대학진학'
  | '해외대학진학'
  | '해외프로계약'
  | '독립리그'
  | '은퇴';

export type OverseasScoutingStatus = '없음' | '관심' | '협상' | '계약임박' | '계약확정';

export interface MlbClubScoutingBudget {
  clubName: string;
  shortName: string;
  division: string;
  maxBonusPoolUsd: number;
  remainingBonusPoolUsd: number;
  focusRole: '투수' | '타자' | '균형';
}

export interface AmateurProspect {
  permanentId: string;
  name: string;
  birthYear: number;
  birthDate?: string | null;
  age: number;
  role: PlayerRole;
  position: Position;
  schoolType: '고교' | '대학';
  schoolName: string;
  /** 고교: 1~3학년, 대학: 1~4학년 */
  grade: 1 | 2 | 3 | 4;
  ability: number;
  potential: number;
  fastballKmh?: number;
  batPowerGrade?: number;
  batContactGrade?: number;
  seasonG: number;
  seasonStatSummary: string;
  /** 타자 간소화 시즌 성적 */
  battingLine?: { avg: number; hr: number; rbi: number; sb: number; ops: number };
  /** 투수 간소화 시즌 성적 */
  pitchingLine?: { w: number; l: number; era: number; ip: number; so: number };
  projectedDraftRank: number;
  draftEligibleSeason: number;
  isEarlyDraftEligible?: boolean;
  careerPath: AmateurCareerPath;
  /** MLB 30개 구단 종합 관심도 (0..100) */
  overseasInterestLevel: number;
  /** 선수 본인 해외 진출 의향 (0..100) */
  playerOverseasDesire: number;
  /** 미성년 계약 시 보호자 동의 및 법적 절차 충족 여부 */
  guardianConsentReady: boolean;
  overseasStatus: OverseasScoutingStatus;
  interestedMlbClubs: {
    clubName: string;
    interestScore: number;
    offeredBonusUsd: number;
  }[];
  signedMlbClub?: string;
  signedBonusUsd?: number;
  signedSeason?: number;
  youthIntlNote?: string;
  watchlisted?: boolean;
  draftedToTeamId?: TeamId;
  draftedSeason?: number;
}

export interface AmateurTournamentResult {
  id: string;
  season: number;
  month: number;
  category: '고교' | '대학';
  tournamentName: string;
  championSchool: string;
  runnerUpSchool: string;
  mvpPermanentId: string;
  mvpName: string;
  mvpSchool: string;
  mvpPosition: Position;
  mvpStatLine: string;
  standoutProspectIds: string[];
  summary: string;
}

export type OverseasLeagueLevel =
  | 'MLB'
  | 'AAA'
  | 'AA'
  | 'High-A'
  | 'Single-A'
  | 'Rookie'
  | 'A+'
  | 'A'
  | 'NPB'
  | 'NPB2군'
  | 'FA/방출';

export type OverseasCanonicalTier = 'MLB' | 'AAA' | 'AA' | 'High-A' | 'Single-A' | 'Rookie';

export interface OverseasSeasonStatLine {
  season: number;
  league: OverseasLeagueLevel;
  clubName: string;
  g: number;
  // Batter
  pa?: number;
  ab?: number;
  avg?: number;
  obp?: number;
  slg?: number;
  h?: number;
  hr?: number;
  rbi?: number;
  bb?: number;
  sb?: number;
  ops?: number;
  // Pitcher
  w?: number;
  l?: number;
  era?: number;
  whip?: number;
  ip?: number;
  so?: number;
  er?: number;
  hAllowed?: number;
  bbAllowed?: number;
  hld?: number;
  sv?: number;
}

export interface OverseasTransferEvent {
  date: string;
  season: number;
  eventType:
    | '계약'
    | '승격'
    | '강등'
    | '재활배정'
    | '이적'
    | '트레이드'
    | '재계약'
    | '방출'
    | 'MLB데뷔'
    | '국내복귀신청'
    | 'KBO복귀'
    | '은퇴';
  fromClub?: string;
  toClub: string;
  fromLeague?: OverseasLeagueLevel;
  toLeague?: OverseasLeagueLevel;
  note: string;
}

export interface OverseasPlayerRecord {
  permanentId: string;
  sourceKboPlayerId?: string;
  name: string;
  birthYear: number;
  birthDate?: string | null;
  age: number;
  role: PlayerRole;
  position: Position;
  ability: number;
  potential: number;
  /** 아마추어 해외 직행 vs 기존 KBO 소속 해외 진출 구분 */
  originCategory: '아마추어직행' | 'KBO출신(포스팅·FA)' | 'KBO출신(임의탈퇴)';
  /** KBO 출신은 원소속 구단 ID, 아마추어 직행 선수는 null */
  originalKboTeamId: TeamId | null;
  league: OverseasLeagueLevel;
  clubName: string;
  contractYearsRemaining: number;
  annualSalaryUsdThousands: number;
  signingBonusUsd?: number;
  /** 해외 계약 유형 (메이저 보장 / 스플릿 / 마이너 / 국제 아마추어) */
  contractType?: '메이저보장' | '스플릿' | '마이너계약' | '국제아마추어';
  /** 마이너리그 옵션 잔여 횟수 (0~3 · 0이면 강등 시 DFA/트레이드/방출 검토) */
  minorOptionsRemaining?: number;
  /** 당해 시즌 옵션 소진 여부 (1시즌 1회 차감) */
  optionUsedSeason?: number;
  /** 소속 구단 로스터 경쟁도 (승격·강등 기준선 보정) */
  rosterCompetition?: '여유' | '보통' | '치열';
  /** 부상 재활 배정 정보 (복귀 대상 원 소속 리그 및 잔여 재활 경기 수) */
  rehabFromLeague?: OverseasLeagueLevel;
  rehabGamesRemaining?: number;
  status: '현역' | '부상자명단' | '재활경기' | '방출대기' | '국내복귀신청' | 'KBO복귀완료' | '은퇴';
  injuryDaysRemaining?: number;
  /** 해외 계약 종료일 (ISO YYYY-MM-DD) */
  overseasContractEndDate?: string;
  /** KBO 규약 제107조 적용 국내 계약 가능일 (해외 계약 종료일 + 2년 등) */
  domesticEligibleDate?: string;
  /** 국내 복귀 제한 기간 활성 여부 */
  returnRestrictionActive: boolean;
  returnRestrictionNote: string;
  /** 해외파 신인 드래프트 참가 신청 심사 상태 */
  draftApplication?: {
    targetSeason: number;
    appliedDate: string;
    eligibilityRefDate: string;
    applicationDeadlineDate: string;
    approved: boolean;
    reviewReason: string;
  };
  /** 동일 월 중복 시뮬레이션 방지 키 (YYYY-MM) */
  lastSimulatedMonthKey?: string;
  /** 14일 주기 자동 승격·강등 마지막 검토일 (YYYY-MM-DD) */
  lastEvaluatedDate?: string;
  /** 마지막 승격·강등 이동일 (잦은 요요 이동 방지 쿨다운용) */
  lastMovementDate?: string;
  /** 현재 리그 체류 일수 */
  daysAtCurrentLevel?: number;
  currentSeasonStats: OverseasSeasonStatLine;
  /** 당해 시즌 리그 등급별 성적 분리 저장 (MLB · AAA · AA · High-A · Single-A · Rookie) */
  seasonStatsByLevel?: Partial<Record<OverseasLeagueLevel, OverseasSeasonStatLine>>;
  /** 통산 리그 등급별 누적 성적 분리 저장 */
  careerStatsByLevel?: Partial<Record<OverseasLeagueLevel, OverseasSeasonStatLine>>;
  seasonHistory: OverseasSeasonStatLine[];
  transferHistory: OverseasTransferEvent[];
  mlbDebutSeason?: number;
  isVerifiedRealPlayer?: boolean;
  /** 해외파 병역 상태 (국가대표 선발 및 입상 병역특례 연동) */
  militaryStatus?: '미필' | '군필' | '면제' | '복무중';
  militaryNote?: string;
  /** 해외파 국내 복귀설 보도된 시즌 */
  returnRumorPublishedSeason?: number;
}

export interface AnnualTopAmateurRecord {
  season: number;
  topHighSchool: {
    permanentId: string;
    name: string;
    schoolName: string;
    position: Position;
    ability: number;
    potential: number;
    summary: string;
  } | null;
  topCollege: {
    permanentId: string;
    name: string;
    schoolName: string;
    position: Position;
    ability: number;
    potential: number;
    summary: string;
  } | null;
  draftInviteePermanentIds: string[];
  draftInvitees: {
    permanentId: string;
    name: string;
    schoolName: string;
    schoolType: '고교' | '대학';
    position: Position;
    projectedRank: number;
  }[];
}

export interface AmateurAndOverseasState {
  schemaVersion: number;
  initializedSeason: number;
  mlbClubBudgets: MlbClubScoutingBudget[];
  prospects: AmateurProspect[];
  tournamentResults: AmateurTournamentResult[];
  overseasPlayers: OverseasPlayerRecord[];
  /** 시즌별 해외 아마추어 계약 확정 인원 수 (연 0~3명 제한 관리) */
  overseasAmateurSigningsBySeason: Record<number, number>;
  /** 마지막 월별 자동 처리 키 (YYYY-MM) */
  lastMonthlyProcessedKey?: string;
  /** 마지막 14일 주기 MLB/마이너리그 승격·강등 처리 날짜 (YYYY-MM-DD) */
  lastBiweeklyProcessedDate?: string;
  /** 매년 선정되는 고교 최대어 · 대학 최대어 · 드래프트 현장 초청 명단 */
  annualTopProspects?: AnnualTopAmateurRecord[];
}

export interface RetiredNumberRecord {
  teamId: TeamId;
  number: number;
  playerName: string;
  position: Position;
  retiredSeason: number;
  careerSummary: string;
}

export interface HallOfFameRecord {
  playerId: string;
  playerName: string;
  teamId: TeamId;
  position: Position;
  inductedSeason: number;
  careerSummary: string;
}

export interface TrophyRecord {
  id: string;
  season: number;
  teamId: TeamId;
  title: string;
  category: '우승' | '시즌기록' | '경영' | '개인배출' | '국제대회';
  description: string;
  earnedDate: string;
}

export interface LeagueHistoryState {
  retiredNumbers: RetiredNumberRecord[];
  hallOfFame: HallOfFameRecord[];
  trophies: TrophyRecord[];
  clubRecords: { label: string; value: string; holder: string; season: number }[];
}

export type OffseasonStep =
  | 'AWARDS_AND_EVAL'
  | 'DOMESTIC_CONTRACTS'
  | 'FOREIGN_MARKET'
  | 'ROOKIE_DRAFT';

export interface VirtualForeignPoolItem {
  id: string;
  name: string;
  nationality?: string;
  previousLeagueClub?: string; // 직전 리그 및 소속 구단 (예: MLB 텍사스 · AAA 라운드록)
  overseasLeagueTier?: 'MLB_REG' | 'MLB_40MAN' | 'AAA' | 'NPB' | 'CPBL' | 'INDY';
  overseasCareerSummary?: string;
  signingDifficulty?: '낮음' | '보통' | '높음' | '매우높음';
  adaptationRisk?: '안정' | '보통' | '고위험';
  competingClubInterest?: number; // 0..100 해외/국내 타 구단 경쟁 강도
  category: '외국인' | '아시아쿼터';
  role: '투수' | '타자';
  position: 'SP' | 'RP' | 'CL' | 'RF' | 'LF' | '1B' | '3B' | 'DH';
  age: number;
  ability: number;
  potential: number;
  scoutConfidence?: '정밀' | '보통' | '불확실';
  initialAdaptation?: number;
  suggestedTotalUsd: number;
  suggestedSigningBonusUsd: number;
  suggestedSalaryUsd: number;
  scoutingNote: string;
  isVirtual?: boolean;
}

export interface CareerSave {
  careerId: string;
  label: string;
  version: string;
  isPreservedMaster: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  gmName: string;
  playerTeamId: TeamId;
  season: number;
  phase: GamePhase;
  seed: number;
  rngState: number;
  gamesPlayed: number;
  totalRegularGames: number;
  currentSeriesIndex: number; // 0-based index into schedule
  schedule: ScheduledSeries[];
  teams: Record<TeamId, TeamState>;
  players: Record<string, Player>;
  coaches: Record<TeamId, Coach[]>;
  faCoaches?: Coach[];
  virtualForeignMarket?: VirtualForeignPoolItem[];
  championHistory?: ChampionRecord[];
  gamesLedger: GameRecord[];
  finances: FinancesLedger;
  injuryLogs: InjuryLog[];
  growthLogs: GrowthLog[];
  transactionLogs: TransactionLog[];
  draftState: DraftState;
  postingRecords: PostingRecord[];
  postseason: PostseasonState;
  awardsHistory: SeasonAwards[];
  lastSeriesReport: SeriesReport | null;
  warnings: string[];
  // Extended franchise systems
  newsFeed?: NewsArticle[];
  clubEvents?: ClubEventRecord[];
  complaints?: PlayerComplaint[];
  coachSwapReports?: CoachSwapReport[];
  futuresStandings?: Record<string, FuturesStandingRow>;
  nationalTeamEvents?: NationalTeamEvent[];
  waiverPool?: WaiverPlayerItem[];
  /** 웨이버 7일 미영입 후 자동 이동된 자유계약선수 명단 (당해 시즌 계약 제한 · 차기 시즌 해제 · 독립리그/은퇴 추적) */
  unclaimedFreeAgents?: UnclaimedFreeAgentItem[];
  scoutMissions?: ScoutDispatchMission[];
  overseasTrainings?: OverseasTrainingRecord[];
  managerFirings?: ManagerFiringRecord[];
  otherClubSponsors?: Partial<Record<TeamId, string>>;
  firedManagerTeamsThisSeason?: TeamId[];
  seasonHistory?: SeasonHistorySummary[];
  newsAttendanceBoostPct?: number;
  ownerEval?: OwnerEvaluationState;
  leagueHistory?: LeagueHistoryState;
  offseasonStep?: OffseasonStep;
  nextSeasonDraftOrder?: TeamId[];
  rainoutCount?: number;
  doubleheaderCount?: number;
  mlbExports?: MlbExportPlayerRecord[];
  activeKboRules?: KboRuleItem[];
  ruleChangeHistory?: KboRuleChangeLog[];
  developmentalMarket?: DevelopmentalCandidate[];
  activeNationalTeamDuty?: {
    tournamentName: string;
    startRound: number;
    endRound: number;
    playerIds: string[];
  } | null;
  // Deep franchise expansion state (#1-#40)
  difficulty?: GameDifficulty;
  leagueEnv?: LeagueEnvironmentState;
  springCamp?: SpringCampState;
  offseasonStep12?: OffseasonStep12;
  completedOffseasonSteps12?: OffseasonStep12[];
  /** 간소화 8단계 오프시즌 진행 상태 (단장 승인 전 자동 개막 금지) */
  offseasonStep8?: OffseasonStep8;
  completedOffseasonSteps8?: OffseasonStep8[];
  /** 해당 오프시즌에 AI 타 구단 오프시즌 업무가 동기화된 시즌 연도 */
  aiOffseasonProcessedSeason?: number;
  aiOffseasonLogSummary?: string[];
  pendingFaProtection?: FaProtectionPending | null;
  staffPoachingOffers?: StaffPoachingOffer[];
  gmJobOffers?: GmJobOffer[];
  retirementCeremonies?: RetirementCeremonyRecord[];
  overseasReturnPool?: OverseasReturnCandidate[];
  tradeDeadlineRound?: number; // default 100 (7월 31일)
  /** 트레이드 마감 알림 및 시장 폐쇄/재개방 발송 이력 (중복 알림 방지) */
  tradeDeadlineAlertsSent?: string[];
  analyticsStaffBonus?: number; // 전력분석/스카우트 역량 0..10
  // Special Futures Clubs (상무 피닉스 현실 선수단 · 울산 웨일즈 특별 규정)
  hasSeededSangmuRoster?: boolean;
  ulsanWhales?: UlsanWhalesState;
  // 타 구단 수신 트레이드 제안 및 시즌 FA 이탈 처리 기록
  incomingTradeOffers?: IncomingTradeOffer[];
  faReleasedSeason?: number;
  // 구단 간 라이벌 관계 및 동적 열기·상대전적 상태
  rivalries?: RivalryRecord[];
  // KBO 경쟁균형세(샐러리캡·하한액·예외선수·연속초과·드래프트제재·시즌별 이력) 통합 상태
  competitiveBalance?: CompetitiveBalanceState;
  // 고졸 육성선수 연간 구단별 영입 횟수 추적 (키: `${season}-${teamId}`)
  highSchoolDevSigningsBySeason?: Record<string, number>;
  // 구단별 레전드 명예의 전당 (역대 및 은퇴 프랜차이즈 스타 영구 보존)
  clubLegendsHof?: ClubLegendRecord[];
  // 영구 선수 고유 ID 시퀀스 및 아마추어 야구 · 해외 스카우팅 · 해외파 통합 상태
  nextPermanentPlayerSeq?: number;
  amateurAndOverseas?: AmateurAndOverseasState;
  // 방출 선수 근황 추적
  releasedPlayersTracker?: ReleasedPlayerTrackerRecord[];
  // 은퇴선수 진로 자동 관리 추적 (프로야구 코치, 코치 연수, 지도자, 스카우트, 해설위원 등)
  retiredCareerTracker?: RetiredPlayerCareerRecord[];
  // 매년 신인 계약금 TOP 10 순위 기록
  rookieBonusRankingsBySeason?: Record<number, RookieBonusRankEntry[]>;
  // 한국시리즈 우승 보상 및 포스트시즌 모기업 특별 보너스 정산 기록 (중복 지급 방지 포함)
  championshipRewardsLog?: ChampionshipRewardRecord[];
  championshipRewardSettledSeasons?: number[];
  // 트레이드로 이동된 차기 드래프트 지명권 소유권 목록
  tradedDraftPicks?: DraftPickProvenance[];
  // 선수 불만도 주 1회 자동 평가 추적 및 단장 면담 이력
  lastDissatisfactionEvalRound?: number;
  lastDissatisfactionEvalDate?: string;
  meetingHistory?: PlayerMeetingRecord[];
  // 2026 KBO 공식 시즌 시상식 중복 방지 및 시상식 확인 대기 상태
  completedAwardsSeasons?: number[];
  pendingAwardsCeremonySeason?: number | null;
  // 구단 레전드 0.5% 희귀 트레이드 출현 판정 시즌 캐시
  legendTradeBlockSeason?: number;
  legendTradeBlockPlayerIds?: string[];
  // 수석코치 선수 불만 선행 면담 보고서
  benchCoachReports?: BenchCoachMeetingReport[];
  // 10개 구단 FA 경쟁 입찰 상태
  faCompetition?: FaCompetitionState;
  // 전체 구단 영입 현황 (확정된 FA·트레이드·외국인/아시아쿼터·신인·방출선수 영입)
  leagueAcquisitions?: LeagueAcquisitionRecord[];
  /** 게임 내부 공식 날짜 (YYYY-MM-DD · 실제 PC 날짜와 완전 분리) */
  currentDate?: string;
  /** 적용된 선수 데이터베이스 버전 ('v18_recalibrated' 등) */
  databaseVersion?: string;
  /** 실제 역사 데이터로 고정되어 재시뮬레이션이 금지된 시즌 연도 목록 (예: [2026]) */
  lockedHistoricalSeasons?: number[];
  /** 공식 일정 vs 게임 예상 일정 구분 */
  scheduleSource?: 'OFFICIAL' | 'PROJECTED';
  officialScheduleMeta?: {
    importedAt: string;
    fileName: string;
    format: 'XLSX' | 'CSV' | 'JSON';
    totalGames: number;
    preservedPlayedGames: number;
  };
  /** 이미 완료된 신인 드래프트 연도 목록 (2027 신인 중복 드래프트 방지) */
  draftCompletedSeasons?: number[];
  /** 당해 시즌 중 실시하는 신인 드래프트 지명 대상 연도 (2027시즌 중 -> 2028 신인 드래프트) */
  draftClassYear?: number;
  /** 시즌·구단별 외국인/아시아쿼터 교체 횟수 추적 (공식 규정: 일반 교체 2회 + 6주 부상 대체) */
  foreignReplacementsUsedByTeam?: Record<string, { regular: number; injury: number }>;
  /** 시즌 종료 후 프랜차이즈 지수 및 보호 등급 재평가 이력 */
  franchiseReevalLog?: { season: number; date: string; summary: string }[];
  /** 마지막 자동 FA 시장 진행 게임 날짜 (중복 실행 방지) */
  lastAutoFaDate?: string;
  /** 우천 취소 후 재편성 대기 경기 목록 */
  postponedRainoutGames?: {
    originalDate: string;
    awayTeam: TeamId;
    homeTeam: TeamId;
    rescheduledDate?: string;
    completed?: boolean;
  }[];
  // 직전 경기/시리즈 시뮬레이션 전 정규시즌 구단별 순위 (순위 상승·하락 표시용)
  previousStandingsRanks?: Partial<Record<TeamId, number>>;
  // 시즌별 선수 흐름(깜짝 활약/슬럼프/후반기 반등) 초기화 완료 시즌 (재접속 시 변동 방지)
  seasonArcInitializedSeason?: number;
  // 이전 시즌 뉴스 자동 삭제가 완료된 시즌 번호 (시즌 전환 시 1회 실행 보장)
  lastNewsPrunedForSeason?: number;
  // 이벤트 애니메이션 1회 재생 완료 키 기록 (새로고침·세이브 재로딩 시 재재생 방지)
  playedAnimations?: string[];
}

export interface BenchCoachMeetingReport {
  id: string;
  season: number;
  date: string;
  teamId: TeamId;
  benchCoachName: string;
  playerId: string;
  playerName: string;
  beforeDissatisfaction: number;
  afterDissatisfaction: number;
  delta: number;
  summary: string;
  recommendation: string;
}

export interface FaClubBid {
  teamId: TeamId;
  years: number;
  totalBillion: number;
  annualBillion: number;
  isOriginalClub: boolean;
  submittedDate: string;
  score: number;
  note: string;
}

export interface MlbOverseasFaOffer {
  mlbTeam: string;
  years: number;
  guaranteedUsdMillions: number;
  /** 비교용 원화 환산 규모 (억 원, $1M ≈ 13.5억 기준) */
  krwEquivalentBillion: number;
  /** KBO 구단 입찰 점수와 직접 비교되는 선수 평가 점수 */
  score: number;
  evaluationNote: string;
  submittedDate: string;
}

export interface FaMarketNegotiation {
  playerId: string;
  playerName: string;
  formerTeamId: TeamId;
  faGrade: 'A' | 'B' | 'C';
  status: '입찰중' | '단장승인대기' | '계약완료';
  bids: FaClubBid[];
  pendingWinnerTeamId?: TeamId;
  signedTeamId?: TeamId;
  signedTotalBillion?: number;
  signedYears?: number;
  closedDate?: string;
  roundCount: number;
  /** 해외 FA 자격 충족 여부 (구단 승인 없이 MLB 직접 협상 가능) */
  mlbOverseasFaEligible?: boolean;
  /** MLB 구단 해외 FA 제안 */
  mlbOffer?: MlbOverseasFaOffer;
  /** 해외 FA MLB 협상 상태 */
  mlbStatus?: '미제안' | 'MLB제안접수' | 'MLB진출확정' | 'MLB협상결렬';
  /** MLB 계약 결렬 사유 (실패 시 KBO 잔류·국내 FA 협상 지속) */
  mlbFailureReason?: string;
  /** 해외 FA로 확정된 MLB 소속팀 */
  signedMlbTeam?: string;
  /** 해외 FA MLB 보장 총액 ($M) */
  signedMlbUsdMillions?: number;
}

export interface FaCompetitionState {
  season: number;
  round: number;
  externalSigningsByTeam: Partial<Record<TeamId, number>>;
  negotiations: Record<string, FaMarketNegotiation>;
}

export type LeagueAcquisitionCategory =
  | 'FA'
  | '트레이드'
  | '외국인·아시아쿼터'
  | '신인'
  | '방출선수 영입';

export interface LeagueAcquisitionRecord {
  id: string;
  dedupeKey: string;
  season: number;
  date: string;
  category: LeagueAcquisitionCategory;
  playerId?: string;
  playerName: string;
  position?: Position;
  previousTeamLabel: string;
  acquiringTeamId: TeamId;
  contractAmountLabel: string;
  note?: string;
}

export type ReleasedPlayerStatus = '자유계약(무적)' | '타구단 이적' | '독립리그/울산' | '은퇴';

export interface ReleasedPlayerTrackerRecord {
  id: string;
  playerId: string;
  permanentId?: string;
  playerName: string;
  age: number;
  position: Position;
  ability: number;
  releasedFromTeamId: TeamId;
  releasedDate: string;
  releasedSeason: number;
  status: ReleasedPlayerStatus;
  currentTeamLabel: string;
  statusUpdatedDate: string;
  note?: string;
}

export type RetiredCareerPath =
  | '프로야구 코치'
  | '코치 연수'
  | '고교·대학 지도자'
  | '스카우트'
  | '프런트 직원'
  | '해설위원'
  | '야구 아카데미'
  | '개인 사업'
  | '일반 은퇴';

export interface RetiredPlayerCareerRecord {
  id: string;
  playerId: string;
  permanentId?: string;
  playerName: string;
  age: number;
  position: Position;
  retiredSeason: number;
  lastTeamId: TeamId;
  careerPath: RetiredCareerPath;
  currentAffiliation: string;
  currentRoleLabel: string;
  coachId?: string;
  coachRole?: CoachRole;
  /** 코치 연수 종료 예정 시즌 (도달 시 프로야구 코치 FA 시장 자동 편입) */
  coachTrainingUntilSeason?: number;
  isMajorPlayer?: boolean;
  careerSummary: string;
  lastUpdatedSeason: number;
  historyNotes: string[];
}

export interface RookieBonusRankEntry {
  rank: number;
  season: number;
  playerName: string;
  teamId: TeamId;
  pickNotation: string;
  position: Position;
  school: string;
  signingBonusBillion: number;
  ability: number;
  potential: number;
  note?: string;
}

export interface ChampionshipRewardRecord {
  season: number;
  championTeamId: TeamId;
  runnerUpTeamId: TeamId | null;
  postseasonRewards: {
    teamId: TeamId;
    finishLabel: '한국시리즈 우승' | '한국시리즈 준우승' | '플레이오프 진출' | '준플레이오프 진출' | '와일드카드 진출';
    parentCompanyBonusBillion: number;
  }[];
  championBudgetBoostPct: number;
  specialAchievements: string[];
  ringCeremonyHeadline: string;
  settledDate: string;
}

export interface LiveAwardCandidate {
  rank: number;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  position: Position;
  role: PlayerRole;
  score: number;
  statSummary: string;
  tag?: string;
}

export interface LiveAwardRaces {
  season: number;
  gamesPlayed: number;
  mvpTop10: LiveAwardCandidate[];
  rookieTop10: LiveAwardCandidate[];
  goldenGloveByPos: {
    positionLabel: string;
    candidates: LiveAwardCandidate[];
  }[];
}

export interface MilitaryEnlistmentCandidate {
  playerId: string;
  playerName: string;
  teamId: TeamId;
  position: Position;
  age: number;
  ability: number;
  potential: number;
  status: '입대 예정' | '상무 복무중';
  expectedEnlistDate: string;
  expectedDischargeDate: string;
  note: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  teamId: TeamId;
  value: number;
  displayValue: string;
  qualified: boolean;
  isMinimumOnly?: boolean;
  isSynthetic: boolean;
  note?: string;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  showDetailedColumnsByDefault: boolean;
}
