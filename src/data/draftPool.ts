import { SeededRng } from '../engine/rng';
import { DraftCandidate, DraftState, Position, TeamId } from '../types/kbo';
import { DRAFT_ORDER_2026, INITIAL_VIRTUAL_DRAFT_ORDER_2028 } from './kboTeams';

export interface ConfirmedHanwhaRookieRaw {
  pickNotation: string;
  round: number;
  pickInRound: number;
  draftId: number;
  name: string;
  age: number;
  originType: '고졸' | '대학' | '독립리그';
  school: string;
  role: '투수' | '타자';
  position: Position;
  ability: number;
  potential: number;
  signingBonusBillion: number;
  amateurSummary: string;
}

// 마스터 v4.58 확정 한화 신인 11명 (ID, 학교, 나이, 능력, 잠재, 계약금 절대 불변)
export const CONFIRMED_HANWHA_ROOKIES: ConfirmedHanwhaRookieRaw[] = [
  {
    pickNotation: '1R 9순위',
    round: 1,
    pickInRound: 9,
    draftId: 6,
    name: '김우진',
    age: 19,
    originType: '고졸',
    school: '서울고',
    role: '투수',
    position: 'SP',
    ability: 56,
    potential: 91,
    signingBonusBillion: 3.2,
    amateurSummary: '18경기 8승3패 ERA 2.18, 72.1IP 91K, 최고 148km/h (가상 기록)',
  },
  {
    pickNotation: '2R 9순위',
    round: 2,
    pickInRound: 9,
    draftId: 19,
    name: '이재원',
    age: 19,
    originType: '고졸',
    school: '경북고',
    role: '투수',
    position: 'RP',
    ability: 53,
    potential: 86,
    signingBonusBillion: 2.0,
    amateurSummary: '21경기 3승2패 5SV 4HLD ERA 2.76, 29.1IP 39K 12BB WHIP 1.23, 최고 146km/h (가상 기록)',
  },
  {
    pickNotation: '3R 9순위',
    round: 3,
    pickInRound: 9,
    draftId: 69,
    name: '조재원',
    age: 19,
    originType: '고졸',
    school: '장충고',
    role: '타자',
    position: 'CF',
    ability: 47,
    potential: 88,
    signingBonusBillion: 1.5,
    amateurSummary: '30G AVG .321, 35H, 4HR, 24RBI, 19SB, OBP .410 SLG .463 OPS .873 (가상 기록)',
  },
  {
    pickNotation: '4R 9순위',
    round: 4,
    pickInRound: 9,
    draftId: 67,
    name: '조현준',
    age: 19,
    originType: '고졸',
    school: '충암고',
    role: '타자',
    position: 'SS',
    ability: 46,
    potential: 87,
    signingBonusBillion: 1.2,
    amateurSummary: '31G AVG .296, 34H, 3HR, 22RBI, 16SB, OBP .375 SLG .420 OPS .795 (가상 기록)',
  },
  {
    pickNotation: '5R 9순위',
    round: 5,
    pickInRound: 9,
    draftId: 147,
    name: '권현준',
    age: 23,
    originType: '독립리그',
    school: '연천 미라클(독립)',
    role: '타자',
    position: 'LF',
    ability: 40,
    potential: 80,
    signingBonusBillion: 0.6,
    amateurSummary: '43G AVG .281, 44H, 2HR, 26RBI, 15SB, OBP .352 SLG .411 OPS .763 (가상 기록)',
  },
  {
    pickNotation: '6R 9순위',
    round: 6,
    pickInRound: 9,
    draftId: 88,
    name: '장지환',
    age: 19,
    originType: '고졸',
    school: '장충고',
    role: '타자',
    position: '3B',
    ability: 47,
    potential: 85,
    signingBonusBillion: 0.7,
    amateurSummary: '고교 주전 3루수 유망주 (세부 수치 미확인 · 가상 기록)',
  },
  {
    pickNotation: '7R 9순위',
    round: 7,
    pickInRound: 9,
    draftId: 92,
    name: '임시우',
    age: 23,
    originType: '대학',
    school: '동국대',
    role: '타자',
    position: 'RF',
    ability: 48,
    potential: 83,
    signingBonusBillion: 0.6,
    amateurSummary: '34G AVG .288, 39H, 5HR, 29RBI, 11SB, OBP .366 SLG .451 OPS .817 (가상 기록)',
  },
  {
    pickNotation: '8R 9순위',
    round: 8,
    pickInRound: 9,
    draftId: 129,
    name: '서재원',
    age: 23,
    originType: '대학',
    school: '한양대',
    role: '타자',
    position: '2B',
    ability: 42,
    potential: 81,
    signingBonusBillion: 0.4,
    amateurSummary: '36G AVG .312, 43H, 3HR, 26RBI, 17SB, OBP .398 SLG .421 OPS .819 (가상 기록)',
  },
  {
    pickNotation: '9R 9순위',
    round: 9,
    pickInRound: 9,
    draftId: 59,
    name: '강재원',
    age: 19,
    originType: '고졸',
    school: '경기고',
    role: '타자',
    position: 'C',
    ability: 51,
    potential: 89,
    signingBonusBillion: 0.7,
    amateurSummary: '고교 상위권 포수 유망주 (세부 수치 미확인 · 가상 기록)',
  },
  {
    pickNotation: '10R 9순위',
    round: 10,
    pickInRound: 9,
    draftId: 116,
    name: '오우진',
    age: 23,
    originType: '대학',
    school: '성균관대',
    role: '타자',
    position: '3B',
    ability: 45,
    potential: 81,
    signingBonusBillion: 0.3,
    amateurSummary: '36G AVG .275, 38H, 4HR, 28RBI, 7SB, OBP .356 SLG .433 OPS .789 (가상 기록)',
  },
  {
    pickNotation: '11R 9순위',
    round: 11,
    pickInRound: 9,
    draftId: 135,
    name: '신민재',
    age: 23,
    originType: '대학',
    school: '경희대',
    role: '타자',
    position: '1B',
    ability: 41,
    potential: 81,
    signingBonusBillion: 0.2,
    amateurSummary: '37G AVG .291, 39H, 6HR, 35RBI, 3SB, OBP .370 SLG .474 OPS .844 (가상 기록)',
  },
];

