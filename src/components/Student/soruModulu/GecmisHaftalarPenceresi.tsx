// Öğrenci soru modülü › geçmiş haftalar penceresi (Aşama 354c: ayrı parça, yalnız gerekince yüklenir)
import { Calendar, Search, X } from 'lucide-react';
import { Modal } from '../../ui/kit';
import { useSoruModuluBaglam } from './useSoruModulu';

export function GecmisHaftalarPenceresi() {
  const { weekOffset, setWeekOffset, isWeekModalOpen, setIsWeekModalOpen, weekSearchQuery, setWeekSearchQuery, pastWeeksList, filteredPastWeeks } = useSoruModuluBaglam();
  return (
    <>
      <Modal
        open={isWeekModalOpen}
        onClose={() => setIsWeekModalOpen(false)}
        size="md"
        icon={Calendar}
        title="Haftalık İnceleme Dönemi Seçin"
        description="Yalnızca soru çözümü yapılan kayıtlı haftalar listelenmektedir"
        govdeClass="p-4 space-y-2"
        footer={
          <div className="w-full flex items-center justify-between gap-3 text-xs text-muted">
            <span>Toplam {pastWeeksList.length} kayıtlı dönem</span>
            <button type="button" onClick={() => setIsWeekModalOpen(false)} className="ui-btn ui-btn-secondary min-w-24">
              Kapat
            </button>
          </div>
        }
        ust={
          <>
            {/* Arama Barı */}
            <div className="p-4 border-b border-line bg-surface-2">
              <div className="relative">
                <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={weekSearchQuery}
                  onChange={(e) => setWeekSearchQuery(e.target.value)}
                  placeholder="Tarih veya hafta ara..."
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
            </div>

          </>
        }
      >
              {filteredPastWeeks.length === 0 ? (
                <div className="p-8 text-center text-muted text-xs">
                  Aramanıza uygun kayıtlı hafta bulunamadı.
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
                              ? 'bg-success-soft text-success-fg'
                              : 'bg-surface-2 text-muted'
                          }`}
                        >
                          {item.offset === 0 ? 'Bugün' : `${item.offset}H`}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-fg">
                              {item.relativeLabel}
                            </span>
                            {item.offset === 0 && (
                              <span className="text-3xs font-extrabold bg-success text-white px-1.5 py-0.2 rounded-full">
                                Güncel
                              </span>
                            )}
                            {item.hasActivity && (
                              <span className="text-3xs font-bold bg-warning-soft text-warning-fg border border-warning/30 px-1.5 py-0.2 rounded-lg">
                                {item.activeDaysCount} Gün Çözüm
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted mt-0.5 font-medium">
                            {item.weekLabel}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:border-l sm:border-line sm:pl-3">
                        <div className="text-right">
                          <span className="text-sm font-bold text-fg block">
                            {item.totalQuestions} Soru
                          </span>
                          <span className="text-2xs text-muted block">
                            {item.totalCorrect} D / {item.totalWrong} Y
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`ui-btn ui-btn-sm ${
                            isSelected
                              ? 'bg-brand text-white'
                              : 'bg-surface-2 hover:bg-brand-hover hover:text-white text-fg-2'
                          }`}
                        >
                          {isSelected ? 'Seçili' : 'İncele'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
      </Modal>
    </>
  );
}
export default GecmisHaftalarPenceresi;
