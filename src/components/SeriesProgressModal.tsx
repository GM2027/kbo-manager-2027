import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FastForward, Radio } from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import { GameRecord, TeamId } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface SeriesProgressModalProps {
  title: string;
  games: GameRecord[];
  playerTeamId: TeamId;
  onComplete: () => void;
}

export const SeriesProgressModal: React.FC<SeriesProgressModalProps> = ({
  title,
  games,
  playerTeamId,
  onComplete,
}) => {
  const [revealedCount, setRevealedCount] = useState(1);

  useEffect(() => {
    setRevealedCount(1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 2; i <= games.length; i++) {
      timers.push(setTimeout(() => setRevealedCount(i), (i - 1) * 340));
    }
    const autoCloseMs = Math.max(900, games.length * 360 + 480);
    timers.push(setTimeout(() => onComplete(), autoCloseMs));
    return () => timers.forEach(clearTimeout);
  }, [games, onComplete]);

  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const g of games.slice(0, revealedCount)) {
    const isHome = g.homeTeam === playerTeamId;
    const myScore = isHome ? g.homeRuns : g.awayRuns;
    const oppScore = isHome ? g.awayRuns : g.homeRuns;
    if (myScore > oppScore) wins++;
    else if (myScore < oppScore) losses++;
    else draws++;
  }

  const rivalryGame = games.find((g) => g.isRivalryGame);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 text-white shadow-2xl overflow-hidden"
      >
        <div
          className={`px-5 py-3.5 flex items-center justify-between gap-2 ${
            rivalryGame
              ? 'bg-gradient-to-r from-rose-700 to-orange-600'
              : 'bg-gradient-to-r from-orange-600 to-amber-600'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-4 h-4 shrink-0" />
            <span className="text-xs font-extrabold tracking-wide truncate">
              {rivalryGame
                ? `${rivalryGame.rivalryName ?? '라이벌전'} 중계${
                    rivalryGame.rivalryIntensity ? ` · 열기 ${rivalryGame.rivalryIntensity}` : ''
                  }`
                : 'KBO LIVE MATCH BROADCAST'}
            </span>
          </div>
          <span className="text-xs font-mono-stats font-bold bg-black/25 px-2 py-0.5 rounded shrink-0">
            {wins}승 {losses}패{draws > 0 ? ` ${draws}무` : ''}
          </span>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <div className="text-sm font-extrabold text-slate-100">{title}</div>
            {rivalryGame?.rivalryEffectNote && (
              <div className="text-[11px] font-mono-stats text-rose-300 mt-0.5">
                라이벌 효과 발동: {rivalryGame.rivalryEffectNote}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {games.slice(0, revealedCount).map((g, idx) => {
                const isHome = g.homeTeam === playerTeamId;
                const myScore = isHome ? g.homeRuns : g.awayRuns;
                const oppScore = isHome ? g.awayRuns : g.homeRuns;
                const outcome = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
                return (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                    className="p-3 rounded-md border border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-mono-stats text-slate-400 shrink-0">
                      <span className="font-bold text-orange-400">G{idx + 1}</span>
                      <span>{g.date.slice(5)}</span>
                    </div>

                    <div className="flex items-center gap-3 flex-1 justify-center">
                      <div className="flex items-center gap-1.5 min-w-[78px] justify-end">
                        <span
                          className={`text-xs font-bold ${
                            g.awayTeam === playerTeamId ? 'text-orange-400' : 'text-slate-200'
                          }`}
                        >
                          {KBO_TEAMS[g.awayTeam].shortName}
                        </span>
                        <TeamLogo teamId={g.awayTeam} size="xs" />
                      </div>

                      <div className="font-mono-stats text-base font-extrabold tracking-wider px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {g.awayRuns} : {g.homeRuns}
                      </div>

                      <div className="flex items-center gap-1.5 min-w-[78px]">
                        <TeamLogo teamId={g.homeTeam} size="xs" />
                        <span
                          className={`text-xs font-bold ${
                            g.homeTeam === playerTeamId ? 'text-orange-400' : 'text-slate-200'
                          }`}
                        >
                          {KBO_TEAMS[g.homeTeam].shortName}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`w-7 h-7 rounded font-mono-stats text-xs font-extrabold flex items-center justify-center shrink-0 ${
                        outcome === 'W'
                          ? 'bg-emerald-600 text-white'
                          : outcome === 'L'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-700 text-slate-200'
                      }`}
                    >
                      {outcome === 'W' ? '승' : outcome === 'L' ? '패' : '무'}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <div className="pt-2 flex items-center justify-between gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <motion.div
                className="h-full bg-orange-500"
                initial={{ width: '0%' }}
                animate={{ width: `${Math.round((revealedCount / Math.max(1, games.length)) * 100)}%` }}
                transition={{ duration: 0.25 }}
              />
            </div>
            <button
              type="button"
              onClick={onComplete}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 shrink-0"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>결과 바로 보기</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