const HIGH_SCHOOLS = [
  '서울고', '경북고', '장충고', '충암고', '경기고', '덕수고', '휘문고', '광주일고',
  '부산고', '북일고', '마산용마고', '유신고', '성남고', '배명고', '인천고', '대구고',
];
const UNIVERSITIES = [
  '동국대', '한양대', '성균관대', '경희대', '연세대', '고려대', '중앙대', '인하대',
  '동의대', '홍익대', '단국대', '건국대',
];
const INDEP_CLUBS = [
  '연천 미라클(독립)', '파주 챌린저스(독립)', '성남 맥파이스(독립)', '수원 파인이그스(독립)', '가평 웨일스(독립)',
];

const DRAFT_SURNAMES = ['김', '이', '박', '정', '최', '조', '강', '윤', '장', '임', '오', '서', '신', '권', '황', '송'];
const DRAFT_GIVEN_FIRST = ['도', '현', '재', '민', '서', '우', '지', '승', '준', '태', '영', '성', '주', '유', '시', '건'];
const DRAFT_GIVEN_SECOND = ['진', '호', '원', '준', '우', '현', '석', '훈', '혁', '빈', '수', '환', '성', '결', '율', '찬'];

const POSITIONS_POOL: { role: '투수' | '타자'; pos: Position }[] = [
  { role: '투수', pos: 'SP' },
  { role: '투수', pos: 'SP' },
  { role: '투수', pos: 'RP' },
  { role: '투수', pos: 'RP' },
  { role: '타자', pos: 'C' },
  { role: '타자', pos: '1B' },
  { role: '타자', pos: '2B' },
  { role: '타자', pos: '3B' },
  { role: '타자', pos: 'SS' },
  { role: '타자', pos: 'LF' },
  { role: '타자', pos: 'CF' },
  { role: '타자', pos: 'RF' },
];

