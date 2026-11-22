// Soru Takibi › sınıf genel sıralaması (Aşama 354b: ayrı parça, yalnız gerekince yüklenir)
import { ShowMoreBar } from '../../../lib/listPaging';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function SinifSiralamasi() {
  const { selectedStudentId, setSelectedStudentId, activeClass, activeAnalysisMode, setActiveAnalysisMode, classOverviewData, ovPage } = useSoruTakibiBaglam();
  return (
    <>
      {activeAnalysisMode === 'class_overview' && (
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
                <div>
                  <h3 className="text-base font-bold text-fg">
                    {activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Soru Çözüm & Başarı Sıralaması
                  </h3>
                  <p className="text-xs text-muted">
                    Haftalık ve aylık toplam çözülen soru sayıları, soru çözülmeyen gün alarmları ve başarı dereceleri
                  </p>
                </div>
                <div className="text-xs font-bold text-fg bg-surface-2 px-3 py-1.5 rounded-lg border border-line">
                  Toplam {classOverviewData.length} Öğrenci
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                    <tr>
                      <th className="px-4 py-3">Sıra</th>
                      <th className="px-4 py-3">Öğrenci Adı</th>
                      <th className="px-4 py-3 text-center">Bu Hafta Çözülen</th>
                      <th className="px-4 py-3 text-center">Soru Çözülmeyen Günler</th>
                      <th className="px-4 py-3 text-center">Haftalık İlerleme</th>
                      <th className="px-4 py-3 text-center">Bu Ay Toplam</th>
                      <th className="px-4 py-3 text-center">Başarı Seviyesi</th>
                      <th className="px-4 py-3 text-right">Analiz</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ovPage.visible.map((row, idx) => (
                      <tr
                        key={row.student.id}
                        className={`hover:bg-surface-2 transition-colors ${
                          row.student.id === selectedStudentId ? 'bg-brand-soft/50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-muted">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-fg">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="ui-link ui-link-yazi ui-link-satir text-left"
                          >
                            {row.student.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-fg text-sm">
                          {row.weeklyTotal} Soru
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.unsolvedDaysCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-brand-soft text-brand-fg border border-brand/30">
                              {row.unsolvedDaysCount} Gün Çözülmedi
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-success-soft text-success-fg border border-success/30">
                              Her Gün Çözüldü
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">
                          <span className={row.weeklyDiff >= 0 ? 'text-success-fg' : 'text-danger-fg'}>
                            {row.weeklyDiff >= 0 ? '+' : ''}{row.weeklyDiff} {row.prevWeekTotal > 0 ? `(${row.weeklyGrowthRate >= 0 ? '+' : ''}%${row.weeklyGrowthRate})` : '(önceki hafta kayıt yok)'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-fg">
                          {row.monthlyTotal} Soru
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded text-xs font-semibold bg-surface-2 text-fg border border-line">
                            {row.badgeText}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="ui-btn ui-btn-sm bg-fg hover:bg-fg text-surface"
                          >
                            Analiz Aç
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ShowMoreBar remaining={ovPage.remaining} total={ovPage.total} shown={ovPage.visible.length} onMore={ovPage.showMore} onAll={ovPage.showAll} />
              </div>
            </div>
          )}
    </>
  );
}
export default SinifSiralamasi;
