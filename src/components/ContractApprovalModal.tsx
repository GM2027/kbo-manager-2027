import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import {
  ContractCapPreviewResult,
  formatBillionExactKorean,
  formatManwonKorean,
} from '../engine/salaryCapEngine';

interface ContractApprovalModalProps {
  preview: ContractCapPreviewResult | null;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ContractApprovalModal: React.FC<ContractApprovalModalProps> = ({
  preview,
  confirmLabel = '단장 승인 · 계약 확정',
  onConfirm,
  onCancel,
}) => {
  if (!preview) return null;

  const { before, after, financialCheck } = preview;
  const hasBlockingErrors = financialCheck.blockingErrors.length > 0;
  const afterRoom = Number((after.capBillion - after.teamTop40PayrollBillion).toFixed(4));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contract-approval-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold tracking-wide text-orange-600 dark:text-orange-400">
              계약 사전 심사 · KBO 경쟁균형세(샐러리캡) 영향 분석
            </div>
            <h3
              id="contract-approval-modal-title"
              className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5"
            >
              {preview.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Proposed Contracts Breakdown */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              체결 예정 계약 내역 · 공식 산정 보수
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded divide-y divide-slate-100 dark:divide-slate-800 max-h-40 overflow-y-auto">
              {preview.itemsSummary.map((item, idx) => (
                <div
                  key={`${item.playerName}-${idx}`}
                  className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {item.playerName}{' '}
                      <span className="font-mono-stats font-semibold text-slate-500 dark:text-slate-400">
                        · {item.category} · {item.years}년 총액 {formatBillionExactKorean(item.totalBillion)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.formulaNote}
                    </div>
                  </div>
                  <div className="text-right font-mono-stats shrink-0">
                    <div className="font-extrabold text-slate-900 dark:text-white">
                      {item.includedInDomesticCap
                        ? `산정 ${formatBillionExactKorean(item.countedAavBillion)}`
                        : '캡 산정 제외'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Competitive Balance Tax Before vs After */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3.5 bg-slate-50/70 dark:bg-slate-950/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-slate-900 dark:text-white">
                {after.season}시즌 경쟁균형세 상한액: {formatManwonKorean(after.capManwon)}
              </span>
              {after.floorEnabled && after.floorManwon !== null && (
                <span className="font-mono-stats text-[11px] text-slate-600 dark:text-slate-300">
                  하한액 {formatManwonKorean(after.floorManwon)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">상위 40인 공식 보수</div>
                <div className="mt-1 font-mono-stats font-extrabold text-sm text-slate-900 dark:text-white">
                  {before.teamTop40PayrollBillion.toFixed(2)}억 → {after.teamTop40PayrollBillion.toFixed(2)}억
                </div>
                <div
                  className={`text-[11px] font-mono-stats mt-0.5 font-semibold ${
                    preview.deltaPayrollBillion > 0
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  변동 {preview.deltaPayrollBillion >= 0 ? '+' : ''}
                  {preview.deltaPayrollBillion.toFixed(2)}억 원
                </div>
              </div>

              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">상한 초과 예상액</div>
                <div
                  className={`mt-1 font-mono-stats font-extrabold text-sm ${
                    after.overCapBillion > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {after.overCapBillion > 0
                    ? `+${formatBillionExactKorean(after.overCapBillion)}`
                    : `여유 ${formatBillionExactKorean(Math.max(0, afterRoom))}`}
                </div>
                <div className="text-[11px] font-mono-stats text-slate-500 dark:text-slate-400 mt-0.5">
                  {after.overCapBillion > 0
                    ? `연속 ${after.exceedCount}회차 (${after.luxuryTaxRatePct}% 구간)`
                    : '연속 초과 횟수 0회 초기화'}
                </div>
              </div>

              <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">시즌 종료 시 예상 제재금</div>
                <div
                  className={`mt-1 font-mono-stats font-extrabold text-sm ${
                    after.luxuryTaxBillion > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {before.luxuryTaxBillion.toFixed(2)}억 → {after.luxuryTaxBillion.toFixed(2)}억
                </div>
                <div className="text-[11px] font-mono-stats text-slate-500 dark:text-slate-400 mt-0.5">
                  제재금 변동 {preview.deltaLuxuryTaxBillion >= 0 ? '+' : ''}
                  {preview.deltaLuxuryTaxBillion.toFixed(2)}억 원
                </div>
              </div>
            </div>

            {preview.willExceedCap && (
              <div className="p-2.5 rounded border border-amber-500/50 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <div className="font-bold">
                    {preview.willTriggerDraftPenalty
                      ? '3년 연속 샐러리캡 초과 경고: 초과액의 100% 제재금 + 차기 신인 드래프트 1라운드 지명순위 9단계 하락'
                      : `샐러리캡 ${after.exceedCount}회 연속 초과 예상 (${after.luxuryTaxRatePct}% 제재금 · 시즌 종료 후 최종 연봉 총액 확정 시 1회 정산)`}
                  </div>
                  <div className="text-[11px] opacity-90">
                    상한 초과만으로 계약이 자동 취소되지 않으며, 단장 승인 시 정상 체결됩니다.
                  </div>
                </div>
              </div>
            )}

            {after.floorEnabled && after.underFloorBillion > 0 && (
              <div className="p-2.5 rounded border border-sky-500/40 bg-sky-50/70 dark:bg-sky-950/30 text-sky-900 dark:text-sky-200 text-[11px]">
                <strong>하한액 미달 안내:</strong> 계약 반영 후에도 {after.season}시즌 하한액(
                {after.floorManwon !== null ? formatManwonKorean(after.floorManwon) : '-'}) 대비{' '}
                <strong className="font-mono-stats">{formatBillionExactKorean(after.underFloorBillion)}</strong> 부족합니다
                (예상 하한 제재금 {formatBillionExactKorean(after.floorPenaltyBillion)}).
              </div>
            )}
          </div>

          {/* Separate Mandatory Financial & Compliance Check */}
          <div
            className={`border rounded-md p-3.5 space-y-2 ${
              hasBlockingErrors
                ? 'border-rose-500/60 bg-rose-50/70 dark:bg-rose-950/30'
                : 'border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-extrabold">
                {hasBlockingErrors ? (
                  <>
                    <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <span className="text-rose-700 dark:text-rose-300">
                      구단 재정 · 필수 규정 별도 검사 실패 (승인 불가)
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-800 dark:text-emerald-300">
                      구단 재정 · 필수 규정 별도 검사 통과
                    </span>
                  </>
                )}
              </div>
              <span className="font-mono-stats text-[11px] text-slate-600 dark:text-slate-300">
                즉시 집행액 {financialCheck.cashRequiredBillion.toFixed(2)}억
                {financialCheck.currentCashBillion !== null
                  ? ` · 잔액 ${financialCheck.currentCashBillion.toFixed(2)}억 → ${financialCheck.cashAfterBillion?.toFixed(2)}억`
                  : ' · 미지급 장부 기장'}
              </span>
            </div>

            {hasBlockingErrors && (
              <ul className="space-y-1 text-rose-700 dark:text-rose-300 font-semibold">
                {financialCheck.blockingErrors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            )}

            {financialCheck.advisoryWarnings.length > 0 && (
              <ul className="space-y-1 text-slate-700 dark:text-slate-300 text-[11px]">
                {financialCheck.advisoryWarnings.map((warn, i) => (
                  <li key={i}>• {warn}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/70 dark:bg-slate-950/50">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            취소
          </button>
          <button
            type="button"
            disabled={hasBlockingErrors}
            onClick={onConfirm}
            className={`px-4 py-2 rounded text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors ${
              hasBlockingErrors
                ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                : preview.willExceedCap
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
