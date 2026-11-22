// Soru Takibi › öğrencinin haftalık panosu (Aşama 354b: ayrı parça, yalnız gerekince yüklenir)
import { Calendar, Users, Download, TrendingUp, TrendingDown, ChevronDown, RotateCcw, BarChart3, CalendarDays, CheckCircle2, AlertCircle, Award, Target, BookOpen } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine, LabelList } from 'recharts';
import { dataService } from '../../../services/dataService';
import { targetPeriodText, ownerText } from '../TargetListParts';
import { TargetSummaryTable } from '../../Student/TargetSummaryTable';
import { PlanWallGrid } from '../../Student/StudentTargetCards';
import { shortTurkishDate, TargetLineLabel, WeeklyChartLegend, CHART_BAR_CURSOR, CHART_LINE_CURSOR, CHART_COLORS } from '../../Student/soruModulu/ortak';
import { downloadWeeklyPDF } from '../../../utils/questionAnalytics';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function HaftalikPano() {
  const { setSelectedStudentId, activeStudent, activeClass, classStudents, activeAnalysisMode, chartVisualType, setChartVisualType, weekOffset, setWeekOffset, setIsWeekModalOpen, isNarrow, activeLogs, isPraisedForDate, handleOpenPraiseModal, currentWeekStartDate, activeTargets, activeWeeklyTarget, planWall, hidePlanRow, myActiveTarget, dailyQuestionTarget, openEditTarget, handleOpenStudentTargetModal, weeklyAnalytics, weeklyTargetTotal, weeklyTargetSolved, weeklyTargetCompletionRate, renderLookerTooltip } = useSoruTakibiBaglam();
  if (!activeStudent) return null; // ana dosya bu panoyu yalnız öğrenci seçiliyken çizer
  return (
    <>
      {activeAnalysisMode === 'weekly' && weeklyAnalytics && (
            <div className="space-y-6">
              {/* Hafta Gezinme ve Öğrenci Kimlik Kartı */}
              <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Açılır Pencere ile Hafta Seçimi (İleri / Geri Tuşları Yerine Açılır Pencere) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    id="btn-open-week-picker-modal"
                    type="button"
                    onClick={() => setIsWeekModalOpen(true)}
                    className="group flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-surface-2 hover:bg-brand-soft/60 border border-line-strong hover:border-brand rounded-2xl transition shadow-xs cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-brand/20"
                    title="Geçmiş haftaları ve çözülen soruları görüntülemek için açılır pencereyi açın"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-brand-soft/80 group-hover:bg-brand-hover text-brand-fg group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-2xs font-extrabold text-brand-fg uppercase tracking-wider">
                          {weekOffset === 0 ? 'Güncel Dönem' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
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
                      <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
                        <span className="hidden xs:inline text-muted font-medium">İncelenen Hafta:</span>
                        <span className="text-fg underline decoration-brand/60 decoration-2 underline-offset-2">
                          {weeklyAnalytics.weekLabel}
                        </span>
                      </h3>
                    </div>
                    <div className="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-line text-subtle group-hover:text-brand-fg flex items-center gap-1 text-xs font-semibold shrink-0">
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-brand-fg md:text-subtle" />
                    </div>
                  </button>

                  {weekOffset !== 0 && (
                    <button
                      id="btn-reset-current-week"
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      className="ui-btn ui-btn-sm bg-brand-soft hover:bg-brand-soft border border-brand/30 text-brand-fg"
                      title="Bugünün güncel haftasına dön"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Güncel Haftaya Dön</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  {activeClass && (
                    <button
                      type="button"
                      onClick={() => setSelectedStudentId('')}
                      className="ui-btn ui-btn-sm bg-surface-2 hover:bg-brand-soft hover:border-brand/30 text-fg-2 hover:text-brand-fg border border-line"
                      title="Sınıfın bütün öğrencilerini ve başarı sıralamasını gör"
                    >
                      <Users className="w-3.5 h-3.5 text-brand-fg" />
                      <span>Tüm sınıf ({classStudents.length})</span>
                    </button>
                  )}
                  <div className="flex items-center gap-3 bg-surface-2 px-4 py-2 rounded-xl border border-line">
                    <div className="w-8 h-8 rounded-full bg-fg text-brand-fg flex items-center justify-center font-bold text-xs border border-brand/20">
                      {activeStudent.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-fg block">{activeStudent.name}</span>
                      {activeStudent.className && (
                        <span className="text-2xs text-subtle block">{activeStudent.className}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* LOOKER STUDIO EXECUTIVE KPI SCORECARDS (TEMİZ BEYAZ & GECE MAVİSİ & TURUNCU) */}
              {/* ========================================================================= */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Toplam Çözülen Soru & İlerleme */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Haftalık Toplam Soru</span>
                    <span className="p-1.5 rounded-lg bg-surface-2 text-fg">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-fg tracking-tight">
                      {weeklyAnalytics.totalQuestions}
                    </span>
                    <span className="text-xs font-semibold text-muted">Soru</span>
                  </div>

                  {/* Deltası */}
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
                    {weeklyAnalytics.weeklyDifference >= 0 ? (
                      <span className="text-success-fg bg-success-soft px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        +{weeklyAnalytics.weeklyDifference} soru {weeklyAnalytics.previousWeekTotal > 0 ? `(+%${weeklyAnalytics.weeklyGrowthRate})` : '(önceki hafta kayıt yok)'}
                      </span>
                    ) : (
                      <span className="text-danger-fg bg-danger-soft px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" />
                        {weeklyAnalytics.weeklyDifference} soru (%{weeklyAnalytics.weeklyGrowthRate})
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    Önceki Hafta: <strong className="text-fg-2">{weeklyAnalytics.previousWeekTotal} soru</strong>
                  </div>
                </div>

                {/* 2. Soru hedefi (Aşama 10: hedefin kendi tarihleri ve dersi sayılır) */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow" id="active-target-card">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span>Soru Hedefi</span>
                      {activeWeeklyTarget && (
                        <span className="text-3xs font-bold px-1.5 py-px rounded bg-success-soft text-success-fg truncate">
                          {activeWeeklyTarget.subject || 'Tüm dersler'}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenStudentTargetModal(activeStudent)}
                      className="p-1 rounded-lg bg-brand-soft text-brand-fg transition-colors cursor-pointer"
                      title={myActiveTarget ? 'Hedefimi düzenle' : 'Hedef ver'}
                      aria-label={myActiveTarget ? 'Hedefimi düzenle' : 'Hedef ver'}
                    >
                      <Target className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-brand-fg tracking-tight">%{weeklyTargetCompletionRate}</span>
                    <span className="text-xs font-semibold text-muted">
                      {weeklyTargetSolved} / {weeklyTargetTotal} Soru
                    </span>
                  </div>
                  <div className="w-full bg-surface-2 rounded-full h-2 mt-3 overflow-hidden">
                    <div className="bg-brand h-2 rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, weeklyTargetCompletionRate)}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-muted space-y-0.5">
                    {activeWeeklyTarget ? (
                      <>
                        <div>
                          {targetPeriodText(activeWeeklyTarget)} · Veren: <strong className="text-fg-2">{ownerText(activeWeeklyTarget)}</strong>
                        </div>
                        <div>
                          {weeklyTargetSolved >= weeklyTargetTotal ? (
                            <span className="text-success-fg font-bold">✓ Tamamlandı</span>
                          ) : (
                            <span className="text-brand-fg font-semibold">{weeklyTargetTotal - weeklyTargetSolved} soru kaldı</span>
                          )}
                        </div>
                        {activeTargets.length > 1 && (
                          <div id="other-targets-note">
                            +{activeTargets.length - 1} hedef daha:{' '}
                            {activeTargets
                              .slice(1)
                              .map((t) => `${ownerText(t)} (${t.subject || 'Tüm dersler'}, ${t.targetQuestions})`)
                              .join(', ')}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex justify-between items-center">
                        <span>Bu hafta hedef yok (varsayılan: günde 50 soru)</span>
                        <button type="button" onClick={() => handleOpenStudentTargetModal(activeStudent)} className="ui-link text-2xs">
                          Hedef ver
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Çalışma Disiplini & Soru Çözülmeyen Günler */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Çalışma Disiplini</span>
                    <span className="p-1.5 rounded-lg bg-surface-2 text-fg">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-fg tracking-tight">
                      {weeklyAnalytics.solvedDaysCount}
                      <span className="text-base text-subtle font-semibold"> / 7 Gün</span>
                    </span>
                  </div>

                  {/* Soru Çözülmeyen Günler Rozeti */}
                  <div className="mt-3">
                    {weeklyAnalytics.unsolvedDaysCount > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-soft text-brand-fg border border-brand/30 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-brand-fg" />
                          {weeklyAnalytics.unsolvedDaysCount} Gün Çözülmedi
                        </span>
                        <span className="text-2xs text-muted font-medium">
                          ({weeklyAnalytics.unsolvedDays.join(', ')})
                        </span>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-success-soft text-success-fg border border-success/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-success-fg" />
                        7 Gün Kesintisiz Çalışma
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    Haftalık Devamlılık Oranı: <strong className="text-fg-2">%{Math.round((weeklyAnalytics.solvedDaysCount / 7) * 100)}</strong>
                  </div>
                </div>

                {/* 4. Öğrenci Başarı Durumu & Doğruluk Oranı
                    Aşama 67: öğrencinin haftalık planı varsa duvarın yeri ve boyu korunur, içinde "Haftalık soru dağılımı" gösterilir
                    (ders ders haftalık soru, çözülen ve dolan çubuk). Plan yoksa eski başarı / doğruluk bilgisi görünür. */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow min-w-0">
                  {planWall.walls.length > 0 ? (
                    (() => {
                      const wTotal = planWall.weekly.reduce((a, x) => a + x.target, 0);
                      const wSolved = planWall.weekly.reduce((a, x) => a + x.solved, 0);
                      const wPct = wTotal ? Math.min(100, Math.round((wSolved / wTotal) * 100)) : 0;
                      return (
                        <div id="teacher-plan-week-summary" data-testid="plan-week-summary">
                          <div className="flex items-center justify-between text-muted text-xs font-semibold">
                            <span>Haftalık soru dağılımı</span>
                            <span className="p-1.5 rounded-lg bg-brand-soft text-brand-fg">
                              <Award className="w-4 h-4" />
                            </span>
                          </div>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-3xl font-bold text-fg tracking-tight tabular-nums">{wSolved}</span>
                            <span className="text-xs font-semibold text-muted">/ {wTotal} soru · %{wPct}</span>
                          </div>
                          <div className="w-full bg-surface-2 rounded-full h-2 mt-3 overflow-hidden">
                            <div className={`h-2 rounded-full transition-[width] duration-500 ${wPct >= 100 ? 'bg-success' : 'bg-brand'}`} style={{ width: `${wPct}%` }} />
                          </div>
                          <ul className="mt-2 space-y-0.5 max-h-24 overflow-y-auto pr-1 text-xs">
                            {planWall.weekly.map((w) => {
                              const ok = w.solved >= w.target;
                              return (
                                <li key={w.subject} className="flex items-center justify-between gap-2">
                                  <span className={`truncate font-semibold ${ok ? 'text-success-fg' : 'text-fg-2'}`}>{w.subject}</span>
                                  <span className={`shrink-0 tabular-nums ${ok ? 'text-success-fg font-bold' : 'text-muted'}`}>
                                    {w.solved}/<strong className={ok ? '' : 'text-fg'}>{w.target}</strong>
                                    {ok ? ' ✓' : ''}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })()
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-muted text-xs font-semibold">
                        <span>Başarı & Doğruluk Oranı</span>
                        <span className="p-1.5 rounded-lg bg-brand-soft text-brand-fg">
                          <Award className="w-4 h-4" />
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-bold text-fg tracking-tight">
                          %{weeklyAnalytics.accuracyPercentage}
                        </span>
                        <span className="text-xs font-semibold text-muted">Net Başarı</span>
                      </div>

                      <div className="mt-3 flex items-center gap-1.5">
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-fg text-surface">
                          {weeklyAnalytics.statusAssessment.badgeText}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-muted flex gap-2">
                        <span className="text-success-fg font-semibold">D: {weeklyAnalytics.totalCorrect}</span>
                        <span className="text-danger-fg font-semibold">Y: {weeklyAnalytics.totalWrong}</span>
                        <span className="text-muted">B: {weeklyAnalytics.totalEmpty}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Aşama 30: bu haftaya denk gelen BÜTÜN hedefler (öğrenci + sınıf) tek tabloda.
                  Eskiden her hedef ayrı kart + ayrı gün gün tablo olarak gösteriliyordu. */}
              {/* Aşama 66: gün gün duvarlar (plandaki dersler, sayfalar, o günün soru sayısı, dolan çubuk) */}
              {activeStudent && planWall.walls.length > 0 && <PlanWallGrid data={planWall} id="teacher-plan-day-walls" ghost />}
              {/* Aşama 74: gün duvarları varken "Soru hedefleri" tablosu gösterilmez (aynı bilgiler duvarlarda) */}
              {activeStudent && activeTargets.length > 0 && planWall.walls.length === 0 && (
                <TargetSummaryTable
                  targets={activeTargets}
                  studentId={activeStudent.id}
                  logs={activeLogs}
                  weekStart={currentWeekStartDate}
                  onEditTarget={openEditTarget}
                  hideTarget={planWall.walls.length > 0 ? hidePlanRow : undefined}
                />
              )}

              {/* ========================================================================= */}
              {/* GOOGLE LOOKER STUDIO ANA GRAFİĞİ (HAFİF GRİ ARKA PLAN, KOYU GRİ METİNLER) */}
              {/* ========================================================================= */}
              <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
                {/* Chart Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-fg tracking-tight">
                        Günlük Soru Çözüm ve Hedef Dağılım Grafiği
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-fg text-surface">
                        {weeklyAnalytics.studentName}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      Dönem: {weeklyAnalytics.weekLabel} • Sütun tepelerinde net soru sayıları ve kesikli günlük hedef çizgisi
                    </p>
                  </div>

                  {/* Chart Type & Legend Switcher */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Legend */}
                    <WeeklyChartLegend targetText={`Günlük hedef (${dailyQuestionTarget})`} mode={chartVisualType} />

                    {/* Chart Mode Buttons */}
                    <div className="ui-seg" role="group" aria-label="Grafik türü">
                      <button
                        type="button"
                        onClick={() => setChartVisualType('bar')}
                        className="ui-seg-btn" aria-pressed={chartVisualType === 'bar'}
                      >
                        Sütun Grafiği
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartVisualType('area')}
                        className="ui-seg-btn" aria-pressed={chartVisualType === 'area'}
                      >
                        Trend & Alan
                      </button>
                    </div>
                  </div>
                </div>

                {/* Chart Plot Area with Light Gray Background */}
                <div className="h-80 w-full bg-surface-2 rounded-xl p-3 border border-line">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartVisualType === 'bar' ? (
                      <BarChart
                        data={weeklyAnalytics.days}
                        margin={{ top: 28, right: isNarrow ? 6 : 15, left: isNarrow ? -22 : -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                        <XAxis
                          dataKey={isNarrow ? 'dayShortName' : 'dayName'}
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
                          domain={[0, (max: number) => Math.max(max, dailyQuestionTarget) + Math.ceil(dailyQuestionTarget * 0.25)]}
                          allowDecimals={false}
                        />
                        <Tooltip content={renderLookerTooltip} cursor={CHART_BAR_CURSOR} />

                        {/* Canlı Turuncu Hedef Referans Çizgisi */}
                        <ReferenceLine
                          y={dailyQuestionTarget}
                          stroke={CHART_COLORS.target}
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={<TargetLineLabel text={`Hedef: ${dailyQuestionTarget} Soru`} />}
                        />

                        {/* Sütun Çizimi ve Tepede Net Değerler (LabelList) */}
                        <Bar
                          dataKey="totalQuestions"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={55}
                          minPointSize={4}
                        >
                          {/* Sütunların üzerine net sayıları yazdır */}
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
                            // Gece mavisi (#1e3a8a), hedefe ulaştıysa lacivert, 0 ise belirgin turuncu/rose
                            const isZero = entry.totalQuestions === 0;
                            const isAboveTarget = entry.totalQuestions >= dailyQuestionTarget;
                            return (
                              <Cell
                                key={`cell-looker-${index}`}
                                fill={isZero ? CHART_COLORS.zero : isAboveTarget ? CHART_COLORS.met : CHART_COLORS.below}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    ) : (
                      <AreaChart
                        data={weeklyAnalytics.days}
                        margin={{ top: 28, right: isNarrow ? 6 : 15, left: isNarrow ? -22 : -10, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient id="lookerNavyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                        <XAxis
                          dataKey={isNarrow ? 'dayShortName' : 'dayName'}
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
                          domain={[0, (max: number) => Math.max(max, dailyQuestionTarget) + Math.ceil(dailyQuestionTarget * 0.25)]}
                          allowDecimals={false}
                        />
                        <Tooltip content={renderLookerTooltip} cursor={CHART_LINE_CURSOR} />

                        <ReferenceLine
                          y={dailyQuestionTarget}
                          stroke={CHART_COLORS.target}
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={<TargetLineLabel text={`Hedef: ${dailyQuestionTarget} Soru`} />}
                        />

                        <Area
                          type="monotone"
                          dataKey="totalQuestions"
                          stroke="var(--chart-1)"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#lookerNavyGradient)"
                          dot={{ r: 5, fill: 'var(--color-brand)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                          activeDot={{ r: 7, fill: 'var(--color-brand)' }}
                        >
                          <LabelList
                            dataKey="totalQuestions"
                            position="top"
                            fill="var(--color-fg)"
                            fontSize={12}
                            fontWeight={800}
                            offset={8}
                          />
                        </Area>
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* KURS BİTİRME ORANLARI & DERS DAĞILIMI & YAZILI VERİ TABLOSU               */}
              {/* ========================================================================= */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sol / 2 Kolon: Yazılı Looker Studio Veri Tablosu */}
                <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-line">
                    <div>
                      <h4 className="text-sm font-bold text-fg">
                        Günlük Soru Çözüm ve Başarı Tablosu
                      </h4>
                      <p className="text-xs text-muted">
                        Öğrenci: <strong className="text-fg">{weeklyAnalytics.studentName}</strong> • {weeklyAnalytics.className}
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-surface-2 text-fg-2 border border-line">
                      7 Günlük Detay
                    </span>
                  </div>

                  <p className="xl:hidden mb-2 text-xs text-muted" data-testid="table-scroll-hint">
                    Tablo sığmazsa yana kaydırabilirsiniz →
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                        <tr>
                          <th className="px-2.5 py-2.5">Gün</th>
                          <th className="px-2.5 py-2.5">Tarih</th>
                          <th className="px-2.5 py-2.5 text-center">Çözülen Soru</th>
                          <th className="px-2.5 py-2.5">Ders Dağılımı</th>
                          <th className="px-2.5 py-2.5 text-center">Hedef Durumu</th>
                          <th className="px-2.5 py-2.5 text-center">Durum</th>
                          <th className="px-2.5 py-2.5 text-center">Öğretmen Tebriki</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {weeklyAnalytics.days.map((d) => {
                          const metTarget = d.totalQuestions >= dailyQuestionTarget;
                          const completionRate = Math.min(100, Math.round((d.totalQuestions / dailyQuestionTarget) * 100));
                          const praised = isPraisedForDate(d.dateStr);

                          return (
                            <tr key={d.dateStr} className="hover:bg-surface-2 transition-colors">
                              <td className="px-2.5 py-2.5 font-bold text-fg">{d.dayName}</td>
                              <td className="px-2.5 py-2.5 text-muted whitespace-nowrap">{shortTurkishDate(d.dateStr)}</td>
                              <td className="px-2.5 py-2.5 text-center">
                                <span className="font-extrabold text-fg text-sm">
                                  {d.totalQuestions}
                                </span>
                              </td>
                              <td className="px-2.5 py-2.5 text-muted min-w-[130px] max-w-[220px] whitespace-normal break-words">
                                {d.subjectsText || <span className="text-subtle italic">Ders kaydı yok</span>}
                              </td>
                              <td className="px-2.5 py-2.5 text-center">
                                <div className="inline-flex items-center gap-1.5">
                                  <div className="w-12 bg-surface-3 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full ${metTarget ? 'bg-success' : 'bg-brand'}`}
                                      style={{ width: `${completionRate}%` }}
                                    />
                                  </div>
                                  <span className="text-2xs font-bold text-muted">%{completionRate}</span>
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 text-center">
                                {d.hasSolved ? (
                                  metTarget ? (
                                    <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-2xs font-bold bg-success-soft text-success-fg border border-success/30">
                                      Hedef Tamamlandı
                                    </span>
                                  ) : (
                                    <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-2xs font-bold bg-info-soft text-info-fg border border-info/30">
                                      Kısmi Çözüm
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-2xs font-bold bg-danger-soft text-danger-fg border border-danger/30">
                                    0 Soru ⚠️
                                  </span>
                                )}
                              </td>
                              <td className="px-2.5 py-2.5 text-center">
                                {d.totalQuestions > 0 ? (
                                  praised ? (
                                    <span className="inline-flex whitespace-nowrap items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-warning-soft text-warning-fg border border-warning/30 shadow-2xs">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-warning-fg" />
                                      <span>Tebrik Edildi ✓</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenPraiseModal(d)}
                                      className="ui-btn ui-btn-sm ui-btn-secondary"
                                      title={`${activeStudent?.name} öğrencisine ${d.dayName} günü çözdüğü ${d.totalQuestions} soru için tebrik ve aferin mesajı gönder`}
                                    >
                                      <Award className="w-3.5 h-3.5" />
                                      <span>Tebrik Et ⭐</span>
                                    </button>
                                  )
                                ) : (
                                  <span className="text-subtle text-xs italic">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sağ / 1 Kolon: Kurs / Ders Bitirme Oranları & Pedagojik Rapor */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-line">
                      <BookOpen className="w-4 h-4 text-brand-fg" />
                      <h4 className="text-sm font-bold text-fg">
                        Derslere Göre Soru Dağılımı
                      </h4>
                    </div>

                    {/* Ders Bazlı İlerleme Çubukları */}
                    {weeklyAnalytics.subjectBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {weeklyAnalytics.subjectBreakdown.map((sub, i) => {
                          return (
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
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted italic">Bu hafta henüz ders bazında soru kaydedilmedi.</p>
                    )}

                    {/* Pedagojik Değerlendirme Raporu */}
                    <div className="mt-5 p-3.5 bg-surface-2 rounded-xl border border-line text-xs text-fg-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                        <Award className="w-3.5 h-3.5 text-brand-fg" />
                        <span>Rehberlik & Başarı Analizi</span>
                      </div>
                      <p className="leading-relaxed text-muted">
                        {weeklyAnalytics.statusAssessment.reportSummary}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-line">
                    <button
                      onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent, { logs: activeLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                      className="ui-btn ui-btn-sm bg-fg hover:bg-fg text-surface shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-brand-fg" />
                      <span>Haftalık Raporu PDF İndir</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </>
  );
}
export default HaftalikPano;
