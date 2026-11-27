import { emptyBatterStats, emptyPitcherStats } from '../engine/stats';
import {
  BatterStats,
  CareerBatterStats,
  CareerPitcherStats,
  PitcherStats,
  Player,
  PlayerAcquisitionInfo,
  PlayerContract,
  Position,
  TeamId,
} from '../types/kbo';
import { TEAM_IDS } from './kboTeams';

/**
 * 국적별 국기 이모지 및 표시 유틸
 */
export const NATIONALITY_FLAGS: Record<string, string> = {
  한국: '🇰🇷',
  미국: '🇺🇸',
  베네수엘라: '🇻🇪',
  도미니카: '🇩🇴',
  도미니카공화국: '🇩🇴',
  쿠바: '🇨🇺',
  파나마: '🇵🇦',
  푸에르토리코: '🇵🇷',
  콜롬비아: '🇨🇴',
  멕시코: '🇲🇽',
  캐나다: '🇨🇦',
  호주: '🇦🇺',
  일본: '🇯🇵',
  대만: '🇹🇼',
  네덜란드: '🇳🇱',
};

export function getNationalityDisplay(nationality?: string): { flag: string; label: string } {
  const nat = nationality ?? '한국';
  return {
    flag: NATIONALITY_FLAGS[nat] ?? '🌐',
    label: nat,
  };
}

/**
 * 2026 KBO 10개 구단 실존 외국인·아시아쿼터 선수 국적 매핑
 */
export const REAL_FOREIGN_NATIONALITIES: Record<string, string> = {
  // LG
  '요니 치리노스': '베네수엘라',
  치리노스: '베네수엘라',
  '앤더스 톨허스트': '미국',
  톨허스트: '미국',
  '오스틴 딘': '미국',
  오스틴: '미국',
  '라클란 웰스': '호주',
  웰스: '호주',
  // 한화
  '윌켈 에르난데스': '베네수엘라',
  에르난데스: '베네수엘라',
  '오웬 화이트': '미국',
  페라자: '베네수엘라',
  '요나단 페라자': '베네수엘라',
  왕옌청: '대만',
  '트로이 왓슨': '미국',
  // SSG
  '미치 화이트': '미국',
  화이트: '미국',
  '앤서니 베니지아노': '미국',
  베니지아노: '미국',
  '기예르모 에레디아': '쿠바',
  에레디아: '쿠바',
  '다케다 쇼타': '일본',
  다케다: '일본',
  타케다: '일본',
  // 삼성
  '아리엘 후라도': '파나마',
  후라도: '파나마',
  '잭 오러클린': '호주',
  오러클린: '호주',
  '맷 매닝': '미국',
  매닝: '미국',
  '르윈 디아즈': '도미니카공화국',
  디아즈: '도미니카공화국',
  '미야지 유라': '일본',
  미야지: '일본',
  // NC
  '라일리 톰슨': '미국',
  라일리: '미국',
  '커티스 테일러': '캐나다',
  테일러: '캐나다',
  '맷 데이비슨': '미국',
  데이비슨: '미국',
  '도다 나쓰키': '일본',
  토다: '일본',
  // KT
  '맷 사우어': '미국',
  사우어: '미국',
  '케일럽 보쉴리': '미국',
  보쉴리: '미국',
  '샘 힐리어드': '미국',
  힐리어드: '미국',
  '스기모토 고키': '일본',
  '스기모토 코우키': '일본',
  스기모토: '일본',
  // 롯데
  '엘빈 로드리게스': '도미니카공화국',
  로드리게스: '도미니카공화국',
  '제러미 비슬리': '미국',
  비슬리: '미국',
  '빅터 레이예스': '베네수엘라',
  레이예스: '베네수엘라',
  '교야마 마사야': '일본',
  교야마: '일본',
  쿄야마: '일본',
  // KIA
  '제임스 네일': '미국',
  네일: '미국',
  '애덤 올러': '미국',
  올러: '미국',
  '해럴드 카스트로': '베네수엘라',
  카스트로: '베네수엘라',
  '제리드 데일': '호주',
  데일: '호주',
  // 두산
  '잭 로그': '미국',
  잭로그: '미국',
  '크리스 플렉센': '미국',
  플렉센: '미국',
  '다즈 카메론': '미국',
  카메론: '미국',
  '다무라 이치로': '일본',
  다무라: '일본',
  타무라: '일본',
  // 키움
  '라울 알칸타라': '도미니카공화국',
  알칸타라: '도미니카공화국',
  '네이선 와일스': '미국',
  와일스: '미국',
  '트렌턴 브룩스': '미국',
  브룩스: '미국',
  '가나쿠보 유토': '일본',
  유토: '일본',
};

export function resolveRealForeignNationality(
  playerName: string,
  category: '국내' | '외국인' | '아시아쿼터',
  sourceNationality?: string | null
): string {
  if (category === '국내') return '한국';
  const cleanName = (playerName ?? '').trim();
  const known = REAL_FOREIGN_NATIONALITIES[cleanName];
  if (known) return known;
  const src = (sourceNationality ?? '').trim();
  if (src && src !== '아시아쿼터' && src !== '외국인' && src !== '미확인') {
    if (src === '도미니카') return '도미니카공화국';
    return src;
  }
  return category === '아시아쿼터' ? '일본' : '미국';
}

/**
 * 2026 KBO 10개 구단 실존 외국인·아시아쿼터 선수 직전 리그 및 소속 구단
 */
export const REAL_FOREIGN_PREVIOUS_CLUBS: Record<string, string> = {
  // LG
  '요니 치리노스': 'MLB 마이애미 말린스 · AAA 잭슨빌 점보슈림프',
  치리노스: 'MLB 마이애미 말린스 · AAA 잭슨빌 점보슈림프',
  '앤더스 톨허스트': 'AAA 버팔로 바이슨스 (토론토 산하)',
  톨허스트: 'AAA 버팔로 바이슨스 (토론토 산하)',
  '오스틴 딘': 'MLB 샌프란시스코 자이언츠 · AAA 새크라멘토',
  오스틴: 'MLB 샌프란시스코 자이언츠 · AAA 새크라멘토',
  '라클란 웰스': 'ABL 멜버른 에이시스 · AA 위치타 (미네소타 산하)',
  웰스: 'ABL 멜버른 에이시스 · AA 위치타 (미네소타 산하)',
  // 한화
  '윌켈 에르난데스': 'AAA 톨레도 머드헨스 (디트로이트 산하)',
  '오웬 화이트': 'MLB 텍사스 레인저스 · AAA 라운드록 익스프레스',
  페라자: 'AAA 아이오와 컵스 (시카고 컵스 산하)',
  '요나단 페라자': 'AAA 아이오와 컵스 (시카고 컵스 산하)',
  왕옌청: 'NPB 도호쿠 라쿠텐 골든이글스 (2군)',
  '트로이 왓슨': 'AAA 버팔로 바이슨스 (토론토 산하)',
  // SSG
  '미치 화이트': 'MLB 밀워키 브루어스 · AAA 내슈빌 사운즈',
  화이트: 'MLB 밀워키 브루어스 · AAA 내슈빌 사운즈',
  '앤서니 베니지아노': 'MLB 마이애미 말린스 · AAA 잭슨빌 점보슈림프',
  베니지아노: 'MLB 마이애미 말린스 · AAA 잭슨빌 점보슈림프',
  '기예르모 에레디아': 'MLB 애틀랜타 브레이브스 · KBO SSG',
  에레디아: 'MLB 애틀랜타 브레이브스 · KBO SSG',
  '다케다 쇼타': 'NPB 후쿠오카 소프트뱅크 호크스',
  다케다: 'NPB 후쿠오카 소프트뱅크 호크스',
  // 삼성
  '아리엘 후라도': 'MLB 뉴욕 메츠 · KBO 키움 히어로즈',
  후라도: 'MLB 뉴욕 메츠 · KBO 키움 히어로즈',
  '잭 오러클린': 'MLB 오클랜드 애슬레틱스 · AAA 라스베이거스',
  오러클린: 'MLB 오클랜드 애슬레틱스 · AAA 라스베이거스',
  '르윈 디아즈': 'MLB 마이애미 말린스 · LMB 멕시코시티',
  디아즈: 'MLB 마이애미 말린스 · LMB 멕시코시티',
  '미야지 유라': 'NPB 요코하마 DeNA 베이스타스 (2군)',
  미야지: 'NPB 요코하마 DeNA 베이스타스 (2군)',
  // NC
  '라일리 톰슨': 'AAA 아이오와 컵스 (시카고 컵스 산하)',
  라일리: 'AAA 아이오와 컵스 (시카고 컵스 산하)',
  '커티스 테일러': 'AAA 오마하 스톰체이서스 (캔자스시티 산하)',
  테일러: 'AAA 오마하 스톰체이서스 (캔자스시티 산하)',
  '맷 데이비슨': 'NPB 히로시마 도요 카프 · MLB 시카고 화이트삭스',
  데이비슨: 'NPB 히로시마 도요 카프 · MLB 시카고 화이트삭스',
  '도다 나쓰키': 'NPB 요미우리 자이언츠',
  토다: 'NPB 요미우리 자이언츠',
  // KT
  '맷 사우어': 'MLB 캔자스시티 로열스 · AAA 오클라호마시티',
  사우어: 'MLB 캔자스시티 로열스 · AAA 오클라호마시티',
  '케일럽 보쉴리': 'MLB 미네소타 트윈스 · AAA 세인트폴 세인츠',
  보쉴리: 'MLB 미네소타 트윈스 · AAA 세인트폴 세인츠',
  '샘 힐리어드': 'MLB 콜로라도 로키스 · AAA 앨버커키',
  힐리어드: 'MLB 콜로라도 로키스 · AAA 앨버커키',
  '스기모토 고키': 'NPB 독립리그 도쿠시마 인디고삭스',
  스기모토: 'NPB 독립리그 도쿠시마 인디고삭스',
  // 롯데
  '엘빈 로드리게스': 'NPB 도쿄 야쿠르트 스왈로스 · MLB 밀워키',
  로드리게스: 'NPB 도쿄 야쿠르트 스왈로스 · MLB 밀워키',
  '제러미 비슬리': 'NPB 한신 타이거스 · MLB 토론토 블루제이스',
  비슬리: 'NPB 한신 타이거스 · MLB 토론토 블루제이스',
  '빅터 레이예스': 'MLB 디트로이트 타이거스 · AAA 샬럿 나이츠',
  레이예스: 'MLB 디트로이트 타이거스 · AAA 샬럿 나이츠',
  '교야마 마사야': 'NPB 요코하마 DeNA 베이스타스',
  교야마: 'NPB 요코하마 DeNA 베이스타스',
  // KIA
  '제임스 네일': 'MLB 세인트루이스 카디널스 · AAA 멤피스 레드버즈',
  네일: 'MLB 세인트루이스 카디널스 · AAA 멤피스 레드버즈',
  '애덤 올러': 'MLB 마이애미 말린스 · AAA 잭슨빌 점보슈림프',
  올러: 'MLB 마이애미 말린스 · AAA 잭슨빌 점보슈림프',
  '해럴드 카스트로': 'MLB 콜로라도 로키스 · LMB 멕시코리그',
  카스트로: 'MLB 콜로라도 로키스 · LMB 멕시코리그',
  '제리드 데일': 'ABL 멜버른 에이시스 · AAA 엘파소 (샌디에이고 산하)',
  데일: 'ABL 멜버른 에이시스 · AAA 엘파소 (샌디에이고 산하)',
  // 두산
  '잭 로그': 'MLB 로스앤젤레스 다저스 · AAA 오클라호마시티',
  잭로그: 'MLB 로스앤젤레스 다저스 · AAA 오클라호마시티',
  '크리스 플렉센': 'MLB 시카고 화이트삭스 · KBO 두산 베어스',
  플렉센: 'MLB 시카고 화이트삭스 · KBO 두산 베어스',
  '다즈 카메론': 'MLB 오클랜드 애슬레틱스 · AAA 라스베이거스',
  카메론: 'MLB 오클랜드 애슬레틱스 · AAA 라스베이거스',
  '다무라 이치로': 'NPB 사이타마 세이부 라이온즈',
  다무라: 'NPB 사이타마 세이부 라이온즈',
  // 키움
  '라울 알칸타라': 'NPB 한신 타이거스 · KBO 두산 베어스',
  알칸타라: 'NPB 한신 타이거스 · KBO 두산 베어스',
  '네이선 와일스': 'AAA 더럼 불스 (탬파베이 산하)',
  와일스: 'AAA 더럼 불스 (탬파베이 산하)',
  '트렌턴 브룩스': 'MLB 샌프란시스코 자이언츠 · AAA 새크라멘토',
  브룩스: 'MLB 샌프란시스코 자이언츠 · AAA 새크라멘토',
  '가나쿠보 유토': 'NPB 도쿄 야쿠르트 스왈로스',
  유토: 'NPB 도쿄 야쿠르트 스왈로스',
};

/**
 * 2026 KBO 타 구단 개막 주전 9인 실존 자연 포지션 + 고유 선발 수비 위치 매핑 (한 자리에 한 포지션, DH는 타 포지션 겸임 가능)
 */
export const REAL_KBO_HITTER_POSITIONS: Record<
  TeamId,
  Record<string, { position: Position; lineupPos?: Position }>
