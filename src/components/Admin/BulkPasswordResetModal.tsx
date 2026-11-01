import React, { useMemo, useState } from 'react';
import { KeyRound, AlertTriangle, Search } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { ClassGroup, Student, StudentCredential } from '../../types';
import { Modal, cx } from '../ui/kit';
import { matchTurkishSearch } from '../../utils/turkishSearch';
import { StudentWelcomeCredentialsModal } from '../Teacher/StudentWelcomeCredentialsModal';

// ============================================================================
// Aşama 131: TOPLU ŞİFRE YENİLEME
// Seçilen sınıftaki öğrencilerin tamamına (veya işaretlenen öğrencilere) yeni ilk şifre verir.
// Şifresini kendisi değiştirmiş öğrenciler de dahildir. Hesabı olmayan öğrencinin hesabı açılır.
// Var olan dataService.setStudentPassword kullanılır: ilk şifre listesine (initial_credentials)
// tek tek şifre yenilemeyle aynı yoldan yazılır. Sonuç, var olan giriş bilgileri penceresinde
// gösterilir (Excel indir / kopyala / kart yazdır).
// Hız: liste yalnız seçili sınıf için çizilir; sunucuya aynı anda en çok 3 istek gider.
// ============================================================================

const PARALLEL = 3;

type Props = {
  open: boolean;
  onClose: () => void;
  students: Student[]; // yöneticinin görebildiği öğrenciler (UserCredentialsExport süzer)
  classes: ClassGroup[];
  initialClassId?: string; // Excel bölümünde seçili sınıf varsa onunla açılır
};

const sortStudents = (a: Student, b: Student) =>
  (a.studentNumber || '').localeCompare(b.studentNumber || '', 'tr', { numeric: true }) || a.name.localeCompare(b.name, 'tr');

const blockReason = (s: Student): string | null => {
  if (!(s.studentNumber || '').trim()) return 'Öğrenci no yok';
  if (!dataService.canManageStudent(s)) return 'Yetki yok';
  return null;
};

