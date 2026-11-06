import React, { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Info, Loader2, RotateCcw, Save } from 'lucide-react';
import type { ClassGroup } from '../../types';
import { cx } from '../ui/kit';
import { supabase } from '../../lib/supabase';
import { usePagedList, ShowMoreBar } from '../../lib/listPaging';
import {
  OGR_BOLUMLER,
  ogrSinifAyari,
  ogrVarsayilan,
  saveOgrBolum,
  useOgrBolumSurum,
  type OgrBolum,
  type OgrBolumAyar,
} from '../../lib/ogrenciBolum';

// ============================================================================
// Aşama 165: ÖĞRENCİ BÖLÜMLERİ — kurum varsayılanı + sınıfa özel ayar
//  * İlk satır "Varsayılan (tüm sınıflar)": özel ayarı olmayan sınıflar ve sınıfsız öğrenciler bunu kullanır.
//  * Sınıf satırında bir kutu değişince o sınıf "Özel" olur; "Varsayılana dön" özel ayarı kaldırır.
//  * Kuruma kapalı bölüm (genel yöneticinin kurum bölümleri) öğrenciye açılamaz: sütun gri "kurumda kapalı".
//  * Ekran veritabanıyla birebir: kayıttan sonra satırlar sunucudan yeniden okunur (ogrenci_bolum_durum).
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const SHORT: Record<OgrBolum, string> = {
  homework: 'Ödev',
  etut: 'Etüt',
  questions: 'Soru Takibi',
  plan: 'Haftalık Plan',
  grades: 'Not-Devamsızlık',
  messages: 'Soru Sor',
  deneme: 'Deneme',
};
const DEF_ID = '__varsayilan__';

const full = (base: OgrBolumAyar | undefined, fallback?: OgrBolumAyar): Record<OgrBolum, boolean> =>
  Object.fromEntries(
    OGR_BOLUMLER.map((b) => {
      const v = base?.[b.key];
      const f = fallback?.[b.key];
      return [b.key, typeof v === 'boolean' ? v : typeof f === 'boolean' ? f : true];
    })
  ) as Record<OgrBolum, boolean>;

