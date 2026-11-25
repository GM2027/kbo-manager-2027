/**
 * KBO GM 2026 중앙 통합 사운드 시스템 (AudioManager)
 * - Web Audio API 기반 절차적 효과음·팡파르·관중 함성·배경 선율 합성 (저작권 이슈 없음, Gemini API 미사용)
 * - MP3 / WAV / OGG 외부/로컬 음원 파일 등록 및 재생 확장 지원 (파일 미존재·디코딩 실패 시 Web Audio 합성음으로 자동 대체)
 * - 최초 사용자 인터랙션 이후 오디오 컨텍스트 자동 활성화
 * - 동시 재생 수 제한, 이벤트별 쿨다운, 시뮬레이션 중 반복음 억제, 애니메이션 건너뛰기 즉시 중단
 * - 설정값 localStorage 자동 저장 및 복원
 */

export type SoundEventId =
  | 'button_click'
  | 'club_select'
  | 'contract_sign'
  | 'rookie_draft'
  | 'opening_day'
  | 'mega_fa_deal'
  | 'blockbuster_trade'
  | 'manager_change'
  | 'postseason_clinch'
  | 'korean_series_champion'
  | 'golden_glove'
  | 'mvp_roy'
  | 'retirement_ceremony'
  | 'season_transition';

export interface SoundEventMeta {
  id: SoundEventId;
  label: string;
  description: string;
  category: 'ui' | 'contract' | 'ceremony' | 'highlight' | 'transition';
  usesCrowd?: boolean;
  usesBgm?: boolean;
  durationMs: number;
}

export const SOUND_EVENT_CATALOG: SoundEventMeta[] = [
  {
    id: 'button_click',
    label: '버튼 클릭',
    description: '짧고 가벼운 UI 클릭음',
    category: 'ui',
    durationMs: 70,
  },
  {
    id: 'club_select',
    label: '구단 선택',
    description: '웅장한 구단 출범 전환음',
    category: 'transition',
    durationMs: 1800,
  },
  {
    id: 'contract_sign',
    label: '계약 체결',
    description: '계약서 날인 도장 효과음',
    category: 'contract',
    durationMs: 650,
  },
  {
    id: 'rookie_draft',
    label: '신인 드래프트',
    description: '신인 선수 지명 알림 차임',
    category: 'highlight',
    durationMs: 900,
  },
  {
    id: 'opening_day',
    label: '개막전',
    description: '관중 함성과 경기 시작 오르간 효과음',
    category: 'highlight',
    usesCrowd: true,
    durationMs: 2400,
  },
  {
    id: 'mega_fa_deal',
    label: '대형 FA 계약',
    description: '대형 FA 계약 성사 팡파르 · 도장음',
    category: 'contract',
    durationMs: 2200,
  },
  {
    id: 'blockbuster_trade',
    label: '대형 트레이드',
    description: '긴급 뉴스 속보 시그널 효과음',
    category: 'highlight',
    durationMs: 2100,
  },
  {
    id: 'manager_change',
    label: '감독 경질',
    description: '묵직한 긴장 저음 효과음',
    category: 'highlight',
    durationMs: 2100,
  },
  {
    id: 'postseason_clinch',
    label: '포스트시즌 진출',
    description: '가을야구 확정 축하 팡파르',
    category: 'highlight',
    usesCrowd: true,
    durationMs: 2000,
  },
  {
    id: 'korean_series_champion',
    label: '한국시리즈 우승',
    description: '우승 팡파르 · 폭죽 · 관중 함성',
    category: 'ceremony',
    usesCrowd: true,
    durationMs: 2900,
  },
  {
    id: 'golden_glove',
    label: '골든글러브',
    description: '시상식 황금 하프 · 차임 효과음',
    category: 'ceremony',
    durationMs: 1700,
  },
  {
    id: 'mvp_roy',
    label: 'MVP · 신인왕',
    description: '스포트라이트 수상 팡파르 효과음',
    category: 'ceremony',
    durationMs: 1900,
  },
  {
    id: 'retirement_ceremony',
    label: '은퇴식',
    description: '잔잔한 피아노 선율과 따뜻한 박수',
    category: 'ceremony',
    usesCrowd: true,
    usesBgm: true,
    durationMs: 2900,
  },
  {
    id: 'season_transition',
    label: '시즌 전환',
    description: '새 시즌 개막 부드러운 전환음',
    category: 'transition',
    durationMs: 1900,
  },
];

export interface AudioSettings {
  masterEnabled: boolean;
  masterVolume: number; // 0..100
  sfxVolume: number; // 0..100
  bgmVolume: number; // 0..100
  uiClickEnabled: boolean;
  crowdEnabled: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterEnabled: true,
  masterVolume: 75,
  sfxVolume: 80,
  bgmVolume: 65,
  uiClickEnabled: true,
  crowdEnabled: true,
};

