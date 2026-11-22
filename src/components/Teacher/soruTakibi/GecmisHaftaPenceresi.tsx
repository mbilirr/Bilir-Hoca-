// Soru Takibi › geçmiş hafta seçimi penceresi (Aşama 354b: ayrı parça, yalnız gerekince yüklenir)
import { Calendar, RotateCcw, X, Search, Check, Clock, Sparkles } from 'lucide-react';
import { formatTurkishDate } from '../../../utils/questionAnalytics';
import { Modal } from '../../ui/kit';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function GecmisHaftaPenceresi() {
  const { activeStudent, weekOffset, setWeekOffset, isWeekModalOpen, setIsWeekModalOpen, weekFilterTab, setWeekFilterTab, weekSearchQuery, setWeekSearchQuery, pastWeeksList, filteredPastWeeks, activeWeeksCount } = useSoruTakibiBaglam();
  return (
    <>
      {isWeekModalOpen && activeStudent && (
        <Modal
          open
          id="modal-week-picker-content"
          onClose={() => setIsWeekModalOpen(false)}
          size="lg"
          icon={Calendar}
          title="Geçmiş Hafta Seçimi"
          description={
            <>
              <strong className="text-fg-2">{activeStudent.name}</strong> öğrencisinin geçmiş haftalarda çözdüğü soruları incelemek için dilediğiniz haftayı seçin.
            </>
          }
          govdeClass="p-4 space-y-2"
          footer={
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted">
                <Sparkles className="w-4 h-4 text-brand-fg shrink-0" />
                <span>Hafta seçildiğinde grafikler, başarı analizi ve PDF raporları anında güncellenir.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {weekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setWeekOffset(0);
                      setIsWeekModalOpen(false);
                    }}
                    className="ui-btn ui-btn-secondary ui-btn-sm w-28"
                  >
                    <RotateCcw className="w-3 h-3 text-brand-fg" />
                    <span>Bu hafta</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsWeekModalOpen(false)}
                  className="ui-btn ui-btn-sm w-28 bg-fg hover:bg-fg text-surface"
                >
                  Kapat
                </button>
              </div>
            </div>
          }
          ust={
            <>
            {/* Quick Filter & Search Bar */}
            <div className="p-4 border-b border-line bg-surface-2 space-y-3">
              {/* Hızlı Atlama Düğmeleri */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-muted mr-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-subtle" />
                  <span>Hızlı Seç:</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(0);
                    setIsWeekModalOpen(false);
                  }}
                  className={`ui-btn ui-btn-sm ${
                    weekOffset === 0
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
                  }`}
                >
                  Bu Hafta (Güncel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-1);
                    setIsWeekModalOpen(false);
                  }}
                  className={`ui-btn ui-btn-sm ${
                    weekOffset === -1
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
                  }`}
                >
                  Geçen Hafta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-2);
                    setIsWeekModalOpen(false);
                  }}
                  className={`ui-btn ui-btn-sm ${
                    weekOffset === -2
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
                  }`}
                >
                  2 Hafta Önce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-3);
                    setIsWeekModalOpen(false);
                  }}
                  className={`ui-btn ui-btn-sm ${
                    weekOffset === -3
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
                  }`}
                >
                  3 Hafta Önce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-4);
                    setIsWeekModalOpen(false);
                  }}
                  className={`ui-btn ui-btn-sm ${
                    weekOffset === -4
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
                  }`}
                >
                  1 Ay Önce (4. Hafta)
                </button>
              </div>

              {/* Arama ve Filtre Sekmeleri */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={weekSearchQuery}
                    onChange={(e) => setWeekSearchQuery(e.target.value)}
                    placeholder="Hafta veya ay ara (Örn: Eylül, Ağustos)..."
                    className="ui-field w-full pl-9 pr-8"
                  />
                  {weekSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setWeekSearchQuery('')}
                      className="ui-input-btn right-2.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-surface p-0.5 rounded-xl border border-line-strong shrink-0">
                  <button
                    type="button"
                    onClick={() => setWeekFilterTab('all')}
                    className={`ui-btn ui-btn-sm ${
                      weekFilterTab === 'all'
                        ? 'bg-fg text-surface'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    Tümü ({pastWeeksList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekFilterTab('with_questions')}
                    className={`ui-btn ui-btn-sm ${
                      weekFilterTab === 'with_questions'
                        ? 'bg-brand text-white'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    <span>Soru Çözülenler</span>
                    <span className="px-1.5 py-0.2 rounded-full text-2xs bg-black/20 text-white">
                      {activeWeeksCount}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            </>
          }
        >
              {filteredPastWeeks.length === 0 ? (
                <div className="p-8 text-center text-muted text-xs">
                  Aramanıza veya seçtiğiniz filtreye uygun hafta bulunamadı.
                </div>
              ) : (
                filteredPastWeeks.map((item) => {
                  const isSelected = item.offset === weekOffset;
                  return (
                    <div
                      key={item.offset}
                      onClick={() => {
                        setWeekOffset(item.offset);
                        setIsWeekModalOpen(false);
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
                          {item.offset === 0 ? '0' : item.offset}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? 'text-brand-fg' : 'text-fg'
                              }`}
                            >
                              {item.weekLabel}
                            </span>
                            <span
                              className={`text-2xs font-extrabold uppercase px-1.5 py-0.5 rounded-lg ${
                                item.offset === 0
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
                            {formatTurkishDate(item.startDateStr)} - {formatTurkishDate(item.endDateStr)}
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
                                {item.activeDaysCount} gün soru girişi yapıldı
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
export default GecmisHaftaPenceresi;
