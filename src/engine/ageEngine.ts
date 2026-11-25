import { CareerSave } from '../types/kbo';
import { SeededRng } from './rng';

export interface ParsedIsoDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 엄격한 YYYY-MM-DD 날짜 파서. 유효하지 않은 날짜는 null 반환.
 */
export function parseIsoDate(iso?: string | null): ParsedIsoDate | null {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.trim().match(ISO_DATE_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * 게임 내 현재 날짜(YYYY-MM-DD)를 일관되게 해석한다.
 */
export function getCareerCurrentIsoDate(
  career: Pick<CareerSave, 'season' | 'currentDate' | 'phase' | 'gamesPlayed'>
): string {
  if (parseIsoDate(career.currentDate)) {
    return career.currentDate!;
  }
  const s = career.season || 2027;
  if (career.phase === 'OFFSEASON') {
    return `${s}-11-15`;
  }
  if (career.phase === 'POSTSEASON') {
    return `${s}-10-15`;
  }
  if ((career.gamesPlayed ?? 0) === 0) {
    return `${s}-01-01`;
  }
  return `${s}-04-01`;
}

/**
 * 생년월일(YYYY-MM-DD)과 기준 날짜(YYYY-MM-DD)로 정확한 만 나이를 계산한다.
 * - 생일이 지나지 않았으면 (기준연도 - 출생연도 - 1)
 * - 생일이 지났거나 당일이면 (기준연도 - 출생연도)
 * - 시즌 전환(1월 1일)만으로 중복 증가하지 않으며, 실제 생일 경과 시에만 1세 증가한다.
 */
export function calculateKoreanFullAge(
  birthDate: string | null | undefined,
  referenceIsoDate: string
): number | null {
  const dob = parseIsoDate(birthDate);
  const ref = parseIsoDate(referenceIsoDate);
  if (!dob || !ref) return null;
  let age = ref.year - dob.year;
  if (ref.month < dob.month || (ref.month === dob.month && ref.day < dob.day)) {
    age -= 1;
  }
  return Math.max(15, Math.min(65, age));
}

/**
 * 엔티티(KBO 선수, 상무, FA, 해외파, 아마추어, 울산 웨일즈, 드래프트 후보)의
 * 기준 날짜 기준 만 나이를 단일 공식으로 산출한다.
 *
 * 우선순위:
 * 1) 확인된 생년월일(birthDate: YYYY-MM-DD)이 있으면 현재 날짜 대비 정확한 만 나이 계산
 * 2) 생년월일이 미확인(null)이고 출생연도(birthYear)가 있으면 (기준연도 - birthYear)로 중복 증가 없이 단일 산출
 * 3) 둘 다 없으면 기존 age 유지
 */
export function resolveAgeAtDate(
  entity: { birthDate?: string | null; birthYear?: number | null; age: number },
  referenceIsoDate: string
): number {
  const exact = calculateKoreanFullAge(entity.birthDate, referenceIsoDate);
  if (exact !== null) {
    return exact;
  }
  const ref = parseIsoDate(referenceIsoDate);
  if (
    ref &&
    typeof entity.birthYear === 'number' &&
    Number.isFinite(entity.birthYear) &&
    entity.birthYear >= 1970 &&
    entity.birthYear <= 2040
  ) {
    return Math.max(15, Math.min(60, ref.year - entity.birthYear));
  }
  return entity.age;
}

/**
 * UI 표시용 생년월일 텍스트 포맷터 (실제 미확인 생년월일은 임의 생성 없이 '미확인' 표시)
 */
export function formatBirthDateDisplay(birthDate?: string | null): string {
  return parseIsoDate(birthDate) ? birthDate!.trim() : '미확인';
}

/**
 * 생년월일이 확인된 경우 birthYear를 자동 일치시킨다.
 */
export function syncEntityAgeInPlace<
  T extends { birthDate?: string | null; birthYear?: number; age: number }
>(entity: T, referenceIsoDate: string): boolean {
  const dob = parseIsoDate(entity.birthDate);
  if (dob && entity.birthYear !== dob.year) {
    entity.birthYear = dob.year;
  }
  const nextAge = resolveAgeAtDate(entity, referenceIsoDate);
  if (entity.age !== nextAge) {
    entity.age = nextAge;
    return true;
  }
  return false;
}

/**
 * 가상 생성 선수 전용 생년월일 생성기.
 * - 실제 KBO 선수/실제 신인 선수에는 절대 사용하지 않는다.
 * - 가상 신인·아마추어·퓨처스 보충 선수 생성 시에만 호출한다.
 */
export function generateVirtualBirthDate(rng: SeededRng, birthYear: number): string {
  const y = Math.max(1980, Math.min(2040, Math.round(birthYear)));
  const month = rng.int(1, 12);
  const maxDay =
    month === 2
      ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28)
      : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;
  const day = rng.int(1, maxDay);
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 세이브 내 모든 현역·2군·상무·FA·해외파·아마추어·울산 웨일즈·드래프트 후보의 나이를
 * 게임 내 현재 날짜(referenceIsoDate)와 생년월일 기준으로 일괄 동기화한다.
 * - 생일이 지난 선수는 자동으로 +1세 반영
 * - 시즌 전환 시에도 생년월일 기반 재계산이므로 중복 증가 원천 차단
 * - 이미 은퇴한 선수(rosterTier === '은퇴')는 은퇴 당시 나이를 보존
 */
export function syncAllAgesToDateInPlace(
  career: CareerSave,
  referenceIsoDate?: string
): number {
  const iso = referenceIsoDate && parseIsoDate(referenceIsoDate)
    ? referenceIsoDate
    : getCareerCurrentIsoDate(career);

  let changed = 0;

  // 1) KBO 10개 구단 1군/2군/육성/상무/FA/해외이적 선수 (은퇴 선수는 은퇴 시점 나이 보존)
  for (const p of Object.values(career.players ?? {})) {
    if (p.rosterTier === '은퇴') continue;
    if (syncEntityAgeInPlace(p, iso)) changed += 1;
  }

  // 2) 미영입 자유계약 / 웨이버 방출 FA 시장
  for (const fa of career.unclaimedFreeAgents ?? []) {
    if (fa.status === '은퇴' || fa.status === '재계약완료') continue;
    if (syncEntityAgeInPlace(fa.player, iso)) changed += 1;
  }

  // 3) 해외 진출 선수 (MLB / 마이너 6단계)
  for (const ov of career.amateurAndOverseas?.overseasPlayers ?? []) {
    if (ov.status === '은퇴' || ov.status === 'KBO복귀완료') continue;
    if (syncEntityAgeInPlace(ov, iso)) changed += 1;
  }

  // 4) 국내 고교·대학 아마추어 유망주
  for (const pr of career.amateurAndOverseas?.prospects ?? []) {
    if (pr.draftedToTeamId || pr.careerPath === '은퇴' || pr.careerPath === '해외프로계약') continue;
    if (syncEntityAgeInPlace(pr, iso)) changed += 1;
  }

  // 5) 울산 웨일즈 (퓨처스 특별 구단)
  for (const uw of career.ulsanWhales?.roster ?? []) {
    if (uw.transferredToTeamId) continue;
    if (syncEntityAgeInPlace(uw, iso)) changed += 1;
  }

  // 6) 미지명 드래프트 후보
  for (const cand of career.draftState?.candidates ?? []) {
    if (cand.draftedBy) continue;
    if (syncEntityAgeInPlace(cand, iso)) changed += 1;
  }

  // 7) 은퇴선수 진로 추적기(코치 연수/해설위원 등) — birthDate가 연결된 원선수가 있으면 기준 날짜로 정확 동기화
  const refParsed = parseIsoDate(iso);
  for (const rec of career.retiredCareerTracker ?? []) {
    const srcPlayer = career.players?.[rec.playerId];
    if (srcPlayer && parseIsoDate(srcPlayer.birthDate)) {
      const exact = calculateKoreanFullAge(srcPlayer.birthDate, iso);
      if (exact !== null && rec.age !== exact) {
        rec.age = exact;
        changed += 1;
      }
    } else if (refParsed && rec.lastUpdatedSeason && rec.lastUpdatedSeason < refParsed.year) {
      rec.age += refParsed.year - rec.lastUpdatedSeason;
      rec.lastUpdatedSeason = refParsed.year;
      changed += 1;
    }
  }

  return changed;
}
