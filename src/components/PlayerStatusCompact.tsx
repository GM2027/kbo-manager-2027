import React from 'react';
import { getNationalityDisplay } from '../data/playerMetadata';
import { evaluateFranchiseStar } from '../engine/franchiseStarEngine';
import { isPlayerOnNationalTeamDuty } from '../engine/franchiseSystems';
import { isMilitaryServing } from '../engine/militaryEngine';
import {
  getPlayerContractExpiryAlert,
  getPlayerRetirementAlert,
} from '../engine/leagueLifeEngine';
import { CareerSave, Player } from '../types/kbo';
import { CountryFlag } from './CountryFlag';

export type CompactStatusTone = 'danger' | 'warn' | 'info' | 'muted';

export interface CompactStatusTag {
  label: string;
  tone: CompactStatusTone;
  title?: string;
}

/**
 * 프랜차이즈 선수 여부 판정 (레전드 · 핵심 프랜차이즈만 목록에 ★ 표시).
 * 준프랜차이즈는 선수 상세정보에서만 표시합니다.
 */
export function isFranchiseStarPlayer(career: CareerSave, player: Player): boolean {
  const tier = evaluateFranchiseStar(career, player).tier;
  return tier === '레전드' || tier === '핵심 프랜차이즈';
}

/**
 * 선수 목록용 핵심 상태 태그 (선수당 최대 1개, 중요도 순 우선순위 적용).
 *
 * 목록 제외 항목(상세정보 전용): 준프랜차이즈, 원클럽맨, 임시주장, 은퇴 검토,
 * FA 등급, 부상 기간, 재활 경기 수, 국대 복귀 라운드, 정리예정 등.
 */
export function getPrimaryPlayerStatusTag(
  career: CareerSave,
  player: Player
): CompactStatusTag | null {
  // 1. 부상 (최우선)
  if (player.injury) {
    return {
      label: '부상',
      tone: 'danger',
      title: '부상 중 (상세정보에서 기간 확인)',
    };
  }

  // 2. 재활
  if (player.rehabGamesLeft && player.rehabGamesLeft > 0) {
    return {
      label: '재활',
      tone: 'warn',
      title: '재활 진행 중 (상세정보에서 잔여 경기 확인)',
    };
  }

  // 3. 국가대표 소집
  if (isPlayerOnNationalTeamDuty(player, career.gamesPlayed)) {
    return {
      label: '국대',
      tone: 'info',
      title: '국가대표 소집 중 (상세정보에서 복귀 일정 확인)',
    };
  }

  // 4. 상무 복무 (복무 중 / 레거시 상무복무)
  if (isMilitaryServing(player.militaryStatus)) {
    return {
      label: '상무',
      tone: 'info',
      title: player.militaryNote ?? '상무 피닉스 복무 중',
    };
  }

  // 5. FA 상태
  if (player.rosterTier === 'FA' || player.contract.status === 'FA') {
    return {
      label: 'FA',
      tone: 'warn',
      title: 'FA 선수 (상세정보에서 등급 및 보상 규정 확인)',
    };
  }

  // 6. 계약 만료 예정 (FA 자격 만료 / 외국인 계약 만료)
  const expiryAlert = getPlayerContractExpiryAlert(career, player);
  if (
    expiryAlert &&
    (expiryAlert.kind === 'FA 자격 만료' || expiryAlert.kind === '외국인 계약 만료')
  ) {
    return {
      label: '계약 만료',
      tone: 'warn',
      title: '시즌 종료 후 계약 만료 예정 (상세정보 확인)',
    };
  }

  // 7. 은퇴 예정 (은퇴 유력만 표시 — 은퇴 검토는 상세정보 전용)
  const retireAlert = getPlayerRetirementAlert(player);
  if (retireAlert && retireAlert.level === '은퇴 유력') {
    return {
      label: '은퇴 예정',
      tone: 'muted',
      title: '은퇴 예정 (상세정보 확인)',
    };
  }

  // 8. 이적 요청
  if (player.tradeRequested) {
    return {
      label: '이적요청',
      tone: 'danger',
      title: '트레이드 요청 중',
    };
  }

  // 9. 육성 선수
  if (player.rosterTier === '육성') {
    return {
      label: '육성',
      tone: 'muted',
      title: '육성선수',
    };
  }

  return null;
}

const TONE_CLASS: Record<CompactStatusTone, string> = {
  danger: 'text-rose-600 dark:text-rose-400',
  warn: 'text-amber-700 dark:text-amber-400',
  info: 'text-sky-700 dark:text-sky-400',
  muted: 'text-slate-500 dark:text-slate-400',
};

/**
 * 프랜차이즈 선수 작은 별 아이콘 (★)
 */
export const FranchiseStarIcon: React.FC<{ active: boolean; title?: string }> = ({
  active,
  title = '프랜차이즈 선수',
}) => {
  if (!active) return null;
  return (
    <span
      className="text-amber-500 dark:text-amber-400 text-[11px] leading-none shrink-0 select-none"
      title={title}
      aria-label="프랜차이즈 선수"
    >
      ★
    </span>
  );
};

/**
 * 목록용 단일 상태 텍스트 태그 (배경·테두리 없는 텍스트 중심 컴팩트 디자인)
 */
export const PlayerCompactTag: React.FC<{
  career: CareerSave;
  player: Player;
  /** 필요 시 목록 문맥에서 특정 상태만 숨길 때 사용 (예: 이미 FA 시장 목록일 때 'FA' 중복 생략) */
  suppressLabels?: string[];
}> = ({ career, player, suppressLabels }) => {
  const tag = getPrimaryPlayerStatusTag(career, player);
  if (!tag) return null;
  if (suppressLabels && suppressLabels.includes(tag.label)) return null;
  return (
    <span
      title={tag.title}
      className={`text-[10px] font-semibold whitespace-nowrap shrink-0 leading-none ${TONE_CLASS[tag.tone]}`}
    >
      · {tag.label}
    </span>
  );
};

/**
 * 외국인 / 아시아쿼터 국기 아이콘 (컴팩트 목록용 · 텍스트 태그 없이 선명한 국기만 표시)
 */
export const PlayerForeignFlag: React.FC<{ player: Player }> = ({ player }) => {
  if (player.category === '국내' || !player.nationality) return null;
  const label = getNationalityDisplay(player.nationality).label;
  return (
    <span
      className="inline-flex items-center shrink-0"
      title={`${player.category} · ${label}`}
    >
      <CountryFlag nationality={player.nationality} size="xs" />
    </span>
  );
};
