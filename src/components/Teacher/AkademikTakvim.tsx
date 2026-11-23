// Aşama 364: AKADEMİK TAKVİM BÖLÜNDÜ (eskiden 1.436 satır). Kutu parçaları takvim/ortak.tsx'te; yalnız yöneticinin
// açtığı pencereler (etkinlik, Excel'den yükleme, zümre üyeleri) takvim/ içinde ayrı parça ve açılınca yüklenir.
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { lazyNamed, useEverTrue } from '../../lib/lazyLoad';
import { AlertTriangle, CalendarRange, Check, Download, MapPin, Mic2, Plus, Trash2, Upload, Users } from 'lucide-react';
import { EmptyState, PageHeader, Panel, Segmented, cx } from '../ui/kit';
import { Yukleniyor } from '../ui/Durum'; // Aşama 305
import { SelectBox } from './FormParts';
import { appConfirm } from '../../lib/appDialog';
import { useQuickFocus } from '../../lib/quickFocus'; // Aşama 337
import { dataService } from '../../services/dataService';
import {
  AY_ADLARI,
  AY_KISA,
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
  etkinlikleriSil,
  etkinlikler,
  gunAraligiYazi,
  gunEkle,
  kontrolIsaretle,
  pazartesi,
  sinifAdi,
  siniflarYazi,
  sonGun,
  takvimCanliDinle,
  takvimListesi,
  tarihCoz,
  tarihYaz,
  yilAdi,
  yilAraligi,
  type AktEtkinlik,
  DURUM_AD, // Aşama 375
  durumBul,
  soruGunu,
  type AktDurumKod,
  type AktKademe,
  type AktKapsam,
  type AktKayit,
  type AktYer,
} from '../../services/akademikTakvimService';
import { takvimSablonIndir } from '../../lib/akademikTakvimExcel';
import { useBildirimKanali } from '../../lib/bildirim'; // Aşama 353
import { BTN, DtKutu, gunleri, SecKutusu, Kutu, KutuSecenek, ODAK_ADI, type Odak } from './takvim/ortak';
import { useAktDurumlar } from './takvim/useAktDurumlar'; // Aşama 375
import { DurumCip } from './takvim/DurumBolumu';
import { AktEtkinlikPencere } from '../Home/AktEtkinlikPencere';

// Aşama 375: durum düğmesinin rengi
const DURUM_BTN: Record<AktDurumKod, string> = { yapildi: 'ui-btn-success', yapilmadi: 'ui-btn-danger-soft', ertelendi: 'ui-btn-warning', iptal: 'ui-btn-secondary' };

// ============================================================================
// Aşama 242: AKADEMİK TAKVİM sayfası (kurum bölümü "Akademik takvim" açıksa menüde görünür)
//  * Herkes okur; kurum yöneticisi (Müdür, Müdür Yrd.) Excel yükler, etkinlik ekler / düzenler / siler, "kontrol" işaretler.
//  * Excel: kurumun kendi biçimi (her ay ayrı sayfa). Önce ekranda okunur ve gösterilir; "Kaydet"e basılınca yazılır.
//  * Ana sayfadaki "Haftanın faaliyetleri" aynı kayıtları okur; değişiklik anlık güncellemeyle her ekrana yayılır.
// ============================================================================

// Aşama 364: yönetici pencereleri (etkinlik, Excel, zümreler) ayrı parça; yalnız açılınca yüklenir
const EtkinlikPenceresi = lazyNamed<React.ComponentProps<typeof import('./takvim/EtkinlikPenceresi').EtkinlikPenceresi>>(() => import('./takvim/EtkinlikPenceresi'), 'EtkinlikPenceresi');
const ExcelPenceresi = lazyNamed<React.ComponentProps<typeof import('./takvim/ExcelPenceresi').ExcelPenceresi>>(() => import('./takvim/ExcelPenceresi'), 'ExcelPenceresi');
const ZumrelerPenceresi = lazyNamed<React.ComponentProps<typeof import('./takvim/ZumrelerPenceresi').ZumrelerPenceresi>>(() => import('./takvim/ZumrelerPenceresi'), 'ZumrelerPenceresi');

export const AkademikTakvim: React.FC = () => {
  const kurumId = dataService.getMyKurumId();
  const yonetir = dataService.canManageAkademikTakvim();
  const [yil, setYil] = useState(() => egitimYili());
  const [kayitlar, setKayitlar] = useState<AktKayit[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const setBildirim = useBildirimKanali(); // Aşama 353: ortak bildirim
  const durumlar = useAktDurumlar(!!kurumId); // Aşama 375
  const [durumAc, setDurumAc] = useState<AktEtkinlik | null>(null);
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
  // Aşama 364: pencereler ayrı parça; ilk açılışta yüklenir, sonra eskisi gibi yerinde kalır
  const etkinlikVar = useEverTrue(duzenle !== null);
  const excelVar = useEverTrue(excelAcik);
  const zumreVar = useEverTrue(zumreAcik);
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
                <button data-serbest="takvim hücresi"
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
                  <span className={cx('text-2xs tabular-nums', aktif ? 'text-brand-fg' : 'text-subtle')}>{n || '–'}</span>
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
                        <li className="pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-warning-fg" aria-hidden>
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
                        {(() => {
                          // Aşama 375: zümre etkinliğinin durumu (Yapıldı / Yapılmadı / Ertelendi / İptal edildi)
                          if (!g.zumre) return null;
                          const dr = durumBul(durumlar, g).durum;
                          if (!dr && soruGunu(g) > bugunS) return null;
                          if (!yonetir) return dr ? <DurumCip durum={dr.durum} className="shrink-0" /> : null;
                          return (
                            <button
                              type="button"
                              id={`akt-durum-ac-${g.ids[0]}`}
                              onClick={() => setDurumAc(g)}
                              className={cx(BTN, 'w-28 shrink-0', dr ? DURUM_BTN[dr.durum] : 'ui-btn-secondary')}
                              title={dr ? `Durum: ${DURUM_AD[dr.durum]}${dr.isaretleyen ? ` (${dr.isaretleyen})` : ''}` : 'Durumu işaretlenmedi'}
                            >
                              {dr ? DURUM_AD[dr.durum] : 'Durum ?'}
                            </button>
                          );
                        })()}
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

      {yonetir && etkinlikVar && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
      <AktEtkinlikPencere etkinlik={durumAc} onClose={() => setDurumAc(null)} />
      {yonetir && excelVar && (
        <Suspense fallback={null}>
          <ExcelPenceresi acik={excelAcik} yil={yil} kayitlar={kayitlar} onClose={() => setExcelAcik(false)} onYazildi={yukle} />
        </Suspense>
      )}
      {yonetir && zumreVar && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </div>
  );
};
