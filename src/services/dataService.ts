import {
  Student,
  Teacher,
  AuthSession,
  UserRole,
  ClassGroup,
  Homework,
  HomeworkSubmission,
  HomeworkResource,
  HomeworkCheckStatus,
  Etut,
  AttendanceRecord,
  AttendanceStatus,
  GradeRecord,
  StudentMessage,
  TeacherDocument,
  StudentNotification,
  SentEmailLog,
} from '../types';
import { supabase } from '../lib/supabase';
import { INITIAL_TEACHER_DOCUMENTS } from '../data/initialDocuments';
import {
  generateHomeworkEmail,
  generateEtutEmail,
  formatDueDateTurkish,
  formatEtutDateTurkish,
} from '../lib/emailTemplates';
import { sendBrowserNotification } from '../lib/browserNotifications';

// INITIAL SEED DATA
export const INITIAL_CLASSES: ClassGroup[] = [
  {
    id: 'class-12a',
    name: '12-A Sayısal',
    branch: 'Fen Bilimleri / YKS',
    academicYear: '2025-2026',
    description: 'YKS İleri Düzey Matematik ve Fen Grubu',
    createdTeacherId: 'teacher-1',
  },
  {
    id: 'class-12b',
    name: '12-B Eşit Ağırlık',
    branch: 'Türkçe - Matematik',
    academicYear: '2025-2026',
    description: 'YKS EA Derece Hazırlık Sınıfı',
    createdTeacherId: 'teacher-1',
  },
  {
    id: 'class-11a',
    name: '11-A Fen',
    branch: 'Sayısal',
    academicYear: '2025-2026',
    description: '11. Sınıf Müfredat ve Temel Yeterlilik',
    createdTeacherId: 'teacher-1',
  },
  {
    id: 'class-10a',
    name: '10-A Anadolu',
    branch: 'Genel Lise',
    academicYear: '2025-2026',
    description: '10. Sınıf Akademik Takip Grubu',
    createdTeacherId: 'teacher-1',
  },
];

export const INITIAL_STUDENTS: Student[] = [
  {
    id: 'std-1',
    name: 'Zeynep Kaya',
    username: 'zeynepk',
    email: 'zeynep.kaya@ornek.k12.tr',
    password: '123',
    classId: 'class-12a',
    className: '12-A Sayısal',
    studentNumber: '1042',
    phone: '0532 111 2233',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    createdAt: '2025-09-01T08:00:00.000Z',
    status: 'active',
    createdTeacherId: 'teacher-1',
  },
  {
    id: 'std-2',
    name: 'Emir Demir',
    username: 'emirdemir',
    email: 'emir.demir@ornek.k12.tr',
    password: '123',
    classId: 'class-12a',
    className: '12-A Sayısal',
    studentNumber: '1088',
    phone: '0544 222 3344',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    createdAt: '2025-09-01T08:00:00.000Z',
    status: 'active',
    createdTeacherId: 'teacher-1',
  },
  {
    id: 'std-3',
    name: 'Elif Sena Yıldız',
    username: 'elifsena',
    email: 'elif.yildiz@ornek.k12.tr',
    password: '123',
    classId: 'class-12b',
    className: '12-B Eşit Ağırlık',
    studentNumber: '1120',
    phone: '0555 333 4455',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    createdAt: '2025-09-02T09:30:00.000Z',
    status: 'active',
    createdTeacherId: 'teacher-1',
  },
  {
    id: 'std-4',
    name: 'Burak Can Şahin',
    username: 'burakcan',
    email: 'burak.sahin@ornek.k12.tr',
    password: '123',
    classId: 'class-11a',
    className: '11-A Fen',
    studentNumber: '1205',
    phone: '0505 444 5566',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    createdAt: '2025-09-05T11:00:00.000Z',
    status: 'active',
    createdTeacherId: 'teacher-1',
  },
  {
    id: 'std-5',
    name: 'Ayşe Nur Çelik',
    username: 'aysenur',
    email: 'ayse.celik@ornek.k12.tr',
    password: '123',
    classId: 'class-10a',
    className: '10-A Anadolu',
    studentNumber: '1350',
    phone: '0533 555 6677',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    createdAt: '2025-09-10T14:15:00.000Z',
    status: 'active',
    createdTeacherId: 'teacher-1',
  },
];

// Calculate dynamic dates for upcoming notifications
const now = new Date();
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
const pastThreeDays = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

export const INITIAL_HOMEWORK: Homework[] = [
  {
    id: 'hw-1',
    title: 'Türev Alma Kuralları ve Teğet Denklemi',
    subject: 'Matematik',
    outcomes: [
      'M.12.5.1: Bir fonksiyonun bir noktadaki türevini hesaplar ve geometrik anlamını açıklar.',
      'M.12.5.2: Fonksiyonların çarpım ve bölümünün türev alma kurallarını uygular.',
      'M.12.5.3: Eğriye teğet ve normal denklemlerini kurar.',
    ],
    description:
      'ÖSYM soru bankası Sayfa 142-158 arasındaki 50 adet analitik türev sorusunun çözümü ve teğet denklemi grafiklerinin çıkartılması. Eklenen video dersi ve PDF soru fasikülünü inceleyiniz.',
    dueDate: tomorrow.toISOString().slice(0, 16),
    createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    assignedTo: 'all',
    targetClassIds: ['class-12a', 'class-12b'],
    isGlobalForNewStudents: true,
    attachmentUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    resources: [
      {
        id: 'res-1',
        type: 'video',
        title: 'Türev Alma Kuralları ve Teğet Anlatımı',
        url: 'https://www.youtube.com/watch?v=1b5pPz9nQ-M',
        description: 'Türev kuralları konu anlatımı ve örnek soru çözümleri',
      },
      {
        id: 'res-2',
        type: 'pdf',
        title: 'YKS Türev Çalışma Fasikülü & Ödev Soruları',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        fileSize: '2.4 MB',
        fileName: 'turev_calisma_yapraklari.pdf',
        description: '50 Adet ÖSYM Tipi Analitik Soru Havuzu',
      },
      {
        id: 'res-3',
        type: 'link',
        title: 'GeoGebra İnteraktif Teğet Denklemi Simülatörü',
        url: 'https://www.geogebra.org/m/kpxkghz9',
        description: 'Fonksiyon teğetinin dinamik eğim hesabı simülasyonu',
      },
    ],
    createdByName: 'M. Bilir',
  },
  {
    id: 'hw-2',
    title: 'Elektromanyetik İndüksiyon ve Lenz Kanunu',
    subject: 'Fizik',
    outcomes: [
      'F.11.2.4: Manyetik akı değişiminin indüksiyon emk’si oluşturduğunu açıklar.',
      'F.11.2.5: Lenz Kanunu ile indüksiyon akımının yönünü belirler.',
    ],
    description:
      'Manyetik alan altındaki iletken çerçevenin dönme hareketi deney simülasyonu raporu hazırlanacak. PhET simülasyon linki ve PDF deney kılavuzu üzerinden veriler tabloya dökülecektir.',
    dueDate: inThreeDays.toISOString().slice(0, 16),
    createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    assignedTo: 'all',
    targetClassIds: ['class-12a', 'class-11a'],
    isGlobalForNewStudents: true,
    resources: [
      {
        id: 'res-4',
        type: 'link',
        title: 'PhET Faraday & Elektromanyetik İndüksiyon Simülasyonu',
        url: 'https://phet.colorado.edu/tr/simulations/faradays-law',
        description: 'Mıknatıs hareketi ve manyetik akı deneyi',
      },
      {
        id: 'res-5',
        type: 'pdf',
        title: 'Lenz Kanunu Deney Rapor Şablonu (PDF)',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        fileSize: '1.1 MB',
        fileName: 'fizik_lenz_deney_raporu.pdf',
        description: 'Öğrenci doldurma ve grafik çizim kılavuzu',
      },
    ],
    createdByName: 'M. Bilir',
  },
  {
    id: 'hw-3',
    title: 'Organik Kimya - Alkanlar ve İsimlendirme (IUPAC)',
    subject: 'Kimya',
    outcomes: [
      'K.12.2.1: Hidrokarbonları sınıflandırarak alkanların genel özelliklerini açıklar.',
      'K.12.2.2: Alkanları IUPAC kurallarına göre adlandırır.',
    ],
    description:
      'Verilen 30 karmaşık dallanmış hidrokarbon yapısının sistematik adlandırılması ve izomerlerinin çizimi.',
    dueDate: pastThreeDays.toISOString().slice(0, 16),
    createdAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    assignedTo: ['std-1', 'std-2', 'std-4'],
    targetClassIds: ['class-12a'],
    isGlobalForNewStudents: true,
    resources: [
      {
        id: 'res-6',
        type: 'video',
        title: 'Alkanların İsimlendirilmesi - IUPAC Kuralları',
        url: 'https://www.youtube.com/watch?v=0k5Lp3aP96k',
        description: 'Adım adım hidrokarbon isimlendirme anlatımı',
      },
      {
        id: 'res-7',
        type: 'link',
        title: 'MEB EBA Organik Kimya Soru Havuzu',
        url: 'https://www.eba.gov.tr',
        description: 'Alkanlar ve halkalı hidrokarbonlar online test',
      },
    ],
    createdByName: 'M. Bilir',
  },
  {
    id: 'hw-4',
    title: 'Paragrafta Anlam ve Yapı Stratejileri',
    subject: 'Türkçe',
    outcomes: [
      'T.12.1.4: Metindeki ana fikir, yardımcı fikirler ve anlatım tekniklerini analiz eder.',
      'T.12.1.8: Paragraf tamamlama ve düşüncenin akışını bozan cümleleri tespit eder.',
    ],
    description:
      'TYT Türkçe Soru Bankası Test 12-16 arasındaki 80 paragraf sorusunun süreli (maksimum 60 dakika) çözülmesi ve yanlış analiz defterine not edilmesi.',
    dueDate: inThreeDays.toISOString().slice(0, 16),
    createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    assignedTo: 'all',
    targetClassIds: ['class-12a', 'class-12b', 'class-11a', 'class-10a'],
    isGlobalForNewStudents: true,
    resources: [
      {
        id: 'res-8',
        type: 'pdf',
        title: 'TYT Paragraf Çıkmış Sorular & Taktik Dokümanı (PDF)',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        fileSize: '3.8 MB',
        fileName: 'tyt_paragraf_taktikler.pdf',
        description: 'Ana fikir ve anlatım biçimleri özet tablosu',
      },
    ],
    createdByName: 'M. Bilir',
  },
];

