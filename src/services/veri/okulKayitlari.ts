// ============================================================================
// Aşama 359: OKUL KAYITLARI: sınıflar, öğrenciler, öğrenci hesapları, kayıt başvuruları
// dataService.ts'ten KELİMESİ KELİMESİNE taşındı; yalnız "private" → "protected" (alt katmanlar kullanabilsin diye) ve
// statik değerlerde "DataService." → tanımlandığı katmanın adı. Davranış aynı. Katman sırası: temel → kurumYetki → bulutDepo → esitleme → hesaplar → okulKayitlari → dataService
// ============================================================================
import {
  Student,
  Teacher,
  ClassGroup,
  StudentAccountInput,
  StudentCredential,
  StudentAccountFailure,
  StudentAccountResult,
  StudentApplication,
} from '../../types';
import { supabase, invokeCreateUserEdgeFunction } from '../../lib/supabase';
import { sifreSorunu } from '../../lib/sifreKurali';
import { normalizeClassKey, normalizeAcademicYear, currentAcademicYear } from '../../lib/importNormalize';
import { newId } from '../../lib/ids';
import { gecerliDogumTarihi } from '../../lib/dogumTarihi';
import { STORAGE_KEYS, PERMANENT_KEYS, appStorage, saveData } from '../depo';
import { MIN_PASSWORD_LENGTH } from '../hataMetinleri';
import {
  isMissingGenderColumn,
  isMissingBirthColumn,
  isMissingParentColumn,
  isMissingDescriptionColumn,
  duplicateClassMessage,
} from '../hataMetinleri';
import { deleteRowsVerified, deleteLoginAccounts } from '../bulutIslemleri';
import { normGender, classLevelOf } from '../kayitKurallari';
import { BulutDepoKatmani } from './bulutDepo';
import { HesapKatmani } from './hesaplar';
import { cleanStudentEmail } from './ortak';
// Bu modülde "localStorage" adı depodaki yönlendiriciyi ifade eder (dataService.ts ile aynı)
const localStorage = appStorage;

export abstract class OkulKayitKatmani extends HesapKatmani {

  protected static readonly BIRTH_SQL_MSG = "Doğum tarihi için 324 numaralı SQL dosyasının (324_ogrenci_dogum_tarihi.sql) Supabase'te çalıştırılması gerekiyor.";

  /** Aşama 69: 69 numaralı SQL çalıştırılmadıysa students tablosunda veli sütunları yoktur */
  protected static parentColumnsMissing = false;
  protected static readonly PARENT_SQL_MSG =
    "Veli bilgileri için 69 numaralı SQL dosyasının (69_veli_iletisim.sql) Supabase'te çalıştırılması gerekiyor.";
  // Mevcut öğrenci satırlarını günceller. (Eskiden "upsert" kullanılıyordu; öğretmen ve öğrenci
  // rollerinde ekleme yetkisi olmadığından sessizce başarısız oluyordu.) Her satırın gerçekten
  // güncellendiği doğrulanır: yetki yoksa veritabanı hata vermeden 0 satır döndürür.
  // Aşama 181: öğrencilerin YALNIZ sınıf bilgisini toplu yazar. Eskiden her öğrencinin bütün satırı (ad, e-posta,
  // veliler...) ayrı istekle ve sırayla gidiyordu: 300 öğrenci = 300 ardışık istek, üstelik cihazdaki eski kopya
  // başka bir cihazda yapılan ad / veli değişikliğini ezebiliyordu. Şimdi 150'lik gruplar paralel gider; veritabanının
  // gerçekten güncellediği öğrenciler döner. Eksik kalan varsa (yetki / kayıt yok) hata ile birlikte bildirilir.
  protected async setStudentsClassInCloud(
    ids: string[],
    classId: string,
    className: string
  ): Promise<{ success: boolean; error?: any; writtenIds: Set<string> }> {
    const writtenIds = new Set<string>();
    const uniq = [...new Set(ids.filter((id) => id && !this.deletedStudentIds.has(id)))];
    if (uniq.length === 0) return { success: true, writtenIds };
    const patch = { class_id: classId || 'class-default', class_name: className || 'Atanmadı' };
    const CHUNK = 150;
    const parts: string[][] = [];
    for (let i = 0; i < uniq.length; i += CHUNK) parts.push(uniq.slice(i, i + CHUNK));
    try {
      const results = await Promise.all(parts.map((part) => supabase.from('students').update(patch).in('id', part).select('id')));
      let firstError: any = null;
      for (const r of results) {
        if (r.error) firstError = firstError || r.error;
        for (const row of (r.data || []) as Array<{ id: string }>) writtenIds.add(String(row.id));
      }
      if (firstError) return { success: false, error: firstError, writtenIds };
    } catch (e) {
      return { success: false, error: e, writtenIds };
    }
    const missing = uniq.length - uniq.filter((id) => writtenIds.has(id)).length;
    if (missing > 0) {
      return {
        success: false,
        error: { code: '42501', message: `${missing} öğrencinin sınıf bilgisi güncellenemedi (kayıt bulunamadı veya bu öğrenciler için yetkiniz yok).` },
        writtenIds,
      };
    }
    return { success: true, writtenIds };
  }

  // Aşama 181: toplu yazım yarım kaldıysa (bir kısmı yazıldı) ekran veritabanındaki gerçek hâle çekilir
  protected resyncStudentsAfterPartialWrite(written: Set<string>): void {
    if (written.size > 0) void this.syncStudentsFromSupabase(true);
  }

  protected async patchStudentRow(id: string, patch: Record<string, unknown>): Promise<{ success: boolean; error?: any }> {
    try {
      // Aşama 69: veli sütunları yoksa yazılmaz; yalnızca veli bilgisi değiştiyse SQL uyarısı verilir
      if (OkulKayitKatmani.parentColumnsMissing && 'parents' in patch) {
        const { parents, ...rest } = patch as Record<string, unknown>;
        if (Object.keys(rest).length === 0) return { success: false, error: { message: OkulKayitKatmani.PARENT_SQL_MSG } };
        if (Array.isArray(parents) && parents.length) this.showFloatingErrorToast(`Diğer bilgiler kaydedildi; veli bilgileri kaydedilmedi. ${OkulKayitKatmani.PARENT_SQL_MSG}`);
        patch = rest;
      }
      if (Object.keys(patch).length === 0) return { success: true };
      let { data, error } = await supabase.from('students').update(patch).eq('id', id).select('id');
      if (error && 'gender' in patch && isMissingGenderColumn(error)) {
        BulutDepoKatmani.genderMissing.students = true; // Aşama 171: SQL kurulmadı, cinsiyet atlanır
        const { gender: _g, ...rest } = patch as Record<string, unknown>;
        patch = rest;
        if (Object.keys(patch).length === 0) return { success: true };
        ({ data, error } = await supabase.from('students').update(patch).eq('id', id).select('id'));
      }
      if (error && 'birth_date' in patch && isMissingBirthColumn(error)) {
        BulutDepoKatmani.birthMissing = true; // Aşama 324: SQL kurulmadı, doğum tarihi atlanır
        const { birth_date: _b, ...rest } = patch as Record<string, unknown>;
        if (Object.keys(rest).length === 0) return { success: false, error: { message: OkulKayitKatmani.BIRTH_SQL_MSG } };
        if (_b) this.showFloatingErrorToast(`Diğer bilgiler kaydedildi; doğum tarihi kaydedilmedi. ${OkulKayitKatmani.BIRTH_SQL_MSG}`);
        patch = rest;
        ({ data, error } = await supabase.from('students').update(patch).eq('id', id).select('id'));
      }
      if (error && isMissingParentColumn(error)) {
        OkulKayitKatmani.parentColumnsMissing = true;
        const { parents, ...rest } = patch as Record<string, unknown>;
        if (Object.keys(rest).length === 0) return { success: false, error: { message: OkulKayitKatmani.PARENT_SQL_MSG } };
        if (Array.isArray(parents) && parents.length) this.showFloatingErrorToast(`Diğer bilgiler kaydedildi; veli bilgileri kaydedilmedi. ${OkulKayitKatmani.PARENT_SQL_MSG}`);
        patch = rest;
        ({ data, error } = await supabase.from('students').update(patch).eq('id', id).select('id'));
      }
      if (error) {
        console.warn('[StudentSync] Öğrenci güncellenemedi:', error);
        return { success: false, error };
      }
      if (!data || data.length === 0) {
        return {
          success: false,
          error: { code: '42501', message: 'Öğrenci kaydı güncellenemedi (kayıt bulunamadı veya bu öğrenci için yetkiniz yok).' },
        };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e };
    }
  }

