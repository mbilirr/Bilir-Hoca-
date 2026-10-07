import React, { useState, useMemo, useDeferredValue } from 'react';
import { ExpandableStrip, StripAction } from '../ui/ExpandableStrip';
import { usePagedList, useMediaQuery, ShowMoreBar } from '../../lib/listPaging';
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
import { Student, ClassGroup, StudentCredential, StudentAccountFailure } from '../../types';
import { dataService } from '../../services/dataService';
import { compressImageToDataUrl } from '../../lib/imageCompressor';
import { ExcelStudentUploadModal } from './ExcelStudentUploadModal';
import { ExcelClassUploadModal } from './ExcelClassUploadModal';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { StudentWelcomeCredentialsModal } from './StudentWelcomeCredentialsModal';
import { matchTurkishSearch } from '../../utils/turkishSearch';
import {
  SCHOOL_LEVELS,
  BRANCH_OPTIONS,
  getGradesForSchoolLevel,
  detectSchoolLevelFromGrade,
  formatClassDisplayName,
} from '../../constants/schoolConstants';
import * as XLSX from 'xlsx';
import confetti from 'canvas-confetti';
import { useQuickFocus } from '../../lib/quickFocus';
import { inputCls } from './FormParts';
import { PageHeader, Segmented, Modal, cx } from '../ui/kit';
import {
  STUDENT_COLUMNS,
  matrixToRows,
  extractStudentRows,
  emailIssue,
  normalizeTurkishPhone,
  PHONE_ERROR,
  currentAcademicYear,
  normalizeAcademicYear,
} from '../../lib/importNormalize';

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
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null); // Aşama 21: açık sınıf şeridi

  // Hızlı arama / ana sayfa kısayolu ile gelindiyse ilgili öğrenciyi, sınıfı veya ekleme formunu aç
  useQuickFocus(['student', 'class', 'action'], (f) => {
    if (f.type === 'student') {
      setActiveTab('students');
      setSelectedClassFilter('all');
      setSearchTerm(f.label);
    } else if (f.type === 'class') {
      setActiveTab('students');
      setSearchTerm('');
      setSelectedClassFilter(f.id);
    } else if (f.id === 'student-create') {
      setActiveTab('students');
      resetStudentForm();
      setEditingStudent(null);
      setIsAddStudentOpen(true);
    }
  });

  // Kurum Yöneticisi kontrolü
  const isAdmin = dataService.isCurrentUserAdmin();
  // Aşama 18: öğrenci/sınıf ekleme, çıkarma ve düzenleme yalnızca genel yönetici ve (izin verilmişse) kurum yöneticisinde.
  // Öğretmenler öğrenci listesini görür; ödev, etüt, soru hedefi gibi işleri yapar.
  const canAddStudents = dataService.canManageStudents();
  const canAddClasses = dataService.canManageClasses();
  // Öğrencilerin taşınabileceği sınıflar (kurum yöneticisi: yalnızca kendi açtığı sınıflar)
  const manageableClasses = classes.filter((c) => dataService.canManageClass(c));

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
  // Hesap açma / şifre belirleme sonrası gösterilecek giriş bilgileri (şifre yalnızca bu an görünür)
  const [credentialsResult, setCredentialsResult] = useState<{
    credentials: StudentCredential[];
    failures: StudentAccountFailure[];
    title?: string;
  } | null>(null);
  // Şifre belirleme penceresi
  const [passwordTarget, setPasswordTarget] = useState<Student | null>(null);
  const [passwordTargetValue, setPasswordTargetValue] = useState('');
  const [passwordTargetError, setPasswordTargetError] = useState<string | null>(null);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [isSavingStudent, setIsSavingStudent] = useState(false);

  // New student form state
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [studentSuccessFeedback, setStudentSuccessFeedback] = useState<string | null>(null);
  const [studentClassId, setStudentClassId] = useState(classes[0]?.id || '');
  const [studentNumber, setStudentNumber] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentAvatar, setStudentAvatar] = useState<string>('');
  const [isProcessingStudentPhoto, setIsProcessingStudentPhoto] = useState(false);
  const [studentFormError, setStudentFormError] = useState<string | null>(null);
  const [studentEmailError, setStudentEmailError] = useState<string | null>(null);
  const [studentPhoneError, setStudentPhoneError] = useState<string | null>(null);
  const [quickClassChangeFeedback, setQuickClassChangeFeedback] = useState<string | null>(null);
  const studentFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Hızlı Sınıf Değiştirme / Aktarma İşleyicisi
  const handleQuickChangeStudentClass = async (student: Student, targetClassId: string) => {
    try {
      const updated = await dataService.updateStudentClass(student.id, targetClassId);
      const targetClassName = updated.className || 'Atanmadı';
      setQuickClassChangeFeedback(`✓ ${student.name} başarıyla "${targetClassName}" sınıfına aktarıldı.`);
      setTimeout(() => setQuickClassChangeFeedback(null), 3500);
    } catch (e: any) {
      dataService.showToast((e?.message || 'Sınıf aktarılırken bir hata oluştu.').replace(/^\[\w+\]\s*/, ''), 'error');
    }
  };

  // Öğrenci formundan gelen bilgiler
  interface StudentFormPayload {
    name: string;
    email: string;
    classId: string;
    studentNumber: string;
    phone: string;
    avatar: string;
    password: string;
  }
  // Aynı ad ve numarayla kayıtlı öğrenci uyarısı
  interface DuplicateWarningState {
    existingStudent: Student;
    newStudentPayload: StudentFormPayload;
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
  const [classAcademicYear, setClassAcademicYear] = useState(() => currentAcademicYear());
  const [classDescription, setClassDescription] = useState('');
  const [classFormError, setClassFormError] = useState<string | null>(null);
  const [isSavingClass, setIsSavingClass] = useState(false);

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
        nameColor: 'text-amber-800 dark:text-amber-200 font-black',
        badgeBg: 'bg-amber-100 dark:bg-amber-500/15',
        badgeText: 'text-amber-950 dark:text-amber-200 font-bold',
        badgeBorder: 'border-amber-400',
        rowBg: 'bg-amber-50/90 dark:bg-amber-500/10',
        rowHover: 'hover:bg-amber-100/80 dark:hover:bg-amber-500/15',
        borderLeft: 'border-l-4 border-l-amber-500',
        ringColor: 'ring-amber-500',
        pillBg: 'bg-amber-600',
        label: '1. Kayıt',
      },
      {
        nameColor: 'text-rose-800 dark:text-rose-200 font-black',
        badgeBg: 'bg-rose-100 dark:bg-rose-500/15',
        badgeText: 'text-rose-950 dark:text-rose-200 font-bold',
        badgeBorder: 'border-rose-400',
        rowBg: 'bg-rose-50/90 dark:bg-rose-500/10',
        rowHover: 'hover:bg-rose-100/80 dark:hover:bg-rose-500/15',
        borderLeft: 'border-l-4 border-l-rose-500',
        ringColor: 'ring-rose-500',
        pillBg: 'bg-rose-600',
        label: '2. Kayıt',
      },
      {
        nameColor: 'text-purple-800 dark:text-purple-200 font-black',
        badgeBg: 'bg-purple-100 dark:bg-purple-500/15',
        badgeText: 'text-purple-950 dark:text-purple-200 font-bold',
        badgeBorder: 'border-purple-400',
        rowBg: 'bg-purple-50/90 dark:bg-purple-500/10',
        rowHover: 'hover:bg-purple-100/80 dark:hover:bg-purple-500/15',
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
  // Aşama 15: yazarken kutu donmasın diye süzme bir adım geriden gelir
  const deferredSearch = useDeferredValue(searchTerm);
  const filteredStudents = useMemo(() => {
    const searchTerm = deferredSearch;
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
  }, [students, classes, deferredSearch, selectedClassFilter, sortOrder, duplicateStudentGroups]);
  // Aşama 15: liste parça parça çizilir; telefonda yalnız kart listesi, bilgisayarda yalnız tablo çizilir
  const isPhoneList = useMediaQuery('(max-width: 767px)');
  const pagedStudents = usePagedList(filteredStudents, `${deferredSearch}|${selectedClassFilter}|${sortOrder}`);

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

  const handleConfirmBulkDelete = async () => {
    if (selectedStudentIds.length === 0) return;
    const count = selectedStudentIds.length;
    const idsToDelete = [...selectedStudentIds];
    setSelectedStudentIds([]);
    setIsBulkDeleteModalOpen(false);
    try {
      await dataService.deleteStudents(idsToDelete);
      setStudentSuccessFeedback(`${count} öğrenci ve giriş hesapları sistemden silindi.`);
    } catch (err: any) {
      setStudentSuccessFeedback(`⚠️ ${err?.message || 'Bazı öğrenciler silinemedi.'}`);
    }
  };

  // Handle Add / Edit Student (kayıt + gerçek giriş hesabı birlikte)
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentFormError(null);

    if (!editingStudent && !canAddStudents) {
      setStudentFormError('Öğrenci ekleyebilmeniz için yöneticinin size en az bir sınıf yetkisi vermesi gerekir.');
      return;
    }
    const cleanName = studentName.trim().replace(/\s+/g, ' ');
    const cleanNumber = studentNumber.trim();
    if (cleanName.length < 2) {
      setStudentFormError('Lütfen öğrencinin adını ve soyadını giriniz.');
      return;
    }
    if (!cleanNumber) {
      setStudentFormError('Öğrenci numarası zorunludur: öğrenci sisteme bu numara ve şifresiyle giriş yapar.');
      return;
    }
    if (!dataService.isValidLoginIdentifier(cleanNumber)) {
      setStudentFormError('Öğrenci numarası yalnızca rakam/harf içermelidir (boşluksuz, en fazla 20 karakter).');
      return;
    }
    const targetClass = classes.find((c) => c.id === studentClassId);
    if (!targetClass) {
      setStudentFormError('Lütfen öğrencinin sınıfını seçiniz.');
      return;
    }
    const mailProblem = emailIssue(studentEmail);
    const phoneNorm = normalizeTurkishPhone(studentPhone);
    setStudentEmailError(mailProblem);
    setStudentPhoneError(phoneNorm.valid ? null : PHONE_ERROR);
    if (mailProblem || !phoneNorm.valid) {
      setStudentFormError('Lütfen işaretli alanları düzeltiniz.');
      return;
    }
    const cleanPassword = studentPassword.trim();
    if (!editingStudent && cleanPassword.length < 6) {
      setStudentFormError('Giriş şifresi en az 6 karakter olmalıdır.');
      return;
    }
    if (editingStudent && cleanPassword && cleanPassword.length < 6) {
      setStudentFormError('Yeni şifre en az 6 karakter olmalıdır (şifreyi değiştirmeyecekseniz alanı boş bırakınız).');
      return;
    }

    const payload: StudentFormPayload = {
      name: cleanName,
      email: studentEmail.trim(),
      classId: targetClass.id,
      studentNumber: cleanNumber,
      phone: phoneNorm.value,
      avatar:
        studentAvatar ||
        editingStudent?.avatar ||
        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(cleanName)}`,
      password: cleanPassword,
    };

    // Aynı numara başka bir öğrencide mi? (Numara giriş adıdır, benzersiz olmalı)
    const numberOwner = students.find(
      (s) => s.id !== editingStudent?.id && (s.studentNumber || '').trim().toLowerCase() === cleanNumber.toLowerCase()
    );
    if (numberOwner) {
      const sameName = numberOwner.name.trim().toLocaleLowerCase('tr') === cleanName.toLocaleLowerCase('tr');
      if (sameName && !editingStudent) {
        setDuplicateWarning({ existingStudent: numberOwner, newStudentPayload: payload });
        return;
      }
      setStudentFormError(`"${cleanNumber}" numarası "${numberOwner.name}" adlı öğrenciye ait. Lütfen farklı bir numara giriniz.`);
      return;
    }

    setIsSavingStudent(true);
    try {
      if (editingStudent) {
        await dataService.updateStudent(
          editingStudent.id,
          {
            name: payload.name,
            email: payload.email,
            classId: payload.classId,
            studentNumber: payload.studentNumber,
            phone: payload.phone,
            avatar: payload.avatar,
          },
          { newPassword: payload.password || undefined }
        );
        const fresh = dataService.getAllStudents().find((s) => s.id === editingStudent.id);
        if (payload.password && fresh) {
          setCredentialsResult({ credentials: [{ student: fresh, password: payload.password }], failures: [], title: 'Yeni Giriş Bilgileri' });
        }
        setStudentSuccessFeedback(`Öğrenci "${payload.name}" başarıyla güncellendi.`);
        setTimeout(() => setStudentSuccessFeedback(null), 4000);
        setEditingStudent(null);
        setIsAddStudentOpen(false);
      } else {
        const credential = await dataService.createStudentAccount({
          name: payload.name,
          studentNumber: payload.studentNumber,
          classId: payload.classId,
          email: payload.email,
          phone: payload.phone,
          avatar: payload.avatar,
          password: payload.password,
        });
        setIsAddStudentOpen(false);
        setCredentialsResult({ credentials: [credential], failures: [], title: 'Öğrenci Eklendi' });
        setStudentSuccessFeedback(`Öğrenci "${payload.name}" eklendi ve giriş hesabı açıldı.`);
        setTimeout(() => setStudentSuccessFeedback(null), 5000);
      }
      resetStudentForm();
    } catch (err: any) {
      setStudentFormError(err.message || 'Öğrenci kaydedilirken bir hata oluştu.');
    } finally {
      setIsSavingStudent(false);
    }
  };

  // Aynı ad ve numaralı kayıtlı öğrenci bulunduğunda: kayıtlı öğrenciyi yeni bilgilerle güncelle
  const handleDuplicateReplace = async () => {
    if (!duplicateWarning) return;
    const { existingStudent, newStudentPayload } = duplicateWarning;
    try {
      await dataService.updateStudent(
        existingStudent.id,
        {
          name: newStudentPayload.name,
          email: newStudentPayload.email,
          classId: newStudentPayload.classId,
          phone: newStudentPayload.phone,
          avatar: newStudentPayload.avatar,
        },
        { newPassword: newStudentPayload.password || undefined }
      );
      const fresh = dataService.getAllStudents().find((s) => s.id === existingStudent.id);
      if (newStudentPayload.password && fresh) {
        setCredentialsResult({ credentials: [{ student: fresh, password: newStudentPayload.password }], failures: [], title: 'Yeni Giriş Bilgileri' });
      }
      setDuplicateWarning(null);
      setIsAddStudentOpen(false);
      setEditingStudent(null);
      resetStudentForm();
      setStudentSuccessFeedback(`✅ Kayıtlı öğrenci "${newStudentPayload.name}" yeni bilgilerle güncellendi.`);
      setTimeout(() => setStudentSuccessFeedback(null), 5000);
    } catch (err: any) {
      setDuplicateWarning(null);
      setStudentFormError(err.message || 'Öğrenci güncellenirken bir hata oluştu.');
    }
  };

  const resetStudentForm = () => {
    setStudentName('');
    setStudentEmail('');
    setStudentPassword(dataService.generatePassword());
    setShowStudentPassword(true);
    setStudentNumber('');
    setStudentPhone('');
    setStudentAvatar('');
    setStudentClassId(classes[0]?.id || '');
    setStudentFormError(null);
    setStudentEmailError(null);
    setStudentPhoneError(null);
  };

  const openEditStudent = (student: Student) => {
    setEditingStudent(student);
    setStudentName(student.name);
    setStudentEmail(student.email || '');
    setStudentPassword('');
    setShowStudentPassword(true);
    setStudentClassId(classes.some((c) => c.id === student.classId) ? student.classId : '');
    setStudentNumber(student.studentNumber || '');
    setStudentPhone(student.phone || '');
    setStudentAvatar(student.avatar || '');
    setStudentFormError(null);
    setStudentEmailError(null);
    setStudentPhoneError(null);
    setIsAddStudentOpen(true);
  };

  // Öğrencinin giriş şifresini yenile (hesabı yoksa açılır)
  const handleConfirmSetPassword = async () => {
    if (!passwordTarget) return;
    const pw = passwordTargetValue.trim();
    if (pw.length < 6) {
      setPasswordTargetError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    setIsSettingPassword(true);
    setPasswordTargetError(null);
    try {
      const credential = await dataService.setStudentPassword(passwordTarget.id, pw);
      setPasswordTarget(null);
      setCredentialsResult({ credentials: [credential], failures: [], title: 'Yeni Giriş Bilgileri' });
    } catch (err: any) {
      setPasswordTargetError(err?.message || 'Şifre belirlenemedi.');
    } finally {
      setIsSettingPassword(false);
    }
  };

  // Excel bulk upload state for Add Class modal
  interface ExcelClassStudentPreview {
    rowNumber: number;
    fullName: string;
    studentNumber: string;
    email: string;
    phone: string;
    // Önizlemede bulunan hata veya kayıt sırasında sunucudan dönen hata (satır aktarılmaz / aktarılamadı)
    error?: string;
  }
  const [classExcelStudents, setClassExcelStudents] = useState<ExcelClassStudentPreview[]>([]);
  const [classExcelFileName, setClassExcelFileName] = useState<string>('');
  const [isReadingClassExcel, setIsReadingClassExcel] = useState<boolean>(false);
  const [classExcelError, setClassExcelError] = useState<string | null>(null);
  const [showExcelStudentList, setShowExcelStudentList] = useState<boolean>(false);

  const classExcelValidRows = classExcelStudents.filter((r) => !r.error);
  const classExcelInvalidCount = classExcelStudents.length - classExcelValidRows.length;

  // Sınıf penceresindeki Excel satırlarını doğrula (isim, numara, e-posta, telefon)
  const validateClassExcelRows = (rows: ExcelClassStudentPreview[]): ExcelClassStudentPreview[] => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.studentNumber.trim().toLowerCase();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    });
    const taken = new Map(
      students.map((s) => [(s.studentNumber || '').trim().toLowerCase(), s.name] as const).filter(([k]) => !!k)
    );
    return rows.map((r) => {
      const num = r.studentNumber.trim();
      let error: string | undefined;
      if (!r.fullName.trim()) error = 'Ad soyad bulunamadı (isim sütunu boş)';
      else if (r.fullName.trim().length < 2) error = 'İsim bilgisi geçersiz';
      else if (!num) error = 'Öğrenci no zorunlu (giriş adı)';
      else if (!dataService.isValidLoginIdentifier(num)) error = 'Numara yalnızca rakam/harf olmalı';
      else if ((counts.get(num.toLowerCase()) || 0) > 1) error = 'Numara listede tekrar ediyor';
      else if (taken.has(num.toLowerCase())) error = `Bu numara "${taken.get(num.toLowerCase())}" adlı öğrenciye ait`;
      else if (emailIssue(r.email)) error = emailIssue(r.email) || undefined;
      else if (!normalizeTurkishPhone(r.phone).valid) error = PHONE_ERROR;
      return { ...r, error };
    });
  };

  const resetClassExcelState = () => {
    setClassExcelStudents([]);
    setClassExcelFileName('');
    setClassExcelError(null);
    setShowExcelStudentList(false);
  };

  // "Yeni Sınıf Ekle": önceki düzenlemeden kalan bilgileri temizle, eğitim yılını bugüne göre hesapla
  const resetClassForm = () => {
    setEditingClass(null);
    setClassName('');
    setClassSchoolLevel('Ortaokul');
    setClassGradeLevel('5. Sınıf');
    setClassBranch('A');
    setClassAcademicYear(currentAcademicYear());
    setClassDescription('');
    setClassFormError(null);
    resetClassExcelState();
  };

  const downloadSampleClassExcel = () => {
    // Örnek e-postalar açıkça örnek adreslerdir: gerçek adresle değiştirilmeli veya silinmelidir
    const sampleData = [
      {
        'Öğrenci Adı': 'Ahmet',
        'Öğrenci Soyadı': 'Yılmaz',
        'Öğrenci No': '101',
        'E-posta': 'ornek1@example.com',
        'Veli Telefonu': '05551112233',
      },
      {
        'Öğrenci Adı': 'Zeynep',
        'Öğrenci Soyadı': 'Kaya',
        'Öğrenci No': '102',
        'E-posta': 'ornek2@example.com',
        'Veli Telefonu': '05552223344',
      },
      {
        'Öğrenci Adı': 'Mehmet Ali',
        'Öğrenci Soyadı': 'Demir',
        'Öğrenci No': '103',
        'E-posta': '',
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
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        // Başlık satırı ilk 10 satır içinde aranır (e-Okul listelerinde üstte başlık satırları olur)
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false });
        const { headers, rows } = matrixToRows(matrix, STUDENT_COLUMNS);

        if (rows.length === 0) {
          setClassExcelError('Yüklenen Excel dosyasında öğrenci verisi bulunamadı.');
          return;
        }

        const parsed = validateClassExcelRows(
          extractStudentRows(headers, rows).map((f) => {
            const phone = normalizeTurkishPhone(f.phone);
            return {
              rowNumber: f.rowNumber,
              fullName: f.fullName,
              studentNumber: f.studentNumber,
              email: f.email,
              phone: phone.valid ? phone.value : f.phone,
            };
          })
        );

        if (!parsed.some((r) => r.fullName.trim())) {
          setClassExcelError('Ad soyad sütunu bulunamadı. Başlık satırında "Ad Soyad" veya "Ad" ve "Soyad" sütunları olmalıdır.');
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
  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingClass) return;
    setClassFormError(null);

    if (!editingClass && !canAddClasses) {
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
    const academicYear = normalizeAcademicYear(classAcademicYear);
    if (!academicYear) {
      setClassFormError(`Eğitim yılını "${currentAcademicYear()}" biçiminde yazınız.`);
      return;
    }

    setIsSavingClass(true);
    try {
      const finalClassName = className.trim() || `${classGradeLevel} - ${classBranch}`;
      const classPayload = {
        name: finalClassName,
        schoolLevel: classSchoolLevel,
        gradeLevel: classGradeLevel,
        branch: classBranch,
        academicYear,
        description: classDescription.trim(),
      };

      let savedClassId = '';
      let createdNow: ClassGroup | null = null;
      if (editingClass) {
        await dataService.updateClass(editingClass.id, classPayload);
        savedClassId = editingClass.id;
      } else {
        const { autoAssignedCount, ...created } = await dataService.addClass(classPayload);
        savedClassId = created.id;
        createdNow = created;

        if (autoAssignedCount && autoAssignedCount > 0) {
          setStudentSuccessFeedback(
            `"${finalClassName}" sınıfı oluşturuldu ve sınıfı olmayan, sınıf adı eşleşen ${autoAssignedCount} öğrenci bu sınıfa aktarıldı.`
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

      // Sınıf kaydedildi: öğrenci aktarımı başarısız olursa form bu sınıfı DÜZENLEME moduna geçer
      // (tekrar basınca ikinci bir sınıf açılmaz, yalnızca kalan öğrenciler eklenir)
      const switchToEditCreated = () => {
        if (!createdNow) return;
        const fresh = dataService.getAllClasses().find((c) => c.id === createdNow!.id) || createdNow;
        setEditingClass(fresh);
        setClassName(fresh.name);
      };

      // Excel'deki geçerli öğrencileri bu sınıfa ekle: her öğrenci için gerçek giriş hesabı açılır
      const sendable = classExcelStudents.filter((r) => !r.error);
      const skippedInvalid = classExcelStudents.length - sendable.length;
      if (sendable.length > 0) {
        let result;
        try {
          result = await dataService.createStudentsWithAccounts(
            sendable.map((std) => ({
              name: std.fullName,
              studentNumber: std.studentNumber,
              classId: savedClassId,
              email: std.email,
              phone: normalizeTurkishPhone(std.phone).value,
              schoolLevel: classSchoolLevel || undefined,
              gradeLevel: classGradeLevel,
              branch: classBranch,
            }))
          );
        } catch (err: any) {
          switchToEditCreated();
          setShowExcelStudentList(true);
          setClassFormError(
            `Sınıf kaydedildi ancak öğrenciler eklenemedi: ${err?.message || 'bilinmeyen hata'}. Tekrar denemek için "Kaydet ve Öğrencileri Ekle" düğmesine basınız.`
          );
          return;
        }

        if (result.created.length > 0 || result.failed.length > 0) {
          setCredentialsResult({ credentials: result.created, failures: result.failed, title: 'Sınıfa Eklenen Öğrenciler' });
        }
        if (result.created.length > 0) {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.6 },
          });
        }
        if (result.failed.length > 0) {
          // Eklenemeyen satırları sunucunun verdiği hatayla listede bırak, eklenenleri çıkar
          const remaining: ExcelClassStudentPreview[] = [];
          sendable.forEach((row) => {
            const f = result.failed.find(
              (x) => (x.studentNumber && x.studentNumber === row.studentNumber.trim()) || (!x.studentNumber && x.name === row.fullName.trim())
            );
            if (f) remaining.push({ ...row, error: `Eklenemedi: ${f.error}` });
          });
          setClassExcelStudents([...remaining, ...classExcelStudents.filter((r) => r.error)]);
          setShowExcelStudentList(true);
          switchToEditCreated();
          setClassFormError(
            `Sınıf kaydedildi. ${result.created.length} öğrenci eklendi, ${result.failed.length} satır eklenemedi (aşağıda işaretli). Satırı kaldırabilir veya düzeltilmiş Excel'i yeniden yükleyebilirsiniz.`
          );
          return;
        }
      }

      if (skippedInvalid > 0) {
        setStudentSuccessFeedback(
          `"${finalClassName}" sınıfı kaydedildi. ${sendable.length} öğrenci eklendi; ${skippedInvalid} hatalı Excel satırı aktarılmadı.`
        );
      }

      resetClassForm();
      setIsAddClassOpen(false);
    } catch (err: any) {
      setClassFormError(err.message || 'Sınıf oluşturulurken bir hata oluştu.');
    } finally {
      setIsSavingClass(false);
    }
  };

  const openEditClass = (cls: ClassGroup) => {
    resetClassExcelState();
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
    setClassAcademicYear(cls.academicYear || currentAcademicYear());
    setClassDescription(cls.description || '');
    setClassFormError(null);
    setIsAddClassOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Success Notification Alert */}
      {studentSuccessFeedback && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500/40 rounded-2xl flex items-center justify-between text-emerald-700 dark:text-emerald-200 text-sm shadow-xl shadow-emerald-950/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
              <Check className="w-4 h-4" />
            </div>
            <span className="font-medium">{studentSuccessFeedback}</span>
          </div>
          <button
            onClick={() => setStudentSuccessFeedback(null)}
            className="p-1 text-emerald-700 dark:text-emerald-400 hover:text-fg rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sayfa başlığı */}
      <PageHeader
        icon={Users}
        tone="brand"
        title="Öğrenciler"
        description="Öğrenci hesapları ve sınıflar"
        actions={
          activeTab === 'students' ? (
            canAddStudents ? (
              <>
                <button
                  onClick={() => setIsExcelModalOpen(true)}
                  className="ui-btn ui-btn-secondary"
                  title="Excel (.xlsx, .xls) veya CSV dosyasından toplu öğrenci ekle"
                >
                  <FileSpreadsheet className="w-4 h-4 text-success-fg" />
                  <span>Excel'den Toplu Yükle</span>
                </button>
                <button
                  onClick={() => {
                    resetStudentForm();
                    setEditingStudent(null);
                    setIsAddStudentOpen(true);
                  }}
                  className="ui-btn ui-btn-primary"
                >
                  <Plus className="w-4 h-4" />
                  <span>Yeni Öğrenci Ekle</span>
                </button>
              </>
            ) : (
              <span className="ui-chip ui-chip-warning py-1.5 px-3 text-xs">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Öğrenci ekleme ve çıkarma yöneticiye aittir
              </span>
            )
          ) : canAddClasses ? (
            <>
              <button
                type="button"
                onClick={() => setIsExcelClassModalOpen(true)}
                className="ui-btn ui-btn-secondary"
                title="Excel (.xlsx, .xls) veya CSV dosyasından toplu sınıf ekle"
              >
                <FileSpreadsheet className="w-4 h-4 text-success-fg" />
                <span>Excel'den Sınıf Yükle</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetClassForm();
                  setIsAddClassOpen(true);
                }}
                className="ui-btn ui-btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Sınıf Ekle</span>
              </button>
            </>
          ) : (
            <span className="ui-chip ui-chip-warning py-1.5 px-3 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              Sınıf ekleme yetkisi yalnızca yöneticiye aittir
            </span>
          )
        }
      />
      <Segmented
        value={activeTab}
        onChange={(v) => setActiveTab(v)}
        items={[
          { value: 'students', label: `Öğrenciler (${students.length})`, icon: Users },
          { value: 'classes', label: `Sınıflar (${classes.length})`, icon: School },
        ]}
      />

      {activeTab === 'students' ? (
        /* STUDENTS VIEW */
        <div className="space-y-4">
          {!isAdmin && (
            <div className="px-4 py-3 rounded-xl bg-brand-soft text-brand-fg text-xs flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                Size yetki verilen <strong>{classes.length} sınıf</strong> ve öğrencileri görünür. Öğrenci ekleme, çıkarma ve bilgi düzenleme
                yöneticinize aittir; siz ödev, etüt, soru hedefi, not ve yoklama işlemlerini yapabilirsiniz.
              </span>
            </div>
          )}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
          {/* Duplicate Students System Warning Banner */}
          {duplicateStudentGroups.totalDuplicates > 0 && (
            <div className="mx-4 sm:mx-5 mt-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border-2 border-amber-500/40 text-amber-950 dark:text-amber-200 flex items-start gap-3 shadow-xs">
              <div className="p-2.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-extrabold text-sm text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                    <span>⚠️ Sistem Uyarısı: Aynı İsim, Sınıf ve Numaraya Sahip Öğrenciler Tespit Edildi!</span>
                  </h4>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200 font-black border border-amber-300 dark:border-amber-500/30">
                    {duplicateStudentGroups.totalDuplicates} Kayıt İşaretlendi
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-200 dark:bg-rose-500/20 text-rose-950 dark:text-rose-200 font-black border border-rose-300 dark:border-rose-500/30">
                    {Object.keys(duplicateStudentGroups.groups).filter(k => duplicateStudentGroups.groups[k].length > 1).length} Çakışan Grup
                  </span>
                </div>
                <p className="text-xs text-amber-950/90 dark:text-amber-200/90 mt-1.5 leading-relaxed">
                  Sistemde <strong>aynı isim, sınıf ve okul numarasına</strong> sahip kayıtlı öğrenciler bulunmaktadır. Bu öğrenciler aşağıdaki listede <strong>otomatik olarak yan yana getirilmiş</strong> olup, isimleri ve satırları <strong>farklı renklerde (1. Kayıt: Turuncu, 2. Kayıt: Kırmızı)</strong> ve çakışma uyarı etiketiyle gösterilmektedir.
                </p>
              </div>
            </div>
          )}

          {/* Quick Class Change Feedback Banner */}
          {quickClassChangeFeedback && (
            <div className="mx-4 sm:mx-5 mt-3 p-3.5 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs font-extrabold flex items-center space-x-2.5 shadow-sm animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-300 shrink-0" />
              <span>{quickClassChangeFeedback}</span>
            </div>
          )}

          {/* Filter / Search Bar */}
          <div className="p-4 sm:p-5 border-b border-line flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-subtle absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Öğrenci adı, no veya e-posta ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-surface-2/80 border border-line rounded-xl text-fg text-sm placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 md:flex items-center gap-2 md:gap-3 w-full md:w-auto">
              {/* Sınıf Filtresi (Tanımsız seçeneği dahil) */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden lg:inline text-xs text-muted font-semibold whitespace-nowrap">Sınıf:</span>
                <select
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="w-full md:w-auto min-w-0 bg-surface-2/80 border border-line text-fg-2 text-xs font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="all">Tüm Sınıflar ({students.length})</option>
                  {duplicateStudentGroups.totalDuplicates > 0 && (
                    <option value="duplicates">⚠️ Mükerrer Kayıtlar ({duplicateStudentGroups.totalDuplicates})</option>
                  )}
                  <option value="unassigned">Yok ({unassignedStudentsCount})</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)} ({students.filter((s) => s.classId === cls.id).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sırala Açılır Butonu (A-Z / Z-A) */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden lg:flex text-xs text-muted font-semibold whitespace-nowrap items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-subtle" />
                  <span>Sırala:</span>
                </span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="w-full md:w-auto min-w-0 bg-surface-2/80 border border-line text-fg-2 text-xs font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none cursor-pointer"
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
            <div className="px-4 sm:px-6 py-3 bg-rose-50 dark:bg-rose-500/10 border-b border-rose-200 dark:border-rose-500/30 flex flex-wrap items-center justify-between gap-3 text-fg transition-all animate-in fade-in duration-200">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                  {selectedStudentIds.length}
                </div>
                <div>
                  <span className="text-xs font-bold text-rose-950 dark:text-rose-200">
                    {selectedStudentIds.length} Öğrenci Seçildi
                  </span>
                  <span className="text-[11px] text-rose-700 dark:text-rose-300 ml-1.5 hidden sm:inline">
                    (Listelenen {filteredStudents.length} öğrenci arasından)
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-fg-2 bg-surface border border-line-strong hover:bg-surface-2 transition-colors shadow-2xs cursor-pointer flex items-center space-x-1.5"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
                  <span>{allFilteredSelected ? 'Tümünün Seçimini Kaldır' : `Tümünü Seç (${filteredStudents.length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentIds([])}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-fg bg-surface border border-line hover:bg-surface-2 transition-colors shadow-2xs cursor-pointer"
                >
                  Temizle
                </button>
                {canAddStudents && (
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteModalOpen(true)}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-sm shadow-rose-600/30 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Seçilen Öğrencileri Sil ({selectedStudentIds.length})</span>
                </button>
                )}
              </div>
            </div>
          )}

          {/* Telefon: kart listesi */}
          {isPhoneList && (
          <ul className="md:hidden divide-y divide-line" id="students-mobile-list">
            {filteredStudents.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted">Arama kriterlerine uygun öğrenci bulunamadı.</li>
            ) : (
              pagedStudents.visible.map((std) => {
                const dupInfo = duplicateStudentGroups.dupMap.get(std.id);
                const isSelected = selectedStudentIds.includes(std.id);
                const suspended = std.isSuspended || std.status === 'suspended';
                return (
                  <li key={std.id} className={`px-4 py-3 ${isSelected ? 'bg-brand-soft' : ''}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleStudent(std.id)}
                        className="w-4 h-4 rounded border-line-strong cursor-pointer shrink-0"
                        aria-label={`${std.name} seç`}
                      />
                      <img loading="lazy" decoding="async"
                        src={std.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.name)}`}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover bg-surface-2 ring-2 ring-line shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-fg truncate">{std.name}</p>
                        <p className="text-xs text-muted truncate">
                          #{std.studentNumber} · {std.className || 'Sınıfı yok'}
                        </p>
                      </div>
                      {dataService.canManageStudent(std) && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditStudent(std)}
                            className="ui-btn ui-btn-ghost ui-btn-icon"
                            aria-label="Düzenle"
                            title="Düzenle"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStudentToDelete(std)}
                            className="ui-btn ui-btn-ghost ui-btn-icon hover:text-danger-fg"
                            aria-label="Öğrenciyi Sil"
                            title="Öğrenciyi Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-[4.25rem]">
                      {dupInfo && <span className="ui-chip ui-chip-warning">Mükerrer ({dupInfo.colorTheme.label})</span>}
                      <span className={`ui-chip ${suspended ? 'ui-chip-danger' : 'ui-chip-success'}`}>{suspended ? 'Askıda' : 'Aktif'}</span>
                      {dataService.canManageStudent(std) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordTarget(std);
                          setPasswordTargetValue(dataService.generatePassword());
                          setPasswordTargetError(null);
                        }}
                        className={`ui-chip cursor-pointer ${std.auth_user_id ? 'ui-chip-neutral' : 'ui-chip-warning'}`}
                        title={std.auth_user_id ? 'Yeni şifre belirle' : 'Şifre belirleyip giriş hesabı aç'}
                      >
                        <Key className="w-3 h-3" />
                        {std.auth_user_id ? 'Şifre yenile' : 'Hesap yok · aç'}
                      </button>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
          )}

          {/* Students Table */}
          {!isPhoneList && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-fg-2">
              <thead className="bg-surface-2/90 text-[11px] uppercase tracking-wider text-muted border-b border-line font-bold">
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
                        className="w-4 h-4 rounded border-line-strong text-indigo-600 dark:text-indigo-300 focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                  </th>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci</th>
                  <th className="px-6 py-3.5 font-semibold">Sınıf / Şube</th>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci No</th>
                  <th className="px-6 py-3.5 font-semibold">Giriş Hesabı</th>
                  <th className="px-6 py-3.5 font-semibold">Kayıt Durumu</th>
                  <th className="px-6 py-3.5 font-semibold text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-subtle">
                      <Users className="w-8 h-8 mx-auto text-subtle mb-2" />
                      <p className="font-semibold text-sm text-muted">Arama kriterlerine uygun öğrenci bulunamadı.</p>
                      <p className="text-xs text-subtle mt-1">Lütfen arama teriminizi veya sınıf filtresini değiştirip tekrar deneyin.</p>
                    </td>
                  </tr>
                ) : (
                  pagedStudents.visible.map((std) => {
                    const dupInfo = duplicateStudentGroups.dupMap.get(std.id);
                    const isDuplicate = !!dupInfo;
                    const isSelected = selectedStudentIds.includes(std.id);
                    return (
                    <tr
                      key={std.id}
                      className={
                        isSelected
                          ? 'bg-indigo-50/70 dark:bg-indigo-500/10 hover:bg-indigo-100/70 dark:hover:bg-indigo-500/15 transition-colors border-l-4 border-l-indigo-600'
                          : isDuplicate && dupInfo
                          ? `${dupInfo.colorTheme.rowBg} ${dupInfo.colorTheme.rowHover} transition-colors ${dupInfo.colorTheme.borderLeft}`
                          : 'hover:bg-surface-2/80 transition-colors'
                      }
                    >
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleStudent(std.id)}
                          className="w-4 h-4 rounded border-line-strong text-indigo-600 dark:text-indigo-300 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <img loading="lazy" decoding="async"
                            src={
                              std.avatar ||
                              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                std.name
                              )}`
                            }
                            alt={std.name}
                            className={`w-10 h-10 rounded-full object-cover ring-2 ${
                              isSelected
                                ? 'bg-indigo-100 dark:bg-indigo-500/15 ring-indigo-400 shadow-xs'
                                : isDuplicate && dupInfo
                                ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.ringColor} shadow-xs`
                                : 'bg-surface-2 ring-line'
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
                                    ? 'text-indigo-950 dark:text-indigo-200 font-bold'
                                    : isDuplicate && dupInfo
                                    ? dupInfo.colorTheme.nameColor
                                    : 'text-fg font-bold'
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
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {!dataService.canManageStudent(std) ? (
                          <span className="text-xs font-semibold text-fg-2">{std.className || 'Yok'}</span>
                        ) : (
                        <select
                          value={std.classId || 'unassigned'}
                          onChange={(e) => handleQuickChangeStudentClass(std, e.target.value)}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all shadow-2xs ${
                            isStudentUnassigned(std)
                              ? 'bg-surface-2 text-fg-2 border-line-strong hover:border-line-strong'
                              : isDuplicate && dupInfo
                              ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder}`
                              : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-900 dark:text-indigo-200 border-indigo-200 dark:border-indigo-500/30 hover:border-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/15'
                          }`}
                          title="Öğrencinin sınıfını anında değiştirmek için seçiniz"
                        >
                          <option value="unassigned">Yok</option>
                          {classes.filter((cls) => cls.id === std.classId || dataService.canManageClass(cls)).map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              {formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)}
                            </option>
                          ))}
                        </select>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`font-mono font-semibold text-xs px-2.5 py-1 rounded-md border ${
                            isDuplicate && dupInfo
                              ? `${dupInfo.colorTheme.badgeBg} ${dupInfo.colorTheme.badgeText} ${dupInfo.colorTheme.badgeBorder} ring-1 font-bold`
                              : 'text-fg-2 bg-surface-2 border-line'
                          }`}
                        >
                          #{std.studentNumber}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          {std.auth_user_id ? (
                            <span
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
                              title="Öğrenci, öğrenci numarası ve şifresiyle giriş yapabilir"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Açık</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30"
                              title="Bu öğrencinin giriş hesabı yok. Şifre belirleyerek hesap açabilirsiniz."
                            >
                              <Lock className="w-3 h-3" />
                              <span>Hesap yok</span>
                            </span>
                          )}
                          {dataService.canManageStudent(std) && (
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordTarget(std);
                              setPasswordTargetValue(dataService.generatePassword());
                              setPasswordTargetError(null);
                            }}
                            className="p-1 text-muted hover:text-indigo-700 dark:hover:text-indigo-300 rounded hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer"
                            title={std.auth_user_id ? 'Yeni şifre belirle' : 'Şifre belirleyip giriş hesabı aç'}
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          )}
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
                        ) : std.isSuspended || std.status === 'suspended' ? (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            <span>Askıda</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Aktif Öğrenci</span>
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {dataService.canManageStudent(std) && (
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            type="button"
                            onClick={() => openEditStudent(std)}
                            className="p-2 bg-surface-2 hover:bg-surface-2 text-muted hover:text-fg border border-line rounded-lg transition-colors cursor-pointer shadow-xs"
                            title="Düzenle"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStudentToDelete(std)}
                            className="p-2 bg-surface-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-muted hover:text-rose-600 dark:hover:text-rose-300 border border-line rounded-lg transition-colors cursor-pointer shadow-xs"
                            title="Öğrenciyi Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          )}
          <ShowMoreBar
            id="students-show-more"
            remaining={pagedStudents.remaining}
            total={pagedStudents.total}
            shown={pagedStudents.visible.length}
            onMore={pagedStudents.showMore}
            onAll={pagedStudents.showAll}
          />
        </div>
      </div>
      ) : (
        /* CLASSES VIEW */
        <div className="space-y-4">
          {!isAdmin && (
            <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-500/30 text-indigo-600 dark:text-indigo-200 text-xs flex items-center gap-3 shadow-xs">
              <div className="p-2 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 rounded-xl shrink-0">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <strong className="font-bold text-fg">Yönetici İzinli Sınıf Görünümü:</strong> Yalnızca Kurum Yöneticisinin erişim yetkisi verdiği sınıflar ({classes.length}) görüntülenmektedir. Sınıf ekleme, düzenleme ve silme yetkileri yalnızca yöneticiye aittir.
              </div>
            </div>
          )}
          <div className="space-y-2" id="class-strips">
            {classes.map((cls) => {
              const classStudents = students.filter((s) => s.classId === cls.id);
              const isOpen = expandedClassId === cls.id;
              const branchText = `Şube ${cls.branch?.replace(/şube\s*/i, '').trim() || 'A'}`;
              return (
                <ExpandableStrip
                  key={cls.id}
                  id={`class-strip-${cls.id}`}
                  noun="Sınıf"
                  open={isOpen}
                  onToggle={() => setExpandedClassId(isOpen ? null : cls.id)}
                  badges={
                    <>
                      {cls.schoolLevel && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">{cls.schoolLevel}</span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">{branchText}</span>
                      {cls.kurumId && dataService.isHeadAdmin() && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-info-soft text-info-fg" data-kurum-badge>
                          {dataService.getKurumNameForId(cls.kurumId)}
                        </span>
                      )}
                      {!cls.kurumId && dataService.isKurumAdmin() && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-2 text-muted" data-granted-badge>
                          Genel yöneticinin izin verdiği sınıf
                        </span>
                      )}
                    </>
                  }
                  title={formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)}
                  meta={[cls.academicYear, cls.description].filter(Boolean).join(' · ') || undefined}
                  stats={
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>
                        <strong className="text-fg">{classStudents.length}</strong> Kayıtlı Öğrenci
                      </span>
                    </div>
                  }
                  actions={
                    <>
                      <StripAction
                        label={`Öğrenciler (${classStudents.length})`}
                        onClick={() => {
                          setViewingClassStudents(cls);
                          setClassStudentSearch('');
                        }}
                      >
                        <Users className="w-4 h-4" />
                      </StripAction>
                      {canAddClasses && dataService.canManageClass(cls) && (
                        <>
                          <StripAction label="Düzenle" onClick={() => openEditClass(cls)}>
                            <Edit2 className="w-4 h-4" />
                          </StripAction>
                          <StripAction label="Sınıfı Sil" tone="danger" onClick={() => setClassToDelete(cls)}>
                            <Trash2 className="w-4 h-4" />
                          </StripAction>
                        </>
                      )}
                    </>
                  }
                >
                  <div className="space-y-3" data-class-detail>
                    <p className="text-xs text-muted">{cls.description || 'Akademik takip ve ders çizelgesi grubu.'}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setViewingClassStudents(cls);
                          setClassStudentSearch('');
                        }}
                        className="ui-btn ui-btn-primary ui-btn-sm"
                        title={`${cls.name} sınıfına kayıtlı öğrencilerin listesini görüntüle`}
                      >
                        <Users className="w-3.5 h-3.5" /> Öğrenci Listesi ({classStudents.length})
                      </button>
                      {dataService.canManageClass(cls) && (
                        <button
                          type="button"
                          onClick={() => {
                            setTransferTargetClass(cls);
                            setTransferSelectedStudentIds([]);
                            setTransferSearchTerm('');
                          }}
                          className="ui-btn ui-btn-secondary ui-btn-sm"
                          title="Sistemdeki öğrencileri tek tek veya toplu bu sınıfa aktar"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" /> Öğrenci Aktar
                        </button>
                      )}
                      {dataService.canManageClass(cls) && (
                        <button
                          type="button"
                          onClick={() => {
                            resetStudentForm();
                            setEditingStudent(null);
                            setStudentClassId(cls.id);
                            setIsAddStudentOpen(true);
                          }}
                          className="ui-btn ui-btn-secondary ui-btn-sm"
                          title="Bu sınıfa sıfırdan yeni öğrenci kaydet"
                        >
                          <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Yeni Öğrenci
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClassFilter(cls.id);
                          setActiveTab('students');
                        }}
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        title="Öğrenci tablosunda bu sınıfı filtrele"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted" /> Tabloda Gör
                      </button>
                    </div>
                    {classStudents.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {classStudents.slice(0, 60).map((st) => (
                          <span key={st.id} className="text-[11px] px-2 py-0.5 rounded-md bg-surface-2 border border-line text-fg-2">
                            {st.studentNumber ? `${st.studentNumber} · ` : ''}
                            {st.name}
                          </span>
                        ))}
                        {classStudents.length > 60 && <span className="text-[11px] text-muted">+{classStudents.length - 60} öğrenci</span>}
                      </div>
                    )}
                  </div>
                </ExpandableStrip>
              );
            })}
          </div>
        </div>
      )}

      {/* ADD/EDIT STUDENT MODAL */}
      <Modal
        open={isAddStudentOpen}
        onClose={() => setIsAddStudentOpen(false)}
        closeOnBackdrop={false}
        icon={UserPlus}
        tone="brand"
        title={editingStudent ? 'Öğrenci Bilgilerini Düzenle' : 'Yeni Öğrenci Ekle'}
        footer={
          <>
            <button type="button" onClick={() => setIsAddStudentOpen(false)} className="ui-btn ui-btn-secondary">
              İptal
            </button>
            <button type="submit" form="student-form" disabled={isSavingStudent} className="ui-btn ui-btn-primary">
              {isSavingStudent ? 'Kaydediliyor...' : editingStudent ? 'Değişiklikleri Kaydet' : 'Öğrenciyi Ekle ve Hesap Aç'}
            </button>
          </>
        }
      >
        {studentFormError && (
          <div role="alert" className="mb-4 p-3 bg-danger-soft rounded-xl flex items-center gap-2 text-xs font-semibold text-danger-fg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{studentFormError}</span>
          </div>
        )}

        <form id="student-form" onSubmit={handleSaveStudent} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="student-form-name" className="block text-xs font-bold text-fg-2 mb-1">Ad Soyad *</label>
              <input
                id="student-form-name"
                type="text"
                required
                placeholder="Örn: Ahmet Yılmaz"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="student-form-number" className="block text-xs font-bold text-fg-2 mb-1">
                Öğrenci No * <span className="font-medium text-muted">(giriş adı)</span>
              </label>
              <input
                id="student-form-number"
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                placeholder="Örn: 1042"
                className={inputCls}
              />
            </div>
          </div>

          {/* Sınıf Seçimi (yalnızca sistemde kayıtlı / yetkili sınıflar) */}
          <div className="p-4 bg-surface-2 rounded-xl border border-line space-y-2">
            <label htmlFor="student-form-class" className="text-xs font-bold text-fg-2 flex items-center gap-1.5">
              <School className="w-4 h-4 text-brand-fg" />
              <span>Sınıf *</span>
            </label>
            <select
              id="student-form-class"
              required
              value={studentClassId}
              onChange={(e) => setStudentClassId(e.target.value)}
              className={cx(inputCls, 'font-semibold cursor-pointer')}
            >
              <option value="">Sınıf seçiniz *</option>
              {manageableClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted">
              {canAddClasses
                ? 'Listede olmayan bir sınıf için önce "Sınıflar" sekmesinden yeni sınıf ekleyiniz.'
                : 'Yalnızca yetkili olduğunuz sınıflar listelenir. Yeni sınıfı yönetici açar.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="student-form-email" className="block text-xs font-bold text-fg-2 mb-1">E-Posta</label>
              <input
                id="student-form-email"
                type="email"
                value={studentEmail}
                onChange={(e) => {
                  setStudentEmail(e.target.value);
                  if (studentEmailError) setStudentEmailError(null);
                }}
                onBlur={() => setStudentEmailError(emailIssue(studentEmail))}
                placeholder="ogrenci@okul.com"
                aria-invalid={!!studentEmailError}
                aria-describedby={studentEmailError ? 'student-form-email-error' : undefined}
                className={cx(inputCls, studentEmailError && 'border-danger focus:border-danger')}
              />
              {studentEmailError && (
                <p id="student-form-email-error" className="mt-1 text-[11px] font-semibold text-danger-fg">
                  {studentEmailError}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="student-form-phone" className="block text-xs font-bold text-fg-2 mb-1">Telefon</label>
              <input
                id="student-form-phone"
                type="tel"
                inputMode="tel"
                value={studentPhone}
                onChange={(e) => {
                  setStudentPhone(e.target.value);
                  if (studentPhoneError) setStudentPhoneError(null);
                }}
                onBlur={() => {
                  const n = normalizeTurkishPhone(studentPhone);
                  if (n.valid) setStudentPhone(n.value);
                  setStudentPhoneError(n.valid ? null : PHONE_ERROR);
                }}
                placeholder="0555 123 4567"
                aria-invalid={!!studentPhoneError}
                aria-describedby={studentPhoneError ? 'student-form-phone-error' : undefined}
                className={cx(inputCls, studentPhoneError && 'border-danger focus:border-danger')}
              />
              {studentPhoneError && (
                <p id="student-form-phone-error" className="mt-1 text-[11px] font-semibold text-danger-fg">
                  {studentPhoneError}
                </p>
              )}
            </div>
          </div>

          {/* Giriş şifresi: gerçek giriş hesabı bu şifreyle açılır / güncellenir */}
          <div className="p-4 bg-brand-soft rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="student-form-password" className="text-xs font-bold text-fg flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-brand-fg" />
                <span>{editingStudent ? 'Yeni Giriş Şifresi (isteğe bağlı)' : 'Giriş Şifresi *'}</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setStudentPassword(dataService.generatePassword());
                  setShowStudentPassword(true);
                }}
                className="text-[11px] text-brand-fg font-bold underline cursor-pointer"
              >
                🎲 Rastgele Şifre Oluştur
              </button>
            </div>
            <div className="relative">
              <input
                id="student-form-password"
                type={showStudentPassword ? 'text' : 'password'}
                required={!editingStudent}
                minLength={6}
                autoComplete="new-password"
                value={studentPassword}
                onChange={(e) => setStudentPassword(e.target.value)}
                placeholder={editingStudent ? 'Değiştirmeyecekseniz boş bırakınız' : 'En az 6 karakter'}
                className={cx(inputCls, 'pr-10 font-mono font-bold tracking-wider')}
              />
              <button
                type="button"
                onClick={() => setShowStudentPassword(!showStudentPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-subtle hover:text-muted cursor-pointer"
                title={showStudentPassword ? 'Gizle' : 'Göster'}
                aria-label={showStudentPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {showStudentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              Öğrenci, giriş ekranında <strong>Öğrenci Portalı</strong> sekmesinden <strong>öğrenci numarası</strong> ve bu
              şifreyle giriş yapar; ilk girişte şifresini değiştirmesi istenir. Kaydettikten sonra giriş bilgilerini
              WhatsApp/e-posta ile iletebileceğiniz bir pencere açılır. Şifreler sistemde saklanmaz.
            </p>
          </div>

          {/* Öğrenci Fotoğrafı / Bilgisayardan Resim Seç */}
          <div className="p-3.5 bg-surface-2 rounded-xl border border-line space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-fg-2 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-brand-fg" />
                <span>Öğrenci Profil Fotoğrafı</span>
              </span>
              <span className="text-[10px] text-muted font-medium">İsteğe Bağlı</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-surface border border-line overflow-hidden shrink-0 flex items-center justify-center">
                {studentAvatar ? (
                  <img loading="lazy" decoding="async" src={studentAvatar} alt="Öğrenci" className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-6 h-6 text-subtle" />
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => studentFileInputRef.current?.click()}
                    disabled={isProcessingStudentPhoto}
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isProcessingStudentPhoto ? 'İşleniyor...' : 'Bilgisayardan Resim Seç'}</span>
                  </button>

                  {studentAvatar && (
                    <button
                      type="button"
                      onClick={() => setStudentAvatar('')}
                      className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon hover:text-danger-fg"
                      title="Fotoğrafı Kaldır"
                      aria-label="Fotoğrafı Kaldır"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted mt-1">PNG, JPG veya WebP • Otomatik optimize edilir</p>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* ADD/EDIT CLASS MODAL */}
      <Modal
        open={isAddClassOpen}
        onClose={() => {
          if (!isSavingClass) setIsAddClassOpen(false);
        }}
        closeOnBackdrop={false}
        icon={School}
        tone="brand"
        title={editingClass ? 'Sınıfı Düzenle' : 'Sınıf Ekle'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAddClassOpen(false)}
              disabled={isSavingClass}
              className="ui-btn ui-btn-secondary"
            >
              İptal
            </button>
            <button type="submit" form="class-form" disabled={isSavingClass} className="ui-btn ui-btn-primary">
              {isSavingClass ? (
                <span>Kaydediliyor...</span>
              ) : classExcelValidRows.length > 0 ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {editingClass
                      ? `Kaydet ve ${classExcelValidRows.length} Öğrenciyi Ekle`
                      : `Sınıfı & ${classExcelValidRows.length} Öğrenciyi Oluştur`}
                  </span>
                </>
              ) : (
                <span>{editingClass ? 'Kaydet' : 'Sınıfı Oluştur'}</span>
              )}
            </button>
          </>
        }
      >
        {classFormError && (
          <div role="alert" className="mb-4 p-3 bg-danger-soft rounded-xl flex items-start gap-2 text-xs font-semibold text-danger-fg">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{classFormError}</span>
          </div>
        )}

        <form id="class-form" onSubmit={handleSaveClass} className="space-y-4">
          {/* Okul, Sınıf ve Şube Seçimleri - MECBURİ */}
          <div className="p-4 bg-surface-2 rounded-xl border border-line space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                <School className="w-4 h-4 text-brand-fg" />
                <span>Kademe & Şube Belirleme (Mecburi)</span>
              </span>
              <span className="ui-chip ui-chip-warning">* Zorunlu</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="class-form-school" className="block text-[11px] font-bold text-fg-2 mb-1">
                  Okul *
                </label>
                <select
                  id="class-form-school"
                  required
                  value={classSchoolLevel}
                  onChange={(e) => {
                    const newSchool = e.target.value as 'Ortaokul' | 'Lise' | '';
                    setClassSchoolLevel(newSchool);
                    const firstGrade = newSchool === 'Lise' ? '9. Sınıf' : '5. Sınıf';
                    setClassGradeLevel(firstGrade);
                    setClassName(`${firstGrade} - ${classBranch}`);
                  }}
                  className={cx(inputCls, 'text-xs font-semibold cursor-pointer')}
                >
                  <option value="">Okul Seçiniz *</option>
                  <option value="Ortaokul">🏫 Ortaokul</option>
                  <option value="Lise">🎓 Lise</option>
                </select>
              </div>

              <div>
                <label htmlFor="class-form-grade" className="block text-[11px] font-bold text-fg-2 mb-1">
                  Sınıf *
                </label>
                <select
                  id="class-form-grade"
                  required
                  value={classGradeLevel}
                  onChange={(e) => {
                    const newGrade = e.target.value;
                    setClassGradeLevel(newGrade);
                    setClassName(formatClassDisplayName('', classBranch, newGrade));
                  }}
                  className={cx(inputCls, 'text-xs font-semibold cursor-pointer')}
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

              <div>
                <label htmlFor="class-form-branch" className="block text-[11px] font-bold text-fg-2 mb-1">
                  Şube *
                </label>
                <select
                  id="class-form-branch"
                  required
                  value={classBranch}
                  onChange={(e) => {
                    const newBranch = e.target.value;
                    setClassBranch(newBranch);
                    setClassName(formatClassDisplayName('', newBranch, classGradeLevel));
                  }}
                  className={cx(inputCls, 'text-xs font-semibold cursor-pointer')}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="class-form-name" className="block text-xs font-bold text-fg-2 mb-1">Sınıf Adı *</label>
              <input
                id="class-form-name"
                type="text"
                required
                placeholder="Örn: 8/A, 8/B, 6/C, 11/B"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="class-form-year" className="block text-xs font-bold text-fg-2 mb-1">Eğitim Yılı</label>
              <input
                id="class-form-year"
                type="text"
                value={classAcademicYear}
                onChange={(e) => setClassAcademicYear(e.target.value)}
                placeholder={currentAcademicYear()}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label htmlFor="class-form-description" className="flex items-center justify-between text-xs font-bold text-fg-2 mb-1">
              <span>Açıklama</span>
              <span className="text-[10px] font-normal text-subtle">isteğe bağlı</span>
            </label>
            <textarea
              id="class-form-description"
              rows={2}
              maxLength={300}
              value={classDescription}
              onChange={(e) => setClassDescription(e.target.value)}
              placeholder="Örn: LGS hazırlık sınıfı"
              className={cx(inputCls, 'resize-y')}
            />
          </div>

          {/* Toplu Öğrenci Yükleme Bölümü */}
          <div className="p-4 bg-surface-2 rounded-xl border border-line space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-success-fg" />
                <span>Toplu Öğrenci Yükle</span>
              </span>
              <button
                type="button"
                onClick={downloadSampleClassExcel}
                className="text-[11px] text-brand-fg hover:underline flex items-center gap-1 font-bold cursor-pointer"
                title="Excel şablonunu bilgisayarınıza indirin"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Örnek Şablon İndir</span>
              </button>
            </div>

            {classExcelError && (
              <div role="alert" className="p-2.5 bg-danger-soft rounded-xl flex items-center gap-2 text-xs font-semibold text-danger-fg">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{classExcelError}</span>
              </div>
            )}

            {classExcelStudents.length === 0 ? (
              <div>
                <label
                  htmlFor="class-excel-upload"
                  className="border-2 border-dashed border-line-strong hover:border-success bg-surface rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all group"
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
                  <div className="w-9 h-9 rounded-xl bg-success-soft text-success-fg flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Upload className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-fg-2 group-hover:text-success-fg">
                    {isReadingClassExcel ? 'Excel Okunuyor...' : 'Excel Dosyası Seç (.xlsx, .xls, .csv)'}
                  </span>
                  <span className="text-[11px] text-muted mt-0.5">Sütunlar: Ad Soyad (veya Ad + Soyad), Öğrenci No, E-posta, Telefon</span>
                </label>
              </div>
            ) : (
              <div className="space-y-2 bg-surface p-3 rounded-xl border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ui-chip ui-chip-success">{classExcelValidRows.length} Öğrenci Hazır</span>
                    {classExcelInvalidCount > 0 && (
                      <span className="ui-chip ui-chip-danger">{classExcelInvalidCount} Hatalı Satır</span>
                    )}
                    <span className="text-[11px] text-muted truncate max-w-[160px]">({classExcelFileName})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowExcelStudentList(!showExcelStudentList)}
                      className="text-[11px] text-brand-fg font-bold cursor-pointer"
                    >
                      {showExcelStudentList ? 'Gizle' : 'Öğrencileri Gör'}
                    </button>
                    <button
                      type="button"
                      onClick={resetClassExcelState}
                      className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon hover:text-danger-fg"
                      title="Listeyi Temizle"
                      aria-label="Listeyi Temizle"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {classExcelInvalidCount > 0 && (
                  <p className="text-[11px] text-warning-fg">
                    Hatalı satırlar aktarılmaz. Satırı kaldırabilir veya Excel'i düzeltip yeniden yükleyebilirsiniz.
                  </p>
                )}

                {showExcelStudentList && (
                  <ul className="max-h-48 overflow-y-auto border border-line rounded-lg bg-surface-2 p-1.5 space-y-1">
                    {classExcelStudents.map((st, i) => (
                      <li
                        key={`${st.rowNumber}-${i}`}
                        className={cx('flex items-start justify-between gap-2 text-[11px] py-1 px-2 rounded', st.error ? 'bg-danger-soft' : 'text-fg-2')}
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-fg">
                            <span className="text-muted font-mono mr-1">{st.rowNumber}.</span>
                            {st.fullName || <em className="text-muted">(isim yok)</em>}
                          </span>
                          {st.error && <span className="block text-danger-fg font-semibold">{st.error}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-muted font-mono">No: {st.studentNumber || '-'}</span>
                          <button
                            type="button"
                            onClick={() => setClassExcelStudents((prev) => validateClassExcelRows(prev.filter((_, idx) => idx !== i)))}
                            className="p-0.5 text-subtle hover:text-danger-fg rounded cursor-pointer"
                            title="Satırı kaldır"
                            aria-label={`${st.rowNumber}. satırı kaldır`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* EXCEL BULK UPLOAD MODAL - STUDENTS */}
      <ExcelStudentUploadModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        classes={classes}
        existingStudents={students}
        onAccountsCreated={(result) =>
          setCredentialsResult({ credentials: result.created, failures: result.failed, title: "Excel'den Eklenen Öğrenciler" })
        }
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
        onConfirm={async () => {
          if (studentToDelete) {
            const target = studentToDelete;
            setStudentToDelete(null);
            try {
              await dataService.deleteStudent(target.id);
              setStudentSuccessFeedback(`"${target.name}" ve giriş hesabı sistemden silindi.`);
            } catch (err: any) {
              setStudentSuccessFeedback(`⚠️ "${target.name}" silinemedi: ${err?.message || 'bilinmeyen hata'}`);
            }
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
        onConfirm={async () => {
          if (classToDelete) {
            const target = classToDelete;
            setClassToDelete(null);
            await dataService.deleteClass(target.id);
            setStudentSuccessFeedback(`"${target.name}" sınıfı sistemden başarıyla silindi.`);
          }
        }}
        title="Sınıfı Sil"
        itemBadge={classToDelete?.branch}
        description={`"${classToDelete?.name}" sınıfını silmek istediğinize emin misiniz? Bu sınıfa kayıtlı öğrencilerin sınıf atamaları sıfırlanacaktır.`}
        confirmButtonText="Sınıfı Sil"
      />

      {/* GİRİŞ BİLGİLERİ (hesap açıldıktan / şifre belirlendikten sonra, yalnızca bir kez gösterilir) */}
      <StudentWelcomeCredentialsModal
        isOpen={!!credentialsResult}
        onClose={() => setCredentialsResult(null)}
        credentials={credentialsResult?.credentials || []}
        failures={credentialsResult?.failures || []}
        title={credentialsResult?.title}
      />

      {/* ŞİFRE BELİRLEME PENCERESİ */}
      <Modal
        open={!!passwordTarget}
        onClose={() => setPasswordTarget(null)}
        closeOnBackdrop={false}
        size="sm"
        icon={Key}
        tone="brand"
        title={passwordTarget?.auth_user_id ? 'Yeni Şifre Belirle' : 'Giriş Hesabı Aç'}
        description={passwordTarget ? `${passwordTarget.name} • No: ${passwordTarget.studentNumber || '-'}` : undefined}
        footer={
          <>
            <button type="button" onClick={() => setPasswordTarget(null)} className="ui-btn ui-btn-secondary">
              Vazgeç
            </button>
            <button type="button" onClick={handleConfirmSetPassword} disabled={isSettingPassword} className="ui-btn ui-btn-primary">
              {isSettingPassword ? 'Kaydediliyor...' : passwordTarget?.auth_user_id ? 'Şifreyi Kaydet' : 'Hesabı Aç'}
            </button>
          </>
        }
      >
        {passwordTarget && (
          <div className="space-y-4">
            <p className="text-xs text-muted leading-relaxed">
              {passwordTarget.auth_user_id
                ? 'Öğrencinin eski şifresi geçersiz olur. Öğrenci yeni şifreyle giriş yapınca şifresini değiştirmesi istenir.'
                : 'Bu öğrencinin henüz giriş hesabı yok. Belirlediğiniz şifreyle hesap açılır; öğrenci, öğrenci numarası ve bu şifreyle giriş yapar.'}
            </p>
            {passwordTargetError && (
              <div role="alert" className="p-3 bg-danger-soft rounded-xl text-xs font-semibold text-danger-fg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordTargetError}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={passwordTargetValue}
                onChange={(e) => setPasswordTargetValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmSetPassword();
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="Yeni şifre"
                className={cx(inputCls, 'flex-1 font-mono font-bold tracking-wider')}
                placeholder="En az 6 karakter"
              />
              <button
                type="button"
                onClick={() => setPasswordTargetValue(dataService.generatePassword())}
                className="ui-btn ui-btn-secondary"
              >
                🎲 Üret
              </button>
            </div>
          </div>
        )}
      </Modal>

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
          navigator.clipboard
            .writeText(text)
            .then(() => dataService.showToast('Sınıf öğrenci listesi panoya kopyalandı.'))
            .catch(() => dataService.showToast('Liste kopyalanamadı. Tarayıcı izin vermedi.', 'error'));
        };

        return (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
            onClick={() => setViewingClassStudents(null)}
          >
            <div
              className="relative w-full max-w-3xl bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-line bg-surface/90 flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <School className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base sm:text-lg font-bold text-fg">
                        {formatClassDisplayName(viewingClassStudents.name, viewingClassStudents.branch, viewingClassStudents.gradeLevel)} — Kayıtlı Öğrenci Listesi
                      </h3>
                      {viewingClassStudents.schoolLevel && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          {viewingClassStudents.schoolLevel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {viewingClassStudents.branch} • {viewingClassStudents.academicYear} • Toplam{' '}
                      <strong className="text-indigo-600 dark:text-indigo-300 font-bold">{classStudents.length}</strong> Öğrenci Kayıtlı
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingClassStudents(null)}
                  className="p-1.5 text-muted hover:text-fg hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Toolbar: Search & Action buttons */}
              <div className="p-4 border-b border-line bg-canvas/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={classStudentSearch}
                    onChange={(e) => setClassStudentSearch(e.target.value)}
                    placeholder="Sınıf içinde isim, no veya veli tel ara..."
                    className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {dataService.canManageClass(viewingClassStudents) && (
                  <button
                    type="button"
                    onClick={() => {
                      resetStudentForm();
                      setEditingStudent(null);
                      setStudentClassId(viewingClassStudents.id);
                      setIsAddStudentOpen(true);
                    }}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-md shadow-indigo-600/20"
                    title="Bu sınıfa sıfırdan yeni öğrenci kaydet"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Yeni Öğrenci</span>
                  </button>
                  )}

                  {dataService.canManageClass(viewingClassStudents) && (
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
                  )}

                  <button
                    type="button"
                    onClick={handleCopyList}
                    disabled={classStudents.length === 0}
                    className="px-3 py-2 bg-surface-2 hover:bg-surface-3 disabled:opacity-40 text-fg hover:text-fg rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer border border-line"
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
                    className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer border border-line"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Tabloda Aç</span>
                  </button>
                </div>
              </div>

              {/* Student Table / Cards */}
              <div className="flex-1 overflow-y-auto p-4 max-h-[55vh]">
                {classStudents.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-surface-2 text-muted flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-fg mb-1">Bu Sınıfa Kayıtlı Öğrenci Yok</h4>
                    <p className="text-xs text-muted max-w-sm mx-auto mb-4">
                      "{viewingClassStudents.name}" sınıfına henüz hiçbir öğrenci kaydedilmemiş. Hemen yeni bir öğrenci ekleyebilir veya sistemdeki öğrencileri bu sınıfa aktarabilirsiniz.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      {dataService.canManageClass(viewingClassStudents) && (
                      <button
                        type="button"
                        onClick={() => {
                          resetStudentForm();
                          setEditingStudent(null);
                          setStudentClassId(viewingClassStudents.id);
                          setIsAddStudentOpen(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer flex items-center space-x-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Yeni Öğrenci Ekle</span>
                      </button>
                      )}

                      {dataService.canManageClass(viewingClassStudents) && (
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
                      )}
                    </div>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="py-8 text-center text-muted text-xs">
                    "{classStudentSearch}" aramasına uygun öğrenci bulunamadı.
                  </div>
                ) : (
                  <div className="border border-line rounded-xl overflow-hidden bg-surface shadow-sm">
                    <table className="w-full text-left text-xs text-fg-2">
                      <thead className="bg-surface-2 text-muted text-[11px] font-bold border-b border-line uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">Öğrenci Adı Soyadı</th>
                          <th className="py-2.5 px-3">Okul No</th>
                          <th className="py-2.5 px-3">Veli / İletişim</th>
                          <th className="py-2.5 px-3">E-posta</th>
                          <th className="py-2.5 px-3 text-right">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line bg-surface">
                        {filteredStudents.map((std, idx) => {
                          const isDuplicate = duplicateStudentGroups.duplicateIds.has(std.id);
                          return (
                          <tr
                            key={std.id}
                            className={
                              isDuplicate
                                ? 'bg-amber-50/90 dark:bg-amber-500/10 hover:bg-amber-100/90 dark:hover:bg-amber-500/15 transition-colors border-l-4 border-l-amber-500'
                                : 'hover:bg-surface-2/80 transition-colors'
                            }
                          >
                            <td className="py-2.5 px-3 text-center text-subtle font-mono font-semibold">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center space-x-2.5">
                                <img loading="lazy" decoding="async"
                                  src={std.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.name)}`}
                                  alt={std.name}
                                  className={`w-7 h-7 rounded-full object-cover border ${
                                    isDuplicate
                                      ? 'bg-amber-100 dark:bg-amber-500/15 ring-2 ring-amber-400'
                                      : 'bg-surface-2 border-line'
                                  }`}
                                  referrerPolicy="no-referrer"
                                />
                                <div className="flex items-center space-x-2 flex-wrap">
                                  <span className={`font-bold ${isDuplicate ? 'text-amber-950 dark:text-amber-200 font-extrabold' : 'text-fg'}`}>
                                    {std.name}
                                  </span>
                                  {isDuplicate && (
                                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-500/30">
                                      <AlertTriangle className="w-2.5 h-2.5 text-amber-700 dark:text-amber-300" />
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
                                    ? 'bg-amber-200 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200 border-amber-400 font-bold'
                                    : 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-150 dark:border-indigo-500/30'
                                }`}
                              >
                                #{std.studentNumber || '-'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-muted font-medium">
                              {std.phone ? (
                                <span className="font-mono text-muted">{std.phone}</span>
                              ) : (
                                <span className="text-subtle italic">Belirtilmedi</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-muted">
                              {std.email || <span className="text-subtle italic">E-posta yok</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {dataService.canManageStudent(std) && (
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setViewingClassStudents(null);
                                    openEditStudent(std);
                                  }}
                                  className="p-1.5 text-muted hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                                  title="Öğrenciyi Düzenle"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (confirm(`"${std.name}" adlı öğrenciyi "${viewingClassStudents.name}" sınıfından çıkarmak istediğinize emin misiniz?`)) {
                                      try {
                                        await dataService.removeStudentFromClass(std.id);
                                        setStudentSuccessFeedback(`"${std.name}" adlı öğrenci ${viewingClassStudents.name} sınıfından çıkarıldı.`);
                                      } catch (e: any) {
                                        console.error(e);
                                      }
                                    }
                                  }}
                                  className="p-1.5 text-subtle hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                  title="Öğrenciyi Bu Sınıftan Çıkar"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              )}
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
              <div className="p-3 sm:p-4 border-t border-line bg-canvas/60 flex items-center justify-between">
                <span className="text-xs text-muted">
                  Gösterilen: <strong className="text-fg">{filteredStudents.length}</strong> / {classStudents.length} Öğrenci
                </span>
                <button
                  type="button"
                  onClick={() => setViewingClassStudents(null)}
                  className="px-4 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg text-xs font-semibold transition-colors"
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

        const handleTransferSingle = async (student: Student) => {
          try {
            const count = await dataService.assignStudentsToClass([student.id], transferTargetClass.id);
            if (count > 0) {
              setStudentSuccessFeedback(
                `"${student.name}" başarıyla "${transferTargetClass.name}" sınıfına aktarıldı!`
              );
              confetti({ particleCount: 40, spread: 50, origin: { y: 0.6 } });
            }
          } catch (e: any) {
            console.error(e);
          }
        };

        const handleTransferBulk = async () => {
          if (transferSelectedStudentIds.length === 0) return;
          try {
            const count = await dataService.assignStudentsToClass(
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
          } catch (e: any) {
            console.error(e);
          }
        };

        return (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
            onClick={() => setTransferTargetClass(null)}
          >
            <div
              className="relative w-full max-w-2xl bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-line bg-surface/90 flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-fg flex items-center space-x-2">
                      <span>Öğrenci Aktarımı</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                        {transferTargetClass.name}
                      </span>
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      Sistemdeki öğrencileri tek tek veya çoklu seçimle toplu olarak bu sınıfa aktarabilirsiniz.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTransferTargetClass(null)}
                  className="p-1.5 text-muted hover:text-fg hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filter & Search Bar */}
              <div className="p-4 border-b border-line bg-canvas/40 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={transferSearchTerm}
                      onChange={(e) => setTransferSearchTerm(e.target.value)}
                      placeholder="Öğrenci adı, okul no veya mevcut sınıf ara..."
                      className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center space-x-1 bg-surface p-1 rounded-xl border border-line shrink-0">
                    <button
                      type="button"
                      onClick={() => setTransferOnlyUnassigned(false)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        !transferOnlyUnassigned
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-muted hover:text-fg'
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
                          : 'text-muted hover:text-fg'
                      }`}
                    >
                      Sadece Sınıfsızlar
                    </button>
                  </div>
                </div>

                {/* Bulk Select Toolbar */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <label className="flex items-center space-x-2 text-fg-2 font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      disabled={filteredTransferStudents.length === 0}
                      className="w-4 h-4 rounded text-indigo-600 dark:text-indigo-300 focus:ring-indigo-500 bg-surface-2 border-line cursor-pointer"
                    />
                    <span>
                      Tümünü Seç ({filteredTransferStudents.length})
                      {transferSelectedStudentIds.length > 0 && (
                        <strong className="text-indigo-600 dark:text-indigo-400 ml-1.5">
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
                  <div className="py-12 text-center text-muted text-xs">
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
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/50'
                            : 'bg-surface/60 border-line hover:bg-surface-2/50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectStudent(std.id)}
                            className="w-4 h-4 rounded text-indigo-600 dark:text-indigo-300 focus:ring-indigo-500 bg-surface-2 border-line cursor-pointer"
                          />
                          <img loading="lazy" decoding="async"
                            src={
                              std.avatar ||
                              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                std.name
                              )}`
                            }
                            alt={std.name}
                            className="w-9 h-9 rounded-full bg-surface-2 object-cover border border-line"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="font-bold text-fg text-xs flex items-center space-x-2">
                              <span>{std.name}</span>
                              <span className="font-mono text-muted text-[10px]">
                                #{std.studentNumber}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted flex items-center space-x-2 mt-0.5">
                              <span>Mevcut Sınıf:</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  !std.className || std.className === 'Atanmadı'
                                    ? 'bg-surface-2 text-muted'
                                    : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20'
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
              <div className="p-3 sm:p-4 border-t border-line bg-canvas/60 flex items-center justify-between">
                <span className="text-xs text-muted">
                  Toplam {filteredTransferStudents.length} aktarılabilir öğrenci listeleniyor
                </span>
                <button
                  type="button"
                  onClick={() => setTransferTargetClass(null)}
                  className="px-4 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DUPLICATE STUDENT WARNING MODAL (ÇAKIŞAN ÖĞRENCİ UYARI VE SEÇİM PENCERESİ) */}
      <Modal
        open={!!duplicateWarning}
        onClose={() => setDuplicateWarning(null)}
        closeOnBackdrop={false}
        icon={AlertCircle}
        tone="warning"
        title="Bu Numarayla Kayıtlı Öğrenci Var!"
        description="Sistemde bu öğrenciyle tamamen eşleşen kayıtlı bir profil tespit edildi."
        footer={
          <>
            <button type="button" onClick={() => setDuplicateWarning(null)} className="ui-btn ui-btn-secondary">
              Vazgeç ve Düzenlemeye Dön
            </button>
            <button type="button" onClick={handleDuplicateReplace} className="ui-btn ui-btn-warning">
              <CheckCircle2 className="w-4 h-4" />
              <span>Kayıtlı Öğrenciyi Güncelle</span>
            </button>
          </>
        }
      >
        {duplicateWarning && (
          <div className="space-y-4">
            <div className="bg-surface-2 rounded-xl p-3.5 border border-line space-y-3 text-xs">
              <div className="text-warning-fg font-bold uppercase tracking-wider text-[10px]">📋 Çakışan Kayıt Bilgileri</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-fg-2">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted block">Öğrenci Adı Soyadı</span>
                  <span className="font-bold text-fg text-sm">{duplicateWarning.existingStudent.name}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted block">Okul Numarası</span>
                  <span className="font-mono font-bold text-warning-fg">#{duplicateWarning.existingStudent.studentNumber || '-'}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted block">Sınıf & Şube</span>
                  <span className="font-semibold text-fg">{duplicateWarning.existingStudent.className || '-'}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted block">İletişim</span>
                  <span className="text-muted truncate block">
                    {duplicateWarning.existingStudent.email || duplicateWarning.existingStudent.phone || 'Girilmedi'}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs text-fg-2 leading-relaxed">
              Öğrenci numarası giriş adı olarak kullanıldığı için aynı numarayla ikinci bir kayıt açılamaz. Kayıtlı öğrenciyi
              yeni bilgilerle güncelleyebilir veya geri dönüp numarayı düzeltebilirsiniz.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};
