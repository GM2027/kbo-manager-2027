import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Globe2,
  History,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  Sliders,
  Undo2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { DEFAULT_INVESTMENTS, TEAM_STARTING_CASH_BILLION } from '../data/financesData';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { createNewCareer } from '../data/newGameTemplate';
import {
  ALL_HIDDEN_TRAITS,
  ALL_MILITARY_STATUSES,
  ALL_MORALE_STATES,
  ALL_OVERSEAS_LEAGUES,
  ALL_PITCH_ROLES,
  ALL_ROSTER_TIERS,
  applyClubFinancesEditToCareer,
  applyOverseasEditToCareer,
  applyPlayerEditToCareer,
  ClubFinancesEditorDraft,
  createNewPlayerInCareer,
  diffClubFinancesDraft,
  NewPlayerEditorForm,
  OverseasEditorDraft,
  PlayerEditorDraft,
  playerToEditorDraft,
  restoreAllEditorOriginalsInCareer,
  restoreSinglePlayerOriginalInCareer,
  undoLastEditorChangeInCareer,
  validateNewPlayerForm,
  validatePlayerEditorDraft,
} from '../engine/editorEngine';
import { isMilitaryServing } from '../engine/militaryEngine';
import {
  computeDerivedContactPair,
  computeOotpBatterOverall,
  computeOotpPitcherOverall,
  evaluatePitcherRoleFit,
} from '../engine/ootpRatingsEngine';
import { ALL_FIELD_POSITIONS, formatCompactPlayerPosition } from '../engine/positionEngine';
import {
  countPreGameEditorChanges,
  loadPreGameEditorStore,
  resetPreGameEditorStore,
  savePreGameEditorStore,
} from '../storage/editorStorage';
import {
  CareerSave,
  ClubInvestments,
  EditorFieldDiff,
  MilitaryStatus,
  OverseasPlayerRecord,
  Player,
  Position,
  PreGameEditorStore,
  RosterTier,
  TeamId,
  TicketPricePolicy,
} from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface GameEditorViewProps {
  mode: 'PREGAME' | 'INGAME';
  career?: CareerSave;
  onUpdateCareer?: (next: CareerSave, backup?: CareerSave) => void;
  onNotify?: (msg: string, tone?: 'info' | 'success' | 'error') => void;
  onClose?: () => void;
  onPreGameStoreChanged?: (store: PreGameEditorStore) => void;
}

type EditorSubTab = 'players' | 'create' | 'finances' | 'history';
type ScopeFilter = 'ALL' | '1군' | '2군' | '육성' | '상무' | 'FA' | '해외';

interface PendingConfirmState {
  title: string;
  subtitle: string;
  diffs: EditorFieldDiff[];
  warnings?: string[];
  onConfirm: () => void;
}

const DEFAULT_NEW_PLAYER_FORM: NewPlayerEditorForm = {
  name: '',
  teamId: 'SSG',
  role: '타자',
  position: '1B',
  secondaryPositions: [],
  pitchRole: '중간',
  birthDate: '2003-05-15',
  nationality: '한국',
  category: '국내',
  heightCm: 183,
  weightKg: 86,
  throws: 'R',
  bats: 'R',
  uniformNumber: '',
  ability: 65,
  potential: 78,
  contactProxy: 65,
  powerProxy: 65,
  eyeProxy: 64,
  speedProxy: 62,
  defenseProxy: 64,
  stuffProxy: 68,
  controlProxy: 64,
  movementProxy: 65,
  staminaProxy: 56,
  rosterTier: '2군',
  militaryStatus: '군필',
  annualSalary: 0.5,
  years: 1,
  hiddenTrait: '',
  school: '',
};

const PITCHER_POSITIONS: Position[] = ['SP', 'RP', 'CL'];

