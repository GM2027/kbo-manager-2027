import { CareerSave } from '../types/kbo';
import { addDaysIso } from './schedule';
import { getCurrentCareerDate } from './salaryCapEngine';
import { advanceFaCompetitionRound, syncFaCompetitionMarketInPlace } from './faCompetitionEngine';

export interface AnnualCalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  endDate?: string;
  month: number;
  title: string;
  description: string;
  ruleTag: '공식 KBO 규정' | '공식 KBO 2027 개정' | '공식 KBO 일정' | '게임 운영 규칙';
  category: 'contract' | 'camp' | 'season' | 'deadline' | 'draft' | 'postseason' | 'fa' | 'awards';
  isMajorDeadline?: boolean;
}

/**
 * 2027 개정 KBO 규정 기준 선수 참가활동기간 판정 (1월 25일 ~ 11월 23일)
 */
export function isWithinKboActivePeriod(isoDate: string): boolean {
  const mmdd = isoDate.slice(5, 10);
  return mmdd >= '01-25' && mmdd <= '11-23';
}

export function getActivePeriodInfo(isoDate: string, season: number): {
  isActive: boolean;
  label: string;
  ruleNote: string;
} {
  const active = isWithinKboActivePeriod(isoDate);
  if (season >= 2027) {
    return {
      isActive: active,
      label: active ? '선수 참가활동기간 (1/25~11/23)' : '비활동기간 (11/24~1/24)',
      ruleNote: active
        ? '공식 KBO 2027 개정 규정: 구단 공식 훈련·캠프·경기 활동 가능 기간'
        : '공식 KBO 2027 개정 규정: 비활동기간 중 구단 공식 합동훈련 및 캠프 소집 제한',
    };
  }
  return {
    isActive: isoDate.slice(5, 10) >= '02-01' && isoDate.slice(5, 10) <= '11-30',
    label: '2026 KBO 활동기간 (2/1~11/30)',
    ruleNote: '2026 기존 KBO 참가활동기간 규정 적용',
  };
}

/**
 * 실제 KBO 운영 일정 및 2027 개정 규정에 맞춘 연간 캘린더 이벤트 생성
 */
