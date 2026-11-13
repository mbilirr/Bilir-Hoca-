import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Phone, Plus } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { ClassGroup, Etut, Student, TeacherTabType } from '../../types';
import type { Teacher } from '../../types';
import {
  GUN_ADLARI,
  dersCanliDinle,
  gunEkle,
  haftaBasi,
  isoGun,
  rehberlikDersOzet,
  tarihUzun,
  trBugun,
  type RehberlikDersOzet,
} from '../../services/dersService';
import { listResultsLite, sonDenemeler } from '../../services/denemeService';
import { rehberlikPlanOzet, type PlanOzeti } from '../../services/studyPlanService';
import { getEtutStatus } from '../../lib/etutStatus';
import { etutTeacherNames, NO_TEACHER_LABEL } from '../../lib/etutStatus';
import { isEtutAttendanceMissing } from '../../lib/etutTiming';
import { givenNamesOf } from '../../lib/greeting';
import { setQuickFocus } from '../../lib/quickFocus';
import { AnaSayfaKabuk, akBasHarf, akSelam } from './AnaSayfaKabuk';
import './rehberlik.css';

// ============================================================================
// Aşama 249: REHBERLİK ANA SAYFASI (taslak: "rehberlik 2.html" + "Okulun nabzı" v3, Odak renkleri)
// Kimde: Rehberlik rolü (kurum yöneticisi, Müdür, Müdür Yrd. değilse).
// Bölümler: bugünün dört sorusu, Okulun nabzı (sınıf × sinyal ısı haritası; Bu hafta / Geçen hafta), Rehberlik masası
//   (sinyal sayısına göre öğrenciler + seçilen öğrencinin bütün resmi), bugünün etütleri, son deneme, çalışma planları.
// Sinyaller (hepsi sistemdeki kayıtlardan): dev = ders yoklamasında "Gelmedi" (+ devamsızlık sınırı), gec = "Geç",
//   etut = etüt yoklamasında "Gelmedi", den = son iki denemede net en az 3 düştü (son 30 gün), plan = gönderilen
//   plandaki görevlerin %40'ından azı yapıldı (en az 3 görev).
// KURAL (12 Kas, Mustafa): yalnız kurumun AÇIK bölümleri; kapalı bölüm için sorgu bile atılmaz. Veritabanı da denetler
//   (249: rehberlik_ders_ozet Not-Devamsızlık, rehberlik_plan_ozet Ödev bölümü kapalıysa bilgi vermez; deneme RLS).
// Rehberlik yoklamayı DEĞİŞTİRMEZ; yalnız okur (10 Kas kararı).
// Senkron: ders yoklaması canlı; 5 dakikada bir ve sekmeye dönünce sunucudan yeniden okunur; etütler dataService ile.
// ============================================================================

type Go = (tab: TeacherTabType, focus?: Parameters<typeof setQuickFocus>) => void;
type Sig = 'dev' | 'gec' | 'etut' | 'den' | 'plan';

interface Props {
  currentTeacher: Teacher | null;
  students: Student[];
  classes: ClassGroup[];
  etuts: Etut[];
  unreadMessages: number;
  onNavigateTab: (tab: TeacherTabType) => void;
}

const MASA_ILK = 8; // Aşama 268: rehberlik masasında ilk görünen öğrenci sayısı
const SIG_AD: Record<Sig, string> = { dev: 'Devamsızlık', gec: 'Geç gelme', etut: 'Etüt', den: 'Deneme', plan: 'Plan' };
const SIG_SIRA: Sig[] = ['dev', 'gec', 'etut', 'den', 'plan'];
const trSirala = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });
const ymdYerel = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const gunYazi = (t: string) => `${GUN_ADLARI[isoGun(t) - 1]}, ${tarihUzun(t)}`;
const netYazi = (n: number) => (Math.round(n * 10) / 10).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const gunHarf = (t: string) => ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'][isoGun(t) - 1];
const dk = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

type DenemeOzet = Awaited<ReturnType<typeof sonDenemeler>>[number];
interface DenemeDusus {
  examId: string;
  net: number;
  fark: number; // pozitif = düşüş
  dersler: string[];
}

