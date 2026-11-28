import { DEFAULT_INVESTMENTS } from '../data/financesData';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  enforceOvrPotInvariantInPlace,
  getKboMinSalaryBillion,
} from '../data/v18Importer';
import {
  CareerSave,
  ClubInvestments,
  EditorChangeLogEntry,
  EditorFieldDiff,
  HiddenTrait,
  InjuryRecord,
  InjurySeverity,
  MilitaryStatus,
  MoraleState,
  OotpPlayerRatings,
  OverseasLeagueLevel,
  OverseasPlayerRecord,
  Player,
  PlayerCategory,
  PlayerRole,
  Position,
  PreGameEditorStore,
  RosterTier,
  TeamId,
  TicketPricePolicy,
} from '../types/kbo';
import { calculateKoreanFullAge, parseIsoDate, syncAllAgesToDateInPlace } from './ageEngine';
import { appendPlayerTeamHistoryInPlace } from './leagueLifeEngine';
import { isMilitaryServing } from './militaryEngine';
import {
  ALL_FIELD_POSITIONS,
  ensurePlayerPositionProficiencyInPlace,
} from './positionEngine';
import { reconcileTeamLineupPositionsInPlace } from './lineupValidationEngine';
import {
  computeOotpOverall,
  computeOotpPotential,
  ensurePlayerOotpRatingsInPlace,
  evaluatePitcherRoleFit,
  syncLegacyRatingsFromOotpInPlace,
} from './ootpRatingsEngine';
import { getCurrentCareerDate } from './salaryCapEngine';
import { emptyBatterStats, emptyPitcherStats } from './stats';

export const ALL_HIDDEN_TRAITS: HiddenTrait[] = [
  '큰경기강세',
  '유리몸',
  '철강왕',
  '꾸준함',
  '슬로우스타터',
  '클러치히터',
  '멘탈에이스',
  '분위기메이커',
  '좌투킬러',
  '우투킬러',
];

export const ALL_MILITARY_STATUSES: MilitaryStatus[] = [
  '군필',
  '미필',
  '복무 중',
  '입대 예정',
  '예술·체육요원',
  '면제',
  '해당 없음',
  '미확인',
];

export const ALL_PITCH_ROLES: NonNullable<Player['pitchRole']>[] = [
  '선발',
  '마무리',
  '필승조',
  '중간',
  '추격조',
  '롱릴리프',
];

export const ALL_ROSTER_TIERS: RosterTier[] = [
  '1군',
  '2군',
  '육성',
  '대기',
  'FA',
  '해외이적',
  '은퇴',
];

export const ALL_MORALE_STATES: MoraleState[] = ['만족', '보통', '불만', '평가 대기'];

export const ALL_OVERSEAS_LEAGUES: OverseasLeagueLevel[] = [
  'MLB',
  'AAA',
  'AA',
  'A+',
  'NPB',
  'FA/방출',
];

export interface PlayerEditorDraft {
  id: string;
  name: string;
  birthDate: string; // '' or YYYY-MM-DD
  nationality: string;
  category: PlayerCategory;
  heightCm: number | '';
  weightKg: number | '';
  throws: 'L' | 'R' | '';
  bats: 'L' | 'R' | 'S' | '';
  uniformNumber: number | '';
  role: PlayerRole;
  ability: number;
  potential: number;
  // Sub-ratings (1..99)
  contactProxy: number;
  powerProxy: number;
  eyeProxy: number;
  speedProxy: number;
  defenseProxy: number;
  stuffProxy: number;
  controlProxy: number;
  movementProxy: number;
  staminaProxy: number;
  /** OOTP 스타일 전체 세부 능력치 (타격·투구·구종·수비·주루·성향) */
  ootpRatings: OotpPlayerRatings;
  // Positions & Pitch Role
  position: Position;
  secondaryPositions: Position[];
  positionProficiency: Partial<Record<Position, number>>;
  pitchRole: NonNullable<Player['pitchRole']>;
  // Team, Military, Contract, FA
  teamId: TeamId;
  rosterTier: RosterTier;
  militaryStatus: MilitaryStatus;
  militaryDischargeDate: string;
  annualSalary: number;
  signingBonus: number;
  years: number;
  yearsRemaining: number;
  isFAEligible: boolean;
  faGrade: 'A' | 'B' | 'C' | '';
  // Condition, Injury, Morale, Trait
  hasInjury: boolean;
  injuryDescription: string;
  injurySeverity: InjurySeverity;
  injuryDaysRemaining: number;
  fatigue: number;
  form: number;
  morale: MoraleState;
  dissatisfaction: number;
  hiddenTrait: HiddenTrait | '';
}

export interface NewPlayerEditorForm {
  name: string;
  teamId: TeamId;
  role: PlayerRole;
  position: Position;
  secondaryPositions: Position[];
  pitchRole: NonNullable<Player['pitchRole']>;
  birthDate: string;
  nationality: string;
  category: PlayerCategory;
  heightCm: number | '';
  weightKg: number | '';
  throws: 'L' | 'R';
  bats: 'L' | 'R' | 'S';
  uniformNumber: number | '';
  ability: number;
  potential: number;
  contactProxy: number;
  powerProxy: number;
  eyeProxy: number;
  speedProxy: number;
  defenseProxy: number;
  stuffProxy: number;
  controlProxy: number;
  movementProxy: number;
  staminaProxy: number;
  rosterTier: RosterTier;
  militaryStatus: MilitaryStatus;
  annualSalary: number;
  years: number;
  hiddenTrait: HiddenTrait | '';
  school: string;
}

export interface ClubFinancesEditorDraft {
  teamId: TeamId;
  cashBalanceBillion: number;
  ownerBudgetCapBillion: number;
  ticketPricePolicy: TicketPricePolicy;
  krwUnpaidBillion: number;
  usdUnpaid: number;
  investments: ClubInvestments;
}

