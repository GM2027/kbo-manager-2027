import { isMilitaryServing } from './militaryEngine';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { allocateTeamUniformNumber } from '../data/playerMetadata';
import { CareerSave, Player, TeamId } from '../types/kbo';
import { getCurrentCareerDate } from './salaryCapEngine';

/**
 * KBO 공식 육성선수 규정 상수
 * - 정식선수 정원: 68명 (육성선수는 별도 관리)
 * - 정식선수 전환 가능 시점: 매년 5월 1일 이후
 * - 고졸 육성선수 구단별 연간 선발 제한: 시즌당 최대 3명
 */
export const KBO_OFFICIAL_ROSTER_LIMIT = 68;
export const KBO_HS_DEV_ANNUAL_LIMIT = 3;

export interface DevelopmentalConversionCheck {
  eligible: boolean;
  reasons: string[];
  officialRosterCount: number;
  officialRosterLimit: number;
  isAfterMay1: boolean;
  currentDateIso: string;
  draftAuditNote: string;
}

export interface ClubRosterQuotaSummary {
  teamId: TeamId;
  officialCount: number; // 1군 + 2군 정식 등록 인원
  officialLimit: number; // 68명
  firstTeamCount: number;
  secondTeamCount: number;
  developmentalCount: number; // 68명 정원 외 별도 관리
  militaryCount: number; // 상무 복무(별도 관리)
  hsDevSignedThisSeason: number;
  hsDevAnnualLimit: number;
  isConversionWindowOpen: boolean;
  currentDateIso: string;
}

/**
 * 정식선수(68명 정원)에 해당하는지 판정합니다.
 * 육성선수, 상무복무, FA, 은퇴, 해외이적 선수는 68명 정원과 별도로 관리합니다.
 */
export function isOfficialRegisteredPlayer(p: Player, teamId?: TeamId): boolean {
  if (teamId && p.teamId !== teamId) return false;
  if (isMilitaryServing(p.militaryStatus)) return false;
  return p.rosterTier === '1군' || p.rosterTier === '2군';
}

/**
 * 1군 출전이 허용되는 정식 선수인지 엄격히 판정합니다.
 * 육성선수 및 상무복무 선수는 정식 등록 전까지 1군 경기에 절대 출전할 수 없습니다.
 */
export function canPlayerAppearInFirstTeam(p: Player): boolean {
  if (!p) return false;
  if (p.rosterTier === '육성') return false;
  if (isMilitaryServing(p.militaryStatus)) return false;
  if (p.rosterTier === 'FA' || p.rosterTier === '은퇴' || p.rosterTier === '해외이적') return false;
  return p.rosterTier === '1군' || p.rosterTier === '2군';
}

export function getClubOfficialRosterCount(career: CareerSave, teamId: TeamId): number {
  return Object.values(career.players).filter((p) => isOfficialRegisteredPlayer(p, teamId)).length;
}

export function getClubDevelopmentalCount(career: CareerSave, teamId: TeamId): number {
  return Object.values(career.players).filter(
    (p) => p.teamId === teamId && p.rosterTier === '육성' && !isMilitaryServing(p.militaryStatus)
  ).length;
}

export function getClubHighSchoolDevSigningsCount(
  career: CareerSave,
  teamId: TeamId,
  season: number = career.season
): number {
  const key = `${season}-${teamId}`;
  return career.highSchoolDevSigningsBySeason?.[key] ?? 0;
}

export function recordHighSchoolDevSigning(
  career: CareerSave,
  teamId: TeamId,
  season: number = career.season
): void {
  if (!career.highSchoolDevSigningsBySeason) {
    career.highSchoolDevSigningsBySeason = {};
  }
  const key = `${season}-${teamId}`;
  career.highSchoolDevSigningsBySeason[key] = (career.highSchoolDevSigningsBySeason[key] ?? 0) + 1;
}

