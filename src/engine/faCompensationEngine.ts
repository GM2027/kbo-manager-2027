import { KBO_TEAMS } from '../data/kboTeams';
import { BatterStats, CareerSave, PitcherStats, Player, TeamId } from '../types/kbo';
import { evaluateFranchiseStar } from './franchiseStarEngine';
import { isMilitaryServing } from './militaryEngine';
import { calcAVG, calcERA, calcOPS } from './stats';

/**
 * ISO 날짜(YYYY-MM-DD)에 지정 일수(예: 3일)를 안전하게 더합니다.
 */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return isoDate;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * 선수의 이전 FA 취득(계약) 횟수 조회
 * - 명시된 faQualificationCount 우선, 없으면 이력/계약 메모에서 추정
 */
export function getPriorFaQualificationCount(p: Player, currentSeason: number): number {
  if (typeof p.faQualificationCount === 'number' && p.faQualificationCount >= 0) {
    return p.faQualificationCount;
  }
  let inferred = 0;
  if (Array.isArray(p.careerTeamHistory)) {
    const faEvents = p.careerTeamHistory.filter(
      (h) =>
        (h.moveType === 'FA 이적' || h.moveType === 'FA 잔류') &&
        h.fromSeason < currentSeason
    );
    inferred = Math.max(inferred, faEvents.length);
  }
  if (
    inferred === 0 &&
    typeof p.signedAsFaSeason === 'number' &&
    p.signedAsFaSeason < currentSeason
  ) {
    inferred = 1;
  }
  if (
    inferred === 0 &&
    typeof p.contract.note === 'string' &&
    p.contract.note.includes('FA') &&
    (p.contract.startSeason ?? currentSeason) < currentSeason
  ) {
    inferred = 1;
  }
  return inferred;
}

/**
 * KBO 공식 FA 등급 예외 규정 적용
 * 1) 만 35세 이상 신규 FA(1회차): 연봉 순위와 무관하게 C등급
 * 2) FA 재자격(2회차): 최대 B등급 (A등급 산정 시 B등급으로 하향)
 * 3) 3회 이상 FA 재자격: C등급 자동 적용
 */
export function resolveKboFaGradeWithExceptions(
  p: Player,
  rawGrade: 'A' | 'B' | 'C',
  currentSeason: number
): { grade: 'A' | 'B' | 'C'; exceptionNote: string | null; priorFaCount: number } {
  const priorFaCount = getPriorFaQualificationCount(p, currentSeason);

  if (priorFaCount >= 2) {
    return {
      grade: 'C',
      exceptionNote: '3회 이상 FA 재자격 예외 규정 (C등급 적용)',
      priorFaCount,
    };
  }
  if (priorFaCount === 0 && p.age >= 35) {
    return {
      grade: 'C',
      exceptionNote: '만 35세 이상 신규 FA 예외 규정 (C등급 적용)',
      priorFaCount,
    };
  }
  if (priorFaCount === 1 && rawGrade === 'A') {
    return {
      grade: 'B',
      exceptionNote: 'FA 재자격(2회차) 예외 규정 (최대 B등급 적용)',
      priorFaCount,
    };
  }
  return {
    grade: rawGrade,
    exceptionNote: null,
    priorFaCount,
  };
}

/**
 * 보호선수 명단·보상선수 지명 화면용 선수 시즌 성적 요약 문자열
 */
