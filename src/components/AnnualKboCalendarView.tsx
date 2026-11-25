import React, { useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  FastForward,
  FileSpreadsheet,
  Info,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import {
  advanceGameDateByDays,
  getActivePeriodInfo,
  getAnnualKboCalendarEvents,
} from '../engine/calendarEngine';
import { getCurrentCareerDate } from '../engine/salaryCapEngine';
import { validateScheduleIntegrity } from '../engine/schedule';
import {
  applyImportedOfficialSchedule,
  parseOfficialScheduleCsv,
  parseOfficialScheduleJson,
  parseOfficialScheduleXlsx,
} from '../engine/scheduleImporter';
import { CareerSave } from '../types/kbo';

interface AnnualKboCalendarViewProps {
  career: CareerSave;
  onUpdateCareer?: (next: CareerSave, backup?: CareerSave) => void;
  onNotify?: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

const RULE_TAG_STYLES: Record<string, string> = {
  '공식 KBO 규정': 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  '공식 KBO 2027 개정': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  '공식 KBO 일정': 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  '게임 운영 규칙': 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
};

export const AnnualKboCalendarView: React.FC<AnnualKboCalendarViewProps> = ({
  career,
  onUpdateCareer,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>('ALL');
  const [importBusy, setImportBusy] = useState(false);

  const dateInfo = getCurrentCareerDate(career);
  const activePeriod = getActivePeriodInfo(dateInfo.isoDate, career.season);
  const events = useMemo(() => getAnnualKboCalendarEvents(career), [career]);
  const validation = useMemo(() => validateScheduleIntegrity(career.schedule), [career.schedule]);

  const filteredEvents =
    selectedMonth === 'ALL' ? events : events.filter((e) => e.month === selectedMonth);

  const handleManualAdvanceDays = (days: number) => {
    if (!onUpdateCareer) return;
    if (career.phase === 'REGULAR_SEASON' || career.phase === 'POSTSEASON') {
      onNotify?.(
        '정규시즌·포스트시즌 중에는 경기 시뮬레이션 버튼으로 날짜가 진행됩니다. (자동 진행 금지)',
        'info'
      );
      return;
    }
    const { nextCareer, eventsTriggered } = advanceGameDateByDays(career, days);
    onUpdateCareer(nextCareer, career);
    const nextDate = getCurrentCareerDate(nextCareer).displayDate;
    onNotify?.(
      eventsTriggered.length > 0
        ? `게임 날짜가 ${nextDate}로 진행되었습니다. (${eventsTriggered.slice(0, 2).join(' · ')})`
        : `게임 날짜가 ${nextDate}로 진행되었습니다.`,
      'success'
    );
  };

  const handleScheduleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateCareer) return;
    setImportBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      let rows;
      let format: 'XLSX' | 'CSV' | 'JSON' = 'JSON';
      if (ext === 'xlsx') {
        format = 'XLSX';
        const buf = await file.arrayBuffer();
        rows = await parseOfficialScheduleXlsx(buf);
      } else if (ext === 'csv') {
        format = 'CSV';
        const text = await file.text();
        rows = parseOfficialScheduleCsv(text);
      } else {
        format = 'JSON';
        const text = await file.text();
        rows = parseOfficialScheduleJson(text);
      }

      const { nextCareer, importedGames, preservedPlayedGames } = applyImportedOfficialSchedule(
        career,
        rows,
        { fileName: file.name, format }
      );
      onUpdateCareer(nextCareer, career);
      onNotify?.(
        `KBO 공식 일정(${format}) 반영 완료! 신규 ${importedGames}경기 편성 · 기진행 ${preservedPlayedGames}경기 보존`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : '공식 일정 파일을 불러오는 중 오류가 발생했습니다.',
        'error'
      );
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isOfficial = career.scheduleSource === 'OFFICIAL';

  return (
    <div className="space-y-4">
      {/* 상단 요약 카드: 내부 게임 날짜 + 활동기간 + 공식/예상 일정 상태 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              게임 내부 공식 날짜 (실제 날짜 분리)
            </span>
            <CalendarClock className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-xl font-black font-mono-stats text-slate-900 dark:text-white">
            {dateInfo.koreanFullDate}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                activePeriod.isActive
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
              }`}
            >
              {activePeriod.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{activePeriod.ruleNote}</p>

          {career.phase !== 'REGULAR_SEASON' && career.phase !== 'POSTSEASON' && onUpdateCareer && (
            <div className="pt-2 flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleManualAdvanceDays(1)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold team-accent-btn cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>+1일 진행</span>
              </button>
              <button
                type="button"
                onClick={() => handleManualAdvanceDays(7)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>+7일 진행 (FA 자동 연동)</span>
              </button>
            </div>
          )}
        </div>

        {/* 일정 출처 & 무결성 검증 */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              정규시즌 일정 유형 & 검증
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                isOfficial
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
              }`}
            >
              {isOfficial ? '공식 일정 (KBO Official)' : '예상 일정 (게임 생성)'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60">
              <div className="text-[10px] text-slate-500">리그 총 경기</div>
              <div className="font-bold font-mono-stats">{validation.totalLeagueGames}G (팀당 144G)</div>
            </div>
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60">
              <div className="text-[10px] text-slate-500">상대별 경기</div>
              <div className="font-bold font-mono-stats">
                {validation.minOpponentGames}~{validation.maxOpponentGames}G (기준 16G)
              </div>
            </div>
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60">
              <div className="text-[10px] text-slate-500">월요일 정규경기</div>
              <div className="font-bold font-mono-stats">
                {validation.mondayGamesCount}건 (원칙적 휴식)
              </div>
            </div>
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60">
              <div className="text-[10px] text-slate-500">동일일자 중복</div>
              <div className="font-bold font-mono-stats text-emerald-600 dark:text-emerald-400">
                {validation.duplicateDateConflicts}건
              </div>
            </div>
          </div>
          {career.officialScheduleMeta && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                반영 파일: {career.officialScheduleMeta.fileName} ({career.officialScheduleMeta.format})
              </span>
            </div>
          )}
        </div>

        {/* 공식 일정 가져오기 (XLSX / CSV / JSON) */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 flex flex-col justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>KBO 공식 일정 가져오기 (XLSX · CSV · JSON)</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              KBO 공식 일정이 발표되면 파일을 업로드해 최우선 반영할 수 있습니다. 이미 진행한 경기 결과는 절대 변경되지 않습니다.
            </p>
            <div className="text-[10px] font-mono-stats text-slate-500 bg-slate-100 dark:bg-slate-800/70 rounded px-2 py-1">
              열 형식: date(날짜), away(원정팀), home(홈팀)
            </div>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.json"
              onChange={handleScheduleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={importBusy || !onUpdateCareer}
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{importBusy ? '일정 분석 중...' : '공식 일정 파일 불러오기'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2027 개정 규정 요약 배너 */}
      <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
          <Info className="w-4 h-4 shrink-0" />
          <span>{career.season}시즌 적용 핵심 규정</span>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-emerald-500/20">
            최저연봉: <strong>{career.season >= 2027 ? '3,300만 원 (2027 개정)' : '3,000만 원'}</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-emerald-500/20">
            참가활동기간: <strong>1월 25일 ~ 11월 23일</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-emerald-500/20">
            당해 신인 드래프트: <strong>{career.draftClassYear ?? career.season + 1} 신인 드래프트 (9월)</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-emerald-500/20">
            사용자 승인 없는 자동 날짜·경기 진행: <strong>금지</strong>
          </span>
        </div>
      </div>

      {/* 월별 필터 + 연간 KBO 캘린더 타임라인 */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {career.season} KBO 연간 공식 캘린더 · 주요 이벤트 & 마감일
            </h3>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setSelectedMonth('ALL')}
              className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                selectedMonth === 'ALL'
                  ? 'team-accent-bg'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              전체
            </button>
            {[1, 2, 3, 5, 7, 8, 9, 10, 11, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMonth(m)}
                className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                  selectedMonth === m
                    ? 'team-accent-bg'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {filteredEvents.map((ev) => {
            const isPast = ev.date < dateInfo.isoDate;
            const isToday = ev.date === dateInfo.isoDate;
            return (
              <div
                key={ev.id}
                className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  isToday ? 'bg-orange-500/10 -mx-2 px-2 rounded-md' : ''
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-24 shrink-0 font-mono-stats text-xs font-bold text-slate-700 dark:text-slate-300">
                    <div>{ev.date}</div>
                    {ev.endDate && (
                      <div className="text-[10px] text-slate-400">~ {ev.endDate.slice(5)}</div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ev.isMajorDeadline && (
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      )}
                      <span
                        className={`text-xs font-bold ${
                          isPast
                            ? 'text-slate-400 dark:text-slate-500 line-through'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {ev.title}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          RULE_TAG_STYLES[ev.ruleTag] ?? ''
                        }`}
                      >
                        {ev.ruleTag}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      {ev.description}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-[11px] font-bold">
                  {isToday ? (
                    <span className="px-2 py-0.5 rounded bg-orange-500 text-white">오늘</span>
                  ) : isPast ? (
                    <span className="text-slate-400">완료/경과</span>
                  ) : (
                    <span className="text-sky-600 dark:text-sky-400">예정</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
