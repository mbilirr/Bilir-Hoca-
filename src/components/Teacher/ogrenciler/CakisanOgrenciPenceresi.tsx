// Öğrenciler sayfası › aynı öğrenci uyarısı penceresi (Aşama 354a: ayrı parça, yalnız gerekince yüklenir)
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../ui/kit';
import { useOgrenciBaglam } from './useOgrenciYonetimi';

export function CakisanOgrenciPenceresi() {
  const { duplicateWarning, setDuplicateWarning, handleDuplicateReplace } = useOgrenciBaglam();
  return (
    <>
      <Modal
        open={!!duplicateWarning}
        onClose={() => setDuplicateWarning(null)}
        closeOnBackdrop={false}
        icon={AlertCircle}
        tone="warning"
        title="Bu Numarayla Kayıtlı Öğrenci Var!"
        description="Sistemde bu öğrenciyle tamamen eşleşen kayıtlı bir profil tespit edildi."
        footer={
          <>
            <button type="button" onClick={() => setDuplicateWarning(null)} className="ui-btn ui-btn-secondary">
              Vazgeç ve Düzenlemeye Dön
            </button>
            <button type="button" onClick={handleDuplicateReplace} className="ui-btn ui-btn-warning">
              <CheckCircle2 className="w-4 h-4" />
              <span>Kayıtlı Öğrenciyi Güncelle</span>
            </button>
          </>
        }
      >
        {duplicateWarning && (
          <div className="space-y-4">
            <div className="bg-surface-2 rounded-xl p-3.5 border border-line space-y-3 text-xs">
              <div className="text-warning-fg font-bold uppercase tracking-wider text-2xs">📋 Çakışan Kayıt Bilgileri</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-fg-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted block">Öğrenci Adı Soyadı</span>
                  <span className="font-bold text-fg text-sm">{duplicateWarning.existingStudent.name}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted block">Okul Numarası</span>
                  <span className="font-mono font-bold text-warning-fg">#{duplicateWarning.existingStudent.studentNumber || '-'}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted block">Sınıf & Şube</span>
                  <span className="font-semibold text-fg">{duplicateWarning.existingStudent.className || '-'}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted block">İletişim</span>
                  <span className="text-muted truncate block">
                    {duplicateWarning.existingStudent.email || duplicateWarning.existingStudent.phone || 'Girilmedi'}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs text-fg-2 leading-relaxed">
              Öğrenci numarası giriş adı olduğu için aynı numarayla ikinci kayıt açılamaz. Kayıtlı öğrenciyi güncelleyin ya da numarayı düzeltin.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
export default CakisanOgrenciPenceresi;
