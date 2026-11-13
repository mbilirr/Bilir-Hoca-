import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BarChart3, Bell, BookOpen, CalendarDays, Check, Eye, HelpCircle, MessageSquare, MoreHorizontal, Plus, UserPlus } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { ClassGroup, Etut, Homework, HomeworkSubmission, Student, StudentMessage, StudentQuestionLog, TeacherTabType } from '../../types';
import type { Teacher } from '../../types';
import {
  Bekleyen,
  GUN_ADLARI,
  GUN_KISA,
  HaftaHucre,
  HaftaVeri,
  bekleyenlerim,
  dersCanliDinle,
  gunEkle,
  haftaBasi,
  haftaOku,
  isoGun,
  tarihUzun,
  trBugun,
  trSaat,
} from '../../services/dersService';
import { denemeTarihleri, lastExamBrief } from '../../services/denemeService';
import { baslik, etkinlikler, siniflarYazi } from '../../services/akademikTakvimService';
import { useAkademikKayitlar } from '../Teacher/HaftaninFaaliyetleri';
import { dakika, basHarf } from '../../lib/dersKisa';
import { etutEndTime, isEtutAttendanceMissing } from '../../lib/etutTiming';
import { enablePush, getPushState, resyncPush, testPush, type PushState } from '../../lib/push';
import { pushOptInErtele, pushOptInErtelendi } from '../Common/PushOptInCard';
import { useSeenIds } from '../../lib/useSeenIds';
import { givenNamesOf } from '../../lib/greeting';
import { setQuickFocus } from '../../lib/quickFocus';
import { AnaSayfaKabuk, akSelam } from './AnaSayfaKabuk';
import './ogretmen.css';

// ============================================================================
// Aşama 248: ÖĞRETMEN ANA SAYFASI (taslak: "ogretmen 2.html", Odak renkleri)
// Kimde: derse giren öğretmen (rolü Öğretmen / Zümre Başkanı ya da rol yetkisi kapalı kurumda yönetici olmayan öğretmen);
//   kurum yöneticisi Öğretmen portalında. İdare, Rehberlik, Ölçme ve yalnız Etüt Öğretmeni bu sayfayı görmez.
// Günün tek odağı "Şimdi" kartı (ders sürüyor / sıradaki / yarın / tatil / ders programı yoksa etüt), yeni gelenler,
// sizi bekleyenler (yoklama, etüt yoklaması, ödev kontrolü, mesaj), bugün ders dışında, ödevlerim, bu hafta.
// KURAL (12 Kas, Mustafa): yalnız kurumun AÇIK bölümleri. Dersler kapalıysa ders kartı / ders yoklaması / tatil yok;
//   Etütler, Ödevler, Soru takibi, Mesajlar, Deneme, Akademik takvim kapalıysa o parçalar hiç çizilmez.
// Kaynaklar (ilgili sayfayla aynı): ders_programi_hafta (Dersler › Programım), ders_bekleyenlerim, etüt / ödev / teslim /
//   mesaj / soru kayıtları (dataService, ilgili sayfalarla aynı süzgeç), deneme_exams, akademik takvim.
// Senkron: ders tabloları canlı; diğer kayıtlar dataService bildirimiyle; saat her dakika ilerler; 5 dakikada bir ve
//   sekmeye dönünce sunucudan yeniden okunur.
// ============================================================================

const DersYoklamaModal = lazy(() => import('../Teacher/DersYoklamaModal').then((m) => ({ default: m.DersYoklamaModal })));
const EtutAttendanceModal = lazy(() => import('../Teacher/EtutAttendanceModal').then((m) => ({ default: m.EtutAttendanceModal })));

type Go = (tab: TeacherTabType, focus?: Parameters<typeof setQuickFocus>) => void;

