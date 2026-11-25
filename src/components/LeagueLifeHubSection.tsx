import React, { useMemo, useState } from 'react';
import { Briefcase, Shield, UserMinus } from 'lucide-react';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { getMilitaryEnlistmentQueue } from '../engine/leagueLifeEngine';
import { CareerSave, TeamId } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface LeagueLifeHubSectionProps {
  career: CareerSave;
  onSelectPlayer?: (playerId: string) => void;
  defaultSubTab?: 'retired' | 'released' | 'military';
}

export const LeagueLifeHubSection: React.FC<LeagueLifeHubSectionProps> = ({
  career,
  onSelectPlayer,
  defaultSubTab = 'retired',
}) => {
  const [subTab, setSubTab] = useState<'retired' | 'released' | 'military'>(defaultSubTab);
  const [militaryTeamFilter, setMilitaryTeamFilter] = useState<TeamId | 'ALL'>(career.playerTeamId);
  const [retiredPathFilter, setRetiredPathFilter] = useState<string>('ALL');

  const militaryQueue = useMemo(
    () => getMilitaryEnlistmentQueue(career, militaryTeamFilter),
    [career, militaryTeamFilter]
  );

  const retiredList = useMemo(() => {
    const all = career.retiredCareerTracker ?? [];
    if (retiredPathFilter === 'ALL') return all;
    return all.filter((r) => r.careerPath === retiredPathFilter);
  }, [career.retiredCareerTracker, retiredPathFilter]);

  const releasedList = career.releasedPlayersTracker ?? [];

  const subTabs = [
    {
      id: 'retired' as const,
      label: `은퇴선수 근황 (${(career.retiredCareerTracker ?? []).length})`,
      icon: Briefcase,
    },
    {
      id: 'released' as const,
      label: `방출 선수 근황 (${releasedList.length})`,
      icon: UserMinus,
    },
    { id: 'military' as const, label: '군입대 예정자', icon: Shield },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        {subTabs.map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                active
                  ? 'team-accent-bg shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 1. 은퇴선수 근황 & 진로 자동 관리 */}
      {subTab === 'retired' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                은퇴선수 근황 · 진로 자동 관리
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                프로야구 코치 전향 선수는 코치 FA 시장에 등록되며, 코치 연수자는 1~2시즌 수료 후 자동 편입됩니다. (사용자 구단 영입은 단장 승인 필수)
              </p>
            </div>
            <select
              value={retiredPathFilter}
              onChange={(e) => setRetiredPathFilter(e.target.value)}
              className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">전체 진로</option>
              <option value="프로야구 코치">프로야구 코치</option>
              <option value="코치 연수">코치 연수</option>
              <option value="해설위원">해설위원</option>
              <option value="고교·대학 지도자">고교·대학 지도자</option>
              <option value="스카우트">스카우트</option>
              <option value="프런트 직원">프런트 직원</option>
              <option value="야구 아카데미">야구 아카데미</option>
              <option value="개인 사업">개인 사업</option>
              <option value="일반 은퇴">일반 은퇴</option>
            </select>
          </div>

          {retiredList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              아직 커리어 진행 중 은퇴한 선수가 없습니다. 시즌 종료 후 현역 은퇴 선수가 발생하면 진로(코치·코치 연수·해설위원·지도자 등)가 자동 배정되어 이곳에 표시됩니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 text-left">이름</th>
                    <th className="py-2.5 px-2 text-center">나이</th>
                    <th className="py-2.5 px-2 text-center">은퇴 연도</th>
                    <th className="py-2.5 px-3 text-left">마지막 소속</th>
                    <th className="py-2.5 px-3 text-left">현재 직업</th>
                    <th className="py-2.5 px-3 text-left">현재 소속 · 비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {retiredList.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                        {r.playerName}{' '}
                        <span className="font-normal text-slate-400">({r.position})</span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono-stats">{r.age}세</td>
                      <td className="py-2.5 px-2 text-center font-mono-stats">{r.retiredSeason}년</td>
                      <td className="py-2.5 px-3">
                        <div className="inline-flex items-center gap-1.5">
                          <TeamLogo teamId={r.lastTeamId} size="xs" />
                          <span>{KBO_TEAMS[r.lastTeamId]?.shortName ?? r.lastTeamId}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {r.careerPath}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {r.currentAffiliation} · {r.currentRoleLabel}
                        </div>
                        <div className="text-[11px] text-slate-400">{r.careerSummary}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. 방출 선수 근황 */}
      {subTab === 'released' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              방출 선수 근황 추적
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              방출·웨이버 공시 이후 타 구단 이적, 독립리그/울산 합류, 또는 은퇴 여부를 추적합니다.
            </p>
          </div>
          {releasedList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              아직 방출 이력이 기록된 선수가 없습니다. 선수 방출·정리 예정 일괄 방출 시 근황이 자동 기록됩니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 text-left">선수</th>
                    <th className="py-2.5 px-2 text-center">방출 구단</th>
                    <th className="py-2.5 px-2 text-center">방출일</th>
                    <th className="py-2.5 px-3 text-center">현재 상태</th>
                    <th className="py-2.5 px-3 text-left">현 소속 · 근황</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {releasedList.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                        {r.playerName}{' '}
                        <span className="font-normal text-slate-400">
                          {r.position} · {r.age}세 · OVR {r.ability}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <TeamLogo teamId={r.releasedFromTeamId} size="xs" />
                          <span>{r.releasedFromTeamId}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono-stats">{r.releasedDate}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-semibold ${
                            r.status === '타구단 이적'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : r.status === '은퇴'
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {r.currentTeamLabel}
                        {r.note ? <span className="text-slate-400"> · {r.note}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. 군입대 예정자 명단 */}
      {subTab === 'military' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                군입대 예정자 · 상무 피닉스 전역 예정 명단
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                미필 국내 선수들의 예상 입대일 및 18개월 복무 기준 전역 예정일을 확인합니다.
              </p>
            </div>
            <select
              value={militaryTeamFilter}
              onChange={(e) => setMilitaryTeamFilter(e.target.value as TeamId | 'ALL')}
              className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">KBO 전체 구단</option>
              {TEAM_IDS.map((tid) => (
                <option key={tid} value={tid}>
                  {KBO_TEAMS[tid].name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 text-left">선수</th>
                  <th className="py-2.5 px-2 text-center">구단</th>
                  <th className="py-2.5 px-2 text-center">상태</th>
                  <th className="py-2.5 px-2 text-center">입대(예정)일</th>
                  <th className="py-2.5 px-2 text-center">전역 예정일</th>
                  <th className="py-2.5 px-3 text-left">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {militaryQueue.slice(0, 50).map((m) => (
                  <tr key={m.playerId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() => onSelectPlayer?.(m.playerId)}
                        className="font-bold text-slate-900 dark:text-white hover:underline text-left"
                      >
                        {m.playerName}{' '}
                        <span className="font-normal text-slate-400">
                          {m.position} · {m.age}세 · OVR {m.ability}
                        </span>
                      </button>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        <TeamLogo teamId={m.teamId} size="xs" />
                        <span>{m.teamId}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-semibold ${
                          m.status === '상무 복무중'
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center font-mono-stats">{m.expectedEnlistDate}</td>
                    <td className="py-2 px-2 text-center font-mono-stats font-semibold text-emerald-600 dark:text-emerald-400">
                      {m.expectedDischargeDate}
                    </td>
                    <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
