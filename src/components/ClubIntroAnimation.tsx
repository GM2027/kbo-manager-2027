import React, { useEffect, useState } from 'react';
import { FastForward } from 'lucide-react';
import { audioManager } from '../audio/audioManager';
import { KBO_TEAMS } from '../data/kboTeams';
import { TEAM_UI_THEMES } from '../data/realKboHistories';
import { TeamId } from '../types/kbo';
import { resolvePublicAssetUrl } from '../utils/assetUrl';
import { preloadAllKboTeamLogos } from '../utils/logoPreloader';

interface ClubIntroAnimationProps {
  teamId: TeamId;
  gmName?: string;
  onComplete: () => void;
}

interface ClubIntroConfig {
  tagline: string;
  effectClass: string;
  ringColor: string;
  accentGlow: string;
  backdrop: string;
}

const CLUB_INTRO_CONFIGS: Record<TeamId, ClubIntroConfig> = {
  LG: {
    tagline: 'SEOUL TWINS · 무적 LG',
    effectClass: 'club-intro-lg',
    ringColor: '#C30452',
    accentGlow: 'rgba(195, 4, 82, 0.55)',
    backdrop: 'radial-gradient(circle at 50% 48%, rgba(195,4,82,0.34) 0%, rgba(15,17,26,0.96) 58%, #05060a 100%)',
  },
  한화: {
    tagline: 'DAEJEON EAGLES · 최강 한화',
    effectClass: 'club-intro-hanwha',
    ringColor: '#FC4E00',
    accentGlow: 'rgba(252, 78, 0, 0.58)',
    backdrop: 'radial-gradient(circle at 50% 52%, rgba(252,78,0,0.36) 0%, rgba(26,15,10,0.96) 58%, #0a0705 100%)',
  },
  KIA: {
    tagline: 'GWANGJU TIGERS · V13 도전',
    effectClass: 'club-intro-kia',
    ringColor: '#EA0029',
    accentGlow: 'rgba(234, 0, 41, 0.56)',
    backdrop: 'radial-gradient(circle at 50% 48%, rgba(234,0,41,0.34) 0%, rgba(17,12,16,0.96) 58%, #070608 100%)',
  },
  삼성: {
    tagline: 'DAEGU LIONS · 푸른 사자군단',
    effectClass: 'club-intro-samsung',
    ringColor: '#074CA1',
    accentGlow: 'rgba(56, 189, 248, 0.52)',
    backdrop: 'radial-gradient(circle at 50% 48%, rgba(7,76,161,0.42) 0%, rgba(10,20,38,0.96) 60%, #040914 100%)',
  },
  두산: {
    tagline: 'SEOUL BEARS · 미라클 두산',
    effectClass: 'club-intro-doosan',
    ringColor: '#ED1C24',
    accentGlow: 'rgba(237, 28, 36, 0.48)',
    backdrop: 'radial-gradient(circle at 50% 48%, rgba(30,41,92,0.46) 0%, rgba(13,15,34,0.97) 60%, #060714 100%)',
  },
  롯데: {
    tagline: 'BUSAN GIANTS · 거인의 항해',
    effectClass: 'club-intro-lotte',
    ringColor: '#D00F31',
    accentGlow: 'rgba(208, 15, 49, 0.50)',
    backdrop: 'radial-gradient(circle at 50% 52%, rgba(4,30,66,0.58) 0%, rgba(8,19,40,0.96) 58%, #030915 100%)',
  },
  SSG: {
    tagline: 'INCHEON LANDERS · 상륙의 서막',
    effectClass: 'club-intro-ssg',
    ringColor: '#CE0E2D',
    accentGlow: 'rgba(250, 204, 21, 0.45)',
    backdrop: 'radial-gradient(circle at 50% 48%, rgba(206,14,45,0.36) 0%, rgba(24,11,16,0.96) 58%, #0a0507 100%)',
  },
  KT: {
    tagline: 'SUWON WIZ · 마법의 시작',
    effectClass: 'club-intro-kt',
    ringColor: '#EB1C24',
    accentGlow: 'rgba(235, 28, 36, 0.55)',
    backdrop: 'radial-gradient(circle at 50% 48%, rgba(235,28,36,0.30) 0%, rgba(15,15,18,0.97) 58%, #050507 100%)',
  },
  NC: {
    tagline: 'CHANGWON DINOS · 거침없이 가자',
    effectClass: 'club-intro-nc',
    ringColor: '#C7A052',
    accentGlow: 'rgba(199, 160, 82, 0.50)',
    backdrop: 'radial-gradient(circle at 50% 48%, rgba(7,29,61,0.56) 0%, rgba(10,20,38,0.96) 58%, #040914 100%)',
  },
  키움: {
    tagline: 'GOCHEOK HEROES · 영웅의 출정',
    effectClass: 'club-intro-kiwoom',
    ringColor: '#E11D48',
    accentGlow: 'rgba(130, 0, 36, 0.62)',
    backdrop: 'radial-gradient(circle at 50% 48%, rgba(87,5,20,0.54) 0%, rgba(22,8,14,0.97) 58%, #0a0407 100%)',
  },
};

