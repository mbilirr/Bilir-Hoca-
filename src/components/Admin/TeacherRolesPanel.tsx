import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Table2, RefreshCw, Search, Lock, History, Info, Save, Loader2 } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { Teacher } from '../../types';
import { Panel, Modal, cx } from '../ui/kit';
import { SelectBox } from '../Teacher/FormParts';
import {
  ROLE_DEFS,
  ROLE_BY_CODE,
  MATRIX_COLUMNS,
  PERMISSION_MATRIX,
  MATRIX_NOTES,
  fetchTeacherRoles,
  saveTeacherRoles,
  fetchRoleLog,
  roleLabel,
  sortRoles,
  type TeacherRole,
  type RoleLogItem,
} from '../../lib/teacherRoles';
import { useAutoDismiss } from '../../lib/useAutoDismiss';

// ============================================================================
// UNVANLAR VE ROLLER PANELİ (Aşama 81 — 1. aşama)
// Genel yönetici herkese, kurum yöneticisi kendi kurumundaki kişilere rol (unvan) verir.
// Bu aşamada roller yalnızca kaydedilir ve görüntülenir; kimsenin yetkisi değişmez.
// Tüm kutu ve düğmeler aynı yükseklikte (2rem) ve aynı yazı boyutunda; düğmeler eşit genişlikte.
// ============================================================================

const CTRL = 'w-full h-8 px-2.5 bg-surface border border-line-strong rounded-lg text-xs text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand cursor-pointer';
const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const NO_KURUM = '__none__';

