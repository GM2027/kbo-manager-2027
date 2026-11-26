import { getRookieDraftScheduleInfo } from './calendarEngine';
import { isMilitaryServing } from './militaryEngine';
import { getTeamSponsorChoices } from '../data/financesData';
import { KBO_TEAMS } from '../data/kboTeams';
import { CareerSave, Player, TrainingFocus, VirtualForeignPoolItem } from '../types/kbo';
import {
  generateAiDomesticContract,
  getForeignSlotCounts,
  usdToKrwBillion,
} from './transactions';

export interface GmRecommendationItem {
  id: string;
  priority: '긴급' | '추천' | '전략';
  category: '스폰서' | '2군·엔트리' | '계약·외국인' | '드래프트' | '경기·시즌';
  title: string;
  description: string;
  targetTab: 'home' | 'roster' | 'standings' | 'reports' | 'leaders' | 'transactions' | 'draft' | 'finances';
  ctaLabel: string;
}

export interface RosterMoveRecommendation {
  player: Player;
  action: '콜업' | '강등';
  reason: string;
}

/**
 * 단장 전략 브리핑: 현재 구단 상황(스폰서, 부상, 2군 콜업, 계약, 외국인 슬롯, 드래프트)을 분석해
 * 가장 효과적인 선택지 TOP 3를 추천합니다.
 */
