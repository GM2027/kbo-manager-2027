import assert from 'node:assert/strict';
import { TEAM_IDS } from '../../data/kboTeams';
import { createPreservedHanwhaCareer } from '../../data/masterImport';
import { createNewCareer } from '../../data/newGameTemplate';
import {
  getFaMarketCycleSeason,
  getTeamExternalFaSigningCount,
  MAX_EXTERNAL_FA_PER_CLUB,
  syncFaCompetitionMarketInPlace,
} from '../faCompetitionEngine';
import { simulateNextRegularGame } from '../simulator';
import {
  advanceToNextSeason,
  releaseExpiredFaPlayersToMarket,
  reorderBullpen,
  reorderLineupOrder,
  reorderStartingRotation,
  signExternalFaPlayer,
} from '../transactions';
import {
  __resetStorageMemoryCacheForTests,
  exportCareerJson,
  getAutoSlotId,
  getLastSaveError,
  getManualSlotId,
  getSyncStorageUsageSnapshot,
  importCareerJson,
  listBackupsForCareer,
  listContinueOptions,
  loadCareerById,
  MAX_AUTO_SAVE_BACKUPS,
  restoreCareerFromBackup,
  saveAutoCareer,
  saveCareer,
  saveManualCareer,
} from '../../storage/careerStorage';
import { compressSavePayload } from '../../storage/saveCompression';
import { BatterStats, CareerSave, PitcherStats } from '../../types/kbo';

/**
 * In-memory mock localStorage with configurable byte quota to test
 * 100+ repeated saves, backup pruning, legacy migration, and QuotaExceeded failure protection.
 */
class MockLocalStorage implements Storage {
  private map = new Map<string, string>();
  public maxBytes: number;
  public failNextSetItem = false;

  constructor(maxBytes = 5 * 1024 * 1024) {
    this.maxBytes = maxBytes;
  }

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  getTotalBytes(): number {
    let total = 0;
    for (const [k, v] of this.map.entries()) {
      total += (k.length + v.length) * 2;
    }
    return total;
  }

  setItem(key: string, value: string): void {
    if (this.failNextSetItem) {
      throw new Error('QuotaExceededError: simulated write failure');
    }
    const prev = this.map.get(key);
    const prevBytes = prev !== undefined ? (key.length + prev.length) * 2 : 0;
    const nextBytes = (key.length + value.length) * 2;
    if (this.getTotalBytes() - prevBytes + nextBytes > this.maxBytes) {
      throw new Error('QuotaExceededError: mock localStorage quota exceeded');
    }
    this.map.set(key, value);
  }
}

