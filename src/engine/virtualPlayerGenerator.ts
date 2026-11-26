import { Player, Position, TeamId } from '../types/kbo';
import { calculateKoreanFullAge, generateVirtualBirthDate } from './ageEngine';
import { buildBattingProfile, buildHiddenTrait, buildPitchRepertoire, buildPlayerAgent } from './deepFranchise';
import { ensurePlayerOotpRatingsInPlace } from './ootpRatingsEngine';
import { SeededRng } from './rng';
import { emptyBatterStats, emptyPitcherStats } from './stats';

/**
 * 가상 생성 선수 전용 생성기 (실제 KBO 선수 데이터 로더 v18Importer와 완전히 분리).
 * - 모든 가상 생성 선수는 originType: 'virtual' 로 명시 표기됩니다.
 * - 실제 KBO 선수의 누락 필드를 임의 생성하는 데 절대 사용하지 않습니다.
 */

const VIRTUAL_FUTURES_NAMES = [
  '김도윤', '박현서', '이준호', '정시우', '최민성',
  '강우빈', '조윤재', '한서진', '오태양', '신지훈',
];

const VIRTUAL_DEV_NAMES = [
  '서민규', '권태현', '임도겸', '안재원', '윤하늘', '배승우',
];

export function createVirtualFuturesDepthPlayer(params: {
  teamId: TeamId;
  season: number;
  seq: number;
  isPitcher: boolean;
  tier: '2군' | '육성';
}): Player {
  const { teamId, season, seq, isPitcher, tier } = params;
  const isDev = tier === '육성';
  const namePool = isDev ? VIRTUAL_DEV_NAMES : VIRTUAL_FUTURES_NAMES;
  const name = namePool[seq % namePool.length];
  const id = `${isDev ? 'dev-depth' : 'futures-depth'}-${teamId}-${seq}`;
  const targetAge = isDev ? 20 + (seq % 2) : 21 + (seq % 3);
  const birthYear = season - targetAge;
  const virtualRng = new SeededRng(
    season * 1009 + seq * 97 + teamId.charCodeAt(0) * 31 + (isDev ? 7 : 3)
  );
  const birthDate = generateVirtualBirthDate(virtualRng, birthYear);
  const age = calculateKoreanFullAge(birthDate, `${season}-01-01`) ?? targetAge;
  const pos: Position = isPitcher
    ? 'RP'
    : (isDev
        ? (['CF', '2B', 'C', 'SS'][seq % 4] as Position)
        : (['LF', '3B', 'C', '2B', 'RF'][seq % 5] as Position));
  const ability = isDev ? 53 + (seq % 3) : 59 + (seq % 4);
  const potential = isDev ? 68 + (seq % 5) : 70 + (seq % 5);

  const player: Player = {
    id,
    originType: 'virtual',
    name,
    teamId,
    category: '국내',
    role: isPitcher ? '투수' : '타자',
    position: pos,
    pitchRole: isPitcher ? '중간' : undefined,
    age,
    birthYear,
    birthDate,
    heightCm: null,
    weightKg: null,
    bats: null,
    throws: null,
    school: null,
    ability,
    potential,
    abilityStatus: '확정',
    form: 0,
    fatigue: isDev ? 8 : 10,
    lastPitchedRound: -10,
    consecutiveAppearances: 0,
    rosterTier: tier,
    gameDayActive: false,
    contract: {
      status: '확정',
      currency: 'KRW',
      years: 1,
      yearsRemaining: 1,
      annualSalary: season >= 2027 ? 0.33 : 0.3,
      signingBonus: 0,
      totalValue: season >= 2027 ? 0.33 : 0.3,
      note: isDev ? '가상 육성선수 계약' : '가상 2군 퓨처스 보충 등록',
      startSeason: season,
      endSeason: season,
    },
    injury: null,
    morale: '만족',
    trainingFocus: isPitcher ? '제구' : '타격',
    serviceYears: isDev ? 0 : 1,
    seasonRatingDelta: 0,
    lastEvaluatedAtTeamGames: 0,
    stats: isPitcher ? emptyPitcherStats() : emptyBatterStats(),
    postseasonStats: isPitcher ? emptyPitcherStats() : emptyBatterStats(),
    futuresStats: { G: 0, AB: 0, H: 0, HR: 0, RBI: 0, outs: 0, ER: 0, SO: 0, W: 0, L: 0 },
    militaryStatus: '미필',
    militaryNote: '가상 생성 유망주 (미필)',
    nationality: '한국',
    registrationDays: 0,
    acquisitionInfo: isDev
      ? { type: '육성선수', label: `${season} 가상 육성선수 입단` }
      : { type: '드래프트', draftYear: season, label: `${season} 가상 퓨처스 보충` },
  };

  if (player.role === '투수') {
    player.pitchRepertoire = buildPitchRepertoire(player);
  } else {
    player.battingProfile = buildBattingProfile(player);
  }
  player.hiddenTrait = buildHiddenTrait(player);
  player.agent = buildPlayerAgent(player);
  ensurePlayerOotpRatingsInPlace(player);
  return player;
}