interface Props {
  currentTeacher: Teacher | null;
  students: Student[];
  classes: ClassGroup[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  etuts: Etut[];
  messages: StudentMessage[];
  unreadMessages: number;
  onNavigateTab: (tab: TeacherTabType) => void;
  onOpenStudentView?: () => void;
}

// ---------------------------------------------------------------- küçük yardımcılar
const trSirala = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });
const gunNo = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
};
const gunFark = (eski: string, yeni: string) => gunNo(yeni) - gunNo(eski);
const sure = (dk: number) => {
  const d = Math.max(0, Math.round(dk));
  if (d < 60) return `${d} dk`;
  const s = Math.floor(d / 60);
  const k = d % 60;
  return k ? `${s} sa ${k} dk` : `${s} sa`;
};
const ymdYerel = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Aşama 251: ders adı ile branş eşleşmesi (büyük/küçük harf ve boşluk farkı yok; "Matematik" ~ "TYT Matematik")
const dersNorm = (x: string) => (x || '').toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '');
const dersUyar = (a: string, b: string) => {
  const x = dersNorm(a);
  const y = dersNorm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const etutBas = (e: Etut): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.date || '');
  const t = /^(\d{1,2}):(\d{2})/.exec(e.time || '');
  if (!m || !t) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
};
const ogrSayi = (e: Etut, toplam: number) => (e.assignedStudentIds === 'all' ? toplam : e.assignedStudentIds.length);
const gunYazi = (t: string) => `${GUN_ADLARI[isoGun(t) - 1]}, ${tarihUzun(t)}`;
const yasYazi = (n: number) => (n <= 0 ? 'Bugün' : `${n} gün`);

// ---------------------------------------------------------------- telefon bildirimi satırı
// PushOptInCard ile aynı kurallar ve aynı "şimdi değil" kaydı (7 gün); görünüm taslaktaki tek satır.
const BildirimNotu: React.FC<{ yazi: string }> = ({ yazi }) => {
  const [st, setSt] = useState<PushState | null>(null);
  const [gizli, setGizli] = useState(pushOptInErtelendi);
  const [mesgul, setMesgul] = useState(false);
  const [sonuc, setSonuc] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let canli = true;
    void getPushState().then((s) => {
      if (!canli) return;
      setSt(s);
      if (s === 'on') void resyncPush();
    });
    return () => {
      canli = false;
    };
  }, []);
  useEffect(() => {
    if (!sonuc) return;
    const t = setTimeout(() => setSonuc(null), 6000);
    return () => clearTimeout(t);
  }, [sonuc]);
  if (!st || st === 'unsupported' || st === 'not-configured') return null;
  if (st === 'on') {
    return sonuc ? (
      <div className="od-note ok" role="status">
        <span className="ic">
          <Check aria-hidden="true" />
        </span>
        <span>{sonuc.text}</span>
      </div>
    ) : null;
  }
  if (gizli) return null;
  const ertele = () => {
    pushOptInErtele();
    setGizli(true);
  };
  const ac = async () => {
    setMesgul(true);
    const r = await enablePush();
    setMesgul(false);
    if (r.ok) {
      setSt('on');
      setSonuc({ ok: true, text: 'Telefon bildirimleri açıldı. Bir deneme bildirimi gönderildi.' });
      void testPush();
    } else {
      setSt(await getPushState());
      setSonuc({ ok: false, text: r.error || 'Bildirimler açılamadı.' });
    }
  };
  const metin =
    st === 'ios-install'
      ? 'iPhone’da önce Safari’de Paylaş › Ana Ekrana Ekle’yi seçin; ana ekrandaki simgeden açınca bildirimleri buradan açabilirsiniz.'
      : st === 'denied'
        ? 'Bu cihazda bildirim izni kapalı. Telefon ayarlarından izin verip sayfayı yenileyin.'
        : yazi;
  return (
    <div className="od-note" id="push-optin" data-state={st}>
      <span className="ic">
        <Bell aria-hidden="true" />
      </span>
      <span>
        {metin}
        {sonuc && !sonuc.ok && (
          <b role="status" style={{ display: 'block', color: 'var(--danger-fg)', fontSize: '0.75rem', marginTop: '0.125rem' }}>
            {sonuc.text}
          </b>
        )}
      </span>
      {st === 'off' && (
        <button type="button" className="ak-btn w-24 primary" id="push-enable" disabled={mesgul} onClick={() => void ac()}>
          {mesgul ? 'Açılıyor…' : 'Aç'}
        </button>
      )}
      <button type="button" className="x" aria-label="Şimdi değil" title="Şimdi değil (7 gün sonra tekrar sorulur)" onClick={ertele}>
        ×
      </button>
    </div>
  );
};

