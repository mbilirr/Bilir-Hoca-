import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, RotateCcw, Save, Wand2 } from 'lucide-react';
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
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
            Günlük ders sayısı
            <select className="ui-field w-24" value={form.dersSayisi} onChange={(e) => sayiDegis(Number(e.target.value))} id="ders-sayisi">
              {Array.from({ length: DERS_MAX }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
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

        <div className="divide-y divide-line border-y border-line" id="ders-saatleri-liste">
          {Array.from({ length: form.dersSayisi }, (_, i) => {
            const s = form.saatler[i] || { bas: '', bit: '' };
            return (
              <div key={i} className="flex items-center gap-2 py-1.5">
                <span className="w-14 text-xs font-semibold text-fg-2 tabular-nums">{i + 1}. ders</span>
                <input type="time" aria-label={`${i + 1}. ders başlangıç`} className="ui-field w-28" value={s.bas} onChange={(e) => saatDegis(i, 'bas', e.target.value)} />
                <span className="text-xs text-subtle">–</span>
                <input type="time" aria-label={`${i + 1}. ders bitiş`} className="ui-field w-28" value={s.bit} onChange={(e) => saatDegis(i, 'bit', e.target.value)} />
              </div>
            );
          })}
        </div>

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
              <InfoTip text="Müdür yardımcılarının e-posta adresleri (en çok 5, virgülle ayırın). Geciken yoklamalar bu adreslere gider." />
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