export function getClubGmRecommendations(career: CareerSave): GmRecommendationItem[] {
  const recs: GmRecommendationItem[] = [];
  const teamId = career.playerTeamId;
  const myPlayers = Object.values(career.players).filter((p) => p.teamId === teamId);
  const firstTeam = myPlayers.filter((p) => p.rosterTier === '1군');
  const futuresTeam = myPlayers.filter(
    (p) => p.rosterTier === '2군' && !p.injury && !isMilitaryServing(p.militaryStatus)
  );

  // 1) Sponsor check
  if (!career.finances.sponsor || career.finances.sponsor.status === '만료') {
    const recSponsor = getTeamSponsorChoices(teamId).find((s) => s.recommended) ?? getTeamSponsorChoices(teamId)[0];
    recs.push({
      id: 'rec-sponsor',
      priority: '긴급',
      category: '스폰서',
      title: `추천 스폰서 체결: ${recSponsor.name} (+${recSponsor.signingBonusBillion}억)`,
      description: `${KBO_TEAMS[teamId].shortName} 구단 맞춤 3대 스폰서 중 '${recSponsor.strategyLabel}' 전략이 가장 효율적입니다. (${recSponsor.fitReason})`,
      targetTab: 'finances',
      ctaLabel: '스폰서 계약 이동',
    });
  }

  // 2) Injured 1군 -> 2군 callup suggestion
  const injuredFirst = firstTeam.filter((p) => Boolean(p.injury));
  if (injuredFirst.length > 0 && futuresTeam.length > 0) {
    const worst = injuredFirst[0];
    const bestSub = futuresTeam
      .filter((p) => p.role === worst.role)
      .sort((a, b) => b.ability - a.ability)[0];
    if (bestSub) {
      recs.push({
        id: 'rec-injury-callup',
        priority: '긴급',
        category: '2군·엔트리',
        title: `부상 공백 보강: ${worst.name} 강등 → 2군 ${bestSub.name} 콜업`,
        description: `${worst.name}(${worst.injury?.description}, ${worst.injury?.daysRemaining}일 결장) 자리를 2군 ${bestSub.name}(${bestSub.position} · ${bestSub.ability}/${bestSub.potential})으로 메우세요.`,
        targetTab: 'roster',
        ctaLabel: '엔트리 조정 이동',
      });
    }
  } else if (firstTeam.length < 28 && futuresTeam.length > 0) {
    const topFuture = [...futuresTeam].sort((a, b) => b.ability * 0.7 + b.potential * 0.3 - (a.ability * 0.7 + a.potential * 0.3))[0];
    if (topFuture) {
      recs.push({
        id: 'rec-depth-callup',
        priority: '추천',
        category: '2군·엔트리',
        title: `1군 여력 확보: 2군 유망주 ${topFuture.name} 콜업 검토`,
        description: `현재 1군 엔트리가 ${firstTeam.length}/30명입니다. 2군 핵심 자원 ${topFuture.name}(${topFuture.age}세 · ${topFuture.ability}/${topFuture.potential})을 콜업해 출전 경험을 부여하세요.`,
        targetTab: 'roster',
        ctaLabel: '2군 콜업 이동',
      });
    }
  }

  // 3) Foreigner slot vacancy
  const foreignSlots = getForeignSlotCounts(career, teamId);
  if (foreignSlots.regularCount < 3 || foreignSlots.asianCount < 1) {
    const missingType = foreignSlots.regularCount < 3 ? '일반 외국인' : '아시아쿼터';
    recs.push({
      id: 'rec-foreign-slot',
      priority: '추천',
      category: '계약·외국인',
      title: `${missingType} 빈 슬롯 보강 추천 (${foreignSlots.regularCount}/3 · 아시아 ${foreignSlots.asianCount}/1)`,
      description: `가상 해외 스카우트 마켓에서 보유 자금 한도 내 즉시전력감 ${missingType} 선수를 영입해 전력을 끌어올리세요.`,
      targetTab: 'transactions',
      ctaLabel: '외국인 영입 이동',
    });
  }

  // 4) Pending domestic contracts
  const expiredDomestic = myPlayers.filter(
    (p) =>
      p.category === '국내' &&
      p.rosterTier === '1군' &&
      (p.contract.status === '만료' || p.contract.status === '미확인')
  );
  if (expiredDomestic.length > 0) {
    const topPending = [...expiredDomestic].sort((a, b) => b.ability - a.ability)[0];
    const quote = generateAiDomesticContract(topPending);
    recs.push({
      id: 'rec-domestic-sign',
      priority: '추천',
      category: '계약·외국인',
      title: `자동 계약 체결 추천: ${topPending.name} (${quote.years}년 ${quote.totalBillion}억)`,
      description: `1군 미확정·만료 국내 선수 ${expiredDomestic.length}명 중 핵심 전력 ${topPending.name} 선수의 원클릭 계약 체결을 권장합니다.`,
      targetTab: 'transactions',
      ctaLabel: '국내 계약 이동',
    });
  }

  // 5) Draft open (공식 드래프트 날짜 도달 시에만 진행 가능 추천 노출)
  const draftSchedule = getRookieDraftScheduleInfo(career);
  if (draftSchedule.isOpen && !career.draftState.completed && career.draftState.currentRound <= 4) {
    recs.push({
      id: 'rec-draft',
      priority: '긴급',
      category: '드래프트',
      title: `${career.draftState.season} KBO 신인 드래프트 개막 · ${career.draftState.currentRound}라운드 진행`,
      description: `공식 드래프트 개최일(${draftSchedule.formattedDate})이 도래했습니다. 구단 차례에서 스카우트 추천 유망주를 지명하세요.`,
      targetTab: 'draft',
      ctaLabel: '드래프트 보드 이동',
    });
  }

  // 6) Training / Facility fallback
  if (recs.length < 3) {
    const inv = career.finances.investments;
    if (career.finances.cashBalanceBillion !== null && career.finances.cashBalanceBillion >= 40 && (inv?.academyLevel ?? 1) < 3) {
      recs.push({
        id: 'rec-academy',
        priority: '전략',
        category: '스폰서',
        title: `육성 아카데미 투자 추천 (현재 Lv.${inv?.academyLevel ?? 1})`,
        description: `보유 자금 ${career.finances.cashBalanceBillion.toFixed(1)}억 원으로 아카데미를 증설하면 10경기 성장 평가 시 23세 이하 유망주 성장폭이 상승합니다.`,
        targetTab: 'finances',
        ctaLabel: '시설 투자 이동',
      });
    } else {
      recs.push({
        id: 'rec-series-play',
        priority: '전략',
        category: '경기·시즌',
        title:
          career.phase === 'POSTSEASON'
            ? '포스트시즌 다음 1경기 시뮬레이션 진행'
            : career.phase === 'OFFSEASON'
            ? '시상식 확정 후 차기 시즌 개막 준비'
            : `정규시즌 다음 3연전 시뮬레이션 (${career.gamesPlayed}/${career.totalRegularGames}G)`,
        description: '현재 로스터·선발 로테이션 점검을 마쳤다면 경기를 진행하고 박스스코어와 리그 순위를 확인하세요.',
        targetTab: career.phase === 'OFFSEASON' ? 'draft' : 'standings',
        ctaLabel: career.phase === 'OFFSEASON' ? '시상식 이동' : '일정·순위 이동',
      });
    }
  }

  return recs.slice(0, 3);
}

