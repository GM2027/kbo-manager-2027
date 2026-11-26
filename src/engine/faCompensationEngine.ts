import { KBO_TEAMS } from '../data/kboTeams';
import { CareerSave, Player, TeamId } from '../types/kbo';
import { evaluateFranchiseStar } from './franchiseStarEngine';
import { isMilitaryServing } from './militaryEngine';

export type FaExemptCategory =
  | '당해연도FA'
  | '신인선수'
  | '외국인선수'
  | '군보류선수'
  | 'FA보상이적'
  | '비보류제외';

export interface FaProtectionPlayerClassification {
  player: Player;
  status: 'ELIGIBLE' | 'AUTO_EXEMPT' | 'INELIGIBLE';
  exemptCategory?: FaExemptCategory;
  reason: string;
}

export interface TeamFaProtectionPool {
  teamId: TeamId;
  faSeason: number;
  grade: 'A' | 'B' | 'C';
  protectionLimit: number;
  /** 보호명단 20인(A) / 25인(B) 선택 대상 (미보호 시 보상선수 지명 가능) */
  selectableEligible: Player[];
  /** 규정상 자동 보호(자동 제외) 선수 — 보호명단 인원에 미포함, 선택 및 보상 지명 불가 */
  autoExempt: FaProtectionPlayerClassification[];
  /** 은퇴·해외이적·육성선수 등 보류명단 외 비대상 선수 */
  ineligible: FaProtectionPlayerClassification[];
  ruleSummary: string;
}

export interface KboFaCompensationSeasonRule {
  season: number;
  grade: 'A' | 'B' | 'C';
  protectionLimit: number;
  cashWithPlayerRatio: number;
  cashOnlyRatio: number;
  playerCompensationAllowed: boolean;
  summary: string;
}

/**
 * 시즌별 KBO 공식 FA 등급 보상 규정 조회
 * - A등급: 보호선수 20인 외 보상선수 1명 + 직전 연봉 200% (또는 보상선수 미지명 시 직전 연봉 300%)
 * - B등급: 보호선수 25인 외 보상선수 1명 + 직전 연봉 100% (또는 보상선수 미지명 시 직전 연봉 200%)
 * - C등급: 보상선수 없음 · 직전 연봉 150% 금전 보상만 적용
 */
export function getKboFaCompensationRuleForSeason(
  season: number,
  grade: 'A' | 'B' | 'C'
): KboFaCompensationSeasonRule {
  if (grade === 'A') {
    return {
      season,
      grade,
      protectionLimit: 20,
      cashWithPlayerRatio: 2.0,
      cashOnlyRatio: 3.0,
      playerCompensationAllowed: true,
      summary: `${season} KBO A등급: 보호선수 20인 외 보상선수 1명 + 직전 연봉 200% (금전만 선택 시 300%)`,
    };
  }
  if (grade === 'B') {
    return {
      season,
      grade,
      protectionLimit: 25,
      cashWithPlayerRatio: 1.0,
      cashOnlyRatio: 2.0,
      playerCompensationAllowed: true,
      summary: `${season} KBO B등급: 보호선수 25인 외 보상선수 1명 + 직전 연봉 100% (금전만 선택 시 200%)`,
    };
  }
  return {
    season,
    grade: 'C',
    protectionLimit: 0,
    cashWithPlayerRatio: 1.5,
    cashOnlyRatio: 1.5,
    playerCompensationAllowed: false,
    summary: `${season} KBO C등급: 보상선수 없음 · 직전 연봉 150% 금전 보상만 처리`,
  };
}

/**
 * 해당 연도 신인 선수 여부 판정 (당해 시즌 신인 드래프트 지명자 및 1년차 신인 자동 보호)
 */