> = {
  한화: {
    문현빈: { position: 'LF', lineupPos: 'LF' },
    페라자: { position: 'RF', lineupPos: 'RF' },
    노시환: { position: '3B', lineupPos: '3B' },
    강백호: { position: 'DH', lineupPos: 'DH' },
    채은성: { position: '1B', lineupPos: '1B' },
    허인서: { position: 'C', lineupPos: 'C' },
    황영묵: { position: '2B', lineupPos: '2B' },
    이진영: { position: 'CF', lineupPos: 'CF' },
    심우준: { position: 'SS', lineupPos: 'SS' },
  },
  LG: {
    홍창기: { position: 'RF', lineupPos: 'RF' },
    문성주: { position: 'LF', lineupPos: 'LF' },
    문보경: { position: '3B', lineupPos: '3B' },
    오스틴: { position: '1B', lineupPos: '1B' },
    박동원: { position: 'C', lineupPos: 'C' },
    오지환: { position: 'SS', lineupPos: 'SS' },
    박해민: { position: 'CF', lineupPos: 'CF' },
    신민재: { position: '2B', lineupPos: '2B' },
    구본혁: { position: '3B', lineupPos: 'DH' },
  },
  두산: {
    정수빈: { position: 'CF', lineupPos: 'CF' },
    김민석: { position: 'LF', lineupPos: 'LF' },
    양의지: { position: 'C', lineupPos: 'C' },
    양석환: { position: '1B', lineupPos: '1B' },
    카메론: { position: 'RF', lineupPos: 'RF' },
    강승호: { position: '2B', lineupPos: '2B' },
    박찬호: { position: 'SS', lineupPos: 'SS' },
    오명진: { position: '3B', lineupPos: '3B' },
    조수행: { position: 'LF', lineupPos: 'DH' },
  },
  KT: {
    배정대: { position: 'CF', lineupPos: 'CF' },
    김현수: { position: 'DH', lineupPos: 'DH' },
    안현민: { position: 'RF', lineupPos: 'RF' },
    장성우: { position: 'C', lineupPos: 'C' },
    허경민: { position: '3B', lineupPos: '3B' },
    힐리어드: { position: 'LF', lineupPos: 'LF' },
    김상수: { position: 'SS', lineupPos: 'SS' },
    오윤석: { position: '2B', lineupPos: '2B' },
    최원준: { position: 'LF', lineupPos: 'LF' },
    최지만: { position: '1B', lineupPos: '1B' },
  },
  키움: {
    이주형: { position: 'CF', lineupPos: 'CF' },
    김태진: { position: 'SS', lineupPos: 'SS' },
    브룩스: { position: '1B', lineupPos: '1B' },
    최주환: { position: '3B', lineupPos: '3B' },
    임지열: { position: 'LF', lineupPos: 'DH' },
    이형종: { position: 'RF', lineupPos: 'RF' },
    김건희: { position: 'C', lineupPos: 'C' },
    안치홍: { position: '2B', lineupPos: '2B' },
    박수종: { position: 'LF', lineupPos: 'LF' },
  },
  SSG: {
    최지훈: { position: 'CF', lineupPos: 'CF' },
    박성한: { position: 'SS', lineupPos: 'SS' },
    최정: { position: '3B', lineupPos: '3B' },
    에레디아: { position: 'LF', lineupPos: 'LF' },
    김재환: { position: 'DH', lineupPos: 'DH' },
    고명준: { position: '1B', lineupPos: '1B' },
    오태곤: { position: 'RF', lineupPos: 'RF' },
    조형우: { position: 'C', lineupPos: 'C' },
    정준재: { position: '2B', lineupPos: '2B' },
  },
  NC: {
    박민우: { position: '2B', lineupPos: '2B' },
    김주원: { position: 'SS', lineupPos: 'SS' },
    박건우: { position: 'RF', lineupPos: 'RF' },
    데이비슨: { position: '1B', lineupPos: '1B' },
    권희동: { position: 'LF', lineupPos: 'LF' },
    김휘집: { position: '3B', lineupPos: '3B' },
    서호철: { position: '3B', lineupPos: 'DH' },
    김형준: { position: 'C', lineupPos: 'C' },
    천재환: { position: 'CF', lineupPos: 'CF' },
  },
  KIA: {
    김도영: { position: '3B', lineupPos: '3B' },
    김선빈: { position: '2B', lineupPos: '2B' },
    나성범: { position: 'RF', lineupPos: 'RF' },
    김호령: { position: 'CF', lineupPos: 'CF' },
    카스트로: { position: 'SS', lineupPos: 'SS' },
    오선우: { position: 'LF', lineupPos: 'LF' },
    변우혁: { position: '1B', lineupPos: '1B' },
    한준수: { position: 'C', lineupPos: 'C' },
    윤도현: { position: '2B', lineupPos: 'DH' },
  },
  삼성: {
    김지찬: { position: 'CF', lineupPos: 'CF' },
    구자욱: { position: 'LF', lineupPos: 'LF' },
    디아즈: { position: '1B', lineupPos: '1B' },
    최형우: { position: 'DH', lineupPos: 'DH' },
    김영웅: { position: '3B', lineupPos: '3B' },
    이재현: { position: 'SS', lineupPos: 'SS' },
    강민호: { position: 'C', lineupPos: 'C' },
    류지혁: { position: '2B', lineupPos: '2B' },
    김성윤: { position: 'RF', lineupPos: 'RF' },
  },
  롯데: {
    황성빈: { position: 'CF', lineupPos: 'CF' },
    윤동희: { position: 'RF', lineupPos: 'RF' },
    레이예스: { position: 'LF', lineupPos: 'LF' },
    전준우: { position: 'DH', lineupPos: 'DH' },
    손호영: { position: '3B', lineupPos: '3B' },
    전민재: { position: 'SS', lineupPos: 'SS' },
    유강남: { position: 'C', lineupPos: 'C' },
    한태양: { position: '2B', lineupPos: '2B' },
    장두성: { position: 'CF', lineupPos: 'DH' },
  },
};

/**
 * 아시안게임 금메달 / 올림픽 메달 등으로 병역 특례 면제를 받은 현역 국내 선수 명단
 */
export const REAL_MILITARY_EXEMPT_PLAYERS = new Set<string>([
  '류현진',
  '문동주',
  '노시환',
  '강백호',
  '박해민',
  '오지환',
  '문보경',
  '곽빈',
  '김현수',
  '박영현',
  '최지훈',
  '박성한',
  '최정',
  '박민우',
  '김주원',
  '김형준',
  '박건우',
  '양현종',
  '나성범',
  '최지민',
  '정해영',
  '김지찬',
  '구자욱',
  '강민호',
  '원태인',
  '윤동희',
  '박세웅',
  '양의지',
  '허경민',
  '정수빈',
]);

/**
 * KBO 공식 은퇴 레전드 통산 기록 (명예의 전당 · 역대 통산 기록 기준선)
 */
export interface HistoricalLegendRecord {
  playerName: string;
  teamId: TeamId;
  uniformNumber?: number;
  role: '투수' | '타자';
  activeYears: string;
  retiredYear?: number;
  careerSummary: string;
  notableStats: string;
}

export const REAL_KBO_HISTORICAL_LEGENDS: HistoricalLegendRecord[] = [
  {
    playerName: '이승엽',
    teamId: '삼성',
    uniformNumber: 36,
    role: '타자',
    activeYears: '1995-2017',
    retiredYear: 2017,
    careerSummary: 'KBO 정규시즌 MVP 5회 · 단일시즌 56홈런 · 한국시리즈 우승 4회',
    notableStats: '1,906경기 타율 .302 · 2,156안타 · 467홈런 · 1,498타점 · 1,355득점',
  },
  {
    playerName: '이대호',
    teamId: '롯데',
    uniformNumber: 10,
    role: '타자',
    activeYears: '2001-2022',
    retiredYear: 2022,
    careerSummary: '2010 KBO 타격 7관왕 · MVP · 골든글러브 7회 · 롯데 프랜차이즈 스타',
    notableStats: '1,971경기 타율 .309 · 2,199안타 · 374홈런 · 1,425타점',
  },
  {
    playerName: '최동원',
    teamId: '롯데',
    uniformNumber: 11,
    role: '투수',
    activeYears: '1983-1990',
    retiredYear: 2011,
    careerSummary: '1984 한국시리즈 홀로 4승 · 정규시즌 MVP · KBO 최동원상 제정',
    notableStats: '248경기 103승 74패 26세이브 · 평균자책점 2.46 · 1,019탈삼진 · 1,414⅔이닝',
  },
  {
    playerName: '선동열',
    teamId: 'KIA',
    uniformNumber: 18,
    role: '투수',
    activeYears: '1985-1995',
    retiredYear: 1996,
    careerSummary: '무등산 폭격기 · KBO MVP 3회 · 평균자책점 1위 8회 · 통산 ERA 1.20',
    notableStats: '367경기 146승 40패 132세이브 · 평균자책점 1.20 · 1,698탈삼진 · 1,647이닝',
  },
  {
    playerName: '이종범',
    teamId: 'KIA',
    uniformNumber: 7,
    role: '타자',
    activeYears: '1993-2012',
    retiredYear: 2012,
    careerSummary: '바람의 아들 · 1994 시즌 타율 .393 / 84도루 · KBO MVP · KS MVP 2회',
    notableStats: '1,706경기 타율 .297 · 1,797안타 · 194홈런 · 510도루 · 1,100득점',
  },
  {
    playerName: '송진우',
    teamId: '한화',
    uniformNumber: 21,
    role: '투수',
    activeYears: '1989-2009',
    retiredYear: 2009,
    careerSummary: 'KBO 최초 200승 · 3,000이닝 달성 · 역대 통산 최다승(210승) · 최다이닝',
    notableStats: '672경기 210승 153패 103세이브 · 평균자책점 3.51 · 2,048탈삼진 · 3,003이닝',
  },
  {
    playerName: '장종훈',
    teamId: '한화',
    uniformNumber: 35,
    role: '타자',
    activeYears: '1987-2005',
    retiredYear: 2005,
    careerSummary: '연습생 신화 · KBO 최초 40홈런(1992) · MVP 2회 · 홈런왕 3연패',
    notableStats: '1,950경기 타율 .281 · 1,771안타 · 340홈런 · 1,145타점',
  },
  {
    playerName: '정민철',
    teamId: '한화',
    uniformNumber: 23,
    role: '투수',
    activeYears: '1992-2009',
    retiredYear: 2009,
    careerSummary: '1999 한국시리즈 우승 에이스 · KBO 노히트노런 달성 · 통산 161승',
    notableStats: '393경기 161승 128패 10세이브 · 평균자책점 3.51 · 1,661탈삼진 · 2,394⅔이닝',
  },
  {
    playerName: '김태균',
    teamId: '한화',
    uniformNumber: 52,
    role: '타자',
    activeYears: '2001-2020',
    retiredYear: 2021,
    careerSummary: '2001 신인왕 · 2008 홈런왕 · 86경기 연속 출루 KBO 신기록',
    notableStats: '2,015경기 타율 .320 · 2,209안타 · 311홈런 · 1,358타점 · 출루율 .421',
  },
  {
    playerName: '박용택',
    teamId: 'LG',
    uniformNumber: 33,
    role: '타자',
    activeYears: '2002-2020',
    retiredYear: 2022,
    careerSummary: 'LG 원클럽맨 · 2009 타격왕 · 골든글러브 4회 · KBO 최초 2,500안타',
    notableStats: '2,237경기 타율 .308 · 2,504안타 · 213홈런 · 1,192타점 · 313도루',
  },
  {
    playerName: '이병규',
    teamId: 'LG',
    uniformNumber: 9,
    role: '타자',
    activeYears: '1997-2016',
    retiredYear: 2017,
    careerSummary: '적토마 · 1997 신인왕 · 타격왕 2회 · 최다안타 4회 · 골든글러브 7회',
    notableStats: '1,741경기 타율 .311 · 2,043안타 · 161홈런 · 972타점',
  },
  {
    playerName: '김용수',
    teamId: 'LG',
    uniformNumber: 41,
    role: '투수',
    activeYears: '1985-2000',
    retiredYear: 1999,
    careerSummary: '노송 · 1990/1994 한국시리즈 MVP 2회 · KBO 최초 100승-200세이브',
    notableStats: '613경기 126승 89패 227세이브 · 평균자책점 2.98 · 1,146탈삼진',
  },
  {
    playerName: '양준혁',
    teamId: '삼성',
    uniformNumber: 10,
    role: '타자',
    activeYears: '1993-2010',
    retiredYear: 2010,
    careerSummary: '양신 · 1993 신인왕 · 타격왕 4회 · 골든글러브 8회 · 만세타법 레전드',
    notableStats: '2,135경기 타율 .316 · 2,318안타 · 351홈런 · 1,389타점 · 1,278볼넷',
  },
  {
    playerName: '이만수',
    teamId: '삼성',
    uniformNumber: 22,
    role: '타자',
    activeYears: '1982-1997',
    retiredYear: 2003,
    careerSummary: '헐크 · KBO 1호 홈런 · 1984 트리플크라운 & MVP · 골든글러브 5회',
    notableStats: '1,449경기 타율 .296 · 1,276안타 · 252홈런 · 861타점',
  },
  {
    playerName: '박경완',
    teamId: 'SSG',
    uniformNumber: 26,
    role: '타자',
    activeYears: '1991-2013',
    retiredYear: 2014,
    careerSummary: '포수 최초 40홈런 & 2000 MVP · 4연타석 홈런 · 한국시리즈 우승 4회',
    notableStats: '2,043경기 타율 .249 · 1,480안타 · 314홈런 · 995타점',
  },
  {
    playerName: '박철순',
    teamId: '두산',
    uniformNumber: 21,
    role: '투수',
    activeYears: '1982-1996',
    retiredYear: 2002,
    careerSummary: '불사조 · 1982 원년 22연승 & MVP · 한국시리즈 우승 에이스',
    notableStats: '231경기 76승 53패 20세이브 · 평균자책점 2.95 · 635탈삼진',
  },
  {
    playerName: '오승환',
    teamId: '삼성',
    uniformNumber: 21,
    role: '투수',
    activeYears: '2005-2025',
    retiredYear: 2025,
    careerSummary: '끝판대장 · KBO 역대 통산 최다 세이브(427SV) · 단일시즌 47SV · KS MVP 2회',
    notableStats: '737경기 44승 33패 427세이브 · 평균자책점 2.32 · 864탈삼진',
  },
];

