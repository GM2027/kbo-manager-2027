import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Award,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  MessageSquareWarning,
  Newspaper,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import {
  applyCoachSwapRecommendation,
  applyToNewTeamAsGm,
  buildInitialOwnerEval,
  computeLiveOwnerEvaluationReport,
  resolveClubEventChoice,
  resolvePlayerComplaint,
} from '../engine/franchiseSystems';
import { computeStandings } from '../engine/stats';
import {
  canHoldPlayerMeeting,
  conductGmPlayerMeeting,
  getDissatisfactionLevel,
  getPlayerDissatisfaction,
  getReSignResistanceAssessment,
  GM_MEETING_ACTIONS,
} from '../engine/dissatisfactionEngine';
import { CareerSave, GmMeetingAction, NewsArticle, TeamId } from '../types/kbo';
import { MlbTeamLogo } from './MlbTeamLogo';
import { TeamLogo } from './TeamLogo';

interface NewsAndEventsViewProps {
  career: CareerSave;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

type SubTab = 'news' | 'events' | 'coach' | 'owner';

export const NewsAndEventsView: React.FC<NewsAndEventsViewProps> = ({
  career,
  onUpdateCareer,
  onNotify,
}) => {
  const unresolvedEvents = (career.clubEvents ?? []).filter((e) => !e.resolved);
  const unresolvedComplaints = (career.complaints ?? []).filter((c) => !c.resolved);
  const activeCoachReports = (career.coachSwapReports ?? []).filter((r) => !r.applied);

  const [subTab, setSubTab] = useState<SubTab>(
    unresolvedEvents.length + unresolvedComplaints.length > 0
      ? 'events'
      : activeCoachReports.length > 0
      ? 'coach'
      : 'news'
  );
  const [newsCategory, setNewsCategory] = useState<'ALL' | NewsArticle['category']>('ALL');

  const currentSeasonNews = useMemo(() => {
    const all = career.newsFeed ?? [];
    if (career.phase === 'OFFSEASON') {
      return all.filter((n) => n.season === career.season || n.season === career.season + 1);
    }
    return all.filter((n) => n.season === career.season);
  }, [career.newsFeed, career.season, career.phase]);

  const newsList = useMemo(() => {
    if (newsCategory === 'ALL') return currentSeasonNews;
    return currentSeasonNews.filter((n) => n.category === newsCategory);
  }, [currentSeasonNews, newsCategory]);

  const standings = useMemo(() => computeStandings(career.gamesLedger), [career.gamesLedger]);
  const myRow = standings.find((r) => r.teamId === career.playerTeamId);
  const ownerEval = career.ownerEval ?? buildInitialOwnerEval(career.playerTeamId, career.season);
  const liveOwnerReport = useMemo(() => computeLiveOwnerEvaluationReport(career), [career]);
  const myStaff = career.coaches[career.playerTeamId] ?? [];

  const handleEventChoice = (eventId: string, choiceId: string) => {
    try {
      const { nextCareer, backupSnapshot } = resolveClubEventChoice(career, eventId, choiceId);
      onUpdateCareer(nextCareer, backupSnapshot);
      onNotify('구단 사건 대응이 즉시 반영되었습니다.', 'success');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '사건 처리 실패', 'error');
    }
  };

  const dissatisfiedPlayers = useMemo(() => {
    return Object.values(career.players)
      .filter(
        (p) =>
          p.teamId === career.playerTeamId &&
          p.rosterTier !== '은퇴' &&
          p.rosterTier !== '해외이적' &&
          p.rosterTier !== 'FA' &&
          getPlayerDissatisfaction(p) >= 40
      )
      .sort((a, b) => getPlayerDissatisfaction(b) - getPlayerDissatisfaction(a));
  }, [career.players, career.playerTeamId]);

