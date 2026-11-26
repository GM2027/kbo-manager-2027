import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Crown,
  Flame,
  Globe2,
  Heart,
  Home,
  Layers,
  Lightbulb,
  LogOut,
  Moon,
  Newspaper,
  Play,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import { audioManager, AudioSettings } from '../audio/audioManager';
import { COACH_ROLES } from '../data/coachesData';
import { KBO_TEAMS, normalizeChampionHistory } from '../data/kboTeams';
import {
  advanceOffseasonStep,
  applyAllCoachFormRecommendations,
  applyCoachSwapRecommendation,
  applyManagerPreGameRecommendation,
  buildInitialOwnerEval,
  computeLiveOwnerEvaluationReport,
  computeReverseDraftOrder,
  formatKrwBillionKorean,
  getCoachDevelopmentalRecommendations,
  getCoachFormLineupRecommendations,
  getManagerPreGameRecommendation,
  isPlayerOnNationalTeamDuty,
  recruitDevelopmentalCandidate,
} from '../engine/franchiseSystems';
import { getClubGmRecommendations, GmRecommendationItem } from '../engine/recommendations';
import {
  simulateNextPostseasonGame,
  simulateNextRegularGame,
  simulateNextRegularSeries,
} from '../engine/simulator';
import { computeStandings } from '../engine/stats';
import { acknowledgeChampionEvent } from '../engine/transactions';
import { getRookieDraftScheduleInfo } from '../engine/calendarEngine';
import { getCurrentCareerDate, getDraftPickingTeamForSlot } from '../engine/salaryCapEngine';
import { CareerSummaryItem, saveCareer } from '../storage/careerStorage';
import { AppSettings, CareerSave, GameRecord, OffseasonStep, TeamId } from '../types/kbo';
import { AnalyticsCenterView } from './AnalyticsCenterView';
import { GameEventAnimationPayload, GameEventAnimations } from './GameEventAnimations';
import { LeagueAcquisitionsView } from './LeagueAcquisitionsView';
import { SeasonOpeningTransitionModal } from './SeasonOpeningTransitionModal';
import { getPendingIncomingTradeOffers } from '../engine/incomingTradeEngine';
import { DraftPostingAwardsView } from './DraftPostingAwardsView';
import { FinancesSavesView } from './FinancesSavesView';
import { KboAwardsCeremonyView } from './KboAwardsCeremonyView';
import { LeagueHubView } from './LeagueHubView';
import { NewsAndEventsView } from './NewsAndEventsView';
import { OffseasonHubView } from './OffseasonHubView';
import { OnboardingFlow } from './OnboardingFlow';
import {
  FranchiseStarIcon,
  isFranchiseStarPlayer,
  PlayerCompactTag,
  PlayerForeignFlag,
} from './PlayerStatusCompact';
import { PlayerDetailModal } from './PlayerDetailModal';
import { PostseasonView } from './PostseasonView';
import { RosterLineupView } from './RosterLineupView';
import { SeriesProgressModal } from './SeriesProgressModal';
import { SeriesReportView } from './SeriesReportView';
import { SoundSettingsModal } from './SoundSettingsPanel';
import { StandingsAndScheduleView } from './StandingsAndScheduleView';
import { TeamLogo } from './TeamLogo';
import { TransactionsSubTab, TransactionsView } from './TransactionsView';
import { AmateurAndOverseasView, AmateurSubTab } from './AmateurAndOverseasView';
import { GlobalPlayerSearchModal } from './GlobalPlayerSearchModal';
import { KoreanSeriesTrophyLogo } from './KoreanSeriesTrophyLogo';
import { LeagueLifeHubSection } from './LeagueLifeHubSection';
import {
  completeAndAdvanceOffseason8Step,
  getClubTitleCount,
  getContractExpiryAlerts,
  getOffseason8StepReadiness,
  getRetirementCandidateAlerts,
} from '../engine/leagueLifeEngine';
import { CountryFlag } from './CountryFlag';
import {
  computeSalaryCapSummary,
  DIFFICULTY_CONFIG,
  getTradeWindowStatus,
} from '../engine/deepFranchise';
import {
  getRivalryEffectProfile,
  getRivalryOpponent,
  getRivalryRecordForTeam,
  getRivalryTier,
  getRivalryTierLabel,
  getTeamRivalries,
} from '../engine/rivalryEngine';

type NavTab =
  | 'home'
  | 'report'
  | 'news'
  | 'postseason'
  | 'awards'
  | 'offseason'
  | 'standings'
  | 'analytics'
  | 'roster'
  | 'contracts'
  | 'acquisitions'
  | 'draft'
  | 'amateur'
  | 'hub'
  | 'leagueLife'
  | 'history'
  | 'finances';

interface DashboardProps {
  career: CareerSave;
  savedCareers?: CareerSummaryItem[];
  settings: AppSettings;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onUpdateSettings: (next: AppSettings) => void;
  onImportJson: (raw: string) => void;
  onSaveAsNewSlot?: (customLabel: string) => void;
  onSwitchCareer?: (careerId: string) => void;
  onRenameCareer?: (careerId: string, newLabel: string) => void;
  onDeleteCareer?: (careerId: string) => void;
  onExitToTitle: () => void;
}

type NavGroupId =
  | 'home'
  | 'season'
  | 'squad'
  | 'frontOffice'
  | 'prospects'
  | 'leagueOps'
  | 'records'
  | 'finances';

interface NavSubItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroupItem {
  id: NavGroupId;
  label: string;
  section: '구단 · 경기' | '프런트 · 전력' | '리그 · 관리';
  icon: React.ComponentType<{ className?: string }>;
  defaultTab: NavTab;
  tabs: NavSubItem[];
}

const NAV_GROUPS: NavGroupItem[] = [
  {
    id: 'home',
    label: '구단 홈',
    section: '구단 · 경기',
    icon: Home,
    defaultTab: 'home',
    tabs: [{ id: 'home', label: '구단 홈', icon: Home }],
  },
  {
    id: 'season',
    label: '경기 · 일정',
    section: '구단 · 경기',
    icon: CalendarDays,
    defaultTab: 'standings',
    tabs: [
      { id: 'standings', label: '순위 · 일정 · 타이틀', icon: Award },
      { id: 'report', label: '경기 결과 리포트', icon: BarChart3 },
      { id: 'postseason', label: '포스트시즌 중계실', icon: Crown },
    ],
  },
  {
    id: 'squad',
    label: '선수단 · 분석',
    section: '구단 · 경기',
    icon: Users,
    defaultTab: 'roster',
    tabs: [
      { id: 'roster', label: '선수단 · 타순 · 육성', icon: Users },
      { id: 'analytics', label: '데이터 분석센터', icon: BarChart3 },
    ],
  },
  {
    id: 'frontOffice',
    label: '이적 · 계약',
    section: '프런트 · 전력',
    icon: Briefcase,
    defaultTab: 'contracts',
    tabs: [
      { id: 'contracts', label: '계약 · FA · 트레이드 · 웨이버', icon: Briefcase },
      { id: 'acquisitions', label: '전체 구단 영입 현황', icon: ArrowLeftRight },
      { id: 'offseason', label: '오프시즌 단장실', icon: CalendarDays },
    ],
  },
  {
    id: 'prospects',
    label: '드래프트 · 해외',
    section: '프런트 · 전력',
    icon: Sparkles,
    defaultTab: 'draft',
    tabs: [
      { id: 'draft', label: '드래프트 · 포스팅', icon: Sparkles },
      { id: 'amateur', label: '아마추어 · 해외파 · 제107조', icon: Globe2 },
    ],
  },
  {
    id: 'leagueOps',
    label: '뉴스 · 리그운영',
    section: '리그 · 관리',
    icon: Newspaper,
    defaultTab: 'news',
    tabs: [
      { id: 'news', label: '뉴스 · 사건 · 면담', icon: Newspaper },
      { id: 'hub', label: '퓨처스 · 병역 · 국대', icon: Layers },
      { id: 'leagueLife', label: '은퇴 · 방출 · 군입대', icon: ClipboardCheck },
    ],
  },
  {
    id: 'records',
    label: '시상 · 기록실',
    section: '리그 · 관리',
    icon: Trophy,
    defaultTab: 'awards',
    tabs: [
      { id: 'awards', label: '시상식 · 수상 · 트로피', icon: Trophy },
      { id: 'history', label: '역사 · 트로피 · 유니폼 · 규정', icon: BookOpen },
    ],
  },
  {
    id: 'finances',
    label: '재정 · 세이브',
    section: '리그 · 관리',
    icon: Wallet,
    defaultTab: 'finances',
    tabs: [{ id: 'finances', label: '재정 · 시설 · 세이브', icon: Wallet }],
  },
];

const TAB_TO_GROUP: Record<NavTab, NavGroupItem> = NAV_GROUPS.reduce((acc, grp) => {
  for (const t of grp.tabs) {
    acc[t.id] = grp;
  }
  return acc;
}, {} as Record<NavTab, NavGroupItem>);

const NAV_SECTIONS: NavGroupItem['section'][] = ['구단 · 경기', '프런트 · 전력', '리그 · 관리'];

