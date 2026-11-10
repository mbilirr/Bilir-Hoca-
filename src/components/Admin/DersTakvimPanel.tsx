import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CalendarOff, Plus, Save, Trash2 } from 'lucide-react';
import { Panel, Segmented, cx } from '../ui/kit';
import { InfoTip } from '../ui/Compact';
import { appConfirm } from '../../lib/appDialog';
import {
  GUN_KISA,
  Tatil,
  VeliBildirim,
  dersAyarOku,
  dersCanliDinle,
  gunEkle,
  isoGun,
  tarihUzun,
  tarihYaz,
  tatilEkle,
  tatilListesi,
  tatilSil,
  veliBildirimKaydet,
  sinirKaydet,
} from '../../services/dersService';

// ============================================================================
// Aşama 231: TATİL GÜNLERİ + VELİYE DEVAMSIZLIK BİLDİRİMİ ZAMANI (Yönetim › Ders programı › Ders saatleri altında)
//  * Tatil günlerinde ders yok sayılır: gecikme e-postası / telefon hatırlatması gitmez, raporlarda sayılmaz,
//    öğretmen ve öğrenci programında "Tatil" görünür.
//  * Veli bildirimi: Gün sonu (tek özet) · Ders sonu (her dersten sonra) · İkisi. İzin yine Yönetim › Bildirim izinleri ›
//    Ders devamsızlığı › Veli anahtarına bağlıdır (kapalıysa hiçbir şey gitmez).
// Aşama 232: özürsüz devamsızlık sınırı (gün) + kaç gün kala uyarı → idareye özet, veliye e-posta / SMS (günde bir tarama).
// Bütün yazmalar veritabanı işlevleriyle (sql/231); ekran her zaman veritabanındaki son hali gösterir.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 justify-center';

interface Grup {
  bas: string;
  bit: string;
  aciklama: string;
  gun: number;
}

/** Ardışık ve aynı açıklamalı günleri tek satırda toplar ("23 Nis" / "20 Oca – 31 Oca · Yarıyıl tatili") */
function grupla(liste: Tatil[]): Grup[] {
  const out: Grup[] = [];
  for (const t of liste) {
    const son = out[out.length - 1];
    if (son && son.aciklama === t.aciklama && gunEkle(son.bit, 1) === t.tarih) {
      son.bit = t.tarih;
      son.gun += 1;
    } else out.push({ bas: t.tarih, bit: t.tarih, aciklama: t.aciklama, gun: 1 });
  }
  return out;
}

const VELI_SECENEK: Array<{ value: VeliBildirim; label: string; id: string }> = [
  { value: 'gun_sonu', label: 'Gün sonu', id: 'veli-bildirim-gun' },
  { value: 'ders_sonu', label: 'Ders sonu', id: 'veli-bildirim-ders' },
  { value: 'ikisi', label: 'İkisi', id: 'veli-bildirim-ikisi' },
];

