import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, FileSpreadsheet, KeyRound, Loader2, MessageSquare, ShieldCheck, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal } from '../ui/kit';
import { dataService } from '../../services/dataService';
import { callMail, describeMailResult } from '../../lib/mailApi';
import { appCopyFallback } from '../../lib/appDialog';
import { gradeOptionsFrom, gradesLabel, saveTeacherGrades, type TeacherGrades } from '../../lib/teacherGrades';
import { saveTeacherContact } from '../../lib/teacherContacts';
import { roleFromBranch, roleLabel, saveTeacherRoles } from '../../lib/teacherRoles'; // Aşama 147
import { describeTeacherCredentialResult, sendTeacherCredentials } from '../../lib/teacherCredentialSend';
import {
  TEACHER_TEMPLATE_HEADERS,
  birthDateLabel,
  parseTeacherMatrix,
  uniqueUsername,
  usernameBase,
  type ParsedTeacherRow,
} from '../../lib/teacherImport';
import { sheetSource } from '../../lib/importNormalize'; // Aşama 154

// ============================================================================
// Aşama 144: ÖĞRETMENLERİ EXCEL İLE TOPLU EKLEME
// 1) Dosya + kademe seçilir → 2) önizleme (hatalı satırlar kırmızı, atlanır) → 3) hesaplar sırayla açılır
// → 4) giriş bilgileri tek pencerede (kopyala, Excel, e-posta, SMS).
// Hesaplar tek tek eklemedeki createTeacherAccount ile açılır (aynı yetki ve geri alma kuralları).
// Şifreler saklanmaz: sonuç penceresi kapanınca tekrar görüntülenemez.
// ============================================================================

export interface TeacherCredential {
  teacherId: string;
  name: string;
  username: string;
  password: string;
  phone: string;
  email: string;
  branch: string;
  birthDate: string;
}

export interface TeacherExcelUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** Hesaplar açıldıktan sonra liste bir kez yenilensin */
  onCreated?: (count: number) => void;
}

type Stage = 'select' | 'creating' | 'done';
type MailState = 'idle' | 'sending' | 'done';

const inputCls = 'h-8 w-full px-2.5 bg-canvas border border-line rounded-lg text-fg text-xs focus:outline-none focus:border-indigo-500';
const credentialText = (c: TeacherCredential) =>
  `Merhaba ${c.name},\nbiliredu öğretmen giriş bilgileriniz:\nAdres: ${window.location.origin}\nGiriş ekranında "Öğretmen" sekmesini seçiniz.\nKullanıcı adı: ${c.username}\nŞifre: ${c.password}\nGiriş yaptıktan sonra profil menüsünden şifrenizi değiştiriniz.`;

const usernameTaken = (msg: string) => /kullanıcı adı.*(kullanılıyor|başka)/i.test(msg);

