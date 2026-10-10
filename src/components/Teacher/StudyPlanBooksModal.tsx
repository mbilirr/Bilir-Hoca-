import React, { useMemo, useState } from 'react';
import { Check, Library, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { addBook, addBookForStudents, deleteBooks, renameBooks, type StudentBook } from '../../services/studyPlanService';
import { cx, Modal } from '../ui/kit';
import { FieldLabel, inputCls } from './FormParts';

// ============================================================================
// Kitap tanımlama penceresi — öğrenci ve sınıf görünümünün ortak penceresi
//  * Tek öğrenci: öğrencinin kitap kayıtları listelenir.
//  * Sınıf (birden çok öğrenci): aynı kitap (ad + ders) tek satırda birleşir, kaç öğrencide olduğu gösterilir;
//    ekleme / düzenleme / silme görünen öğrencilerin hepsine birlikte uygulanır.
//  * Her kitabın yanındaki kalem ile kitap adı yerinde düzenlenir; yanındaki "Ders" listesiyle kitabın dersi değiştirilir.
// ============================================================================

const ALL_SUBJECTS = 'Her ders';
const keyOf = (title: string, subject: string) => `${title.toLocaleLowerCase('tr-TR')}|${subject}`;
const byTitle = (a: StudentBook, b: StudentBook) => a.title.localeCompare(b.title, 'tr');

interface BookEntry {
  key: string;
  title: string;
  subject: string;
  rows: StudentBook[];
}

export const StudyPlanBooksModal: React.FC<{
  title: string;
  description?: React.ReactNode;
  studentIds: string[];
  books: StudentBook[];
  subjectOptions: string[];
  onChange: (b: StudentBook[]) => void;
  onClose: () => void;
}> = ({ title: modalTitle, description, studentIds, books, subjectOptions, onChange, onClose }) => {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const ids = useMemo(() => Array.from(new Set(studentIds)), [studentIds]);
  const multi = ids.length > 1;
  const idSet = useMemo(() => new Set(ids), [ids]);
  const visible = useMemo(() => books.filter((b) => idSet.has(b.studentId)), [books, idSet]);

  // Ders başlığına göre gruplanmış, aynı kitabı tek satırda toplayan liste
  const groups = useMemo(() => {
    const entries = new Map<string, BookEntry>();
    for (const b of visible) {
      const k = keyOf(b.title, b.subject);
      const e = entries.get(k);
      if (e) e.rows.push(b);
      else entries.set(k, { key: k, title: b.title, subject: b.subject, rows: [b] });
    }
    const m = new Map<string, BookEntry[]>();
    for (const e of entries.values()) {
      const g = e.subject || ALL_SUBJECTS;
      m.set(g, [...(m.get(g) || []), e]);
    }
    for (const list of m.values()) list.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [visible]);
  const entryCount = groups.reduce((n, [, list]) => n + list.length, 0);

  const reset = () => {
    setError(null);
    setNotice(null);
  };

  const add = async () => {
    if (!title.trim() || busy || !ids.length) return;
    setBusy(true);
    reset();
    try {
      if (!multi) {
        const b = await addBook(ids[0], title, subject, visible);
        onChange(books.some((x) => x.id === b.id) ? books : [...books, b].sort(byTitle));
      } else {
        const added = await addBookForStudents(ids, title, subject, books);
        if (added.length) onChange([...books, ...added.filter((a) => !books.some((x) => x.id === a.id))].sort(byTitle));
        else setNotice('Bu kitap görünen öğrencilerin hepsinde zaten kayıtlı.');
      }
      setTitle('');
    } catch (e: any) {
      setError(e?.message || 'Kitap eklenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: BookEntry) => {
    if (busy) return;
    setBusy(true);
    reset();
    try {
      const n = await deleteBooks(entry.rows.map((r) => r.id));
      if (n === 0) throw new Error('Bu kitabı silme yetkiniz yok.');
      const gone = new Set(entry.rows.map((r) => r.id));
      onChange(books.filter((x) => !gone.has(x.id)));
      setConfirmKey(null);
      if (editKey === entry.key) setEditKey(null);
    } catch (e: any) {
      setError(e?.message || 'Kitap silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (entry: BookEntry) => {
    reset();
    setConfirmKey(null);
    setEditKey(entry.key);
    setDraft(entry.title);
    setDraftSubject(entry.subject || '');
  };
  const cancelEdit = () => {
    setEditKey(null);
    setDraft('');
    setDraftSubject('');
  };
  // Ders listesi: tanımlı dersler + kitabın mevcut dersi (listede yoksa kaybolmasın)
  const subjectsFor = (current: string) => (current && !subjectOptions.includes(current) ? [current, ...subjectOptions] : subjectOptions);

  // Kitap adını ve/veya dersini kaydeder (sınıfta görünen öğrencilerin hepsine uygulanır)
  const applyChange = async (entry: BookEntry, nextTitle: string, nextSubject: string): Promise<boolean> => {
    setBusy(true);
    reset();
    try {
      const res = await renameBooks(entry.rows, nextTitle, books, nextSubject);
      const drop = new Set([...res.removedIds, ...res.books.map((b) => b.id)]);
      const merged = [...books.filter((x) => !drop.has(x.id)), ...res.books];
      const seen = new Set<string>();
      onChange(merged.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true))).sort(byTitle));
      return true;
    } catch (e: any) {
      setError(e?.message || 'Kitap güncellenemedi.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeSubject = async (entry: BookEntry, nextSubject: string) => {
    if (busy || nextSubject === (entry.subject || '')) return;
    if (await applyChange(entry, entry.title, nextSubject)) setNotice(`“${entry.title}” dersi ${nextSubject || ALL_SUBJECTS.toLocaleLowerCase('tr-TR')} olarak kaydedildi.`);
  };

  const saveEdit = async (entry: BookEntry) => {
    if (busy) return;
    const next = draft.trim().replace(/\s+/g, ' ');
    if (!next) {
      setError('Kitap adı boş olamaz.');
      return;
    }
    if (next === entry.title && draftSubject === (entry.subject || '')) {
      cancelEdit();
      return;
    }
    if (await applyChange(entry, next, draftSubject)) cancelEdit();
  };

  const iconBtn = 'inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <Modal
      open
      onClose={onClose}
      id="plan-books-modal"
      icon={Library}
      tone="info"
      title={modalTitle}
      description={description}
      footer={
        <button type="button" className="ui-btn ui-btn-primary" onClick={onClose}>
          Kapat
        </button>
      }
    >
      <div className="space-y-4">
        {multi && (
          <p className="flex items-start gap-2 rounded-xl bg-info-soft text-info-fg px-3 py-2 text-xs font-medium" id="plan-books-scope">
            <Users className="w-4 h-4 shrink-0 mt-px" />
            <span>
              Eklediğiniz, düzenlediğiniz ya da sildiğiniz kitap görünen <b>{ids.length} öğrencinin</b> hepsine uygulanır.
            </span>
          </p>
        )}
        <div className="grid sm:grid-cols-[1fr_12rem_auto] gap-2 items-end">
          <div>
            <FieldLabel htmlFor="book-title">Kitap adı</FieldLabel>
            <input
              id="book-title"
              type="text"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void add())}
              placeholder="Örn: Palme 8. Sınıf Matematik Soru Bankası"
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel htmlFor="book-subject" optional>
              Ders
            </FieldLabel>
            <select id="book-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls}>
              <option value="">{ALL_SUBJECTS}</option>
              {subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button type="button" id="book-add" className="ui-btn ui-btn-primary" disabled={busy || !title.trim() || !ids.length} onClick={add}>
            <Plus className="w-4 h-4" /> Ekle
          </button>
        </div>
        {error && (
          <div role="alert" id="plan-books-error" className="rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" id="plan-books-notice" className="rounded-xl bg-surface-2 border border-line text-fg-2 px-3 py-2 text-xs font-semibold">
            {notice}
          </div>
        )}
        {entryCount === 0 ? (
          <p className="text-xs text-muted">Henüz kitap yok. Görev eklerken yazdığınız kitap adları da buraya kaydedilir.</p>
        ) : (
          <div className="space-y-3" id="plan-books-list">
            {groups.map(([group, list]) => (
              <div key={group}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-subtle mb-1">{group}</p>
                <ul className="divide-y divide-line rounded-xl border border-line overflow-hidden">
                  {list.map((entry) => {
                    const editing = editKey === entry.key;
                    const confirming = confirmKey === entry.key;
                    const count = new Set(entry.rows.map((r) => r.studentId)).size;
                    return (
                      <li
                        key={entry.key}
                        data-book={entry.title}
                        className={cx('px-3 py-2 text-sm transition-colors', editing ? 'bg-brand-soft/50' : 'hover:bg-surface-2/60')}
                      >
                        {editing ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor="book-edit-input" className="sr-only">
                              Kitap adını düzenle
                            </label>
                            <input
                              id="book-edit-input"
                              type="text"
                              autoFocus
                              value={draft}
                              maxLength={160}
                              disabled={busy}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void saveEdit(entry);
                                } else if (e.key === 'Escape') {
                                  // Esc yalnızca düzenlemeyi kapatsın, pencereyi değil
                                  e.preventDefault();
                                  e.stopPropagation();
                                  cancelEdit();
                                }
                              }}
                              className={cx(inputCls, 'flex-1 min-w-[12rem] py-1.5')}
                            />
                            <label htmlFor="book-edit-subject" className="sr-only">
                              Kitabın dersi
                            </label>
                            <select
                              id="book-edit-subject"
                              value={draftSubject}
                              disabled={busy}
                              onChange={(e) => setDraftSubject(e.target.value)}
                              className={cx(inputCls, 'w-auto sm:w-40 py-1.5')}
                            >
                              <option value="">{ALL_SUBJECTS}</option>
                              {subjectsFor(entry.subject).map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                type="button"
                                id="book-edit-save"
                                className="ui-btn ui-btn-primary ui-btn-sm"
                                disabled={busy || !draft.trim()}
                                onClick={() => void saveEdit(entry)}
                              >
                                <Check className="w-4 h-4" /> Kaydet
                              </button>
                              <button type="button" id="book-edit-cancel" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={cancelEdit}>
                                <X className="w-4 h-4" /> Vazgeç
                              </button>
                            </div>
                          </div>
                        ) : confirming ? (
                          <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
                            <span className="text-xs font-semibold text-danger-fg">
                              “{entry.title}” {count} öğrencinin listesinden silinsin mi?
                            </span>
                            <span className="flex items-center gap-1.5">
                              <button type="button" id="book-delete-confirm" className="ui-btn ui-btn-danger ui-btn-sm" disabled={busy} onClick={() => void remove(entry)}>
                                <Trash2 className="w-4 h-4" /> Sil
                              </button>
                              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setConfirmKey(null)}>
                                Vazgeç
                              </button>
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 break-words font-medium text-fg" data-book-title>
                              {entry.title}
                            </span>
                            {multi && (
                              <span
                                className={cx(
                                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                                  count === ids.length ? 'bg-success-soft text-success-fg border-success/30' : 'bg-surface-2 text-muted border-line'
                                )}
                                title={`${ids.length} öğrenciden ${count} öğrencinin listesinde`}
                              >
                                {count}/{ids.length} öğrenci
                              </span>
                            )}
                            <span className="flex items-center gap-1 shrink-0">
                              <select
                                aria-label={`${entry.title} kitabının dersi`}
                                title="Ders"
                                data-book-subject
                                value={entry.subject || ''}
                                disabled={busy}
                                onChange={(e) => void changeSubject(entry, e.target.value)}
                                className="h-8 max-w-[7.5rem] sm:max-w-[10rem] rounded-lg border border-line bg-surface px-1.5 text-xs font-medium text-fg-2 cursor-pointer hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <option value="">{ALL_SUBJECTS}</option>
                                {subjectsFor(entry.subject).map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                aria-label={`${entry.title} kitabının adını düzenle`}
                                title="Adı düzenle"
                                data-book-edit
                                disabled={busy}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-fg transition-colors cursor-pointer hover:bg-brand-soft disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={() => startEdit(entry)}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                aria-label={`${entry.title} kitabını sil`}
                                title="Sil"
                                disabled={busy}
                                className={cx(iconBtn, 'hover:text-danger-fg hover:bg-danger-soft')}
                                onClick={() => (count > 1 ? (reset(), setEditKey(null), setConfirmKey(entry.key)) : void remove(entry))}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