export function getAnnualKboCalendarEvents(career: CareerSave): AnnualCalendarEvent[] {
  const y = career.season;
  const openingDate = career.schedule[0]?.dates?.[0] ?? `${y}-03-27`;
  const allStarSeries = career.schedule.find((s) => s.isAllStarBreakBefore);
  const allStarDate = allStarSeries?.dates?.[0]
    ? addDaysIso(allStarSeries.dates[0], -3)
    : `${y}-07-17`;
  const draftTargetYear = career.draftClassYear ?? (y >= 2027 ? y + 1 : y);

  return [
    {
      id: `${y}-new-year`,
      date: `${y}-01-01`,
      month: 1,
      title: `${y} 시즌 개시 · 연봉 협상 및 선수단 정리`,
      description: '새 시즌 내부 캘린더 전환. 최저연봉(2027~ 3,300만 원) 적용, 연봉 협상 및 보류선수 정리.',
      ruleTag: y >= 2027 ? '공식 KBO 2027 개정' : '공식 KBO 규정',
      category: 'contract',
    },
    {
      id: `${y}-active-start`,
      date: `${y}-01-25`,
      month: 1,
      title: '선수 참가활동기간 개시',
      description: '2027 개정 KBO 규정 적용: 1월 25일부터 11월 23일까지 공식 참가활동기간 시작.',
      ruleTag: '공식 KBO 2027 개정',
      category: 'camp',
      isMajorDeadline: true,
    },
    {
      id: `${y}-spring-camp`,
      date: `${y}-02-01`,
      endDate: `${y}-03-07`,
      month: 2,
      title: '구단 스프링캠프 (1~3월)',
      description: '1차 체력·전술 캠프 및 2차 실전 연습경기 진행. 선수 성장 및 외국인 적응도 초기 점검.',
      ruleTag: '공식 KBO 일정',
      category: 'camp',
    },
    {
      id: `${y}-exhibition`,
      date: `${y}-03-08`,
      endDate: `${y}-03-22`,
      month: 3,
      title: 'KBO 시범경기',
      description: '개막 엔트리 최종 점검 및 신인·외국인 실전 테스트 기간.',
      ruleTag: '공식 KBO 일정',
      category: 'camp',
    },
    {
      id: `${y}-opening-day`,
      date: openingDate,
      month: Number(openingDate.slice(5, 7)),
      title: `${y} KBO 정규시즌 개막 (${career.scheduleSource === 'OFFICIAL' ? '공식 일정' : '예상 일정'})`,
      description: '팀당 144경기 · 리그 전체 720경기 · 상대 구단별 16경기(홈8/원정8) 대장정 개막.',
      ruleTag: '공식 KBO 일정',
      category: 'season',
      isMajorDeadline: true,
    },
    {
      id: `${y}-dev-convert`,
      date: `${y}-05-01`,
      month: 5,
      title: '육성선수 정식선수 등록 개시',
      description: '5월 1일부터 육성선수의 1군 등록(정식선수 전환) 가능.',
      ruleTag: '공식 KBO 규정',
      category: 'deadline',
    },
    {
      id: `${y}-childrens-day`,
      date: `${y}-05-05`,
      month: 5,
      title: '어린이날 특별 시리즈',
      description: 'KBO 전통의 어린이날 빅매치 시리즈(관중 및 라이벌 열기 상승).',
      ruleTag: '공식 KBO 일정',
      category: 'season',
    },
    {
      id: `${y}-allstar`,
      date: allStarDate,
      month: 7,
      title: 'KBO 올스타전 및 휴식기',
      description: '전반기 종료 · 4~5일간 올스타 브레이크(선수단 피로 회복 및 불펜 재정비).',
      ruleTag: '공식 KBO 일정',
      category: 'season',
    },
    {
      id: `${y}-trade-deadline`,
      date: `${y}-07-31`,
      month: 7,
      title: '트레이드 마감일 (7월 31일)',
      description: '기존 KBO 규정 기준 정규시즌 트레이드 마감. 8월 1일부터 한국시리즈 종료까지 트레이드 금지.',
      ruleTag: '공식 KBO 규정',
      category: 'deadline',
      isMajorDeadline: true,
    },
    {
      id: `${y}-ps-roster-cutoff`,
      date: `${y}-08-15`,
      month: 8,
      title: '외국인·추가등록 포스트시즌 출전 마감',
      description: '8월 15일 이후 교체 영입된 외국인 선수 및 8월 1일 이후 웨이버 이적 선수는 당해 포스트시즌 출전 제한.',
      ruleTag: '공식 KBO 규정',
      category: 'deadline',
      isMajorDeadline: true,
    },
    {
      id: `${y}-rookie-draft`,
      date: `${y}-09-15`,
      month: 9,
      title: `${draftTargetYear} KBO 신인 드래프트`,
      description: `${y}년 9월 실시 공식 신인 드래프트 (11라운드 전면 드래프트 · ${y} 신인 중복 지명 방지).`,
      ruleTag: '공식 KBO 일정',
      category: 'draft',
      isMajorDeadline: true,
    },
    {
      id: `${y}-postseason`,
      date: `${y}-10-05`,
      endDate: `${y}-11-02`,
      month: 10,
      title: 'KBO 포스트시즌 (10~11월)',
      description: '와일드카드 · 준플레이오프 · 플레이오프 · 한국시리즈 4단계 스텝래더.',
      ruleTag: '공식 KBO 일정',
      category: 'postseason',
    },
    {
      id: `${y}-fa-open`,
      date: `${y}-11-05`,
      month: 11,
      title: 'FA 시장 개장 (자동 진행 연동)',
      description: '게임 날짜 진행에 따라 AI 9개 구단이 자동 입찰·경쟁·재계약·보상 처리 (사용자 구단은 최종 승인 필수).',
      ruleTag: '공식 KBO 규정',
      category: 'fa',
      isMajorDeadline: true,
    },
    {
      id: `${y}-active-end`,
      date: `${y}-11-23`,
      month: 11,
      title: '선수 참가활동기간 종료',
      description: '2027 개정 KBO 규정 적용: 11월 23일 활동기간 종료 후 비활동기간 돌입.',
      ruleTag: '공식 KBO 2027 개정',
      category: 'deadline',
      isMajorDeadline: true,
    },
    {
      id: `${y}-awards`,
      date: `${y}-11-28`,
      month: 11,
      title: 'KBO 공식 시상식 및 스토브리그 (11~12월)',
      description: 'MVP · 신인왕 · 골든글러브 시상, 프랜차이즈 지수 재평가, 외국인 재계약 및 보류선수 명단 확정.',
      ruleTag: '공식 KBO 일정',
      category: 'awards',
    },
    {
      id: `${y}-year-end`,
      date: `${y}-12-31`,
      month: 12,
      title: `${y + 1}년 1월 1일 시즌 전환 준비`,
      description: '결산 완료 후 단장 승인 시 익년 1월 1일 새 시즌으로 전환 (자동 전환 금지).',
      ruleTag: '게임 운영 규칙',
      category: 'contract',
    },
  ];
}

