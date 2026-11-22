// Öğrenci soru modülü › haftalık pano (Aşama 354c: ayrı parça, yalnız gerekince yüklenir)
import { Plus, Calendar, Download, BookOpen, ChevronLeft, ChevronRight, Award, ChevronDown, RotateCcw } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList } from 'recharts';
import { dataService } from '../../../services/dataService';
import { StudentTargetCards } from '../StudentTargetCards';
import { downloadWeeklyPDF } from '../../../utils/questionAnalytics';
import { targetDayStatusText, weekGoalLegendText, type TargetDayRow } from '../../../utils/targetDays';
import { shortTurkishDate, CELL_LABEL, CHART_ANIMATE, CHART_BAR_CURSOR, CHART_LINE_CURSOR, CHART_COLORS, WeeklyChartLegend } from './ortak';
import { useSoruModuluBaglam } from './useSoruModulu';

export function HaftalikSoruPanosu() {
  const { activeStudent, activeTab, chartsReady, chartVisualType, setChartVisualType, todayIso, isNarrow, shortDayLabels, weekOffset, setWeekOffset, setIsWeekModalOpen, allLogs, openTodayEntry, weeklyAnalytics, canGoPreviousWeek, canGoNextWeek, handlePreviousWeek, handleNextWeek, activeTargets, dailyQuestionTarget, generalTargetRes, subjectTargetRows, dayGoalRow, dayGoal, chartDays, maxDayGoal, yAxisWidth, CHART_MARGIN, renderLookerTooltip } = useSoruModuluBaglam();
  return (
    <>
      {activeTab === 'weekly' && weeklyAnalytics && (
        <div className="space-y-6">
          {/* Hafta Gezinme */}
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePreviousWeek}
                disabled={!canGoPreviousWeek}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoPreviousWeek
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoPreviousWeek ? 'Önceki Soru Çözülen Hafta' : 'Daha Eski Kayıtlı Hafta Yok'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                id="btn-student-open-week-picker"
                type="button"
                onClick={() => setIsWeekModalOpen(true)}
                className="group flex items-center gap-3 px-3.5 py-2 bg-surface-2 hover:bg-brand-soft/60 border border-line-strong hover:border-brand rounded-2xl transition shadow-xs cursor-pointer text-left"
                title="Geçmiş haftaları görüntülemek için tıklayın"
              >
                <div className="w-8 h-8 rounded-xl bg-brand-soft/80 group-hover:bg-brand-hover text-brand-fg group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-2xs font-bold text-brand-fg uppercase tracking-wider block">
                      {weekOffset === 0 ? 'Güncel Hafta' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
                    </span>
                    {weekOffset !== 0 ? (
                      <span className="text-3xs font-bold bg-warning-soft text-warning-fg border border-warning/30 px-1.5 py-0.2 rounded-lg">
                        Geçmiş Hafta
                      </span>
                    ) : (
                      <span className="text-3xs font-bold bg-success-soft text-success-fg border border-success/30 px-1.5 py-0.2 rounded-lg">
                        Aktif Hafta
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1">
                    <span className="text-muted font-medium">Haftalık İnceleme:</span>
                    <span className="text-fg underline decoration-brand/60 decoration-2 underline-offset-2">
                      {weeklyAnalytics.weekLabel}
                    </span>
                  </h3>
                </div>
                <div className="ml-1 pl-2 border-l border-line text-subtle group-hover:text-brand-fg flex items-center gap-1 text-xs font-semibold shrink-0">
                  <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-brand-fg" />
                </div>
              </button>

              <button
                type="button"
                onClick={handleNextWeek}
                disabled={!canGoNextWeek}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoNextWeek
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoNextWeek ? 'Sonraki Soru Çözülen Hafta' : 'Daha Yeni Hafta Yok'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="ui-btn ui-btn-sm ui-btn-secondary min-w-24"
                  title="Güncel Haftaya Dön"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Güncel Hafta</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openTodayEntry}
                className="ui-btn ui-btn-sm ui-btn-primary min-w-24"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Bugünün Sorularını Ekle</span>
              </button>
            </div>
          </div>

          {/* Öğretmenlerin verdiği soru hedefleri */}
          {/* Gün gün döküm kartların içinde değil, aşağıdaki birleşik günlük tabloda gösterilir */}
          <StudentTargetCards targets={activeTargets} studentId={activeStudent.id} logs={allLogs} hideDailyBreakdown />

          {/* Ana Grafik */}
          <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm" id="student-weekly-chart">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
              <div>
                <h4 className="text-base font-bold text-fg tracking-tight">
                  Günlük Soru Çözüm ve Hedef Dağılım Grafiği
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <WeeklyChartLegend
                  targetText={weekGoalLegendText(chartDays.map((d) => d.dayTarget || 0))}
                  mode={chartVisualType}
                  showNoTarget={chartDays.some((d) => !d.dayTarget && d.totalQuestions > 0)}
                />

                <div className="ui-seg" role="group">
                  <button
                    type="button"
                    onClick={() => setChartVisualType('bar')}
                    className="ui-seg-btn" aria-pressed={chartVisualType === 'bar'}
                  >
                    Sütun
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartVisualType('area')}
                    className="ui-seg-btn" aria-pressed={chartVisualType === 'area'}
                  >
                    Trend
                  </button>
                </div>
              </div>
            </div>

            <div className="h-72 sm:h-80 w-full bg-surface-2 rounded-xl p-2 sm:p-3 border border-line">
              {chartsReady && (
              <ResponsiveContainer width="100%" height="100%">
                {chartVisualType === 'bar' ? (
                  <ComposedChart
                    data={chartDays}
                    margin={CHART_MARGIN}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey={shortDayLabels ? 'dayShortName' : 'dayName'}
                      interval={0}
                      stroke="var(--color-muted)"
                      fontSize={isNarrow ? 10 : 12}
                      fontWeight={600}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-line-strong)' }}
                    />
                    <YAxis
                      stroke="var(--color-muted)"
                      fontSize={isNarrow ? 10 : 12}
                      fontWeight={600}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-line-strong)' }}
                      domain={[0, (max: number) => { const top = Math.max(max, maxDayGoal, 1); return top + Math.max(2, Math.ceil(top * 0.15)); }]}
                      width={yAxisWidth}
                      allowDecimals={false}
                    />
                    <Tooltip content={renderLookerTooltip} cursor={CHART_BAR_CURSOR} />
                    <Bar dataKey="totalQuestions" radius={[6, 6, 0, 0]} maxBarSize={55} minPointSize={4} isAnimationActive={CHART_ANIMATE}>
                      <LabelList
                        dataKey="totalQuestions"
                        position="top"
                        fill="var(--color-fg)"
                        fontSize={isNarrow ? 10 : 12}
                        fontWeight={800}
                        offset={6}
                        formatter={(val: unknown) => String(Number(val) || 0)}
                      />
                      {weeklyAnalytics.days.map((entry, index) => {
                        const isZero = entry.totalQuestions === 0;
                        const g = dayGoal(entry.dateStr);
                        const noTarget = g <= 0; // öğretmen bu güne hedef vermedi
                        const isAboveTarget = !noTarget && entry.totalQuestions >= g;
                        return (
                          <Cell
                            key={`cell-student-${index}`}
                            fill={isZero ? CHART_COLORS.zero : noTarget ? CHART_COLORS.noTarget : isAboveTarget ? CHART_COLORS.met : CHART_COLORS.below}
                          />
                        );
                      })}
                    </Bar>
                    {/* Günlük hedef: yalnızca hedef verilen günlerde (gün gün farklı olabilir) */}
                    <Line
                      type="linear"
                      dataKey="dayTarget"
                      name="Günlük hedef"
                      stroke={CHART_COLORS.target}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      connectNulls={false}
                      dot={{ r: 4, fill: CHART_COLORS.target, stroke: 'var(--color-surface)', strokeWidth: 1.5 }}
                      activeDot={{ r: 5, fill: CHART_COLORS.target }}
                      isAnimationActive={false}
                      legendType="none"
                    />
                  </ComposedChart>
                ) : (
                  <ComposedChart
                    data={chartDays}
                    margin={CHART_MARGIN}
                  >
                    <defs>
                      <linearGradient id="studentNavyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey={shortDayLabels ? 'dayShortName' : 'dayName'}
                      interval={0}
                      stroke="var(--color-muted)"
                      fontSize={isNarrow ? 10 : 12}
                      fontWeight={600}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-line-strong)' }}
                    />
                    <YAxis
                      stroke="var(--color-muted)"
                      fontSize={isNarrow ? 10 : 12}
                      fontWeight={600}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-line-strong)' }}
                      domain={[0, (max: number) => { const top = Math.max(max, maxDayGoal, 1); return top + Math.max(2, Math.ceil(top * 0.15)); }]}
                      width={yAxisWidth}
                      allowDecimals={false}
                    />
                    <Tooltip content={renderLookerTooltip} cursor={CHART_LINE_CURSOR} />
                    <Area
                      type="monotone"
                      dataKey="totalQuestions"
                      stroke="var(--chart-1)"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#studentNavyGradient)"
                      dot={{ r: 5, fill: 'var(--chart-1)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                      isAnimationActive={CHART_ANIMATE}
                    >
                      <LabelList
                        dataKey="totalQuestions"
                        position="top"
                        fill="var(--color-fg)"
                        fontSize={isNarrow ? 10 : 12}
                        fontWeight={800}
                        offset={8}
                      />
                    </Area>
                    {/* Günlük hedef: yalnızca hedef verilen günlerde (gün gün farklı olabilir) */}
                    <Line
                      type="linear"
                      dataKey="dayTarget"
                      name="Günlük hedef"
                      stroke={CHART_COLORS.target}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      connectNulls={false}
                      dot={{ r: 4, fill: CHART_COLORS.target, stroke: 'var(--color-surface)', strokeWidth: 1.5 }}
                      activeDot={{ r: 5, fill: CHART_COLORS.target }}
                      isAnimationActive={false}
                      legendType="none"
                    />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Günlük Veri Tablosu ve Ders Dağılımı */}
          {/* Aşama 65: tablo sayfanın tam genişliğinde (7 sütun sığsın); ders dağılımı kutusu altında */}
          <div className="grid grid-cols-1 gap-6">
            <div className="min-w-0 bg-surface border border-line rounded-2xl p-4 sm:p-5 shadow-sm">
              {/* Birleşik tablo: eski "Günlük Soru Çözüm ve Başarı Tablosu" + soru hedefi kartlarındaki "Gün gün durum" tablosu */}
              <h4 className="text-sm font-bold text-fg mb-1">Günlük Soru Çözüm, Hedef ve Başarı Tablosu</h4>
              <p className="text-xs text-muted mb-4 pb-2 border-b border-line" id="merged-daily-table-summary">
                {generalTargetRes
                  ? `${generalTargetRes.elapsedDays ? `${generalTargetRes.metDays}/${generalTargetRes.elapsedDays} günde genel hedef tuttu` : 'Henüz geçen gün yok'}${
                      generalTargetRes.flexible ? ' · Öğretmen soruları günlere farklı dağıttı' : ''
                    }`
                  : activeTargets.length
                    ? 'Ders hedeflerinin günlük durumu "Günlük Hedef" sütunundadır.'
                    : 'Bu hafta soru hedefi verilmedi; hedef sütunları boş görünür.'}
              </p>
              <div className="md:overflow-x-auto">
                <table className="w-full text-left text-xs max-md:block" id="merged-daily-table">
                  <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line max-md:hidden">
                    <tr>
                      <th className="px-2 lg:px-3 py-2.5">Gün</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">Çözülen</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">D / Y</th>
                      <th className="px-2 lg:px-3 py-2.5">Ders Dağılımı</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">Günlük Hedef</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">Hedef Durumu</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line max-md:block max-md:divide-y-0 max-md:space-y-2">
                    {weeklyAnalytics.days.map((d) => {
                      const goalRow = dayGoalRow(d.dateStr);
                      const goal = dayGoal(d.dateStr);
                      const isFuture = d.dateStr > todayIso;
                      const isToday = d.dateStr === todayIso;
                      const hasGoal = goal > 0; // bu güne hedef verilmiş mi
                      const metTarget = hasGoal && d.totalQuestions >= goal;
                      const completionRate = hasGoal ? Math.min(100, Math.round((d.totalQuestions / goal) * 100)) : 0;
                      // Ders hedefleri (ör. yalnızca Matematik) — o güne denk gelenler
                      const subjectLines = subjectTargetRows
                        .map(({ t, res }) => {
                          const r = res.rows.find((x) => x.ymd === d.dateStr);
                          return r ? { label: t.subject as string, r } : null;
                        })
                        .filter((x): x is { label: string; r: TargetDayRow } => !!x && x.r.target > 0);
                      // Durum: genel hedef varsa onun gün durumu, yoksa çözülen soruya göre
                      let statusText: string;
                      let statusCls: string;
                      if (goalRow) {
                        statusText = targetDayStatusText(goalRow, generalTargetRes?.daily || dailyQuestionTarget);
                        statusCls =
                          goalRow.status === 'met'
                            ? 'bg-success-soft text-success-fg border-success/30'
                            : goalRow.status === 'partial'
                              ? 'bg-info-soft text-info-fg border-info/30'
                              : goalRow.status === 'none'
                                ? 'bg-danger-soft text-danger-fg border-danger/30'
                                : 'bg-surface-2 text-muted border-line';
                      } else if (!hasGoal) {
                        statusText = isFuture ? 'Henüz gelmedi' : d.hasSolved ? `Hedef yok · ${d.totalQuestions} soru` : 'Hedef verilmedi';
                        statusCls = 'bg-surface-2 text-muted border-line';
                      } else if (isFuture) {
                        statusText = 'Henüz gelmedi';
                        statusCls = 'bg-surface-2 text-muted border-line';
                      } else if (d.hasSolved) {
                        statusText = metTarget ? 'Hedef Tamamlandı' : isToday ? `Bugün · ${goal - d.totalQuestions} kaldı` : 'Kısmi Çözüm';
                        statusCls = metTarget
                          ? 'bg-success-soft text-success-fg border-success/30'
                          : 'bg-info-soft text-info-fg border-info/30';
                      } else {
                        statusText = isToday ? 'Bugün · henüz girilmedi' : '0 Soru ⚠️';
                        statusCls = isToday
                          ? 'bg-surface-2 text-muted border-line'
                          : 'bg-danger-soft text-danger-fg border-danger/30';
                      }
                      return (
                        <tr
                          key={d.dateStr}
                          data-testid="merged-daily-row"
                          className={`hover:bg-surface-2 transition-colors max-md:block max-md:rounded-xl max-md:border max-md:border-line max-md:px-3 max-md:py-2 ${isToday ? 'bg-brand-soft/40' : ''}`}
                        >
                          <td className="px-2 lg:px-3 py-2.5 whitespace-nowrap max-md:block max-md:px-0 max-md:pt-0 max-md:pb-1.5 max-md:mb-1 max-md:border-b max-md:border-line">
                            <span className="font-bold text-fg">{d.dayName}</span>
                            <span className="block text-xs text-muted">
                              {shortTurkishDate(d.dateStr)}
                              {isToday ? ' · bugün' : ''}
                            </span>
                          </td>
                          <td data-label="Çözülen" className={`px-2 lg:px-3 py-2.5 text-center ${CELL_LABEL}`}>
                            <span className="font-extrabold text-fg text-sm">{isFuture && !d.hasSolved ? '—' : d.totalQuestions}</span>
                          </td>
                          <td data-label="Doğru / Yanlış" className={`px-2 lg:px-3 py-2.5 text-center whitespace-nowrap ${CELL_LABEL}`}>
                            {d.totalCorrect || d.totalWrong ? (
                              <span>
                                <span className="font-bold text-success-fg">{d.totalCorrect}</span>
                                <span className="text-muted"> / </span>
                                <span className="font-bold text-danger-fg">{d.totalWrong}</span>
                              </span>
                            ) : (
                              <span className="text-subtle">—</span>
                            )}
                          </td>
                          <td data-label="Ders dağılımı" className={`px-2 lg:px-3 py-2.5 text-muted min-w-[8rem] whitespace-normal break-words ${CELL_LABEL}`}>
                            {d.subjectsText || <span className="text-subtle italic">Ders kaydı yok</span>}
                          </td>
                          <td data-label="Günlük hedef" className={`px-2 lg:px-3 py-2.5 text-center ${CELL_LABEL}`}>
                            <div>
                            <span className="font-extrabold text-fg">{goal > 0 ? goal : '—'}</span>
                            {goal <= 0 && <span className="block text-2xs text-muted">hedef yok</span>}
                            {subjectLines.map(({ label, r }) => (
                              <span
                                key={label}
                                className={`block text-2xs font-semibold leading-snug ${
                                  r.status === 'met' ? 'text-success-fg' : r.status === 'future' ? 'text-muted' : 'text-brand-fg'
                                }`}
                                title={`${label} hedefi`}
                              >
                                {label}: {r.status === 'future' ? '—' : r.solved}/{r.target}
                                {r.status === 'met' ? ' ✓' : ''}
                              </span>
                            ))}
                            </div>
                          </td>
                          <td data-label="Hedef durumu" className={`px-2 lg:px-3 py-2.5 text-center ${CELL_LABEL}`}>
                            <div className="inline-flex items-center gap-1.5">
                              <div className="w-12 bg-surface-3 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${metTarget ? 'bg-success' : 'bg-brand'}`}
                                  style={{ width: `${isFuture && !d.hasSolved ? 0 : completionRate}%` }}
                                />
                              </div>
                              <span className="text-2xs font-bold text-muted">{hasGoal ? `%${isFuture && !d.hasSolved ? 0 : completionRate}` : '—'}</span>
                            </div>
                          </td>
                          <td data-label="Durum" className={`px-2 lg:px-3 py-2.5 text-center ${CELL_LABEL}`}>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-2xs font-bold leading-tight border ${statusCls}`}>
                              {statusText}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <h4 className="text-sm font-bold text-fg mb-3 pb-2 border-b border-line flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-brand-fg" />
                  Derslere Göre Soru Dağılımı
                </h4>
                {weeklyAnalytics.subjectBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {weeklyAnalytics.subjectBreakdown.map((sub, i) => (
                      <div key={sub.subject} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-fg">{sub.subject}</span>
                          <span className="font-bold text-brand-fg">
                            {sub.count} Soru (%{sub.percentage})
                          </span>
                        </div>
                        <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${
                              i === 0 ? 'bg-fg' : i === 1 ? 'bg-brand' : 'bg-[var(--chart-1)]'
                            }`}
                            style={{ width: `${sub.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted italic">Bu hafta henüz ders bazında soru kaydedilmedi.</p>
                )}

                <div className="mt-5 p-3.5 bg-surface-2 rounded-xl border border-line text-xs text-fg-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <Award className="w-3.5 h-3.5 text-brand-fg" />
                    <span>Haftalık Rehberlik Tavsiyesi</span>
                  </div>
                  <p className="leading-relaxed text-muted">
                    {weeklyAnalytics.statusAssessment.reportSummary}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-line">
                <button
                  onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent, { logs: allLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                  className="ui-btn ui-btn-sm bg-fg hover:bg-fg text-surface shadow-sm min-w-24"
                >
                  <Download className="w-3.5 h-3.5 text-brand-fg" />
                  <span>Haftalık Raporumu İndir</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
export default HaftalikSoruPanosu;
