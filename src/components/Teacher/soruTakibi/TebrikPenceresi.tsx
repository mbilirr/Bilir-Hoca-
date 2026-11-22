// Soru Takibi › tebrik bildirimi penceresi (Aşama 354b: ayrı parça, yalnız gerekince yüklenir)
import { Award } from 'lucide-react';
import { formatTurkishDate } from '../../../utils/questionAnalytics';
import { Modal } from '../../ui/kit';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function TebrikPenceresi() {
  const { activeStudent, praiseTargetDay, setPraiseTargetDay, praiseCustomMessage, setPraiseCustomMessage, handleSendPraise } = useSoruTakibiBaglam();
  return (
    <>
      {praiseTargetDay && activeStudent && (
        <Modal
          open
          onClose={() => setPraiseTargetDay(null)}
          size="md"
          icon={Award}
          title="Öğrenciye Tebrik ve Aferin Gönder"
          description={`${activeStudent.name} • ${formatTurkishDate(praiseTargetDay.dateStr)} (${praiseTargetDay.dayName})`}
          govdeClass="p-5 sm:p-6"
          footer={
            <>
              <button type="button" onClick={() => setPraiseTargetDay(null)} className="ui-btn ui-btn-ghost min-w-24">
                Vazgeç
              </button>
              <button type="button" onClick={handleSendPraise} className="ui-btn ui-btn-primary">
                <Award className="w-3.5 h-3.5" />
                <span>Öğrenciye Tebrik Bildirimi Gönder 🚀</span>
              </button>
            </>
          }
        >
            {/* Performans Özeti Rozeti */}
            <div className="bg-warning-soft/70 border border-warning/30 rounded-xl p-3.5 mb-4 text-xs text-warning-fg flex items-center justify-between">
              <div>
                <span className="text-2xs font-bold text-warning-fg uppercase tracking-wider block">
                  Günlük Çözülen Soru
                </span>
                <span className="text-lg font-bold text-warning-fg">
                  {praiseTargetDay.totalQuestions} Soru
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xs font-bold text-warning-fg uppercase tracking-wider block">
                  Ders Dağılımı
                </span>
                <span className="text-xs font-semibold text-warning-fg truncate max-w-[200px] block">
                  {praiseTargetDay.subjectsText || 'Genel Çözüm'}
                </span>
              </div>
            </div>

            {/* Hızlı Tebrik Şablonları */}
            <div className="space-y-1.5 mb-3">
              <label className="text-xs font-bold text-fg-2 block">
                ⚡ Hızlı Tebrik Şablonu Seçin:
              </label>
              <div className="flex flex-col gap-1.5">
                {[
                  `Harikasın ${activeStudent.name}! 👏 Bugünkü ${praiseTargetDay.totalQuestions} soruluk hedefini başarıyla tamamladığın ve gösterdiğin gayret için seni tebrik ederim, aynen devam!`,
                  `Aferin ${activeStudent.name}! ⭐ Soru çözümlerin ve disiplinli çalışman için seni tebrik ederim, harika gidiyorsun!`,
                  `Süpersin! 🚀 Günlük ${praiseTargetDay.totalQuestions} soru çözerek hedefini aştın. Bu disiplin ve kararlılık seni hedeflerine ulaştıracak!`,
                  `Tebrikler ${activeStudent.name}! 🎯 Bugünkü soru çözüm performansın ve azmin takdire şayan. Seninle gurur duyuyorum!`,
                ].map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPraiseCustomMessage(tpl)}
                    className={`text-left text-xs p-2 rounded-lg border transition-colors cursor-pointer ${
                      praiseCustomMessage === tpl
                        ? 'bg-brand-soft/80 border-brand font-bold text-brand-fg ring-1 ring-brand'
                        : 'bg-surface-2 hover:bg-brand-soft/50 border-line text-fg-2'
                    }`}
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            </div>

            {/* Özelleştirilebilir Mesaj Kutusu */}
            <div className="mb-4">
              <label className="text-xs font-bold text-fg-2 block mb-1">
                İletilecek Bildirim Mesajı:
              </label>
              <textarea
                rows={3}
                value={praiseCustomMessage}
                onChange={(e) => setPraiseCustomMessage(e.target.value)}
                className="ui-field w-full font-medium"
                placeholder="Öğrenciye iletilecek tebrik mesajını yazınız..."
              />
              <span className="text-2xs text-muted block mt-1">
                ℹ️ Bu bildirim öğrencinin ana ekranında (portalında) tebrik kartı olarak anında gösterilecektir.
              </span>
            </div>

        </Modal>
      )}
    </>
  );
}
export default TebrikPenceresi;
