// Soru Takibi › geçmiş aylar penceresi (Aşama 354b: ayrı parça, yalnız gerekince yüklenir)
import { Calendar, RotateCcw, X, Search, Check, Sparkles } from 'lucide-react';
import { TURKISH_MONTHS } from '../../../utils/questionAnalytics';
import { Modal } from '../../ui/kit';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function GecmisAylarPenceresi() {
  const { activeStudent, monthDate, setMonthDate, isMonthModalOpen, setIsMonthModalOpen, monthFilterTab, setMonthFilterTab, monthSearchQuery, setMonthSearchQuery, pastMonthsList, filteredPastMonths, activeMonthsCount } = useSoruTakibiBaglam();
  return (
    <>
      {isMonthModalOpen && activeStudent && (
        <Modal
          open
          id="month-picker-modal-content"
          onClose={() => setIsMonthModalOpen(false)}
          size="lg"
          icon={Calendar}
          title="Geçmiş Ayları ve Çözülen Soruları İncele"
          description={
            <>
              Öğrenci: <strong className="text-fg-2">{activeStudent.name}</strong>
            </>
          }
          govdeClass="p-4 space-y-2"
          footer={
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted">
                <Sparkles className="w-4 h-4 text-brand-fg shrink-0" />
                <span>Ay seçildiğinde aylık grafikler, başarı oranları ve aylık PDF anında güncellenir.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setMonthDate({ year: now.getFullYear(), month: now.getMonth() });
                      setIsMonthModalOpen(false);
                    }}
                    className="ui-btn ui-btn-secondary ui-btn-sm w-28"
                  >
                    <RotateCcw className="w-3 h-3 text-brand-fg" />
                    <span>Bu ay</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMonthModalOpen(false)}
                  className="ui-btn ui-btn-sm w-28 bg-fg hover:bg-fg text-surface"
                >
                  Kapat
                </button>
              </div>
            </div>
          }
          ust={
            <>
            {/* Hızlı Filtre & Arama Bölümü */}
            <div className="p-4 bg-surface-2 border-b border-line space-y-3 shrink-0">
              {/* Hızlı Butonlar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <span className="text-subtle text-xs font-bold shrink-0">Hızlı Dönem:</span>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setMonthDate({ year: now.getFullYear(), month: now.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className={`ui-btn ui-btn-sm ${
                    monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth()
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
                  }`}
                >
                  Bu Ay (Güncel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    setMonthDate({ year: d.getFullYear(), month: d.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className="ui-btn ui-btn-sm bg-surface hover:bg-surface-2 text-fg-2 border border-line"
                >
                  Geçen Ay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                    setMonthDate({ year: d.getFullYear(), month: d.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className="ui-btn ui-btn-sm bg-surface hover:bg-surface-2 text-fg-2 border border-line"
                >
                  2 Ay Önce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                    setMonthDate({ year: d.getFullYear(), month: d.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className="ui-btn ui-btn-sm bg-surface hover:bg-surface-2 text-fg-2 border border-line"
                >
                  3 Ay Önce
                </button>
              </div>

              {/* Arama ve Filtre Sekmeleri */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={monthSearchQuery}
                    onChange={(e) => setMonthSearchQuery(e.target.value)}
                    placeholder="Ay veya yıl ara (Örn: Eylül, 2026)..."
                    className="ui-field w-full pl-9 pr-8"
                  />
                  {monthSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setMonthSearchQuery('')}
                      className="ui-input-btn right-2.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-surface p-0.5 rounded-xl border border-line-strong shrink-0">
                  <button
                    type="button"
                    onClick={() => setMonthFilterTab('all')}
                    className={`ui-btn ui-btn-sm ${
                      monthFilterTab === 'all'
                        ? 'bg-fg text-surface'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    Tümü ({pastMonthsList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMonthFilterTab('with_questions')}
                    className={`ui-btn ui-btn-sm ${
                      monthFilterTab === 'with_questions'
                        ? 'bg-brand text-white'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    <span>Soru Çözülenler</span>
                    <span className="px-1.5 py-0.2 rounded-full text-2xs bg-black/20 text-white">
                      {activeMonthsCount}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            </>
          }
        >
              {filteredPastMonths.length === 0 ? (
                <div className="p-8 text-center text-muted text-xs">
                  Aramanıza veya seçtiğiniz filtreye uygun ay bulunamadı.
                </div>
              ) : (
                filteredPastMonths.map((item) => {
                  const isSelected = item.year === monthDate.year && item.month === monthDate.month;
                  return (
                    <div
                      key={`${item.year}-${item.month}`}
                      onClick={() => {
                        setMonthDate({ year: item.year, month: item.month });
                        setIsMonthModalOpen(false);
                      }}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-brand bg-brand-soft/70 shadow-xs ring-1 ring-brand/40'
                          : 'border-line hover:border-brand/30 hover:bg-surface-2'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected
                              ? 'bg-brand text-white shadow-xs'
                              : item.hasActivity
                              ? 'bg-fg text-brand-fg'
                              : 'bg-surface-2 text-subtle'
                          }`}
                        >
                          {item.month + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? 'text-brand-fg' : 'text-fg'
                              }`}
                            >
                              {item.monthLabel}
                            </span>
                            <span
                              className={`text-2xs font-extrabold uppercase px-1.5 py-0.5 rounded-lg ${
                                item.year === new Date().getFullYear() && item.month === new Date().getMonth()
                                  ? 'bg-success-soft text-success-fg'
                                  : isSelected
                                  ? 'bg-brand-soft text-brand-fg'
                                  : 'bg-surface-2 text-muted'
                              }`}
                            >
                              {item.relativeLabel}
                            </span>
                          </div>
                          <p className="text-xs text-muted mt-0.5">
                            {item.year} Yılı • {TURKISH_MONTHS[item.month]} Dönemi
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:self-center justify-between sm:justify-end">
                        <div className="text-left sm:text-right">
                          {item.hasActivity ? (
                            <div>
                              <span className="text-xs font-extrabold text-fg flex items-center gap-1 sm:justify-end">
                                <span className="w-2 h-2 rounded-full bg-brand" />
                                {item.totalQuestions} Soru Çözüldü
                              </span>
                              <span className="text-2xs text-success-fg font-semibold block">
                                {item.activeDaysCount} aktif çalışma günü
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-subtle font-medium">
                              Soru kaydı yok (0)
                            </span>
                          )}
                        </div>

                        <div>
                          {isSelected ? (
                            <span className="px-3 py-1.5 bg-brand text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-xs">
                              <Check className="w-3.5 h-3.5" />
                              <span>Seçili</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="ui-btn ui-btn-sm bg-surface hover:bg-fg text-fg-2 hover:text-surface border border-line-strong hover:border-line"
                            >
                              İncele
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
        </Modal>
      )}
    </>
  );
}
export default GecmisAylarPenceresi;