function testRotationLineupBullpenReordering() {
  let career = createNewCareer({ teamId: 'LG', gmName: '로테이션테스터', seed: 7701 });
  career.phase = 'REGULAR_SEASON';

  // Simulate 2 games so starters accumulate real pitching records and nextStarterIdx advances
  career = simulateNextRegularGame(career).nextCareer;
  career = simulateNextRegularGame(career).nextCareer;

  const team = career.teams[career.playerTeamId];
  assert.ok(team.rotationOrder.length >= 5, 'Starting rotation must have at least 5 pitchers');

  const origRot = [...team.rotationOrder];
  const origNextIdx = team.nextStarterIdx % origRot.length;
  const expectedNextStarterId = origRot[origNextIdx];

  // Snapshot existing pitching records before reordering
  const statsSnapshot = new Map<string, { G: number | null; outs: number | null; fatigue: number; lastDate?: string }>();
  for (const pid of origRot) {
    const p = career.players[pid];
    const ps = p.stats as PitcherStats;
    statsSnapshot.set(pid, {
      G: ps.G,
      outs: ps.outs,
      fatigue: p.fatigue,
      lastDate: p.lastPitchedDate,
    });
  }

  // 1) Move 5선발 (idx 4) -> 1선발 (idx 0)
  let moved = reorderStartingRotation(career, 4, 0);
  const rotAfter5to1 = moved.teams[moved.playerTeamId].rotationOrder;
  assert.deepEqual(
    rotAfter5to1.slice(0, 5),
    [origRot[4], origRot[0], origRot[1], origRot[2], origRot[3]],
    'Moving 5th starter to 1st must shift 1..4 down cleanly'
  );
  assert.equal(
    rotAfter5to1[moved.teams[moved.playerTeamId].nextStarterIdx],
    expectedNextStarterId,
    'Moving 5th starter to 1st must preserve next scheduled starter turn'
  );

  // 2) Move 1선발 (idx 0) -> 5선발 (idx 4)
  moved = reorderStartingRotation(moved, 0, 4);
  const rotBack = moved.teams[moved.playerTeamId].rotationOrder;
  assert.deepEqual(rotBack.slice(0, 5), origRot.slice(0, 5), 'Moving 1st back to 5th must restore original order');
  assert.equal(
    rotBack[moved.teams[moved.playerTeamId].nextStarterIdx],
    expectedNextStarterId,
    'Moving 1st back to 5th must still preserve next scheduled starter turn'
  );

  // 3) Move 4선발 (idx 3) -> 2선발 (idx 1)
  moved = reorderStartingRotation(moved, 3, 1);
  const rot4to2 = moved.teams[moved.playerTeamId].rotationOrder;
  assert.deepEqual(
    rot4to2.slice(0, 5),
    [origRot[0], origRot[3], origRot[1], origRot[2], origRot[4]],
    'Moving 4th starter to 2nd must shift remaining starters in exact order'
  );
  assert.equal(
    rot4to2[moved.teams[moved.playerTeamId].nextStarterIdx],
    expectedNextStarterId,
    'Moving 4th starter to 2nd must preserve next scheduled starter turn'
  );

  // Confirm zero pitching record loss across all starters
  for (const pid of origRot) {
    const p = moved.players[pid];
    const ps = p.stats as PitcherStats;
    const snap = statsSnapshot.get(pid)!;
    assert.equal(ps.G, snap.G, `Pitcher ${p.name} G must remain preserved`);
    assert.equal(ps.outs, snap.outs, `Pitcher ${p.name} outs must remain preserved`);
    assert.equal(p.fatigue, snap.fatigue, `Pitcher ${p.name} fatigue must remain preserved`);
    assert.equal(p.lastPitchedDate, snap.lastDate, `Pitcher ${p.name} lastPitchedDate must remain preserved`);
  }

  // 4) Batting lineup direct reorder: 9번 -> 1번 & preserve fielding positions
  const origLineup = [...moved.teams[moved.playerTeamId].lineupOrder];
  const origPositions = { ...moved.teams[moved.playerTeamId].lineupPositions };
  assert.equal(origLineup.length, 9, 'Starting lineup must have 9 batters');
  const afterLineupMove = reorderLineupOrder(moved, 8, 0);
  assert.deepEqual(
    afterLineupMove.teams[afterLineupMove.playerTeamId].lineupOrder,
    [origLineup[8], ...origLineup.slice(0, 8)],
    'Moving 9th batter to 1st must auto-shift batters 1..8 down'
  );
  for (const bid of origLineup) {
    assert.equal(
      afterLineupMove.teams[afterLineupMove.playerTeamId].lineupPositions[bid],
      origPositions[bid],
      'Lineup reorder must preserve every batter fielding position'
    );
  }

  // 5) Bullpen direct reorder: last -> 1st
  const afterBpNorm = reorderBullpen(afterLineupMove, 0, 0);
  const bpBefore = [...afterBpNorm.teams[afterBpNorm.playerTeamId].bullpenOrder];
  assert.ok(bpBefore.length >= 3, 'Must have at least 3 bullpen pitchers');
  const lastIdx = bpBefore.length - 1;
  const afterBpMove = reorderBullpen(afterBpNorm, lastIdx, 0);
  assert.deepEqual(
    afterBpMove.teams[afterBpMove.playerTeamId].bullpenOrder,
    [bpBefore[lastIdx], ...bpBefore.slice(0, lastIdx)],
    'Moving last bullpen pitcher to 1st must auto-shift remaining relievers'
  );
}

