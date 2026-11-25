import {
  AMATEUR_POSITIONS,
  buildVerifiedOverseasBaseline,
  KOREAN_AMATEUR_TOURNAMENTS,
  KOREAN_HIGH_SCHOOLS,
  KOREAN_UNIVERSITIES,
  MLB_30_CLUBS_SEED,
  VIRTUAL_FIRST_NAMES,
  VIRTUAL_LAST_NAMES,
} from '../data/amateurAndOverseasData';
import { KBO_TEAMS } from '../data/kboTeams';
import {
  AmateurAndOverseasState,
  AmateurProspect,
  AmateurTournamentResult,
  CareerSave,
  DraftCandidate,
  MlbClubScoutingBudget,
  OverseasLeagueLevel,
  OverseasPlayerRecord,
  OverseasSeasonStatLine,
  Player,
  PlayerTeamHistoryEntry,
  Position,
  TeamId,
} from '../types/kbo';
import {
  allocatePermanentPlayerId,
  ensureGlobalPlayerRegistryInPlace,
  isDuplicatePlayerIdentity,
} from './playerRegistry';
import {
  appendPlayerMlbHistoryInPlace,
  appendPlayerTeamHistoryInPlace,
  generateOverseasReturnRumorsInPlace,
  isMlbHistoryEntry,
  selectAnnualTopAmateurProspectsInPlace,
} from './leagueLifeEngine';
import { findRealPlayerClubProfile } from '../data/realKboHistories';
import { SeededRng } from './rng';
import { getCurrentCareerDate } from './salaryCapEngine';
import { emptyBatterStats, emptyPitcherStats } from './stats';

const MINOR_LADDER: OverseasLeagueLevel[] = ['Rookie', 'A', 'A+', 'AA', 'AAA', 'MLB'];

function addYearsIso(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const ny = (y || 2026) + years;
  const mm = String(m || 1).padStart(2, '0');
  const dd = String(d || 1).padStart(2, '0');
  return `${ny}-${mm}-${dd}`;
}

function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const t1 = Date.parse(fromIso);
  const t2 = Date.parse(toIso);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.max(0, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)));
}

function pickPositionWeighted(rng: SeededRng): { position: Position; role: '투수' | '타자' } {
  const total = AMATEUR_POSITIONS.reduce((s, x) => s + x.weight, 0);
  let r = rng.int(1, total);
  for (const item of AMATEUR_POSITIONS) {
    r -= item.weight;
    if (r <= 0) return { position: item.position, role: item.role };
  }
  return { position: 'SP', role: '투수' };
}

function generateVirtualAmateurProspect(
  career: CareerSave,
  rng: SeededRng,
  schoolType: '고교' | '대학',
  grade: 1 | 2 | 3 | 4,
  season: number
): AmateurProspect {
  const schools = schoolType === '고교' ? KOREAN_HIGH_SCHOOLS : KOREAN_UNIVERSITIES;
  let name = `${rng.pick(VIRTUAL_LAST_NAMES)}${rng.pick(VIRTUAL_FIRST_NAMES)}`;
  let schoolName = rng.pick(schools);
  const age = schoolType === '고교' ? 16 + grade : 19 + grade;
  const birthYear = season - age;

  // Avoid exact same (name, birthYear, school) duplicate while allowing legitimate namesakes
  let guard = 0;
  while (
    guard < 12 &&
    isDuplicatePlayerIdentity(career, { name, birthYear, school: schoolName })
  ) {
    name = `${rng.pick(VIRTUAL_LAST_NAMES)}${rng.pick(VIRTUAL_FIRST_NAMES)}`;
    schoolName = rng.pick(schools);
    guard += 1;
  }

  const { position, role } = pickPositionWeighted(rng);
  const eliteRoll = rng.next();
  // Unified KBO scale: POT 90+ is ultra-rare (~1.5% of amateurs), unproven amateur OVR strictly <= 57
  const basePot =
    eliteRoll > 0.985
      ? rng.int(90, 92)
      : eliteRoll > 0.90
      ? rng.int(81, 87)
      : eliteRoll > 0.65
      ? rng.int(74, 80)
      : eliteRoll > 0.30
      ? rng.int(67, 73)
      : rng.int(60, 66);

  const gradeMaturity = schoolType === '고교' ? (grade - 1) * 3 : 6 + (grade - 1) * 2.5;
  const ability = Math.max(
    38,
    Math.min(57, Math.min(basePot - 6, Math.round(basePot - 32 + gradeMaturity + rng.int(-3, 3))))
  );

  const fastballKmh =
    role === '투수'
      ? Number(
          Math.min(
            157,
            Math.max(137, 138 + (basePot - 68) * 0.58 + (grade - 1) * 1.3 + rng.next() * 2.5)
          ).toFixed(1)
        )
      : undefined;
  const batPowerGrade =
    role === '타자' ? Math.max(45, Math.min(95, Math.round(basePot - 4 + rng.int(-8, 6)))) : undefined;
  const batContactGrade =
    role === '타자' ? Math.max(48, Math.min(95, Math.round(basePot - 2 + rng.int(-6, 7)))) : undefined;

  const draftEligibleSeason =
    schoolType === '고교'
      ? season + Math.max(0, 3 - grade)
      : season + Math.max(0, 4 - grade);
  const isEarlyDraftEligible = schoolType === '대학' && grade === 2 && basePot >= 82;

  const permanentId = allocatePermanentPlayerId(career, 'KBO-AMA');

  // Initial MLB interest only for top-tier prospects (ability + potential + velocity/power)
  const rawScoutAppeal =
    (basePot - 78) * 4.5 +
    (fastballKmh && fastballKmh >= 150 ? (fastballKmh - 149) * 5 : 0) +
    (batPowerGrade && batPowerGrade >= 82 ? (batPowerGrade - 81) * 3 : 0);
  const overseasInterestLevel =
    rawScoutAppeal > 18 && (schoolType === '고교' ? grade >= 2 : grade >= 3)
      ? Math.max(0, Math.min(92, Math.round(rawScoutAppeal + rng.int(-8, 10))))
      : 0;
  const playerOverseasDesire =
    overseasInterestLevel > 25 ? rng.int(35, 88) : rng.int(10, 45);

  const interestedMlbClubs: AmateurProspect['interestedMlbClubs'] = [];
  if (overseasInterestLevel >= 35) {
    const clubCount = overseasInterestLevel >= 65 ? 3 : overseasInterestLevel >= 50 ? 2 : 1;
    const pool = [...MLB_30_CLUBS_SEED].sort(() => rng.next() - 0.5).slice(0, clubCount);
    for (const c of pool) {
      const bonusUsd = Math.round(
        (250000 + Math.max(0, basePot - 82) * 145000 + rng.int(0, 180000)) / 10000
      ) * 10000;
      interestedMlbClubs.push({
        clubName: c.clubName,
        interestScore: Math.min(96, overseasInterestLevel + rng.int(-5, 8)),
        offeredBonusUsd: Math.min(2200000, bonusUsd),
      });
    }
  }

  return {
    permanentId,
    name,
    birthYear,
    age,
    role,
    position,
    schoolType,
    schoolName,
    grade,
    ability,
    potential: basePot,
    fastballKmh,
    batPowerGrade,
    batContactGrade,
    seasonG: 0,
    seasonStatSummary: '시즌 개막 대기',
    projectedDraftRank: 99,
    draftEligibleSeason,
    isEarlyDraftEligible,
    careerPath: '재학중',
    overseasInterestLevel,
    playerOverseasDesire,
    guardianConsentReady: age >= 18 || rng.next() > 0.28,
    overseasStatus: overseasInterestLevel >= 40 ? '관심' : '없음',
    interestedMlbClubs,
  };
}

function recomputeProjectedDraftRanksInPlace(state: AmateurAndOverseasState, season: number): void {
  const eligible = state.prospects
    .filter(
      (p) =>
        p.careerPath !== '해외프로계약' &&
        p.careerPath !== '은퇴' &&
        !p.draftedToTeamId &&
        (p.draftEligibleSeason <= season || p.isEarlyDraftEligible)
    )
    .sort((a, b) => {
      const scoreA = a.potential * 0.62 + a.ability * 0.38 + (a.fastballKmh ? (a.fastballKmh - 144) * 0.4 : 0);
      const scoreB = b.potential * 0.62 + b.ability * 0.38 + (b.fastballKmh ? (b.fastballKmh - 144) * 0.4 : 0);
      return scoreB - scoreA;
    });

  eligible.forEach((p, idx) => {
    p.projectedDraftRank = idx + 1;
  });

  // Also rank underclassmen for scouting board clarity (starting from 101+)
  const underclass = state.prospects
    .filter((p) => !eligible.includes(p))
    .sort((a, b) => b.potential * 0.7 + b.ability * 0.3 - (a.potential * 0.7 + a.ability * 0.3));
  underclass.forEach((p, idx) => {
    p.projectedDraftRank = 101 + idx;
  });
}

