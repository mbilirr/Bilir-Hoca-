// Öğretmen ana sayfası: sayfanın bütün durumu ve işlemleri (Aşama 364). Görünüm parçaları bunu useOgretmenAnaBaglam() ile okur.
import React, { createContext, useContext, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarDays, HelpCircle, UserPlus } from 'lucide-react';
import { dataService } from '../../../services/dataService';
import { useDenemeSurumu } from '../../../lib/denemeCanli';
import { type Etut, type Homework, type HomeworkSubmission, type StudentQuestionLog } from '../../../types';
import { Bekleyen, GUN_ADLARI, HaftaHucre, HaftaVeri, bekleyenlerim, dersCanliDinle, gunEkle, haftaBasi, haftaOku, isoGun, tarihUzun, trBugun, trSaat } from '../../../services/dersService';
import { denemeTarihleri, lastExamBrief } from '../../../services/denemeService';
import { araliktaMi, baslik, etkinlikler, gundeMi, siniflarYazi, type AktEtkinlik } from '../../../services/akademikTakvimService';
import { useAkademikKayitlar } from '../../Teacher/HaftaninFaaliyetleri';
import { takvimdeGoster } from '../AktEtkinlikPencere';
import { dakika } from '../../../lib/dersKisa';
import { etutEndTime, isEtutAttendanceMissing } from '../../../lib/etutTiming';
import { useSeenIds } from '../../../lib/useSeenIds';
import { givenNamesOf } from '../../../lib/greeting';
import { setQuickFocus } from '../../../lib/quickFocus';
import { akSelam } from '../AnaSayfaKabuk';
import { DersYoklamaModal, EtutAttendanceModal, Go, Props, trSirala, gunFark, sure, ymdYerel, dersUyar, hhmm, etutBas, ogrSayi, gunYazi } from './ortak';