/**
 * 새 커리어 시작 시 구단 선택 확정 -> 단장 취임 화면 사이에 재생되는
 * KBO 10개 구단 실제 공식 로고 기반 고유 CSS 인트로 애니메이션 (약 2.1초 · 건너뛰기 지원)
 * - 실제 저장된 공식 로고 PNG를 우선 사용하고, 로고 자체는 변형·왜곡하지 않음
 * - 로고 파일 로드 실패 시 임의 가상 로고나 이모지 대신 기존 구단명 텍스트로 대체
 */
export const ClubIntroAnimation: React.FC<ClubIntroAnimationProps> = ({
  teamId,
  gmName,
  onComplete,
}) => {
  const info = KBO_TEAMS[teamId];
  const theme = TEAM_UI_THEMES[teamId];
  const cfg = CLUB_INTRO_CONFIGS[teamId];
  const [urlIndex, setUrlIndex] = useState(0);

  useEffect(() => {
    preloadAllKboTeamLogos();
    setUrlIndex(0);
  }, [teamId]);

  useEffect(() => {
    audioManager.play('club_select');
    const timer = window.setTimeout(() => {
      onComplete();
    }, 2150);
    return () => {
      window.clearTimeout(timer);
      audioManager.stopEvent('club_select');
    };
  }, [onComplete]);

  const handleSkip = () => {
    audioManager.stopEvent('club_select');
    onComplete();
  };

  const currentLogoUrl = info.logoUrls[urlIndex];
  const trimmedGm = gmName?.trim();
  const gmLabel =
    trimmedGm && trimmedGm !== '단장'
      ? trimmedGm.endsWith('단장')
        ? trimmedGm
        : `${trimmedGm} 단장`
      : '신임 단장';

  return (
    <div
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden select-none text-white ${cfg.effectClass}`}
      style={{
        background: cfg.backdrop,
        ['--club-ring' as string]: cfg.ringColor,
        ['--club-glow' as string]: cfg.accentGlow,
        ['--club-primary' as string]: theme.primaryDark,
      }}
      role="dialog"
      aria-label={`${info.name} 구단 출범 애니메이션`}
    >
      {/* 우상단 건너뛰기 버튼 */}
      <button
        type="button"
        data-no-click-sound="true"
        onClick={handleSkip}
        className="absolute top-5 right-5 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-bold text-white backdrop-blur-sm transition-colors cursor-pointer whitespace-nowrap"
      >
        <span>건너뛰기</span>
        <FastForward className="w-3.5 h-3.5" />
      </button>

      {/* 중앙 구단 로고 + 주변 고유 CSS 이펙트 레이어 (로고 자체는 변형/왜곡 금지) */}
      <div className="relative flex items-center justify-center w-72 h-72 sm:w-88 sm:h-88">
        {/* 구단별 고유 주변 효과 링/빛/파도/충격파 */}
        <div className="club-intro-aura-back" aria-hidden="true" />
        <div className="club-intro-ring-outer" aria-hidden="true" />
        <div className="club-intro-ring-inner" aria-hidden="true" />
        <div className="club-intro-sweep" aria-hidden="true" />

        {/* 중앙 공식 고해상도 구단 로고 컨테이너 (정비율 유지, 회전/왜곡 없음) */}
        <div className="club-intro-logo-frame relative z-10 w-40 h-40 sm:w-44 sm:h-44 rounded-full bg-white shadow-[0_20px_54px_rgba(0,0,0,0.6)] ring-2 ring-white/50 flex items-center justify-center p-4 overflow-hidden">
          {currentLogoUrl ? (
            <img
              src={resolvePublicAssetUrl(currentLogoUrl)}
              alt={info.name}
              loading="eager"
              decoding="sync"
              onError={() => setUrlIndex((prev) => prev + 1)}
              draggable={false}
              className="w-full h-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.16)]"
            />
          ) : (
            <div className="text-center px-3">
              <div
                className="text-xl sm:text-2xl font-black tracking-tight leading-snug"
                style={{ color: info.primaryColor }}
              >
                {info.name}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 하단 구단 공식 명칭 및 취임 안내 */}
      <div className="relative z-10 mt-6 text-center space-y-2 px-6 club-intro-text-reveal">
        <div
          className="text-[11px] sm:text-xs font-extrabold tracking-[0.26em] uppercase"
          style={{ color: theme.primaryDark }}
        >
          {cfg.tagline}
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          {info.name}
        </h2>
        <p className="text-xs sm:text-sm text-slate-300">
          {gmLabel} 취임식을 준비하고 있습니다 · {info.stadium}
        </p>

        {/* 진행 바 (약 2.1초) */}
        <div className="mx-auto mt-4 h-1 w-48 rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full club-intro-progress"
            style={{ backgroundColor: cfg.ringColor }}
          />
        </div>
      </div>
    </div>
  );
};
