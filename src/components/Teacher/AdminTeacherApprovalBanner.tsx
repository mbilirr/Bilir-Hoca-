import React, { useState, useEffect } from 'react';
import {
  Bell,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  UserCheck,
  AlertTriangle,
  Mail,
  BookOpen,
  RotateCw,
} from 'lucide-react';
import { Teacher } from '../../types';
import { dataService } from '../../services/dataService';

interface AdminTeacherApprovalBannerProps {
  onOpenFullModal: () => void;
}

export const AdminTeacherApprovalBanner: React.FC<AdminTeacherApprovalBannerProps> = ({
  onOpenFullModal,
}) => {
  const [pendingTeachers, setPendingTeachers] = useState<Teacher[]>([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshPending = () => {
    setPendingTeachers(dataService.getPendingTeachers());
  };

  const handleCloudSync = async () => {
    setIsSyncing(true);
    await dataService.forceSyncTeachers();
    refreshPending();
    setIsSyncing(false);
    setActionFeedback('✓ Bulut sunucusu kontrol edildi. Güncel öğretmen başvuruları yenilendi.');
    setTimeout(() => setActionFeedback(null), 3000);
  };

  useEffect(() => {
    refreshPending();
    // Auto-check cloud for any new registrations submitted from other devices
    dataService.forceSyncTeachers().then(() => refreshPending());

    const unsubscribe = dataService.subscribe(refreshPending);
    return () => unsubscribe();
  }, []);

  if (pendingTeachers.length === 0) {
    return null;
  }

  const handleQuickApprove = (teacherId: string, name: string) => {
    dataService.approveTeacher(teacherId);
    setActionFeedback(`✓ ${name} hesabı başarıyla onaylandı. Artık giriş yapabilir.`);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleQuickReject = (teacherId: string, name: string) => {
    if (window.confirm(`${name} isimli öğretmenin kayıt başvurusunu reddetmek istediğinizden emin misiniz?`)) {
      dataService.rejectTeacher(teacherId);
      setActionFeedback(`✗ ${name} başvurusu reddedildi.`);
      setTimeout(() => setActionFeedback(null), 3500);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Yeni Başvuru';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Yeni Başvuru';
    }
  };

  return (
    <div
      id="admin-teacher-approval-banner"
      className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 border-2 border-amber-500/60 rounded-2xl p-4 sm:p-5 shadow-lg shadow-amber-950/40 relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-top-3"
    >
      {/* Background glow flare */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-500/30">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0 shadow-inner">
            <Bell className="w-5 h-5 text-amber-400 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm sm:text-base font-black text-amber-200 tracking-wide">
                Yeni Öğretmen Kayıt Başvurusu Onayı Bekleniyor!
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black animate-pulse">
                {pendingTeachers.length} Yeni Başvuru
              </span>
            </div>
            <p className="text-xs text-amber-300/80 mt-0.5">
              Sisteme yeni kayıt olan öğretmenlerin ders işlemlerine ve sınıflara erişebilmesi için yönetici onayınız gerekmektedir.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleCloudSync}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-amber-300 border border-amber-500/30 hover:border-amber-400/50 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Buluttaki yeni başvuruları anında tara ve senkronize et"
          >
            <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Kontrol Ediliyor...' : 'Buluttan Yenile'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenFullModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 hover:border-amber-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Tüm Başvuru ve Yetkileri Yönet</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Action feedback toast */}
      {actionFeedback && (
        <div className="mt-3 py-2 px-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 font-bold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* List of Pending Teachers */}
      <div className="mt-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {pendingTeachers.map((teacher) => (
          <div
            key={teacher.id}
            className="bg-white border border-amber-300/90 rounded-xl p-3.5 shadow-sm flex flex-col justify-between transition-all group text-slate-800"
          >
            <div>
              <div className="flex items-center space-x-3">
                <img
                  src={
                    teacher.avatar ||
                    `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(teacher.name)}`
                  }
                  alt={teacher.name}
                  className="w-10 h-10 rounded-full border border-amber-400/80 bg-slate-100 object-cover shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=100&auto=format&fit=crop&q=80';
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                      {teacher.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                      Yeni
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 text-[11px] text-amber-800 font-medium truncate mt-0.5">
                    <BookOpen className="w-3 h-3 text-amber-600 shrink-0" />
                    <span className="truncate">{teacher.branch || 'Genel Branş'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200 space-y-1 text-[10px] text-slate-600">
                <div className="flex items-center space-x-1 truncate">
                  <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate font-medium">{teacher.email || teacher.username}</span>
                </div>
                <div className="flex items-center space-x-1 text-slate-500">
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>Kayıt: {formatDate(teacher.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => handleQuickReject(teacher.id, teacher.name)}
                className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold transition-colors cursor-pointer flex items-center space-x-1"
                title="Başvuruyu Reddet"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Reddet</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickApprove(teacher.id, teacher.name)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all shadow-sm flex items-center space-x-1 cursor-pointer"
                title="Başvuruyu Onayla"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                <span>✓ Onayla</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