export const RehberlikAnaSayfa: React.FC<Props> = ({ currentTeacher, students, classes, etuts, unreadMessages, onNavigateTab }) => {
  // ---- izinler (bölüm açılıp kapanınca yeniden hesaplanır)
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const can = useMemo(
    () => ({
      ders: dataService.canUseTab('grades'),
      etut: dataService.canUseTab('etuts'),
      deneme: dataService.canUseTab('deneme'),
      plan: dataService.canUseTab('homework'),
      ogr: dataService.canUseTab('students'),
      soru: dataService.canUseTab('question_tracking'),
      etutVer: dataService.canPlanEtut(),
      planVer: dataService.canEditPlans(),
      veliDuyuru: dataService.canUseTab('messages') && dataService.canSendParentAnnouncements(),
      veliTel: dataService.canSeeParentContacts(),
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

  // ---- gün (ders kayıtları Türkiye gününe, etütler cihaz gününe göre; diğer sayfalarla aynı)
  const [bugun, setBugun] = useState(trBugun());
  const [simdi, setSimdi] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => {
      setBugun(trBugun());
      setSimdi(new Date());
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  const yerelBugun = ymdYerel(simdi);
  const pzt = haftaBasi(bugun);
  const donem = useMemo(
    () => [
      { bas: pzt, bit: bugun, ad: 'Bu hafta' },
      { bas: gunEkle(pzt, -7), bit: gunEkle(pzt, -1), ad: 'Geçen hafta' },
    ],
    [pzt, bugun],
  );
  const [per, setPer] = useState<0 | 1>(0);
  const P = donem[per];

  // ---- öğrenci / sınıf
  const ogrMap = useMemo(() => new Map(students.map((s) => [s.id, s] as const)), [students]);
  const sinifAd = useMemo(() => {
    const m = new Map(classes.map((c) => [c.id, c.name] as const));
    return (s: Student) => m.get(s.classId) || s.className || '—';
  }, [classes]);

  // ================================================================ DERS YOKLAMASI (Not-Devamsızlık bölümü açıksa)
  const [ders, setDers] = useState<RehberlikDersOzet | null>(null);
  const [dersHata, setDersHata] = useState('');
  const dersBas = gunEkle(bugun, -20);
  const okuDers = useCallback(async () => {
    try {
      setDers(await rehberlikDersOzet(dersBas, bugun));
      setDersHata('');
    } catch (e: any) {
      setDersHata(e?.message || 'Ders yoklaması okunamadı.');
    }
  }, [dersBas, bugun]);
  useEffect(() => {
    if (!can.ders || !kurumId) {
      setDers(null);
      setDersHata('');
      return;
    }
    void okuDers();
    const yenile = () => document.visibilityState === 'visible' && void okuDers();
    const t = setInterval(yenile, 5 * 60_000);
    document.addEventListener('visibilitychange', yenile);
    const kapat = dersCanliDinle(kurumId, ['ders_yoklama_oturum'], () => void okuDers());
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', yenile);
      kapat();
    };
  }, [can.ders, kurumId, okuDers]);
  const dersBy = useMemo(() => new Map((ders?.ogrenciler || []).map((o) => [o.studentId, o] as const)), [ders]);

  // ================================================================ ÇALIŞMA PLANLARI (Ödev bölümü açıksa)
  const [plan, setPlan] = useState<[PlanOzeti[], PlanOzeti[]] | null>(null);
  const [planHata, setPlanHata] = useState('');
  const okuPlan = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([rehberlikPlanOzet(donem[0].bas, donem[0].bit), rehberlikPlanOzet(donem[1].bas, donem[1].bit)]);
      setPlan([a, b]);
      setPlanHata('');
    } catch (e: any) {
      setPlanHata(e?.message || 'Planlar okunamadı.');
    }
  }, [donem]);
  useEffect(() => {
    if (!can.plan || !kurumId) {
      setPlan(null);
      setPlanHata('');
      return;
    }
    void okuPlan();
    const yenile = () => document.visibilityState === 'visible' && void okuPlan();
    const t = setInterval(yenile, 5 * 60_000);
    document.addEventListener('visibilitychange', yenile);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', yenile);
    };
  }, [can.plan, kurumId, okuPlan]);

  // ================================================================ DENEME (Deneme bölümü açıksa)
  const [denemeler, setDenemeler] = useState<DenemeOzet[]>([]);
  const [netler, setNetler] = useState<Map<string, Array<{ examId: string; tarih: string; net: number; dersler: Record<string, number> }>>>(new Map());
  useEffect(() => {
    if (!can.deneme || !kurumId) {
      setDenemeler([]);
      setNetler(new Map());
      return;
    }
    let iptal = false;
    const oku = async () => {
      try {
        const ex = await sonDenemeler(8);
        const rs = ex.length ? await listResultsLite(ex.map((e) => e.id)) : [];
        if (iptal) return;
        const tarih = new Map(ex.map((e) => [e.id, e.examDate] as const));
        const m = new Map<string, Array<{ examId: string; tarih: string; net: number; dersler: Record<string, number> }>>();
        for (const r of rs) {
          if (r.totalNet === null || !Number.isFinite(r.totalNet)) continue;
          const dersler: Record<string, number> = {};
          for (const [k, v] of Object.entries(r.stats?.subjects || {})) if (Number.isFinite(Number(v?.net))) dersler[k] = Number(v.net);
          const l = m.get(r.studentId) || [];
          l.push({ examId: r.examId, tarih: tarih.get(r.examId) || '', net: r.totalNet, dersler });
          m.set(r.studentId, l);
        }
        for (const l of m.values()) l.sort((a, b) => a.tarih.localeCompare(b.tarih));
        setDenemeler(ex);
        setNetler(m);
      } catch {
        if (!iptal) {
          setDenemeler([]);
          setNetler(new Map());
        }
      }
    };
    void oku();
    const yenile = () => document.visibilityState === 'visible' && void oku();
    document.addEventListener('visibilitychange', yenile);
    return () => {
      iptal = true;
      document.removeEventListener('visibilitychange', yenile);
    };
  }, [can.deneme, kurumId]);
  const dersAdi = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of denemeler) for (const s of e.subjects || []) if (s?.key && !m.has(s.key)) m.set(s.key, s.name);
    return m;
  }, [denemeler]);
  // Dönemin sonunda geçerli düşüş: son iki sonucu arasında en az 3 net düşen ve son denemesi o tarihten en çok 30 gün önce olan
  const dususOf = useCallback(
    (sid: string, bit: string): DenemeDusus | null => {
      const l = (netler.get(sid) || []).filter((x) => x.tarih && x.tarih <= bit);
      if (l.length < 2) return null;
      const son = l[l.length - 1];
      const once = l[l.length - 2];
      if (son.tarih < gunEkle(bit, -30)) return null;
      const fark = once.net - son.net;
      if (fark < 3) return null;
      const dersler = Object.keys(son.dersler)
        .filter((k) => k in once.dersler && once.dersler[k] - son.dersler[k] >= 1)
        .sort((a, b) => once.dersler[b] - son.dersler[b] - (once.dersler[a] - son.dersler[a]))
        .slice(0, 2)
        .map((k) => dersAdi.get(k) || k);
      return { examId: son.examId, net: son.net, fark, dersler };
    },
    [netler, dersAdi],
  );

  // ================================================================ ETÜT (Etütler bölümü açıksa)
  const etutDonem = useCallback(
    (bas: string, bit: string) => (can.etut ? etuts.filter((e) => e.date >= bas && e.date <= bit && !e.privacyRedacted) : []),
    [etuts, can.etut],
  );

  // ================================================================ SİNYALLER (dönem başına öğrenci → sinyal yazısı)
  const sinirKala = useCallback(
    (sid: string): number | null => {
      if (!ders || ders.sinir <= 0) return null;
      const o = dersBy.get(sid);
      if (!o) return null;
      const k = ders.sinir - o.yilGun;
      return k <= ders.kala ? k : null;
    },
    [ders, dersBy],
  );
  const sinyaller = useCallback(
    (bas: string, bit: string, planlar: PlanOzeti[] | null) => {
      const m = new Map<string, Partial<Record<Sig, string>>>();
      const ekle = (sid: string, k: Sig, v: string) => {
        if (!ogrMap.has(sid)) return; // yalnız görebildiği öğrenciler
        const o = m.get(sid) || {};
        o[k] = v;
        m.set(sid, o);
      };
      if (can.ders && ders) {
        for (const o of ders.ogrenciler) {
          let tam = 0;
          let yok = 0;
          let gec = 0;
          for (const g of o.kayit) {
            if (g.tarih < bas || g.tarih > bit) continue;
            if (g.ders > 0 && g.gelmedi >= g.ders) tam++;
            yok += g.gelmedi;
            gec += g.gec;
          }
          if (yok > 0) {
            const k = sinirKala(o.studentId);
            ekle(o.studentId, 'dev', `${tam ? `${tam} gün yok` : `${yok} derse yok`}${k === null ? '' : k <= 0 ? ' · sınır aşıldı' : ` · sınıra ${k}`}`);
          }
          if (gec > 0) ekle(o.studentId, 'gec', `${gec} kez geç`);
        }
      }
      if (can.etut) {
        const say = new Map<string, number>();
        for (const e of etutDonem(bas, bit))
          for (const [sid, a] of Object.entries(e.studentAttendance || {})) if (a?.status === 'absent') say.set(sid, (say.get(sid) || 0) + 1);
        for (const [sid, n] of say) ekle(sid, 'etut', `${n} etüde gelmedi`);
      }
      if (can.deneme)
        for (const sid of netler.keys()) {
          const d = dususOf(sid, bit);
          if (d) ekle(sid, 'den', `Net ${netYazi(d.fark)} düştü`);
        }
      if (can.plan && planlar) {
        for (const p of planlar) if (p.vade >= 3 && p.biten / p.vade < 0.4) ekle(p.studentId, 'plan', `Plan %${Math.round((p.biten / p.vade) * 100)}`);
      }
      return m;
    },
    [can, ders, ogrMap, sinirKala, etutDonem, netler, dususOf],
  );
  const sigler = useMemo(
    () => [sinyaller(donem[0].bas, donem[0].bit, plan?.[0] || null), sinyaller(donem[1].bas, donem[1].bit, plan?.[1] || null)] as const,
    [sinyaller, donem, plan],
  );
  const S = sigler[per];
  const acikSig = useMemo(
    () => SIG_SIRA.filter((k) => (k === 'dev' || k === 'gec' ? can.ders : k === 'etut' ? can.etut : k === 'den' ? can.deneme : can.plan)),
    [can],
  );

  // ================================================================ BUGÜN
  const bugunDers = useMemo(() => {
    let yok = 0;
    let gec = 0;
    let sinira = 0;
    for (const o of ders?.ogrenciler || []) {
      if (!ogrMap.has(o.studentId)) continue;
      const g = o.kayit.find((x) => x.tarih === bugun);
      if (!g) continue;
      if (g.gelmedi > 0) {
        yok++;
        const k = sinirKala(o.studentId);
        if (k !== null) sinira++;
      }
      if (g.gec > 0) gec++;
    }
    return { yok, gec, sinira, alindi: (ders?.gunler || []).includes(bugun) };
  }, [ders, bugun, ogrMap, sinirKala]);
  const etutBugun = useMemo(
    () => (can.etut ? etuts.filter((e) => e.date === yerelBugun).sort((a, b) => (a.time || '').localeCompare(b.time || '')) : []),
    [etuts, can.etut, yerelBugun],
  );
  const etutYoklamaYok = etutBugun.filter((e) => isEtutAttendanceMissing(e, simdi)).length;
  const etutGelmeyen = useMemo(() => {
    const s = new Set<string>();
    for (const e of etutBugun) for (const [sid, a] of Object.entries(e.studentAttendance || {})) if (a?.status === 'absent') s.add(sid);
    return s.size;
  }, [etutBugun]);
  const sonDeneme = denemeler[0] || null;
  const denDusen = useMemo(() => {
    if (!sonDeneme) return [] as Array<{ sid: string; d: DenemeDusus }>;
    const l: Array<{ sid: string; d: DenemeDusus }> = [];
    for (const sid of netler.keys()) {
      if (!ogrMap.has(sid)) continue;
      const d = dususOf(sid, bugun);
      if (d && d.examId === sonDeneme.id) l.push({ sid, d });
    }
    return l.sort((a, b) => b.d.fark - a.d.fark);
  }, [sonDeneme, netler, ogrMap, dususOf, bugun]);

  // ================================================================ SÜZGEÇ + MASA
  const [filt, setFilt] = useState<{ c: string | null; k: Sig | null }>({ c: null, k: null });
  const [sec, setSec] = useState<string | null>(null);
  const [hepsi, setHepsi] = useState(false);
  const masa = useMemo(() => {
    const l = [...S.entries()]
      .map(([sid, sig]) => ({ s: ogrMap.get(sid)!, sig }))
      .filter((x) => x.s)
      .sort((a, b) => {
        const na = Object.keys(a.sig).length;
        const nb = Object.keys(b.sig).length;
        if (na !== nb) return nb - na;
        const pa = SIG_SIRA.findIndex((k) => a.sig[k]);
        const pb = SIG_SIRA.findIndex((k) => b.sig[k]);
        return pa - pb || trSirala(a.s.name, b.s.name);
      });
    return l;
  }, [S, ogrMap]);
  const gorunen = useMemo(() => masa.filter((x) => (!filt.c || sinifAd(x.s) === filt.c) && (!filt.k || x.sig[filt.k])), [masa, filt, sinifAd]);
  const secili = gorunen.find((x) => x.s.id === sec) || gorunen[0] || null;
  // Aşama 268: ana sayfada sabit boy (8 öğrenci; yandaki öğrenci kartıyla aynı boy), gerisi "Tümünü göster"le
  const liste = hepsi ? gorunen : gorunen.slice(0, MASA_ILK);

  // ================================================================ ISI HARİTASI
  const isi = useMemo(() => {
    const satir = new Map<string, Record<Sig, number>>();
    for (const s of students) {
      const c = sinifAd(s);
      if (!satir.has(c)) satir.set(c, { dev: 0, gec: 0, etut: 0, den: 0, plan: 0 });
    }
    for (const [sid, sig] of S) {
      const s = ogrMap.get(sid);
      if (!s) continue;
      const r = satir.get(sinifAd(s));
      if (!r) continue;
      for (const k of Object.keys(sig) as Sig[]) r[k]++;
    }
    const siniflar = [...satir.keys()].sort(trSirala);
    const mx = Math.max(1, ...siniflar.flatMap((c) => acikSig.map((k) => satir.get(c)![k])));
    const top = (c: string) => acikSig.reduce((a, k) => a + satir.get(c)![k], 0);
    const rowMx = Math.max(1, ...siniflar.map(top));
    return { satir, siniflar, mx, top, rowMx, sutun: (k: Sig) => siniflar.reduce((a, c) => a + satir.get(c)![k], 0) };
  }, [S, students, ogrMap, sinifAd, acikSig]);
  const [hover, setHover] = useState<{ c: string; k: Sig; n: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!hover) return;
    const kapat = () => setHover(null);
    window.addEventListener('scroll', kapat, { passive: true });
    return () => window.removeEventListener('scroll', kapat);
  }, [hover]);
  const vurguC = hover?.c ?? filt.c;
  const vurguK = hover?.k ?? filt.k;
  const masaRef = useRef<HTMLElement>(null);
  const focusRef = useRef<HTMLElement>(null);
  const suz = (c: string | null, k: Sig | null) => {
    setFilt({ c, k });
    setHepsi(false);
  };

  // ================================================================ ÖĞRENCİ ODAĞI
  const son10 = useMemo(() => {
    const g = new Set((ders?.gunler || []).filter((t) => t <= bugun));
    if (can.etut) for (const e of etutDonem(dersBas, yerelBugun)) g.add(e.date);
    return [...g].sort().slice(-10);
  }, [ders, bugun, can.etut, etutDonem, dersBas, yerelBugun]);
  const nedenYazi = (sid: string, sig: Partial<Record<Sig, string>>) => {
    const p: string[] = [];
    const o = dersBy.get(sid);
    if (sig.dev && o) {
      let tam = 0;
      let yok = 0;
      for (const g of o.kayit)
        if (g.tarih >= P.bas && g.tarih <= P.bit) {
          if (g.ders > 0 && g.gelmedi >= g.ders) tam++;
          yok += g.gelmedi;
        }
      const k = sinirKala(sid);
      const ilk = `${P.ad.toLocaleLowerCase('tr')} ${tam ? `${tam} gün hiç derse gelmedi` : `${yok} derse gelmedi`}`;
      p.push(ilk.charAt(0).toLocaleUpperCase('tr') + ilk.slice(1));
      if (k !== null) p.push(k <= 0 ? `devamsızlık sınırını aştı (${o.yilGun} gün)` : `devamsızlık sınırına ${k} gün kaldı`);
    }
    if (sig.gec) p.push(sig.gec.replace('kez geç', 'kez geç kaldı'));
    if (sig.etut) p.push(sig.etut);
    if (sig.den) {
      const d = dususOf(sid, P.bit);
      if (d) p.push(`son denemede neti ${netYazi(d.fark)} düştü${d.dersler.length ? ` (${d.dersler.join(', ')})` : ''}`);
    }
    if (sig.plan) {
      const pl = plan?.[per].find((x) => x.studentId === sid);
      if (pl) p.push(`plandaki ${pl.vade} görevden ${pl.biten} tanesini yaptı`);
    }
    if (!p.length) return '';
    const t = p.join('; ');
    return t.charAt(0).toLocaleUpperCase('tr') + t.slice(1) + '.';
  };
  const veliOf = (s: Student) => (s.parents || []).find((v) => (v.phone || '').trim()) || null;

  // ================================================================ ETÜT ŞERİDİ
  const serit = useMemo(() => {
    const satir = new Map<string, Etut[]>();
    let ilk = 8 * 60;
    let son = 18 * 60;
    for (const e of etutBugun) {
      const b = dk(e.time);
      if (b === null) continue;
      ilk = Math.min(ilk, Math.floor(b / 60) * 60);
      son = Math.max(son, Math.ceil((b + (e.duration || 40)) / 60) * 60);
      const ad = etutTeacherNames(e)[0] || NO_TEACHER_LABEL;
      const l = satir.get(ad) || [];
      l.push(e);
      satir.set(ad, l);
    }
    return { satir: [...satir.entries()].sort((a, b) => (dk(a[1][0].time) || 0) - (dk(b[1][0].time) || 0)), ilk, son };
  }, [etutBugun]);
  const pos = (n: number) => ((n - serit.ilk) / (serit.son - serit.ilk)) * 100;
  const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();

  // ================================================================ PLAN KARTI
  const planBu = plan?.[0] || null;
  const planToplam = useMemo(() => {
    if (!planBu) return null;
    let vade = 0;
    let biten = 0;
    for (const p of planBu)
      if (ogrMap.has(p.studentId)) {
        vade += p.vade;
        biten += p.biten;
      }
    const kapsar = new Set(planBu.filter((p) => p.kapsar).map((p) => p.studentId));
    const eksik = new Map<string, number>();
    for (const s of students) if (!kapsar.has(s.id)) eksik.set(sinifAd(s), (eksik.get(sinifAd(s)) || 0) + 1);
    const eksikSay = [...eksik.values()].reduce((a, b) => a + b, 0);
    const eksikYazi = [...eksik.entries()]
      .sort((a, b) => b[1] - a[1] || trSirala(a[0], b[0]))
      .slice(0, 2)
      .map(([c, n]) => `${c} ${n} öğrenci`)
      .join(', ');
    const dusuk = planBu
      .filter((p) => ogrMap.has(p.studentId) && p.vade >= 3 && p.biten / p.vade < 0.4)
      .sort((a, b) => a.biten / a.vade - b.biten / b.vade)
      .slice(0, 3);
    return { vade, biten, oran: vade ? Math.round((biten / vade) * 100) : null, eksikSay, eksikYazi, dusuk };
  }, [planBu, ogrMap, students, sinifAd]);

  // ================================================================ GÖRÜNÜM
  const { selam } = akSelam(currentTeacher);
  const ad = givenNamesOf(currentTeacher?.name, '');
  const lede = (() => {
    const p: React.ReactNode[] = [];
    if (can.ders && ders && bugunDers.alindi)
      p.push(
        <React.Fragment key="d">
          Okulda bugün <b>{bugunDers.yok} öğrenci</b> derse gelmedi, <b>{bugunDers.gec} öğrenci</b> geç kaldı.{' '}
        </React.Fragment>,
      );
    else if (can.ders && ders) p.push(<React.Fragment key="d">Bugün henüz ders yoklaması alınmadı. </React.Fragment>);
    p.push(
      masa.length ? (
        <React.Fragment key="m">
          Masanızda bu hafta ilgilenmeniz gereken <b>{masa.length} öğrenci</b> var; en çok sinyali olan üstte.
        </React.Fragment>
      ) : (
        <React.Fragment key="m">Bu hafta masanızda bekleyen öğrenci yok.</React.Fragment>
      ),
    );
    return p;
  })();

  type Soru = { k: Sig; ad: string; v: number; d: string; renk: string };
  const sorular: Soru[] = [];
  if (can.ders && ders) {
    sorular.push({
      k: 'dev',
      ad: 'Bugün derse gelmeyen',
      v: bugunDers.yok,
      d: !bugunDers.alindi
        ? 'yoklama henüz alınmadı'
        : bugunDers.sinira
          ? `${bugunDers.sinira}'${bugunDers.sinira === 1 ? 'i' : 'si'} sınıra yakın`
          : 'ders yoklamasından',
      renk: 'var(--danger)',
    });
    sorular.push({ k: 'gec', ad: 'Geç gelen', v: bugunDers.gec, d: bugunDers.alindi ? 'bugünkü derslere' : 'yoklama henüz alınmadı', renk: 'var(--warning)' });
  }
  if (can.etut)
    sorular.push({
      k: 'etut',
      ad: 'Etüt yoklaması yok',
      v: etutYoklamaYok,
      d: etutBugun.length ? `${etutBugun.length} etütten${etutGelmeyen ? ` · ${etutGelmeyen} öğrenci gelmedi` : ''}` : 'bugün etüt yok',
      renk: 'var(--muted)',
    });
  if (can.deneme)
    sorular.push({
      k: 'den',
      ad: 'Denemede düşen',
      v: denDusen.length,
      d: sonDeneme ? `${sonDeneme.name} · ${tarihUzun(sonDeneme.examDate)}` : 'sonuçlu deneme yok',
      renk: 'var(--brand)',
    });

  const sigRenk: Record<Sig, string> = { dev: 'var(--danger)', gec: 'var(--warning)', etut: 'var(--muted)', den: 'var(--brand)', plan: 'var(--success)' };

  const spark = (a: number[]) => {
    if (a.length < 2) return null;
    const mn = Math.min(...a) - 2;
    const mx = Math.max(...a) + 2;
    const w = 200;
    const h = 36;
    const p = a.map((v, i) => [i * (w / (a.length - 1)), h - 4 - ((v - mn) / (mx - mn)) * (h - 8)]);
    const d = p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const c = a[a.length - 1] < a[a.length - 2] ? 'var(--danger)' : 'var(--brand)';
    const l = p[p.length - 1];
    return (
      <svg className="rh-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${d} L${w} ${h} L0 ${h}Z`} fill={c} opacity=".1" />
        <path d={d} fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={l[0]} cy={l[1]} r="3.5" fill={c} />
      </svg>
    );
  };

  const odak = (() => {
    if (!secili) return null;
    const { s, sig } = secili;
    const sigN = Object.keys(sig).length;
    const o = dersBy.get(s.id);
    const net = (netler.get(s.id) || []).slice(-6);
    const pl = plan?.[0]?.find((x) => x.studentId === s.id) || null;
    const veli = can.veliTel ? veliOf(s) : null;
    const neden = nedenYazi(s.id, sig);
    const etutGun = (t: string) => {
      let d: 'a' | 'e' | 'p' | 'x' = 'x';
      for (const e of etuts) {
        if (e.date !== t || e.privacyRedacted) continue;
        const a = e.studentAttendance?.[s.id];
        if (!a) continue;
        if (a.status === 'absent') return 'a';
        if (a.status === 'excused') d = 'e';
        else if (d === 'x') d = 'p';
      }
      return d;
    };
    const eylem = [
      can.etutVer && { k: 'e', yazi: 'Etüt ver', on: () => go('etuts', ['action', 'etut-create-ogrenci', s.id]) },
      can.planVer && { k: 'p', yazi: 'Plan hazırla', on: () => go('homework', ['action', 'plan-ogrenci', s.id]) },
      can.ogr && { k: 'o', yazi: 'Öğrenci kartı', on: () => go('students', ['student', s.id, s.name]) },
      can.soru && { k: 's', yazi: 'Soru takibi', on: () => go('question_tracking', ['student', s.id, s.name]) },
    ].filter(Boolean) as Array<{ k: string; yazi: string; on: () => void }>;
    return (
      <div className="rh-fanim" key={s.id}>
        <div className="rh-fhead">
          <span className="rh-av lg">{akBasHarf(s.name)}</span>
          <div>
            <h3>{s.name}</h3>
            <p>
              {sinifAd(s)} · {sigN} sinyal · {P.ad.toLocaleLowerCase('tr')}
            </p>
          </div>
        </div>
        <div className="rh-fbody">
          {neden && (
            <div className="rh-why">
              <b>Neden burada?</b> {neden}
            </div>
          )}
          {(can.ders || can.etut) && son10.length > 0 && (
            <div className="rh-fsec">
              <h5>
                Son {son10.length} okul günü <span>bugün en sağda</span>
              </h5>
              <div className="rh-strip" style={{ gridTemplateColumns: `calc(2.75 * var(--ak-rem)) repeat(${son10.length}, minmax(0, 1fr))` }}>
                {can.ders && (
                  <>
                    <span className="lab">Ders</span>
                    {son10.map((t) => {
                      const g = o?.kayit.find((x) => x.tarih === t);
                      const c = !o ? 'x' : !g || g.ders === 0 ? 'x' : g.gelmedi >= g.ders ? 'a' : g.gelmedi > 0 || g.gec > 0 ? 'l' : 'p';
                      const yazi = !o
                        ? 'kayıtta devamsızlık yok'
                        : !g
                          ? 'yoklama yok'
                          : g.gelmedi >= g.ders
                            ? 'gelmedi'
                            : g.gelmedi || g.gec
                              ? `${g.gelmedi ? `${g.gelmedi} derse gelmedi` : ''}${g.gelmedi && g.gec ? ', ' : ''}${g.gec ? `${g.gec} derse geç` : ''}`
                              : 'geldi';
                      return <i key={t} className={c} title={`${gunYazi(t)}: ${yazi}`} />;
                    })}
                  </>
                )}
                {can.etut && (
                  <>
                    <span className="lab">Etüt</span>
                    {son10.map((t) => {
                      const c = etutGun(t);
                      return <i key={t} className={c} title={`${gunYazi(t)}: ${{ a: 'etüde gelmedi', e: 'izinli', p: 'etüde geldi', x: 'etüdü yok' }[c]}`} />;
                    })}
                  </>
                )}
                <span />
                {son10.map((t) => (
                  <span key={t} className="dg">
                    {gunHarf(t)}
                  </span>
                ))}
              </div>
              {can.ders && !o && <p className="rh-fnote">Son üç haftada ders devamsızlığı ya da geç kalması yok.</p>}
            </div>
          )}
          {(can.deneme || can.plan) && (
            <div className={`rh-frow${can.deneme && can.plan ? '' : ' n1'}`}>
              {can.deneme && (
                <div className="rh-mini">
                  <div className="k">Deneme neti</div>
                  {net.length ? (
                    <>
                      <div className="v tnum">{netYazi(net[net.length - 1].net)}</div>
                      {spark(net.map((x) => x.net))}
                    </>
                  ) : (
                    <div className="v nil">Deneme yok</div>
                  )}
                </div>
              )}
              {can.plan && (
                <div className="rh-mini">
                  <div className="k">Bu hafta plan</div>
                  {pl && pl.vade > 0 ? (
                    <>
                      <div className="v tnum">%{Math.round((pl.biten / pl.vade) * 100)}</div>
                      <div className="k">
                        {pl.vade} görevden {pl.biten}'i yapıldı
                      </div>
                      <div className="rh-meter" aria-hidden="true">
                        <i className={pl.biten / pl.vade < 0.3 ? 'bad' : ''} style={{ width: `${Math.round((pl.biten / pl.vade) * 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <div className="v nil">{pl?.kapsar ? 'Görev günü gelmedi' : 'Plan yok'}</div>
                  )}
                </div>
              )}
            </div>
          )}
          {veli && (
            <div className="rh-veli">
              <span className="rh-av">{akBasHarf(veli.name || veli.relation || 'Veli')}</span>
              <div>
                <b>{veli.name || 'Veli'}</b>
                {veli.relation ? `${veli.relation} · ` : ''}
                <span className="tnum">{veli.phone}</span>
              </div>
              <a className="ak-btn w-24 primary" href={`tel:${(veli.phone || '').replace(/[^\d+]/g, '')}`}>
                <Phone aria-hidden="true" />
                Ara
              </a>
            </div>
          )}
          {eylem.length > 0 && (
            <div className="rh-acts">
              {eylem.map((e) => (
                <button key={e.k} type="button" className="ak-btn" onClick={e.on}>
                  {e.yazi}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  })();

  const katman = hover
    ? createPortal(
        <div className="rh-htip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          <b>
            {hover.c} · {SIG_AD[hover.k]}
          </b>
          <span>{hover.n} öğrenci · dokunun, masa süzülsün</span>
        </div>,
        document.body,
      )
    : null;

  const hataYazi = [dersHata, planHata].filter(Boolean);

  return (
    <AnaSayfaKabuk currentTeacher={currentTeacher} unreadMessages={unreadMessages} onNavigate={onNavigateTab} tema="odak" sinif="ak-rhb" overlay={katman}>
      {/* ===== Karşılama ===== */}
      <div className="od-hero">
        <div>
          <div className="od-eyebrow">{gunYazi(bugun)} · Rehberlik servisi</div>
          <h1>
            {selam} {ad && <em>{ad}</em>} Öğretmenim
          </h1>
          <p className="od-lede">{lede}</p>
        </div>
        <div className="rh-hacts">
          {can.etutVer && (
            <button type="button" className="ak-btn w-24 primary" onClick={() => go('etuts', ['action', 'etut-create', ''])}>
              <Plus aria-hidden="true" />
              Etüt
            </button>
          )}
          {can.planVer && (
            <button type="button" className="ak-btn w-24" onClick={() => go('homework', ['action', 'plan', ''])}>
              <Plus aria-hidden="true" />
              Plan
            </button>
          )}
          {can.veliDuyuru && (
            <button type="button" className="ak-btn w-32" onClick={() => go('messages', ['action', 'veli-duyurusu', ''])}>
              Veli duyurusu
            </button>
          )}
        </div>
      </div>

      {hataYazi.map((h) => (
        <p key={h} className="od-err" role="alert">
          {h}
        </p>
      ))}

      {/* ===== Bugünün soruları: dokununca masa süzülür ===== */}
      {sorular.length > 0 && (
        <section aria-label="Bugünün özeti" className={`rh-qs n${sorular.length}`}>
          {sorular.map((q) => {
            const on = !filt.c && filt.k === q.k;
            return (
              <button key={q.k} type="button" className="rh-q" aria-pressed={on} onClick={() => suz(null, on ? null : q.k)}>
                <span className="bar" style={{ background: q.renk }} />
                <span className="k">{q.ad}</span>
                <span className="v tnum">{q.v}</span>
                <span className="d">{q.d}</span>
              </button>
            );
          })}
        </section>
      )}

      {/* ===== Okulun nabzı ===== */}
      {acikSig.length > 0 && isi.siniflar.length > 0 && (
        <section className="od-card rh-pulse" aria-labelledby="rh-h-heat">
          <div className="rh-sec-h">
            <div>
              <h2 id="rh-h-heat">Okulun nabzı</h2>
              <p>Sınıf başına kaç öğrencide sinyal var. Koyu kare yoğunluğun arttığı yer; dokunun, aşağıdaki masa o sınıfa süzülsün.</p>
            </div>
            <div className="rh-ph-r">
              <div className="od-pillseg" role="group" aria-label="Dönem">
                {donem.map((d, i) => (
                  <button key={d.ad} type="button" aria-pressed={per === i} onClick={() => setPer(i as 0 | 1)}>
                    {d.ad}
                  </button>
                ))}
              </div>
              {can.ders && (
                <button type="button" className="od-link" onClick={() => go('grades')}>
                  Devamsızlık <ArrowRight aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div className="rh-heat-scroll">
            <div
              className={`rh-heat${vurguC || vurguK ? ' dim' : ''}`}
              style={{ ['--cols' as any]: acikSig.length }}
              role="group"
              aria-label="Sınıf ve sinyale göre öğrenci sayısı"
              onPointerLeave={() => setHover(null)}
            >
              <div className="corner" />
              {acikSig.map((k) => (
                <div key={k} className={`ch${vurguK === k ? ' on' : ''}`} style={{ ['--sig' as any]: sigRenk[k] }}>
                  <b className="tnum">{isi.sutun(k)}</b>
                  <span>{SIG_AD[k]}</span>
                </div>
              ))}
              <div className="ch tot">
                <b className="tnum">{acikSig.reduce((a, k) => a + isi.sutun(k), 0)}</b>
                <span>Sınıf toplamı</span>
              </div>
              <div className="gap" />
              {isi.siniflar.map((c) => {
                const r = isi.satir.get(c)!;
                const t = isi.top(c);
                return (
                  <React.Fragment key={c}>
                    <div className={`rh${vurguC === c ? ' on' : ''}`}>{c}</div>
                    {acikSig.map((k) => {
                      const n = r[k];
                      const d = n ? Math.round(14 + (n / isi.mx) * 86) : 0;
                      const x = !(vurguC || vurguK) || vurguC === c || vurguK === k;
                      const secik = filt.c === c && filt.k === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          className={`hc${n ? '' : ' z'}${d >= 58 ? ' hot' : ''}${x ? ' x' : ''}`}
                          style={{ ['--d' as any]: `${d}%` }}
                          tabIndex={n ? 0 : -1}
                          disabled={!n}
                          aria-pressed={secik}
                          aria-label={`${c} ${SIG_AD[k]}: ${n} öğrenci`}
                          onPointerEnter={(e) => {
                            if (!n || e.pointerType === 'touch') return;
                            const b = e.currentTarget.getBoundingClientRect();
                            setHover({ c, k, n, x: Math.min(b.left, window.innerWidth - 256), y: b.bottom + 8 });
                          }}
                          onClick={() => {
                            setHover(null);
                            if (secik) suz(null, null);
                            else {
                              suz(c, k);
                              masaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }}
                        >
                          {n || '·'}
                        </button>
                      );
                    })}
                    <div className="rt">
                      <i style={{ ['--w' as any]: `${Math.round((t / isi.rowMx) * 100)}%` }} />
                      <b className="tnum">{t}</b>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          <div className="rh-heat-note">
            <span>Az</span>
            <span className="scale" aria-hidden="true">
              {[0, 22, 44, 68, 100].map((d) => (
                <i key={d} style={{ background: `color-mix(in srgb, var(--heat) ${d}%, var(--surface-2))` }} />
              ))}
            </span>
            <span>Çok</span>
            <span className="hint">
              {can.ders && can.etut
                ? 'Ders ve etüt yoklaması ayrı sütunlarda, karışmaz.'
                : `${P.bas === P.bit ? tarihUzun(P.bas) : `${tarihUzun(P.bas)} – ${tarihUzun(P.bit)}`}`}
            </span>
          </div>
        </section>
      )}

      {/* ===== Rehberlik masası ===== */}
      {acikSig.length > 0 && (
        <section aria-labelledby="rh-h-desk" ref={masaRef} className="rh-deskwrap">
          <div className="rh-sec-h">
            <div>
              <h2 id="rh-h-desk">Rehberlik masası</h2>
              <p>Sinyal sayısına göre sıralı ({P.ad.toLocaleLowerCase('tr')}). Bir öğrenci seçin; yanda bütün resmi ve yapabilecekleriniz açılsın.</p>
            </div>
          </div>
          <div className={`rh-desk${secili ? '' : ' tek'}${hepsi ? ' acik' : ''}`}>
            <div className="od-card rh-list">
              <div className="rh-list-h">
                <b>{filt.c || filt.k ? `${gorunen.length} öğrenci` : 'Tüm öğrenciler'}</b>
                {(filt.c || filt.k) && (
                  <span className="rh-pill">
                    <span>{[filt.c, filt.k && SIG_AD[filt.k]].filter(Boolean).join(' · ')}</span>
                    <button type="button" aria-label="Süzgeci kaldır" onClick={() => suz(null, null)}>
                      ×
                    </button>
                  </span>
                )}
              </div>
              {gorunen.length ? (
                <ul
                  className="rh-sl"
                  role="listbox"
                  aria-label="Öğrenciler"
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                    e.preventDefault();
                    const i = liste.findIndex((x) => x.s.id === secili?.s.id);
                    const n = liste[Math.max(0, Math.min(liste.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
                    if (!n) return;
                    setSec(n.s.id);
                    setTimeout(() => (document.querySelector(`[data-rh-ogr="${n.s.id}"]`) as HTMLElement | null)?.focus(), 0);
                  }}
                >
                  {liste.map(({ s, sig }) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="option"
                        data-rh-ogr={s.id}
                        aria-selected={secili?.s.id === s.id}
                        onClick={() => {
                          setSec(s.id);
                          if (window.innerWidth < 980) setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                        }}
                      >
                        <span className="rh-av">{akBasHarf(s.name)}</span>
                        <span className="w">
                          <b>
                            {s.name} <small>· {sinifAd(s)}</small>
                          </b>
                          <span>
                            {SIG_SIRA.filter((k) => sig[k]).map((k) => (
                              <span key={k} className={`rh-chip c-${k}`}>
                                {sig[k]}
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className="rh-dots" aria-hidden="true">
                          {acikSig.map((k) => (
                            <i key={k} style={sig[k] ? { background: sigRenk[k] } : undefined} />
                          ))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rh-empty">{filt.c || filt.k ? 'Bu süzgeçte öğrenci yok. Güzel haber.' : `${P.ad} masada öğrenci yok. Güzel haber.`}</div>
              )}
              {gorunen.length > MASA_ILK && (
                <button type="button" className="rh-more" onClick={() => setHepsi((h) => !h)}>
                  {hepsi ? 'Daha az göster' : `Tümünü göster (${gorunen.length})`}
                </button>
              )}
            </div>
            {secili && (
              <aside className="od-card rh-focus" aria-live="polite" ref={focusRef}>
                {odak}
              </aside>
            )}
          </div>
        </section>
      )}

      {/* ===== Bugünün etütleri ===== */}
      {can.etut && (
        <section className="od-card rh-gcard" aria-labelledby="rh-h-gantt">
          <div className="rh-sec-h">
            <div>
              <h2 id="rh-h-gantt">Bugünün etütleri</h2>
              <p>Okulun etütleri öğretmen öğretmen · kırmızı çizgi şu an. Yoklamaları görürsünüz, değiştiremezsiniz.</p>
            </div>
            <button type="button" className="od-link" onClick={() => go('etuts')}>
              Etütler <ArrowRight aria-hidden="true" />
            </button>
          </div>
          {serit.satir.length ? (
            <>
              <div className="rh-gantt">
                <div className="rh-g">
                  <div />
                  <div className="axis">
                    {Array.from({ length: Math.floor((serit.son - serit.ilk) / 120) + 1 }, (_, i) => serit.ilk + i * 120).map((t) => (
                      <span key={t} style={{ left: `${pos(t)}%` }}>
                        {hhmm(t)}
                      </span>
                    ))}
                  </div>
                  {serit.satir.map(([ogrt, l]) => (
                    <React.Fragment key={ogrt}>
                      <div className="who" title={ogrt}>
                        {ogrt}
                      </div>
                      <div className="lane">
                        {l.map((e) => {
                          const b = dk(e.time);
                          if (b === null) return null;
                          const st = getEtutStatus(e, simdi);
                          const benim = dataService.isMyEtut(e);
                          const cls = st === 'past' ? 'miss' : st === 'done' ? 'ok' : benim ? 'mine' : st === 'live' ? 'live' : 'later';
                          const gelmeyen = Object.values(e.studentAttendance || {}).filter((a) => a?.status === 'absent').length;
                          const say = e.assignedStudentIds === 'all' ? students.length : e.assignedStudentIds.length;
                          const yazi = `${e.subject || 'Etüt'}${st === 'past' ? ' · yoklama yok' : st === 'done' ? (gelmeyen ? ` · ${gelmeyen} gelmedi` : ' · tam') : ` · ${say} öğrenci`}`;
                          return (
                            <button
                              key={e.id}
                              type="button"
                              className={`blk ${cls}`}
                              style={{ left: `${pos(b)}%`, width: `${Math.max(2, pos(b + (e.duration || 40)) - pos(b))}%` }}
                              title={`${e.time}–${hhmm(b + (e.duration || 40))} · ${yazi}`}
                              onClick={() => go('etuts')}
                            >
                              {yazi}
                            </button>
                          );
                        })}
                        {simdiDk >= serit.ilk && simdiDk <= serit.son && <i className="nowbar" style={{ left: `${pos(simdiDk)}%` }} />}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="rh-legend">
                <span>
                  <i className="ok" />
                  Yoklama alındı
                </span>
                <span>
                  <i className="miss" />
                  Bitti, yoklama yok
                </span>
                <span>
                  <i className="live" />
                  Sürüyor
                </span>
                <span>
                  <i className="later" />
                  Sonra
                </span>
                <span>
                  <i className="mine" />
                  Sizin etüdünüz
                </span>
              </div>
            </>
          ) : (
            <div className="od-empty">
              <i>✓</i>Bugün okulda etüt yok.
            </div>
          )}
        </section>
      )}

      {/* ===== Son deneme + çalışma planları ===== */}
      {(can.deneme || can.plan) && (
        <div className={can.deneme && can.plan ? 'od-grid2' : ''}>
          {can.deneme && (
            <section className="od-card rh-pad" aria-labelledby="rh-h-den">
              <div className="rh-sec-h">
                <div>
                  <h2 id="rh-h-den">Son deneme</h2>
                  <p>
                    {sonDeneme
                      ? `${sonDeneme.name} · ${tarihUzun(sonDeneme.examDate)}${sonDeneme.grade ? ` · ${sonDeneme.grade}. sınıflar` : ''} · ortalama net`
                      : 'Sonuçlu deneme yok'}
                  </p>
                </div>
                <button type="button" className="od-link" onClick={() => go('deneme')}>
                  Deneme analizi <ArrowRight aria-hidden="true" />
                </button>
              </div>
              {sonDeneme && (
                <>
                  {(() => {
                    const ayni = denemeler
                      .filter((e) => e.grade === sonDeneme.grade && e.avgTotalNet !== null)
                      .slice(0, 6)
                      .reverse();
                    // farkı görünür kılmak için en düşük ortalamadan ölçeklenir (en düşük %25, en yüksek %100)
                    const mx = Math.max(...ayni.map((e) => e.avgTotalNet || 0));
                    const mn = Math.min(...ayni.map((e) => e.avgTotalNet || 0));
                    const boy = (v: number) => (mx > mn ? 25 + ((v - mn) / (mx - mn)) * 75 : 70);
                    return (
                      <div className="rh-exam">
                        <b className="tnum">{sonDeneme.avgTotalNet === null ? '—' : netYazi(sonDeneme.avgTotalNet)}</b>
                        {ayni.length > 1 && (
                          <div className="rh-bars" aria-label={`Son ${ayni.length} denemenin ortalaması`}>
                            {ayni.map((e, i) => (
                              <i
                                key={e.id}
                                className={e.id === sonDeneme.id ? 'cur' : ''}
                                title={`${e.name}: ${netYazi(e.avgTotalNet || 0)}`}
                                style={{ height: `${Math.round(boy(e.avgTotalNet || 0))}%`, animationDelay: `${i * 0.05}s` }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {denDusen.length ? (
                    <ul className="od-rows">
                      {denDusen.slice(0, 3).map(({ sid, d }) => {
                        const s = ogrMap.get(sid)!;
                        return (
                          <li key={sid}>
                            <span className="od-av">{akBasHarf(s.name)}</span>
                            <span className="who">
                              <b>{s.name}</b>
                              <span>
                                {sinifAd(s)} · net {netYazi(d.fark)} düştü{d.dersler.length ? ` · ${d.dersler.join(', ')}` : ''}
                              </span>
                            </span>
                            {can.etutVer && (
                              <button type="button" className="ak-btn w-24" onClick={() => go('etuts', ['action', 'etut-create-ogrenci', sid])}>
                                Etüt ver
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="od-empty">
                      <i>✓</i>Bu denemede neti belirgin düşen öğrenci yok.
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {can.plan && (
            <section className="od-card rh-pad" aria-labelledby="rh-h-plan">
              <div className="rh-sec-h">
                <div>
                  <h2 id="rh-h-plan">Çalışma planları</h2>
                  <p>Bu hafta · gönderilen planlardaki görevlerin tamamlanması</p>
                </div>
                <button type="button" className="od-link" onClick={() => go('homework', ['action', 'plan', ''])}>
                  Haftalık planlar <ArrowRight aria-hidden="true" />
                </button>
              </div>
              {planToplam ? (
                <>
                  <div className="rh-pbig">
                    <b className="tnum">{planToplam.oran === null ? '—' : `%${planToplam.oran}`}</b>
                    <span>{planToplam.vade ? `${planToplam.vade} görevden ${planToplam.biten}'i yapıldı` : 'Bu hafta günü gelen görev yok'}</span>
                  </div>
                  <div className="rh-meter wide" aria-hidden="true">
                    <i style={{ width: `${planToplam.oran || 0}%` }} />
                  </div>
                  <ul className="od-rows rh-prow">
                    {planToplam.eksikSay > 0 && (
                      <li>
                        <span className="od-av warn tnum">{planToplam.eksikSay}</span>
                        <span className="who">
                          <b>Bu hafta planı olmayan</b>
                          <span>{planToplam.eksikYazi}</span>
                        </span>
                        {can.planVer && (
                          <button type="button" className="ak-btn w-24 primary" onClick={() => go('homework', ['action', 'plan', ''])}>
                            Plan
                          </button>
                        )}
                      </li>
                    )}
                    {planToplam.dusuk.map((p) => {
                      const s = ogrMap.get(p.studentId)!;
                      const o = Math.round((p.biten / p.vade) * 100);
                      return (
                        <li key={p.studentId}>
                          <span className="od-av">{akBasHarf(s.name)}</span>
                          <span className="who">
                            <b>{s.name}</b>
                            <span>
                              {sinifAd(s)} · {p.vade} görevden {p.biten}'i yapıldı
                            </span>
                          </span>
                          <span className="rh-tag">%{o}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                !planHata && <p className="od-sub">Yükleniyor…</p>
              )}
            </section>
          )}
        </div>
      )}
    </AnaSayfaKabuk>
  );
};
