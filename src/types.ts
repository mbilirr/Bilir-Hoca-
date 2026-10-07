export type UserRole = 'teacher' | 'student';
export type SystemRole = 'admin' | 'teacher' | 'student';
export type UserStatus = 'active' | 'approved' | 'pending' | 'suspended' | 'rejected' | 'inactive';

export type TeacherTabType =
  | 'home'
  | 'students'
  | 'homework'
  | 'etuts'
  | 'grades'
  | 'messages'
  | 'archive'
  | 'question_tracking'
  | 'user_management';

export interface Teacher {
  id: string;
  auth_user_id?: string;
  name: string;
  username: string;
  password?: string;
  email: string;
  branch?: string; // e.g., Matematik, Fizik, Türkçe vb.
  phone?: string;
  avatar?: string;
  createdAt: string;
  role: 'teacher';
  status?: 'pending' | 'approved' | 'rejected' | 'suspended';
  isSuspended?: boolean; // Hesabın yönetici tarafından geçici olarak dondurulması
  isAdmin?: boolean; // Kurum Yöneticisi / Admin yetkisi (tüm sınıfları ve öğrencileri görebilir)
  assignedClassIds?: string[]; // Admin tarafından izin verilen sınıfların ID listesi
  canViewAllStudentsAndClasses?: boolean; // Yöneticinin önceden eklenmiş sınıf ve öğrenci listelerini görme izni vermesi
  kurumId?: string | null; // Aşama 18: bağlı olduğu kurum (genel yöneticinin öğretmenleri için boş)
}

export interface AuthSession {
  role: UserRole;
  user: Teacher | Student;
}

export interface Student {
  id: string;
  auth_user_id?: string;
  name: string;
  username: string;
  email?: string;
  password?: string;
  classId: string;
  className: string;
  schoolLevel?: 'Ortaokul' | 'Lise';
  gradeLevel?: string;
  branch?: string;
  studentNumber?: string;
  phone?: string;
  avatar?: string;
  createdAt: string;
  status: 'active' | 'inactive' | 'suspended';
  isSuspended?: boolean; // Hesabın dondurulması / askıya alınması
  createdTeacherId?: string; // Bu öğrenciyi kaydeden öğretmenin ID'si
  mustChangePassword?: boolean; // İlk girişte zorunlu şifre güncelleme bayrağı
  authorizedTeacherIds?: string[]; // Yönetici tarafından yetkilendirilen öğretmenlerin ID listesi
  kurumId?: string | null; // Aşama 18: öğrencinin kurumu (genel yöneticinin öğrencileri için boş)
}

export interface UnifiedUser {
  id: string;
  auth_user_id?: string;
  name: string;
  username: string;
  email?: string;
  phone?: string;
  avatar?: string;
  role: SystemRole;
  status: UserStatus;
  isSuspended?: boolean;
  createdAt: string;
  password?: string;
  // Öğretmen / Yönetici alanları
  branch?: string;
  isAdmin?: boolean;
  assignedClassIds?: string[];
  canViewAllStudentsAndClasses?: boolean;
  // Öğrenci alanları
  className?: string;
  classId?: string;
  studentNumber?: string;
  schoolLevel?: 'Ortaokul' | 'Lise';
  gradeLevel?: string;
  mustChangePassword?: boolean;
  authorizedTeacherIds?: string[];
  kurumId?: string | null;
}

export interface ClassGroup {
  id: string;
  name: string;
  schoolLevel?: 'Ortaokul' | 'Lise';
  gradeLevel?: string;
  branch: string;
  academicYear: string;
  description?: string;
  createdTeacherId?: string; // Sınıfı oluşturan öğretmenin ID'si
  authorizedTeacherIds?: string[]; // Yönetici tarafından yetkilendirilen öğretmenlerin ID listesi
  kurumId?: string | null; // Aşama 18: sınıfı açan kurum (genel yöneticinin sınıfları için boş)
}

export type HomeworkResourceType = 'video' | 'link' | 'pdf' | 'image';

export interface HomeworkResource {
  id: string;
  type: HomeworkResourceType;
  title: string;
  url: string; // Bağlantı, YouTube/Vimeo adresi, depo dosyası (storage://...) veya eski kayıt içi dosya (data:...)
  fileSize?: string;
  description?: string;
  fileName?: string;
}

export interface Homework {
  id: string;
  title: string;
  subject: string;
  outcomes?: string[]; // Kazanımlar
  learningOutcomes?: string[];
  description: string;
  dueDate: string; // ISO or YYYY-MM-DDTHH:mm
  createdAt?: string;
  assignedDate?: string;
  assignedTo?: 'all' | string[]; // 'all' or student IDs
  targetClassIds?: string[]; // Target class IDs (if class-scoped)
  attachmentUrl?: string;
  schoolLevel?: 'Ortaokul' | 'Lise';
  resources?: HomeworkResource[]; // Video, Internet Link, and PDF resources
  isGlobalForNewStudents?: boolean; // Bir öğrenci sonradan kayıt olmuş ise daha önceki ödevleri de görebilir
  createdByName?: string;
  teacherId?: string; // Ödevi oluşturan öğretmen ID'si
  teacherName?: string;
  teacherAuthId?: string; // Ödevin sahibi olan giriş hesabı (veritabanında yetki kontrolü bununla yapılır)
  classId?: string;
  submissions?: HomeworkSubmission[];
  updatedAt?: string;
}