// ============================================================================
export const OgretmenAnaSayfa: React.FC<Props> = ({
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
}) => {
  // ---- izinler (bölüm kapalı / açık değişince yeniden hesaplanır)
  const [tick, setTick] = useState(0);
  const [soruKayit, setSoruKayit] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());
  useEffect(
    () =>
      dataService.subscribe(() => {
        setTick((t) => t + 1);
        setSoruKayit(dataService.getQuestionLogs());
      }),
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
      takvim: dataService.canUseTab('akademik_takvim'),
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
    const yenile = () => document.visibilityState === 'visible' && void okuDers();
    const t = setInterval(yenile, 5 * 60_000);
    document.addEventListener('visibilitychange', yenile);
    const kapat = dersCanliDinle(kurumId, ['ders_yoklama_oturum', 'ders_programi', 'kurum_ders_ayar', 'kurum_ders_tatil', 'ders_vekil'], () => void okuDers());
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', yenile);
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
  }, [can.deneme, pzt, paz]);

  // Akademik takvim (yalnız bölüm açık kurumda)
  const takvimKayit = useAkademikKayitlar(can.takvim);
  const takvim = useMemo(() => etkinlikler(takvimKayit || []).filter((g) => g.tarih >= pzt && g.tarih <= paz), [takvimKayit, pzt, paz]);

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
          btn: can.takvim ? { yazi: 'Takvim', on: () => go('akademik_takvim') } : { yazi: 'Programım', on: () => go('grades') },
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
      for (const g of takvim.filter((x) => x.tarih === bugun)) {
        l.push({
          k: `a|${g.key}`,
          saat: '',
          tur: 'akt',
          b: baslik(g.ad),
          alt: siniflarYazi(g.siniflar),
          etiket: 'Takvim',
          gecti: false,
          on: () => go('akademik_takvim'),
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
  }, [can.takvim, can.deneme, takvim, bugun, denemeler, etutBugun, simdi, students.length, benimOdev, yerelBugun, odevDurum, go]);
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
  type HaftaOlay = { k: string; tur: 'etut' | 'odev' | 'den' | 'akt' | 'tatil'; yazi: string };
  const haftaGunleri = useMemo(() => {
    const gunler = Array.from({ length: 7 }, (_, i) => gunEkle(pzt, i));
    return gunler.map((g) => {
      const l: HaftaOlay[] = [];
      if (dersHazir && tatilMap.has(g)) l.push({ k: 't', tur: 'tatil', yazi: tatilMap.get(g) || 'Tatil' });
      if (can.takvim) for (const a of takvim.filter((x) => x.tarih === g)) l.push({ k: `a|${a.key}`, tur: 'akt', yazi: baslik(a.ad) });
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

  return (
    <AnaSayfaKabuk currentTeacher={currentTeacher} unreadMessages={unreadMessages} onNavigate={onNavigateTab} tema="odak" sinif="ak-ogrt" overlay={katman}>
      {/* ===== Selamlama ===== */}
      <div className="od-hero">
        <div>
          <div className="od-eyebrow">
            {gunYazi(bugun)}
            {brans ? ` · ${brans}` : ''}
          </div>
          <h1>
            {selam} {ad && <em>{ad}</em>} Öğretmenim
          </h1>
          <p className="od-lede">{lede}</p>
        </div>
        <div className="og-acts">
          {can.odevVer && (
            <button type="button" className="ak-btn w-24 primary" id="home-action-homework" onClick={() => go('homework', ['action', 'homework-create', ''])}>
              <Plus aria-hidden="true" />
              Ödev
            </button>
          )}
          {can.etutPlan && (
            <button type="button" className="ak-btn w-24" id="home-action-etut" onClick={() => go('etuts', ['action', 'etut-create', ''])}>
              <Plus aria-hidden="true" />
              Etüt
            </button>
          )}
          {onOpenStudentView && (
            <button type="button" className="od-iconbtn" aria-label="Öğrenci görünümünü incele" title="Öğrenci görünümünü incele" onClick={onOpenStudentView}>
              <Eye aria-hidden="true" />
            </button>
          )}
          {menuIsleri.length > 0 && (
            <div className="og-menu" ref={menuRef}>
              <button type="button" className="od-iconbtn" aria-label="Diğer işler" title="Diğer işler" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <MoreHorizontal aria-hidden="true" />
              </button>
              {menu && (
                <div className="og-pop" role="menu">
                  {menuIsleri.map((m) => (
                    <button
                      key={m.k}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        m.on();
                      }}
                    >
                      <m.ikon aria-hidden={true} />
                      {m.yazi}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(can.ders || can.etut || can.mesaj) && (
        <BildirimNotu
          yazi={can.ders || can.etut ? 'Yoklamayı unutursanız telefonunuza hatırlatma gelsin mi?' : 'Öğrenci mesajları telefonunuza bildirim olarak gelsin mi?'}
        />
      )}

      {/* ===== Şimdi: günün tek odağı ===== */}
      {kart && (
        <article className={`og-now ${kart.cls}${kart.periods && bugunDersler.length ? '' : ' tek'}`} aria-label="Şu an" id="home-now">
          <div>
            <div className="eye">
              {kart.live && <span className="og-live" aria-hidden="true" />}
              <span>{kart.eye}</span>
            </div>
            <h3>{kart.title}</h3>
            <div className="meta tnum">{kart.meta}</div>
            {kart.prog !== null && (
              <div className="og-prog" aria-hidden="true">
                <i style={{ transform: `scaleX(${kart.prog})` }} />
              </div>
            )}
            <div className="og-now-row">
              {kart.btn && (
                <button type="button" className="ak-btn on-ink" onClick={kart.btn.on}>
                  {kart.btn.yazi}
                </button>
              )}
              <span className="rem tnum">{kart.rem}</span>
            </div>
          </div>
          {kart.periods && bugunDersler.length > 0 && (
            <div className="og-periods" aria-label="Bugünkü derslerim">
              <div className="ttl">
                <span>Bugünkü derslerim</span>
                <span className="tnum">{dersSayi} ders</span>
              </div>
              {bugunDersler.map((h) => {
                const d = durumOf(h);
                const s = h.oturum?.sayilar || {};
                const yok = (s.absent || 0) + (s.excused || 0);
                return (
                  <div key={`${h.classId}|${h.sira}`} className={`og-pr ${d}`}>
                    <span className="tnum">{h.sira}</span>
                    <span className="tnum">{saatOf(h.sira).bas}</span>
                    <b title={`${h.classAd} ${h.ders}`}>
                      {h.classAd} <small>{h.ders}</small>
                      {h.benimVekil && <span className="vk">V</span>}
                    </b>
                    {d === 'miss' ? (
                      <button type="button" onClick={() => setDersHedef({ classId: h.classId, tarih: h.tarih, sira: h.sira })}>
                        Yoklama al
                      </button>
                    ) : (
                      <span className="st">
                        {d === 'ok' ? `✓ Alındı${yok ? ` · ${yok} yok` : ''}` : d === 'cur' ? 'Şimdi' : d === 'vk' ? `Vekil: ${basHarf(h.vekilAd)}` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </article>
      )}

      {/* Aşama 250: iki sütun dengeli — solda Sizi bekleyenler + Ödevlerim, sağda Bugün ders dışında + Öğrencilerden */}
      {(isKarti || can.odev || disKarti || akisKarti) && (
        <div className={(isKarti || can.odev) && (disKarti || akisKarti) ? 'od-grid2' : ''}>
          {(isKarti || can.odev) && (
            <div className="og-col">
              {isKarti && (
                <section className="od-card" aria-labelledby="og-h-bek">
                  <div className="od-card-h">
                    <div>
                      <h2 id="og-h-bek">
                        Sizi bekleyenler <span className={`og-count${isler.length ? '' : ' ok'}`}>{isler.length}</span>
                      </h2>
                      <p>Geciken ya da unutulan işler · yapınca kendiliğinden kaybolur</p>
                    </div>
                  </div>
                  {isler.length ? (
                    <>
                      <ul className="og-todo">
                        {gorunenIsler.map((x) => (
                          <li key={x.k}>
                            <span className={`bar${x.uyari ? ' w' : ''}`} />
                            <span className="t">
                              <b title={x.baslik}>{x.baslik}</b>
                              <span title={x.alt}>{x.alt}</span>
                            </span>
                            <span className={`age${x.uyari ? ' w' : ''}`}>{yasYazi(x.yas)}</span>
                            <button type="button" className={`ak-btn w-24${x.uyari ? '' : ' primary'}`} onClick={x.on}>
                              {x.btn}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {isler.length > 5 && (
                        <button type="button" className="od-link og-more" onClick={() => setTumIsler((v) => !v)}>
                          {tumIsler ? 'Daha az göster' : `+${isler.length - 5} iş daha`}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="og-empty">
                      <span className="ok">
                        <Check aria-hidden="true" />
                      </span>
                      <b>Her şey yolunda</b>
                      Bekleyen işiniz kalmadı. İyi dersler!
                    </div>
                  )}
                </section>
              )}

              {/* ===== Ödevlerim ===== */}
              {can.odev && (
                <section className="od-card" aria-labelledby="og-h-odev">
                  <div className="od-card-h">
                    <div>
                      <h2 id="og-h-odev">Ödevlerim</h2>
                      <p>
                        {odevlerim.aktif ? `Aktif ${odevlerim.aktif} ödev` : 'Aktif ödeviniz yok'}
                        {odevlerim.oran !== null ? ` · teslim oranı %${odevlerim.oran}` : ''}
                      </p>
                    </div>
                    <button type="button" className="od-link" onClick={() => go('homework')}>
                      Ödevler
                      <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                  {odevlerim.liste.length ? (
                    <>
                      <ul className="og-hw">
                        {odevlerim.liste.map((h) => {
                          const d = odevDurum.get(h.id) || { exp: 0, kontrol: 0, teslim: 0, teslimTum: 0, isaretsiz: 0, siniflar: '' };
                          const gecti = odevGun(h) < yerelBugun;
                          const yuz = (n: number) => (d.exp ? `${Math.min(100, (n / d.exp) * 100)}%` : '0%');
                          return (
                            <li key={h.id}>
                              <button type="button" onClick={() => go('homework', ['homework', h.id, h.title])}>
                                <span style={{ minWidth: 0 }}>
                                  <b title={h.title}>{h.title}</b>
                                  <span className={`s${gecti ? ' bad' : ''}`}>
                                    {[d.siniflar, sonGunYazi(h), gecti && d.isaretsiz ? `${d.isaretsiz} işaretlenmedi` : ''].filter(Boolean).join(' · ')}
                                  </span>
                                </span>
                                <span className="og-bar2" aria-label={`${d.exp} öğrenciden ${d.kontrol} kontrol edildi, ${d.teslim} teslim edildi`}>
                                  <i className="a" style={{ width: yuz(d.kontrol) }} />
                                  <i className="b" style={{ width: yuz(d.teslim) }} />
                                </span>
                                <span className="n tnum">
                                  {d.kontrol + d.teslim}/{d.exp}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="og-legend" aria-hidden="true">
                        <span>
                          <i className="a" />
                          Kontrol edildi
                        </span>
                        <span>
                          <i className="b" />
                          Teslim edildi
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="od-empty">
                      <i>✓</i>
                      Teslimi süren ödeviniz yok.
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {(disKarti || akisKarti) && (
            <div className="og-col">
              {disKarti && (
                <section className="od-card" aria-labelledby="og-h-dis">
                  <div className="od-card-h">
                    <div>
                      <h2 id="og-h-dis">Bugün ders dışında</h2>
                      <p>Saat sırasıyla</p>
                    </div>
                  </div>
                  {disOlay.length ? (
                    <ol className="og-tl">
                      {disOlay.map((o, i) => (
                        <React.Fragment key={o.k}>
                          {i === cizgiOnce && (
                            <li className="nowline" aria-label={`Şu an ${simdiHm}`}>
                              <span className="tnum">{simdiHm}</span>
                              <i />
                            </li>
                          )}
                          <li className={o.gecti ? 'gecti' : undefined}>
                            <span className="h tnum">{o.saat || 'Gün'}</span>
                            <span className="node">
                              <i className={o.tur} />
                            </span>
                            <button type="button" className="x" onClick={o.on}>
                              <b>{o.b}</b>
                              {o.alt && <span>{o.alt}</span>}
                            </button>
                            <span className={`og-tag ${o.tur}`}>{o.etiket}</span>
                          </li>
                        </React.Fragment>
                      ))}
                    </ol>
                  ) : (
                    <div className="od-empty">
                      <i>✓</i>
                      Bugün ders dışında planlı işiniz yok.
                    </div>
                  )}
                </section>
              )}

              {/* ===== Öğrencilerden (Aşama 250) ===== */}
              {akisKarti && (
                <section className="od-card" aria-labelledby="og-h-akis" id="home-ogrencilerden">
                  <div className="od-card-h">
                    <div>
                      <h2 id="og-h-akis">Öğrencilerden {akisYeni > 0 && <span className="og-count hi">{akisYeni} yeni</span>}</h2>
                      <p>Son 3 gün · {[can.odev && 'teslim', can.soru && can.odev && 'branşınızda soru', can.mesaj && 'mesaj'].filter(Boolean).join(', ')}</p>
                    </div>
                    {akisYeni > 0 && (
                      <button
                        type="button"
                        className="od-link"
                        onClick={() => {
                          teslimGoruldu(yeniTeslimler);
                          soruGoruldu(akis.flatMap((a) => (a.tur === 'soru' && a.ids ? a.ids : [])));
                        }}
                      >
                        Hepsini gördüm
                      </button>
                    )}
                  </div>
                  {akis.length ? (
                    <>
                      <ul className="og-feed">
                        {(tumAkis ? akis : akis.slice(0, 5)).map((a) => (
                          <li key={a.k}>
                            <button type="button" onClick={a.on}>
                              <span className={`ic ${a.tur}`}>
                                {a.tur === 'teslim' ? (
                                  <BookOpen aria-hidden="true" />
                                ) : a.tur === 'soru' ? (
                                  <HelpCircle aria-hidden="true" />
                                ) : (
                                  <MessageSquare aria-hidden="true" />
                                )}
                              </span>
                              <span className="t">
                                <b title={a.ad}>{a.ad}</b>
                                <span title={a.alt}>{a.alt}</span>
                              </span>
                              <span className="tm tnum">
                                {a.yeni && <i aria-label="yeni" />}
                                {once(a.t)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {akis.length > 5 && (
                        <button type="button" className="od-link og-more" onClick={() => setTumAkis((v) => !v)}>
                          {tumAkis ? 'Daha az göster' : `+${akis.length - 5} kayıt daha`}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="od-empty">
                      <i>✓</i>
                      Son 3 günde öğrencilerden yeni bir şey gelmedi.
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Bu hafta ===== */}
      {haftaParcalar.length > 0 && (
        <section className="od-card" aria-labelledby="og-h-hafta">
          <div className="od-card-h">
            <div>
              <h2 id="og-h-hafta">Bu hafta</h2>
              <p>
                {haftaParcalar
                  .join(', ')
                  .replace(/, ([^,]*)$/, ' ve $1')
                  .replace(/^./, (c) => c.toLocaleUpperCase('tr-TR'))}
                {dersHazir ? ' · dersler üstteki kartta' : ''}
              </p>
            </div>
            {can.etut && (
              <button type="button" className="od-link" onClick={() => go('etuts')}>
                Etütler
                <ArrowRight aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="og-week" ref={haftaRef}>
            {haftaGunleri.map(({ g, l, tatil }) => {
              const goster = l.slice(0, 4);
              return (
                <div key={g} className={`og-day${g === bugun ? ' today' : ''}${tatil ? ' tatil' : ''}`}>
                  <div className="dh">
                    <span>{GUN_KISA[isoGun(g) - 1]}</span>
                    <b className="tnum">{Number(g.slice(8, 10))}</b>
                  </div>
                  {goster.length ? (
                    goster.map((o) => (
                      <span key={o.k} className={`og-ev ${o.tur}`} title={o.yazi}>
                        {o.yazi}
                      </span>
                    ))
                  ) : (
                    <span className="none">Boş gün</span>
                  )}
                  {l.length > 4 && <span className="plus">+{l.length - 4} daha</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </AnaSayfaKabuk>
  );
};