export function useOgretmenAnaSayfa({
  currentTeacher,
  students,
  classes,
  homeworks,
  submissions,
  etuts,
  messages,
  unreadMessages,
  onNavigateTab,
  onOpenStudentView,
}: Props) {
  // ---- izinler (bölüm kapalı / açık değişince yeniden hesaplanır)
  const [tick, setTick] = useState(0);
  const [soruKayit, setSoruKayit] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());
  useEffect(
    () =>
      dataService.subscribe(() => {
        setTick((t) => t + 1);
        setSoruKayit(dataService.getQuestionLogs());
      }, ['soru']), // Aşama 349b: yalnız okuduğu veriler (diğerleri sayfaya ana kabuktan gelir)
    [],
  );
  const can = useMemo(
    () => ({
      ders: dataService.canUseTab('grades'),
      etut: dataService.canUseTab('etuts'),
      odev: dataService.canUseTab('homework'),
      soru: dataService.canUseTab('question_tracking'),
      mesaj: dataService.canUseTab('messages'),
      deneme: dataService.canUseTab('deneme'),
      takvim: dataService.akademikTakvimAcik(), // Aşama 337: veri (öğretmen yalnız kendi zümresini okur, sql/337)
      takvimSayfa: dataService.canUseTab('akademik_takvim'), // ayrı sayfa yalnız idare, Rehberlik, Ölçme
      odevVer: dataService.canGiveHomework(),
      etutPlan: dataService.canPlanEtut(),
      ogrEkle: dataService.canUseTab('students') && dataService.canManageStudents(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const kurumId = dataService.getMyKurum().kurumId || '';

  const go: Go = useCallback(
    (tab, focus) => {
      onNavigateTab(tab);
      window.scrollTo({ top: 0 });
      if (focus) setTimeout(() => setQuickFocus(...focus), 0);
    },
    [onNavigateTab],
  );
  // Aşama 337: takvim etkinliği → idare için takvimde yalnız o etkinlik, öğretmen için ayrıntı penceresi
  const [aktSecili, setAktSecili] = useState<AktEtkinlik | null>(null);
  const etkinlikAc = useCallback(
    (g: AktEtkinlik) => {
      if (!takvimdeGoster(g, (t) => go(t))) setAktSecili(g);
    },
    [go],
  );

  // ---- saat (Türkiye saati; dakikada bir ilerler)
  const [saat, setSaat] = useState(trSaat());
  const [bugun, setBugun] = useState(trBugun());
  const [simdi, setSimdi] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => {
      setSaat(trSaat());
      setBugun(trBugun());
      setSimdi(new Date());
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  const simdiDk = dakika(saat);
  const pzt = haftaBasi(bugun);
  const paz = gunEkle(pzt, 6);
  const yerelBugun = ymdYerel(simdi); // etüt ve ödev kayıtları cihaz gününe göre tutulur (Etütler / Ödevler sayfasıyla aynı)

  // ================================================================ DERS PROGRAMIM (Dersler bölümü açıksa)
  const [hafta, setHafta] = useState<HaftaVeri | null>(null);
  const [gelecek, setGelecek] = useState<HaftaVeri | null>(null);
  const [bekleyen, setBekleyen] = useState<Bekleyen[]>([]);
  const okuDers = useCallback(async () => {
    try {
      const [h, b] = await Promise.all([haftaOku(pzt), bekleyenlerim().catch(() => [] as Bekleyen[])]);
      setHafta(h);
      setBekleyen(b);
      // bu hafta dersim kalmadıysa "sıradaki ders" için gelecek hafta da okunur
      if (h.ayar?.kayitli && !h.hucreler.some((x) => x.tarih > bugun)) setGelecek(await haftaOku(gunEkle(pzt, 7)).catch(() => null));
      else setGelecek(null);
    } catch {
      setHafta(null); // 217 SQL kurulu değil ya da bağlantı yok: ders kartı çizilmez, sayfa bozulmaz
      setBekleyen([]);
    }
  }, [pzt, bugun]);
  useEffect(() => {
    if (!can.ders || !kurumId) {
      setHafta(null);
      setGelecek(null);
      setBekleyen([]);
      return;
    }
    void okuDers();
    // Aşama 303: sekmeye dönüşte okumayı dersCanliDinle yapar (kanal kapalıysa ya da uzun ayrılıktan sonra); burada ayrıca
    // dinlenince aynı veri her dönüşte iki kez okunuyordu.
    const t = setInterval(() => document.visibilityState === 'visible' && void okuDers(), 5 * 60_000);
    const kapat = dersCanliDinle(kurumId, ['ders_yoklama_oturum', 'ders_programi', 'kurum_ders_ayar', 'kurum_ders_tatil', 'ders_vekil'], () => void okuDers());
    return () => {
      clearInterval(t);
      kapat();
    };
  }, [can.ders, kurumId, okuDers]);

  const ayar = hafta?.ayar || null;
  const dersHazir = can.ders && !!ayar?.kayitli;
  const saatOf = useCallback((s: number) => ayar?.saatler[s - 1] || { bas: '', bit: '' }, [ayar]);
  const tatilMap = useMemo(
    () => new Map([...(hafta?.tatiller || []), ...(gelecek?.tatiller || [])].map((t) => [t.tarih, t.aciklama] as const)),
    [hafta, gelecek],
  );
  const bugunTatil = dersHazir && tatilMap.has(bugun);

  const sinifMevcut = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) m.set(s.classId, (m.get(s.classId) || 0) + 1);
    return m;
  }, [students]);

  const siraHucre = (a: HaftaHucre, b: HaftaHucre) => a.tarih.localeCompare(b.tarih) || a.sira - b.sira || trSirala(a.classAd, b.classAd);
  const bugunDersler = useMemo(
    () => (dersHazir && !bugunTatil ? (hafta?.hucreler || []).filter((h) => h.tarih === bugun).sort(siraHucre) : []),
    [dersHazir, bugunTatil, hafta, bugun],
  );
  const benimDersim = (h: HaftaHucre) => !h.vekilAd || h.benimVekil; // dersime vekil yazıldıysa yoklamayı vekil alır
  const simdikiler = bugunDersler.filter((h) => dakika(saatOf(h.sira).bas) <= simdiDk && simdiDk < dakika(saatOf(h.sira).bit));
  const simdiSira = simdikiler[0]?.sira || 0;
  const sonrakiBugun = bugunDersler.filter((h) => dakika(saatOf(h.sira).bas) > simdiDk);
  const ileriDers = useMemo(() => {
    const hep = [...(hafta?.hucreler || []), ...(gelecek?.hucreler || [])].filter((h) => h.tarih > bugun && !tatilMap.has(h.tarih)).sort(siraHucre);
    if (!hep.length) return null;
    const gun = hep[0].tarih;
    const o = hep.filter((h) => h.tarih === gun);
    return { gun, ilk: o[0], adet: new Set(o.map((h) => h.sira)).size };
  }, [hafta, gelecek, bugun, tatilMap]);
  const durumOf = (h: HaftaHucre): 'ok' | 'miss' | 'cur' | 'vk' | '' => {
    if (h.oturum) return 'ok';
    if (!benimDersim(h)) return 'vk';
    if (h.sira === simdiSira) return 'cur';
    if (dakika(saatOf(h.sira).bas) <= simdiDk) return 'miss';
    return '';
  };

  // ================================================================ ETÜT / ÖDEV / MESAJ / SORU (dataService; ilgili sayfayla aynı süzgeç)
  const benimEtut = useMemo(() => (can.etut ? etuts.filter((e) => dataService.isMyEtut(e)) : []), [etuts, can.etut]);
  const etutBugun = useMemo(
    () => benimEtut.filter((e) => e.date === yerelBugun).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    [benimEtut, yerelBugun],
  );
  const benimOdev = useMemo(() => (can.odev ? homeworks.filter((h) => dataService.isMine(h)) : []), [homeworks, can.odev]);
  const sinifAd = useMemo(() => new Map(classes.map((c) => [c.id, c.name] as const)), [classes]);

  // Ödev hesabı (Ödevler sayfasıyla aynı): teslim (zamanında / geç) ya da öğretmenin işaretlediği kontrol durumu
  const odevDurum = useMemo(() => {
    const sinifOgr = new Map<string, string[]>();
    for (const s of students) {
      const l = sinifOgr.get(s.classId);
      if (l) l.push(s.id);
      else sinifOgr.set(s.classId, [s.id]);
    }
    const subBy = new Map<string, HomeworkSubmission>();
    for (const s of submissions) subBy.set(`${s.homeworkId}|${s.studentId}`, s);
    const out = new Map<string, { exp: number; kontrol: number; teslim: number; teslimTum: number; isaretsiz: number; siniflar: string }>();
    for (const h of benimOdev) {
      const cIds = h.targetClassIds && h.targetClassIds.length ? Array.from(new Set(h.targetClassIds)) : h.classId ? [h.classId] : [];
      const ids = Array.isArray(h.assignedTo) ? h.assignedTo : cIds.length ? cIds.flatMap((c) => sinifOgr.get(c) || []) : students.map((s) => s.id);
      let kontrol = 0;
      let teslim = 0;
      let teslimTum = 0;
      let isaretsiz = 0;
      for (const id of ids) {
        const s = subBy.get(`${h.id}|${id}`);
        const verdi = s?.status === 'on_time' || s?.status === 'late';
        if (verdi) teslimTum++;
        if (s?.checkStatus) kontrol++;
        else if (verdi) teslim++;
        else isaretsiz++;
      }
      const adlar = (Array.isArray(h.assignedTo) ? [] : cIds.map((c) => sinifAd.get(c) || '').filter(Boolean)).sort(trSirala);
      out.set(h.id, {
        exp: ids.length,
        kontrol,
        teslim,
        teslimTum,
        isaretsiz,
        siniflar: adlar.length
          ? adlar.length > 3
            ? `${adlar.slice(0, 3).join(', ')} +${adlar.length - 3}`
            : adlar.join(', ')
          : Array.isArray(h.assignedTo)
            ? `${ids.length} öğrenci`
            : '',
      });
    }
    return out;
  }, [benimOdev, students, submissions, sinifAd]);
  const odevGun = (h: Homework) => (h.dueDate || '').slice(0, 10);

  const okunmamis = useMemo(
    () =>
      can.mesaj ? messages.filter((m) => !m.read && dataService.isMessageForMe(m)).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')) : [],
    [messages, can.mesaj],
  );

  // Yeni gelenler (TeacherHome ile aynı "görüldü" kaydı: biri işaretlenince öbüründe de kaybolur)
  const tKey = currentTeacher?.id || 'x';
  const [gorulenSoru, soruGoruldu] = useSeenIds(`tchr_qlog_seen_${tKey}`);
  const [gorulenTeslim, teslimGoruldu] = useSeenIds(`tchr_sub_seen_${tKey}`);
  const ogrIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  const yeniTeslimler = useMemo(() => {
    if (!can.odev) return [];
    const sinir = Date.now() - 3 * 86400000;
    const benim = new Set(benimOdev.map((h) => h.id));
    return submissions
      .filter(
        (s) =>
          (s.status === 'on_time' || s.status === 'late') &&
          benim.has(s.homeworkId) &&
          ogrIds.has(s.studentId) &&
          new Date(s.submittedAt || 0).getTime() >= sinir,
      )
      .map((s) => `${s.id}@${s.submittedAt || ''}`);
  }, [submissions, benimOdev, ogrIds, can.odev]);

  // Deneme (yalnız Deneme bölümü açıksa): son deneme ve bu haftanın denemeleri
  const [sonDeneme, setSonDeneme] = useState<{ id: string; name: string; examDate: string } | null>(null);
  const [denemeler, setDenemeler] = useState<Array<{ id: string; name: string; examDate: string }>>([]);
  const denemeSurum = useDenemeSurumu(!!can.deneme); // Aşama 349c: deneme değişince yeniden okunur
  useEffect(() => {
    if (!can.deneme) {
      setSonDeneme(null);
      setDenemeler([]);
      return;
    }
    let iptal = false;
    const oku = () => {
      void lastExamBrief().then((d) => !iptal && setSonDeneme(d));
      void denemeTarihleri(pzt, paz).then((d) => !iptal && setDenemeler(d));
    };
    oku();
    const yenile = () => document.visibilityState === 'visible' && oku();
    document.addEventListener('visibilitychange', yenile);
    return () => {
      iptal = true;
      document.removeEventListener('visibilitychange', yenile);
    };
  }, [can.deneme, pzt, paz, denemeSurum]);

  // Akademik takvim (yalnız bölüm açık kurumda)
  const takvimKayit = useAkademikKayitlar(can.takvim);
  const takvim = useMemo(() => etkinlikler(takvimKayit || []).filter((g) => araliktaMi(g, pzt, paz)), [takvimKayit, pzt, paz]); // Aşama 327

  // ================================================================ MODALLAR
  const [dersHedef, setDersHedef] = useState<{ classId: string; tarih: string; sira: number } | null>(null);
  const [etutHedef, setEtutHedef] = useState<Etut | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const kapat = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', kapat);
    document.addEventListener('keydown', kapat);
    return () => {
      document.removeEventListener('mousedown', kapat);
      document.removeEventListener('keydown', kapat);
    };
  }, [menu]);

  // ================================================================ SİZİ BEKLEYENLER
  type Is = { k: string; uyari: boolean; baslik: string; alt: string; yas: number; btn: string; on: () => void };
  const isler = useMemo(() => {
    const l: Is[] = [];
    if (can.ders) {
      for (const b of bekleyen) {
        if (b.tarih === bugun && (b.sira === simdiSira || bugunTatil)) continue; // süren ders üstteki kartta; tatil gününde yoklama yok
        const bit = saatOf(b.sira).bit;
        l.push({
          k: `d|${b.classId}|${b.tarih}|${b.sira}`,
          uyari: false,
          baslik: `${b.classAd} · ${b.sira}. ders yoklaması`,
          alt: b.tarih === bugun ? `${bit ? `Bitiş ${bit}` : b.ders} · alınmadı` : `${gunYazi(b.tarih)} · ${b.ders || 'ders'}`,
          yas: gunFark(b.tarih, bugun),
          btn: 'Yoklama al',
          on: () => setDersHedef({ classId: b.classId, tarih: b.tarih, sira: b.sira }),
        });
      }
    }
    if (can.etut) {
      const sinir = ymdYerel(new Date(simdi.getTime() - 14 * 86400000));
      for (const e of benimEtut) {
        if (e.date < sinir || e.date > yerelBugun || !isEtutAttendanceMissing(e, simdi)) continue;
        l.push({
          k: `e|${e.id}`,
          uyari: false,
          baslik: `${e.subject || 'Etüt'} etüdü yoklaması`,
          alt: `${e.date === yerelBugun ? 'Bugün' : gunYazi(e.date)}${e.time ? ` ${e.time}` : ''} · ${ogrSayi(e, students.length)} öğrenci`,
          yas: gunFark(e.date, yerelBugun),
          btn: 'Yoklama al',
          on: () => setEtutHedef(e),
        });
      }
    }
    if (can.odev) {
      for (const h of benimOdev) {
        const g = odevGun(h);
        const d = odevDurum.get(h.id);
        if (!g || !d || g >= yerelBugun || gunFark(g, yerelBugun) > 14 || d.isaretsiz <= 0) continue;
        l.push({
          k: `o|${h.id}`,
          uyari: true,
          baslik: `${h.title} kontrolü`,
          alt: `${d.isaretsiz} öğrenci işaretlenmedi${d.siniflar ? ` · ${d.siniflar}` : ''}`,
          yas: gunFark(g, yerelBugun),
          btn: 'Kontrol et',
          on: () => go('homework', ['homework', h.id, h.title]),
        });
      }
    }
    if (can.mesaj && okunmamis.length) {
      const adlar = Array.from(new Set(okunmamis.map((m) => m.studentName).filter(Boolean)));
      const eski = okunmamis[0];
      l.push({
        k: 'm',
        uyari: true,
        baslik: `${okunmamis.length} cevapsız mesaj`,
        alt: `${adlar.slice(0, 2).join(', ')}${adlar.length > 2 ? ` +${adlar.length - 2}` : ''}`,
        yas: eski?.createdAt ? gunFark(ymdYerel(new Date(eski.createdAt)), yerelBugun) : 0,
        btn: 'Cevapla',
        on: () => go('messages'),
      });
    }
    return l.sort((a, b) => Number(a.uyari) - Number(b.uyari) || b.yas - a.yas);
  }, [can, bekleyen, bugun, bugunTatil, simdiSira, saatOf, benimEtut, simdi, yerelBugun, students.length, benimOdev, odevDurum, okunmamis, go]);
  const [tumIsler, setTumIsler] = useState(false);
  const isKarti = can.ders || can.etut || can.odev || can.mesaj;

  // ================================================================ ŞİMDİ KARTI
  type Kart = {
    cls: '' | 'calm' | 'evening';
    live: boolean;
    eye: string;
    title: string;
    meta: string;
    prog: number | null;
    btn: { yazi: string; on: () => void } | null;
    rem: React.ReactNode;
    periods: boolean;
  };
  const ogrMetin = (classId: string) => (sinifMevcut.get(classId) ? ` · ${sinifMevcut.get(classId)} öğrenci` : '');
  const kart: Kart | null = (() => {
    if (dersHazir) {
      if (bugunTatil) {
        let d = gunEkle(bugun, 1);
        for (let i = 0; i < 30 && (!ayar!.gunler.includes(isoGun(d)) || tatilMap.has(d)); i++) d = gunEkle(d, 1);
        return {
          cls: 'calm',
          live: false,
          eye: 'Bugün tatil',
          title: tatilMap.get(bugun) || 'Tatil',
          meta: 'Ders ve yoklama yok · hatırlatma gönderilmez',
          prog: null,
          btn: can.takvimSayfa ? { yazi: 'Takvim', on: () => go('akademik_takvim') } : { yazi: 'Programım', on: () => go('grades') },
          rem: (
            <>
              Okul <b>{gunYazi(d)}</b> açılıyor
            </>
          ),
          periods: false,
        };
      }
      if (simdikiler.length) {
        const h = simdikiler[0];
        const s = saatOf(h.sira);
        const top = Math.max(1, dakika(s.bit) - dakika(s.bas));
        const sonraki = sonrakiBugun[0];
        const sinifYazi = simdikiler.map((x) => x.classAd).join(', ');
        const vekilim = h.benimVekil;
        return {
          cls: '',
          live: true,
          eye: `Şimdi · ${h.sira}. ders${vekilim ? ' · vekil' : ''}`,
          title: `${sinifYazi} ${h.ders}`,
          meta: `${s.bas} – ${s.bit}${simdikiler.length === 1 ? ogrMetin(h.classId) : ''}${!benimDersim(h) ? ` · vekil: ${h.vekilAd}` : ''}`,
          prog: Math.min(1, Math.max(0, (simdiDk - dakika(s.bas)) / top)),
          btn: benimDersim(h)
            ? { yazi: h.oturum ? 'Düzenle' : 'Yoklama al', on: () => setDersHedef({ classId: h.classId, tarih: h.tarih, sira: h.sira }) }
            : null,
          rem: (
            <>
              <b>{sure(dakika(s.bit) - simdiDk)}</b> kaldı · {sonraki ? `sıradaki ${saatOf(sonraki.sira).bas} ${sonraki.classAd}` : 'bugün son dersiniz'}
            </>
          ),
          periods: true,
        };
      }
      if (sonrakiBugun.length) {
        const h = sonrakiBugun[0];
        const s = saatOf(h.sira);
        const ilk = bugunDersler[0] === h;
        return {
          cls: '',
          live: false,
          eye: `${ilk ? 'İlk dersiniz' : 'Sıradaki'} · ${h.sira}. ders`,
          title: `${h.classAd} ${h.ders}`,
          meta: `${s.bas} – ${s.bit}${ogrMetin(h.classId)}${!benimDersim(h) ? ` · vekil: ${h.vekilAd}` : ''}`,
          prog: null,
          btn: { yazi: 'Programım', on: () => go('grades') },
          rem: (
            <>
              <b>{sure(dakika(s.bas) - simdiDk)}</b> sonra başlıyor
            </>
          ),
          periods: true,
        };
      }
      if (ileriDers || bugunDersler.length) {
        const alinan = bugunDersler.filter((h) => h.oturum).length;
        const yarin = ileriDers?.gun === gunEkle(bugun, 1);
        return {
          cls: bugunDersler.length ? 'evening' : '',
          live: false,
          eye: ileriDers ? (yarin ? `Yarın · ${GUN_ADLARI[isoGun(ileriDers.gun) - 1]}` : `Sıradaki · ${gunYazi(ileriDers.gun)}`) : 'Bugün',
          title: ileriDers ? `İlk dersiniz ${saatOf(ileriDers.ilk.sira).bas}` : 'Dersleriniz bitti',
          meta: ileriDers ? `${ileriDers.ilk.classAd} ${ileriDers.ilk.ders} · ${ileriDers.adet} ders` : 'Bu hafta başka dersiniz yok',
          prog: null,
          btn: { yazi: 'Programım', on: () => go('grades') },
          rem: bugunDersler.length ? (
            <>
              Bugün <b>{`${alinan}/${bugunDersler.length}`}</b> dersin yoklaması alındı
            </>
          ) : (
            'Bugün dersiniz yok'
          ),
          periods: false,
        };
      }
    }
    // ders programı yoksa (ya da programda dersim yoksa): bugünün sıradaki / süren etüdü
    if (can.etut) {
      const e = etutBugun.find((x) => {
        const son = etutEndTime(x);
        return !!son && son.getTime() > simdi.getTime();
      });
      if (!e) return null;
      const bas = etutBas(e);
      const son = etutEndTime(e)!;
      const basladi = !!bas && bas.getTime() <= simdi.getTime();
      const dkKalan = (son.getTime() - simdi.getTime()) / 60000;
      const dkBas = bas ? (bas.getTime() - simdi.getTime()) / 60000 : 0;
      return {
        cls: '',
        live: basladi,
        eye: basladi ? 'Şimdi · etüt' : 'Sıradaki etüt',
        title: `${e.subject || 'Etüt'} etüdü`,
        meta: `${e.time ? `${e.time} – ${hhmm(son)}` : 'Gün içinde'} · ${ogrSayi(e, students.length)} öğrenci${e.location ? ` · ${e.location}` : ''}`,
        prog: basladi && bas ? Math.min(1, (simdi.getTime() - bas.getTime()) / Math.max(1, son.getTime() - bas.getTime())) : null,
        btn: basladi ? { yazi: 'Yoklama al', on: () => setEtutHedef(e) } : { yazi: 'Etütler', on: () => go('etuts') },
        rem: basladi ? (
          <>
            <b>{sure(dkKalan)}</b> kaldı
          </>
        ) : (
          <>
            <b>{sure(dkBas)}</b> sonra başlıyor
          </>
        ),
        periods: false,
      };
    }
    return null;
  })();

  // ================================================================ BUGÜN DERS DIŞINDA
  type Olay = { k: string; saat: string; tur: 'etut' | 'odev' | 'den' | 'akt'; b: string; alt: string; etiket: string; gecti: boolean; on: () => void };
  const disOlay: Olay[] = useMemo(() => {
    const l: Olay[] = [];
    if (can.takvim) {
      for (const g of takvim.filter((x) => gundeMi(x, bugun))) {
        l.push({
          k: `a|${g.key}`,
          saat: '',
          tur: 'akt',
          b: baslik(g.ad),
          alt: siniflarYazi(g.siniflar),
          etiket: 'Takvim',
          gecti: false,
          on: () => etkinlikAc(g),
        });
      }
    }
    if (can.deneme) {
      for (const d of denemeler.filter((x) => x.examDate === bugun)) {
        l.push({ k: `n|${d.id}`, saat: '', tur: 'den', b: d.name, alt: 'Deneme sınavı', etiket: 'Deneme', gecti: false, on: () => go('deneme') });
      }
    }
    for (const e of etutBugun) {
      const son = etutEndTime(e);
      l.push({
        k: `e|${e.id}`,
        saat: e.time || '',
        tur: 'etut',
        b: `${e.subject || 'Etüt'} etüdü`,
        alt: [e.topic, `${ogrSayi(e, students.length)} öğrenci`, e.location].filter(Boolean).join(' · '),
        etiket: 'Etüt',
        gecti: !!son && son.getTime() <= simdi.getTime(),
        on: () => go('etuts'),
      });
    }
    for (const h of benimOdev) {
      if (odevGun(h) !== yerelBugun) continue;
      const d = odevDurum.get(h.id);
      const t = h.dueDate.includes('T') ? h.dueDate.slice(11, 16) : '';
      l.push({
        k: `o|${h.id}`,
        saat: t,
        tur: 'odev',
        b: `${h.title} son gün`,
        alt: [d?.siniflar, d ? `${d.teslimTum}/${d.exp} teslim` : ''].filter(Boolean).join(' · '),
        etiket: 'Ödev',
        gecti: !!t && t <= hhmm(simdi),
        on: () => go('homework', ['homework', h.id, h.title]),
      });
    }
    return l.sort((a, b) => (a.saat || '').localeCompare(b.saat || ''));
  }, [can.takvim, can.deneme, takvim, bugun, denemeler, etutBugun, simdi, students.length, benimOdev, yerelBugun, odevDurum, go, etkinlikAc]);
  const disKarti = can.etut || can.odev || can.deneme || can.takvim;
  const simdiHm = hhmm(simdi);
  const cizgiOnce = disOlay.findIndex((o) => !!o.saat && o.saat > simdiHm);

  // ================================================================ ÖDEVLERİM
  const odevlerim = useMemo(() => {
    const aktif = benimOdev.filter((h) => odevGun(h) >= yerelBugun).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const gecen = benimOdev
      .filter((h) => {
        const g = odevGun(h);
        return g && g < yerelBugun && gunFark(g, yerelBugun) <= 7 && (odevDurum.get(h.id)?.isaretsiz || 0) > 0;
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    let exp = 0;
    let ver = 0;
    for (const h of aktif) {
      exp += odevDurum.get(h.id)?.exp || 0;
      ver += odevDurum.get(h.id)?.teslimTum || 0;
    }
    return { liste: [...aktif, ...gecen].slice(0, 5), aktif: aktif.length, oran: exp ? Math.min(100, Math.round((ver / exp) * 100)) : null };
  }, [benimOdev, yerelBugun, odevDurum]);
  const sonGunYazi = (h: Homework) => {
    const g = odevGun(h);
    const t = h.dueDate.includes('T') ? ` ${h.dueDate.slice(11, 16)}` : '';
    if (g < yerelBugun) return 'son gün geçti';
    if (g === yerelBugun) return `son gün bugün${t}`;
    if (gunFark(yerelBugun, g) === 1) return `son gün yarın${t}`;
    return gunFark(yerelBugun, g) < 7 ? `son gün ${GUN_ADLARI[isoGun(g) - 1].toLocaleLowerCase('tr-TR')}` : `son gün ${tarihUzun(g)}`;
  };

  // ================================================================ BU HAFTA
  type HaftaOlay = { k: string; tur: 'etut' | 'odev' | 'den' | 'akt' | 'tatil'; yazi: string; akt?: AktEtkinlik };
  const haftaGunleri = useMemo(() => {
    const gunler = Array.from({ length: 7 }, (_, i) => gunEkle(pzt, i));
    return gunler.map((g) => {
      const l: HaftaOlay[] = [];
      if (dersHazir && tatilMap.has(g)) l.push({ k: 't', tur: 'tatil', yazi: tatilMap.get(g) || 'Tatil' });
      if (can.takvim) for (const a of takvim.filter((x) => gundeMi(x, g))) l.push({ k: `a|${a.key}`, tur: 'akt', yazi: baslik(a.ad), akt: a });
      if (can.deneme) for (const d of denemeler.filter((x) => x.examDate === g)) l.push({ k: `n|${d.id}`, tur: 'den', yazi: d.name });
      for (const e of benimEtut.filter((x) => x.date === g).sort((a, b) => (a.time || '').localeCompare(b.time || '')))
        l.push({ k: `e|${e.id}`, tur: 'etut', yazi: `${e.time ? `${e.time} ` : ''}${e.subject || 'Etüt'}` });
      for (const h of benimOdev.filter((x) => odevGun(x) === g)) l.push({ k: `o|${h.id}`, tur: 'odev', yazi: `${h.title} son gün` });
      return { g, l, tatil: dersHazir && tatilMap.has(g) };
    });
  }, [pzt, dersHazir, tatilMap, can.takvim, can.deneme, takvim, denemeler, benimEtut, benimOdev]);
  // telefonda hafta şeridi bugünden başlasın
  const haftaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = haftaRef.current;
    const bugunEl = el?.querySelector<HTMLElement>('.today');
    if (el && bugunEl && el.scrollWidth > el.clientWidth) el.scrollLeft = bugunEl.offsetLeft - el.offsetLeft;
  }, [pzt]);
  const haftaParcalar = [can.etut && 'etüt', can.odev && 'ödev', can.deneme && 'deneme', can.takvim && 'takvim'].filter(Boolean) as string[];

  // ================================================================ ÜST BÖLÜM
  const { selam } = akSelam(currentTeacher);
  const ad = givenNamesOf(currentTeacher?.name, '');
  const brans = (currentTeacher?.branch || '').trim();
  const dersSayi = new Set(bugunDersler.map((h) => h.sira)).size;
  const parcalar = [dersSayi ? `${dersSayi} dersiniz` : '', etutBugun.length ? `${etutBugun.length} etüdünüz` : ''].filter(Boolean);
  const lede = (
    <>
      {parcalar.length ? (
        <>
          Bugün{' '}
          {parcalar.map((p, i) => (
            <React.Fragment key={p}>
              {i > 0 && ' ve '}
              <b>{p}</b>
            </React.Fragment>
          ))}{' '}
          var.
        </>
      ) : bugunTatil ? (
        'Bugün okul tatil.'
      ) : dersHazir ? (
        'Bugün dersiniz yok.'
      ) : can.etut ? (
        'Bugün etüdünüz yok.'
      ) : null}
      {isKarti &&
        (isler.length ? (
          <>
            {' '}
            Sizi bekleyen <b>{isler.length} iş</b> aşağıda; yaptıkça kaybolur.
          </>
        ) : (
          ' Bekleyen işiniz yok.'
        ))}
    </>
  );

  const menuIsleri = [
    can.ogrEkle && { k: 'ogr', ikon: UserPlus, yazi: 'Öğrenci ekle', on: () => go('students', ['action', 'student-create', '']) },
    can.ders && { k: 'ders', ikon: CalendarDays, yazi: 'Ders programım', on: () => go('grades') },
    can.soru && { k: 'soru', ikon: HelpCircle, yazi: 'Soru takibi', on: () => go('question_tracking') },
    // Aşama 250: son deneme kısayolu (eski "Yeni gelenler" satırından)
    can.deneme &&
      sonDeneme && {
        k: 'deneme',
        ikon: BarChart3,
        yazi: `Son deneme · ${sonDeneme.examDate ? tarihUzun(sonDeneme.examDate) : sonDeneme.name}`,
        on: () => go('deneme'),
      },
  ].filter(Boolean) as Array<{ k: string; ikon: React.ComponentType<{ 'aria-hidden'?: boolean }>; yazi: string; on: () => void }>;

  // ================================================================ ÖĞRENCİLERDEN (Aşama 250)
  // Eski ana sayfadaki "Teslimler / Sorular / Mesajlar" sekmelerinin karşılığı: son 3 günde öğrencilerden gelenler tek akışta,
  // en yeni üstte. "Yeni" işareti eski ana sayfayla aynı görüldü kaydından (birinde görülen öbüründe de görülmüş sayılır).
  type Akis = { k: string; tur: 'teslim' | 'soru' | 'mesaj'; t: number; ad: string; alt: string; yeni: boolean; ids?: string[]; on: () => void };
  const ogrById = useMemo(() => new Map(students.map((x) => [x.id, x] as const)), [students]);
  const akis = useMemo(() => {
    const l: Akis[] = [];
    const sinir = Date.now() - 3 * 86400000;
    if (can.odev) {
      const hw = new Map(benimOdev.map((h) => [h.id, h] as const));
      for (const x of submissions) {
        if (x.status !== 'on_time' && x.status !== 'late') continue;
        const h = hw.get(x.homeworkId);
        const o = ogrById.get(x.studentId);
        const t = new Date(x.submittedAt || 0).getTime();
        if (!h || !o || t < sinir) continue;
        const id = `${x.id}@${x.submittedAt || ''}`;
        l.push({
          k: 't' + id,
          tur: 'teslim',
          t,
          ad: o.name,
          alt: `${sinifAd.get(o.classId) || ''}${sinifAd.get(o.classId) ? ' · ' : ''}${h.title} teslim etti${x.status === 'late' ? ' (geç)' : ''}`,
          yeni: !gorulenTeslim.has(id),
          on: () => {
            teslimGoruldu([id]);
            go('homework', ['homework', h.id, h.title]);
          },
        });
      }
    }
    // Aşama 251: soru girişleri yalnız ÖDEV VEREN öğretmene ve yalnız KENDİ BRANŞINDA görünür. Öğretmen o öğrenciye
    // kendi branşından ödev verdiyse öğrencinin o dersteki soruları gelir; aynı öğrencinin aynı günkü girişleri tek satırda
    // toplanır ("+40 soru daha çözdü").
    if (can.soru && can.odev) {
      const bransOdev = benimOdev.filter((h) => (brans ? dersUyar(h.subject, brans) : !!h.subject));
      const dersCache = new Map<string, string[]>();
      const ogrDersleri = (o: (typeof students)[number]) => {
        let d = dersCache.get(o.id);
        if (!d) {
          d = Array.from(new Set(bransOdev.filter((h) => dataService.isHomeworkForStudent(h, o)).map((h) => h.subject)));
          dersCache.set(o.id, d);
        }
        return d;
      };
      const gruplar = new Map<string, Array<{ q: StudentQuestionLog; n: number; dersler: string[]; t: number }>>();
      for (const q of soruKayit) {
        const o = ogrById.get(q.studentId);
        const t = new Date(q.createdAt || 0).getTime();
        if (!o || t < sinir) continue;
        const izinli = ogrDersleri(o);
        if (!izinli.length) continue;
        const uyan = (q.entries || []).filter((e) => (e.questionCount || 0) > 0 && izinli.some((d) => dersUyar(e.subject, d)));
        const n = uyan.reduce((x, e) => x + (e.questionCount || 0), 0);
        if (n <= 0) continue;
        const gun = q.date || ymdYerel(new Date(t));
        const key = `${o.id}|${gun}`;
        const g = gruplar.get(key) || [];
        g.push({ q, n, dersler: uyan.map((e) => e.subject), t });
        gruplar.set(key, g);
      }
      for (const [key, g] of gruplar) {
        g.sort((x, y) => x.t - y.t);
        const o = ogrById.get(g[0].q.studentId)!;
        const ids = g.map((x) => x.q.id);
        const daha = g.slice(1).reduce((x, y) => x + y.n, 0);
        const dersler = Array.from(new Set(g.flatMap((x) => x.dersler))).filter(Boolean);
        const sinif = sinifAd.get(o.classId) || '';
        l.push({
          k: 's' + key,
          tur: 'soru',
          t: g[g.length - 1].t,
          ad: o.name,
          alt: `${sinif ? `${sinif} · ` : ''}${dersler.length ? `${dersler.join(', ')} · ` : ''}${g[0].n} soru çözdü${daha > 0 ? ` · +${daha} soru daha çözdü` : ''}`,
          yeni: ids.some((id) => !gorulenSoru.has(id)),
          ids,
          on: () => {
            soruGoruldu(ids);
            go('question_tracking', ['student', o.id, o.name]);
          },
        });
      }
    }
    if (can.mesaj) {
      for (const m of okunmamis) {
        l.push({
          k: 'm' + m.id,
          tur: 'mesaj',
          t: new Date(m.createdAt || 0).getTime(),
          ad: m.studentName || 'Öğrenci',
          alt: `${m.studentClass ? `${m.studentClass} · ` : ''}${(m.subject || m.text || '').replace(/\s+/g, ' ').slice(0, 80)}`,
          yeni: true,
          on: () => go('messages'),
        });
      }
    }
    return l.sort((a, b) => b.t - a.t);
  }, [
    can.odev,
    can.soru,
    can.mesaj,
    benimOdev,
    submissions,
    ogrById,
    sinifAd,
    gorulenTeslim,
    teslimGoruldu,
    soruKayit,
    gorulenSoru,
    soruGoruldu,
    okunmamis,
    go,
    brans,
  ]);
  const akisYeni = akis.filter((a) => a.yeni && a.tur !== 'mesaj').length;
  const [tumAkis, setTumAkis] = useState(false);
  const akisKarti = can.odev || can.soru || can.mesaj;
  const once = (t: number) => {
    const dk = Math.max(0, Math.round((simdi.getTime() - t) / 60000));
    if (dk < 1) return 'şimdi';
    if (dk < 60) return `${dk} dk`;
    if (dk < 24 * 60) return `${Math.floor(dk / 60)} sa`;
    return gunFark(ymdYerel(new Date(t)), yerelBugun) === 1 ? 'dün' : `${gunFark(ymdYerel(new Date(t)), yerelBugun)} gün`;
  };

  const gorunenIsler = tumIsler ? isler : isler.slice(0, 5);

  const katman = (
    <Suspense fallback={null}>
      {dersHedef && <DersYoklamaModal hedef={dersHedef} kurumId={kurumId || null} onClose={() => setDersHedef(null)} onSaved={() => void okuDers()} />}
      {etutHedef && <EtutAttendanceModal isOpen onClose={() => setEtutHedef(null)} etut={etutHedef} allStudents={students} />}
    </Suspense>
  );

  return {
    currentTeacher,
    students,
    classes,
    homeworks,
    submissions,
    etuts,
    messages,
    unreadMessages,
    onNavigateTab,
    onOpenStudentView,
    tick,
    setTick,
    soruKayit,
    setSoruKayit,
    can,
    kurumId,
    go,
    aktSecili,
    setAktSecili,
    etkinlikAc,
    saat,
    setSaat,
    bugun,
    setBugun,
    simdi,
    setSimdi,
    simdiDk,
    pzt,
    paz,
    yerelBugun,
    hafta,
    setHafta,
    gelecek,
    setGelecek,
    bekleyen,
    setBekleyen,
    okuDers,
    ayar,
    dersHazir,
    saatOf,
    tatilMap,
    bugunTatil,
    sinifMevcut,
    siraHucre,
    bugunDersler,
    benimDersim,
    simdikiler,
    simdiSira,
    sonrakiBugun,
    ileriDers,
    durumOf,
    benimEtut,
    etutBugun,
    benimOdev,
    sinifAd,
    odevDurum,
    odevGun,
    okunmamis,
    tKey,
    gorulenSoru,
    soruGoruldu,
    gorulenTeslim,
    teslimGoruldu,
    ogrIds,
    yeniTeslimler,
    sonDeneme,
    setSonDeneme,
    denemeler,
    setDenemeler,
    denemeSurum,
    takvimKayit,
    takvim,
    dersHedef,
    setDersHedef,
    etutHedef,
    setEtutHedef,
    menu,
    setMenu,
    menuRef,
    isler,
    tumIsler,
    setTumIsler,
    isKarti,
    ogrMetin,
    kart,
    disOlay,
    disKarti,
    simdiHm,
    cizgiOnce,
    odevlerim,
    sonGunYazi,
    haftaGunleri,
    haftaRef,
    haftaParcalar,
    selam,
    ad,
    brans,
    dersSayi,
    parcalar,
    lede,
    menuIsleri,
    ogrById,
    akis,
    akisYeni,
    tumAkis,
    setTumAkis,
    akisKarti,
    once,
    gorunenIsler,
    katman,
  };
}

export type OgretmenAnaBaglamDegeri = ReturnType<typeof useOgretmenAnaSayfa>;
export const OgretmenAnaBaglam = createContext<OgretmenAnaBaglamDegeri | null>(null);
export function useOgretmenAnaBaglam(): OgretmenAnaBaglamDegeri {
  const d = useContext(OgretmenAnaBaglam);
  if (!d) throw new Error('OgretmenAnaBaglam sağlayıcısı yok');
  return d;
}
