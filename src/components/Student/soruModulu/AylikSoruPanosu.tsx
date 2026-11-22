// Öğrenci soru modülü › aylık pano (Aşama 354c: ayrı parça, yalnız gerekince yüklenir)
import { ChevronLeft, ChevronRight, CalendarDays, ChevronDown, RotateCcw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts';
import { DEFAULT_DAILY_QUESTION_TARGET, CHART_ANIMATE, CHART_BAR_CURSOR, MonthlyBucketTooltip } from './ortak';
import { useSoruModuluBaglam } from './useSoruModulu';

export function AylikSoruPanosu() {
  const { activeTab, chartsReady, isNarrow, monthDate, setMonthDate, setIsMonthModalOpen, monthlyAnalytics, canGoPreviousMonth, canGoNextMonth, handlePreviousMonth, handleNextMonth, monthlyPlan, monthlyTargetTotal, monthlyTargetCompletionRate } = useSoruModuluBaglam();
  return (
    <>
      {activeTab === 'monthly' && monthlyAnalytics && (
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePreviousMonth}
                disabled={!canGoPreviousMonth}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoPreviousMonth
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoPreviousMonth ? 'Önceki Soru Çözülen Ay' : 'Daha Eski Kayıtlı Ay Yok'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                id="btn-student-open-month-picker"
                type="button"
                onClick={() => setIsMonthModalOpen(true)}
                className="group flex items-center gap-3 px-3.5 py-2 bg-surface-2 hover:bg-brand-soft/60 border border-line-strong hover:border-brand rounded-2xl transition shadow-xs cursor-pointer text-left"
                title="Geçmiş ayları görüntülemek için tıklayın"
              >
                <div className="w-8 h-8 rounded-xl bg-brand-soft/80 group-hover:bg-brand-hover text-brand-fg group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-2xs font-bold text-brand-fg uppercase tracking-wider block">
                      {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth()
                        ? 'Güncel Ay'
                        : 'Geçmiş Dönem'}
                    </span>
                    {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth() ? (
                      <span className="text-3xs font-bold bg-success-soft text-success-fg border border-success/30 px-1.5 py-0.2 rounded-lg">
                        Aktif Ay
                      </span>
                    ) : (
                      <span className="text-3xs font-bold bg-warning-soft text-warning-fg border border-warning/30 px-1.5 py-0.2 rounded-lg">
                        Geçmiş Ay
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1">
                    <span className="text-muted font-medium">Analiz Ayı:</span>
                    <span className="text-fg underline decoration-brand/60 decoration-2 underline-offset-2">
                      {monthlyAnalytics.monthLabel}
                    </span>
                  </h3>
                </div>
                <div className="ml-1 pl-2 border-l border-line text-subtle group-hover:text-brand-fg flex items-center gap-1 text-xs font-semibold shrink-0">
                  <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-brand-fg" />
                </div>
              </button>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={!canGoNextMonth}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoNextMonth
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoNextMonth ? 'Sonraki Soru Çözülen Ay' : 'Daha Yeni Ay Yok'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setMonthDate({ year: now.getFullYear(), month: now.getMonth() });
                  }}
                  className="ui-btn ui-btn-sm ui-btn-secondary min-w-24"
                  title="Güncel Aya Dön"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Güncel Ay</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Aylık Toplam Soru</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-fg">{monthlyAnalytics.totalQuestions}</span>
                <span className="text-xs font-semibold text-muted">Soru</span>
              </div>
              <div className="mt-3 text-xs text-muted">
                Haftalık Ortalama: <strong className="text-fg">{monthlyAnalytics.weeklyAverage} soru</strong>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Aylık Hedef Bitirme</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-brand-fg">%{monthlyTargetCompletionRate}</span>
                <span className="text-xs font-semibold text-muted">Tamamlandı</span>
              </div>
              <div className="w-full bg-surface-2 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-brand h-2 rounded-full"
                  style={{ width: `${Math.min(100, monthlyTargetCompletionRate)}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-muted">
                Aylık Hedef: <strong>{monthlyTargetTotal} Soru</strong>
                <span className="block text-2xs text-subtle">
                  {monthlyPlan.hasGeneralTarget ? 'Genel hedeflerin günlük sayısı × ayın günleri' : `Genel hedef yok: günde ${DEFAULT_DAILY_QUESTION_TARGET} × ${monthlyPlan.days} gün`}
                </span>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Aktif Çalışma Günleri</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-fg">{monthlyAnalytics.activeDaysCount}</span>
                <span className="text-xs font-semibold text-muted">Gün</span>
              </div>
              <div className="mt-3 text-xs text-muted">
                Aylık Düzenlilik: <strong className="text-fg">%{Math.round((monthlyAnalytics.activeDaysCount / monthlyPlan.days) * 100)}</strong>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Geçmiş Aya Göre Gelişim</span>
              <div className="flex items-baseline gap-2 mt-2">
                {monthlyAnalytics.monthlyDifference >= 0 ? (
                  <span className="text-2xl font-bold text-success-fg">+{monthlyAnalytics.monthlyDifference} Soru</span>
                ) : (
                  <span className="text-2xl font-bold text-danger-fg">{monthlyAnalytics.monthlyDifference} Soru</span>
                )}
              </div>
              <div className="mt-3 text-xs text-muted">
                Önceki Ay: <strong className="text-fg">{monthlyAnalytics.previousMonthTotal} soru</strong>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm" id="student-monthly-chart">
            <h4 className="text-base font-bold text-fg tracking-tight mb-4">
              Aylık Hafta Bazında Soru Çözüm Grafiği
            </h4>
            <div className="h-72 sm:h-80 w-full bg-surface-2 rounded-xl p-2 sm:p-3 border border-line">
              {chartsReady && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAnalytics.weeks} margin={{ top: 25, right: isNarrow ? 10 : 18, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                  <XAxis
                    dataKey="weekLabel"
                    interval={0}
                    tickFormatter={(v: string) => (isNarrow ? String(v).replace(/\s*\(.*\)$/, '').replace('Hafta', 'Hf.') : String(v))}
                    stroke="var(--color-muted)"
                    fontSize={isNarrow ? 10 : 11}
                    fontWeight={600}
                    tickLine={false}
                  />
                  <YAxis stroke="var(--color-muted)" fontSize={isNarrow ? 10 : 12} fontWeight={600} tickLine={false} allowDecimals={false} width={String(Math.max(1, ...monthlyAnalytics.weeks.map((w) => Number(w.totalQuestions) || 0))).length * (isNarrow ? 6.5 : 7.5) + (isNarrow ? 12 : 16)} />
                  <Tooltip content={<MonthlyBucketTooltip plan={monthlyPlan} />} cursor={CHART_BAR_CURSOR} />
                  <Bar dataKey="totalQuestions" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={60} isAnimationActive={CHART_ANIMATE}>
                    <LabelList dataKey="totalQuestions" position="top" fill="var(--color-fg)" fontSize={isNarrow ? 10 : 12} fontWeight={800} offset={8} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
export default AylikSoruPanosu;
