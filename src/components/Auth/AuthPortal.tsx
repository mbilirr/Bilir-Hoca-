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
import { supabase } from '../../lib/supabase';
import {
  SCHOOL_LEVELS,
  BRANCH_OPTIONS,
  getGradesForSchoolLevel,
} from '../../constants/schoolConstants';
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
  const [loginPassword, setLoginPassword] = useState(() => {
    const rem = dataService.getRememberedUser('teacher');
    return rem?.savedPassword || '';
  });

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
  const [sRegSchool, setSRegSchool] = useState<'Ortaokul' | 'Lise' | ''>('Ortaokul');
  const [sRegGrade, setSRegGrade] = useState('5. Sınıf');
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
    const rem = dataService.getRememberedUser(role);
    if (rem) {
      setLoginUsername(rem.identifier);
      setLoginPassword(rem.savedPassword || '');
      setRememberMe(true);
    } else {
      setLoginUsername('');
      setLoginPassword('');
      setRememberMe(false);
    }
  };

  // --- QUICK LOGIN FOR REMEMBERED USER (Strictly Role-Checked) ---
  const handleQuickRememberedLogin = () => {
    const targetUser = selectedRole === 'teacher' ? rememberedTeacher : rememberedStudent;
    if (!targetUser) {
      setError(
        selectedRole === 'teacher'
          ? 'Kayıtlı öğretmen profili bulunamadı. Lütfen kullanıcı adı ve şifrenizle giriş yapınız.'
          : 'Kayıtlı öğrenci profili bulunamadı. Lütfen kullanıcı adı ve şifrenizle giriş yapınız.'
      );
      return;
    }

    if (targetUser.role !== selectedRole) {
      setError('Seçilen rol ile kayıtlı profil türü uyuşmuyor.');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    setTimeout(async () => {
      // Hızlı giriş YALNIZCA geçerli bir Supabase oturumu varken yapılabilir.
      // Aksi halde uygulama "giriş yapılmış" görünür ama bulut istekleri yetkisiz gider.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setIsLoading(false);
        setLoginUsername(targetUser.identifier);
        setError('Oturum süreniz dolmuş. Lütfen şifrenizi girip "Giriş Yap" butonuna basınız.');
        return;
      }
      setIsLoading(false);
      if (selectedRole === 'teacher') {
        const teacher = dataService.getAllTeachersInternal().find(
          (t) =>
            t.username.toLowerCase() === targetUser.identifier.toLowerCase() ||
            (t.email && t.email.toLowerCase() === targetUser.identifier.toLowerCase())
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
            s.username.toLowerCase() === targetUser.identifier.toLowerCase() ||
            (s.studentNumber && s.studentNumber.toLowerCase() === targetUser.identifier.toLowerCase()) ||
            (s.email && s.email.toLowerCase() === targetUser.identifier.toLowerCase())
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
              savedPassword: cleanPass,
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
          setError('Öğretmen kullanıcı adı veya şifre hatalı! Lütfen kontrol edip tekrar deneyiniz.');
        }
      } else {
        const student = await dataService.authenticateStudent(cleanUser, cleanPass);
        if (student) {
          if (rememberMe) {
            dataService.setRememberedUser({
              role: 'student',
              identifier: student.username,
              name: student.name,
              avatar: student.avatar,
              className: student.className,
              savedPassword: cleanPass,
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
          setError('Öğrenci bulunamadı veya şifre hatalı! Lütfen bilgilerinizi kontrol ediniz.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Giriş yapılamadı.');
    } finally {
      setIsLoading(false);
    }
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
        setRememberedTeacher(dataService.getRememberedUser('teacher'));
      }

      setIsLoading(false);
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
  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!sRegName.trim()) {
      setError('Lütfen Adı Soyadı alanını doldurunuz.');
      return;
    }
    if (!sRegUsername.trim()) {
      setError('Lütfen Kullanıcı Adı alanını doldurunuz.');
      return;
    }
    if (!sRegSchool) {
      setError('Lütfen Okul kademesini seçiniz (Ortaokul veya Lise).');
      return;
    }
    if (!sRegGrade) {
      setError('Lütfen Sınıf seviyesini seçiniz.');
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

    try {
      setIsLoading(true);

      const constructedClassName = sRegBranch ? `${sRegGrade} - ${sRegBranch}` : sRegGrade;
      let matchedClass = classes.find(
        (c) =>
          c.gradeLevel === sRegGrade &&
          (!sRegBranch || c.branch === sRegBranch) &&
          (!c.schoolLevel || c.schoolLevel === sRegSchool)
      );

      if (!matchedClass) {
        matchedClass = classes.find((c) => c.name.toLowerCase().includes(sRegGrade.toLowerCase()));
      }

      let targetClassId = matchedClass?.id;
      if (!targetClassId) {
        const newCls = await dataService.addClass({
          name: constructedClassName,
          branch: sRegBranch || 'Genel',
          schoolLevel: sRegSchool,
          gradeLevel: sRegGrade,
          academicYear: '2026-2027',
          description: `${sRegSchool} ${sRegGrade} ${sRegBranch ? `(${sRegBranch})` : ''} öğrenci grubu`,
        });
        targetClassId = newCls.id;
      }

      const newStudent = await dataService.registerStudent({
        name: sRegName.trim(),
        username: sRegUsername.trim().toLowerCase(),
        email: sRegEmail.trim() || '',
        password: sRegPassword,
        classId: targetClassId,
        className: constructedClassName,
        schoolLevel: sRegSchool,
        gradeLevel: sRegGrade,
        branch: sRegBranch.trim() || '',
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
        setRememberedStudent(dataService.getRememberedUser('student'));
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
                setError(null);
                setSuccessMsg(null);
              }}
              leftIcon={<UserPlus className="w-4 h-4" />}
              className="flex-1"
            >
              Kayıt Ol
            </Button>
          </div>

          {/* Role Selector Pill */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 text-center">
              {authMode === 'login' ? 'Giriş Yapılacak Rol' : 'Kayıt Olunacak Rol'}
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
                        Hızlı Giriş Yap
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
                      : 'Öğrenci Kullanıcı Adı, E-posta veya Öğrenci No *'
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
                      : 'Kullanıcı adı, e-posta veya no'
                  }
                  leftIcon={<User className="w-4 h-4" />}
                />

                <Input
                  label="Şifre *"
                  type={showPassword ? 'text' : 'password'}
                  required
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

          {/* ================= MODE 2: REGISTER ================= */}
          {authMode === 'register' && (
            <div>
              {selectedRole === 'teacher' ? (
                /* TEACHER REGISTRATION FORM */
                <form onSubmit={handleTeacherRegister} className="space-y-3.5">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>
                      <strong>Güvenlik Notu:</strong> Yeni öğretmen kayıtları güvenlik amacıyla admin
                      onayından sonra aktif olmaktadır.
                    </span>
                  </div>

                  <Input
                    label="Ad Soyad *"
                    type="text"
                    required
                    value={tRegName}
                    onChange={(e) => setTRegName(e.target.value)}
                    placeholder="Örn: Ayşe Demir"
                    leftIcon={<User className="w-4 h-4" />}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Kullanıcı Adı *"
                      type="text"
                      required
                      value={tRegUsername}
                      onChange={(e) => setTRegUsername(e.target.value)}
                      placeholder="ademir"
                      leftIcon={<Hash className="w-4 h-4" />}
                    />
                    <Input
                      label="Branş"
                      type="text"
                      value={tRegBranch}
                      onChange={(e) => setTRegBranch(e.target.value)}
                      placeholder="Fizik, Biyoloji vb."
                      leftIcon={<Briefcase className="w-4 h-4" />}
                    />
                  </div>

                  <Input
                    label="E-posta Adresi *"
                    type="email"
                    required
                    value={tRegEmail}
                    onChange={(e) => setTRegEmail(e.target.value)}
                    placeholder="ornek@okul.k12.tr"
                    leftIcon={<Mail className="w-4 h-4" />}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Şifre *"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={tRegPassword}
                      onChange={(e) => setTRegPassword(e.target.value)}
                      placeholder="En az 4 karakter"
                      leftIcon={<Lock className="w-4 h-4" />}
                      rightIcon={showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      onRightIconClick={() => setShowPassword(!showPassword)}
                      rightIconLabel="Şifreyi göster/gizle"
                    />

                    <Input
                      label="Şifre Tekrar *"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={tRegConfirmPassword}
                      onChange={(e) => setTRegConfirmPassword(e.target.value)}
                      placeholder="Şifreyi tekrar girin"
                      leftIcon={<Lock className="w-4 h-4" />}
                      rightIcon={
                        showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />
                      }
                      onRightIconClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      rightIconLabel="Şifreyi göster/gizle"
                    />
                  </div>

                  {/* BENİ HATIRLA SEÇENEĞİ */}
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="checkbox"
                      id="t-remember"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                    />
                    <label htmlFor="t-remember" className="text-xs font-semibold text-slate-600 cursor-pointer">
                      Beni Hatırla
                    </label>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isLoading}
                    isLoading={isLoading}
                    loadingText="Kayıt Yapılıyor..."
                    leftIcon={<ShieldCheck className="w-4 h-4" />}
                    className="w-full mt-2 py-2.5"
                  >
                    Kayıt Ol
                  </Button>
                </form>
              ) : (
                /* STUDENT REGISTRATION FORM */
                <form onSubmit={handleStudentRegister} className="space-y-3">
                  {/* 1. Adı Soyadı & Kullanıcı Adı (Zorunlu) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Adı Soyadı *"
                      type="text"
                      required
                      value={sRegName}
                      onChange={(e) => setSRegName(e.target.value)}
                      placeholder="Ad Soyad"
                      leftIcon={<User className="w-4 h-4" />}
                    />
                    <Input
                      label="Kullanıcı Adı *"
                      type="text"
                      required
                      value={sRegUsername}
                      onChange={(e) => setSRegUsername(e.target.value)}
                      placeholder="kullaniciadi"
                      leftIcon={<Hash className="w-4 h-4" />}
                    />
                  </div>

                  {/* 2. Okul (Mecburi), Sınıf (Mecburi) & Şube (İsteğe Bağlı) */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-700 flex items-center space-x-1.5">
                        <School className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Okul, Sınıf ve Şube Bilgileri</span>
                      </span>
                      <span className="text-[11px] text-amber-600 font-semibold">Okul & Sınıf Zorunlu</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Okul Açılır Buton (Mecburi) */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Okul *
                        </label>
                        <select
                          required
                          value={sRegSchool}
                          onChange={(e) => {
                            const newSchool = e.target.value as 'Ortaokul' | 'Lise' | '';
                            setSRegSchool(newSchool);
                            if (newSchool === 'Ortaokul') {
                              setSRegGrade('5. Sınıf');
                            } else if (newSchool === 'Lise') {
                              setSRegGrade('9. Sınıf');
                            }
                          }}
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="">Okul Seçiniz *</option>
                          <option value="Ortaokul">Ortaokul</option>
                          <option value="Lise">Lise</option>
                        </select>
                      </div>

                      {/* Sınıf Açılır Penceresi (Mecburi) */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Sınıf *
                        </label>
                        <select
                          required
                          value={sRegGrade}
                          onChange={(e) => setSRegGrade(e.target.value)}
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          {!sRegSchool ? (
                            <option value="">Önce Okul Seçiniz *</option>
                          ) : (
                            getGradesForSchoolLevel(sRegSchool).map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {/* Şube Açılır Buton (İsteğe Bağlı) */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Şube (İsteğe Bağlı)
                        </label>
                        <select
                          value={sRegBranch}
                          onChange={(e) => setSRegBranch(e.target.value)}
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="">Şube Seçiniz (İsteğe Bağlı)</option>
                          {BRANCH_OPTIONS.map((b) => (
                            <option key={b.id} value={b.label}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 3. Şifre * & Şifre Tekrar * (Zorunlu) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Şifre *"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={sRegPassword}
                      onChange={(e) => setSRegPassword(e.target.value)}
                      placeholder="En az 3 karakter"
                      leftIcon={<Lock className="w-4 h-4" />}
                      rightIcon={showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      onRightIconClick={() => setShowPassword(!showPassword)}
                      rightIconLabel="Şifreyi göster/gizle"
                    />

                    <Input
                      label="Şifre Tekrar *"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={sRegConfirmPassword}
                      onChange={(e) => setSRegConfirmPassword(e.target.value)}
                      placeholder="Şifreyi tekrar girin"
                      leftIcon={<Lock className="w-4 h-4" />}
                      rightIcon={
                        showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />
                      }
                      onRightIconClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      rightIconLabel="Şifreyi göster/gizle"
                    />
                  </div>

                  {/* 4. Telefon (İsteğe Bağlı) & Mail (İsteğe Bağlı) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Telefon (İsteğe Bağlı)"
                      type="tel"
                      value={sRegPhone}
                      onChange={(e) => setSRegPhone(e.target.value)}
                      placeholder="05XX XXX XX XX"
                      leftIcon={<Phone className="w-4 h-4" />}
                    />

                    <Input
                      label="Mail (İsteğe Bağlı)"
                      type="email"
                      value={sRegEmail}
                      onChange={(e) => setSRegEmail(e.target.value)}
                      placeholder="ornek@mail.com"
                      leftIcon={<Mail className="w-4 h-4" />}
                    />
                  </div>

                  {/* Avatar Seçimi */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Profil Karakteri / Avatarı
                    </label>
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
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                    />
                    <label htmlFor="s-remember" className="text-xs font-semibold text-slate-600 cursor-pointer">
                      Beni Hatırla
                    </label>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isLoading}
                    isLoading={isLoading}
                    loadingText="Kayıt Yapılıyor..."
                    leftIcon={<BookOpen className="w-4 h-4" />}
                    className="w-full mt-2 py-2.5"
                  >
                    Kayıt Ol
                  </Button>
                </form>
              )}
            </div>
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
