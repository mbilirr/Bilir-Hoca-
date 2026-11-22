// Kullanıcı yönetimi › askıya alma ve silme onay pencereleri (Aşama 354d: ayrı parça)
import { Trash2, Ban } from 'lucide-react';
import { MailOptIn } from '../../Teacher/FormParts';
import { Modal } from '../../ui/kit';
import { isTeacherAccount } from './ortak';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function OnayPencereleri() {
  const { deleteModalUser, setDeleteModalUser, suspendModalUser, setSuspendModalUser, notifyTeacher, setNotifyTeacher, handleConfirmToggleSuspension, handleConfirmDelete } = useKullaniciBaglam();
  return (
    <>
      {suspendModalUser && (
        <Modal
          open
          onClose={() => setSuspendModalUser(null)}
          size="sm"
          icon={Ban}
          tone={suspendModalUser.isSuspended || suspendModalUser.status === 'suspended' ? 'success' : 'danger'}
          title={suspendModalUser.isSuspended || suspendModalUser.status === 'suspended' ? 'Hesabı Yeniden Aktifleştir' : 'Hesabı Dondur (Askıya Al)'}
          govdeClass="p-6 space-y-4"
          footer={
            <>
              <button type="button" onClick={() => setSuspendModalUser(null)} className="ui-btn ui-btn-secondary min-w-24">
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleSuspension}
                className={`ui-btn min-w-24 ${suspendModalUser.isSuspended || suspendModalUser.status === 'suspended' ? 'ui-btn-success' : 'ui-btn-danger'}`}
              >
                {suspendModalUser.isSuspended || suspendModalUser.status === 'suspended' ? 'Hesabı Aktifleştir' : 'Hesabı Askıya Al'}
              </button>
            </>
          }
        >
            <div className="space-y-1.5">
              <p className="text-xs text-muted leading-relaxed">
                <strong>{suspendModalUser.name}</strong> (@{suspendModalUser.username}) isimli kullanıcının hesabı{' '}
                {suspendModalUser.isSuspended || suspendModalUser.status === 'suspended'
                  ? 'tekrar aktif hale getirilecek ve sisteme giriş yapabilecektir.'
                  : 'geçici olarak dondurulacak; açık olan oturumları sonlandırılacak ve sisteme girişi engellenecektir.'}
              </p>
            </div>

            {isTeacherAccount(suspendModalUser) && (
              <div className="text-left">
                <MailOptIn
                  id="teacher-status-notify"
                  checked={notifyTeacher}
                  onChange={setNotifyTeacher}
                  label="Öğretmene e-postayla bildir"
                />
              </div>
            )}

        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: KALICI SİLME ONAY PENCERESİ */}
      {/* ========================================================================= */}
      {deleteModalUser && (
        <Modal
          open
          onClose={() => setDeleteModalUser(null)}
          size="sm"
          icon={Trash2}
          tone="danger"
          title="Kullanıcıyı Kalıcı Olarak Sil"
          govdeClass="p-6 space-y-4"
          footer={
            <>
              <button type="button" onClick={() => setDeleteModalUser(null)} className="ui-btn ui-btn-secondary min-w-24">
                Vazgeç
              </button>
              <button type="button" onClick={handleConfirmDelete} className="ui-btn ui-btn-danger min-w-24">
                Evet, Kalıcı Olarak Sil
              </button>
            </>
          }
        >
            <div className="space-y-1.5">
              <p className="text-xs text-muted leading-relaxed">
                <strong>{deleteModalUser.name}</strong> (@{deleteModalUser.username}) isimli kullanıcının hesabı,
                veritabanı kayıtları ve yetkileri kalıcı olarak silinecektir. Bu işlem geri alınamaz.
              </p>
            </div>

        </Modal>
      )}
    </>
  );
}
export default OnayPencereleri;