export function formatFaPlayerSeasonStatsBrief(p: Player): string {
  if (p.role === '투수') {
    const ps = p.stats as PitcherStats;
    const outs = ps?.outs ?? 0;
    if (outs >= 3) {
      const ip = (outs / 3).toFixed(1);
      const era = calcERA(ps.ER ?? 0, outs);
      const svStr = (ps.SV ?? 0) > 0 ? ` ${ps.SV}S` : (ps.HLD ?? 0) > 0 ? ` ${ps.HLD}H` : '';
      return `${ps.W ?? 0}승${ps.L ?? 0}패${svStr} ${ip}이닝 ERA ${era !== null ? era.toFixed(2) : '-'} ${ps.SO ?? 0}K`;
    }
    return `1군 등판 대기 (${p.rosterTier})`;
  }
  const bs = p.stats as BatterStats;
  if ((bs?.PA ?? 0) >= 1) {
    const avg = calcAVG(bs.H ?? 0, bs.AB ?? 0);
    const ops = calcOPS(bs);
    return `타율 ${avg !== null ? avg.toFixed(3) : '-'} ${bs.HR ?? 0}HR ${bs.RBI ?? 0}타점 OPS ${ops !== null ? ops.toFixed(3) : '-'}`;
  }
  return `1군 출전 대기 (${p.rosterTier})`;
}

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
 * 원소속 구단(AI/사용자 공용) 기준 개별 보상선수 후보 가치 점수 산출
 * - 능력치, 잠재력, 나이, 원소속 구단 포지션 보강 필요도, 연봉 가성비 종합 반영
 */
export function scoreCompensationCandidateForTeam(
  career: CareerSave,
  p: Player,
  pickingTeamId: TeamId
): number {
  const teamSamePos = Object.values(career.players)
    .filter(
      (x) =>
        x.teamId === pickingTeamId &&
        x.position === p.position &&
        (x.rosterTier === '1군' || x.rosterTier === '2군')
    )
    .sort((a, b) => b.ability - a.ability);
  const currentStarterOvr = teamSamePos[0]?.ability ?? 68;
  const needBoost = Math.max(-4, Math.min(12, (p.ability - currentStarterOvr) * 0.9));
  const ageVal = p.age <= 24 ? 14 : p.age <= 28 ? 7 : p.age <= 31 ? 0 : p.age >= 35 ? -15 : -6;
  const salaryPenalty = Math.max(0, (p.contract.annualSalary - 3.5) * 1.6);
  const roleBoost = p.role === '투수' ? 3 : 0;
  return Number(
    (p.ability * 1.05 + p.potential * 0.48 + ageVal + needBoost + roleBoost - salaryPenalty).toFixed(1)
  );
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
  const ranked = [...unprotectedEligible].sort(
    (a, b) =>
      scoreCompensationCandidateForTeam(career, b, pickingTeamId) -
      scoreCompensationCandidateForTeam(career, a, pickingTeamId)
  );
  return ranked[0] ?? null;
}

/**
 * AI 구단의 보상 방식 자동 결정 (보상선수 + 보상금 vs 금전 보상만)
 * - 최상위 미보호 선수의 가치(능력치·잠재력·팀 보강 필요도)와 추가 금전 보상(직전 연봉 100%) 및 구단 재정을 비교
 */
