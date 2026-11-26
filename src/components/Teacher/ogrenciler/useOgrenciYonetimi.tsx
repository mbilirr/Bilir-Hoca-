// Öğrenciler sayfası: sayfanın bütün durumu ve işlemleri (Aşama 354a). Görünüm parçaları bunu useOgrenciBaglam() ile okur.
import React, { createContext, useContext, useState, useMemo, useDeferredValue, useRef } from 'react';
import { sifreSorunu } from '../../../lib/sifreKurali';
import { usePagedList, useMediaQuery } from '../../../lib/listPaging';
import { Student, ClassGroup, StudentCredential, StudentAccountFailure, StudentParent } from '../../../types';
import { cleanParents, hasParentInfo, parentIssue } from '../../../lib/parents';
import { dataService } from '../../../services/dataService';
import { getStudentTcHash, setStudentTcHashes } from '../../../services/denemeService';
import { hashTcs, validTc } from '../../../lib/tcApi';
import { ogrenciGuncellendi } from '../../../lib/geriAl';
import { gecerliDogumTarihi } from '../../../lib/dogumTarihi';
import { kayitliSube, siniftanSube, subeAdi, SUBE_EN_UZUN } from '../../../lib/subeAdi';
import { useEverTrue } from '../../../lib/lazyLoad';
import { canSendCredentials, useMyGrantCred } from '../../../lib/grantCred';
import { useMyGrantMove } from '../../../lib/grantMove';
import { gradeOf } from '../../../lib/teacherGrades'; // Aşama 429
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { BRANCH_OPTIONS, getGradesForSchoolLevel, detectSchoolLevelFromGrade, formatClassDisplayName } from '../../../constants/schoolConstants';
import confetti from 'canvas-confetti';
import { useQuickFocus } from '../../../lib/quickFocus';
import { STUDENT_COLUMNS, matrixToRows, extractStudentRows, emailIssue, normalizeTurkishPhone, trFold, PHONE_ERROR, currentAcademicYear, normalizeAcademicYear, sheetSource, gercekAralik } from '../../../lib/importNormalize';
import { useHistoryState } from '../../../lib/useHistoryState';
import { useBildirimKanali } from '../../../lib/bildirim';
import { StudentManagementProps, QuickClassOption } from './ortak';

