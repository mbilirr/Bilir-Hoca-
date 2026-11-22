// Öğrenci soru modülü › üst çubuk ve sekmeler (Aşama 354c: ayrı parça)
import { Download, BarChart3, Layers } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { downloadWeeklyPDF, downloadMonthlyPDF } from '../../../utils/questionAnalytics';
import { useSoruModuluBaglam } from './useSoruModulu';

export function SoruModuluUst() {
  const { activeStudent, activeTab, setActiveTab, allLogs, weeklyAnalytics, monthlyAnalytics } = useSoruModuluBaglam();
  return (
    <>
      <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-fg text-surface flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-brand-fg" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg tracking-tight">
                Soru Çözümü ve İlerleme
              </h2>
            </div>
          </div>

          {/* Quick PDF & Export Bar */}
          <div className="flex items-center gap-2">
            {activeTab === 'weekly' && weeklyAnalytics && (
              <button
                id="btn-student-looker-pdf-weekly"
                onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent, { logs: allLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                className="ui-btn ui-btn-sm bg-fg hover:bg-fg text-surface shadow-sm min-w-24"
              >
                <Download className="w-3.5 h-3.5 text-brand-fg" />
                <span>Haftalık Raporu İndir (PDF)</span>
              </button>
            )}
            {activeTab === 'monthly' && monthlyAnalytics && (
              <button
                id="btn-student-looker-pdf-monthly"
                onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent, { logs: allLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                className="ui-btn ui-btn-sm bg-fg hover:bg-fg text-surface shadow-sm min-w-24"
              >
                <Download className="w-3.5 h-3.5 text-brand-fg" />
                <span>Aylık Raporu İndir (PDF)</span>
              </button>
            )}
          </div>
        </div>

        {/* Looker Studio Filter & Tab Navigation */}
        <div className="pt-4">
          {/* Görünüm Modu / Sekme Seçimi */}
          <div className="bg-surface-2 p-3 rounded-xl border border-line w-full">
            <label className="block text-xs font-bold text-fg-2 mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-fg" />
              Çalışma Modülü & Analiz Boyutu
            </label>
            {/* Aşama 292: telefonda dört sekme tek satıra sığmıyordu (son sekme kesik); dar ekranda 2×2 eşit ızgara.
                Seçili sekme her dördünde aynı renk (lacivert). */}
            <div className="grid grid-cols-2 sm:flex gap-0.5 rounded-lg bg-surface border border-line-strong p-0.5">
              <button
                type="button"
                id="btn-student-tab-entry"
                onClick={() => setActiveTab('entry')}
                className={`ui-btn ui-btn-sm flex-1 ${
                  activeTab === 'entry'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                + Soru Kaydet
              </button>
              <button
                type="button"
                id="btn-student-tab-history"
                onClick={() => setActiveTab('history')}
                className={`ui-btn ui-btn-sm flex-1 ${
                  activeTab === 'history'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Geçmiş Kayıtlar
              </button>
              <button
                type="button"
                id="btn-student-tab-weekly"
                onClick={() => setActiveTab('weekly')}
                className={`ui-btn ui-btn-sm flex-1 ${
                  activeTab === 'weekly'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Haftalık Analiz
              </button>
              <button
                type="button"
                id="btn-student-tab-monthly"
                onClick={() => setActiveTab('monthly')}
                className={`ui-btn ui-btn-sm flex-1 ${
                  activeTab === 'monthly'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Aylık Analiz
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
export default SoruModuluUst;
