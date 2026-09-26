import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  School,
  X,
  Check,
  UserCheck,
  Phone,
  Mail,
  Hash,
  Calendar,
  FileSpreadsheet,
  Download,
  Sparkles,
  Upload,
  Camera,
  AlertCircle,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Key,
  Copy,
  CheckCircle2,
  UserPlus,
  UserMinus,
  ArrowRightLeft,
  CheckSquare,
  ArrowUpDown,
  ShieldCheck,
} from 'lucide-react';
import { Student, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';
import { compressImageToDataUrl } from '../../lib/imageCompressor';
import { ExcelStudentUploadModal } from './ExcelStudentUploadModal';
import { ExcelClassUploadModal } from './ExcelClassUploadModal';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { StudentWelcomeCredentialsModal } from './StudentWelcomeCredentialsModal';
import { matchTurkishSearch } from '../../utils/turkishSearch';
import {
  generateStudentWelcomeEmail,
  createGmailComposeLink,
} from '../../lib/emailTemplates';
import {
  SCHOOL_LEVELS,
  BRANCH_OPTIONS,
  getGradesForSchoolLevel,
  detectSchoolLevelFromGrade,
  formatClassDisplayName,
} from '../../constants/schoolConstants';
import * as XLSX from 'xlsx';
import confetti from 'canvas-confetti';

interface StudentManagementProps {
  students: Student[];
  classes: ClassGroup[];
  onSelectStudentForHomework?: (student: Student) => void;
}

export const StudentManagement: React.FC<StudentManagementProps> = ({
  students,
  classes,
  onSelectStudentForHomework,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'default' | 'name-asc' | 'name-desc' | 'number-asc'>('default');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'students' | 'classes'>('students');

  // Kurum Yöneticisi kontrolü (Yalnızca yönetici öğrenci ve sınıf ekleyebilir)
  const isAdmin = dataService.isCurrentUserAdmin();

  // Modals
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isExcelClassModalOpen, setIsExcelClassModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassGroup | null>(null);
  const [viewingClassStudents, setViewingClassStudents] = useState<ClassGroup | null>(null);
  const [classStudentSearch, setClassStudentSearch] = useState<string>('');

  // Transfer students state (Tekli & Toplu aktarma)
  const [transferTargetClass, setTransferTargetClass] = useState<ClassGroup | null>(null);
  const [transferSearchTerm, setTransferSearchTerm] = useState<string>('');
  const [transferOnlyUnassigned, setTransferOnlyUnassigned] = useState<boolean>(false);
  const [transferSelectedStudentIds, setTransferSelectedStudentIds] = useState<string[]>([]);

  // Delete modals state
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [classToDelete, setClassToDelete] = useState<ClassGroup | null>(null);
  const [selectedCredentialsStudent, setSelectedCredentialsStudent] = useState<Student | null>(null);

  // New student form state
  const [studentName, setStudentName] = useState('');
  const [studentUsername, setStudentUsername] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPassword, setStudentPassword] = useState('123456');
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [studentSuccessFeedback, setStudentSuccessFeedback] = useState<string | null>(null);
  const [copiedPasswordId, setCopiedPasswordId] = useState<string | null>(null);
  const [studentClassId, setStudentClassId] = useState(classes[0]?.id || '');
  const [studentSchoolLevel, setStudentSchoolLevel] = useState<'Ortaokul' | 'Lise' | ''>('Ortaokul');
  const [studentGradeLevel, setStudentGradeLevel] = useState('5. Sınıf');
  const [studentBranch, setStudentBranch] = useState('A');
  const [studentNumber, setStudentNumber] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentAvatar, setStudentAvatar] = useState<string>('');
  const [isProcessingStudentPhoto, setIsProcessingStudentPhoto] = useState(false);
  const [studentFormError, setStudentFormError] = useState<string | null>(null);
  const [quickClassChangeFeedback, setQuickClassChangeFeedback] = useState<string | null>(null);
  const studentFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Hızlı Sınıf Değiştirme / Aktarma İşleyicisi
  const handleQuickChangeStudentClass = (student: Student, targetClassId: string) => {
    try {
      const updated = dataService.updateStudentClass(student.id, targetClassId);
      const targetClassName = updated.className || 'Atanmadı';
      setQuickClassChangeFeedback(`✓ ${student.name} başarıyla "${targetClassName}" sınıfına aktarıldı.`);
      setTimeout(() => setQuickClassChangeFeedback(null), 3500);
    } catch (e: any) {
      alert(e.message || 'Sınıf aktarılırken bir hata oluştu.');
    }
  };

  // Duplicate student detection state
  interface DuplicateWarningState {
    existingStudent: Student;
    newStudentPayload: {
      name: string;
      username: string;
      email: string;
      password: string;
      classId: string;
      className: string;
      schoolLevel: 'Ortaokul' | 'Lise';
      gradeLevel: string;
      branch: string;
      studentNumber: string;
      phone: string;
      avatar: string;
    };
  }
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarningState | null>(null);

  const handleStudentPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStudentFormError('Lütfen geçerli bir resim dosyası seçiniz (PNG, JPG, WebP).');
      return;
    }
    try {
      setIsProcessingStudentPhoto(true);
      setStudentFormError(null);
      const compressed = await compressImageToDataUrl(file, 200, 200, 0.82);
      setStudentAvatar(compressed);
    } catch {
      setStudentFormError('Resim işlenirken bir hata oluştu.');
    } finally {
      setIsProcessingStudentPhoto(false);
    }
  };

  // New class form state
  const [className, setClassName] = useState('');
  const [classSchoolLevel, setClassSchoolLevel] = useState<'Ortaokul' | 'Lise' | ''>('Ortaokul');
  const [classGradeLevel, setClassGradeLevel] = useState('5. Sınıf');
  const [classBranch, setClassBranch] = useState('A');
  const [classAcademicYear, setClassAcademicYear] = useState('2026-2027');
  const [classDescription, setClassDescription] = useState('');
  const [classFormError, setClassFormError] = useState<string | null>(null);

  // Mükerrer (aynı isim, sınıf ve okul no'ya sahip) öğrencileri tespit etme ve renklendirme
  const duplicateStudentGroups = useMemo(() => {
    const groups: Record<string, Student[]> = {};
    const safeStudents = Array.isArray(students) ? students : [];

    for (const std of safeStudents) {
      if (!std || !std.name) continue;
      const normName = std.name.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
      const num = ((std.studentNumber || (std as any).number || '').toString()).trim();

      // Sınıf bilgisini normalize et (ör. 8-A, 8/A, 8. Sınıf - A hepsi aynı sınıfa çözümlenir):
      let classKey = '';
      if (std.classId) {
        const found = classes.find((c) => c.id === std.classId);
        if (found) {
          classKey = formatClassDisplayName(found.name, found.branch, found.gradeLevel).toLowerCase().trim();
        }
      }
      if (!classKey || classKey === '-') {
        classKey = formatClassDisplayName(std.className, std.branch, std.gradeLevel).toLowerCase().trim();
      }
      if (!classKey || classKey === '-') {
        classKey = (std.className || `${std.gradeLevel || ''}_${std.branch || ''}` || std.classId || 'noclass').toLowerCase().trim();
      }

      // Aynı isim, sınıf ve okul numarasına sahip kayıtlar
      if (normName && num) {
        const key = `${normName}:::${classKey}:::${num}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(std);
      }
    }

    const duplicateIds = new Set<string>();
    interface DupItemInfo {
      groupCount: number;
      key: string;
      indexInGroup: number;
      groupStudents: Student[];
      colorTheme: {
        nameColor: string;
        badgeBg: string;
        badgeText: string;
        badgeBorder: string;
        rowBg: string;
        rowHover: string;
        borderLeft: string;
        ringColor: string;
        pillBg: string;
        label: string;
      };
    }
    const dupMap = new Map<string, DupItemInfo>();

    const DUPLICATE_THEMES = [
      {
        nameColor: 'text-amber-800 font-black',
        badgeBg: 'bg-amber-100',
        badgeText: 'text-amber-950 font-bold',
        badgeBorder: 'border-amber-400',
        rowBg: 'bg-amber-50/90',
        rowHover: 'hover:bg-amber-100/80',
        borderLeft: 'border-l-4 border-l-amber-500',
        ringColor: 'ring-amber-500',
        pillBg: 'bg-amber-600',
        label: '1. Kayıt',
      },
      {
        nameColor: 'text-rose-800 font-black',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-950 font-bold',
        badgeBorder: 'border-rose-400',
        rowBg: 'bg-rose-50/90',
        rowHover: 'hover:bg-rose-100/80',
        borderLeft: 'border-l-4 border-l-rose-500',
        ringColor: 'ring-rose-500',
        pillBg: 'bg-rose-600',
        label: '2. Kayıt',
      },
      {
        nameColor: 'text-purple-800 font-black',
        badgeBg: 'bg-purple-100',
        badgeText: 'text-purple-950 font-bold',
        badgeBorder: 'border-purple-400',
        rowBg: 'bg-purple-50/90',
        rowHover: 'hover:bg-purple-100/80',
        borderLeft: 'border-l-4 border-l-purple-500',
        ringColor: 'ring-purple-500',
        pillBg: 'bg-purple-600',
        label: '3. Kayıt',
      },
    ];

    for (const [key, list] of Object.entries(groups)) {
      if (list.length > 1) {
        // Tarih veya ID'ye göre sıralayarak tutarlı 1. ve 2. kayıt indeksi oluştur
        list.forEach((s, idx) => {
          duplicateIds.add(s.id);
          const theme = DUPLICATE_THEMES[idx % DUPLICATE_THEMES.length];
          dupMap.set(s.id, {
            groupCount: list.length,
            key,
            indexInGroup: idx,
            groupStudents: list,
            colorTheme: {
              ...theme,
              label: `${idx + 1}. Kayıt`,
            },
          });
        });
      }
    }

    return { duplicateIds, dupMap, totalDuplicates: duplicateIds.size, groups };
  }, [students, classes]);

  // Tanımsız / Sınıfı olmayan öğrencileri tespit etme
  const isStudentUnassigned = (s: Student) => {
    if (!s) return true;
    if (s.className === 'Tanımsız' || s.className === 'Sınıfsız' || s.className === 'Atanmadı') {
      if (!s.classId || s.classId === '' || s.classId === 'tanimsiz' || s.classId === 'unassigned' || s.classId === 'class-default') {
        return true;
      }
    }
    // Öğrencinin geçerli bir sınıf ismi varsa kesinlikle tanımsız/sınıfsız sayılmaz
    if (s.className && s.className !== 'Atanmadı' && s.className !== 'Tanımsız' && s.className !== 'Sınıfsız') {
      return false;
    }
    if (s.classId && classes.some((c) => c.id === s.classId || c.name === s.className)) {
      return false;
    }
    return true;
  };

  const unassignedStudentsCount = useMemo(() => {
    return students.filter(isStudentUnassigned).length;
  }, [students, classes]);

  // Filter & sort students: Mükerrer kayıtlar HER ZAMAN otomatik olarak YAN YANA gelir
  const filteredStudents = useMemo(() => {
    const list = students.filter((s) => {
      const matchesSearch =
        matchTurkishSearch(s.name, searchTerm) ||
        (s.studentNumber && s.studentNumber.toString().includes(searchTerm.trim())) ||
        matchTurkishSearch(s.email, searchTerm) ||
        matchTurkishSearch(s.className, searchTerm);

      let matchesClass = true;
      if (selectedClassFilter === 'all') {
        matchesClass = true;
      } else if (selectedClassFilter === 'duplicates') {
        matchesClass = duplicateStudentGroups.dupMap.has(s.id);
      } else if (selectedClassFilter === 'unassigned' || selectedClassFilter === 'tanimsiz') {
        matchesClass = isStudentUnassigned(s);
      } else {
        matchesClass = s.classId === selectedClassFilter;
      }
      return matchesSearch && matchesClass;
    });

    const dupMap = duplicateStudentGroups.dupMap;

    // Aynı mükerrer gruba ait iki öğrencinin ASLA arasına başkası girmeden YAN YANA gelmesini sağlayan fonksiyon
    const keepDuplicatesAdjacent = (a: Student, b: Student, fallbackDiff: number) => {
      const aDup = dupMap.get(a.id);
      const bDup = dupMap.get(b.id);
      if (aDup && bDup && aDup.key === bDup.key) {
        return aDup.indexInGroup - bDup.indexInGroup;
      }
      return fallbackDiff;
    };

    if (sortOrder === 'name-asc') {
      return [...list].sort((a, b) => {
        const nameDiff = (a.name || '').localeCompare(b.name || '', 'tr', { sensitivity: 'base' });
        return keepDuplicatesAdjacent(a, b, nameDiff !== 0 ? nameDiff : (a.id || '').localeCompare(b.id || ''));
      });
    }
    if (sortOrder === 'name-desc') {
      return [...list].sort((a, b) => {
        const nameDiff = (b.name || '').localeCompare(a.name || '', 'tr', { sensitivity: 'base' });
        return keepDuplicatesAdjacent(a, b, nameDiff !== 0 ? nameDiff : (b.id || '').localeCompare(a.id || ''));
      });
    }
    if (sortOrder === 'number-asc') {
      return [...list].sort((a, b) => {
        const numA = parseInt(a.studentNumber || '0', 10) || 0;
        const numB = parseInt(b.studentNumber || '0', 10) || 0;
        const numDiff = numA - numB;
        return keepDuplicatesAdjacent(a, b, numDiff !== 0 ? numDiff : (a.name || '').localeCompare(b.name || '', 'tr'));
      });
    }

    // Varsayılan sıralama: Mükerrer kayıtları listenin en başında ve kesinlikle YAN YANA grupla
    if (duplicateStudentGroups.totalDuplicates > 0) {
      return [...list].sort((a, b) => {
        const aDup = dupMap.get(a.id);
        const bDup = dupMap.get(b.id);
        if (aDup && bDup) {
          if (aDup.key === bDup.key) return aDup.indexInGroup - bDup.indexInGroup;
          return aDup.key.localeCompare(bDup.key, 'tr');
        }
        if (aDup && !bDup) return -1;
        if (!aDup && bDup) return 1;
        return (a.name || '').localeCompare(b.name || '', 'tr');
      });
    }

    return list;
  }, [students, classes, searchTerm, selectedClassFilter, sortOrder, duplicateStudentGroups]);

  // Çoklu öğrenci seçimi mantığı
  const allFilteredSelected = useMemo(() => {
    if (filteredStudents.length === 0) return false;
    return filteredStudents.every((s) => selectedStudentIds.includes(s.id));
  }, [filteredStudents, selectedStudentIds]);

  const someFilteredSelected = useMemo(() => {
    if (filteredStudents.length === 0) return false;
    const count = filteredStudents.filter((s) => selectedStudentIds.includes(s.id)).length;
    return count > 0 && count < filteredStudents.length;
  }, [filteredStudents, selectedStudentIds]);

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredStudents.map((s) => s.id));
      setSelectedStudentIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const filteredIds = filteredStudents.map((s) => s.id);
      setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handleConfirmBulkDelete = () => {
    if (selectedStudentIds.length === 0) return;
    const count = selectedStudentIds.length;
    dataService.deleteStudents(selectedStudentIds);
    setSelectedStudentIds([]);
    setIsBulkDeleteModalOpen(false);
    setStudentSuccessFeedback(`${count} öğrenci sistemden başarıyla silindi.`);
  };

  // Handle Add Student
  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    setStudentFormError(null);

    if (!editingStudent && !isAdmin) {
      setStudentFormError('Sisteme yeni öğrenci ekleme yetkisi yalnızca Kurum Yöneticisine aittir.');
      return;
    }

    // Zorunluluk Kontrolleri: Okul, Sınıf, Şube MECBURİ
    if (!studentSchoolLevel) {
      setStudentFormError('Lütfen Okul seçimini (Ortaokul / Lise) yapınız.');
      return;
    }
    if (!studentGradeLevel) {
      setStudentFormError('Lütfen Sınıf seçimini yapınız.');
      return;
    }
    if (!studentBranch) {
      setStudentFormError('Lütfen Şube seçimini yapınız.');
      return;
    }

    const constructedClassName = `${studentGradeLevel} - ${studentBranch}`;
    // Eşleşen sınıf bul veya yoksa otomatik oluştur
    let matchedClass = classes.find(
      (c) =>
        (c.gradeLevel === studentGradeLevel && c.branch === studentBranch) ||
        c.name.toLowerCase() === constructedClassName.toLowerCase()
    );
    let targetClassId = matchedClass?.id;

    if (!targetClassId) {
      const createdClass = dataService.addClass({
        name: constructedClassName,
        branch: studentBranch,
        schoolLevel: studentSchoolLevel,
        gradeLevel: studentGradeLevel,
        academicYear: '2026-2027',
        description: `${studentSchoolLevel} ${studentGradeLevel} ${studentBranch} grubu`,
      });
      targetClassId = createdClass.id;
    }

    const effectiveStudentNumber = studentNumber.trim();
    // Sistem kontrolü: Aynı isim, sınıf ve okul numarasına sahip kayıtlı öğrenci var mı?
    const existingDuplicate = students.find((s) => {
      if (editingStudent && s.id === editingStudent.id) return false;
      const sameName = s.name.trim().toLowerCase() === studentName.trim().toLowerCase();
      const sameClass =
        (s.classId && s.classId === targetClassId) ||
        (s.className && s.className.trim().toLowerCase() === constructedClassName.trim().toLowerCase()) ||
        (s.gradeLevel === studentGradeLevel && s.branch === studentBranch);
      const sameNumber = effectiveStudentNumber
        ? s.studentNumber?.trim() === effectiveStudentNumber
        : (!s.studentNumber || s.studentNumber.trim() === '');
      return sameName && sameClass && sameNumber;
    });

    const safeUsername =
      studentUsername ||
      (studentEmail && studentEmail.includes('@')
        ? studentEmail.split('@')[0]
        : studentNumber
        ? `ogr_${studentNumber}`
        : `ogr_${studentName.trim().toLowerCase().replace(/\s+/g, '_') || Math.floor(1000 + Math.random() * 9000)}`);

    const studentPayload = {
      name: studentName,
      username: safeUsername,
      email: studentEmail.trim(),
      password: studentPassword || editingStudent?.password || '123456',
      classId: targetClassId,
      className: constructedClassName,
      schoolLevel: studentSchoolLevel,
      gradeLevel: studentGradeLevel,
      branch: studentBranch,
      studentNumber: studentNumber || `${Math.floor(1000 + Math.random() * 9000)}`,
      phone: studentPhone || '0555 000 0000',
      avatar:
        studentAvatar ||
        editingStudent?.avatar ||
        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(studentName)}`,
    };

    if (existingDuplicate) {
      setDuplicateWarning({
        existingStudent: existingDuplicate,
        newStudentPayload: studentPayload,
      });
      return;
    }

    if (editingStudent) {
      dataService.updateStudent(editingStudent.id, studentPayload);
      setStudentSuccessFeedback(`Öğrenci "${studentName}" başarıyla güncellendi.`);
      setTimeout(() => setStudentSuccessFeedback(null), 4000);
      setEditingStudent(null);
    } else {
      const createdStudent = dataService.registerStudent(studentPayload);
      setIsAddStudentOpen(false);
      setSelectedCredentialsStudent(createdStudent);
      if (studentEmail) {
        setStudentSuccessFeedback(`✅ Öğrenci "${studentName}" başarıyla eklendi! Giriş bilgileri e-postası öğrenciye sistem tarafından otomatik olarak gönderildi.`);
      } else {
        setStudentSuccessFeedback(`Öğrenci "${studentName}" başarıyla eklendi! Giriş şifresi: ${studentPassword || '123456'}`);
      }
      setTimeout(() => setStudentSuccessFeedback(null), 5000);
    }
    resetStudentForm();
  };

  const handleDuplicateReplace = () => {
    if (!duplicateWarning) return;
    const { existingStudent, newStudentPayload } = duplicateWarning;
    dataService.updateStudent(existingStudent.id, {
      ...newStudentPayload,
      id: existingStudent.id,
    });
    setDuplicateWarning(null);
    setIsAddStudentOpen(false);
    setEditingStudent(null);
    resetStudentForm();
    setStudentSuccessFeedback(
      `✅ Kayıtlı öğrenci "${newStudentPayload.name}" güncellendi ve yeni bilgilerle değiştirildi.`
    );
    setTimeout(() => setStudentSuccessFeedback(null), 5000);
  };

  const handleDuplicateKeepBoth = () => {
    if (!duplicateWarning) return;
    const { newStudentPayload } = duplicateWarning;
    const createdStudent = dataService.registerStudent({
      ...newStudentPayload,
    });
    setDuplicateWarning(null);
    setIsAddStudentOpen(false);
    setEditingStudent(null);
    setSelectedCredentialsStudent(createdStudent);
    resetStudentForm();
    setStudentSuccessFeedback(
      `⚠️ Sistem Uyarısı: "${newStudentPayload.name}" adlı öğrenci eklendi. Aynı isim, sınıf ve numaraya sahip iki kayıt listede otomatik olarak yan yana getirildi ve farklı renklerde (1. Kayıt / 2. Kayıt) işaretlendi.`
    );
    setTimeout(() => setStudentSuccessFeedback(null), 5000);
  };

  const resetStudentForm = () => {
    setStudentName('');
    setStudentUsername('');
    setStudentEmail('');
    setStudentPassword('123456');
    setShowStudentPassword(false);
    setStudentNumber('');
    setStudentPhone('');
    setStudentAvatar('');
    setStudentSchoolLevel('Ortaokul');
    setStudentGradeLevel('5. Sınıf');
    setStudentBranch('A');
    setStudentClassId(classes[0]?.id || '');
    setStudentFormError(null);
  };

  const openEditStudent = (student: Student) => {
    setEditingStudent(student);
    setStudentName(student.name);
    setStudentUsername(student.username);
    setStudentEmail(student.email);
    setStudentPassword(student.password || '123456');
    setShowStudentPassword(false);
    setStudentClassId(student.classId);
    setStudentNumber(student.studentNumber);
    setStudentPhone(student.phone || '');
    setStudentAvatar(student.avatar || '');

    const detectedSchool =
      student.schoolLevel || detectSchoolLevelFromGrade(student.className) || 'Ortaokul';
    const detectedGrades = getGradesForSchoolLevel(detectedSchool);
    const matchedGrade =
      student.gradeLevel ||
      (student.className ? detectedGrades.find((g) => student.className.includes(g)) : undefined) ||
      detectedGrades[0];

    setStudentSchoolLevel(detectedSchool);
    setStudentGradeLevel(matchedGrade);
    setStudentBranch(student.branch?.replace(/şube\s*/i, '').trim() || 'A');
    setStudentFormError(null);
    setIsAddStudentOpen(true);
  };

  // Excel bulk upload state for Add Class modal
  interface ExcelClassStudentPreview {
    fullName: string;
    studentNumber: string;
    email: string;
    phone: string;
  }
  const [classExcelStudents, setClassExcelStudents] = useState<ExcelClassStudentPreview[]>([]);
  const [classExcelFileName, setClassExcelFileName] = useState<string>('');
  const [isReadingClassExcel, setIsReadingClassExcel] = useState<boolean>(false);
  const [classExcelError, setClassExcelError] = useState<string | null>(null);
  const [showExcelStudentList, setShowExcelStudentList] = useState<boolean>(false);

  const downloadSampleClassExcel = () => {
    const sampleData = [
      {
        'Öğrenci Adı': 'Ahmet',
        'Öğrenci Soyadı': 'Yılmaz',
        'Öğrenci No': '101',
        'E-posta': 'ahmet.yilmaz@okul.k12.tr',
        'Veli Telefonu': '05551112233',
      },
      {
        'Öğrenci Adı': 'Zeynep',
        'Öğrenci Soyadı': 'Kaya',
        'Öğrenci No': '102',
        'E-posta': 'zeynep.kaya@okul.k12.tr',
        'Veli Telefonu': '05552223344',
      },
      {
        'Öğrenci Adı': 'Mehmet Ali',
        'Öğrenci Soyadı': 'Demir',
        'Öğrenci No': '103',
        'E-posta': 'mehmet.demir@okul.k12.tr',
        'Veli Telefonu': '05553334455',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Öğrenciler');
    XLSX.writeFile(
      wb,
      `${(classGradeLevel || 'Sinif').replace(/\s+/g, '_')}_${(classBranch || 'Sube').replace(/\s+/g, '_')}_Ogrenci_Sablonu.xlsx`
    );
  };

  const handleClassExcelFile = (file: File) => {
    if (!file) return;
    setClassExcelFileName(file.name);
    setClassExcelError(null);
    setIsReadingClassExcel(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'binary', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (rawData.length === 0) {
          setClassExcelError('Yüklenen Excel dosyasında öğrenci verisi bulunamadı.');
          setIsReadingClassExcel(false);
          return;
        }

        const normalizeStr = (str: string) =>
          str
            .toLowerCase()
            .replace(/ı/g, 'i')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ş/g, 's')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            .trim();

        const parsed: ExcelClassStudentPreview[] = [];

        rawData.forEach((row, idx) => {
          const keys = Object.keys(row);
          const getVal = (...possibleKeys: string[]): string => {
            for (const pKey of possibleKeys) {
              const normP = normalizeStr(pKey);
              const foundKey = keys.find(
                (k) => normalizeStr(k) === normP || normalizeStr(k).includes(normP)
              );
              if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
                return String(row[foundKey]).trim();
              }
            }
            return '';
          };

          const rawFullName = getVal(
            'ad soyad',
            'isim soyisim',
            'adi soyadi',
            'ogrenci adi',
            'full name',
            'ad-soyad'
          );
          let firstName = getVal('ad', 'isim', 'adi', 'first name', 'adiniz', 'ogrenci ad');
          let lastName = getVal('soyad', 'soyisim', 'soyadi', 'last name', 'soyadiniz', 'ogrenci soyad');

          if (!firstName && !lastName && rawFullName) {
            const parts = rawFullName.trim().split(/\s+/);
            if (parts.length === 1) {
              firstName = parts[0];
              lastName = '';
            } else {
              lastName = parts.pop() || '';
              firstName = parts.join(' ');
            }
          }

          const fullName = (
            rawFullName ||
            `${firstName} ${lastName}`.trim() ||
            `Öğrenci ${idx + 1}`
          ).trim();

          const studentNumber =
            getVal('numara', 'ogrenci no', 'okul no', 'no', 'number', 'student no', 'id') ||
            `${100 + idx + 1}`;
          const email =
            getVal('eposta', 'e-posta', 'email', 'mail') ||
            `${normalizeStr(firstName || 'ogrenci')}.${normalizeStr(lastName || `${idx + 1}`)}@okul.k12.tr`;
          const phone = getVal('telefon', 'tel', 'phone', 'gsm', 'veli tel') || '';

          if (fullName.length >= 2) {
            parsed.push({
              fullName,
              studentNumber,
              email,
              phone,
            });
          }
        });

        if (parsed.length === 0) {
          setClassExcelError('Geçerli isim içeren öğrenci satırı bulunamadı.');
        } else {
          setClassExcelStudents(parsed);
          setShowExcelStudentList(true);
        }
      } catch (err) {
        console.error(err);
        setClassExcelError(
          'Excel dosyası okunurken hata oluştu. Lütfen geçerli bir .xlsx veya .csv dosyası yükleyin.'
        );
      } finally {
        setIsReadingClassExcel(false);
      }
    };

    reader.onerror = () => {
      setClassExcelError('Dosya okunamadı.');
      setIsReadingClassExcel(false);
    };

    reader.readAsBinaryString(file);
  };

  // Handle Save Class
  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    setClassFormError(null);

    if (!editingClass && !isAdmin) {
      setClassFormError('Sisteme yeni sınıf ekleme yetkisi yalnızca Kurum Yöneticisine aittir.');
      return;
    }

    // Zorunluluk Kontrolleri: Okul, Sınıf, Şube MECBURİ
    if (!classSchoolLevel) {
      setClassFormError('Lütfen Okul seçimini (Ortaokul / Lise) yapınız.');
      return;
    }
    if (!classGradeLevel) {
      setClassFormError('Lütfen Sınıf seçimini yapınız.');
      return;
    }
    if (!classBranch) {
      setClassFormError('Lütfen Şube seçimini yapınız.');
      return;
    }

    const finalClassName = className.trim() || `${classGradeLevel} - ${classBranch}`;

    let savedClassId = '';
    if (editingClass) {
      dataService.updateClass(editingClass.id, {
        name: finalClassName,
        schoolLevel: classSchoolLevel,
        gradeLevel: classGradeLevel,
        branch: classBranch,
        academicYear: classAcademicYear,
        description: classDescription,
      });
      savedClassId = editingClass.id;
      setEditingClass(null);
    } else {
      const created = dataService.addClass({
        name: finalClassName,
        schoolLevel: classSchoolLevel,
        gradeLevel: classGradeLevel,
        branch: classBranch,
        academicYear: classAcademicYear,
        description: classDescription,
      });
      savedClassId = created.id;

      if (created.autoAssignedCount && created.autoAssignedCount > 0) {
        setStudentSuccessFeedback(
          `"${finalClassName}" sınıfı oluşturuldu ve eşleşen ${created.autoAssignedCount} kayıtlı öğrenci otomatik olarak bu sınıfa aktarıldı!`
        );
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
        });
      } else {
        setStudentSuccessFeedback(
          `"${finalClassName}" sınıfı başarıyla oluşturuldu. Sınıf içine yeni öğrenci ekleyebilir veya sistemdeki öğrencileri aktarabilirsiniz.`
        );
      }
    }

    // Toplu Excel Öğrencilerini Oluştur ve Sınıfa Ata
    if (classExcelStudents.length > 0) {
      classExcelStudents.forEach((std) => {
        dataService.registerStudent({
          name: std.fullName,
          username:
            std.email.split('@')[0] || `std_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          email: std.email,
          classId: savedClassId,
          className: finalClassName,
          schoolLevel: classSchoolLevel,
          gradeLevel: classGradeLevel,
          branch: classBranch,
          studentNumber: std.studentNumber,
          phone: std.phone,
          avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.fullName)}`,
        });
      });

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });
    }

    setClassName('');
    setClassSchoolLevel('Ortaokul');
    setClassGradeLevel('5. Sınıf');
    setClassBranch('A');
    setClassDescription('');
    setClassFormError(null);
    setClassExcelStudents([]);
    setClassExcelFileName('');
    setClassExcelError(null);
    setShowExcelStudentList(false);
    setIsAddClassOpen(false);
  };

  const openEditClass = (cls: ClassGroup) => {
    setEditingClass(cls);
    setClassName(cls.name);
    const detectedSchool =
      cls.schoolLevel || detectSchoolLevelFromGrade(cls.name) || 'Ortaokul';
    const detectedGrades = getGradesForSchoolLevel(detectedSchool);
    const matchedGrade =
      cls.gradeLevel ||
      detectedGrades.find((g) => cls.name.includes(g)) ||
      detectedGrades[0];

    setClassSchoolLevel(detectedSchool);
    setClassGradeLevel(matchedGrade);
    setClassBranch(cls.branch?.replace(/şube\s*/i, '').trim() || 'A');
    setClassAcademicYear(cls.academicYear);
    setClassDescription(cls.description || '');
    setClassFormError(null);
    setIsAddClassOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Success Notification Alert */}
      {studentSuccessFeedback && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl flex items-center justify-between text-emerald-200 text-sm shadow-xl shadow-emerald-950/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Check className="w-4 h-4" />
            </div>
            <span className="font-medium">{studentSuccessFeedback}</span>
          </div>
          <button
            onClick={() => setStudentSuccessFeedback(null)}
            className="p-1 text-emerald-400 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <span>Kullanıcı & Sınıf Yönetim Merkezi</span>
          </h2>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveTab('students')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'students'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Öğrenciler ({students.length})
            </button>
            <button
              onClick={() => setActiveTab('classes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'classes'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sınıflar ({classes.length})
            </button>
          </div>

          {activeTab === 'students' ? (
            isAdmin ? (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsExcelModalOpen(true)}
                  className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                  title="Excel (.xlsx, .xls) veya CSV dosyasından toplu öğrenci ekle"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Excel'den Toplu Yükle</span>
                </button>

                <button
                  onClick={() => {
                    resetStudentForm();
                    setEditingStudent(null);
                    setIsAddStudentOpen(true);
                  }}
                  className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Yeni Öğrenci Ekle</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800/90 border border-slate-700/80 text-amber-300 text-xs">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold">Öğrenci ekleme yetkisi yalnızca Kurum Yöneticisine aittir</span>
              </div>
            )
          ) : (
            isAdmin ? (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsExcelClassModalOpen(true)}
                  className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                  title="Excel (.xlsx, .xls) veya CSV dosyasından toplu sınıf ekle"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Excel'den Toplu Sınıf Yükle</span>
                </button>

                <button
                  onClick={() => {
                    setEditingClass(null);
                    setClassName('');
                    setClassSchoolLevel('Ortaokul');
                    setClassGradeLevel('5. Sınıf');
                    setClassBranch('A');
                    setClassDescription('');
                    setClassFormError(null);
                    setIsAddClassOpen(true);
                  }}
                  className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Yeni Sınıf Ekle</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800/90 border border-slate-700/80 text-amber-300 text-xs">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold">Sınıf ekleme yetkisi yalnızca Kurum Yöneticisine aittir</span>
              </div>
            )
          )}
        </div>
      </div>

      {activeTab === 'students' ? (
        /* STUDENTS VIEW */
        <div className="space-y-4">
          {!isAdmin && (
            <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs flex items-center gap-3 shadow-xs">
              <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
                <ShieldCheck className="w-4 h-4 text-indigo-700" />
              </div>
              <div className="flex-1">
                <strong className="font-bold text-indigo-900">Yönetici İzinli Öğrenci Görünümü:</strong> Bu ekranda yalnızca Kurum Yöneticisinin erişim izni verdiği sınıflar ({classes.length}) ve bu sınıflara bağlı kayıtlı öğrenciler listelenmektedir. Sisteme yeni öğrenci veya sınıf ekleme yetkisi yalnızca Kurum Yöneticisine aittir.
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
          {/* Duplicate Students System Warning Banner */}
          {duplicateStudentGroups.totalDuplicates > 0 && (
            <div className="mx-4 sm:mx-5 mt-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border-2 border-amber-500/40 text-amber-950 flex items-start gap-3 shadow-xs">
              <div className="p-2.5 bg-amber-500/20 text-amber-700 rounded-xl shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-amber-700 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-extrabold text-sm text-amber-950 flex items-center gap-1.5">
                    <span>⚠️ Sistem Uyarısı: Aynı İsim, Sınıf ve Numaraya Sahip Öğrenciler Tespit Edildi!</span>
                  </h4>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-950 font-black border border-amber-300">
                    {duplicateStudentGroups.totalDuplicates} Kayıt İşaretlendi
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-200 text-rose-950 font-black border border-rose-300">
                    {Object.keys(duplicateStudentGroups.groups).filter(k => duplicateStudentGroups.groups[k].length > 1).length} Çakışan Grup
                  </span>
                </div>
                <p className="text-xs text-amber-950/90 mt-1.5 leading-relaxed">
                  Sistemde <strong>aynı isim, sınıf ve okul numarasına</strong> sahip kayıtlı öğrenciler bulunmaktadır. Bu öğrenciler aşağıdaki listede <strong>otomatik olarak yan yana getirilmiş</strong> olup, isimleri ve satırları <strong>farklı renklerde (1. Kayıt: Turuncu, 2. Kayıt: Kırmızı)</strong> ve çakışma uyarı etiketiyle gösterilmektedir.
                </p>
              </div>
            </div>
          )}

          {/* Quick Class Change Feedback Banner */}
          {quickClassChangeFeedback && (
            <div className="mx-4 sm:mx-5 mt-3 p-3.5 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/30 text-emerald-900 text-xs font-extrabold flex items-center space-x-2.5 shadow-sm animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{quickClassChangeFeedback}</span>
            </div>
          )}

          {/* Filter / Search Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Öğrenci adı, no veya e-posta ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-50/80 border border-slate-200 rounded-xl text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              {/* Sınıf Filtresi (Tanımsız seçeneği dahil) */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">Sınıf Filtresi:</span>
                <select
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="bg-slate-50/80 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="all">Tüm Sınıflar ({students.length})</option>
                  {duplicateStudentGroups.totalDuplicates > 0 && (
                    <option value="duplicates">⚠️ Mükerrer Kayıtlar ({duplicateStudentGroups.totalDuplicates})</option>
                  )}
                  <option value="unassigned">Tanımsız ({unassignedStudentsCount})</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)} ({students.filter((s) => s.classId === cls.id).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sırala Açılır Butonu (A-Z / Z-A) */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-500 font-semibold whitespace-nowrap flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  <span>Sırala:</span>
                </span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="bg-slate-50/80 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="default">Varsayılan Sıralama</option>
                  <option value="name-asc">Alfabetik (A → Z)</option>
                  <option value="name-desc">Alfabetik (Z → A)</option>
                  <option value="number-asc">Öğrenci No (Küçükten Büyüğe)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Toplu İşlem & Çoklu Silme Barı */}
          {selectedStudentIds.length > 0 && (
            <div className="px-4 sm:px-6 py-3 bg-rose-50 border-b border-rose-200 flex flex-wrap items-center justify-between gap-3 text-slate-800 transition-all animate-in fade-in duration-200">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                  {selectedStudentIds.length}
                </div>
                <div>
                  <span className="text-xs font-bold text-rose-950">
                    {selectedStudentIds.length} Öğrenci Seçildi
                  </span>
                  <span className="text-[11px] text-rose-700 ml-1.5 hidden sm:inline">
                    (Listelenen {filteredStudents.length} öğrenci arasından)
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer flex items-center space-x-1.5"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{allFilteredSelected ? 'Tümünün Seçimini Kaldır' : `Tümünü Seç (${filteredStudents.length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentIds([])}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                >
                  Temizle
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteModalOpen(true)}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-sm shadow-rose-600/30 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Seçilen Öğrencileri Sil ({selectedStudentIds.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* Students Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 font-bold">
                <tr>
                  <th className="px-4 py-3.5 w-12 text-center">
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={filteredStudents.length > 0 && allFilteredSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someFilteredSelected;
                        }}
                        onChange={handleToggleSelectAll}
                        title={allFilteredSelected ? 'Tümünün Seçimini Kaldır' : 'Hepsini Seç'}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                  </th>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci</th>
                  <th className="px-6 py-3.5 font-semibold">Sınıf / Şube</th>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci No</th>
                  <th className="px-6 py-3.5 font-semibold">Giriş Şifresi</th>
                  <th className="px-6 py-3.5 font-semibold">Kayıt Durumu</th>
                  <th className="px-6 py-3.5 font-semibold text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-sm text-slate-600">Arama kriterlerine uygun öğrenci bulunamadı.</p>
                      <p className="text-xs text-slate-400 mt-1">Lütfen arama teriminizi veya sınıf filtresini değiştirip tekrar deneyin.</p>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((std) => {
                    const dupInfo = duplicateStudentGroups.dupMap.get(std.id);
                    const isDuplicate = !!dupInfo;
                    const isSelected = selectedStudentIds.includes(std.id);
                    return (
                    <tr
                      key={std.id}
                      className={
                        isSelected
                          ? 'bg-indigo-50/70 hover:bg-indigo-100/70 transition-colors border-l-4 border-l-indigo-600'
                          : isDuplicate && dupInfo
                          ? `${dupInfo.colorTheme.rowBg} ${dupInfo.colorTheme.rowHover} transition-colors ${dupInfo.colorTheme.borderLeft}`
                          : 'hover:bg-slate-50/80 transition-colors'
                      }
                    >
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleStudent(std.id)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <img
                            src={
                              std.avatar ||
                              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                std.name
                              )}`
                            }
                            alt={std.name}
                            className={`w-10 h-10 rounded-full object-cover ring-2 ${
                              isSelected
                                ? 'bg-indigo-100 ring-indigo-400 shadow-xs'
                                : isDuplicate && dupInfo
                                ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.ringColor} shadow-xs`
                                : 'bg-slate-100 ring-slate-200/80'
                            }`}
                          />
                          <div>
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              {isDuplicate && dupInfo && (
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white shadow-2xs ${dupInfo.colorTheme.pillBg}`}
                                  title={`${dupInfo.colorTheme.label} - Bu öğrenci ile aynı isim, sınıf ve okul numarasına sahip ${dupInfo.groupCount} kayıt bulunmaktadır.`}
                                >
                                  {dupInfo.colorTheme.label}
                                </span>
                              )}
                              <span
                                className={`text-sm ${
                                  isSelected
                                    ? 'text-indigo-950 font-bold'
                                    : isDuplicate && dupInfo
                                    ? dupInfo.colorTheme.nameColor
                                    : 'text-slate-900 font-bold'
                                }`}
                              >
                                {std.name}
                              </span>
                              {isDuplicate && dupInfo && (
                                <span
                                  className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder}`}
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Mükerrer ({dupInfo.colorTheme.label} • Aynı İsim, Sınıf ve No)</span>
                                </span>
                              )}
                            </div>

                            {/* Öğrenci İsmine Bağlı Hızlı Sınıf Değiştirme / Aktarma Açılır Menüsü */}
                            <div className="flex items-center space-x-1.5 mt-1.5">
                              <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">Sınıf Aktar:</span>
                              <select
                                value={std.classId || 'unassigned'}
                                onChange={(e) => handleQuickChangeStudentClass(std, e.target.value)}
                                className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer hover:bg-indigo-100 transition-colors"
                                title="Öğrencinin sınıfını bu açılır listeden anında değiştirebilirsiniz"
                              >
                                <option value="unassigned">Atanmadı (Sınıfsız)</option>
                                {classes.map((cls) => (
                                  <option key={cls.id} value={cls.id}>
                                    {cls.name} {cls.branch ? `(${cls.branch})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <select
                          value={std.classId || 'unassigned'}
                          onChange={(e) => handleQuickChangeStudentClass(std, e.target.value)}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all shadow-2xs ${
                            isStudentUnassigned(std)
                              ? 'bg-slate-100 text-slate-700 border-slate-300 hover:border-slate-400'
                              : isDuplicate && dupInfo
                              ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder}`
                              : 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100'
                          }`}
                          title="Öğrencinin sınıfını anında değiştirmek için seçiniz"
                        >
                          <option value="unassigned">Tanımsız / Sınıfsız</option>
                          {classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              {cls.name} {cls.branch ? `(${cls.branch})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`font-mono font-semibold text-xs px-2.5 py-1 rounded-md border ${
                            isDuplicate && dupInfo
                              ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder} ring-1 font-bold`
                              : 'text-slate-700 bg-slate-100 border-slate-200'
                          }`}
                        >
                          #{std.studentNumber}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-md">
                            {std.password || '54321'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(std.password || '54321');
                              setCopiedPasswordId(std.id);
                              setTimeout(() => setCopiedPasswordId(null), 2000);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Şifreyi Kopyala"
                          >
                            {copiedPasswordId === std.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {isDuplicate && dupInfo ? (
                          <span
                            className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs ${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder}`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Mükerrer ({dupInfo.colorTheme.label})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Aktif Öğrenci</span>
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCredentialsStudent(std)}
                            className="p-2 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg transition-colors cursor-pointer shadow-xs"
                            title="Giriş Bilgilerini & Şifreyi Mail / WhatsApp İle Gönder"
                          >
                            <Mail className="w-3.5 h-3.5 text-indigo-600" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditStudent(std)}
                            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors cursor-pointer shadow-xs"
                            title="Düzenle"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStudentToDelete(std)}
                            className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 rounded-lg transition-colors cursor-pointer shadow-xs"
                            title="Öğrenciyi Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ) : (
        /* CLASSES VIEW */
        <div className="space-y-4">
          {!isAdmin && (
            <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs flex items-center gap-3 shadow-xs">
              <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl shrink-0">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1">
                <strong className="font-bold text-white">Yönetici İzinli Sınıf Görünümü:</strong> Yalnızca Kurum Yöneticisinin erişim yetkisi verdiği sınıflar ({classes.length}) görüntülenmektedir. Sınıf ekleme, düzenleme ve silme yetkileri yalnızca yöneticiye aittir.
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {classes.map((cls) => {
              const classStudents = students.filter((s) => s.classId === cls.id);
              return (
                <div
                  key={cls.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <School className="w-5 h-5" />
                      </div>
                      {isAdmin && (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => openEditClass(cls)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Düzenle"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setClassToDelete(cls)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Sınıfı Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-white mb-1">
                      {formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)}
                    </h3>
                    <div className="flex items-center space-x-2 mb-2">
                      {cls.schoolLevel && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          {cls.schoolLevel}
                        </span>
                      )}
                      <span className="text-xs text-indigo-300 font-medium">
                        Şube {cls.branch?.replace(/şube\s*/i, '').trim() || 'A'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-4 line-clamp-2">
                      {cls.description || 'Akademik takip ve ders çizelgesi grubu.'}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs text-slate-400">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span>
                        <strong className="text-white">{classStudents.length}</strong> Kayıtlı Öğrenci
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                      {cls.academicYear}
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setViewingClassStudents(cls);
                        setClassStudentSearch('');
                      }}
                      className="py-2 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer shadow-md shadow-indigo-600/20"
                      title={`${cls.name} sınıfına kayıtlı öğrencilerin listesini görüntüle`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="truncate">Öğrenciler ({classStudents.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTransferTargetClass(cls);
                        setTransferSelectedStudentIds([]);
                        setTransferSearchTerm('');
                      }}
                      className="py-2 px-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                      title="Sistemdeki öğrencileri tek tek veya toplu bu sınıfa aktar"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="truncate">Öğrenci Aktar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStudentClassId(cls.id);
                        setStudentSchoolLevel(cls.schoolLevel || 'Ortaokul');
                        setStudentGradeLevel(cls.gradeLevel || '5. Sınıf');
                        setStudentBranch(cls.branch || 'Şube A');
                        setIsAddStudentOpen(true);
                      }}
                      className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                      title="Bu sınıfa sıfırdan yeni öğrenci kaydet"
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="truncate">Yeni Öğrenci</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClassFilter(cls.id);
                        setActiveTab('students');
                      }}
                      className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                      title="Öğrenci tablosunda bu sınıfı filtrele"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">Tabloda Gör</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ADD/EDIT STUDENT MODAL */}
      {isAddStudentOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
          onClick={() => setIsAddStudentOpen(false)}
        >
          <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
            <div
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                <h3 className="text-lg font-bold text-white">
                  {editingStudent ? 'Öğrenci Bilgilerini Düzenle' : 'Yeni Öğrenci Ekle'}
                </h3>
                <button
                  onClick={() => setIsAddStudentOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

            {studentFormError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-2 text-xs text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{studentFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Ad Soyad *</label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Ahmet Yılmaz"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    value={studentUsername}
                    onChange={(e) => setStudentUsername(e.target.value)}
                    placeholder="ornek_kullanici"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Okul, Sınıf ve Şube Seçimleri - MECBURİ */}
              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                    <School className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Okul, Sınıf ve Şube Belirleme (Mecburi)</span>
                  </span>
                  <span className="text-[11px] text-amber-400 font-semibold">* Zorunlu</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Okul Açılır Buton */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Okul *
                    </label>
                    <select
                      required
                      value={studentSchoolLevel}
                      onChange={(e) => {
                        const newSchool = e.target.value as 'Ortaokul' | 'Lise' | '';
                        setStudentSchoolLevel(newSchool);
                        if (newSchool === 'Ortaokul') {
                          setStudentGradeLevel('5. Sınıf');
                        } else if (newSchool === 'Lise') {
                          setStudentGradeLevel('9. Sınıf');
                        }
                      }}
                      className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Okul Seçiniz *</option>
                      <option value="Ortaokul">Ortaokul</option>
                      <option value="Lise">Lise</option>
                    </select>
                  </div>

                  {/* Sınıf Açılır Penceresi */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Sınıf *
                    </label>
                    <select
                      required
                      value={studentGradeLevel}
                      onChange={(e) => setStudentGradeLevel(e.target.value)}
                      className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {!studentSchoolLevel ? (
                        <option value="">Önce Okul Seçiniz *</option>
                      ) : (
                        getGradesForSchoolLevel(studentSchoolLevel).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Şube Açılır Buton (İsteğe Bağlı) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-300">
                        Şube
                      </label>
                      <span className="text-[9px] text-slate-400">İsteğe Bağlı</span>
                    </div>
                    <select
                      value={studentBranch}
                      onChange={(e) => setStudentBranch(e.target.value)}
                      className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Şube Yok / İsteğe Bağlı</option>
                      {BRANCH_OPTIONS.map((b) => (
                        <option key={b.id} value={b.label}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span>Atanacak Sınıf Grubu:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {studentGradeLevel} - {studentBranch} ({studentSchoolLevel || 'Seçilmedi'})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">E-Posta</label>
                  <input
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    placeholder="ogrenci@okul.com"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Öğrenci No</label>
                  <input
                    type="text"
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    placeholder="Örn: 1042"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Telefon</label>
                <input
                  type="text"
                  value={studentPhone}
                  onChange={(e) => setStudentPhone(e.target.value)}
                  placeholder="0555 123 4567"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Öğrenci Giriş Şifresi ve E-posta Bildirimi */}
              <div className="p-3.5 bg-indigo-950/40 rounded-xl border border-indigo-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-indigo-200 flex items-center space-x-1.5">
                    <Key className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Öğrenci Giriş Şifresi *</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setStudentPassword(Math.floor(100000 + Math.random() * 900000).toString())}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline cursor-pointer"
                  >
                    🎲 Rastgele Şifre Oluştur
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showStudentPassword ? 'text' : 'password'}
                    required
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    placeholder="Örn: 123456"
                    className="w-full pl-3 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-mono tracking-wider focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStudentPassword(!showStudentPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                    title={showStudentPassword ? 'Gizle' : 'Göster'}
                  >
                    {showStudentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 space-y-1.5">
                  <div className="flex items-center space-x-1.5 font-semibold text-emerald-400">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Otomatik E-posta & Giriş Bildirimi</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Öğrenci e-postası girildiğinde sistem otomatik hoş geldin ve giriş bilgisi mailini anında öğrencinin adresine iletir. Öğrenci bu kullanıcı adı ve şifreyle "Öğrenci Girişi" panelinden sisteme erişebilir.
                  </p>
                  <div className="flex items-center space-x-2 pt-1 text-[11px] text-emerald-300 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Giriş bilgileri e-postası kayıt sonrasında sistem tarafından otomatik olarak gönderilir.</span>
                  </div>
                </div>
              </div>

              {/* Öğrenci Fotoğrafı / Bilgisayardan Resim Seç */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Öğrenci Profil Fotoğrafı (Bilgisayardan Resim Seç)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">İsteğe Bağlı</span>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 ring-2 ring-indigo-500/30 overflow-hidden shrink-0 flex items-center justify-center">
                    {studentAvatar ? (
                      <img src={studentAvatar} alt="Öğrenci" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-6 h-6 text-slate-500" />
                    )}
                  </div>

                  <div className="flex-1">
                    <input
                      ref={studentFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/jpg"
                      onChange={handleStudentPhotoChange}
                      className="hidden"
                    />
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => studentFileInputRef.current?.click()}
                        disabled={isProcessingStudentPhoto}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isProcessingStudentPhoto ? 'İşleniyor...' : 'Bilgisayardan Resim Seç'}</span>
                      </button>

                      {studentAvatar && (
                        <button
                          type="button"
                          onClick={() => setStudentAvatar('')}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Fotoğrafı Kaldır"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      PNG, JPG veya WebP • Otomatik optimize edilir
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-md cursor-pointer"
                >
                  {editingStudent ? 'Değişiklikleri Kaydet' : 'Öğrenciyi Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}

      {/* ADD/EDIT CLASS MODAL */}
      {isAddClassOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
          onClick={() => setIsAddClassOpen(false)}
        >
          <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
            <div
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <h3 className="text-lg font-bold text-white">
                  {editingClass ? 'Sınıfı Düzenle' : 'Yeni Sınıf Oluştur'}
                </h3>
                <button
                  onClick={() => setIsAddClassOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Excel'den Sınıfı Toplu Ekle Butonu / Hızlı Erişim Barı */}
              <div className="mb-4 p-3 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      Excel'den Sınıfı Toplu Ekle
                    </div>
                    <div className="text-[11px] text-slate-300 truncate">
                      Öğrencileri Excel listesiyle bu sınıfa tek tıkla yükleyin
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddClassOpen(false);
                    setIsExcelClassModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shrink-0 shadow-sm flex items-center space-x-1 cursor-pointer transition-all"
                  title="Çoklu sınıf aktarımı sihirbazını aç"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Toplu Sınıf Sihirbazı</span>
                </button>
              </div>

            {classFormError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-2 text-xs text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{classFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveClass} className="space-y-4">
              {/* Okul, Sınıf ve Şube Seçimleri - MECBURİ */}
              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                    <School className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Kademe & Şube Belirleme (Mecburi)</span>
                  </span>
                  <span className="text-[11px] text-amber-400 font-semibold">* Zorunlu</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Okul Açılır Buton */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Okul *
                    </label>
                    <select
                      required
                      value={classSchoolLevel}
                      onChange={(e) => {
                        const newSchool = e.target.value as 'Ortaokul' | 'Lise' | '';
                        setClassSchoolLevel(newSchool);
                        const firstGrade = newSchool === 'Lise' ? '9. Sınıf' : '5. Sınıf';
                        setClassGradeLevel(firstGrade);
                        setClassName(`${firstGrade} - ${classBranch}`);
                      }}
                      className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Okul Seçiniz *</option>
                      <option value="Ortaokul">Ortaokul</option>
                      <option value="Lise">Lise</option>
                    </select>
                  </div>

                  {/* Sınıf Açılır Penceresi */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Sınıf *
                    </label>
                    <select
                      required
                      value={classGradeLevel}
                      onChange={(e) => {
                        const newGrade = e.target.value;
                        setClassGradeLevel(newGrade);
                        setClassName(formatClassDisplayName('', classBranch, newGrade));
                      }}
                      className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {!classSchoolLevel ? (
                        <option value="">Önce Okul Seçiniz *</option>
                      ) : (
                        getGradesForSchoolLevel(classSchoolLevel).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Şube Açılır Buton */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Şube *
                    </label>
                    <select
                      required
                      value={classBranch}
                      onChange={(e) => {
                        const newBranch = e.target.value;
                        setClassBranch(newBranch);
                        setClassName(formatClassDisplayName('', newBranch, classGradeLevel));
                      }}
                      className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Şube Seçiniz *</option>
                      {BRANCH_OPTIONS.map((b) => (
                        <option key={b.id} value={b.label}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sınıf Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: 8/A, 8/B, 6/C, 11/B"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Eğitim Yılı</label>
                  <input
                    type="text"
                    value={classAcademicYear}
                    onChange={(e) => setClassAcademicYear(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Şube Kodu / Etiketi</label>
                  <input
                    type="text"
                    value={classBranch}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-indigo-300 text-sm font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Açıklama</label>
                <textarea
                  rows={2}
                  value={classDescription}
                  onChange={(e) => setClassDescription(e.target.value)}
                  placeholder="Sınıfın hedefi ve eğitim programı..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Excel ile Bu Sınıfa Toplu Öğrenci Yükleme Bölümü */}
              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>Excel ile Bu Sınıfa Toplu Öğrenci Yükle (İsteğe Bağlı)</span>
                  </span>
                  <button
                    type="button"
                    onClick={downloadSampleClassExcel}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center space-x-1 cursor-pointer"
                    title="Excel şablonunu bilgisayarınıza indirin"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Örnek Şablon İndir</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Excel dosyanızdaki öğrenciler, bu sınıf oluşturulduğunda otomatik olarak sisteme eklenip doğrudan{' '}
                  <span className="text-indigo-300 font-semibold">
                    {classGradeLevel} - {classBranch}
                  </span>{' '}
                  şubesine atanacaktır.
                </p>

                {classExcelError && (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-2 text-xs text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{classExcelError}</span>
                  </div>
                )}

                {classExcelStudents.length === 0 ? (
                  <div>
                    <label
                      htmlFor="class-excel-upload"
                      className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 bg-slate-900/40 hover:bg-slate-850 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all group"
                    >
                      <input
                        id="class-excel-upload"
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleClassExcelFile(file);
                          e.target.value = '';
                        }}
                      />
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <Upload className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold text-white group-hover:text-emerald-300">
                        {isReadingClassExcel
                          ? 'Excel Okunuyor...'
                          : 'Excel Dosyası Seç (.xlsx, .xls, .csv)'}
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        veya bilgisayarınızdan dosyayı buraya sürükleyip bırakın
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-2 bg-slate-900/90 p-3 rounded-xl border border-emerald-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="text-xs font-bold text-emerald-300">
                          {classExcelStudents.length} Öğrenci Hazır
                        </span>
                        <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                          ({classExcelFileName})
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setShowExcelStudentList(!showExcelStudentList)}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                        >
                          {showExcelStudentList ? 'Gizle' : 'Öğrencileri Gör'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setClassExcelStudents([]);
                            setClassExcelFileName('');
                            setClassExcelError(null);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded cursor-pointer"
                          title="Listeyi Temizle"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {showExcelStudentList && (
                      <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-lg bg-slate-950/70 p-2 space-y-1">
                        {classExcelStudents.map((st, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-[11px] py-1 px-2 hover:bg-slate-800/60 rounded text-slate-300"
                          >
                            <span className="font-medium text-white truncate max-w-[170px]">
                              {i + 1}. {st.fullName}
                            </span>
                            <span className="text-slate-400 font-mono">No: {st.studentNumber}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddClassOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-md flex items-center space-x-1.5 cursor-pointer"
                >
                  {classExcelStudents.length > 0 ? (
                    <>
                      <Sparkles className="w-4 h-4 text-emerald-300" />
                      <span>Sınıfı & {classExcelStudents.length} Öğrenciyi Oluştur</span>
                    </>
                  ) : (
                    <span>{editingClass ? 'Kaydet' : 'Sınıfı Oluştur'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}

      {/* EXCEL BULK UPLOAD MODAL - STUDENTS */}
      <ExcelStudentUploadModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        classes={classes}
      />

      {/* EXCEL BULK UPLOAD MODAL - CLASSES */}
      <ExcelClassUploadModal
        isOpen={isExcelClassModalOpen}
        onClose={() => setIsExcelClassModalOpen(false)}
      />

      {/* CONFIRM DELETE STUDENT MODAL */}
      <ConfirmDeleteModal
        isOpen={!!studentToDelete}
        onClose={() => setStudentToDelete(null)}
        onConfirm={() => {
          if (studentToDelete) {
            dataService.deleteStudent(studentToDelete.id);
          }
        }}
        title="Öğrenciyi Sil"
        itemBadge={studentToDelete ? `${studentToDelete.className} • #${studentToDelete.studentNumber}` : undefined}
        description={`"${studentToDelete?.name}" adlı öğrenciyi sistemden kalıcı olarak silmek istediğinize emin misiniz? Öğrencinin tüm ödev teslimleri, notları ve mesaj kayıtları da temizlenecektir.`}
        confirmButtonText="Öğrenciyi Sil"
      />

      {/* CONFIRM BULK DELETE STUDENTS MODAL */}
      <ConfirmDeleteModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        title="Seçilen Öğrencileri Sil"
        itemBadge={`${selectedStudentIds.length} Öğrenci Seçildi`}
        description={`Seçtiğiniz ${selectedStudentIds.length} adet öğrenciyi sistemden kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve seçilen öğrencilerin tüm ödev teslimleri, notları, mesajları ve etüt kayıtları silinecektir.`}
        confirmButtonText={`Evet, ${selectedStudentIds.length} Öğrenciyi Sil`}
        isDanger={true}
      />

      {/* CONFIRM DELETE CLASS MODAL */}
      <ConfirmDeleteModal
        isOpen={!!classToDelete}
        onClose={() => setClassToDelete(null)}
        onConfirm={() => {
          if (classToDelete) {
            dataService.deleteClass(classToDelete.id);
          }
        }}
        title="Sınıfı Sil"
        itemBadge={classToDelete?.branch}
        description={`"${classToDelete?.name}" sınıfını silmek istediğinize emin misiniz? Bu sınıfa kayıtlı öğrencilerin sınıf atamaları sıfırlanacaktır.`}
        confirmButtonText="Sınıfı Sil"
      />

      {/* STUDENT WELCOME CREDENTIALS & EMAIL DISPATCH MODAL */}
      <StudentWelcomeCredentialsModal
        isOpen={!!selectedCredentialsStudent}
        onClose={() => setSelectedCredentialsStudent(null)}
        student={selectedCredentialsStudent}
      />

      {/* SINIF ÖĞRENCİ LİSTESİ PENCERESİ (MODAL) */}
      {viewingClassStudents && (() => {
        const classStudents = students.filter((s) => s.classId === viewingClassStudents.id);
        const filteredStudents = classStudents.filter((s) => {
          const q = classStudentSearch.toLowerCase().trim();
          if (!q) return true;
          return (
            s.name.toLowerCase().includes(q) ||
            (s.studentNumber && s.studentNumber.includes(q)) ||
            (s.phone && s.phone.includes(q)) ||
            (s.email && s.email.toLowerCase().includes(q))
          );
        });

        const handleCopyList = () => {
          const text = classStudents
            .map((s, idx) => `${idx + 1}. ${s.name} (No: ${s.studentNumber || '-'})`)
            .join('\n');
          navigator.clipboard.writeText(text);
          alert('Sınıf öğrenci listesi panoya kopyalandı.');
        };

        return (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
            onClick={() => setViewingClassStudents(null)}
          >
            <div
              className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <School className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base sm:text-lg font-bold text-white">
                        {formatClassDisplayName(viewingClassStudents.name, viewingClassStudents.branch, viewingClassStudents.gradeLevel)} — Kayıtlı Öğrenci Listesi
                      </h3>
                      {viewingClassStudents.schoolLevel && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          {viewingClassStudents.schoolLevel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {viewingClassStudents.branch} • {viewingClassStudents.academicYear} • Toplam{' '}
                      <strong className="text-indigo-300 font-bold">{classStudents.length}</strong> Öğrenci Kayıtlı
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingClassStudents(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Toolbar: Search & Action buttons */}
              <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={classStudentSearch}
                    onChange={(e) => setClassStudentSearch(e.target.value)}
                    placeholder="Sınıf içinde isim, no veya veli tel ara..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentClassId(viewingClassStudents.id);
                      setStudentSchoolLevel(viewingClassStudents.schoolLevel || 'Ortaokul');
                      setStudentGradeLevel(viewingClassStudents.gradeLevel || '5. Sınıf');
                      setStudentBranch(viewingClassStudents.branch || 'Şube A');
                      setIsAddStudentOpen(true);
                    }}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-md shadow-indigo-600/20"
                    title="Bu sınıfa sıfırdan yeni öğrenci kaydet"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Yeni Öğrenci</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTransferTargetClass(viewingClassStudents);
                      setTransferSelectedStudentIds([]);
                      setTransferSearchTerm('');
                    }}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-md shadow-emerald-600/20"
                    title="Sistemdeki öğrencileri tek tek veya toplu olarak bu sınıfa aktar"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Öğrenci Aktar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyList}
                    disabled={classStudents.length === 0}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer border border-slate-700"
                    title="Öğrenci listesini kopyala"
                  >
                    <span>📋 Kopyala</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClassFilter(viewingClassStudents.id);
                      setViewingClassStudents(null);
                      setActiveTab('students');
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer border border-slate-700"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tabloda Aç</span>
                  </button>
                </div>
              </div>

              {/* Student Table / Cards */}
              <div className="flex-1 overflow-y-auto p-4 max-h-[55vh]">
                {classStudents.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Bu Sınıfa Kayıtlı Öğrenci Yok</h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                      "{viewingClassStudents.name}" sınıfına henüz hiçbir öğrenci kaydedilmemiş. Hemen yeni bir öğrenci ekleyebilir veya sistemdeki öğrencileri bu sınıfa aktarabilirsiniz.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setStudentClassId(viewingClassStudents.id);
                          setStudentSchoolLevel(viewingClassStudents.schoolLevel || 'Ortaokul');
                          setStudentGradeLevel(viewingClassStudents.gradeLevel || '5. Sınıf');
                          setStudentBranch(viewingClassStudents.branch || 'Şube A');
                          setIsAddStudentOpen(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer flex items-center space-x-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Yeni Öğrenci Ekle</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTransferTargetClass(viewingClassStudents);
                          setTransferSelectedStudentIds([]);
                          setTransferSearchTerm('');
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer flex items-center space-x-1.5"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>Sistemdeki Öğrencileri Aktar</span>
                      </button>
                    </div>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    "{classStudentSearch}" aramasına uygun öğrenci bulunamadı.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 text-slate-500 text-[11px] font-bold border-b border-slate-200 uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">Öğrenci Adı Soyadı</th>
                          <th className="py-2.5 px-3">Okul No</th>
                          <th className="py-2.5 px-3">Veli / İletişim</th>
                          <th className="py-2.5 px-3">E-posta</th>
                          <th className="py-2.5 px-3 text-right">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredStudents.map((std, idx) => {
                          const isDuplicate = duplicateStudentGroups.duplicateIds.has(std.id);
                          return (
                          <tr
                            key={std.id}
                            className={
                              isDuplicate
                                ? 'bg-amber-50/90 hover:bg-amber-100/90 transition-colors border-l-4 border-l-amber-500'
                                : 'hover:bg-slate-50/80 transition-colors'
                            }
                          >
                            <td className="py-2.5 px-3 text-center text-slate-400 font-mono font-semibold">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center space-x-2.5">
                                <img
                                  src={std.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.name)}`}
                                  alt={std.name}
                                  className={`w-7 h-7 rounded-full object-cover border ${
                                    isDuplicate
                                      ? 'bg-amber-100 ring-2 ring-amber-400'
                                      : 'bg-slate-100 border-slate-200'
                                  }`}
                                  referrerPolicy="no-referrer"
                                />
                                <div className="flex items-center space-x-2 flex-wrap">
                                  <span className={`font-bold ${isDuplicate ? 'text-amber-950 font-extrabold' : 'text-slate-900'}`}>
                                    {std.name}
                                  </span>
                                  {isDuplicate && (
                                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                                      <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                                      <span>Mükerrer</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`font-mono px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                  isDuplicate
                                    ? 'bg-amber-200 text-amber-950 border-amber-400 font-bold'
                                    : 'text-indigo-700 bg-indigo-50 border-indigo-150'
                                }`}
                              >
                                #{std.studentNumber || '-'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 font-medium">
                              {std.phone ? (
                                <span className="font-mono text-slate-600">{std.phone}</span>
                              ) : (
                                <span className="text-slate-400 italic">Belirtilmedi</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">
                              {std.email || <span className="text-slate-400 italic">E-posta yok</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setViewingClassStudents(null);
                                    openEditStudent(std);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                  title="Öğrenciyi Düzenle"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`"${std.name}" adlı öğrenciyi "${viewingClassStudents.name}" sınıfından çıkarmak istediğinize emin misiniz?`)) {
                                      dataService.removeStudentFromClass(std.id);
                                      setStudentSuccessFeedback(`"${std.name}" adlı öğrenci ${viewingClassStudents.name} sınıfından çıkarıldı.`);
                                    }
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Öğrenciyi Bu Sınıftan Çıkar"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Gösterilen: <strong className="text-white">{filteredStudents.length}</strong> / {classStudents.length} Öğrenci
                </span>
                <button
                  type="button"
                  onClick={() => setViewingClassStudents(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SİSTEMDEN ÖĞRENCİ AKTARMA MODALI (TEKLİ & TOPLU) */}
      {transferTargetClass && (() => {
        const availableStudents = students.filter(
          (s) => s.classId !== transferTargetClass.id
        );
        const filteredTransferStudents = availableStudents.filter((s) => {
          if (transferOnlyUnassigned && s.classId && s.className && s.className !== 'Atanmadı') {
            return false;
          }
          const q = transferSearchTerm.toLowerCase().trim();
          if (!q) return true;
          return (
            s.name.toLowerCase().includes(q) ||
            (s.studentNumber && s.studentNumber.includes(q)) ||
            (s.className && s.className.toLowerCase().includes(q)) ||
            (s.email && s.email.toLowerCase().includes(q))
          );
        });

        const isAllSelected =
          filteredTransferStudents.length > 0 &&
          filteredTransferStudents.every((s) => transferSelectedStudentIds.includes(s.id));

        const toggleSelectAll = () => {
          if (isAllSelected) {
            setTransferSelectedStudentIds([]);
          } else {
            setTransferSelectedStudentIds(filteredTransferStudents.map((s) => s.id));
          }
        };

        const toggleSelectStudent = (id: string) => {
          setTransferSelectedStudentIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
          );
        };

        const handleTransferSingle = (student: Student) => {
          const count = dataService.assignStudentsToClass([student.id], transferTargetClass.id);
          if (count > 0) {
            setStudentSuccessFeedback(
              `"${student.name}" başarıyla "${transferTargetClass.name}" sınıfına aktarıldı!`
            );
            confetti({ particleCount: 40, spread: 50, origin: { y: 0.6 } });
          }
        };

        const handleTransferBulk = () => {
          if (transferSelectedStudentIds.length === 0) return;
          const count = dataService.assignStudentsToClass(
            transferSelectedStudentIds,
            transferTargetClass.id
          );
          if (count > 0) {
            setStudentSuccessFeedback(
              `${count} öğrenci başarıyla "${transferTargetClass.name}" sınıfına aktarıldı!`
            );
            setTransferSelectedStudentIds([]);
            confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
          }
        };

        return (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
            onClick={() => setTransferTargetClass(null)}
          >
            <div
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                      <span>Öğrenci Aktarımı</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {transferTargetClass.name}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Sistemdeki öğrencileri tek tek veya çoklu seçimle toplu olarak bu sınıfa aktarabilirsiniz.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTransferTargetClass(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filter & Search Bar */}
              <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={transferSearchTerm}
                      onChange={(e) => setTransferSearchTerm(e.target.value)}
                      placeholder="Öğrenci adı, okul no veya mevcut sınıf ara..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => setTransferOnlyUnassigned(false)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        !transferOnlyUnassigned
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Tüm Sistem ({availableStudents.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransferOnlyUnassigned(true)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        transferOnlyUnassigned
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Sadece Sınıfsızlar
                    </button>
                  </div>
                </div>

                {/* Bulk Select Toolbar */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <label className="flex items-center space-x-2 text-slate-300 font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      disabled={filteredTransferStudents.length === 0}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700 cursor-pointer"
                    />
                    <span>
                      Tümünü Seç ({filteredTransferStudents.length})
                      {transferSelectedStudentIds.length > 0 && (
                        <strong className="text-indigo-400 ml-1.5">
                          ({transferSelectedStudentIds.length} seçildi)
                        </strong>
                      )}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleTransferBulk}
                    disabled={transferSelectedStudentIds.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Seçilenleri Toplu Aktar ({transferSelectedStudentIds.length})</span>
                  </button>
                </div>
              </div>

              {/* Student Transfer List */}
              <div className="flex-1 overflow-y-auto p-4 max-h-[50vh] space-y-2">
                {filteredTransferStudents.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    Aktarılabilecek öğrenci bulunamadı.
                  </div>
                ) : (
                  filteredTransferStudents.map((std) => {
                    const isSelected = transferSelectedStudentIds.includes(std.id);
                    return (
                      <div
                        key={std.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-indigo-950/40 border-indigo-500/50'
                            : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectStudent(std.id)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700 cursor-pointer"
                          />
                          <img
                            src={
                              std.avatar ||
                              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                std.name
                              )}`
                            }
                            alt={std.name}
                            className="w-9 h-9 rounded-full bg-slate-800 object-cover border border-slate-700"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="font-bold text-white text-xs flex items-center space-x-2">
                              <span>{std.name}</span>
                              <span className="font-mono text-slate-400 text-[10px]">
                                #{std.studentNumber}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                              <span>Mevcut Sınıf:</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  !std.className || std.className === 'Atanmadı'
                                    ? 'bg-slate-800 text-slate-400'
                                    : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                                }`}
                              >
                                {std.className || 'Sınıfsız'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTransferSingle(std)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer shrink-0"
                          title={`${std.name} adlı öğrenciyi ${transferTargetClass.name} sınıfına aktar`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Bu Sınıfa Aktar</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Toplam {filteredTransferStudents.length} aktarılabilir öğrenci listeleniyor
                </span>
                <button
                  type="button"
                  onClick={() => setTransferTargetClass(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* DUPLICATE STUDENT WARNING MODAL (ÇAKIŞAN ÖĞRENCİ UYARI VE SEÇİM PENCERESİ) */}
      {/* ========================================================================= */}
      {duplicateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl shadow-amber-950/40 relative">
            <div className="flex items-start space-x-3.5 mb-4">
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                  Aynı İsim, Sınıf ve Numaraya Sahip Öğrenci Bulundu!
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sistemde bu öğrenciyle tamamen eşleşen kayıtlı bir profil tespit edildi.
                </p>
              </div>
            </div>

            {/* Bilgi Karşılaştırma Kartı */}
            <div className="bg-slate-950/80 rounded-xl p-3.5 border border-slate-800 space-y-3 mb-5 text-xs">
              <div className="text-amber-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <span>📋 Çakışan Kayıt Bilgileri</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-slate-300">
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500 block">Öğrenci Adı Soyadı</span>
                  <span className="font-bold text-white text-sm">
                    {duplicateWarning.existingStudent.name}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500 block">Okul Numarası</span>
                  <span className="font-mono font-bold text-amber-300">
                    #{duplicateWarning.existingStudent.studentNumber || '-'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500 block">Sınıf & Şube</span>
                  <span className="font-semibold text-slate-200">
                    {duplicateWarning.existingStudent.className || '-'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500 block">İletişim</span>
                  <span className="text-slate-400 truncate block">
                    {duplicateWarning.existingStudent.email || duplicateWarning.existingStudent.phone || 'Girilmedi'}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Nasıl devam etmek istersiniz? Mevcut kayıtlı öğrenciyi yeni bilgilerle güncelleyebilir veya her iki kaydı da ayrı ayrı tutabilirsiniz:
            </p>

            {/* Aksiyon Butonları */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleDuplicateReplace}
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Kayıtlı Öğrenciyi Değiştir</span>
              </button>

              <button
                type="button"
                onClick={handleDuplicateKeepBoth}
                className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Users className="w-4 h-4" />
                <span>İkisini de Tut (Ayrı Kaydet)</span>
              </button>
            </div>

            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer py-1"
              >
                Vazgeç ve Düzenlemeye Dön
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
