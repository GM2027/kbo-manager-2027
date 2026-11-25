import { computeTravelDistanceKm, TEAM_IDS } from '../data/kboTeams';
import { CareerSave, ScheduledSeries, TeamId } from '../types/kbo';
import { addDaysIso, getDayOfWeekUtc } from './schedule';

export interface ImportedOfficialGameRow {
  date: string; // YYYY-MM-DD
  away: TeamId;
  home: TeamId;
}

const TEAM_ALIAS_MAP: Record<string, TeamId> = {
  LG: 'LG',
  'LG 트윈스': 'LG',
  트윈스: 'LG',
  HH: '한화',
  한화: '한화',
  '한화 이글스': '한화',
  이글스: '한화',
  SSG: 'SSG',
  SK: 'SSG',
  'SSG 랜더스': 'SSG',
  랜더스: 'SSG',
  SS: '삼성',
  삼성: '삼성',
  '삼성 라이온즈': '삼성',
  라이온즈: '삼성',
  NC: 'NC',
  'NC 다이노스': 'NC',
  다이노스: 'NC',
  KT: 'KT',
  'KT 위즈': 'KT',
  위즈: 'KT',
  LT: '롯데',
  롯데: '롯데',
  '롯데 자이언츠': '롯데',
  자이언츠: '롯데',
  HT: 'KIA',
  KIA: 'KIA',
  기아: 'KIA',
  'KIA 타이거즈': 'KIA',
  타이거즈: 'KIA',
  OB: '두산',
  두산: '두산',
  '두산 베어스': '두산',
  베어스: '두산',
  WO: '키움',
  키움: '키움',
  '키움 히어로즈': '키움',
  히어로즈: '키움',
};

function normalizeTeamId(raw: string): TeamId | null {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return null;
  if (TEAM_ALIAS_MAP[cleaned]) return TEAM_ALIAS_MAP[cleaned];
  const upper = cleaned.toUpperCase();
  if (TEAM_ALIAS_MAP[upper]) return TEAM_ALIAS_MAP[upper];
  for (const tid of TEAM_IDS) {
    if (cleaned.includes(tid)) return tid;
  }
  return null;
}

function normalizeIsoDate(raw: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Excel serial date number (e.g. 46473)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    const dt = new Date(Date.UTC(1899, 11, 30 + serial));
    return dt.toISOString().slice(0, 10);
  }
  const m = s.match(/(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2020 || y > 2040 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseOfficialScheduleJson(jsonText: string): ImportedOfficialGameRow[] {
  const parsed = JSON.parse(jsonText);
  const rows: ImportedOfficialGameRow[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && Array.isArray(item.dates) && Array.isArray(item.matchups)) {
        // ScheduledSeries[] 형식 지원
        for (const dt of item.dates) {
          const iso = normalizeIsoDate(dt);
          if (!iso) continue;
          for (const m of item.matchups) {
            const away = normalizeTeamId(m.away ?? m.awayTeam);
            const home = normalizeTeamId(m.home ?? m.homeTeam);
            if (away && home && away !== home) rows.push({ date: iso, away, home });
          }
        }
      } else if (item && typeof item === 'object') {
        const iso = normalizeIsoDate(item.date ?? item.gameDate ?? item['날짜'] ?? item['경기일']);
        const away = normalizeTeamId(item.away ?? item.awayTeam ?? item['원정'] ?? item['원정팀']);
        const home = normalizeTeamId(item.home ?? item.homeTeam ?? item['홈'] ?? item['홈팀']);
        if (iso && away && home && away !== home) {
          rows.push({ date: iso, away, home });
        }
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    const arr = parsed.games ?? parsed.schedule ?? parsed.rows ?? [];
    if (Array.isArray(arr)) {
      return parseOfficialScheduleJson(JSON.stringify(arr));
    }
  }
  return rows;
}

export function parseOfficialScheduleCsv(csvText: string): ImportedOfficialGameRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const splitCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = headers.findIndex((h) => ['date', 'gamedate', '날짜', '경기일', '일자'].includes(h));
  const awayIdx = headers.findIndex((h) => ['away', 'awayteam', '원정', '원정팀'].includes(h));
  const homeIdx = headers.findIndex((h) => ['home', 'hometeam', '홈', '홈팀'].includes(h));

  const dCol = dateIdx >= 0 ? dateIdx : 0;
  const aCol = awayIdx >= 0 ? awayIdx : 1;
  const hCol = homeIdx >= 0 ? homeIdx : 2;

  const rows: ImportedOfficialGameRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const iso = normalizeIsoDate(cols[dCol] ?? '');
    const away = normalizeTeamId(cols[aCol] ?? '');
    const home = normalizeTeamId(cols[hCol] ?? '');
    if (iso && away && home && away !== home) {
      rows.push({ date: iso, away, home });
    }
  }
  return rows;
}