/**
 * 주요 실존 KBO 선수 드래프트 지명 순번 (1차지명 / 라운드·전체순번)
 */
export const REAL_PLAYER_DRAFT_INFO: Record<string, PlayerAcquisitionInfo> = {
  류현진: { type: '드래프트', draftYear: 2006, draftRound: 1, draftPick: 2, label: '2006 2차 1R 전체 2번' },
  문동주: { type: '드래프트', draftYear: 2022, draftRound: 1, draftPick: 1, label: '2022 1차지명 (한화)' },
  김서현: { type: '드래프트', draftYear: 2023, draftRound: 1, draftPick: 1, label: '2023 1R 전체 1번' },
  황준서: { type: '드래프트', draftYear: 2024, draftRound: 1, draftPick: 1, label: '2024 1R 전체 1번' },
  정우주: { type: '드래프트', draftYear: 2025, draftRound: 1, draftPick: 2, label: '2025 1R 전체 2번' },
  노시환: { type: '드래프트', draftYear: 2019, draftRound: 1, draftPick: 3, label: '2019 2차 1R 전체 3번' },
  강백호: { type: '드래프트', draftYear: 2018, draftRound: 1, draftPick: 1, label: '2018 2차 1R 전체 1번' },
  문현빈: { type: '드래프트', draftYear: 2023, draftRound: 2, draftPick: 11, label: '2023 2R 전체 11번' },
  허인서: { type: '드래프트', draftYear: 2022, draftRound: 2, draftPick: 11, label: '2022 2차 2R 전체 11번' },
  채은성: { type: '육성선수', draftYear: 2009, wasDevelopmental: true, label: '2009 육성선수 입단 → 정식 전환' },
  황영묵: { type: '드래프트', draftYear: 2024, draftRound: 4, draftPick: 31, label: '2024 4R 전체 31번' },
  김도영: { type: '드래프트', draftYear: 2022, draftRound: 1, draftPick: 1, label: '2022 1차지명 (KIA)' },
  양현종: { type: '드래프트', draftYear: 2007, draftRound: 1, draftPick: 1, label: '2007 2차 1R 전체 1번' },
  이의리: { type: '드래프트', draftYear: 2021, draftRound: 1, draftPick: 1, label: '2021 1차지명 (KIA)' },
  정해영: { type: '드래프트', draftYear: 2020, draftRound: 1, draftPick: 1, label: '2020 1차지명 (KIA)' },
  나성범: { type: '드래프트', draftYear: 2012, draftRound: 2, draftPick: 10, label: '2012 2R 전체 10번' },
  오지환: { type: '드래프트', draftYear: 2009, draftRound: 1, draftPick: 1, label: '2009 1차지명 (LG)' },
  홍창기: { type: '드래프트', draftYear: 2016, draftRound: 3, draftPick: 27, label: '2016 2차 3R 전체 27번' },
  문보경: { type: '드래프트', draftYear: 2019, draftRound: 3, draftPick: 25, label: '2019 2차 3R 전체 25번' },
  임찬규: { type: '드래프트', draftYear: 2011, draftRound: 1, draftPick: 2, label: '2011 1R 전체 2번' },
  김진성: { type: '드래프트', draftYear: 2004, draftRound: 6, draftPick: 42, label: '2004 2차 6R 전체 42번' },
  김영우: { type: '드래프트', draftYear: 2025, draftRound: 1, draftPick: 10, label: '2025 1R 전체 10번' },
  신민재: { type: '육성선수', draftYear: 2015, wasDevelopmental: true, label: '2015 육성선수 입단 → 정식 전환' },
  양의지: { type: '드래프트', draftYear: 2006, draftRound: 8, draftPick: 59, label: '2006 2차 8R 전체 59번' },
  곽빈: { type: '드래프트', draftYear: 2018, draftRound: 1, draftPick: 1, label: '2018 1차지명 (두산)' },
  김택연: { type: '드래프트', draftYear: 2024, draftRound: 1, draftPick: 2, label: '2024 1R 전체 2번' },
  정수빈: { type: '드래프트', draftYear: 2009, draftRound: 5, draftPick: 39, label: '2009 2차 5R 전체 39번' },
  최정: { type: '드래프트', draftYear: 2005, draftRound: 1, draftPick: 1, label: '2005 1차지명 (SK/SSG)' },
  김재환: { type: '드래프트', draftYear: 2008, draftRound: 1, draftPick: 4, label: '2008 2차 1R 전체 4번' },
  조병현: { type: '드래프트', draftYear: 2021, draftRound: 3, draftPick: 28, label: '2021 2차 3R 전체 28번' },
  최지훈: { type: '드래프트', draftYear: 2020, draftRound: 3, draftPick: 30, label: '2020 2차 3R 전체 30번' },
  구자욱: { type: '드래프트', draftYear: 2012, draftRound: 2, draftPick: 12, label: '2012 2R 전체 12번' },
  최형우: { type: '드래프트', draftYear: 2002, draftRound: 6, draftPick: 48, label: '2002 2차 6R 전체 48번' },
  강민호: { type: '드래프트', draftYear: 2004, draftRound: 3, draftPick: 17, label: '2004 2차 3R 전체 17번' },
  김영웅: { type: '드래프트', draftYear: 2022, draftRound: 1, draftPick: 3, label: '2022 2차 1R 전체 3번' },
  배찬승: { type: '드래프트', draftYear: 2025, draftRound: 1, draftPick: 3, label: '2025 1R 전체 3번' },
  이재현: { type: '드래프트', draftYear: 2022, draftRound: 1, draftPick: 1, label: '2022 1차지명 (삼성)' },
  박민우: { type: '드래프트', draftYear: 2012, draftRound: 1, draftPick: 9, label: '2012 1R 전체 9번' },
  구창모: { type: '드래프트', draftYear: 2015, draftRound: 1, draftPick: 3, label: '2015 2차 1R 전체 3번' },
  김주원: { type: '드래프트', draftYear: 2021, draftRound: 1, draftPick: 6, label: '2021 2차 1R 전체 6번' },
  소형준: { type: '드래프트', draftYear: 2020, draftRound: 1, draftPick: 1, label: '2020 1차지명 (KT)' },
  박영현: { type: '드래프트', draftYear: 2022, draftRound: 1, draftPick: 1, label: '2022 1차지명 (KT)' },
  김현수: { type: '육성선수', draftYear: 2006, wasDevelopmental: true, label: '2006 육성선수 입단 → 정식 전환' },
  안현민: { type: '드래프트', draftYear: 2022, draftRound: 4, draftPick: 38, label: '2022 2차 4R 전체 38번' },
  윤동희: { type: '드래프트', draftYear: 2022, draftRound: 3, draftPick: 24, label: '2022 2차 3R 전체 24번' },
  박세웅: { type: '드래프트', draftYear: 2014, draftRound: 1, draftPick: 1, label: '2014 1차지명 (KT)' },
  전준우: { type: '드래프트', draftYear: 2008, draftRound: 2, draftPick: 15, label: '2008 2차 2R 전체 15번' },
  정현우: { type: '드래프트', draftYear: 2025, draftRound: 1, draftPick: 1, label: '2025 1R 전체 1번' },
  이주형: { type: '드래프트', draftYear: 2020, draftRound: 2, draftPick: 13, label: '2020 2차 2R 전체 13번' },
  손아섭: { type: '드래프트', draftYear: 2007, draftRound: 4, draftPick: 29, label: '2007 2차 4R 전체 29번' },
  정준재: { type: '드래프트', draftYear: 2024, draftRound: 5, draftPick: 50, label: '2024 5R 전체 50번 (대졸)' },
  이로운: { type: '드래프트', draftYear: 2023, draftRound: 1, draftPick: 5, label: '2023 1R 전체 5번' },
  조형우: { type: '드래프트', draftYear: 2021, draftRound: 1, draftPick: 8, label: '2021 2차 1R 전체 8번' },
  고명준: { type: '드래프트', draftYear: 2021, draftRound: 2, draftPick: 18, label: '2021 2차 2R 전체 18번' },
  김건우: { type: '드래프트', draftYear: 2021, draftRound: 1, draftPick: 1, label: '2021 1차지명 (SSG)' },
  원태인: { type: '드래프트', draftYear: 2019, draftRound: 1, draftPick: 1, label: '2019 1차지명 (삼성)' },
  김지찬: { type: '드래프트', draftYear: 2020, draftRound: 2, draftPick: 15, label: '2020 2차 2R 전체 15번' },
  김휘집: { type: '드래프트', draftYear: 2021, draftRound: 1, draftPick: 9, label: '2021 2차 1R 전체 9번' },
  한태양: { type: '드래프트', draftYear: 2022, draftRound: 6, draftPick: 54, label: '2022 2차 6R 전체 54번' },
  이민석: { type: '드래프트', draftYear: 2022, draftRound: 1, draftPick: 1, label: '2022 1차지명 (롯데)' },
  윤도현: { type: '드래프트', draftYear: 2022, draftRound: 2, draftPick: 15, label: '2022 2차 2R 전체 15번' },
  최지민: { type: '드래프트', draftYear: 2022, draftRound: 1, draftPick: 5, label: '2022 2차 1R 전체 5번' },
  김민석: { type: '드래프트', draftYear: 2023, draftRound: 1, draftPick: 3, label: '2023 1R 전체 3번' },
  오명진: { type: '드래프트', draftYear: 2020, draftRound: 6, draftPick: 59, label: '2020 2차 6R 전체 59번' },
  김건희: { type: '드래프트', draftYear: 2023, draftRound: 1, draftPick: 6, label: '2023 1R 전체 6번' },
  전준표: { type: '드래프트', draftYear: 2024, draftRound: 1, draftPick: 8, label: '2024 1R 전체 8번' },
  안우진: { type: '드래프트', draftYear: 2018, draftRound: 1, draftPick: 1, label: '2018 1차지명 (키움)' },
  박성한: { type: '드래프트', draftYear: 2017, draftRound: 2, draftPick: 16, label: '2017 2차 2R 전체 16번' },
};

/**
 * 2026 시즌 개막 시점 기준 KBO 실존 선수 1군 인정 등록 시즌 수 (현실 데뷔 연도·군복무·1군 등록일수 반영)
 * KBO 규약상 포스팅 시스템은 1군 등록일수 7시즌(시즌당 145일 = 1,015일) 충족 + 구단 동의 필수
 */
export const REAL_KBO_2026_SERVICE_YEARS: Record<string, number> = {
  // 2025 입단 (2026 개막 시점 1시즌)
  김영우: 1,
  배찬승: 1,
  정현우: 1,
  정우주: 1,
  김태형: 1,
  이율예: 1,
  박준순: 1,
  박재현: 1,
  어준서: 1,
  // 2024 입단 (2026 개막 시점 1~2시즌)
  김택연: 2,
  전준표: 2,
  정준재: 2,
  황준서: 2,
  황영묵: 2,
  원상현: 2,
  조대현: 1,
  전미르: 1,
  육선엽: 1,
  // 2023 입단 (2026 개막 시점 2~3시즌)
  김서현: 3,
  문현빈: 3,
  이로운: 3,
  김민석: 3,
  윤영철: 3,
  송영진: 3,
  박명근: 3,
  김건희: 2,
  김동헌: 2,
  이호성: 2,
  // 2022 입단 (2026 개막 시점 1~4시즌)
  김도영: 4,
  문동주: 4,
  박영현: 4,
  윤동희: 4,
  이재현: 4,
  최지민: 4,
  김영웅: 3,
  안현민: 1,
  한태양: 2,
  이민석: 2,
  윤도현: 1,
  황동하: 2,
  허인서: 2,
  김유성: 2,
  // 2021 입단 (2026 개막 시점 2~5시즌)
  김주원: 5,
  김휘집: 5,
  이의리: 4,
  이승현: 4,
  김진욱: 4,
  최승용: 4,
  조병현: 3,
  조형우: 3,
  고명준: 3,
  김건우: 2,
  장재영: 3,
  손성빈: 3,
  김기중: 3,
  우강훈: 2,
  이영빈: 3,
  김현준: 4,
  // 2020 입단 (2026 개막 시점 2~6시즌)
  정해영: 6,
  김지찬: 6,
  최지훈: 6,
  소형준: 5,
  최준용: 5,
  이주형: 3,
  오명진: 2,
  강현우: 3,
  한승주: 3,
  임종찬: 3,
  황동재: 3,
  박시후: 2,
  박시원: 2,
  최지강: 3,
  // 2019 입단 (2026 개막 시점 2~7시즌)
  노시환: 7,
  원태인: 7,
  김영규: 6,
  문보경: 5,
  송명기: 5,
  변우혁: 4,
  김윤수: 4,
  손동현: 4,
  송찬의: 3,
  김대한: 3,
  김기훈: 3,
  홍종표: 3,
  김도환: 3,
  김창평: 3,
  김동혁: 3,
  원성준: 2,
  서동욱: 2,
  // 2017~2018 입단 및 주요 주축
  강백호: 8,
  곽빈: 7,
  박성한: 7,
  안우진: 6,
  정은원: 6,
  신민재: 6,
  홍창기: 8,
};

