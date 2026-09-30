import React, { useState, useEffect, useRef } from 'react';
import {
  GraduationCap,
  ShieldCheck,
  BookOpen,
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  School,
  Hash,
  Mail,
  Phone,
  Briefcase,
  ArrowRight,
  Zap,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Teacher, Student, ClassGroup, AuthSession, UserRole } from '../../types';
import { dataService } from '../../services/dataService';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface AuthPortalProps {
  onAuthSuccess: (session: AuthSession) => void;
  classes: ClassGroup[];
  students: Student[];
  teachers: Teacher[];
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  onAuthSuccess,
  classes,
  students,
  teachers,
}) => {
  // Main view mode: 'login' | 'register'
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  // Selected role tab for login/register: 'teacher' | 'student'
  const [selectedRole, setSelectedRole] = useState<UserRole>('teacher');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Common notification feedback
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Remember Me & Easy Login (Role-specific separation)
  const [rememberedTeacher, setRememberedTeacher] = useState(() => dataService.getRememberedUser('teacher'));
  const [rememberedStudent, setRememberedStudent] = useState(() => dataService.getRememberedUser('student'));
  const [rememberMe, setRememberMe] = useState(() => Boolean(dataService.getRememberedUser('teacher')));

  // Listen to dataService updates so remembered users & teachers stay synchronized
  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      const curTeacher = dataService.getRememberedUser('teacher');
      const curStudent = dataService.getRememberedUser('student');
      setRememberedTeacher(curTeacher);
      setRememberedStudent(curStudent);
    });
    return () => unsub();
  }, []);

  // Active remembered user strictly matches selectedRole
  const activeRememberedUser = selectedRole === 'teacher' ? rememberedTeacher : rememberedStudent;

  // --- LOGIN FORM STATE ---
  const [loginUsername, setLoginUsername] = useState(() => {
    const rem = dataService.getRememberedUser('teacher');
    return rem?.identifier || '';
  });
  const [loginPassword, setLoginPassword] = useState('');

  // --- ÖĞRENCİ KAYIT BAŞVURUSU (yönetici onayından sonra hesap açılır) ---
  const [aName, setAName] = useState('');
  const [aNumber, setANumber] = useState('');
  const [aClassId, setAClassId] = useState('');
  const [aRequestedClass, setARequestedClass] = useState('');
  const [aPhone, setAPhone] = useState('');
  const [aEmail, setAEmail] = useState('');
  const [aPassword, setAPassword] = useState('');
  const [aConfirmPassword, setAConfirmPassword] = useState('');
  const [aWebsite, setAWebsite] = useState(''); // bot tuzağı (görünmez alan)
  const [selectedAvatarSeed, setSelectedAvatarSeed] = useState('Zeynep');
  const [applicationClasses, setApplicationClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [applicationClassesState, setApplicationClassesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const avatarSeeds = ['Zeynep', 'Emir', 'Elif', 'Burak', 'Ayse', 'Mert', 'Deniz', 'Selin'];

  // Başvuru formu açılınca sınıf listesini sunucudan al (giriş yapmadan okunabilen tek bilgi)
  useEffect(() => {
    if (authMode !== 'register' || applicationClassesState !== 'idle') return;
    setApplicationClassesState('loading');
    dataService
      .fetchApplicationClasses()
      .then((list) => {
        setApplicationClasses(list);
        setApplicationClassesState('ready');
      })
      .catch(() => setApplicationClassesState('error'));
  }, [authMode, applicationClassesState]);

  // Handle role switch in login tab
  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setError(null);
    setSuccessMsg(null);
    const rem = dataService.getRememberedUser(role);
    if (rem) {
      setLoginUsername(rem.identifier);
      setRememberMe(true);
    } else {
      setLoginUsername('');
      setRememberMe(false);
    }
    setLoginPassword('');
  };

  // --- KAYITLI PROFİLLE DEVAM ---
  // Güvenlik gereği oturum sekme kapanınca biter; kayıtlı profil yalnızca giriş adını hatırlar.
  const handleQuickRememberedLogin = () => {
    const targetUser = selectedRole === 'teacher' ? rememberedTeacher : rememberedStudent;
    if (!targetUser || targetUser.role !== selectedRole) {
      setError('Kayıtlı profil bulunamadı. Lütfen kullanıcı adı ve şifrenizle giriş yapınız.');
      return;
    }
    setError(null);
    setLoginUsername(targetUser.identifier);
    setSuccessMsg(`Merhaba ${targetUser.name}! Güvenliğiniz için şifrenizi girip "Giriş Yap" düğmesine basınız.`);
    setTimeout(() => passwordInputRef.current?.focus(), 50);
  };

  const handleForgetRememberedUser = () => {
    dataService.setRememberedUser(null, selectedRole);
    if (selectedRole === 'teacher') {
      setRememberedTeacher(null);
    } else {
      setRememberedStudent(null);
    }
    setLoginUsername('');
    setLoginPassword('');
    setRememberMe(false);
  };

  // --- ŞİFREMİ UNUTTUM ---
  // Gerçek e-posta ile kayıtlı hesaplara Supabase sıfırlama bağlantısı gönderilir.
  // Sistemin ürettiği adresleri kullanan öğretmen/öğrenci hesaplarında şifreyi yönetici belirler.
  const handleForgotPassword = async () => {
    setError(null);
    setSuccessMsg(null);

    if (selectedRole === 'student') {
      setSuccessMsg(
        'Şifrenizi unuttuysanız öğretmeninize veya okul yöneticinize başvurunuz. Size yeni bir şifre belirleyeceklerdir.'
      );
      return;
    }

    const ident = loginUsername.trim().toLowerCase();
    const isRealEmail = ident.includes('@') && !ident.endsWith('@okul.internal.net');
    if (!isRealEmail) {
      setSuccessMsg(
        'Öğretmen hesaplarında şifreyi yönetici yeniler; lütfen yöneticinize başvurunuz. Hesabınız gerçek bir e-posta adresiyle kayıtlıysa, e-posta adresinizi yukarıdaki kutuya yazıp tekrar "Şifremi unuttum"a basınız.'
      );
      return;
    }

    setIsLoading(true);
    try {
      await dataService.sendPasswordResetEmail(ident);
      setSuccessMsg(
        'Bu e-posta adresi sistemde kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu ve gereksiz (spam) klasörünü kontrol ediniz.'
      );
    } catch (err: any) {
      setError(err?.message || 'Sıfırlama e-postası gönderilemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- SUBMIT LOGIN ---
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanUser = loginUsername.trim();
    const cleanPass = loginPassword.trim();

    if (!cleanUser || !cleanPass) {
      setError('Lütfen kullanıcı adı ve şifrenizi giriniz.');
      return;
    }

    setIsLoading(true);

    try {
      if (selectedRole === 'teacher') {
        const teacher = await dataService.authenticateTeacher(cleanUser, cleanPass);
        if (teacher) {
          if (rememberMe) {
            dataService.setRememberedUser({
              role: 'teacher',
              identifier: teacher.username,
              name: teacher.name,
              avatar: teacher.avatar,
              branch: teacher.branch,
            });
            setRememberedTeacher(dataService.getRememberedUser('teacher'));
          } else {
            dataService.setRememberedUser(null, 'teacher');
            setRememberedTeacher(null);
          }

          const session: AuthSession = { role: 'teacher', user: teacher };
          dataService.setAuthSession(session);
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
          setSuccessMsg(`Hoş geldiniz Sn. ${teacher.name}! Panele yönlendiriliyorsunuz...`);
          setTimeout(() => onAuthSuccess(session), 400);
        } else {
          setError('Kullanıcı adı veya şifre hatalı. Lütfen kontrol edip tekrar deneyiniz.');
        }
      } else {
        const student = await dataService.authenticateStudent(cleanUser, cleanPass);
        if (student) {
          if (rememberMe) {
            dataService.setRememberedUser({
              role: 'student',
              identifier: student.studentNumber || student.username,
              name: student.name,
              avatar: student.avatar,
              className: student.className,
            });
            setRememberedStudent(dataService.getRememberedUser('student'));
          } else {
            dataService.setRememberedUser(null, 'student');
            setRememberedStudent(null);
          }

          const session: AuthSession = { role: 'student', user: student };
          dataService.setAuthSession(session);
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
          setSuccessMsg(`Hoş geldin ${student.name}! Öğrenci paneline yönlendiriliyorsunuz...`);
          setTimeout(() => onAuthSuccess(session), 400);
        } else {
          setError('Öğrenci numarası veya şifre hatalı. Şifrenizi bilmiyorsanız öğretmeninize başvurunuz.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Giriş yapılamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- ÖĞRENCİ KAYIT BAŞVURUSU GÖNDER ---
  const handleStudentApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const name = aName.trim().replace(/\s+/g, ' ');
    const number = aNumber.trim();
    if (name.length < 3) {
      setError('Lütfen adınızı ve soyadınızı giriniz.');
      return;
    }
    if (!/^[0-9A-Za-z_-]{1,20}$/.test(number)) {
      setError('Öğrenci numaranızı boşluksuz yazınız (yalnızca rakam ve harf).');
      return;
    }
    if (aPassword.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (aPassword !== aConfirmPassword) {
      setError('Girdiğiniz şifreler birbiriyle uyuşmuyor.');
      return;
    }

    setIsLoading(true);
    try {
      await dataService.submitStudentApplication({
        name,
        studentNumber: number,
        password: aPassword,
        classId: aClassId || undefined,
        requestedClass: aClassId ? undefined : aRequestedClass.trim() || undefined,
        email: aEmail.trim() || undefined,
        phone: aPhone.trim() || undefined,
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(selectedAvatarSeed || name)}`,
        website: aWebsite,
      });
      setAPassword('');
      setAConfirmPassword('');
      setAuthMode('login');
      setSelectedRole('student');
      setLoginUsername(number);
      setLoginPassword('');
      setSuccessMsg(
        `Başvurunuz alındı. Okul yöneticisi onayladıktan sonra "${number}" öğrenci numaranız ve belirlediğiniz şifreyle giriş yapabilirsiniz.`
      );
    } catch (err: any) {
      setError(err?.message || 'Başvuru gönderilemedi. Lütfen daha sonra tekrar deneyiniz.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 text-slate-900 flex flex-col justify-between font-sans selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* DEKORATİF STATİK RENK LEKELERİ (TAMAMEN ANİMASYONSUZ & YUMUŞAK) */}
      <div className="absolute -top-24 -left-24 w-72 h-72 md:w-96 md:h-96 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/4 -right-20 w-64 h-64 md:w-80 md:h-80 bg-amber-100/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 left-1/4 w-72 h-72 md:w-96 md:h-96 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none" />

      {/* Top Brand Bar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-white to-indigo-50 border border-slate-200 p-1.5 flex items-center justify-center shadow-xs overflow-hidden">
            <img src="/logo.svg" alt="Eğitim Takip Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-xl sm:text-2xl tracking-tight text-slate-900">
                Eğitim & Öğrenci Takip Sistemi
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Ödev Yönetimi, Etüt Takibi & Başarı Analizi
            </p>
          </div>
        </div>
      </header>

      {/* Main Center Authentication Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-xl bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-xl p-6 sm:p-8 relative">
          {/* Main Auth Mode Tabs (Giriş Yap vs Kayıt Ol) */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
            <Button
              type="button"
              variant={authMode === 'login' ? 'primary' : 'ghost'}
              size="md"
              onClick={() => {
                setAuthMode('login');
                setError(null);
                setSuccessMsg(null);
              }}
              leftIcon={<LogIn className="w-4 h-4" />}
              className="flex-1"
            >
              Giriş Yap
            </Button>

            <Button
              type="button"
              variant={authMode === 'register' ? 'primary' : 'ghost'}
              size="md"
              onClick={() => {
                setAuthMode('register');
                setSelectedRole('student');
                setError(null);
                setSuccessMsg(null);
              }}
              leftIcon={<UserPlus className="w-4 h-4" />}
              className="flex-1"
            >
              Öğrenci Kaydı
            </Button>
          </div>

          {/* Role Selector Pill (yalnızca girişte; kayıt yalnızca öğrenci başvurusudur) */}
          {authMode === 'login' && (
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 text-center">
              Giriş Yapılacak Rol
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectRole('teacher')}
                className={`flex items-center justify-center space-x-2.5 p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedRole === 'teacher'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-semibold shadow-xs ring-1 ring-indigo-500'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <ShieldCheck
                  className={`w-5 h-5 ${
                    selectedRole === 'teacher' ? 'text-indigo-600' : 'text-slate-400'
                  }`}
                />
                <span className="text-xs sm:text-sm">Öğretmen (Yönetici)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectRole('student')}
                className={`flex items-center justify-center space-x-2.5 p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedRole === 'student'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-semibold shadow-xs ring-1 ring-indigo-500'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <BookOpen
                  className={`w-5 h-5 ${
                    selectedRole === 'student' ? 'text-indigo-600' : 'text-slate-400'
                  }`}
                />
                <span className="text-xs sm:text-sm">Öğrenci Portalı</span>
              </button>
            </div>
          </div>
          )}

          {/* Error & Success Feedback Alerts */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-red-700 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-3 text-emerald-700 text-xs sm:text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-500 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMsg}</div>
            </div>
          )}

          {/* ================= MODE 1: LOGIN ================= */}
          {authMode === 'login' && (
            <div className="space-y-5">
              {/* ROL İLE TAM UYUMLU BENİ HATIRLA - HIZLI GİRİŞ KARTI */}
              {activeRememberedUser && (
                <div className="p-4 rounded-2xl border transition-all bg-indigo-50/50 border-indigo-200">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center space-x-3 min-w-0">
                      <img
                        src={
                          activeRememberedUser.avatar ||
                          `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                            activeRememberedUser.name
                          )}`
                        }
                        alt={activeRememberedUser.name}
                        className="w-11 h-11 rounded-xl bg-white border border-slate-200 shadow-xs object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] font-medium text-slate-500 flex items-center space-x-1">
                            <Zap className="w-3.5 h-3.5 text-slate-400" />
                            <span>Kayıtlı Profil:</span>
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-indigo-100 text-indigo-800 border-indigo-200">
                            {selectedRole === 'teacher' ? 'Öğretmen Hesabı' : 'Öğrenci Hesabı'}
                          </span>
                        </div>
                        <div className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                          {activeRememberedUser.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {activeRememberedUser.branch ||
                            activeRememberedUser.className ||
                            activeRememberedUser.identifier}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-auto">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleQuickRememberedLogin}
                        disabled={isLoading}
                        size="sm"
                        leftIcon={<Zap className="w-4 h-4" />}
                      >
                        Bu Hesapla Devam Et
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleForgetRememberedUser}
                        className="text-slate-500 hover:text-red-600"
                        title="Bu rol için kayıtlı profili kaldır"
                      >
                        Unut
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Farklı hesap bilgileriyle girmek için aşağıdaki formu kullanınız:</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <Input
                  label={
                    selectedRole === 'teacher'
                      ? 'Öğretmen Kullanıcı Adı veya E-posta *'
                      : 'Öğrenci Numarası *'
                  }
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={
                    selectedRole === 'teacher'
                      ? 'Kullanıcı adı veya e-posta'
                      : 'Örn: 1042'
                  }
                  leftIcon={<User className="w-4 h-4" />}
                />

                <Input
                  ref={passwordInputRef}
                  label="Şifre *"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="••••••••"
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightIcon={showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  onRightIconClick={() => setShowPassword(!showPassword)}
                  rightIconLabel="Şifreyi göster/gizle"
                />

                {/* BENİ HATIRLA ONAY KUTUSU (Remember Me) */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-semibold text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                    />
                    <span>Beni Hatırla</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isLoading}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Şifremi unuttum
                  </button>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isLoading}
                  isLoading={isLoading}
                  loadingText="Giriş Yapılıyor..."
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                  className="w-full py-2.5"
                >
                  Giriş Yap
                </Button>
              </form>
            </div>
          )}

          {/* ================= MODE 2: ÖĞRENCİ KAYIT BAŞVURUSU ================= */}
          {authMode === 'register' && (
            <form onSubmit={handleStudentApplication} className="space-y-3">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-xs leading-relaxed">
                <strong>Öğrenci kayıt başvurusu:</strong> Bilgilerinizi gönderdikten sonra okul yöneticisi başvurunuzu
                onaylar. Onaydan sonra <strong>öğrenci numaranız</strong> ve burada belirlediğiniz <strong>şifreyle</strong>{' '}
                giriş yaparsınız. Öğretmen hesapları okul yöneticisi tarafından açılır.
              </div>

              {/* Bot tuzağı: ekranda görünmez, gerçek kullanıcılar doldurmaz */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label htmlFor="app-website">Web sitesi</label>
                <input
                  id="app-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={aWebsite}
                  onChange={(e) => setAWebsite(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Adı Soyadı *"
                  type="text"
                  required
                  value={aName}
                  onChange={(e) => setAName(e.target.value)}
                  placeholder="Ad Soyad"
                  leftIcon={<User className="w-4 h-4" />}
                />
                <Input
                  label="Öğrenci Numarası * (giriş adınız)"
                  type="text"
                  required
                  value={aNumber}
                  onChange={(e) => setANumber(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Örn: 1042"
                  leftIcon={<Hash className="w-4 h-4" />}
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-[11px] font-bold text-slate-700 flex items-center space-x-1.5">
                  <School className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Sınıfınız (isteğe bağlı)</span>
                </label>
                <select
                  value={aClassId}
                  onChange={(e) => setAClassId(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">
                    {applicationClassesState === 'loading' ? 'Sınıflar yükleniyor...' : 'Listede yok / emin değilim'}
                  </option>
                  {applicationClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {!aClassId && (
                  <input
                    type="text"
                    value={aRequestedClass}
                    onChange={(e) => setARequestedClass(e.target.value)}
                    maxLength={60}
                    placeholder="Sınıfınızı yazabilirsiniz (örn: 8-B). Yönetici onaylarken sınıfa yerleştirir."
                    className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
                {applicationClassesState === 'error' && (
                  <p className="text-[11px] text-amber-700">Sınıf listesi alınamadı; sınıfınızı yazarak devam edebilirsiniz.</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Şifre * (en az 6 karakter)"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={aPassword}
                  onChange={(e) => setAPassword(e.target.value)}
                  placeholder="En az 6 karakter"
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightIcon={showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  onRightIconClick={() => setShowPassword(!showPassword)}
                  rightIconLabel="Şifreyi göster/gizle"
                />
                <Input
                  label="Şifre Tekrar *"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={aConfirmPassword}
                  onChange={(e) => setAConfirmPassword(e.target.value)}
                  placeholder="Şifreyi tekrar girin"
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightIcon={showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  onRightIconClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  rightIconLabel="Şifreyi göster/gizle"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Telefon (İsteğe Bağlı)"
                  type="tel"
                  value={aPhone}
                  onChange={(e) => setAPhone(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  leftIcon={<Phone className="w-4 h-4" />}
                />
                <Input
                  label="E-posta (İsteğe Bağlı)"
                  type="email"
                  value={aEmail}
                  onChange={(e) => setAEmail(e.target.value)}
                  placeholder="ornek@mail.com"
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Profil Karakteri</label>
                <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                  {avatarSeeds.map((seed) => (
                    <button
                      type="button"
                      key={seed}
                      onClick={() => setSelectedAvatarSeed(seed)}
                      className={`w-9 h-9 rounded-full border-2 overflow-hidden transition-all shrink-0 cursor-pointer ${
                        selectedAvatarSeed === seed
                          ? 'border-indigo-500 scale-105 shadow-sm'
                          : 'border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                      aria-label={`Karakter ${seed}`}
                    >
                      <img
                        src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`}
                        alt={seed}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isLoading}
                isLoading={isLoading}
                loadingText="Başvuru Gönderiliyor..."
                leftIcon={<BookOpen className="w-4 h-4" />}
                className="w-full mt-2 py-2.5"
              >
                Başvuruyu Gönder
              </Button>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full text-center py-4 text-xs text-slate-400 border-t border-slate-200 bg-white/80 backdrop-blur-xs">
        <p>© {new Date().getFullYear()} • Eğitim & Öğrenci Takip Sistemi • Tüm Hakları Saklıdır.</p>
      </footer>
    </div>
  );
};