/**
 * 순수 브라우저 내장 DecompressionStream + DOMParser 기반 XLSX 공식 일정 파서.
 * 외부 번들 의존성 없이 표준 Excel(.xlsx) 시트의 날짜/원정/홈 열을 추출합니다.
 */
export async function parseOfficialScheduleXlsx(buffer: ArrayBuffer): Promise<ImportedOfficialGameRow[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Locate ZIP End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('올바른 XLSX(ZIP) 파일 형식이 아닙니다.');
  }

  const cdEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const entries: Record<string, Uint8Array> = {};

  async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    await writer.write(new Uint8Array(compressed));
    await writer.close();
    const out = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(out);
  }

  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (
      name === 'xl/sharedStrings.xml' ||
      name === 'xl/worksheets/sheet1.xml'
    ) {
      const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
      const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const rawSlice = bytes.subarray(dataStart, dataStart + compSize);
      entries[name] = method === 8 ? await inflateRaw(rawSlice) : rawSlice;
    }
  }

  const sheetXmlBytes = entries['xl/worksheets/sheet1.xml'];
  if (!sheetXmlBytes) {
    throw new Error('XLSX 내부에서 첫 번째 시트(sheet1.xml)를 찾을 수 없습니다.');
  }

  const parser = new DOMParser();
  const sharedStrings: string[] = [];
  if (entries['xl/sharedStrings.xml']) {
    const ssDoc = parser.parseFromString(decoder.decode(entries['xl/sharedStrings.xml']), 'application/xml');
    const siNodes = Array.from(ssDoc.getElementsByTagName('si'));
    for (const si of siNodes) {
      const tNodes = Array.from(si.getElementsByTagName('t'));
      sharedStrings.push(tNodes.map((t) => t.textContent ?? '').join(''));
    }
  }

  const sheetDoc = parser.parseFromString(decoder.decode(sheetXmlBytes), 'application/xml');
  const rowNodes = Array.from(sheetDoc.getElementsByTagName('row'));
  const table: string[][] = [];

  for (const rowNode of rowNodes) {
    const rowVals: string[] = [];
    const cellNodes = Array.from(rowNode.getElementsByTagName('c'));
    for (const c of cellNodes) {
      const ref = c.getAttribute('r') ?? '';
      const colLetters = ref.replace(/\d+/g, '');
      let colIdx = 0;
      for (let k = 0; k < colLetters.length; k++) {
        colIdx = colIdx * 26 + (colLetters.charCodeAt(k) - 64);
      }
      colIdx = Math.max(0, colIdx - 1);
      const cellType = c.getAttribute('t');
      const vNode = c.getElementsByTagName('v')[0];
      const isNode = c.getElementsByTagName('is')[0];
      let val = '';
      if (cellType === 's' && vNode) {
        val = sharedStrings[Number(vNode.textContent ?? 0)] ?? '';
      } else if (cellType === 'inlineStr' && isNode) {
        val = isNode.textContent ?? '';
      } else if (vNode) {
        val = vNode.textContent ?? '';
      }
      rowVals[colIdx] = val.trim();
    }
    if (rowVals.some(Boolean)) {
      table.push(rowVals);
    }
  }

  const csvLike = table.map((r) => r.map((v) => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  return parseOfficialScheduleCsv(csvLike);
}

/**
 * 가져온 KBO 공식 일정을 커리어에 반영한다.
 * - 이미 진행한 경기(gamesLedger) 결과는 절대 변경/삭제하지 않음
 * - 동일 날짜 중복 경기를 자동 차단
 * - 미진행 미래 시리즈를 공식 일정으로 교체하고 scheduleSource = 'OFFICIAL'로 명시 구분
 */
export function applyImportedOfficialSchedule(
  career: CareerSave,
  rows: ImportedOfficialGameRow[],
  meta: { fileName: string; format: 'XLSX' | 'CSV' | 'JSON' }
): { nextCareer: CareerSave; importedGames: number; preservedPlayedGames: number } {
  if (!rows || rows.length === 0) {
    throw new Error('유효한 공식 일정 경기 행이 없습니다. (열 형식: date/날짜, away/원정, home/홈)');
  }

  const next: CareerSave = JSON.parse(JSON.stringify(career));
  const playedRegularGames = next.gamesLedger.filter((g) => !g.isPostseason);
  const lastPlayedDate =
    playedRegularGames.length > 0
      ? playedRegularGames.reduce((max, g) => (g.date > max ? g.date : max), '')
      : '';

  // 이미 완료된 시리즈 보존
  const preservedSeries: ScheduledSeries[] = [];
  let maxCompletedRound = 0;
  for (const s of next.schedule) {
    if (s.completedRounds >= s.dates.length) {
      preservedSeries.push({ ...s });
      maxCompletedRound = Math.max(maxCompletedRound, s.endRound);
    }
  }

  // 날짜별 그룹화 + 동일 날짜 중복 경기 방지
  const byDate = new Map<string, { away: TeamId; home: TeamId }[]>();
  const teamDateSeen = new Set<string>();

  const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  let validImportedCount = 0;

  for (const r of sortedRows) {
    // 이미 진행한 날짜 이전/동일 날짜 경기는 보존을 위해 건너뜀
    if (lastPlayedDate && r.date <= lastPlayedDate) continue;
    const aKey = `${r.date}::${r.away}`;
    const hKey = `${r.date}::${r.home}`;
    if (teamDateSeen.has(aKey) || teamDateSeen.has(hKey)) continue;
    teamDateSeen.add(aKey);
    teamDateSeen.add(hKey);
    const list = byDate.get(r.date) ?? [];
    list.push({ away: r.away, home: r.home });
    byDate.set(r.date, list);
    validImportedCount += 1;
  }

  if (validImportedCount === 0) {
    throw new Error('이미 진행된 경기 이후에 적용할 신규 공식 일정 경기가 없습니다.');
  }

  // 동일 매치업 연속일자를 시리즈(1~3연전)로 묶어 ScheduledSeries 생성
  const sortedDates = Array.from(byDate.keys()).sort();
  const newSeries: ScheduledSeries[] = [];
  let seriesIdx = preservedSeries.length + 1;
  let roundCursor = maxCompletedRound + 1;

  const matchupSig = (ms: { away: TeamId; home: TeamId }[]) =>
    ms
      .map((m) => `${m.away}@${m.home}`)
      .sort()
      .join('|');

  let i = 0;
  while (i < sortedDates.length) {
    const startDt = sortedDates[i];
    const startMatchups = byDate.get(startDt)!;
    const sig = matchupSig(startMatchups);
    const groupDates = [startDt];

    while (
      i + 1 < sortedDates.length &&
      groupDates.length < 3 &&
      sortedDates[i + 1] === addDaysIso(groupDates[groupDates.length - 1], 1) &&
      matchupSig(byDate.get(sortedDates[i + 1])!) === sig
    ) {
      i += 1;
      groupDates.push(sortedDates[i]);
    }

    const avgTravelKm = Math.round(
      startMatchups.reduce((s, m) => s + computeTravelDistanceKm(m.away, m.home), 0) /
        Math.max(1, startMatchups.length)
    );
    const seasonYear = startDt.slice(0, 4);

    newSeries.push({
      seriesIndex: seriesIdx,
      startRound: roundCursor,
      endRound: roundCursor + groupDates.length - 1,
      dates: groupDates,
      matchups: startMatchups,
      completedRounds: 0,
      hasMondayRestBefore: getDayOfWeekUtc(addDaysIso(startDt, -1)) === 1,
      isChildrenDaySeries: groupDates.includes(`${seasonYear}-05-05`),
      travelDistanceKm: avgTravelKm,
      scheduleSource: 'OFFICIAL',
    });

    seriesIdx += 1;
    roundCursor += groupDates.length;
    i += 1;
  }

  next.schedule = [...preservedSeries, ...newSeries];
  next.currentSeriesIndex = preservedSeries.length;
  next.scheduleSource = 'OFFICIAL';
  next.officialScheduleMeta = {
    importedAt: next.currentDate ?? `${next.season}-01-01`,
    fileName: meta.fileName,
    format: meta.format,
    totalGames: validImportedCount,
    preservedPlayedGames: playedRegularGames.length,
  };

  next.transactionLogs.unshift({
    id: `tx-official-sched-${Date.now()}`,
    date: next.currentDate ?? `${next.season}-01-01`,
    type: '엔트리',
    teamId: next.playerTeamId,
    summary: `KBO 공식 일정(${meta.format}) 반영 완료 · 신규 ${validImportedCount}경기 편성 (기진행 ${playedRegularGames.length}경기 보존)`,
    detail: `파일: ${meta.fileName}`,
  });

  return {
    nextCareer: next,
    importedGames: validImportedCount,
    preservedPlayedGames: playedRegularGames.length,
  };
}
