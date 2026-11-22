// Ödevler › sayfa başlığı ve sekme seçimi (Aşama 361: ayrı parça)
import { BookOpen, Plus, CheckCircle2, FileText, CalendarRange } from 'lucide-react';
import { PageHeader, Segmented } from '../../ui/kit';
import { useOdevBaglam } from './useOdevYonetimi';

export function OdevlerUst() {
  const { homeworks, activeTab, setActiveTab, canGive, openHomeworkForm } = useOdevBaglam();
  return (
    <>
      {/* Sayfa başlığı */}
      <PageHeader
        icon={BookOpen}
        tone="success"
        title="Ödevler"
        description={canGive ? 'Ödev oluşturun, teslimleri kontrol edin' : 'Öğretmenlerin verdiği ödevleri ve teslimleri inceleyin'}
        actions={
          canGive ? (
            <button
              type="button"
              onClick={() => {
                openHomeworkForm('create');
              }}
              id="btn-create-homework"
              className="ui-btn ui-btn-primary"
            >
              <Plus className="w-4 h-4" />
              <span>Ödev Oluştur</span>
            </button>
          ) : undefined
        }
      />
      <Segmented
        value={activeTab}
        onChange={(v) => setActiveTab(v)}
        items={[
          { value: 'tracker', label: 'Ödev Kontrol', icon: CheckCircle2, id: 'btn-tab-tracker' },
          { value: 'all', label: `Tüm Ödevler (${homeworks.length})`, icon: FileText, id: 'btn-tab-all' },
          { value: 'plan', label: 'Haftalık Plan', icon: CalendarRange, id: 'btn-tab-plan' },
        ]}
      />
    </>
  );
}
export default OdevlerUst;
