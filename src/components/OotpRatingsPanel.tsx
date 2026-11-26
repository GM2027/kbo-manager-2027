import React, { useEffect, useState } from 'react';
import {
  Activity,
  Award,
  Flame,
  Footprints,
  HeartHandshake,
  Shield,
  TrendingUp,
} from 'lucide-react';
import {
  computeDerivedContactPair,
  ensurePlayerOotpRatingsInPlace,
  getOotpDataSourceSummary,
} from '../engine/ootpRatingsEngine';
import {
  ALL_FIELD_POSITIONS,
  computeEffectiveFieldingAtPosition,
} from '../engine/positionEngine';
import { BattingProfile, CareerSave, GrowthLog, PitchRepertoire, Player } from '../types/kbo';

type OotpDetailTab = 'batting' | 'pitching' | 'defense' | 'baserunning' | 'personality' | 'growth';

interface OotpRatingsPanelProps {
  career: CareerSave;
  player: Player;
  batProf: BattingProfile | null;
  pitchRep: PitchRepertoire | null;
  playerGrowthLogs: GrowthLog[];
}

function getRatingBarColor(val: number): string {
  if (val >= 80) return 'bg-emerald-500';
  if (val >= 65) return 'bg-sky-500';
  if (val >= 50) return 'bg-amber-500';
  return 'bg-slate-400 dark:bg-slate-500';
}

