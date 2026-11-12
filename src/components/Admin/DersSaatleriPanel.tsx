import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Coffee, Minus, Plus, RotateCcw, Save, Wand2 } from 'lucide-react';
import { Panel, cx } from '../ui/kit';
import { InfoTip } from '../ui/Compact';
import { appConfirm } from '../../lib/appDialog';
import {
  DERS_MAX,
  GUN_KISA,
  DersAyar,
  DersSaati,
  dersAyarKaydet,
  dersAyarOku,
  dersCanliDinle,
  saatleriDoldur,
} from '../../services/dersService';

// ============================================================================
// Aşama 217: DERS SAATLERİ (kurum ayarı) — günlük ders sayısı (1–10), ders günleri, saatler,
// gecikme süresi ve yoklama uyarı e-postaları. Kayıt tek işlemle veritabanına yazılır; ekran
// her zaman veritabanındaki son hali gösterir (başka yönetici değiştirirse canlı haber verir).
// Aşama 241: ders sayısı −/+ ile; saatler zil çizelgesi gibi: her dersin süresi, aralarda teneffüs / öğle arası
//            (30 dk ve üstü) ve çakışma anında görünür. Kayıt kuralları değişmedi.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const SAAT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Form {
  dersSayisi: number;
  gunler: number[];
  saatler: DersSaati[];
  gecikmeDk: number;
  epostalar: string;
}

const formdan = (a: DersAyar): Form => {
  const n = Math.min(DERS_MAX, Math.max(1, a.dersSayisi || 8));
  const saatler = a.saatler.length >= n ? a.saatler.slice(0, n) : [...a.saatler, ...saatleriDoldur('08:30', 40, 10, n).slice(a.saatler.length)];
  return {
    dersSayisi: n,
    gunler: a.gunler.length ? [...a.gunler].sort((x, y) => x - y) : [1, 2, 3, 4, 5],
    saatler: a.saatler.length ? saatler : saatleriDoldur('08:30', 40, 10, n),
    gecikmeDk: a.gecikmeDk || 40,
    epostalar: a.uyariEpostalari.join(', '),
  };
};

const OGLE_DK = 30; // bu kadar ve daha uzun ara "Öğle arası" yazılır
/** "09:40" → dakika (geçersizse null) */
const dk = (t: string): number | null => {
  if (!SAAT_RE.test(t)) return null;
  const [h, m] = t.split(':').map((x) => Number(x));
  return h * 60 + m;
};
const STEP_BTN =
  'grid h-8 w-8 place-items-center bg-surface-2 text-fg-2 transition-colors duration-150 hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand';

const ayni = (a: Form | null, b: Form | null) => JSON.stringify(a) === JSON.stringify(b);

/** "08:30" + 10 → "08:40" (gece yarısını geçmez; geçerse 23:59'da durur, form uyarı verir) */
const dkEkle = (t: string, n: number) => {
  const [h, m] = t.split(':').map((x) => Number(x));
  const top = Math.min(23 * 60 + 59, (h || 0) * 60 + (m || 0) + n);
  return `${String(Math.floor(top / 60)).padStart(2, '0')}:${String(top % 60).padStart(2, '0')}`;
};

/** Ekrandaki form için hata (veritabanı da aynı kuralları denetler) */
function formHatasi(f: Form): string | null {
  if (f.gunler.length === 0) return 'En az bir ders günü seçin.';
  let onceki = '00:00';
  for (let i = 0; i < f.dersSayisi; i++) {
    const s = f.saatler[i];
    if (!s || !SAAT_RE.test(s.bas) || !SAAT_RE.test(s.bit)) return `${i + 1}. dersin saati eksik.`;
    if (s.bas >= s.bit) return `${i + 1}. dersin bitişi başlangıcından sonra olmalı.`;
    if (s.bas < onceki) return `${i + 1}. ders, bir önceki ders bitmeden başlıyor.`;
    onceki = s.bit;
  }
  if (!(f.gecikmeDk >= 10 && f.gecikmeDk <= 240)) return 'Gecikme süresi 10–240 dakika olmalı.';
  const ep = epostaListesi(f.epostalar);
  if (ep.length > 5) return 'En çok 5 uyarı e-postası yazılabilir.';
  const kotu = ep.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (kotu) return `E-posta geçersiz: ${kotu}`;
  return null;
}

const epostaListesi = (s: string) =>
  Array.from(new Set(s.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)));

