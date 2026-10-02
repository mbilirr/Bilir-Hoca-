import React, { useState, useRef, useEffect } from 'react';
import { LogOut, ShieldCheck, ChevronDown, UserCog, KeyRound, Crown, Mail, Camera, Search, Database, Settings2 } from 'lucide-react';
import { UserRole, Student, Teacher, AuthSession, TeacherTabType } from '../types';
import { TeacherProfileEditModal, TeacherPasswordModal } from './Teacher/TeacherProfileModals';
import { TeacherApprovalModal } from './Teacher/TeacherApprovalModal';
import { SentCommunicationsModal } from './Teacher/SentCommunicationsModal';
import { TeacherAvatarModal } from './Teacher/TeacherAvatarModal';
import { StudentAvatarModal } from './Student/StudentAvatarModal';
import { StudentProfileEditModal, StudentPasswordModal } from './Student/StudentProfileModals';
import { SyncStatusIndicator } from './Common/SyncStatusIndicator';
import { dataService } from '../services/dataService';
import { teacherNavFor } from './Layout/navItems';
import { openCommandPalette } from './Layout/CommandPalette';
import { ThemeToggle, cx } from './ui/kit';

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

const initialsOf = (name?: string) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0] || '')
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('tr-TR') || '?';

// Yuvarlak profil resmi (fotoğraf, emoji veya baş harfler)
const Avatar: React.FC<{ name?: string; avatar?: string; size?: 'sm' | 'md' }> = ({ name, avatar, size = 'sm' }) => {
  const box = size === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
  const isImg = !!avatar && (avatar.startsWith('http') || avatar.startsWith('data:'));
  return (
    <span
      className={cx(
        'rounded-full overflow-hidden flex items-center justify-center shrink-0 font-bold text-white bg-gradient-to-br from-indigo-500 to-violet-500 ring-2 ring-surface',
        box
      )}
    >
      {isImg ? (
        <img src={avatar} alt={name || ''} className="w-full h-full object-cover" />
      ) : avatar ? (
        <span className="leading-none select-none text-base">{avatar}</span>
      ) : (
        initialsOf(name)
      )}
    </span>
  );
};

const MenuItem: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'warning';
  trailing?: React.ReactNode;
}> = ({ icon: Icon, children, onClick, tone = 'default', trailing }) => (
  <button
    type="button"
    onClick={onClick}
    className={cx(
      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm cursor-pointer transition-colors',
      tone === 'danger'
        ? 'text-danger-fg hover:bg-danger-soft'
        : tone === 'warning'
        ? 'text-warning-fg hover:bg-warning-soft'
        : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
    )}
  >
    <Icon className="w-4 h-4 shrink-0 opacity-80" />
    <span className="flex-1 min-w-0 truncate">{children}</span>
    {trailing}
  </button>
);

