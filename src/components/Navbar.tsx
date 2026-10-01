import React, { useState, useRef, useEffect } from 'react';
import {
  GraduationCap,
  Bell,
  Calendar,
  LogOut,
  UserCheck,
  BookOpen,
  Sparkles,
  Database,
  Lock,
  UserPlus,
  LogIn,
  ShieldCheck,
  ChevronDown,
  UserCog,
  KeyRound,
  Users,
  CalendarDays,
  FileSpreadsheet,
  MessageSquare,
  FolderArchive,
  Check,
  Crown,
  Mail,
  Camera,
  LayoutGrid,
  Home,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { UserRole, Student, Teacher, AuthSession, TeacherTabType } from '../types';
import { TeacherProfileEditModal, TeacherPasswordModal } from './Teacher/TeacherProfileModals';
import { TeacherApprovalModal } from './Teacher/TeacherApprovalModal';
import { SentCommunicationsModal } from './Teacher/SentCommunicationsModal';
import { StudentNotificationCenterModal } from './Student/StudentNotificationCenterModal';
import { TeacherAvatarModal } from './Teacher/TeacherAvatarModal';
import { StudentAvatarModal } from './Student/StudentAvatarModal';
import { StudentProfileEditModal, StudentPasswordModal } from './Student/StudentProfileModals';
import { SyncStatusIndicator } from './Common/SyncStatusIndicator';
import { dataService } from '../services/dataService';

export interface NavbarProps {
  role?: UserRole;
  currentRole?: UserRole;
  authSession?: AuthSession | null;
  onRoleChange?: (role: UserRole) => void;
  onRoleSwitch?: (role: UserRole) => void;
  onOpenTeacherLogin?: () => void;
  onOpenStudentLogin?: () => void;
  onOpenStudentRegister?: () => void;
  onOpenSupabaseGuide?: () => void;
  currentStudent?: Student | null;
  onStudentLogout?: () => void;
  onLogout?: () => void;
  unreadCount?: number;
  urgentHomeworkCount?: number;
  onOpenAuthModal?: () => void;
  teacherNotificationBell?: React.ReactNode;
  activeTeacherTab?: TeacherTabType;
  onSelectTeacherTab?: (tab: TeacherTabType) => void;
  unreadMessagesCount?: number;
  documentsCount?: number;
}

interface NavItemConfig {
  id: TeacherTabType;
  title: string;
  shortTitle: string;
  mobileTitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'students',
    title: 'Öğrenci & Sınıf Yönetimi',
    shortTitle: 'Öğrenci & Sınıf',
    mobileTitle: 'Öğrenci',
    icon: Users,
    accentColor: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
  },
  {
    id: 'homework',
    title: 'Ödev Kontrol',
    shortTitle: 'Ödev Kontrol',
    mobileTitle: 'Ödev',
    icon: BookOpen,
    accentColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  },
  {
    id: 'etuts',
    title: 'Etüt & Birebir Takip',
    shortTitle: 'Etüt Takip',
    mobileTitle: 'Etüt',
    icon: CalendarDays,
    accentColor: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30',
  },
  {
    id: 'messages',
    title: 'Öğrenci Soruları & Mesajlaşma',
    shortTitle: 'Mesajlar',
    mobileTitle: 'Mesaj',
    icon: MessageSquare,
    accentColor: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
  },
  {
    id: 'archive',
    title: 'Plan & Zümre Arşivi',
    shortTitle: 'Zümre Arşivi',
    mobileTitle: 'Arşiv',
    icon: FolderArchive,
    accentColor: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
  },
  {
    id: 'question_tracking',
    title: 'Soru Sayısı Takip & Analiz',
    shortTitle: 'Soru Takip',
    mobileTitle: 'Soru',
    icon: HelpCircle,
    accentColor: 'text-violet-400 bg-violet-500/15 border-violet-500/30',
  },
];

const ADMIN_NAV_ITEM: NavItemConfig = {
  id: 'user_management',
  title: 'Kullanıcı & Yetki Yönetimi (RBAC)',
  shortTitle: 'Yetki & RBAC',
  mobileTitle: 'Yetki',
  icon: ShieldCheck,
  accentColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
};

const ALL_NAV_ITEMS: NavItemConfig[] = [...NAV_ITEMS, ADMIN_NAV_ITEM];

