import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, Save, RefreshCw, Info, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { dataService, KURUM_MODULES } from '../../services/dataService';
import type { ClassGroup, KurumInfo, KurumModule, Teacher } from '../../types';
import { formatClassDisplayName } from '../../constants/schoolConstants';
import { Panel, cx } from '../ui/kit';

// ============================================================================
// KURUMLAR (Aşama 18) – yalnızca genel yönetici görür
// Her kurum yöneticisinin (admin) bir kurumu vardır. Genel yönetici burada:
//  - kurumun hangi bölümleri kullanabileceğini (ödev, etüt, soru takibi, ...) açar/kapatır,
//  - kendi sınıflarından hangilerini kuruma "izinli sınıf" olarak vereceğini seçer.
// Kurum yöneticisi kendi öğretmen, sınıf ve öğrencilerini kendisi ekler; başka kurumları göremez.
// ============================================================================

interface Draft {
  name: string;
  modules: Partial<Record<KurumModule, boolean>>;
  grantedClassIds: string[];
}

const sameDraft = (a: Draft, k: KurumInfo) =>
  a.name.trim() === k.name &&
  KURUM_MODULES.every((m) => !!a.modules[m.key] === !!k.modules[m.key]) &&
  a.grantedClassIds.length === k.grantedClassIds.length &&
  a.grantedClassIds.every((id) => k.grantedClassIds.includes(id));