function getRatingTextColor(val: number): string {
  if (val >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (val >= 65) return 'text-sky-600 dark:text-sky-400';
  if (val >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-slate-500 dark:text-slate-400';
}

/**
 * 현재 능력치(진한 막대)와 잠재력(연한 막대)을 하나의 막대 그래프에 함께 표시
 */
const DualRatingBar: React.FC<{
  label: string;
  cur: number;
  pot: number;
  subLabel?: string;
}> = ({ label, cur, pot, subLabel }) => {
  const safeCur = Math.max(1, Math.min(100, Math.round(cur)));
  const safePot = Math.max(safeCur, Math.min(100, Math.round(pot)));
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{label}</span>
          {subLabel && (
            <span className="text-[9px] text-slate-400 dark:text-slate-500 shrink-0">{subLabel}</span>
          )}
        </div>
        <div className="font-mono-stats shrink-0 flex items-center gap-1">
          <span className={`font-extrabold ${getRatingTextColor(safeCur)}`}>{safeCur}</span>
          <span className="text-slate-400 text-[10px]">/</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400 text-[10px]">{safePot}</span>
        </div>
      </div>
      <div className="relative h-2 w-full rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden">
        {/* Potential bar (translucent background layer) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-indigo-400/35 dark:bg-indigo-400/30 transition-all"
          style={{ width: `${safePot}%` }}
        />
        {/* Current bar (solid foreground layer) */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${getRatingBarColor(safeCur)} transition-all`}
          style={{ width: `${safeCur}%` }}
        />
      </div>
    </div>
  );
};

const SingleRatingBar: React.FC<{
  label: string;
  value: number;
  unit?: string;
  max?: number;
}> = ({ label, value, unit = '', max = 100 }) => {
  const pct = Math.max(2, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{label}</span>
        <span className={`font-mono-stats font-extrabold ${getRatingTextColor(pct)}`}>
          {Math.round(value)}
          {unit}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${getRatingBarColor(pct)} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export const OotpRatingsPanel: React.FC<OotpRatingsPanelProps> = ({
  player,
  batProf,
  pitchRep,
  playerGrowthLogs,
}) => {
  const defaultTab: OotpDetailTab = player.role === '투수' ? 'pitching' : 'batting';
  const [activeTab, setActiveTab] = useState<OotpDetailTab>(defaultTab);

  useEffect(() => {
    setActiveTab(player.role === '투수' ? 'pitching' : 'batting');
  }, [player.id, player.role]);

  const ootp = ensurePlayerOotpRatingsInPlace(player);
  const srcInfo = getOotpDataSourceSummary(player);
  const bat = ootp.batting;
  const pit = ootp.pitching;
  const def = ootp.defense;
  const run = ootp.baserunning;
  const pers = ootp.personality;
  const growthHist = ootp.growthHistory ?? [];

  const tabs: { id: OotpDetailTab; label: string; icon: React.ReactNode }[] = [
    { id: 'batting', label: '타격', icon: <Activity className="w-3 h-3" /> },
    { id: 'pitching', label: '투구', icon: <Flame className="w-3 h-3" /> },
    { id: 'defense', label: '수비', icon: <Shield className="w-3 h-3" /> },
    { id: 'baserunning', label: '주루', icon: <Footprints className="w-3 h-3" /> },
    { id: 'personality', label: '성향', icon: <HeartHandshake className="w-3 h-3" /> },
    { id: 'growth', label: '성장 기록', icon: <TrendingUp className="w-3 h-3" /> },
  ];

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 overflow-hidden">
      {/* Header + 6 Compact Tabs */}
      <div className="px-3 pt-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span className="font-extrabold text-xs text-slate-900 dark:text-white">
              세부능력치 분석 (1~100 · 현재 / 잠재)
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span
              className={`px-1.5 py-0.5 rounded border font-bold ${
                srcInfo.isVerified
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              }`}
            >
              {srcInfo.label}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-slate-500">
              <span className="inline-block w-2.5 h-1.5 rounded-sm bg-sky-500" />
              현재
              <span className="inline-block w-2.5 h-1.5 rounded-sm bg-indigo-400/40 ml-1" />
              잠재
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-2 py-1.5 rounded text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors border ${
                  active
                    ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-3.5 text-xs">
        {/* 1) 타격 탭 */}
        {activeTab === 'batting' && (
          bat ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
                {(() => {
                  const contactPair = computeDerivedContactPair(bat);
                  return (
                    <DualRatingBar
                      label="컨택 (Contact)"
                      subLabel="BABIP·삼진회피 파생"
                      cur={contactPair.cur}
                      pot={contactPair.pot}
                    />
                  );
                })()}
                <DualRatingBar label="BABIP (인플레이 안타)" cur={bat.babip.cur} pot={bat.babip.pot} />
                <DualRatingBar label="삼진 회피 (Avoid K)" cur={bat.avoidK.cur} pot={bat.avoidK.pot} />
                <DualRatingBar label="갭 파워 (2·3루타)" cur={bat.gapPower.cur} pot={bat.gapPower.pot} />
                <DualRatingBar label="홈런 파워 (HR Power)" cur={bat.hrPower.cur} pot={bat.hrPower.pot} />
                <DualRatingBar label="선구안 (Eye)" cur={bat.eye.cur} pot={bat.eye.pot} />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
                <DualRatingBar label="좌완 상대 능력 (vs LHP)" cur={bat.vsLHP.cur} pot={bat.vsLHP.pot} />
                <DualRatingBar label="우완 상대 능력 (vs RHP)" cur={bat.vsRHP.cur} pot={bat.vsRHP.pot} />
                <SingleRatingBar label="희생번트" value={bat.sacBunt} />
                <SingleRatingBar label="기습번트" value={bat.buntForHit} />
              </div>

              {batProf && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-stats text-slate-600 dark:text-slate-400">
                  <span>
                    {batProf.bats} · {batProf.sprayTendency} (당 {batProf.pullPct}% / 중 {batProf.centerPct}% / 밀 {batProf.oppoPct}%)
                  </span>
                  {batProf.avgExitVelocityKmh !== undefined && (
                    <span className="text-orange-700 dark:text-orange-300 font-semibold">
                      타구속도 {batProf.avgExitVelocityKmh}km/h (최고 {batProf.maxExitVelocityKmh}) · 발사각 {batProf.launchAngleDeg}° · 배럴 {batProf.barrelPct}%
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-5 text-center text-slate-500 text-[11px]">
              투수 포지션 선수입니다. KBO 지명타자 제도에 따라 정규 타격 능력치는 관리되지 않습니다.
            </div>
          )
        )}

        {/* 2) 투구 탭 */}
        {activeTab === 'pitching' && (
          pit ? (
            <div className="space-y-3">
              {/* 구속 · 땅볼유도율 · 선발/불펜 적합도 요약 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-stats">
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-500">평균 / 최고 구속</div>
                  <div className="text-xs font-extrabold text-orange-600 dark:text-orange-400 mt-0.5">
                    {pit.avgVelocityKmh} / {pit.maxVelocityKmh} km/h
                  </div>
                </div>
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-500">땅볼 유도율 (GB%)</div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {pit.groundballRate}%{' '}
                    <span className="text-[10px] font-sans font-normal text-slate-500">
                      ({pit.groundballRate >= 55 ? '땅볼형' : pit.groundballRate <= 42 ? '뜬공형' : '균형형'})
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-500">선발 적합도</div>
                  <div className={`text-xs font-extrabold mt-0.5 ${getRatingTextColor(pit.starterFit)}`}>
                    {pit.starterFit} / 100
                  </div>
                </div>
                <div className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-500">불펜 적합도</div>
                  <div className={`text-xs font-extrabold mt-0.5 ${getRatingTextColor(pit.relieverFit)}`}>
                    {pit.relieverFit} / 100
                  </div>
                </div>
              </div>

              {/* 핵심 투구 지표 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
                <DualRatingBar label="구위 (Stuff)" cur={pit.stuff.cur} pot={pit.stuff.pot} />
                <DualRatingBar label="무브먼트 (Movement)" cur={pit.movement.cur} pot={pit.movement.pot} />
                <DualRatingBar label="제구력 (Control)" cur={pit.control.cur} pot={pit.control.pot} />
                <DualRatingBar label="피홈런 억제 (HR Prev)" cur={pit.hrPrevent.cur} pot={pit.hrPrevent.pot} />
                <DualRatingBar label="피안타 억제 (Hit Prev)" cur={pit.hitPrevent.cur} pot={pit.hitPrevent.pot} />
                <SingleRatingBar label="체력 (Stamina)" value={pit.stamina} />
                <DualRatingBar label="좌타자 상대 (vs LHB)" cur={pit.vsLHB.cur} pot={pit.vsLHB.pot} />
                <DualRatingBar label="우타자 상대 (vs RHB)" cur={pit.vsRHB.cur} pot={pit.vsRHB.pot} />
                <SingleRatingBar label="주자 견제 (Hold)" value={pit.holdRunner} />
                <SingleRatingBar label="땅볼 유도율 (GB%)" value={pit.groundballRate} unit="%" />
              </div>

              {/* 구종별 현재/잠재 능력치 */}
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    구사 구종 레퍼토리 ({pit.pitches.length}구종 · {pitchRep?.throws ?? (player.throws === 'L' ? '좌투' : '우투')})
                  </span>
                  <span className="text-[10px] text-slate-500">
                    추천 보직:{' '}
                    <strong className="text-indigo-600 dark:text-indigo-400">
                      {pit.starterFit >= pit.relieverFit + 4 && pit.pitches.length >= 3 && pit.stamina >= 58
                        ? '선발 투수'
                        : pit.starterFit >= 65 && pit.pitches.length >= 3
                        ? '선발 / 멀티 가능'
                        : '불펜 / 필승조'}
                    </strong>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
                  {pit.pitches.map((pt, idx) => (
                    <div key={`${pt.name}-${idx}`} className="space-y-0.5">
                      <div className="flex items-center justify-between gap-1.5 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 dark:text-slate-100">{pt.name}</span>
                          <span className="font-mono-stats text-[10px] text-slate-500">({pt.usagePct}%)</span>
                          <span
                            className={`px-1 py-px rounded text-[9px] font-bold ${
                              pt.source === 'verified'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {pt.source === 'verified' ? '실측' : '추정'}
                          </span>
                        </div>
                        <span className="font-mono-stats text-[11px]">
                          <strong className={getRatingTextColor(pt.cur)}>{pt.cur}</strong>
                          <span className="text-slate-400 mx-0.5">/</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">{pt.pot}</span>
                        </span>
                      </div>
                      <div className="relative h-2 w-full rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-indigo-400/35"
                          style={{ width: `${Math.max(pt.cur, pt.pot)}%` }}
                        />
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full ${getRatingBarColor(pt.cur)}`}
                          style={{ width: `${pt.cur}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-5 text-center text-slate-500 text-[11px]">
              야수 포지션 선수입니다. 투구 레퍼토리 및 투수 세부 능력치는 투수에게 적용됩니다.
            </div>
          )
        )}

        {/* 3) 수비 탭 */}
        {activeTab === 'defense' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 내야 */}
              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1.5">
                <div className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">내야 수비</div>
                <SingleRatingBar label="내야 범위" value={def.infieldRange} />
                <SingleRatingBar label="실책 방지" value={def.infieldError} />
                <SingleRatingBar label="내야 송구" value={def.infieldArm} />
                <SingleRatingBar label="병살 처리" value={def.turnDP} />
              </div>
              {/* 외야 */}
              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1.5">
                <div className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">외야 수비</div>
                <SingleRatingBar label="외야 범위" value={def.outfieldRange} />
                <SingleRatingBar label="실책 방지" value={def.outfieldError} />
                <SingleRatingBar label="외야 송구" value={def.outfieldArm} />
              </div>
              {/* 포수 */}
              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1.5">
                <div className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">포수 수비</div>
                <SingleRatingBar label="블로킹" value={def.catcherBlocking} />
                <SingleRatingBar label="프레이밍" value={def.catcherFraming} />
                <SingleRatingBar label="포수 송구" value={def.catcherArm} />
              </div>
            </div>

            {player.role === '타자' && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    포지션별 수비 숙련도 · 주 {player.position}
                    {(player.secondaryPositions?.length ?? 0) > 0
                      ? ` · 보조 ${player.secondaryPositions!.join('·')}`
                      : ''}
                  </span>
                  {player.positionTrainingTarget && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]">
                      훈련중: {player.positionTrainingTarget}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 font-mono-stats">
                  {ALL_FIELD_POSITIONS.map((pos) => {
                    const eff = computeEffectiveFieldingAtPosition(player, pos);
                    const isPrim = player.position === pos;
                    const isSec = player.secondaryPositions?.includes(pos);
                    return (
                      <div
                        key={pos}
                        title={`${pos}: 숙련도 ${eff.proficiency} · 실효수비 ${eff.effectiveFielding} (${eff.tierLabel})`}
                        className={`p-1.5 rounded border text-center ${
                          isPrim
                            ? 'border-orange-500/70 bg-orange-500/10'
                            : isSec
                            ? 'border-emerald-500/50 bg-emerald-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                          {pos}
                          {isPrim ? '★' : ''}
                        </div>
                        <div className={`text-xs font-extrabold ${getRatingTextColor(eff.proficiency)}`}>
                          {eff.proficiency}
                        </div>
                        <div className="text-[9px] text-slate-400">실효 {eff.effectiveFielding}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4) 주루 탭 */}
        {activeTab === 'baserunning' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
              <SingleRatingBar label="주력 (Speed)" value={run.speed} />
              <SingleRatingBar label="도루 시도 성향 (Steal Tendency)" value={run.stealTendency} />
              <SingleRatingBar label="도루 능력 · 성공률 (Steal Ability)" value={run.stealAbility} />
              <SingleRatingBar label="주루 판단력 (Baserunning IQ)" value={run.baserunning} />
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-500 flex flex-wrap justify-between gap-2">
              <span>
                주루 성향:{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {run.stealTendency >= 72
                    ? '적극 도루형'
                    : run.stealTendency >= 52
                    ? '기회 도루형'
                    : '신중 주루형'}
                </strong>
                {' · '}추가 진루력:{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {run.baserunning >= 75 ? '최상위' : run.baserunning >= 60 ? '양호' : '보통'}
                </strong>
              </span>
              {batProf?.sprintSpeedMs !== undefined && (
                <span className="font-mono-stats font-semibold text-orange-700 dark:text-orange-300">
                  스프린트 속도 {batProf.sprintSpeedMs} m/s
                </span>
              )}
            </div>
          </div>
        )}

        {/* 5) 성향 탭 */}
        {activeTab === 'personality' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
              <SingleRatingBar label="프로의식 (Professionalism)" value={pers.professionalism} />
              <SingleRatingBar label="훈련 태도 (Work Ethic)" value={pers.workEthic} />
              <SingleRatingBar label="충성심 (Loyalty)" value={pers.loyalty} />
              <SingleRatingBar label="금전 선호도 (Greed)" value={pers.greed} />
              <SingleRatingBar label="리더십 (Leadership)" value={pers.leadership} />
              <SingleRatingBar label="적응력 (Adaptability)" value={pers.adaptability} />
              <SingleRatingBar label="내구성 (Durability)" value={pers.durability} />
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400">성장 유형: </span>
                <strong className="text-slate-800 dark:text-slate-100">
                  {player.growthCurveProfile ?? '표준'}
                </strong>
              </div>
              <div className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400">선수 특성: </span>
                <strong className="text-indigo-700 dark:text-indigo-300">
                  {player.hiddenTrait ?? '꾸준함'}
                </strong>
              </div>
              <div className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400">훈련 집중: </span>
                <strong className="text-slate-800 dark:text-slate-100">
                  {player.trainingFocus ?? '균형(자동)'}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* 6) 성장 기록 탭 */}
        {activeTab === 'growth' && (
          <div className="space-y-3">
            {growthHist.length > 0 ? (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {growthHist.map((entry, idx) => (
                  <div
                    key={`${entry.date}-${idx}`}
                    className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono-stats text-slate-500">
                        {entry.date} (만 {entry.age}세)
                      </span>
                      <span className="font-mono-stats font-bold">
                        OVR {entry.prevOvr}→
                        <span
                          className={
                            entry.newOvr >= entry.prevOvr
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {entry.newOvr}
                        </span>
                        {' · '}POT {entry.prevPot}→{entry.newPot}
                      </span>
                    </div>
                    {entry.changedFields.length > 0 && (
                      <div className="flex flex-wrap gap-1 text-[10px] font-mono-stats">
                        {entry.changedFields.map((f, fi) => (
                          <span
                            key={fi}
                            className={`px-1.5 py-0.5 rounded border ${
                              f.next > f.prev
                                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {f.label} {f.prev}→{f.next}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500">{entry.reason}</div>
                  </div>
                ))}
              </div>
            ) : playerGrowthLogs.length > 0 ? (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                {playerGrowthLogs.map((log) => (
                  <div key={log.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                    <div className="min-w-0">
                      <span className="font-mono-stats text-[10px] text-slate-400 mr-1.5">{log.date}</span>
                      <span className="text-slate-700 dark:text-slate-300">{log.reason}</span>
                    </div>
                    <span
                      className={`font-mono-stats font-bold shrink-0 ${
                        log.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      OVR {log.delta >= 0 ? `+${log.delta}` : log.delta} ({log.nextAbility})
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-5 text-center text-slate-500 text-[11px]">
                아직 기록된 시즌 중 세부 능력치 성장/변화 이력이 없습니다. 10경기 평가 주기마다 개별 세부 능력치 변화가 기록됩니다.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
