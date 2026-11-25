import React, { useEffect, useMemo, useState } from 'react';
import { Award, Crown, FastForward, Sparkles, Trophy } from 'lucide-react';
import { audioManager, SoundEventId } from '../audio/audioManager';
import { KBO_TEAMS } from '../data/kboTeams';
import { AwardEntry, TeamId } from '../types/kbo';
import { GoldenGloveIcon } from './GoldenGloveIcon';
import { KoreanSeriesTrophyLogo } from './KoreanSeriesTrophyLogo';
import { TeamLogo } from './TeamLogo';

export type GameEventAnimationPayload =
  | {
      id: string;
      type: 'MEGA_FA_DEAL';
      playerName: string;
      position: string;
      teamId: TeamId;
      years: number;
      totalBillion: number;
    }
  | {
      id: string;
      type: 'BLOCKBUSTER_TRADE';
      teamA: TeamId;
      teamB: TeamId;
      teamAOutLabels: string[];
      teamBOutLabels: string[];
    }
  | {
      id: string;
      type: 'MANAGER_CHANGE';
      teamId: TeamId;
      dismissedManagerName: string;
    }
  | {
      id: string;
      type: 'KOREAN_SERIES_CHAMPION';
      season: number;
      teamId: TeamId;
      seriesScore: string;
      ksMvpName?: string;
    }
  | {
      id: string;
      type: 'GOLDEN_GLOVE';
      season: number;
      winners: AwardEntry[];
    }
  | {
      id: string;
      type: 'MVP_ROY';
      season: number;
      mvp: AwardEntry | null;
      rookieOfYear: AwardEntry | null;
    }
  | {
      id: string;
      type: 'RETIREMENT_CEREMONY';
      playerName: string;
      position: string;
      teamId: TeamId;
      careerSummary: string;
    };

interface GameEventAnimationsProps {
  event: GameEventAnimationPayload;
  onComplete: (eventId: string) => void;
}

interface KsClubVisualSpec {
  background: string;
  lightKind: 'glow' | 'spin' | 'flash' | 'particles' | 'rays' | 'streaks' | 'waves' | 'burst' | 'goldParticles' | 'spread';
  lightColor: string;
  lightSecondary: string;
  confettiColors: string[];
  accentText: string;
}

/**
 * 10개 KBO 구단별 한국시리즈 우승 전용 조명·배경·종이조각 설정 (단일 재사용 컴포넌트)
 */
