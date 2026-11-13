import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { ClassGroup, Etut, Homework, HomeworkSubmission, Student, Teacher, TeacherTabType } from '../../types';
import {
  DersAyar,
  DevamsizlikSatiri,
  GUN_ADLARI,
  GUN_KISA,
  GunHucre,
  GunIzin,
  Tatil,
  VekilKaydi,
  dersCanliDinle,
  devamsizlikRapor,
  gunEkle,
  gunTablosu,
  haftaBasi,
  isoGun,
  izinListesi,
  ozetBugun,
  tarihUzun,
  tatilListesi,
  trBugun,
  trSaat,
  vekilListesi,
} from '../../services/dersService';
import { denemeTarihleri } from '../../services/denemeService';
import { dersKisa, dakika } from '../../lib/dersKisa';
import { etutEndTime, etutExpectsAttendance, hasEtutAttendance } from '../../lib/etutTiming';
import { dersHatirlat } from '../../lib/push';
import { AnaSayfaKabuk, akBasHarf, akSelam } from './AnaSayfaKabuk';
import './mudurYardimcisi.css';

// ============================================================================
// Aşama 247: MÜDÜR YARDIMCISI ANA SAYFASI (taslak: mudur-yardimcisi-v3.html, Odak renkleri)
// Kimde: Müdür Yardımcısı rolü olan (Müdür rolü olmayan) hesap; kurum yöneticisi de ise İdare portalında.
// Günün işi: bugünkü yoklama haritası (sınıf × ders saati), geciken yoklamaya hatırlatma, vekil ve izinler,
// bugün gelmeyenler, bugünün etütleri ve okulun haftası.
// KURAL (12 Kas, Mustafa): yalnız kurumun AÇIK bölümleri. Dersler kapalıysa harita / vekil / gelmeyen / izin yok;
//   Etütler kapalıysa etüt yok; Deneme kapalıysa haftada deneme günü yok. İdareci derse girmez: "sizin dersiniz" yok.
// Kaynaklar (ilgili sayfayla aynı): ders_gun_tablosu ve ders_ozet_bugun (Dersler › Okul geneli), ders_vekil ve
//   ders_gun_izin (232), ders_devamsizlik_rapor (Kurum raporu), kurum_ders_tatil, deneme_exams, etütler (dataService).
// Senkron: ders tabloları canlı; saat her dakika ilerler, 5 dakikada bir ve sekmeye dönünce sunucudan okunur.
// ============================================================================

const KurumRaporu = lazy(() => import('../Teacher/KurumRaporu').then((m) => ({ default: m.KurumRaporu })));

type Rapor = 'yoklama' | 'devamsizlik' | 'ogretmen' | 'odev';
type Durum = 'ok' | 'late' | 'reminded' | 'cur' | 'later' | 'none';
const ETIKET: Record<Durum, string> = {
  ok: 'Yoklama alındı',
  late: 'Yoklama alınmadı',
  reminded: 'Hatırlatıldı',
  cur: 'Ders sürüyor',
  later: 'Sonra',
  none: 'Ders yok',
};
const trSirala = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });
const harfler = (ad: string) =>
  ad
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toLocaleUpperCase('tr-TR'))
    .join('.') + (ad.trim() ? '.' : '');

