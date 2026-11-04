import React, { Suspense, useDeferredValue, useMemo, useState } from 'react';
import { KeyRound, Search, Send } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { lazyNamed } from '../../lib/lazyLoad';
import { matchTurkishSearch } from '../../utils/turkishSearch';
import type { Student, StudentCredential } from '../../types';

// ============================================================================
// Aşama 149: YÖNETİM › ÖĞRENCİLER — "Giriş Bilgisi" düğmesi
// Sınıf seçilir, öğrenciler işaretlenir (hepsi işaretli gelir) → 142'nin gönderim penceresi (yeni ilk şifre kutusu dahil).
// Liste, çağıran tarafın verdiği gönderilebilir öğrencilerdir (canSendCredentials); burada ek veri okunmaz.
// ============================================================================

const CredentialSendModal = lazyNamed(() => import('../Common/CredentialSendModal'), 'CredentialSendModal');
const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';

export const StudentCredentialPickModal: React.FC<{
  open: boolean;
  onClose: () => void;
  students: Student[];
  onNewCredentials?: (creds: StudentCredential[]) => void;
}> = ({ open, onClose, students, onNewCredentials }) => {
  const [classKey, setClassKey] = useState('');
  const [query, setQuery] = useState('');
  const dq = useDeferredValue(query);
  const [off, setOff] = useState<Set<string>>(() => new Set()); // işareti kaldırılanlar
  const [sendList, setSendList] = useState<Student[] | null>(null);

  // Sınıflar (bir kez; ada göre)
  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of students) m.set(s.classId || '', s.className || 'Sınıfı yok');
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr', { numeric: true }));
  }, [students]);

  const inClass = useMemo(
    () =>
      classKey === ''
        ? []
        : students
            .filter((s) => classKey === '*' || (s.classId || '') === classKey)
            .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [students, classKey]
  );
  const visible = useMemo(
    () => (dq.trim() ? inClass.filter((s) => matchTurkishSearch(s.name, dq) || String(s.studentNumber || '').includes(dq.trim())) : inClass),
    [inClass, dq]
  );
  const chosen = useMemo(() => inClass.filter((s) => !off.has(s.id)), [inClass, off]);
  const allOn = visible.length > 0 && visible.every((s) => !off.has(s.id));

  const toggle = (id: string) =>
    setOff((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setOff((p) => {
      const n = new Set(p);
      visible.forEach((s) => (allOn ? n.add(s.id) : n.delete(s.id)));
      return n;
    });

  return (
    <>
      <Modal
        open={open && !sendList}
        onClose={onClose}
        icon={KeyRound}
        title="Giriş bilgisi gönder"
        description="Sınıf seçin, öğrencileri işaretleyin"
        size="sm"
        id="ogrenci-giris-sec"
        footer={
          <>
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose}>
              Vazgeç
            </button>
            <button type="button" id="ogrenci-giris-sec-devam" className={cx(BTN, 'ui-btn-primary')} disabled={!chosen.length} onClick={() => setSendList(chosen)}>
              <Send className="w-3.5 h-3.5" /> Devam ({chosen.length})
            </button>
          </>
        }
      >
        <div className="space-y-2 text-xs text-fg-2">
          <select
            id="ogrenci-giris-sinif"
            className="ui-input h-8 w-full py-0 text-xs"
            value={classKey}
            onChange={(e) => {
              setClassKey(e.target.value);
              setOff(new Set());
              setQuery('');
            }}
          >
            <option value="">Sınıf seçiniz</option>
            <option value="*">Tüm sınıflar ({students.length})</option>
            {classes.map(([id, name]) => (
              <option key={id || 'yok'} value={id}>
                {name}
              </option>
            ))}
          </select>
          {classKey !== '' && (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
                  <input
                    className="ui-input h-8 w-full pl-8 text-xs"
                    placeholder="Öğrenci ara"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                    name="ogrenci-giris-ara"
                  />
                </div>
                <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={toggleAll} disabled={!visible.length} id="ogrenci-giris-tumu">
                  {allOn ? 'Hiçbirini' : 'Tümünü'}
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-line divide-y divide-line" id="ogrenci-giris-liste">
                {visible.length === 0 ? (
                  <p className="px-3 py-3 text-muted">Öğrenci bulunamadı.</p>
                ) : (
                  visible.map((s) => (
                    <label key={s.id} className="flex h-8 items-center gap-2 px-3 cursor-pointer hover:bg-surface-2">
                      <input type="checkbox" className="accent-indigo-600" checked={!off.has(s.id)} onChange={() => toggle(s.id)} />
                      <span className="truncate text-fg">{s.name}</span>
                      <span className="ml-auto shrink-0 text-muted">
                        {s.studentNumber}
                        {classKey === '*' && s.className ? ` · ${s.className}` : ''}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-muted">{chosen.length} öğrenci seçili.</p>
            </>
          )}
        </div>
      </Modal>
      {sendList && (
        <Suspense fallback={null}>
          <CredentialSendModal
            open
            onClose={() => {
              setSendList(null);
              onClose();
            }}
            students={sendList}
            allowReset
            onNewCredentials={onNewCredentials}
          />
        </Suspense>
      )}
    </>
  );
};

export default StudentCredentialPickModal;