const KS_CLUB_VISUALS: Record<TeamId, KsClubVisualSpec> = {
  KIA: {
    background: 'radial-gradient(circle at 50% 42%, rgba(234,0,41,0.48) 0%, rgba(24,8,12,0.96) 56%, #050507 100%)',
    lightKind: 'glow',
    lightColor: 'rgba(234,0,41,0.72)',
    lightSecondary: 'rgba(251,191,36,0.45)',
    confettiColors: ['#FACC15', '#FDE047', '#EAB308', '#FEF08A'],
    accentText: '#FDE047',
  },
  삼성: {
    background: 'radial-gradient(circle at 50% 42%, rgba(7,76,161,0.62) 0%, rgba(12,32,68,0.94) 52%, rgba(241,245,249,0.22) 100%), linear-gradient(160deg, #041634 0%, #074CA1 55%, #0B254B 100%)',
    lightKind: 'spin',
    lightColor: 'rgba(56,189,248,0.72)',
    lightSecondary: 'rgba(255,255,255,0.55)',
    confettiColors: ['#E2E8F0', '#F8FAFC', '#CBD5E1', '#94A3B8'],
    accentText: '#BAE6FD',
  },
  LG: {
    background: 'radial-gradient(circle at 50% 42%, rgba(195,4,82,0.52) 0%, rgba(16,12,20,0.96) 56%, #050509 100%)',
    lightKind: 'flash',
    lightColor: 'rgba(195,4,82,0.85)',
    lightSecondary: 'rgba(255,255,255,0.4)',
    confettiColors: ['#FFFFFF', '#F8FAFC', '#F1F5F9', '#E2E8F0'],
    accentText: '#FDA4AF',
  },
  두산: {
    background: 'radial-gradient(circle at 50% 42%, rgba(237,28,36,0.34) 0%, rgba(19,18,48,0.96) 52%, #09091B 100%)',
    lightKind: 'particles',
    lightColor: 'rgba(237,28,36,0.82)',
    lightSecondary: 'rgba(255,255,255,0.45)',
    confettiColors: ['#E2E8F0', '#F8FAFC', '#CBD5E1', '#94A3B8'],
    accentText: '#FCA5A5',
  },
  KT: {
    background: 'radial-gradient(circle at 50% 42%, rgba(235,28,36,0.42) 0%, rgba(14,14,17,0.97) 56%, #040406 100%)',
    lightKind: 'rays',
    lightColor: 'rgba(235,28,36,0.82)',
    lightSecondary: 'rgba(250,204,21,0.45)',
    confettiColors: ['#FACC15', '#FDE047', '#EAB308', '#FEF08A'],
    accentText: '#FDE047',
  },
  SSG: {
    background: 'radial-gradient(circle at 50% 42%, rgba(206,14,45,0.56) 0%, rgba(65,10,20,0.94) 55%, #1A060B 100%)',
    lightKind: 'streaks',
    lightColor: 'rgba(239,68,68,0.85)',
    lightSecondary: 'rgba(255,255,255,0.65)',
    confettiColors: ['#FACC15', '#FDE047', '#EAB308', '#FEF08A'],
    accentText: '#FDE047',
  },
  롯데: {
    background: 'radial-gradient(circle at 50% 45%, rgba(208,15,49,0.38) 0%, rgba(4,30,66,0.96) 54%, #021024 100%)',
    lightKind: 'waves',
    lightColor: 'rgba(56,189,248,0.68)',
    lightSecondary: 'rgba(208,15,49,0.52)',
    confettiColors: ['#E2E8F0', '#F8FAFC', '#CBD5E1', '#94A3B8'],
    accentText: '#7DD3FC',
  },
  한화: {
    background: 'radial-gradient(circle at 50% 42%, rgba(252,78,0,0.55) 0%, rgba(28,15,8,0.96) 56%, #080504 100%)',
    lightKind: 'burst',
    lightColor: 'rgba(252,78,0,0.85)',
    lightSecondary: 'rgba(251,191,36,0.6)',
    confettiColors: ['#FACC15', '#FDE047', '#FB923C', '#FEF08A'],
    accentText: '#FDBA74',
  },
  NC: {
    background: 'radial-gradient(circle at 50% 42%, rgba(199,160,82,0.44) 0%, rgba(12,31,61,0.96) 56%, #061227 100%)',
    lightKind: 'goldParticles',
    lightColor: 'rgba(212,175,55,0.86)',
    lightSecondary: 'rgba(49,82,136,0.65)',
    confettiColors: ['#FACC15', '#D4AF37', '#FDE047', '#FEF08A'],
    accentText: '#FDE047',
  },
  키움: {
    background: 'radial-gradient(circle at 50% 42%, rgba(130,0,36,0.64) 0%, rgba(45,8,20,0.95) 56%, #14040A 100%)',
    lightKind: 'spread',
    lightColor: 'rgba(190,18,60,0.82)',
    lightSecondary: 'rgba(255,255,255,0.58)',
    confettiColors: ['#E2E8F0', '#F8FAFC', '#CBD5E1', '#94A3B8'],
    accentText: '#FECDD3',
  },
};

const CONFETTI_SEEDS = Array.from({ length: 28 }, (_, i) => ({
  left: ((i * 37 + 7) % 94) + 3,
  delay: ((i * 19) % 24) / 10,
  dur: 2.2 + ((i * 11) % 10) / 10,
  drift: ((i % 2 === 0 ? 1 : -1) * (14 + ((i * 13) % 36))),
  size: i % 3 === 0 ? 10 : i % 3 === 1 ? 8 : 6,
  round: i % 4 === 0,
}));

