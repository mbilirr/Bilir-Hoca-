// ============================================================================
// Aşama 358: EŞİTLEME: anlık kanallar, küçük yoklamalar, buluttan okuma, tam eşitleme, silinen kayıt listeleri
// dataService.ts'ten KELİMESİ KELİMESİNE taşındı; yalnız "private" → "protected" (alt katmanlar kullanabilsin diye) ve
// statik değerlerde "DataService." → tanımlandığı katmanın adı. Davranış aynı. Katman sırası: temel → kurumYetki → bulutDepo → esitleme → dataService
// ============================================================================
import { hesapDurumunuDenetle } from '../kurumDurumu'; // Aşama 368
import {
  Student,
  Teacher,
  ClassGroup,
  Homework,
  HomeworkSubmission,
  Etut,
  AttendanceRecord,
  GradeRecord,
  StudentMessage,
  TeacherDocument,
  StudentQuestionLog,
  WeeklyQuestionTarget,
  EtutStudentAttendance,
} from '../../types';
import { supabase } from '../../lib/supabase';
import { sendBrowserNotification, playNotificationChime } from '../../lib/browserNotifications';
import { detectSchoolLevelFromGrade } from '../../constants/schoolConstants';
import { currentAcademicYear } from '../../lib/importNormalize';
import { cleanParents } from '../../lib/parents';
import { STORAGE_KEYS, saveData } from '../depo';
import {
  questionLogFromRow,
  questionTargetFromRow,
  rowToMessage,
  documentFromRow,
  yoklamaRowToAttendance,
} from '../satirDonusumleri';
import {
  adoptList,
  sortByTimeDesc,
  applyRealtimeBatch,
  mergeDelta,
  sortLogsDesc,
  byDateDesc,
  questionLogSig,
  mergeAttendance,
} from '../listeBirlestirme';
import { isEtutYoklamaMissing } from '../hataMetinleri';
import { isMissingGenderColumn } from '../hataMetinleri';
import { fetchAllRows, hasCloudSession } from '../bulutIslemleri';
import { normGender, ymdLocal, defaultQuestionWindowStart } from '../kayitKurallari';
import { agHatasiMi } from '../../lib/baglanti';
import { BulutDepoKatmani } from './bulutDepo';
import { cleanStudentEmail, type RealtimeTableCfg, type VeriKonusu } from './ortak';

export abstract class EsitlemeKatmani extends BulutDepoKatmani {
  // Üst katmanlarda tanımlı olup burada kullanılanlar
  public abstract syncStudentNotifications(force?: boolean): Promise<void>;
  public abstract deduplicateClasses(classesList: ClassGroup[]): ClassGroup[];

  public deletedTeacherIds: Set<string> = new Set();
  public deletedEtutIds: Set<string> = new Set();
  public deletedQuestionLogIds: Set<string> = new Set();
  // Aşama 67: bu cihazın az önce buluta yazdığı soru kayıtları (kimlik → içerik imzası, zaman).
  // Art arda iki yazmada (ör. iki plan görevine peş peşe tik) ilk yazmanın gecikmiş gerçek zamanlı yankısı,
  // ikinci yazmanın yerel sonucunu ezip eklenen soruyu "aktarılmadı" gösteriyordu. Kısa süre içinde gelen ve
  // son yazdığımızdan farklı olan kopya eski yankı sayılır; yerel kayıt korunur, süre dolunca buluttan doğrulanır.
  protected recentQuestionLogWrites = new Map<string, { sig: string; at: number }>();
  protected static readonly QLOG_ECHO_WINDOW_MS = 20000;

  protected syncPollInterval: number | null = null;

  // =========================================================================
  // EŞİTLEME YÖNETİCİSİ (Aşama 6)
  // - Anlık güncelleme kanalları oturum başına BİR KEZ kurulur; kopan kanal kendiliğinden onarılır.
  // - Kanallar sağlıklıyken tam eşitleme 5 dakikada bir (güvence), değilken 30 saniyede bir yapılır.
  // - Sekmeye dönüş / odak gibi olaylarda en fazla 15 saniyede bir tam eşitleme yapılır.
  // - Aynı anda birden fazla tam eşitleme çalışmaz.
  // =========================================================================
  protected realtimeChannels: Record<
    string,
    { channel: any; healthy: boolean; everSubscribed: boolean; checkTimer?: ReturnType<typeof setTimeout> }
  > = {};
  protected realtimeClosing = false;
  protected realtimeEnsureRunning = false;
  protected lastRealtimeHealth: 'live' | 'fallback' | 'offline' = 'fallback';
  // Aşama 126 (hız / ölçek): anlık kanal sağlıklıyken yedek tam eşitleme 5 dk yerine 15 dk'da bir
  // (+0–60 sn rastgele pay: çok kullanıcı aynı anda sunucuya yüklenmez). Değişiklikler zaten anlık kanaldan gelir.
  protected static readonly LIVE_SAFETY_SYNC_MS = 15 * 60 * 1000;
  protected readonly liveSafetySyncMs = EsitlemeKatmani.LIVE_SAFETY_SYNC_MS + Math.floor(Math.random() * 60000);
  protected static readonly FALLBACK_SYNC_MS = 30 * 1000;
  protected static readonly MIN_BACKGROUND_SYNC_GAP_MS = 15 * 1000;
  // Aşama 126: anlık kanal sağlıklıyken odak / sekme geçişi tam eşitlemesi en fazla dakikada bir
  protected static readonly LIVE_BACKGROUND_SYNC_GAP_MS = 60 * 1000;

  // Hangi tablo değişince ne yapılacağı
  protected realtimeTableConfig(): Array<RealtimeTableCfg> {
    const session = this.getAuthSession();
    const role = session?.role;
    const list: Array<RealtimeTableCfg> = [
      { table: 'students', onEvent: (p) => this.handleRemoteStudentRealtimeEvent(p), resync: () => this.syncStudentsFromSupabase(true) },
      { table: 'classes', onEvent: (p) => this.handleRemoteClassRealtimeEvent(p), resync: () => this.syncClassesFromSupabase(true) },
      { table: 'etuts', onEvent: (p) => this.handleRemoteEtutRealtimeEvent(p), resync: () => this.syncEtutsFromSupabase(true) },
      { table: 'homeworks', onEvent: (p) => this.handleRemoteHomeworkRealtimeEvent(p), resync: () => this.syncHomeworksFromSupabase(true) },
      { table: 'attendance', onEvent: (p) => this.handleRemoteAttendanceRealtimeEvent(p), resync: () => this.syncAttendanceFromSupabase(true) },
      { table: 'grades', onEvent: (p) => this.handleRemoteGradeRealtimeEvent(p), resync: () => this.syncGradesFromSupabase(true) },
      { table: 'messages', onEvent: (p) => this.handleRemoteMessageRealtimeEvent(p), resync: () => this.syncMessagesFromSupabase(true) },
      { table: 'homework_submissions', onEvent: () => this.scheduleTableRefetch('homework_submissions'), resync: () => this.syncSubmissionsFromSupabase(true) },
      { table: 'question_logs', onEvent: (p) => this.handleRemoteQuestionLogRealtimeEvent(p), resync: () => this.syncQuestionLogsFromSupabase(true) },
      { table: 'question_targets', onEvent: () => this.scheduleTableRefetch('question_targets'), resync: () => this.syncQuestionTargetsFromSupabase(true) },
    ];
    if (role === 'teacher') {
      list.push(
        { table: 'teacher_documents', onEvent: () => this.scheduleTableRefetch('teacher_documents'), resync: () => this.syncTeacherDocumentsFromSupabase(true) },
        { table: 'teachers', onEvent: () => this.scheduleTableRefetch('teachers'), resync: () => this.syncTeachersFromSupabase(true) }
      );
      // Aşama 179: etüt yoklaması (sql/178). Kanal kurulamazsa genel "canlı" durumu bozulmaz; eşitleme sürer.
      if (EsitlemeKatmani.etutYoklamaTable !== 'no') {
        list.push({ table: 'etut_yoklama', optional: true, onEvent: (p) => this.handleRemoteEtutYoklamaEvent(p), resync: () => this.syncEtutsFromSupabase(true) });
      }
      // Aşama 265: öğrenci bölüm izni değişince hemen yenilenir (sql/265 içeriksiz sinyal; yoksa dakikalık yoklama)
      list.push({ table: 'ogrenci_bolum_sinyal', optional: true, onEvent: () => this.scheduleOgrBolumRefresh(), resync: () => this.syncOgrenciBolum() });
      // Aşama 114: rol / bölüm / sınıf / öğrenci yetkisi değişince hemen yenilenir (öğretmen yalnız kendi satırını alır)
      for (const table of EsitlemeKatmani.ACCESS_TABLES) {
        list.push({ table, optional: true, onEvent: () => this.scheduleAccessRefresh(), resync: () => this.refreshMyAccess() });
      }
    } else if (role === 'student' && session?.user?.id) {
      // Aşama 114: içeriksiz "değişti" sinyali; gelince öğrencinin kendi etüt / yoklaması yeniden okunur
      list.push({
        table: 'student_sync_ping',
        optional: true,
        filter: `student_id=eq.${session.user.id}`,
        onEvent: () => this.scheduleStudentRefresh(),
        resync: () => this.refreshStudentOwn(),
      });
      // Aşama 265: bölüm izni değişince öğrencinin menüsü ve ana sayfası hemen güncellenir
      list.push({ table: 'ogrenci_bolum_sinyal', optional: true, onEvent: () => this.scheduleOgrBolumRefresh(), resync: () => this.syncOgrenciBolum() });
    }
    return list;
  }

  // ===========================================================================
  // Aşama 349a: KİŞİ BAŞINA TEK CANLI KANAL (sql/349a)
  //  Eskiden her tablo ayrı kanaldan, kurum süzgeci olmadan dinleniyordu. Artık veritabanı tetikleri içeriksiz bir
  //  sinyal yazar (canli_sinyal: kanal, tablo, değişen kimlikler); ekran yalnız KENDİ kanallarını (kurumu, kendisi;
  //  öğrencide yalnız kendisi) tek kanaldan dinler. Sinyal gelince değişen kayıtlar kişinin kendi yetkisiyle okunur ve
  //  eskisiyle aynı işleyicilere verilir; böylece ekranlar aynen çalışır. sql/349a kurulu değilse her şey eski yolla
  //  (tablo başına kanal) sürer.
  //  Aşama 357: sql/349a kuruluysa eski yola hiç dönülmez (büyük tablolar sql/357 ile yayından çıkar, o kanallar
  //  artık olay getirmez). Tek kanal açılamazsa kendisi yeniden denenir; o sürede durum 'fallback' olur ve
  //  30 saniyelik eşitleme ekranları güncel tutar.
  // ===========================================================================
  protected static readonly CANLI = 'canli_sinyal';
  /** Tetiği olan tablolar (bunlar tek kanaldan gelir) */
  protected static readonly CANLI_TABLOLARI = new Set<string>([
    'students', 'classes', 'teachers', 'grades', 'question_logs', 'attendance', 'question_targets', 'messages',
    'homework_submissions', 'etut_yoklama', 'homeworks', 'etuts', 'teacher_documents',
    'teacher_roles', 'teacher_section_access', 'teacher_class_access', 'teacher_student_access',
  ]);
  /** İşleyicisi satırın kendisini kullanan tablolar: değişen satırlar kimlikle okunup işleyiciye verilir */
  protected static readonly CANLI_SATIR = new Set<string>(['messages', 'grades', 'attendance', 'etuts', 'question_logs', 'etut_yoklama']);
  /**
   * Aşama 349c: ekranların kendi dinlediği tablolar (ders programı / ders yoklaması, deneme). Tek kanal kuruluysa
   * sinyalleri oradan gelir (ayrı kanal açılmaz). Eski yolda yalnız ders tabloları için tablo başına TEK ortak kanal
   * açılır (eskiden her bileşen kendi kanalını açıyordu); deneme eski yolda yalnız ekranın kendi yenilemesiyle güncellenir.
   */
  protected static readonly EK_TABLOLAR = new Set<string>([
    'kurum_ders_ayar', 'kurum_ders_tatil', 'sinif_ders_ogretmen', 'ders_programi', 'ders_vekil', 'ders_gun_izin',
    'ders_yoklama_oturum', 'deneme_exams', 'deneme_results',
  ]);
  protected static readonly EK_ESKI_YOL = new Set<string>([
    'kurum_ders_ayar', 'kurum_ders_tatil', 'sinif_ders_ogretmen', 'ders_programi', 'ders_vekil', 'ders_gun_izin', 'ders_yoklama_oturum',
  ]);
  protected ekDinleyiciler = new Map<string, Set<() => void>>();
  protected ekYeniden = false;
  protected ekKapatZaman: ReturnType<typeof setTimeout> | null = null;

  /** Tablolardan biri değişince `degisti` çağrılır (kısa sürede gelenleri toplamak çağıranın işidir). Dönüş: bırak. */
  public tabloDinle(tablolar: readonly string[], degisti: () => void): () => void {
    let eklendi = false;
    for (const t of tablolar) {
      if (!EsitlemeKatmani.EK_TABLOLAR.has(t)) continue;
      let set = this.ekDinleyiciler.get(t);
      if (!set) {
        this.ekDinleyiciler.set(t, (set = new Set()));
        eklendi = true;
      }
      set.add(degisti);
    }
    if (eklendi) this.ekKanallariGuncelle();
    return () => {
      let bosaldi = false;
      for (const t of tablolar) {
        const set = this.ekDinleyiciler.get(t);
        if (!set) continue;
        set.delete(degisti);
        if (!set.size) {
          this.ekDinleyiciler.delete(t);
          bosaldi = true;
        }
      }
      // sayfa değişirken (eski ekran kapanır, yenisi aynı tabloyu dinler) kanal kapatılıp yeniden açılmasın diye biraz beklenir
      if (bosaldi) {
        if (this.ekKapatZaman) clearTimeout(this.ekKapatZaman);
        this.ekKapatZaman = setTimeout(() => {
          this.ekKapatZaman = null;
          this.ekKanallariGuncelle();
        }, 5000);
      }
    };
  }

