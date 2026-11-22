// Soru Takibi › hedef ver ve hedef listesi pencereleri (Aşama 354b: ayrı parça)
import { WeeklyTargetModal } from '../WeeklyTargetModal';
import { StudentTargetsModal } from '../StudentTargetsModal';
import { ClassTargetsModal } from '../ClassTargetsModal';
import { useSoruTakibiBaglam } from './useSoruTakibi';

export function HedefPencereleri() {
  const { classes, students, activeStudent, activeClass, handleSelectClass, handleSelectStudent, targetForm, setTargetForm, setTargetUpdateTrigger, allLogs, currentWeekStartDate, currentWeekEndDate, isStudentTargetsModalOpen, setIsStudentTargetsModalOpen, isClassTargetsModalOpen, setIsClassTargetsModalOpen, openNewTarget, openEditTarget, handleTargetSaved } = useSoruTakibiBaglam();
  return (
    <>
      <WeeklyTargetModal
        open={targetForm.open}
        onClose={() => {
          setTargetForm({ open: false });
          setTargetUpdateTrigger((prev) => prev + 1);
        }}
        students={students}
        classes={classes}
        editTarget={targetForm.editTarget}
        presetKind={targetForm.presetKind}
        presetStudentId={targetForm.presetStudentId}
        presetClassId={targetForm.presetClassId}
        defaultStart={currentWeekStartDate}
        defaultEnd={currentWeekEndDate}
        onSaved={handleTargetSaved}
      />

      {/* Öğrenci Hedefleri Listesi */}
      {isStudentTargetsModalOpen && (
        <StudentTargetsModal
          isOpen={isStudentTargetsModalOpen}
          onClose={() => {
            setIsStudentTargetsModalOpen(false);
            setTargetUpdateTrigger((prev) => prev + 1);
          }}
          students={students}
          classes={classes}
          allLogs={allLogs}
          onEdit={openEditTarget}
          onNew={() => openNewTarget('student', activeStudent?.id, activeStudent?.classId)}
          onSelectStudentToAnalyze={(stId) => {
            handleSelectStudent(stId);
          }}
        />
      )}

      {/* Sınıf Hedefleri Listesi */}
      {isClassTargetsModalOpen && (
        <ClassTargetsModal
          isOpen={isClassTargetsModalOpen}
          onClose={() => {
            setIsClassTargetsModalOpen(false);
            setTargetUpdateTrigger((prev) => prev + 1);
          }}
          classes={classes}
          students={students}
          allLogs={allLogs}
          onEdit={openEditTarget}
          onNew={() => openNewTarget('class', undefined, activeClass && activeClass.id !== 'all' ? activeClass.id : undefined)}
          onSelectClassToAnalyze={(clsId) => {
            handleSelectClass(clsId);
          }}
        />
      )}
    </>
  );
}
export default HedefPencereleri;
