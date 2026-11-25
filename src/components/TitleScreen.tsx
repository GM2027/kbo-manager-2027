import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock,
  Edit3,
  FolderOpen,
  Moon,
  Play,
  Plus,
  Settings,
  Sun,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { audioManager, AudioSettings } from '../audio/audioManager';
import { KBO_TEAMS, TEAM_IDS } from '../data/kboTeams';
import { CareerSummaryItem } from '../storage/careerStorage';
import { AppSettings, GamePhase } from '../types/kbo';
import { TeamLogo } from './TeamLogo';
import { KboOfficialLogo } from './KboOfficialLogo';
import { KoreanSeriesTrophyLogo } from './KoreanSeriesTrophyLogo';
import { SoundSettingsPanel } from './SoundSettingsPanel';
import stadiumHeroImg from '../assets/images/title_kbo_stadium_hero_1795524143792.jpg';

interface TitleScreenProps {
  savedCareers: CareerSummaryItem[];
  lastPlayedCareer: CareerSummaryItem | null;
  settings: AppSettings;
  onStartNewGame: () => void;
  onContinueCareer: (careerId: string) => void;
  onDeleteCareer: (careerId: string) => void;
  onRenameCareer: (careerId: string, newLabel: string) => void;
  onImportJson: (jsonText: string) => void;
  onUpdateSettings: (next: AppSettings) => void;
}

function formatPhaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'INTRO':
      return '취임 준비';
    case 'STAFF':
      return '코칭스태프 구성';
    case 'ROSTER_ANALYSIS':
      return '전력 분석';
    case 'REINFORCEMENT':
      return '전력 보강';
    case 'SPECIAL_DRAFT':
      return '특별 드래프트';
    case 'OPENING_ROSTER':
      return '개막 엔트리 확정';
    case 'REGULAR_SEASON':
      return '정규시즌 진행 중';
    case 'POSTSEASON':
      return '포스트시즌';
    case 'OFFSEASON':
      return '오프시즌 스토브리그';
  }
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  savedCareers,
  lastPlayedCareer,
  settings,
  onStartNewGame,
  onContinueCareer,
  onDeleteCareer,
  onRenameCareer,
  onImportJson,
  onUpdateSettings,
}) => {
  const [activeModal, setActiveModal] = useState<'slots' | 'import' | 'settings' | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [editingCareerId, setEditingCareerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [heroImgError, setHeroImgError] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => audioManager.getSettings());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return audioManager.subscribe((next) => setAudioSettings(next));
  }, []);

  const isDark = settings.theme === 'dark';
  const latestTeam = lastPlayedCareer ? KBO_TEAMS[lastPlayedCareer.playerTeamId] : null;

  const handleImportSubmit = () => {
    setImportError(null);
    if (!importText.trim()) {
      setImportError('세이브 JSON 내용을 입력하거나 파일을 선택해주세요.');
      return;
    }
    try {
      onImportJson(importText);
      setImportText('');
      setActiveModal(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '세이브 불러오기에 실패했습니다.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      setImportText(content);
      setImportError(null);
    };
    reader.readAsText(file, 'utf-8');
  };

  const commitRename = (careerId: string) => {
    if (editingName.trim()) {
      onRenameCareer(careerId, editingName.trim());
    }
    setEditingCareerId(null);
  };

  const latestWinPct =
    lastPlayedCareer && lastPlayedCareer.wins + lastPlayedCareer.losses > 0
      ? (lastPlayedCareer.wins / (lastPlayedCareer.wins + lastPlayedCareer.losses)).toFixed(3)
      : '0.000';

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden flex flex-col justify-between bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* 풀-블리드 야간 KBO 야구장 배경 + 테마별 WCAG AA 대비 스크림 */}
      <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden">
        {!heroImgError ? (
          <img
            src={stadiumHeroImg}
            alt="KBO 야간 프로야구 구장 전경"
            referrerPolicy="no-referrer"
            onError={() => setHeroImgError(true)}
            className="w-full h-full object-cover object-center scale-[1.01]"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#061024] via-[#0F1E3A] to-[#0B2E1E]" />
        )}

        {isDark ? (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/92 via-slate-950/74 to-slate-950/42" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/70" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-slate-50/86 to-slate-900/28" />
            <div className="absolute inset-0 bg-gradient-to-t from-white/92 via-transparent to-white/75" />
          </>
        )}
      </div>

      {/* 상단 미니멀 헤더 */}
      <header className="relative z-10 w-full border-b border-slate-900/10 dark:border-white/10 backdrop-blur-md bg-white/70 dark:bg-slate-950/55">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <KboOfficialLogo variant="emblem" className="w-9 h-9" />
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-black text-base sm:text-lg tracking-tight text-slate-900 dark:text-white truncate">
                KBO GM 2027
              </span>
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-950/90 text-white dark:bg-white/15 dark:text-amber-300 border border-white/10">
                v18 DB · 731명
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveModal('import')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300/80 dark:border-white/15 bg-white/80 dark:bg-slate-900/65 text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">세이브 불러오기</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('settings')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300/80 dark:border-white/15 bg-white/80 dark:bg-slate-900/65 text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">설정</span>
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
              aria-label={audioSettings.masterEnabled ? '사운드 음소거' : '사운드 켜기'}
              title={audioSettings.masterEnabled ? '전체 사운드 ON (클릭 시 음소거)' : '전체 사운드 음소거 (클릭 시 켜기)'}
              className="p-2 rounded-lg border border-slate-300/80 dark:border-white/15 bg-white/80 dark:bg-slate-900/65 text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {audioSettings.masterEnabled ? (
                <Volume2 className="w-4 h-4 text-orange-500" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  theme: isDark ? 'light' : 'dark',
                })
              }
              aria-label="테마 전환"
              className="p-2 rounded-lg border border-slate-300/80 dark:border-white/15 bg-white/80 dark:bg-slate-900/65 text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>
          </div>
        </div>
      </header>

      {/* 메인 히어로 섹션 (비대칭 2단 구성) */}
      <main className="relative z-10 flex-1 flex items-center">
        <div className="w-full max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* 좌측: 헤드라인 · 핵심 액션 · 10개 구단 엠블럼 스트립 */}
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-2.5">
                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-orange-600 dark:text-amber-400">
                  2027 KBO LEAGUE FRONT OFFICE
                </p>
                <div className="flex items-center gap-3.5 flex-wrap">
                  <KboOfficialLogo variant="emblem" className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl p-1.5" />
                  <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-black tracking-tight leading-[1.1] text-slate-950 dark:text-white">
                    KBO 단장 시뮬레이터
                  </h1>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-200/90 max-w-lg">
                  10개 구단 144경기부터 FA·트레이드·드래프트·한국시리즈까지, 구단의 모든 결정을 직접 지휘하세요.
                </p>
              </div>

              {/* 액션 버튼 계층 */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {lastPlayedCareer && latestTeam ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onContinueCareer(lastPlayedCareer.careerId)}
                      className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-sm sm:text-base shadow-lg shadow-orange-950/30 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{latestTeam.shortName} 이어하기</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onStartNewGame}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap backdrop-blur-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>새 게임 시작</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onStartNewGame}
                    className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-sm sm:text-base shadow-lg shadow-orange-950/30 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>새 게임 시작</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {savedCareers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveModal('slots')}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-slate-900/10 dark:bg-white/10 hover:bg-slate-900/15 dark:hover:bg-white/15 text-slate-900 dark:text-white border border-slate-900/15 dark:border-white/15 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap backdrop-blur-sm"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>저장 슬롯 ({savedCareers.length})</span>
                  </button>
                )}
              </div>

              {/* KBO 10개 구단 엠블럼 스트립 */}
              <div className="pt-4 border-t border-slate-900/10 dark:border-white/15 max-w-xl">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300/85 mb-2.5">
                  2027 KBO League · 10개 참가 구단
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {TEAM_IDS.map((tid) => (
                    <div
                      key={tid}
                      title={KBO_TEAMS[tid].name}
                      className="w-9 h-9 rounded-lg bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-white/15 flex items-center justify-center shadow-xs backdrop-blur-xs"
                    >
                      <TeamLogo teamId={tid} size="xs" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 우측: 최근 세이브 요약 카드 또는 한국시리즈 공식 트로피·시즌 사양 패널 */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-200/90 dark:border-white/15 bg-white/88 dark:bg-slate-950/78 backdrop-blur-xl shadow-2xl overflow-hidden">
                {lastPlayedCareer && latestTeam ? (
                  <div className="p-6 space-y-5">
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-orange-600 dark:text-amber-400">
                        최근 진행 중인 커리어
                      </span>
                      <span className="text-xs font-mono-stats text-slate-500 dark:text-slate-400">
                        {lastPlayedCareer.season} 시즌
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0">
                        <TeamLogo teamId={lastPlayedCareer.playerTeamId} size="md" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg font-black text-slate-950 dark:text-white truncate">
                          {lastPlayedCareer.label}
                        </div>
                        <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                          {latestTeam.name} · {formatPhaseLabel(lastPlayedCareer.phase)}
                        </div>
                        <div className="text-xs font-mono-stats text-slate-500 dark:text-slate-400 mt-1">
                          {lastPlayedCareer.rank ? `${lastPlayedCareer.rank}위 · ` : ''}
                          {lastPlayedCareer.wins}승 {lastPlayedCareer.losses}패
                          {lastPlayedCareer.draws > 0 ? ` ${lastPlayedCareer.draws}무` : ''} (승률 {latestWinPct})
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-center">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">진행 경기</div>
                        <div className="text-sm font-black font-mono-stats text-slate-900 dark:text-white mt-0.5">
                          {lastPlayedCareer.gamesPlayed}/{lastPlayedCareer.totalRegularGames}G
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">보유 자금</div>
                        <div className="text-sm font-black font-mono-stats text-slate-900 dark:text-white mt-0.5">
                          {lastPlayedCareer.cashBalanceBillion !== null
                            ? `${lastPlayedCareer.cashBalanceBillion.toFixed(1)}억`
                            : '미확정'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">최근 저장</div>
                        <div className="text-xs font-bold font-mono-stats text-slate-700 dark:text-slate-300 mt-1">
                          {lastPlayedCareer.updatedAt.slice(5, 10)}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onContinueCareer(lastPlayedCareer.careerId)}
                      className="w-full py-3 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 hover:opacity-90 font-extrabold text-sm flex items-center justify-center gap-2 transition-opacity cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>프런트 오피스 입장</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-6 space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-orange-600 dark:text-amber-400">
                        2027 시즌 목표 · 한국시리즈
                      </span>
                      <span className="text-xs font-mono-stats text-slate-500 dark:text-slate-400">
                        144G · 10 CLUBS
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <KoreanSeriesTrophyLogo size="md" season={2027} showCaption={false} />
                      <div className="space-y-1 min-w-0">
                        <div className="text-base font-black text-slate-950 dark:text-white">
                          2027 KBO 한국시리즈 우승 도전
                        </div>
                        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                          골든듀 공식 우승 트로피를 들어 올리기 위한 1군·2군 엔트리, FA, 드래프트, 재정 및 선수단 관리가 시작됩니다.
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs border-t border-slate-200 dark:border-slate-800 pt-2">
                      <div className="py-2 flex items-center justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">정규시즌 · 포스트시즌</span>
                        <span className="font-bold text-slate-900 dark:text-white font-mono-stats">
                          144경기 · 5강 토너먼트
                        </span>
                      </div>
                      <div className="py-2 flex items-center justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">규정 · 샐러리캡</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          경쟁균형세 · 아시아쿼터 · FA 보상
                        </span>
                      </div>
                      <div className="py-2 flex items-center justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">스카우팅 · 오프시즌</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          11R 드래프트 · MLB 스카우팅 · 8단계 결산
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 하단 정돈된 푸터 */}
      <footer className="relative z-10 w-full border-t border-slate-900/10 dark:border-white/10 bg-white/75 dark:bg-slate-950/65 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
          <span>2027 KBO 리그 프런트 오피스 매니지먼트 시뮬레이션 · v18 재보정 731명 DB</span>
          <span className="font-mono-stats">
            로컬 세이브 자동 저장 · JSON 백업 지원
          </span>
        </div>
      </footer>

      {/* ================= MODAL: 저장된 게임 슬롯 목록 ================= */}
      {activeModal === 'slots' && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <FolderOpen className="w-4 h-4 text-orange-500" />
                <span>저장된 커리어 슬롯 ({savedCareers.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto space-y-2.5">
              {savedCareers.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  저장된 게임 슬롯이 없습니다. 새 게임을 시작해보세요.
                </div>
              ) : (
                savedCareers.map((slot) => {
                  const team = KBO_TEAMS[slot.playerTeamId];
                  const isEditing = editingCareerId === slot.careerId;
                  return (
                    <div
                      key={slot.careerId}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <TeamLogo teamId={slot.playerTeamId} size="sm" />
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename(slot.careerId);
                                  if (e.key === 'Escape') setEditingCareerId(null);
                                }}
                                autoFocus
                                className="px-2 py-1 text-xs rounded border border-orange-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white w-48"
                              />
                              <button
                                type="button"
                                onClick={() => commitRename(slot.careerId)}
                                className="p-1 rounded bg-emerald-600 text-white"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                              {slot.label}
                            </div>
                          )}
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 font-mono-stats">
                            <span>{team.name}</span>
                            <span>·</span>
                            <span>
                              {slot.season}시즌 {slot.gamesPlayed}G ({slot.wins}승 {slot.losses}패)
                            </span>
                            <span>·</span>
                            <span>{formatPhaseLabel(slot.phase)}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {slot.updatedAt.slice(0, 16).replace('T', ' ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCareerId(slot.careerId);
                            setEditingName(slot.label);
                          }}
                          title="슬롯 이름 변경"
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCareer(slot.careerId)}
                          title="슬롯 삭제"
                          className="p-2 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null);
                            onContinueCareer(slot.careerId);
                          }}
                          className="px-3.5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold cursor-pointer"
                        >
                          불러오기
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: JSON 세이브 불러오기 ================= */}
      {activeModal === 'import' && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Upload className="w-4 h-4 text-orange-500" />
                <span>JSON 세이브 파일 불러오기</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  백업한 .json 파일을 선택하거나 내용을 붙여넣으세요.
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  파일 선택
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
              <textarea
                rows={7}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{"id": "...", "season": 2026, ...}'
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              {importError && (
                <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {importError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold"
                >
                  가져오기 및 실행
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: 환경 설정 ================= */}
      {activeModal === 'settings' && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Settings className="w-4 h-4 text-orange-500" />
                <span>환경 설정</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  audioManager.stopAllActiveEvents();
                  setActiveModal(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 max-h-[82vh] overflow-y-auto space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">화면 테마</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    라이트 / 다크 모드를 선택합니다.
                  </div>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
                    className={`px-3 py-1.5 ${
                      !isDark
                        ? 'bg-orange-600 text-white'
                        : 'bg-transparent text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    라이트
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
                    className={`px-3 py-1.5 ${
                      isDark
                        ? 'bg-orange-600 text-white'
                        : 'bg-transparent text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    다크
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">세부 기록 컬럼 기본 표시</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    로스터 테이블에서 확장 스탯을 기본으로 펼칩니다.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showDetailedColumnsByDefault}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      showDetailedColumnsByDefault: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-orange-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <SoundSettingsPanel compact />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    audioManager.stopAllActiveEvents();
                    setActiveModal(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
