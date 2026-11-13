import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { usePagedList, ShowMoreBar } from '../../lib/listPaging';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Crown,
  GraduationCap,
  Briefcase,
  Search,
  Filter,
  RefreshCw,
  Edit,
  Key,
  Trash2,
  Ban,
  Play,
  Copy,
  Check,
  X,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Sparkles,
  Phone,
  Mail,
  School,
  ArrowRight,
  Shield,
  CheckCircle2,
  UserPlus,
  BadgeCheck,
  FileSpreadsheet, // Aşama 144
  Send,
  VenusAndMars,
} from 'lucide-react';
import { UnifiedUser, SystemRole, UserStatus, Teacher, ClassGroup, Student, StudentCredential } from '../../types';
import { canSendCredentials, useMyGrantCred } from '../../lib/grantCred'; // Aşama 149
import { dataService } from '../../services/dataService';
import { StudentApplicationsPanel } from './StudentApplicationsPanel';
import { CompactRow, InfoTip } from '../ui/Compact'; // Aşama 182
import { callMail, describeMailResult } from '../../lib/mailApi';
import { FieldLabel, MailOptIn, SelectBox } from '../Teacher/FormParts'; // Aşama 236: FieldLabel, SelectBox
import { ROLE_DEFS, ROLE_BY_CODE, roleLabel, saveTeacherRoles, fetchTeacherRoles, onTeacherRolesSaved, sortRoles, roleFromBranch, type TeacherRole } from '../../lib/teacherRoles';
import { EMPTY_GRADES, classesCoveredBy, fetchTeacherGrades, gradeOptionsFrom, gradesLabel, saveTeacherGrades, type TeacherGrades } from '../../lib/teacherGrades';
import { GradeTicks, secimCls } from './GradeTicks'; // Aşama 236: secimCls
import { YetkilerAcici } from './YetkilerModal'; // Aşama 143
import { lazyNamed } from '../../lib/lazyLoad'; // Aşama 144
import { fetchTeacherContacts, saveTeacherContact, type TeacherContact } from '../../lib/teacherContacts'; // Aşama 144
import { normalizeTurkishPhone, PHONE_ERROR, trFold } from '../../lib/importNormalize';
import { birthDateLabel } from '../../lib/teacherImport';
import { profilResmi, ogretmenProfilRol } from '../../lib/profilResmi';
// Aşama 144: Excel ile toplu öğretmen ekleme (xlsx kütüphanesi yalnız pencere açılınca yüklenir)
const TeacherExcelUploadModal = lazyNamed(() => import('./TeacherExcelUploadModal'), 'TeacherExcelUploadModal');
// Aşama 171: cinsiyeti addan doldur (ad listesi yalnız açılınca iner)
const CinsiyetDoldurModal = lazyNamed(() => import('./CinsiyetDoldurModal'), 'CinsiyetDoldurModal');
const TeacherCredentialSendModal = lazyNamed(() => import('./TeacherCredentialSendModal'), 'TeacherCredentialSendModal');
// Aşama 149: Yönetim › Öğrenciler — öğrencilere giriş bilgisi (pencereler yalnız açılınca yüklenir)
const StudentCredentialPickModal = lazyNamed(() => import('./StudentCredentialPickModal'), 'StudentCredentialPickModal');
const CredentialSendModal = lazyNamed(() => import('../Common/CredentialSendModal'), 'CredentialSendModal');
const StudentWelcomeCredentialsModal = lazyNamed(() => import('../Teacher/StudentWelcomeCredentialsModal'), 'StudentWelcomeCredentialsModal');

// Aşama 107: rolü gereği kurumdaki tüm öğrencileri gören unvanlar (veritabanındaki role_wide_view / kurum yöneticisi ile aynı)
const WIDE_ROLES: TeacherRole[] = ['mudur', 'mudur_yardimcisi', 'rehberlik', 'olcme_degerlendirme'];
const wideRoleText = (rs: TeacherRole[]) => sortRoles(rs).map((r) => ROLE_BY_CODE[r as TeacherRole]?.label || r).join(' / ');
import { useAutoDismiss, NOTICE_HIDE_MS } from '../../lib/useAutoDismiss';
import { appCopyFallback } from '../../lib/appDialog'; // Aşama 105
import { matchTurkishSearch } from '../../utils/turkishSearch';
import { Modal, OverlayLayer } from '../ui/kit'; // Aşama 191 · Aşama 236: Modal

// Aşama 11: öğretmen hesabındaki değişiklikleri öğretmene e-postayla bildirir (alıcıyı sunucu bulur)
type TeacherMailKind = 'created' | 'updated' | 'access' | 'role' | 'suspended' | 'reactivated';
const isTeacherAccount = (u?: UnifiedUser | null) => !!u && u.role !== 'student';
async function notifyTeacherByMail(
  teacherId: string,
  kind: TeacherMailKind,
  extra: { changes?: Array<{ label: string; value: string; login?: boolean }>; password?: string; previousEmail?: string } = {}
) {
  const r = await callMail('teacher-account', { teacherId, kind, ...extra });
  return describeMailResult(r);
}
const toastType = (tone: string): 'success' | 'error' | 'info' => (tone === 'success' ? 'success' : tone === 'danger' ? 'error' : 'info');

interface AdminUserManagementProps {
  currentAdmin?: Teacher | null;
  onNavigateHome?: () => void;
  /**
   * Aşama 143 (Yönetim sayfası): liste bir kuruma ('merkez' = kurumsuz kayıtlarınız) ve bir türe (öğretmen / öğrenci) kilitlenir;
   * embedded iken büyük başlık, sayı kartları ve hızlı süzgeç düğmeleri gizlenir (Yönetim sayfası kendi başlığını gösterir).
   */
  kurumLock?: string;
  roleLock?: 'teacher' | 'student';
  embedded?: boolean;
  roleSettings?: { rehberlik_ogrenci_ekle?: boolean; olcme_ogrenci_ekle?: boolean } | null;
}

