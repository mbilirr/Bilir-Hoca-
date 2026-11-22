// Öğrenci soru modülü › geçmiş kayıtlar (Aşama 354c: ayrı parça, yalnız gerekince yüklenir)
import { soruKaydiSilindi } from '../../../lib/geriAl';
import { Trash2 } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { formatTurkishDate } from '../../../utils/questionAnalytics';
import { appConfirm } from '../../../lib/appDialog';
import { QUESTION_ENTRY_MAX_PAST_DAYS } from './ortak';
import { useSoruModuluBaglam } from './useSoruModulu';

export function GecmisKayitlar() {
  const { activeTab, todayIso, minEntryDate, handleEditHistoryLog, studentHistoryLogs } = useSoruModuluBaglam();
  return (
    <>
      {activeTab === 'history' && (
        <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm space-y-4" id="question-history">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
            <div>
              <h3 className="text-base font-bold text-fg">Geçmiş Soru Sayısı Kayıtları</h3>
            </div>
            <span className="text-xs font-bold text-fg bg-surface-2 px-3 py-1.5 rounded-lg border border-line">
              Toplam {studentHistoryLogs.length} Günlük Kayıt
            </span>
          </div>

          {studentHistoryLogs.length === 0 ? (
            <div className="text-center py-10 text-subtle text-xs">
              Henüz geçmiş bir soru çözümü kaydı bulunmuyor.
            </div>
          ) : (
            <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
              {studentHistoryLogs.map((log) => {
                const editable = log.date >= minEntryDate && log.date <= todayIso;
                return (
                  <div key={log.id} data-testid="qh-row" data-date={log.date} className="p-3.5 hover:bg-surface-2 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-baseline gap-3">
                        <span className="font-bold text-fg text-sm">{formatTurkishDate(log.date)}</span>
                        <span className="font-extrabold text-fg text-sm" data-testid="qh-total">
                          {log.totalQuestions} Soru
                        </span>
                        <span className="text-xs text-muted" data-testid="qh-dyb">
                          D {log.totalCorrect || 0} · Y {log.totalWrong || 0} · B {log.totalEmpty || 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid="qh-edit"
                          data-yazma
                          disabled={!editable}
                          onClick={() => handleEditHistoryLog(log)}
                          title={
                            editable
                              ? 'Bu günün kaydını düzenle'
                              : `${QUESTION_ENTRY_MAX_PAST_DAYS} günden eski kayıtlar düzenlenemez`
                          }
                          className="ui-btn ui-btn-sm border border-line-strong text-fg-2 bg-surface hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed min-w-24"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          data-testid="qh-delete"
                          data-yazma
                          onClick={async () => {
                            if (await appConfirm({ title: 'Soru kaydı silinsin mi?', message: `${formatTurkishDate(log.date)} tarihli soru kaydını silmek istediğine emin misin?` })) {
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
                          aria-label="Kaydı Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs" data-testid="qh-entries">
                      {log.entries.map((e, i) => {
                        const c = Number(e.correctCount) || 0;
                        const w = Number(e.wrongCount) || 0;
                        const emp = e.emptyCount !== undefined ? Number(e.emptyCount) || 0 : Math.max(0, e.questionCount - c - w);
                        return (
                          <li key={`${e.subject}-${i}`} className="min-w-0">
                            <span className="font-semibold text-fg">{e.subject}:</span>{' '}
                            <span className="font-bold text-fg">{e.questionCount}</span>{' '}
                            <span className="text-muted">
                              (D {c} · Y {w} · B {emp})
                            </span>
                            {e.topic && <span className="text-muted"> — {e.topic}</span>}
                          </li>
                        );
                      })}
                    </ul>
                    {log.notes && <p className="mt-1.5 text-xs text-muted italic">Not: {log.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
export default GecmisKayitlar;
