import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, Plus, Send } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { ClassGroup, Student, Teacher, TeacherTabType } from '../../types';
import { GUN_ADLARI, isoGun, tarihUzun, trBugun } from '../../services/dersService';
import { getExam, isDraftExam, listExams, listResultsLite, listStudentTcHashes, type DenemeExam } from '../../services/denemeService';
import { gradeOf } from '../../lib/teacherGrades';
import { setQuickFocus } from '../../lib/quickFocus';
import { AkSheet, AnaSayfaKabuk, akSelam } from './AnaSayfaKabuk';
import './kalanAnaSayfa.css';

// ============================================================================
// Aşama 253: ÖLÇME VE DEĞERLENDİRME ANA SAYFASI (taslak: kalan-roller.html › Ölçme, Odak renkleri)
// Kimde: Ölçme Değerlendirme rolü (kurum yöneticisi, Müdür, Müdür Yrd., Rehberlik değilse).
// Bölümler: son deneme (koyu kart: ortalama net / puan / katılım, sınıflara ve derslere göre), sizi bekleyenler
//   (yarım kalan deneme, öğrencilere kapalı sonuç, kazanımla eşleşmeyen soru, TC eksik öğrenci), net değişimi
//   (önceki aynı kademe denemesine göre özet), son denemeler, kazanım durumu (ders × başarı bandı matrisi).
// KURAL (13 Kas, Mustafa): zamanla büyüyen öğrenci listeleri ana sayfada liste değil; özet + "Listeyi aç" (sağdan açılır).
// KURAL (12 Kas): yalnız kurumun AÇIK bölümleri; Deneme bölümü kapalıysa deneme sorgusu hiç atılmaz.
// Veri: denemelerin kayıtlı özeti (summary) + son denemenin soruları + son iki denemenin hafif sonuçları (cevaplar gelmez).
// ============================================================================

type Go = (tab: TeacherTabType, focus?: Parameters<typeof setQuickFocus>) => void;

interface Props {
  currentTeacher: Teacher | null;
  students: Student[];
  classes: ClassGroup[];
  unreadMessages: number;
  onNavigateTab: (tab: TeacherTabType) => void;
}