export interface PlaySoundOptions {
  /** 미리 듣기 등 시뮬레이션 억제를 무시하고 재생할 때 true */
  force?: boolean;
  /** 음량 배수 (0.1..1.5) */
  volumeScale?: number;
}

export interface PlayResult {
  played: boolean;
  eventId: SoundEventId;
  source: 'file' | 'synth' | 'skipped';
  reason?: string;
}

interface ActiveVoiceHandle {
  id: string;
  eventId: SoundEventId;
  stop: () => void;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const AUDIO_SETTINGS_STORAGE_KEY = 'kbo_gm_2026_audio_settings_v1';
const MAX_CONCURRENT_VOICES = 4;
const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.webm'];

function clampPct(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function getWebAudioCtor(): (typeof AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioManager {
  private settings: AudioSettings;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private unlocked = false;
  private simulationMode = false;
  private globalUnlockInstalled = false;
  private globalClickInstalled = false;

  private customAudioFiles = new Map<SoundEventId, string>();
  private decodedBufferCache = new Map<string, AudioBuffer>();
  private failedFileUrls = new Set<string>();

  private activeVoices = new Map<string, ActiveVoiceHandle>();
  private lastPlayedAt = new Map<SoundEventId, number>();
  private lastMajorEventAt = 0;
  private listeners = new Set<(settings: AudioSettings) => void>();

  constructor(initialSettings?: Partial<AudioSettings>) {
    this.settings = {
      ...DEFAULT_AUDIO_SETTINGS,
      ...this.loadPersistedSettings(),
      ...(initialSettings ?? {}),
    };
  }

  private loadPersistedSettings(): Partial<AudioSettings> {
    try {
      if (typeof localStorage === 'undefined') return {};
      const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        masterEnabled:
          typeof parsed.masterEnabled === 'boolean'
            ? parsed.masterEnabled
            : DEFAULT_AUDIO_SETTINGS.masterEnabled,
        masterVolume: clampPct(
          parsed.masterVolume ?? DEFAULT_AUDIO_SETTINGS.masterVolume,
          DEFAULT_AUDIO_SETTINGS.masterVolume
        ),
        sfxVolume: clampPct(
          parsed.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume,
          DEFAULT_AUDIO_SETTINGS.sfxVolume
        ),
        bgmVolume: clampPct(
          parsed.bgmVolume ?? DEFAULT_AUDIO_SETTINGS.bgmVolume,
          DEFAULT_AUDIO_SETTINGS.bgmVolume
        ),
        uiClickEnabled:
          typeof parsed.uiClickEnabled === 'boolean'
            ? parsed.uiClickEnabled
            : DEFAULT_AUDIO_SETTINGS.uiClickEnabled,
        crowdEnabled:
          typeof parsed.crowdEnabled === 'boolean'
            ? parsed.crowdEnabled
            : DEFAULT_AUDIO_SETTINGS.crowdEnabled,
      };
    } catch {
      return {};
    }
  }

  private persistSettings(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage quota or restricted iframe — never interrupt gameplay
    }
  }

  private notifyListeners(): void {
    const snap = this.getSettings();
    this.listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch {
        // ignore listener failure
      }
    });
  }

  public subscribe(listener: (settings: AudioSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public updateSettings(patch: Partial<AudioSettings>): AudioSettings {
    const next: AudioSettings = {
      masterEnabled:
        typeof patch.masterEnabled === 'boolean'
          ? patch.masterEnabled
          : this.settings.masterEnabled,
      masterVolume:
        patch.masterVolume !== undefined
          ? clampPct(patch.masterVolume, this.settings.masterVolume)
          : this.settings.masterVolume,
      sfxVolume:
        patch.sfxVolume !== undefined
          ? clampPct(patch.sfxVolume, this.settings.sfxVolume)
          : this.settings.sfxVolume,
      bgmVolume:
        patch.bgmVolume !== undefined
          ? clampPct(patch.bgmVolume, this.settings.bgmVolume)
          : this.settings.bgmVolume,
      uiClickEnabled:
        typeof patch.uiClickEnabled === 'boolean'
          ? patch.uiClickEnabled
          : this.settings.uiClickEnabled,
      crowdEnabled:
        typeof patch.crowdEnabled === 'boolean'
          ? patch.crowdEnabled
          : this.settings.crowdEnabled,
    };
    this.settings = next;
    this.applyGainValues();
    if (!next.masterEnabled) {
      this.stopAllActiveEvents();
    }
    this.persistSettings();
    this.notifyListeners();
    return this.getSettings();
  }

  public toggleMasterMute(): AudioSettings {
    return this.updateSettings({ masterEnabled: !this.settings.masterEnabled });
  }

  public resetSettings(): AudioSettings {
    this.settings = { ...DEFAULT_AUDIO_SETTINGS };
    this.applyGainValues();
    this.persistSettings();
    this.notifyListeners();
    return this.getSettings();
  }

  public setSimulationMode(active: boolean): void {
    this.simulationMode = active;
  }

  public isSimulationMode(): boolean {
    return this.simulationMode;
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public getActiveVoiceCount(): number {
    return this.activeVoices.size;
  }

  /**
   * MP3 / WAV / OGG 커스텀 음원 파일 등록 (확장 가능 구조)
   */
  public registerCustomAudioFile(eventId: SoundEventId, url: string): boolean {
    const clean = url.trim();
    if (!clean) return false;
    const lower = clean.toLowerCase().split('?')[0];
    const validExt =
      SUPPORTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext)) ||
      lower.startsWith('blob:') ||
      lower.startsWith('data:audio/');
    if (!validExt) return false;
    this.customAudioFiles.set(eventId, clean);
    this.failedFileUrls.delete(clean);
    return true;
  }

  public registerCustomAudioManifest(manifest: Partial<Record<SoundEventId, string>>): void {
    for (const [key, url] of Object.entries(manifest)) {
      if (url) {
        this.registerCustomAudioFile(key as SoundEventId, url);
      }
    }
  }

  public unregisterCustomAudioFile(eventId: SoundEventId): void {
    this.customAudioFiles.delete(eventId);
  }

  public getRegisteredCustomAudioFile(eventId: SoundEventId): string | undefined {
    return this.customAudioFiles.get(eventId);
  }

  private ensureContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor = getWebAudioCtor();
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.bgmGain = this.ctx.createGain();
        this.crowdGain = this.ctx.createGain();

        this.sfxGain.connect(this.masterGain);
        this.bgmGain.connect(this.masterGain);
        this.crowdGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.applyGainValues();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {
          // Autoplay policy block before user gesture — safe to ignore
        });
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private applyGainValues(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.bgmGain || !this.crowdGain) return;
    try {
      const now = this.ctx.currentTime;
      const master = this.settings.masterEnabled ? this.settings.masterVolume / 100 : 0;
      const sfx = this.settings.sfxVolume / 100;
      const bgm = this.settings.bgmVolume / 100;
      const crowd = this.settings.crowdEnabled ? sfx : 0;

      this.masterGain.gain.setTargetAtTime(master, now, 0.015);
      this.sfxGain.gain.setTargetAtTime(sfx, now, 0.015);
      this.bgmGain.gain.setTargetAtTime(bgm, now, 0.015);
      this.crowdGain.gain.setTargetAtTime(crowd, now, 0.015);
    } catch {
      // ignore audio graph state errors
    }
  }

  /**
   * 최초 사용자 클릭/키입력 이후 오디오 컨텍스트 활성화
   */
  public unlockAudio(): boolean {
    this.unlocked = true;
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  public installGlobalUnlock(): () => void {
    if (typeof window === 'undefined' || this.globalUnlockInstalled) {
      return () => {};
    }
    this.globalUnlockInstalled = true;
    const onGesture = () => {
      this.unlockAudio();
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    return () => {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      this.globalUnlockInstalled = false;
    };
  }

  /**
   * 전역 버튼 클릭음 리스너 (UI 버튼 클릭 시 짧고 가벼운 클릭음 재생)
   */
  public installGlobalButtonClickListener(): () => void {
    if (typeof document === 'undefined' || this.globalClickInstalled) {
      return () => {};
    }
    this.globalClickInstalled = true;
    const onClick = (ev: MouseEvent) => {
      try {
        this.unlockAudio();
        const target = ev.target as HTMLElement | null;
        if (!target) return;
        const btn = target.closest('button, [role="button"]') as HTMLElement | null;
        if (!btn) return;
        if ((btn as HTMLButtonElement).disabled) return;
        if (btn.dataset.noClickSound === 'true') return;
        // Skip click sound if a major event sound just fired within 90ms
        if (Date.now() - this.lastMajorEventAt < 90) return;
        this.play('button_click');
      } catch {
        // never interfere with UI clicks
      }
    };
    document.addEventListener('click', onClick, false);
    return () => {
      document.removeEventListener('click', onClick, false);
      this.globalClickInstalled = false;
    };
  }

  public stopEvent(eventId: SoundEventId): void {
    for (const [voiceId, handle] of Array.from(this.activeVoices.entries())) {
      if (handle.eventId === eventId) {
        this.disposeVoice(voiceId);
      }
    }
  }

  public stopAllActiveEvents(): void {
    for (const voiceId of Array.from(this.activeVoices.keys())) {
      this.disposeVoice(voiceId);
    }
  }

  private disposeVoice(voiceId: string): void {
    const handle = this.activeVoices.get(voiceId);
    if (!handle) return;
    this.activeVoices.delete(voiceId);
    if (handle.cleanupTimer) {
      clearTimeout(handle.cleanupTimer);
    }
    try {
      handle.stop();
    } catch {
      // ignore stop errors on already-ended nodes
    }
  }

  private enforceConcurrencyLimit(eventId: SoundEventId): void {
    // Same non-click event: replace previous instance cleanly so it never stacks
    if (eventId !== 'button_click') {
      this.stopEvent(eventId);
    }
    // Cap total simultaneous active voices
    while (this.activeVoices.size >= MAX_CONCURRENT_VOICES) {
      const oldestKey = this.activeVoices.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.disposeVoice(oldestKey);
    }
  }

  public previewSound(eventId: SoundEventId): PlayResult {
    this.unlockAudio();
    this.stopAllActiveEvents();
    return this.play(eventId, { force: true });
  }

  public play(eventId: SoundEventId, options: PlaySoundOptions = {}): PlayResult {
    const force = Boolean(options.force);
    const volumeScale = Math.max(0.1, Math.min(1.5, options.volumeScale ?? 1));

    // 1. Settings & Mute checks
    if (!this.settings.masterEnabled || this.settings.masterVolume <= 0) {
      return { played: false, eventId, source: 'skipped', reason: 'muted' };
    }
    if (eventId === 'button_click' && !this.settings.uiClickEnabled && !force) {
      return { played: false, eventId, source: 'skipped', reason: 'ui_click_disabled' };
    }
    // Suppress repetitive sounds during auto-simulation
    if (this.simulationMode && !force) {
      const allowInSim =
        eventId === 'korean_series_champion' ||
        eventId === 'postseason_clinch' ||
        eventId === 'season_transition';
      if (!allowInSim) {
        return { played: false, eventId, source: 'skipped', reason: 'simulation_suppressed' };
      }
    }

    // 2. Do not attempt audio playback before user unlock (unless force preview)
    if (!this.unlocked && !force) {
      return { played: false, eventId, source: 'skipped', reason: 'awaiting_user_gesture' };
    }

    // 3. Cooldown guard against duplicate rapid triggers
    const nowMs = Date.now();
    const cooldownMs = eventId === 'button_click' ? 55 : 180;
    const prevMs = this.lastPlayedAt.get(eventId) ?? 0;
    if (!force && nowMs - prevMs < cooldownMs) {
      return { played: false, eventId, source: 'skipped', reason: 'cooldown' };
    }
    this.lastPlayedAt.set(eventId, nowMs);
    if (eventId !== 'button_click') {
      this.lastMajorEventAt = nowMs;
    }

    // 4. Headless / Node environment check
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.bgmGain || !this.crowdGain) {
      return { played: false, eventId, source: 'skipped', reason: 'no_audio_context' };
    }

    // 5. Enforce concurrency limit
    this.enforceConcurrencyLimit(eventId);

    // 6. Attempt registered MP3/WAV/OGG file first, fallback to Web Audio synth
    const customUrl = this.customAudioFiles.get(eventId);
    if (customUrl && !this.failedFileUrls.has(customUrl)) {
      const cached = this.decodedBufferCache.get(customUrl);
      if (cached) {
        const ok = this.playDecodedBuffer(ctx, eventId, cached, volumeScale);
        if (ok) return { played: true, eventId, source: 'file' };
      } else {
        // Trigger async preload and play synth immediately so zero latency occurs on first hit
        void this.preloadCustomBuffer(ctx, customUrl);
      }
    }

    // 7. Procedural Web Audio API synthesis
    try {
      const ok = this.playSynthesizedEvent(ctx, eventId, volumeScale);
      return ok
        ? { played: true, eventId, source: 'synth' }
        : { played: false, eventId, source: 'skipped', reason: 'synth_error' };
    } catch {
      return { played: false, eventId, source: 'skipped', reason: 'runtime_exception' };
    }
  }

  private async preloadCustomBuffer(ctx: AudioContext, url: string): Promise<void> {
    try {
      if (typeof fetch === 'undefined') {
        this.failedFileUrls.add(url);
        return;
      }
      const res = await fetch(url);
      if (!res.ok) {
        this.failedFileUrls.add(url);
        return;
      }
      const arr = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arr);
      this.decodedBufferCache.set(url, decoded);
    } catch {
      this.failedFileUrls.add(url);
    }
  }

  private playDecodedBuffer(
    ctx: AudioContext,
    eventId: SoundEventId,
    buffer: AudioBuffer,
    volumeScale: number
  ): boolean {
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const env = ctx.createGain();
      env.gain.setValueAtTime(volumeScale, ctx.currentTime);
      src.connect(env);
      const targetBus =
        eventId === 'retirement_ceremony' ? this.bgmGain! : this.sfxGain!;
      env.connect(targetBus);

      const voiceId = `${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const stop = () => {
        try {
          const t = ctx.currentTime;
          env.gain.cancelScheduledValues(t);
          env.gain.setTargetAtTime(0.0001, t, 0.025);
          src.stop(t + 0.08);
        } catch {
          // ignore
        }
      };
      const cleanupTimer = setTimeout(() => {
        this.activeVoices.delete(voiceId);
      }, Math.ceil(buffer.duration * 1000) + 150);

      this.activeVoices.set(voiceId, { id: voiceId, eventId, stop, cleanupTimer });
      src.onended = () => {
        if (this.activeVoices.has(voiceId)) {
          this.disposeVoice(voiceId);
        }
      };
      src.start();
      return true;
    } catch {
      return false;
    }
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const durationSec = 3.2;
    const len = Math.floor(ctx.sampleRate * durationSec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Warm pink-ish noise for natural crowd roar & applause
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.1848) * 0.14));
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private playSynthesizedEvent(
    ctx: AudioContext,
    eventId: SoundEventId,
    volumeScale: number
  ): boolean {
    const now = ctx.currentTime + 0.005;
    const nodes: AudioNode[] = [];
    const sources: Array<OscillatorNode | AudioBufferSourceNode> = [];
    const sfxEnv = ctx.createGain();
    const bgmEnv = ctx.createGain();
    const crowdEnv = ctx.createGain();
    sfxEnv.gain.setValueAtTime(volumeScale, now);
    bgmEnv.gain.setValueAtTime(volumeScale, now);
    crowdEnv.gain.setValueAtTime(volumeScale, now);
    sfxEnv.connect(this.sfxGain!);
    bgmEnv.connect(this.bgmGain!);
    crowdEnv.connect(this.crowdGain!);
    nodes.push(sfxEnv, bgmEnv, crowdEnv);

    const scheduleTone = (params: {
      freq: number;
      endFreq?: number;
      start: number;
      dur: number;
      type?: OscillatorType;
      gain?: number;
      attack?: number;
      bus?: 'sfx' | 'bgm';
      filterHz?: number;
    }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = params.type ?? 'triangle';
      osc.frequency.setValueAtTime(params.freq, now + params.start);
      if (params.endFreq && params.endFreq !== params.freq) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, params.endFreq),
          now + params.start + params.dur
        );
      }

      const peak = params.gain ?? 0.22;
      const atk = Math.min(params.attack ?? 0.015, params.dur * 0.45);
      g.gain.setValueAtTime(0.0001, now + params.start);
      g.gain.linearRampToValueAtTime(peak, now + params.start + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, now + params.start + params.dur);

      let out: AudioNode = osc;
      if (params.filterHz) {
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(params.filterHz, now + params.start);
        osc.connect(flt);
        out = flt;
        nodes.push(flt);
      }
      out.connect(g);
      g.connect(params.bus === 'bgm' ? bgmEnv : sfxEnv);

      osc.start(now + params.start);
      osc.stop(now + params.start + params.dur + 0.03);
      sources.push(osc);
      nodes.push(g);
    };

    const scheduleNoise = (params: {
      start: number;
      dur: number;
      gain: number;
      bandHz: number;
      q?: number;
      filterType?: BiquadFilterType;
      bus?: 'sfx' | 'crowd';
      attack?: number;
    }) => {
      if (params.bus === 'crowd' && !this.settings.crowdEnabled) return;
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer(ctx);
      src.loop = true;

      const flt = ctx.createBiquadFilter();
      flt.type = params.filterType ?? 'bandpass';
      flt.frequency.setValueAtTime(params.bandHz, now + params.start);
      flt.Q.setValueAtTime(params.q ?? 1.2, now + params.start);

      const g = ctx.createGain();
      const atk = Math.min(params.attack ?? 0.06, params.dur * 0.4);
      g.gain.setValueAtTime(0.0001, now + params.start);
      g.gain.linearRampToValueAtTime(params.gain, now + params.start + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, now + params.start + params.dur);

      src.connect(flt);
      flt.connect(g);
      g.connect(params.bus === 'crowd' ? crowdEnv : sfxEnv);

      src.start(now + params.start);
      src.stop(now + params.start + params.dur + 0.04);
      sources.push(src);
      nodes.push(flt, g);
    };

    let totalDurationMs = 1500;

    switch (eventId) {
      case 'button_click': {
        totalDurationMs = 90;
        scheduleTone({ freq: 880, endFreq: 520, start: 0, dur: 0.038, type: 'triangle', gain: 0.14, attack: 0.003 });
        scheduleTone({ freq: 1480, endFreq: 920, start: 0, dur: 0.022, type: 'sine', gain: 0.07, attack: 0.002 });
        break;
      }

      case 'club_select': {
        totalDurationMs = 1950;
        // Deep timpani boom + majestic brass swell (C4-G4-C5-E5)
        scheduleTone({ freq: 110, endFreq: 55, start: 0, dur: 0.55, type: 'sine', gain: 0.34, attack: 0.01 });
        scheduleNoise({ start: 0.0, dur: 0.4, gain: 0.12, bandHz: 260, q: 0.8, filterType: 'lowpass' });
        const chord = [261.63, 392.0, 523.25, 659.25];
        chord.forEach((f, idx) => {
          scheduleTone({
            freq: f,
            start: 0.08 + idx * 0.07,
            dur: 1.45,
            type: 'sawtooth',
            gain: 0.11,
            attack: 0.18,
            filterHz: 1800,
          });
        });
        scheduleTone({ freq: 1046.5, start: 0.45, dur: 1.2, type: 'sine', gain: 0.1, attack: 0.12 });
        break;
      }

      case 'contract_sign': {
        totalDurationMs = 700;
        // Firm rubber stamp thud + crisp confirmation chime
        scheduleTone({ freq: 165, endFreq: 58, start: 0, dur: 0.12, type: 'sine', gain: 0.36, attack: 0.004 });
        scheduleNoise({ start: 0, dur: 0.09, gain: 0.22, bandHz: 520, q: 1.4 });
        scheduleTone({ freq: 587.33, start: 0.12, dur: 0.24, type: 'triangle', gain: 0.18, attack: 0.008 });
        scheduleTone({ freq: 880.0, start: 0.22, dur: 0.42, type: 'triangle', gain: 0.2, attack: 0.01 });
        break;
      }

      case 'rookie_draft': {
        totalDurationMs = 950;
        // Iconic 3-note stadium draft announcement chime (D5 -> F#5 -> A5 -> D6)
        const notes = [587.33, 739.99, 880.0, 1174.66];
        notes.forEach((f, i) => {
          scheduleTone({
            freq: f,
            start: i * 0.13,
            dur: i === notes.length - 1 ? 0.55 : 0.22,
            type: 'triangle',
            gain: i === notes.length - 1 ? 0.22 : 0.17,
            attack: 0.008,
          });
          scheduleTone({
            freq: f * 2,
            start: i * 0.13,
            dur: 0.14,
            type: 'sine',
            gain: 0.05,
            attack: 0.005,
          });
        });
        break;
      }

      case 'opening_day': {
        totalDurationMs = 2500;
        // Floodlight power-up hum + swelling stadium crowd roar + classic ballpark charge organ!
        scheduleTone({ freq: 95, endFreq: 190, start: 0, dur: 0.65, type: 'sawtooth', gain: 0.08, attack: 0.18, filterHz: 420 });
        scheduleNoise({ start: 0.12, dur: 2.25, gain: 0.28, bandHz: 920, q: 0.7, bus: 'crowd', attack: 0.35 });
        scheduleNoise({ start: 0.25, dur: 2.0, gain: 0.16, bandHz: 1850, q: 1.1, bus: 'crowd', attack: 0.4 });
        // Ballpark organ charge motif (G4 C5 E5 G5 - E5 G5!)
        const charge: Array<[number, number, number]> = [
          [392.0, 0.35, 0.14],
          [523.25, 0.50, 0.14],
          [659.25, 0.65, 0.14],
          [783.99, 0.80, 0.32],
          [659.25, 1.16, 0.15],
          [783.99, 1.33, 0.85],
        ];
        charge.forEach(([f, st, d]) => {
          scheduleTone({ freq: f, start: st, dur: d, type: 'sawtooth', gain: 0.13, attack: 0.015, filterHz: 2100 });
          scheduleTone({ freq: f * 0.5, start: st, dur: d, type: 'triangle', gain: 0.09, attack: 0.015 });
        });
        break;
      }

      case 'mega_fa_deal': {
        totalDurationMs = 2300;
        // Document zoom swoosh -> heavy MEGA DEAL stamp slam -> triumph brass fanfare
        scheduleNoise({ start: 0, dur: 0.32, gain: 0.12, bandHz: 1100, q: 1.2 });
        scheduleTone({ freq: 150, endFreq: 48, start: 0.36, dur: 0.22, type: 'sine', gain: 0.42, attack: 0.005 });
        scheduleNoise({ start: 0.36, dur: 0.14, gain: 0.26, bandHz: 460, q: 1.1 });
        const fanfare: Array<[number, number, number]> = [
          [523.25, 0.52, 0.18],
          [659.25, 0.72, 0.18],
          [783.99, 0.92, 0.22],
          [1046.5, 1.16, 0.95],
        ];
        fanfare.forEach(([f, st, d]) => {
          scheduleTone({ freq: f, start: st, dur: d, type: 'sawtooth', gain: 0.13, attack: 0.02, filterHz: 2200 });
          scheduleTone({ freq: f * 0.5, start: st, dur: d, type: 'triangle', gain: 0.11, attack: 0.02 });
        });
        break;
      }

      case 'blockbuster_trade': {
        totalDurationMs = 2200;
        // Urgent TV breaking-news stinger (rapid staccato pulses + bold impact brass)
        const pulses = [0, 0.11, 0.22, 0.33, 0.46];
        pulses.forEach((st, idx) => {
          scheduleTone({
            freq: idx % 2 === 0 ? 740 : 880,
            start: st,
            dur: 0.08,
            type: 'square',
            gain: 0.12,
            attack: 0.004,
            filterHz: 2400,
          });
        });
        scheduleTone({ freq: 130, endFreq: 65, start: 0.58, dur: 0.45, type: 'sine', gain: 0.36, attack: 0.006 });
        scheduleNoise({ start: 0.58, dur: 0.18, gain: 0.2, bandHz: 950, q: 1.0 });
        [293.66, 440.0, 587.33, 880.0].forEach((f) => {
          scheduleTone({ freq: f, start: 0.6, dur: 1.35, type: 'sawtooth', gain: 0.11, attack: 0.03, filterHz: 2000 });
        });
        break;
      }

      case 'manager_change': {
        totalDurationMs = 2200;
        // Heavy solemn tension bass + minor chord swell
        scheduleTone({ freq: 73.42, endFreq: 65.41, start: 0, dur: 1.95, type: 'sine', gain: 0.36, attack: 0.08 });
        scheduleTone({ freq: 146.83, start: 0.05, dur: 1.85, type: 'sawtooth', gain: 0.11, attack: 0.22, filterHz: 520 });
        // D minor tension interval (F3 + A3 + C#4)
        scheduleTone({ freq: 174.61, start: 0.25, dur: 1.65, type: 'triangle', gain: 0.12, attack: 0.25 });
        scheduleTone({ freq: 220.0, start: 0.35, dur: 1.55, type: 'triangle', gain: 0.1, attack: 0.25 });
        scheduleTone({ freq: 277.18, start: 0.5, dur: 1.35, type: 'sine', gain: 0.08, attack: 0.3 });
        break;
      }

      case 'postseason_clinch': {
        totalDurationMs = 2100;
        // Joyful autumn baseball celebration fanfare + crowd cheer
        scheduleNoise({ start: 0.1, dur: 1.85, gain: 0.22, bandHz: 1100, q: 0.75, bus: 'crowd', attack: 0.25 });
        const melody: Array<[number, number, number]> = [
          [523.25, 0.05, 0.16],
          [659.25, 0.22, 0.16],
          [783.99, 0.39, 0.22],
          [1046.5, 0.64, 0.38],
          [880.0, 1.04, 0.18],
          [1046.5, 1.24, 0.72],
        ];
        melody.forEach(([f, st, d]) => {
          scheduleTone({ freq: f, start: st, dur: d, type: 'triangle', gain: 0.18, attack: 0.012 });
          scheduleTone({ freq: f * 0.5, start: st, dur: d, type: 'sawtooth', gain: 0.08, attack: 0.02, filterHz: 1600 });
        });
        break;
      }

      case 'korean_series_champion': {
        totalDurationMs = 2950;
        // Grand Championship Fanfare + Staggered Fireworks + Stadium Crowd Roar
        scheduleNoise({ start: 0.05, dur: 2.8, gain: 0.32, bandHz: 980, q: 0.65, bus: 'crowd', attack: 0.28 });
        scheduleNoise({ start: 0.2, dur: 2.55, gain: 0.18, bandHz: 2100, q: 1.1, bus: 'crowd', attack: 0.35 });

        // Epic brass fanfare (Bb major / C major heroic cadence)
        const ksFanfare: Array<[number, number, number]> = [
          [392.0, 0.04, 0.18],
          [523.25, 0.22, 0.18],
          [659.25, 0.40, 0.18],
          [783.99, 0.58, 0.42],
          [659.25, 1.02, 0.16],
          [783.99, 1.20, 0.22],
          [1046.5, 1.44, 1.25],
        ];
        ksFanfare.forEach(([f, st, d]) => {
          scheduleTone({ freq: f, start: st, dur: d, type: 'sawtooth', gain: 0.14, attack: 0.02, filterHz: 2500 });
          scheduleTone({ freq: f * 0.5, start: st, dur: d, type: 'sawtooth', gain: 0.11, attack: 0.02, filterHz: 1400 });
        });
        // Final majestic chord pad
        [261.63, 329.63, 392.0, 523.25].forEach((f) => {
          scheduleTone({ freq: f, start: 1.44, dur: 1.35, type: 'triangle', gain: 0.11, attack: 0.06 });
        });

        // 3 firework launches + pops + crackle bursts
        [0.45, 1.15, 1.85].forEach((t) => {
          scheduleTone({ freq: 140, endFreq: 42, start: t, dur: 0.28, type: 'sine', gain: 0.34, attack: 0.005 });
          scheduleNoise({ start: t + 0.04, dur: 0.38, gain: 0.24, bandHz: 2600, q: 0.9, filterType: 'highpass', attack: 0.01 });
        });
        break;
      }

      case 'golden_glove': {
        totalDurationMs = 1750;
        // Golden harp arpeggio shimmer + warm ceremonial chord
        const harp = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51, 1567.98];
        harp.forEach((f, idx) => {
          scheduleTone({
            freq: f,
            start: idx * 0.065,
            dur: 0.85,
            type: 'sine',
            gain: 0.14,
            attack: 0.008,
          });
          scheduleTone({
            freq: f * 2,
            start: idx * 0.065,
            dur: 0.35,
            type: 'triangle',
            gain: 0.04,
            attack: 0.005,
          });
        });
        [261.63, 392.0, 493.88].forEach((f) => {
          scheduleTone({ freq: f, start: 0.28, dur: 1.3, type: 'triangle', gain: 0.1, attack: 0.12 });
        });
        break;
      }

      case 'mvp_roy': {
        totalDurationMs = 1950;
        // Spotlight riser + regal horn announcement + crystalline bell
        scheduleNoise({ start: 0, dur: 0.38, gain: 0.12, bandHz: 1500, q: 1.4 });
        const regal: Array<[number, number, number]> = [
          [440.0, 0.18, 0.18],
          [554.37, 0.38, 0.18],
          [659.25, 0.58, 0.24],
          [880.0, 0.84, 0.95],
        ];
        regal.forEach(([f, st, d]) => {
          scheduleTone({ freq: f, start: st, dur: d, type: 'sawtooth', gain: 0.12, attack: 0.02, filterHz: 2200 });
          scheduleTone({ freq: f * 0.5, start: st, dur: d, type: 'triangle', gain: 0.1, attack: 0.02 });
        });
        scheduleTone({ freq: 1760, start: 0.86, dur: 0.85, type: 'sine', gain: 0.09, attack: 0.01 });
        break;
      }

      case 'retirement_ceremony': {
        totalDurationMs = 2950;
        // Gentle nostalgic piano/strings progression on BGM bus + warm applause on crowd bus
        const chords: Array<{ t: number; notes: number[]; dur: number }> = [
          { t: 0.05, notes: [261.63, 329.63, 392.0, 523.25], dur: 1.1 },
          { t: 1.0, notes: [220.0, 329.63, 392.0, 493.88], dur: 1.0 },
          { t: 1.85, notes: [174.61, 261.63, 349.23, 440.0], dur: 1.05 },
        ];
        chords.forEach((c) => {
          c.notes.forEach((f, idx) => {
            scheduleTone({
              freq: f,
              start: c.t + idx * 0.04,
              dur: c.dur,
              type: 'sine',
              gain: 0.11,
              attack: 0.14,
              bus: 'bgm',
            });
          });
        });
        // Warm rhythmic standing ovation applause
        for (let i = 0; i < 10; i++) {
          scheduleNoise({
            start: 0.35 + i * 0.23,
            dur: 0.28,
            gain: 0.14 + (i % 2) * 0.04,
            bandHz: 1450 + (i % 3) * 280,
            q: 1.3,
            bus: 'crowd',
            attack: 0.05,
          });
        }
        break;
      }

      case 'season_transition': {
        totalDurationMs = 1950;
        // Soft atmospheric whoosh + uplifting ascending new-season pad
        scheduleNoise({ start: 0, dur: 0.75, gain: 0.11, bandHz: 880, q: 0.9, attack: 0.18 });
        const rise = [293.66, 369.99, 440.0, 587.33, 739.99];
        rise.forEach((f, idx) => {
          scheduleTone({
            freq: f,
            start: 0.15 + idx * 0.14,
            dur: 1.15,
            type: 'sine',
            gain: 0.12,
            attack: 0.12,
            bus: idx < 2 ? 'bgm' : 'sfx',
          });
        });
        break;
      }
    }

    const voiceId = `${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const stop = () => {
      try {
        const t = ctx.currentTime;
        sfxEnv.gain.cancelScheduledValues(t);
        bgmEnv.gain.cancelScheduledValues(t);
        crowdEnv.gain.cancelScheduledValues(t);
        sfxEnv.gain.setTargetAtTime(0.0001, t, 0.02);
        bgmEnv.gain.setTargetAtTime(0.0001, t, 0.02);
        crowdEnv.gain.setTargetAtTime(0.0001, t, 0.02);
        for (const s of sources) {
          try {
            s.stop(t + 0.07);
          } catch {
            // already stopped
          }
        }
      } catch {
        // ignore stop errors
      }
    };

    const cleanupTimer = setTimeout(() => {
      this.activeVoices.delete(voiceId);
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          // ignore
        }
      }
    }, totalDurationMs + 180);

    this.activeVoices.set(voiceId, { id: voiceId, eventId, stop, cleanupTimer });
    return true;
  }
}

export const audioManager = new AudioManager();
