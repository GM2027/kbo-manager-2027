import fs from 'node:fs';
import path from 'node:path';
import { createNewCareer } from '../src/data/newGameTemplate';
import { Player, TeamId } from '../src/types/kbo';

const USER_AGENT = 'KBO-GM-2027-PortraitCollector/1.0 (https://github.com/GM2027/kbo-manager-2027; open-license-only)';
const ROOT_DIR = process.cwd();
const PUBLIC_PORTRAIT_ROOT = path.join(ROOT_DIR, 'public', 'portraits', 'kbo');
const GENERATED_TS_PATH = path.join(ROOT_DIR, 'src', 'data', 'licensedRealPortraits.ts');
const AUDIT_JSON_PATH = path.join(ROOT_DIR, 'src', 'data', 'playerPortraitAuditLog.json');

const TEAM_FOLDER_MAP: Record<TeamId, string> = {
  LG: 'LG',
  한화: 'HH',
  SSG: 'SSG',
  삼성: 'SS',
  NC: 'NC',
  KT: 'KT',
  롯데: 'LT',
  KIA: 'KIA',
  두산: 'OB',
  키움: 'WO',
};

const TEAM_KEYWORDS: Record<TeamId, string[]> = {
  LG: ['LG', '트윈스', 'MBC 청룡'],
  한화: ['한화', '이글스', '빙그레'],
  SSG: ['SSG', '랜더스', 'SK 와이번스', 'SK'],
  삼성: ['삼성', '라이온즈'],
  NC: ['NC', '다이노스'],
  KT: ['KT', 'kt', '위즈'],
  롯데: ['롯데', '자이언츠'],
  KIA: ['KIA', '기아', '타이거즈', '해태'],
  두산: ['두산', '베어스', 'OB'],
  키움: ['키움', '히어로즈', '넥센', '우리 히어로즈'],
};

const FOREIGN_WIKI_MAP: Record<string, { en?: string; ja?: string; ko?: string }> = {
  'KBO-PL-669487': { en: 'Lachlan Wells' },
  'KBO-PL-582655': { en: 'Yonny Chirinos', ko: '요니 치리노스' },
  'KBO-PL-912837': { en: 'Anders Tolhurst' },
  'KBO-PL-900507': { en: 'Austin Dean', ko: '오스틴 딘' },
  'KBO-PL-888290': { en: 'Wilkel Hernández' },
  'KBO-PL-812457': { en: 'Wang Yan-cheng', ja: '王彦程' },
  'KBO-PL-189157': { en: 'Owen White' },
  'KBO-PL-521171': { en: 'Yonathan Perlaza', ko: '요나단 페라자' },
  'KBO-PL-954611': { en: 'Shōta Takeda', ja: '武田翔太' },
  'KBO-PL-462840': { en: 'Anthony Veneziano' },
  'KBO-PL-362888': { en: 'Mitch White (baseball)', ko: '미치 화이트' },
  'KBO-PL-231913': { en: 'Guillermo Heredia (baseball)', ko: '기예르모 에레디아' },
  'KBO-PL-541918': { en: 'Matt Manning' },
  'KBO-PL-290425': { en: 'Yura Miyaji', ja: '宮路悠良' },
  'KBO-PL-582896': { en: 'Ariel Jurado', ko: '아리엘 후라도' },
  'KBO-PL-905286': { en: 'Lewin Díaz', ko: '르윈 디아즈' },
  'KBO-PL-939902': { en: 'Riley Thompson (baseball)' },
  'KBO-PL-327552': { en: 'Curtis Taylor' },
  'KBO-PL-451408': { en: 'Natsuki Toda', ja: '戸田懐生' },
  'KBO-PL-741494': { en: 'Matt Davidson (baseball)', ko: '맷 데이비슨' },
  'KBO-PL-148793': { en: 'Caleb Boushley' },
  'KBO-PL-665714': { en: 'Matt Sauer' },
  'KBO-PL-820976': { en: 'Kōki Sugimoto', ja: '杉本幸基' },
  'KBO-PL-417000': { en: 'Sam Hilliard' },
  'KBO-PL-451113': { en: 'Elvin Rodríguez' },
  'KBO-PL-229565': { en: 'Jeremy Beasley' },
  'KBO-PL-275492': { en: 'Masaya Kyōyama', ja: '京山将弥' },
  'KBO-PL-112465': { en: 'Víctor Reyes', ko: '빅터 레이예스' },
  'KBO-PL-325486': { en: 'James Naile', ko: '제임스 네일' },
  'KBO-PL-557788': { en: 'Adam Oller' },
  'KBO-PL-450573': { en: 'Jarryd Dale' },
  'KBO-PL-938703': { en: 'Harold Castro' },
  'KBO-PL-217510': { en: 'Zach Logue' },
  'KBO-PL-248379': { en: 'Ichirō Tamura', ja: '田村伊知郎' },
  'KBO-PL-866569': { en: 'Chris Flexen', ko: '크리스 플렉센' },
  'KBO-PL-261363': { en: 'Daz Cameron' },
  'KBO-PL-976222': { en: 'Raúl Alcántara', ko: '라울 알칸타라' },
  'KBO-PL-807432': { en: 'Nathan Wiles' },
  'KBO-PL-151390': { en: 'Yūto Kanakubo', ja: '金久保優斗' },
  'KBO-PL-462472': { en: 'Trenton Brooks' },
};