export const Navbar: React.FC<NavbarProps> = ({
  authSession,
  onOpenSupabaseGuide,
  currentStudent,
  onStudentLogout,
  onLogout,
  activeTeacherTab = 'home',
  onSelectTeacherTab,
  unreadMessagesCount = 0,
}) => {
  const isTeacherSession = authSession?.role === 'teacher';
  const isStudentSession = authSession?.role === 'student';

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isSentCommunicationsOpen, setIsSentCommunicationsOpen] = useState(false);
  const [isStudentEditProfileOpen, setIsStudentEditProfileOpen] = useState(false);
  const [isStudentChangePasswordOpen, setIsStudentChangePasswordOpen] = useState(false);
  const [isStudentAvatarModalOpen, setIsStudentAvatarModalOpen] = useState(false);
  const [pendingTeachersCount, setPendingTeachersCount] = useState<number>(0);

  const menuRef = useRef<HTMLDivElement | null>(null);

  const currentTeacher = isTeacherSession ? (authSession!.user as Teacher) : null;
  const activeStudent = isStudentSession ? (authSession!.user as Student) : currentStudent;

  // Yönetici kontrolü tek yerden yapılır (isim değil, kayıttaki yönetici yetkisi esas alınır)
  const isTeacherAdmin = isTeacherSession && dataService.isTeacherAdmin(currentTeacher);
  const navItems = teacherNavFor(!!isTeacherAdmin);

  // Menü dışına tıklanınca veya Esc'e basılınca kapat
  useEffect(() => {
    if (!isMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen]);

  // Yönetici: onay bekleyen öğretmen başvuruları
  useEffect(() => {
    const updatePendingCount = () => {
      setPendingTeachersCount(isTeacherSession && currentTeacher?.isAdmin ? dataService.getPendingTeachers().length : 0);
    };
    updatePendingCount();
    const unsubscribe = dataService.subscribe(updatePendingCount);
    return () => unsubscribe();
  }, [isTeacherSession, currentTeacher?.isAdmin]);

  const handleLogoutAction = () => {
    if (onLogout) onLogout();
    else if (onStudentLogout) onStudentLogout();
  };

  const goTab = (tab: TeacherTabType) => {
    setIsMenuOpen(false);
    onSelectTeacherTab && onSelectTeacherTab(tab);
  };

  const closeAnd = (fn: () => void) => () => {
    setIsMenuOpen(false);
    fn();
  };

  const brand = (
    <button
      type="button"
      onClick={() => goTab('home')}
      title="Ana Sayfa"
      className="flex items-center gap-2.5 shrink-0 cursor-pointer rounded-xl -ml-1 pl-1 pr-2 py-1 hover:bg-surface-2 transition-colors"
    >
      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 p-1.5 flex items-center justify-center shadow-sm">
        <img src="/logo.svg" alt="" className="w-full h-full object-contain" />
      </span>
      <span className="hidden sm:block text-left leading-tight">
        <span className="block text-sm font-bold text-fg tracking-tight">Eğitim Takip</span>
        <span className="block text-[11px] text-muted">{isStudentSession ? 'Öğrenci Portalı' : 'Öğretmen Paneli'}</span>
      </span>
    </button>
  );

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-surface/90 backdrop-blur-md border-b border-line">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 sm:gap-3 h-14 sm:h-16">
            {brand}

            {isStudentSession && activeStudent && (
              <span className="sm:hidden text-sm font-semibold text-fg truncate min-w-0">Merhaba, {activeStudent.name.split(' ')[0]}</span>
            )}

            {/* Hızlı arama (öğretmen) */}
            {isTeacherSession && (
              <>
                <button
                  type="button"
                  id="navbar-search-btn"
                  onClick={openCommandPalette}
                  className="hidden md:flex items-center gap-2.5 ml-2 lg:ml-6 w-64 lg:w-80 px-3 py-2 rounded-xl border border-line bg-surface-2 text-sm text-subtle hover:border-line-strong hover:text-muted transition-colors cursor-pointer"
                  title="Hızlı ara (Ctrl+K)"
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left truncate">Öğrenci, ödev, sayfa ara…</span>
                  <kbd className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-line bg-surface text-muted font-sans">Ctrl K</kbd>
                </button>
              </>
            )}

            <div className="flex-1" />

            {isTeacherSession && (
              <button
                type="button"
                onClick={openCommandPalette}
                className="md:hidden ui-btn ui-btn-ghost ui-btn-icon"
                aria-label="Hızlı ara"
                title="Hızlı ara"
              >
                <Search className="w-5 h-5" />
              </button>
            )}

            {/* Yönetici: onay bekleyen öğretmen başvurusu varsa görünür */}
            {isTeacherSession && currentTeacher?.isAdmin && pendingTeachersCount > 0 && (
              <button
                type="button"
                onClick={() => setIsApprovalModalOpen(true)}
                className="relative ui-btn ui-btn-ghost ui-btn-icon"
                title={`${pendingTeachersCount} öğretmen başvurusu onay bekliyor`}
                aria-label={`${pendingTeachersCount} öğretmen başvurusu onay bekliyor`}
              >
                <ShieldCheck className="w-5 h-5 text-warning-fg" />
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-warning text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingTeachersCount}
                </span>
              </button>
            )}

            <SyncStatusIndicator variant="badge" className="hidden sm:inline-flex shrink-0" />
            <ThemeToggle />

            {/* Profil menüsü */}
            {(isTeacherSession && currentTeacher) || (isStudentSession && activeStudent) ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  id={isTeacherSession ? 'navbar-teacher-profile-dropdown-btn' : 'navbar-student-menu-dropdown-btn'}
                  onClick={() => setIsMenuOpen((o) => !o)}
                  aria-expanded={isMenuOpen}
                  aria-haspopup="true"
                  className={cx(
                    'flex items-center gap-2 rounded-full sm:rounded-xl pl-0.5 sm:pl-1 pr-1 sm:pr-2 py-0.5 sm:py-1 cursor-pointer transition-colors',
                    isMenuOpen ? 'bg-surface-2' : 'hover:bg-surface-2'
                  )}
                  title="Hesap menüsü"
                >
                  <span className="relative">
                    <Avatar
                      name={isTeacherSession ? currentTeacher?.name : activeStudent?.name}
                      avatar={isTeacherSession ? currentTeacher?.avatar : activeStudent?.avatar}
                    />
                    {isTeacherSession && currentTeacher?.isAdmin && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-warning text-white flex items-center justify-center ring-2 ring-surface" title="Yönetici">
                        <Crown className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </span>
                  <span className="hidden lg:block text-left leading-tight max-w-[160px]">
                    <span className="block text-sm font-semibold text-fg truncate">
                      {isTeacherSession ? currentTeacher?.name : activeStudent?.name}
                    </span>
                    <span className="block text-[11px] text-muted truncate">
                      {isTeacherSession ? currentTeacher?.branch || 'Öğretmen' : activeStudent?.className || 'Öğrenci'}
                    </span>
                  </span>
                  <ChevronDown className={cx('hidden sm:block w-4 h-4 text-muted transition-transform', isMenuOpen && 'rotate-180')} />
                </button>

                {isMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-1.5rem))] bg-surface border border-line rounded-2xl shadow-pop p-2 z-50"
                  >
                    {/* Kim olduğu */}
                    <div className="flex items-center gap-3 px-2 py-2 mb-1">
                      <Avatar
                        size="md"
                        name={isTeacherSession ? currentTeacher?.name : activeStudent?.name}
                        avatar={isTeacherSession ? currentTeacher?.avatar : activeStudent?.avatar}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-fg truncate">
                          {isTeacherSession ? currentTeacher?.name : activeStudent?.name}
                        </p>
                        <p className="text-xs text-muted truncate">
                          {isTeacherSession
                            ? currentTeacher?.branch || 'Öğretmen'
                            : `${activeStudent?.className || 'Öğrenci'} · No: ${activeStudent?.studentNumber || activeStudent?.id}`}
                        </p>
                        {isTeacherSession && currentTeacher?.isAdmin && (
                          <span className="ui-chip ui-chip-warning mt-1">
                            <Crown className="w-3 h-3" /> Yönetici
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ui-divider my-1" />

                    {isTeacherSession ? (
                      <>
                        <MenuItem icon={UserCog} onClick={closeAnd(() => setIsEditProfileOpen(true))}>
                          Bilgilerimi Güncelle
                        </MenuItem>
                        <MenuItem icon={Camera} onClick={closeAnd(() => setIsAvatarModalOpen(true))}>
                          Profil Resmi
                        </MenuItem>
                        <MenuItem icon={KeyRound} onClick={closeAnd(() => setIsChangePasswordOpen(true))}>
                          Şifre Değiştir
                        </MenuItem>
                        <MenuItem icon={Mail} onClick={closeAnd(() => setIsSentCommunicationsOpen(true))}>
                          Giden E-Posta & Bildirimler
                        </MenuItem>
                        {currentTeacher?.isAdmin && (
                          <>
                            <div className="ui-divider my-1" />
                            <p className="px-3 pt-1.5 pb-1 ui-eyebrow">Yönetici</p>
                            <MenuItem
                              icon={ShieldCheck}
                              onClick={closeAnd(() => setIsApprovalModalOpen(true))}
                              trailing={pendingTeachersCount > 0 ? <span className="ui-chip ui-chip-warning">{pendingTeachersCount}</span> : undefined}
                            >
                              Öğretmenler & Sınıf İzinleri
                            </MenuItem>
                            <MenuItem icon={Settings2} onClick={() => goTab('user_management')}>
                              Yönetim Paneli
                            </MenuItem>
                            {onOpenSupabaseGuide && (
                              <MenuItem icon={Database} onClick={closeAnd(onOpenSupabaseGuide)}>
                                Veritabanı Kurulum Rehberi
                              </MenuItem>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <MenuItem icon={UserCog} onClick={closeAnd(() => setIsStudentEditProfileOpen(true))}>
                          Bilgilerimi Güncelle
                        </MenuItem>
                        <MenuItem icon={Camera} onClick={closeAnd(() => setIsStudentAvatarModalOpen(true))}>
                          Profil Resmi
                        </MenuItem>
                        <MenuItem icon={KeyRound} onClick={closeAnd(() => setIsStudentChangePasswordOpen(true))}>
                          Şifre Değiştir
                        </MenuItem>
                      </>
                    )}

                    <div className="ui-divider my-1" />
                    <SyncStatusIndicator variant="card" className="my-1" />
                    <MenuItem icon={LogOut} tone="danger" onClick={closeAnd(handleLogoutAction)}>
                      Güvenli Çıkış Yap
                    </MenuItem>
                  </div>
                )}
              </div>
            ) : null}

            {/* Hızlı çıkış */}
            {(isTeacherSession || isStudentSession) && (
              <button
                type="button"
                onClick={handleLogoutAction}
                id={isTeacherSession ? 'navbar-teacher-quick-logout-btn' : 'navbar-student-logout-btn'}
                className={cx('ui-btn ui-btn-ghost ui-btn-icon text-muted hover:text-danger-fg', isTeacherSession && 'hidden sm:inline-flex')}
                title="Çıkış"
                aria-label="Çıkış"
              >
                <LogOut className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>

          {/* Öğretmen bölümleri (tablet ve bilgisayar) */}
          {isTeacherSession && onSelectTeacherTab && (
            <nav aria-label="Bölümler" className="hidden md:flex items-center gap-1 -mb-px overflow-x-auto [scrollbar-width:none]">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeTeacherTab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`nav-tab-${item.id}`}
                    onClick={() => goTab(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer',
                      active ? 'border-brand text-fg' : 'border-transparent text-muted hover:text-fg hover:border-line-strong'
                    )}
                  >
                    <Icon className={cx('w-4 h-4', active ? 'text-brand-fg' : '')} />
                    {item.title}
                    {item.id === 'messages' && unreadMessagesCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      {/* Öğretmen pencereleri */}
      {isTeacherSession && currentTeacher && (
        <>
          <TeacherAvatarModal isOpen={isAvatarModalOpen} onClose={() => setIsAvatarModalOpen(false)} teacher={currentTeacher} />
          <TeacherProfileEditModal isOpen={isEditProfileOpen} onClose={() => setIsEditProfileOpen(false)} teacher={currentTeacher} />
          <TeacherPasswordModal isOpen={isChangePasswordOpen} onClose={() => setIsChangePasswordOpen(false)} teacher={currentTeacher} />
          <TeacherApprovalModal isOpen={isApprovalModalOpen} onClose={() => setIsApprovalModalOpen(false)} />
          <SentCommunicationsModal isOpen={isSentCommunicationsOpen} onClose={() => setIsSentCommunicationsOpen(false)} />
        </>
      )}

      {/* Öğrenci pencereleri */}
      {isStudentSession && activeStudent && (
        <>
          <StudentAvatarModal isOpen={isStudentAvatarModalOpen} onClose={() => setIsStudentAvatarModalOpen(false)} student={activeStudent} />
          <StudentProfileEditModal isOpen={isStudentEditProfileOpen} onClose={() => setIsStudentEditProfileOpen(false)} student={activeStudent} />
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