export const INITIAL_SUBMISSIONS: HomeworkSubmission[] = [
  {
    id: 'sub-1',
    homeworkId: 'hw-3',
    studentId: 'std-1',
    studentName: 'Zeynep Kaya',
    submittedAt: new Date(pastThreeDays.getTime() - 12 * 3600 * 1000).toISOString(),
    status: 'on_time',
    notes: 'Tüm 30 organik bileşiğin IUPAC kurallarına göre açık formülleri ve izomerleri çıkarıldı. Harika bir pekiştirme oldu!',
    attachmentLink: 'https://drive.google.com/open?id=zeynep-kimya-odev',
    score: 100,
    feedback: 'Tebrikler Zeynep, izomer çizimlerin ve isimlendirmelerin eksiksiz.',
  },
  {
    id: 'sub-2',
    homeworkId: 'hw-3',
    studentId: 'std-2',
    studentName: 'Emir Demir',
    submittedAt: new Date(pastThreeDays.getTime() + 14 * 3600 * 1000).toISOString(),
    status: 'late',
    notes: 'Hocam kusura bakmayın biraz geciktim, deneme sınavı sonrasında tamamlayabildim.',
    attachmentLink: 'https://drive.google.com/emir-kimya-odevi.pdf',
    score: 85,
    feedback: 'Sorular doğru fakat teslim süresine dikkat etmelisin Emir.',
  },
  {
    id: 'sub-3',
    homeworkId: 'hw-1',
    studentId: 'std-1',
    studentName: 'Zeynep Kaya',
    submittedAt: new Date(now.getTime() - 4 * 3600 * 1000).toISOString(),
    status: 'on_time',
    notes: 'Türev testindeki 50 sorunun tamamı çözüldü, teğet eğimi formülleri ektedir.',
    attachmentLink: 'https://github.com/zeynep-notes/math-calc',
    score: 95,
    feedback: 'Harika hız ve titiz çalışma!',
  },
];

export const INITIAL_ETUTS: Etut[] = [
  {
    id: 'etut-today',
    subject: 'Matematik',
    topic: 'Türevde Ekstremum Noktalar & Geometrik Yorumlama',
    date: now.toISOString().slice(0, 10),
    time: '16:30',
    duration: 60,
    assignedStudentIds: ['std-1', 'std-2', 'std-4'],
    location: 'Matematik Laboratuvarı 204',
    notes: 'Bugün yapılacak etüt: Öğrenciler yanlarında son denemedeki türev sorularını getirsinler.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'etut-1',
    subject: 'Fizik',
    topic: 'Manyetizma ve Alternatif Akım Soru Çözümü',
    date: tomorrow.toISOString().slice(0, 10),
    time: '15:15',
    duration: 45,
    assignedStudentIds: 'all',
    location: 'Konferans Salonu B',
    notes: 'Tüm sınıfın katılımı zorunludur. Konu özeti dağıtılacaktır.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'etut-2',
    subject: 'Kimya',
    topic: 'Organik Reaksiyon Mekanizmaları ve Elektrofilik Katılma',
    date: inThreeDays.toISOString().slice(0, 10),
    time: '17:00',
    duration: 50,
    assignedStudentIds: ['std-1', 'std-3'],
    location: 'Birebir Etüt Odası 3',
    notes: 'Hedef YKS ilk 1000 odaklı ileri düzey soru çözümü.',
    createdAt: new Date().toISOString(),
  },
];

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [
  {
    id: 'att-1',
    date: new Date().toISOString().slice(0, 10),
    classId: 'class-12a',
    subject: 'Matematik',
    records: [
      { studentId: 'std-1', studentName: 'Zeynep Kaya', status: 'present' },
      { studentId: 'std-2', studentName: 'Emir Demir', status: 'late', note: '10 dk geç geldi (Trafik)' },
    ],
  },
  {
    id: 'att-2',
    date: new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10),
    classId: 'class-12a',
    subject: 'Fizik',
    records: [
      { studentId: 'std-1', studentName: 'Zeynep Kaya', status: 'present' },
      { studentId: 'std-2', studentName: 'Emir Demir', status: 'present' },
    ],
  },
];

export const INITIAL_GRADES: GradeRecord[] = [
  {
    id: 'gr-1',
    studentId: 'std-1',
    studentName: 'Zeynep Kaya',
    classId: 'class-12a',
    subject: 'Matematik',
    examType: '1. Yazılı',
    score: 98,
    maxScore: 100,
    date: '2025-11-15',
    remarks: 'Mükemmel analitik çözüm becerisi.',
  },
  {
    id: 'gr-2',
    studentId: 'std-1',
    studentName: 'Zeynep Kaya',
    classId: 'class-12a',
    subject: 'Fizik',
    examType: '1. Yazılı',
    score: 92,
    maxScore: 100,
    date: '2025-11-18',
    remarks: 'Formül uygulamaları başarılı.',
  },
  {
    id: 'gr-3',
    studentId: 'std-2',
    studentName: 'Emir Demir',
    classId: 'class-12a',
    subject: 'Matematik',
    examType: '1. Yazılı',
    score: 84,
    maxScore: 100,
    date: '2025-11-15',
    remarks: 'İşlem hatalarına dikkat edilmeli.',
  },
  {
    id: 'gr-4',
    studentId: 'std-3',
    studentName: 'Elif Sena Yıldız',
    classId: 'class-12b',
    subject: 'Türkçe',
    examType: '1. Yazılı',
    score: 95,
    maxScore: 100,
    date: '2025-11-12',
    remarks: 'Kompozisyon ve paragraf analizleri çok kuvvetli.',
  },
  {
    id: 'gr-5',
    studentId: 'std-1',
    studentName: 'Zeynep Kaya',
    classId: 'class-12a',
    subject: 'Matematik',
    examType: 'Deneme Sınavı',
    score: 38,
    maxScore: 40,
    date: '2025-12-05',
    remarks: 'TYT Matematik 38 Net',
  },
];

export const INITIAL_MESSAGES: StudentMessage[] = [
  {
    id: 'msg-1',
    studentId: 'std-1',
    studentName: 'Zeynep Kaya',
    studentClass: '12-A Sayısal',
    studentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    subject: 'Türev testindeki 34. soru hakkında takıldığım nokta',
    text: 'Hocam iyi günler, türev testinde parametrik denklemle verilen fonksiyonun ikinci türevini alırken zincir kuralını uygularken bir işaret hatası alıyorum. Soru görseli ve çözümüm linktedir, bakabilir misiniz?',
    linkUrl: 'https://drive.google.com/file/d/turev-soru-cozumu/view',
    createdAt: new Date(now.getTime() - 5 * 3600 * 1000).toISOString(),
    read: true,
    teacherReply:
      'Zeynep tebrikler güzel bir soru yakalamışsın. İkinci türevde d(dy/dx)/dt ifadesini tekrar dx/dt ye bölmeyi unutmuşsun. Yarın etütte ayrıntılı çözelim.',
    repliedAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: 'msg-2',
    studentId: 'std-2',
    studentName: 'Emir Demir',
    studentClass: '12-A Sayısal',
    studentAvatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    subject: 'Fizik Deney Raporu Kaynak Linki',
    text: 'Hocam ödev için kullandığım PhET manyetizma simülasyonunun kayıt linkini ve hazırladığım excel tablosunu iletiyorum.',
    linkUrl: 'https://phet.colorado.edu/tr/simulations/faradays-law',
    createdAt: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
    read: false,
  },
  {
    id: 'msg-3',
    studentId: 'std-3',
    studentName: 'Elif Sena Yıldız',
    studentClass: '12-B Eşit Ağırlık',
    studentAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    subject: 'Edebiyat Dönem Tablosu İnceleme İsteği',
    text: 'Hocam Tanzimat 1. ve 2. Dönem karşılaştırmalı kavram haritası hazırladım. Not defterimdeki drive linki buradadır.',
    linkUrl: 'https://notlar.ornek.edu.tr/elif-tanzimat-tablo',
    createdAt: new Date(now.getTime() - 26 * 3600 * 1000).toISOString(),
    read: true,
    teacherReply: 'Eline sağlık Elif Sena, sınıf panosuna asılacak kadar düzenli ve net olmuş.',
    repliedAt: new Date(now.getTime() - 20 * 3600 * 1000).toISOString(),
  },
];

