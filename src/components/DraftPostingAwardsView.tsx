import React, { useState } from 'react';
import { Plane, Sparkles, Trophy, Wallet } from 'lucide-react';
import {
  calculateMlbPostingFeeUsd,
  claimPostingFeeToCash,
  evaluateMlbPostingReadiness,
  getPlayerPostingQualification,
  resolveMlbPosting,
  submitMlbPosting,
} from '../engine/transactions';
import { CareerSave } from '../types/kbo';
import { DraftBoardPanel } from './DraftBoardPanel';
import { getMlbClubMeta, MlbTeamLogo } from './MlbTeamLogo';

interface DraftPostingAwardsViewProps {
  career: CareerSave;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onSelectPlayer?: (playerId: string) => void;
  onOpenAwardsCeremony?: () => void;
}

export const DraftPostingAwardsView: React.FC<DraftPostingAwardsViewProps> = ({
  career,
  onUpdateCareer,
  onSelectPlayer,
  onOpenAwardsCeremony,
}) => {
  const [subTab, setSubTab] = useState<'draft' | 'posting'>('draft');
  const [notice, setNotice] = useState<string | null>(null);
  const [calcGuaranteeM, setCalcGuaranteeM] = useState<number>(60);

  const postingCandidates = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === career.playerTeamId &&
        p.category === '국내' &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적'
    )
    .sort(
      (a, b) =>
        (b.postingRequested && !b.postedThisYear ? 1 : 0) -
          (a.postingRequested && !a.postedThisYear ? 1 : 0) ||
        b.serviceYears - a.serviceYears ||
        b.ability - a.ability
    );

  const postingRequestedPlayers = postingCandidates.filter(
    (p) => p.postingRequested && !p.postedThisYear
  );

  const handleSubmitPosting = (pid: string) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = submitMlbPosting(career, pid);
      onUpdateCareer(nextCareer, backupSnapshot);
      const latestRec = nextCareer.postingRecords[0];
      if (latestRec?.status === '협상결렬') {
        setNotice(`${career.players[pid].name} 포스팅 거절/결렬: ${latestRec.rejectionReason ?? 'MLB 스카우트 기준 미달'}`);
      } else {
        setNotice(`${career.players[pid].name} 선수의 MLB 포스팅 공시가 등록되었습니다.`);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '포스팅 신청 불가');
    }
  };

  const handleResolvePosting = (postingId: string, offerIdx: number | null) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = resolveMlbPosting(career, postingId, offerIdx);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice(offerIdx === null ? 'MLB 포스팅 협상 결렬 처리 완료' : 'MLB 포스팅 이적 계약 승인 완료 — 아래 정산 버튼으로 구단 자금에 편입할 수 있습니다.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '포스팅 처리 오류');
    }
  };

  const handleClaimPostingFee = (postingId: string) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = claimPostingFeeToCash(career, postingId);
      onUpdateCareer(nextCareer, backupSnapshot);
      const updatedRec = nextCareer.postingRecords.find((r) => r.id === postingId);
      setNotice(
        `${updatedRec?.playerName ?? ''} 포스팅 이적료 +${(updatedRec?.convertedCashBillion ?? 0).toFixed(2)}억 원이 구단 운영 자금에 편입되었습니다.`
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '이적료 정산 오류');
    }
  };

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold">신인 드래프트 · MLB 포스팅</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {career.season} 신인 지명 명단(1~11라운드) 및 7시즌 이상 MLB 포스팅 이적료 규약을 관리합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
            {[
              { id: 'draft', label: '신인 드래프트', icon: Sparkles },
              { id: 'posting', label: 'MLB 포스팅', icon: Plane },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id as 'draft' | 'posting')}
                  className={`px-3 py-1.5 font-semibold flex items-center gap-1.5 ${
                    subTab === t.id
                      ? 'team-accent-bg'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          {onOpenAwardsCeremony && (
            <button
              type="button"
              onClick={onOpenAwardsCeremony}
              className="px-3 py-1.5 rounded border border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500 hover:text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>KBO 공식 시상식</span>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-800 dark:text-amber-300">
          {notice}
        </div>
      )}

      {/* TAB 1: Special Draft */}
      {subTab === 'draft' && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4">
          <DraftBoardPanel career={career} onUpdateCareer={onUpdateCareer} />
        </div>
      )}

      {/* TAB 2: MLB Posting */}
      {subTab === 'posting' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            {postingRequestedPlayers.length > 0 && (
              <div className="p-3.5 rounded border border-orange-500/50 bg-orange-500/10 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold text-orange-800 dark:text-orange-300 flex items-center gap-1.5">
                    <Plane className="w-4 h-4" />
                    <span>선수 직접 MLB 포스팅 신청 요구 ({postingRequestedPlayers.length}명)</span>
                  </div>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">
                    시즌 종료 후 7시즌 자격 스타 선수가 빅리그 진출 허가를 요청했습니다
                  </span>
                </div>
                <div className="space-y-2">
                  {postingRequestedPlayers.map((rp) => {
                    const readiness = evaluateMlbPostingReadiness(rp);
                    return (
                      <div
                        key={rp.id}
                        className="p-2.5 rounded border border-orange-500/30 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {rp.name} ({rp.position} · {rp.age}세 · {rp.serviceYears}년차 · OVR {rp.ability})
                          </div>
                          <div className="text-[11px] text-slate-500">
                            MLB 평가: <strong className="text-emerald-600 dark:text-emerald-400">{readiness.tier}</strong> ({readiness.acceptanceChancePct}%) · 예상 규모 {readiness.estimatedGuaranteeRange}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!readiness.eligible}
                          onClick={() => handleSubmitPosting(rp.id)}
                          className="px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs disabled:opacity-40"
                        >
                          포스팅 즉시 공시 수락
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="text-sm font-bold">MLB 진출 · 포스팅 자격 및 빅리그 스카우트 평가</div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                <strong>포스팅(KBO 규약 1군 등록일수 7시즌 · 1,015일 + 구단 승인)</strong>은 이적료 수취 방식이며, <strong>해외 FA(FA 취득 8시즌+)</strong>는 구단 승인 없이 FA 시장에서 MLB와 KBO 제안을 직접 비교해 선택합니다. MLB 구단은 능력치·나이·최근 성적을 엄격히 평가해 최상위권 위주로 제안합니다.
              </p>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-500">
                  <tr>
                    <th className="py-2 px-3">선수 (나이)</th>
                    <th className="py-2 px-2">포지션</th>
                    <th className="py-2 px-2 text-right">능력</th>
                    <th className="py-2 px-2 text-right">1군 등록 (7시즌 기준)</th>
                    <th className="py-2 px-2">MLB · 연령 · 성적 평가</th>
                    <th className="py-2 px-2">예상 규모</th>
                    <th className="py-2 px-3 text-right">포스팅</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {postingCandidates.map((p) => {
                    const readiness = evaluateMlbPostingReadiness(p);
                    const qual = getPlayerPostingQualification(p);
                    return (
                      <tr key={p.id} title={readiness.reason}>
                        <td className="py-1.5 px-3 font-semibold">
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(p.id)}
                            className="hover:underline text-left font-semibold"
                          >
                            {p.name}
                          </button>{' '}
                          <span className="text-[11px] font-mono-stats font-normal text-slate-400">
                            ({p.age}세)
                          </span>
                          {p.postingRequested && !p.postedThisYear && (
                            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-600 text-white">
                              포스팅 요청
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2">{p.position}</td>
                        <td className="py-1.5 px-2 text-right font-mono-stats">{p.ability}</td>
                        <td className="py-1.5 px-2 text-right font-mono-stats">
                          <div className={qual.meetsSevenSeasonRule ? 'font-bold text-emerald-700 dark:text-emerald-400' : ''}>
                            {qual.qualifiedSeasons}시즌
                          </div>
                          <div className="text-[10px] text-slate-400">{qual.registrationDays}일</div>
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={`font-bold ${
                              readiness.tier === '유력'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : readiness.tier === '적합'
                                ? 'text-orange-600 dark:text-orange-400'
                                : readiness.tier === '도전적'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {readiness.tier}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-1">
                            · 연령 {readiness.ageSuitability}
                          </span>
                          {readiness.eligible && (
                            <span className="text-[11px] text-slate-400 ml-1 font-mono-stats">
                              ({readiness.acceptanceChancePct}%)
                            </span>
                          )}
                          {readiness.recentStatNote && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                              {readiness.recentStatNote}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-[11px] font-mono-stats text-slate-500">
                          {readiness.estimatedGuaranteeRange}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <button
                            type="button"
                            disabled={!readiness.eligible}
                            onClick={() => handleSubmitPosting(p.id)}
                            className={`px-2.5 py-1 rounded font-semibold disabled:opacity-30 ${
                              readiness.tier === '부적합' && readiness.eligible
                                ? 'border border-red-400 text-red-600 dark:text-red-400'
                                : 'bg-orange-600 text-white'
                            }`}
                          >
                            {!readiness.eligible
                              ? !qual.meetsSevenSeasonRule
                                ? '7시즌 미만'
                                : '재신청 제한'
                              : readiness.tier === '부적합'
                              ? '도전 공시'
                              : '포스팅 공시'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {career.postingRecords.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold">진행 및 완료된 포스팅 내역</div>
                {career.postingRecords.map((rec) => {
                  const estimatedKrwBillion = Number(((rec.feePaidUsd * 1350) / 100_000_000).toFixed(2));
                  return (
                    <div
                      key={rec.id}
                      className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span
                          className={
                            rec.status === '협상결렬'
                              ? 'text-red-600 dark:text-red-400'
                              : rec.status === '계약성사'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : ''
                          }
                        >
                          {rec.playerName} · 상태: {rec.status}
                        </span>
                        <span className="font-mono-stats text-slate-500">
                          마감 {rec.deadlineDate}
                        </span>
                      </div>
                      {rec.status === '협상결렬' && rec.rejectionReason && (
                        <div className="p-2 rounded bg-red-500/10 text-red-600 dark:text-red-400 text-[11px]">
                          결렬 사유: {rec.rejectionReason}
                        </div>
                      )}
                      {rec.status === '협상중' && (
                        <div className="space-y-1.5">
                          {rec.offers.map((off, idx) => {
                            const mlbMeta = getMlbClubMeta(off.mlbTeam);
                            return (
                              <div
                                key={idx}
                                className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <MlbTeamLogo teamName={off.mlbTeam} size="sm" />
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                      {mlbMeta.koreanName}{' '}
                                      <span className="text-[11px] font-normal text-slate-500">
                                        ({mlbMeta.englishName})
                                      </span>
                                    </div>
                                    <div className="font-mono-stats text-[11px] text-slate-600 dark:text-slate-300">
                                      {off.years}년 ${off.guaranteedUsdMillions}M · 이적료 $
                                      {off.postingFeeUsd.toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleResolvePosting(rec.id, idx)}
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shrink-0"
                                >
                                  계약 수락
                                </button>
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => handleResolvePosting(rec.id, null)}
                            className="px-3 py-1 rounded border border-red-400 text-red-600 font-semibold"
                          >
                            협상 결렬/잔류 처리
                          </button>
                        </div>
                      )}
                      {rec.acceptedOffer && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-2 font-mono-stats text-emerald-700 dark:text-emerald-400">
                            <MlbTeamLogo teamName={rec.acceptedOffer.mlbTeam} size="sm" />
                            <span>
                              {getMlbClubMeta(rec.acceptedOffer.mlbTeam).koreanName} 계약 성사 ({rec.acceptedOffer.years}년 $
                              {rec.acceptedOffer.guaranteedUsdMillions}M) · 이적료 $
                              {rec.feePaidUsd.toLocaleString()}
                            </span>
                          </div>
                          {rec.fundsClaimedToCash ? (
                            <span className="font-mono-stats font-bold text-slate-500">
                              구단 자금 편입 완료 (+{(rec.convertedCashBillion ?? estimatedKrwBillion).toFixed(2)}억 원)
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleClaimPostingFee(rec.id)}
                              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 font-mono-stats"
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              <span>구단 자금 편입 (+{estimatedKrwBillion.toFixed(2)}억)</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3 text-xs">
            <div className="text-sm font-bold">한·미 포스팅 이적료 계산기</div>
            <p className="text-slate-500">
              첫 $25M 20% + 초과~$50M 구간 17.5% + $50M 초과분 15% 누진 합산
            </p>
            <div>
              <label className="block mb-1 font-semibold">MLB 보장 총액 (백만 달러 $M)</label>
              <input
                type="number"
                min={1}
                max={400}
                value={calcGuaranteeM}
                onChange={(e) => setCalcGuaranteeM(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats text-sm font-bold"
              />
            </div>
            <div className="p-3 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono-stats">
              <div className="text-slate-500 font-sans">원 소속구단 수취 이적료</div>
              <div className="text-lg font-extrabold text-orange-600 dark:text-orange-400 mt-0.5">
                ${calculateMlbPostingFeeUsd(calcGuaranteeM).toLocaleString()}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                주요 MLB 포스팅 참가 구단 (30개 구단 로고 지원)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Los Angeles Dodgers',
                  'San Francisco Giants',
                  'San Diego Padres',
                  'New York Yankees',
                  'New York Mets',
                  'Chicago Cubs',
                  'Boston Red Sox',
                  'Seattle Mariners',
                ].map((club) => (
                  <div
                    key={club}
                    className="flex items-center gap-1 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  >
                    <MlbTeamLogo teamName={club} size="xs" />
                    <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {getMlbClubMeta(club).abbr}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