/**
 * 매년 5월 1일 이후 정식선수 전환 허용 여부를 게임 내 공식 캘린더 날짜로 검사합니다.
 */
export function isDevelopmentalConversionWindowOpen(career: CareerSave): {
  open: boolean;
  isoDate: string;
  month: number;
  day: number;
} {
  const cal = getCurrentCareerDate(career);
  const parts = cal.isoDate.split('-').map(Number);
  const month = parts[1] || 3;
  const day = parts[2] || 1;
  // 정규시즌 5월 1일 이후 ~ 포스트시즌/오프시즌(11~12월) 전환 허용, 개막전(3~4월) 차단
  const open =
    career.phase === 'OFFSEASON'
      ? month >= 5 || month === 11 || month === 12
      : month >= 5;
  return { open, isoDate: cal.isoDate, month, day };
}

export function getClubRosterQuotaSummary(
  career: CareerSave,
  teamId: TeamId = career.playerTeamId
): ClubRosterQuotaSummary {
  const players = Object.values(career.players).filter((p) => p.teamId === teamId);
  const firstTeamCount = players.filter(
    (p) => p.rosterTier === '1군' && !isMilitaryServing(p.militaryStatus)
  ).length;
  const secondTeamCount = players.filter(
    (p) => p.rosterTier === '2군' && !isMilitaryServing(p.militaryStatus)
  ).length;
  const developmentalCount = players.filter(
    (p) => p.rosterTier === '육성' && !isMilitaryServing(p.militaryStatus)
  ).length;
  const militaryCount = players.filter((p) => isMilitaryServing(p.militaryStatus)).length;
  const win = isDevelopmentalConversionWindowOpen(career);
  return {
    teamId,
    officialCount: firstTeamCount + secondTeamCount,
    officialLimit: KBO_OFFICIAL_ROSTER_LIMIT,
    firstTeamCount,
    secondTeamCount,
    developmentalCount,
    militaryCount,
    hsDevSignedThisSeason: getClubHighSchoolDevSigningsCount(career, teamId),
    hsDevAnnualLimit: KBO_HS_DEV_ANNUAL_LIMIT,
    isConversionWindowOpen: win.open,
    currentDateIso: win.isoDate,
  };
}

/**
 * 육성선수의 정식선수 전환 자격을 KBO 규정대로 전수 검사합니다.
 * 1) 육성선수 신분 확인
 * 2) 매년 5월 1일 이후 여부 확인
 * 3) 정식선수 68명 정원 잔여 확인
 * 4) 드래프트 이력 및 KBO 등록 자격(국내선수, 비복무, 입단/드래프트 이력) 검사
 */