  const handleGmMeeting = (playerId: string, action: GmMeetingAction) => {
    try {
      const { nextCareer, backupSnapshot, summary } = conductGmPlayerMeeting(
        career,
        playerId,
        action
      );
      onUpdateCareer(nextCareer, backupSnapshot);
      onNotify(summary, 'success');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '선수 면담 실패', 'error');
    }
  };

  const handleComplaint = (
    complaintId: string,
    action: '출전보장' | '연봉조정' | '포스팅지원' | '역할설명' | '트레이드수용'
  ) => {
    try {
      const { nextCareer, backupSnapshot } = resolvePlayerComplaint(career, complaintId, action);
      onUpdateCareer(nextCareer, backupSnapshot);
      onNotify(`선수 면담(${action}) 처리가 완료되었습니다.`, 'success');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '면담 처리 실패', 'error');
    }
  };

  const handleCoachSwap = (reportId: string) => {
    try {
      const { nextCareer, backupSnapshot } = applyCoachSwapRecommendation(career, reportId);
      onUpdateCareer(nextCareer, backupSnapshot);
      onNotify('코칭스태프 교체 건의가 로스터에 즉시 반영되었습니다.', 'success');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '교체 적용 실패', 'error');
    }
  };

  const handleTransferTeam = (targetTeamId: TeamId) => {
    try {
      const { nextCareer, backupSnapshot } = applyToNewTeamAsGm(career, targetTeamId);
      onUpdateCareer(nextCareer, backupSnapshot);
      onNotify(`${KBO_TEAMS[targetTeamId].name} 신임 단장으로 취임했습니다!`, 'success');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : '구단 이적 실패', 'error');
    }
  };

  const categories: ('ALL' | NewsArticle['category'])[] = [
    'ALL',
    '경기·시리즈',
    '타구단소식',
    'MLB소식',
    '구단사건',
    '이적·계약',
    '수상·이달의선수',
    '국제·병역',
    '규정·웨이버',
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Newspaper className="w-5 h-5 team-accent-text" />
            구단 뉴스 · 사건 · 면담 · 구단주 평가
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {career.season}시즌 리그 속보, 이달의 선수, 선수 불만·이적 요청, 코칭스태프 실시간 컨디션 보고와 구단주 평가를 관리합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'news' as const, label: `${career.season} 리그 뉴스 (${currentSeasonNews.length})` },
            {
              id: 'events' as const,
              label: `구단 사건·면담 (${unresolvedEvents.length + unresolvedComplaints.length})`,
            },
            { id: 'coach' as const, label: `코치 컨디션 보고 (${activeCoachReports.length})` },
            { id: 'owner' as const, label: '구단주 평가·이직' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                subTab === tab.id
                  ? 'team-accent-bg team-accent-border'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: NEWS FEED */}
      {subTab === 'news' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setNewsCategory(cat)}
                className={`px-2.5 py-1 rounded text-xs font-medium border ${
                  newsCategory === cat
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                }`}
              >
                {cat === 'ALL' ? '전체' : cat}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
            {newsList.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                표시할 리그 뉴스가 없습니다. 경기를 진행하면 속보와 월간 수상 소식이 기록됩니다.
              </div>
            ) : (
              newsList.map((n) => (
                <div key={n.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="font-mono-stats">{n.date}</span>
                      <span>·</span>
                      <span className={n.isHighlight ? 'team-accent-text' : ''}>
                        {n.category}
                      </span>
                      {n.teamId && (
                        <>
                          <span>·</span>
                          <span>{KBO_TEAMS[n.teamId].shortName}</span>
                        </>
                      )}
                      {n.verifiedStats && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                          기록 검증완료
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                      {n.headline}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {n.body}
                    </p>
                    {(n.fanSentimentImpact || n.attendanceImpactPct || n.ownerTrustImpact) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] font-mono-stats font-bold">
                        {n.fanSentimentImpact ? (
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              n.fanSentimentImpact > 0
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            팬 여론 {n.fanSentimentImpact > 0 ? `+${n.fanSentimentImpact}` : n.fanSentimentImpact}
                          </span>
                        ) : null}
                        {n.attendanceImpactPct ? (
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              n.attendanceImpactPct > 0
                                ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            관중 수요 {n.attendanceImpactPct > 0 ? `+${n.attendanceImpactPct}%` : `${n.attendanceImpactPct}%`}
                          </span>
                        ) : null}
                        {n.ownerTrustImpact ? (
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              n.ownerTrustImpact > 0
                                ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            구단주 신뢰 {n.ownerTrustImpact > 0 ? `+${n.ownerTrustImpact}` : n.ownerTrustImpact}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {n.teamId && (
                    <div className="shrink-0">
                      <TeamLogo teamId={n.teamId} size="sm" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* MLB 진출 한국인 선수 실시간 현황 */}
          {(career.mlbExports ?? []).length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>⚾ MLB 진출 한국 선수 · 포스팅 현황 ({(career.mlbExports ?? []).length}명)</span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  정규시즌 진행 중 메이저리그 현지 성적과 MLB 진출 소식이 자동 업데이트됩니다
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {(career.mlbExports ?? []).map((ex) => (
                  <div
                    key={ex.id}
                    className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <MlbTeamLogo teamName={ex.mlbTeam} size="sm" />
                        <div className="min-w-0">
                          <div className="font-extrabold text-slate-900 dark:text-white truncate">
                            {ex.playerName}{' '}
                            <span className="text-[11px] font-normal text-slate-500">
                              ({ex.position})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {ex.mlbTeam} · 전 {KBO_TEAMS[ex.fromKboTeamId].shortName} ({ex.seasonExported} 진출)
                          </div>
                        </div>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          ex.status === '올스타급 활약'
                            ? 'bg-orange-600 text-white'
                            : ex.status === '메이저리그 주전'
                            ? 'bg-emerald-600 text-white'
                            : ex.status === '부상자 명단'
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {ex.status}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono-stats font-semibold text-slate-700 dark:text-slate-200">
                      {ex.latestStatLine}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>계약: {ex.contractYears}년 ${ex.guaranteedUsdMillions}M</span>
                      <span className="font-mono-stats">{ex.lastUpdatedDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other 9 Clubs GM Status (Sponsors & Manager Changes) (#10) */}
          {career.otherClubSponsors && Object.keys(career.otherClubSponsors).length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  타 9개 구단 단장 운영 현황 (스폰서십 · 최근 감독 교체 {(career.managerFirings ?? []).length}건)
                </h3>
                <span className="text-[11px] font-mono-stats text-slate-500">
                  현재 뉴스 관중 수요 보정:{' '}
                  {(career.newsAttendanceBoostPct ?? 0) >= 0
                    ? `+${career.newsAttendanceBoostPct ?? 0}%`
                    : `${career.newsAttendanceBoostPct ?? 0}%`}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-[11px]">
                {TEAM_IDS.filter((tid) => tid !== career.playerTeamId).map((tid) => {
                  const mgr = (career.coaches[tid] ?? []).find((c) => c.role === '감독');
                  return (
                    <div
                      key={tid}
                      className="p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-0.5"
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <TeamLogo teamId={tid} size="xs" />
                        <span>{KBO_TEAMS[tid].shortName}</span>
                      </div>
                      <div className="text-slate-500 truncate">
                        스폰서: {career.otherClubSponsors?.[tid] ?? '협상 중'}
                      </div>
                      <div className="text-slate-500 truncate">
                        감독: {mgr?.name ?? '공석'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CLUB EVENTS & PLAYER COMPLAINTS */}
      {subTab === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Club Events */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 team-accent-text" />
                구단 내부 사건 · 시즌 이벤트
              </h3>
              <span className="text-xs font-mono-stats text-slate-500">
                미처리 {unresolvedEvents.length}건
              </span>
            </div>

            {(career.clubEvents ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                발생한 구단 이벤트가 없습니다. 정규시즌 3연전을 진행하면 선수 부진·깜짝 성장·갈등·이달의 선수 이벤트가 발생합니다.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {(career.clubEvents ?? []).slice(0, 12).map((ev) => (
                  <div key={ev.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="font-semibold team-accent-text">
                        {ev.type}
                      </span>
                      <span className="font-mono-stats">{ev.date}</span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{ev.title}</div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{ev.description}</p>
                    {ev.resolved ? (
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-medium pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{ev.resolutionSummary ?? '처리 완료'}</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(ev.choices ?? []).map((ch) => (
                          <button
                            key={ch.id}
                            onClick={() => handleEventChoice(ev.id, ch.id)}
                            className="px-2.5 py-1.5 rounded text-xs font-semibold team-accent-outline text-left"
                          >
                            <div>{ch.label}</div>
                            <div className="text-[10px] opacity-80 font-normal">{ch.effectPreview}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Player Complaints & Transfer/Posting Requests */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <MessageSquareWarning className="w-4 h-4 text-rose-500" />
                선수 불만 · 이적 요청 · 포스팅 면담
              </h3>
              <span className="text-xs font-mono-stats text-slate-500">
                불만 40+ 선수 {dissatisfiedPlayers.length}명 · 요청 {unresolvedComplaints.length}건
              </span>
            </div>

            {/* 주 1회 자동 평가 기반 불만도 40+ 선수 단장 면담 관리 */}
            {dissatisfiedPlayers.length > 0 && (
              <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  불만도 40 이상 선수 현황 (주 1회 평가 · 동일 선수 30일 면담 쿨다운)
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                  {dissatisfiedPlayers.slice(0, 10).map((pl) => {
                    const score = getPlayerDissatisfaction(pl);
                    const lvl = getDissatisfactionLevel(score);
                    const gate = canHoldPlayerMeeting(career, pl);
                    const resist = getReSignResistanceAssessment(career, pl);
                    const causes = pl.activeDissatisfactionCauses ?? [];
                    return (
                      <div key={pl.id} className="p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {pl.name} ({pl.position} · {pl.rosterTier}) ·{' '}
                            <span
                              className={
                                score >= 80
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : score >= 60
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }
                            >
                              불만도 {score}/100 ({lvl})
                            </span>
                            {pl.tradeRequested && (
                              <span className="ml-1.5 text-rose-600 dark:text-rose-400 font-extrabold">
                                · 트레이드 요청 중
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono-stats text-slate-500">
                            {causes.length > 0 ? causes.join(' · ') : '누적 불만'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={
                              score >= 80
                                ? 'h-full bg-rose-600'
                                : score >= 60
                                ? 'h-full bg-orange-500'
                                : 'h-full bg-amber-500'
                            }
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        {score >= 80 && (
                          <div className="text-[11px] text-rose-700 dark:text-rose-300">
                            재계약 거부 위험 {resist.refusalRiskPct}% · {resist.loyaltyNote} (자동 이적 없음)
                          </div>
                        )}
                        {!gate.allowed && (
                          <div className="text-[11px] text-slate-500">{gate.reason}</div>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {GM_MEETING_ACTIONS.map((action) => (
                            <button
                              key={action}
                              type="button"
                              disabled={!gate.allowed}
                              onClick={() => handleGmMeeting(pl.id, action)}
                              className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                                gate.allowed
                                  ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
                                  : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                              }`}
                            >
                              {action}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(career.complaints ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                현재 접수된 면담·포스팅 요청이 없습니다. 주 1회 자동 평가에서 불만 40 이상 선수가 발생하면 이곳에 표시됩니다.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {(career.complaints ?? []).slice(0, 12).map((cmp) => (
                  <div key={cmp.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {cmp.playerName} ({cmp.position}) ·{' '}
                        <span
                          className={
                            cmp.severity === '심각'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {cmp.reason}
                        </span>
                      </span>
                      <span className="text-[11px] font-mono-stats text-slate-500">
                        {cmp.createdDate}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{cmp.message}</p>
                    {cmp.resolved ? (
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{cmp.resolutionNote}</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          onClick={() => handleComplaint(cmp.id, '출전보장')}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          출전 보장
                        </button>
                        <button
                          onClick={() => handleComplaint(cmp.id, '연봉조정')}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                        >
                          연봉 인상 보전
                        </button>
                        <button
                          onClick={() => handleComplaint(cmp.id, '포스팅지원')}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          MLB 포스팅 지원
                        </button>
                        <button
                          onClick={() => handleComplaint(cmp.id, '역할설명')}
                          className="px-2.5 py-1 rounded text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          역할 설명
                        </button>
                        <button
                          onClick={() => handleComplaint(cmp.id, '트레이드수용')}
                          className="px-2.5 py-1 rounded text-xs font-semibold border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          이적 요청 수용
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: COACH REAL-TIME CONDITION REPORTS */}
      {subTab === 'coach' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-3">
              <ClipboardCheck className="w-4 h-4 team-accent-text" />
              실시간 선수 컨디션 보고 · 교체 추천
            </h3>
            {(career.coachSwapReports ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                현재 컨디션 급락(폼 -2 이하) 또는 극심한 피로로 교체가 시급한 주전 선수가 보고되지 않았습니다.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {(career.coachSwapReports ?? []).map((rep) => (
                  <div
                    key={rep.id}
                    className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>
                          [{rep.coachRole} {rep.coachName} 보고]
                        </span>
                        <span className="text-rose-600 dark:text-rose-400">
                          {rep.slumpingPlayerName} (폼 {rep.slumpingForm})
                        </span>
                        <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {rep.recommendedPlayerName} (폼{' '}
                          {rep.recommendedForm >= 0 ? `+${rep.recommendedForm}` : rep.recommendedForm})
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{rep.reason}</p>
                    </div>
                    {rep.applied ? (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <UserCheck className="w-4 h-4" /> 교체 반영 완료
                      </span>
                    ) : (
                      <button
                        onClick={() => handleCoachSwap(rep.id)}
                        className="px-3 py-1.5 rounded text-xs font-semibold team-accent-btn"
                      >
                        추천 교체 즉시 적용
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
              현재 코칭스태프 전술 성향 및 지도력
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {myStaff.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold team-accent-text">{c.role}</span>
                    <span className="font-mono-stats font-bold text-slate-900 dark:text-white">
                      OVR {c.ability}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{c.name}</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    전술 성향: <strong className="text-slate-800 dark:text-slate-200">{c.tacticalStyle ?? '밸런스'}</strong>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    육성 특화: <strong className="text-slate-800 dark:text-slate-200">{c.devSpecialty ?? '팀케미·관리'}</strong>
                  </div>
                  <div className="text-[11px] font-mono-stats text-slate-500 pt-1">
                    작전력 {c.tacticalRating ?? c.ability} · 육성력 {c.developmentRating ?? c.ability}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: OWNER EVALUATION & GM CLUB TRANSFER */}
      {subTab === 'owner' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold team-accent-text">
                  {career.season}시즌 구단주 다면 단장 평가 · 5대 경영 지표 (100점 만점)
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  목표: {ownerEval.targetRankLabel}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  재정 가이드: {ownerEval.targetProfitNote} · 현재 순위{' '}
                  <span className="font-mono-stats font-bold text-slate-900 dark:text-white">
                    {myRow ? `${myRow.rank}위 (${myRow.wins}승 ${myRow.losses}패)` : '개막 대기'}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <div className="text-[11px] text-slate-500">실시간 예상 평가</div>
                  <div className="text-2xl font-black font-mono-stats team-accent-text">
                    {liveOwnerReport.projectedGrade}등급 ({liveOwnerReport.totalScore}점)
                  </div>
                </div>
                <div className="pl-4 border-l border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">구단주 신임도</div>
                  <div className="text-2xl font-bold font-mono-stats text-slate-900 dark:text-white">
                    {ownerEval.ownerTrust} / 100
                  </div>
                </div>
              </div>
            </div>

            {/* 5-Pillar Composite Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              {[
                { label: '성적 목표', score: liveOwnerReport.performanceScore, max: 40, note: '순위·가을야구·우승' },
                { label: '재정·균형세', score: liveOwnerReport.financeScore, max: 20, note: '흑자·샐러리캡 준수' },
                { label: '유망주 육성', score: liveOwnerReport.developmentScore, max: 15, note: '24세 이하 성장·기용' },
                { label: '팬·관중·라이벌', score: liveOwnerReport.fanScore, max: 15, note: '팬 여론·관중·더비' },
                { label: '기강·리더십', score: liveOwnerReport.leadershipScore, max: 10, note: '사기·사건대응·주장' },
              ].map((pillar) => {
                const pct = Math.min(100, Math.round((pillar.score / pillar.max) * 100));
                return (
                  <div
                    key={pillar.label}
                    className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{pillar.label}</span>
                      <span className="font-mono-stats font-extrabold text-slate-900 dark:text-white">
                        {pillar.score}/{pillar.max}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded overflow-hidden">
                      <div
                        className={`h-full ${
                          pct >= 75
                            ? 'bg-emerald-500'
                            : pct >= 50
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{pillar.note}</div>
                  </div>
                );
              })}
            </div>

            {/* Highlights & Concerns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 space-y-1.5">
                <div className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>구단주 긍정 평가 요인</span>
                </div>
                {liveOwnerReport.highlights.length === 0 ? (
                  <div className="text-slate-500">아직 두드러진 가점 항목이 집계되지 않았습니다.</div>
                ) : (
                  <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                    {liveOwnerReport.highlights.map((h, i) => (
                      <li key={i}>• {h}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="p-3.5 rounded-md border border-rose-500/30 bg-rose-500/5 space-y-1.5">
                <div className="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>구단주 우려 · 개선 요구 사항</span>
                </div>
                {liveOwnerReport.concerns.length === 0 ? (
                  <div className="text-slate-500">현재 구단주가 지적한 중대한 감점 사항이 없습니다.</div>
                ) : (
                  <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                    {liveOwnerReport.concerns.map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Budget Directive */}
            <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                차기 시즌 예산 기조: {liveOwnerReport.budgetDirective}
              </span>
              <span
                className={`font-mono-stats font-extrabold ${
                  liveOwnerReport.nextSeasonBudgetDeltaPct > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : liveOwnerReport.nextSeasonBudgetDeltaPct < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                예산 변동 전망 {liveOwnerReport.nextSeasonBudgetDeltaPct >= 0 ? `+${liveOwnerReport.nextSeasonBudgetDeltaPct}%` : `${liveOwnerReport.nextSeasonBudgetDeltaPct}%`}
              </span>
            </div>

            {ownerEval.lastSeasonGrade && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    직전 시즌 최종 단장 평가: [{ownerEval.lastSeasonGrade}등급 · {ownerEval.lastSeasonVerdict}
                    {ownerEval.breakdown ? ` · ${ownerEval.breakdown.totalScore}점` : ''}]
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {ownerEval.evaluationComment}
                  </p>
                </div>
                {ownerEval.isFired && (
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> 해임 통보 — 아래에서 새 구단 단장직에 지원하세요
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
              <Briefcase className="w-4 h-4 team-accent-text" />
              타 KBO 구단 단장 지원 · 이적
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              해임 통보를 받았거나 새로운 도전(리빌딩/우승 청부사)을 원할 때 다른 구단 단장직으로 즉시 이적할 수 있습니다.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {TEAM_IDS.filter((tid) => tid !== career.playerTeamId).map((tid) => {
                const tInfo = KBO_TEAMS[tid];
                const row = standings.find((r) => r.teamId === tid);
                return (
                  <div
                    key={tid}
                    className="p-3 rounded border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <TeamLogo teamId={tid} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {tInfo.shortName}
                        </div>
                        <div className="text-[11px] font-mono-stats text-slate-500">
                          {row && row.games > 0 ? `${row.rank}위 (${row.wins}승 ${row.losses}패)` : `2025 ${tInfo.prevRank2025}위`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTransferTeam(tid)}
                      className="w-full py-1.5 rounded text-xs font-semibold team-accent-outline"
                    >
                      단장 지원·이적
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