function testMultiYearFaLimitAndSeasonRollover() {
  let career = createNewCareer({ teamId: '한화', gmName: 'FA테스터', seed: 7702 });
  career.finances.cashBalanceBillion = 350;

  // 1) 2027 pre-season FA cycle: sign MAX_EXTERNAL_FA_PER_CLUB (2) external FAs
  assert.equal(career.season, 2027);
  assert.equal(getFaMarketCycleSeason(career), 2027);

  // Ensure at least 3 external FA candidates exist in 2027 pre-season market
  const externalCandidates2027 = Object.values(career.players)
    .filter((p) => p.teamId !== '한화' && p.category === '국내' && p.role === '타자' && p.rosterTier === '1군')
    .slice(0, 3);
  assert.equal(externalCandidates2027.length, 3);
  for (const cand of externalCandidates2027) {
    cand.formerTeamId = cand.teamId;
    cand.rosterTier = 'FA';
    cand.serviceYears = 9;
    cand.age = 29;
    cand.birthDate = '1998-04-10';
    cand.ability = 78;
    cand.contract.yearsRemaining = 0;
    cand.contract.status = '만료';
    cand.contract.isFAEligible = true;
    cand.contract.faGrade = 'C';
  }
  syncFaCompetitionMarketInPlace(career, '2027-01-15');

  const signed2027Ids: string[] = [];
  for (let i = 0; i < MAX_EXTERNAL_FA_PER_CLUB; i++) {
    const target = externalCandidates2027[i];
    const res = signExternalFaPlayer(career, target.id, 3, 60);
    assert.equal(res.accepted, true, `2027 external FA #${i + 1} must be accepted`);
    career = res.nextCareer;
    career.pendingFaProtection = null;
    signed2027Ids.push(target.id);
  }
  assert.equal(
    getTeamExternalFaSigningCount(career, '한화'),
    MAX_EXTERNAL_FA_PER_CLUB,
    '2027 external FA signing count must equal cap after 2 signings'
  );

  // Confirm 3rd external FA in the SAME 2027 pre-season cycle is still blocked by KBO rule
  assert.throws(
    () => signExternalFaPlayer(career, externalCandidates2027[2].id, 2, 40),
    /단일 시즌.*외부 FA 영입은 최대/,
    'Exceeding external FA limit within same 2027 season must still throw'
  );

  // 2) Transition to 2027 OFFSEASON (2028 FA stove league!)
  career.phase = 'OFFSEASON';
  career.currentDate = '2027-11-20';
  assert.equal(
    getFaMarketCycleSeason(career),
    2028,
    '2027 OFFSEASON FA market cycle must map to 2028 season'
  );
  assert.equal(
    getTeamExternalFaSigningCount(career, '한화'),
    0,
    '2027 OFFSEASON (2028 FA market) must start with 0 external FA signings (no 2027 carryover!)'
  );

  // Prepare an external FA for 2028 offseason signing
  const ext2028Target = Object.values(career.players).find(
    (p) => p.teamId !== '한화' && p.category === '국내' && p.role === '타자' && p.rosterTier === '1군'
  )!;
  ext2028Target.formerTeamId = ext2028Target.teamId;
  ext2028Target.rosterTier = 'FA';
  ext2028Target.serviceYears = 9;
  ext2028Target.age = 28;
  ext2028Target.birthDate = '1999-06-15';
  ext2028Target.ability = 80;
  ext2028Target.contract.yearsRemaining = 0;
  ext2028Target.contract.status = '만료';
  ext2028Target.contract.isFAEligible = true;
  ext2028Target.contract.faGrade = 'C';
  releaseExpiredFaPlayersToMarket(career, '2027-11-20');

  // Sign 4-year multi-year FA contract in 2027 OFFSEASON -> MUST NOT throw '단일 시즌 초과'!
  const sign2028Res = signExternalFaPlayer(career, ext2028Target.id, 4, 88);
  assert.equal(sign2028Res.accepted, true, '2028 offseason FA signing after 2027 FA signings must succeed');
  career = sign2028Res.nextCareer;
  career.pendingFaProtection = null;

  const signed2028Player = career.players[ext2028Target.id];
  assert.equal(signed2028Player.signedAsFaSeason, 2028, 'Offseason FA signedAsFaSeason must be 2028');
  assert.equal(signed2028Player.contract.startSeason, 2028, 'Offseason FA contract startSeason must be 2028');
  assert.equal(signed2028Player.contract.endSeason, 2031, '4-year 2028 FA contract endSeason must be 2031');
  assert.equal(signed2028Player.contract.yearsRemaining, 4);

  // 3) Advance to 2028 REGULAR_SEASON and verify contract years & finances
  career = advanceToNextSeason(career).nextCareer;
  assert.equal(career.season, 2028);
  assert.equal(
    career.players[ext2028Target.id].contract.yearsRemaining,
    4,
    '4-year FA signed in 2027 offseason must keep full 4 years remaining entering 2028 season'
  );
  assert.equal(
    career.players[signed2027Ids[0]].contract.yearsRemaining,
    2,
    '3-year FA signed in 2027 pre-season must have 2 years remaining entering 2028 season'
  );

  // 4) Advance to 2028 OFFSEASON -> 2029 FA cycle must reset to 0 again
  career.phase = 'OFFSEASON';
  assert.equal(getFaMarketCycleSeason(career), 2029);
  assert.equal(getTeamExternalFaSigningCount(career, '한화'), 0);
}

