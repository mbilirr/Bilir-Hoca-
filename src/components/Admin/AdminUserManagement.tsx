import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { UnifiedUser, SystemRole, UserStatus, Teacher, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';

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

  // Modal states
  const [editModalUser, setEditModalUser] = useState<UnifiedUser | null>(null);
  const [roleModalUser, setRoleModalUser] = useState<UnifiedUser | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<UnifiedUser | null>(null);
  const [suspendModalUser, setSuspendModalUser] = useState<UnifiedUser | null>(null);

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

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 3500);
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

  // Route Guard: Sadece yöneticiler erişebilir
  const isSuperAdmin =
    !!currentAdmin?.isAdmin ||
    currentAdmin?.id === 'teacher-1' ||
    currentAdmin?.username?.toLowerCase() === 'mustafa bilir' ||
    currentAdmin?.name?.toLowerCase() === 'mustafa bilir';

  if (!isSuperAdmin) {
    return (
      <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-2xl space-y-4 my-8 animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">Yetkisiz Erişim (403 Forbidden)</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Bu alan <strong>Rol Tabanlı Yetkilendirme (RBAC)</strong> kuralları gereği yalnızca Kurum Yöneticisi (Admin) erişimine açıktır.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all border border-slate-700 cursor-pointer"
          >
            Öğretmen Paneline Dön
          </button>
        </div>
      </div>
    );
  }

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

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Role filter
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;

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
  }, [users, roleFilter, statusFilter, searchQuery]);

  // Open Edit Form
  const handleOpenEdit = (user: UnifiedUser) => {
    setEditModalUser(user);
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
    } catch (err: any) {
      showToast(err.message || 'Güncelleme sırasında hata oluştu.', 'error');
    }
  };

  // Generate Random Password
  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!#@';
    let res = 'Egitim#';
    for (let i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    res += '!';
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
    setSelectedTargetRole(user.role);
  };

  // Save Role Change
  const handleSaveRoleChange = async () => {
    if (!roleModalUser) return;
    try {
      await dataService.adminChangeUserRole(roleModalUser.id, selectedTargetRole);
      showToast(`✓ ${roleModalUser.name} kullanıcısının rolü "${selectedTargetRole.toUpperCase()}" olarak değiştirildi.`, 'success');
      setRoleModalUser(null);
      loadData();
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
      setSuspendModalUser(null);
      loadData();
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

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[10000] max-w-md animate-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border text-xs sm:text-sm font-bold flex items-center space-x-2.5 backdrop-blur-xl ${
              toastMsg.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
                : toastMsg.type === 'error'
                ? 'bg-rose-950/95 border-rose-500/40 text-rose-200'
                : 'bg-indigo-950/95 border-indigo-500/40 text-indigo-200'
            }`}
          >
            {toastMsg.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {toastMsg.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
            {toastMsg.type === 'info' && <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-700/80 p-5 sm:p-7 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 p-0.5 shadow-lg shadow-indigo-950 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-amber-400">
                <Crown className="w-6 h-6" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Kullanıcı Yönetimi & Yetkilendirme (RBAC)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Admin Yetkili Alan
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                Kurumdaki tüm yönetici, öğretmen ve öğrenci hesaplarını tek merkezden yönetin. Yetkileri değiştirin,
                şifreleri doğrudan güncelleyin veya hesapları askıya alıp silin.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              title="Bulut Veritabanından Güncel Verileri Çek"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Eşitleniyor...' : 'Buluttan Yenile'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Toplam */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">Toplam Kullanıcı</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-white">{stats.total}</p>
          <span className="text-[10px] text-slate-500 mt-1 block">Aktif veritabanı kaydı</span>
        </div>

        {/* Yöneticiler */}
        <div className="bg-slate-900/90 border border-amber-500/20 rounded-2xl p-4 shadow-sm hover:border-amber-500/40 transition-all bg-gradient-to-b from-amber-500/5 to-transparent">
          <div className="flex items-center justify-between text-amber-300 mb-2">
            <span className="text-xs font-bold">Yöneticiler</span>
            <Crown className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-white">{stats.admins}</p>
          <span className="text-[10px] text-amber-400/70 mt-1 block">Tam Yetkili (Admin)</span>
        </div>

        {/* Öğretmenler */}
        <div className="bg-slate-900/90 border border-indigo-500/20 rounded-2xl p-4 shadow-sm hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between text-indigo-300 mb-2">
            <span className="text-xs font-bold">Öğretmenler</span>
            <GraduationCap className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-white">{stats.teachers}</p>
          <span className="text-[10px] text-indigo-400/70 mt-1 block">Aktif Branş Eğitmenleri</span>
        </div>

        {/* Öğrenciler */}
        <div className="bg-slate-900/90 border border-emerald-500/20 rounded-2xl p-4 shadow-sm hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between text-emerald-300 mb-2">
            <span className="text-xs font-bold">Öğrenciler</span>
            <School className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white">{stats.students}</p>
          <span className="text-[10px] text-emerald-400/70 mt-1 block">Kayıtlı Öğrenci Sayısı</span>
        </div>

        {/* Askıya Alınanlar */}
        <div className="bg-slate-900/90 border border-rose-500/20 rounded-2xl p-4 shadow-sm hover:border-rose-500/40 transition-all bg-gradient-to-b from-rose-500/5 to-transparent">
          <div className="flex items-center justify-between text-rose-300 mb-2">
            <span className="text-xs font-bold">Askıda / Dondurulan</span>
            <Ban className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-black text-rose-200">{stats.suspended}</p>
          <span className="text-[10px] text-rose-400/70 mt-1 block">Girişleri Kapatılmış</span>
        </div>

        {/* Onay Bekleyenler */}
        <div className="bg-slate-900/90 border border-orange-500/20 rounded-2xl p-4 shadow-sm hover:border-orange-500/40 transition-all">
          <div className="flex items-center justify-between text-orange-300 mb-2">
            <span className="text-xs font-bold">Onay Bekleyen</span>
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <p className="text-2xl font-black text-orange-200">{stats.pending}</p>
          <span className="text-[10px] text-orange-400/70 mt-1 block">Öğretmen Başvurusu</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="İsim, kullanıcı adı, e-posta, telefon, branş veya sınıf ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2 flex-wrap sm:flex-nowrap">
          {/* Role Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="bg-transparent text-xs text-slate-200 font-bold focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-white">Tüm Roller</option>
              <option value="admin" className="bg-slate-900 text-white">👑 Yöneticiler (Admin)</option>
              <option value="teacher" className="bg-slate-900 text-white">🎓 Öğretmenler</option>
              <option value="student" className="bg-slate-900 text-white">🎒 Öğrenciler</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-xs text-slate-200 font-bold focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-white">Tüm Durumlar</option>
              <option value="active" className="bg-slate-900 text-white">🟢 Aktif</option>
              <option value="suspended" className="bg-slate-900 text-white">⛔ Askıda (Dondurulmuş)</option>
              <option value="pending" className="bg-slate-900 text-white">🟠 Onay Bekleyen</option>
              <option value="rejected" className="bg-slate-900 text-white">🔴 Reddedilen</option>
            </select>
          </div>

          {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setRoleFilter('all');
                setStatusFilter('all');
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Temizle
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4 sm:px-6">Kullanıcı (Ad Soyad & Profil)</th>
                <th className="py-3.5 px-4">İletişim & Kullanıcı Adı</th>
                <th className="py-3.5 px-4">Mevcut Rolü</th>
                <th className="py-3.5 px-4">Birim / Sınıf / Branş</th>
                <th className="py-3.5 px-4">Durum</th>
                <th className="py-3.5 px-4 text-right sm:pr-6">Yönetici İşlemleri</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Users className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-white">Kullanıcı Bulunamadı</p>
                    <p className="text-xs text-slate-500 mt-1">Arama veya filtre kriterlerinize uyan kayıt yok.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrentAdminSelf = u.id === currentAdmin?.id;
                  const isMustafaBilir =
                    u.username?.toLowerCase() === 'mustafa bilir' ||
                    u.name?.toLowerCase() === 'mustafa bilir' ||
                    u.id === 'teacher-1';

                  const isSuspended = u.isSuspended || u.status === 'suspended';

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-slate-850/50 transition-colors ${
                        isSuspended ? 'bg-rose-950/15 text-slate-400' : ''
                      }`}
                    >
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center space-x-3">
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-800 ring-2 ring-slate-700/80 overflow-hidden flex items-center justify-center">
                              {u.avatar ? (
                                <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs font-bold text-slate-300">
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
                              <span className="font-bold text-white text-xs sm:text-sm truncate">
                                {u.name}
                              </span>
                              {isCurrentAdminSelf && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  Siz
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono block">
                              @{u.username}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {u.email ? (
                            <a
                              href={`mailto:${u.email}`}
                              className="flex items-center space-x-1 text-slate-300 hover:text-indigo-400 transition-colors truncate max-w-[200px]"
                              title={u.email}
                            >
                              <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                              <span className="truncate">{u.email}</span>
                            </a>
                          ) : (
                            <span className="text-slate-600 italic">E-posta yok</span>
                          )}

                          {u.phone ? (
                            <div className="flex items-center space-x-1 text-slate-400">
                              <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>{u.phone}</span>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        {u.role === 'admin' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-black bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <Crown className="w-3.5 h-3.5 text-amber-400" />
                            <span>Yönetici</span>
                          </span>
                        ) : u.role === 'teacher' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Öğretmen</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <School className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Öğrenci</span>
                          </span>
                        )}
                      </td>

                      {/* Detail Unit */}
                      <td className="py-3.5 px-4">
                        {u.role === 'student' ? (
                          <div>
                            <span className="font-bold text-white block">
                              {u.className || 'Genel'}
                            </span>
                            {u.studentNumber && (
                              <span className="text-[11px] text-slate-400">
                                No: {u.studentNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-white block truncate max-w-[150px]">
                              {u.branch || 'Genel Branş'}
                            </span>
                            {u.canViewAllStudentsAndClasses ? (
                              <span className="text-[10px] text-emerald-400 font-medium">Tüm Sınıflar</span>
                            ) : u.assignedClassIds && u.assignedClassIds.length > 0 ? (
                              <span className="text-[10px] text-indigo-400 font-medium">
                                {u.assignedClassIds.length} Sınıf Yetkili
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isSuspended ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <Ban className="w-3 h-3 text-rose-400" />
                            <span>Askıya Alındı</span>
                          </span>
                        ) : u.status === 'pending' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                            <AlertTriangle className="w-3 h-3 text-orange-400" />
                            <span>Onay Bekliyor</span>
                          </span>
                        ) : u.status === 'rejected' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-700 text-slate-300">
                            <span>Reddedildi</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Aktif</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right sm:pr-6">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Rol Değiştir Butonu */}
                          <button
                            type="button"
                            onClick={() => handleOpenRoleModal(u)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-amber-300 border border-slate-700/80 transition-colors cursor-pointer"
                            title="Rol ve Yetki Değiştir (RBAC)"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>

                          {/* Bilgi & Şifre Düzenle (Admin Override) */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-indigo-300 border border-slate-700/80 transition-colors cursor-pointer"
                            title="Bilgileri ve Şifreyi Güncelle (Admin Override)"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Askıya Al / Aktifleştir */}
                          <button
                            type="button"
                            onClick={() => setSuspendModalUser(u)}
                            disabled={isMustafaBilir}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                              isSuspended
                                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border-slate-700/80'
                            }`}
                            title={isSuspended ? 'Hesabı Yeniden Aktifleştir' : 'Hesabı Geçici Olarak Dondur (Askıya Al)'}
                          >
                            {isSuspended ? <Play className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>

                          {/* Kalıcı Sil */}
                          <button
                            type="button"
                            onClick={() => setDeleteModalUser(u)}
                            disabled={isMustafaBilir || (u.role === 'admin' && stats.admins <= 1)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600/30 text-slate-400 hover:text-rose-300 border border-slate-700/80 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
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
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: BİLGİ VE ŞİFRE GÜNCELLEME (ADMIN OVERRIDE FORMU) */}
      {/* ========================================================================= */}
      {editModalUser && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-150">
          <div
            className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                    <span>Kullanıcı Bilgilerini Güncelle</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                      {editModalUser.role.toUpperCase()}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sistem yöneticisi yetkisiyle profil alanlarını ve şifreyi doğrudan güncelleyin.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalUser(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEdit} className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Ad Soyad */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Ad Soyad</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Kullanıcı Adı */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    required
                    value={editFormData.username}
                    onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* E-posta */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">E-posta Adresi</label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Telefon */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Telefon Numarası</label>
                  <input
                    type="tel"
                    placeholder="05XX XXX XX XX"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Öğretmen / Admin Branşı */}
                {editModalUser.role !== 'student' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-300 mb-1">Branş / Görev</label>
                    <input
                      type="text"
                      placeholder="Örn: Fen Bilgisi Öğretmeni, Matematik, Kurum Müdürü"
                      value={editFormData.branch}
                      onChange={(e) => setEditFormData({ ...editFormData, branch: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {/* Öğrenci Alanları */}
                {editModalUser.role === 'student' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Kayıtlı Sınıf</label>
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
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {classes.map((c) => (
                          <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                            {c.name} ({c.gradeLevel || c.branch || 'Genel'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Okul Numarası</label>
                      <input
                        type="text"
                        placeholder="Örn: 482"
                        value={editFormData.studentNumber}
                        onChange={(e) => setEditFormData({ ...editFormData, studentNumber: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Şifre Güncelleme Bölümü (Admin Password Override) */}
              <div className="pt-3 border-t border-slate-800">
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Key className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-white">Şifre Değiştir (Admin Override)</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Rastgele Şifre Üret</span>
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Değiştirmek istemiyorsanız boş bırakın"
                      value={editFormData.newPassword}
                      onChange={(e) => setEditFormData({ ...editFormData, newPassword: e.target.value })}
                      className="w-full pl-3.5 pr-20 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono placeholder:font-sans focus:outline-none focus:border-amber-500"
                    />

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                      {editFormData.newPassword && (
                        <button
                          type="button"
                          onClick={handleCopyPassword}
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                          title="Şifreyi Kopyala"
                        >
                          {copiedPassword ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {editFormData.newPassword && (
                    <div className="flex items-center justify-between text-[11px] text-amber-300/80 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                      <span>Belirlenen Yeni Şifre: <strong>{editFormData.newPassword}</strong></span>
                      {copiedPassword && <span className="text-emerald-400 font-bold">✓ Panoya Kopyalandı</span>}
                    </div>
                  )}

                  <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={editFormData.mustChangePassword}
                      onChange={(e) => setEditFormData({ ...editFormData, mustChangePassword: e.target.checked })}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span>İlk girişte kullanıcının şifresini değiştirmesini zorunlu kıl</span>
                  </label>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setEditModalUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
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
            className="relative w-full max-w-lg bg-slate-900 border border-slate-700/90 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Rol & Yetki Ata (RBAC)</h3>
                  <p className="text-xs text-slate-400">
                    <strong>{roleModalUser.name}</strong> (@{roleModalUser.username}) için sistem rolünü belirleyin.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                className="text-slate-400 hover:text-white"
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
                    ? 'bg-amber-500/15 border-amber-500/60 ring-2 ring-amber-500/20 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Crown className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">Sistem Yöneticisi (Admin)</span>
                    {selectedTargetRole === 'admin' && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tüm sınıfları, öğrencileri, öğretmenleri ve ayarları görme ve düzenleme tam yetkisine sahiptir.
                  </p>
                </div>
              </div>

              {/* Teacher */}
              <div
                onClick={() => setSelectedTargetRole('teacher')}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start space-x-3 ${
                  selectedTargetRole === 'teacher'
                    ? 'bg-indigo-500/15 border-indigo-500/60 ring-2 ring-indigo-500/20 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">Öğretmen (Eğitmen)</span>
                    {selectedTargetRole === 'teacher' && <Check className="w-4 h-4 text-indigo-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Kendi sınıflarında ödev verme, etüt oluşturma ve soru yanıtlama yetkilerine sahiptir.
                  </p>
                </div>
              </div>

              {/* Student */}
              <div
                onClick={() => setSelectedTargetRole('student')}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start space-x-3 ${
                  selectedTargetRole === 'student'
                    ? 'bg-emerald-500/15 border-emerald-500/60 ring-2 ring-emerald-500/20 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <School className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">Öğrenci Portalı</span>
                    {selectedTargetRole === 'student' && <Check className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Yalnızca öğrenci portalına erişebilir; verilen ödevleri ve katıldığı etütleri görüntüleyebilir.
                  </p>
                </div>
              </div>
            </div>

            {/* Notice */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Rol değişikliği veritabanında anında geçerli olur ve kullanıcının yetki alanı güncellenir.</span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
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
            className="relative w-full max-w-md bg-slate-900 border border-slate-700/90 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <Ban className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-white">
                {suspendModalUser.isSuspended || suspendModalUser.status === 'suspended'
                  ? 'Hesabı Yeniden Aktifleştir'
                  : 'Hesabı Dondur (Askıya Al)'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong>{suspendModalUser.name}</strong> (@{suspendModalUser.username}) isimli kullanıcının hesabı{' '}
                {suspendModalUser.isSuspended || suspendModalUser.status === 'suspended'
                  ? 'tekrar aktif hale getirilecek ve sisteme giriş yapabilecektir.'
                  : 'geçici olarak dondurulacak; açık olan oturumları sonlandırılacak ve sisteme girişi engellenecektir.'}
              </p>
            </div>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setSuspendModalUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
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
            className="relative w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-white">Kullanıcıyı Kalıcı Olarak Sil</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong>{deleteModalUser.name}</strong> (@{deleteModalUser.username}) isimli kullanıcının hesabı,
                veritabanı kayıtları ve yetkileri kalıcı olarak silinecektir. Bu işlem geri alınamaz.
              </p>
            </div>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
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
    </div>
  );
};
