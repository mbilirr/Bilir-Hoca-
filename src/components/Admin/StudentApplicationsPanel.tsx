import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Check, X, RefreshCw, Inbox, AlertTriangle, Clock } from 'lucide-react';
import { ClassGroup, StudentApplication } from '../../types';
import { dataService } from '../../services/dataService';
import { formatClassDisplayName } from '../../constants/schoolConstants';

interface StudentApplicationsPanelProps {
  classes: ClassGroup[];
  onToast?: (text: string, type?: 'success' | 'error' | 'info') => void;
}

interface RowState {
  classId: string;
  studentNumber: string;
  rejectReason: string;
  showReject: boolean;
  busy: boolean;
  error: string | null;
}

// Yönetici: öğrenci kayıt başvurularını onaylama / reddetme paneli
export const StudentApplicationsPanel: React.FC<StudentApplicationsPanelProps> = ({ classes, onToast }) => {
  const [applications, setApplications] = useState<StudentApplication[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await dataService.fetchStudentApplications(showHistory ? 'all' : 'pending');
      setApplications(list);
      setRows((prev) => {
        const next: Record<string, RowState> = {};
        list.forEach((a) => {
          next[a.id] = prev[a.id] || {
            classId: a.classId || '',
            studentNumber: a.studentNumber,
            rejectReason: '',
            showReject: false,
            busy: false,
            error: null,
          };
        });
        return next;
      });
    } catch (err: any) {
      const msg = err?.message || '';
      setLoadError(
        /student_applications|relation|does not exist|schema cache/i.test(msg)
          ? 'Başvuru sistemi veritabanında henüz kurulmamış. 08_hesap_sistemi.sql dosyasını Supabase SQL Editor\'de çalıştırınız.'
          : msg || 'Başvurular okunamadı.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [showHistory]);

  useEffect(() => {
    load();
  }, [load]);

  const patchRow = (id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleApprove = async (app: StudentApplication) => {
    const row = rows[app.id];
    if (!row) return;
    const number = row.studentNumber.trim();
    if (!dataService.isValidLoginIdentifier(number)) {
      patchRow(app.id, { error: 'Öğrenci numarası yalnızca rakam/harf içermelidir (boşluksuz).' });
      return;
    }
    patchRow(app.id, { busy: true, error: null });
    try {
      const student = await dataService.approveStudentApplication(app.id, {
        classId: row.classId || undefined,
        studentNumber: number,
      });
      onToast?.(
        `✓ ${student.name} onaylandı. Öğrenci "${student.studentNumber}" numarası ve başvuruda belirlediği şifreyle giriş yapabilir.`,
        'success'
      );
      await load();
    } catch (err: any) {
      patchRow(app.id, { busy: false, error: err?.message || 'Onaylanamadı.' });
    }
  };

  const handleReject = async (app: StudentApplication) => {
    const row = rows[app.id];
    if (!row) return;
    patchRow(app.id, { busy: true, error: null });
    try {
      await dataService.rejectStudentApplication(app.id, row.rejectReason.trim() || undefined);
      onToast?.(`${app.name} başvurusu reddedildi.`, 'info');
      await load();
    } catch (err: any) {
      patchRow(app.id, { busy: false, error: err?.message || 'Reddedilemedi.' });
    }
  };

  const pending = applications.filter((a) => a.status === 'pending');
  const history = applications.filter((a) => a.status !== 'pending');

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Öğrenci Kayıt Başvuruları</span>
              {pending.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950">
                  {pending.length} bekliyor
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">
              Onaylanan öğrenci, başvuruda yazdığı öğrenci numarası ve kendi belirlediği şifreyle giriş yapar.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-1.5 text-[11px] text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900"
            />
            <span>Sonuçlananları da göster</span>
          </label>
          <button
            type="button"
            onClick={load}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-50"
            title="Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      {!loadError && pending.length === 0 && (
        <div className="py-6 text-center text-xs text-slate-500 flex flex-col items-center space-y-1.5">
          <Inbox className="w-6 h-6 text-slate-600" />
          <span>{isLoading ? 'Yükleniyor...' : 'Bekleyen başvuru yok.'}</span>
        </div>
      )}

      <div className="space-y-3">
        {pending.map((app) => {
          const row = rows[app.id];
          if (!row) return null;
          const requested = app.classId ? classes.find((c) => c.id === app.classId) : undefined;
          return (
            <div key={app.id} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <img
                    src={app.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(app.name)}`}
                    alt=""
                    className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700"
                  />
                  <div>
                    <div className="text-sm font-bold text-white">{app.name}</div>
                    <div className="text-[11px] text-slate-400">
                      Başvurduğu sınıf:{' '}
                      <span className="text-slate-200 font-semibold">
                        {requested
                          ? formatClassDisplayName(requested.name, requested.branch, requested.gradeLevel)
                          : app.requestedClass || 'Belirtilmedi'}
                      </span>
                      {app.email ? ` • ${app.email}` : ''}
                      {app.phone ? ` • ${app.phone}` : ''}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(app.createdAt).toLocaleString('tr-TR')}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Öğrenci No (giriş adı)</label>
                  <input
                    type="text"
                    value={row.studentNumber}
                    onChange={(e) => patchRow(app.id, { studentNumber: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Yerleştirilecek sınıf</label>
                  <select
                    value={row.classId}
                    onChange={(e) => patchRow(app.id, { classId: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Sınıf atanmadı (sonra atanır)</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatClassDisplayName(c.name, c.branch, c.gradeLevel)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {row.error && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px]">
                  {row.error}
                </div>
              )}

              {row.showReject && (
                <input
                  type="text"
                  value={row.rejectReason}
                  onChange={(e) => patchRow(app.id, { rejectReason: e.target.value })}
                  placeholder="Red nedeni (isteğe bağlı)"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-rose-500/40 rounded-lg text-white text-xs focus:outline-none"
                />
              )}

              <div className="flex items-center justify-end space-x-2">
                {row.showReject ? (
                  <>
                    <button
                      type="button"
                      onClick={() => patchRow(app.id, { showReject: false })}
                      disabled={row.busy}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(app)}
                      disabled={row.busy}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {row.busy ? 'İşleniyor...' : 'Reddet ve Sil'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => patchRow(app.id, { showReject: true })}
                      disabled={row.busy}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-rose-300 text-xs font-semibold border border-slate-700"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reddet</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(app)}
                      disabled={row.busy}
                      className="flex items-center space-x-1 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{row.busy ? 'Onaylanıyor...' : 'Onayla ve Hesabı Aç'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showHistory && history.length > 0 && (
        <div className="pt-2 border-t border-slate-800 space-y-1.5">
          <div className="text-[11px] font-bold text-slate-400">Sonuçlanan başvurular</div>
          {history.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/50 rounded-lg px-3 py-1.5">
              <span>
                <strong className="text-slate-200">{a.name}</strong> • No: {a.studentNumber}
                {a.rejectReason ? ` • Neden: ${a.rejectReason}` : ''}
              </span>
              <span className={a.status === 'approved' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {a.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