export function generate150DraftCandidates(seed: number, includeConfirmedHanwha = false): DraftCandidate[] {
  const rng = new SeededRng(seed);
  const confirmedById = new Map<number, ConfirmedHanwhaRookieRaw>();
  if (includeConfirmedHanwha) {
    for (const r of CONFIRMED_HANWHA_ROOKIES) {
      confirmedById.set(r.draftId, r);
    }
  }

  const usedNames = new Set<string>(
    includeConfirmedHanwha ? CONFIRMED_HANWHA_ROOKIES.map((r) => r.name) : []
  );

  const candidates: DraftCandidate[] = [];
  let elite90PotCount = 0;
  for (let id = 1; id <= 150; id++) {
    const fixed = confirmedById.get(id);
    if (fixed) {
      candidates.push({
        id,
        name: `${fixed.name} (신인)`,
        age: fixed.age,
        originType: fixed.originType,
        school: fixed.school,
        role: fixed.role,
        position: fixed.position,
        ability: fixed.ability,
        potential: fixed.potential,
        amateurSummary: fixed.amateurSummary,
        draftedBy: '한화',
        pickNotation: fixed.pickNotation,
        signingBonusBillion: fixed.signingBonusBillion,
      });
      continue;
    }

    const originType: '고졸' | '대학' | '독립리그' =
      id <= 88 ? '고졸' : id <= 132 ? '대학' : '독립리그';

    // 현실적인 신인 나이 다양화: 고졸(18~19), 대학 얼리/졸업(20~24), 독립리그(21~26)
    const age =
      originType === '고졸'
        ? rng.next() < 0.22
          ? 18
          : 19
        : originType === '대학'
        ? rng.next() < 0.25
          ? rng.int(20, 21) // 얼리 드래프트
          : rng.int(22, 24)
        : rng.int(21, 26);

    const school =
      originType === '고졸'
        ? HIGH_SCHOOLS[(id * 3 + rng.int(0, 5)) % HIGH_SCHOOLS.length]
        : originType === '대학'
        ? UNIVERSITIES[(id + rng.int(0, 4)) % UNIVERSITIES.length]
        : INDEP_CLUBS[(id + rng.int(0, 2)) % INDEP_CLUBS.length];

    let baseName = '';
    for (let attempt = 0; attempt < 60; attempt++) {
      const surname = DRAFT_SURNAMES[rng.int(0, DRAFT_SURNAMES.length - 1)];
      const g1 = DRAFT_GIVEN_FIRST[rng.int(0, DRAFT_GIVEN_FIRST.length - 1)];
      const g2 = DRAFT_GIVEN_SECOND[rng.int(0, DRAFT_GIVEN_SECOND.length - 1)];
      // 같은 글자 중복 금지 (예: 김우우, 박준준, 서서진 방지)
      if (g1 === g2 || surname === g1 || surname === g2) continue;
      const candidate = surname + g1 + g2;
      if (!usedNames.has(candidate)) {
        baseName = candidate;
        usedNames.add(candidate);
        break;
      }
    }
    if (!baseName) {
      const fallbackSurnames = ['한', '안', '유', '홍', '문', '양', '배', '백'];
      baseName = `${fallbackSurnames[id % fallbackSurnames.length]}도현`;
    }

    const slot = POSITIONS_POOL[rng.int(0, POSITIONS_POOL.length - 1)];
    // Unified KBO rating scale (identical to existing pros):
    // Unproven rookies OVR 39..57 (never exceeding established 1군 starters 65..77),
    // POT 90+ very rare (max 2 per 150-player draft class, ~1~1.5%).
    const rawRoll = rng.next();
    const tierScore = id <= 12 ? 0.66 + rawRoll * 0.34 : id <= 35 ? 0.35 + rawRoll * 0.45 : rawRoll * 0.68;
    const collegeReadyBoost = originType === '대학' ? 3 : originType === '독립리그' ? 2 : 0;
    const ability = Math.max(39, Math.min(57, Math.round(38 + tierScore * 15 + collegeReadyBoost)));

    let potential: number;
    if (id <= 8 && elite90PotCount < 2 && rng.next() < 0.16) {
      potential = rng.int(90, 92);
      elite90PotCount += 1;
    } else if (id <= 12) {
      potential = rng.int(80, 87);
    } else if (id <= 35) {
      potential = rng.int(73, 81);
    } else {
      potential = Math.round(
        ability + (originType === '고졸' ? 20 : originType === '대학' ? 14 : 11) + rng.next() * 10
      );
      potential = Math.min(78, Math.max(ability + 8, potential));
    }
    potential = Math.max(ability + 6, Math.min(92, potential));

    const composite = potential * 0.62 + ability * 0.38;
    const scoutGrade: DraftCandidate['scoutGrade'] =
      composite >= 74.5
        ? 'S'
        : composite >= 70.5
        ? 'A+'
        : composite >= 66.5
        ? 'A'
        : composite >= 62.5
        ? 'B+'
        : composite >= 58
        ? 'B'
        : 'C';

    const scoutTag =
      scoutGrade === 'S'
        ? slot.role === '투수'
          ? '초특급 에이스감'
          : '초특급 5툴 거포'
        : ability >= 56 && originType !== '고졸'
        ? '즉시전력감'
        : potential >= 88
        ? '최상위 잠재력'
        : slot.role === '투수'
        ? slot.pos === 'SP'
          ? '선발 육성형'
          : '강속구 불펜감'
        : ['C', 'SS', 'CF'].includes(slot.pos)
        ? '센터라인 핵심'
        : '공수 밸런스형';

    // 현실적인 KBO 계약금 분포 (0.2억 ~ 5.2억 원)
    let bonusRaw = 0.2;
    if (scoutGrade === 'S') bonusRaw = 3.2 + rng.next() * 2.0; // 3.2 ~ 5.2억
    else if (scoutGrade === 'A+') bonusRaw = 1.8 + rng.next() * 1.4; // 1.8 ~ 3.2억
    else if (scoutGrade === 'A') bonusRaw = 1.0 + rng.next() * 0.9; // 1.0 ~ 1.9억
    else if (scoutGrade === 'B+') bonusRaw = 0.6 + rng.next() * 0.5; // 0.6 ~ 1.1억
    else if (scoutGrade === 'B') bonusRaw = 0.3 + rng.next() * 0.4; // 0.3 ~ 0.7억
    else bonusRaw = 0.2 + rng.next() * 0.2; // 0.2 ~ 0.4억
    const bonus = Number(bonusRaw.toFixed(1));

    const amateurSummary =
      slot.role === '투수'
        ? `[가상 신인] ${rng.int(12, 24)}G ERA ${(1.75 + (1 - tierScore) * 2.6).toFixed(2)}, ${rng.int(30, 78)}IP, 최고 ${rng.int(143, 155)}km/h`
        : `[가상 신인] ${rng.int(24, 40)}G AVG .${rng.int(268, 385)}, ${rng.int(1, 11)}HR, ${rng.int(12, 38)}RBI`;

    // Scouting uncertainty: top 12 candidates are well-scouted ('보통'), deeper prospects have wider fog-of-war ('미확인')
    const scoutAccuracy: DraftCandidate['scoutAccuracy'] = id <= 15 ? '보통' : '미확인';
    const errRange = scoutAccuracy === '보통' ? 3 : 7;
    const scoutedAbility = Math.max(35, Math.min(70, ability + rng.int(-errRange, errRange)));
    const scoutedPotential = Math.max(
      scoutedAbility + 6,
      Math.min(96, potential + rng.int(-errRange, errRange))
    );
    const hiddenTraits = [
      '클러치 강심장',
      '성장 가속형',
      '철완 내구성',
      '빠른 1군 적응',
      '대형 거포 잠재',
      '구위 급상승형',
      '안정적 워크에식',
    ];
    const hiddenTrait =
      potential >= 88
        ? hiddenTraits[rng.int(0, 5)]
        : rng.next() < 0.35
        ? hiddenTraits[rng.int(0, hiddenTraits.length - 1)]
        : undefined;

    candidates.push({
      id,
      name: `${baseName}`,
      age,
      originType,
      school,
      role: slot.role,
      position: slot.pos,
      ability,
      potential,
      scoutedAbility,
      scoutedPotential,
      scoutAccuracy,
      hiddenTrait,
      scoutGrade,
      scoutTag,
      amateurSummary,
      signingBonusBillion: bonus,
    });
  }

  return candidates;
}