interface WikiPageHit {
  title: string;
  extract: string;
  categories: string[];
  pageimage?: string;
  thumbUrl?: string;
  fullurl?: string;
  qid?: string;
  wikiLang: 'ko' | 'en' | 'ja';
}

interface CommonsFileMeta {
  fileTitle: string;
  thumbUrl: string;
  origUrl: string;
  mime: string;
  width: number;
  height: number;
  license: string;
  licenseUrl: string;
  credit: string;
  descriptionUrl: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

async function batchQueryWikipedia(
  lang: 'ko' | 'en' | 'ja',
  titles: string[]
): Promise<Map<string, WikiPageHit>> {
  const result = new Map<string, WikiPageHit>();
  const uniqueTitles = [...new Set(titles.filter(Boolean))];
  const CHUNK = 20; // MediaWiki extracts max exlimit=20 per request
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueTitles.length; i += CHUNK) {
    chunks.push(uniqueTitles.slice(i, i + CHUNK));
  }

  let completed = 0;
  let cursor = 0;
  const WORKERS = 5;

  async function runWorker() {
    while (cursor < chunks.length) {
      const idx = cursor++;
      const chunk = chunks[idx];
      const params = new URLSearchParams({
        action: 'query',
        titles: chunk.join('|'),
        prop: 'pageimages|extracts|categories|info|pageprops',
        ppprop: 'wikibase_item',
        inprop: 'url',
        exintro: '1',
        explaintext: '1',
        exsentences: '3',
        exlimit: '20',
        cllimit: '20',
        pithumbsize: '340',
        redirects: '1',
        format: 'json',
      });
      const data = await fetchJsonWithRetry(`https://${lang}.wikipedia.org/w/api.php?${params.toString()}`);
      completed++;
      if (completed % 20 === 0 || completed === chunks.length) {
        console.log(`  [${lang}.wiki] ${completed}/${chunks.length} batches done (hits=${result.size})`);
      }
      if (!data?.query) continue;

      const normalizedMap = new Map<string, string>();
      for (const n of data.query.normalized ?? []) {
        normalizedMap.set(n.from, n.to);
      }
      const redirectMap = new Map<string, string>();
      for (const r of data.query.redirects ?? []) {
        redirectMap.set(r.from, r.to);
      }

      const pagesByTitle = new Map<string, any>();
      for (const pg of Object.values<any>(data.query.pages ?? {})) {
        if (pg.missing !== undefined || pg.invalid !== undefined) continue;
        pagesByTitle.set(pg.title, pg);
      }

      for (const orig of chunk) {
        let cur = normalizedMap.get(orig) ?? orig;
        cur = redirectMap.get(cur) ?? cur;
        const pg = pagesByTitle.get(cur);
        if (!pg) continue;
        const hit: WikiPageHit = {
          title: pg.title,
          extract: pg.extract ?? '',
          categories: (pg.categories ?? []).map((c: any) => String(c.title ?? '')),
          pageimage: pg.pageimage,
          thumbUrl: pg.thumbnail?.source,
          fullurl: pg.fullurl,
          qid: pg.pageprops?.wikibase_item,
          wikiLang: lang,
        };
        result.set(orig, hit);
      }
      await sleep(80);
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, () => runWorker()));
  return result;
}