const n1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const isaretli = (n: number, f = n1) => (n > 0 ? `+${f(n)}` : n < 0 ? `−${f(Math.abs(n))}` : f(0));
const gunYazi = (t: string) => `${GUN_ADLARI[isoGun(t) - 1]}, ${tarihUzun(t)}`;
const kisaTarih = (t: string) => (t ? new Date(t + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '');
const kademe = (e: Pick<DenemeExam, 'grade'>) => {
  const n = parseInt(String(e.grade), 10);
  return Number.isNaN(n) ? String(e.grade || '').trim() : `${n}. sınıf`;
};
const ayniTur = (a: DenemeExam, b: DenemeExam) => String(a.grade) === String(b.grade) && (a.examType || '') === (b.examType || '');
const sonuclu = (e: DenemeExam) => !isDraftExam(e) && Number(e.summary?.count) > 0;
const ortalama = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const DERS_KISA: Record<string, string> = { tr: 'Türkçe', mat: 'Matematik', fen: 'Fen', sos: 'İnkılap', din: 'Din K.', ing: 'İngilizce' };
const dersAd = (s: { key: string; name: string; short: string }) => DERS_KISA[s.key] || (s.name.length <= 10 ? s.name : s.short || s.name);
const trSirala = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

interface NetDegisim {
  ogr: number;
  yuk: number;
  ayni: number;
  dus: number;
  ortanca: number;
  dusenler: Array<{ id: string; ad: string; sinif: string; once: number; simdi: number; fark: number }>;
}

interface KazanimSatir {
  kod: string;
  ad: string;
  ders: string;
  oran: number;
}

export const OlcmeAnaSayfa: React.FC<Props> = ({ currentTeacher, students, classes, unreadMessages, onNavigateTab }) => {
  // ---- izinler (bölüm açılıp kapanınca yeniden hesaplanır)
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const can = useMemo(
    () => ({
      deneme: dataService.canUseTab('deneme'),
      yonet: dataService.canManageDeneme(),
      karne: dataService.canUseTab('deneme') && dataService.canSendKarne(),
      ogr: dataService.canUseTab('students'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const go: Go = useCallback(
    (tab, focus) => {
      onNavigateTab(tab);
      window.scrollTo({ top: 0 });
      if (focus) setTimeout(() => setQuickFocus(...focus), 0);
    },
    [onNavigateTab],
  );
  const denemeAc = (id: string, label = '') => go('deneme', ['deneme', id, label]);
  const [sheet, setSheet] = useState<null | 'dusen' | 'zayif' | 'tc'>(null);

  const [bugun, setBugun] = useState(trBugun());
  useEffect(() => {
    const t = setInterval(() => setBugun(trBugun()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ================================================================ DENEMELER (Deneme bölümü açıksa)
  const [exams, setExams] = useState<DenemeExam[] | null>(null);
  const [hata, setHata] = useState('');
  const oku = useCallback(async () => {
    try {
      setExams(await listExams({ drafts: dataService.canManageDeneme() }));
      setHata('');
    } catch (e: any) {
      setHata(e?.message || 'Denemeler okunamadı.');
      setExams((cur) => cur || []);
    }
  }, []);
  useEffect(() => {
    if (!can.deneme) {
      setExams(null);
      return;
    }
    void oku();
    const yenile = () => document.visibilityState === 'visible' && void oku();
    const t = setInterval(yenile, 5 * 60_000);
    document.addEventListener('visibilitychange', yenile);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', yenile);
    };
  }, [can.deneme, oku]);

  const sonuclular = useMemo(() => (exams || []).filter(sonuclu), [exams]);
  const son = sonuclular[0] || null;
  const onceki = useMemo(() => (son ? sonuclular.find((e) => e.id !== son.id && ayniTur(e, son)) || null : null), [son, sonuclular]);
  const taslaklar = useMemo(() => (exams || []).filter(isDraftExam), [exams]);

  // ---- son denemenin soruları (kazanım) ve son iki denemenin hafif sonuçları (net değişimi)
  const [tam, setTam] = useState<DenemeExam | null>(null);
  const [netler, setNetler] = useState<{ son: Map<string, { net: number; ad: string; sinif: string }>; once: Map<string, number> } | null>(null);
  const sonId = son?.id || '';
  const oncekiId = onceki?.id || '';
  useEffect(() => {
    if (!sonId) {
      setTam(null);
      setNetler(null);
      return;
    }
    let iptal = false;
    getExam(sonId)
      .then((e) => !iptal && setTam(e))
      .catch(() => !iptal && setTam(null));
    listResultsLite(oncekiId ? [sonId, oncekiId] : [sonId])
      .then((rs) => {
        if (iptal) return;
        const s = new Map<string, { net: number; ad: string; sinif: string }>();
        const o = new Map<string, number>();
        for (const r of rs) {
          if (r.totalNet === null || !r.studentId) continue;
          if (r.examId === sonId) s.set(r.studentId, { net: r.totalNet, ad: r.studentName, sinif: r.className || '' });
          else o.set(r.studentId, r.totalNet);
        }
        setNetler({ son: s, once: o });
      })
      .catch(() => !iptal && setNetler(null));
    return () => {
      iptal = true;
    };
  }, [sonId, oncekiId]);

  // ---- TC parmak izi eksik öğrenciler (yalnız kurum TC kullanıyorsa: en az bir öğrencide kayıtlı)
  const [tcVar, setTcVar] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!can.deneme || !can.yonet) {
      setTcVar(null);
      return;
    }
    let iptal = false;
    listStudentTcHashes()
      .then((m) => !iptal && setTcVar(new Set(m.keys())))
      .catch(() => !iptal && setTcVar(null));
    return () => {
      iptal = true;
    };
  }, [can.deneme, can.yonet]);
  const tcEksik = useMemo(() => (tcVar && tcVar.size > 0 ? students.filter((s) => !tcVar.has(s.id)) : []), [tcVar, students]);

  // ================================================================ HESAPLAR
  const sinifOgrSayisi = useMemo(() => {
    if (!son) return 0;
    const g = parseInt(String(son.grade), 10);
    if (Number.isNaN(g)) return 0;
    const ids = new Set(classes.filter((c) => gradeOf(c) === g).map((c) => c.id));
    const n = students.filter((s) => ids.has(s.classId)).length;
    // öğrenci listesi eksikse (katılan sayısından az) oran yanlış çıkar: hiç gösterilmez
    return n >= (Number(son.summary?.count) || 0) ? n : 0;
  }, [son, classes, students]);

  const hero = useMemo(() => {
    if (!son) return null;
    const sm = son.summary || {};
    const pm = onceki?.summary || {};
    const net = Number(sm.avgTotalNet ?? NaN);
    const puan = Number(sm.avgScore ?? NaN);
    const pNet = Number(pm.avgTotalNet ?? NaN);
    const pPuan = Number(pm.avgScore ?? NaN);
    const maxNet = son.subjects.reduce((a, s) => a + (Number(s.count) || 0), 0) || 1;
    const sinifAll = Object.entries(sm.classes || {})
      .map(([id, c]) => ({ id, ad: c.name || '—', net: Number(c.avgTotalNet) || 0, once: pm.classes?.[id] ? Number(pm.classes[id].avgTotalNet) : null }))
      .sort((a, b) => trSirala(a.ad, b.ad));
    const dersler = son.subjects
      .map((s) => {
        const r = ortalama(sm.questionRates?.[s.key] || []);
        const pr = pm.questionRates?.[s.key] ? ortalama(pm.questionRates[s.key]) : null;
        return { key: s.key, ad: dersAd(s), oran: r, fark: r !== null && pr !== null ? r - pr : null };
      })
      .filter((d) => d.oran !== null) as Array<{ key: string; ad: string; oran: number; fark: number | null }>;
    const soru = son.subjects.reduce((a, s) => a + (Number(s.count) || 0), 0);
    const degisen = sinifAll.filter((c) => c.once !== null).map((c) => ({ ...c, fark: c.net - (c.once as number) }));
    const enIyi = degisen.length ? degisen.reduce((a, b) => (b.fark > a.fark ? b : a)) : null;
    const enKotu = degisen.length > 1 ? degisen.reduce((a, b) => (b.fark < a.fark ? b : a)) : null;
    return {
      net: Number.isFinite(net) ? net : null,
      netFark: Number.isFinite(net) && Number.isFinite(pNet) ? net - pNet : null,
      puan: Number.isFinite(puan) ? puan : null,
      puanFark: Number.isFinite(puan) && Number.isFinite(pPuan) ? puan - pPuan : null,
      katilan: Number(sm.count) || 0,
      maxNet,
      siniflar: sinifAll.slice(0, 6),
      sinifFazla: Math.max(0, sinifAll.length - 6),
      dersler: dersler.slice(0, 6),
      soru,
      enIyi,
      enKotu: enKotu && enIyi && enKotu.id !== enIyi.id ? enKotu : null,
    };
  }, [son, onceki]);

  const degisim: NetDegisim | null = useMemo(() => {
    if (!netler || !onceki) return null;
    const farklar: number[] = [];
    const dusenler: NetDegisim['dusenler'] = [];
    let yuk = 0;
    let ayni = 0;
    let dus = 0;
    netler.son.forEach((v, id) => {
      const o = netler.once.get(id);
      if (o === undefined) return;
      const f = v.net - o;
      farklar.push(f);
      if (f > 1) yuk++;
      else if (f < -1) dus++;
      else ayni++;
      if (f < -5) dusenler.push({ id, ad: v.ad, sinif: v.sinif, once: o, simdi: v.net, fark: f });
    });
    if (!farklar.length) return null;
    farklar.sort((a, b) => a - b);
    const m = farklar.length >> 1;
    const ortanca = farklar.length % 2 ? farklar[m] : (farklar[m - 1] + farklar[m]) / 2;
    dusenler.sort((a, b) => a.fark - b.fark);
    return { ogr: farklar.length, yuk, ayni, dus, ortanca, dusenler };
  }, [netler, onceki]);
  const dusenSinif = useMemo(() => {
    if (!degisim || degisim.dusenler.length < 2) return null;
    const say = new Map<string, number>();
    degisim.dusenler.forEach((d) => d.sinif && say.set(d.sinif, (say.get(d.sinif) || 0) + 1));
    let best: [string, number] | null = null;
    say.forEach((v, k) => {
      if (!best || v > best[1]) best = [k, v];
    });
    return best && (best as [string, number])[1] > 1 ? (best as [string, number]) : null;
  }, [degisim]);

  const kazanim = useMemo(() => {
    if (!tam || tam.id !== sonId) return null;
    const rates = tam.summary?.questionRates || {};
    const satirlar: KazanimSatir[] = [];
    const matris: Array<{ ders: string; b: [number, number, number] }> = [];
    let eslesmeyen = 0;
    for (const s of tam.subjects) {
      const qs = tam.questions?.[s.key] || [];
      const rs = rates[s.key] || [];
      const grup = new Map<string, { ad: string; o: number[] }>();
      qs.forEach((q, i) => {
        const kod = (q.kazanimCode || q.konuCode || '').trim();
        if (!kod) {
          if (String(q.answer || '').toUpperCase() !== 'X') eslesmeyen++;
          return;
        }
        const r = rs[i];
        if (typeof r !== 'number' || !Number.isFinite(r)) return;
        const g = grup.get(kod) || { ad: (q.kazanim || q.konu || kod).trim(), o: [] };
        g.o.push(r);
        grup.set(kod, g);
      });
      if (!grup.size) continue;
      const b: [number, number, number] = [0, 0, 0];
      grup.forEach((g, kod) => {
        const oran = ortalama(g.o) as number;
        b[oran < 40 ? 0 : oran < 70 ? 1 : 2]++;
        satirlar.push({ kod, ad: g.ad, ders: s.name, oran });
      });
      matris.push({ ders: s.name, b });
    }
    const zayif = satirlar.filter((k) => k.oran < 40).sort((a, b) => a.oran - b.oran);
    const zDers = new Map<string, number>();
    zayif.forEach((k) => zDers.set(k.ders, (zDers.get(k.ders) || 0) + 1));
    let enDers: [string, number] | null = null;
    zDers.forEach((v, k) => {
      if (!enDers || v > enDers[1]) enDers = [k, v];
    });
    return { matris, zayif, enDers: enDers as [string, number] | null, eslesmeyen };
  }, [tam, sonId]);

  const isler = useMemo(() => {
    const l: Array<{ k: string; tur: 'bad' | 'w' | 'i'; baslik: string; alt: string; ne: string; nec: 'bad' | 'w' | 'm'; btn: string; dark?: boolean; on: () => void }> = [];
    if (!can.deneme || !can.yonet) return l;
    const gunFark = (iso: string) => {
      const d = iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0;
      return d <= 0 ? 'Bugün' : `${d} gün`;
    };
    for (const t of taslaklar.slice(0, 2)) {
      l.push({
        k: `t|${t.id}`,
        tur: 'bad',
        baslik: `${t.name || 'Yeni deneme'} yarım kaldı`,
        alt: `${t.draftInfo?.step || 1}. adımda bırakıldı · ${kademe(t)}`,
        ne: gunFark(t.draftInfo?.at || t.createdAt),
        nec: 'bad',
        btn: 'Devam et',
        dark: true,
        on: () => denemeAc('taslak', t.id),
      });
    }
    if (taslaklar.length > 2)
      l.push({ k: 't+', tur: 'bad', baslik: `${taslaklar.length - 2} yarım deneme daha`, alt: 'Denemeler listesinde', ne: '—', nec: 'm', btn: 'Denemeler', on: () => go('deneme') });
    const kapali = sonuclular.filter((e) => !e.published);
    if (kapali.length) {
      const e = kapali[0];
      l.push({
        k: `k|${e.id}`,
        tur: 'w',
        baslik: kapali.length > 1 ? `${kapali.length} deneme öğrencilere kapalı` : `${e.name} öğrencilere kapalı`,
        alt: 'Açınca öğrenci ve veli sonucu görür',
        ne: kisaTarih(e.examDate),
        nec: 'w',
        btn: 'Aç',
        on: () => denemeAc('detay', e.id),
      });
    }
    if (son && kazanim && kazanim.eslesmeyen > 0)
      l.push({
        k: `e|${son.id}`,
        tur: 'w',
        baslik: `${kazanim.eslesmeyen} soru kazanımla eşleşmedi`,
        alt: `${son.name} · kazanım analizinde görünmez`,
        ne: kisaTarih(son.examDate),
        nec: 'w',
        btn: 'Eşleştir',
        on: () => denemeAc('detay', son.id),
      });
    if (tcEksik.length)
      l.push({
        k: 'tc',
        tur: 'i',
        baslik: `${tcEksik.length} öğrencinin TC bilgisi eksik`,
        alt: 'Optik kâğıtta yalnız ad ve numarayla eşleşir',
        ne: '—',
        nec: 'm',
        btn: 'Göster',
        on: () => setSheet('tc'),
      });
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can, taslaklar, sonuclular, son, kazanim, tcEksik]);

  const listeDenemeler = useMemo(() => (exams || []).slice(0, 4), [exams]);
  const seri = useCallback(
    (e: DenemeExam) => {
      if (!sonuclu(e)) return [];
      return sonuclular
        .filter((x) => ayniTur(x, e) && (x.examDate || '') <= (e.examDate || '') && Number.isFinite(Number(x.summary?.avgTotalNet)))
        .slice(0, 5)
        .reverse()
        .map((x) => Number(x.summary.avgTotalNet));
    },
    [sonuclular],
  );

  // ================================================================ ÇİZİM
  const { selam, ad } = akSelam(currentTeacher);
  const lede = !can.deneme ? (
    <>Deneme bölümü kurumunuzda kapalı. Açıldığında son denemeler ve kazanım durumu burada görünür.</>
  ) : exams === null ? (
    <>Denemeler yükleniyor…</>
  ) : son ? (
    <>
      Son deneme <b>{son.name}</b>
      {hero?.netFark !== null && hero?.netFark !== undefined ? (
        <>
          , ortalama <b>{n1(Math.abs(hero.netFark))} net</b> {hero.netFark >= 0 ? 'arttı' : 'azaldı'}
        </>
      ) : null}
      .{' '}
      {isler.length ? (
        <>
          Sizi bekleyen <b>{isler.length} iş</b> aşağıda; yaptıkça kaybolur.
        </>
      ) : (
        'Bekleyen işiniz yok.'
      )}
    </>
  ) : (
    <>Henüz sonucu yüklenmiş deneme yok. İlk denemeyi ekleyince özet burada görünür.</>
  );

  const katman = (
    <>
      <AkSheet
        open={sheet === 'dusen'}
        onClose={() => setSheet(null)}
        kicker={son?.name || 'Deneme'}
        title="5 netten fazla düşenler"
        desc={onceki ? `${onceki.name} denemesine göre toplam net` : undefined}
        footer={
          <>
            <span />
            <button type="button" className="ak-btn w-24" onClick={() => setSheet(null)}>
              Kapat
            </button>
            {son && (
              <button type="button" className="ak-btn dark" onClick={() => denemeAc('detay', son.id)}>
                Sonuçları aç
              </button>
            )}
          </>
        }
      >
        <ul className="kl-list">
          {(degisim?.dusenler || []).map((d) => (
            <li key={d.id}>
              <span>
                <b>{d.ad || 'Öğrenci'}</b>
                <small>
                  {d.sinif || '—'} · {n2(d.once)} → {n2(d.simdi)}
                </small>
              </span>
              <span className="v dn tnum">{isaretli(d.fark)}</span>
            </li>
          ))}
        </ul>
      </AkSheet>
      <AkSheet
        open={sheet === 'zayif'}
        onClose={() => setSheet(null)}
        kicker={son?.name || 'Deneme'}
        title="%40'ın altındaki kazanımlar"
        desc="Soru başına doğru yüzdesinin ortalaması"
        footer={
          <>
            <span />
            <button type="button" className="ak-btn w-24" onClick={() => setSheet(null)}>
              Kapat
            </button>
            {son && (
              <button type="button" className="ak-btn dark" onClick={() => denemeAc('detay', son.id)}>
                Madde analizi
              </button>
            )}
          </>
        }
      >
        <ul className="kl-list">
          {(kazanim?.zayif || []).map((k) => (
            <li key={k.ders + k.kod}>
              <span>
                <b>{k.ad}</b>
                <small>
                  {k.ders} · {k.kod}
                </small>
              </span>
              <span className="v dn tnum">%{Math.round(k.oran)}</span>
            </li>
          ))}
        </ul>
      </AkSheet>
      <AkSheet
        open={sheet === 'tc'}
        onClose={() => setSheet(null)}
        kicker="Deneme eşleştirme"
        title="TC bilgisi eksik öğrenciler"
        desc="TC numarası saklanmaz; yalnız geri çevrilemez parmak izi tutulur. Öğrenciler sayfasından ya da Excel ile güncelleyebilirsiniz."
        footer={
          <>
            <span className="cnt tnum">{tcEksik.length} öğrenci</span>
            <button type="button" className="ak-btn w-24" onClick={() => setSheet(null)}>
              Kapat
            </button>
            {can.ogr && (
              <button type="button" className="ak-btn dark" onClick={() => go('students')}>
                Öğrenciler
              </button>
            )}
          </>
        }
      >
        <ul className="kl-list">
          {tcEksik.slice(0, 300).map((s) => (
            <li key={s.id}>
              <span>
                <b>{s.name}</b>
                <small>
                  {s.className || '—'}
                  {s.studentNumber ? ` · No ${s.studentNumber}` : ''}
                </small>
              </span>
              <span />
            </li>
          ))}
        </ul>
      </AkSheet>
    </>
  );

  const dSay = degisim ? degisim.yuk + degisim.ayni + degisim.dus : 0;
  const yuzde = (n: number) => (dSay ? Math.round((n / dSay) * 100) : 0);

  return (
    <AnaSayfaKabuk currentTeacher={currentTeacher} unreadMessages={unreadMessages} onNavigate={onNavigateTab} tema="odak" sinif="ak-kl" overlay={katman}>
      {/* ===== Selamlama ===== */}
      <div className="od-hero">
        <div>
          <div className="od-eyebrow">{gunYazi(bugun)} · Ölçme ve değerlendirme</div>
          <h1>
            {selam} {ad && <em>{ad}</em>} Öğretmenim
          </h1>
          <p className="od-lede">{lede}</p>
        </div>
        {can.deneme && (can.yonet || can.karne) && (
          <div className="kl-acts">
            {can.yonet && (
              <button type="button" className="ak-btn dark" id="olcme-yeni-deneme" onClick={() => denemeAc('yeni')}>
                <Plus /> Deneme
              </button>
            )}
            {can.karne && (
              <button type="button" className="ak-btn" id="olcme-karne" onClick={() => denemeAc('karne')}>
                <Send /> Karne gönder
              </button>
            )}
          </div>
        )}
      </div>

      {hata && <p className="od-err">{hata}</p>}

      {/* ===== Son deneme ===== */}
      {can.deneme && son && hero && (
        <section className="kl-ink" aria-label="Son deneme">
          <div>
            <div className="k">
              <span className="live" />
              Son deneme · {tarihUzun(son.examDate || bugun)} · {kademe(son)}
            </div>
            <h2>{son.name}</h2>
            <div className="sub">
              {son.publisher ? `Yayınevi: ${son.publisher} · ` : ''}
              {sinifOgrSayisi > 0 ? `${hero.katilan} / ${sinifOgrSayisi} öğrenci katıldı` : `${hero.katilan} öğrenci katıldı`}
              {sinifOgrSayisi > hero.katilan ? ` · ${sinifOgrSayisi - hero.katilan} öğrencinin sonucu yok` : ''}
            </div>
            <div className="kl-big">
              {hero.net !== null && (
                <div>
                  <b className="tnum">{n1(hero.net)}</b>
                  <span>
                    ortalama net{' '}
                    {hero.netFark !== null && (
                      <span className={hero.netFark >= 0 ? 'up' : 'dn'}>
                        {hero.netFark >= 0 ? '↑' : '↓'} {n1(Math.abs(hero.netFark))}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {hero.puan !== null && hero.puan > 0 && (
                <div>
                  <b className="tnum">{n1(hero.puan)}</b>
                  <span>
                    ortalama puan{' '}
                    {hero.puanFark !== null && (
                      <span className={hero.puanFark >= 0 ? 'up' : 'dn'}>
                        {hero.puanFark >= 0 ? '↑' : '↓'} {n1(Math.abs(hero.puanFark))}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {sinifOgrSayisi > 0 && (
                <div>
                  <b className="tnum">%{Math.min(100, Math.round((hero.katilan / sinifOgrSayisi) * 100))}</b>
                  <span>katılım</span>
                </div>
              )}
            </div>
            <div className="row">
              <button type="button" className="ak-btn light" onClick={() => denemeAc('detay', son.id)}>
                Analizi aç
              </button>
              <button type="button" className="ak-btn ghost" onClick={() => denemeAc('karne')}>
                Sınıf karneleri
              </button>
              {!son.published ? <span className="chip">Öğrencilere kapalı</span> : <span className="chip ok">Öğrencilere açık</span>}
            </div>
          </div>
          <div className="right">
            {hero.siniflar.length > 0 && (
              <>
                <div className="rh">
                  <span>Sınıflara göre ortalama net</span>
                  <span>{onceki ? 'çizgi: önceki deneme' : ''}</span>
                </div>
                {hero.siniflar.map((c) => (
                  <div className="kl-hb" key={c.id}>
                    <span className="lbl">{c.ad}</span>
                    <span className="tr">
                      <i style={{ width: `${Math.min(100, (c.net / hero.maxNet) * 100)}%` }} />
                      {c.once !== null && <s style={{ left: `${Math.min(100, (c.once / hero.maxNet) * 100)}%` }} />}
                    </span>
                    <span className="v tnum">{n1(c.net)}</span>
                    <span className={'d tnum' + (c.once === null ? '' : c.net - c.once >= 0 ? ' up' : ' dn')}>{c.once === null ? '' : isaretli(c.net - c.once)}</span>
                  </div>
                ))}
                {hero.sinifFazla > 0 && <div className="nil">+{hero.sinifFazla} sınıf daha · Analizde</div>}
              </>
            )}
            {hero.dersler.length > 0 && (
              <>
                <div className="rh mt">
                  <span>Derslere göre (soru başına doğru)</span>
                  <span>{hero.soru} soru</span>
                </div>
                {hero.dersler.map((d) => (
                  <div className="kl-hb" key={d.key}>
                    <span className="lbl">{d.ad}</span>
                    <span className="tr">
                      <i style={{ width: `${Math.min(100, d.oran)}%` }} />
                    </span>
                    <span className="v tnum">%{Math.round(d.oran)}</span>
                    <span className={'d tnum' + (d.fark === null ? '' : d.fark >= 0 ? ' up' : ' dn')}>{d.fark === null ? '' : isaretli(Math.round(d.fark), (n) => String(n))}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      )}

      {can.deneme && exams !== null && !son && (
        <section className="kl-ink tek" aria-label="Deneme">
          <div>
            <div className="k">
              <span className="live" />
              Deneme analizi
            </div>
            <h2>Henüz sonuçlu deneme yok</h2>
            <div className="sub">Cevap anahtarını, optik formatını ve sonuç dosyalarını yükleyince ortalamalar, karneler ve kazanım durumu burada görünür.</div>
            <div className="row">
              {can.yonet && (
                <button type="button" className="ak-btn light" onClick={() => denemeAc('yeni')}>
                  <Plus /> Yeni deneme
                </button>
              )}
              <button type="button" className="ak-btn ghost" onClick={() => go('deneme')}>
                Denemeler
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ===== İkili sıra: Sizi bekleyenler + Net değişimi / Denemeler + Kazanım durumu ===== */}
      {can.deneme && exams !== null && (
        <>
          <div className={'kl-grid2' + (can.yonet || degisim ? '' : ' n1')}>
            {can.yonet && (
              <section className="kl-card" aria-label="Sizi bekleyenler">
                <div className="kl-card-h">
                  <div>
                    <h3>
                      Sizi bekleyenler {isler.length > 0 && <span className="kl-cnt tnum">{isler.length}</span>}
                    </h3>
                    <p>Yarım kalan ya da eksik işler · yapınca kaybolur</p>
                  </div>
                </div>
                {isler.length ? (
                  <div className="kl-body">
                    {isler.map((t) => (
                      <div className="kl-task" key={t.k}>
                        <span className={'bar' + (t.tur === 'bad' ? '' : ' ' + t.tur)} />
                        <div>
                          <b>{t.baslik}</b>
                          <small>{t.alt}</small>
                        </div>
                        <span className={'when' + (t.nec === 'bad' ? '' : ' ' + t.nec)}>{t.ne}</span>
                        <button type="button" className={'ak-btn sm' + (t.dark ? ' dark' : '')} onClick={t.on}>
                          {t.btn}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="kl-empty">
                    <i>✓</i> Bekleyen iş yok. Yarım kalan deneme, kapalı sonuç ve eşleşmeyen soru burada görünür.
                  </div>
                )}
                <div className="kl-foot">
                  <span>
                    Sonuçlu <b>{sonuclular.length}</b> deneme · öğrencilere kapalı <b>{sonuclular.filter((e) => !e.published).length}</b>
                  </span>
                  <button type="button" className="od-link" onClick={() => go('deneme')}>
                    Denemeler <ArrowRight />
                  </button>
                </div>
              </section>
            )}

            {son && (
              <section className="kl-card" aria-label="Net değişimi">
                <div className="kl-card-h">
                  <div>
                    <h3>Net değişimi</h3>
                    <p>{onceki ? `${son.name} · ${onceki.name} denemesine göre${degisim ? ` ${degisim.ogr} öğrenci` : ''}` : `${son.name} · karşılaştırılacak önceki deneme yok`}</p>
                  </div>
                  <button type="button" className="od-link" onClick={() => denemeAc('detay', son.id)}>
                    Sonuçlar <ArrowRight />
                  </button>
                </div>
                {degisim ? (
                  <div className="kl-body">
                    <div className="kl-kpi">
                      <div>
                        <b className="tnum ok">{degisim.yuk}</b>
                        <span>yükseldi</span>
                      </div>
                      <div>
                        <b className="tnum">{degisim.ayni}</b>
                        <span>aynı kaldı (±1)</span>
                      </div>
                      <div>
                        <b className="tnum bad">{degisim.dus}</b>
                        <span>düştü</span>
                      </div>
                    </div>
                    <div className="kl-stack" aria-hidden="true">
                      <i style={{ width: `${yuzde(degisim.yuk)}%`, background: 'var(--success)' }} />
                      <i style={{ width: `${yuzde(degisim.ayni)}%`, background: 'var(--line-strong)' }} />
                      <i style={{ width: `${yuzde(degisim.dus)}%`, background: 'var(--danger)' }} />
                    </div>
                    <div className="kl-leg">
                      <span>
                        <i style={{ background: 'var(--success)' }} />%{yuzde(degisim.yuk)}
                      </span>
                      <span>
                        <i style={{ background: 'var(--line-strong)' }} />%{yuzde(degisim.ayni)}
                      </span>
                      <span>
                        <i style={{ background: 'var(--danger)' }} />%{yuzde(degisim.dus)}
                      </span>
                      <span className="r">
                        ortanca <b>{isaretli(degisim.ortanca, n2)} net</b>
                      </span>
                    </div>
                    {degisim.dusenler.length > 0 ? (
                      <div className="kl-alert">
                        <span className="ic">
                          <ArrowDown />
                        </span>
                        <span>
                          <b>{degisim.dusenler.length} öğrenci</b> 5 netten fazla düştü
                          {dusenSinif ? ` · en çok ${dusenSinif[0]} (${dusenSinif[1]})` : ''}
                        </span>
                        <button type="button" className="ak-btn sm" onClick={() => setSheet('dusen')}>
                          Listeyi aç
                        </button>
                      </div>
                    ) : (
                      <div className="kl-alert ok">
                        <span className="ic">✓</span>
                        <span>5 netten fazla düşen öğrenci yok</span>
                        <span />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="kl-empty">{onceki ? 'Sonuçlar okunuyor…' : 'Aynı kademede ikinci deneme yüklenince öğrencilerin net değişimi burada özetlenir.'}</div>
                )}
                <div className="kl-foot">
                  {hero?.enIyi ? (
                    <span>
                      En çok yükselen sınıf <b>{`${hero.enIyi.ad} (${isaretli(hero.enIyi.fark)})`}</b>
                    </span>
                  ) : (
                    <span>Sınıf karşılaştırması önceki denemeyle yapılır</span>
                  )}
                  {hero?.enKotu && (
                    <span>
                      En az <b>{`${hero.enKotu.ad} (${isaretli(hero.enKotu.fark)})`}</b>
                    </span>
                  )}
                </div>
              </section>
            )}
          </div>

          <div className={'kl-grid2' + (son ? '' : ' n1')}>
            <section className="kl-card" aria-label="Denemeler">
              <div className="kl-card-h">
                <div>
                  <h3>Denemeler</h3>
                  <p>Son yüklenenler · çizgi: aynı kademede ortalama net</p>
                </div>
                <button type="button" className="od-link" onClick={() => go('deneme')}>
                  Tümü <ArrowRight />
                </button>
              </div>
              {listeDenemeler.length ? (
                <div className="kl-body">
                  {listeDenemeler.map((e) => {
                    const s = seri(e);
                    const taslak = isDraftExam(e);
                    const net = Number(e.summary?.avgTotalNet);
                    return (
                      <button type="button" className="kl-ex" key={e.id} onClick={() => (taslak ? denemeAc('taslak', e.id) : denemeAc('detay', e.id))}>
                        <span>
                          <b>{e.name || 'Deneme'}</b>
                          <small>
                            {kisaTarih(e.examDate)} · {kademe(e)} · {taslak ? 'taslak' : `${Number(e.summary?.count) || 0} öğrenci`}
                          </small>
                        </span>
                        <Spark degerler={s} />
                        <span className={'n tnum' + (taslak || !Number.isFinite(net) ? ' z' : '')}>{taslak || !Number.isFinite(net) ? '—' : n1(net)}</span>
                        <span className="s">
                          {taslak ? <span className="kl-chip">Taslak</span> : e.published ? <span className="kl-chip ok">Yayında</span> : <span className="kl-chip warn">Kapalı</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="kl-empty">Henüz deneme yok.</div>
              )}
              <div className="kl-foot">
                <span>
                  Toplam <b>{(exams || []).length}</b> deneme{taslaklar.length ? ` · ${taslaklar.length} taslak` : ''}
                </span>
              </div>
            </section>

            {son && (
              <section className="kl-card" aria-label="Kazanım durumu">
                <div className="kl-card-h">
                  <div>
                    <h3>Kazanım durumu</h3>
                    <p>{son.name} · kazanım sayısı, doğru yüzdesine göre</p>
                  </div>
                  <button type="button" className="od-link" onClick={() => denemeAc('detay', son.id)}>
                    Madde analizi <ArrowRight />
                  </button>
                </div>
                {kazanim && kazanim.matris.length ? (
                  <div className="kl-body">
                    <div className="kl-mx">
                      <span />
                      <span className="hd">%40 altı</span>
                      <span className="hd">%40–70</span>
                      <span className="hd">%70 üstü</span>
                      {kazanim.matris.slice(0, 7).map((m) => (
                        <React.Fragment key={m.ders}>
                          <span className="ad">{m.ders}</span>
                          <span className={'c ' + (m.b[0] === 0 ? 'z' : m.b[0] >= 5 ? 'b3' : m.b[0] >= 3 ? 'b2' : 'b1')}>{m.b[0]}</span>
                          <span className={'c ' + (m.b[1] === 0 ? 'z' : m.b[1] >= 6 ? 'w2' : 'w1')}>{m.b[1]}</span>
                          <span className={'c ' + (m.b[2] === 0 ? 'z' : m.b[2] >= 6 ? 'g2' : 'g1')}>{m.b[2]}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="kl-empty">{kazanim ? 'Bu denemenin soruları kazanımla eşleştirilmemiş.' : 'Kazanımlar okunuyor…'}</div>
                )}
                <div className="kl-foot">
                  {kazanim && kazanim.zayif.length ? (
                    <>
                      <span>
                        <b>{kazanim.zayif.length} kazanım</b> %40'ın altında
                        {kazanim.enDers && kazanim.enDers[1] > 1 ? ` · en çok ${kazanim.enDers[0]} (${kazanim.enDers[1]})` : ''}
                      </span>
                      <button type="button" className="od-link" onClick={() => setSheet('zayif')}>
                        Hangileri <ArrowRight />
                      </button>
                    </>
                  ) : (
                    <span>%40'ın altında kazanım yok</span>
                  )}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </AnaSayfaKabuk>
  );
};

/** Küçük çizgi grafik (aynı kademedeki son 5 denemenin ortalama neti) */
const Spark: React.FC<{ degerler: number[] }> = ({ degerler }) => {
  if (degerler.length < 2) return <svg className="kl-spark" viewBox="0 0 84 26" aria-hidden="true" />;
  const min = Math.min(...degerler);
  const max = Math.max(...degerler);
  const span = max - min || 1;
  const pts = degerler.map((v, i) => [2 + (i * 80) / (degerler.length - 1), 22 - ((v - min) / span) * 18] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="kl-spark" viewBox="0 0 84 26" aria-hidden="true">
      <path d={d} />
      <circle cx={last[0]} cy={last[1]} r="2.2" />
    </svg>
  );
};