function isAutoExemptRookieForFaSeason(p: Player, faSeason: number): boolean {
  // 오프시즌(예: 2027년 11월)에는 2027년 입단 신인 및 직전 9월 지명된 차기(2028) 신인 모두 자동 보호 대상
  const draftYear = p.acquisitionInfo?.draftYear ?? p.draftYear;
  if (typeof draftYear === 'number' && draftYear >= faSeason) {
    // 단, 최지만(D2027-015) 등 30세 이상 해외파 특별지명 베테랑은 제외하지 않도록 연령 체크
    // (실제 KBO 규정: 당해 연도 신인 드래프트 지명 신인 선수는 전원 자동 보호, 해외파 복귀 베테랑 포함 지명 당해연도 신인 기준)
    return true;
  }
  if (p.rookieInfo && (p.serviceYears ?? 0) <= 0) {
    return true;
  }
  if (p.v18SourceId?.startsWith('D2027-') && faSeason <= 2027) {
    return true;
  }
  return false;
}

/**
 * 해당 연도 FA 선수 여부 판정 (영입한 당해 FA 선수 + 원소속 재계약 FA + 시장 등록 FA 전원 자동 보호)
 */
function isAutoExemptCurrentYearFa(
  career: CareerSave,
  p: Player,
  faSeason: number,
  signedPlayerId?: string
): { exempt: boolean; reason: string } {
  if (signedPlayerId && p.id === signedPlayerId) {
    return { exempt: true, reason: '금번 영입 FA 선수 (자동 보호)' };
  }
  if (p.signedAsFaSeason === faSeason || p.signedAsFaSeason === career.season) {
    return { exempt: true, reason: `${faSeason}시즌 FA 계약 선수 (당해 연도 FA 자동 제외)` };
  }
  if (p.rosterTier === 'FA' || p.contract.status === 'FA') {
    return { exempt: true, reason: '당해 연도 FA 신분 선수 (자동 제외)' };
  }
  const neg = career.faCompetition?.season === faSeason
    ? career.faCompetition.negotiations[p.id]
    : undefined;
  if (neg && (neg.status === '계약완료' || neg.status === '입찰중' || neg.status === '단장승인대기')) {
    return { exempt: true, reason: `${faSeason}시즌 FA 협상·계약 대상 선수 (자동 제외)` };
  }
  // 2027시즌 초 이미 FA 계약 체결된 실존 선수 (노시환·강백호·박찬호·박해민·김현수 등 2027 FA 계약자)
  if (
    faSeason === 2027 &&
    p.contract.startSeason === 2027 &&
    typeof p.contract.note === 'string' &&
    p.contract.note.includes('FA')
  ) {
    return { exempt: true, reason: '2027시즌 FA 계약 완료 선수 (당해 연도 FA 자동 제외)' };
  }
  return { exempt: false, reason: '' };
}

/**
 * 해당 연도 FA 보상선수로 이미 이적한 선수 여부 판정 (동일 FA 시즌 이중 보상 지명 방지)
 */
