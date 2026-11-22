// ============================================================================
// Aşama 358: KURUM VE YETKİ: kurum bilgisi, portal, roller, mahremiyet, bölüm erişimi, ders erişimi, haftanın başlangıcı, kurum adı ve logosu
// dataService.ts'ten KELİMESİ KELİMESİNE taşındı; yalnız "private" → "protected" (alt katmanlar kullanabilsin diye) ve
// statik değerlerde "DataService." → tanımlandığı katmanın adı. Davranış aynı. Katman sırası: temel → kurumYetki → bulutDepo → esitleme → dataService
// ============================================================================
import {
  Student,
  Teacher,
  AuthSession,
  ClassGroup,
  Homework,
  Etut,
  WeeklyQuestionTarget,
  KurumModule,
  KurumInfo,
  TeacherTabType,
} from '../../types';
import { supabase } from '../../lib/supabase';
import { subjectsForBranch, sameSubjectName } from '../../lib/subjects';
import { setKurumBrand } from '../../lib/kurumBrand';
import { sunucuSaatiAyarla } from '../../lib/trSaat';
import { loadOgrBolumCache, syncOgrBolum } from '../../lib/ogrenciBolum';
import { isPendingPlanTarget, isPlanTopicRecord } from '../../utils/targetDays';
import { appStorage } from '../depo';
import { isClassQuestionTarget } from '../satirDonusumleri';
import { parseKurumRpc, kurumStateFrom, kurumAccessKey } from '../kurumTanimlari';
import { hasCloudSession } from '../bulutIslemleri';
import { isRedactedRow } from '../kayitKurallari';
import {
  KURUM_MODULES,
  SISTEM_SAHIBI_SEKMELERI,
  TAB_MODULES,
  EMPTY_KURUM_STATE,
  MY_KURUM_KEY,
  PORTAL_ROLLERI,
  PORTAL_KEY,
  PORTAL_TERCIH_KEY,
  loadPortalSecim,
  type MyKurumState,
  type PortalKod,
} from '../kurumTanimlari';
import { VeriTemeli } from './temel';
import { ADMIN_EMAIL, currentEpoch, PLAN_GENIS_ROLLER } from './ortak';
// Bu modülde "localStorage" adı depodaki yönlendiriciyi ifade eder (dataService.ts ile aynı)
const localStorage = appStorage;

export abstract class KurumYetkiKatmani extends VeriTemeli {
  // Üst katmanlarda tanımlı olup burada kullanılanlar
  public abstract questionTargetEnd(t: WeeklyQuestionTarget): string;
  public abstract isMyQuestionTarget(t: WeeklyQuestionTarget): boolean;
  protected abstract isHeadAdminTeacher(t?: Teacher | null): boolean;
  public abstract getClasses(forTeacherId?: string): ClassGroup[];

  public etuts: Etut[] = [];
  public weeklyQuestionTargets: WeeklyQuestionTarget[] = [];
  protected deltaState = new Map<string, { mark: string; idsAt: number; restored?: boolean }>();

