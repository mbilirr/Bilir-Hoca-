import React, { useState, useEffect } from 'react';
import {
  Users,
  CalendarClock,
  Clock,
  AlertTriangle,
  BookOpen,
  ArrowUpRight,
  TrendingUp,
  CheckCircle2,
  CalendarDays,
  Sparkles,
  GraduationCap,
  HelpCircle,
  BarChart3,
  Target,
  Award,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';
import { Student, ClassGroup, Homework, HomeworkSubmission, Etut, TeacherTabType } from '../../types';
import { dataService } from '../../services/dataService';

interface TeacherStatsOverviewProps {
  students: Student[];
  classes: ClassGroup[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  etuts: Etut[];
  onNavigateTab: (tab: TeacherTabType) => void;
  headerRightSlot?: React.ReactNode;
  currentRole?: 'teacher' | 'student';
  onRoleChange?: (role: 'teacher' | 'student') => void;
}

export const TeacherStatsOverview: React.FC<TeacherStatsOverviewProps> = ({
  students,
  classes,
  homeworks,
  submissions,
  etuts,
  onNavigateTab,
  headerRightSlot,
  currentRole = 'teacher',
  onRoleChange,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const maxUpcomingStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // 1. YAKLAŞAN ÖDEVLER HESABI
  const safeHomeworks = Array.isArray(homeworks) ? homeworks : [];
  const upcomingHomeworks = safeHomeworks
    .filter((hw) => {
      if (!hw || !hw.dueDate) return false;
      const dueDay = hw.dueDate.slice(0, 10);
      return dueDay >= todayStr;
    })
    .sort((a, b) => (a?.dueDate || '').localeCompare(b?.dueDate || ''));

  const nextHomework = upcomingHomeworks[0];
  const dueTodayHomeworks = upcomingHomeworks.filter(
    (hw) => hw.dueDate && hw.dueDate.slice(0, 10) === todayStr
  );

  const formatHomeworkDueDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const day = dateStr.slice(0, 10);
    const time = dateStr.includes('T') ? dateStr.slice(11, 16) : '';
    if (day === todayStr) {
      return `Bugün${time ? ` ${time}` : ''}`;
    }
    const [year, month, d] = day.split('-');
    return `${d}.${month}.${year}${time ? ` ${time}` : ''}`;
  };

  // 2. ETÜT İSTATİSTİKLERİ
  const safeEtuts = Array.isArray(etuts) ? etuts : [];
  const todayEtuts = safeEtuts.filter((e) => e && e.date === todayStr);
  const upcomingEtuts = safeEtuts
    .filter((e) => e && e.date && e.date >= todayStr && e.date <= maxUpcomingStr)
    .sort((a, b) => {
      const dateA = a?.date || '';
      const dateB = b?.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a?.time || '').localeCompare(b?.time || '');
    });

  const nextEtut = upcomingEtuts[0];

  // 3. TAMAMLANMAMIŞ VE TAMAMLANMIŞ ÖDEV ORANI HESABI
  let totalExpectedSubmissions = 0;
  homeworks.forEach((hw) => {
    if (hw.assignedTo === 'all') {
      if (hw.targetClassIds && hw.targetClassIds.length > 0) {
        const classStudents = students.filter((s) => hw.targetClassIds?.includes(s.classId));
        totalExpectedSubmissions += Math.max(classStudents.length, 1);
      } else {
        totalExpectedSubmissions += students.length;
      }
    } else if (Array.isArray(hw.assignedTo)) {
      totalExpectedSubmissions += hw.assignedTo.length;
    } else {
      totalExpectedSubmissions += 1;
    }
  });

  if (totalExpectedSubmissions === 0 && homeworks.length > 0) {
    totalExpectedSubmissions = homeworks.length * Math.max(students.length, 1);
  }

  const completedSubmissionsCount = submissions.filter(
    (s) => s.status === 'on_time' || s.status === 'late'
  ).length;

  const pendingSubmissionsCount = Math.max(
    0,
    totalExpectedSubmissions - completedSubmissionsCount
  );

  const completedRate =
    totalExpectedSubmissions > 0
      ? Math.min(100, Math.round((completedSubmissionsCount / totalExpectedSubmissions) * 100))
      : 100;

  const uncompletedRate = 100 - completedRate;

  // 4. BU HAFTA ÇÖZÜLEN SORU HESABI
  const questionLogs = dataService.getQuestionLogs();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const currentWeekQuestions = questionLogs
    .filter((log) => log.date >= weekAgoStr)
    .reduce((sum, log) => sum + (log.totalQuestions || 0), 0);
  const activeStudentsCount = new Set(
    questionLogs.filter((l) => l.date >= weekAgoStr && l.totalQuestions > 0).map((l) => l.studentId)
  ).size;

  // Açılır Menü Öğretmen Yönetimi State
  const [dropdownSubject, setDropdownSubject] = useState<string>('Fen Bilimleri');
  const [newDropdownTeacher, setNewDropdownTeacher] = useState<string>('');
  const [subjectTeachersMap, setSubjectTeachersMap] = useState<Record<string, string[]>>({});
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string>('');

  const refreshTeachersMap = () => {
    setSubjectTeachersMap(dataService.getSubjectTeachersMap());
  };

  useEffect(() => {
    refreshTeachersMap();
  }, []);

  const handleAddTeacherToDropdown = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDropdownTeacher.trim()) return;
    dataService.addTeacherToSubject(dropdownSubject, newDropdownTeacher.trim());
    setNewDropdownTeacher('');
    refreshTeachersMap();
    setActionSuccessMsg(`"${newDropdownTeacher.trim()}" eklendi`);
    setTimeout(() => setActionSuccessMsg(''), 2000);
  };

  const handleRemoveTeacherFromDropdown = (teacherName: string) => {
    dataService.removeTeacherFromSubject(dropdownSubject, teacherName);
    refreshTeachersMap();
  };

  const currentSubjectTeachers = subjectTeachersMap[dropdownSubject] || dataService.getTeachersForSubject(dropdownSubject);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Top Banner Bar with Looker Studio Insignia and Role Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-100 gap-3">
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0f172a] text-white flex items-center justify-center shadow-sm">
              <BarChart3 className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                  Looker Studio
                </span>
                <span className="text-[11px] text-slate-500 font-medium">Genel Eğitim Paneli</span>
              </div>
              <h3 className="text-base font-bold text-[#0f172a] tracking-tight">
                Öğretmen İstatistik ve Durum Özetleri
              </h3>
            </div>
          </div>

          {/* Öğretmen ve Öğrenci Profili Geçiş Butonu */}
          {onRoleChange && (
            <div
              className="inline-flex items-center bg-[#f1f5f9] p-1 rounded-xl border border-slate-200"
              title="Öğretmen ve Öğrenci Profili Arasında Geçiş Yapın"
            >
              <button
                type="button"
                onClick={() => onRoleChange('teacher')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentRole === 'teacher'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5 text-orange-400" />
                <span>Öğretmen Paneli</span>
              </button>

              <button
                type="button"
                onClick={() => onRoleChange('student')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentRole === 'student'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-orange-600'
                }`}
                title="Öğrenci profili ve portal görünümüne geçiş yap"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Öğrenci Görünümü</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Corner Slot for Notification Bell or Quick Action */}
        {headerRightSlot && (
          <div className="flex items-center space-x-2 self-end sm:self-auto">{headerRightSlot}</div>
        )}
      </div>

      {/* 4 Main Looker Studio Bento/Scorecard Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ================= CARD 1: YAKLAŞAN ÖDEVLER ================= */}
        <div
          onClick={() => onNavigateTab('homework')}
          className="group bg-white border border-slate-200/90 hover:border-orange-500/80 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Yaklaşan Ödevler
              </span>
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 border border-orange-200 flex items-center justify-center group-hover:scale-105 transition-all">
                <BookOpen className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                {upcomingHomeworks.length}
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  dueTodayHomeworks.length > 0
                    ? 'bg-orange-100 text-orange-800 border border-orange-300'
                    : upcomingHomeworks.length > 0
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {dueTodayHomeworks.length > 0
                  ? `Bugün ${dueTodayHomeworks.length} Teslim`
                  : upcomingHomeworks.length > 0
                  ? `${upcomingHomeworks.length} Aktif Ödev`
                  : 'Aktif Ödev Yok'}
              </span>
            </div>

            {nextHomework ? (
              <p className="text-xs text-slate-600 mt-2 truncate">
                <span className="text-orange-600 font-semibold">En Yakın Teslim:</span>{' '}
                <span className="text-[#0f172a] font-bold">
                  {formatHomeworkDueDate(nextHomework.dueDate)}
                </span>{' '}
                • {nextHomework.subject} ({nextHomework.title})
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-2">
                Önümüzdeki günlerde teslim tarihi yaklaşan yeni ödev bulunmuyor
              </p>
            )}
          </div>

          <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0f172a] group-hover:text-orange-600 transition-colors">
            <span>Ödev Kontrol Modülü</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-orange-500" />
          </div>
        </div>

        {/* ================= CARD 2: BUGÜN & YAKLAŞAN ETÜTLER ================= */}
        <div
          onClick={() => onNavigateTab('etuts')}
          className="group bg-white border border-slate-200/90 hover:border-[#1e3a8a] rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Bugün & Yaklaşan Etütler
              </span>
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center group-hover:scale-105 transition-all ${
                  todayEtuts.length > 0
                    ? 'bg-orange-50 text-orange-600 border-orange-200'
                    : 'bg-[#f1f5f9] text-[#1e3a8a] border-slate-200'
                }`}
              >
                <CalendarClock className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                {todayEtuts.length}
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  todayEtuts.length > 0
                    ? 'bg-orange-100 text-orange-800 border border-orange-300'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {todayEtuts.length > 0 ? 'Bugün Planlandı' : 'Bugün Etüt Yok'}
              </span>
            </div>

            {nextEtut ? (
              <p className="text-xs text-slate-600 mt-2 truncate">
                <span className="text-[#1e3a8a] font-semibold">En Yakın:</span>{' '}
                <span className="text-[#0f172a] font-bold">
                  {nextEtut.date === todayStr ? 'Bugün' : nextEtut.date} {nextEtut.time}
                </span>{' '}
                • {nextEtut.subject} ({nextEtut.topic})
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-2">
                Önümüzdeki günlerde planlanmış yeni etüt bulunmuyor
              </p>
            )}
          </div>

          <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0f172a] group-hover:text-[#1e3a8a] transition-colors">
            <span>
              {upcomingEtuts.length > 0
                ? `Toplam ${upcomingEtuts.length} Yaklaşan Oturum`
                : 'Etüt Takvimini Aç'}
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-[#1e3a8a]" />
          </div>
        </div>

        {/* ================= CARD 3: KURS & ÖDEV TESLİM ORANI ================= */}
        <div
          onClick={() => onNavigateTab('homework')}
          className="group bg-white border border-slate-200/90 hover:border-orange-500/80 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Kurs & Ödev Teslim Oranı
              </span>
              <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 border border-orange-200 flex items-center justify-center group-hover:scale-105 transition-all">
                <Clock className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-orange-600 tracking-tight">
                %{completedRate}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                Teslim Edildi
              </span>
            </div>

            {/* Looker Studio Progress Bar */}
            <div className="mt-2.5">
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${completedRate}%` }}
                  className="bg-orange-500 transition-all duration-500"
                  title={`Tamamlanan: %${completedRate}`}
                />
                <div
                  style={{ width: `${uncompletedRate}%` }}
                  className="bg-slate-300 transition-all duration-500"
                  title={`Bekleyen: %${uncompletedRate}`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                <span>
                  <strong className="text-orange-600">{completedSubmissionsCount}</strong> teslim edildi
                </span>
                <span>
                  <strong className="text-slate-700">{pendingSubmissionsCount}</strong> bekleniyor
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0f172a] group-hover:text-orange-600 transition-colors">
            <span>Teslim Detayları</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-orange-500" />
          </div>
        </div>

        {/* ================= CARD 4: ÖĞRENCİ SORU SAYISI TAKİP ================= */}
        <div
          onClick={() => onNavigateTab('question_tracking')}
          className="group bg-white border border-slate-200/90 hover:border-[#1e3a8a] rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Soru Sayısı & Analiz
              </span>
              <div className="w-9 h-9 rounded-xl bg-[#f1f5f9] text-[#1e3a8a] border border-slate-200 flex items-center justify-center group-hover:scale-105 transition-all">
                <HelpCircle className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                {currentWeekQuestions}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Bu Hafta Çözüldü
              </span>
            </div>

            <p className="text-xs text-slate-600 mt-2">
              <span className="text-orange-600 font-bold">{activeStudentsCount} öğrenci</span> bu hafta aktif soru çözümü kaydetti
            </p>
          </div>

          <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0f172a] group-hover:text-[#1e3a8a] transition-colors">
            <span>Looker Studio Analitiğini Aç</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-[#1e3a8a]" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ANA SAYFA AÇILIR BUTON ÖĞRETMEN YÖNETİMİ BÖLÜMÜ                           */}
      {/* Ders bazlı etüt açılır butonuna öğretmen atama ve silme bölümü          */}
      {/* ========================================================================= */}
      <div className="bg-[#f8fafc] border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#0f172a] flex items-center gap-2">
                <span>Etüt Açılır Buton Öğretmen Yönetimi</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                  Ders Bazlı
                </span>
              </h4>
              <p className="text-xs text-slate-500">
                Etüt oluştururken ders seçildiğinde açılır butonda görüntülenecek öğretmenleri atayın ve silin
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('etuts')}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto shadow-xs"
          >
            <span>Etüt Oluşturmaya Git</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
          </button>
        </div>

        {/* Ders Seçici Butonları */}
        <div className="mt-3.5 flex flex-wrap gap-1.5 items-center">
          {['Fen Bilimleri', 'Matematik', 'Türkçe', 'Sosyal Bilgiler', 'İngilizce', 'Din Kültürü', 'Fizik', 'Kimya', 'Biyoloji'].map((subj) => {
            const count = (subjectTeachersMap[subj] || dataService.getTeachersForSubject(subj)).length;
            const isSelected = dropdownSubject === subj;
            return (
              <button
                key={subj}
                type="button"
                onClick={() => setDropdownSubject(subj)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <span>{subj}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Seçili Dersin Öğretmenleri ve Yeni Öğretmen Ekleme */}
        <div className="mt-3.5 bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span>{dropdownSubject} Dersi Açılır Buton Öğretmenleri:</span>
              <span className="text-[11px] text-slate-400 font-medium">
                (İlk seçenek daima sabit &quot;Öğretmen&quot;dir)
              </span>
            </span>

            {/* Yeni Öğretmen Ekleme Formu */}
            <form onSubmit={handleAddTeacherToDropdown} className="flex items-center gap-2">
              <input
                type="text"
                value={newDropdownTeacher}
                onChange={(e) => setNewDropdownTeacher(e.target.value)}
                placeholder={`Yeni ${dropdownSubject} Öğretmeni...`}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 w-52 sm:w-60"
              />
              <button
                type="submit"
                disabled={!newDropdownTeacher.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ata</span>
              </button>
            </form>
          </div>

          {actionSuccessMsg && (
            <p className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>{actionSuccessMsg}</span>
            </p>
          )}

          {/* Öğretmen Rozetleri */}
          <div className="flex flex-wrap gap-2 pt-1">
            <div className="px-2.5 py-1 rounded-lg bg-slate-100 border border-dashed border-slate-300 text-slate-500 text-xs font-semibold italic flex items-center gap-1">
              <span>1. &quot;Öğretmen&quot; (Varsayılan)</span>
            </div>

            {currentSubjectTeachers.map((teacherName, idx) => (
              <div
                key={`${teacherName}-${idx}`}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-bold flex items-center gap-2 hover:bg-indigo-100/80 transition-colors"
              >
                <span>{teacherName}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTeacherFromDropdown(teacherName)}
                  className="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5 rounded transition-colors"
                  title={`${teacherName} öğretmenini bu dersten sil`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
