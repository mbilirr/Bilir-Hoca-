import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  UserCheck,
  UserX,
  X,
  AlertCircle,
  Sparkles,
  Trash2,
  Clock,
  Users,
  Check,
  Crown,
  Layers,
  CheckSquare,
  Square,
  RotateCw,
} from 'lucide-react';
import { Teacher, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';

interface TeacherApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TeacherApprovalModal: React.FC<TeacherApprovalModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'teachers'>('pending');
  const [pendingTeachers, setPendingTeachers] = useState<Teacher[]>([]);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [allClasses, setAllClasses] = useState<ClassGroup[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshData = () => {
    setPendingTeachers(dataService.getPendingTeachers());
    setAllTeachers(dataService.getTeachers());
    setAllClasses(dataService.getAllClasses());
  };

  const handleCloudSync = async () => {
    setIsSyncing(true);
    await dataService.forceSyncTeachers();
    refreshData();
    setIsSyncing(false);
    setActionMsg('✓ Bulut sunucusundaki güncel öğretmen kayıtları senkronize edildi.');
    setTimeout(() => setActionMsg(null), 3000);
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
      Promise.all([
        dataService.forceSyncTeachers(),
        dataService.syncClassesFromSupabase(),
      ]).then(() => refreshData());
      const unsubscribe = dataService.subscribe(() => {
        refreshData();
      });
      return () => unsubscribe();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApprove = async (teacherId: string, name: string) => {
    dataService.approveTeacher(teacherId);
    setActionMsg(`✓ ${name} isimli öğretmen hesabı onaylandı. Artık sisteme giriş yapabilir.`);
    refreshData();
    await dataService.syncAllTeachersToCloud();
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleReject = async (teacherId: string, name: string) => {
    dataService.rejectTeacher(teacherId);
    setActionMsg(`✗ ${name} isimli öğretmen hesabı reddedildi.`);
    refreshData();
    await dataService.syncAllTeachersToCloud();
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleDelete = async (teacherId: string, name: string) => {
    if (name === 'Mustafa Bilir') {
      alert('Baş yönetici Mustafa Bilir hesabı silinemez.');
      return;
    }
    if (window.confirm(`${name} isimli öğretmen kaydını silmek istediğinizden emin misiniz?`)) {
      dataService.deleteTeacher(teacherId);
      setActionMsg(`${name} kaydı silindi.`);
      refreshData();
      await dataService.syncAllTeachersToCloud();
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleToggleClassPermission = async (teacher: Teacher, classId: string) => {
    const currentList = teacher.assignedClassIds || [];
    let updatedList: string[];
    if (currentList.includes(classId)) {
      updatedList = currentList.filter((id) => id !== classId);
    } else {
      updatedList = [...currentList, classId];
    }
    dataService.updateTeacherClassPermissions(teacher.id, updatedList);
    setActionMsg(`✓ ${teacher.name} için sınıf izinleri güncellendi.`);
    refreshData();
    await dataService.syncAllTeachersToCloud();
    setTimeout(() => setActionMsg(null), 2500);
  };

  const handleAssignAllClasses = async (teacher: Teacher) => {
    const allIds = allClasses.map((c) => c.id);
    dataService.updateTeacherClassPermissions(teacher.id, allIds);
    setActionMsg(`✓ ${teacher.name} için tüm sınıflara erişim izni verildi.`);
    refreshData();
    await dataService.syncAllTeachersToCloud();
    setTimeout(() => setActionMsg(null), 2500);
  };

  const handleClearClasses = async (teacher: Teacher) => {
    dataService.updateTeacherClassPermissions(teacher.id, []);
    setActionMsg(`✓ ${teacher.name} için sınıf izinleri temizlendi (yalnızca kendi eklediği öğrencileri görebilir).`);
    refreshData();
    await dataService.syncAllTeachersToCloud();
    setTimeout(() => setActionMsg(null), 2500);
  };

  const handleToggleCanViewAll = async (teacher: Teacher) => {
    const newVal = !teacher.canViewAllStudentsAndClasses;
    dataService.toggleTeacherCanViewAll(teacher.id, newVal);
    setActionMsg(
      newVal
        ? `✓ ${teacher.name} için önceden eklenmiş tüm sınıf ve öğrenci listelerini görme izni verildi.`
        : `✓ ${teacher.name} için genel liste izni kapatıldı (Yalnızca kendi eklediklerini ve izinli sınıfları görür).`
    );
    refreshData();
    await dataService.syncAllTeachersToCloud();
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleToggleAdmin = async (teacher: Teacher) => {
    const newStatus = !teacher.isAdmin;
    if (!newStatus) {
      if (teacher.username === 'Mustafa Bilir' || teacher.name === 'Mustafa Bilir') {
        alert('Baş yönetici Mustafa Bilir yetkisi kaldırılamaz.');
        return;
      }
      const adminCount = allTeachers.filter((t) => t.isAdmin).length;
      if (adminCount <= 1) {
        alert('Sistemde en az 1 yönetici (admin) bulunmalıdır. Bu öğretmenden yöneticilik yetkisi alınamaz.');
        return;
      }
    }
    dataService.toggleTeacherAdmin(teacher.id, newStatus);
    setActionMsg(
      newStatus
        ? `👑 ${teacher.name} Kurum Yöneticisi (Admin) yapıldı.`
        : `✓ ${teacher.name} standart öğretmen yetkisine çevrildi.`
    );
    refreshData();
    await dataService.syncAllTeachersToCloud();
    setTimeout(() => setActionMsg(null), 3000);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2 flex-wrap gap-y-1">
                <span>Öğretmenler & Sınıf İzinleri Yönetimi</span>
                {pendingTeachers.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {pendingTeachers.length} Onay Bekleyen
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Yeni öğretmenleri onaylayın, yöneticilik atayın ve öğretmenlerin görebileceği sınıfları belirleyin.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 sm:px-6 pt-3 pb-2 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/40 shrink-0 flex-wrap">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Onay Bekleyenler ({pendingTeachers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('teachers')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'teachers'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Tüm Öğretmenler & Sınıf İzinleri ({allTeachers.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCloudSync}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="Buluttaki güncel kayıtları hemen tara"
          >
            <RotateCw className={`w-3.5 h-3.5 text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Yenileniyor...' : 'Buluttan Yenile'}</span>
          </button>
        </div>

        {/* Feedback Message */}
        {actionMsg && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 text-xs font-semibold flex items-center space-x-2 animate-in fade-in shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>{actionMsg}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: PENDING TEACHERS */}
          {activeTab === 'pending' && (
            <div className="space-y-3">
              {pendingTeachers.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 text-slate-500 flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Bekleyen Öğretmen Başvurusu Yok</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Tüm öğretmen kayıtları onaylanmış durumda. Yeni bir öğretmen kayıt olduğunda burada listelenecektir.
                  </p>
                </div>
              ) : (
                pendingTeachers.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-slate-800"
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <img
                        src={t.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(t.name)}`}
                        alt={t.name}
                        className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 shrink-0 object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-sm text-slate-900 truncate">{t.name}</h4>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {t.branch || 'Genel Branş'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center space-x-2 mt-0.5 flex-wrap">
                          <span className="font-medium text-slate-700">@{t.username}</span>
                          <span>•</span>
                          <span>{t.email}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            Kayıt:{' '}
                            {new Date(t.createdAt).toLocaleDateString('tr-TR')}{' '}
                            {new Date(t.createdAt).toLocaleTimeString('tr-TR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleApprove(t.id, t.name)}
                        className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Onayla</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleReject(t.id, t.name)}
                        className="flex items-center space-x-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        <UserX className="w-4 h-4" />
                        <span>Reddet</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(t.id, t.name)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Başvuruyu Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: ALL TEACHERS & CLASS PERMISSIONS */}
          {activeTab === 'teachers' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Veri Gizliliği & Yetkilendirme Kuralı:</span>
                  <p className="mt-0.5 text-slate-300 text-[11px] leading-relaxed">
                    Standart öğretmenler yalnızca <strong>kendi kaydettikleri öğrencileri</strong> veya burada <strong>admin tarafından izin verilen sınıfları</strong> görebilir. Öğretmenler birbirlerinin özel verilerini göremez.
                  </p>
                </div>
              </div>

              {allTeachers.map((teacher) => {
                const assigned = teacher.assignedClassIds || [];
                return (
                  <div
                    key={teacher.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      teacher.isAdmin
                        ? 'bg-amber-50/60 border-amber-300 shadow-sm'
                        : 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
                    } text-slate-800`}
                  >
                    {/* Teacher Info Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                      <div className="flex items-center space-x-3 min-w-0">
                        <img
                          src={
                            teacher.avatar ||
                            `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(teacher.name)}`
                          }
                          alt={teacher.name}
                          className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 shrink-0 object-cover"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <h4 className="font-bold text-sm text-slate-900 truncate">{teacher.name}</h4>
                            {teacher.isAdmin ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center space-x-1">
                                <Crown className="w-3 h-3 text-amber-600" />
                                <span>Kurum Yöneticisi (Admin)</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                Öğretmen
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {teacher.branch || 'Genel Branş'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 flex items-center space-x-2 mt-0.5 flex-wrap">
                            <span className="font-medium text-slate-700">@{teacher.username}</span>
                            <span>•</span>
                            <span>{teacher.email}</span>
                          </div>
                        </div>
                      </div>

                      {/* Admin Toggle */}
                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleAdmin(teacher)}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            teacher.isAdmin
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                          }`}
                          title={teacher.isAdmin ? 'Yöneticilik yetkisini kaldır' : 'Kurum Yöneticisi yap'}
                        >
                          <Crown className="w-3.5 h-3.5 text-amber-600" />
                          <span>{teacher.isAdmin ? 'Admin Yetkili' : 'Admin Yap'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(teacher.id, teacher.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title="Öğretmeni Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Class Permissions Selector */}
                    <div className="pt-3">
                      {teacher.isAdmin ? (
                        <div className="flex items-center space-x-2 text-xs text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                          <Crown className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>
                            <strong>Yönetici Erişimi:</strong> Bu öğretmen kurum yöneticisi olduğu için tüm sınıfları ve tüm öğrencileri otomatik olarak görebilir ve yönetebilir.
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Yönetici İzni: Önceden Eklenmiş Sınıf ve Öğrenci Listelerini Görme */}
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div>
                              <div className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                                <Users className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Önceden Eklenmiş Sınıf & Öğrenci Listelerini Görme İzni</span>
                              </div>
                              <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                                {teacher.canViewAllStudentsAndClasses
                                  ? 'Öğretmen sistemdeki önceden oluşturulmuş tüm sınıfları ve kayıtlı öğrencileri görebilir.'
                                  : 'Öğretmen yalnızca kendi eklediklerini ve aşağıda seçilen sınıfları görebilir.'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleCanViewAll(teacher)}
                              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                teacher.canViewAllStudentsAndClasses
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-800 border border-slate-200 shadow-xs'
                              }`}
                            >
                              <Check className={`w-3.5 h-3.5 ${teacher.canViewAllStudentsAndClasses ? 'text-emerald-600' : 'text-slate-400'}`} />
                              <span>{teacher.canViewAllStudentsAndClasses ? 'Genel Liste İzni Açık' : 'İzin Kapalı (Korumalı)'}</span>
                            </button>
                          </div>

                          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                              <Layers className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Erişime İzin Verilen Sınıflar ({assigned.length}/{allClasses.length}):</span>
                            </label>
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                onClick={() => handleAssignAllClasses(teacher)}
                                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                              >
                                Tümünü Seç
                              </button>
                              <span className="text-slate-300 text-xs">|</span>
                              <button
                                type="button"
                                onClick={() => handleClearClasses(teacher)}
                                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                              >
                                Temizle
                              </button>
                            </div>
                          </div>

                          {allClasses.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">Sistemde kayıtlı sınıf bulunmuyor.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {allClasses.map((cls) => {
                                const isPermitted = assigned.includes(cls.id);
                                return (
                                  <button
                                    key={cls.id}
                                    type="button"
                                    onClick={() => handleToggleClassPermission(teacher, cls.id)}
                                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                      isPermitted
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs'
                                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800'
                                    }`}
                                  >
                                    {isPermitted ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Square className="w-3.5 h-3.5 text-slate-400" />
                                    )}
                                    <span>{cls.name}</span>
                                    {cls.branch && (
                                      <span className="text-[10px] opacity-70">({cls.branch})</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

