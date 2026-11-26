import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Clock,
  FileSignature,
  Globe2,
  Lock,
  RefreshCw,
  Search,
  Sparkles,
  UserCheck,
  UserMinus,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { getNationalityDisplay } from '../data/playerMetadata';
import { NationalityBadge } from './CountryFlag';
import {
  dispatchOverseasScout,
  exercisePlayerOption,
  formatKrwBillionKorean,
  formatKrwContractSummary,
  getActiveKboRuleModifiers,
  releaseDomesticPlayerToWaiver,
  signUnclaimedFreeAgent,
  submitWaiverClaimApplication,
} from '../engine/franchiseSystems';
import {
  diffCalendarDaysIso,
  getReWaiverRestrictionStatus,
  isPostAugustFirstTransfer,
  KBO_WAIVER_FEE_MANWON,
} from '../engine/waiverEngine';
import {
  getRecommendedDomesticContractIds,
  getRecommendedForeignCandidateId,
  getRecommendedReleaseCandidates,
} from '../engine/recommendations';
import {
  autoSignAiPendingDomesticContracts,
  evaluateForeignPlayerSeasonOutcome,
  evaluateTradeProposal,
  executeTradeProposal,
  generateAiDomesticContract,
  getExternalFaMarket,
  getForeignScoutMarket,
  getForeignSlotCounts,
  getMyDepartedFaPlayers,
  quoteForeignPlayerRenewal,
  refreshVirtualForeignMarket,
  releaseForeignPlayer,
  renewForeignPlayerContract,
  signDomesticContractOneClick,
  signExternalFaPlayer,
  signForeignCandidate,
  TradeEvaluationResult,
  usdToKrwBillion,
} from '../engine/transactions';
import {
  advanceFaCompetitionRound,
  calculateExactFaContractBreakdown,
  declinePendingUserFaApproval,
  getClubFaBidSummary,
  getTeamExternalFaSigningCount,
  isOverseasFaEligible,
  MAX_EXTERNAL_FA_PER_CLUB,
  setUserClubAutoFaBidEnabled,
  submitUserClubFaBid,
  syncAllClubsAutoFaBids,
} from '../engine/faCompetitionEngine';
import { buildTeamFaProtectionPool } from '../engine/faCompensationEngine';
import { formatCompactPlayerPosition } from '../engine/positionEngine';
import { getMlbClubMeta, MlbTeamLogo } from './MlbTeamLogo';
import {
  advanceOverseasReturneeMarketRound,
  computePlayerTradeValue,
  computeSalaryCapSummary,
  confirmFaProtectionList,
  getOverseasReturneeContractTerms,
  getTradeWindowStatus,
  signOverseasReturnee,
} from '../engine/deepFranchise';
import {
  acceptIncomingTradeOffer,
  getPendingIncomingTradeOffers,
  rejectIncomingTradeOffer,
  solicitIncomingTradeOffers,
} from '../engine/incomingTradeEngine';
import {
  ContractCapPreviewResult,
  formatBillionExactKorean,
  formatManwonKorean,
  getCurrentCareerDate,
  previewContractSalaryCapImpact,
} from '../engine/salaryCapEngine';
import {
  evaluateFranchiseStar,
  evaluateLegendTradeAvailability,
  getFranchiseContractYearRange,
  getTeamFranchiseStars,
  proposeFranchiseLongTermContract,
} from '../engine/franchiseStarEngine';
import { findRivalryBetween } from '../engine/rivalryEngine';
import { isMilitaryServing } from '../engine/militaryEngine';
import { CareerSave, ScoutDispatchMission, TeamId, VirtualForeignPoolItem } from '../types/kbo';
import { CoachesManagementPanel } from './CoachesManagementPanel';
import { ContractApprovalModal } from './ContractApprovalModal';
import { PlayerCategoryTag } from './PlayerCategoryTag';
import {
  FranchiseStarIcon,
  isFranchiseStarPlayer,
  PlayerCompactTag,
  PlayerForeignFlag,
} from './PlayerStatusCompact';
import { TeamLogo } from './TeamLogo';

export type TransactionsSubTab = 'contracts' | 'fa' | 'foreign' | 'coaches' | 'trade' | 'waiver';