export const Navbar: React.FC<NavbarProps> = ({
  role,
  currentRole: propCurrentRole,
  authSession,
  onRoleChange,
  onRoleSwitch,
  onOpenTeacherLogin,
  onOpenStudentLogin,
  onOpenStudentRegister,
  onOpenSupabaseGuide,
  currentStudent,
  onStudentLogout,
  onLogout,
  unreadCount = 0,
  urgentHomeworkCount = 0,
  onOpenAuthModal,
  teacherNotificationBell,
  activeTeacherTab = 'students',
  onSelectTeacherTab,
  unreadMessagesCount = 0,
  documentsCount = 0,
}) => {
  const activeRole: UserRole = role || propCurrentRole || 'teacher';
  const isTeacherSession = authSession?.role === 'teacher';
  const isStudentSession = authSession?.role === 'student';

  const [isTeacherMenuOpen, setIsTeacherMenuOpen] = useState(false);
  const [isModuleOpen, setIsModuleOpen] = useState(false);
  const [selectedTeacherTab, setSelectedTeacherTab] = useState<TeacherTabType | null>(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isSentCommunicationsOpen, setIsSentCommunicationsOpen] = useState(false);
  const [isStudentNotificationOpen, setIsStudentNotificationOpen] = useState(false);
  const [studentUnreadNotifCount, setStudentUnreadNotifCount] = useState(0);

  // Student specific menu and modals state
  const [isStudentMenuOpen, setIsStudentMenuOpen] = useState(false);
  const [isStudentEditProfileOpen, setIsStudentEditProfileOpen] = useState(false);
  const [isStudentChangePasswordOpen, setIsStudentChangePasswordOpen] = useState(false);
  const [isStudentAvatarModalOpen, setIsStudentAvatarModalOpen] = useState(false);

  const teacherMenuRef = useRef<HTMLDivElement | null>(null);
  const studentMenuRef = useRef<HTMLDivElement | null>(null);
  const moduleDropdownRef = useRef<HTMLDivElement | null>(null);

  const [pendingTeachersCount, setPendingTeachersCount] = useState<number>(0);

  // Synchronize internal selectedTeacherTab with activeTeacherTab
  useEffect(() => {
    if (activeTeacherTab) {
      setSelectedTeacherTab(activeTeacherTab === 'home' ? null : activeTeacherTab);
    }
  }, [activeTeacherTab]);

  const currentTeacher = isTeacherSession ? (authSession.user as Teacher) : null;
  const activeStudent = isStudentSession ? (authSession.user as Student) : currentStudent;

  // Yönetici kontrolü tek yerden yapılır (isim değil, kayıttaki yönetici yetkisi esas alınır)
  const isTeacherAdmin = isTeacherSession && dataService.isTeacherAdmin(currentTeacher);
  const currentNavItems = isTeacherAdmin ? ALL_NAV_ITEMS : NAV_ITEMS;

  const activeModuleId = selectedTeacherTab || (activeTeacherTab !== 'home' ? activeTeacherTab : null);
  const activeModuleItem = ALL_NAV_ITEMS.find((item) => item.id === activeModuleId);
  const DisplayModuleIcon = activeModuleItem ? activeModuleItem.icon : LayoutGrid;
  const buttonDisplayTitle = activeModuleItem ? activeModuleItem.title : 'Çalışma Alanını Seçiniz';
  const buttonShortDisplayTitle = activeModuleItem ? activeModuleItem.shortTitle : 'Çalışma Alanı';
  const buttonMobileDisplayTitle = activeModuleItem ? activeModuleItem.mobileTitle : 'Modüller';
  const isHomeActive = activeTeacherTab === 'home' || (!activeTeacherTab && !selectedTeacherTab);

  const teacherName = currentTeacher?.name || '';
  const teacherBranch = currentTeacher?.branch || 'Fen Bilgisi Öğretmeni';

  const teacherInitials = currentTeacher?.name
    ? currentTeacher.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'MB'
    : 'MB';

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (teacherMenuRef.current && !teacherMenuRef.current.contains(target)) {
        setIsTeacherMenuOpen(false);
      }
      if (studentMenuRef.current && !studentMenuRef.current.contains(target)) {
        setIsStudentMenuOpen(false);
      }
      if (moduleDropdownRef.current && !moduleDropdownRef.current.contains(target)) {
        setIsModuleOpen(false);
      }
    };
    if (isTeacherMenuOpen || isStudentMenuOpen || isModuleOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTeacherMenuOpen, isStudentMenuOpen, isModuleOpen]);

  // Listen to student notifications if student is active
  useEffect(() => {
    if (activeStudent) {
      const updateCount = () => {
        setStudentUnreadNotifCount(dataService.getUnreadNotificationsCount(activeStudent.id));
      };
      updateCount();
      const unsubscribe = dataService.subscribe(updateCount);
      return () => unsubscribe();
    }
  }, [activeStudent?.id]);

  // Listen to pending teacher approvals if current teacher is admin
  useEffect(() => {
    const updatePendingCount = () => {
      if (isTeacherSession && currentTeacher?.isAdmin) {
        setPendingTeachersCount(dataService.getPendingTeachers().length);
      } else {
        setPendingTeachersCount(0);
      }
    };
    updatePendingCount();
    const unsubscribe = dataService.subscribe(updatePendingCount);
    return () => unsubscribe();
  }, [isTeacherSession, currentTeacher?.isAdmin]);

  const switchRole = (newRole: UserRole) => {
    // Only teacher is allowed to switch roles
    if (isStudentSession && newRole === 'teacher') return;

    if (onRoleChange) {
      onRoleChange(newRole);
    } else if (onRoleSwitch) {
      onRoleSwitch(newRole);
    }
  };

  const handleLogoutAction = () => {
    if (onLogout) {
      onLogout();
    } else if (onStudentLogout) {
      onStudentLogout();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white shadow-lg w-full overflow-x-clip">
      <div className="max-w-7xl mx-auto px-1.5 xs:px-2.5 sm:px-4 lg:px-8 w-full">
        <div className="flex items-center justify-between min-h-[3rem] sm:min-h-[3.75rem] py-1 gap-1 sm:gap-2.5 flex-nowrap w-full">
          {/* Logo & Modül Butonu: Kep Resminin Yanında Tam Solda Çalışma Modülü */}
          <div className="flex items-center space-x-1 sm:space-x-2 flex-nowrap min-w-0 shrink">
            <button
              type="button"
              onClick={() => {
                setSelectedTeacherTab(null);
                onSelectTeacherTab && onSelectTeacherTab('home');
              }}
              title="Ana Sayfaya Git (Ajanda & Özetler)"
              className="w-7 h-7 xs:w-8 xs:h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl md:rounded-2xl bg-gradient-to-tr from-indigo-950 via-slate-900 to-indigo-900 border border-indigo-500/40 p-1 sm:p-1.5 flex items-center justify-center shadow-md shadow-indigo-500/20 ring-1 ring-white/10 shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition-all overflow-hidden"
            >
              <img src="/logo.svg" alt="Eğitim Takip Logo" className="w-full h-full object-contain" />
            </button>

            {isTeacherSession && currentTeacher ? (
              <div className="flex items-center space-x-1 sm:space-x-2 flex-nowrap min-w-0 shrink">
                {/* Öğretmen Çalışma Modül Butonu: Tam Solda, Turuncu Yanan Sönen Işık Efektli */}
                {onSelectTeacherTab && (
                  <div className="relative min-w-0 shrink" ref={moduleDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsModuleOpen(!isModuleOpen)}
                      aria-expanded={isModuleOpen}
                      aria-haspopup="true"
                      id="teacher-module-sticky-btn"
                      className={`px-1 xs:px-1.5 sm:px-2.5 lg:px-3.5 py-0.5 sm:py-1.5 rounded-lg sm:rounded-xl md:rounded-2xl font-black text-xs sm:text-sm flex items-center space-x-1 sm:space-x-1.5 transition-all cursor-pointer border sm:border-2 shadow-lg min-w-0 shrink ${
                        isModuleOpen
                          ? 'bg-orange-600 text-white border-orange-400 shadow-orange-500/50 ring-1 sm:ring-2 ring-orange-400/60 scale-[1.01]'
                          : 'bg-gradient-to-r from-orange-950/70 via-slate-900 to-orange-950/70 hover:from-orange-900/80 hover:to-slate-850 text-white border-orange-500/85 hover:border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)] hover:shadow-[0_0_25px_rgba(249,115,22,0.65)]'
                      }`}
                    >
                      {/* Turuncu Yanıp Sönen Canlı Işık Efekti */}
                      <span className="relative flex h-1.5 w-1.5 xs:h-2 xs:w-2 sm:h-3 sm:w-3 shrink-0" title="Aktif Çalışma Işığı">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-90 duration-1000"></span>
                        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 xs:h-2 xs:w-2 sm:h-3 sm:w-3 bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 shadow-[0_0_10px_#f97316] ring-1 ring-amber-200"></span>
                      </span>

                      <div className="flex items-center space-x-1 min-w-0">
                        <span className="px-1 xs:px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-[9px] xs:text-[10px] sm:text-xs md:text-sm shadow-md flex items-center space-x-0.5 sm:space-x-1.5 min-w-0">
                          <DisplayModuleIcon className="w-2.5 h-2.5 xs:w-3 xs:h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-slate-950 stroke-[2.5] shrink-0" />
                          <span className="hidden lg:inline tracking-tight">{buttonDisplayTitle}</span>
                          <span className="hidden sm:inline lg:hidden tracking-tight truncate max-w-[110px] md:max-w-[140px]">{buttonShortDisplayTitle}</span>
                          <span className="sm:hidden tracking-tight truncate max-w-[50px] xs:max-w-[70px]">{buttonMobileDisplayTitle}</span>
                        </span>
                      </div>

                      {activeModuleItem?.id === 'messages' && unreadMessagesCount > 0 && (
                        <span className="px-1 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black animate-bounce shrink-0">
                          {unreadMessagesCount}
                        </span>
                      )}
                      {activeModuleItem?.id === 'archive' && documentsCount > 0 && (
                        <span className="px-1 py-0.2 rounded-full bg-purple-500 text-white text-[9px] font-black shrink-0">
                          {documentsCount}
                        </span>
                      )}

                      <ChevronDown
                        className={`w-2.5 h-2.5 xs:w-3 xs:h-3 sm:w-3.5 sm:h-3.5 text-orange-300 transition-transform duration-200 shrink-0 ${
                          isModuleOpen ? 'rotate-180 text-white' : ''
                        }`}
                      />
                    </button>

                    {/* Açılır Menü (Dropdown Menu) */}
                    {isModuleOpen && (
                      <div
                        role="menu"
                        className="fixed sm:absolute top-[3.1rem] sm:top-auto sm:mt-2 left-1 sm:left-0 w-[calc(100vw-0.5rem)] sm:w-80 md:w-88 max-w-sm bg-slate-950 border border-slate-700/90 rounded-2xl shadow-2xl p-2 sm:p-2.5 backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                      >
                        <div className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between mb-1.5">
                          <span>{isTeacherAdmin ? 'Yönetici & Öğretmen Modülleri' : 'Öğretmen Çalışma Modülleri'}</span>
                          <span className="text-[10px] text-indigo-400 font-semibold">{currentNavItems.length} Modül</span>
                        </div>

                        <div className="space-y-1">
                          {currentNavItems.map((item, index) => {
                            const ItemIcon = item.icon;
                            const isSelected = item.id === (selectedTeacherTab || activeTeacherTab);

                            return (
                              <button
                                key={item.id}
                                role="menuitem"
                                type="button"
                                onClick={() => {
                                  setSelectedTeacherTab(item.id);
                                  onSelectTeacherTab(item.id);
                                  setIsModuleOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between group cursor-pointer ${
                                  isSelected
                                    ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-500/50 shadow-sm'
                                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
                                }`}
                              >
                                <div className="flex items-center space-x-2.5 min-w-0">
                                  <span className="text-[11px] font-mono text-slate-500 font-bold w-3 text-center">
                                    {index + 1}
                                  </span>
                                  <div
                                    className={`w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 ${item.accentColor}`}
                                  >
                                    <ItemIcon className="w-3 h-3" />
                                  </div>
                                  <span className="truncate">{item.title}</span>
                                </div>

                                <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                                  {item.id === 'messages' && unreadMessagesCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                                      {unreadMessagesCount} Soru
                                    </span>
                                  )}
                                  {item.id === 'archive' && documentsCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[10px] font-bold">
                                      {documentsCount}
                                    </span>
                                  )}
                                  {isSelected && (
                                    <Check className="w-4 h-4 text-indigo-400 font-black shrink-0" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : isStudentSession && activeStudent ? (
              <div className="flex items-center text-left min-w-0">
                <span className="text-xs sm:text-base font-black text-white tracking-tight leading-tight flex items-center gap-1 min-w-0">
                  <span className="text-slate-200 hidden xs:inline">Hoş Geldin,</span>
                  <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-cyan-300 bg-clip-text text-transparent font-black truncate max-w-[85px] xs:max-w-[120px] sm:max-w-[200px]">
                    {activeStudent.name}
                  </span>
                  <span className="hidden sm:inline">🚀</span>
                </span>
              </div>
            ) : (
              <div className="flex flex-col text-left">
                <span className="text-xs sm:text-base font-black text-white tracking-wide leading-tight">
                  Eğitim Portalı
                </span>
              </div>
            )}
          </div>

          {/* Right Action & Profile info */}
          <div className="flex items-center space-x-1 sm:space-x-2 min-w-0 shrink">
            {/* Google Calendar shortcut */}
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
              title="Google Takvim'i Yeni Sekmede Aç"
            >
              <Calendar className="w-4 h-4" />
            </a>

            {/* Admin Teachers & Permissions Management Button */}
            {isTeacherSession && currentTeacher?.isAdmin && (
              <>
                {/* Mobile Icon-only Button for Pending Approvals */}
                {pendingTeachersCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsApprovalModalOpen(true)}
                    className="sm:hidden relative w-6 h-6 xs:w-7 xs:h-7 rounded-lg bg-amber-500/25 border border-amber-400 text-amber-300 flex items-center justify-center shrink-0 p-1 cursor-pointer"
                    title={`🔔 Onay: ${pendingTeachersCount} Öğretmen Başvurusu`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-300 animate-bounce" />
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-amber-400 text-slate-950 text-[8px] font-black flex items-center justify-center">
                      {pendingTeachersCount}
                    </span>
                  </button>
                )}

                {/* Tablet / Desktop Button */}
                <button
                  type="button"
                  onClick={() => setIsApprovalModalOpen(true)}
                  className={`hidden sm:inline-flex items-center space-x-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shrink-0 ${
                    pendingTeachersCount > 0
                      ? 'bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 border border-amber-400 ring-1 ring-amber-400/40 shadow-amber-500/30 animate-pulse'
                      : 'hidden lg:inline-flex bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30'
                  }`}
                  title="Öğretmen Başvuruları & Yönetici Yetkilendirme"
                >
                  <ShieldCheck className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${pendingTeachersCount > 0 ? 'text-amber-300 animate-bounce' : 'text-indigo-400'}`} />
                  <span className={pendingTeachersCount > 0 ? 'hidden md:inline' : 'hidden sm:inline'}>
                    {pendingTeachersCount > 0 ? '🔔 Onay:' : 'Öğretmen Yönetimi'}
                  </span>
                  {pendingTeachersCount > 0 && (
                    <span className="px-1 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[9px] sm:text-[10px] font-black">
                      {pendingTeachersCount}
                    </span>
                  )}
                </button>
              </>
            )}

            {/* Live Sync Monitor Badge */}
            <SyncStatusIndicator variant="badge" className="hidden md:inline-flex shrink-0" />

            {/* TEACHER LOGGED IN */}
            {isTeacherSession && currentTeacher ? (
              <div className="flex items-center space-x-1 sm:space-x-1.5 pl-1 sm:pl-2 border-l border-slate-700 min-w-0 shrink">
                {/* Öğretmen Profil Menü Butonu: Yazı yerine profil resmi kutucuk içinde */}
                <div className="relative min-w-0 shrink" ref={teacherMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsTeacherMenuOpen(!isTeacherMenuOpen)}
                    className={`flex items-center space-x-1 sm:space-x-1.5 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border transition-all cursor-pointer shadow-sm shrink-0 ${
                      isTeacherMenuOpen
                        ? 'bg-slate-800/95 border-indigo-500 text-white ring-1 sm:ring-2 ring-indigo-500/30'
                        : 'bg-gradient-to-b from-slate-850 to-slate-900 hover:from-slate-800 hover:to-slate-850 border-slate-700/80 hover:border-indigo-400 text-slate-200 hover:text-white'
                    }`}
                    title={`Öğretmen Profil ve Hesap Menüsü (${currentTeacher.name})`}
                    id="navbar-teacher-profile-dropdown-btn"
                  >
                    {/* Profil Resmi Kutucuk İçinde */}
                    <div className="relative shrink-0">
                      <div className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 ring-1 sm:ring-1.5 ring-indigo-400/80 shadow-sm flex items-center justify-center overflow-hidden">
                        {currentTeacher.avatar ? (
                          currentTeacher.avatar.startsWith('http') || currentTeacher.avatar.startsWith('data:') ? (
                            <img
                              src={currentTeacher.avatar}
                              alt={currentTeacher.name}
                              className="w-full h-full object-cover rounded-full"
                            />
                          ) : (
                            <span className="text-xs sm:text-base select-none leading-none">
                              {currentTeacher.avatar}
                            </span>
                          )
                        ) : (
                          <span className="font-black text-[9px] xs:text-[10px] sm:text-xs text-white tracking-wider">
                            {teacherInitials}
                          </span>
                        )}
                      </div>

                      {/* Küçük Kamera Rozeti */}
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 xs:w-3 xs:h-3 bg-indigo-600 text-white rounded-full flex items-center justify-center border border-slate-900 shadow-sm">
                        <Camera className="w-1.5 h-1.5" />
                      </div>

                      {/* Yönetici Taç Rozeti */}
                      {currentTeacher.isAdmin && (
                        <span
                          className="absolute -top-1 -right-1 w-2.5 h-2.5 xs:w-3 xs:h-3 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center text-[7px] xs:text-[8px] shadow-sm font-black"
                          title="Yönetici (Admin)"
                        >
                          👑
                        </span>
                      )}
                    </div>

                    {/* Açılır Menü Oku */}
                    <ChevronDown
                      className={`w-2.5 h-2.5 xs:w-3 xs:h-3 text-slate-400 transition-transform duration-200 shrink-0 ${
                        isTeacherMenuOpen ? 'rotate-180 text-indigo-400' : ''
                      }`}
                    />
                  </button>

                  {/* Açılır Pencere / Dropdown Menü */}
                  {isTeacherMenuOpen && (
                    <div className="fixed sm:absolute top-[3.1rem] sm:top-auto sm:mt-2 right-1 sm:right-0 w-[calc(100vw-0.5rem)] sm:w-64 max-w-xs bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-4 py-2 border-b border-slate-800 mb-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-bold text-white truncate">
                            {currentTeacher?.name || 'Öğretmen'}
                          </p>
                          {currentTeacher?.isAdmin && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-0.5 shrink-0">
                              <Crown className="w-2.5 h-2.5 text-amber-400" />
                              <span>Admin</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-indigo-300 font-medium truncate mt-0.5">
                          {currentTeacher?.branch ? `${currentTeacher.branch}` : 'Öğretmen Hesabı'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsTeacherMenuOpen(false);
                          setIsEditProfileOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-2.5 transition-colors cursor-pointer"
                      >
                        <UserCog className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>Bilgilerimi Güncelle</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsTeacherMenuOpen(false);
                          setIsAvatarModalOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-2.5 transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>Profil Resmi Yükle / Değiştir</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsTeacherMenuOpen(false);
                          setIsChangePasswordOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-2.5 transition-colors cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Şifre Değiştir</span>
                      </button>

                      {currentTeacher?.isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsTeacherMenuOpen(false);
                            setIsApprovalModalOpen(true);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <div className="flex items-center space-x-2.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>Öğretmenler & Sınıf İzinleri</span>
                          </div>
                          {pendingTeachersCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold">
                              {pendingTeachersCount}
                            </span>
                          )}
                        </button>
                      )}

                      {currentTeacher?.isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsTeacherMenuOpen(false);
                            onSelectTeacherTab('user_management');
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs text-amber-300 hover:text-white hover:bg-amber-500/20 flex items-center space-x-2.5 transition-colors cursor-pointer border-t border-slate-800"
                        >
                          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="font-bold">Kullanıcı & Yetki Yönetimi (RBAC)</span>
                        </button>
                      )}

                      {/* Giden E-Posta ve Bildirim İletim Günlüğü */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsTeacherMenuOpen(false);
                          setIsSentCommunicationsOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-2.5 transition-colors cursor-pointer"
                      >
                        <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>Giden E-Posta & Bildirimler</span>
                      </button>

                      <div className="p-2 border-t border-slate-800">
                        <SyncStatusIndicator variant="card" />
                      </div>

                      <div className="my-1 border-t border-slate-800" />

                      <button
                        type="button"
                        onClick={() => {
                          setIsTeacherMenuOpen(false);
                          handleLogoutAction();
                        }}
                        className="w-full px-4 py-2 text-left text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center space-x-2.5 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Güvenli Çıkış Yap</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. DEDICATED QUICK LOGOUT BUTTON FOR TEACHER (Always directly reachable on phone, tablet, and desktop) */}
                <button
                  type="button"
                  onClick={handleLogoutAction}
                  id="navbar-teacher-quick-logout-btn"
                  className="flex items-center space-x-0.5 sm:space-x-1 px-1.5 xs:px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500/25 active:bg-rose-600/30 border border-rose-500/30 hover:border-rose-500/50 transition-all cursor-pointer shrink-0 text-[10px] sm:text-xs font-bold shadow-sm"
                  title="Oturumu Kapat / Güvenli Çıkış Yap"
                >
                  <LogOut className="w-3 h-3 xs:w-3.5 xs:h-3.5 sm:w-4 sm:h-4 text-rose-400 shrink-0" />
                  <span className="hidden sm:inline">Çıkış</span>
                </button>

                {/* Mobile / Quick Switch button when teacher is on student view */}
                {activeRole === 'student' && (
                  <button
                    onClick={() => switchRole('teacher')}
                    className="px-1.5 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium text-amber-300 hover:text-white bg-amber-950/60 hover:bg-amber-900 border border-amber-800 rounded-lg transition-colors shrink-0"
                    title="Öğretmen Paneline Dön"
                  >
                    Dön
                  </button>
                )}
              </div>
            ) : isStudentSession && activeStudent ? (
              /* STUDENT LOGGED IN WITH PROFILE DROPDOWN MENU */
              <div className="flex items-center space-x-1 sm:space-x-2 pl-1 sm:pl-2 border-l border-slate-700 min-w-0 shrink">
                {/* 1. Öğrenci Profil Resmi */}
                <div
                  className="relative group cursor-pointer shrink-0"
                  onClick={() => setIsStudentAvatarModalOpen(true)}
                  title="Profil Resmini Değiştir / Fotoğraf Yükle (Tıklayın)"
                  id="navbar-student-avatar-trigger"
                >
                  <div className="w-6 h-6 xs:w-7 xs:h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-tr from-indigo-700 via-indigo-600 to-cyan-500 ring-1 sm:ring-2 ring-indigo-400/80 hover:ring-indigo-300 shadow-md flex items-center justify-center overflow-hidden transition-all group-hover:scale-105">
                    {activeStudent.avatar ? (
                      activeStudent.avatar.startsWith('http') || activeStudent.avatar.startsWith('data:') ? (
                        <img
                          src={activeStudent.avatar}
                          alt={activeStudent.name}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <span className="text-xs sm:text-base md:text-lg select-none leading-none">
                          {activeStudent.avatar}
                        </span>
                      )
                    ) : (
                      <span className="font-black text-[9px] xs:text-[10px] sm:text-xs text-white">
                        {activeStudent.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Fotoğraf Değiştir İpucu */}
                  <div className="absolute inset-0 bg-black/45 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white drop-shadow-md" />
                  </div>

                  {/* Kamera Rozeti */}
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 xs:w-3 xs:h-3 sm:w-4 sm:h-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center border sm:border-2 border-slate-900 shadow-sm transition-transform group-hover:scale-110">
                    <Camera className="w-1.5 h-1.5 sm:w-2 sm:h-2" />
                  </div>
                </div>

                {/* 2. Öğrenci Resminin Yanında Açılır Menü Butonu */}
                <div className="relative min-w-0 shrink" ref={studentMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsStudentMenuOpen(!isStudentMenuOpen)}
                    id="navbar-student-menu-dropdown-btn"
                    className="flex items-center space-x-1 sm:space-x-2 px-1.5 xs:px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-left transition-all cursor-pointer group shadow-sm hover:border-indigo-500/50 min-w-0 max-w-[70px] xs:max-w-[90px] sm:max-w-[140px] md:max-w-none"
                    title="Öğrenci Menüsü (Bilgileri Güncelle, Şifre Değiştir, Profil Resmi Değiştir)"
                  >
                    <div className="hidden sm:block text-left min-w-0">
                      <p className="text-xs font-bold text-white leading-tight group-hover:text-indigo-300 transition-colors truncate max-w-[140px]">
                        {activeStudent.name}
                      </p>
                      <p className="text-[10px] text-indigo-300 font-medium leading-tight truncate">
                        {activeStudent.className || 'Öğrenci'} • #{activeStudent.studentNumber || activeStudent.id}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-300 sm:hidden truncate">
                      İşlemler
                    </span>
                    <ChevronDown
                      className={`w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-indigo-400 transition-transform duration-200 shrink-0 ${
                        isStudentMenuOpen ? 'rotate-180 text-white' : ''
                      }`}
                    />
                  </button>

                  {/* Açılır Menü İçeriği */}
                  {isStudentMenuOpen && (
                    <div className="fixed sm:absolute top-[3.1rem] sm:top-auto sm:mt-2 right-1 sm:right-0 w-[calc(100vw-0.5rem)] sm:w-64 max-w-xs bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-4 py-2.5 border-b border-slate-800 mb-1">
                        <p className="text-xs font-bold text-white truncate">
                          {activeStudent.name}
                        </p>
                        <p className="text-[11px] text-indigo-300 font-medium truncate mt-0.5">
                          {activeStudent.className} • No: #{activeStudent.studentNumber || activeStudent.id}
                        </p>
                      </div>

                      {/* Bilgilerini Güncelle */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsStudentMenuOpen(false);
                          setIsStudentEditProfileOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-2.5 transition-colors cursor-pointer"
                      >
                        <UserCog className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>Bilgilerimi Güncelle</span>
                      </button>

                      {/* Şifre Değiştir */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsStudentMenuOpen(false);
                          setIsStudentChangePasswordOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-2.5 transition-colors cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Şifre Değiştir</span>
                      </button>

                      {/* Profil Resmi Değiştir / Yükle */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsStudentMenuOpen(false);
                          setIsStudentAvatarModalOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-2.5 transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span>Profil Resmi Değiştir / Yükle</span>
                      </button>

                      <div className="p-2 border-t border-slate-800">
                        <SyncStatusIndicator variant="card" />
                      </div>

                      <div className="my-1 border-t border-slate-800" />

                      {/* Güvenli Çıkış Yap */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsStudentMenuOpen(false);
                          handleLogoutAction();
                        }}
                        className="w-full px-4 py-2 text-left text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center space-x-2.5 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Güvenli Çıkış Yap</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Logout Button */}
                <button
                  type="button"
                  onClick={handleLogoutAction}
                  id="navbar-student-logout-btn"
                  className="flex items-center space-x-0.5 sm:space-x-1 px-1.5 xs:px-2 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500/25 active:bg-rose-600/30 rounded-lg sm:rounded-xl transition-all border border-rose-500/30 hover:border-rose-500/50 cursor-pointer shrink-0 shadow-sm"
                  title="Öğrenci Çıkışı Yap"
                >
                  <LogOut className="w-3 h-3 xs:w-3.5 xs:h-3.5 sm:w-4 sm:h-4 text-rose-400 shrink-0" />
                  <span className="hidden sm:inline">Çıkış</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>

      {/* Teacher Profile Modals */}
      {isTeacherSession && currentTeacher && (
        <>
          <TeacherAvatarModal
            isOpen={isAvatarModalOpen}
            onClose={() => setIsAvatarModalOpen(false)}
            teacher={currentTeacher}
          />
          <TeacherProfileEditModal
            isOpen={isEditProfileOpen}
            onClose={() => setIsEditProfileOpen(false)}
            teacher={currentTeacher}
          />
          <TeacherPasswordModal
            isOpen={isChangePasswordOpen}
            onClose={() => setIsChangePasswordOpen(false)}
            teacher={currentTeacher}
          />
          <TeacherApprovalModal
            isOpen={isApprovalModalOpen}
            onClose={() => setIsApprovalModalOpen(false)}
          />
        </>
      )}

      {/* Teacher Sent Communications Modal */}
      {isTeacherSession && (
        <SentCommunicationsModal
          isOpen={isSentCommunicationsOpen}
          onClose={() => setIsSentCommunicationsOpen(false)}
        />
      )}

      {/* Student Notification Center Modal */}
      {isStudentSession && activeStudent && (
        <>
          <StudentNotificationCenterModal
            isOpen={isStudentNotificationOpen}
            onClose={() => setIsStudentNotificationOpen(false)}
            currentStudent={activeStudent}
          />
          <StudentAvatarModal
            isOpen={isStudentAvatarModalOpen}
            onClose={() => setIsStudentAvatarModalOpen(false)}
            student={activeStudent}
          />
          <StudentProfileEditModal
            isOpen={isStudentEditProfileOpen}
            onClose={() => setIsStudentEditProfileOpen(false)}
            student={activeStudent}
          />
          <StudentPasswordModal
            isOpen={isStudentChangePasswordOpen}
            onClose={() => setIsStudentChangePasswordOpen(false)}
            student={activeStudent}
          />
        </>
      )}
    </>
  );
};