export function checkDevelopmentalConversionEligibility(
  career: CareerSave,
  playerId: string,
  teamId?: TeamId
): DevelopmentalConversionCheck {
  const p = career.players[playerId];
  const targetTeam = teamId ?? p?.teamId ?? career.playerTeamId;
  const officialRosterCount = getClubOfficialRosterCount(career, targetTeam);
  const win = isDevelopmentalConversionWindowOpen(career);
  const reasons: string[] = [];

  if (!p || p.teamId !== targetTeam) {
    reasons.push('해당 구단 소속 선수를 찾을 수 없습니다.');
    return {
      eligible: false,
      reasons,
      officialRosterCount,
      officialRosterLimit: KBO_OFFICIAL_ROSTER_LIMIT,
      isAfterMay1: win.open,
      currentDateIso: win.isoDate,
      draftAuditNote: '미확인',
    };
  }

  if (p.rosterTier !== '육성') {
    reasons.push(`${p.name} 선수는 이미 정식 등록 상태(${p.rosterTier})입니다.`);
  }

  if (!win.open) {
    reasons.push(
      `KBO 규약상 육성선수 정식 전환은 매년 5월 1일 이후부터 가능합니다. (현재 날짜: ${win.isoDate})`
    );
  }

  if (officialRosterCount >= KBO_OFFICIAL_ROSTER_LIMIT) {
    reasons.push(
      `정식선수 정원(${officialRosterCount}/${KBO_OFFICIAL_ROSTER_LIMIT}명)이 가득 차 전환할 수 없습니다. 정식선수를 먼저 방출·트레이드해야 합니다.`
    );
  }

  // 드래프트 이력 및 KBO 등록 자격 검사
  if (isMilitaryServing(p.militaryStatus)) {
    reasons.push('상무 복무 중인 선수는 전역 전까지 정식선수 등록 전환이 불가합니다.');
  }
  if (p.category !== '국내') {
    reasons.push('외국인·아시아쿼터 선수는 육성선수 정식 전환 대상이 아닙니다.');
  }
  if (p.age < 18) {
    reasons.push('만 18세 미만 미등록 아마추어 선수는 정식선수 등록 자격이 없습니다.');
  }

  const acq = p.acquisitionInfo;
  const draftAuditNote = acq?.draftRound
    ? `${acq.draftYear ?? career.season} 신인드래프트 ${acq.draftRound}R 지명 이력 확인 · 등록 적격`
    : acq?.type === '육성선수' || p.developmentalOrigin
    ? `${acq?.draftYear ?? career.season} ${p.developmentalOrigin ?? '육성'} 입단 이력 확인 · 등록 적격`
    : `${career.season} 육성 등록 자격 검사 통과`;

  return {
    eligible: reasons.length === 0,
    reasons,
    officialRosterCount,
    officialRosterLimit: KBO_OFFICIAL_ROSTER_LIMIT,
    isAfterMay1: win.open,
    currentDateIso: win.isoDate,
    draftAuditNote,
  };
}

/**
 * 고졸 육성선수 선발 제한 검사 (전체 10개 구단 동일 적용)
 */
export function checkHighSchoolDevelopmentalLimit(
  career: CareerSave,
  teamId: TeamId,
  origin: '고졸' | '대졸' | '독립리그' | '방출선수'
): { allowed: boolean; current: number; limit: number; reason?: string } {
  const current = getClubHighSchoolDevSigningsCount(career, teamId);
  if (origin !== '고졸') {
    return { allowed: true, current, limit: KBO_HS_DEV_ANNUAL_LIMIT };
  }
  if (current >= KBO_HS_DEV_ANNUAL_LIMIT) {
    return {
      allowed: false,
      current,
      limit: KBO_HS_DEV_ANNUAL_LIMIT,
      reason: `고졸 육성선수 연간 선발 한도(${current}/${KBO_HS_DEV_ANNUAL_LIMIT}명)에 도달했습니다. 대졸·독립리그·방출 출신 육성선수만 추가 영입할 수 있습니다.`,
    };
  }
  return { allowed: true, current, limit: KBO_HS_DEV_ANNUAL_LIMIT };
}

/**
 * 육성선수를 정식선수(2군)로 등록 전환합니다. (내부 변이 헬퍼 — 10개 구단 공통 적용)
 * - 1군 엔트리 등록은 별도 처리 (gameDayActive = false, rosterTier = '2군')
 * - 기존 계약(연봉·계약기간), 능력치, 경기 기록을 그대로 유지합니다.
 */
