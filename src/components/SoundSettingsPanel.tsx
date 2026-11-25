import React, { useEffect, useState } from 'react';
import {
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  audioManager,
  AudioSettings,
  SOUND_EVENT_CATALOG,
  SoundEventId,
} from '../audio/audioManager';

interface SoundSettingsPanelProps {
  compact?: boolean;
}

export const SoundSettingsPanel: React.FC<SoundSettingsPanelProps> = ({
  compact = false,
}) => {
  const [audio, setAudio] = useState<AudioSettings>(() => audioManager.getSettings());
  const [previewingId, setPreviewingId] = useState<SoundEventId | null>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);

  useEffect(() => {
    return audioManager.subscribe((next) => setAudio(next));
  }, []);

  const handlePreview = (id: SoundEventId, label: string) => {
    setPreviewNotice(null);
    if (!audio.masterEnabled || audio.masterVolume <= 0) {
      setPreviewNotice('전체 사운드가 꺼져 있거나 음량이 0%입니다. 사운드를 켠 뒤 미리 들어보세요.');
      return;
    }
    const res = audioManager.previewSound(id);
    if (res.played) {
      setPreviewingId(id);
      setPreviewNotice(`미리 듣기 재생 중: ${label}`);
    } else {
      setPreviewNotice(`오디오 재생을 시작할 수 없습니다 (${res.reason ?? '환경 제한'}).`);
    }
  };

  const handleStopPreview = () => {
    audioManager.stopAllActiveEvents();
    setPreviewingId(null);
    setPreviewNotice(null);
  };

  const handleReset = () => {
    audioManager.stopAllActiveEvents();
    audioManager.resetSettings();
    setPreviewingId(null);
    setPreviewNotice('사운드 설정을 기본값으로 복원했습니다.');
  };

  return (
    <div className="space-y-4 text-xs">
      {/* 전체 사운드 ON/OFF */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
            {audio.masterEnabled ? (
              <Volume2 className="w-4 h-4 text-orange-500" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
            <span>전체 사운드</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            모든 효과음·시상식·관중 함성·전환음을 켜거나 끕니다. (자동 저장)
          </div>
        </div>
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
          className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
            audio.masterEnabled
              ? 'bg-orange-600 text-white hover:bg-orange-500'
              : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          {audio.masterEnabled ? 'ON' : 'OFF (음소거)'}
        </button>
      </div>

      {/* 음량 슬라이더 3종: 전체 / 효과음 / 배경음악 */}
      <div className={`space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 ${!audio.masterEnabled ? 'opacity-55' : ''}`}>
        {[
          {
            key: 'masterVolume' as const,
            label: '전체 음량',
            value: audio.masterVolume,
          },
          {
            key: 'sfxVolume' as const,
            label: '효과음 음량',
            value: audio.sfxVolume,
          },
          {
            key: 'bgmVolume' as const,
            label: '배경음악 음량',
            value: audio.bgmVolume,
          },
        ].map((item) => (
          <div key={item.key} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-700 dark:text-slate-200">{item.label}</span>
              <span className="font-mono-stats font-bold text-slate-600 dark:text-slate-300">
                {item.value}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={item.value}
              onChange={(e) =>
                audioManager.updateSettings({ [item.key]: Number(e.target.value) })
              }
              className="w-full accent-orange-600 cursor-pointer"
            />
          </div>
        ))}
      </div>

      {/* 세부 옵션 ON/OFF: 버튼 클릭음 / 관중 함성 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
        <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 cursor-pointer">
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100">버튼 클릭음</div>
            <div className="text-[10px] text-slate-500">짧고 가벼운 UI 클릭음</div>
          </div>
          <input
            type="checkbox"
            checked={audio.uiClickEnabled}
            onChange={(e) => audioManager.updateSettings({ uiClickEnabled: e.target.checked })}
            className="w-4 h-4 accent-orange-600"
          />
        </label>

        <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 cursor-pointer">
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100">관중 함성 · 박수</div>
            <div className="text-[10px] text-slate-500">개막전·우승·은퇴식 관중음</div>
          </div>
          <input
            type="checkbox"
            checked={audio.crowdEnabled}
            onChange={(e) => audioManager.updateSettings({ crowdEnabled: e.target.checked })}
            className="w-4 h-4 accent-orange-600"
          />
        </label>
      </div>

      {/* 사운드 미리 듣기 */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold text-slate-800 dark:text-slate-100">
            사운드 미리 듣기 ({SOUND_EVENT_CATALOG.length}종)
          </div>
          <button
            type="button"
            data-no-click-sound="true"
            onClick={handleStopPreview}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <Square className="w-3 h-3" />
            <span>재생 정지</span>
          </button>
        </div>

        <div
          className={`grid grid-cols-2 ${compact ? 'sm:grid-cols-2 max-h-40' : 'sm:grid-cols-3 max-h-56'} gap-1.5 overflow-y-auto pr-1`}
        >
          {SOUND_EVENT_CATALOG.map((item) => {
            const active = previewingId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-no-click-sound="true"
                onClick={() => handlePreview(item.id, item.label)}
                title={item.description}
                className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-orange-500 bg-orange-500/15 text-orange-700 dark:text-orange-300 font-bold'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold'
                }`}
              >
                <span className="truncate text-[11px]">{item.label}</span>
                <Play className="w-3 h-3 shrink-0 opacity-80" />
              </button>
            );
          })}
        </div>

        {previewNotice && (
          <div className="text-[11px] text-orange-600 dark:text-amber-400 font-medium">
            {previewNotice}
          </div>
        )}
      </div>

      {/* 하단 기본 설정 복원 */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
        <span className="text-[10px] text-slate-500">
          변경 즉시 자동 저장 · Web Audio API 및 커스텀 음원(MP3/WAV/OGG) 지원
        </span>
        <button
          type="button"
          data-no-click-sound="true"
          onClick={handleReset}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
          <span>기본 설정 복원</span>
        </button>
      </div>
    </div>
  );
};

interface SoundSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SoundSettingsModal: React.FC<SoundSettingsModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[75] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="사운드 환경설정"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          audioManager.stopAllActiveEvents();
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-sm text-slate-900 dark:text-white">
            <Volume2 className="w-4 h-4 text-orange-500" />
            <span>KBO GM 사운드 설정</span>
          </div>
          <button
            type="button"
            onClick={() => {
              audioManager.stopAllActiveEvents();
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
            aria-label="사운드 설정 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[80vh] overflow-y-auto">
          <SoundSettingsPanel />
        </div>
      </div>
    </div>
  );
};