const BulkPasswordResetContent: React.FC<Omit<Props, 'open'>> = ({ onClose, students, classes, initialClassId }) => {
  const [classId, setClassId] = useState<string>(() =>
    initialClassId && classes.some((c) => c.id === initialClassId) ? initialClassId : classes[0]?.id || ''
  );
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [errorText, setErrorText] = useState('');
  const [result, setResult] = useState<StudentCredential[] | null>(null);

  // Seçili sınıfın öğrencileri (bir kez sıralanır)
  const classStudents = useMemo(
    () => students.filter((s) => s.classId === classId).sort(sortStudents),
    [students, classId]
  );
  const visible = useMemo(
    () =>
      query.trim()
        ? classStudents.filter((s) => matchTurkishSearch(s.name, query) || matchTurkishSearch(s.studentNumber, query))
        : classStudents,
    [classStudents, query]
  );
  const eligibleVisible = useMemo(() => visible.filter((s) => !blockReason(s)), [visible]);
  const allVisibleSelected = eligibleVisible.length > 0 && eligibleVisible.every((s) => selected.has(s.id));

  const changeClass = (id: string) => {
    setClassId(id);
    setSelected(new Set());
    setQuery('');
    setConfirm(false);
    setErrorText('');
  };

  const toggle = (id: string) => {
    setConfirm(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setConfirm(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) eligibleVisible.forEach((s) => next.delete(s.id));
      else eligibleVisible.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const run = async () => {
    if (busy || selected.size === 0) return;
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    setBusy(true);
    setErrorText('');
    const targets = classStudents.filter((s) => selected.has(s.id) && !blockReason(s));
    const done: StudentCredential[] = [];
    const failed: string[] = [];
    let next = 0;
    let finished = 0;
    setProgress(`Şifreler yenileniyor (0/${targets.length})…`);
    const worker = async () => {
      while (next < targets.length) {
        const s = targets[next++];
        try {
          done.push(await dataService.setStudentPassword(s.id));
        } catch (e: any) {
          failed.push(`${s.name}: ${e?.message || 'Şifre verilemedi.'}`);
        }
        finished++;
        setProgress(`Şifreler yenileniyor (${finished}/${targets.length})…`);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, targets.length) }, worker));
    } finally {
      setBusy(false);
      setProgress('');
    }
    // Sonuç listesi sınıftaki sıraya göre
    const order = new Map(targets.map((s, i) => [s.id, i]));
    done.sort((a, b) => (order.get(a.student.id) ?? 0) - (order.get(b.student.id) ?? 0));
    if (failed.length) setErrorText(`${failed.length} öğrencide şifre yenilenemedi. ${failed.join(' · ')}`);
    if (done.length) {
      setSelected(new Set());
      setResult(done);
    }
  };

  // Sonuç penceresi açıkken bu pencere gizlenir (şifreler kaybolmasın diye kapatma uyarısı o pencerededir)
  if (result) {
    return (
      <StudentWelcomeCredentialsModal
        isOpen
        onClose={() => setResult(null)}
        credentials={result}
        title="Yenilenen Giriş Bilgileri"
      />
    );
  }

  const footer = (
    <>
      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose} disabled={busy}>
        Kapat
      </button>
      <button
        type="button"
        className={cx('ui-btn ui-btn-sm', confirm ? 'ui-btn-danger' : 'ui-btn-primary')}
        onClick={run}
        disabled={busy || selected.size === 0}
        id="bulk-password-reset-run"
      >
        <KeyRound className="w-3.5 h-3.5" />
        {busy ? 'Yenileniyor…' : confirm ? 'Onaylıyorum, yenile' : `Şifreleri yenile (${selected.size})`}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      closeOnBackdrop={false}
      icon={KeyRound}
      tone="warning"
      size="sm"
      title="Toplu Şifre Yenile"
      description="Seçilen öğrencilere yeni ilk giriş şifresi verilir"
      footer={footer}
      id="bulk-password-reset-modal"
    >
      <div className="space-y-2.5 text-xs">
        <div className="flex items-center gap-2">
          <select
            className="ui-input h-8 py-1 px-2.5 text-xs rounded-lg flex-1 min-w-0"
            value={classId}
            onChange={(e) => changeClass(e.target.value)}
            aria-label="Sınıf seçimi"
            disabled={busy}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-muted absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              className="ui-input h-8 py-1 pr-2.5 pl-7 text-xs rounded-lg w-full"
              placeholder="Ad veya no ara"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Öğrenci ara"
              disabled={busy}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-1.5 text-fg cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={busy || !eligibleVisible.length} />
            Tümünü seç ({eligibleVisible.length})
          </label>
          <span className="text-muted">{selected.size} öğrenci seçildi</span>
        </div>

        <div className="border border-line rounded-xl max-h-64 overflow-y-auto divide-y divide-line" role="list">
          {visible.length === 0 && <p className="px-3 py-3 text-muted text-center">Bu sınıfta öğrenci yok.</p>}
          {visible.map((s) => {
            const reason = blockReason(s);
            return (
              <label
                key={s.id}
                role="listitem"
                className={cx('flex items-center gap-2 px-3 py-1.5', reason ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-2/60')}
              >
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 shrink-0"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  disabled={busy || !!reason}
                />
                <span className="font-mono text-muted w-14 shrink-0 truncate">{s.studentNumber || '-'}</span>
                <span className="flex-1 min-w-0 truncate text-fg">{s.name}</span>
                {reason ? (
                  <span className="text-[11px] text-danger-fg shrink-0">{reason}</span>
                ) : !s.auth_user_id ? (
                  <span className="text-[11px] text-muted shrink-0">Hesap açılacak</span>
                ) : null}
              </label>
            );
          })}
        </div>

        {confirm && (
          <div className="flex items-start gap-2 rounded-xl bg-warning-soft text-warning-fg px-3 py-2" role="alert">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {selected.size} öğrencinin şifresi değişecek; şifresini kendisi değiştirmiş öğrenciler de eski şifreleriyle giriş
              yapamayacak ve ilk girişte yeni şifre belirleyecek. Onaylıyorsanız düğmeye tekrar basın.
            </span>
          </div>
        )}
        {progress && <p className="text-muted" role="status">{progress}</p>}
        {errorText && (
          <p className="text-danger-fg font-semibold flex items-start gap-1.5" role="alert">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{errorText}</span>
          </p>
        )}
      </div>
    </Modal>
  );
};

export const BulkPasswordResetModal: React.FC<Props> = ({ open, ...rest }) =>
  open ? <BulkPasswordResetContent {...rest} /> : null;
