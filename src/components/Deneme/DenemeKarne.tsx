import React, { useEffect, useMemo, useState } from 'react';
import { useHistoryState } from '../../lib/useHistoryState';
import { Download, Mail, MessageCircle, Save } from 'lucide-react';
import { Segmented, cx } from '../ui/kit';
import type { ClassGroup, Student } from '../../types';
import { byUploadOrder, getExamsFull, getTarget, listResultsFor, setTarget, type DenemeExam, type DenemeResult } from '../../services/denemeService';
import { SCOPES, classKarneBlocks, compareKarneBlocks, pickScope, scopeLabel, studentKarneBlocks, dateTr, type ScopeKey } from '../../lib/deneme/karneModel';
import { downloadKarnePdf, karnePdfBase64, karnePdfBlob, safeFileName, type PdfBlock } from '../../lib/deneme/karnePdf';
import { callMail, describeMailResult } from '../../lib/mailApi';
import { fmtScore } from '../../lib/deneme/lgs';
import { ClassKarneView, CompareView, StudentKarneView } from './KarneViews';

// ============================================================================
// Karneler (Aşama 47): öğrenci, sınıf ve sınıflar arası karşılaştırma.
// Kapsam: son 3 / 5 / 10, tümü ya da tek tek seçilen denemeler.
// ============================================================================

type Mode = 'ogrenci' | 'sinif' | 'karsilastirma';

/** Karne PDF'ini paylaşır: telefonda doğrudan WhatsApp'a dosya olarak; olmazsa PDF iner ve WhatsApp mesajı açılır */
export async function shareKarneWhatsapp(blocks: PdfBlock[], footer: string, fileName: string, message: string, phone?: string) {
  const blob = await karnePdfBlob(blocks, footer);
  const file = new File([blob], `${safeFileName(fileName)}.pdf`, { type: 'application/pdf' });
  const nav: any = navigator;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: fileName, text: message });
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  // Bilgisayarda: PDF indirilir, WhatsApp mesajı açılır (dosyayı kullanıcı ekler)
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `9${digits}`;
  else if (digits.length === 10 && digits.startsWith('5')) digits = `90${digits}`;
  const wa = `https://wa.me/${digits.length >= 11 ? digits : ''}?text=${encodeURIComponent(message)}`;
  window.open(wa, '_blank', 'noopener');
  return 'downloaded';
}

// ----------------------------------------------------------------------------- Aşama 50: sınıfa toplu karne gönderme
// E-posta: tek tıkla sınıftaki bütün öğrencilere (her öğrenciye yalnızca kendi karnesi; adres sunucuda bulunur).
// WhatsApp: WhatsApp, uygulama dışından otomatik toplu gönderime izin vermez; bu yüzden sıra listesi hazırlanır ve
// her öğrenci için tek dokunuşla kendi karnesi açılır ("Sıradakini gönder" bir sonrakine geçer).
type QueueState = 'bekliyor' | 'gonderildi' | 'atlandi' | 'hata';

