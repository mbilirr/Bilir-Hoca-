// Kullanıcı yönetimi: sayfanın bütün durumu ve işlemleri (Aşama 354d). Görünüm parçaları bunu useKullaniciBaglam() ile okur.
import React, { createContext, useContext, useState, useEffect, useMemo, useDeferredValue } from 'react';
import { usePagedList } from '../../../lib/listPaging';
import { UnifiedUser, SystemRole, UserStatus, ClassGroup, Student, StudentCredential } from '../../../types';
import { canSendCredentials, useMyGrantCred } from '../../../lib/grantCred';
import { dataService } from '../../../services/dataService';
import { fetchTeacherRoles, onTeacherRolesSaved, type TeacherRole } from '../../../lib/teacherRoles';
import { EMPTY_GRADES, classesCoveredBy, fetchTeacherGrades, gradeOptionsFrom, saveTeacherGrades, type TeacherGrades } from '../../../lib/teacherGrades';
import { fetchTeacherContacts, saveTeacherContact, type TeacherContact } from '../../../lib/teacherContacts';
import { normalizeTurkishPhone, PHONE_ERROR } from '../../../lib/importNormalize';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { bildir, hataBildir } from '../../../lib/bildirim';
import { WIDE_ROLES, TeacherMailKind, isTeacherAccount, notifyTeacherByMail, toastType, AdminUserManagementProps } from './ortak';

export function useKullaniciYonetimi({
  currentAdmin,
  onNavigateHome,
  kurumLock,
  roleLock,
  embedded = false,
  roleSettings,
}: AdminUserManagementProps) {
  // Data states
  const [users, setUsers] = useState<UnifiedUser[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    avatar: string; // Aşama 334: '' = otomatik çizim
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
    avatar: '',
  });
  const [resimAcik, setResimAcik] = useState(false); // Aşama 334: düzenleme penceresinden profil resmi

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

  // Aşama 348: ortak bildirim katmanı (her sayfada aynı yer ve biçim)
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (type === 'error') hataBildir(text);
    else bildir({ tur: type === 'info' ? 'bilgi' : 'basari', baslik: text });
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
    let admins = 0, teachers = 0, students = 0, suspended = 0;
    for (const u of scoped) {
      if (u.role === 'admin') admins++;
      else if (u.role === 'teacher') teachers++;
      else if (u.role === 'student') students++;
      if (u.isSuspended || u.status === 'suspended') suspended++;
    }
    return { total: scoped.length, admins, teachers, students, suspended };
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

  // Aşama 354d: yetkisiz ekran artık ana dosyada çizilir (kancalar her zaman aynı sırada çalışır)


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
      avatar: user.avatar || '',
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
        // Aşama 334: yalnız değiştiyse yazılır ('' = kendi resmi kaldırılır, otomatik çizim)
        avatar: editFormData.avatar !== (before.avatar || '') ? editFormData.avatar : undefined,
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

  return {
    currentAdmin,
    onNavigateHome,
    kurumLock,
    roleLock,
    embedded,
    roleSettings,
    users,
    setUsers,
    classes,
    setClasses,
    isRefreshing,
    setIsRefreshing,
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    kurumFilter,
    setKurumFilter,
    yetkiTeacherId,
    setYetkiTeacherId,
    editModalUser,
    setEditModalUser,
    roleModalUser,
    setRoleModalUser,
    deleteModalUser,
    setDeleteModalUser,
    suspendModalUser,
    setSuspendModalUser,
    authModalTeacher,
    setAuthModalTeacher,
    selectedAuthClassIds,
    setSelectedAuthClassIds,
    selectedAuthStudentIds,
    setSelectedAuthStudentIds,
    authStudentSearch,
    setAuthStudentSearch,
    authGrades,
    setAuthGrades,
    authGradesMissing,
    setAuthGradesMissing,
    editFormData,
    setEditFormData,
    resimAcik,
    setResimAcik,
    showPassword,
    setShowPassword,
    editPwOpen,
    setEditPwOpen,
    copiedPassword,
    setCopiedPassword,
    selectedTargetRole,
    setSelectedTargetRole,
    isCreateTeacherOpen,
    setIsCreateTeacherOpen,
    isExcelTeacherOpen,
    setIsExcelTeacherOpen,
    isGenderFillOpen,
    setIsGenderFillOpen,
    isCredSendOpen,
    setIsCredSendOpen,
    stuPickOpen,
    setStuPickOpen,
    stuSendOne,
    setStuSendOne,
    stuNewCreds,
    setStuNewCreds,
    grantCredOn,
    canSendStudentCreds,
    studentById,
    notifyTeacher,
    setNotifyTeacher,
    showToast,
    sendTeacherMail,
    loadData,
    accessCounts,
    setAccessCounts,
    reloadAccessCounts,
    unvanlar,
    setUnvanlar,
    contacts,
    setContacts,
    reloadContacts,
    phoneOf,
    birthOf,
    credTeachers,
    credStudents,
    handleRefresh,
    stats,
    deferredQuery,
    filteredUsers,
    pagedUsers,
    isHead,
    canManageTeachers,
    kurumOptions,
    rowManageable,
    isSuperAdmin,
    handleOpenEdit,
    handleSaveEdit,
    handleGeneratePassword,
    handleCopyPassword,
    handleOpenRoleModal,
    handleSaveRoleChange,
    handleConfirmToggleSuspension,
    handleConfirmDelete,
    authGradeOptions,
    gradeCovered,
    authWideRoles,
    kurumRolesOn,
    roleSeesAll,
    authExtraRoleNote,
    handleOpenAuthModal,
    handleSaveAuthModal,
  };
}

export type KullaniciBaglamDegeri = ReturnType<typeof useKullaniciYonetimi>;
export const KullaniciBaglam = createContext<KullaniciBaglamDegeri | null>(null);
export function useKullaniciBaglam(): KullaniciBaglamDegeri {
  const d = useContext(KullaniciBaglam);
  if (!d) throw new Error('KullaniciBaglam sağlayıcısı yok');
  return d;
}