function isAutoExemptFaCompTransfer(p: Player, faSeason: number): boolean {
  if (
    p.faCompensationTransferredSeason === faSeason ||
    p.faCompensationTransferredSeason === faSeason + 1
  ) {
    return true;
  }
  if (p.careerTeamHistory) {
    for (const h of p.careerTeamHistory) {
      if (
        h.moveType === 'FA 보상선수' &&
        (h.fromSeason === faSeason || h.fromSeason === faSeason + 1)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 개별 선수의 KBO FA 보상선수 보호명단/지명 자격 정밀 판정
 * - 사용자 구단과 AI 구단에 100% 동일 적용
 */
export function classifyPlayerFaCompensationStatus(
  career: CareerSave,
  p: Player,
  context: { faSeason: number; signedPlayerId?: string }
): FaProtectionPlayerClassification {
  const { faSeason, signedPlayerId } = context;

  // 1) 비보류/비현역 신분은 애초에 대상 외
  if (p.rosterTier === '은퇴' || p.rosterTier === '해외이적') {
    return {
      player: p,
      status: 'INELIGIBLE',
      exemptCategory: '비보류제외',
      reason: `${p.rosterTier} 선수 (보상 대상 외)`,
    };
  }
  if (p.rosterTier === '육성' || p.rosterTier === '제외후보') {
    return {
      player: p,
      status: 'AUTO_EXEMPT',
      exemptCategory: '비보류제외',
      reason: `${p.rosterTier} 선수 (정식 보류명단 외 자동 제외)`,
    };
  }

  // 2) 외국인 및 아시아쿼터 선수 자동 보호
  if (p.category === '외국인' || p.category === '아시아쿼터') {
    return {
      player: p,
      status: 'AUTO_EXEMPT',
      exemptCategory: '외국인선수',
      reason: `${p.category} 선수 (KBO 규정 자동 제외)`,
    };
  }

  // 3) 군보류(상무/현역 군 복무 중) 선수 자동 보호 (입대 시 자동 제외 · 전역 복귀 시 자동 해제)
  if (
    isMilitaryServing(p.militaryStatus) ||
    p.rosterTier === '대기'
  ) {
    const dischargeHint = p.militaryDischargeDate ? ` · 전역 예정 ${p.militaryDischargeDate}` : '';
    return {
      player: p,
      status: 'AUTO_EXEMPT',
      exemptCategory: '군보류선수',
      reason: `군보류·복무중 선수 (KBO 규정 자동 제외${dischargeHint})`,
    };
  }

  // 4) 해당 연도 FA 선수 (금번 영입 선수 + 기영입/재계약 당해 FA 선수 전원) 자동 보호
  const faCheck = isAutoExemptCurrentYearFa(career, p, faSeason, signedPlayerId);
  if (faCheck.exempt) {
    return {
      player: p,
      status: 'AUTO_EXEMPT',
      exemptCategory: '당해연도FA',
      reason: faCheck.reason,
    };
  }

  // 5) 당해 연도 FA 보상선수 이적자 자동 보호
  if (isAutoExemptFaCompTransfer(p, faSeason)) {
    return {
      player: p,
      status: 'AUTO_EXEMPT',
      exemptCategory: 'FA보상이적',
      reason: `${faSeason} FA 보상선수 이적자 (당해 연도 재지명 자동 제외)`,
    };
  }

  // 6) 신인 선수 자동 보호
  if (isAutoExemptRookieForFaSeason(p, faSeason)) {
    return {
      player: p,
      status: 'AUTO_EXEMPT',
      exemptCategory: '신인선수',
      reason: `${p.acquisitionInfo?.draftYear ?? faSeason} 신인 선수 (KBO 규정 자동 제외)`,
    };
  }

  // 7) 1군·2군 정식 보류 국내 선수 → 보호명단(20인/25인) 선택 및 보상 지명 대상
  if (p.rosterTier === '1군' || p.rosterTier === '2군') {
    return {
      player: p,
      status: 'ELIGIBLE',
      reason: '보호명단 선택 대상 (미보호 시 보상선수 지명 가능)',
    };
  }

  return {
    player: p,
    status: 'INELIGIBLE',
    exemptCategory: '비보류제외',
    reason: '보상 대상 외 신분',
  };
}

/**
 * 특정 구단의 FA 보호명단 대상(ELIGIBLE)과 자동 제외(AUTO_EXEMPT) 선수단을 엄격히 분리 산출합니다.
 * - 자동 제외 선수는 절대 보호명단 20인/25인 인원에 포함되지 않으며, 선택·지명 모두 불가합니다.
 */
export function buildTeamFaProtectionPool(
  career: CareerSave,
  teamId: TeamId,
  options: {
    faSeason?: number;
    signedPlayerId?: string;
    grade: 'A' | 'B' | 'C';
  }
): TeamFaProtectionPool {
  const faSeason = options.faSeason ?? career.season;
  const rule = getKboFaCompensationRuleForSeason(faSeason, options.grade);

  const teamPlayers = Object.values(career.players).filter((p) => p.teamId === teamId);
  const selectableEligible: Player[] = [];
  const autoExempt: FaProtectionPlayerClassification[] = [];
  const ineligible: FaProtectionPlayerClassification[] = [];

  for (const p of teamPlayers) {
    const cls = classifyPlayerFaCompensationStatus(career, p, {
      faSeason,
      signedPlayerId: options.signedPlayerId,
    });
    if (cls.status === 'ELIGIBLE') {
      selectableEligible.push(p);
    } else if (cls.status === 'AUTO_EXEMPT') {
      autoExempt.push(cls);
    } else {
      ineligible.push(cls);
    }
  }

  // 가치 순 정렬 (UI 및 AI 보호명단 구성 일관성)
  selectableEligible.sort((a, b) => scorePlayerForFaProtection(career, b) - scorePlayerForFaProtection(career, a));
  autoExempt.sort((a, b) => b.player.ability - a.player.ability);

  return {
    teamId,
    faSeason,
    grade: options.grade,
    protectionLimit: rule.protectionLimit,
    selectableEligible,
    autoExempt,
    ineligible,
    ruleSummary: rule.summary,
  };
}

/**
 * 구단의 보호명단 가치 평가 점수 (AI 보호명단 자동 구성 및 사용자 구단 자동 채우기 공통 기준)
 */
export function scorePlayerForFaProtection(career: CareerSave, p: Player): number {
  const fran = evaluateFranchiseStar(career, p);
  const franchiseBoost =
    fran.score >= 85 || fran.protectionTier === '프랜차이즈 스타'
      ? 45
      : fran.protectionTier === '구단 핵심 선수'
        ? 22
        : fran.protectionTier === '핵심 유망주'
          ? 16
          : 0;
  const ageVal = p.age <= 24 ? 14 : p.age <= 28 ? 8 : p.age <= 32 ? 2 : p.age >= 36 ? -14 : -5;
  const potVal = p.potential * 0.42;
  const premiumPos = p.position === 'C' || p.position === 'SS' || p.position === 'CF' || p.position === 'SP' ? 4 : 0;
  return p.ability * 1.15 + potVal + ageVal + premiumPos + franchiseBoost;
}

/**
 * 원소속 구단(AI/사용자 공용)이 보호명단 외 보상 가능 선수 풀에서 최적 보상선수 1명 선택
 */
export function selectBestCompensationPlayer(
  career: CareerSave,
  unprotectedEligible: Player[],
  pickingTeamId: TeamId
): Player | null {
  if (unprotectedEligible.length === 0) return null;
  void pickingTeamId;
  const ranked = [...unprotectedEligible].sort((a, b) => {
    const scoreA =
      a.ability * 1.05 +
      a.potential * 0.45 +
      (a.age <= 25 ? 12 : a.age <= 29 ? 5 : a.age >= 35 ? -14 : -4) +
      (a.role === '투수' ? 3 : 0);
    const scoreB =
      b.ability * 1.05 +
      b.potential * 0.45 +
      (b.age <= 25 ? 12 : b.age <= 29 ? 5 : b.age >= 35 ? -14 : -4) +
      (b.role === '투수' ? 3 : 0);
    return scoreB - scoreA;
  });
  return ranked[0] ?? null;
}

/**
 * 사용자/AI 공용 FA 보호명단 검증 및 보상선수 선정 결과 산출
 * - 자동 제외 선수가 보호명단 배열에 잘못 포함되어도 자동으로 걸러내어 20/25인 정원 낭비 방지
 * - 보상선수 후보는 반드시 selectableEligible 중 미보호 선수에서만 추출 (자동 제외 선수 지명 절대 불가)
 */
export function resolveFaProtectionAndCompensationSelection(
  career: CareerSave,
  acquiringTeamId: TeamId,
  fromTeamId: TeamId,
  options: {
    faSeason?: number;
    signedPlayerId: string;
    grade: 'A' | 'B' | 'C';
    submittedProtectedIds?: string[]; // 사용자 제출 ID (생략 시 AI 자동 20인/25인 보호)
    previousAnnualSalaryBillion: number;
  }
): {
  pool: TeamFaProtectionPool;
  protectedIds: string[];
  unprotectedEligible: Player[];
  chosenPlayer: Player | null;
  finalCashCompBillion: number;
  cashOnlyFallback: boolean;
  summary: string;
} {
  const faSeason = options.faSeason ?? career.season;
  const rule = getKboFaCompensationRuleForSeason(faSeason, options.grade);
  const prevSal = Math.max(0.33, options.previousAnnualSalaryBillion || 1.0);
  const pool = buildTeamFaProtectionPool(career, acquiringTeamId, {
    faSeason,
    signedPlayerId: options.signedPlayerId,
    grade: options.grade,
  });

  // C등급은 보상선수 없음 · 직전 연봉 150% 금전 보상만 처리
  if (options.grade === 'C' || !rule.playerCompensationAllowed) {
    const cash = Number((prevSal * rule.cashOnlyRatio).toFixed(2));
    return {
      pool,
      protectedIds: [],
      unprotectedEligible: [],
      chosenPlayer: null,
      finalCashCompBillion: cash,
      cashOnlyFallback: true,
      summary: `C등급 금전 보상 ${cash.toFixed(1)}억 원 정산 (보상선수 없음)`,
    };
  }

  const eligibleIdSet = new Set(pool.selectableEligible.map((p) => p.id));

  let protectedIds: string[];
  if (options.submittedProtectedIds) {
    // 자동 제외 선수 ID는 강제 배제하고 순수 보호 대상 선수만 최대 limit(20/25)명 인정
    const dedup: string[] = [];
    for (const id of options.submittedProtectedIds) {
      if (eligibleIdSet.has(id) && !dedup.includes(id)) {
        dedup.push(id);
        if (dedup.length >= rule.protectionLimit) break;
      }
    }
    protectedIds = dedup;
  } else {
    // AI 구단: 순수 보호 대상(selectableEligible) 상위 20인(A) / 25인(B) 자동 보호
    protectedIds = pool.selectableEligible.slice(0, rule.protectionLimit).map((p) => p.id);
  }

  const protectedSet = new Set(protectedIds);
  const unprotectedEligible = pool.selectableEligible.filter((p) => !protectedSet.has(p.id));
  const chosenPlayer = selectBestCompensationPlayer(career, unprotectedEligible, fromTeamId);

  if (chosenPlayer) {
    const cash = Number((prevSal * rule.cashWithPlayerRatio).toFixed(2));
    return {
      pool,
      protectedIds,
      unprotectedEligible,
      chosenPlayer,
      finalCashCompBillion: cash,
      cashOnlyFallback: false,
      summary: `${options.grade}등급 보상: 보호선수 ${rule.protectionLimit}인(자동제외 ${pool.autoExempt.length}명 별도) 외 ${chosenPlayer.name} + 보상금 ${cash.toFixed(1)}억 원`,
    };
  }

  // 보호 대상 외 선수가 없을 경우 KBO 규정상 금전만 보상(A: 300%, B: 200%)으로 자동 전환
  const cashOnly = Number((prevSal * rule.cashOnlyRatio).toFixed(2));
  return {
    pool,
    protectedIds,
    unprotectedEligible: [],
    chosenPlayer: null,
    finalCashCompBillion: cashOnly,
    cashOnlyFallback: true,
    summary: `${options.grade}등급 금전 보상만 적용 (${KBO_TEAMS[fromTeamId]?.shortName ?? fromTeamId}에 연봉 ${Math.round(rule.cashOnlyRatio * 100)}% · ${cashOnly.toFixed(1)}억 원 정산)`,
  };
}
