import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, CalendarRange, Check, Download, FileSpreadsheet, MapPin, Mic2, Minus, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { EmptyState, Modal, PageHeader, Panel, Segmented, cx } from '../ui/kit';
import { Yukleniyor } from '../ui/Durum'; // Aşama 305
import { SelectBox } from './FormParts';
import { appConfirm } from '../../lib/appDialog';
import { useQuickFocus } from '../../lib/quickFocus'; // Aşama 337
import { dataService } from '../../services/dataService';
import {
  AY_ADLARI,
  AY_KISA,
  BIRIMLER,
  GUN_KISA_PAZAR,
  KADEMELER,
  OKUL_AYLARI,
  SINIFLAR,
  ZUMRELER,
  araliktaMi,
  baslik,
  bugun,
  buyuk,
  egitimYili,
  etkinlikKademeleri,
  etkinlikKaydet,
  etkinlikleriSil,
  etkinlikler,
  gunAraligiYazi,
  gunEkle,
  kontrolIsaretle,
  pazartesi,
  satirAnahtari,
  sinifAdi,
  siniflarYazi,
  sonGun,
  takvimCanliDinle,
  takvimListesi,
  takvimYukle,
  tarihCoz,
  tarihYaz,
  yilAdi,
  yilAraligi,
  zumreAdi,
  zumreBransUyar,
  zumreKaydet,
  zumreListesi,
  type AktEtkinlik,
  type AktKademe,
  type AktKapsam,
  type AktKayit,
  type AktSatir,
  type AktYer,
  type YuklemeSonucu,
  type ZumreUye,
} from '../../services/akademikTakvimService';
import type { Teacher } from '../../types';
import { takvimExcelOku, takvimSablonIndir, type OkunanSatir } from '../../lib/akademikTakvimExcel';

// ============================================================================
// Aşama 242: AKADEMİK TAKVİM sayfası (kurum bölümü "Akademik takvim" açıksa menüde görünür)
//  * Herkes okur; kurum yöneticisi (Müdür, Müdür Yrd.) Excel yükler, etkinlik ekler / düzenler / siler, "kontrol" işaretler.
//  * Excel: kurumun kendi biçimi (her ay ayrı sayfa). Önce ekranda okunur ve gösterilir; "Kaydet"e basılınca yazılır.
//  * Ana sayfadaki "Haftanın faaliyetleri" aynı kayıtları okur; değişiklik anlık güncellemeyle her ekrana yayılır.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 justify-center';
type Bildirim = { tone: 'ok' | 'err'; text: string } | null;

// Aşama 327: birkaç gün süren etkinlikte kutuda gün aralığı ("15–19") ve gün sayısı; ay değişiyorsa ilk günün ayı
const DtKutu: React.FC<{ tarih: string; bitis?: string; ayIcinde?: boolean; vurgu?: boolean }> = ({ tarih, bitis, ayIcinde, vurgu }) => {
  const d = tarihCoz(tarih);
  if (ayIcinde) {
    // Aşama 327: günü belli olmayan etkinlik: ay adı + "ay içi"
    return (
      <span
        className={cx('w-12 h-12 shrink-0 rounded-xl flex flex-col items-center justify-center leading-none border border-dashed', vurgu ? 'bg-brand-soft text-brand-fg border-brand' : 'bg-surface-2 text-fg border-line-strong')}
        title={`${AY_ADLARI[d.getMonth()]} içinde (günü belli değil)`}
      >
        <b className="text-[13px] font-bold uppercase tracking-wide">{AY_KISA[d.getMonth()]}</b>
        <span className="text-[10px] font-semibold uppercase tracking-wide mt-0.5 text-muted">ay içi</span>
      </span>
    );
  }
  const e = bitis ? tarihCoz(bitis) : null;
  const gun = e ? Math.round((e.getTime() - d.getTime()) / 864e5) + 1 : 0;
  return (
    <span
      className={cx('w-12 h-12 shrink-0 rounded-xl flex flex-col items-center justify-center leading-none', vurgu ? 'bg-brand text-white' : 'bg-surface-2 text-fg')}
      title={e ? gunAraligiYazi({ tarih, bitis: bitis || '' }) : undefined}
    >
      <b className={cx('font-bold tabular-nums', e ? 'text-[13px] tracking-tight' : 'text-lg')}>{e ? `${d.getDate()}–${e.getDate()}` : d.getDate()}</b>
      <span className={cx('text-[10px] font-semibold uppercase tracking-wide mt-0.5', vurgu ? 'text-white/80' : 'text-muted')}>
        {e ? (e.getMonth() !== d.getMonth() ? AY_KISA[d.getMonth()] : `${gun} gün`) : GUN_KISA_PAZAR[d.getDay()]}
      </span>
    </span>
  );
};

/** Aşama 327: etkinliğin sürdüğü günler (YYYY-AA-GG) */
const gunleri = (g: Pick<AktKayit, 'tarih' | 'bitis' | 'ayIcinde'>): string[] => {
  const l: string[] = [];
  if (g.ayIcinde) return l; // günü belli değil: salon çakışması aranmaz
  for (let d = tarihCoz(g.tarih), son = sonGun(g); tarihYaz(d) <= son && l.length < 62; d = gunEkle(d, 1)) l.push(tarihYaz(d));
  return l;
};

/** Aşama 329: seçme kutusu (yarım seçimde çizgi) */
const SecKutusu: React.FC<{ durum: boolean | 'mixed'; onClick: () => void; etiket: string; id?: string }> = ({ durum, onClick, etiket, id }) => (
  <button
    type="button"
    id={id}
    role="checkbox"
    aria-checked={durum}
    aria-label={etiket}
    title={etiket}
    onClick={onClick}
    className="w-9 h-9 -m-2 shrink-0 grid place-items-center rounded-lg cursor-pointer hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 transition-colors"
  >
    <span
      className={cx(
        'w-[18px] h-[18px] rounded-[5px] border grid place-items-center transition-colors',
        durum ? 'bg-brand border-brand text-white' : 'bg-surface border-line-strong'
      )}
    >
      {durum === 'mixed' ? <Minus className="w-3 h-3" strokeWidth={3} /> : durum ? <Check className="w-3 h-3" strokeWidth={3} /> : null}
    </span>
  </button>
);

/** Aşama 330: üst kutular — başlık, alt alta seçim düğmeleri (sayılı), dipte kısa not; aynı sıradaki kutular eşit boy */
type KutuTon = 'warn' | 'ok' | 'bad';
const Kutu: React.FC<{ baslik: string; ek?: string; not?: string; children: React.ReactNode }> = ({ baslik, ek, not, children }) => (
  <section className="rounded-2xl bg-surface border border-line shadow-card p-3 flex flex-col gap-1.5 min-w-0" aria-label={baslik}>
    <h2 className="flex items-baseline justify-between gap-2 px-0.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted">
      {baslik}
      {ek && <span className="text-[11px] font-semibold normal-case tracking-normal text-subtle truncate">{ek}</span>}
    </h2>
    {children}
    {not && <p className="mt-auto pt-1 px-0.5 text-[11px] leading-snug text-subtle">{not}</p>}
  </section>
);
const KutuSecenek: React.FC<{ id: string; etiket: string; alt?: string; n: number; ton?: KutuTon; secili: boolean; onClick: () => void }> = ({ id, etiket, alt, n, ton, secili, onClick }) => (
  <button
    type="button"
    id={id}
    aria-pressed={secili}
    onClick={onClick}
    className={cx(
      'h-8 w-full flex items-center gap-2 pl-2.5 pr-1.5 rounded-lg text-left text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
      secili ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg'
    )}
  >
    <span className="flex-1 min-w-0 truncate">
      {etiket}
      {alt && <span className={cx('hidden sm:inline ml-1 font-medium', secili ? 'opacity-60' : 'text-subtle')}>{alt}</span>}
    </span>
    <span
      className={cx(
        'min-w-7 h-[22px] px-1.5 rounded-md grid place-items-center text-[11px] tabular-nums',
        secili
          ? 'bg-canvas/15'
          : !n
            ? 'bg-surface text-subtle'
            : ton === 'warn'
              ? 'bg-warning-soft text-warning-fg'
              : ton === 'ok'
                ? 'bg-success-soft text-success-fg'
                : ton === 'bad'
                  ? 'bg-danger-soft text-danger-fg'
                  : 'bg-surface text-fg'
      )}
    >
      {n}
    </span>
  </button>
);
type Odak = '' | 'gun' | 'hafta' | 'ay' | 'dis' | 'salon' | 'kontrolEdilen' | 'kontrolEdilmeyen';
const ODAK_ADI: Record<Exclude<Odak, ''>, string> = {
  gun: 'Bugün',
  hafta: 'Bu hafta',
  ay: 'Bu ay',
  dis: 'Okul dışı çakışmaları',
  salon: 'Konferans salonu çakışmaları',
  kontrolEdilen: 'Geçmiş · kontrol edilen',
  kontrolEdilmeyen: 'Geçmiş · kontrol edilmeyen',
};

