import React, { useEffect, useMemo, useState } from 'react';
import { Download, Mail, MessageCircle, Save } from 'lucide-react';
import { Segmented, cx } from '../ui/kit';
import type { ClassGroup, Student } from '../../types';
import { getExamsFull, getTarget, listResultsFor, setTarget, type DenemeExam, type DenemeResult } from '../../services/denemeService';
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

export const DenemeKarne: React.FC<{
  exams: DenemeExam[]; // özet liste (en yeni önce)
  students: Student[];
  classes: ClassGroup[];
}> = ({ exams, students, classes }) => {
  const [mode, setMode] = useState<Mode>('ogrenci');
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

  const asc = useMemo(() => exams.slice().sort((a, b) => (a.examDate || '').localeCompare(b.examDate || '') || a.createdAt.localeCompare(b.createdAt)), [exams]);
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
        blocks: studentKarneBlocks({ studentName: student.name, className: student.className || '', exams: fullExams, results, target, scopeLabel: label }),
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
