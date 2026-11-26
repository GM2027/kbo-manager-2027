import React, { useState } from 'react';
import { Crown, Trophy } from 'lucide-react';
import { resolvePublicAssetUrl } from '../utils/assetUrl';

/** 실제 KBO 정규시즌 MVP 트로피(스타일러스 디자인 계열) 기반 투명 배경 아이콘 이미지 */
export const KBO_MVP_TROPHY_PNG_URL = '/logos/kbo_mvp_trophy.png';

/** 실제 KBO 신인상(신인왕) 트로피(스타일러스 디자인 계열) 기반 투명 배경 아이콘 이미지 */
export const KBO_ROY_TROPHY_PNG_URL = '/logos/kbo_roy_trophy.png';

interface AwardTrophyIconProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const TROPHY_SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'w-4 h-5',
  sm: 'w-5 h-6',
  md: 'w-7 h-9',
  lg: 'w-14 h-20',
};

export const KboMvpTrophyIcon: React.FC<AwardTrophyIconProps> = ({
  size = 'sm',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const dims = TROPHY_SIZE_CLASSES[size];

  if (failed) {
    return <Trophy className={`${dims} text-amber-400 shrink-0 ${className}`} />;
  }

  return (
    <img
      src={resolvePublicAssetUrl(KBO_MVP_TROPHY_PNG_URL)}
      alt="KBO MVP 트로피"
      onError={() => setFailed(true)}
      draggable={false}
      data-testid="kbo-mvp-trophy-icon"
      className={`${dims} object-contain shrink-0 select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.38)] ${className}`}
    />
  );
};

export const KboRoyTrophyIcon: React.FC<AwardTrophyIconProps> = ({
  size = 'sm',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const dims = TROPHY_SIZE_CLASSES[size];

  if (failed) {
    return <Crown className={`${dims} text-sky-400 shrink-0 ${className}`} />;
  }

  return (
    <img
      src={resolvePublicAssetUrl(KBO_ROY_TROPHY_PNG_URL)}
      alt="KBO 신인왕 트로피"
      onError={() => setFailed(true)}
      draggable={false}
      data-testid="kbo-roy-trophy-icon"
      className={`${dims} object-contain shrink-0 select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.38)] ${className}`}
    />
  );
};