export const AdminUserManagement: React.FC<AdminUserManagementProps> = ({
  currentAdmin,
  onNavigateHome,
  kurumLock,
  roleLock,
  embedded = false,
  roleSettings,
}) => {
  // Data states
  const [users, setUsers] = useState<UnifiedUser[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | SystemRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  // Aşama 18: genel yönetici için kurum süzgeci ('' = tümü, 'merkez' = kurumsuz)
  // Aşama 97: genel yönetici listeyi önce kendi (kurumsuz) kayıtlarıyla görür; kurumlar süzgeçten seçilir
  const [kurumFilter, setKurumFilter] = useState<string>(() => kurumLock ?? (dataService.isHeadAdmin() ? 'merkez' : ''));
  useEffect(() => {
    if (kurumLock !== undefined) setKurumFilter(kurumLock);
  }, [kurumLock]);
  const [yetkiTeacherId, setYetkiTeacherId] = useState<string | null>(null); // Aşama 143

  // Modal states
  const [editModalUser, setEditModalUser] = useState<UnifiedUser | null>(null);
  const [roleModalUser, setRoleModalUser] = useState<UnifiedUser | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<UnifiedUser | null>(null);
  const [suspendModalUser, setSuspendModalUser] = useState<UnifiedUser | null>(null);
  const [authModalTeacher, setAuthModalTeacher] = useState<UnifiedUser | null>(null);
  const [selectedAuthClassIds, setSelectedAuthClassIds] = useState<string[]>([]);
  const [selectedAuthStudentIds, setSelectedAuthStudentIds] = useState<string[]>([]);
  const [authStudentSearch, setAuthStudentSearch] = useState('');
  // Aşama 102: görebileceği kademeler (kademedeki sınıflar listede kilitli işaretli görünür)
  const [authGrades, setAuthGrades] = useState<TeacherGrades>(EMPTY_GRADES);
  const [authGradesMissing, setAuthGradesMissing] = useState(false);

  // Edit form state
  const [editFormData, setEditFormData] = useState<{
    name: string;
    username: string;
    email: string;
    phone: string;
    birthDate: string; // Aşama 144 (yalnız öğretmen)
    gender: '' | 'K' | 'E'; // Aşama 171
    branch: string;
    classId: string;
    className: string;
    studentNumber: string;
    schoolLevel: 'Ortaokul' | 'Lise';
    newPassword: string;
    mustChangePassword: boolean;
  }>({
    name: '',
    username: '',
    email: '',
    phone: '',
    birthDate: '',
    gender: '',
    branch: '',
    classId: '',
    className: '',
    studentNumber: '',
    schoolLevel: 'Ortaokul',
    newPassword: '',
    mustChangePassword: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [editPwOpen, setEditPwOpen] = useState(false); // Aşama 182: şifre satırı kapalı başlar
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [selectedTargetRole, setSelectedTargetRole] = useState<SystemRole>('teacher');
  const [isCreateTeacherOpen, setIsCreateTeacherOpen] = useState(false);
  const [isExcelTeacherOpen, setIsExcelTeacherOpen] = useState(false); // Aşama 144
  const [isGenderFillOpen, setIsGenderFillOpen] = useState(false); // Aşama 171
  const [isCredSendOpen, setIsCredSendOpen] = useState(false); // Aşama 144: giriş bilgisi SMS / e-posta
  // Aşama 149: öğrencilere giriş bilgisi (Yönetim › Öğrenciler): toplu seçim penceresi / tek öğrenci / yeni şifreler
  const [stuPickOpen, setStuPickOpen] = useState(false);
  const [stuSendOne, setStuSendOne] = useState<Student | null>(null);
  const [stuNewCreds, setStuNewCreds] = useState<StudentCredential[] | null>(null);
  const grantCredOn = useMyGrantCred();
  const canSendStudentCreds = dataService.isHeadAdmin() || dataService.canEditStudents();
  const studentById = useMemo(() => {
    if (roleLock === 'teacher') return new Map<string, Student>();
    return new Map(dataService.getAllStudents().map((s) => [s.id, s] as const));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, roleLock]);
  const [notifyTeacher, setNotifyTeacher] = useState(true);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, NOTICE_HIDE_MS); // Aşama 32: 15 sn
  };

  const sendTeacherMail = async (teacherId: string, kind: TeacherMailKind, extra?: Parameters<typeof notifyTeacherByMail>[2]) => {
    const res = await notifyTeacherByMail(teacherId, kind, extra);
    showToast(`E-posta: ${res.text}`, toastType(res.tone));
  };

  const loadData = () => {
    const list = dataService.getAllUnifiedUsers();
    setUsers(list);
    setClasses(dataService.getAllClasses());
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(() => {
      loadData();
    });
    return () => unsub();
  }, []);

  // Aşama 180: listedeki "N sınıf · N öğrenci" etiketi veritabanındaki yetki tablolarından okunur
  // (eskiden yalnız bu cihazda tutulan bir listeden geliyordu; başka cihazda ya da yenilemeden sonra yanlış görünüyordu)
  const [accessCounts, setAccessCounts] = useState<Map<string, { classes: number; students: number }>>(() => new Map());
  const reloadAccessCounts = () => {
    dataService
      .getTeacherAccessCounts()
      .then(setAccessCounts)
      .catch(() => {}); // okunamazsa etiket gösterilmez
  };
  useEffect(() => {
    reloadAccessCounts();
  }, []);

  // Aşama 100: öğretmenin unvanları (teacher_roles) "Mevcut Rolü" sütununda görünür; rol verilince anında güncellenir
  const [unvanlar, setUnvanlar] = useState<Map<string, TeacherRole[]>>(() => new Map());
  useEffect(() => {
    let alive = true;
    fetchTeacherRoles()
      .then((m) => alive && setUnvanlar(m))
      .catch(() => {}); // rol tabloları yoksa sütun eskisi gibi kalır
    const off = onTeacherRolesSaved((teacherId, saved) =>
      setUnvanlar((prev) => {
        const next = new Map(prev);
        if (saved.length) next.set(teacherId, saved);
        else next.delete(teacherId);
        return next;
      })
    );
    return () => {
      alive = false;
      off();
    };
  }, []);

  // Aşama 144: öğretmen telefonu ve doğum tarihi (korumalı tablo; yalnız yönetici okur, tek sorgu)
  const [contacts, setContacts] = useState<Map<string, TeacherContact>>(() => new Map());
  const reloadContacts = (force = false) => {
    if (roleLock === 'student' || !dataService.canManageTeachers()) return;
    fetchTeacherContacts(force)
      .then(setContacts)
      .catch(() => {}); // SQL 144 kurulmamışsa liste eskisi gibi
  };
  useEffect(() => {
    reloadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const phoneOf = (u: UnifiedUser) => (u.role !== 'student' && contacts.get(u.id)?.phone) || u.phone || '';
  const birthOf = (u: UnifiedUser) => (u.role !== 'student' ? contacts.get(u.id)?.birthDate || '' : '');
  // Giriş bilgisi gönderilebilecek öğretmenler: seçili kurum kapsamındaki yönetici olmayan öğretmenler (yalnız pencere açıkken hesaplanır)
  const credTeachers = useMemo(() => {
    if (!isCredSendOpen) return [];
    const me = dataService.getCurrentTeacher()?.id;
    return users
      .filter((u) => u.role === 'teacher' && u.id !== me && !(u.isSuspended || u.status === 'suspended'))
      .filter((u) => (kurumFilter === 'merkez' ? !u.kurumId : kurumFilter ? u.kurumId === kurumFilter : true))
      .map((u) => ({ id: u.id, name: u.name, branch: u.branch, username: u.username, phone: phoneOf(u), email: u.email || '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCredSendOpen, users, kurumFilter, contacts]);

  // Aşama 149: seçim penceresindeki öğrenciler — listedeki kurum kapsamı + gönderilebilenler (yalnız pencere açıkken)
  const credStudents = useMemo(() => {
    if (!stuPickOpen) return [];
    return users
      .filter((u) => u.role === 'student' && !(u.isSuspended || u.status === 'suspended'))
      .filter((u) => (kurumFilter === 'merkez' ? !u.kurumId : kurumFilter ? u.kurumId === kurumFilter : true))
      .map((u) => studentById.get(u.id))
      .filter((st): st is Student => !!st && canSendCredentials(st, grantCredOn));
  }, [stuPickOpen, users, kurumFilter, studentById, grantCredOn]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        dataService.forceSyncTeachers(),
        dataService.syncStudentsFromSupabase(),
        dataService.syncClassesFromSupabase(),
      ]);
      loadData();
      showToast('Kullanıcı verileri buluttan başarıyla eşitlendi.', 'success');
    } catch {
      showToast('Senkronizasyon sırasında hata oluştu.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Summary Metrics
  // Aşama 116: sayaç kartları seçili kurumla aynı kapsamı sayar (liste ile kartlar aynı sayıyı gösterir)
  const stats = useMemo(() => {
    const scoped =
      kurumFilter === 'merkez' ? users.filter((u) => !u.kurumId) : kurumFilter ? users.filter((u) => u.kurumId === kurumFilter) : users;
    let admins = 0, teachers = 0, students = 0, suspended = 0, pending = 0;
    for (const u of scoped) {
      if (u.role === 'admin') admins++;
      else if (u.role === 'teacher') teachers++;
      else if (u.role === 'student') students++;
      if (u.isSuspended || u.status === 'suspended') suspended++;
      if (u.status === 'pending') pending++;
    }
    return { total: scoped.length, admins, teachers, students, suspended, pending };
  }, [users, kurumFilter]);

  // Filtered Users (Aşama 15: arama bir adım geriden gelir, liste parça parça çizilir)
  const deferredQuery = useDeferredValue(searchQuery);
  const filteredUsers = useMemo(() => {
    const searchQuery = deferredQuery;
    return users.filter((u) => {
      // Role filter
      if (roleLock === 'student' ? u.role !== 'student' : roleLock === 'teacher' ? u.role === 'student' : false) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      // Kurum filter
      if (kurumFilter === 'merkez' && u.kurumId) return false;
      if (kurumFilter && kurumFilter !== 'merkez' && u.kurumId !== kurumFilter) return false;

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'suspended' && !u.isSuspended && u.status !== 'suspended') return false;
        if (statusFilter === 'active' && (u.isSuspended || (u.status !== 'active' && u.status !== 'approved'))) return false;
        if (statusFilter === 'pending' && u.status !== 'pending') return false;
        if (statusFilter === 'rejected' && u.status !== 'rejected') return false;
        if (statusFilter === 'inactive' && u.status !== 'inactive') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim(); // Aşama 116: Türkçe harf duyarsız
        const inName = matchTurkishSearch(u.name, q);
        const inUsername = matchTurkishSearch(u.username, q);
        const inEmail = matchTurkishSearch(u.email, q);
        const inPhone = phoneOf(u).includes(q);
        const inBranch = matchTurkishSearch(u.branch, q);
        const inClass = matchTurkishSearch(u.className, q);
        const inNumber = (u.studentNumber || '').includes(q);
        return inName || inUsername || inEmail || inPhone || inBranch || inClass || inNumber;
      }

      return true;
    });
  }, [users, roleFilter, statusFilter, deferredQuery, kurumFilter, roleLock, contacts]);
  const pagedUsers = usePagedList(filteredUsers, `${deferredQuery}|${roleFilter}|${statusFilter}|${kurumFilter}|${roleLock || ''}`);

  // Aşama 18: genel yönetici her şeyi, kurum yöneticisi yalnızca kendi kurumunu yönetir
  const isHead = dataService.isHeadAdmin();
  // Aşama 104: kurum bilgisi sayfa açıldıktan sonra gelirse süzgeç hesaba göre yeniden kurulur (kurumda 'kurumsuz' kalmaz)
  useEffect(() => {
    setKurumFilter((f) => (isHead ? (f === '' ? 'merkez' : f) : ''));
  }, [isHead]);
  const canManageTeachers = dataService.canManageTeachers();
  const kurumOptions = useMemo(() => {
    const ids = Array.from(new Set(users.map((u) => u.kurumId).filter(Boolean) as string[]));
    return ids.map((id) => ({ id, name: dataService.getKurumNameForId(id) })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [users]);
  const rowManageable = (u: UnifiedUser) =>
    u.role === 'student'
      ? dataService.canManageStudent({ kurumId: u.kurumId } as Student)
      : dataService.canManageTeacherAccount({ id: u.id, isAdmin: u.isAdmin, kurumId: u.kurumId });

  // Route Guard: Sadece yöneticiler erişebilir
  const isSuperAdmin = dataService.yoneticiKaydi(currentAdmin) && dataService.canAccessUserManagement(); // Aşama 243: portal

  if (!isSuperAdmin) {
    return (
      <div className="bg-surface border border-rose-500/30 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-2xl space-y-4 my-8 animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-fg">Yetkisiz Erişim (403 Forbidden)</h2>
        <p className="text-sm text-muted leading-relaxed">
          Bu alan <strong>yetki kuralları</strong> gereği yalnızca Kurum Yöneticisi (Admin) erişimine açıktır.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onNavigateHome}
            className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg border border-line min-w-24"
          >
            Öğretmen Paneline Dön
          </button>
        </div>
      </div>
    );
  }


  // Open Edit Form
  const handleOpenEdit = (user: UnifiedUser) => {
    setEditPwOpen(false);
    setEditModalUser(user);
    setNotifyTeacher(true);
    setEditFormData({
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      phone: phoneOf(user),
      birthDate: birthOf(user),
      gender: user.gender || '',
      branch: user.branch || '',
      classId: user.classId || (classes[0]?.id || ''),
      className: user.className || '',
      studentNumber: user.studentNumber || '',
      schoolLevel: user.schoolLevel || 'Ortaokul',
      newPassword: '',
      mustChangePassword: !!user.mustChangePassword,
    });
    setShowPassword(false);
    setCopiedPassword(false);
  };

  // Submit Edit Form
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalUser) return;

    const before = editModalUser;
    // Aşama 144: öğretmen telefonu korumalı tabloya yazılır; biçim önce denetlenir
    const isTeacherEdit = isTeacherAccount(before);
    const phoneN = normalizeTurkishPhone(editFormData.phone);
    if (isTeacherEdit && !phoneN.valid) {
      showToast(PHONE_ERROR, 'error');
      return;
    }
    try {
      await dataService.adminUpdateUserProfile(editModalUser.id, {
        name: editFormData.name,
        username: editFormData.username,
        email: editFormData.email,
        phone: editFormData.phone,
        gender: editFormData.gender || null, // Aşama 171: '' = belirtilmedi
        branch: editFormData.branch,
        classId: editFormData.classId,
        className: editFormData.className,
        studentNumber: editFormData.studentNumber,
        schoolLevel: editFormData.schoolLevel,
        mustChangePassword: editFormData.mustChangePassword,
        newPassword: editFormData.newPassword ? editFormData.newPassword : undefined,
      });

      if (isTeacherEdit && (phoneN.value !== phoneOf(before) || editFormData.birthDate !== birthOf(before))) {
        try {
          await saveTeacherContact(before.id, { phone: phoneN.value, birthDate: editFormData.birthDate });
          reloadContacts();
        } catch (er: any) {
          showToast(`Telefon / doğum tarihi kaydedilemedi: ${er?.message || 'hata'}`, 'error');
        }
      }
      showToast(`✓ "${editFormData.name}" kullanıcı bilgileri başarıyla güncellendi.`, 'success');
      setEditModalUser(null);
      loadData();
      // Öğretmene değişiklikleri e-postayla bildir
      if (isTeacherAccount(before) && notifyTeacher) {
        const norm = (v?: string) => (v || '').trim();
        const changes: Array<{ label: string; value: string; login?: boolean }> = [];
        if (norm(editFormData.name) && norm(editFormData.name) !== norm(before.name)) changes.push({ label: 'Ad Soyad', value: norm(editFormData.name) });
        if (norm(editFormData.username) && norm(editFormData.username).toLowerCase() !== norm(before.username).toLowerCase())
          changes.push({ label: 'Kullanıcı adı', value: norm(editFormData.username).toLowerCase(), login: true });
        if (norm(editFormData.email) !== norm(before.email)) changes.push({ label: 'E-posta', value: norm(editFormData.email) || '(silindi)' });
        if (norm(editFormData.phone) !== norm(phoneOf(before))) changes.push({ label: 'Telefon', value: norm(editFormData.phone) || '(silindi)' });
        if (norm(editFormData.branch) !== norm(before.branch)) changes.push({ label: 'Branş', value: norm(editFormData.branch) || '(silindi)' });
        const pw = norm(editFormData.newPassword);
        if (pw && editFormData.mustChangePassword) changes.push({ label: 'İlk girişte', value: 'Şifrenizi değiştirmeniz istenecek' });
        if (changes.length || pw) {
          sendTeacherMail(before.id, 'updated', {
            changes,
            password: pw || undefined,
            previousEmail: norm(editFormData.email) !== norm(before.email) ? norm(before.email) : undefined,
          });
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Güncelleme sırasında hata oluştu.', 'error');
    }
  };

  // Generate Random Password
  const handleGeneratePassword = () => {
    const res = dataService.generatePassword();
    setEditFormData((prev) => ({ ...prev, newPassword: res }));
    setShowPassword(true);
    setCopiedPassword(false);
  };

  const handleCopyPassword = () => {
    if (editFormData.newPassword) {
      navigator.clipboard.writeText(editFormData.newPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2500);
    }
  };

  // Open Role Modal
  const handleOpenRoleModal = (user: UnifiedUser) => {
    setRoleModalUser(user);
    setNotifyTeacher(true);
    setSelectedTargetRole(user.role);
  };

  // Save Role Change
  const handleSaveRoleChange = async () => {
    if (!roleModalUser) return;
    try {
      await dataService.adminChangeUserRole(roleModalUser.id, selectedTargetRole);
      showToast(`✓ ${roleModalUser.name} kullanıcısının rolü "${selectedTargetRole.toUpperCase()}" olarak değiştirildi.`, 'success');
      const changedRole = roleModalUser.role !== selectedTargetRole;
      const roleUser = roleModalUser;
      setRoleModalUser(null);
      loadData();
      if (isTeacherAccount(roleUser) && notifyTeacher && changedRole) sendTeacherMail(roleUser.id, 'role');
    } catch (err: any) {
      showToast(err.message || 'Rol değiştirilirken hata oluştu.', 'error');
    }
  };

  // Toggle Suspension
  const handleConfirmToggleSuspension = async () => {
    if (!suspendModalUser) return;
    const willSuspend = !suspendModalUser.isSuspended && suspendModalUser.status !== 'suspended';
    try {
      await dataService.adminToggleUserSuspension(suspendModalUser.id, willSuspend);
      showToast(
        willSuspend
          ? `✓ "${suspendModalUser.name}" hesabı donduruldu (askıya alındı).`
          : `✓ "${suspendModalUser.name}" hesabı yeniden aktif hale getirildi.`,
        'success'
      );
      const suspendedUser = suspendModalUser;
      setSuspendModalUser(null);
      loadData();
      if (isTeacherAccount(suspendedUser) && notifyTeacher) sendTeacherMail(suspendedUser.id, willSuspend ? 'suspended' : 'reactivated');
    } catch (err: any) {
      showToast(err.message || 'İşlem başarısız.', 'error');
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteModalUser) return;
    try {
      await dataService.adminDeleteUser(deleteModalUser.id);
      showToast(`✓ "${deleteModalUser.name}" kullanıcısı sistemden kalıcı olarak silindi.`, 'success');
      setDeleteModalUser(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Kullanıcı silinemedi.', 'error');
    }
  };

  const authGradeOptions = useMemo(() => gradeOptionsFrom(classes), [classes]);
  const gradeCovered = useMemo(() => classesCoveredBy(classes, authGrades), [classes, authGrades]);
  // Aşama 107: Müdür / Müdür Yrd. / Rehberlik / Ölçme rolü (rol yetkileri açıkken) kurumdaki tüm sınıfları zaten görür;
  // matris bunu kilitli işaretli gösterir (veritabanına ayrıca yazılmaz, yetki rolden gelir)
  const authWideRoles = useMemo(
    () => (authModalTeacher ? (unvanlar.get(authModalTeacher.id) || []).filter((r) => WIDE_ROLES.includes(r)) : []),
    [authModalTeacher, unvanlar]
  );
  const kurumRolesOn = dataService.getMyKurum().rolesEnabled === true;
  const roleSeesAll = kurumRolesOn && authWideRoles.length > 0;
  // Zümre Başkanı / Etüt Öğretmeni rolünden ek görüş (sınıf listesi veritabanında hesaplanır; burada bilgi notu)
  const authExtraRoleNote = useMemo(() => {
    if (!authModalTeacher || !kurumRolesOn || roleSeesAll) return '';
    const rs = unvanlar.get(authModalTeacher.id) || [];
    const parts: string[] = [];
    if (rs.includes('zumre_baskani')) parts.push('Zümre Başkanı rolü gereği zümresinin sınıflarını da görür');
    if (rs.includes('etut_ogretmeni')) parts.push('Etüt Öğretmeni rolü gereği kendi etütlerindeki öğrencileri de görür');
    return parts.length ? `${parts.join('; ')}. Bunlar rolünden gelir, aşağıda işaretlemek gerekmez.` : '';
  }, [authModalTeacher, unvanlar, kurumRolesOn, roleSeesAll]);

  // Open Teacher Authorization Modal
  const handleOpenAuthModal = async (teacher: UnifiedUser) => {
    // Aşama 98: genel yönetici kendi panelinde kurum öğretmeninin kurum sınıflarını göremez; boş kayıtla mevcut
    // yetkiler silinmesin diye pencere açılmaz (veritabanı da reddeder)
    if (isHead && teacher.kurumId) {
      showToast('Bu öğretmen bir kuruma bağlı. Yetkilerini üst menüdeki kurum seçiciyle o kuruma geçerek verin.', 'error');
      return;
    }
    // 1. auth_user_id doğrulama
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const authUserId = teacher.auth_user_id || (uuidRegex.test(teacher.id) ? teacher.id : null);

    if (!authUserId) {
      showToast(
        `"${teacher.name}" kullanıcısının Supabase Auth hesabı (auth_user_id) bulunamadı. Veritabanı erişim matrisi açılamıyor.`,
        'error'
      );
      return;
    }

    // 2. Doğrudan ve SADECE veritabanından çek (eski yerel dizilerle union yapma)
    try {
      const [cloudAccess, g] = await Promise.all([dataService.getTeacherCloudAccess(authUserId), fetchTeacherGrades(authUserId)]);
      setSelectedAuthClassIds(cloudAccess.classIds || []);
      setAuthGrades({ grades: g.grades, all: g.all });
      setAuthGradesMissing(g.missing === true);
      setSelectedAuthStudentIds(cloudAccess.studentIds || []);
      setAuthStudentSearch('');
      // SADECE sorgu başarılı olursa modalı aç
      setAuthModalTeacher(teacher);
      setNotifyTeacher(true);
    } catch (err: any) {
      showToast(
        `Erişim izinleri veritabanından çekilemedi: ${err.message || 'Bilinmeyen hata'}`,
        'error'
      );
      // Hata durumunda modal açılmaz
    }
  };

  // Save Teacher Authorization
  const handleSaveAuthModal = async () => {
    if (!authModalTeacher) return;
    try {
      // Aşama 102: kademeden gelen sınıflar elle listeye yazılmaz; matris kaydı tüm satırları yeniden yazdığı için
      // ardından kademeler yeniden uygulanır
      await dataService.adminUpdateTeacherAuthorizations(
        authModalTeacher.id,
        selectedAuthClassIds.filter((id) => !gradeCovered.has(id)),
        selectedAuthStudentIds
      );
      const authId = authModalTeacher.auth_user_id || authModalTeacher.id;
      if (!authGradesMissing) await saveTeacherGrades(authId, authGrades);
      else if (authGrades.all || authGrades.grades.length) throw new Error('Kademe kaydı için önce sql/102_ogretmen_kademe.sql çalıştırılmalı.');
      showToast(
        `✓ "${authModalTeacher.name}" için sınıf ve öğrenci erişim yetkileri başarıyla güncellendi.`,
        'success'
      );
      // SADECE başarılı olduğunda modalı kapat
      const accessTeacher = authModalTeacher;
      setAuthModalTeacher(null);
      loadData();
      reloadAccessCounts();
      if (notifyTeacher) sendTeacherMail(accessTeacher.id, 'access');
    } catch (err: any) {
      // Hata durumunda modal KAPANMAZ, admin hatayı görüp düzeltebilir
      showToast(err.message || 'Yetkilendirme veritabanına kaydedilemedi.', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {yetkiTeacherId && (
        <YetkilerAcici
          teacherId={yetkiTeacherId}
          roleSettings={roleSettings}
          onClose={() => setYetkiTeacherId(null)}
          onSaved={(m) => showToast(m, 'success')}
        />
      )}
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[10000] max-w-md animate-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border text-xs sm:text-sm font-bold flex items-center space-x-2.5 backdrop-blur-xl ${
              toastMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/95 border-emerald-500/40 text-emerald-700 dark:text-emerald-200'
                : toastMsg.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/95 border-rose-500/40 text-rose-600 dark:text-rose-200'
                : 'bg-indigo-50 dark:bg-indigo-950/95 border-indigo-500/40 text-indigo-600 dark:text-indigo-200'
            }`}
          >
            {toastMsg.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />}
            {toastMsg.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />}
            {toastMsg.type === 'info' && <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      {!embedded && (
        <>
{/* Bölüm başlığı */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning-soft text-warning-fg flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-fg tracking-tight">Kullanıcılar ve Yetkiler</h2>
            <p className="text-xs sm:text-sm text-muted">Öğretmen ve öğrenci hesapları, roller, şifreler ve hesap durumu</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="ui-btn ui-btn-secondary ui-btn-icon"
            title="Verileri yeniden yükle"
            aria-label="Verileri yeniden yükle"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          {canManageTeachers && (
            <button
              type="button"
              onClick={() => setIsCreateTeacherOpen(true)}
              className="ui-btn ui-btn-primary"
              title="Yeni öğretmen için giriş hesabı aç"
            >
              <UserPlus className="w-4 h-4" />
              <span>Yeni Öğretmen Hesabı</span>
            </button>
          )}
          {canManageTeachers && (
            <button
              type="button"
              onClick={() => setIsExcelTeacherOpen(true)}
              className="ui-btn ui-btn-secondary"
              title="Öğretmenleri Excel dosyasından toplu ekle"
              id="ogretmen-excel-ekle-ust"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel ile Ekle</span>
            </button>
          )}
          {canManageTeachers && (
            <button
              type="button"
              onClick={() => setIsCredSendOpen(true)}
              className="ui-btn ui-btn-secondary"
              title="Öğretmenlere giriş bilgisini SMS / e-postayla gönder"
              id="ogretmen-giris-gonder-ust"
            >
              <Send className="w-4 h-4" />
              <span>Giriş Bilgisi Gönder</span>
            </button>
          )}
        </div>
      </div>
        </>
      )}

      {/* Öğrenci kayıt başvuruları (onay / red) */}
      {/* Aşama 99b: genel yönetici kendi (kurumsuz) başvurularını, kurum idaresi kendi kurumununkileri onaylar */}
      {dataService.canReviewApplications() && roleLock !== 'teacher' && (
        <StudentApplicationsPanel
          classes={isHead ? classes.filter((c) => !c.kurumId) : classes.filter((c) => !!c.kurumId && c.kurumId === dataService.getMyKurumId())}
          onToast={showToast}
        />
      )}

      {!embedded && (
        <>
{/* Metric Cards - Clickable Interactive Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Toplam */}
        <button
          type="button"
          onClick={() => {
            setRoleFilter('all');
            setStatusFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition-all cursor-pointer ${
            roleFilter === 'all' && statusFilter === 'all'
              ? 'border-indigo-500 ring-2 ring-indigo-500/50 bg-indigo-50 dark:bg-indigo-950/20'
              : 'border-line hover:border-line hover:bg-surface-2/50'
          }`}
        >
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-bold">Toplam Kullanıcı</span>
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-fg">{stats.total}</p>
          <span className="text-[10px] text-muted mt-1 block">Tüm kayıtları listele</span>
        </button>

        {/* Yöneticiler */}
        <button
          type="button"
          onClick={() => {
            setRoleFilter(roleFilter === 'admin' && statusFilter === 'all' ? 'all' : 'admin');
            setStatusFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition-all cursor-pointer bg-gradient-to-b from-amber-500/5 to-transparent ${
            roleFilter === 'admin' && statusFilter === 'all'
              ? 'border-amber-400 ring-2 ring-amber-400/50 bg-amber-50 dark:bg-amber-950/30'
              : 'border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-50 dark:hover:bg-amber-950/10'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 mb-2">
            <span className="text-xs font-bold">Yöneticiler</span>
            <Crown className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-black text-fg">{stats.admins}</p>
          <span className="text-[10px] text-amber-700/70 dark:text-amber-400/70 mt-1 block">Tam Yetkili (Admin)</span>
        </button>

        {/* Öğretmenler */}
        <button
          type="button"
          onClick={() => {
            setRoleFilter(roleFilter === 'teacher' && statusFilter === 'all' ? 'all' : 'teacher');
            setStatusFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition-all cursor-pointer ${
            roleFilter === 'teacher' && statusFilter === 'all'
              ? 'border-indigo-400 ring-2 ring-indigo-400/50 bg-indigo-50 dark:bg-indigo-950/30'
              : 'border-indigo-500/20 hover:border-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/10'
          }`}
        >
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-300 mb-2">
            <span className="text-xs font-bold">Öğretmenler</span>
            <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-fg">{stats.teachers}</p>
          <span className="text-[10px] text-indigo-600/70 dark:text-indigo-400/70 mt-1 block">Aktif Branş Eğitmenleri</span>
        </button>

        {/* Öğrenciler */}
        <button
          type="button"
          onClick={() => {
            setRoleFilter(roleFilter === 'student' && statusFilter === 'all' ? 'all' : 'student');
            setStatusFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition-all cursor-pointer ${
            roleFilter === 'student' && statusFilter === 'all'
              ? 'border-emerald-400 ring-2 ring-emerald-400/50 bg-emerald-50 dark:bg-emerald-950/30'
              : 'border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/10'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 mb-2">
            <span className="text-xs font-bold">Öğrenciler</span>
            <School className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-fg">{stats.students}</p>
          <span className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70 mt-1 block">Kayıtlı Öğrenci Sayısı</span>
        </button>

        {/* Askıya Alınanlar */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === 'suspended' ? 'all' : 'suspended');
            setRoleFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition-all cursor-pointer bg-gradient-to-b from-rose-500/5 to-transparent ${
            statusFilter === 'suspended'
              ? 'border-rose-400 ring-2 ring-rose-400/50 bg-rose-50 dark:bg-rose-950/30'
              : 'border-rose-500/20 hover:border-rose-500/40 hover:bg-rose-50 dark:hover:bg-rose-950/10'
          }`}
        >
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-300 mb-2">
            <span className="text-xs font-bold">Askıda / Dondurulan</span>
            <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-200">{stats.suspended}</p>
          <span className="text-[10px] text-rose-600/70 dark:text-rose-400/70 mt-1 block">Girişleri Kapatılmış</span>
        </button>

        {/* Onay Bekleyenler */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending');
            setRoleFilter('all');
          }}
          className={`text-left bg-surface/90 border rounded-2xl p-4 shadow-sm transition-all cursor-pointer ${
            statusFilter === 'pending'
              ? 'border-orange-400 ring-2 ring-orange-400/50 bg-orange-50 dark:bg-orange-950/30'
              : 'border-orange-500/20 hover:border-orange-500/40 hover:bg-orange-50 dark:hover:bg-orange-950/10'
          }`}
        >
          <div className="flex items-center justify-between text-orange-700 dark:text-orange-300 mb-2">
            <span className="text-xs font-bold">Onay Bekleyen</span>
            <AlertTriangle className="w-4 h-4 text-orange-700 dark:text-orange-400" />
          </div>
          <p className="text-2xl font-black text-orange-700 dark:text-orange-200">{stats.pending}</p>
          <span className="text-[10px] text-orange-700/70 dark:text-orange-400/70 mt-1 block">Öğretmen Başvurusu</span>
        </button>
      </div>
        </>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-surface/95 border border-line rounded-2xl p-4 shadow-md flex flex-col gap-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input autoComplete="off"
              type="text"
              placeholder="İsim, telefon, branş veya sınıf ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-field w-full pl-10 pr-4"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Role Filter */}
            <div className={`flex items-center space-x-1.5 bg-canvas border border-line rounded-xl px-2.5 py-1.5 ${roleLock ? 'hidden' : ''}`}>
              <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="bg-transparent text-xs text-fg font-bold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-surface text-fg">Tüm Roller</option>
                <option value="admin" className="bg-surface text-fg">👑 Yöneticiler (Admin)</option>
                <option value="teacher" className="bg-surface text-fg">🎓 Öğretmenler</option>
                <option value="student" className="bg-surface text-fg">🎒 Öğrenciler</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-1.5 bg-canvas border border-line rounded-xl px-2.5 py-1.5">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-transparent text-xs text-fg font-bold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-surface text-fg">Tüm Durumlar</option>
                <option value="active" className="bg-surface text-fg">🟢 Aktif</option>
                <option value="suspended" className="bg-surface text-fg">⛔ Askıda (Dondurulmuş)</option>
                <option value="pending" className="bg-surface text-fg">🟠 Onay Bekleyen</option>
                <option value="rejected" className="bg-surface text-fg">🔴 Reddedilen</option>
              </select>
            </div>

            {/* Kurum Filter (genel yönetici) */}
            {isHead && kurumLock === undefined && kurumOptions.length > 0 && (
              <div className="flex items-center space-x-1.5 bg-canvas border border-line rounded-xl px-2.5 py-1.5">
                <select
                  id="users-kurum-filter"
                  value={kurumFilter}
                  onChange={(e) => setKurumFilter(e.target.value)}
                  className="bg-transparent text-xs text-fg font-bold focus:outline-none cursor-pointer"
                  aria-label="Kurum"
                >
                  <option value="" className="bg-surface text-fg">Tüm Kurumlar</option>
                  <option value="merkez" className="bg-surface text-fg">Sizin (kurumsuz) kayıtlar</option>
                  {kurumOptions.map((k) => (
                    <option key={k.id} value={k.id} className="bg-surface text-fg">
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || (kurumLock === undefined && kurumFilter)) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('all');
                  setStatusFilter('all');
                  setKurumFilter(kurumLock ?? '');
                }}
                className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg min-w-24"
              >
                Temizle
              </button>
            )}
            {embedded && (
              <>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-8 px-0 justify-center"
                  title="Verileri yeniden yükle"
                  aria-label="Verileri yeniden yükle"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                {canManageTeachers && roleLock !== 'student' && (
                  <button
                    type="button"
                    onClick={() => setIsCreateTeacherOpen(true)}
                    className="ui-btn ui-btn-primary ui-btn-sm h-8 w-28 justify-center"
                    title="Yeni öğretmen için giriş hesabı aç"
                    id="yonetim-yeni-ogretmen"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Öğretmen</span>
                  </button>
                )}
                {canManageTeachers && roleLock !== 'student' && (
                  <button
                    type="button"
                    onClick={() => setIsExcelTeacherOpen(true)}
                    className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center"
                    title="Öğretmenleri Excel dosyasından toplu ekle"
                    id="yonetim-ogretmen-excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Excel ile</span>
                  </button>
                )}
                {canManageTeachers && roleLock !== 'student' && (
                  <button
                    type="button"
                    onClick={() => setIsGenderFillOpen(true)}
                    className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center"
                    title="Cinsiyeti boş öğretmenleri adlarından tahmin edip doldur (kaydetmeden önce kontrol edersiniz)"
                    id="yonetim-ogretmen-cinsiyet"
                  >
                    <VenusAndMars className="w-3.5 h-3.5" />
                    <span>Cinsiyet</span>
                  </button>
                )}
                {canManageTeachers && roleLock !== 'student' && (
                  <button
                    type="button"
                    onClick={() => setIsCredSendOpen(true)}
                    className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center"
                    title="Öğretmenlere giriş bilgisini SMS / e-postayla gönder"
                    id="yonetim-ogretmen-giris-gonder"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Giriş Bilgisi</span>
                  </button>
                )}
                {canSendStudentCreds && roleLock !== 'teacher' && (
                  <button
                    type="button"
                    onClick={() => setStuPickOpen(true)}
                    className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center"
                    title="Öğrencilere ve velilerine giriş bilgisini SMS / e-postayla gönder"
                    id="yonetim-ogrenci-giris-gonder"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{roleLock === 'student' ? 'Giriş Bilgisi' : 'Öğrenci Girişi'}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {!embedded && (
          <>
        {/* Quick Role & Status Filter Pill Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-line">
          <span className="text-[11px] font-bold text-muted">Hızlı Filtre:</span>
          <button
            type="button"
            onClick={() => {
              setRoleFilter('all');
              setStatusFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              roleFilter === 'all' && statusFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-fg-2'
            }`}
          >
            Tümü ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleFilter(roleFilter === 'admin' && statusFilter === 'all' ? 'all' : 'admin');
              setStatusFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              roleFilter === 'admin' && statusFilter === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-amber-700 dark:text-amber-300'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Yöneticiler ({stats.admins})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleFilter(roleFilter === 'teacher' && statusFilter === 'all' ? 'all' : 'teacher');
              setStatusFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              roleFilter === 'teacher' && statusFilter === 'all'
                ? 'bg-indigo-500 text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-indigo-600 dark:text-indigo-300'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Öğretmenler ({stats.teachers})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleFilter(roleFilter === 'student' && statusFilter === 'all' ? 'all' : 'student');
              setStatusFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              roleFilter === 'student' && statusFilter === 'all'
                ? 'bg-emerald-500 text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            <School className="w-3.5 h-3.5" />
            <span>Öğrenciler ({stats.students})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter(statusFilter === 'suspended' ? 'all' : 'suspended');
              setRoleFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              statusFilter === 'suspended'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-rose-600 dark:text-rose-300'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Askıda ({stats.suspended})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending');
              setRoleFilter('all');
            }}
            className={`ui-btn ui-btn-sm ${
              statusFilter === 'pending'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-orange-700 dark:text-orange-300'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Onay Bekleyen ({stats.pending})</span>
          </button>
        </div>
          </>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-surface border border-line rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-[11px] font-black uppercase tracking-wider text-muted">
                <th className="py-3.5 px-4 sm:px-6">Kullanıcı (Ad Soyad & Profil)</th>
                <th className="py-3.5 px-4">İletişim & Kullanıcı Adı</th>
                <th className="py-3.5 px-4">Mevcut Rolü</th>
                <th className="py-3.5 px-4">Birim / Sınıf / Branş</th>
                <th className="py-3.5 px-4">Durum</th>
                <th className="py-3.5 px-4 text-right sm:pr-6">Yönetici İşlemleri</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    <Users className="w-10 h-10 text-subtle mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-fg">Kullanıcı Bulunamadı</p>
                    <p className="text-xs text-muted mt-1">Arama veya filtre kriterlerinize uyan kayıt yok.</p>
                  </td>
                </tr>
              ) : (
                pagedUsers.visible.map((u) => {
                  const isCurrentAdminSelf = u.id === currentAdmin?.id;
                  const manageable = rowManageable(u);
                  const isProtectedAdmin = isCurrentAdminSelf || (u.role === 'admin' && stats.admins <= 1) || !manageable;
                  const isSuspended = u.isSuspended || u.status === 'suspended';

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-surface-2/50 transition-colors ${
                        isSuspended ? 'bg-rose-50 dark:bg-rose-950/15 text-muted' : ''
                      }`}
                    >
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center space-x-3">
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-surface-2 ring-2 ring-line overflow-hidden flex items-center justify-center">
                              {/* Aşama 171: kendi resmi yoksa cinsiyet + unvana göre çizim */}
                              <img
                                loading="lazy"
                                decoding="async"
                                src={profilResmi(u, u.role === 'student' ? 'student' : ogretmenProfilRol(u, unvanlar.get(u.id)))}
                                alt={u.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <span className="font-bold text-fg text-xs sm:text-sm truncate">
                                {u.name}
                              </span>
                              {isCurrentAdminSelf && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                                  Siz
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted font-mono block">
                              @{u.username}
                            </span>
                            {isHead && u.kurumId && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-info-soft text-info-fg" data-kurum-badge>
                                {dataService.getKurumNameForId(u.kurumId)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {u.email ? (
                            <a
                              href={`mailto:${u.email}`}
                              className="flex items-center space-x-1 text-fg-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate max-w-[200px]"
                              title={u.email}
                            >
                              <Mail className="w-3 h-3 text-muted shrink-0" />
                              <span className="truncate">{u.email}</span>
                            </a>
                          ) : (
                            <span className="text-subtle italic">E-posta yok</span>
                          )}

                          {phoneOf(u) ? (
                            <div className="flex items-center space-x-1 text-muted">
                              <Phone className="w-3 h-3 text-muted shrink-0" />
                              <span>{phoneOf(u)}</span>
                            </div>
                          ) : null}
                          {birthOf(u) ? <div className="text-[11px] text-muted">Doğum: {birthDateLabel(birthOf(u))}</div> : null}
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        {u.role === 'admin' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            <Crown className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                            <span>Yönetici</span>
                          </span>
                        ) : u.role === 'teacher' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                            <GraduationCap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Öğretmen</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            <School className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                            <span>Öğrenci</span>
                          </span>
                        )}
                        {u.role !== 'student' && (() => {
                          // "Öğretmen" rozeti hesap türüdür; unvan(lar) altında gösterilir (yalnız Öğretmen ise tekrar yazılmaz)
                          const rs = sortRoles(unvanlar.get(u.id) || []).filter((r) => r !== 'ogretmen') as TeacherRole[];
                          return rs.length ? (
                            <div className="mt-1 flex flex-wrap gap-1" data-unvan-for={u.id}>
                              {rs.map((r) => (
                                <span key={r} className={`ui-chip ui-chip-${ROLE_BY_CODE[r]?.chip || 'neutral'}`} title={ROLE_BY_CODE[r]?.description}>
                                  {ROLE_BY_CODE[r]?.short || r}
                                </span>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </td>

                      {/* Detail Unit */}
                      <td className="py-3.5 px-4">
                        {u.role === 'student' ? (
                          <div>
                            <span className="font-bold text-fg block">
                              {u.className || 'Genel'}
                            </span>
                            {u.studentNumber && (
                              <span className="text-[11px] text-muted">
                                No: {u.studentNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-fg block truncate max-w-[150px]">
                              {u.branch || 'Genel Branş'}
                            </span>
                            {(() => {
                              const c = accessCounts.get(u.auth_user_id || u.id);
                              if (!c || (c.classes === 0 && c.students === 0)) return null;
                              const parts = [c.classes ? `${c.classes} sınıf` : '', c.students ? `${c.students} öğrenci` : ''].filter(Boolean);
                              return (
                                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                                  {parts.join(' · ')} yetkili
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isSuspended ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30">
                            <Ban className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                            <span>Askıya Alındı</span>
                          </span>
                        ) : u.status === 'pending' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                            <AlertTriangle className="w-3 h-3 text-orange-700 dark:text-orange-400" />
                            <span>Onay Bekliyor</span>
                          </span>
                        ) : u.status === 'rejected' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-surface-3 text-fg-2">
                            <span>Reddedildi</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Aktif</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right sm:pr-6">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Sınıf & Öğrenci Erişim Yetkilendirmesi (Erişim Matrisi) */}
                          {u.role !== 'student' && manageable && (isHead ? !u.kurumId : u.role === 'teacher') && (
                            <button
                              type="button"
                              onClick={() => handleOpenAuthModal(u)}
                              className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/80 text-indigo-600 dark:text-indigo-300 hover:text-fg border border-indigo-500/40 transition-colors cursor-pointer"
                              title="Sınıf ve Öğrenci Erişim Yetkilerini Yönet (Erişim Matrisi)"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Rol Değiştir Butonu (öğretmen <-> yönetici): yalnızca genel yönetici */}
                          {u.role !== 'student' && isHead && (
                            <button
                              type="button"
                              onClick={() => handleOpenRoleModal(u)}
                              className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-amber-700 dark:hover:text-amber-300 border border-line transition-colors cursor-pointer"
                              title="Öğretmen / Yönetici yetkisi"
                            >
                              <Shield className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Aşama 143: unvan, bölüm ve işlem izinleri (kurum öğretmeni) */}
                          {u.role !== 'student' && !!u.kurumId && manageable && !isCurrentAdminSelf && (
                            <button
                              type="button"
                              onClick={() => setYetkiTeacherId(u.id)}
                              className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-brand-fg border border-line transition-colors cursor-pointer"
                              title="Yetkiler (unvan, bölümler, işlem izinleri)"
                              aria-label="Yetkiler"
                              data-yetki-open={u.id}
                            >
                              <BadgeCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Aşama 149: öğrenciye / veliye giriş bilgisi (SMS / e-posta) */}
                          {u.role === 'student' && studentById.has(u.id) && canSendCredentials(studentById.get(u.id), grantCredOn) && (
                            <button
                              type="button"
                              onClick={() => setStuSendOne(studentById.get(u.id) || null)}
                              className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-indigo-600 dark:hover:text-indigo-300 border border-line transition-colors cursor-pointer"
                              title="Giriş bilgisini SMS / e-postayla gönder"
                              aria-label={`${u.name} giriş bilgisini gönder`}
                              data-testid="ogrenci-giris-gonder-satir"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Bilgi & Şifre Düzenle (Admin Override) */}
                          <button
                            type="button"
                            disabled={!manageable && !isCurrentAdminSelf}
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-indigo-600 dark:hover:text-indigo-300 border border-line transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Bilgileri ve Şifreyi Güncelle (Admin Override)"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Askıya Al / Aktifleştir */}
                          <button
                            type="button"
                            onClick={() => {
                              setSuspendModalUser(u);
                              setNotifyTeacher(true);
                            }}
                            disabled={isProtectedAdmin}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                              isSuspended
                                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                                : 'bg-surface-2 hover:bg-rose-500/20 text-fg-2 hover:text-rose-600 dark:hover:text-rose-300 border-line'
                            }`}
                            title={isSuspended ? 'Hesabı Yeniden Aktifleştir' : 'Hesabı Geçici Olarak Dondur (Askıya Al)'}
                          >
                            {isSuspended ? <Play className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>

                          {/* Kalıcı Sil */}
                          <button
                            type="button"
                            onClick={() => setDeleteModalUser(u)}
                            disabled={isProtectedAdmin}
                            className="p-1.5 rounded-lg bg-surface-2 hover:bg-rose-600/30 text-muted hover:text-rose-600 dark:hover:text-rose-300 border border-line transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                            title="Kullanıcıyı Kalıcı Olarak Sil"
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
        <ShowMoreBar
          id="users-show-more"
          remaining={pagedUsers.remaining}
          total={pagedUsers.total}
          shown={pagedUsers.visible.length}
          onMore={pagedUsers.showMore}
          onAll={pagedUsers.showAll}
        />
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: BİLGİ VE ŞİFRE GÜNCELLEME (ADMIN OVERRIDE FORMU) */}
      {/* ========================================================================= */}
      {editModalUser && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-150">
          <OverlayLayer onClose={() => setEditModalUser(null)} />
          <div
            className="relative w-full max-w-2xl bg-surface border border-line rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-line bg-gradient-to-r from-surface via-indigo-50 dark:via-indigo-950/40 to-surface flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-fg flex items-center space-x-2">
                    <span>Kullanıcı Bilgilerini Güncelle</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-fg-2 font-mono">
                      {editModalUser.role.toUpperCase()}
                    </span>
                  </h3>
                  <p className="text-xs text-muted">
                    Sistem yöneticisi yetkisiyle profil alanlarını ve şifreyi doğrudan güncelleyin.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Aşama 143: aynı Yetkiler penceresi (unvan, bölümler, işlem izinleri) */}
                {editModalUser.role !== 'student' && !!editModalUser.kurumId && editModalUser.id !== currentAdmin?.id && (
                  <button
                    type="button"
                    onClick={() => setYetkiTeacherId(editModalUser.id)}
                    className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center"
                    id="edit-yetkiler-btn"
                    title="Unvan, bölümler ve işlem izinleri"
                  >
                    <BadgeCheck className="w-3.5 h-3.5" /> Yetkiler
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditModalUser(null)}
                  aria-label="Kapat"
                  className="ui-btn ui-btn-ghost ui-btn-icon shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEdit} className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Ad Soyad */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">Ad Soyad</label>
                  <input autoComplete="off"
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="ui-field w-full"
                  />
                </div>

                {/* Kullanıcı Adı */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">Kullanıcı Adı</label>
                  <input autoComplete="off"
                    type="text"
                    required
                    value={editFormData.username}
                    onChange={(e) => setEditFormData({ ...editFormData, username: trFold(e.target.value) })} // Aşama 154
                    className="ui-field w-full"
                  />
                </div>

                {/* E-posta */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">E-posta Adresi</label>
                  <input autoComplete="off"
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="ui-field w-full"
                  />
                </div>

                {/* Telefon */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">Telefon Numarası</label>
                  <input autoComplete="off"
                    type="tel"
                    placeholder="05XX XXX XX XX"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="ui-field w-full"
                  />
                </div>

                {/* Aşama 171: cinsiyet (öğretmen + öğrenci) */}
                <div>
                  <label htmlFor="kullanici-duzen-cinsiyet" className="block text-xs font-bold text-fg-2 mb-1">Cinsiyet</label>
                  <select
                    id="kullanici-duzen-cinsiyet"
                    value={editFormData.gender}
                    onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value as '' | 'K' | 'E' })}
                    className="ui-field w-full font-semibold cursor-pointer"
                  >
                    <option value="">Seçiniz</option>
                    <option value="K">{editModalUser.role === 'student' ? 'Kız' : 'Kadın'}</option>
                    <option value="E">Erkek</option>
                  </select>
                </div>

                {/* Aşama 144: doğum tarihi (öğretmen) */}
                {editModalUser.role !== 'student' && (
                  <div>
                    <label className="block text-xs font-bold text-fg-2 mb-1">Doğum Tarihi</label>
                    <input autoComplete="off"
                      type="date"
                      id="ogretmen-duzen-dogum"
                      value={editFormData.birthDate}
                      onChange={(e) => setEditFormData({ ...editFormData, birthDate: e.target.value })}
                      className="ui-field w-full"
                    />
                  </div>
                )}

                {/* Öğretmen / Admin Branşı */}
                {editModalUser.role !== 'student' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-fg-2 mb-1">Branş / Görev</label>
                    <input autoComplete="off"
                      type="text"
                      placeholder="Örn: Fen Bilgisi Öğretmeni, Matematik, Kurum Müdürü"
                      value={editFormData.branch}
                      onChange={(e) => setEditFormData({ ...editFormData, branch: e.target.value })}
                      className="ui-field w-full"
                    />
                  </div>
                )}

                {/* Öğrenci Alanları */}
                {editModalUser.role === 'student' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-fg-2 mb-1">Kayıtlı Sınıf</label>
                      <select
                        value={editFormData.classId}
                        onChange={(e) => {
                          const cls = classes.find((c) => c.id === e.target.value);
                          setEditFormData({
                            ...editFormData,
                            classId: e.target.value,
                            className: cls ? cls.name : editFormData.className,
                          });
                        }}
                        className="ui-field w-full cursor-pointer"
                      >
                        {classes.filter((c) => dataService.canManageClass(c) || c.id === editFormData.classId).map((c) => (
                          <option key={c.id} value={c.id} className="bg-surface text-fg">
                            {c.name} ({c.gradeLevel || c.branch || 'Genel'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-fg-2 mb-1">Okul Numarası</label>
                      <input autoComplete="off"
                        type="text"
                        placeholder="Örn: 482"
                        value={editFormData.studentNumber}
                        onChange={(e) => setEditFormData({ ...editFormData, studentNumber: e.target.value })}
                        className="ui-field w-full"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Aşama 182: şifre bölümü tek satır; kutu yalnız "Yeni şifre" ile açılır, açıklama ⓘ içinde */}
              {(() => {
                const pwOpen = editPwOpen || !!editFormData.newPassword;
                return (
                  <CompactRow
                    icon={Key}
                    title="Giriş şifresi"
                    info="Yeni şifre yazarsanız kullanıcının şifresi bununla değişir. Boş bırakırsanız şifre değişmez. Şifreler sistemde saklanmaz."
                    actions={
                      pwOpen ? (
                        <>
                          <button type="button" onClick={handleGeneratePassword} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24" title="Rastgele şifre oluştur">
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Rastgele</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditFormData({ ...editFormData, newPassword: '' });
                              setEditPwOpen(false);
                              setCopiedPassword(false);
                            }}
                            className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-24"
                          >
                            Vazgeç
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setEditPwOpen(true)} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24">
                          Yeni şifre
                        </button>
                      )
                    }
                  >
                    {pwOpen && (
                      <div className="relative mb-2">
                        <input autoComplete="off"
                          type="text"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-form-type="other"
                          spellCheck={false}
                          autoCapitalize="none"
                          autoFocus={editPwOpen && !editFormData.newPassword}
                          aria-label="Yeni şifre"
                          placeholder="En az 6 karakter"
                          value={editFormData.newPassword}
                          onChange={(e) => setEditFormData({ ...editFormData, newPassword: e.target.value })}
                          className={`ui-field w-full pl-3 pr-16 font-mono ${showPassword ? '' : 'pw-mask'}`}
                        />
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                          {editFormData.newPassword && (
                            <button
                              type="button"
                              onClick={handleCopyPassword}
                              className="p-1 rounded-md hover:bg-surface-2 text-muted hover:text-fg"
                              title={copiedPassword ? 'Kopyalandı' : 'Şifreyi kopyala'}
                              aria-label="Şifreyi kopyala"
                            >
                              {copiedPassword ? <Check className="w-3.5 h-3.5 text-success-fg" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="p-1 rounded-md hover:bg-surface-2 text-muted hover:text-fg"
                            title={showPassword ? 'Gizle' : 'Göster'}
                            aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-[11px] text-fg-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editFormData.mustChangePassword}
                        onChange={(e) => setEditFormData({ ...editFormData, mustChangePassword: e.target.checked })}
                        className="rounded border-line focus:ring-0"
                      />
                      <span>İlk girişte şifresini değiştirsin</span>
                    </label>
                  </CompactRow>
                );
              })()}

              {isTeacherAccount(editModalUser) && (
                <MailOptIn
                  id="teacher-edit-notify"
                  checked={notifyTeacher}
                  onChange={setNotifyTeacher}
                  label="Öğretmene değişiklikleri e-postayla bildir"
                  hint={
                    editFormData.newPassword
                      ? 'Değişen bilgiler ve yeni şifre öğretmenin e-posta adresine gider.'
                      : 'Yalnızca değişen bilgiler gider; hiçbir şey değişmediyse e-posta gönderilmez.'
                  }
                />
              )}

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-line flex items-center justify-end space-x-2.5">
                {/* Aşama 182: iki düğme eşit boyda, ortak düğme görünümü */}
                <button type="button" onClick={() => setEditModalUser(null)} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-32">
                  İptal
                </button>
                <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm h-8 w-32">
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ROL & YETKİ DEĞİŞTİRME (RBAC MODAL) */}
      {/* ========================================================================= */}
      {roleModalUser && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-150">
          <OverlayLayer onClose={() => setRoleModalUser(null)} />
          <div
            className="relative w-full max-w-lg bg-surface border border-line rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg">Rol ve Yetki Ata</h3>
                  <p className="text-xs text-muted">
                    <strong>{roleModalUser.name}</strong> (@{roleModalUser.username}) için sistem rolünü belirleyin.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                aria-label="Kapat" className="ui-btn ui-btn-ghost ui-btn-icon shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Role Options */}
            <div className="space-y-2.5">
              {/* Admin */}
              <div
                onClick={() => setSelectedTargetRole('admin')}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start space-x-3 ${
                  selectedTargetRole === 'admin'
                    ? 'bg-amber-500/15 border-amber-500/60 ring-2 ring-amber-500/20 text-fg'
                    : 'bg-canvas border-line text-fg-2 hover:border-line'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Crown className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-fg inline-flex items-center gap-1">Sistem Yöneticisi (Admin)<InfoTip text="Kendi kurumu açılır: kendi öğretmen, sınıf ve öğrencilerini ekler ve yönetir. Yalnızca sizin açtığınız bölümleri ve izin verdiğiniz sınıfları görür (Yönetim › Kurumlar)." /></span>
                    {selectedTargetRole === 'admin' && <Check className="w-4 h-4 text-amber-700 dark:text-amber-400" />}
                  </div>
                </div>
              </div>

              {/* Teacher */}
              <div
                onClick={() => setSelectedTargetRole('teacher')}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start space-x-3 ${
                  selectedTargetRole === 'teacher'
                    ? 'bg-indigo-500/15 border-indigo-500/60 ring-2 ring-indigo-500/20 text-fg'
                    : 'bg-canvas border-line text-fg-2 hover:border-line'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-fg inline-flex items-center gap-1">Öğretmen (Eğitmen)<InfoTip text="Yetkili olduğu sınıflarda ödev, etüt, soru hedefi, not ve yoklama işlemlerini yapar. Öğrenci, sınıf ve öğretmen ekleyip çıkaramaz." /></span>
                    {selectedTargetRole === 'teacher' && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                  </div>
                </div>
              </div>

            </div>

            {/* Notice */}
            <div className="p-3 bg-canvas rounded-xl border border-line text-[11px] text-muted flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              {/* Aşama 184: kısaltıldı, ayrıntı ⓘ içinde */}
              <span className="flex-1">Yeni yetki en geç 1 saat içinde geçerli olur.</span>
              <InfoTip text="Yetki, kullanıcının giriş hesabına işlenir. Kullanıcı şu an açık oturumdaysa yeni yetkisi çıkış yapıp tekrar girdiğinde, en geç 1 saat içinde tamamen geçerli olur." />
            </div>

            {isTeacherAccount(roleModalUser) && (
              <MailOptIn
                id="teacher-role-notify"
                checked={notifyTeacher}
                onChange={setNotifyTeacher}
                label="Öğretmene yetki değişikliğini e-postayla bildir"
              />
            )}

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 min-w-24"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveRoleChange}
                className="ui-btn ui-btn-sm bg-amber-500 hover:bg-amber-400 text-slate-950 min-w-24"
              >
                Yetkiyi Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ASKIDAN AL / AKTİFLEŞTİR ONAY PENCERESİ */}
      {/* ========================================================================= */}
      {suspendModalUser && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-150">
          <OverlayLayer onClose={() => setSuspendModalUser(null)} />
          <div
            className="relative w-full max-w-md bg-surface border border-line rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Ban className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-fg">
                {suspendModalUser.isSuspended || suspendModalUser.status === 'suspended'
                  ? 'Hesabı Yeniden Aktifleştir'
                  : 'Hesabı Dondur (Askıya Al)'}
              </h3>
              <p className="text-xs text-muted leading-relaxed">
                <strong>{suspendModalUser.name}</strong> (@{suspendModalUser.username}) isimli kullanıcının hesabı{' '}
                {suspendModalUser.isSuspended || suspendModalUser.status === 'suspended'
                  ? 'tekrar aktif hale getirilecek ve sisteme giriş yapabilecektir.'
                  : 'geçici olarak dondurulacak; açık olan oturumları sonlandırılacak ve sisteme girişi engellenecektir.'}
              </p>
            </div>

            {isTeacherAccount(suspendModalUser) && (
              <div className="text-left">
                <MailOptIn
                  id="teacher-status-notify"
                  checked={notifyTeacher}
                  onChange={setNotifyTeacher}
                  label="Öğretmene e-postayla bildir"
                />
              </div>
            )}

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setSuspendModalUser(null)}
                className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 min-w-24"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleSuspension}
                className={`ui-btn ui-btn-sm ${
                  suspendModalUser.isSuspended || suspendModalUser.status === 'suspended'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {suspendModalUser.isSuspended || suspendModalUser.status === 'suspended'
                  ? 'Hesabı Aktifleştir'
                  : 'Hesabı Askıya Al'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: KALICI SİLME ONAY PENCERESİ */}
      {/* ========================================================================= */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-150">
          <OverlayLayer onClose={() => setDeleteModalUser(null)} />
          <div
            className="relative w-full max-w-md bg-surface border border-rose-500/40 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-fg">Kullanıcıyı Kalıcı Olarak Sil</h3>
              <p className="text-xs text-muted leading-relaxed">
                <strong>{deleteModalUser.name}</strong> (@{deleteModalUser.username}) isimli kullanıcının hesabı,
                veritabanı kayıtları ve yetkileri kalıcı olarak silinecektir. Bu işlem geri alınamaz.
              </p>
            </div>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalUser(null)}
                className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 min-w-24"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="ui-btn ui-btn-sm bg-rose-600 hover:bg-rose-500 text-white min-w-24"
              >
                Evet, Kalıcı Olarak Sil
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL 5: ÖĞRETMEN SINIF VE ÖĞRENCİ ERİŞİM YETKİLENDİRMESİ (ERİŞİM MATRİSİ) */}
      {/* ========================================================================= */}
      {authModalTeacher && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-150">
          <OverlayLayer onClose={() => setAuthModalTeacher(null)} />
          <div
            className="relative w-full max-w-2xl bg-surface border border-indigo-500/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-line bg-gradient-to-r from-surface via-indigo-50 dark:via-indigo-950/50 to-surface flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-fg flex items-center space-x-2">
                    <span>Erişim Yetki Matrisi</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-mono border border-indigo-500/30">
                      {authModalTeacher.name}
                    </span>
                  </h3>
                  <p className="text-xs text-muted">
                    Öğretmenin sisteme eriştiğinde görebileceği ve işlem yapabileceği sınıf ile öğrencileri belirleyin.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalTeacher(null)}
                aria-label="Kapat" className="ui-btn ui-btn-ghost ui-btn-icon shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto max-h-[65vh]">
              {/* Info Alert */}
              {/* Aşama 184: tek satır, ayrıntı ⓘ içinde */}
              <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs text-indigo-600 dark:text-indigo-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="flex-1">Öğretmen yalnız burada işaretlenen sınıf ve öğrencileri görür.</span>
                <InfoTip text="Yetkisi olmayan sınıflar ve öğrenciler öğretmenin panelinde hiç listelenmez. Kademe yetkisi verilirse o kademedeki bütün sınıflar da görünür." />
              </div>

              {/* Aşama 102: Görebileceği kademeler */}
              <div className="space-y-1.5">
                {authWideRoles.length > 0 && !kurumRolesOn && (
                  <p className="p-2.5 rounded-xl border text-xs font-semibold bg-warning-soft text-warning-fg border-warning/30" id="teacher-access-role-off">
                    Kurumda "Rol yetkileri" kapalı: {wideRoleText(authWideRoles)} rolü şu an etkin değil; bu kişi yalnızca aşağıda işaretli sınıfları görür. Anahtar Kurum Ayarları'nda.
                  </p>
                )}
                {authExtraRoleNote && (
                  <p className="p-2.5 rounded-xl border text-xs font-semibold bg-info-soft text-info-fg border-info/30" id="teacher-access-role-extra">
                    {authExtraRoleNote}
                  </p>
                )}
                <GradeTicks
                  id="teacher-access-grades"
                  options={authGradeOptions}
                  value={authGrades}
                  onChange={setAuthGrades}
                  roleNote={roleSeesAll ? `${wideRoleText(authWideRoles)} rolü gereği kurumdaki bütün sınıf ve öğrencileri görür; işaretlemek gerekmez.` : undefined}
                />
                {authGradesMissing && (
                  <p className="text-[11px] font-semibold text-warning-fg" id="teacher-access-grades-missing">
                    Kademe için önce Supabase'de sql/102_ogretmen_kademe.sql çalıştırılmalı.
                  </p>
                )}
              </div>

              {/* 1. Sınıf Yetkilendirmeleri */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-fg-2 flex items-center space-x-2">
                    <School className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Sınıf Erişim Yetkileri ({roleSeesAll ? classes.length : new Set([...selectedAuthClassIds, ...gradeCovered]).size}/{classes.length} Sınıf Seçili)</span>
                  </h4>
                  <div className="flex items-center space-x-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedAuthClassIds(classes.map((c) => c.id))}
                      className="px-2 py-0.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 font-medium cursor-pointer"
                    >
                      Tümünü Seç
                    </button>
                    <span className="text-subtle">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedAuthClassIds([])}
                      className="px-2 py-0.5 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 font-medium cursor-pointer"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                {classes.length === 0 ? (
                  <p className="text-xs text-muted italic">Sistemde henüz kayıtlı sınıf bulunmuyor.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {classes.map((cls) => {
                      const viaRole = roleSeesAll;
                      const viaGrade = !viaRole && gradeCovered.has(cls.id);
                      const locked = viaRole || viaGrade;
                      const isChecked = locked || selectedAuthClassIds.includes(cls.id);
                      return (
                        <label
                          key={cls.id}
                          title={viaRole ? 'Rolünden açık; rol değişince kendiliğinden güncellenir' : viaGrade ? 'Kademeden açık; kapatmak için yukarıdan kademeyi kaldırın' : undefined}
                          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${locked ? 'cursor-default' : 'cursor-pointer'} ${
                            isChecked
                              ? 'bg-indigo-600/15 border-indigo-500/50 text-fg'
                              : 'bg-canvas/80 border-line text-muted hover:border-line'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={locked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAuthClassIds([...selectedAuthClassIds, cls.id]);
                                } else {
                                  setSelectedAuthClassIds(selectedAuthClassIds.filter((id) => id !== cls.id));
                                }
                              }}
                              className="rounded bg-surface border-line text-indigo-600 dark:text-indigo-300 focus:ring-0 w-4 h-4 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-bold block truncate text-fg">
                                {cls.name}
                              </span>
                              <span className="text-[10px] text-muted block truncate">
                                {cls.gradeLevel || cls.schoolLevel || cls.branch || 'Genel'}
                              </span>
                            </div>
                          </div>
                          {viaRole ? (
                            <span className="ui-chip ui-chip-info shrink-0 ml-2 text-[10px]">Rolünden</span>
                          ) : viaGrade ? (
                            <span className="ui-chip ui-chip-brand shrink-0 ml-2 text-[10px]">Kademeden</span>
                          ) : (
                            isChecked && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. Bireysel Öğrenci Yetkilendirmeleri */}
              <div className="space-y-3 pt-4 border-t border-line">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-fg-2 flex items-center space-x-2">
                    <GraduationCap className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Bireysel / Etüt Öğrenci Yetkileri ({selectedAuthStudentIds.length} Bireysel Yetkili)</span>
                  </h4>
                </div>

                <p className="text-[11px] text-muted">
                  Sınıf haricinde bu öğretmene özel olarak atanmış bireysel öğrencileri seçebilirsiniz.
                </p>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input autoComplete="off"
                    type="text"
                    placeholder="Öğrenci ara (Ad, Sınıf, Numara)..."
                    value={authStudentSearch}
                    onChange={(e) => setAuthStudentSearch(e.target.value)}
                    className="ui-field w-full pl-9 pr-3.5"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-line">
                  {dataService
                    .getAllStudents()
                    .filter((s) => {
                      if (!authStudentSearch.trim()) return true;
                      const q = authStudentSearch;
                      return (
                        matchTurkishSearch(s.name, q) ||
                        matchTurkishSearch(s.className, q) ||
                        (s.studentNumber || '').includes(q.trim())
                      );
                    })
                    .slice(0, 30)
                    .map((std) => {
                      const isDirectAuth = selectedAuthStudentIds.includes(std.id);
                      const isViaClass = roleSeesAll || selectedAuthClassIds.includes(std.classId) || gradeCovered.has(std.classId);

                      return (
                        <div
                          key={std.id}
                          className="pt-1.5 flex items-center justify-between text-xs py-1"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span className="font-bold text-fg truncate">{std.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted">
                              {std.className}
                            </span>
                            {isViaClass && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-mono">
                                Sınıfından Yetkili
                              </span>
                            )}
                          </div>

                          <label className="flex items-center space-x-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isDirectAuth}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAuthStudentIds([...selectedAuthStudentIds, std.id]);
                                } else {
                                  setSelectedAuthStudentIds(
                                    selectedAuthStudentIds.filter((id) => id !== std.id)
                                  );
                                }
                              }}
                              className="rounded bg-surface border-line text-emerald-600 dark:text-emerald-300 focus:ring-0 w-3.5 h-3.5"
                            />
                            <span className="text-[11px] text-muted">Bireysel İzin</span>
                          </label>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="px-4 sm:px-5 pt-3 border-t border-line bg-canvas">
              <MailOptIn
                id="teacher-access-notify"
                checked={notifyTeacher}
                onChange={setNotifyTeacher}
                label="Öğretmene yetkili sınıflarını e-postayla bildir"
              />
            </div>
            <div className="p-4 sm:p-5 bg-canvas flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setAuthModalTeacher(null)}
                className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 min-w-24"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveAuthModal}
                className="ui-btn ui-btn-sm bg-fg hover:opacity-90 text-canvas min-w-24"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Yetkileri Kaydet ve Uygula</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* YENİ ÖĞRETMEN HESABI */}
      <CreateTeacherAccountModal
        isOpen={isCreateTeacherOpen}
        onClose={() => setIsCreateTeacherOpen(false)}
        onCreated={(name) => {
          showToast(`✓ "${name}" için öğretmen hesabı açıldı.`, 'success');
          loadData();
          reloadContacts();
        }}
      />
      {/* Aşama 144: ÖĞRETMENLERE GİRİŞ BİLGİSİ (SMS / e-posta) */}
      {isCredSendOpen && (
        <React.Suspense fallback={null}>
          <TeacherCredentialSendModal open onClose={() => setIsCredSendOpen(false)} teachers={credTeachers} />
        </React.Suspense>
      )}
      {/* Aşama 149: ÖĞRENCİLERE GİRİŞ BİLGİSİ (sınıf seçimli pencere / tek öğrenci) + yeni verilen şifreler */}
      {stuPickOpen && (
        <React.Suspense fallback={null}>
          <StudentCredentialPickModal open onClose={() => setStuPickOpen(false)} students={credStudents} onNewCredentials={(c: StudentCredential[]) => setStuNewCreds(c)} />
        </React.Suspense>
      )}
      {stuSendOne && (
        <React.Suspense fallback={null}>
          <CredentialSendModal open onClose={() => setStuSendOne(null)} students={[stuSendOne]} allowReset onNewCredentials={(c: StudentCredential[]) => setStuNewCreds(c)} />
        </React.Suspense>
      )}
      {stuNewCreds && stuNewCreds.length > 0 && (
        <React.Suspense fallback={null}>
          <StudentWelcomeCredentialsModal isOpen onClose={() => setStuNewCreds(null)} credentials={stuNewCreds} failures={[]} title="Yeni Giriş Bilgileri" />
        </React.Suspense>
      )}
      {/* Aşama 171: ÖĞRETMEN CİNSİYETİNİ ADDAN DOLDUR */}
      {isGenderFillOpen && (
        <React.Suspense fallback={null}>
          <CinsiyetDoldurModal
            open
            kind="teacher"
            onClose={() => setIsGenderFillOpen(false)}
            people={users
              .filter((u) => u.role !== 'student' && rowManageable(u))
              .map((u) => ({ id: u.id, name: u.name, gender: u.gender, avatar: u.avatar, branch: u.branch, isAdmin: u.isAdmin, sub: u.branch }))}
            onDone={(msg: string) => {
              showToast(`✓ ${msg}`, 'success');
              loadData();
            }}
          />
        </React.Suspense>
      )}
      {/* Aşama 144: EXCEL İLE TOPLU ÖĞRETMEN */}
      {isExcelTeacherOpen && (
        <React.Suspense fallback={null}>
          <TeacherExcelUploadModal
            open
            onClose={() => setIsExcelTeacherOpen(false)}
            onCreated={(n: number) => {
              showToast(`✓ ${n} öğretmenin hesabı açıldı.`, 'success');
              loadData();
              reloadContacts(true);
            }}
          />
        </React.Suspense>
      )}
    </div>
  );
};

// =============================================================================
// Yeni öğretmen hesabı (yalnızca yönetici). Kayıt + giriş hesabı birlikte açılır.
// =============================================================================
interface CreateTeacherAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}

const toUsernameSuggestion = (name: string) =>
  name
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\./g, '')
    .slice(0, 30);

const CreateTeacherAccountContent: React.FC<CreateTeacherAccountModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [branch, setBranch] = useState('');
  const [email, setEmail] = useState('');
  // Aşama 144: telefon ve doğum tarihi korumalı tabloya yazılır (Excel ile eklemeyle aynı veri)
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  // Aşama 171: cinsiyet (elle seçilmediyse addan tahmin)
  const [gender, setGender] = useState<'' | 'K' | 'E'>('');
  const genderTouched = React.useRef(false);
  const [contactNote, setContactNote] = useState<string | null>(null);
  const [password, setPassword] = useState(() => dataService.generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendMail, setSendMail] = useState(true);
  const [mailNotice, setMailNotice] = useState<{ tone: string; text: string } | null>(null);
  useAutoDismiss(mailNotice, () => setMailNotice(null)); // Aşama 32: 15 sn sonra kaybolur
  // Aşama 99b: kurumda açılan hesaba unvan / rol (genel yöneticinin kendi panelinde roller uygulanmadığı için yok)
  const roleUi = !dataService.isHeadAdmin() && dataService.isKurumAdmin() && !!dataService.getMyKurumId();
  const canMudur = dataService.isKurumGecis();
  const rolesOff = roleUi && dataService.getMyKurum().rolesEnabled !== true;
  const [roles, setRoles] = useState<TeacherRole[]>(['ogretmen']);
  const [roleNote, setRoleNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Aşama 102: görebileceği kademeler (kurumdaki sınıflardan)
  const gradeOptions = useMemo(() => gradeOptionsFrom(dataService.getAllClasses()), []);
  const [grades, setGrades] = useState<TeacherGrades>(EMPTY_GRADES);
  const [gradeNote, setGradeNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Aşama 107: geniş görüşlü rol seçilince kademeler "Tümü" kilitli görünür (rol yetkileri açıkken)
  const createWide = roleUi ? roles.filter((r) => WIDE_ROLES.includes(r)) : [];
  const createSeesAll = createWide.length > 0 && !rolesOff;
  // Aşama 147: unvan elle değiştirilmediyse branşa göre otomatik işaretlenir (Rehberlik → Rehberlik, diğer → Öğretmen)
  const [rolesTouched, setRolesTouched] = useState(false);
  const changeBranch = (v: string) => {
    setBranch(v);
    if (!rolesTouched) setRoles([roleFromBranch(v)]);
  };
  const toggleRole = (r: TeacherRole) => {
    setRolesTouched(true);
    setRoles((cur) => {
      if (cur.includes(r)) return cur.filter((x) => x !== r);
      // Zümre başkanı öğretmen rolüyle birlikte verilir
      return r === 'zumre_baskani' && !cur.includes('ogretmen') ? [...cur, r, 'ogretmen'] : [...cur, r];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const phoneN = normalizeTurkishPhone(phone);
    if (!phoneN.valid) {
      setError(PHONE_ERROR);
      return;
    }
    setIsSaving(true);
    try {
      const wanted = roleUi ? roles.filter((r) => r !== 'zumre_baskani' || branch.trim()) : [];
      const res = await dataService.createTeacherAccount({ name, username, branch, email, password, gender: gender || undefined });
      // Roller hesapla birlikte verilir; verilemezse hesap yine açılmış olur (Unvanlar ve Roller'den verilir)
      if (wanted.length) {
        try {
          const saved = await saveTeacherRoles(res.teacher.id, wanted);
          setRoleNote({ ok: true, text: `Unvan: ${saved.map(roleLabel).join(', ')}` });
        } catch (er: any) {
          setRoleNote({ ok: false, text: `Rol verilemedi (${er?.message || 'hata'}). "Unvanlar ve Roller" bölümünden verin.` });
        }
      }
      // Aşama 102: kademeler hesapla birlikte verilir; verilemezse erişim (kalkan) penceresinden verilir
      if (!createSeesAll && (grades.all || grades.grades.length)) {
        try {
          if (!res.teacher.auth_user_id) throw new Error('giriş hesabı bulunamadı');
          const g = await saveTeacherGrades(res.teacher.auth_user_id, grades);
          setGradeNote({ ok: true, text: `Kademe: ${gradesLabel(g)} (${g.classes} sınıf)` });
        } catch (er: any) {
          setGradeNote({ ok: false, text: `Kademe verilemedi (${er?.message || 'hata'}). Listedeki kalkan (erişim) düğmesinden verin.` });
        }
      }
      if (phoneN.value || birthDate) {
        try {
          await saveTeacherContact(res.teacher.id, { phone: phoneN.value, birthDate });
        } catch (er: any) {
          setContactNote(`Telefon / doğum tarihi kaydedilemedi (${er?.message || 'hata'}). Düzenle penceresinden yeniden girin.`);
        }
      }
      setCreated({ name: res.teacher.name, username: res.teacher.username, password: res.password });
      onCreated(res.teacher.name);
      // Hesap bilgileri öğretmenin e-posta adresine gönderilir (adres kayıttan okunur)
      if (sendMail && email.trim()) {
        setMailNotice({ tone: 'info', text: 'Giriş bilgileri öğretmene e-postayla gönderiliyor…' });
        notifyTeacherByMail(res.teacher.id, 'created', { password: res.password }).then(setMailNotice);
      } else if (sendMail) {
        setMailNotice({ tone: 'warning', text: 'E-posta adresi yazılmadığı için e-posta gönderilmedi; bilgileri aşağıdan kopyalayıp iletin.' });
      }
    } catch (err: any) {
      setError(err?.message || 'Öğretmen hesabı açılamadı.');
    } finally {
      setIsSaving(false);
    }
  };

  const credentialText = created
    ? `Merhaba ${created.name},\nbiliredu öğretmen giriş bilgileriniz:\nAdres: ${window.location.origin}\nGiriş ekranında "Öğretmen" sekmesini seçiniz.\nKullanıcı adı: ${created.username}\nŞifre: ${created.password}\nGiriş yaptıktan sonra profil menüsünden şifrenizi değiştiriniz.`
    : '';

  // Aşama 236: pencere ortak Modal kabuğunda; kutular ui-field (32 px, 12 px yazı), etiketler FieldLabel,
  // seçim düğmeleri GradeTicks ile aynı ölçü (secimCls). Alanlar ve işlev aynı; yalnız görünüm sadeleşti.
  const noteCls = (tone: 'ok' | 'warn' | 'info' | 'danger') =>
    `px-3 py-2 rounded-lg text-xs font-medium ${
      tone === 'ok'
        ? 'bg-success-soft text-success-fg'
        : tone === 'warn'
          ? 'bg-warning-soft text-warning-fg'
          : tone === 'danger'
            ? 'bg-danger-soft text-danger-fg'
            : 'bg-info-soft text-info-fg'
    }`;
  const mailTone = (t: string) => (t === 'success' ? 'ok' : t === 'danger' ? 'danger' : t === 'warning' ? 'warn' : 'info');

  return (
    <Modal
      open
      onClose={onClose}
      id="teacher-create-modal"
      icon={UserPlus}
      title="Yeni Öğretmen Hesabı"
      description="Öğretmen, kullanıcı adı ve bu şifreyle giriş yapar."
      size="md"
      layerClass="z-[9999]"
      closeOnBackdrop={false}
      footer={
        created ? (
          <>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(credentialText);
                  setCopied(true);
                } catch {
                  void appCopyFallback('Giriş bilgileri', credentialText);
                }
              }}
              className="ui-btn ui-btn-secondary"
            >
              {copied ? <Check className="text-success-fg" /> : <Copy />}
              <span>{copied ? 'Kopyalandı' : 'Bilgileri Kopyala'}</span>
            </button>
            <button type="button" onClick={onClose} className="ui-btn ui-btn-primary">
              Kapat
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
              Vazgeç
            </button>
            <button type="submit" form="teacher-create-form" disabled={isSaving} className="ui-btn ui-btn-primary">
              {isSaving ? 'Hesap açılıyor...' : 'Hesabı Aç'}
            </button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-3">
          <div className={noteCls('ok')}>
            Hesap açıldı. Şifre güvenlik nedeniyle saklanmaz; bu pencereyi kapatmadan önce öğretmene iletiniz.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="px-3 py-2 rounded-lg bg-surface-2 border border-line">
              <span className="block text-[11px] text-muted">Kullanıcı adı</span>
              <span className="font-mono text-sm font-semibold text-fg select-all">{created.username}</span>
            </div>
            <div className="px-3 py-2 rounded-lg bg-surface-2 border border-line">
              <span className="block text-[11px] text-muted">Şifre</span>
              <span className="font-mono text-sm font-semibold text-fg select-all">{created.password}</span>
            </div>
          </div>
          {contactNote && <div className={noteCls('warn')}>{contactNote}</div>}
          {roleNote && (
            <div id="teacher-create-role-note" className={noteCls(roleNote.ok ? 'info' : 'warn')}>
              {roleNote.text}
            </div>
          )}
          {gradeNote && (
            <div id="teacher-create-grade-note" className={noteCls(gradeNote.ok ? 'info' : 'warn')}>
              {gradeNote.text}
            </div>
          )}
          {mailNotice && (
            <div id="teacher-create-mail-notice" className={noteCls(mailTone(mailNotice.tone))}>
              E-posta: {mailNotice.text}
            </div>
          )}
        </div>
      ) : (
        <form id="teacher-create-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className={`${noteCls('danger')} flex items-start gap-2`} role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          {/* Hesap */}
          <section className="space-y-3">
            <h3 className="ui-eyebrow">Hesap</h3>
            <div>
              <FieldLabel htmlFor="teacher-create-name">Ad Soyad *</FieldLabel>
              <input
                id="teacher-create-name"
                autoComplete="off"
                autoFocus
                required
                value={name}
                onChange={(e) => {
                  const v = e.target.value;
                  setName(v);
                  if (!usernameTouched) setUsername(toUsernameSuggestion(v));
                  if (!genderTouched.current) {
                    void import('../../lib/cinsiyetTahmin').then(({ cinsiyetTahmin }) => {
                      if (!genderTouched.current) setGender(cinsiyetTahmin(v) || '');
                    });
                  }
                }}
                placeholder="Örn: Ayşe Demir"
                className="ui-field"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="teacher-create-username">Kullanıcı adı *</FieldLabel>
                <input
                  id="teacher-create-username"
                  autoComplete="off"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsernameTouched(true);
                    setUsername(trFold(e.target.value)); // Aşama 154: ş→s, ı→i (giriş adı yalnız ASCII)
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Örn: aysedemir"
                  className="ui-field font-mono"
                />
                <p className="text-[11px] text-muted mt-1">Küçük harf, rakam, - ve _ ; Türkçe karakter ve boşluk olmadan.</p>
              </div>
              <div>
                <FieldLabel htmlFor="teacher-create-password">Giriş şifresi *</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    id="teacher-create-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other"
                    className="ui-field font-mono font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setPassword(dataService.generatePassword())}
                    className="ui-btn ui-btn-secondary shrink-0"
                    title="Yeni şifre üret"
                  >
                    <RefreshCw />
                    <span>Üret</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Kişisel bilgiler */}
          <section className="space-y-3 pt-4 border-t border-line">
            <h3 className="ui-eyebrow">Kişisel bilgiler</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="teacher-create-branch">Branş</FieldLabel>
                <input id="teacher-create-branch" autoComplete="off" value={branch} onChange={(e) => changeBranch(e.target.value)} placeholder="Örn: Matematik" className="ui-field" />
              </div>
              <div>
                <FieldLabel htmlFor="teacher-create-email">E-posta</FieldLabel>
                <input id="teacher-create-email" autoComplete="off" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="isteğe bağlı" className="ui-field" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <FieldLabel htmlFor="teacher-create-phone">Telefon</FieldLabel>
                <input autoComplete="off" type="tel" id="teacher-create-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XX XXX XX XX" className="ui-field" />
              </div>
              <div>
                <FieldLabel htmlFor="teacher-create-birth">Doğum tarihi</FieldLabel>
                <input autoComplete="off" type="date" id="teacher-create-birth" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="ui-field" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <FieldLabel htmlFor="teacher-create-gender">Cinsiyet</FieldLabel>
                <SelectBox
                  id="teacher-create-gender"
                  value={gender}
                  onChange={(e) => {
                    genderTouched.current = true;
                    setGender(e.target.value as '' | 'K' | 'E');
                  }}
                >
                  <option value="">Seçiniz</option>
                  <option value="K">Kadın</option>
                  <option value="E">Erkek</option>
                </SelectBox>
              </div>
            </div>
          </section>

          {/* Yetki ve erişim */}
          <section className="space-y-4 pt-4 border-t border-line">
            <h3 className="ui-eyebrow">Yetki ve erişim</h3>
            {/* Aşama 99b: unvan / rol (kurumda) */}
            {roleUi && (
              <div id="teacher-create-roles">
                <FieldLabel>Unvan / Rol</FieldLabel>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Unvan / Rol">
                  {ROLE_DEFS.filter((r) => r.code !== 'mudur' || canMudur).map((r) => {
                    const on = roles.includes(r.code);
                    const locked = r.code === 'zumre_baskani' && !branch.trim();
                    return (
                      <button
                        key={r.code}
                        type="button"
                        id={`teacher-create-role-${r.code}`}
                        aria-pressed={on}
                        disabled={locked || (r.code === 'ogretmen' && on && roles.includes('zumre_baskani'))}
                        title={locked ? 'Zümre başkanı için önce branşı yazın' : r.description}
                        onClick={() => toggleRole(r.code)}
                        className={secimCls(on)}
                      >
                        {on && <Check className="w-3.5 h-3.5" />}
                        {r.short}
                      </button>
                    );
                  })}
                </div>
                {rolesOff && (
                  <p className="text-[11px] font-medium text-warning-fg mt-1.5" id="teacher-create-roles-off">
                    Kurumda rol yetkileri kapalı: roller kaydedilir, rol yetkileri açılınca uygulanır.
                  </p>
                )}
                <p className="text-[11px] text-muted mt-1.5">Sonradan "Unvanlar ve Roller" bölümünden değiştirilir.</p>
              </div>
            )}
            <GradeTicks
              id="teacher-create-grades"
              options={gradeOptions}
              value={grades}
              onChange={setGrades}
              roleNote={createSeesAll ? `${wideRoleText(createWide)} rolü gereği kurumdaki bütün sınıf ve öğrencileri görür; kademe seçmek gerekmez.` : undefined}
            />
            <p className="text-[11px] text-muted flex items-center gap-1">
              Tek tek sınıf / öğrenci erişimi
              <InfoTip text="Kademe dışında tek tek sınıf ya da öğrenci vermek için listedeki kalkan (erişim) düğmesini kullanınız." />
            </p>
          </section>

          <MailOptIn
            id="teacher-create-notify"
            checked={sendMail}
            onChange={setSendMail}
            label="Giriş bilgilerini öğretmene e-postayla gönder"
            hint={email.trim() ? 'Kullanıcı adı, şifre ve giriş adresi öğretmenin e-posta adresine gider.' : 'Göndermek için yukarıya öğretmenin e-posta adresini yazın.'}
          />
        </form>
      )}
    </Modal>
  );
};

const CreateTeacherAccountModal: React.FC<CreateTeacherAccountModalProps> = (props) =>
  props.isOpen ? <CreateTeacherAccountContent {...props} /> : null;