/**
 * 사용자 명시적 승인(버튼 클릭)으로 게임 내부 날짜를 지정 일수만큼 진행한다.
 * - 사용자 승인 없이 자동 실행되지 않음
 * - 날짜 진행 중 FA 개장 기간(11월~1월 또는 FA 선수 존재 시)이면 별도 FA 버튼 없이도 AI 9개 구단 FA 경쟁 자동 진행
 * - 부상 회복 일수 차감 및 주요 KBO 일정 도달 알림 생성
 */
export function advanceGameDateByDays(
  career: CareerSave,
  days: number
): { nextCareer: CareerSave; eventsTriggered: string[] } {
  const safeDays = Math.max(1, Math.min(14, Math.round(days)));
  let next: CareerSave = JSON.parse(JSON.stringify(career));
  const startInfo = getCurrentCareerDate(next);
  const startIso = startInfo.isoDate;
  const endIso = addDaysIso(startIso, safeDays);
  const eventsTriggered: string[] = [];

  next.currentDate = endIso;

  // 1) 부상 선수 재활 일수 진행
  for (const p of Object.values(next.players)) {
    if (p.injury && p.injury.daysRemaining > 0) {
      p.injury.daysRemaining = Math.max(0, p.injury.daysRemaining - safeDays);
      if (p.injury.daysRemaining === 0) {
        p.injury = null;
        if (p.teamId === next.playerTeamId) {
          eventsTriggered.push(`${p.name} 선수 부상 회복 완료`);
        }
      }
    }
  }

  // 2) 주요 KBO 일정/규정 날짜 통과 알림
  const milestones = getAnnualKboCalendarEvents(next);
  for (const ev of milestones) {
    if (ev.date > startIso && ev.date <= endIso) {
      eventsTriggered.push(`[${ev.date}] ${ev.title}`);
      next.newsFeed = next.newsFeed ?? [];
      next.newsFeed.unshift({
        id: `news-cal-${ev.id}-${Date.now()}`,
        season: next.season,
        date: ev.date,
        category: '규정·웨이버',
        headline: `[KBO 공식 캘린더] ${ev.title}`,
        body: `${ev.description} (${ev.ruleTag})`,
        teamId: next.playerTeamId,
        isHighlight: Boolean(ev.isMajorDeadline),
      });
    }
  }

  // 3) FA 시장 자동 진행 (11월~익년 2월 스토브리그/개막 준비 기간 & FA 선수 존재 시, FA 화면 미접속 상태에서도 자동 작동)
  const monthNum = Number(endIso.slice(5, 7));
  const isFaWindow =
    next.phase === 'OFFSEASON' ||
    monthNum === 11 ||
    monthNum === 12 ||
    monthNum === 1 ||
    monthNum === 2;
  const hasFreeAgents = Object.values(next.players).some(
    (p) => p.rosterTier === 'FA' || p.contract.status === 'FA'
  );

  if (isFaWindow && hasFreeAgents && next.lastAutoFaDate !== endIso) {
    // 1~3일 경과당 FA 1라운드 자동 진행 (사용자 구단 계약은 최종 승인 대기 상태 유지)
    const roundsToRun = Math.max(1, Math.min(3, Math.ceil(safeDays / 3)));
    syncFaCompetitionMarketInPlace(next);
    for (let r = 0; r < roundsToRun; r++) {
      const stillActive =
        next.faCompetition &&
        Object.values(next.faCompetition.negotiations).some(
          (n) => n.status === '입찰중'
        );
      if (!stillActive) break;
      const faRes = advanceFaCompetitionRound(next);
      next = faRes.nextCareer;
      next.currentDate = endIso;
      if (faRes.signedSummaries.length > 0) {
        eventsTriggered.push(`FA 자동 계약 체결: ${faRes.signedSummaries.join(', ')}`);
      }
      if (faRes.pendingUserApprovals.length > 0) {
        eventsTriggered.push(`사용자 구단 FA 최종 승인 대기: ${faRes.pendingUserApprovals.join(', ')}`);
      }
    }
    next.lastAutoFaDate = endIso;
  }

  return { nextCareer: next, eventsTriggered };
}