// Hatırlatma günde bir kez: bu oturumda gönderilenler (sayfa yenilense de aynı gün hatırlanır)
const HATIRLAT_KEY = 'edu_ders_hatirlat_v1';
const hatirlatOku = (gun: string): Set<string> => {
  try {
    const v = JSON.parse(sessionStorage.getItem(HATIRLAT_KEY) || 'null');
    return new Set(v?.gun === gun && Array.isArray(v.k) ? v.k : []);
  } catch {
    return new Set();
  }
};
const hatirlatYaz = (gun: string, s: Set<string>) => {
  try {
    sessionStorage.setItem(HATIRLAT_KEY, JSON.stringify({ gun, k: [...s] }));
  } catch {
    /* özel pencere: yalnız ekranda tutulur */
  }
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

interface Veri {
  ayar: DersAyar | null;
  hucreler: GunHucre[];
  gelmeyen: number | null;
  devam: DevamsizlikSatiri[];
  vekil: VekilKaydi[];
  izin: GunIzin[];
  tatil: Tatil[];
}

export const MudurYardimcisiAnaSayfa: React.FC<Props> = ({
  currentTeacher,
  students,
  classes,
  etuts,
  homeworks,
  submissions,
  unreadMessages,
  onNavigateTab,
}) => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const kurumId = dataService.getMyKurum().kurumId || '';
  const can = useMemo(
    () => ({ ders: dataService.canUseTab('grades'), etut: dataService.canUseTab('etuts'), deneme: dataService.canUseTab('deneme') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const git = (tab: TeacherTabType) => {
    onNavigateTab(tab);
    window.scrollTo({ top: 0 });
  };

  // ---- saat (dakikada bir ilerler: "şimdi" sütunu, etüt durumu)
  const [saat, setSaat] = useState(trSaat());
  const [bugun, setBugun] = useState(trBugun());
  useEffect(() => {
    const t = setInterval(() => {
      setSaat(trSaat());
      setBugun(trBugun());
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  const pzt = haftaBasi(bugun);
  const paz = gunEkle(pzt, 6);

  // ================================================================ DERS VERİSİ
  const [veri, setVeri] = useState<Veri | null>(null);
  const [hata, setHata] = useState('');
  const oku = useCallback(async () => {
    if (!kurumId) return;
    try {
      const [gt, oz, dv, vk, iz, tt] = await Promise.all([
        gunTablosu(bugun),
        ozetBugun().catch(() => null),
        devamsizlikRapor(bugun, bugun).catch(() => [] as DevamsizlikSatiri[]),
        vekilListesi(kurumId, pzt, paz).catch(() => [] as VekilKaydi[]),
        izinListesi(kurumId, pzt).catch(() => [] as GunIzin[]),
        tatilListesi(kurumId, pzt).catch(() => [] as Tatil[]),
      ]);
      setVeri({
        ayar: gt.ayar,
        hucreler: gt.hucreler,
        gelmeyen: oz ? oz.gelmeyen : null,
        devam: dv,
        vekil: vk,
        izin: iz.filter((x) => x.tarih <= paz),
        tatil: tt.filter((x) => x.tarih <= paz),
      });
      setHata('');
    } catch (e: any) {
      setHata(e?.message || 'Ders bilgisi okunamadı.');
    }
  }, [kurumId, bugun, pzt, paz]);
  useEffect(() => {
    if (!can.ders || !kurumId) {
      setVeri(null);
      return;
    }
    void oku();
    const yenile = () => document.visibilityState === 'visible' && void oku();
    const t = setInterval(yenile, 5 * 60_000);
    document.addEventListener('visibilitychange', yenile);
    const kapat = dersCanliDinle(
      kurumId,
      ['ders_yoklama_oturum', 'ders_programi', 'kurum_ders_ayar', 'kurum_ders_tatil', 'ders_gun_izin', 'ders_vekil'],
      () => void oku(),
    );
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', yenile);
      kapat();
    };
  }, [can.ders, kurumId, oku]);

  // denemeler (yalnız Deneme bölümü açıksa)
  const [denemeler, setDenemeler] = useState<Array<{ id: string; name: string; examDate: string }>>([]);
  useEffect(() => {
    if (!can.deneme) {
      setDenemeler([]);
      return;
    }
    let iptal = false;
    void denemeTarihleri(pzt, paz).then((d) => !iptal && setDenemeler(d));
    return () => {
      iptal = true;
    };
  }, [can.deneme, pzt, paz]);

  const ayar = veri?.ayar || null;
  const dersHazir = can.ders && !!ayar?.kayitli;

  // ---- adlar
  const ogretmenAd = useMemo(
    () => new Map(dataService.getAllTeachersInternal().map((t) => [t.id, t.name] as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const ogrenci = useMemo(() => new Map(students.map((s) => [s.id, s] as const)), [students]);
  const sinifAd = useMemo(() => new Map(classes.map((c) => [c.id, c.name] as const)), [classes]);

  // ---- şimdi hangi ders
  const simdiDk = dakika(saat);
  const saatler = ayar?.saatler || [];
  const simdiSira = (() => {
    const i = saatler.findIndex((s) => dakika(s.bas) <= simdiDk && simdiDk < dakika(s.bit));
    return i >= 0 ? i + 1 : 0;
  })();
  const bitenSayisi = saatler.filter((s) => dakika(s.bit) <= simdiDk).length;
  const okulGunu = !!ayar?.gunler?.includes(isoGun(bugun)) && !(veri?.tatil || []).some((t) => t.tarih === bugun);

  // ---- hatırlatma
  const [hatirlanan, setHatirlanan] = useState<Set<string>>(() => hatirlatOku(trBugun()));
  useEffect(() => setHatirlanan(hatirlatOku(bugun)), [bugun]);
  const [mesaj, setMesaj] = useState<{ ton: 'ok' | 'hata'; text: string } | null>(null);
  useEffect(() => {
    if (!mesaj) return;
    const t = setTimeout(() => setMesaj(null), 3200);
    return () => clearTimeout(t);
  }, [mesaj]);

  // ---- harita hücreleri
  const vekilBugun = useMemo(
    () => new Map<string, VekilKaydi>((veri?.vekil || []).filter((v) => v.tarih === bugun).map((v) => [`${v.classId}|${v.sira}`, v])),
    [veri, bugun],
  );
  type Hucre = { k: string; h: GunHucre; st: Durum; vekil: VekilKaydi | undefined };
  const harita = useMemo(() => {
    const m = new Map<string, { classId: string; classAd: string; hucre: Map<number, Hucre> }>();
    for (const h of veri?.hucreler || []) {
      if (!m.has(h.classId)) m.set(h.classId, { classId: h.classId, classAd: h.classAd, hucre: new Map() });
      const k = `${h.classId}|${h.sira}`;
      const st: Durum =
        h.durum === 'alindi' ? 'ok' : h.durum === 'geciken' ? (hatirlanan.has(k) ? 'reminded' : 'late') : h.durum === 'bekliyor' ? 'cur' : 'later';
      m.get(h.classId)!.hucre.set(h.sira, { k, h, st, vekil: vekilBugun.get(k) });
    }
    return Array.from(m.values()).sort((a, b) => trSirala(a.classAd, b.classAd));
  }, [veri, hatirlanan, vekilBugun]);
  const siraSayisi = Math.max(ayar?.dersSayisi || 0, ...(veri?.hucreler || []).map((h) => h.sira));
  const siralar = Array.from({ length: siraSayisi }, (_, i) => i + 1);
  const tum = harita.flatMap((r) => Array.from(r.hucre.values()));
  const vadeli = tum.filter((x) => x.st === 'ok' || x.st === 'late' || x.st === 'reminded');
  const alinan = vadeli.filter((x) => x.st === 'ok');
  const gecikenler = tum.filter((x) => x.st === 'late' || x.st === 'reminded').sort((a, b) => a.h.sira - b.h.sira || trSirala(a.h.classAd, b.h.classAd));
  const gecikenSayi = tum.filter((x) => x.st === 'late').length;
  const sayilar = alinan.reduce(
    (a, x) => {
      const s = x.h.oturum?.sayilar || {};
      const gel = (s.present || 0) + (s.late || 0);
      return { gel: a.gel + gel, top: a.top + gel + (s.absent || 0) };
    },
    { gel: 0, top: 0 },
  );
  const devamYuzde = sayilar.top ? (sayilar.gel / sayilar.top) * 100 : null;

  const [suzgec, setSuzgec] = useState<'all' | 'late' | 'vk'>('all');
  const [secili, setSecili] = useState<string | null>(null);
  const seciliHucre = secili ? tum.find((x) => x.k === secili) || null : null;
  const [ipucu, setIpucu] = useState<{ x: Hucre; left: number; top: number } | null>(null);
  useEffect(() => {
    const kapat = () => setIpucu(null);
    window.addEventListener('scroll', kapat, { passive: true });
    return () => window.removeEventListener('scroll', kapat);
  }, []);

  const ogretmenYazi = (x: Hucre) => (x.vekil ? ogretmenAd.get(x.vekil.teacherId) || 'Vekil' : x.h.teacherAdlari.join(', ') || '—');
  const [gonderiliyor, setGonderiliyor] = useState<string | null>(null);
  const hatirlat = async (x: Hucre) => {
    if (x.st !== 'late' || gonderiliyor) return;
    setGonderiliyor(x.k);
    try {
      const r = await dersHatirlat(x.h.classId, bugun, x.h.sira);
      if (!r.ok) throw new Error(r.error || 'Hatırlatılamadı.');
      const yeni = new Set(hatirlanan);
      yeni.add(x.k);
      setHatirlanan(yeni);
      hatirlatYaz(bugun, yeni);
      setMesaj({ ton: 'ok', text: `${ogretmenYazi(x)} öğretmene hatırlatma gitti` });
    } catch (e: any) {
      setMesaj({ ton: 'hata', text: e?.message || 'Hatırlatılamadı.' });
    } finally {
      setGonderiliyor(null);
    }
  };

  // ---- bugün gelmeyenler (yalnız ders yoklamasından)
  const sinifDersSayisi = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of veri?.hucreler || []) if (h.oturum) m.set(h.classAd, (m.get(h.classAd) || 0) + 1);
    return m;
  }, [veri]);
  const gelmeyenler = useMemo(() => (veri?.devam || []).filter((r) => r.absent > 0).sort((a, b) => b.absent - a.absent || trSirala(a.ad, b.ad)), [veri]);

  // ---- izinler (bugün) ve aralıkları
  const izinBugun = useMemo(() => {
    const liste = veri?.izin || [];
    return liste
      .filter((x) => x.tarih === bugun)
      .map((x) => {
        let son = x.tarih;
        while (liste.some((y) => y.studentId === x.studentId && y.tarih === gunEkle(son, 1) && y.tur === x.tur)) son = gunEkle(son, 1);
        return { ...x, son };
      })
      .sort((a, b) => trSirala(ogrenci.get(a.studentId)?.name || '', ogrenci.get(b.studentId)?.name || ''));
  }, [veri, bugun, ogrenci]);
  const vekilBugunListe = useMemo(
    () => Array.from(vekilBugun.values()).sort((a, b) => a.sira - b.sira || trSirala(sinifAd.get(a.classId) || '', sinifAd.get(b.classId) || '')),
    [vekilBugun, sinifAd],
  );

  // ---- etütler (yalnız Etütler açıksa)
  const simdiDate = new Date();
  const etutBugun = useMemo(
    () => (can.etut ? etuts.filter((e) => e.date === bugun).sort((a, b) => (a.time || '').localeCompare(b.time || '')) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [can.etut, etuts, bugun, tick],
  );
  const etutDurum = (e: Etut): { ad: string; cls: string; node: string } => {
    const bit = etutEndTime(e);
    const bas = new Date(`${e.date}T${e.time || '00:00'}:00`);
    if (hasEtutAttendance(e)) return { ad: 'Alındı', cls: 'ok', node: 'ok' };
    if (bit && bit <= simdiDate) return etutExpectsAttendance(e) ? { ad: 'Yoklama yok', cls: 'bad', node: 'bad' } : { ad: 'Bitti', cls: 'mut', node: '' };
    if (bas <= simdiDate) return { ad: 'Sürüyor', cls: 'hi', node: 'hi' };
    return { ad: 'Sonra', cls: 'mut', node: '' };
  };
  const etutSiniflar = (e: Etut) => {
    if (e.assignedStudentIds === 'all') return 'Bütün öğrenciler';
    const ad = Array.from(
      new Set(
        e.assignedStudentIds
          .map((id) => ogrenci.get(id)?.classId)
          .filter(Boolean)
          .map((c) => sinifAd.get(c as string) || ''),
      ),
    ).filter(Boolean);
    return ad.length ? (ad.length > 2 ? `${ad.slice(0, 2).join(', ')} +${ad.length - 2}` : ad.join(', ')) : `${e.assignedStudentIds.length} öğrenci`;
  };
  const etutOzet = (() => {
    const d = etutBugun.map(etutDurum);
    return {
      tamam: d.filter((x) => x.ad === 'Alındı').length,
      suruyor: d.filter((x) => x.ad === 'Sürüyor').length,
      eksik: d.filter((x) => x.ad === 'Yoklama yok').length,
    };
  })();

  // ---- okulun haftası
  const hafta = Array.from({ length: 7 }, (_, i) => {
    const g = gunEkle(pzt, i);
    return {
      g,
      etut: can.etut ? etuts.filter((e) => e.date === g).length : 0,
      vekil: dersHazir ? (veri?.vekil || []).filter((v) => v.tarih === g).length : 0,
      izin: dersHazir ? (veri?.izin || []).filter((v) => v.tarih === g).length : 0,
      deneme: denemeler.filter((d) => d.examDate === g),
      tatil: dersHazir ? (veri?.tatil || []).find((t) => t.tarih === g) : undefined,
    };
  });
  const haftaGoster = can.etut || dersHazir || can.deneme;

  // ---- başlık
  const { selam, ad } = akSelam(currentTeacher);
  const gunYazi = `${GUN_ADLARI[isoGun(bugun) - 1]}, ${tarihUzun(bugun).replace(/\s\d{4}$/, '')}`;
  const anYazi = !dersHazir
    ? ''
    : !okulGunu
      ? 'bugün ders yok'
      : simdiSira
        ? `${simdiSira}. ders sürüyor`
        : bitenSayisi === 0
          ? 'dersler başlamadı'
          : bitenSayisi >= saatler.length
            ? 'dersler bitti'
            : 'teneffüs';

  const [rapor, setRapor] = useState<Rapor | null>(null);

  const istatistik = [
    dersHazir && {
      k: 'Derse devam · bugün',
      v: devamYuzde === null ? '—' : `%${devamYuzde.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`,
      d: 'ders yoklamasından',
      alert: false,
    },
    dersHazir && { k: 'Geciken yoklama', v: String(gecikenSayi), d: `ders saati sonu + ${ayar?.gecikmeDk || 40} dk`, alert: gecikenSayi > 0 },
    can.etut && {
      k: 'Bugün etüt',
      v: String(etutBugun.length),
      d:
        [etutOzet.tamam && `${etutOzet.tamam} tamam`, etutOzet.suruyor && `${etutOzet.suruyor} sürüyor`, etutOzet.eksik && `${etutOzet.eksik} yoklamasız`]
          .filter(Boolean)
          .join(' · ') || (etutBugun.length ? 'hepsi sonra' : 'bugün etüt yok'),
      alert: etutOzet.eksik > 0,
    },
    dersHazir && {
      k: 'Gelmeyen öğrenci',
      v: veri?.gelmeyen === null || veri?.gelmeyen === undefined ? String(gelmeyenler.length) : String(veri.gelmeyen),
      d: 'ders yoklamasından',
      alert: false,
    },
  ].filter(Boolean) as Array<{ k: string; v: string; d: string; alert: boolean }>;
  const nCls = (n: number) => (n >= 4 ? '' : ` n${n}`);

  // ================================================================ ÇİZİM
  const hucreCiz = (x: Hucre | undefined, sira: number, classId: string) => {
    if (!x) return <div key={`${classId}|${sira}`} className="my-cell none" aria-hidden="true" />;
    const ic = x.st === 'ok' ? '✓' : x.st === 'late' ? '!' : x.st === 'reminded' ? '•' : '';
    const ogr = ogretmenYazi(x);
    return (
      <button
        key={x.k}
        type="button"
        className={`my-cell ${x.st}${x.vekil ? ' has-vk' : ''}${secili === x.k ? ' sel' : ''}`}
        aria-label={`${x.h.classAd} ${sira}. ders ${x.h.ders}, ${ogr}: ${ETIKET[x.st]}${x.st === 'late' ? '. Hatırlatmak için dokunun' : ''}`}
        disabled={gonderiliyor === x.k}
        onClick={() => {
          setSecili(x.k);
          if (x.st === 'late') void hatirlat(x);
        }}
        onPointerEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setIpucu({ x, left: Math.min(r.left, window.innerWidth - 270), top: r.bottom + 8 });
        }}
        onPointerLeave={() => setIpucu(null)}
      >
        <span>{dersKisa(x.h.ders) || x.h.ders}</span>
        <small>{harfler(ogr)}</small>
        {ic && (
          <span className="ic" aria-hidden="true">
            {ic}
          </span>
        )}
        {x.vekil && (
          <span className="vk" aria-hidden="true">
            V
          </span>
        )}
      </button>
    );
  };

  const saatYazi = (sira: number) => {
    const s = saatler[sira - 1];
    return s ? `${s.bas}–${s.bit}` : '';
  };

  const katman = (
    <>
      {ipucu && (
        <div className="my-ctip" role="tooltip" style={{ left: ipucu.left, top: ipucu.top }}>
          <b>
            {ipucu.x.h.classAd} · {ipucu.x.h.sira}. ders · {ipucu.x.h.ders}
          </b>
          <span>
            {ogretmenYazi(ipucu.x)}
            {ipucu.x.vekil ? ' · vekil' : ''} · {saatYazi(ipucu.x.h.sira)}
          </span>
          <span>
            {ETIKET[ipucu.x.st]}
            {ipucu.x.st === 'ok' && ipucu.x.h.oturum
              ? ` · ${(ipucu.x.h.oturum.sayilar.present || 0) + (ipucu.x.h.oturum.sayilar.late || 0)}/${
                  (ipucu.x.h.oturum.sayilar.present || 0) +
                  (ipucu.x.h.oturum.sayilar.late || 0) +
                  (ipucu.x.h.oturum.sayilar.absent || 0) +
                  (ipucu.x.h.oturum.sayilar.excused || 0)
                } geldi`
              : ''}
            {ipucu.x.st === 'late' ? ' · tıklayın, hatırlatın' : ''}
          </span>
        </div>
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

  const detay = (() => {
    const x = seciliHucre;
    if (!x) return <p className="ph">Bir kutuya tıklayın; dersin öğretmeni, yoklama saati ve gelen sayısı burada görünür.</p>;
    const tag = {
      ok: ['Alındı', 'ok'],
      late: ['Alınmadı', 'bad'],
      reminded: ['Hatırlatıldı', 'warn'],
      cur: ['Bekliyor', 'hi'],
      later: ['Sonra', 'mut'],
      none: ['', ''],
    }[x.st];
    const s = x.h.oturum?.sayilar || {};
    const gel = (s.present || 0) + (s.late || 0);
    const top = gel + (s.absent || 0) + (s.excused || 0);
    const alindi = x.h.oturum?.alindiAt
      ? new Date(x.h.oturum.alindiAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
      : '';
    return (
      <>
        <div className="dh">
          <b>
            {x.h.classAd} · {x.h.sira}. ders
          </b>
          <span className={`my-tag ${tag[1]}`}>{tag[0]}</span>
        </div>
        <dl>
          <dt>Ders</dt>
          <dd>{x.h.ders}</dd>
          <dt>Öğretmen</dt>
          <dd>
            {ogretmenYazi(x)}
            {x.vekil ? ' (vekil)' : ''}
          </dd>
          {x.vekil && (
            <>
              <dt>Asıl öğretmen</dt>
              <dd>{x.h.teacherAdlari.join(', ') || '—'}</dd>
            </>
          )}
          <dt>Saat</dt>
          <dd className="tnum">{saatYazi(x.h.sira) || '—'}</dd>
          {x.st === 'ok' && (
            <>
              <dt>Yoklama</dt>
              <dd className="tnum">
                {alindi}
                {x.h.oturum?.gec ? ' (geç)' : ''}
              </dd>
              <dt>Gelen</dt>
              <dd className="tnum">
                {gel}/{top}
              </dd>
            </>
          )}
        </dl>
        {x.st === 'ok' && top > 0 && (
          <span className="att" aria-hidden="true">
            <i style={{ flex: gel, background: 'var(--success)' }} />
            {top - gel > 0 && <i style={{ flex: top - gel, background: 'var(--danger)' }} />}
          </span>
        )}
        {x.st === 'late' && (
          <button type="button" className="ak-btn dark full" onClick={() => void hatirlat(x)} disabled={!!gonderiliyor}>
            {gonderiliyor === x.k ? 'Gönderiliyor' : 'Öğretmene hatırlat'}
          </button>
        )}
      </>
    );
  })();

  return (
    <AnaSayfaKabuk currentTeacher={currentTeacher} unreadMessages={unreadMessages} onNavigate={onNavigateTab} tema="odak" sinif="ak-myrd" overlay={katman}>
      <div className="my-hero">
        <div>
          <span className="eyebrow">
            {dersHazir && okulGunu && simdiSira > 0 && <i className="my-live" aria-hidden="true" />}
            {gunYazi}
            {anYazi && ` · ${anYazi}`}
          </span>
          <h1>
            {selam}
            {ad && ` ${ad}`}
          </h1>
          {dersHazir && okulGunu && (
            <p>
              {gecikenSayi > 0 ? (
                <>
                  <b className="bad">{gecikenSayi} yoklama</b> gecikti
                </>
              ) : vadeli.length ? (
                'Yoklamalar zamanında'
              ) : (
                'Henüz vakti gelen yoklama yok'
              )}
              {veri?.gelmeyen ? (
                <>
                  , bugün <b>{veri.gelmeyen} öğrenci</b> derse gelmedi.
                </>
              ) : (
                '.'
              )}
            </p>
          )}
        </div>
        {dersHazir && (
          <div className="acts">
            <button type="button" className="ak-btn dark w-32" onClick={() => setRapor('yoklama')}>
              Kurum raporu
            </button>
          </div>
        )}
      </div>

      {istatistik.length > 0 && (
        <div className={'my-stats' + nCls(istatistik.length)}>
          {istatistik.map((s) => (
            <div key={s.k} className={'my-stat' + (s.alert ? ' alert' : '')}>
              <span className="k">{s.k}</span>
              <span className="v tnum">{s.v}</span>
              <span className="d">{s.d}</span>
            </div>
          ))}
        </div>
      )}

      {can.ders && hata && !veri && <p className="od-err">{hata}</p>}
      {can.ders && veri && !ayar?.kayitli && (
        <p className="od-sub">Ders saatleri kaydedilmemiş; yoklama haritası kurum yöneticisi Yönetim › Ders programı'nı tamamlayınca görünür.</p>
      )}

      {/* ===== YOKLAMA HARİTASI ===== */}
      {dersHazir && okulGunu && harita.length > 0 && (
        <section className="my-card my-mapcard" aria-labelledby="my-h-map">
          <div className="my-card-h">
            <div>
              <h2 id="my-h-map">Yoklama haritası</h2>
              <p>Bugün · her kutu bir ders saati · kırmızı kutuya tıklayınca öğretmene hatırlatma gider (günde bir kez)</p>
            </div>
            <div className="my-seg" role="group" aria-label="Harita süzgeci">
              <button type="button" aria-pressed={suzgec === 'all'} onClick={() => setSuzgec('all')}>
                Tümü
              </button>
              <button type="button" aria-pressed={suzgec === 'late'} onClick={() => setSuzgec('late')}>
                Eksikler {gecikenSayi > 0 && <i className="tnum">{gecikenSayi}</i>}
              </button>
              <button
                type="button"
                aria-pressed={suzgec === 'vk'}
                onClick={() => setSuzgec('vk')}
                disabled={!vekilBugun.size}
                title={vekilBugun.size ? undefined : 'Bugün vekil ders yok'}
              >
                Vekil
              </button>
            </div>
          </div>
          <div className="my-sum">
            <div>
              <span>
                Alınan yoklama{' '}
                <b className="tnum">
                  {alinan.length}/{vadeli.length}
                </b>
              </span>
              <span className="my-prog" aria-hidden="true">
                <i style={{ width: `${vadeli.length ? (alinan.length / vadeli.length) * 100 : 0}%`, background: 'var(--success)' }} />
                <i style={{ width: `${vadeli.length ? ((gecikenler.length - gecikenSayi) / vadeli.length) * 100 : 0}%`, background: 'var(--warning)' }} />
                <i style={{ width: `${vadeli.length ? (gecikenSayi / vadeli.length) * 100 : 0}%`, background: 'var(--danger)' }} />
              </span>
            </div>
            <div>
              <span>
                Derse gelen{' '}
                <b className="tnum">
                  {devamYuzde === null ? '—' : `%${devamYuzde.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`}
                </b>
              </span>
              <span className="my-prog" aria-hidden="true">
                <i style={{ width: `${devamYuzde || 0}%`, background: 'var(--brand)' }} />
              </span>
            </div>
            <div>
              <span>
                Gün{' '}
                <b className="tnum">
                  {Math.min(bitenSayisi, saatler.length)}/{saatler.length} ders bitti
                </b>
              </span>
              <span className="my-prog" aria-hidden="true">
                <i
                  style={{
                    width: `${saatler.length ? ((Math.min(bitenSayisi, saatler.length) + (simdiSira ? 0.5 : 0)) / saatler.length) * 100 : 0}%`,
                    background: 'var(--fg)',
                  }}
                />
              </span>
            </div>
          </div>
          <div className="my-mapbody">
            <div className="my-mapscroll">
              <div
                className={'my-map' + (suzgec === 'late' ? ' f-late' : suzgec === 'vk' ? ' f-vk' : '')}
                style={{ gridTemplateColumns: `calc(5.75 * var(--ak-rem)) repeat(${siralar.length}, minmax(calc(4 * var(--ak-rem)), 1fr))` }}
                aria-label="Sınıf ve ders saatine göre yoklama durumu"
              >
                <div />
                {siralar.map((s) => (
                  <div key={s} className={'my-ch' + (s === simdiSira ? ' now' : '')}>
                    <b>{s}.</b>
                    <span className="tnum">{saatler[s - 1]?.bas || ''}</span>
                  </div>
                ))}
                {harita.map((r) => {
                  const due = Array.from(r.hucre.values()).filter((x) => x.st === 'ok' || x.st === 'late' || x.st === 'reminded');
                  const ok = due.filter((x) => x.st === 'ok').length;
                  return (
                    <React.Fragment key={r.classId}>
                      <div className="my-rh">
                        <b title={r.classAd}>{r.classAd}</b>
                        <span className="mini" aria-hidden="true">
                          <i className={ok < due.length ? 'bad' : ''} style={{ width: `${due.length ? (ok / due.length) * 100 : 0}%` }} />
                        </span>
                      </div>
                      {siralar.map((s) => hucreCiz(r.hucre.get(s), s, r.classId))}
                    </React.Fragment>
                  );
                })}
                <div className="my-fc lbl">Alınan</div>
                {siralar.map((s) => {
                  const col = harita.map((r) => r.hucre.get(s)).filter((x): x is Hucre => !!x && (x.st === 'ok' || x.st === 'late' || x.st === 'reminded'));
                  if (!col.length)
                    return (
                      <div key={s} className="my-fc">
                        {s === simdiSira ? 'sürüyor' : '·'}
                      </div>
                    );
                  const ok = col.filter((x) => x.st === 'ok').length;
                  return (
                    <div key={s} className={'my-fc tnum ' + (ok < col.length ? 'bad' : 'full')}>
                      {ok}/{col.length}
                    </div>
                  );
                })}
              </div>
              <div className="my-legend">
                <span>
                  <i style={{ background: 'var(--success-soft)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--success) 30%, transparent)' }} />
                  Alındı
                </span>
                <span>
                  <i style={{ background: 'var(--danger)' }} />
                  Gecikti
                </span>
                <span>
                  <i style={{ background: 'var(--warning-soft)', boxShadow: 'inset 0 0 0 1px var(--warning)' }} />
                  Hatırlatıldı
                </span>
                <span>
                  <i style={{ boxShadow: 'inset 0 0 0 1.5px var(--brand)' }} />
                  Şu an / bekliyor
                </span>
                <span>
                  <i style={{ boxShadow: 'inset 0 0 0 1px var(--line-strong)' }} />
                  Sonra
                </span>
                <span>
                  <i style={{ background: 'var(--brand)', width: '1.125rem', height: '0.75rem' }} />
                  Vekil
                </span>
              </div>
            </div>
            <aside className="my-side" aria-label="Geciken yoklamalar ve seçili ders">
              <div>
                <h3>
                  Geciken yoklamalar <b className="tnum">{gecikenSayi}</b>
                </h3>
                <div className="my-lrows">
                  {gecikenler.length ? (
                    gecikenler.map((x) => (
                      <div className="my-lrow" key={x.k}>
                        <span className="tx">
                          <b>
                            {x.h.classAd} · {x.h.sira}. ders
                          </b>
                          <span>
                            {x.h.ders} · {ogretmenYazi(x)}
                          </span>
                        </span>
                        {x.st === 'late' ? (
                          <button type="button" className="ak-btn" onClick={() => void hatirlat(x)} disabled={!!gonderiliyor}>
                            {gonderiliyor === x.k ? 'Gidiyor' : 'Hatırlat'}
                          </button>
                        ) : (
                          <span className="my-tag warn">Hatırlatıldı</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="my-allok">Bütün yoklamalar alındı.</div>
                  )}
                </div>
              </div>
              <div className="my-detail" aria-live="polite">
                {detay}
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* ===== VEKİL VE İZİNLER ===== */}
      {dersHazir && (
        <section className="my-card" aria-labelledby="my-h-vek">
          <div className="my-card-h">
            <div>
              <h2 id="my-h-vek">Bugün vekil ve izinler</h2>
              <p>Vekil öğretmen yoklamayı kendisi alır · gün boyu izinli öğrenci "İzinli" sayılır</p>
            </div>
            <button type="button" className="od-link" onClick={() => git('grades')}>
              İzinler <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="my-two wide">
            {vekilBugunListe.length ? (
              <ul className="my-rows">
                {vekilBugunListe.map((v) => {
                  const h = tum.find((x) => x.k === `${v.classId}|${v.sira}`);
                  const sAd = sinifAd.get(v.classId) || h?.h.classAd || '';
                  const tag = !h ? null : h.st === 'ok' ? (
                    <span className="my-tag ok">Alındı</span>
                  ) : h.st === 'late' || h.st === 'reminded' ? (
                    <span className="my-tag bad">Gecikti</span>
                  ) : (
                    <span className="my-tag mut tnum">{saatler[v.sira - 1]?.bas || ''}</span>
                  );
                  return (
                    <li key={`${v.classId}|${v.sira}`}>
                      <span className="my-av">{sAd.replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]/g, '').slice(0, 3) || akBasHarf(sAd)}</span>
                      <span className="who">
                        <b>
                          {sAd} · {v.sira}. ders{h?.h.ders ? ` ${h.h.ders}` : ''}
                        </b>
                        <span>
                          Vekil: {ogretmenAd.get(v.teacherId) || '—'}
                          {h?.h.teacherAdlari.length ? ` · asıl: ${h.h.teacherAdlari.join(', ')}` : ''}
                        </span>
                      </span>
                      {tag}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="my-none">Bugün vekil ders yok.</p>
            )}
            {izinBugun.length ? (
              <ul className="my-rows">
                {izinBugun.slice(0, 6).map((x) => {
                  const o = ogrenci.get(x.studentId);
                  const ad = o?.name || 'Öğrenci';
                  const aralik =
                    x.son === x.tarih
                      ? 'bugün'
                      : `bugün–${GUN_ADLARI[isoGun(x.son) - 1].toLocaleLowerCase('tr-TR')}${x.son > paz ? ` (${tarihUzun(x.son).replace(/\s\d{4}$/, '')})` : ''}`;
                  return (
                    <li key={x.studentId}>
                      <span className="my-av">{akBasHarf(ad)}</span>
                      <span className="who">
                        <b>{ad}</b>
                        <span>
                          {(o && sinifAd.get(o.classId)) || o?.className || ''}
                          {o ? ' · ' : ''}
                          {aralik}
                        </span>
                      </span>
                      <span className={'my-tag ' + (x.tur === 'raporlu' ? 'hi' : 'mut')}>{x.tur === 'raporlu' ? 'Raporlu' : 'İzinli'}</span>
                    </li>
                  );
                })}
                {izinBugun.length > 6 && <li className="my-none">+{izinBugun.length - 6} öğrenci daha</li>}
              </ul>
            ) : (
              <p className="my-none">Bugün gün boyu izinli öğrenci yok.</p>
            )}
          </div>
        </section>
      )}

      {/* ===== GELMEYENLER + ETÜTLER ===== */}
      {(dersHazir || can.etut) && (
        <div className={dersHazir && can.etut ? 'my-two' : ''}>
          {dersHazir && (
            <section className="my-card" aria-labelledby="my-h-gel">
              <div className="my-card-h">
                <div>
                  <h2 id="my-h-gel">Bugün gelmeyenler</h2>
                  <p>Yalnız ders yoklamasından · etüt karışmaz</p>
                </div>
                <button type="button" className="od-link" onClick={() => setRapor('devamsizlik')}>
                  Devamsızlık raporu <ArrowRight aria-hidden="true" />
                </button>
              </div>
              {gelmeyenler.length ? (
                <>
                  <ul className="my-rows">
                    {gelmeyenler.slice(0, 5).map((r) => {
                      const top = sinifDersSayisi.get(r.classAd) || 0;
                      const tum = top > 0 && r.absent >= top;
                      const cls = tum ? 'bad' : top && r.absent * 2 >= top ? 'warn' : 'mut';
                      return (
                        <li key={r.studentId}>
                          <span className="my-av">{akBasHarf(r.ad)}</span>
                          <span className="who">
                            <b>{r.ad}</b>
                            <span>
                              {r.classAd}
                              {tum ? ' · bütün gün' : ''}
                              {r.late ? ' · geç geldi' : ''}
                              {r.excused ? ' · izinli dersi var' : ''}
                            </span>
                          </span>
                          <span className={`my-tag ${cls} tnum`}>{top ? `${r.absent}/${top} ders` : `${r.absent} ders`}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {gelmeyenler.length > 5 && (
                    <button type="button" className="od-link my-more" onClick={() => setRapor('devamsizlik')}>
                      +{gelmeyenler.length - 5} öğrenci daha
                    </button>
                  )}
                </>
              ) : (
                <p className="my-none">{vadeli.length ? 'Bugün derse gelmeyen öğrenci yok.' : 'Henüz yoklaması alınan ders yok.'}</p>
              )}
            </section>
          )}
          {can.etut && (
            <section className="my-card" aria-labelledby="my-h-et">
              <div className="my-card-h">
                <div>
                  <h2 id="my-h-et">Bugünün etütleri</h2>
                  <p>
                    {etutBugun.length
                      ? `${etutBugun.length} etüt · ${new Set(etutBugun.map((e) => e.teacherId || e.teacherName || '')).size} öğretmen`
                      : 'Bugün planlı etüt yok'}
                  </p>
                </div>
                <button type="button" className="od-link" onClick={() => git('etuts')}>
                  Tüm etütler <ArrowRight aria-hidden="true" />
                </button>
              </div>
              {etutBugun.length ? (
                <ol className="my-tl">
                  {(() => {
                    const out: React.ReactNode[] = [];
                    let cizgi = false;
                    const liste = etutBugun.slice(0, 8);
                    liste.forEach((e) => {
                      if (!cizgi && (e.time || '') > saat) {
                        cizgi = true;
                        out.push(
                          <li key="simdi" className="nowline" aria-label={`Şu an ${saat}`}>
                            <span className="tnum">{saat}</span>
                            <i />
                          </li>,
                        );
                      }
                      const d = etutDurum(e);
                      out.push(
                        <li key={e.id}>
                          <span className="h tnum">{e.time}</span>
                          <span className="node">
                            <i className={d.node} />
                          </span>
                          <span className="x">
                            <b>
                              {e.subject}
                              {e.teacherName ? ` · ${e.teacherName}` : ''}
                            </b>
                            <span>{etutSiniflar(e)}</span>
                          </span>
                          <span className={`my-tag ${d.cls}`}>{d.ad}</span>
                        </li>,
                      );
                    });
                    return out;
                  })()}
                  {etutBugun.length > 8 && <li className="my-none">+{etutBugun.length - 8} etüt daha</li>}
                </ol>
              ) : (
                <p className="my-none">Etütler sayfasından planlanan etütler burada saat sırasıyla görünür.</p>
              )}
            </section>
          )}
        </div>
      )}

      {/* ===== OKULUN HAFTASI ===== */}
      {haftaGoster && (
        <section className="my-card" aria-labelledby="my-h-okh">
          <div className="my-card-h">
            <div>
              <h2 id="my-h-okh">Okulun haftası</h2>
              <p>
                Her gün: {[can.etut && 'etüt', dersHazir && 'vekil ders ve izinli öğrenci sayısı'].filter(Boolean).join(', ')}
                {[can.deneme && 'deneme', dersHazir && 'tatil'].filter(Boolean).length
                  ? ` · ${[can.deneme && 'deneme', dersHazir && 'tatil'].filter(Boolean).join(' ve ')} günleri`
                  : ''}
              </p>
            </div>
            {can.etut && (
              <button type="button" className="od-link" onClick={() => git('etuts')}>
                Etütler <ArrowRight aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="my-week">
            {hafta.map((d, i) => {
              const bos = !d.etut && !d.vekil && !d.izin && !d.deneme.length && !d.tatil;
              return (
                <div key={d.g} className={'my-day' + (d.g === bugun ? ' today' : '')}>
                  <div className="dh">
                    <span>{d.g === bugun ? 'Bugün' : GUN_KISA[i]}</span>
                    <b className="tnum">{Number(d.g.slice(8, 10))}</b>
                  </div>
                  {d.tatil && <span className="my-ev t">{d.tatil.aciklama || 'Tatil'}</span>}
                  {d.etut > 0 && <span className="my-ev">{d.etut} etüt</span>}
                  {d.vekil > 0 && <span className="my-ev v">{d.vekil} vekil ders</span>}
                  {d.izin > 0 && <span className="my-ev i">{d.izin} izinli öğrenci</span>}
                  {d.deneme.map((x) => (
                    <span key={x.id} className="my-ev d" title={x.name}>
                      {x.name}
                    </span>
                  ))}
                  {bos && <span className="none">Boş gün</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </AnaSayfaKabuk>
  );
};
