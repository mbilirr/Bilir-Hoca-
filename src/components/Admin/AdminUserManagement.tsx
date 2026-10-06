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
} from 'lucide-react';
import { UnifiedUser, SystemRole, UserStatus, Teacher, ClassGroup, Student } from '../../types';
import { dataService } from '../../services/dataService';
import { StudentApplicationsPanel } from './StudentApplicationsPanel';
import { callMail, describeMailResult } from '../../lib/mailApi';
import { MailOptIn } from '../Teacher/FormParts';

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
}

export const AdminUserManagement: React.FC<AdminUserManagementProps> = ({
  currentAdmin,
  onNavigateHome,
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
  const [kurumFilter, setKurumFilter] = useState<string>('');

  // Modal states
  const [editModalUser, setEditModalUser] = useState<UnifiedUser | null>(null);
  const [roleModalUser, setRoleModalUser] = useState<UnifiedUser | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<UnifiedUser | null>(null);
  const [suspendModalUser, setSuspendModalUser] = useState<UnifiedUser | null>(null);
  const [authModalTeacher, setAuthModalTeacher] = useState<UnifiedUser | null>(null);
  const [selectedAuthClassIds, setSelectedAuthClassIds] = useState<string[]>([]);
  const [selectedAuthStudentIds, setSelectedAuthStudentIds] = useState<string[]>([]);
  const [authStudentSearch, setAuthStudentSearch] = useState('');

  // Edit form state
  const [editFormData, setEditFormData] = useState<{
    name: string;
    username: string;
    email: string;
    phone: string;
    branch: string;
    classId: string;
    className: string;
    studentNumber: string;
    schoolLevel: 'Ortaokul' | 'Lise';
    newPassword: string;
    mustChangePassword: boolean;
    assignedClassIds: string[];
    canViewAllStudentsAndClasses: boolean;
  }>({
    name: '',
    username: '',
    email: '',
    phone: '',
    branch: '',
    classId: '',
    className: '',
    studentNumber: '',
    schoolLevel: 'Ortaokul',
    newPassword: '',
    mustChangePassword: false,
    assignedClassIds: [],
    canViewAllStudentsAndClasses: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [selectedTargetRole, setSelectedTargetRole] = useState<SystemRole>('teacher');
  const [isCreateTeacherOpen, setIsCreateTeacherOpen] = useState(false);
  const [notifyTeacher, setNotifyTeacher] = useState(true);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 3500);
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
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === 'admin').length;
    const teachers = users.filter((u) => u.role === 'teacher').length;
    const students = users.filter((u) => u.role === 'student').length;
    const suspended = users.filter((u) => u.isSuspended || u.status === 'suspended').length;
    const pending = users.filter((u) => u.status === 'pending').length;
    return { total, admins, teachers, students, suspended, pending };
  }, [users]);

  // Filtered Users (Aşama 15: arama bir adım geriden gelir, liste parça parça çizilir)
  const deferredQuery = useDeferredValue(searchQuery);
  const filteredUsers = useMemo(() => {
    const searchQuery = deferredQuery;
    return users.filter((u) => {
      // Role filter
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
        const q = searchQuery.toLowerCase().trim();
        const inName = (u.name || '').toLowerCase().includes(q);
        const inUsername = (u.username || '').toLowerCase().includes(q);
        const inEmail = (u.email || '').toLowerCase().includes(q);
        const inPhone = (u.phone || '').includes(q);
        const inBranch = (u.branch || '').toLowerCase().includes(q);
        const inClass = (u.className || '').toLowerCase().includes(q);
        const inNumber = (u.studentNumber || '').includes(q);
        return inName || inUsername || inEmail || inPhone || inBranch || inClass || inNumber;
      }

      return true;
    });
  }, [users, roleFilter, statusFilter, deferredQuery, kurumFilter]);
  const pagedUsers = usePagedList(filteredUsers, `${deferredQuery}|${roleFilter}|${statusFilter}|${kurumFilter}`);

  // Aşama 18: genel yönetici her şeyi, kurum yöneticisi yalnızca kendi kurumunu yönetir
  const isHead = dataService.isHeadAdmin();
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
  const isSuperAdmin = Boolean(currentAdmin?.isAdmin) && dataService.canAccessUserManagement();

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
            className="px-5 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg text-xs font-bold transition-all border border-line cursor-pointer"
          >
            Öğretmen Paneline Dön
          </button>
        </div>
      </div>
    );
  }


  // Open Edit Form
  const handleOpenEdit = (user: UnifiedUser) => {
    setEditModalUser(user);
    setNotifyTeacher(true);
    setEditFormData({
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      phone: user.phone || '',
      branch: user.branch || '',
      classId: user.classId || (classes[0]?.id || ''),
      className: user.className || '',
      studentNumber: user.studentNumber || '',
      schoolLevel: user.schoolLevel || 'Ortaokul',
      newPassword: '',
      mustChangePassword: !!user.mustChangePassword,
      assignedClassIds: user.assignedClassIds || [],
      canViewAllStudentsAndClasses: !!user.canViewAllStudentsAndClasses,
    });
    setShowPassword(false);
    setCopiedPassword(false);
  };

  // Submit Edit Form
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalUser) return;

    const before = editModalUser;
    try {
      await dataService.adminUpdateUserProfile(editModalUser.id, {
        name: editFormData.name,
        username: editFormData.username,
        email: editFormData.email,
        phone: editFormData.phone,
        branch: editFormData.branch,
        classId: editFormData.classId,
        className: editFormData.className,
        studentNumber: editFormData.studentNumber,
        schoolLevel: editFormData.schoolLevel,
        mustChangePassword: editFormData.mustChangePassword,
        newPassword: editFormData.newPassword ? editFormData.newPassword : undefined,
        assignedClassIds: editFormData.assignedClassIds,
        canViewAllStudentsAndClasses: editFormData.canViewAllStudentsAndClasses,
      });

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
        if (norm(editFormData.phone) !== norm(before.phone)) changes.push({ label: 'Telefon', value: norm(editFormData.phone) || '(silindi)' });
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

  // Open Teacher Authorization Modal
  const handleOpenAuthModal = async (teacher: UnifiedUser) => {
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
      const cloudAccess = await dataService.getTeacherCloudAccess(authUserId);
      setSelectedAuthClassIds(cloudAccess.classIds || []);
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
      await dataService.adminUpdateTeacherAuthorizations(
        authModalTeacher.id,
        selectedAuthClassIds,
        selectedAuthStudentIds
      );
      showToast(
        `✓ "${authModalTeacher.name}" için sınıf ve öğrenci erişim yetkileri başarıyla güncellendi.`,
        'success'
      );
      // SADECE başarılı olduğunda modalı kapat
      const accessTeacher = authModalTeacher;
      setAuthModalTeacher(null);
      loadData();
      if (notifyTeacher) sendTeacherMail(accessTeacher.id, 'access');
    } catch (err: any) {
      // Hata durumunda modal KAPANMAZ, admin hatayı görüp düzeltebilir
      showToast(err.message || 'Yetkilendirme veritabanına kaydedilemedi.', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
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
        </div>
      </div>

      {/* Öğrenci kayıt başvuruları (onay / red) */}
      {isHead && <StudentApplicationsPanel classes={classes} onToast={showToast} />}

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

      {/* Filter and Search Bar */}
      <div className="bg-surface/95 border border-line rounded-2xl p-4 shadow-md flex flex-col gap-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="İsim, kullanıcı adı, e-posta, telefon, branş veya sınıf ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-canvas border border-line rounded-xl text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
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

          <div className="flex items-center space-x-2 flex-wrap sm:flex-nowrap">
            {/* Role Filter */}
            <div className="flex items-center space-x-1.5 bg-canvas border border-line rounded-xl px-2.5 py-1.5">
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
            {isHead && kurumOptions.length > 0 && (
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

            {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || kurumFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('all');
                  setStatusFilter('all');
                  setKurumFilter('');
                }}
                className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg text-xs font-bold transition-colors cursor-pointer"
              >
                Temizle
              </button>
            )}
          </div>
        </div>

        {/* Quick Role & Status Filter Pill Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-line">
          <span className="text-[11px] font-bold text-muted">Hızlı Filtre:</span>
          <button
            type="button"
            onClick={() => {
              setRoleFilter('all');
              setStatusFilter('all');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
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
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
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
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
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
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
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
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
              statusFilter === 'pending'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-surface-2 hover:bg-surface-3 text-orange-700 dark:text-orange-300'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Onay Bekleyen ({stats.pending})</span>
          </button>
        </div>
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
                              {u.avatar ? (
                                <img loading="lazy" decoding="async" src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs font-bold text-fg-2">
                                  {u.name.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            {u.role === 'admin' && (
                              <span
                                className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center text-[9px] shadow-sm font-black"
                                title="Yönetici (Admin)"
                              >
                                👑
                              </span>
                            )}
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

                          {u.phone ? (
                            <div className="flex items-center space-x-1 text-muted">
                              <Phone className="w-3 h-3 text-muted shrink-0" />
                              <span>{u.phone}</span>
                            </div>
                          ) : null}
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
                            {u.canViewAllStudentsAndClasses ? (
                              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">Tüm Sınıflar</span>
                            ) : u.assignedClassIds && u.assignedClassIds.length > 0 ? (
                              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                                {u.assignedClassIds.length} Sınıf Yetkili
                              </span>
                            ) : null}
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
                          {u.role !== 'student' && manageable && (isHead || u.role === 'teacher') && (
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
              <button
                type="button"
                onClick={() => setEditModalUser(null)}
                className="p-2 rounded-xl text-muted hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEdit} className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Ad Soyad */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">Ad Soyad</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-canvas border border-line rounded-xl text-xs text-fg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Kullanıcı Adı */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    required
                    value={editFormData.username}
                    onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-canvas border border-line rounded-xl text-xs text-fg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* E-posta */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">E-posta Adresi</label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-canvas border border-line rounded-xl text-xs text-fg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Telefon */}
                <div>
                  <label className="block text-xs font-bold text-fg-2 mb-1">Telefon Numarası</label>
                  <input
                    type="tel"
                    placeholder="05XX XXX XX XX"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-canvas border border-line rounded-xl text-xs text-fg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Öğretmen / Admin Branşı */}
                {editModalUser.role !== 'student' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-fg-2 mb-1">Branş / Görev</label>
                    <input
                      type="text"
                      placeholder="Örn: Fen Bilgisi Öğretmeni, Matematik, Kurum Müdürü"
                      value={editFormData.branch}
                      onChange={(e) => setEditFormData({ ...editFormData, branch: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-canvas border border-line rounded-xl text-xs text-fg focus:outline-none focus:border-indigo-500"
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
                        className="w-full px-3.5 py-2.5 bg-canvas border border-line rounded-xl text-xs text-fg focus:outline-none focus:border-indigo-500 cursor-pointer"
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
                      <input
                        type="text"
                        placeholder="Örn: 482"
                        value={editFormData.studentNumber}
                        onChange={(e) => setEditFormData({ ...editFormData, studentNumber: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-canvas border border-line rounded-xl text-xs text-fg focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Şifre Güncelleme Bölümü (Admin Password Override) */}
              <div className="pt-3 border-t border-line">
                <div className="bg-canvas/80 border border-line rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Key className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                      <span className="text-xs font-bold text-fg">Şifre Değiştir (Admin Override)</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                      <span>Rastgele Şifre Üret</span>
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Değiştirmek istemiyorsanız boş bırakın"
                      value={editFormData.newPassword}
                      onChange={(e) => setEditFormData({ ...editFormData, newPassword: e.target.value })}
                      className="w-full pl-3.5 pr-20 py-2.5 bg-surface border border-line rounded-xl text-xs text-fg font-mono placeholder:font-sans focus:outline-none focus:border-amber-500"
                    />

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                      {editFormData.newPassword && (
                        <button
                          type="button"
                          onClick={handleCopyPassword}
                          className="p-1 rounded-lg hover:bg-surface-2 text-muted hover:text-fg"
                          title="Şifreyi Kopyala"
                        >
                          {copiedPassword ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1 rounded-lg hover:bg-surface-2 text-muted hover:text-fg"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {editFormData.newPassword && (
                    <div className="flex items-center justify-between text-[11px] text-amber-700/80 dark:text-amber-300/80 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                      <span>Belirlenen Yeni Şifre: <strong>{editFormData.newPassword}</strong></span>
                      {copiedPassword && <span className="text-emerald-700 dark:text-emerald-400 font-bold">✓ Panoya Kopyalandı</span>}
                    </div>
                  )}

                  <label className="flex items-center space-x-2 text-xs text-muted cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={editFormData.mustChangePassword}
                      onChange={(e) => setEditFormData({ ...editFormData, mustChangePassword: e.target.checked })}
                      className="rounded bg-surface border-line text-indigo-600 dark:text-indigo-300 focus:ring-0"
                    />
                    <span>İlk girişte kullanıcının şifresini değiştirmesini zorunlu kıl</span>
                  </label>
                </div>
              </div>

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
                <button
                  type="button"
                  onClick={() => setEditModalUser(null)}
                  className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg-2 text-xs font-bold transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-950 cursor-pointer"
                >
                  Değişiklikleri Kaydet
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
                className="text-muted hover:text-fg"
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
                    <span className="text-xs font-black text-fg">Sistem Yöneticisi (Admin)</span>
                    {selectedTargetRole === 'admin' && <Check className="w-4 h-4 text-amber-700 dark:text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">
                    Kendi kurumu açılır: kendi öğretmen, sınıf ve öğrencilerini ekler ve yönetir. Yalnızca sizin açtığınız bölümleri ve izin verdiğiniz sınıfları görür (Yönetim › Kurumlar).
                  </p>
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
                    <span className="text-xs font-black text-fg">Öğretmen (Eğitmen)</span>
                    {selectedTargetRole === 'teacher' && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">
                    Yetkili olduğu sınıflarda ödev, etüt, soru hedefi, not ve yoklama işlemlerini yapar. Öğrenci, sınıf ve öğretmen ekleyip çıkaramaz.
                  </p>
                </div>
              </div>

            </div>

            {/* Notice */}
            <div className="p-3 bg-canvas rounded-xl border border-line text-[11px] text-muted flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              <span>Yetki, kullanıcının giriş hesabına işlenir. Kullanıcı açık oturumdaysa yeni yetkisi çıkış yapıp tekrar girdiğinde (en geç 1 saat içinde) tamamen geçerli olur.</span>
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
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg-2 text-xs font-bold transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveRoleChange}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all shadow-md cursor-pointer"
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
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg-2 text-xs font-bold transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleSuspension}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
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
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg-2 text-xs font-bold transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md shadow-rose-950 cursor-pointer"
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
                className="p-2 rounded-xl text-muted hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto max-h-[65vh]">
              {/* Info Alert */}
              <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-xs text-indigo-600 dark:text-indigo-200 flex items-start space-x-2.5">
                <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Güvenlik Kuralı:</strong> Bir öğretmen yalnızca burada yönetici tarafından yetkilendirilen sınıfları ve öğrencileri görebilir. Yetkisi olmayan sınıflar ve öğrenciler öğretmenin panelinde hiçbir şekilde listelenmez.
                </p>
              </div>

              {/* 1. Sınıf Yetkilendirmeleri */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-fg-2 flex items-center space-x-2">
                    <School className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Sınıf Erişim Yetkileri ({selectedAuthClassIds.length}/{classes.length} Sınıf Seçili)</span>
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
                      const isChecked = selectedAuthClassIds.includes(cls.id);
                      return (
                        <label
                          key={cls.id}
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-indigo-600/15 border-indigo-500/50 text-fg'
                              : 'bg-canvas/80 border-line text-muted hover:border-line'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
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
                          {isChecked && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />}
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
                  <input
                    type="text"
                    placeholder="Öğrenci ara (Ad, Sınıf, Numara)..."
                    value={authStudentSearch}
                    onChange={(e) => setAuthStudentSearch(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-canvas border border-line rounded-xl text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-line">
                  {dataService
                    .getAllStudents()
                    .filter((s) => {
                      if (!authStudentSearch.trim()) return true;
                      const q = authStudentSearch.toLowerCase();
                      return (
                        s.name.toLowerCase().includes(q) ||
                        (s.className || '').toLowerCase().includes(q) ||
                        (s.studentNumber || '').includes(q)
                      );
                    })
                    .slice(0, 30)
                    .map((std) => {
                      const isDirectAuth = selectedAuthStudentIds.includes(std.id);
                      const isViaClass = selectedAuthClassIds.includes(std.classId);

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
                className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg-2 text-xs font-bold transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveAuthModal}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-950 flex items-center space-x-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
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
        }}
      />
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
  const [password, setPassword] = useState(() => dataService.generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendMail, setSendMail] = useState(true);
  const [mailNotice, setMailNotice] = useState<{ tone: string; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const res = await dataService.createTeacherAccount({ name, username, branch, email, password });
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
    ? `Merhaba ${created.name},\nEğitim & Öğrenci Takip Sistemi öğretmen giriş bilgileriniz:\nAdres: ${window.location.origin}\nGiriş ekranında "Öğretmen" sekmesini seçiniz.\nKullanıcı adı: ${created.username}\nŞifre: ${created.password}\nGiriş yaptıktan sonra profil menüsünden şifrenizi değiştiriniz.`
    : '';

  const inputCls =
    'w-full px-3 py-2 bg-canvas border border-line rounded-xl text-fg text-xs focus:outline-none focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center">
      <div className="relative w-full max-w-md bg-surface border border-line rounded-3xl shadow-2xl p-6 space-y-4 my-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-fg">Yeni Öğretmen Hesabı</h3>
              <p className="text-xs text-muted">Öğretmen, kullanıcı adı ve bu şifreyle giriş yapar.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-fg" aria-label="Kapat">
            <X className="w-5 h-5" />
          </button>
        </div>

        {created ? (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-200 text-xs">
              Hesap açıldı. Şifre güvenlik nedeniyle saklanmaz; bu pencereyi kapatmadan önce öğretmene iletiniz.
            </div>
            {mailNotice && (
              <div
                id="teacher-create-mail-notice"
                className={`p-3 rounded-xl border text-xs font-semibold ${
                  mailNotice.tone === 'success'
                    ? 'bg-success-soft text-success-fg border-success/30'
                    : mailNotice.tone === 'danger'
                      ? 'bg-danger-soft text-danger-fg border-danger/30'
                      : mailNotice.tone === 'warning'
                        ? 'bg-warning-soft text-warning-fg border-warning/30'
                        : 'bg-info-soft text-info-fg border-info/30'
                }`}
              >
                E-posta: {mailNotice.text}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-canvas border border-line">
                <span className="block text-[10px] text-muted">Kullanıcı adı</span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-300 select-all">{created.username}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-canvas border border-line">
                <span className="block text-[10px] text-muted">Şifre</span>
                <span className="font-mono font-bold text-amber-700 dark:text-amber-300 select-all">{created.password}</span>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(credentialText);
                    setCopied(true);
                  } catch {
                    window.prompt('Kopyalamak için metni seçiniz:', credentialText);
                  }
                }}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg text-xs font-bold border border-line"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>Bilgileri Kopyala</span>
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
                Kapat
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-200 text-xs flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div>
              <label className="block text-[11px] font-bold text-fg-2 mb-1">Ad Soyad *</label>
              <input
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!usernameTouched) setUsername(toUsernameSuggestion(e.target.value));
                }}
                placeholder="Örn: Ayşe Demir"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-fg-2 mb-1">Kullanıcı adı * (giriş adı)</label>
              <input
                required
                value={username}
                onChange={(e) => {
                  setUsernameTouched(true);
                  setUsername(e.target.value.toLowerCase());
                }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Örn: aysedemir"
                className={`${inputCls} font-mono`}
              />
              <p className="text-[10px] text-muted mt-1">Küçük harf, rakam, - ve _ (Türkçe karakter ve boşluk olmadan).</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-fg-2 mb-1">Branş</label>
                <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Örn: Matematik" className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-fg-2 mb-1">E-posta (iletişim)</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="isteğe bağlı" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-fg-2 mb-1">Giriş şifresi *</label>
              <div className="flex items-center space-x-2">
                <input
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={`${inputCls} font-mono font-bold`}
                />
                <button
                  type="button"
                  onClick={() => setPassword(dataService.generatePassword())}
                  className="px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-indigo-600 dark:text-indigo-300 text-xs font-bold border border-line shrink-0"
                >
                  🎲 Üret
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted">
              Hesap açıldıktan sonra öğretmenin hangi sınıfları göreceğini listedeki kalkan (erişim) düğmesiyle belirleyiniz.
            </p>
            <MailOptIn
              id="teacher-create-notify"
              checked={sendMail}
              onChange={setSendMail}
              label="Giriş bilgilerini öğretmene e-postayla gönder"
              hint={email.trim() ? 'Kullanıcı adı, şifre ve giriş adresi öğretmenin e-posta adresine gider.' : 'Göndermek için yukarıya öğretmenin e-posta adresini yazın.'}
            />
            <div className="flex justify-end space-x-2 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg-2 text-xs font-bold">
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold"
              >
                {isSaving ? 'Hesap açılıyor...' : 'Hesabı Aç'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const CreateTeacherAccountModal: React.FC<CreateTeacherAccountModalProps> = (props) =>
  props.isOpen ? <CreateTeacherAccountContent {...props} /> : null;