/**
 * 1군↔2군 콜업·강등 추천 목록 반환
 */
export function getRecommendedRosterMoves(career: CareerSave): RosterMoveRecommendation[] {
  const teamId = career.playerTeamId;
  const teamPlayers = Object.values(career.players).filter((p) => p.teamId === teamId);
  const moves: RosterMoveRecommendation[] = [];

  // Recommend demoting injured or badly slumping low-ability 1군 players
  const firstTeam = teamPlayers.filter((p) => p.rosterTier === '1군');
  const injuredFirst = firstTeam
    .filter((p) => Boolean(p.injury))
    .sort((a, b) => (b.injury?.daysRemaining ?? 0) - (a.injury?.daysRemaining ?? 0));

  for (const p of injuredFirst.slice(0, 2)) {
    moves.push({
      player: p,
      action: '강등',
      reason: `부상 결장(${p.injury?.description}, ${p.injury?.daysRemaining}일) → 2군 재활 및 엔트리 확보`,
    });
  }

  if (moves.length < 2) {
    const weakFirst = firstTeam
      .filter((p) => !p.injury && p.category === '국내' && (p.ability <= 68 || p.form <= -3))
      .sort((a, b) => a.ability + a.form * 2 - (b.ability + b.form * 2))[0];
    if (weakFirst) {
      moves.push({
        player: weakFirst,
        action: '강등',
        reason:
          weakFirst.form <= -3
            ? `최근 컨디션 저하(폼 ${weakFirst.form}) → 2군 재정비 추천`
            : `1군 하위 전력(능력치 ${weakFirst.ability}) → 2군 육성 전환 검토`,
      });
    }
  }

  // Recommend calling up top healthy 2군 prospects (excluding Sangmu military service players)
  const futuresHealthy = teamPlayers
    .filter(
      (p) =>
        (p.rosterTier === '2군' || p.rosterTier === '대기') &&
        !p.injury &&
        !isMilitaryServing(p.militaryStatus)
    )
    .sort((a, b) => b.ability * 0.7 + b.potential * 0.3 - (a.ability * 0.7 + a.potential * 0.3));

  for (const p of futuresHealthy.slice(0, 2)) {
    moves.push({
      player: p,
      action: '콜업',
      reason:
        p.potential >= 82
          ? `핵심 유망주(${p.age}세 · ${p.ability}/${p.potential}) 1군 실전 콜업 추천`
          : `2군 즉시전력(${p.position} · 능력치 ${p.ability}) 1군 백업 보강`,
    });
  }

  return moves.slice(0, 4);
}

/**
 * 보유 자금 내에서 우선 체결을 추천하는 국내 미계약 선수 ID 목록
 */
export function getRecommendedDomesticContractIds(career: CareerSave): string[] {
  const budget = career.finances.cashBalanceBillion;
  const candidates = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === career.playerTeamId &&
        p.category === '국내' &&
        p.rosterTier === '1군' &&
        (p.contract.status === '미확인' || p.contract.status === '만료')
    )
    .sort((a, b) => b.ability - a.ability);

  const ids: string[] = [];
  for (const p of candidates) {
    const q = generateAiDomesticContract(p);
    if (budget === null || q.totalBillion <= budget) {
      ids.push(p.id);
    }
    if (ids.length >= 3) break;
  }
  return ids;
}

/**
 * 현재 외국인 슬롯·전력 약점·보유 자금을 고려해 가장 적합한 외국인/아시아쿼터 후보 1명 추천
 */
