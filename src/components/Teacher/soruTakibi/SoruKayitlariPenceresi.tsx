// Soru Takibi › soru kayıtları ve geçmiş penceresi (Aşama 354b: ayrı parça, yalnız gerekince yüklenir)
import { soruKaydiSilindi } from '../../../lib/geriAl';
import { HelpCircle, Trash2, ListOrdered } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { formatTurkishDate } from '../../../utils/questionAnalytics';
import { Modal } from '../../ui/kit';
import { appConfirm } from '../../../lib/appDialog';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function SoruKayitlariPenceresi() {
  const { activeStudent, isManageLogsModalOpen, setIsManageLogsModalOpen, activeLogs } = useSoruTakibiBaglam();
  return (
    <>
      {isManageLogsModalOpen && activeStudent && (
        <Modal
          open
          id="modal-manage-logs-content"
          onClose={() => setIsManageLogsModalOpen(false)}
          size="lg"
          icon={ListOrdered}
          title={`${activeStudent.name} — Soru Kayıtları & Geçmiş`}
          description="Öğrenciye ait kayıtlı soru çözümlerini görüntüleyin, hatalı veya mükerrer kayıtları güvenle silin."
          govdeClass="p-5 space-y-3"
          footer={
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted">
                Toplam <strong>{activeLogs.length}</strong> kayıt
              </span>
              <button
                type="button"
                onClick={() => setIsManageLogsModalOpen(false)}
                className="ui-btn ui-btn-sm bg-fg text-surface hover:bg-fg"
              >
                Kapat
              </button>
            </div>
          }
        >
              {activeLogs.length === 0 ? (
                <div className="text-center py-10 text-subtle">
                  <HelpCircle className="w-10 h-10 mx-auto text-subtle mb-2 opacity-70" />
                  <p className="font-bold text-sm text-muted">Henüz Kayıtlı Soru Girişi Yok</p>
                  <p className="text-xs text-subtle mt-1">Öğrenciye ait soru çözümü silinmiş veya henüz kayıt eklenmemiş.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-muted font-bold border-b border-line">
                      <tr>
                        <th className="px-4 py-2.5">Tarih</th>
                        <th className="px-4 py-2.5 text-center">Toplam Soru</th>
                        <th className="px-4 py-2.5">Ders Dağılımı</th>
                        <th className="px-4 py-2.5">Not</th>
                        <th className="px-4 py-2.5 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {[...activeLogs]
                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                        .map((log) => (
                          <tr key={log.id} className="hover:bg-surface-2 transition-colors">
                            <td className="px-4 py-3 font-bold text-fg">
                              {formatTurkishDate(log.date)}
                            </td>
                            <td className="px-4 py-3 text-center font-extrabold text-fg text-sm">
                              {log.totalQuestions} Soru
                            </td>
                            <td className="px-4 py-3 text-muted">
                              {Array.isArray(log.entries) && log.entries.length > 0
                                ? log.entries.map((e) => `${e.subject}: ${e.questionCount}`).join(', ')
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-muted italic max-w-xs truncate">
                              {log.notes || '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (await appConfirm({ title: 'Soru kaydı silinsin mi?', message: 'Bu soru kaydını silmek istediğinize emin misiniz? Ana sayfa özetleri ve grafikler anında güncellenecektir.' })) {
                                    try {
                                      await dataService.deleteQuestionLog(log.id);
                                      soruKaydiSilindi(log); // Aşama 306: 10 sn "Geri al"
                                    } catch {
                                      // hata uyarısı gösterildi, kayıt geri getirildi
                                    }
                                  }
                                }}
                                className="ui-btn-mini ui-btn-mini-danger"
                                title="Kaydı Sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
        </Modal>
      )}
    </>
  );
}
export default SoruKayitlariPenceresi;
