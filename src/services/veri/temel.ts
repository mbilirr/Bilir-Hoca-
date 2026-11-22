// ============================================================================
// Aşama 358: VERİ TEMELİ: değişiklik bildirimi, görünüm önbelleği, eşitleme zamanı, oturum bilgisi, uyarı yazıları, öğrenci görünümü önizlemesi
// dataService.ts'ten KELİMESİ KELİMESİNE taşındı; yalnız "private" → "protected" (alt katmanlar kullanabilsin diye) ve
// statik değerlerde "DataService." → tanımlandığı katmanın adı. Davranış aynı. Katman sırası: temel → kurumYetki → bulutDepo → esitleme → dataService
// ============================================================================
import { Student, Teacher, AuthSession } from '../../types';
import { STORAGE_KEYS, appStorage } from '../depo';
import { sameData, adoptList } from '../listeBirlestirme';
import { bildir, hataBildir, hataMetniniBol } from '../../lib/bildirim';
import { EMPTY_KURUM_STATE, loadMyKurumCache, type MyKurumState, type PortalKod } from '../kurumTanimlari';
import { currentEpoch, konuKesisir, type VeriKonusu, type VeriDinleyici } from './ortak';
// Bu modülde "localStorage" adı depodaki yönlendiriciyi ifade eder (dataService.ts ile aynı)
const localStorage = appStorage;

export abstract class VeriTemeli {
  // Üst katmanlarda tanımlı olup burada kullanılanlar
  protected abstract scheduleSecureSave(): void;
  public abstract logout(elle?: boolean): void;
  public abstract setupAllRealtimeSync(): void;
  public abstract revalidateAndSyncAll(isBackground?: boolean, shortGap?: boolean): Promise<void>;
  public abstract unsubscribeAllRealtime(): void;

  public teachers: Teacher[] = [];
  public students: Student[] = [];
  public deletedStudentIds: Set<string> = new Set();
  public deletedClassIds: Set<string> = new Set();

  protected listeners: { dinle: VeriDinleyici; konular: ReadonlySet<VeriKonusu> | null }[] = [];
  protected lastSyncTimestamp: number = Date.now();
  protected sessionDeviceId: string = '';

