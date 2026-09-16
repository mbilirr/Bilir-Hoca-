import React, { useState } from 'react';
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
  Lock,
  Eye,
  EyeOff,
  Key,
  Copy,
} from 'lucide-react';
import { Student, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';
import { compressImageToDataUrl } from '../../lib/imageCompressor';
import { ExcelStudentUploadModal } from './ExcelStudentUploadModal';
import { ExcelClassUploadModal } from './ExcelClassUploadModal';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { StudentWelcomeCredentialsModal } from './StudentWelcomeCredentialsModal';
import {
  generateStudentWelcomeEmail,
  createGmailComposeLink,
} from '../../lib/emailTemplates';
import {
  SCHOOL_LEVELS,
  BRANCH_OPTIONS,
  getGradesForSchoolLevel,
  detectSchoolLevelFromGrade,
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
  const [activeTab, setActiveTab] = useState<'students' | 'classes'>('students');

  // Modals
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isExcelClassModalOpen, setIsExcelClassModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassGroup | null>(null);

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
  const [autoOpenEmail, setAutoOpenEmail] = useState(true);
  const [studentSuccessFeedback, setStudentSuccessFeedback] = useState<string | null>(null);
  const [copiedPasswordId, setCopiedPasswordId] = useState<string | null>(null);
  const [studentClassId, setStudentClassId] = useState(classes[0]?.id || '');
  const [studentSchoolLevel, setStudentSchoolLevel] = useState<'Ortaokul' | 'Lise' | ''>('Ortaokul');
  const [studentGradeLevel, setStudentGradeLevel] = useState('5. Sınıf');
  const [studentBranch, setStudentBranch] = useState('Şube A');
  const [studentNumber, setStudentNumber] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentAvatar, setStudentAvatar] = useState<string>('');
  const [isProcessingStudentPhoto, setIsProcessingStudentPhoto] = useState(false);
  const [studentFormError, setStudentFormError] = useState<string | null>(null);
  const studentFileInputRef = React.useRef<HTMLInputElement | null>(null);

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
  const [classBranch, setClassBranch] = useState('Şube A');
  const [classAcademicYear, setClassAcademicYear] = useState('2026-2027');
  const [classDescription, setClassDescription] = useState('');
  const [classFormError, setClassFormError] = useState<string | null>(null);

  // Filter students
  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentNumber.includes(searchTerm) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = selectedClassFilter === 'all' || s.classId === selectedClassFilter;
    return matchesSearch && matchesClass;
  });

  // Handle Add Student
  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    setStudentFormError(null);

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

    if (editingStudent) {
      dataService.updateStudent(editingStudent.id, {
        name: studentName,
        username: studentUsername,
        email: studentEmail,
        password: studentPassword || editingStudent.password || '123456',
        classId: targetClassId,
        className: constructedClassName,
        schoolLevel: studentSchoolLevel,
        gradeLevel: studentGradeLevel,
        branch: studentBranch,
        studentNumber,
        phone: studentPhone,
        avatar: studentAvatar || editingStudent.avatar,
      });
      setStudentSuccessFeedback(`Öğrenci "${studentName}" başarıyla güncellendi.`);
      setTimeout(() => setStudentSuccessFeedback(null), 4000);
      setEditingStudent(null);
    } else {
      const createdStudent = dataService.registerStudent({
        name: studentName,
        username: studentUsername || studentEmail.split('@')[0],
        email: studentEmail,
        password: studentPassword || '123456',
        classId: targetClassId,
        className: constructedClassName,
        schoolLevel: studentSchoolLevel,
        gradeLevel: studentGradeLevel,
        branch: studentBranch,
        studentNumber: studentNumber || `${Math.floor(1000 + Math.random() * 9000)}`,
        phone: studentPhone || '0555 000 0000',
        avatar:
          studentAvatar ||
          `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(studentName)}`,
      });
      setIsAddStudentOpen(false);
      setSelectedCredentialsStudent(createdStudent);
      if (studentEmail) {
        setStudentSuccessFeedback(`Öğrenci "${studentName}" başarıyla eklendi! Giriş bilgileri e-posta ekranında hazırlandı.`);
        if (autoOpenEmail) {
          try {
            const emailContent = generateStudentWelcomeEmail({
              studentName: createdStudent.name,
              studentEmail: createdStudent.email,
              username: createdStudent.username,
              studentNumber: createdStudent.studentNumber,
              password: createdStudent.password,
              className: createdStudent.className,
              teacherName: 'Öğretmen',
            });
            const gmailUrl = createGmailComposeLink(
              createdStudent.email,
              emailContent.subject,
              emailContent.text
            );
            window.open(gmailUrl, '_blank');
          } catch (e) {
            console.warn('E-posta penceresi açılamadı:', e);
          }
        }
      } else {
        setStudentSuccessFeedback(`Öğrenci "${studentName}" başarıyla eklendi! Giriş şifresi: ${studentPassword || '123456'}`);
      }
      setTimeout(() => setStudentSuccessFeedback(null), 5000);
    }
    resetStudentForm();
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
    setStudentBranch('Şube A');
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
      detectedGrades.find((g) => student.className.includes(g)) ||
      detectedGrades[0];

    setStudentSchoolLevel(detectedSchool);
    setStudentGradeLevel(matchedGrade);
    setStudentBranch(student.branch || 'Şube A');
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
    setClassBranch('Şube A');
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
    setClassBranch(cls.branch || 'Şube A');
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
                  setClassBranch('Şube A');
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
          )}
        </div>
      </div>

      {activeTab === 'students' ? (
        /* STUDENTS VIEW */
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {/* Filter / Search Bar */}
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Öğrenci adı, no veya e-posta ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Sınıf Filtresi:</span>
              <select
                value={selectedClassFilter}
                onChange={(e) => setSelectedClassFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="all">Tüm Sınıflar ({students.length})</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({students.filter((s) => s.classId === cls.id).length})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Students Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci</th>
                  <th className="px-6 py-3.5 font-semibold">Sınıf / Şube</th>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci No</th>
                  <th className="px-6 py-3.5 font-semibold">Giriş Şifresi</th>
                  <th className="px-6 py-3.5 font-semibold">İletişim & E-posta</th>
                  <th className="px-6 py-3.5 font-semibold">Kayıt Durumu</th>
                  <th className="px-6 py-3.5 font-semibold text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      Arama kriterlerine uygun öğrenci bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((std) => (
                    <tr key={std.id} className="hover:bg-slate-800/30 transition-colors">
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
                            className="w-10 h-10 rounded-full object-cover bg-slate-800 ring-2 ring-indigo-500/20"
                          />
                          <div>
                            <div className="font-semibold text-white">{std.name}</div>
                            <div className="text-xs text-slate-400 font-mono">@{std.username}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {std.className || 'Atanmadı'}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-mono font-medium text-slate-200">
                        #{std.studentNumber}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                            {std.password || '123456'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(std.password || '123456');
                              setCopiedPasswordId(std.id);
                              setTimeout(() => setCopiedPasswordId(null), 2000);
                            }}
                            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Şifreyi Kopyala"
                          >
                            {copiedPasswordId === std.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs space-y-1">
                        <div className="flex items-center space-x-1.5 text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <span>{std.email}</span>
                        </div>
                        {std.phone && (
                          <div className="flex items-center space-x-1.5 text-slate-400">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            <span>{std.phone}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>Aktif Öğrenci</span>
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setSelectedCredentialsStudent(std)}
                            className="p-1.5 bg-slate-800 hover:bg-indigo-600/30 text-slate-400 hover:text-indigo-300 rounded-lg transition-colors cursor-pointer"
                            title="Giriş Bilgilerini & Şifreyi Mail / WhatsApp İle Gönder"
                          >
                            <Mail className="w-4 h-4 text-indigo-400" />
                          </button>
                          <button
                            onClick={() => openEditStudent(std)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                            title="Düzenle"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setStudentToDelete(std)}
                            className="p-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                            title="Öğrenciyi Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ) : (
        /* CLASSES VIEW */
        <div className="space-y-4">
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
                    </div>

                    <h3 className="text-lg font-bold text-white mb-1">{cls.name}</h3>
                    <div className="flex items-center space-x-2 mb-2">
                      {cls.schoolLevel && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          {cls.schoolLevel}
                        </span>
                      )}
                      <span className="text-xs text-indigo-300 font-medium">{cls.branch}</span>
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1">E-Posta *</label>
                  <input
                    type="email"
                    required
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
                    Öğrenci e-postası girildiğinde sistem otomatik hoş geldin ve giriş bilgisi maili hazırlar. Öğrenci bu kullanıcı adı ve şifreyle "Öğrenci Girişi" panelinden sisteme erişebilir.
                  </p>
                  <label className="flex items-center space-x-2 pt-1 text-[11px] text-slate-200 cursor-pointer select-none">
                    <input
                      id="student-auto-open-email-chk"
                      type="checkbox"
                      checked={autoOpenEmail}
                      onChange={(e) => setAutoOpenEmail(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-emerald-300 font-medium">
                      Kayıt tamamlandığında Gmail gönderme penceresini otomatik aç
                    </span>
                  </label>
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
                        setClassName(`${newGrade} - ${classBranch}`);
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
                        setClassName(`${classGradeLevel} - ${newBranch}`);
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
                  placeholder="Örn: 5. Sınıf - Şube A"
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
    </div>
  );
};
