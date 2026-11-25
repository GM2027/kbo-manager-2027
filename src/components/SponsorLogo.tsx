import React from 'react';
import { SponsorContract } from '../types/kbo';

interface SponsorLogoProps {
  sponsor: Pick<SponsorContract, 'name' | 'industry' | 'brandCode' | 'brandColor' | 'brandAccent'>;
  size?: 'sm' | 'md';
}

export const SponsorLogo: React.FC<SponsorLogoProps> = ({ sponsor, size = 'md' }) => {
  const code = sponsor.brandCode ?? sponsor.name.slice(0, 2);
  const bg = sponsor.brandColor ?? '#0F172A';
  const accent = sponsor.brandAccent ?? '#EA580C';
  const dims = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';

  return (
    <div
      className={`${dims} shrink-0 rounded border border-slate-200 dark:border-slate-700 overflow-hidden select-none`}
      title={`${sponsor.name} (${sponsor.industry})`}
    >
      <svg viewBox="0 0 40 40" className="w-full h-full" role="img" aria-hidden="true">
        <rect x="0" y="0" width="40" height="40" fill={bg} />
        <polygon points="0,33 40,25 40,40 0,40" fill={accent} fillOpacity="0.85" />
        <text
          x="20"
          y="22.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize={code.length >= 3 ? '10' : '12.5'}
          fontWeight="900"
          fontFamily="Inter, Pretendard, system-ui, sans-serif"
          letterSpacing="-0.3"
        >
          {code}
        </text>
      </svg>
    </div>
  );
};