export function applyDevelopmentalConversionInPlace(
  next: CareerSave,
  playerId: string,
  teamId: TeamId,
  retiredNumbers: number[]
): { oldNumber: number | undefined; newNumber: number; draftAuditNote: string } {
  const audit = checkDevelopmentalConversionEligibility(next, playerId, teamId);
  if (!audit.eligible) {
    throw new Error(audit.reasons[0] ?? '육성선수 정식 등록 전환 조건을 충족하지 못했습니다.');
  }

  const p = next.players[playerId];
  const oldNumber = p.uniformNumber;
  const newNumber = allocateTeamUniformNumber(
    next.players,
    teamId,
    false,
    undefined,
    retiredNumbers
  );

  // 정식선수로 전환하되 2군 등록(1군 엔트리 콜업은 별도 절차)
  p.rosterTier = '2군';
  p.gameDayActive = false;
  p.uniformNumber = newNumber;
  p.morale = '만족';

  // 기존 계약, 능력치, 경기 기록 그대로 유지 (KBO 최저연봉 미달 시에만 최저선 보정: 2027~ 3,300만 원)
  const minSal = next.season >= 2027 ? 0.33 : 0.3;
  const existingSalary = p.contract.annualSalary >= minSal ? p.contract.annualSalary : minSal;
  p.contract = {
    ...p.contract,
    annualSalary: existingSalary,
    note: `${p.contract.note ? `${p.contract.note} · ` : ''}${next.season} 정식 전환(#${oldNumber ?? '100+'}→#${newNumber} · 기존 계약·기록 유지)`,
  };

  p.acquisitionInfo = {
    ...(p.acquisitionInfo ?? { type: '육성선수', label: `${next.season} 육성선수` }),
    draftYear: p.acquisitionInfo?.draftYear ?? next.season,
    wasDevelopmental: true,
    label: `${p.acquisitionInfo?.draftYear ?? next.season} ${p.developmentalOrigin ?? '육성선수'} → ${audit.currentDateIso} 정식선수 전환`,
  };

  return { oldNumber, newNumber, draftAuditNote: audit.draftAuditNote };
}

/**
 * 전체 10개 구단(유저 구단 포함)의 육성선수를 코칭스태프가 자동 평가하여
 * 정식선수(2군) 전환 계약 및 위약금 없는 자동 방출을 처리합니다.
 * - KBO 규약 준수: 5월 1일 이후 전환, 정식 정원 68명 미만, 육성선수 1군 출전 불가
 * - 코칭스태프 판단 기준:
 *   1) 자동 정식선수 계약: 능력치 66 이상 또는 (능력치 63 이상 & 잠재력 76 이상 & 23세 이하) 또는 실전 활약 우수
 *   2) 자동 방출(위약금 없음): 시즌 중반(36경기 이후) 또는 오프시즌 기준 성장 정체(26세+ 능력치 60 이하 & 잠재력 65 이하, 28세+ 능력치 62 이하, 24세+ 능력치 55 이하 & 잠재력 62 이하)
 */