  /**
   * Aşama 349b: veri değişince haber ver. `konular` verilirse dinleyici yalnız o konulardan biri değişince
   * (ya da konusu belirsiz, genel bir değişiklikte) çağrılır; verilmezse her değişiklikte (eskisi gibi).
   * Konu listesi bileşenin gerçekten okuduğu verileri kapsamalı: scripts/sayfa-konulari.mjs bunu denetler.
   */
  public subscribe(listener: VeriDinleyici, konular?: readonly VeriKonusu[]): () => void {
    const kayit = { dinle: listener, konular: konular ? new Set(konular) : null };
    this.listeners.push(kayit);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== kayit);
    };
  }

  // HIZ (Aşama 15): Aynı anda gelen değişiklik bildirimleri birleştirilir; ekran art arda
  // defalarca değil, bir kez yenilenir (eşitlemede 15 tablo ayrı ayrı gelir).
  protected dataVersion = 0;
  protected notifyTimer: ReturnType<typeof setTimeout> | null = null;
  protected notifyFirstAt = 0;
  public bumpDataVersion(): void {
    this.dataVersion++;
  }
  // Aşama 349b: bu yenilemede değişen veri konuları (null = konusu belirsiz, her şey yenilenir)
  protected bekleyenKonular: Set<VeriKonusu> | null = new Set();
  /** Veri sürümü: her değişiklikte artar (seçici kancaların önbelleği için). */
  public get veriSurumu(): number {
    return this.dataVersion;
  }
  /**
   * Konu verilmeden çağrılırsa "her şey değişmiş olabilir" sayılır (eskisi gibi bütün ekran yenilenir).
   * Konu yalnız o listeden başka hiçbir şeye dokunmayan eşitleme / anlık olay yerlerinde verilir.
   */
  protected notify(...konular: VeriKonusu[]) {
    if (!konular.length) this.bekleyenKonular = null;
    else if (this.bekleyenKonular) for (const k of konular) this.bekleyenKonular.add(k);
    this.lastSyncTimestamp = Date.now();
    this.dataVersion++;
    if (this.secureSaveRefs) this.scheduleSecureSave();
    const now = Date.now();
    if (!this.notifyTimer) this.notifyFirstAt = now;
    else clearTimeout(this.notifyTimer);
    // en geç 250 ms içinde mutlaka yenilenir
    const delay = now - this.notifyFirstAt >= 250 ? 0 : 40;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      const degisen = this.bekleyenKonular;
      this.bekleyenKonular = new Set();
      if (degisen && !degisen.size) return;
      this.listeners.slice().forEach((l) => {
        if (degisen && l.konular && !konuKesisir(degisen, l.konular)) return;
        try {
          l.dinle(degisen);
        } catch (e) {
          console.warn('[notify] dinleyici hatası:', e);
        }
      });
    }, delay);
  }

  // Görünüm önbelleği: aynı veriyle tekrar tekrar yeni dizi üretilmez (ekranlar boşuna yeniden hesaplamaz).
  // Veri değişince (bildirim/kayıt) ya da kaynak dizide herhangi bir öğe değişince yeniden hesaplanır.
  protected viewCache = new Map<string, { v: number; key: string; srcs: any[][]; copies: any[][]; val: any; ep: number }>();
  protected memoView<T>(name: string, srcs: any[][], key: string, compute: () => T): T {
    const c = this.viewCache.get(name);
    // Aşama 84: aynı çizim sırasında tekrar tekrar istenen görünüm, kaynak listeler baştan sona
    // yeniden karşılaştırılmadan verilir (değişiklikler zaten sürüm numarasını artırır)
    if (c && c.v === this.dataVersion && c.key === key && c.srcs.length === srcs.length && c.ep === currentEpoch()) {
      let sameRefs = true;
      for (let i = 0; i < srcs.length; i++) if (c.srcs[i] !== srcs[i] || srcs[i].length !== c.copies[i].length) { sameRefs = false; break; }
      if (sameRefs) return c.val as T;
    }
    if (c && c.v === this.dataVersion && c.key === key && c.srcs.length === srcs.length) {
      let same = true;
      for (let i = 0; i < srcs.length && same; i++) {
        const a = srcs[i];
        const b = c.copies[i];
        if (c.srcs[i] !== a || a.length !== b.length) same = false;
        else for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) { same = false; break; }
      }
      if (same) {
        c.ep = currentEpoch();
        return c.val as T;
      }
    }
    let val = compute();
    // Aşama 84: sonuç öncekiyle aynıysa önceki sonuç verilir (ekranlar boşuna yeniden çizilmez)
    if (c && c.key === key) {
      if (Array.isArray(val) && Array.isArray(c.val)) val = adoptList(c.val, val) as unknown as T;
      else if (sameData(c.val, val)) val = c.val as T;
    }
    this.viewCache.set(name, { v: this.dataVersion, key, srcs, copies: srcs.map((a) => a.slice()), val, ep: currentEpoch() });
    return val;
  }
  protected viewKey(extra = ''): string {
    let raw = '';
    try {
      raw = sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION) || '';
    } catch {}
    if (raw !== this.lastSessionRaw) {
      let h = 5381;
      for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
      this.lastSessionRaw = raw;
      this.lastSessionHash = `${raw.length}:${h}`;
    }
    const acc = this.myTeacherAccess;
    const k = this.myKurum;
    const roleKey = k ? `${k.kurumAdmin ? 1 : 0}${k.rolesEnabled ? 1 : 0}${(k.roles || []).join('.')}${k.roleSettings?.rehberlik_ogrenci_ekle ? 1 : 0}${k.roleSettings?.olcme_ogrenci_ekle ? 1 : 0}` : '';
    return `${extra}|${this.lastSessionHash}|${acc.loaded ? 1 : 0}:${acc.classIds.size}:${acc.studentIds.size}|${this.deletedStudentIds.size}:${this.deletedClassIds.size}|${roleKey}|${this.portalAktif || ''}`;
  }
  protected lastSessionRaw = '';
  protected lastSessionHash = '';

  public getSessionDeviceId(): string {
    if (!this.sessionDeviceId) {
      try {
        let devId = sessionStorage.getItem('edu_sys_device_session_id');
        if (!devId) {
          devId = 'DEV-' + Math.random().toString(36).substring(2, 7).toUpperCase();
          sessionStorage.setItem('edu_sys_device_session_id', devId);
        }
        this.sessionDeviceId = devId;
      } catch {
        this.sessionDeviceId = 'DEV-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      }
    }
    return this.sessionDeviceId;
  }

  public getLastSyncTimestamp(): number {
    return this.lastSyncTimestamp;
  }

  public getLastSyncTime(): Date {
    return new Date(this.lastSyncTimestamp);
  }

  public updateSyncTimestamp() {
    this.lastSyncTimestamp = Date.now();
    this.notify();
  }
  protected secureSaveRefs: { attendance: unknown; messages: unknown; grades: unknown } | null = null;
  protected static legacySessionKeyCleared = false;

  // Öğretmenin veritabanındaki erişim yetkileri (yöneticinin verdiği sınıf / öğrenci yetkileri).
  // Hangi sınıf ve öğrencilerin listeleneceği buna göre belirlenir; veritabanı kuralları (RLS) da aynı tabloları kullanır.
  protected myTeacherAccess: { classIds: Set<string>; studentIds: Set<string>; loaded: boolean } = {
    classIds: new Set(),
    studentIds: new Set(),
    loaded: false,
  };

  // ===========================================================================
  // Aşama 18: GENEL YÖNETİCİ VE KURUMLAR
  //  - Genel yönetici (m.bilirr@gmail.com): her şeyi görür ve yönetir.
  //  - Kurum yöneticisi: yalnızca kendi kurumunu yönetir (genel yöneticinin açtığı bölümlerle).
  //  - Öğretmen: öğrenci/sınıf/öğretmen ekleyip çıkaramaz; kurumuna açık bölümleri kullanır.
  // Veritabanı (17 numaralı SQL) aynı kuralları uygular; buradaki kontroller yalnızca ekranda
  // gereksiz düğmeleri gizler. SQL çalıştırılmadıysa eski davranış sürer.
  // ===========================================================================
  protected myKurum: MyKurumState = { ...EMPTY_KURUM_STATE, ...loadMyKurumCache() };
  protected portalAktif: PortalKod | null = null;

  // ===========================================================================
  // HIZ (Aşama 84): oturum bilgisi her çağrıda yeniden çözülmez. Saklanan oturum ve kişinin kaydı
  // değişmediyse AYNI nesne verilir: ekranlar her bildirimde "oturum değişti" sanıp baştan çizilmez.
  // ===========================================================================
  protected authCache: {
    raw: string;
    profileKey: string;
    profile: string | null;
    list: unknown[];
    len: number;
    idx: number;
    ref: unknown;
    val: AuthSession;
    ep: number;
  } | null = null;
  public getAuthSession(): AuthSession | null {
    const fast = this.authCache;
    // Aynı çizim sırasında depolama yeniden okunmaz; oturum yalnızca setAuthSession / çıkış ile değişir
    if (fast && fast.ep === currentEpoch()) {
      const list = fast.val.role === 'teacher' ? this.teachers : this.students;
      if (list === fast.list && list.length === fast.len && (fast.idx < 0 || list[fast.idx] === fast.ref)) return fast.val;
    }
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {
      raw = null;
    }
    const c = this.authCache;
    if (raw && c && c.raw === raw) {
      let profile: string | null = null;
      if (c.profileKey) {
        try {
          profile = localStorage.getItem(c.profileKey);
        } catch {}
      }
      const list = c.val.role === 'teacher' ? this.teachers : this.students;
      if (profile === c.profile && list === c.list && list.length === c.len && (c.idx < 0 || list[c.idx] === c.ref)) {
        c.ep = currentEpoch();
        return c.val;
      }
    }
    this.authCache = null;
    const val = this.readAuthSession(raw);
    if (raw && val && val.user) {
      const list = (val.role === 'teacher' ? this.teachers : this.students) as unknown[];
      const id = (val.user as any).id;
      const idx = list.findIndex((x: any) => x && x.id === id);
      const profileKey = val.role === 'teacher' ? `edu_sys_teacher_custom_profile_${id}` : '';
      let profile: string | null = null;
      if (profileKey) {
        try {
          profile = localStorage.getItem(profileKey);
        } catch {}
      }
      this.authCache = { raw, profileKey, profile, list, len: list.length, idx, ref: idx >= 0 ? list[idx] : null, val, ep: currentEpoch() };
    }
    return val;
  }

  protected readAuthSession(raw: string | null): AuthSession | null {
    // Sayfa kapatılıp açıldığında oturumu kapatmak için sessionStorage kullanılır
    let saved: AuthSession | null = null;
    try {
      if (raw) {
        saved = JSON.parse(raw);
      }
    } catch (e) {
      console.error('SessionStorage parse error:', e);
    }

    // Eski kalıntı localStorage oturum anahtarını temizle (bir kez yeterli)
    if (!VeriTemeli.legacySessionKeyCleared) {
      VeriTemeli.legacySessionKeyCleared = true;
      try {
        localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      } catch {}
    }

    if (saved && saved.user) {
      // Re-hydrate session user object from the current state so updates to name/username/branch/avatar are never lost
      if (saved.role === 'teacher') {
        const freshTeacher = this.teachers.find(
          (t) =>
            t.id === saved.user.id ||
            t.username?.toLowerCase() === (saved.user as Teacher).username?.toLowerCase() ||
            (t.email && (saved.user as Teacher).email && t.email.toLowerCase() === (saved.user as Teacher).email?.toLowerCase())
        );
        if (freshTeacher) {
          if (freshTeacher.isSuspended || freshTeacher.status === 'suspended') {
            this.logout();
            return null;
          }
          saved.user = freshTeacher;
        }

        // Apply any dedicated profile overrides stored in local storage
        try {
          const specific = localStorage.getItem(`edu_sys_teacher_custom_profile_${saved.user.id}`);
          if (specific) {
            saved.user = { ...saved.user, ...JSON.parse(specific) };
          }
        } catch {
          // ignore
        }

      } else if (saved.role === 'student') {
        const freshStudent = this.students.find(
          (s) =>
            s.id === saved.user.id ||
            s.username?.toLowerCase() === (saved.user as Student).username?.toLowerCase() ||
            (s.studentNumber && (saved.user as Student).studentNumber && s.studentNumber.toLowerCase() === (saved.user as Student).studentNumber?.toLowerCase())
        );
        if (freshStudent) {
          if (freshStudent.isSuspended || freshStudent.status === 'suspended') {
            this.logout();
            return null;
          }
          saved.user = freshStudent;
        }
      }
      return saved;
    }
    return null;
  }

  public setAuthSession(session: AuthSession | null): void {
    this.authCache = null; // Aşama 84
    if (session) {
      try {
        sessionStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(session));
      } catch (e) {
        console.error('SessionStorage set error:', e);
      }
      // Oturum açıldığında anlık dinleyicileri bağla ve bulut veritabanından en güncel verileri çek
      this.setupAllRealtimeSync();
      this.revalidateAndSyncAll(false);
    } else {
      try {
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      } catch {}
      this.unsubscribeAllRealtime();
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {}
    this.notify();
  }

  // Aşama 17: tarayıcının alert() penceresi yerine uygulama içi kısa bildirim
  // Aşama 348: ortak bildirim katmanına gider (lib/bildirim.ts; her sayfada aynı yer ve biçim)
  public showToast(message: string, tone: 'error' | 'success' | 'info' = 'success'): void {
    if (tone === 'error') return this.showFloatingErrorToast(message);
    bildir({ tur: tone === 'info' ? 'bilgi' : 'basari', baslik: message });
  }

  // ===========================================================================
  // Aşama 107: ÖĞRETMENİN "ÖĞRENCİ GÖRÜNÜMÜ" ÖNİZLEMESİ — salt okunur. Önizleme açıkken öğrenci adına
  // kayıt yapan işlemler çalışmaz (ekrandaki düğmeler de kapalıdır; bu ikinci emniyettir).
  // ===========================================================================
  protected studentPreview = false;
  public setStudentPreview(on: boolean): void {
    this.studentPreview = on;
  }
  public isStudentPreview(): boolean {
    return this.studentPreview && this.getAuthSession()?.role === 'teacher';
  }
  /** Önizlemede kapalı bir düğmeye basıldığında kısa uyarı */
  public showPreviewBlocked(): void {
    this.showFloatingErrorToast('Önizleme: öğrenci adına işlem yapılamaz.');
  }
  protected assertNotPreview(): void {
    if (!this.isStudentPreview()) return;
    const msg = 'Önizleme: öğrenci adına işlem yapılamaz.';
    this.showFloatingErrorToast(msg);
    throw new Error(msg);
  }

  // Aşama 348: hata bildirimi ortak katmanda. Eski tek satırlık "Hata: X (neden). …" yazısı başlık + ayrıntıya bölünür.
  // GÜVENLİK: metin (sunucu hata yazısı içerebilir) React ile düz yazı olarak çizilir, HTML olarak değil.
  protected showFloatingErrorToast(message: string, ayrinti?: string): void {
    const p = ayrinti ? { baslik: String(message).replace(/^\s*Hata:\s*/i, ''), ayrinti } : hataMetniniBol(message);
    hataBildir(p.baslik, p.ayrinti);
  }
}