function pushNewsSafe(
  career: CareerSave,
  article: {
    date: string;
    category: '이적·계약' | 'MLB소식' | '국제·병역' | '구단사건' | '수상·이달의선수';
    headline: string;
    body: string;
    teamId?: TeamId;
    isHighlight?: boolean;
  }
): void {
  career.newsFeed = [
    {
      id: `news-ao-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      season: career.phase === 'OFFSEASON' ? career.season + 1 : career.season,
      ...article,
    },
    ...(career.newsFeed ?? []),
  ].slice(0, 120);
}

/**
 * 기존 세이브와 완전 호환: 날짜/경기/계약/드래프트/시즌을 자동 진행하지 않고
 * 아마추어 야구 · MLB 30개 구단 스카우팅 · 해외파 상태를 안전하게 초기화한다.
 */
export function ensureAmateurAndOverseasStateInPlace(career: CareerSave): AmateurAndOverseasState {
  ensureGlobalPlayerRegistryInPlace(career);

  if (!career.amateurAndOverseas) {
    const rng = new SeededRng((career.seed || 2026) * 19 + 409);
    const mlbClubBudgets: MlbClubScoutingBudget[] = MLB_30_CLUBS_SEED.map((c) => ({ ...c }));
    const prospects: AmateurProspect[] = [];

    // 고교 1~3학년 60명 (3학년 24, 2학년 20, 1학년 16)
    const hsCounts: [1 | 2 | 3, number][] = [
      [3, 24],
      [2, 20],
      [1, 16],
    ];
    for (const [grade, count] of hsCounts) {
      for (let i = 0; i < count; i++) {
        prospects.push(generateVirtualAmateurProspect(career, rng, '고교', grade, career.season));
      }
    }

    // 대학 1~4학년 40명 (4학년 14, 3학년 10, 2학년 8, 1학년 8)
    const colCounts: [1 | 2 | 3 | 4, number][] = [
      [4, 14],
      [3, 10],
      [2, 8],
      [1, 8],
    ];
    for (const [grade, count] of colCounts) {
      for (let i = 0; i < count; i++) {
        prospects.push(generateVirtualAmateurProspect(career, rng, '대학', grade, career.season));
      }
    }

    const overseasPlayers = buildVerifiedOverseasBaseline(career.season);
    const state: AmateurAndOverseasState = {
      schemaVersion: 1,
      initializedSeason: career.season,
      mlbClubBudgets,
      prospects,
      tournamentResults: [],
      overseasPlayers,
      overseasAmateurSigningsBySeason: {},
    };
    recomputeProjectedDraftRanksInPlace(state, career.season);
    career.amateurAndOverseas = state;
  }

  // Sync any KBO players already exported to MLB (via posting or season export) without duplicating
  const state = career.amateurAndOverseas;
  const existingPermIds = new Set(state.overseasPlayers.map((o) => o.permanentId));
  const existingNames = new Set(state.overseasPlayers.map((o) => o.name));
  for (const p of Object.values(career.players)) {
    if (p.rosterTier !== '해외이적') continue;
    const permId = p.permanentId ?? p.id;
    if (existingPermIds.has(permId) || existingNames.has(p.name)) continue;
    const mlbRec = (career.mlbExports ?? []).find((m) => m.playerName === p.name);
    const clubName = mlbRec?.mlbTeam ?? 'LA 다저스';
    const isDomestic = p.category === '국내';
    if (!isDomestic) continue; // 해외파 한국인 선수 현황 관리 대상 (국내 출신 해외 진출자)
    state.overseasPlayers.push({
      permanentId: permId,
      sourceKboPlayerId: p.id,
      name: p.name,
      birthYear: p.birthYear ?? career.season - p.age,
      age: p.age,
      role: p.role,
      position: p.position,
      ability: p.ability,
      potential: p.potential,
      originCategory: 'KBO출신(포스팅·FA)',
      originalKboTeamId: p.teamId,
      league: 'MLB',
      clubName,
      contractYearsRemaining: mlbRec?.contractYears ?? 3,
      annualSalaryUsdThousands: Math.round(((mlbRec?.guaranteedUsdMillions ?? 12) / Math.max(1, mlbRec?.contractYears ?? 3)) * 1000),
      status: '현역',
      returnRestrictionActive: false,
      returnRestrictionNote: `KBO 출신 해외 진출 (${KBO_TEAMS[p.teamId].shortName} 원소속) — 국내 복귀 시 원소속 구단 복귀 규정 적용`,
      currentSeasonStats: {
        season: career.season,
        league: 'MLB',
        clubName,
        g: 0,
        ...(p.role === '타자'
          ? { avg: 0, h: 0, hr: 0, rbi: 0, sb: 0, ops: 0 }
          : { w: 0, l: 0, era: 0, ip: 0, so: 0, hld: 0, sv: 0 }),
      },
      seasonHistory: [],
      transferHistory: [
        {
          date: mlbRec?.lastUpdatedDate ?? `${career.season}-01-15`,
          season: mlbRec?.seasonExported ?? career.season,
          eventType: '계약',
          fromClub: KBO_TEAMS[p.teamId].name,
          toClub: clubName,
          note: `KBO에서 ${clubName} 진출`,
        },
      ],
      mlbDebutSeason: mlbRec?.seasonExported ?? career.season,
    });
    existingPermIds.add(permId);
    existingNames.add(p.name);
  }

  return state;
}

// =============================================================================
// 1. KBO 규약 제107조 — 국내 복귀 자격 심사 및 우회 영입 차단
// =============================================================================

export interface DomesticReturnAudit {
  canSignOriginalClub: boolean;
  canApplyRookieDraft: boolean;
  blockedByArticle107: boolean;
  daysRemaining: number;
  domesticEligibleDate: string | null;
  reason: string;
}

export function evaluateOverseasReturnEligibility(
  ov: OverseasPlayerRecord,
  currentIsoDate: string
): DomesticReturnAudit {
  // 기존 KBO 소속 선수의 해외 진출 복귀 (포스팅/FA/임의탈퇴) vs 아마추어 직행 구분
  if (ov.originCategory !== '아마추어직행') {
    if (ov.status === '은퇴' || ov.status === 'KBO복귀완료') {
      return {
        canSignOriginalClub: false,
        canApplyRookieDraft: false,
        blockedByArticle107: false,
        daysRemaining: 0,
        domesticEligibleDate: null,
        reason: ov.status === '은퇴' ? '현역 은퇴 선수' : '이미 KBO 복귀 완료',
      };
    }
    const stillUnderOverseasContract = ov.contractYearsRemaining > 0 && ov.status !== '방출대기' && ov.league !== 'FA/방출';
    if (stillUnderOverseasContract) {
      return {
        canSignOriginalClub: false,
        canApplyRookieDraft: false,
        blockedByArticle107: false,
        daysRemaining: 0,
        domesticEligibleDate: ov.overseasContractEndDate ?? null,
        reason: `해외 구단(${ov.clubName}) 계약 기간 중 (잔여 ${ov.contractYearsRemaining}년) — 계약 종료 또는 방출 시 원소속 구단(${ov.originalKboTeamId ? KBO_TEAMS[ov.originalKboTeamId].shortName : '자유'}) 복귀 가능`,
      };
    }
    return {
      canSignOriginalClub: true,
      canApplyRookieDraft: false,
      blockedByArticle107: false,
      daysRemaining: 0,
      domesticEligibleDate: currentIsoDate,
      reason: ov.originalKboTeamId
        ? `KBO 출신 해외파 복귀 자격 충족 — 원소속 구단 ${KBO_TEAMS[ov.originalKboTeamId].name} 복귀 계약 가능 (신인 드래프트 불필요)`
        : 'KBO 출신 해외파 복귀 자격 충족 — 자유 계약 가능',
    };
  }

  // 아마추어 해외 직행 선수 — KBO 규약 제107조 (해외 계약 종료일로부터 2년간 국내 계약 금지 + 신인 드래프트 의무)
  if (ov.status === '은퇴' || ov.status === 'KBO복귀완료') {
    return {
      canSignOriginalClub: false,
      canApplyRookieDraft: false,
      blockedByArticle107: false,
      daysRemaining: 0,
      domesticEligibleDate: ov.domesticEligibleDate ?? null,
      reason: ov.status === '은퇴' ? '현역 은퇴 선수' : '이미 KBO 복귀 완료',
    };
  }

  if (!ov.overseasContractEndDate) {
    return {
      canSignOriginalClub: false,
      canApplyRookieDraft: false,
      blockedByArticle107: true,
      daysRemaining: 730,
      domesticEligibleDate: null,
      reason: `해외 구단(${ov.clubName}) 소속 현역 — 계약 종료 후 KBO 규약 제107조에 따라 2년 유예 경과 시 신인 드래프트 참가 가능`,
    };
  }

  const eligibleDate = ov.domesticEligibleDate ?? addYearsIso(ov.overseasContractEndDate, 2);
  if (compareIsoDate(currentIsoDate, eligibleDate) < 0) {
    const daysRem = daysBetweenIso(currentIsoDate, eligibleDate);
    return {
      canSignOriginalClub: false,
      canApplyRookieDraft: false,
      blockedByArticle107: true,
      daysRemaining: daysRem,
      domesticEligibleDate: eligibleDate,
      reason: `KBO 규약 제107조 복귀 제한 기간 (해외 계약 종료 ${ov.overseasContractEndDate} → 국내 가능일 ${eligibleDate}, 잔여 ${daysRem}일) — 정식·육성선수 우회 영입 전면 금지`,
    };
  }

  return {
    canSignOriginalClub: false,
    canApplyRookieDraft: true,
    blockedByArticle107: false,
    daysRemaining: 0,
    domesticEligibleDate: eligibleDate,
    reason: `KBO 규약 제107조 2년 유예 만료 (${eligibleDate}) — 신인 드래프트 참가 신청 및 자격 심사 통과 시 지명 가능`,
  };
}

/**
 * 정식선수·육성선수 계약을 통한 KBO 규약 제107조 우회 영입 차단 검사
 */
export function assertNotBlockedByArticle107(
  career: CareerSave,
  playerName: string,
  permanentId?: string
): void {
  const state = career.amateurAndOverseas;
  if (!state) return;
  const isoDate = getCurrentCareerDate(career).isoDate;
  const match = state.overseasPlayers.find(
    (ov) =>
      (permanentId && ov.permanentId === permanentId) ||
      (ov.name === playerName && ov.originCategory === '아마추어직행')
  );
  if (!match) return;
  const audit = evaluateOverseasReturnEligibility(match, isoDate);
  if (audit.blockedByArticle107) {
    throw new Error(
      `[KBO 규약 제107조 위반] ${match.name} 선수는 해외 계약 종료 후 2년 유예 기간(${audit.domesticEligibleDate ?? '계약중'}) 중이므로 정식선수 또는 육성선수 계약을 통한 우회 영입이 불가합니다.`
    );
  }
}

/**
 * 해외파 신인 드래프트 참가 신청 및 자격 심사 (참가 기준일 + 신청 마감일 + 제107조 검증)
 */
export function applyOverseasPlayerForDraft(
  career: CareerSave,
  permanentId: string
): { nextCareer: CareerSave; approved: boolean; message: string } {
  const next = JSON.parse(JSON.stringify(career)) as CareerSave;
  const state = ensureAmateurAndOverseasStateInPlace(next);
  const ov = state.overseasPlayers.find((o) => o.permanentId === permanentId);
  if (!ov) throw new Error('대상 해외파 선수를 찾을 수 없습니다.');

  const currentIso = getCurrentCareerDate(next).isoDate;
  const targetSeason = next.draftState.completed ? next.season + 1 : next.season;
  const eligibilityRefDate = `${targetSeason}-09-01`;
  const applicationDeadlineDate = `${targetSeason}-08-20`;
  const audit = evaluateOverseasReturnEligibility(ov, eligibilityRefDate);

  let approved = true;
  let reviewReason = `${targetSeason} KBO 신인 드래프트 참가 자격 심사 통과 (기준일 ${eligibilityRefDate} · 마감일 ${applicationDeadlineDate})`;

  if (ov.originCategory !== '아마추어직행') {
    approved = false;
    reviewReason = `기존 KBO 소속 해외 진출 선수(${ov.originalKboTeamId ? KBO_TEAMS[ov.originalKboTeamId].shortName : '원소속'})는 신인 드래프트가 아닌 원소속 구단 복귀 절차 대상입니다.`;
  } else if (audit.blockedByArticle107) {
    approved = false;
    reviewReason = audit.reason;
  } else if (compareIsoDate(currentIso, applicationDeadlineDate) > 0 && !next.draftState.completed && next.draftState.picks.length > 0) {
    approved = false;
    reviewReason = `${targetSeason} 신인 드래프트 참가 신청 마감일(${applicationDeadlineDate})이 경과했습니다. 차기 연도 드래프트로 신청하세요.`;
  }

  ov.draftApplication = {
    targetSeason,
    appliedDate: currentIso,
    eligibilityRefDate,
    applicationDeadlineDate,
    approved,
    reviewReason,
  };

  if (approved) {
    ov.status = '국내복귀신청';
    // Add to draft candidates ONLY if draft has not started picks yet & not already present
    if (!next.draftState.completed && next.draftState.picks.length === 0) {
      const alreadyInPool = next.draftState.candidates.some(
        (c) => c.permanentId === ov.permanentId || (c.name === ov.name && c.isOverseasReturnee)
      );
      if (!alreadyInPool) {
        const maxId = next.draftState.candidates.reduce((m, c) => Math.max(m, c.id), 150);
        const newCand: DraftCandidate = {
          id: maxId + 1,
          permanentId: ov.permanentId,
          birthYear: ov.birthYear,
          name: ov.name,
          age: ov.age,
          originType: '독립리그',
          school: `${ov.clubName}(해외파)`,
          role: ov.role,
          position: ov.position,
          ability: ov.ability,
          potential: ov.potential,
          scoutedAbility: ov.ability,
          scoutedPotential: ov.potential,
          scoutAccuracy: '정밀',
          scoutGrade: ov.ability >= 76 ? 'S' : ov.ability >= 71 ? 'A+' : 'A',
          scoutTag: '해외파 드래프트 복귀',
          amateurSummary: `해외파 복귀 신청 (${ov.clubName} · ${ov.league}) — KBO 규약 제107조 2년 제한 만료`,
          signingBonusBillion: Number(Math.max(1.0, (ov.ability - 62) * 0.2).toFixed(1)),
          isOverseasReturnee: true,
          overseasReturnNote: reviewReason,
        };
        next.draftState.candidates.unshift(newCand);
      }
    }

    pushNewsSafe(next, {
      date: currentIso,
      category: '국제·병역',
      headline: `[국내 복귀 선언] 해외파 ${ov.name}(전 ${ov.clubName}), ${targetSeason} KBO 신인 드래프트 참가 신청 승인`,
      body: `${ov.name}(${ov.position} · ${ov.age}세) 선수가 KBO 규약 제107조 국내 복귀 제한 기간을 마치고 ${targetSeason} KBO 신인 드래프트 자격 심사를 통과했습니다.`,
      isHighlight: true,
    });
  }

  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, approved, message: reviewReason };
}

/**
 * KBO 출신 해외 진출자(원소속 구단 복귀 대상) 국내 복귀 계약 처리
 */
export function signEligibleKboAlumniReturnee(
  career: CareerSave,
  permanentId: string
): { nextCareer: CareerSave; message: string } {
  const next = JSON.parse(JSON.stringify(career)) as CareerSave;
  const state = ensureAmateurAndOverseasStateInPlace(next);
  const ov = state.overseasPlayers.find((o) => o.permanentId === permanentId);
  if (!ov) throw new Error('대상 해외파 선수를 찾을 수 없습니다.');

  const isoDate = getCurrentCareerDate(next).isoDate;
  const audit = evaluateOverseasReturnEligibility(ov, isoDate);
  if (!audit.canSignOriginalClub) {
    throw new Error(audit.reason);
  }
  if (ov.originalKboTeamId && ov.originalKboTeamId !== next.playerTeamId) {
    throw new Error(
      `${ov.name} 선수의 KBO 원소속 구단은 ${KBO_TEAMS[ov.originalKboTeamId].name}입니다. 타 구단은 임의 영입할 수 없습니다.`
    );
  }

  const teamId = next.playerTeamId;
  const annualBillion = Number(Math.max(3.5, (ov.ability - 66) * 0.72).toFixed(1));
  const years = ov.age >= 34 ? 2 : 4;
  const totalBillion = Number((annualBillion * years).toFixed(1));

  // If original player record exists in career.players, reactivate with same ID & permanentId!
  const existing =
    (ov.sourceKboPlayerId && next.players[ov.sourceKboPlayerId]) ||
    Object.values(next.players).find((p) => p.permanentId === ov.permanentId);

  const departureSeason =
    ov.mlbDebutSeason ??
    (ov.seasonHistory.length > 0
      ? Math.min(...ov.seasonHistory.map((s) => s.season))
      : Math.max(2020, next.season - 2));

  if (existing) {
    existing.teamId = teamId;
    existing.rosterTier = '1군';
    existing.gameDayActive = true;
    existing.age = ov.age;
    existing.ability = ov.ability;
    existing.potential = Math.max(existing.potential, ov.potential);
    existing.contract = {
      status: '확정',
      currency: 'KRW',
      years,
      yearsRemaining: years,
      startSeason: next.season,
      endSeason: next.season + years - 1,
      annualSalary: annualBillion,
      signingBonus: Number((annualBillion * 0.5).toFixed(1)),
      totalValue: totalBillion,
      note: `${next.season} 해외파 원소속 복귀 (${ov.clubName} → ${KBO_TEAMS[teamId].shortName})`,
    };
    if (
      ov.league === 'MLB' &&
      !(existing.careerTeamHistory ?? []).some(isMlbHistoryEntry)
    ) {
      appendPlayerMlbHistoryInPlace(
        existing,
        ov.clubName,
        departureSeason,
        Math.max(departureSeason, next.season - 1),
        'MLB 활약'
      );
    }
    appendPlayerTeamHistoryInPlace(existing, teamId, next.season, '해외파 KBO 원소속 복귀');
  } else {
    const pid = `${teamId}-RET-${ov.permanentId}`;
    const realProf = findRealPlayerClubProfile(ov.name, ov.originalKboTeamId ?? teamId);
    const baseHistory: PlayerTeamHistoryEntry[] = realProf
      ? realProf.history.map((h) => ({ ...h, league: h.league ?? (h.teamId ? 'KBO' : undefined) }))
      : [
          ...(ov.originalKboTeamId
            ? [
                {
                  teamLabel: KBO_TEAMS[ov.originalKboTeamId].name,
                  teamId: ov.originalKboTeamId,
                  league: 'KBO' as const,
                  fromSeason: Math.max(2012, departureSeason - 5),
                  toSeason: Math.max(2012, departureSeason - 1),
                },
              ]
            : []),
          {
            teamLabel: ov.clubName,
            league: ov.league === 'MLB' ? ('MLB' as const) : ('해외' as const),
            mlbTeamName: ov.league === 'MLB' ? ov.clubName : undefined,
            fromSeason: departureSeason,
            toSeason: Math.max(departureSeason, next.season - 1),
            note: `${ov.league} 진출`,
          },
        ];
    const lastHist = baseHistory[baseHistory.length - 1];
    if (lastHist && !lastHist.toSeason) {
      lastHist.toSeason = Math.max(lastHist.fromSeason, next.season - 1);
    }
    baseHistory.push({
      teamLabel: KBO_TEAMS[teamId].name,
      teamId,
      league: 'KBO',
      fromSeason: next.season,
      note: '해외파 KBO 원소속 복귀',
    });

    const newPlayer: Player = {
      id: pid,
      permanentId: ov.permanentId,
      birthYear: ov.birthYear,
      name: ov.name,
      teamId,
      category: '국내',
      nationality: '한국',
      previousLeagueClub: `${ov.league} ${ov.clubName}`,
      role: ov.role,
      position: ov.position,
      pitchRole: ov.role === '투수' ? (ov.position === 'SP' ? '선발' : '마무리') : undefined,
      age: ov.age,
      ability: ov.ability,
      potential: ov.potential,
      abilityStatus: '확정',
      form: 1,
      fatigue: 0,
      lastPitchedRound: 0,
      consecutiveAppearances: 0,
      rosterTier: '1군',
      gameDayActive: true,
      contract: {
        status: '확정',
        currency: 'KRW',
        years,
        yearsRemaining: years,
        startSeason: next.season,
        endSeason: next.season + years - 1,
        annualSalary: annualBillion,
        signingBonus: Number((annualBillion * 0.5).toFixed(1)),
        totalValue: totalBillion,
        note: `${next.season} 해외파 원소속 복귀 (${ov.clubName})`,
      },
      injury: null,
      morale: '만족',
      trainingFocus: null,
      serviceYears: 7,
      seasonRatingDelta: 0,
      lastEvaluatedAtTeamGames: 0,
      careerTeamHistory: baseHistory,
      isOneClubMan:
        new Set(baseHistory.map((h) => h.teamId).filter((t): t is TeamId => Boolean(t))).size <= 1,
      stats: ov.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
      postseasonStats: ov.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
    };
    next.players[pid] = newPlayer;
  }

  ov.status = 'KBO복귀완료';
  ov.transferHistory.unshift({
    date: isoDate,
    season: next.season,
    eventType: 'KBO복귀',
    fromClub: ov.clubName,
    toClub: KBO_TEAMS[teamId].name,
    note: `${years}년 총액 ${totalBillion}억 원 원소속 복귀 계약`,
  });

  pushNewsSafe(next, {
    date: isoDate,
    category: '이적·계약',
    headline: `[국내 복귀 확정] ${KBO_TEAMS[teamId].shortName}, 해외파 ${ov.name}과 ${years}년 ${totalBillion}억 원 복귀 계약`,
    body: `${ov.clubName}에서 활약한 ${ov.name} 선수가 KBO 원소속 구단 ${KBO_TEAMS[teamId].name} 복귀를 확정했습니다.`,
    teamId,
    isHighlight: true,
  });

  next.updatedAt = new Date().toISOString();
  return {
    nextCareer: next,
    message: `${ov.name} 선수가 ${KBO_TEAMS[teamId].name}로 ${years}년 총 ${totalBillion}억 원에 복귀했습니다!`,
  };
}

// =============================================================================
// 2. MONTHLY AUTOMATED UPDATE (OVERSEAS STATS + AMATEUR TOURNAMENTS + MLB SCOUTING)
//    - 해외 리그 전체 경기 시뮬레이션 금지 -> 해외파 선수 월별 성적만 경량 자동 산출
//    - 동일 월 중복 이벤트/성적 생성 차단 (lastMonthlyProcessedKey)
// =============================================================================

function simulateOneMonthOverseasStatsInPlace(
  ov: OverseasPlayerRecord,
  rng: SeededRng,
  monthKey: string,
  monthNum: number,
  isoDate: string,
  career: CareerSave
): void {
  if (ov.status === '은퇴' || ov.status === 'KBO복귀완료') return;
  if (ov.lastSimulatedMonthKey === monthKey) return;
  ov.lastSimulatedMonthKey = monthKey;

  if (ov.status === '부상자명단') {
    ov.injuryDaysRemaining = Math.max(0, (ov.injuryDaysRemaining ?? 20) - 30);
    if (ov.injuryDaysRemaining <= 0) {
      ov.status = '현역';
    } else {
      return;
    }
  }

  if (ov.league === 'FA/방출' || ov.status === '방출대기') {
    // Chance an MLB/NPB club signs a released player if still strong enough
    if (ov.ability >= 73 && ov.age <= 34 && rng.next() < 0.25) {
      const newClub = rng.pick(MLB_30_CLUBS_SEED).clubName;
      ov.clubName = newClub;
      ov.league = ov.ability >= 80 ? 'MLB' : 'AAA';
      ov.status = '현역';
      ov.contractYearsRemaining = 1;
      // 해외 재계약 시 복귀 자격 재검토 (종료일 재설정)
      ov.overseasContractEndDate = undefined;
      ov.domesticEligibleDate = undefined;
      ov.returnRestrictionActive = false;
      ov.returnRestrictionNote = `${newClub} 재계약 체결 — 해외 계약 종료 후 국내 복귀 자격 재검토 대상`;
      ov.transferHistory.unshift({
        date: isoDate,
        season: career.season,
        eventType: '재계약',
        toClub: newClub,
        note: `${newClub} (${ov.league}) 마이너/스플릿 계약 재입단 (국내 복귀 시점 재검토)`,
      });
      pushNewsSafe(career, {
        date: isoDate,
        category: 'MLB소식',
        headline: `[해외파 이적] ${ov.name}, ${newClub}(${ov.league})과 새 계약 체결`,
        body: `방출 후 새 팀을 찾던 ${ov.name}(${ov.position}) 선수가 ${newClub}과 계약하며 해외 도전을 이어갑니다.`,
      });
    }
    return;
  }

  // Only accumulate regular baseball season months (4..9)
  if (monthNum < 4 || monthNum > 9) return;

  // Occasional short injury
  if (rng.next() < 0.045) {
    ov.status = '부상자명단';
    ov.injuryDaysRemaining = rng.int(15, 45);
    return;
  }

  const leagueDifficulty: Record<OverseasLeagueLevel, number> = {
    MLB: 83,
    NPB: 79,
    AAA: 75,
    AA: 71,
    'A+': 67,
    A: 63,
    Rookie: 58,
    NPB2군: 68,
    'FA/방출': 70,
  };
  const edge = (ov.ability - (leagueDifficulty[ov.league] ?? 72)) / 12; // approx -1.5..+1.5
  const st = ov.currentSeasonStats;
  st.season = career.season;
  st.league = ov.league;
  st.clubName = ov.clubName;

  if (ov.role === '타자') {
    const addG = rng.int(18, 25);
    const prevG = st.g ?? 0;
    const prevH = st.h ?? 0;
    const prevHR = st.hr ?? 0;
    const prevRBI = st.rbi ?? 0;
    const prevSB = st.sb ?? 0;

    const ab = addG * 3.8;
    const expectedAvg = Math.max(0.185, Math.min(0.365, 0.258 + edge * 0.036 + (rng.next() - 0.5) * 0.04));
    const addH = Math.max(0, Math.round(ab * expectedAvg));
    const addHR = Math.max(0, Math.round(addG * Math.max(0.03, 0.11 + edge * 0.065) * (0.6 + rng.next() * 0.8)));
    const addRBI = Math.max(addHR, Math.round(addHR * 1.9 + addH * 0.34));
    const addSB = Math.max(0, Math.round((ov.position === 'CF' || ov.position === 'SS' || ov.position === '2B' ? 3.2 : 1.0) * rng.next()));

    st.g = prevG + addG;
    st.h = prevH + addH;
    st.hr = prevHR + addHR;
    st.rbi = prevRBI + addRBI;
    st.sb = prevSB + addSB;
    const totalAb = Math.max(1, st.g * 3.8);
    st.avg = Number(Math.min(0.41, st.h / totalAb).toFixed(3));
    const slg = Math.min(0.75, st.avg + (st.hr * 2.7 + st.h * 0.22) / totalAb);
    const obp = Math.min(0.48, st.avg + 0.068 + Math.max(0, edge * 0.015));
    st.ops = Number((obp + slg).toFixed(3));
  } else {
    const isStarter = ov.position === 'SP';
    const addG = isStarter ? rng.int(4, 5) : rng.int(8, 12);
    const addIp = isStarter ? Number((addG * (4.8 + rng.next() * 1.4)).toFixed(1)) : Number((addG * (0.95 + rng.next() * 0.35)).toFixed(1));
    const expectedEra = Math.max(1.85, Math.min(6.4, 3.85 - edge * 0.78 + (rng.next() - 0.5) * 0.9));
    const prevIp = st.ip ?? 0;
    const prevEr = ((st.era ?? 3.8) * prevIp) / 9;
    const addEr = Math.max(0, (expectedEra * addIp) / 9);
    const addW = Math.max(0, Math.round((isStarter ? 0.38 : 0.14) * addG * (1 + edge * 0.25) * rng.next() * 1.5));
    const addL = Math.max(0, Math.round((isStarter ? 0.28 : 0.1) * addG * (1 - edge * 0.2) * rng.next() * 1.4));
    const addSO = Math.max(1, Math.round(addIp * (0.85 + Math.max(0, edge) * 0.22 + rng.next() * 0.25)));
    const addSV = !isStarter && ov.position === 'CL' ? Math.max(0, rng.int(1, 5)) : 0;
    const addHLD = !isStarter && ov.position !== 'CL' ? Math.max(0, rng.int(1, 4)) : 0;

    const totalIp = Number((prevIp + addIp).toFixed(1));
    st.g = (st.g ?? 0) + addG;
    st.ip = totalIp;
    st.w = (st.w ?? 0) + addW;
    st.l = (st.l ?? 0) + addL;
    st.so = (st.so ?? 0) + addSO;
    st.sv = (st.sv ?? 0) + addSV;
    st.hld = (st.hld ?? 0) + addHLD;
    st.era = totalIp > 0 ? Number((((prevEr + addEr) * 9) / totalIp).toFixed(2)) : 0;
  }

  // Promotion / Demotion along Rookie -> A -> A+ -> AA -> AAA -> MLB ladder
  const idx = MINOR_LADDER.indexOf(ov.league);
  if (idx >= 0 && idx < MINOR_LADDER.length - 1) {
    const strongPerf =
      ov.role === '타자'
        ? (st.g >= 35 && (st.ops ?? 0) >= 0.845) || ov.ability >= (leagueDifficulty[ov.league] ?? 70) + 5
        : (st.g >= 8 && (st.era ?? 5) <= 2.95) || ov.ability >= (leagueDifficulty[ov.league] ?? 70) + 5;
    if (strongPerf && rng.next() < 0.32) {
      const nextLevel = MINOR_LADDER[idx + 1];
      const prevLevel = ov.league;
      ov.league = nextLevel;
      ov.currentSeasonStats.league = nextLevel;
      const isMlbDebut = nextLevel === 'MLB' && !ov.mlbDebutSeason;
      if (isMlbDebut) ov.mlbDebutSeason = career.season;
      ov.transferHistory.unshift({
        date: isoDate,
        season: career.season,
        eventType: isMlbDebut ? 'MLB데뷔' : '승격',
        fromClub: `${ov.clubName} (${prevLevel})`,
        toClub: `${ov.clubName} (${nextLevel})`,
        note: isMlbDebut
          ? `감격의 MLB 빅리그 콜업 및 데뷔! (${prevLevel} → MLB)`
          : `마이너리그 승격 (${prevLevel} → ${nextLevel})`,
      });
      if (isMlbDebut || nextLevel === 'AAA') {
        pushNewsSafe(career, {
          date: isoDate,
          category: 'MLB소식',
          headline: isMlbDebut
            ? `[MLB 데뷔] ${ov.name}(${ov.clubName}), 마침내 메이저리그 빅리그 콜업!`
            : `[마이너 승격] ${ov.name}(${ov.clubName}), 트리플A 승격으로 빅리그 문턱 진입`,
          body: `${ov.name}(${ov.age}세 · ${ov.position}) 선수가 ${prevLevel}에서의 맹활약을 인정받아 ${nextLevel}로 승격했습니다.`,
          isHighlight: isMlbDebut,
        });
      }
    }
  } else if (idx > 0 && idx <= MINOR_LADDER.length - 1) {
    // Demotion if struggling heavily
    const weakPerf =
      ov.role === '타자'
        ? st.g >= 40 && (st.ops ?? 0.75) < 0.61
        : st.g >= 10 && (st.era ?? 3.5) > 5.75;
    if (weakPerf && rng.next() < 0.22) {
      const lowerLevel = MINOR_LADDER[idx - 1];
      const prevLevel = ov.league;
      ov.league = lowerLevel;
      ov.currentSeasonStats.league = lowerLevel;
      ov.transferHistory.unshift({
        date: isoDate,
        season: career.season,
        eventType: '강등',
        fromClub: `${ov.clubName} (${prevLevel})`,
        toClub: `${ov.clubName} (${lowerLevel})`,
        note: `성적 부진으로 ${lowerLevel} 강등 조정`,
      });
    }
  }

  // Trade deadline (July) AI club transfer chance
  if (monthNum === 7 && rng.next() < 0.07) {
    const newClub = rng.pick(MLB_30_CLUBS_SEED.filter((c) => c.clubName !== ov.clubName)).clubName;
    const oldClub = ov.clubName;
    ov.clubName = newClub;
    ov.currentSeasonStats.clubName = newClub;
    ov.transferHistory.unshift({
      date: isoDate,
      season: career.season,
      eventType: '트레이드',
      fromClub: oldClub,
      toClub: newClub,
      note: `MLB 트레이드 마감 이적 (${oldClub} → ${newClub})`,
    });
    pushNewsSafe(career, {
      date: isoDate,
      category: 'MLB소식',
      headline: `[해외파 트레이드] ${ov.name}, ${oldClub} → ${newClub} 이적 확정`,
      body: `${ov.name}(${ov.league} · ${ov.position}) 선수가 구단 간 트레이드를 통해 ${newClub} 유니폼을 입게 되었습니다.`,
    });
  }
}

function runScheduledAmateurTournamentInPlace(
  career: CareerSave,
  state: AmateurAndOverseasState,
  rng: SeededRng,
  monthNum: number,
  isoDate: string
): void {
  const dueSpecs = KOREAN_AMATEUR_TOURNAMENTS.filter(
    (sp) =>
      sp.month === monthNum &&
      !state.tournamentResults.some(
        (r) => r.season === career.season && r.tournamentName === sp.name
      )
  );

  for (const spec of dueSpecs) {
    const pool = state.prospects.filter(
      (p) =>
        p.schoolType === spec.category &&
        p.careerPath === '재학중' &&
        !p.draftedToTeamId
    );
    if (pool.length < 4) continue;

    // Pick champion & runner-up schools weighted by prospect talent
    const schoolScores = new Map<string, number>();
    for (const p of pool) {
      schoolScores.set(
        p.schoolName,
        (schoolScores.get(p.schoolName) ?? 0) + p.ability * 0.7 + p.potential * 0.3 + rng.int(0, 22)
      );
    }
    const rankedSchools = [...schoolScores.entries()].sort((a, b) => b[1] - a[1]);
    const championSchool = rankedSchools[0]?.[0] ?? (spec.category === '고교' ? '덕수고' : '연세대');
    const runnerUpSchool = rankedSchools[1]?.[0] ?? (spec.category === '고교' ? '서울고' : '고려대');

    // Update season stats for participating prospects & boost standouts
    const standouts: AmateurProspect[] = [];
    for (const p of pool) {
      const playedG = rng.int(3, 6);
      p.seasonG += playedG;
      const perfBoost =
        (p.schoolName === championSchool ? 8 : p.schoolName === runnerUpSchool ? 4 : 0) +
        rng.int(-4, 10);

      if (p.role === '타자') {
        const avg = Number(Math.max(0.21, Math.min(0.46, 0.275 + (p.ability - 54) * 0.0045 + perfBoost * 0.003)).toFixed(3));
        const hr = (p.battingLine?.hr ?? 0) + Math.max(0, Math.round((p.batPowerGrade ?? 68) / 38 + (perfBoost > 9 ? 1 : 0) - rng.next() * 1.4));
        const rbi = (p.battingLine?.rbi ?? 0) + Math.max(1, Math.round(playedG * (0.65 + avg)));
        const sb = (p.battingLine?.sb ?? 0) + rng.int(0, 3);
        const ops = Number(Math.min(1.25, avg * 2.55 + hr * 0.025 + 0.08).toFixed(3));
        p.battingLine = { avg, hr, rbi, sb, ops };
        p.seasonStatSummary = `${p.seasonG}G 타율 ${avg.toFixed(3)} ${hr}홈런 ${rbi}타점 OPS ${ops.toFixed(3)}`;
      } else {
        const addIp = Number((playedG * (2.8 + rng.next() * 2.2)).toFixed(1));
        const ip = Number(((p.pitchingLine?.ip ?? 0) + addIp).toFixed(1));
        const era = Number(Math.max(0.75, Math.min(5.2, 2.85 - (p.ability - 56) * 0.075 - perfBoost * 0.04)).toFixed(2));
        const w = (p.pitchingLine?.w ?? 0) + (perfBoost >= 7 ? 2 : perfBoost >= 2 ? 1 : 0);
        const l = (p.pitchingLine?.l ?? 0) + (perfBoost < 0 ? 1 : 0);
        const so = (p.pitchingLine?.so ?? 0) + Math.round(addIp * (1.05 + (p.potential - 75) * 0.015));
        p.pitchingLine = { w, l, era, ip, so };
        p.seasonStatSummary = `${p.seasonG}G ${w}승 ${l}패 ERA ${era.toFixed(2)} ${ip}IP ${so}K${p.fastballKmh ? ` (최고 ${p.fastballKmh}km/h)` : ''}`;
      }

      if (perfBoost >= 10) {
        standouts.push(p);
        p.ability = Math.min(p.potential - 1, p.ability + 1);
        // Tournament breakout raises MLB interest for high-ceiling prospects
        if (p.potential >= 83 && p.overseasStatus !== '계약확정') {
          p.overseasInterestLevel = Math.min(98, p.overseasInterestLevel + Math.round(6 * spec.importanceWeight));
          p.youthIntlNote = `${spec.name} 맹활약으로 스카우트 평가 상승`;
        }
      }
    }

    const mvpPool = pool.filter((p) => p.schoolName === championSchool);
    const mvp =
      mvpPool.sort((a, b) => b.ability + b.potential - (a.ability + a.potential))[0] ??
      pool[0];

    const res: AmateurTournamentResult = {
      id: `ama-tourn-${career.season}-${spec.key}`,
      season: career.season,
      month: monthNum,
      category: spec.category,
      tournamentName: `${career.season} ${spec.name}`,
      championSchool,
      runnerUpSchool,
      mvpPermanentId: mvp.permanentId,
      mvpName: mvp.name,
      mvpSchool: mvp.schoolName,
      mvpPosition: mvp.position,
      mvpStatLine: mvp.seasonStatSummary,
      standoutProspectIds: standouts.slice(0, 5).map((s) => s.permanentId),
      summary: `${championSchool} 우승(준우승 ${runnerUpSchool}) · 대회 MVP ${mvp.name}(${mvp.schoolName} ${mvp.grade}학년 · ${mvp.position}) — ${mvp.seasonStatSummary}`,
    };

    state.tournamentResults.unshift(res);
    pushNewsSafe(career, {
      date: isoDate,
      category: '수상·이달의선수',
      headline: `[${spec.category}야구] ${championSchool}, ${career.season} ${spec.name} 우승 · MVP ${mvp.name}`,
      body: `${res.summary}. 주요 활약을 펼친 유망주들의 KBO 드래프트 예상 순위와 해외 스카우팅 평가가 갱신되었습니다.`,
    });
  }
}

function processMlbAmateurScoutingAndSigningsInPlace(
  career: CareerSave,
  state: AmateurAndOverseasState,
  rng: SeededRng,
  monthNum: number,
  isoDate: string
): void {
  const signedCount = state.overseasAmateurSigningsBySeason[career.season] ?? 0;
  const maxAnnualSignings = 3; // 연간 해외 진출 인원 기본 0~3명

  const candidates = state.prospects
    .filter(
      (p) =>
        p.careerPath === '재학중' &&
        !p.draftedToTeamId &&
        p.overseasStatus !== '계약확정' &&
        p.potential >= 83 &&
        ((p.schoolType === '고교' && p.grade === 3) || (p.schoolType === '대학' && p.grade >= 3))
    )
    .sort((a, b) => b.overseasInterestLevel + b.potential - (a.overseasInterestLevel + a.potential));

  let currentSigned = signedCount;

  for (const p of candidates.slice(0, 10)) {
    // Advance MLB club interest smoothly based on ability, potential, age, and international youth performance
    const boost = rng.int(-2, 7) + (p.fastballKmh && p.fastballKmh >= 151 ? 4 : 0);
    p.overseasInterestLevel = Math.max(0, Math.min(99, p.overseasInterestLevel + boost));

    if (p.interestedMlbClubs.length === 0 && p.overseasInterestLevel >= 42) {
      const club = rng.pick(
        state.mlbClubBudgets.filter(
          (b) => b.remainingBonusPoolUsd >= 400000 && (b.focusRole === '균형' || b.focusRole === p.role)
        )
      ) ?? state.mlbClubBudgets[0];
      p.interestedMlbClubs.push({
        clubName: club.clubName,
        interestScore: p.overseasInterestLevel,
        offeredBonusUsd: Math.min(club.remainingBonusPoolUsd, Math.round((350000 + (p.potential - 82) * 160000) / 10000) * 10000),
      });
    }

    const topOffer = p.interestedMlbClubs.sort((a, b) => b.offeredBonusUsd - a.offeredBonusUsd)[0];
    if (!topOffer) continue;

    // Status progression: 없음 -> 관심 -> 협상 -> 계약임박 -> 계약확정
    // 계약 확정 전에는 신인 후보에서 임의로 삭제하지 않음!
    if (p.overseasInterestLevel >= 76 && p.playerOverseasDesire >= 65 && monthNum >= 6) {
      p.overseasStatus = '계약임박';
    } else if (p.overseasInterestLevel >= 58 && p.playerOverseasDesire >= 50) {
      p.overseasStatus = '협상';
    } else if (p.overseasInterestLevel >= 38) {
      p.overseasStatus = '관심';
    }

    // Attempt final signing ONLY in Jul-Aug (before KBO draft), within 0~3 annual cap, MLB age >= 17 & guardian consent met
    const meetsLegalAge = p.age >= 17 && (p.age >= 19 || p.guardianConsentReady);
    const clubBudget = state.mlbClubBudgets.find((b) => b.clubName === topOffer.clubName);
    const hasBudget = Boolean(clubBudget && clubBudget.remainingBonusPoolUsd >= topOffer.offeredBonusUsd);
    const domesticPreferencePenalty = p.projectedDraftRank <= 3 ? 0.25 : 0.1;
    const signProb =
      (p.playerOverseasDesire / 100) * 0.48 +
      (topOffer.offeredBonusUsd >= 900000 ? 0.25 : 0.1) -
      domesticPreferencePenalty;

    if (
      p.overseasStatus === '계약임박' &&
      monthNum >= 7 &&
      monthNum <= 8 &&
      currentSigned < maxAnnualSignings &&
      meetsLegalAge &&
      hasBudget &&
      rng.next() < Math.max(0.08, signProb)
    ) {
      // Finalize MLB International Amateur Contract!
      p.overseasStatus = '계약확정';
      p.careerPath = '해외프로계약';
      p.signedMlbClub = topOffer.clubName;
      p.signedBonusUsd = topOffer.offeredBonusUsd;
      p.signedSeason = career.season;
      if (clubBudget) {
        clubBudget.remainingBonusPoolUsd = Math.max(0, clubBudget.remainingBonusPoolUsd - topOffer.offeredBonusUsd);
      }
      currentSigned += 1;
      state.overseasAmateurSigningsBySeason[career.season] = currentSigned;

      // Remove from upcoming KBO draft candidates ONLY IF draft has not started picks yet
      if (!career.draftState.completed && career.draftState.picks.length === 0) {
        career.draftState.candidates = career.draftState.candidates.filter(
          (c) => c.permanentId !== p.permanentId
        );
      }

      // Create OverseasPlayerRecord preserving the EXACT permanentId (never duplicate!)
      if (!state.overseasPlayers.some((o) => o.permanentId === p.permanentId)) {
        state.overseasPlayers.unshift({
          permanentId: p.permanentId,
          name: p.name,
          birthYear: p.birthYear,
          age: p.age,
          role: p.role,
          position: p.position,
          ability: p.ability,
          potential: p.potential,
          originCategory: '아마추어직행',
          originalKboTeamId: null,
          league: 'Rookie',
          clubName: topOffer.clubName,
          contractYearsRemaining: 6,
          annualSalaryUsdThousands: 75,
          signingBonusUsd: topOffer.offeredBonusUsd,
          status: '현역',
          returnRestrictionActive: false,
          returnRestrictionNote: `아마추어 해외 직행 (${p.schoolName} → ${topOffer.clubName}) — 해외 계약 종료 후 KBO 규약 제107조 2년 제한 적용`,
          currentSeasonStats: {
            season: career.season,
            league: 'Rookie',
            clubName: topOffer.clubName,
            g: 0,
            ...(p.role === '타자'
              ? { avg: 0, h: 0, hr: 0, rbi: 0, sb: 0, ops: 0 }
              : { w: 0, l: 0, era: 0, ip: 0, so: 0, hld: 0, sv: 0 }),
          },
          seasonHistory: [],
          transferHistory: [
            {
              date: isoDate,
              season: career.season,
              eventType: '계약',
              fromClub: p.schoolName,
              toClub: topOffer.clubName,
              note: `MLB 국제 아마추어 계약 확정 (계약금 $${topOffer.offeredBonusUsd.toLocaleString()} · 보호자 동의 완료)`,
            },
          ],
        });
      }

      pushNewsSafe(career, {
        date: isoDate,
        category: 'MLB소식',
        headline: `[해외 직행 확정] ${p.schoolName} ${p.name}(${p.position}), ${topOffer.clubName}과 $${Math.round(topOffer.offeredBonusUsd / 10000)}만 달러 계약`,
        body: `초고교급/대어급 유망주 ${p.name}(${p.schoolName} ${p.grade}학년 · 잠재 ${p.potential})이 MLB ${topOffer.clubName}과 국제 아마추어 계약을 확정해 ${career.season} KBO 신인 드래프트 대상에서 제외됐습니다. (고유 ID ${p.permanentId} 유지)`,
        isHighlight: true,
      });
    }
  }
}

/**
 * 시리즈 종료 시 호출되는 월별 자동 처리 진입점 (동일 월 중복 실행 차단)
 */
export function processMonthlyAmateurAndOverseasInPlace(
  career: CareerSave,
  rng: SeededRng,
  isoDate: string
): void {
  const state = ensureAmateurAndOverseasStateInPlace(career);
  const monthKey = isoDate.slice(0, 7); // YYYY-MM
  const monthNum = Number(isoDate.slice(5, 7)) || 4;
  if (state.lastMonthlyProcessedKey === monthKey) return;
  state.lastMonthlyProcessedKey = monthKey;

  // 1) 해외파 월별 성적·승격·강등·트레이드 자동 산출
  for (const ov of state.overseasPlayers) {
    simulateOneMonthOverseasStatsInPlace(ov, rng, monthKey, monthNum, isoDate, career);
  }

  // 2) 고교·대학 전국대회 자동 진행 및 스카우팅 갱신
  runScheduledAmateurTournamentInPlace(career, state, rng, monthNum, isoDate);

  // 3) MLB 30개 구단 해외 아마추어 스카우팅 및 계약 확정 (연 0~3명)
  processMlbAmateurScoutingAndSigningsInPlace(career, state, rng, monthNum, isoDate);

  // 4) 드래프트 예상 순위 갱신 + 고교/대학 최대어·초청명단 및 해외파 국내 복귀설 갱신 (#16, #21)
  recomputeProjectedDraftRanksInPlace(state, career.season);
  selectAnnualTopAmateurProspectsInPlace(career, monthNum === 8);
  generateOverseasReturnRumorsInPlace(career);
}

// =============================================================================
// 3. ROOKIE DRAFT INTEGRATION (150-PLAYER POOL, ZERO DUPLICATES, NO MID-DRAFT REGEN)
// =============================================================================

export function integrateAmateurAndOverseasIntoDraftCandidates(
  career: CareerSave,
  baseCandidates: DraftCandidate[],
  season: number
): DraftCandidate[] {
  const state = ensureAmateurAndOverseasStateInPlace(career);
  const usedPermIds = new Set<string>();
  const usedTuples = new Set<string>();
  const merged: DraftCandidate[] = [];
  let nextId = 1;

  // 1) Approved overseas returnees applying for KBO Draft
  const approvedOverseas = state.overseasPlayers.filter(
    (ov) =>
      ov.originCategory === '아마추어직행' &&
      ov.status === '국내복귀신청' &&
      ov.draftApplication?.approved &&
      ov.draftApplication.targetSeason === season
  );

  for (const ov of approvedOverseas) {
    if (usedPermIds.has(ov.permanentId)) continue;
    usedPermIds.add(ov.permanentId);
    merged.push({
      id: nextId++,
      permanentId: ov.permanentId,
      birthYear: ov.birthYear,
      name: ov.name,
      age: ov.age,
      originType: '독립리그',
      school: `${ov.clubName}(해외파복귀)`,
      role: ov.role,
      position: ov.position,
      ability: ov.ability,
      potential: ov.potential,
      scoutedAbility: ov.ability,
      scoutedPotential: ov.potential,
      scoutAccuracy: '정밀',
      scoutGrade: ov.ability >= 76 ? 'S' : ov.ability >= 70 ? 'A+' : 'A',
      scoutTag: '해외파 드래프트 복귀',
      amateurSummary: `해외파 복귀 (${ov.clubName} · ${ov.league}) — KBO 규약 제107조 심사 통과`,
      signingBonusBillion: Number(Math.max(1.0, (ov.ability - 62) * 0.22).toFixed(1)),
      isOverseasReturnee: true,
      overseasReturnNote: ov.draftApplication?.reviewReason,
    });
  }

  // 2) Eligible HS 3학년 / College 4학년 (+ Early Draft 2학년) NOT signed abroad
  const eligibleAmateurs = state.prospects
    .filter(
      (p) =>
        p.overseasStatus !== '계약확정' &&
        p.careerPath !== '해외프로계약' &&
        p.careerPath !== '은퇴' &&
        !p.draftedToTeamId &&
        (p.draftEligibleSeason <= season || p.isEarlyDraftEligible)
    )
    .sort((a, b) => a.projectedDraftRank - b.projectedDraftRank);

  for (const p of eligibleAmateurs) {
    if (merged.length >= 150) break;
    if (usedPermIds.has(p.permanentId)) continue;
    const tuple = `${p.name}|${p.birthYear}|${p.schoolName}`;
    if (usedTuples.has(tuple)) continue;
    usedPermIds.add(p.permanentId);
    usedTuples.add(tuple);

    const grade: DraftCandidate['scoutGrade'] =
      p.potential >= 88
        ? 'S'
        : p.potential >= 84
        ? 'A+'
        : p.potential >= 80
        ? 'A'
        : p.potential >= 76
        ? 'B+'
        : p.potential >= 72
        ? 'B'
        : 'C';

    merged.push({
      id: nextId++,
      permanentId: p.permanentId,
      birthYear: p.birthYear,
      name: p.name,
      age: p.age,
      originType: p.schoolType === '고교' ? '고졸' : '대학',
      school: p.schoolName,
      role: p.role,
      position: p.position,
      ability: p.ability,
      potential: p.potential,
      scoutedAbility: p.ability,
      scoutedPotential: p.potential,
      scoutAccuracy: '보통',
      scoutGrade: grade,
      scoutTag: p.overseasStatus !== '없음' ? `MLB ${p.overseasStatus}` : p.isEarlyDraftEligible ? '대학 얼리' : undefined,
      amateurSummary: `${p.schoolName} ${p.grade}학년 · ${p.seasonStatSummary}`,
      signingBonusBillion: Number(Math.max(0.3, Math.min(3.5, (p.potential - 72) * 0.16)).toFixed(1)),
    });
  }

  // 3) Top up from existing 150-player draft pool generator to keep full 150 candidates
  const signedAbroadIds = new Set(
    state.prospects.filter((p) => p.overseasStatus === '계약확정').map((p) => p.permanentId)
  );
  for (const c of baseCandidates) {
    if (merged.length >= 150) break;
    const permId = c.permanentId ?? allocatePermanentPlayerId(career, 'KBO-AMA');
    if (signedAbroadIds.has(permId) || usedPermIds.has(permId)) continue;
    const tuple = `${c.name}|${c.birthYear ?? season - c.age}|${c.school}`;
    if (usedTuples.has(tuple)) continue;
    usedPermIds.add(permId);
    usedTuples.add(tuple);
    merged.push({
      ...c,
      id: nextId++,
      permanentId: permId,
      birthYear: c.birthYear ?? season - c.age,
    });
  }

  return merged;
}

export function markAmateurOrOverseasDraftedInPlace(
  career: CareerSave,
  permanentId: string | undefined,
  teamId: TeamId,
  season: number
): void {
  if (!permanentId || !career.amateurAndOverseas) return;
  const state = career.amateurAndOverseas;
  const pr = state.prospects.find((p) => p.permanentId === permanentId);
  if (pr) {
    pr.careerPath = 'KBO드래프트참가';
    pr.draftedToTeamId = teamId;
    pr.draftedSeason = season;
  }
  const ov = state.overseasPlayers.find((o) => o.permanentId === permanentId);
  if (ov) {
    ov.status = 'KBO복귀완료';
    ov.transferHistory.unshift({
      date: `${season}-09-15`,
      season,
      eventType: 'KBO복귀',
      fromClub: ov.clubName,
      toClub: KBO_TEAMS[teamId].name,
      note: `${season} KBO 신인 드래프트 ${KBO_TEAMS[teamId].shortName} 지명으로 국내 복귀 완료`,
    });
  }
}

// =============================================================================
// 4. SEASON TRANSITION (GRADE PROMOTION, CAREER PATHS, OVERSEAS AGING & RELEASES)
// =============================================================================

export function advanceAmateurAndOverseasSeasonInPlace(
  career: CareerSave,
  rng: SeededRng
): void {
  const state = ensureAmateurAndOverseasStateInPlace(career);
  const newSeason = career.season;
  const prevSeason = newSeason - 1;
  const isoDate = `${newSeason}-03-01`;

  // 1) Reset MLB 30-club bonus pools for new international signing period
  for (const club of state.mlbClubBudgets) {
    club.remainingBonusPoolUsd = club.maxBonusPoolUsd;
  }

  // 2) Advance Amateur Prospects (graduation paths, college entry preserving permanentId, grade promotion)
  const nextProspects: AmateurProspect[] = [];
  for (const p of state.prospects) {
    if (p.draftedToTeamId || p.careerPath === '해외프로계약' || p.careerPath === '은퇴') {
      continue; // Already entered KBO, overseas pro, or retired
    }

    p.age += 1;
    p.seasonG = 0;
    p.seasonStatSummary = `${newSeason} 시즌 대기`;
    p.battingLine = undefined;
    p.pitchingLine = undefined;

    if (p.schoolType === '고교') {
      if (p.grade < 3) {
        p.grade = (p.grade + 1) as 1 | 2 | 3;
        p.ability = Math.min(p.potential - 2, p.ability + rng.int(2, 5));
        if (p.fastballKmh) p.fastballKmh = Number(Math.min(158, p.fastballKmh + rng.next() * 1.6).toFixed(1));
        nextProspects.push(p);
      } else {
        // 고교 3학년 미지명 졸업생 진로 선택 (국내대학진학은 동일 permanentId 유지!)
        const roll = rng.next();
        if (roll < 0.62) {
          p.schoolType = '대학';
          p.schoolName = rng.pick(KOREAN_UNIVERSITIES);
          p.grade = 1;
          p.careerPath = '재학중';
          p.draftEligibleSeason = newSeason + 3;
          p.isEarlyDraftEligible = false;
          p.ability = Math.min(p.potential - 2, p.ability + rng.int(2, 4));
          p.youthIntlNote = `${prevSeason} 고교 졸업 후 ${p.schoolName} 진학 (고유 ID 유지 · 차기 드래프트 재도전)`;
          nextProspects.push(p);
        } else if (roll < 0.72) {
          p.careerPath = '해외대학진학';
        } else if (roll < 0.88) {
          p.careerPath = '독립리그';
        } else {
          p.careerPath = '은퇴';
        }
      }
    } else {
      // 대학
      if (p.grade < 4) {
        p.grade = (p.grade + 1) as 1 | 2 | 3 | 4;
        p.ability = Math.min(p.potential - 1, p.ability + rng.int(1, 4));
        p.isEarlyDraftEligible = p.grade === 2 && p.potential >= 82;
        nextProspects.push(p);
      } else {
        // 대학 4학년 미지명 -> 독립리그 재도전 또는 은퇴
        p.careerPath = rng.next() < 0.55 ? '독립리그' : '은퇴';
      }
    }
  }

  // Add incoming fresh HS 1학년 (20명) & College 1학년 (8명)
  for (let i = 0; i < 20; i++) {
    nextProspects.push(generateVirtualAmateurProspect(career, rng, '고교', 1, newSeason));
  }
  for (let i = 0; i < 8; i++) {
    nextProspects.push(generateVirtualAmateurProspect(career, rng, '대학', 1, newSeason));
  }
  state.prospects = nextProspects;
  recomputeProjectedDraftRanksInPlace(state, newSeason);

  // 3) Advance Overseas Players (archive seasonHistory, age +1, growth/decline, contracts, releases, Article 107)
  for (const ov of state.overseasPlayers) {
    if (ov.status === '은퇴' || ov.status === 'KBO복귀완료') continue;

    if (ov.currentSeasonStats.g > 0) {
      ov.seasonHistory.push({ ...ov.currentSeasonStats });
    }
    ov.age += 1;

    // Growth / aging identical philosophy to domestic players
    if (ov.age <= 25 && ov.ability < ov.potential) {
      ov.ability = Math.min(ov.potential, ov.ability + rng.int(1, 4));
    } else if (ov.age >= 33) {
      ov.ability = Math.max(55, ov.ability - rng.int(1, 3));
    }

    // Reset currentSeasonStats for newSeason
    const freshStat: OverseasSeasonStatLine = {
      season: newSeason,
      league: ov.league,
      clubName: ov.clubName,
      g: 0,
      ...(ov.role === '타자'
        ? { avg: 0, h: 0, hr: 0, rbi: 0, sb: 0, ops: 0 }
        : { w: 0, l: 0, era: 0, ip: 0, so: 0, hld: 0, sv: 0 }),
    };
    ov.currentSeasonStats = freshStat;

    // Retirement check
    if (ov.age >= 39 || (ov.age >= 36 && ov.ability <= 64 && rng.next() < 0.45)) {
      ov.status = '은퇴';
      ov.transferHistory.unshift({
        date: isoDate,
        season: newSeason,
        eventType: '은퇴',
        fromClub: ov.clubName,
        toClub: '은퇴',
        note: `만 ${ov.age}세 해외 커리어 마감 및 현역 은퇴`,
      });
      pushNewsSafe(career, {
        date: isoDate,
        category: 'MLB소식',
        headline: `[해외파 은퇴] ${ov.name}(전 ${ov.clubName}), 현역 유니폼 벗는다`,
        body: `${ov.name}(${ov.age}세 · ${ov.position}) 선수가 해외 무대 여정을 마무리하고 은퇴를 선언했습니다.`,
      });
      continue;
    }

    // Contract countdown & expiration / release / re-signing
    if (ov.contractYearsRemaining > 0) {
      ov.contractYearsRemaining = Math.max(0, ov.contractYearsRemaining - 1);
    }

    if (ov.contractYearsRemaining === 0 && ov.status === '현역') {
      const keepAbroad =
        (ov.league === 'MLB' && ov.ability >= 77) ||
        (ov.age <= 24 && ov.potential >= 80 && rng.next() < 0.7);
      if (keepAbroad) {
        const extYears = ov.age >= 33 ? 1 : rng.int(1, 3);
        ov.contractYearsRemaining = extYears;
        const newClub = rng.next() < 0.55 ? ov.clubName : rng.pick(MLB_30_CLUBS_SEED).clubName;
        const moved = newClub !== ov.clubName;
        const oldClub = ov.clubName;
        ov.clubName = newClub;
        ov.currentSeasonStats.clubName = newClub;
        ov.overseasContractEndDate = undefined;
        ov.domesticEligibleDate = undefined;
        ov.returnRestrictionActive = false;
        ov.transferHistory.unshift({
          date: isoDate,
          season: newSeason,
          eventType: moved ? '이적' : '재계약',
          fromClub: oldClub,
          toClub: newClub,
          note: `${newClub} ${extYears}년 ${moved ? 'FA 이적' : '재계약'} (국내 복귀 자격 재검토)`,
        });
        if (moved) {
          pushNewsSafe(career, {
            date: isoDate,
            category: 'MLB소식',
            headline: `[해외파 FA 이적] ${ov.name}, ${oldClub} 떠나 ${newClub}과 ${extYears}년 계약`,
            body: `${ov.name}(${ov.position}) 선수가 ${newClub}과 ${extYears}년 계약을 체결하며 해외 커리어를 이어갑니다.`,
          });
        }
      } else {
        // Released from overseas club -> record overseasContractEndDate & Article 107 domesticEligibleDate (+2 years for amateur-direct)
        const endDate = `${prevSeason}-11-01`;
        ov.league = 'FA/방출';
        ov.status = '방출대기';
        ov.overseasContractEndDate = endDate;
        if (ov.originCategory === '아마추어직행') {
          const eligDate = addYearsIso(endDate, 2);
          ov.domesticEligibleDate = eligDate;
          ov.returnRestrictionActive = compareIsoDate(isoDate, eligDate) < 0;
          ov.returnRestrictionNote = `해외 계약 종료(${endDate}) — KBO 규약 제107조 2년 제한 적용 (국내 계약·드래프트 가능일: ${eligDate})`;
        } else {
          ov.domesticEligibleDate = isoDate;
          ov.returnRestrictionActive = false;
          ov.returnRestrictionNote = `해외 계약 종료(${endDate}) — KBO 원소속 구단(${ov.originalKboTeamId ? KBO_TEAMS[ov.originalKboTeamId].shortName : '자유'}) 복귀 가능`;
        }
        ov.transferHistory.unshift({
          date: endDate,
          season: prevSeason,
          eventType: '방출',
          fromClub: ov.clubName,
          toClub: 'FA/방출',
          note: `${ov.clubName} 계약 만료/방출 (${ov.returnRestrictionNote})`,
        });
        pushNewsSafe(career, {
          date: isoDate,
          category: 'MLB소식',
          headline: `[해외 구단 방출] ${ov.name}(전 ${ov.clubName}) 계약 종료 — 국내 복귀 여부 주목`,
          body: `${ov.name}(${ov.age}세 · ${ov.position}) 선수가 ${ov.clubName}와 결별했습니다. ${ov.returnRestrictionNote}`,
          isHighlight: true,
        });
      }
    }

    // Re-evaluate restriction status if already released
    if (ov.overseasContractEndDate && ov.domesticEligibleDate) {
      ov.returnRestrictionActive = compareIsoDate(isoDate, ov.domesticEligibleDate) < 0;
    }
  }
}

export function toggleAmateurProspectWatchlist(
  career: CareerSave,
  permanentId: string
): CareerSave {
  const next = JSON.parse(JSON.stringify(career)) as CareerSave;
  const state = ensureAmateurAndOverseasStateInPlace(next);
  const target = state.prospects.find((p) => p.permanentId === permanentId);
  if (target) {
    target.watchlisted = !target.watchlisted;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}