export const GameEditorView: React.FC<GameEditorViewProps> = ({
  mode,
  career: inGameCareer,
  onUpdateCareer,
  onNotify,
  onClose,
  onPreGameStoreChanged,
}) => {
  const [preGameStore, setPreGameStore] = useState<PreGameEditorStore>(() =>
    mode === 'PREGAME' ? loadPreGameEditorStore() : loadPreGameEditorStore()
  );

  // Build live workspace career for PREGAME mode (reflects base DB + saved pregame overrides)
  const [preGameWorkspace, setPreGameWorkspace] = useState<CareerSave | null>(() => {
    if (mode !== 'PREGAME') return null;
    const store = loadPreGameEditorStore();
    const base = createNewCareer({
      teamId: 'LG',
      seed: 2027,
      skipPreGameEditor: false,
      preGameEditorStoreOverride: store,
    });
    base.editorHistory = [...store.history];
    return base;
  });

  const activeCareer = mode === 'INGAME' ? inGameCareer! : preGameWorkspace!;

  const [subTab, setSubTab] = useState<EditorSubTab>('players');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL');
  const [teamFilter, setTeamFilter] = useState<TeamId | 'ALL'>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | '타자' | '투수'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedOverseasId, setSelectedOverseasId] = useState<string | null>(null);
  const [playerEditSection, setPlayerEditSection] = useState<'bio' | 'ratings' | 'position' | 'contract'>('bio');
  const [ootpEditTab, setOotpEditTab] = useState<'batting' | 'pitching' | 'defense' | 'baserunning' | 'personality'>('batting');

  const [playerDraft, setPlayerDraft] = useState<PlayerEditorDraft | null>(null);
  const [overseasDraft, setOverseasDraft] = useState<OverseasEditorDraft | null>(null);
  const [newPlayerForm, setNewPlayerForm] = useState<NewPlayerEditorForm>(() => ({
    ...DEFAULT_NEW_PLAYER_FORM,
    teamId: activeCareer.playerTeamId,
  }));

  const [financeTargetTeam, setFinanceTargetTeam] = useState<TeamId>(activeCareer.playerTeamId);
  const [financeDraft, setFinanceDraft] = useState<ClubFinancesEditorDraft>(() => ({
    teamId: activeCareer.playerTeamId,
    cashBalanceBillion: activeCareer.finances.cashBalanceBillion ?? TEAM_STARTING_CASH_BILLION[activeCareer.playerTeamId],
    ownerBudgetCapBillion: activeCareer.finances.ownerBudgetCapBillion ?? 151.2,
    ticketPricePolicy: activeCareer.finances.ticketPricePolicy ?? '표준',
    krwUnpaidBillion: activeCareer.finances.krwUnpaidBillion ?? 0,
    usdUnpaid: activeCareer.finances.usdUnpaid ?? 0,
    investments: { ...DEFAULT_INVESTMENTS, ...(activeCareer.finances.investments ?? {}) },
  }));

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmState | null>(null);
  const [localNotice, setLocalNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const notify = (text: string, tone: 'info' | 'success' | 'error' = 'info') => {
    setLocalNotice({ type: tone === 'error' ? 'err' : 'ok', text });
    onNotify?.(text, tone);
  };

  // Sync finance draft when team selector changes in PREGAME mode or career finances update
  useEffect(() => {
    if (mode === 'PREGAME') {
      const cash =
        preGameStore.clubCashOverrides[financeTargetTeam] ??
        TEAM_STARTING_CASH_BILLION[financeTargetTeam];
      const cap = preGameStore.clubBudgetCapOverrides[financeTargetTeam] ?? 151.2;
      const fac: ClubInvestments = {
        ...DEFAULT_INVESTMENTS,
        ...(preGameStore.clubFacilityOverrides[financeTargetTeam] ?? {}),
      };
      setFinanceDraft({
        teamId: financeTargetTeam,
        cashBalanceBillion: cash,
        ownerBudgetCapBillion: cap,
        ticketPricePolicy: '표준',
        krwUnpaidBillion: 0,
        usdUnpaid: 0,
        investments: fac,
      });
    } else if (inGameCareer) {
      setFinanceTargetTeam(inGameCareer.playerTeamId);
      setFinanceDraft({
        teamId: inGameCareer.playerTeamId,
        cashBalanceBillion:
          inGameCareer.finances.cashBalanceBillion ??
          TEAM_STARTING_CASH_BILLION[inGameCareer.playerTeamId],
        ownerBudgetCapBillion: inGameCareer.finances.ownerBudgetCapBillion ?? 151.2,
        ticketPricePolicy: inGameCareer.finances.ticketPricePolicy ?? '표준',
        krwUnpaidBillion: inGameCareer.finances.krwUnpaidBillion ?? 0,
        usdUnpaid: inGameCareer.finances.usdUnpaid ?? 0,
        investments: { ...DEFAULT_INVESTMENTS, ...(inGameCareer.finances.investments ?? {}) },
      });
    }
  }, [mode, financeTargetTeam, inGameCareer, preGameStore]);

  // Filtered KBO players list
  const filteredKboPlayers = useMemo(() => {
    if (scopeFilter === '해외') return [];
    const q = searchQuery.trim().toLowerCase();
    return Object.values(activeCareer.players)
      .filter((p) => {
        if (teamFilter !== 'ALL' && p.teamId !== teamFilter) return false;
        if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
        if (scopeFilter === '1군' && p.rosterTier !== '1군') return false;
        if (scopeFilter === '2군' && p.rosterTier !== '2군') return false;
        if (scopeFilter === '육성' && p.rosterTier !== '육성') return false;
        if (scopeFilter === '상무' && !isMilitaryServing(p.militaryStatus)) return false;
        if (scopeFilter === 'FA' && p.rosterTier !== 'FA' && p.contract.status !== 'FA') return false;
        if (q) {
          const hay = `${p.name} ${KBO_TEAMS[p.teamId].name} ${p.teamId} ${p.position} ${p.uniformNumber ?? ''} ${p.id}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.ability - a.ability || b.potential - a.potential);
  }, [activeCareer.players, scopeFilter, teamFilter, roleFilter, searchQuery]);

  // Filtered Overseas players list
  const filteredOverseasPlayers = useMemo(() => {
    if (scopeFilter !== 'ALL' && scopeFilter !== '해외') return [];
    const q = searchQuery.trim().toLowerCase();
    const list = activeCareer.amateurAndOverseas?.overseasPlayers ?? [];
    return list
      .filter((o) => {
        if (roleFilter !== 'ALL' && o.role !== roleFilter) return false;
        if (teamFilter !== 'ALL' && o.originalKboTeamId !== teamFilter) return false;
        if (q) {
          const hay = `${o.name} ${o.clubName} ${o.league} ${o.position} ${o.originalKboTeamId ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.ability - a.ability);
  }, [activeCareer.amateurAndOverseas, scopeFilter, teamFilter, roleFilter, searchQuery]);

  // Auto-select first player if none selected
  useEffect(() => {
    if (selectedPlayerId && activeCareer.players[selectedPlayerId]) {
      setPlayerDraft(playerToEditorDraft(activeCareer.players[selectedPlayerId]));
    } else if (selectedOverseasId) {
      const ov = (activeCareer.amateurAndOverseas?.overseasPlayers ?? []).find(
        (o) => o.permanentId === selectedOverseasId
      );
      if (ov) {
        setOverseasDraft({
          permanentId: ov.permanentId,
          name: ov.name,
          birthDate: ov.birthDate ?? `${ov.birthYear}-01-01`,
          age: ov.age,
          role: ov.role,
          position: ov.position,
          ability: ov.ability,
          potential: ov.potential,
          league: ov.league,
          clubName: ov.clubName,
          originalKboTeamId: ov.originalKboTeamId ?? '',
          annualSalaryUsdThousands: ov.annualSalaryUsdThousands,
          contractYearsRemaining: ov.contractYearsRemaining,
          militaryStatus: ov.militaryStatus === '복무중' ? '복무 중' : (ov.militaryStatus ?? '미확인'),
          returnRestrictionActive: Boolean(ov.returnRestrictionActive),
        });
      }
    }
  }, [selectedPlayerId, selectedOverseasId, activeCareer]);

  const handleSelectKboPlayer = (p: Player) => {
    setSelectedOverseasId(null);
    setOverseasDraft(null);
    setSelectedPlayerId(p.id);
    setPlayerDraft(playerToEditorDraft(p));
    setLocalNotice(null);
  };

  const handleSelectOverseasPlayer = (ov: OverseasPlayerRecord) => {
    setSelectedPlayerId(null);
    setPlayerDraft(null);
    setSelectedOverseasId(ov.permanentId);
    setOverseasDraft({
      permanentId: ov.permanentId,
      name: ov.name,
      birthDate: ov.birthDate ?? `${ov.birthYear}-01-01`,
      age: ov.age,
      role: ov.role,
      position: ov.position,
      ability: ov.ability,
      potential: ov.potential,
      league: ov.league,
      clubName: ov.clubName,
      originalKboTeamId: ov.originalKboTeamId ?? '',
      annualSalaryUsdThousands: ov.annualSalaryUsdThousands,
      contractYearsRemaining: ov.contractYearsRemaining,
      militaryStatus: ov.militaryStatus === '복무중' ? '복무 중' : (ov.militaryStatus ?? '미확인'),
      returnRestrictionActive: Boolean(ov.returnRestrictionActive),
    });
    setLocalNotice(null);
  };

  const persistPreGameUpdate = (nextWorkspace: CareerSave, nextStore: PreGameEditorStore) => {
    savePreGameEditorStore(nextStore);
    setPreGameStore(nextStore);
    setPreGameWorkspace(nextWorkspace);
    onPreGameStoreChanged?.(nextStore);
  };

  // Validate & open before/after confirm modal for KBO Player edit
  const handleReviewPlayerSave = () => {
    if (!playerDraft) return;
    const orig = activeCareer.players[playerDraft.id];
    if (!orig) return;
    const check = validatePlayerEditorDraft(activeCareer, orig, playerDraft);
    if (!check.valid) {
      notify(check.errors.join(' / '), 'error');
      return;
    }
    if (check.diffs.length === 0) {
      notify('변경된 항목이 없습니다.', 'info');
      return;
    }
    setPendingConfirm({
      title: `${orig.name} 선수 데이터 변경 확인`,
      subtitle:
        mode === 'PREGAME'
          ? '프리게임 에디터 수정 사항으로 저장되며, 이후 새로 시작하는 게임에만 적용됩니다.'
          : '현재 진행 중인 세이브 데이터에만 즉시 반영되며 경기·로스터·계약·병역·FA 보상 시스템에 연동됩니다.',
      diffs: check.diffs,
      warnings: check.warnings,
      onConfirm: () => {
        try {
          const { nextCareer, logEntry } = applyPlayerEditToCareer(activeCareer, playerDraft, mode);
          if (mode === 'INGAME') {
            onUpdateCareer?.(nextCareer, activeCareer);
          } else {
            const updatedPl = nextCareer.players[playerDraft.id];
            const isCustomCreated = preGameStore.createdPlayers.some((c) => c.id === updatedPl.id);
            const nextStore: PreGameEditorStore = {
              ...preGameStore,
              updatedAt: new Date().toISOString(),
              playerPatches: isCustomCreated
                ? preGameStore.playerPatches
                : { ...preGameStore.playerPatches, [updatedPl.id]: updatedPl },
              createdPlayers: isCustomCreated
                ? preGameStore.createdPlayers.map((c) => (c.id === updatedPl.id ? updatedPl : c))
                : preGameStore.createdPlayers,
              history: [logEntry, ...preGameStore.history].slice(0, 120),
            };
            persistPreGameUpdate(nextCareer, nextStore);
          }
          setPendingConfirm(null);
          notify(`${playerDraft.name} 선수 수정이 저장되었습니다 (${check.diffs.length}개 항목).`, 'success');
        } catch (err) {
          setPendingConfirm(null);
          notify(err instanceof Error ? err.message : '선수 저장 오류', 'error');
        }
      },
    });
  };

  // Validate & open confirm modal for Overseas Player edit
  const handleReviewOverseasSave = () => {
    if (!overseasDraft) return;
    try {
      const { nextCareer, logEntry, updatedOverseas } = applyOverseasEditToCareer(
        activeCareer,
        overseasDraft,
        mode
      );
      setPendingConfirm({
        title: `[해외] ${overseasDraft.name} 변경 확인`,
        subtitle:
          mode === 'PREGAME'
            ? '프리게임 에디터 해외 진출 선수 수정 사항으로 저장됩니다.'
            : '현재 세이브의 해외 진출 선수 명단에 즉시 반영됩니다.',
        diffs: logEntry.diffs,
        onConfirm: () => {
          if (mode === 'INGAME') {
            onUpdateCareer?.(nextCareer, activeCareer);
          } else {
            const nextStore: PreGameEditorStore = {
              ...preGameStore,
              updatedAt: new Date().toISOString(),
              overseasPatches: {
                ...preGameStore.overseasPatches,
                [updatedOverseas.permanentId]: updatedOverseas,
              },
              history: [logEntry, ...preGameStore.history].slice(0, 120),
            };
            persistPreGameUpdate(nextCareer, nextStore);
          }
          setPendingConfirm(null);
          notify(`${overseasDraft.name} 해외 선수 정보가 수정되었습니다.`, 'success');
        },
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : '해외 선수 수정 오류', 'error');
    }
  };

  // Validate & open confirm modal for New Player creation
  const handleReviewNewPlayer = () => {
    const check = validateNewPlayerForm(activeCareer, newPlayerForm);
    if (!check.valid) {
      notify(check.errors.join(' / '), 'error');
      return;
    }
    setPendingConfirm({
      title: `신규 선수 생성 확인: ${newPlayerForm.name.trim()}`,
      subtitle: `${KBO_TEAMS[newPlayerForm.teamId].name} 선수단에 새 선수를 정식 등록합니다.`,
      diffs: check.diffs,
      onConfirm: () => {
        try {
          const { nextCareer, createdPlayer, logEntry } = createNewPlayerInCareer(
            activeCareer,
            newPlayerForm,
            mode
          );
          if (mode === 'INGAME') {
            onUpdateCareer?.(nextCareer, activeCareer);
          } else {
            const nextStore: PreGameEditorStore = {
              ...preGameStore,
              updatedAt: new Date().toISOString(),
              createdPlayers: [...preGameStore.createdPlayers, createdPlayer],
              history: [logEntry, ...preGameStore.history].slice(0, 120),
            };
            persistPreGameUpdate(nextCareer, nextStore);
          }
          setPendingConfirm(null);
          setNewPlayerForm({ ...DEFAULT_NEW_PLAYER_FORM, teamId: newPlayerForm.teamId });
          setSubTab('players');
          handleSelectKboPlayer(createdPlayer);
          notify(`신규 선수 ${createdPlayer.name}(${KBO_TEAMS[createdPlayer.teamId].shortName})이(가) 생성되었습니다.`, 'success');
        } catch (err) {
          setPendingConfirm(null);
          notify(err instanceof Error ? err.message : '선수 생성 오류', 'error');
        }
      },
    });
  };

  // Validate & open confirm modal for Club Finances edit
  const handleReviewFinancesSave = () => {
    const baseCareerForDiff =
      mode === 'PREGAME'
        ? {
            ...activeCareer,
            finances: {
              ...activeCareer.finances,
              cashBalanceBillion:
                preGameStore.clubCashOverrides[financeTargetTeam] ??
                TEAM_STARTING_CASH_BILLION[financeTargetTeam],
              ownerBudgetCapBillion:
                preGameStore.clubBudgetCapOverrides[financeTargetTeam] ?? 151.2,
              investments: {
                ...DEFAULT_INVESTMENTS,
                ...(preGameStore.clubFacilityOverrides[financeTargetTeam] ?? {}),
              },
            },
          }
        : activeCareer;

    const check = diffClubFinancesDraft(baseCareerForDiff, financeDraft);
    if (!check.valid) {
      notify(check.errors.join(' / '), 'error');
      return;
    }
    if (check.diffs.length === 0) {
      notify('변경된 재정·예산 항목이 없습니다.', 'info');
      return;
    }
    setPendingConfirm({
      title: `${KBO_TEAMS[financeDraft.teamId].name} 재정 · 예산 변경 확인`,
      subtitle:
        mode === 'PREGAME'
          ? '새 게임 시작 시 해당 구단을 선택했을 때 적용되는 초기 자금·예산·시설 설정입니다.'
          : '현재 세이브의 구단 보유 현금, 예산 상한, 시설 레벨에 즉시 반영됩니다.',
      diffs: check.diffs,
      onConfirm: () => {
        try {
          if (mode === 'INGAME') {
            const { nextCareer } = applyClubFinancesEditToCareer(activeCareer, financeDraft, mode);
            onUpdateCareer?.(nextCareer, activeCareer);
          } else {
            const { nextCareer, logEntry } = applyClubFinancesEditToCareer(
              baseCareerForDiff,
              financeDraft,
              mode
            );
            const nextStore: PreGameEditorStore = {
              ...preGameStore,
              updatedAt: new Date().toISOString(),
              clubCashOverrides: {
                ...preGameStore.clubCashOverrides,
                [financeDraft.teamId]: financeDraft.cashBalanceBillion,
              },
              clubBudgetCapOverrides: {
                ...preGameStore.clubBudgetCapOverrides,
                [financeDraft.teamId]: financeDraft.ownerBudgetCapBillion,
              },
              clubFacilityOverrides: {
                ...preGameStore.clubFacilityOverrides,
                [financeDraft.teamId]: { ...financeDraft.investments },
              },
              history: [logEntry, ...preGameStore.history].slice(0, 120),
            };
            persistPreGameUpdate(nextCareer, nextStore);
          }
          setPendingConfirm(null);
          notify(`${KBO_TEAMS[financeDraft.teamId].shortName} 재정·예산 수정이 저장되었습니다.`, 'success');
        } catch (err) {
          setPendingConfirm(null);
          notify(err instanceof Error ? err.message : '재정 저장 오류', 'error');
        }
      },
    });
  };

  // Undo last change
  const handleUndoLast = () => {
    try {
      if (mode === 'INGAME') {
        const { nextCareer, undoneEntry } = undoLastEditorChangeInCareer(activeCareer);
        onUpdateCareer?.(nextCareer, activeCareer);
        notify(`직전 변경 취소 완료: ${undoneEntry.summary}`, 'info');
      } else {
        if (preGameStore.history.length === 0) {
          notify('취소할 프리게임 수정 내역이 없습니다.', 'info');
          return;
        }
        const latest = preGameStore.history[0];
        const nextStore: PreGameEditorStore = {
          ...preGameStore,
          updatedAt: new Date().toISOString(),
          history: preGameStore.history.slice(1),
          playerPatches: { ...preGameStore.playerPatches },
          createdPlayers: [...preGameStore.createdPlayers],
          overseasPatches: { ...preGameStore.overseasPatches },
          clubCashOverrides: { ...preGameStore.clubCashOverrides },
          clubBudgetCapOverrides: { ...preGameStore.clubBudgetCapOverrides },
          clubFacilityOverrides: { ...preGameStore.clubFacilityOverrides },
        };
        if (latest.targetType === 'NEW_PLAYER') {
          nextStore.createdPlayers = nextStore.createdPlayers.filter((p) => p.id !== latest.targetId);
        } else if (latest.targetType === 'PLAYER') {
          if (latest.prevSnapshot) {
            // If there's an older edit for the same player, restore snapshot; else delete patch
            const hasEarlier = nextStore.history.some((h) => h.targetId === latest.targetId);
            if (hasEarlier) nextStore.playerPatches[latest.targetId] = latest.prevSnapshot as Player;
            else delete nextStore.playerPatches[latest.targetId];
          } else {
            delete nextStore.playerPatches[latest.targetId];
          }
        } else if (latest.targetType === 'OVERSEAS') {
          delete nextStore.overseasPatches[latest.targetId];
        } else if (latest.targetType === 'FINANCES') {
          const tid = latest.targetId as TeamId;
          delete nextStore.clubCashOverrides[tid];
          delete nextStore.clubBudgetCapOverrides[tid];
          delete nextStore.clubFacilityOverrides[tid];
        }
        const rebuilt = createNewCareer({
          teamId: 'LG',
          seed: 2027,
          skipPreGameEditor: false,
          preGameEditorStoreOverride: nextStore,
        });
        rebuilt.editorHistory = [...nextStore.history];
        persistPreGameUpdate(rebuilt, nextStore);
        notify(`직전 프리게임 변경 취소 완료: ${latest.summary}`, 'info');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '변경 취소 오류', 'error');
    }
  };

  // Restore single player to original DB
  const handleRestoreSinglePlayer = () => {
    if (!selectedPlayerId) return;
    try {
      if (mode === 'INGAME') {
        const nextCareer = restoreSinglePlayerOriginalInCareer(activeCareer, selectedPlayerId);
        onUpdateCareer?.(nextCareer, activeCareer);
        notify('선택한 선수를 에디터 수정 전 원본 상태로 복구했습니다.', 'success');
      } else {
        const nextStore: PreGameEditorStore = {
          ...preGameStore,
          updatedAt: new Date().toISOString(),
          playerPatches: { ...preGameStore.playerPatches },
          createdPlayers: preGameStore.createdPlayers.filter((p) => p.id !== selectedPlayerId),
          history: preGameStore.history.filter((h) => h.targetId !== selectedPlayerId),
        };
        delete nextStore.playerPatches[selectedPlayerId];
        const rebuilt = createNewCareer({
          teamId: 'LG',
          seed: 2027,
          skipPreGameEditor: false,
          preGameEditorStoreOverride: nextStore,
        });
        rebuilt.editorHistory = [...nextStore.history];
        persistPreGameUpdate(rebuilt, nextStore);
        notify('선택한 선수를 원본 DB 상태로 복구했습니다.', 'success');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '원본 복구 오류', 'error');
    }
  };

  // Restore ALL edits to original
  const handleRestoreAllOriginals = () => {
    setPendingConfirm({
      title: mode === 'PREGAME' ? '프리게임 에디터 전체 원본 복구' : '인게임 에디터 전체 원본 복구',
      subtitle:
        mode === 'PREGAME'
          ? '프리게임 에디터에 저장된 모든 선수·신규 생성·해외파·구단 재정 수정 사항을 초기화합니다.'
          : '현재 세이브에서 인게임 에디터로 수정한 모든 선수·해외파·구단 재정을 최초 수정 전 원본으로 되돌립니다.',
      diffs: [
        {
          field: 'resetAll',
          label: '복구 대상',
          before: `수정 내역 ${historyList.length}건 적용 중`,
          after: '원본 DB / 수정 전 상태 복구',
        },
      ],
      onConfirm: () => {
        try {
          if (mode === 'INGAME') {
            const restored = restoreAllEditorOriginalsInCareer(activeCareer);
            onUpdateCareer?.(restored, activeCareer);
          } else {
            const empty = resetPreGameEditorStore();
            const rebuilt = createNewCareer({ teamId: 'LG', seed: 2027, skipPreGameEditor: true });
            persistPreGameUpdate(rebuilt, empty);
          }
          setPendingConfirm(null);
          notify('모든 에디터 수정 사항이 원본으로 복구되었습니다.', 'success');
        } catch (err) {
          setPendingConfirm(null);
          notify(err instanceof Error ? err.message : '전체 복구 오류', 'error');
        }
      },
    });
  };

  const historyList = mode === 'INGAME' ? activeCareer.editorHistory ?? [] : preGameStore.history;
  const totalChangesCount =
    mode === 'PREGAME'
      ? countPreGameEditorChanges(preGameStore)
      : Object.keys(activeCareer.editorOriginals?.players ?? {}).length +
        Object.keys(activeCareer.editorOriginals?.overseas ?? {}).length +
        (activeCareer.editorOriginals?.finances ? 1 : 0);

  const isPlayerEdited = (pid: string) =>
    mode === 'PREGAME'
      ? Boolean(preGameStore.playerPatches[pid] || preGameStore.createdPlayers.some((c) => c.id === pid))
      : Boolean(activeCareer.editorOriginals?.players && pid in activeCareer.editorOriginals.players);

  const currentPlayerValidation = useMemo(() => {
    if (!playerDraft) return null;
    const orig = activeCareer.players[playerDraft.id];
    if (!orig) return null;
    return validatePlayerEditorDraft(activeCareer, orig, playerDraft);
  }, [activeCareer, playerDraft]);

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="gm-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl team-accent-soft border flex items-center justify-center shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black tracking-tight">
                {mode === 'PREGAME'
                  ? 'KBO GM 2027 프리게임 에디터'
                  : 'KBO GM 2027 인게임 에디터'}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  mode === 'PREGAME'
                    ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {mode === 'PREGAME' ? '새 게임 초기 데이터 전용' : '현재 세이브 전용 · 즉시 연동'}
              </span>
              {totalChangesCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-300 font-mono-stats text-[10px] font-bold">
                  수정 {totalChangesCount}건 적용 중
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {mode === 'PREGAME'
                ? '10개 구단·1/2군·상무·FA·해외파·신규 선수·구단 초기 재정을 수정하며, 기존 세이브는 건드리지 않고 새 게임에만 적용됩니다.'
                : '현재 세이브의 선수 능력치·포지션·보직·병역·계약·재정을 실시간 수정하고 경기·로스터·FA 보상 시스템에 즉시 반영합니다.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={historyList.length === 0}
            onClick={handleUndoLast}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>직전 취소</span>
          </button>
          <button
            type="button"
            disabled={totalChangesCount === 0 && historyList.length === 0}
            onClick={handleRestoreAllOriginals}
            className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>전체 원본 복구</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>닫기</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab Bar */}
      <div className="gm-subtab-bar p-1.5 flex flex-wrap items-center gap-1 text-xs">
        {[
          { id: 'players' as const, label: '선수 검색 · 수정', icon: Users },
          { id: 'create' as const, label: '신규 선수 생성', icon: UserPlus },
          { id: 'finances' as const, label: '구단 재정 · 예산', icon: Coins },
          { id: 'history' as const, label: `수정 내역 · 복구 (${historyList.length})`, icon: History },
        ].map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                active
                  ? 'team-accent-bg shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {localNotice && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
            localNotice.type === 'err'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
          }`}
        >
          <span>{localNotice.text}</span>
          <button type="button" onClick={() => setLocalNotice(null)} className="opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================= TAB 1: 선수 검색 · 수정 ================= */}
      {subTab === 'players' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Panel: Search & Compact Player List */}
          <div className="lg:col-span-4 gm-card p-3.5 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="선수명 · 구단 · 포지션 · 등번호 검색"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            {/* Scope Filter Pills */}
            <div className="flex flex-wrap gap-1 text-[11px]">
              {(['ALL', '1군', '2군', '육성', '상무', 'FA', '해외'] as ScopeFilter[]).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setScopeFilter(sc)}
                  className={`px-2 py-1 rounded-md font-bold transition-colors ${
                    scopeFilter === sc
                      ? 'team-accent-bg'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {sc === 'ALL' ? '전체' : sc}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value as TeamId | 'ALL')}
                className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-semibold"
              >
                <option value="ALL">전체 10개 구단</option>
                {TEAM_IDS.map((tid) => (
                  <option key={tid} value={tid}>
                    {KBO_TEAMS[tid].name}
                  </option>
                ))}
              </select>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'ALL' | '타자' | '투수')}
                className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-semibold"
              >
                <option value="ALL">투수 · 타자 전체</option>
                <option value="타자">타자</option>
                <option value="투수">투수</option>
              </select>
            </div>

            <div className="text-[11px] font-mono-stats text-slate-500 flex items-center justify-between pt-0.5">
              <span>
                KBO {filteredKboPlayers.length}명
                {filteredOverseasPlayers.length > 0 ? ` · 해외 ${filteredOverseasPlayers.length}명` : ''}
              </span>
              <span>클릭해 편집</span>
            </div>

            <div className="max-h-[540px] overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200/80 dark:border-slate-800 rounded-lg">
              {filteredKboPlayers.slice(0, 120).map((p) => {
                const active = selectedPlayerId === p.id;
                const edited = isPlayerEdited(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectKboPlayer(p)}
                    className={`w-full px-2.5 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                      active
                        ? 'team-accent-soft font-bold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamLogo teamId={p.teamId} size="xs" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold truncate">{p.name}</span>
                          {p.uniformNumber !== undefined && (
                            <span className="text-[10px] font-mono-stats text-slate-400">#{p.uniformNumber}</span>
                          )}
                          {edited && (
                            <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-extrabold">
                              수정됨
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {KBO_TEAMS[p.teamId].shortName} · {formatCompactPlayerPosition(p, 1)}
                          {p.role === '투수' && p.pitchRole ? `(${p.pitchRole})` : ''} ·{' '}
                          {isMilitaryServing(p.militaryStatus) ? '상무복무' : p.rosterTier} · {p.age}세
                        </div>
                      </div>
                    </div>
                    <span className="font-mono-stats text-[11px] font-bold shrink-0">
                      {p.ability}
                      <span className="text-slate-400 font-normal">/{p.potential}</span>
                    </span>
                  </button>
                );
              })}

              {filteredOverseasPlayers.map((ov) => {
                const active = selectedOverseasId === ov.permanentId;
                return (
                  <button
                    key={ov.permanentId}
                    type="button"
                    onClick={() => handleSelectOverseasPlayer(ov)}
                    className={`w-full px-2.5 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                      active
                        ? 'team-accent-soft font-bold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe2 className="w-4 h-4 text-sky-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold truncate">{ov.name}</span>
                          <span className="px-1 py-0.2 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[9px] font-bold">
                            {ov.league}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {ov.clubName} · {ov.position} · {ov.age}세
                        </div>
                      </div>
                    </div>
                    <span className="font-mono-stats text-[11px] font-bold shrink-0">
                      {ov.ability}/{ov.potential}
                    </span>
                  </button>
                );
              })}

              {filteredKboPlayers.length === 0 && filteredOverseasPlayers.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  검색 조건에 맞는 선수가 없습니다.
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Selected Player / Overseas Editor */}
          <div className="lg:col-span-8 gm-card p-4 space-y-4">
            {playerDraft ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <TeamLogo teamId={playerDraft.teamId} size="md" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black">{playerDraft.name || '(이름 미입력)'}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono-stats text-xs font-bold">
                          {playerDraft.position}
                        </span>
                        <span className="font-mono-stats text-xs font-bold team-accent-text">
                          OVR {playerDraft.ability} / POT {playerDraft.potential}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-stats">
                        ID: {playerDraft.id} · {KBO_TEAMS[playerDraft.teamId].name} · {playerDraft.rosterTier}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isPlayerEdited(playerDraft.id) && (
                      <button
                        type="button"
                        onClick={handleRestoreSinglePlayer}
                        className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>이 선수 원본 복구</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleReviewPlayerSave}
                      className="px-3.5 py-1.5 rounded-lg team-accent-btn text-xs font-black inline-flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        변경 전후 비교 · 저장
                        {currentPlayerValidation && currentPlayerValidation.diffs.length > 0
                          ? ` (${currentPlayerValidation.diffs.length})`
                          : ''}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Inner 4 Edit Section Tabs */}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {[
                    { id: 'bio' as const, label: '프로필 · 신체 · 등번호' },
                    { id: 'ratings' as const, label: '오버롤 · 포텐셜 · 세부 능력치' },
                    { id: 'position' as const, label: playerDraft.role === '타자' ? '포지션 · 숙련도 (0~100)' : '투수 보직 · 포지션' },
                    { id: 'contract' as const, label: '소속 · 병역 · 계약 · 부상 · 특성' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setPlayerEditSection(s.id)}
                      className={`px-3 py-1.5 rounded-lg border font-bold transition-colors ${
                        playerEditSection === s.id
                          ? 'team-accent-soft team-accent-border'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Section 1: Bio & Physical */}
                {playerEditSection === 'bio' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <label className="space-y-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300">선수 이름</span>
                      <input
                        type="text"
                        value={playerDraft.name}
                        onChange={(e) => setPlayerDraft({ ...playerDraft, name: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300">생년월일 (YYYY-MM-DD)</span>
                      <input
                        type="text"
                        value={playerDraft.birthDate}
                        onChange={(e) => setPlayerDraft({ ...playerDraft, birthDate: e.target.value })}
                        placeholder="예: 2000-11-25"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300">등번호</span>
                      <input
                        type="number"
                        min={0}
                        max={199}
                        value={playerDraft.uniformNumber}
                        onChange={(e) =>
                          setPlayerDraft({
                            ...playerDraft,
                            uniformNumber: e.target.value === '' ? '' : Number(e.target.value),
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300">국적</span>
                      <input
                        type="text"
                        value={playerDraft.nationality}
                        onChange={(e) => setPlayerDraft({ ...playerDraft, nationality: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300">신분 구분</span>
                      <select
                        value={playerDraft.category}
                        onChange={(e) =>
                          setPlayerDraft({
                            ...playerDraft,
                            category: e.target.value as Player['category'],
                            militaryStatus:
                              e.target.value !== '국내' ? '해당 없음' : playerDraft.militaryStatus,
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="국내">국내</option>
                        <option value="외국인">외국인</option>
                        <option value="아시아쿼터">아시아쿼터</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300">신장 (cm)</span>
                      <input
                        type="number"
                        min={150}
                        max={220}
                        value={playerDraft.heightCm}
                        onChange={(e) =>
                          setPlayerDraft({
                            ...playerDraft,
                            heightCm: e.target.value === '' ? '' : Number(e.target.value),
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300">체중 (kg)</span>
                      <input
                        type="number"
                        min={50}
                        max={155}
                        value={playerDraft.weightKg}
                        onChange={(e) =>
                          setPlayerDraft({
                            ...playerDraft,
                            weightKg: e.target.value === '' ? '' : Number(e.target.value),
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300">투구손</span>
                      <select
                        value={playerDraft.throws}
                        onChange={(e) => setPlayerDraft({ ...playerDraft, throws: e.target.value as 'L' | 'R' | '' })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="">미확인</option>
                        <option value="R">우투 (R)</option>
                        <option value="L">좌투 (L)</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="font-bold text-slate-600 dark:text-slate-300">타격손</span>
                      <select
                        value={playerDraft.bats}
                        onChange={(e) => setPlayerDraft({ ...playerDraft, bats: e.target.value as 'L' | 'R' | 'S' | '' })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="">미확인</option>
                        <option value="R">우타 (R)</option>
                        <option value="L">좌타 (L)</option>
                        <option value="S">양타 (S)</option>
                      </select>
                    </label>
                  </div>
                )}

                {/* Section 2: OVR / POT / OOTP Detailed Sub-Ratings */}
                {playerEditSection === 'ratings' && (() => {
                  const ootp = playerDraft.ootpRatings;
                  const updateOotp = (updater: (prev: typeof ootp) => typeof ootp) => {
                    setPlayerDraft({ ...playerDraft, ootpRatings: updater(ootp) });
                  };
                  const handleRecalcOvrPot = () => {
                    if (playerDraft.role === '타자' && ootp.batting) {
                      const nextOvr = computeOotpBatterOverall(
                        ootp.batting,
                        ootp.defense,
                        ootp.baserunning,
                        playerDraft.position,
                        'cur',
                        playerDraft.positionProficiency[playerDraft.position] ?? 85
                      );
                      const nextPot = Math.max(
                        nextOvr,
                        computeOotpBatterOverall(
                          ootp.batting,
                          ootp.defense,
                          ootp.baserunning,
                          playerDraft.position,
                          'pot'
                        )
                      );
                      setPlayerDraft({ ...playerDraft, ability: nextOvr, potential: nextPot });
                    } else if (playerDraft.role === '투수' && ootp.pitching) {
                      const isSp = playerDraft.position === 'SP' || playerDraft.pitchRole === '선발';
                      const nextOvr = computeOotpPitcherOverall(ootp.pitching, isSp, 'cur');
                      const nextPot = Math.max(nextOvr, computeOotpPitcherOverall(ootp.pitching, isSp, 'pot'));
                      setPlayerDraft({ ...playerDraft, ability: nextOvr, potential: nextPot });
                    }
                  };
                  return (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                      <label className="space-y-1">
                        <div className="flex justify-between font-bold">
                          <span>오버롤 (OVR)</span>
                          <span className="font-mono-stats team-accent-text">{playerDraft.ability}</span>
                        </div>
                        <input
                          type="range"
                          min={25}
                          max={99}
                          value={playerDraft.ability}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setPlayerDraft({
                              ...playerDraft,
                              ability: v,
                              potential: Math.max(v, playerDraft.potential),
                            });
                          }}
                          className="w-full accent-orange-600"
                        />
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={playerDraft.ability}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setPlayerDraft({
                              ...playerDraft,
                              ability: v,
                              potential: Math.max(v, playerDraft.potential),
                            });
                          }}
                          className="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-stats"
                        />
                      </label>
                      <label className="space-y-1">
                        <div className="flex justify-between font-bold">
                          <span>포텐셜 (POT)</span>
                          <span className="font-mono-stats text-emerald-600 dark:text-emerald-400">{playerDraft.potential}</span>
                        </div>
                        <input
                          type="range"
                          min={playerDraft.ability}
                          max={99}
                          value={playerDraft.potential}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, potential: Number(e.target.value) })}
                          className="w-full accent-emerald-600"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={playerDraft.potential}
                            onChange={(e) => setPlayerDraft({ ...playerDraft, potential: Number(e.target.value) })}
                            className="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-stats"
                          />
                          <button
                            type="button"
                            onClick={handleRecalcOvrPot}
                            className="px-2.5 py-1 rounded border border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] hover:bg-indigo-500/20"
                          >
                            세부 기준 OVR/POT 재계산
                          </button>
                        </div>
                      </label>
                    </div>

                    {/* OOTP 세부 편집 서브 탭 */}
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'batting', label: '타격 (현재/잠재)' },
                          { id: 'pitching', label: '투구 · 구종 · 구속' },
                          { id: 'defense', label: '수비 (내야·외야·포수)' },
                          { id: 'baserunning', label: '주루 (4항목)' },
                          { id: 'personality', label: '성향 (7항목)' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setOotpEditTab(t.id)}
                          className={`px-2.5 py-1 rounded border font-bold text-[11px] ${
                            ootpEditTab === t.id
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* OOTP 타격 세부 편집 */}
                    {ootpEditTab === 'batting' && (
                      ootp.batting ? (
                        <div className="space-y-3">
                          {(() => {
                            const contactPair = computeDerivedContactPair(ootp.batting!);
                            return (
                              <div className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between text-[11px]">
                                <span className="font-bold text-indigo-700 dark:text-indigo-300">
                                  파생 컨택 (BABIP + 삼진 회피 자동 산출)
                                </span>
                                <span className="font-mono-stats font-extrabold text-indigo-700 dark:text-indigo-300">
                                  현재 {contactPair.cur} / 잠재 {contactPair.pot}
                                </span>
                              </div>
                            );
                          })()}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {(
                              [
                                ['babip', 'BABIP (인플레이 안타)'],
                                ['avoidK', '삼진 회피 (Avoid K)'],
                                ['gapPower', '갭 파워 (2·3루타)'],
                                ['hrPower', '홈런 파워'],
                                ['eye', '선구안 (Eye)'],
                                ['vsLHP', '좌완 상대 (vs LHP)'],
                                ['vsRHP', '우완 상대 (vs RHP)'],
                              ] as const
                            ).map(([key, label]) => {
                              const pair = ootp.batting![key];
                              return (
                                <div key={key} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
                                  <div className="flex justify-between font-bold text-[11px]">
                                    <span>{label}</span>
                                    <span className="font-mono-stats">
                                      <span className="text-orange-600 dark:text-orange-400">{pair.cur}</span> /{' '}
                                      <span className="text-indigo-600 dark:text-indigo-400">{pair.pot}</span>
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-1 text-[10px]">
                                      <span className="text-slate-500 w-7">현재</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={pair.cur}
                                        onChange={(e) => {
                                          const v = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                                          updateOotp((prev) => ({
                                            ...prev,
                                            batting: prev.batting
                                              ? {
                                                  ...prev.batting,
                                                  [key]: { cur: v, pot: Math.max(v, prev.batting[key].pot) },
                                                }
                                              : null,
                                          }));
                                        }}
                                        className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                                      />
                                    </label>
                                    <label className="flex items-center gap-1 text-[10px]">
                                      <span className="text-slate-500 w-7">잠재</span>
                                      <input
                                        type="number"
                                        min={pair.cur}
                                        max={100}
                                        value={pair.pot}
                                        onChange={(e) => {
                                          const v = Math.max(pair.cur, Math.min(100, Number(e.target.value) || pair.cur));
                                          updateOotp((prev) => ({
                                            ...prev,
                                            batting: prev.batting
                                              ? { ...prev.batting, [key]: { ...prev.batting[key], pot: v } }
                                              : null,
                                          }));
                                        }}
                                        className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                                      />
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                            {(
                              [
                                ['sacBunt', '희생번트'],
                                ['buntForHit', '기습번트'],
                              ] as const
                            ).map(([key, label]) => (
                              <label key={key} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                                <div className="flex justify-between font-bold text-[11px]">
                                  <span>{label}</span>
                                  <span className="font-mono-stats">{ootp.batting![key]}</span>
                                </div>
                                <input
                                  type="range"
                                  min={1}
                                  max={100}
                                  value={ootp.batting![key]}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    updateOotp((prev) => ({
                                      ...prev,
                                      batting: prev.batting ? { ...prev.batting, [key]: v } : null,
                                    }));
                                  }}
                                  className="w-full accent-indigo-600"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 text-center text-slate-500 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                          투수 선수입니다. [투구 · 구종 · 구속] 탭에서 투구 세부 능력치를 수정하세요.
                        </div>
                      )
                    )}

                    {/* OOTP 투구·구종·구속 세부 편집 */}
                    {ootpEditTab === 'pitching' && (
                      ootp.pitching ? (
                        <div className="space-y-3">
                          {(() => {
                            const fit = evaluatePitcherRoleFit(ootp.pitching!);
                            return (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px]">
                                <label className="space-y-0.5">
                                  <span className="text-slate-500 font-semibold">평균 구속 (km/h)</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min={120}
                                    max={165}
                                    value={ootp.pitching!.avgVelocityKmh}
                                    onChange={(e) => {
                                      const v = Number(e.target.value) || 140;
                                      updateOotp((prev) => ({
                                        ...prev,
                                        pitching: prev.pitching
                                          ? { ...prev.pitching, avgVelocityKmh: v, maxVelocityKmh: Math.max(v + 2, prev.pitching.maxVelocityKmh) }
                                          : null,
                                      }));
                                    }}
                                    className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-stats"
                                  />
                                </label>
                                <label className="space-y-0.5">
                                  <span className="text-slate-500 font-semibold">최고 구속 (km/h)</span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min={125}
                                    max={170}
                                    value={ootp.pitching!.maxVelocityKmh}
                                    onChange={(e) => {
                                      const v = Number(e.target.value) || 145;
                                      updateOotp((prev) => ({
                                        ...prev,
                                        pitching: prev.pitching ? { ...prev.pitching, maxVelocityKmh: v } : null,
                                      }));
                                    }}
                                    className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-stats"
                                  />
                                </label>
                                <label className="space-y-0.5">
                                  <span className="text-slate-500 font-semibold">땅볼 유도율 (%)</span>
                                  <input
                                    type="number"
                                    min={20}
                                    max={80}
                                    value={ootp.pitching!.groundballRate}
                                    onChange={(e) => {
                                      const v = Number(e.target.value) || 48;
                                      updateOotp((prev) => ({
                                        ...prev,
                                        pitching: prev.pitching ? { ...prev.pitching, groundballRate: v } : null,
                                      }));
                                    }}
                                    className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-stats"
                                  />
                                </label>
                                <div className="space-y-0.5 font-mono-stats">
                                  <span className="text-slate-500 font-sans font-semibold">선발 / 불펜 적합도</span>
                                  <div className="py-1 font-extrabold text-indigo-600 dark:text-indigo-400">
                                    선발 {fit.starterFit} · 불펜 {fit.relieverFit}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {(
                              [
                                ['stuff', '구위 (Stuff)'],
                                ['movement', '무브먼트 (Movement)'],
                                ['control', '제구력 (Control)'],
                                ['hrPrevent', '피홈런 억제'],
                                ['hitPrevent', '피안타 억제'],
                                ['vsLHB', '좌타자 상대 (vs LHB)'],
                                ['vsRHB', '우타자 상대 (vs RHB)'],
                              ] as const
                            ).map(([key, label]) => {
                              const pair = ootp.pitching![key];
                              return (
                                <div key={key} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
                                  <div className="flex justify-between font-bold text-[11px]">
                                    <span>{label}</span>
                                    <span className="font-mono-stats">
                                      <span className="text-orange-600 dark:text-orange-400">{pair.cur}</span> /{' '}
                                      <span className="text-indigo-600 dark:text-indigo-400">{pair.pot}</span>
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-1 text-[10px]">
                                      <span className="text-slate-500 w-7">현재</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={pair.cur}
                                        onChange={(e) => {
                                          const v = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                                          updateOotp((prev) => ({
                                            ...prev,
                                            pitching: prev.pitching
                                              ? {
                                                  ...prev.pitching,
                                                  [key]: { cur: v, pot: Math.max(v, prev.pitching[key].pot) },
                                                }
                                              : null,
                                          }));
                                        }}
                                        className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                                      />
                                    </label>
                                    <label className="flex items-center gap-1 text-[10px]">
                                      <span className="text-slate-500 w-7">잠재</span>
                                      <input
                                        type="number"
                                        min={pair.cur}
                                        max={100}
                                        value={pair.pot}
                                        onChange={(e) => {
                                          const v = Math.max(pair.cur, Math.min(100, Number(e.target.value) || pair.cur));
                                          updateOotp((prev) => ({
                                            ...prev,
                                            pitching: prev.pitching
                                              ? { ...prev.pitching, [key]: { ...prev.pitching[key], pot: v } }
                                              : null,
                                          }));
                                        }}
                                        className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                                      />
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                            {(
                              [
                                ['stamina', '체력 (Stamina)'],
                                ['holdRunner', '주자 견제 (Hold)'],
                              ] as const
                            ).map(([key, label]) => (
                              <label key={key} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                                <div className="flex justify-between font-bold text-[11px]">
                                  <span>{label}</span>
                                  <span className="font-mono-stats">{ootp.pitching![key]}</span>
                                </div>
                                <input
                                  type="range"
                                  min={1}
                                  max={100}
                                  value={ootp.pitching![key]}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    updateOotp((prev) => ({
                                      ...prev,
                                      pitching: prev.pitching ? { ...prev.pitching, [key]: v } : null,
                                    }));
                                  }}
                                  className="w-full accent-indigo-600"
                                />
                              </label>
                            ))}
                          </div>

                          {/* 구종별 현재/잠재/구사율 편집 */}
                          <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="font-bold text-[11px]">구사 구종별 능력치 (현재 / 잠재 / 구사율%)</div>
                            <div className="space-y-1.5">
                              {ootp.pitching!.pitches.map((pt, idx) => (
                                <div key={`${pt.name}-${idx}`} className="grid grid-cols-12 gap-1.5 items-center text-[11px]">
                                  <span className="col-span-3 font-bold truncate">{pt.name}</span>
                                  <label className="col-span-3 flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400">현</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={100}
                                      value={pt.cur}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                                        updateOotp((prev) => {
                                          if (!prev.pitching) return prev;
                                          const nextPitches = prev.pitching.pitches.map((item, i) =>
                                            i === idx ? { ...item, cur: v, pot: Math.max(v, item.pot) } : item
                                          );
                                          return { ...prev, pitching: { ...prev.pitching, pitches: nextPitches } };
                                        });
                                      }}
                                      className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                                    />
                                  </label>
                                  <label className="col-span-3 flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400">잠</span>
                                    <input
                                      type="number"
                                      min={pt.cur}
                                      max={100}
                                      value={pt.pot}
                                      onChange={(e) => {
                                        const v = Math.max(pt.cur, Math.min(100, Number(e.target.value) || pt.cur));
                                        updateOotp((prev) => {
                                          if (!prev.pitching) return prev;
                                          const nextPitches = prev.pitching.pitches.map((item, i) =>
                                            i === idx ? { ...item, pot: v } : item
                                          );
                                          return { ...prev, pitching: { ...prev.pitching, pitches: nextPitches } };
                                        });
                                      }}
                                      className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                                    />
                                  </label>
                                  <label className="col-span-3 flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400">%</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={100}
                                      value={pt.usagePct}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.min(100, Number(e.target.value) || 5));
                                        updateOotp((prev) => {
                                          if (!prev.pitching) return prev;
                                          const nextPitches = prev.pitching.pitches.map((item, i) =>
                                            i === idx ? { ...item, usagePct: v } : item
                                          );
                                          return { ...prev, pitching: { ...prev.pitching, pitches: nextPitches } };
                                        });
                                      }}
                                      className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 text-center text-slate-500 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                          야수 선수입니다. [타격 (현재/잠재)] 탭에서 타격 세부 능력치를 수정하세요.
                        </div>
                      )
                    )}

                    {/* OOTP 수비 세부 편집 */}
                    {ootpEditTab === 'defense' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {(
                          [
                            ['infieldRange', '내야 범위'],
                            ['infieldError', '내야 실책방지'],
                            ['infieldArm', '내야 송구'],
                            ['turnDP', '병살 처리'],
                            ['outfieldRange', '외야 범위'],
                            ['outfieldError', '외야 실책방지'],
                            ['outfieldArm', '외야 송구'],
                            ['catcherBlocking', '포수 블로킹'],
                            ['catcherFraming', '포수 프레이밍'],
                            ['catcherArm', '포수 송구'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                            <div className="flex justify-between font-bold text-[11px]">
                              <span>{label}</span>
                              <span className="font-mono-stats">{ootp.defense[key]}</span>
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={100}
                              value={ootp.defense[key]}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                updateOotp((prev) => ({
                                  ...prev,
                                  defense: { ...prev.defense, [key]: v },
                                }));
                              }}
                              className="w-full accent-emerald-600"
                            />
                          </label>
                        ))}
                      </div>
                    )}

                    {/* OOTP 주루 세부 편집 */}
                    {ootpEditTab === 'baserunning' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {(
                          [
                            ['speed', '주력 (Speed)'],
                            ['stealTendency', '도루 시도 성향'],
                            ['stealAbility', '도루 능력 (성공률)'],
                            ['baserunning', '주루 판단력'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                            <div className="flex justify-between font-bold text-[11px]">
                              <span>{label}</span>
                              <span className="font-mono-stats">{ootp.baserunning[key]}</span>
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={100}
                              value={ootp.baserunning[key]}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                updateOotp((prev) => ({
                                  ...prev,
                                  baserunning: { ...prev.baserunning, [key]: v },
                                }));
                              }}
                              className="w-full accent-sky-600"
                            />
                          </label>
                        ))}
                      </div>
                    )}

                    {/* OOTP 성향 세부 편집 */}
                    {ootpEditTab === 'personality' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {(
                          [
                            ['professionalism', '프로의식'],
                            ['workEthic', '훈련 태도'],
                            ['loyalty', '충성심'],
                            ['greed', '금전 선호도'],
                            ['leadership', '리더십'],
                            ['adaptability', '적응력'],
                            ['durability', '내구성'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                            <div className="flex justify-between font-bold text-[11px]">
                              <span>{label}</span>
                              <span className="font-mono-stats">{ootp.personality[key]}</span>
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={100}
                              value={ootp.personality[key]}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                updateOotp((prev) => ({
                                  ...prev,
                                  personality: { ...prev.personality, [key]: v },
                                }));
                              }}
                              className="w-full accent-amber-600"
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })()}

                {/* Section 3: Positions, Proficiencies & Pitcher Role */}
                {playerEditSection === 'position' && (
                  <div className="space-y-4 text-xs">
                    {playerDraft.role === '투수' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="space-y-1">
                          <span className="font-bold">투수 주 포지션</span>
                          <select
                            value={playerDraft.position}
                            onChange={(e) => {
                              const pos = e.target.value as Position;
                              setPlayerDraft({
                                ...playerDraft,
                                position: pos,
                                pitchRole: pos === 'SP' ? '선발' : pos === 'CL' ? '마무리' : playerDraft.pitchRole === '선발' ? '필승조' : playerDraft.pitchRole,
                              });
                            }}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
                          >
                            {PITCHER_POSITIONS.map((pos) => (
                              <option key={pos} value={pos}>
                                {pos === 'SP' ? 'SP (선발투수)' : pos === 'CL' ? 'CL (마무리투수)' : 'RP (불펜투수)'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="font-bold">투수 세부 보직</span>
                          <select
                            value={playerDraft.pitchRole}
                            onChange={(e) => {
                              const pr = e.target.value as NonNullable<Player['pitchRole']>;
                              setPlayerDraft({
                                ...playerDraft,
                                pitchRole: pr,
                                position: pr === '선발' ? 'SP' : pr === '마무리' ? 'CL' : 'RP',
                              });
                            }}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
                          >
                            {ALL_PITCH_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="space-y-1">
                            <span className="font-bold">주 포지션</span>
                            <select
                              value={playerDraft.position}
                              onChange={(e) => {
                                const nextPos = e.target.value as Position;
                                setPlayerDraft({
                                  ...playerDraft,
                                  position: nextPos,
                                  secondaryPositions: playerDraft.secondaryPositions.filter((s) => s !== nextPos),
                                  positionProficiency: {
                                    ...playerDraft.positionProficiency,
                                    [nextPos]: Math.max(85, playerDraft.positionProficiency[nextPos] ?? 90),
                                  },
                                });
                              }}
                              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
                            >
                              {ALL_FIELD_POSITIONS.map((pos) => (
                                <option key={pos} value={pos}>
                                  {pos}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="space-y-1">
                            <span className="font-bold">보조 포지션 (복수 선택 가능)</span>
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {ALL_FIELD_POSITIONS.filter((p) => p !== playerDraft.position).map((pos) => {
                                const active = playerDraft.secondaryPositions.includes(pos);
                                return (
                                  <button
                                    key={pos}
                                    type="button"
                                    onClick={() => {
                                      const nextSec = active
                                        ? playerDraft.secondaryPositions.filter((s) => s !== pos)
                                        : [...playerDraft.secondaryPositions, pos];
                                      const nextProf = { ...playerDraft.positionProficiency };
                                      if (!active && (nextProf[pos] ?? 0) < 68) {
                                        nextProf[pos] = 72;
                                      }
                                      setPlayerDraft({
                                        ...playerDraft,
                                        secondaryPositions: nextSec,
                                        positionProficiency: nextProf,
                                      });
                                    }}
                                    className={`px-2.5 py-1 rounded-md border font-mono-stats font-bold ${
                                      active
                                        ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                                    }`}
                                  >
                                    {pos}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="font-bold text-slate-700 dark:text-slate-200">
                            포지션별 수비 숙련도 (0 ~ 100)
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                            {ALL_FIELD_POSITIONS.map((pos) => {
                              const val = Math.round(playerDraft.positionProficiency[pos] ?? (pos === playerDraft.position ? 90 : 35));
                              return (
                                <label
                                  key={pos}
                                  className={`p-2 rounded-lg border space-y-1 ${
                                    pos === playerDraft.position
                                      ? 'team-accent-border team-accent-soft'
                                      : 'border-slate-200 dark:border-slate-800'
                                  }`}
                                >
                                  <div className="flex justify-between font-mono-stats font-bold">
                                    <span>{pos}</span>
                                    <span>{val}</span>
                                  </div>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={val}
                                    onChange={(e) =>
                                      setPlayerDraft({
                                        ...playerDraft,
                                        positionProficiency: {
                                          ...playerDraft.positionProficiency,
                                          [pos]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                                        },
                                      })
                                    }
                                    className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Section 4: Team, Military, Contract, FA, Injury, Morale, Trait */}
                {playerEditSection === 'contract' && (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <label className="space-y-1">
                        <span className="font-bold">소속 구단</span>
                        <select
                          value={playerDraft.teamId}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, teamId: e.target.value as TeamId })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
                        >
                          {TEAM_IDS.map((tid) => (
                            <option key={tid} value={tid}>
                              {KBO_TEAMS[tid].name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="font-bold">로스터 등급</span>
                        <select
                          value={playerDraft.rosterTier}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, rosterTier: e.target.value as RosterTier })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
                        >
                          {ALL_ROSTER_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {tier}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="font-bold">병역 상태 (FA 보상 자동연동)</span>
                        <select
                          value={playerDraft.militaryStatus}
                          disabled={playerDraft.category !== '국내'}
                          onChange={(e) => {
                            const ms = e.target.value as MilitaryStatus;
                            setPlayerDraft({
                              ...playerDraft,
                              militaryStatus: ms,
                              rosterTier: isMilitaryServing(ms) ? '대기' : playerDraft.rosterTier === '대기' ? '2군' : playerDraft.rosterTier,
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold disabled:opacity-50"
                        >
                          {ALL_MILITARY_STATUSES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>

                      {isMilitaryServing(playerDraft.militaryStatus) && (
                        <label className="space-y-1">
                          <span className="font-bold">전역 예정일 (YYYY-MM-DD)</span>
                          <input
                            type="text"
                            value={playerDraft.militaryDischargeDate}
                            onChange={(e) =>
                              setPlayerDraft({ ...playerDraft, militaryDischargeDate: e.target.value })
                            }
                            placeholder="예: 2027-10-26"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                          />
                        </label>
                      )}

                      <label className="space-y-1">
                        <span className="font-bold">연봉 (억 원)</span>
                        <input
                          type="number"
                          step="0.05"
                          min={0}
                          max={100}
                          value={playerDraft.annualSalary}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, annualSalary: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="font-bold">계약금 (억 원)</span>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={150}
                          value={playerDraft.signingBonus}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, signingBonus: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="font-bold">계약 기간 / 잔여 기간 (년)</span>
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={15}
                            value={playerDraft.years}
                            onChange={(e) => {
                              const yrs = Number(e.target.value);
                              setPlayerDraft({
                                ...playerDraft,
                                years: yrs,
                                yearsRemaining: Math.min(yrs, playerDraft.yearsRemaining),
                              });
                            }}
                            className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                            title="총 계약 연수"
                          />
                          <input
                            type="number"
                            min={0}
                            max={playerDraft.years}
                            value={playerDraft.yearsRemaining}
                            onChange={(e) =>
                              setPlayerDraft({ ...playerDraft, yearsRemaining: Number(e.target.value) })
                            }
                            className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                            title="잔여 연수"
                          />
                        </div>
                      </label>

                      <label className="space-y-1">
                        <span className="font-bold">FA 자격 & 등급</span>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={playerDraft.isFAEligible}
                              onChange={(e) =>
                                setPlayerDraft({ ...playerDraft, isFAEligible: e.target.checked })
                              }
                              className="accent-orange-600"
                            />
                            <span>FA 자격</span>
                          </label>
                          <select
                            value={playerDraft.faGrade}
                            onChange={(e) =>
                              setPlayerDraft({
                                ...playerDraft,
                                faGrade: e.target.value as 'A' | 'B' | 'C' | '',
                              })
                            }
                            className="flex-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="">등급 자동</option>
                            <option value="A">A등급</option>
                            <option value="B">B등급</option>
                            <option value="C">C등급</option>
                          </select>
                        </div>
                      </label>

                      <label className="space-y-1">
                        <span className="font-bold">선수 특성</span>
                        <select
                          value={playerDraft.hiddenTrait}
                          onChange={(e) =>
                            setPlayerDraft({
                              ...playerDraft,
                              hiddenTrait: e.target.value as PlayerEditorDraft['hiddenTrait'],
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="">특성 없음</option>
                          {ALL_HIDDEN_TRAITS.map((tr) => (
                            <option key={tr} value={tr}>
                              {tr}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Condition / Fatigue / Morale / Dissatisfaction / Injury */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <label className="space-y-1">
                        <span className="font-bold">피로도 (0~100)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={playerDraft.fatigue}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, fatigue: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="font-bold">컨디션 (-5~+5)</span>
                        <input
                          type="number"
                          min={-5}
                          max={5}
                          value={playerDraft.form}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, form: Number(e.target.value) })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="font-bold">사기</span>
                        <select
                          value={playerDraft.morale}
                          onChange={(e) =>
                            setPlayerDraft({ ...playerDraft, morale: e.target.value as Player['morale'] })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          {ALL_MORALE_STATES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="font-bold">불만도 (0~100)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={playerDraft.dissatisfaction}
                          onChange={(e) =>
                            setPlayerDraft({ ...playerDraft, dissatisfaction: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                        />
                      </label>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2.5">
                      <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={playerDraft.hasInjury}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, hasInjury: e.target.checked })}
                          className="accent-rose-600"
                        />
                        <span>부상 상태 적용 (체크 해제 시 즉시 완치)</span>
                      </label>
                      {playerDraft.hasInjury && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={playerDraft.injuryDescription}
                            onChange={(e) =>
                              setPlayerDraft({ ...playerDraft, injuryDescription: e.target.value })
                            }
                            placeholder="부상 부위/명칭"
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <select
                            value={playerDraft.injurySeverity}
                            onChange={(e) =>
                              setPlayerDraft({
                                ...playerDraft,
                                injurySeverity: e.target.value as '경미' | '보통' | '장기',
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="경미">경미</option>
                            <option value="보통">보통</option>
                            <option value="장기">장기</option>
                          </select>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={playerDraft.injuryDaysRemaining}
                            onChange={(e) =>
                              setPlayerDraft({ ...playerDraft, injuryDaysRemaining: Number(e.target.value) })
                            }
                            placeholder="잔여 일수"
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : overseasDraft ? (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <Globe2 className="w-6 h-6 text-sky-500" />
                    <div>
                      <div className="text-base font-black">{overseasDraft.name} (해외 진출 선수)</div>
                      <div className="text-[11px] text-slate-500">
                        {overseasDraft.league} · {overseasDraft.clubName}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleReviewOverseasSave}
                    className="px-3.5 py-1.5 rounded-lg team-accent-btn text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>변경 전후 비교 · 저장</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className="font-bold">이름</span>
                    <input
                      type="text"
                      value={overseasDraft.name}
                      onChange={(e) => setOverseasDraft({ ...overseasDraft, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">해외 리그</span>
                    <select
                      value={overseasDraft.league}
                      onChange={(e) =>
                        setOverseasDraft({ ...overseasDraft, league: e.target.value as OverseasPlayerRecord['league'] })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {ALL_OVERSEAS_LEAGUES.map((lg) => (
                        <option key={lg} value={lg}>
                          {lg}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">해외 소속 구단</span>
                    <input
                      type="text"
                      value={overseasDraft.clubName}
                      onChange={(e) => setOverseasDraft({ ...overseasDraft, clubName: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">오버롤 (OVR)</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={overseasDraft.ability}
                      onChange={(e) =>
                        setOverseasDraft({
                          ...overseasDraft,
                          ability: Number(e.target.value),
                          potential: Math.max(Number(e.target.value), overseasDraft.potential),
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">포텐셜 (POT)</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={overseasDraft.potential}
                      onChange={(e) => setOverseasDraft({ ...overseasDraft, potential: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">KBO 원소속 구단</span>
                    <select
                      value={overseasDraft.originalKboTeamId}
                      onChange={(e) =>
                        setOverseasDraft({
                          ...overseasDraft,
                          originalKboTeamId: e.target.value as TeamId | '',
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="">없음 (아마추어 직행)</option>
                      {TEAM_IDS.map((tid) => (
                        <option key={tid} value={tid}>
                          {KBO_TEAMS[tid].name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold">병역 상태</span>
                    <select
                      value={overseasDraft.militaryStatus}
                      onChange={(e) =>
                        setOverseasDraft({
                          ...overseasDraft,
                          militaryStatus: e.target.value as OverseasEditorDraft['militaryStatus'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {ALL_MILITARY_STATUSES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 pt-5 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overseasDraft.returnRestrictionActive}
                      onChange={(e) =>
                        setOverseasDraft({ ...overseasDraft, returnRestrictionActive: e.target.checked })
                      }
                      className="accent-orange-600"
                    />
                    <span>제107조 2년 유예 제한 적용</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 text-slate-500">
                <Users className="w-8 h-8 mx-auto opacity-40" />
                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  좌측 목록에서 편집할 선수를 선택하세요
                </div>
                <p className="text-xs">
                  KBO 10개 구단, 1·2군, 육성, 상무(군복무), FA, 해외 진출 선수를 모두 검색하고 수정할 수 있습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 2: 신규 선수 생성 ================= */}
      {subTab === 'create' && (
        <div className="gm-card p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-black">누락 선수 직접 생성 (신규 선수 등록)</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                동일 선수 중복 등록과 잘못된 능력치·계약 범위를 자동 검증한 뒤 해당 구단 선수단에 정식 등록합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={handleReviewNewPlayer}
              className="px-4 py-2 rounded-lg team-accent-btn font-black inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>생성 내용 검토 · 등록</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <label className="space-y-1">
              <span className="font-bold">선수 이름 *</span>
              <input
                type="text"
                value={newPlayerForm.name}
                onChange={(e) => setNewPlayerForm({ ...newPlayerForm, name: e.target.value })}
                placeholder="예: 홍길동"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">소속 구단 *</span>
              <select
                value={newPlayerForm.teamId}
                onChange={(e) => setNewPlayerForm({ ...newPlayerForm, teamId: e.target.value as TeamId })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
              >
                {TEAM_IDS.map((tid) => (
                  <option key={tid} value={tid}>
                    {KBO_TEAMS[tid].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">투/타 구분 *</span>
              <select
                value={newPlayerForm.role}
                onChange={(e) => {
                  const role = e.target.value as '타자' | '투수';
                  setNewPlayerForm({
                    ...newPlayerForm,
                    role,
                    position: role === '투수' ? 'RP' : '1B',
                    pitchRole: role === '투수' ? '중간' : '선발',
                    secondaryPositions: [],
                  });
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
              >
                <option value="타자">타자</option>
                <option value="투수">투수</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">주 포지션 *</span>
              <select
                value={newPlayerForm.position}
                onChange={(e) => setNewPlayerForm({ ...newPlayerForm, position: e.target.value as Position })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
              >
                {(newPlayerForm.role === '투수' ? PITCHER_POSITIONS : ALL_FIELD_POSITIONS).map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </label>

            {newPlayerForm.role === '투수' && (
              <label className="space-y-1">
                <span className="font-bold">투수 보직</span>
                <select
                  value={newPlayerForm.pitchRole}
                  onChange={(e) =>
                    setNewPlayerForm({
                      ...newPlayerForm,
                      pitchRole: e.target.value as NonNullable<Player['pitchRole']>,
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {ALL_PITCH_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="space-y-1">
              <span className="font-bold">생년월일 (YYYY-MM-DD)</span>
              <input
                type="text"
                value={newPlayerForm.birthDate}
                onChange={(e) => setNewPlayerForm({ ...newPlayerForm, birthDate: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">오버롤 / 포텐셜</span>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={newPlayerForm.ability}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setNewPlayerForm({
                      ...newPlayerForm,
                      ability: v,
                      potential: Math.max(v, newPlayerForm.potential),
                    });
                  }}
                  className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                />
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={newPlayerForm.potential}
                  onChange={(e) => setNewPlayerForm({ ...newPlayerForm, potential: Number(e.target.value) })}
                  className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                />
              </div>
            </label>
            <label className="space-y-1">
              <span className="font-bold">로스터 등급</span>
              <select
                value={newPlayerForm.rosterTier}
                onChange={(e) => setNewPlayerForm({ ...newPlayerForm, rosterTier: e.target.value as RosterTier })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {ALL_ROSTER_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">병역 상태</span>
              <select
                value={newPlayerForm.militaryStatus}
                onChange={(e) =>
                  setNewPlayerForm({ ...newPlayerForm, militaryStatus: e.target.value as NewPlayerEditorForm['militaryStatus'] })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {ALL_MILITARY_STATUSES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">연봉 (억) / 계약기간 (년)</span>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="0.05"
                  min={0.33}
                  max={50}
                  value={newPlayerForm.annualSalary}
                  onChange={(e) => setNewPlayerForm({ ...newPlayerForm, annualSalary: Number(e.target.value) })}
                  className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                />
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={newPlayerForm.years}
                  onChange={(e) => setNewPlayerForm({ ...newPlayerForm, years: Number(e.target.value) })}
                  className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
                />
              </div>
            </label>
            <label className="space-y-1">
              <span className="font-bold">등번호 (선택)</span>
              <input
                type="number"
                min={0}
                max={199}
                value={newPlayerForm.uniformNumber}
                onChange={(e) =>
                  setNewPlayerForm({
                    ...newPlayerForm,
                    uniformNumber: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">출신 학교</span>
              <input
                type="text"
                value={newPlayerForm.school}
                onChange={(e) => setNewPlayerForm({ ...newPlayerForm, school: e.target.value })}
                placeholder="예: 경남고"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </label>
          </div>
        </div>
      )}

      {/* ================= TAB 3: 구단 재정 · 예산 ================= */}
      {subTab === 'finances' && (
        <div className="gm-card p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <TeamLogo teamId={financeDraft.teamId} size="md" />
              <div>
                <h3 className="text-sm font-black">
                  {KBO_TEAMS[financeDraft.teamId].name} 재정 · 예산 · 시설 에디터
                </h3>
                <p className="text-[11px] text-slate-500">
                  {mode === 'PREGAME'
                    ? '10개 구단별 새 게임 초기 자금, 구단주 예산 상한, 초기 시설 레벨을 설정합니다.'
                    : '현재 세이브의 구단 보유 현금, 예산 상한, 미지급금, 티켓 정책, 시설 레벨을 즉시 수정합니다.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {mode === 'PREGAME' && (
                <select
                  value={financeTargetTeam}
                  onChange={(e) => setFinanceTargetTeam(e.target.value as TeamId)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
                >
                  {TEAM_IDS.map((tid) => (
                    <option key={tid} value={tid}>
                      {KBO_TEAMS[tid].name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleReviewFinancesSave}
                className="px-4 py-2 rounded-lg team-accent-btn font-black inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>변경 전후 비교 · 저장</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <label className="space-y-1">
              <span className="font-bold">구단 보유 현금 (억 원)</span>
              <input
                type="number"
                step="5"
                min={-500}
                max={5000}
                value={financeDraft.cashBalanceBillion}
                onChange={(e) =>
                  setFinanceDraft({ ...financeDraft, cashBalanceBillion: Number(e.target.value) })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats font-bold"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">구단주 예산 상한 (억 원)</span>
              <input
                type="number"
                step="5"
                min={30}
                max={1000}
                value={financeDraft.ownerBudgetCapBillion}
                onChange={(e) =>
                  setFinanceDraft({ ...financeDraft, ownerBudgetCapBillion: Number(e.target.value) })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats font-bold"
              />
            </label>
            <label className="space-y-1">
              <span className="font-bold">티켓 가격 정책</span>
              <select
                value={financeDraft.ticketPricePolicy}
                onChange={(e) =>
                  setFinanceDraft({
                    ...financeDraft,
                    ticketPricePolicy: e.target.value as TicketPricePolicy,
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="인하">인하</option>
                <option value="표준">표준</option>
                <option value="인상">인상</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold">원화 미지급 채무 (억 원)</span>
              <input
                type="number"
                step="1"
                min={0}
                max={500}
                value={financeDraft.krwUnpaidBillion}
                onChange={(e) =>
                  setFinanceDraft({ ...financeDraft, krwUnpaidBillion: Number(e.target.value) })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats"
              />
            </label>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="font-bold text-slate-700 dark:text-slate-200">구단 4대 시설 레벨 (Lv.1 ~ Lv.5)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {([
                ['stadiumLevel', '홈구장 시설'],
                ['academyLevel', '육성 아카데미'],
                ['marketingLevel', '마케팅 · MD'],
                ['medicalLevel', '메디컬 센터'],
              ] as const).map(([key, label]) => (
                <label
                  key={key}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1"
                >
                  <div className="font-bold">{label}</div>
                  <select
                    value={financeDraft.investments[key]}
                    onChange={(e) =>
                      setFinanceDraft({
                        ...financeDraft,
                        investments: {
                          ...financeDraft.investments,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-stats font-bold"
                  >
                    {[1, 2, 3, 4, 5].map((lv) => (
                      <option key={lv} value={lv}>
                        Lv.{lv}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: 수정 내역 · 복구 ================= */}
      {subTab === 'history' && (
        <div className="gm-card p-5 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-black">에디터 수정 내역 ({historyList.length}건)</h3>
              <p className="text-[11px] text-slate-500">
                모든 변경 전후 이력이 기록되며 직전 변경 취소(Undo) 또는 전체 원본 복구가 가능합니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={historyList.length === 0}
                onClick={handleUndoLast}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold disabled:opacity-40 inline-flex items-center gap-1"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>직전 변경 취소</span>
              </button>
              <button
                type="button"
                disabled={totalChangesCount === 0 && historyList.length === 0}
                onClick={handleRestoreAllOriginals}
                className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold disabled:opacity-40 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>전체 원본 복구</span>
              </button>
            </div>
          </div>

          {historyList.length === 0 ? (
            <div className="py-10 text-center text-slate-500">아직 기록된 에디터 수정 내역이 없습니다.</div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {historyList.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold">
                      {idx === 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px]">
                          최신
                        </span>
                      )}
                      <span>{entry.summary}</span>
                    </div>
                    <span className="font-mono-stats text-[10px] text-slate-400">
                      {entry.timestamp.slice(0, 19).replace('T', ' ')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.diffs.map((d, di) => (
                      <span
                        key={`${entry.id}-${di}`}
                        className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-mono-stats"
                      >
                        <strong className="font-sans">{d.label}:</strong> {d.before} →{' '}
                        <span className="team-accent-text font-bold">{d.after}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= CONFIRMATION MODAL: 변경 전후 비교 ================= */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[90] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-black text-sm">
                <Shield className="w-4 h-4 team-accent-text" />
                <span>{pendingConfirm.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {pendingConfirm.subtitle}
              </p>

              {pendingConfirm.warnings && pendingConfirm.warnings.length > 0 && (
                <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 space-y-1">
                  {pendingConfirm.warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">항목</th>
                      <th className="py-2 px-3">변경 전</th>
                      <th className="py-2 px-3">변경 후</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono-stats">
                    {pendingConfirm.diffs.map((d, i) => (
                      <tr key={i}>
                        <td className="py-1.5 px-3 font-sans font-bold">{d.label}</td>
                        <td className="py-1.5 px-3 text-slate-500">{d.before}</td>
                        <td className="py-1.5 px-3 font-bold text-emerald-700 dark:text-emerald-400">
                          {d.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-bold"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={pendingConfirm.onConfirm}
                  className="px-4 py-2 rounded-lg team-accent-btn font-black inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>확정 저장</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