/**
 * 현실 KBO 나이·입단연도·1군 등록일수 기준에 어긋나는 잘못된 연차/등록일수(예: 21세 9년차)를 자동 보정합니다.
 * 신규 게임 생성과 기존 세이브 로드 시 모두 안전하게 호출됩니다.
 */
export function sanitizePlayerAgeAndServiceYearsInPlace(
  players: Record<string, Player>,
  currentSeason: number = 2026
): void {
  const seasonsElapsedSince2026 = Math.max(0, currentSeason - 2026);
  for (const p of Object.values(players)) {
    if (p.category !== '국내') continue;

    // 1) 드래프트 입단 정보 누락/오류 보정 (동명이인 신인·베테랑 충돌 방지 위해 출생연도 정합성 검증)
    const realDraft = REAL_PLAYER_DRAFT_INFO[p.name];
    const isRealDraftAgeCompatible =
      realDraft &&
      typeof realDraft.draftYear === 'number' &&
      (typeof p.birthYear === 'number'
        ? realDraft.draftYear >= p.birthYear + 17 && realDraft.draftYear <= p.birthYear + 26
        : Math.abs(currentSeason - realDraft.draftYear - Math.max(0, p.age - 19)) <= 6);
    if (
      realDraft &&
      isRealDraftAgeCompatible &&
      (!p.acquisitionInfo || p.acquisitionInfo.draftYear !== realDraft.draftYear)
    ) {
      if (!p.rookieInfo) {
        p.acquisitionInfo = { ...realDraft };
      }
    }

    // 2) 물리적·규정상 가능한 최대 1군 인정 시즌 계산
    //    - birthYear 보유 시 생일 전후(만 나이) 흔들림 없이 연도 기준으로 산출 (빠른 1~2월생 조기입학 허용)
    //    - birthYear 미보유 레거시/손상 세이브는 기존 age - 19 기준 적용
    const birthMonth =
      p.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(p.birthDate) ? Number(p.birthDate.slice(5, 7)) : 6;
    const isEarlyBorn = birthMonth <= 2;
    const maxByBirthStrict =
      typeof p.birthYear === 'number' && p.birthYear >= 1970
        ? Math.max(0, currentSeason - (p.birthYear + (isEarlyBorn ? 18 : 19)))
        : Math.max(0, p.age - 19);
    const maxByBirthLoose =
      typeof p.birthYear === 'number' && p.birthYear >= 1970
        ? Math.max(0, currentSeason - (p.birthYear + 18))
        : Math.max(0, p.age - 19);

    const draftYear = p.draftYear ?? p.acquisitionInfo?.draftYear;
    const hasValidDraftYear =
      typeof draftYear === 'number' && draftYear >= 1995 && draftYear <= currentSeason;
    const maxByDraft = hasValidDraftYear ? Math.max(0, currentSeason - draftYear) : maxByBirthStrict;
    const maxByAge = hasValidDraftYear ? maxByBirthLoose : maxByBirthStrict;
    const hardMaxServiceYears = Math.min(maxByAge, maxByDraft);

    // 3) 실존 2026 기준 연차가 있는 선수는 현실 기준 + 경과 시즌을 상한으로 적용 (동명이인 충돌 방지)
    const realBase2026 = REAL_KBO_2026_SERVICE_YEARS[p.name];
    let targetSy = p.serviceYears;
    if (realBase2026 !== undefined && (!realDraft || isRealDraftAgeCompatible)) {
      const expectedAtSeason = realBase2026 + seasonsElapsedSince2026;
      if (currentSeason === 2026) {
        targetSy = Math.min(hardMaxServiceYears, realBase2026);
      } else if (targetSy > expectedAtSeason) {
        targetSy = Math.min(hardMaxServiceYears, expectedAtSeason);
      }
    }

    // 4) 모든 국내 선수는 나이와 입단연도 상한을 절대 초과할 수 없음
    if (targetSy > hardMaxServiceYears) {
      targetSy = hardMaxServiceYears;
    }
    if (p.rosterTier === '육성' && targetSy > 1) {
      targetSy = Math.min(1, hardMaxServiceYears);
    }

    if (targetSy !== p.serviceYears) {
      p.serviceYears = Math.max(0, targetSy);
    }

    // 5) 1군 등록일수(145일 = 1시즌) 동기화 — 부풀려진 등록일수를 현실 연차에 맞게 정교화
    const minRegDays = p.serviceYears * 145;
    const maxRegDays = (p.serviceYears + 1) * 145 - 1;
    if (p.registrationDays === undefined || p.registrationDays > maxRegDays) {
      const carry = p.rosterTier === '1군' ? Math.min(35, Math.max(0, (p.registrationDays ?? 0) % 145)) : 0;
      p.registrationDays = minRegDays + carry;
    } else if (p.serviceYears > 0 && p.registrationDays < minRegDays) {
      p.registrationDays = minRegDays;
    }
  }
}

/**
 * 2025 시즌 종료 기준 주요 실존 KBO 스타 선수 통산 기록 기준선
 */
export const REAL_KBO_CAREER_BASELINES: Record<string, CareerBatterStats | CareerPitcherStats> = {
  // 타자 레전드 & 주축
  최정: { seasons: 21, G: 2293, AB: 7892, H: 2269, HR: 495, RBI: 1561, R: 1461, BB: 1037, SB: 178 },
  최형우: { seasons: 19, G: 2181, AB: 7870, H: 2442, HR: 395, RBI: 1651, R: 1291, BB: 1121, SB: 28 },
  손아섭: { seasons: 19, G: 2077, AB: 7845, H: 2511, HR: 181, RBI: 1036, R: 1361, BB: 924, SB: 232 },
  김현수: { seasons: 18, G: 2081, AB: 7632, H: 2394, HR: 249, RBI: 1445, R: 1207, BB: 1030, SB: 63 },
  강민호: { seasons: 22, G: 2369, AB: 7618, H: 2111, HR: 338, RBI: 1242, R: 985, BB: 814, SB: 34 },
  양의지: { seasons: 18, G: 1832, AB: 6053, H: 1861, HR: 262, RBI: 1106, R: 878, BB: 730, SB: 45 },
  전준우: { seasons: 17, G: 1720, AB: 6412, H: 1924, HR: 213, RBI: 970, R: 1054, BB: 580, SB: 139 },
  나성범: { seasons: 13, G: 1383, AB: 5392, H: 1682, HR: 272, RBI: 1072, R: 991, BB: 538, SB: 100 },
  구자욱: { seasons: 11, G: 1210, AB: 4722, H: 1495, HR: 167, RBI: 786, R: 879, BB: 470, SB: 140 },
  오지환: { seasons: 17, G: 1858, AB: 6332, H: 1676, HR: 164, RBI: 866, R: 978, BB: 740, SB: 273 },
  박민우: { seasons: 13, G: 1283, AB: 4738, H: 1515, HR: 39, RBI: 492, R: 861, BB: 525, SB: 275 },
  박건우: { seasons: 14, G: 1256, AB: 4480, H: 1463, HR: 123, RBI: 678, R: 742, BB: 432, SB: 96 },
  김선빈: { seasons: 17, G: 1625, AB: 5402, H: 1648, HR: 41, RBI: 621, R: 748, BB: 589, SB: 151 },
  김재환: { seasons: 15, G: 1380, AB: 4784, H: 1353, HR: 263, RBI: 932, R: 794, BB: 696, SB: 38 },
  강백호: { seasons: 8, G: 802, AB: 3001, H: 922, HR: 121, RBI: 504, R: 499, BB: 390, SB: 38 },
  노시환: { seasons: 7, G: 694, AB: 2498, H: 656, HR: 92, RBI: 389, R: 344, BB: 312, SB: 20 },
  채은성: { seasons: 12, G: 1268, AB: 4496, H: 1312, HR: 139, RBI: 762, R: 584, BB: 356, SB: 39 },
  허경민: { seasons: 14, G: 1548, AB: 5094, H: 1483, HR: 60, RBI: 636, R: 765, BB: 410, SB: 125 },
  정수빈: { seasons: 17, G: 1697, AB: 5471, H: 1532, HR: 36, RBI: 546, R: 922, BB: 551, SB: 332 },
  홍창기: { seasons: 8, G: 716, AB: 2545, H: 797, HR: 19, RBI: 265, R: 498, BB: 478, SB: 78 },
  김도영: { seasons: 4, G: 365, AB: 1390, H: 433, HR: 48, RBI: 175, R: 252, BB: 142, SB: 78 },
  오스틴: { seasons: 3, G: 279, AB: 1047, H: 331, HR: 55, RBI: 227, R: 186, BB: 114, SB: 19 },
  에레디아: { seasons: 3, G: 258, AB: 1014, H: 348, HR: 33, RBI: 194, R: 158, BB: 64, SB: 16 },
  // 투수 레전드 & 주축
  양현종: { seasons: 19, G: 513, outs: 7511, W: 179, L: 118, SV: 0, HLD: 9, SO: 2076, ER: 1068, BB: 846, H: 2436 },
  류현진: { seasons: 9, G: 218, outs: 4281, W: 108, L: 60, SV: 1, HLD: 0, SO: 1373, ER: 465, BB: 407, H: 1272 },
  노경은: { seasons: 20, G: 556, outs: 4168, W: 86, L: 95, SV: 10, HLD: 86, SO: 1061, ER: 749, BB: 619, H: 1439 },
  임찬규: { seasons: 14, G: 325, outs: 3628, W: 75, L: 78, SV: 8, HLD: 6, SO: 992, ER: 615, BB: 536, H: 1219 },
  박세웅: { seasons: 11, G: 250, outs: 3783, W: 70, L: 78, SV: 0, HLD: 1, SO: 1046, ER: 651, BB: 472, H: 1301 },
  김재윤: { seasons: 11, G: 546, outs: 1647, W: 48, L: 41, SV: 180, HLD: 42, SO: 605, ER: 220, BB: 187, H: 511 },
  김원중: { seasons: 11, G: 381, outs: 1545, W: 39, L: 49, SV: 132, HLD: 4, SO: 543, ER: 295, BB: 263, H: 525 },
  정해영: { seasons: 6, G: 271, outs: 849, W: 18, L: 20, SV: 121, HLD: 13, SO: 240, ER: 89, BB: 91, H: 264 },
  곽빈: { seasons: 7, G: 127, outs: 1898, W: 42, L: 34, SV: 0, HLD: 4, SO: 552, ER: 274, BB: 306, H: 558 },
  문동주: { seasons: 4, G: 57, outs: 774, W: 16, L: 18, SV: 0, HLD: 2, SO: 227, ER: 125, BB: 105, H: 252 },
  최원태: { seasons: 11, G: 217, outs: 3403, W: 78, L: 58, SV: 0, HLD: 0, SO: 822, ER: 549, BB: 381, H: 1210 },
  구창모: { seasons: 9, G: 174, outs: 2041, W: 47, L: 37, SV: 0, HLD: 4, SO: 688, ER: 278, BB: 280, H: 606 },
  소형준: { seasons: 5, G: 81, outs: 1353, W: 34, L: 19, SV: 0, HLD: 0, SO: 325, ER: 175, BB: 145, H: 460 },
  엄상백: { seasons: 10, G: 305, outs: 2292, W: 45, L: 44, SV: 3, HLD: 28, SO: 683, ER: 409, BB: 281, H: 784 },
};

function simpleHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function buildPlayerAcquisitionInfo(player: Player): PlayerAcquisitionInfo {
  if (player.acquisitionInfo) return player.acquisitionInfo;
  if (player.category === '외국인') {
    const nat = player.nationality ?? REAL_FOREIGN_NATIONALITIES[player.name] ?? '미국';
    return { type: '외국인', label: `외국인 영입 (${nat})` };
  }
  if (player.category === '아시아쿼터') {
    const nat = player.nationality ?? REAL_FOREIGN_NATIONALITIES[player.name] ?? '일본';
    return { type: '아시아쿼터', label: `아시아쿼터 영입 (${nat})` };
  }
  if (player.rosterTier === '육성') {
    const year = Math.max(2020, 2026 - Math.max(0, player.age - 19));
    return { type: '육성선수', draftYear: year, wasDevelopmental: true, label: `${year} 육성선수 입단` };
  }
  if (player.rookieInfo) {
    const overall = (player.rookieInfo.round - 1) * 10 + player.rookieInfo.pickInRound;
    return {
      type: '드래프트',
      draftYear: 2026,
      draftRound: player.rookieInfo.round,
      draftPick: overall,
      label: `2026 ${player.rookieInfo.round}R 전체 ${overall}번 (${player.rookieInfo.pickNotation})`,
    };
  }
  const realInfo = REAL_PLAYER_DRAFT_INFO[player.name];
  if (realInfo) return { ...realInfo };

  // Deterministic realistic draft metadata for remaining domestic players
  const h = simpleHash(`${player.teamId}-${player.name}`);
  const draftYear = Math.min(2025, Math.max(2000, 2026 - Math.max(1, player.age - 19)));
  const round =
    player.ability >= 82
      ? 1 + (h % 2)
      : player.ability >= 74
      ? 1 + (h % 4)
      : 3 + (h % 6);
  const pickInRound = 1 + ((h >> 4) % 10);
  const overall = (round - 1) * 10 + pickInRound;
  return {
    type: '드래프트',
    draftYear,
    draftRound: round,
    draftPick: overall,
    label: `${draftYear} ${round}R 전체 ${overall}번`,
  };
}

