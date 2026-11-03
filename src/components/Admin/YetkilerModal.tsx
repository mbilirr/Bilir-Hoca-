import React, { useMemo, useState } from 'react';
import { ShieldCheck, Save, Loader2, Lock, AlertTriangle, Info } from 'lucide-react';
import type { Teacher } from '../../types';
import { dataService } from '../../services/dataService';
import { Modal, cx } from '../ui/kit';
import {
  ROLE_DEFS,
  ROLE_BY_CODE,
  roleLabel,
  sortRoles,
  SECTION_DEFS,
  roleOpensSection,
  PERM_DEFS,
  PERM_PREFIX,
  isPermEntry,
  isIdare,
  roleOpensPerm,
  saveTeacherRoles,
  saveTeacherSections,
  saveTeacherYetkiler,
  fetchTeacherRoles,
  fetchTeacherSections,
  type TeacherRole,
  type SectionAccess,
  type SectionMode,
} from '../../lib/teacherRoles';

// ============================================================================
// Aşama 143: YETKİLER PENCERESİ — bir kişinin unvanı (rolü), bölümleri ve işlem izinleri tek yerde.
//  - Unvan: bugünkü "Rol ver" (set_teacher_roles)
//  - Bölümler / İşlemler: Rolden / Açık / Kapalı; ikisi aynı kayıtta (set_teacher_yetkiler, sql/143)
//  - "Rolden" yazısı, seçili unvana göre o an ne olacağını gösterir (veritabanı kurallarıyla aynı).
// Küçük pencere; tüm kutu ve düğmeler aynı yükseklikte (2rem), düğmeler eşit genişlikte.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const SEG = 'h-7 w-14 inline-flex items-center justify-center text-[11px] font-semibold transition-colors';
const TAB = 'h-8 flex-1 inline-flex items-center justify-center text-xs font-semibold rounded-md transition-colors';
const MODE_OPTS: Array<{ mode: SectionMode; label: string }> = [
  { mode: 'role', label: 'Rolden' },
  { mode: 'allow', label: 'Açık' },
  { mode: 'deny', label: 'Kapalı' },
];

// Aşama 146: Kullanıcı Bilgileri penceresi (z-[9999]) ve bildirim (z-[10000]) üstünde açılır
const YETKI_LAYER = 'z-[10001]';

export type YetkiTab = 'unvan' | 'bolum' | 'islem';
type RoleSettings = { rehberlik_ogrenci_ekle?: boolean; olcme_ogrenci_ekle?: boolean } | null;

// Aşama 98: rol yetkileri kapalıyken verilen rol ve izinler uygulanmaz
export const RolesOffWarning: React.FC<{ id: string }> = ({ id }) => (
  <p id={id} role="note" className="flex items-start gap-1.5 rounded-lg bg-warning-soft text-warning-fg px-2.5 py-1.5 text-[11px] font-semibold">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
    <span>
      Bu kurumda <b>Rol yetkileri kapalı</b>. Verdiğiniz roller ve izinler kaydedilir ama uygulanmaz; açmak için Roller ve yetkiler &gt; Rol
      yetkileri (genel yönetici).
    </span>
  </p>
);

const modeOf = (access: SectionAccess, key: string): SectionMode =>
  access.allow.includes(key) ? 'allow' : access.deny.includes(key) ? 'deny' : 'role';