export const GameEventAnimations: React.FC<GameEventAnimationsProps> = ({
  event,
  onComplete,
}) => {
  // 골든글러브 / MVP·신인왕 순차 표시 인덱스
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    setStepIdx(0);
  }, [event.id]);

  const mvpRoyItems = useMemo(() => {
    if (event.type !== 'MVP_ROY') return [];
    const list: Array<{ title: string; badge: string; entry: AwardEntry; accent: string }> = [];
    if (event.mvp) {
      list.push({
        title: 'KBO 정규시즌 MVP',
        badge: 'MOST VALUABLE PLAYER',
        entry: event.mvp,
        accent: '#FACC15',
      });
    }
    if (event.rookieOfYear) {
      list.push({
        title: 'KBO 신인왕',
        badge: 'ROOKIE OF THE YEAR',
        entry: event.rookieOfYear,
        accent: '#38BDF8',
      });
    }
    return list;
  }, [event]);

  const durationMs = useMemo(() => {
    switch (event.type) {
      case 'MEGA_FA_DEAL':
        return 2700;
      case 'BLOCKBUSTER_TRADE':
        return 2700;
      case 'MANAGER_CHANGE':
        return 2500;
      case 'KOREAN_SERIES_CHAMPION':
        return 3000;
      case 'GOLDEN_GLOVE':
        return 2000;
      case 'MVP_ROY':
        return 2200;
      case 'RETIREMENT_CEREMONY':
        return 3000;
    }
  }, [event.type]);

  const eventSoundId: SoundEventId = useMemo(() => {
    switch (event.type) {
      case 'MEGA_FA_DEAL':
        return 'mega_fa_deal';
      case 'BLOCKBUSTER_TRADE':
        return 'blockbuster_trade';
      case 'MANAGER_CHANGE':
        return 'manager_change';
      case 'KOREAN_SERIES_CHAMPION':
        return 'korean_series_champion';
      case 'GOLDEN_GLOVE':
        return 'golden_glove';
      case 'MVP_ROY':
        return 'mvp_roy';
      case 'RETIREMENT_CEREMONY':
        return 'retirement_ceremony';
    }
  }, [event.type]);

  // 이벤트 애니메이션과 효과음 재생 타이밍 동기화 + 건너뛰기/종료 시 효과음 즉시 정지
  useEffect(() => {
    audioManager.play(eventSoundId);
    return () => {
      audioManager.stopEvent(eventSoundId);
    };
  }, [event.id, eventSoundId, stepIdx]);

  useEffect(() => {
    if (event.type === 'GOLDEN_GLOVE') {
      if (event.winners.length === 0) {
        onComplete(event.id);
        return;
      }
      const timer = window.setTimeout(() => {
        if (stepIdx + 1 < event.winners.length) {
          setStepIdx((prev) => prev + 1);
        } else {
          onComplete(event.id);
        }
      }, durationMs);
      return () => window.clearTimeout(timer);
    }

    if (event.type === 'MVP_ROY') {
      if (mvpRoyItems.length === 0) {
        onComplete(event.id);
        return;
      }
      const timer = window.setTimeout(() => {
        if (stepIdx + 1 < mvpRoyItems.length) {
          setStepIdx((prev) => prev + 1);
        } else {
          onComplete(event.id);
        }
      }, durationMs);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      onComplete(event.id);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [event, stepIdx, durationMs, mvpRoyItems.length, onComplete]);

  const handleSkipAll = () => {
    audioManager.stopEvent(eventSoundId);
    onComplete(event.id);
  };

  // 1. FA 대형 계약 애니메이션
  if (event.type === 'MEGA_FA_DEAL') {
    const team = KBO_TEAMS[event.teamId];
    return (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden select-none px-4"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${team.primaryColor}44 0%, rgba(9,13,24,0.96) 62%, #04060c 100%)`,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="FA 대형 계약 확정"
      >
        <button
          type="button"
          data-no-click-sound="true"
          onClick={handleSkipAll}
          className="absolute top-5 right-5 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white backdrop-blur-sm cursor-pointer"
        >
          <span>건너뛰기</span>
          <FastForward className="w-3.5 h-3.5" />
        </button>

        {/* 확대되는 공식 FA 계약서 카드 */}
        <div className="kbo-anim-contract-zoom relative w-full max-w-lg rounded-2xl bg-[#FAF8F2] text-slate-900 border-2 border-amber-500/60 shadow-[0_28px_70px_rgba(0,0,0,0.75)] p-6 sm:p-8 overflow-hidden">
          <div
            className="absolute top-0 inset-x-0 h-2"
            style={{ backgroundColor: team.primaryColor }}
          />
          <div className="flex items-center justify-between gap-3 border-b border-slate-300/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 p-1.5 flex items-center justify-center shadow-xs">
                <TeamLogo teamId={event.teamId} size="lg" bare className="w-full h-full" />
              </div>
              <div>
                <div className="text-[11px] font-extrabold tracking-[0.2em] text-slate-500 uppercase">
                  KBO OFFICIAL FA CONTRACT
                </div>
                <div className="text-lg font-black text-slate-900">{team.name}</div>
              </div>
            </div>
            <div className="text-right font-mono-stats text-[11px] text-slate-500">
              <div>FORM FA-2026</div>
              <div className="font-bold text-slate-700">FINALIZED</div>
            </div>
          </div>

          <div className="py-6 text-center space-y-2.5">
            <div className="text-xs font-bold text-slate-500">{event.position} · FA 대형 계약 체결</div>
            <div className="text-3xl sm:text-4xl font-black tracking-tight text-slate-950">
              {event.playerName}
            </div>
            <div className="inline-flex items-baseline gap-3 px-4 py-2 rounded-xl bg-slate-900 text-white font-mono-stats shadow-md">
              <span className="text-lg sm:text-xl font-extrabold text-amber-300">
                {event.years}년
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-2xl sm:text-3xl font-black">
                총액 {event.totalBillion.toFixed(1)}억 원
              </span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-300 pt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>KBO 총재 승인 및 구단 단장 최종 날인 완료</span>
            <span className="font-mono-stats font-bold text-slate-700">{team.shortName}</span>
          </div>

          {/* MEGA DEAL 도장 슬램 효과 */}
          <div className="kbo-anim-stamp pointer-events-none absolute top-1/2 right-4 sm:right-7 -translate-y-1/2">
            <div className="px-4 py-2 rounded-lg border-4 border-rose-600/90 text-rose-600 font-black text-lg sm:text-2xl tracking-[0.14em] uppercase bg-rose-50/85 shadow-lg">
              MEGA DEAL
            </div>
          </div>

          <div className="mt-4 h-1 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full kbo-anim-progress"
              style={{
                backgroundColor: team.primaryColor,
                ['--anim-ms' as string]: `${durationMs}ms`,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // 3. 대형 트레이드 애니메이션
  if (event.type === 'BLOCKBUSTER_TRADE') {
    const teamA = KBO_TEAMS[event.teamA];
    const teamB = KBO_TEAMS[event.teamB];
    return (
      <div
        className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden select-none text-white px-4"
        style={{
          background: `linear-gradient(115deg, ${teamA.primaryColor}52 0%, #090d18 46%, #090d18 54%, ${teamB.primaryColor}52 100%)`,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="대형 트레이드 확정"
      >
        <button
          type="button"
          data-no-click-sound="true"
          onClick={handleSkipAll}
          className="absolute top-5 right-5 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white backdrop-blur-sm cursor-pointer"
        >
          <span>건너뛰기</span>
          <FastForward className="w-3.5 h-3.5" />
        </button>

        <div className="relative z-10 w-full max-w-3xl text-center space-y-6">
          <div className="space-y-1 club-intro-text-reveal">
            <div className="text-xs font-extrabold tracking-[0.3em] uppercase text-amber-300">
              BREAKING KBO TRADE CONFIRMED
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-[0.1em] text-white drop-shadow-[0_4px_20px_rgba(251,191,36,0.38)]">
              BLOCKBUSTER TRADE
            </h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-11 items-center gap-4">
            {/* 좌측 구단 */}
            <div className="sm:col-span-5 kbo-anim-slide-left rounded-2xl border border-white/15 bg-slate-950/75 p-5 flex flex-col items-center gap-3 backdrop-blur-sm">
              <div
                className="w-24 h-24 rounded-full bg-white p-3 flex items-center justify-center ring-4 shadow-xl"
                style={{ ['--tw-ring-color' as string]: teamA.primaryColor }}
              >
                <TeamLogo teamId={event.teamA} size="xl" bare className="w-full h-full" />
              </div>
              <div className="text-base font-black">{teamA.name}</div>
              <div className="w-full space-y-1 pt-1 border-t border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {teamB.shortName}로 이적
                </div>
                {event.teamAOutLabels.slice(0, 4).map((lbl, idx) => (
                  <div key={idx} className="text-xs sm:text-sm font-extrabold text-amber-200 truncate">
                    {lbl}
                  </div>
                ))}
              </div>
            </div>

            {/* 중앙 교환 화살표 SVG */}
            <div className="sm:col-span-1 flex items-center justify-center">
              <svg viewBox="0 0 48 48" className="w-10 h-10 text-amber-300 drop-shadow">
                <path
                  d="M8 17 H36 L29 10 M40 31 H12 L19 38"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* 우측 구단 */}
            <div className="sm:col-span-5 kbo-anim-slide-right rounded-2xl border border-white/15 bg-slate-950/75 p-5 flex flex-col items-center gap-3 backdrop-blur-sm">
              <div
                className="w-24 h-24 rounded-full bg-white p-3 flex items-center justify-center ring-4 shadow-xl"
                style={{ ['--tw-ring-color' as string]: teamB.primaryColor }}
              >
                <TeamLogo teamId={event.teamB} size="xl" bare className="w-full h-full" />
              </div>
              <div className="text-base font-black">{teamB.name}</div>
              <div className="w-full space-y-1 pt-1 border-t border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {teamA.shortName}로 이적
                </div>
                {event.teamBOutLabels.slice(0, 4).map((lbl, idx) => (
                  <div key={idx} className="text-xs sm:text-sm font-extrabold text-sky-200 truncate">
                    {lbl}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mx-auto h-1 w-56 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-amber-300 kbo-anim-progress"
              style={{ ['--anim-ms' as string]: `${durationMs}ms` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // 4. 감독 경질 애니메이션
  if (event.type === 'MANAGER_CHANGE') {
    const team = KBO_TEAMS[event.teamId];
    return (
      <div
        className="kbo-anim-darken fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden select-none text-white px-4"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(30,41,59,0.55) 0%, rgba(2,6,23,0.97) 58%, #000000 100%)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="감독 경질 발표"
      >
        <button
          type="button"
          data-no-click-sound="true"
          onClick={handleSkipAll}
          className="absolute top-5 right-5 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
        >
          <span>건너뛰기</span>
          <FastForward className="w-3.5 h-3.5" />
        </button>

        <div className="relative z-10 max-w-lg w-full text-center space-y-5">
          <div className="mx-auto w-28 h-28 rounded-full bg-white/95 p-3.5 flex items-center justify-center ring-2 ring-white/25 shadow-[0_20px_60px_rgba(0,0,0,0.85)]">
            <TeamLogo teamId={event.teamId} size="xl" bare className="w-full h-full" />
          </div>

          <div className="space-y-2 club-intro-text-reveal">
            <div className="text-xs font-extrabold tracking-[0.32em] uppercase text-rose-400">
              OFFICIAL CLUB ANNOUNCEMENT
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-[0.12em] text-white">
              MANAGER CHANGE
            </h1>
            <div className="h-px w-24 mx-auto bg-white/20 my-2" />
            <p className="text-base sm:text-lg font-extrabold text-slate-200">
              {team.name} · <span className="text-rose-300">{event.dismissedManagerName}</span> 감독 경질 확정
            </p>
            <p className="text-xs text-slate-400">
              구단은 수석코치 대행 체제 또는 차기 사령탑 선임 절차에 돌입합니다.
            </p>
          </div>

          <div className="mx-auto h-1 w-48 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-rose-500 kbo-anim-progress"
              style={{ ['--anim-ms' as string]: `${durationMs}ms` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // 5. 한국시리즈 우승 애니메이션 (10개 구단별 배경·조명·종이조각 설정 적용)
  if (event.type === 'KOREAN_SERIES_CHAMPION') {
    const team = KBO_TEAMS[event.teamId];
    const visual = KS_CLUB_VISUALS[event.teamId];
    return (
      <div
        className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden select-none text-white px-4"
        style={{ background: visual.background }}
        role="dialog"
        aria-modal="true"
        aria-label={`${event.season} 한국시리즈 우승`}
      >
        <button
          type="button"
          data-no-click-sound="true"
          onClick={handleSkipAll}
          className="absolute top-5 right-5 z-30 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white backdrop-blur-sm cursor-pointer"
        >
          <span>건너뛰기</span>
          <FastForward className="w-3.5 h-3.5" />
        </button>

        {/* 구단별 조명/빛 효과 레이어 */}
        {visual.lightKind === 'spin' || visual.lightKind === 'rays' ? (
          <div
            aria-hidden="true"
            className="kbo-anim-ks-spin pointer-events-none absolute w-[125vmax] h-[125vmax] opacity-40"
            style={{
              background: `repeating-conic-gradient(from 0deg, ${visual.lightColor} 0deg 14deg, transparent 14deg 36deg)`,
            }}
          />
        ) : visual.lightKind === 'flash' ? (
          <div
            aria-hidden="true"
            className="kbo-anim-ks-flash pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 45%, ${visual.lightColor} 0%, transparent 62%)`,
            }}
          />
        ) : visual.lightKind === 'waves' ? (
          <div
            aria-hidden="true"
            className="kbo-anim-ks-wave pointer-events-none absolute inset-x-[-20%] bottom-0 h-[55%]"
            style={{
              background: `radial-gradient(ellipse 70% 55% at 50% 100%, ${visual.lightColor} 0%, transparent 72%)`,
            }}
          />
        ) : visual.lightKind === 'streaks' ? (
          <div
            aria-hidden="true"
            className="kbo-anim-ks-streak pointer-events-none absolute inset-y-0 left-0 w-1/2"
            style={{
              background: `linear-gradient(90deg, transparent, ${visual.lightColor}, ${visual.lightSecondary}, transparent)`,
            }}
          />
        ) : visual.lightKind === 'burst' || visual.lightKind === 'spread' ? (
          <div
            aria-hidden="true"
            className="kbo-anim-ks-burst pointer-events-none absolute w-80 h-80 rounded-full"
            style={{
              background: `radial-gradient(circle, ${visual.lightColor} 0%, ${visual.lightSecondary} 40%, transparent 72%)`,
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            className="kbo-anim-ks-flash pointer-events-none absolute w-[560px] h-[560px] rounded-full blur-3xl opacity-55"
            style={{
              background: `radial-gradient(circle, ${visual.lightColor} 0%, ${visual.lightSecondary} 48%, transparent 74%)`,
            }}
          />
        )}

        {/* 구단별 종이조각 / 파티클 */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {CONFETTI_SEEDS.map((c, idx) => {
            const color = visual.confettiColors[idx % visual.confettiColors.length];
            const isParticleMode = visual.lightKind === 'particles' || visual.lightKind === 'goldParticles';
            return (
              <span
                key={idx}
                className="kbo-anim-ks-confetti absolute top-0 block"
                style={{
                  left: `${c.left}%`,
                  width: `${c.size}px`,
                  height: `${c.round || isParticleMode ? c.size : c.size * 1.5}px`,
                  borderRadius: c.round || isParticleMode ? '9999px' : '2px',
                  backgroundColor: isParticleMode && idx % 3 === 0 ? visual.lightColor : color,
                  ['--ks-delay' as string]: `${c.delay}s`,
                  ['--ks-dur' as string]: `${c.dur}s`,
                  ['--ks-drift' as string]: `${c.drift}px`,
                }}
              />
            );
          })}
        </div>

        {/* 중앙 트로피 + 우승 구단 실제 로고 + 문구 */}
        <div className="relative z-20 flex flex-col items-center text-center space-y-4 max-w-xl w-full">
          <div className="flex items-center justify-center gap-5 sm:gap-7">
            <div className="animate-award-trophy">
              <KoreanSeriesTrophyLogo size="lg" />
            </div>
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-white p-3.5 shadow-[0_22px_54px_rgba(0,0,0,0.65)] ring-4 ring-white/50 flex items-center justify-center">
              <TeamLogo teamId={event.teamId} size="xl" bare className="w-full h-full" />
            </div>
          </div>

          <div className="space-y-1.5 club-intro-text-reveal">
            <div
              className="text-xs sm:text-sm font-black tracking-[0.28em] uppercase"
              style={{ color: visual.accentText }}
            >
              KOREAN SERIES CHAMPIONS
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)]">
              {event.season} {team.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 font-semibold">
              한국시리즈 통합 우승 확정 ({event.seriesScore})
              {event.ksMvpName ? ` · KS MVP ${event.ksMvpName}` : ''}
            </p>
          </div>

          <div className="mt-2 h-1 w-56 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full kbo-anim-progress"
              style={{
                backgroundColor: visual.accentText,
                ['--anim-ms' as string]: `${durationMs}ms`,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // 6. 골든글러브 수상 애니메이션 (확정 데이터 순차 표시 ~2초 + 전체 건너뛰기)
  if (event.type === 'GOLDEN_GLOVE') {
    const winner = event.winners[stepIdx] ?? event.winners[0];
    if (!winner) return null;
    const team = KBO_TEAMS[winner.teamId];
    const posLabel = winner.positionLabel ?? winner.category.replace('골든글러브 ', '');
    return (
      <div
        className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden select-none text-white px-4"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(245,197,66,0.28) 0%, rgba(12,18,34,0.97) 58%, #050811 100%)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`${event.season} KBO 골든글러브 시상`}
      >
        <div className="absolute top-5 right-5 z-20 flex items-center gap-2">
          {stepIdx + 1 < event.winners.length && (
            <button
              type="button"
              onClick={() => setStepIdx((prev) => prev + 1)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-amber-300/35 bg-amber-400/15 hover:bg-amber-400/25 text-xs font-bold text-amber-200 cursor-pointer"
            >
              <span>다음 수상자</span>
            </button>
          )}
          <button
            type="button"
            data-no-click-sound="true"
            onClick={handleSkipAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
          >
            <span>전체 건너뛰기</span>
            <FastForward className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          key={`${winner.playerId}-${stepIdx}`}
          className="animate-award-enter relative z-10 w-full max-w-lg rounded-2xl border border-amber-400/45 bg-slate-950/85 p-6 sm:p-8 text-center shadow-[0_24px_65px_rgba(0,0,0,0.75)] space-y-4"
        >
          <div className="flex items-center justify-between text-[11px] font-mono-stats text-amber-300/90">
            <span>{event.season} KBO GOLDEN GLOVE</span>
            <span>
              {stepIdx + 1} / {event.winners.length}
            </span>
          </div>

          <div className="flex items-center justify-center gap-5 py-1">
            <div className="animate-award-trophy">
              <GoldenGloveIcon size="lg" />
            </div>
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white p-2.5 flex items-center justify-center ring-2 shadow-xl"
              style={{ ['--tw-ring-color' as string]: team.primaryColor }}
            >
              <TeamLogo teamId={winner.teamId} size="xl" bare className="w-full h-full" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/45 text-amber-200 text-xs font-extrabold">
            <Award className="w-3.5 h-3.5" />
            <span>{posLabel} 부문 수상</span>
          </div>

          <div className="space-y-1">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              {winner.playerName}
            </h2>
            <div className="text-sm font-bold text-slate-300">{team.name}</div>
            <p className="text-xs font-mono-stats text-amber-100/90 pt-1">{winner.statSummary}</p>
          </div>

          <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-amber-400 kbo-anim-progress"
              style={{ ['--anim-ms' as string]: `${durationMs}ms` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // 7. MVP · 신인왕 애니메이션 (스포트라이트 + 선수 카드 ~2.2초 + 건너뛰기)
  if (event.type === 'MVP_ROY') {
    const item = mvpRoyItems[stepIdx] ?? mvpRoyItems[0];
    if (!item) return null;
    const team = KBO_TEAMS[item.entry.teamId];
    return (
      <div
        className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden select-none text-white px-4"
        style={{
          background:
            'radial-gradient(ellipse 65% 55% at 50% 0%, rgba(250,204,21,0.28), transparent 62%), linear-gradient(160deg, #070b14 0%, #10192e 52%, #050811 100%)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`${event.season} KBO ${item.title}`}
      >
        <button
          type="button"
          data-no-click-sound="true"
          onClick={handleSkipAll}
          className="absolute top-5 right-5 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
        >
          <span>건너뛰기</span>
          <FastForward className="w-3.5 h-3.5" />
        </button>

        {/* 스포트라이트 빔 */}
        <div
          aria-hidden="true"
          className="kbo-anim-floodlight pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-[70vw] max-w-2xl h-[75vh]"
          style={{
            background: `linear-gradient(180deg, ${item.accent}44 0%, transparent 80%)`,
            clipPath: 'polygon(36% 0%, 64% 0%, 100% 100%, 0% 100%)',
          }}
        />

        <div
          key={`${item.entry.playerId}-${stepIdx}`}
          className="animate-award-enter relative z-10 w-full max-w-lg rounded-2xl border border-white/20 bg-slate-950/88 p-6 sm:p-8 text-center shadow-[0_26px_70px_rgba(0,0,0,0.8)] space-y-4"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[11px] font-black tracking-[0.22em] uppercase" style={{ color: item.accent }}>
            {stepIdx === 0 && event.mvp ? <Trophy className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
            <span>{event.season} {item.badge}</span>
          </div>

          <div className="mx-auto w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white p-3 flex items-center justify-center ring-4 shadow-xl" style={{ ['--tw-ring-color' as string]: team.primaryColor }}>
            <TeamLogo teamId={item.entry.teamId} size="xl" bare className="w-full h-full" />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-400">{item.title}</div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              {item.entry.playerName}
            </h2>
            <div className="text-sm font-bold text-slate-300">
              {team.name} · {item.entry.positionLabel ?? item.entry.category}
            </div>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-xs sm:text-sm font-mono-stats text-amber-100">
            {item.entry.statSummary}
          </div>

          <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full kbo-anim-progress"
              style={{
                backgroundColor: item.accent,
                ['--anim-ms' as string]: `${durationMs}ms`,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // 8. 주요 선수 은퇴식 애니메이션 (~3초 + 건너뛰기)
  const team = KBO_TEAMS[event.teamId];
  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden select-none text-white px-4"
      style={{
        background: `radial-gradient(circle at 50% 35%, rgba(251,191,36,0.22) 0%, ${team.primaryColor}33 34%, rgba(9,11,18,0.98) 72%, #040509 100%)`,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${event.playerName} 선수 은퇴식`}
    >
      <button
        type="button"
        data-no-click-sound="true"
        onClick={handleSkipAll}
        className="absolute top-5 right-5 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
      >
        <span>건너뛰기</span>
        <FastForward className="w-3.5 h-3.5" />
      </button>

      <div className="animate-award-enter relative z-10 w-full max-w-xl rounded-2xl border border-amber-300/35 bg-slate-950/85 p-7 sm:p-10 text-center shadow-[0_28px_72px_rgba(0,0,0,0.82)] space-y-5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-300/35 text-amber-200 text-[11px] font-extrabold tracking-[0.22em] uppercase">
          <Sparkles className="w-3.5 h-3.5" />
          <span>RETIREMENT CEREMONY</span>
        </div>

        <div className="mx-auto w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white p-3 flex items-center justify-center ring-4 ring-amber-300/50 shadow-xl">
          <TeamLogo teamId={event.teamId} size="xl" bare className="w-full h-full" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            {event.playerName}{' '}
            <span className="text-lg font-bold text-amber-300">({event.position})</span>
          </h2>
          <div className="text-sm font-semibold text-slate-300">
            마지막 소속: {team.name}
          </div>
        </div>

        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-xs sm:text-sm font-mono-stats text-slate-200 leading-relaxed">
          {event.careerSummary}
        </div>

        <p className="text-base sm:text-lg font-black text-amber-200 tracking-tight">
          &ldquo;그동안의 활약에 감사드립니다&rdquo;
        </p>

        <div className="mx-auto h-1 w-52 rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full bg-amber-300 kbo-anim-progress"
            style={{ ['--anim-ms' as string]: `${durationMs}ms` }}
          />
        </div>
      </div>
    </div>
  );
};