  /** Bu tabloların değişikliği şu an canlı geliyor mu (gelmiyorsa ekran sekmeye dönüşte kendisi okur) */
  public tablolarCanli(tablolar: readonly string[]): boolean {
    if (this.canliKanallar && this.canliKanallar.length) return !!this.realtimeChannels[EsitlemeKatmani.CANLI]?.healthy;
    return tablolar.every((t) => !EsitlemeKatmani.EK_ESKI_YOL.has(t) || !!this.realtimeChannels[t]?.healthy);
  }

  protected ekTabloBildir(tablo: string): void {
    this.ekDinleyiciler.get(tablo)?.forEach((f) => {
      try {
        f();
      } catch (e) {
        console.warn(`[Canlı] ${tablo} dinleyicisi:`, e);
      }
    });
  }

  /** Eski yolda dinlenen tablo kümesi değişince kanallar yeniden düzenlenir (tek kanalda gerek yok) */
  protected ekKanallariGuncelle(): void {
    if (this.canliKanallar && this.canliKanallar.length) return;
    if (this.realtimeEnsureRunning) {
      this.ekYeniden = true;
      return;
    }
    void this.ensureRealtime();
  }

  /** null: henüz sorulmadı; []: kanal yok (SQL yok ya da kişinin kanalı yok) */
  protected canliKanallar: string[] | null = null;
  /** Aşama 357: sql/349a kurulu (canli_kanallarim yanıt verdi): tablo başına eski kanallar açılmaz */
  protected canliSqlVar = false;
  protected canliHataYazildi = false;
  protected canliBekleyen = new Map<string, Set<string>>();
  protected canliZaman = new Map<string, ReturnType<typeof setTimeout>>();

  /** Kişinin canlı kanalları (veritabanındaki kuralla aynı işlev). Ağ hatasında null: kanal kurulumu sonra denenir. */
  protected async canliKanallariOku(): Promise<string[] | null> {
    if (this.canliKanallar) return this.canliKanallar;
    try {
      const { data, error } = await supabase.rpc('canli_kanallarim');
      if (error) {
        if (agHatasiMi(error)) return null;
        this.canliKanallar = []; // işlev yok (SQL kurulmadı) ya da izin yok: eski yol
        return [];
      }
      const list = Array.isArray(data) ? data.filter((x: unknown): x is string => typeof x === 'string' && /^[kop]:.+/.test(x)) : [];
      this.canliSqlVar = Array.isArray(data); // işlev her zaman dizi döndürür
      this.canliKanallar = list;
      return list;
    } catch (e) {
      if (agHatasiMi(e)) return null;
      this.canliKanallar = [];
      return [];
    }
  }

  /** Açılacak kanallar: tek kanal kuruluysa tetikli tablolar onun içinden gelir, kalanlar (isteğe bağlı sinyaller) ayrı */
  protected aktifKanallar(): Array<RealtimeTableCfg> {
    const tum = this.realtimeTableConfig();
    const kanallar = this.canliKanallar;
    if (!kanallar || !kanallar.length) {
      // Aşama 357: SQL kurulu ama kişinin kanalı yok: yalnız küçük sinyal kanalları (büyük tablolar yayında değil)
      if (this.canliSqlVar) return tum.filter((c) => !EsitlemeKatmani.CANLI_TABLOLARI.has(c.table));
      // Aşama 349c: eski yolda ekranların dinlediği ders tabloları (tablo başına tek ortak kanal, kendi kurumu)
      const kurum = this.getMyKurumId();
      const ek: RealtimeTableCfg[] = kurum
        ? Array.from(this.ekDinleyiciler.keys())
            .filter((t) => EsitlemeKatmani.EK_ESKI_YOL.has(t))
            .map((t) => ({
              table: t,
              optional: true,
              filter: `kurum_id=eq.${kurum}`,
              onEvent: () => this.ekTabloBildir(t),
              resync: () => this.ekTabloBildir(t),
            }))
        : [];
      return [...tum, ...ek];
    }
    const kapsanan = tum.filter((c) => EsitlemeKatmani.CANLI_TABLOLARI.has(c.table));
    const kalan = tum.filter((c) => !EsitlemeKatmani.CANLI_TABLOLARI.has(c.table));
    return [
      {
        table: EsitlemeKatmani.CANLI,
        filter: `kanal=in.(${kanallar.join(',')})`,
        onEvent: (p) => this.canliSinyalGeldi(p),
        // kopup geri gelince arada kaçan değişiklikler için bu kanalın kapsadığı tablolar (artımlı) yeniden okunur
        resync: () => {
          // Aşama 349c: ekranların dinlediği ders / deneme tabloları da arada kaçanı bir kez okur
          this.ekDinleyiciler.forEach((_, t) => this.ekTabloBildir(t));
          return Promise.allSettled(kapsanan.filter((c) => !EsitlemeKatmani.ACCESS_TABLES.includes(c.table)).map((c) => c.resync()));
        },
      },
      ...kalan,
    ];
  }

  protected canliSinyalGeldi(payload: any): void {
    const row = payload?.new;
    const tablo = typeof row?.tablo === 'string' ? row.tablo : '';
    if (!tablo) return;
    // Aşama 368: kurum dondurulduysa ekran sunucuya sorar (sinyale tek başına güvenilmez: sistem sahibinin geçişi muaftır)
    if (tablo === 'kurum_durum') return void hesapDurumunuDenetle(true);
    if (EsitlemeKatmani.EK_TABLOLAR.has(tablo)) return this.ekTabloBildir(tablo); // Aşama 349c
    const cfg = this.realtimeTableConfig().find((c) => c.table === tablo);
    if (!cfg) return; // bu rolün dinlemediği tablo
    if (EsitlemeKatmani.ACCESS_TABLES.includes(tablo)) return cfg.onEvent({});
    const ids: string[] = Array.isArray(row.ids) ? row.ids.filter((x: unknown) => typeof x === 'string' && x) : [];
    const silme = row.islem === 'DELETE';
    // 200'den çok kayıt (toplu iş) ya da kimlik yok: tablo bir kez (artımlı) yeniden okunur
    if (!ids.length) return this.canliTabloYenile(tablo, cfg);
    if (silme) {
      // silinen kayıt artık okunamaz: işleyiciye eskisi gibi "silindi" verilir (yalnız kimlik)
      for (const id of ids) {
        const old: Record<string, string> = { id };
        if (tablo === 'etut_yoklama') {
          const i = id.indexOf('|');
          if (i > 0) Object.assign(old, { etut_id: id.slice(0, i), student_id: id.slice(i + 1) });
        }
        try {
          cfg.onEvent({ eventType: 'DELETE', old, new: {}, table: tablo });
        } catch (e) {
          console.warn(`[Canlı] ${tablo} silme işlenemedi:`, e);
        }
      }
      return;
    }
    if (tablo === 'homeworks') {
      // ödev işleyicisi listeyi zaten artımlı yeniler; yalnız sistem satırları (silinen kayıt listesi) içeriğiyle okunur
      const sistem = ids.filter((id) => id.startsWith('__'));
      if (sistem.length) this.canliSatirBiriktir(tablo, sistem);
      if (sistem.length < ids.length) cfg.onEvent({ eventType: 'UPDATE', new: {}, table: tablo });
      return;
    }
    if (EsitlemeKatmani.CANLI_SATIR.has(tablo)) return this.canliSatirBiriktir(tablo, ids);
    // öğrenci / sınıf / öğretmen satırının bazı sütunları korumalı: liste kendi yoluyla (artımlı) okunur
    if (tablo === 'students' || tablo === 'classes' || tablo === 'teachers') return this.canliTabloYenile(tablo, cfg);
    cfg.onEvent({ eventType: 'UPDATE', new: {}, table: tablo }); // ödev teslimi, soru hedefi, belge: işleyici tabloyu yeniler
  }

  protected canliTabloYenile(tablo: string, cfg: RealtimeTableCfg): void {
    const k = 't:' + tablo;
    const eski = this.canliZaman.get(k);
    if (eski) clearTimeout(eski);
    this.canliZaman.set(
      k,
      setTimeout(() => {
        this.canliZaman.delete(k);
        try {
          void cfg.resync();
        } catch {
          /* bir sonraki eşitlemede */
        }
      }, EsitlemeKatmani.SIGNAL_DEBOUNCE_MS)
    );
  }

  /** Kısa sürede gelen kimlikler biriktirilir, tek istekte okunur */
  protected canliSatirBiriktir(tablo: string, ids: string[]): void {
    let set = this.canliBekleyen.get(tablo);
    if (!set) this.canliBekleyen.set(tablo, (set = new Set()));
    for (const id of ids) set.add(id);
    const k = 's:' + tablo;
    if (this.canliZaman.has(k)) return;
    this.canliZaman.set(
      k,
      setTimeout(() => {
        this.canliZaman.delete(k);
        void this.canliSatirOku(tablo);
      }, 250)
    );
  }

  protected async canliSatirOku(tablo: string): Promise<void> {
    const set = this.canliBekleyen.get(tablo);
    this.canliBekleyen.delete(tablo);
    const cfg = this.realtimeTableConfig().find((c) => c.table === tablo);
    if (!set || !set.size || !cfg) return;
    const ids = Array.from(set);
    for (let i = 0; i < ids.length; i += 150) {
      const parca = ids.slice(i, i + 150);
      let data: any[] | null = null;
      try {
        const res = await supabase.from(tablo).select('*').in('id', parca);
        if (!res.error && Array.isArray(res.data)) data = res.data;
      } catch {
        data = null;
      }
      if (!data) return this.canliTabloYenile(tablo, cfg); // okunamadı: tablo bir kez yeniden okunur
      // Görünmeyen (yetkisi olmayan) kayıt gelmez; eski kanalda da olay gelmiyordu
      for (const r of data) {
        try {
          cfg.onEvent({ eventType: 'UPDATE', new: r, old: { id: r?.id }, table: tablo });
        } catch (e) {
          console.warn(`[Canlı] ${tablo} kaydı işlenemedi:`, e);
        }
      }
    }
  }

  // ===========================================================================
  // Aşama 114: ANLIK YETKİ VE ÖĞRENCİ SİNYALİ
  //  - Bu kanallar "isteğe bağlı"dır: veritabanı betiği kurulmadıysa ya da kanal kurulamazsa genel eşitleme
  //    durumu bozulmaz, dakikalık küçük yoklama (Aşama 113) aynen devam eder.
  //  - Art arda gelen olaylar 400 ms içinde tek okumaya indirilir.
  // ===========================================================================
  protected static readonly ACCESS_TABLES = ['teacher_roles', 'teacher_section_access', 'teacher_class_access', 'teacher_student_access'];
  protected static readonly SIGNAL_DEBOUNCE_MS = 400;
  protected accessRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  protected studentRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  protected scheduleAccessRefresh(): void {
    if (this.accessRefreshTimer) clearTimeout(this.accessRefreshTimer);
    this.accessRefreshTimer = setTimeout(() => {
      this.accessRefreshTimer = null;
      this.refreshMyAccess();
    }, EsitlemeKatmani.SIGNAL_DEBOUNCE_MS);
  }

  protected refreshMyAccess(): Promise<unknown> {
    return Promise.allSettled([this.syncMyKurum(), this.syncMyTeacherAccess()]);
  }

  protected ogrBolumRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  protected scheduleOgrBolumRefresh(): void {
    if (this.ogrBolumRefreshTimer) clearTimeout(this.ogrBolumRefreshTimer);
    this.ogrBolumRefreshTimer = setTimeout(() => {
      this.ogrBolumRefreshTimer = null;
      void this.syncOgrenciBolum();
    }, EsitlemeKatmani.SIGNAL_DEBOUNCE_MS);
  }

  protected scheduleStudentRefresh(): void {
    if (this.studentRefreshTimer) clearTimeout(this.studentRefreshTimer);
    this.studentRefreshTimer = setTimeout(() => {
      this.studentRefreshTimer = null;
      this.refreshStudentOwn();
    }, EsitlemeKatmani.SIGNAL_DEBOUNCE_MS);
  }

  protected refreshStudentOwn(): Promise<unknown> {
    return Promise.allSettled([
      this.syncEtutsFromSupabase(true),
      this.syncAttendanceFromSupabase(true),
      this.syncStudentNotifications(),
    ]);
  }

  // İsteğe bağlı kanalların hepsi çalışıyorsa dakikalık yoklamaya gerek kalmaz
  protected optionalChannelsLive(): boolean {
    // Aşama 349a: tek kanal açıkken rol/yetki ve öğrenci sinyalleri de ondan gelir
    const canli = !!this.canliKanallar?.length;
    if (canli && !this.realtimeChannels[EsitlemeKatmani.CANLI]?.healthy) return false;
    const opt = this.aktifKanallar().filter((c) => c.optional);
    if (!opt.length) return canli;
    return opt.every((c) => this.realtimeChannels[c.table]?.healthy);
  }