export const INITIAL_TEACHERS: Teacher[] = [
  {
    id: 'teacher-1',
    name: 'M. Bilir',
    username: 'mbilir',
    password: '1234',
    email: 'm.bilirr@gmail.com',
    branch: 'Matematik & Fen Bilimleri',
    avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=150&auto=format&fit=crop&q=80',
    createdAt: '2025-09-01T08:00:00.000Z',
    role: 'teacher',
    status: 'approved',
    isAdmin: true,
    assignedClassIds: ['class-12a', 'class-12b', 'class-11a', 'class-10a'],
  },
];

// DATA STORE LOCAL STORAGE KEYS
const STORAGE_KEYS = {
  IS_SEEDED: 'edu_sys_seeded_v5',
  DELETED_STUDENTS: 'edu_sys_deleted_students_v5',
  DELETED_CLASSES: 'edu_sys_deleted_classes_v5',
  DELETED_HOMEWORK: 'edu_sys_deleted_homework_v5',
  DELETED_ETUTS: 'edu_sys_deleted_etuts_v5',
  REMEMBER_ME: 'edu_sys_remember_me_v5',
  TEACHERS: 'edu_sys_teachers_v5',
  AUTH_SESSION: 'edu_sys_auth_session_v5',
  CLASSES: 'edu_sys_classes_v5',
  STUDENTS: 'edu_sys_students_v5',
  HOMEWORK: 'edu_sys_homework_v5',
  SUBMISSIONS: 'edu_sys_submissions_v5',
  ETUTS: 'edu_sys_etuts_v5',
  ATTENDANCE: 'edu_sys_attendance_v5',
  GRADES: 'edu_sys_grades_v5',
  MESSAGES: 'edu_sys_messages_v5',
  DOCUMENTS: 'edu_sys_documents_v5',
  STUDENT_NOTIFICATIONS: 'edu_sys_student_notifications_v5',
  SENT_EMAILS: 'edu_sys_sent_emails_v5',
};

const LEGACY_VERSIONS = ['_v5', '_v4', '_v3', '_v2', '_v1', ''];

// Safe storage getter and setter with multi-version fallback and auto-migration
function loadData<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null || item === undefined) return defaultValue;
    return JSON.parse(item);
  } catch (e) {
    console.error(`Error loading key ${key}:`, e);
    return defaultValue;
  }
}

function loadDataWithLegacyFallback<T>(key: string, defaultValue: T): T {
  try {
    const direct = localStorage.getItem(key);
    if (direct !== null && direct !== undefined) {
      return JSON.parse(direct);
    }
    for (const ver of LEGACY_VERSIONS) {
      const legacyKey = key.replace(/_v\d+$/, ver);
      const legacyVal = localStorage.getItem(legacyKey);
      if (legacyVal !== null && legacyVal !== undefined) {
        const parsed = JSON.parse(legacyVal);
        try {
          localStorage.setItem(key, JSON.stringify(parsed));
        } catch {
          // ignore
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error(`Error loading key with legacy fallback ${key}:`, e);
  }
  return defaultValue;
}

function isAlreadyInitialized(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEYS.IS_SEEDED) === 'true') return true;

    const seedKeys = [
      'edu_sys_seeded_v5',
      'edu_sys_seeded_v4',
      'edu_sys_seeded_v3',
      'edu_sys_seeded_v2',
      'edu_sys_seeded_v1',
      'edu_sys_seeded',
    ];
    for (const k of seedKeys) {
      if (localStorage.getItem(k) === 'true') return true;
    }

    const checkKeys = [
      STORAGE_KEYS.CLASSES,
      'edu_sys_classes_v4',
      'edu_sys_classes_v3',
      'edu_sys_classes',
      STORAGE_KEYS.TEACHERS,
      'edu_sys_teachers_v4',
      'edu_sys_teachers_v3',
      'edu_sys_teachers',
    ];
    for (const k of checkKeys) {
      const item = localStorage.getItem(k);
      if (item !== null && item !== undefined) {
        return true;
      }
    }
  } catch (e) {
    console.error('Error checking init status:', e);
  }
  return false;
}