export type HomeworkCheckStatus = 'yapti' | 'yapmadi' | 'eksik' | 'izinli' | 'gelmedi';

export interface HomeworkSubmission {
  id: string;
  homeworkId: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  status: 'on_time' | 'late' | 'not_submitted';
  checkStatus?: HomeworkCheckStatus;
  notes: string;
  attachmentLink?: string;
  resources?: HomeworkResource[]; // Student solution PDF, video or links
  score?: number | null;
  feedback?: string;
}

export interface EtutStudentAttendance {
  studentId?: string;
  studentName?: string;
  status: AttendanceStatus;
  note?: string;
  topic?: string; // Aşama 23: bu öğrenciye etüt konusundan farklı anlatılan konu (yalnız öğretmenler görür)
  markedBy?: string;
  markedAt?: string;
  updatedAt?: string;
}

export interface Etut {
  id: string;
  subject: string;
  topic: string;
  schoolLevel?: 'Ortaokul' | 'Lise';
  gradeLevel?: string;
  lessonPeriod?: string; // e.g., 'Ders', '1. Ders', '2. Ders', ..., '8. Ders'
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  duration: number; // minutes
  assignedStudentIds: 'all' | string[];
  location: string;
  notes?: string;
  teacherFeedback?: string; // Etüt veren öğretmenin etüt hakkında veya öğrenci hakkında isteğe bağlı düşünce ve görüşleri
  createdAt: string;
  teacherId?: string; // Etütü oluşturan veya atanan öğretmen ID'si
  teacherName?: string;
  teacherIds?: string[]; // Aşama 14: etüde birden çok öğretmen atanabilir (ilk sıradaki teacherId ile aynıdır)
  teacherNames?: string[];
  teacherBranch?: string;
  studentAttendance?: Record<string, EtutStudentAttendance>; // Öğrenci ID -> Katılım Durumu
  attendanceTakenBy?: { name?: string; at?: string; via?: string }; // Aşama 16: yoklamayı kim aldı (e-posta bağlantısıyla dahil)
  createdById?: string; // Etüdü kaydeden öğretmen (Aşama 9)
  createdByName?: string;
  recurrenceGroupId?: string; // Tekrarlayan etütlerde ortak kimlik
  mailMode?: 'scheduled' | 'off'; // Aşama 19: 'scheduled' = e-posta etüt gününde otomatik gider, 'off' = e-posta gitmez; boşsa kaydedilirken gider
}

export interface WeeklyQuestionTarget {
  id?: string;
  targetType?: 'student' | 'class'; // 'student' (öğrenci hedefi) veya 'class' (sınıf hedefi)
  studentId?: string;
  studentName?: string;
  classId?: string;
  className?: string;
  targetDays?: number; // Hedef gün sayısı (Varsayılan: 7 gün, veya 1, 3, 5, 10, 14, 21, 30 vb.)
  targetPeriodLabel?: string; // Örn: 'Haftalık (7 Gün)', '3 Günlük', '14 Günlük'
  weeklyTarget?: number; // Toplam soru hedefi (Örn: 500)
  targetQuestions?: number; // Soru sayısı hedefi
  dailyTarget?: number; // Günlük ortalama (Örn: 70)
  assignedByTeacherId?: string;
  assignedByTeacherName?: string;
  assignedBy?: string;
  assignedDate?: string;
  weekStartDate?: string;
  weekEndDate?: string;
  subjectTargets?: Record<string, number> | { subject: string; target: number }[];
  notes?: string;
  subject?: string; // Aşama 10: yalnızca bu dersin soruları sayılır (boş = tüm dersler)
  createdBy?: string; // Aşama 10: hedefi kaydeden hesabın (auth) kimliği — veritabanındaki created_by
}

export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late';

export interface AttendanceRecord {
  id: string;
  date: string;
  classId: string;
  subject: string;
  records: {
    studentId: string;
    studentName?: string;
    status: AttendanceStatus;
    note?: string;
  }[];
}

export interface GradeRecord {
  id: string;
  studentId: string;
  studentName?: string;
  classId: string;
  subject: string;
  examType: string; // '1. Yazılı', '2. Yazılı', 'Performans', 'Ödev Notu', 'Deneme'
  score: number;
  maxScore?: number;
  date: string;
  remarks?: string;
}

export interface StudentMessage {
  id: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  studentAvatar?: string;
  subject: string;
  text: string;
  linkUrl?: string;
  createdAt: string;
  read: boolean;
  teacherReply?: string;
  repliedAt?: string;
}

export interface NotificationItem {
  id: string;
  type: 'deadline_urgent' | 'deadline_approaching' | 'new_homework' | 'new_etut' | 'new_message' | 'grade_added';
  title: string;
  message: string;
  date: string;
  linkTab?: string;
  read: boolean;
}