export const Dashboard: React.FC<DashboardProps> = ({
  career,
  savedCareers = [],
  settings,
  onUpdateCareer,
  onUpdateSettings,
  onImportJson,
  onSaveAsNewSlot,
  onSwitchCareer,
  onRenameCareer,
  onDeleteCareer,
  onExitToTitle,
}) => {
  const [activeTab, setActiveTabState] = useState<NavTab>('home');
  const [lastTabByGroup, setLastTabByGroup] = useState<Partial<Record<NavGroupId, NavTab>>>({});
  const setActiveTab = useCallback((nextTab: NavTab) => {
    setActiveTabState(nextTab);
    const grp = TAB_TO_GROUP[nextTab];
    if (grp) {
      setLastTabByGroup((prev) => (prev[grp.id] === nextTab ? prev : { ...prev, [grp.id]: nextTab }));
    }
  }, []);
  const activeGroup = TAB_TO_GROUP[activeTab] ?? NAV_GROUPS[0];
  const handleSelectNavGroup = useCallback(
    (grp: NavGroupItem) => {
      // 이미 해당 그룹 안에 있으면 기본 탭이 아닌 현재 탭 유지, 외부에서 진입 시 직전 서브탭 또는 상황별 우선 서브탭 진입
      if (activeGroup.id === grp.id) return;
      const remembered = lastTabByGroup[grp.id];
      if (remembered) {
        setActiveTab(remembered);
        return;
      }
      if (grp.id === 'season' && career.phase === 'POSTSEASON') {
        setActiveTab('postseason');
        return;
      }
      if (grp.id === 'frontOffice' && career.phase === 'OFFSEASON') {
        setActiveTab('offseason');
        return;
      }
      setActiveTab(grp.defaultTab);
    },
    [activeGroup.id, career.phase, lastTabByGroup, setActiveTab]
  );
  const [contractsSubTab, setContractsSubTab] = useState<TransactionsSubTab>('contracts');
  const [standingsSubTab, setStandingsSubTab] = useState<'standings' | 'leaders'>('standings');
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'success' | 'error' } | null>(
    null
  );
  const [matchAnimState, setMatchAnimState] = useState<{
    title: string;
    games: GameRecord[];
  } | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [seasonTransition, setSeasonTransition] = useState<{
    fromSeason: number;
    toSeason: number;
  } | null>(null);
  const [eventAnimQueue, setEventAnimQueue] = useState<GameEventAnimationPayload[]>([]);
  const [draftFocusNonce, setDraftFocusNonce] = useState(0);
  const [soundModalOpen, setSoundModalOpen] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => audioManager.getSettings());

  useEffect(() => {
    return audioManager.subscribe((next) => setAudioSettings(next));
  }, []);

  const enqueueEventAnimations = useCallback((items: GameEventAnimationPayload[]) => {
    if (items.length === 0) return;
    setEventAnimQueue((prev) => {
      const existing = new Set(prev.map((x) => x.id));
      const fresh = items.filter((x) => !existing.has(x.id));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }, []);

  /**
   * 이벤트 최종 확정 직후 1회만 애니메이션을 큐에 등록하고,
   * playedAnimations 키를 세이브 데이터에 영구 기록해 새로고침·재로딩 시 재재생을 원천 차단합니다.
   */
  const applyCareerUpdate = useCallback(
    (next: CareerSave, backup?: CareerSave) => {
      const prev = career;
      const sameCareer = prev.careerId === next.careerId;
      const played = new Set(next.playedAnimations ?? prev.playedAnimations ?? []);
      const queued: GameEventAnimationPayload[] = [];
      let shouldOpenSeasonTransition: { fromSeason: number; toSeason: number } | null = null;

      if (sameCareer) {
        // 1. 시즌 전환 애니메이션 (단장 최종 승인 후 1회)
        if (next.season > prev.season) {
          const key = `season-trans-${prev.season}-${next.season}`;
          if (!played.has(key)) {
            played.add(key);
            shouldOpenSeasonTransition = { fromSeason: prev.season, toSeason: next.season };
          }
        }

        // 2. 한국시리즈 우승 애니메이션 (확정 직후 1회)
        const prevChampKey = prev.postseason.championEvent
          ? `${prev.postseason.championEvent.season}-${prev.postseason.championEvent.championTeamId}`
          : prev.postseason.champion
          ? `${prev.season}-${prev.postseason.champion}`
          : null;
        const nextChampEvent = next.postseason.championEvent;
        const nextChampTeam = nextChampEvent?.championTeamId ?? next.postseason.champion;
        const nextChampSeason = nextChampEvent?.season ?? next.season;
        const nextChampKey = nextChampTeam ? `${nextChampSeason}-${nextChampTeam}` : null;
        if (nextChampTeam && nextChampKey && nextChampKey !== prevChampKey) {
          const animKey = `ks-champ-${nextChampKey}`;
          if (!played.has(animKey)) {
            played.add(animKey);
            queued.push({
              id: animKey,
              type: 'KOREAN_SERIES_CHAMPION',
              season: nextChampSeason,
              teamId: nextChampTeam,
              seriesScore: nextChampEvent?.seriesScore ?? '4승',
              ksMvpName: nextChampEvent?.ksMvp?.playerName,
            });
          }
        }

        // 3. MVP·신인왕 & 골든글러브 애니메이션 (공식 시상식 데이터 확정 직후 1회)
        const prevAwardSeasons = new Set((prev.awardsHistory ?? []).map((a) => a.season));
        const newlyAddedAwards = (next.awardsHistory ?? []).filter(
          (a) => !prevAwardSeasons.has(a.season)
        );
        for (const aw of newlyAddedAwards) {
          const mvpKey = `awards-mvp-roy-${aw.season}`;
          if (!played.has(mvpKey) && (aw.mvp || aw.rookieOfYear)) {
            played.add(mvpKey);
            queued.push({
              id: mvpKey,
              type: 'MVP_ROY',
              season: aw.season,
              mvp: aw.mvp,
              rookieOfYear: aw.rookieOfYear,
            });
          }
          const ggKey = `awards-gg-${aw.season}`;
          if (!played.has(ggKey) && aw.goldenGloves.length > 0) {
            played.add(ggKey);
            queued.push({
              id: ggKey,
              type: 'GOLDEN_GLOVE',
              season: aw.season,
              winners: aw.goldenGloves,
            });
          }
        }

        // 4. 주요 선수 은퇴식 애니메이션 (retirementCeremonies에 신규 등재된 주요 선수만 1회)
        const prevCerIds = new Set((prev.retirementCeremonies ?? []).map((c) => c.id));
        const newCeremonies = (next.retirementCeremonies ?? []).filter(
          (c) => !prevCerIds.has(c.id)
        );
        for (const cer of newCeremonies.slice(0, 2)) {
          const retKey = `retire-cer-${cer.season}-${cer.playerId}`;
          if (!played.has(retKey)) {
            played.add(retKey);
            queued.push({
              id: retKey,
              type: 'RETIREMENT_CEREMONY',
              playerName: cer.playerName,
              position: cer.position,
              teamId: cer.teamId,
              careerSummary: cer.careerSummary,
            });
          }
        }

        // 5. FA 대형 계약 애니메이션 (신규 FA 확정 중 총액 40억 이상 또는 연봉 10억 이상)
        const prevAcqIds = new Set((prev.leagueAcquisitions ?? []).map((a) => a.dedupeKey || a.id));
        const newFaAcqs = (next.leagueAcquisitions ?? []).filter(
          (a) => a.category === 'FA' && !prevAcqIds.has(a.dedupeKey || a.id)
        );
        for (const acq of newFaAcqs) {
          const pl = acq.playerId ? next.players[acq.playerId] : undefined;
          const years = Math.max(1, pl?.contract.yearsRemaining ?? 4);
          const annual = pl?.contract.annualSalary ?? 0;
          const parsedBillionMatch = acq.contractAmountLabel.match(/([0-9]+(?:\.[0-9]+)?)\s*억/);
          const parsedTotal = parsedBillionMatch ? parseFloat(parsedBillionMatch[1]) : 0;
          const totalBillion = Math.max(parsedTotal, annual * years);
          const isMegaDeal = totalBillion >= 40 || annual >= 10 || (pl?.ability ?? 0) >= 82;
          if (isMegaDeal) {
            const faKey = `mega-fa-${acq.dedupeKey || acq.id}`;
            if (!played.has(faKey)) {
              played.add(faKey);
              queued.push({
                id: faKey,
                type: 'MEGA_FA_DEAL',
                playerName: acq.playerName,
                position: acq.position ?? pl?.position ?? 'FA',
                teamId: acq.acquiringTeamId,
                years,
                totalBillion: totalBillion > 0 ? totalBillion : Math.max(40, annual * years),
              });
              break;
            }
          }
        }

        // 6. 대형 트레이드 애니메이션 (스타/핵심 주전 능력치 78+ 또는 핵심 선발/상위타선 또는 1R 지명권 포함)
        const prevTxIds = new Set((prev.transactionLogs ?? []).map((t) => t.id));
        const newTradeTx = (next.transactionLogs ?? []).find(
          (t) => t.type === '트레이드' && !prevTxIds.has(t.id)
        );
        if (newTradeTx) {
          const movedPlayers = Object.values(next.players).filter((np) => {
            const pp = prev.players[np.id];
            return (
              pp &&
              pp.teamId !== np.teamId &&
              pp.rosterTier !== 'FA' &&
              np.rosterTier !== 'FA' &&
              pp.teamId in KBO_TEAMS &&
              np.teamId in KBO_TEAMS
            );
          });
          const hasStar = movedPlayers.some((p) => {
            const pp = prev.players[p.id];
            const prevTid = pp?.teamId as TeamId | undefined;
            const prevTeamState = prevTid ? prev.teams[prevTid] : undefined;
            const isCoreStarter =
              Boolean(prevTeamState?.lineupOrder.slice(0, 5).includes(p.id)) ||
              Boolean(prevTeamState?.rotationOrder.slice(0, 2).includes(p.id));
            return p.ability >= 78 || (pp?.ability ?? 0) >= 78 || (isCoreStarter && p.ability >= 74);
          });
          const prevPickCount = (prev.tradedDraftPicks ?? []).length;
          const newFirstRoundPick = (next.tradedDraftPicks ?? [])
            .slice(0, Math.max(0, (next.tradedDraftPicks ?? []).length - prevPickCount))
            .some((pk) => pk.round === 1);
          if ((hasStar || newFirstRoundPick) && movedPlayers.length >= 1) {
            const firstMoved = movedPlayers[0];
            const teamA = prev.players[firstMoved.id].teamId as TeamId;
            const teamB = firstMoved.teamId as TeamId;
            const tradeKey = `blockbuster-trade-${newTradeTx.id}`;
            if (!played.has(tradeKey)) {
              played.add(tradeKey);
              const teamAOut = movedPlayers
                .filter((p) => prev.players[p.id]?.teamId === teamA)
                .map((p) => `${p.name} (${p.position} · OVR ${p.ability})`);
              const teamBOut = movedPlayers
                .filter((p) => prev.players[p.id]?.teamId === teamB)
                .map((p) => `${p.name} (${p.position} · OVR ${p.ability})`);
              queued.push({
                id: tradeKey,
                type: 'BLOCKBUSTER_TRADE',
                teamA,
                teamB,
                teamAOutLabels: teamAOut.length > 0 ? teamAOut : ['지명권 / 패키지'],
                teamBOutLabels: teamBOut.length > 0 ? teamBOut : ['지명권 / 패키지'],
              });
            }
          }
        }

        // 7. 감독 경질 애니메이션 (어느 구단이든 기존 감독이 해임/제거된 경우 1회)
        for (const tid of Object.keys(KBO_TEAMS) as TeamId[]) {
          const prevMgr = (prev.coaches?.[tid] ?? []).find(
            (c) => c.role === '감독' && !c.isActingManager
          );
          if (!prevMgr) continue;
          const stillSameMgr = (next.coaches?.[tid] ?? []).some(
            (c) => c.id === prevMgr.id && c.role === '감독'
          );
          if (!stillSameMgr) {
            const mgrKey = `mgr-change-${next.season}-${tid}-${prevMgr.id}`;
            if (!played.has(mgrKey)) {
              played.add(mgrKey);
              queued.push({
                id: mgrKey,
                type: 'MANAGER_CHANGE',
                teamId: tid,
                dismissedManagerName: prevMgr.name,
              });
              break;
            }
          }
        }

        // 8. 포스트시즌 진출 확정 효과음 (정규시즌 -> 포스트시즌 전환 시 1회)
        if (prev.phase === 'REGULAR_SEASON' && next.phase === 'POSTSEASON') {
          const psKey = `ps-clinch-${next.season}`;
          if (!played.has(psKey)) {
            played.add(psKey);
            const psTeams = next.postseason.standingsSeed ?? [];
            if (psTeams.length === 0 || psTeams.includes(next.playerTeamId)) {
              audioManager.play('postseason_clinch');
            }
          }
        }

        // 8-B. KBO 신인 드래프트 공식 개최일 도달 시 개막 애니메이션 1회 자동 실행 & 드래프트장 자동 이동
        const prevDraftInfo = getRookieDraftScheduleInfo(prev);
        const nextDraftInfo = getRookieDraftScheduleInfo(next);
        const draftOpenKey = `rookie-draft-open-${next.season}-${next.draftState.season}`;
        if (
          !next.draftState.completed &&
          nextDraftInfo.isOpen &&
          !nextDraftInfo.isSpecialOnboardingDraft &&
          (prevDraftInfo.isLockedBeforeDate ||
            (prevDraftInfo.currentDate < nextDraftInfo.scheduledDate &&
              nextDraftInfo.currentDate >= nextDraftInfo.scheduledDate)) &&
          !played.has(draftOpenKey)
        ) {
          played.add(draftOpenKey);
          const firstRoundOrder: TeamId[] = Array.from({ length: 10 }, (_, idx) =>
            getDraftPickingTeamForSlot(next.draftState, 1, idx + 1)
          );
          const playerFirstRoundPickNo = firstRoundOrder.indexOf(next.playerTeamId) + 1;
          const topProspects = [...next.draftState.candidates]
            .filter((c) => !c.draftedBy)
            .sort((a, b) => b.potential * 0.65 + b.ability - (a.potential * 0.65 + a.ability))
            .slice(0, 3)
            .map((c) => ({
              name: c.name,
              position: c.position,
              school: c.school,
              grade: c.scoutGrade ?? 'S',
            }));
          queued.unshift({
            id: draftOpenKey,
            type: 'ROOKIE_DRAFT_OPENING',
            draftSeason: next.draftState.season,
            draftDate: nextDraftInfo.formattedDate,
            playerTeamId: next.playerTeamId,
            playerFirstRoundPickNo,
            firstRoundOrder,
            topProspects,
          });
        }

        // 9. 일반 계약 체결 효과음 (대형 FA 애니메이션이 이미 큐에 없는 확정 계약 체결 시 1회)
        const hasMegaFaQueued = queued.some((q) => q.type === 'MEGA_FA_DEAL');
        if (!hasMegaFaQueued) {
          const prevLogIds = new Set((prev.transactionLogs ?? []).map((t) => t.id));
          const newSignLog = (next.transactionLogs ?? []).find(
            (t) =>
              !prevLogIds.has(t.id) &&
              t.teamId === next.playerTeamId &&
              t.type === '계약' &&
              !t.summary.includes('결렬') &&
              !t.summary.includes('거절') &&
              !t.summary.includes('방출')
          );
          if (newSignLog) {
            audioManager.play('contract_sign');
          }
        }
      }

      const finalNext: CareerSave =
        played.size !== (next.playedAnimations?.length ?? 0)
          ? { ...next, playedAnimations: Array.from(played) }
          : next;

      onUpdateCareer(finalNext, backup);

      if (shouldOpenSeasonTransition) {
        setSeasonTransition(shouldOpenSeasonTransition);
      }
      if (queued.length > 0) {
        enqueueEventAnimations(queued);
      }
    },
    [career, onUpdateCareer, enqueueEventAnimations]
  );

  const [amateurFocus, setAmateurFocus] = useState<{
    subTab: AmateurSubTab;
    overseasId: string | null;
  }>({ subTab: 'prospects', overseasId: null });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleCloseMatchAnim = useCallback(() => {
    setMatchAnimState(null);
  }, []);

  const handleNotify = (msg: string, tone: 'info' | 'success' | 'error' = 'info') => {
    setToast({ text: msg, tone });
  };

  const pendingNewsBadge =
    (career.clubEvents ?? []).filter((e) => !e.resolved).length +
    (career.complaints ?? []).filter((c) => !c.resolved).length +
    (career.coachSwapReports ?? []).filter((r) => !r.applied).length;
  const pendingIncomingTrades = getPendingIncomingTradeOffers(career);
  const activeCoachSwap = (career.coachSwapReports ?? []).find((r) => !r.applied);
  const ownerEval =
    career.ownerEval ?? buildInitialOwnerEval(career.playerTeamId, career.season);
  const liveOwnerReport = useMemo(() => computeLiveOwnerEvaluationReport(career), [career]);
  const fanSentiment = career.teams[career.playerTeamId]?.fanSentiment ?? 65;

  const teamInfo = KBO_TEAMS[career.playerTeamId];
  const standings = computeStandings(career.gamesLedger);
  const myStanding = standings.find((r) => r.teamId === career.playerTeamId);
  const teamState = career.teams[career.playerTeamId];

  const myPlayers = Object.values(career.players).filter(
    (p) => p.teamId === career.playerTeamId && p.rosterTier !== '은퇴' && p.rosterTier !== '해외이적'
  );
  const firstCount = myPlayers.filter((p) => p.rosterTier === '1군').length;
  const futuresCount = myPlayers.filter((p) => p.rosterTier === '2군').length;
  const activeCount = myPlayers.filter((p) => p.rosterTier === '1군' && p.gameDayActive).length;
  const injuredList = myPlayers.filter((p) => Boolean(p.injury));

  const isOnboarding = [
    'INTRO',
    'STAFF',
    'ROSTER_ANALYSIS',
    'REINFORCEMENT',
    'SPECIAL_DRAFT',
    'OPENING_ROSTER',
  ].includes(career.phase);

  const runRegularGameNow = useCallback(
    (sourceCareer: CareerSave) => {
      try {
        setActionError(null);
        const wasDraftLocked = getRookieDraftScheduleInfo(sourceCareer).isLockedBeforeDate;
        const { nextCareer, backupSnapshot } = simulateNextRegularGame(sourceCareer);
        const didDraftJustOpen =
          wasDraftLocked && getRookieDraftScheduleInfo(nextCareer).isOpen;
        applyCareerUpdate(nextCareer, backupSnapshot);
        if (!didDraftJustOpen) {
          const newGames = nextCareer.lastSeriesReport?.playerTeamGames ?? [];
          if (newGames.length > 0) {
            setMatchAnimState({
              title: nextCareer.lastSeriesReport?.title || `${nextCareer.season} 정규시즌 1경기 결과`,
              games: newGames,
            });
          }
          setActiveTab('report');
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : '1경기 진행 오류');
      }
    },
    [applyCareerUpdate, setActiveTab]
  );

  const runRegularSeriesNow = useCallback(
    (sourceCareer: CareerSave) => {
      try {
        setActionError(null);
        const wasDraftLocked = getRookieDraftScheduleInfo(sourceCareer).isLockedBeforeDate;
        const { nextCareer, backupSnapshot } = simulateNextRegularSeries(sourceCareer);
        const didDraftJustOpen =
          wasDraftLocked && getRookieDraftScheduleInfo(nextCareer).isOpen;
        applyCareerUpdate(nextCareer, backupSnapshot);
        if (!didDraftJustOpen) {
          const newGames = nextCareer.lastSeriesReport?.playerTeamGames ?? [];
          if (newGames.length > 0) {
            setMatchAnimState({
              title: nextCareer.lastSeriesReport?.title || `${nextCareer.season} 정규시즌 3연전 결과`,
              games: newGames,
            });
          }
          setActiveTab('report');
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : '경기 진행 오류');
      }
    },
    [applyCareerUpdate, setActiveTab]
  );

  const handleSimulateNextGame = () => {
    runRegularGameNow(career);
  };

  const handleSimulateNextSeries = () => {
    runRegularSeriesNow(career);
  };

  const handleCompleteEventAnim = useCallback(
    (eventId: string) => {
      setEventAnimQueue((prev) => prev.filter((item) => item.id !== eventId));
      if (eventId.startsWith('rookie-draft-open-')) {
        setMatchAnimState(null);
        setDraftFocusNonce((n) => n + 1);
        setActiveTab('draft');
        setToast({
          text: `${career.draftState.season} KBO 신인 드래프트가 공식 개막되었습니다! 지명을 진행해 주세요.`,
          tone: 'success',
        });
      }
    },
    [career.draftState.season, setActiveTab]
  );

  const draftScheduleInfo = useMemo(() => getRookieDraftScheduleInfo(career), [career]);
  const isRookieDraftOpenLive = draftScheduleInfo.isOpen && !career.draftState.completed;
  const offseasonReadiness = useMemo(() => getOffseason8StepReadiness(career), [career]);
  const isAwardsCeremonyPending = career.pendingAwardsCeremonySeason === career.season;

  const handleSimulatePostseason = () => {
    try {
      setActionError(null);
      const { nextCareer, backupSnapshot } = simulateNextPostseasonGame(career);
      applyCareerUpdate(nextCareer, backupSnapshot);
      const latestPsGame = nextCareer.lastSeriesReport?.allGamesInWindow?.[0];
      if (latestPsGame) {
        setMatchAnimState({
          title: nextCareer.lastSeriesReport?.title || `${nextCareer.season} 포스트시즌 경기 결과`,
          games: [latestPsGame],
        });
      }
      if (
        nextCareer.phase === 'OFFSEASON' &&
        nextCareer.pendingAwardsCeremonySeason === nextCareer.season
      ) {
        setActiveTab('awards');
      } else {
        setActiveTab('postseason');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '포스트시즌 진행 오류');
    }
  };

  const handleAcknowledgeChampion = () => {
    const nextCareer = acknowledgeChampionEvent(career);
    applyCareerUpdate(nextCareer);
    if (nextCareer.pendingAwardsCeremonySeason === nextCareer.season) {
      setActiveTab('awards');
    }
  };

  const handleOpenStep8Approval = () => {
    if (career.pendingAwardsCeremonySeason === career.season) {
      setActiveTab('awards');
      handleNotify(
        `${career.season} KBO 공식 시상식을 먼저 확인 완료한 뒤 오프시즌 단장실로 이동해 주세요.`,
        'info'
      );
      return;
    }
    try {
      setActionError(null);
      const { nextCareer, backupSnapshot } = completeAndAdvanceOffseason8Step(
        career,
        'NEXT_SEASON_START'
      );
      applyCareerUpdate(nextCareer, backupSnapshot);
      setActiveTab('offseason');
      handleNotify(
        `오프시즌 단장실 8단계 [다음 시즌 시작]으로 이동했습니다. 필수 업무 완료 후 단장 개막 승인 버튼을 눌러 ${career.season + 1}시즌을 시작하세요.`,
        'info'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '오프시즌 단계 이동 오류';
      setActionError(msg);
      handleNotify(msg, 'error');
    }
  };

  const handleQuickApplyCoachSwap = (reportId: string) => {
    try {
      const { nextCareer, backupSnapshot } = applyCoachSwapRecommendation(career, reportId);
      applyCareerUpdate(nextCareer, backupSnapshot);
      handleNotify('코치 추천 로스터 교체를 즉시 적용했습니다.', 'success');
    } catch (err) {
      handleNotify(err instanceof Error ? err.message : '교체 적용 실패', 'error');
    }
  };

  const handleOffseasonStepClick = (step: OffseasonStep) => {
    try {
      const { nextCareer, backupSnapshot } = advanceOffseasonStep(career, step);
      applyCareerUpdate(nextCareer, backupSnapshot);
      if (step === 'AWARDS_AND_EVAL') setActiveTab('draft');
      else if (step === 'DOMESTIC_CONTRACTS') {
        setContractsSubTab('contracts');
        setActiveTab('contracts');
      } else if (step === 'FOREIGN_MARKET') {
        setContractsSubTab('foreign');
        setActiveTab('contracts');
      } else if (step === 'ROOKIE_DRAFT') {
        setActiveTab('draft');
      }
    } catch (err) {
      handleNotify(err instanceof Error ? err.message : '오프시즌 단계 전환 실패', 'error');
    }
  };

  const handleRecommendationClick = (rec: GmRecommendationItem) => {
    if (rec.targetTab === 'transactions') {
      setContractsSubTab(rec.id === 'rec-foreign-slot' ? 'foreign' : 'contracts');
      setActiveTab('contracts');
    } else if (rec.targetTab === 'reports') {
      setActiveTab('report');
    } else if (rec.targetTab === 'leaders') {
      setStandingsSubTab('leaders');
      setActiveTab('standings');
    } else {
      if (rec.targetTab === 'standings') setStandingsSubTab('standings');
      setActiveTab(rec.targetTab);
    }
  };

  const nextSeries = career.schedule[career.currentSeriesIndex];
  const nextOpponentMatch = nextSeries?.matchups.find(
    (m) => m.away === career.playerTeamId || m.home === career.playerTeamId
  );
  const nextOpponent = nextOpponentMatch
    ? nextOpponentMatch.away === career.playerTeamId
      ? `${nextOpponentMatch.home} (원정)`
      : `${nextOpponentMatch.away} (홈)`
    : null;
  const nextOpponentTeamId = nextOpponentMatch
    ? nextOpponentMatch.away === career.playerTeamId
      ? nextOpponentMatch.home
      : nextOpponentMatch.away
    : null;
  const myNextStarterId =
    teamState.rotationOrder.length > 0
      ? teamState.rotationOrder[teamState.nextStarterIdx % teamState.rotationOrder.length]
      : null;
  const oppNextStarterId =
    nextOpponentTeamId && career.teams[nextOpponentTeamId]?.rotationOrder.length > 0
      ? career.teams[nextOpponentTeamId].rotationOrder[
          career.teams[nextOpponentTeamId].nextStarterIdx %
            career.teams[nextOpponentTeamId].rotationOrder.length
        ]
      : null;
  const myNextStarter = myNextStarterId ? career.players[myNextStarterId] : null;
  const oppNextStarter = oppNextStarterId ? career.players[oppNextStarterId] : null;
  const nextRivalryProfile =
    career.phase === 'REGULAR_SEASON' && nextOpponentTeamId
      ? getRivalryEffectProfile(career, career.playerTeamId, nextOpponentTeamId)
      : null;
  const myRivalries = getTeamRivalries(career, career.playerTeamId);

  const gmRecommendations = !isOnboarding ? getClubGmRecommendations(career) : [];
  const nationalDutyMyPlayers = myPlayers.filter((p) =>
    isPlayerOnNationalTeamDuty(p, career.gamesPlayed)
  );
  const managerPreGameRec =
    !isOnboarding && career.phase === 'REGULAR_SEASON' && career.gamesPlayed < career.totalRegularGames
      ? getManagerPreGameRecommendation(career)
      : null;
  const coachFormRecs =
    !isOnboarding && career.phase === 'REGULAR_SEASON'
      ? getCoachFormLineupRecommendations(career)
      : [];
  const coachDevAdvice =
    !isOnboarding && (career.gamesPlayed <= 12 || career.phase === 'OFFSEASON')
      ? getCoachDevelopmentalRecommendations(career)
      : null;
  const championHistory = normalizeChampionHistory(career.championHistory);
  const latestSimulatedChampion = championHistory.find((c) => !c.isHistoricalBaseline);
  const defendingBaselineChampion = championHistory.find((c) => c.isHistoricalBaseline);
  const activeChampionEvent =
    career.postseason.championEvent && !career.postseason.championEvent.acknowledged
      ? career.postseason.championEvent
      : null;

  const currentCalendarDate = getCurrentCareerDate(career);
  const tradeWindow = useMemo(() => getTradeWindowStatus(career), [career]);
  const myTeamObj = career.teams[career.playerTeamId];
  const actingCaptainPlayer = myTeamObj?.leadership?.actingCaptainPlayerId
    ? career.players[myTeamObj.leadership.actingCaptainPlayerId]
    : null;
  const actingManagerCoach = (career.coaches?.[career.playerTeamId] ?? []).find(
    (c) => c.role === '감독' && c.isActingManager
  );

  return (
    <div className="min-h-screen bg-slate-100/80 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Club Color Identity Accent Stripe (#4) */}
      <div className="h-1 w-full team-banner-grad shrink-0" />
      {/* 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 h-15 border-b border-slate-200/90 dark:border-slate-800/90 bg-white/92 dark:bg-slate-900/92 backdrop-blur-md shadow-[0_1px_8px_rgba(15,23,42,0.04)] dark:shadow-[0_1px_12px_rgba(0,0,0,0.35)] px-4 flex items-center justify-between gap-3">
        {/* Left: In-Game Date + Team & Save Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/70 shrink-0"
            title={`${currentCalendarDate.koreanFullDate} · ${currentCalendarDate.phaseLabel}`}
          >
            <CalendarDays className="w-3.5 h-3.5 team-accent-text shrink-0" />
            <div className="leading-tight">
              <div className="text-[11px] font-extrabold font-mono-stats text-slate-900 dark:text-white tracking-tight">
                {currentCalendarDate.displayDate}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {currentCalendarDate.phaseLabel}
              </div>
            </div>
          </div>

          <TeamLogo teamId={career.playerTeamId} size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-extrabold truncate flex items-center gap-1.5 tracking-tight">
              <span>{teamInfo.name}</span>
              <span className="text-[11px] font-mono-stats font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {career.season}
              </span>
              {actingManagerCoach && (
                <span className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  감독대행 {actingManagerCoach.name}
                </span>
              )}
              {actingCaptainPlayer && (
                <span className="hidden md:inline text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                  임시주장 {actingCaptainPlayer.name}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-stats truncate flex items-center gap-1.5 mt-0.5">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {myStanding?.wins ?? 0}승 {myStanding?.losses ?? 0}패
                {myStanding && myStanding.draws > 0 ? ` ${myStanding.draws}무` : ''}
              </span>
              <span className="opacity-40">·</span>
              <span>{career.gamesPlayed}/{career.totalRegularGames}G</span>
              <span className="opacity-40">·</span>
              <span className="font-semibold team-accent-text">
                {myStanding?.games ? `리그 ${myStanding.isTied ? '공동 ' : ''}${myStanding.rank}위` : '개막 대기'}
              </span>
            </div>
          </div>
        </div>

        {/* Center/Right: Primary Advance CTA + Utility Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {career.phase === 'REGULAR_SEASON' && career.gamesPlayed < career.totalRegularGames && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSimulateNextGame}
                className="px-3 py-1.5 text-xs font-bold rounded border team-accent-border team-accent-text team-accent-soft flex items-center gap-1 transition-colors"
                title="정규시즌 1경기씩 진행"
              >
                <Play className="w-3 h-3" />
                <span>1경기 진행</span>
              </button>
              <button
                type="button"
                onClick={handleSimulateNextSeries}
                className="px-3.5 py-1.5 text-xs font-bold rounded team-accent-bg flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>다음 3연전 진행</span>
              </button>
            </div>
          )}
          {career.phase === 'REGULAR_SEASON' && career.gamesPlayed >= career.totalRegularGames && (
            <button
              type="button"
              onClick={handleSimulateNextGame}
              className="px-3.5 py-1.5 text-xs font-bold rounded team-accent-bg flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>정규시즌 마감 · 포스트시즌 진입</span>
            </button>
          )}
          {career.phase === 'POSTSEASON' && career.postseason.currentSeries && (
            <button
              type="button"
              onClick={handleSimulatePostseason}
              className="px-3.5 py-1.5 text-xs font-bold rounded team-accent-btn flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>PS 1경기 진행</span>
            </button>
          )}
          {career.phase === 'OFFSEASON' && (
            <div className="flex items-center gap-1.5">
              {isAwardsCeremonyPending ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('awards')}
                  className="px-3.5 py-1.5 text-xs font-black rounded bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>{career.season} KBO 시상식 입장</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab('offseason')}
                    className="px-2.5 py-1.5 text-xs font-bold rounded border team-accent-border team-accent-text team-accent-soft flex items-center gap-1 transition-colors"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>
                      오프시즌 단장실 ({offseasonReadiness.requiredCompletedCount}/{offseasonReadiness.requiredTotalCount})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenStep8Approval}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-colors ${
                      offseasonReadiness.canApproveNextSeason
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                    }`}
                    title={
                      offseasonReadiness.canApproveNextSeason
                        ? '모든 필수 오프시즌 업무 완료 — 다음 시즌 개막 승인 가능'
                        : '모든 필수 오프시즌 업무를 완료해야 다음 시즌을 개막할 수 있습니다'
                    }
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>{career.season + 1}시즌 개막 승인</span>
                  </button>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
            title="전체 구단 선수 통합 검색 (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span className="hidden md:inline">선수 검색</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const ok = saveCareer(career);
              const now = new Date();
              const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              handleNotify(
                ok
                  ? `현재 커리어 [${career.label}]를 즉시 저장했습니다 (${hhmm}).`
                  : '브라우저 저장 공간이 부족합니다. 오래된 슬롯을 정리해 주세요.',
                ok ? 'success' : 'error'
              );
            }}
            className="px-2.5 py-1.5 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
            title="즉시 빠른 저장"
          >
            <Save className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden md:inline">빠른 저장</span>
          </button>

          <button
            type="button"
            data-no-click-sound="true"
            onClick={() => {
              const next = audioManager.toggleMasterMute();
              if (next.masterEnabled) {
                audioManager.unlockAudio();
                audioManager.play('button_click', { force: true });
              }
            }}
            className="p-2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            title={audioSettings.masterEnabled ? '사운드 음소거 (우측 설정에서 음량 조절)' : '사운드 켜기'}
            aria-label={audioSettings.masterEnabled ? '사운드 음소거' : '사운드 켜기'}
          >
            {audioSettings.masterEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setSoundModalOpen(true)}
            className="px-2 py-1.5 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hidden sm:inline-flex items-center gap-1"
            title="사운드 환경설정 및 미리 듣기"
          >
            <span>사운드</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                ...settings,
                theme: settings.theme === 'dark' ? 'light' : 'dark',
              })
            }
            className="p-2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="테마 전환"
          >
            {settings.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onExitToTitle}
            className="px-2.5 py-1.5 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
            title="타이틀 화면으로"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">시작 화면</span>
          </button>
        </div>
      </header>

      {/* Mobile Horizontal Grouped Nav (8 Clean Main Menus) */}
      <nav className="lg:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <div className="flex px-2 py-1.5 gap-1 min-w-max">
          {NAV_GROUPS.map((grp) => {
            const Icon = grp.icon;
            const active = activeGroup.id === grp.id;
            const groupBadge =
              grp.id === 'prospects' && isRookieDraftOpenLive
                ? '개막'
                : grp.id === 'records' && isAwardsCeremonyPending
                  ? '진행'
                  : grp.id === 'frontOffice' && career.phase === 'OFFSEASON'
                    ? `${offseasonReadiness.requiredCompletedCount}/${offseasonReadiness.requiredTotalCount}`
                    : grp.id === 'frontOffice' && pendingIncomingTrades.length > 0
                      ? String(pendingIncomingTrades.length)
                      : grp.id === 'leagueOps' && pendingNewsBadge > 0
                        ? String(pendingNewsBadge)
                        : null;
            return (
              <button
                key={grp.id}
                type="button"
                onClick={() => handleSelectNavGroup(grp)}
                className={`px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap inline-flex items-center gap-1.5 ${
                  active
                    ? 'team-accent-bg'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{grp.label}</span>
                {groupBadge && (
                  <span
                    className={`px-1 py-0.2 rounded text-[10px] font-mono-stats font-bold ${
                      active ? 'bg-white/25 text-white' : 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
                    }`}
                  >
                    {groupBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Layout: Compact 8-Group Sidebar + Work Canvas */}
      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3 space-y-3">
          {NAV_SECTIONS.map((sec) => {
            const groupsInSec = NAV_GROUPS.filter((g) => g.section === sec);
            return (
              <div key={sec} className="space-y-1">
                <div className="px-2.5 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                  {sec}
                </div>
                {groupsInSec.map((grp) => {
                  const Icon = grp.icon;
                  const active = activeGroup.id === grp.id;
                  const subCount = grp.tabs.length;
                  return (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => handleSelectNavGroup(grp)}
                      title={subCount > 1 ? grp.tabs.map((t) => t.label).join(' · ') : grp.label}
                      className={`w-full px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
                        active
                          ? 'team-accent-bg shadow-xs'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{grp.label}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {grp.id === 'season' && career.phase === 'POSTSEASON' && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              active ? 'bg-white/25 text-white' : 'bg-amber-500 text-slate-950'
                            }`}
                          >
                            PS
                          </span>
                        )}
                        {grp.id === 'prospects' && isRookieDraftOpenLive && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold animate-pulse ${
                              active ? 'bg-white/25 text-white' : 'bg-emerald-500 text-white'
                            }`}
                          >
                            개막
                          </span>
                        )}
                        {grp.id === 'records' && isAwardsCeremonyPending && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              active ? 'bg-white/25 text-white' : 'bg-amber-500 text-slate-950'
                            }`}
                          >
                            진행
                          </span>
                        )}
                        {grp.id === 'frontOffice' && career.phase === 'OFFSEASON' && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-stats font-bold ${
                              active
                                ? 'bg-white/25 text-white'
                                : offseasonReadiness.canApproveNextSeason
                                  ? 'bg-emerald-600 text-white'
                                  : 'team-accent-badge'
                            }`}
                          >
                            {offseasonReadiness.requiredCompletedCount}/{offseasonReadiness.requiredTotalCount}
                          </span>
                        )}
                        {grp.id === 'frontOffice' && pendingIncomingTrades.length > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-stats font-bold ${
                              active ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'
                            }`}
                          >
                            {pendingIncomingTrades.length}
                          </span>
                        )}
                        {grp.id === 'leagueOps' && pendingNewsBadge > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-stats font-bold ${
                              active ? 'bg-white/20 text-white' : 'team-accent-bg'
                            }`}
                          >
                            {pendingNewsBadge}
                          </span>
                        )}
                        {subCount > 1 && (
                          <span
                            className={`text-[10px] font-mono-stats ${
                              active ? 'text-white/75' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {subCount}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Compact Coaching Staff & Status Footer in Sidebar */}
          <div className="mt-auto pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 text-[11px] space-y-1.5 text-slate-500 dark:text-slate-400">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/70 dark:border-slate-800/80">
                <span className="font-bold text-slate-800 dark:text-slate-200">코칭스태프</span>
                <button
                  type="button"
                  onClick={() => {
                    setContractsSubTab('coaches');
                    setActiveTab('contracts');
                  }}
                  className="text-[10px] font-bold team-accent-text hover:underline"
                >
                  영입·해지
                </button>
              </div>
              {COACH_ROLES.map((role) => {
                const found = (career.coaches[career.playerTeamId] ?? []).find((c) => c.role === role);
                return (
                  <div key={role} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          found ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                      <span className="truncate">{role}</span>
                    </span>
                    <span
                      className={
                        found
                          ? 'font-semibold text-slate-700 dark:text-slate-200 shrink-0'
                          : 'font-bold text-amber-600 dark:text-amber-400 shrink-0'
                      }
                    >
                      {found ? found.name : '공석'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 min-w-0 space-y-4">
          {/* Unified Sub-Tab Bar for Grouped Menus */}
          {activeGroup.tabs.length > 1 && (
            <div className="gm-subtab-bar flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {activeGroup.tabs.map((sub) => {
                  const SubIcon = sub.icon;
                  const isSubActive = activeTab === sub.id;
                  const subBadge =
                    sub.id === 'awards' && isAwardsCeremonyPending
                      ? { text: '진행', cls: isSubActive ? 'bg-white/25 text-white' : 'bg-amber-500 text-slate-950' }
                      : sub.id === 'offseason' && career.phase === 'OFFSEASON'
                        ? {
                            text: `${offseasonReadiness.requiredCompletedCount}/${offseasonReadiness.requiredTotalCount}`,
                            cls: isSubActive
                              ? 'bg-white/25 text-white'
                              : offseasonReadiness.canApproveNextSeason
                                ? 'bg-emerald-600 text-white'
                                : 'team-accent-badge',
                          }
                        : sub.id === 'contracts' && pendingIncomingTrades.length > 0
                          ? { text: String(pendingIncomingTrades.length), cls: isSubActive ? 'bg-white/25 text-white' : 'bg-indigo-600 text-white' }
                          : sub.id === 'news' && pendingNewsBadge > 0
                            ? { text: String(pendingNewsBadge), cls: isSubActive ? 'bg-white/25 text-white' : 'team-accent-bg' }
                            : null;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setActiveTab(sub.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                        isSubActive
                          ? 'team-accent-bg shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <SubIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{sub.label}</span>
                      {subBadge && (
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono-stats font-bold ${subBadge.cls}`}>
                          {subBadge.text}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 pr-1.5">
                <span>{activeGroup.section}</span>
                <span className="opacity-50">/</span>
                <span className="text-slate-600 dark:text-slate-300">{activeGroup.label}</span>
              </span>
            </div>
          )}

          {actionError && (
            <div className="p-3 rounded border border-red-500/40 bg-red-500/10 text-xs font-medium text-red-600 dark:text-red-400">
              {actionError}
            </div>
          )}

          {career.phase === 'REGULAR_SEASON' && tradeWindow.isOpen && tradeWindow.isDeadlineWeek && (
            <div
              className={`px-3.5 py-2.5 rounded border text-xs flex flex-wrap items-center justify-between gap-2 ${
                tradeWindow.daysUntilDeadline === 0
                  ? 'border-rose-500/60 bg-rose-50/80 dark:bg-rose-950/35 text-rose-900 dark:text-rose-200'
                  : (tradeWindow.daysUntilDeadline ?? 99) <= 3
                  ? 'border-amber-500/60 bg-amber-50/80 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200'
                  : 'border-orange-500/45 bg-orange-50/70 dark:bg-orange-950/25 text-orange-900 dark:text-orange-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0" />
                <span>
                  <strong>
                    {tradeWindow.daysUntilDeadline === 0
                      ? `KBO 트레이드 마감 당일 (D-Day · ${tradeWindow.deadlineIsoDate})`
                      : `KBO 트레이드 마감 D-${tradeWindow.daysUntilDeadline} (${tradeWindow.deadlineIsoDate})`}
                  </strong>{' '}
                  — 8월 1일부터 한국시리즈 종료일까지 트레이드 금지 기간이 적용되며, 미체결 제안은 자동 취소됩니다.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setContractsSubTab('trade');
                  setActiveTab('contracts');
                }}
                className="px-3 py-1 rounded team-accent-bg font-bold whitespace-nowrap"
              >
                트레이드 센터 바로가기 →
              </button>
            </div>
          )}

          {pendingIncomingTrades.length > 0 && activeTab !== 'contracts' && (
            <div className="px-3.5 py-2.5 rounded border border-indigo-500/40 bg-indigo-50/70 dark:bg-indigo-950/30 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="text-indigo-900 dark:text-indigo-200">
                <strong>타 구단 트레이드 제안 {pendingIncomingTrades.length}건 도착:</strong>{' '}
                {pendingIncomingTrades
                  .map((o) => KBO_TEAMS[o.fromTeamId].shortName)
                  .join(' · ')}{' '}
                단장실에서 공식 트레이드 요청서를 보냈습니다.
              </div>
              <button
                type="button"
                onClick={() => {
                  setContractsSubTab('trade');
                  setActiveTab('contracts');
                }}
                className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold whitespace-nowrap"
              >
                트레이드 제안 확인 →
              </button>
            </div>
          )}

          {toast && (
            <div
              className={`px-3.5 py-2.5 rounded border text-xs font-medium flex items-center justify-between gap-3 ${
                toast.tone === 'error'
                  ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                  : toast.tone === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
              }`}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-[11px] font-semibold opacity-70 hover:opacity-100"
              >
                닫기
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
          {activeTab === 'home' && (
            <div className="space-y-4">
              {isOnboarding ? (
                <OnboardingFlow
                  career={career}
                  onUpdateCareer={onUpdateCareer}
                  onOpenSectionTab={(t) => setActiveTab(t)}
                />
              ) : (
                <>
                  {/* Club Executive Hero Briefing Banner */}
                  <div className="gm-hero-banner px-5 py-4">
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="p-1.5 rounded-xl bg-white/95 shadow-md shrink-0">
                          <TeamLogo teamId={career.playerTeamId} size="md" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/85">
                            <span className="px-2 py-0.5 rounded-full bg-black/25 backdrop-blur-xs">
                              {career.season} KBO 리그 · {currentCalendarDate.phaseLabel}
                            </span>
                            <span>{career.gmName} 단장실</span>
                            <span>·</span>
                            <span className="font-mono-stats">난이도 {career.difficulty ?? '어려움'}</span>
                          </div>
                          <h1 className="text-lg sm:text-xl font-black tracking-tight text-white mt-0.5 truncate">
                            {teamInfo.name} 프런트 브리핑
                          </h1>
                          <div className="mt-1.5 flex items-center gap-2.5 max-w-md">
                            <div className="flex-1 h-1.5 rounded-full bg-black/25 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-white/90 transition-all duration-500"
                                style={{
                                  width: `${Math.min(100, Math.round((career.gamesPlayed / Math.max(1, career.totalRegularGames)) * 100))}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-mono-stats font-bold text-white/90 shrink-0">
                              정규시즌 {career.gamesPlayed}/{career.totalRegularGames}G (
                              {Math.round((career.gamesPlayed / Math.max(1, career.totalRegularGames)) * 100)}%)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveTab('roster')}
                          className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-bold transition-colors"
                        >
                          선수단 · 타순
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('analytics')}
                          className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-bold transition-colors"
                        >
                          데이터 분석실
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('contracts')}
                          className="px-3 py-1.5 rounded-lg bg-white text-slate-900 hover:bg-white/90 text-xs font-extrabold shadow-sm transition-colors"
                        >
                          FA · 트레이드
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Executive Club Home KPI Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="gm-kpi-card p-4">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5 team-accent-text" />
                          <span>시즌 성적 · 순위</span>
                        </span>
                        <span className="text-[10px] font-mono-stats font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {myStanding?.games ? `${myStanding.isTied ? '공동 ' : ''}${myStanding.rank}위` : '대기'}
                        </span>
                      </div>
                      <div className="text-xl font-black font-mono-stats mt-2 tracking-tight text-slate-900 dark:text-white">
                        {myStanding?.wins ?? 0}승 {myStanding?.losses ?? 0}패
                        {myStanding && myStanding.draws > 0 ? ` ${myStanding.draws}무` : ''}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-stats">
                        {myStanding?.games
                          ? `승률 ${myStanding.pct.toFixed(3)} · 승차 ${myStanding.gb === 0 ? '선두' : myStanding.gb.toFixed(1)}`
                          : '0/144경기 (개막 준비)'}
                      </div>
                    </div>

                    <div className="gm-kpi-card p-4">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                          <span>1군 · 2군 엔트리</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('roster')}
                          className="text-[11px] font-bold team-accent-text hover:underline"
                        >
                          콜업·강등
                        </button>
                      </div>
                      <div className="text-xl font-black font-mono-stats mt-2 tracking-tight text-slate-900 dark:text-white">
                        1군 {firstCount}인 <span className="text-sm font-bold text-slate-400">· 2군 {futuresCount}인</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                        <span>출장 {activeCount}인</span>
                        <span className="opacity-40">·</span>
                        <span className={injuredList.length > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>
                          부상 {injuredList.length}명
                        </span>
                        <span className="opacity-40">·</span>
                        <span>사기 {teamState.atmosphere}</span>
                      </div>
                    </div>

                    <div className="gm-kpi-card p-4">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold flex items-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>구단 보유 현금</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('finances')}
                          className="text-[11px] font-bold team-accent-text hover:underline"
                        >
                          투자·스폰서
                        </button>
                      </div>
                      <div className="text-xl font-black font-mono-stats mt-2 tracking-tight text-emerald-700 dark:text-emerald-400">
                        {career.finances.cashBalanceBillion === null
                          ? '자금 미편성'
                          : `${career.finances.cashBalanceBillion.toFixed(2)}억 원`}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate font-mono-stats">
                        {career.finances.sponsor ? (
                          <span className={career.finances.sponsor.status === '만료' ? 'text-red-600 dark:text-red-400 font-bold' : ''}>
                            {career.finances.sponsor.name}
                            {career.finances.sponsor.status === '만료'
                              ? ' (만료·재계약)'
                              : ` (${career.finances.sponsor.yearsRemaining ?? career.finances.sponsor.contractYears ?? 1}년)`}
                          </span>
                        ) : (
                          '스폰서 미계약'
                        )}{' '}
                        · 미지급 {career.finances.krwUnpaidBillion.toFixed(1)}억
                      </div>
                    </div>

                    <div className="gm-kpi-card p-4 flex flex-col justify-between">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 team-accent-text" />
                          <span>다음 경기 일정</span>
                        </div>
                        <div className="text-base font-black tracking-tight mt-1.5 text-slate-900 dark:text-white">
                          {career.phase === 'POSTSEASON' && career.postseason.currentSeries
                            ? career.postseason.currentSeries.label
                            : career.phase === 'OFFSEASON'
                            ? '시즌 종료 · 시상식/차기시즌 대기'
                            : nextOpponent
                            ? `${nextOpponent} 3연전`
                            : '정규시즌 완료'}
                        </div>
                        {career.phase === 'REGULAR_SEASON' && myNextStarter && oppNextStarter && (
                          <div className="text-[11px] text-slate-500 font-mono-stats mt-0.5 truncate">
                            예고 선발: {myNextStarter.name}({myNextStarter.ability}) vs {oppNextStarter.name}({oppNextStarter.ability})
                          </div>
                        )}
                        {nextRivalryProfile && (
                          <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1 truncate">
                            <Flame className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {nextRivalryProfile.rivalry.name} · 열기{' '}
                              <span className="font-mono-stats">{nextRivalryProfile.rivalry.intensity}</span> · 투지 +
                              <span className="font-mono-stats">{nextRivalryProfile.spiritPowerBonus.toFixed(1)}</span> · 관중 +
                              <span className="font-mono-stats">
                                {Math.round((nextRivalryProfile.attendanceMult - 1) * 100)}%
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                      {career.phase === 'REGULAR_SEASON' && career.gamesPlayed < career.totalRegularGames && (
                        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={handleSimulateNextGame}
                            className="py-1.5 rounded-lg team-accent-outline text-xs font-bold flex items-center justify-center gap-1"
                          >
                            <Play className="w-3 h-3" />
                            <span>1경기 진행</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleSimulateNextSeries}
                            className="py-1.5 rounded-lg team-accent-btn text-xs font-bold flex items-center justify-center gap-1"
                          >
                            <CalendarDays className="w-3.5 h-3.5" />
                            <span>3연전 진행</span>
                          </button>
                        </div>
                      )}
                      {career.phase === 'POSTSEASON' && career.postseason.currentSeries && (
                        <button
                          type="button"
                          onClick={handleSimulatePostseason}
                          className="mt-2.5 w-full py-1.5 rounded-lg team-accent-btn text-xs font-bold"
                        >
                          포스트시즌 1경기 진행
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Owner Goal · Fan Sentiment · Coach Live Condition Strip */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="gm-card px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>구단주 목표 · 신뢰도</span>
                        </div>
                        <div className="font-bold truncate mt-0.5">
                          {ownerEval.targetRankLabel} · 평가{' '}
                          <span className="font-mono-stats team-accent-text">
                            {liveOwnerReport.projectedGrade}({liveOwnerReport.totalScore}점)
                          </span>{' '}
                          · 신뢰 <span className="font-mono-stats">{ownerEval.ownerTrust}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              ownerEval.ownerTrust >= 70
                                ? 'bg-emerald-500'
                                : ownerEval.ownerTrust >= 45
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.max(4, Math.min(100, ownerEval.ownerTrust))}%` }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('news')}
                        className="text-[11px] font-bold team-accent-text hover:underline shrink-0"
                      >
                        평가·이직
                      </button>
                    </div>

                    <div className="gm-card px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Heart className="w-3.5 h-3.5 text-rose-500" />
                          <span>팬 여론 · 티켓 정책</span>
                        </div>
                        <div className="font-bold truncate mt-0.5">
                          여론 <span className="font-mono-stats">{fanSentiment}/100</span> · 티켓{' '}
                          {career.finances.ticketPricePolicy ?? '표준'}
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              fanSentiment >= 70
                                ? 'bg-rose-500'
                                : fanSentiment >= 45
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400'
                            }`}
                            style={{ width: `${Math.max(4, Math.min(100, fanSentiment))}%` }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('finances')}
                        className="text-[11px] font-bold team-accent-text hover:underline shrink-0"
                      >
                        가격조정
                      </button>
                    </div>

                    <div className="gm-card px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <ClipboardCheck className="w-3.5 h-3.5 team-accent-text" />
                          <span>코칭스태프 실시간 보고</span>
                        </div>
                        {activeCoachSwap ? (
                          <div className="font-bold truncate mt-0.5 text-amber-700 dark:text-amber-300">
                            {activeCoachSwap.slumpingPlayerName} → {activeCoachSwap.recommendedPlayerName} 교체 건의
                          </div>
                        ) : (
                          <div className="font-semibold text-slate-600 dark:text-slate-300 truncate mt-0.5">
                            {pendingNewsBadge > 0
                              ? `미확인 사건·면담 ${pendingNewsBadge}건 대기`
                              : '전원 컨디션 정상 · 특이사항 없음'}
                          </div>
                        )}
                      </div>
                      {activeCoachSwap ? (
                        <button
                          type="button"
                          onClick={() => handleQuickApplyCoachSwap(activeCoachSwap.id)}
                          className="px-2.5 py-1 rounded-lg team-accent-btn text-[11px] font-bold shrink-0"
                        >
                          추천 교체
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveTab('news')}
                          className="text-[11px] font-bold team-accent-text hover:underline shrink-0"
                        >
                          보고함
                        </button>
                      )}
                    </div>
                  </div>

                  {/* #5: National Team Active Call-Up Banner */}
                  {nationalDutyMyPlayers.length > 0 && (
                    <div className="border border-blue-500/50 bg-blue-500/10 rounded-md p-3.5 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-extrabold text-blue-800 dark:text-blue-200">
                          🇰🇷 국가대표 소집 진행 중 ({nationalDutyMyPlayers[0].nationalTeamDuty?.tournamentName}) — 소속 {nationalDutyMyPlayers.length}명 정규시즌 출장 제외
                        </div>
                        <span className="font-mono-stats font-bold text-blue-700 dark:text-blue-300">
                          R{nationalDutyMyPlayers[0].nationalTeamDuty?.endRound} 종료 후 자동 복귀
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {nationalDutyMyPlayers.map((np) => (
                          <span
                            key={np.id}
                            className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-blue-400/50 font-bold text-blue-800 dark:text-blue-200"
                          >
                            🇰🇷 {np.name} ({np.position} · 잔여 {Math.max(0, (np.nationalTeamDuty?.endRound ?? 0) - career.gamesPlayed)}G)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* #11 & #8: Pre-Game Manager Lineup/Rotation Recommendation + Coach Form Alert */}
                  {managerPreGameRec && (
                    <div className="border team-accent-border bg-white dark:bg-slate-900 rounded-md p-4 space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-extrabold team-accent-text flex items-center gap-1.5">
                          <ClipboardCheck className="w-4 h-4" />
                          <span>
                            경기 전 {managerPreGameRec.managerName} 감독 타순 · 선발 로테이션 추천
                            {coachFormRecs.length > 0 ? ` · 코치 폼 교체 ${coachFormRecs.length}건` : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {coachFormRecs.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const { nextCareer, appliedCount } = applyAllCoachFormRecommendations(career);
                                onUpdateCareer(nextCareer);
                                handleNotify(`코치 폼 기반 선발 교체 ${appliedCount}건을 일괄 적용했습니다.`, 'success');
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]"
                            >
                              폼 추천 교체 ({coachFormRecs.length}건)
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateCareer(applyManagerPreGameRecommendation(career, 'lineup'));
                              handleNotify(`${managerPreGameRec.managerName} 감독 추천 타순을 적용했습니다.`, 'success');
                            }}
                            className="px-2.5 py-1 rounded team-accent-outline font-bold text-[11px]"
                          >
                            타순 적용
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateCareer(applyManagerPreGameRecommendation(career, 'rotation'));
                              handleNotify(`${managerPreGameRec.managerName} 감독 추천 선발 로테이션을 적용했습니다.`, 'success');
                            }}
                            className="px-2.5 py-1 rounded team-accent-outline font-bold text-[11px]"
                          >
                            선발 적용
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateCareer(applyManagerPreGameRecommendation(career, 'both'));
                              handleNotify(`${managerPreGameRec.managerName} 감독 추천 타순·선발을 일괄 적용했습니다.`, 'success');
                            }}
                            className="px-3 py-1 rounded team-accent-btn font-bold text-[11px]"
                          >
                            감독 추천 일괄 적용
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">{managerPreGameRec.briefing}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {managerPreGameRec.recommendedLineup.map((item) => (
                          <span
                            key={item.playerId}
                            className={`px-2 py-0.5 rounded border font-mono-stats text-[11px] ${
                              item.assignedPosition === 'DH'
                                ? 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-200 font-bold'
                                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                            }`}
                          >
                            {item.order}. {item.playerName} (
                            {item.assignedPosition === 'DH' && item.naturalPosition !== 'DH'
                              ? `${item.naturalPosition}→DH`
                              : item.assignedPosition}
                            )
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono-stats text-slate-500">
                        <span className="font-sans font-bold text-slate-700 dark:text-slate-300">추천 선발진:</span>
                        {managerPreGameRec.recommendedRotation.map((sp) => (
                          <span
                            key={sp.playerId}
                            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                          >
                            {sp.slot}선발 {sp.playerName}({sp.ability}·{sp.form >= 0 ? `+${sp.form}` : sp.form})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* #9: Season-Start Coach Developmental Recruit & Official Conversion Banner */}
                  {coachDevAdvice &&
                    (coachDevAdvice.recruitRecommendations.length > 0 ||
                      coachDevAdvice.conversionRecommendations.length > 0) && (
                      <div className="border border-indigo-500/40 bg-indigo-50/40 dark:bg-indigo-950/15 rounded-md p-3.5 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-extrabold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4" />
                            <span>{career.season}시즌 개막 코치 추천: 육성선수 영입 · 정식선수 전환</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('roster')}
                            className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline"
                          >
                            전체 육성 명단 보기
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {coachDevAdvice.recruitRecommendations.slice(0, 2).map(({ candidate, reason }) => (
                            <div
                              key={candidate.id}
                              className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="font-bold truncate">
                                  [영입 추천] {candidate.name} ({candidate.position} · {candidate.ability}/{candidate.potential} ·{' '}
                                  {formatKrwBillionKorean(candidate.signingCostBillion)})
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">{reason}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    const { nextCareer, backupSnapshot, player } =
                                      recruitDevelopmentalCandidate(career, candidate.id);
                                    onUpdateCareer(nextCareer, backupSnapshot);
                                    handleNotify(
                                      `${player.name} 육성선수(#${player.uniformNumber}) 영입 완료!`,
                                      'success'
                                    );
                                  } catch (err) {
                                    handleNotify(
                                      err instanceof Error ? err.message : '육성선수 영입 실패',
                                      'error'
                                    );
                                  }
                                }}
                                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shrink-0"
                              >
                                육성 영입
                              </button>
                            </div>
                          ))}
                          {coachDevAdvice.conversionRecommendations.slice(0, 2).map(({ player, reason }) => (
                            <div
                              key={player.id}
                              className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="font-bold truncate">
                                  [코치 자동 전환 후보] {player.name} ({player.position} · {player.ability}/{player.potential})
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">{reason}</div>
                              </div>
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] shrink-0">
                                코치 자동 판정
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Offseason / Awards Ceremony Entry Banner (Dedicated Screens) */}
                  {career.phase === 'OFFSEASON' && (
                    <div className="team-banner-grad rounded-lg p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/15 border border-white/25 text-[11px] font-bold text-white">
                          {isAwardsCeremonyPending ? (
                            <>
                              <Trophy className="w-3.5 h-3.5 text-amber-300" />
                              <span>{career.season} KBO 공식 시상식 대기 중</span>
                            </>
                          ) : (
                            <>
                              <CalendarDays className="w-3.5 h-3.5" />
                              <span>
                                오프시즌 단장 업무 진행 중 (필수 {offseasonReadiness.requiredCompletedCount}/{offseasonReadiness.requiredTotalCount})
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-base font-black text-white">
                          {isAwardsCeremonyPending
                            ? `${career.season}시즌 종료 — KBO 공식 시상식부터 진행하세요`
                            : `오프시즌 단장실 필수 업무를 모두 완료해야 ${career.season + 1}시즌 경기를 진행할 수 있습니다`}
                        </div>
                        <p className="text-xs text-white/85">
                          {isAwardsCeremonyPending
                            ? 'MVP·신인왕·골든글러브 10인 수상자를 확인 완료하면 전용 오프시즌 단장실이 열립니다.'
                            : '시즌 결산·구단주 평가·감독·코치 인사·선수 계약·개막 준비를 전용 오프시즌 화면에서 처리한 뒤 단장 최종 승인으로 개막하세요.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveTab('awards')}
                          className={`px-3.5 py-2 rounded-md text-xs font-extrabold flex items-center gap-1.5 ${
                            isAwardsCeremonyPending
                              ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow'
                              : 'bg-white/15 hover:bg-white/25 text-white border border-white/30'
                          }`}
                        >
                          <Trophy className="w-3.5 h-3.5" />
                          <span>KBO 공식 시상식</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('offseason')}
                          className="px-4 py-2 rounded-md bg-white text-slate-900 hover:bg-slate-100 text-xs font-black flex items-center gap-1.5 shadow"
                        >
                          <span>오프시즌 단장실 입장</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* League Environment · Difficulty · Salary Cap Compact Strip */}
                  {(() => {
                    const cap = computeSalaryCapSummary(career, career.playerTeamId);
                    const diffLabel = DIFFICULTY_CONFIG[career.difficulty ?? '어려움'].label;
                    const env = career.leagueEnv;
                    return (
                      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
                          <span>
                            난이도 <strong className="text-slate-900 dark:text-white">{diffLabel}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            시즌 환경{' '}
                            <strong className="text-indigo-600 dark:text-indigo-400">
                              {env?.regime ?? '균형'} (반발계수 {env?.ballCOR?.toFixed(3) ?? '0.415'})
                            </strong>
                          </span>
                          <span>·</span>
                          <span className="font-mono-stats">
                            샐러리캡 {cap.teamTop40PayrollBillion.toFixed(1)}억 / {cap.capBillion.toFixed(1)}억
                            {cap.overCapBillion > 0 ? (
                              <strong className="text-rose-600 dark:text-rose-400 ml-1">
                                (초과 +{cap.overCapBillion.toFixed(1)}억)
                              </strong>
                            ) : (
                              <strong className="text-emerald-600 dark:text-emerald-400 ml-1">(정상)</strong>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {career.phase === 'POSTSEASON' && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('postseason')}
                              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px]"
                            >
                              가을야구 중계실 열기
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveTab('analytics')}
                            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            데이터 분석센터 →
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* AI GM Recommendations TOP 3 + KBO Champions Strip */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 border team-accent-surface rounded-md p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-sm font-extrabold team-accent-text">
                          <Lightbulb className="w-4 h-4" />
                          <span>단장 전략 선택지 추천 TOP 3</span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          현재 구단 전력·자금·엔트리 기준 자동 분석
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        {gmRecommendations.map((rec) => (
                          <div
                            key={rec.id}
                            className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-2"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                <span
                                  className={`px-1.5 py-0.5 rounded ${
                                    rec.priority === '긴급'
                                      ? 'bg-red-600 text-white'
                                      : rec.priority === '추천'
                                      ? 'team-accent-bg'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                  }`}
                                >
                                  {rec.priority}
                                </span>
                                <span className="text-slate-500">{rec.category}</span>
                              </div>
                              <div className="text-xs font-extrabold leading-snug">{rec.title}</div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                {rec.description}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRecommendationClick(rec)}
                              className="w-full py-1.5 px-2 rounded team-accent-outline text-[11px] font-bold flex items-center justify-center gap-1"
                            >
                              <span>{rec.ctaLabel}</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* KBO Champion Status Card */}
                    <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 flex flex-col justify-between gap-3">
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-sm font-bold">
                            <Crown className="w-4 h-4 text-amber-500" />
                            <span>KBO 우승 구단 현황</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('standings')}
                            className="text-[11px] font-semibold team-accent-text hover:underline"
                          >
                            우승 기록
                          </button>
                        </div>

                        {latestSimulatedChampion ? (
                          <div className="p-2.5 rounded border border-amber-500/40 bg-amber-500/5 space-y-1 text-xs">
                            <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                              최근 시뮬레이션 우승 ({latestSimulatedChampion.season} 시즌)
                            </div>
                            <div className="flex items-center gap-2 font-extrabold text-sm">
                              <TeamLogo teamId={latestSimulatedChampion.championTeamId} size="sm" />
                              <span>{KBO_TEAMS[latestSimulatedChampion.championTeamId].name}</span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {latestSimulatedChampion.seriesScore} · KS MVP {latestSimulatedChampion.ksMvpName}
                            </div>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs space-y-0.5">
                            <div className="font-bold">{career.season} 시즌 우승팀 미확정</div>
                            <div className="text-[11px] text-slate-500">
                              정규시즌 144G + 포스트시즌 완료 시 한국시리즈 우승팀과 MVP가 기록됩니다.
                            </div>
                          </div>
                        )}

                        {defendingBaselineChampion && !latestSimulatedChampion && (
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
                            <div className="text-[10px] font-semibold text-slate-400">
                              직전 {defendingBaselineChampion.season} 디펜딩 챔피언
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-bold">
                                <TeamLogo teamId={defendingBaselineChampion.championTeamId} size="xs" />
                                <span>{KBO_TEAMS[defendingBaselineChampion.championTeamId].name}</span>
                              </div>
                              <span className="font-mono-stats text-[11px] text-slate-500">
                                vs 한화 {defendingBaselineChampion.seriesScore}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 은퇴 예정 선수 & FA 계약 만료 자동 알림 스트립 */}
                  {(() => {
                    const retireAlerts = getRetirementCandidateAlerts(career, career.playerTeamId);
                    const contractAlerts = getContractExpiryAlerts(career, career.playerTeamId);
                    const faAlerts = contractAlerts.filter((c) => c.kind === 'FA 자격 만료');
                    const foreignAlerts = contractAlerts.filter((c) => c.kind === '외국인 계약 만료');
                    if (retireAlerts.length === 0 && faAlerts.length === 0 && foreignAlerts.length === 0) {
                      return null;
                    }
                    return (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                        <div className="border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 rounded-md p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
                              <Clock className="w-3.5 h-3.5" />
                              <span>
                                {career.season}시즌 FA·외국인 계약 만료 알림 (FA {faAlerts.length}명 · 외국인{' '}
                                {foreignAlerts.length}명)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setContractsSubTab('contracts');
                                setActiveTab('contracts');
                              }}
                              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                            >
                              계약 관리 →
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[...faAlerts, ...foreignAlerts].slice(0, 6).map((item) => (
                              <button
                                key={item.player.id}
                                type="button"
                                onClick={() => setSelectedPlayerId(item.player.id)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-400 text-[11px] cursor-pointer"
                              >
                                <CountryFlag nationality={item.player.nationality ?? '한국'} size="xs" />
                                <span className="font-bold text-slate-900 dark:text-white">{item.player.name}</span>
                                <span
                                  className={`font-semibold ${
                                    item.kind === 'FA 자격 만료'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-sky-600 dark:text-sky-400'
                                  }`}
                                >
                                  {item.kind === 'FA 자격 만료' ? `FA ${item.faGrade}` : '외국인 만료'}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 rounded-md p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>은퇴 예정 · 검토 선수 알림 ({retireAlerts.length}명)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveTab('roster')}
                              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                            >
                              선수단 확인 →
                            </button>
                          </div>
                          {retireAlerts.length === 0 ? (
                            <p className="text-[11px] text-slate-500">현재 은퇴 가능성이 높은 베테랑이 없습니다.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {retireAlerts.slice(0, 6).map((item) => (
                                <button
                                  key={item.player.id}
                                  type="button"
                                  onClick={() => setSelectedPlayerId(item.player.id)}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 text-[11px] cursor-pointer"
                                >
                                  <CountryFlag nationality={item.player.nationality ?? '한국'} size="xs" />
                                  <span className="font-bold text-slate-900 dark:text-white">{item.player.name}</span>
                                  <span className="text-slate-500 font-mono-stats">{item.player.age}세</span>
                                  <span
                                    className={`font-bold ${
                                      item.level === '은퇴 유력'
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-amber-700 dark:text-amber-300'
                                    }`}
                                  >
                                    {item.level} {item.probabilityPct}%
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Club Rivalry Summary Strip */}
                  {myRivalries.length > 0 && (
                    <div className="gm-card p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-sm font-bold">
                          <Flame className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          <span>우리 구단 주요 라이벌 관계</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('standings')}
                          className="text-xs font-semibold team-accent-text hover:underline whitespace-nowrap"
                        >
                          라이벌 현황 · 중점 지정 →
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        {myRivalries.slice(0, 3).map((riv) => {
                          const oppId = getRivalryOpponent(riv, career.playerTeamId);
                          const rec = getRivalryRecordForTeam(riv, career.playerTeamId);
                          const effInt = Math.min(100, riv.intensity + (riv.userFocused ? 6 : 0));
                          const tier = getRivalryTier(effInt);
                          const prof = getRivalryEffectProfile(career, career.playerTeamId, oppId);
                          return (
                            <div
                              key={riv.id}
                              className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 hover:border-rose-300/70 dark:hover:border-rose-500/40 transition-colors space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <TeamLogo teamId={oppId} size="xs" />
                                  <span className="font-extrabold truncate">
                                    vs {KBO_TEAMS[oppId].shortName} · {riv.name}
                                  </span>
                                </div>
                                <span className="px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono-stats text-[11px] font-bold shrink-0">
                                  열기 {riv.intensity}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-stats">
                                {getRivalryTierLabel(tier)}
                                {riv.userFocused ? ' · 중점 지정' : ''} · 시즌 {rec.seasonWins}승 {rec.seasonLosses}패
                                {rec.seasonDraws > 0 ? ` ${rec.seasonDraws}무` : ''}
                              </div>
                              {prof && (
                                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono-stats">
                                  투지 +{prof.spiritPowerBonus.toFixed(1)} · 관중 +{Math.round((prof.attendanceMult - 1) * 100)}% · MD +{Math.round((prof.merchMult - 1) * 100)}%
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Two-Column Operational Summary: Fixed Vertical Lineup + Top 10 Standings */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="gm-card p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-extrabold tracking-tight">현재 선발 타순 (1~9번)</h3>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            선수 클릭 시 상세
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('roster')}
                          className="text-xs font-semibold team-accent-text hover:underline"
                        >
                          타순 · 로테이션 편집
                        </button>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                        {teamState.lineupOrder.map((pid, idx) => {
                          const p = career.players[pid];
                          if (!p) return null;
                          const pos = teamState.lineupPositions[p.id] ?? p.position;
                          const isSecondaryPos = pos !== 'DH' && pos !== p.position;
                          const ovrBadgeCls =
                            p.ability >= 84
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                              : p.ability >= 74
                              ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
                          const formCls =
                            p.form >= 2
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : p.form <= -2
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-400 dark:text-slate-500';
                          return (
                            <button
                              key={`${pid}-${idx}`}
                              type="button"
                              onClick={() => setSelectedPlayerId(p.id)}
                              className="w-full py-2 px-1.5 -mx-1.5 rounded-md flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                            >
                              <span className="font-semibold flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                                <span className="w-5 h-5 rounded-md team-accent-soft border text-[11px] font-mono-stats font-bold inline-flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                {p.uniformNumber !== undefined && (
                                  <span className="font-mono-stats text-[11px] text-slate-400 shrink-0">
                                    #{p.uniformNumber}
                                  </span>
                                )}
                                <span className="truncate font-bold text-slate-900 dark:text-slate-100">
                                  {p.name}
                                </span>
                                <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                                <PlayerForeignFlag player={p} />
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                    pos === 'DH'
                                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                      : isSecondaryPos
                                      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {pos === 'DH' && p.position !== 'DH' ? `${p.position}→DH` : pos}
                                </span>
                                <PlayerCompactTag career={career} player={p} />
                              </span>
                              <span className="flex items-center gap-1.5 font-mono-stats shrink-0">
                                <span className={`px-1.5 py-0.5 rounded border text-[11px] font-bold ${ovrBadgeCls}`}>
                                  {p.ability}
                                  <span className="opacity-65 font-medium">/{p.potential}</span>
                                </span>
                                <span className={`text-[11px] font-bold w-6 text-right ${formCls}`}>
                                  {p.form >= 0 ? `+${p.form}` : p.form}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="gm-card p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-extrabold tracking-tight">리그 순위 요약</h3>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                            5강 PS 컷라인
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('standings')}
                          className="text-xs font-semibold team-accent-text hover:underline"
                        >
                          10구단 전체 보기
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left font-mono-stats">
                          <thead className="bg-slate-50/90 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                            <tr>
                              <th className="py-2 px-2 font-sans font-semibold">순위</th>
                              <th className="py-2 px-2 font-sans font-semibold">구단</th>
                              <th className="py-2 px-2 text-right font-sans font-semibold">승</th>
                              <th className="py-2 px-2 text-right font-sans font-semibold">패</th>
                              <th className="py-2 px-2 text-right font-sans font-semibold">승률</th>
                              <th className="py-2 px-2 text-right font-sans font-semibold">게임차</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                            {standings.map((r, rowIdx) => {
                              const prevRank = career.previousStandingsRanks?.[r.teamId];
                              const rankDelta =
                                typeof prevRank === 'number' && r.games > 0 ? prevRank - r.rank : 0;
                              const isMyTeam = r.teamId === career.playerTeamId;
                              return (
                                <tr
                                  key={r.teamId}
                                  className={`transition-colors ${
                                    isMyTeam
                                      ? 'team-accent-row font-bold'
                                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                                  } ${
                                    rowIdx === 4
                                      ? 'border-b-2 border-b-emerald-500/45 dark:border-b-emerald-400/40'
                                      : ''
                                  }`}
                                >
                                  <td className="py-2 px-2 whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1">
                                      <span className={r.rank <= 5 ? 'text-slate-900 dark:text-slate-100 font-bold' : 'text-slate-500'}>
                                        {r.isTied ? `공동 ${r.rank}` : r.rank}
                                      </span>
                                      {typeof prevRank === 'number' && r.games > 0 && (
                                        <span
                                          className={`text-[10px] font-bold ${
                                            rankDelta > 0
                                              ? 'text-emerald-600 dark:text-emerald-400'
                                              : rankDelta < 0
                                              ? 'text-rose-600 dark:text-rose-400'
                                              : 'text-slate-400'
                                          }`}
                                          title={`직전 순위 ${prevRank}위 → 현재 ${r.rank}위`}
                                        >
                                          {rankDelta > 0
                                            ? `▲${rankDelta}`
                                            : rankDelta < 0
                                            ? `▼${Math.abs(rankDelta)}`
                                            : '—'}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 font-sans">
                                    <div className="flex items-center gap-2">
                                      <TeamLogo teamId={r.teamId} size="xs" />
                                      <span className={isMyTeam ? 'font-extrabold' : 'font-semibold'}>
                                        {KBO_TEAMS[r.teamId].shortName}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-right">{r.wins}</td>
                                  <td className="py-2 px-2 text-right">{r.losses}</td>
                                  <td className="py-2 px-2 text-right">{r.pct.toFixed(3)}</td>
                                  <td className="py-2 px-2 text-right text-slate-500 dark:text-slate-400">
                                    {r.gb === 0 ? '—' : r.gb.toFixed(1)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'report' && (
            <SeriesReportView
              career={career}
              showDetailedByDefault={settings.showDetailedColumnsByDefault}
              onUpdateCareer={applyCareerUpdate}
              onSimulateNextSeries={handleSimulateNextSeries}
              onSimulatePostseasonGame={handleSimulatePostseason}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'news' && (
            <NewsAndEventsView
              career={career}
              onUpdateCareer={applyCareerUpdate}
              onNotify={handleNotify}
            />
          )}

          {activeTab === 'postseason' && (
            <PostseasonView
              career={career}
              onPlayNextPostseasonGame={handleSimulatePostseason}
              onSelectPlayer={setSelectedPlayerId}
              onOpenAwardsCeremony={() => setActiveTab('awards')}
            />
          )}

          {activeTab === 'awards' && (
            <KboAwardsCeremonyView
              career={career}
              onUpdateCareer={applyCareerUpdate}
              onSelectPlayer={setSelectedPlayerId}
              onEnterOffseason={() => setActiveTab('offseason')}
            />
          )}

          {activeTab === 'offseason' && (
            <OffseasonHubView
              career={career}
              onUpdateCareer={applyCareerUpdate}
              onNavigateTab={(t) => setActiveTab(t)}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'standings' && (
            <StandingsAndScheduleView
              career={career}
              onSimulateNextSeries={handleSimulateNextSeries}
              onSimulatePostseasonGame={handleSimulatePostseason}
              onUpdateCareer={applyCareerUpdate}
              onNotify={handleNotify}
              onSelectPlayer={setSelectedPlayerId}
              initialSubTab={standingsSubTab}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsCenterView
              career={career}
              onSelectPlayer={(pl) => setSelectedPlayerId(pl.id)}
              onNavigateTab={(t) => setActiveTab(t)}
            />
          )}

          {activeTab === 'roster' && (
            <RosterLineupView
              career={career}
              onUpdateCareer={applyCareerUpdate}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'contracts' && (
            <TransactionsView
              career={career}
              initialSubTab={contractsSubTab}
              onUpdateCareer={applyCareerUpdate}
              onSelectPlayer={setSelectedPlayerId}
              onOpenLeagueAcquisitions={() => setActiveTab('acquisitions')}
            />
          )}

          {activeTab === 'acquisitions' && (
            <LeagueAcquisitionsView
              career={career}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'draft' && (
            <DraftPostingAwardsView
              career={career}
              onUpdateCareer={applyCareerUpdate}
              onSelectPlayer={setSelectedPlayerId}
              onOpenAwardsCeremony={() => setActiveTab('awards')}
              focusDraftNonce={draftFocusNonce}
            />
          )}

          {activeTab === 'amateur' && (
            <AmateurAndOverseasView
              key={`${amateurFocus.subTab}-${amateurFocus.overseasId ?? 'none'}`}
              career={career}
              initialSubTab={amateurFocus.subTab}
              initialSelectedOverseasId={amateurFocus.overseasId}
              onUpdateCareer={applyCareerUpdate}
              onNotify={handleNotify}
            />
          )}

          {activeTab === 'hub' && (
            <LeagueHubView
              career={career}
              section="operations"
              onUpdateCareer={applyCareerUpdate}
              onNotify={handleNotify}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'leagueLife' && (
            <LeagueLifeHubSection
              career={career}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'history' && (
            <LeagueHubView
              career={career}
              section="history"
              onUpdateCareer={applyCareerUpdate}
              onNotify={handleNotify}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'finances' && (
            <FinancesSavesView
              career={career}
              savedCareers={savedCareers}
              onUpdateCareer={applyCareerUpdate}
              onImportJson={onImportJson}
              onSaveAsNewSlot={onSaveAsNewSlot}
              onSwitchCareer={onSwitchCareer}
              onRenameCareer={onRenameCareer}
              onDeleteCareer={onDeleteCareer}
            />
          )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Global Player Detail Modal */}
      <PlayerDetailModal
        career={career}
        playerId={selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)}
      />

      {/* Global League-Wide Player Search Modal (#5 & #6) */}
      <GlobalPlayerSearchModal
        career={career}
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onSelectKboPlayer={(pid) => setSelectedPlayerId(pid)}
        onJumpToOverseas={(permId) => {
          setAmateurFocus({ subTab: 'overseas', overseasId: permId });
          setActiveTab('amateur');
        }}
      />

      {/* Season Opening Year Transition Animation Modal */}
      {seasonTransition && (
        <SeasonOpeningTransitionModal
          fromSeason={seasonTransition.fromSeason}
          toSeason={seasonTransition.toSeason}
          teamId={career.playerTeamId}
          onComplete={() => setSeasonTransition(null)}
        />
      )}

      {/* KBO Event Animations Overlay Queue (Opening Day / Mega FA / Blockbuster Trade / Manager Change / KS Champion / Golden Glove / MVP·ROY / Retirement) */}
      {eventAnimQueue.length > 0 && !seasonTransition && (
        <GameEventAnimations
          event={eventAnimQueue[0]}
          onComplete={handleCompleteEventAnim}
        />
      )}

      {/* Match Broadcast Progression Animation Modal */}
      <AnimatePresence>
        {matchAnimState && eventAnimQueue.length === 0 && !seasonTransition && (
          <SeriesProgressModal
            title={matchAnimState.title}
            games={matchAnimState.games}
            playerTeamId={career.playerTeamId}
            onComplete={handleCloseMatchAnim}
          />
        )}
      </AnimatePresence>

      {/* Korean Series Championship Celebration Event Modal */}
      {activeChampionEvent && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-amber-500/60 rounded-md overflow-hidden">
            <div className="px-5 py-4 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-4">
              <KoreanSeriesTrophyLogo
                teamId={activeChampionEvent.championTeamId}
                season={activeChampionEvent.season}
                titleCount={getClubTitleCount(career, activeChampionEvent.championTeamId)}
                size="md"
                showCaption={false}
              />
              <div>
                <div className="text-xs font-extrabold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <Crown className="w-4 h-4" />
                  <span>
                    {activeChampionEvent.season} KBO 한국시리즈 우승 · V{getClubTitleCount(career, activeChampionEvent.championTeamId)}
                  </span>
                </div>
                <h3 className="text-lg font-extrabold mt-0.5">{activeChampionEvent.headline}</h3>
                <div className="text-xs text-slate-600 dark:text-slate-300 font-mono-stats mt-0.5">
                  준우승 {KBO_TEAMS[activeChampionEvent.runnerUpTeamId].shortName} 상대 {activeChampionEvent.seriesScore}
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {activeChampionEvent.ksMvp && (
                <div className="p-3 rounded border team-accent-surface flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold team-accent-text">
                      한국시리즈 MVP
                    </div>
                    <div className="text-sm font-extrabold mt-0.5">
                      {activeChampionEvent.ksMvp.playerName} ({activeChampionEvent.ksMvp.teamId})
                    </div>
                  </div>
                  <div className="font-mono-stats text-slate-600 dark:text-slate-300 text-right">
                    {activeChampionEvent.ksMvp.statSummary}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {activeChampionEvent.details.map((line, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-medium"
                  >
                    {line}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    handleAcknowledgeChampion();
                    setActiveTab('awards');
                  }}
                  className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-black flex items-center gap-1.5 shadow-sm"
                >
                  <Trophy className="w-4 h-4" />
                  <span>{activeChampionEvent.season} KBO 공식 시상식 입장</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <SoundSettingsModal
        open={soundModalOpen}
        onClose={() => setSoundModalOpen(false)}
      />
    </div>
  );
};
