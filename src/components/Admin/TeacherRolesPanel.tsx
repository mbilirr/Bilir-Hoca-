import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Table2, RefreshCw, Search, Lock, History, Info, Loader2, ShieldCheck } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { Teacher } from '../../types';
import { Panel, Modal, cx } from '../ui/kit';
import { YetkilerModal, RolesOffWarning } from './YetkilerModal';
import { SelectBox } from '../Teacher/FormParts';
import {
  ROLE_DEFS,
  ROLE_BY_CODE,
  MATRIX_COLUMNS,
  PERMISSION_MATRIX,
  MATRIX_NOTES,
  fetchTeacherRoles,
  onTeacherRolesSaved,
  fetchRoleLog,
  roleLabel,
  sortRoles,
  isPermEntry,
  fetchTeacherSections,
  type TeacherRole,
  type RoleLogItem,
  type SectionAccess,
} from '../../lib/teacherRoles';
import { useAutoDismiss } from '../../lib/useAutoDismiss';

// ============================================================================
// UNVANLAR VE ROLLER PANELİ (Aşama 81, 82, 83)
// Aşama 83: Bölümler — kişiye rolünden bağımsız bölüm açma / kapatma (sql/83).
// Aşama 143: Rol ver + Bölümler tek "Yetkiler" penceresinde (unvan, bölümler, işlem izinleri; sql/143).
// Genel yönetici herkese, kurum yöneticisi kendi kurumundaki kişilere rol (unvan) verir.
// Roller, kurumda "Rol yetkileri" açıkken uygulanır (Kurum Ayarları; sql/82).
// Tüm kutu ve düğmeler aynı yükseklikte (2rem) ve aynı yazı boyutunda; düğmeler eşit genişlikte.
// ============================================================================

const CTRL = 'w-full h-8 px-2.5 bg-surface border border-line-strong rounded-lg text-xs text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand cursor-pointer';
const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const NO_KURUM = '__none__';

const whenText = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Aşama 143: kurumId verilirse liste o kuruma kilitlenir (Yönetim › Kurumlar › seçili kurum; kurum seçici gizlenir).
 * roleSettings: kurumun rol ayarları (Yetkiler penceresinde "Öğrenci ekleme / silme" rolden ne olur), bilinmiyorsa null.
 */
