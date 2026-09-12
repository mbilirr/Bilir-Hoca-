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
} from 'lucide-react';
import { UserRole, Student, Teacher, AuthSession, TeacherTabType } from '../types';
import { TeacherProfileEditModal, TeacherPasswordModal } from './Teacher/TeacherProfileModals';
import { TeacherApprovalModal } from './Teacher/TeacherApprovalModal';
import { SentCommunicationsModal } from './Teacher/SentCommunicationsModal';
import { StudentNotificationCenterModal } from './Student/StudentNotificationCenterModal';
import { TeacherAvatarModal } from './Teacher/TeacherAvatarModal';
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
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'students',
    title: 'Öğrenci & Sınıf Yönetimi',
    icon: Users,
    accentColor: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
  },
  {
    id: 'homework',
    title: 'Kazanım Odaklı Ödev Çizelgesi',
    icon: BookOpen,
    accentColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  },
  {
    id: 'etuts',
    title: 'Etüt & Birebir Takip',
    icon: CalendarDays,
    accentColor: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30',
  },
  {
    id: 'grades',
    title: 'Ders Notları & Devamsızlık',
    icon: FileSpreadsheet,
    accentColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  },
  {
    id: 'messages',
    title: 'Öğrenci Soruları & Mesajlaşma',
    icon: MessageSquare,
    accentColor: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
  },
  {
    id: 'archive',
    title: 'Plan & Zümre Arşivi',
    icon: FolderArchive,
    accentColor: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
  },
];

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
  const teacherMenuRef = useRef<HTMLDivElement | null>(null);
  const moduleDropdownRef = useRef<HTMLDivElement | null>(null);

  const pendingTeachersCount = isTeacherSession ? dataService.getPendingTeachers().length : 0;

  // Synchronize internal selectedTeacherTab with activeTeacherTab
  useEffect(() => {
    if (activeTeacherTab) {
      setSelectedTeacherTab(activeTeacherTab === 'home' ? null : activeTeacherTab);
    }
  }, [activeTeacherTab]);

  const activeModuleId = selectedTeacherTab || (activeTeacherTab !== 'home' ? activeTeacherTab : null);
  const activeModuleItem = NAV_ITEMS.find((item) => item.id === activeModuleId);
  const DisplayModuleIcon = activeModuleItem ? activeModuleItem.icon : LayoutGrid;
  const buttonDisplayTitle = activeModuleItem ? activeModuleItem.title : 'Çalışma Alanını Seçiniz';
  const isHomeActive = activeTeacherTab === 'home' || (!activeTeacherTab && !selectedTeacherTab);

  const currentTeacher = isTeacherSession ? (authSession.user as Teacher) : null;
  const activeStudent = isStudentSession ? (authSession.user as Student) : currentStudent;

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
      if (moduleDropdownRef.current && !moduleDropdownRef.current.contains(target)) {
        setIsModuleOpen(false);
      }
    };
    if (isTeacherMenuOpen || isModuleOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTeacherMenuOpen, isModuleOpen]);

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
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[4.25rem] py-2 gap-3">
          {/* Logo & Modül Butonu: Kep Resminin Yanında Tam Solda Çalışma Modülü */}
          <div className="flex items-center space-x-2.5 sm:space-x-3.5 flex-wrap">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-md shadow-indigo-500/20 ring-1 ring-white/10 shrink-0">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>

            {isTeacherSession && currentTeacher ? (
              <div className="flex items-center space-x-2 sm:space-x-2.5 flex-wrap gap-y-1.5">
                {/* Öğretmen Çalışma Modül Butonu: Tam Solda, Turuncu Yanan Sönen Işık Efektli */}
                {onSelectTeacherTab && (
                  <div className="relative" ref={moduleDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsModuleOpen(!isModuleOpen)}
                      aria-expanded={isModuleOpen}
                      aria-haspopup="true"
                      id="teacher-module-sticky-btn"
                      className={`px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-2xl font-black text-xs sm:text-sm flex items-center space-x-2 sm:space-x-2.5 transition-all cursor-pointer border-2 shadow-lg ${
                        isModuleOpen
                          ? 'bg-orange-600 text-white border-orange-400 shadow-orange-500/50 ring-2 ring-orange-400/60 scale-[1.02]'
                          : 'bg-gradient-to-r from-orange-950/70 via-slate-900 to-orange-950/70 hover:from-orange-900/80 hover:to-slate-850 text-white border-orange-500/85 hover:border-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.45)] hover:shadow-[0_0_30px_rgba(249,115,22,0.7)]'
                      }`}
                    >
                      {/* Turuncu Yanıp Sönen Canlı Işık Efekti */}
                      <span className="relative flex h-3.5 w-3.5 shrink-0" title="Aktif Çalışma Işığı">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-90 duration-1000"></span>
                        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 shadow-[0_0_14px_#f97316] ring-2 ring-amber-200"></span>
                      </span>

                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-1 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-xs sm:text-sm shadow-md flex items-center space-x-1.5">
                          <DisplayModuleIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-950 stroke-[2.5]" />
                          <span className="tracking-tight">{buttonDisplayTitle}</span>
                        </span>
                      </div>

                      {activeModuleItem?.id === 'messages' && unreadMessagesCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-bounce">
                          {unreadMessagesCount}
                        </span>
                      )}
                      {activeModuleItem?.id === 'archive' && documentsCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-purple-500 text-white text-[10px] font-black">
                          {documentsCount}
                        </span>
                      )}

                      <ChevronDown
                        className={`w-4 h-4 text-orange-300 transition-transform duration-200 shrink-0 ${
                          isModuleOpen ? 'rotate-180 text-white' : ''
                        }`}
                      />
                    </button>

                    {/* Açılır Menü (Dropdown Menu) */}
                    {isModuleOpen && (
                      <div
                        role="menu"
                        className="absolute z-50 left-0 w-80 sm:w-88 mt-2 bg-slate-950 border border-slate-700/90 rounded-2xl shadow-2xl p-2.5 backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150"
                      >
                        <div className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between mb-1.5">
                          <span>Öğretmen Çalışma Modülleri</span>
                          <span className="text-[10px] text-indigo-400 font-semibold">6 Modül</span>
                        </div>

                        {/* Hızlı Ana Sayfa Seçeneği */}
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setSelectedTeacherTab(null);
                            onSelectTeacherTab('home');
                            setIsModuleOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between group cursor-pointer mb-1 border ${
                            isHomeActive
                              ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50 shadow-sm'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border-slate-800/80'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 text-indigo-300 bg-indigo-500/20 border-indigo-500/40">
                              <Home className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-extrabold text-white">Ana Sayfa (Ajanda & Özetler)</span>
                          </div>
                          {isHomeActive && <Check className="w-4 h-4 text-indigo-400 font-black shrink-0" />}
                        </button>
                        <div className="h-px bg-slate-800 my-1.5" />

                        <div className="space-y-1">
                          {NAV_ITEMS.map((item, index) => {
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

                {/* Ana Sayfa Butonu: Modül Butonunun Yanında */}
                {onSelectTeacherTab && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeacherTab(null);
                      onSelectTeacherTab('home');
                    }}
                    id="teacher-navbar-home-btn"
                    className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-black text-xs sm:text-sm flex items-center space-x-1.5 sm:space-x-2 transition-all cursor-pointer border-2 shadow-md ${
                      isHomeActive
                        ? 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 text-white border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)] ring-2 ring-indigo-400/50 scale-[1.02]'
                        : 'bg-slate-800/90 hover:bg-slate-750 text-slate-300 hover:text-white border-slate-700 hover:border-slate-600'
                    }`}
                    title="Ana Sayfa (Ajanda ve Durum Özetleri Duvarı)"
                  >
                    <Home className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isHomeActive ? 'text-white' : 'text-indigo-400'}`} />
                    <span>Ana Sayfa</span>
                  </button>
                )}
              </div>
            ) : isStudentSession && activeStudent ? (
              <div className="flex flex-col text-left">
                <span className="text-sm sm:text-base font-black text-white tracking-wide leading-tight">
                  {activeStudent.name}
                </span>
                <span className="text-[11px] font-semibold text-pink-300 leading-tight">
                  {activeStudent.className} • No: {activeStudent.studentNumber}
                </span>
              </div>
            ) : (
              <div className="flex flex-col text-left">
                <span className="text-sm sm:text-base font-black text-white tracking-wide leading-tight">
                  Eğitim Portalı
                </span>
              </div>
            )}
          </div>

          {/* Right Action & Profile info */}
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            {/* Google Calendar shortcut */}
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Google Takvim'i Yeni Sekmede Aç"
            >
              <Calendar className="w-4 h-4" />
            </a>

            {/* Admin Pending Teachers Notification Button */}
            {isTeacherSession && currentTeacher?.isAdmin && pendingTeachersCount > 0 && (
              <button
                type="button"
                onClick={() => setIsApprovalModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all animate-pulse cursor-pointer shadow-sm shadow-amber-500/20"
                title="Onay Bekleyen Öğretmen Başvuruları"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Onay Bekleyen:</span>
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold">
                  {pendingTeachersCount}
                </span>
              </button>
            )}

            {/* TEACHER LOGGED IN */}
            {isTeacherSession && currentTeacher ? (
              <div className="flex items-center space-x-2.5 sm:space-x-3 pl-2 border-l border-slate-700">
                {/* 1. Öğretmen Resminin Değiştirildiği Bölüm (Takvim ile Bilgileri Güncelleme Butonunun Arasında) */}
                <div
                  className="relative group cursor-pointer shrink-0"
                  onClick={() => setIsAvatarModalOpen(true)}
                  title="Profil Resmini Değiştir / Fotoğraf Yükle (Tıklayın)"
                  id="navbar-teacher-avatar-trigger"
                >
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 ring-2 ring-indigo-400/80 hover:ring-indigo-300 shadow-md shadow-indigo-950/70 flex items-center justify-center overflow-hidden transition-all group-hover:scale-105">
                    {currentTeacher.avatar ? (
                      currentTeacher.avatar.startsWith('http') || currentTeacher.avatar.startsWith('data:') ? (
                        <img
                          src={currentTeacher.avatar}
                          alt={currentTeacher.name}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <span className="text-xl sm:text-2xl select-none leading-none">
                          {currentTeacher.avatar}
                        </span>
                      )
                    ) : (
                      <span className="font-black text-xs sm:text-sm text-white tracking-wider">
                        {teacherInitials}
                      </span>
                    )}
                  </div>

                  {/* Fotoğraf Değiştir İpucu / Overlay */}
                  <div className="absolute inset-0 bg-black/45 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-4 h-4 text-white drop-shadow-md" />
                  </div>

                  {/* Köşedeki Küçük Kamera Rozeti */}
                  <div className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center border-2 border-slate-900 shadow-sm transition-transform group-hover:scale-110">
                    <Camera className="w-2.5 h-2.5" />
                  </div>

                  {currentTeacher.isAdmin && (
                    <span
                      className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center text-[10px] shadow-sm font-black"
                      title="Yönetici (Admin)"
                    >
                      👑
                    </span>
                  )}
                </div>

                {/* 2. Öğretmen Bilgileri ve Menü Butonu (İçinden Resim Silindi) */}
                <div className="relative" ref={teacherMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsTeacherMenuOpen(!isTeacherMenuOpen)}
                    className={`flex items-center space-x-2.5 px-3 py-1.5 sm:py-2 rounded-2xl border transition-all cursor-pointer shadow-sm ${
                      isTeacherMenuOpen
                        ? 'bg-slate-800/95 border-indigo-500 text-white ring-2 ring-indigo-500/30'
                        : 'bg-gradient-to-b from-slate-850 to-slate-900 hover:from-slate-800 hover:to-slate-850 border-slate-700/80 hover:border-indigo-400 text-slate-200 hover:text-white'
                    }`}
                    title={`Öğretmen Profil ve Hesap Menüsü (${currentTeacher.name})`}
                    id="navbar-teacher-profile-dropdown-btn"
                  >
                    {/* Öğretmen İsmi ve Branş Yazısı */}
                    <div className="flex flex-col text-left justify-center min-w-0 pr-1">
                      <span className="text-xs sm:text-sm font-black text-white tracking-wide uppercase leading-tight truncate">
                        {currentTeacher.name}
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-bold text-amber-300 leading-tight truncate mt-0.5">
                        {currentTeacher.branch
                          ? currentTeacher.branch.includes('Öğretmen')
                            ? currentTeacher.branch
                            : `${currentTeacher.branch} Öğretmeni`
                          : 'Öğretmen Hesabı'}
                      </span>
                    </div>

                    {currentTeacher.isAdmin && (
                      <span
                        className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 hidden sm:inline-flex items-center"
                        title="Yönetici (Admin)"
                      >
                        👑 Admin
                      </span>
                    )}

                    {/* Açılır Menü Oku */}
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                        isTeacherMenuOpen ? 'rotate-180 text-indigo-400' : ''
                      }`}
                    />
                  </button>

                  {/* Açılır Pencere / Dropdown Menü */}
                  {isTeacherMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
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

                {/* Mobile / Quick Switch button when teacher is on student view */}
                {activeRole === 'student' && (
                  <button
                    onClick={() => switchRole('teacher')}
                    className="px-2.5 py-1 text-xs font-medium text-amber-300 hover:text-white bg-amber-950/60 hover:bg-amber-900 border border-amber-800 rounded-lg transition-colors"
                    title="Öğretmen Paneline Dön"
                  >
                    Öğretmen Paneline Dön
                  </button>
                )}
              </div>
            ) : isStudentSession && activeStudent ? (
              /* STUDENT LOGGED IN (CANNOT SWITCH TO TEACHER) */
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-700">
                <img
                  src={
                    activeStudent.avatar ||
                    `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                      activeStudent.name
                    )}`
                  }
                  alt={activeStudent.name}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-400/40 bg-slate-800"
                />
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-white leading-none">
                    {activeStudent.name}
                  </p>
                  <p className="text-[10px] text-indigo-300 leading-tight">
                    {activeStudent.className || 'Öğrenci'} • No: {activeStudent.studentNumber}
                  </p>
                </div>

                {/* Student Notification Center Bell Button */}
                <button
                  type="button"
                  onClick={() => setIsStudentNotificationOpen(true)}
                  className="relative p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/60 cursor-pointer"
                  title="Gelen Bildirimler ve E-Postalar"
                >
                  <Bell className="w-4 h-4 text-indigo-400" />
                  {studentUnreadNotifCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center animate-bounce">
                      {studentUnreadNotifCount}
                    </span>
                  )}
                </button>

                {/* Student Logout */}
                <button
                  onClick={handleLogoutAction}
                  id="navbar-student-logout-btn"
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors ml-1 border border-slate-700/60"
                  title="Öğrenci Çıkışı Yap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Çıkış Yap</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

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
        <StudentNotificationCenterModal
          isOpen={isStudentNotificationOpen}
          onClose={() => setIsStudentNotificationOpen(false)}
          currentStudent={activeStudent}
        />
      )}
    </header>
  );
};

