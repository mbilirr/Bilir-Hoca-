// Soru Takibi › öğrenci seçilmeden önceki sınıf görünümü (Aşama 354b: ayrı parça, yalnız gerekince yüklenir)
import { Users, User, X, BarChart3, Sparkles, Target } from 'lucide-react';
import { ShowMoreBar } from '../../../lib/listPaging';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function SinifGenelBakis() {
  const { selectedClassId, activeClass, classStudents, setIsStudentDropdownOpen, setStudentSearchQuery, handleSelectClass, handleSelectStudent, getStudentTodayQuestionCount, classOverviewData, overviewById, ovPage, cardPage, todaySolvedStudents, todayPage, classSummaryStats } = useSoruTakibiBaglam();
  return (
    <>
      {selectedClassId ? (
          /* ========================================================================= */
          /* BÜTÜN SINIF GÖRÜNÜMÜ ("Sınıf seçince bütün sınıf çıksın")                */
          /* ========================================================================= */
          <div className="space-y-6">
            {/* Sınıf Başlık ve Bilgilendirme Kartı */}
            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-brand-soft border border-brand/30 text-brand-fg flex items-center justify-center shrink-0 shadow-xs">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-brand-soft text-brand-fg border border-brand/30">
                        Bütün Sınıf Raporu
                      </span>
                      <span className="text-xs font-semibold text-muted">
                        {classStudents.length} Kayıtlı Öğrenci
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-fg tracking-tight mt-0.5">
                      {activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Soru Çözüm & Başarı Raporu
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsStudentDropdownOpen(true);
                      setStudentSearchQuery('');
                    }}
                    className="ui-btn ui-btn-sm ui-btn-primary w-28"
                    title="Öğrenci seçip incele"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Öğrenci seç</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectClass('')}
                    className="ui-btn ui-btn-secondary ui-btn-sm w-28"
                    title="Sınıf seçimini temizle"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Sınıfı kapat</span>
                  </button>
                </div>
              </div>

              {/* Sınıf Genel KPI Kartları */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-4">
                <div className="bg-surface-2 p-4 rounded-xl border border-line">
                  <div className="flex items-center justify-between text-xs text-muted font-semibold mb-1">
                    <span>Sınıf Mevcudu</span>
                    <Users className="w-4 h-4 text-fg" />
                  </div>
                  <div className="text-2xl font-bold text-fg">
                    {classStudents.length} <span className="text-xs font-normal text-muted">Öğrenci</span>
                  </div>
                  <div className="text-xs text-success-fg font-semibold mt-1">
                    Bugün {classSummaryStats.todaySolvedCount} öğrenci soru girişi yaptı
                  </div>
                </div>

                <div className="bg-surface-2 p-4 rounded-xl border border-line">
                  <div className="flex items-center justify-between text-xs text-muted font-semibold mb-1">
                    <span>Bu Hafta Sınıf Toplamı</span>
                    <BarChart3 className="w-4 h-4 text-brand-fg" />
                  </div>
                  <div className="text-2xl font-bold text-brand-fg">
                    {classSummaryStats.weeklyTotal} <span className="text-xs font-normal text-muted">Soru</span>
                  </div>
                  <div className="text-xs text-muted mt-1">
                    Haftalık sınıf geneli çözülen toplam
                  </div>
                </div>

                <div className="bg-surface-2 p-4 rounded-xl border border-line">
                  <div className="flex items-center justify-between text-xs text-muted font-semibold mb-1">
                    <span>Öğrenci Başına Haftalık Ortalama</span>
                    <Target className="w-4 h-4 text-success-fg" />
                  </div>
                  <div className="text-2xl font-bold text-success-fg">
                    {classSummaryStats.weeklyAvgPerStudent} <span className="text-xs font-normal text-muted">Soru</span>
                  </div>
                  <div className="text-xs text-muted mt-1">
                    Günlük ortalama ~{classSummaryStats.dailyAvgPerStudent} soru
                  </div>
                </div>

                <div className="bg-surface-2 p-4 rounded-xl border border-line">
                  <div className="flex items-center justify-between text-xs text-muted font-semibold mb-1">
                    <span>Bu Ay Sınıf Toplamı</span>
                    <Sparkles className="w-4 h-4 text-brand-fg" />
                  </div>
                  <div className="text-2xl font-bold text-brand-fg">
                    {classSummaryStats.monthlyTotal} <span className="text-xs font-normal text-muted">Soru</span>
                  </div>
                  <div className="text-xs text-muted mt-1">
                    Aylık genel sınıf soru hacmi
                  </div>
                </div>
              </div>
            </div>

            {/* Sınıfın Tüm Öğrencilerinin Soru Çözüm Sıralaması Tablosu */}
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
                <div>
                  <h3 className="text-base font-bold text-fg flex items-center gap-2">
                    <span>{activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Başarı & Soru Sıralaması</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-fg-2">
                      {classOverviewData.length} Öğrenci
                    </span>
                  </h3>
                </div>
              </div>

              {classOverviewData.length === 0 ? (
                <div className="py-12 text-center text-xs text-subtle">
                  Bu sınıfta henüz kayıtlı öğrenci bulunmuyor.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                      <tr>
                        <th className="px-4 py-3">Sıra</th>
                        <th className="px-4 py-3">Öğrenci Adı</th>
                        <th className="px-4 py-3 text-center">Bugün Çözülen</th>
                        <th className="px-4 py-3 text-center">Bu Hafta Çözülen</th>
                        <th className="px-4 py-3 text-center">Soru Çözülmeyen Günler</th>
                        <th className="px-4 py-3 text-center">Haftalık İlerleme</th>
                        <th className="px-4 py-3 text-center">Bu Ay Toplam</th>
                        <th className="px-4 py-3 text-center">Başarı Seviyesi</th>
                        <th className="px-4 py-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {ovPage.visible.map((row, idx) => {
                        const todayCount = getStudentTodayQuestionCount(row.student.id);
                        return (
                          <tr
                            key={row.student.id}
                            className="hover:bg-brand-soft/40 transition-colors group cursor-pointer"
                            onClick={() => handleSelectStudent(row.student.id)}
                          >
                            <td className="px-4 py-3.5 font-bold text-muted">
                              {idx === 0 ? (
                                <span className="w-6 h-6 rounded-full bg-warning-soft text-warning-fg flex items-center justify-center font-bold text-xs">
                                  🥇
                                </span>
                              ) : idx === 1 ? (
                                <span className="w-6 h-6 rounded-full bg-surface-3 text-fg-2 flex items-center justify-center font-bold text-xs">
                                  🥈
                                </span>
                              ) : idx === 2 ? (
                                <span className="w-6 h-6 rounded-full bg-brand-soft text-brand-fg flex items-center justify-center font-bold text-xs">
                                  🥉
                                </span>
                              ) : (
                                idx + 1
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-fg group-hover:text-brand-fg transition-colors text-sm">
                                {row.student.name}
                              </div>
                              {row.student.studentNumber && (
                                <div className="text-2xs text-subtle">
                                  No: {row.student.studentNumber}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {todayCount > 0 ? (
                                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-success-soft text-success-fg border border-success/30">
                                  🎯 {todayCount} Soru
                                </span>
                              ) : (
                                <span className="text-subtle text-xs font-medium">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center font-extrabold text-fg text-sm">
                              {row.weeklyTotal} Soru
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {row.unsolvedDaysCount > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-brand-soft text-brand-fg border border-brand/30">
                                  {row.unsolvedDaysCount} Gün Boş
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-success-soft text-success-fg border border-success/30">
                                  Her Gün Çözüldü
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold">
                              <span className={row.weeklyDiff >= 0 ? 'text-success-fg font-bold' : 'text-danger-fg font-bold'}>
                                {row.weeklyDiff >= 0 ? '+' : ''}{row.weeklyDiff} {row.prevWeekTotal > 0 ? `(${row.weeklyGrowthRate >= 0 ? '+' : ''}%${row.weeklyGrowthRate})` : '(önceki hafta kayıt yok)'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center font-extrabold text-fg">
                              {row.monthlyTotal} Soru
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-block px-2.5 py-0.5 rounded text-xs font-semibold bg-surface-2 text-fg border border-line">
                                {row.badgeText}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectStudent(row.student.id);
                                }}
                                className="ui-btn ui-btn-sm ui-btn-secondary"
                              >
                                <span>Analiz Aç</span>
                                <span>→</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <ShowMoreBar remaining={ovPage.remaining} total={ovPage.total} shown={ovPage.visible.length} onMore={ovPage.showMore} onAll={ovPage.showAll} />
                </div>
              )}
            </div>

            {/* Sınıftaki Öğrencilerin Hızlı Kartları */}
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-fg uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-brand-fg" />
                  <span>Sınıf Öğrenci Kartları ({classStudents.length})</span>
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {cardPage.visible.map((s) => {
                  const todayCount = getStudentTodayQuestionCount(s.id);
                  const overviewItem = overviewById.get(s.id);
                  const weeklyTotal = overviewItem?.weeklyTotal || 0;

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectStudent(s.id)}
                      className="p-3.5 rounded-xl border border-line bg-surface hover:bg-brand-soft/60 hover:border-brand/30 transition-colors text-left group shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="font-extrabold text-xs text-fg group-hover:text-brand-fg transition-colors">
                            {s.name}
                          </div>
                          {s.studentNumber && (
                            <div className="text-2xs text-subtle">
                              No: {s.studentNumber}
                            </div>
                          )}
                        </div>
                        {todayCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-success text-white shadow-xs shrink-0">
                            🎯 {todayCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-line">
                        <span className="font-semibold text-fg-2">Bu Hafta: <strong className="text-brand-fg font-extrabold">{weeklyTotal} Soru</strong></span>
                        <span className="text-brand-fg font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
                          İncele →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <ShowMoreBar remaining={cardPage.remaining} total={cardPage.total} shown={cardPage.visible.length} onMore={cardPage.showMore} onAll={cardPage.showAll} />
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* HOŞ GELDİNİZ VE SINIF SEÇİM PANELİ (SINIF VEYA ÖĞRENCİ SEÇİLMEDİĞİNDE)     */
          /* ========================================================================= */
          <div className="bg-surface border border-line rounded-2xl p-6 sm:p-10 shadow-sm space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-fg flex items-center justify-center mx-auto mb-2 shadow-xs">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-fg">
                Sınıf ya da Öğrenci Seçin
              </h3>
              <p className="text-xs text-muted">Sınıf seçince sıralama, öğrenci seçince ayrıntılı analiz açılır.</p>
            </div>

            {/* Bugün Soru Çözen Öğrenciler Hızlı Erişim Kartları */}
            {(() => {
              if (todaySolvedStudents.length === 0) {
                // Aşama 405: üstteki boş durum zaten yol gösteriyor; ikinci açıklama kutusu kaldırıldı
                return <p className="text-center text-xs text-subtle">Bugün soru giren öğrenci yok</p>;
              }

              return (
                <div className="space-y-3 pt-4 border-t border-line">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-success-fg uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-success-fg" />
                      <span>Bugün Soru Çözen Öğrenciler ({todaySolvedStudents.length})</span>
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {todayPage.visible.map(({ student: s, todayQuestions }) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectStudent(s.id)}
                        className="p-3.5 rounded-xl border border-success/30 bg-success-soft/60 hover:bg-success-soft transition-colors text-left group shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="font-extrabold text-xs text-success-fg group-hover:text-success-fg transition-colors">
                            {s.name}
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-success text-white shadow-xs shrink-0">
                            {todayQuestions} Soru
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-success/30">
                          <span className="truncate">{s.className || 'Sınıf Belirtilmedi'}</span>
                          <span className="text-success-fg font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
                            İncele →
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <ShowMoreBar remaining={todayPage.remaining} total={todayPage.total} shown={todayPage.visible.length} onMore={todayPage.showMore} onAll={todayPage.showAll} />
                </div>
              );
            })()}
          </div>
        )}
    </>
  );
}
export default SinifGenelBakis;
