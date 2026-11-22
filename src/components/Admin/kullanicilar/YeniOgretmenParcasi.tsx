// Kullanıcı yönetimi › yeni öğretmen hesabı penceresi (Aşama 354d: ayrı parça, yalnız gerekince yüklenir)

import { CreateTeacherAccountModal } from './YeniOgretmenPenceresi';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

export function YeniOgretmenParcasi() {
  const { isCreateTeacherOpen, setIsCreateTeacherOpen, showToast, loadData, reloadContacts } = useKullaniciBaglam();
  return (
    <>
      <CreateTeacherAccountModal
        isOpen={isCreateTeacherOpen}
        onClose={() => setIsCreateTeacherOpen(false)}
        onCreated={(name) => {
          showToast(`✓ "${name}" için öğretmen hesabı açıldı.`, 'success');
          loadData();
          reloadContacts();
        }}
      />
    </>
  );
}
export default YeniOgretmenParcasi;
