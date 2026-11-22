// Ödevler › ödev silme onayı ve öğrenci teslimini görüntüleme (Aşama 361: ayrı parça)
import { dataService } from '../../../services/dataService';
import { ConfirmDeleteModal } from '../../Common/ConfirmDeleteModal';
import { SubmissionViewModal } from '../SubmissionViewModal';
import { useOdevBaglam } from './useOdevYonetimi';

export function SilmeVeTeslimPencereleri() {
  const { homeworks, students, submissions, selectedHomeworkId, setSelectedHomeworkId, setSaveFeedback, showSaveError, homeworkToDelete, setHomeworkToDelete, viewingSubmissionKey, setViewingSubmissionKey } = useOdevBaglam();
  return (
    <>
      <ConfirmDeleteModal
        isOpen={!!homeworkToDelete}
        onClose={() => setHomeworkToDelete(null)}
        onConfirm={async () => {
          if (homeworkToDelete) {
            const deletedId = homeworkToDelete.id;
            setHomeworkToDelete(null);
            try {
              await dataService.deleteHomework(deletedId);
              if (selectedHomeworkId === deletedId) {
                setSelectedHomeworkId('');
              }
              setSaveFeedback('Ödev başarıyla silindi.');
            } catch (err: any) {
              showSaveError(err, 'Ödev silinemedi.');
            }
          }
        }}
        title="Ödevi Sil"
        itemBadge={homeworkToDelete ? `${homeworkToDelete.subject} • Son Teslim: ${new Date(homeworkToDelete.dueDate).toLocaleDateString('tr-TR')}` : undefined}
        description={`"${homeworkToDelete?.title}" başlıklı ödevi silmek istediğinize emin misiniz? Bu ödeve ait tüm öğrenci teslimleri ve değerlendirmeler de silinecektir.`}
        confirmButtonText="Ödevi Sil"
      />
      {/* ÖĞRENCİ TESLİMİNİ GÖRÜNTÜLEME */}
      <SubmissionViewModal
        homework={viewingSubmissionKey ? homeworks.find((h) => h.id === viewingSubmissionKey.homeworkId) || null : null}
        student={viewingSubmissionKey ? students.find((st) => st.id === viewingSubmissionKey.studentId) || null : null}
        submission={
          viewingSubmissionKey
            ? submissions.find(
                (sb) => sb.homeworkId === viewingSubmissionKey.homeworkId && sb.studentId === viewingSubmissionKey.studentId
              ) || null
            : null
        }
        onClose={() => setViewingSubmissionKey(null)}
      />
    </>
  );
}
export default SilmeVeTeslimPencereleri;