function isDisambiguationPage(hit: WikiPageHit): boolean {
  const combined = `${hit.title} ${hit.extract} ${hit.categories.join(' ')}`;
  return /동음이의|may refer to|曖昧さ回避|disambiguation/i.test(combined);
}

function isBaseballPlayerPage(hit: WikiPageHit): boolean {
  const combined = `${hit.title} ${hit.extract} ${hit.categories.join(' ')}`;
  if (isDisambiguationPage(hit)) return false;
  return /(야구\s*선수|야구인|KBO|프로야구|투수|포수|내야수|외야수|지명타자|baseball|pitcher|catcher|infielder|outfielder|first baseman|second baseman|third baseman|shortstop|野球選手|プロ野球|投手|捕手|内野手|外野手)/i.test(
    combined
  );
}

function matchesPlayerIdentity(player: Player, hit: WikiPageHit): { ok: boolean; reason: string } {
  if (!isBaseballPlayerPage(hit)) {
    return { ok: false, reason: 'not_baseball_player' };
  }

  const combined = `${hit.extract} ${hit.categories.join(' ')}`;
  const dobYear = player.birthDate ? Number(player.birthDate.slice(0, 4)) : null;

  if (dobYear && Number.isFinite(dobYear)) {
    const exactYearStr = String(dobYear);
    if (combined.includes(exactYearStr)) {
      return { ok: true, reason: `birth_year_match_${exactYearStr}` };
    }
    // Check if intro mentions another birth year (1950..2012) -> reject namesake!
    const yearsInIntro = [...hit.extract.matchAll(/\b(19[5-9]\d|200\d|201[0-2])\b/g)].map((m) => Number(m[1]));
    if (yearsInIntro.length > 0) {
      const hasClose = yearsInIntro.some((y) => Math.abs(y - dobYear) <= 1);
      if (!hasClose) {
        return { ok: false, reason: `birth_year_mismatch_db_${dobYear}_wiki_${yearsInIntro[0]}` };
      }
      return { ok: true, reason: `birth_year_close_${dobYear}` };
    }
  }

  // Fallback when birthDate missing or not in intro: require KBO team keyword match
  const teamKws = TEAM_KEYWORDS[player.teamId] ?? [player.teamId];
  if (teamKws.some((kw) => combined.includes(kw))) {
    return { ok: true, reason: `team_keyword_match_${player.teamId}` };
  }

  return { ok: false, reason: 'unverified_identity_no_birthyear_or_team' };
}

function isBadFilename(fileTitle: string): boolean {
  const lower = fileTitle.toLowerCase();
  if (!/\.(jpg|jpeg|png|webp)$/i.test(lower)) return true;
  if (/(logo|flag|emblem|map|stadium|park|arena|field|uniform|jersey|signature|autograph|trophy|icon|symbol|badge|coat_of_arms|wordmark|cap_logo|blank|silhouette|no_image|placeholder)/i.test(lower)) {
    return true;
  }
  return false;
}

