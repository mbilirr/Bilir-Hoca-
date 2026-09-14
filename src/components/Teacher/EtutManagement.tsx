import React, { useState, useMemo } from 'react';
import {
  CalendarDays,
  LayoutGrid,
  Plus,
  Clock,
  MapPin,
  Users,
  CalendarCheck,
  Trash2,
  Edit2,
  X,
  Sparkles,
  CheckCircle2,
  BookOpen,
  Save,
  Mail,
  School,
  GraduationCap,
  Filter,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Etut, Student, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';
import { createGoogleCalendarUrlForEtut, downloadIcsFile } from '../../lib/calendar';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { WeeklyEtutCalendar } from './WeeklyEtutCalendar';
import { SentCommunicationsModal } from './SentCommunicationsModal';
import {
  SCHOOL_LEVELS,
  MIDDLE_SCHOOL_GRADES,
  HIGH_SCHOOL_GRADES,
  MIDDLE_SCHOOL_SUBJECTS,
  HIGH_SCHOOL_SUBJECTS,
  SchoolLevelType,
  getGradesForSchoolLevel,
  getSubjectsForSchoolLevel,
} from '../../constants/schoolConstants';

interface EtutManagementProps {
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
}

export const EtutManagement: React.FC<EtutManagementProps> = ({ etuts, students, classes }) => {
  const [viewMode, setViewMode] = useState<'calendar' | 'cards'>('calendar');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSentCommunicationsOpen, setIsSentCommunicationsOpen] = useState(false);
  const [editingEtut, setEditingEtut] = useState<Etut | null>(null);
  const [etutToDelete, setEtutToDelete] = useState<Etut | null>(null);

  // Form states - Okul, Sınıf ve Dersler (Dinamik)
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevelType>('Ortaokul');
  const [gradeLevel, setGradeLevel] = useState<string>('5. Sınıf');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('Şube');
  const [subject, setSubject] = useState('Matematik');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('16:00');
  const [duration, setDuration] = useState(45);
  const [location, setLocation] = useState('Matematik Dersliği 102');
  const [notes, setNotes] = useState('');
  const [assigneeMode, setAssigneeMode] = useState<'all' | 'custom'>('custom');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Okul değiştiğinde sınıf ve ders listesini otomatik güncelle
  const handleSchoolChange = (newSchool: SchoolLevelType) => {
    setSchoolLevel(newSchool);
    const availableGrades = getGradesForSchoolLevel(newSchool);
    setGradeLevel(availableGrades[0]);
    setSelectedBranchFilter('Şube');
    const availableSubjects = getSubjectsForSchoolLevel(newSchool);
    if (!availableSubjects.includes(subject)) {
      setSubject(availableSubjects[0]);
    }
  };

  const currentAvailableGrades = getGradesForSchoolLevel(schoolLevel);
  const currentAvailableSubjects = getSubjectsForSchoolLevel(schoolLevel);

  // Öğrencinin seçili sınıf kademesine (örn. '5. Sınıf', '8. Sınıf') ait olup olmadığını belirleme
  const isStudentInGrade = (std: Student, targetGrade: string): boolean => {
    if (!targetGrade) return true;
    const targetNum = targetGrade.match(/\d+/)?.[0];
    if (!targetNum) return true;

    // 1. Öğrencinin doğrudan gradeLevel alanı
    if (std.gradeLevel) {
      const sNum = std.gradeLevel.match(/\d+/)?.[0];
      if (sNum === targetNum) return true;
    }

    // 2. Öğrencinin bağlı olduğu sınıfın gradeLevel alanı
    const parentClass = classes.find((c) => c.id === std.classId);
    if (parentClass?.gradeLevel) {
      const cNum = parentClass.gradeLevel.match(/\d+/)?.[0];
      if (cNum === targetNum) return true;
    }

    // 3. className alanı (Örn: "5. Sınıf - Şube A", "5-A", "8/B", "10-C")
    if (std.className) {
      const classNumMatch = std.className.match(/\b\d+\b/);
      if (classNumMatch && classNumMatch[0] === targetNum) return true;
      if (
        std.className.startsWith(`${targetNum}.`) ||
        std.className.startsWith(`${targetNum}-`) ||
        std.className.startsWith(`${targetNum}/`) ||
        std.className.startsWith(`${targetNum} `)
      ) {
        return true;
      }
    }

    return false;
  };

  // Öğrencinin seçili şubeye ait olup olmadığını belirleme ('Şube', 'Şube A', 'Şube B', ...)
  const isStudentInBranch = (std: Student, filterBranch: string): boolean => {
    if (!filterBranch || filterBranch === 'Şube' || filterBranch === 'all') return true;

    const letterMatch = filterBranch.match(/([A-F])/i);
    const targetLetter = letterMatch ? letterMatch[1].toUpperCase() : '';
    if (!targetLetter) return true;

    // 1. Öğrencinin doğrudan branch alanı
    if (std.branch) {
      const bUpper = std.branch.toUpperCase();
      if (
        bUpper === filterBranch.toUpperCase() ||
        bUpper === targetLetter ||
        bUpper.includes(`ŞUBE ${targetLetter}`) ||
        bUpper.includes(`SUBE ${targetLetter}`) ||
        bUpper.endsWith(targetLetter)
      ) {
        return true;
      }
    }

    // 2. Bağlı olduğu sınıfın branch alanı
    const parentClass = classes.find((c) => c.id === std.classId);
    if (parentClass?.branch) {
      const cbUpper = parentClass.branch.toUpperCase();
      if (
        cbUpper === filterBranch.toUpperCase() ||
        cbUpper === targetLetter ||
        cbUpper.includes(`ŞUBE ${targetLetter}`) ||
        cbUpper.includes(`SUBE ${targetLetter}`) ||
        cbUpper.endsWith(targetLetter)
      ) {
        return true;
      }
    }

    // 3. className dizesi (Örn: "5. Sınıf - Şube A", "5-A", "8A", "9/A")
    if (std.className) {
      const cnUpper = std.className.toUpperCase();
      const regex = new RegExp(`(^|\\s|[-_\\/.])(ŞUBE\\s*)?${targetLetter}(\\s|[-_\\/.]|$)`, 'i');
      if (
        regex.test(cnUpper) ||
        cnUpper.includes(`ŞUBE ${targetLetter}`) ||
        cnUpper.includes(`SUBE ${targetLetter}`) ||
        cnUpper.endsWith(`-${targetLetter}`) ||
        cnUpper.endsWith(` ${targetLetter}`)
      ) {
        return true;
      }
    }

    return false;
  };

  // Sadece seçili sınıf kademesine ait öğrenciler
  const gradeStudents = useMemo(() => {
    return students.filter((s) => isStudentInGrade(s, gradeLevel));
  }, [students, gradeLevel, classes]);

  // Şube açılır penceresi filtresine göre nihai gösterilecek öğrenciler
  const filteredStudents = useMemo(() => {
    return gradeStudents.filter((s) => isStudentInBranch(s, selectedBranchFilter));
  }, [gradeStudents, selectedBranchFilter, classes]);

  const handleToggleAllFiltered = () => {
    if (filteredStudents.length === 0) return;
    const filteredIds = filteredStudents.map((s) => s.id);
    const allSelected = filteredIds.every((id) => selectedStudentIds.includes(id));

    if (allSelected) {
      setSelectedStudentIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleToggleStudent = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const handleSaveEtut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !date || !time) return;

    // Kademe öğrencileri listesi
    const targetAssigned =
      assigneeMode === 'all'
        ? (gradeStudents.length > 0 ? gradeStudents.map((s) => s.id) : 'all')
        : selectedStudentIds;

    if (editingEtut) {
      dataService.updateEtut(editingEtut.id, {
        schoolLevel,
        gradeLevel,
        subject,
        topic,
        date,
        time,
        duration: Number(duration),
        location,
        notes,
        assignedStudentIds: targetAssigned,
      });
      setEditingEtut(null);
    } else {
      dataService.createEtut({
        schoolLevel,
        gradeLevel,
        subject,
        topic,
        date,
        time,
        duration: Number(duration),
        location,
        notes,
        assignedStudentIds: targetAssigned,
      });

      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.7 },
      });
    }

    setIsCreateModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setSchoolLevel('Ortaokul');
    setGradeLevel('5. Sınıf');
    setSelectedBranchFilter('Şube');
    setSubject('Matematik');
    setTopic('');
    setDate(new Date().toISOString().slice(0, 10));
    setTime('16:00');
    setDuration(45);
    setLocation('Derslik 102');
    setNotes('');
    setAssigneeMode('custom');
    setSelectedStudentIds([]);
  };

  const openEdit = (etut: Etut) => {
    setEditingEtut(etut);
    const sLevel = etut.schoolLevel || 'Ortaokul';
    setSchoolLevel(sLevel);
    setGradeLevel(etut.gradeLevel || getGradesForSchoolLevel(sLevel)[0]);
    setSelectedBranchFilter('Şube');
    setSubject(etut.subject);
    setTopic(etut.topic);
    setDate(etut.date);
    setTime(etut.time);
    setDuration(etut.duration);
    setLocation(etut.location);
    setNotes(etut.notes || '');
    if (etut.assignedStudentIds === 'all') {
      setAssigneeMode('all');
      setSelectedStudentIds([]);
    } else {
      setAssigneeMode('custom');
      setSelectedStudentIds(etut.assignedStudentIds);
    }
    setIsCreateModalOpen(true);
  };

  const handleAddEtutForDate = (dateStr: string) => {
    resetForm();
    setDate(dateStr);
    setEditingEtut(null);
    setIsCreateModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <CalendarDays className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Etüt & Birebir Takip Planlama</h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'calendar'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Haftalık Takvim</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'cards'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kart Listesi ({etuts.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsSentCommunicationsOpen(true)}
            className="flex items-center space-x-2 bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            title="Öğrencilere gönderilen tüm otomatik e-posta ve bildirim kayıtları"
          >
            <Mail className="w-4 h-4 text-indigo-400" />
            <span>Giden E-Posta & Bildirimler</span>
          </button>

          <button
            onClick={() => {
              resetForm();
              setEditingEtut(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Etüt Planla</span>
          </button>
        </div>
      </div>

      {/* Main Content: Weekly Calendar View OR Cards Grid */}
      {viewMode === 'calendar' ? (
        <WeeklyEtutCalendar
          etuts={etuts}
          students={students}
          classes={classes}
          onAddEtutForDate={handleAddEtutForDate}
          onEditEtut={openEdit}
          onDeleteEtut={(etut) => setEtutToDelete(etut)}
        />
      ) : (
        /* Etüt List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {etuts.map((etut) => {
            const assignedStudents =
              etut.assignedStudentIds === 'all'
                ? students
                : students.filter((s) => (etut.assignedStudentIds as string[]).includes(s.id));

            return (
              <div
                key={etut.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg relative group"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {etut.subject}
                      </span>
                      {etut.schoolLevel && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          {etut.schoolLevel === 'Ortaokul' ? '🏫 Ortaokul' : '🎓 Lise'}
                        </span>
                      )}
                      {etut.gradeLevel && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {etut.gradeLevel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEdit(etut)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title="Düzenle"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEtutToDelete(etut)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Etütü Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2 line-clamp-2">{etut.topic}</h3>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-slate-300 mb-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {new Date(etut.date).toLocaleDateString('tr-TR')} • {etut.time} ({etut.duration} dk)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      <span>{etut.location}</span>
                    </div>
                    {etut.notes && (
                      <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800/60 mt-1">
                        {etut.notes}
                      </p>
                    )}
                  </div>

                  {/* Assigned Students */}
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                      <span>Katılacak Öğrenciler ({assignedStudents.length})</span>
                      {etut.assignedStudentIds === 'all' && (
                        <span className="text-[10px] text-indigo-400">Tümü Dahil</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {assignedStudents.map((std) => (
                        <span
                          key={std.id}
                          className="inline-flex items-center space-x-1 text-[11px] bg-slate-800 text-slate-200 px-2 py-0.5 rounded-md border border-slate-700"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                          <span>{std.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <a
                    href={createGoogleCalendarUrlForEtut(etut)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-semibold transition-all"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    <span>Google Takvime Ekle</span>
                  </a>

                  <button
                    onClick={() =>
                      downloadIcsFile(
                        `etut-${etut.subject}-${etut.date}`,
                        `[ETÜT] ${etut.subject}: ${etut.topic}`,
                        etut.notes || `${etut.location} yerinde etüt çalışması`,
                        `${etut.date}T${etut.time}:00`,
                        etut.duration,
                        etut.location
                      )
                    }
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                    title=".ics Takvim İndir"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE/EDIT ETUT MODAL */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
            <div
              className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                <div className="flex items-center space-x-2">
                  <CalendarDays className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-lg font-bold text-white">
                    {editingEtut ? 'Etüt Bilgilerini Düzenle' : 'Yeni Etüt Oluştur'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

            <form onSubmit={handleSaveEtut} className="space-y-4">
              {/* Okul, Sınıf ve Ders Seçimi */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                    <School className="w-4 h-4 text-indigo-400" />
                    <span>Okul, Sınıf ve Branş Seçimi</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Seçtiğiniz okula göre sınıflar ve dersler otomatik filtrelenir
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Okul Açılır Penceresi */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Okul *
                    </label>
                    <select
                      value={schoolLevel}
                      onChange={(e) => handleSchoolChange(e.target.value as SchoolLevelType)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="Ortaokul">🏫 Ortaokul</option>
                      <option value="Lise">🎓 Lise</option>
                    </select>
                  </div>

                  {/* Sınıf Açılır Penceresi */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Sınıf *
                    </label>
                    <select
                      value={gradeLevel}
                      onChange={(e) => setGradeLevel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {currentAvailableGrades.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Ders Açılır Penceresi */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Ders *
                    </label>
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {currentAvailableSubjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Etüt Konusu & Kazanım *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Paragrafta Anlam ve Soru Çözümü / İkinci Dereceden Denklemler"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tarih *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Başlangıç Saati *</label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Süre (Dk)</label>
                  <input
                    type="number"
                    min={15}
                    step={5}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Derslik / Yer</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Örn: 204 No'lu Fen Laboratuvarı"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Açıklama / Not</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Yanlarında soru bankasını getirsinler..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Student Assignment: Tümü vs Ayrı Ayrı Seçim */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Etüte Katılacak Öğrenciler:
                  </label>
                  <span className="text-[11px] text-indigo-300 font-medium">
                    {gradeLevel} Kademesi Filtreli
                  </span>
                </div>

                <div className="flex items-center space-x-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setAssigneeMode('all')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      assigneeMode === 'all'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    👥 Tüm {gradeLevel} Öğrencileri ({gradeStudents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssigneeMode('custom')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      assigneeMode === 'custom'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🎯 Listeden Ayrı Ayrı Seç ({selectedStudentIds.filter((id) => gradeStudents.some((s) => s.id === id)).length})
                  </button>
                </div>

                {assigneeMode === 'custom' && (
                  <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-3">
                    {/* Filtreleme ve Seçim Üst Barı */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-700 flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-300 font-semibold">Öğrenci Seçimi:</span>
                        <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-500/30 font-medium">
                          {gradeLevel}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({filteredStudents.length} gösteriliyor)
                        </span>
                      </div>

                      <div className="flex items-center space-x-3">
                        {/* Şube Açılır Penceresi */}
                        <div className="flex items-center space-x-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700">
                          <Filter className="w-3.5 h-3.5 text-indigo-400" />
                          <select
                            id="etut-branch-filter"
                            value={selectedBranchFilter}
                            onChange={(e) => setSelectedBranchFilter(e.target.value)}
                            className="bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer"
                          >
                            <option value="Şube" className="bg-slate-900 text-white">Şube</option>
                            <option value="Şube A" className="bg-slate-900 text-white">Şube A</option>
                            <option value="Şube B" className="bg-slate-900 text-white">Şube B</option>
                            <option value="Şube C" className="bg-slate-900 text-white">Şube C</option>
                            <option value="Şube D" className="bg-slate-900 text-white">Şube D</option>
                            <option value="Şube E" className="bg-slate-900 text-white">Şube E</option>
                            <option value="Şube F" className="bg-slate-900 text-white">Şube F</option>
                          </select>
                        </div>

                        {/* Hızlı Seçim Butonu */}
                        <button
                          type="button"
                          onClick={handleToggleAllFiltered}
                          disabled={filteredStudents.length === 0}
                          className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline font-semibold cursor-pointer disabled:opacity-40 disabled:no-underline"
                        >
                          {filteredStudents.length > 0 &&
                          filteredStudents.every((s) => selectedStudentIds.includes(s.id))
                            ? 'Seçimi Kaldır'
                            : 'Tümünü Seç'}
                        </button>
                      </div>
                    </div>

                    {/* Öğrenci Listesi */}
                    <div className="max-h-52 overflow-y-auto pr-1">
                      {filteredStudents.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {filteredStudents.map((std) => {
                            const isChecked = selectedStudentIds.includes(std.id);
                            return (
                              <label
                                key={std.id}
                                className={`flex items-center space-x-2.5 p-2 rounded-xl border transition-all cursor-pointer text-xs ${
                                  isChecked
                                    ? 'bg-indigo-600/15 border-indigo-500/40 text-white shadow-sm'
                                    : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/60 text-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleStudent(std.id)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-white font-medium truncate">{std.name}</div>
                                  <div className="text-slate-400 text-[10px] flex items-center space-x-1">
                                    <span>{std.className || gradeLevel}</span>
                                    {std.branch && (
                                      <span className="text-indigo-300">({std.branch})</span>
                                    )}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 text-center rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400">
                          <Users className="w-6 h-6 mx-auto mb-1 text-slate-500 opacity-60" />
                          <p className="font-semibold text-slate-300">Bu Kriterlere Uygun Öğrenci Bulunamadı</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {gradeLevel} {selectedBranchFilter !== 'Şube' ? `• ${selectedBranchFilter}` : ''} için kayıtlı öğrenci bulunmuyor. Farklı bir sınıf kademesi veya şube seçebilirsiniz.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Otomatik Bildirim & E-Posta Bilgilendirme Notu */}
              <div className="p-3 bg-teal-950/40 border border-teal-500/30 rounded-xl flex items-start space-x-2.5 text-xs text-teal-200">
                <Mail className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block">
                    🔔 Otomatik Sistem Bildirimi ve E-Posta İletimi
                  </span>
                  <span>
                    Etüt kaydedildiğinde atanan öğrencilere anında sistem bildirimi düşer ve tarih, saat, derslik bilgilerini içeren kurumsal HTML e-posta otomatik olarak iletilir.
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingEtut ? 'Değişiklikleri Kaydet' : 'Etütü Kaydet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}

      {/* CONFIRM DELETE ETUT MODAL */}
      <ConfirmDeleteModal
        isOpen={!!etutToDelete}
        onClose={() => setEtutToDelete(null)}
        onConfirm={() => {
          if (etutToDelete) {
            dataService.deleteEtut(etutToDelete.id);
          }
        }}
        title="Etütü Sil"
        itemBadge={etutToDelete ? `${etutToDelete.subject} • ${etutToDelete.date} ${etutToDelete.time}` : undefined}
        description={`"${etutToDelete?.topic}" başlıklı etüt planını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmButtonText="Etütü Sil"
      />

      {/* Giden E-Posta & Bildirim İletim Günlüğü */}
      <SentCommunicationsModal
        isOpen={isSentCommunicationsOpen}
        onClose={() => setIsSentCommunicationsOpen(false)}
      />
    </div>
  );
};