export function buildInitialCareerStats(player: Player): CareerBatterStats | CareerPitcherStats {
  const realBase = REAL_KBO_CAREER_BASELINES[player.name];
  if (realBase) {
    if (player.role === '타자' && 'AB' in realBase) return { ...realBase };
    if (player.role === '투수' && 'outs' in realBase) return { ...realBase };
  }

  const priorSeasons =
    player.category === '외국인' || player.category === '아시아쿼터'
      ? Math.max(0, Math.min(3, player.serviceYears - 1))
      : Math.max(0, Math.min(18, Math.max(player.serviceYears, player.age - 20)));

  if (priorSeasons <= 0 || player.rosterTier === '육성') {
    if (player.role === '타자') {
      return { seasons: 0, G: 0, AB: 0, H: 0, HR: 0, RBI: 0, R: 0, BB: 0, SB: 0 };
    }
    return { seasons: 0, G: 0, outs: 0, W: 0, L: 0, SV: 0, HLD: 0, SO: 0, ER: 0, BB: 0, H: 0 };
  }

  const h = simpleHash(`${player.id}-${player.name}`);
  const skillFactor = Math.max(0.55, Math.min(1.28, (player.ability - 45) / 35));
  const tierFactor = player.rosterTier === '1군' ? 1.0 : 0.42;

  if (player.role === '타자') {
    const avgG = Math.round((68 + (h % 45)) * tierFactor * (0.75 + skillFactor * 0.25));
    const G = Math.max(12, priorSeasons * avgG);
    const AB = Math.round(G * (2.6 + skillFactor * 0.85));
    const avg = Math.min(0.325, Math.max(0.215, 0.235 + (player.ability - 68) * 0.0038 + ((h % 19) - 9) * 0.002));
    const H = Math.round(AB * avg);
    const hrRate = Math.max(0.008, Math.min(0.068, 0.014 + Math.max(0, player.ability - 68) * 0.0018));
    const HR = Math.round(AB * hrRate);
    const RBI = Math.round(H * 0.44 + HR * 1.45);
    const R = Math.round(H * 0.49 + HR * 0.65);
    const BB = Math.round(AB * (0.08 + ((h >> 3) % 5) * 0.01));
    const SB = Math.round(priorSeasons * ((h >> 6) % 9) * (player.position === 'CF' || player.position === 'SS' || player.position === '2B' ? 1.4 : 0.55));
    return { seasons: priorSeasons, G, AB, H, HR, RBI, R, BB, SB };
  }

  const isStarter = player.position === 'SP' || player.pitchRole === '선발';
  const isCloser = player.position === 'CL' || player.pitchRole === '마무리';
  const G = Math.max(10, Math.round(priorSeasons * (isStarter ? 23 : 44) * tierFactor));
  const outs = Math.round(G * (isStarter ? 15.6 : 3.2));
  const era = Math.max(2.55, Math.min(5.6, 4.65 - (player.ability - 70) * 0.085 + ((h % 13) - 6) * 0.05));
  const ER = Math.round((era * outs) / 27);
  const W = isStarter ? Math.round(G * (0.28 + (skillFactor - 0.7) * 0.22)) : Math.round(G * 0.075);
  const L = isStarter ? Math.round(G * (0.31 - (skillFactor - 0.8) * 0.14)) : Math.round(G * 0.065);
  const SV = isCloser ? Math.round(G * 0.48) : isStarter ? 0 : Math.round((h % 5) * 0.4 * priorSeasons);
  const HLD = !isStarter && !isCloser ? Math.round(G * 0.22) : 0;
  const SO = Math.round((outs / 3) * (0.72 + Math.max(0, player.ability - 70) * 0.018));
  const BB = Math.round((outs / 3) * 0.36);
  const H = Math.round((outs / 3) * 0.94);
  return { seasons: priorSeasons, G, outs, W, L, SV, HLD, SO, ER, BB, H };
}

/**
 * 실시간 KBO 통산 기록 (이전 시즌 누적 + 현재 시즌 진행 중 성적 합산)
 */
export function getLiveCareerStats(player: Player): CareerBatterStats | CareerPitcherStats {
  const base = player.careerStats ?? buildInitialCareerStats(player);
  if (player.role === '타자') {
    const b = base as CareerBatterStats;
    const cur = player.stats as BatterStats;
    const curG = cur.G ?? 0;
    const basePa = b.PA ?? b.AB + b.BB;
    const curPa = cur.PA ?? (cur.AB ?? 0) + (cur.BB ?? 0) + (cur.HBP ?? 0) + (cur.SF ?? 0);
    return {
      seasons: b.seasons + (curG > 0 ? 1 : 0),
      G: b.G + curG,
      PA: basePa + curPa,
      AB: b.AB + (cur.AB ?? 0),
      H: b.H + (cur.H ?? 0),
      HR: b.HR + (cur.HR ?? 0),
      RBI: b.RBI + (cur.RBI ?? 0),
      R: b.R + (cur.R ?? 0),
      BB: b.BB + (cur.BB ?? 0),
      SB: b.SB + (cur.SB ?? 0),
    };
  }
  const p = base as CareerPitcherStats;
  const cur = player.stats as PitcherStats;
  const curG = cur.G ?? 0;
  return {
    seasons: p.seasons + (curG > 0 ? 1 : 0),
    G: p.G + curG,
    outs: p.outs + (cur.outs ?? 0),
    W: p.W + (cur.W ?? 0),
    L: p.L + (cur.L ?? 0),
    SV: p.SV + (cur.SV ?? 0),
    HLD: p.HLD + (cur.HLD ?? 0),
    SO: p.SO + (cur.SO ?? 0),
    ER: p.ER + (cur.ER ?? 0),
    BB: p.BB + (cur.BB ?? 0),
    H: p.H + (cur.H ?? 0),
  };
}

/**
 * 시즌 종료 후 다음 시즌으로 넘어갈 때 현재 시즌 기록을 영구 통산 기록에 합산
 */
export function commitSeasonStatsToCareer(player: Player): void {
  const live = getLiveCareerStats(player);
  player.careerStats = live;
  player.careerSeasons = live.seasons;
  if (player.role === '타자') {
    const lb = live as CareerBatterStats;
    player.careerHits = lb.H;
    player.careerHR = lb.HR;
  } else {
    const lp = live as CareerPitcherStats;
    player.careerWins = lp.W;
    player.careerSO = lp.SO;
  }
}

export function ensurePlayerRichMetadata(player: Player): void {
  if (!player.nationality) {
    if (player.category === '외국인' || player.category === '아시아쿼터') {
      player.nationality =
        REAL_FOREIGN_NATIONALITIES[player.name] ??
        (player.category === '아시아쿼터' ? '일본' : '미국');
    } else {
      player.nationality = '한국';
    }
  }
  if ((player.category === '외국인' || player.category === '아시아쿼터') && !player.previousLeagueClub) {
    player.previousLeagueClub =
      REAL_FOREIGN_PREVIOUS_CLUBS[player.name] ??
      (player.category === '아시아쿼터'
        ? player.nationality === '호주'
          ? 'ABL 호주 프로야구리그'
          : player.nationality === '대만'
          ? 'CPBL 대만 프로야구'
          : 'NPB 일본 프로야구'
        : 'AAA 마이너리그 (미국)');
  }
  if (player.category !== '국내') {
    player.militaryStatus = '해당 없음';
  } else if (!player.militaryStatus) {
    // 확인되지 않은 실제 국내 선수는 임의로 미필/군필 추정하지 않고 미확인 처리
    player.militaryStatus = '미확인';
  }
  if (!player.acquisitionInfo) {
    player.acquisitionInfo = buildPlayerAcquisitionInfo(player);
  }
  if (!player.careerStats) {
    const base = buildInitialCareerStats(player);
    player.careerStats = base;
    player.careerSeasons = base.seasons;
    if (player.role === '타자') {
      player.careerHits = (base as CareerBatterStats).H;
      player.careerHR = (base as CareerBatterStats).HR;
    } else {
      player.careerWins = (base as CareerPitcherStats).W;
      player.careerSO = (base as CareerPitcherStats).SO;
    }
  }
}

/**
 * 구단별 영구결번 목록 (신규 등번호 자동 배정 시 충돌 방지)
 */
export const REAL_KBO_RETIRED_NUMBERS: Record<TeamId, number[]> = {
  한화: [21, 23, 35, 52],
  LG: [9, 33, 41],
  SSG: [26],
  삼성: [10, 22, 36],
  NC: [],
  KT: [],
  롯데: [10, 11],
  KIA: [7, 18],
  두산: [21, 54],
  키움: [],
};

/**
 * 2026 KBO 10개 구단 실존 선수 등번호 매핑
 */
export const REAL_KBO_UNIFORM_NUMBERS: Record<TeamId, Record<string, number>> = {
  한화: {
    류현진: 99,
    문동주: 1,
    '윌켈 에르난데스': 34,
    '오웬 화이트': 44,
    왕옌청: 38,
    김서현: 54,
    주현상: 66,
    김종수: 36,
    박상원: 58,
    엄상백: 11,
    황준서: 29,
    조동욱: 15,
    정우주: 43,
    강재민: 65,
    문현빈: 51,
    페라자: 30,
    노시환: 8,
    강백호: 50,
    채은성: 22,
    허인서: 42,
    황영묵: 95,
    이진영: 41,
    심우준: 2,
    최재훈: 13,
    김태연: 25,
    이도윤: 7,
    하주석: 16,
    손아섭: 31,
    장규현: 32,
    유로결: 53,
    김기중: 57,
    김범수: 48,
    이태양: 46,
    한승주: 59,
    성지훈: 68,
    박상언: 45,
    정한균: 63,
    김인환: 37,
    임종찬: 33,
    이원석: 50,
  },
  LG: {
    홍창기: 51,
    문성주: 8,
    문보경: 2,
    오스틴: 23,
    박동원: 27,
    오지환: 10,
    박해민: 17,
    신민재: 4,
    구본혁: 6,
    치리노스: 46,
    톨허스트: 30,
    임찬규: 1,
    이정용: 31,
    김진성: 42,
    유영찬: 54,
    백승현: 61,
    김영우: 67,
    '라클란 웰스': 35,
    김대현: 45,
    박명근: 39,
    우강훈: 59,
    최채흥: 56,
    이주헌: 44,
    김범석: 55,
    이영빈: 7,
    최원영: 62,
    송찬의: 66,
    이지강: 50,
    문정빈: 64,
  },
  두산: {
    정수빈: 31,
    김민석: 2,
    양의지: 25,
    양석환: 53,
    카메론: 44,
    강승호: 23,
    박찬호: 1,
    오명진: 6,
    조수행: 51,
    플렉센: 34,
    잭로그: 29,
    곽빈: 47,
    최원준: 61,
    김택연: 63,
    이병헌: 29,
    박치국: 1,
    이용찬: 45,
    '다무라 이치로': 38,
    최준호: 65,
    김유성: 20,
    최승용: 28,
    최지강: 42,
    이영하: 50,
    김기연: 45,
    박준순: 16,
    이유찬: 13,
    김대한: 37,
    전다민: 49,
  },
  KT: {
    배정대: 27,
    김현수: 22,
    안현민: 23,
    장성우: 22,
    허경민: 13,
    힐리어드: 34,
    김상수: 7,
    오윤석: 4,
    최원준: 16,
    소형준: 30,
    사우어: 40,
    보쉴리: 43,
    스기모토: 38,
    박영현: 60,
    손동현: 41,
    김민수: 26,
    주권: 38,
    한승혁: 28,
    원상현: 63,
    육청명: 64,
    김민: 11,
    이상동: 37,
    우규민: 12,
    강현우: 55,
    문상철: 24,
    천성호: 59,
    권동진: 52,
    정준영: 58,
  },
  키움: {
    이주형: 2,
    김태진: 1,
    브룩스: 44,
    최주환: 53,
    임지열: 29,
    이형종: 36,
    김건희: 12,
    안치홍: 8,
    박수종: 14,
    알칸타라: 43,
    와일스: 33,
    하영민: 50,
    유토: 30,
    김재웅: 47,
    김성진: 49,
    박진형: 40,
    전준표: 59,
    정현우: 19,
    김윤하: 58,
    조영건: 20,
    윤석원: 61,
    박윤성: 62,
    김동헌: 42,
    이재상: 5,
    고영우: 10,
    장재영: 28,
    원성준: 66,
  },
  SSG: {
    최지훈: 54,
    박성한: 2,
    최정: 14,
    에레디아: 27,
    김재환: 32,
    고명준: 18,
    오태곤: 37,
    조형우: 20,
    정준재: 5,
    화이트: 55,
    베니지아노: 33,
    문승원: 42,
    김건우: 47,
    조병현: 19,
    노경은: 38,
    김택형: 29,
    이로운: 92,
    '다케다 쇼타': 30,
    송영진: 28,
    박종훈: 50,
    서진용: 22,
    박시후: 61,
    정동윤: 43,
    이지영: 59,
    박지환: 1,
    최준우: 3,
    하재훈: 13,
    김창평: 6,
  },
  NC: {
    박민우: 2,
    김주원: 7,
    박건우: 37,
    데이비슨: 24,
    권희동: 36,
    김휘집: 44,
    서호철: 5,
    김형준: 25,
    천재환: 23,
    구창모: 59,
    테일러: 30,
    토다: 38,
    류진욱: 41,
    임정호: 39,
    김진호: 54,
    배재환: 61,
    임영규: 55,
    '라일리 톰슨': 3,
    신영우: 43,
    이용준: 64,
    김시훈: 21,
    전사민: 29,
    손주환: 67,
    안중열: 1,
    김성욱: 31,
    김한별: 68,
    박시원: 58,
    한석현: 17,
  },
  KIA: {
    김도영: 5,
    김선빈: 3,
    나성범: 47,
    김호령: 53,
    카스트로: 27,
    오선우: 56,
    변우혁: 29,
    한준수: 55,
    윤도현: 9,
    네일: 40,
    올러: 33,
    양현종: 54,
    이의리: 48,
    정해영: 62,
    전상현: 51,
    조상우: 11,
    최지민: 39,
    '제리드 데일': 16,
    윤영철: 13,
    황동하: 41,
    곽도규: 68,
    김기훈: 0,
    김대유: 21,
    김태군: 42,
    김규성: 14,
    홍종표: 2,
    이창진: 8,
    박정우: 15,
  },
  삼성: {
    김지찬: 58,
    구자욱: 5,
    디아즈: 0,
    최형우: 34,
    김영웅: 30,
    이재현: 7,
    강민호: 47,
    류지혁: 16,
    김성윤: 39,
    후라도: 75,
    오러클린: 43,
    최원태: 3,
    이승현: 57,
    김재윤: 62,
    배찬승: 55,
    최지광: 40,
    임기영: 17,
    '미야지 유라': 38,
    황동재: 61,
    육선엽: 4,
    이호성: 1,
    최하늘: 49,
    김윤수: 37,
    김도환: 42,
    양도근: 68,
    전병우: 31,
    김현준: 50,
    윤정빈: 32,
  },
  롯데: {
    황성빈: 0,
    윤동희: 91,
    레이예스: 29,
    전준우: 8,
    손호영: 99,
    전민재: 13,
    유강남: 27,
    한태양: 6,
    장두성: 33,
    비슬리: 43,
    로드리게스: 30,
    박세웅: 21,
    이민석: 37,
    김원중: 34,
    최준용: 56,
    정철원: 65,
    윤성빈: 58,
    '교야마 마사야': 38,
    나균안: 40,
    김진욱: 15,
    정현수: 57,
    송재영: 59,
    진해수: 41,
    손성빈: 28,
    정보근: 42,
    박승욱: 53,
    김동혁: 50,
    추재현: 47,
  },
};