export interface StudentNotification {
  id: string;
  studentId: string;
  type: 'new_homework' | 'new_etut' | 'grade_added' | 'general' | 'praise';
  title: string;
  message: string;
  sourceId?: string; // homeworkId or etutId or praiseDate
  sourceTitle?: string;
  teacherName?: string;
  createdAt: string;
  read: boolean;
  linkTab?: 'home' | 'homework' | 'etuts' | 'grades' | 'messages' | 'questions';
  emailSent?: boolean;
  emailRecipient?: string;
  emailDetails?: {
    subject: string;
    bodyHtml: string;
    sentAt: string;
  };
}

export interface SentEmailLog {
  id: string;
  recipientEmail: string;
  recipientName: string;
  recipientRole: 'student';
  studentId: string;
  type: 'homework_assigned' | 'etut_assigned' | 'student_welcome';
  subject: string;
  htmlContent: string;
  textContent: string;
  sentAt: string;
  status: 'sent' | 'delivered';
  sourceId?: string;
  sourceTitle: string;
  teacherName: string;
}

export type DocumentCategory =
  | 'yearly_plan' // Yıllık Ders Planları
  | 'weekly_plan' // Haftalık Ders Planları
  | 'lesson_plan' // (Geriye dönük uyumluluk için ders planları)
  | 'sample_exam' // Örnek Yazılılar & Deneme Sınavları
  | 'meeting_minutes' // Zümre Tutanakları & Kurul Kararları
  | 'curriculum' // MEB Müfredat ve Kazanım Çizelgeleri
  | 'other';

export interface TeacherDocument {
  id: string;
  title: string;
  description?: string;
  category: DocumentCategory;
  fileFormat: 'pdf' | 'docx' | 'xlsx';
  fileName: string;
  fileSize: string;
  fileData?: string; // Base64 data URL for download / direct preview
  uploadedAt: string;
  uploadedBy: string;
  authorName?: string;
  academicYear?: string;
  schoolType?: 'Ortaokul' | 'Lise' | 'Diğer';
  subject: string;
  gradeLevel?: string;
  tags?: string[];
  htmlPreview?: string; // Formatted HTML for docx preview
  tableSheets?: Array<{
    name: string;
    rows: Array<Array<string | number>>;
  }>; // Formatted table rows for Excel preview
  storagePath?: string; // Dosya deposundaki yolu (Aşama 5). Yoksa eski (gömülü) belgedir.
  ownerAuthId?: string; // Belgeyi yükleyen öğretmenin hesap kimliği (silme/düzenleme yetkisi için)
}

export interface ExtractedOutcomeItem {
  id: string;
  code: string; // e.g. "M.12.1.1"
  topic: string; // e.g. "Türev ve Uygulamaları"
  outcome: string; // e.g. "Bir fonksiyonun bir noktadaki türevini hesaplar..."
  subject: string;
  gradeLevel?: string;
  week?: string;
}

export interface QuestionLogSubjectEntry {
  subject: string; // e.g., 'Matematik', 'Türkçe', 'Fizik', 'Kimya', 'Biyoloji', 'Geometri', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'İngilizce'
  questionCount: number;
  correctCount?: number;
  wrongCount?: number;
  emptyCount?: number;
  topic?: string;
}

export interface StudentQuestionLog {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  date: string; // YYYY-MM-DD
  entries: QuestionLogSubjectEntry[];
  totalQuestions: number;
  totalCorrect?: number;
  totalWrong?: number;
  totalEmpty?: number;
  notes?: string;
  createdAt: string;
}



// =========================================================================
// GİRİŞ HESAPLARI VE KAYIT BAŞVURULARI (Aşama 3)
// =========================================================================
export interface StudentAccountInput {
  name: string;
  studentNumber: string; // Öğrencinin giriş adı
  classId: string;
  email?: string;
  phone?: string;
  avatar?: string;
  schoolLevel?: 'Ortaokul' | 'Lise';
  gradeLevel?: string;
  branch?: string;
  password?: string; // Boşsa rastgele şifre üretilir
}

// Yeni açılan veya şifresi yenilenen hesabın giriş bilgisi (şifre YALNIZCA bu an gösterilir, saklanmaz)
export interface StudentCredential {
  student: Student;
  password: string;
}

export interface StudentAccountFailure {
  name: string;
  studentNumber: string;
  error: string;
}

export interface StudentAccountResult {
  created: StudentCredential[];
  failed: StudentAccountFailure[];
}

export interface StudentApplication {
  id: string;
  name: string;
  studentNumber: string;
  classId?: string;
  requestedClass?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectReason?: string;
  studentId?: string;
  createdAt: string;
  reviewedAt?: string;
}

// Aşama 18: genel yöneticinin kurumlara açtığı bölümler
export type KurumModule =
  | 'homework'
  | 'etut'
  | 'questions'
  | 'grades'
  | 'messages'
  | 'archive'
  | 'manage_students'
  | 'manage_teachers';

export interface KurumInfo {
  id: string;
  name: string;
  modules: Partial<Record<KurumModule, boolean>>;
  grantedClassIds: string[];
  createdAt?: string;
}