const TeacherExcelUploadContent: React.FC<Omit<TeacherExcelUploadModalProps, 'open'>> = ({ onClose, onCreated }) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>('select');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedTeacherRow[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const gradeOptions = useMemo(() => gradeOptionsFrom(dataService.getAllClasses()), []);
  // '' = seçilmedi, 'all' = tüm kademeler, '8' = 8. sınıf
  const [grade, setGrade] = useState('');
  // Aşama 147: kurumda açılan hesaba branşa göre unvan verilir (Rehberlik → Rehberlik, diğerleri → Öğretmen)
  const roleUi = !dataService.isHeadAdmin() && dataService.isKurumAdmin() && !!dataService.getMyKurumId();
  const rolesOn = roleUi && dataService.getMyKurum().rolesEnabled === true;
  const [sendMail, setSendMail] = useState(true);
  const [progress, setProgress] = useState(0);
  const [created, setCreated] = useState<TeacherCredential[]>([]);
  const [failures, setFailures] = useState<Array<{ name: string; error: string }>>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [mailState, setMailState] = useState<MailState>('idle');
  const [mailNote, setMailNote] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [smsBusy, setSmsBusy] = useState<string | null>(null);
  const [smsNote, setSmsNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedAll, setSavedAll] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const valid = useMemo(() => rows.filter((r) => !r.error), [rows]);
  const invalidCount = rows.length - valid.length;
  const gradeSel: TeacherGrades | null = grade === 'all' ? { all: true, grades: [] } : grade ? { all: false, grades: [Number(grade)] } : null;

  const readFile = (file: File) => {
    setFileName(file.name);
    setReadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const src = sheetSource(e.target?.result as ArrayBuffer, 'array'); // Aşama 154: CSV Türkçe harf
        const wb = XLSX.read(src.data, { type: src.type, cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });
        const existing = dataService.getTeachers().map((t) => ({ name: t.name, username: t.username, email: t.email }));
        const { rows: parsed, missingName } = parseTeacherMatrix(matrix, existing);
        if (missingName) {
          setRows([]);
          setReadError('"ADI SOYADI" sütunu bulunamadı. Boş şablonu indirip başlıkları karşılaştırın.');
        } else if (!parsed.length) {
          setRows([]);
          setReadError('Dosyada öğretmen satırı bulunamadı.');
        } else setRows(parsed);
      } catch {
        setRows([]);
        setReadError('Dosya okunamadı. Excel (.xlsx, .xls) ya da CSV dosyası seçin.');
      }
    };
    reader.onerror = () => setReadError('Dosya okunamadı.');
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEACHER_TEMPLATE_HEADERS]);
    ws['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Öğretmenler');
    XLSX.writeFile(wb, 'Ogretmen_Yukleme_Sablonu.xlsx');
  };

  const createAll = async () => {
    if (!valid.length || !gradeSel) return;
    setStage('creating');
    setProgress(0);
    const ok: TeacherCredential[] = [];
    const bad: Array<{ name: string; error: string }> = [];
    const warn: string[] = [];
    const taken = new Set(dataService.getTeachers().map((t) => (t.username || '').toLowerCase()));
    for (let i = 0; i < valid.length; i++) {
      const r = valid[i];
      const password = dataService.generatePassword();
      let username = r.username;
      let res: Awaited<ReturnType<typeof dataService.createTeacherAccount>> | null = null;
      // Kullanıcı adı başka okulda alınmışsa sonuna rakam eklenerek en çok 3 kez denenir
      for (let attempt = 0; attempt < 3 && !res; attempt++) {
        try {
          res = await dataService.createTeacherAccount({ name: r.name, username, branch: r.branch, email: r.email, password, gender: r.gender || undefined });
        } catch (er: any) {
          const msg = er?.message || 'Hesap açılamadı';
          if (attempt < 2 && usernameTaken(msg)) {
            taken.add(username);
            username = uniqueUsername(usernameBase(r.name), taken, 2);
            continue;
          }
          bad.push({ name: r.name, error: msg });
          break;
        }
      }
      if (res) {
        taken.add(res.teacher.username);
        const unvan = roleFromBranch(r.branch);
        if (roleUi) {
          await saveTeacherRoles(res.teacher.id, [unvan]).catch((er) =>
            warn.push(`${r.name}: unvan verilemedi (${er?.message || 'hata'}), Yetkiler penceresinden verin.`)
          );
        }
        // Rehberlik tüm kademeleri görür (rol yetkileri açıkken); tek tek eklemedeki gibi kademe kaydedilmez
        if (gradeSel && res.teacher.auth_user_id && !(rolesOn && unvan === 'rehberlik')) {
          await saveTeacherGrades(res.teacher.auth_user_id, gradeSel).catch((er) =>
            warn.push(`${r.name}: kademe verilemedi (${er?.message || 'hata'}), listedeki erişim düğmesinden verin.`)
          );
        }
        if (r.phone || r.birthDate) {
          await saveTeacherContact(res.teacher.id, { phone: r.phone, birthDate: r.birthDate }).catch((er) =>
            warn.push(`${r.name}: telefon / doğum tarihi kaydedilemedi (${er?.message || 'hata'}).`)
          );
        }
        ok.push({
          teacherId: res.teacher.id,
          name: res.teacher.name,
          username: res.teacher.username,
          password: res.password,
          phone: r.phone,
          email: r.email,
          branch: res.teacher.branch || r.branch,
          birthDate: r.birthDate,
        });
      }
      setProgress(i + 1);
    }
    setCreated(ok);
    setFailures(bad);
    setNotes(warn);
    setStage('done');
    if (ok.length) onCreated?.(ok.length);
    if (sendMail) void mailAll(ok);
  };

  // Giriş bilgisi e-postası (yalnız e-postası olanlara; alıcıyı sunucu kayıttan okur)
  const mailAll = async (list: TeacherCredential[]) => {
    const targets = list.filter((c) => c.email);
    if (!targets.length) return;
    setMailState('sending');
    let sent = 0;
    let lastErr = '';
    for (const c of targets) {
      const r = await callMail('teacher-account', { teacherId: c.teacherId, kind: 'created', password: c.password });
      if (r.ok) sent++;
      else lastErr = describeMailResult(r).text;
    }
    setMailState('done');
    setMailNote(sent === targets.length ? `${sent} öğretmene e-posta gönderildi.` : `${sent}/${targets.length} e-posta gönderildi. ${lastErr}`);
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      await appCopyFallback('Giriş bilgileri', text);
    }
    setCopied(key);
    window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
  };

  const downloadExcel = () => {
    const data = created.map((c) => ({
      'Ad Soyad': c.name,
      Branş: c.branch,
      'Kullanıcı Adı': c.username,
      Şifre: c.password,
      Telefon: c.phone,
      'E-Posta': c.email,
      'Doğum Tarihi': birthDateLabel(c.birthDate),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Giriş Bilgileri');
    XLSX.writeFile(wb, 'Ogretmen_Giris_Bilgileri.xlsx');
    setSavedAll(true);
  };

  // Giriş bilgisi SMS'i: Paket 142 gönderim yolu (şifre istekle gider, sunucu hiçbir kayda yazmaz)
  const sendSms = async (items: TeacherCredential[], key: string) => {
    const withPhone = items.filter((c) => c.phone);
    if (!withPhone.length) {
      setSmsNote({ ok: false, text: 'Telefonu olan öğretmen yok, SMS gönderilmedi.' });
      return;
    }
    setSmsBusy(key);
    try {
      const r = await sendTeacherCredentials(withPhone.map((c) => ({ id: c.teacherId, password: c.password })), { sms: true, email: false });
      const lines = describeTeacherCredentialResult(r);
      setSmsNote({ ok: lines.every((l) => l.tone === 'success'), text: lines.map((l) => l.text).join(' ') });
      if (r.ok && r.sms?.sent) setSavedAll(true);
    } catch (er: any) {
      setSmsNote({ ok: false, text: er?.message || 'SMS gönderilemedi.' });
    } finally {
      setSmsBusy(null);
    }
  };

  const requestClose = () => {
    if (stage === 'creating') return;
    if (stage === 'done' && created.length && !savedAll && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  // ------------------------------------------------------------------ alt düğmeler
  const btn = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
  const footer =
    stage === 'done' ? (
      <>
        {created.length > 0 && (
          <>
            <button type="button" className={`${btn} ui-btn-secondary`} onClick={() => { void copyText(created.map(credentialText).join('\n\n'), 'all'); setSavedAll(true); }}>
              {copied === 'all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Kopyala</span>
            </button>
            <button type="button" className={`${btn} ui-btn-success`} onClick={downloadExcel}>
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            {(
              <button type="button" className={`${btn} ui-btn-secondary`} disabled={!!smsBusy} onClick={() => void sendSms(created, 'all')}>
                {smsBusy === 'all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                <span>Toplu SMS</span>
              </button>
            )}
          </>
        )}
        <button type="button" className={`${btn} ui-btn-primary`} onClick={requestClose}>
          {confirmClose ? 'Yine de Kapat' : 'Kapat'}
        </button>
      </>
    ) : (
      <>
        <button type="button" className={`${btn} ui-btn-secondary`} onClick={requestClose} disabled={stage === 'creating'}>
          Vazgeç
        </button>
        <button
          type="button"
          id="ogretmen-excel-ac"
          className={`${btn} ui-btn-primary`}
          disabled={stage === 'creating' || !valid.length || !gradeSel}
          onClick={() => void createAll()}
          title={!gradeSel ? 'Önce kademe seçin' : undefined}
        >
          {stage === 'creating' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
          <span>Hesapları Aç</span>
        </button>
      </>
    );

  return (
    <Modal
      open
      onClose={requestClose}
      closeOnBackdrop={false}
      icon={stage === 'done' ? KeyRound : FileSpreadsheet}
      size={stage === 'select' && !rows.length ? 'sm' : 'lg'}
      title={stage === 'done' ? 'Öğretmen Giriş Bilgileri' : 'Excel ile Öğretmen Ekle'}
      description={
        stage === 'done'
          ? `${created.length} öğretmenin hesabı açıldı${failures.length ? `, ${failures.length} açılamadı` : ''}`
          : 'Ad soyad, branş, doğum tarihi, telefon ve e-posta okunur; TC okunmaz.'
      }
      footer={footer}
      id="ogretmen-excel-pencere"
    >
      {stage !== 'done' ? (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8 w-full justify-center" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5" />
              <span>Boş Şablon</span>
            </button>
            <button type="button" id="ogretmen-excel-dosya" className="ui-btn ui-btn-sm ui-btn-secondary h-8 w-full justify-center" onClick={() => fileRef.current?.click()} disabled={stage === 'creating'}>
              <Upload className="w-3.5 h-3.5" />
              <span className="truncate">{fileName || 'Dosya Seç'}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                e.target.value = '';
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 items-center">
            <label htmlFor="ogretmen-excel-kademe" className="font-bold text-fg-2">Görebileceği kademe</label>
            <select id="ogretmen-excel-kademe" value={grade} onChange={(e) => setGrade(e.target.value)} className={inputCls} disabled={stage === 'creating'}>
              <option value="">Seçiniz</option>
              <option value="all">Tüm kademeler</option>
              {gradeOptions.map((g) => (
                <option key={g} value={String(g)}>{g}. Sınıf</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-fg-2 select-none">
            <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} disabled={stage === 'creating'} className="w-3.5 h-3.5" />
            <span>E-postası olanlara giriş bilgilerini e-postayla gönder</span>
          </label>

          {readError && (
            <div className="p-2.5 rounded-lg bg-danger-soft text-danger-fg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{readError}</span>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                <span className="ui-chip">{rows.length} satır</span>
                <span className="ui-chip text-success-fg">{valid.length} açılacak</span>
                {invalidCount > 0 && <span className="ui-chip text-danger-fg">{invalidCount} atlanacak</span>}
                {gradeSel && <span className="ui-chip">Kademe: {gradesLabel(gradeSel)}</span>}
              </div>
              <div className="border border-line rounded-xl overflow-auto max-h-[45vh]">
                <table className="w-full text-left text-xs" id="ogretmen-excel-onizleme">
                  <thead className="bg-surface-2/80 text-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-2">Satır</th>
                      <th className="px-2 py-2">Ad Soyad</th>
                      <th className="px-2 py-2">Branş</th>
                      <th className="px-2 py-2">Doğum T.</th>
                      <th className="px-2 py-2">Telefon</th>
                      <th className="px-2 py-2">E-posta</th>
                      <th className="px-2 py-2">Kullanıcı adı</th>
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.key} className={r.error ? 'bg-danger-soft/60' : ''}>
                        <td className="px-2 py-1.5 text-muted">{r.rowNumber}</td>
                        <td className="px-2 py-1.5">
                          <div className="font-semibold text-fg">{r.name || '—'}</div>
                          {r.error && <div className="text-[11px] text-danger-fg">{r.error}</div>}
                          {!r.error && r.warning && <div className="text-[11px] text-warning-fg">{r.warning}</div>}
                        </td>
                        <td className="px-2 py-1.5">
                          <div>{r.branch || '—'}</div>
                          {roleUi && <div className="text-[11px] text-brand-fg font-semibold">Unvan: {roleLabel(roleFromBranch(r.branch))}</div>}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{birthDateLabel(r.birthDate)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.phone}</td>
                        <td className="px-2 py-1.5">{r.email}</td>
                        <td className="px-2 py-1.5 font-mono">{r.username}</td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon h-7 w-7"
                            title="Bu satırı çıkar"
                            aria-label={`${r.name || 'Satır'} satırını çıkar`}
                            disabled={stage === 'creating'}
                            onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {stage === 'creating' && (
            <div className="space-y-1" aria-live="polite">
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-indigo-600 transition-[width]" style={{ width: `${Math.round((progress / Math.max(1, valid.length)) * 100)}%` }} />
              </div>
              <div className="text-muted">Hesaplar açılıyor: {progress} / {valid.length}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          {created.length > 0 && (
            <div className="p-2.5 bg-warning-soft rounded-lg text-warning-fg flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                <strong>Şifreler sistemde saklanmaz</strong>, pencere kapanınca tekrar görüntülenemez. Kapatmadan önce Excel'e indirin, kopyalayın ya da SMS ile gönderin.
              </span>
            </div>
          )}
          {confirmClose && (
            <div className="p-2.5 bg-danger-soft rounded-lg text-danger-fg">Şifreleri henüz indirmediniz ya da kopyalamadınız. Yine de kapatmak için "Yine de Kapat"a basın.</div>
          )}
          {mailState !== 'idle' && (
            <div className="p-2.5 bg-surface-2 rounded-lg text-fg-2 flex items-center gap-2">
              {mailState === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{mailState === 'sending' ? 'Giriş bilgileri e-postayla gönderiliyor…' : mailNote}</span>
            </div>
          )}
          {smsNote && <div className={`p-2.5 rounded-lg ${smsNote.ok ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'}`}>{smsNote.text}</div>}

          {created.length > 0 && (
            <div className="border border-line rounded-xl overflow-auto max-h-[50vh]">
              <table className="w-full text-left text-xs" id="ogretmen-excel-sonuc">
                <thead className="bg-surface-2/80 text-muted sticky top-0">
                  <tr>
                    <th className="px-2 py-2">Öğretmen</th>
                    <th className="px-2 py-2">Kullanıcı adı</th>
                    <th className="px-2 py-2">Şifre</th>
                    <th className="px-2 py-2">Telefon</th>
                    <th className="px-2 py-2 text-right">İlet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {created.map((c) => (
                    <tr key={c.teacherId}>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold text-fg">{c.name}</div>
                        <div className="text-[11px] text-muted">{c.branch}</div>
                      </td>
                      <td className="px-2 py-1.5 font-mono font-bold text-brand-fg select-all">{c.username}</td>
                      <td className="px-2 py-1.5 font-mono font-bold text-amber-700 dark:text-amber-300 select-all">{c.password}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.phone || '—'}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="ui-btn ui-btn-secondary ui-btn-sm ui-btn-icon h-7 w-7"
                            title="Giriş bilgisini kopyala"
                            aria-label={`${c.name} giriş bilgisini kopyala`}
                            onClick={() => void copyText(credentialText(c), c.teacherId)}
                          >
                            {copied === c.teacherId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          {(
                            <button
                              type="button"
                              className="ui-btn ui-btn-secondary ui-btn-sm ui-btn-icon h-7 w-7"
                              title={c.phone ? 'SMS ile gönder' : 'Telefon yok'}
                              aria-label={`${c.name} bilgilerini SMS ile gönder`}
                              disabled={!c.phone || !!smsBusy}
                              onClick={() => void sendSms([c], c.teacherId)}
                            >
                              {smsBusy === c.teacherId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {failures.length > 0 && (
            <div className="p-2.5 bg-danger-soft rounded-lg text-danger-fg space-y-1">
              <div className="font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{failures.length} öğretmenin hesabı açılamadı:</span>
              </div>
              <ul className="list-disc pl-6 max-h-32 overflow-y-auto">
                {failures.map((f, i) => (
                  <li key={i}><strong>{f.name}</strong>: {f.error}</li>
                ))}
              </ul>
            </div>
          )}
          {notes.length > 0 && (
            <ul className="p-2.5 bg-warning-soft rounded-lg text-warning-fg list-disc pl-6 max-h-28 overflow-y-auto">
              {notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
};

export const TeacherExcelUploadModal: React.FC<TeacherExcelUploadModalProps> = ({ open, ...rest }) =>
  open ? <TeacherExcelUploadContent {...rest} /> : null;