export const KurumManagement: React.FC<{ classes: ClassGroup[] }> = ({ classes }) => {
  const [kurumlar, setKurumlar] = useState<KurumInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; tone: 'ok' | 'err'; text: string } | null>(null);
  const [classSearch, setClassSearch] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>(() => dataService.getAllTeachersInternal());

  useEffect(() => dataService.subscribe(() => setTeachers(dataService.getAllTeachersInternal())), []);

  // Öğretmenlerin kurum dağılımı değişince (yeni kurum yöneticisi vb.) liste yenilenir
  const teacherKurumKey = useMemo(
    () =>
      teachers
        .map((t) => `${t.id}:${t.kurumId || ''}:${t.isAdmin ? 1 : 0}`)
        .sort()
        .join('|'),
    [teachers]
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await dataService.listKurumlar();
      setKurumlar(list);
      setDrafts((prev) => {
        const next: Record<string, Draft> = {};
        list.forEach((k) => {
          next[k.id] = prev[k.id] && !sameDraft(prev[k.id], k) && savingId !== k.id
            ? prev[k.id]
            : { name: k.name, modules: { ...k.modules }, grantedClassIds: [...k.grantedClassIds] };
        });
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'Kurumlar okunamadı.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, teacherKurumKey]);

  // Genel yöneticinin kendi sınıfları (kurumlara izin olarak verilebilecek olanlar)
  const ownClasses = useMemo(
    () => classes.filter((c) => !c.kurumId).sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true })),
    [classes]
  );

  const save = async (k: KurumInfo) => {
    const d = drafts[k.id];
    if (!d || savingId) return;
    setSavingId(k.id);
    setMsg(null);
    try {
      await dataService.saveKurum({ id: k.id, name: d.name, modules: d.modules, grantedClassIds: d.grantedClassIds });
      setMsg({ id: k.id, tone: 'ok', text: 'Kaydedildi. Kurumdaki kullanıcılar bir sonraki yenilemede yeni izinleri görür.' });
      const list = await dataService.listKurumlar();
      setKurumlar(list);
      const fresh = list.find((x) => x.id === k.id);
      if (fresh) setDrafts((p) => ({ ...p, [k.id]: { name: fresh.name, modules: { ...fresh.modules }, grantedClassIds: [...fresh.grantedClassIds] } }));
    } catch (e: any) {
      setMsg({ id: k.id, tone: 'err', text: e?.message || 'Kaydedilemedi.' });
    } finally {
      setSavingId(null);
    }
  };

  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  return (
    <Panel
      id="kurum-management"
      icon={Building2}
      tone="info"
      title="Kurumlar"
      description="Kurum yöneticilerinin kullanabileceği bölümler ve onlara izin verdiğiniz sınıflar"
      actions={
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={load} title="Yenile" aria-label="Kurumları yenile">
          <RefreshCw className="w-4 h-4" />
        </button>
      }
    >
      <div className="flex items-start gap-2 rounded-xl bg-info-soft text-info-fg px-3 py-2.5 text-xs mb-4">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Bir öğretmeni <strong>kurum yöneticisi</strong> yapmak için aşağıdaki kullanıcı listesinde kalkan simgeli
          "Öğretmen / Yönetici yetkisi" düğmesini kullanın; kurumu kendiliğinden açılır ve burada görünür. Kurum yöneticisi
          kendi öğretmen, sınıf ve öğrencilerini ekler; yalnız kendi kurumunu ve sizin izin verdiğiniz sınıfları görür.
        </span>
      </div>

      {error && (
        <p className="text-sm text-danger-fg font-semibold" role="alert">
          {error}
        </p>
      )}
      {!error && kurumlar === null && <p className="text-sm text-muted">Kurumlar yükleniyor…</p>}
      {!error && kurumlar && kurumlar.length === 0 && (
        <p className="text-sm text-muted" id="kurum-empty">
          Henüz kurum yok. Bir öğretmeni yönetici yaptığınızda kurumu burada görünür.
        </p>
      )}

      <div className="space-y-3">
        {(kurumlar || []).map((k) => {
          const d = drafts[k.id] || { name: k.name, modules: k.modules, grantedClassIds: k.grantedClassIds };
          const members = teachers.filter((t) => t.kurumId === k.id);
          const admins = members.filter((t) => t.isAdmin);
          const kurumClasses = classes.filter((c) => c.kurumId === k.id);
          const open = openId === k.id;
          const dirty = !sameDraft(d, k);
          const q = classSearch.trim().toLocaleLowerCase('tr-TR');
          const visibleClasses = ownClasses.filter((c) => !q || c.name.toLocaleLowerCase('tr-TR').includes(q));
          return (
            <div key={k.id} className="border border-line rounded-2xl overflow-hidden" data-kurum-id={k.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : k.id)}
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface-2 hover:bg-surface-3 text-left cursor-pointer"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-fg truncate">{k.name}</span>
                  <span className="block text-xs text-muted truncate">
                    Yönetici: {admins.map((a) => a.name).join(', ') || '—'} · {members.length} öğretmen · {kurumClasses.length} sınıf ·{' '}
                    {k.grantedClassIds.length} izinli sınıf
                  </span>
                </span>
                <ChevronDown className={cx('w-4 h-4 text-muted shrink-0 transition-transform', open && 'rotate-180')} />
              </button>

              {open && (
                <div className="p-4 space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-fg-2 mb-1" htmlFor={`kurum-name-${k.id}`}>
                      Kurum adı
                    </label>
                    <input
                      id={`kurum-name-${k.id}`}
                      className="ui-input w-full sm:max-w-sm"
                      value={d.name}
                      maxLength={120}
                      onChange={(e) => setDraft(k.id, { name: e.target.value })}
                    />
                  </div>

                  <fieldset>
                    <legend className="text-xs font-bold text-fg-2 mb-2">Kullanabileceği bölümler</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {KURUM_MODULES.map((m) => (
                        <label
                          key={m.key}
                          className={cx(
                            'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer',
                            d.modules[m.key] ? 'border-brand bg-brand-soft' : 'border-line bg-surface'
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            data-module={m.key}
                            checked={!!d.modules[m.key]}
                            onChange={(e) => setDraft(k.id, { modules: { ...d.modules, [m.key]: e.target.checked } })}
                          />
                          <span>
                            <span className="block text-sm font-semibold text-fg">{m.title}</span>
                            <span className="block text-xs text-muted">{m.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="text-xs font-bold text-fg-2 mb-1">İzin verdiğiniz sınıflar ({d.grantedClassIds.length})</legend>
                    <p className="text-xs text-muted mb-2">
                      Seçtiğiniz sınıfları kurum da görür ve kullanır (ödev, etüt, soru hedefi, not, yoklama). Bu sınıflara öğrenci
                      ekleme, çıkarma ve düzenleme yalnızca sizde kalır.
                    </p>
                    {ownClasses.length > 8 && (
                      <div className="relative mb-2 sm:max-w-xs">
                        <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-2.5" />
                        <input
                          className="ui-input w-full pl-8"
                          placeholder="Sınıf ara"
                          value={classSearch}
                          onChange={(e) => setClassSearch(e.target.value)}
                        />
                      </div>
                    )}
                    {ownClasses.length === 0 ? (
                      <p className="text-xs text-muted">Henüz sınıfınız yok.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
                        {visibleClasses.map((c) => {
                          const on = d.grantedClassIds.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className={cx(
                                'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer',
                                on ? 'border-brand bg-brand-soft text-fg' : 'border-line text-fg-2'
                              )}
                            >
                              <input
                                type="checkbox"
                                data-class-id={c.id}
                                checked={on}
                                onChange={(e) =>
                                  setDraft(k.id, {
                                    grantedClassIds: e.target.checked
                                      ? [...d.grantedClassIds, c.id]
                                      : d.grantedClassIds.filter((x) => x !== c.id),
                                  })
                                }
                              />
                              <span className="truncate">{formatClassDisplayName(c.name, c.branch, c.gradeLevel)}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </fieldset>

                  {msg && msg.id === k.id && (
                    <p
                      className={cx('text-xs font-semibold flex items-center gap-1.5', msg.tone === 'ok' ? 'text-success-fg' : 'text-danger-fg')}
                      role={msg.tone === 'err' ? 'alert' : 'status'}
                    >
                      {msg.tone === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      {msg.text}
                    </p>
                  )}

                  <div className="flex justify-end gap-2">
                    {dirty && (
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost"
                        onClick={() => setDraft(k.id, { name: k.name, modules: { ...k.modules }, grantedClassIds: [...k.grantedClassIds] })}
                      >
                        Değişiklikleri geri al
                      </button>
                    )}
                    <button
                      type="button"
                      className="ui-btn ui-btn-primary"
                      data-testid="kurum-save"
                      disabled={!dirty || savingId === k.id}
                      onClick={() => save(k)}
                    >
                      <Save className="w-4 h-4" />
                      {savingId === k.id ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
};
