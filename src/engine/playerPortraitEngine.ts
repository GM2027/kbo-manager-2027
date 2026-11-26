import {
  CLUB_UNIFORM_PALETTES,
  PortraitUniformKey,
  resolveLicensedRealPlayerPhoto,
} from '../data/playerPortraitRegistry';
import { getOrCreateCachedPortrait } from '../storage/portraitCacheStorage';
import { Player, PlayerAppearanceProfile } from '../types/kbo';
import { isMilitaryServing } from './militaryEngine';

const PORTRAIT_SCHEMA_VERSION = 'v1';

/**
 * 선수 고유 ID 기반 영구 얼굴 식별키 (트레이드·FA 이적·시즌 경과와 무관하게 동일 얼굴 유지)
 */
export function getPlayerPortraitIdentityKey(player: Player): string {
  return player.permanentId || player.kboOfficialId || player.id;
}

/**
 * 현재 소속 구단·군복무·FA·은퇴 상태를 반영한 유니폼/모자 키 산출
 * - 트레이드·FA 이적 시 teamId가 바뀌므로 모자와 유니폼이 즉시 새 구단으로 전환됩니다.
 */
export function getPlayerUniformKey(player: Player): PortraitUniformKey {
  if (player.rosterTier === '은퇴') return 'RETIRED';
  if (isMilitaryServing(player.militaryStatus)) return '상무';
  if (player.rosterTier === 'FA') return 'FA';
  return player.teamId;
}

/**
 * 가상 신인 · 가상 외국인 · 생성 선수 여부 판별
 * - 실존 KBO 선수(originType === 'real' 또는 kboOfficialId/v18SourceId 보유)와 명확히 구분
 */
export function isVirtualOrGeneratedPlayer(player: Player): boolean {
  if (player.originType === 'virtual') return true;
  if (player.originType === 'real') return false;
  if (player.kboOfficialId || player.v18SourceId) return false;
  if (
    player.id.startsWith('draft-') ||
    player.id.startsWith('ai-for-rep-') ||
    player.id.startsWith('dev-') ||
    player.id.startsWith('custom-') ||
    player.id.startsWith('vfor-') ||
    player.id.startsWith('virt-')
  ) {
    return true;
  }
  return false;
}

