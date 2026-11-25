import { MilitaryStatus, Player } from '../types/kbo';

/**
 * 병역 8대 공식 상태 판정 및 이벤트 제어 엔진.
 *
 * 상태 구분:
 * - '군필'           : 병역 이행 완료 (입대 이벤트 영구 차단)
 * - '미필'           : 확인된 병역 미필 국내 선수 (입대 가능)
 * - '복무 중'        : 상무 피닉스 등 현역/군 복무 중 (레거시 '상무복무' 포함)
 * - '입대 예정'      : 입대 확정 대기 상태
 * - '예술·체육요원'  : 올림픽 메달 / 아시안게임 금메달 병역특례 (입대 이벤트 영구 차단)
 * - '면제'           : 전시근로역·병역면제 (입대 이벤트 영구 차단)
 * - '해당 없음'      : 외국인·아시아쿼터 선수 (입대 이벤트 영구 차단)
 * - '미확인'         : 실제 선수 병역 정보 미확인 (임의로 미필 처리하거나 입대 이벤트 발생 금지)
 */

export function isMilitaryServing(status?: MilitaryStatus | null): boolean {
  return status === '복무 중' || status === '상무복무';
}

export function isMilitaryResolved(status?: MilitaryStatus | null): boolean {
  return (
    status === '군필' ||
    status === '예술·체육요원' ||
    status === '면제' ||
    status === '해당 없음'
  );
}

/**
 * 실제/가상 선수의 병역 상태 정규화 (화면 및 엔진 공통).
 * 미지정 국내 선수를 절대 '미필'로 단정하지 않고 '미확인'으로 반환합니다.
 * 외국인/아시아쿼터 선수는 항상 '해당 없음'으로 반환합니다.
 */
export function resolveDisplayMilitaryStatus(player: Pick<Player, 'category' | 'militaryStatus'>): MilitaryStatus {
  if (player.category !== '국내') {
    return '해당 없음';
  }
  if (!player.militaryStatus) {
    return '미확인';
  }
  if (player.militaryStatus === '상무복무') {
    return '복무 중';
  }
  return player.militaryStatus;
}

/**
 * 자동 의무 입대 또는 상무 지원 가능 여부 엄격 판정.
 * - 군필 / 예술·체육요원 / 면제 / 해당 없음 / 복무 중 / 미확인 선수는 입대 불가!
 * - 오직 확인된 '미필' 또는 '입대 예정' 국내 선수(만 27세 이하)만 대상.
 */
export function canPlayerEnlistMilitary(
  player: Pick<Player, 'category' | 'rosterTier' | 'militaryStatus' | 'age'>,
  options?: { allowPlanned?: boolean; maxAge?: number }
): boolean {
  if (player.category !== '국내') return false;
  if (
    player.rosterTier === '은퇴' ||
    player.rosterTier === '해외이적' ||
    player.rosterTier === '제외후보'
  ) {
    return false;
  }
  if (isMilitaryResolved(player.militaryStatus) || isMilitaryServing(player.militaryStatus)) {
    return false;
  }
  if (!player.militaryStatus || player.militaryStatus === '미확인') {
    return false;
  }
  const allowPlanned = options?.allowPlanned ?? true;
  const eligibleStatus =
    player.militaryStatus === '미필' || (allowPlanned && player.militaryStatus === '입대 예정');
  if (!eligibleStatus) return false;

  const maxAge = options?.maxAge ?? 27;
  if (player.age > maxAge) return false;
  return true;
}

/**
 * 자동 의무 입대 이벤트(시즌 개막 시 만 26~27세) 대상 판정.
 */
export function isEligibleForMandatoryEnlistment(
  player: Pick<Player, 'category' | 'rosterTier' | 'militaryStatus' | 'age'>
): boolean {
  return canPlayerEnlistMilitary(player, { allowPlanned: true, maxAge: 28 });
}

export function formatMilitaryStatusLabel(
  status: MilitaryStatus | undefined,
  category?: Player['category']
): string {
  if (category && category !== '국내') return '해당 없음';
  if (!status) return '미확인';
  if (status === '상무복무') return '복무 중';
  return status;
}

export function getMilitaryBadgeToneClass(status: MilitaryStatus): string {
  switch (status) {
    case '예술·체육요원':
      return 'bg-emerald-600 text-white';
    case '면제':
      return 'bg-teal-600 text-white';
    case '군필':
      return 'bg-slate-700 text-white';
    case '복무 중':
    case '상무복무':
      return 'bg-blue-600 text-white';
    case '입대 예정':
      return 'bg-indigo-600 text-white';
    case '미필':
      return 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40';
    case '해당 없음':
      return 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
    case '미확인':
    default:
      return 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border border-slate-300/70 dark:border-slate-700';
  }
}

export function formatThrowsBatsKorean(
  throws?: 'L' | 'R' | null,
  bats?: 'L' | 'R' | 'S' | null
): string {
  if (!throws && !bats) return '미확인';
  const t = throws === 'L' ? '좌투' : throws === 'R' ? '우투' : '투구 미확인';
  const b =
    bats === 'L'
      ? '좌타'
      : bats === 'R'
      ? '우타'
      : bats === 'S'
      ? '양타'
      : '타격 미확인';
  if (throws && bats) return `${t}${b}`;
  return `${t} · ${b}`;
}
