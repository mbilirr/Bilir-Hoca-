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
  Crown,
  RotateCw,
} from 'lucide-react';
import { Teacher } from '../../types';
import { dataService, ADMIN_EMAIL } from '../../services/dataService';
import { useAutoDismiss } from '../../lib/useAutoDismiss';
import { appConfirm } from '../../lib/appDialog'; // Aşama 105
import { profilResmi, ogretmenProfilRol } from '../../lib/profilResmi';
import { OverlayLayer } from '../ui/kit'; // Aşama 191

interface TeacherApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TeacherApprovalModal: React.FC<TeacherApprovalModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'teachers'>('pending');
  const [pendingTeachers, setPendingTeachers] = useState<Teacher[]>([]);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  useAutoDismiss(actionMsg, () => setActionMsg(null)); // Aşama 32: 15 sn sonra kaybolur
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Aşama 98: her işlem yalnızca değişen öğretmeni kaydeder (dataService içinde). Genel yöneticide kuruma bağlı
  // öğretmenler ve kurum sınıfları burada görünmez; onların yetkileri kuruma geçilerek verilir.
  const refreshData = () => {
    const head = dataService.isHeadAdmin();
    const own = (t: Teacher) => !head || !t.kurumId;
    setPendingTeachers(dataService.getPendingTeachers().filter(own));
    setAllTeachers(dataService.getTeachers().filter(own));
  };

  const handleCloudSync = async () => {
    setIsSyncing(true);
    await dataService.forceSyncTeachers();
    refreshData();
    setIsSyncing(false);
    setActionMsg('✓ Bulut sunucusundaki güncel öğretmen kayıtları senkronize edildi.');
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
      dataService.forceSyncTeachers().then(() => refreshData());
      const unsubscribe = dataService.subscribe(() => {
        refreshData();
      });
      return () => unsubscribe();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Aşama 173: işlemler buluta yazılana kadar beklenir; yazılamazsa ekrandaki değişiklik geri alınır ve neden söylenir
  const handleApprove = async (teacherId: string, name: string) => {
    const res = await dataService.approveTeacher(teacherId);
    setActionMsg(res.success ? `✓ ${name} isimli öğretmen hesabı onaylandı. Artık sisteme giriş yapabilir.` : `${name}: ${res.error}`);
    refreshData();
  };

  const handleReject = async (teacherId: string, name: string) => {
    const res = await dataService.rejectTeacher(teacherId);
    setActionMsg(res.success ? `✗ ${name} isimli öğretmen hesabı reddedildi.` : `${name}: ${res.error}`);
    refreshData();
  };

  const handleDelete = async (teacherId: string, name: string) => {
    const target = allTeachers.find((t) => t.id === teacherId);
    if (target && (target.email || '').trim().toLowerCase() === ADMIN_EMAIL) {
      setActionMsg('Kurum yöneticisinin hesabı silinemez.');
      return;
    }
    if (await appConfirm({ title: 'Öğretmen kaydı silinsin mi?', message: `${name} isimli öğretmen kaydını silmek istediğinizden emin misiniz?` })) {
      const res = await dataService.deleteTeacher(teacherId);
      setActionMsg(res.success ? `${name} kaydı silindi.` : `${name}: ${res.error}`);
      refreshData();
    }
  };

  const handleToggleAdmin = async (teacher: Teacher) => {
    const newStatus = !teacher.isAdmin;
    if (!newStatus) {
      if ((teacher.email || '').trim().toLowerCase() === ADMIN_EMAIL) {
        setActionMsg('Kurum yöneticisinin yönetici yetkisi kaldırılamaz.');
        return;
      }
      const adminCount = allTeachers.filter((t) => t.isAdmin).length;
      if (adminCount <= 1) {
        setActionMsg('Sistemde en az 1 yönetici bulunmalıdır. Bu öğretmenden yöneticilik yetkisi alınamaz.');
        return;
      }
    }
    const res = await dataService.toggleTeacherAdmin(teacher.id, newStatus);
    setActionMsg(
      !res.success
        ? `${teacher.name}: ${res.error}`
        : newStatus
          ? `👑 ${teacher.name} Kurum Yöneticisi (Admin) yapıldı.`
          : `✓ ${teacher.name} standart öğretmen yetkisine çevrildi.`
    );
    refreshData();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <OverlayLayer onClose={onClose} />
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="relative w-full max-w-3xl bg-surface border border-line rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
        <div className="p-5 sm:p-6 border-b border-line bg-gradient-to-r from-surface via-indigo-50 dark:via-indigo-950/40 to-surface flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-fg flex items-center space-x-2 flex-wrap gap-y-1">
                <span>Öğretmenler & Sınıf İzinleri Yönetimi</span>
                {pendingTeachers.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    {pendingTeachers.length} Onay Bekleyen
                  </span>
                )}
              </h2>
              <p className="text-xs text-muted">
                Yeni öğretmenleri onaylayın, yöneticilik atayın ve öğretmenlerin görebileceği sınıfları belirleyin.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="ui-btn ui-btn-ghost ui-btn-icon shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 sm:px-6 pt-3 pb-2 border-b border-line flex items-center justify-between gap-2 bg-canvas/40 shrink-0 flex-wrap">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`ui-btn ui-btn-sm ${
                activeTab === 'pending'
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40'
                  : 'text-muted hover:text-fg hover:bg-surface-2'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Onay Bekleyenler ({pendingTeachers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('teachers')}
              className={`ui-btn ui-btn-sm ${
                activeTab === 'teachers'
                  ? 'bg-indigo-600 text-white'
                  : 'text-muted hover:text-fg hover:bg-surface-2'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Tüm Öğretmenler & Sınıf İzinleri ({allTeachers.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCloudSync}
            disabled={isSyncing}
            className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg border border-line disabled:opacity-50 min-w-24"
            title="Buluttaki güncel kayıtları hemen tara"
          >
            <RotateCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Yenileniyor...' : 'Buluttan Yenile'}</span>
          </button>
        </div>

        {/* Feedback Message */}
        {actionMsg && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-200 border border-indigo-500/40 text-xs font-semibold flex items-center space-x-2 animate-in fade-in shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
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
                  <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-line text-muted flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-bold text-fg">Bekleyen Öğretmen Başvurusu Yok</h4>
                  <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                    Tüm öğretmen kayıtları onaylanmış durumda. Yeni bir öğretmen kayıt olduğunda burada listelenecektir.
                  </p>
                </div>
              ) : (
                pendingTeachers.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-surface border border-line shadow-sm hover:shadow-md hover:border-line-strong transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-fg"
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <img
                        src={profilResmi(t, ogretmenProfilRol(t))}
                        alt={t.name}
                        className="w-11 h-11 rounded-2xl bg-surface-2 border border-line shrink-0 object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-sm text-fg truncate">{t.name}</h4>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                            {t.branch || 'Genel Branş'}
                          </span>
                        </div>
                        <div className="text-xs text-muted flex items-center space-x-2 mt-0.5 flex-wrap">
                          <span className="font-medium text-fg-2">@{t.username}</span>
                          <span>•</span>
                          <span>{t.email}</span>
                        </div>
                        <div className="text-[11px] text-muted mt-1 flex items-center space-x-1">
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
                        className="ui-btn ui-btn-sm bg-emerald-600 hover:bg-emerald-500 text-white min-w-24"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Onayla</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleReject(t.id, t.name)}
                        className="ui-btn ui-btn-sm bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-500/30 min-w-24"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>Reddet</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(t.id, t.name)}
                        className="p-2 text-subtle hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
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
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-600 dark:text-indigo-300 flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Veri Gizliliği & Yetkilendirme Kuralı:</span>
                  <p className="mt-0.5 text-fg-2 text-[11px] leading-relaxed">
                    Standart öğretmenler yalnızca <strong>kendi kaydettikleri öğrencileri</strong> ve <strong>yöneticinin izin verdiği sınıf / öğrencileri</strong> görebilir. Sınıf ve öğrenci erişimi <strong>Yönetim › Öğretmenler</strong> bölümündeki <strong>Erişim Matrisi</strong> düğmesinden verilir.
                  </p>
                </div>
              </div>

              {allTeachers.map((teacher) => {
                return (
                  <div
                    key={teacher.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      teacher.isAdmin
                        ? 'bg-amber-50/60 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 shadow-sm'
                        : 'bg-surface border-line shadow-sm hover:shadow-md hover:border-line-strong'
                    } text-subtle`}
                  >
                    {/* Teacher Info Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
                      <div className="flex items-center space-x-3 min-w-0">
                        <img
                          src={
                            profilResmi(teacher, ogretmenProfilRol(teacher))
                          }
                          alt={teacher.name}
                          className="w-10 h-10 rounded-2xl bg-surface-2 border border-line shrink-0 object-cover"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <h4 className="font-bold text-sm text-fg truncate">{teacher.name}</h4>
                            {teacher.isAdmin ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-500/30 flex items-center space-x-1">
                                <Crown className="w-3 h-3 text-amber-600 dark:text-amber-300" />
                                <span>Kurum Yöneticisi (Admin)</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-surface-2 text-fg-2 border border-line">
                                Öğretmen
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                              {teacher.branch || 'Genel Branş'}
                            </span>
                          </div>
                          <div className="text-xs text-muted flex items-center space-x-2 mt-0.5 flex-wrap">
                            <span className="font-medium text-fg-2">@{teacher.username}</span>
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
                          className={`ui-btn ui-btn-sm ${
                            teacher.isAdmin
                              ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-500/30 hover:bg-amber-200 dark:hover:bg-amber-500/20'
                              : 'bg-surface-2 text-fg-2 hover:bg-surface-3 border border-line'
                          }`}
                          title={teacher.isAdmin ? 'Yöneticilik yetkisini kaldır' : 'Kurum Yöneticisi yap'}
                        >
                          <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
                          <span>{teacher.isAdmin ? 'Admin Yetkili' : 'Admin Yap'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(teacher.id, teacher.name)}
                          className="p-1.5 text-subtle hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                          title="Öğretmeni Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Class Permissions Selector */}
                    <div className="pt-3">
                      {teacher.isAdmin ? (
                        <div className="flex items-center space-x-2 text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 p-2.5 rounded-xl border border-amber-200 dark:border-amber-500/30">
                          <Crown className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />
                          <span>
                            <strong>Yönetici Erişimi:</strong> Bu öğretmen kurum yöneticisi olduğu için tüm sınıfları ve tüm öğrencileri otomatik olarak görebilir ve yönetebilir.
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2 text-xs text-fg-2 bg-surface-2 p-2.5 rounded-xl border border-line" data-k="onay-erisim-matrisi-notu">
                          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-300 shrink-0" />
                          <span>
                            Sınıf ve öğrenci erişimi <strong>Yönetim › Öğretmenler › Erişim Matrisi</strong> ile verilir (kaydedilen yetki öğretmende hemen görünür).
                          </span>
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
        <div className="p-4 bg-canvas/80 border-t border-line flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg min-w-24"
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