export function getRecommendedForeignCandidateId(
  career: CareerSave,
  market: VirtualForeignPoolItem[]
): { candidateId: string; reason: string } | null {
  if (market.length === 0) return null;
  const slots = getForeignSlotCounts(career, career.playerTeamId);
  const budget = career.finances.cashBalanceBillion;

  const affordable = market.filter((m) =>
    budget === null ? true : usdToKrwBillion(m.suggestedTotalUsd) <= budget
  );
  const pool = affordable.length > 0 ? affordable : market;

  // Prefer Asian quarter if Asian slot is open and regular slots are full
  const preferAsian = slots.asianCount === 0 && slots.regularCount >= 3;
  const filtered = preferAsian
    ? pool.filter((m) => m.category === '아시아쿼터')
    : pool;
  const finalPool = filtered.length > 0 ? filtered : pool;

  // Check whether pitching or hitting needs more help
  const myFirst = Object.values(career.players).filter(
    (p) => p.teamId === career.playerTeamId && p.rosterTier === '1군'
  );
  const pitAvg =
    myFirst.filter((p) => p.role === '투수').reduce((s, p) => s + p.ability, 0) /
    Math.max(1, myFirst.filter((p) => p.role === '투수').length);
  const batAvg =
    myFirst.filter((p) => p.role === '타자').reduce((s, p) => s + p.ability, 0) /
    Math.max(1, myFirst.filter((p) => p.role === '타자').length);
  const needRole = pitAvg <= batAvg ? '투수' : '타자';

  const ranked = [...finalPool].sort((a, b) => {
    const scoreA = a.ability * 1.4 + a.potential * 0.35 + (a.role === needRole ? 4 : 0) - usdToKrwBillion(a.suggestedTotalUsd) * 0.25;
    const scoreB = b.ability * 1.4 + b.potential * 0.35 + (b.role === needRole ? 4 : 0) - usdToKrwBillion(b.suggestedTotalUsd) * 0.25;
    return scoreB - scoreA;
  });

  const best = ranked[0];
  if (!best) return null;

  return {
    candidateId: best.id,
    reason: preferAsian
      ? `아시아쿼터 공석 보강 최적 자원 (${best.position} · 능력치 ${best.ability}/${best.potential})`
      : `${needRole}진 전력 보강 최우선 후보 (${best.position} · 가성비 환산 ${usdToKrwBillion(best.suggestedTotalUsd).toFixed(1)}억)`,
  };
}

export interface TrainingRecommendationItem {
  playerId: string;
  playerName: string;
  position: Player['position'];
  currentFocus: TrainingFocus;
  recommendedFocus: Exclude<TrainingFocus, null>;
  reason: string;
}

/**
 * 선수 역할·포지션·연령·잠재력·피로도를 종합해 최적의 집중 훈련 항목을 추천합니다.
 */
export function getRecommendedTrainingForPlayer(player: Player): {
  focus: Exclude<TrainingFocus, null>;
  reason: string;
} {
  if (player.fatigue >= 55 || player.age >= 36) {
    return {
      focus: '체력',
      reason:
        player.fatigue >= 55
          ? `누적 피로(${player.fatigue}%) 관리 및 부상 예방`
          : `베테랑(${player.age}세) 내구성·컨디션 유지`,
    };
  }

  if (player.role === '투수') {
    const gap = player.potential - player.ability;
    if (player.pitchRole === '마무리' || player.pitchRole === '필승조') {
      return {
        focus: '구위',
        reason: '불펜 핵심 탈삼진·압도적 구위 강화',
      };
    }
    if (player.age <= 25 && gap >= 5) {
      return {
        focus: '구위',
        reason: `유망주(${player.age}세 · 잠재 ${player.potential}) 구속·구위 잠재력 개방`,
      };
    }
    return {
      focus: '제구',
      reason: '이닝 소화력·볼넷 억제(WHIP 안정화)',
    };
  }

  if (player.position === 'C' || player.position === 'SS' || player.position === '2B') {
    if (player.ability < 80) {
      return {
        focus: '수비',
        reason: `센터라인(${player.position}) 수비 안정성 및 실책 억제`,
      };
    }
  }
  if (player.position === 'CF' && player.age <= 27) {
    return {
      focus: '주루',
      reason: '외야 기동력·도루 및 수비 범위 극대화',
    };
  }
  return {
    focus: '타격',
    reason:
      player.potential - player.ability >= 5
        ? `타격 잠재력(${player.potential}) 조기 개화`
        : '타율·장타력(OPS) 생산성 극대화',
  };
}

/**
 * 구단 전체 활동 선수(1군·2군·육성·대기)의 추천 훈련 목록을 반환합니다.
 */
export function getTeamTrainingRecommendations(career: CareerSave): TrainingRecommendationItem[] {
  return Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === career.playerTeamId &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적' &&
        p.rosterTier !== '제외후보'
    )
    .sort((a, b) => b.ability - a.ability)
    .map((p) => {
      const rec = getRecommendedTrainingForPlayer(p);
      return {
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        currentFocus: p.trainingFocus,
        recommendedFocus: rec.focus,
        reason: rec.reason,
      };
    });
}

export interface ReleaseRecommendationItem {
  player: Player;
  priority: '방출 권장' | '정리 검토';
  score: number;
  reason: string;
  salaryReliefText: string;
}