  public async deleteStudentsFromCloud(studentIds: string[]): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await deleteRowsVerified('students', studentIds);
      if (error) {
        console.warn('[StudentsSync] Error deleting students from cloud:', error);
        return { success: false, error };
      }
      return { success: true };
    } catch (e) {
      console.warn('[StudentsSync] Exception deleting students from cloud:', e);
      return { success: false, error: e };
    }
  }

  // --- CLASSES ---
  // Aynı sınıf (adın normalize hâli: "8/A" = "8-A" = "8. Sınıf - A") aynı eğitim yılında zaten var mı?
  public findDuplicateClass(name: string, academicYear?: string, excludeId?: string): ClassGroup | undefined {
    const key = normalizeClassKey(name);
    if (!key) return undefined;
    const year = normalizeAcademicYear(academicYear) || (academicYear || '').trim();
    // Aşama 18: aynı adlı sınıf yalnızca aynı kurumda çakışır
    const scope = excludeId ? this.classes.find((c) => c.id === excludeId)?.kurumId || null : this.getMyKurumId();
    return this.classes.find((c) => {
      if (!c || c.id === excludeId || this.deletedClassIds.has(c.id)) return false;
      if ((c.kurumId || null) !== scope) return false;
      const cYear = normalizeAcademicYear(c.academicYear) || (c.academicYear || '').trim();
      return normalizeClassKey(c.name) === key && cYear === year;
    });
  }

  public async addClass(
    classData: Omit<ClassGroup, 'id'>,
    forcedTeacherId?: string
  ): Promise<ClassGroup & { autoAssignedCount?: number }> {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);

    const academicYear =
      normalizeAcademicYear(classData.academicYear) || (classData.academicYear || '').trim() || currentAcademicYear();
    const duplicate = this.findDuplicateClass(classData.name, academicYear);
    if (duplicate) {
      throw new Error(duplicateClassMessage(duplicate, academicYear));
    }

    const newClass: ClassGroup = {
      ...classData,
      academicYear,
      id: newId('class'),
      createdTeacherId: currentTeacherId,
      kurumId: this.getMyKurumId(),
    };

    // Rollback için önceki durumların yedeğini al
    const prevClasses = [...this.classes];
    const prevStudents = [...this.students];

    this.classes.push(newClass);

    // OTOMATİK SINIF AKTARIMI:
    // Yalnızca SINIFI OLMAYAN öğrenciler (ör. kendi kaydını yapıp sınıf adını yazmış olanlar) adı eşleşirse
    // bu sınıfa aktarılır. Başka bir sınıfa kayıtlı öğrenciye asla dokunulmaz.
    const UNASSIGNED_NAMES = ['', 'atanmadı', 'tanımsız', 'sınıfsız'];
    const existingClassIds = new Set(prevClasses.map((c) => c.id));
    const isWithoutClass = (s: Student) => {
      // Aşama 18: yalnızca aynı kurumun sınıfsız öğrencileri yeni sınıfa aktarılır
      if ((s.kurumId || null) !== (newClass.kurumId || null)) return false;
      if (!s.classId) return true;
      const cn = (s.className || '').trim().toLocaleLowerCase('tr-TR');
      return UNASSIGNED_NAMES.includes(cn) && !existingClassIds.has(s.classId);
    };
    const targetNorm = normalizeClassKey(newClass.name);
    let autoAssignedCount = 0;

    this.students = this.students.map((s) => {
      if (!isWithoutClass(s)) return s;
      const sNorm = normalizeClassKey(s.className);
      const isNormMatch = targetNorm.length > 0 && sNorm.length > 0 && sNorm === targetNorm;
      const isGradeBranchMatch =
        !!newClass.gradeLevel &&
        !!newClass.branch &&
        s.gradeLevel === newClass.gradeLevel &&
        s.branch === newClass.branch;

      if (isNormMatch || isGradeBranchMatch) {
        autoAssignedCount++;
        return {
          ...s,
          classId: newClass.id,
          className: newClass.name,
          schoolLevel: newClass.schoolLevel || s.schoolLevel,
          gradeLevel: newClass.gradeLevel || s.gradeLevel,
          branch: newClass.branch || s.branch,
        };
      }
      return s;
    });

    if (autoAssignedCount > 0) {
      saveData(STORAGE_KEYS.STUDENTS, this.students);
    }

    saveData(STORAGE_KEYS.CLASSES, this.classes);

    // Bulut yazmasını AWAIT et ve sonucunu doğrula:
    const cloudRes = await this.syncClassToCloud(newClass);

    if (!cloudRes.success) {
      // ROLLBACK: Buluta yazılamadıysa yerel state ve depolamayı tamamen eski haline döndür
      this.classes = prevClasses;
      this.students = prevStudents;
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      this.notify();

      const errMsg =
        cloudRes.error?.message ||
        (cloudRes.error?.code === '42501'
          ? 'Sınıf oluşturma yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Sınıf bulut veritabanına kaydedilemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[addClass] Sınıf buluta kaydedilemedi: ${errMsg}`);
    }

    // Aşama 181: sınıfsız öğrencilerin yeni sınıfa aktarımı sınıf bulutta açıldıktan SONRA yazılır ve beklenir
    // (eskiden sınıftan önce, sonucu beklenmeden gidiyordu; hata olursa öğrenci yalnız bu cihazda sınıflı görünüyordu)
    if (autoAssignedCount > 0) {
      const movedIds = this.students.filter((s) => s.classId === newClass.id).map((s) => s.id);
      const moveRes = await this.setStudentsClassInCloud(movedIds, newClass.id, newClass.name);
      if (!moveRes.success) {
        const failed = new Set(movedIds.filter((id) => !moveRes.writtenIds.has(id)));
        const prevById = new Map(prevStudents.map((s) => [s.id, s] as const));
        this.students = this.students.map((s) => (failed.has(s.id) ? prevById.get(s.id) || s : s));
        saveData(STORAGE_KEYS.STUDENTS, this.students);
        autoAssignedCount = movedIds.length - failed.size;
        this.showFloatingErrorToast(
          `Sınıf oluşturuldu, ancak ${failed.size} öğrenci sınıfa aktarılamadı: ${moveRes.error?.message || 'bağlantı sorunu'}`
        );
      }
    }

    this.notify();
    return { ...newClass, autoAssignedCount };
  }

  // Öğrencileri tek tek veya toplu olarak belirli bir sınıfa aktarma
  public async assignStudentsToClass(studentIds: string[], classId: string): Promise<number> {
    const cls = this.classes.find((c) => c.id === classId);
    if (!cls || !studentIds || studentIds.length === 0) return 0;

    // Rollback için önceki durumun yedeğini al
    const prevStudents = JSON.parse(JSON.stringify(this.students));

    let count = 0;
    this.students = this.students.map((s) => {
      if (studentIds.includes(s.id)) {
        count++;
        return {
          ...s,
          classId: cls.id,
          className: cls.name,
          schoolLevel: cls.schoolLevel || s.schoolLevel,
          gradeLevel: cls.gradeLevel || s.gradeLevel,
          branch: cls.branch || s.branch,
        };
      }
      return s;
    });

    if (count > 0) {
      saveData(STORAGE_KEYS.STUDENTS, this.students);

      // Aşama 181: yalnız sınıf bilgisi, toplu ve paralel yazılır; sonucu doğrulanır
      const studentRes = await this.setStudentsClassInCloud(studentIds, cls.id, cls.name);

      if (!studentRes.success) {
        // ROLLBACK: Öğrenciler buluta yazılamadıysa yerel state'i geri al (yarım yazıldıysa ekran veritabanından yenilenir)
        this.students = prevStudents;
        saveData(STORAGE_KEYS.STUDENTS, this.students);
        this.notify();
        this.resyncStudentsAfterPartialWrite(studentRes.writtenIds);

        const errMsg =
          studentRes.error?.message ||
          (studentRes.error?.code === '42501'
            ? 'Öğrencileri sınıfa aktarma yetkiniz bulunmamaktadır (RLS kuralı).'
            : 'Öğrenci sınıf aktarımı bulut veritabanına kaydedilemedi.');

        this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
        throw new Error(`[assignStudentsToClass] Buluta aktarım başarısız: ${errMsg}`);
      }

      this.notify();
    }
    return count;
  }

  // Öğrenciyi sınıftan çıkarma
  public async removeStudentFromClass(studentId: string): Promise<void> {
    const prevStudents = JSON.parse(JSON.stringify(this.students));
    const targetStudent = this.students.find((s) => s.id === studentId);
    if (!targetStudent) return;

    this.students = this.students.map((s) => {
      if (s.id === studentId) {
        return {
          ...s,
          classId: '',
          className: 'Atanmadı',
        };
      }
      return s;
    });
    saveData(STORAGE_KEYS.STUDENTS, this.students);

    // Aşama 181: yalnız sınıf bilgisi yazılır (öğrencinin diğer bilgileri bu cihazdaki kopyayla ezilmez)
    const cloudRes = await this.setStudentsClassInCloud([studentId], '', 'Atanmadı');

    if (!cloudRes.success) {
      // ROLLBACK
      this.students = prevStudents;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      this.notify();

      const errMsg =
        cloudRes.error?.message ||
        (cloudRes.error?.code === '42501'
          ? 'Öğrenciyi sınıftan çıkarma yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Öğrenci sınıftan çıkarma işlemi bulut veritabanına kaydedilemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[removeStudentFromClass] Sınıftan çıkarma başarısız: ${errMsg}`);
    }

    this.notify();
  }

  public async updateClass(id: string, updates: Partial<ClassGroup>): Promise<void> {
    const current = this.classes.find((c) => c.id === id);
    if (current && (updates.name !== undefined || updates.academicYear !== undefined)) {
      const nextYear = updates.academicYear !== undefined ? updates.academicYear : current.academicYear;
      const duplicate = this.findDuplicateClass(updates.name ?? current.name, nextYear, id);
      if (duplicate) throw new Error(duplicateClassMessage(duplicate, nextYear));
    }
    const prevClasses = this.classes;
    this.classes = this.classes.map((c) => (c.id === id ? { ...c, ...updates } : c));
    saveData(STORAGE_KEYS.CLASSES, this.classes);
    this.notify();
    const updated = this.classes.find((c) => c.id === id);
    if (updated) {
      await this.runCloudWrite(
        async () => {
          const res = await this.syncClassToCloud(updated);
          return { error: res.success ? null : res.error || { message: 'Sınıf kaydedilemedi' } };
        },
        () => {
          this.classes = prevClasses;
          saveData(STORAGE_KEYS.CLASSES, this.classes);
        },
        'Sınıf güncellemesi buluta kaydedilemedi'
      );
    }
  }

  public async deleteClass(id: string): Promise<void> {
    // Geri alma için önceki durumların kopyası
    const prevClassesForDelete = this.classes;
    const prevStudentsForDelete = this.students;
    const prevDeletedClassIds = new Set(this.deletedClassIds);

    this.deletedClassIds.add(id);
    saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
    try {
      localStorage.setItem(PERMANENT_KEYS.DELETED_CLASSES, JSON.stringify(Array.from(this.deletedClassIds)));
    } catch {}

    this.classes = this.classes.filter((c) => c.id !== id);
    // Unassign students from this class
    this.students = this.students.map((s) => (s.classId === id ? { ...s, classId: '', className: 'Atanmadı' } : s));
    saveData(STORAGE_KEYS.CLASSES, this.classes);
    saveData(STORAGE_KEYS.STUDENTS, this.students);

    // Clean legacy versioned keys
    [
      'edu_sys_classes_v6',
      'edu_sys_classes_v5',
      'edu_sys_classes_v4',
      'edu_sys_classes_v3',
      'edu_sys_classes_v2',
      'edu_sys_classes_v1',
      'edu_sys_classes',
      'edu_sys_classes_backup',
    ].forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });

    // Yerel state zaten güncellendi: arayüz bulut çağrılarını beklemeden hemen güncellensin
    this.notify();

    // Buluttan silmeyi bekle ve doğrula; başarısızsa her şeyi geri al
    const { error: classDeleteError } = await deleteRowsVerified('classes', [id]);
    if (classDeleteError) {
      this.classes = prevClassesForDelete;
      this.students = prevStudentsForDelete;
      this.deletedClassIds = prevDeletedClassIds;
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
      try {
        localStorage.setItem(PERMANENT_KEYS.DELETED_CLASSES, JSON.stringify(Array.from(this.deletedClassIds)));
      } catch {}
      this.notify();
      const reason = classDeleteError?.code === '42501' ? 'Bu işlem için yetkiniz yok' : classDeleteError?.message || 'Bağlantı sorunu';
      this.showFloatingErrorToast(`Hata: Sınıf buluttan silinemedi (${reason}). Değişiklikler geri alındı.`);
      throw new Error(`[deleteClass] Sınıf silinemedi: ${reason}`);
    }

    // Sınıftaki öğrencilerin sınıf bilgisini bulutta da temizle (başka cihazlarda eski sınıf görünmesin)
    // Aşama 181: toplu yazım; yazılamazsa kullanıcı uyarılır ve ekran veritabanından yenilenir
    const unassignedIds = prevStudentsForDelete.filter((p) => p.classId === id).map((p) => p.id);
    if (unassignedIds.length > 0) {
      const res = await this.setStudentsClassInCloud(unassignedIds, '', 'Atanmadı');
      if (!res.success) {
        this.showFloatingErrorToast(
          `Sınıf silindi, ancak bazı öğrencilerin sınıf bilgisi bulutta temizlenemedi: ${res.error?.message || 'bağlantı sorunu'}`
        );
        this.resyncStudentsAfterPartialWrite(res.writtenIds);
      }
    }

    // Sync tombstones so all devices immediately purge this class
    await this.syncTombstonesToCloud();
  }

  // --- CLOUD SYNCHRONIZATION FOR CLASSES ---
  public static classDescriptionColumnAvailable = true;

  public async syncClassToCloud(cls: ClassGroup): Promise<{ success: boolean; error?: any }> {
    try {
      // Aşama 175: düzey yalnız 1–12 olarak okunur ("LGS 2026" artık 2026. sınıf olmaz). Bulunamazsa eskisi gibi 8
      // (veritabanında level zorunlu; buluttan gelen sınıfta düzey zaten gradeLevel'da durur).
      // student_count artık yazılmaz: cihazdaki (yetkiye göre eksik olabilen) listeden sayılıyordu ve hiçbir yerde okunmuyor.
      const row: Record<string, any> = {
        id: cls.id,
        name: cls.name,
        branch: cls.branch || 'Genel',
        level: classLevelOf(cls) || 8,
        academic_year: cls.academicYear || currentAcademicYear(),
      };
      // classes.description sütunu ayrı bir SQL ile eklenir; henüz eklenmemişse sütunsuz kaydet.
      if (OkulKayitKatmani.classDescriptionColumnAvailable) row.description = cls.description || null;
      let { error } = await supabase.from('classes').upsert(row);
      if (error && row.description !== undefined && isMissingDescriptionColumn(error)) {
        OkulKayitKatmani.classDescriptionColumnAvailable = false;
        delete row.description;
        ({ error } = await supabase.from('classes').upsert(row));
      }

      if (error) {
        console.warn('Error syncing class to cloud:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (e) {
      console.warn('Exception syncing class to cloud:', e);
      return { success: false, error: e };
    }
  }

  // --- STUDENTS ---
  // =========================================================================
  // ÖĞRENCİ KAYDI + GİRİŞ HESABI (her zaman birlikte)
  // Öğrenci satırı eklenir, ardından sunucu fonksiyonu giriş hesabını açar.
  // Hesap açılamayan öğrencinin satırı geri silinir: "hesabı olmayan öğrenci" oluşmaz.
  // =========================================================================
  /** Aşama 76: sınıfa bağlı olmayan öğrencinin sınıf kimliği ve görünen adı */
  public static readonly NO_CLASS_ID = 'class-default';
  public static readonly NO_CLASS_NAME = 'Sınıfsız';

  public async createStudentsWithAccounts(items: StudentAccountInput[]): Promise<StudentAccountResult> {
    const session = this.getAuthSession();
    if (session?.role !== 'teacher') {
      throw new Error('Öğrenci eklemek için öğretmen veya yönetici olarak giriş yapmalısınız.');
    }
    const currentTeacherId = session.user.id;
    const created: StudentCredential[] = [];
    const failed: StudentAccountFailure[] = [];
    const prepared: Array<{ student: Student; password: string }> = [];
    const seenNumbers = new Set<string>();
    // Aşama 171: cinsiyet verilmediyse addan tahmin (ad listesi yalnız burada, gerektiğinde iner)
    let tahmin: ((n: string) => 'K' | 'E' | undefined) | null = null;
    if (items.some((it) => !it.gender)) {
      try {
        tahmin = (await import('../../lib/cinsiyetTahmin')).cinsiyetTahmin;
      } catch {
        tahmin = null; // liste inemezse cinsiyet boş kalır
      }
    }

    for (const item of items) {
      const name = (item.name || '').trim().replace(/\s+/g, ' ');
      const studentNumber = (item.studentNumber || '').trim();
      const fail = (error: string) => failed.push({ name: name || '(isimsiz)', studentNumber, error });

      if (name.length < 2) { fail('Ad soyad eksik.'); continue; }
      if (!studentNumber) { fail('Öğrenci numarası zorunludur (öğrenci bu numarayla giriş yapar).'); continue; }
      if (!this.isValidLoginIdentifier(studentNumber)) { fail('Öğrenci numarası yalnızca rakam/harf içermelidir (boşluksuz, en fazla 20 karakter).'); continue; }
      const numKey = studentNumber.toLowerCase();
      if (seenNumbers.has(numKey)) { fail('Bu numara listede birden fazla kez geçiyor.'); continue; }
      const clash = this.students.find((s) => (s.studentNumber || '').trim().toLowerCase() === numKey);
      if (clash) { fail(`Bu numara "${clash.name}" adlı öğrenciye ait.`); continue; }
      const password = (item.password || '').trim() || this.generatePassword();
      if (password.length < HesapKatmani.MIN_PASSWORD_LENGTH) { fail(`Şifre en az ${HesapKatmani.MIN_PASSWORD_LENGTH} karakter olmalıdır.`); continue; }
      // Aşama 145: basit şifre (123456, yaygın şifre, kendi numarası/adı) bu satırda reddedilir, diğer satırlar yüklenir
      const kuralHata = sifreSorunu(password, { identifier: studentNumber, name });
      if (kuralHata) { fail(kuralHata); continue; }
      // Aşama 76: sınıfsız öğrenci (class-default) — kurumuna kayıtlı, henüz bir sınıfa bağlı değil
      const noClass = item.classId === OkulKayitKatmani.NO_CLASS_ID;
      const cls = noClass ? null : this.classes.find((c) => c.id === item.classId);
      if (!cls && !noClass) { fail('Sınıf seçilmedi veya sınıf bulunamadı.'); continue; }
      seenNumbers.add(numKey);

      const student: Student = {
        id: `std-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        username: studentNumber,
        email: cleanStudentEmail(item.email),
        classId: cls ? cls.id : OkulKayitKatmani.NO_CLASS_ID,
        className: cls ? cls.name : OkulKayitKatmani.NO_CLASS_NAME,
        schoolLevel: item.schoolLevel || cls?.schoolLevel,
        gradeLevel: item.gradeLevel || cls?.gradeLevel,
        branch: item.branch || cls?.branch,
        studentNumber,
        phone: (item.phone || '').trim(),
        avatar: item.avatar || undefined,
        gender: normGender(item.gender) ?? (tahmin ? tahmin(name) : undefined),
        birthDate: gecerliDogumTarihi(item.birthDate) || undefined, // Aşama 324
        createdAt: new Date().toISOString(),
        status: 'active',
        createdTeacherId: currentTeacherId,
        mustChangePassword: true,
        // Aşama 76: kurum yöneticisinin eklediği öğrenci kurumunundur (veritabanı da aynısını yazar)
        kurumId: this.getMyKurumId(),
      };
      prepared.push({ student, password });
    }

    // 1) Satırları ekle (10'arlı gruplar)
    const inserted: Array<{ student: Student; password: string }> = [];
    for (let i = 0; i < prepared.length; i += 10) {
      const chunk = prepared.slice(i, i + 10);
      const insertRows = () =>
        supabase.from('students').insert(
          chunk.map(({ student }) => ({
            id: student.id,
            ...this.studentToRow(student, true),
            registered_at: student.createdAt,
          }))
        );
      let { error } = await insertRows();
      // Aşama 171 / 324: kurulmamış SQL'in sütunu (cinsiyet, doğum tarihi) atlanıp yeniden denenir
      for (let k = 0; k < 2 && error; k++) {
        if (!BulutDepoKatmani.genderMissing.students && isMissingGenderColumn(error)) BulutDepoKatmani.genderMissing.students = true;
        else if (!BulutDepoKatmani.birthMissing && isMissingBirthColumn(error)) BulutDepoKatmani.birthMissing = true;
        else break;
        ({ error } = await insertRows());
      }
      if (error) {
        const reason =
          error.code === '42501'
            ? 'Bu sınıfa öğrenci ekleme yetkiniz yok.'
            : error.code === '23505'
            ? 'Aynı kimlikle kayıt zaten var.'
            : error.message;
        chunk.forEach(({ student }) => failed.push({ name: student.name, studentNumber: student.studentNumber || '', error: `Kayıt eklenemedi: ${reason}` }));
      } else {
        inserted.push(...chunk);
        chunk.forEach(({ student }) => this.contactKnown.add(student.id)); // Aşama 85
      }
    }

    // 2) Giriş hesaplarını aç (50'şerli gruplar)
    for (let i = 0; i < inserted.length; i += 50) {
      const chunk = inserted.slice(i, i + 50);
      let results: Array<{ ok: boolean; id: string; error?: string; auth_user_id?: string | null }> = [];
      try {
        const res = await invokeCreateUserEdgeFunction({
          action: 'bulk_upsert',
          type: 'student',
          items: chunk.map(({ student, password }) => ({
            id: student.id,
            identifier: student.studentNumber,
            name: student.name,
            password,
          })),
        });
        results = res?.results || [];
      } catch (err: any) {
        results = chunk.map(({ student }) => ({ ok: false, id: student.id, error: err?.message || 'Sunucu hatası' }));
      }

      const rollbackIds: string[] = [];
      for (const entry of chunk) {
        const r = results.find((x) => x.id === entry.student.id);
        if (r?.ok) {
          entry.student.auth_user_id = r.auth_user_id || undefined;
          created.push({ student: entry.student, password: entry.password });
        } else {
          rollbackIds.push(entry.student.id);
          failed.push({
            name: entry.student.name,
            studentNumber: entry.student.studentNumber || '',
            error: `Giriş hesabı açılamadı: ${r?.error || 'bilinmeyen hata'}`,
          });
        }
      }
      if (rollbackIds.length > 0) {
        await deleteRowsVerified('students', rollbackIds).catch(() => {});
      }
    }

    if (created.length > 0) {
      // Anlık güncelleme aynı öğrenciyi daha önce eklemiş olabilir: aynı kimlik iki kez listelenmez
      const createdIds = new Set(created.map((c) => c.student.id));
      this.students = [...created.map((c) => c.student), ...this.students.filter((s) => !createdIds.has(s.id))];
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      this.notify();
    }
    return { created, failed };
  }

  // Tek öğrenci: kayıt + giriş hesabı. Başarısızsa hata fırlatır (hiçbir şey kalmaz).
  public async createStudentAccount(item: StudentAccountInput): Promise<StudentCredential> {
    const { created, failed } = await this.createStudentsWithAccounts([item]);
    if (created.length === 1) return created[0];
    throw new Error(failed[0]?.error || 'Öğrenci eklenemedi.');
  }

  // Eski çağrılar için uyumluluk (şifre verilmezse rastgele şifre üretilir)
  public async registerStudent(
    studentData: Omit<Student, 'id' | 'createdAt' | 'status'>,
    _forcedTeacherId?: string
  ): Promise<Student> {
    const { student } = await this.createStudentAccount({
      name: studentData.name,
      studentNumber: studentData.studentNumber || '',
      classId: studentData.classId,
      email: studentData.email,
      phone: studentData.phone,
      avatar: studentData.avatar,
      gender: studentData.gender,
      schoolLevel: studentData.schoolLevel,
      gradeLevel: studentData.gradeLevel,
      branch: studentData.branch,
      password: studentData.password,
    });
    return student;
  }

  public async registerStudentsBulk(
    studentsData: Array<Omit<Student, 'id' | 'createdAt' | 'status'> & { autoCreateClass?: boolean }>,
    _forcedTeacherId?: string
  ): Promise<Student[]> {
    const { created, failed } = await this.createStudentsWithAccounts(
      studentsData.map((d) => ({
        name: d.name,
        studentNumber: d.studentNumber || '',
        classId: d.classId,
        email: d.email,
        phone: d.phone,
        avatar: d.avatar,
        gender: d.gender,
        password: d.password,
      }))
    );
    if (created.length === 0 && failed.length > 0) {
      throw new Error(failed[0].error);
    }
    return created.map((c) => c.student);
  }

  // Öğretmen/yönetici: öğrencinin giriş şifresini belirler (hesap yoksa açar)
  public async setStudentPassword(studentId: string, password?: string): Promise<StudentCredential> {
    const student = this.students.find((s) => s.id === studentId);
    if (!student) throw new Error('Öğrenci bulunamadı.');
    const pw = (password || '').trim() || this.generatePassword();
    await this.syncLoginAccount('student', student, pw);
    const fresh = this.students.find((s) => s.id === studentId) || student;
    return { student: fresh, password: pw };
  }

  // Öğrenci bilgilerini günceller. Yalnızca değişen alanlar yazılır.
  // Öğrenci numarası değişirse giriş adı da (sunucuda) güncellenir; olmazsa değişiklik geri alınır.
  public async updateStudent(
    id: string,
    updates: Partial<Student>,
    options: { newPassword?: string; mustChangePassword?: boolean } = {}
  ): Promise<{ password?: string }> {
    const current = this.students.find((s) => s.id === id);
    if (!current) throw new Error('Öğrenci bulunamadı.');

    const next: Student = { ...current, ...updates };
    if (updates.email !== undefined) next.email = cleanStudentEmail(updates.email);
    // Aşama 324: doğum tarihi 'YYYY-MM-DD' (boş = sil); geçersizse hiçbir şey yazılmaz
    if ('birthDate' in updates) {
      if (updates.birthDate && !gecerliDogumTarihi(updates.birthDate)) throw new Error('Doğum tarihi geçersiz (gelecek ya da yanlış bir tarih).');
      next.birthDate = updates.birthDate || undefined;
    }
    if (updates.classId) {
      const cls = this.classes.find((c) => c.id === updates.classId);
      if (cls) next.className = cls.name;
      else if (updates.classId === OkulKayitKatmani.NO_CLASS_ID) next.className = OkulKayitKatmani.NO_CLASS_NAME; // Aşama 76
    }
    if (
      updates.studentNumber !== undefined &&
      (updates.studentNumber || '').trim() !== (current.studentNumber || '').trim()
    ) {
      next.studentNumber = (updates.studentNumber || '').trim();
      if (!next.studentNumber) throw new Error('Öğrenci numarası boş bırakılamaz (öğrenci bu numarayla giriş yapar).');
      if (!this.isValidLoginIdentifier(next.studentNumber)) {
        throw new Error('Öğrenci numarası yalnızca rakam/harf içermelidir (boşluksuz, en fazla 20 karakter).');
      }
      const clash = this.students.find(
        (s) => s.id !== id && (s.studentNumber || '').trim().toLowerCase() === next.studentNumber!.toLowerCase()
      );
      if (clash) throw new Error(`"${next.studentNumber}" numarası "${clash.name}" adlı öğrenciye ait.`);
      next.username = next.studentNumber;
    }

    // Yalnızca değişen sütunlar
    const before = this.studentToRow(current);
    // Aşama 85: formda iletişim bilgisi açıkça girildiyse yazılır
    if (updates.email !== undefined || updates.phone !== undefined || updates.parents !== undefined) this.contactKnown.add(id);
    const after = this.studentToRow(next);
    const patch: Record<string, unknown> = {};
    (Object.keys(after) as Array<keyof typeof after>).forEach((k) => {
      // Aşama 69: veliler bir dizi olduğu için içerik olarak karşılaştırılır
      if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) patch[k] = after[k];
    });
    // Aşama 324: iletişim bilgisi görülemeyen öğrencide de açıkça girilen doğum tarihi yazılır (diğer alanlar ezilmeden)
    if ('birthDate' in updates && !('birth_date' in after) && !BulutDepoKatmani.birthMissing && next.birthDate !== current.birthDate) {
      patch.birth_date = next.birthDate || '';
    }
    const numberChanged = 'student_number' in patch;

    const prevStudents = this.students;
    this.students = this.students.map((s) => (s.id === id ? next : s));
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    this.notify();

    const rollback = async (writeBack: boolean) => {
      this.students = prevStudents;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      this.notify();
      if (writeBack) {
        const undo: Record<string, unknown> = {};
        Object.keys(patch).forEach((k) => {
          undo[k] = (before as any)[k];
        });
        await this.patchStudentRow(id, undo).catch(() => {});
      }
    };

    const res = await this.patchStudentRow(id, patch);
    if (!res.success) {
      await rollback(false);
      const reason = res.error?.code === '42501' ? res.error?.message || 'Bu işlem için yetkiniz yok' : res.error?.message || 'Bağlantı sorunu';
      this.showFloatingErrorToast(`Hata: Öğrenci bilgileri kaydedilemedi (${reason}). Değişiklikler geri alındı.`);
      throw new Error(`Öğrenci bilgileri kaydedilemedi: ${reason}`);
    }

    const session = this.getAuthSession();
    const isStaff = session?.role === 'teacher';
    const newPassword = (options.newPassword || '').trim();
    if (isStaff && (newPassword || (numberChanged && current.auth_user_id))) {
      try {
        await this.syncLoginAccount('student', next, newPassword || undefined, options.mustChangePassword);
      } catch (err: any) {
        if (numberChanged) {
          await rollback(true);
          throw new Error(`Öğrenci numarası değiştirilemedi: ${err?.message || 'bilinmeyen hata'}. Değişiklikler geri alındı.`);
        }
        throw new Error(`Bilgiler kaydedildi ancak şifre belirlenemedi: ${err?.message || 'bilinmeyen hata'}`);
      }
    }

    if (session?.role === 'student' && session.user.id === id) {
      const fresh = this.students.find((s) => s.id === id);
      if (fresh) this.setAuthSession({ ...session, user: fresh });
    }
    this.notify();
    return newPassword ? { password: newPassword } : {};
  }

  public getPendingApplicationCount(): number {
    return this.pendingApplicationCount;
  }

  // Aşama 108: öğrenci kendi kaydını yapamaz (giriş ekranındaki kayıt formu ve başvuru gönderme kaldırıldı);
  // daha önce gelmiş bekleyen başvurular aşağıdaki işlevlerle sonuçlandırılır.

  // Yönetici: başvuruları listeler (en yeni en üstte)
  /** Aşama 99b: başvuruları kim görür — genel yönetici (kurumsuz başvurular), kurum idaresi (kendi kurumununkiler) */
  public canReviewApplications(): boolean {
    if (this.getAuthSession()?.role !== 'teacher') return false;
    return this.isHeadAdmin() || (this.isKurumAdmin() && this.canManageStudents());
  }

  public async fetchStudentApplications(status: 'pending' | 'all' = 'pending'): Promise<StudentApplication[]> {
    if (!this.canReviewApplications()) return [];
    let query = supabase.from('student_applications').select('*').order('created_at', { ascending: false }).limit(200);
    if (status === 'pending') query = query.eq('status', 'pending');
    const { data, error } = await query;
    if (error) throw new Error(`Başvurular okunamadı: ${error.message}`);
    const list: StudentApplication[] = (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      studentNumber: r.student_number,
      classId: r.class_id || undefined,
      requestedClass: r.requested_class || undefined,
      email: r.email || undefined,
      phone: r.phone || undefined,
      avatar: r.avatar || undefined,
      status: r.status,
      rejectReason: r.reject_reason || undefined,
      studentId: r.student_id || undefined,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at || undefined,
    }));
    if (status === 'pending') {
      const changed = this.pendingApplicationCount !== list.length;
      this.pendingApplicationCount = list.length;
      if (changed) this.notify();
    }
    return list;
  }

  // Aşama 99b: yalnızca sayı okunur (satırlar indirilmez); her eşitlemede hafif
  public async refreshPendingApplicationCount(): Promise<void> {
    if (!this.canReviewApplications()) return;
    try {
      const { count, error } = await supabase.from('student_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (error) return;
      const n = count || 0;
      if (n !== this.pendingApplicationCount) {
        this.pendingApplicationCount = n;
        this.notify();
      }
    } catch {
      // tablo henüz kurulmadıysa sessiz geç
    }
  }

  // Yönetici: başvuruyu onaylar -> öğrenci kaydı oluşur, hesap açılır
  public async approveStudentApplication(
    applicationId: string,
    options: { classId?: string; studentNumber?: string; name?: string } = {}
  ): Promise<Student> {
    const res = await invokeCreateUserEdgeFunction({
      action: 'approve_application',
      applicationId,
      classId: options.classId || undefined,
      studentNumber: options.studentNumber || undefined,
      name: options.name || undefined,
    });
    const r = res?.student || {};
    const cls = this.classes.find((c) => c.id === r.class_id);
    const student: Student = {
      id: r.id,
      name: r.name,
      username: r.student_number,
      studentNumber: r.student_number,
      classId: r.class_id,
      className: r.class_name,
      email: r.email || '',
      phone: r.phone || '',
      avatar: r.avatar || undefined,
      createdAt: new Date().toISOString(),
      status: 'active',
      auth_user_id: r.auth_user_id,
      schoolLevel: cls?.schoolLevel,
      gradeLevel: cls?.gradeLevel,
      branch: cls?.branch,
    };
    this.students = [student, ...this.students.filter((s) => s.id !== student.id)];
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    this.pendingApplicationCount = Math.max(0, this.pendingApplicationCount - 1);
    this.notify();
    return student;
  }

  // Yönetici: başvuruyu reddeder -> kilitli giriş hesabı silinir
  public async rejectStudentApplication(applicationId: string, reason?: string): Promise<void> {
    await invokeCreateUserEdgeFunction({ action: 'reject_application', applicationId, reason: reason || undefined });
    this.pendingApplicationCount = Math.max(0, this.pendingApplicationCount - 1);
    this.notify();
  }

  public async deleteStudent(id: string): Promise<void> {
    await this.deleteStudents([id]);
  }

  public async deleteStudents(requestedIds: string[]): Promise<void> {
    if (!requestedIds || requestedIds.length === 0) return;

    // 1) Önce giriş hesaplarını sil (sunucu). Hesabı silinemeyen öğrencinin kaydı da silinmez.
    const { okIds: ids, failed: accountFailures } = await deleteLoginAccounts('student', requestedIds);
    const failureMessage = accountFailures.length
      ? `${accountFailures.length} öğrenci silinemedi: ${accountFailures
          .map((f) => `${this.students.find((s) => s.id === f.id)?.name || f.id} (${f.error || 'hata'})`)
          .join(', ')}`
      : '';
    if (ids.length === 0) {
      this.showFloatingErrorToast(`Hata: ${failureMessage}`);
      throw new Error(failureMessage || 'Öğrenci silinemedi.');
    }
    const idSet = new Set(ids);

    // Rollback için önceki durumların tam kopyasını al
    const prevStudents = JSON.parse(JSON.stringify(this.students));
    const prevSubmissions = JSON.parse(JSON.stringify(this.submissions));
    const prevGrades = JSON.parse(JSON.stringify(this.grades));
    const prevMessages = JSON.parse(JSON.stringify(this.messages));
    const prevEtuts = JSON.parse(JSON.stringify(this.etuts));
    const prevAttendance = JSON.parse(JSON.stringify(this.attendance));
    const prevDeletedStudentIds = new Set(this.deletedStudentIds);

    ids.forEach((id) => this.deletedStudentIds.add(id));
    saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));

    this.students = this.students.filter((s) => !idSet.has(s.id));
    this.submissions = this.submissions.filter((sub) => !idSet.has(sub.studentId));
    this.grades = this.grades.filter((g) => !idSet.has(g.studentId));
    this.messages = this.messages.filter((m) => !idSet.has(m.studentId));
    // Clean up students from etuts if specific studentIds list
    this.etuts = this.etuts.map((e) => {
      if (Array.isArray(e.assignedStudentIds)) {
        return {
          ...e,
          assignedStudentIds: e.assignedStudentIds.filter((sid) => !idSet.has(sid)),
        };
      }
      return e;
    });
    // Clean up students from attendance records
    this.attendance = this.attendance.map((att) => ({
      ...att,
      records: att.records.filter((r) => !idSet.has(r.studentId)),
    }));

    saveData(STORAGE_KEYS.STUDENTS, this.students);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);

    try {
      localStorage.setItem(PERMANENT_KEYS.DELETED_STUDENTS, JSON.stringify(Array.from(this.deletedStudentIds)));
    } catch {}

    // Clean legacy versioned keys so deleted students never resurrect
    [
      'edu_sys_students_v6',
      'edu_sys_students_v5',
      'edu_sys_students_v4',
      'edu_sys_students_v3',
      'edu_sys_students_v2',
      'edu_sys_students_v1',
      'edu_sys_students',
      'edu_sys_students_backup',
    ].forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });

    // Yerel state güncellendi: arayüz bulut çağrısını beklemeden hemen güncellensin
    this.notify();

    // Buluttan silme işlemini AWAIT et ve doğrula
    const deleteRes = await this.deleteStudentsFromCloud(ids);
    if (!deleteRes.success) {
      // ROLLBACK: Buluttan silinemezse yerel verileri geri yükle
      this.students = prevStudents;
      this.submissions = prevSubmissions;
      this.grades = prevGrades;
      this.messages = prevMessages;
      this.etuts = prevEtuts;
      this.attendance = prevAttendance;
      this.deletedStudentIds = prevDeletedStudentIds;

      saveData(STORAGE_KEYS.STUDENTS, this.students);
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      saveData(STORAGE_KEYS.GRADES, this.grades);
      saveData(STORAGE_KEYS.MESSAGES, this.messages);
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));

      try {
        localStorage.setItem(PERMANENT_KEYS.DELETED_STUDENTS, JSON.stringify(Array.from(this.deletedStudentIds)));
      } catch {}
      this.notify();

      const errMsg =
        deleteRes.error?.message ||
        (deleteRes.error?.code === '42501'
          ? 'Öğrenci silme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Öğrenci bulut veritabanından silinemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[deleteStudents] Öğrenci silme işlemi başarısız: ${errMsg}`);
    }

    // Persist tombstones to cloud so other devices immediately purge these IDs
    await this.syncTombstonesToCloud();
    this.notify();

    if (failureMessage) {
      this.showFloatingErrorToast(`Hata: ${failureMessage}`);
      throw new Error(failureMessage);
    }
  }

  // Aynı kimlikli kopyaları ve sahte ("Sınıf", "Atanmadı") sınıfları ayıklar.
  // Aynı sınıf adı (normalize) + AYNI eğitim yılı tekrar ediyorsa yalnızca ÖĞRENCİSİ OLMAYAN kopya gizlenir;
  // öğrencisi olan bir sınıf asla gizlenmez, farklı yılların sınıfları ayrı tutulur.
  public deduplicateClasses(classesList: ClassGroup[]): ClassGroup[] {
    const seenId = new Set<string>();
    const candidates: Array<{ cls: ClassGroup; key: string; hasStudents: boolean }> = [];
    const classIdsWithStudents = new Set(this.students.map((s) => s.classId).filter(Boolean));

    for (const c of classesList) {
      if (!c || !c.id || this.deletedClassIds.has(c.id) || seenId.has(c.id)) continue;
      const plain = (c.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
      if (!plain || plain === 'sinif' || plain === 'sınıf' || plain === 'atanmadi' || plain === 'atanmadı' || plain === 'tanimsiz' || plain === 'tanımsız') continue;
      seenId.add(c.id);
      const year = normalizeAcademicYear(c.academicYear) || (c.academicYear || '').trim();
      candidates.push({ cls: c, key: `${c.kurumId || ''}|${normalizeClassKey(c.name)}|${year}`, hasStudents: classIdsWithStudents.has(c.id) });
    }

    const keptForKey = new Set<string>();
    // Öğrencisi olanlar her zaman görünür
    candidates.forEach((x) => {
      if (x.hasStudents) keptForKey.add(x.key);
    });
    const result: ClassGroup[] = [];
    for (const x of candidates) {
      if (x.hasStudents) {
        result.push(x.cls);
      } else if (!keptForKey.has(x.key)) {
        keptForKey.add(x.key);
        result.push(x.cls);
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  }

  // --- GETTERS (SCOPED BY AUTH & ROLE PERMISSION) ---
  public getAllStudents(): Student[] {
    return [...this.students].filter((s) => !this.deletedStudentIds.has(s.id));
  }

  public getAllClasses(): ClassGroup[] {
    return this.deduplicateClasses(this.classes);
  }

  public getStudents(forTeacherId?: string): Student[] {
    return this.memoView('Students:' + (forTeacherId || ''), [this.students, this.teachers, this.classes, this.students], this.viewKey(forTeacherId || ''), () => this.computeStudents(forTeacherId));
  }
  protected computeStudents(forTeacherId?: string): Student[] {
    const session = this.getAuthSession();

    // If viewing in teacher context
    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      // Kurum Yöneticisi tüm öğrencileri görebilir
      if (this.isTeacherAdmin(teacher) || this.isTeacherAdmin(session?.user as Teacher)) {
        return this.students.filter((s) => !this.deletedStudentIds.has(s.id));
      }

      // Aşama 82: Rehberlik / Ölçme / Zümre Başkanı / Etüt Öğretmeni — veritabanının açtığı kayıtlar; veli bilgisi role göre
      // Aşama 113: oturum sahibinin kendi kimliğiyle istenen liste de aynı kuralla (mesaj, not, yoklama, teslim süzgeçleri
      // getStudents(kendi id) çağırıyordu; Rehberlik'te sınıf yetkisi yazılı olmadığı için bu kayıtlar ekranda gizleniyordu)
      const self = !forTeacherId || forTeacherId === session?.user.id;
      if (self && this.roleTrustsDb()) {
        const hideParents = !this.canSeeParentContacts();
        return this.students
          .filter((s) => !this.deletedStudentIds.has(s.id))
          .map((s) => (hideParents && s.parents && s.parents.length ? { ...s, parents: [] } : s));
      }

      // Normal öğretmen: İzinli sınıflardaki öğrencileri VEYA bireysel olarak yetkilendirildiği öğrencileri görebilir
      const permittedClasses = this.getClasses(teacherId);
      const permittedClassIds = new Set(permittedClasses.map((c) => c.id));
      const permittedClassNames = new Set(
        permittedClasses.map((c) => (c.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, ''))
      );

      const hideParentsForRole = !forTeacherId && !this.canSeeParentContacts();
      return this.students.filter((s) => {
        if (this.deletedStudentIds.has(s.id)) return false;
        // Aşama 180: bireysel ve sınıf yetkisi yalnız veritabanından (teacher_student_access / teacher_class_access)
        if (this.myTeacherAccess.studentIds.has(s.id)) return true;
        if (s.classId && permittedClassIds.has(s.classId)) return true;
        if (s.className) {
          const normS = s.className.trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
          if (permittedClassNames.has(normS)) return true;
        }
        return false;
      }).map((s) => (hideParentsForRole && s.parents && s.parents.length ? { ...s, parents: [] } : s));
    }

    // Öğrenci oturumu: öğrenci YALNIZCA kendi bilgilerini görebilir, diğer öğrencileri göremez
    if (session?.role === 'student') {
      const studentId = session.user.id;
      return this.students.filter((s) => s.id === studentId && !this.deletedStudentIds.has(s.id));
    }

    return this.students.filter((s) => !this.deletedStudentIds.has(s.id));
  }

  public getClasses(forTeacherId?: string): ClassGroup[] {
    return this.memoView('Classes:' + (forTeacherId || ''), [this.classes, this.teachers, this.classes, this.students], this.viewKey(forTeacherId || ''), () => this.computeClasses(forTeacherId));
  }
  protected computeClasses(forTeacherId?: string): ClassGroup[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      // Yönetici tüm sınıfları görebilir
      if (this.isTeacherAdmin(teacher) || this.isTeacherAdmin(session?.user as Teacher)) {
        return this.deduplicateClasses(this.classes);
      }

      // Aşama 82: Rehberlik / Ölçme / Zümre Başkanı — veritabanının açtığı sınıflar; Etüt Öğretmeni sınıf görmez
      // Aşama 113: oturum sahibinin kendi kimliğiyle istenen liste de aynı kuralla
      if ((!forTeacherId || forTeacherId === session?.user.id) && this.roleTrustsDb()) {
        if (this.roleEtutOnly()) return [];
        return this.deduplicateClasses(this.classes.filter((c) => !this.deletedClassIds.has(c.id)));
      }

      // Normal öğretmen: SADECE yöneticinin veritabanında yetkilendirdiği sınıfları görür (teacher_class_access,
      // kademeden gelenler dahil). Aşama 180: yalnız bu cihazda tutulan eski yetki listeleri artık okunmaz.
      const filtered = this.classes.filter((c) => !this.deletedClassIds.has(c.id) && this.myTeacherAccess.classIds.has(c.id));

      return this.deduplicateClasses(filtered);
    }

    if (session?.role === 'student') {
      const student = session.user as Student;
      const filtered = this.classes.filter((c) => c.id === student.classId || c.name === student.className);
      return this.deduplicateClasses(filtered);
    }

    return this.deduplicateClasses(this.classes);
  }

  // Hızlı Sınıf Değiştirme / Aktarma (Öğrenci satırındaki açılır pencere için)
  public async updateStudentClass(studentId: string, newClassId: string): Promise<Student> {
    const studentIdx = this.students.findIndex((s) => s.id === studentId);
    if (studentIdx === -1) {
      throw new Error('Öğrenci kaydı bulunamadı.');
    }

    const prevStudents = JSON.parse(JSON.stringify(this.students));
    const currentStudent = this.students[studentIdx];
    // Aşama 161: açılan sınıftaki genel yönetici öğrencisi — kurum yalnız sınıfını, sunucu işleviyle değiştirir
    if (!this.canManageStudent(currentStudent)) return this.moveGrantedStudent(currentStudent, newClassId);
    let newClassName = 'Atanmadı';
    let newGradeLevel: string | undefined = undefined;
    let newSchoolLevel: 'İlkokul' | 'Ortaokul' | 'Lise' | undefined = currentStudent.schoolLevel;
    let newBranch: string | undefined = undefined;

    if (newClassId && newClassId !== 'unassigned' && newClassId !== 'class-default') {
      const cls = this.classes.find((c) => c.id === newClassId || c.name === newClassId);
      if (cls) {
        newClassName = cls.name;
        newGradeLevel = cls.gradeLevel;
        newSchoolLevel = cls.schoolLevel;
        newBranch = cls.branch;
      }
    } else {
      newClassId = 'class-default';
    }

    const updated: Student = {
      ...currentStudent,
      classId: newClassId,
      className: newClassName,
      gradeLevel: newGradeLevel || currentStudent.gradeLevel,
      schoolLevel: newSchoolLevel || currentStudent.schoolLevel,
      branch: newBranch || currentStudent.branch,
    };

    this.students[studentIdx] = updated;
    saveData(STORAGE_KEYS.STUDENTS, this.students);

    // Bulut yazmasını AWAIT et ve sonucunu kontrol et
    try {
      const res = await this.patchStudentRow(studentId, {
        class_id: newClassId,
        class_name: newClassName,
      });

      if (!res.success) {
        throw res.error || new Error('Öğrencinin sınıfı güncellenemedi.');
      }
    } catch (e: any) {
      // ROLLBACK: Buluta yazılamadıysa eski haline döndür
      this.students = prevStudents;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      this.notify();

      const errMsg =
        e?.message ||
        (e?.code === '42501'
          ? 'Öğrenci sınıfını güncelleme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Öğrencinin yeni sınıfı bulut veritabanına kaydedilemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[updateStudentClass] Sınıf güncelleme başarısız: ${errMsg}`);
    }

    this.notify();
    return updated;
  }

  /**
   * Aşama 161: genel yöneticinin kuruma açtığı sınıflar arasında taşıma (kurumlar.grant_move açıkken).
   * Yetkiyi sunucu (kurum_move_granted_student) denetler; ekran yalnız sonucu yazar. Tek istek, liste yeniden okunmaz.
   */
  protected async moveGrantedStudent(student: Student, newClassId: string): Promise<Student> {
    const granted = this.myKurum.grantedClassIds || [];
    if (!newClassId || !granted.includes(newClassId) || !granted.includes(student.classId || '')) {
      throw new Error('Bu öğrenci yalnız kurumunuza açılan sınıflar arasında taşınabilir.');
    }
    const { data, error } = await supabase.rpc('kurum_move_granted_student', { p_student_id: student.id, p_class_id: newClassId });
    if (error) {
      const raw = `${error.code || ''} ${error.message || ''}`;
      const msg = /kurum_move_granted_student|PGRST202|schema cache/i.test(raw)
        ? 'Sınıf değiştirme için 161 numaralı SQL dosyası henüz çalıştırılmamış.'
        : error.message || 'Öğrencinin sınıfı değiştirilemedi.';
      this.showFloatingErrorToast(`Hata: ${msg}`);
      throw new Error(`[updateStudentClass] ${msg}`);
    }
    const cls = this.classes.find((c) => c.id === newClassId);
    const d: any = data || {};
    const idx = this.students.findIndex((s) => s.id === student.id);
    const updated: Student = {
      ...(idx >= 0 ? this.students[idx] : student),
      classId: String(d.class_id || newClassId),
      className: String(d.class_name || cls?.name || ''),
      gradeLevel: cls?.gradeLevel || student.gradeLevel,
      schoolLevel: cls?.schoolLevel || student.schoolLevel,
      branch: cls?.branch || student.branch,
    };
    if (idx >= 0) {
      this.students[idx] = updated;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
    }
    this.notify();
    return updated;
  }

  // Mükerrer / Çift Kayıt Kontrolü (Aynı öğrencinin iki kez kayıt olmasını engelleme)
  public checkDuplicateStudent(
    name: string,
    studentNumber?: string,
    className?: string,
    excludeId?: string
  ): Student | null {
    // Aşama 154: Türkçe küçük harf ("YILMAZ" = "Yılmaz", "İSMAİL" = "İsmail")
    const cleanName = (name || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
    if (!cleanName) return null;
    const cleanNum = (studentNumber || '').trim();
    const cleanCls = (className || '').trim().toLocaleLowerCase('tr-TR');

    return (
      this.students.find((s) => {
        if (excludeId && s.id === excludeId) return false;
        if (this.deletedStudentIds.has(s.id)) return false;
        const sName = (s.name || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
        if (sName !== cleanName) return false;
        // Same name AND same student number
        if (cleanNum && s.studentNumber && s.studentNumber.trim() === cleanNum) return true;
        // Same name AND same class
        if (cleanCls && s.className && s.className.trim().toLocaleLowerCase('tr-TR') === cleanCls) return true;
        return false;
      }) || null
    );
  }
}