function testTenConsecutiveSeasons2027To2037() {
  let career = createNewCareer({ teamId: 'LG', gmName: '10년연속테스터', seed: 7703 });
  career.phase = 'REGULAR_SEASON';
  career.finances.cashBalanceBillion = 220;

  // Pick a young 1군 batter to track age, serviceYears, and careerStats across 2027 -> 2037
  const trackedPlayer = Object.values(career.players).find(
    (p) => p.teamId === 'LG' && p.role === '타자' && p.rosterTier === '1군' && p.age <= 24 && p.birthDate
  )!;
  assert.ok(trackedPlayer, 'Must find a young 1군 batter to track across 10 seasons');
  const trackedId = trackedPlayer.id;
  const initialAge = trackedPlayer.age;
  const initialService = trackedPlayer.serviceYears;
  const initialCareerHits = trackedPlayer.careerStats?.H ?? 0;
  const initialSeasonHistoryCount = (career.seasonHistory ?? []).length;

  let cumulativeRecordedHits = 0;

  for (let targetSeason = 2027; targetSeason < 2037; targetSeason++) {
    assert.equal(career.season, targetSeason, `Expected season ${targetSeason}`);

    // Simulate 3 regular games so gamesLedger, stats, finances, and standings populate
    for (let g = 0; g < 3; g++) {
      career = simulateNextRegularGame(career).nextCareer;
    }

    // Record known season hits on tracked player if still active so we verify careerStats accumulation
    const tp = career.players[trackedId];
    if (tp && tp.rosterTier !== '은퇴' && tp.rosterTier !== '해외이적') {
      const bs = tp.stats as BatterStats;
      bs.G = Math.max(bs.G ?? 0, 10);
      bs.PA = (bs.PA ?? 0) + 20;
      bs.AB = (bs.AB ?? 0) + 18;
      bs.H = (bs.H ?? 0) + 7;
      bs.TB = (bs.TB ?? 0) + 10;
      cumulativeRecordedHits += bs.H;
    }

    // Enter offseason & release expired FAs
    career.phase = 'OFFSEASON';
    releaseExpiredFaPlayersToMarket(career, `${targetSeason}-11-18`);
    assert.equal(
      getFaMarketCycleSeason(career),
      targetSeason + 1,
      `Offseason after ${targetSeason} must use ${targetSeason + 1} FA cycle`
    );

    // Advance to next season
    career = advanceToNextSeason(career).nextCareer;
    const nextSeason = targetSeason + 1;
    assert.equal(career.season, nextSeason, `Must advance cleanly to ${nextSeason}`);

    // Verify zero duplicate seasonHistory entries
    const seasonHistoryYears = (career.seasonHistory ?? []).map((s) => s.season);
    assert.equal(
      new Set(seasonHistoryYears).size,
      seasonHistoryYears.length,
      `seasonHistory must not contain duplicate seasons at ${nextSeason}`
    );

    // Verify zero duplicate FA coaches
    const coachKeys = (career.faCoaches ?? []).map((c) => `${c.id}::${c.name}`);
    assert.equal(
      new Set(coachKeys).size,
      coachKeys.length,
      `faCoaches must not contain duplicates at ${nextSeason}`
    );

    // Verify club finances remain valid numbers & seasonal counters reset cleanly
    assert.ok(
      career.finances.cashBalanceBillion !== null && Number.isFinite(career.finances.cashBalanceBillion),
      `cashBalanceBillion must stay finite in ${nextSeason}`
    );
    assert.equal(career.finances.seasonRevenueBillion, 0, `seasonRevenueBillion must reset in ${nextSeason}`);
    assert.equal(career.finances.seasonExpenseBillion, 0, `seasonExpenseBillion must reset in ${nextSeason}`);

    // Verify all 10 clubs have complete deduplicated 9-man lineups and >=5-man rotations
    for (const tid of TEAM_IDS) {
      const ts = career.teams[tid];
      assert.equal(ts.lineupOrder.length, 9, `${tid} must have 9 batters in ${nextSeason}`);
      assert.equal(
        new Set(ts.lineupOrder).size,
        9,
        `${tid} lineupOrder must have zero duplicates in ${nextSeason}`
      );
      assert.ok(ts.rotationOrder.length >= 5, `${tid} must have >= 5 starters in ${nextSeason}`);
      assert.equal(
        new Set(ts.rotationOrder).size,
        ts.rotationOrder.length,
        `${tid} rotationOrder must have zero duplicates in ${nextSeason}`
      );
      const rotSet = new Set(ts.rotationOrder);
      assert.ok(
        ts.bullpenOrder.every((id) => !rotSet.has(id)),
        `${tid} bullpenOrder must not overlap rotationOrder in ${nextSeason}`
      );
    }
  }

  assert.equal(career.season, 2037, 'Career must reach 2037 season cleanly after 10 transitions');
  assert.equal(
    (career.seasonHistory ?? []).length,
    initialSeasonHistoryCount + 10,
    'All 10 completed seasons (2027~2036) must be archived alongside baseline history without duplicates'
  );
  for (let s = 2027; s <= 2036; s++) {
    assert.ok(
      (career.seasonHistory ?? []).some((h) => h.season === s),
      `Season ${s} must exist in seasonHistory`
    );
  }

  const trackedFinal = career.players[trackedId];
  assert.equal(
    trackedFinal.age,
    initialAge + 10,
    `Tracked player age must advance exactly +10 across 2027->2037 (initial ${initialAge}, final ${trackedFinal.age})`
  );
  assert.ok(
    trackedFinal.serviceYears >= initialService + 5,
    'Tracked player serviceYears must progress over multi-season play'
  );
  assert.ok(
    (trackedFinal.careerStats?.H ?? 0) >= initialCareerHits + cumulativeRecordedHits,
    'Tracked player careerStats.H must preserve and accumulate all 10 seasons of hits'
  );
}

