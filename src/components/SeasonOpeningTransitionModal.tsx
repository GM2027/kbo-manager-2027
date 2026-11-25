import React, { useEffect } from 'react';
import { FastForward } from 'lucide-react';
import { audioManager } from '../audio/audioManager';
import { KBO_TEAMS } from '../data/kboTeams';
import { TeamId } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface SeasonOpeningTransitionModalProps {
  fromSeason: number;
  toSeason: number;
  teamId: TeamId;
  onComplete: () => void;
}

/**
 * 시즌 전환 애니메이션 (단장 최종 승인 후 1회 재생 · ~2.2초 · 건너뛰기 지원)
 * - 기존 연도가 사라지고 새 연도가 등장
 * - KBO 공식 스타일 엠블럼(SVG) + "NEW SEASON" + 구단 실제 로고 표시
 */
export const SeasonOpeningTransitionModal: React.FC<SeasonOpeningTransitionModalProps> = ({
  fromSeason,
  toSeason,
  teamId,
  onComplete,
}) => {
  const team = KBO_TEAMS[teamId];

  useEffect(() => {
    audioManager.play('season_transition');
    const timer = window.setTimeout(() => {
      onComplete();
    }, 2250);
    return () => {
      window.clearTimeout(timer);
      audioManager.stopEvent('season_transition');
    };
  }, [onComplete]);

  const handleSkip = () => {
    audioManager.stopEvent('season_transition');
    onComplete();
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/92 backdrop-blur-md select-none px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${toSeason} KBO 새 시즌 전환`}
    >
      <button
        type="button"
        data-no-click-sound="true"
        onClick={handleSkip}
        className="absolute top-5 right-5 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white backdrop-blur-sm transition-colors cursor-pointer"
      >
        <span>건너뛰기</span>
        <FastForward className="w-3.5 h-3.5" />
      </button>

      <div
        className="relative w-full max-w-xl rounded-2xl overflow-hidden border border-white/15 shadow-2xl p-7 sm:p-10 text-center text-white"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${team.primaryColor}60 0%, rgba(15,23,42,0.97) 60%, rgba(2,6,23,0.99) 100%)`,
        }}
      >
        <div className="flex flex-col items-center gap-4">
          {/* KBO 엠블럼 SVG + 구단 실제 고해상도 로고 */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/10 ring-1 ring-amber-300/40 flex items-center justify-center shadow-lg"
              aria-hidden="true"
            >
              <svg viewBox="0 0 64 64" className="w-11 h-11">
                <defs>
                  <linearGradient id="kbo-emblem-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1D4ED8" />
                    <stop offset="50%" stopColor="#E11D48" />
                    <stop offset="100%" stopColor="#F59E0B" />
                  </linearGradient>
                </defs>
                <circle cx="32" cy="32" r="28" fill="#0F172A" stroke="url(#kbo-emblem-ring)" strokeWidth="3.5" />
                <path d="M18 20 C24 27 24 37 18 44" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M46 20 C40 27 40 37 46 44" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" />
                <text
                  x="32"
                  y="36"
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="14"
                  fontWeight="900"
                  letterSpacing="1"
                  fontFamily="system-ui, sans-serif"
                >
                  KBO
                </text>
              </svg>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div className="p-2 rounded-2xl bg-white shadow-lg ring-1 ring-white/30">
              <TeamLogo teamId={teamId} size="lg" bare />
            </div>
          </div>

          <div className="text-xs sm:text-sm font-black tracking-[0.34em] uppercase text-amber-300">
            NEW SEASON
          </div>

          {/* 연도 전환 모션: 기존 연도 페이드아웃 -> 새 연도 등장 */}
          <div className="relative h-24 sm:h-28 w-full flex items-center justify-center overflow-hidden">
            <div className="kbo-anim-year-out absolute text-6xl sm:text-7xl font-black font-mono-stats tracking-tight text-white/45">
              {fromSeason}
            </div>
            <div className="kbo-anim-year-in absolute text-6xl sm:text-8xl font-black font-mono-stats tracking-tight text-white drop-shadow-[0_6px_26px_rgba(255,255,255,0.3)]">
              {toSeason}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-lg sm:text-xl font-black tracking-tight">
              {toSeason} KBO 정규시즌 개막
            </div>
            <p className="text-xs sm:text-sm text-slate-300">
              {team.name} · 단장 최종 승인으로 새 시즌 144경기 대장정을 시작합니다
            </p>
          </div>

          <div className="mt-2 h-1 w-52 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full kbo-anim-progress"
              style={{
                backgroundColor: team.primaryColor,
                ['--anim-ms' as string]: '2200ms',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
