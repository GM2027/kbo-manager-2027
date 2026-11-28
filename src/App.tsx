import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { audioManager } from './audio/audioManager';
import { ClubIntroAnimation } from './components/ClubIntroAnimation';
import { Dashboard } from './components/Dashboard';
import { GameEditorView } from './components/GameEditorView';
import { NewGameWizard } from './components/NewGameWizard';
import { TitleScreen } from './components/TitleScreen';
import { createNewCareer } from './data/newGameTemplate';
import { TEAM_UI_THEMES } from './data/realKboHistories';
import {
  archiveExistingCareersBeforeNewGame,
  deleteSavedCareer,
  getLastSaveError,
  hydrateCareersFromIndexedDb,
  importCareerJson,
  listContinueOptions,
  loadCareerById,
  loadSettings,
  renameSavedCareer,
  saveAutoCareer,
  saveCareer,
  saveCareerAsNewSlot,
  saveSettings,
} from './storage/careerStorage';
import { AppSettings, CareerSave, GameDifficulty, TeamId } from './types/kbo';

type ScreenState = 'TITLE' | 'NEW_GAME' | 'PREGAME_EDITOR' | 'CLUB_INTRO' | 'CAREER';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('TITLE');
  const [preGameEditorReturnTo, setPreGameEditorReturnTo] = useState<'TITLE' | 'NEW_GAME'>('TITLE');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [activeCareer, setActiveCareer] = useState<CareerSave | null>(null);
  const [previewTeamId, setPreviewTeamId] = useState<TeamId>('LG');
  const [refreshTick, setRefreshTick] = useState(0);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateCareersFromIndexedDb().then((count) => {
      if (count > 0) setRefreshTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    const cleanUnlock = audioManager.installGlobalUnlock();
    const cleanClick = audioManager.installGlobalButtonClickListener();
    return () => {
      cleanUnlock();
      cleanClick();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Dynamic club color UI theme (#4): updates immediately on club selection & during gameplay
  useEffect(() => {
    const root = document.documentElement;
    const teamId: TeamId =
      (screen === 'CAREER' || screen === 'CLUB_INTRO') && activeCareer
        ? activeCareer.playerTeamId
        : screen === 'NEW_GAME'
        ? previewTeamId
        : activeCareer?.playerTeamId ?? '한화';
    const theme = TEAM_UI_THEMES[teamId] ?? TEAM_UI_THEMES['한화'];
    const isDark = settings.theme === 'dark';
    root.style.setProperty('--team-primary', isDark ? theme.primaryDark : theme.primaryLight);
    root.style.setProperty('--team-primary-dark', theme.primaryDark);
    root.style.setProperty('--team-primary-rgb', isDark ? theme.rgbDark : theme.rgbLight);
    root.style.setProperty('--team-primary-rgb-dark', theme.rgbDark);
    root.style.setProperty('--team-banner-from', theme.bannerFrom);
    root.style.setProperty('--team-banner-to', theme.bannerTo);
    root.style.setProperty('--team-on-primary', theme.onPrimary);
    root.dataset.clubTheme = teamId;
  }, [screen, activeCareer?.playerTeamId, previewTeamId, settings.theme]);

  const continueOptions = useMemo(() => {
    void refreshTick;
    return listContinueOptions();
  }, [refreshTick]);

  const handleUpdateSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const handleConfirmNewGame = (
    teamId: TeamId,
    gmName: string,
    difficulty: GameDifficulty = '어려움',
    editorEnabled = false
  ) => {
    archiveExistingCareersBeforeNewGame();
    const created = createNewCareer({ teamId, gmName, difficulty, editorEnabled });
    saveCareer(created);
    setActiveCareer(created);
    setScreen('CLUB_INTRO');
    setRefreshTick((t) => t + 1);
    setGlobalError(null);
  };

  const handleOpenPreGameEditor = (returnTo: 'TITLE' | 'NEW_GAME') => {
    setPreGameEditorReturnTo(returnTo);
    setScreen('PREGAME_EDITOR');
  };

  const handleContinueCareer = (careerId: string) => {
    setGlobalError(null);
    const loaded = loadCareerById(careerId);
    if (!loaded) {
      setGlobalError('선택한 세이브 슬롯을 불러올 수 없습니다.');
      return;
    }
    setActiveCareer(loaded);
    setScreen('CAREER');
  };

  const handleDeleteCareer = (careerId: string) => {
    deleteSavedCareer(careerId);
    setRefreshTick((t) => t + 1);
  };

  const handleRenameCareer = (careerId: string, newLabel: string) => {
    const ok = renameSavedCareer(careerId, newLabel);
    if (ok) {
      if (activeCareer && activeCareer.careerId === careerId) {
        setActiveCareer({ ...activeCareer, label: newLabel.trim() });
      }
      setRefreshTick((t) => t + 1);
    }
  };

  const handleSaveAsNewSlot = (customLabel: string) => {
    if (!activeCareer) return;
    const cloned = saveCareerAsNewSlot(activeCareer, customLabel);
    setActiveCareer(cloned);
    setRefreshTick((t) => t + 1);
  };

  const handleImportJson = (raw: string) => {
    const imported = importCareerJson(raw);
    setActiveCareer(imported);
    setScreen('CAREER');
    setRefreshTick((t) => t + 1);
    setGlobalError(null);
  };

  const handleUpdateCareer = useCallback((next: CareerSave, backup?: CareerSave) => {
    const { ok, savedCareer } = saveAutoCareer(next, backup);
    if (!ok) {
      setGlobalError(
        getLastSaveError() ??
          '자동 저장 중 오류가 발생했습니다. 기존 세이브 데이터는 안전하게 보호되었습니다.'
      );
    } else {
      setGlobalError((prev) => (prev ? null : prev));
    }
    setActiveCareer(savedCareer);
    setRefreshTick((t) => t + 1);
  }, []);

  return (
    <>
      {globalError && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm p-3 rounded border border-red-500 bg-white dark:bg-slate-900 text-xs text-red-600 dark:text-red-400 shadow-lg">
          {globalError}
        </div>
      )}

      <AnimatePresence mode="wait">
        {screen === 'TITLE' && (
          <motion.div
            key="screen-title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <TitleScreen
              savedCareers={continueOptions.savedCareers}
              lastPlayedCareer={continueOptions.lastPlayedCareer}
              settings={settings}
              onStartNewGame={() => setScreen('NEW_GAME')}
              onOpenPreGameEditor={() => handleOpenPreGameEditor('TITLE')}
              onContinueCareer={handleContinueCareer}
              onDeleteCareer={handleDeleteCareer}
              onRenameCareer={handleRenameCareer}
              onImportJson={handleImportJson}
              onUpdateSettings={handleUpdateSettings}
            />
          </motion.div>
        )}

        {screen === 'NEW_GAME' && (
          <motion.div
            key="screen-new-game"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <NewGameWizard
              defaultEditorEnabled={settings.editorDefaultEnabled ?? false}
              onCancel={() => setScreen('TITLE')}
              onOpenPreGameEditor={() => handleOpenPreGameEditor('NEW_GAME')}
              onConfirmStart={handleConfirmNewGame}
              onPreviewTeamColor={setPreviewTeamId}
            />
          </motion.div>
        )}

        {screen === 'PREGAME_EDITOR' && (
          <motion.div
            key="screen-pregame-editor"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="min-h-screen bg-slate-100/80 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          >
            <div className="h-1 w-full team-banner-grad" />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
              <GameEditorView
                mode="PREGAME"
                onClose={() => {
                  setScreen(preGameEditorReturnTo);
                  setRefreshTick((t) => t + 1);
                }}
              />
            </div>
          </motion.div>
        )}

        {screen === 'CLUB_INTRO' && activeCareer && (
          <motion.div
            key={`screen-club-intro-${activeCareer.careerId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ClubIntroAnimation
              teamId={activeCareer.playerTeamId}
              gmName={activeCareer.gmName}
              onComplete={() => setScreen('CAREER')}
            />
          </motion.div>
        )}

        {screen === 'CAREER' && activeCareer && (
          <motion.div
            key={`screen-career-${activeCareer.careerId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Dashboard
              career={activeCareer}
              savedCareers={continueOptions.savedCareers}
              settings={settings}
              onUpdateCareer={handleUpdateCareer}
              onUpdateSettings={handleUpdateSettings}
              onImportJson={handleImportJson}
              onSaveAsNewSlot={handleSaveAsNewSlot}
              onSwitchCareer={handleContinueCareer}
              onRenameCareer={handleRenameCareer}
              onDeleteCareer={handleDeleteCareer}
              onExitToTitle={() => {
                setScreen('TITLE');
                setRefreshTick((t) => t + 1);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