export const TeacherRolesPanel: React.FC<{ kurumId?: string | null; roleSettings?: { rehberlik_ogrenci_ekle?: boolean; olcme_ogrenci_ekle?: boolean } | null; rolesOffOverride?: boolean }> = ({
  kurumId,
  roleSettings,
  rolesOffOverride,
}) => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const isHead = dataService.isHeadAdmin();
  const gecis = dataService.isKurumGecis(); // Aşama 98: genel yönetici kuruma geçmiş — o kurumda genel yönetici yetkisiyle rol verir
  // Aşama 98: kurumda rol yetkileri kapalıysa roller uygulanmaz (pencerelerde uyarı)
  const rolesOff = rolesOffOverride ?? (!isHead && dataService.getMyKurum().rolesEnabled !== true);
  const locked = kurumId !== undefined; // Aşama 143: kuruma kilitli
  const rs = roleSettings !== undefined ? roleSettings : isHead ? null : dataService.getMyKurum().roleSettings || {};
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
  const [sections, setSections] = useState<Map<string, SectionAccess>>(new Map());
  const [sectionsError, setSectionsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [r, l] = await Promise.all([fetchTeacherRoles(), fetchRoleLog(20).catch(() => [] as RoleLogItem[])]);
      setRoles(r);
      setLog(l);
      // Aşama 83: kişiye özel bölüm izinleri (SQL 83 yoksa yalnızca Bölümler düğmesi kapalı kalır)
      fetchTeacherSections()
        .then((m) => {
          setSections(m);
          setSectionsError(null);
        })
        .catch((e: any) => setSectionsError(e?.message || 'Bölüm izinleri okunamadı.'));
    } catch (e: any) {
      setLoadError(e?.message || 'Roller okunamadı.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // Aşama 100: rol başka yerde verilince (ör. yeni öğretmen hesabı penceresi) liste yeniden okunmadan güncellenir
  useEffect(
    () =>
      onTeacherRolesSaved((teacherId, saved) => {
        setRoles((prev) => {
          const next = new Map(prev || []);
          if (saved.length) next.set(teacherId, saved);
          else next.delete(teacherId);
          return next;
        });
        fetchRoleLog(20).then(setLog).catch(() => {});
      }),
    []
  );

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
      if (locked) {
        if ((t.kurumId || null) !== (kurumId || null)) return false;
      } else if (kurumFilter && (t.kurumId || NO_KURUM) !== kurumFilter) return false;
      const rs = roles?.get(t.id) || [];
      if (roleFilter === '__empty__' && rs.length) return false;
      if (roleFilter && roleFilter !== '__empty__' && !rs.includes(roleFilter as TeacherRole)) return false;
      if (!term) return true;
      return [t.name, t.branch, t.email].some((v) => (v || '').toLocaleLowerCase('tr-TR').includes(term));
    });
  }, [teachers, roles, q, kurumFilter, roleFilter, locked, kurumId]);

  /** Bu kişiye rol verebilir miyim? (veritabanı da aynı kuralı denetler) */
  const lockReason = (t: Teacher): string | null => {
    if (isHead) return null;
    if (gecis) return t.kurumId && t.kurumId === me?.kurumId ? null : 'Yalnızca bu kurumdaki kişilere rol verebilirsiniz';
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
            Roller, kurumda <b>Rol yetkileri</b> açıkken uygulanır (Kurum Ayarları bölümü; yalnızca genel yönetici açar). Kapalıyken roller
            kayıtlı kalır, kimsenin yetkisi değişmez. Kim neyi görür: <b>Yetki tablosu</b>.
          </span>
        </div>
        {rolesOff && <RolesOffWarning id="roles-panel-off-warning" />}

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

        <div className={cx('grid grid-cols-1 gap-2', isHead && !locked ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="İsim veya branş ile ara…"
              aria-label="Kişi ara"
              className={cx(CTRL, 'pl-8 cursor-text')}
            />
          </div>
          {isHead && !locked && (
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
                const sec = sections.get(t.id);
                const all = sec ? [...sec.allow, ...sec.deny] : [];
                const permCount = all.filter(isPermEntry).length;
                const secCount = all.length - permCount;
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
                      {secCount > 0 && (
                        <span className="ui-chip ui-chip-info" title="Unvanından bağımsız açılan / kapatılan bölümler">
                          Bölüm: {secCount}
                        </span>
                      )}
                      {permCount > 0 && (
                        <span className="ui-chip ui-chip-brand" title="Unvanından bağımsız açılan / kapatılan işlemler">
                          İşlem: {permCount}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className={cx(BTN, 'ui-btn-secondary shrink-0')}
                      onClick={() => setEditing(t)}
                      disabled={!!lock || roles === null || !!sectionsError}
                      title={sectionsError || lock || 'Unvan, bölüm ve işlem izinleri'}
                      data-yetki-edit={t.id}
                    >
                      {lock ? <Lock className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />} Yetkiler
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
        <YetkilerModal
          teacher={editing}
          roles={(roles?.get(editing.id) || []) as TeacherRole[]}
          access={sections.get(editing.id) || { allow: [], deny: [] }}
          canGiveMudur={isHead || gecis}
          rolesOff={rolesOff}
          roleSettings={rs}
          onClose={() => setEditing(null)}
          onSaved={({ access }) => {
            // Liste onTeacherRolesSaved ile güncellenir (rol değiştiyse saveTeacherRoles haber verir)
            setSections((prev) => {
              const next = new Map(prev);
              if (access.allow.length || access.deny.length) next.set(editing.id, access);
              else next.delete(editing.id);
              return next;
            });
            setNotice({ tone: 'ok', text: `${editing.name} için yetkiler kaydedildi.` });
            setEditing(null);
            fetchRoleLog(20).then(setLog).catch(() => {});
          }}
        />
      )}

      <Modal open={matrixOpen} onClose={() => setMatrixOpen(false)} icon={Table2} title="Yetki tablosu" description="Rollere göre kim neyi görebilir / yapabilir (kurumda rol yetkileri açıkken uygulanır)" size="xl" id="roles-matrix-modal">
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