function testRepeated100PlusSavesAndFailureProtection() {
  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  const mockLs = new MockLocalStorage(4 * 1024 * 1024);
  (globalThis as Record<string, unknown>).localStorage = mockLs;
  __resetStorageMemoryCacheForTests();

  try {
    let career = createNewCareer({ teamId: '삼성', gmName: '세이브테스터', seed: 7704 });
    career.phase = 'REGULAR_SEASON';
    const baseCareerId = career.careerId;

    // 1) Initial manual save
    const firstManual = saveManualCareer(career);
    assert.equal(firstManual.ok, true, 'Initial manual save must succeed');
    const manualSlotId = getManualSlotId(baseCareerId);
    assert.equal(firstManual.savedCareer.careerId, manualSlotId);

    // 2) Perform 110 repeated auto-saves with backup snapshots + 15 repeated manual saves
    let autoSizeAfter10 = 0;
    let autoSizeAfter110 = 0;
    for (let i = 1; i <= 110; i++) {
      const prevSnap: CareerSave = { ...career, gamesPlayed: i - 1, version: `v4.70.${i - 1}` };
      career = {
        ...career,
        gamesPlayed: i,
        version: `v4.70.${i}`,
        // Inject repeated duplicate transaction/news entries to prove storage deduplication works
        transactionLogs: [
          {
            id: `tx-dup-fixed`,
            date: '2027-04-01',
            type: '엔트리',
            teamId: '삼성',
            summary: '중복 로그 정리 검증',
          },
          ...(career.transactionLogs ?? []),
        ],
      };
      const autoRes = saveAutoCareer(career, prevSnap);
      assert.equal(autoRes.ok, true, `Auto-save #${i} must succeed`);

      if (i % 10 === 0) {
        const manRes = saveManualCareer({ ...career, gamesPlayed: i });
        assert.equal(manRes.ok, true, `Manual save #${i / 10} must succeed`);
      }

      if (i === 10) autoSizeAfter10 = mockLs.getTotalBytes();
      if (i === 110) autoSizeAfter110 = mockLs.getTotalBytes();
    }

    // Verify NO unbounded storage growth across 110 repeated saves
    const growthRatio = autoSizeAfter110 / Math.max(1, autoSizeAfter10);
    assert.ok(
      growthRatio < 1.35,
      `Storage size must stay bounded across 110 saves (after10=${autoSizeAfter10}B, after110=${autoSizeAfter110}B, ratio=${growthRatio.toFixed(2)})`
    );

    // Verify manual and auto slots are strictly separated (exact 2 slots, overwriting same slots)
    const opts = listContinueOptions();
    assert.equal(
      opts.savedCareers.length,
      2,
      `110 auto-saves + 12 manual saves on same career must produce exactly 2 slots (manual + auto), got ${opts.savedCareers.length}`
    );
    const manualSlot = opts.savedCareers.find((s) => s.slotKind === 'manual');
    const autoSlot = opts.savedCareers.find((s) => s.slotKind === 'auto');
    assert.ok(manualSlot && autoSlot, 'Both manual and auto slots must exist separately');

    // Verify rolling auto-save backups are strictly capped at MAX_AUTO_SAVE_BACKUPS (3)
    const backups = listBackupsForCareer(autoSlot.careerId);
    assert.equal(
      backups.length,
      MAX_AUTO_SAVE_BACKUPS,
      `Auto-save backups must keep strictly latest ${MAX_AUTO_SAVE_BACKUPS} entries (got ${backups.length})`
    );
    assert.equal(backups[0].gamesPlayed, 109, 'Most recent auto backup must be game 109');
    assert.equal(backups[1].gamesPlayed, 108, '2nd auto backup must be game 108');
    assert.equal(backups[2].gamesPlayed, 107, '3rd auto backup must be game 107');

    // Verify manual save isolation: auto-save 111 must NOT overwrite manual slot (still at 110)
    const auto111 = saveAutoCareer({ ...career, gamesPlayed: 111, version: 'v4.70.111' }, career);
    assert.equal(auto111.ok, true);
    const loadedManual = loadCareerById(manualSlot.careerId)!;
    const loadedAuto = loadCareerById(autoSlot.careerId)!;
    assert.equal(loadedManual.gamesPlayed, 110, 'Manual slot must remain untouched by subsequent auto-save');
    assert.equal(loadedAuto.gamesPlayed, 111, 'Auto slot must reflect latest auto-save (111)');

    // Verify duplicate transaction log was deduplicated
    const dupCount = loadedAuto.transactionLogs.filter((t) => t.id === 'tx-dup-fixed').length;
    assert.equal(dupCount, 1, 'Duplicate transaction logs must be removed on save');

    // Verify storage usage report accuracy
    const usage = getSyncStorageUsageSnapshot();
    assert.equal(usage.manualSlotCount, 1);
    assert.equal(usage.autoSlotCount, 1);
    assert.equal(usage.autoBackupCount, MAX_AUTO_SAVE_BACKUPS);
    assert.ok(usage.localStorageBytes > 0);

    // Verify restore from auto backup #2 (game 109)
    const restored = restoreCareerFromBackup(autoSlot.careerId, 1);
    assert.ok(restored && restored.gamesPlayed === 109, 'Restoring auto backup must work cleanly');

    // 3) Simulate save failure (QuotaExceededError) -> existing saved data MUST remain intact!
    const beforeFailLoaded = loadCareerById(manualSlot.careerId)!;
    assert.equal(beforeFailLoaded.gamesPlayed, 110);
    mockLs.failNextSetItem = true;
    const failedSave = saveCareer(
      { ...beforeFailLoaded, gamesPlayed: 999, label: 'CORRUPTED_SHOULD_NOT_SAVE' },
      undefined,
      { mode: 'manual', skipAutoBackup: true }
    );
    mockLs.failNextSetItem = false;
    assert.equal(failedSave, false, 'Simulated quota failure must return false');
    assert.ok(getLastSaveError(), 'Failed save must record a descriptive error message');

    const afterFailLoaded = loadCareerById(manualSlot.careerId)!;
    assert.equal(
      afterFailLoaded.gamesPlayed,
      110,
      'On save failure, existing valid save data must remain completely protected'
    );
    assert.notEqual(afterFailLoaded.label, 'CORRUPTED_SHOULD_NOT_SAVE');

    // Verify getAutoSlotId helper works cleanly when loaded from a manual slot
    const autoFromManual = saveAutoCareer(afterFailLoaded);
    assert.equal(autoFromManual.savedCareer.careerId, getAutoSlotId(baseCareerId));
  } finally {
    __resetStorageMemoryCacheForTests();
    (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
  }
}

function testLegacySaveCompatibilityAndExportImport() {
  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  const mockLs = new MockLocalStorage(5 * 1024 * 1024);
  (globalThis as Record<string, unknown>).localStorage = mockLs;
  __resetStorageMemoryCacheForTests();

  try {
    // 1) Preserved Hanwha v4.60.30 master save loads with zero data loss
    const rawMasterCount = Object.keys(createPreservedHanwhaCareer().players).length;
    const master = loadCareerById('career_hanwha_v46030_master');
    assert.ok(master, 'Preserved Hanwha v4.60.30 master save must load');
    assert.equal(master.playerTeamId, '한화');
    assert.equal(master.gamesPlayed, 9);
    assert.equal(
      Object.keys(master.players).length,
      rawMasterCount,
      'Master save must retain exact original player count with zero data loss'
    );

    // 2) JSON Export & Import round-trip (both plain JSON and compressed payload)
    const exportedJson = exportCareerJson(master);
    const importedPlain = importCareerJson(exportedJson);
    assert.equal(importedPlain.playerTeamId, '한화');
    assert.equal(importedPlain.gamesPlayed, 9);
    assert.equal(Object.keys(importedPlain.players).length, Object.keys(master.players).length);

    const compressedExport = compressSavePayload(exportedJson);
    const importedCompressed = importCareerJson(compressedExport);
    assert.equal(importedCompressed.playerTeamId, '한화');
    assert.equal(importedCompressed.gamesPlayed, 9);

    // 3) Legacy v1 uncompressed localStorage key auto-migration without data loss
    __resetStorageMemoryCacheForTests();
    mockLs.clear();
    const legacyCareer = createNewCareer({ teamId: 'KIA', gmName: '레거시단장', seed: 7705 });
    legacyCareer.gamesPlayed = 24;
    // Allow writing raw uncompressed legacy JSON (~6MB+), then tighten quota to 4MB to prove migration shrinks it
    mockLs.maxBytes = 16 * 1024 * 1024;
    mockLs.setItem(
      'kbo_gm_2026_careers_v1',
      JSON.stringify({ [legacyCareer.careerId]: legacyCareer })
    );
    const bytesBeforeMigration = mockLs.getTotalBytes();
    mockLs.maxBytes = 4 * 1024 * 1024;

    const migratedLoaded = loadCareerById(legacyCareer.careerId);
    assert.ok(migratedLoaded, 'Legacy v1 save must auto-migrate and load cleanly');
    assert.equal(migratedLoaded.playerTeamId, 'KIA');
    assert.equal(migratedLoaded.gamesPlayed, 24);
    assert.equal(
      mockLs.getItem('kbo_gm_2026_careers_v1'),
      null,
      'Bloated legacy v1 localStorage key must be cleaned up after lossless migration'
    );
    assert.ok(
      mockLs.getTotalBytes() < bytesBeforeMigration * 0.35,
      `Compression migration must reduce storage size by >65% (before=${bytesBeforeMigration}B, after=${mockLs.getTotalBytes()}B)`
    );
  } finally {
    __resetStorageMemoryCacheForTests();
    (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
  }
}

function runSystemPatchTests() {
  testRotationLineupBullpenReordering();
  console.log('[PASS] 1. Starting Rotation (1~5), Lineup (1~9), Bullpen Drag/Direct Reordering & Turn Preservation');

  testMultiYearFaLimitAndSeasonRollover();
  console.log('[PASS] 2. Multi-Year FA Contract & 2027->2028 Single-Season Limit Reset');

  testTenConsecutiveSeasons2027To2037();
  console.log('[PASS] 3. Continuous 10-Season Career Progression (2027 -> 2037)');

  testRepeated100PlusSavesAndFailureProtection();
  console.log('[PASS] 4. 110+ Repeated Saves, Manual/Auto Separation, Max 3 Backups & Failure Protection');

  testLegacySaveCompatibilityAndExportImport();
  console.log('[PASS] 5. Legacy Save Compatibility, Export/Import & Zero Data Loss');

  console.log('ALL SYSTEM PATCH VERIFICATION TESTS PASSED');
}

runSystemPatchTests();