function isOpenLicenseAllowed(licenseShort: string, usageTerms: string): boolean {
  const combined = `${licenseShort} ${usageTerms}`.trim();
  if (!combined) return false;
  if (/(fair use|non-free|copyrighted|all rights reserved|restricted|제한적 이용|nc-nd)/i.test(combined)) {
    return false;
  }
  return /^(cc[- ]?by|cc0|public domain|pd|gfdl|attribution|ogl)/i.test(licenseShort.trim()) ||
    /(creative commons|cc by|cc0|public domain)/i.test(combined);
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function batchQueryCommonsLicense(fileNames: string[]): Promise<Map<string, CommonsFileMeta>> {
  const out = new Map<string, CommonsFileMeta>();
  const unique = [...new Set(fileNames.filter(Boolean))];
  const CHUNK = 35;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const titles = chunk.map((f) => (f.startsWith('File:') ? f : `File:${f}`));
    const params = new URLSearchParams({
      action: 'query',
      titles: titles.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime|size',
      iiurlwidth: '340',
      format: 'json',
    });
    const data = await fetchJsonWithRetry(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
    if (!data?.query?.pages) continue;

    const normalizedMap = new Map<string, string>();
    for (const n of data.query.normalized ?? []) {
      normalizedMap.set(n.from, n.to);
    }

    const pagesByTitle = new Map<string, any>();
    for (const pg of Object.values<any>(data.query.pages)) {
      if (pg.missing !== undefined || !pg.imageinfo?.[0]) continue;
      pagesByTitle.set(pg.title, pg);
    }

    for (const rawName of chunk) {
      const fullTitle = rawName.startsWith('File:') ? rawName : `File:${rawName}`;
      const normTitle = normalizedMap.get(fullTitle) ?? fullTitle;
      const pg = pagesByTitle.get(normTitle) ?? pagesByTitle.get(fullTitle);
      if (!pg) continue;
      const info = pg.imageinfo[0];
      const meta = info.extmetadata ?? {};
      const licenseShort = stripHtml(String(meta.LicenseShortName?.value ?? ''));
      const usageTerms = stripHtml(String(meta.UsageTerms?.value ?? ''));
      const licenseUrl = String(meta.LicenseUrl?.value ?? '');
      const artist = stripHtml(String(meta.Artist?.value ?? meta.Credit?.value ?? 'Wikimedia Commons'));
      if (!isOpenLicenseAllowed(licenseShort, usageTerms)) continue;
      const thumbUrl = String(info.thumburl || info.url || '');
      if (!thumbUrl) continue;

      out.set(rawName, {
        fileTitle: pg.title,
        thumbUrl,
        origUrl: String(info.url || thumbUrl),
        mime: String(info.mime || ''),
        width: Number(info.thumbwidth || info.width || 0),
        height: Number(info.thumbheight || info.height || 0),
        license: licenseShort || 'CC-BY-SA',
        licenseUrl,
        credit: artist.slice(0, 120) || 'Wikimedia Commons',
        descriptionUrl: String(info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(pg.title)}`),
      });
    }
    await sleep(120);
  }

  return out;
}

function validateImageMagicBytes(buf: Buffer): { valid: boolean; ext: 'jpg' | 'png' | 'webp' | null } {
  if (buf.length < 1500) return { valid: false, ext: null };
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { valid: true, ext: 'jpg' };
  }
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { valid: true, ext: 'png' };
  }
  // WebP
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { valid: true, ext: 'webp' };
  }
  return { valid: false, ext: null };
}

function sanitizeFileSegment(text: string): string {
  return text.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '');
}

async function downloadImageWithRetry(url: string, retries = 2): Promise<Buffer | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    } catch {
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  return null;
}

async function batchQueryWikidataP18(qids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(qids.filter((q) => /^Q\d+$/.test(q)))];
  const CHUNK = 45;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: chunk.join('|'),
      props: 'claims',
      format: 'json',
    });
    const data = await fetchJsonWithRetry(`https://www.wikidata.org/w/api.php?${params.toString()}`);
    if (!data?.entities) continue;
    for (const [qid, ent] of Object.entries<any>(data.entities)) {
      const p18 = ent?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (typeof p18 === 'string' && p18.trim().length > 0) {
        out.set(qid, p18.trim());
      }
    }
    await sleep(100);
  }
  return out;
}

async function main() {
  console.log('[1/5] Loading all real KBO players across 10 clubs...');
  const career = createNewCareer({ teamId: 'LG', gmName: 'audit' });
  const realPlayers = Object.values(career.players).filter(
    (p) =>
      p.originType !== 'virtual' &&
      p.rosterTier !== '은퇴' &&
      p.rosterTier !== '해외이적' &&
      p.teamId in TEAM_FOLDER_MAP
  );

  // Ensure all 10 club directories exist
  for (const folder of Object.values(TEAM_FOLDER_MAP)) {
    fs.mkdirSync(path.join(PUBLIC_PORTRAIT_ROOT, folder), { recursive: true });
  }

  console.log(`[2/5] Querying Korean, English & Japanese Wikipedia for ${realPlayers.length} real KBO players...`);

  const koCandidateMap = new Map<string, string[]>();
  const enCandidateMap = new Map<string, string[]>();
  const jaCandidateMap = new Map<string, string[]>();

  for (const p of realPlayers) {
    const pid = p.permanentId ?? p.id;
    const dobYear = p.birthDate ? p.birthDate.slice(0, 4) : null;
    const foreignHint = FOREIGN_WIKI_MAP[pid];

    if (p.category === '국내') {
      const koTitles = [`${p.name} (야구 선수)`, `${p.name} (야구인)`, p.name];
      if (dobYear) {
        koTitles.unshift(`${p.name} (${dobYear}년)`);
      }
      koCandidateMap.set(pid, koTitles);
    } else {
      if (foreignHint?.en) enCandidateMap.set(pid, [foreignHint.en]);
      if (foreignHint?.ja) jaCandidateMap.set(pid, [foreignHint.ja]);
      if (foreignHint?.ko) koCandidateMap.set(pid, [foreignHint.ko, `${foreignHint.ko} (야구 선수)`]);
      else koCandidateMap.set(pid, [`${p.name} (야구 선수)`, p.name]);
    }
  }

  const allKoTitles = [...koCandidateMap.values()].flat();
  const allEnTitles = [...enCandidateMap.values()].flat();
  const allJaTitles = [...jaCandidateMap.values()].flat();

  const [koHits, enHits, jaHits] = await Promise.all([
    batchQueryWikipedia('ko', allKoTitles),
    batchQueryWikipedia('en', allEnTitles),
    batchQueryWikipedia('ja', allJaTitles),
  ]);

  console.log(`  Wikipedia hits: ko=${koHits.size}, en=${enHits.size}, ja=${jaHits.size}`);

  // Match each player to best verified Wikipedia article with a pageimage (or fallback to Wikidata P18)
  const matchedByPid = new Map<
    string,
    { player: Player; hit: WikiPageHit; matchReason: string; fileName: string }
  >();
  const verifiedNoImageByPid = new Map<string, { player: Player; hit: WikiPageHit; matchReason: string }>();
  const failedPlayers: {
    permanentId: string;
    kboOfficialId?: string;
    name: string;
    teamId: TeamId;
    rosterTier: string;
    category: string;
    reason: string;
  }[] = [];

  for (const p of realPlayers) {
    const pid = p.permanentId ?? p.id;
    const candidates: WikiPageHit[] = [];

    for (const t of enCandidateMap.get(pid) ?? []) {
      const h = enHits.get(t);
      if (h) candidates.push(h);
    }
    for (const t of koCandidateMap.get(pid) ?? []) {
      const h = koHits.get(t);
      if (h) candidates.push(h);
    }
    for (const t of jaCandidateMap.get(pid) ?? []) {
      const h = jaHits.get(t);
      if (h) candidates.push(h);
    }

    let chosen: { hit: WikiPageHit; matchReason: string; fileName: string } | null = null;
    let verifiedArticleWithoutImg: { hit: WikiPageHit; matchReason: string } | null = null;
    let lastRejectReason = 'no_wikipedia_article';

    for (const cand of candidates) {
      const idCheck = matchesPlayerIdentity(p, cand);
      if (!idCheck.ok) {
        lastRejectReason = idCheck.reason;
        continue;
      }
      if (!verifiedArticleWithoutImg) {
        verifiedArticleWithoutImg = { hit: cand, matchReason: idCheck.reason };
      }
      if (!cand.pageimage) {
        lastRejectReason = 'no_profile_image_on_page';
        continue;
      }
      if (isBadFilename(cand.pageimage)) {
        lastRejectReason = `non_portrait_file_${cand.pageimage}`;
        continue;
      }
      chosen = { hit: cand, matchReason: idCheck.reason, fileName: cand.pageimage };
      break;
    }

    if (chosen) {
      matchedByPid.set(pid, {
        player: p,
        hit: chosen.hit,
        matchReason: chosen.matchReason,
        fileName: chosen.fileName,
      });
    } else if (verifiedArticleWithoutImg && verifiedArticleWithoutImg.hit.qid) {
      verifiedNoImageByPid.set(pid, {
        player: p,
        hit: verifiedArticleWithoutImg.hit,
        matchReason: verifiedArticleWithoutImg.matchReason,
      });
    } else {
      failedPlayers.push({
        permanentId: pid,
        kboOfficialId: p.kboOfficialId,
        name: p.name,
        teamId: p.teamId,
        rosterTier: p.rosterTier,
        category: p.category,
        reason: lastRejectReason,
      });
    }
  }

  // Secondary lookup: Wikidata P18 images for verified baseball player articles lacking a local pageimage
  if (verifiedNoImageByPid.size > 0) {
    const qids = [...verifiedNoImageByPid.values()].map((v) => v.hit.qid!).filter(Boolean);
    console.log(`  Checking Wikidata P18 for ${qids.length} verified player articles without local pageimage...`);
    const wdP18Map = await batchQueryWikidataP18(qids);
    let wdFound = 0;
    for (const [pid, v] of verifiedNoImageByPid.entries()) {
      const p18File = v.hit.qid ? wdP18Map.get(v.hit.qid) : undefined;
      if (p18File && !isBadFilename(p18File)) {
        matchedByPid.set(pid, {
          player: v.player,
          hit: v.hit,
          matchReason: `${v.matchReason}+wikidata_p18`,
          fileName: p18File,
        });
        wdFound++;
      } else {
        failedPlayers.push({
          permanentId: pid,
          kboOfficialId: v.player.kboOfficialId,
          name: v.player.name,
          teamId: v.player.teamId,
          rosterTier: v.player.rosterTier,
          category: v.player.category,
          reason: 'no_open_licensed_portrait_on_wiki_or_wikidata',
        });
      }
    }
    console.log(`  Wikidata P18 added ${wdFound} additional verified candidate portraits!`);
  }

  console.log(`[3/5] Verifying open licenses on Wikimedia Commons for ${matchedByPid.size} candidate portraits...`);
  const allFileNames = [...matchedByPid.values()].map((m) => m.fileName);
  const commonsMetaMap = await batchQueryCommonsLicense(allFileNames);
  console.log(`  Open-licensed Commons portraits verified: ${commonsMetaMap.size}`);

  console.log('[4/5] Downloading verified open-licensed portraits into 10 club folders...');
  const registryEntries: Record<
    string,
    {
      path: string;
      credit: string;
      license: string;
      licenseUrl: string;
      sourceUrl: string;
      teamFolder: string;
      playerName: string;
      permanentId: string;
      kboOfficialId?: string;
    }
  > = {};

  const kboIdAliasMap: Record<string, string> = {};

  const downloadQueue = [...matchedByPid.entries()];
  let downloadedNew = 0;
  let reusedExisting = 0;
  let licenseRejected = 0;
  let downloadFailed = 0;

  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < downloadQueue.length) {
      const idx = cursor++;
      const [pid, item] = downloadQueue[idx];
      const p = item.player;
      const meta = commonsMetaMap.get(item.fileName);

      if (!meta) {
        licenseRejected++;
        failedPlayers.push({
          permanentId: pid,
          kboOfficialId: p.kboOfficialId,
          name: p.name,
          teamId: p.teamId,
          rosterTier: p.rosterTier,
          category: p.category,
          reason: `license_unverified_or_non_commons (${item.fileName})`,
        });
        continue;
      }

      const teamFolder = TEAM_FOLDER_MAP[p.teamId];
      const safeName = sanitizeFileSegment(p.name);
      const baseFilename = `${safeName}_${pid}`;
      const folderAbs = path.join(PUBLIC_PORTRAIT_ROOT, teamFolder);

      // Deduplication: check if a valid image already exists for this player
      let existingPath: string | null = null;
      for (const ext of ['jpg', 'png', 'webp'] as const) {
        const candAbs = path.join(folderAbs, `${baseFilename}.${ext}`);
        if (fs.existsSync(candAbs)) {
          const buf = fs.readFileSync(candAbs);
          if (validateImageMagicBytes(buf).valid) {
            existingPath = `/portraits/kbo/${teamFolder}/${baseFilename}.${ext}`;
            break;
          }
        }
      }

      if (existingPath) {
        reusedExisting++;
        registryEntries[pid] = {
          path: existingPath,
          credit: meta.credit,
          license: meta.license,
          licenseUrl: meta.licenseUrl,
          sourceUrl: meta.descriptionUrl,
          teamFolder,
          playerName: p.name,
          permanentId: pid,
          kboOfficialId: p.kboOfficialId,
        };
        if (p.kboOfficialId) kboIdAliasMap[p.kboOfficialId] = pid;
        continue;
      }

      const buf = await downloadImageWithRetry(meta.thumbUrl);
      if (!buf) {
        downloadFailed++;
        failedPlayers.push({
          permanentId: pid,
          kboOfficialId: p.kboOfficialId,
          name: p.name,
          teamId: p.teamId,
          rosterTier: p.rosterTier,
          category: p.category,
          reason: `download_failed (${meta.thumbUrl})`,
        });
        continue;
      }

      const check = validateImageMagicBytes(buf);
      if (!check.valid || !check.ext) {
        downloadFailed++;
        failedPlayers.push({
          permanentId: pid,
          kboOfficialId: p.kboOfficialId,
          name: p.name,
          teamId: p.teamId,
          rosterTier: p.rosterTier,
          category: p.category,
          reason: `corrupt_or_invalid_image_bytes (${buf.length}B)`,
        });
        continue;
      }

      const fileNameOnDisk = `${baseFilename}.${check.ext}`;
      const absOut = path.join(folderAbs, fileNameOnDisk);
      fs.writeFileSync(absOut, buf);
      downloadedNew++;

      registryEntries[pid] = {
        path: `/portraits/kbo/${teamFolder}/${fileNameOnDisk}`,
        credit: meta.credit,
        license: meta.license,
        licenseUrl: meta.licenseUrl,
        sourceUrl: meta.descriptionUrl,
        teamFolder,
        playerName: p.name,
        permanentId: pid,
        kboOfficialId: p.kboOfficialId,
      };
      if (p.kboOfficialId) kboIdAliasMap[p.kboOfficialId] = pid;

      await sleep(160);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(
    `  Download summary: new=${downloadedNew}, reused=${reusedExisting}, licenseRejected=${licenseRejected}, downloadFailed=${downloadFailed}`
  );

  // [5/5] Build per-club audit statistics & write generated files
  const clubStats: Record<
    string,
    {
      teamId: TeamId;
      folder: string;
      totalRealPlayers: number;
      appliedCount: number;
      missingOrFailedCount: number;
      successRatePct: number;
    }
  > = {};

  for (const tid of Object.keys(TEAM_FOLDER_MAP) as TeamId[]) {
    const teamPlayers = realPlayers.filter((p) => p.teamId === tid);
    const applied = teamPlayers.filter((p) => Boolean(registryEntries[p.permanentId ?? p.id])).length;
    const missing = teamPlayers.length - applied;
    clubStats[tid] = {
      teamId: tid,
      folder: `public/portraits/kbo/${TEAM_FOLDER_MAP[tid]}`,
      totalRealPlayers: teamPlayers.length,
      appliedCount: applied,
      missingOrFailedCount: missing,
      successRatePct: Number(((applied / Math.max(1, teamPlayers.length)) * 100).toFixed(1)),
    };
  }

  const totalApplied = Object.keys(registryEntries).length;
  const totalFailed = realPlayers.length - totalApplied;

  // Sort entries cleanly for deterministic git diffs
  const sortedPids = Object.keys(registryEntries).sort();
  const sortedRegistry: Record<string, { url: string; credit: string; license: string; sourceUrl: string; teamFolder: string }> = {};
  for (const pid of sortedPids) {
    const e = registryEntries[pid];
    sortedRegistry[pid] = {
      url: e.path,
      credit: e.credit,
      license: e.license,
      sourceUrl: e.sourceUrl,
      teamFolder: e.teamFolder,
    };
  }
  const sortedAliases: Record<string, string> = {};
  for (const kboId of Object.keys(kboIdAliasMap).sort()) {
    sortedAliases[kboId] = kboIdAliasMap[kboId];
  }

  const tsContent = `// AUTO-GENERATED by scripts/collect_kbo_portraits.ts
// Open-licensed KBO real player portraits verified via Wikimedia Commons (CC BY / CC BY-SA / CC0 / Public Domain)
// Namuwiki CDN images (i.namu.wiki robots.txt 403 / non-free "제한적 이용" copyright) are strictly excluded for ToS & copyright compliance.

export interface BundledRealPortraitEntry {
  url: string;
  credit: string;
  license: string;
  sourceUrl: string;
  teamFolder: string;
}

export const BUNDLED_REAL_PLAYER_PORTRAITS: Record<string, BundledRealPortraitEntry> = ${JSON.stringify(
    sortedRegistry,
    null,
    2
  )};

export const KBO_OFFICIAL_ID_TO_PORTRAIT_PID: Record<string, string> = ${JSON.stringify(
    sortedAliases,
    null,
    2
  )};
`;

  fs.writeFileSync(GENERATED_TS_PATH, tsContent, 'utf8');

  const auditPayload = {
    generatedAt: new Date().toISOString(),
    policyComplianceNote:
      '나무위키 이미지 CDN(i.namu.wiki/robots.txt -> HTTP 403 Forbidden) 및 제한적 이용(KBO·구단·언론사 저작권) 이미지의 무단 자동 수집을 차단하고, 자동 수집·재배포가 공식 허용된 위키미디어 공용(Wikimedia Commons CC BY / CC BY-SA / CC0 / Public Domain) 검증 이미지만 수집했습니다. 사진이 없거나 비자유 저작물인 선수는 기본 구단 유니폼 실루엣을 적용합니다.',
    totals: {
      totalRealPlayers: realPlayers.length,
      appliedCount: totalApplied,
      missingOrFailedCount: totalFailed,
      successRatePct: Number(((totalApplied / Math.max(1, realPlayers.length)) * 100).toFixed(1)),
      downloadedNew,
      reusedExisting,
      licenseRejected,
      downloadFailed,
    },
    byClub: clubStats,
    failedOrMissingPlayers: failedPlayers.sort(
      (a, b) => a.teamId.localeCompare(b.teamId, 'ko') || a.name.localeCompare(b.name, 'ko')
    ),
  };

  fs.writeFileSync(AUDIT_JSON_PATH, JSON.stringify(auditPayload, null, 2), 'utf8');

  console.log('\n=== FINAL PER-CLUB PORTRAIT AUDIT ===');
  for (const tid of Object.keys(clubStats)) {
    const s = clubStats[tid];
    console.log(
      `  ${tid.padEnd(4)} | 전체 ${String(s.totalRealPlayers).padStart(2)}명 | 성공 ${String(s.appliedCount).padStart(2)}명 | 미등록/실패 ${String(s.missingOrFailedCount).padStart(2)}명 (${s.successRatePct}%)`
    );
  }
  console.log(
    `TOTAL: 전체 ${realPlayers.length}명 | 적용 성공 ${totalApplied}명 (${auditPayload.totals.successRatePct}%) | 미등록/실패 ${totalFailed}명`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