const SegRow: React.FC<{
  label: string;
  hint?: string;
  mode: SectionMode;
  byRole: boolean | null;
  disabled?: boolean;
  onMode: (m: SectionMode) => void;
  dataKey: string;
}> = ({ label, hint, mode, byRole, disabled, onMode, dataKey }) => {
  const effective = mode === 'allow' ? true : mode === 'deny' ? false : byRole;
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5" data-yetki={dataKey} title={hint}>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-semibold text-fg truncate">{label}</span>
        <span className={cx('block text-[10.5px]', effective === true ? 'text-success-fg' : effective === false ? 'text-subtle' : 'text-muted')}>
          {effective === null ? 'Kurum ayarına göre' : effective ? 'Açık' : 'Kapalı'}
          {mode === 'role' ? ' (rolüne göre)' : ' (özel izin)'}
        </span>
      </span>
      <span className="inline-flex rounded-lg border border-line-strong overflow-hidden shrink-0 divide-x divide-line-strong">
        {MODE_OPTS.map((o) => {
          const on = mode === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onMode(o.mode)}
              className={cx(
                SEG,
                'disabled:cursor-not-allowed disabled:opacity-60',
                on
                  ? o.mode === 'deny'
                    ? 'bg-danger-soft text-danger-fg'
                    : o.mode === 'allow'
                      ? 'bg-success-soft text-success-fg'
                      : 'bg-brand-soft text-fg'
                  : 'bg-surface text-muted hover:bg-surface-2'
              )}
              data-mode={o.mode}
            >
              {o.label}
            </button>
          );
        })}
      </span>
    </li>
  );
};

