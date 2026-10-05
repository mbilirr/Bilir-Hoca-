import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, Pencil, Trash2, Save, X, Mail, Phone, AlertCircle, Eye, ChevronDown, Search } from 'lucide-react';
import { dataService, type EtutTeacherRow } from '../../services/dataService';
import type { Teacher } from '../../types';
import { Modal, Segmented, cx } from '../ui/kit';
import { ALL_SUBJECTS, ORTAOKUL_SUBJECTS, LISE_SUBJECTS, subjectsForBranch } from '../../lib/subjects';
import { inputCls, chipCls, FieldLabel } from './FormParts';

// ============================================================================
// Etüt öğretmenleri (yalnızca yönetici) — Aşama 9, düzen Aşama 12
//  * Dış öğretmenler (hesabı olmayan): ad, ders(ler), e-posta, telefon — ders ders açılır bölümlerde
//  * Kayıtlı öğretmenler: branş branş açılır bölümlerde; ek ders, e-posta eklenebilir veya listeden gizlenebilir
//  * Ders seçerken önce Ortaokul / Lise seçilir, yalnızca o kademenin dersleri görünür
// Bu liste veritabanında tutulur; tüm cihazlarda ve tüm öğretmenlerde aynıdır.
// ============================================================================

interface Draft {
  id?: string;
  teacherId?: string | null;
  name: string;
  subjects: string[];
  email: string;
  phone: string;
  active: boolean;
}
type Level = 'Ortaokul' | 'Lise';
const EMPTY: Draft = { name: '', subjects: [], email: '', phone: '', active: true };
const HIDDEN = new Set(['Genel', 'Rehberlik']);
const LEVEL_SUBJECTS: Record<Level, string[]> = {
  Ortaokul: ORTAOKUL_SUBJECTS.filter((s) => !HIDDEN.has(s)),
  Lise: LISE_SUBJECTS.filter((s) => !HIDDEN.has(s)),
};
const LISE_ONLY = new Set(LEVEL_SUBJECTS.Lise.filter((s) => !LEVEL_SUBJECTS.Ortaokul.includes(s)));
const SUBJECT_ORDER = ALL_SUBJECTS;
const NO_SUBJECT = 'Ders seçilmemiş';

const levelFor = (subjects: string[]): Level => (subjects.some((s) => LISE_ONLY.has(s)) ? 'Lise' : 'Ortaokul');
const orderOf = (s: string) => {
  const i = SUBJECT_ORDER.indexOf(s);
  return i === -1 ? 999 : i;
};
const trIncludes = (text: string, q: string) => text.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR'));

