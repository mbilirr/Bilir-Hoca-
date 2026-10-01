import React, { useEffect, useState } from 'react';
import { DatabaseBackup, Download, FolderSync, Loader2, CheckCircle2, AlertTriangle, Search, Info } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { supabase } from '../../lib/supabase';
import {
  createFullBackup,
  getLastBackupDate,
  scanLegacyInlineFiles,
  migrateLegacyInlineFiles,
  LegacyScanResult,
  LegacyMigrationResult,
} from '../../services/maintenanceService';

export const BACKUP_REMINDER_DAYS = 7;

const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));

const formatSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Yönetici bakım paneli: tam yedek ve eski gömülü dosyaların depoya taşınması
export const AdminMaintenancePanel: React.FC = () => {
  const adminName = dataService.getCurrentTeacher()?.name || 'Yönetici';

  // --- Yedek ---
  const [lastBackup, setLastBackup] = useState<Date | null | 'unavailable' | undefined>(undefined);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupProgress, setBackupProgress] = useState<string>('');
  const [backupMsg, setBackupMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    getLastBackupDate().then(setLastBackup).catch(() => setLastBackup('unavailable'));
  }, []);

  const handleBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const res = await createFullBackup(adminName, (done, total, label) =>
        setBackupProgress(done < total ? `${label} okunuyor (${done + 1}/${total})` : label)
      );
      const total = Object.values(res.counts).reduce((a, b) => a + b, 0);
      setBackupMsg({
        type: res.failedTables.length ? 'err' : 'ok',
        text:
          `Yedek indirildi: ${res.fileBaseName}.xlsx ve .json (${total} kayıt).` +
          (res.failedTables.length ? ` Okunamayan tablolar: ${res.failedTables.map((f) => f.table).join(', ')}.` : ''),
      });
      setLastBackup(new Date());
      window.dispatchEvent(new Event('app-backup-done'));
    } catch (e: any) {
      setBackupMsg({ type: 'err', text: e?.message || 'Yedek alınamadı.' });
    } finally {
      setBackupBusy(false);
      setBackupProgress('');
    }
  };

  // --- Eski dosyalar ---
  const [scan, setScan] = useState<LegacyScanResult | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveProgress, setMoveProgress] = useState<{ done: number; total: number } | null>(null);
  const [moveResult, setMoveResult] = useState<LegacyMigrationResult | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);

  const handleScan = async () => {
    setScanBusy(true);
    setLegacyError(null);
    setMoveResult(null);
    try {
      setScan(await scanLegacyInlineFiles());
    } catch (e: any) {
      setLegacyError(e?.message || 'Tarama yapılamadı.');
    } finally {
      setScanBusy(false);
    }
  };

  const handleMove = async () => {
    if (!scan || moveBusy) return;
    setMoveBusy(true);
    setLegacyError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id;
      if (!uid) throw new Error('Oturum bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.');
      setMoveProgress({ done: 0, total: scan.totalFiles });
      const res = await migrateLegacyInlineFiles(scan, uid, (done, total) => setMoveProgress({ done, total }));
      setMoveResult(res);
      setScan(await scanLegacyInlineFiles());
      await dataService.revalidateAndSyncAll(false);
    } catch (e: any) {
      setLegacyError(e?.message || 'Taşıma yapılamadı.');
    } finally {
      setMoveBusy(false);
      setMoveProgress(null);
    }
  };

  const lastText =
    lastBackup === undefined
      ? 'kontrol ediliyor…'
      : lastBackup === 'unavailable'
      ? 'bilinmiyor (12 numaralı SQL çalıştırılmamış olabilir)'
      : lastBackup === null
      ? 'henüz hiç yedek alınmadı'
      : `${lastBackup.toLocaleString('tr-TR')} (${daysSince(lastBackup) === 0 ? 'bugün' : `${daysSince(lastBackup)} gün önce`})`;
  const backupOverdue = lastBackup === null || (lastBackup instanceof Date && daysSince(lastBackup) >= BACKUP_REMINDER_DAYS);

  return (
    <div id="admin-maintenance-panel" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* YEDEK */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center shrink-0">
            <DatabaseBackup className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Tüm Verileri Yedekle</h2>
            <p className="text-xs text-slate-400">Öğrenciler, sınıflar, ödevler, teslimler, notlar, yoklama, etütler, mesajlar…</p>
          </div>
        </div>
        <p className={`text-xs ${backupOverdue ? 'text-amber-300' : 'text-slate-300'}`}>
          Son yedek: <strong>{lastText}</strong>
        </p>
        <p className="text-[11px] text-slate-400 flex gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            İki dosya iner: <strong>Excel</strong> (okumak için) ve <strong>JSON</strong> (tam yedek; geri yükleme gerekirse bu kullanılır).
            Her ikisini de bilgisayarınızda ve ayrıca Google Drive gibi ikinci bir yerde saklayın. Haftada bir yedek almanız önerilir.
          </span>
        </p>
        <button
          type="button"
          onClick={handleBackup}
          disabled={backupBusy}
          className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
        >
          {backupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {backupBusy ? backupProgress || 'Hazırlanıyor…' : 'Yedeği İndir (Excel + JSON)'}
        </button>
        {backupMsg && (
          <div
            role={backupMsg.type === 'err' ? 'alert' : 'status'}
            className={`p-3 rounded-xl text-xs border flex gap-2 ${
              backupMsg.type === 'ok'
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
            }`}
          >
            {backupMsg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{backupMsg.text}</span>
          </div>
        )}
      </section>

      {/* ESKİ DOSYALAR */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
            <FolderSync className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Eski Dosyaları Depoya Taşı</h2>
            <p className="text-xs text-slate-400">Eski sürümde kayıtların içine gömülen dosyalar (ödev, teslim, arşiv)</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          Bu dosyalar her eşitlemede yeniden indirildiği için sistemi yavaşlatır. Taşındıktan sonra aynı şekilde açılırlar;
          öğretmen ve öğrenciler fark görmez. İşlem tekrar çalıştırılabilir, bir şeyi silmez.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanBusy || moveBusy}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-100 border border-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer"
          >
            {scanBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Eski Dosyaları Tara
          </button>
          {scan && scan.totalFiles > 0 && (
            <button
              type="button"
              onClick={handleMove}
              disabled={moveBusy}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer"
            >
              {moveBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSync className="w-4 h-4" />}
              {moveBusy && moveProgress ? `Taşınıyor… ${moveProgress.done}/${moveProgress.total}` : `${scan.totalFiles} Dosyayı Taşı`}
            </button>
          )}
        </div>
        {scan && (
          <div role="status" className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-1">
            {scan.totalFiles === 0 ? (
              <p className="text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Taşınacak eski dosya kalmadı.
              </p>
            ) : (
              <>
                <p>
                  Bulunan: <strong>{scan.totalFiles}</strong> dosya (yaklaşık {formatSize(scan.approxBytes)})
                </p>
                <p className="text-slate-400">
                  Ödevlerde {scan.homeworks.reduce((a, h) => a + h.files, 0)} · Teslimlerde{' '}
                  {scan.submissions.reduce((a, s) => a + s.files, 0)} · Arşivde {scan.documents.length}
                </p>
              </>
            )}
          </div>
        )}
        {moveResult && (
          <div
            role={moveResult.failed.length ? 'alert' : 'status'}
            className={`p-3 rounded-xl text-xs border ${
              moveResult.failed.length
                ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
            }`}
          >
            <p className="font-bold">{moveResult.moved} dosya depoya taşındı.</p>
            {moveResult.failed.length > 0 && (
              <>
                <p className="mt-1">Taşınamayanlar (olduğu gibi yerinde kaldı, açılmaya devam eder):</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {moveResult.failed.slice(0, 10).map((f, i) => (
                    <li key={i}>
                      {f.where}: {f.error}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {legacyError && (
          <div role="alert" className="p-3 rounded-xl text-xs border bg-rose-950/40 border-rose-500/30 text-rose-200">
            {legacyError}
          </div>
        )}
      </section>
    </div>
  );
};