function hashStringDeterministic(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextRand(seedState: { s: number }): number {
  seedState.s = (Math.imul(seedState.s, 1664525) + 1013904223) >>> 0;
  return seedState.s / 0xffffffff;
}

function pickFrom<T>(arr: readonly T[], rng: { s: number }): T {
  return arr[Math.floor(nextRand(rng) * arr.length) % arr.length];
}

function classifyNationalityRegion(nationality?: string): 'east_asian' | 'latin' | 'western' {
  const nat = (nationality ?? '한국').trim().toLowerCase();
  if (
    nat.includes('한국') ||
    nat.includes('일본') ||
    nat.includes('대만') ||
    nat.includes('중국') ||
    nat.includes('kor') ||
    nat.includes('jpn') ||
    nat.includes('twn')
  ) {
    return 'east_asian';
  }
  if (
    nat.includes('도미니카') ||
    nat.includes('베네수엘라') ||
    nat.includes('쿠바') ||
    nat.includes('푸에르토리코') ||
    nat.includes('멕시코') ||
    nat.includes('파나마') ||
    nat.includes('콜롬비아') ||
    nat.includes('퀴라소') ||
    nat.includes('브라질') ||
    nat.includes('니카라과')
  ) {
    return 'latin';
  }
  return 'western';
}

/**
 * 가상 선수의 나이·국적·고유 ID를 반영해 최초 1회 영구 외형 프로필을 생성합니다.
 */
export function buildPlayerAppearanceProfile(
  player: Player,
  season: number
): PlayerAppearanceProfile {
  const identityKey = getPlayerPortraitIdentityKey(player);
  const faceSeed = hashStringDeterministic(`${identityKey}::face_v1`);
  const rng = { s: faceSeed || 1337 };
  const region = classifyNationalityRegion(player.nationality);
  const age = player.age ?? 22;

  const faceShapes: PlayerAppearanceProfile['faceShape'][] = ['oval', 'square', 'diamond', 'round'];
  const faceShape = pickFrom(faceShapes, rng);

  // 피부톤 팔레트 (0: 밝은 동아시아, 1: 자연 동아시아, 2: 밝은 서구권, 3: 웜 탠, 4: 라틴 브론즈, 5: 딥 브라운)
  const skinToneIndex =
    region === 'east_asian'
      ? pickFrom([0, 1, 1, 3], rng)
      : region === 'latin'
      ? pickFrom([3, 4, 4, 5], rng)
      : pickFrom([2, 2, 3, 4, 5], rng);

  const hairStyles: PlayerAppearanceProfile['hairStyle'][] =
    age <= 22
      ? ['short_crop', 'textured_fringe', 'side_part', 'buzz']
      : region === 'latin'
      ? ['short_crop', 'curly_taper', 'buzz', 'long_flow']
      : ['short_crop', 'side_part', 'buzz', 'textured_fringe', 'long_flow'];
  const hairStyle = pickFrom(hairStyles, rng);

  let hairColor: PlayerAppearanceProfile['hairColor'] =
    region === 'east_asian'
      ? pickFrom(['jet_black', 'jet_black', 'dark_brown'], rng)
      : region === 'latin'
      ? pickFrom(['jet_black', 'dark_brown', 'dark_brown'], rng)
      : pickFrom(['dark_brown', 'chestnut', 'dirty_blonde', 'jet_black'], rng);
  if (age >= 36 && nextRand(rng) < 0.35) {
    hairColor = 'salt_pepper';
  }

  const eyebrowStyle = pickFrom(['thick', 'straight', 'arched'] as const, rng);

  let facialHair: PlayerAppearanceProfile['facialHair'] = 'none';
  if (age >= 24) {
    const roll = nextRand(rng);
    if (region === 'east_asian') {
      if (age >= 29 && roll < 0.14) facialHair = 'light_stubble';
      else if (age >= 31 && roll < 0.2) facialHair = 'goatee';
    } else {
      if (roll < 0.28) facialHair = 'light_stubble';
      else if (roll < 0.44) facialHair = 'short_beard';
      else if (roll < 0.56) facialHair = 'goatee';
      else if (roll < 0.64) facialHair = 'mustache';
    }
  }

  const eyeBlack = player.role === '타자' && nextRand(rng) < 0.26;
  const glassesRoll = nextRand(rng);
  const glasses: PlayerAppearanceProfile['glasses'] =
    glassesRoll < 0.06 ? 'classic' : glassesRoll < 0.1 ? 'sport' : 'none';

  const build: PlayerAppearanceProfile['build'] =
    age <= 20
      ? pickFrom(['lean', 'athletic'] as const, rng)
      : player.position === '1B' || player.position === 'DH' || player.position === 'C'
      ? pickFrom(['athletic', 'broad', 'broad'] as const, rng)
      : pickFrom(['lean', 'athletic', 'athletic', 'broad'] as const, rng);

  return {
    faceSeed,
    faceShape,
    skinToneIndex,
    hairStyle,
    hairColor,
    eyebrowStyle,
    facialHair,
    eyeBlack,
    glasses,
    build,
    generatedAtSeason: season,
  };
}

/**
 * 가상·생성 선수의 외형 프로필을 최초 1회만 생성해 선수 객체에 연결합니다.
 */
export function ensurePlayerPortraitProfileInPlace(
  player: Player,
  season: number
): PlayerAppearanceProfile {
  if (player.portraitProfile) return player.portraitProfile;
  const created = buildPlayerAppearanceProfile(player, season);
  player.portraitProfile = created;
  return created;
}

const SKIN_PALETTES: Array<{ base: string; shade: string; deep: string; highlight: string }> = [
  { base: '#f3d2b8', shade: '#deb392', deep: '#c08f6c', highlight: '#fbe4d1' }, // 0: 밝은 동아시아
  { base: '#e5bc98', shade: '#cca079', deep: '#a87c58', highlight: '#f3d3b6' }, // 1: 자연 동아시아
  { base: '#f0c8b0', shade: '#d9a78c', deep: '#b88267', highlight: '#fae0d0' }, // 2: 밝은 서구권
  { base: '#d8a57e', shade: '#bd8760', deep: '#996643', highlight: '#e7bd9c' }, // 3: 웜 탠
  { base: '#b97e56', shade: '#99623d', deep: '#754628', highlight: '#cc956f' }, // 4: 라틴 브론즈
  { base: '#875334', shade: '#6b3e24', deep: '#4e2b17', highlight: '#9e6847' }, // 5: 딥 브라운
];

const HAIR_COLORS: Record<PlayerAppearanceProfile['hairColor'], { main: string; hi: string }> = {
  jet_black: { main: '#171717', hi: '#333333' },
  dark_brown: { main: '#2d1e15', hi: '#4a3426' },
  chestnut: { main: '#5b341e', hi: '#7c4c30' },
  dirty_blonde: { main: '#967642', hi: '#b5955d' },
  salt_pepper: { main: '#475569', hi: '#94a3b8' },
};

function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 로딩 실패 또는 공식 사진 미등록 실존 선수용 구단 유니폼·모자 기본 선수 실루엣 SVG
 */
export function renderPlayerSilhouetteDataUrl(
  uniformKey: PortraitUniformKey,
  uniformNumber?: number
): string {
  const pal = CLUB_UNIFORM_PALETTES[uniformKey] ?? CLUB_UNIFORM_PALETTES.FA;
  const numText = uniformNumber !== undefined ? `#${uniformNumber}` : '';
  const pinstripes = pal.jerseyPinstripe
    ? `<g opacity="0.22" stroke="${pal.jerseyPinstripe}" stroke-width="1.4">
        <line x1="36" y1="142" x2="36" y2="200"/>
        <line x1="50" y1="138" x2="50" y2="200"/>
        <line x1="64" y1="136" x2="64" y2="200"/>
        <line x1="96" y1="136" x2="96" y2="200"/>
        <line x1="110" y1="138" x2="110" y2="200"/>
        <line x1="124" y1="142" x2="124" y2="200"/>
      </g>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" width="160" height="200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.bgFrom}"/>
      <stop offset="100%" stop-color="${pal.bgTo}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="36%" r="55%">
      <stop offset="0%" stop-color="${pal.accent}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${pal.bgTo}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cbd5e1" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#94a3b8" stop-opacity="0.88"/>
    </linearGradient>
  </defs>
  <rect width="160" height="200" fill="url(#bg)"/>
  <rect width="160" height="200" fill="url(#glow)"/>
  <!-- Shoulders & Club Jersey -->
  <path d="M12,200 C16,158 38,142 62,137 L98,137 C122,142 144,158 148,200 Z" fill="${pal.jerseyBase}"/>
  ${pal.jerseyRaglan ? `<path d="M12,200 C16,158 38,142 58,138 L46,200 Z M148,200 C144,158 122,142 102,138 L114,200 Z" fill="${pal.jerseyRaglan}" opacity="0.92"/>` : ''}
  ${pinstripes}
  <path d="M62,137 L80,158 L98,137 Z" fill="${pal.undershirt}"/>
  <path d="M62,137 L80,158 L98,137" fill="none" stroke="${pal.jerseyPiping}" stroke-width="3.2" stroke-linejoin="round"/>
  <line x1="80" y1="158" x2="80" y2="200" stroke="${pal.jerseyPiping}" stroke-width="2.4"/>
  <!-- Neck & Head Silhouette -->
  <rect x="67" y="114" width="26" height="28" rx="9" fill="url(#sil)"/>
  <ellipse cx="80" cy="86" rx="28" ry="34" fill="url(#sil)"/>
  <ellipse cx="51" cy="88" rx="4.5" ry="8" fill="#94a3b8" opacity="0.85"/>
  <ellipse cx="109" cy="88" rx="4.5" ry="8" fill="#94a3b8" opacity="0.85"/>
  <!-- Club Baseball Cap -->
  <path d="M47,70 C47,39 63,31 80,31 C97,31 113,39 113,70 Z" fill="${pal.capCrown}"/>
  <circle cx="80" cy="31" r="2.6" fill="${pal.capBrim}"/>
  <path d="M45,69 Q80,58 115,69 Q80,75 45,69 Z" fill="${pal.capBrim}"/>
  <text x="80" y="55" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="13" fill="${pal.capLogoColor}" letter-spacing="0.5">${pal.capLogoText}</text>
  ${numText ? `<text x="115" y="184" text-anchor="middle" font-family="monospace" font-weight="900" font-size="13" fill="${pal.jerseyPiping}" opacity="0.85">${numText}</text>` : ''}
</svg>`;
  return encodeSvgDataUrl(svg);
}

/**
 * 가상 신인·가상 외국인·생성 선수용 정면 상반신 AI 프로필 이미지 생성 (구단 모자·유니폼 동적 결합)
 */
export function renderAiBaseballPortraitDataUrl(
  player: Player,
  appearance: PlayerAppearanceProfile,
  uniformKey: PortraitUniformKey
): string {
  const pal = CLUB_UNIFORM_PALETTES[uniformKey] ?? CLUB_UNIFORM_PALETTES.FA;
  const skin = SKIN_PALETTES[appearance.skinToneIndex] ?? SKIN_PALETTES[1];
  const hair = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS.jet_black;
  const age = player.age ?? 22;
  const uid = `p${appearance.faceSeed % 99999}`;

  // Face shape contour
  const jawPath =
    appearance.faceShape === 'square'
      ? 'M52,70 C52,55 62,48 80,48 C98,48 108,55 108,70 L106,101 C105,113 94,121 80,122 C66,121 55,113 54,101 Z'
      : appearance.faceShape === 'diamond'
      ? 'M51,74 C52,56 64,48 80,48 C96,48 108,56 109,74 L102,104 C96,116 88,123 80,124 C72,123 64,116 58,104 Z'
      : appearance.faceShape === 'round'
      ? 'M51,76 C51,55 63,48 80,48 C97,48 109,55 109,76 C109,104 97,122 80,122 C63,122 51,104 51,76 Z'
      : 'M52,72 C52,55 63,48 80,48 C97,48 108,55 108,72 L106,99 C104,114 93,123 80,123 C67,123 56,114 54,99 Z';

  // Shoulder width by athletic build
  const shoulderPath =
    appearance.build === 'broad'
      ? 'M6,200 C11,154 34,139 60,134 L100,134 C126,139 149,154 154,200 Z'
      : appearance.build === 'lean'
      ? 'M18,200 C22,160 41,144 63,138 L97,138 C119,144 138,160 142,200 Z'
      : 'M12,200 C16,157 37,141 61,136 L99,136 C123,141 144,157 148,200 Z';

  const pinstripes = pal.jerseyPinstripe
    ? `<g opacity="0.24" stroke="${pal.jerseyPinstripe}" stroke-width="1.4">
        <line x1="34" y1="142" x2="34" y2="200"/>
        <line x1="48" y1="138" x2="48" y2="200"/>
        <line x1="62" y1="136" x2="62" y2="200"/>
        <line x1="98" y1="136" x2="98" y2="200"/>
        <line x1="112" y1="138" x2="112" y2="200"/>
        <line x1="126" y1="142" x2="126" y2="200"/>
      </g>`
    : '';

  // Hair visible below cap
  let hairSvg = '';
  if (appearance.hairStyle === 'long_flow') {
    hairSvg = `
      <path d="M47,68 C43,82 43,104 49,116 L54,104 L53,72 Z" fill="${hair.main}"/>
      <path d="M113,68 C117,82 117,104 111,116 L106,104 L107,72 Z" fill="${hair.main}"/>
    `;
  } else if (appearance.hairStyle === 'curly_taper') {
    hairSvg = `
      <path d="M48,68 Q45,76 49,83 Q46,90 52,95 L54,72 Z" fill="${hair.main}"/>
      <path d="M112,68 Q115,76 111,83 Q114,90 108,95 L106,72 Z" fill="${hair.main}"/>
    `;
  } else if (appearance.hairStyle === 'textured_fringe' || appearance.hairStyle === 'side_part') {
    hairSvg = `
      <path d="M49,68 L53,68 L54,84 L50,82 Z M111,68 L107,68 L106,84 L110,82 Z" fill="${hair.main}"/>
      <path d="M54,68 Q68,75 82,70 Q94,74 106,68 Q94,65 80,66 Q66,65 54,68 Z" fill="${hair.main}" opacity="0.92"/>
    `;
  } else {
    hairSvg = `
      <path d="M50,69 L53,69 L53,81 L50,79 Z M110,69 L107,69 L107,81 L110,79 Z" fill="${hair.main}"/>
    `;
  }

  // Eyebrows
  const browStroke = appearance.eyebrowStyle === 'thick' ? 3.2 : 2.3;
  const browSvg =
    appearance.eyebrowStyle === 'arched'
      ? `<path d="M59,80 Q66,76 73,79 M87,79 Q94,76 101,80" fill="none" stroke="${hair.main}" stroke-width="${browStroke}" stroke-linecap="round"/>`
      : `<path d="M59,79 Q66,78 73,80 M87,80 Q94,78 101,79" fill="none" stroke="${hair.main}" stroke-width="${browStroke}" stroke-linecap="round"/>`;

  // Facial hair
  let facialHairSvg = '';
  if (appearance.facialHair === 'light_stubble') {
    facialHairSvg = `<path d="M58,103 C60,115 69,122 80,122 C91,122 100,115 102,103 C97,111 89,116 80,116 C71,116 63,111 58,103 Z" fill="${hair.main}" opacity="0.22"/>`;
  } else if (appearance.facialHair === 'mustache') {
    facialHairSvg = `<path d="M70,104 Q75,101 80,103 Q85,101 90,104 Q85,106 80,105 Q75,106 70,104 Z" fill="${hair.main}" opacity="0.88"/>`;
  } else if (appearance.facialHair === 'goatee') {
    facialHairSvg = `
      <path d="M71,104 Q80,101 89,104 Q84,106 80,105 Q76,106 71,104 Z" fill="${hair.main}" opacity="0.85"/>
      <path d="M72,115 Q80,122 88,115 Q84,123 80,123 Q76,123 72,115 Z" fill="${hair.main}" opacity="0.85"/>
    `;
  } else if (appearance.facialHair === 'short_beard') {
    facialHairSvg = `
      <path d="M55,98 C56,115 67,123 80,124 C93,123 104,115 105,98 C100,106 94,111 88,112 L86,107 Q80,104 74,107 L72,112 C66,111 60,106 55,98 Z" fill="${hair.main}" opacity="0.72"/>
      <path d="M71,104 Q80,101 89,104 Q84,106 80,105 Q76,106 71,104 Z" fill="${hair.main}" opacity="0.82"/>
    `;
  }

  // Age lines for veterans 33+
  const ageLinesSvg =
    age >= 33
      ? `<path d="M63,99 Q61,105 64,110 M97,99 Q99,105 96,110" fill="none" stroke="${skin.deep}" stroke-width="1" opacity="0.35" stroke-linecap="round"/>`
      : '';

  // Eye black strips
  const eyeBlackSvg = appearance.eyeBlack
    ? `<rect x="60" y="92" width="12" height="3.2" rx="1.2" fill="#111827" opacity="0.82"/>
       <rect x="88" y="92" width="12" height="3.2" rx="1.2" fill="#111827" opacity="0.82"/>`
    : '';

  // Glasses
  const glassesSvg =
    appearance.glasses === 'classic'
      ? `<g fill="none" stroke="#1e293b" stroke-width="1.8">
           <rect x="57" y="81" width="18" height="11" rx="3" fill="#ffffff" fill-opacity="0.1"/>
           <rect x="85" y="81" width="18" height="11" rx="3" fill="#ffffff" fill-opacity="0.1"/>
           <line x1="75" y1="86" x2="85" y2="86"/>
         </g>`
      : appearance.glasses === 'sport'
      ? `<g fill="none" stroke="${pal.accent}" stroke-width="2">
           <path d="M55,82 L76,83 L74,92 L58,91 Z" fill="#0f172a" fill-opacity="0.22"/>
           <path d="M105,82 L84,83 L86,92 L102,91 Z" fill="#0f172a" fill-opacity="0.22"/>
           <line x1="76" y1="84" x2="84" y2="84"/>
         </g>`
      : '';

  const numText = player.uniformNumber !== undefined ? `#${player.uniformNumber}` : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" width="160" height="200">
  <defs>
    <linearGradient id="${uid}bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.bgFrom}"/>
      <stop offset="100%" stop-color="${pal.bgTo}"/>
    </linearGradient>
    <radialGradient id="${uid}gl" cx="50%" cy="34%" r="58%">
      <stop offset="0%" stop-color="${pal.accent}" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="${pal.bgTo}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${uid}sk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${skin.highlight}"/>
      <stop offset="42%" stop-color="${skin.base}"/>
      <stop offset="100%" stop-color="${skin.shade}"/>
    </linearGradient>
    <linearGradient id="${uid}cap" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.capCrown}"/>
      <stop offset="100%" stop-color="${pal.capBrim}"/>
    </linearGradient>
  </defs>
  <rect width="160" height="200" fill="url(#${uid}bg)"/>
  <rect width="160" height="200" fill="url(#${uid}gl)"/>
  <!-- Shoulders & Authentic Club Jersey -->
  <path d="${shoulderPath}" fill="${pal.jerseyBase}"/>
  ${pal.jerseyRaglan ? `<path d="M10,200 C15,157 37,141 58,137 L46,200 Z M150,200 C145,157 123,141 102,137 L114,200 Z" fill="${pal.jerseyRaglan}" opacity="0.92"/>` : ''}
  ${pinstripes}
  <path d="M62,136 L80,159 L98,136 Z" fill="${pal.undershirt}"/>
  <path d="M62,136 L80,159 L98,136" fill="none" stroke="${pal.jerseyPiping}" stroke-width="3.2" stroke-linejoin="round"/>
  <line x1="80" y1="159" x2="80" y2="200" stroke="${pal.jerseyPiping}" stroke-width="2.2"/>
  <circle cx="80" cy="171" r="1.4" fill="${pal.jerseyPiping}"/>
  <circle cx="80" cy="186" r="1.4" fill="${pal.jerseyPiping}"/>
  <!-- Neck & Chin Shadow -->
  <path d="M67,114 L93,114 L95,142 Q80,151 65,142 Z" fill="${skin.shade}"/>
  <path d="M67,115 Q80,129 93,115 L93,125 Q80,134 67,125 Z" fill="${skin.deep}" opacity="0.45"/>
  <!-- Ears -->
  <ellipse cx="51" cy="89" rx="4.5" ry="8.5" fill="${skin.shade}"/>
  <ellipse cx="109" cy="89" rx="4.5" ry="8.5" fill="${skin.shade}"/>
  <!-- Face -->
  <path d="${jawPath}" fill="url(#${uid}sk)"/>
  <!-- Cap Brim Shadow on Forehead -->
  <path d="M52,69 Q80,75 108,69 L108,74 Q80,79 52,74 Z" fill="${skin.deep}" opacity="0.34"/>
  <!-- Hair -->
  ${hairSvg}
  <!-- Eyes & Eyebrows -->
  ${browSvg}
  <g>
    <ellipse cx="66.5" cy="86.5" rx="4.6" ry="3.1" fill="#ffffff"/>
    <ellipse cx="93.5" cy="86.5" rx="4.6" ry="3.1" fill="#ffffff"/>
    <circle cx="66.8" cy="86.5" r="2.3" fill="#1e1b18"/>
    <circle cx="93.2" cy="86.5" r="2.3" fill="#1e1b18"/>
    <circle cx="67.5" cy="85.7" r="0.8" fill="#ffffff"/>
    <circle cx="93.9" cy="85.7" r="0.8" fill="#ffffff"/>
    <path d="M61.5,85.2 Q66.5,82.6 71.5,85.4" fill="none" stroke="#1c1917" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M88.5,85.4 Q93.5,82.6 98.5,85.2" fill="none" stroke="#1c1917" stroke-width="1.3" stroke-linecap="round"/>
  </g>
  ${eyeBlackSvg}
  <!-- Nose -->
  <path d="M80,86 L78.5,98 Q80,100.5 83,98" fill="none" stroke="${skin.deep}" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Mouth -->
  <path d="M72,108 Q80,111.5 88,108" fill="none" stroke="${skin.deep}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M74.5,111.2 Q80,112.8 85.5,111.2" fill="none" stroke="${skin.deep}" stroke-width="0.9" opacity="0.55" stroke-linecap="round"/>
  ${ageLinesSvg}
  ${facialHairSvg}
  ${glassesSvg}
  <!-- Club Baseball Cap -->
  <path d="M47,68 C47,36 62,28 80,28 C98,28 113,36 113,68 Z" fill="url(#${uid}cap)"/>
  <path d="M62,33 Q80,28 98,33" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.4"/>
  <circle cx="80" cy="28" r="2.6" fill="${pal.capBrim}"/>
  <path d="M44,67 Q80,55 116,67 Q80,74 44,67 Z" fill="${pal.capBrim}"/>
  <text x="80" y="53" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="13" fill="${pal.capLogoColor}" letter-spacing="0.5">${pal.capLogoText}</text>
  ${numText ? `<text x="116" y="185" text-anchor="middle" font-family="monospace" font-weight="900" font-size="12.5" fill="${pal.jerseyPiping}" opacity="0.88">${numText}</text>` : ''}
</svg>`;
  return encodeSvgDataUrl(svg);
}

export interface ResolvedPlayerPortrait {
  src: string;
  fallbackSilhouetteSrc: string;
  sourceType: 'licensed_real' | 'ai_virtual' | 'silhouette_real';
  uniformKey: PortraitUniformKey;
  cacheKey: string;
  fromCache: boolean;
  badgeLabel: string;
}

/**
 * 선수 프로필 이미지 통합 리졸버 (캐싱 + 중복 생성 방지 + 이적 시 유니폼/모자 자동 반영)
 */
export async function resolvePlayerPortraitAsync(
  player: Player,
  season: number
): Promise<ResolvedPlayerPortrait> {
  const identityKey = getPlayerPortraitIdentityKey(player);
  const uniformKey = getPlayerUniformKey(player);
  const fallbackSilhouetteSrc = renderPlayerSilhouetteDataUrl(uniformKey, player.uniformNumber);

  // 1) 사용 권한이 확보된 실존 KBO 선수 공식 사진 최우선 적용
  const licensed = resolveLicensedRealPlayerPhoto(player);
  if (licensed) {
    return {
      src: licensed.url,
      fallbackSilhouetteSrc,
      sourceType: 'licensed_real',
      uniformKey,
      cacheKey: `${identityKey}::licensed`,
      fromCache: true,
      badgeLabel: 'KBO 공식',
    };
  }

  // 2) 가상 신인 · 가상 외국인 · 생성 선수 -> AI 프로필 1회 생성 후 영구 캐시 재사용
  if (isVirtualOrGeneratedPlayer(player)) {
    const appearance = ensurePlayerPortraitProfileInPlace(player, season);
    const cacheKey = `${identityKey}::${uniformKey}::${player.uniformNumber ?? 'x'}::${PORTRAIT_SCHEMA_VERSION}`;
    const { dataUrl, fromCache } = await getOrCreateCachedPortrait(cacheKey, () =>
      renderAiBaseballPortraitDataUrl(player, appearance, uniformKey)
    );
    return {
      src: dataUrl,
      fallbackSilhouetteSrc,
      sourceType: 'ai_virtual',
      uniformKey,
      cacheKey,
      fromCache,
      badgeLabel: 'AI 프로필',
    };
  }

  // 3) 공식 사진 미등록 실존 KBO 선수 -> 구단 모자·유니폼 적용 기본 선수 실루엣 (저작권 안전)
  const silCacheKey = `sil::${uniformKey}::${player.uniformNumber ?? 'x'}::${PORTRAIT_SCHEMA_VERSION}`;
  const { dataUrl, fromCache } = await getOrCreateCachedPortrait(silCacheKey, () => fallbackSilhouetteSrc);
  return {
    src: dataUrl,
    fallbackSilhouetteSrc,
    sourceType: 'silhouette_real',
    uniformKey,
    cacheKey: silCacheKey,
    fromCache,
    badgeLabel: CLUB_UNIFORM_PALETTES[uniformKey]?.key === 'FA' ? 'FA' : 'KBO 실루엣',
  };
}
