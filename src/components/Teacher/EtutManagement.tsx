import React, { useState, useMemo, useEffect } from 'react';
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
  BarChart3,
  FileText,
  MessageCircle,
  UserPlus,
  Check,
  Search,
  XCircle,
  AlertCircle,
  Info,
  HelpCircle,
  MessageSquareQuote,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Etut, Student, ClassGroup, Teacher } from '../../types';
import { dataService } from '../../services/dataService';
import { createGoogleCalendarUrlForEtut, downloadIcsFile } from '../../lib/calendar';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { WeeklyEtutCalendar } from './WeeklyEtutCalendar';
import { SentCommunicationsModal } from './SentCommunicationsModal';
import { EtutAnalysisReportModal } from './EtutAnalysisReportModal';
import { EtutNotificationModal } from './EtutNotificationModal';
import { EtutAttendanceModal } from './EtutAttendanceModal';
import { SubjectTeacherManagerModal } from './SubjectTeacherManagerModal';
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
  const [viewMode, setViewMode] = useState<'calendar' | 'cards' | 'attendance'>('calendar');
  const [selectedAttendanceEtutId, setSelectedAttendanceEtutId] = useState<string>(etuts[0]?.id || '');
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState<string>('');
  const [attendanceFeedback, setAttendanceFeedback] = useState<string | null>(null);
  const [attendanceNotes, setAttendanceNotes] = useState<Record<string, string>>({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSentCommunicationsOpen, setIsSentCommunicationsOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportSelectedStudentId, setReportSelectedStudentId] = useState<string | undefined>(undefined);
  const [editingEtut, setEditingEtut] = useState<Etut | null>(null);
  const [etutToDelete, setEtutToDelete] = useState<Etut | null>(null);
  const [selectedEtutForDispatch, setSelectedEtutForDispatch] = useState<Etut | null>(null);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [selectedEtutForAttendance, setSelectedEtutForAttendance] = useState<Etut | null>(null);
  const [isSubjectTeacherModalOpen, setIsSubjectTeacherModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Mobil veya bilgisayardan açıldığında en son etütleri anında buluttan senkronize et
  useEffect(() => {
    dataService.syncEtutsFromSupabase(true);
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    await dataService.syncEtutsFromSupabase(false);
    setTimeout(() => setIsSyncing(false), 500);
  };

  // Form states - Okul, Sınıf ve Dersler (Dinamik)
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevelType>('Ortaokul');
  const [gradeLevel, setGradeLevel] = useState<string>('5. Sınıf');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('Şube');
  const [subject, setSubject] = useState('Matematik');

  // Ders Saati / Periyodu (İsteğe Bağlı)
  const LESSON_PERIOD_OPTIONS = [
    'Ders',
    '1. Ders',
    '2. Ders',
    '3. Ders',
    '4. Ders',
    '5. Ders',
    '6. Ders',
    '7. Ders',
    '8. Ders',
  ];
  const [lessonPeriod, setLessonPeriod] = useState<string>('Ders');

  // Etüt Öğretmeni Seçimi (İsteğe Bağlı)
  const [allTeachers, setAllTeachers] = useState<Teacher[]>(() => dataService.getTeachers());
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedTeacherName, setSelectedTeacherName] = useState<string>('');
  const [selectedTeacherBranch, setSelectedTeacherBranch] = useState<string>('');
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState<boolean>(false);
  const [isNewTeacherFormOpen, setIsNewTeacherFormOpen] = useState<boolean>(false);
  const [newTeacherName, setNewTeacherName] = useState<string>('');
  const [newTeacherBranch, setNewTeacherBranch] = useState<string>('');
  const [newTeacherEmail, setNewTeacherEmail] = useState<string>('');
  const [newTeacherPhone, setNewTeacherPhone] = useState<string>('');
  const [newTeacherError, setNewTeacherError] = useState<string>('');
  const [teacherSearchQuery, setTeacherSearchQuery] = useState<string>('');

  // Hızlı Öğretmen Ekleme (Ders için anında kalıcı kaydetme)
  const [isQuickTeacherOpen, setIsQuickTeacherOpen] = useState(false);
  const [quickTeacherName, setQuickTeacherName] = useState('');
  const [quickTeacherSuccess, setQuickTeacherSuccess] = useState('');

  // Öğrenci Açılır Menüsü (Dropdown) & Arama (Sınıftan Bağımsız Bireysel Seçim)
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const [studentDropdownSearch, setStudentDropdownSearch] = useState('');
  const [showOnlySelectedGradeInDropdown, setShowOnlySelectedGradeInDropdown] = useState(false);

  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('16:00');
  const [duration, setDuration] = useState(45);
  const [location, setLocation] = useState('Matematik Dersliği 102');
  const [notes, setNotes] = useState('');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [assigneeMode, setAssigneeMode] = useState<'all' | 'custom'>('custom');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Dersi değiştiğinde öğretmeni hatırla ve otomatik seç
  const handleSubjectChange = (newSubject: string) => {
    setSubject(newSubject);
    const lastTeacher = dataService.getLastTeacherForSubject(newSubject);
    const subTeachers = dataService.getTeachersForSubject(newSubject);
    if (lastTeacher) {
      setSelectedTeacherName(lastTeacher);
      setSelectedTeacherBranch(newSubject);
    } else if (subTeachers.length > 0) {
      setSelectedTeacherName(subTeachers[0]);
      setSelectedTeacherBranch(newSubject);
    } else {
      setSelectedTeacherName('');
      setSelectedTeacherBranch('');
    }
  };

  // Okul değiştiğinde sınıf ve ders listesini otomatik güncelle
  const handleSchoolChange = (newSchool: SchoolLevelType) => {
    setSchoolLevel(newSchool);
    const availableGrades = getGradesForSchoolLevel(newSchool);
    setGradeLevel(availableGrades[0]);
    setSelectedBranchFilter('Şube');
    const availableSubjects = getSubjectsForSchoolLevel(newSchool);
    if (!availableSubjects.includes(subject)) {
      handleSubjectChange(availableSubjects[0]);
    }
  };

  // Form ilk açıldığında veya ders değiştiğinde kayıtlı öğretmeni yükle
  useEffect(() => {
    if (!selectedTeacherName) {
      const lastTeacher = dataService.getLastTeacherForSubject(subject);
      const subTeachers = dataService.getTeachersForSubject(subject);
      if (lastTeacher) {
        setSelectedTeacherName(lastTeacher);
        setSelectedTeacherBranch(subject);
      } else if (subTeachers.length > 0) {
        setSelectedTeacherName(subTeachers[0]);
        setSelectedTeacherBranch(subject);
      }
    }
  }, [subject]);

  const handleQuickAddTeacher = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = quickTeacherName.trim();
    if (!name) return;
    dataService.addTeacherToSubject(subject, name);
    dataService.setLastTeacherForSubject(subject, name);
    setSelectedTeacherName(name);
    setSelectedTeacherBranch(subject);
    setQuickTeacherName('');
    setIsQuickTeacherOpen(false);
    setQuickTeacherSuccess(`"${name}" kalıcı olarak ${subject} dersine kaydedildi ve seçildi.`);
    setTimeout(() => setQuickTeacherSuccess(''), 3000);
  };

  const currentAvailableGrades = getGradesForSchoolLevel(schoolLevel);
  const currentAvailableSubjects = getSubjectsForSchoolLevel(schoolLevel);

  // Öğrencinin seçili sınıf kademesine (örn. '5. Sınıf', '8. Sınıf', '11/D') ait olup olmadığını güvenle belirleme
  const isStudentInGrade = (std?: Student | null, targetGrade?: string): boolean => {
    if (!std) return false;
    if (!targetGrade || targetGrade === 'Tüm Sınıflar' || targetGrade === 'all' || targetGrade === 'Sınıf Seçiniz' || targetGrade === '') return true;

    // Tam sınıf adı eşleşmesi (örn: "11/D", "5-A", "8/B")
    if (std.className && typeof std.className === 'string' && std.className.trim().toLowerCase() === targetGrade.trim().toLowerCase()) {
      return true;
    }
    const safeClasses = Array.isArray(classes) ? classes : [];
    const parentClass = safeClasses.find((c) => c && c.id === std.classId);
    if (parentClass?.name && typeof parentClass.name === 'string' && parentClass.name.trim().toLowerCase() === targetGrade.trim().toLowerCase()) {
      return true;
    }

    const targetNum = targetGrade.match(/\d+/)?.[0];
    if (!targetNum) return true;

    // 1. Öğrencinin doğrudan gradeLevel alanı
    if (std.gradeLevel && typeof std.gradeLevel === 'string') {
      const sNum = std.gradeLevel.match(/\d+/)?.[0];
      if (sNum === targetNum) return true;
    }

    // 2. Öğrencinin bağlı olduğu sınıfın gradeLevel alanı
    if (parentClass?.gradeLevel && typeof parentClass.gradeLevel === 'string') {
      const cNum = parentClass.gradeLevel.match(/\d+/)?.[0];
      if (cNum === targetNum) return true;
    }
    if (parentClass?.name && typeof parentClass.name === 'string') {
      const cnMatch = parentClass.name.match(/\b\d+\b/);
      if (cnMatch && cnMatch[0] === targetNum) return true;
    }

    // 3. className alanı (Örn: "5. Sınıf - Şube A", "5-A", "8/B", "10-C", "11/D")
    if (std.className && typeof std.className === 'string') {
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

  // Öğrencinin seçili şubeye ait olup olmadığını güvenle belirleme ('Şube', 'A', 'B', ...)
  const isStudentInBranch = (std?: Student | null, filterBranch?: string): boolean => {
    if (!std) return false;
    if (!filterBranch || filterBranch === 'Şube' || filterBranch === 'all' || filterBranch === 'Tüm Şubeler' || filterBranch === '') return true;

    const letterMatch = filterBranch.match(/([A-F])/i);
    const targetLetter = letterMatch ? letterMatch[1].toUpperCase() : '';
    if (!targetLetter) return true;

    // 1. Öğrencinin doğrudan branch alanı
    if (std.branch && typeof std.branch === 'string') {
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
    const safeClasses = Array.isArray(classes) ? classes : [];
    const parentClass = safeClasses.find((c) => c && c.id === std.classId);
    if (parentClass?.branch && typeof parentClass.branch === 'string') {
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

    // 3. className dizesi (Örn: "5. Sınıf - Şube A", "5-A", "8A", "9/A", "11/D")
    if (std.className && typeof std.className === 'string') {
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
    const safeStudents = Array.isArray(students) ? students : [];
    return safeStudents.filter((s) => s && isStudentInGrade(s, gradeLevel));
  }, [students, gradeLevel, classes]);

  // Şube açılır penceresi filtresine göre nihai gösterilecek öğrenciler
  const filteredStudents = useMemo(() => {
    return gradeStudents.filter((s) => s && isStudentInBranch(s, selectedBranchFilter));
  }, [gradeStudents, selectedBranchFilter, classes]);

  // "Öğrenci Seçiniz" arama kutulu açılır butonu için dinamik liste
  // Sınıf seçilmemiş olsa bile tüm öğrencileri arayabilir ve listeler
  const dropdownStudents = useMemo(() => {
    const safeStudents = Array.isArray(students) ? students : [];
    let list = safeStudents.filter(Boolean);

    if (showOnlySelectedGradeInDropdown && gradeLevel && gradeLevel !== 'Tüm Sınıflar') {
      list = list.filter((s) => isStudentInGrade(s, gradeLevel));
      if (selectedBranchFilter && selectedBranchFilter !== 'Şube' && selectedBranchFilter !== 'Tüm Şubeler') {
        list = list.filter((s) => isStudentInBranch(s, selectedBranchFilter));
      }
    }

    if (studentDropdownSearch.trim()) {
      const q = studentDropdownSearch.trim().toLowerCase();
      list = list.filter((s) => {
        const name = (s.name || '').toLowerCase();
        const cName = (s.className || '').toLowerCase();
        const num = (s.studentNumber || (s as any).number || '').toString().toLowerCase();
        return name.includes(q) || cName.includes(q) || num.includes(q);
      });
    }

    return list;
  }, [students, showOnlySelectedGradeInDropdown, gradeLevel, selectedBranchFilter, studentDropdownSearch, classes]);

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

  // Türkçe karakter duyarsız normalizasyon
  const normalizeBranchText = (txt?: string) =>
    (txt || '')
      .toLowerCase()
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .trim();

  // Seçili derse göre filtrelenmiş öğretmenler (Örn: Matematik seçildiğinde Matematik öğretmenleri)
  const branchMatchedTeachers = useMemo(() => {
    const normSub = normalizeBranchText(subject);
    return allTeachers.filter((t) => {
      const normBranch = normalizeBranchText(t.branch);
      if (!normBranch) return true;
      return (
        normBranch.includes(normSub) ||
        normSub.includes(normBranch) ||
        (normSub.includes('mat') && normBranch.includes('mat')) ||
        (normSub.includes('fen') && (normBranch.includes('fen') || normBranch.includes('fizik') || normBranch.includes('kimya') || normBranch.includes('biyoloji'))) ||
        (normSub.includes('turk') && (normBranch.includes('turk') || normBranch.includes('edebiyat'))) ||
        (normSub.includes('sosyal') && (normBranch.includes('sosyal') || normBranch.includes('tarih') || normBranch.includes('cografya')))
      );
    });
  }, [allTeachers, subject]);

  // Arama filtresi ile aranan öğretmenler
  const filteredTeacherList = useMemo(() => {
    if (!teacherSearchQuery.trim()) return branchMatchedTeachers;
    const q = normalizeBranchText(teacherSearchQuery);
    return branchMatchedTeachers.filter(
      (t) =>
        normalizeBranchText(t.name).includes(q) ||
        normalizeBranchText(t.branch).includes(q) ||
        normalizeBranchText(t.email).includes(q)
    );
  }, [branchMatchedTeachers, teacherSearchQuery]);

  // Yeni öğretmen kaydetme işlemi
  const handleAddNewTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherName.trim()) {
      setNewTeacherError('Lütfen öğretmen adını ve soyadını giriniz.');
      return;
    }
    const branchToSave = newTeacherBranch.trim() || subject;
    try {
      const created = dataService.addApprovedTeacher({
        name: newTeacherName.trim(),
        branch: branchToSave,
        email: newTeacherEmail.trim(),
        phone: newTeacherPhone.trim(),
      });
      // Listeyi güncelle
      const updatedList = dataService.getTeachers();
      setAllTeachers(updatedList);
      // Yeni eklenen öğretmeni etüt için seç
      setSelectedTeacherId(created.id);
      setSelectedTeacherName(created.name);
      setSelectedTeacherBranch(created.branch);
      // Modalları kapat ve temizle
      setNewTeacherName('');
      setNewTeacherBranch('');
      setNewTeacherEmail('');
      setNewTeacherPhone('');
      setNewTeacherError('');
      setIsNewTeacherFormOpen(false);
      setIsTeacherModalOpen(false);
    } catch (err: any) {
      setNewTeacherError(err.message || 'Öğretmen eklenirken bir hata oluştu.');
    }
  };

  const handleSaveEtut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !date || !time) return;

    // Bireysel öğrenci seçimi doğrulaması
    if (assigneeMode === 'custom' && selectedStudentIds.length === 0) {
      alert('Lütfen etüt verilecek en az bir öğrenci seçiniz veya "Tüm Sınıf Öğrencileri" seçeneğini kullanınız.');
      return;
    }

    // Seçilen öğretmen ismini bu ders için kalıcı olarak hafızaya al
    if (selectedTeacherName && selectedTeacherName.trim()) {
      dataService.addTeacherToSubject(subject, selectedTeacherName.trim());
      dataService.setLastTeacherForSubject(subject, selectedTeacherName.trim());
    }

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
        teacherFeedback,
        lessonPeriod: lessonPeriod || 'Ders',
        teacherId: selectedTeacherId || undefined,
        teacherName: selectedTeacherName || undefined,
        teacherBranch: selectedTeacherBranch || subject,
        assignedStudentIds: targetAssigned,
      });
      setEditingEtut(null);
    } else {
      const createdEtut = dataService.createEtut({
        schoolLevel,
        gradeLevel,
        subject,
        topic,
        date,
        time,
        duration: Number(duration),
        location,
        notes,
        teacherFeedback,
        lessonPeriod: lessonPeriod || 'Ders',
        teacherId: selectedTeacherId || undefined,
        teacherName: selectedTeacherName || undefined,
        teacherBranch: selectedTeacherBranch || subject,
        assignedStudentIds: targetAssigned,
      });

      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.7 },
      });

      // Otomatik e-posta bildirim & WhatsApp iletim ekranını aç
      setSelectedEtutForDispatch(createdEtut);
      setIsDispatchModalOpen(true);
    }

    setIsCreateModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setSchoolLevel('Ortaokul');
    setGradeLevel('5. Sınıf');
    setSelectedBranchFilter('Şube');
    setSubject('Matematik');
    setLessonPeriod('Ders');

    // Son kullanılan öğretmeni otomatik hatırla
    const lastTeacher = dataService.getLastTeacherForSubject('Matematik');
    const subTeachers = dataService.getTeachersForSubject('Matematik');
    if (lastTeacher) {
      setSelectedTeacherName(lastTeacher);
      setSelectedTeacherBranch('Matematik');
    } else if (subTeachers.length > 0) {
      setSelectedTeacherName(subTeachers[0]);
      setSelectedTeacherBranch('Matematik');
    } else {
      setSelectedTeacherName('');
      setSelectedTeacherBranch('');
    }

    setSelectedTeacherId('');
    setIsTeacherModalOpen(false);
    setIsNewTeacherFormOpen(false);
    setIsQuickTeacherOpen(false);
    setQuickTeacherName('');
    setTeacherSearchQuery('');
    setTopic('');
    setDate(new Date().toISOString().slice(0, 10));
    setTime('16:00');
    setDuration(45);
    setLocation('Matematik Dersliği 102');
    setNotes('');
    setTeacherFeedback('');
    setAssigneeMode('custom');
    setSelectedStudentIds([]);
    setIsStudentDropdownOpen(false);
    setStudentDropdownSearch('');
  };

  const openEdit = (etut: Etut) => {
    setEditingEtut(etut);
    const sLevel = etut.schoolLevel || 'Ortaokul';
    setSchoolLevel(sLevel);
    setGradeLevel(etut.gradeLevel || getGradesForSchoolLevel(sLevel)[0]);
    setSelectedBranchFilter('Şube');
    setSubject(etut.subject);
    setLessonPeriod(etut.lessonPeriod || 'Ders');
    setSelectedTeacherId(etut.teacherId || '');
    setSelectedTeacherName(etut.teacherName || '');
    setSelectedTeacherBranch(etut.teacherBranch || '');
    setIsTeacherModalOpen(false);
    setIsNewTeacherFormOpen(false);
    setIsQuickTeacherOpen(false);
    setQuickTeacherName('');
    setTopic(etut.topic);
    setDate(etut.date);
    setTime(etut.time);
    setDuration(etut.duration);
    setLocation(etut.location);
    setNotes(etut.notes || '');
    setTeacherFeedback(etut.teacherFeedback || '');
    if (etut.assignedStudentIds === 'all') {
      setAssigneeMode('all');
      setSelectedStudentIds([]);
    } else {
      setAssigneeMode('custom');
      setSelectedStudentIds(Array.isArray(etut.assignedStudentIds) ? etut.assignedStudentIds : []);
    }
    setIsStudentDropdownOpen(false);
    setStudentDropdownSearch('');
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
            <button
              type="button"
              onClick={() => setViewMode('attendance')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'attendance'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Yoklama & Devamsızlık</span>
            </button>
          </div>

          {/* Bulut Yenile / Eşitle Butonu */}
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            title="Bilgisayar ve telefondaki tüm etütleri anında buluttan senkronize et"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Eşitleniyor...' : 'Bulut Yenile'}</span>
          </button>

          {/* Etüt Analizi Butonu */}
          <button
            type="button"
            onClick={() => {
              setReportSelectedStudentId(undefined);
              setIsReportModalOpen(true);
            }}
            id="btn-etut-analysis"
            className="flex items-center space-x-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            title="Sınıf ve öğrenci bazlı profesyonel etüt analizi ve raporu"
          >
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>Etüt Analizi</span>
          </button>

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

      {/* Main Content: Weekly Calendar View, Cards Grid, or Dedicated Attendance Section */}
      {viewMode === 'calendar' && (
        <WeeklyEtutCalendar
          etuts={etuts}
          students={students}
          classes={classes}
          onAddEtutForDate={handleAddEtutForDate}
          onEditEtut={openEdit}
          onDeleteEtut={(etut) => setEtutToDelete(etut)}
          onNotifyEtut={(etut) => {
            setSelectedEtutForDispatch(etut);
            setIsDispatchModalOpen(true);
          }}
          onAttendanceEtut={(etut) => {
            setSelectedAttendanceEtutId(etut.id);
            setViewMode('attendance');
          }}
        />
      )}

      {viewMode === 'cards' && (
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
                className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 hover:shadow-xl transition-all flex flex-col justify-between shadow-md relative group text-slate-800"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {etut.subject}
                      </span>
                      {etut.schoolLevel && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {etut.schoolLevel === 'Ortaokul' ? '🏫 Ortaokul' : '🎓 Lise'}
                        </span>
                      )}
                      {etut.gradeLevel && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {etut.gradeLevel}
                        </span>
                      )}
                      {etut.lessonPeriod && etut.lessonPeriod !== 'Ders' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {etut.lessonPeriod}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEdit(etut)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Düzenle"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEtutToDelete(etut)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Etütü Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mb-2 line-clamp-2">{etut.topic}</h3>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-slate-800 font-medium">
                        {new Date(etut.date).toLocaleDateString('tr-TR')} • {etut.time} ({etut.duration} dk)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      <span className="text-slate-700 font-medium">{etut.location}</span>
                    </div>
                    {etut.teacherName && (
                      <div className="flex items-center space-x-2 text-indigo-900 font-semibold">
                        <Users className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Öğretmen: <strong>{etut.teacherName}</strong> {etut.teacherBranch ? `(${etut.teacherBranch})` : ''}</span>
                      </div>
                    )}
                    {etut.notes && (
                      <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200 mt-1">
                        <span className="font-semibold text-slate-700 not-italic">Açıklama:</span> {etut.notes}
                      </p>
                    )}
                    {etut.teacherFeedback && (
                      <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                        <div className="flex items-center space-x-1.5 font-bold text-amber-800 text-[11px]">
                          <MessageSquareQuote className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Öğretmen Görüş ve Düşünceleri:</span>
                        </div>
                        <p className="italic text-slate-700 leading-relaxed font-normal">
                          "{etut.teacherFeedback}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Attendance Summary & Button */}
                  <div className="mb-4 p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Yoklama / Devamsızlık
                      </div>
                      <div className="text-xs font-bold mt-0.5">
                        {etut.studentAttendance && Object.keys(etut.studentAttendance).length > 0 ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-700 font-bold">
                              {Object.values(etut.studentAttendance).filter((a) => a.status === 'present').length} Geldi
                            </span>
                            <span className="text-slate-400">•</span>
                            <span className="text-rose-600 font-bold">
                              {Object.values(etut.studentAttendance).filter((a) => a.status === 'absent').length} Gelmedi
                            </span>
                            {Object.values(etut.studentAttendance).filter((a) => a.status === 'late').length > 0 && (
                              <>
                                <span className="text-slate-400">•</span>
                                <span className="text-amber-700 font-bold">
                                  {Object.values(etut.studentAttendance).filter((a) => a.status === 'late').length} Geç
                                </span>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-700 text-[11px] font-normal">
                            Yoklama henüz alınmadı
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedEtutForAttendance(etut)}
                      className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 shadow-xs"
                      title="Etüte gelen ve gelmeyen öğrencileri işaretle"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Yoklama Al</span>
                    </button>
                  </div>

                  {/* Assigned Students */}
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
                      <span>Katılacak Öğrenciler ({assignedStudents.length})</span>
                      {etut.assignedStudentIds === 'all' && (
                        <span className="text-[10px] text-indigo-600 font-bold">Tümü Dahil</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {assignedStudents.map((std) => (
                        <button
                          type="button"
                          key={std.id}
                          onClick={() => {
                            setReportSelectedStudentId(std.id);
                            setIsReportModalOpen(true);
                          }}
                          className="inline-flex items-center space-x-1 text-[11px] bg-slate-50 hover:bg-indigo-50 hover:text-indigo-800 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 transition-colors cursor-pointer"
                          title={`${std.name} için etüt analizini ve PDF/DOCX raporunu görüntüle`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          <span>{std.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEtutForDispatch(etut);
                      setIsDispatchModalOpen(true);
                    }}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    title="WhatsApp ve Mail ile İlet"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp / Mail</span>
                  </button>

                  <a
                    href={createGoogleCalendarUrlForEtut(etut)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-1 py-1.5 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-medium transition-all"
                    title="Google Takvime Ekle"
                  >
                    <CalendarCheck className="w-3.5 h-3.5 text-blue-600" />
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
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs cursor-pointer transition-colors"
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

      {/* DEDICATED SIMPLE ETÜT DEVAMSIZLIK ARAYÜZÜ */}
      {viewMode === 'attendance' && (() => {
        const currentAttendanceEtut =
          etuts.find((e) => e.id === selectedAttendanceEtutId) || etuts[0] || null;

        // Atanan öğrenciler listesi
        const assignedStudents = (() => {
          if (!currentAttendanceEtut) return [];
          if (currentAttendanceEtut.assignedStudentIds === 'all') {
            return students;
          }
          const ids = Array.isArray(currentAttendanceEtut.assignedStudentIds)
            ? currentAttendanceEtut.assignedStudentIds
            : [];
          return students.filter((s) => ids.includes(s.id));
        })();

        // Filtrelenmiş öğrenci listesi
        const displayedStudents = assignedStudents.filter((std) => {
          if (!attendanceSearchQuery.trim()) return true;
          const q = attendanceSearchQuery.toLowerCase().trim();
          return (
            std.name.toLowerCase().includes(q) ||
            (std.studentNumber && std.studentNumber.includes(q)) ||
            (std.className && std.className.toLowerCase().includes(q))
          );
        });

        // Sayaçlar
        let countPresent = 0;
        let countAbsent = 0;
        let countLate = 0;
        let countExcused = 0;

        assignedStudents.forEach((std) => {
          const rec = currentAttendanceEtut?.studentAttendance?.[std.id];
          const st = rec?.status || 'present';
          if (st === 'present') countPresent++;
          else if (st === 'absent') countAbsent++;
          else if (st === 'late') countLate++;
          else if (st === 'excused') countExcused++;
        });

        const handleSingleAttendanceChange = (
          studentId: string,
          studentName: string,
          status: 'present' | 'absent' | 'late' | 'excused'
        ) => {
          if (!currentAttendanceEtut) return;
          const note = attendanceNotes[studentId] || currentAttendanceEtut.studentAttendance?.[studentId]?.note || '';
          dataService.updateEtutAttendance(currentAttendanceEtut.id, {
            [studentId]: {
              studentId,
              studentName,
              status,
              note,
              updatedAt: new Date().toISOString(),
            },
          });
          const label =
            status === 'present'
              ? 'Geldi'
              : status === 'absent'
              ? 'Gelmedi'
              : status === 'late'
              ? 'Geç Kaldı'
              : 'İzinli';
          setAttendanceFeedback(`✓ ${studentName}: "${label}" olarak kaydedildi.`);
          setTimeout(() => setAttendanceFeedback(null), 2500);
        };

        const handleBulkEtutAttendance = (status: 'present' | 'absent' | 'excused') => {
          if (!currentAttendanceEtut || assignedStudents.length === 0) return;
          const map: Record<string, any> = {};
          assignedStudents.forEach((std) => {
            const note = attendanceNotes[std.id] || currentAttendanceEtut.studentAttendance?.[std.id]?.note || '';
            map[std.id] = {
              studentId: std.id,
              studentName: std.name,
              status,
              note,
              updatedAt: new Date().toISOString(),
            };
          });
          dataService.updateEtutAttendance(currentAttendanceEtut.id, map);
          const label = status === 'present' ? 'Geldi' : status === 'absent' ? 'Gelmedi' : 'İzinli';
          setAttendanceFeedback(`✓ Tüm öğrenciler "${label}" olarak güncellendi.`);
          setTimeout(() => setAttendanceFeedback(null), 3000);
        };

        if (etuts.length === 0) {
          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-lg">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
                <CalendarCheck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Henüz Kayıtlı Etüt Bulunmuyor</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                Yoklama alabilmek için lütfen önce "Yeni Etüt Planla" butonu ile bir etüt oluşturunuz.
              </p>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setEditingEtut(null);
                  setIsCreateModalOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 cursor-pointer inline-flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>İlk Etütü Planla</span>
              </button>
            </div>
          );
        }

        return (
          <div className="space-y-5">
            {/* Bildirim Çubuğu */}
            {attendanceFeedback && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{attendanceFeedback}</span>
              </div>
            )}

            {/* 1. ETÜT SEÇİMİ AÇILIR MENÜSÜ */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <CalendarCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">Yoklaması Alınacak Etütü Seçiniz</h3>
                    <p className="text-xs text-slate-400">
                      Öğrencilerin devamsızlığını girmek için listeden ilgili etüt çalışmasını seçin.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 self-start sm:self-auto">
                  {etuts.length} Planlı Etüt
                </span>
              </div>

              {/* AÇILIR MENÜ */}
              <div className="relative">
                <select
                  value={currentAttendanceEtut?.id || ''}
                  onChange={(e) => setSelectedAttendanceEtutId(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-indigo-500/50 hover:border-indigo-400 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-inner"
                >
                  {etuts.map((e) => (
                    <option key={e.id} value={e.id} className="bg-slate-900 text-white py-2">
                      [{new Date(e.date).toLocaleDateString('tr-TR')} • {e.time}] [{e.subject}] {e.topic} — {e.location} {e.teacherName ? `(Öğr: ${e.teacherName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seçili Etüt Detay Paneli */}
              {currentAttendanceEtut && (
                <div className="mt-3.5 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {currentAttendanceEtut.subject}
                    </span>
                    <span className="text-sm font-bold text-white">{currentAttendanceEtut.topic}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{new Date(currentAttendanceEtut.date).toLocaleDateString('tr-TR')} • {currentAttendanceEtut.time} ({currentAttendanceEtut.duration} dk)</span>
                    </span>
                    <span className="flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      <span>{currentAttendanceEtut.location}</span>
                    </span>
                    {currentAttendanceEtut.teacherName && (
                      <span className="flex items-center space-x-1.5 text-indigo-300 font-medium">
                        <Users className="w-3.5 h-3.5" />
                        <span>{currentAttendanceEtut.teacherName}</span>
                      </span>
                    )}
                  </div>
                  {currentAttendanceEtut.teacherFeedback && (
                    <div className="w-full mt-2 pt-2 border-t border-slate-800/80 flex items-start space-x-2 text-xs text-amber-200/90 bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/15">
                      <MessageSquareQuote className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-amber-300 font-semibold block text-[11px]">Öğretmen Görüş ve Düşünceleri:</strong>
                        <span className="italic text-slate-300 font-normal">"{currentAttendanceEtut.teacherFeedback}"</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. ETÜTTEKİ ÖĞRENCİLER VE DEVAMSIZLIK LİSTESİ */}
            {currentAttendanceEtut && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
                {/* Header & Arama */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-white">
                        Etüt Öğrenci Yoklama Listesi
                      </h3>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {assignedStudents.length} Kayıtlı Öğrenci
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Öğrencinin devamsızlık durumunu tek tıkla işaretleyin.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={attendanceSearchQuery}
                      onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                      placeholder="Öğrenci ara..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Sayaçlar */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Toplam</span>
                    <span className="text-base font-bold text-white">{assignedStudents.length}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block">Geldi</span>
                    <span className="text-base font-bold text-emerald-300">{countPresent}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                    <span className="text-[10px] uppercase font-bold text-rose-400 block">Gelmedi</span>
                    <span className="text-base font-bold text-rose-300">{countAbsent}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <span className="text-[10px] uppercase font-bold text-amber-400 block">Geç Kaldı</span>
                    <span className="text-base font-bold text-amber-300">{countLate}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-center">
                    <span className="text-[10px] uppercase font-bold text-sky-400 block">İzinli</span>
                    <span className="text-base font-bold text-sky-300">{countExcused}</span>
                  </div>
                </div>

                {/* Toplu İşlem Butonları */}
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300">
                    Hızlı Toplu Yoklama:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBulkEtutAttendance('present')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>✓ Tümü Geldi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkEtutAttendance('absent')}
                      className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>✕ Tümü Gelmedi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkEtutAttendance('excused')}
                      className="px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>ℹ Tümü İzinli</span>
                    </button>
                  </div>
                </div>

                {/* ALT ALTA SIRALI ÖĞRENCİ LİSTESİ */}
                {assignedStudents.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
                    Bu etüte henüz öğrenci atanmamış. Etütü düzenleyerek öğrenci ekleyebilirsiniz.
                  </div>
                ) : displayedStudents.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
                    "{attendanceSearchQuery}" aramasına uygun öğrenci bulunamadı.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50">
                    {displayedStudents.map((std, idx) => {
                      const att = currentAttendanceEtut.studentAttendance?.[std.id];
                      const currentStatus = att?.status || 'present';
                      return (
                        <div
                          key={std.id}
                          className="p-3 sm:p-3.5 hover:bg-slate-800/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                        >
                          {/* Öğrenci Bilgisi */}
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="w-6 text-center text-xs font-mono text-slate-500 shrink-0">
                              {idx + 1}
                            </span>
                            <img
                              src={std.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.name)}`}
                              alt={std.name}
                              className="w-8 h-8 rounded-full bg-slate-800 object-cover border border-slate-700 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">{std.name}</h4>
                            </div>
                          </div>

                          {/* 4 Seçenek Butonu: GELDI, GELMEDI, GEÇ KALDI, İZİNLİ */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                            {/* Geldi */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'present')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'present'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400'
                                  : 'bg-slate-900 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-300 border border-slate-700 hover:border-emerald-500/40'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Geldi</span>
                            </button>

                            {/* Gelmedi */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'absent')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'absent'
                                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-400'
                                  : 'bg-slate-900 hover:bg-rose-600/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Gelmedi</span>
                            </button>

                            {/* Geç Kaldı */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'late')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'late'
                                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 ring-2 ring-amber-400'
                                  : 'bg-slate-900 hover:bg-amber-600/20 text-slate-300 hover:text-amber-300 border border-slate-700 hover:border-amber-500/40'
                              }`}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Geç Kaldı</span>
                            </button>

                            {/* İzinli */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'excused')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'excused'
                                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30 ring-2 ring-sky-400'
                                  : 'bg-slate-900 hover:bg-sky-600/20 text-slate-300 hover:text-sky-300 border border-slate-700 hover:border-sky-500/40'
                              }`}
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span>İzinli</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
              {/* 1. BLOK: Okul, Ders ve Etüt Öğretmeni Seçimi */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                    <School className="w-4 h-4 text-indigo-400" />
                    <span>Okul, Ders ve Öğretmen Bilgileri</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Ders için atanan öğretmen ismi sonraki etütlerde otomatik hatırlanır
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

                  {/* Ders Açılır Penceresi */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Ders *
                    </label>
                    <select
                      value={subject}
                      onChange={(e) => handleSubjectChange(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {currentAvailableSubjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Ders Saati / Periyodu Açılır Penceresi (İsteğe Bağlı) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Ders Saati</span>
                      <span className="text-[10px] text-slate-400 font-normal">İsteğe Bağlı</span>
                    </label>
                    <select
                      value={lessonPeriod}
                      onChange={(e) => setLessonPeriod(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {LESSON_PERIOD_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Etüt Öğretmeni Açılır Penceresi (Dropdown & Kalıcı Kayıt) */}
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-slate-200">Etüt Öğretmeni</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                        Kalıcı Kayıtlı
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setIsQuickTeacherOpen((p) => !p)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-bold underline underline-offset-2 cursor-pointer"
                      >
                        {isQuickTeacherOpen ? '✕ Kapat' : '+ Hızlı Öğretmen Ata'}
                      </button>
                      <span className="text-slate-600">•</span>
                      <button
                        type="button"
                        onClick={() => setIsSubjectTeacherModalOpen(true)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-bold underline underline-offset-2 cursor-pointer"
                        title="Bu dersin açılır menüsüne öğretmen ata veya sil"
                      >
                        Öğretmen Listesini Yönet
                      </button>
                    </div>
                  </div>

                  {/* Hızlı Öğretmen Ekleme Girişi */}
                  {isQuickTeacherOpen && (
                    <div className="p-3 mb-2 rounded-xl bg-slate-900 border border-emerald-500/30 flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        placeholder={`"${subject}" için yeni öğretmen adı ve soyadı...`}
                        value={quickTeacherName}
                        onChange={(e) => setQuickTeacherName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleQuickAddTeacher();
                          }
                        }}
                        className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuickAddTeacher()}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer shrink-0"
                      >
                        Kaydet & Ata
                      </button>
                    </div>
                  )}

                  {quickTeacherSuccess && (
                    <div className="p-2 mb-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium animate-in fade-in">
                      ✓ {quickTeacherSuccess}
                    </div>
                  )}

                  <div>
                    <select
                      id="select-etut-teacher-dropdown"
                      value={selectedTeacherName || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__ADD_NEW__') {
                          setIsQuickTeacherOpen(true);
                        } else {
                          setSelectedTeacherName(val);
                          setSelectedTeacherBranch(val ? subject : '');
                          if (val) {
                            dataService.addTeacherToSubject(subject, val);
                            dataService.setLastTeacherForSubject(subject, val);
                          }
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-semibold text-sm focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Öğretmen Seçiniz</option>
                      {dataService.getTeachersForSubject(subject).map((tName) => (
                        <option key={tName} value={tName}>
                          {tName}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Yeni Öğretmen Adı Ekle...</option>
                    </select>
                  </div>

                  {selectedTeacherName ? (
                    <div className="flex items-center justify-between p-2 mt-2 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200">
                      <span className="font-semibold">
                        Görevlendirilen Öğretmen: <strong className="text-white">{selectedTeacherName}</strong> ({subject})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTeacherName('');
                          setSelectedTeacherBranch('');
                        }}
                        className="text-rose-400 hover:text-rose-300 font-bold text-xs cursor-pointer ml-2"
                      >
                        Seçimi Temizle ✕
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Ders: <strong className="text-amber-300">{subject}</strong> • Seçtiğiniz öğretmen sistemde kalıcı tutulur ve bir sonraki etütte otomatik olarak seçilir.
                    </p>
                  )}
                </div>
              </div>

              {/* 2. BLOK: Sınıf, Şube ve Öğrenci Seçimi (Yan Yana & Sınıftan Bağımsız Öğrenci Seçimi) */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 flex-wrap gap-2">
                  <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4 text-indigo-400" />
                    <span>Sınıf, Şube ve Öğrenci Seçimi</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Sınıftan bağımsız olarak dilediğiniz öğrenciye bireysel etüt tanımlayabilirsiniz
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Sınıf Açılır Butonu */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Sınıf (Kademe)
                    </label>
                    <select
                      value={gradeLevel}
                      onChange={(e) => setGradeLevel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="Tüm Sınıflar">Sınıf Seçiniz (Tüm Sınıflar)</option>
                      {currentAvailableGrades.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                      {classes && classes.length > 0 && (
                        <optgroup label="Tanımlı Şube/Sınıf Grupları">
                          {classes.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Şube Açılır Butonu */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Şube
                    </label>
                    <select
                      id="etut-branch-filter"
                      value={selectedBranchFilter}
                      onChange={(e) => setSelectedBranchFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="Şube">Şube Seçiniz (Tümü)</option>
                      <option value="A">A Şubesi</option>
                      <option value="B">B Şubesi</option>
                      <option value="C">C Şubesi</option>
                      <option value="D">D Şubesi</option>
                      <option value="E">E Şubesi</option>
                      <option value="F">F Şubesi</option>
                    </select>
                  </div>

                  {/* Öğrenci Seçiniz Açılır Butonu (Arama Kutulu & Sınıftan Bağımsız) */}
                  <div className="relative">
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Öğrenci Seçiniz</span>
                    </label>

                    {/* Dropdown Açma Butonu */}
                    <button
                      type="button"
                      onClick={() => setIsStudentDropdownOpen((prev) => !prev)}
                      className={`w-full px-2.5 py-2 bg-slate-800 border rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                        selectedStudentIds.length > 0
                          ? 'border-indigo-500 text-white bg-indigo-950/30'
                          : 'border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 min-w-0 flex-1 truncate pr-1">
                        <Search className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate text-xs">
                          {selectedStudentIds.length === 0
                            ? 'Öğrenci Seçiniz'
                            : selectedStudentIds.length === 1
                            ? `${(students || []).find((s) => s.id === selectedStudentIds[0])?.name || '1 Öğrenci'}`
                            : `${selectedStudentIds.length} Öğrenci Seçildi`}
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
                          isStudentDropdownOpen ? 'rotate-180 text-indigo-400' : ''
                        }`}
                      />
                    </button>

                    {/* Açılır Panel (Arama Kutusu + Sadece Okul No ve İsim Listesi) */}
                    {isStudentDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setIsStudentDropdownOpen(false)}
                        />
                        <div className="absolute right-0 left-auto top-full mt-1.5 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col w-[300px] sm:w-[350px] max-w-[92vw] max-h-80 animate-in fade-in slide-in-from-top-2 duration-150">
                          {/* Arama Kutusu (En Üstte) */}
                          <div className="p-2.5 bg-slate-950 border-b border-slate-800 sticky top-0 z-10">
                            <div className="relative">
                              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                autoFocus
                                type="text"
                                value={studentDropdownSearch}
                                onChange={(e) => setStudentDropdownSearch(e.target.value)}
                                placeholder="Öğrenci ara (isim veya okul no)..."
                                className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                              />
                              {studentDropdownSearch && (
                                <button
                                  type="button"
                                  onClick={() => setStudentDropdownSearch('')}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Filtre Bilgi ve Toggle */}
                            <div className="flex items-center justify-between mt-2 pt-1 text-[11px] text-slate-400">
                              <span>
                                {dropdownStudents.length} öğrenci listelendi
                              </span>
                              {gradeLevel && gradeLevel !== 'Tüm Sınıflar' && (
                                <button
                                  type="button"
                                  onClick={() => setShowOnlySelectedGradeInDropdown((p) => !p)}
                                  className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 cursor-pointer"
                                >
                                  {showOnlySelectedGradeInDropdown
                                    ? 'Tüm Okulu Göster'
                                    : `Sadece ${gradeLevel}`}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Liste: Sadece Okul No ve Öğrenci İsmi */}
                          <div className="overflow-y-auto p-1.5 space-y-1 max-h-56 divide-y divide-slate-800/40">
                            {dropdownStudents.length > 0 ? (
                              dropdownStudents.map((std) => {
                                const isSelected = selectedStudentIds.includes(std.id);
                                const rawNo = (std.studentNumber || (std as any).number || '').toString().trim();
                                const hasValidNo = rawNo && rawNo !== 'Atandı' && rawNo !== 'Atanmadı' && !rawNo.includes('Atan');

                                return (
                                  <div
                                    key={std.id}
                                    onClick={() => {
                                      handleToggleStudent(std.id);
                                      setAssigneeMode('custom');
                                    }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition-colors gap-2 ${
                                      isSelected
                                        ? 'bg-indigo-600/25 text-white font-medium'
                                        : 'hover:bg-slate-800 text-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center space-x-2.5 min-w-0 flex-1 truncate">
                                      {hasValidNo ? (
                                        <span className="shrink-0 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-300 font-mono text-[11px] font-bold">
                                          No: {rawNo}
                                        </span>
                                      ) : (
                                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/60 text-slate-400 font-mono text-[10px]">
                                          No Yok
                                        </span>
                                      )}
                                      <span className="truncate text-xs font-semibold text-slate-100">
                                        {std.name}
                                      </span>
                                    </div>

                                    <div
                                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                        isSelected
                                          ? 'bg-indigo-600 border-indigo-500 text-white'
                                          : 'border-slate-700 bg-slate-800/60'
                                      }`}
                                    >
                                      {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="p-4 text-center text-xs text-slate-400">
                                Öğrenci bulunamadı.
                              </div>
                            )}
                          </div>

                          {/* Alt Bilgi & Kapat */}
                          <div className="p-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
                            <span className="text-[11px] text-slate-400">
                              {selectedStudentIds.length} öğrenci seçildi
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsStudentDropdownOpen(false)}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              Tamam
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* ÖĞRENCİ SEÇİMİ KUTUSU (Sınıf, Şube, Öğrenci Seçiniz Butonlarının Hemen Altında) */}
                <div className="pt-2 border-t border-slate-800 space-y-3">
                  {/* Mod Seçimi: Tüm Kademe vs Bireysel Öğrenciler */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setAssigneeMode('custom')}
                      className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                        assigneeMode === 'custom'
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>🎯 Bireysel / Seçili Öğrenciler ({selectedStudentIds.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssigneeMode('all')}
                      className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                        assigneeMode === 'all'
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>👥 Tüm {gradeLevel} Öğrencileri ({gradeStudents.length})</span>
                    </button>
                  </div>

                  {/* Bireysel Seçilen Öğrenci Rozetleri (Chips) */}
                  {selectedStudentIds.length > 0 && (
                    <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Seçilen Öğrenciler ({selectedStudentIds.length}):</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedStudentIds([])}
                          className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer underline"
                        >
                          Tümünü Kaldır
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                        {selectedStudentIds.map((id) => {
                          const std = (students || []).find((s) => s.id === id);
                          if (!std) return null;
                          const rawNo = (std.studentNumber || (std as any).number || '').toString().trim();
                          const hasValidNo = rawNo && rawNo !== 'Atandı' && rawNo !== 'Atanmadı' && !rawNo.includes('Atan');

                          return (
                            <span
                              key={id}
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-white text-xs font-medium"
                            >
                              {hasValidNo && (
                                <span className="text-[10px] text-amber-300 font-mono font-bold">
                                  No: {rawNo}
                                </span>
                              )}
                              <span>{std.name}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleStudent(id)}
                                className="text-slate-400 hover:text-rose-400 cursor-pointer p-0.5 ml-1"
                                title="Seçimi Kaldır"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Öğrenci Seçim Kutusu Listesi */}
                  {assigneeMode === 'custom' && (
                    <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800 flex-wrap gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-slate-300 font-semibold">Öğrenci Listesi:</span>
                          <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-500/30 font-medium">
                            {gradeLevel} {selectedBranchFilter !== 'Şube' && selectedBranchFilter !== 'Tüm Şubeler' ? `• ${selectedBranchFilter}` : ''}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            ({filteredStudents.length} öğrenci)
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={handleToggleAllFiltered}
                          disabled={filteredStudents.length === 0}
                          className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline font-semibold cursor-pointer disabled:opacity-40 disabled:no-underline"
                        >
                          {filteredStudents.length > 0 &&
                          filteredStudents.every((s) => selectedStudentIds.includes(s.id))
                            ? 'Tümünü Kaldır'
                            : 'Tümünü Seç'}
                        </button>
                      </div>

                      <div className="max-h-48 overflow-y-auto pr-1">
                        {filteredStudents.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {filteredStudents.map((std) => {
                              const isChecked = selectedStudentIds.includes(std.id);
                              const rawNo = (std.studentNumber || (std as any).number || '').toString().trim();
                              const hasValidNo = rawNo && rawNo !== 'Atandı' && rawNo !== 'Atanmadı' && !rawNo.includes('Atan');

                              return (
                                <label
                                  key={std.id}
                                  className={`flex items-center space-x-2.5 p-2 rounded-xl border transition-all cursor-pointer text-xs ${
                                    isChecked
                                      ? 'bg-indigo-600/15 border-indigo-500/40 text-white shadow-xs'
                                      : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/60 text-slate-300'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleStudent(std.id)}
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <div className="flex-1 min-w-0 flex items-center space-x-1.5 truncate">
                                    {hasValidNo && (
                                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-300 font-mono text-[10px] font-bold">
                                        No: {rawNo}
                                      </span>
                                    )}
                                    <span className="text-white font-medium truncate">{std.name}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-3 text-center rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400">
                            <Users className="w-5 h-5 mx-auto mb-1 text-slate-500 opacity-60" />
                            <p className="font-semibold text-slate-300">Bu Kriterlere Uygun Öğrenci Bulunamadı</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Yukarıdaki "Öğrenci Seçiniz" arama kutusunu kullanarak sınıf fark etmeksizin tüm okuldaki öğrencileri seçebilirsiniz.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Açıklama / Kısa Not</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Örn: Yanlarında soru bankasını getirsinler..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* ETÜT VEREN ÖĞRETMENİN DÜŞÜNCE VE GÖRÜŞLERİ (İSTEĞE BAĞLI) */}
              <div className="p-4 bg-gradient-to-br from-amber-500/10 via-slate-900 to-indigo-950/30 border border-amber-500/30 rounded-2xl space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2">
                    <MessageSquareQuote className="w-4 h-4 text-amber-400 shrink-0" />
                    <label htmlFor="etut-teacher-feedback-input" className="text-xs font-bold text-amber-300">
                      Etüt Veren Öğretmenin Düşünce ve Görüşleri
                    </label>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      İsteğe Bağlı
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Öğrenci veya ders değerlendirmesi
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Etütü veren öğretmenin etüt süreci, işlenen kazanımlar veya etüt verdiği öğrencinin / öğrencilerin kavrama durumu, ders içi performansı ve çalışma disiplini hakkındaki kişisel düşünce, görüş ve tavsiyelerini bu alana kaydedebilirsiniz.
                </p>

                <textarea
                  id="etut-teacher-feedback-input"
                  rows={3}
                  value={teacherFeedback}
                  onChange={(e) => setTeacherFeedback(e.target.value)}
                  placeholder="Örn: Öğrenci çarpanlara ayırma ve özdeşlikler konusunu başarıyla pekiştirdi. Soru çözüm hızında belirgin artış var. Evde ek 30 soru çözmesi ve zorlandığı soruları işaretlemesi tavsiye edildi..."
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700 hover:border-amber-500/50 focus:border-amber-500 rounded-xl text-white text-xs placeholder-slate-500 focus:ring-2 focus:ring-amber-500/30 transition-all resize-y leading-relaxed"
                />

                {/* Hızlı Seçim / Yardımcı İfadeler */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] text-slate-500 font-semibold">Hızlı Not Ekle:</span>
                  {[
                    'Konu çok iyi kavrandı, pekiştirildi.',
                    'Soru çözümlerinde gayretli ve istekliydi.',
                    'Eksik kazanımlar tamamlandı, ödevlendirildi.',
                    'Birebir soru pratiği yapıldı, gelişim olumlu.',
                    'Ek soru çözümü ve tekrar önerildi.',
                  ].map((quickText) => (
                    <button
                      key={quickText}
                      type="button"
                      onClick={() => {
                        setTeacherFeedback((prev) =>
                          prev.trim() ? `${prev.trim()} ${quickText}` : quickText
                        );
                      }}
                      className="text-[10px] px-2 py-0.5 bg-slate-800/80 hover:bg-amber-500/20 text-slate-300 hover:text-amber-200 border border-slate-700 hover:border-amber-500/40 rounded-lg transition-all cursor-pointer"
                    >
                      + {quickText}
                    </button>
                  ))}
                  {teacherFeedback && (
                    <button
                      type="button"
                      onClick={() => setTeacherFeedback('')}
                      className="text-[10px] px-2 py-0.5 text-rose-400 hover:text-rose-300 underline font-medium cursor-pointer ml-auto"
                    >
                      Temizle
                    </button>
                  )}
                </div>
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

      {/* Etüt Analiz & Belge Çıktısı (PDF/DOCX) Modalı */}
      <EtutAnalysisReportModal
        isOpen={isReportModalOpen}
        onClose={() => {
          setIsReportModalOpen(false);
          setReportSelectedStudentId(undefined);
        }}
        etuts={etuts}
        students={students}
        classes={classes}
        preselectedStudentId={reportSelectedStudentId}
      />

      {/* Etüt Bilgilendirme ve İletişim (WhatsApp & Otomatik Mail) Modalı */}
      <EtutNotificationModal
        isOpen={isDispatchModalOpen}
        onClose={() => {
          setIsDispatchModalOpen(false);
          setSelectedEtutForDispatch(null);
        }}
        etut={selectedEtutForDispatch}
        students={students}
      />

      {/* Etüt Yoklama ve Devamsızlık Takibi Modalı */}
      {selectedEtutForAttendance && (
        <EtutAttendanceModal
          isOpen={!!selectedEtutForAttendance}
          onClose={() => setSelectedEtutForAttendance(null)}
          etut={selectedEtutForAttendance}
          allStudents={students}
        />
      )}

      {/* ETÜT ÖĞRETMENİ SEÇİMİ VE YENİ ÖĞRETMEN EKLEME AÇILIR PENCERESİ */}
      {isTeacherModalOpen && (
        <div
          className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
          onClick={() => {
            setIsTeacherModalOpen(false);
            setIsNewTeacherFormOpen(false);
          }}
        >
          <div className="min-h-full flex items-center justify-center py-4">
            <div
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
                    👨‍🏫
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Etüt Öğretmeni Seç</h3>
                    <p className="text-xs text-slate-400">
                      Branş: <span className="text-amber-400 font-semibold">{subject} Öğretmenleri</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsTeacherModalOpen(false);
                    setIsNewTeacherFormOpen(false);
                  }}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Yeni Öğretmen Ekleme Formu */}
              {isNewTeacherFormOpen ? (
                <form onSubmit={handleAddNewTeacher} className="space-y-3.5">
                  <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl">
                    <h4 className="text-xs font-bold text-indigo-200 flex items-center space-x-1.5 mb-1">
                      <UserPlus className="w-4 h-4 text-emerald-400" />
                      <span>Yeni {subject} Öğretmeni Ekle</span>
                    </h4>
                    <p className="text-[11px] text-indigo-300/80">
                      Öğretmen eklendiğinde sisteme kaydedilir ve otomatik olarak bu etüte atanır.
                    </p>
                  </div>

                  {newTeacherError && (
                    <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-xs text-rose-300">
                      {newTeacherError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Öğretmen Adı Soyadı *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: Mehmet Öztürk"
                      value={newTeacherName}
                      onChange={(e) => setNewTeacherName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Öğretmen Branşı *
                    </label>
                    <input
                      type="text"
                      required
                      value={newTeacherBranch || subject}
                      onChange={(e) => setNewTeacherBranch(e.target.value)}
                      placeholder={`Örn: ${subject}`}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Seçilen ders ({subject}) gereği varsayılan branş otomatik ayarlandı.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        E-Posta (İsteğe Bağlı)
                      </label>
                      <input
                        type="email"
                        placeholder="ogretmen@okul.k12.tr"
                        value={newTeacherEmail}
                        onChange={(e) => setNewTeacherEmail(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Telefon (İsteğe Bağlı)
                      </label>
                      <input
                        type="tel"
                        placeholder="05XX XXX XX XX"
                        value={newTeacherPhone}
                        onChange={(e) => setNewTeacherPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsNewTeacherFormOpen(false)}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Geri
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Kaydet ve Etüte Ata</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* Mevcut Öğretmenler Listesi */
                <div className="space-y-3">
                  {/* Üst Arama & Öğretmen Ekle Butonu */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder={`${subject} öğretmeni ara...`}
                        value={teacherSearchQuery}
                        onChange={(e) => setTeacherSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      id="btn-add-teacher-in-modal"
                      onClick={() => {
                        setNewTeacherBranch(subject);
                        setNewTeacherName('');
                        setNewTeacherEmail('');
                        setNewTeacherPhone('');
                        setNewTeacherError('');
                        setIsNewTeacherFormOpen(true);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center space-x-1 shrink-0 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>+ Öğretmen Ekle</span>
                    </button>
                  </div>

                  {/* Öğretmen Kartları */}
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {filteredTeacherList.length > 0 ? (
                      filteredTeacherList.map((t) => {
                        const isSelected = selectedTeacherId === t.id;
                        return (
                          <div
                            key={t.id}
                            className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/50'
                                : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
                            }`}
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <img
                                src={t.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(t.name)}`}
                                alt={t.name}
                                className="w-9 h-9 rounded-full object-cover bg-slate-900 border border-slate-700 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white flex items-center space-x-2 truncate">
                                  <span className="truncate">{t.name}</span>
                                  {isSelected && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-bold border border-indigo-500/40">
                                      Seçili
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                                  <span className="text-amber-400 font-medium">{t.branch}</span>
                                  {t.email && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate">{t.email}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTeacherId(t.id);
                                setSelectedTeacherName(t.name);
                                setSelectedTeacherBranch(t.branch);
                                setIsTeacherModalOpen(false);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-600 text-white shadow-md'
                                  : 'bg-slate-700 hover:bg-indigo-600 text-slate-200 hover:text-white'
                              }`}
                            >
                              {isSelected ? 'Seçildi ✓' : 'Ata'}
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-6 text-center rounded-xl bg-slate-800/40 border border-dashed border-slate-700 space-y-2">
                        <Users className="w-8 h-8 text-slate-500 mx-auto" />
                        <p className="text-xs font-bold text-slate-300">
                          {subject} Branşında Öğretmen Bulunamadı
                        </p>
                        <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                          Sistemde {subject} dersi ile eşleşen kayıtlı öğretmen bulunmuyor. Yeni bir öğretmen ekleyerek hemen atayabilirsiniz.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setNewTeacherBranch(subject);
                            setNewTeacherName('');
                            setNewTeacherEmail('');
                            setNewTeacherPhone('');
                            setNewTeacherError('');
                            setIsNewTeacherFormOpen(true);
                          }}
                          className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>+ {subject} Öğretmeni Ekle</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Açılır Menü Öğretmen Listesi Yönetim Modalı */}
      <SubjectTeacherManagerModal
        isOpen={isSubjectTeacherModalOpen}
        onClose={() => setIsSubjectTeacherModalOpen(false)}
        initialSubject={subject}
      />
    </div>
  );
};
