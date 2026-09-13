import React, { useState, useEffect } from 'react';
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
  Sparkles,
  School,
  Hash,
  Mail,
  Phone,
  Briefcase,
  ArrowRight,
  Clock,
  Zap,
  Star,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Teacher, Student, ClassGroup, AuthSession, UserRole } from '../../types';
import { dataService } from '../../services/dataService';

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

  // Remember Me & Easy Login
  const [rememberMe, setRememberMe] = useState(true);
  const [rememberedUser, setRememberedUser] = useState(() => dataService.getRememberedUser());

  // Listen to dataService updates so rememberedUser & teachers stay synchronized
  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setRememberedUser(dataService.getRememberedUser());
    });
    return () => unsub();
  }, []);

  const primaryTeacher = teachers.find((t) => t.status === 'approved') || teachers[0];
  const primaryStudent = students[0];

  // --- LOGIN FORM STATE ---
  const [loginUsername, setLoginUsername] = useState(() => {
    const rem = dataService.getRememberedUser();
    if (rem?.role === 'teacher') return rem.identifier;
    return '';
  });
  const [loginPassword, setLoginPassword] = useState('');

  // --- TEACHER REGISTER STATE ---
  const [tRegName, setTRegName] = useState('');
  const [tRegUsername, setTRegUsername] = useState('');
  const [tRegEmail, setTRegEmail] = useState('');
  const [tRegBranch, setTRegBranch] = useState('Matematik');
  const [tRegPassword, setTRegPassword] = useState('');
  const [tRegConfirmPassword, setTRegConfirmPassword] = useState('');

  // --- STUDENT REGISTER STATE ---
  const [sRegName, setSRegName] = useState('');
  const [sRegUsername, setSRegUsername] = useState('');
  const [sRegClassId, setSRegClassId] = useState(classes[0]?.id || '');
  const [sRegBranch, setSRegBranch] = useState('');
  const [sRegPhone, setSRegPhone] = useState('');
  const [sRegEmail, setSRegEmail] = useState('');
  const [sRegPassword, setSRegPassword] = useState('');
  const [sRegConfirmPassword, setSRegConfirmPassword] = useState('');
  const [selectedAvatarSeed, setSelectedAvatarSeed] = useState('Zeynep');

  const avatarSeeds = ['Zeynep', 'Emir', 'Elif', 'Burak', 'Ayse', 'Mert', 'Deniz', 'Selin'];

  // Handle role switch in login tab
  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setError(null);
    setSuccessMsg(null);
    if (rememberedUser?.role === role) {
      setLoginUsername(rememberedUser.identifier);
    } else {
      setLoginUsername('');
    }
    setLoginPassword('');
  };

  // --- QUICK LOGIN FOR REMEMBERED USER ---
  const handleQuickRememberedLogin = () => {
    if (!rememberedUser) return;
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      if (rememberedUser.role === 'teacher') {
        const teacher = dataService.getTeachers().find(
          (t) =>
            t.username.toLowerCase() === rememberedUser.identifier.toLowerCase() ||
            t.email.toLowerCase() === rememberedUser.identifier.toLowerCase()
        );

        if (!teacher) {
          setError('Kayıtlı öğretmen profili bulunamadı.');
          return;
        }

        if (teacher.status === 'pending') {
          setError(
            '⚠️ Öğretmen hesabınız henüz yönetici (admin) onayı beklemektedir. Onaylanmadan sisteme giriş yapamazsınız.'
          );
          return;
        }

        const session: AuthSession = { role: 'teacher', user: teacher };
        dataService.setAuthSession(session);
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        setSuccessMsg(`Tekrar hoş geldiniz Sn. ${teacher.name}! Öğretmen paneline aktarılıyorsunuz...`);
        setTimeout(() => onAuthSuccess(session), 350);
      } else {
        const student = dataService.getStudents().find(
          (s) =>
            s.username.toLowerCase() === rememberedUser.identifier.toLowerCase() ||
            s.studentNumber.toLowerCase() === rememberedUser.identifier.toLowerCase() ||
            s.email.toLowerCase() === rememberedUser.identifier.toLowerCase()
        );

        if (!student) {
          setError('Kayıtlı öğrenci profili bulunamadı.');
          return;
        }

        const session: AuthSession = { role: 'student', user: student };
        dataService.setAuthSession(session);
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        setSuccessMsg(`Tekrar hoş geldin ${student.name}! Öğrenci paneline aktarılıyorsunuz...`);
        setTimeout(() => onAuthSuccess(session), 350);
      }
    }, 300);
  };

  const handleForgetRememberedUser = () => {
    dataService.setRememberedUser(null);
    setRememberedUser(null);
  };

  // --- SUBMIT LOGIN ---
  const handleLoginSubmit = (e: React.FormEvent) => {
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

    setTimeout(() => {
      setIsLoading(false);

      if (selectedRole === 'teacher') {
        try {
          const teacher = dataService.authenticateTeacher(cleanUser, cleanPass);
          if (teacher) {
            if (rememberMe) {
              dataService.setRememberedUser({
                role: 'teacher',
                identifier: teacher.username,
                name: teacher.name,
                avatar: teacher.avatar,
                branch: teacher.branch,
              });
              setRememberedUser(dataService.getRememberedUser());
            } else {
              dataService.setRememberedUser(null);
              setRememberedUser(null);
            }

            const session: AuthSession = { role: 'teacher', user: teacher };
            dataService.setAuthSession(session);
            confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
            setSuccessMsg(`Hoş geldiniz Sn. ${teacher.name}! Panele yönlendiriliyorsunuz...`);
            setTimeout(() => onAuthSuccess(session), 400);
          } else {
            setError('Öğretmen kullanıcı adı veya şifre hatalı! Lütfen kontrol edip tekrar deneyiniz.');
          }
        } catch (err: any) {
          setError(err.message || 'Giriş yapılamadı.');
        }
      } else {
        const student = dataService.authenticateStudent(cleanUser, cleanPass);
        if (student) {
          if (rememberMe) {
            dataService.setRememberedUser({
              role: 'student',
              identifier: student.username,
              name: student.name,
              avatar: student.avatar,
              className: student.className,
            });
            setRememberedUser(dataService.getRememberedUser());
          } else {
            dataService.setRememberedUser(null);
            setRememberedUser(null);
          }

          const session: AuthSession = { role: 'student', user: student };
          dataService.setAuthSession(session);
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
          setSuccessMsg(`Hoş geldin ${student.name}! Öğrenci paneline yönlendiriliyorsunuz...`);
          setTimeout(() => onAuthSuccess(session), 400);
        } else {
          setError(
            'Öğrenci bulunamadı veya şifre hatalı! Lütfen bilgilerinizi kontrol ediniz.'
          );
        }
      }
    }, 350);
  };

  // --- SUBMIT TEACHER REGISTER ---
  const handleTeacherRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!tRegName.trim() || !tRegUsername.trim() || !tRegEmail.trim() || !tRegPassword.trim()) {
      setError('Lütfen zorunlu alanları (Ad Soyad, Kullanıcı Adı, E-posta, Şifre) eksiksiz doldurunuz.');
      return;
    }

    if (tRegPassword.length < 4) {
      setError('Şifre en az 4 karakter olmalıdır.');
      return;
    }

    if (tRegPassword !== tRegConfirmPassword) {
      setError('Girdiğiniz şifreler birbiriyle uyuşmuyor.');
      return;
    }

    try {
      setIsLoading(true);
      // Registers new teacher with status: 'pending' (requires admin approval)
      const newTeacher = dataService.registerTeacher({
        name: tRegName.trim(),
        username: tRegUsername.trim(),
        email: tRegEmail.trim(),
        branch: tRegBranch.trim() || 'Genel Branş',
        password: tRegPassword,
      });

      if (rememberMe) {
        dataService.setRememberedUser({
          role: 'teacher',
          identifier: newTeacher.username,
          name: newTeacher.name,
          avatar: newTeacher.avatar,
          branch: newTeacher.branch,
        });
        setRememberedUser(dataService.getRememberedUser());
      }

      setIsLoading(false);

      // In accordance with: "yeni kayıt olan öğretmenler kayıt olduktan sonra admin tarafından onaylanmadan sayfa açılmasın."
      setSuccessMsg('Kayıt başvurunuz alındı. Yönetici onayından sonra giriş yapabilirsiniz.');
      setAuthMode('login');
      setSelectedRole('teacher');
      setLoginUsername(newTeacher.username);
      setLoginPassword('');
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Kayıt sırasında bir hata oluştu.');
    }
  };

  // --- SUBMIT STUDENT REGISTER ---
  const handleStudentRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Zorunlu alanlar: Adı Soyadı, Kullanıcı Adı, Sınıf, Şifre, Şifre Tekrar
    if (!sRegName.trim()) {
      setError('Lütfen Adı Soyadı alanını doldurunuz.');
      return;
    }
    if (!sRegUsername.trim()) {
      setError('Lütfen Kullanıcı Adı alanını doldurunuz.');
      return;
    }
    if (!sRegClassId.trim()) {
      setError('Lütfen Sınıf seçiniz.');
      return;
    }
    if (!sRegPassword.trim()) {
      setError('Lütfen Şifre alanını doldurunuz.');
      return;
    }
    if (!sRegConfirmPassword.trim()) {
      setError('Lütfen Şifre Tekrar alanını doldurunuz.');
      return;
    }

    if (sRegPassword.length < 3) {
      setError('Şifre en az 3 karakter olmalıdır.');
      return;
    }

    if (sRegPassword !== sRegConfirmPassword) {
      setError('Girdiğiniz şifreler birbiriyle uyuşmuyor.');
      return;
    }

    const selectedClass = classes.find((c) => c.id === sRegClassId || c.name === sRegClassId);

    try {
      setIsLoading(true);

      const newStudent = dataService.registerStudent({
        name: sRegName.trim(),
        username: sRegUsername.trim().toLowerCase(),
        email: sRegEmail.trim() || '',
        password: sRegPassword,
        classId: selectedClass ? selectedClass.id : 'class-12a',
        className: selectedClass ? selectedClass.name : (sRegClassId || '12-A Sayısal'),
        branch: sRegBranch.trim() || (selectedClass ? selectedClass.branch : ''),
        phone: sRegPhone.trim() || '',
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
          selectedAvatarSeed || sRegName
        )}`,
      });

      if (rememberMe) {
        dataService.setRememberedUser({
          role: 'student',
          identifier: newStudent.username,
          name: newStudent.name,
          avatar: newStudent.avatar,
          className: newStudent.className,
        });
        setRememberedUser(dataService.getRememberedUser());
      }

      const session: AuthSession = { role: 'student', user: newStudent };
      dataService.setAuthSession(session);

      onAuthSuccess(session);
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Öğrenci kaydı sırasında bir hata oluştu.');
    }
  };

  return (
    <div className="min-h-screen w-full text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-indigo-500 selection:text-white">
      {/* CANLI VE DİKKAT ÇEKİCİ EĞİTİM ARKA PLANI */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 transform scale-105"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=2070&auto=format&fit=crop')`,
        }}
      />
      {/* Canlı Degrade Katmanları & Parlayan Işık Küreleri */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-950/92 via-indigo-950/88 to-slate-950/94 backdrop-blur-[3px]" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-gradient-to-tr from-indigo-500/30 to-purple-600/30 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-gradient-to-tr from-pink-500/25 to-amber-500/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-gradient-to-tr from-emerald-500/25 to-cyan-500/25 rounded-full blur-3xl pointer-events-none" />

      {/* Top Brand Bar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-xl shadow-indigo-600/30 ring-2 ring-white/25 transform hover:scale-105 transition-all">
            <GraduationCap className="w-7 h-7 text-white drop-shadow-md" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-xl sm:text-2xl tracking-tight text-white drop-shadow-sm">
                Eğitim & Öğrenci Takip Sistemi
              </span>
              <span className="hidden sm:inline-block text-[11px] px-3 py-0.5 rounded-full font-bold bg-gradient-to-r from-amber-500/20 to-pink-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                ✨ Canlı Portal
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">
              Ödev Yönetimi, Etüt Takibi & Başarı Analizi
            </p>
          </div>
        </div>
      </header>

      {/* Main Center Authentication Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-6 sm:px-6">
        <div className="w-full max-w-xl bg-slate-900/90 backdrop-blur-2xl border-2 border-indigo-500/40 rounded-3xl shadow-2xl shadow-indigo-950/80 overflow-hidden p-6 sm:p-8 transition-all relative">
          {/* Top Decorative Color Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

          {/* BENİ HATIRLA - HIZLI GİRİŞ KARTI */}
          {rememberedUser && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-slate-900/90 border-2 border-indigo-500/40 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3.5">
                  <img
                    src={
                      rememberedUser.avatar ||
                      `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                        rememberedUser.name
                      )}`
                    }
                    alt={rememberedUser.name}
                    className="w-12 h-12 rounded-2xl bg-slate-800 border-2 border-indigo-400/50 shadow-md object-cover"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-amber-400 flex items-center space-x-1">
                        <Zap className="w-3.5 h-3.5 fill-amber-400" />
                        <span>Kayıtlı Profil:</span>
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                        {rememberedUser.role === 'teacher' ? 'Öğretmen' : 'Öğrenci'}
                      </span>
                    </div>
                    <div className="text-base font-bold text-white tracking-tight">
                      {rememberedUser.name}
                    </div>
                    <div className="text-xs text-slate-300">
                      {rememberedUser.branch || rememberedUser.className || rememberedUser.identifier}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end space-y-1.5">
                  <button
                    type="button"
                    onClick={handleQuickRememberedLogin}
                    disabled={isLoading}
                    className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:via-orange-400 hover:to-rose-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/25 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>Giriş Yap</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleForgetRememberedUser}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                  >
                    Beni Unut
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Auth Mode Tabs (Giriş Yap vs Kayıt Ol) */}
          <div className="flex bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                authMode === 'login'
                  ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/40 ring-1 ring-white/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Giriş Yap</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                authMode === 'register'
                  ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/40 ring-1 ring-white/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Kayıt Ol</span>
            </button>
          </div>

          {/* Role Selector Pill */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 text-center">
              {authMode === 'login' ? 'Giriş Yapılacak Rol' : 'Kayıt Olunacak Rol'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectRole('teacher')}
                className={`flex items-center justify-center space-x-2.5 p-3 rounded-2xl border transition-all cursor-pointer ${
                  selectedRole === 'teacher'
                    ? 'bg-indigo-950/70 border-indigo-400 text-white ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-600/20 font-bold'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <ShieldCheck
                  className={`w-5 h-5 ${
                    selectedRole === 'teacher' ? 'text-indigo-400' : 'text-slate-500'
                  }`}
                />
                <span className="text-xs sm:text-sm">Öğretmen (Yönetici)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectRole('student')}
                className={`flex items-center justify-center space-x-2.5 p-3 rounded-2xl border transition-all cursor-pointer ${
                  selectedRole === 'student'
                    ? 'bg-pink-950/60 border-pink-400 text-white ring-2 ring-pink-500/40 shadow-lg shadow-pink-600/20 font-bold'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <BookOpen
                  className={`w-5 h-5 ${
                    selectedRole === 'student' ? 'text-pink-400' : 'text-slate-500'
                  }`}
                />
                <span className="text-xs sm:text-sm">Öğrenci Portalı</span>
              </button>
            </div>
          </div>

          {/* Error & Success Feedback Alerts */}
          {error && (
            <div className="mb-5 p-4 bg-rose-500/15 border-2 border-rose-500/40 rounded-2xl flex items-start space-x-3 text-rose-200 text-xs sm:text-sm shadow-md">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-4 bg-emerald-500/15 border-2 border-emerald-500/40 rounded-2xl flex items-start space-x-3 text-emerald-200 text-xs sm:text-sm shadow-md">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMsg}</div>
            </div>
          )}

          {/* ================= MODE 1: LOGIN ================= */}
          {authMode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  {selectedRole === 'teacher'
                    ? 'Öğretmen Kullanıcı Adı veya E-posta *'
                    : 'Öğrenci Kullanıcı Adı, E-posta veya Öğrenci No *'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder={
                      selectedRole === 'teacher' ? 'Kullanıcı adı veya e-posta' : 'Kullanıcı adı, e-posta veya no'
                    }
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-200">Şifre *</label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* BENİ HATIRLA ONAY KUTUSU (Remember Me) */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-semibold text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950/80 cursor-pointer accent-indigo-600"
                  />
                  <span>Beni Hatırla</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 text-white font-extrabold rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-2 text-sm transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <span className="flex items-center space-x-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Giriş Yapılıyor...</span>
                  </span>
                ) : (
                  <>
                    <span>Giriş Yap</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ================= MODE 2: REGISTER ================= */}
          {authMode === 'register' && (
            <div>
              {selectedRole === 'teacher' ? (
                /* TEACHER REGISTRATION FORM */
                <form onSubmit={handleTeacherRegister} className="space-y-3.5">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      <strong>Güvenlik Notu:</strong> Yeni öğretmen kayıtları güvenlik amacıyla admin
                      onayından sonra aktif olmaktadır.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">
                      Ad Soyad *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={tRegName}
                        onChange={(e) => setTRegName(e.target.value)}
                        placeholder="Örn: Ayşe Demir"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        Kullanıcı Adı *
                      </label>
                      <div className="relative">
                        <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          required
                          value={tRegUsername}
                          onChange={(e) => setTRegUsername(e.target.value)}
                          placeholder="ademir"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Branş</label>
                      <div className="relative">
                        <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          value={tRegBranch}
                          onChange={(e) => setTRegBranch(e.target.value)}
                          placeholder="Fizik, Biyoloji vb."
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">
                      E-posta Adresi *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email"
                        required
                        value={tRegEmail}
                        onChange={(e) => setTRegEmail(e.target.value)}
                        placeholder="ornek@okul.k12.tr"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Şifre *</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={tRegPassword}
                          onChange={(e) => setTRegPassword(e.target.value)}
                          placeholder="En az 4 karakter"
                          className="w-full pl-9 pr-9 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Şifre Tekrar *</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          value={tRegConfirmPassword}
                          onChange={(e) => setTRegConfirmPassword(e.target.value)}
                          placeholder="Şifreyi tekrar girin"
                          className="w-full pl-9 pr-9 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* BENİ HATIRLA SEÇENEĞİ */}
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="checkbox"
                      id="t-remember"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950 cursor-pointer accent-indigo-600"
                    />
                    <label htmlFor="t-remember" className="text-xs font-semibold text-slate-300 cursor-pointer">
                      Beni Hatırla
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-3 py-3 px-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 text-white font-extrabold rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-2 text-sm transition-all transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Kayıt Ol</span>
                  </button>
                </form>
              ) : (
                /* STUDENT REGISTRATION FORM */
                <form onSubmit={handleStudentRegister} className="space-y-3">
                  {/* 1. Adı Soyadı & Kullanıcı Adı (Zorunlu) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        Adı Soyadı *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          required
                          value={sRegName}
                          onChange={(e) => setSRegName(e.target.value)}
                          placeholder="Ad Soyad"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        Kullanıcı Adı *
                      </label>
                      <div className="relative">
                        <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          required
                          value={sRegUsername}
                          onChange={(e) => setSRegUsername(e.target.value)}
                          placeholder="kullaniciadi"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Sınıf (Zorunlu) & Şube (İsteğe Bağlı) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Sınıf *</label>
                      <div className="relative">
                        <School className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <select
                          required
                          value={sRegClassId}
                          onChange={(e) => setSRegClassId(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
                        >
                          <option value="">Sınıf Seçiniz *</option>
                          {classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              {cls.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        Şube (İsteğe Bağlı)
                      </label>
                      <input
                        type="text"
                        value={sRegBranch}
                        onChange={(e) => setSRegBranch(e.target.value)}
                        placeholder="Örn: A, B veya Sayısal"
                        className="w-full px-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  {/* 3. Şifre * & Şifre Tekrar * (Zorunlu) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Şifre *</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={sRegPassword}
                          onChange={(e) => setSRegPassword(e.target.value)}
                          placeholder="En az 3 karakter"
                          className="w-full pl-9 pr-9 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Şifre Tekrar *</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          value={sRegConfirmPassword}
                          onChange={(e) => setSRegConfirmPassword(e.target.value)}
                          placeholder="Şifreyi onaylayın"
                          className="w-full pl-9 pr-9 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 4. Telefon (İsteğe Bağlı) & Mail (İsteğe Bağlı) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        Telefon (İsteğe Bağlı)
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="tel"
                          value={sRegPhone}
                          onChange={(e) => setSRegPhone(e.target.value)}
                          placeholder="05XX XXX XX XX"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        Mail (İsteğe Bağlı)
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="email"
                          value={sRegEmail}
                          onChange={(e) => setSRegEmail(e.target.value)}
                          placeholder="ornek@mail.com"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Avatar Seçimi */}
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1.5">
                      Profil Karakteri / Avatarı
                    </label>
                    <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                      {avatarSeeds.map((seed) => (
                        <button
                          type="button"
                          key={seed}
                          onClick={() => setSelectedAvatarSeed(seed)}
                          className={`w-9 h-9 rounded-full border-2 overflow-hidden transition-all flex-shrink-0 cursor-pointer ${
                            selectedAvatarSeed === seed
                              ? 'border-pink-500 scale-110 ring-2 ring-pink-500/40'
                              : 'border-slate-700 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                              seed
                            )}`}
                            alt={seed}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* BENİ HATIRLA SEÇENEĞİ */}
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="checkbox"
                      id="s-remember"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 text-pink-600 focus:ring-pink-500 bg-slate-950 cursor-pointer accent-pink-600"
                    />
                    <label htmlFor="s-remember" className="text-xs font-semibold text-slate-300 cursor-pointer">
                      Beni Hatırla
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-3 py-3 px-4 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:via-purple-500 hover:to-indigo-500 text-white font-extrabold rounded-2xl shadow-xl shadow-pink-600/30 flex items-center justify-center space-x-2 text-sm transition-all transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Kayıt Ol</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full text-center py-4 text-xs text-slate-400 border-t border-slate-800/80 bg-slate-950/60 backdrop-blur-md">
        <p>© {new Date().getFullYear()} • Eğitim & Öğrenci Takip Sistemi • Tüm Hakları Saklıdır.</p>
      </footer>
    </div>
  );
};