export function useOgrenciYonetimi({
  students,
  classes,
  onSelectStudentForHomework,
}: StudentManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  // Aşama 429: sınıf seviyesi süzgeci ('all' ya da '5', '6' …); sınıf listesi seçilen seviyeye daralır
  const [gradeFilter, setGradeFilterRaw] = useState('all');
  const [sortOrder, setSortOrder] = useState<'default' | 'name-asc' | 'name-desc' | 'number-asc'>('default');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  // Aşama 142: seçilenlerden giriş bilgisi gönderilebilenler (öğrenciye şifre verebilen; kendi kurumu)
  const [credSendList, setCredSendList] = useState<Student[] | null>(null); // pencere açıkken liste sabit kalır
  const grantCredOn = useMyGrantCred(); // Aşama 149: genel yöneticinin açtığı sınıflar
  const grantMoveOn = useMyGrantMove(); // Aşama 161: açılan sınıflar arasında sınıf değiştirme
  const credSendStudents = useMemo(() => {
    if (!selectedStudentIds.length) return [];
    const sel = new Set(selectedStudentIds);
    return students.filter((s) => sel.has(s.id) && canSendCredentials(s, grantCredOn));
  }, [selectedStudentIds, students, grantCredOn]);
  const [credPickOpen, setCredPickOpen] = useState(false); // Aşama 151
  const credPickStudents = useMemo(
    () => (credPickOpen ? students.filter((s) => !s.isSuspended && s.status !== 'suspended' && canSendCredentials(s, grantCredOn)) : []),
    [credPickOpen, students, grantCredOn]
  );
  const canSendAnyCred = useMemo(() => students.some((s) => canSendCredentials(s, grantCredOn)), [students, grantCredOn]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useHistoryState<'students' | 'classes'>('students.tab', 'students'); // Aşama 52: geri tuşu
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null); // Aşama 21: açık sınıf şeridi
  // Aşama 274: sınıf ayrıntısındaki öğrenci ızgarasının sırası (okul no / alfabetik); seçim bütün sınıflarda geçerli
  const [classDetailSort, setClassDetailSort] = useState<'no' | 'ad'>('no');

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
  // Aşama 76: yeni öğrencinin eklenebileceği sınıflar (kurum yöneticisi: kendi açtığı + kurumuna izin verilen sınıflar)
  // ve "Sınıfsız" seçeneği (öğrenci kuruma kayıtlı olur, sonradan bir sınıfa aktarılabilir)
  const studentClassOptions = classes.filter((c) => dataService.canAddStudentToClass(c));
  const NO_CLASS = 'class-default';
  // Aşama 69: ŞUBESİZ SINIF — öğrenci şubeye bağlı olmadan yalnızca sınıf düzeyinde (ör. "8. Sınıf") durabilir.
  // Şube seçim kutusunda "Şubesiz" seçeneğinin değeri; sınıf kaydında şube boş ('') saklanır.
  const NO_BRANCH = '__none__';
  // Aşama 325: şube harf (A) ya da kelime (ZÜMRÜT) olabilir; formda yazılan "Şubesiz" de şubesiz sayılır
  const subesizMi = (b: string) => b === NO_BRANCH || trFold(b).replace(/[^a-z]/g, '') === 'subesiz';
  const branchValue = (b: string) => (subesizMi(b) ? '' : subeAdi(b));
  // Sınıfın şubesi: kayıtlı şube (yer tutucu "Genel" sayılmaz), yoksa sınıf adındaki ("5/JÜPİTER")
  const sinifSubesi = (c: ClassGroup) => kayitliSube(c.branch) || siniftanSube(c.name).branch || '';
  const isNoBranchClass = (c: ClassGroup) => !sinifSubesi(c);
  // Şube önerileri: A–H ve okulda kullanılan kelime şubeler (ZÜMRÜT, VENÜS…), alfabetik
  const subeOnerileri = Array.from(new Set([...BRANCH_OPTIONS.map((b) => b.label), ...classes.map(sinifSubesi).filter(Boolean)])).sort((a, b) =>
    a.length - b.length || a.localeCompare(b, 'tr')
  );
  const gradeNumOf = (c: ClassGroup) => (String(c.gradeLevel || '').match(/\b(1[0-2]|[1-9])\b/) || String(c.name || '').match(/\b(1[0-2]|[1-9])\b/) || [])[1] || '';
  // Öğrenci formunda: henüz şubesiz sınıfı olmayan sınıf düzeyleri için "8. Sınıf (şubesiz)" seçeneği;
  // seçilip kaydedilince şubesiz sınıf kendiliğinden açılır (yalnızca sınıf açma yetkisi olanlarda)
  const PENDING_GRADE = '__grade:';
  const pendingNoBranchGrades = canAddClasses
    ? Array.from(
        new Map(
          manageableClasses
            .filter((c) => gradeNumOf(c) && !isNoBranchClass(c))
            .map((c) => [gradeNumOf(c), c] as const)
        ).values()
      )
        .filter((c) => !classes.some((x) => isNoBranchClass(x) && gradeNumOf(x) === gradeNumOf(c)))
        .sort((a, b) => Number(gradeNumOf(a)) - Number(gradeNumOf(b)))
    : [];

  // Modals
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isExcelUpdateOpen, setIsExcelUpdateOpen] = useState(false); // Aşama 49
  const [isListExportOpen, setIsListExportOpen] = useState(false); // Aşama 80: öğrenci listesi al
  const [isExcelClassModalOpen, setIsExcelClassModalOpen] = useState(false);
  // Aşama 124: pencere ilk açılınca indirilir, sonra yerinde kalır
  const everExcelOpen = useEverTrue(isExcelModalOpen);
  const everExcelUpdateOpen = useEverTrue(isExcelUpdateOpen);
  const everExcelClassOpen = useEverTrue(isExcelClassModalOpen);
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
  const setStudentSuccessFeedback = useBildirimKanali(); // Aşama 353: ortak bildirim
  const [studentClassId, setStudentClassId] = useState(studentClassOptions[0]?.id || '');
  const [studentNumber, setStudentNumber] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentAvatar, setStudentAvatar] = useState<string>('');
  // Aşama 171: cinsiyet ('' = belirtilmedi). Elle seçilmediyse ad yazıldıkça addan tahmin edilir.
  const [studentGender, setStudentGender] = useState<'' | 'K' | 'E'>('');
  const genderTouchedRef = React.useRef(false);
  // Aşama 324: doğum tarihi 'YYYY-MM-DD' ('' = girilmedi)
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'K' | 'E' | 'none'>('all');
  const [isGenderFillOpen, setIsGenderFillOpen] = useState(false);
  const [resimAcik, setResimAcik] = useState(false); // Aşama 334: ortak profil resmi penceresi
  const [studentFormError, setStudentFormError] = useState<string | null>(null);
  const [studentEmailError, setStudentEmailError] = useState<string | null>(null);
  const [studentPhoneError, setStudentPhoneError] = useState<string | null>(null);
  // Aşama 69: veli iletişim bilgileri (isteğe bağlı)
  // en çok 3 veli (K12'deki Veli (1), (2), (3)); formda en az bir boş satır görünür
  const [parents, setParents] = useState<StudentParent[]>([{}]);
  const [parentErrors, setParentErrors] = useState<Array<string | null>>([]);
  const setParentField = (i: number, field: keyof StudentParent, value: string) => {
    setParents((list) => list.map((p, k) => (k === i ? { ...p, [field]: value } : p)));
    setParentErrors((e) => e.map((x, k) => (k === i ? null : x)));
  };
  // Aşama 50: TC kimlik (yalnızca parmak izi saklanır; alan hiçbir zaman dolu gelmez)
  const canTc = dataService.canUseDeneme();
  const [studentTc, setStudentTc] = useState('');
  const [studentTcSaved, setStudentTcSaved] = useState<boolean | null>(null);
  // Aşama 182: TC ve şifre bölümleri kapalı satır olarak durur, yalnız gerekince açılır
  const [tcEditOpen, setTcEditOpen] = useState(false);
  const [pwEditOpen, setPwEditOpen] = useState(false);
  // Aşama 254 / 262: yöneticinin verdiği son şifre ortak KayitliSifre bileşeninde (yalnız yöneticiler görür)
  const [studentTcRemove, setStudentTcRemove] = useState(false);
  const [studentTcError, setStudentTcError] = useState<string | null>(null);
  const setQuickClassChangeFeedback = useBildirimKanali(); // Aşama 353: ortak bildirim

  // Hızlı Sınıf Değiştirme / Aktarma İşleyicisi
  const handleQuickChangeStudentClass = async (student: Student, targetClassId: string) => {
    try {
      const updated = await dataService.updateStudentClass(student.id, targetClassId);
      const targetClassName = updated.className || 'Atanmadı';
      setQuickClassChangeFeedback(`✓ ${student.name} başarıyla "${targetClassName}" sınıfına aktarıldı.`);
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
    parents: StudentParent[];
    avatar?: string;
    gender?: 'K' | 'E';
    birthDate: string; // Aşama 324: '' = yok
    password: string;
  }
  // Aynı ad ve numarayla kayıtlı öğrenci uyarısı
  interface DuplicateWarningState {
    existingStudent: Student;
    newStudentPayload: StudentFormPayload;
  }
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarningState | null>(null);

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
        nameColor: 'text-warning-fg font-bold',
        badgeBg: 'bg-warning-soft',
        badgeText: 'text-warning-fg font-bold',
        badgeBorder: 'border-warning',
        rowBg: 'bg-warning-soft/90',
        rowHover: 'hover:bg-warning-soft/80',
        borderLeft: 'border-l-4 border-l-warning',
        ringColor: 'ring-warning',
        pillBg: 'bg-warning',
        label: '1. Kayıt',
      },
      {
        nameColor: 'text-danger-fg font-bold',
        badgeBg: 'bg-danger-soft',
        badgeText: 'text-danger-fg font-bold',
        badgeBorder: 'border-danger',
        rowBg: 'bg-danger-soft/90',
        rowHover: 'hover:bg-danger-soft/80',
        borderLeft: 'border-l-4 border-l-danger',
        ringColor: 'ring-danger',
        pillBg: 'bg-danger',
        label: '2. Kayıt',
      },
      {
        nameColor: 'text-info-fg font-bold',
        badgeBg: 'bg-info-soft',
        badgeText: 'text-info-fg font-bold',
        badgeBorder: 'border-info',
        rowBg: 'bg-info-soft/90',
        rowHover: 'hover:bg-info-soft/80',
        borderLeft: 'border-l-4 border-l-info',
        ringColor: 'ring-info',
        pillBg: 'bg-info',
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

  // Aşama 429: sınıf seviyeleri (kurumdaki sınıflardan) ve her öğrencinin seviyesi
  const classGrade = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of classes) {
      const g = gradeOf(c);
      if (g !== null) m.set(c.id, g);
    }
    return m;
  }, [classes]);
  const studentGrade = (s: Student): number | null => (s.classId ? classGrade.get(s.classId) ?? null : null);
  const gradeOptions = useMemo(() => {
    const count = new Map<number, number>();
    for (const g of classGrade.values()) if (!count.has(g)) count.set(g, 0);
    for (const s of students) {
      const g = s.classId ? classGrade.get(s.classId) : undefined;
      if (g !== undefined) count.set(g, (count.get(g) || 0) + 1);
    }
    return Array.from(count.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([grade, n]) => ({ grade, count: n }));
  }, [classGrade, students]);
  /** Seviye değişince seçili sınıf o seviyede değilse sınıf süzgeci "Tüm Sınıflar"a döner */
  const setGradeFilter = (v: string) => {
    setGradeFilterRaw(v);
    // "Yok" (sınıfsız) seçiliyse de döner: sınıfsız öğrencinin seviyesi yoktur
    if (v !== 'all' && selectedClassFilter !== 'all' && selectedClassFilter !== 'duplicates' && String(classGrade.get(selectedClassFilter) ?? '') !== v) {
      setSelectedClassFilter('all');
    }
  };
  const gradeClasses = useMemo(
    () => (gradeFilter === 'all' ? classes : classes.filter((c) => String(classGrade.get(c.id) ?? '') === gradeFilter)),
    [classes, classGrade, gradeFilter]
  );
  const gradeStudentCount = useMemo(
    () => (gradeFilter === 'all' ? students.length : students.filter((s) => String(studentGrade(s) ?? '') === gradeFilter).length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, classGrade, gradeFilter]
  );

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
      // Aşama 429: sınıf seviyesi
      if (gradeFilter !== 'all' && String(studentGrade(s) ?? '') !== gradeFilter) return false;
      // Aşama 171: cinsiyet süzgeci
      const matchesGender =
        genderFilter === 'all' || (genderFilter === 'none' ? !s.gender : s.gender === genderFilter);
      return matchesSearch && matchesClass && matchesGender;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, classes, classGrade, deferredSearch, selectedClassFilter, gradeFilter, genderFilter, sortOrder, duplicateStudentGroups]);
  // Aşama 171: cinsiyet sayıları (süzgeç seçeneklerinde)
  const genderCounts = useMemo(() => {
    let k = 0, e = 0;
    for (const s of students) {
      if (s.gender === 'K') k++;
      else if (s.gender === 'E') e++;
    }
    return { k, e, none: students.length - k - e };
  }, [students]);
  // Aşama 15: liste parça parça çizilir; telefonda yalnız kart listesi, bilgisayarda yalnız tablo çizilir
  const isPhoneList = useMediaQuery('(max-width: 767px)');
  // Aşama 84: satırlardaki sınıf seçiminin seçenekleri bir kez hazırlanır (her satırda yeniden süzülmez)
  // Aşama 354a: satırlar memo; seçenek listesi yalnız sınıflar değişince yeniden kurulur
  const quickClassOptions: QuickClassOption[] = useMemo(
    () =>
      classes.map((cls) => ({
        id: cls.id,
        label: formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel),
        manageable: dataService.canManageClass(cls),
      })),
    [classes]
  );
  // Aşama 161: açılan sınıftaki genel yönetici öğrencisi yalnız açılan sınıflara taşınır (anahtar kapalıyken hesaplanmaz)
  const grantedQuickOptions: QuickClassOption[] = useMemo(() => {
    if (!grantMoveOn) return [];
    const granted = new Set(dataService.getMyKurum().grantedClassIds || []);
    return quickClassOptions.map((o) => ({ ...o, manageable: granted.has(o.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantMoveOn, classes]);
  // Aşama 84: liste önce 15 satırla açılır, kalan satırlar hemen ardından eklenir (ilk açılış hızlanır)
  // Aşama 116: sınıf süzgecindeki sayılar tek geçişte sayılır (her sınıf için tüm öğrenciler taranmaz)
  const classCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const st of students) if (st.classId) m.set(st.classId, (m.get(st.classId) || 0) + 1);
    return m;
  }, [students]);
  const pagedStudents = usePagedList(filteredStudents, `${deferredSearch}|${gradeFilter}|${selectedClassFilter}|${genderFilter}|${sortOrder}`, undefined, 15);

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
      setStudentFormError('Öğrenciyi kurum yöneticisi, Müdür, Müdür Yrd. ya da izin verilmişse Rehberlik / Ölçme Değerlendirme ekler.');
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
    // Aşama 69: "8. Sınıf (şubesiz)" seçildiyse sınıf, diğer kontroller geçince açılır
    const pendingGradeClass = studentClassId.startsWith(PENDING_GRADE)
      ? pendingNoBranchGrades.find((c) => gradeNumOf(c) === studentClassId.slice(PENDING_GRADE.length)) || null
      : null;
    // Aşama 76: yalnızca bu kullanıcının öğrenci ekleyebildiği sınıflar (düzenlemede öğrencinin mevcut sınıfı da geçerli)
    const noClassChosen = studentClassId === NO_CLASS;
    let targetClass: ClassGroup | null | undefined =
      pendingGradeClass || noClassChosen
        ? null
        : studentClassOptions.find((c) => c.id === studentClassId) ||
          (editingStudent && editingStudent.classId === studentClassId ? classes.find((c) => c.id === studentClassId) : undefined);
    if (noClassChosen) targetClass = { id: NO_CLASS, name: 'Sınıfsız' } as ClassGroup;
    if (!targetClass && !pendingGradeClass) {
      setStudentFormError('Lütfen öğrencinin sınıfını seçiniz.');
      return;
    }
    const mailProblem = emailIssue(studentEmail);
    const phoneNorm = normalizeTurkishPhone(studentPhone);
    setStudentEmailError(mailProblem);
    setStudentPhoneError(phoneNorm.valid ? null : PHONE_ERROR);
    // Aşama 69: veli telefonu / e-postası (boş bırakılabilir)
    const parentErrs = parents.map((p) => (hasParentInfo(p) ? parentIssue(p) : null));
    setParentErrors(parentErrs);
    const parentProblem = parentErrs.some(Boolean);
    const tcDigits = studentTc.replace(/\D/g, '');
    const tcBad = canTc && !!tcDigits && !validTc(tcDigits);
    setStudentTcError(tcBad ? 'TC kimlik numarası geçersiz (11 hane, kontrol haneleri tutmuyor).' : null);
    if (mailProblem || !phoneNorm.valid || tcBad || parentProblem) {
      setStudentFormError('Lütfen işaretli alanları düzeltiniz.');
      return;
    }
    const cleanPassword = studentPassword.trim();
    if (!editingStudent && cleanPassword.length < 6) {
      setStudentFormError('Giriş şifresi en az 6 karakter olmalıdır.');
      return;
    }
    if (editingStudent && cleanPassword && cleanPassword.length < 6) {
      setStudentFormError('Yeni şifre en az 6 karakter olmalıdır (şifreyi değiştirmeyecekseniz Vazgeç düğmesine basın).');
      return;
    }
    // Aşama 145: basit şifre (123456, yaygın şifre, öğrencinin kendi numarası/adı) kabul edilmez
    const sifreHata = cleanPassword ? sifreSorunu(cleanPassword, { identifier: cleanNumber, name: cleanName }) : null;
    if (sifreHata) {
      setStudentFormError(sifreHata);
      return;
    }

    if (pendingGradeClass) {
      const num = gradeNumOf(pendingGradeClass);
      try {
        const { autoAssignedCount, ...created } = await dataService.addClass({
          name: `${num}. Sınıf`,
          schoolLevel: pendingGradeClass.schoolLevel || detectSchoolLevelFromGrade(pendingGradeClass.gradeLevel || pendingGradeClass.name) || 'Ortaokul',
          gradeLevel: pendingGradeClass.gradeLevel || `${num}. Sınıf`,
          branch: '',
          academicYear: pendingGradeClass.academicYear || currentAcademicYear(),
          description: `${num}. sınıf şubesiz öğrenciler`,
        });
        void autoAssignedCount;
        targetClass = created;
        setStudentClassId(created.id);
      } catch (err: any) {
        setStudentFormError(err?.message || 'Şubesiz sınıf açılamadı.');
        return;
      }
    }
    if (!targetClass) return;

    // Aşama 324: tarih kutusu yarım/yanlış tarihte boş verir; doluysa takvimde olan ve bugünden önceki bir gün olmalı
    if (studentBirthDate && !gecerliDogumTarihi(studentBirthDate)) {
      setStudentFormError('Doğum tarihi geçersiz (gelecek ya da yanlış bir tarih).');
      return;
    }

    const payload: StudentFormPayload = {
      name: cleanName,
      email: studentEmail.trim(),
      classId: targetClass.id,
      studentNumber: cleanNumber,
      phone: phoneNorm.value,
      parents: cleanParents(parents),
      avatar: studentAvatar || undefined, // Aşama 334: '' = kendi resmi kaldırıldı (eskiden kaldırma kaydedilmiyordu)
      gender: studentGender || undefined,
      birthDate: studentBirthDate,
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
    // Aşama 50: TC parmak izi (öğrenci kaydedildikten sonra; TC'nin kendisi gönderilip atılır)
    const saveTc = async (id: string): Promise<string> => {
      if (!canTc) return '';
      try {
        if (tcDigits) {
          const h = await hashTcs([tcDigits]);
          if (!h.ok) return ` TC kaydedilemedi: ${h.error}`;
          if (!h.hashes[0]) return ' TC geçersiz olduğu için kaydedilmedi.';
          const r = await setStudentTcHashes([{ id, hash: h.hashes[0] }]);
          return r.ok ? ' TC parmak izi kaydedildi.' : ' TC kaydedilemedi (yetki).';
        }
        if (studentTcRemove) {
          const r = await setStudentTcHashes([{ id, hash: null }]);
          return r.ok ? ' TC parmak izi silindi.' : ' TC silinemedi (yetki).';
        }
      } catch (e: any) {
        return ` ${e?.message || 'TC kaydedilemedi.'}`;
      }
      return '';
    };
    try {
      if (editingStudent) {
        // Aşama 306: düzenlemeden önceki hâl ("Geri al" için; ekrandaki kopya eski olabilir, servisteki taze alınır)
        const oncesi = dataService.getAllStudents().find((s) => s.id === editingStudent.id) || editingStudent;
        await dataService.updateStudent(
          editingStudent.id,
          {
            name: payload.name,
            email: payload.email,
            classId: payload.classId,
            studentNumber: payload.studentNumber,
            phone: payload.phone,
            parents: payload.parents,
            avatar: payload.avatar,
            gender: payload.gender,
            birthDate: payload.birthDate, // Aşama 324
          },
          { newPassword: payload.password || undefined }
        );
        const fresh = dataService.getAllStudents().find((s) => s.id === editingStudent.id);
        if (payload.password && fresh) {
          setCredentialsResult({ credentials: [{ student: fresh, password: payload.password }], failures: [], title: 'Yeni Giriş Bilgileri' });
        }
        const tcMsg = await saveTc(editingStudent.id);
        // Aşama 306: şifre ya da TC değişmediyse 10 sn "Geri al" (ikisi geri okunamadığı için yarım geri alma yapılmaz)
        if (!payload.password && !tcDigits && !studentTcRemove) ogrenciGuncellendi(oncesi);
        setStudentSuccessFeedback(`Öğrenci "${payload.name}" başarıyla güncellendi.${tcMsg}`);
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
          gender: payload.gender,
          birthDate: payload.birthDate || undefined, // Aşama 324
          password: payload.password,
        });
        const tcMsg = credential?.student?.id ? await saveTc(credential.student.id) : '';
        // Aşama 69: veli bilgileri hesap açıldıktan sonra öğrencinin kaydına yazılır
        let parentMsg = '';
        if (credential?.student?.id && payload.parents.length) {
          try {
            await dataService.updateStudent(credential.student.id, { parents: payload.parents });
          } catch (e: any) {
            parentMsg = ` Veli bilgileri kaydedilemedi: ${(e?.message || '').replace(/^Öğrenci bilgileri kaydedilemedi:\s*/, '') || 'bağlantı sorunu'}`;
          }
        }
        setIsAddStudentOpen(false);
        setCredentialsResult({ credentials: [credential], failures: [], title: 'Öğrenci Eklendi' });
        setStudentSuccessFeedback(`Öğrenci "${payload.name}" eklendi ve giriş hesabı açıldı.${tcMsg}${parentMsg}`);
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
          parents: newStudentPayload.parents,
          avatar: newStudentPayload.avatar,
          gender: newStudentPayload.gender,
          ...(newStudentPayload.birthDate ? { birthDate: newStudentPayload.birthDate } : {}), // Aşama 324: boşsa kayıtlı tarih silinmez
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
    setParents([{}]);
    setParentErrors([]);
    setStudentAvatar('');
    setStudentGender('');
    genderTouchedRef.current = false;
    setStudentBirthDate('');
    setStudentClassId(studentClassOptions[0]?.id || '');
    setStudentFormError(null);
    setStudentEmailError(null);
    setStudentPhoneError(null);
    setStudentTc('');
    setStudentTcSaved(null);
    setStudentTcRemove(false);
    setStudentTcError(null);
    setTcEditOpen(false);
    setPwEditOpen(false);
  };

  const openEditStudent = (student: Student) => {
    // Aşama 50: TC kayıtlı mı? (TC gösterilmez, yalnızca "kayıtlı" bilgisi)
    setStudentTc('');
    setStudentTcRemove(false);
    setStudentTcError(null);
    setStudentTcSaved(null);
    setTcEditOpen(false);
    setPwEditOpen(false);
    if (canTc) {
      void getStudentTcHash(student.id)
        .then((h) => setStudentTcSaved(!!h))
        .catch(() => setStudentTcSaved(null));
    }
    setEditingStudent(student);
    setStudentName(student.name);
    setStudentEmail(student.email || '');
    setStudentPassword('');
    setShowStudentPassword(true);
    setStudentClassId(
      student.classId === NO_CLASS || !student.classId
        ? NO_CLASS
        : classes.some((c) => c.id === student.classId)
          ? student.classId
          : ''
    );
    setStudentNumber(student.studentNumber || '');
    setStudentPhone(student.phone || '');
    setParents(student.parents && student.parents.length ? cleanParents(student.parents) : [{}]);
    setParentErrors([]);
    setStudentAvatar(student.avatar || '');
    setStudentGender(student.gender || '');
    genderTouchedRef.current = !!student.gender;
    setStudentBirthDate(student.birthDate || '');
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
    const sifreHata = sifreSorunu(pw, { identifier: passwordTarget.studentNumber, name: passwordTarget.name }); // Aşama 145
    if (sifreHata) {
      setPasswordTargetError(sifreHata);
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

  const downloadSampleClassExcel = async () => {
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

    const XLSX = await import('xlsx'); // Aşama 124: kütüphane yalnız gerektiğinde iner
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
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result;
        const XLSX = await import('xlsx'); // Aşama 124
        const src = sheetSource(buffer as string, 'binary'); // Aşama 154: CSV Türkçe harf
        const workbook = XLSX.read(src.data, { type: src.type, cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        gercekAralik(worksheet, XLSX.utils); // Aşama 323: dosyaya yanlış yazılmış tablo boyu (K12) yüzünden satır kaybolmasın
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
    if (!classBranch.trim()) {
      setClassFormError('Lütfen şubeyi yazınız ya da seçiniz (şubesiz sınıf için "Şubesiz" seçin).');
      return;
    }
    // Aşama 325: şube tek harf ya da tek kelime (Türkçe harfler; rakam ve işaret yok)
    if (!subesizMi(classBranch) && !subeAdi(classBranch)) {
      setClassFormError(`Şube yalnızca harflerden oluşmalı (en çok ${SUBE_EN_UZUN} harf, boşluksuz): örn. A ya da ZÜMRÜT.`);
      return;
    }
    const academicYear = normalizeAcademicYear(classAcademicYear);
    if (!academicYear) {
      setClassFormError(`Eğitim yılını "${currentAcademicYear()}" biçiminde yazınız.`);
      return;
    }

    setIsSavingClass(true);
    try {
      const finalClassName = className.trim() || formatClassDisplayName('', branchValue(classBranch), classGradeLevel);
      const classPayload = {
        name: finalClassName,
        schoolLevel: classSchoolLevel,
        gradeLevel: classGradeLevel,
        branch: branchValue(classBranch),
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
              branch: branchValue(classBranch), // Aşama 325
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
    setClassBranch(isNoBranchClass(cls) ? NO_BRANCH : sinifSubesi(cls)); // Aşama 325
    setClassAcademicYear(cls.academicYear || currentAcademicYear());
    setClassDescription(cls.description || '');
    setClassFormError(null);
    setIsAddClassOpen(true);
  };


  // Aşama 354a: liste satırlarına verilen KARARLI işlemler. Satırlar memo olduğu için her çizimde yeni işlev
  // verilirse hepsi yeniden çizilirdi; bunlar hep aynı kalır ve çağrıldığında en güncel işlevi çalıştırır.
  const sonIslem = useRef({ handleToggleStudent, openEditStudent, handleQuickChangeStudentClass });
  sonIslem.current = { handleToggleStudent, openEditStudent, handleQuickChangeStudentClass };
  const satirIslemleri: OgrenciSatirIslemleri = useMemo(
    () => ({
      sec: (id: string) => sonIslem.current.handleToggleStudent(id),
      duzenle: (st: Student) => sonIslem.current.openEditStudent(st),
      sinifDegistir: (st: Student, sinifId: string) => void sonIslem.current.handleQuickChangeStudentClass(st, sinifId),
      sil: (st: Student) => setStudentToDelete(st),
      sifre: (st: Student) => {
        setPasswordTarget(st);
        setPasswordTargetValue(dataService.generatePassword());
        setPasswordTargetError(null);
      },
    }),
    []
  );
  return {
    satirIslemleri,
    students,
    classes,
    onSelectStudentForHomework,
    searchTerm,
    setSearchTerm,
    selectedClassFilter,
    setSelectedClassFilter,
    gradeFilter,
    setGradeFilter,
    gradeOptions,
    gradeClasses,
    gradeStudentCount,
    sortOrder,
    setSortOrder,
    selectedStudentIds,
    setSelectedStudentIds,
    credSendList,
    setCredSendList,
    grantCredOn,
    grantMoveOn,
    credSendStudents,
    credPickOpen,
    setCredPickOpen,
    credPickStudents,
    canSendAnyCred,
    isBulkDeleteModalOpen,
    setIsBulkDeleteModalOpen,
    activeTab,
    setActiveTab,
    expandedClassId,
    setExpandedClassId,
    classDetailSort,
    setClassDetailSort,
    isAdmin,
    canAddStudents,
    canAddClasses,
    manageableClasses,
    studentClassOptions,
    NO_CLASS,
    NO_BRANCH,
    subesizMi,
    branchValue,
    sinifSubesi,
    isNoBranchClass,
    subeOnerileri,
    gradeNumOf,
    PENDING_GRADE,
    pendingNoBranchGrades,
    isAddStudentOpen,
    setIsAddStudentOpen,
    isExcelModalOpen,
    setIsExcelModalOpen,
    isExcelUpdateOpen,
    setIsExcelUpdateOpen,
    isListExportOpen,
    setIsListExportOpen,
    isExcelClassModalOpen,
    setIsExcelClassModalOpen,
    everExcelOpen,
    everExcelUpdateOpen,
    everExcelClassOpen,
    editingStudent,
    setEditingStudent,
    isAddClassOpen,
    setIsAddClassOpen,
    editingClass,
    setEditingClass,
    viewingClassStudents,
    setViewingClassStudents,
    classStudentSearch,
    setClassStudentSearch,
    transferTargetClass,
    setTransferTargetClass,
    transferSearchTerm,
    setTransferSearchTerm,
    transferOnlyUnassigned,
    setTransferOnlyUnassigned,
    transferSelectedStudentIds,
    setTransferSelectedStudentIds,
    studentToDelete,
    setStudentToDelete,
    classToDelete,
    setClassToDelete,
    credentialsResult,
    setCredentialsResult,
    passwordTarget,
    setPasswordTarget,
    passwordTargetValue,
    setPasswordTargetValue,
    passwordTargetError,
    setPasswordTargetError,
    isSettingPassword,
    setIsSettingPassword,
    isSavingStudent,
    setIsSavingStudent,
    studentName,
    setStudentName,
    studentEmail,
    setStudentEmail,
    studentPassword,
    setStudentPassword,
    showStudentPassword,
    setShowStudentPassword,
    setStudentSuccessFeedback,
    studentClassId,
    setStudentClassId,
    studentNumber,
    setStudentNumber,
    studentPhone,
    setStudentPhone,
    studentAvatar,
    setStudentAvatar,
    studentGender,
    setStudentGender,
    genderTouchedRef,
    studentBirthDate,
    setStudentBirthDate,
    genderFilter,
    setGenderFilter,
    isGenderFillOpen,
    setIsGenderFillOpen,
    resimAcik,
    setResimAcik,
    studentFormError,
    setStudentFormError,
    studentEmailError,
    setStudentEmailError,
    studentPhoneError,
    setStudentPhoneError,
    parents,
    setParents,
    parentErrors,
    setParentErrors,
    setParentField,
    canTc,
    studentTc,
    setStudentTc,
    studentTcSaved,
    setStudentTcSaved,
    tcEditOpen,
    setTcEditOpen,
    pwEditOpen,
    setPwEditOpen,
    studentTcRemove,
    setStudentTcRemove,
    studentTcError,
    setStudentTcError,
    setQuickClassChangeFeedback,
    handleQuickChangeStudentClass,
    duplicateWarning,
    setDuplicateWarning,
    className,
    setClassName,
    classSchoolLevel,
    setClassSchoolLevel,
    classGradeLevel,
    setClassGradeLevel,
    classBranch,
    setClassBranch,
    classAcademicYear,
    setClassAcademicYear,
    classDescription,
    setClassDescription,
    classFormError,
    setClassFormError,
    isSavingClass,
    setIsSavingClass,
    duplicateStudentGroups,
    isStudentUnassigned,
    unassignedStudentsCount,
    deferredSearch,
    filteredStudents,
    genderCounts,
    isPhoneList,
    quickClassOptions,
    grantedQuickOptions,
    classCountMap,
    pagedStudents,
    allFilteredSelected,
    someFilteredSelected,
    handleToggleSelectAll,
    handleToggleStudent,
    handleConfirmBulkDelete,
    handleSaveStudent,
    handleDuplicateReplace,
    resetStudentForm,
    openEditStudent,
    handleConfirmSetPassword,
    classExcelStudents,
    setClassExcelStudents,
    classExcelFileName,
    setClassExcelFileName,
    isReadingClassExcel,
    setIsReadingClassExcel,
    classExcelError,
    setClassExcelError,
    showExcelStudentList,
    setShowExcelStudentList,
    classExcelValidRows,
    classExcelInvalidCount,
    validateClassExcelRows,
    resetClassExcelState,
    resetClassForm,
    downloadSampleClassExcel,
    handleClassExcelFile,
    handleSaveClass,
    openEditClass,
  };
}

export type OgrenciSatirIslemleri = {
  sec: (id: string) => void;
  duzenle: (st: Student) => void;
  sinifDegistir: (st: Student, sinifId: string) => void;
  sil: (st: Student) => void;
  sifre: (st: Student) => void;
};
export type MukerrerBilgi = ReturnType<typeof useOgrenciYonetimi>['duplicateStudentGroups']['dupMap'] extends Map<string, infer V> ? V : never;

export type OgrenciBaglamDegeri = ReturnType<typeof useOgrenciYonetimi>;
export const OgrenciBaglam = createContext<OgrenciBaglamDegeri | null>(null);
export function useOgrenciBaglam(): OgrenciBaglamDegeri {
  const d = useContext(OgrenciBaglam);
  if (!d) throw new Error('OgrenciBaglam sağlayıcısı yok');
  return d;
}
