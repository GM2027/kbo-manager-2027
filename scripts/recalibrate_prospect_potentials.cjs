/**
 * 기존 KBO 유망주 및 2군 젊은 선수 잠재력(POT) 현실성 개선 패치 (v24)
 * - 수정 전 데이터를 src/data/v23PlayerDataBackupBeforePotentialPatch.json 에 자동 백업
 * - 나이·드래프트 순번·1군 및 퓨처스 성적·세부 능력치·스카우팅 평가를 종합해 개별 평가
 * - 통일 척도: 일반 유망주 63~75, 상위권 유망주 73~82, 특급 유망주 80~87, 초특급 88~95 (극소수)
 * - 현재 오버롤(OVR)은 유지하고 잠재력(POT) 중심으로 보정 (나이만으로 일괄 상향 금지)
 * - 수정 전후 전체 비교 리포트를 src/data/prospectPotentialAuditLog.json 에 기록
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.resolve('src/data/v18RecalibratedData.json');
const BACKUP_PATH = path.resolve('src/data/v23PlayerDataBackupBeforePotentialPatch.json');
const AUDIT_LOG_PATH = path.resolve('src/data/prospectPotentialAuditLog.json');

if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(DATA_PATH, BACKUP_PATH);
  console.log('Backed up pre-patch dataset to:', BACKUP_PATH);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// 공식 드래프트 메타데이터가 누락돼 있던 실존 젊은 선수 보완 (고유 ID 기준)
const VERIFIED_MISSING_DRAFT_BY_ID = {
  'v15-0183': { draft_year: 2024, draft_round: 1, draft_pick: 10, draft_method: '1라운드', scoutingBonus: 2 }, // 박지환 (SSG 2024 1R #10)
  'v15-0211': { draft_year: 2021, draft_round: 1, draft_pick: 1, draft_method: '1차지명', scoutingBonus: 2 }, // 이승현(좌) (삼성 2021 1차지명)
  'v15-0076': { draft_year: 2022, draft_round: 1, draft_pick: 1, draft_method: '2차 1라운드', scoutingBonus: 1 }, // 박준영 (한화 2022 2차 1R #1)
  '2026-OB-11': { draft_year: 2022, draft_round: 1, draft_pick: 9, draft_method: '2차 1라운드', scoutingBonus: 1 }, // 김동준 (두산 2022 2차 1R #9)
  'v15-0450': { draft_year: 2026, draft_round: 2, draft_pick: 20, draft_method: '2라운드', scoutingBonus: 0 }, // 김현수 (KIA 2026 2R)
  '2026-KT-64': { draft_year: 2022, draft_round: 2, draft_pick: 18, draft_method: '2차 2라운드', scoutingBonus: 0 }, // 이원재 (KT 2022 2차 2R)
  'v15-0499': { draft_year: 2023, draft_round: 3, draft_pick: 22, draft_method: '3라운드', scoutingBonus: 1 }, // 정해원 (KIA 2023 3R)
  'v15-0358': { draft_year: 2020, draft_round: 3, draft_pick: 26, draft_method: '2차 3라운드', scoutingBonus: 0 }, // 안인산 (KT 2020 2차 3R)
  'v15-0081': { draft_year: 2026, draft_round: 4, draft_pick: 33, draft_method: '4라운드', scoutingBonus: 0 }, // 양수호 (한화 2026 4R)
  'v15-0177': { draft_year: 2020, draft_round: 4, draft_pick: 38, draft_method: '2차 4라운드', scoutingBonus: 0 }, // 현원회 (SSG 2020 2차 4R)
  'v15-0507': { draft_year: 2023, draft_round: 7, draft_pick: 69, draft_method: '7라운드', scoutingBonus: 0 }, // 김지윤 (두산)
  '2026-OB-101': { draft_year: 2021, draft_round: 8, draft_pick: 79, draft_method: '8라운드', scoutingBonus: 0 }, // 최우인 (두산)
};

// 초특급(88~95) 및 1R 최상위 스카우팅 보정 대상 (실제 KBO 초특급·특급 평가 반영)
const ELITE_SCOUTING_TARGETS = {
  '2026-WO-18': { targetPot: 88, tier: '초특급 유망주', note: '2026 신인 드래프트 전체 1순위 초특급 우완 원석 (만 19세)' }, // 박준현
  '2026-HH-61': { targetPot: 87, tier: '특급 유망주', note: '2025 1R 전체 2순위 156km/h 강속구 우완 특급 유망주' }, // 정우주
  'v15-0589':   { targetPot: 86, tier: '특급 유망주', note: '2025 1R 전체 1순위 좌완 선발 특급 유망주' }, // 정현우
  '2026-NC-9':  { targetPot: 85, tier: '특급 유망주', note: '2026 1R 전체 2순위 내야 특급 유망주 (1군 68G)' }, // 신재인
  '2026-HH-54': { targetPot: 85, tier: '특급 유망주', note: '2026 1R 전체 3순위 외야 5툴 특급 유망주 (1군 76G)' }, // 오재원
  '2026-LT-67': { targetPot: 84, tier: '특급 유망주', note: '2026 1R 전체 4순위 장신 강속구 우완 특급 유망주' }, // 신동건
  '2026-KT-66': { targetPot: 83, tier: '특급 유망주', note: '2026 1R 전체 6순위 우완 특급 유망주' }, // 박지훈
  '2026-LG-65': { targetPot: 83, tier: '특급 유망주', note: '2026 1R 전체 8순위 투수 특급 유망주' }, // 양우진
  '2026-OB-66': { targetPot: 83, tier: '특급 유망주', note: '2026 1R 전체 7순위 강타자 외야 특급 유망주' }, // 김주오
  'v15-0214':   { targetPot: 82, tier: '특급 유망주', note: '2026 1R 전체 9순위 장신 우완 특급 유망주' }, // 이호범
  'v15-0161':   { targetPot: 82, tier: '특급 유망주', note: '2025 1R 전체 8순위 차세대 국가대표 포수 특급 유망주' }, // 이율예
  'v15-0600':   { targetPot: 82, tier: '특급 유망주', note: '2026 1R 전체 10순위 내야 거포 유망주' }, // 박한결
  'v15-0320':   { targetPot: 81, tier: '특급 유망주', note: '2025 1R 전체 9순위 장신 우완 유망주' }, // 김동현(KT)
  'v15-0183':   { targetPot: 81, tier: '특급 유망주', note: '2024 1R 전체 10순위 컨택·주루 겸비 1군 107G 유망주' }, // 박지환
  'v15-0215':   { targetPot: 80, tier: '특급 유망주', note: '2023 1R 전체 8순위 1군 79G 구위형 우완' }, // 이호성
  'v15-0335':   { targetPot: 80, tier: '특급 유망주', note: '2024 1R 전체 7순위 1군 74G 강속구 우완' }, // 원상현
  '2026-HT-39': { targetPot: 80, tier: '특급 유망주', note: '2022 1R 전체 5순위 · 항저우 AG 금메달 좌완 필승조 (1군 230G)' }, // 최지민
};

function getAge2027(birthDate) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const y = Number(birthDate.slice(0, 4));
  const m = Number(birthDate.slice(5, 7));
  const d = Number(birthDate.slice(8, 10));
  return 2027 - y - (m > 1 || (m === 1 && d > 1) ? 1 : 0);
}

function parseIpFloat(ipStr) {
  if (!ipStr) return 0;
  const s = String(ipStr).trim();
  const m = s.match(/^(\d+)\s+(\d)\/3$/);
  if (m) return Number(m[1]) + Number(m[2]) / 3;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function getDraftPedigreeBase(p, suppl) {
  const method = (suppl?.draft_method ?? p.draft_method ?? '').trim();
  const round = suppl?.draft_round ?? p.draft_round ?? null;
  const pick = suppl?.draft_pick ?? p.draft_pick ?? null;

  if (method.includes('1차')) return 82;
  if (round === 1) {
    if (pick && pick <= 1) return 86;
    if (pick && pick <= 3) return 84;
    if (pick && pick <= 6) return 82;
    return 80;
  }
  if (round === 2) return pick && pick <= 15 ? 79 : 77;
  if (round === 3) return pick && pick <= 25 ? 76 : 74;
  if (round === 4) return 73;
  if (round === 5) return 71;
  if (round === 6) return 69;
  if (round === 7) return 68;
  if (round === 8) return 66;
  if (round === 9) return 65;
  if (round === 10) return 64;
  if (round === 11) return 63;
  // 육성선수 / 드래프트 미확인
  return 63;
}

function evaluateFirstTeamSignal(p, age) {
  const rows = p.career_by_year ?? [];
  if (rows.length === 0) return { delta: 0, note: '' };

  const isPitcher = p.position === 'P';
  const totalG = rows.reduce((s, r) => s + (r.G ?? 0), 0);
  const recent = rows.filter((r) => r.season >= 2024);
  const recentG = recent.reduce((s, r) => s + (r.G ?? 0), 0);

  if (isPitcher) {
    const totalIp = recent.reduce((s, r) => s + parseIpFloat(r.IP), 0);
    const totalEr = recent.reduce((s, r) => s + (r.ER ?? 0), 0);
    const totalSo = recent.reduce((s, r) => s + (r.SO ?? 0), 0);
    if (totalIp >= 30) {
      const era = (totalEr * 9) / totalIp;
      const k9 = (totalSo * 9) / totalIp;
      if (era <= 3.4) return { delta: 5, note: `최근 1군 ERA ${era.toFixed(2)} 돌파` };
      if (era <= 4.3 || k9 >= 8.5) return { delta: 3, note: `최근 1군 ${totalIp.toFixed(0)}IP (ERA ${era.toFixed(2)}, K/9 ${k9.toFixed(1)})` };
      if (era >= 5.8 && age >= 24) return { delta: -2, note: `최근 1군 ERA ${era.toFixed(2)} 부진` };
      return { delta: 1, note: `1군 ${totalG}G 경험` };
    }
    if (recentG >= 10) return { delta: 1, note: `1군 ${totalG}G 등판 경험` };
    return { delta: 0, note: '' };
  } else {
    const totalPa = recent.reduce((s, r) => s + (r.PA ?? r.AB ?? 0), 0);
    if (totalPa >= 80) {
      const avgOps =
        recent.reduce((s, r) => s + (r.OPS ?? (r.AVG ?? 0.23) * 2.7) * (r.PA ?? r.AB ?? 1), 0) /
        Math.max(1, totalPa);
      if (avgOps >= 0.78) return { delta: 5, note: `최근 1군 OPS ${avgOps.toFixed(3)} 돌파` };
      if (avgOps >= 0.70) return { delta: 3, note: `최근 1군 ${totalPa}PA (OPS ${avgOps.toFixed(3)})` };
      if (avgOps < 0.58 && age >= 24) return { delta: -2, note: `최근 1군 OPS ${avgOps.toFixed(3)} 정체` };
      return { delta: 1, note: `1군 ${totalG}G 경험` };
    }
    if (recentG >= 20) return { delta: 1, note: `1군 ${totalG}G 출장` };
    return { delta: 0, note: '' };
  }
}

function evaluateFuturesSignal(p, age) {
  const fut = p.futures_2026;
  if (!fut || !fut.values) return { delta: 0, note: '' };
  const v = fut.values;
  if (fut.kind === 'pitching') {
    const era = v.ERA;
    if (typeof era === 'number' && Number.isFinite(era)) {
      if (era <= 3.3) return { delta: 4, note: `2026 퓨처스 ERA ${era.toFixed(2)} 우수` };
      if (era <= 4.3) return { delta: 2, note: `2026 퓨처스 ERA ${era.toFixed(2)}` };
      if (era >= 5.8 && age >= 23) return { delta: -2, note: `2026 퓨처스 ERA ${era.toFixed(2)} 부진` };
    }
  } else {
    const ops = v.OPS;
    const avg = v.AVG;
    if (typeof ops === 'number' && Number.isFinite(ops)) {
      if (ops >= 0.84) return { delta: 4, note: `2026 퓨처스 OPS ${ops.toFixed(3)} 우수` };
      if (ops >= 0.76) return { delta: 2, note: `2026 퓨처스 OPS ${ops.toFixed(3)}` };
      if (ops < 0.63 && age >= 23) return { delta: -2, note: `2026 퓨처스 OPS ${ops.toFixed(3)} 부진` };
    } else if (typeof avg === 'number' && Number.isFinite(avg)) {
      if (avg >= 0.305) return { delta: 3, note: `2026 퓨처스 타율 ${avg.toFixed(3)}` };
      if (avg < 0.22 && age >= 23) return { delta: -1, note: `2026 퓨처스 타율 ${avg.toFixed(3)}` };
    }
  }
  return { delta: 0, note: '' };
}

function evaluateToolsSignal(p, age) {
  const gr = p.game_ratings;
  if (!gr) return { delta: 0, note: '' };
  if (p.position === 'P' && gr.pitching) {
    const pt = gr.pitching;
    const peak = Math.max(pt.stuff ?? 0, pt.control ?? 0, pt.run_prevention ?? 0);
    if (peak >= 72) return { delta: 3, note: `세부 투구 툴 우수(${peak})` };
    if (peak >= 63) return { delta: 1, note: `투구 툴 양호(${peak})` };
    if (peak <= 49 && age >= 23) return { delta: -1, note: '' };
  } else if (gr.batting) {
    const bt = gr.batting;
    const peak = Math.max(bt.contact ?? 0, bt.power ?? 0, bt.discipline ?? 0, bt.speed ?? 0);
    if (peak >= 72) return { delta: 3, note: `세부 타격·주루 툴 우수(${peak})` };
    if (peak >= 63) return { delta: 1, note: `타격 툴 양호(${peak})` };
    if (peak <= 49 && age >= 23) return { delta: -1, note: '' };
  }
  return { delta: 0, note: '' };
}

function classifyProspectTier(pot) {
  if (pot >= 88) return '초특급 유망주';
  if (pot >= 80) return '특급 유망주';
  if (pot >= 73) return '상위권 유망주';
  if (pot >= 63) return '일반 유망주';
  return '육성/백업 유망주';
}

function snapshotDistribution(players) {
  const young = players.filter(
    (p) => !p.foreign_slot && p.status !== 'drafted_2027' && !p.retired_after_2026 && !p.released_after_2026 && (getAge2027(p.birth_date) ?? 99) <= 25
  );
  const pots = young.map((p) => p.game_ratings.potential);
  const gaps = young.map((p) => p.game_ratings.potential - p.game_ratings.overall);
  const avg = (arr) => Number((arr.reduce((s, x) => s + x, 0) / Math.max(1, arr.length)).toFixed(2));
  return {
    count: young.length,
    potAvg: avg(pots),
    gapAvg: avg(gaps),
    potUnder55: pots.filter((x) => x < 55).length,
    pot55to62: pots.filter((x) => x >= 55 && x <= 62).length,
    pot63to72: pots.filter((x) => x >= 63 && x <= 72).length,
    pot73to79: pots.filter((x) => x >= 73 && x <= 79).length,
    pot80to87: pots.filter((x) => x >= 80 && x <= 87).length,
    pot88plus: pots.filter((x) => x >= 88).length,
  };
}

const beforeDist = snapshotDistribution(data.players);
const changes = [];

for (const p of data.players) {
  // 2027 신인 중 11R 최하위 4명(POT 62)을 통일 척도 일반 유망주 하한(63)으로 정렬
  if (p.status === 'drafted_2027' && p.id !== 'D2027-015' && p.game_ratings.potential < 63) {
    const oldPot = p.game_ratings.potential;
    const ovr = p.game_ratings.overall;
    p.game_ratings.potential = 63;
    if (p.evaluation_v18) {
      p.evaluation_v18.pot = 63;
      p.evaluation_v18.potential_range = [ovr, 63];
    }
    if (p.rebalance_v19) {
      p.rebalance_v19.new_pot = 63;
      p.rebalance_v19.pot_delta = 63 - p.rebalance_v19.prev_pot;
    }
    changes.push({
      id: p.id,
      name: p.name,
      team: p.team,
      position: p.position,
      age2027: 19,
      draft: `2027 ${p.draft_round}R #${p.draft_pick}`,
      ovr,
      oldPot,
      newPot: 63,
      potDelta: 63 - oldPot,
      newHeadroom: 63 - ovr,
      tier: '일반 유망주',
      rationale: '2027 신인 11R 일반 유망주 통일 척도(63~75) 하한 정렬',
    });
    continue;
  }
  if (p.foreign_slot || p.status === 'drafted_2027' || p.retired_after_2026 || p.released_after_2026) {
    continue;
  }
  const age = getAge2027(p.birth_date);
  if (age === null || age > 25) continue;

  const ovr = p.game_ratings.overall;
  const oldPot = p.game_ratings.potential;

  // 누락된 공식 드래프트 정보 보완
  const suppl = VERIFIED_MISSING_DRAFT_BY_ID[p.id];
  if (suppl) {
    if (!p.draft_year) p.draft_year = suppl.draft_year;
    if (!p.draft_round) p.draft_round = suppl.draft_round;
    if (!p.draft_pick) p.draft_pick = suppl.draft_pick;
    if (!p.draft_method) p.draft_method = suppl.draft_method;
  }

  let newPot = oldPot;
  let rationale = '';

  const eliteOverride = ELITE_SCOUTING_TARGETS[p.id];
  if (eliteOverride) {
    newPot = Math.max(oldPot, eliteOverride.targetPot);
    rationale = eliteOverride.note;
  } else {
    const draftBase = getDraftPedigreeBase(p, suppl);
    const ageAdj =
      age <= 20 ? 0 : age === 21 ? -1 : age === 22 ? -2 : age === 23 ? -4 : age === 24 ? -6 : -8;
    const firstTeam = evaluateFirstTeamSignal(p, age);
    const futures = evaluateFuturesSignal(p, age);
    const tools = evaluateToolsSignal(p, age);
    const scoutBonus = suppl?.scoutingBonus ?? 0;

    // 개별 종합 잠재력 산출 (일반 63~75, 상위권 73~82, 특급 80~87; 초특급 88+는 별도 지정 외 불가)
    let computed = Math.round(draftBase + ageAdj + firstTeam.delta + futures.delta + tools.delta + scoutBonus);

    // 24~25세 하위 라운드·저노출 선수가 나이만으로 일괄 과대평가되지 않도록 상한·하한 정교화
    const round = p.draft_round ?? (p.draft_method?.includes('1차') ? 1 : 10);
    const isHighDraft = round <= 3 || Boolean(p.draft_method?.includes('1차'));
    const total1stG = (p.career_by_year ?? []).reduce((s, r) => s + (r.G ?? 0), 0);
    if (!isHighDraft && age >= 24 && firstTeam.delta <= 1 && futures.delta <= 1) {
      computed = Math.min(computed, 67);
    } else if (!isHighDraft && age === 23 && firstTeam.delta <= 1 && futures.delta <= 1) {
      computed = Math.min(computed, 70);
    }

    // 24~25세 선수 중 1군 주전급(OVR 70+)이 아닌 경우 특급(80+) 남발 차단 (현실적 72~77 상한)
    if (age >= 24 && ovr < 70) {
      computed = Math.min(computed, Math.min(77, Math.max(71, ovr + 13)));
    }
    // 23세인데 1군 출전 0G인 경우 특급(80+) 대신 상위권(최대 78) 평가
    if (age === 23 && total1stG === 0) {
      computed = Math.min(computed, 78);
    }
    // 2라운드 이하 선수는 1군 핵심 돌파(OVR 68+)가 없으면 상위권 상한(79) 유지 -> 특급(80~87) 희소성 보존
    if (round >= 2 && !p.draft_method?.includes('1차') && ovr < 68) {
      computed = Math.min(computed, 79);
    }
    // 1군 핵심 돌파 없는 일반 선수는 84 이하 유지 (특급 최상위 85~87 · 초특급 88~95 희소성 보존)
    computed = Math.min(84, computed);

    // 19~22세 실전 유망주가 OVR 44/POT 47 처럼 극단적으로 억눌린 경우 최소 현실 성장폭 보장 (일반 하한 63)
    if (age <= 22) {
      const floorByRound =
        round === 1 ? 78 : round === 2 ? 75 : round === 3 ? 72 : round <= 5 ? 68 : round <= 8 ? 65 : 63;
      computed = Math.max(computed, Math.max(63, floorByRound - Math.max(0, age - 20)));
    } else if (age === 23) {
      const floor23 = round === 1 ? 74 : round === 2 ? 71 : round <= 4 ? 67 : 63;
      computed = Math.max(computed, floor23);
    } else {
      // 24~25세는 무조건 상향하지 않고, 합리적 최소선(OVR+4~6 또는 1R/2R 반등 여지)만 보정
      const minGap2425 = isHighDraft ? 7 : firstTeam.delta >= 3 || futures.delta >= 2 ? 6 : 4;
      const floor2425 = Math.max(ovr + minGap2425, isHighDraft ? 68 : 61);
      computed = Math.max(computed, Math.min(75, floor2425));
    }

    // 이미 현재 OVR이 높은 젊은 주전급 선수는 충분한 최소 여지 확보
    if (age <= 23 && ovr >= 60) {
      computed = Math.max(computed, Math.min(86, ovr + (age <= 21 ? 9 : 6)));
    }

    // 기존에 이미 더 높고 타당한 잠재력이 부여된 선수는 깎지 않음
    newPot = Math.max(oldPot, computed);
    // OVR <= POT 불변식 보장
    newPot = Math.max(ovr, Math.min(95, newPot));

    const parts = [
      `만 ${age}세`,
      p.draft_method ? `${p.draft_year ?? ''} ${p.draft_method}` : round <= 11 ? `${p.draft_year ?? ''} ${round}R` : '육성/2군',
      firstTeam.note,
      futures.note,
      tools.note,
    ].filter(Boolean);
    rationale = parts.join(' · ');
  }

  if (newPot !== oldPot) {
    const tier = classifyProspectTier(newPot);
    p.game_ratings.potential = newPot;
    if (p.evaluation_v18) {
      p.evaluation_v18.pot = newPot;
      p.evaluation_v18.potential_range = [ovr, newPot];
    }
    p.rebalance_v19 = {
      prev_ovr: p.rebalance_v19?.prev_ovr ?? ovr,
      prev_pot: oldPot,
      new_ovr: ovr,
      new_pot: newPot,
      ovr_delta: 0,
      pot_delta: newPot - oldPot,
      tier,
      reason: `v24 유망주 잠재력 재평가 (${oldPot} → ${newPot}) · ${rationale}`,
    };

    changes.push({
      id: p.id,
      name: p.name,
      team: p.team,
      position: p.position,
      age2027: age,
      draft: `${p.draft_year ?? '?'} ${p.draft_method ?? (p.draft_round ? `${p.draft_round}R` : '미상')}${p.draft_pick ? ` #${p.draft_pick}` : ''}`,
      ovr,
      oldPot,
      newPot,
      potDelta: newPot - oldPot,
      newHeadroom: newPot - ovr,
      tier,
      rationale,
    });
  }
}

const afterDist = snapshotDistribution(data.players);

data.prospectPotentialVerifiedAt = new Date().toISOString();
data.databaseVersion = 'v24_recalibrated_prospect_potentials';

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');

changes.sort((a, b) => b.potDelta - a.potDelta || b.newPot - a.newPot);

const auditLog = {
  patchedAt: data.prospectPotentialVerifiedAt,
  databaseVersion: data.databaseVersion,
  backupFile: 'src/data/v23PlayerDataBackupBeforePotentialPatch.json',
  summary: {
    totalRecalibratedPlayers: changes.length,
    before: beforeDist,
    after: afterDist,
  },
  changes,
};

fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(auditLog, null, 2) + '\n', 'utf8');

console.log('=== BEFORE vs AFTER (Existing Young Players age <= 25) ===');
console.log('BEFORE:', beforeDist);
console.log('AFTER :', afterDist);
console.log('Total recalibrated:', changes.length);
console.log('\n=== TOP 25 BIGGEST RECALIBRATIONS ===');
changes.slice(0, 25).forEach((c) => {
  console.log(`${c.team} ${c.name}(${c.position}, ${c.age2027}세, ${c.draft}) : OVR ${c.ovr} | POT ${c.oldPot} -> ${c.newPot} (+${c.potDelta}, gap=${c.newHeadroom}) [${c.tier}]`);
});
console.log('\n=== SAMPLE OLDER 24-25yo LATE-ROUND PLAYERS (NO BLANKET INFLATION CHECK) ===');
changes.filter((c) => c.age2027 >= 24 && c.newPot <= 68).slice(0, 12).forEach((c) => {
  console.log(`${c.team} ${c.name}(${c.position}, ${c.age2027}세, ${c.draft}) : OVR ${c.ovr} | POT ${c.oldPot} -> ${c.newPot} (+${c.potDelta}) [${c.tier}]`);
});
