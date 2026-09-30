import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Save,
  Users,
  Calendar,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { Etut, Student, EtutStudentAttendance } from '../../types';
import { dataService } from '../../services/dataService';

interface EtutAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  etut: Etut;
  allStudents: Student[];
}

export const EtutAttendanceModal: React.FC<EtutAttendanceModalProps> = ({
  isOpen,
  onClose,
  etut,
  allStudents,
}) => {
  // Assigned students list
  const assignedStudents = React.useMemo(() => {
    if (etut.assignedStudentIds === 'all') {
      return allStudents;
    }
    const ids = Array.isArray(etut.assignedStudentIds) ? etut.assignedStudentIds : [];
    return allStudents.filter((s) => ids.includes(s.id));
  }, [etut, allStudents]);

  // Initial attendance state map
  const [attendanceMap, setAttendanceMap] = useState<Record<string, EtutStudentAttendance>>(() => {
    const initial: Record<string, EtutStudentAttendance> = {};
    assignedStudents.forEach((std) => {
      if (etut.studentAttendance && etut.studentAttendance[std.id]) {
        initial[std.id] = { ...etut.studentAttendance[std.id] };
      } else {
        // Default to 'present' or unselected
        initial[std.id] = {
          studentId: std.id,
          studentName: std.name,
          status: 'present',
          note: '',
          updatedAt: new Date().toISOString(),
        };
      }
    });
    return initial;
  });

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const handleStatusChange = (
    studentId: string,
    studentName: string,
    status: 'present' | 'absent' | 'late' | 'excused'
  ) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: {
        studentId,
        studentName,
        status,
        note: prev[studentId]?.note || '',
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        note,
      },
    }));
  };

  const setAllStatus = (status: 'present' | 'absent') => {
    setAttendanceMap((prev) => {
      const updated = { ...prev };
      assignedStudents.forEach((std) => {
        updated[std.id] = {
          studentId: std.id,
          studentName: std.name,
          status,
          note: prev[std.id]?.note || '',
          updatedAt: new Date().toISOString(),
        };
      });
      return updated;
    });
  };

  const handleSave = () => {
    dataService.updateEtutAttendance(etut.id, attendanceMap);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  const filteredStudents = assignedStudents.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.studentNumber && s.studentNumber.includes(searchTerm)) ||
    (s.className && s.className.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const presentCount = Object.values(attendanceMap).filter((a) => a.status === 'present').length;
  const absentCount = Object.values(attendanceMap).filter((a) => a.status === 'absent').length;
  const lateCount = Object.values(attendanceMap).filter((a) => a.status === 'late').length;
  const excusedCount = Object.values(attendanceMap).filter((a) => a.status === 'excused').length;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/95 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                <span>Etüt Yoklama ve Devamsızlık Takibi</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {etut.subject}
                </span>
              </h3>
              <p className="text-xs text-slate-400 flex items-center space-x-2 mt-0.5">
                <span>{etut.topic || 'Genel Konu'}</span>
                <span>•</span>
                <span className="text-amber-400">{new Date(etut.date).toLocaleDateString('tr-TR')} {etut.time}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Summary Pill & Mass Actions */}
        <div className="px-6 py-3 bg-slate-950/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400">Katılım Durumu:</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20">
              {presentCount} Geldi
            </span>
            <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 font-bold border border-rose-500/20">
              {absentCount} Gelmedi
            </span>
            {lateCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-bold border border-amber-500/20">
                {lateCount} Geç
              </span>
            )}
            {excusedCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 font-bold border border-blue-500/20">
                {excusedCount} İzinli
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setAllStatus('present')}
              className="text-xs font-semibold px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
            >
              ✓ Tümünü Geldi Yap
            </button>
            <button
              type="button"
              onClick={() => setAllStatus('absent')}
              className="text-xs font-semibold px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg transition-colors cursor-pointer"
            >
              ✕ Tümünü Gelmedi Yap
            </button>
          </div>
        </div>

        {/* Öğretmen Görüş ve Düşünceleri Banner */}
        {etut.teacherFeedback && (
          <div className="mx-6 mt-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-200 shrink-0">
            <strong className="text-amber-300 font-semibold block text-[11px]">💬 Öğretmen Düşünce ve Görüşleri:</strong>
            <p className="italic text-slate-200 mt-1 leading-relaxed">"{etut.teacherFeedback}"</p>
          </div>
        )}

        {/* Search bar if many students */}
        {assignedStudents.length > 5 && (
          <div className="px-6 pt-3 shrink-0">
            <input
              type="text"
              placeholder="Öğrenci adı veya numarası ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}

        {/* Student List */}
        <div className="p-6 overflow-y-auto space-y-3">
          {assignedStudents.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              Bu etüte atanmış herhangi bir öğrenci bulunmamaktadır.
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              Aramanıza uygun öğrenci bulunamadı.
            </div>
          ) : (
            filteredStudents.map((std) => {
              const currentStatus = attendanceMap[std.id]?.status || 'present';
              const currentNote = attendanceMap[std.id]?.note || '';

              return (
                <div
                  key={std.id}
                  className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    currentStatus === 'present'
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : currentStatus === 'absent'
                      ? 'bg-rose-950/25 border-rose-500/30'
                      : currentStatus === 'late'
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-blue-950/20 border-blue-500/30'
                  }`}
                >
                  {/* Student details */}
                  <div className="flex items-center space-x-3">
                    <img
                      src={
                        std.avatar ||
                        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.name)}`
                      }
                      alt={std.name}
                      className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 shrink-0"
                    />
                    <div>
                      <div className="text-sm font-bold text-white">
                        {std.name}
                      </div>
                    </div>
                  </div>

                  {/* Attendance Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status Toggle Group */}
                    <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(std.id, std.name, 'present')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentStatus === 'present'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-emerald-400'
                        }`}
                      >
                        Geldi
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(std.id, std.name, 'absent')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentStatus === 'absent'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-rose-400'
                        }`}
                      >
                        Gelmedi
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(std.id, std.name, 'late')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentStatus === 'late'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-amber-400'
                        }`}
                      >
                        Geç
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(std.id, std.name, 'excused')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          currentStatus === 'excused'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-blue-400'
                        }`}
                      >
                        İzinli
                      </button>
                    </div>

                    {/* Note input */}
                    <input
                      type="text"
                      placeholder="Not ekle (Örn: 10 dk geç, izinli)..."
                      value={currentNote}
                      onChange={(e) => handleNoteChange(std.id, e.target.value)}
                      className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-500 w-36 sm:w-44 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/95 shrink-0">
          <div className="text-xs text-slate-400">
            {savedSuccess && (
              <span className="text-emerald-400 font-bold flex items-center space-x-1.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                <span>Yoklama başarıyla kaydedildi ve tüm cihazlarla eşitlendi!</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/25 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Yoklamayı Kaydet</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
