import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, Pencil, Trash2, Save, X, Mail, Phone, AlertCircle, EyeOff, Eye } from 'lucide-react';
import { dataService, type EtutTeacherRow } from '../../services/dataService';
import type { Teacher } from '../../types';
import { Modal, cx } from '../ui/kit';
import { ALL_SUBJECTS, subjectsForBranch } from '../../lib/subjects';
import { inputCls, chipCls, FieldLabel } from './FormParts';

// ============================================================================
// Etüt öğretmenleri (yalnızca yönetici) — Aşama 9
//  * Kayıtlı öğretmenler: branşından gelen derse ek ders, e-posta eklenebilir veya listeden gizlenebilir
//  * Dış öğretmenler (hesabı olmayan): ad, ders(ler), e-posta, telefon
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
const EMPTY: Draft = { name: '', subjects: [], email: '', phone: '', active: true };
const SUBJECT_CHOICES = ALL_SUBJECTS.filter((s) => s !== 'Genel' && s !== 'Rehberlik');

export const EtutTeacherManagerModal: React.FC<{ open: boolean; onClose: () => void; onChanged: () => void }> = ({ open, onClose, onChanged }) => {
  const [rows, setRows] = useState<EtutTeacherRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
  }, [open]);

  const external = (rows || []).filter((r) => !r.teacherId);
  const rowFor = (t: Teacher) => (rows || []).find((r) => r.teacherId === t.id);

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
      <div>
        <FieldLabel>{draft.teacherId ? 'Branşına ek dersler' : 'Dersler'}</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {SUBJECT_CHOICES.map((s) => {
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
      description="Etüt formundaki ders → öğretmen listesi. Yönetici olmayan öğretmenler yalnızca kendi branşlarını görür."
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

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-fg">Dış öğretmenler (hesabı olmayan)</h3>
            {!draft && (
              <button type="button" id="et-add" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setDraft({ ...EMPTY })}>
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
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line" id="et-external-list">
              {external.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">{r.name}</span>
                    <span className="block text-[11px] text-muted">{r.subjects.join(', ') || 'Ders seçilmemiş'}</span>
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
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" aria-label={`${r.name} düzenle`} onClick={() => setDraft({ ...r, teacherId: null })}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon text-danger-fg" aria-label={`${r.name} sil`} onClick={() => remove(r)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-fg">Sistemde kayıtlı öğretmenler</h3>
          {draft && draft.teacherId && editor}
          <ul className="divide-y divide-line rounded-xl border border-line" id="et-system-list">
            {teachers.map((t) => {
              const r = rowFor(t);
              const base = subjectsForBranch(t.branch);
              const extra = (r?.subjects || []).filter((s) => !base.includes(s));
              const hidden = r ? !r.active : false;
              const email = t.email || r?.email || '';
              return (
                <li key={t.id} className={cx('flex flex-wrap items-center gap-2 px-3 py-2', hidden && 'opacity-60')}>
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
                    onClick={() => setDraft({ id: r?.id, teacherId: t.id, name: t.name, subjects: r?.subjects || [], email: r?.email || '', phone: r?.phone || '', active: r ? r.active : true })}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-ghost ui-btn-icon"
                    aria-label={hidden ? `${t.name} listede göster` : `${t.name} listeden gizle`}
                    title={hidden ? 'Etüt listesinde göster' : 'Etüt listesinden gizle'}
                    onClick={() => toggleSystemActive(t)}
                  >
                    {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted">
            Kayıtlı öğretmenin dersi, profilindeki branştan otomatik gelir. Kalem simgesiyle ek ders veya (profilinde yoksa) e-posta ekleyebilirsiniz.
          </p>
        </section>
      </div>
    </Modal>
  );
};