export const DersTakvimPanel: React.FC<{ kurumId: string }> = ({ kurumId }) => {
  const bugun = tarihYaz(new Date());
  const [liste, setListe] = useState<Tatil[] | null>(null);
  const [veli, setVeli] = useState<VeliBildirim | null>(null);
  const [kayitli, setKayitli] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [tumu, setTumu] = useState(false);
  const [form, setForm] = useState({ bas: bugun, bit: bugun, aciklama: '' });
  const [sinir, setSinir] = useState({ sinir: '10', kala: '2' });
  const [sinirKayitli, setSinirKayitli] = useState({ sinir: 10, kala: 2 });

  const yukle = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([dersAyarOku(), tatilListesi(kurumId)]);
      setVeli(a?.veliBildirim || 'gun_sonu');
      setKayitli(!!a?.kayitli);
      if (a) {
        setSinirKayitli({ sinir: a.devamsizlikSinir, kala: a.devamsizlikKala });
        setSinir({ sinir: String(a.devamsizlikSinir), kala: String(a.devamsizlikKala) });
      }
      setListe(t);
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Okunamadı.');
    }
  }, [kurumId]);

  useEffect(() => {
    void yukle();
    return dersCanliDinle(kurumId, ['kurum_ders_tatil', 'kurum_ders_ayar'], () => void yukle());
  }, [kurumId, yukle]);

  const gruplar = useMemo(() => grupla(liste || []), [liste]);
  const gelecek = gruplar.filter((g) => g.bit >= bugun);
  const gecmis = gruplar.filter((g) => g.bit < bugun);
  const gorunen = tumu ? [...gecmis, ...gelecek] : gelecek;

  const ekle = async () => {
    if (mesgul) return;
    if (!form.bas || !form.bit || form.bit < form.bas) {
      setMesaj('Bitiş tarihi başlangıçtan önce olamaz.');
      return;
    }
    setMesgul(true);
    setMesaj(null);
    try {
      const n = await tatilEkle(form.bas, form.bit, form.aciklama);
      setMesaj(`${n} gün tatil olarak kaydedildi.`);
      setForm({ bas: bugun, bit: bugun, aciklama: '' });
      await yukle();
    } catch (e: any) {
      setMesaj(e?.message || 'Kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const sil = async (g: Grup) => {
    const ok = await appConfirm({
      title: 'Tatil kaldırılsın mı?',
      message: `${g.bas === g.bit ? tarihUzun(g.bas) : `${tarihUzun(g.bas)} – ${tarihUzun(g.bit)}`} yeniden ders günü sayılır.`,
      confirmText: 'Kaldır',
      danger: true,
    });
    if (!ok) return;
    setMesgul(true);
    try {
      await tatilSil(g.bas, g.bit);
      await yukle();
    } catch (e: any) {
      setMesaj(e?.message || 'Kaldırılamadı.');
    } finally {
      setMesgul(false);
    }
  };

  const veliDegis = async (m: VeliBildirim) => {
    if (m === veli || mesgul) return;
    const eski = veli;
    setVeli(m);
    setMesgul(true);
    setMesaj(null);
    try {
      await veliBildirimKaydet(m);
    } catch (e: any) {
      setVeli(eski);
      setMesaj(e?.message || 'Kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const sinirSayi = Number(sinir.sinir);
  const kalaSayi = Number(sinir.kala);
  const sinirGecerli =
    Number.isInteger(sinirSayi) && sinirSayi >= 0 && sinirSayi <= 60 && Number.isInteger(kalaSayi) && kalaSayi >= 0 && kalaSayi <= 10;
  const sinirDegisti = sinirSayi !== sinirKayitli.sinir || kalaSayi !== sinirKayitli.kala;
  const sinirKaydetTik = async () => {
    if (mesgul || !sinirGecerli) return;
    setMesgul(true);
    setMesaj(null);
    try {
      await sinirKaydet(sinirSayi, kalaSayi);
      setSinirKayitli({ sinir: sinirSayi, kala: kalaSayi });
      setMesaj('Devamsızlık sınırı kaydedildi.');
    } catch (e: any) {
      setMesaj(e?.message || 'Kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  if (hata) {
    return (
      <Panel title="Tatil günleri ve veli bildirimi" icon={CalendarOff} id="ders-takvim">
        <p role="alert" className="text-xs font-semibold text-danger-fg">
          {hata}
        </p>
      </Panel>
    );
  }

  const aralikYazi = (g: Grup) =>
    g.bas === g.bit
      ? `${GUN_KISA[isoGun(g.bas) - 1]} ${tarihUzun(g.bas)}`
      : `${tarihUzun(g.bas)} – ${tarihUzun(g.bit)} (${g.gun} gün)`;

  return (
    <div className="space-y-3">
      <Panel
        title="Tatil günleri"
        icon={CalendarOff}
        id="ders-tatil"
        description="Tatilde ders yok sayılır: yoklama beklenmez, gecikme uyarısı ve hatırlatma gitmez, raporlarda sayılmaz."
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
              Başlangıç
              <input
                type="date"
                className="ui-field w-40"
                value={form.bas}
                onChange={(e) => setForm((f) => ({ ...f, bas: e.target.value, bit: f.bit < e.target.value ? e.target.value : f.bit }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
              Bitiş
              <input type="date" className="ui-field w-40" value={form.bit} min={form.bas} onChange={(e) => setForm((f) => ({ ...f, bit: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2 flex-1 min-w-[12rem]">
              Açıklama
              <input
                type="text"
                maxLength={80}
                className="ui-field w-full"
                placeholder="ör. Cumhuriyet Bayramı, Yarıyıl tatili"
                value={form.aciklama}
                onChange={(e) => setForm((f) => ({ ...f, aciklama: e.target.value }))}
              />
            </label>
            <button type="button" className={cx(BTN, 'w-28 ui-btn-primary')} onClick={() => void ekle()} disabled={mesgul} id="ders-tatil-ekle">
              <Plus className="w-3.5 h-3.5" /> Ekle
            </button>
          </div>

          {liste === null ? (
            <p className="text-xs text-muted">Yükleniyor…</p>
          ) : gorunen.length === 0 ? (
            <p className="text-xs text-muted">Yaklaşan tatil yok.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line" id="ders-tatil-liste">
              {gorunen.map((g) => (
                <li key={g.bas} className={cx('flex items-center gap-3 py-1.5', g.bit < bugun && 'opacity-60')}>
                  <span className="text-xs font-semibold text-fg tabular-nums min-w-[11rem]">{aralikYazi(g)}</span>
                  <span className="flex-1 min-w-0 text-xs text-fg-2 truncate">{g.aciklama || '—'}</span>
                  <button
                    type="button"
                    className="ui-btn ui-btn-sm ui-btn-secondary ui-btn-icon"
                    onClick={() => void sil(g)}
                    disabled={mesgul}
                    aria-label={`${aralikYazi(g)} tatilini kaldır`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {gecmis.length > 0 && (
            <button type="button" className="text-[11px] font-semibold text-brand-fg hover:underline" onClick={() => setTumu((v) => !v)}>
              {tumu ? 'Geçmiş tatilleri gizle' : `Geçmiş tatilleri göster (${gecmis.length})`}
            </button>
          )}
        </div>
      </Panel>

      <Panel
        title="Veliye devamsızlık bildirimi"
        icon={BellRing}
        id="ders-veli-bildirim"
        description="Derse gelmeyen ya da geç kalan öğrencinin velisine ne zaman haber gitsin?"
      >
        <div className="space-y-2">
          {!kayitli ? (
            <p className="text-xs text-warning-fg font-semibold">Önce yukarıdaki Ders saatlerini kaydedin.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" value={veli || 'gun_sonu'} onChange={(m) => void veliDegis(m)} items={VELI_SECENEK} />
              <InfoTip text="Gün sonu: son ders bitip gecikme süresi dolunca tek özet. Ders sonu: her ders bittikten sonra (yoklaması alınmışsa) en geç 10 dakika içinde. İkisi: her ikisi de gider." />
            </div>
          )}
          <p className="text-[11px] text-muted">
            Bildirim yalnız <b>Yönetim › Bildirim izinleri › Ders devamsızlığı › Veli</b> açıksa gider (e-posta / SMS). Ders sonu seçeneğinde SMS sayısı
            artabilir.
          </p>
        </div>
      </Panel>

      <Panel
        title="Devamsızlık sınırı uyarısı"
        icon={AlertTriangle}
        id="ders-devamsizlik-sinir"
        description="Özürsüz devamsızlık sınıra yaklaşınca ve sınıra ulaşınca idareye özet, veliye e-posta / SMS gider."
      >
        {!kayitli ? (
          <p className="text-xs text-warning-fg font-semibold">Önce yukarıdaki Ders saatlerini kaydedin.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
                Sınır (gün)
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="ui-field w-24"
                  value={sinir.sinir}
                  onChange={(e) => setSinir((x) => ({ ...x, sinir: e.target.value }))}
                  id="ders-sinir-gun"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
                Kaç gün kala uyarı
                <input
                  type="number"
                  min={0}
                  max={10}
                  className="ui-field w-24"
                  value={sinir.kala}
                  onChange={(e) => setSinir((x) => ({ ...x, kala: e.target.value }))}
                  id="ders-sinir-kala"
                />
              </label>
              <button
                type="button"
                className={cx(BTN, 'w-28 ui-btn-primary')}
                onClick={() => void sinirKaydetTik()}
                disabled={mesgul || !sinirGecerli || !sinirDegisti}
                id="ders-sinir-kaydet"
              >
                <Save className="w-3.5 h-3.5" /> Kaydet
              </button>
              <InfoTip text="Özürsüz gün: öğrencinin o gün yoklaması alınan bütün derslerinde 'Gelmedi' olması. İzinli / raporlu / geç sayılmaz. Eğitim yılı 1 Eylül'den sayılır. Her eşik için bir kez gönderilir." />
            </div>
            {!sinirGecerli && <p className="text-[11px] text-danger-fg font-semibold">Sınır 0–60, uyarı 0–10 gün olmalı.</p>}
            <p className="text-[11px] text-muted">
              {sinirKayitli.sinir === 0
                ? 'Kapalı (sınır 0).'
                : `${Math.max(sinirKayitli.sinir - sinirKayitli.kala, 1)}. günde uyarı, ${sinirKayitli.sinir}. günde "sınıra ulaştı" bildirimi. Veliye gitmesi için Bildirim izinleri › Ders devamsızlığı › Veli açık olmalı.`}
            </p>
          </div>
        )}
      </Panel>

      {mesaj && (
        <p role="status" className="text-xs font-semibold text-fg-2">
          {mesaj}
        </p>
      )}
    </div>
  );
};
