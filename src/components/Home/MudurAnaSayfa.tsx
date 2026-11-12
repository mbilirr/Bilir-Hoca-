import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { ClassGroup, Etut, Homework, HomeworkSubmission, Student, Teacher, TeacherTabType } from '../../types';
import {
  DersAyar,
  DevamsizlikArtanlar,
  GunHucre,
  OgretmenYoklamaSatiri,
  Tatil,
  dersAyarOku,
  dersCanliDinle,
  devamsizlikArtanlar,
  gunTablosu,
  ogretmenYoklamaRapor,
  tatilListesi,
} from '../../services/dersService';
import {
  AY_ADLARI,
  AY_KISA,
  GUN_KISA_PAZAR,
  GUN_TAM_PAZAR,
  adParca,
  baslik,
  etkinlikler,
  gunEkle as tGunEkle,
  pazartesi,
  siniflarYazi,
  tarihCoz,
  tarihYaz as tYaz,
  type AktEtkinlik,
} from '../../services/akademikTakvimService';
import { useAkademikKayitlar } from '../Teacher/HaftaninFaaliyetleri';
import { etutExpectsAttendance, hasEtutAttendance, isEtutEnded } from '../../lib/etutTiming';
import { odevTeslimGruplari } from '../../lib/odevTeslim';
import { trBugun } from '../../lib/trSaat';
import { AnaSayfaKabuk, akBasHarf, akSelam } from './AnaSayfaKabuk';
import { AkTatilSheet } from './AkTatilSheet';

// ============================================================================
// Aşama 246: MÜDÜR ANA SAYFASI (taslak: mudur-akademik-takvim.html, Odak renkleri)
// Kimde: Müdür rolü olan hesap (kurum yöneticisi kaydı varsa İdare portalında). Müdür yardımcısı ayrı sayfa (247).
// KURAL (12 Kas, Mustafa): her kart kurumun AÇIK bölümünden gelir; kapalı bölümün kartı, sayısı, düğmesi hiç çizilmez.
//   Akademik takvim kapalıysa "Haftanın faaliyetleri" yok; Dersler kapalıysa yoklama / devamsızlık / tatil yok;
//   Etütler kapalıysa etüt sayısı yok; Ödevler kapalıysa ödev teslimi yok; Deneme kapalıysa deneme rafı yok.
// Sayılar ilgili sayfayla AYNI kaynaktan ve aynı hesapla gelir:
//   derse devam ve zamanında yoklama = Kurum raporu › Yoklama gün tablosu (ders_gun_tablosu),
//   öğretmenler = Kurum raporu › Öğretmenler (ders_ogretmen_rapor), ödev teslimi = Kurum raporu › Ödevler (lib/odevTeslim),
//   devamsızlığı artanlar = devamsızlık sınırı uyarısıyla aynı "özürsüz gün" tanımı (246 SQL).
// Senkron: ders tabloları ve akademik takvim canlı dinlenir; etüt / ödev dataService'ten anlık gelir;
//   5 dakikada bir ve sekmeye dönünce sunucudan yeniden okunur. Geçmiş günler kısa süre önbellekte tutulur.
// ============================================================================

const KurumRaporu = lazy(() => import('../Teacher/KurumRaporu').then((m) => ({ default: m.KurumRaporu })));

type Rapor = 'yoklama' | 'devamsizlik' | 'ogretmen' | 'odev';

/** Bir okul gününün yoklama özeti (gün tablosundan) */
interface GunOzet {
  ders: number; // vakti geçmiş ders (alındı + geciken)
  zamaninda: number; // zamanında alınan
  geciken: number; // hâlâ alınmamış
  gelen: number; // geldi + geç geldi
  sayilan: number; // geldi + geç geldi + gelmedi (izinli sayılmaz)
}

const GECMIS_OMUR = 10 * 60_000; // geçmiş gün önbelleği
const pct1 = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const sayiTr = (n: number, k = 0) =>
  n.toLocaleString('tr-TR', {
    minimumFractionDigits: k,
    maximumFractionDigits: k,
  });
const isoGun = (s: string) => ((tarihCoz(s).getDay() + 6) % 7) + 1; // 1 = Pazartesi

function gunOzetle(h: GunHucre[]): GunOzet {
  const o: GunOzet = {
    ders: 0,
    zamaninda: 0,
    geciken: 0,
    gelen: 0,
    sayilan: 0,
  };
  for (const c of h) {
    if (c.durum === 'alindi') {
      o.ders++;
      if (!c.oturum?.gec) o.zamaninda++;
    } else if (c.durum === 'geciken') {
      o.ders++;
      o.geciken++;
    }
    const s = c.oturum?.sayilar;
    if (s) {
      const gel = (s.present || 0) + (s.late || 0);
      o.gelen += gel;
      o.sayilan += gel + (s.absent || 0);
    }
  }
  return o;
}

