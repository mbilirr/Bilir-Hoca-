import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Mail,
  Lock,
  School,
  Hash,
  Phone,
  AlertCircle,
  LogIn,
  UserPlus,
  Upload,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Student, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';
import { compressImageToDataUrl } from '../../lib/imageCompressor';
import {
  SCHOOL_LEVELS,
  BRANCH_OPTIONS,
  getGradesForSchoolLevel,
} from '../../constants/schoolConstants';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

export interface StudentAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
  onSuccess?: (student: Student) => void;
  onLoginSuccess?: (student: Student) => void;
  classes: ClassGroup[];
  existingStudents?: Student[];
}

export const StudentAuthModal: React.FC<StudentAuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'register',
  onSuccess,
  onLoginSuccess,
  classes,
  existingStudents,
}) => {
  const [activeTab, setActiveTab] = useState<'register' | 'login'>(initialMode);

  useEffect(() => {
    if (initialMode) {
      setActiveTab(initialMode);
    }
  }, [initialMode, isOpen]);

  // Register Form state
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regSchool, setRegSchool] = useState<'Ortaokul' | 'Lise' | ''>('Ortaokul');
  const [regGrade, setRegGrade] = useState('5. Sınıf');
  const [regBranch, setRegBranch] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  const [selectedAvatarSeed, setSelectedAvatarSeed] = useState('Zeynep');
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string>('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCustomPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Lütfen geçerli bir resim dosyası seçiniz (PNG, JPG, WebP).');
      return;
    }
    try {
      setIsUploadingPhoto(true);
      setError(null);
      const compressed = await compressImageToDataUrl(file, 200, 200, 0.82);
      setCustomAvatarUrl(compressed);
    } catch {
      setError('Resim işlenirken bir hata oluştu.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Login Form state
  const rememberedStudent = dataService.getRememberedUser('student');
  const [loginIdentifier, setLoginIdentifier] = useState(rememberedStudent?.identifier || '');
  const [loginPassword, setLoginPassword] = useState(rememberedStudent?.savedPassword || '');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedStudent));

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const currentExistingStudents = existingStudents || dataService.getStudents();
  const avatarSeeds = ['Zeynep', 'Emir', 'Elif', 'Burak', 'Ayse', 'Mert', 'Deniz', 'Selin'];

  const handleAuthCompleted = (student: Student) => {
    if (onSuccess) {
      onSuccess(student);
    } else if (onLoginSuccess) {
      onLoginSuccess(student);
    }
    onClose();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!regName.trim()) {
      setError('Lütfen Adı Soyadı alanını doldurunuz.');
      return;
    }
    if (!regUsername.trim()) {
      setError('Lütfen Kullanıcı Adı alanını doldurunuz.');
      return;
    }
    if (!regSchool) {
      setError('Lütfen Okul kademesini seçiniz (Ortaokul veya Lise).');
      return;
    }
    if (!regGrade) {
      setError('Lütfen Sınıf seçiniz.');
      return;
    }
    if (!regPassword.trim()) {
      setError('Lütfen Şifre alanını doldurunuz.');
      return;
    }
    if (!regConfirmPassword.trim()) {
      setError('Lütfen Şifre Tekrar alanını doldurunuz.');
      return;
    }
    if (regPassword.length < 3) {
      setError('Şifre en az 3 karakter olmalıdır.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Girdiğiniz şifreler birbiriyle uyuşmuyor.');
      return;
    }

    const constructedClassName = regBranch ? `${regGrade} - ${regBranch}` : regGrade;

    // Sistemde mükerrer öğrenci kontrolü
    const existingDup = dataService.checkDuplicateStudent(regName, undefined, constructedClassName);
    if (existingDup) {
      setError(
        `"${regName}" isimli öğrenci (${
          existingDup.className || 'sınıfı kayıtlı'
        }) sistemde zaten mevcuttur. Lütfen "Giriş Yap" sekmesinden giriş yapınız.`
      );
      return;
    }

    try {
      setIsLoading(true);
      let matchedClass = classes.find(
        (c) =>
          c.gradeLevel === regGrade &&
          (!regBranch || c.branch === regBranch) &&
          (!c.schoolLevel || c.schoolLevel === regSchool)
      );

      if (!matchedClass) {
        matchedClass = classes.find((c) => c.name.toLowerCase().includes(regGrade.toLowerCase()));
      }

      let targetClassId = matchedClass?.id;
      if (!targetClassId) {
        const newCls = await dataService.addClass({
          name: constructedClassName,
          branch: regBranch || 'Genel',
          schoolLevel: regSchool,
          gradeLevel: regGrade,
          academicYear: '2026-2027',
          description: `${regSchool} ${regGrade} ${regBranch ? `(${regBranch})` : ''} öğrenci grubu`,
        });
        targetClassId = newCls.id;
      }

      const newStudent = await dataService.registerStudent({
        name: regName.trim(),
        username: regUsername.trim().toLowerCase(),
        email: regEmail.trim() || '',
        password: regPassword,
        classId: targetClassId,
        className: constructedClassName,
        schoolLevel: regSchool,
        gradeLevel: regGrade,
        branch: regBranch.trim() || '',
        phone: regPhone.trim() || '',
        avatar:
          customAvatarUrl ||
          `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
            selectedAvatarSeed || regName
          )}`,
      });

      setIsLoading(false);
      handleAuthCompleted(newStudent);
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || 'Kayıt sırasında bir hata oluştu.');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const term = loginIdentifier.trim().toLowerCase();
    const student = currentExistingStudents.find(
      (s) =>
        (s.email && s.email.toLowerCase() === term) ||
        (s.username && s.username.toLowerCase() === term) ||
        (s.studentNumber && s.studentNumber === term)
    );

    if (student) {
      if (student.password && student.password !== loginPassword) {
        setError('Şifre hatalı! Lütfen kontrol ediniz.');
        return;
      }
      if (rememberMe) {
        dataService.setRememberedUser({
          role: 'student',
          identifier: student.username,
          name: student.name,
          avatar: student.avatar,
          className: student.className,
          savedPassword: loginPassword,
        });
      } else {
        dataService.setRememberedUser(null, 'student');
      }
      handleAuthCompleted(student);
    } else {
      setError('Öğrenci bulunamadı. Lütfen bilgilerinizi kontrol edin veya yeni kayıt oluşturun.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6 flex items-start sm:items-center justify-center animate-in fade-in duration-200">
      <div className="relative my-auto w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-3.5 shrink-0">
          <div className="flex space-x-2 bg-slate-200/60 p-1 rounded-xl">
            <Button
              type="button"
              variant={activeTab === 'register' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => {
                setActiveTab('register');
                setError(null);
              }}
              leftIcon={<UserPlus className="w-4 h-4" />}
              className={
                activeTab === 'register'
                  ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }
            >
              Yeni Öğrenci Kaydı
            </Button>
            <Button
              type="button"
              variant={activeTab === 'login' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => {
                setActiveTab('login');
                setError(null);
              }}
              leftIcon={<LogIn className="w-4 h-4" />}
              className={
                activeTab === 'login'
                  ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }
            >
              Giriş Yap
            </Button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3 text-red-700 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'register' ? (
            /* REGISTER FORM */
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Avatar Selector */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Öğrenci Fotoğrafı / Karakteri
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/jpg"
                    onChange={handleCustomPhotoSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    leftIcon={<Upload className="w-3.5 h-3.5" />}
                  >
                    {isUploadingPhoto ? 'İşleniyor...' : 'Bilgisayardan Resim Seç'}
                  </Button>
                </div>

                {customAvatarUrl ? (
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-sky-300">
                    <div className="flex items-center space-x-3">
                      <img
                        src={customAvatarUrl}
                        alt="Yüklenen Fotoğraf"
                        className="w-12 h-12 rounded-xl object-cover ring-2 ring-sky-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          💻 Bilgisayarınızdan Yüklendi
                        </span>
                        <span className="text-[11px] text-emerald-600 font-medium">Fotoğraf hazır</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCustomAvatarUrl('')}
                      className="text-slate-400 hover:text-red-600"
                      title="Kaldır"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-3 overflow-x-auto pb-1">
                    {avatarSeeds.map((seed) => (
                      <button
                        key={seed}
                        type="button"
                        onClick={() => {
                          setSelectedAvatarSeed(seed);
                          setCustomAvatarUrl('');
                        }}
                        className={`relative rounded-full p-0.5 transition-all shrink-0 cursor-pointer ${
                          selectedAvatarSeed === seed && !customAvatarUrl
                            ? 'ring-2 ring-sky-500 scale-105 shadow-sm'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                            seed
                          )}`}
                          alt={seed}
                          className="w-10 h-10 rounded-full bg-slate-100"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 1. Ad Soyad & Kullanıcı Adı (Zorunlu) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Adı Soyadı *"
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Örn: Melis Aydın"
                  leftIcon={<User className="w-4 h-4" />}
                />
                <Input
                  label="Kullanıcı Adı *"
                  type="text"
                  required
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="melisaydin"
                  leftIcon={<Hash className="w-4 h-4" />}
                />
              </div>

              {/* 2. Okul (Mecburi), Sınıf (Mecburi) & Şube (İsteğe Bağlı) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-700 flex items-center space-x-1.5">
                    <School className="w-3.5 h-3.5 text-sky-600" />
                    <span>Okul, Sınıf ve Şube Bilgileri</span>
                  </span>
                  <span className="text-[10px] text-amber-600 font-semibold">Okul & Sınıf Zorunlu</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Okul *
                    </label>
                    <select
                      required
                      value={regSchool}
                      onChange={(e) => {
                        const newSchool = e.target.value as 'Ortaokul' | 'Lise' | '';
                        setRegSchool(newSchool);
                        if (newSchool === 'Ortaokul') {
                          setRegGrade('5. Sınıf');
                        } else if (newSchool === 'Lise') {
                          setRegGrade('9. Sınıf');
                        }
                      }}
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">Okul Seçiniz *</option>
                      <option value="Ortaokul">Ortaokul</option>
                      <option value="Lise">Lise</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Sınıf *
                    </label>
                    <select
                      required
                      value={regGrade}
                      onChange={(e) => setRegGrade(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
                    >
                      {!regSchool ? (
                        <option value="">Önce Okul Seçiniz *</option>
                      ) : (
                        getGradesForSchoolLevel(regSchool).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Şube (İsteğe Bağlı)
                    </label>
                    <select
                      value={regBranch}
                      onChange={(e) => setRegBranch(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Şifre *"
                  type={showRegPassword ? 'text' : 'password'}
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="En az 3 karakter"
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightIcon={showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  onRightIconClick={() => setShowRegPassword(!showRegPassword)}
                  rightIconLabel="Şifreyi göster/gizle"
                />

                <Input
                  label="Şifre Tekrar *"
                  type={showRegConfirmPassword ? 'text' : 'password'}
                  required
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Şifreyi onaylayın"
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightIcon={showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  onRightIconClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                  rightIconLabel="Şifreyi göster/gizle"
                />
              </div>

              {/* 4. Telefon (İsteğe Bağlı) & Mail (İsteğe Bağlı) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Telefon (İsteğe Bağlı)"
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="05xx xxx xx xx"
                  leftIcon={<Phone className="w-4 h-4" />}
                />

                <Input
                  label="Mail (İsteğe Bağlı)"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="ornek@mail.com"
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </div>

              <Button
                type="submit"
                id="student-register-submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                loadingText="Kaydediliyor..."
                leftIcon={<UserPlus className="w-4 h-4" />}
                className="w-full mt-2 py-2.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white"
              >
                Kayıt Ol
              </Button>
            </form>
          ) : (
            /* LOGIN FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Kullanıcı Adı, E-Posta veya Öğrenci No"
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="Kullanıcı adı, e-posta veya no"
                leftIcon={<Mail className="w-4 h-4" />}
              />

              <Input
                label="Şifre"
                type={showLoginPassword ? 'text' : 'password'}
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                rightIcon={showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                onRightIconClick={() => setShowLoginPassword(!showLoginPassword)}
                rightIconLabel="Şifreyi göster/gizle"
              />

              {/* Beni Hatırla Checkbox */}
              <div className="flex items-center justify-between py-1">
                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 accent-sky-600 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 font-medium">Bu cihazda beni hatırla</span>
                </label>
              </div>

              <Button
                type="submit"
                id="student-login-submit"
                variant="primary"
                size="md"
                leftIcon={<LogIn className="w-4 h-4" />}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white"
              >
                Giriş Yap
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