export function evaluateAiCompensationDecision(
  career: CareerSave,
  pickingTeamId: TeamId,
  unprotectedEligible: Player[],
  previousAnnualSalaryBillion: number,
  grade: 'A' | 'B'
): {
  mode: 'PLAYER' | 'CASH_ONLY';
  chosenPlayer: Player | null;
  bestCandidate: Player | null;
  reason: string;
} {
  const best = selectBestCompensationPlayer(career, unprotectedEligible, pickingTeamId);
  if (!best) {
    return {
      mode: 'CASH_ONLY',
      chosenPlayer: null,
      bestCandidate: null,
      reason: '보호명단 외 지명 가능한 선수가 없어 금전 보상으로 자동 전환',
    };
  }

  const candScore = scoreCompensationCandidateForTeam(career, best, pickingTeamId);
  const extraCashBillion = Math.max(0.33, previousAnnualSalaryBillion);
  const teamPayrollEst = Object.values(career.players)
    .filter(
      (x) =>
        x.teamId === pickingTeamId &&
        x.category === '국내' &&
        (x.rosterTier === '1군' || x.rosterTier === '2군')
    )
    .reduce((sum, x) => sum + (x.contract.annualSalary || 0), 0);
  const financialCashPreference = teamPayrollEst >= 125 ? 6 : teamPayrollEst >= 105 ? 2 : 0;

  const playerImpliedValueBillion = Math.max(
    1.5,
    (candScore - 96) * 0.65 + (best.potential >= 80 && best.age <= 25 ? 6.5 : 0)
  );
  const cashAdjustedThreshold = extraCashBillion + financialCashPreference * 0.45;

  const preferCashOnly =
    (best.ability < 69 && best.potential < 75 && extraCashBillion >= 2.5) ||
    (extraCashBillion >= 10 && playerImpliedValueBillion < cashAdjustedThreshold * 0.82);

  if (preferCashOnly) {
    return {
      mode: 'CASH_ONLY',
      chosenPlayer: null,
      bestCandidate: best,
      reason: `금전 보상 선택 (${grade === 'A' ? '직전 연봉 300%' : '직전 연봉 200%'} · 추가 보상금 ${extraCashBillion.toFixed(1)}억이 미보호 최상위 후보 ${best.name} 가치 대비 유리)`,
    };
  }

  return {
    mode: 'PLAYER',
    chosenPlayer: best,
    bestCandidate: best,
    reason: `보상선수 지명 (${best.name} · ${best.position} · ${best.age}세 · OVR ${best.ability}/POT ${best.potential}) + ${grade === 'A' ? '연봉 200%' : '연봉 100%'} 보상금`,
  };
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
    manualDecision?: { mode: 'PLAYER'; playerId: string } | { mode: 'CASH_ONLY' };
  }
): {
  pool: TeamFaProtectionPool;
  protectedIds: string[];
  unprotectedEligible: Player[];
  chosenPlayer: Player | null;
  finalCashCompBillion: number;
  cashOnlyFallback: boolean;
  decisionReason: string;
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
      decisionReason: 'C등급 규정상 보상선수 없이 금전 보상(직전 연봉 150%) 자동 처리',
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

  let chosenPlayer: Player | null = null;
  let decisionReason = '';

  if (options.manualDecision) {
    if (options.manualDecision.mode === 'CASH_ONLY') {
      chosenPlayer = null;
      decisionReason = `단장 선택: 보상선수 미지명 · 금전 보상만 수령 (${options.grade === 'A' ? '직전 연봉 300%' : '직전 연봉 200%'})`;
    } else {
      const targetId = options.manualDecision.playerId;
      const target = unprotectedEligible.find((p) => p.id === targetId);
      if (!target) {
        throw new Error('지명한 선수는 보호명단 외 보상 대상이 아닙니다.');
      }
      chosenPlayer = target;
      decisionReason = `단장 직접 지명: ${target.name} (${target.position} · OVR ${target.ability}/POT ${target.potential})`;
    }
  } else {
    const aiDecision = evaluateAiCompensationDecision(
      career,
      fromTeamId,
      unprotectedEligible,
      prevSal,
      options.grade
    );
    chosenPlayer = aiDecision.mode === 'PLAYER' ? aiDecision.chosenPlayer : null;
    decisionReason = aiDecision.reason;
  }

  if (chosenPlayer) {
    const cash = Number((prevSal * rule.cashWithPlayerRatio).toFixed(2));
    return {
      pool,
      protectedIds,
      unprotectedEligible,
      chosenPlayer,
      finalCashCompBillion: cash,
      cashOnlyFallback: false,
      decisionReason,
      summary: `${options.grade}등급 보상: 보호선수 ${rule.protectionLimit}인(자동제외 ${pool.autoExempt.length}명 별도) 외 ${chosenPlayer.name} + 보상금 ${cash.toFixed(1)}억 원`,
    };
  }

  // 보상선수 미지명 시 KBO 규정상 금전만 보상(A: 300%, B: 200%)
  const cashOnly = Number((prevSal * rule.cashOnlyRatio).toFixed(2));
  return {
    pool,
    protectedIds,
    unprotectedEligible,
    chosenPlayer: null,
    finalCashCompBillion: cashOnly,
    cashOnlyFallback: true,
    decisionReason,
    summary: `${options.grade}등급 금전 보상만 적용 (${KBO_TEAMS[fromTeamId]?.shortName ?? fromTeamId}에 연봉 ${Math.round(rule.cashOnlyRatio * 100)}% · ${cashOnly.toFixed(1)}억 원 정산)`,
  };
}