/** Taslaktaki küçük çizgi grafik */
const Spark: React.FC<{ a: number[]; dn: boolean }> = ({ a, dn }) => {
  if (!a.length) return <span className="od-spark" aria-hidden="true" />;
  const w = 200;
  const hh = 36;
  const mn = Math.min(...a);
  const mx = Math.max(...a);
  const pts = a.map((v, i) => [a.length > 1 ? i * (w / (a.length - 1)) : w, hh - 4 - ((v - mn) / (mx - mn || 1)) * (hh - 8)] as const);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const col = dn ? 'var(--danger)' : 'var(--brand)';
  const last = pts[pts.length - 1];
  return (
    <svg className="od-spark" viewBox={`0 0 ${w} ${hh}`} preserveAspectRatio="none" aria-hidden="true">
      {a.length > 1 && <path d={`${d} L${w} ${hh} L0 ${hh}Z`} fill={col} opacity=".08" />}
      {a.length > 1 && <path d={d} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      <circle cx={last[0]} cy={last[1]} r="3" fill={col} />
    </svg>
  );
};

interface Props {
  currentTeacher: Teacher | null;
  students: Student[];
  classes: ClassGroup[];
  etuts: Etut[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  unreadMessages: number;
  onNavigateTab: (tab: TeacherTabType) => void;
}

export const MudurAnaSayfa: React.FC<Props> = ({ currentTeacher, students, classes, etuts, homeworks, submissions, unreadMessages, onNavigateTab }) => {
  // ---- kurum ve açık bölümler (dataService değişince yeniden hesaplanır)
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const kurumId = dataService.getMyKurum().kurumId || '';
  const can = useMemo(
    () => ({
      takvim: dataService.canUseTab('akademik_takvim'),
      ders: dataService.canUseTab('grades'),
      etut: dataService.canUseTab('etuts'),
      odev: dataService.canUseTab('homework'),
      deneme: dataService.canUseTab('deneme'),
      // tatil günlerini veritabanı yalnız kurum yöneticisine yazdırır (ders_tatil_ekle)
      tatilYaz: dataService.isKurumAdmin(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const git = (tab: TeacherTabType) => {
    onNavigateTab(tab);
    window.scrollTo({ top: 0 });
  };

  // ---- tarih
  const [bugunS, setBugunS] = useState(trBugun());
  const buPzt = useMemo(() => tYaz(pazartesi(tarihCoz(bugunS))), [bugunS]);
  const pztEkle = (n: number) => tYaz(tGunEkle(tarihCoz(buPzt), n));

  // ================================================================ AKADEMİK TAKVİM
  const kayitlar = useAkademikKayitlar(can.takvim);
  const hepsi = useMemo(() => etkinlikler(kayitlar || []), [kayitlar]);
  const [kaydir, setKaydir] = useState(0);

  // ================================================================ DERSLER
  const [ayar, setAyar] = useState<DersAyar | null>(null);
  const [tatiller, setTatiller] = useState<Tatil[] | null>(null);
  const [ogretmenRap, setOgretmenRap] = useState<OgretmenYoklamaSatiri[] | null>(null);
  const [artan, setArtan] = useState<DevamsizlikArtanlar | null>(null);
  const [artanHata, setArtanHata] = useState('');
  const [dersHata, setDersHata] = useState('');
  const gunlerRef = useRef(new Map<string, { at: number; v: GunOzet }>());
  const [gunSurum, setGunSurum] = useState(0);
  const [nabizHafta, setNabizHafta] = useState<0 | -1>(0);

  /** Haftanın (ofset: 0 bu hafta, -1 geçen hafta…) bugüne kadarki okul günleri */
  const okulGunleri = useCallback(
    (ofset: number, a: DersAyar | null) => {
      const gunler = a?.gunler?.length ? a.gunler : [1, 2, 3, 4, 5];
      const out: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = tYaz(tGunEkle(tarihCoz(buPzt), ofset * 7 + i));
        if (d <= bugunS && gunler.includes(i + 1)) out.push(d);
      }
      return out;
    },
    [buPzt, bugunS],
  );

  /** Gün tablolarını okur: bugün her zaman, geçmiş günler önbellekte yoksa ya da eskidiyse */
  const gunleriOku = useCallback(
    async (gunler: string[], hepsiniYenile = false) => {
      const simdi = Date.now();
      const okunacak = gunler.filter((g) => {
        const c = gunlerRef.current.get(g);
        return hepsiniYenile || g === bugunS || !c || simdi - c.at > GECMIS_OMUR;
      });
      if (!okunacak.length) return;
      const sonuc = await Promise.all(okunacak.map((g) => gunTablosu(g).then((r) => [g, gunOzetle(r.hucreler)] as const)));
      sonuc.forEach(([g, v]) => gunlerRef.current.set(g, { at: Date.now(), v }));
      setGunSurum((n) => n + 1);
    },
    [bugunS],
  );

  const dersOku = useCallback(
    async (hepsiniYenile = false) => {
      if (!kurumId) return;
      try {
        const a = await dersAyarOku();
        setAyar(a);
        const bg = a?.bugun || trBugun();
        if (bg !== bugunS) setBugunS(bg); // gün döndü: hafta yeniden hesaplanır
        if (!a?.kayitli) {
          setDersHata('');
          return;
        }
        const pzt = tYaz(pazartesi(tarihCoz(bg)));
        const [t, o, ar] = await Promise.all([
          tatilListesi(kurumId, bg).catch(() => null),
          ogretmenYoklamaRapor(pzt, bg).catch(() => null),
          devamsizlikArtanlar(pzt, bg, 2)
            .then((r) => {
              setArtanHata('');
              return r;
            })
            .catch((e: any) => {
              setArtanHata(e?.message || 'Okunamadı.');
              return null;
            }),
          gunleriOku([...okulGunleri(0, a), ...okulGunleri(-1, a)], hepsiniYenile),
        ]);
        setTatiller(t);
        setOgretmenRap(o);
        setArtan(ar);
        setDersHata('');
      } catch (e: any) {
        setDersHata(e?.message || 'Ders bilgisi okunamadı.');
      }
    },
    [kurumId, bugunS, gunleriOku, okulGunleri],
  );

  useEffect(() => {
    if (!can.ders || !kurumId) {
      setAyar(null);
      return;
    }
    void dersOku();
    const yenile = () => document.visibilityState === 'visible' && void dersOku();
    const t = setInterval(yenile, 5 * 60_000);
    document.addEventListener('visibilitychange', yenile);
    // yoklama düzeltmesi geçmiş günü de değiştirebilir: canlı değişiklikte bu ve geçen haftanın günleri yeniden okunur
    const kapat = dersCanliDinle(
      kurumId,
      ['kurum_ders_ayar', 'ders_programi', 'kurum_ders_tatil', 'ders_yoklama_oturum', 'ders_vekil', 'ders_gun_izin'],
      () => void dersOku(true),
    );
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', yenile);
      kapat();
    };
  }, [can.ders, kurumId, dersOku]);

  // "Geçen hafta" seçilince karşılaştırma için bir önceki hafta da okunur
  useEffect(() => {
    if (can.ders && ayar?.kayitli && nabizHafta === -1) void gunleriOku(okulGunleri(-2, ayar)).catch(() => undefined);
  }, [can.ders, ayar, nabizHafta, gunleriOku, okulGunleri]);

  // ================================================================ HAFTANIN NABZI
  type Nabiz = {
    k: string;
    v: React.ReactNode;
    dizi: number[];
    fark: string;
    dn: boolean;
    up: boolean;
    title: string;
  };
  const nabiz = useMemo<Nabiz[]>(() => {
    const out: Nabiz[] = [];
    const w = nabizHafta;
    // karşılaştırma: önceki haftanın AYNI günleri (hafta ortasında yarım haftayı tam haftayla kıyaslamamak için)
    const gunlerW = okulGunleri(w, ayar);
    const sonIso = w === 0 ? isoGun(bugunS) : 7;
    const gunlerP = okulGunleri(w - 1, ayar).filter((g) => isoGun(g) <= sonIso);
    const farkYaz = (a: number | null, b: number | null, birim: 'puan' | 'adet', ek = '') => {
      if (a === null || b === null) return { fark: '', dn: false, up: false };
      const d = a - b;
      const yuv = birim === 'puan' ? Math.round(d * 10) / 10 : Math.round(d);
      if (yuv === 0) return { fark: '=', dn: false, up: false };
      const txt = birim === 'puan' ? `${sayiTr(Math.abs(yuv), Math.abs(yuv) < 10 && yuv % 1 ? 1 : 0)} puan` : `${Math.abs(yuv)}${ek}`;
      return {
        fark: `${yuv > 0 ? '▲' : '▼'} ${txt}`,
        dn: yuv < 0,
        up: yuv > 0,
      };
    };

    if (can.ders && ayar?.kayitli) {
      const oz = (gs: string[]) => gs.map((g) => gunlerRef.current.get(g)?.v).filter((x): x is GunOzet => !!x);
      const ozW = oz(gunlerW);
      const ozP = oz(gunlerP);
      const top = (l: GunOzet[], k: keyof GunOzet) => l.reduce((n, x) => n + x[k], 0);
      // Derse devam
      const dvW = pct1(top(ozW, 'gelen'), top(ozW, 'sayilan'));
      const dvP = pct1(top(ozP, 'gelen'), top(ozP, 'sayilan'));
      const f1 = farkYaz(dvW, dvP, 'puan');
      out.push({
        k: 'Derse devam',
        v: dvW === null ? '—' : `%${sayiTr(dvW, 1)}`,
        dizi: ozW.filter((x) => x.sayilan > 0).map((x) => (x.gelen / x.sayilan) * 100),
        ...f1,
        title: 'Ders yoklamalarında "Geldi" ve "Geç geldi" oranı (izinli sayılmaz)',
      });
      // Zamanında yoklama
      const zyW = pct1(top(ozW, 'zamaninda'), top(ozW, 'ders'));
      const zyP = pct1(top(ozP, 'zamaninda'), top(ozP, 'ders'));
      const f2 = farkYaz(zyW === null ? null : Math.round(zyW), zyP === null ? null : Math.round(zyP), 'puan');
      out.push({
        k: 'Zamanında yoklama',
        v: zyW === null ? '—' : `%${Math.round(zyW)}`,
        dizi: ozW.filter((x) => x.ders > 0).map((x) => (x.zamaninda / x.ders) * 100),
        ...f2,
        title: 'Vakti geçen derslerden yoklaması zamanında alınanların oranı',
      });
    }
    if (can.etut) {
      const simdi = new Date();
      const say = (gs: string[]) => {
        const set = new Set(gs);
        const gunluk = new Map<string, number>();
        let yapilan = 0;
        let toplam = 0;
        for (const e of etuts) {
          if (!set.has(e.date) || !etutExpectsAttendance(e)) continue;
          if (e.date === bugunS && !isEtutEnded(e, simdi)) continue;
          toplam++;
          if (hasEtutAttendance(e)) {
            yapilan++;
            gunluk.set(e.date, (gunluk.get(e.date) || 0) + 1);
          }
        }
        return { yapilan, toplam, dizi: gs.map((g) => gunluk.get(g) || 0) };
      };
      // etüt hafta sonu da olabilir: bütün günler (bugüne kadar)
      const tumGunler = (o: number, son: number) => Array.from({ length: son }, (_, i) => pztEkle(o * 7 + i)).filter((g) => g <= bugunS);
      const eW = say(tumGunler(w, 7));
      const eP = say(tumGunler(w - 1, sonIso));
      const f3 = farkYaz(eW.toplam ? eW.yapilan : null, eP.toplam ? eP.yapilan : null, 'adet', ' etüt');
      out.push({
        k: 'Yapılan etüt',
        v: eW.toplam ? (
          <>
            {eW.yapilan}
            <small>/{eW.toplam}</small>
          </>
        ) : (
          '—'
        ),
        dizi: eW.toplam ? eW.dizi : [],
        ...f3,
        title: 'Biten etütlerden yoklaması alınanlar',
      });
    }
    if (can.odev) {
      const rW = {
        bas: pztEkle(w * 7),
        bit: w === 0 ? bugunS : pztEkle(w * 7 + 6),
      };
      const rP = {
        bas: pztEkle((w - 1) * 7),
        bit: pztEkle((w - 1) * 7 + sonIso - 1),
      };
      const gW = odevTeslimGruplari(homeworks, submissions, students, classes, rW.bas, rW.bit, 'gun');
      const gP = odevTeslimGruplari(homeworks, submissions, students, classes, rP.bas, rP.bit, 'gun');
      const sum = (m: typeof gW) => Array.from(m.values()).reduce((a, g) => ({ exp: a.exp + g.exp, done: a.done + g.done }), { exp: 0, done: 0 });
      const sW = sum(gW);
      const sP = sum(gP);
      const oW = pct1(sW.done, sW.exp);
      const oP = pct1(sP.done, sP.exp);
      const f4 = farkYaz(oW === null ? null : Math.round(oW), oP === null ? null : Math.round(oP), 'puan');
      out.push({
        k: 'Ödev teslimi',
        v: oW === null ? '—' : `%${Math.round(oW)}`,
        dizi: Array.from(gW.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .filter(([, g]) => g.exp > 0)
          .map(([, g]) => (g.done / g.exp) * 100),
        ...f4,
        title: 'Teslim tarihi bu aralıkta olan ödevlerde teslim edenlerin oranı',
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can, ayar, nabizHafta, gunSurum, bugunS, buPzt, etuts, homeworks, submissions, students, classes, okulGunleri]);

  // ================================================================ ÖĞRETMENLER
  const ogretmen = useMemo(() => {
    if (!ogretmenRap) return null;
    const satir = ogretmenRap
      .map((r) => {
        const vade = r.alinan + r.alinmayan;
        return {
          ...r,
          vade,
          oran: vade > 0 ? Math.round((Math.max(0, r.alinan - r.gec) / vade) * 100) : 100,
        };
      })
      .filter((r) => r.vade > 0);
    const dikkat = satir
      .filter((r) => r.alinmayan > 0 || r.gec > 0)
      .sort((a, b) => a.oran - b.oran || b.alinmayan - a.alinmayan || a.ad.localeCompare(b.ad, 'tr'));
    return { dikkat, duzenli: satir.length - dikkat.length };
  }, [ogretmenRap]);

  // ================================================================ YARDIMCILAR
  const [rapor, setRapor] = useState<Rapor | null>(null);
  const [tatilAcik, setTatilAcik] = useState(false);
  const [mesaj, setMesaj] = useState<{
    ton: 'ok' | 'hata';
    text: string;
  } | null>(null);
  useEffect(() => {
    if (!mesaj) return;
    const t = setTimeout(() => setMesaj(null), 4000);
    return () => clearTimeout(t);
  }, [mesaj]);

  const aralikYaz = (a: Date, b: Date) =>
    a.getMonth() === b.getMonth()
      ? `${a.getDate()}–${b.getDate()} ${AY_ADLARI[b.getMonth()]}`
      : `${a.getDate()} ${AY_ADLARI[a.getMonth()]} – ${b.getDate()} ${AY_ADLARI[b.getMonth()]}`;
  const pztD = tarihCoz(buPzt);
  const pazD = tGunEkle(pztD, 6);
  const { selam, ad } = akSelam(currentTeacher);
  const adParcasi = ad.split(' ');
  const ilkAd = adParcasi[0] || '';
  const hitap = adParcasi.slice(1).join(' ');

  // ---- başlık cümlesi (yalnız açık bölümlerden)
  const lede = (() => {
    const parca: React.ReactNode[] = [];
    if (can.takvim && kayitlar) {
      const buHafta = hepsi.filter((g) => g.tarih >= buPzt && g.tarih <= tYaz(pazD));
      const sonraki = hepsi.find((g) => g.tarih > tYaz(pazD));
      if (!hepsi.length) parca.push(<React.Fragment key="t">Akademik takvim henüz yüklenmedi.</React.Fragment>);
      else if (buHafta.length)
        parca.push(
          <React.Fragment key="t">
            Bu hafta akademik takvimde <b>{buHafta.length} etkinlik</b> var; ilki <b>{GUN_TAM_PAZAR[tarihCoz(buHafta[0].tarih).getDay()]}</b> günü.
          </React.Fragment>,
        );
      else
        parca.push(
          <React.Fragment key="t">
            Bu hafta akademik takvimde etkinlik yok.
            {sonraki && (
              <>
                {' '}
                Sıradaki <b>{`${tarihCoz(sonraki.tarih).getDate()} ${AY_ADLARI[tarihCoz(sonraki.tarih).getMonth()]}`}</b>: {baslik(sonraki.ad)}.
              </>
            )}
          </React.Fragment>,
        );
    }
    if (can.ders && ayar?.kayitli) {
      const b = gunlerRef.current.get(bugunS)?.v;
      if (b && b.geciken > 0)
        parca.push(
          <React.Fragment key="d">
            {parca.length ? ' ' : ''}Bugün <b>{b.geciken} yoklama</b> gecikti.
          </React.Fragment>,
        );
      else if (b && b.ders > 0 && !parca.length) parca.push(<React.Fragment key="d">Bugün yoklamalar zamanında alınıyor.</React.Fragment>);
    }
    return parca.length ? parca : null;
  })();

  // ================================================================ ÇİZİM
  const takvimHafta = (() => {
    if (!can.takvim || !kurumId || kayitlar === null) return null;
    const pzt = tGunEkle(pztD, kaydir * 7);
    const paz = tGunEkle(pzt, 6);
    const icinde = (g: AktEtkinlik) => g.tarih >= tYaz(pzt) && g.tarih <= tYaz(paz);
    const hafta = hepsi.filter(icinde);
    const sonraki = hepsi.find((g) => g.tarih > tYaz(paz));
    const siradakiler = hepsi.filter((g) => g.tarih >= bugunS).slice(0, 4);
    const ne = kaydir === 0 ? 'bu hafta' : `${Math.abs(kaydir)} hafta ${kaydir > 0 ? 'sonra' : 'önce'}`;
    const kalan = (s: string) => {
      const n = Math.round((tarihCoz(s).getTime() - tarihCoz(bugunS).getTime()) / 864e5);
      return n === 0 ? 'Bugün' : n === 1 ? 'Yarın' : n < 7 ? GUN_TAM_PAZAR[tarihCoz(s).getDay()] : `${n} gün`;
    };
    return (
      <section className="od-card" aria-labelledby="od-h-akw">
        <div className="od-card-h">
          <div>
            <h2 id="od-h-akw">Haftanın faaliyetleri</h2>
            <p>
              {aralikYaz(pzt, paz)} · {ne}
            </p>
          </div>
          <div className="od-wnav" role="group" aria-label="Hafta seç">
            <button type="button" className="od-iconbtn" aria-label="Önceki hafta" onClick={() => setKaydir((k) => k - 1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="ak-btn w-24" disabled={kaydir === 0} onClick={() => setKaydir(0)}>
              Bu hafta
            </button>
            <button type="button" className="od-iconbtn" aria-label="Sonraki hafta" onClick={() => setKaydir((k) => k + 1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="od-akw-body">
          <div style={{ minWidth: 0 }}>
            <div className="od-akweek" aria-live="polite">
              {Array.from({ length: 7 }, (_, i) => {
                const d = tGunEkle(pzt, i);
                const ds = tYaz(d);
                const gun = hafta.filter((g) => g.tarih === ds);
                return (
                  <div key={ds} className={['od-akd', i > 4 && 'we', ds === bugunS && 'today', ds < bugunS && 'past'].filter(Boolean).join(' ')}>
                    <div className="dh">
                      <span>{ds === bugunS ? 'Bugün' : GUN_KISA_PAZAR[d.getDay()]}</span>
                      <b className="tnum">{d.getDate()}</b>
                    </div>
                    {gun.length ? (
                      gun.map((g) => {
                        const [ana, konu] = adParca(g.ad);
                        return (
                          <button
                            key={g.key}
                            type="button"
                            className={'od-ake' + (g.kapsam === 'veli' ? ' veli' : '')}
                            title={baslik(g.ad)}
                            onClick={() => git('akademik_takvim')}
                          >
                            <b>{ana}</b>
                            {konu && <small>{konu}</small>}
                            <span>
                              {g.yer === 'dis' && <MapPin aria-hidden="true" />}
                              {siniflarYazi(g.siniflar)}
                              {g.kapsam === 'veli' && ' · veli'}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <span className="none">{i > 4 ? '' : '—'}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {!hafta.length && (
              <div className="od-akw-empty">
                <span>
                  {hepsi.length ? 'Bu hafta takvimde etkinlik yok.' : 'Akademik takvim henüz yüklenmedi.'}
                  {sonraki && (
                    <>
                      {' '}
                      Sıradaki:{' '}
                      <b>{`${tarihCoz(sonraki.tarih).getDate()} ${AY_ADLARI[tarihCoz(sonraki.tarih).getMonth()]} ${GUN_TAM_PAZAR[tarihCoz(sonraki.tarih).getDay()]}`}</b>
                      , {baslik(sonraki.ad)}
                    </>
                  )}
                </span>
                {sonraki ? (
                  <button
                    type="button"
                    className="ak-btn"
                    onClick={() => setKaydir(Math.round((pazartesi(tarihCoz(sonraki.tarih)).getTime() - pztD.getTime()) / 6048e5))}
                  >
                    O haftaya git
                  </button>
                ) : (
                  <button type="button" className="ak-btn" onClick={() => git('akademik_takvim')}>
                    Takvime git
                  </button>
                )}
              </div>
            )}
          </div>
          <aside className="od-akup" aria-labelledby="od-h-akup">
            <h3 id="od-h-akup">Sıradakiler</h3>
            {siradakiler.length ? (
              <ol>
                {siradakiler.map((g) => {
                  const d = tarihCoz(g.tarih);
                  return (
                    <li key={g.key}>
                      <span className="od-dt">
                        <b className="tnum">{d.getDate()}</b>
                        <span>{GUN_KISA_PAZAR[d.getDay()]}</span>
                      </span>
                      <span className="x">
                        <b title={baslik(g.ad)}>{baslik(g.ad)}</b>
                        <span>
                          {AY_KISA[d.getMonth()]} · {siniflarYazi(g.siniflar)} · {g.yer === 'dis' ? 'okul dışı' : 'okul içi'}
                        </span>
                      </span>
                      <span className="in">{kalan(g.tarih)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="nil">Yaklaşan etkinlik yok</p>
            )}
            <button type="button" className="od-link" onClick={() => git('akademik_takvim')}>
              Tüm takvim <ArrowRight aria-hidden="true" />
            </button>
          </aside>
        </div>
      </section>
    );
  })();

  const dersHazir = can.ders && ayar?.kayitli === true;
  const okulGunleriBuHafta = useMemo(() => {
    const gunler = ayar?.gunler?.length ? ayar.gunler : [1, 2, 3, 4, 5];
    return gunler
      .filter((g) => g >= 1 && g <= 7)
      .sort((a, b) => a - b)
      .map((g) => pztEkle(g - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayar, buPzt]);

  const raf = [
    can.ders && {
      id: 'yoklama',
      ad: 'Yoklama',
      alt: 'Günlük ve haftalık · A4 / Excel',
      fn: () => setRapor('yoklama'),
    },
    can.ders && {
      id: 'devamsizlik',
      ad: 'Devamsızlık',
      alt: 'Sınıf ve öğrenci bazında',
      fn: () => setRapor('devamsizlik'),
    },
    can.odev && {
      id: 'odev',
      ad: 'Ödevler',
      alt: 'Teslim oranı · sınıf ve öğretmen',
      fn: () => (can.ders ? setRapor('odev') : git('homework')),
    },
    can.deneme && {
      id: 'deneme',
      ad: 'Deneme analizi',
      alt: 'Sonuçlar ve kazanım analizi',
      fn: () => git('deneme'),
    },
  ].filter(Boolean) as Array<{
    id: string;
    ad: string;
    alt: string;
    fn: () => void;
  }>;

  const nCls = (n: number) => (n >= 4 ? '' : ` n${n}`);
  const tatilYok = dersHazir && tatiller !== null && tatiller.length === 0;

  const katman = (
    <>
      {can.tatilYaz && dersHazir && (
        <AkTatilSheet
          open={tatilAcik}
          onClose={() => setTatilAcik(false)}
          tatiller={tatiller || []}
          bugun={bugunS}
          onKayit={() => void dersOku()}
          onMesaj={setMesaj}
        />
      )}
      {mesaj && (
        <div className={'ak-toast' + (mesaj.ton === 'hata' ? ' bad' : '')} role="status">
          {mesaj.text}
        </div>
      )}
      <Suspense fallback={null}>
        {rapor && (
          <KurumRaporu
            open
            ilkBolum={rapor}
            onClose={() => setRapor(null)}
            etuts={etuts}
            homeworks={homeworks}
            submissions={submissions}
            students={students}
            classes={classes}
          />
        )}
      </Suspense>
    </>
  );

  return (
    <AnaSayfaKabuk currentTeacher={currentTeacher} unreadMessages={unreadMessages} onNavigate={onNavigateTab} tema="odak" overlay={katman}>
      <div className="od-hero">
        <div>
          <div className="od-eyebrow">Hafta {aralikYaz(pztD, pazD)}</div>
          <h1>
            {selam}
            {ilkAd && (
              <>
                {' '}
                <em>{ilkAd}</em>
                {hitap && ` ${hitap}`}
              </>
            )}
          </h1>
          {lede && <p className="od-lede">{lede}</p>}
        </div>
      </div>

      {takvimHafta}

      {nabiz.length > 0 && (
        <section aria-labelledby="od-h-nab">
          <div className="od-sec-h">
            <div>
              <h2 id="od-h-nab">Haftanın nabzı</h2>
              <p>Her gün bir nokta · son nokta {nabizHafta === 0 ? 'bugün' : 'haftanın son günü'}</p>
            </div>
            <div className="od-pillseg" role="group" aria-label="Hafta">
              <button type="button" aria-pressed={nabizHafta === 0} onClick={() => setNabizHafta(0)}>
                Bu hafta
              </button>
              <button type="button" aria-pressed={nabizHafta === -1} onClick={() => setNabizHafta(-1)}>
                Geçen hafta
              </button>
            </div>
          </div>
          <div className={'od-grid4' + nCls(nabiz.length)}>
            {nabiz.map((s) => (
              <div key={s.k} className={'od-stat' + (s.dn ? ' alert' : '')} title={s.title}>
                <span className="k">{s.k}</span>
                <span className="v tnum">{s.v}</span>
                <Spark a={s.dizi} dn={s.dn} />
                <span className="d">
                  {s.fark === '=' ? (
                    nabizHafta === 0 ? 'Geçen haftayla aynı' : 'Önceki haftayla aynı'
                  ) : s.fark ? (
                    <>
                      <span className={s.up ? 'up' : s.dn ? 'dn' : ''}>{s.fark}</span> {nabizHafta === 0 ? 'geçen haftaya göre' : 'önceki haftaya göre'}
                    </>
                  ) : (
                    'Karşılaştırma için veri yok'
                  )}
                </span>
              </div>
            ))}
          </div>
          {dersHata && (
            <p className="od-err" style={{ marginTop: '0.5rem' }}>
              {dersHata}
            </p>
          )}
        </section>
      )}

      {tatilYok && (
        <div className="od-note alert">
          <span className="ic">
            <CalendarDays aria-hidden="true" />
          </span>
          <span>
            <b>Tatil günleri girilmedi.</b> Resmi tatillerde dersler "yoklama gecikti" sayılır, öğretmenlere boşuna hatırlatma gider.
            {!can.tatilYaz && ' Kurum yöneticisi Yönetim › Ders programı bölümünden ekleyebilir.'}
          </span>
          {can.tatilYaz && (
            <button type="button" className="ak-btn w-24" onClick={() => setTatilAcik(true)}>
              Tatil ekle
            </button>
          )}
        </div>
      )}

      {dersHazir && (
        <div className="od-grid2">
          <section className="od-card" aria-labelledby="od-h-ogr">
            <div className="od-card-h">
              <div>
                <h2 id="od-h-ogr">Dikkat isteyen öğretmenler</h2>
                <p>Bu hafta · zamanında yoklama oranı</p>
              </div>
              <button type="button" className="od-link" onClick={() => setRapor('ogretmen')}>
                Öğretmen raporu <ArrowRight aria-hidden="true" />
              </button>
            </div>
            {ogretmen === null ? (
              <p className="od-sub">Okunuyor…</p>
            ) : ogretmen.dikkat.length ? (
              <>
                <ul className="od-rows">
                  {ogretmen.dikkat.slice(0, 4).map((r) => {
                    const kotu = r.oran < 85;
                    const neden = [r.alinmayan > 0 && `${r.alinmayan} yoklama alınmadı`, r.gec > 0 && `${r.gec} geç yoklama`].filter(Boolean).join(' · ');
                    return (
                      <li key={r.teacherId}>
                        <span className="od-av">{akBasHarf(r.ad)}</span>
                        <span className="who">
                          <b>{r.ad}</b>
                          <span>{neden}</span>
                        </span>
                        <span className="od-meter" aria-hidden="true">
                          <i className={kotu ? 'bad' : ''} style={{ width: `${r.oran}%` }} />
                        </span>
                        <span className={'od-pct tnum' + (kotu ? ' bad' : '')}>%{r.oran}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="od-sub">
                  {ogretmen.dikkat.length > 4 && `${ogretmen.dikkat.length - 4} öğretmen daha raporda. `}
                  {ogretmen.duzenli > 0 && `Diğer ${ogretmen.duzenli} öğretmen düzenli.`}
                </p>
              </>
            ) : (
              <div className="od-empty">
                <i aria-hidden="true">✓</i>
                {ogretmen.duzenli ? `${ogretmen.duzenli} öğretmenin hepsi yoklamayı zamanında aldı.` : 'Bu hafta vakti geçen ders yok.'}
              </div>
            )}
          </section>

          <section className="od-card" aria-labelledby="od-h-dev">
            <div className="od-card-h">
              <div>
                <h2 id="od-h-dev">Devamsızlığı artanlar</h2>
                <p>Bu hafta 2 gün ve üstü · {artan && artan.sinir > 0 ? 'sağda sınıra kalan gün' : 'sağda yıl toplamı'}</p>
              </div>
              <button type="button" className="od-link" onClick={() => setRapor('devamsizlik')}>
                Devamsızlık raporu <ArrowRight aria-hidden="true" />
              </button>
            </div>
            {artanHata ? (
              <p className="od-err">{artanHata}</p>
            ) : artan === null ? (
              <p className="od-sub">Okunuyor…</p>
            ) : artan.ogrenciler.length ? (
              <>
                <ul className="od-rows">
                  {artan.ogrenciler.slice(0, 5).map((o) => {
                    const gunSet = new Set(o.gunler);
                    const kalan = artan.sinir - o.yilGun;
                    const etiket =
                      artan.sinir > 0 ? (
                        kalan <= 0 ? (
                          <span className="od-kala">Sınırda</span>
                        ) : (
                          <span className={'od-kala' + (kalan <= Math.max(artan.kala, 1) ? '' : ' w')}>{kalan} kaldı</span>
                        )
                      ) : (
                        <span className="od-kala n">Yılda {o.yilGun} gün</span>
                      );
                    return (
                      <li key={o.studentId}>
                        <span className="od-av">{akBasHarf(o.ad)}</span>
                        <span className="who">
                          <b>{o.ad}</b>
                          <span>{o.sinif || 'Sınıfsız'}</span>
                        </span>
                        <span className="od-pips" aria-label={`${okulGunleriBuHafta.length} günden ${o.gunler.length}`} role="img">
                          {okulGunleriBuHafta.map((g) => (
                            <i key={g} className={gunSet.has(g) ? 'on' : ''} />
                          ))}
                        </span>
                        {etiket}
                      </li>
                    );
                  })}
                </ul>
                {artan.ogrenciler.length > 5 && <p className="od-sub">{artan.ogrenciler.length - 5} öğrenci daha raporda.</p>}
              </>
            ) : (
              <div className="od-empty">
                <i aria-hidden="true">✓</i>
                Bu hafta 2 gün ve üstü gelmeyen öğrenci yok.
              </div>
            )}
          </section>
        </div>
      )}

      {raf.length > 0 && (
        <section aria-label="Raporlar">
          <div className={'od-shelf' + nCls(raf.length)}>
            {raf.map((r) => (
              <button key={r.id} type="button" onClick={r.fn}>
                {r.ad}
                <span>{r.alt}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </AnaSayfaKabuk>
  );
};
