import React, { useRef, useState } from 'react';
import {
  ArrowUpCircle,
  Building2,
  Check,
  CopyPlus,
  Download,
  History,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import {
  CORPORATE_SPONSORS,
  DEFAULT_INVESTMENTS,
  FACILITY_UPGRADES,
  getActiveOneTimeSpendOptions,
  getTeamSponsorChoices,
  OneTimeSpendDef,
  TEAM_STARTING_CASH_BILLION,
  TICKET_PRICE_CONFIG,
} from '../data/financesData';
import {
  formatKrwBillionKorean,
  getFinancialInvestmentRecommendations,
} from '../engine/franchiseSystems';
import { computeSalaryCapSummary, repairFacility } from '../engine/deepFranchise';
import {
  computeLeagueSalaryCapTable,
  designateFranchiseExceptionPlayer,
  formatBillionExactKorean,
  formatManwonKorean,
  getAnnualKboCapManwon,
  getAnnualKboFloorManwon,
  getEligibleFranchiseExceptionPlayers,
  getPlayerClubTenureSeasons,
} from '../engine/salaryCapEngine';
import { computeClubFranchiseMerchandise } from '../engine/franchiseStarEngine';
import {
  executeOneTimeClubSpend,
  initializeStartingFunds,
  negotiateCorporateSponsor,
  payUnpaidObligation,
  previewNegotiatedSponsorTerms,
  setTicketPricePolicy,
  SponsorNegotiationOptions,
  upgradeClubFacility,
} from '../engine/transactions';
import {
  CareerSummaryItem,
  exportCareerJson,
  listBackupsForCareer,
  restoreCareerFromBackup,
  saveCareer,
} from '../storage/careerStorage';
import { CareerSave, ClubInvestments, TicketPricePolicy } from '../types/kbo';
import { SponsorLogo } from './SponsorLogo';
import { TeamLogo } from './TeamLogo';

interface FinancesSavesViewProps {
  career: CareerSave;
  savedCareers?: CareerSummaryItem[];
  onUpdateCareer: (next: CareerSave, backup?: CareerSave) => void;
  onImportJson: (raw: string) => void;
  onSaveAsNewSlot?: (customLabel: string) => void;
  onSwitchCareer?: (careerId: string) => void;
  onRenameCareer?: (careerId: string, newLabel: string) => void;
  onDeleteCareer?: (careerId: string) => void;
}

export const FinancesSavesView: React.FC<FinancesSavesViewProps> = ({
  career,
  savedCareers = [],
  onUpdateCareer,
  onImportJson,
  onSaveAsNewSlot,
  onSwitchCareer,
  onRenameCareer,
  onDeleteCareer,
}) => {
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showSponsorPicker, setShowSponsorPicker] = useState(
    !career.finances.sponsor || career.finances.sponsor.status === '만료'
  );
  const [showSponsorCompare, setShowSponsorCompare] = useState(false);
  const [showAllSponsors, setShowAllSponsors] = useState(false);
  const [sponsorTierFilter, setSponsorTierFilter] = useState<'전체' | '프리미엄' | '메이저' | '스탠다드'>('전체');
  const [negYears, setNegYears] = useState<1 | 2 | 3>(2);
  const [negFocus, setNegFocus] = useState<NonNullable<SponsorNegotiationOptions['focus']>>('균형');
  const [importText, setImportText] = useState('');
  const [capCenterTab, setCapCenterTab] = useState<'payroll' | 'league' | 'history'>('payroll');
  const [newSlotName, setNewSlotName] = useState(
    `${KBO_TEAMS[career.playerTeamId].shortName} ${career.season}시즌 ${career.gamesPlayed}G 백업`
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingText, setRenamingText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const backups = listBackupsForCareer(career.careerId);
  const investments = career.finances.investments ?? DEFAULT_INVESTMENTS;
  const teamInfo = KBO_TEAMS[career.playerTeamId];
  const baseTeamCash = TEAM_STARTING_CASH_BILLION[career.playerTeamId] ?? 150;
  const activeSponsor = career.finances.sponsor ?? null;

  const ticketRev = career.finances.ticketRevenueBillion ?? 0;
  const uniformRev = career.finances.uniformRevenueBillion ?? 0;
  const sponsorRev = career.finances.sponsorRevenueBillion ?? 0;
  const postingRev = career.finances.postingRevenueBillion ?? 0;
  const operatingExp = career.finances.operatingExpenseBillion ?? 0;
  const merchCogs = career.finances.merchCogsBillion ?? 0;
  const travelExp = career.finances.travelExpenseBillion ?? 0;
  const payrollPaid = career.finances.payrollPaidBillion ?? 0;
  const incentivePaid = career.finances.incentivePaidBillion ?? 0;
  const currentTicketPolicy: TicketPricePolicy = career.finances.ticketPricePolicy ?? '표준';
  const activeSpendOptions = getActiveOneTimeSpendOptions(career.finances.activeSpendOfferIds);
  const investmentRecs = getFinancialInvestmentRecommendations(career);

  const handleInitFunds = () => {
    try {
      const { nextCareer, backupSnapshot } = initializeStartingFunds(career);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({
        type: 'ok',
        text: `${career.playerTeamId} 기본 운영자금 ${baseTeamCash.toFixed(1)}억 원이 편성되었습니다.`,
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '자금 편성 오류' });
    }
  };

  const handleSelectSponsor = (sponsorId: string) => {
    try {
      const { nextCareer, backupSnapshot } = negotiateCorporateSponsor(career, sponsorId, {
        contractYears: negYears,
        focus: negFocus,
      });
      onUpdateCareer(nextCareer, backupSnapshot);
      setShowSponsorPicker(false);
      setNotice({
        type: 'ok',
        text: `${nextCareer.finances.sponsor?.name} ${negYears}년 스폰서 계약이 체결되었습니다 (${negFocus} 조건).`,
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '스폰서 계약 오류' });
    }
  };

  const handleUpgradeFacility = (key: keyof ClubInvestments) => {
    try {
      const { nextCareer, backupSnapshot } = upgradeClubFacility(career, key);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({ type: 'ok', text: '구단 시설 투자가 완료되었습니다.' });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '시설 투자 오류' });
    }
  };

  const handleRepairFacility = (target: 'stadium' | 'academy' | 'medical' | 'marketing') => {
    try {
      const { nextCareer, backupSnapshot, costBillion } = repairFacility(career, target);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({
        type: 'ok',
        text: `시설 유지보수·대보수를 완료했습니다 (컨디션 100% 회복 · ${costBillion}억 원 집행).`,
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '시설 보수 오류' });
    }
  };

  const salaryCap = computeSalaryCapSummary(career, career.playerTeamId);
  const facCond = career.finances.facilityCondition ?? {
    stadium: 88,
    academy: 86,
    medical: 86,
    marketing: 88,
    lastMaintSeason: career.season,
  };
  const ownerCap = career.finances.ownerBudgetCapBillion ?? 135;

  const handleOneTimeSpend = (spendId: OneTimeSpendDef['id']) => {
    try {
      const { nextCareer, backupSnapshot } = executeOneTimeClubSpend(career, spendId);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({
        type: 'ok',
        text: '구단 자금 집행이 완료되었습니다. 사용한 프로그램은 새 프로그램으로 교체되었습니다.',
      });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '자금 집행 오류' });
    }
  };

  const handleSetTicketPolicy = (policy: TicketPricePolicy) => {
    const { nextCareer, backupSnapshot } = setTicketPricePolicy(career, policy);
    onUpdateCareer(nextCareer, backupSnapshot);
    setNotice({
      type: 'ok',
      text: `홈 경기장 티켓 가격 정책을 [${TICKET_PRICE_CONFIG[policy].label}]으로 변경했습니다.`,
    });
  };

  const handlePay = (obId: string) => {
    try {
      setNotice(null);
      const { nextCareer, backupSnapshot } = payUnpaidObligation(career, obId);
      onUpdateCareer(nextCareer, backupSnapshot);
      setNotice({ type: 'ok', text: '지급 처리가 완료되었습니다.' });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : '지급 처리 오류' });
    }
  };

  const handleDownloadJson = () => {
    const raw = exportCareerJson(career);
    const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${career.playerTeamId}_KBO_GM_${career.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice({ type: 'ok', text: '현재 세이브 JSON 파일을 내보냈습니다.' });
  };

  const handleRestoreBackup = (idx: number) => {
    const restored = restoreCareerFromBackup(career.careerId, idx);
    if (restored) {
      onUpdateCareer(restored);
      setNotice({
        type: 'ok',
        text: `롤링 백업 #${idx + 1} (${restored.version}) 상태로 복원했습니다.`,
      });
    }
  };

  const handleManualSave = () => {
    saveCareer(career);
    setNotice({ type: 'ok', text: '현재 진행 상태를 브라우저 저장소에 즉시 저장했습니다.' });
  };

  const tailoredSponsors = getTeamSponsorChoices(career.playerTeamId);
  const filteredSponsors = CORPORATE_SPONSORS.filter(
    (s) => sponsorTierFilter === '전체' || s.tier === sponsorTierFilter
  );

  return (
    <div className="space-y-4">
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

      {/* Finances Overview: Cash, Sponsor, Revenue Breakdown, Unpaid Obligations */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-base font-extrabold">
            <TeamLogo teamId={career.playerTeamId} size="sm" />
            <Wallet className="w-4 h-4 text-orange-600" />
            <span>{teamInfo.name} 재정 · 스폰서 · 운영수지</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-stats">
            인기도 {career.teams[career.playerTeamId].popularity}/100 · 평균객단가 {teamInfo.ticketPriceAvg.toLocaleString()}원 · 시리즈 운영비 -{teamInfo.operatingCostPerSeriesBillion.toFixed(2)}억
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* 1. Available Cash Balance */}
          <div className="p-3.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between gap-2">
            <div>
              <div className="text-slate-500">보유 현금 잔액</div>
              <div className="text-xl font-extrabold font-mono-stats text-emerald-700 dark:text-emerald-400 mt-1">
                {career.finances.cashBalanceBillion === null
                  ? '미편성'
                  : `${career.finances.cashBalanceBillion.toFixed(2)}억 원`}
              </div>
              <div className="text-[11px] text-slate-400 font-mono-stats mt-0.5">
                {career.finances.startingCashBillion !== undefined
                  ? `구단 초기자금: ${career.finances.startingCashBillion.toFixed(1)}억 · 지출 ${career.finances.seasonExpenseBillion.toFixed(2)}억`
                  : `편성 기준: ${baseTeamCash.toFixed(1)}억 원`}
              </div>
            </div>
            {career.finances.cashBalanceBillion === null && (
              <button
                type="button"
                onClick={handleInitFunds}
                className="w-full py-1.5 px-2.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]"
              >
                {career.playerTeamId} 기본 자금 {baseTeamCash}억 편성
              </button>
            )}
          </div>

          {/* 2. Main Corporate Sponsor */}
          <div className="p-3.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between gap-2">
            <div>
              <div className="text-slate-500 flex items-center justify-between">
                <span>메인 스폰서 계약</span>
                {activeSponsor && (
                  <span
                    className={`text-[10px] font-bold ${
                      activeSponsor.status === '만료'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-orange-600 dark:text-orange-400'
                    }`}
                  >
                    {activeSponsor.status === '만료'
                      ? '만료 (재계약 필요)'
                      : `${activeSponsor.tier} · 잔여 ${activeSponsor.yearsRemaining ?? activeSponsor.contractYears ?? 1}년`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                {activeSponsor && <SponsorLogo sponsor={activeSponsor} size="sm" />}
                <div className="min-w-0">
                  <div className="text-sm font-extrabold truncate">
                    {activeSponsor ? activeSponsor.name : '미계약'}
                  </div>
                  {activeSponsor && (
                    <div className="text-[10px] text-slate-500 truncate">{activeSponsor.industry}</div>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-slate-400 font-mono-stats mt-1">
                {activeSponsor
                  ? `시리즈 ${activeSponsor.perSeriesBonusBillion} · 승 +${activeSponsor.winBonusBillion} · 관중 +${activeSponsor.attendanceBonusBillion ?? 0.2}억`
                  : '기업 선택·조건 협상 시 계약금 즉시 입금'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSponsorPicker((v) => !v)}
              className={`w-full py-1 px-2 rounded font-semibold text-[11px] ${
                activeSponsor?.status === '만료'
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {showSponsorPicker
                ? '스폰서 협상 닫기'
                : activeSponsor?.status === '만료'
                ? '만료 스폰서 재협상'
                : activeSponsor
                ? '스폰서 협상/변경'
                : '스폰서 협상 열기'}
            </button>
          </div>

          {/* 3. Season Revenue & Operating Expense Breakdown */}
          <div className="p-3.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <div className="text-slate-500">시즌 매출 · 구단 운영비</div>
            <div className="text-xl font-extrabold font-mono-stats mt-1">
              {career.finances.seasonRevenueBillion.toFixed(2)}억 원
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-stats mt-1 space-y-0.5">
              <div className="flex justify-between">
                <span>티켓 · MD 판매</span>
                <span>
                  {ticketRev.toFixed(1)}억 / {uniformRev.toFixed(1)}억
                </span>
              </div>
              <div className="flex justify-between">
                <span>스폰서 · 포스팅 정산</span>
                <span>
                  {sponsorRev.toFixed(1)}억 / {postingRev.toFixed(1)}억
                </span>
              </div>
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span>운영 · 원정 · 원가</span>
                <span>
                  -{(operatingExp + travelExp + merchCogs).toFixed(2)}억
                </span>
              </div>
              {(payrollPaid > 0 || incentivePaid > 0) && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>정기연봉 · 옵션/인센티브</span>
                  <span>
                    -{payrollPaid.toFixed(1)}억 / -{incentivePaid.toFixed(1)}억
                  </span>
                </div>
              )}
              {((career.finances.signingBonusPaidBillion ?? 0) > 0 ||
                (career.finances.deadMoneyPaidBillion ?? 0) > 0 ||
                (career.finances.compensationPaidBillion ?? 0) > 0) && (
                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                  <span>계약금 · 보상금 · 방출 데드머니</span>
                  <span>
                    -{(career.finances.signingBonusPaidBillion ?? 0).toFixed(1)}억 / -
                    {(career.finances.compensationPaidBillion ?? 0).toFixed(1)}억 / -
                    {(career.finances.deadMoneyPaidBillion ?? 0).toFixed(1)}억
                  </span>
                </div>
              )}
              {(career.finances.deadMoneyEntries ?? []).filter((d) => d.remainingSeasons > 0).length > 0 && (
                <div className="flex justify-between text-rose-500">
                  <span>방출 잔여 보장 계약 ({(career.finances.deadMoneyEntries ?? []).filter((d) => d.remainingSeasons > 0).length}명)</span>
                  <span>
                    연{' '}
                    {(career.finances.deadMoneyEntries ?? [])
                      .filter((d) => d.remainingSeasons > 0)
                      .reduce((s, d) => s + d.annualObligationBillion, 0)
                      .toFixed(2)}
                    억
                  </span>
                </div>
              )}
              {career.finances.spendingFrozenReason && (
                <div className="pt-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  ⚠ {career.finances.spendingFrozenReason}
                </div>
              )}
            </div>
          </div>

          {/* 4. Unpaid Contract Obligations */}
          <div className="p-3.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <div className="text-slate-500">미지급 확정 의무 (원화 / 달러)</div>
            <div className="text-lg font-extrabold font-mono-stats mt-1">
              {career.finances.krwUnpaidBillion.toFixed(2)}억 + ${career.finances.usdUnpaid.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 font-mono-stats mt-0.5">
              지급 누적: {career.finances.krwCashPaidBillion.toFixed(2)}억 / $
              {career.finances.usdCashPaid.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate" title={career.finances.perazaContractNote}>
              {career.finances.perazaContractNote}
            </div>
          </div>
        </div>

        {/* Ticket Pricing Policy & Fan Sentiment Bar */}
        <div className="p-3.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="font-bold flex items-center gap-2">
              <span>홈 티켓 가격 정책</span>
              <span className="font-mono-stats text-orange-600 dark:text-orange-400">
                팬 여론 {career.teams[career.playerTeamId]?.fanSentiment ?? 65}/100
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              성적·티켓 가격·라이벌전 결과에 따라 홈 관중 수요와 상품 판매가 변동됩니다.
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {(['저가', '표준', '프리미엄'] as TicketPricePolicy[]).map((pol) => {
              const cfg = TICKET_PRICE_CONFIG[pol];
              const active = currentTicketPolicy === pol;
              return (
                <button
                  key={pol}
                  type="button"
                  onClick={() => handleSetTicketPolicy(pol)}
                  className={`px-3 py-1.5 rounded border text-left transition-colors ${
                    active
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold">{cfg.label}</div>
                  <div className={`text-[10px] ${active ? 'text-white/85' : 'text-slate-500'}`}>
                    {cfg.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Franchise Star Merchandise Revenue & Club Reputation */}
        {(() => {
          const merch = computeClubFranchiseMerchandise(career, career.playerTeamId);
          const seasonMerch = career.finances.franchiseMerchRevenueBillion ?? 0;
          const rep = career.teams[career.playerTeamId]?.clubReputation ?? 70;
          return (
            <div className="p-3.5 rounded border border-amber-500/35 bg-amber-50/35 dark:bg-amber-950/15 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold flex items-center gap-2 text-amber-800 dark:text-amber-300">
                  <span>프랜차이즈 스타 기념상품 매출 · 구단 평판</span>
                  <span className="font-mono-stats text-slate-700 dark:text-slate-200">
                    구단 평판 {rep}/100
                  </span>
                </div>
                <div className="font-mono-stats text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  연간 예상 {merch.annualTotalBillion.toFixed(2)}억 · 시즌 누적 +{seasonMerch.toFixed(2)}억
                </div>
              </div>
              {merch.stars.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {merch.stars.map((s) => (
                    <div
                      key={s.playerId}
                      className="px-2.5 py-1 rounded border border-amber-500/30 bg-white/80 dark:bg-slate-900/80 font-mono-stats text-[11px]"
                    >
                      <strong className="text-slate-900 dark:text-white">{s.playerName}</strong>{' '}
                      <span className="text-amber-700 dark:text-amber-300">{s.tier}</span> · 인기 {s.popularityIndex} · 연 {s.annualMerchBillion.toFixed(1)}억
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  현재 구단에 등록된 프랜차이즈 스타(준프랜차이즈 이상)가 없습니다.
                </div>
              )}
              <div className="text-[10px] text-slate-500">
                ※ 프랜차이즈 스타 등급·기념상품 매출은 KBO 경쟁균형세 예외 선수(7시즌 이상 1명 50% 제외) 지정과 엄격히 별도로 관리됩니다.
              </div>
            </div>
          );
        })()}

        {/* Corporate Sponsor Negotiation & Comparison Panel */}
        {showSponsorPicker && (
          <div className="border border-orange-500/30 bg-orange-50/40 dark:bg-orange-950/10 rounded-md p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Building2 className="w-4 h-4 text-orange-600" />
                <span>{teamInfo.name} 맞춤 스폰서십 3대 선택지 · 조건 협상</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 p-0.5">
                  {([1, 2, 3] as const).map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setNegYears(yr)}
                      className={`px-2 py-0.5 rounded font-mono-stats font-semibold ${
                        negYears === yr ? 'bg-orange-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {yr}년
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 p-0.5">
                  {(['균형', '계약금', '승리보너스', '관중보너스'] as const).map((fc) => (
                    <button
                      key={fc}
                      type="button"
                      onClick={() => setNegFocus(fc)}
                      className={`px-2 py-0.5 rounded font-semibold ${
                        negFocus === fc ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : ''
                      }`}
                    >
                      {fc}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllSponsors((v) => !v)}
                  className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  {showAllSponsors ? '구단 맞춤 3곳만 보기' : `리그 전체 ${CORPORATE_SPONSORS.length}개 기업 보기`}
                </button>
              </div>
            </div>

            {/* Club-Specific 3 Differentiated Choices */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {tailoredSponsors.map((baseSp) => {
                const sp = previewNegotiatedSponsorTerms(baseSp, {
                  contractYears: negYears,
                  focus: negFocus,
                });
                const isSignedActive = activeSponsor?.id === sp.id && activeSponsor.status !== '만료';
                const canRenewSame = activeSponsor?.id === sp.id && activeSponsor.status === '만료';
                return (
                  <div
                    key={sp.id}
                    className={`p-3.5 rounded border bg-white dark:bg-slate-900 flex flex-col justify-between gap-2.5 ${
                      isSignedActive
                        ? 'border-emerald-600'
                        : baseSp.recommended
                        ? 'border-orange-500/80'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900">
                          {baseSp.strategyLabel}
                        </span>
                        {baseSp.recommended && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-600 text-white">
                            <Sparkles className="w-2.5 h-2.5" /> 추천
                          </span>
                        )}
                      </div>
                      <div className="flex items-start gap-2.5">
                        <SponsorLogo sponsor={sp} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-extrabold truncate">{sp.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {sp.industry} · {sp.tier}
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                        {baseSp.fitReason}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <div className="font-mono-stats space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500">협상 계약금 ({negYears}년)</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            +{sp.signingBonusBillion}억 원
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">시리즈 / 1승 / 관중</span>
                          <span>
                            +{sp.perSeriesBonusBillion} / +{sp.winBonusBillion} / +{sp.attendanceBonusBillion}억
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">유니폼 MD 보너스</span>
                          <span className="font-bold text-orange-600 dark:text-orange-400">
                            +{sp.merchBoostPct}%
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isSignedActive}
                        onClick={() => handleSelectSponsor(sp.id)}
                        className={`w-full py-1.5 rounded font-bold flex items-center justify-center gap-1 ${
                          isSignedActive
                            ? 'border border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                        }`}
                      >
                        {isSignedActive && <Check className="w-3.5 h-3.5" />}
                        <span>
                          {isSignedActive
                            ? '현재 계약 중'
                            : canRenewSame
                            ? '이 기업과 재계약'
                            : '이 조건으로 계약 체결'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {showAllSponsors && (
              <div className="space-y-3 pt-3 border-t border-orange-500/20">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {(['전체', '프리미엄', '메이저', '스탠다드'] as const).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setSponsorTierFilter(tier)}
                        className={`px-2.5 py-1 rounded font-semibold border ${
                          sponsorTierFilter === tier
                            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSponsorCompare((v) => !v)}
                    className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                  >
                    {showSponsorCompare ? '카드 보기' : '조건 비교표'}
                  </button>
                </div>

                {showSponsorCompare ? (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-900">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500">
                    <tr>
                      <th className="py-2 px-3">스폰서 기업</th>
                      <th className="py-2 px-2">업종</th>
                      <th className="py-2 px-2">등급</th>
                      <th className="py-2 px-2 text-right">협상 계약금</th>
                      <th className="py-2 px-2 text-right">시리즈</th>
                      <th className="py-2 px-2 text-right">승리</th>
                      <th className="py-2 px-2 text-right">관중</th>
                      <th className="py-2 px-2 text-right">유니폼 MD</th>
                      <th className="py-2 px-3 text-right">체결</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono-stats">
                    {filteredSponsors.map((baseSp) => {
                      const sp = previewNegotiatedSponsorTerms(baseSp, {
                        contractYears: negYears,
                        focus: negFocus,
                      });
                      const isActive = activeSponsor?.id === sp.id && activeSponsor.status !== '만료';
                      return (
                        <tr key={sp.id}>
                          <td className="py-2 px-3 font-sans">
                            <div className="flex items-center gap-2 font-bold">
                              <SponsorLogo sponsor={sp} size="sm" />
                              <span>{sp.name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2 font-sans text-slate-500">{sp.industry}</td>
                          <td className="py-2 px-2 font-sans">{sp.tier}</td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-700 dark:text-emerald-400">
                            +{sp.signingBonusBillion}억
                          </td>
                          <td className="py-2 px-2 text-right">+{sp.perSeriesBonusBillion}억</td>
                          <td className="py-2 px-2 text-right">+{sp.winBonusBillion}억</td>
                          <td className="py-2 px-2 text-right">+{sp.attendanceBonusBillion}억</td>
                          <td className="py-2 px-2 text-right text-orange-600 dark:text-orange-400">
                            +{sp.merchBoostPct}%
                          </td>
                          <td className="py-2 px-3 text-right font-sans">
                            <button
                              type="button"
                              disabled={isActive}
                              onClick={() => handleSelectSponsor(sp.id)}
                              className="px-2.5 py-1 rounded bg-orange-600 text-white font-semibold disabled:opacity-40"
                            >
                              {isActive ? '계약중' : activeSponsor?.status === '만료' ? '재계약' : '체결'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {filteredSponsors.map((baseSp) => {
                  const sp = previewNegotiatedSponsorTerms(baseSp, {
                    contractYears: negYears,
                    focus: negFocus,
                  });
                  const isSignedActive = activeSponsor?.id === sp.id && activeSponsor.status !== '만료';
                  const canRenewSame = activeSponsor?.id === sp.id && activeSponsor.status === '만료';
                  return (
                    <div
                      key={sp.id}
                      className={`p-3 rounded border bg-white dark:bg-slate-900 flex flex-col justify-between gap-2.5 ${
                        isSignedActive
                          ? 'border-emerald-600'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2">
                          <SponsorLogo sponsor={sp} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-extrabold truncate">{sp.name}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 shrink-0">
                                {sp.tier}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">{sp.industry}</div>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                          {sp.description}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                        <div className="font-mono-stats space-y-0.5">
                          <div className="flex justify-between">
                            <span className="text-slate-500">협상 계약금 ({negYears}년)</span>
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              +{sp.signingBonusBillion}억 원
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">시리즈 / 1승 / 관중</span>
                            <span>
                              +{sp.perSeriesBonusBillion} / +{sp.winBonusBillion} / +{sp.attendanceBonusBillion}억
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">유니폼 MD 보너스</span>
                            <span className="font-bold text-orange-600 dark:text-orange-400">
                              +{sp.merchBoostPct}%
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isSignedActive}
                          onClick={() => handleSelectSponsor(sp.id)}
                          className={`w-full py-1.5 rounded font-bold flex items-center justify-center gap-1 ${
                            isSignedActive
                              ? 'border border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                              : 'bg-orange-600 hover:bg-orange-700 text-white'
                          }`}
                        >
                          {isSignedActive && <Check className="w-3.5 h-3.5" />}
                          <span>
                            {isSignedActive
                              ? '현재 계약 중'
                              : canRenewSame
                              ? '이 기업과 재계약'
                              : activeSponsor
                              ? '협상 조건으로 체결'
                              : '계약 체결'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* #3: Smart Financial Investment Recommendations TOP 3 */}
      {investmentRecs.length > 0 && (
        <div className="border border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/15 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>단장실 자금 투자 추천 TOP {investmentRecs.length}</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              현재 보유 현금 · 구장 인기도 · 부상/피로 · 유망주 비중 기반 자동 분석
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {investmentRecs.map((rec) => (
              <div
                key={rec.id}
                className="p-3.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-2.5 text-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        rec.priority === '최우선'
                          ? 'bg-orange-600 text-white'
                          : rec.priority === '추천'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {rec.priority}
                    </span>
                    <span className="font-mono-stats font-extrabold text-orange-600 dark:text-orange-400">
                      {formatKrwBillionKorean(rec.costBillion)}
                    </span>
                  </div>
                  <div className="font-extrabold text-slate-900 dark:text-white leading-snug">
                    {rec.title}
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    {rec.reason}
                  </p>
                  <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    기대 효과: {rec.expectedEffect}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!rec.canAfford}
                  onClick={() => {
                    if (rec.kind === 'facility') {
                      handleUpgradeFacility(rec.targetKey as keyof ClubInvestments);
                    } else {
                      handleOneTimeSpend(rec.targetKey as OneTimeSpendDef['id']);
                    }
                  }}
                  className={`w-full py-1.5 rounded text-xs font-bold transition-colors ${
                    rec.canAfford
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'border border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {career.finances.cashBalanceBillion === null
                    ? '먼저 기본 자금을 편성하세요'
                    : rec.canAfford
                    ? `추천 투자 즉시 집행 (${formatKrwBillionKorean(rec.costBillion)})`
                    : `보유 현금 부족 (${formatKrwBillionKorean(rec.costBillion)} 필요)`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KBO Competitive Balance Tax (Salary Cap & Floor) Complete Management Center */}
      {(() => {
        const eligibleExceptionPlayers = getEligibleFranchiseExceptionPlayers(career, career.playerTeamId);
        const leagueCapTable = computeLeagueSalaryCapTable(career);
        const seasonHistory = [...(career.competitiveBalance?.seasonHistory ?? [])].reverse();
        const cap2026 = formatManwonKorean(getAnnualKboCapManwon(2026));
        const cap2027 = formatManwonKorean(getAnnualKboCapManwon(2027));
        const cap2028 = formatManwonKorean(getAnnualKboCapManwon(2028));
        const floor2027 = formatManwonKorean(getAnnualKboFloorManwon(2027) ?? 606538);
        const capRatioPct = Math.min(130, (salaryCap.teamTop40PayrollBillion / Math.max(1, salaryCap.capBillion)) * 100);

        const handleSetFranchiseException = (playerId: string | null) => {
          try {
            setNotice(null);
            const { nextCareer, backupSnapshot } = designateFranchiseExceptionPlayer(career, playerId);
            onUpdateCareer(nextCareer, backupSnapshot);
            const targetName = playerId ? career.players[playerId]?.name : null;
            setNotice({
              type: 'ok',
              text: targetName
                ? `${targetName} 선수를 프랜차이즈 예외 선수로 지정했습니다 (산정 보수 50% 제외).`
                : '프랜차이즈 예외 선수 지정을 해제했습니다.',
            });
          } catch (err) {
            setNotice({
              type: 'err',
              text: err instanceof Error ? err.message : '프랜차이즈 예외 선수 지정 오류',
            });
          }
        };

        return (
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-4 text-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                  KBO 경쟁균형세(샐러리캡 · 하한액) 공식 관리 센터
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono-stats">
                  상한: 2026 {cap2026} · 2027 {cap2027} · 2028 {cap2028} | 2027~ 하한 {floor2027}+ · 구단주 예산 {ownerCap.toFixed(0)}억
                </div>
              </div>
              <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden self-start">
                {(
                  [
                    { id: 'payroll', label: '공식 보수·예외' },
                    { id: 'league', label: '10구단 현황' },
                    { id: 'history', label: `시즌별 이력 (${seasonHistory.length})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCapCenterTab(t.id)}
                    className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      capCenterTab === t.id
                        ? 'bg-orange-600 text-white'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4 Key KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {career.season} 상위 40인 공식 보수
                </div>
                <div className="text-base font-black font-mono-stats text-slate-900 dark:text-white mt-0.5">
                  {formatBillionExactKorean(salaryCap.teamTop40PayrollBillion)}
                </div>
                <div className="text-[11px] mt-0.5 font-mono-stats">
                  {salaryCap.overCapBillion > 0 ? (
                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                      상한 +{formatBillionExactKorean(salaryCap.overCapBillion)} 초과 (연속 {salaryCap.exceedCount}회)
                    </span>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      여유 {formatBillionExactKorean(Math.max(0, salaryCap.capBillion - salaryCap.teamTop40PayrollBillion))}
                    </span>
                  )}
                </div>
                <div className="mt-2 h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded overflow-hidden">
                  <div
                    className={`h-full ${
                      salaryCap.overCapBillion > 0
                        ? 'bg-rose-500'
                        : capRatioPct > 90
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, capRatioPct)}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">시즌 종료 시 예상 제재금</div>
                <div
                  className={`text-base font-black font-mono-stats mt-0.5 ${
                    salaryCap.totalProjectedPenaltyBillion > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {formatBillionExactKorean(salaryCap.totalProjectedPenaltyBillion)}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {salaryCap.draftPenaltyWarning ? (
                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                      3년 연속 초과: 100% + 차기 1R 9단계 하락
                    </span>
                  ) : salaryCap.overCapBillion > 0 ? (
                    `초과액의 ${salaryCap.luxuryTaxRatePct}% · 시즌 종료 후 1회 차감`
                  ) : (
                    '미초과 시 연속 초과 횟수 0회 초기화'
                  )}
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {salaryCap.floorEnabled ? `${career.season} 하한액 기준` : '하한액 제도 (2027 도입)'}
                </div>
                <div className="text-base font-black font-mono-stats text-slate-900 dark:text-white mt-0.5">
                  {salaryCap.floorEnabled && salaryCap.floorManwon !== null
                    ? formatManwonKorean(salaryCap.floorManwon)
                    : `2027년 ${floor2027}`}
                </div>
                <div className="text-[11px] mt-0.5 font-mono-stats">
                  {salaryCap.floorEnabled ? (
                    salaryCap.underFloorBillion > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                        미달 -{formatBillionExactKorean(salaryCap.underFloorBillion)} (제재 {salaryCap.floorPenaltyRatePct}%)
                      </span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">하한 기준 충족</span>
                    )
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">2027시즌부터 과소 지출 제재 적용</span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">시즌 누적 보수·제재 지출</div>
                <div className="text-base font-black font-mono-stats text-slate-900 dark:text-white mt-0.5">
                  보수 {(career.finances.maintenanceExpenseBillion ?? 0).toFixed(1)}억 · 제재{' '}
                  {(career.finances.luxuryTaxPaidBillion ?? 0).toFixed(2)}억
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {salaryCap.pendingDraftPenaltyForSeason
                    ? `${salaryCap.pendingDraftPenaltyForSeason} 드래프트 1R 9단계 하락 확정`
                    : '시즌 종료 시 구단 자금에서 1회만 정산'}
                </div>
              </div>
            </div>

            {/* Franchise Exception Player Selector (7+ seasons tenure, 50% off) */}
            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-extrabold text-slate-900 dark:text-white">
                  프랜차이즈 예외 선수 지정 (현 구단 7시즌 이상 소속 등록 이력 1명 · 산정 보수 50% 제외)
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  {salaryCap.franchiseExceptionPlayerName ? (
                    <>
                      현재 지정: <strong>{salaryCap.franchiseExceptionPlayerName}</strong> · 절감액{' '}
                      <strong className="font-mono-stats text-emerald-700 dark:text-emerald-400">
                        -{formatBillionExactKorean(salaryCap.franchiseExceptionSavedBillion)}
                      </strong>{' '}
                      (제외 전 {salaryCap.grossTop40PayrollBillion.toFixed(2)}억 → 반영 후{' '}
                      {salaryCap.teamTop40PayrollBillion.toFixed(2)}억)
                    </>
                  ) : (
                    '지정된 예외 선수가 없습니다. 7시즌 이상 등록된 프랜차이즈 핵심 선수 1명을 선택해 경쟁균형세 부담을 경감하세요.'
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={salaryCap.franchiseExceptionPlayerId ?? ''}
                  onChange={(e) => handleSetFranchiseException(e.target.value || null)}
                  className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                >
                  <option value="">예외 선수 미지정</option>
                  {eligibleExceptionPlayers.map((ep) => {
                    const tenure = getPlayerClubTenureSeasons(ep);
                    return (
                      <option key={ep.id} value={ep.id}>
                        {ep.name} ({ep.position} · 소속 {tenure}시즌 · 연봉 {ep.contract.annualSalary.toFixed(2)}억)
                      </option>
                    );
                  })}
                </select>
                {salaryCap.franchiseExceptionPlayerId && (
                  <button
                    type="button"
                    onClick={() => handleSetFranchiseException(null)}
                    className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold"
                  >
                    해제
                  </button>
                )}
              </div>
            </div>

            {/* Sub-Tab 1: Top-40 Official Counted Payroll Breakdown */}
            {capCenterTab === 'payroll' && (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500">
                    <tr>
                      <th className="py-2 px-3">선수</th>
                      <th className="py-2 px-2">구단 등록</th>
                      <th className="py-2 px-2">다년계약 자동 산정식</th>
                      <th className="py-2 px-2 text-right">기본 산정</th>
                      <th className="py-2 px-3 text-right">최종 반영액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(salaryCap.topContributors ?? []).map((c) => (
                      <tr key={c.playerId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-1.5 px-3 font-bold text-slate-900 dark:text-white">
                          {c.playerName}{' '}
                          <span className="font-normal text-slate-500">({c.position})</span>
                          {c.isException && (
                            <span className="ml-1.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400">
                              [예외 -50%]
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 font-mono-stats text-slate-500">
                          {c.clubTenureSeasons}시즌
                        </td>
                        <td className="py-1.5 px-2 text-[11px] font-mono-stats text-slate-600 dark:text-slate-300">
                          {c.formulaLabel}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono-stats text-slate-500">
                          {c.baseCountedBillion.toFixed(2)}억
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono-stats font-extrabold text-slate-900 dark:text-white">
                          {c.countedBillion.toFixed(2)}억
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-Tab 2: All 10 KBO Clubs Identical Rules Table */}
            {capCenterTab === 'league' && (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500">
                    <tr>
                      <th className="py-2 px-3">구단</th>
                      <th className="py-2 px-2">프랜차이즈 예외</th>
                      <th className="py-2 px-2 text-right">공식 상위 40인</th>
                      <th className="py-2 px-2 text-right">상한 대비</th>
                      <th className="py-2 px-2 text-right">연속 초과</th>
                      <th className="py-2 px-3 text-right">예상 제재금</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {leagueCapTable.map(({ teamId, summary }) => {
                      const isMine = teamId === career.playerTeamId;
                      return (
                        <tr
                          key={teamId}
                          className={
                            isMine
                              ? 'bg-orange-500/5 font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }
                        >
                          <td className="py-1.5 px-3">
                            <div className="flex items-center gap-2">
                              <TeamLogo teamId={teamId} size="xs" />
                              <span className="text-slate-900 dark:text-white">
                                {KBO_TEAMS[teamId].name}
                              </span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-[11px] text-slate-600 dark:text-slate-300">
                            {summary.franchiseExceptionPlayerName
                              ? `${summary.franchiseExceptionPlayerName} (-${summary.franchiseExceptionSavedBillion.toFixed(2)}억)`
                              : '-'}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-stats font-bold text-slate-900 dark:text-white">
                            {summary.teamTop40PayrollBillion.toFixed(2)}억
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-stats">
                            {summary.overCapBillion > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400 font-bold">
                                +{summary.overCapBillion.toFixed(2)}억
                              </span>
                            ) : summary.floorEnabled && summary.underFloorBillion > 0 ? (
                              <span className="text-sky-600 dark:text-sky-400 font-bold">
                                하한 -{summary.underFloorBillion.toFixed(2)}억
                              </span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400">
                                여유 {(summary.capBillion - summary.teamTop40PayrollBillion).toFixed(2)}억
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-stats">
                            {summary.exceedCount > 0 ? (
                              <span className={summary.exceedCount >= 3 ? 'text-rose-600 dark:text-rose-400 font-extrabold' : ''}>
                                {summary.exceedCount}년차{summary.exceedCount >= 3 ? ' (1R -9)' : ''}
                              </span>
                            ) : (
                              '0회'
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono-stats font-bold text-amber-700 dark:text-amber-400">
                            {summary.totalProjectedPenaltyBillion > 0
                              ? `${summary.totalProjectedPenaltyBillion.toFixed(2)}억`
                              : '0억'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-Tab 3: Historical Season-End Settlement Ledger */}
            {capCenterTab === 'history' && (
              seasonHistory.length === 0 ? (
                <div className="p-4 text-center text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded">
                  아직 확정된 시즌 종료 경쟁균형세 정산 이력이 없습니다. 시즌 종료 시 10개 구단 전체 기록이 이곳에 보존됩니다.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-500">
                      <tr>
                        <th className="py-2 px-3">시즌</th>
                        <th className="py-2 px-2">구단</th>
                        <th className="py-2 px-2 text-right">공식 보수 / 상한</th>
                        <th className="py-2 px-2 text-right">초과·하한 상태</th>
                        <th className="py-2 px-2 text-right">확정 제재금</th>
                        <th className="py-2 px-3">비고</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {seasonHistory.map((rec, idx) => (
                        <tr
                          key={`${rec.season}-${rec.teamId}-${idx}`}
                          className={rec.teamId === career.playerTeamId ? 'bg-orange-500/5 font-semibold' : ''}
                        >
                          <td className="py-1.5 px-3 font-mono-stats">{rec.season}</td>
                          <td className="py-1.5 px-2">
                            <div className="flex items-center gap-1.5">
                              <TeamLogo teamId={rec.teamId} size="xs" />
                              <span>{KBO_TEAMS[rec.teamId].shortName}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-stats">
                            {rec.top40PayrollBillion.toFixed(2)}억 / {rec.capBillion.toFixed(2)}억
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-stats">
                            {rec.overCapBillion > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400 font-bold">
                                +{rec.overCapBillion.toFixed(2)}억 ({rec.exceedStreakAfter}년)
                              </span>
                            ) : rec.underFloorBillion > 0 ? (
                              <span className="text-sky-600 dark:text-sky-400 font-bold">
                                하한 -{rec.underFloorBillion.toFixed(2)}억
                              </span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400">정상 (초기화)</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-stats font-bold text-amber-700 dark:text-amber-400">
                            {rec.totalPenaltyBillion > 0 ? `${rec.totalPenaltyBillion.toFixed(2)}억` : '0억'}
                          </td>
                          <td className="py-1.5 px-3 text-[11px] text-slate-500">
                            {rec.draftPenaltyTriggered
                              ? `${rec.season + 1} 드래프트 1R 9단계 하락`
                              : rec.franchiseExceptionPlayerName
                              ? `예외: ${rec.franchiseExceptionPlayerName}`
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        );
      })()}

      {/* Club Investments (Facilities Lv 1->5) + Facility Degradation Maintenance (#4) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold">
              <ArrowUpCircle className="w-4 h-4 text-orange-600" />
              <span>구단 인프라 시설 투자 & 노후화 유지보수</span>
            </div>
            <span className="text-[11px] text-slate-500">
              경기장·훈련장·의료·MD 시설은 시즌 진행에 따라 노후화됩니다
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FACILITY_UPGRADES.map((fac) => {
              const curLv = investments[fac.key] ?? 1;
              const isMax = curLv >= 5;
              const nextCost = !isMax ? fac.costsByNextLevel[curLv + 1] : 0;
              const canAfford =
                career.finances.cashBalanceBillion !== null &&
                career.finances.cashBalanceBillion >= nextCost;
              const condKey: 'stadium' | 'academy' | 'medical' | 'marketing' =
                fac.key === 'stadiumLevel'
                  ? 'stadium'
                  : fac.key === 'academyLevel'
                  ? 'academy'
                  : fac.key === 'medicalLevel'
                  ? 'medical'
                  : 'marketing';
              const condVal = facCond[condKey] ?? 85;
              const needsRepair = condVal < 95;
              const estRepairCost = Number(
                Math.max(1.5, (100 - condVal) * (condKey === 'stadium' ? 0.14 : condKey === 'marketing' ? 0.08 : 0.1)).toFixed(1)
              );
              return (
                <div
                  key={fac.key}
                  className="p-3.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold">{fac.name}</span>
                      <span className="text-xs font-mono-stats font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 shrink-0">
                        Lv.{curLv}/5
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {fac.shortDesc}
                    </p>
                    <div className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                      {fac.effectPerLevel}
                    </div>
                    <div className="pt-1">
                      <div className="flex items-center justify-between text-[11px] font-mono-stats">
                        <span className="text-slate-500">시설 컨디션 (노후화)</span>
                        <span
                          className={`font-bold ${
                            condVal < 60
                              ? 'text-rose-600 dark:text-rose-400'
                              : condVal < 80
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {condVal.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            condVal < 60 ? 'bg-rose-500' : condVal < 80 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(10, condVal))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    {needsRepair ? (
                      <button
                        type="button"
                        onClick={() => handleRepairFacility(condKey)}
                        className="px-2.5 py-1.5 rounded text-[11px] font-bold border border-indigo-500/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors"
                      >
                        유지보수 ({estRepairCost}억)
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        컨디션 최상
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={isMax || !canAfford}
                      onClick={() => handleUpgradeFacility(fac.key)}
                      className={`px-3 py-1.5 rounded text-xs font-bold font-mono-stats ${
                        isMax
                          ? 'border border-slate-300 dark:border-slate-700 text-slate-400'
                          : canAfford
                          ? 'bg-orange-600 hover:bg-orange-700 text-white'
                          : 'border border-slate-300 dark:border-slate-700 text-slate-400 opacity-60'
                      }`}
                    >
                      {isMax ? '최고 레벨' : `Lv.${curLv + 1} 증축 (${nextCost}억)`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* One-time Team Spend (Rotating Pool of 9) */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="w-4 h-4 text-orange-600" />
              <span>구단 자금 집행 (사용 시 자동 교체)</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              1회 실행하면 완료된 프로그램이 9종 풀에서 새로운 특훈·재활·스카우팅 프로그램으로 즉시 교체됩니다.
            </p>
          </div>
          <div className="space-y-2.5">
            {activeSpendOptions.map((opt) => {
              const canAfford =
                career.finances.cashBalanceBillion !== null &&
                career.finances.cashBalanceBillion >= opt.costBillion;
              return (
                <div
                  key={opt.id}
                  className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">{opt.name}</span>
                    <span className="text-xs font-mono-stats font-bold text-orange-600 dark:text-orange-400 shrink-0">
                      {opt.costBillion}억 원
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {opt.effectSummary}
                  </div>
                  <button
                    type="button"
                    disabled={!canAfford}
                    onClick={() => handleOneTimeSpend(opt.id)}
                    className={`w-full py-1.5 rounded text-xs font-bold ${
                      canAfford
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90'
                        : 'border border-slate-300 dark:border-slate-700 text-slate-400 opacity-60'
                    }`}
                  >
                    자금 집행 실행 (후속 프로그램 교체)
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Obligations Ledger */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-2">
        <div className="text-xs font-bold">미지급 계약 의무 목록 (수동 승인 지급 · 보유 현금에서 차감)</div>
        {career.finances.obligations.length === 0 ? (
          <div className="p-3 text-xs text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded">
            기록된 확정 미지급 의무가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
            {career.finances.obligations.map((ob) => {
              const remaining = Math.max(0, ob.amount - ob.paidAmount);
              const paid = remaining <= 0;
              return (
                <div
                  key={ob.id}
                  className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold">{ob.label}</div>
                    <div className="text-slate-500 font-mono-stats">
                      약정{' '}
                      {ob.currency === 'KRW'
                        ? `${ob.amount.toFixed(2)}억 원`
                        : `$${ob.amount.toLocaleString()}`}{' '}
                      · 잔액{' '}
                      {ob.currency === 'KRW'
                        ? `${remaining.toFixed(2)}억 원`
                        : `$${remaining.toLocaleString()}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={paid}
                    onClick={() => handlePay(ob.id)}
                    className={`px-3 py-1.5 rounded font-semibold shrink-0 ${
                      paid
                        ? 'border border-slate-200 dark:border-slate-700 text-slate-400'
                        : 'bg-orange-600 hover:bg-orange-700 text-white'
                    }`}
                  >
                    {paid ? '지급 완료' : '현금 지급 실행'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save / Backup / JSON Export & Import */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold flex items-center gap-1.5">
              <History className="w-4 h-4 text-orange-600" />
              <span>세이브 관리 · 롤링 백업 ({backups.length}개)</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleManualSave}
                className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                수동 저장
              </button>
              <button
                type="button"
                onClick={handleDownloadJson}
                className="px-3 py-1.5 text-xs font-bold rounded bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSON 내보내기</span>
              </button>
            </div>
          </div>

          {/* Save As New Named Slot */}
          {onSaveAsNewSlot && (
            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2 text-xs">
              <div className="font-bold flex items-center gap-1.5">
                <CopyPlus className="w-3.5 h-3.5 text-orange-600" />
                <span>다른 이름으로 새 슬롯 저장 (분기 백업)</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSlotName}
                  onChange={(e) => setNewSlotName(e.target.value)}
                  placeholder="새 세이브 슬롯 이름 입력"
                  className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    onSaveAsNewSlot(newSlotName);
                    setNotice({
                      type: 'ok',
                      text: `새 세이브 슬롯 [${newSlotName.trim() || career.label}]에 복제 저장했습니다.`,
                    });
                  }}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0"
                >
                  새 슬롯 저장
                </button>
              </div>
            </div>
          )}

          {/* Saved Slots Quick Switcher */}
          {savedCareers.length > 0 && (
            <div className="space-y-1.5 text-xs">
              <div className="font-bold text-slate-700 dark:text-slate-200">
                저장된 커리어 슬롯 ({savedCareers.length}개) · 바로 전환/이름변경
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded max-h-48 overflow-y-auto">
                {savedCareers.map((sc) => {
                  const isCurrent = sc.careerId === career.careerId;
                  const isRenaming = renamingId === sc.careerId;
                  return (
                    <div
                      key={sc.careerId}
                      className={`px-3 py-2 flex items-center justify-between gap-2 ${
                        isCurrent ? 'bg-orange-500/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <TeamLogo teamId={sc.playerTeamId} size="xs" />
                        <div className="min-w-0 flex-1">
                          {isRenaming ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={renamingText}
                                onChange={(e) => setRenamingText(e.target.value)}
                                className="flex-1 min-w-0 px-2 py-0.5 rounded border border-orange-500 bg-white dark:bg-slate-950 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (renamingText.trim()) {
                                    onRenameCareer?.(sc.careerId, renamingText);
                                    setNotice({ type: 'ok', text: '슬롯 이름을 변경했습니다.' });
                                  }
                                  setRenamingId(null);
                                }}
                                className="px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold"
                              >
                                저장
                              </button>
                            </div>
                          ) : (
                            <div className="font-semibold truncate flex items-center gap-1.5">
                              <span className="truncate">{sc.label}</span>
                              {isCurrent && (
                                <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 shrink-0">
                                  (현재)
                                </span>
                              )}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 font-mono-stats">
                            {sc.season}시즌 · {sc.wins}승 {sc.losses}패 · {sc.gamesPlayed}/{sc.totalRegularGames}G ·{' '}
                            {sc.updatedAt.slice(5, 16).replace('T', ' ')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {onRenameCareer && !isRenaming && (
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(sc.careerId);
                              setRenamingText(sc.label);
                            }}
                            className="p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                            title="이름 변경"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {!isCurrent && onSwitchCareer && (
                          <button
                            type="button"
                            onClick={() => onSwitchCareer(sc.careerId)}
                            className="px-2 py-1 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-semibold"
                          >
                            전환
                          </button>
                        )}
                        {!isCurrent && onDeleteCareer && (
                          <button
                            type="button"
                            onClick={() => onDeleteCareer(sc.careerId)}
                            className="p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-600"
                            title="슬롯 삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {backups.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded">
              경기 시뮬레이션이나 계약/트레이드를 실행하면 직전 상태 롤링 백업이 자동 보관됩니다.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded text-xs">
              {backups.map((b, i) => (
                <div key={`${b.version}-${i}`} className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      백업 #{i + 1} · {b.version}
                    </div>
                    <div className="text-slate-500 font-mono-stats">
                      {b.gamesPlayed}/{b.totalRegularGames}경기 · {b.updatedAt.slice(0, 16).replace('T', ' ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreBackup(i)}
                    className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 font-semibold"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>복원</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Import JSON directly here too */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="font-bold">외부 세이브 JSON 불러오기</div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const r = new FileReader();
                  r.onload = () => onImportJson(String(r.result ?? ''));
                  r.readAsText(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>파일 불러오기</span>
              </button>
              <input
                type="text"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="JSON 문자열 붙여넣기"
                className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
              />
              <button
                type="button"
                disabled={!importText.trim()}
                onClick={() => {
                  onImportJson(importText);
                  setImportText('');
                }}
                className="px-3 py-1.5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold disabled:opacity-40"
              >
                적용
              </button>
            </div>
          </div>
        </div>

        {/* Transaction Log */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-4 space-y-3">
          <div className="text-sm font-bold">구단 프런트 트랜잭션 기록</div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {career.transactionLogs.length === 0 ? (
              <div className="text-slate-500 py-3">기록된 트랜잭션이 없습니다.</div>
            ) : (
              career.transactionLogs.map((tx) => (
                <div key={tx.id} className="py-2 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      [{tx.type}] {tx.summary}
                    </span>
                    <span className="font-mono-stats text-slate-400 shrink-0 ml-2">{tx.date}</span>
                  </div>
                  {tx.detail && <div className="text-slate-500">{tx.detail}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
