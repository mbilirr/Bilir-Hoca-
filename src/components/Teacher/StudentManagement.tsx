import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  School,
  X,
  Check,
  UserCheck,
  Phone,
  Mail,
  Hash,
  Calendar,
  FileSpreadsheet,
  Download,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Student, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';
import { ExcelStudentUploadModal } from './ExcelStudentUploadModal';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';

interface StudentManagementProps {
  students: Student[];
  classes: ClassGroup[];
  onSelectStudentForHomework?: (student: Student) => void;
}

export const StudentManagement: React.FC<StudentManagementProps> = ({
  students,
  classes,
  onSelectStudentForHomework,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'students' | 'classes'>('students');

  // Modals
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassGroup | null>(null);

  // Delete modals state
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [classToDelete, setClassToDelete] = useState<ClassGroup | null>(null);

  // New student form state
  const [studentName, setStudentName] = useState('');
  const [studentUsername, setStudentUsername] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentClassId, setStudentClassId] = useState(classes[0]?.id || '');
  const [studentNumber, setStudentNumber] = useState('');
  const [studentPhone, setStudentPhone] = useState('');

  // New class form state
  const [className, setClassName] = useState('');
  const [classBranch, setClassBranch] = useState('');
  const [classAcademicYear, setClassAcademicYear] = useState('2025-2026');
  const [classDescription, setClassDescription] = useState('');

  // Filter students
  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentNumber.includes(searchTerm) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = selectedClassFilter === 'all' || s.classId === selectedClassFilter;
    return matchesSearch && matchesClass;
  });

  // Handle Add Student
  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStudent) {
      dataService.updateStudent(editingStudent.id, {
        name: studentName,
        username: studentUsername,
        email: studentEmail,
        classId: studentClassId,
        studentNumber,
        phone: studentPhone,
      });
      setEditingStudent(null);
    } else {
      dataService.registerStudent({
        name: studentName,
        username: studentUsername || studentEmail.split('@')[0],
        email: studentEmail,
        classId: studentClassId,
        className: classes.find((c) => c.id === studentClassId)?.name || '12-A Sayısal',
        studentNumber: studentNumber || `${Math.floor(1000 + Math.random() * 9000)}`,
        phone: studentPhone || '0555 000 0000',
      });
      setIsAddStudentOpen(false);
    }
    resetStudentForm();
  };

  const resetStudentForm = () => {
    setStudentName('');
    setStudentUsername('');
    setStudentEmail('');
    setStudentNumber('');
    setStudentPhone('');
    setStudentClassId(classes[0]?.id || '');
  };

  const openEditStudent = (student: Student) => {
    setEditingStudent(student);
    setStudentName(student.name);
    setStudentUsername(student.username);
    setStudentEmail(student.email);
    setStudentClassId(student.classId);
    setStudentNumber(student.studentNumber);
    setStudentPhone(student.phone || '');
    setIsAddStudentOpen(true);
  };

  // Handle Save Class
  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;

    if (editingClass) {
      dataService.updateClass(editingClass.id, {
        name: className,
        branch: classBranch,
        academicYear: classAcademicYear,
        description: classDescription,
      });
      setEditingClass(null);
    } else {
      dataService.addClass({
        name: className,
        branch: classBranch || 'Genel',
        academicYear: classAcademicYear,
        description: classDescription,
      });
    }
    setClassName('');
    setClassBranch('');
    setClassDescription('');
    setIsAddClassOpen(false);
  };

  const openEditClass = (cls: ClassGroup) => {
    setEditingClass(cls);
    setClassName(cls.name);
    setClassBranch(cls.branch);
    setClassAcademicYear(cls.academicYear);
    setClassDescription(cls.description || '');
    setIsAddClassOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <span>Kullanıcı & Sınıf Yönetim Merkezi</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Öğrenci kayıtlarını inceleyin, yeni sınıflar açın ve öğrencileri sınıflara atayın.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveTab('students')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'students'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Öğrenciler ({students.length})
            </button>
            <button
              onClick={() => setActiveTab('classes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'classes'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sınıflar ({classes.length})
            </button>
          </div>

          {activeTab === 'students' ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsExcelModalOpen(true)}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-600/20"
                title="Excel (.xlsx, .xls) veya CSV dosyasından toplu öğrenci ekle"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel'den Toplu Yükle</span>
              </button>

              <button
                onClick={() => {
                  resetStudentForm();
                  setEditingStudent(null);
                  setIsAddStudentOpen(true);
                }}
                className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Öğrenci Ekle</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditingClass(null);
                setClassName('');
                setClassBranch('');
                setClassDescription('');
                setIsAddClassOpen(true);
              }}
              className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Sınıf Ekle</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'students' ? (
        /* STUDENTS VIEW */
        <div className="space-y-4">
          {/* Quick Excel Banner */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/30 border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Excel / CSV ile Toplu Öğrenci Aktarımı</span>
                  <span className="text-[10px] px-2 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-full font-medium">
                    Hızlı İçe Aktarma
                  </span>
                </h4>
                <p className="text-xs text-slate-400">
                  Öğrenci listesini Excel dosyasından yükleyin veya kopyalayıp yapıştırın; isim, soyisim ve sınıflar otomatik tanımlansın.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 whitespace-nowrap flex-shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Excel Dosyası Yükle</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {/* Filter / Search Bar */}
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Öğrenci adı, no veya e-posta ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Sınıf Filtresi:</span>
              <select
                value={selectedClassFilter}
                onChange={(e) => setSelectedClassFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="all">Tüm Sınıflar ({students.length})</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({students.filter((s) => s.classId === cls.id).length})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Students Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci</th>
                  <th className="px-6 py-3.5 font-semibold">Sınıf / Şube</th>
                  <th className="px-6 py-3.5 font-semibold">Öğrenci No</th>
                  <th className="px-6 py-3.5 font-semibold">İletişim</th>
                  <th className="px-6 py-3.5 font-semibold">Kayıt Durumu</th>
                  <th className="px-6 py-3.5 font-semibold text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      Arama kriterlerine uygun öğrenci bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((std) => (
                    <tr key={std.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <img
                            src={
                              std.avatar ||
                              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                std.name
                              )}`
                            }
                            alt={std.name}
                            className="w-10 h-10 rounded-full object-cover bg-slate-800 ring-2 ring-indigo-500/20"
                          />
                          <div>
                            <div className="font-semibold text-white">{std.name}</div>
                            <div className="text-xs text-slate-400 font-mono">@{std.username}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {std.className || 'Atanmadı'}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-mono font-medium text-slate-200">
                        #{std.studentNumber}
                      </td>

                      <td className="px-6 py-4 text-xs space-y-1">
                        <div className="flex items-center space-x-1.5 text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <span>{std.email}</span>
                        </div>
                        {std.phone && (
                          <div className="flex items-center space-x-1.5 text-slate-400">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            <span>{std.phone}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>Aktif Öğrenci</span>
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditStudent(std)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                            title="Düzenle"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setStudentToDelete(std)}
                            className="p-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                            title="Öğrenciyi Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ) : (
        /* CLASSES VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {classes.map((cls) => {
            const classStudents = students.filter((s) => s.classId === cls.id);
            return (
              <div
                key={cls.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <School className="w-5 h-5" />
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEditClass(cls)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setClassToDelete(cls)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Sınıfı Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-1">{cls.name}</h3>
                  <p className="text-xs text-indigo-300 font-medium mb-2">{cls.branch}</p>
                  <p className="text-xs text-slate-400 mb-4 line-clamp-2">
                    {cls.description || 'Akademik takip ve ders çizelgesi grubu.'}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    <span>
                      <strong className="text-white">{classStudents.length}</strong> Kayıtlı Öğrenci
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                    {cls.academicYear}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD/EDIT STUDENT MODAL */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <h3 className="text-lg font-bold text-white">
                {editingStudent ? 'Öğrenci Bilgilerini Düzenle' : 'Yeni Öğrenci Ekle'}
              </h3>
              <button
                onClick={() => setIsAddStudentOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Ad Soyad *</label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    value={studentUsername}
                    onChange={(e) => setStudentUsername(e.target.value)}
                    placeholder="ornek_kullanici"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">E-Posta *</label>
                  <input
                    type="email"
                    required
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sınıf Seçimi *</label>
                  <select
                    value={studentClassId}
                    onChange={(e) => setStudentClassId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Öğrenci No</label>
                  <input
                    type="text"
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-md"
                >
                  {editingStudent ? 'Değişiklikleri Kaydet' : 'Öğrenciyi Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD/EDIT CLASS MODAL */}
      {isAddClassOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <h3 className="text-lg font-bold text-white">
                {editingClass ? 'Sınıfı Düzenle' : 'Yeni Sınıf Oluştur'}
              </h3>
              <button
                onClick={() => setIsAddClassOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sınıf Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: 12-C Yabancı Dil veya YKS Kampı"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Alan / Şube</label>
                <input
                  type="text"
                  placeholder="Örn: Sayısal, Eşit Ağırlık, Sözel"
                  value={classBranch}
                  onChange={(e) => setClassBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Eğitim Yılı</label>
                <input
                  type="text"
                  value={classAcademicYear}
                  onChange={(e) => setClassAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Açıklama</label>
                <textarea
                  rows={2}
                  value={classDescription}
                  onChange={(e) => setClassDescription(e.target.value)}
                  placeholder="Sınıfın hedefi ve programı..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddClassOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-md"
                >
                  {editingClass ? 'Kaydet' : 'Sınıfı Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* EXCEL BULK UPLOAD MODAL */}
      <ExcelStudentUploadModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        classes={classes}
      />

      {/* CONFIRM DELETE STUDENT MODAL */}
      <ConfirmDeleteModal
        isOpen={!!studentToDelete}
        onClose={() => setStudentToDelete(null)}
        onConfirm={() => {
          if (studentToDelete) {
            dataService.deleteStudent(studentToDelete.id);
          }
        }}
        title="Öğrenciyi Sil"
        itemBadge={studentToDelete ? `${studentToDelete.className} • #${studentToDelete.studentNumber}` : undefined}
        description={`"${studentToDelete?.name}" adlı öğrenciyi sistemden kalıcı olarak silmek istediğinize emin misiniz? Öğrencinin tüm ödev teslimleri, notları ve mesaj kayıtları da temizlenecektir.`}
        confirmButtonText="Öğrenciyi Sil"
      />

      {/* CONFIRM DELETE CLASS MODAL */}
      <ConfirmDeleteModal
        isOpen={!!classToDelete}
        onClose={() => setClassToDelete(null)}
        onConfirm={() => {
          if (classToDelete) {
            dataService.deleteClass(classToDelete.id);
          }
        }}
        title="Sınıfı Sil"
        itemBadge={classToDelete?.branch}
        description={`"${classToDelete?.name}" sınıfını silmek istediğinize emin misiniz? Bu sınıfa kayıtlı öğrencilerin sınıf atamaları sıfırlanacaktır.`}
        confirmButtonText="Sınıfı Sil"
      />
    </div>
  );
};
