import React, { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Award, BarChart3, Bell, BookOpen, Calendar, Check, Flame, HelpCircle, Home, MessageSquare, Plus } from 'lucide-react';
import type { Etut, Homework, HomeworkSubmission, Student, StudentMessage, StudentNotification, StudentQuestionLog } from '../../types';
import type { StudentTabType } from './StudentHeroBanner';
import type { OgrBolum } from '../../lib/ogrenciBolum';
import { dataService } from '../../services/dataService';
import { homeworkStateFor } from './StudentHomeUtils';
import { bildirimAcik } from './StudentNotificationCenterModal';
import { buildStudentQuestionSummary } from '../../utils/studentQuestionSummary';
import { computeTargetDays, isPendingPlanTarget, weekDayGoal } from '../../utils/targetDays';
import { formatDateISO, getWeekStartOf } from '../../utils/questionAnalytics';
import { useDataVersion } from '../../lib/useDataVersion';
import { useSeenIds } from '../../lib/useSeenIds';
import { dayIndexOf, loadMyCurrentWeek, type PlanItem } from '../../services/studyPlanService';
import { planGorevIsaretle } from '../../lib/planGorev';
import { devamsizligim, haftaBasi, ogrenciProgrami, trBugun, type Devamsizligim, type OgrenciProgram } from '../../services/dersService';
import { AkSheet, AnaSayfaKabuk, akBasHarf, type AkMenuOge } from '../Home/AnaSayfaKabuk';
import '../Home/kalanAnaSayfa.css';

// ============================================================================
// Aşama 253: ÖĞRENCİ ANA SAYFASI (taslak: kalan-roller.html › Öğrenci, 13 Kasım; Odak renkleri, sol menü + hayalet etiket)
// Bölümler (yalnız öğrenciye AÇIK bölümler; kapalı bölümün verisi hazırlanmaz, sorgusu atılmaz):
//  * Bugün (koyu kart): soru hedefi halkası + bugün girilen dersler; sağda "Bugünkü planım" (yaptım işareti, ortak
//    yardımcı planGorevIsaretle ile soru kaydına aktarım; haftalık plan sağdan açılır).
//  * Bana gelenler: Ödev / Etüt / Mesaj / Bildirim sekmeleri; yeni gelen varsa sekme yanıp söner (tıklanınca durur,
//    görüldü kaydı cihazlar arası: useSeenIds; bildirimler okundu olur). Her sekme en çok birkaç satır + "tümü" bağlantısı.
//  * Bugünkü ders programım: kendi sınıfının bugünkü dersleri (ders_programim), öğle arası, bugünkü etütler; altta
//    devamsızlık özeti (ders_devamsizligim). Ders programı kullanılmayan kurumda kart çıkmaz.
//  * Bu hafta (günlük soru sayısı, kesik çizgi günlük hedef) ve Son denemem — eşit iki kart.
// KURAL (13 Kas, Mustafa): aynı sıradaki duvarlar eşit boy; Öğretmenlerinden bölümü kaldırıldı.
// Sayılar Soru Takibi sayfasıyla AYNI fonksiyonlardan (buildStudentQuestionSummary, weekDayGoal).
// ============================================================================

const StudentTodayPlan = lazy(() => import('./StudentTodayPlan').then((m) => ({ default: m.StudentTodayPlan })));

type Hub = 'odev' | 'etut' | 'mesaj' | 'bild';

interface Props {
  student: Student;
  homeworks: Homework[];
  etuts: Etut[];
  submissions: HomeworkSubmission[];
  messages: StudentMessage[];
  announcements: StudentMessage[];
  acik: (b: OgrBolum) => boolean;
  preview?: boolean;
  unreadNotifs: number;
  onNavigateTab: (tab: StudentTabType) => void;
  onTeslim: (hw: Homework) => void;
  onOpenNotifications: () => void;
  onOpenStudyPlan: () => void;
  /** Sayfanın altına eklenecek ek parça (telefon bildirimi açma kartı) */
  ek?: React.ReactNode;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseYmd = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const GUN3 = ['PAZ', 'PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT'];
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const fmt = (n: number) => n.toLocaleString('tr-TR');
const fmtNet = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const dk = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** "Ayşe Nur Kaya" → "A.N. Kaya" */
const kisaAd = (ad: string) => {
  const p = (ad || '').trim().split(/\s+/).filter(Boolean);
  if (p.length < 2) return p[0] || '';
  return `${p
    .slice(0, -1)
    .map((x) => x[0].toLocaleUpperCase('tr-TR') + '.')
    .join('')} ${p[p.length - 1]}`;
};
const ilkAd = (ad: string) => (ad || '').trim().split(/\s+/)[0] || '';
const once = (iso: string) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const d = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (d < 60) return `${Math.max(1, d)} dk`;
  if (d < 1440) return `${Math.round(d / 60)} sa`;
  const g = Math.round(d / 1440);
  return g === 1 ? 'Dün' : `${g} gün`;
};
const YENI_GUN = 7; // bu kadar günden eski kayıt "yeni" sayılmaz (ilk açılışta hepsi yanıp sönmesin)
const SON_GUN = 14; // mesaj / bildirim penceresi

interface DenemeOzet {
  name: string;
  date: string;
  net: number | null;
  prevNet: number | null;
  weak: Array<{ key: string; label: string; rate: number }>;
}

