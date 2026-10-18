// ============================================================================
// Aşama 49 — EXCEL İLE MEVCUT ÖĞRENCİLERİ TOPLU GÜNCELLEME
// Excel'deki satırlar sistemdeki öğrencilerle eşleştirilir: önce okul numarası, numara yoksa / bulunamazsa
// ad soyad (yalnızca tek öğrenciyle eşleşiyorsa). Değişecek alanlar "eski → yeni" diye gösterilir;
// onaylanmadan hiçbir şey yazılmaz.
//   * Boş Excel hücresi hiçbir bilgiyi silmez.
//   * Yeni öğrenci eklenmez, sınıf açılmaz, şifre ve hesaplar değişmez.
//   * Okul numarası değişikliği öğrencinin giriş adını da değiştirdiği için ayrıca işaretlenmelidir.
// ============================================================================
import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, HelpCircle, RefreshCw, Upload, UserCheck } from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { dataService } from '../../services/dataService';
import { Modal, cx } from '../ui/kit';
import {
  STUDENT_COLUMNS,
  currentAcademicYear,
  emailIssue,
  extractStudentRows,
  matrixToRows,
  normalizeClassKey,
  normalizeTurkishPhone,
  parseClassName,
  trFold,
} from '../../lib/importNormalize';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  students: Student[];
  onDone?: (message: string) => void;
}

type Field = 'name' | 'classId' | 'studentNumber' | 'phone' | 'email';
const FIELD_LABEL: Record<Field, string> = {
  name: 'Ad soyad',
  classId: 'Sınıf',
  studentNumber: 'Okul no',
  phone: 'Telefon',
  email: 'E-posta',
};

interface Change {
  field: Field;
  from: string;
  to: string; // gösterilen yeni değer
  value: string; // yazılacak değer (sınıfta sınıf kimliği)
}

type Status = 'ok' | 'same' | 'check' | 'none' | 'dup';

interface Row {
  key: string;
  rowNumber: number;
  excelName: string;
  excelNumber: string;
  excelClass: string;
  student: Student | null;
  by: 'numara' | 'ad soyad' | '';
  status: Status;
  reason: string;
  changes: Change[]; // seçili alanlara göre
  notes: string[]; // uygulanamayan değerler (ör. sınıf sistemde yok)
}

// ----------------------------------------------------------------------------- yardımcılar
const nameKey = (s: string) =>
  trFold(s)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