/**
 * 시즌 시작 전 / 시즌 종료 후(오프시즌) 구단 방출(웨이버 정리) 추천 선수 목록 산출
 */
export function getRecommendedReleaseCandidates(
  career: CareerSave,
  limit = 6
): ReleaseRecommendationItem[] {
  const myTeam = career.playerTeamId;
  const activePool = Object.values(career.players).filter(
    (p) =>
      p.teamId === myTeam &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적' &&
      p.rosterTier !== '제외후보' &&
      !isMilitaryServing(p.militaryStatus)
  );

  // Count positional depth so we don't recommend cutting a scarce position unless very weak
  const posCounts = new Map<string, number>();
  for (const p of activePool) {
    posCounts.set(p.position, (posCounts.get(p.position) ?? 0) + 1);
  }

  const scored: ReleaseRecommendationItem[] = [];

  for (const p of activePool) {
    // Protect young high-potential prospects & elite franchise stars
    if (p.ability >= 80 || (p.age <= 23 && p.potential >= 79)) continue;

    let score = 0;
    const reasons: string[] = [];

    if (p.age >= 35 && p.ability <= 73) {
      score += 34 + (p.age - 34) * 4;
      reasons.push(`베테랑 노쇠화(${p.age}세 · OVR ${p.ability})`);
    } else if (p.age >= 31 && p.ability <= 69) {
      score += 24;
      reasons.push(`30대 중반 전력 하락(${p.age}세 · OVR ${p.ability})`);
    }

    if (p.potential <= 70 && p.ability <= 66) {
      score += 26;
      reasons.push(`성장 한계(OVR ${p.ability}/잠재 ${p.potential})`);
    } else if (p.rosterTier === '2군' && p.age >= 27 && p.ability <= 68) {
      score += 18;
      reasons.push(`2군 체류 중고참(${p.age}세)`);
    }

    // Check season performance if games played
    if (p.role === '타자') {
      const b = p.stats as { PA?: number | null; AB?: number | null; H?: number | null; TB?: number | null; BB?: number | null; HBP?: number | null; SF?: number | null };
      const pa = b.PA ?? 0;
      if (pa >= 60 && b.AB && b.AB > 0) {
        const obp = ((b.H ?? 0) + (b.BB ?? 0) + (b.HBP ?? 0)) / pa;
        const slg = (b.TB ?? 0) / b.AB;
        const ops = obp + slg;
        if (ops < 0.64) {
          score += 22;
          reasons.push(`시즌 타격 부진(OPS .${Math.round(ops * 1000)})`);
        }
      }
    } else {
      const ps = p.stats as { outs?: number | null; ER?: number | null };
      const outs = ps.outs ?? 0;
      if (outs >= 45 && ps.ER !== null && ps.ER !== undefined) {
        const era = (ps.ER * 27) / outs;
        if (era > 5.4) {
          score += 22;
          reasons.push(`시즌 투구 부진(ERA ${era.toFixed(2)})`);
        }
      }
    }

    // High salary vs low ability (domestic) or sub-75 foreign player
    if (p.category === '국내' && p.contract.annualSalary >= 3.5 && p.ability <= 73) {
      score += 18;
      reasons.push(`고연봉 대비 저효율(연 ${p.contract.annualSalary}억)`);
    } else if ((p.category === '외국인' || p.category === '아시아쿼터') && p.ability <= 72) {
      score += 24;
      reasons.push(`외국인 기대치 미달(OVR ${p.ability})`);
    }

    if ((posCounts.get(p.position) ?? 0) >= 5 && p.rosterTier !== '1군') {
      score += 8;
      reasons.push(`${p.position} 포지션 중복`);
    }

    if (p.form <= -3) {
      score += 7;
      reasons.push(`장기 슬럼프(폼 ${p.form})`);
    }

    if (score >= 22) {
      const salaryReliefText =
        p.contract.currency === 'USD'
          ? `$${p.contract.annualSalary.toLocaleString()} 절감`
          : p.contract.annualSalary > 0
          ? `연 ${p.contract.annualSalary.toFixed(1)}억 절감`
          : '로스터 슬롯 확보';

      scored.push({
        player: p,
        priority: score >= 42 ? '방출 권장' : '정리 검토',
        score,
        reason: reasons.slice(0, 2).join(' · ') || '전력 재편 정리 대상',
        salaryReliefText,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}


