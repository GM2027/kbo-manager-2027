import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Play, Shield } from 'lucide-react';
import { TEAM_STARTING_CASH_BILLION } from '../data/financesData';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { TEAM_UI_THEMES } from '../data/realKboHistories';
import { DIFFICULTY_CONFIG } from '../engine/deepFranchise';
import { GameDifficulty, TeamId } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface NewGameWizardProps {
  onCancel: () => void;
  onConfirmStart: (teamId: TeamId, gmName: string, difficulty: GameDifficulty) => void;
  onPreviewTeamColor?: (teamId: TeamId) => void;
}

const DIFFICULTIES: GameDifficulty[] = ['보통', '어려움', '극한'];

export const NewGameWizard: React.FC<NewGameWizardProps> = ({
  onCancel,
  onConfirmStart,
  onPreviewTeamColor,
}) => {
  const [selectedTeam, setSelectedTeam] = useState<TeamId>('LG');
  const [gmName, setGmName] = useState('');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('어려움');

  useEffect(() => {
    onPreviewTeamColor?.(selectedTeam);
  }, [selectedTeam, onPreviewTeamColor]);

  const teamInfo = KBO_TEAMS[selectedTeam];
  const selectedCash = TEAM_STARTING_CASH_BILLION[selectedTeam];
  const selectedTheme = TEAM_UI_THEMES[selectedTeam];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <div className="h-1 w-full team-banner-grad transition-all duration-300" />
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>타이틀로 돌아가기</span>
          </button>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>새 게임 시작 · 2027시즌 구단 선택 (2027-01-01 개시)</span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold team-accent-text">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: selectedTheme.primaryLight }}
              />
              {teamInfo.shortName} 컬러 테마 적용
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              2027 KBO 구단 선택
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              v18 재보정 선수 DB(731명 · 2024~2026 성적 반영)로 2027년 1월 1일부터 새 커리어를 시작합니다.
            </p>
          </div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            시즌 2027 · 144경기 · 731명 DB
          </div>
        </div>

        {/* Compact 2-column KBO 10-team Grid (v4.38 rule) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {TEAM_IDS.map((tid) => {
            const info = KBO_TEAMS[tid];
            const isSelected = selectedTeam === tid;
            const startingCash = TEAM_STARTING_CASH_BILLION[tid];
            return (
              <button
                key={tid}
                type="button"
                onClick={() => setSelectedTeam(tid)}
                className={`flex items-center justify-between gap-3 p-3 rounded-md border text-left transition-colors ${
                  isSelected
                    ? 'team-accent-border team-accent-soft'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TeamLogo teamId={tid} size="md" wide />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                      <span>{info.name}</span>
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: TEAM_UI_THEMES[tid].primaryLight }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {info.city} · {info.stadium}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-[11px] font-mono-stats font-bold text-emerald-700 dark:text-emerald-400">
                      자금 {startingCash}억
                    </div>
                    <div className="text-[11px] font-mono-stats text-slate-500 dark:text-slate-400">
                      25년 {info.prevRank2025}위
                    </div>
                  </div>
                  {isSelected && (
                    <span className="w-5 h-5 rounded team-accent-bg flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Difficulty Selector (#6: 기본 추천 '어려움') */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Shield className="w-4 h-4 team-accent-text" />
              <span>프런트 운영 난이도 선택</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              경기 결과는 절대 인위 조작되지 않으며, 타 구단 경쟁·에이전트 기준·예산 압박에 반영됩니다.
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {DIFFICULTIES.map((diffKey) => {
              const cfg = DIFFICULTY_CONFIG[diffKey];
              const active = difficulty === diffKey;
              return (
                <button
                  key={diffKey}
                  type="button"
                  onClick={() => setDifficulty(diffKey)}
                  className={`text-left p-3 rounded-md border transition-colors ${
                    active
                      ? 'team-accent-border team-accent-soft'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">{cfg.label}</span>
                    {active && <Check className="w-3.5 h-3.5 team-accent-text" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {cfg.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Team + GM Name + Start CTA */}
        <div className="border team-accent-border bg-white dark:bg-slate-900 rounded-md p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TeamLogo teamId={selectedTeam} size="md" />
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                선택 구단 · 난이도 {DIFFICULTY_CONFIG[difficulty].label}
              </div>
              <div className="text-base font-bold">
                {teamInfo.name} ·{' '}
                <span className="font-mono-stats text-emerald-700 dark:text-emerald-400">
                  {selectedCash}억 원
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <input
              type="text"
              value={gmName}
              onChange={(e) => setGmName(e.target.value)}
              placeholder="단장 이름 (선택 입력)"
              maxLength={16}
              className="px-3 py-2 text-sm rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-slate-500"
            />
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => onConfirmStart(selectedTeam, gmName, difficulty)}
              className="px-5 py-2 text-sm font-bold rounded team-accent-bg flex items-center justify-center gap-1.5"
            >
              <Play className="w-4 h-4" />
              <span>커리어 시작</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