// Açılıp kapanan bölüm
const Group: React.FC<{ id: string; title: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({
  id,
  title,
  count,
  open,
  onToggle,
  children,
}) => (
  <div className="rounded-xl border border-line overflow-hidden" data-group={id}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-testid="et-group-toggle"
      className={cx('w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer', open ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2')}
    >
      <span className="flex-1 text-sm font-semibold text-fg">{title}</span>
      <span className="text-[11px] font-semibold px-1.5 py-px rounded-full bg-surface-3 text-muted">{count}</span>
      <ChevronDown className={cx('w-4 h-4 text-muted transition-transform', open && 'rotate-180')} />
    </button>
    {open && <ul className="divide-y divide-line border-t border-line">{children}</ul>}
  </div>
);

export const EtutTeacherManagerModal: React.FC<{ open: boolean; onClose: () => void; onChanged: () => void }> = ({ open, onClose, onChanged }) => {
  const [rows, setRows] = useState<EtutTeacherRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [level, setLevel] = useState<Level>('Ortaokul');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const teachers: Teacher[] = useMemo(() => (open ? dataService.getTeachers().filter((t) => t.status !== 'pending' && t.status !== 'rejected') : []), [open]);

  const load = () => {
    setError(null);
    dataService
      .listEtutTeacherRows()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError(e.message);
      });
  };
  useEffect(() => {
    if (open) load();
    if (!open) {
      setDraft(null);
      setQuery('');
    }
  }, [open]);

  const startDraft = (d: Draft, baseSubjects: string[] = []) => {
    setDraft(d);
    setLevel(levelFor([...d.subjects, ...baseSubjects]));
    setError(null);
  };

  const external = (rows || []).filter((r) => !r.teacherId);
  const rowFor = (t: Teacher) => (rows || []).find((r) => r.teacherId === t.id);
  const q = query.trim();

  // Dış öğretmenler ders ders (birden çok dersi olan her dersin altında görünür)
  const externalGroups = useMemo(() => {
    const map = new Map<string, EtutTeacherRow[]>();
    for (const r of external) {
      if (q && !trIncludes(r.name, q)) continue;
      const keys = r.subjects.length ? r.subjects : [NO_SUBJECT];
      for (const k of keys) map.set(k, [...(map.get(k) || []), r]);
    }
    return [...map.entries()]
      .map(([subject, list]) => ({ subject, list: list.sort((a, b) => a.name.localeCompare(b.name, 'tr')) }))
      .sort((a, b) => orderOf(a.subject) - orderOf(b.subject) || a.subject.localeCompare(b.subject, 'tr'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q]);

  // Kayıtlı öğretmenler: hepsi tek açılır bölümde (ada göre)
  const systemList = useMemo(
    () => teachers.filter((t) => !q || trIncludes(t.name, q)).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [teachers, q]
  );

  const isOpen = (key: string) => (q ? true : !!openGroups[key]);
  const toggle = (key: string) => setOpenGroups((g) => ({ ...g, [key]: !g[key] }));

  const save = async () => {
    if (!draft) return;
    setError(null);
    if (draft.name.trim().length < 2) return setError('Öğretmen adını yazın.');
    if (draft.subjects.length === 0 && !draft.teacherId) return setError('En az bir ders seçin.');
    if (draft.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) return setError('E-posta adresi geçersiz.');
    setSaving(true);
    try {
      await dataService.saveEtutTeacherRow({ ...draft, name: draft.name, subjects: draft.subjects } as any);
      setNotice(draft.id ? 'Öğretmen güncellendi.' : 'Öğretmen eklendi.');
      setTimeout(() => setNotice(null), 2500);
      // Kaydedilen öğretmenin ders bölümleri açık gelsin
      setOpenGroups((g) => {
        const next = { ...g };
        for (const s of draft.subjects) next[`ext:${s}`] = true;
        return next;
      });
      setDraft(null);
      load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (r: EtutTeacherRow) => {
    setError(null);
    try {
      await dataService.deleteEtutTeacherRow(r.id);
      load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const toggleSystemActive = async (t: Teacher) => {
    const r = rowFor(t);
    setError(null);
    try {
      await dataService.saveEtutTeacherRow({
        id: r?.id,
        teacherId: t.id,
        name: t.name,
        subjects: r?.subjects || [],
        email: r?.email || '',
        phone: r?.phone || '',
        active: r ? !r.active : false,
      });
      load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const otherLevelSelected = draft ? draft.subjects.filter((s) => !LEVEL_SUBJECTS[level].includes(s)) : [];

  const editor = draft && (
    <div className="rounded-xl border border-brand/40 bg-brand-soft/40 p-3 space-y-3" id="etut-teacher-editor">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="et-name">Ad soyad</FieldLabel>
          <input id="et-name" value={draft.name} disabled={!!draft.teacherId} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <FieldLabel htmlFor="et-email" optional>
            E-posta (etüt bilgisi gönderilir)
          </FieldLabel>
          <input id="et-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} placeholder="ornek@gmail.com" />
        </div>
        <div>
          <FieldLabel htmlFor="et-phone" optional>
            Telefon
          </FieldLabel>
          <input id="et-phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className={inputCls} placeholder="05xx xxx xx xx" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FieldLabel>{draft.teacherId ? 'Branşına ek dersler' : 'Dersler'}</FieldLabel>
          <Segmented<Level>
            size="sm"
            value={level}
            onChange={setLevel}
            items={[
              { value: 'Ortaokul', label: 'Ortaokul', id: 'et-level-ortaokul' },
              { value: 'Lise', label: 'Lise', id: 'et-level-lise' },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" id="et-subject-chips">
          {LEVEL_SUBJECTS[level].map((s) => {
            const on = draft.subjects.includes(s);
            return (
              <button
                key={s}
                type="button"
                className={chipCls(on)}
                onClick={() => setDraft({ ...draft, subjects: on ? draft.subjects.filter((x) => x !== s) : [...draft.subjects, s] })}
              >
                {s}
              </button>
            );
          })}
        </div>
        {draft.subjects.length > 0 && (
          <p className="text-[11px] text-muted" id="et-selected-subjects">
            Seçili dersler: <strong className="text-fg-2">{draft.subjects.join(', ')}</strong>
            {otherLevelSelected.length > 0 && ` (${level === 'Ortaokul' ? 'Lise' : 'Ortaokul'} kademesinden: ${otherLevelSelected.join(', ')})`}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setDraft(null)}>
          <X className="w-3.5 h-3.5" />
          Vazgeç
        </button>
        <button type="button" id="et-save" className="ui-btn ui-btn-primary ui-btn-sm" disabled={saving} onClick={save}>
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      id="etut-teacher-manager"
      icon={Users}
      tone="info"
      size="lg"
      title="Etüt Öğretmenleri"
      description="Etüt formundaki öğretmen listesi. Yönetici olmayan öğretmenler yalnızca kendi zümrelerini görür."
      footer={
        <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>
          Kapat
        </button>
      }
    >
      <div className="space-y-5">
        {error && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {notice && <div className="p-2.5 rounded-xl bg-success-soft text-success-fg text-xs font-semibold">{notice}</div>}

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            id="et-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Öğretmen ara (bulunduğu bölüm açılır)"
            className={`${inputCls} pl-9`}
          />
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-fg">Dış öğretmenler (hesabı olmayan) · {external.length}</h3>
            {!draft && (
              <button type="button" id="et-add" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => startDraft({ ...EMPTY })}>
                <UserPlus className="w-3.5 h-3.5" />
                Öğretmen ekle
              </button>
            )}
          </div>
          {draft && !draft.teacherId && editor}
          {rows === null ? (
            <p className="text-xs text-muted">Yükleniyor…</p>
          ) : external.length === 0 ? (
            <p className="text-xs text-muted">Henüz dış öğretmen eklenmedi.</p>
          ) : externalGroups.length === 0 ? (
            <p className="text-xs text-muted">Aramaya uyan dış öğretmen yok.</p>
          ) : (
            <div className="space-y-1.5" id="et-external-list">
              {externalGroups.map(({ subject, list }) => (
                <Group key={subject} id={`ext:${subject}`} title={subject} count={list.length} open={isOpen(`ext:${subject}`)} onToggle={() => toggle(`ext:${subject}`)}>
                  {list.map((r) => (
                    <li key={`${subject}-${r.id}`} className="flex flex-wrap items-center gap-2 px-3 py-2" data-testid="et-external-row">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-fg">{r.name}</span>
                        {r.subjects.length > 1 && <span className="block text-[11px] text-muted">{r.subjects.join(', ')}</span>}
                      </span>
                      <span className={cx('text-[11px] flex items-center gap-1', r.email ? 'text-muted' : 'text-warning-fg')}>
                        <Mail className="w-3.5 h-3.5" />
                        {r.email || 'e-posta yok'}
                      </span>
                      {r.phone && (
                        <span className="text-[11px] text-muted flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {r.phone}
                        </span>
                      )}
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-icon"
                        aria-label={`${r.name} düzenle`}
                        onClick={() => startDraft({ ...r, teacherId: null })}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon text-danger-fg" aria-label={`${r.name} sil`} onClick={() => remove(r)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </Group>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-fg">Sistemde kayıtlı öğretmenler · {teachers.length}</h3>
          {draft && draft.teacherId && editor}
          {systemList.length === 0 ? (
            <p className="text-xs text-muted">{q ? 'Aramaya uyan kayıtlı öğretmen yok.' : 'Kayıtlı öğretmen yok.'}</p>
          ) : (
            <div className="space-y-1.5" id="et-system-list">
              {[{ subject: 'all', list: systemList }].map(({ subject, list }) => (
                <Group key={subject} id="sys:all" title="Tüm kayıtlı öğretmenler" count={list.length} open={isOpen('sys:all')} onToggle={() => toggle('sys:all')}>
                  {list.map((t) => {
                    const r = rowFor(t);
                    const base = subjectsForBranch(t.branch);
                    const extra = (r?.subjects || []).filter((s) => !base.includes(s));
                    const hidden = r ? !r.active : false;
                    const email = t.email || r?.email || '';
                    return (
                      <li key={t.id} className={cx('flex flex-wrap items-center gap-2 px-3 py-2', hidden && 'opacity-60')} data-testid="et-system-row">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-fg">
                            {t.name}
                            {hidden && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-px rounded bg-surface-3 text-muted">listede gizli</span>}
                          </span>
                          <span className="block text-[11px] text-muted">
                            {base.join(', ') || 'Branş yok'}
                            {extra.length ? ` + ${extra.join(', ')}` : ''}
                          </span>
                        </span>
                        <span className={cx('text-[11px] flex items-center gap-1', email ? 'text-muted' : 'text-warning-fg')}>
                          <Mail className="w-3.5 h-3.5" />
                          {email || 'e-posta yok'}
                        </span>
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost ui-btn-icon"
                          aria-label={`${t.name} ek ders veya e-posta`}
                          onClick={() =>
                            startDraft(
                              { id: r?.id, teacherId: t.id, name: t.name, subjects: r?.subjects || [], email: r?.email || '', phone: r?.phone || '', active: r ? r.active : true },
                              base
                            )
                          }
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {hidden ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-icon"
                            aria-label={`${t.name} listede göster`}
                            title="Etüt listesine geri ekle"
                            onClick={() => toggleSystemActive(t)}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-icon text-danger-fg"
                            aria-label={`${t.name} listeden çıkar`}
                            title="Etüt listesinden çıkar (öğretmen hesabı silinmez)"
                            onClick={() => toggleSystemActive(t)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </Group>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted">
            Kayıtlı öğretmenin dersi, profilindeki branştan otomatik gelir. Kalem simgesiyle ek ders veya (profilinde yoksa) e-posta ekleyebilirsiniz.
            Çöp simgesi öğretmeni yalnızca etüt listesinden çıkarır; hesabı silinmez, göz simgesiyle geri eklenir.
          </p>
        </section>
      </div>
    </Modal>
  );
};