const whenText = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const TeacherRolesPanel: React.FC = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const isHead = dataService.isHeadAdmin();
  const me = dataService.getCurrentTeacher();
  const teachers = useMemo(
    () => dataService.getTeachers().filter((t) => t.status !== 'rejected').sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );

  const [roles, setRoles] = useState<Map<string, TeacherRole[]> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<RoleLogItem[]>([]);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  useAutoDismiss(notice, () => setNotice(null));

  const [q, setQ] = useState('');
  const [kurumFilter, setKurumFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [r, l] = await Promise.all([fetchTeacherRoles(), fetchRoleLog(20).catch(() => [] as RoleLogItem[])]);
      setRoles(r);
      setLog(l);
    } catch (e: any) {
      setLoadError(e?.message || 'Roller okunamadı.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Genel yönetici için kurum seçenekleri
  const kurumOptions = useMemo(() => {
    if (!isHead) return [];
    const ids = new Set<string>();
    teachers.forEach((t) => ids.add(t.kurumId || NO_KURUM));
    return Array.from(ids)
      .map((id) => ({ id, name: id === NO_KURUM ? 'Kurumsuz (sizin öğretmenleriniz)' : dataService.getKurumNameForId(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [teachers, isHead]);

  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr-TR');
    return teachers.filter((t) => {
      if (kurumFilter && (t.kurumId || NO_KURUM) !== kurumFilter) return false;
      const rs = roles?.get(t.id) || [];
      if (roleFilter === '__empty__' && rs.length) return false;
      if (roleFilter && roleFilter !== '__empty__' && !rs.includes(roleFilter as TeacherRole)) return false;
      if (!term) return true;
      return [t.name, t.branch, t.email].some((v) => (v || '').toLocaleLowerCase('tr-TR').includes(term));
    });
  }, [teachers, roles, q, kurumFilter, roleFilter]);

  /** Bu kişiye rol verebilir miyim? (veritabanı da aynı kuralı denetler) */
  const lockReason = (t: Teacher): string | null => {
    if (isHead) return null;
    if (me && t.id === me.id) return 'Kendi rollerinizi değiştiremezsiniz';
    if (!t.kurumId || t.kurumId !== me?.kurumId) return 'Yalnızca kendi kurumunuzdaki kişilere rol verebilirsiniz';
    if (t.isAdmin) return 'Kurum yöneticisinin rollerini yalnızca genel yönetici değiştirebilir';
    if ((roles?.get(t.id) || []).includes('mudur')) return 'Müdürün rollerini yalnızca genel yönetici değiştirebilir';
    return null;
  };

  const assignedCount = useMemo(() => (roles ? teachers.filter((t) => (roles.get(t.id) || []).length > 0).length : 0), [roles, teachers]);

  return (
    <Panel
      id="teacher-roles-panel"
      icon={BadgeCheck}
      tone="brand"
      title="Unvanlar ve Roller"
      description={roles ? `${teachers.length} kişi · ${assignedCount} kişiye rol verildi` : 'Kişilere unvan (rol) verin'}
      actions={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setMatrixOpen(true)} id="roles-matrix-btn">
            <Table2 className="w-3.5 h-3.5" /> Yetki tablosu
          </button>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={load} disabled={loading} id="roles-refresh-btn">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg bg-info-soft text-info-fg px-3 py-2 text-xs">
          <Info className="w-4 h-4 shrink-0 mt-px" />
          <span>
            Bu aşamada roller <b>kaydedilir ve görüntülenir</b>; kimsenin bugünkü yetkisi değişmez. Rollere göre görme ve düzenleme
            kuralları sonraki aşamalarda devreye girecek. Ayrıntılar için <b>Yetki tablosu</b>na bakın.
          </span>
        </div>

        {loadError && (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {loadError}
          </p>
        )}
        {notice && (
          <p role="status" className={cx('text-xs font-semibold', notice.tone === 'ok' ? 'text-success-fg' : 'text-danger-fg')}>
            {notice.text}
          </p>
        )}

        <div className={cx('grid grid-cols-1 gap-2', isHead ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="İsim, branş veya e-posta ara…"
              aria-label="Kişi ara"
              className={cx(CTRL, 'pl-8 cursor-text')}
            />
          </div>
          {isHead && (
            <SelectBox aria-label="Kurum" value={kurumFilter} onChange={(e) => setKurumFilter(e.target.value)} className={CTRL}>
              <option value="">Kurum seçiniz</option>
              {kurumOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </SelectBox>
          )}
          <SelectBox aria-label="Rol" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={CTRL}>
            <option value="">Rol seçiniz</option>
            {ROLE_DEFS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
            <option value="__empty__">Rolü olmayanlar</option>
          </SelectBox>
        </div>

        <div className="rounded-xl border border-line overflow-hidden">
          {list.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">Aramanıza uygun kişi yok.</p>
          ) : (
            <ul className="divide-y divide-line max-h-[520px] overflow-y-auto">
              {list.map((t) => {
                const rs = sortRoles(roles?.get(t.id) || []) as TeacherRole[];
                const lock = lockReason(t);
                return (
                  <li key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2" data-teacher-id={t.id}>
                    <div className="min-w-0 sm:w-56 shrink-0">
                      <p className="text-xs font-semibold text-fg truncate">
                        {t.name}
                        {t.isAdmin && <span className="ml-1.5 ui-chip ui-chip-warning">Kurum yön.</span>}
                      </p>
                      <p className="text-[11px] text-muted truncate">
                        {t.branch || 'Branş yok'}
                        {isHead ? ` · ${t.kurumId ? dataService.getKurumNameForId(t.kurumId) : 'Kurumsuz'}` : ''}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                      {roles === null ? (
                        <span className="text-[11px] text-subtle">—</span>
                      ) : rs.length === 0 ? (
                        <span className="text-[11px] text-subtle">Rol verilmedi</span>
                      ) : (
                        rs.map((r) => (
                          <span key={r} className={`ui-chip ui-chip-${ROLE_BY_CODE[r]?.chip || 'neutral'}`} title={ROLE_BY_CODE[r]?.description}>
                            {ROLE_BY_CODE[r]?.label || r}
                          </span>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      className={cx(BTN, 'ui-btn-secondary shrink-0')}
                      onClick={() => setEditing(t)}
                      disabled={!!lock || roles === null}
                      title={lock || 'Rolleri düzenle'}
                      data-role-edit={t.id}
                    >
                      {lock ? <Lock className="w-3.5 h-3.5" /> : <BadgeCheck className="w-3.5 h-3.5" />} Rol ver
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {log.length > 0 && (
          <details className="rounded-xl border border-line bg-surface-2/50 px-3 py-2" id="roles-log">
            <summary className="cursor-pointer text-xs font-semibold text-fg-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Son değişiklikler
            </summary>
            <ul className="mt-2 space-y-1">
              {log.map((l) => (
                <li key={l.id} className="text-[11px] text-fg-2">
                  <span className="text-muted tabular-nums">{whenText(l.created_at)}</span> · <b>{l.teacher_name || 'Öğretmen'}</b>
                  {l.added.length > 0 && <span className="text-success-fg"> · eklendi: {l.added.map(roleLabel).join(', ')}</span>}
                  {l.removed.length > 0 && <span className="text-danger-fg"> · kaldırıldı: {l.removed.map(roleLabel).join(', ')}</span>}
                  <span className="text-muted"> · veren: {l.actor_name || '—'}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {editing && (
        <RoleEditModal
          teacher={editing}
          current={(roles?.get(editing.id) || []) as TeacherRole[]}
          canGiveMudur={isHead}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setRoles((prev) => {
              const next = new Map(prev || []);
              if (saved.length) next.set(editing.id, saved);
              else next.delete(editing.id);
              return next;
            });
            setNotice({ tone: 'ok', text: `${editing.name} için roller kaydedildi.` });
            setEditing(null);
            fetchRoleLog(20).then(setLog).catch(() => {});
          }}
        />
      )}

      <Modal open={matrixOpen} onClose={() => setMatrixOpen(false)} icon={Table2} title="Yetki tablosu" description="Rollere göre kim neyi görebilir / yapabilir (sonraki aşamalarda uygulanacak)" size="xl" id="roles-matrix-modal">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[46rem] text-[11px]">
            <thead className="bg-surface-2 text-fg-2">
              <tr>
                <th className="text-left font-bold px-2.5 py-2 sticky left-0 bg-surface-2">Bölüm</th>
                {MATRIX_COLUMNS.map((c) => (
                  <th key={c} className="text-left font-bold px-2.5 py-2 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MATRIX.map((row) => (
                <tr key={row.area} className="border-t border-line align-top">
                  <td className="px-2.5 py-1.5 font-semibold text-fg sticky left-0 bg-surface">{row.area}</td>
                  {row.cells.map((c, i) => (
                    <td key={i} className={cx('px-2.5 py-1.5', c === '—' ? 'text-subtle' : 'text-fg-2')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 space-y-1 text-[11px] text-muted list-disc pl-4">
          {MATRIX_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Modal>
    </Panel>
  );
};

// ----------------------------------------------------------------------------- Rol ver penceresi (küçük)
const RoleEditModal: React.FC<{
  teacher: Teacher;
  current: TeacherRole[];
  canGiveMudur: boolean;
  onClose: () => void;
  onSaved: (roles: TeacherRole[]) => void;
}> = ({ teacher, current, canGiveMudur, onClose, onSaved }) => {
  const [sel, setSel] = useState<TeacherRole[]>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasBranch = !!(teacher.branch || '').trim();
  const mudurLocked = !canGiveMudur;

  const toggle = (code: TeacherRole) => {
    setError(null);
    setSel((prev) => {
      if (prev.includes(code)) {
        // Zümre başkanı seçiliyken öğretmen rolü kaldırılamaz
        if (code === 'ogretmen' && prev.includes('zumre_baskani')) return prev;
        return prev.filter((x) => x !== code);
      }
      const next = [...prev, code];
      if (code === 'zumre_baskani' && !next.includes('ogretmen')) next.push('ogretmen');
      return next;
    });
  };

  const changed = sortRoles(sel).join(',') !== sortRoles(current).join(',');

  const handleSave = async () => {
    if (!changed || saving) return;
    if (sel.includes('zumre_baskani') && !hasBranch) {
      setError('Zümre başkanı rolü için öğretmenin branşı kayıtlı olmalıdır.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTeacherRoles(teacher.id, sortRoles(sel) as TeacherRole[]);
      onSaved(saved);
    } catch (e: any) {
      setError(e?.message || 'Roller kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      icon={BadgeCheck}
      title="Rol ver"
      description={`${teacher.name}${teacher.branch ? ` · ${teacher.branch}` : ''}`}
      size="sm"
      id="role-edit-modal"
      footer={
        <>
          <button type="button" onClick={onClose} className={cx(BTN, 'ui-btn-secondary')}>
            İptal
          </button>
          <button type="button" onClick={handleSave} disabled={!changed || saving} className={cx(BTN, 'ui-btn-primary')} id="role-edit-save">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Kaydet
          </button>
        </>
      }
    >
      <div className="space-y-2.5">
        <p className="text-[11px] text-muted">Birden fazla rol seçebilirsiniz. Seçili rolün açıklaması aşağıda görünür.</p>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Roller">
          {ROLE_DEFS.map((r) => {
            const on = sel.includes(r.code);
            const locked = (r.code === 'mudur' && mudurLocked) || (r.code === 'ogretmen' && on && sel.includes('zumre_baskani')) || (r.code === 'zumre_baskani' && !hasBranch && !on);
            const reason =
              r.code === 'mudur' && mudurLocked
                ? 'Müdür rolünü yalnızca genel yönetici verebilir'
                : r.code === 'zumre_baskani' && !hasBranch
                  ? 'Önce öğretmenin branşını kaydedin'
                  : r.code === 'ogretmen' && locked
                    ? 'Zümre başkanı öğretmen rolüyle birlikte verilir'
                    : r.description;
            return (
              <label
                key={r.code}
                title={reason}
                className={cx(
                  'flex items-center gap-2 h-8 px-2.5 rounded-lg border text-xs transition-colors select-none',
                  locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                  on ? 'border-brand bg-brand-soft text-fg font-semibold' : 'border-line bg-surface text-fg-2 hover:bg-surface-2'
                )}
              >
                <input type="checkbox" checked={on} disabled={locked} onChange={() => toggle(r.code)} className="accent-indigo-600" data-role={r.code} />
                <span className="truncate">{r.label}</span>
                {r.code === 'mudur' && mudurLocked && <Lock className="w-3 h-3 ml-auto shrink-0" />}
              </label>
            );
          })}
        </div>
        {sel.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-fg-2">
            {sortRoles(sel).map((c) => (
              <li key={c}>
                <b>{roleLabel(c)}:</b> {ROLE_BY_CODE[c as TeacherRole]?.description}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