export const DersSaatleriPanel: React.FC<{ kurumId: string }> = ({ kurumId }) => {
  const [ayar, setAyar] = useState<DersAyar | null>(null);
  const [kayitli, setKayitli] = useState<Form | null>(null); // veritabanındaki hali
  const [form, setForm] = useState<Form | null>(null);
  const [yukHata, setYukHata] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'hata'; yazi: string } | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [disaridan, setDisaridan] = useState(false); // düzenlerken başka biri değiştirdi
  const [dolOpen, setDolOpen] = useState(false);
  const [dol, setDol] = useState({ ilk: '08:30', sure: 40, teneffus: 10, ogleSonra: 0, ogleDk: 40 });

  const kayitliRef = useRef<Form | null>(null);
  const formRef = useRef<Form | null>(null);
  formRef.current = form;
  const degisti = !!form && !!kayitli && !ayni(form, kayitli);

  const yukle = useCallback(async (zorla: boolean) => {
    try {
      const a = await dersAyarOku();
      if (!a) {
        setYukHata('Ders saatlerini görme yetkiniz yok.');
        return;
      }
      setYukHata(null);
      const f = formdan(a);
      const eski = kayitliRef.current;
      const cur = formRef.current;
      if (zorla || !cur || !eski || ayni(cur, eski)) {
        // düzenleme yoksa (ya da istendiyse) ekran son hale geçer
        formRef.current = f;
        setForm(f);
        setDisaridan(false);
      } else if (!ayni(f, eski)) {
        // düzenleme sürerken gelen değişiklik formu ezmez; haber verilir
        setDisaridan(true);
      }
      kayitliRef.current = f;
      setKayitli(f);
      setAyar(a);
    } catch (e: any) {
      setYukHata(e?.message || 'Ders saatleri okunamadı.');
    }
  }, []);

  useEffect(() => {
    void yukle(true);
    return dersCanliDinle(kurumId, ['kurum_ders_ayar'], () => void yukle(false));
  }, [kurumId, yukle]);

  const hataYazi = useMemo(() => (form ? formHatasi(form) : null), [form]);

  if (yukHata) {
    return (
      <Panel title="Ders saatleri" icon={Clock} id="ders-saatleri">
        <p role="alert" className="text-xs font-semibold text-danger-fg">
          {yukHata}
        </p>
      </Panel>
    );
  }
  if (!form || !ayar) {
    return (
      <Panel title="Ders saatleri" icon={Clock} id="ders-saatleri">
        <p className="text-xs text-muted">Yükleniyor…</p>
      </Panel>
    );
  }

  const set = (p: Partial<Form>) => {
    setMesaj(null);
    setForm((f) => (f ? { ...f, ...p } : f));
  };
  const sayiDegis = (n: number) => {
    const saatler = form.saatler.slice(0, n);
    while (saatler.length < n) {
      const son = saatler[saatler.length - 1];
      const bas = son ? dkEkle(son.bit, 10) : '08:30';
      saatler.push({ bas, bit: dkEkle(bas, 40) });
    }
    set({ dersSayisi: n, saatler });
  };
  const saatDegis = (i: number, k: 'bas' | 'bit', v: string) => {
    const saatler = form.saatler.map((s, j) => (j === i ? { ...s, [k]: v } : s));
    set({ saatler });
  };
  const gunDegis = (g: number) => {
    const has = form.gunler.includes(g);
    set({ gunler: has ? form.gunler.filter((x) => x !== g) : [...form.gunler, g].sort((a, b) => a - b) });
  };
  const doldur = () => {
    if (!SAAT_RE.test(dol.ilk) || !(dol.sure >= 10 && dol.sure <= 120) || !(dol.teneffus >= 0 && dol.teneffus <= 60)) {
      setMesaj({ tip: 'hata', yazi: 'İlk ders saati, süre (10–120) ve teneffüs (0–60) doğru olmalı.' });
      return;
    }
    const s = saatleriDoldur(dol.ilk, dol.sure, dol.teneffus, form.dersSayisi, dol.ogleSonra, dol.ogleDk);
    if (s[s.length - 1].bit < s[0].bas) {
      setMesaj({ tip: 'hata', yazi: 'Saatler gece yarısını geçiyor; ilk ders saatini ya da süreyi azaltın.' });
      return;
    }
    set({ saatler: s });
    setDolOpen(false);
  };

  const kaydet = async () => {
    if (hataYazi || kaydediliyor) return;
    setKaydediliyor(true);
    setMesaj(null);
    const istek = {
      dersSayisi: form.dersSayisi,
      gunler: form.gunler,
      saatler: form.saatler.slice(0, form.dersSayisi),
      gecikmeDk: form.gecikmeDk,
      epostalar: epostaListesi(form.epostalar),
    };
    try {
      let r = await dersAyarKaydet(istek);
      if (!r.ok && r.cakisan > 0) {
        const onay = await appConfirm({
          title: 'Programdaki dersler etkilenecek',
          message: `Kaldırdığınız gün ya da ders saatlerinde programda ${r.cakisan} ders var. Bugünden itibaren programdan çıkarılsın mı? Geçmiş günler ve alınmış yoklamalar değişmez.`,
          confirmText: 'Çıkar ve kaydet',
          danger: true,
        });
        if (!onay) {
          setKaydediliyor(false);
          return;
        }
        r = await dersAyarKaydet({ ...istek, temizle: true });
      }
      if (r.ok) {
        setMesaj({ tip: 'ok', yazi: r.kaldirilan ? `Kaydedildi. Programdan ${r.kaldirilan} ders çıkarıldı.` : 'Kaydedildi.' });
        await yukle(true);
      }
    } catch (e: any) {
      setMesaj({ tip: 'hata', yazi: e?.message || 'Kaydedilemedi.' });
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <Panel
      title="Ders saatleri"
      icon={Clock}
      id="ders-saatleri"
      description="Bütün sınıflar için ortak. Programdaki ders saatleri buradan gelir."
      actions={
        <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={kaydet} disabled={!degisti || !!hataYazi || kaydediliyor} id="ders-saatleri-kaydet">
          <Save className="w-3.5 h-3.5" /> {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      }
    >
      <div className="space-y-4">
        {!ayar.kayitli && (
          <p className="text-xs text-warning-fg font-semibold">Ders saatleri henüz kaydedilmedi. Kontrol edip "Kaydet"e basın.</p>
        )}
        {disaridan && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-info-fg font-semibold" role="status">
            Başka bir yönetici ders saatlerini değiştirdi.
            <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8" onClick={() => void yukle(true)}>
              <RotateCcw className="w-3.5 h-3.5" /> Son hali getir
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-fg-2" id="ders-sayisi-etiket">
              Günlük ders sayısı
            </span>
            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-line-strong" role="group" aria-labelledby="ders-sayisi-etiket">
              <button type="button" className={STEP_BTN} onClick={() => sayiDegis(form.dersSayisi - 1)} disabled={form.dersSayisi <= 1} aria-label="Bir ders azalt">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <output className="grid w-10 place-items-center bg-surface text-[13px] font-bold tabular-nums text-fg" id="ders-sayisi" aria-live="polite">
                {form.dersSayisi}
              </output>
              <button type="button" className={STEP_BTN} onClick={() => sayiDegis(form.dersSayisi + 1)} disabled={form.dersSayisi >= DERS_MAX} aria-label="Bir ders ekle">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-fg-2">Ders günleri</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Ders günleri">
              {GUN_KISA.map((g, i) => {
                const on = form.gunler.includes(i + 1);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={on}
                    onClick={() => gunDegis(i + 1)}
                    className={cx('ui-btn ui-btn-sm h-8 w-11 justify-center', on ? 'ui-btn-primary' : 'ui-btn-secondary')}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => setDolOpen((v) => !v)} aria-expanded={dolOpen} id="ders-saatleri-doldur">
            <Wand2 className="w-3.5 h-3.5" /> Otomatik doldur
          </button>
        </div>

        {dolOpen && (
          <div className="rounded-xl border border-line bg-surface-2 p-3 flex flex-wrap items-end gap-3" id="ders-saatleri-doldur-panel">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
              İlk ders
              <input type="time" className="ui-field w-28" value={dol.ilk} onChange={(e) => setDol({ ...dol, ilk: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
              Süre (dk)
              <input type="number" min={10} max={120} className="ui-field w-20" value={dol.sure} onChange={(e) => setDol({ ...dol, sure: Number(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
              Teneffüs (dk)
              <input type="number" min={0} max={60} className="ui-field w-20" value={dol.teneffus} onChange={(e) => setDol({ ...dol, teneffus: Number(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
              Öğle arası
              <select className="ui-field w-32" value={dol.ogleSonra} onChange={(e) => setDol({ ...dol, ogleSonra: Number(e.target.value) })}>
                <option value={0}>Yok</option>
                {Array.from({ length: Math.max(0, form.dersSayisi - 1) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}. dersten sonra
                  </option>
                ))}
              </select>
            </label>
            {dol.ogleSonra > 0 && (
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
                Öğle (dk)
                <input type="number" min={10} max={120} className="ui-field w-20" value={dol.ogleDk} onChange={(e) => setDol({ ...dol, ogleDk: Number(e.target.value) })} />
              </label>
            )}
            <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={doldur}>
              Saatleri doldur
            </button>
          </div>
        )}

        {/* Aşama 241: zil çizelgesi — ders kutusu (başlangıç, bitiş, süre), aralarda teneffüs / öğle arası */}
        <ol className="max-w-xl" id="ders-saatleri-liste" aria-label="Ders saatleri">
          {Array.from({ length: form.dersSayisi }, (_, i) => {
            const s = form.saatler[i] || { bas: '', bit: '' };
            const b0 = dk(s.bas);
            const b1 = dk(s.bit);
            const sure = b0 !== null && b1 !== null ? b1 - b0 : null;
            const sonraki = i < form.dersSayisi - 1 ? form.saatler[i + 1] : null;
            const n0 = sonraki ? dk(sonraki.bas) : null;
            const ara = b1 !== null && n0 !== null ? n0 - b1 : null;
            const hatali = sure !== null && sure <= 0;
            return (
              <li key={i}>
                <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3">
                  <span className="text-center text-xs font-bold text-muted tabular-nums">{i + 1}</span>
                  <div
                    className={cx(
                      'flex h-11 items-center gap-2 rounded-xl border px-2.5 transition-colors duration-150',
                      hatali ? 'border-danger bg-danger-soft' : 'border-brand/25 bg-brand-soft'
                    )}
                  >
                    <input
                      type="time"
                      aria-label={`${i + 1}. ders başlangıç`}
                      className="ui-field w-28 bg-surface"
                      value={s.bas}
                      onChange={(e) => saatDegis(i, 'bas', e.target.value)}
                    />
                    <span className="text-xs text-subtle" aria-hidden="true">
                      –
                    </span>
                    <input
                      type="time"
                      aria-label={`${i + 1}. ders bitiş`}
                      className="ui-field w-28 bg-surface"
                      value={s.bit}
                      onChange={(e) => saatDegis(i, 'bit', e.target.value)}
                    />
                    <span className={cx('ml-auto w-14 text-right text-xs font-semibold tabular-nums', hatali ? 'text-danger-fg' : 'text-brand-fg')}>
                      {sure === null ? '' : hatali ? 'Hatalı' : `${sure} dk`}
                    </span>
                  </div>
                </div>
                {sonraki && (
                  <div className="grid h-6 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3 text-[11px]" aria-hidden={ara === null}>
                    <span />
                    <span
                      className={cx(
                        'ml-5 flex h-full items-center gap-1.5 border-l-2 border-dashed pl-3',
                        ara !== null && ara < 0
                          ? 'border-danger text-danger-fg font-semibold'
                          : ara !== null && ara >= OGLE_DK
                            ? 'border-warning text-warning-fg font-semibold'
                            : 'border-line-strong text-subtle'
                      )}
                    >
                      {ara === null
                        ? ''
                        : ara < 0
                          ? 'Çakışıyor: sonraki ders bu ders bitmeden başlıyor'
                          : ara === 0
                            ? 'Ara yok'
                            : ara >= OGLE_DK
                              ? (
                                  <>
                                    <Coffee className="w-3 h-3" aria-hidden="true" /> Öğle arası {ara} dk
                                  </>
                                )
                              : `Teneffüs ${ara} dk`}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
            <span className="flex items-center gap-1">
              Gecikme uyarısı (dk)
              <InfoTip text="Ders bittikten bu kadar dakika sonra yoklama hâlâ alınmamışsa idareci ekranına düşer ve uyarı e-postası gider." />
            </span>
            <input type="number" min={10} max={240} className="ui-field w-24" value={form.gecikmeDk} onChange={(e) => set({ gecikmeDk: Number(e.target.value) })} id="ders-gecikme" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2 flex-1 min-w-[16rem]">
            <span className="flex items-center gap-1">
              Yoklama uyarı e-postaları
              <InfoTip text="Müdür yardımcılarının e-posta adresleri (en çok 5, virgülle ayırın). Geciken yoklamalar bu adreslere toplu tek e-postayla gider. Boş bırakılırsa Müdür Yardımcısı rolündeki öğretmenlerin gerçek e-postalarına gider (Aşama 221)." />
            </span>
            <input
              type="text"
              inputMode="email"
              autoComplete="off"
              className="ui-field w-full"
              placeholder="ornek@okul.k12.tr, ..."
              value={form.epostalar}
              onChange={(e) => set({ epostalar: e.target.value })}
              id="ders-uyari-eposta"
            />
          </label>
        </div>

        {(hataYazi && degisti) || mesaj ? (
          <p
            role={mesaj?.tip === 'ok' ? 'status' : 'alert'}
            className={cx('text-xs font-semibold', mesaj?.tip === 'ok' && !hataYazi ? 'text-success-fg' : 'text-danger-fg')}
          >
            {hataYazi && degisti ? hataYazi : mesaj?.yazi}
          </p>
        ) : null}
      </div>
    </Panel>
  );
};
