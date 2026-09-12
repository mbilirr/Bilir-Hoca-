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
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regClassId, setRegClassId] = useState(classes[0]?.id || '');
  const [regStudentNumber, setRegStudentNumber] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [selectedAvatarSeed, setSelectedAvatarSeed] = useState('Zeynep');

  // Login Form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setError('Lütfen tüm zorunlu alanları doldurunuz.');
      return;
    }

    const selectedClass = classes.find((c) => c.id === regClassId) || classes[0];

    const newStudent = dataService.registerStudent({
      name: regName.trim(),
      username: regUsername.trim() || regEmail.split('@')[0],
      email: regEmail.trim(),
      password: regPassword,
      classId: selectedClass ? selectedClass.id : 'class-12a',
      className: selectedClass ? selectedClass.name : '12-A Sayısal',
      studentNumber: regStudentNumber.trim() || `${Math.floor(1000 + Math.random() * 9000)}`,
      phone: regPhone.trim() || '0555 000 0000',
      avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
        selectedAvatarSeed || regName
      )}`,
    });

    setSuccessMsg('Kayıt başarıyla tamamlandı! Sisteme yönlendiriliyorsunuz...');
    setTimeout(() => {
      handleAuthCompleted(newStudent);
    }, 600);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const term = loginIdentifier.trim().toLowerCase();
    const student = currentExistingStudents.find(
      (s) =>
        s.email.toLowerCase() === term ||
        s.username?.toLowerCase() === term ||
        s.studentNumber === term
    );

    if (student) {
      if (student.password && student.password !== loginPassword && loginPassword !== '123') {
        setError('Şifre hatalı! (Varsayılan şifre: 123)');
        return;
      }
      handleAuthCompleted(student);
    } else {
      setError('Öğrenci bulunamadı. Lütfen e-posta veya öğrenci numaranızı kontrol edin veya yeni kayıt oluşturun.');
    }
  };

  const handleQuickStudentSelect = (student: Student) => {
    handleAuthCompleted(student);
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

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center space-x-3 text-emerald-300 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'register' ? (
            /* REGISTER FORM */
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <p className="text-xs text-indigo-400 font-medium mb-3 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Dışarıdan kayıt olan öğrenciler anında sisteme ve sınıfa dahil olur; tüm genel ödev ve etütleri görebilir.</span>
                </p>
              </div>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Ad Soyad *
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
                    Kullanıcı Adı
                  </label>
                  <input
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="melisaydin"
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    E-Posta Adresi *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="melis@ornek.k12.tr"
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Şifre Belirleyin *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Sınıf Seçimi *
                  </label>
                  <div className="relative">
                    <School className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <select
                      value={regClassId}
                      onChange={(e) => setRegClassId(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none"
                    >
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
                    Öğrenci No
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={regStudentNumber}
                      onChange={(e) => setRegStudentNumber(e.target.value)}
                      placeholder="Örn: 1450"
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Telefon
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="05xx xxx xx xx"
                      className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                id="student-register-submit"
                className="w-full mt-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Kaydı Tamamla ve Öğrenci Paneline Gir</span>
              </button>
            </form>
          ) : (
            /* LOGIN FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  E-Posta veya Öğrenci Numarası
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="zeynep.kaya@ornek.k12.tr veya 1042"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Şifre (Varsayılan: 123)
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
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm transition-all shadow-md flex items-center justify-center space-x-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Öğrenci Girişi Yap</span>
              </button>

              {/* Fast Selector for sample students */}
              <div className="mt-6 pt-4 border-t border-slate-800">
                <p className="text-xs font-semibold text-slate-400 mb-2">Hızlı Öğrenci Seçimi (Demo):</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentExistingStudents.slice(0, 4).map((std) => (
                    <button
                      key={std.id}
                      type="button"
                      onClick={() => handleQuickStudentSelect(std)}
                      className="flex items-center space-x-2.5 p-2 bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl text-left transition-colors"
                    >
                      <img
                        src={std.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.name)}`}
                        alt={std.name}
                        className="w-7 h-7 rounded-full bg-slate-700"
                      />
                      <div className="truncate">
                        <p className="text-xs font-semibold text-white truncate">{std.name}</p>
                        <p className="text-[10px] text-indigo-300">{std.className}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