export interface DraftRecommendationItem {
  candidate: DraftCandidate;
  score: number;
  reason: string;
}

/**
 * Computes top AI scout recommended draft picks balancing BPA (Best Player Available) and club positional needs.
 */
export function getRecommendedDraftCandidates(
  ds: DraftState,
  teamPlayers: { role: '투수' | '타자'; position: Position; age: number; ability: number; rosterTier: string }[],
  limit = 3
): DraftRecommendationItem[] {
  const available = ds.candidates.filter((c) => !c.draftedBy);
  if (available.length === 0) return [];

  const active1st = teamPlayers.filter((p) => p.rosterTier === '1군');
  const spCount = active1st.filter((p) => p.position === 'SP' && p.age <= 30).length;
  const catcherAvg =
    active1st.filter((p) => p.position === 'C').reduce((s, p) => s + p.ability, 0) /
    Math.max(1, active1st.filter((p) => p.position === 'C').length);
  const ssAvg =
    active1st.filter((p) => p.position === 'SS' || p.position === '2B').reduce((s, p) => s + p.ability, 0) /
    Math.max(1, active1st.filter((p) => p.position === 'SS' || p.position === '2B').length);

  const scored = available.map((c) => {
    const bpa = c.potential * 0.65 + c.ability * 0.45 - Math.max(0, c.age - 21) * 0.6;
    let needBonus = 0;
    let reason = `최상위 종합 가치 (${c.scoutGrade ?? 'A'}급 · 잠재 ${c.potential})`;

    if (c.position === 'SP' && spCount < 3) {
      needBonus += 4.2;
      reason = `젊은 선발진 보강 추천 · ${c.originType} ${c.age}세 (잠재 ${c.potential})`;
    } else if (c.position === 'C' && catcherAvg < 76) {
      needBonus += 3.8;
      reason = `안방 포수 유망주 보강 추천 · ${c.school} (${c.ability}/${c.potential})`;
    } else if ((c.position === 'SS' || c.position === '2B') && ssAvg < 76) {
      needBonus += 3.2;
      reason = `센터라인 내야 보강 추천 · ${c.scoutTag ?? c.originType}`;
    } else if (c.ability >= 56 && c.originType !== '고졸') {
      needBonus += 2.0;
      reason = `1군 즉시전력감 (${c.originType} ${c.age}세 · 능력 ${c.ability})`;
    } else if (c.potential >= 90) {
      needBonus += 2.5;
      reason = `초특급 프랜차이즈 잠재력 (${c.potential}) · ${c.school}`;
    }

    return {
      candidate: c,
      score: Number((bpa + needBonus).toFixed(2)),
      reason,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function createCompletedHanwhaDraftState(): DraftState {
  const candidates = generate150DraftCandidates(46001, true);
  const picks = CONFIRMED_HANWHA_ROOKIES.map((r) => ({
    round: r.round,
    pickInRound: r.pickInRound,
    pickNotation: r.pickNotation,
    teamId: '한화' as TeamId,
    candidateId: r.draftId,
    playerName: r.name,
    position: r.position,
    ability: r.ability,
    potential: r.potential,
    signingBonusBillion: r.signingBonusBillion,
  }));

  return {
    season: 2026,
    completed: true,
    currentRound: 11,
    currentPickInRound: 10,
    draftOrder: [...DRAFT_ORDER_2026],
    candidates,
    picks,
  };
}

export function createFreshDraftState(
  season: number,
  seed: number,
  customDraftOrder?: TeamId[]
): DraftState {
  const rng = new SeededRng(seed + 77);
  const order =
    customDraftOrder && customDraftOrder.length === 10
      ? [...customDraftOrder]
      : season >= 2028
        ? [...INITIAL_VIRTUAL_DRAFT_ORDER_2028]
        : [...DRAFT_ORDER_2026];
  const candidates = generate150DraftCandidates(rng.int(1000, 99999), false);

  return {
    season,
    completed: false,
    currentRound: 1,
    currentPickInRound: 1,
    draftOrder: order,
    candidates,
    picks: [],
  };
}
