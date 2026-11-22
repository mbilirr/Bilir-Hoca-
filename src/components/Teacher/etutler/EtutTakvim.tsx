// Etütler › Haftalık Takvim görünümü (Aşama 362: ayrı parça, yalnız gerekince yüklenir)
import { WeeklyEtutCalendar } from '../WeeklyEtutCalendar';
import { useEtutBaglam } from './useEtutYonetimi';

export function EtutTakvim() {
  const { etuts, students, classes, viewMode, setViewMode, setViewEtut, setSelectedAttendanceEtutId, setEtutToDelete, setSelectedEtutForDispatch, setIsDispatchModalOpen, canEditEtut, setListSubject, setListTeacher, setDatePreset, setListTime, calendarEtuts, openEdit, openCopy, handleAddEtutForDate } = useEtutBaglam();
  return (
    <>
      {viewMode === 'calendar' && (
        <WeeklyEtutCalendar
          etuts={calendarEtuts}
          students={students}
          classes={classes}
          onAddEtutForDate={handleAddEtutForDate}
          onEditEtut={openEdit}
          onCopyEtut={openCopy}
          onDeleteEtut={(etut) => setEtutToDelete(etut)}
          canEditEtut={canEditEtut}
          onViewEtut={setViewEtut}
          onNotifyEtut={(etut) => {
            setSelectedEtutForDispatch(etut);
            setIsDispatchModalOpen(true);
          }}
          onAttendanceEtut={(etut) => {
            setSelectedAttendanceEtutId(etut.id);
            setListSubject('all');
            setListTeacher('all');
            setListTime('all');
            setDatePreset('all');
            setViewMode('attendance');
          }}
        />
      )}
    </>
  );
}
export default EtutTakvim;