const TopluKarneGonder: React.FC<{ examIds: string[]; cls: ClassGroup; classStudents: Student[]; scope: ScopeKey }> = ({ examIds, cls, classStudents, scope }) => {
  const [loaded, setLoaded] = useState<{ exams: DenemeExam[]; results: DenemeResult[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmMail, setConfirmMail] = useState(false);
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const [queue, setQueue] = useState<Record<string, QueueState>>({});
  const [open, setOpen] = useState(false);
  const key = `${cls.id}|${examIds.join(',')}`;

  useEffect(() => {
    setLoaded(null);
    setQueue({});
    setNotice(null);
    setConfirmMail(false);
  }, [key]);

  const load = async () => {
    if (loaded) return loaded;
    setLoading(true);
    try {
      const [exams, results] = await Promise.all([getExamsFull(examIds), listResultsFor({ examIds, classId: cls.id })]);
      const v = { exams, results };
      setLoaded(v);
      return v;
    } finally {
      setLoading(false);
    }
  };

  const withResults = useMemo(() => {
    if (!loaded) return [] as Student[];
    const ids = new Set(loaded.results.map((r) => r.studentId));
    return classStudents.filter((s) => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [loaded, classStudents]);

  const build = async (s: Student, data: { exams: DenemeExam[]; results: DenemeResult[] }) => {
    let tg: number | null = null;
    try {
      tg = await getTarget(s.id);
    } catch {
      tg = null;
    }
    const rs = data.results.filter((r) => r.studentId === s.id);
    return {
      blocks: studentKarneBlocks({ studentName: s.name, className: s.className || cls.name, exams: data.exams, results: rs, target: tg, scopeLabel: scopeLabel(scope) }),
      footer: `${s.name} deneme karnesi`,
      file: `Deneme-Karnesi-${s.name}`,
      last: rs.slice().sort((a, b) => {
        const ea = data.exams.findIndex((e) => e.id === a.examId);
        const eb = data.exams.findIndex((e) => e.id === b.examId);
        return ea - eb;
      }).slice(-1)[0],
    };
  };

  const sendAllMail = async () => {
    if (busy) return;
    setBusy(true);
    setConfirmMail(false);
    setNotice(null);
    let sent = 0;
    let noEmail = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];
    try {
      const data = await load();
      const ids = new Set(data.results.map((r) => r.studentId));
      const list = classStudents.filter((s) => ids.has(s.id));
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        setProgress(`E-posta hazırlanıyor: ${i + 1}/${list.length} · ${s.name}`);
        try {
          const b = await build(s, data);
          const pdf = await karnePdfBase64(b.blocks, b.footer);
          const r = await callMail('deneme-karne', { studentId: s.id, pdf, title: `Deneme karnen (${scopeLabel(scope)})` });
          if (!r.ok) {
            failed++;
            if (r.error) errors.push(`${s.name}: ${r.error}`);
            if (r.notConfigured || r.authError) break;
          } else {
            sent += r.sent || 0;
            noEmail += r.noEmail || 0;
            skipped += r.skipped || 0;
            failed += r.failed || 0;
            if (r.notConfigured) {
              setNotice({ tone: 'warning', text: describeMailResult(r).text });
              return;
            }
          }
        } catch (e: any) {
          failed++;
          errors.push(`${s.name}: ${e?.message || 'hazırlanamadı'}`);
        }
      }
      const parts = [`${sent} öğrenciye karne e-postayla gönderildi`];
      if (skipped) parts.push(`${skipped} öğrenciye daha önce gönderilmişti`);
      if (noEmail) parts.push(`${noEmail} öğrencinin e-postası kayıtlı değil`);
      if (failed) parts.push(`${failed} gönderilemedi${errors[0] ? ` (${errors[0]})` : ''}`);
      setNotice({ tone: failed ? 'danger' : noEmail ? 'warning' : 'success', text: parts.join(' · ') + '.' });
    } catch (e: any) {
      setNotice({ tone: 'danger', text: e?.message || 'Gönderim yapılamadı.' });
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const sendWhatsapp = async (s: Student) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const data = await load();
      setProgress(`${s.name} karnesi hazırlanıyor…`);
      const b = await build(s, data);
      const lastExam = b.last ? data.exams.find((e) => e.id === b.last!.examId) : undefined;
      const msg = `${s.name} deneme karnesi (${scopeLabel(scope)}).${b.last && lastExam ? ` Son deneme: ${lastExam.name}, puan ${fmtScore(b.last.score)}.` : ''}`;
      const r = await shareKarneWhatsapp(b.blocks, b.footer, b.file, msg, s.phone);
      setQueue((q) => ({ ...q, [s.id]: r === 'cancelled' ? 'bekliyor' : 'gonderildi' }));
      if (r === 'downloaded') setNotice({ tone: 'success', text: `${s.name}: PDF indirildi ve WhatsApp açıldı; dosyayı mesaja ekleyip gönderin, sonra "Sıradakini gönder" deyin.` });
    } catch (e: any) {
      setQueue((q) => ({ ...q, [s.id]: 'hata' }));
      setNotice({ tone: 'danger', text: `${s.name}: ${e?.message || 'karne hazırlanamadı'}` });
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const nextInQueue = withResults.find((s) => (queue[s.id] || 'bekliyor') === 'bekliyor');
  const doneCount = withResults.filter((s) => queue[s.id] === 'gonderildi').length;

  return (
    <div className="rounded-2xl border border-brand/25 bg-brand-soft/40 p-3 space-y-2" id="karne-toplu">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-fg">Sınıfa toplu gönder: {cls.name}</span>
        <span className="text-[11px] text-muted">Her öğrenciye yalnızca kendi karnesi gider.</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {confirmMail ? (
            <>
              <span className="self-center text-xs font-semibold text-warning-fg">Sınıftaki bütün öğrencilere e-posta gönderilsin mi?</span>
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy} onClick={() => void sendAllMail()}>
                <Mail /> Evet, gönder
              </button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy} onClick={() => setConfirmMail(false)}>
                Vazgeç
              </button>
            </>
          ) : (
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setConfirmMail(true)}>
              <Mail /> Tümüne e-posta
            </button>
          )}
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            disabled={busy || loading}
            onClick={() => {
              setOpen((o) => !o);
              void load();
            }}
            aria-expanded={open}
          >
            <MessageCircle /> WhatsApp sırası
          </button>
        </div>
      </div>
      {progress && <p className="text-xs text-info-fg">{progress}</p>}
      {notice && (
        <p
          role="status"
          className={cx(
            'text-xs font-semibold rounded-xl px-3 py-2',
            notice.tone === 'success' && 'bg-success-soft text-success-fg',
            notice.tone === 'warning' && 'bg-warning-soft text-warning-fg',
            notice.tone === 'danger' && 'bg-danger-soft text-danger-fg'
          )}
        >
          {notice.text}
        </p>
      )}
      {open && (
        <div className="rounded-xl border border-line bg-surface">
          {loading ? (
            <p className="px-3 py-3 text-xs text-muted">Sonuçlar yükleniyor…</p>
          ) : !withResults.length ? (
            <p className="px-3 py-3 text-xs text-muted">Bu sınıfta seçilen denemelerde sonucu olan öğrenci yok.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                <span className="text-xs text-fg-2">
                  {doneCount} / {withResults.length} gönderildi
                </span>
                <button type="button" className="ui-btn ui-btn-primary ui-btn-sm ml-auto" disabled={busy || !nextInQueue} onClick={() => nextInQueue && void sendWhatsapp(nextInQueue)}>
                  <MessageCircle /> {nextInQueue ? `Sıradakini gönder: ${nextInQueue.name}` : 'Hepsi tamam'}
                </button>
              </div>
              <ul className="max-h-72 overflow-y-auto divide-y divide-line">
                {withResults.map((s) => {
                  const st = queue[s.id] || 'bekliyor';
                  return (
                    <li key={s.id} className={cx('flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs', st === 'gonderildi' && 'bg-success-soft/40')}>
                      <span className="font-semibold text-fg min-w-0 flex-1 truncate">{s.name}</span>
                      <span className={cx('ui-chip', s.phone ? 'ui-chip-neutral' : 'ui-chip-warning')}>{s.phone ? 'Telefon kayıtlı' : 'Telefon yok'}</span>
                      <span className={cx('ui-chip', st === 'gonderildi' ? 'ui-chip-success' : st === 'hata' ? 'ui-chip-danger' : st === 'atlandi' ? 'ui-chip-neutral' : 'ui-chip-info')}>
                        {st === 'gonderildi' ? 'Gönderildi' : st === 'hata' ? 'Hata' : st === 'atlandi' ? 'Atlandı' : 'Bekliyor'}
                      </span>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy} onClick={() => void sendWhatsapp(s)}>
                        Gönder
                      </button>
                      {st === 'bekliyor' && (
                        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy} onClick={() => setQueue((q) => ({ ...q, [s.id]: 'atlandi' }))}>
                          Atla
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="px-3 py-2 text-[11px] text-muted">
                Telefonda dosya doğrudan WhatsApp'a eklenir; bilgisayarda PDF iner ve öğrencinin WhatsApp sohbeti açılır, dosyayı sürükleyip gönderirsiniz. WhatsApp otomatik toplu gönderime izin vermediği için her öğrenci tek dokunuşla gönderilir.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const DenemeKarne: React.FC<{
  exams: DenemeExam[]; // özet liste (en yeni önce)
  students: Student[];
  classes: ClassGroup[];
}> = ({ exams, students, classes }) => {
  const [mode, setMode] = useHistoryState<Mode>('deneme.karne.mode', 'ogrenci'); // Aşama 52: geri tuşu
  const [scope, setScope] = useState<ScopeKey>('last5');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const [fullExams, setFullExams] = useState<DenemeExam[]>([]);
  const [results, setResults] = useState<DenemeResult[]>([]);
  const [target, setTargetState] = useState<number | null>(null);
  const [targetInput, setTargetInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailExamId, setDetailExamId] = useState(''); // Aşama 50: ayrıntılı karnesi gösterilen deneme

  const asc = useMemo(() => exams.slice().sort(byUploadOrder), [exams]); // Aşama 51: yükleniş sırası
  const scoped = useMemo(() => pickScope(asc, scope, (e) => picked.has(e.id)), [asc, scope, picked]);
  const scopedIds = scoped.map((e) => e.id).join(',');

  const classOptions = useMemo(() => classes.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true })), [classes]);
  const studentOptions = useMemo(
    () => students.filter((s) => !classId || s.classId === classId).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [students, classId]
  );
  const student = students.find((s) => s.id === studentId) || null;
  const cls = classes.find((c) => c.id === classId) || null;

  // Seçime göre veriler okunur
  useEffect(() => {
    let alive = true;
    setError(null);
    setNotice(null);
    const ids = scoped.map((e) => e.id);
    const need = mode === 'ogrenci' ? !!studentId : mode === 'sinif' ? !!classId : true;
    if (!need || !ids.length) {
      setResults([]);
      setFullExams([]);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const [ex, rs, tg] = await Promise.all([
          getExamsFull(ids),
          listResultsFor({ examIds: ids, studentId: mode === 'ogrenci' ? studentId : undefined, classId: mode === 'sinif' ? classId : undefined }),
          mode === 'ogrenci' ? getTarget(studentId) : Promise.resolve(null),
        ]);
        if (!alive) return;
        setFullExams(ex);
        setResults(rs);
        setTargetState(tg);
        setTargetInput(tg !== null ? String(tg).replace('.', ',') : '');
      } catch (e: any) {
        if (alive) setError(e?.message || 'Veriler yüklenemedi.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, studentId, classId, scopedIds]);

  const blocks = (): { blocks: PdfBlock[]; footer: string; file: string } | null => {
    const label = scopeLabel(scope);
    if (mode === 'ogrenci' && student) {
      return {
        blocks: studentKarneBlocks({ studentName: student.name, className: student.className || '', exams: fullExams, results, target, scopeLabel: label, detailExamId }),
        footer: `${student.name} deneme karnesi`,
        file: `Deneme-Karnesi-${student.name}`,
      };
    }
    if (mode === 'sinif' && cls) {
      return { blocks: classKarneBlocks({ className: cls.name, classId: cls.id, exams: fullExams, results, scopeLabel: label }), footer: `${cls.name} sınıf karnesi`, file: `Sinif-Karnesi-${cls.name}` };
    }
    if (mode === 'karsilastirma') return { blocks: compareKarneBlocks(fullExams, results, label), footer: 'Sınıflar arası karşılaştırma', file: 'Siniflar-Arasi-Karsilastirma' };
    return null;
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e: any) {
      setNotice({ tone: 'danger', text: e?.message || 'İşlem yapılamadı.' });
    } finally {
      setBusy(false);
    }
  };

  const onPdf = () =>
    run(async () => {
      const b = blocks();
      if (b) await downloadKarnePdf(b.blocks, b.footer, b.file);
    });

  const onMail = () =>
    run(async () => {
      const b = blocks();
      if (!b || !student) return;
      const pdf = await karnePdfBase64(b.blocks, b.footer);
      const r = await callMail('deneme-karne', { studentId: student.id, pdf, title: `Deneme karnen (${scopeLabel(scope)})` });
      const d = describeMailResult(r);
      setNotice({ tone: d.tone, text: d.text });
    });

  const onWhatsapp = () =>
    run(async () => {
      const b = blocks();
      if (!b) return;
      const lastExam = fullExams.filter((e) => results.some((r) => r.examId === e.id)).slice(-1)[0];
      const last = lastExam ? results.find((r) => r.examId === lastExam.id && (!student || r.studentId === student.id)) : undefined;
      const msg =
        mode === 'ogrenci' && student
          ? `${student.name} deneme karnesi (${scopeLabel(scope)}).${last ? ` Son deneme: ${lastExam?.name}, puan ${fmtScore(last.score)}.` : ''}`
          : `${b.footer} (${scopeLabel(scope)}).`;
      const r = await shareKarneWhatsapp(b.blocks, b.footer, b.file, msg, mode === 'ogrenci' ? student?.phone : undefined);
      if (r === 'downloaded') setNotice({ tone: 'success', text: 'PDF indirildi ve WhatsApp açıldı; indirilen dosyayı mesaja ekleyebilirsiniz.' });
    });

  const saveTarget = () =>
    run(async () => {
      if (!student) return;
      const raw = targetInput.trim().replace(',', '.');
      const v = raw ? Number(raw) : null;
      if (v !== null && (!Number.isFinite(v) || v < 100 || v > 500)) throw new Error('Hedef puan 100 ile 500 arasında olmalı.');
      await setTarget(student.id, v);
      setTargetState(v);
      setNotice({ tone: 'success', text: v === null ? 'Hedef puan kaldırıldı.' : 'Hedef puan kaydedildi.' });
    });

  const ready = mode === 'ogrenci' ? !!student : mode === 'sinif' ? !!cls : true;
  const hasData = results.length > 0 && fullExams.length > 0;

  return (
    <div className="space-y-4" id="deneme-karne">
      <div className="ui-card ui-card-pad space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={mode}
            onChange={(v) => setMode(v)}
            size="sm"
            items={[
              { value: 'ogrenci', label: 'Öğrenci karnesi' },
              { value: 'sinif', label: 'Sınıf karnesi' },
              { value: 'karsilastirma', label: 'Sınıflar arası' },
            ]}
          />
          <Segmented value={scope} onChange={(v) => setScope(v)} size="sm" items={SCOPES} />
        </div>
        {scope === 'custom' && (
          <div className="flex flex-wrap gap-1.5" aria-label="Denemeler">
            {asc.map((e) => {
              const on = picked.has(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((cur) => {
                      const n = new Set(cur);
                      if (on) n.delete(e.id);
                      else n.add(e.id);
                      return n;
                    })
                  }
                  className={cx('ui-chip cursor-pointer border', on ? 'ui-chip-brand border-brand/30' : 'ui-chip-neutral border-line')}
                >
                  {e.name} · {dateTr(e.examDate)}
                </button>
              );
            })}
          </div>
        )}
        {mode !== 'karsilastirma' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="ui-label" htmlFor="karne-class">Sınıf</label>
              <select
                id="karne-class"
                className="ui-input"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setStudentId('');
                }}
              >
                <option value="">{mode === 'sinif' ? 'Sınıf seçin' : 'Tüm sınıflar'}</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {mode === 'ogrenci' && (
              <div>
                <label className="ui-label" htmlFor="karne-student">Öğrenci</label>
                <select id="karne-student" className="ui-input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">Öğrenci seçin</option>
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {classId ? '' : ` — ${s.className || 'sınıfsız'}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        {ready && hasData && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy} onClick={() => void onPdf()}>
              <Download /> PDF indir
            </button>
            {mode === 'ogrenci' && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => void onMail()}>
                <Mail /> Öğrenciye e-posta
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => void onWhatsapp()}>
              <MessageCircle /> WhatsApp ile paylaş
            </button>
            {busy && <span className="text-xs text-muted">Hazırlanıyor…</span>}
          </div>
        )}
        {notice && (
          <p
            role="status"
            className={cx(
              'text-xs font-semibold rounded-xl px-3 py-2',
              notice.tone === 'success' && 'bg-success-soft text-success-fg',
              notice.tone === 'warning' && 'bg-warning-soft text-warning-fg',
              notice.tone === 'danger' && 'bg-danger-soft text-danger-fg'
            )}
          >
            {notice.text}
          </p>
        )}
        {mode === 'ogrenci' && cls && scoped.length > 0 && (
          <TopluKarneGonder examIds={scoped.map((e) => e.id)} cls={cls} classStudents={students.filter((s) => s.classId === cls.id)} scope={scope} />
        )}
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{error}</p>}
      {!ready ? (
        <p className="text-sm text-muted">{mode === 'ogrenci' ? 'Karnesini görmek için bir öğrenci seçin.' : 'Karnesini görmek için bir sınıf seçin.'}</p>
      ) : scoped.length === 0 ? (
        <p className="text-sm text-muted">Kapsamda deneme yok. {scope === 'custom' ? 'Yukarıdan deneme seçin.' : ''}</p>
      ) : loading ? (
        <p className="text-sm text-muted">Yükleniyor…</p>
      ) : !hasData ? (
        <p className="text-sm text-muted">Seçilen denemelerde sonuç bulunamadı.</p>
      ) : mode === 'ogrenci' ? (
        <StudentKarneView
          exams={fullExams}
          results={results}
          target={target}
          studentName={student?.name}
          className={student?.className || ''}
          detailExamId={detailExamId}
          onDetailExamChange={setDetailExamId}
          targetEditor={
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="ui-label" htmlFor="karne-target">Hedef puan</label>
                <input id="karne-target" className="ui-input w-32" inputMode="decimal" value={targetInput} placeholder="örn. 450" onChange={(e) => setTargetInput(e.target.value.replace(/[^\d.,]/g, '').slice(0, 7))} />
              </div>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => void saveTarget()}>
                <Save /> Hedefi kaydet
              </button>
              <span className="text-[11px] text-muted">Hedef öğrencinin kendi karnesinde de görünür. Silmek için kutuyu boşaltıp kaydedin.</span>
            </div>
          }
        />
      ) : mode === 'sinif' && cls ? (
        <ClassKarneView exams={fullExams} results={results} className={cls.name} />
      ) : (
        <CompareView exams={fullExams} results={results} />
      )}
    </div>
  );
};
