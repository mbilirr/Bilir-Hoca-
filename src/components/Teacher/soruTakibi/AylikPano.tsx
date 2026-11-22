// Soru Takibi › öğrencinin aylık panosu (Aşama 354b: ayrı parça, yalnız gerekince yüklenir)
import { Calendar, Users, Download, ChevronDown, RotateCcw, BarChart3, CalendarDays, Award, Target, BookOpen } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts';
import { dataService } from '../../../services/dataService';
import { MonthlyBucketTooltip, CHART_BAR_CURSOR } from '../../Student/StudentQuestionModule';
import { downloadMonthlyPDF } from '../../../utils/questionAnalytics';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function AylikPano() {
  const { setSelectedStudentId, activeStudent, activeClass, classStudents, activeAnalysisMode, monthDate, setMonthDate, setIsMonthModalOpen, isNarrow, activeLogs, monthlyAnalytics, monthlyPlan, monthlyTargetTotal, monthlyTargetCompletionRate } = useSoruTakibiBaglam();
  if (!activeStudent) return null; // ana dosya bu panoyu yalnız öğrenci seçiliyken çizer
  return (
    <>
      {activeAnalysisMode === 'monthly' && monthlyAnalytics && (
            <div className="space-y-6">
              {/* Ay Gezinme ve Öğrenci Kimlik Kartı */}
              <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Açılır Pencere ile Ay Seçimi (İleri / Geri Tuşları Yerine Açılır Pencere) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    id="btn-open-month-picker-modal"
                    type="button"
                    onClick={() => setIsMonthModalOpen(true)}
                    className="group flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-surface-2 hover:bg-brand-soft/60 border border-line-strong hover:border-brand rounded-2xl transition shadow-xs cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-brand/20"
                    title="Geçmiş ayları ve çözülen soruları görüntülemek için açılır pencereyi açın"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-brand-soft/80 group-hover:bg-brand-hover text-brand-fg group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-2xs font-extrabold text-brand-fg uppercase tracking-wider">
                          Aylık İnceleme Dönemi
                        </span>
                        {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth() ? (
                          <span className="text-3xs font-bold bg-success-soft text-success-fg border border-success/30 px-1.5 py-0.2 rounded-lg">
                            Aktif Ay
                          </span>
                        ) : (
                          <span className="text-3xs font-bold bg-warning-soft text-warning-fg border border-warning/30 px-1.5 py-0.2 rounded-lg">
                            Geçmiş Dönem
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
                        <span className="hidden xs:inline text-muted font-medium">Analiz Ayı:</span>
                        <span className="text-fg underline decoration-brand/60 decoration-2 underline-offset-2">
                          {monthlyAnalytics.monthLabel}
                        </span>
                      </h3>
                    </div>
                    <div className="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-line text-subtle group-hover:text-brand-fg flex items-center gap-1 text-xs font-semibold shrink-0">
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-brand-fg md:text-subtle" />
                    </div>
                  </button>

                  {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                    <button
                      id="btn-reset-current-month"
                      type="button"
                      onClick={() => setMonthDate({ year: new Date().getFullYear(), month: new Date().getMonth() })}
                      className="ui-btn ui-btn-sm bg-brand-soft hover:bg-brand-soft border border-brand/30 text-brand-fg"
                      title="Güncel aya dön"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Güncel Aya Dön</span>
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

              {/* Aylık Executive KPI Scorecards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Ayda Çözülen Toplam Soru */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Aylık Toplam Soru</span>
                    <span className="p-1.5 rounded-lg bg-surface-2 text-fg">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-fg tracking-tight">
                      {monthlyAnalytics.totalQuestions}
                    </span>
                    <span className="text-xs font-semibold text-muted">Soru</span>
                  </div>
                  <div className="mt-3 text-xs text-muted">
                    Haftalık Ortalama: <strong className="text-fg">{monthlyAnalytics.weeklyAverage} soru</strong>
                  </div>
                </div>

                {/* 2. Aylık Hedef Tamamlama Oranı */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Aylık Müfredat Hedefi</span>
                    <span className="p-1.5 rounded-lg bg-brand-soft text-brand-fg">
                      <Target className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-brand-fg tracking-tight">
                      %{monthlyTargetCompletionRate}
                    </span>
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
                      {monthlyPlan.hasGeneralTarget ? 'Genel hedeflerin günlük sayısı × ayın günleri' : `Genel hedef yok: günde 50 × ${monthlyPlan.days} gün`}
                    </span>
                  </div>
                </div>

                {/* 3. Aktif Soru Çözülen Günler */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Aktif Çalışma Günleri</span>
                    <span className="p-1.5 rounded-lg bg-surface-2 text-fg">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-fg tracking-tight">
                      {monthlyAnalytics.activeDaysCount}
                      <span className="text-base text-subtle font-semibold"> Gün</span>
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-muted">
                    Aylık Düzenlilik: <strong className="text-fg">%{Math.round((monthlyAnalytics.activeDaysCount / monthlyPlan.days) * 100)}</strong>
                  </div>
                </div>

                {/* 4. Geçmiş Aya Göre İlerleme Durumu */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Geçmiş Aya Göre Gelişim</span>
                    <span className="p-1.5 rounded-lg bg-brand-soft text-brand-fg">
                      <Award className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    {monthlyAnalytics.monthlyDifference >= 0 ? (
                      <span className="text-2xl font-bold text-success-fg">
                        +{monthlyAnalytics.monthlyDifference} Soru
                      </span>
                    ) : (
                      <span className="text-2xl font-bold text-danger-fg">
                        {monthlyAnalytics.monthlyDifference} Soru
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-muted">
                    Önceki Ay: <strong className="text-fg">{monthlyAnalytics.previousMonthTotal} soru</strong> {monthlyAnalytics.previousMonthTotal > 0 ? `(${monthlyAnalytics.monthlyGrowthRate >= 0 ? '+' : ''}%${monthlyAnalytics.monthlyGrowthRate})` : ''}
                  </div>
                </div>
              </div>

              {/* Aylık Hafta Bazında Soru Çözüm Grafiği */}
              <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
                  <div>
                    <h4 className="text-base font-bold text-fg tracking-tight">
                      Aylık Hafta Bazında Soru Çözüm ve Başarı Grafiği
                    </h4>
                    <p className="text-xs text-muted mt-0.5">
                      {monthlyAnalytics.monthLabel} ayı süresince haftalık toplam çözülen soru sayıları
                    </p>
                  </div>
                </div>

                <div className="h-80 w-full bg-surface-2 rounded-xl p-3 border border-line">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyAnalytics.weeks}
                      margin={{ top: 25, right: 15, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                      <XAxis
                        dataKey="weekLabel"
                        interval={0}
                        tickFormatter={(v: string) => (isNarrow ? String(v).replace(/\s*\(.*\)$/, '').replace('Hafta', 'Hf.') : String(v))}
                        stroke="var(--color-muted)"
                        fontSize={isNarrow ? 10 : 11}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-line-strong)' }}
                      />
                      <YAxis
                        stroke="var(--color-muted)"
                        fontSize={12}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-line-strong)' }}
                      />
                      <Tooltip content={<MonthlyBucketTooltip plan={monthlyPlan} />} cursor={CHART_BAR_CURSOR} />
                      <Bar
                        dataKey="totalQuestions"
                        fill="var(--chart-1)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={60}
                      >
                        <LabelList
                          dataKey="totalQuestions"
                          position="top"
                          fill="var(--color-fg)"
                          fontSize={12}
                          fontWeight={800}
                          offset={8}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Aylık Veri Tablosu & Ders Dağılımı */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-fg mb-3 pb-2 border-b border-line">
                    Haftalık Soru Çözüm Dökümü Tablosu
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                        <tr>
                          <th className="px-3.5 py-2.5">Hafta / Tarih Aralığı</th>
                          <th className="px-3.5 py-2.5 text-center">Haftalık Soru Sayısı</th>
                          <th className="px-3.5 py-2.5 text-center">Aktif Gün</th>
                          <th className="px-3.5 py-2.5">Ağırlıklı Ders</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {monthlyAnalytics.weeks.map((w) => (
                          <tr key={w.weekIndex} className="hover:bg-surface-2 transition-colors">
                            <td className="px-3.5 py-2.5 font-bold text-fg">{w.weekLabel}</td>
                            <td className="px-3.5 py-2.5 text-center font-extrabold text-fg text-sm">
                              {w.totalQuestions} Soru
                            </td>
                            <td className="px-3.5 py-2.5 text-center text-fg-2 font-semibold">{w.activeDaysCount} Gün</td>
                            <td className="px-3.5 py-2.5 font-medium text-brand-fg">{w.topSubject}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-fg mb-3 pb-2 border-b border-line flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-brand-fg" />
                      Aylık Ders Dağılım Payları
                    </h4>
                    {monthlyAnalytics.subjectBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {monthlyAnalytics.subjectBreakdown.map((sub, i) => (
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
                      <p className="text-xs text-muted italic">Ders dökümü bulunamadı.</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-line">
                    <button
                      onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent, { logs: activeLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                      className="ui-btn ui-btn-sm bg-fg hover:bg-fg text-surface shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-brand-fg" />
                      <span>Aylık Raporu PDF İndir</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </>
  );
}
export default AylikPano;