function bigrams(s: string): string[] {
  const t = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** 0–1 arası ad benzerliği (kelime sırası ve Türkçe harf farkı önemsiz) */
function nameSimilarity(a: string, b: string): number {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x);
  const B = bigrams(y);
  const pool = new Map<string, number>();
  for (const g of B) pool.set(g, (pool.get(g) || 0) + 1);
  let hit = 0;
  for (const g of A) {
    const n = pool.get(g) || 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

const numKey = (s?: string | null) => String(s || '').trim().replace(/\s+/g, '').toLowerCase();

function classGradeBranch(c: ClassGroup): { grade?: number; branch?: string } {
  const p = parseClassName(c.name);
  let grade = p.grade;
  let branch = p.branch;
  if (!grade && c.gradeLevel) grade = parseClassName(c.gradeLevel).grade;
  if (!branch && c.branch && /^[A-Za-zÇĞİÖŞÜçğıöşü]$/.test(c.branch.replace(/şube/gi, '').trim())) {
    branch = c.branch.replace(/şube/gi, '').trim();
  }
  return { grade, branch: branch ? trFold(branch) : undefined };
}

/** Excel'deki sınıf yazısını yetkili olunan sınıflardan biriyle eşleştirir ("8-A", "8/A", "8A" aynı) */
function findClass(raw: string, classes: ClassGroup[]): { cls?: ClassGroup; error?: string } {
  const text = (raw || '').trim();
  if (!text) return {};
  const parsed = parseClassName(text);
  if (parsed.grade && !parsed.branch && !parsed.rest) return { error: `Sınıf "${text}": şube yazılmamış` };
  const key = normalizeClassKey(text);
  const exact = classes.filter((c) => normalizeClassKey(c.name) === key);
  if (exact.length) {
    const year = currentAcademicYear();
    return { cls: exact.find((c) => c.academicYear === year) || exact[0] };
  }
  if (parsed.grade && parsed.branch) {
    const branch = trFold(parsed.branch);
    const cands = classes.filter((c) => {
      const gb = classGradeBranch(c);
      if (gb.grade !== parsed.grade || gb.branch !== branch) return false;
      return !parsed.rest || !parseClassName(c.name).rest;
    });
    if (cands.length === 1) return { cls: cands[0] };
    if (cands.length > 1) return { error: `Sınıf "${text}" birden fazla sınıfla eşleşiyor; tam sınıf adını yazın` };
  }
  return { error: `Sınıf "${text}" sistemde yok (sınıf değiştirilmez)` };
}

const STATUS_INFO: Record<Status, { label: string; chip: string }> = {
  ok: { label: 'Güncellenecek', chip: 'ui-chip-success' },
  same: { label: 'Değişiklik yok', chip: 'ui-chip-neutral' },
  check: { label: 'Kontrol edin', chip: 'ui-chip-warning' },
  none: { label: 'Sistemde yok', chip: 'ui-chip-danger' },
  dup: { label: 'Tekrarlı satır', chip: 'ui-chip-danger' },
};

// ----------------------------------------------------------------------------- bileşen
export const ExcelStudentUpdateModal: React.FC<Props> = ({ isOpen, onClose, classes: allClasses, students: allStudents, onDone }) => {
  const classes = useMemo(() => allClasses.filter((c) => dataService.canManageClass(c)), [allClasses]);
  const students = useMemo(() => allStudents.filter((s) => dataService.canManageStudent(s)), [allStudents]);

  const [parsed, setParsed] = useState<Array<{ rowNumber: number; name: string; number: string; className: string; phone: string; email: string }>>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<Field, boolean>>({ name: true, classId: true, studentNumber: false, phone: true, email: true });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'ok' | 'check' | 'none'>('all');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: Array<{ name: string; error: string }> } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Eşleştirme ve değişiklikler (alan seçimleri değişince yeniden hesaplanır)
  const rows: Row[] = useMemo(() => {
    const byNum = new Map<string, Student[]>();
    for (const s of students) {
      const k = numKey(s.studentNumber);
      if (!k) continue;
      byNum.set(k, [...(byNum.get(k) || []), s]);
    }
    const allByNum = new Map<string, Student>();
    for (const s of allStudents) if (numKey(s.studentNumber)) allByNum.set(numKey(s.studentNumber), s);

    const base: Row[] = parsed.map((p, i) => {
      const r: Row = {
        key: `${p.rowNumber}-${i}`,
        rowNumber: p.rowNumber,
        excelName: p.name,
        excelNumber: p.number,
        excelClass: p.className,
        student: null,
        by: '',
        status: 'none',
        reason: '',
        changes: [],
        notes: [],
      };
      const num = numKey(p.number);
      const list = num ? byNum.get(num) || [] : [];
      if (list.length === 1) {
        const s = list[0];
        r.student = s;
        r.by = 'numara';
        const sim = p.name ? nameSimilarity(p.name, s.name) : 1;
        if (sim < 0.75) {
          r.status = 'check';
          r.reason = `Numara tuttu ama ad farklı (sistemde: ${s.name})`;
        } else r.status = 'ok';
      } else if (list.length > 1) {
        r.status = 'check';
        r.reason = 'Bu numarada birden fazla öğrenci var';
        const ranked = list.map((s) => ({ s, sim: nameSimilarity(p.name, s.name) })).sort((a, b) => b.sim - a.sim);
        r.student = ranked[0].s;
        r.by = 'numara';
      } else if (p.name) {
        const ranked = students
          .map((s) => ({ s, sim: nameSimilarity(p.name, s.name) }))
          .filter((x) => x.sim >= 0.9)
          .sort((a, b) => b.sim - a.sim);
        if (ranked.length === 1 || (ranked.length > 1 && ranked[0].sim === 1 && ranked[1].sim < 1)) {
          r.student = ranked[0].s;
          r.by = 'ad soyad';
          r.status = ranked[0].sim === 1 ? 'ok' : 'check';
          r.reason = ranked[0].sim === 1 ? (num ? 'Numara sistemde yok; ad soyadla bulundu' : 'Ad soyadla bulundu') : `Ad benziyor (sistemde: ${ranked[0].s.name})`;
        } else if (ranked.length > 1) {
          r.reason = `Bu adda birden fazla öğrenci var (${ranked
            .slice(0, 3)
            .map((x) => `${x.s.name} ${x.s.studentNumber || ''}`.trim())
            .join(', ')}); numara yazın`;
        } else {
          r.reason = num && allByNum.has(num) ? 'Bu öğrenci için yetkiniz yok' : 'Sistemde bulunamadı';
        }
      } else {
        r.reason = num ? 'Numara sistemde yok, ad yazılmamış' : 'Numara ve ad yok';
      }

      // Değişiklikler
      const s = r.student;
      if (s) {
        if (fields.name && p.name && nameKey(p.name) !== nameKey(s.name)) {
          const clean = p.name.trim().replace(/\s+/g, ' ');
          r.changes.push({ field: 'name', from: s.name, to: clean, value: clean });
        }
        if (fields.classId && p.className) {
          const m = findClass(p.className, classes);
          if (m.error) r.notes.push(m.error);
          else if (m.cls && m.cls.id !== s.classId) r.changes.push({ field: 'classId', from: s.className || '—', to: m.cls.name, value: m.cls.id });
        }
        if (fields.studentNumber && r.by === 'ad soyad' && num && num !== numKey(s.studentNumber)) {
          const clean = p.number.trim().replace(/\s+/g, '');
          const owner = allByNum.get(num);
          if (!/^[0-9A-Za-z_-]{1,20}$/.test(clean)) r.notes.push(`Okul no "${clean}" geçersiz (yalnızca rakam/harf)`);
          else if (owner && owner.id !== s.id) r.notes.push(`Okul no ${clean} şu an "${owner.name}" adlı öğrencide; değiştirilmez`);
          else r.changes.push({ field: 'studentNumber', from: s.studentNumber || '—', to: clean, value: clean });
        }
        if (fields.phone && p.phone) {
          const ph = normalizeTurkishPhone(p.phone);
          if (!ph.valid) r.notes.push(`Telefon "${p.phone}" geçersiz`);
          else if (ph.value !== (s.phone || '')) r.changes.push({ field: 'phone', from: s.phone || '—', to: ph.value, value: ph.value });
        }
        if (fields.email && p.email) {
          const issue = emailIssue(p.email);
          if (issue) r.notes.push(`E-posta: ${issue}`);
          else if (p.email.trim().toLowerCase() !== (s.email || '').trim().toLowerCase())
            r.changes.push({ field: 'email', from: s.email || '—', to: p.email.trim(), value: p.email.trim() });
        }
        if (r.status === 'ok' && !r.changes.length) r.status = 'same';
      }
      return r;
    });

    // Aynı öğrenci birden fazla satırla eşleştiyse hiçbirine dokunulmaz
    const count = new Map<string, number>();
    for (const r of base) if (r.student) count.set(r.student.id, (count.get(r.student.id) || 0) + 1);
    for (const r of base) {
      if (r.student && (count.get(r.student.id) || 0) > 1) {
        r.status = 'dup';
        r.reason = `"${r.student.name}" Excel'de birden fazla satırla eşleşti; satırları düzeltin`;
      }
    }
    return base;
  }, [parsed, students, allStudents, classes, fields]);

  const isOn = (r: Row) => (r.status === 'ok' || r.status === 'check') && r.changes.length > 0 && (selected[r.key] ?? r.status === 'ok');
  const toApply = rows.filter(isOn);
  const counts = {
    ok: rows.filter((r) => r.status === 'ok').length,
    same: rows.filter((r) => r.status === 'same').length,
    check: rows.filter((r) => r.status === 'check').length,
    none: rows.filter((r) => r.status === 'none' || r.status === 'dup').length,
  };
  const shown = rows.filter((r) =>
    filter === 'all' ? true : filter === 'ok' ? r.status === 'ok' : filter === 'check' ? r.status === 'check' : r.status === 'none' || r.status === 'dup'
  );

  if (!isOpen) return null;

  const reset = () => {
    setParsed([]);
    setFileName(null);
    setError(null);
    setSelected({});
    setResult(null);
    setProgress(null);
    setFilter('all');
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const readFile = (file: File) => {
    reset();
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
        const { headers, rows: sheetRows } = matrixToRows(matrix, STUDENT_COLUMNS);
        const list = extractStudentRows(headers, sheetRows)
          .map((f) => ({ rowNumber: f.rowNumber, name: f.fullName, number: f.studentNumber, className: f.className, phone: f.phone, email: f.email }))
          .filter((f) => f.name || f.number);
        if (!list.length) {
          setError('Dosyada öğrenci satırı bulunamadı. Başlık satırında "Öğrenci No" ve "Ad Soyad" (veya "Ad", "Soyad") sütunları olmalı.');
          return;
        }
        setParsed(list);
      } catch {
        setError('Dosya okunamadı. Geçerli bir Excel (.xlsx, .xls) veya CSV dosyası seçin.');
      }
    };
    reader.onerror = () => setError('Dosya okunamadı.');
    reader.readAsBinaryString(file);
  };

  // Mevcut listeyi indir: düzenleyip geri yüklemek için
  const downloadCurrent = () => {
    const data = [...students]
      .sort((a, b) => (a.className || '').localeCompare(b.className || '', 'tr', { numeric: true }) || a.name.localeCompare(b.name, 'tr'))
      .map((s) => ({ 'Öğrenci No': s.studentNumber || '', 'Ad Soyad': s.name, Sınıf: s.className || '', Telefon: s.phone || '', 'E-Posta': s.email || '' }));
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Öğrenci No': '', 'Ad Soyad': '', Sınıf: '', Telefon: '', 'E-Posta': '' }]);
    ws['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Öğrenciler');
    XLSX.writeFile(wb, 'Ogrenci_Listesi_Guncelleme.xlsx');
  };

  const apply = async () => {
    const list = toApply;
    if (!list.length) return;
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: list.length });
    let ok = 0;
    const failed: Array<{ name: string; error: string }> = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const s = r.student!;
      const upd: Partial<Student> = {};
      for (const c of r.changes) {
        if (c.field === 'classId') {
          const cls = classes.find((x) => x.id === c.value);
          upd.classId = c.value;
          if (cls) {
            upd.className = cls.name;
            if (cls.gradeLevel) upd.gradeLevel = cls.gradeLevel;
            if (cls.branch) upd.branch = cls.branch;
          }
        } else upd[c.field] = c.value;
      }
      try {
        await dataService.updateStudent(s.id, upd);
        ok++;
      } catch (e: any) {
        failed.push({ name: s.name, error: e?.message || 'Kaydedilemedi' });
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setBusy(false);
    setProgress(null);
    setResult({ ok, failed });
    setParsed([]);
    setSelected({});
    onDone?.(`${ok} öğrencinin bilgileri güncellendi.${failed.length ? ` ${failed.length} öğrenci güncellenemedi.` : ''}`);
  };

  const numberOn = fields.studentNumber;

  return (
    <Modal
      open={isOpen}
      onClose={close}
      closeOnBackdrop={false}
      size="full"
      icon={RefreshCw}
      tone="success"
      title="Excel ile Öğrenci Bilgilerini Güncelle"
      description="Sistemdeki öğrencilerin ad soyad, sınıf, telefon, e-posta ve okul numaralarını toplu günceller; yeni öğrenci eklemez"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-muted">
            {progress
              ? `Kaydediliyor… ${progress.done}/${progress.total}`
              : rows.length > 0 && (
                  <>
                    <strong>{rows.length}</strong> satır · <strong>{toApply.length}</strong> öğrenci güncellenecek
                  </>
                )}
          </span>
          <button type="button" onClick={close} disabled={busy} className="ui-btn ui-btn-secondary ui-btn-sm">
            {result ? 'Kapat' : 'İptal'}
          </button>
          {!result && (
            <button type="button" disabled={!toApply.length || busy} onClick={apply} className="ui-btn ui-btn-success ui-btn-sm">
              {busy ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-label="İşleniyor" />
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Seçilenleri Güncelle ({toApply.length})</span>
                </>
              )}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div role="alert" className="p-3 bg-danger-soft rounded-xl flex items-start gap-2 text-danger-fg text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className={cx('p-4 rounded-xl text-sm space-y-2', result.failed.length ? 'bg-warning-soft text-warning-fg' : 'bg-success-soft text-success-fg')}>
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              {result.ok} öğrencinin bilgileri güncellendi.
            </p>
            {result.failed.length > 0 && (
              <ul className="list-disc list-inside text-xs space-y-0.5 text-fg-2">
                {result.failed.map((f, i) => (
                  <li key={i}>
                    <strong>{f.name}</strong>: {f.error}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={reset} className="ui-btn ui-btn-secondary ui-btn-sm">
              <Upload className="w-3.5 h-3.5" />
              Başka dosya yükle
            </button>
          </div>
        )}

        {!result && (
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-xs text-muted max-w-2xl">
                Önce mevcut listeyi indirip Excel'de düzeltebilir ya da e-Okul listesini doğrudan yükleyebilirsiniz. Öğrenciler okul numarasıyla,
                numara yoksa ad soyadla bulunur.
              </p>
              <button type="button" onClick={downloadCurrent} className="ui-btn ui-btn-ghost ui-btn-sm shrink-0" title="Yetkili olduğunuz öğrencilerin listesini Excel olarak indirin">
                <Download className="w-3.5 h-3.5 text-success-fg" />
                Mevcut listeyi indir (.xlsx)
              </button>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) readFile(e.dataTransfer.files[0]);
              }}
              onClick={() => fileRef.current?.click()}
              className={cx(
                'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
                dragOver ? 'border-brand bg-brand-soft' : 'border-line-strong hover:border-brand bg-surface-2/40'
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) readFile(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              <div className="w-14 h-14 bg-success-soft rounded-2xl flex items-center justify-center mx-auto mb-3 text-success-fg">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <p className="text-base font-semibold text-fg mb-3">{fileName || 'Excel (.xlsx, .xls) veya CSV dosyanızı buraya sürükleyin'}</p>
              <span className="ui-btn ui-btn-secondary ui-btn-sm pointer-events-none">
                <Upload className="w-3.5 h-3.5" />
                <span>Dosya Seç</span>
              </span>
            </div>
          </>
        )}

        {!result && rows.length > 0 && (
          <div className="p-4 bg-surface-2/60 rounded-xl border border-line space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span className="font-semibold text-fg">Güncellenecek bilgiler:</span>
              {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
                <label key={f} className="flex items-center gap-1.5 cursor-pointer text-fg-2 hover:text-fg">
                  <input
                    type="checkbox"
                    checked={fields[f]}
                    onChange={(e) => setFields((m) => ({ ...m, [f]: e.target.checked }))}
                    className="rounded border-line bg-surface"
                  />
                  {FIELD_LABEL[f]}
                </label>
              ))}
            </div>
            {numberOn && (
              <p className="p-2.5 bg-warning-soft rounded-lg text-[11px] text-warning-fg">
                Okul numarası öğrencinin <strong>giriş adıdır</strong>. Değişen öğrenciler bundan sonra yeni numarayla giriş yapar; şifreleri değişmez.
                Numara yalnızca ad soyadla bulunan öğrencilerde değiştirilir.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['all', `Tümü (${rows.length})`],
                  ['ok', `Güncellenecek (${counts.ok})`],
                  ['check', `Kontrol edin (${counts.check})`],
                  ['none', `Bulunamayan (${counts.none})`],
                ] as Array<[typeof filter, string]>
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilter(v)}
                  className={cx('ui-btn ui-btn-sm', filter === v ? 'ui-btn-primary' : 'ui-btn-secondary')}
                  aria-pressed={filter === v}
                >
                  {label}
                </button>
              ))}
              {counts.same > 0 && <span className="text-[11px] text-muted">{counts.same} öğrencide değişiklik yok.</span>}
            </div>
          </div>
        )}

        {!result && rows.length > 0 && (
          <div className="border border-line rounded-xl overflow-auto max-h-[28rem]">
            <table className="w-full text-left text-xs text-fg-2">
              <thead className="bg-surface-2 text-muted sticky top-0 uppercase tracking-wider font-semibold z-10">
                <tr>
                  <th className="px-3 py-3 w-10 text-center">Seç</th>
                  <th className="px-3 py-3">Satır</th>
                  <th className="px-3 py-3">Excel</th>
                  <th className="px-3 py-3">Sistemdeki öğrenci</th>
                  <th className="px-3 py-3 min-w-[260px]">Değişiklikler</th>
                  <th className="px-3 py-3 text-center">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {shown.map((r) => {
                  const canPick = (r.status === 'ok' || r.status === 'check') && r.changes.length > 0;
                  const on = isOn(r);
                  return (
                    <tr
                      key={r.key}
                      className={cx(
                        r.status === 'check' && 'bg-warning-soft/40',
                        (r.status === 'none' || r.status === 'dup') && 'bg-danger-soft/40',
                        on && r.status === 'ok' && 'bg-success-soft/30'
                      )}
                    >
                      <td className="px-3 py-2 text-center align-top">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!canPick || busy}
                          onChange={(e) => setSelected((m) => ({ ...m, [r.key]: e.target.checked }))}
                          aria-label={`${r.rowNumber}. satırı güncelle`}
                          className="rounded border-line bg-surface"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-muted align-top">{r.rowNumber}</td>
                      <td className="px-3 py-2 align-top">
                        <p className="text-fg font-medium">{r.excelName || '—'}</p>
                        <p className="text-[11px] text-muted">{[r.excelNumber && `No ${r.excelNumber}`, r.excelClass].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {r.student ? (
                          <>
                            <p className="text-fg font-medium flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 text-success-fg shrink-0" />
                              {r.student.name}
                            </p>
                            <p className="text-[11px] text-muted">
                              {[r.student.studentNumber && `No ${r.student.studentNumber}`, r.student.className, r.by && `${r.by} ile bulundu`].filter(Boolean).join(' · ')}
                            </p>
                          </>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top space-y-0.5">
                        {r.changes.map((c) => (
                          <p key={c.field}>
                            <span className="text-muted">{FIELD_LABEL[c.field]}:</span> <span className="line-through text-subtle">{c.from}</span> →{' '}
                            <strong className="text-fg">{c.to}</strong>
                          </p>
                        ))}
                        {r.notes.map((n, i) => (
                          <p key={i} className="text-[11px] text-warning-fg">
                            {n}
                          </p>
                        ))}
                        {!r.changes.length && !r.notes.length && r.student && <span className="text-subtle">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center align-top min-w-[150px]">
                        <span className={cx('ui-chip', STATUS_INFO[r.status].chip)}>{STATUS_INFO[r.status].label}</span>
                        {r.reason && <p className="text-[11px] text-muted mt-1 text-left">{r.reason}</p>}
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted">
                      Bu filtrede satır yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!result && (
          <div className="bg-surface-2/50 p-4 rounded-xl border border-line text-xs text-muted space-y-2">
            <div className="flex items-center gap-1.5 text-brand-fg font-semibold">
              <HelpCircle className="w-4 h-4" />
              <span>Nasıl çalışır?</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                Sütunlar: <strong>Öğrenci No</strong>, <strong>Ad Soyad</strong> (ya da <strong>Ad</strong> + <strong>Soyad</strong>), <strong>Sınıf</strong>,{' '}
                <strong>Telefon</strong>, <strong>E-Posta</strong>. Hepsi zorunlu değil; yalnızca dosyada olan bilgiler güncellenir.
              </li>
              <li>
                <strong>Boş hücre hiçbir bilgiyi silmez.</strong> Yalnızca büyük/küçük harf farkı olan adlar değişmiş sayılmaz.
              </li>
              <li>Sınıf, sistemdeki sınıflardan biriyle eşleşmelidir (8/A, 8-A, 8A aynıdır). Yeni sınıf açılmaz.</li>
              <li>
                "Kontrol edin" satırları kendiliğinden seçilmez. Örneğin numara tutup ad farklıysa, gözden geçirip kutuyu siz işaretlersiniz.
              </li>
              <li>Yeni öğrenci eklenmez; şifreler, deneme sonuçları ve diğer kayıtlar değişmez.</li>
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ExcelStudentUpdateModal;