/**
 * 2026 기준 실존 주요 베테랑/주전 선수 연 나이 보정 (은퇴·성장 현실화)
 */
export const REAL_KBO_PLAYER_AGES: Record<TeamId, Record<string, number>> = {
  한화: {},
  LG: {
    홍창기: 33,
    문성주: 29,
    문보경: 26,
    오스틴: 33,
    박동원: 36,
    오지환: 36,
    박해민: 36,
    신민재: 30,
    구본혁: 29,
    치리노스: 32,
    톨허스트: 27,
    임찬규: 34,
    이정용: 30,
    김진성: 41,
    유영찬: 29,
    백승현: 31,
    김영우: 21,
  },
  두산: {
    정수빈: 36,
    김민석: 22,
    양의지: 39,
    양석환: 35,
    카메론: 29,
    강승호: 32,
    박찬호: 31,
    오명진: 25,
    조수행: 33,
    플렉센: 32,
    잭로그: 30,
    곽빈: 27,
    최원준: 32,
    김택연: 21,
    이병헌: 23,
    박치국: 28,
    이용찬: 37,
  },
  KT: {
    배정대: 31,
    김현수: 38,
    안현민: 23,
    장성우: 36,
    허경민: 36,
    힐리어드: 32,
    김상수: 36,
    오윤석: 34,
    최원준: 29,
    소형준: 25,
    사우어: 27,
    보쉴리: 32,
    박영현: 23,
    김민수: 34,
    주권: 31,
    한승혁: 33,
  },
  키움: {
    이주형: 25,
    김태진: 31,
    브룩스: 31,
    최주환: 38,
    임지열: 31,
    이형종: 37,
    김건희: 22,
    안치홍: 36,
    박수종: 27,
    알칸타라: 34,
    와일스: 28,
    하영민: 31,
    김재웅: 28,
    김성진: 26,
    박진형: 32,
    전준표: 21,
  },
  SSG: {
    최지훈: 29,
    박성한: 28,
    최정: 39,
    에레디아: 35,
    김재환: 38,
    고명준: 24,
    오태곤: 35,
    조형우: 24,
    정준재: 23,
    화이트: 31,
    베니지아노: 29,
    문승원: 37,
    김건우: 24,
    조병현: 24,
    노경은: 42,
    김택형: 30,
    이로운: 22,
  },
  NC: {
    박민우: 33,
    김주원: 24,
    박건우: 36,
    데이비슨: 35,
    권희동: 36,
    김휘집: 24,
    서호철: 30,
    김형준: 27,
    천재환: 32,
    구창모: 29,
    류진욱: 30,
    임정호: 36,
    김진호: 28,
    배재환: 31,
  },
  KIA: {
    김도영: 23,
    김선빈: 37,
    나성범: 37,
    김호령: 34,
    오선우: 30,
    변우혁: 26,
    한준수: 27,
    윤도현: 23,
    네일: 33,
    올러: 32,
    양현종: 38,
    이의리: 24,
    정해영: 25,
    전상현: 30,
    조상우: 32,
    최지민: 23,
  },
  삼성: {
    김지찬: 25,
    구자욱: 33,
    디아즈: 30,
    최형우: 43,
    김영웅: 23,
    이재현: 23,
    강민호: 41,
    류지혁: 32,
    김성윤: 27,
    후라도: 30,
    최원태: 29,
    이승현: 24,
    김재윤: 36,
    배찬승: 20,
    최지광: 28,
    임기영: 33,
  },
  롯데: {
    황성빈: 29,
    윤동희: 23,
    레이예스: 32,
    전준우: 40,
    손호영: 32,
    전민재: 27,
    유강남: 34,
    한태양: 23,
    장두성: 27,
    박세웅: 31,
    이민석: 23,
    김원중: 33,
    최준용: 25,
    정철원: 27,
    윤성빈: 27,
  },
};

export interface RealContractOverride {
  years: number;
  yearsRemaining: number;
  annualSalary: number; // 억 KRW or USD
  signingBonus: number;
  totalValue: number;
  currency: 'KRW' | 'USD';
  note: string;
  optionType?: PlayerContract['optionType'];
  optionYearSalary?: number;
}

/**
 * 2026 KBO 10개 구단 현실 다년계약 / FA 계약 기간 반영
 */
export const REAL_KBO_CONTRACTS: Record<TeamId, Record<string, RealContractOverride>> = {
  한화: {
    류현진: { years: 8, yearsRemaining: 6, annualSalary: 20, signingBonus: 0, totalValue: 170, currency: 'KRW', note: '8년 170억 비FA 다년계약 (잔여 6년)' },
    채은성: { years: 6, yearsRemaining: 3, annualSalary: 15, signingBonus: 0, totalValue: 90, currency: 'KRW', note: '6년 90억 FA 다년계약 (잔여 3년)' },
    엄상백: { years: 4, yearsRemaining: 3, annualSalary: 12, signingBonus: 30, totalValue: 78, currency: 'KRW', note: '4년 78억 FA 다년계약 (잔여 3년)' },
    심우준: { years: 4, yearsRemaining: 3, annualSalary: 8, signingBonus: 18, totalValue: 50, currency: 'KRW', note: '4년 50억 FA 다년계약 (잔여 3년)' },
    강백호: { years: 4, yearsRemaining: 4, annualSalary: 15, signingBonus: 40, totalValue: 100, currency: 'KRW', note: '4년 100억 FA 다년계약 (잔여 4년)' },
    최재훈: { years: 5, yearsRemaining: 1, annualSalary: 8, signingBonus: 14, totalValue: 54, currency: 'KRW', note: '5년 54억 FA 계약 (최종년)' },
  },
  LG: {
    오지환: { years: 6, yearsRemaining: 4, annualSalary: 16, signingBonus: 28, totalValue: 124, currency: 'KRW', note: '6년 124억 FA 다년계약 (잔여 4년)' },
    임찬규: { years: 4, yearsRemaining: 2, annualSalary: 10, signingBonus: 10, totalValue: 50, currency: 'KRW', note: '4년 50억 FA 다년계약 (잔여 2년)' },
    박동원: { years: 4, yearsRemaining: 1, annualSalary: 11, signingBonus: 21, totalValue: 65, currency: 'KRW', note: '4년 65억 FA 계약 (최종년)' },
    박해민: { years: 4, yearsRemaining: 3, annualSalary: 10, signingBonus: 20, totalValue: 60, currency: 'KRW', note: '4년 60억 FA 다년계약 (잔여 3년)' },
    김진성: { years: 2, yearsRemaining: 1, annualSalary: 3.5, signingBonus: 1, totalValue: 8, currency: 'KRW', note: '2년 8억 FA 계약 (잔여 1년)' },
    오스틴: { years: 1, yearsRemaining: 1, annualSalary: 1400000, signingBonus: 300000, totalValue: 1700000, currency: 'USD', note: '외국인 재계약 ($1,700,000)' },
    치리노스: { years: 1, yearsRemaining: 1, annualSalary: 800000, signingBonus: 200000, totalValue: 1000000, currency: 'USD', note: '외국인 1년 계약 ($1,000,000)' },
    톨허스트: { years: 1, yearsRemaining: 1, annualSalary: 700000, signingBonus: 200000, totalValue: 900000, currency: 'USD', note: '외국인 1년 계약 ($900,000)' },
  },
  두산: {
    양의지: { years: 6, yearsRemaining: 3, annualSalary: 20, signingBonus: 32, totalValue: 152, currency: 'KRW', note: '4+2년 152억 FA 다년계약 (잔여 3년)', optionType: '선수옵션', optionYearSalary: 18 },
    양석환: { years: 6, yearsRemaining: 4, annualSalary: 10, signingBonus: 18, totalValue: 78, currency: 'KRW', note: '4+2년 78억 FA 다년계약 (잔여 4년)', optionType: '구단옵션', optionYearSalary: 9 },
    정수빈: { years: 6, yearsRemaining: 1, annualSalary: 7, signingBonus: 14, totalValue: 56, currency: 'KRW', note: '6년 56억 FA 계약 (최종년)' },
    박찬호: { years: 4, yearsRemaining: 4, annualSalary: 11, signingBonus: 20, totalValue: 64, currency: 'KRW', note: '4년 64억 FA 다년계약 (잔여 4년)' },
    플렉센: { years: 1, yearsRemaining: 1, annualSalary: 800000, signingBonus: 200000, totalValue: 1000000, currency: 'USD', note: '외국인 1년 계약 ($1,000,000)' },
    잭로그: { years: 1, yearsRemaining: 1, annualSalary: 650000, signingBonus: 150000, totalValue: 800000, currency: 'USD', note: '외국인 1년 계약 ($800,000)' },
    카메론: { years: 1, yearsRemaining: 1, annualSalary: 700000, signingBonus: 200000, totalValue: 900000, currency: 'USD', note: '외국인 1년 계약 ($900,000)' },
  },
  KT: {
    허경민: { years: 4, yearsRemaining: 3, annualSalary: 6, signingBonus: 16, totalValue: 40, currency: 'KRW', note: '4년 40억 FA 다년계약 (잔여 3년)' },
    김현수: { years: 4, yearsRemaining: 3, annualSalary: 9, signingBonus: 12, totalValue: 48, currency: 'KRW', note: '4년 48억 FA 다년계약 (잔여 3년)' },
    장성우: { years: 4, yearsRemaining: 2, annualSalary: 7, signingBonus: 14, totalValue: 42, currency: 'KRW', note: '4년 42억 FA 다년계약 (잔여 2년)' },
    김상수: { years: 4, yearsRemaining: 1, annualSalary: 5, signingBonus: 9, totalValue: 29, currency: 'KRW', note: '4년 29억 FA 계약 (최종년)' },
    주권: { years: 4, yearsRemaining: 2, annualSalary: 3.5, signingBonus: 2, totalValue: 16, currency: 'KRW', note: '2+2년 16억 FA 다년계약 (잔여 2년)' },
    힐리어드: { years: 1, yearsRemaining: 1, annualSalary: 800000, signingBonus: 200000, totalValue: 1000000, currency: 'USD', note: '외국인 1년 계약 ($1,000,000)' },
    사우어: { years: 1, yearsRemaining: 1, annualSalary: 750000, signingBonus: 200000, totalValue: 950000, currency: 'USD', note: '외국인 1년 계약 ($950,000)' },
  },
  SSG: {
    최정: { years: 4, yearsRemaining: 3, annualSalary: 20, signingBonus: 30, totalValue: 110, currency: 'KRW', note: '4년 110억 FA 다년계약 (잔여 3년)' },
    문승원: { years: 5, yearsRemaining: 1, annualSalary: 9, signingBonus: 10, totalValue: 55, currency: 'KRW', note: '5년 55억 비FA 다년계약 (최종년)' },
    노경은: { years: 3, yearsRemaining: 2, annualSalary: 6, signingBonus: 7, totalValue: 25, currency: 'KRW', note: '2+1년 25억 FA 다년계약 (잔여 2년)' },
    김재환: { years: 2, yearsRemaining: 2, annualSalary: 8, signingBonus: 6, totalValue: 22, currency: 'KRW', note: '2년 22억 FA 다년계약 (잔여 2년)' },
    에레디아: { years: 1, yearsRemaining: 1, annualSalary: 1600000, signingBonus: 200000, totalValue: 1800000, currency: 'USD', note: '외국인 재계약 ($1,800,000)' },
    화이트: { years: 1, yearsRemaining: 1, annualSalary: 800000, signingBonus: 200000, totalValue: 1000000, currency: 'USD', note: '외국인 1년 계약 ($1,000,000)' },
  },
  삼성: {
    구자욱: { years: 5, yearsRemaining: 1, annualSalary: 20, signingBonus: 20, totalValue: 120, currency: 'KRW', note: '5년 120억 비FA 다년계약 (최종년)' },
    최원태: { years: 4, yearsRemaining: 3, annualSalary: 11, signingBonus: 26, totalValue: 70, currency: 'KRW', note: '4년 70억 FA 다년계약 (잔여 3년)' },
    강민호: { years: 4, yearsRemaining: 2, annualSalary: 7, signingBonus: 8, totalValue: 36, currency: 'KRW', note: '4년 36억 FA 다년계약 (잔여 2년)' },
    김재윤: { years: 4, yearsRemaining: 2, annualSalary: 9.5, signingBonus: 20, totalValue: 58, currency: 'KRW', note: '4년 58억 FA 다년계약 (잔여 2년)' },
    류지혁: { years: 4, yearsRemaining: 3, annualSalary: 5, signingBonus: 6, totalValue: 26, currency: 'KRW', note: '4년 26억 FA 다년계약 (잔여 3년)' },
    최형우: { years: 2, yearsRemaining: 1, annualSalary: 10, signingBonus: 2, totalValue: 22, currency: 'KRW', note: '2년 22억 베테랑 계약 (최종년)' },
    후라도: { years: 1, yearsRemaining: 1, annualSalary: 800000, signingBonus: 200000, totalValue: 1000000, currency: 'USD', note: '외국인 1년 계약 ($1,000,000)' },
    디아즈: { years: 1, yearsRemaining: 1, annualSalary: 800000, signingBonus: 200000, totalValue: 1000000, currency: 'USD', note: '외국인 1년 계약 ($1,000,000)' },
  },
  NC: {
    박민우: { years: 8, yearsRemaining: 5, annualSalary: 14, signingBonus: 28, totalValue: 140, currency: 'KRW', note: '5+3년 140억 FA 다년계약 (잔여 5년)' },
    박건우: { years: 6, yearsRemaining: 2, annualSalary: 13, signingBonus: 22, totalValue: 100, currency: 'KRW', note: '6년 100억 FA 다년계약 (잔여 2년)' },
    구창모: { years: 6, yearsRemaining: 4, annualSalary: 18, signingBonus: 24, totalValue: 132, currency: 'KRW', note: '6년 132억 비FA 다년계약 (잔여 4년)' },
    임정호: { years: 3, yearsRemaining: 2, annualSalary: 3.5, signingBonus: 1.5, totalValue: 12, currency: 'KRW', note: '3년 12억 FA 다년계약 (잔여 2년)' },
    데이비슨: { years: 2, yearsRemaining: 1, annualSalary: 1200000, signingBonus: 300000, totalValue: 1500000, currency: 'USD', note: '외국인 1+1년 계약 ($1,500,000)' },
  },
  KIA: {
    나성범: { years: 6, yearsRemaining: 2, annualSalary: 18, signingBonus: 42, totalValue: 150, currency: 'KRW', note: '6년 150억 FA 다년계약 (잔여 2년)' },
    김선빈: { years: 3, yearsRemaining: 1, annualSalary: 8, signingBonus: 6, totalValue: 30, currency: 'KRW', note: '3년 30억 FA 계약 (최종년)' },
    양현종: { years: 4, yearsRemaining: 2, annualSalary: 9, signingBonus: 9, totalValue: 45, currency: 'KRW', note: '4년 45억 FA 다년계약 (잔여 2년)' },
    김태군: { years: 3, yearsRemaining: 1, annualSalary: 7, signingBonus: 4, totalValue: 25, currency: 'KRW', note: '3년 25억 비FA 다년계약 (최종년)' },
    네일: { years: 1, yearsRemaining: 1, annualSalary: 1600000, signingBonus: 200000, totalValue: 1800000, currency: 'USD', note: '외국인 재계약 ($1,800,000)' },
    올러: { years: 1, yearsRemaining: 1, annualSalary: 800000, signingBonus: 200000, totalValue: 1000000, currency: 'USD', note: '외국인 1년 계약 ($1,000,000)' },
  },
  롯데: {
    유강남: { years: 4, yearsRemaining: 1, annualSalary: 12, signingBonus: 32, totalValue: 80, currency: 'KRW', note: '4년 80억 FA 계약 (최종년)' },
    박세웅: { years: 5, yearsRemaining: 2, annualSalary: 15, signingBonus: 15, totalValue: 90, currency: 'KRW', note: '5년 90억 비FA 다년계약 (잔여 2년)' },
    전준우: { years: 4, yearsRemaining: 2, annualSalary: 9.5, signingBonus: 9, totalValue: 47, currency: 'KRW', note: '4년 47억 FA 다년계약 (잔여 2년)' },
    김원중: { years: 4, yearsRemaining: 3, annualSalary: 9, signingBonus: 18, totalValue: 54, currency: 'KRW', note: '4년 54억 FA 다년계약 (잔여 3년)' },
    레이예스: { years: 1, yearsRemaining: 1, annualSalary: 1000000, signingBonus: 250000, totalValue: 1250000, currency: 'USD', note: '외국인 재계약 ($1,250,000)' },
    로드리게스: { years: 1, yearsRemaining: 1, annualSalary: 750000, signingBonus: 200000, totalValue: 950000, currency: 'USD', note: '외국인 1년 계약 ($950,000)' },
  },
  키움: {
    안치홍: { years: 6, yearsRemaining: 4, annualSalary: 9, signingBonus: 18, totalValue: 72, currency: 'KRW', note: '4+2년 72억 FA 다년계약 (잔여 4년)' },
    최주환: { years: 3, yearsRemaining: 2, annualSalary: 3.5, signingBonus: 1.5, totalValue: 12, currency: 'KRW', note: '2+1년 12억 다년계약 (잔여 2년)' },
    이형종: { years: 4, yearsRemaining: 1, annualSalary: 4, signingBonus: 4, totalValue: 20, currency: 'KRW', note: '4년 20억 퓨처스 FA 계약 (최종년)' },
    알칸타라: { years: 1, yearsRemaining: 1, annualSalary: 800000, signingBonus: 200000, totalValue: 1000000, currency: 'USD', note: '외국인 1년 계약 ($1,000,000)' },
    와일스: { years: 1, yearsRemaining: 1, annualSalary: 650000, signingBonus: 200000, totalValue: 850000, currency: 'USD', note: '외국인 1년 계약 ($850,000)' },
  },
};