export const OgrenciAnaSayfa: React.FC<Props> = ({
  student,
  homeworks: tumOdevler,
  etuts: tumEtutler,
  submissions,
  messages,
  announcements,
  acik,
  preview = false,
  unreadNotifs,
  onNavigateTab,
  onTeslim,
  onOpenNotifications,
  onOpenStudyPlan,
  ek,
}) => {
  const can = {
    soru: acik('questions'),
    plan: acik('plan'),
    odev: acik('homework'),
    etut: acik('etut'),
    ders: acik('grades'),
    mesaj: acik('messages'),
    deneme: acik('deneme'),
  };
  const odevler = can.odev ? tumOdevler : [];
  const etutler = can.etut ? tumEtutler : [];
  const dataVersion = useDataVersion();

  const [simdi, setSimdi] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setSimdi(new Date()), 60_000);
    const vis = () => document.visibilityState === 'visible' && setSimdi(new Date());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  const bugun = ymdOf(simdi);
  const yarin = ymdOf(addDays(simdi, 1));

  const go = useCallback(
    (tab: StudentTabType) => {
      onNavigateTab(tab);
      window.scrollTo({ top: 0 });
    },
    [onNavigateTab],
  );
  const soruGir = () => {
    window.history.pushState(null, '', '#/student/questions/entry'); // Soru Sayısı "+ Soru Kaydet" sekmesiyle açılır
    go('questions');
  };

  // ================================================================ SORU: bugün ve bu hafta
  const [logs, setLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());
  useEffect(() => dataService.subscribe(() => startTransition(() => setLogs(dataService.getQuestionLogs()))), []);
  const q = useMemo(
    () => (can.soru ? buildStudentQuestionSummary(student.id, simdi, logs) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [can.soru, student.id, bugun, logs, dataVersion],
  );
  const bugunDersler = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      if (l.studentId !== student.id || (l.date || '').slice(0, 10) !== bugun) continue;
      for (const e of l.entries || []) if (e.subject) m.set(e.subject, (m.get(e.subject) || 0) + (Number(e.questionCount) || 0));
    }
    return Array.from(m.entries())
      .filter((x) => x[1] > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [logs, student.id, bugun]);
  const bugunCozulen = bugunDersler.reduce((a, x) => a + x[1], 0);

  const hafta = useMemo(() => {
    if (!can.soru) return null;
    const start = getWeekStartOf(simdi, dataService.getStudentWeekStartDay(student.id));
    const days = Array.from({ length: 7 }, (_, i) => formatDateISO(addDays(start, i)));
    const targets = dataService
      .getQuestionTargetsForStudent(student.id, days[0], days[6])
      .filter((t) => !isPendingPlanTarget(t))
      .map((t) => ({ t, res: computeTargetDays(t, student.id, logs, bugun) }));
    const perDay = new Map<string, number>();
    for (const l of logs) {
      if (l.studentId !== student.id) continue;
      const d = (l.date || '').slice(0, 10);
      perDay.set(d, (perDay.get(d) || 0) + (Number(l.totalQuestions) || 0));
    }
    const gunler = days.map((ymd) => {
      const count = perDay.get(ymd) || 0;
      const goal = weekDayGoal(ymd, targets).goal;
      const d = parseYmd(ymd)!;
      return { ymd, count, goal, gun: GUN3[d.getDay()] };
    });
    const tutulan = gunler.filter((g) => g.goal > 0 && g.count >= g.goal).length;
    let seri = 0;
    let cur = (perDay.get(bugun) || 0) > 0 ? simdi : addDays(simdi, -1);
    for (let i = 0; i < 366; i++) {
      if ((perDay.get(ymdOf(cur)) || 0) <= 0) break;
      seri++;
      cur = addDays(cur, -1);
    }
    // kesik çizgi: haftada en sık görülen günlük hedef
    const sik = new Map<number, number>();
    gunler.forEach((g) => g.goal > 0 && sik.set(g.goal, (sik.get(g.goal) || 0) + 1));
    let hedef = 0;
    sik.forEach((v, k) => {
      if (!hedef || v > (sik.get(hedef) || 0)) hedef = k;
    });
    return { gunler, tutulan, seri, toplam: gunler.reduce((a, g) => a + g.count, 0), hedef };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can.soru, student.id, logs, bugun, dataVersion]);

  // ================================================================ PLAN (bugünkü görevler)
  const [plan, setPlan] = useState<{ weekStart: string; items: PlanItem[]; sentBy: string } | null>(null);
  const [planMsg, setPlanMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const bekleyen = useRef(new Set<string>());
  const planOku = useCallback(async () => {
    try {
      const r = await loadMyCurrentWeek(new Date());
      setPlan((cur) => ({
        weekStart: r.weekStart,
        sentBy: r.sentByName,
        items: r.items.map((i) => (bekleyen.current.has(i.id) ? cur?.items.find((c) => c.id === i.id) || i : i)),
      }));
    } catch {
      /* ağ hatasında eski liste kalır */
    }
  }, []);
  useEffect(() => {
    if (!can.plan || preview) {
      setPlan(null);
      return;
    }
    void planOku();
    const vis = () => document.visibilityState === 'visible' && void planOku();
    document.addEventListener('visibilitychange', vis);
    const t = setInterval(() => void planOku(), 90_000);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      clearInterval(t);
    };
  }, [can.plan, preview, planOku]);
  const bugunIdx = plan ? dayIndexOf(simdi, plan.weekStart) : -1;
  const bugunGorev = useMemo(() => (plan ? plan.items.filter((i) => i.day === bugunIdx) : []), [plan, bugunIdx]);
  const geciken = useMemo(() => (plan ? plan.items.filter((i) => i.day < bugunIdx && !i.doneAt).length : 0), [plan, bugunIdx]);
  const isaretle = async (it: PlanItem) => {
    if (!plan || bekleyen.current.has(it.id) || preview) return;
    const next = !it.doneAt;
    bekleyen.current.add(it.id);
    setPlanMsg(null);
    setPlan((p) => (p ? { ...p, items: p.items.map((i) => (i.id === it.id ? { ...i, doneAt: next ? new Date().toISOString() : null } : i)) } : p));
    try {
      const r = await planGorevIsaretle(it, next, plan.weekStart);
      if (r.uyari) setPlanMsg({ t: r.uyari, err: true });
      else if (r.bilgi) setPlanMsg({ t: r.bilgi });
    } catch (e: any) {
      setPlan((p) => (p ? { ...p, items: p.items.map((i) => (i.id === it.id ? { ...i, doneAt: it.doneAt } : i)) } : p));
      setPlanMsg({ t: e?.message || 'İşaret kaydedilemedi. Lütfen tekrar dene.', err: true });
    } finally {
      bekleyen.current.delete(it.id);
    }
  };
  useEffect(() => {
    if (!planMsg) return;
    const t = setTimeout(() => setPlanMsg(null), 15_000);
    return () => clearTimeout(t);
  }, [planMsg]);

  // ================================================================ BANA GELENLER
  const [seen, markSeen] = useSeenIds(`ogr_gelenler_${student.id}`, 600);
  const yeniSinir = Date.now() - YENI_GUN * 86400000;
  const tazeMi = (iso?: string) => {
    const t = iso ? new Date(iso).getTime() : NaN;
    return Number.isFinite(t) && t >= yeniSinir;
  };
  const subOf = (hw: Homework) =>
    submissions.find((s) => s.homeworkId === hw.id && s.studentId === student.id) ||
    (Array.isArray(hw.submissions) ? hw.submissions.find((s) => s.studentId === student.id) : undefined);

  const acikOdev = useMemo(() => {
    const ms = simdi.getTime();
    return odevler
      .map((hw) => ({ hw, st: homeworkStateFor(hw, subOf(hw), ms) }))
      .filter((x) => x.st === 'open' || x.st === 'overdue')
      .sort((a, b) => (a.hw.dueDate || '').localeCompare(b.hw.dueDate || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odevler, submissions, simdi, dataVersion]);
  const teslimOrani = useMemo(() => {
    const bas = `${simdi.getFullYear()}-${pad(simdi.getMonth() + 1)}-01`;
    const ms = simdi.getTime();
    const l = odevler.filter((hw) => (hw.dueDate || '').slice(0, 10) >= bas && (hw.dueDate || '').slice(0, 10) <= bugun);
    const say = l.map((hw) => homeworkStateFor(hw, subOf(hw), ms)).filter((s) => s !== 'excused' && s !== 'open');
    return say.length ? Math.round((say.filter((s) => s === 'done').length / say.length) * 100) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odevler, submissions, simdi, bugun]);

  const gelecekEtut = useMemo(
    () =>
      etutler
        .filter((e) => e.date >= bugun)
        .filter((e) => {
          if (e.date > bugun) return true;
          const b = dk(e.time || '');
          return b === null || b + (Number(e.duration) || 45) > simdi.getHours() * 60 + simdi.getMinutes();
        })
        .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`)),
    [etutler, bugun, simdi],
  );
  const etutAy = useMemo(() => {
    const bas = `${simdi.getFullYear()}-${pad(simdi.getMonth() + 1)}-01`;
    const l = etutler.filter((e) => e.date >= bas && e.date <= bugun);
    const isaret = l.map((e) => e.studentAttendance?.[student.id]?.status).filter(Boolean) as string[];
    return { adet: l.length, katilim: isaret.length ? Math.round((isaret.filter((s) => s === 'present' || s === 'late').length / isaret.length) * 100) : null };
  }, [etutler, bugun, simdi, student.id]);

  const cevaplar = useMemo(
    () =>
      can.mesaj
        ? messages
            .filter((m) => !!m.teacherReply && tazeOrAy(m.repliedAt || m.createdAt))
            .sort((a, b) => (b.repliedAt || b.createdAt || '').localeCompare(a.repliedAt || a.createdAt || ''))
        : [],
    [can.mesaj, messages],
  );
  const bildirimler = useMemo(() => {
    const cut = Date.now() - SON_GUN * 86400000;
    const l: Array<{ id: string; seenId: string; notif?: StudentNotification; kim: string; ust: string; metin: string; at: string; tur: 'ok' | 'warn' | '' }> = [];
    for (const n of dataService.getStudentNotifications(student.id)) {
      if (!bildirimAcik(n.type, acik) || new Date(n.createdAt).getTime() < cut) continue;
      l.push({
        id: `n:${n.id}`,
        seenId: `n:${n.id}`,
        notif: n,
        kim: n.teacherName || 'Bildirim',
        ust: n.title,
        metin: n.message,
        at: n.createdAt,
        tur: n.type === 'praise' ? 'ok' : n.type === 'grade_added' ? 'warn' : '',
      });
    }
    for (const a of announcements) {
      if (new Date(a.createdAt).getTime() < cut) continue;
      l.push({ id: `a:${a.id}`, seenId: `a:${a.id}`, kim: a.senderName || 'Öğretmenin', ust: a.kind === 'note' ? 'Not' : 'Duyuru', metin: [a.subject, a.text].filter(Boolean).join(' · '), at: a.createdAt, tur: '' });
    }
    return l.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, announcements, acik, dataVersion, unreadNotifs]);

  const yeni = {
    odev: acikOdev.filter((x) => !seen.has(`h:${x.hw.id}`) && tazeMi(x.hw.assignedDate || x.hw.createdAt)).map((x) => `h:${x.hw.id}`),
    etut: gelecekEtut.filter((e) => !seen.has(`e:${e.id}`) && tazeMi(e.createdAt)).map((e) => `e:${e.id}`),
    mesaj: cevaplar.filter((m) => !seen.has(`m:${m.id}:${m.repliedAt || ''}`) && tazeMi(m.repliedAt)).map((m) => `m:${m.id}:${m.repliedAt || ''}`),
    bild: bildirimler.filter((b) => (b.notif ? !b.notif.read : !seen.has(b.seenId) && tazeMi(b.at))).map((b) => b.seenId),
  };
  const sekmeler = (
    [
      { id: 'odev', ad: 'Ödev', icon: BookOpen, on: can.odev, n: acikOdev.length },
      { id: 'etut', ad: 'Etüt', icon: Calendar, on: can.etut, n: gelecekEtut.length },
      { id: 'mesaj', ad: 'Mesaj', icon: MessageSquare, on: can.mesaj, n: cevaplar.length },
      { id: 'bild', ad: 'Bildirim', icon: Bell, on: true, n: bildirimler.length },
    ] as const
  ).filter((s) => s.on);
  const [hub, setHub] = useState<Hub>(() => (sekmeler[0]?.id as Hub) || 'bild');
  useEffect(() => {
    if (!sekmeler.some((s) => s.id === hub)) setHub((sekmeler[0]?.id as Hub) || 'bild');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can.odev, can.etut, can.mesaj]);
  const sekmeSec = (h: Hub) => {
    setHub(h);
    if (preview) return; // öğretmen önizlemesi öğrencinin "görüldü" kaydını değiştirmez
    const ids = yeni[h];
    if (!ids.length) return;
    if (h === 'bild') {
      for (const b of bildirimler) if (b.notif && !b.notif.read) dataService.markNotificationAsRead(b.notif.id);
      markSeen(ids.filter((x) => x.startsWith('a:')));
    } else markSeen(ids);
  };

  // ================================================================ DERS PROGRAMI + DEVAMSIZLIK (Not-Devamsızlık açıksa)
  const [prog, setProg] = useState<OgrenciProgram | null | undefined>(undefined);
  const [devam, setDevam] = useState<Devamsizligim | null>(null);
  const trGun = trBugun();
  useEffect(() => {
    if (!can.ders) {
      setProg(null);
      setDevam(null);
      return;
    }
    let iptal = false;
    const oku = () => {
      ogrenciProgrami(haftaBasi(trBugun()))
        .then((v) => !iptal && setProg(v))
        .catch(() => !iptal && setProg((c) => (c === undefined ? null : c)));
      devamsizligim()
        .then((v) => !iptal && setDevam(v))
        .catch(() => undefined);
    };
    oku();
    const vis = () => document.visibilityState === 'visible' && oku();
    document.addEventListener('visibilitychange', vis);
    const t = setInterval(() => document.visibilityState === 'visible' && oku(), 5 * 60_000);
    return () => {
      iptal = true;
      document.removeEventListener('visibilitychange', vis);
      clearInterval(t);
    };
  }, [can.ders]);
  const program = useMemo(() => {
    if (!prog || !prog.ayar?.kayitli) return null;
    // Aşama 254: haftalık programdaki (StudentDersProgrami) kuralla aynı: sınıfın bu hafta hiç dersi ve tatili yoksa kart çıkmaz
    if (!prog.hucreler.length && !prog.tatiller.length) return null;
    const ayar = prog.ayar;
    const tatil = prog.tatiller.find((t) => t.tarih === trGun);
    const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();
    type Satir = { k: string; tur: 'ders' | 'ogle' | 'etut'; no: string; bas: string; bit: string; ad: string; alt: string; durum: '' | 'done' | 'now'; chip?: { t: string; c: string } };
    const satirlar: Satir[] = [];
    const hucreler = prog.hucreler.filter((h) => h.tarih === trGun).sort((a, b) => a.sira - b.sira);
    let onceBit: number | null = null;
    for (const h of hucreler) {
      const s = ayar.saatler[h.sira - 1];
      const b = dk(s?.bas || '');
      const e = dk(s?.bit || '');
      if (onceBit !== null && b !== null && b - onceBit >= 30) satirlar.push({ k: `o${h.sira}`, tur: 'ogle', no: '', bas: `${pad(Math.floor(onceBit / 60))}:${pad(onceBit % 60)}`, bit: '', ad: '', alt: 'Öğle arası', durum: '' });
      onceBit = e;
      const durum: Satir['durum'] = b !== null && e !== null && simdiDk >= b && simdiDk < e ? 'now' : e !== null && simdiDk >= e ? 'done' : '';
      const chip =
        h.durum === 'present'
          ? { t: 'Geldin', c: 'ok' }
          : h.durum === 'late'
            ? { t: 'Geç', c: 'warn' }
            : h.durum === 'absent'
              ? { t: 'Gelmedin', c: 'bad' }
              : h.durum === 'excused'
                ? { t: 'İzinli', c: 'info' }
                : durum === 'now'
                  ? { t: 'Şimdi', c: 'hi' }
                  : undefined;
      satirlar.push({ k: `d${h.sira}`, tur: 'ders', no: String(h.sira), bas: s?.bas || '', bit: s?.bit || '', ad: h.ders || 'Ders', alt: h.teacherAdlari.map(kisaAd).join(', '), durum, chip });
    }
    // bugünkü etütler (cihaz günü = Türkiye günü olduğunda)
    if (bugun === trGun)
      for (const e of etutler.filter((x) => x.date === bugun)) {
        const b = dk(e.time || '');
        const bit = b !== null ? b + (Number(e.duration) || 45) : null;
        const sat: Satir = {
          k: `e${e.id}`,
          tur: 'etut',
          no: 'E',
          bas: e.time || '',
          bit: bit !== null ? `${pad(Math.floor(bit / 60) % 24)}:${pad(bit % 60)}` : '',
          ad: `${e.subject || 'Etüt'} etüdü`,
          alt: [(e.teacherNames && e.teacherNames.length ? e.teacherNames : e.teacherName ? [e.teacherName] : []).map(kisaAd).join(', '), e.location].filter(Boolean).join(' · '),
          durum: b !== null && bit !== null && simdiDk >= b && simdiDk < bit ? 'now' : '',
          chip: { t: 'Etüt', c: 'info' },
        };
        const at = satirlar.findIndex((x) => x.bas && sat.bas && x.bas > sat.bas);
        if (at < 0) satirlar.push(sat);
        else satirlar.splice(at, 0, sat);
      }
    const dersSay = hucreler.length;
    const etutSay = satirlar.filter((x) => x.tur === 'etut').length;
    return { tatil, satirlar, dersSay, etutSay, sinir: ayar.devamsizlikSinir, kala: ayar.devamsizlikKala };
  }, [prog, trGun, bugun, simdi, etutler]);

  // ================================================================ SON DENEME (Deneme bölümü açıksa)
  const [deneme, setDeneme] = useState<DenemeOzet | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (!can.deneme) {
      setDeneme(null);
      return;
    }
    (async () => {
      try {
        const [svc, kk, km] = await Promise.all([import('../../services/denemeService'), import('../../lib/deneme/kazanimKarne'), import('../../lib/deneme/karneModel')]);
        const r = await svc.loadMyDenemeler();
        const mine = r.results.filter((x) => x.studentId === student.id);
        const exams = r.exams
          .filter((e) => mine.some((x) => x.examId === e.id))
          .sort((a, b) => (a.examDate || '').localeCompare(b.examDate || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
        if (!exams.length) {
          if (alive) setDeneme(null);
          return;
        }
        const last = exams[exams.length - 1];
        const prev = exams.length > 1 ? exams[exams.length - 2] : null;
        const netOf = (id: string) => {
          const x = mine.find((m) => m.examId === id);
          return x && x.totalNet !== null && Number.isFinite(Number(x.totalNet)) ? Number(x.totalNet) : null;
        };
        let weak: DenemeOzet['weak'] = [];
        try {
          weak = kk.studySuggestions(kk.kazanimTracking(exams, mine, km.usedSubjects(exams)), 3).map((s) => ({
            key: s.row.key,
            label: s.row.short || s.row.label,
            rate: Math.round(s.row.lastRate ?? s.row.rate),
          }));
        } catch {
          weak = [];
        }
        if (alive) setDeneme({ name: last.name, date: last.examDate, net: netOf(last.id), prevNet: prev ? netOf(prev.id) : null, weak });
      } catch {
        if (alive) setDeneme(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [student.id, can.deneme]);

  // ================================================================ MENÜ (sol şerit)
  const menu: AkMenuOge[] = [
    { id: 'home', title: 'Ana sayfa', icon: Home, current: true, onClick: () => undefined },
    ...(can.odev ? [{ id: 'homework', title: 'Ödevlerim', icon: BookOpen, badge: yeni.odev.length, onClick: () => go('homework') }] : []),
    ...(can.etut ? [{ id: 'etuts', title: 'Etütlerim', icon: Calendar, badge: yeni.etut.length, onClick: () => go('etuts') }] : []),
    ...(can.soru ? [{ id: 'questions', title: 'Soru sayım', icon: HelpCircle, onClick: () => go('questions') }] : []),
    ...(can.ders ? [{ id: 'grades', title: 'Dersler ve devamsızlık', icon: Award, onClick: () => go('grades') }] : []),
    ...(can.deneme ? [{ id: 'deneme', title: 'Deneme sonuçlarım', icon: BarChart3, onClick: () => go('deneme') }] : []),
    ...(can.mesaj ? [{ id: 'messages', title: 'Öğretmene soru sor', icon: MessageSquare, badge: yeni.mesaj.length, onClick: () => go('messages') }] : []),
    { id: 'bildirim', title: 'Bildirimler', icon: Bell, sep: true, badge: unreadNotifs, onClick: onOpenNotifications },
  ].map((m, i) => (i === 1 ? { ...m, sep: true } : m)); // ana sayfadan sonra ayraç

  // ================================================================ ÇİZİM
  const saat = simdi.getHours();
  const selam = saat < 12 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar';
  const goalDone = !!q && q.todayGoal > 0 && q.todayGoalSolved >= q.todayGoal;
  const kalan = q ? Math.max(0, q.todayGoal - q.todayGoalSolved) : 0;
  const yakinOdev = acikOdev.filter((x) => (x.hw.dueDate || '').slice(0, 10) <= yarin);
  const lede: React.ReactNode[] = [];
  if (q && q.todayGoal > 0)
    lede.push(
      goalDone ? (
        <React.Fragment key="q">
          Bugünkü <b>{fmt(q.todayGoal)} soru</b> hedefini tamamladın.
        </React.Fragment>
      ) : (
        <React.Fragment key="q">
          Bugünkü hedefin <b>{fmt(q.todayGoal)} soru</b>; <b>{fmt(kalan)} soru</b> kaldı.
        </React.Fragment>
      ),
    );
  if (yakinOdev.length)
    lede.push(
      <React.Fragment key="o">
        {' '}
        <b>{yakinOdev.length} ödevin</b> yarına kadar teslim.
      </React.Fragment>,
    );
  if (!lede.length) lede.push(<React.Fragment key="b">Bugün için bekleyen işin yok. İyi çalışmalar!</React.Fragment>);

  const tarih = `${GUN[simdi.getDay()]}, ${simdi.getDate()} ${AYLAR[simdi.getMonth()]}`;
  const R = 58;
  const CEVRE = 2 * Math.PI * R;
  const oran = q && q.todayGoal > 0 ? Math.min(1, q.todayGoalSolved / q.todayGoal) : 0;
  const bugunDoneSay = bugunGorev.filter((i) => i.doneAt).length;
  const [haftalikPlan, setHaftalikPlan] = useState(false);

  const dueChip = (hw: Homework, st: string) => {
    const day = (hw.dueDate || '').slice(0, 10);
    const saatY = (hw.dueDate || '').slice(11, 16);
    if (st === 'overdue') return { t: 'Gecikti', c: 'bad' };
    if (day === bugun) return { t: `Bugün${saatY && saatY !== '00:00' ? ' ' + saatY : ''}`, c: 'bad' };
    if (day === yarin) return { t: 'Yarın', c: 'warn' };
    const d = parseYmd(day);
    if (!d) return { t: '', c: '' };
    const fark = Math.round((d.getTime() - parseYmd(bugun)!.getTime()) / 86400000);
    return { t: fark < 7 ? GUN[d.getDay()] : `${d.getDate()} ${AYLAR[d.getMonth()].slice(0, 3)}`, c: '' };
  };
  const etutChip = (e: Etut) => {
    if (e.date === bugun) return 'Bugün';
    if (e.date === yarin) return 'Yarın';
    const d = parseYmd(e.date);
    return d ? GUN[d.getDay()] : '';
  };

  const hubKart = sekmeler.length > 0 && (
    <section className="kl-card" aria-label="Bana gelenler" id="ogr-bana-gelenler">
      <div className="kl-card-h">
        <div>
          <h3>Bana gelenler</h3>
          <p>{[can.odev && 'ödev', can.etut && 'etüt', can.mesaj && 'mesaj', 'bildirim'].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' ve $1').replace(/^./, (c) => c.toLocaleUpperCase('tr-TR'))}lerin tek yerde</p>
        </div>
      </div>
      <div className="kl-hubtabs" role="tablist" aria-label="Bölüm" style={{ ['--n' as string]: sekmeler.length }}>
        {sekmeler.map((s) => {
          const Icon = s.icon;
          const y = yeni[s.id as Hub].length;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`ogr-hub-${s.id}`}
              aria-selected={hub === s.id}
              aria-label={y ? `${s.ad} (${y} yeni)` : s.ad}
              className={y ? 'yeni' : undefined}
              onClick={() => sekmeSec(s.id as Hub)}
            >
              <Icon />
              {s.ad}
              <span className="n tnum">{y || s.n}</span>
            </button>
          );
        })}
      </div>

      {hub === 'odev' && can.odev && (
        <div className="kl-hp" role="tabpanel">
          <div className="kl-body">
            {acikOdev.length ? (
              acikOdev.slice(0, 5).map(({ hw, st }) => {
                const c = dueChip(hw, st);
                const acil = c.c === 'bad' || c.c === 'warn';
                const kaynak = Array.isArray(hw.resources) ? hw.resources.length : 0;
                return (
                  <div className="kl-hw" key={hw.id}>
                    <span className={'bar ' + c.c} />
                    <div>
                      <b>
                        <span>{hw.title || 'Ödev'}</span>
                        {yeni.odev.includes(`h:${hw.id}`) && <span className="kl-chip hi">Yeni</span>}
                      </b>
                      <small>{[hw.subject, hw.teacherName ? kisaAd(hw.teacherName) : '', kaynak ? `${kaynak} kaynak` : ''].filter(Boolean).join(' · ')}</small>
                    </div>
                    <span className={'when kl-chip ' + c.c}>{c.t}</span>
                    {acil ? (
                      <button type="button" className="ak-btn sm dark" data-yazma onClick={() => onTeslim(hw)}>
                        Teslim et
                      </button>
                    ) : (
                      <button type="button" className="ak-btn sm" onClick={() => go('homework')}>
                        Aç
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="kl-empty">
                <i>✓</i> Bekleyen ödevin yok.
              </div>
            )}
            {acikOdev.length > 5 && <div className="kl-more">+{acikOdev.length - 5} ödev daha</div>}
          </div>
          <div className="kl-foot">
            <span>{teslimOrani !== null ? <>Bu ay teslim oranın <b>%{teslimOrani}</b></> : 'Bu ay teslim tarihi geçen ödevin yok'}</span>
            <button type="button" className="od-link" onClick={() => go('homework')}>
              Ödevlerim <ArrowRight />
            </button>
          </div>
        </div>
      )}

      {hub === 'etut' && can.etut && (
        <div className="kl-hp" role="tabpanel">
          <div className="kl-body">
            {gelecekEtut.length ? (
              gelecekEtut.slice(0, 4).map((e) => (
                <div className="kl-hw" key={e.id}>
                  <span className={'bar ' + (yeni.etut.includes(`e:${e.id}`) ? 'hi' : 'info')} />
                  <div>
                    <b>
                      <span>{[e.subject || 'Etüt', e.topic].filter(Boolean).join(' · ')}</span>
                      {yeni.etut.includes(`e:${e.id}`) && <span className="kl-chip hi">Yeni</span>}
                    </b>
                    <small>
                      {[
                        `${etutChip(e)}${e.time ? ' ' + e.time : ''}`,
                        e.location,
                        (e.teacherNames && e.teacherNames.length ? e.teacherNames : e.teacherName ? [e.teacherName] : []).map(kisaAd).join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </div>
                  <span className="when kl-chip info">{etutChip(e)}</span>
                  <button type="button" className="ak-btn sm" onClick={() => go('etuts')}>
                    Gör
                  </button>
                </div>
              ))
            ) : (
              <div className="kl-empty">Yaklaşan etüdün yok.</div>
            )}
            {gelecekEtut.length > 4 && <div className="kl-more">+{gelecekEtut.length - 4} etüt daha</div>}
          </div>
          <div className="kl-foot">
            <span>
              Bu ay <b>{etutAy.adet} etüt</b>
              {etutAy.katilim !== null ? (
                <>
                  {' '}
                  · katılım <b>%{etutAy.katilim}</b>
                </>
              ) : null}
            </span>
            <button type="button" className="od-link" onClick={() => go('etuts')}>
              Etütlerim <ArrowRight />
            </button>
          </div>
        </div>
      )}

      {hub === 'mesaj' && can.mesaj && (
        <div className="kl-hp" role="tabpanel">
          <div className="kl-body">
            {cevaplar.length ? (
              cevaplar.slice(0, 3).map((m) => {
                const kim = m.repliedByName || m.toTeacherName || 'Öğretmenin';
                return (
                  <div className="kl-ann" key={m.id}>
                    <span className="av">{akBasHarf(kim)}</span>
                    <div>
                      <b>{kisaAd(kim)}</b> · {m.subject || 'Sorun'} {yeni.mesaj.includes(`m:${m.id}:${m.repliedAt || ''}`) && <span className="kl-chip hi">Yeni</span>}
                      <p>{m.teacherReply}</p>
                    </div>
                    <small>{once(m.repliedAt || m.createdAt)}</small>
                  </div>
                );
              })
            ) : (
              <div className="kl-empty">Son 30 günde cevaplanan sorun yok.</div>
            )}
          </div>
          <div className="kl-foot">
            <span>Takıldığın soruyu öğretmenine sor</span>
            <button type="button" className="od-link" onClick={() => go('messages')}>
              Mesajlarım <ArrowRight />
            </button>
          </div>
        </div>
      )}

      {hub === 'bild' && (
        <div className="kl-hp" role="tabpanel">
          <div className="kl-body">
            {bildirimler.length ? (
              bildirimler.slice(0, 3).map((b) => (
                <div className="kl-ann" key={b.id}>
                  <span className={'av ' + b.tur}>{akBasHarf(b.kim)}</span>
                  <div>
                    <b>{b.kim === 'Bildirim' ? b.ust : kisaAd(b.kim)}</b>
                    {b.kim !== 'Bildirim' ? ` · ${b.ust}` : ''}
                    <p>{b.metin}</p>
                  </div>
                  <small>{once(b.at)}</small>
                </div>
              ))
            ) : (
              <div className="kl-empty">Son 14 günde bildirim yok.</div>
            )}
          </div>
          <div className="kl-foot">
            <span>Son {SON_GUN} gün</span>
            <button type="button" className="od-link" onClick={onOpenNotifications}>
              Tüm bildirimler <ArrowRight />
            </button>
          </div>
        </div>
      )}
    </section>
  );

  const programKart = can.ders && program && (
    <section className="kl-card" aria-label="Bugünkü ders programım">
      <div className="kl-card-h">
        <div>
          <h3>Bugünkü ders programım</h3>
          <p>
            {GUN[simdi.getDay()]}
            {program.tatil ? ' · tatil' : program.dersSay ? ` · ${program.dersSay} ders${program.etutSay ? ` ve ${program.etutSay} etüt` : ''}` : program.etutSay ? ` · ${program.etutSay} etüt` : ' · ders yok'}
          </p>
        </div>
        <button type="button" className="od-link" onClick={() => go('grades')}>
          Haftalık program <ArrowRight />
        </button>
      </div>
      {program.tatil ? (
        <div className="kl-dp">
          <div className="tatil">
            Bugün tatil{program.tatil.aciklama ? `: ${program.tatil.aciklama}` : ''}. İyi dinlenmeler!
          </div>
        </div>
      ) : program.satirlar.length ? (
        <div className="kl-dp" style={{ paddingBottom: 'calc(0.75 * var(--ak-rem))' }}>
          {program.satirlar.map((r) =>
            r.tur === 'ogle' ? (
              <div className="r ogle" key={r.k}>
                <span className="no" />
                <span className="sa">{r.bas}</span>
                <span className="ds">
                  <small>{r.alt}</small>
                </span>
                <span />
              </div>
            ) : (
              <div className={'r' + (r.tur === 'etut' ? ' et' : '') + (r.durum ? ' ' + r.durum : '')} key={r.k}>
                <span className="no">{r.no}</span>
                <span className="sa">
                  {r.bas}
                  {r.bit && <em>{r.bit}</em>}
                </span>
                <span className="ds">
                  <b>{r.ad}</b>
                  {r.alt && <small>{r.alt}</small>}
                </span>
                {r.chip ? <span className={'kl-chip ' + r.chip.c}>{r.chip.t}</span> : <span />}
              </div>
            ),
          )}
        </div>
      ) : (
        <div className="kl-dp">
          <div className="tatil">Bugün dersin yok.</div>
        </div>
      )}
      <div className="kl-foot">
        {devam ? (
          <>
            <span>
              Devamsızlık <b>{devam.gun} gün</b>
              {program.sinir > 0 ? ` · sınır ${program.sinir}` : ''}
            </span>
            {program.sinir > 0 &&
              (devam.gun >= program.sinir ? (
                <span className="kl-chip bad">Sınır aşıldı</span>
              ) : program.sinir - devam.gun <= Math.max(1, program.kala) ? (
                <span className="kl-chip warn">Sınıra {program.sinir - devam.gun} gün</span>
              ) : (
                <span className="kl-chip ok">Sorun yok</span>
              ))}
          </>
        ) : (
          <span>Ders yoklaması öğretmenlerin tarafından alınır</span>
        )}
      </div>
    </section>
  );

  // ---- Bu hafta çubukları (taslaktaki ölçü: çubuk alanı ~96 px; kesik çizgi günlük hedef)
  const ALAN = 96;
  const enCok = hafta ? Math.max(1, hafta.hedef, ...hafta.gunler.map((g) => g.count)) : 1;
  const yuk = (n: number) => Math.max(4, Math.round((n / enCok) * ALAN));
  const haftaKart = hafta && (
    <section className="kl-card" aria-label="Bu hafta">
      <div className="kl-card-h">
        <div>
          <h3>Bu hafta</h3>
          <p>Günlük soru sayın{hafta.hedef ? ' · kesik çizgi günlük hedef' : ''}</p>
        </div>
        <button type="button" className="od-link" onClick={() => go('questions')}>
          Soru sayım <ArrowRight />
        </button>
      </div>
      <div className="kl-bars7" aria-label={`Bu hafta ${hafta.toplam} soru`}>
        {hafta.hedef > 0 && (
          <div className="kl-goal" style={{ bottom: `calc(${(20 + yuk(hafta.hedef)) / 16} * var(--ak-rem))` }}>
            <span className="tnum">{fmt(hafta.hedef)}</span>
          </div>
        )}
        {hafta.gunler.map((g) => {
          const gelecek = g.ymd > bugun;
          const cls = g.ymd === bugun && !(g.goal > 0 && g.count >= g.goal) ? 'today' : g.goal > 0 && g.count >= g.goal ? 'ok' : g.count > 0 ? 'az' : '';
          return (
            <div className="b" key={g.ymd} title={`${g.count} soru${g.goal ? ` · hedef ${g.goal}` : ''}`}>
              <em className={'tnum' + (gelecek || !g.count ? ' z' : '')}>{gelecek || !g.count ? '—' : fmt(g.count)}</em>
              <i className={cls} style={{ height: `calc(${(gelecek || !g.count ? 4 : yuk(g.count)) / 16} * var(--ak-rem))` }} />
              <small className={g.ymd === bugun ? 't' : undefined}>{g.gun}</small>
            </div>
          );
        })}
      </div>
      <div className="kl-foot">
        <span>
          Toplam <b>{fmt(hafta.toplam)} soru</b>
          {hafta.gunler.some((g) => g.goal > 0) ? (
            <>
              {' '}
              · hedef tutulan <b>{hafta.tutulan} gün</b>
            </>
          ) : null}
        </span>
        {hafta.seri >= 2 && (
          <span className="kl-chip warn">
            <Flame /> {hafta.seri} gün art arda
          </span>
        )}
      </div>
    </section>
  );

  const netFark = deneme && deneme.net !== null && deneme.prevNet !== null ? Math.round((deneme.net - deneme.prevNet) * 100) / 100 : null;
  const denemeKart = can.deneme && deneme !== undefined && (
    <section className="kl-card" aria-label="Son denemem">
      <div className="kl-card-h">
        <div>
          <h3>Son denemem</h3>
          <p>{deneme ? `${deneme.name}${deneme.date ? ` · ${parseYmd(deneme.date)?.getDate()} ${AYLAR[parseYmd(deneme.date)?.getMonth() ?? 0]}` : ''}` : 'Sonucun açıklanınca burada görünür'}</p>
        </div>
        <button type="button" className="od-link" onClick={() => go('deneme')}>
          Karnem <ArrowRight />
        </button>
      </div>
      {deneme ? (
        <div className="kl-dn2">
          <div className="kl-net">
            <b className="tnum">{deneme.net !== null ? fmtNet(deneme.net) : '—'}</b>
            <span>
              toplam net{' '}
              {netFark !== null && (
                <em className={netFark >= 0 ? 'up' : 'dn'}>
                  {netFark >= 0 ? '↑' : '↓'} {fmtNet(Math.abs(netFark))}
                </em>
              )}
            </span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="kl-sec-l" style={{ marginTop: 0 }}>
              Çalışman gereken kazanımlar
            </div>
            {deneme.weak.length ? (
              deneme.weak.map((w) => (
                <div className="kl-kz" key={w.key}>
                  <span title={w.label}>{w.label}</span>
                  <span className="tr">
                    <i style={{ width: `${Math.max(4, Math.min(100, w.rate))}%` }} />
                  </span>
                  <span className="v tnum">%{w.rate}</span>
                </div>
              ))
            ) : (
              <div className="kl-empty" style={{ paddingTop: 'calc(0.5 * var(--ak-rem))' }}>
                <i>✓</i> Zayıf kazanımın görünmüyor.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="kl-empty">Henüz açıklanmış deneme sonucun yok.</div>
      )}
      <div className="kl-foot">
        <span>{deneme && deneme.prevNet !== null ? <>Önceki deneme <b>{fmtNet(deneme.prevNet)}</b> net</> : 'Önceki deneme yok'}</span>
        {deneme && (
          <button type="button" className="od-link" onClick={onOpenStudyPlan}>
            Çalışma planı <ArrowRight />
          </button>
        )}
      </div>
    </section>
  );

  const heroSol = can.soru && q;
  const heroSag = can.plan && !preview;

  return (
    <AnaSayfaKabuk
      currentTeacher={null}
      menu={menu}
      onNavigate={() => undefined}
      tema="odak"
      sinif="ak-kl ak-ogr"
      overlay={
        <AkSheet
          open={haftalikPlan}
          onClose={() => setHaftalikPlan(false)}
          kicker="Çalışma planı"
          title="Haftalık planım"
          desc={plan?.sentBy ? `${plan.sentBy} tarafından hazırlandı` : undefined}
          footer={
            <>
              <span />
              <button type="button" className="ak-btn w-24" onClick={() => setHaftalikPlan(false)}>
                Kapat
              </button>
            </>
          }
        >
          {haftalikPlan && (
            <Suspense fallback={null}>
              <StudentTodayPlan />
            </Suspense>
          )}
        </AkSheet>
      }
    >
      <div className="od-hero">
        <div>
          <div className="od-eyebrow">
            {tarih}
            {student.className ? ` · ${student.className}` : ''}
            {student.studentNumber ? ` · No ${student.studentNumber}` : ''}
          </div>
          <h1>
            {selam} <em>{ilkAd(student.name)}</em>
          </h1>
          <p className="od-lede">{lede}</p>
        </div>
        {can.soru && (
          <div className="kl-acts">
            {hafta && hafta.seri >= 2 && (
              <span className="kl-chip warn lg">
                <Flame /> {hafta.seri} gündür çalışıyorsun
              </span>
            )}
            <button type="button" className="ak-btn dark ogr-soru" onClick={soruGir} data-yazma>
              <Plus /> Soru gir
            </button>
          </div>
        )}
      </div>

      {(heroSol || heroSag) && (
        <section className={'kl-ink' + (heroSol && heroSag ? '' : ' tek')} aria-label="Bugün">
          {heroSol && q && (
            <div className="kl-today">
              <div className={'kl-ring' + (goalDone ? ' tamam' : '')} aria-label={q.todayGoal > 0 ? `${q.todayGoalSolved} / ${q.todayGoal} soru` : `${bugunCozulen} soru`}>
                <svg viewBox="0 0 138 138" aria-hidden="true">
                  <circle className="bg" cx="69" cy="69" r={R} />
                  {q.todayGoal > 0 && <circle className="fgc" cx="69" cy="69" r={R} strokeDasharray={CEVRE.toFixed(1)} strokeDashoffset={(CEVRE * (1 - oran)).toFixed(1)} />}
                </svg>
                <div className="c">
                  <div>
                    <b className="tnum">{fmt(q.todayGoal > 0 ? q.todayGoalSolved : bugunCozulen)}</b>
                    <small>{q.todayGoal > 0 ? `/ ${fmt(q.todayGoal)} soru` : 'soru bugün'}</small>
                  </div>
                </div>
              </div>
              <div>
                <div className="k">{q.todayGoal > 0 ? 'Bugünün hedefi' : 'Bugün'}</div>
                <h2 style={{ fontSize: 'calc(2.125 * var(--ak-rem))' }}>{q.todayGoal > 0 ? (goalDone ? 'Hedef tamam' : `${fmt(kalan)} soru kaldı`) : bugunCozulen ? `${fmt(bugunCozulen)} soru çözdün` : 'Hedefin yok'}</h2>
                <div className="sub">
                  {bugunDersler.length
                    ? `${bugunDersler
                        .slice(0, 3)
                        .map(([d, n]) => `${d} ${fmt(n)}`)
                        .join(' · ')}${bugunDersler.length > 3 ? ` · +${bugunDersler.length - 3} ders` : ''} girdin`
                    : 'Bugün henüz soru girmedin'}
                </div>
                <div className="row">
                  <button type="button" className="ak-btn light" onClick={soruGir} data-yazma>
                    <Plus /> Soru gir
                  </button>
                  <button type="button" className="ak-btn ghost" onClick={() => go('questions')}>
                    Soru sayım
                  </button>
                </div>
              </div>
            </div>
          )}
          {heroSag && (
            <div className={heroSol ? 'right' : undefined}>
              <div className="rh">
                <span>Bugünkü planım</span>
                <span>{bugunGorev.length ? `${bugunDoneSay} / ${bugunGorev.length} yapıldı` : ''}</span>
              </div>
              {plan === null ? (
                <div className="nil">Plan okunuyor…</div>
              ) : bugunGorev.length ? (
                <>
                  {bugunGorev.slice(0, 4).map((it) => (
                    <button type="button" className={'kl-chk' + (it.doneAt ? ' done' : '')} key={it.id} onClick={() => void isaretle(it)} aria-pressed={!!it.doneAt} data-yazma>
                      <span className="bx">{it.doneAt && <Check />}</span>
                      <span>
                        {[it.book, it.note].filter(Boolean).join(' · ') || it.subject}
                        {it.questionCount > 0 ? ` · ${it.questionCount} soru` : ''}
                      </span>
                      <small>{it.subject}</small>
                    </button>
                  ))}
                  {bugunGorev.length > 4 && <div className="nil">+{bugunGorev.length - 4} görev daha · Haftalık planda</div>}
                </>
              ) : (
                <div className="nil">{plan.items.length ? 'Bugün için plan görevin yok.' : 'Öğretmenin plan gönderince bugünkü görevlerin burada görünür.'}</div>
              )}
              {planMsg && <div className={'msg' + (planMsg.err ? ' err' : '')}>{planMsg.t}</div>}
              {plan && plan.items.length > 0 && (
                <div className="rh mt">
                  <span>{geciken ? `Geçen günlerden ${geciken} görev kaldı` : plan.sentBy ? `Plan ${kisaAd(plan.sentBy)} tarafından hazırlandı` : 'Haftalık plan'}</span>
                  <button type="button" className="lnk" onClick={() => setHaftalikPlan(true)}>
                    Haftalık plan <ArrowRight />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {(hubKart || programKart) && <div className={'kl-grid2' + (hubKart && programKart ? '' : ' n1')}>{hubKart}{programKart}</div>}
      {(haftaKart || denemeKart) && <div className={'kl-grid2' + (haftaKart && denemeKart ? '' : ' n1')}>{haftaKart}{denemeKart}</div>}
      {ek}
    </AnaSayfaKabuk>
  );
};

/** Cevaplanan sorular: son 30 gün */
function tazeOrAy(iso?: string) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) && t >= Date.now() - 30 * 86400000;
}