export const YetkilerModal: React.FC<{
  teacher: Teacher;
  roles: TeacherRole[];
  access: SectionAccess;
  canGiveMudur: boolean;
  rolesOff?: boolean;
  roleSettings: RoleSettings;
  initialTab?: YetkiTab;
  onClose: () => void;
  onSaved: (r: { roles: TeacherRole[]; access: SectionAccess }) => void;
}> = ({ teacher, roles, access, canGiveMudur, rolesOff, roleSettings, initialTab = 'unvan', onClose, onSaved }) => {
  const [tab, setTab] = useState<YetkiTab>(initialTab);
  const [sel, setSel] = useState<TeacherRole[]>(roles);
  const initialModes = useMemo(() => {
    const m: Record<string, SectionMode> = {};
    SECTION_DEFS.forEach((d) => (m[d.key] = modeOf(access, d.key)));
    PERM_DEFS.forEach((d) => (m[PERM_PREFIX + d.key] = modeOf(access, PERM_PREFIX + d.key)));
    return m;
  }, [access]);
  const [modes, setModes] = useState<Record<string, SectionMode>>(initialModes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBranch = !!(teacher.branch || '').trim();
  const idare = isIdare(sel, teacher.isAdmin);
  const rolesChanged = sortRoles(sel).join(',') !== sortRoles(roles).join(',');
  const accessChanged = Object.keys(initialModes).some((k) => modes[k] !== initialModes[k]);
  const changed = rolesChanged || accessChanged;
  const permCount = PERM_DEFS.filter((d) => modes[PERM_PREFIX + d.key] !== 'role').length;
  const secCount = SECTION_DEFS.filter((d) => modes[d.key] !== 'role').length;

  const toggleRole = (code: TeacherRole) => {
    setError(null);
    setSel((prev) => {
      if (prev.includes(code)) {
        if (code === 'ogretmen' && prev.includes('zumre_baskani')) return prev; // zümre başkanı öğretmen rolüyle verilir
        return prev.filter((x) => x !== code);
      }
      const next = [...prev, code];
      if (code === 'zumre_baskani' && !next.includes('ogretmen')) next.push('ogretmen');
      return next;
    });
  };
  const setMode = (key: string, m: SectionMode) => {
    setError(null);
    setModes((p) => ({ ...p, [key]: m }));
  };

  const handleSave = async () => {
    if (!changed || saving) return;
    if (sel.includes('zumre_baskani') && !hasBranch) {
      setTab('unvan');
      setError('Zümre başkanı rolü için öğretmenin branşı kayıtlı olmalıdır.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let savedRoles = roles;
      if (rolesChanged) savedRoles = await saveTeacherRoles(teacher.id, sortRoles(sel) as TeacherRole[]);
      let savedAccess = access;
      if (accessChanged) {
        const allow = Object.keys(modes).filter((k) => modes[k] === 'allow');
        const deny = Object.keys(modes).filter((k) => modes[k] === 'deny');
        const usesPerms = [...allow, ...deny, ...access.allow, ...access.deny].some(isPermEntry);
        try {
          savedAccess = await saveTeacherYetkiler(teacher.id, { allow, deny });
        } catch (e: any) {
          // 143 SQL'i kurulmadıysa yalnız bölüm değişikliği eski yolla kaydedilir
          if (usesPerms || !/sql\/143/.test(e?.message || '')) throw e;
          savedAccess = await saveTeacherSections(teacher.id, { allow, deny });
        }
      }
      onSaved({ roles: savedRoles as TeacherRole[], access: savedAccess });
    } catch (e: any) {
      setError(e?.message || 'Yetkiler kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      icon={ShieldCheck}
      title="Yetkiler"
      description={`${teacher.name}${teacher.branch ? ` · ${teacher.branch}` : ''}`}
      size="sm"
      id="yetkiler-modal"
      layerClass={YETKI_LAYER}
      footer={
        <>
          <button type="button" onClick={onClose} className={cx(BTN, 'ui-btn-secondary')}>
            İptal
          </button>
          <button type="button" onClick={handleSave} disabled={!changed || saving} className={cx(BTN, 'ui-btn-primary')} id="yetkiler-save">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Kaydet
          </button>
        </>
      }
    >
      <div className="space-y-2.5">
        <div className="flex gap-1 rounded-lg bg-surface-2 border border-line p-1" role="tablist" aria-label="Yetki türü">
          {(
            [
              ['unvan', 'Unvan', sel.length],
              ['bolum', 'Bölümler', secCount],
              ['islem', 'İşlemler', permCount],
            ] as Array<[YetkiTab, string, number]>
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx(TAB, tab === k ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
              data-yetki-tab={k}
            >
              {label}
              {n > 0 && <span className="ml-1 text-[10px] text-brand-fg tabular-nums">({n})</span>}
            </button>
          ))}
        </div>

        {rolesOff && <RolesOffWarning id="yetkiler-off-warning" />}

        {tab === 'unvan' && (
          <>
            <p className="text-[11px] text-muted">Birden fazla unvan seçebilirsiniz. Bölüm ve işlem izinleri "Rolden" iken seçili unvana göre çalışır.</p>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Roller">
              {ROLE_DEFS.map((r) => {
                const on = sel.includes(r.code);
                const mudurLocked = !canGiveMudur;
                const locked =
                  (r.code === 'mudur' && mudurLocked) || (r.code === 'ogretmen' && on && sel.includes('zumre_baskani')) || (r.code === 'zumre_baskani' && !hasBranch && !on);
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
                    <input type="checkbox" checked={on} disabled={locked} onChange={() => toggleRole(r.code)} className="accent-indigo-600" data-role={r.code} />
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
          </>
        )}

        {tab === 'bolum' && (
          <>
            <p className="text-[11px] text-muted">
              <b>Rolden</b>: unvanına göre. <b>Açık</b> / <b>Kapalı</b>: unvanından bağımsız. Kurumda kapalı olan bölüm yine açılmaz.
            </p>
            <ul className="rounded-lg border border-line divide-y divide-line" role="group" aria-label="Bölümler">
              {SECTION_DEFS.map((d) => (
                <SegRow
                  key={d.key}
                  dataKey={d.key}
                  label={d.label}
                  mode={modes[d.key]}
                  byRole={roleOpensSection(sel, d.key)}
                  onMode={(m) => setMode(d.key, m)}
                />
              ))}
            </ul>
          </>
        )}

        {tab === 'islem' && (
          <>
            {idare ? (
              <p className="flex items-start gap-1.5 rounded-lg bg-info-soft text-info-fg px-2.5 py-1.5 text-[11px] font-semibold" id="yetkiler-idare-note">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Kurum yöneticisi, Müdür ve Müdür Yardımcısında bütün işlemler açıktır; kişiye özel işlem izni uygulanmaz.</span>
              </p>
            ) : (
              <p className="text-[11px] text-muted">
                <b>Rolden</b>: unvanına göre (yetki tablosu). <b>Açık</b> / <b>Kapalı</b>: unvanından bağımsız. Ekrandaki düğmeler ve sunucu aynı kuralı
                uygular; kişi sayfayı yenileyince geçerli olur.
              </p>
            )}
            <ul className="rounded-lg border border-line divide-y divide-line" role="group" aria-label="İşlemler">
              {PERM_DEFS.map((d) => {
                const key = PERM_PREFIX + d.key;
                return (
                  <SegRow
                    key={key}
                    dataKey={key}
                    label={d.label}
                    hint={d.hint}
                    mode={idare ? 'role' : modes[key]}
                    byRole={idare ? true : roleOpensPerm(sel, d.key, roleSettings)}
                    disabled={idare}
                    onMode={(m) => setMode(key, m)}
                  />
                );
              })}
            </ul>
          </>
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

// ----------------------------------------------------------------------------- Aşama 143: ortak kilit kuralı ve açıcı
/** Bu kişinin yetkilerini değiştirebilir miyim? (veritabanındaki set_teacher_roles / set_teacher_yetkiler ile aynı) */
export function yetkiLockReason(t: { id: string; kurumId?: string | null; isAdmin?: boolean }, rolesOfT: string[]): string | null {
  if (dataService.isHeadAdmin()) return null;
  const me = dataService.getCurrentTeacher();
  if (dataService.isKurumGecis()) return t.kurumId && t.kurumId === me?.kurumId ? null : 'Yalnızca bu kurumdaki kişilere yetki verebilirsiniz';
  if (me && t.id === me.id) return 'Kendi yetkilerinizi değiştiremezsiniz';
  if (!t.kurumId || t.kurumId !== me?.kurumId) return 'Yalnızca kendi kurumunuzdaki kişilere yetki verebilirsiniz';
  if (t.isAdmin) return 'Kurum yöneticisinin yetkilerini yalnızca genel yönetici değiştirebilir';
  if (rolesOfT.includes('mudur')) return 'Müdürün yetkilerini yalnızca genel yönetici değiştirebilir';
  return null;
}

/**
 * Yetkiler penceresini başka ekranlardan (kullanıcı listesi, Kullanıcı Bilgilerini Güncelle) açar: kişinin güncel rolünü ve
 * izin kaydını okur, sonra pencereyi gösterir. Okuma yalnızca açılınca yapılır (hız).
 */
export const YetkilerAcici: React.FC<{
  teacherId: string;
  roleSettings?: RoleSettings;
  onClose: () => void;
  onSaved?: (msg: string) => void;
}> = ({ teacherId, roleSettings, onClose, onSaved }) => {
  const [state, setState] = useState<{ teacher: Teacher; roles: TeacherRole[]; access: SectionAccess } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    const teacher = dataService.getAllTeachersInternal().find((x) => x.id === teacherId);
    if (!teacher) {
      setErr('Öğretmen bulunamadı.');
      return;
    }
    Promise.all([fetchTeacherRoles(), fetchTeacherSections().catch(() => new Map<string, SectionAccess>())])
      .then(([r, s]) => {
        if (!alive) return;
        const roles = (r.get(teacherId) || []) as TeacherRole[];
        const lock = yetkiLockReason(teacher, roles);
        if (lock) setErr(lock);
        else setState({ teacher, roles, access: s.get(teacherId) || { allow: [], deny: [] } });
      })
      .catch((e: any) => alive && setErr(e?.message || 'Yetkiler okunamadı.'));
    return () => {
      alive = false;
    };
  }, [teacherId]);
  if (err) {
    return (
      <Modal open onClose={onClose} icon={ShieldCheck} title="Yetkiler" size="sm" id="yetkiler-modal-err" layerClass={YETKI_LAYER}>
        <p role="alert" className="text-xs font-semibold text-danger-fg">
          {err}
        </p>
      </Modal>
    );
  }
  if (!state) return null;
  const isHead = dataService.isHeadAdmin();
  const rs = roleSettings !== undefined ? roleSettings : isHead ? null : dataService.getMyKurum().roleSettings || {};
  return (
    <YetkilerModal
      teacher={state.teacher}
      roles={state.roles}
      access={state.access}
      canGiveMudur={isHead || dataService.isKurumGecis()}
      rolesOff={!isHead && dataService.getMyKurum().rolesEnabled !== true}
      roleSettings={rs}
      onClose={onClose}
      onSaved={() => {
        onSaved?.(`${state.teacher.name} için yetkiler kaydedildi.`);
        onClose();
      }}
    />
  );
};