export interface DevelopmentalSeed {
  name: string;
  role: '투수' | '타자';
  position: Position;
  pitchRole?: Player['pitchRole'];
  age: number;
  ability: number;
  potential: number;
  uniformNumber: number;
}

/**
 * 10개 구단 육성선수 명단 (현실적인 육성선수 능력치 50~57, 잠재력 67~79 / 희소 원석 80~82 · 등번호 101~139)
 */
export const DEVELOPMENTAL_PLAYERS_SEED: Record<TeamId, DevelopmentalSeed[]> = {
  한화: [
    { name: '김도빈', role: '투수', position: 'RP', pitchRole: '중간', age: 21, ability: 53, potential: 73, uniformNumber: 101 },
    { name: '박성빈', role: '투수', position: 'SP', pitchRole: '선발', age: 20, ability: 52, potential: 77, uniformNumber: 102 },
    { name: '이민재', role: '타자', position: 'CF', age: 22, ability: 54, potential: 72, uniformNumber: 103 },
    { name: '정현석', role: '타자', position: 'C', age: 20, ability: 51, potential: 75, uniformNumber: 104 },
  ],
  LG: [
    { name: '박관우', role: '타자', position: 'RF', age: 20, ability: 54, potential: 78, uniformNumber: 101 },
    { name: '성동현', role: '투수', position: 'RP', pitchRole: '중간', age: 23, ability: 55, potential: 72, uniformNumber: 102 },
    { name: '김종운', role: '투수', position: 'SP', pitchRole: '선발', age: 20, ability: 53, potential: 80, uniformNumber: 103 },
    { name: '강민균', role: '타자', position: '2B', age: 22, ability: 52, potential: 71, uniformNumber: 104 },
  ],
  SSG: [
    { name: '이승민', role: '타자', position: 'LF', age: 20, ability: 53, potential: 76, uniformNumber: 101 },
    { name: '천범석', role: '투수', position: 'RP', pitchRole: '중간', age: 21, ability: 52, potential: 74, uniformNumber: 102 },
    { name: '신지환', role: '투수', position: 'SP', pitchRole: '선발', age: 20, ability: 51, potential: 75, uniformNumber: 103 },
    { name: '최윤석', role: '타자', position: 'SS', age: 21, ability: 53, potential: 73, uniformNumber: 104 },
  ],
  삼성: [
    { name: '박주혁', role: '투수', position: 'RP', pitchRole: '중간', age: 21, ability: 53, potential: 74, uniformNumber: 101 },
    { name: '김성경', role: '투수', position: 'SP', pitchRole: '선발', age: 22, ability: 54, potential: 75, uniformNumber: 102 },
    { name: '함수호', role: '타자', position: 'RF', age: 20, ability: 53, potential: 79, uniformNumber: 103 },
    { name: '차승준', role: '타자', position: '3B', age: 20, ability: 54, potential: 78, uniformNumber: 104 },
  ],
  NC: [
    { name: '김녹원', role: '투수', position: 'SP', pitchRole: '선발', age: 22, ability: 54, potential: 75, uniformNumber: 101 },
    { name: '박주찬', role: '타자', position: '2B', age: 23, ability: 55, potential: 71, uniformNumber: 102 },
    { name: '이세민', role: '타자', position: '1B', age: 20, ability: 52, potential: 74, uniformNumber: 103 },
    { name: '홍유원', role: '투수', position: 'RP', pitchRole: '추격조', age: 21, ability: 51, potential: 73, uniformNumber: 104 },
  ],
  KT: [
    { name: '김동현', role: '투수', position: 'SP', pitchRole: '선발', age: 20, ability: 55, potential: 81, uniformNumber: 101 },
    { name: '박건우', role: '투수', position: 'RP', pitchRole: '중간', age: 21, ability: 52, potential: 73, uniformNumber: 102 },
    { name: '오서진', role: '타자', position: 'SS', age: 20, ability: 53, potential: 75, uniformNumber: 103 },
    { name: '이용현', role: '타자', position: 'C', age: 22, ability: 52, potential: 72, uniformNumber: 104 },
  ],
  롯데: [
    { name: '박준우', role: '투수', position: 'RP', pitchRole: '중간', age: 21, ability: 54, potential: 76, uniformNumber: 101 },
    { name: '이태연', role: '투수', position: 'SP', pitchRole: '선발', age: 22, ability: 53, potential: 74, uniformNumber: 102 },
    { name: '소지호', role: '타자', position: '2B', age: 21, ability: 52, potential: 73, uniformNumber: 103 },
    { name: '강승구', role: '타자', position: 'CF', age: 20, ability: 53, potential: 75, uniformNumber: 104 },
  ],
  KIA: [
    { name: '성영탁', role: '투수', position: 'RP', pitchRole: '중간', age: 21, ability: 54, potential: 75, uniformNumber: 101 },
    { name: '김민주', role: '투수', position: 'SP', pitchRole: '선발', age: 22, ability: 53, potential: 73, uniformNumber: 102 },
    { name: '박재현', role: '타자', position: 'CF', age: 20, ability: 53, potential: 78, uniformNumber: 103 },
    { name: '정해원', role: '타자', position: '3B', age: 22, ability: 54, potential: 74, uniformNumber: 104 },
  ],
  두산: [
    { name: '김무빈', role: '투수', position: 'SP', pitchRole: '선발', age: 21, ability: 54, potential: 76, uniformNumber: 101 },
    { name: '임종성', role: '타자', position: '3B', age: 21, ability: 54, potential: 78, uniformNumber: 102 },
    { name: '여동건', role: '타자', position: '2B', age: 21, ability: 53, potential: 75, uniformNumber: 103 },
    { name: '박지호', role: '투수', position: 'RP', pitchRole: '중간', age: 22, ability: 53, potential: 72, uniformNumber: 104 },
  ],
  키움: [
    { name: '김서준', role: '투수', position: 'SP', pitchRole: '선발', age: 20, ability: 54, potential: 80, uniformNumber: 101 },
    { name: '어준서', role: '타자', position: 'SS', age: 20, ability: 54, potential: 78, uniformNumber: 102 },
    { name: '염승원', role: '타자', position: '2B', age: 20, ability: 53, potential: 76, uniformNumber: 103 },
    { name: '손힘찬', role: '투수', position: 'RP', pitchRole: '중간', age: 21, ability: 51, potential: 73, uniformNumber: 104 },
  ],
};

/**
 * 구단 내 충돌 없는 등번호 배정 (정식선수: 0~99 영구결번 제외 / 육성선수: 101~139)
 */