interface TransactionsViewProps {
  career: CareerSave;
  initialSubTab?: TransactionsSubTab;
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onSelectPlayer?: (playerId: string) => void;
  onOpenLeagueAcquisitions?: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  career,
  initialSubTab = 'contracts',
  onUpdateCareer,
  onSelectPlayer,
  onOpenLeagueAcquisitions,
}) => {
  const [subTab, setSubTab] = useState<TransactionsSubTab>(initialSubTab);
  const [franYearsMap, setFranYearsMap] = useState<Record<string, number>>({});
  const [franAnnualMap, setFranAnnualMap] = useState<Record<string, string>>({});
  const [franBonusMap, setFranBonusMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [domesticFilter, setDomesticFilter] = useState<'pending' | 'all'>('pending');
  const [franchiseSearch, setFranchiseSearch] = useState<string>('');
  const [domesticSearch, setDomesticSearch] = useState<string>('');
  const [faSearch, setFaSearch] = useState<string>('');
  const [protectionSearch, setProtectionSearch] = useState<string>('');
  const [foreignSearch, setForeignSearch] = useState<string>('');
  const [tradeGiveSearch, setTradeGiveSearch] = useState<string>('');
  const [tradeReceiveSearch, setTradeReceiveSearch] = useState<string>('');
  const [waiverReleaseSearch, setWaiverReleaseSearch] = useState<string>('');
  const [foreignMarketFilter, setForeignMarketFilter] = useState<'전체' | '외국인' | '아시아쿼터'>('전체');
  const [replaceId, setReplaceId] = useState<string>('');

  // 3-step trade state
  const otherTeams = TEAM_IDS.filter((t) => t !== career.playerTeamId);
  const [targetTeam, setTargetTeam] = useState<TeamId>(otherTeams[0]);
  const [giveIds, setGiveIds] = useState<string[]>([]);
  const [receiveIds, setReceiveIds] = useState<string[]>([]);
  const [cashInclude, setCashInclude] = useState<number>(0);
  const [draftPickRound, setDraftPickRound] = useState<1 | 2 | 3 | null>(null);
  const [tradeEval, setTradeEval] = useState<TradeEvaluationResult | null>(null);
  const [faOfferTotal, setFaOfferTotal] = useState<Record<string, string>>({});
  const [faOfferYears, setFaOfferYears] = useState<Record<string, number>>({});
  const [protectedSelection, setProtectedSelection] = useState<string[]>([]);
  const [pendingContract, setPendingContract] = useState<{
    preview: ContractCapPreviewResult;
    confirmLabel?: string;
    execute: () => void;
  } | null>(null);

  const cashBalance = career.finances.cashBalanceBillion;
  const salaryCap = computeSalaryCapSummary(career, career.playerTeamId);
  const myDepartedFa = getMyDepartedFaPlayers(career);
  const externalFaMarket = getExternalFaMarket(career);
  const autoFaSyncKeyRef = useRef<string>('');

  // FA 탭 진입 시 미초기화·미동기화 FA가 있으면 전 구단 자동 입찰을 즉시 실행 (기존 세이브 호환)
  useEffect(() => {
    if (subTab !== 'fa') return;
    const allOpenFa = [...myDepartedFa, ...externalFaMarket];
    if (allOpenFa.length === 0) return;
    const faComp = career.faCompetition?.season === career.season ? career.faCompetition : undefined;
    const hasMissingNeg =
      !faComp ||
      allOpenFa.some((item) => {
        const neg = faComp.negotiations[item.player.id];
        return !neg || (neg.status === '입찰중' && neg.bids.length === 0);
      });
    if (!hasMissingNeg) return;
    const syncKey = `${career.careerId}-${career.season}-${allOpenFa.length}-${faComp?.round ?? 0}-${faComp?.autoBidForUserClub ?? 'u'}`;
    if (autoFaSyncKeyRef.current === syncKey) return;
    autoFaSyncKeyRef.current = syncKey;
    const res = syncAllClubsAutoFaBids(career);
    onUpdateCareer(res.nextCareer);
  }, [subTab, career, myDepartedFa, externalFaMarket, onUpdateCareer]);
  const overseasReturnees = (career.overseasReturnPool ?? []).filter((r) => !r.signed);
  const signedOverseasReturnees = (career.overseasReturnPool ?? []).filter((r) => Boolean(r.signed));
  const pendingIncomingTrades = getPendingIncomingTradeOffers(career);
  const tradeWindow = getTradeWindowStatus(career);
  const isTradeClosed = !tradeWindow.isOpen;
  const releaseRecommendations = getRecommendedReleaseCandidates(career, 5);
  const domesticReleasable = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === career.playerTeamId &&
        p.category === '국내' &&
        (p.rosterTier === '2군' || p.rosterTier === '1군') &&
        !isMilitaryServing(p.militaryStatus)
    )
    .sort((a, b) => a.ability - b.ability);

  const matchesQuery = (query: string, ...fields: (string | number | undefined | null)[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return fields.some((f) => f !== undefined && f !== null && String(f).toLowerCase().includes(q));
  };

  const myPlayers = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === career.playerTeamId &&
        p.rosterTier !== 'FA' &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적'
    )
    .sort((a, b) => b.ability - a.ability);

  const myDomestic = myPlayers.filter((p) => p.category === '국내');
  const pendingDomestic = myDomestic.filter(
    (p) => p.contract.status === '미확인' || p.contract.status === '만료'
  );
  const visibleDomestic = domesticFilter === 'pending' ? pendingDomestic : myDomestic;

  const recommendedDomesticIds = new Set(getRecommendedDomesticContractIds(career));

  const targetDomestic = Object.values(career.players)
    .filter(
      (p) =>
        p.teamId === targetTeam &&
        p.category === '국내' &&
        p.rosterTier !== 'FA' &&
        p.rosterTier !== '은퇴' &&
        p.rosterTier !== '해외이적'
    )
    .sort((a, b) => b.ability - a.ability);

  const foreignSlots = getForeignSlotCounts(career, career.playerTeamId);
  const asiaQuotaLimit = getActiveKboRuleModifiers(career).asiaQuotaLimit;
  const fullForeignMarket = getForeignScoutMarket(career);
  const visibleForeignMarket = fullForeignMarket.filter(
    (c) => foreignMarketFilter === '전체' || c.category === foreignMarketFilter
  );
  const recommendedForeign = getRecommendedForeignCandidateId(career, fullForeignMarket);

  const handleOneClickDomesticSign = (playerId: string) => {
    const target = career.players[playerId];
    if (!target) return;
    const quote = generateAiDomesticContract(target);
    const preview = previewContractSalaryCapImpact(career, {
      title: `${target.name} 국내 계약 승인 (${quote.years}년 총액 ${formatKrwBillionKorean(quote.totalBillion)})`,
      items: [
        {
          existingPlayerId: target.id,
          playerName: target.name,
          category: '국내',
          years: quote.years,
          annualSalaryBillion: quote.annualSalaryBillion,
          signingBonusBillion: quote.signingBonusBillion,
          cashRequiredNowBillion: quote.totalBillion,
        },
      ],
    });
    setPendingContract({
      preview,
      confirmLabel: '단장 승인 · 계약 확정',
      execute: () => {
        try {
          setNotice(null);
          const { nextCareer, backupSnapshot } = signDomesticContractOneClick(career, playerId);
          onUpdateCareer(nextCareer, backupSnapshot);
          const p = nextCareer.players[playerId];
          const summaryText = formatKrwContractSummary({
            years: p.contract.years,
            totalBillion: p.contract.totalValue,
            annualSalaryBillion: p.contract.annualSalary,
            signingBonusBillion: p.contract.signingBonus,
            startSeason: p.contract.startSeason ?? nextCareer.season,
          });
          setNotice({
            type: 'ok',
            text: `${p.name} 계약 체결 완료 — ${summaryText}`,
          });
        } catch (err) {
          setNotice({ type: 'err', text: err instanceof Error ? err.message : '계약 체결 오류' });
        }
      },
    });
  };

  const handleAutoSignAllPending = () => {
    const sorted = [...pendingDomestic].sort((a, b) => b.ability - a.ability);
    if (sorted.length === 0) return;
    let remainingCash = cashBalance ?? Number.POSITIVE_INFINITY;
    const batchItems: Parameters<typeof previewContractSalaryCapImpact>[1]['items'] = [];
    for (const p of sorted) {
      const q = generateAiDomesticContract(p);
      if (q.totalBillion <= remainingCash) {
        batchItems.push({
          existingPlayerId: p.id,
          playerName: p.name,
          category: '국내',
          years: q.years,
          annualSalaryBillion: q.annualSalaryBillion,
          signingBonusBillion: q.signingBonusBillion,
          cashRequiredNowBillion: q.totalBillion,
        });
        remainingCash -= q.totalBillion;
      }
    }
    if (batchItems.length === 0) {
      setNotice({ type: 'err', text: '현재 보유 자금으로 일괄 체결할 수 있는 미계약 선수가 없습니다.' });
      return;
    }
    const preview = previewContractSalaryCapImpact(career, {
      title: `미계약 국내 선수 ${batchItems.length}명 일괄 계약 승인`,
      items: batchItems,
    });
    setPendingContract({
      preview,
      confirmLabel: `단장 승인 · ${batchItems.length}명 일괄 확정`,
      execute: () => {
        try {
          setNotice(null);
          const { nextCareer, backupSnapshot } = autoSignAiPendingDomesticContracts(career);
          onUpdateCareer(nextCareer, backupSnapshot);
          setNotice({
            type: 'ok',
            text: '보유 자금 한도 내에서 우선순위로 미계약 국내 선수 계약을 일괄 체결했습니다.',
          });
        } catch (err) {
          setNotice({ type: 'err', text: err instanceof Error ? err.message : '일괄 체결 오류' });
        }
      },
    });
  };

  const handleSignForeign = (cand: VirtualForeignPoolItem) => {
    const krw = usdToKrwBillion(cand.suggestedTotalUsd);
    const extraBlockingChecks: string[] = [];
    if (cand.category === '아시아쿼터' && cand.suggestedTotalUsd > 200000) {
      extraBlockingChecks.push('아시아쿼터 신규 계약 상한($200,000)을 초과했습니다.');
    }
    if (
      !replaceId &&
      ((cand.category === '외국인' && foreignSlots.regularCount >= 3) ||
        (cand.category === '아시아쿼터' && foreignSlots.asianCount >= asiaQuotaLimit))
    ) {
      extraBlockingChecks.push('보유 슬롯이 만석입니다. 기존 선수를 해지하거나 교체 지정하세요.');
    }
    const preview = previewContractSalaryCapImpact(career, {
      title: `${cand.name} [${cand.category}] 1년 영입 승인 ($${cand.suggestedTotalUsd.toLocaleString()})`,
      items: [
        {
          playerName: cand.name,
          category: cand.category,
          years: 1,
          annualSalaryBillion: usdToKrwBillion(cand.suggestedSalaryUsd),
          signingBonusBillion: usdToKrwBillion(cand.suggestedSigningBonusUsd),
          cashRequiredNowBillion: krw,
          isNewIncomingPlayer: true,
        },
      ],
      extraBlockingChecks,
    });
    setPendingContract({
      preview,
      confirmLabel: replaceId ? '단장 승인 · 교체 영입 확정' : '단장 승인 · 외국인 영입 확정',
      execute: () => {
        try {
          setNotice(null);
          const { nextCareer, backupSnapshot } = signForeignCandidate(
            career,
            cand,
            replaceId || undefined
          );
          onUpdateCareer(nextCareer, backupSnapshot);
          setReplaceId('');
          setNotice({
            type: 'ok',
            text: `${cand.name} [${cand.category}] 1년 총액 ${formatKrwBillionKorean(krw)} 계약 체결 완료 (${nextCareer.season}시즌 · $${cand.suggestedTotalUsd.toLocaleString()})`,
          });
        } catch (err) {
          setNotice({ type: 'err', text: err instanceof Error ? err.message : '외국인 영입 오류' });
        }
      },
    });
  };

  const handleRenewForeign = (playerId: string) => {
    const fp = career.players[playerId];
    if (!fp) return;
    try {
      setNotice(null);
      const quote = quoteForeignPlayerRenewal(career, fp);
      if (quote.alreadyRenewedForTarget) {
        setNotice({ type: 'ok', text: `${fp.name} 선수는 이미 ${quote.targetSeason}시즌 계약 유지(재계약)가 확정되었습니다.` });
        return;
      }
      const preview = previewContractSalaryCapImpact(career, {
        title: `${fp.name} [${fp.category}] ${quote.targetSeason}시즌 계약 유지(재계약) 승인 ($${quote.suggestedTotalUsd.toLocaleString()} · ${quote.adjustmentLabel})`,
        items: [
          {
            playerName: fp.name,
            category: fp.category === '아시아쿼터' ? '아시아쿼터' : '외국인',
            years: 1,
            annualSalaryBillion: usdToKrwBillion(quote.suggestedSalaryUsd),
            signingBonusBillion: quote.upfrontKrwBillion,
            cashRequiredNowBillion: quote.upfrontKrwBillion,
            isNewIncomingPlayer: false,
          },
        ],
      });
      setPendingContract({
        preview,
        confirmLabel: '단장 승인 · 계약 유지(재계약) 확정',
        execute: () => {
          try {
            const { nextCareer, backupSnapshot, quote: confirmed } = renewForeignPlayerContract(career, playerId);
            onUpdateCareer(nextCareer, backupSnapshot);
            setNotice({
              type: 'ok',
              text: `${fp.name} ${confirmed.targetSeason}시즌 계약 유지(재계약) 확정! (총액 $${confirmed.suggestedTotalUsd.toLocaleString()} · ${confirmed.adjustmentLabel})`,
            });
          } catch (err) {
            setNotice({ type: 'err', text: err instanceof Error ? err.message : '외국인 재계약 오류' });
          }
        },
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '외국인 재계약 견적 오류' });
    }
  };

  const handleReleaseForeign = (playerId: string) => {
    try {
      setNotice(null);
      const targetName = career.players[playerId]?.name ?? '선수';
      const { nextCareer, backupSnapshot } = releaseForeignPlayer(career, playerId);
      onUpdateCareer(nextCareer, backupSnapshot);
      if (replaceId === playerId) setReplaceId('');
      setNotice({
        type: 'ok',
        text: `${targetName} 선수와 계약을 해지했습니다. 빈 슬롯에 신규 외국인 영입이 가능합니다.`,
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '계약 해지 오류' });
    }
  };

  const handleRefreshMarket = () => {
    const { nextCareer, backupSnapshot } = refreshVirtualForeignMarket(career);
    onUpdateCareer(nextCareer, backupSnapshot);
    setNotice({
      type: 'ok',
      text: '해외 스카우트 리포트를 갱신해 새로운 가상 외국인·아시아쿼터 후보군을 불러왔습니다.',
    });
  };

  const handleEvaluateTrade = () => {
    const res = evaluateTradeProposal(
      career,
      targetTeam,
      giveIds,
      receiveIds,
      cashInclude,
      draftPickRound
    );
    setTradeEval(res);
  };

  const handleExecuteTrade = (forceAcceptCounter = false) => {
    try {
      setNotice(null);
      let finalGive = [...giveIds];
      let finalCash = cashInclude;
      let finalPick = draftPickRound;
      if (forceAcceptCounter && tradeEval?.counterOffer) {
        if (tradeEval.counterOffer.extraCashBillion) {
          finalCash = Number((finalCash + tradeEval.counterOffer.extraCashBillion).toFixed(1));
        }
        if (tradeEval.counterOffer.requestedPickRound) {
          finalPick = tradeEval.counterOffer.requestedPickRound;
        }
        if (
          tradeEval.counterOffer.requestedPlayerId &&
          !finalGive.includes(tradeEval.counterOffer.requestedPlayerId)
        ) {
          finalGive = [...finalGive, tradeEval.counterOffer.requestedPlayerId];
        }
      }

      const { nextCareer, backupSnapshot } = executeTradeProposal(
        career,
        targetTeam,
        finalGive,
        receiveIds,
        finalCash,
        finalPick,
        forceAcceptCounter
      );
      onUpdateCareer(nextCareer, backupSnapshot);
      setGiveIds([]);
      setReceiveIds([]);
      setCashInclude(0);
      setDraftPickRound(null);
      setTradeEval(null);
      setNotice({
        type: 'ok',
        text: `${KBO_TEAMS[targetTeam].name}와의 ${forceAcceptCounter ? '역제안 수락 ' : ''}트레이드가 공식 체결되었습니다.`,
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '트레이드 실행 오류' });
    }
  };

  const handleExerciseOption = (playerId: string, exercise: boolean) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = exercisePlayerOption(career, playerId, exercise);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({
        type: 'ok',
        text: `${career.players[playerId]?.name} 계약 옵션 ${exercise ? '실행' : '미실행(FA 전환)'} 처리 완료`,
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '옵션 처리 오류' });
    }
  };

  const handleDispatchScout = (region: ScoutDispatchMission['region']) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = dispatchOverseasScout(career, region);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({
        type: 'ok',
        text: `${region} 해외 스카우트 파견 완료 — 발굴된 특급 후보가 마켓 최상단에 추가되었습니다.`,
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '해외 스카우트 파견 오류' });
    }
  };

  const currentDateIso = getCurrentCareerDate(career).isoDate;

  const handleApplyWaiver = (waiverId: string) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = submitWaiverClaimApplication(career, waiverId);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({
        type: 'ok',
        text: '7일 웨이버 영입 신청이 접수되었습니다. 마감 시점에 복수 구단 경합이 있으면 하위 순위 구단에 우선권이 부여됩니다.',
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '웨이버 영입 신청 실패' });
    }
  };

  const handleSignUnclaimedFa = (itemId: string) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = signUnclaimedFreeAgent(career, itemId);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({
        type: 'ok',
        text: '자유계약선수 영입이 확정되어 2군 선수단에 합류했습니다.',
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '자유계약선수 영입 실패' });
    }
  };

  const handleReleaseWaiver = (playerId: string) => {
    try {
      setNotice(null);
      const pl = career.players[playerId];
      if (pl && (pl.category === '외국인' || pl.category === '아시아쿼터')) {
        const { nextCareer, backupSnapshot } = releaseForeignPlayer(career, playerId);
        onUpdateCareer(nextCareer, backupSnapshot);
        setNotice({
          type: 'ok',
          text: `${pl.name} 외국인 선수 계약을 해지(웨이버 공시)했습니다.`,
        });
        return;
      }
      const { nextCareer, backupSnapshot } = releaseDomesticPlayerToWaiver(career, playerId);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({
        type: 'ok',
        text: `${pl?.name ?? '국내 선수'}을(를) 선수단에서 제외하고 7일간 웨이버 공시했습니다.`,
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '방출 실패' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold">계약 · FA · 트레이드 · 웨이버 센터</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            국내·FA·외국인(3+1)·감독·코치 계약, KBO 공식 트레이드 및 웨이버 시장을 한 화면에서 통합 운영합니다.
          </p>
        </div>

        <div className="flex flex-wrap rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-xs self-start">
          {[
            { id: 'contracts', label: `국내 계약 (${pendingDomestic.length})`, icon: FileSignature },
            { id: 'fa', label: `FA · 해외복귀 (${myDepartedFa.length + externalFaMarket.length})`, icon: Sparkles },
            { id: 'foreign', label: `외국인(3+1)`, icon: Globe2 },
            { id: 'coaches', label: '감독 · 코치 (FA)', icon: UserCheck },
            {
              id: 'trade',
              label:
                pendingIncomingTrades.length > 0
                  ? `트레이드 (제안 ${pendingIncomingTrades.length})`
                  : isTradeClosed
                  ? '트레이드 (폐쇄)'
                  : '트레이드',
              icon: ArrowLeftRight,
            },
            {
              id: 'waiver',
              label: `웨이버 시장 (${(career.waiverPool ?? []).length})`,
              icon: UserMinus,
            },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id as TransactionsSubTab)}
                className={`px-3 py-1.5 font-semibold flex items-center gap-1.5 ${
                  subTab === t.id
                    ? 'team-accent-bg'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Budget Cap & Salary Cap Status Strip */}
      {(subTab === 'contracts' || subTab === 'fa' || subTab === 'foreign') && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-bold">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <span>계약 가능 보유 자금:</span>
            <span className="font-mono-stats text-sm text-emerald-700 dark:text-emerald-400">
              {cashBalance === null ? '기본 운영자금 미편성' : `${cashBalance.toFixed(2)}억 원`}
            </span>
          </div>
          <span className="text-[11px] font-mono-stats text-slate-600 dark:text-slate-300">
            경쟁균형세 {salaryCap.teamTop40PayrollBillion.toFixed(2)}억 / {formatManwonKorean(salaryCap.capManwon)}
            {salaryCap.franchiseExceptionPlayerName
              ? ` · 예외 ${salaryCap.franchiseExceptionPlayerName}(-50%)`
              : ''}
            {salaryCap.overCapBillion > 0
              ? ` · 초과 +${salaryCap.overCapBillion.toFixed(2)}억 (예상 제재금 ${salaryCap.luxuryTaxBillion.toFixed(2)}억 · ${salaryCap.luxuryTaxRatePct}%)`
              : salaryCap.floorEnabled && salaryCap.underFloorBillion > 0
              ? ` · 하한 미달 -${salaryCap.underFloorBillion.toFixed(2)}억`
              : ' · 상한 이내'}
          </span>
        </div>
      )}

      {notice && (
        <div
          className={`p-3 rounded border text-xs font-medium ${
            notice.type === 'err'
              ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {notice.text}
        </div>
      )}

      {subTab === 'coaches' && (
        <CoachesManagementPanel career={career} onUpdateCareer={onUpdateCareer} />
      )}

      {/* TAB: FA Market (A/B/C Grades + Agent Negotiation + 20/25 Protection Roster) & Overseas Returnees */}
      {subTab === 'fa' && (() => {
        const faComp = career.faCompetition?.season === career.season ? career.faCompetition : undefined;
        const userAutoBidOn = faComp?.autoBidForUserClub !== false;
        const clubBidSummaries = getClubFaBidSummary(career);
        const activeBiddingClubCount = clubBidSummaries.filter((c) => c.activeBidCount > 0).length;
        const totalOpenBids = clubBidSummaries.reduce((sum, c) => sum + c.activeBidCount, 0);
        const myExternalFaCount = getTeamExternalFaSigningCount(career, career.playerTeamId);
        const pendingUserApprovals = Object.values(faComp?.negotiations ?? {}).filter(
          (n) => n.status === '단장승인대기' && n.pendingWinnerTeamId === career.playerTeamId
        );
        return (
        <div className="space-y-4 text-xs">
          {/* 10개 구단 FA 영입 경쟁 컨트롤 & 외부 FA 한도 현황 */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold flex items-center gap-2 flex-wrap">
                  <span>KBO 10개 구단 FA 자동 입찰 · 경쟁 현황 (라운드 {faComp?.round ?? 1})</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono-stats">
                    {activeBiddingClubCount}/10개 구단 입찰 중 · 총 {totalOpenBids}건
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  KBO 전체 10개 구단이 예산·샐러리캡·포지션 필요도·능력치를 평가해 FA 선수에게 자동으로 입찰합니다. 우리 구단 자동 입찰이 낙찰되어도 단장 최종 승인 전에는 계약이 자동 체결되지 않습니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono-stats text-[11px] font-bold">
                  외부 FA 한도 {myExternalFaCount}/{MAX_EXTERNAL_FA_PER_CLUB}명
                </span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const nextEnabled = !userAutoBidOn;
                      const res = setUserClubAutoFaBidEnabled(career, nextEnabled);
                      onUpdateCareer(res.nextCareer, res.backupSnapshot);
                      setNotice({
                        type: 'ok',
                        text: nextEnabled
                          ? '우리 구단 FA 자동 입찰을 활성화했습니다. (10개 구단 전원 자동 입찰 참여 · 최종 체결은 단장 승인 필수)'
                          : '우리 구단 FA 자동 입찰을 해제했습니다. (수동 입찰 유지 · AI 9개 구단 자동 입찰은 계속 작동)',
                      });
                    } catch (err) {
                      setNotice({ type: 'err', text: err instanceof Error ? err.message : '자동 입찰 설정 오류' });
                    }
                  }}
                  className={`px-2.5 py-1.5 rounded border font-bold text-[11px] cursor-pointer ${
                    userAutoBidOn
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="우리 구단도 AI 9개 구단과 함께 자동 입찰에 참여할지 전환합니다"
                >
                  우리 구단 자동 입찰 {userAutoBidOn ? 'ON' : 'OFF'}
                </button>
                {onOpenLeagueAcquisitions && (
                  <button
                    type="button"
                    onClick={onOpenLeagueAcquisitions}
                    className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-[11px]"
                  >
                    전체 구단 영입 현황
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const res = advanceFaCompetitionRound(career);
                      onUpdateCareer(res.nextCareer, res.backupSnapshot);
                      const parts: string[] = [];
                      if (res.signedSummaries.length > 0) {
                        parts.push(`타 구단 FA 확정 ${res.signedSummaries.length}건 (${res.signedSummaries.slice(0, 2).join(', ')})`);
                      }
                      if (res.pendingUserApprovals.length > 0) {
                        parts.push(`우리 구단 최종 승인 대기 ${res.pendingUserApprovals.length}건`);
                      }
                      setNotice({
                        type: 'ok',
                        text:
                          parts.length > 0
                            ? `FA 협상 라운드 진행 완료 — ${parts.join(' · ')}`
                            : 'FA 협상 라운드 진행 완료 — 10개 구단 입찰 조건이 갱신되었습니다.',
                      });
                    } catch (err) {
                      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'FA 협상 진행 오류' });
                    }
                  }}
                  className="px-3 py-1.5 rounded team-accent-btn font-bold text-[11px] flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>10구단 FA 입찰 1라운드 진행</span>
                </button>
              </div>
            </div>

            {/* 10개 구단 실시간 자동 입찰 참여 현황판 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5 pt-1">
              {clubBidSummaries.map((c) => (
                <div
                  key={c.teamId}
                  className={`px-2 py-1.5 rounded border text-center space-y-0.5 ${
                    c.isUserClub
                      ? 'team-accent-border team-accent-soft'
                      : c.activeBidCount > 0
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-950/60'
                      : 'border-slate-200/70 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/30 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <TeamLogo teamId={c.teamId} size="xs" />
                    <span className="text-[11px] font-extrabold text-slate-900 dark:text-white truncate">
                      {KBO_TEAMS[c.teamId].shortName}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono-stats font-bold text-orange-600 dark:text-amber-400">
                    입찰 {c.activeBidCount}건
                  </div>
                  <div className="text-[9px] font-mono-stats text-slate-500 dark:text-slate-400">
                    외부 {c.externalSignings}/{MAX_EXTERNAL_FA_PER_CLUB}
                    {c.isUserClub ? (c.autoBidActive ? ' · 자동' : ' · 수동') : ''}
                  </div>
                </div>
              ))}
            </div>

            {/* 단장 최종 승인 대기 배너 (사용자 구단 자동 체결 금지 보장) */}
            {pendingUserApprovals.length > 0 && (
              <div className="p-3 rounded border border-emerald-500/60 bg-emerald-50/70 dark:bg-emerald-950/30 space-y-2">
                <div className="font-extrabold text-emerald-800 dark:text-emerald-300">
                  단장 최종 계약 승인 대기 ({pendingUserApprovals.length}명) — 승인 시 즉시 계약 체결 및 타 구단 입찰 마감
                </div>
                {pendingUserApprovals.map((neg) => {
                  const myBid = neg.bids.find((b) => b.teamId === career.playerTeamId);
                  if (!myBid) return null;
                  return (
                    <div
                      key={neg.playerId}
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded bg-white dark:bg-slate-900 border border-emerald-400/40"
                    >
                      <div>
                        <span className="font-extrabold">{neg.playerName}</span>{' '}
                        <span className="font-mono-stats text-emerald-700 dark:text-emerald-400 font-bold">
                          {myBid.years}년 총액 {myBid.totalBillion.toFixed(1)}억
                        </span>{' '}
                        <span className="text-[11px] text-slate-500">
                          (
                          {myBid.isOriginalClub
                            ? '원소속 재계약 · 보상 없음'
                            : career.players[neg.playerId]?.releasedAfter2026
                            ? '방출 자유계약 · 보상 없음'
                            : `외부 FA ${neg.faGrade}등급`}
                          )
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const res = declinePendingUserFaApproval(career, neg.playerId);
                            onUpdateCareer(res.nextCareer, res.backupSnapshot);
                            setNotice({ type: 'ok', text: `${neg.playerName} FA 입찰을 철회했습니다.` });
                          }}
                          className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 font-semibold"
                        >
                          입찰 철회
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(career.pendingFaProtection)}
                          onClick={() => {
                            const targetPlayer = career.players[neg.playerId];
                            if (!targetPlayer) return;
                            const isOrig =
                              (neg.formerTeamId ?? targetPlayer.formerTeamId ?? targetPlayer.teamId) ===
                              career.playerTeamId;
                            const isReleasedFreeAgent = Boolean(targetPlayer.releasedAfter2026);
                            const exactBreakdown = calculateExactFaContractBreakdown(
                              myBid.totalBillion,
                              myBid.years,
                              {
                                age: targetPlayer.age,
                                injuryHistoryCount: targetPlayer.injuryHistoryCount,
                                season: career.season,
                              }
                            );
                            const matchedExt = !isOrig
                              ? getExternalFaMarket(career).find((x) => x.player.id === neg.playerId)
                              : undefined;
                            const cComp =
                              !isOrig && !isReleasedFreeAgent && (matchedExt?.grade ?? neg.faGrade) === 'C'
                                ? (matchedExt?.cashCompBillion ?? 0)
                                : 0;
                            const preview = previewContractSalaryCapImpact(career, {
                              title: `${targetPlayer.name} ${isOrig ? '원소속 FA' : '외부 FA'} 최종 계약 승인 (${exactBreakdown.years}년 ${exactBreakdown.totalBillion.toFixed(1)}억 원)`,
                              items: [
                                {
                                  existingPlayerId: targetPlayer.id,
                                  playerName: targetPlayer.name,
                                  category: '국내',
                                  years: exactBreakdown.years,
                                  annualSalaryBillion: exactBreakdown.annualSalaryBillion,
                                  signingBonusBillion: exactBreakdown.signingBonusBillion,
                                  optionBonusExpectedBillion: Number(
                                    (exactBreakdown.optionTotalBillion / Math.max(1, exactBreakdown.years)).toFixed(2)
                                  ),
                                  cashRequiredNowBillion: exactBreakdown.signingBonusBillion,
                                  extraCompensationBillion: cComp,
                                },
                              ],
                            });
                            setPendingContract({
                              preview,
                              confirmLabel: '단장 최종 FA 계약 확정 승인',
                              execute: () => {
                                try {
                                  setNotice(null);
                                  const res = signExternalFaPlayer(
                                    career,
                                    neg.playerId,
                                    myBid.years,
                                    myBid.totalBillion,
                                    { fromPendingApproval: true }
                                  );
                                  if (res.accepted) {
                                    setProtectedSelection([]);
                                  }
                                  onUpdateCareer(res.nextCareer, res.backupSnapshot);
                                  setNotice({ type: res.accepted ? 'ok' : 'err', text: res.message });
                                } catch (err) {
                                  setNotice({
                                    type: 'err',
                                    text: err instanceof Error ? err.message : 'FA 최종 승인 오류',
                                  });
                                }
                              },
                            });
                          }}
                          className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold"
                        >
                          단장 최종 계약 승인
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending FA Compensation Protection Roster Panel (#27 · KBO 자동 제외 규정 완전 반영) */}
          {career.pendingFaProtection && (() => {
            const pending = career.pendingFaProtection!;
            const faPool = buildTeamFaProtectionPool(career, career.playerTeamId, {
              faSeason: career.season,
              signedPlayerId: pending.signedPlayerId,
              grade: pending.faGrade,
            });
            const limit = faPool.protectionLimit;
            const eligibleIdSet = new Set(faPool.selectableEligible.map((p) => p.id));
            const validSelected = protectedSelection.filter((id) => eligibleIdSet.has(id));
            return (
              <div className="border border-amber-500/70 bg-amber-50/70 dark:bg-amber-950/30 rounded-md p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-black text-amber-800 dark:text-amber-300">
                      FA {pending.faGrade}등급 보상선수 보호명단 제출 필수 ({pending.signedPlayerName} 영입)
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {KBO_TEAMS[pending.fromTeamId].name}에 제출할 보호선수 최대{' '}
                      <strong>{limit}명</strong>을 선택하세요 ({faPool.ruleSummary}).
                      <br />
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        당해 FA 선수·신인·외국인/아시아쿼터·군보류·FA 보상 이적자({faPool.autoExempt.length}명)는 자동 보호(제외)되어 {limit}인 정원에 포함되지 않으며 지명 대상에서 제외됩니다.
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const autoIds = faPool.selectableEligible
                          .slice(0, limit)
                          .map((p) => p.id);
                        setProtectedSelection(autoIds);
                      }}
                      className="px-2.5 py-1.5 rounded border border-amber-600/60 font-bold text-amber-800 dark:text-amber-200"
                    >
                      상위 {limit}인 자동 채우기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const { nextCareer, backupSnapshot, takenPlayerName } = confirmFaProtectionList(
                            career,
                            validSelected
                          );
                          onUpdateCareer(nextCareer, backupSnapshot);
                          setProtectedSelection([]);
                          setNotice({
                            type: 'ok',
                            text: takenPlayerName
                              ? `보호명단 제출 완료 — 상대 구단이 보상선수로 ${takenPlayerName}을(를) 지명했습니다.`
                              : '보호명단 제출 및 금전 보상 정산이 완료되었습니다.',
                          });
                        } catch (err) {
                          setNotice({ type: 'err', text: err instanceof Error ? err.message : '보호명단 오류' });
                        }
                      }}
                      className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold"
                    >
                      보호명단 최종 제출 ({validSelected.length}/{limit})
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={protectionSearch}
                      onChange={(e) => setProtectionSearch(e.target.value)}
                      placeholder="보호명단 선수 이름·포지션 검색"
                      className="w-full pl-8 pr-2.5 py-1 text-xs rounded border border-amber-400/60 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <span className="text-[11px] font-mono-stats text-amber-800 dark:text-amber-300 font-semibold">
                    보호 선택 {validSelected.length}/{limit}명 · 선택 가능 대상{' '}
                    {faPool.selectableEligible.length}명 · 규정상 자동 보호(제외) {faPool.autoExempt.length}명
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-1.5 max-h-64 overflow-y-auto overscroll-contain pr-1">
                  {faPool.selectableEligible
                    .filter((p) => matchesQuery(protectionSearch, p.name, p.position, p.rosterTier))
                    .map((p) => {
                      const checked = validSelected.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setProtectedSelection((prev) => {
                              const cleaned = prev.filter((id) => eligibleIdSet.has(id));
                              return checked
                                ? cleaned.filter((id) => id !== p.id)
                                : cleaned.length < limit
                                  ? [...cleaned, p.id]
                                  : cleaned;
                            })
                          }
                          className={`text-left px-2 py-1.5 rounded border text-[11px] ${
                            checked
                              ? 'border-indigo-600 bg-indigo-600 text-white font-bold'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="truncate">
                            {p.name} ({formatCompactPlayerPosition(p, 1)})
                          </div>
                          <div className="text-[10px] opacity-80 font-mono-stats">
                            OVR {p.ability}/{p.potential} · {p.age}세 · {p.rosterTier}
                          </div>
                        </button>
                      );
                    })}
                </div>

                {faPool.autoExempt.length > 0 && (
                  <div className="pt-2.5 border-t border-amber-400/40 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                      <span className="inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        규정상 자동 보호(제외) 선수 ({faPool.autoExempt.length}명) — 보호 정원({limit}명) 미포함 · 선택 버튼 비활성화 · 보상 지명 불가
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-40 overflow-y-auto overscroll-contain pr-1">
                      {faPool.autoExempt
                        .filter((item) =>
                          matchesQuery(
                            protectionSearch,
                            item.player.name,
                            item.player.position,
                            item.exemptCategory ?? '',
                            item.reason
                          )
                        )
                        .map((item) => (
                          <button
                            key={item.player.id}
                            type="button"
                            disabled
                            aria-disabled="true"
                            title={item.reason}
                            className="text-left px-2 py-1.5 rounded border border-emerald-500/35 bg-emerald-500/10 text-[10px] text-emerald-900 dark:text-emerald-200 opacity-80 cursor-not-allowed select-none"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold truncate">
                                {item.player.name} ({item.player.position})
                              </span>
                              <span className="px-1 py-0.2 rounded bg-emerald-600/20 font-bold shrink-0">
                                {item.exemptCategory}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-1 text-[9px] opacity-80">
                              <span className="truncate">{item.reason}</span>
                              <span className="inline-flex items-center gap-0.5 font-bold shrink-0">
                                <Lock className="w-2.5 h-2.5" />
                                선택 불가
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Own Club Departed FA Players (자동 이탈 → 원소속 재계약 협상 · 보상 없음) */}
          {myDepartedFa.length > 0 && (
            <div className="border border-orange-500/60 bg-orange-50/50 dark:bg-orange-950/20 rounded-md p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-extrabold text-orange-800 dark:text-orange-300">
                    FA 자격 취득 · 구단 자동 이탈 선수 ({myDepartedFa.length}명)
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    FA가 되어 팀 로스터에서 자동으로 이탈했습니다. 원소속팀 잔류 재계약 시 보상선수·보상금이 면제되며, 미계약 시 차기 시즌 타 구단으로 이적합니다.
                  </p>
                </div>
              </div>
              <div className="max-h-[380px] overflow-y-auto overscroll-contain pr-1.5 divide-y divide-orange-200/70 dark:divide-orange-900/40">
                {myDepartedFa.map((item) => {
                  const p = item.player;
                  const years = Math.min(item.maxRealisticYears, faOfferYears[p.id] ?? item.fairYears);
                  const totalStr = faOfferTotal[p.id] ?? item.fairTotalBillion.toFixed(1);
                  const amtNum = Number(totalStr);
                  const validAmt = Number.isFinite(amtNum) && amtNum > 0 ? amtNum : item.fairTotalBillion;
                  const exactOffer = calculateExactFaContractBreakdown(validAmt, years, {
                    age: p.age,
                    injuryHistoryCount: p.injuryHistoryCount,
                    season: career.season,
                  });
                  const estSigningBonus = exactOffer.signingBonusBillion;
                  const estAnnual = exactOffer.annualSalaryBillion;
                  const estFirstYearCash = Number((estSigningBonus + estAnnual).toFixed(2));
                  const livePreview = previewContractSalaryCapImpact(career, {
                    title: `${p.name} 원소속 FA 재계약 승인 (${years}년 총액 ${exactOffer.totalBillion.toFixed(1)}억 원)`,
                    items: [
                      {
                        existingPlayerId: p.id,
                        playerName: p.name,
                        category: '국내',
                        years,
                        annualSalaryBillion: estAnnual,
                        signingBonusBillion: estSigningBonus,
                        cashRequiredNowBillion: estFirstYearCash,
                      },
                    ],
                  });
                  return (
                    <div key={p.id} className="py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 whitespace-nowrap min-w-0">
                          <TeamLogo teamId={career.playerTeamId} size="xs" />
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(p.id)}
                            className="font-extrabold text-slate-900 dark:text-white hover:underline truncate"
                          >
                            {p.name}
                          </button>
                          <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                          {item.isMegaFranchise ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-[10px] font-extrabold text-amber-800 dark:text-amber-300 shrink-0">
                              FA · {item.tierLabel}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                              · FA ({item.tierLabel})
                            </span>
                          )}
                          <span className="font-mono-stats text-slate-500 dark:text-slate-400 shrink-0">
                            {p.position} · 만 {p.age}세 · OVR {p.ability}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          원소속팀 재계약 보상 없음 · 적정 기준 {item.fairYears}년 {item.fairTotalBillion.toFixed(1)}억 (최대 {item.maxRealisticYears}년) · {item.valuationSummary}
                        </div>
                        <div className="text-[10px] font-mono-stats text-slate-500 dark:text-slate-400">
                          제안 구성: 계약금 {exactOffer.signingBonusBillion.toFixed(2)}억 + 연봉 {exactOffer.annualSalaryBillion.toFixed(2)}억×{years}년 + 옵션 {exactOffer.optionTotalBillion.toFixed(2)}억 = 총 {formatBillionExactKorean(exactOffer.totalBillion)}
                        </div>
                        {(() => {
                          const neg = faComp?.negotiations[p.id];
                          if (!neg || (neg.bids.length === 0 && !neg.mlbOffer && neg.mlbStatus !== 'MLB협상결렬')) {
                            return null;
                          }
                          return (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
                              {neg.bids.length > 0 && (
                                <>
                                  <span className="font-bold text-orange-600 dark:text-amber-400">
                                    경쟁 입찰 ({neg.bids.length}개 구단):
                                  </span>
                                  {neg.bids.map((b) => (
                                    <span
                                      key={b.teamId}
                                      className={`px-1.5 py-0.5 rounded border font-mono-stats ${
                                        b.teamId === career.playerTeamId
                                          ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 text-slate-600 dark:text-slate-300'
                                      }`}
                                    >
                                      {KBO_TEAMS[b.teamId].shortName} {b.years}년 {b.totalBillion.toFixed(1)}억
                                      {b.isOriginalClub ? ' (원소속)' : ''}
                                      {b.teamId === career.playerTeamId && b.isAutoBid ? ' · 자동' : ''}
                                    </span>
                                  ))}
                                </>
                              )}
                              {neg.mlbOffer && neg.mlbStatus === 'MLB제안접수' && (
                                <span
                                  title={neg.mlbOffer.evaluationNote}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-sky-500/60 bg-sky-500/15 text-sky-800 dark:text-sky-200 font-mono-stats font-bold"
                                >
                                  <MlbTeamLogo teamName={neg.mlbOffer.mlbTeam} size="xs" />
                                  <span>
                                    MLB {getMlbClubMeta(neg.mlbOffer.mlbTeam).koreanName} {neg.mlbOffer.years}년 $
                                    {neg.mlbOffer.guaranteedUsdMillions}M
                                  </span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        <div className="text-[11px] font-mono-stats text-slate-600 dark:text-slate-300">
                          사전 샐러리캡 검사:{' '}
                          {livePreview.after.overCapBillion > 0 ? (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">
                              초과 예상 +{formatBillionExactKorean(livePreview.after.overCapBillion)} · 제재금{' '}
                              {formatBillionExactKorean(livePreview.after.luxuryTaxBillion)} ({livePreview.after.luxuryTaxRatePct}%)
                              {livePreview.willTriggerDraftPenalty ? ' · 1R -9단계 경고' : ''}
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              상한 이내 (반영 후 {livePreview.after.teamTop40PayrollBillion.toFixed(2)}억 / {livePreview.after.capBillion.toFixed(2)}억)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          value={years}
                          onChange={(e) => setFaOfferYears((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                        >
                          {Array.from({ length: item.maxRealisticYears }, (_, idx) => idx + 1).map((y) => (
                            <option key={y} value={y}>
                              {y}년
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={totalStr}
                          onChange={(e) => setFaOfferTotal((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-24 px-2 py-1 text-right font-mono-stats rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <span className="text-slate-500">억</span>
                        <button
                          type="button"
                          onClick={() => {
                            const amt = Number(totalStr);
                            if (!Number.isFinite(amt) || amt <= 0) {
                              setNotice({ type: 'err', text: '올바른 계약 총액을 입력해 주세요.' });
                              return;
                            }
                            setPendingContract({
                              preview: livePreview,
                              confirmLabel: '단장 승인 · 원소속 FA 재계약 제안',
                              execute: () => {
                                try {
                                  setNotice(null);
                                  const res = signExternalFaPlayer(career, p.id, years, amt);
                                  onUpdateCareer(res.nextCareer, res.backupSnapshot);
                                  setNotice({ type: res.accepted ? 'ok' : 'err', text: res.message });
                                } catch (err) {
                                  setNotice({ type: 'err', text: err instanceof Error ? err.message : 'FA 재계약 오류' });
                                }
                              },
                            });
                          }}
                          className="px-3 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white font-bold"
                        >
                          원소속 재계약 제안
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* External FA Market (#6, #23, #25, #26, #33) */}
          {(() => {
            const filteredExternalFa = externalFaMarket.filter((item) =>
              matchesQuery(
                faSearch,
                item.player.name,
                item.player.position,
                KBO_TEAMS[item.player.teamId]?.name,
                KBO_TEAMS[item.player.teamId]?.shortName,
                item.grade
              )
            );
            return (
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-extrabold">외부 FA 시장 (A·B·C등급 보상 규정 · 에이전트 경쟁 협상)</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    고액 연봉만으로 무조건 계약되지 않으며 에이전트 성향(우승권·대형시장·장기보장)과 타 구단 경쟁 입찰이 반영됩니다.
                  </p>
                </div>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 font-mono-stats font-bold">
                  표시 {filteredExternalFa.length}명 / 등록 {externalFaMarket.length}명
                </span>
              </div>
              {externalFaMarket.length > 0 && (
                <div className="relative max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={faSearch}
                    onChange={(e) => setFaSearch(e.target.value)}
                    placeholder="FA 선수명 · 원소속팀 · 포지션 · 등급 검색"
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              )}
            </div>

            {externalFaMarket.length === 0 ? (
              <p className="text-slate-500 py-6 text-center">현재 계약 가능한 외부 FA 대상 선수가 없습니다.</p>
            ) : filteredExternalFa.length === 0 ? (
              <p className="text-slate-500 py-6 text-center">검색 조건에 해당하는 외부 FA 선수가 없습니다.</p>
            ) : (
              <div className="max-h-[520px] overflow-y-auto overscroll-contain px-4 divide-y divide-slate-100 dark:divide-slate-800">
                {filteredExternalFa.map((item) => {
                  const p = item.player;
                  const years = Math.min(item.maxRealisticYears, faOfferYears[p.id] ?? item.fairYears);
                  const totalStr = faOfferTotal[p.id] ?? item.fairTotalBillion.toFixed(1);
                  const amtNum = Number(totalStr);
                  const validAmt = Number.isFinite(amtNum) && amtNum > 0 ? amtNum : item.fairTotalBillion;
                  const exactOffer = calculateExactFaContractBreakdown(validAmt, years, {
                    age: p.age,
                    injuryHistoryCount: p.injuryHistoryCount,
                    season: career.season,
                  });
                  const estSigningBonus = exactOffer.signingBonusBillion;
                  const estAnnual = exactOffer.annualSalaryBillion;
                  const estFirstYearCash = Number((estSigningBonus + estAnnual).toFixed(2));
                  const estCompCash = item.cashCompBillion;
                  const livePreview = previewContractSalaryCapImpact(career, {
                    title: `${p.name} 외부 FA ${item.grade}등급 공식 제안 (${years}년 총액 ${exactOffer.totalBillion.toFixed(1)}억 원)`,
                    items: [
                      {
                        existingPlayerId: p.id,
                        playerName: p.name,
                        category: '국내',
                        years,
                        annualSalaryBillion: estAnnual,
                        signingBonusBillion: estSigningBonus,
                        cashRequiredNowBillion: estFirstYearCash,
                        extraCompensationBillion: estCompCash,
                        isNewIncomingPlayer: true,
                      },
                    ],
                    extraBlockingChecks: career.pendingFaProtection
                      ? ['미제출 FA 보상선수 보호명단을 먼저 제출해야 추가 외부 FA 계약이 가능합니다.']
                      : [],
                  });
                  return (
                    <div key={p.id} className="py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 whitespace-nowrap min-w-0">
                          <TeamLogo teamId={p.teamId} size="xs" />
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(p.id)}
                            className="font-extrabold text-slate-900 dark:text-white hover:underline truncate"
                          >
                            {p.name}
                          </button>
                          <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                          {item.isMegaFranchise ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-[10px] font-extrabold text-amber-800 dark:text-amber-300 shrink-0">
                              FA {item.grade}등급 · {item.tierLabel}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                              · FA {item.grade}등급 ({item.tierLabel})
                            </span>
                          )}
                          <span className="font-mono-stats text-slate-500 shrink-0">
                            {p.position} · 만 {p.age}세 · OVR {p.ability}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            · 에이전트 {p.agent?.persona ?? '표준'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.compensationRule} · 기준 {item.fairYears}년 {item.fairTotalBillion.toFixed(1)}억 (최대 {item.maxRealisticYears}년) · {item.valuationSummary}
                        </div>
                        <div className="text-[10px] font-mono-stats text-slate-500 dark:text-slate-400">
                          제안 구성: 계약금 {exactOffer.signingBonusBillion.toFixed(2)}억 + 연봉 {exactOffer.annualSalaryBillion.toFixed(2)}억×{years}년 + 옵션 {exactOffer.optionTotalBillion.toFixed(2)}억 = 총 {formatBillionExactKorean(exactOffer.totalBillion)}
                        </div>
                        {(() => {
                          const neg = faComp?.negotiations[p.id];
                          if (!neg || (neg.bids.length === 0 && !neg.mlbOffer && neg.mlbStatus !== 'MLB협상결렬')) {
                            return null;
                          }
                          return (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
                              {neg.bids.length > 0 && (
                                <>
                                  <span className="font-bold text-orange-600 dark:text-amber-400">
                                    경쟁 입찰 ({neg.bids.length}개 구단):
                                  </span>
                                  {neg.bids.map((b) => (
                                    <span
                                      key={b.teamId}
                                      className={`px-1.5 py-0.5 rounded border font-mono-stats ${
                                        b.teamId === career.playerTeamId
                                          ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300'
                                      }`}
                                    >
                                      {KBO_TEAMS[b.teamId].shortName} {b.years}년 {b.totalBillion.toFixed(1)}억
                                      {b.isOriginalClub ? ' (원소속)' : ''}
                                      {b.teamId === career.playerTeamId && b.isAutoBid ? ' · 자동' : ''}
                                    </span>
                                  ))}
                                </>
                              )}
                              {neg.mlbOffer && neg.mlbStatus === 'MLB제안접수' && (
                                <span
                                  title={neg.mlbOffer.evaluationNote}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-sky-500/60 bg-sky-500/15 text-sky-800 dark:text-sky-200 font-mono-stats font-bold"
                                >
                                  <MlbTeamLogo teamName={neg.mlbOffer.mlbTeam} size="xs" />
                                  <span>
                                    MLB {getMlbClubMeta(neg.mlbOffer.mlbTeam).koreanName} {neg.mlbOffer.years}년 $
                                    {neg.mlbOffer.guaranteedUsdMillions}M
                                  </span>
                                </span>
                              )}
                              {neg.mlbStatus === 'MLB협상결렬' && (
                                <span className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold">
                                  MLB 협상 결렬 · KBO FA 잔류 협상 중
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        <div className="text-[11px] font-mono-stats text-slate-600 dark:text-slate-300">
                          FA 사전 샐러리캡 검사:{' '}
                          {livePreview.after.overCapBillion > 0 ? (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">
                              초과 예상 +{formatBillionExactKorean(livePreview.after.overCapBillion)} · 제재금{' '}
                              {formatBillionExactKorean(livePreview.after.luxuryTaxBillion)} ({livePreview.after.luxuryTaxRatePct}%)
                              {livePreview.willTriggerDraftPenalty ? ' · 1R -9단계 경고' : ''}
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              상한 이내 (반영 후 {livePreview.after.teamTop40PayrollBillion.toFixed(2)}억 / {livePreview.after.capBillion.toFixed(2)}억)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          value={years}
                          onChange={(e) => setFaOfferYears((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                        >
                          {Array.from({ length: item.maxRealisticYears }, (_, idx) => idx + 1).map((y) => (
                            <option key={y} value={y}>
                              {y}년
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={totalStr}
                          onChange={(e) => setFaOfferTotal((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-24 px-2 py-1 text-right font-mono-stats rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <span className="text-slate-500">억</span>
                        <button
                          type="button"
                          disabled={Boolean(career.pendingFaProtection)}
                          onClick={() => {
                            const amt = Number(totalStr);
                            if (!Number.isFinite(amt) || amt <= 0) {
                              setNotice({ type: 'err', text: '올바른 FA 입찰 총액을 입력해 주세요.' });
                              return;
                            }
                            try {
                              setNotice(null);
                              const res = submitUserClubFaBid(career, p.id, years, amt);
                              onUpdateCareer(res.nextCareer, res.backupSnapshot);
                              setNotice({ type: 'ok', text: res.message });
                            } catch (err) {
                              setNotice({
                                type: 'err',
                                text: err instanceof Error ? err.message : 'FA 입찰 오류',
                              });
                            }
                          }}
                          className="px-2.5 py-1.5 rounded border border-indigo-500/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40 font-bold"
                        >
                          입찰 참여
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(career.pendingFaProtection)}
                          onClick={() => {
                            const amt = Number(totalStr);
                            if (!Number.isFinite(amt) || amt <= 0) {
                              setNotice({ type: 'err', text: '올바른 FA 제안 총액을 입력해 주세요.' });
                              return;
                            }
                            setPendingContract({
                              preview: livePreview,
                              confirmLabel: '단장 승인 · 외부 FA 공식 제안',
                              execute: () => {
                                try {
                                  setNotice(null);
                                  const res = signExternalFaPlayer(career, p.id, years, amt);
                                  onUpdateCareer(res.nextCareer, res.backupSnapshot);
                                  setNotice({ type: res.accepted ? 'ok' : 'err', text: res.message });
                                } catch (err) {
                                  setNotice({ type: 'err', text: err instanceof Error ? err.message : 'FA 제안 오류' });
                                }
                              },
                            });
                          }}
                          className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold"
                        >
                          공식 제안
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            );
          })()}

          {/* Overseas Returnees (#10) */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold">해외 리그 복귀 · 해외 직행 선수 시장</div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  MLB 포스팅 진출 선수(김하성·이정후·송성문 등)는 원소속 구단 우선협상권이 적용되며, 고교 졸업 후 해외 직행 선수(박효준·배지환 등)는 전 구단 동등 조건으로 영입할 수 있습니다. (타 구단 AI도 FA 라운드·시즌 진행 중 영입 경쟁에 참여)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {overseasReturnees.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const res = advanceOverseasReturneeMarketRound(career);
                      onUpdateCareer(res.nextCareer, res.backupSnapshot);
                      setNotice({
                        type: 'ok',
                        text:
                          res.signedSummaries.length > 0
                            ? `타 구단 해외 복귀 영입 체결: ${res.signedSummaries.join(' · ')}`
                            : '타 구단 해외 복귀 영입 검토를 마쳤습니다. (추가 계약 없음)',
                      });
                    }}
                    className="px-2.5 py-1 rounded border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer"
                  >
                    타 구단 영입 경쟁 1라운드 진행
                  </button>
                )}
                <span className="text-[11px] font-mono-stats text-slate-500">
                  등록 {overseasReturnees.length}명
                </span>
              </div>
            </div>
            {overseasReturnees.length === 0 ? (
              <p className="text-slate-500">현재 복귀 협상 가능한 해외파 선수가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto overscroll-contain pr-1">
                {overseasReturnees.map((cand) => {
                  const terms = getOverseasReturneeContractTerms(cand, career.playerTeamId);
                  const { hasOriginalClub: hasOrig, isOriginalClub: isOrig, years, finalTotal, signingBonus: bonus, annualSalary: annual } = terms;
                  return (
                    <div key={cand.id} className="p-3 rounded border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2">
                      <div>
                        <div className="flex items-center justify-between font-bold">
                          <span>{cand.playerName} ({cand.position} · {cand.age}세)</span>
                          <span className="font-mono-stats text-indigo-600 dark:text-indigo-400">OVR {cand.ability}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {cand.overseasClub} ·{' '}
                          {hasOrig ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                              원소속 {KBO_TEAMS[cand.originalKboTeamId!].shortName} (포스팅)
                            </span>
                          ) : (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              원소속팀 없음 (해외 직행)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{cand.overseasSummary}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const preview = previewContractSalaryCapImpact(career, {
                            title: `${cand.playerName} 해외 복귀 계약 승인 (${years}년 총액 ${finalTotal}억 원)`,
                            items: [
                              {
                                playerName: cand.playerName,
                                category: '국내',
                                years,
                                annualSalaryBillion: annual,
                                signingBonusBillion: bonus,
                                cashRequiredNowBillion: bonus,
                                isNewIncomingPlayer: true,
                              },
                            ],
                          });
                          setPendingContract({
                            preview,
                            confirmLabel: '단장 승인 · 해외 복귀 영입 확정',
                            execute: () => {
                              try {
                                const { nextCareer, backupSnapshot } = signOverseasReturnee(career, cand.id);
                                onUpdateCareer(nextCareer, backupSnapshot);
                                setNotice({ type: 'ok', text: `${cand.playerName} 해외 복귀 영입 완료 (${years}년 ${finalTotal}억)` });
                              } catch (err) {
                                setNotice({ type: 'err', text: err instanceof Error ? err.message : '해외 복귀 영입 오류' });
                              }
                            },
                          });
                        }}
                        className="w-full py-1.5 rounded bg-slate-900 dark:bg-indigo-600 text-white font-bold cursor-pointer"
                      >
                        {years}년 {finalTotal}억 영입{' '}
                        {!hasOrig ? '(동등 조건)' : isOrig ? '(우선권 12% 할인)' : '(원소속 외 +12%)'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {signedOverseasReturnees.length > 0 && (
              <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  구단별 해외 복귀 영입 완료 ({signedOverseasReturnees.length}명)
                </div>
                <div className="flex flex-wrap gap-2">
                  {signedOverseasReturnees.map((cand) => {
                    const teamMeta = cand.signedTeamId ? KBO_TEAMS[cand.signedTeamId] : null;
                    const isMine = cand.signedTeamId === career.playerTeamId;
                    return (
                      <div
                        key={`signed-${cand.id}`}
                        className={`px-2.5 py-1 rounded border text-[11px] flex items-center gap-1.5 ${
                          isMine
                            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span className="font-extrabold">
                          {teamMeta ? teamMeta.shortName : 'KBO 구단'}
                        </span>
                        <span className="text-slate-400">←</span>
                        <span className="font-bold">
                          {cand.playerName} ({cand.position})
                        </span>
                        <span className="font-mono-stats text-slate-500 dark:text-slate-400">
                          {cand.signedYears ?? cand.demandedYears}년 {cand.signedTotalBillion ?? cand.demandedTotalBillion}억
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* TAB 1: AI-Delegated One-Click Domestic Contracts with Budget Cap */}
      {subTab === 'contracts' && (
        <div className="space-y-4">
          {/* Franchise Star Long-Term Special Contract Panel (4~6년) */}
          {(() => {
            const franchiseStars = getTeamFranchiseStars(career, career.playerTeamId).filter(
              (a) => career.players[a.playerId]?.category === '국내'
            );
            if (franchiseStars.length === 0) return null;
            const filteredFranchiseStars = franchiseStars.filter((star) => {
              const pl = career.players[star.playerId];
              return matchesQuery(
                franchiseSearch,
                pl?.name,
                pl?.position,
                pl?.uniformNumber,
                star.tier,
                star.protectionTier
              );
            });
            return (
              <div className="border border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/15 rounded-md overflow-hidden text-xs flex flex-col">
                {/* 고정 상단 헤더: 제목 · 등록 인원 · 검색 */}
                <div className="p-4 border-b border-amber-200/80 dark:border-amber-900/50 bg-amber-50/90 dark:bg-amber-950/40 space-y-2.5 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-extrabold text-amber-800 dark:text-amber-300">
                        프랜차이즈 스타 특별 재계약 (전성기 3~6년 · 만 35세+ 베테랑 1~2년 · 원클럽 충성 할인)
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        소속 기간·통산 기록·공헌도로 선정된 프랜차이즈 스타와 재계약을 체결하면 팬 지지율과 구단 평판이 상승합니다. 고령 베테랑(만 35세 이상)은 현실적으로 1~2년 단기 계약만 제안할 수 있습니다.
                      </p>
                    </div>
                    <span className="font-mono-stats text-[11px] text-amber-800 dark:text-amber-200 font-bold px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
                      등록 {franchiseStars.length}명 · 표시 {filteredFranchiseStars.length}명
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                      <Search className="w-3.5 h-3.5 text-amber-700/60 dark:text-amber-300/60 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={franchiseSearch}
                        onChange={(e) => setFranchiseSearch(e.target.value)}
                        placeholder="프랜차이즈 선수 이름 · 포지션 · 등급 검색"
                        className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded border border-amber-400/50 bg-white dark:bg-slate-950"
                      />
                    </div>
                    {franchiseStars.length > 5 && (
                      <span className="text-[10px] text-amber-800/80 dark:text-amber-300/80 font-medium">
                        목록 영역에서 마우스 휠·스크롤바로 마지막 선수까지 확인할 수 있습니다.
                      </span>
                    )}
                  </div>
                </div>

                {/* 세로 스크롤 목록 영역 (전체 등록 선수 누락 없이 출력) */}
                {filteredFranchiseStars.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">
                    검색 조건에 해당하는 프랜차이즈 선수가 없습니다.
                  </div>
                ) : (
                  <div
                    data-testid="franchise-stars-scroll-list"
                    className="max-h-[420px] overflow-y-auto overscroll-contain px-4 divide-y divide-amber-200/70 dark:divide-amber-900/40"
                  >
                    {filteredFranchiseStars.map((star, idx) => {
                      const p = career.players[star.playerId];
                      if (!p) return null;
                      const yearRange = getFranchiseContractYearRange(p.age, p.ability);
                      const rawSelectedYears = franYearsMap[p.id] ?? yearRange.defaultYears;
                      const years = Math.max(
                        yearRange.minYears,
                        Math.min(yearRange.maxYears, rawSelectedYears)
                      );
                      const yearOptions = Array.from(
                        { length: yearRange.maxYears - yearRange.minYears + 1 },
                        (_, i) => yearRange.minYears + i
                      );
                      const defaultAnnual = Math.max(3, Number(((p.ability - 65) * 0.58).toFixed(1)));
                      const defaultBonus =
                        years === 1
                          ? 0
                          : Math.max(
                              yearRange.isVeteranShortTerm ? 0.5 : 2,
                              Number((defaultAnnual * years * (yearRange.isVeteranShortTerm ? 0.18 : 0.25)).toFixed(1))
                            );
                      const annualVal = Number(franAnnualMap[p.id] ?? defaultAnnual);
                      const bonusVal = Number(franBonusMap[p.id] ?? defaultBonus);
                      const safeAnnual = Number.isFinite(annualVal) && annualVal > 0 ? annualVal : defaultAnnual;
                      const safeBonus = Number.isFinite(bonusVal) && bonusVal >= 0 ? bonusVal : defaultBonus;
                      const estTotal = Number((safeAnnual * years + safeBonus).toFixed(1));
                      const contractKindLabel = yearRange.isVeteranShortTerm ? '베테랑 재계약' : '장기계약';

                      return (
                        <div
                          key={p.id}
                          data-testid="franchise-star-row"
                          className="py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 whitespace-nowrap min-w-0">
                              <span className="font-mono-stats text-[10px] text-amber-700/70 dark:text-amber-300/70 font-bold w-5 shrink-0">
                                {idx + 1}.
                              </span>
                              <button
                                type="button"
                                onClick={() => onSelectPlayer?.(p.id)}
                                className="font-extrabold text-slate-900 dark:text-white hover:underline truncate"
                              >
                                {p.name}
                              </button>
                              <FranchiseStarIcon
                                active={star.tier === '레전드' || star.tier === '핵심 프랜차이즈'}
                                title={star.tier}
                              />
                              <PlayerCompactTag career={career} player={p} />
                              <span className="font-mono-stats text-slate-500 shrink-0">
                                {p.position} · {p.age}세 · OVR {p.ability} · {star.tenureSeasons}시즌
                              </span>
                              {yearRange.isVeteranShortTerm && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                                  베테랑 1~2년
                                </span>
                              )}
                              {p.franchiseLongTermSigned && (
                                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                                  · {contractKindLabel}
                                </span>
                              )}
                            </div>
                            <div className="pl-7 text-[11px] text-slate-500 font-mono-stats">
                              현재 계약:{' '}
                              {formatKrwContractSummary({
                                years: p.contract.years,
                                totalBillion: p.contract.totalValue,
                                annualSalaryBillion: p.contract.annualSalary,
                                signingBonusBillion: p.contract.signingBonus,
                                startSeason: p.contract.startSeason,
                              })}{' '}
                              · 기념상품 연 {star.annualMerchBillion}억
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <select
                              value={years}
                              onChange={(e) =>
                                setFranYearsMap((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))
                              }
                              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                            >
                              {yearOptions.map((y) => (
                                <option key={y} value={y}>
                                  {y}년
                                </option>
                              ))}
                            </select>
                            <span className="text-slate-500">연봉</span>
                            <input
                              type="number"
                              step="0.5"
                              min="1"
                              max="40"
                              value={franAnnualMap[p.id] ?? String(defaultAnnual)}
                              onChange={(e) =>
                                setFranAnnualMap((prev) => ({ ...prev, [p.id]: e.target.value }))
                              }
                              className="w-16 px-1.5 py-1 text-right font-mono-stats rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                            <span className="text-slate-500">계약금</span>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max="100"
                              value={franBonusMap[p.id] ?? String(defaultBonus)}
                              onChange={(e) =>
                                setFranBonusMap((prev) => ({ ...prev, [p.id]: e.target.value }))
                              }
                              className="w-16 px-1.5 py-1 text-right font-mono-stats rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                            <span className="font-mono-stats font-bold text-slate-700 dark:text-slate-200">
                              총 {estTotal}억
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const preview = previewContractSalaryCapImpact(career, {
                                  title: `${p.name}(${star.tier}) 프랜차이즈 ${contractKindLabel} (${years}년 총 ${estTotal}억)`,
                                  items: [
                                    {
                                      existingPlayerId: p.id,
                                      playerName: p.name,
                                      category: '국내',
                                      years,
                                      annualSalaryBillion: safeAnnual,
                                      signingBonusBillion: safeBonus,
                                      cashRequiredNowBillion: safeBonus,
                                    },
                                  ],
                                });
                                setPendingContract({
                                  preview,
                                  confirmLabel: `단장 승인 · 프랜차이즈 ${contractKindLabel} 체결`,
                                  execute: () => {
                                    try {
                                      setNotice(null);
                                      const res = proposeFranchiseLongTermContract(
                                        career,
                                        p.id,
                                        years,
                                        safeAnnual,
                                        safeBonus
                                      );
                                      onUpdateCareer(res.nextCareer, res.backupSnapshot);
                                      setNotice({ type: 'ok', text: res.message });
                                    } catch (err) {
                                      setNotice({
                                        type: 'err',
                                        text: err instanceof Error ? err.message : `${contractKindLabel} 제안 오류`,
                                      });
                                    }
                                  },
                                });
                              }}
                              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold"
                            >
                              {yearRange.isVeteranShortTerm ? '재계약 제안' : '장기계약 제안'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {(() => {
            const filteredDomestic = visibleDomestic.filter((p) =>
              matchesQuery(domesticSearch, p.name, p.position, p.rosterTier, p.uniformNumber, p.contract.status)
            );
            return (
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setDomesticFilter('pending')}
                  className={`px-3 py-1 font-semibold ${
                    domesticFilter === 'pending'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : ''
                  }`}
                >
                  미계약·만료 ({pendingDomestic.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDomesticFilter('all')}
                  className={`px-3 py-1 font-semibold ${
                    domesticFilter === 'all'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : ''
                  }`}
                >
                  국내 전체 ({myDomestic.length})
                </button>
              </div>
              <div className="relative min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={domesticSearch}
                  onChange={(e) => setDomesticSearch(e.target.value)}
                  placeholder="국내 선수 이름·포지션 검색"
                  className="w-full pl-8 pr-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <span className="text-[11px] font-mono-stats text-slate-500">
                표시 {filteredDomestic.length}명 / 등록 {visibleDomestic.length}명
              </span>
            </div>

            <button
              type="button"
              disabled={pendingDomestic.length === 0}
              onClick={handleAutoSignAllPending}
              className="px-3 py-1.5 rounded team-accent-btn disabled:opacity-40 text-xs font-bold flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>보유자금 한도 내 일괄 체결</span>
            </button>
          </div>

          {visibleDomestic.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded">
              현재 미계약·만료 상태인 국내 선수가 없습니다. 상단에서 [국내 전체]를 선택해 연장 계약을 진행할 수 있습니다.
            </div>
          ) : filteredDomestic.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded">
              검색 조건에 해당하는 국내 선수가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto overscroll-contain border border-slate-200 dark:border-slate-800 rounded">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/95 sticky top-0 z-10 text-slate-500 shadow-xs">
                  <tr>
                    <th className="py-2 px-3">선수</th>
                    <th className="py-2 px-2">소속/포지션</th>
                    <th className="py-2 px-2 text-right">능력/잠재</th>
                    <th className="py-2 px-2">현재 상태</th>
                    <th className="py-2 px-2">산정 계약 조건</th>
                    <th className="py-2 px-2 text-right">총액</th>
                    <th className="py-2 px-3 text-right">계약 체결</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDomestic.map((p) => {
                    const quote = generateAiDomesticContract(p);
                    const exceedsCash = cashBalance !== null && quote.totalBillion > cashBalance;
                    const isRec = recommendedDomesticIds.has(p.id);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-semibold whitespace-nowrap">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            {p.uniformNumber !== undefined && (
                              <span className="font-mono-stats text-[10px] font-bold text-slate-400">
                                #{p.uniformNumber}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectPlayer?.(p.id)}
                              className="hover:text-orange-600 dark:hover:text-orange-400 hover:underline text-left"
                            >
                              {p.name}
                            </button>
                            <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                            <PlayerForeignFlag player={p} />
                            <span className="text-[11px] font-normal text-slate-400">{p.age}세</span>
                            <PlayerCompactTag career={career} player={p} />
                          </div>
                        </td>
                        <td className="py-2 px-2 text-slate-500">
                          {p.rosterTier} · {p.position}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-stats font-semibold">
                          {p.ability}/{p.potential}
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`text-[11px] font-semibold ${
                              p.contract.status === '확정'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {p.contract.status} ({p.contract.yearsRemaining}년)
                          </span>
                          <div className="text-[10px] font-mono-stats text-slate-400">
                            {p.contract.startSeason ?? career.season}~
                            {p.contract.endSeason ??
                              (p.contract.startSeason ?? career.season) +
                                Math.max(0, p.contract.years - 1)}
                            시즌
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="font-mono-stats font-bold text-slate-900 dark:text-white">
                            {quote.years}년 총액 {formatKrwBillionKorean(quote.totalBillion)}
                            <span className="font-normal text-[11px] text-slate-500 ml-1">
                              ({career.season}~{career.season + quote.years - 1})
                            </span>
                          </div>
                          <div className="text-[10px] font-mono-stats text-slate-500">
                            연 {formatKrwBillionKorean(quote.annualSalaryBillion).replace(' 원', '')}
                            {quote.signingBonusBillion > 0
                              ? ` + 계약금 ${formatKrwBillionKorean(quote.signingBonusBillion).replace(' 원', '')}`
                              : ''}
                            {' · '}
                            {quote.rationale}
                            {quote.optionType && quote.optionType !== '없음'
                              ? ` · ${quote.optionType}(+${quote.optionYearSalary}억)`
                              : ''}
                            {quote.incentiveTarget
                              ? ` · 인센티브(${quote.incentiveTarget} +${quote.incentiveBonusBillion}억)`
                              : ''}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono-stats font-bold">
                          <span className={exceedsCash ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}>
                            {quote.years}년 {formatKrwBillionKorean(quote.totalBillion)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {p.contract.optionType && p.contract.optionType !== '없음' && (
                              <button
                                type="button"
                                onClick={() => handleExerciseOption(p.id, true)}
                                className="px-2 py-1 rounded text-[11px] font-bold border border-emerald-500/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white"
                                title={`${p.contract.optionType} (+1년 ${p.contract.optionYearSalary ?? 0}억) 실행`}
                              >
                                옵션실행
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={exceedsCash}
                              onClick={() => handleOneClickDomesticSign(p.id)}
                              className={`px-3 py-1 rounded text-xs font-bold ${
                                exceedsCash
                                  ? 'border border-red-400/50 text-red-500 opacity-70 cursor-not-allowed'
                                  : 'bg-orange-600 hover:bg-orange-700 text-white'
                              }`}
                            >
                              {exceedsCash ? '자금 부족' : '계약 체결'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>
            );
          })()}
        </div>
      )}

      {/* TAB 2: Foreign 3+1 (Virtual & Real Scout Market + Termination + Budget Cap) */}
      {subTab === 'foreign' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">보유 외국인 · 아시아쿼터 (3+{asiaQuotaLimit})</div>
              <span className="text-xs font-mono-stats font-bold text-indigo-600 dark:text-indigo-400">
                외인 {foreignSlots.regularCount}/3 · 아쿼 {foreignSlots.asianCount}/{asiaQuotaLimit}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {[...foreignSlots.regularPlayers, ...foreignSlots.asianPlayers].length === 0 ? (
                <div className="p-3 rounded border border-dashed border-slate-300 dark:border-slate-700 text-slate-500">
                  현재 등록된 외국인·아시아쿼터 선수가 없습니다. 우측 마켓에서 영입하세요.
                </div>
              ) : (
                [...foreignSlots.regularPlayers, ...foreignSlots.asianPlayers].map((fp) => {
                  const ev = evaluateForeignPlayerSeasonOutcome(fp);
                  const quote = quoteForeignPlayerRenewal(career, fp);
                  const totalUsdLabel = `$${(quote.suggestedTotalUsd / 1_000_000).toFixed(2)}M`;
                  return (
                  <div
                    key={fp.id}
                    className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(fp.id)}
                            className="truncate hover:text-orange-600 dark:hover:text-orange-400 hover:underline text-left"
                          >
                            {fp.name}
                          </button>
                          <PlayerCategoryTag category={fp.category} compact />
                          {fp.nationality && (
                            <NationalityBadge
                              nationality={getNationalityDisplay(fp.nationality).label}
                              size="xs"
                              className="text-[10px] font-semibold text-slate-500"
                            />
                          )}
                          {ev.tier === 'MLB자동진출' ? (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold">
                              MLB 자동 진출권
                            </span>
                          ) : ev.mlbLikelihood === '유력' ? (
                            <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-[10px] font-bold">
                              MLB 진출 유력
                            </span>
                          ) : ev.tier === '부진_교체검토' ? (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                              부진 · 해지/유지 선택
                            </span>
                          ) : quote.alreadyRenewedForTarget ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                              {quote.targetSeason} 재계약 확정
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
                              {ev.tier === '재계약추천' ? '재계약 추천' : '계약 평가중'}
                            </span>
                          )}
                        </div>
                        {fp.previousLeagueClub && (
                          <div className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 mt-0.5 truncate">
                            직전 소속: {fp.previousLeagueClub}
                          </div>
                        )}
                        <div className="text-slate-500 font-mono-stats mt-0.5">
                          {fp.position} · {fp.age}세 · 능력 {fp.ability}/{fp.potential} ·{' '}
                          {fp.contract.startSeason ?? career.season}~
                          {fp.contract.endSeason ?? career.season}시즌
                        </div>
                        <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">
                          시즌 평가: <span className="font-mono-stats font-semibold">{ev.statSummary}</span>
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          <div className="flex justify-between text-[10px] text-slate-500 font-mono-stats">
                            <span>KBO 리그 적응도</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              {fp.kboAdaptation ?? 80}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded overflow-hidden">
                            <div
                              className="h-full bg-indigo-500"
                              style={{ width: `${Math.min(100, fp.kboAdaptation ?? 80)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={quote.alreadyRenewedForTarget}
                        onClick={() => handleRenewForeign(fp.id)}
                        title={
                          quote.alreadyRenewedForTarget
                            ? `${quote.targetSeason}시즌 계약 유지 완료`
                            : `${quote.targetSeason}시즌 계약 유지 (${quote.adjustmentLabel} · 계약금 ${quote.upfrontKrwBillion}억)`
                        }
                        className={`flex-1 min-w-[110px] py-1 px-2 rounded text-[11px] font-bold ${
                          quote.alreadyRenewedForTarget
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 cursor-default'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                        }`}
                      >
                        {quote.alreadyRenewedForTarget
                          ? `${quote.targetSeason} 계약 유지 완료`
                          : `계약 유지 (${totalUsdLabel})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplaceId(replaceId === fp.id ? '' : fp.id)}
                        className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                          replaceId === fp.id
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {replaceId === fp.id ? '교체 대상' : '교체 지정'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReleaseForeign(fp.id)}
                        className="px-2 py-1 rounded border border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <UserMinus className="w-3 h-3" />
                        <span>계약 해지</span>
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>

            {(() => {
              const foreignMlbExports = (career.mlbExports ?? []).filter(
                (ex) => ex.exportRoute === '외국인역수출'
              );
              if (foreignMlbExports.length === 0) return null;
              return (
                <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-[11px]">
                  <div className="font-bold text-indigo-700 dark:text-indigo-300">
                    KBO → MLB 자동 역수출 외국인 ({foreignMlbExports.length}명)
                  </div>
                  <div className="space-y-1">
                    {foreignMlbExports.slice(0, 5).map((ex) => (
                      <div
                        key={ex.id}
                        className="px-2 py-1 rounded bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/60 flex items-center justify-between gap-1"
                      >
                        <span className="font-bold truncate">
                          {ex.playerName} ({KBO_TEAMS[ex.fromKboTeamId]?.shortName ?? ex.fromKboTeamId})
                        </span>
                        <span className="font-mono-stats text-indigo-700 dark:text-indigo-300 shrink-0">
                          → {ex.mlbTeam} ({ex.contractYears}년 ${ex.guaranteedUsdMillions}M)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {(() => {
            const filteredForeignMarket = visibleForeignMarket.filter((c) =>
              matchesQuery(foreignSearch, c.name, c.position, c.nationality, c.category, c.previousLeagueClub)
            );
            return (
          <div className="lg:col-span-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-bold">해외 외국인 · 가상 스카우트 마켓</div>
                <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px]">
                  {(['전체', '외국인', '아시아쿼터'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setForeignMarketFilter(f)}
                      className={`px-2 py-0.5 font-semibold ${
                        foreignMarketFilter === f
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : ''
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-mono-stats text-slate-500">
                  표시 {filteredForeignMarket.length} / 등록 {visibleForeignMarket.length}명
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[170px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={foreignSearch}
                    onChange={(e) => setForeignSearch(e.target.value)}
                    placeholder="후보 이름·포지션·국적 검색"
                    className="w-full pl-8 pr-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRefreshMarket}
                  className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>가상 마켓 갱신</span>
                </button>
              </div>
            </div>

            {/* Overseas Scout Dispatch Bar */}
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">해외 스카우트 파견 (특급 외국인·아시아쿼터 직접 발굴)</span>
                <span className="text-[11px] text-slate-500 font-mono-stats">
                  파견 이력 {(career.scoutMissions ?? []).length}회
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(
                  [
                    { region: '미국 AAA', cost: '4억' },
                    { region: '일본 NPB 2군', cost: '3억' },
                    { region: '중남미 윈터리그', cost: '3.5억' },
                    { region: '대만 CPBL', cost: '2.5억' },
                  ] as { region: ScoutDispatchMission['region']; cost: string }[]
                ).map((item) => (
                  <button
                    key={item.region}
                    type="button"
                    onClick={() => handleDispatchScout(item.region)}
                    className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-orange-500 text-left"
                  >
                    <div className="font-bold text-[11px]">{item.region}</div>
                    <div className="text-[10px] font-mono-stats text-orange-600 dark:text-orange-400">
                      파견비 {item.cost}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {recommendedForeign && (
              <div className="p-2.5 rounded border border-orange-500/30 bg-orange-50/40 dark:bg-orange-950/15 text-xs flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                <span>
                  <strong>스카우트 추천:</strong> {recommendedForeign.reason}
                </span>
              </div>
            )}

            {replaceId && (
              <div className="p-2 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300 font-semibold">
                영입 체결 시 기존 [{career.players[replaceId]?.name}] 선수가 자동 해지(교체)되고 신규 선수가 등록됩니다.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs max-h-[560px] overflow-y-auto overscroll-contain pr-1">
              {filteredForeignMarket.map((c) => {
                const krwCost = usdToKrwBillion(c.suggestedTotalUsd);
                const exceedsCash = cashBalance !== null && krwCost > cashBalance;
                const isAiPick = recommendedForeign?.candidateId === c.id;
                const slotFull =
                  !replaceId &&
                  ((c.category === '외국인' && foreignSlots.regularCount >= 3) ||
                    (c.category === '아시아쿼터' && foreignSlots.asianCount >= asiaQuotaLimit));

                return (
                  <div
                    key={c.id}
                    className={`p-3.5 rounded border flex flex-col justify-between gap-2.5 ${
                      isAiPick
                        ? 'border-orange-500/80 bg-orange-50/30 dark:bg-orange-950/15'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className="font-bold text-sm truncate">{c.name}</span>
                          <PlayerCategoryTag category={c.category} compact />
                          <NationalityBadge
                            nationality={getNationalityDisplay(c.nationality).label}
                            size="xs"
                            className="text-[10px] font-semibold text-slate-500"
                          />
                        </div>
                        <span className="font-mono-stats font-bold text-orange-600 dark:text-orange-400 shrink-0">
                          {c.ability}/{c.potential}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {c.position} · {c.age}세
                        </span>
                        <div className="flex items-center gap-1">
                          {c.isVirtual && (
                            <span className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-semibold">
                              가상 영입풀
                            </span>
                          )}
                          {isAiPick && (
                            <span className="px-1.5 py-0.5 rounded bg-orange-600 text-white text-[10px] font-bold">
                              추천
                            </span>
                          )}
                        </div>
                      </div>
                      {c.previousLeagueClub && (
                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/25 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                          <Globe2 className="w-3 h-3 shrink-0" />
                          <span>직전: {c.previousLeagueClub}</span>
                        </div>
                      )}
                      <div className="font-mono-stats font-bold text-slate-900 dark:text-slate-100">
                        1년 총액{' '}
                        <span className={exceedsCash ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>
                          {formatKrwBillionKorean(krwCost)}
                        </span>{' '}
                        <span className="text-[11px] font-normal text-slate-500">
                          (${c.suggestedTotalUsd.toLocaleString()} · {career.season}시즌)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 leading-snug">{c.scoutingNote}</div>
                    </div>

                    <button
                      type="button"
                      disabled={exceedsCash || slotFull}
                      onClick={() => handleSignForeign(c)}
                      className={`w-full py-1.5 rounded font-bold ${
                        exceedsCash
                          ? 'border border-red-400/50 text-red-500 opacity-70 cursor-not-allowed'
                          : slotFull
                          ? 'border border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                          : 'bg-orange-600 hover:bg-orange-700 text-white'
                      }`}
                    >
                      {exceedsCash
                        ? `자금 부족 (필요 ${krwCost.toFixed(1)}억)`
                        : slotFull
                        ? '슬롯 만석 (기존 선수 해지/교체 지정 필요)'
                        : replaceId
                        ? '교체 계약 체결'
                        : '계약 체결'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
            );
          })()}
        </div>
      )}

      {/* TAB 3: Incoming Rival Trade Offers + 3-Step Trade with Market Value Index & KBO Trade Window */}
      {subTab === 'trade' && (
        <div className="space-y-4">
          {/* KBO 트레이드 시장 개방/폐쇄 및 마감 카운트다운 상태 배너 */}
          <div
            className={`rounded-md border p-3.5 text-xs flex flex-wrap items-center justify-between gap-3 ${
              isTradeClosed
                ? 'border-rose-500/50 bg-rose-50/75 dark:bg-rose-950/30'
                : tradeWindow.isDeadlineWeek
                ? 'border-amber-500/60 bg-amber-50/75 dark:bg-amber-950/30'
                : 'border-emerald-500/45 bg-emerald-50/60 dark:bg-emerald-950/20'
            }`}
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {isTradeClosed ? (
                  <Lock className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${
                    isTradeClosed
                      ? 'bg-rose-600 text-white'
                      : tradeWindow.daysUntilDeadline === 0
                      ? 'bg-rose-600 text-white'
                      : tradeWindow.isDeadlineWeek
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {isTradeClosed
                    ? '트레이드 시장 폐쇄'
                    : tradeWindow.daysUntilDeadline === 0
                    ? '트레이드 마감 당일 (D-Day)'
                    : '트레이드 시장 개방'}
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {tradeWindow.statusLabel}
                </span>
                {tradeWindow.isOpen && tradeWindow.daysUntilDeadline !== null && (
                  <span className="font-mono-stats font-extrabold text-amber-700 dark:text-amber-300">
                    {tradeWindow.daysUntilDeadline === 0
                      ? '마감까지 D-Day (오늘 23:59)'
                      : `마감(${tradeWindow.deadlineIsoDate})까지 D-${tradeWindow.daysUntilDeadline}일`}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                {tradeWindow.detailText}
              </p>
            </div>
            <div className="text-right font-mono-stats text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
              <div>현재 일자: {tradeWindow.currentIsoDate}</div>
              <div>
                트레이드 가능: KS 종료 다음 날 ~ {tradeWindow.deadlineIsoDate}
              </div>
            </div>
          </div>

          {/* 타 구단 트레이드 제안 수신함 */}
          <div className="border border-indigo-500/40 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>타 구단 트레이드 제안 수신함 ({pendingIncomingTrades.length}건)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  다른 9개 KBO 구단 단장실이 트레이드 가능 기간(한국시리즈 종료 다음 날 ~ 7월 31일)에 공식 트레이드 요청서를 보냅니다.
                </p>
              </div>
              <button
                type="button"
                disabled={isTradeClosed}
                onClick={() => {
                  try {
                    setNotice(null);
                    const res = solicitIncomingTradeOffers(career);
                    onUpdateCareer(res.nextCareer, res.backupSnapshot);
                    setNotice({
                      type: 'ok',
                      text: `타 구단 단장실로부터 신규 트레이드 제안 ${res.newOffers.length}건이 도착했습니다.`,
                    });
                  } catch (err) {
                    setNotice({ type: 'err', text: err instanceof Error ? err.message : '제안 요청 오류' });
                  }
                }}
                className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold whitespace-nowrap"
              >
                타 구단 트레이드 제안 받기
              </button>
            </div>

            {pendingIncomingTrades.length === 0 ? (
              <div className="p-4 rounded border border-dashed border-slate-300 dark:border-slate-700 text-center text-slate-500">
                현재 도착한 타 구단 트레이드 제안이 없습니다. 경기 진행 중 자동으로 도착하거나, 우측 버튼으로 타 구단 문의를 받을 수 있습니다.
              </div>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto overscroll-contain pr-1">
                {pendingIncomingTrades.map((offer) => {
                  const offerPlayers = offer.offerPlayerIds
                    .map((id) => career.players[id])
                    .filter(Boolean);
                  const reqPlayers = offer.requestPlayerIds
                    .map((id) => career.players[id])
                    .filter(Boolean);
                  const offerPickPoints =
                    offer.offerDraftPickRound === 1
                      ? 48
                      : offer.offerDraftPickRound === 2
                      ? 28
                      : offer.offerDraftPickRound === 3
                      ? 16
                      : 0;
                  const offerScore =
                    offerPlayers.reduce((s, p) => s + computePlayerTradeValue(p).index, 0) +
                    Math.round(offer.offerCashBillion * 4.5) +
                    offerPickPoints;
                  const reqScore = reqPlayers.reduce((s, p) => s + computePlayerTradeValue(p).index, 0);

                  return (
                    <div
                      key={offer.id}
                      className="p-3.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <TeamLogo teamId={offer.fromTeamId} size="sm" />
                          <div>
                            <div className="font-extrabold text-slate-900 dark:text-white">
                              {KBO_TEAMS[offer.fromTeamId].name} 트레이드 요청
                              <span className="ml-2 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                                {offer.aiStance}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              수신일 {offer.createdDate} · 마감 {offer.expiresRound}G · 가치 지수 {offerScore} vs {reqScore}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isTradeClosed}
                            onClick={() => {
                              try {
                                setNotice(null);
                                const res = acceptIncomingTradeOffer(career, offer.id);
                                onUpdateCareer(res.nextCareer, res.backupSnapshot);
                                setNotice({ type: 'ok', text: res.summary });
                              } catch (err) {
                                setNotice({ type: 'err', text: err instanceof Error ? err.message : '트레이드 수락 오류' });
                              }
                            }}
                            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold whitespace-nowrap"
                          >
                            제안 수락
                          </button>
                          <button
                            type="button"
                            disabled={isTradeClosed}
                            onClick={() => {
                              setTargetTeam(offer.fromTeamId);
                              setGiveIds([...offer.requestPlayerIds]);
                              setReceiveIds([...offer.offerPlayerIds]);
                              setCashInclude(0);
                              setTradeEval(null);
                              setNotice({
                                type: 'ok',
                                text: `${KBO_TEAMS[offer.fromTeamId].shortName} 제안을 아래 트레이드 협상 테이블에 불러왔습니다. 조건을 조정해 역제안하세요.`,
                              });
                            }}
                            className="px-3 py-1.5 rounded border border-indigo-500/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40 font-bold whitespace-nowrap"
                          >
                            조건 수정·역제안
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const res = rejectIncomingTradeOffer(career, offer.id);
                                onUpdateCareer(res.nextCareer, res.backupSnapshot);
                                setNotice({
                                  type: 'ok',
                                  text: `${KBO_TEAMS[offer.fromTeamId].shortName}의 트레이드 제안을 거절했습니다.`,
                                });
                              } catch (err) {
                                setNotice({ type: 'err', text: err instanceof Error ? err.message : '거절 처리 오류' });
                              }
                            }}
                            className="px-2.5 py-1.5 rounded border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 font-semibold whitespace-nowrap"
                          >
                            거절
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-300">{offer.reason}</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        <div className="p-2.5 rounded border border-emerald-500/30 bg-white dark:bg-slate-900 space-y-1">
                          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            우리 구단이 받는 카드 ({KBO_TEAMS[offer.fromTeamId].shortName} 제시)
                          </div>
                          {offerPlayers.map((p) => (
                            <div key={p.id} className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => onSelectPlayer?.(p.id)}
                                className="font-bold hover:underline text-left"
                              >
                                {p.name}{' '}
                                <span className="font-normal text-slate-500">
                                  ({p.position} · {p.age}세 · {p.rosterTier})
                                </span>
                              </button>
                              <span className="font-mono-stats text-slate-700 dark:text-slate-300">
                                {p.ability}/{p.potential} (지수 {computePlayerTradeValue(p).index})
                              </span>
                            </div>
                          ))}
                          {offer.offerCashBillion > 0 && (
                            <div className="text-[11px] font-mono-stats font-bold text-emerald-700 dark:text-emerald-400">
                              + 추가 현금 +{offer.offerCashBillion.toFixed(1)}억 원 수취
                            </div>
                          )}
                          {offer.offerDraftPickRound && (
                            <div className="text-[11px] font-mono-stats font-bold text-indigo-700 dark:text-indigo-300">
                              + 차기 신인 드래프트 {offer.offerDraftPickRound}라운드 지명권 포함
                            </div>
                          )}
                        </div>

                        <div className="p-2.5 rounded border border-orange-500/30 bg-white dark:bg-slate-900 space-y-1">
                          <div className="text-[11px] font-bold text-orange-700 dark:text-orange-400">
                            우리 구단이 보내는 카드 ({KBO_TEAMS[career.playerTeamId].shortName} 요구 대상)
                          </div>
                          {reqPlayers.map((p) => (
                            <div key={p.id} className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => onSelectPlayer?.(p.id)}
                                className="font-bold hover:underline text-left"
                              >
                                {p.name}{' '}
                                <span className="font-normal text-slate-500">
                                  ({p.position} · {p.age}세 · {p.rosterTier})
                                </span>
                              </button>
                              <span className="font-mono-stats text-slate-700 dark:text-slate-300">
                                {p.ability}/{p.potential} (지수 {computePlayerTradeValue(p).index})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold">1~3단계 직접 트레이드 협상 (시장가치 지수 · KBO 승인 심사)</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {isTradeClosed
                  ? `트레이드 금지 기간(8월 1일 ~ 한국시리즈 종료일)으로 사용자·AI 구단 모두 트레이드 제안 및 체결이 불가합니다.`
                  : `트레이드 마감일: ${tradeWindow.deadlineIsoDate}${
                      tradeWindow.daysUntilDeadline !== null
                        ? ` (D-${tradeWindow.daysUntilDeadline === 0 ? 'Day' : tradeWindow.daysUntilDeadline})`
                        : ''
                    } · FA 당해 연도/군복무/국대/외국인은 심사 제외`}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">상대 구단:</span>
              <TeamLogo teamId={targetTeam} size="xs" />
              <select
                value={targetTeam}
                onChange={(e) => {
                  setTargetTeam(e.target.value as TeamId);
                  setReceiveIds([]);
                  setTradeEval(null);
                }}
                className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-semibold"
              >
                {otherTeams.map((t) => (
                  <option key={t} value={t}>
                    {KBO_TEAMS[t].name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const filteredMyDomesticTrade = myDomestic.filter((p) =>
              matchesQuery(tradeGiveSearch, p.name, p.position, p.rosterTier, p.uniformNumber)
            );
            const filteredTargetDomesticTrade = targetDomestic.filter((p) =>
              matchesQuery(tradeReceiveSearch, p.name, p.position, p.rosterTier, p.uniformNumber)
            );
            return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden flex flex-col">
              <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">보내는 선수 ({career.playerTeamId} 국내)</span>
                  <span className="font-mono-stats text-[11px] text-slate-500">
                    표시 {filteredMyDomesticTrade.length} / 등록 {myDomestic.length}명
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={tradeGiveSearch}
                    onChange={(e) => setTradeGiveSearch(e.target.value)}
                    placeholder="보내는 선수 이름·포지션 검색"
                    className="w-full pl-8 pr-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto overscroll-contain px-3 py-1 divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMyDomesticTrade.map((p) => {
                  const checked = giveIds.includes(p.id);
                  const tv = computePlayerTradeValue(p);
                  return (
                    <label
                      key={p.id}
                      className={`py-1.5 px-1 flex flex-col gap-0.5 ${
                        !evaluateLegendTradeAvailability(career, p).available
                          ? 'opacity-65 cursor-not-allowed bg-rose-500/5'
                          : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {(() => {
                        const legendGate = evaluateLegendTradeAvailability(career, p);
                        const locked = legendGate.isLegend && !legendGate.available;
                        return (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1 min-w-0 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={locked}
                                  onChange={() => {
                                    if (locked) return;
                                    setTradeEval(null);
                                    setGiveIds((prev) =>
                                      checked ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                                    );
                                  }}
                                />
                                {p.uniformNumber !== undefined && (
                                  <span className="font-mono-stats text-[10px] font-bold text-slate-400 shrink-0">
                                    #{p.uniformNumber}
                                  </span>
                                )}
                                <span className="font-semibold shrink-0">{p.name}</span>
                                <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                                <PlayerCompactTag career={career} player={p} />
                                <span className="text-[11px] text-slate-400 truncate">
                                  {p.rosterTier}·{p.position}·{p.age}세
                                </span>
                              </span>
                              <span className="font-mono-stats text-right shrink-0 whitespace-nowrap">
                                <span>{p.ability}/{p.potential}</span>
                                <span className="ml-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                                  가치 {tv.index}
                                </span>
                              </span>
                            </div>
                            {locked && (
                              <div className="pl-5 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                                거래 불가: {legendGate.reason}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden flex flex-col">
              <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">받는 선수 ({targetTeam} 국내)</span>
                  <span className="font-mono-stats text-[11px] text-slate-500">
                    표시 {filteredTargetDomesticTrade.length} / 등록 {targetDomestic.length}명
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={tradeReceiveSearch}
                    onChange={(e) => setTradeReceiveSearch(e.target.value)}
                    placeholder="받는 선수 이름·포지션 검색"
                    className="w-full pl-8 pr-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto overscroll-contain px-3 py-1 divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTargetDomesticTrade.map((p) => {
                  const checked = receiveIds.includes(p.id);
                  const tv = computePlayerTradeValue(p);
                  const legendGate = evaluateLegendTradeAvailability(career, p);
                  const locked = legendGate.isLegend && !legendGate.available;
                  return (
                    <label
                      key={p.id}
                      className={`py-1.5 px-1 flex flex-col gap-0.5 ${
                        locked
                          ? 'opacity-65 cursor-not-allowed bg-rose-500/5'
                          : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 min-w-0 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked}
                            onChange={() => {
                              if (locked) return;
                              setTradeEval(null);
                              setReceiveIds((prev) =>
                                checked ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                              );
                            }}
                          />
                          {p.uniformNumber !== undefined && (
                            <span className="font-mono-stats text-[10px] font-bold text-slate-400 shrink-0">
                              #{p.uniformNumber}
                            </span>
                          )}
                          <span className="font-semibold shrink-0">{p.name}</span>
                          <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                          <PlayerCompactTag career={career} player={p} />
                          <span className="text-[11px] text-slate-400 truncate">
                            {p.rosterTier}·{p.position}·{p.age}세
                          </span>
                        </span>
                        <span className="font-mono-stats text-right shrink-0 whitespace-nowrap">
                          <span>{p.ability}/{p.potential}</span>
                          <span className="ml-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                            가치 {tv.index}
                          </span>
                        </span>
                      </div>
                      {locked && (
                        <div className="pl-5 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                          거래 불가: {legendGate.reason}
                        </div>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
            );
          })()}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span>추가 현금 포함 (억 원):</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={cashInclude}
                  onChange={(e) => {
                    setTradeEval(null);
                    setCashInclude(Math.max(0, Number(e.target.value) || 0));
                  }}
                  className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                />
              </div>
              <div className="flex items-center gap-2">
                <span>신인 지명권 포함:</span>
                <select
                  value={draftPickRound ?? ''}
                  onChange={(e) => {
                    setTradeEval(null);
                    setDraftPickRound(e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null);
                  }}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-semibold"
                >
                  <option value="">포함 안 함</option>
                  <option value="1">차기 1라운드 지명권 (+48pt)</option>
                  <option value="2">차기 2라운드 지명권 (+28pt)</option>
                  <option value="3">차기 3라운드 지명권 (+16pt)</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              disabled={isTradeClosed}
              onClick={handleEvaluateTrade}
              className="px-4 py-2 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isTradeClosed ? '트레이드 기간 종료 (제안 불가)' : '2단계: 상대 구단 평가 요청'}
            </button>
          </div>

          {tradeEval && (
            <div
              className={`p-4 rounded border space-y-3 text-xs ${
                tradeEval.decision === '수락'
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : tradeEval.decision === '조건부'
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : 'border-red-500/40 bg-red-500/10'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold">평가 결과: {tradeEval.decision}</span>
                  {tradeEval.aiStance && (
                    <span className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-semibold">
                      상대 기조: {tradeEval.aiStance}
                    </span>
                  )}
                </div>
                <span className="font-mono-stats">
                  제시 가치 {tradeEval.giveScore} vs 요구 가치 {tradeEval.receiveScore}
                  {tradeEval.giveMarketScore !== undefined && tradeEval.receiveMarketScore !== undefined
                    ? ` (순수 시장지수 ${tradeEval.giveMarketScore} vs ${tradeEval.receiveMarketScore})`
                    : ''}
                  {tradeEval.franchiseSymbolicGap && tradeEval.franchiseSymbolicGap > 0
                    ? ` · 프랜차이즈 상징성 +${tradeEval.franchiseSymbolicGap}pt`
                    : ''}
                </span>
              </div>
              <p>{tradeEval.reason}</p>

              {/* 선수별 트레이드 지수 및 구체적 저평가 사유 */}
              {((tradeEval.giveBreakdowns?.length ?? 0) > 0 || (tradeEval.receiveBreakdowns?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  {[
                    { title: '제시 선수 가치 분석', list: tradeEval.giveBreakdowns ?? [] },
                    { title: '영입 선수 가치 분석', list: tradeEval.receiveBreakdowns ?? [] },
                  ].map((group) => (
                    <div
                      key={group.title}
                      className="p-2.5 rounded border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/60 space-y-1.5"
                    >
                      <div className="font-bold text-[11px] text-slate-600 dark:text-slate-300">
                        {group.title}
                      </div>
                      {group.list.map((b) => (
                        <div key={b.playerId} className="text-[11px] space-y-0.5">
                          <div className="flex items-center justify-between gap-1 font-mono-stats">
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {b.playerName}
                              {b.franchiseTier !== '일반' ? ` (${b.franchiseTier})` : ''}
                            </span>
                            <span className="text-indigo-600 dark:text-indigo-400">
                              시장 {b.skillMarketIndex}
                              {b.homeClubSymbolicPremium > 0 ? ` · 원소속 +${b.homeClubSymbolicPremium}` : ''}
                              {b.tradeRequestRelief > 0 ? ` · 이적요청 -${b.tradeRequestRelief}` : ''}
                            </span>
                          </div>
                          {b.lowValueReasons.length > 0 && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400">
                              사유: {b.lowValueReasons.join(' / ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* 라이벌 구단 프랜차이즈 이적 경고 및 계약·기록 보존 안내 */}
              {(() => {
                const rivalry = findRivalryBetween(career, career.playerTeamId, targetTeam);
                const myFranchiseMoving = giveIds
                  .map((id) => career.players[id])
                  .filter((p) => p && evaluateFranchiseStar(career, p).tier !== '일반');
                return (
                  <div className="space-y-1 text-[11px]">
                    {rivalry && myFranchiseMoving.length > 0 && (
                      <div className="p-2 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold">
                        라이벌 구단({KBO_TEAMS[targetTeam].shortName} · {rivalry.name})으로 프랜차이즈 스타({myFranchiseMoving.map((p) => p.name).join(', ')}) 이적 시 팬 지지율과 구단 평판이 크게 하락하며 특보 이벤트가 발생합니다.
                      </div>
                    )}
                    <div className="text-slate-500">
                      ※ 트레이드 체결 시 이적 선수의 기존 연봉·다년계약·시즌/통산 기록은 100% 그대로 승계되며, KBO 경쟁균형세 예외 선수 지정과는 별도로 관리됩니다.
                    </div>
                  </div>
                );
              })()}

              {tradeEval.decision === '조건부' && tradeEval.counterOffer && (
                <div className="p-3 rounded border border-amber-500/50 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-amber-700 dark:text-amber-300">
                      상대 구단 역제안 도착 (재협상 또는 즉시 수락 가능)
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                      {tradeEval.counterOffer.description}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const co = tradeEval.counterOffer!;
                        if (co.extraCashBillion) {
                          setCashInclude((prev) => Number((prev + co.extraCashBillion!).toFixed(1)));
                        }
                        if (co.requestedPickRound) {
                          setDraftPickRound(co.requestedPickRound);
                        }
                        if (co.requestedPlayerId && !giveIds.includes(co.requestedPlayerId)) {
                          setGiveIds((prev) => [...prev, co.requestedPlayerId!]);
                        }
                        setTradeEval(null);
                        setNotice({
                          type: 'ok',
                          text: '상대 역제안 조건을 협상안에 반영했습니다. 선수·현금·지명권을 추가 조정한 뒤 재평가를 요청하세요.',
                        });
                      }}
                      className="px-3 py-1.5 rounded border border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 font-bold"
                    >
                      역제안 조건 반영 (재협상)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExecuteTrade(true)}
                      className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold"
                    >
                      역제안 즉시 수락·체결
                    </button>
                  </div>
                </div>
              )}
              {tradeEval.decision === '수락' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isTradeClosed}
                    onClick={() => handleExecuteTrade(false)}
                    className="px-4 py-2 rounded team-accent-btn font-bold disabled:opacity-40"
                  >
                    3단계: 트레이드 최종 실행 승인
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      )}

      {/* TAB 6: WAIVER MARKET & RELEASE RECOMMENDATIONS (계약·FA·트레이드 통합) */}
      {subTab === 'waiver' && (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-md px-3.5 py-2.5 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-bold text-slate-900 dark:text-white">KBO 공식 웨이버 규정</span>
            <span>· 공시 즉시 선수단 제외 · 7일간 영입 신청 접수</span>
            <span>· 복수 신청 시 하위 순위 구단 우선</span>
            <span>· 이적료 {KBO_WAIVER_FEE_MANWON}만 원 + 기존 계약 승계</span>
            <span>· 영입 후 60일 재웨이버 금지</span>
            <span>· 8월 1일 이후 이적 시 포스트시즌 출전 제한</span>
            <span>· 미영입 시 자유계약 전환(당해 시즌 KBO 계약 불가)</span>
          </div>

          {releaseRecommendations.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-rose-500/40 rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <UserMinus className="w-4 h-4" />
                  단장실 방출 추천 선수 ({releaseRecommendations.length}명)
                </h3>
                <span className="text-[11px] text-slate-500">
                  나이·능력치·시즌 성적·연봉 효율 종합 분석
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {releaseRecommendations.map((rec) => {
                  const lock = getReWaiverRestrictionStatus(rec.player, currentDateIso);
                  return (
                    <div
                      key={rec.player.id}
                      className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectPlayer?.(rec.player.id)}
                            className="font-bold text-slate-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 hover:underline text-left"
                          >
                            {rec.player.name} ({rec.player.position} · {rec.player.age}세)
                          </button>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              rec.priority === '방출 권장'
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {rec.priority}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">{rec.reason}</div>
                        <div className="text-[11px] font-mono-stats text-emerald-700 dark:text-emerald-400">
                          OVR {rec.player.ability}/{rec.player.potential} · {rec.salaryReliefText}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={lock.blocked}
                        onClick={() => handleReleaseWaiver(rec.player.id)}
                        className="w-full py-1.5 rounded border border-rose-500/50 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white font-bold transition-colors disabled:opacity-40"
                      >
                        {lock.blocked
                          ? `60일 재웨이버 금지 (D-${lock.remainingDays})`
                          : '방출(웨이버 공시) 실행'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                KBO 웨이버 공시 시장 ({(career.waiverPool ?? []).length}명)
              </h3>
              <p className="text-xs text-slate-500">
                공시 후 7일간 영입 신청을 접수하며, 마감 시점에 신청 구단 중 하위 순위 구단이 이적료 {KBO_WAIVER_FEE_MANWON}만 원으로 기존 계약을 승계합니다.
              </p>
              {(career.waiverPool ?? []).length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded">
                  현재 웨이버 공시 중인 선수가 없습니다. 시즌 진행 시 타 구단 방출 선수가 수시로 등록됩니다.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto overscroll-contain pr-1">
                  {(career.waiverPool ?? []).map((w) => {
                    const daysLeft = w.expiresDate
                      ? Math.max(0, diffCalendarDaysIso(currentDateIso, w.expiresDate))
                      : Math.max(0, w.expiresAtRound - career.gamesPlayed);
                    const alreadyApplied = (w.claimTeamIds ?? []).includes(career.playerTeamId);
                    const claimCount = (w.claimTeamIds ?? []).length;
                    const inheritedSalary =
                      w.preservedContract?.annualSalary ?? w.player.contract?.annualSalary ?? 0.35;
                    const inheritedYears =
                      w.preservedContract?.yearsRemaining ??
                      Math.max(1, w.player.contract?.yearsRemaining ?? 1);
                    const postAug1 = isPostAugustFirstTransfer(currentDateIso, career.season);

                    return (
                      <div key={w.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5">
                            <span>
                              {w.player.name} ({w.player.position} · {w.player.age}세)
                            </span>
                            <span className="text-[10px] font-mono-stats px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              마감 D-{daysLeft}
                            </span>
                            {claimCount > 0 && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                신청 {claimCount}구단
                              </span>
                            )}
                            {postAug1 && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400">
                                PS 출전제한
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            원소속 {KBO_TEAMS[w.fromTeamId]?.shortName ?? w.fromTeamId} · OVR {w.player.ability}/{w.player.potential} · 이적료{' '}
                            <span className="font-mono-stats font-semibold text-slate-900 dark:text-white">
                              {w.claimFeeManwon ?? KBO_WAIVER_FEE_MANWON}만 원
                            </span>{' '}
                            · 승계 연 {inheritedSalary}억({inheritedYears}년)
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={w.fromTeamId === career.playerTeamId || alreadyApplied}
                          onClick={() => handleApplyWaiver(w.id)}
                          className="px-3 py-1 rounded text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-45 shrink-0"
                        >
                          {w.fromTeamId === career.playerTeamId
                            ? '자구단 공시'
                            : alreadyApplied
                            ? '영입 신청됨'
                            : '7일 영입 신청'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {(() => {
              const filteredReleasable = domesticReleasable.filter((p) =>
                matchesQuery(waiverReleaseSearch, p.name, p.position, p.rosterTier, p.uniformNumber)
              );
              return (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <UserMinus className="w-4 h-4 text-rose-600" />
                    소속 국내 선수 방출 (웨이버 공시)
                  </h3>
                  <span className="text-[11px] font-mono-stats font-bold text-slate-500">
                    표시 {filteredReleasable.length} / 등록 {domesticReleasable.length}명
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  웨이버 공시 즉시 선수단에서 제외되며 7일간 타 구단 영입 신청을 받습니다 (웨이버 영입 후 60일간 재공시 금지).
                </p>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={waiverReleaseSearch}
                    onChange={(e) => setWaiverReleaseSearch(e.target.value)}
                    placeholder="방출 대상 선수 이름·포지션 검색"
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div
                data-testid="waiver-releasable-scroll-list"
                className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto overscroll-contain px-4"
              >
                {filteredReleasable.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    검색 조건에 해당하는 소속 선수가 없습니다.
                  </div>
                ) : (
                filteredReleasable.map((p) => {
                  const lock = getReWaiverRestrictionStatus(p, currentDateIso);
                  return (
                    <div key={p.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer?.(p.id)}
                          className="font-bold text-slate-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 hover:underline truncate"
                        >
                          {p.name}
                        </button>
                        <FranchiseStarIcon active={isFranchiseStarPlayer(career, p)} />
                        <PlayerCompactTag career={career} player={p} />
                        <span className="text-slate-500 shrink-0">
                          {p.position} · {p.age}세 · {p.rosterTier} · OVR {p.ability}
                        </span>
                        {lock.blocked && (
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                            · 60일 제한
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={lock.blocked}
                        onClick={() => handleReleaseWaiver(p.id)}
                        className="px-2.5 py-1 rounded text-xs font-semibold border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white transition-colors disabled:opacity-40 shrink-0"
                      >
                        {lock.blocked ? '60일 제한' : '웨이버 공시'}
                      </button>
                    </div>
                  );
                })
                )}
              </div>
            </div>
              );
            })()}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-500" />
                웨이버 미영입 자유계약선수 · 독립리그 · 은퇴 현황 ({(career.unclaimedFreeAgents ?? []).length}명)
              </h3>
              <span className="text-[11px] text-slate-500">
                당해 시즌 계약 불가 · 시즌 종료 후 자동 해제 · 장기 미계약 시 독립리그 진출 또는 은퇴
              </span>
            </div>
            {(career.unclaimedFreeAgents ?? []).length === 0 ? (
              <div className="py-5 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded">
                아직 7일 미영입으로 자유계약 전환된 선수가 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[320px] overflow-y-auto overscroll-contain pr-1">
                {(career.unclaimedFreeAgents ?? []).map((fa) => {
                  const canSign =
                    career.season >= fa.eligibleSeason &&
                    (fa.status === '계약가능' || fa.status === '독립리그');
                  const badgeClass =
                    fa.status === '당해시즌계약금지'
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      : fa.status === '계약가능'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : fa.status === '독립리그'
                      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                      : fa.status === '재계약완료'
                      ? 'bg-teal-500/15 text-teal-700 dark:text-teal-400'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500';
                  return (
                    <div key={fa.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5">
                          <span>
                            {fa.player.name} ({fa.player.position} · {fa.player.age}세)
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeClass}`}>
                            {fa.status}
                          </span>
                          {fa.independentClubName && fa.status === '독립리그' && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                              {fa.independentClubName}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          전 {KBO_TEAMS[fa.formerTeamId]?.shortName ?? fa.formerTeamId} · OVR {fa.player.ability}/{fa.player.potential} · {fa.statusNote}
                        </div>
                      </div>
                      {fa.status !== '은퇴' && fa.status !== '재계약완료' && (
                        <button
                          type="button"
                          disabled={!canSign}
                          onClick={() => handleSignUnclaimedFa(fa.id)}
                          className="px-3 py-1 rounded text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 shrink-0"
                        >
                          {canSign ? '자유계약 영입' : `${fa.eligibleSeason}시즌부터 계약 가능`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <ContractApprovalModal
        preview={pendingContract?.preview ?? null}
        confirmLabel={pendingContract?.confirmLabel}
        onCancel={() => setPendingContract(null)}
        onConfirm={() => {
          const action = pendingContract;
          setPendingContract(null);
          action?.execute();
        }}
      />
    </div>
  );
};