export interface OverseasEditorDraft {
  permanentId: string;
  name: string;
  birthDate: string;
  age: number;
  role: PlayerRole;
  position: Position;
  ability: number;
  potential: number;
  league: OverseasLeagueLevel;
  clubName: string;
  originalKboTeamId: TeamId | '';
  annualSalaryUsdThousands: number;
  contractYearsRemaining: number;
  militaryStatus: MilitaryStatus;
  returnRestrictionActive: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function cloneObj<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export function playerToEditorDraft(p: Player): PlayerEditorDraft {
  const ootpCopy = cloneObj(ensurePlayerOotpRatingsInPlace(p));
  const bat = p.v18Ratings?.batting;
  const pit = p.v18Ratings?.pitching;
  return {
    id: p.id,
    name: p.name,
    birthDate: p.birthDate ?? '',
    nationality: p.nationality ?? (p.category === '국내' ? '한국' : '미국'),
    category: p.category,
    heightCm: p.heightCm ?? '',
    weightKg: p.weightKg ?? '',
    throws: p.throws ?? '',
    bats: p.bats ?? '',
    uniformNumber: p.uniformNumber ?? '',
    role: p.role,
    ability: p.ability,
    potential: p.potential,
    contactProxy: Math.round(bat?.contact ?? p.ability),
    powerProxy: Math.round(bat?.power ?? p.ability),
    eyeProxy: Math.round(bat?.discipline ?? p.ability),
    speedProxy: Math.round(bat?.speed ?? Math.max(35, p.ability - 5)),
    defenseProxy: Math.round(bat?.fielding ?? p.ability),
    stuffProxy: Math.round(pit?.stuff ?? p.ability),
    controlProxy: Math.round(pit?.control ?? p.ability),
    movementProxy: Math.round(pit?.hr_prevention ?? p.ability),
    staminaProxy: Math.round(pit?.stamina_proxy ?? (p.position === 'SP' ? 68 : 50)),
    ootpRatings: ootpCopy,
    position: p.position,
    secondaryPositions: [...(p.secondaryPositions ?? [])],
    positionProficiency: { ...(p.positionProficiency ?? {}) },
    pitchRole: p.pitchRole ?? (p.position === 'CL' ? '마무리' : p.position === 'RP' ? '중간' : '선발'),
    teamId: p.teamId,
    rosterTier: p.rosterTier,
    militaryStatus: p.militaryStatus === '상무복무' ? '복무 중' : (p.militaryStatus ?? '미확인'),
    militaryDischargeDate: p.militaryDischargeDate ?? '',
    annualSalary: Number((p.contract.annualSalary ?? 0.33).toFixed(2)),
    signingBonus: Number((p.contract.signingBonus ?? 0).toFixed(2)),
    years: Math.max(1, p.contract.years ?? 1),
    yearsRemaining: Math.max(0, p.contract.yearsRemaining ?? 1),
    isFAEligible: Boolean(p.contract.isFAEligible),
    faGrade: p.contract.faGrade ?? '',
    hasInjury: Boolean(p.injury),
    injuryDescription: p.injury?.description ?? '근육 피로',
    injurySeverity: p.injury?.severity ?? '경미',
    injuryDaysRemaining: p.injury?.daysRemaining ?? 7,
    fatigue: Math.round(p.fatigue ?? 0),
    form: Math.round(p.form ?? 0),
    morale: p.morale ?? '보통',
    dissatisfaction: Math.round(p.dissatisfaction ?? 0),
    hiddenTrait: p.hiddenTrait ?? '',
  };
}

export function validatePlayerEditorDraft(
  career: CareerSave,
  original: Player,
  draft: PlayerEditorDraft
): { valid: boolean; errors: string[]; warnings: string[]; diffs: EditorFieldDiff[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmedName = draft.name.trim();

  if (!trimmedName) errors.push('선수 이름은 비워둘 수 없습니다.');
  if (draft.birthDate) {
    if (!parseIsoDate(draft.birthDate)) {
      errors.push('생년월일 형식이 올바르지 않습니다 (YYYY-MM-DD 형식 입력).');
    } else {
      const y = Number(draft.birthDate.slice(0, 4));
      if (y < 1970 || y > 2012) errors.push('생년월일 출생연도는 1970~2012 사이여야 합니다.');
    }
  }
  if (draft.heightCm !== '' && (draft.heightCm < 150 || draft.heightCm > 220)) {
    errors.push('신장은 150~220cm 범위여야 합니다.');
  }
  if (draft.weightKg !== '' && (draft.weightKg < 50 || draft.weightKg > 155)) {
    errors.push('체중은 50~155kg 범위여야 합니다.');
  }
  if (draft.uniformNumber !== '' && (draft.uniformNumber < 0 || draft.uniformNumber > 199)) {
    errors.push('등번호는 0~199 범위여야 합니다.');
  }
  if (draft.ability < 1 || draft.ability > 99) errors.push('오버롤은 1~99 범위여야 합니다.');
  if (draft.potential < 1 || draft.potential > 99) errors.push('포텐셜은 1~99 범위여야 합니다.');
  if (draft.ability > draft.potential) errors.push('오버롤(OVR)은 포텐셜(POT)보다 클 수 없습니다.');

  const subChecks =
    draft.role === '타자'
      ? [
          ['컨택', draft.contactProxy],
          ['파워', draft.powerProxy],
          ['선구안', draft.eyeProxy],
          ['주루', draft.speedProxy],
          ['수비', draft.defenseProxy],
        ]
      : [
          ['구위', draft.stuffProxy],
          ['제구', draft.controlProxy],
          ['무브먼트', draft.movementProxy],
          ['스태미나', draft.staminaProxy],
        ];
  for (const [label, val] of subChecks) {
    if (Number(val) < 1 || Number(val) > 99) errors.push(`${label} 세부 능력치는 1~99 범위여야 합니다.`);
  }

  if (draft.years < 1 || draft.years > 15) errors.push('계약 기간은 1~15년 범위여야 합니다.');
  if (draft.yearsRemaining < 0 || draft.yearsRemaining > draft.years) {
    errors.push('잔여 계약 연수는 0 이상, 총 계약 기간 이하여야 합니다.');
  }
  if (draft.annualSalary < 0) errors.push('연봉은 0 이상이어야 합니다.');
  if (draft.signingBonus < 0) errors.push('계약금은 0 이상이어야 합니다.');
  if (draft.fatigue < 0 || draft.fatigue > 100) errors.push('피로도는 0~100 범위여야 합니다.');
  if (draft.dissatisfaction < 0 || draft.dissatisfaction > 100) errors.push('불만도는 0~100 범위여야 합니다.');
  if (draft.form < -5 || draft.form > 5) errors.push('컨디션(폼)은 -5~+5 범위여야 합니다.');
  if (draft.hasInjury && (draft.injuryDaysRemaining < 1 || draft.injuryDaysRemaining > 365)) {
    errors.push('부상 잔여 일수는 1~365일 범위여야 합니다.');
  }
  if (draft.militaryDischargeDate && !parseIsoDate(draft.militaryDischargeDate)) {
    errors.push('전역 예정일 형식이 올바르지 않습니다 (YYYY-MM-DD).');
  }

  // Duplicate active player collision check
  const normName = trimmedName.replace(/\s+/g, '');
  const dup = Object.values(career.players).find(
    (other) =>
      other.id !== original.id &&
      other.rosterTier !== '은퇴' &&
      other.name.replace(/\s+/g, '') === normName &&
      ((draft.birthDate && other.birthDate && other.birthDate === draft.birthDate) ||
        (other.teamId === draft.teamId && other.role === draft.role && !draft.birthDate))
  );
  if (dup) {
    errors.push(`동일 선수 중복 등록 감지: ${KBO_TEAMS[dup.teamId].shortName} ${dup.name} (${dup.id})`);
  }

  // Uniform number warning (auto-handled safely)
  if (draft.uniformNumber !== '' && draft.rosterTier !== '은퇴' && draft.rosterTier !== 'FA') {
    const numConflict = Object.values(career.players).find(
      (other) =>
        other.id !== original.id &&
        other.teamId === draft.teamId &&
        other.rosterTier !== '은퇴' &&
        other.rosterTier !== 'FA' &&
        other.uniformNumber === draft.uniformNumber
    );
    if (numConflict) {
      warnings.push(
        `${KBO_TEAMS[draft.teamId].shortName}에 등번호 #${draft.uniformNumber} 사용 선수(${numConflict.name})가 이미 존재합니다.`
      );
    }
  }

  // Build crisp Before -> After diff list
  const diffs: EditorFieldDiff[] = [];
  const pushDiff = (field: string, label: string, b: unknown, a: unknown) => {
    const bs = b === undefined || b === null || b === '' ? '없음' : String(b);
    const as = a === undefined || a === null || a === '' ? '없음' : String(a);
    if (bs !== as) diffs.push({ field, label, before: bs, after: as });
  };

  const origDraft = playerToEditorDraft(original);
  pushDiff('name', '이름', origDraft.name, trimmedName);
  pushDiff('birthDate', '생년월일', origDraft.birthDate, draft.birthDate);
  pushDiff('nationality', '국적', origDraft.nationality, draft.nationality.trim());
  pushDiff('category', '신분 구분', origDraft.category, draft.category);
  pushDiff('heightCm', '신장(cm)', origDraft.heightCm, draft.heightCm);
  pushDiff('weightKg', '체중(kg)', origDraft.weightKg, draft.weightKg);
  pushDiff('throws', '투구손', origDraft.throws, draft.throws);
  pushDiff('bats', '타격손', origDraft.bats, draft.bats);
  pushDiff('uniformNumber', '등번호', origDraft.uniformNumber, draft.uniformNumber);
  pushDiff('ability', '오버롤(OVR)', origDraft.ability, draft.ability);
  pushDiff('potential', '포텐셜(POT)', origDraft.potential, draft.potential);
  if (draft.role === '타자') {
    pushDiff('contactProxy', '컨택', origDraft.contactProxy, draft.contactProxy);
    pushDiff('powerProxy', '파워', origDraft.powerProxy, draft.powerProxy);
    pushDiff('eyeProxy', '선구안', origDraft.eyeProxy, draft.eyeProxy);
    pushDiff('speedProxy', '주루', origDraft.speedProxy, draft.speedProxy);
    pushDiff('defenseProxy', '수비', origDraft.defenseProxy, draft.defenseProxy);
    pushDiff('position', '주 포지션', origDraft.position, draft.position);
    pushDiff(
      'secondaryPositions',
      '보조 포지션',
      origDraft.secondaryPositions.join(', '),
      draft.secondaryPositions.filter((s) => s !== draft.position).join(', ')
    );
    const profChanges: string[] = [];
    for (const pos of ALL_FIELD_POSITIONS) {
      const bVal = Math.round(origDraft.positionProficiency[pos] ?? 0);
      const aVal = Math.round(draft.positionProficiency[pos] ?? 0);
      if (bVal !== aVal) profChanges.push(`${pos}:${bVal}→${aVal}`);
    }
    if (profChanges.length > 0) {
      diffs.push({
        field: 'positionProficiency',
        label: '포지션별 숙련도',
        before: '기존 숙련도',
        after: profChanges.join(', '),
      });
    }
  } else {
    pushDiff('stuffProxy', '구위', origDraft.stuffProxy, draft.stuffProxy);
    pushDiff('controlProxy', '제구', origDraft.controlProxy, draft.controlProxy);
    pushDiff('movementProxy', '무브먼트', origDraft.movementProxy, draft.movementProxy);
    pushDiff('staminaProxy', '스태미나', origDraft.staminaProxy, draft.staminaProxy);
    pushDiff('position', '투수 포지션', origDraft.position, draft.position);
    pushDiff('pitchRole', '투수 보직', origDraft.pitchRole, draft.pitchRole);
  }
  pushDiff('teamId', '소속 구단', KBO_TEAMS[origDraft.teamId].shortName, KBO_TEAMS[draft.teamId].shortName);
  pushDiff('rosterTier', '로스터 등급', origDraft.rosterTier, draft.rosterTier);
  pushDiff('militaryStatus', '병역 상태', origDraft.militaryStatus, draft.militaryStatus);
  pushDiff('militaryDischargeDate', '전역 예정일', origDraft.militaryDischargeDate, draft.militaryDischargeDate);
  pushDiff('annualSalary', '연봉(억)', origDraft.annualSalary, draft.annualSalary);
  pushDiff('signingBonus', '계약금(억)', origDraft.signingBonus, draft.signingBonus);
  pushDiff('years', '계약 기간(년)', origDraft.years, draft.years);
  pushDiff('yearsRemaining', '잔여 기간(년)', origDraft.yearsRemaining, draft.yearsRemaining);
  pushDiff('isFAEligible', 'FA 자격', origDraft.isFAEligible ? '취득' : '미취득', draft.isFAEligible ? '취득' : '미취득');
  pushDiff('faGrade', 'FA 등급', origDraft.faGrade || '미지정', draft.faGrade || '미지정');
  pushDiff(
    'injury',
    '부상 상태',
    origDraft.hasInjury ? `${origDraft.injuryDescription}(${origDraft.injurySeverity}/${origDraft.injuryDaysRemaining}일)` : '건강',
    draft.hasInjury ? `${draft.injuryDescription}(${draft.injurySeverity}/${draft.injuryDaysRemaining}일)` : '건강'
  );
  pushDiff('fatigue', '피로도', origDraft.fatigue, draft.fatigue);
  pushDiff('form', '컨디션(폼)', origDraft.form, draft.form);
  pushDiff('morale', '사기', origDraft.morale, draft.morale);
  pushDiff('dissatisfaction', '불만도', origDraft.dissatisfaction, draft.dissatisfaction);
  pushDiff('hiddenTrait', '선수 특성', origDraft.hiddenTrait || '없음', draft.hiddenTrait || '없음');

  // OOTP 세부 능력치 변경 비교
  const oB = origDraft.ootpRatings;
  const oA = draft.ootpRatings;
  if (oB && oA) {
    if (oB.batting && oA.batting) {
      const batPairs: [keyof Pick<NonNullable<OotpPlayerRatings['batting']>, 'babip' | 'avoidK' | 'gapPower' | 'hrPower' | 'eye' | 'vsLHP' | 'vsRHP'>, string][] = [
        ['babip', 'BABIP'],
        ['avoidK', '삼진 회피'],
        ['gapPower', '갭 파워'],
        ['hrPower', '홈런 파워'],
        ['eye', '선구안'],
        ['vsLHP', '좌완 상대'],
        ['vsRHP', '우완 상대'],
      ];
      for (const [k, label] of batPairs) {
        pushDiff(`ootp.bat.${k}`, `타격:${label}`, `${oB.batting[k].cur}/${oB.batting[k].pot}`, `${oA.batting[k].cur}/${oA.batting[k].pot}`);
      }
      pushDiff('ootp.bat.sacBunt', '희생번트', oB.batting.sacBunt, oA.batting.sacBunt);
      pushDiff('ootp.bat.buntForHit', '기습번트', oB.batting.buntForHit, oA.batting.buntForHit);
    }
    if (oB.pitching && oA.pitching) {
      const pitPairs: [keyof Pick<NonNullable<OotpPlayerRatings['pitching']>, 'stuff' | 'movement' | 'control' | 'hrPrevent' | 'hitPrevent' | 'vsLHB' | 'vsRHB'>, string][] = [
        ['stuff', '구위'],
        ['movement', '무브먼트'],
        ['control', '제구력'],
        ['hrPrevent', '피홈런 억제'],
        ['hitPrevent', '피안타 억제'],
        ['vsLHB', '좌타 상대'],
        ['vsRHB', '우타 상대'],
      ];
      for (const [k, label] of pitPairs) {
        pushDiff(`ootp.pit.${k}`, `투구:${label}`, `${oB.pitching[k].cur}/${oB.pitching[k].pot}`, `${oA.pitching[k].cur}/${oA.pitching[k].pot}`);
      }
      pushDiff('ootp.pit.stamina', '투수 체력', oB.pitching.stamina, oA.pitching.stamina);
      pushDiff('ootp.pit.holdRunner', '주자 견제', oB.pitching.holdRunner, oA.pitching.holdRunner);
      pushDiff('ootp.pit.avgVelo', '평균 구속', oB.pitching.avgVelocityKmh, oA.pitching.avgVelocityKmh);
      pushDiff('ootp.pit.maxVelo', '최고 구속', oB.pitching.maxVelocityKmh, oA.pitching.maxVelocityKmh);
      pushDiff('ootp.pit.gbRate', '땅볼 유도율(%)', oB.pitching.groundballRate, oA.pitching.groundballRate);
      const bPitchStr = oB.pitching.pitches.map((x) => `${x.name}:${x.cur}/${x.pot}(${x.usagePct}%)`).join(', ');
      const aPitchStr = oA.pitching.pitches.map((x) => `${x.name}:${x.cur}/${x.pot}(${x.usagePct}%)`).join(', ');
      pushDiff('ootp.pit.pitches', '구종 구성', bPitchStr, aPitchStr);
    }
    const defKeys: [keyof OotpPlayerRatings['defense'], string][] = [
      ['infieldRange', '내야 범위'],
      ['infieldError', '내야 실책방지'],
      ['infieldArm', '내야 송구'],
      ['turnDP', '병살 처리'],
      ['outfieldRange', '외야 범위'],
      ['outfieldError', '외야 실책방지'],
      ['outfieldArm', '외야 송구'],
      ['catcherBlocking', '포수 블로킹'],
      ['catcherFraming', '포수 프레이밍'],
      ['catcherArm', '포수 송구'],
    ];
    for (const [k, label] of defKeys) {
      pushDiff(`ootp.def.${k}`, `수비:${label}`, oB.defense[k], oA.defense[k]);
    }
    const runKeys: [keyof OotpPlayerRatings['baserunning'], string][] = [
      ['speed', '주력'],
      ['stealTendency', '도루 시도성향'],
      ['stealAbility', '도루 능력'],
      ['baserunning', '주루 판단력'],
    ];
    for (const [k, label] of runKeys) {
      pushDiff(`ootp.run.${k}`, `주루:${label}`, oB.baserunning[k], oA.baserunning[k]);
    }
    const persKeys: [keyof OotpPlayerRatings['personality'], string][] = [
      ['professionalism', '프로의식'],
      ['workEthic', '훈련 태도'],
      ['loyalty', '충성심'],
      ['greed', '금전 선호도'],
      ['leadership', '리더십'],
      ['adaptability', '적응력'],
      ['durability', '내구성'],
    ];
    for (const [k, label] of persKeys) {
      pushDiff(`ootp.pers.${k}`, `성향:${label}`, oB.personality[k], oA.personality[k]);
    }
  }

  return { valid: errors.length === 0, errors, warnings, diffs };
}

function removePlayerFromTeamOrders(career: CareerSave, teamId: TeamId, playerId: string): void {
  const ts = career.teams[teamId];
  if (!ts) return;
  ts.lineupOrder = ts.lineupOrder.filter((id) => id !== playerId);
  delete ts.lineupPositions[playerId];
  ts.benchOrder = ts.benchOrder.filter((id) => id !== playerId);
  ts.rotationOrder = ts.rotationOrder.filter((id) => id !== playerId);
  ts.bullpenOrder = ts.bullpenOrder.filter((id) => id !== playerId);
}

function syncPlayerToTeamOrdersInPlace(career: CareerSave, p: Player, prevTeamId: TeamId): void {
  if (prevTeamId !== p.teamId) {
    removePlayerFromTeamOrders(career, prevTeamId, p.id);
  }
  const serving = isMilitaryServing(p.militaryStatus);
  const inactive =
    serving ||
    p.rosterTier === '2군' ||
    p.rosterTier === '육성' ||
    p.rosterTier === '대기' ||
    p.rosterTier === 'FA' ||
    p.rosterTier === '은퇴' ||
    p.rosterTier === '해외이적' ||
    p.rosterTier === '제외후보';

  if (inactive) {
    removePlayerFromTeamOrders(career, p.teamId, p.id);
    p.gameDayActive = false;
    if (serving && career.pendingFaProtection) {
      career.pendingFaProtection.protectedIds = career.pendingFaProtection.protectedIds.filter(
        (id) => id !== p.id
      );
    }
    return;
  }

  // Active 1군 placement
  const ts = career.teams[p.teamId];
  if (!ts) return;
  p.gameDayActive = true;
  if (p.role === '투수') {
    const isSp = p.position === 'SP' || p.pitchRole === '선발';
    if (isSp) {
      ts.bullpenOrder = ts.bullpenOrder.filter((id) => id !== p.id);
      if (!ts.rotationOrder.includes(p.id)) {
        if (ts.rotationOrder.length < 5) ts.rotationOrder.push(p.id);
        else ts.bullpenOrder.push(p.id);
      }
    } else {
      ts.rotationOrder = ts.rotationOrder.filter((id) => id !== p.id);
      if (!ts.bullpenOrder.includes(p.id)) {
        if (p.position === 'CL' || p.pitchRole === '마무리') ts.bullpenOrder.unshift(p.id);
        else ts.bullpenOrder.push(p.id);
      }
    }
  } else {
    const inLineup = ts.lineupOrder.includes(p.id);
    if (inLineup) {
      // Ensure assigned position is valid & unique if primary changed
      if (!ts.lineupPositions[p.id]) ts.lineupPositions[p.id] = p.position;
      reconcileTeamLineupPositionsInPlace(career, p.teamId);
    } else if (!ts.benchOrder.includes(p.id)) {
      ts.benchOrder.push(p.id);
    }
  }
  if (prevTeamId && prevTeamId !== p.teamId) {
    reconcileTeamLineupPositionsInPlace(career, prevTeamId);
  }
}

export function applyPlayerEditToCareer(
  career: CareerSave,
  draft: PlayerEditorDraft,
  mode: 'PREGAME' | 'INGAME'
): { nextCareer: CareerSave; logEntry: EditorChangeLogEntry } {
  const original = career.players[draft.id];
  if (!original) throw new Error('수정할 선수를 찾을 수 없습니다.');

  const check = validatePlayerEditorDraft(career, original, draft);
  if (!check.valid) throw new Error(check.errors.join('\n'));
  if (check.diffs.length === 0) throw new Error('변경된 항목이 없습니다.');

  const next = cloneObj(career);
  if (!next.editorOriginals) next.editorOriginals = {};
  if (!next.editorOriginals.players) next.editorOriginals.players = {};
  if (next.editorOriginals.players[original.id] === undefined) {
    next.editorOriginals.players[original.id] = cloneObj(original);
  }

  const prevSnapshot = cloneObj(original);
  const p = next.players[draft.id];
  const prevTeamId = p.teamId;
  const dateIso = getCurrentCareerDate(next).isoDate;

  p.name = draft.name.trim();
  p.birthDate = draft.birthDate ? draft.birthDate : null;
  if (p.birthDate && parseIsoDate(p.birthDate)) {
    p.birthYear = Number(p.birthDate.slice(0, 4));
    const exactAge = calculateKoreanFullAge(p.birthDate, dateIso);
    if (exactAge !== null) p.age = exactAge;
  }
  p.category = draft.category;
  p.nationality = draft.nationality.trim() || (draft.category === '국내' ? '한국' : '미국');
  p.heightCm = draft.heightCm === '' ? null : Math.round(Number(draft.heightCm));
  p.weightKg = draft.weightKg === '' ? null : Math.round(Number(draft.weightKg));
  p.throws = draft.throws === '' ? null : draft.throws;
  p.bats = draft.bats === '' ? null : draft.bats;
  p.uniformNumber = draft.uniformNumber === '' ? undefined : Math.round(Number(draft.uniformNumber));

  const manualOvrPotChanged =
    Math.round(draft.ability) !== original.ability ||
    Math.round(draft.potential) !== original.potential;
  const hasOotpDiff = check.diffs.some((d) => d.field.startsWith('ootp.'));

  p.ability = clamp(Math.round(draft.ability), 1, 99);
  p.potential = clamp(Math.max(p.ability, Math.round(draft.potential)), 1, 99);

  // OOTP 세부 능력치 반영 및 보직 적합도·레거시 v18Ratings/pitchRepertoire 즉시 동기화
  const editedOotp = cloneObj(draft.ootpRatings);
  if (editedOotp.batting) {
    for (const k of ['babip', 'avoidK', 'gapPower', 'hrPower', 'eye', 'vsLHP', 'vsRHP'] as const) {
      editedOotp.batting[k].cur = clamp(Math.round(editedOotp.batting[k].cur), 1, 100);
      editedOotp.batting[k].pot = clamp(Math.max(editedOotp.batting[k].cur, Math.round(editedOotp.batting[k].pot)), editedOotp.batting[k].cur, 100);
    }
    editedOotp.batting.sacBunt = clamp(Math.round(editedOotp.batting.sacBunt), 1, 100);
    editedOotp.batting.buntForHit = clamp(Math.round(editedOotp.batting.buntForHit), 1, 100);
  }
  if (editedOotp.pitching) {
    for (const k of ['stuff', 'movement', 'control', 'hrPrevent', 'hitPrevent', 'vsLHB', 'vsRHB'] as const) {
      editedOotp.pitching[k].cur = clamp(Math.round(editedOotp.pitching[k].cur), 1, 100);
      editedOotp.pitching[k].pot = clamp(Math.max(editedOotp.pitching[k].cur, Math.round(editedOotp.pitching[k].pot)), editedOotp.pitching[k].cur, 100);
    }
    editedOotp.pitching.stamina = clamp(Math.round(editedOotp.pitching.stamina), 1, 100);
    editedOotp.pitching.holdRunner = clamp(Math.round(editedOotp.pitching.holdRunner), 1, 100);
    editedOotp.pitching.avgVelocityKmh = Number(clamp(editedOotp.pitching.avgVelocityKmh, 120, 165).toFixed(1));
    editedOotp.pitching.maxVelocityKmh = Number(clamp(Math.max(editedOotp.pitching.avgVelocityKmh + 1, editedOotp.pitching.maxVelocityKmh), 122, 170).toFixed(1));
    editedOotp.pitching.groundballRate = clamp(Math.round(editedOotp.pitching.groundballRate), 20, 80);
    for (const pt of editedOotp.pitching.pitches) {
      pt.cur = clamp(Math.round(pt.cur), 1, 100);
      pt.pot = clamp(Math.max(pt.cur, Math.round(pt.pot)), pt.cur, 100);
      pt.usagePct = clamp(Math.round(pt.usagePct), 1, 100);
    }
    const fit = evaluatePitcherRoleFit(editedOotp.pitching);
    editedOotp.pitching.starterFit = fit.starterFit;
    editedOotp.pitching.relieverFit = fit.relieverFit;
  }
  for (const k of Object.keys(editedOotp.defense) as (keyof OotpPlayerRatings['defense'])[]) {
    editedOotp.defense[k] = clamp(Math.round(editedOotp.defense[k]), 1, 100);
  }
  for (const k of Object.keys(editedOotp.baserunning) as (keyof OotpPlayerRatings['baserunning'])[]) {
    editedOotp.baserunning[k] = clamp(Math.round(editedOotp.baserunning[k]), 1, 100);
  }
  for (const k of Object.keys(editedOotp.personality) as (keyof OotpPlayerRatings['personality'])[]) {
    editedOotp.personality[k] = clamp(Math.round(editedOotp.personality[k]), 1, 100);
  }

  p.position = draft.position;
  if (p.role === '타자') {
    p.secondaryPositions = Array.from(
      new Set(draft.secondaryPositions.filter((sp) => sp !== draft.position))
    );
    const cleanedProf: Partial<Record<Position, number>> = {};
    for (const pos of ALL_FIELD_POSITIONS) {
      const v = draft.positionProficiency[pos];
      if (typeof v === 'number' && Number.isFinite(v)) {
        cleanedProf[pos] = clamp(Math.round(v), 0, 100);
      }
    }
    p.positionProficiency = cleanedProf;
    ensurePlayerPositionProficiencyInPlace(p);
  } else {
    p.pitchRole = draft.pitchRole;
  }

  p.ootpRatings = editedOotp;
  // OOTP 세부 능력치만 수정한 경우 포지션·보직 가중치 공식으로 OVR/POT 자동 재산출; OVR/POT를 직접 입력한 경우 사용자 지정값 존중
  if (hasOotpDiff && !manualOvrPotChanged) {
    p.ability = clamp(computeOotpOverall(p), 25, 99);
    p.potential = clamp(Math.max(p.ability, computeOotpPotential(p)), p.ability, 99);
  }
  syncLegacyRatingsFromOotpInPlace(p, true);

  p.teamId = draft.teamId;
  if (prevTeamId !== draft.teamId) {
    appendPlayerTeamHistoryInPlace(p, draft.teamId, next.season, '에디터 소속 변경', {
      transferDate: dateIso,
      moveType: '트레이드',
      fromTeamId: prevTeamId,
    });
  }

  p.militaryStatus = p.category !== '국내' ? '해당 없음' : draft.militaryStatus;
  p.militaryChangedInGame = true;
  p.militaryDischargeDate = draft.militaryDischargeDate || undefined;
  if (isMilitaryServing(p.militaryStatus)) {
    p.rosterTier = '대기';
    p.militaryEnlistDate = p.militaryEnlistDate ?? dateIso;
    p.militaryEnlistedSeason = p.militaryEnlistedSeason ?? next.season;
    p.militaryReturnSeason = draft.militaryDischargeDate
      ? Number(draft.militaryDischargeDate.slice(0, 4))
      : next.season + 2;
    p.militaryNote = `에디터 군 복무 설정 (${p.militaryDischargeDate ? `${p.militaryDischargeDate} 전역 예정` : '군보류'})`;
  } else {
    p.rosterTier = draft.rosterTier;
    if (p.militaryStatus === '군필' && !p.militaryNote) {
      p.militaryNote = '에디터 병역 필 설정';
    }
  }

  const totalVal = Number((draft.annualSalary * draft.years + draft.signingBonus).toFixed(2));
  p.contract = {
    ...p.contract,
    annualSalary: Number(draft.annualSalary.toFixed(2)),
    signingBonus: Number(draft.signingBonus.toFixed(2)),
    years: Math.round(draft.years),
    yearsRemaining: Math.round(draft.yearsRemaining),
    totalValue: totalVal,
    isFAEligible: draft.isFAEligible,
    faGrade: draft.faGrade === '' ? null : draft.faGrade,
    status: p.rosterTier === 'FA' ? 'FA' : '확정',
  };
  if (p.rosterTier === 'FA') {
    p.formerTeamId = p.formerTeamId ?? prevTeamId;
  }

  if (draft.hasInjury) {
    const days = clamp(Math.round(draft.injuryDaysRemaining), 1, 365);
    const inj: InjuryRecord = {
      id: p.injury?.id ?? `inj-ed-${Date.now()}`,
      playerId: p.id,
      playerName: p.name,
      teamId: p.teamId,
      description: draft.injuryDescription.trim() || '부상 치료 중',
      severity: draft.injurySeverity,
      daysTotal: Math.max(days, p.injury?.daysTotal ?? days),
      daysRemaining: days,
      occurredRound: next.gamesPlayed,
      occurredDate: dateIso,
      rehabProgress: 0,
      medicalClearance: '재활중',
    };
    p.injury = inj;
  } else {
    p.injury = null;
  }

  p.fatigue = clamp(Math.round(draft.fatigue), 0, 100);
  p.form = clamp(Math.round(draft.form), -5, 5);
  p.morale = draft.morale;
  p.dissatisfaction = clamp(Math.round(draft.dissatisfaction), 0, 100);
  p.hiddenTrait = draft.hiddenTrait === '' ? undefined : draft.hiddenTrait;

  syncPlayerToTeamOrdersInPlace(next, p, prevTeamId);
  enforceOvrPotInvariantInPlace(next.players);
  syncAllAgesToDateInPlace(next);

  const logEntry: EditorChangeLogEntry = {
    id: `ed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    mode,
    targetType: 'PLAYER',
    targetId: p.id,
    targetLabel: `${KBO_TEAMS[p.teamId].shortName} ${p.name} (${p.position})`,
    summary: `${p.name} 수정 (${check.diffs.length}개 항목: ${check.diffs.slice(0, 3).map((d) => d.label).join(', ')}${check.diffs.length > 3 ? ' 외' : ''})`,
    diffs: check.diffs,
    prevSnapshot,
  };
  next.editorHistory = [logEntry, ...(next.editorHistory ?? [])].slice(0, 120);
  next.updatedAt = new Date().toISOString();

  return { nextCareer: next, logEntry };
}

export function validateNewPlayerForm(
  career: CareerSave,
  form: NewPlayerEditorForm
): { valid: boolean; errors: string[]; diffs: EditorFieldDiff[] } {
  const errors: string[] = [];
  const trimmedName = form.name.trim();
  if (!trimmedName) errors.push('선수 이름을 입력해 주세요.');
  if (form.birthDate && !parseIsoDate(form.birthDate)) {
    errors.push('생년월일 형식은 YYYY-MM-DD 여야 합니다.');
  }
  if (form.ability < 1 || form.ability > 99) errors.push('오버롤은 1~99 범위여야 합니다.');
  if (form.potential < 1 || form.potential > 99) errors.push('포텐셜은 1~99 범위여야 합니다.');
  if (form.ability > form.potential) errors.push('오버롤(OVR)은 포텐셜(POT)을 초과할 수 없습니다.');
  const minSal = getKboMinSalaryBillion(career.season);
  if (form.annualSalary < minSal && form.rosterTier !== 'FA' && form.rosterTier !== '은퇴') {
    errors.push(`${career.season}시즌 최저 연봉(${minSal}억 원) 이상으로 입력해 주세요.`);
  }
  if (form.years < 1 || form.years > 12) errors.push('계약 기간은 1~12년 범위여야 합니다.');

  const normName = trimmedName.replace(/\s+/g, '');
  const dup = Object.values(career.players).find(
    (other) =>
      other.rosterTier !== '은퇴' &&
      other.name.replace(/\s+/g, '') === normName &&
      ((form.birthDate && other.birthDate === form.birthDate) || other.teamId === form.teamId)
  );
  if (dup) {
    errors.push(`이미 동일 선수(${KBO_TEAMS[dup.teamId].shortName} ${dup.name})가 등록되어 있습니다.`);
  }

  const diffs: EditorFieldDiff[] = [
    { field: 'name', label: '신규 선수명', before: '미등록', after: trimmedName || '-' },
    { field: 'teamId', label: '소속 구단', before: '-', after: `${KBO_TEAMS[form.teamId].name} (${form.rosterTier})` },
    {
      field: 'position',
      label: '포지션 · 보직',
      before: '-',
      after: form.role === '투수' ? `${form.position} (${form.pitchRole})` : `${form.position}${form.secondaryPositions.length ? ` / 보조: ${form.secondaryPositions.join(',')}` : ''}`,
    },
    { field: 'ratings', label: '능력치 (OVR/POT)', before: '-', after: `${form.ability} / ${form.potential}` },
    { field: 'military', label: '병역 상태', before: '-', after: form.category !== '국내' ? '해당 없음' : form.militaryStatus },
    { field: 'contract', label: '계약 조건', before: '-', after: `${form.years}년 연봉 ${form.annualSalary.toFixed(2)}억` },
  ];

  return { valid: errors.length === 0, errors, diffs };
}

export function createNewPlayerInCareer(
  career: CareerSave,
  form: NewPlayerEditorForm,
  mode: 'PREGAME' | 'INGAME'
): { nextCareer: CareerSave; createdPlayer: Player; logEntry: EditorChangeLogEntry } {
  const check = validateNewPlayerForm(career, form);
  if (!check.valid) throw new Error(check.errors.join('\n'));

  const next = cloneObj(career);
  const dateIso = getCurrentCareerDate(next).isoDate;
  const pid = `ed-custom-${form.teamId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const birthDate = form.birthDate && parseIsoDate(form.birthDate) ? form.birthDate : null;
  const birthYear = birthDate ? Number(birthDate.slice(0, 4)) : next.season - 22;
  const age = birthDate ? (calculateKoreanFullAge(birthDate, dateIso) ?? 22) : 22;
  const milStatus: MilitaryStatus = form.category !== '국내' ? '해당 없음' : form.militaryStatus;
  const serving = isMilitaryServing(milStatus);
  const rosterTier: RosterTier = serving ? '대기' : form.rosterTier;

  const newPlayer: Player = {
    id: pid,
    originType: 'real',
    permanentId: `KBO-CUSTOM-${pid}`,
    name: form.name.trim(),
    teamId: form.teamId,
    formerTeamId: rosterTier === 'FA' ? form.teamId : undefined,
    category: form.category,
    role: form.role,
    position: form.position,
    pitchRole: form.role === '투수' ? form.pitchRole : undefined,
    secondaryPositions:
      form.role === '타자'
        ? Array.from(new Set(form.secondaryPositions.filter((s) => s !== form.position)))
        : undefined,
    age,
    birthYear,
    birthDate,
    heightCm: form.heightCm === '' ? null : Math.round(Number(form.heightCm)),
    weightKg: form.weightKg === '' ? null : Math.round(Number(form.weightKg)),
    throws: form.throws,
    bats: form.bats,
    school: form.school.trim() || null,
    nationality: form.nationality.trim() || (form.category === '국내' ? '한국' : '미국'),
    uniformNumber: form.uniformNumber === '' ? undefined : Math.round(Number(form.uniformNumber)),
    ability: clamp(Math.round(form.ability), 1, 99),
    potential: clamp(Math.max(Math.round(form.ability), Math.round(form.potential)), 1, 99),
    abilityStatus: '확정',
    form: 0,
    fatigue: 0,
    lastPitchedRound: 0,
    consecutiveAppearances: 0,
    rosterTier,
    gameDayActive: rosterTier === '1군',
    militaryStatus: milStatus,
    militaryChangedInGame: true,
    militaryNote: serving ? '에디터 신규 생성 (군 복무 중)' : `에디터 신규 생성 (${milStatus})`,
    contract: {
      status: rosterTier === 'FA' ? 'FA' : '확정',
      currency: 'KRW',
      years: Math.round(form.years),
      yearsRemaining: Math.round(form.years),
      annualSalary: Number(form.annualSalary.toFixed(2)),
      signingBonus: 0,
      totalValue: Number((form.annualSalary * form.years).toFixed(2)),
      startSeason: next.season,
      endSeason: next.season + Math.round(form.years) - 1,
      isFAEligible: false,
      faGrade: null,
      note: '단장 에디터 신규 생성 선수',
    },
    injury: null,
    morale: '보통',
    dissatisfaction: 0,
    trainingFocus: null,
    serviceYears: 1,
    clubTenureSeasons: 1,
    seasonRatingDelta: 0,
    lastEvaluatedAtTeamGames: next.gamesPlayed,
    hiddenTrait: form.hiddenTrait === '' ? undefined : form.hiddenTrait,
    stats: form.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
    postseasonStats: form.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
    v18Ratings: {
      overall: clamp(Math.round(form.ability), 1, 99),
      potential: clamp(Math.max(Math.round(form.ability), Math.round(form.potential)), 1, 99),
      batting:
        form.role === '타자'
          ? {
              contact: clamp(Math.round(form.contactProxy), 1, 99),
              power: clamp(Math.round(form.powerProxy), 1, 99),
              discipline: clamp(Math.round(form.eyeProxy), 1, 99),
              avoid_k: clamp(Math.round(form.contactProxy), 1, 99),
              steal_production: clamp(Math.round(form.speedProxy), 1, 99),
              availability: 72,
              fielding: clamp(Math.round(form.defenseProxy), 1, 99),
              arm: clamp(Math.round(form.defenseProxy), 1, 99),
              speed: clamp(Math.round(form.speedProxy), 1, 99),
              injury_resistance: 70,
              overall_offense: clamp(Math.round(form.ability), 1, 99),
            }
          : null,
      pitching:
        form.role === '투수'
          ? {
              stuff: clamp(Math.round(form.stuffProxy), 1, 99),
              control: clamp(Math.round(form.controlProxy), 1, 99),
              hr_prevention: clamp(Math.round(form.movementProxy), 1, 99),
              stamina_proxy: clamp(Math.round(form.staminaProxy), 1, 99),
              run_prevention: clamp(Math.round(form.ability), 1, 99),
              traffic_control: clamp(Math.round(form.controlProxy), 1, 99),
              clutch: clamp(Math.round(form.ability), 1, 99),
              injury_resistance: 70,
              overall_pitching: clamp(Math.round(form.ability), 1, 99),
            }
          : null,
    },
    careerTeamHistory: [
      {
        teamId: form.teamId,
        teamLabel: KBO_TEAMS[form.teamId].shortName,
        fromSeason: next.season,
        toSeason: next.season,
        moveType: '신인 드래프트',
        transferDate: dateIso,
        note: '단장 에디터 신규 등록',
      },
    ],
    dataVerification: {
      verifiedAt: dateIso,
      bioSource: '단장 에디터 직접 생성',
    },
  };

  if (newPlayer.role === '타자') {
    ensurePlayerPositionProficiencyInPlace(newPlayer);
  }
  ensurePlayerOotpRatingsInPlace(newPlayer);
  newPlayer.originType = 'virtual';

  next.players[newPlayer.id] = newPlayer;
  if (!next.editorOriginals) next.editorOriginals = {};
  if (!next.editorOriginals.players) next.editorOriginals.players = {};
  next.editorOriginals.players[newPlayer.id] = null; // null = created by editor

  syncPlayerToTeamOrdersInPlace(next, newPlayer, newPlayer.teamId);
  enforceOvrPotInvariantInPlace(next.players);

  const logEntry: EditorChangeLogEntry = {
    id: `ed-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    mode,
    targetType: 'NEW_PLAYER',
    targetId: newPlayer.id,
    targetLabel: `${KBO_TEAMS[newPlayer.teamId].shortName} ${newPlayer.name} (${newPlayer.position})`,
    summary: `신규 선수 생성: ${KBO_TEAMS[newPlayer.teamId].shortName} ${newPlayer.name} (${newPlayer.position} · OVR ${newPlayer.ability}/${newPlayer.potential})`,
    diffs: check.diffs,
    prevSnapshot: null,
  };
  next.editorHistory = [logEntry, ...(next.editorHistory ?? [])].slice(0, 120);
  next.updatedAt = new Date().toISOString();

  return { nextCareer: next, createdPlayer: newPlayer, logEntry };
}

export function applyOverseasEditToCareer(
  career: CareerSave,
  draft: OverseasEditorDraft,
  mode: 'PREGAME' | 'INGAME'
): { nextCareer: CareerSave; logEntry: EditorChangeLogEntry; updatedOverseas: OverseasPlayerRecord } {
  const list = career.amateurAndOverseas?.overseasPlayers ?? [];
  const origIdx = list.findIndex((o) => o.permanentId === draft.permanentId);
  if (origIdx < 0) throw new Error('대상 해외 진출 선수를 찾을 수 없습니다.');
  const orig = list[origIdx];

  if (!draft.name.trim()) throw new Error('선수 이름을 입력해 주세요.');
  if (draft.ability < 1 || draft.ability > 99 || draft.potential < 1 || draft.potential > 99) {
    throw new Error('오버롤과 포텐셜은 1~99 범위여야 합니다.');
  }
  if (draft.ability > draft.potential) throw new Error('오버롤은 포텐셜보다 클 수 없습니다.');

  const diffs: EditorFieldDiff[] = [];
  const push = (field: string, label: string, b: unknown, a: unknown) => {
    const bs = b === undefined || b === null || b === '' ? '없음' : String(b);
    const as = a === undefined || a === null || a === '' ? '없음' : String(a);
    if (bs !== as) diffs.push({ field, label, before: bs, after: as });
  };
  push('name', '이름', orig.name, draft.name.trim());
  push('league', '해외 리그', orig.league, draft.league);
  push('clubName', '해외 소속팀', orig.clubName, draft.clubName.trim());
  push('position', '포지션', orig.position, draft.position);
  push('ability', '오버롤', orig.ability, draft.ability);
  push('potential', '포텐셜', orig.potential, draft.potential);
  push('originalKboTeamId', 'KBO 원소속', orig.originalKboTeamId ?? '없음', draft.originalKboTeamId || '없음');
  push('militaryStatus', '병역 상태', orig.militaryStatus ?? '미확인', draft.militaryStatus);
  push(
    'returnRestrictionActive',
    '제107조 2년 제한',
    orig.returnRestrictionActive ? '적용 중' : '해제',
    draft.returnRestrictionActive ? '적용 중' : '해제'
  );
  if (diffs.length === 0) throw new Error('변경된 항목이 없습니다.');

  const next = cloneObj(career);
  if (!next.editorOriginals) next.editorOriginals = {};
  if (!next.editorOriginals.overseas) next.editorOriginals.overseas = {};
  if (!next.editorOriginals.overseas[orig.permanentId]) {
    next.editorOriginals.overseas[orig.permanentId] = cloneObj(orig);
  }

  const target = next.amateurAndOverseas!.overseasPlayers[origIdx];
  target.name = draft.name.trim();
  target.birthDate = draft.birthDate && parseIsoDate(draft.birthDate) ? draft.birthDate : target.birthDate;
  if (target.birthDate) target.birthYear = Number(target.birthDate.slice(0, 4));
  target.age = clamp(Math.round(draft.age), 17, 46);
  target.role = draft.role;
  target.position = draft.position;
  target.ability = clamp(Math.round(draft.ability), 1, 99);
  target.potential = clamp(Math.max(target.ability, Math.round(draft.potential)), 1, 99);
  target.league = draft.league;
  target.clubName = draft.clubName.trim() || target.clubName;
  target.originalKboTeamId = draft.originalKboTeamId === '' ? null : draft.originalKboTeamId;
  target.annualSalaryUsdThousands = Math.max(0, Math.round(draft.annualSalaryUsdThousands));
  target.contractYearsRemaining = Math.max(0, Math.round(draft.contractYearsRemaining));
  target.militaryStatus =
    draft.militaryStatus === '복무 중' || draft.militaryStatus === '상무복무'
      ? '복무중'
      : draft.militaryStatus === '군필' || draft.militaryStatus === '미필' || draft.militaryStatus === '면제'
      ? draft.militaryStatus
      : undefined;
  target.returnRestrictionActive = draft.returnRestrictionActive;

  const logEntry: EditorChangeLogEntry = {
    id: `ed-ov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    mode,
    targetType: 'OVERSEAS',
    targetId: target.permanentId,
    targetLabel: `[해외] ${target.name} (${target.league})`,
    summary: `해외 진출 선수 수정: ${target.name} (${diffs.length}개 항목)`,
    diffs,
    prevSnapshot: cloneObj(orig),
  };
  next.editorHistory = [logEntry, ...(next.editorHistory ?? [])].slice(0, 120);
  next.updatedAt = new Date().toISOString();

  return { nextCareer: next, logEntry, updatedOverseas: cloneObj(target) };
}

export function diffClubFinancesDraft(
  career: CareerSave,
  draft: ClubFinancesEditorDraft
): { valid: boolean; errors: string[]; diffs: EditorFieldDiff[] } {
  const errors: string[] = [];
  if (!Number.isFinite(draft.cashBalanceBillion) || draft.cashBalanceBillion < -500 || draft.cashBalanceBillion > 5000) {
    errors.push('보유 현금은 -500억 ~ 5,000억 범위여야 합니다.');
  }
  if (!Number.isFinite(draft.ownerBudgetCapBillion) || draft.ownerBudgetCapBillion < 30 || draft.ownerBudgetCapBillion > 1000) {
    errors.push('구단주 예산 상한은 30억 ~ 1,000억 범위여야 합니다.');
  }
  if (draft.krwUnpaidBillion < 0 || draft.usdUnpaid < 0) {
    errors.push('미지급 채무는 0 이상이어야 합니다.');
  }
  const facKeys: (keyof ClubInvestments)[] = [
    'stadiumLevel',
    'academyLevel',
    'marketingLevel',
    'medicalLevel',
  ];
  for (const k of facKeys) {
    const lv = draft.investments[k];
    if (lv < 1 || lv > 5) errors.push('구단 시설 레벨은 1~5 범위여야 합니다.');
  }

  const f = career.finances;
  const curInv = f.investments ?? DEFAULT_INVESTMENTS;
  const diffs: EditorFieldDiff[] = [];
  const push = (field: string, label: string, b: unknown, a: unknown) => {
    if (String(b) !== String(a)) diffs.push({ field, label, before: String(b), after: String(a) });
  };
  push('cashBalanceBillion', '구단 보유 현금', `${(f.cashBalanceBillion ?? 0).toFixed(1)}억`, `${draft.cashBalanceBillion.toFixed(1)}억`);
  push(
    'ownerBudgetCapBillion',
    '구단주 예산 상한',
    `${(f.ownerBudgetCapBillion ?? 150).toFixed(1)}억`,
    `${draft.ownerBudgetCapBillion.toFixed(1)}억`
  );
  push('ticketPricePolicy', '티켓 가격 정책', f.ticketPricePolicy ?? '표준', draft.ticketPricePolicy);
  push('krwUnpaidBillion', '원화 미지급금', `${(f.krwUnpaidBillion ?? 0).toFixed(1)}억`, `${draft.krwUnpaidBillion.toFixed(1)}억`);
  push('stadiumLevel', '구장 시설 Lv', curInv.stadiumLevel, draft.investments.stadiumLevel);
  push('academyLevel', '육성 아카데미 Lv', curInv.academyLevel, draft.investments.academyLevel);
  push('marketingLevel', '마케팅 Lv', curInv.marketingLevel, draft.investments.marketingLevel);
  push('medicalLevel', '메디컬 Lv', curInv.medicalLevel, draft.investments.medicalLevel);

  return { valid: errors.length === 0, errors, diffs };
}

export function applyClubFinancesEditToCareer(
  career: CareerSave,
  draft: ClubFinancesEditorDraft,
  mode: 'PREGAME' | 'INGAME'
): { nextCareer: CareerSave; logEntry: EditorChangeLogEntry } {
  const check = diffClubFinancesDraft(career, draft);
  if (!check.valid) throw new Error(check.errors.join('\n'));
  if (check.diffs.length === 0) throw new Error('변경된 구단 재정·예산 항목이 없습니다.');

  const next = cloneObj(career);
  if (!next.editorOriginals) next.editorOriginals = {};
  if (!next.editorOriginals.finances) {
    next.editorOriginals.finances = cloneObj(career.finances);
  }
  const prevFinances = cloneObj(career.finances);

  next.finances.cashBalanceBillion = Number(draft.cashBalanceBillion.toFixed(2));
  next.finances.ownerBudgetCapBillion = Number(draft.ownerBudgetCapBillion.toFixed(1));
  next.finances.ticketPricePolicy = draft.ticketPricePolicy;
  next.finances.krwUnpaidBillion = Number(draft.krwUnpaidBillion.toFixed(2));
  next.finances.usdUnpaid = Math.round(draft.usdUnpaid);
  next.finances.investments = { ...draft.investments };
  if (next.finances.cashBalanceBillion > 0) {
    next.finances.spendingFrozenReason = null;
  }

  const logEntry: EditorChangeLogEntry = {
    id: `ed-fin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    mode,
    targetType: 'FINANCES',
    targetId: draft.teamId,
    targetLabel: `${KBO_TEAMS[draft.teamId].name} 재정 · 예산`,
    summary: `${KBO_TEAMS[draft.teamId].shortName} 재정·예산 수정 (${check.diffs.length}개 항목)`,
    diffs: check.diffs,
    prevSnapshot: prevFinances,
  };
  next.editorHistory = [logEntry, ...(next.editorHistory ?? [])].slice(0, 120);
  next.updatedAt = new Date().toISOString();

  return { nextCareer: next, logEntry };
}

/** 직전 에디터 변경 1건 취소 (Undo) */
export function undoLastEditorChangeInCareer(career: CareerSave): {
  nextCareer: CareerSave;
  undoneEntry: EditorChangeLogEntry;
} {
  const hist = career.editorHistory ?? [];
  if (hist.length === 0) throw new Error('취소할 에디터 수정 내역이 없습니다.');

  const latest = hist[0];
  const next = cloneObj(career);
  next.editorHistory = hist.slice(1);

  if (latest.targetType === 'NEW_PLAYER') {
    const target = next.players[latest.targetId];
    if (target) {
      removePlayerFromTeamOrders(next, target.teamId, target.id);
      delete next.players[latest.targetId];
    }
    if (next.editorOriginals?.players) {
      delete next.editorOriginals.players[latest.targetId];
    }
  } else if (latest.targetType === 'PLAYER' && latest.prevSnapshot) {
    const prevPlayer = cloneObj(latest.prevSnapshot as Player);
    const curPlayer = next.players[latest.targetId];
    if (curPlayer && curPlayer.teamId !== prevPlayer.teamId) {
      removePlayerFromTeamOrders(next, curPlayer.teamId, curPlayer.id);
    }
    next.players[prevPlayer.id] = prevPlayer;
    syncPlayerToTeamOrdersInPlace(next, prevPlayer, curPlayer?.teamId ?? prevPlayer.teamId);
    const stillTouched = next.editorHistory.some(
      (h) => (h.targetType === 'PLAYER' || h.targetType === 'NEW_PLAYER') && h.targetId === latest.targetId
    );
    if (!stillTouched && next.editorOriginals?.players) {
      delete next.editorOriginals.players[latest.targetId];
    }
  } else if (latest.targetType === 'OVERSEAS' && latest.prevSnapshot && next.amateurAndOverseas) {
    const prevOv = cloneObj(latest.prevSnapshot as OverseasPlayerRecord);
    const idx = next.amateurAndOverseas.overseasPlayers.findIndex(
      (o) => o.permanentId === prevOv.permanentId
    );
    if (idx >= 0) next.amateurAndOverseas.overseasPlayers[idx] = prevOv;
    const stillTouched = next.editorHistory.some(
      (h) => h.targetType === 'OVERSEAS' && h.targetId === latest.targetId
    );
    if (!stillTouched && next.editorOriginals?.overseas) {
      delete next.editorOriginals.overseas[latest.targetId];
    }
  } else if (latest.targetType === 'FINANCES' && latest.prevSnapshot) {
    next.finances = cloneObj(latest.prevSnapshot as CareerSave['finances']);
    const stillTouched = next.editorHistory.some((h) => h.targetType === 'FINANCES');
    if (!stillTouched && next.editorOriginals) {
      delete next.editorOriginals.finances;
    }
  }

  enforceOvrPotInvariantInPlace(next.players);
  next.updatedAt = new Date().toISOString();
  return { nextCareer: next, undoneEntry: latest };
}

/** 특정 선수 1명을 에디터 최초 수정 전 원본으로 복구 */
export function restoreSinglePlayerOriginalInCareer(
  career: CareerSave,
  playerId: string
): CareerSave {
  const origMap = career.editorOriginals?.players;
  if (!origMap || !(playerId in origMap)) {
    throw new Error('이 선수는 에디터로 수정된 이력이 없습니다.');
  }
  const next = cloneObj(career);
  const orig = origMap[playerId];
  const cur = next.players[playerId];
  if (orig === null) {
    if (cur) removePlayerFromTeamOrders(next, cur.teamId, cur.id);
    delete next.players[playerId];
  } else {
    if (cur && cur.teamId !== orig.teamId) {
      removePlayerFromTeamOrders(next, cur.teamId, cur.id);
    }
    next.players[playerId] = cloneObj(orig);
    syncPlayerToTeamOrdersInPlace(next, next.players[playerId], cur?.teamId ?? orig.teamId);
  }
  delete next.editorOriginals!.players![playerId];
  next.editorHistory = (next.editorHistory ?? []).filter((e) => e.targetId !== playerId);
  next.updatedAt = new Date().toISOString();
  return next;
}

/** 인게임 에디터로 수정한 모든 선수·해외파·재정을 최초 원본 상태로 일괄 복구 */
export function restoreAllEditorOriginalsInCareer(career: CareerSave): CareerSave {
  const origs = career.editorOriginals;
  if (!origs) throw new Error('복구할 에디터 원본 데이터가 없습니다.');
  const next = cloneObj(career);

  if (origs.players) {
    for (const [pid, origPl] of Object.entries(origs.players)) {
      const cur = next.players[pid];
      if (origPl === null) {
        if (cur) removePlayerFromTeamOrders(next, cur.teamId, pid);
        delete next.players[pid];
      } else {
        if (cur && cur.teamId !== origPl.teamId) {
          removePlayerFromTeamOrders(next, cur.teamId, pid);
        }
        next.players[pid] = cloneObj(origPl);
        syncPlayerToTeamOrdersInPlace(next, next.players[pid], cur?.teamId ?? origPl.teamId);
      }
    }
  }
  if (origs.overseas && next.amateurAndOverseas) {
    for (const [permId, origOv] of Object.entries(origs.overseas)) {
      const idx = next.amateurAndOverseas.overseasPlayers.findIndex((o) => o.permanentId === permId);
      if (idx >= 0) next.amateurAndOverseas.overseasPlayers[idx] = cloneObj(origOv);
    }
  }
  if (origs.finances) {
    next.finances = cloneObj(origs.finances);
  }

  next.editorOriginals = {};
  next.editorHistory = [];
  enforceOvrPotInvariantInPlace(next.players);
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * 프리게임 에디터 수정 사항을 '새 게임 생성' 초기 데이터에만 적용합니다.
 * (기존 세이브 데이터는 절대 변경하지 않음)
 */
export function applyPreGameEditorStoreToNewCareerInPlace(
  career: CareerSave,
  store: PreGameEditorStore
): number {
  let appliedCount = 0;

  // 1) 기존 선수 수정 오버라이드 적용
  for (const [pid, patched] of Object.entries(store.playerPatches ?? {})) {
    if (!patched) continue;
    const existing = career.players[pid];
    if (!existing) continue;
    const prevTeam = existing.teamId;
    career.players[pid] = cloneObj(patched);
    syncPlayerToTeamOrdersInPlace(career, career.players[pid], prevTeam);
    appliedCount += 1;
  }

  // 2) 프리게임 신규 생성 선수 추가 (중복 방지)
  for (const created of store.createdPlayers ?? []) {
    if (!created) continue;
    const dup = Object.values(career.players).some(
      (p) =>
        p.id === created.id ||
        (p.name.replace(/\s+/g, '') === created.name.replace(/\s+/g, '') &&
          p.teamId === created.teamId &&
          p.birthDate &&
          created.birthDate &&
          p.birthDate === created.birthDate)
    );
    if (dup) continue;
    career.players[created.id] = cloneObj(created);
    syncPlayerToTeamOrdersInPlace(career, career.players[created.id], created.teamId);
    appliedCount += 1;
  }

  // 3) 해외 진출 선수 수정 적용
  if (career.amateurAndOverseas) {
    for (const [permId, patchedOv] of Object.entries(store.overseasPatches ?? {})) {
      const idx = career.amateurAndOverseas.overseasPlayers.findIndex(
        (o) => o.permanentId === permId
      );
      if (idx >= 0) {
        career.amateurAndOverseas.overseasPlayers[idx] = cloneObj(patchedOv);
        appliedCount += 1;
      }
    }
  }

  // 4) 선택한 구단의 초기 자금 · 예산 상한 · 시설 레벨 적용
  const tid = career.playerTeamId;
  if (typeof store.clubCashOverrides?.[tid] === 'number') {
    career.finances.cashBalanceBillion = Number(store.clubCashOverrides[tid]!.toFixed(2));
    career.finances.startingCashBillion = career.finances.cashBalanceBillion;
    appliedCount += 1;
  }
  if (typeof store.clubBudgetCapOverrides?.[tid] === 'number') {
    career.finances.ownerBudgetCapBillion = Number(store.clubBudgetCapOverrides[tid]!.toFixed(1));
    appliedCount += 1;
  }
  if (store.clubFacilityOverrides?.[tid]) {
    career.finances.investments = {
      ...(career.finances.investments ?? DEFAULT_INVESTMENTS),
      ...store.clubFacilityOverrides[tid],
    };
    appliedCount += 1;
  }

  if (appliedCount > 0) {
    enforceOvrPotInvariantInPlace(career.players);
    syncAllAgesToDateInPlace(career);
    // Ensure 10-team orders remain clean without duplicates
    for (const t of TEAM_IDS) {
      const ts = career.teams[t];
      if (!ts) continue;
      ts.lineupOrder = Array.from(new Set(ts.lineupOrder)).filter((id) => career.players[id]?.teamId === t);
      ts.benchOrder = Array.from(new Set(ts.benchOrder)).filter((id) => career.players[id]?.teamId === t);
      ts.rotationOrder = Array.from(new Set(ts.rotationOrder)).filter((id) => career.players[id]?.teamId === t);
      ts.bullpenOrder = Array.from(new Set(ts.bullpenOrder)).filter((id) => career.players[id]?.teamId === t);
    }
  }

  return appliedCount;
}