  protected async syncMyTeacherAccess(): Promise<void> {
    const session = this.getAuthSession();
    if (session?.role !== 'teacher' || this.isCurrentUserAdmin()) return;
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id;
      if (!uid) return;
      const [cls, std] = await Promise.all([
        supabase.from('teacher_class_access').select('class_id').eq('teacher_auth_id', uid),
        supabase.from('teacher_student_access').select('student_id').eq('teacher_auth_id', uid),
      ]);
      if (cls.error || std.error) return;
      // Aşama 243: Öğretmen portalında ders programındaki / sınıf öğretmenliğindeki sınıflar da (243 SQL yoksa atlanır)
      if (this.portalAktif === 'ogretmen') {
        const pd = await supabase.rpc('portal_ders_siniflarim');
        this.portalDersSiniflari = new Set(!pd.error && Array.isArray(pd.data) ? pd.data.map(String) : []);
      } else this.portalDersSiniflari = new Set();
      const next = {
        classIds: new Set([...(cls.data || []).map((r: any) => String(r.class_id)), ...this.portalDersSiniflari]),
        studentIds: new Set((std.data || []).map((r: any) => String(r.student_id))),
        loaded: true,
      };
      // Aşama 113: değişmediyse ekran yeniden çizilmez; sınıf / öğrenci yetkisi değiştiyse kayıtlar da yenilenir
      const prev = this.myTeacherAccess;
      const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
      if (prev.loaded && same(prev.classIds, next.classIds) && same(prev.studentIds, next.studentIds)) return;
      this.myTeacherAccess = next;
      if (prev.loaded) this.resyncAfterAccessChange();
      this.notify();
    } catch {
      // bağlantı sorunu: bir sonraki eşitlemede tekrar denenir
    }
  }

  protected fullSyncInFlight: Promise<void> | null = null;
  protected lastFullSyncAt = 0;

  protected backgroundSyncedAt = new Map<string, number>();

  // --- AUTH & TEACHER MANAGEMENT ---
  // Aşama 103: aynı çizim / olay turunda (aynı oturum ve öğretmen listesiyle) sonuç yeniden aranmaz
  protected currentTeacherMemo: { ep: number; session: AuthSession | null; list: Teacher[]; len: number; val: Teacher | null } | null = null;
  public getCurrentTeacher(): Teacher | null {
    const session = this.getAuthSession();
    const c = this.currentTeacherMemo;
    if (c && c.session === session && c.list === this.teachers && c.len === this.teachers.length && c.ep === currentEpoch()) return c.val;
    let val: Teacher | null = null;
    if (session?.role === 'teacher') {
      const uname = session.user.username?.toLowerCase();
      const match = this.teachers.find((t) => t.id === session.user.id || t.username?.toLowerCase() === uname);
      val = match || (session.user as Teacher);
    }
    this.currentTeacherMemo = { ep: currentEpoch(), session, list: this.teachers, len: this.teachers.length, val };
    return val;
  }

  // Yönetici: kayıtta yönetici işareti olan (giriş rolü 'admin' veya teachers.is_admin) ya da kurum yöneticisi
  // e-postasıyla giriş yapan öğretmen. Veritabanındaki is_admin() kuralıyla aynıdır.
  public isTeacherAdmin(teacher?: Teacher | null): boolean {
    if (!teacher) return false;
    // Aşama 243: Öğretmen portalında yönetici değil; İdare portalında Müdür gibi (kurum yöneticisi işareti sayılmaz)
    if (this.portalAdminGizli()) {
      const s0 = this.getAuthSession();
      if (s0?.role === 'teacher' && s0.user?.id === teacher.id) return !!this.myKurum.kurumAdmin;
    }
    if (teacher.isAdmin || (teacher.email || '').trim().toLowerCase() === ADMIN_EMAIL) return true;
    // Aşama 82: Müdür / Müdür Yardımcısı rolüyle kurum yöneticisi olan oturum sahibi (veritabanı is_kurum_admin ile aynı)
    const s = this.getAuthSession();
    return !!(this.myKurum && this.myKurum.kurumAdmin && s?.role === 'teacher' && s.user && s.user.id === teacher.id);
  }

  public isCurrentUserAdmin(): boolean {
    const session = this.getAuthSession();
    if (!session) return false;
    if (session.role !== 'teacher') return false;
    const currentTeacher = this.getCurrentTeacher();
    return this.isTeacherAdmin(currentTeacher) || this.isTeacherAdmin(session.user as Teacher);
  }
  /** Aşama 243: sunucudan gelen kurum bilgisi (portal uygulanmamış). myKurum = bunun seçili portala göre daraltılmışı */
  protected myKurumRaw: MyKurumState = this.myKurum;
  protected portalSecim: { tid: string; p: PortalKod } | null = loadPortalSecim();
  /** Aşama 243: Öğretmen portalında ders programındaki / sınıf öğretmenliğindeki sınıflar (sql/243 portal_ders_siniflarim) */
  protected portalDersSiniflari = new Set<string>();

  // ===========================================================================
  // Aşama 234: DERSLER SAYFASI ERİŞİMİ. Ders programında dersi (ya da vekilliği) olan öğretmen ve ders saatleri
  // kayıtlı kurumun idaresi "Dersler"i (Program + yoklama) her zaman görür; "Notlar" bölümü eskisi gibi not iznine
  // bağlıdır (canUseNotlar). Bilgi sunucudan (ders_erisimim, sql/234) girişte ve 10 dakikada bir okunur; aynı çağrı
  // sunucu saatini de öğretir (lib/trSaat). SQL kurulu değilse eski davranış sürer.
  // ===========================================================================
  protected static DERS_ERISIM_KEY = 'edu_ders_erisim_v1';
  protected dersErisim: { kurumId: string | null; program: boolean; yonetici: boolean; at: number } = (() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(KurumYetkiKatmani.DERS_ERISIM_KEY) || 'null');
      if (v && typeof v === 'object') return { kurumId: v.kurumId || null, program: v.program === true, yonetici: v.yonetici === true, at: 0 };
    } catch {}
    return { kurumId: null, program: false, yonetici: false, at: 0 };
  })();
  protected dersErisimSuruyor = false;

  protected async refreshDersErisim(): Promise<void> {
    const kurumId = this.myKurum.kurumId || null;
    if (this.getAuthSession()?.role !== 'teacher' || !kurumId || this.isHeadAdmin()) {
      if (this.dersErisim.program || this.dersErisim.yonetici) {
        this.dersErisim = { kurumId: null, program: false, yonetici: false, at: Date.now() };
        this.notify();
      }
      return;
    }
    if (this.dersErisimSuruyor) return;
    if (this.dersErisim.kurumId === kurumId && Date.now() - this.dersErisim.at < 10 * 60_000) return;
    this.dersErisimSuruyor = true;
    try {
      const gonder = Date.now();
      const { data, error } = await supabase.rpc('ders_erisimim');
      const alindi = Date.now();
      let program = false;
      let yonetici = false;
      if (error) {
        // 234 kurulu değilse eski davranış (yalnız not izni); bağlantı hatasında bilinen değer korunur
        if (!(error.code === 'PGRST202' || error.code === '42883' || /ders_erisimim/.test(error.message || ''))) return;
      } else {
        const d: any = data || {};
        program = d.program === true;
        yonetici = d.yonetici === true;
        sunucuSaatiAyarla(Number(d.simdi_ms), gonder, alindi);
      }
      if (this.myKurum.kurumId !== kurumId) return; // arada kurum değişti
      const degisti = this.dersErisim.program !== program || this.dersErisim.yonetici !== yonetici || this.dersErisim.kurumId !== kurumId;
      this.dersErisim = { kurumId, program, yonetici, at: Date.now() };
      try {
        sessionStorage.setItem(KurumYetkiKatmani.DERS_ERISIM_KEY, JSON.stringify({ kurumId, program, yonetici }));
      } catch {}
      if (degisti) this.notify();
    } catch {
      /* bağlantı sorunu: bir sonraki eşitlemede tekrar denenir */
    } finally {
      this.dersErisimSuruyor = false;
    }
  }

  /** Aşama 234: ders programında dersi / vekilliği olan öğretmen ya da ders saatleri kayıtlı kurumun idaresi */
  public dersProgramiErisimi(): boolean {
    const k = this.myKurum.kurumId || null;
    return !!k && this.dersErisim.kurumId === k && (this.dersErisim.program || this.dersErisim.yonetici);
  }

  /** Aşama 234: Dersler › Notlar bölümü (önceki "grades" izninin aynısı) */
  public canUseNotlar(): boolean {
    return this.canUseTabBase('grades');
  }

  // ===========================================================================
  // Aşama 43: ÖĞRENCİNİN HAFTASI — öğretmenin haftalık planı hangi günden başlıyorsa öğrencinin soru hedefi
  // ve soru kaydı haftası da o günden başlar (Soru Kaydet, Soru Takibi, özetler, grafikler, hedef formu).
  //
  // Aşama 235: hafta artık "en son başlayan plan başlığı"ndan değil, BUGÜNÜ KAPSAYAN plan / soru hedefinden
  // bulunur. Eski kural iki yerde yanılıyordu: (1) öğrencinin aynı haftada başka bir planı (ör. başka öğretmenin
  // Pazartesi planı) varsa en son başlayan seçiliyor, Cuma başlayan plan yok sayılıyordu; (2) plan başlıkları
  // arka planda okunamadığında (bağlantı / zaman aşımı) eski bilgi kalıyor, öğrenci Pazartesi'ye düşüyordu.
  // Şimdi planın Soru Takibi'ne aktarılmış hedefi (cihazda zaten var, ayrı sorgu gerekmez) esas alınır.
  // Öncelik (bugünü kapsayanlar arasında; aynı basamakta en son başlayan):
  //   1) benim (öğretmen) plandan gelen hedefim   2) benim 7 günlük hedefim
  //   3) plandan gelen herhangi bir hedef / konu kaydı   4) gönderilmiş plan başlığı   5) diğer 7 günlük hedefler
  // Bugünü kapsayan yoksa: bugünden önce başlamış en son plan / hedefin günü (haftalık ritim sürer). Hiçbiri yoksa Pazartesi.
  // "Soru Hedefi" kartı da önce benim hedefimi gösterdiği için sayfadaki bütün kartlar ve grafik aynı haftayı kullanır.
  // ===========================================================================
  protected static PLAN_WEEK_STARTS_KEY = 'edu_plan_week_starts_v2';
  /** öğrenci → gönderilmiş planlarının başlangıçları (yeniden eskiye, en çok 12) */
  protected planWeekStarts: Record<string, string[]> = (() => {
    try {
      const v = JSON.parse(localStorage.getItem(KurumYetkiKatmani.PLAN_WEEK_STARTS_KEY) || '{}');
      if (!v || typeof v !== 'object') return {};
      const out: Record<string, string[]> = {};
      for (const [k, list] of Object.entries(v)) {
        if (Array.isArray(list)) out[k] = list.map((x) => String(x || '').slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
      }
      return out;
    } catch {
      return {};
    }
  })();
  protected weekStartDayCache: { v: number; srcTargets: unknown; srcPlans: unknown; viewer: string; map: Map<string, number> } | null = null;

  /** Öğrencinin haftasının başladığı gün: 0 = Pazar, 1 = Pazartesi … 6 = Cumartesi. refDate: haftası istenen gün (varsayılan bugün) */
  public getStudentWeekStartDay(studentId?: string | null, refDate?: Date | string): number {
    if (!studentId) return 1;
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parse = (s: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
      return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
    };
    const ref = typeof refDate === 'string' ? (/^\d{4}-\d{2}-\d{2}/.test(refDate) ? refDate.slice(0, 10) : ymdOf(new Date())) : ymdOf(refDate || new Date());

    // Önbellek: aynı veri + aynı kullanıcı + aynı gün için tekrar hesaplanmaz (sınıf listesi her öğrenci için çağırır)
    const viewer = String(this.getCurrentTeacher()?.id || this.getAuthSession()?.user?.id || '');
    const c = this.weekStartDayCache;
    if (!c || c.v !== this.dataVersion || c.srcTargets !== this.weeklyQuestionTargets || c.srcPlans !== this.planWeekStarts || c.viewer !== viewer) {
      this.weekStartDayCache = { v: this.dataVersion, srcTargets: this.weeklyQuestionTargets, srcPlans: this.planWeekStarts, viewer, map: new Map() };
    }
    const cache = this.weekStartDayCache!.map;
    const cacheKey = `${studentId}|${ref}`;
    const hit = cache.get(cacheKey);
    if (hit !== undefined) return hit;

    const addDays = (s: string, n: number) => {
      const d = parse(s);
      if (!d) return s;
      d.setDate(d.getDate() + n);
      return ymdOf(d);
    };
    const classId = this.students.find((s) => s.id === studentId)?.classId || '';
    type Anchor = { start: string; tier: number; covers: boolean };
    const anchors: Anchor[] = [];
    const push = (start: string, end: string, tier: number) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start > ref) return; // gelecekte başlayan plan bugünün haftasını belirlemez
      anchors.push({ start, tier, covers: ref <= end });
    };

    for (const t of this.weeklyQuestionTargets) {
      const isClass = isClassQuestionTarget(t);
      if (isClass ? !classId || t.classId !== classId : t.studentId !== studentId) continue;
      const start = t.weekStartDate || '';
      if (!start) continue;
      const end = this.questionTargetEnd(t);
      const fromPlan = !isClass && (!!t.fromPlan || isPlanTopicRecord(t));
      const weekly = addDays(start, 6) === end; // tam 7 günlük hedef
      if (!fromPlan && (!weekly || isPendingPlanTarget(t))) continue; // 30 günlük vb. hedefler haftanın gününü belirlemez
      const mine = !!viewer && this.isMyQuestionTarget(t);
      const tier = mine ? (fromPlan ? 1 : 2) : fromPlan ? 3 : 5;
      push(start, fromPlan ? addDays(start, 6) : end, tier);
    }
    for (const ws of this.planWeekStarts[studentId] || []) push(ws, addDays(ws, 6), 4);

    let pick: Anchor | null = null;
    for (const a of anchors) {
      if (!a.covers) continue;
      if (!pick || a.tier < pick.tier || (a.tier === pick.tier && a.start > pick.start)) pick = a;
    }
    if (!pick) {
      for (const a of anchors) if (!pick || a.start > pick.start) pick = a; // bugünü kapsayan yoksa en son başlayan
    }
    const day = pick ? parse(pick.start)?.getDay() ?? 1 : 1;
    cache.set(cacheKey, day);
    return day;
  }
  /** Öğrencilerin son gönderilen planlarının başlangıç günlerini veritabanından okur */
  public async syncPlanWeekStarts(): Promise<void> {
    if (!(await hasCloudSession())) return;
    try {
      const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 70);
      const res = await supabase
        .from('study_plans')
        .select('student_id,week_start')
        .not('sent_at', 'is', null)
        .gte('week_start', ymdOf(from))
        .lte('week_start', ymdOf(today))
        .order('week_start', { ascending: false })
        .limit(5000);
      if (res.error || !Array.isArray(res.data)) return;
      // Aşama 235: yalnız en son plan değil, her öğrencinin son 12 planı tutulur (bugünü kapsayan plan seçilebilsin)
      const next: Record<string, string[]> = {};
      for (const r of res.data as any[]) {
        const sid = String(r.student_id || '');
        const ws = String(r.week_start || '').slice(0, 10);
        if (!sid || !/^\d{4}-\d{2}-\d{2}$/.test(ws)) continue;
        const list = next[sid] || (next[sid] = []);
        if (list.length < 12 && !list.includes(ws)) list.push(ws);
      }
      if (JSON.stringify(next) === JSON.stringify(this.planWeekStarts)) return;
      this.planWeekStarts = next;
      try {
        localStorage.setItem(KurumYetkiKatmani.PLAN_WEEK_STARTS_KEY, JSON.stringify(next));
      } catch {
        /* tarayıcı kaydı kapalı */
      }
      this.notify();
    } catch {
      /* ağ hatası: önceki bilgiyle devam */
    }
  }

  // ===========================================================================
  // Aşama 122: KURUM BİLGİSİ LOGOSUZ YOKLANIR
  // my_kurum() kurum logosunu da döndürür (data URL, ~90 KB). Öğretmende dakikada bir + her eşitlemede çağrıldığı için
  // logo değişmese de her dakika yeniden iniyordu. Artık önce my_kurum_state() sorulur: aynı bilgi, logo yerine logonun
  // SHA-256 özeti. Özet ekrandaki logoyla aynıysa logo yeniden indirilmez; farklıysa (logo değişti / kurum değişti)
  // ya da işlev yoksa (SQL 122 çalıştırılmadıysa) eskisi gibi my_kurum() ile tam okunur. Görünen bilgi birebir aynıdır.
  // ===========================================================================
  protected kurumStateLightOk = true;
  protected kurumLogoHashCache: { logo: string; hash: string } | null = null;

  protected async kurumLogoHash(logo: string): Promise<string | null> {
    const c = this.kurumLogoHashCache;
    if (c && c.logo === logo) return c.hash;
    try {
      const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
      if (!subtle) return null;
      const buf = await subtle.digest('SHA-256', new TextEncoder().encode(logo));
      let hex = '';
      for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, '0');
      this.kurumLogoHashCache = { logo, hash: hex };
      return hex;
    } catch {
      return null;
    }
  }

  /** true = bilgi logosuz okunup uygulandı; false = tam okuma gerekir */
  protected async syncMyKurumLight(): Promise<boolean> {
    if (!this.kurumStateLightOk || !this.myKurum.loaded || !this.myKurum.supported) return false;
    const { data, error } = await supabase.rpc('my_kurum_state');
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883' || /my_kurum_state/.test(error.message || '')) this.kurumStateLightOk = false;
      return false;
    }
    const d = parseKurumRpc(data, 'my_kurum_state');
    if (typeof d.logo_hash === 'string') {
      // kurum değiştiyse ya da logo değiştiyse logo tam okunur
      if ((d.kurum_id || null) !== this.myKurum.kurumId) return false;
      const cur = await this.kurumLogoHash(this.myKurum.logo || '');
      if (!cur || cur !== d.logo_hash) return false;
    }
    const next = kurumStateFrom(d, typeof d.logo_hash === 'string' ? this.myKurum.logo || '' : '');
    this.setMyKurum(next);
    if (next.head && this.kurumNameCache.size === 0) this.listKurumlar().catch(() => {});
    return true;
  }

  /** Aşama 298 (HIZ): hesap / kurum geçişinde yeni hesabın kurum bilgisi sayfa yenilenmeden ÖNCE okunur (kurumGecis.switchTab,
   *  öğretmen kaydıyla aynı anda). Dönen metin, yenilemeden hemen önce kurumOnYaz ile sekmeye yazılır; yenilenen sayfa
   *  hangi ana sayfayı açacağını ilk anda bilir ("Yükleniyor…" beklemesi olmaz). Geçerli durumu DEĞİŞTİRMEZ; okunamazsa
   *  null döner ve eski yol (açılışta okuma) çalışır. Bilgi yeni hesabın kendi oturumuyla okunur. */
  public async kurumOnOku(): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('my_kurum');
      if (error) return null;
      const d = parseKurumRpc(data, 'my_kurum');
      return JSON.stringify(kurumStateFrom(d, typeof d.logo === 'string' ? d.logo : ''));
    } catch {
      return null;
    }
  }
  /** Aşama 298: prepareAccountSwitch'ten SONRA çağrılır (o, önceki hesabın kurum bilgisini siler). */
  public kurumOnYaz(json: string | null): void {
    if (!json) return;
    try {
      sessionStorage.setItem(MY_KURUM_KEY, json);
    } catch {
      /* depolama kapalı: açılışta okunur */
    }
  }

  public async syncMyKurum(): Promise<void> {
    const session = this.getAuthSession();
    if (session?.role !== 'teacher') return;
    try {
      if (await this.syncMyKurumLight()) return;
    } catch {
      /* logosuz yoklama olmadı: tam okumayla devam */
    }
    try {
      const { data, error } = await supabase.rpc('my_kurum');
      if (error) {
        if (error.code === 'PGRST202' || error.code === '42883' || /my_kurum/.test(error.message || '')) {
          this.setMyKurum({ ...EMPTY_KURUM_STATE, loaded: true, supported: false });
        }
        return;
      }
      let d: any = data;
      if (Array.isArray(d)) d = d[0] && typeof d[0] === 'object' && 'my_kurum' in d[0] ? d[0].my_kurum : d[0];
      d = d || {};
      const next: MyKurumState = kurumStateFrom(d, typeof d.logo === 'string' ? d.logo : '');
      this.setMyKurum(next);
      // Genel yönetici: kurum adları listelerde etiket olarak gösterilir
      if (next.head && this.kurumNameCache.size === 0) this.listKurumlar().catch(() => {});
    } catch {
      // bağlantı sorunu: bir sonraki eşitlemede tekrar denenir
    }
  }

  protected setMyKurum(next: MyKurumState) {
    // Aşama 158: tam okuma (my_kurum) anahtarı taşımaz; aynı kurumda bilinen değer korunur, yoksa ekran gidip gelir
    if (next.grantCred === null && next.kurumId === this.myKurum.kurumId && typeof this.myKurum.grantCred === 'boolean') {
      next = { ...next, grantCred: this.myKurum.grantCred };
    }
    // Aşama 161: sınıf değiştirme anahtarı için aynı kural
    if (next.grantMove === null && next.kurumId === this.myKurum.kurumId && typeof this.myKurum.grantMove === 'boolean') {
      next = { ...next, grantMove: this.myKurum.grantMove };
    }
    // Aşama 243: önbelleğe ham bilgi yazılır; ekran seçili portala göre daraltılmış bilgiyi kullanır
    const raw = next;
    this.myKurumRaw = raw;
    const oncekiPortal = this.portalAktif;
    this.portalHesapla();
    next = this.portalUygula(raw);
    const changed = JSON.stringify(next) !== JSON.stringify(this.myKurum) || oncekiPortal !== this.portalAktif;
    const accessChanged = this.myKurum.loaded && kurumAccessKey(this.myKurum) !== kurumAccessKey(next);
    this.myKurum = next;
    if (accessChanged) this.resyncAfterAccessChange();
    if (oncekiPortal !== this.portalAktif) void this.syncMyTeacherAccess();
    // Aşama 82: kurum adı ve logosu (karne PDF'leri ve üst menü)
    setKurumBrand(next.kurumId ? { name: next.kurumName, logo: next.logo } : null);
    try {
      sessionStorage.setItem(MY_KURUM_KEY, JSON.stringify(raw));
    } catch {}
    if (changed) this.notify();
    void this.refreshDersErisim(); // Aşama 234 (10 dakikada bir okunur)
  }

  /**
   * Aşama 113: rol / bölüm izni değişince veritabanının bu kişiye verdiği kayıtlar da değişir; artımlı okuma yalnız
   * "değişen" satırları getirdiği için yeni görünür olan eski kayıtlar 10 dakikaya kadar gelmiyordu. Kimlik
   * karşılaştırması hemen yapılır (çalışan eşitleme varsa bittikten sonra bir kez daha).
   */
  protected resyncAfterAccessChange(): void {
    for (const st of this.deltaState.values()) st.idsAt = 0;
    const run = () => {
      for (const st of this.deltaState.values()) st.idsAt = 0;
      this.backgroundSyncedAt.clear(); // not / yoklama 10 dakika beklemeden okunsun
      this.lastFullSyncAt = 0;
      this.revalidateAndSyncAll(true);
    };
    if (this.fullSyncInFlight) this.fullSyncInFlight.then(run, run);
    else setTimeout(run, 0);
  }

  public getMyKurum(): Readonly<MyKurumState> {
    return this.myKurum;
  }

  // ===========================================================================
  // Aşama 243 / 257: PORTAL SEÇİMİ
  //  - Kurumda iki ya da daha çok görevi olan HER kişide çıkar. Görevler: İdare (Müdür / Müdür Yrd.), Rehberlik,
  //    Ölçme Değerlendirme, Öğretmen (Öğretmen / Zümre Başkanı), Etüt Öğretmeni (yalnız öğretmen ve rehberlik değilse)
  //    ve Kurum yöneticisi (kayıtta yönetici işareti).
  //  - Seçilen portalda ekran yalnız o portalın rolleriyle çalışır (ana sayfa, menü, listeler). Kurum yöneticisi
  //    portalı bugünkü tam görünümdür. İdare portalında kurum yöneticisine özel bölümler gizlidir.
  //  - Rol yetkileri kapalı kurumda roller uygulanmadığı için seçim yalnız Kurum yöneticisi + Öğretmen içindir (255b).
  //  Genel yönetici, kurum geçişi ve tek görevli hesaplarda hiçbir şey değişmez.
  // ===========================================================================
  /** Kişinin kayıtlı kurum yöneticisi işareti (portal uygulanmamış) */
  protected kendiAdminKaydi(): boolean {
    const s = this.getAuthSession();
    if (s?.role !== 'teacher') return false;
    const t = (this.teachers || []).find((x) => x.id === s.user.id);
    return !!(t ? t.isAdmin : (s.user as Teacher).isAdmin);
  }
  /** Bu hesabın girebileceği portallar (2'den azsa boş: seçim yok) */
  public getPortallar(): PortalKod[] {
    const s = this.getAuthSession();
    const k = this.myKurumRaw;
    if (s?.role !== 'teacher' || !k.loaded || !k.supported || k.head || !k.kurumId || this.isKurumGecis()) return [];
    if (k.tur === 'bireysel') return []; // Aşama 258: bireysel hesapta tek görev vardır (koçluk)
    const r = k.roles || [];
    const var_ = (p: PortalKod) => (PORTAL_ROLLERI[p] || []).some((x) => r.includes(x));
    const yonetici = !!k.kurumAdmin && this.kendiAdminKaydi();
    const rolOn = k.rolesEnabled === true;
    const ogretmen = r.includes('ogretmen') || r.includes('zumre_baskani');
    const list: PortalKod[] = [];
    if (rolOn && var_('idare')) list.push('idare');
    if (rolOn && var_('rehberlik')) list.push('rehberlik');
    if (rolOn && var_('olcme')) list.push('olcme');
    // Aşama 255b: Öğretmen unvanı rol yetkileri kapalıyken de sayılır (kurum yöneticisinin gerçek görevi; derse girer)
    if (ogretmen && (rolOn || yonetici)) list.push('ogretmen');
    // Etüt öğretmenliği Öğretmen ve Rehberlik portallarında zaten vardır; yalnız onlar yoksa ayrı portaldır
    if (rolOn && r.includes('etut_ogretmeni') && !ogretmen && !r.includes('rehberlik')) list.push('etut');
    if (yonetici) list.push('yonetici');
    return list.length > 1 ? list : [];
  }
  protected portalHesapla(): void {
    const list = this.getPortallar();
    const tid = this.getAuthSession()?.user.id || '';
    let p: PortalKod | null = null;
    if (list.length) {
      if (this.portalSecim?.tid === tid && list.includes(this.portalSecim.p)) p = this.portalSecim.p;
      else {
        let pref: string | null = null;
        try {
          pref = localStorage.getItem(PORTAL_TERCIH_KEY + tid);
        } catch {}
        if (pref && list.includes(pref as PortalKod)) {
          p = pref as PortalKod;
          this.portalSecim = { tid, p };
          try {
            sessionStorage.setItem(PORTAL_KEY, JSON.stringify(this.portalSecim));
          } catch {}
        }
      }
    }
    this.portalAktif = p;
  }
  /** Seçili portal (seçim yoksa ya da kişide tek görev varsa null) */
  public getPortal(): PortalKod | null {
    return this.portalAktif;
  }
  /** Girişten sonra portal seçim ekranı gösterilmeli mi */
  public portalSecimiGerekli(): boolean {
    return this.getPortallar().length > 1 && !this.portalAktif;
  }
  /** "Seçimimi hatırla" açık mı */
  public portalHatirlaniyor(): boolean {
    const tid = this.getAuthSession()?.user.id || '';
    try {
      return !!tid && !!localStorage.getItem(PORTAL_TERCIH_KEY + tid);
    } catch {
      return false;
    }
  }
  /** Portalı değiştirir (çıkış yapmadan). hatirla: true = bu cihazda bir dahaki girişte sorulmaz */
  public setPortal(p: PortalKod, hatirla?: boolean): void {
    const tid = this.getAuthSession()?.user.id || '';
    if (!tid || !this.getPortallar().includes(p)) return;
    this.portalSecim = { tid, p };
    try {
      sessionStorage.setItem(PORTAL_KEY, JSON.stringify(this.portalSecim));
      if (hatirla === true) localStorage.setItem(PORTAL_TERCIH_KEY + tid, p);
      else if (hatirla === false) localStorage.removeItem(PORTAL_TERCIH_KEY + tid);
      else if (localStorage.getItem(PORTAL_TERCIH_KEY + tid)) localStorage.setItem(PORTAL_TERCIH_KEY + tid, p);
    } catch {}
    const onceki = this.myKurum;
    this.portalHesapla();
    this.myKurum = this.portalUygula(this.myKurumRaw);
    this.myTeacherAccess = { classIds: new Set(), studentIds: new Set(), loaded: false };
    this.portalDersSiniflari = new Set();
    if (onceki.loaded && kurumAccessKey(onceki) !== kurumAccessKey(this.myKurum)) this.resyncAfterAccessChange();
    void this.syncMyTeacherAccess();
    this.notify();
  }
  /** Kurum bilgisini seçili portala göre daraltır (yalnız ekran; veritabanı yetkisi değişmez) */
  protected portalUygula(raw: MyKurumState): MyKurumState {
    const p = this.portalAktif;
    const izin = p ? PORTAL_ROLLERI[p] : null;
    if (!p || !izin) return raw; // seçim yok ya da Kurum yöneticisi portalı: tam görünüm
    // Aşama 257: ekran yalnız bu portalın rolleriyle çalışır. İdare portalı Müdür / Müdür Yrd. gibi kurumu yönetir
    // (kurum yöneticisine özel bölümler yoneticiKaydi ile gizli); diğer portallarda yönetim yoktur.
    return { ...raw, roles: (raw.roles || []).filter((x) => izin.includes(x)), kurumAdmin: p === 'idare' ? raw.kurumAdmin : false };
  }
  /** Kurum yöneticisi portalı dışındaki her portalda kişinin kendi kurum yöneticisi işareti gizlenir */
  protected portalAdminGizli(): boolean {
    return !!this.portalAktif && this.portalAktif !== 'yonetici';
  }
  /** Kurum yöneticisi işareti (oturum sahibi için seçili portala göre). Ekranlar teacher.isAdmin yerine bunu kullanır */
  public yoneticiKaydi(t?: Teacher | null): boolean {
    if (!t?.isAdmin) return false;
    const s = this.getAuthSession();
    return !(s?.role === 'teacher' && s.user?.id === t.id && this.portalAdminGizli());
  }

  // ===========================================================================
  // Aşama 83: KURUM ADI VE LOGOSU — öğrenci ekranında da kendi kurumunun adı ve logosu görünür (sql/83: student_my_kurum)
  // ===========================================================================
  protected static STUDENT_BRAND_KEY = 'edu_student_brand_v1';
  protected studentBrand: { name: string; logo: string } = (() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(KurumYetkiKatmani.STUDENT_BRAND_KEY) || '{}');
      return { name: String(v?.name || ''), logo: String(v?.logo || '') };
    } catch {
      return { name: '', logo: '' };
    }
  })();
  // Aşama 165: öğrenci bölüm izinleri (öğretmen: ayar satırları, öğrenci: kendi bölümleri); değişince ekran yenilenir
  public async syncOgrenciBolum(): Promise<void> {
    const session = this.getAuthSession();
    if (!session?.user?.id || (session.role !== 'teacher' && session.role !== 'student')) return;
    loadOgrBolumCache(`${session.role}:${session.user.id}`);
    if (await syncOgrBolum(session.role)) this.notify();
  }

  public async syncStudentBrand(): Promise<void> {
    if (this.getAuthSession()?.role !== 'student') return;
    try {
      const { data, error } = await supabase.rpc('student_my_kurum');
      if (error) return; // 83 numaralı SQL çalıştırılmadıysa varsayılan ad kalır
      let d: any = Array.isArray(data) ? data[0] : data;
      if (d && typeof d === 'object' && 'student_my_kurum' in d) d = d.student_my_kurum;
      const next = { name: String(d?.name || ''), logo: typeof d?.logo === 'string' ? d.logo : '' };
      setKurumBrand(next.name || next.logo ? next : null);
      if (JSON.stringify(next) === JSON.stringify(this.studentBrand)) return;
      this.studentBrand = next;
      try {
        sessionStorage.setItem(KurumYetkiKatmani.STUDENT_BRAND_KEY, JSON.stringify(next));
      } catch {}
      this.notify();
    } catch {
      /* bağlantı sorunu: bir sonraki eşitlemede tekrar denenir */
    }
  }
  /** Ekranda gösterilecek kurum adı ve logosu (öğretmen: kendi kurumu, öğrenci: kayıtlı olduğu kurum; yoksa boş) */
  public getBrand(): { name: string; logo: string } {
    const role = this.getAuthSession()?.role;
    if (role === 'teacher') {
      const k = this.myKurum;
      return k.kurumId ? { name: k.kurumName || '', logo: k.logo || '' } : { name: '', logo: '' };
    }
    if (role === 'student') return this.studentBrand;
    return { name: '', logo: '' };
  }

  public isKurumSupported(): boolean {
    return this.myKurum.supported;
  }

  // Genel yönetici (tam yetki)
  public isHeadAdmin(): boolean {
    const session = this.getAuthSession();
    if (session?.role !== 'teacher') return false;
    if (!this.myKurum.supported) return this.isCurrentUserAdmin();
    const t = this.getCurrentTeacher() || (session.user as Teacher);
    return this.myKurum.head || this.isHeadAdminTeacher(t) || this.isHeadAdminTeacher(session.user as Teacher);
  }

  // Kurum yöneticisi (kendi kurumunu yönetir)
  public isKurumAdmin(): boolean {
    return this.myKurum.supported && !this.isHeadAdmin() && this.myKurum.kurumAdmin;
  }
  /** Aşama 259: sistem sahibi kendi panelinde mi (yönetim merkezi: ders sekmeleri kapalı) */
  public yonetimMerkezi(): boolean {
    return this.isHeadAdmin() && !this.isKurumGecis();
  }
  /** Aşama 259: kendi alanından bireysel hesaba taşıma (sql/259). Sonuç: taşınan kayıt sayıları */
  public async kendiAlaniTasi(kurumId: string, classIds: string[]): Promise<Record<string, number>> {
    if (!this.yonetimMerkezi()) throw new Error('Taşımayı yalnız sistem sahibi kendi panelinde yapabilir.');
    const { data, error } = await supabase.rpc('kendi_alani_tasi', { p_kurum_id: kurumId, p_class_ids: classIds });
    if (error) {
      if (error.code === 'PGRST202' || /kendi_alani_tasi/.test(error.message || '')) throw new Error("Önce Supabase'de 259 numaralı SQL'i çalıştırın.");
      throw new Error(error.message);
    }
    // taşınan sınıf ve öğrenciler bu panelden çıkar: kimlikler hemen karşılaştırılır
    this.resyncAfterAccessChange();
    return (data && typeof data === 'object' ? data : {}) as Record<string, number>;
  }
  /** Aşama 263: tek öğretmenli kurumu bireysel (koçluk) hesaba çevirir (yalnız sistem sahibi; öğretmen hesabın sahibi olur) */
  public async kurumBireyseleCevir(kurumId: string): Promise<void> {
    if (!this.isHeadAdmin()) throw new Error('Bireysel hesaba yalnız sistem sahibi çevirebilir.');
    const { error } = await supabase.rpc('kurum_bireysel_cevir', { p_kurum_id: kurumId });
    if (error) {
      if (error.code === 'PGRST202') throw new Error("Önce Supabase'de 263 numaralı SQL'i çalıştırın.");
      throw new Error(error.message);
    }
    this.resyncAfterAccessChange();
  }
  /** Aşama 258: oturumdaki kurum bireysel (koçluk) hesabı mı */
  public isBireysel(): boolean {
    return this.myKurum.loaded && !!this.myKurum.kurumId && this.myKurum.tur === 'bireysel';
  }

  // ===========================================================================
  // Aşama 82: ROLLERE GÖRE YETKİLER (kurumda "rol yetkileri" açıkken). Veritabanı kurallarının ekrandaki karşılığı;
  // asıl denetim veritabanındadır (82 numaralı SQL). Anahtar kapalıysa bugünkü davranış aynen sürer.
  // ===========================================================================
  /** Rol yetkileri bu oturumda geçerli mi */
  public rolesActive(): boolean {
    return this.myKurum.supported && !this.isHeadAdmin() && !!this.myKurum.kurumId && this.myKurum.rolesEnabled === true;
  }
  public hasRole(role: string): boolean {
    return this.rolesActive() && (this.myKurum.roles || []).includes(role);
  }
  /** Kurumdaki tüm öğrencileri gören roller (Rehberlik, Ölçme Değerlendirme) */
  public roleWideView(): boolean {
    return this.hasRole('rehberlik') || this.hasRole('olcme_degerlendirme');
  }
  /** Başka öğretmenlerin çalışmalarını GÖREN roller (Rehberlik: tüm kurum, Zümre Başkanı: zümresi) */
  public roleSeesOthersWork(): boolean {
    return this.hasRole('rehberlik') || this.hasRole('zumre_baskani');
  }
  /** Yalnızca Etüt Öğretmeni rolü olan kişi */
  public roleEtutOnly(): boolean {
    if (!this.rolesActive() || this.isKurumAdmin()) return false;
    const r = this.myKurum.roles || [];
    return r.length > 0 && r.every((x) => x === 'etut_ogretmeni');
  }
  /** Ders verebilir mi (ödev, etüt, plan, soru hedefi) — rolü olmayan öğretmen bugünkü gibi verir */
  /**
   * Aşama 143: kişiye özel İŞLEM izni ('allow' | 'deny' | null = rolden). Bölümlerle aynı kayıtta "izin:<anahtar>" diye
   * tutulur; veritabanındaki perm_mode() ile aynı: yalnız rol yetkileri açıkken ve idare (kurum yön. / Müdür / Yrd.) değilse.
   */
  public permMode(key: string): 'allow' | 'deny' | null {
    if (!this.rolesActive() || this.isKurumAdmin()) return null;
    const k = 'izin:' + key;
    const sec = this.myKurum.sections || { allow: [], deny: [] };
    if ((sec.deny || []).includes(k)) return 'deny';
    if ((sec.allow || []).includes(k)) return 'allow';
    return null;
  }
  /** İzin "Rolden" ise rolün verdiği, değilse kişiye özel karar */
  protected permOr(key: string, byRole: () => boolean): boolean {
    const m = this.permMode(key);
    return m === 'allow' ? true : m === 'deny' ? false : byRole();
  }
  /** Aşama 83: bu bölüm bana kişiye özel AÇILMIŞ mı */
  public sectionExplicitAllow(tab: string): boolean {
    return this.rolesActive() && (this.myKurum.sections?.allow || []).includes(tab);
  }
  public roleCanTeach(): boolean {
    if (this.idareDersKapali()) return false; // Aşama 98
    if (!this.rolesActive() || this.isKurumAdmin()) return true;
    const r = this.myKurum.roles || [];
    return r.length === 0 || r.some((x) => x === 'rehberlik' || x === 'zumre_baskani' || x === 'ogretmen');
  }
  // ===========================================================================
  // Aşama 98: İDARE ve KURUM GEÇİŞİ. Asıl denetim veritabanındadır (98 numaralı SQL); bunlar ekrandaki karşılığıdır.
  // ===========================================================================
  /** Bu sekme genel yöneticinin kurum seçiciyle açtığı geçiş oturumu mu */
  public isKurumGecis(): boolean {
    try {
      const raw = window.sessionStorage.getItem('edu_sys_kurum_gecis');
      return !!raw && !!JSON.parse(raw)?.active;
    } catch {
      return false;
    }
  }
  /** İdare (kurum yöneticisi, Müdür, Müdür Yrd.) ders vermiyor mu — Kurum Ayarları'ndaki "İdare ödev / etüt verebilsin" kapalıysa */
  public idareDersKapali(): boolean {
    return this.isKurumAdmin() && !this.isKurumGecis() && this.myKurum.roleSettings?.idare_ders_verir !== true;
  }
  /** Ödev verebilir mi (Ödev Oluştur / Kopyala düğmeleri) */
  public canGiveHomework(): boolean {
    return this.canUseTab('homework') && (this.roleCanTeach() || this.sectionExplicitAllow('homework'));
  }
  /** Soru hedefi verebilir mi (idare ayar kapalıyken vermez; veritabanı da reddeder) */
  public canGiveTargets(): boolean {
    return this.canUseTab('question_tracking') && (this.roleCanTeach() || this.sectionExplicitAllow('question_tracking'));
  }
  /** Haftalık plan görevi ekleyebilir mi (ödev bölümü; idare ayar kapalıyken eklemez) */
  public canEditPlans(): boolean {
    return this.canUseTab('homework') && (this.roleCanTeach() || this.sectionExplicitAllow('homework'));
  }
  /** Etüt planlayabilir mi (idare yalnızca başka öğretmen adına planlar) */
  public canPlanEtut(): boolean {
    return this.canUseTab('etuts') && (this.roleCanTeach() || this.sectionExplicitAllow('etuts') || this.idareDersKapali());
  }
  /** Başka öğretmenlerin çalışmalarını görüyor mu (ana sayfada "Benim / Kurumun" seçimi) */
  public seesOthersWork(): boolean {
    return this.isHeadAdmin() || this.isKurumAdmin() || this.roleSeesOthersWork();
  }
  /** Ana sayfada Kurum Özeti gösterilsin mi (idare) */
  public showsKurumOzeti(): boolean {
    return this.isKurumAdmin();
  }
  /** Etüt / ödev bu oturumdaki öğretmenin mi (ana sayfa "Benim" seçimi) */
  public isMine(item: Etut | Homework): boolean {
    return 'dueDate' in item ? this.isMyHomework(item as Homework) : this.isMyEtut(item as Etut);
  }
  /** Ödevin sahibi öğretmenin kimliği ve adı (öğretmene göre süzme) */
  public homeworkOwner(hw: Homework): { id: string; name: string } {
    const ids = this.homeworkOwnerIds(hw);
    const t = ids.length ? this.teachers.find((x) => x.id === ids[0]) : undefined;
    const name = t?.name || hw.teacherName || hw.createdByName || 'Bilinmeyen öğretmen';
    return { id: t?.id || hw.teacherId || hw.teacherAuthId || `ad:${name}`, name };
  }
  /** Not / yoklama kaydını giren öğretmen (giriş hesabından) */
  public teacherByAuthId(authId?: string | null): Teacher | undefined {
    if (!authId) return undefined;
    return this.teachers.find((t) => t.auth_user_id === authId);
  }

  /** Görünürlüğü veritabanı belirler (yüklenen kayıtların hepsi bu kişiye açıktır) */
  protected roleTrustsDb(): boolean {
    return this.roleWideView() || this.hasRole('zumre_baskani') || this.roleEtutOnly();
  }
  /** Veli iletişim bilgilerini görebilir mi (anahtar açıkken: yönetici, Rehberlik, Ölçme Değerlendirme) */
  public canSeeParentContacts(): boolean {
    if (!this.rolesActive() || this.isKurumAdmin()) return true;
    return this.permOr('veli_bilgi', () => this.roleWideView()); // Aşama 143: contact_role_ok ile aynı
  }
  /** Veli duyurusu (e-posta / SMS) gönderebilir mi — rol yetkileri açıkken yönetici, Rehberlik, Ölçme Değerlendirme */
  public canSendParentAnnouncements(): boolean {
    if (!this.rolesActive() || this.isKurumAdmin()) return true;
    return this.permOr('duyuru', () => this.roleWideView()); // Aşama 143: duyuru_ok ile aynı
  }
  /**
   * Aşama 143: sınav karnesi gönderebilir mi (e-posta / SMS / link iptali). Veritabanındaki karne_can_send ile aynı:
   * genel yönetici; deneme modülü açık kurumda yönetici, Rehberlik, Ölçme Değerlendirme ya da kişiye özel izin.
   */
  public canSendKarne(): boolean {
    if (this.isHeadAdmin()) return true;
    if (!this.myKurum.kurumId || this.myKurum.modules?.deneme !== true) return false;
    return this.permOr('karne_gonder', () => this.isKurumAdmin() || this.roleWideView());
  }
  /** Mesajlar › Etüt Notları sekmesi açık mı (Ölçme Değerlendirme gibi etütle ilgisi olmayan roller görmez) */
  public canSeeEtutNotesTab(): boolean {
    if (!this.rolesActive() || this.isKurumAdmin()) return true;
    const r = this.myKurum.roles || [];
    return r.length === 0 || r.some((x) => x === 'rehberlik' || x === 'ogretmen' || x === 'zumre_baskani' || x === 'etut_ogretmeni');
  }
  /** Rol menüsü: bu sekme rollerime açık mı (anahtar kapalıysa her sekme açık; kurum bölüm izinleri ayrıca uygulanır) */
  protected roleAllowsTab(tab: TeacherTabType): boolean {
    if (!this.rolesActive() || this.isKurumAdmin()) return true;
    // Aşama 83: müdürün kişiye özel kapattığı / açtığı bölüm rolden önce gelir
    const sec = this.myKurum.sections || { allow: [], deny: [] };
    if ((sec.deny || []).includes(tab)) return false;
    if ((sec.allow || []).includes(tab)) return true;
    const roles = this.myKurum.roles || [];
    if (roles.length === 0) return true; // rolü verilmemiş öğretmen: bugünkü gibi
    if (roles.includes('mudur') || roles.includes('mudur_yardimcisi')) return true; // Aşama 337: idare bütün bölümleri açar (role_section_ok ile aynı)
    const allowed = new Set<TeacherTabType>();
    const add = (...tabs: TeacherTabType[]) => tabs.forEach((t) => allowed.add(t));
    if (roles.includes('rehberlik')) add('home', 'students', 'homework', 'etuts', 'messages', 'archive', 'grades', 'question_tracking', 'deneme', 'akademik_takvim');
    if (roles.includes('olcme_degerlendirme')) add('home', 'students', 'messages', 'archive', 'deneme', 'akademik_takvim');
    if (roles.includes('ogretmen') || roles.includes('zumre_baskani'))
      add('home', 'students', 'homework', 'etuts', 'messages', 'archive', 'grades', 'question_tracking', 'deneme', 'akademik_takvim'); // 242: takvim okunur
    if (roles.includes('etut_ogretmeni')) add('etuts');
    return allowed.has(tab);
  }
  /** Deneme sonuçlarını okuyup düzenleyebilir mi (Genel yönetici, kurum yöneticisi, Ölçme Değerlendirme) */
  public canManageDeneme(): boolean {
    if (this.isHeadAdmin()) return true;
    const mod = this.myKurum.modules?.deneme === true;
    // Aşama 143: kişiye özel "Deneme yükleme / düzenleme" izni (deneme_can_manage ile aynı)
    return mod && (this.isKurumAdmin() || this.permOr('deneme_yonet', () => this.hasRole('olcme_degerlendirme')));
  }
  /**
   * Aşama 102: Deneme Analizi'nde yalnızca öğrenci / sınıf karnesini ve puan sıralamasını gören öğretmen
   * (Öğretmen, Zümre Başkanı, Etüt Öğretmeni). Rol yetkileri anahtarından bağımsızdır; yönetici, Müdür,
   * Müdür Yrd., Rehberlik ve Ölçme Değerlendirme bu kısıtın dışındadır.
   */
  public isPlainDenemeViewer(): boolean {
    if (this.getAuthSession()?.role !== 'teacher') return false;
    if (this.isHeadAdmin() || this.isCurrentUserAdmin() || this.canManageDeneme()) return false;
    const wide = ['mudur', 'mudur_yardimcisi', 'rehberlik', 'olcme_degerlendirme'];
    return !(this.myKurum.roles || []).some((r) => wide.includes(r));
  }
  /** Öğrenci düzenleyebilir mi (yönetici, Rehberlik, Ölçme Değerlendirme) */
  public canEditStudents(): boolean {
    if (!this.myKurum.supported) return this.canManageStudents();
    if (this.isHeadAdmin()) return true;
    // Aşama 143: kişiye özel "Öğrenci düzenleme" izni (kurum_student_editor ile aynı)
    // Aşama 270: rol yetkileri KAPALI kurumda da kişiye "Öğrenci düzenleme" Açık verilmişse geçerlidir (SQL 270 ile aynı)
    const kisiIzni = !this.rolesActive() && !!this.myKurum.kurumId && (this.myKurum.sections?.allow || []).includes('izin:ogrenci_duzenle');
    return (this.isKurumAdmin() || kisiIzni || this.permOr('ogrenci_duzenle', () => this.roleWideView())) && this.canUseModule('manage_students');
  }
  /** Bu öğrenci silinebilir mi (yönetici; müdür izin verdiyse Rehberlik / Ölçme Değerlendirme) */
  public canDeleteStudent(student?: Student | null): boolean {
    if (!student) return false;
    if (!this.myKurum.supported) return this.canManageStudents();
    if (this.isHeadAdmin()) return true;
    return this.canManageStudents() && !!student.kurumId && student.kurumId === this.myKurum.kurumId;
  }

  // ===========================================================================
  // Aşama 40: MAHREMİYET — bir öğretmenin çalışmasını (etüt ayrıntıları, ödev) kim görebilir?
  //  - Çalışmanın sahibi öğretmen(ler)
  //  - Genel yönetici (her şeyi görür)
  //  - Kurum yöneticisi: YALNIZCA kendi kurumuna kayıtlı öğretmenlerin çalışmaları
  //    (genel yöneticinin kaydettiği öğretmenlerin çalışmaları kurum yöneticisine görünmez)
  //  - Diğer öğretmenler: göremez (etütte yalnızca gün / saat / öğretmen / sınıf bilgisi)
  // ===========================================================================
  protected privacyFoldCache = new Map<string, string>(); // Aşama 103: aynı ad tekrar tekrar dönüştürülmez
  protected privacyFold(v?: string | null): string {
    const k = v || '';
    let r = this.privacyFoldCache.get(k);
    if (r === undefined) {
      if (this.privacyFoldCache.size > 5000) this.privacyFoldCache.clear();
      r = k.trim().toLocaleLowerCase('tr-TR');
      this.privacyFoldCache.set(k, r);
    }
    return r;
  }
  /** Etüdün sahibi öğretmen mi (kaydeden ya da etüt öğretmeni; eski kayıtlarda ad eşleşmesi) */
  public isMyEtut(e: Etut): boolean {
    const me = this.getCurrentTeacher();
    if (!me) return false;
    if (e.createdById && e.createdById === me.id) return true;
    if (e.teacherId && e.teacherId === me.id) return true;
    if (e.teacherIds && e.teacherIds.includes(me.id)) return true;
    const myName = this.privacyFold(me.name);
    if (!myName) return false;
    if (!e.teacherId && !(e.teacherIds && e.teacherIds.length) && this.privacyFold(e.teacherName) === myName) return true;
    if (!e.createdById && this.privacyFold(e.createdByName) === myName) return true;
    return false;
  }
  /** Verilen öğretmen kimliklerinden biri oturumdaki kurum yöneticisinin kurumuna kayıtlı mı */
  protected ownersInMyKurum(ownerIds: Array<string | undefined | null>): boolean {
    if (!this.isKurumAdmin()) return false;
    const kid = this.getMyKurumId();
    if (!kid) return false;
    return ownerIds.some((id) => !!id && this.teachers.some((t) => t.id === id && (t.kurumId || null) === kid));
  }
  /** Etüdün özel bilgilerini (yorum, not, konu, yoklama) görebilir mi */
  public canSeeEtutDetails(e: Etut): boolean {
    const session = this.getAuthSession();
    if (session?.role !== 'teacher') return false;
    if (this.isHeadAdmin()) return true;
    if (this.isMyEtut(e)) return true;
    // Aşama 82: Rehberlik / Zümre Başkanı — veritabanı tam kaydı verdiyse ayrıntıyı görür (değiştiremez)
    if (this.roleSeesOthersWork() && !e.privacyRedacted && !isRedactedRow(e)) return true;
    // Aşama 111: idare (Müdür / Müdür Yrd.) yoklama ve yorumları görür; veritabanı tam kaydı yalnız kendi kurumundan verir
    // (dış etüt öğretmeninin "ext-" kimliği öğretmen listesinde olmadığından önceden ayrıntı kapanıyordu)
    if (this.isKurumAdmin() && !e.privacyRedacted && !isRedactedRow(e)) return true;
    return this.ownersInMyKurum([e.createdById, e.teacherId, ...(e.teacherIds || [])]);
  }
  /** Etüdü değiştirebilir mi (sahibi, genel yönetici, kurum yöneticisi) */
  protected canEditEtut(e: Etut): boolean {
    if (this.isHeadAdmin()) return true;
    if (this.isMyEtut(e)) return true;
    return this.ownersInMyKurum([e.createdById, e.teacherId, ...(e.teacherIds || [])]);
  }
  protected assertEtutEditable(id: string): void {
    const e = this.etuts.find((x) => x.id === id);
    if (e && this.getAuthSession()?.role === 'teacher' && (e.privacyRedacted || !this.canEditEtut(e))) {
      throw new Error('Bu etüt başka bir öğretmene ait; yalnızca etüdü veren öğretmen ve yönetici değiştirebilir.');
    }
  }
  /** Aşama 82: Rehberlik / Zümre Başkanı başkasının ödevini yalnızca görür; değiştiremez */
  protected assertHomeworkEditable(hw: Homework): void {
    if (this.getAuthSession()?.role !== 'teacher' || this.isHeadAdmin() || this.isKurumAdmin()) return;
    if (this.roleSeesOthersWork() && !this.isMyHomework(hw)) {
      const msg = 'Bu ödev başka bir öğretmene ait; yalnızca görüntüleyebilirsiniz. Değişikliği ödevi veren öğretmen yapabilir.';
      this.showFloatingErrorToast(msg);
      throw new Error(msg);
    }
  }
  /** Ödevin sahibi öğretmen mi */
  protected isMyHomework(hw: Homework, teacher?: Teacher | null): boolean {
    const me = teacher || this.getCurrentTeacher();
    if (!me) return false;
    if ((!!me.auth_user_id && hw.teacherAuthId === me.auth_user_id) || hw.teacherId === me.id) return true;
    // Aşama 109: ad eşleşmesi yalnız sahip kimliği hiç yazılmamış eski kayıtlarda (aynı adlı iki öğretmen karışmaz)
    return !hw.teacherId && !hw.teacherAuthId && !!me.name && hw.createdByName === me.name;
  }
  /** Ödevin sahibi öğretmen(ler)in kimlikleri (kimlik ya da giriş hesabı ya da ad eşleşmesiyle) */
  protected homeworkOwnerIds(hw: Homework): string[] {
    const ids = new Set<string>();
    if (hw.teacherId) ids.add(hw.teacherId);
    for (const t of this.teachers) {
      if ((hw.teacherAuthId && t.auth_user_id === hw.teacherAuthId) || (!hw.teacherId && !hw.teacherAuthId && hw.createdByName && t.name === hw.createdByName)) ids.add(t.id);
    }
    return Array.from(ids);
  }

  public getMyKurumId(): string | null {
    if (!this.myKurum.supported || this.isHeadAdmin()) return null;
    return this.myKurum.kurumId || null;
  }

  // Kurumuna bu bölüm açık mı? (genel yönetici ve kurumsuz öğretmenler için her zaman açık)
  public canUseModule(module: KurumModule): boolean {
    if (!this.myKurum.supported || this.isHeadAdmin() || !this.myKurum.kurumId) return true;
    return this.myKurum.modules?.[module] === true;
  }

  // Öğretmen sekmesi bu kullanıcıya açık mı?
  public canUseTab(tab: TeacherTabType): boolean {
    // Aşama 234: "Dersler" sekmesi ders programında dersi olan öğretmene not izninden bağımsız açılır
    if (tab === 'grades' && this.dersProgramiErisimi()) return true;
    return this.canUseTabBase(tab);
  }

  protected canUseTabBase(tab: TeacherTabType): boolean {
    // Aşama 259: sistem sahibinin kendi paneli yalnız yönetim merkezidir (ana sayfa, yönetim, deneme analizi).
    // Ders işleri bireysel hesaptan ya da kurumdaki öğretmen hesabından yapılır; kuruma geçince o kurumun kuralları geçerlidir.
    if (this.yonetimMerkezi() && !SISTEM_SAHIBI_SEKMELERI.includes(tab)) return false;
    const mod = TAB_MODULES[tab];
    if (tab === 'user_management') return this.canAccessUserManagement();
    if (!this.roleAllowsTab(tab)) return false; // Aşama 82: rol menüsü
    if (tab === 'deneme') return this.canUseDeneme();
    if (tab === 'akademik_takvim') return this.akademikTakvimSayfasi(); // Aşama 242 · 337: ayrı sayfa yalnız idare, Rehberlik, Ölçme
    return mod ? this.canUseModule(mod) : true;
  }

  /**
   * Aşama 242: Akademik takvim yalnız kurum içinde ve genel yöneticinin bölümü AÇTIĞI kurumda çalışır
   * (genel yöneticinin kendi paneli ve kurumsuz öğretmen için kapalı; kuruma geçince o kurumun anahtarına bakılır).
   * Veritabanı da aynı kuralı uygular (sql/242: akademik_takvim_acik).
   */
  public akademikTakvimAcik(): boolean {
    return this.myKurum.supported && !!this.getMyKurumId() && this.myKurum.modules?.akademik_takvim === true;
  }
  /** Aşama 337: takvimin bütününü gören idare (kurum yöneticisi, Müdür, Müdür Yrd.). Veritabanı aynı kuralı uygular (sql/337);
   *  öğretmen yalnız üyesi olduğu zümrenin ve zümresi yazılmamış okul geneli etkinliklerini okur. */
  public akademikTakvimIdare(): boolean {
    return this.akademikTakvimAcik() && (this.isKurumAdmin() || this.hasRole('mudur') || this.hasRole('mudur_yardimcisi'));
  }
  /** Aşama 337: ayrı "Akademik takvim" sayfası: idare + Rehberlik / Ölçme. Öğretmen etkinlikleri ana sayfasındaki haftada görür. */
  public akademikTakvimSayfasi(): boolean {
    return this.akademikTakvimAcik() && (this.akademikTakvimIdare() || this.roleWideView());
  }
  /** Aşama 242: takvimi yükleyip düzenleyebilir mi (kurum yöneticisi: Müdür, Müdür Yrd.) */
  public canManageAkademikTakvim(): boolean {
    return this.akademikTakvimAcik() && this.isKurumAdmin();
  }

  // Aşama 47: Deneme Analizi yalnızca genel yöneticiye ve bölümü açılmış kurumun YÖNETİCİLERİNE açıktır
  // (kurumsuz ya da yönetici olmayan öğretmenlere hiçbir zaman açılmaz)
  public canUseDeneme(): boolean {
    if (this.isHeadAdmin()) return true;
    if (this.myKurum.modules?.deneme !== true) return false;
    if (this.isKurumAdmin()) return true;
    // Aşama 82: Ölçme (düzenler), Rehberlik / Öğretmen / Zümre Başkanı (salt okunur)
    // Aşama 83: müdürün kişiye özel açtığı kişi de görür (salt okunur); kapattıysa göremez
    if (this.rolesActive() && (this.myKurum.sections?.deny || []).includes('deneme')) return false;
    if (this.sectionExplicitAllow('deneme')) return true;
    return ['olcme_degerlendirme', 'rehberlik', 'ogretmen', 'zumre_baskani'].some((r) => this.hasRole(r));
  }

  // Öğrenci ve sınıf ekleme/çıkarma/düzenleme
  public canManageStudents(): boolean {
    if (!this.myKurum.supported) return this.isCurrentUserAdmin() || this.getClasses().length > 0;
    if (this.isHeadAdmin()) return true;
    // Aşama 82: öğrenci ekle / sil — yönetici (Müdür, Müdür Yrd.), müdür izin verdiyse Rehberlik
    // Aşama 108: Ölçme Değerlendirme de yalnızca kurum ayarındaki izinle (veritabanındaki kurum_student_adder ile aynı)
    const rs = this.myKurum.roleSettings || {};
    // Aşama 143: kişiye özel "Öğrenci ekleme / silme" izni (kurum_student_adder ile aynı)
    const roleAdder = this.permOr(
      'ogrenci_ekle_sil',
      () => (this.hasRole('rehberlik') && rs.rehberlik_ogrenci_ekle === true) || (this.hasRole('olcme_degerlendirme') && rs.olcme_ogrenci_ekle === true)
    );
    return (this.isKurumAdmin() || roleAdder) && this.canUseModule('manage_students');
  }

  public canManageClasses(): boolean {
    if (!this.myKurum.supported) return this.isCurrentUserAdmin();
    // Aşama 82: rol yetkileri açıkken sınıf ekle / sil / düzenle yalnızca Müdür / Müdür Yardımcısı
    if (this.rolesActive()) return this.isKurumAdmin() && this.canUseModule('manage_students');
    return this.canManageStudents();
  }

  // Öğretmen ekleme/çıkarma ve sınıf yetkisi verme
  public canManageTeachers(): boolean {
    if (!this.myKurum.supported) return this.isCurrentUserAdmin();
    if (this.isHeadAdmin()) return true;
    return this.isKurumAdmin() && this.canUseModule('manage_teachers');
  }

  public canAccessUserManagement(): boolean {
    if (!this.myKurum.supported) return this.isCurrentUserAdmin();
    return this.isHeadAdmin() || (this.isKurumAdmin() && (this.canUseModule('manage_teachers') || this.canUseModule('manage_students')));
  }

  // Bu sınıf düzenlenebilir/silinebilir mi? (kurum yöneticisi: yalnızca kendi açtığı sınıflar)
  public canManageClass(cls?: ClassGroup | null): boolean {
    if (!cls) return false;
    if (!this.myKurum.supported) return this.canManageStudents();
    if (this.isHeadAdmin()) return true;
    return this.canManageClasses() && !!cls.kurumId && cls.kurumId === this.myKurum.kurumId;
  }

  /**
   * Aşama 76: Bu sınıfa YENİ ÖĞRENCİ eklenebilir mi?
   * Kurum yöneticisi: kendi kurumunun açtığı sınıflar + genel yöneticinin kurumuna izin verdiği sınıflar.
   * (Sınıfı düzenleme / silme yetkisi ayrıdır: canManageClass.)
   */
  public canAddStudentToClass(cls?: ClassGroup | null): boolean {
    if (!cls) return false;
    if (!this.myKurum.supported) return this.canManageStudents();
    if (this.isHeadAdmin()) return true;
    if (!this.canManageStudents()) return false;
    const own = !!cls.kurumId && cls.kurumId === this.myKurum.kurumId;
    const granted = (this.myKurum.grantedClassIds || []).includes(cls.id);
    return own || granted;
  }

  // Bu öğrenci düzenlenebilir/silinebilir mi?
  public canManageStudent(student?: Student | null): boolean {
    if (!student) return false;
    if (!this.myKurum.supported) return this.canManageStudents();
    if (this.isHeadAdmin()) return true;
    // Aşama 82: düzenleme — yönetici, Rehberlik, Ölçme Değerlendirme (silme ayrı: canDeleteStudent)
    return this.canEditStudents() && !!student.kurumId && student.kurumId === this.myKurum.kurumId;
  }

  // Bu öğretmen hesabı yönetilebilir mi? (kurum yöneticisi: kendi kurumunun yönetici olmayan öğretmenleri)
  public canManageTeacherAccount(teacher?: { id: string; isAdmin?: boolean; kurumId?: string | null } | null): boolean {
    if (!teacher) return false;
    if (!this.myKurum.supported) return this.isCurrentUserAdmin();
    if (this.isHeadAdmin()) return true;
    const me = this.getCurrentTeacher();
    if (me && me.id === teacher.id) return false;
    return this.canManageTeachers() && !teacher.isAdmin && !!teacher.kurumId && teacher.kurumId === this.myKurum.kurumId;
  }

  public getKurumNameForId(kurumId?: string | null): string {
    if (!kurumId) return '';
    if (kurumId === this.myKurum.kurumId) return this.myKurum.kurumName || 'Kurumum';
    return this.kurumNameCache.get(kurumId) || 'Kurum';
  }

  // --- Genel yönetici: kurum listesi, bölüm izinleri ve izinli sınıflar ---
  protected kurumNameCache = new Map<string, string>();

  public async listKurumlar(): Promise<KurumInfo[]> {
    if (!this.isHeadAdmin()) return [];
    // Aşama 258: tür sütunu (258 SQL'i yoksa sütunsuz okunur)
    const oku = async () => {
      const r = await supabase.from('kurumlar').select('id,name,modules,created_at,tur').order('created_at');
      return r.error?.code === '42703' ? supabase.from('kurumlar').select('id,name,modules,created_at').order('created_at') : r;
    };
    const [k, g] = await Promise.all([oku(), supabase.from('kurum_class_grants').select('kurum_id,class_id')]);
    if (k.error) throw new Error(k.error.message?.includes('kurumlar') ? 'Kurum tablosu bulunamadı (17 numaralı SQL çalıştırılmalı).' : k.error.message);
    const grants = new Map<string, string[]>();
    (g.data || []).forEach((r: any) => {
      const list = grants.get(r.kurum_id) || [];
      list.push(String(r.class_id));
      grants.set(r.kurum_id, list);
    });
    const list: KurumInfo[] = (k.data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      modules: r.modules || {},
      grantedClassIds: grants.get(r.id) || [],
      createdAt: r.created_at,
      tur: r.tur === 'bireysel' ? 'bireysel' : 'kurum',
    }));
    let namesChanged = false;
    list.forEach((x) => {
      if (this.kurumNameCache.get(x.id) !== x.name) namesChanged = true;
      this.kurumNameCache.set(x.id, x.name);
    });
    if (namesChanged) this.notify();
    return list;
  }

  public async saveKurum(kurum: { id: string; name: string; modules: Partial<Record<KurumModule, boolean>>; grantedClassIds: string[] }): Promise<void> {
    if (!this.isHeadAdmin()) throw new Error('Kurum ayarlarını yalnızca genel yönetici değiştirebilir.');
    const name = (kurum.name || '').trim();
    if (name.length < 2) throw new Error('Kurum adı en az 2 karakter olmalıdır.');
    const modules: Record<string, boolean> = {};
    KURUM_MODULES.forEach((m) => (modules[m.key] = kurum.modules?.[m.key] === true));
    const up = await supabase.from('kurumlar').update({ name, modules }).eq('id', kurum.id).select('id');
    if (up.error) throw new Error(up.error.message);
    if (!up.data || up.data.length === 0) throw new Error('Kurum bulunamadı veya yetkiniz yok.');

    const { data: cur, error: curErr } = await supabase.from('kurum_class_grants').select('class_id').eq('kurum_id', kurum.id);
    if (curErr) throw new Error(curErr.message);
    const before = new Set((cur || []).map((r: any) => String(r.class_id)));
    const after = new Set(kurum.grantedClassIds.map(String));
    const toAdd = [...after].filter((x) => !before.has(x));
    const toRemove = [...before].filter((x) => !after.has(x));
    if (toAdd.length) {
      const { error } = await supabase.from('kurum_class_grants').upsert(
        toAdd.map((class_id) => ({ kurum_id: kurum.id, class_id })),
        { onConflict: 'kurum_id,class_id', ignoreDuplicates: true }
      );
      if (error) throw new Error(error.message);
    }
    if (toRemove.length) {
      const { error } = await supabase.from('kurum_class_grants').delete().eq('kurum_id', kurum.id).in('class_id', toRemove);
      if (error) throw new Error(error.message);
    }
    this.kurumNameCache.set(kurum.id, name);
    this.notify();
  }

  // ===========================================================================
  // Aşama 9: Branşa göre ders sınırı ve etüt öğretmenleri
  // ===========================================================================
  // Yönetici için null (tüm dersler). Yönetici olmayan öğretmen için kendi branşının ders(ler)i.
  public getMySubjects(): string[] | null {
    if (this.isCurrentUserAdmin()) return null;
    const t = this.getCurrentTeacher();
    const list = subjectsForBranch(t?.branch);
    return list.length > 0 ? list : null;
  }

  // Aşama 261: Haftalık planın ders sınırı. Yalnız öğretmen kendi branşının dersini görür; yönetici, rehberlik,
  // ölçme ve idare (müdür / müdür yrd.) bütün dersleri görür. Veritabanındaki plan_subject_ok() ile aynı kural.
  public getMyPlanSubjects(): string[] | null {
    if (this.isCurrentUserAdmin()) return null;
    if (PLAN_GENIS_ROLLER.some((r) => this.hasRole(r))) return null;
    const b = (this.getCurrentTeacher()?.branch || '').toLocaleLowerCase('tr');
    if (b.includes('rehber') || b.includes('psikolojik')) return null;
    return this.getMySubjects();
  }

  /** Aşama 261: "Görev ekle" ilk açılışta açan kişinin branşındaki dersle açılır (listede yoksa ilk ders) */
  public planVarsayilanDers(options: string[]): string {
    const mine = subjectsForBranch(this.getCurrentTeacher()?.branch);
    return options.find((o) => mine.some((m) => sameSubjectName(m, o))) || options[0] || '';
  }
}