export const AkademikTakvim: React.FC = () => {
  const kurumId = dataService.getMyKurumId();
  const yonetir = dataService.canManageAkademikTakvim();
  const [yil, setYil] = useState(() => egitimYili());
  const [kayitlar, setKayitlar] = useState<AktKayit[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [ay, setAy] = useState(0);
  const [fSinif, setFSinif] = useState('');
  const [fZumre, setFZumre] = useState(''); // Aşama 327: zümre süzgeci
  const [fKapsam, setFKapsam] = useState<'' | AktKapsam>('');
  const [fYer, setFYer] = useState<'' | AktYer>('');
  const [kademe, setKademe] = useState<'' | AktKademe>(''); // Aşama 330
  const [odak, setOdak] = useState<Odak>(''); // Aşama 330: zaman / çakışma / kontrol kutusu seçimi
  const [duzenle, setDuzenle] = useState<AktEtkinlik | 'yeni' | null>(null);
  const [excelAcik, setExcelAcik] = useState(false);
  const [zumreAcik, setZumreAcik] = useState(false); // Aşama 328
  const [secim, setSecim] = useState<Set<string>>(() => new Set()); // Aşama 329: toplu silme
  const [siliniyor, setSiliniyor] = useState(false);
  // Aşama 337: ana sayfadan bir etkinliğe basılınca yalnız o etkinlik gösterilir ("Bütün takvim" ile çıkılır)
  const [tek, setTek] = useState<string | null>(null);
  useQuickFocus(['takvim'], (f) => {
    setTek(f.id);
    setOdak('');
    setAy(0);
    setKademe('');
    setFSinif('');
    setFZumre('');
    setFKapsam('');
    setFYer('');
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.label)) setYil(egitimYili(tarihCoz(f.label)));
  });

  const yukle = useCallback(async () => {
    if (!kurumId) return;
    const { bas, bit } = yilAraligi(yil);
    try {
      setKayitlar(await takvimListesi(kurumId, bas, bit));
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Takvim okunamadı.');
    } finally {
      setYukleniyor(false);
    }
  }, [kurumId, yil]);
  useEffect(() => {
    setYukleniyor(true);
    void yukle();
  }, [yukle]);
  useEffect(() => takvimCanliDinle(kurumId, () => void yukle()), [kurumId, yukle]);
  useEffect(() => {
    if (!bildirim) return;
    const t = setTimeout(() => setBildirim(null), 3200);
    return () => clearTimeout(t);
  }, [bildirim]);

  const hepsi = useMemo(() => etkinlikler(kayitlar), [kayitlar]);
  const bugunS = tarihYaz(bugun());
  const hafta = useMemo(() => {
    const p = pazartesi(bugun());
    return { bas: tarihYaz(p), bit: tarihYaz(gunEkle(p, 6)) };
  }, []);
  // Aşama 330: aynı gün kaç salon / okul dışı etkinliği var (çakışma = 2 ve üstü)
  const { salonGun, disGun } = useMemo(() => {
    const salon: Record<string, number> = {};
    const dis: Record<string, number> = {};
    hepsi.forEach((g) =>
      gunleri(g).forEach((t) => {
        if (g.salon) salon[t] = (salon[t] || 0) + 1;
        if (g.yer === 'dis') dis[t] = (dis[t] || 0) + 1;
      })
    );
    return { salonGun: salon, disGun: dis };
  }, [hepsi]);
  const salonCakisir = (g: AktEtkinlik) => g.salon && gunleri(g).some((t) => salonGun[t] > 1);
  const disCakisir = (g: AktEtkinlik) => g.yer === 'dis' && gunleri(g).some((t) => disGun[t] > 1);
  const kademeleri = useMemo(() => new Map(hepsi.map((g) => [g.key, etkinlikKademeleri(g)])), [hepsi]);
  const ayBas = bugunS.slice(0, 8) + '01';
  const aySon = tarihYaz(new Date(bugun().getFullYear(), bugun().getMonth() + 1, 0));
  const odakUyar: Record<Exclude<Odak, ''>, (g: AktEtkinlik) => boolean> = {
    gun: (g) => !g.ayIcinde && araliktaMi(g, bugunS, bugunS),
    hafta: (g) => !g.ayIcinde && araliktaMi(g, hafta.bas, hafta.bit),
    ay: (g) => araliktaMi(g, ayBas, aySon),
    dis: disCakisir,
    salon: salonCakisir,
    kontrolEdilen: (g) => sonGun(g) < bugunS && g.kontrol,
    kontrolEdilmeyen: (g) => sonGun(g) < bugunS && !g.kontrol,
  };
  // Süzgeç sırası: kademe + sınıf + zümre (taban) → kutu seçimi → ay → kapsam → yer
  const sinifZumreUyar = (g: AktEtkinlik) => (!fSinif || g.siniflar.includes(fSinif)) && (!fZumre || buyuk(g.zumre) === fZumre);
  const taban = (g: AktEtkinlik) => (!kademe || !!kademeleri.get(g.key)?.has(kademe)) && sinifZumreUyar(g);
  const odakta = (g: AktEtkinlik) => !odak || odakUyar[odak](g);
  const kapsamUyar = (g: AktEtkinlik) => !fKapsam || g.kapsam === fKapsam;
  const yerUyar = (g: AktEtkinlik) => !fYer || g.yer === fYer;
  // Salon ve servis bütün okulun ortak işi: çakışma görünümünde kademe / sınıf / zümre süzgeci uygulanmaz (çakışan iki taraf da görünsün)
  const cakismaGorunumu = odak === 'dis' || odak === 'salon';
  const tabanda = (g: AktEtkinlik) => cakismaGorunumu || taban(g);
  const uyar = (g: AktEtkinlik) => taban(g) && kapsamUyar(g) && yerUyar(g);
  // Aşama 327: zümre listesi = bilinen zümreler + takvimde geçen başka zümre adları (sayısıyla)
  const zumreler = useMemo(() => {
    const say = new Map<string, number>();
    hepsi.forEach((g) => g.zumre && say.set(buyuk(g.zumre), (say.get(buyuk(g.zumre)) || 0) + 1));
    const ek = [...say.keys()].filter((z) => !(ZUMRELER as readonly string[]).includes(z)).sort((a, b) => a.localeCompare(b, 'tr'));
    return [...ZUMRELER, ...ek].map((z) => ({ z, n: say.get(z) || 0 }));
  }, [hepsi]);
  const ayOf = (g: AktEtkinlik) => tarihCoz(g.tarih).getMonth() + 1;
  const ayda = (g: AktEtkinlik) => !!odak || !ay || ayOf(g) === ay;
  const gorunen = tek ? hepsi.filter((g) => g.key === tek) : hepsi.filter((g) => tabanda(g) && kapsamUyar(g) && yerUyar(g) && odakta(g) && ayda(g));
  // Aşama 329: seçim yalnız ekranda görünen etkinliklerde geçerli (süzgeç değişince gizlenen seçili kalmaz)
  const secili = gorunen.filter((g) => secim.has(g.key));
  const hepsiSecili = gorunen.length > 0 && secili.length === gorunen.length;
  const sec = (k: string) =>
    setSecim((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const tumunuSec = () => setSecim(hepsiSecili ? new Set() : new Set(gorunen.map((g) => g.key)));
  const seciliSil = async () => {
    if (!secili.length || siliniyor) return;
    const ok = await appConfirm({
      title: `${secili.length} etkinlik silinsin mi?`,
      message: `${secili.length === 1 ? `"${baslik(secili[0].ad)}"` : 'Seçilen etkinlikler'} bütün sınıflarıyla takvimden silinir. Bu işlem geri alınamaz.`,
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    setSiliniyor(true);
    try {
      const n = await etkinlikleriSil(secili.flatMap((g) => g.ids));
      setSecim(new Set());
      setBildirim({ tone: 'ok', text: `${secili.length} etkinlik silindi (${n} sınıf kaydı).` });
      await yukle();
    } catch (e: any) {
      setBildirim({ tone: 'err', text: e?.message || 'Silinemedi.' });
    } finally {
      setSiliniyor(false);
    }
  };

  const kontrolDegis = async (g: AktEtkinlik) => {
    try {
      await kontrolIsaretle(g.ids, !g.kontrol);
      await yukle();
    } catch (e: any) {
      setBildirim({ tone: 'err', text: e?.message || 'Kaydedilemedi.' });
    }
  };

  if (!kurumId) {
    return <EmptyState icon={CalendarRange} title="Akademik takvim kuruma bağlı çalışır" description="Bu bölüm yalnız açıldığı kurumda kullanılır." />;
  }

  const yillar = [egitimYili() - 1, egitimYili(), egitimYili() + 1];
  const say = (f: (g: AktEtkinlik) => boolean) => hepsi.filter(f).length;
  // Aşama 330: kutu yardımcıları
  const kademeSec = (k: '' | AktKademe) => {
    setKademe(k);
    if (k && fSinif && !KADEMELER[k].siniflar.includes(fSinif)) setFSinif('');
    if (k && fZumre && !KADEMELER[k].zumreler.includes(fZumre)) setFZumre('');
  };
  const odakSec = (o: Odak) => setOdak((p) => (p === o ? '' : o));
  const cakisanGun = (gun: Record<string, number>, f: (g: AktEtkinlik) => boolean) =>
    new Set(hepsi.filter(f).flatMap((g) => gunleri(g).filter((t) => gun[t] > 1))).size;
  const kEdilen = say((g) => taban(g) && odakUyar.kontrolEdilen(g));
  const kEdilmeyen = say((g) => taban(g) && odakUyar.kontrolEdilmeyen(g));
  const kontrolNotu = kEdilen + kEdilmeyen ? `${kEdilen + kEdilmeyen} geçmiş etkinliğin %${Math.round((kEdilen * 100) / (kEdilen + kEdilmeyen))}'i kontrol edildi` : 'Geçmiş etkinlik yok';
  const sinifSecenek = kademe ? KADEMELER[kademe].siniflar : SINIFLAR;
  const zumreSecenek = kademe ? zumreler.filter(({ z }) => KADEMELER[kademe].zumreler.includes(z)) : zumreler;
  const segSay = (f: (g: AktEtkinlik) => boolean) => say((g) => tabanda(g) && odakta(g) && ayda(g) && f(g));
  const sayiEk = (n: number) => <span className="tabular-nums font-medium text-subtle">({n})</span>;

  return (
    <div className="space-y-5" id="akademik-takvim">
      <PageHeader
        icon={CalendarRange}
        title="Akademik takvim"
        description={`${yilAdi(yil)} eğitim öğretim yılı · öğrenci ve veli etkinlikleri. Ana sayfadaki "Haftanın faaliyetleri" buradan gelir.`}
        actions={
          <>
            <div className="w-36">
              <SelectBox id="akt-yil" aria-label="Eğitim öğretim yılı" value={yil} onChange={(e) => setYil(Number(e.target.value))}>
                {yillar.map((y) => (
                  <option key={y} value={y}>
                    {yilAdi(y)}
                  </option>
                ))}
              </SelectBox>
            </div>
            {yonetir && (
              <>
                <button type="button" id="akt-sablon" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={() => void takvimSablonIndir(yil)}>
                  <Download className="w-3.5 h-3.5" /> Şablon
                </button>
                <button type="button" id="akt-zumreler" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={() => setZumreAcik(true)}>
                  <Users className="w-3.5 h-3.5" /> Zümreler
                </button>
                <button type="button" id="akt-ekle" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={() => setDuzenle('yeni')}>
                  <Plus className="w-3.5 h-3.5" /> Etkinlik ekle
                </button>
                <button type="button" id="akt-excel" className={cx(BTN, 'w-28 ui-btn-primary')} onClick={() => setExcelAcik(true)}>
                  <Upload className="w-3.5 h-3.5" /> Excel yükle
                </button>
              </>
            )}
          </>
        }
      />

      {bildirim && (
        <div role="status" className={cx('rounded-xl px-4 py-2.5 text-xs font-semibold', bildirim.tone === 'ok' ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg')}>
          {bildirim.text}
        </div>
      )}
      {hata && (
        <div role="alert" className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-danger-soft text-danger-fg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {hata}
        </div>
      )}

      {/* Aşama 330: dört kutu — kademe, zaman, çakışmalar, kontrol (düğmeler süzgeçtir; sayılar seçili kademe/sınıf/zümreye göre) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 items-stretch">
        <Kutu baslik="Kademe" ek={kademe ? KADEMELER[kademe].ad : undefined}>
          <KutuSecenek id="akt-kademe-tumu" etiket="Tüm okul" n={say(sinifZumreUyar)} secili={!kademe} onClick={() => kademeSec('')} />
          {(Object.keys(KADEMELER) as AktKademe[]).map((k) => (
            <KutuSecenek
              key={k}
              id={`akt-kademe-${k}`}
              etiket={KADEMELER[k].ad}
              n={say((g) => sinifZumreUyar(g) && !!kademeleri.get(g.key)?.has(k))}
              secili={kademe === k}
              onClick={() => kademeSec(k)}
            />
          ))}
        </Kutu>
        <Kutu baslik="Zaman" not="Bugün, bu hafta ve bu ayın etkinlikleri">
          <KutuSecenek id="akt-odak-gun" etiket="Gün" alt={`${tarihCoz(bugunS).getDate()} ${AY_KISA[tarihCoz(bugunS).getMonth()]}`} n={say((g) => taban(g) && odakUyar.gun(g))} secili={odak === 'gun'} onClick={() => odakSec('gun')} />
          <KutuSecenek id="akt-odak-hafta" etiket="Hafta" alt={gunAraligiYazi({ tarih: hafta.bas, bitis: hafta.bit })} n={say((g) => taban(g) && odakUyar.hafta(g))} secili={odak === 'hafta'} onClick={() => odakSec('hafta')} />
          <KutuSecenek id="akt-odak-ay" etiket="Ay" alt={AY_ADLARI[tarihCoz(bugunS).getMonth()]} n={say((g) => taban(g) && odakUyar.ay(g))} secili={odak === 'ay'} onClick={() => odakSec('ay')} />
        </Kutu>
        <Kutu baslik="Çakışmalar" ek="bütün okul" not={`${cakisanGun(disGun, disCakisir)} günde okul dışı, ${cakisanGun(salonGun, salonCakisir)} günde salon çakışıyor`}>
          <KutuSecenek id="akt-odak-dis" etiket="Okul dışı" n={say(disCakisir)} ton="warn" secili={odak === 'dis'} onClick={() => odakSec('dis')} />
          <KutuSecenek id="akt-odak-salon" etiket="Konferans" n={say(salonCakisir)} ton="warn" secili={odak === 'salon'} onClick={() => odakSec('salon')} />
        </Kutu>
        <Kutu baslik="Kontrol" ek="geçmiş" not={kontrolNotu}>
          <KutuSecenek id="akt-odak-kontrol-edilen" etiket="Kontrol edilen" n={kEdilen} ton="ok" secili={odak === 'kontrolEdilen'} onClick={() => odakSec('kontrolEdilen')} />
          <KutuSecenek id="akt-odak-kontrol-edilmeyen" etiket="Kontrol edilmeyen" n={kEdilmeyen} ton="bad" secili={odak === 'kontrolEdilmeyen'} onClick={() => odakSec('kontrolEdilmeyen')} />
        </Kutu>
      </div>

      <Panel padded={false}>
        <div className="p-4 sm:p-5 space-y-3 border-b border-line">
          {/* Aylar: eşit genişlikte, altında etkinlik sayısı */}
          <div className="grid grid-flow-col auto-cols-[64px] sm:auto-cols-fr gap-1 p-1 rounded-xl bg-surface-2 border border-line overflow-x-auto" role="tablist" aria-label="Ay">
            {[0, ...OKUL_AYLARI].map((m) => {
              const n = hepsi.filter((g) => uyar(g) && (!m || ayOf(g) === m)).length;
              const aktif = !odak && ay === m;
              const simdi = m === tarihCoz(bugunS).getMonth() + 1;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={aktif}
                  id={`akt-ay-${m}`}
                  onClick={() => (setAy(m), setOdak(''))}
                  className={cx(
                    'h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors cursor-pointer',
                    aktif ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
                    !n && !aktif && 'opacity-50'
                  )}
                >
                  <span className="flex items-center gap-1">
                    {m ? AY_KISA[m - 1] : 'Tümü'}
                    {simdi && <span className="w-1 h-1 rounded-full bg-brand" aria-label="bu ay" />}
                  </span>
                  <span className={cx('text-[10px] tabular-nums', aktif ? 'text-brand-fg' : 'text-subtle')}>{n || '–'}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <SelectBox id="akt-sinif" aria-label="Sınıf" value={fSinif} onChange={(e) => setFSinif(e.target.value)}>
                <option value="">Bütün sınıflar</option>
                {sinifSecenek.map((s) => (
                  <option key={s} value={s}>
                    {sinifAdi(s)}
                  </option>
                ))}
              </SelectBox>
            </div>
            {/* Aşama 327: zümre süzgeci (Aşama 330: seçili kademenin zümreleri) */}
            <div className="w-52">
              <SelectBox id="akt-zumre-suzgec" aria-label="Zümre" value={fZumre} onChange={(e) => setFZumre(e.target.value)}>
                <option value="">{kademe ? `${KADEMELER[kademe].ad} zümreleri` : 'Zümre seçiniz'}</option>
                {zumreSecenek.map(({ z, n }) => (
                  <option key={z} value={z}>
                    {baslik(z)}
                    {n ? ` (${n})` : ''}
                  </option>
                ))}
              </SelectBox>
            </div>
            <Segmented
              size="sm"
              value={fKapsam}
              onChange={setFKapsam}
              items={[
                { value: '', label: 'Tümü', badge: sayiEk(segSay(yerUyar)), id: 'akt-kapsam-tumu' },
                { value: 'ogrenci', label: 'Öğrenci', badge: sayiEk(segSay((g) => yerUyar(g) && g.kapsam === 'ogrenci')), id: 'akt-kapsam-ogrenci' },
                { value: 'veli', label: 'Veli', badge: sayiEk(segSay((g) => yerUyar(g) && g.kapsam === 'veli')), id: 'akt-kapsam-veli' },
              ]}
            />
            <Segmented
              size="sm"
              value={fYer}
              onChange={setFYer}
              items={[
                { value: '', label: 'Tümü', badge: sayiEk(segSay(kapsamUyar)), id: 'akt-yer-tumu' },
                { value: 'ic', label: 'Okul içi', badge: sayiEk(segSay((g) => kapsamUyar(g) && g.yer === 'ic')), id: 'akt-yer-ic' },
                { value: 'dis', label: 'Okul dışı', badge: sayiEk(segSay((g) => kapsamUyar(g) && g.yer === 'dis')), id: 'akt-yer-dis' },
              ]}
            />
          </div>
        </div>

        {/* Aşama 337: ana sayfadan gelen tek etkinlik */}
        {tek && (
          <div className="flex items-center gap-3 px-4 sm:px-5 h-12 border-b border-line bg-brand-soft/60" role="status" id="akt-tek">
            <span className="text-xs font-semibold text-brand-fg truncate">Seçilen etkinlik gösteriliyor</span>
            <button type="button" id="akt-tek-temizle" className={cx(BTN, 'w-28 ui-btn-secondary ml-auto')} onClick={() => setTek(null)}>
              Bütün takvim
            </button>
          </div>
        )}
        {/* Aşama 330: kutudan seçilen görünüm */}
        {odak && !tek && (
          <div className="flex items-center gap-3 px-4 sm:px-5 h-11 border-b border-line bg-brand-soft/60" role="status">
            <span className="text-xs font-semibold text-brand-fg truncate">
              {odak === 'ay' ? `Bu ay · ${AY_ADLARI[tarihCoz(bugunS).getMonth()]}` : ODAK_ADI[odak]} · {gorunen.length} etkinlik
            </span>
            <button type="button" id="akt-odak-temizle" className={cx(BTN, 'w-28 ui-btn-secondary ml-auto')} onClick={() => setOdak('')}>
              Temizle
            </button>
          </div>
        )}
        {/* Aşama 329: toplu seçim ve silme */}
        {yonetir && !yukleniyor && gorunen.length > 0 && (
          <div className={cx('flex items-center gap-3 px-4 sm:px-5 h-12 border-b border-line transition-colors', secili.length ? 'bg-brand-soft/50' : 'bg-surface-2/60')}>
            <SecKutusu id="akt-tumunu-sec" durum={hepsiSecili ? true : secili.length ? 'mixed' : false} onClick={tumunuSec} etiket={hepsiSecili ? 'Seçimi kaldır' : 'Görünen etkinliklerin hepsini seç'} />
            <span className="text-xs font-semibold text-fg-2 tabular-nums whitespace-nowrap">
              {secili.length ? (
                <>
                  {secili.length}
                  <span className="hidden sm:inline"> / {gorunen.length} etkinlik</span> seçildi
                </>
              ) : (
                `Tümünü seç · ${gorunen.length} etkinlik`
              )}
            </span>
            {secili.length > 0 && (
              <span className="ml-auto flex items-center gap-2">
                <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={() => setSecim(new Set())} disabled={siliniyor}>
                  Vazgeç
                </button>
                <button type="button" id="akt-secili-sil" className={cx(BTN, 'w-28 ui-btn-danger')} onClick={() => void seciliSil()} disabled={siliniyor}>
                  <Trash2 className="w-3.5 h-3.5" /> {siliniyor ? 'Siliniyor…' : 'Sil'}
                </button>
              </span>
            )}
          </div>
        )}
        {yukleniyor ? (
          <Yukleniyor metin="Takvim yükleniyor…" className="p-5" />
        ) : !gorunen.length ? (
          <EmptyState
            icon={CalendarRange}
            title={hepsi.length ? 'Bu seçimde etkinlik yok' : `${yilAdi(yil)} takvimi henüz yüklenmedi`}
            description={hepsi.length ? (odak ? 'Bu kutuda gösterilecek etkinlik yok.' : 'Ayı ya da süzgeci değiştirin.') : yonetir ? 'Kurumun Excel takvimini yükleyin ya da etkinlikleri tek tek ekleyin.' : 'Takvim kurum yönetimi tarafından yüklenecek.'}
            action={
              !hepsi.length && yonetir ? (
                <button type="button" className={cx(BTN, 'w-28 ui-btn-primary')} onClick={() => setExcelAcik(true)}>
                  <Upload className="w-3.5 h-3.5" /> Excel yükle
                </button>
              ) : undefined
            }
          />
        ) : (
          OKUL_AYLARI.map((m) => {
            const liste = gorunen.filter((g) => ayOf(g) === m);
            if (!liste.length) return null;
            return (
              <section key={m} className="px-4 sm:px-5 py-3 border-b border-line last:border-b-0" aria-labelledby={`akt-ay-baslik-${m}`}>
                <h3 id={`akt-ay-baslik-${m}`} className="flex items-baseline gap-2 py-1">
                  <span className="text-base font-bold text-fg">{AY_ADLARI[m - 1]}</span>
                  <span className="text-xs text-muted">
                    {m >= 9 ? yil : yil + 1} · {liste.length} etkinlik
                  </span>
                </h3>
                <ul className="divide-y divide-line">
                  {liste.map((g, i) => {
                    // Aşama 330: çakışma görünümünde aynı gün bir başlık altında
                    const gunBasi = cakismaGorunumu && (i === 0 || liste[i - 1].tarih !== g.tarih);
                    const buHafta = !g.ayIcinde && araliktaMi(g, hafta.bas, hafta.bit);
                    const buAy = g.ayIcinde && araliktaMi(g, bugunS, bugunS); // Aşama 327
                    const gecti = sonGun(g) < bugunS && !buHafta;
                    const meta = [siniflarYazi(g.siniflar), g.birim && baslik(g.birim), g.zumre && baslik(g.zumre)].filter(Boolean).join(' · ');
                    const icerik = (
                      <>
                        <DtKutu tarih={g.tarih} bitis={g.bitis} ayIcinde={g.ayIcinde} vurgu={buHafta || buAy} />
                        <span className="min-w-0 flex-1">
                          <b className="block text-sm font-semibold text-fg truncate">{baslik(g.ad)}</b>
                          <span className="block text-xs text-muted truncate mt-0.5">{meta}</span>
                        </span>
                        <span className="hidden md:flex flex-wrap justify-end gap-1.5">
                          {buHafta && <span className="ui-chip ui-chip-brand">Bu hafta</span>}
                          {g.ayIcinde && <span className={cx('ui-chip', buAy ? 'ui-chip-brand' : 'ui-chip-neutral')}>{buAy ? 'Bu ay' : 'Ay içinde'}</span>}
                          {gecti && <span className="ui-chip ui-chip-neutral">Geçti</span>}
                          {disCakisir(g) && <span className="ui-chip ui-chip-warning">Okul dışı çakışıyor</span>}
                          {salonCakisir(g) && <span className="ui-chip ui-chip-warning">Salon çakışıyor</span>}
                          <span className={cx('ui-chip', g.kapsam === 'veli' ? 'ui-chip-warning' : 'ui-chip-brand')}>{g.kapsam === 'veli' ? 'Veli' : 'Öğrenci'}</span>
                          <span className="ui-chip ui-chip-neutral">
                            {g.yer === 'dis' && <MapPin className="w-3 h-3" />}
                            {g.yer === 'dis' ? 'Okul dışı' : 'Okul içi'}
                          </span>
                          {g.salon && (
                            <span className="ui-chip ui-chip-info">
                              <Mic2 className="w-3 h-3" /> Salon
                            </span>
                          )}
                        </span>
                      </>
                    );
                    return (
                      <React.Fragment key={g.key}>
                      {gunBasi && (
                        <li className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-warning-fg" aria-hidden>
                          {tarihCoz(g.tarih).getDate()} {AY_ADLARI[m - 1]} · çakışma
                        </li>
                      )}
                      <li className={cx('flex items-center gap-3 py-2.5', gecti && !secim.has(g.key) && 'opacity-60')}>
                        {yonetir && <SecKutusu durum={secim.has(g.key)} onClick={() => sec(g.key)} etiket={`${baslik(g.ad)} seç`} />}
                        {yonetir ? (
                          <button
                            type="button"
                            className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl -mx-1 px-1 py-1 hover:bg-surface-2 transition-colors cursor-pointer"
                            onClick={() => setDuzenle(g)}
                            aria-label={`${baslik(g.ad)}, düzenle`}
                          >
                            {icerik}
                          </button>
                        ) : (
                          <div className="flex items-center gap-3 min-w-0 flex-1">{icerik}</div>
                        )}
                        {yonetir ? (
                          <button
                            type="button"
                            aria-pressed={g.kontrol}
                            onClick={() => void kontrolDegis(g)}
                            className={cx(BTN, 'w-28 shrink-0', g.kontrol ? 'ui-btn-success' : 'ui-btn-secondary')}
                            title="Etkinlik kontrol edildi mi"
                          >
                            <Check className="w-3.5 h-3.5" /> {g.kontrol ? 'Kontrol edildi' : 'Kontrol'}
                          </button>
                        ) : (
                          g.kontrol && <span className="ui-chip ui-chip-success shrink-0">Kontrol edildi</span>
                        )}
                      </li>
                      </React.Fragment>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </Panel>

      {yonetir && (
        <EtkinlikPenceresi
          acik={duzenle !== null}
          etkinlik={duzenle && duzenle !== 'yeni' ? duzenle : null}
          yil={yil}
          hepsi={hepsi}
          onClose={() => setDuzenle(null)}
          onBitti={async (text) => {
            setDuzenle(null);
            setBildirim({ tone: 'ok', text });
            await yukle();
          }}
        />
      )}
      {yonetir && (
        <ExcelPenceresi acik={excelAcik} yil={yil} kayitlar={kayitlar} onClose={() => setExcelAcik(false)} onYazildi={yukle} />
      )}
      {yonetir && (
        <ZumrelerPenceresi
          acik={zumreAcik}
          zumreler={zumreler}
          ilkZumre={fZumre}
          onClose={() => setZumreAcik(false)}
          onBitti={(text) => {
            setZumreAcik(false);
            setBildirim({ tone: 'ok', text });
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------- etkinlik ekle / düzenle
const EtkinlikPenceresi: React.FC<{
  acik: boolean;
  etkinlik: AktEtkinlik | null;
  yil: number;
  hepsi: AktEtkinlik[];
  onClose: () => void;
  onBitti: (text: string) => void | Promise<void>;
}> = ({ acik, etkinlik, yil, hepsi, onClose, onBitti }) => {
  const [ad, setAd] = useState('');
  const [tarih, setTarih] = useState('');
  const [bitis, setBitis] = useState(''); // Aşama 327: isteğe bağlı son gün
  const [ayIcinde, setAyIcinde] = useState(false); // Aşama 327: günü belli değil, ay içinde
  const [birim, setBirim] = useState('ORTAOKUL');
  const [zumre, setZumre] = useState('');
  const [siniflar, setSiniflar] = useState<string[]>([]);
  const [kapsam, setKapsam] = useState<AktKapsam>('ogrenci');
  const [yer, setYer] = useState<AktYer>('ic');
  const [salon, setSalon] = useState<'0' | '1'>('0');
  const [denendi, setDenendi] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const { bas, bit } = yilAraligi(yil);

  useEffect(() => {
    if (!acik) return;
    setAd(etkinlik ? baslik(etkinlik.ad) : '');
    setTarih(etkinlik?.tarih || '');
    setBitis(etkinlik?.ayIcinde ? '' : etkinlik?.bitis || '');
    setAyIcinde(!!etkinlik?.ayIcinde);
    setBirim(etkinlik?.birim || 'ORTAOKUL');
    setZumre(etkinlik?.zumre || '');
    setSiniflar(etkinlik ? etkinlik.siniflar.filter(Boolean) : []);
    setKapsam(etkinlik?.kapsam || 'ogrenci');
    setYer(etkinlik?.yer || 'ic');
    setSalon(etkinlik?.salon ? '1' : '0');
    setDenendi(false);
    setHata(null);
  }, [acik, etkinlik]);

  const okAd = ad.trim().length > 0;
  const okTarih = !!tarih && tarih >= bas && tarih <= bit;
  const bitisGun = tarih && bitis ? Math.round((tarihCoz(bitis).getTime() - tarihCoz(tarih).getTime()) / 864e5) : 0;
  const okBitis = ayIcinde || !bitis || (bitisGun >= 0 && bitisGun <= 60 && bitis <= bit);
  const okSinif = siniflar.length > 0;
  const kayitBitis = ayIcinde ? '' : bitis && bitis > tarih ? bitis : ''; // aynı gün seçildiyse tek günlük; ay içinde: sunucu kurar
  const aySecenek = OKUL_AYLARI.map((m) => `${m >= 9 ? yil : yil + 1}-${String(m).padStart(2, '0')}-01`);
  const salonCakisma =
    salon === '1' && tarih && !ayIcinde ? hepsi.find((g) => g.salon && g.key !== etkinlik?.key && araliktaMi(g, tarih, kayitBitis || tarih)) : undefined;

  const kaydet = async () => {
    setDenendi(true);
    if (!okAd || !okTarih || !okBitis || !okSinif || mesgul) return;
    setMesgul(true);
    setHata(null);
    const ortak = { tarih: ayIcinde ? `${tarih.slice(0, 7)}-01` : tarih, bitis: kayitBitis, ayIcinde, ad: buyuk(ad), birim, zumre, kapsam, yer, salon: salon === '1', kontrol: etkinlik?.kontrol || false };
    try {
      await etkinlikKaydet(etkinlik?.ids || [], siniflar.map((s) => ({ ...ortak, sinif: s })));
      await onBitti(etkinlik ? 'Etkinlik güncellendi.' : 'Etkinlik takvime eklendi.');
    } catch (e: any) {
      setHata(e?.message || 'Kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };
  const sil = async () => {
    if (!etkinlik || mesgul) return;
    const ok = await appConfirm({ title: 'Etkinlik silinsin mi?', message: `"${baslik(etkinlik.ad)}" (${siniflarYazi(etkinlik.siniflar)}) takvimden silinecek.`, confirmText: 'Sil', danger: true });
    if (!ok) return;
    setMesgul(true);
    try {
      await etkinlikKaydet(etkinlik.ids, []);
      await onBitti('Etkinlik takvimden silindi.');
    } catch (e: any) {
      setHata(e?.message || 'Silinemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const hataCls = (bad: boolean) => cx('ui-field w-full', denendi && bad && 'border-danger');
  return (
    <Modal
      open={acik}
      onClose={onClose}
      icon={CalendarRange}
      title={etkinlik ? 'Etkinliği düzenle' : 'Etkinlik ekle'}
      description="Akademik takvime yazılır; ana sayfada haftasında görünür."
      id="akt-etkinlik-pencere"
      footer={
        <>
          {etkinlik && (
            <button type="button" className={cx(BTN, 'ui-btn-danger-soft mr-auto')} onClick={() => void sil()} disabled={mesgul}>
              <Trash2 className="w-3.5 h-3.5" /> Sil
            </button>
          )}
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose} disabled={mesgul}>
            Vazgeç
          </button>
          <button type="button" id="akt-etkinlik-kaydet" className={cx(BTN, 'ui-btn-primary')} onClick={() => void kaydet()} disabled={mesgul}>
            {mesgul ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="akt-ad" className="ui-label">Etkinlik adı</label>
          <input id="akt-ad" className={hataCls(!okAd)} maxLength={200} value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Örn. Bilim Merkezi gezisi" />
          {denendi && !okAd && <p className="text-[11px] font-semibold text-danger-fg mt-1">Etkinlik adını yazın.</p>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ayIcinde ? (
            // Aşama 327: günü belli olmayan etkinlik yalnız ay seçer
            <div className="col-span-2 sm:col-span-2">
              <label htmlFor="akt-ay" className="ui-label">Ay</label>
              <SelectBox id="akt-ay" className={cx(hataCls(!okTarih), 'cursor-pointer')} value={tarih ? `${tarih.slice(0, 7)}-01` : ''} onChange={(e) => setTarih(e.target.value)}>
                <option value="">Ay seçiniz</option>
                {aySecenek.map((t) => (
                  <option key={t} value={t}>
                    {AY_ADLARI[tarihCoz(t).getMonth()]} {t.slice(0, 4)}
                  </option>
                ))}
              </SelectBox>
              {denendi && !okTarih && <p className="text-[11px] font-semibold text-danger-fg mt-1">Ayı seçin.</p>}
            </div>
          ) : (
          <>
          <div>
            <label htmlFor="akt-tarih" className="ui-label">{bitis ? 'Başlangıç' : 'Tarih'}</label>
            <input id="akt-tarih" type="date" className={hataCls(!okTarih)} min={bas} max={bit} value={tarih} onChange={(e) => setTarih(e.target.value)} />
            {denendi && !okTarih && <p className="text-[11px] font-semibold text-danger-fg mt-1">{yilAdi(yil)} yılı içinde bir tarih seçin.</p>}
          </div>
          {/* Aşama 327: birkaç gün süren etkinlik (boş = tek gün) */}
          <div>
            <label htmlFor="akt-bitis" className="ui-label flex items-center justify-between gap-1">
              Bitiş <span className="text-[10px] font-normal text-subtle">isteğe bağlı</span>
            </label>
            <input id="akt-bitis" type="date" className={hataCls(!okBitis)} min={tarih || bas} max={bit} value={bitis} onChange={(e) => setBitis(e.target.value)} />
            {denendi && !okBitis && (
              <p className="text-[11px] font-semibold text-danger-fg mt-1">{bitisGun < 0 ? 'Bitiş, başlangıçtan önce olamaz.' : 'En çok 60 gün, yıl içinde.'}</p>
            )}
          </div>
          </>
          )}
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="akt-birim" className="ui-label">Birim</label>
            <SelectBox id="akt-birim" className="ui-field w-full cursor-pointer" value={birim} onChange={(e) => setBirim(e.target.value)}>
              {BIRIMLER.map((b) => (
                <option key={b} value={b}>
                  {baslik(b)}
                </option>
              ))}
            </SelectBox>
          </div>
          <label className="col-span-2 sm:col-span-3 -mt-1 flex w-fit items-center gap-2 text-xs text-fg-2 cursor-pointer select-none">
            <input
              type="checkbox"
              id="akt-ay-icinde"
              className="w-4 h-4 accent-[var(--color-brand)]"
              checked={ayIcinde}
              onChange={(e) => {
                setAyIcinde(e.target.checked);
                if (e.target.checked && tarih) setTarih(`${tarih.slice(0, 7)}-01`);
              }}
            />
            Günü belli değil, ay içinde yapılacak
          </label>
        </div>
        <div>
          <span className="ui-label flex items-center justify-between">
            Sınıf <span className="text-[10px] font-normal text-subtle">birden çok seçilebilir</span>
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5" role="group" aria-label="Sınıf">
            {SINIFLAR.map((s) => {
              const on = siniflar.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSiniflar((p) => (on ? p.filter((x) => x !== s) : [...p, s]))}
                  className={cx(
                    'h-8 rounded-full border text-xs font-semibold transition-colors cursor-pointer',
                    on ? 'bg-brand text-white border-brand' : 'bg-surface text-fg-2 border-line hover:border-line-strong hover:bg-surface-2'
                  )}
                >
                  {sinifAdi(s)}
                </button>
              );
            })}
          </div>
          {denendi && !okSinif && <p className="text-[11px] font-semibold text-danger-fg mt-1">En az bir sınıf seçin.</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="ui-label">Kapsam</span>
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={kapsam} onChange={setKapsam} items={[{ value: 'ogrenci', label: 'Öğrenci' }, { value: 'veli', label: 'Veli' }]} />
          </div>
          <div>
            <span className="ui-label">Yer</span>
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={yer} onChange={setYer} items={[{ value: 'ic', label: 'Okul içi' }, { value: 'dis', label: 'Okul dışı' }]} />
          </div>
          <div>
            <span className="ui-label">Konferans salonu</span>
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={salon} onChange={setSalon} items={[{ value: '0', label: 'Hayır' }, { value: '1', label: 'Evet' }]} />
          </div>
          <div>
            <label htmlFor="akt-zumre" className="ui-label flex items-center justify-between">
              Zümre <span className="text-[10px] font-normal text-subtle">isteğe bağlı</span>
            </label>
            <SelectBox id="akt-zumre" className="ui-field w-full cursor-pointer" value={zumre} onChange={(e) => setZumre(e.target.value)}>
              <option value="">Seçilmedi</option>
              {zumre && !(ZUMRELER as readonly string[]).includes(zumre) && <option value={zumre}>{baslik(zumre)}</option>}
              {ZUMRELER.map((z) => (
                <option key={z} value={z}>
                  {baslik(z)}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
        {salonCakisma && (
          <p className="rounded-xl bg-warning-soft text-warning-fg text-xs font-medium px-3 py-2.5">
            {kayitBitis ? 'Bu günlerde' : 'Bu tarihte'} konferans salonu "{baslik(salonCakisma.ad)}" için ayrılmış. Yine de kaydedebilirsiniz.
          </p>
        )}
        {hata && <p className="rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold px-3 py-2.5">{hata}</p>}
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------- Aşama 328: zümre üyeleri (hatırlatma)
const KURALLAR: { ust: string; alt: string }[] = [
  { ust: 'Okul dışı', alt: '12 gün önce' },
  { ust: 'Okul içi', alt: '6 gün önce' },
  { ust: 'Ay içinde', alt: 'önceki ay sonu' },
];
const ZumrelerPenceresi: React.FC<{
  acik: boolean;
  zumreler: { z: string; n: number }[];
  ilkZumre: string;
  onClose: () => void;
  onBitti: (text: string) => void;
}> = ({ acik, zumreler, ilkZumre, onClose, onBitti }) => {
  const [kayitli, setKayitli] = useState<Record<string, ZumreUye[]> | null>(null);
  const [baskanlar, setBaskanlar] = useState<Set<string>>(new Set());
  const [taslak, setTaslak] = useState<Record<string, ZumreUye[]>>({});
  const [zumre, setZumre] = useState('');
  const [q, setQ] = useState('');
  const [not, setNot] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const ogretmenler: Teacher[] = useMemo(
    () =>
      acik
        ? dataService
            .getTeachers()
            .filter((t) => t.status !== 'pending' && t.status !== 'rejected' && t.status !== 'suspended' && !t.isSuspended)
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
        : [],
    [acik]
  );

  useEffect(() => {
    if (!acik) return;
    setKayitli(null);
    setTaslak({});
    setQ('');
    setNot(null);
    setHata(null);
    setZumre(ilkZumre || zumreler.find((x) => x.n > 0)?.z || zumreler[0]?.z || '');
    let canli = true;
    zumreListesi()
      .then((r) => {
        if (!canli) return;
        setKayitli(r.uyeler);
        setBaskanlar(new Set(r.baskanlar));
      })
      .catch((e: any) => canli && (setHata(e?.message || 'Zümreler okunamadı.'), setKayitli({})));
    return () => {
      canli = false;
    };
  }, [acik, ilkZumre, zumreler]);

  const uyeler = (z: string): ZumreUye[] => taslak[z] ?? kayitli?.[z] ?? [];
  const secili = uyeler(zumre);
  const seciliMi = (id: string) => secili.some((u) => u.teacherId === id);
  const degisti = Object.keys(taslak);
  const yaz = (list: ZumreUye[]) => {
    setNot(null);
    setTaslak((p) => ({ ...p, [zumre]: list }));
  };
  const degistir = (id: string) => yaz(seciliMi(id) ? secili.filter((u) => u.teacherId !== id) : [...secili, { teacherId: id, baskan: false }]);
  const baskanYap = (id: string) => yaz(secili.map((u) => (u.teacherId === id ? { ...u, baskan: !u.baskan } : u)));
  const oner = () => {
    const yeni = ogretmenler.filter((t) => zumreBransUyar(zumre, t.branch) && !seciliMi(t.id));
    if (!yeni.length) {
      setNot('Bu zümre için branştan yeni öneri çıkmadı; öğretmenleri listeden seçin.');
      return;
    }
    yaz([...secili, ...yeni.map((t) => ({ teacherId: t.id, baskan: baskanlar.has(t.id) }))]);
    setNot(`${yeni.length} öğretmen branşına göre eklendi. Kontrol edip kaydedin.`);
  };
  const kaydet = async () => {
    setMesgul(true);
    setHata(null);
    try {
      for (const z of degisti) await zumreKaydet(z, taslak[z]);
      onBitti(degisti.length === 1 ? `${baslik(degisti[0])} kaydedildi.` : `${degisti.length} zümre kaydedildi.`);
    } catch (e: any) {
      setHata(e?.message || 'Kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const gorunen = ogretmenler.filter((t) => !q.trim() || buyuk(`${t.name} ${t.branch || ''}`).includes(buyuk(q)));
  const baskanSay = secili.filter((u) => u.baskan).length;

  return (
    <Modal
      open={acik}
      onClose={onClose}
      size="lg"
      icon={Users}
      title="Zümreler"
      description="Öğretmenler branşlarına göre zümreye kendiliğinden eklenir. Etkinlik yaklaşınca üyelere bir kez e-posta gider."
      id="akt-zumre-pencere"
      footer={
        <>
          <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={onClose} disabled={mesgul}>
            Vazgeç
          </button>
          <button type="button" id="akt-zumre-kaydet" className={cx(BTN, 'w-28 ui-btn-primary')} onClick={() => void kaydet()} disabled={!degisti.length || mesgul}>
            {mesgul ? 'Yazılıyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2" aria-label="Hatırlatma zamanı">
          {KURALLAR.map((k) => (
            <div key={k.ust} className="rounded-xl bg-surface-2 border border-line px-3 py-2.5 min-h-[56px] flex flex-col justify-center">
              <span className="text-[11px] font-semibold text-muted leading-tight">{k.ust}</span>
              <b className="text-xs sm:text-[13px] font-bold text-fg leading-snug">{k.alt}</b>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0">
            <SelectBox id="akt-zumre-sec" aria-label="Zümre" className="ui-field w-full h-10 cursor-pointer" value={zumre} onChange={(e) => (setZumre(e.target.value), setNot(null))}>
              {zumreler.map(({ z, n }) => {
                const u = uyeler(z).length;
                return (
                  <option key={z} value={z}>
                    {`${baslik(z)} · ${u ? `${u} üye` : 'üye yok'}${n ? ` · ${n} etkinlik` : ''}`}
                  </option>
                );
              })}
            </SelectBox>
          </div>
          <button type="button" id="akt-zumre-oner" className="ui-btn ui-btn-sm h-10 justify-center w-full sm:w-36 ui-btn-secondary" onClick={oner} disabled={!kayitli || !zumre}>
            Branşa göre öner
          </button>
        </div>

        {not && <p className="rounded-xl bg-brand-soft text-brand-fg text-xs font-semibold px-3 py-2.5">{not}</p>}
        {hata && <p className="rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold px-3 py-2.5">{hata}</p>}

        <div className="rounded-xl border border-line overflow-hidden">
          <div className="flex items-center gap-2 px-3 h-11 border-b border-line bg-surface-2">
            <Search className="w-4 h-4 text-subtle shrink-0" aria-hidden />
            <input
              id="akt-zumre-ara"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Öğretmen ya da branş ara"
              className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
            />
            <span className="text-[11px] font-semibold text-muted tabular-nums shrink-0">
              {secili.length} üye{baskanSay ? ` · ${baskanSay} başkan` : ''}
            </span>
          </div>
          {!kayitli ? (
            <div className="p-6">
              <Yukleniyor />
            </div>
          ) : !gorunen.length ? (
            <p className="p-6 text-center text-xs text-muted">{ogretmenler.length ? 'Aramaya uyan öğretmen yok.' : 'Kurumda öğretmen yok.'}</p>
          ) : (
            <ul className="max-h-[44vh] overflow-y-auto divide-y divide-line" role="list">
              {gorunen.map((t) => {
                const on = seciliMi(t.id);
                const uye = secili.find((u) => u.teacherId === t.id);
                const baskan = uye?.baskan || false;
                return (
                  <li key={t.id} className={cx('flex items-center gap-3 px-3 h-14 transition-colors', on ? 'bg-brand-soft/40' : 'hover:bg-surface-2')}>
                    <button type="button" role="checkbox" aria-checked={on} onClick={() => degistir(t.id)} className="flex-1 min-w-0 flex items-center gap-3 h-full text-left cursor-pointer">
                      <span className={cx('w-5 h-5 shrink-0 rounded-md border grid place-items-center transition-colors', on ? 'bg-brand border-brand text-white' : 'bg-surface border-line-strong')}>
                        {on && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <b className="block text-sm font-semibold text-fg truncate">{t.name}</b>
                        <span className="block text-xs text-muted truncate">
                          {t.branch || 'Branş yazılı değil'}
                          {baskanlar.has(t.id) ? ' · Zümre başkanı rolü' : ''}
                          {uye?.otomatik ? ' · branşından eklendi' : ''}
                        </span>
                      </span>
                    </button>
                    {on && (
                      <button
                        type="button"
                        aria-pressed={baskan}
                        onClick={() => baskanYap(t.id)}
                        className={cx(
                          'h-7 w-20 shrink-0 rounded-full border text-[11px] font-semibold transition-colors cursor-pointer',
                          baskan ? 'bg-brand text-white border-brand' : 'bg-surface text-fg-2 border-line hover:border-line-strong'
                        )}
                      >
                        {baskan ? 'Başkan' : 'Üye'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="flex gap-2 text-[11px] leading-relaxed text-muted">
          <BellRing className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>
            Etkinlik belli sınıflar içinse yalnız o sınıf düzeyinde derse giren üyelere gider; başkana her zaman gider. SMS, sistem sahibi Yönetim › Bildirim ve SMS › Akademik takvim satırından açınca gider.
          </span>
        </p>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------- Excel'den yükleme
const ExcelPenceresi: React.FC<{
  acik: boolean;
  yil: number;
  kayitlar: AktKayit[];
  onClose: () => void;
  onYazildi: () => Promise<void>; // Aşama 329: yazınca takvim yeniden okunur, pencere sonucu gösterir
}> = ({ acik, yil, kayitlar, onClose, onYazildi }) => {
  const [dosyaAd, setDosyaAd] = useState('');
  const [sonuc, setSonuc] = useState<{ satirlar: OkunanSatir[]; durum: YuklemeSonucu[]; silinen: number; mod: 'ekle' | 'degistir' } | null>(null);
  const [sayfa, setSayfa] = useState(0);
  const [satirlar, setSatirlar] = useState<OkunanSatir[] | null>(null);
  const [mod, setMod] = useState<'ekle' | 'degistir'>('ekle');
  const [mesgul, setMesgul] = useState<'' | 'oku' | 'yaz'>('');
  const [hata, setHata] = useState<string | null>(null);
  const [surukle, setSurukle] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!acik) return;
    setDosyaAd('');
    setSatirlar(null);
    setSonuc(null);
    setMod('ekle');
    setHata(null);
    setMesgul('');
  }, [acik]);

  const oku = async (f?: File | null) => {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) return setHata('Lütfen .xlsx uzantılı Excel dosyası seçin.');
    setMesgul('oku');
    setHata(null);
    try {
      const r = await takvimExcelOku(f, yil);
      if (!r.sayfaSayisi) throw new Error('Ay adlı sayfa bulunamadı (EYLÜL … HAZİRAN).');
      setDosyaAd(f.name);
      setSayfa(r.sayfaSayisi);
      setSatirlar(r.satirlar);
      setSonuc(null);
    } catch (e: any) {
      setHata(e?.message || 'Dosya okunamadı.');
    } finally {
      setMesgul('');
      if (input.current) input.current.value = '';
    }
  };

  // Aşama 329: dosyadaki her satır takvimle karşılaştırılır: yeni | güncellenecek (bilgisi farklı) | aynı | hatalı
  const mevcut = useMemo(() => new Map(kayitlar.map((k) => [satirAnahtari(k), k])), [kayitlar]);
  const durumOf = useCallback(
    (s: OkunanSatir): 'hatali' | 'yeni' | 'guncel' | 'ayni' => {
      if (s.durum === 'hatali') return 'hatali';
      const k = mevcut.get(satirAnahtari({ tarih: s.tarih!, ad: s.ad!, sinif: s.sinif || '' }));
      if (!k) return 'yeni';
      const z = zumreAdi(s.zumre, s.birim);
      const esit =
        (k.bitis || '') === (s.bitis || '') && k.ayIcinde === !!s.ayIcinde && buyuk(k.birim) === buyuk(s.birim) && buyuk(k.zumre) === z &&
        k.kapsam === (s.kapsam || 'ogrenci') && k.yer === (s.yer || 'ic') && k.salon === !!s.salon;
      return esit ? 'ayni' : 'guncel';
    },
    [mevcut]
  );
  const hesap = useMemo(() => {
    const l = satirlar || [];
    const say = { hatali: 0, yeni: 0, guncel: 0, ayni: 0 };
    l.forEach((s) => say[durumOf(s)]++);
    return { l, gecerli: l.filter((s) => s.durum !== 'hatali'), say, duzeltilen: l.filter((s) => s.durum === 'duzeltildi').length };
  }, [satirlar, durumOf]);
  const yazilacakSay = mod === 'ekle' ? hesap.say.yeni + hesap.say.guncel : hesap.gecerli.length;

  const kaydet = async () => {
    if (!yazilacakSay || mesgul) return;
    if (mod === 'degistir') {
      const ok = await appConfirm({
        title: 'Takvim baştan yazılsın mı?',
        message: `${yilAdi(yil)} takvimindeki ${kayitlar.length} kayıt silinip dosyadaki ${hesap.gecerli.length} satır yazılacak. Elle eklenen etkinlikler de silinir.`,
        confirmText: 'Baştan yaz',
        danger: true,
      });
      if (!ok) return;
    }
    setMesgul('yaz');
    setHata(null);
    try {
      const gonder = hesap.gecerli;
      const veri: AktSatir[] = gonder.map((s) => ({
        tarih: s.tarih!, bitis: s.bitis || '', ayIcinde: !!s.ayIcinde, ad: s.ad!, sinif: s.sinif || '', birim: s.birim || '', zumre: s.zumre || '',
        kapsam: s.kapsam || 'ogrenci', yer: s.yer || 'ic', salon: !!s.salon, kontrol: !!s.kontrol,
      }));
      const r = await takvimYukle(mod, yil, veri);
      // 329 kurulu değilse satır sonucu gelmez: önizlemedeki tahmin kullanılır
      const durum: YuklemeSonucu[] = r.sonuclar.length === gonder.length ? r.sonuclar : gonder.map((s) => (mod === 'degistir' ? 'yeni' : (durumOf(s) as YuklemeSonucu)));
      await onYazildi();
      setSonuc({ satirlar: gonder, durum, silinen: r.silinen, mod });
    } catch (e: any) {
      setHata(e?.message || 'Yüklenemedi.');
    } finally {
      setMesgul('');
    }
  };

  // Yazıldıktan sonra: dosyadaki satırların takvimde gerçekten olduğu (yeniden okunan kayıtlarla) doğrulanır
  const dogrulama = useMemo(() => {
    if (!sonuc) return null;
    const yazilan = sonuc.satirlar.filter((_, i) => sonuc.durum[i] === 'yeni' || sonuc.durum[i] === 'guncel' || sonuc.durum[i] === 'ayni');
    const bulunan = yazilan.filter((s) => mevcut.has(satirAnahtari({ tarih: s.tarih!, ad: s.ad!, sinif: s.sinif || '' }))).length;
    const say = (d: YuklemeSonucu) => sonuc.durum.filter((x) => x === d).length;
    return { yazilan: yazilan.length, bulunan, yeni: say('yeni'), guncel: say('guncel'), ayni: say('ayni'), yazilamadi: say('yil_disi') + say('bos') };
  }, [sonuc, mevcut]);

  // Önizleme sırası: hatalı → güncellenecek → yeni → aynı; sonuçta: yazılamayan → yeni → güncellenen → aynı
  const ONCE: Record<string, number> = { hatali: 0, yil_disi: 0, bos: 0, guncel: 1, yeni: 2, ayni: 3 };
  const liste = sonuc
    ? sonuc.satirlar.map((s, i) => ({ s, d: sonuc.durum[i] as string }))
    : hesap.l.map((s) => ({ s, d: mod === 'degistir' && s.durum !== 'hatali' ? 'yeni' : (durumOf(s) as string) }));
  const sirali = [...liste].sort((a, b) => ONCE[a.d] - ONCE[b.d] || String(a.s.tarih || '').localeCompare(String(b.s.tarih || '')));
  const ETIKET: Record<string, [string, string]> = sonuc
    ? { yeni: ['ui-chip-success', 'Eklendi'], guncel: ['ui-chip-brand', 'Güncellendi'], ayni: ['ui-chip-neutral', 'Zaten vardı'], yil_disi: ['ui-chip-danger', 'Yıl dışında'], bos: ['ui-chip-danger', 'Yazılamadı'] }
    : { yeni: ['ui-chip-success', mod === 'ekle' ? 'Yeni' : 'Yazılacak'], guncel: ['ui-chip-brand', 'Güncellenecek'], ayni: ['ui-chip-neutral', 'Aynısı var'], hatali: ['ui-chip-danger', 'Hatalı'] };
  // Aşama 329: aynı tarih, ad, kapsam ve yerdeki sınıf satırları takvimdeki gibi TEK etkinlik olarak gösterilir ("5, 6, 7. sınıf")
  type Grup = { key: string; s: OkunanSatir; d: string; siniflar: string[]; satir: number };
  const gruplar: Grup[] = [];
  const gm = new Map<string, Grup>();
  for (const { s: r, d } of sirali) {
    const k = r.tarih ? `${r.tarih}|${r.bitis || ''}|${r.ayIcinde ? 'ay' : ''}|${buyuk(r.ad)}|${r.kapsam}|${r.yer}` : `${r.sayfa}-${r.satirNo}`;
    let g = gm.get(k);
    if (!g) {
      g = { key: k, s: r, d, siniflar: [], satir: 0 };
      gm.set(k, g);
      gruplar.push(g);
    } else if (ONCE[d] < ONCE[g.d]) g.d = d;
    if (r.sinif && !g.siniflar.includes(r.sinif)) g.siniflar.push(r.sinif);
    g.satir++;
  }
  const gs = (...ds: string[]) => gruplar.filter((g) => ds.includes(g.d)).length;
  const yazilacakEtkinlik = mod === 'ekle' ? gs('yeni', 'guncel') : gruplar.length - gs('hatali');
  const kutular: [string, number, string][] = sonuc
    ? [
        ['Eklendi', gs('yeni'), 'text-success-fg'],
        ['Güncellendi', gs('guncel'), 'text-brand-fg'],
        ['Zaten vardı', gs('ayni'), 'text-fg'],
        ['Yazılamadı', gs('yil_disi', 'bos'), 'text-danger-fg'],
      ]
    : [
        ['Yeni', gs('yeni'), 'text-success-fg'],
        ['Güncellenecek', gs('guncel'), 'text-brand-fg'],
        ['Aynısı var', gs('ayni'), 'text-fg'],
        ['Hatalı', gs('hatali'), 'text-danger-fg'],
      ];

  return (
    <Modal
      open={acik}
      onClose={onClose}
      size="lg"
      icon={FileSpreadsheet}
      title="Excel'den takvim yükle"
      description={`${yilAdi(yil)} · her ay ayrı sayfa. Önce okunur ve gösterilir; Kaydet'e basınca yazılır.`}
      id="akt-excel-pencere"
      footer={
        <>
          {sonuc ? (
            <button type="button" id="akt-excel-kapat" className={cx(BTN, 'w-28 ui-btn-primary')} onClick={onClose}>
              Tamam
            </button>
          ) : (
            <>
              <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={onClose} disabled={mesgul === 'yaz'}>
                Vazgeç
              </button>
              <button type="button" id="akt-excel-kaydet" className={cx(BTN, 'min-w-28 px-4 ui-btn-primary')} onClick={() => void kaydet()} disabled={!satirlar || !yazilacakSay || !!mesgul}>
                {mesgul === 'yaz' ? 'Yazılıyor…' : satirlar && yazilacakSay ? `${yazilacakEtkinlik} etkinliği yaz` : 'Kaydet'}
              </button>
            </>
          )}
        </>
      }
    >
      <input ref={input} type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => void oku(e.target.files?.[0])} />
      {!satirlar ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setSurukle(true);
            }}
            onDragLeave={() => setSurukle(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurukle(false);
              void oku(e.dataTransfer.files?.[0]);
            }}
            className={cx(
              'w-full flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors cursor-pointer',
              surukle ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface-2 hover:border-brand hover:bg-brand-soft'
            )}
          >
            <span className="w-12 h-12 rounded-xl bg-surface shadow-card grid place-items-center text-brand-fg mb-1">
              <Upload className="w-5 h-5" />
            </span>
            <b className="text-sm text-fg">{mesgul === 'oku' ? 'Dosya okunuyor…' : 'Excel dosyasını buraya bırakın'}</b>
            <span className="text-xs text-muted">
              ya da <u className="no-underline font-semibold text-brand-fg">bilgisayardan seçin</u> · .xlsx
            </span>
          </button>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-fg-2">Okunan sütunlar</p>
            <div className="flex flex-wrap gap-1.5">
              {['Etkinlik adı', 'Tarih', 'Sınıf', 'Etkinlik kapsamı', 'Okul içi / dışı', 'Konferans salonu', 'Birim', 'Zümre', 'Kontrol'].map((s) => (
                <span key={s} className="ui-chip ui-chip-neutral">
                  {s}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted">Sayfa adları ay adıdır (EYLÜL … HAZİRAN). Boş satırlar atlanır. Yıl yanlış yazılmışsa ay sayfasına göre düzeltilir.</p>
            <button type="button" className="text-xs font-semibold text-brand-fg hover:underline inline-flex items-center gap-1 cursor-pointer" onClick={() => void takvimSablonIndir(yil)}>
              <Download className="w-3.5 h-3.5" /> Boş şablonu indir
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="w-9 h-9 rounded-lg bg-success-soft text-success-fg grid place-items-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm text-fg truncate">{dosyaAd}</b>
              <span className="text-xs text-muted">
                {sayfa} ay sayfası · {gruplar.length} etkinlik · {hesap.l.length} sınıf satırı
              </span>
            </div>
            <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={() => input.current?.click()} disabled={!!mesgul}>
              Başka dosya
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" id="akt-excel-ozet">
            {kutular.map(([k, v, c]) => (
              <div key={k} className="rounded-xl bg-surface-2 border border-line px-3 py-2.5">
                <b className={cx('block text-xl font-bold tabular-nums', v ? c : 'text-subtle')}>{v}</b>
                <span className="text-[11px] font-medium text-muted">{k} etkinlik</span>
              </div>
            ))}
          </div>
          {sonuc && dogrulama ? (
            <p
              role="status"
              className={cx(
                'flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold',
                dogrulama.bulunan === dogrulama.yazilan ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-warning-fg'
              )}
            >
              {dogrulama.bulunan === dogrulama.yazilan ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {dogrulama.bulunan === dogrulama.yazilan
                ? `Takvim yeniden okundu: dosyadaki ${gruplar.length - gs('yil_disi', 'bos')} etkinliğin (${dogrulama.yazilan} sınıf satırı) hepsi takvimde.${sonuc.silinen ? ` (${sonuc.silinen} eski kayıt silindi)` : ''}`
                : `Takvim yeniden okundu: ${dogrulama.yazilan} satırdan ${dogrulama.bulunan} tanesi görünüyor. Sayfayı yenileyip tekrar bakın.`}
            </p>
          ) : (
            <>
              <Segmented
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
                value={mod}
                onChange={setMod}
                items={[
                  { value: 'ekle', label: 'Ekle ve güncelle', id: 'akt-mod-ekle' },
                  { value: 'degistir', label: 'Takvimi baştan yaz', id: 'akt-mod-degistir' },
                ]}
              />
              <p className="text-xs text-muted">
                {mod === 'ekle'
                  ? yazilacakSay
                    ? `Takvimde olmayan ${gs('yeni')} etkinlik eklenir, bilgisi değişen ${gs('guncel')} etkinlik güncellenir; diğer etkinliklere dokunulmaz.`
                    : 'Dosyadaki satırların hepsi takvimde aynen var.'
                  : `${yilAdi(yil)} takvimindeki ${kayitlar.length} kayıt silinir, dosyadaki ${yazilacakEtkinlik} etkinlik yazılır.`}
                {gs('hatali') > 0 && ' Hatalı satırlar yazılmaz.'}
                {hesap.duzeltilen > 0 && ` ${hesap.duzeltilen} satırın yılı ay sayfasına göre düzeltildi.`}
              </p>
            </>
          )}
          <ul className="rounded-xl border border-line divide-y divide-line max-h-[42vh] overflow-y-auto" id="akt-excel-liste">
            {gruplar.map(({ key, s, d, siniflar, satir }) => {
              const [cls, et] = ETIKET[d] || ['ui-chip-neutral', d];
              return (
                <li key={key} className={cx('flex items-center gap-3 px-3 py-2', d === 'ayni' && 'opacity-60')}>
                  {s.tarih ? <DtKutu tarih={s.tarih} bitis={s.bitis} ayIcinde={s.ayIcinde} /> : <span className="w-12 h-12 rounded-xl bg-surface-2 grid place-items-center text-muted shrink-0">?</span>}
                  <span className="min-w-0 flex-1">
                    <b className="block text-xs font-semibold text-fg truncate">{s.ad ? baslik(s.ad) : '(adsız)'}</b>
                    <span className="block text-[11px] text-muted truncate">
                      {siniflar.length ? siniflarYazi(siniflar) : 'Sınıf yok'}
                      {s.zumre && ` · ${baslik(s.zumre)}`} · {s.sayfa}
                      {satir > 1 ? ` · ${satir} satır` : ` · satır ${s.satirNo}`}
                      {s.not && <span className="text-warning-fg"> · {s.not}</span>}
                    </span>
                  </span>
                  <span className={cx('ui-chip shrink-0 w-28 justify-center', cls)}>{et}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {hata && <p className="mt-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold px-3 py-2.5">{hata}</p>}
    </Modal>
  );
};