export const OgrenciBolumPanel: React.FC<{
  /** null = genel yöneticinin kendi alanı (kurumsuz sınıflar) */
  kurumId: string | null;
  /** Bu alanın sınıfları (görünmüyorsa boş: yalnız varsayılan ayarlanır) */
  classes: ClassGroup[];
  /** Kurum bölümleri (üst sınır). Verilmezse genel yönetici için kurum satırından okunur */
  kurumModules?: Record<string, boolean | undefined> | null;
  canEdit: boolean;
  /** Sınıflar görünmüyorsa gösterilecek not (ör. "kuruma geçin") */
  classesNote?: string;
}> = ({ kurumId, classes, kurumModules, canEdit, classesNote }) => {
  const surum = useOgrBolumSurum();
  const [draft, setDraft] = useState<Record<string, Record<OgrBolum, boolean> | null>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  // Kurum bölümleri (genel yönetici kurumu dışarıdan görüyorsa bir kez okunur)
  const [loadedMods, setLoadedMods] = useState<Record<string, boolean | undefined> | null>(null);
  useEffect(() => {
    setLoadedMods(null);
    if (kurumModules !== undefined || !kurumId) return;
    let alive = true;
    supabase
      .from('kurumlar')
      .select('modules')
      .eq('id', kurumId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data && typeof (data as any).modules === 'object') setLoadedMods((data as any).modules || {});
      });
    return () => {
      alive = false;
    };
  }, [kurumId, kurumModules]);
  const mods = kurumModules !== undefined ? kurumModules : loadedMods;
  const capped = (b: { key: OgrBolum; kurumModule?: string }) => !!kurumId && !!mods && !!b.kurumModule && mods[b.kurumModule] !== true;

  // Alan değişince taslak sıfırlanır
  useEffect(() => {
    setDraft({});
    setMsg(null);
  }, [kurumId]);

  const sorted = useMemo(
    () => [...classes].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr', { numeric: true })),
    [classes]
  );
  const paged = usePagedList(sorted, kurumId);

  // Kayıtlı + taslak birleşimi
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const savedDef = useMemo(() => ogrVarsayilan(kurumId), [kurumId, surum]);
  const defNow = draft[DEF_ID] !== undefined ? draft[DEF_ID] || undefined : savedDef;
  const defFull = full(defNow);
  const classOverride = (cid: string): OgrBolumAyar | undefined => (draft[cid] !== undefined ? draft[cid] || undefined : ogrSinifAyari(cid));
  const dirty = Object.keys(draft).length > 0;

  const toggleDef = (b: OgrBolum) => {
    const next = { ...defFull, [b]: !defFull[b] };
    setDraft((d) => ({ ...d, [DEF_ID]: next }));
    setMsg(null);
  };
  const toggleClass = (cid: string, b: OgrBolum) => {
    const cur = full(classOverride(cid), defFull);
    const next = { ...cur, [b]: !cur[b] };
    setDraft((d) => ({ ...d, [cid]: next }));
    setMsg(null);
  };
  const resetClass = (cid: string) => {
    setDraft((d) => {
      const n = { ...d };
      if (ogrSinifAyari(cid)) n[cid] = null;
      else delete n[cid];
      return n;
    });
    setMsg(null);
  };

  const save = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    setMsg(null);
    let n = 0;
    try {
      for (const [id, val] of Object.entries(draft)) {
        if (id === DEF_ID) await saveOgrBolum(kurumId, null, val);
        else await saveOgrBolum(kurumId, id, val);
        n++;
      }
      setDraft({});
      setMsg({ tone: 'success', text: `Kaydedildi (${n} satır). Öğrenci ekranları ve öğretmen seçicileri güncellendi.` });
    } catch (e: any) {
      // kaydedilen satırlar taslaktan çıkar, kalanlar ekranda kalır
      setDraft((d) => Object.fromEntries(Object.entries(d).slice(n)));
      setMsg({ tone: 'danger', text: e?.message || 'Kaydedilemedi.' });
    } finally {
      setBusy(false);
    }
  };

  const cell = (on: boolean, b: (typeof OGR_BOLUMLER)[number], onToggle: () => void, id: string, muted?: boolean) => {
    const cap = capped(b);
    return (
      <td key={b.key} className="px-1.5 py-1 text-center">
        <input
          type="checkbox"
          id={id}
          aria-label={b.title}
          title={cap ? 'Kurumda kapalı' : b.hint}
          checked={on && !cap}
          disabled={!canEdit || busy || cap}
          onChange={onToggle}
          className={cx('w-3.5 h-3.5 accent-[var(--color-brand)] cursor-pointer disabled:cursor-not-allowed', muted && 'opacity-60')}
        />
      </td>
    );
  };

  return (
    <section className="ui-card ui-card-pad space-y-2.5" id="ogrenci-bolumleri">
      <div className="flex items-start gap-2">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-info-soft text-info-fg">
          <GraduationCap className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-fg">Öğrenci bölümleri</h3>
          <p className="text-[11px] text-muted">
            Öğrencinin ekranında hangi bölümlerin açık olacağını seçin. Kapalı bölümde öğretmen o sınıfa ödev, etüt, soru hedefi ve haftalık plan
            veremez; Not-Devamsızlık ve Deneme yalnız öğrenciden gizlenir. Sınıfsız öğrenciler varsayılanı kullanır.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-xs" id="ogrenci-bolum-tablo">
          <thead>
            <tr className="bg-surface-2/70 text-muted">
              <th className="text-left font-semibold px-2.5 py-1.5 whitespace-nowrap">Sınıf</th>
              {OGR_BOLUMLER.map((b) => (
                <th key={b.key} className="font-semibold px-1.5 py-1.5 whitespace-nowrap text-center" title={b.hint}>
                  <span className="block">{SHORT[b.key]}</span>
                  {capped(b) && <span className="block text-[10px] font-medium text-subtle">kurumda kapalı</span>}
                </th>
              ))}
              <th className="text-right font-semibold px-2.5 py-1.5 whitespace-nowrap">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr className="bg-brand-soft/40" data-row="varsayilan">
              <td className="px-2.5 py-1.5 font-bold text-fg whitespace-nowrap">Varsayılan (tüm sınıflar)</td>
              {OGR_BOLUMLER.map((b) => cell(defFull[b.key], b, () => toggleDef(b.key), `ogr-bolum-def-${b.key}`))}
              <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                {draft[DEF_ID] !== undefined && <span className="ui-chip ui-chip-warning">Kaydedilmedi</span>}
              </td>
            </tr>
            {paged.visible.map((c) => {
              const ov = classOverride(c.id);
              const eff = full(ov, defFull);
              const changed = draft[c.id] !== undefined;
              return (
                <tr key={c.id} data-row={c.id} data-ozel={ov ? '1' : undefined}>
                  <td className="px-2.5 py-1.5 font-semibold text-fg-2 whitespace-nowrap">{c.name}</td>
                  {OGR_BOLUMLER.map((b) => cell(eff[b.key], b, () => toggleClass(c.id, b.key), `ogr-bolum-${c.id}-${b.key}`, !ov))}
                  <td className="px-2.5 py-1 text-right whitespace-nowrap">
                    {ov ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cx('ui-chip', changed ? 'ui-chip-warning' : 'ui-chip-info')}>{changed ? 'Kaydedilmedi' : 'Özel'}</span>
                        {canEdit && (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-sm h-7 px-2"
                            id={`ogr-bolum-sifirla-${c.id}`}
                            title="Varsayılana dön"
                            disabled={busy}
                            onClick={() => resetClass(c.id)}
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Varsayılan
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className={cx('text-[11px]', changed ? 'font-semibold text-warning-fg' : 'text-subtle')}>
                        {changed ? 'Varsayılana dönecek' : 'Varsayılan'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ShowMoreBar remaining={paged.remaining} total={paged.total} shown={paged.visible.length} onMore={paged.showMore} onAll={paged.showAll} />
      </div>

      {sorted.length === 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted" id="ogrenci-bolum-sinif-yok">
          <Info className="w-3.5 h-3.5 shrink-0" /> {classesNote || 'Bu alanda sınıf yok; varsayılan bütün öğrencilere uygulanır.'}
        </p>
      )}
      {msg && (
        <p role={msg.tone === 'danger' ? 'alert' : 'status'} className={cx('text-xs font-semibold', msg.tone === 'danger' ? 'text-danger-fg' : 'text-success-fg')} id="ogrenci-bolum-mesaj">
          {msg.text}
        </p>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} disabled={!dirty || busy} onClick={() => setDraft({})} id="ogrenci-bolum-vazgec">
            Vazgeç
          </button>
          <button type="button" className={cx(BTN, 'ui-btn-primary')} disabled={!dirty || busy} onClick={() => void save()} id="ogrenci-bolum-kaydet">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Kaydet
          </button>
        </div>
      )}
    </section>
  );
};