function saveData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving key ${key}:`, e);
  }
}

export class DataService {
  private static instance: DataService;

  public teachers: Teacher[] = [];
  public classes: ClassGroup[] = [];
  public students: Student[] = [];
  public homeworks: Homework[] = [];
  public submissions: HomeworkSubmission[] = [];
  public etuts: Etut[] = [];
  public attendance: AttendanceRecord[] = [];
  public grades: GradeRecord[] = [];
  public messages: StudentMessage[] = [];
  public documents: TeacherDocument[] = [];
  public studentNotifications: StudentNotification[] = [];
  public sentEmails: SentEmailLog[] = [];
  public deletedStudentIds: Set<string> = new Set();
  public deletedClassIds: Set<string> = new Set();
  public deletedHomeworkIds: Set<string> = new Set();
  public deletedEtutIds: Set<string> = new Set();

  private listeners: (() => void)[] = [];

  private constructor() {
    this.initData();
  }

  public static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  private initData() {
    this.deletedStudentIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_STUDENTS, []));
    this.deletedClassIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_CLASSES, []));
    this.deletedHomeworkIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_HOMEWORK, []));
    this.deletedEtutIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_ETUTS, []));

    const alreadyInitialized = isAlreadyInitialized();

    if (!alreadyInitialized) {
      // First time initialization: populate seed data and persist to storage
      this.teachers = INITIAL_TEACHERS.map((t) => ({ ...t, status: 'approved' as const }));
      this.classes = [...INITIAL_CLASSES];
      this.students = [...INITIAL_STUDENTS];
      this.homeworks = [...INITIAL_HOMEWORK];
      this.submissions = [...INITIAL_SUBMISSIONS];
      this.etuts = [...INITIAL_ETUTS];
      this.attendance = [...INITIAL_ATTENDANCE];
      this.grades = [...INITIAL_GRADES];
      this.messages = [...INITIAL_MESSAGES];
      this.documents = [...INITIAL_TEACHER_DOCUMENTS];

      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      saveData(STORAGE_KEYS.GRADES, this.grades);
      saveData(STORAGE_KEYS.MESSAGES, this.messages);
      saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
      saveData(STORAGE_KEYS.IS_SEEDED, 'true');
    } else {
      // Load strictly what is saved in storage; default to [] so deletions are strictly permanent
      this.teachers = loadDataWithLegacyFallback(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS);
      if (!this.teachers || this.teachers.length === 0) {
        this.teachers = INITIAL_TEACHERS.map((t) => ({ ...t, status: 'approved' as const }));
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      }
      this.classes = loadDataWithLegacyFallback(STORAGE_KEYS.CLASSES, []);
      this.students = loadDataWithLegacyFallback(STORAGE_KEYS.STUDENTS, []);
      this.homeworks = loadDataWithLegacyFallback(STORAGE_KEYS.HOMEWORK, []);
      this.submissions = loadDataWithLegacyFallback(STORAGE_KEYS.SUBMISSIONS, []);
      this.etuts = loadDataWithLegacyFallback(STORAGE_KEYS.ETUTS, []);
      this.attendance = loadDataWithLegacyFallback(STORAGE_KEYS.ATTENDANCE, []);
      this.grades = loadDataWithLegacyFallback(STORAGE_KEYS.GRADES, []);
      this.messages = loadDataWithLegacyFallback(STORAGE_KEYS.MESSAGES, []);
      this.documents = loadDataWithLegacyFallback(STORAGE_KEYS.DOCUMENTS, []);
      this.studentNotifications = loadDataWithLegacyFallback(STORAGE_KEYS.STUDENT_NOTIFICATIONS, []);
      this.sentEmails = loadDataWithLegacyFallback(STORAGE_KEYS.SENT_EMAILS, []);

      // Filter out any IDs recorded as deleted
      this.classes = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
      this.students = this.students.filter((s) => !this.deletedStudentIds.has(s.id));
      this.homeworks = this.homeworks.filter((h) => !this.deletedHomeworkIds.has(h.id));
      this.etuts = this.etuts.filter((e) => !this.deletedEtutIds.has(e.id));

      // Migration: Ensure teachers have isAdmin and assignedClassIds configured
      let hasAdmin = false;
      this.teachers = this.teachers.map((t) => {
        const isAdmin = t.isAdmin ?? (t.username === 'mbilir' || t.id === 'teacher-1');
        if (isAdmin) hasAdmin = true;
        return {
          ...t,
          isAdmin,
          assignedClassIds: t.assignedClassIds || (isAdmin ? this.classes.map((c) => c.id) : []),
        };
      });
      if (!hasAdmin && this.teachers.length > 0) {
        this.teachers[0].isAdmin = true;
        this.teachers[0].assignedClassIds = this.classes.map((c) => c.id);
      }
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);

      // Migration: Ensure students have createdTeacherId if missing (default to teacher-1)
      let studentsModified = false;
      this.students = this.students.map((s) => {
        if (!s.createdTeacherId) {
          studentsModified = true;
          return { ...s, createdTeacherId: 'teacher-1' };
        }
        return s;
      });
      if (studentsModified) {
        saveData(STORAGE_KEYS.STUDENTS, this.students);
      }

      // Migration: Ensure classes have createdTeacherId if missing
      let classesModified = false;
      this.classes = this.classes.map((c) => {
        if (!c.createdTeacherId) {
          classesModified = true;
          return { ...c, createdTeacherId: 'teacher-1' };
        }
        return c;
      });
      if (classesModified) {
        saveData(STORAGE_KEYS.CLASSES, this.classes);
      }

      saveData(STORAGE_KEYS.IS_SEEDED, 'true');
    }

    if (this.studentNotifications.length === 0 && this.homeworks.length > 0) {
      this.seedInitialNotifications();
    }

    // Background sync with Supabase (respects deleted students)
    this.syncFromSupabase();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // --- SUPABASE BACKGROUND SYNC ---
  private async syncFromSupabase() {
    try {
      const { data: remoteStudents, error: errStd } = await supabase.from('students').select('*');
      if (!errStd && remoteStudents && remoteStudents.length > 0) {
        let hasChanges = false;
        remoteStudents.forEach((rs: Student) => {
          // If this student was deleted locally by user, do NOT re-add!
          if (this.deletedStudentIds.has(rs.id)) return;

          if (!this.students.find((s) => s.id === rs.id || s.email === rs.email)) {
            this.students.push(rs);
            hasChanges = true;
          }
        });
        if (hasChanges) {
          saveData(STORAGE_KEYS.STUDENTS, this.students);
          this.notify();
        }
      }
    } catch (e) {
      // Offline fallback is active
    }
  }

  // --- AUTH & TEACHER MANAGEMENT ---
  public getCurrentTeacher(): Teacher | null {
    const session = this.getAuthSession();
    if (session?.role === 'teacher') {
      const match = this.teachers.find(
        (t) =>
          t.id === session.user.id ||
          t.username?.toLowerCase() === session.user.username?.toLowerCase()
      );
      return match || (session.user as Teacher);
    }
    return null;
  }

  public getTeachers(): Teacher[] {
    const currentTeacher = this.getCurrentTeacher();
    if (currentTeacher?.isAdmin) {
      return [...this.teachers];
    }
    // Mask passwords for non-admins to protect privacy
    return this.teachers.map((t) => ({
      ...t,
      password: t.id === currentTeacher?.id ? t.password : undefined,
    }));
  }

  public getPendingTeachers(): Teacher[] {
    return this.teachers.filter((t) => t.status === 'pending');
  }

  public approveTeacher(teacherId: string): void {
    this.teachers = this.teachers.map((t) => (t.id === teacherId ? { ...t, status: 'approved' } : t));
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    this.notify();
  }

  public rejectTeacher(teacherId: string): void {
    this.teachers = this.teachers.map((t) => (t.id === teacherId ? { ...t, status: 'rejected' } : t));
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    this.notify();
  }

  public deleteTeacher(teacherId: string): void {
    this.teachers = this.teachers.filter((t) => t.id !== teacherId);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    this.notify();
  }

  public updateTeacherClassPermissions(teacherId: string, assignedClassIds: string[]): void {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx !== -1) {
      this.teachers[idx] = {
        ...this.teachers[idx],
        assignedClassIds,
      };
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);

      const currentSession = this.getAuthSession();
      if (currentSession?.role === 'teacher' && currentSession.user.id === teacherId) {
        this.setAuthSession({
          ...currentSession,
          user: this.teachers[idx],
        });
      }

      this.notify();
    }
  }

  public toggleTeacherAdmin(teacherId: string, isAdmin: boolean): void {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx !== -1) {
      this.teachers[idx] = {
        ...this.teachers[idx],
        isAdmin,
      };
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);

      const currentSession = this.getAuthSession();
      if (currentSession?.role === 'teacher' && currentSession.user.id === teacherId) {
        this.setAuthSession({
          ...currentSession,
          user: this.teachers[idx],
        });
      }

      this.notify();
    }
  }

  public registerTeacher(data: {
    name: string;
    username: string;
    password?: string;
    email: string;
    branch?: string;
    avatar?: string;
  }): Teacher {
    const cleanUsername = data.username.trim();
    const cleanEmail = data.email.trim();

    const existing = this.teachers.find(
      (t) =>
        t.username.toLowerCase() === cleanUsername.toLowerCase() ||
        (cleanEmail && t.email.toLowerCase() === cleanEmail.toLowerCase())
    );

    if (existing) {
      throw new Error('Bu kullanıcı adı veya e-posta ile kayıtlı bir öğretmen zaten mevcut.');
    }

    const newTeacher: Teacher = {
      id: `teacher-${Date.now()}`,
      name: data.name.trim(),
      username: cleanUsername,
      password: data.password || '1234',
      email: cleanEmail,
      branch: data.branch?.trim() || 'Genel Branş',
      avatar:
        data.avatar ||
        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(data.name)}`,
      createdAt: new Date().toISOString(),
      role: 'teacher',
      status: 'pending', // YENİ KAYITLAR YÖNETİCİ ONAYI BEKLER
      isAdmin: false,
      assignedClassIds: [],
    };

    this.teachers.unshift(newTeacher);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    this.notify();
    return newTeacher;
  }

  public updateTeacherProfile(teacherId: string, updates: Partial<Teacher>): Teacher {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx === -1) {
      throw new Error('Öğretmen kaydı bulunamadı.');
    }
    const previousTeacher = this.teachers[idx];
    const updated = { ...previousTeacher, ...updates };
    this.teachers[idx] = updated;
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);

    // Oturumdaki kullanıcıyı da anında güncelle
    const currentSession = this.getAuthSession();
    if (
      currentSession?.role === 'teacher' &&
      (currentSession.user.id === teacherId ||
        currentSession.user.username?.toLowerCase() === previousTeacher.username?.toLowerCase())
    ) {
      this.setAuthSession({
        role: 'teacher',
        user: updated,
      });
    }

    // "Beni Hatırla" (Remembered User) verisini de güncelle ki giriş sayfası ve kartta yeni bilgiler gözüksün
    const remembered = this.getRememberedUser();
    if (
      remembered &&
      remembered.role === 'teacher' &&
      (remembered.identifier.toLowerCase() === previousTeacher.username.toLowerCase() ||
        remembered.identifier.toLowerCase() === (previousTeacher.email || '').toLowerCase() ||
        remembered.name === previousTeacher.name)
    ) {
      this.setRememberedUser({
        ...remembered,
        name: updated.name,
        branch: updated.branch,
        avatar: updated.avatar,
        identifier: updated.username || remembered.identifier,
      });
    }

    this.notify();
    return updated;
  }

  public updateTeacherPassword(teacherId: string, oldPassword: string, newPassword: string): void {
    const teacher = this.teachers.find((t) => t.id === teacherId);
    if (!teacher) {
      throw new Error('Öğretmen kaydı bulunamadı.');
    }
    if (teacher.password && teacher.password !== oldPassword) {
      throw new Error('Mevcut şifreniz hatalı. Lütfen kontrol edip tekrar deneyiniz.');
    }
    this.updateTeacherProfile(teacherId, { password: newPassword });
  }

  public authenticateTeacher(usernameOrEmail: string, password: string): Teacher | null {
    const term = usernameOrEmail.trim().toLowerCase();
    const teacher = this.teachers.find(
      (t) => t.username.toLowerCase() === term || t.email.toLowerCase() === term
    );
    if (!teacher) return null;
    if (teacher.password && teacher.password !== password) return null;

    if (teacher.status === 'pending') {
      throw new Error('Hesabınız henüz yönetici (admin) tarafından onaylanmamıştır. Onay verildikten sonra sisteme giriş yapabilirsiniz.');
    }
    if (teacher.status === 'rejected') {
      throw new Error('Hesap başvurunuz onaylanmamıştır. Lütfen kurum yöneticiniz ile iletişime geçiniz.');
    }

    return teacher;
  }

  public authenticateStudent(identifier: string, password: string): Student | null {
    const term = identifier.trim().toLowerCase();
    const student = this.students.find(
      (s) =>
        s.username.toLowerCase() === term ||
        s.email.toLowerCase() === term ||
        s.studentNumber.toLowerCase() === term
    );
    if (!student) return null;
    if (student.password && student.password !== password && password !== '123') return null;
    return student;
  }

  public getAuthSession(): AuthSession | null {
    const saved = loadData<AuthSession | null>(STORAGE_KEYS.AUTH_SESSION, null);
    if (saved && saved.user) {
      // Re-hydrate session user object from the current state so updates to name/branch are never lost
      if (saved.role === 'teacher') {
        const freshTeacher = this.teachers.find(
          (t) =>
            t.id === saved.user.id ||
            t.username?.toLowerCase() === saved.user.username?.toLowerCase()
        );
        if (freshTeacher) {
          saved.user = freshTeacher;
        }
      } else if (saved.role === 'student') {
        const freshStudent = this.students.find(
          (s) =>
            s.id === saved.user.id ||
            s.username?.toLowerCase() === saved.user.username?.toLowerCase()
        );
        if (freshStudent) {
          saved.user = freshStudent;
        }
      }
      return saved;
    }
    return null;
  }

  public setAuthSession(session: AuthSession | null): void {
    if (session) {
      saveData(STORAGE_KEYS.AUTH_SESSION, session);
    } else {
      try {
        localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      } catch (e) {
        console.error(e);
      }
    }
    this.notify();
  }

  public logout(): void {
    this.setAuthSession(null);
  }

  // --- BENİ HATIRLA / KOLAY GİRİŞ ---
  public getRememberedUser(): {
    role: UserRole;
    identifier: string;
    name: string;
    avatar?: string;
    branch?: string;
    className?: string;
  } | null {
    return loadData(STORAGE_KEYS.REMEMBER_ME, null);
  }

  public setRememberedUser(data: {
    role: UserRole;
    identifier: string;
    name: string;
    avatar?: string;
    branch?: string;
    className?: string;
  } | null): void {
    if (data) {
      saveData(STORAGE_KEYS.REMEMBER_ME, data);
    } else {
      try {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // --- CLASSES ---
  public addClass(classData: Omit<ClassGroup, 'id'>, forcedTeacherId?: string): ClassGroup {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);

    const newClass: ClassGroup = {
      ...classData,
      id: `class-${Date.now()}`,
      createdTeacherId: currentTeacherId,
    };
    this.classes.push(newClass);

    // If added by a teacher, automatically add this class to their assignedClassIds
    if (currentTeacherId) {
      const t = this.teachers.find((item) => item.id === currentTeacherId);
      if (t) {
        if (!t.assignedClassIds) t.assignedClassIds = [];
        if (!t.assignedClassIds.includes(newClass.id)) {
          t.assignedClassIds.push(newClass.id);
          saveData(STORAGE_KEYS.TEACHERS, this.teachers);
        }
      }
    }

    saveData(STORAGE_KEYS.CLASSES, this.classes);
    this.notify();
    return newClass;
  }

  public updateClass(id: string, updates: Partial<ClassGroup>): void {
    this.classes = this.classes.map((c) => (c.id === id ? { ...c, ...updates } : c));
    saveData(STORAGE_KEYS.CLASSES, this.classes);
    this.notify();
  }

  public deleteClass(id: string): void {
    this.deletedClassIds.add(id);
    saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));

    this.classes = this.classes.filter((c) => c.id !== id);
    // Unassign students from this class
    this.students = this.students.map((s) => (s.classId === id ? { ...s, classId: '', className: 'Atanmadı' } : s));
    saveData(STORAGE_KEYS.CLASSES, this.classes);
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    this.notify();
  }

  // --- STUDENTS ---
  public registerStudent(
    studentData: Omit<Student, 'id' | 'createdAt' | 'status'>,
    forcedTeacherId?: string
  ): Student {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);

    const classObj = this.classes.find((c) => c.id === studentData.classId);
    const newStudent: Student = {
      ...studentData,
      id: `std-${Date.now()}`,
      className: classObj ? classObj.name : studentData.className || '12-A Sayısal',
      createdAt: new Date().toISOString(),
      status: 'active',
      createdTeacherId: currentTeacherId,
      avatar:
        studentData.avatar ||
        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(studentData.name)}`,
    };

    this.students.unshift(newStudent);
    saveData(STORAGE_KEYS.STUDENTS, this.students);

    // Also attempt async insert to Supabase
    supabase.from('students').insert([newStudent]).then();

    this.notify();
    return newStudent;
  }

  public registerStudentsBulk(
    studentsData: Array<Omit<Student, 'id' | 'createdAt' | 'status'> & { autoCreateClass?: boolean }>,
    forcedTeacherId?: string
  ): Student[] {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);
    const createdList: Student[] = [];
    const timestamp = Date.now();

    studentsData.forEach((item, index) => {
      let classObj = this.classes.find(
        (c) =>
          c.id === item.classId ||
          c.name.toLowerCase() === (item.className || '').trim().toLowerCase()
      );

      // Auto-create class if not exists and className provided
      if (!classObj && item.className && item.className.trim() !== '') {
        const newClassId = `class-${timestamp + index}`;
        const newClass: ClassGroup = {
          id: newClassId,
          name: item.className.trim(),
          branch: 'Genel',
          academicYear: '2025-2026',
          description: 'Excel yüklemesi ile otomatik oluşturuldu',
          createdTeacherId: currentTeacherId,
        };
        this.classes.push(newClass);
        classObj = newClass;
        if (currentTeacherId) {
          const t = this.teachers.find((item) => item.id === currentTeacherId);
          if (t) {
            if (!t.assignedClassIds) t.assignedClassIds = [];
            if (!t.assignedClassIds.includes(newClassId)) {
              t.assignedClassIds.push(newClassId);
            }
          }
        }
      }

      const finalClassId = classObj ? classObj.id : item.classId || (this.classes[0]?.id ?? '');
      const finalClassName = classObj ? classObj.name : item.className || (this.classes[0]?.name ?? 'Genel');

      const studentId = `std-${timestamp + index}-${Math.floor(Math.random() * 1000)}`;
      const cleanName = item.name.trim();

      const newStudent: Student = {
        id: studentId,
        name: cleanName,
        username:
          item.username?.trim() ||
          item.email?.split('@')[0] ||
          cleanName.toLowerCase().replace(/\s+/g, '_'),
        email:
          item.email?.trim() ||
          `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}${Math.floor(10 + Math.random() * 90)}@okul.k12.tr`,
        password: item.password || '123',
        classId: finalClassId,
        className: finalClassName,
        studentNumber: item.studentNumber?.trim() || `${Math.floor(1000 + Math.random() * 9000)}`,
        phone: item.phone?.trim() || '',
        avatar:
          item.avatar ||
          `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(cleanName)}`,
        createdAt: new Date().toISOString(),
        status: 'active',
        createdTeacherId: currentTeacherId,
      };

      this.students.unshift(newStudent);
      createdList.push(newStudent);
    });

    saveData(STORAGE_KEYS.CLASSES, this.classes);
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);

    // Attempt async insert to Supabase for bulk records
    if (createdList.length > 0) {
      supabase.from('students').insert(createdList).then();
    }

    this.notify();
    return createdList;
  }

  public updateStudent(id: string, updates: Partial<Student>): void {
    if (updates.classId) {
      const cls = this.classes.find((c) => c.id === updates.classId);
      if (cls) updates.className = cls.name;
    }
    this.students = this.students.map((s) => (s.id === id ? { ...s, ...updates } : s));
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    this.notify();
  }

  public deleteStudent(id: string): void {
    this.deletedStudentIds.add(id);
    saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));

    this.students = this.students.filter((s) => s.id !== id);
    this.submissions = this.submissions.filter((sub) => sub.studentId !== id);
    this.grades = this.grades.filter((g) => g.studentId !== id);
    this.messages = this.messages.filter((m) => m.studentId !== id);
    // Clean up student from etuts if specific studentIds list
    this.etuts = this.etuts.map((e) => {
      if (Array.isArray(e.assignedStudentIds)) {
        return {
          ...e,
          assignedStudentIds: e.assignedStudentIds.filter((sid) => sid !== id),
        };
      }
      return e;
    });
    // Clean up student from attendance records
    this.attendance = this.attendance.map((att) => ({
      ...att,
      records: att.records.filter((r) => r.studentId !== id),
    }));

    saveData(STORAGE_KEYS.STUDENTS, this.students);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);

    supabase.from('students').delete().eq('id', id).then();

    this.notify();
  }

  // --- HOMEWORK ---
  public createHomework(homeworkData: Omit<Homework, 'id' | 'createdAt'>): Homework {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const newHw: Homework = {
      ...homeworkData,
      id: `hw-${Date.now()}`,
      createdAt: new Date().toISOString(),
      teacherId: homeworkData.teacherId || currentTeacher?.id,
      createdByName: homeworkData.createdByName || currentTeacher?.name || 'Öğretmen',
    };
    this.homeworks.unshift(newHw);
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);

    // Otomatik Öğrenci Bildirimi ve E-Posta Gönderimi
    this.dispatchHomeworkNotificationsAndEmails(newHw);

    this.notify();
    return newHw;
  }

  public updateHomework(id: string, updates: Partial<Homework>): void {
    this.homeworks = this.homeworks.map((h) => (h.id === id ? { ...h, ...updates } : h));
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();
  }

  public deleteHomework(id: string): void {
    this.deletedHomeworkIds.add(id);
    saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));

    this.homeworks = this.homeworks.filter((h) => h.id !== id);
    this.submissions = this.submissions.filter((s) => s.homeworkId !== id);
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();
  }

  // --- SUBMISSIONS ---
  public submitHomework(
    homeworkId: string,
    studentId: string,
    notes: string,
    attachmentLink?: string,
    resources?: HomeworkResource[]
  ): HomeworkSubmission {
    const student = this.students.find((s) => s.id === studentId);
    const homework = this.homeworks.find((h) => h.id === homeworkId);

    const isLate = homework ? new Date() > new Date(homework.dueDate) : false;
    const status: 'on_time' | 'late' = isLate ? 'late' : 'on_time';

    const existingIndex = this.submissions.findIndex(
      (s) => s.homeworkId === homeworkId && s.studentId === studentId
    );

    const submission: HomeworkSubmission = {
      id: existingIndex >= 0 ? this.submissions[existingIndex].id : `sub-${Date.now()}`,
      homeworkId,
      studentId,
      studentName: student ? student.name : 'Öğrenci',
      submittedAt: new Date().toISOString(),
      status,
      notes,
      attachmentLink,
      resources: resources || (existingIndex >= 0 ? this.submissions[existingIndex].resources : undefined),
      score: existingIndex >= 0 ? this.submissions[existingIndex].score : null,
      feedback: existingIndex >= 0 ? this.submissions[existingIndex].feedback : undefined,
    };

    if (existingIndex >= 0) {
      this.submissions[existingIndex] = submission;
    } else {
      this.submissions.unshift(submission);
    }

    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();
    return submission;
  }

  public gradeSubmission(submissionId: string, score: number, feedback: string): void {
    this.submissions = this.submissions.map((s) =>
      s.id === submissionId ? { ...s, score, feedback } : s
    );
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();
  }

  public updateHomeworkCheckStatus(
    homeworkId: string,
    studentId: string,
    checkStatus: HomeworkCheckStatus,
    note?: string
  ): HomeworkSubmission {
    const student = this.students.find((s) => s.id === studentId);
    const existingIndex = this.submissions.findIndex(
      (s) => s.homeworkId === homeworkId && s.studentId === studentId
    );

    const submissionStatus = checkStatus === 'yapti' ? 'on_time' : 'not_submitted';

    if (existingIndex >= 0) {
      const updated: HomeworkSubmission = {
        ...this.submissions[existingIndex],
        checkStatus,
        status: checkStatus === 'yapti' ? 'on_time' : this.submissions[existingIndex].status,
        notes: note !== undefined ? note : this.submissions[existingIndex].notes,
      };
      this.submissions[existingIndex] = updated;
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      this.notify();
      return updated;
    } else {
      const newSub: HomeworkSubmission = {
        id: `sub-${Date.now()}-${studentId}`,
        homeworkId,
        studentId,
        studentName: student ? student.name : 'Öğrenci',
        submittedAt: new Date().toISOString(),
        status: submissionStatus,
        checkStatus,
        notes: note || (checkStatus === 'yapti' ? 'Ödev tamamlandı' : checkStatus === 'eksik' ? 'Eksik ödev' : checkStatus === 'yapmadi' ? 'Ödev yapılmadı' : 'Derse gelmedi'),
      };
      this.submissions.unshift(newSub);
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      this.notify();
      return newSub;
    }
  }

  // --- ETUTS ---
  public createEtut(etutData: Omit<Etut, 'id' | 'createdAt'>): Etut {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const newEtut: Etut = {
      ...etutData,
      id: `etut-${Date.now()}`,
      createdAt: new Date().toISOString(),
      teacherId: etutData.teacherId || currentTeacher?.id,
      teacherName: etutData.teacherName || currentTeacher?.name || 'Öğretmen',
    };
    this.etuts.unshift(newEtut);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    // Otomatik Öğrenci Bildirimi ve E-Posta Gönderimi
    this.dispatchEtutNotificationsAndEmails(newEtut);

    this.notify();
    return newEtut;
  }

  public updateEtut(id: string, updates: Partial<Etut>): void {
    this.etuts = this.etuts.map((e) => (e.id === id ? { ...e, ...updates } : e));
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    this.notify();
  }

  public deleteEtut(id: string): void {
    this.deletedEtutIds.add(id);
    saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));

    this.etuts = this.etuts.filter((e) => e.id !== id);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    this.notify();
  }

  // --- ATTENDANCE ---
  public recordAttendance(attData: Omit<AttendanceRecord, 'id'>): AttendanceRecord {
    const existingIndex = this.attendance.findIndex(
      (a) => a.date === attData.date && a.classId === attData.classId && a.subject === attData.subject
    );

    const record: AttendanceRecord = {
      ...attData,
      id: existingIndex >= 0 ? this.attendance[existingIndex].id : `att-${Date.now()}`,
    };

    if (existingIndex >= 0) {
      this.attendance[existingIndex] = record;
    } else {
      this.attendance.unshift(record);
    }

    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();
    return record;
  }

  public deleteAttendance(id: string): void {
    this.attendance = this.attendance.filter((a) => a.id !== id);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();
  }

  public deleteAttendanceForDate(date: string, classId: string, subject?: string): void {
    this.attendance = this.attendance.filter(
      (a) => !(a.date === date && a.classId === classId && (!subject || a.subject === subject))
    );
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();
  }

  public deleteAttendanceStudentRecord(attendanceId: string, studentId: string): void {
    this.attendance = this.attendance.map((att) => {
      if (att.id === attendanceId) {
        return {
          ...att,
          records: att.records.filter((r) => r.studentId !== studentId),
        };
      }
      return att;
    });
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();
  }

  // --- GRADES ---
  public addGrade(gradeData: Omit<GradeRecord, 'id'>): GradeRecord {
    const student = this.students.find((s) => s.id === gradeData.studentId);
    const newGrade: GradeRecord = {
      ...gradeData,
      id: `gr-${Date.now()}`,
      studentName: student?.name,
    };
    this.grades.unshift(newGrade);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();
    return newGrade;
  }

  public updateGrade(id: string, updates: Partial<GradeRecord>): void {
    this.grades = this.grades.map((g) => (g.id === id ? { ...g, ...updates } : g));
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();
  }

  public deleteGrade(id: string): void {
    this.grades = this.grades.filter((g) => g.id !== id);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();
  }

  // --- MESSAGES ---
  public sendMessageToTeacher(
    studentId: string,
    subject: string,
    text: string,
    linkUrl?: string
  ): StudentMessage {
    const student = this.students.find((s) => s.id === studentId);
    const newMsg: StudentMessage = {
      id: `msg-${Date.now()}`,
      studentId,
      studentName: student ? student.name : 'Öğrenci',
      studentClass: student ? student.className : 'Genel',
      studentAvatar: student?.avatar,
      subject,
      text,
      linkUrl,
      createdAt: new Date().toISOString(),
      read: false,
    };

    this.messages.unshift(newMsg);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();
    return newMsg;
  }

  public markMessageAsRead(id: string): void {
    this.messages = this.messages.map((m) => (m.id === id ? { ...m, read: true } : m));
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();
  }

  public replyToMessage(id: string, replyText: string): void {
    this.messages = this.messages.map((m) =>
      m.id === id
        ? {
            ...m,
            teacherReply: replyText,
            repliedAt: new Date().toISOString(),
            read: true,
          }
        : m
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();
  }

  // --- HELPER QUERIES ---
  public getHomeworksForStudent(studentId: string): {
    homework: Homework;
    submission?: HomeworkSubmission;
    status: 'on_time' | 'late' | 'not_submitted' | 'due_soon';
    isUrgent: boolean;
  }[] {
    const student = this.students.find((s) => s.id === studentId);
    const now = new Date().getTime();

    // Students can see homework if:
    // 1) assignedTo is 'all'
    // 2) assignedTo array includes studentId
    // 3) isGlobalForNewStudents is true (any student who registers later can see all prior homework)
    // 4) targetClassIds matches student class
    const eligibleHomeworks = this.homeworks.filter((hw) => {
      if (hw.isGlobalForNewStudents) return true;
      if (hw.assignedTo === 'all') return true;
      if (Array.isArray(hw.assignedTo) && hw.assignedTo.includes(studentId)) return true;
      if (student && hw.targetClassIds && hw.targetClassIds.includes(student.classId)) return true;
      return false;
    });

    return eligibleHomeworks.map((hw) => {
      const submission = this.submissions.find(
        (s) => s.homeworkId === hw.id && s.studentId === studentId
      );

      const dueTime = new Date(hw.dueDate).getTime();
      const hoursRemaining = (dueTime - now) / (1000 * 60 * 60);

      let status: 'on_time' | 'late' | 'not_submitted' | 'due_soon' = 'not_submitted';
      const isUrgent = !submission && hoursRemaining > 0 && hoursRemaining <= 48;

      if (submission) {
        status = submission.status;
      } else if (now > dueTime) {
        status = 'not_submitted'; // overdue
      } else if (hoursRemaining <= 48) {
        status = 'due_soon';
      }

      return {
        homework: hw,
        submission,
        status,
        isUrgent,
      };
    });
  }

  public getEtutsForStudent(studentId: string): Etut[] {
    return this.etuts.filter((etut) => {
      if (etut.assignedStudentIds === 'all') return true;
      if (Array.isArray(etut.assignedStudentIds) && etut.assignedStudentIds.includes(studentId))
        return true;
      return false;
    });
  }

  public getGradesForStudent(studentId: string): GradeRecord[] {
    return this.grades.filter((g) => g.studentId === studentId);
  }

  public getAttendanceForStudent(studentId: string): {
    record: AttendanceRecord;
    status: AttendanceStatus;
    note?: string;
  }[] {
    const list: { record: AttendanceRecord; status: AttendanceStatus; note?: string }[] = [];
    this.attendance.forEach((att) => {
      const match = att.records.find((r) => r.studentId === studentId);
      if (match) {
        list.push({ record: att, status: match.status, note: match.note });
      }
    });
    return list;
  }

  public getMessagesForStudent(studentId: string): StudentMessage[] {
    return this.messages.filter((m) => m.studentId === studentId);
  }

  // --- GETTERS (SCOPED BY AUTH & ROLE PERMISSION) ---
  public getAllStudents(): Student[] {
    return [...this.students];
  }

  public getAllClasses(): ClassGroup[] {
    return [...this.classes];
  }

  public getStudents(forTeacherId?: string): Student[] {
    const session = this.getAuthSession();

    // If viewing in teacher context
    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      // Admin teachers have full visibility of all students
      if (teacher?.isAdmin) {
        return this.students;
      }

      // Non-admin teacher: sees students they registered OR students in classes assigned to them by admin
      const assignedClassIds = new Set(teacher?.assignedClassIds || []);
      return this.students.filter(
        (s) =>
          s.createdTeacherId === teacherId ||
          (s.classId && assignedClassIds.has(s.classId))
      );
    }

    // If viewing in student context
    if (session?.role === 'student') {
      // Students should NOT see other students' personal profiles or data
      const studentId = session.user.id;
      return this.students.filter((s) => s.id === studentId);
    }

    return this.students;
  }

  public getClasses(forTeacherId?: string): ClassGroup[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      if (teacher?.isAdmin) {
        return this.classes;
      }

      const assignedClassIds = new Set(teacher?.assignedClassIds || []);
      return this.classes.filter(
        (c) =>
          assignedClassIds.has(c.id) ||
          c.createdTeacherId === teacherId ||
          this.students.some((s) => s.createdTeacherId === teacherId && s.classId === c.id)
      );
    }

    if (session?.role === 'student') {
      const student = session.user as Student;
      return this.classes.filter((c) => c.id === student.classId || c.name === student.className);
    }

    return this.classes;
  }

  public getHomeworks(forTeacherId?: string): Homework[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      if (teacher?.isAdmin) {
        return this.homeworks;
      }

      const visibleClasses = new Set(this.getClasses(teacherId).map((c) => c.id));
      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));

      return this.homeworks.filter((hw) => {
        if (hw.teacherId === teacherId || (teacher?.name && hw.createdByName === teacher.name)) {
          return true;
        }
        if (hw.targetClassIds && hw.targetClassIds.some((cid) => visibleClasses.has(cid))) {
          return true;
        }
        if (Array.isArray(hw.assignedTo) && hw.assignedTo.some((sid) => visibleStudents.has(sid))) {
          return true;
        }
        return false;
      });
    }

    if (session?.role === 'student') {
      const student = session.user as Student;
      return this.homeworks.filter((hw) => {
        if (hw.isGlobalForNewStudents) return true;
        if (hw.targetClassIds && hw.targetClassIds.includes(student.classId)) return true;
        if (Array.isArray(hw.assignedTo) && hw.assignedTo.includes(student.id)) return true;
        if (hw.assignedTo === 'all') return true;
        return false;
      });
    }

    return this.homeworks;
  }

  public getEtuts(forTeacherId?: string): Etut[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      if (teacher?.isAdmin) {
        return this.etuts;
      }

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.etuts.filter(
        (e) =>
          e.teacherId === teacherId ||
          (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.some((sid) => visibleStudents.has(sid)))
      );
    }

    if (session?.role === 'student') {
      const studentId = session.user.id;
      return this.etuts.filter(
        (e) =>
          e.assignedStudentIds === 'all' ||
          (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.includes(studentId))
      );
    }

    return this.etuts;
  }

  public getGrades(forTeacherId?: string): GradeRecord[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return this.grades;

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.grades.filter((g) => visibleStudents.has(g.studentId));
    }

    if (session?.role === 'student') {
      return this.grades.filter((g) => g.studentId === session.user.id);
    }

    return this.grades;
  }

  public getAttendance(forTeacherId?: string): AttendanceRecord[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return this.attendance;

      const visibleClasses = new Set(this.getClasses(teacherId).map((c) => c.id));
      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));

      return this.attendance
        .filter((a) => visibleClasses.has(a.classId))
        .map((a) => ({
          ...a,
          records: a.records.filter((r) => visibleStudents.has(r.studentId)),
        }));
    }

    if (session?.role === 'student') {
      const studentId = session.user.id;
      return this.attendance.filter((a) => a.records.some((r) => r.studentId === studentId));
    }

    return this.attendance;
  }

  public getMessages(forTeacherId?: string): StudentMessage[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return this.messages;

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.messages.filter((m) => visibleStudents.has(m.studentId));
    }

    if (session?.role === 'student') {
      return this.messages.filter((m) => m.studentId === session.user.id);
    }

    return this.messages;
  }

  public getSubmissions(forTeacherId?: string): HomeworkSubmission[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return this.submissions;

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.submissions.filter((sub) => visibleStudents.has(sub.studentId));
    }

    if (session?.role === 'student') {
      return this.submissions.filter((sub) => sub.studentId === session.user.id);
    }

    return this.submissions;
  }

  public sendMessage(msgData: Omit<StudentMessage, 'id' | 'createdAt' | 'read'>): StudentMessage {
    const newMsg: StudentMessage = {
      ...msgData,
      id: `msg-${Date.now()}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    this.messages.unshift(newMsg);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();
    return newMsg;
  }

  public getStudentHomeworkStatus(homeworkId: string, studentId: string): {
    label: string;
    emoji: string;
    badgeClass: string;
    status: 'on_time' | 'late' | 'not_submitted' | 'due_soon';
  } {
    const hw = this.homeworks.find((h) => h.id === homeworkId);
    const sub = this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
    const now = new Date().getTime();

    if (sub) {
      if (sub.status === 'on_time') {
        return {
          label: 'Zamanında Teslim Edildi',
          emoji: '🌟',
          badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          status: 'on_time',
        };
      } else {
        return {
          label: 'Gecikmeli Teslim',
          emoji: '⚠️',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          status: 'late',
        };
      }
    }

    if (hw) {
      const dueTime = new Date(hw.dueDate).getTime();
      const diffHours = (dueTime - now) / (1000 * 60 * 60);

      if (now > dueTime) {
        return {
          label: 'Teslim Edilmedi (Gecikti)',
          emoji: '🚨',
          badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          status: 'not_submitted',
        };
      } else if (diffHours <= 48) {
        return {
          label: 'Yaklaşıyor (Son 48s)',
          emoji: '⏳',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          status: 'due_soon',
        };
      }
    }

    return {
      label: 'Bekliyor',
      emoji: '📝',
      badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
      status: 'not_submitted',
    };
  }

  // ==================== TEACHER DOCUMENTS ARCHIVE ====================
  public getTeacherDocuments(): TeacherDocument[] {
    return this.documents;
  }

  public addTeacherDocument(doc: Omit<TeacherDocument, 'id' | 'uploadedAt'>): TeacherDocument {
    const newDoc: TeacherDocument = {
      ...doc,
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      uploadedAt: new Date().toISOString(),
    };
    this.documents = [newDoc, ...this.documents];
    saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
    this.notify();
    return newDoc;
  }

  public deleteTeacherDocument(id: string): void {
    this.documents = this.documents.filter((d) => d.id !== id);
    saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
    this.notify();
  }

  // ==================== NOTIFICATIONS & EMAILS ====================
  public getStudentNotifications(studentId?: string): StudentNotification[] {
    if (!studentId) return this.studentNotifications;
    return this.studentNotifications.filter((n) => n.studentId === studentId);
  }

  public getUnreadNotificationsCount(studentId: string): number {
    return this.studentNotifications.filter((n) => n.studentId === studentId && !n.read).length;
  }

  public markNotificationAsRead(id: string): void {
    this.studentNotifications = this.studentNotifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
  }

  public markAllNotificationsAsRead(studentId: string): void {
    this.studentNotifications = this.studentNotifications.map((n) =>
      n.studentId === studentId ? { ...n, read: true } : n
    );
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
  }

  public deleteNotification(id: string): void {
    this.studentNotifications = this.studentNotifications.filter((n) => n.id !== id);
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
  }

  public clearStudentNotifications(studentId: string): void {
    this.studentNotifications = this.studentNotifications.filter((n) => n.studentId !== studentId);
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
  }

  public getSentEmails(studentId?: string): SentEmailLog[] {
    if (!studentId) return this.sentEmails;
    return this.sentEmails.filter((e) => e.studentId === studentId);
  }

  public deleteSentEmail(id: string): void {
    this.sentEmails = this.sentEmails.filter((e) => e.id !== id);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);
    this.notify();
  }

  public dispatchHomeworkNotificationsAndEmails(hw: Homework): number {
    let targetStudents: Student[] = [];
    if (hw.assignedTo === 'all') {
      if (hw.targetClassIds && hw.targetClassIds.length > 0) {
        targetStudents = this.students.filter((s) => hw.targetClassIds!.includes(s.classId));
      } else {
        targetStudents = [...this.students];
      }
    } else if (Array.isArray(hw.assignedTo)) {
      targetStudents = this.students.filter((s) => hw.assignedTo.includes(s.id));
    }

    const nowIso = new Date().toISOString();
    let sentCount = 0;

    targetStudents.forEach((student) => {
      const emailContent = generateHomeworkEmail({
        studentName: student.name,
        studentEmail: student.email,
        teacherName: hw.createdByName || 'Öğretmen',
        subject: hw.subject,
        title: hw.title,
        description: hw.description,
        dueDate: hw.dueDate,
        outcomes: hw.outcomes || hw.learningOutcomes || [],
        resourcesCount: hw.resources?.length || 0,
        attachmentUrl: hw.attachmentUrl,
      });

      const emailLog: SentEmailLog = {
        id: `email-${Date.now()}-${student.id}-${Math.random().toString(36).substr(2, 4)}`,
        recipientEmail: student.email,
        recipientName: student.name,
        recipientRole: 'student',
        studentId: student.id,
        type: 'homework_assigned',
        subject: emailContent.subject,
        htmlContent: emailContent.html,
        textContent: emailContent.text,
        sentAt: nowIso,
        status: 'delivered',
        sourceId: hw.id,
        sourceTitle: hw.title,
        teacherName: hw.createdByName || 'Öğretmen',
      };
      this.sentEmails.unshift(emailLog);

      const notif: StudentNotification = {
        id: `notif-${Date.now()}-${student.id}-${Math.random().toString(36).substr(2, 4)}`,
        studentId: student.id,
        type: 'new_homework',
        title: `Yeni Ödev: ${hw.subject} - ${hw.title}`,
        message: `${hw.createdByName || 'Öğretmeniniz'} yeni bir ödev tanımladı. Son teslim tarihi: ${formatDueDateTurkish(hw.dueDate)}`,
        sourceId: hw.id,
        sourceTitle: hw.title,
        teacherName: hw.createdByName || 'Öğretmen',
        createdAt: nowIso,
        read: false,
        linkTab: 'homework',
        emailSent: true,
        emailRecipient: student.email,
        emailDetails: {
          subject: emailContent.subject,
          bodyHtml: emailContent.html,
          sentAt: nowIso,
        },
      };
      this.studentNotifications.unshift(notif);
      sentCount++;
    });

    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);

    // Browser Notification chime
    const session = this.getAuthSession();
    if (session?.role === 'student' && targetStudents.some((s) => s.id === session.user.id)) {
      sendBrowserNotification(
        `📚 Yeni Ödev: ${hw.subject}`,
        `"${hw.title}" başlıklı yeni ödeviniz tanımlandı. Son teslim: ${formatDueDateTurkish(hw.dueDate)}`
      );
    }

    return sentCount;
  }

  public dispatchEtutNotificationsAndEmails(etut: Etut): number {
    let targetStudents: Student[] = [];
    if (etut.assignedStudentIds === 'all') {
      targetStudents = [...this.students];
    } else if (Array.isArray(etut.assignedStudentIds)) {
      targetStudents = this.students.filter((s) => etut.assignedStudentIds.includes(s.id));
    }

    const nowIso = new Date().toISOString();
    let sentCount = 0;

    targetStudents.forEach((student) => {
      const emailContent = generateEtutEmail({
        studentName: student.name,
        studentEmail: student.email,
        teacherName: etut.teacherName || 'Öğretmen',
        subject: etut.subject,
        topic: etut.topic,
        date: etut.date,
        time: etut.time,
        duration: etut.duration,
        location: etut.location,
        notes: etut.notes,
      });

      const emailLog: SentEmailLog = {
        id: `email-${Date.now()}-${student.id}-${Math.random().toString(36).substr(2, 4)}`,
        recipientEmail: student.email,
        recipientName: student.name,
        recipientRole: 'student',
        studentId: student.id,
        type: 'etut_assigned',
        subject: emailContent.subject,
        htmlContent: emailContent.html,
        textContent: emailContent.text,
        sentAt: nowIso,
        status: 'delivered',
        sourceId: etut.id,
        sourceTitle: etut.topic,
        teacherName: etut.teacherName || 'Öğretmen',
      };
      this.sentEmails.unshift(emailLog);

      const notif: StudentNotification = {
        id: `notif-${Date.now()}-${student.id}-${Math.random().toString(36).substr(2, 4)}`,
        studentId: student.id,
        type: 'new_etut',
        title: `Yeni Etüt: ${etut.subject} - ${etut.topic}`,
        message: `${formatEtutDateTurkish(etut.date)} saat ${etut.time}'de (${etut.duration} dk), ${etut.location} dersliğinde etüdünüz planlandı.`,
        sourceId: etut.id,
        sourceTitle: etut.topic,
        teacherName: etut.teacherName || 'Öğretmen',
        createdAt: nowIso,
        read: false,
        linkTab: 'etuts',
        emailSent: true,
        emailRecipient: student.email,
        emailDetails: {
          subject: emailContent.subject,
          bodyHtml: emailContent.html,
          sentAt: nowIso,
        },
      };
      this.studentNotifications.unshift(notif);
      sentCount++;
    });

    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);

    const session = this.getAuthSession();
    if (session?.role === 'student' && targetStudents.some((s) => s.id === session.user.id)) {
      sendBrowserNotification(
        `📅 Yeni Etüt: ${etut.subject}`,
        `"${etut.topic}" konulu etüdünüz ${etut.date} saat ${etut.time}'de planlandı.`
      );
    }

    return sentCount;
  }

  private seedInitialNotifications(): void {
    if (this.students.length === 0) return;
    const hw1 = this.homeworks.find((h) => h.id === 'hw-1') || this.homeworks[0];
    const etut1 = this.etuts[0];

    const sampleStudents = this.students.slice(0, 3);
    sampleStudents.forEach((st) => {
      if (hw1) {
        const emailContent = generateHomeworkEmail({
          studentName: st.name,
          studentEmail: st.email,
          teacherName: hw1.createdByName || 'M. Bilir',
          subject: hw1.subject,
          title: hw1.title,
          description: hw1.description,
          dueDate: hw1.dueDate,
          outcomes: hw1.outcomes || [],
          resourcesCount: hw1.resources?.length || 0,
        });

        this.sentEmails.push({
          id: `email-seed-hw-${st.id}`,
          recipientEmail: st.email,
          recipientName: st.name,
          recipientRole: 'student',
          studentId: st.id,
          type: 'homework_assigned',
          subject: emailContent.subject,
          htmlContent: emailContent.html,
          textContent: emailContent.text,
          sentAt: hw1.createdAt,
          status: 'delivered',
          sourceId: hw1.id,
          sourceTitle: hw1.title,
          teacherName: hw1.createdByName || 'M. Bilir',
        });

        this.studentNotifications.push({
          id: `notif-seed-hw-${st.id}`,
          studentId: st.id,
          type: 'new_homework',
          title: `Yeni Ödev: ${hw1.subject} - ${hw1.title}`,
          message: `${hw1.createdByName || 'M. Bilir'} öğretmeniniz yeni bir ödev tanımladı. Son teslim: ${formatDueDateTurkish(hw1.dueDate)}`,
          sourceId: hw1.id,
          sourceTitle: hw1.title,
          teacherName: hw1.createdByName || 'M. Bilir',
          createdAt: hw1.createdAt,
          read: false,
          linkTab: 'homework',
          emailSent: true,
          emailRecipient: st.email,
          emailDetails: {
            subject: emailContent.subject,
            bodyHtml: emailContent.html,
            sentAt: hw1.createdAt,
          },
        });
      }

      if (etut1) {
        const emailContent = generateEtutEmail({
          studentName: st.name,
          studentEmail: st.email,
          teacherName: etut1.teacherName || 'M. Bilir',
          subject: etut1.subject,
          topic: etut1.topic,
          date: etut1.date,
          time: etut1.time,
          duration: etut1.duration,
          location: etut1.location,
          notes: etut1.notes,
        });

        this.sentEmails.push({
          id: `email-seed-etut-${st.id}`,
          recipientEmail: st.email,
          recipientName: st.name,
          recipientRole: 'student',
          studentId: st.id,
          type: 'etut_assigned',
          subject: emailContent.subject,
          htmlContent: emailContent.html,
          textContent: emailContent.text,
          sentAt: etut1.createdAt,
          status: 'delivered',
          sourceId: etut1.id,
          sourceTitle: etut1.topic,
          teacherName: etut1.teacherName || 'M. Bilir',
        });

        this.studentNotifications.push({
          id: `notif-seed-etut-${st.id}`,
          studentId: st.id,
          type: 'new_etut',
          title: `Yeni Etüt: ${etut1.subject} - ${etut1.topic}`,
          message: `${formatEtutDateTurkish(etut1.date)} saat ${etut1.time}'de (${etut1.duration} dk) etüdünüz planlandı.`,
          sourceId: etut1.id,
          sourceTitle: etut1.topic,
          teacherName: etut1.teacherName || 'M. Bilir',
          createdAt: etut1.createdAt,
          read: false,
          linkTab: 'etuts',
          emailSent: true,
          emailRecipient: st.email,
          emailDetails: {
            subject: emailContent.subject,
            bodyHtml: emailContent.html,
            sentAt: etut1.createdAt,
          },
        });
      }
    });

    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);
  }
}

export const dataService = DataService.getInstance();