export function allocateTeamUniformNumber(
  players: Record<string, Player>,
  teamId: TeamId,
  isDevelopmental: boolean,
  preferred?: number,
  extraRetiredNumbers?: number[]
): number {
  const retired = new Set<number>([
    ...(REAL_KBO_RETIRED_NUMBERS[teamId] ?? []),
    ...(extraRetiredNumbers ?? []),
  ]);
  const used = new Set<number>();
  for (const p of Object.values(players)) {
    if (
      p.teamId === teamId &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적' &&
      p.uniformNumber !== undefined
    ) {
      used.add(p.uniformNumber);
    }
  }

  if (isDevelopmental) {
    if (preferred !== undefined && preferred >= 101 && preferred <= 139 && !used.has(preferred)) {
      return preferred;
    }
    for (let n = 101; n <= 139; n++) {
      if (!used.has(n)) return n;
    }
    return 140 + used.size;
  }

  if (
    preferred !== undefined &&
    preferred >= 0 &&
    preferred <= 99 &&
    !retired.has(preferred) &&
    !used.has(preferred)
  ) {
    return preferred;
  }

  // Prefer realistic KBO numbers 1..99 then 0
  for (let n = 1; n <= 99; n++) {
    if (!retired.has(n) && !used.has(n)) return n;
  }
  if (!retired.has(0) && !used.has(0)) return 0;
  return 99;
}

/**
 * 영구결번(KBO 실존 영구결번 + 단장 지정 영구결번)을 현역 선수가 착용하고 있는 경우 즉시 빈 번호로 재배정합니다.
 */
export function enforceNoRetiredUniformNumbers(
  players: Record<string, Player>,
  extraRetiredByTeam?: Partial<Record<TeamId, number[]>>
): number {
  let reassigned = 0;
  for (const tid of TEAM_IDS) {
    const retired = new Set<number>([
      ...(REAL_KBO_RETIRED_NUMBERS[tid] ?? []),
      ...(extraRetiredByTeam?.[tid] ?? []),
    ]);
    if (retired.size === 0) continue;
    const extraArr = Array.from(retired);
    for (const p of Object.values(players)) {
      if (
        p.teamId === tid &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적' &&
        p.rosterTier !== '육성' &&
        p.uniformNumber !== undefined &&
        retired.has(p.uniformNumber)
      ) {
        p.uniformNumber = allocateTeamUniformNumber(players, tid, false, undefined, extraArr);
        reassigned++;
      }
    }
  }
  return reassigned;
}

/**
 * 10개 구단 전체에 육성선수 4명씩 추가 (이름 충돌 방지)
 */
export function appendTeamDevelopmentalSquad(
  players: Record<string, Player>,
  tid: TeamId
): void {
  const existingTeamNames = new Set(
    Object.values(players)
      .filter((p) => p.teamId === tid)
      .map((p) => p.name)
  );

  const seeds = DEVELOPMENTAL_PLAYERS_SEED[tid] ?? [];
  seeds.forEach((s, idx) => {
    if (existingTeamNames.has(s.name)) return;
    const pid = `${tid}-육성-${idx + 1}-${s.name}`;
    const num = allocateTeamUniformNumber(players, tid, true, s.uniformNumber);
    players[pid] = {
      id: pid,
      name: s.name,
      teamId: tid,
      category: '국내',
      role: s.role,
      position: s.position,
      pitchRole: s.pitchRole,
      age: s.age,
      ability: s.ability,
      potential: s.potential,
      abilityStatus: '확정',
      form: 0,
      fatigue: 0,
      lastPitchedRound: 0,
      consecutiveAppearances: 0,
      rosterTier: '육성',
      gameDayActive: false,
      uniformNumber: num,
      nationality: '한국',
      acquisitionInfo: {
        type: '육성선수',
        draftYear: Math.max(2022, 2026 - Math.max(0, s.age - 19)),
        wasDevelopmental: true,
        label: `${Math.max(2022, 2026 - Math.max(0, s.age - 19))} 육성선수 입단`,
      },
      contract: {
        status: '확정',
        currency: 'KRW',
        years: 1,
        yearsRemaining: 1,
        annualSalary: 0.3,
        signingBonus: 0,
        totalValue: 0.3,
        startSeason: 2026,
        endSeason: 2026,
        note: '육성선수 계약 (정식선수 전환 시 1군 등록 가능)',
      },
      injury: null,
      morale: '보통',
      trainingFocus: null,
      serviceYears: 0,
      seasonRatingDelta: 0,
      lastEvaluatedAtTeamGames: 0,
      stats: s.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
      postseasonStats: s.role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
    };
    ensurePlayerRichMetadata(players[pid]);
    existingTeamNames.add(s.name);
  });
}

/**
 * 10개 구단 실존 선수에게 현실 나이, 현실 계약 기간, 고유 등번호 및 육성선수를 일괄 반영합니다.
 * 마스터 v4.60.30 한화 세이브 보존 모드에서는 한화의 확정 게임 계약 및 미확인 원자료 규칙을 유지합니다.
 */
export function applyRealPlayerMetadataAndNumbers(
  players: Record<string, Player>,
  options: { preserveHanwhaMasterContracts: boolean; preserveExistingContractsAndAges?: boolean }
): void {
  // 1) Append developmental squad for all 10 teams if not yet present
  for (const tid of TEAM_IDS) {
    const hasDev = Object.values(players).some(
      (p) => p.teamId === tid && p.rosterTier === '육성'
    );
    if (!hasDev) {
      appendTeamDevelopmentalSquad(players, tid);
    }
  }

  // 2) Apply realistic ages & realistic multi-year contracts (only during initial setup; never clobber in-game mutations)
  if (!options.preserveExistingContractsAndAges) {
  for (const p of Object.values(players)) {
    const realAge = REAL_KBO_PLAYER_AGES[p.teamId]?.[p.name];
    if (realAge !== undefined && !(options.preserveHanwhaMasterContracts && p.teamId === '한화')) {
      p.age = realAge;
      const realSy = REAL_KBO_2026_SERVICE_YEARS[p.name];
      if (realSy !== undefined) {
        p.serviceYears = realSy;
      } else {
        // 입단연도·나이 상한 내 현실적 연차 산정 (예전 Math.max 버그로 21세 9년차 등이 발생하던 문제 근절)
        const maxPossible = Math.max(0, realAge - 19);
        const estimated = p.rosterTier === '1군'
          ? Math.max(0, Math.min(maxPossible, realAge - 21))
          : Math.max(0, Math.min(maxPossible, realAge - 22));
        p.serviceYears = Math.min(maxPossible, Math.max(estimated, Math.min(p.serviceYears, maxPossible)));
      }
    }

    const contractOverride = REAL_KBO_CONTRACTS[p.teamId]?.[p.name];
    if (contractOverride) {
      if (options.preserveHanwhaMasterContracts && p.teamId === '한화') {
        // Keep v4.60.30 master contract status intact, only enrich years/note where already multi-year or unconfirmed
        if (p.contract.status === '미확인' || p.name === '류현진') {
          p.contract.years = contractOverride.years;
          p.contract.yearsRemaining = contractOverride.yearsRemaining;
          if (p.name !== '류현진') {
            p.contract.note = `${contractOverride.note} (기존 계약 유지)`;
          }
        }
      } else {
        const alreadySyncedOverride =
          p.contract.years === contractOverride.years &&
          p.contract.yearsRemaining === contractOverride.yearsRemaining &&
          typeof p.contract.startSeason === 'number' &&
          typeof p.contract.endSeason === 'number' &&
          p.contract.endSeason - p.contract.startSeason + 1 === contractOverride.years;
        const currentSeasonBase =
          typeof p.contract.startSeason === 'number' && p.contract.startSeason >= 2026
            ? p.contract.startSeason
            : 2026;
        const computedEndSeason = alreadySyncedOverride
          ? p.contract.endSeason!
          : currentSeasonBase + contractOverride.yearsRemaining - 1;
        const computedStartSeason = alreadySyncedOverride
          ? p.contract.startSeason!
          : computedEndSeason - contractOverride.years + 1;
        p.contract = {
          ...p.contract,
          status: '확정',
          currency: contractOverride.currency,
          years: contractOverride.years,
          yearsRemaining: contractOverride.yearsRemaining,
          startSeason: computedStartSeason,
          endSeason: computedEndSeason,
          annualSalary: contractOverride.annualSalary,
          signingBonus: contractOverride.signingBonus,
          totalValue: contractOverride.totalValue,
          note: contractOverride.note,
          optionType: contractOverride.optionType ?? p.contract.optionType,
          optionYearSalary: contractOverride.optionYearSalary ?? p.contract.optionYearSalary,
        };
      }
    } else if (
      p.contract.annualSalary === 0 &&
      p.contract.totalValue === 0 &&
      !(options.preserveHanwhaMasterContracts && p.teamId === '한화')
    ) {
      // Realistic 1-year KBO baseline salary for non-multi-year players
      if (p.category === '외국인') {
        const usd = Math.min(1_000_000, Math.max(600_000, Math.round((500_000 + (p.ability - 65) * 20_000) / 50_000) * 50_000));
        p.contract = {
          ...p.contract,
          currency: 'USD',
          years: 1,
          yearsRemaining: 1,
          annualSalary: Math.round(usd * 0.8),
          signingBonus: Math.round(usd * 0.2),
          totalValue: usd,
          note: `외국인 1년 계약 ($${usd.toLocaleString()})`,
        };
      } else if (p.category === '아시아쿼터') {
        p.contract = {
          ...p.contract,
          currency: 'USD',
          years: 1,
          yearsRemaining: 1,
          annualSalary: 150000,
          signingBonus: 0,
          totalValue: 150000,
          note: '아시아쿼터 1년 계약 ($150,000)',
        };
      } else {
        const sal =
          p.rosterTier === '1군'
            ? Number(Math.max(0.6, Math.min(8.0, 0.5 + Math.max(0, p.ability - 68) * 0.25 + p.serviceYears * 0.18)).toFixed(2))
            : p.rosterTier === '육성'
            ? 0.3
            : 0.4;
        p.contract = {
          ...p.contract,
          currency: 'KRW',
          years: 1,
          yearsRemaining: 1,
          annualSalary: sal,
          signingBonus: 0,
          totalValue: sal,
          note: p.rosterTier === '1군' ? `1년 연봉계약 (${sal.toFixed(2)}억)` : p.contract.note,
        };
      }
      // Always populate realistic contract start/end season years
      if (p.contract.years > 0 && p.contract.yearsRemaining > 0) {
        const endSeason = 2026 + p.contract.yearsRemaining - 1;
        const startSeason = endSeason - p.contract.years + 1;
        if (p.contract.startSeason === undefined) p.contract.startSeason = startSeason;
        if (p.contract.endSeason === undefined) p.contract.endSeason = endSeason;
      }
    }
  }
  }

  // 2.5) 전 구단 국내 선수 나이·입단연도·1군 등록일수(145일=1시즌) 정합성 최종 검증
  if (!options.preserveExistingContractsAndAges) {
    sanitizePlayerAgeAndServiceYearsInPlace(players, 2026);
  }

  // 3) Assign unique uniform numbers per team (preferring real KBO numbers, avoiding retired numbers)
  for (const tid of TEAM_IDS) {
    const teamPlayers = Object.values(players)
      .filter((p) => p.teamId === tid && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적')
      .sort((a, b) => {
        const tierOrder = (t: Player['rosterTier']) =>
          t === '1군' ? 0 : t === '대기' ? 1 : t === '2군' ? 2 : 3;
        return tierOrder(a.rosterTier) - tierOrder(b.rosterTier) || b.ability - a.ability;
      });

    // Clear and assign deterministically only for players lacking numbers or colliding
    const retired = new Set(REAL_KBO_RETIRED_NUMBERS[tid] ?? []);
    const assigned = new Set<number>();

    // First pass: honor authentic real KBO uniform numbers if no collision
    for (const p of teamPlayers) {
      if (p.rosterTier === '육성') continue;
      const realNum = REAL_KBO_UNIFORM_NUMBERS[tid]?.[p.name];
      if (realNum !== undefined && !retired.has(realNum) && !assigned.has(realNum)) {
        p.uniformNumber = realNum;
        assigned.add(realNum);
      } else if (
        p.uniformNumber !== undefined &&
        p.uniformNumber >= 0 &&
        p.uniformNumber <= 99 &&
        !retired.has(p.uniformNumber) &&
        !assigned.has(p.uniformNumber)
      ) {
        assigned.add(p.uniformNumber);
      } else {
        p.uniformNumber = undefined;
      }
    }

    // Second pass: allocate remaining regular numbers (1..99, 0) and developmental numbers (101..139)
    for (const p of teamPlayers) {
      if (p.rosterTier === '육성') {
        const cur = p.uniformNumber;
        if (cur !== undefined && cur >= 101 && cur <= 139 && !assigned.has(cur)) {
          assigned.add(cur);
        } else {
          let nextDev = 101;
          while (assigned.has(nextDev)) nextDev++;
          p.uniformNumber = nextDev;
          assigned.add(nextDev);
        }
        continue;
      }
      if (p.uniformNumber === undefined) {
        let pick: number | undefined;
        for (let n = 1; n <= 99; n++) {
          if (!retired.has(n) && !assigned.has(n)) {
            pick = n;
            break;
          }
        }
        if (pick === undefined && !retired.has(0) && !assigned.has(0)) pick = 0;
        p.uniformNumber = pick ?? 99;
        assigned.add(p.uniformNumber);
      }
    }
  }

  // 4) Populate nationality, draft/developmental acquisitionInfo & KBO career baseline stats for all players
  for (const p of Object.values(players)) {
    ensurePlayerRichMetadata(p);
  }

  // 5) 최종 일괄 정합성 보정 (나이·입단연도·연차·1군 등록일수 100% 일치 보장)
  sanitizePlayerAgeAndServiceYearsInPlace(players, 2026);
}