export function processCoachDevelopmentalDecisionsInPlace(
  next: CareerSave,
  getRetiredNumbers: (career: CareerSave, teamId: TeamId) => number[],
  includeUserClub: boolean = true
): { converted: Array<{ teamId: TeamId; playerId: string; playerName: string; newNumber: number }>; released: Array<{ teamId: TeamId; playerId: string; playerName: string }> } {
  const win = isDevelopmentalConversionWindowOpen(next);
  const converted: Array<{ teamId: TeamId; playerId: string; playerName: string; newNumber: number }> = [];
  const released: Array<{ teamId: TeamId; playerId: string; playerName: string }> = [];
  const allowReleaseWindow =
    next.phase === 'OFFSEASON' ||
    (next.gamesPlayed >= 36 && next.gamesPlayed % 12 === 0);

  for (const tid of TEAM_IDS) {
    if (!includeUserClub && tid === next.playerTeamId) continue;

    // 1. 1군 로스터/라인업에 육성선수가 잘못 포함되지 않도록 전 구단 동일 차단
    const t = next.teams[tid];
    const devIds = new Set(
      Object.values(next.players)
        .filter((p) => p.teamId === tid && p.rosterTier === '육성')
        .map((p) => p.id)
    );
    if (devIds.size > 0 && t) {
      t.lineupOrder = t.lineupOrder.filter((id) => !devIds.has(id));
      t.benchOrder = t.benchOrder.filter((id) => !devIds.has(id));
      t.rotationOrder = t.rotationOrder.filter((id) => !devIds.has(id));
      t.bullpenOrder = t.bullpenOrder.filter((id) => !devIds.has(id));
      for (const id of devIds) {
        if (next.players[id]) next.players[id].gameDayActive = false;
      }
    }

    const headCoachName =
      next.coaches?.[tid]?.find((c) => c.role === '감독')?.name ??
      next.coaches?.[tid]?.find((c) => c.role === '수석코치')?.name ??
      '코칭스태프';

    // 2. 5월 1일 이후 & 68명 정원 미만일 때 코칭스태프 판단으로 우수 육성선수 자동 정식선수(2군) 계약
    if (win.open) {
      const officialCount = getClubOfficialRosterCount(next, tid);
      if (officialCount < KBO_OFFICIAL_ROSTER_LIMIT) {
        const readyDev = Object.values(next.players)
          .filter((p) => {
            const playedGames =
              'games' in p.stats && typeof p.stats.games === 'number' ? p.stats.games : 0;
            const pitchedOuts =
              'ipOuts' in p.stats && typeof p.stats.ipOuts === 'number' ? p.stats.ipOuts : 0;
            return (
              p.teamId === tid &&
              p.rosterTier === '육성' &&
              !isMilitaryServing(p.militaryStatus) &&
              p.category === '국내' &&
              p.age >= 18 &&
              (p.ability >= 66 ||
                (p.ability >= 63 && p.potential >= 76 && p.age <= 23) ||
                (p.ability >= 64 && (playedGames >= 15 || pitchedOuts >= 30)))
            );
          })
          .sort((a, b) => b.ability * 1.4 + b.potential * 0.4 - (a.ability * 1.4 + a.potential * 0.4))[0];

        if (readyDev) {
          try {
            const res = applyDevelopmentalConversionInPlace(
              next,
              readyDev.id,
              tid,
              getRetiredNumbers(next, tid)
            );
            converted.push({
              teamId: tid,
              playerId: readyDev.id,
              playerName: readyDev.name,
              newNumber: res.newNumber,
            });
            const logText = `[코치 자동 정식계약] ${KBO_TEAMS[tid].shortName} ${headCoachName} 코칭스태프 판단으로 육성선수 ${readyDev.name}(${readyDev.position} · ${readyDev.ability}/${readyDev.potential}) 2군 정식선수 전환 (#${res.newNumber})`;
            next.transactionLogs = [
              {
                id: `tx-coach-dev-conv-${next.season}-${readyDev.id}`,
                date: win.isoDate,
                type: '육성' as const,
                teamId: tid,
                summary: logText,
              },
              ...(next.transactionLogs ?? []),
            ].slice(0, 120);
            next.newsFeed = [
              {
                id: `news-coach-dev-conv-${next.season}-${readyDev.id}`,
                season: next.season,
                date: win.isoDate,
                category: '이적·계약' as const,
                headline: `[코치 자동 정식계약] ${KBO_TEAMS[tid].shortName}, 육성선수 ${readyDev.name} 2군 정식 등록 (#${res.newNumber})`,
                body: `${KBO_TEAMS[tid].name} ${headCoachName} 코칭스태프가 2군 육성 평가 결과 ${readyDev.name}(${readyDev.position} · 능력치 ${readyDev.ability}/잠재력 ${readyDev.potential})을 정식선수로 자동 전환했습니다. (정식 정원 ${officialCount + 1}/${KBO_OFFICIAL_ROSTER_LIMIT}명)`,
                teamId: tid,
              },
              ...(next.newsFeed ?? []),
            ].slice(0, 120);
          } catch {
            // 규격 미충족 시 안전 건너뜀
          }
        }
      }
    }

    // 3. 코칭스태프 판단으로 성장 정체 육성선수 자동 방출 (위약금 없음)
    if (allowReleaseWindow) {
      const stagnantDev = Object.values(next.players)
        .filter(
          (p) =>
            p.teamId === tid &&
            p.rosterTier === '육성' &&
            !isMilitaryServing(p.militaryStatus) &&
            ((p.age >= 26 && p.ability <= 60 && p.potential <= 65) ||
              (p.age >= 28 && p.ability <= 62) ||
              (p.age >= 24 && p.ability <= 55 && p.potential <= 62))
        )
        .sort((a, b) => a.ability + a.potential * 0.5 - (b.ability + b.potential * 0.5))[0];

      if (stagnantDev) {
        stagnantDev.rosterTier = 'FA';
        stagnantDev.formerTeamId = tid;
        stagnantDev.gameDayActive = false;
        stagnantDev.uniformNumber = undefined;
        stagnantDev.contract = {
          ...stagnantDev.contract,
          status: '만료',
          annualSalary: 0,
          yearsRemaining: 0,
          note: `${next.season} 코칭스태프 판단 육성선수 자동 방출(위약금 없음)`,
        };
        released.push({
          teamId: tid,
          playerId: stagnantDev.id,
          playerName: stagnantDev.name,
        });
        next.releasedPlayersTracker = [
          {
            id: `rel-coach-dev-${next.season}-${stagnantDev.id}`,
            playerId: stagnantDev.id,
            permanentId: stagnantDev.permanentId,
            playerName: stagnantDev.name,
            position: stagnantDev.position,
            age: stagnantDev.age,
            ability: stagnantDev.ability,
            releasedFromTeamId: tid,
            releasedSeason: next.season,
            releasedDate: win.isoDate,
            status: '자유계약(무적)' as const,
            currentTeamLabel: '무소속 (FA)',
            statusUpdatedDate: win.isoDate,
            note: `코칭스태프 육성 평가 결과 자동 방출 (${stagnantDev.ability}/${stagnantDev.potential})`,
          },
          ...(next.releasedPlayersTracker ?? []),
        ].slice(0, 160);
        next.transactionLogs = [
          {
            id: `tx-coach-dev-rel-${next.season}-${stagnantDev.id}`,
            date: win.isoDate,
            type: '육성' as const,
            teamId: tid,
            summary: `[코치 자동 방출] ${KBO_TEAMS[tid].shortName} ${headCoachName} 코칭스태프 판단으로 육성선수 ${stagnantDev.name}(${stagnantDev.position} · ${stagnantDev.age}세) 위약금 없이 자동 방출`,
          },
          ...(next.transactionLogs ?? []),
        ].slice(0, 120);
        next.newsFeed = [
          {
            id: `news-coach-dev-rel-${next.season}-${stagnantDev.id}`,
            season: next.season,
            date: win.isoDate,
            category: '이적·계약' as const,
            headline: `[코치 자동 방출] ${KBO_TEAMS[tid].shortName}, 육성선수 ${stagnantDev.name} 웨이버/자유 방출`,
            body: `${KBO_TEAMS[tid].name} ${headCoachName} 코칭스태프가 육성 평가 결과 성장 정체로 판단한 ${stagnantDev.name}(${stagnantDev.position} · ${stagnantDev.age}세 · ${stagnantDev.ability}/${stagnantDev.potential})을 위약금 없이 자동 방출했습니다.`,
            teamId: tid,
          },
          ...(next.newsFeed ?? []),
        ].slice(0, 120);
      }
    }
  }

  return { converted, released };
}

/**
 * 전체 10개 구단(AI 구단 + 유저 구단)에 동일한 코칭스태프 육성선수 자동 관리 규칙을 적용합니다.
 */
export function processAiClubsDevelopmentalRules(
  next: CareerSave,
  getRetiredNumbers: (career: CareerSave, teamId: TeamId) => number[]
): void {
  processCoachDevelopmentalDecisionsInPlace(next, getRetiredNumbers, true);
}
