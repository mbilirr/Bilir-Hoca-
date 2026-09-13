import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  Lock,
  School,
  Hash,
  Phone,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { Student, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';

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
  const [regClassId, setRegClassId] = useState(classes[0]?.id || '');
  const [regBranch, setRegBranch] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [selectedAvatarSeed, setSelectedAvatarSeed] = useState('Zeynep');

  // Login Form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [error, setError] = useState<string | null>(null);

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

  const handleRegister = (e: React.FormEvent) => {
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
    if (!regClassId.trim()) {
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

    try {
      const selectedClass = classes.find((c) => c.id === regClassId || c.name === regClassId);

      const newStudent = dataService.registerStudent({
        name: regName.trim(),
        username: regUsername.trim().toLowerCase(),
        email: regEmail.trim() || '',
        password: regPassword,
        classId: selectedClass ? selectedClass.id : 'class-12a',
        className: selectedClass ? selectedClass.name : (regClassId || '12-A Sayısal'),
        branch: regBranch.trim() || (selectedClass ? selectedClass.branch : ''),
        phone: regPhone.trim() || '',
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
          selectedAvatarSeed || regName
        )}`,
      });

      handleAuthCompleted(newStudent);
    } catch (err: any) {
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
      handleAuthCompleted(student);
    } else {
      setError('Öğrenci bulunamadı. Lütfen bilgilerinizi kontrol edin veya yeni kayıt oluşturun.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex space-x-2">
            <button
              onClick={() => {
                setActiveTab('register');
                setError(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'register'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Yeni Öğrenci Kaydı</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('login');
                setError(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'login'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Giriş Yap</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-3 text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'register' ? (
            /* REGISTER FORM */
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Avatar Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                  Profil Karakteri Seçin
                </label>
                <div className="flex items-center space-x-3 overflow-x-auto pb-2">
                  {avatarSeeds.map((seed) => (
                    <button
                      key={seed}
                      type="button"
                      onClick={() => setSelectedAvatarSeed(seed)}
                      className={`relative rounded-full p-0.5 transition-all flex-shrink-0 ${
                        selectedAvatarSeed === seed
                          ? 'ring-2 ring-indigo-500 scale-105 shadow-md shadow-indigo-500/30'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`}
                        alt={seed}
                        className="w-10 h-10 rounded-full bg-slate-800"
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* 1. Ad Soyad & Kullanıcı Adı (Zorunlu) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Adı Soyadı *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Örn: Melis Aydın"
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Kullanıcı Adı *
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="melisaydin"
                      className="w-full pl-10 pr-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Sınıf (Zorunlu) & Şube (İsteğe Bağlı) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Sınıf *
                  </label>
                  <div className="relative">
                    <School className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <select
                      required
                      value={regClassId}
                      onChange={(e) => setRegClassId(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none cursor-pointer"
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Şube (İsteğe Bağlı)
                  </label>
                  <input
                    type="text"
                    value={regBranch}
                    onChange={(e) => setRegBranch(e.target.value)}
                    placeholder="Örn: A, B veya Sayısal"
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* 3. Şifre * & Şifre Tekrar * (Zorunlu) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Şifre *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="En az 3 karakter"
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Şifre Tekrar *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Şifreyi onaylayın"
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Telefon (İsteğe Bağlı) & Mail (İsteğe Bağlı) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Telefon (İsteğe Bağlı)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="05xx xxx xx xx"
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Mail (İsteğe Bağlı)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="ornek@mail.com"
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                id="student-register-submit"
                className="w-full mt-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Kayıt Ol</span>
              </button>
            </form>
          ) : (
            /* LOGIN FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Kullanıcı Adı, E-Posta veya Öğrenci No
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Kullanıcı adı, e-posta veya no"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Şifre
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                id="student-login-submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Giriş Yap</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
