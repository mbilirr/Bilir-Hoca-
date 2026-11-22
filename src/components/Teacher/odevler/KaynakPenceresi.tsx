// Ödevler › ödev materyallerini düzenleme penceresi (Aşama 361: ayrı parça, yalnız gerekince yüklenir)
import { CheckCircle2, Paperclip } from 'lucide-react';
import { HomeworkResourceUploader } from '../HomeworkResourceUploader';
import { Modal } from '../../ui/kit';
import { useOdevBaglam } from './useOdevYonetimi';

export function KaynakPenceresi() {
  const { editingResourcesHw, editingResourcesList, setEditingResourcesList, setEditingPendingResource, isSavingResources, isEditUploadBusy, setIsEditUploadBusy, closeEditResourcesModal, handleSaveEditedResources } = useOdevBaglam();
  return (
    <>
      {editingResourcesHw && (
        <Modal
          open
          onClose={closeEditResourcesModal}
          size="lg"
          icon={Paperclip}
          title="Ödev Materyallerini Düzenle"
          description={editingResourcesHw.title}
          govdeClass="p-6"
          footer={
            <>
              <button type="button" onClick={closeEditResourcesModal} className="ui-btn ui-btn-secondary min-w-24">
                İptal
              </button>
              <button
                type="button"
                onClick={handleSaveEditedResources}
                disabled={isSavingResources || isEditUploadBusy}
                className="ui-btn ui-btn-primary min-w-24"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isSavingResources ? 'Kaydediliyor…' : 'Materyalleri Kaydet'}</span>
              </button>
            </>
          }
        >
              <div className="space-y-4">
                <HomeworkResourceUploader
                  resources={editingResourcesList}
                  onChange={setEditingResourcesList}
                  onPendingChange={setEditingPendingResource}
                  storageFolder={`odev/${editingResourcesHw.id}`}
                  onBusyChange={setIsEditUploadBusy}
                />

              </div>
        </Modal>
      )}
    </>
  );
}
export default KaynakPenceresi;
