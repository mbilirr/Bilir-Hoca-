// Kullanıcı yönetimi › rol ve yetki penceresi (Aşama 354d: ayrı parça, yalnız gerekince yüklenir)
import { ShieldCheck, Crown, GraduationCap, Check, AlertTriangle } from 'lucide-react';
import { InfoTip } from '../../ui/Compact';
import { MailOptIn } from '../../Teacher/FormParts';
import { Modal } from '../../ui/kit';
import { isTeacherAccount } from './ortak';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function RolPenceresi() {
  const { roleModalUser, setRoleModalUser, selectedTargetRole, setSelectedTargetRole, notifyTeacher, setNotifyTeacher, handleSaveRoleChange } = useKullaniciBaglam();
  return (
    <>
      {roleModalUser && (
        <Modal
          open
          onClose={() => setRoleModalUser(null)}
          size="md"
          icon={ShieldCheck}
          tone="warning"
          title="Rol ve Yetki Ata"
          description={
            <>
              <strong>{roleModalUser.name}</strong> (@{roleModalUser.username}) için sistem rolünü belirleyin.
            </>
          }
          govdeClass="p-6 space-y-5"
          footer={
            <>
              <button type="button" onClick={() => setRoleModalUser(null)} className="ui-btn ui-btn-secondary min-w-24">
                Vazgeç
              </button>
              <button type="button" onClick={handleSaveRoleChange} className="ui-btn ui-btn-warning min-w-24">
                Yetkiyi Kaydet
              </button>
            </>
          }
        >
            {/* Role Options */}
            <div className="space-y-2.5">
              {/* Admin */}
              <div
                onClick={() => setSelectedTargetRole('admin')}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-start space-x-3 ${
                  selectedTargetRole === 'admin'
                    ? 'bg-warning/15 border-warning/60 ring-2 ring-warning/20 text-fg'
                    : 'bg-canvas border-line text-fg-2 hover:border-line'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-warning/20 text-warning-fg flex items-center justify-center shrink-0 mt-0.5">
                  <Crown className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-fg inline-flex items-center gap-1">Sistem Yöneticisi (Admin)<InfoTip text="Kendi kurumu açılır: kendi öğretmen, sınıf ve öğrencilerini ekler ve yönetir. Yalnızca sizin açtığınız bölümleri ve izin verdiğiniz sınıfları görür (Yönetim › Kurumlar)." /></span>
                    {selectedTargetRole === 'admin' && <Check className="w-4 h-4 text-warning-fg" />}
                  </div>
                </div>
              </div>

              {/* Teacher */}
              <div
                onClick={() => setSelectedTargetRole('teacher')}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-start space-x-3 ${
                  selectedTargetRole === 'teacher'
                    ? 'bg-brand/15 border-brand/60 ring-2 ring-brand/20 text-fg'
                    : 'bg-canvas border-line text-fg-2 hover:border-line'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-brand/20 text-brand-fg flex items-center justify-center shrink-0 mt-0.5">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-fg inline-flex items-center gap-1">Öğretmen (Eğitmen)<InfoTip text="Yetkili olduğu sınıflarda ödev, etüt, soru hedefi, not ve yoklama işlemlerini yapar. Öğrenci, sınıf ve öğretmen ekleyip çıkaramaz." /></span>
                    {selectedTargetRole === 'teacher' && <Check className="w-4 h-4 text-brand-fg" />}
                  </div>
                </div>
              </div>

            </div>

            {/* Notice */}
            <div className="p-3 bg-canvas rounded-xl border border-line text-xs text-muted flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-warning-fg shrink-0" />
              {/* Aşama 184: kısaltıldı, ayrıntı ⓘ içinde */}
              <span className="flex-1">Yeni yetki en geç 1 saat içinde geçerli olur.</span>
              <InfoTip text="Yetki, kullanıcının giriş hesabına işlenir. Kullanıcı şu an açık oturumdaysa yeni yetkisi çıkış yapıp tekrar girdiğinde, en geç 1 saat içinde tamamen geçerli olur." />
            </div>

            {isTeacherAccount(roleModalUser) && (
              <MailOptIn
                id="teacher-role-notify"
                checked={notifyTeacher}
                onChange={setNotifyTeacher}
                label="Öğretmene yetki değişikliğini e-postayla bildir"
              />
            )}

        </Modal>
      )}
    </>
  );
}
export default RolPenceresi;