  // Eksik ya da kopmuş kanalları kurar; çalışan kanallara dokunmaz (tekrar tekrar çağrılması güvenlidir)
  public async ensureRealtime(): Promise<void> {
    if (this.realtimeEnsureRunning) return;
    if (!this.getAuthSession()) return;
    this.realtimeEnsureRunning = true;
    try {
      if (!(await hasCloudSession())) return; // giriş yapılmadan kanal açılmaz (RLS zaten boş döndürür)
      this.realtimeClosing = false;
      // Aşama 349a: tek kanal mı eski yol mu (ağ yoksa kurulum sonraki denemeye kalır)
      if ((await this.canliKanallariOku()) === null) return;
      const cfgs = this.aktifKanallar();
      const istenen = new Set(cfgs.map((c) => c.table));
      for (const [t, e] of Object.entries(this.realtimeChannels)) {
        if (istenen.has(t)) continue;
        if (e.checkTimer) clearTimeout(e.checkTimer);
        try { if (e.channel) supabase.removeChannel(e.channel); } catch {}
        delete this.realtimeChannels[t];
      }
      for (const cfg of cfgs) {
        const entry = this.realtimeChannels[cfg.table];
        const state = entry?.channel?.state;
        if (entry && (state === 'joined' || state === 'joining')) continue;
        if (entry) {
          if (entry.checkTimer) clearTimeout(entry.checkTimer);
          try { supabase.removeChannel(entry.channel); } catch {}
        }
        const record = { channel: null as any, healthy: false, everSubscribed: entry?.everSubscribed || false } as {
          channel: any; healthy: boolean; everSubscribed: boolean; checkTimer?: ReturnType<typeof setTimeout>;
        };
        this.realtimeChannels[cfg.table] = record;
        try {
          record.channel = supabase
            .channel(`rt-${cfg.table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: cfg.table, ...(cfg.filter ? { filter: cfg.filter } : {}) }, (payload: any) => {
              try { cfg.onEvent(payload); } catch (e) { console.warn(`[Realtime] ${cfg.table} olayı işlenemedi:`, e); }
            })
            .subscribe((status: string) => this.handleChannelStatus(cfg.table, status, cfg.resync, cfg.optional));
        } catch (e) {
          console.warn(`[Realtime] ${cfg.table} kanalı kurulamadı:`, e);
        }
      }
    } finally {
      this.realtimeEnsureRunning = false;
      this.updateRealtimeHealth();
      // Aşama 349c: kurulum sürerken dinlenen tablo kümesi değiştiyse bir kez daha düzenlenir
      if (this.ekYeniden) {
        this.ekYeniden = false;
        setTimeout(() => void this.ensureRealtime(), 0);
      }
    }
  }

  protected handleChannelStatus(table: string, status: string, resync: () => unknown, optional = false): void {
    const entry = this.realtimeChannels[table];
    if (!entry) return;
    if (status === 'SUBSCRIBED') {
      const isReconnect = entry.everSubscribed && !entry.healthy;
      entry.healthy = true;
      entry.everSubscribed = true;
      if (entry.checkTimer) { clearTimeout(entry.checkTimer); entry.checkTimer = undefined; }
      // Bağlantı koptuysa arada kaçan değişiklikler için yalnız bu tablo yeniden okunur
      if (isReconnect) {
        // Aşama 88: artımlı okumada arada silinen satırlar da hemen bulunsun (kimlik listesi beklemeden okunur)
        const ds = this.deltaState.get(table);
        if (ds) ds.idsAt = 0;
        try { resync(); } catch {}
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      entry.healthy = false;
      // Aşama 357: tek kanal açılamazsa eski yola dönülmez (büyük tablolar yayında değil); aşağıdaki 20 sn'lik
      // yeniden kurma sürer, bu arada durum 'fallback' olduğu için 30 saniyelik eşitleme çalışır
      if (table === EsitlemeKatmani.CANLI && !entry.everSubscribed && status === 'CHANNEL_ERROR' && !this.canliHataYazildi) {
        this.canliHataYazildi = true;
        console.warn('[Canlı] tek kanal açılamadı; yeniden denenecek, bu arada aralıklı eşitleme sürüyor');
      }
      // Aşama 114: isteğe bağlı kanal hiç kurulamadıysa (betik kurulu değil) tekrar denenmez; dakikalık yoklama devrede
      if (optional && !entry.everSubscribed) {
        this.updateRealtimeHealth();
        return;
      }
      if (!this.realtimeClosing && !entry.checkTimer) {
        // Kütüphane kendisi yeniden bağlanmayı dener; 20 sn içinde olmazsa kanal yeniden kurulur
        entry.checkTimer = setTimeout(() => {
          entry.checkTimer = undefined;
          const st = entry.channel?.state;
          if (!this.realtimeClosing && st !== 'joined' && st !== 'joining') this.ensureRealtime();
        }, 20000);
      }
    }
    this.updateRealtimeHealth();
  }

  // Eşitleme durumu: 'live' (anlık), 'fallback' (aralıklı yedek kontrol), 'offline' (internet yok)
  public getRealtimeHealth(): 'live' | 'fallback' | 'offline' {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    const entries = Object.entries(this.realtimeChannels)
      .filter(([table]) => table !== 'student_sync_ping' && !EsitlemeKatmani.ACCESS_TABLES.includes(table) && !EsitlemeKatmani.EK_TABLOLAR.has(table))
      .map(([, e]) => e);
    if (entries.length > 0 && entries.every((e) => e.healthy)) return 'live';
    return 'fallback';
  }

  protected updateRealtimeHealth(): void {
    const h = this.getRealtimeHealth();
    if (h !== this.lastRealtimeHealth) {
      this.lastRealtimeHealth = h;
      this.notify();
    }
  }

  public setupAllRealtimeSync(): void {
    this.ensureRealtime();
    this.startPeriodicSync();
  }

  public unsubscribeAllRealtime(): void {
    this.realtimeClosing = true;
    Object.values(this.realtimeChannels).forEach((entry) => {
      if (entry.checkTimer) clearTimeout(entry.checkTimer);
      try { if (entry.channel) supabase.removeChannel(entry.channel); } catch {}
    });
    this.realtimeChannels = {};
    // Aşama 349a: kanal listesi kişiye bağlı; yeni oturumda yeniden sorulur
    this.canliKanallar = null;
    this.canliSqlVar = false;
    this.canliHataYazildi = false;
    this.canliBekleyen.clear();
    for (const t of this.canliZaman.values()) clearTimeout(t);
    this.canliZaman.clear();
    this.updateRealtimeHealth();
  }

  // Yedek kontrol: kanallar sağlıklıysa 5 dakikada bir, değilse 30 saniyede bir tam eşitleme.
  // Sekme arka plandayken hiç istek atılmaz (geri gelince hemen eşitlenir).
  public startPeriodicSync(): void {
    if (this.syncPollInterval) return;
    if (typeof window === 'undefined') return;
    this.syncPollInterval = window.setInterval(() => {
      if (!this.getAuthSession()) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const health = this.getRealtimeHealth();
      if (health === 'offline') return;
      const age = Date.now() - this.lastFullSyncAt;
      const due = health === 'live' ? this.liveSafetySyncMs : EsitlemeKatmani.FALLBACK_SYNC_MS;
      if (age >= due) this.revalidateAndSyncAll(true);
      else {
        if (health !== 'live') this.ensureRealtime();
        this.lightPoll();
      }
    }, 10000);
  }

  // ===========================================================================
  // Aşama 113: KÜÇÜK YOKLAMALAR (anlık kanalın ulaşamadığı bilgiler, dakikada bir, sekme açıkken)
  //  - Öğretmen: rol, bölüm izni, kurum modülleri (teacher_roles anlık yayında yok). Tek küçük istek; değişirse
  //    menü hemen, kayıtlar kimlik karşılaştırmasıyla yenilenir.
  //  - Öğrenci: etüt ve yoklama işlevden okunur, anlık kanal öğrenciye bu tablolardan olay göndermez. Yalnız
  //    öğrencinin kendi kayıtları iner; değişiklik yoksa ekran yeniden çizilmez.
  // ===========================================================================
  protected static readonly LIGHT_POLL_MS = 60 * 1000;
  protected lightPollAt = 0;
  protected lightPollRunning = false;
  protected lightPoll(): void {
    if (this.lightPollRunning || this.fullSyncInFlight) return;
    if (Date.now() - this.lightPollAt < EsitlemeKatmani.LIGHT_POLL_MS) return;
    const role = this.getAuthSession()?.role;
    if (role !== 'teacher' && role !== 'student') return;
    // Aşama 114: anlık kanal çalışıyorsa öğrenci için yoklama gerekmez; öğretmende yalnız kurum ayarı (modüller,
    // rol sistemi açık/kapalı) tek küçük istekle sorulur, rol ve yetkiler kanaldan gelir
    const live = this.optionalChannelsLive();
    if (live && role === 'student') {
      // Aşama 165: anlık kanalda da öğrenci bölüm ayarı dakikada bir tek küçük istekle sorulur (değişmezse ekran yenilenmez)
      this.lightPollAt = Date.now();
      void this.syncOgrenciBolum();
      return;
    }
    this.lightPollAt = Date.now();
    this.lightPollRunning = true;
    const jobs: Promise<unknown>[] =
      role === 'teacher'
        ? live ? [this.syncMyKurum(), this.syncOgrenciBolum()] : [this.syncMyKurum(), this.syncMyTeacherAccess(), this.syncOgrenciBolum()]
        : [this.syncEtutsFromSupabase(true), this.syncAttendanceFromSupabase(true), this.syncStudentNotifications(), this.syncOgrenciBolum()];
    Promise.allSettled(jobs).finally(() => {
      this.lightPollRunning = false;
    });
  }

  // Eski adlar (başka dosyalardan çağrılabilir diye korunur)
  public setupTeachersRealtimeSync() {
    this.ensureRealtime();
  }
  public startPeriodicTeachersSync() {}
  public startPeriodicEtutsSync() {}
  public startPeriodicStudentsSync() {}

  public handleRemoteStudentRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.deletedStudentIds.add(oldRow.id);
          saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));
          this.students = this.students.filter((s) => s.id !== oldRow.id);
          saveData(STORAGE_KEYS.STUDENTS, this.students);
          this.notify();
        }
        return;
      }

      const row = payload.new;
      if (!row || !row.id || this.deletedStudentIds.has(row.id)) return;
      // Aşama 350: mezun öğrenci etkin listelerde yer almaz (Yönetim › Eğitim Yılı › Geçmiş Yıllar'da görünür)
      if (row.status === 'mezun') {
        if (this.students.some((s) => s.id === row.id)) {
          this.students = this.students.filter((s) => s.id !== row.id);
          saveData(STORAGE_KEYS.STUDENTS, this.students);
          this.notify();
        }
        return;
      }

      const cleanRemoteEmail = cleanStudentEmail(row.email);
      const existingIdx = this.students.findIndex((s) => s.id === row.id);

      if (existingIdx !== -1) {
        const cur = this.students[existingIdx];
        this.students[existingIdx] = {
          ...cur,
          name: row.name || cur.name,
          studentNumber: row.student_number || cur.studentNumber,
          className: row.class_name || cur.className,
          classId: row.class_id || cur.classId,
          email: cleanRemoteEmail || cur.email,
          phone: row.phone || cur.phone,
          parents: 'parents' in row ? cleanParents(row.parents) : cur.parents,
          avatar: row.avatar || cur.avatar,
          gender: 'gender' in row ? normGender(row.gender) : cur.gender,
          schoolLevel: cur.schoolLevel || detectSchoolLevelFromGrade(row.class_name) || 'Ortaokul',
          kurumId: 'kurum_id' in row ? row.kurum_id || null : cur.kurumId,
        };
      } else {
        const newStd: Student = {
          id: row.id,
          name: row.name,
          username:
            row.student_number ||
            cleanRemoteEmail?.split('@')[0] ||
            row.name.toLowerCase().replace(/\s+/g, '_'),
          email: cleanRemoteEmail,
          mustChangePassword: false,
          className: row.class_name || 'Sınıfsız', // Aşama 379: sınıfı yoksa uydurma 'Genel' sınıfı değil
          classId: row.class_id || 'class-default',
          studentNumber: row.student_number || '',
          phone: row.phone || '',
          parents: cleanParents(row.parents),
          avatar: row.avatar || undefined,
          gender: normGender(row.gender),
          createdAt: row.registered_at || new Date().toISOString(),
          status: 'active',
          schoolLevel: detectSchoolLevelFromGrade(row.class_name) || 'Ortaokul',
          kurumId: row.kurum_id || null,
        };
        this.students.push(newStd);
      }
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      this.notify();
      // Aşama 85: anlık bildirimde iletişim sütunları gelmez; izin varsa korumalı tablodan okunur
      this.scheduleContactRefresh(row.id);
    } catch (err) {
      console.warn('Error handling student realtime event:', err);
    }
  }

  public handleRemoteClassRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.deletedClassIds.add(oldRow.id);
          saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
          this.classes = this.classes.filter((c) => c.id !== oldRow.id);
          saveData(STORAGE_KEYS.CLASSES, this.classes);
          this.notify();
        }
        return;
      }

      const row = payload.new;
      if (!row || !row.id || this.deletedClassIds.has(row.id)) return;
      // Aşama 350: geçen yılın arşivdeki sınıfı etkin listelerde yer almaz
      if (row.arsiv === true) {
        if (this.classes.some((c) => c.id === row.id)) {
          this.classes = this.classes.filter((c) => c.id !== row.id);
          saveData(STORAGE_KEYS.CLASSES, this.classes);
          this.notify();
        }
        return;
      }

      const normName = (row.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
      if (!normName || normName === 'sinif' || normName === 'atanmadi' || normName === 'tanimsiz') return;

      // Yalnızca aynı kimlikli sınıf güncellenir (aynı adlı başka yılın sınıfının üzerine yazılmaz)
      const existingIdx = this.classes.findIndex((c) => c.id === row.id);

      const mapped: ClassGroup = {
        id: row.id,
        name: row.name,
        branch: row.branch || 'Genel',
        gradeLevel: row.level ? `${row.level}. Sınıf` : undefined,
        schoolLevel: row.level && row.level >= 9 ? 'Lise' : 'Ortaokul',
        academicYear: row.academic_year || currentAcademicYear(),
        kurumId: row.kurum_id || null,
      };
      if ('description' in row) mapped.description = row.description || undefined;

      if (existingIdx !== -1) {
        this.classes[existingIdx] = { ...this.classes[existingIdx], ...mapped };
      } else {
        this.classes.push(mapped);
      }
      this.classes = this.deduplicateClasses(this.classes);
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      this.notify();
    } catch (e) {
      console.warn('Error handling class realtime event:', e);
    }
  }

  // --- TOMBSTONES SYNCHRONIZATION (CROSS-DEVICE GUARANTEE FOR DELETIONS) ---
  // ---------------------------------------------------------------------------
  // SİLİNEN KAYITLAR LİSTESİ (Aşama 17, rapor K8)
  // Silinen öğrenci/sınıf/soru kaydı kimlikleri artık ödev tablosundaki ortak satırda değil, kendi
  // tablosunda (deleted_records) satır satır tutulur: iki cihaz aynı anda silse de birbirini ezmez.
  // 16 numaralı SQL çalıştırılmadıysa eski ortak satır kullanılmaya devam eder.
  // ---------------------------------------------------------------------------
  protected static deletedRecordsTable: 'unknown' | 'yes' | 'no' = 'unknown';
  protected tombstonesPushed = new Set<string>();

  public async syncTombstonesToCloud(): Promise<void> {
    try {
      if (EsitlemeKatmani.deletedRecordsTable !== 'no') {
        const rows: Array<{ id: string; kind: string; record_id: string }> = [];
        const add = (kind: string, ids: Set<string>) =>
          ids.forEach((id) => {
            const key = `${kind}:${id}`;
            if (id && !this.tombstonesPushed.has(key)) rows.push({ id: key, kind, record_id: id });
          });
        add('student', this.deletedStudentIds);
        add('class', this.deletedClassIds);
        add('question_log', this.deletedQuestionLogIds);
        if (rows.length === 0) return;
        const { error } = await supabase.from('deleted_records').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
        if (!error) {
          EsitlemeKatmani.deletedRecordsTable = 'yes';
          rows.forEach((r) => this.tombstonesPushed.add(r.id));
          return;
        }
        if (!/deleted_records|PGRST205|42P01/i.test(`${error.code || ''} ${error.message || ''}`)) {
          console.warn('Silinen kayıt listesi buluta yazılamadı:', error.message);
          return;
        }
        EsitlemeKatmani.deletedRecordsTable = 'no';
      }
      // Eski yol (16 numaralı SQL henüz çalıştırılmadıysa)
      const payload = {
        deletedStudentIds: Array.from(this.deletedStudentIds),
        deletedClassIds: Array.from(this.deletedClassIds),
        deletedQuestionLogIds: Array.from(this.deletedQuestionLogIds),
        updatedAt: new Date().toISOString(),
      };
      await supabase.from('homeworks').upsert({
        id: '__system_sync_tombstones__',
        title: 'Tombstones Sync',
        subject: 'SystemSync',
        description: JSON.stringify(payload),
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (e) {
      console.warn('Error syncing tombstones to cloud:', e);
    }
  }

  // Buluttaki listeyi yerel listeye ekler; silinmiş kayıtlar ekrandan da kaldırılır
  protected applyTombstones(lists: { students?: string[]; classes?: string[]; questionLogs?: string[] }): void {
    let changed = false;
    const addAll = (ids: string[] | undefined, set: Set<string>) =>
      (ids || []).forEach((id) => {
        if (id && !set.has(id)) {
          set.add(id);
          changed = true;
        }
      });
    addAll(lists.students, this.deletedStudentIds);
    addAll(lists.classes, this.deletedClassIds);
    addAll(lists.questionLogs, this.deletedQuestionLogIds);
    if (!changed) return;
    saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));
    saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
    saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
    const prevStd = this.students.length;
    this.students = this.students.filter((s) => !this.deletedStudentIds.has(s.id));
    if (this.students.length !== prevStd) saveData(STORAGE_KEYS.STUDENTS, this.students);
    const prevCls = this.classes.length;
    this.classes = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
    if (this.classes.length !== prevCls) saveData(STORAGE_KEYS.CLASSES, this.classes);
    const prevLogs = this.questionLogs.length;
    this.questionLogs = this.questionLogs.filter((q) => !this.deletedQuestionLogIds.has(q.id));
    if (this.questionLogs.length !== prevLogs) saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
    this.notify();
  }

  protected tombstonesFetchedAt = 0;
  public async syncTombstonesFromCloud(): Promise<void> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    if (!(await hasCloudSession())) return;
    // Öğrenci bu listeye erişmez; bir eşitleme içinde birden çok kez okunmaz
    if (this.getAuthSession()?.role === 'student') return;
    if (Date.now() - this.tombstonesFetchedAt < 5000) return;
    this.tombstonesFetchedAt = Date.now();
    try {
      if (EsitlemeKatmani.deletedRecordsTable !== 'no') {
        // Aşama 193: liste artımlı okunur (yalnız yeni silinenler iner; ilk okuma tam)
        const { data, error } = await this.fetchRowsSmart('deleted_records', true, 'id,kind,record_id');
        if (!error && Array.isArray(data)) {
          EsitlemeKatmani.deletedRecordsTable = 'yes';
          const pick = (k: string) => data.filter((r: any) => r.kind === k).map((r: any) => String(r.record_id));
          data.forEach((r: any) => this.tombstonesPushed.add(String(r.id)));
          this.applyTombstones({ students: pick('student'), classes: pick('class'), questionLogs: pick('question_log') });
          return;
        }
        if (error && !/deleted_records|PGRST205|42P01/i.test(`${error.code || ''} ${error.message || ''}`)) return;
        EsitlemeKatmani.deletedRecordsTable = 'no';
      }
      // Eski yol
      const { data } = await supabase.from('homeworks').select('description').eq('id', '__system_sync_tombstones__').maybeSingle();
      if (data && data.description) {
        try {
          const parsed = JSON.parse(data.description);
          this.applyTombstones({
            students: Array.isArray(parsed.deletedStudentIds) ? parsed.deletedStudentIds : [],
            classes: Array.isArray(parsed.deletedClassIds) ? parsed.deletedClassIds : [],
            questionLogs: Array.isArray(parsed.deletedQuestionLogIds) ? parsed.deletedQuestionLogIds : [],
          });
        } catch {
          // bozuk eski kayıt yok sayılır
        }
      }
    } catch (e) {
      console.warn('Error fetching tombstones from cloud:', e);
    }
  }

  // Sekmeye dönüş / odak / internet geri gelince: kopuk kanallar onarılır, gerekirse eşitlenir.
  // (Eskiden tüm kanallar her seferinde kapatılıp yeniden açılıyordu; değişiklikler bu arada kaçabiliyordu.)
  public reconnectAllRealtime() {
    this.ensureRealtime();
    this.revalidateAndSyncAll(true);
  }

  public handleRemoteEtutRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.deletedEtutIds.add(oldRow.id);
          saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));
          this.etuts = this.etuts.filter((e) => e.id !== oldRow.id);
          saveData(STORAGE_KEYS.ETUTS, this.etuts);
          this.notify('etut');
        }
        return;
      }

      const row = payload.new;
      if (!row || !row.id || this.deletedEtutIds.has(row.id)) return;

      // Aşama 112: tam okumayla aynı çevirici. Anlık kanal yalnız bu kişiye tam açık satırı gönderir; önceden ortak
      // takvimden gelmiş ayrıntısız kopyanın işareti silinir (yoksa kendisine verilen etüt listede gizli kalıyordu)
      const incomingEtut = this.remoteRowToEtut(row);
      const existingIdx = this.etuts.findIndex((e) => e.id === incomingEtut.id);
      if (existingIdx !== -1) {
        const current = this.etuts[existingIdx];
        this.etuts[existingIdx] = {
          ...current,
          ...incomingEtut,
          privacyRedacted: incomingEtut.privacyRedacted,
          studentAttendance: current.privacyRedacted
            ? incomingEtut.studentAttendance
            : mergeAttendance(incomingEtut.studentAttendance, current.studentAttendance),
        };
      } else {
        this.etuts.unshift(incomingEtut);
      }

      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      this.notify('etut');
    } catch (err) {
      console.warn('[EtutRealtime] Error handling realtime etut payload:', err);
    }
  }

  // --- HOMEWORK & SYSTEM REALTIME EVENT HANDLER ---
  // Değişiklik bildirimi gelince ilgili tablo kısa bir gecikmeyle yeniden okunur (RLS süzgeciyle, eksiksiz).
  public handleRemoteHomeworkRealtimeEvent(payload: any) {
    try {
      const row = payload?.new && payload.new.id ? payload.new : null;
      // Eski belge satırı artık kullanılmıyor (belgeler teacher_documents tablosunda)
      if (row?.id === '__system_sync_documents__') return;
      if (row?.id === '__system_sync_tombstones__') {
        this.handleRemoteTombstonesPayload(row.description);
        return;
      }
      if (typeof row?.id === 'string' && row.id.startsWith('__')) return;
      this.scheduleTableRefetch('homeworks');
    } catch (e) {
      console.warn('[HomeworkRealtime] Error:', e);
    }
  }

  protected refetchTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  // Aşama 15: soru kaydı değişikliği doğrudan işlenir (tablonun tamamı yeniden indirilmez)
  public handleRemoteQuestionLogRealtimeEvent(payload: any) {
    try {
      const type = payload?.eventType;
      if (type === 'DELETE') {
        const id = payload?.old?.id;
        if (!id) return this.scheduleTableRefetch('question_logs');
        const before = this.questionLogs.length;
        this.questionLogs = this.questionLogs.filter((l) => l.id !== id);
        if (this.questionLogs.length !== before) {
          this.persistQuestionLogsLocal();
          this.notify('soru');
        }
        return;
      }
      const row = payload?.new;
      if (!row || !row.id) return this.scheduleTableRefetch('question_logs');
      if (this.deletedQuestionLogIds?.has(row.id)) return;
      const incoming = questionLogFromRow(row);
      if (this.isStaleQuestionLogCopy(incoming)) {
        // Aşama 67: önceki yazmanın gecikmiş yankısı; yerel kayıt korunur, süre dolunca buluttan doğrulanır
        this.verifyQuestionLogLater(row.id);
        return;
      }
      this.mergeQuestionLogs([incoming], null);
      this.persistQuestionLogsLocal();
      this.notify('soru');
    } catch {
      this.scheduleTableRefetch('question_logs');
    }
  }

  protected scheduleTableRefetch(
    table: 'homeworks' | 'homework_submissions' | 'question_logs' | 'question_targets' | 'teacher_documents' | 'teachers'
  ): void {
    if (this.refetchTimers[table]) clearTimeout(this.refetchTimers[table]);
    this.refetchTimers[table] = setTimeout(() => {
      delete this.refetchTimers[table];
      if (table === 'homeworks') this.syncHomeworksFromSupabase(true);
      else if (table === 'homework_submissions') this.syncSubmissionsFromSupabase(true);
      else if (table === 'question_logs') this.syncQuestionLogsFromSupabase(true);
      else if (table === 'teacher_documents') this.syncTeacherDocumentsFromSupabase(true);
      else if (table === 'teachers') this.syncTeachersFromSupabase(true);
      else this.syncQuestionTargetsFromSupabase(true);
    }, 400);
  }

  // ===========================================================================
  // HIZ (Aşama 88): ANLIK DEĞİŞİKLİKLER TOPLU İŞLENİR
  // Bir duyuru her öğrenci için ayrı satırdır: 300 öğrenciye giden duyuru, açık her ekrana 300 ayrı olay
  // olarak gelir. Eskiden her olayda bütün liste baştan sıralanıp önbelleğe yazılıyordu (büyük kurumda
  // ekran onlarca saniye donuyordu). Artık kısa sürede gelen olaylar biriktirilir ve tek seferde işlenir:
  // tek sıralama, tek önbellek yazımı, tek ekran yenilemesi. Ekranda zaten aynısı olan kayıt gelirse
  // (ör. gönderenin kendi ekranına dönen yankı) hiçbir şey yeniden çizilmez. Sonuç eskisiyle aynıdır.
  // ===========================================================================
  protected rtQueue: { messages: any[]; grades: any[]; attendance: any[] } = { messages: [], grades: [], attendance: [] };
  protected rtFlushTimer: ReturnType<typeof setTimeout> | null = null;
  protected static readonly RT_BATCH_MS = 80;

  protected queueRealtime(table: 'messages' | 'grades' | 'attendance', payload: any): void {
    this.rtQueue[table].push(payload);
    if (!this.rtFlushTimer) this.rtFlushTimer = setTimeout(() => this.flushRealtimeQueue(), EsitlemeKatmani.RT_BATCH_MS);
  }

  protected flushRealtimeQueue(): void {
    this.rtFlushTimer = null;
    const q = this.rtQueue;
    this.rtQueue = { messages: [], grades: [], attendance: [] };
    const konular: VeriKonusu[] = [];
    if (q.messages.length) {
      const next = applyRealtimeBatch(this.messages, q.messages, (row) => rowToMessage(row), (m) => m.createdAt, 'MessageRealtime');
      if (next) {
        this.messages = next;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
        konular.push('mesaj');
      }
    }
    if (q.grades.length) {
      const next = applyRealtimeBatch(this.grades, q.grades, (row) => this.gradeFromRow(row), (g) => g.date, 'GradeRealtime');
      if (next) {
        this.grades = next;
        saveData(STORAGE_KEYS.GRADES, this.grades);
        konular.push('not');
      }
    }
    if (q.attendance.length) {
      const next = applyRealtimeBatch(
        this.attendance,
        q.attendance,
        (row): AttendanceRecord => ({
          id: row.id,
          classId: row.class_id,
          date: row.date,
          subject: row.subject || 'Genel',
          records: Array.isArray(row.records) ? row.records : [],
          createdBy: row.created_by || undefined,
        }),
        (a) => a.date,
        'AttendanceRealtime'
      );
      if (next) {
        this.attendance = next;
        saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
        konular.push('yoklama');
      }
    }
    if (konular.length) this.notify(...konular);
  }

  // --- ATTENDANCE REALTIME EVENT HANDLER ---
  public handleRemoteAttendanceRealtimeEvent(payload: any) {
    this.queueRealtime('attendance', payload);
  }

  // --- GRADES REALTIME EVENT HANDLER ---
  public handleRemoteGradeRealtimeEvent(payload: any) {
    this.queueRealtime('grades', payload);
  }

  // --- MESSAGES REALTIME EVENT HANDLER ---
  public handleRemoteMessageRealtimeEvent(payload: any) {
    this.queueRealtime('messages', payload);
  }

  public handleRemoteTombstonesPayload(raw: string) {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      let changed = false;
      if (Array.isArray(parsed.deletedStudentIds)) {
        parsed.deletedStudentIds.forEach((id: string) => {
          if (id && !this.deletedStudentIds.has(id)) {
            this.deletedStudentIds.add(id);
            changed = true;
          }
        });
      }
      if (Array.isArray(parsed.deletedClassIds)) {
        parsed.deletedClassIds.forEach((id: string) => {
          if (id && !this.deletedClassIds.has(id)) {
            this.deletedClassIds.add(id);
            changed = true;
          }
        });
      }
      if (Array.isArray(parsed.deletedQuestionLogIds)) {
        parsed.deletedQuestionLogIds.forEach((id: string) => {
          if (id && !this.deletedQuestionLogIds.has(id)) {
            this.deletedQuestionLogIds.add(id);
            changed = true;
          }
        });
      }
      if (changed) {
        saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));
        saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
        saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
        this.students = this.students.filter((s) => !this.deletedStudentIds.has(s.id));
        this.classes = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
        this.questionLogs = this.questionLogs.filter((q) => !this.deletedQuestionLogIds.has(q.id));
        saveData(STORAGE_KEYS.STUDENTS, this.students);
        saveData(STORAGE_KEYS.CLASSES, this.classes);
        saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
        this.notify();
      }
    } catch {}
  }

  public async syncEtutsFromSupabase(isBackground = false): Promise<void> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await hasCloudSession())) return;
    try {
      // Aşama 111: öğretmen etüt tablosunu artımlı okur (yalnız değişen satırlar; sql/111 yoksa tam okuma)
      // Aşama 179: yoklama tablosu etütlerle aynı anda okunur (satırlar çevrilmeden önce hazır olur)
      const [res, yk] = await Promise.all([
        this.fetchTableSmart(
          'etuts',
          isBackground,
          () => this.etuts.map((e) => e.id),
          {},
          () => this.fetchStudentSafe('student_my_etuts', () => fetchAllRows('etuts'))
        ),
        this.syncEtutYoklama(isBackground).catch(() => null),
      ]);
      if (res.mode === 'error') {
        if (!isBackground) console.warn('[EtutSync] Error fetching remote etuts:', res.error);
        return;
      }
      const delta = res.mode === 'delta';
      // Aşama 41 (mahremiyet, 32 numaralı SQL): öğretmen etüt tablosundan yalnızca KENDİ etütlerini okur.
      // Ortak öğrencili diğer etütlerin yalnızca gün / saat / öğretmen / sınıf bilgisi ayrı fonksiyonla gelir.
      // SQL henüz çalıştırılmadıysa fonksiyon yoktur; o zaman eski davranış sürer.
      let remoteEtuts: any[] = res.data;
      // artımlı okumada: ortak takvim / zümre satırları her seferinde tam gelir (küçük), bunlara ait kimlikler
      const rpcIds = new Set<string>();
      let sharedLoaded = false;
      let zumreLoaded = false;
      if (this.getAuthSession()?.role === 'teacher' && !this.isHeadAdmin()) {
        // Aşama 112: Rehberlik ve idare kurumun etütlerini veritabanından zaten tam alır; ortak takvim onlara yeni bir şey
        // getirmez (yalnız aynı etütlerin ayrıntısız kopyası). İşlev çağrılmaz, eski ayrıntısız satır kalmaz.
        const seesAll = this.isKurumAdmin() || this.hasRole('rehberlik');
        if (seesAll) sharedLoaded = true;
        else try {
          const shared = await supabase.rpc('etut_shared_schedule');
          if (!shared.error && Array.isArray(shared.data)) {
            sharedLoaded = true;
            // Aşama 112: artımlı okumada yalnız değişen satırlar gelir; değişmeyen ama bu kişiye tam açık etüt de "kendi"
            // sayılır (yoksa ortak takvimdeki ayrıntısız kopyası tam kaydın yerine geçip listeden kayboluyordu)
            const own = new Set<string>(remoteEtuts.map((r: any) => r.id));
            if (res.mode === 'delta') {
              const removed = res.removed;
              for (const e of this.etuts) if (!e.privacyRedacted && !(removed && removed.has(e.id))) own.add(e.id);
            }
            const extra = (shared.data as any[])
              .filter((r) => r && r.id && !own.has(r.id))
              .map((r) => ({ ...r, topic: '', notes: JSON.stringify({ ...(r.meta || {}), __etut_meta__: true, __redacted__: true }) }));
            for (const r of extra) rpcIds.add(r.id);
            remoteEtuts = [...remoteEtuts, ...extra];
          }
        } catch {
          /* fonksiyon yoksa ya da ağ hatası: yalnızca kendi etütleri */
        }
        // Aşama 85: Zümre Başkanı zümresinin etütlerini veritabanından öğrenci notları silinmiş olarak alır
        if (this.hasRole('zumre_baskani') && !this.hasRole('rehberlik') && !this.isKurumAdmin()) {
          try {
            const peer = await supabase.rpc('etut_zumre_rows');
            if (!peer.error && Array.isArray(peer.data)) {
              zumreLoaded = true;
              const byId = new Map<string, any>(remoteEtuts.map((r: any) => [r.id, r]));
              for (const r of peer.data as any[]) {
                const cur = byId.get(r.id);
                // ortak takvimden gelen (ayrıntısız) satırın yerine zümre görünümü konur; kendi etüdü olduğu gibi kalır
                if (!cur || (typeof cur.notes === 'string' && cur.notes.includes('"__redacted__":true'))) {
                  byId.set(r.id, r);
                  rpcIds.add(r.id);
                }
              }
              remoteEtuts = Array.from(byId.values());
            }
          } catch {
            /* 85 numaralı SQL yoksa: önceki davranış */
          }
        }
      }

      // Aşama 111 (hız): satır başına findIndex yerine kimlik dizini; değişmeyen etüt eski nesnesiyle kalır
      const localById = new Map<string, number>();
      this.etuts.forEach((e, i) => localById.set(e.id, i));
      const next = this.etuts.slice();
      const added: Etut[] = [];
      let etutsChanged = false;
      const incomingIds = new Set<string>();
      for (const re of remoteEtuts) {
        if (!re || !re.id || this.deletedEtutIds.has(re.id)) continue;
        incomingIds.add(re.id);
        const incomingEtut = this.remoteRowToEtut(re);
        const existingIdx = localById.get(re.id);
        if (existingIdx !== undefined && existingIdx < 0) {
          added[-1 - existingIdx] = incomingEtut; // aynı okumada iki kez gelen yeni satır: sonuncusu geçerli
          continue;
        }
        if (existingIdx !== undefined && incomingEtut.privacyRedacted) {
          // Aşama 41: başka öğretmenin etüdü — önbellekte kalmış eski ayrıntılar (yorum, yoklama) silinir
          if (JSON.stringify(next[existingIdx]) !== JSON.stringify(incomingEtut)) {
            next[existingIdx] = incomingEtut;
            etutsChanged = true;
          }
        } else if (existingIdx !== undefined) {
          const current = next[existingIdx];
          const mergedAttendance = mergeAttendance(incomingEtut.studentAttendance, current.studentAttendance);
          const isDifferent =
            current.subject !== incomingEtut.subject ||
            current.topic !== incomingEtut.topic ||
            current.date !== incomingEtut.date ||
            current.time !== incomingEtut.time ||
            current.duration !== incomingEtut.duration ||
            current.location !== incomingEtut.location ||
            current.notes !== incomingEtut.notes ||
            current.teacherFeedback !== incomingEtut.teacherFeedback ||
            current.teacherId !== incomingEtut.teacherId ||
            current.teacherName !== incomingEtut.teacherName ||
            current.teacherBranch !== incomingEtut.teacherBranch ||
            current.lessonPeriod !== incomingEtut.lessonPeriod ||
            !!current.privacyRedacted !== !!incomingEtut.privacyRedacted ||
            JSON.stringify(current.teacherIds || []) !== JSON.stringify(incomingEtut.teacherIds || []) ||
            JSON.stringify(current.assignedStudentIds || []) !== JSON.stringify(incomingEtut.assignedStudentIds || []) ||
            JSON.stringify(current.studentAttendance || {}) !== JSON.stringify(mergedAttendance);
          if (isDifferent) {
            next[existingIdx] = { ...current, ...incomingEtut, studentAttendance: mergedAttendance, privacyRedacted: incomingEtut.privacyRedacted };
            etutsChanged = true;
          }
        } else {
          // yeni satırlar ayrı toplanır ve sonda bir kez başa eklenir (her satırda dizini yeniden kurmak 2000 etütte yavaştı)
          added.push(incomingEtut);
          localById.set(re.id, -1 - (added.length - 1));
          etutsChanged = true;
        }
      }
      if (added.length) next.unshift(...added.reverse());

      // Aşama 179: etüt satırı değişmeyen (artımlı okumada gelmeyen) ama yoklaması değişen etütler
      if (yk && yk.touched.size) {
        for (let i = 0; i < next.length; i++) {
          const e = next[i];
          if (!e || e.privacyRedacted || !yk.touched.has(e.id) || incomingIds.has(e.id)) continue;
          let att = mergeAttendance(this.etutYoklama.get(e.id) || {}, e.studentAttendance || {});
          const gone = yk.removed.get(e.id);
          if (gone && gone.size) {
            att = { ...att };
            for (const sid of gone) delete att[sid];
          }
          if (JSON.stringify(att) !== JSON.stringify(e.studentAttendance || {})) {
            next[i] = { ...e, studentAttendance: att };
            etutsChanged = true;
          }
        }
      }

      // Merkezi veritabanı tek doğruluk kaynağıdır: bulutta olmayan (başka cihazdan silinmiş)
      // etütler yerelden de kaldırılır. ÖNCEKİ DAVRANIŞ bunları buluta geri yüklüyordu ve
      // bir cihazda silinen etüt diğer cihazdan tekrar "diriliyordu".
      let kept: Etut[];
      if (!delta) {
        kept = next.filter((e) => incomingIds.has(e.id));
      } else {
        // Aşama 111: artımlı okumada yalnız sunucunun "silindi" dediği satırlar ve artık ortak takvimde / zümrede
        // olmayan ayrıntısız satırlar çıkar
        const removed = res.removed;
        const zumreUser = zumreLoaded;
        kept = next.filter((e) => {
          if (incomingIds.has(e.id)) return true;
          if (removed && removed.has(e.id)) return false;
          if (e.privacyRedacted) return !sharedLoaded;
          // Zümre Başkanı başkasının etüdünü yalnız zümre işlevinden alır; orada artık yoksa çıkar
          if (zumreUser && !this.isMyEtut(e)) return false;
          return true;
        });
      }
      if (kept.length !== next.length) etutsChanged = true;

      if (etutsChanged) {
        this.etuts = kept;
        saveData(STORAGE_KEYS.ETUTS, this.etuts);
        this.notify('etut');
      }
    } catch (err) {
      if (!isBackground) console.warn('[EtutSync] Sync error:', err);
    }
  }

  public async syncStudentsFromSupabase(isBackground = false): Promise<Student[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await hasCloudSession())) return this.students;
    try {
      await this.syncTombstonesFromCloud();

      // 1. Fetch individual rows from students table
      const { data: remoteStudents, error: errStd } = await this.fetchStudentRowsWithContacts(isBackground); // Aşama 85, 193
      if (errStd) {
        console.warn('Error fetching students from Supabase:', errStd);
        return this.students;
      }

      const remoteStudentMap = new Map<string, any>();

      if (remoteStudents && Array.isArray(remoteStudents)) {
        remoteStudents.forEach((rs: any) => {
          if (!rs.id || this.deletedStudentIds.has(rs.id)) return;
          if (rs.status === 'mezun') return; // Aşama 350: mezun öğrenci
          remoteStudentMap.set(rs.id, rs);
        });
      }

      const mergedStudentMap = new Map<string, Student>();
      // Aşama 88: mevcut öğrenciler kimliğe göre bir kez dizinlenir (her satırda liste baştan taranmaz)
      const localById = new Map<string, Student>();
      for (const s of this.students) if (s && !localById.has(s.id)) localById.set(s.id, s);

      // Populate from remote map
      remoteStudentMap.forEach((rs: any, id: string) => {
        if (this.deletedStudentIds.has(id)) return;
        const existing = localById.get(id);
        const cleanRemoteEmail = cleanStudentEmail(rs.email);

        const remoteSuspended = rs.status === 'suspended';
        const remoteClass = this.classes.find((c) => c.id === rs.class_id);
        if (existing) {
          mergedStudentMap.set(id, {
            ...existing,
            name: rs.name || existing.name,
            studentNumber: rs.student_number ?? existing.studentNumber,
            className: rs.class_name || existing.className,
            classId: rs.class_id || existing.classId,
            email: cleanRemoteEmail || '',
            phone: rs.phone || '',
            parents: 'parents' in rs ? cleanParents(rs.parents) : existing.parents,
            avatar: rs.avatar || existing.avatar,
            gender: 'gender' in rs ? normGender(rs.gender) : existing.gender,
            // Aşama 324: yalnız korumalı tablodan okunur (öğrenci satırındaki sütun hep boştur)
            birthDate: BulutDepoKatmani.contactsMode === 'table' && !BulutDepoKatmani.birthMissing ? rs.birth_date || undefined : existing.birthDate,
            auth_user_id: rs.auth_user_id || undefined,
            status: remoteSuspended ? 'suspended' : 'active',
            isSuspended: remoteSuspended,
            password: undefined,
            schoolLevel: remoteClass?.schoolLevel || existing.schoolLevel || detectSchoolLevelFromGrade(rs.class_name) || 'Ortaokul',
            gradeLevel: remoteClass?.gradeLevel || existing.gradeLevel,
            branch: remoteClass?.branch || existing.branch,
            kurumId: rs.kurum_id || null,
          });
        } else {
          mergedStudentMap.set(id, {
            id: rs.id,
            name: rs.name,
            username: rs.student_number || cleanRemoteEmail?.split('@')[0] || rs.id,
            email: cleanRemoteEmail,
            mustChangePassword: false,
            className: rs.class_name || 'Atanmadı',
            classId: rs.class_id || 'class-default',
            studentNumber: rs.student_number || '',
            phone: rs.phone || '',
            parents: cleanParents(rs.parents),
            avatar: rs.avatar || undefined,
            gender: normGender(rs.gender),
            birthDate: BulutDepoKatmani.contactsMode === 'table' ? rs.birth_date || undefined : undefined, // Aşama 324
            createdAt: rs.registered_at || new Date().toISOString(),
            status: remoteSuspended ? 'suspended' : 'active',
            isSuspended: remoteSuspended,
            auth_user_id: rs.auth_user_id || undefined,
            schoolLevel: remoteClass?.schoolLevel || detectSchoolLevelFromGrade(rs.class_name) || 'Ortaokul',
            gradeLevel: remoteClass?.gradeLevel,
            branch: remoteClass?.branch,
            kurumId: rs.kurum_id || null,
          });
        }
      });

      const nextStudents = adoptList(this.students, Array.from(mergedStudentMap.values()));
      if (nextStudents === this.students) return this.students; // Aşama 84: değişiklik yok
      this.students = nextStudents;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      this.notify();

      return this.students;
    } catch (e) {
      if (!isBackground) console.warn('Exception in syncStudentsFromSupabase:', e);
      return this.students;
    }
  }

  // --- CENTRAL DATABASE AS SINGLE SOURCE OF TRUTH (CROSS-DEVICE SYNC) ---

  public async syncHomeworksFromSupabase(isBackground = false): Promise<Homework[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await hasCloudSession())) return this.homeworks;
    try {
      const { data: remoteHws, error: errHws } = await fetchAllRows('homeworks');
      if (errHws) {
        if (!isBackground) console.warn('[HomeworkSync] Error fetching homeworks from Supabase:', errHws);
        return this.homeworks;
      }

      if (remoteHws && Array.isArray(remoteHws)) {
        const validHws: Homework[] = [];
        remoteHws.forEach((rh: any) => {
          if (!rh || typeof rh.id !== 'string') return;
          if (rh.id === '__system_sync_tombstones__') {
            this.handleRemoteTombstonesPayload(rh.description);
            return;
          }
          // Diğer sistem satırları (dokümanlar, eski eşitleme satırları) ödev değildir
          if (rh.id.startsWith('__') || rh.subject === 'TeacherSync' || rh.subject === 'SystemSync') return;
          validHws.push(this.homeworkFromRow(rh));
        });

        validHws.sort(
          (a, b) =>
            new Date(b.createdAt || b.dueDate || 0).getTime() -
            new Date(a.createdAt || a.dueDate || 0).getTime()
        );

        // Aşama 84: değişmeyen ödevler ve teslimler aynen kalır; hiçbir şey değişmediyse kayıt / yeniden çizim yok
        const nextHws = adoptList(this.homeworks, validHws);
        const ids = new Set(validHws.map((h) => h.id));
        const keptSubs = this.submissions.filter((s) => ids.has(s.homeworkId));
        const nextSubs = keptSubs.length === this.submissions.length ? this.submissions : keptSubs;
        if (nextHws !== this.homeworks || nextSubs !== this.submissions) {
          if (nextHws !== this.homeworks) saveData(STORAGE_KEYS.HOMEWORK, nextHws);
          if (nextSubs !== this.submissions) saveData(STORAGE_KEYS.SUBMISSIONS, nextSubs);
          this.homeworks = nextHws;
          this.submissions = nextSubs;
          this.notify('odev', 'teslim');
        }
      }

      return this.homeworks;
    } catch (e) {
      if (!isBackground) console.warn('[HomeworkSync] Exception:', e);
      return this.homeworks;
    }
  }

  protected submissionsSyncedAt = '';
  protected submissionsFullAt = 0;
  // Ödev teslimleri ayrı tablodan okunur (her öğrenci-ödev için tek satır)
  public async syncSubmissionsFromSupabase(isBackground = false): Promise<HomeworkSubmission[]> {
    if (!(await hasCloudSession())) return this.submissions;
    try {
      // Aşama 15: arka planda (uygulamaya dönüşte) yalnız son değişen teslimler okunur; tamamı 30 dakikada bir
      const incremental =
        isBackground && this.submissionsSyncedAt && Date.now() - this.submissionsFullAt < 30 * 60000 ? this.submissionsSyncedAt : '';
      const { data, error } = await fetchAllRows(
        'homework_submissions',
        incremental ? (q: any) => q.gte('updated_at', incremental) : undefined
      );
      if (error) {
        if (!isBackground) console.warn('[SubmissionSync] Error:', error);
        return this.submissions;
      }
      if (Array.isArray(data)) {
        const rows = data.map((r: any) => this.submissionFromRow(r));
        if (incremental) {
          if (data.some((r: any) => !r || typeof r.updated_at !== 'string' || r.updated_at > incremental)) {
            const ids = new Set(rows.map((r) => r.id));
            const nextSubs = adoptList(this.submissions, [...rows, ...this.submissions.filter((x) => !ids.has(x.id))]);
            if (nextSubs !== this.submissions) {
              this.submissions = nextSubs;
              saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
              this.notify('teslim');
            }
          }
        } else {
          this.submissionsFullAt = Date.now();
          const nextSubs = adoptList(this.submissions, rows);
          if (nextSubs !== this.submissions) {
            this.submissions = nextSubs;
            saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
            this.notify('teslim');
          }
        }
        // işaret, sunucunun saatine göre (cihaz saati yanlış olabilir): en son değişen teslimin zamanı
        let mark = incremental;
        for (const r of data) if (r && typeof r.updated_at === 'string' && r.updated_at > mark) mark = r.updated_at;
        this.submissionsSyncedAt = mark;
      }
      return this.submissions;
    } catch (e) {
      if (!isBackground) console.warn('[SubmissionSync] Exception:', e);
      return this.submissions;
    }
  }

  protected async refreshSubmissionsForHomework(homeworkId: string): Promise<void> {
    try {
      const { data, error } = await supabase.from('homework_submissions').select('*').eq('homework_id', homeworkId);
      if (error || !Array.isArray(data)) return;
      this.submissions = [
        ...data.map((r: any) => this.submissionFromRow(r)),
        ...this.submissions.filter((s) => s.homeworkId !== homeworkId),
      ];
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      this.notify('teslim');
    } catch {
      // bir sonraki eşitlemede düzelir
    }
  }

  public async syncAttendanceFromSupabase(isBackground = false): Promise<AttendanceRecord[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await hasCloudSession())) return this.attendance;
    try {
      const toRecord = (ra: any): AttendanceRecord => ({
        id: ra.id,
        classId: ra.class_id,
        date: ra.date,
        subject: ra.subject || 'Genel',
        records: Array.isArray(ra.records) ? ra.records : [],
        createdBy: ra.created_by || undefined,
      });
      const res = await this.fetchTableSmart(
        'attendance',
        isBackground,
        () => this.attendance.map((a) => a.id),
        { order: 'date', ascending: false },
        () => this.fetchStudentSafe('student_my_attendance', () => fetchAllRows('attendance', undefined, { order: 'date', ascending: false }))
      );

      if (res.mode === 'error') {
        if (!isBackground) console.warn('[AttendanceSync] Error:', res.error);
        return this.attendance;
      }

      if (res.mode === 'delta') {
        const merged = mergeDelta(this.attendance, res.data.map(toRecord), res.removed);
        if (merged) {
          this.attendance = merged.sort(byDateDesc);
          saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
          this.notify('yoklama');
        }
        return this.attendance;
      }

      const remoteAtt = res.data;
      if (remoteAtt && Array.isArray(remoteAtt)) {
        const nextAtt: AttendanceRecord[] = remoteAtt.map(toRecord);
        nextAtt.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        const adopted = adoptList(this.attendance, nextAtt); // Aşama 84
        if (adopted !== this.attendance) {
          this.attendance = adopted;
          saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
          this.notify('yoklama');
        }
      }

      return this.attendance;
    } catch (e) {
      if (!isBackground) console.warn('[AttendanceSync] Exception:', e);
      return this.attendance;
    }
  }

  public async syncGradesFromSupabase(isBackground = false): Promise<GradeRecord[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await hasCloudSession())) return this.grades;
    try {
      const res = await this.fetchTableSmart(
        'grades',
        isBackground,
        () => this.grades.map((g) => g.id),
        { order: 'date', ascending: false },
        () => fetchAllRows('grades', undefined, { order: 'date', ascending: false })
      );

      if (res.mode === 'error') {
        if (!isBackground) console.warn('[GradesSync] Error:', res.error);
        return this.grades;
      }

      if (res.mode === 'delta') {
        const merged = mergeDelta(this.grades, res.data.map((rg: any) => this.gradeFromRow(rg)), res.removed);
        if (merged) {
          this.grades = merged.sort(byDateDesc);
          saveData(STORAGE_KEYS.GRADES, this.grades);
          this.notify('not');
        }
        return this.grades;
      }

      const remoteGrades = res.data;
      if (remoteGrades && Array.isArray(remoteGrades)) {
        const nextGrades = remoteGrades.map((rg: any) => this.gradeFromRow(rg));
        nextGrades.sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : (a.date || '') > (b.date || '') ? -1 : 0));
        const adopted = adoptList(this.grades, nextGrades); // Aşama 84
        if (adopted !== this.grades) {
          this.grades = adopted;
          saveData(STORAGE_KEYS.GRADES, this.grades);
          this.notify('not');
        }
      }

      return this.grades;
    } catch (e) {
      if (!isBackground) console.warn('[GradesSync] Exception:', e);
      return this.grades;
    }
  }

  public async syncMessagesFromSupabase(isBackground = false): Promise<StudentMessage[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await hasCloudSession())) return this.messages;
    try {
      const res = await this.fetchTableSmart(
        'messages',
        isBackground,
        () => this.messages.map((m) => m.id),
        { order: 'created_at', ascending: false },
        () => fetchAllRows('messages', undefined, { order: 'created_at', ascending: false })
      );

      if (res.mode === 'error') {
        if (!isBackground) console.warn('[MessagesSync] Error:', res.error);
        return this.messages;
      }

      if (res.mode === 'delta') {
        const merged = mergeDelta(this.messages, res.data.map((rm: any) => rowToMessage(rm)), res.removed);
        if (merged) {
          // tam okumadaki sıralamayla aynı (en yeni üstte); aynı zamanlıların mevcut sırası korunur
          this.messages = sortByTimeDesc(merged, (m) => m.createdAt);
          saveData(STORAGE_KEYS.MESSAGES, this.messages);
          this.notify('mesaj');
        }
        return this.messages;
      }

      const remoteMsgs = res.data;
      if (remoteMsgs && Array.isArray(remoteMsgs)) {
        // Aşama 88: tarih her kayıt için bir kez çözülür (sonuç eskisiyle aynı)
        const nextMsgs = sortByTimeDesc(remoteMsgs.map((rm: any) => rowToMessage(rm)), (m) => m.createdAt);
        const adopted = adoptList(this.messages, nextMsgs); // Aşama 84
        if (adopted !== this.messages) {
          this.messages = adopted;
          saveData(STORAGE_KEYS.MESSAGES, this.messages);
          this.notify('mesaj');
        }
      }

      return this.messages;
    } catch (e) {
      if (!isBackground) console.warn('[MessagesSync] Exception:', e);
      return this.messages;
    }
  }

  public async syncQuestionLogsAndTargetsFromSupabase(isBackground = false): Promise<void> {
    await Promise.allSettled([
      this.syncQuestionLogsFromSupabase(isBackground),
      this.syncQuestionTargetsFromSupabase(isBackground),
    ]);
  }

  // ---------------------------------------------------------------------------
  // SORU KAYITLARI (Aşama 15)
  // Öğretmen/yönetici: geçen ayın başından bugüne kadar olan kayıtlar toplu okunur (haftalık, aylık ve
  // önceki ayla karşılaştırma için yeterli). Bir öğrencinin eski geçmişi o öğrenci açılınca, daha eski
  // bir hafta/ay seçilince o aralık ayrıca okunur. Uygulamaya geri dönüldüğünde yalnız son 7 gün yenilenir (tamamı 2 saatte bir).
  // Öğrenci: kendi kayıtlarının tamamı okunur (sayısı azdır).
  // ---------------------------------------------------------------------------
  protected questionLogsFrom: string | null = null; // yüklenen ortak aralığın başlangıcı ('' = tamamı)
  protected questionLogsLoadedAt = 0;
  protected questionHistoryLoaded = new Set<string>();
  protected questionLoadPromises = new Map<string, Promise<void>>();
  protected mergeQuestionLogs(incoming: StudentQuestionLog[], replaceFrom: string | null): boolean {
    const base = replaceFrom === null ? this.questionLogs : replaceFrom === '' ? [] : this.questionLogs.filter((l) => (l.date || '') < replaceFrom);
    const byId = new Map<string, StudentQuestionLog>();
    for (const l of base) byId.set(l.id, l);
    for (const l of incoming) {
      if (this.deletedQuestionLogIds?.has(l.id)) continue;
      // Aşama 67: az önce yazdığımız kaydın eski kopyası gelirse yerel (en yeni) kayıt korunur
      const local = this.isStaleQuestionLogCopy(l) ? this.questionLogs.find((x) => x.id === l.id) : undefined;
      byId.set(l.id, local || l);
    }
    // Aşama 84: değişmeyen kayıtlar aynen kalır; hiçbir şey değişmediyse liste de aynı kalır
    const next = adoptList(this.questionLogs, sortLogsDesc(Array.from(byId.values())));
    const changed = next !== this.questionLogs;
    this.questionLogs = next;
    return changed;
  }

  protected noteQuestionLogWrite(l: StudentQuestionLog): void {
    this.recentQuestionLogWrites.set(l.id, { sig: questionLogSig(l), at: Date.now() });
  }

  /** Az önce yazdığımız kaydın (kısa süre içinde gelen) farklı, yani eski bir kopyası mı? */
  protected isStaleQuestionLogCopy(l: StudentQuestionLog): boolean {
    const w = this.recentQuestionLogWrites.get(l.id);
    if (!w) return false;
    if (Date.now() - w.at > EsitlemeKatmani.QLOG_ECHO_WINDOW_MS) {
      this.recentQuestionLogWrites.delete(l.id);
      return false;
    }
    return questionLogSig(l) !== w.sig;
  }

  /** Süre dolunca kaydın buluttaki son hâli okunur (başka cihazdan gerçek bir değişiklik olduysa alınır) */
  protected verifyQuestionLogLater(id: string): void {
    window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.from('question_logs').select('*').eq('id', id).maybeSingle();
        if (error || !data || this.deletedQuestionLogIds?.has(id)) return;
        this.mergeQuestionLogs([questionLogFromRow(data)], null);
        this.persistQuestionLogsLocal();
        this.notify('soru');
      } catch {
        /* sonraki eşitlemede düzelir */
      }
    }, EsitlemeKatmani.QLOG_ECHO_WINDOW_MS + 1500);
  }

  public async syncQuestionLogsFromSupabase(isBackground = false): Promise<StudentQuestionLog[]> {
    if (!(await hasCloudSession())) return this.questionLogs;
    try {
      const isStudent = this.getAuthSession()?.role === 'student';
      const loaded = this.questionLogsFrom !== null;
      const recentOnly = !isStudent && isBackground && loaded && Date.now() - this.questionLogsLoadedAt < 2 * 3600 * 1000;
      let from: string;
      if (isStudent) from = '';
      else if (recentOnly) from = ymdLocal(new Date(Date.now() - 7 * 86400000));
      else {
        const def = defaultQuestionWindowStart();
        from = loaded && this.questionLogsFrom !== null && this.questionLogsFrom < def ? this.questionLogsFrom : def;
      }
      const { data, error } = await fetchAllRows('question_logs', from ? (q: any) => q.gte('date', from) : undefined);
      if (error) {
        if (!isBackground) console.warn('[QuestionLogsSync] Error:', error);
        return this.questionLogs;
      }
      if (Array.isArray(data)) {
        const changed = this.mergeQuestionLogs(
          data.map((r: any) => questionLogFromRow(r)),
          from
        );
        if (!recentOnly) {
          this.questionLogsFrom = from;
          this.questionLogsLoadedAt = Date.now();
        }
        if (changed) {
          this.persistQuestionLogsLocal();
          this.notify('soru');
        }
      }
      return this.questionLogs;
    } catch (e) {
      if (!isBackground) console.warn('[QuestionLogsSync] Exception:', e);
      return this.questionLogs;
    }
  }

  // Daha eski bir hafta/ay görüntülenecekse o tarihten itibaren olan kayıtlar da okunur
  public ensureQuestionLogsFrom(fromDate: string): Promise<void> {
    if (!fromDate || this.questionLogsFrom === null || this.questionLogsFrom === '' || fromDate >= this.questionLogsFrom) return Promise.resolve();
    const key = `range:${fromDate}`;
    const running = this.questionLoadPromises.get(key);
    if (running) return running;
    const until = this.questionLogsFrom;
    const p = (async () => {
      try {
        const { data, error } = await fetchAllRows('question_logs', (q: any) => q.gte('date', fromDate).lt('date', until));
        if (error || !Array.isArray(data)) return;
        this.mergeQuestionLogs(data.map((r: any) => questionLogFromRow(r)), null);
        if (this.questionLogsFrom !== null && this.questionLogsFrom !== '' && fromDate < this.questionLogsFrom) this.questionLogsFrom = fromDate;
        this.notify();
      } catch {
        // bir sonraki denemede tekrar okunur
      } finally {
        this.questionLoadPromises.delete(key);
      }
    })();
    this.questionLoadPromises.set(key, p);
    return p;
  }

  // Bir öğrencinin tüm geçmişi (geçmiş haftalar/aylar listesi ve raporlar için)
  public ensureStudentQuestionHistory(studentId: string): Promise<void> {
    if (!studentId || this.questionHistoryLoaded.has(studentId) || this.questionLogsFrom === '') return Promise.resolve();
    if (this.getAuthSession()?.role === 'student') return Promise.resolve();
    const key = `student:${studentId}`;
    const running = this.questionLoadPromises.get(key);
    if (running) return running;
    const p = (async () => {
      try {
        const { data, error } = await fetchAllRows('question_logs', (q: any) => q.eq('student_id', studentId));
        if (error || !Array.isArray(data)) return;
        this.questionHistoryLoaded.add(studentId);
        this.mergeQuestionLogs(data.map((r: any) => questionLogFromRow(r)), null);
        this.notify();
      } catch {
        // bir sonraki açılışta tekrar denenir
      } finally {
        this.questionLoadPromises.delete(key);
      }
    })();
    this.questionLoadPromises.set(key, p);
    return p;
  }

  public async syncQuestionTargetsFromSupabase(isBackground = false): Promise<WeeklyQuestionTarget[]> {
    if (!(await hasCloudSession())) return this.weeklyQuestionTargets;
    try {
      // Supabase bir istekte en fazla 1000 satır döndürür; hedefler sayfa sayfa okunur
      const data: any[] = [];
      let error: any = null;
      for (let from = 0; from < 50000; from += 1000) {
        const res = await supabase.from('question_targets').select('*').order('id', { ascending: true }).range(from, from + 999);
        if (res.error) {
          error = res.error;
          break;
        }
        data.push(...(res.data || []));
        if (!res.data || res.data.length < 1000) break;
      }
      if (error) {
        if (!isBackground) console.warn('[QuestionTargetsSync] Error:', error);
        return this.weeklyQuestionTargets;
      }
      if (Array.isArray(data)) {
        const next = adoptList(this.weeklyQuestionTargets, data.map((r: any) => questionTargetFromRow(r))); // Aşama 84
        if (next !== this.weeklyQuestionTargets) {
          this.weeklyQuestionTargets = next;
          saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
          this.notify('hedef');
        }
      }
      return this.weeklyQuestionTargets;
    } catch (e) {
      if (!isBackground) console.warn('[QuestionTargetsSync] Exception:', e);
      return this.weeklyQuestionTargets;
    }
  }

  // Belge listesi: yalnız hafif sütunlar okunur (önizleme ve eski gömülü dosyalar açılınca ayrıca yüklenir)
  protected static readonly DOCUMENT_LIST_COLUMNS =
    'id,title,description,category,file_format,file_name,file_size,storage_path,subject,school_type,grade_level,academic_year,tags,author_name,uploaded_by,owner_auth_id,created_at';

  protected currentAuthUid: string | null = null;

  public async syncTeacherDocumentsFromSupabase(isBackground = false): Promise<TeacherDocument[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (this.getAuthSession()?.role === 'student') return this.documents;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return this.documents;
      this.currentAuthUid = sessionData.session.user?.id || null;
      const { data: rows, error } = await supabase
        .from('teacher_documents')
        .select(EsitlemeKatmani.DOCUMENT_LIST_COLUMNS)
        .order('created_at', { ascending: false });
      if (error) {
        if (!isBackground) console.warn('[DocumentsSync] Error:', error);
        return this.documents;
      }
      const nextDocs = adoptList(this.documents, (rows || []).map((r: any) => documentFromRow(r)));
      if (nextDocs === this.documents) return this.documents; // Aşama 84: değişiklik yok
      this.documents = nextDocs;
      this.persistDocumentsLocal();
      this.notify('belge');
      return this.documents;
    } catch (e) {
      if (!isBackground) console.warn('[DocumentsSync] Exception:', e);
      return this.documents;
    }
  }

  // =========================================================================
  // Aşama 179: etüt yoklaması ayrı tabloda (sql/178 etut_yoklama), yorumlar ayrı sütunda.
  // Her işlem yalnız kendi alanını yazar: yoklama yalnız değişen öğrencinin satırını, yorum yalnız kendi
  // sütununu, etüt düzenleme yalnız tanımı. Sunucu öğrenci başına "en son değişen kazanır" kuralını uygular.
  // 'no' = tablo yok (sql/178 kurulmamış). Aşama 196'dan sonra eski yol (notes) yoktur: yazma başarısız sayılır.
  // =========================================================================
  public static etutYoklamaTable: 'unknown' | 'yes' | 'no' = 'unknown';
  protected static readonly ETUT_YOKLAMA_COLUMNS =
    'id,etut_id,student_id,student_name,status,note,topic,marked_by,marked_at,changed_at,updated_at';

  protected etutYoklamaIds(): string[] {
    const out: string[] = [];
    for (const [eid, m] of this.etutYoklama) for (const sid of Object.keys(m)) out.push(`${eid}|${sid}`);
    return out;
  }

  /** Yoklama tablosu artımlı okunur (yalnız öğretmen; öğrenci ve zümre sunucu işlevinden alır) */
  protected async syncEtutYoklama(
    isBackground: boolean
  ): Promise<{ touched: Set<string>; removed: Map<string, Set<string>> } | null> {
    // Aşama 196: yoklama yalnız bu tablodan okunduğu için her eşitlemede denenir (eskiden 'no' ise atlanıyordu)
    if (this.getAuthSession()?.role !== 'teacher') return null;
    const columns = EsitlemeKatmani.ETUT_YOKLAMA_COLUMNS;
    const res = await this.fetchTableSmart(
      'etut_yoklama',
      isBackground,
      () => this.etutYoklamaIds(),
      { columns },
      () => fetchAllRows('etut_yoklama', undefined, { columns })
    );
    if (res.mode === 'error') {
      if (isEtutYoklamaMissing(res.error)) {
        EsitlemeKatmani.etutYoklamaTable = 'no';
        this.etutYoklama.clear();
      }
      return null;
    }
    EsitlemeKatmani.etutYoklamaTable = 'yes';
    const touched = new Set<string>();
    const removed = new Map<string, Set<string>>();
    if (res.mode === 'full') {
      const next = new Map<string, Record<string, EtutStudentAttendance>>();
      for (const r of res.data) {
        if (!r || !r.etut_id || !r.student_id) continue;
        const m = next.get(r.etut_id) || {};
        m[r.student_id] = yoklamaRowToAttendance(r);
        next.set(r.etut_id, m);
      }
      for (const [eid, m] of this.etutYoklama) {
        touched.add(eid);
        const nm = next.get(eid) || {};
        for (const sid of Object.keys(m)) {
          if (nm[sid]) continue;
          if (!removed.has(eid)) removed.set(eid, new Set());
          removed.get(eid)!.add(sid);
        }
      }
      for (const eid of next.keys()) touched.add(eid);
      this.etutYoklama = next;
      return { touched, removed };
    }
    if (res.removed) {
      for (const key of res.removed) {
        const cut = key.indexOf('|');
        if (cut < 0) continue;
        const eid = key.slice(0, cut);
        const sid = key.slice(cut + 1);
        const m = this.etutYoklama.get(eid);
        if (m && m[sid]) {
          const nm = { ...m };
          delete nm[sid];
          this.etutYoklama.set(eid, nm);
        }
        if (!removed.has(eid)) removed.set(eid, new Set());
        removed.get(eid)!.add(sid);
        touched.add(eid);
      }
    }
    for (const r of res.data) {
      if (!r || !r.etut_id || !r.student_id) continue;
      const m = { ...(this.etutYoklama.get(r.etut_id) || {}) };
      m[r.student_id] = yoklamaRowToAttendance(r);
      this.etutYoklama.set(r.etut_id, m);
      touched.add(r.etut_id);
    }
    return { touched, removed };
  }

  /** Anlık kanal: tek öğrencinin etüt yoklaması değişti */
  public handleRemoteEtutYoklamaEvent(payload: any) {
    try {
      const del = payload?.eventType === 'DELETE';
      const r = del ? payload.old : payload.new;
      if (!r || !r.etut_id || !r.student_id) return;
      const eid = String(r.etut_id);
      const sid = String(r.student_id);
      const cache = { ...(this.etutYoklama.get(eid) || {}) };
      if (del) delete cache[sid];
      else cache[sid] = yoklamaRowToAttendance(r);
      this.etutYoklama.set(eid, cache);
      const idx = this.etuts.findIndex((e) => e.id === eid);
      if (idx === -1 || this.etuts[idx].privacyRedacted) return;
      const e = this.etuts[idx];
      let att: Record<string, EtutStudentAttendance>;
      if (del) {
        att = { ...(e.studentAttendance || {}) };
        delete att[sid];
      } else {
        att = mergeAttendance({ [sid]: cache[sid] }, e.studentAttendance || {});
      }
      if (JSON.stringify(att) === JSON.stringify(e.studentAttendance || {})) return;
      this.etuts[idx] = { ...e, studentAttendance: att };
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      this.notify('etut');
    } catch (err) {
      console.warn('[EtutYoklama] Anlık yoklama olayı işlenemedi:', err);
    }
  }

  /**
   * Aşama 356 (H4): sekmeye dönüş / pencere odağı. Eskiden anlık kanal sağlıklıyken bile her dönüşte (dakikada bir)
   * bütün listeler için ~19 paralel istek atılıyordu. Kanal canlıysa ve sekme kısa süre (30 sn'den az) gizli kaldıysa
   * bu arada hiçbir değişiklik kaçmaz (hepsi kanaldan gelir): yalnız kanal denetlenir ve dakikada bir küçük yoklama
   * (kurum ayarı, bölüm izni) yapılır. Uzun süre gizli kalındıysa, kanal sorunluysa ya da gönderilmeyi bekleyen kayıt
   * varsa eskisi gibi eşitlenir. Güvence eşitlemesi (15 dakikada bir) değişmedi.
   */
  protected donusteEsitle(uzunGizli: boolean): void {
    if (!uzunGizli && !this.gidenKutusu.length && this.getRealtimeHealth() === 'live') {
      this.ensureRealtime();
      this.lightPoll();
      return;
    }
    void this.revalidateAndSyncAll(true, uzunGizli);
  }

  // Tüm verileri buluttan yeniler. Arka plan istekleri (odak, sekmeye dönüş, yedek kontrol) en fazla
  // 15 saniyede bir çalışır; aynı anda ikinci bir tam eşitleme başlatılmaz (çalışan beklenir).
  public async revalidateAndSyncAll(isBackground = false, shortGap = false): Promise<void> {
    // Aşama 343: önce bekleyen kayıtlar gönderilir; hâlâ gönderilemiyorsa sunucudan tam okuma yapılmaz
    // (okunan liste, ekranda duran ama henüz sunucuya ulaşmamış değişikliği silerdi)
    if (this.gidenKutusu.length) {
      await this.gidenKutusunuGonder();
      if (this.gidenKutusu.length) return;
    }
    if (this.fullSyncInFlight) return this.fullSyncInFlight;
    // Aşama 126: anlık kanal sağlıklıysa arka plan tam eşitlemesi en fazla dakikada bir; kanal sorunluysa,
    // uzun arka plandan dönüldüyse ya da kullanıcı isteğiyse (isBackground=false) eskisi gibi
    const gap = !shortGap && this.getRealtimeHealth() === 'live'
      ? EsitlemeKatmani.LIVE_BACKGROUND_SYNC_GAP_MS
      : EsitlemeKatmani.MIN_BACKGROUND_SYNC_GAP_MS;
    if (isBackground && Date.now() - this.lastFullSyncAt < gap) {
      this.ensureRealtime();
      return;
    }
    this.lastFullSyncAt = Date.now();
    this.fullSyncInFlight = this.runFullSync(isBackground).finally(() => {
      this.fullSyncInFlight = null;
    });
    return this.fullSyncInFlight;
  }
  protected backgroundDue(name: string, isBackground: boolean, everyMs = 10 * 60000): boolean {
    const last = this.backgroundSyncedAt.get(name) || 0;
    if (isBackground && last && Date.now() - last < everyMs) return false;
    this.backgroundSyncedAt.set(name, Date.now());
    return true;
  }

  protected async runFullSync(isBackground: boolean): Promise<void> {
    const versionBefore = this.dataVersion;
    try {
      // Aşama 372 (HIZ): şifreli cihaz önbelleğinin anahtarı üretilirken (telefonda ~0,1–0,2 sn) yalnız şifreli üç liste
      // (yoklama, not, mesaj) ve canlı kanal bekler; kurum bilgisi ve diğer listeler hemen başlar. (Aşama 103)
      const kilit: Promise<void> = this.secureRestore || Promise.resolve();
      const kilitSonra = (f: () => Promise<unknown>) => kilit.then(f);
      const kanal = kilit.then(() => {
        this.ensureRealtime();
        this.startPeriodicSync();
      });
      await Promise.allSettled([
        kanal,
        this.syncTombstonesFromCloud(),
        this.syncClassesFromSupabase(isBackground),
        this.syncStudentsFromSupabase(isBackground),
        this.syncEtutsFromSupabase(isBackground),
        this.syncHomeworksFromSupabase(isBackground),
        this.syncSubmissionsFromSupabase(isBackground),
        // yoklama ve notlar arka planda en fazla 10 dakikada bir yenilenir (anlık değişiklikler kanaldan gelir)
        this.backgroundDue('attendance', isBackground) ? kilitSonra(() => this.syncAttendanceFromSupabase(isBackground)) : Promise.resolve(),
        this.backgroundDue('grades', isBackground) ? kilitSonra(() => this.syncGradesFromSupabase(isBackground)) : Promise.resolve(),
        kilitSonra(() => this.syncMessagesFromSupabase(isBackground)),
        this.syncQuestionLogsAndTargetsFromSupabase(isBackground),
        this.syncTeacherDocumentsFromSupabase(isBackground),
        this.syncTeachersFromSupabase(isBackground),
        // Aşama 284: öğrenci başvuru sayısı artık sorulmuyor (bölüm kullanılmıyor; her eşitlemede boşa istekti)
        this.syncMyTeacherAccess(),
        this.syncMyKurum(),
        this.syncStudentBrand(),
        this.syncOgrenciBolum(), // Aşama 165
        this.backgroundDue('planWeekStarts', isBackground) ? this.syncPlanWeekStarts() : Promise.resolve(),
        this.syncStudentNotifications(),
      ]);
      this.lastFullSyncAt = Date.now();
      // Aşama 84: arka plan eşitlemesinde hiçbir veri değişmediyse ekran yeniden çizdirilmez
      if (!isBackground || this.dataVersion !== versionBefore) this.notify();
      else this.lastSyncTimestamp = Date.now();
    } catch (e) {
      if (!isBackground) console.warn('[RevalidateAndSyncAll] Error:', e);
    }
  }

  protected async syncFromSupabase() {
    await this.revalidateAndSyncAll(true);
  }

  public async syncAllTeacherData(): Promise<void> {
    await this.revalidateAndSyncAll(false);
  }

  // Aşama 193: öğretmen eşitlemesinin okuduğu sütunlar (eskiden select('*'))
  protected static get TEACHER_COLUMNS(): string {
    return 'id,name,username,email,branch,avatar,role,status,is_admin,created_at,auth_user_id,kurum_id' + (BulutDepoKatmani.genderMissing.teachers ? '' : ',gender');
  }

  public async syncTeachersFromSupabase(isBackground = false): Promise<Teacher[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await hasCloudSession())) return this.teachers;
    try {
      // Doğrudan public.teachers tablosundan sorgula (homeworks hack'i kullanılmaz)
      // Aşama 193: sütunlar açıkça yazılır ve yalnız değişen satırlar iner (sql/193)
      let { data: remoteRows, error } = await this.fetchRowsSmart('teachers', isBackground, EsitlemeKatmani.TEACHER_COLUMNS);
      if (error && !BulutDepoKatmani.genderMissing.teachers && isMissingGenderColumn(error)) {
        BulutDepoKatmani.genderMissing.teachers = true; // Aşama 171 SQL'i kurulmamış
        ({ data: remoteRows, error } = await this.fetchRowsSmart('teachers', isBackground, EsitlemeKatmani.TEACHER_COLUMNS));
      }

      if (error) {
        if (!isBackground) {
          console.error('[TeacherSync] Error fetching teachers from public.teachers:', error.message);
        }
        return this.teachers;
      }

      if (!remoteRows || remoteRows.length === 0) {
        // Bulutta hiç öğretmen kaydı dönmediyse yerel listeye dokunma (buluta da otomatik yükleme yapma)
        return this.teachers;
      }

      let changed = false;
      let newPendingCount = 0;
      const localTeacherMap = new Map<string, Teacher>();
      this.teachers.forEach((t) => localTeacherMap.set(t.id, t));
      // Aşama 175: kayıtlar yerinde değiştirilmez; değişen öğretmen için yeni nesne üretilir, değişmeyen eski
      // nesnesini korur (ekranlar yalnız değişeni yeniden çizer). Hiçbir şey değişmediyse liste aynı kalır.
      const newcomers: Teacher[] = [];
      const replaced = new Map<string, Teacher>();

      for (const row of remoteRows) {
        if (!row.id || this.deletedTeacherIds.has(row.id)) continue;

        const localT = localTeacherMap.get(row.id);
        const remoteIsAdmin = Boolean(row.is_admin);

        if (!localT) {
          // Yeni gelen öğretmen kaydı
          const newTeacher: Teacher = {
            id: row.id,
            auth_user_id: row.auth_user_id || undefined,
            name: row.name || 'Öğretmen',
            username: row.username || row.name || 'ogretmen',
            email: row.email || '',
            branch: row.branch || 'Öğretmen',
            avatar: row.avatar || undefined,
            gender: normGender(row.gender),
            role: (row.role as 'teacher') || 'teacher',
            status: (row.status as any) || 'approved',
            isAdmin: remoteIsAdmin,
            isSuspended: row.status === 'suspended',
            createdAt: row.created_at || new Date().toISOString(),
            kurumId: row.kurum_id || null,
          };

          newcomers.push(newTeacher);
          localTeacherMap.set(row.id, newTeacher);
          changed = true;
          if (newTeacher.status === 'pending') {
            newPendingCount++;
          }
        } else {
          // Mevcut öğretmen: veritabanı verileriyle güncelle (kopya üzerinde)
          let updated = false;
          const prev = localT;
          const localT2: Teacher = { ...prev };

          if (row.name && row.name !== localT2.name) {
            localT2.name = row.name;
            updated = true;
          }
          if (row.username && row.username !== localT2.username) {
            localT2.username = row.username;
            updated = true;
          }
          // Aşama 175: başka cihazda silinen e-posta / fotoğraf da taşınır (eskiden boş değer atlanıyordu)
          if ('email' in row && (row.email || '') !== (localT2.email || '')) {
            localT2.email = row.email || '';
            updated = true;
          }
          if (row.branch && row.branch !== localT2.branch) {
            localT2.branch = row.branch;
            updated = true;
          }
          if ('avatar' in row && (row.avatar || undefined) !== (localT2.avatar || undefined)) {
            localT2.avatar = row.avatar || undefined;
            updated = true;
          }
          if ('gender' in row && normGender(row.gender) !== localT2.gender) {
            localT2.gender = normGender(row.gender); // Aşama 171
            updated = true;
          }
          if (row.auth_user_id && row.auth_user_id !== localT2.auth_user_id) {
            localT2.auth_user_id = row.auth_user_id;
            updated = true;
          }
          if (row.status && row.status !== localT2.status) {
            localT2.status = row.status;
            updated = true;
          }
          const remoteSuspended = row.status === 'suspended';
          if (!!localT2.isSuspended !== remoteSuspended) {
            localT2.isSuspended = remoteSuspended;
            updated = true;
          }
          if (localT2.isAdmin !== remoteIsAdmin) {
            localT2.isAdmin = remoteIsAdmin;
            updated = true;
          }
          if ('kurum_id' in row && (row.kurum_id || null) !== (localT2.kurumId || null)) {
            localT2.kurumId = row.kurum_id || null;
            updated = true;
          }

          if (updated) {
            changed = true;
            replaced.set(row.id, localT2);
            localTeacherMap.set(row.id, localT2);
            const currentSession = this.getAuthSession();
            if (currentSession?.role === 'teacher' && currentSession.user.id === row.id) {
              this.setAuthSession({
                ...currentSession,
                user: {
                  ...currentSession.user,
                  ...localT2,
                },
              });
            }
          }
        }
      }

      // Merkezi veritabanı tek doğruluk kaynağıdır: yerelde olup bulutta olmayan öğretmenler
      // (ör. her yeni cihazda yerelde otomatik oluşturulan 'teacher-1' yönetici kopyası)
      // artık buluta YÜKLENMEZ, yerelden kaldırılır. Önceki davranış çift admin kaydı üretiyordu.
      const remoteIdSet = new Set(remoteRows.map((r: any) => r.id));
      const kept = this.teachers.filter((lt) => remoteIdSet.has(lt.id));
      if (kept.length !== this.teachers.length) changed = true;
      if (changed) {
        const merged = kept.map((t) => replaced.get(t.id) || t);
        this.teachers = newcomers.length ? [...newcomers.reverse(), ...merged] : merged;
      }

      if (changed) {
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);

        if (newPendingCount > 0) {
          playNotificationChime();
          sendBrowserNotification(
            'Yeni Öğretmen Kayıt Başvurusu',
            `${newPendingCount} yeni öğretmen başvurusu onay bekliyor.`
          );
        }

        this.notify();
      }

      return this.teachers;
    } catch (e: any) {
      if (!isBackground) console.error('[TeacherSync] syncTeachersFromSupabase error:', e?.message || e);
      return this.teachers;
    }
  }

  public async forceSyncTeachers(): Promise<Teacher[]> {
    return this.syncTeachersFromSupabase(false);
  }

  public async syncClassesFromSupabase(isBackground = false): Promise<ClassGroup[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await hasCloudSession())) return this.classes;
    try {
      // 0. Ensure tombstones are loaded first
      await this.syncTombstonesFromCloud();

      // 1. Fetch from Supabase classes table (Central DB is source of truth)
      const { data: remoteClasses, error: errCls } = await this.fetchRowsSmart('classes', isBackground, '*'); // Aşama 193: artımlı
      if (errCls) {
        if (!isBackground) {
          console.warn('Error fetching classes from Supabase:', errCls);
        }
        return this.classes;
      }

      const remoteMap = new Map<string, ClassGroup>();

      if (remoteClasses && Array.isArray(remoteClasses)) {
        remoteClasses.forEach((rc: any) => {
          if (!rc.id || this.deletedClassIds.has(rc.id)) return;
          if (rc.arsiv === true) return; // Aşama 350: arşivdeki (geçen yılın) sınıf
          const normRcName = (rc.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
          if (!normRcName || normRcName === 'sinif' || normRcName === 'atanmadi' || normRcName === 'tanimsiz') return;

          const localCopy = this.classes.find((c) => c.id === rc.id);
          remoteMap.set(rc.id, {
            id: rc.id,
            name: rc.name,
            branch: rc.branch || 'Genel',
            gradeLevel: rc.level ? `${rc.level}. Sınıf` : undefined,
            schoolLevel: rc.level && rc.level >= 9 ? 'Lise' : 'Ortaokul',
            academicYear: rc.academic_year || currentAcademicYear(),
            // Sütun henüz yoksa (SQL çalıştırılmadıysa) yereldeki açıklama korunur
            description: 'description' in rc ? rc.description || undefined : localCopy?.description,
            kurumId: rc.kurum_id || null,
          });
        });
      }

      // The central database is the single source of truth:
      // Any class deleted on computer is cleanly removed from local state on all devices!
      const deduplicatedClasses = adoptList(this.classes, this.deduplicateClasses(Array.from(remoteMap.values())));
      if (deduplicatedClasses === this.classes) return this.classes; // Aşama 84: değişiklik yok
      this.classes = deduplicatedClasses;
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      this.notify();

      return this.classes;
    } catch (e) {
      if (!isBackground) console.warn('Exception in syncClassesFromSupabase:', e);
      return this.classes;
    }
  }
}
