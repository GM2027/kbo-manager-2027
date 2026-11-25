import React from 'react';
import { PlayerCategory } from '../types/kbo';

interface PlayerCategoryTagProps {
  category: PlayerCategory;
  compact?: boolean;
  showDomestic?: boolean;
}

/**
 * Crisp inline rectangular tag highlighting 외국인 / 아시아쿼터 players across every view.
 */
export const PlayerCategoryTag: React.FC<PlayerCategoryTagProps> = ({
  category,
  compact = false,
  showDomestic = false,
}) => {
  if (category === '외국인') {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] leading-none font-bold border border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shrink-0 whitespace-nowrap"
        title="외국인 선수"
      >
        {compact ? '외인' : '외국인'}
      </span>
    );
  }
  if (category === '아시아쿼터') {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] leading-none font-bold border border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 shrink-0 whitespace-nowrap"
        title="아시아쿼터 선수"
      >
        {compact ? '아시아Q' : '아시아쿼터'}
      </span>
    );
  }
  if (showDomestic) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] leading-none font-medium border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
        국내
      </span>
    );
  }
  return null;
};
