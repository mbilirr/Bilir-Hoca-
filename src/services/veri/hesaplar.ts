// ============================================================================
// Aşama 359: HESAPLAR: kullanıcı yönetimi, öğretmen hesapları, giriş, şifre işlemleri, çıkış
// dataService.ts'ten KELİMESİ KELİMESİNE taşındı; yalnız "private" → "protected" (alt katmanlar kullanabilsin diye) ve
// statik değerlerde "DataService." → tanımlandığı katmanın adı. Davranış aynı. Katman sırası: temel → kurumYetki → bulutDepo → esitleme → hesaplar → okulKayitlari → dataService
// ============================================================================
import { Student, Teacher, UserRole, TeacherDocument, UnifiedUser, SystemRole } from '../../types';
import { supabase, invokeCreateUserEdgeFunction, clearPasswordRecovery, passwordRecoveryLinkReady } from '../../lib/supabase';
import { sifreSorunu, type SifreKisi } from '../../lib/sifreKurali';
import { robotJetonu, robotHatasiMi, ROBOT_RED } from '../../lib/robotKoruma';
import { clearSignedUrlCache } from '../../lib/fileStorage';
import { detectSchoolLevelFromGrade } from '../../constants/schoolConstants';
import { setKurumBrand } from '../../lib/kurumBrand';
import { resetOgrBolum } from '../../lib/ogrenciBolum';
import { disablePush } from '../../lib/push';
import { acikKalCikis } from '../../lib/acikKal';
import { unlockSecureCache } from '../../lib/secureCache';
import { STORAGE_KEYS, appStorage, purgePersistentPersonalData, clearSessionAppData, saveData, freezeAppStorage } from '../depo';
import { hatirlananKisiOku, hatirlananKisiYaz, type HatirlananKisi } from '../hatirla';
import { MIN_PASSWORD_LENGTH, translatePasswordError, teacherWriteErrorText, isMissingTable } from '../hataMetinleri';
import { isMissingGenderColumn, MEZUN_MESAJI } from '../hataMetinleri';
import {
  canonicalAuthEmail,
  trLoginFold,
  generatePasswordOnce,
  signInWithCandidates,
  girisIpucuOku,
  girisIpucuYaz,
  girisHatasiniBildir,
  girisKilidiDenetle,
  girisKilidiniUygula,
} from '../girisYardimci';
import { deleteRowsVerified, deleteLoginAccounts, markMyInitialPasswordChanged } from '../bulutIslemleri';
import { normGender } from '../kayitKurallari';
import { taslaklariSil } from '../../lib/taslak';
import { EMPTY_KURUM_STATE, MY_KURUM_KEY, PORTAL_KEY } from '../kurumTanimlari';
import { KurumYetkiKatmani } from './kurumYetki';
import { BulutDepoKatmani } from './bulutDepo';
import { EsitlemeKatmani } from './esitleme';
import { cleanStudentEmail, ADMIN_EMAIL, type InitialCredentialInfo } from './ortak';
// Bu modülde "localStorage" adı depodaki yönlendiriciyi ifade eder (dataService.ts ile aynı)
const localStorage = appStorage;

export abstract class HesapKatmani extends EsitlemeKatmani {
  // Üst katmanlarda tanımlı olup burada kullanılanlar
  public abstract updateStudent(id: string, updates: Partial<Student>, options?: { newPassword?: string; mustChangePassword?: boolean; }): Promise<{ password?: string; }>;
  public abstract deleteStudent(id: string): Promise<void>;

  public deletedHomeworkIds: Set<string> = new Set();

  public getAllTeachersInternal(): Teacher[] {
    return [...this.teachers];
  }

  public getTeachers(): Teacher[] {
    return this.memoView('Teachers', [this.teachers, this.teachers, this.classes, this.students], this.viewKey(), () => this.computeTeachers());
  }
  protected computeTeachers(): Teacher[] {
    const session = this.getAuthSession();
    const currentTeacher = this.getCurrentTeacher();

    // Kurum Yöneticisi tüm öğretmenleri görebilir
    if (this.isTeacherAdmin(currentTeacher)) {
      return [...this.teachers];
    }

    // Normal öğretmen sisteme yeni/eski kayıtlı diğer hiçbir öğretmenin bilgisini GÖREMEZ. Yalnızca KENDİSİNİ görür.
    if (session?.role === 'teacher' && currentTeacher) {
      return [currentTeacher];
    }

    // Öğrenci oturumu veya diğer durumlar: şifreleri maskele
    return this.teachers.map((t) => ({
      ...t,
      password: '',
    }));
  }

  public getPendingTeachers(): Teacher[] {
    return this.teachers.filter((t) => t.status === 'pending');
  }

  // Aşama 173: öğretmen onay / ret / yönetici değişikliği önce ekranda görünür, buluta yazılamazsa geri alınır.
  // (Eskiden hata yalnız konsola yazılıyordu; ekran "onaylandı" deyip sonraki eşitlemede eski hâline dönüyordu.)
  protected async commitTeacherPatch(teacherId: string, patch: Partial<Teacher>): Promise<{ success: boolean; error?: string }> {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx === -1) return { success: false, error: 'Öğretmen kaydı bulunamadı.' };
    const before = this.teachers[idx];
    const after: Teacher = { ...before, ...patch };
    const setOne = (t: Teacher) => {
      const i = this.teachers.findIndex((x) => x.id === teacherId);
      if (i === -1) return;
      this.teachers = this.teachers.map((x, j) => (j === i ? t : x));
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      const s = this.getAuthSession();
      if (s?.role === 'teacher' && s.user.id === teacherId) this.setAuthSession({ ...s, user: t });
      this.notify();
    };
    setOne(after);
    const res = await this.writeTeacherRow(after);
    if (res.success) return { success: true };
    setOne(before);
    console.warn('[TeacherSync] Öğretmen buluta yazılamadı, değişiklik geri alındı:', res.error?.message || res.error);
    return { success: false, error: teacherWriteErrorText(res.error) };
  }

  public approveTeacher(teacherId: string): Promise<{ success: boolean; error?: string }> {
    return this.commitTeacherPatch(teacherId, { status: 'approved' });
  }

  public rejectTeacher(teacherId: string): Promise<{ success: boolean; error?: string }> {
    return this.commitTeacherPatch(teacherId, { status: 'rejected' });
  }

  // Aşama 173: önce bulutta silinir; silinemezse yerel liste değişmez ve neden söylenir
  public async deleteTeacher(teacherId: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.deleteTeacherFromCloud(teacherId);
    if (!res.success) return { success: false, error: teacherWriteErrorText(res.error) };
    this.deletedTeacherIds.add(teacherId);
    saveData(STORAGE_KEYS.DELETED_TEACHERS, Array.from(this.deletedTeacherIds));
    this.teachers = this.teachers.filter((t) => t.id !== teacherId);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    this.notify();
    return { success: true };
  }

  public toggleTeacherAdmin(teacherId: string, isAdmin: boolean): Promise<{ success: boolean; error?: string }> {
    return this.commitTeacherPatch(teacherId, { isAdmin }); // Aşama 173
  }

  // =========================================================================
  // RBAC & UNIFIED USER MANAGEMENT (Sistem Yöneticisi Tam Yetkili Yönetim)
  // =========================================================================

  public getAllUnifiedUsers(): UnifiedUser[] {
    const list: UnifiedUser[] = [];

    // 1. Öğretmenler ve Yöneticiler
    this.teachers.forEach((t) => {
      if (this.deletedTeacherIds.has(t.id)) return;
      const isAdmin = this.isTeacherAdmin(t);
      const isSuspended = !!t.isSuspended || t.status === 'suspended';

      list.push({
        id: t.id,
        auth_user_id: t.auth_user_id,
        name: t.name,
        username: t.username,
        email: t.email,
        phone: t.phone || '',
        avatar: t.avatar,
        gender: t.gender,
        role: isAdmin ? 'admin' : 'teacher',
        status: isSuspended ? 'suspended' : (t.status || 'approved'),
        isSuspended,
        createdAt: t.createdAt || new Date().toISOString(),
        password: t.password || '',
        branch: t.branch || (isAdmin ? 'Kurum Yöneticisi' : 'Öğretmen'),
        isAdmin,
        kurumId: t.kurumId || null,
      });
    });

    // 2. Öğrenciler
    this.students.forEach((s) => {
      if (this.deletedStudentIds.has(s.id)) return;
      const isSuspended = !!s.isSuspended || s.status === 'suspended';

      list.push({
        id: s.id,
        auth_user_id: s.auth_user_id,
        name: s.name,
        username: s.username,
        email: s.email || '',
        phone: s.phone || '',
        avatar: s.avatar,
        gender: s.gender,
        role: 'student',
        status: isSuspended ? 'suspended' : (s.status || 'active'),
        isSuspended,
        createdAt: s.createdAt || new Date().toISOString(),
        password: s.password || '',
        className: s.className || 'Genel',
        classId: s.classId || 'class-default',
        studentNumber: s.studentNumber || '',
        schoolLevel: s.schoolLevel,
        gradeLevel: s.gradeLevel,
        mustChangePassword: !!s.mustChangePassword,
        kurumId: s.kurumId || null,
      });
    });

    // En yeni kayıtlar üstte olacak şekilde sırala
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Baş yönetici (gerçek e-posta ile giriş yapan kurum yöneticisi) mi?
  /** Aşama 295: bu hesap sistem sahibi mi (giriş anında, kurum bilgisi gelmeden) */
  public sistemSahibiHesabi(t?: Teacher | null): boolean {
    return this.isHeadAdminTeacher(t);
  }
  protected isHeadAdminTeacher(t?: Teacher | null): boolean {
    if (!t) return false;
    return (t.email || '').trim().toLowerCase() === ADMIN_EMAIL || t.id === 'admin-mustafa-bilir';
  }

  // Öğretmen <-> yönetici rol değişikliği: giriş hesabındaki rol (app_metadata) sunucuda değişir,
  // veritabanı kuralları (RLS) bu rolü okuduğu için yetki gerçekten değişir.
  public async adminChangeUserRole(
    userId: string,
    targetRole: SystemRole,
    _options?: { branch?: string; className?: string; classId?: string }
  ): Promise<void> {
    if (!this.isHeadAdmin()) {
      throw new Error('Yönetici yetkisini yalnızca genel yönetici verebilir veya kaldırabilir.');
    }
    const teacher = this.teachers.find((t) => t.id === userId);
    if (teacher) {
      if (targetRole === 'student') {
        throw new Error('Öğretmen hesabı öğrenci hesabına dönüştürülemez. Gerekirse öğrenci için yeni bir kayıt oluşturunuz.');
      }
      if (targetRole === 'teacher' && this.isHeadAdminTeacher(teacher)) {
        throw new Error('Baş yöneticinin yönetici yetkisi kaldırılamaz.');
      }
      await invokeCreateUserEdgeFunction({
        action: 'set_role',
        id: teacher.id,
        role: targetRole === 'admin' ? 'admin' : 'teacher',
      });
      this.teachers = this.teachers.map((t) =>
        t.id === teacher.id
          ? { ...t, isAdmin: targetRole === 'admin', status: t.status === 'pending' ? 'approved' : t.status }
          : t
      );
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      this.notify();
      return;
    }

    if (this.students.some((s) => s.id === userId)) {
      throw new Error('Öğrenci hesabı öğretmen/yönetici hesabına dönüştürülemez. Öğretmen hesabını "Yeni Öğretmen Hesabı" düğmesiyle açınız.');
    }
    throw new Error('Kullanıcı kaydı bulunamadı.');
  }

  public async adminUpdateUserProfile(
    userId: string,
    updates: Omit<Partial<UnifiedUser>, 'gender'> & { newPassword?: string; gender?: 'K' | 'E' | null }
  ): Promise<void> {
    const newPassword = updates.newPassword?.trim() || '';

    // 1. Öğretmen / yönetici
    const teacher = this.teachers.find((t) => t.id === userId);
    if (teacher) {
      const teacherUpdates: Partial<Teacher> = {};
      if (updates.name && updates.name.trim()) teacherUpdates.name = updates.name.trim();
      if (
        updates.username &&
        updates.username.trim() &&
        updates.username.trim().toLowerCase() !== (teacher.username || '').trim().toLowerCase()
      ) {
        teacherUpdates.username = updates.username.trim().toLowerCase();
      }
      if (updates.email !== undefined) teacherUpdates.email = updates.email.trim();
      if (updates.phone !== undefined) teacherUpdates.phone = updates.phone.trim();
      if (updates.branch !== undefined) teacherUpdates.branch = updates.branch.trim();
      if (updates.avatar !== undefined) teacherUpdates.avatar = updates.avatar;
      if (updates.gender !== undefined) teacherUpdates.gender = normGender(updates.gender); // Aşama 171

      const previousUsername = teacher.username || '';
      const isHeadAdmin = this.isHeadAdminTeacher(teacher);
      if (newPassword && isHeadAdmin) {
        throw new Error('Kendi şifrenizi buradan değil, profil menüsündeki "Şifre Değiştir" ekranından değiştiriniz.');
      }
      if (teacherUpdates.username && !/^[a-z0-9_-]{3,30}$/.test(teacherUpdates.username) && !isHeadAdmin) {
        throw new Error('Kullanıcı adı 3-30 karakter olmalı; yalnızca küçük harf, rakam, - ve _ içerebilir (Türkçe karakter ve boşluk kullanılamaz).');
      }
      // Aşama 145: basit şifre profil kaydedilmeden önce reddedilir
      if (newPassword) {
        const kuralHata = sifreSorunu(newPassword, {
          identifier: teacherUpdates.username || teacher.username,
          name: teacherUpdates.name || teacher.name,
          personel: true, // Aşama 339
        });
        if (kuralHata) throw new Error(kuralHata);
      }

      const updated = await this.saveTeacherProfile(userId, teacherUpdates);
      const usernameChanged = (updated.username || '') !== previousUsername;

      // Giriş adı (kullanıcı adı) veya şifre değiştiyse gerçek giriş hesabı da güncellenir.
      // Baş yönetici gerçek e-posta adresiyle giriş yaptığından kullanıcı adı onun girişini etkilemez.
      if (!isHeadAdmin && (newPassword || (usernameChanged && updated.auth_user_id))) {
        try {
          await this.syncLoginAccount('teacher', updated, newPassword || undefined);
        } catch (err: any) {
          if (usernameChanged) {
            await this.saveTeacherProfile(userId, { username: previousUsername }).catch(() => {});
          }
          throw new Error(
            `Bilgiler kaydedildi ancak giriş hesabı güncellenemedi: ${err?.message || 'bilinmeyen hata'}` +
              (usernameChanged ? ' Kullanıcı adı eski haline döndürüldü.' : '')
          );
        }
      }
      return;
    }

    // 2. Öğrenci
    const student = this.students.find((s) => s.id === userId);
    if (student) {
      const studentUpdates: Partial<Student> = {};
      if (updates.name && updates.name.trim()) studentUpdates.name = updates.name.trim();
      if (updates.email !== undefined) studentUpdates.email = cleanStudentEmail(updates.email);
      if (updates.phone !== undefined) studentUpdates.phone = updates.phone.trim();
      if (updates.studentNumber !== undefined) studentUpdates.studentNumber = updates.studentNumber.trim();
      if (updates.avatar !== undefined) studentUpdates.avatar = updates.avatar;
      if (updates.gender !== undefined) studentUpdates.gender = normGender(updates.gender); // Aşama 171
      if (updates.classId !== undefined) {
        studentUpdates.classId = updates.classId;
        const cls = this.classes.find((c) => c.id === updates.classId);
        if (cls) studentUpdates.className = cls.name;
      }
      if (updates.schoolLevel !== undefined) studentUpdates.schoolLevel = updates.schoolLevel;
      if (updates.gradeLevel !== undefined) studentUpdates.gradeLevel = updates.gradeLevel;

      await this.updateStudent(userId, studentUpdates, {
        newPassword: newPassword || undefined,
        mustChangePassword: updates.mustChangePassword,
      });
      return;
    }

    throw new Error('Güncellenecek kullanıcı kaydı bulunamadı.');
  }

  // Aşama 171: toplu cinsiyet kaydı ("Cinsiyeti addan doldur" ve Excel ile güncelle).
  // Aynı cinsiyetliler tek istekte yazılır (200'erli); yetki dışı satırlar veritabanınca atlanır.
  public async saveGenders(
    kind: 'student' | 'teacher',
    changes: Array<{ id: string; gender: 'K' | 'E' | null }>
  ): Promise<{ saved: number; failed: number; error?: string }> {
    const table = kind === 'student' ? 'students' : 'teachers';
    if (BulutDepoKatmani.genderMissing[table]) {
      return { saved: 0, failed: changes.length, error: 'Cinsiyet için 171 numaralı SQL dosyasının Supabase\'te çalıştırılması gerekiyor.' };
    }
    const groups = new Map<string, string[]>();
    for (const c of changes) {
      const g = c.gender === 'K' || c.gender === 'E' ? c.gender : '';
      const arr = groups.get(g) || [];
      arr.push(c.id);
      groups.set(g, arr);
    }
    const okIds = new Set<string>();
    let lastError = '';
    for (const [g, ids] of groups) {
      for (let i = 0; i < ids.length; i += 200) {
        const part = ids.slice(i, i + 200);
        const { data, error } = await supabase.from(table).update({ gender: g || null }).in('id', part).select('id');
        if (error) {
          if (isMissingGenderColumn(error)) {
            BulutDepoKatmani.genderMissing[table] = true;
            return { saved: okIds.size, failed: changes.length - okIds.size, error: 'Cinsiyet için 171 numaralı SQL dosyasının Supabase\'te çalıştırılması gerekiyor.' };
          }
          lastError = error.message;
          continue;
        }
        (data || []).forEach((r: any) => okIds.add(String(r.id)));
      }
    }
    if (okIds.size) {
      const byId = new Map(changes.map((c) => [c.id, normGender(c.gender)]));
      if (kind === 'student') {
        this.students = this.students.map((s) => (okIds.has(s.id) ? { ...s, gender: byId.get(s.id) } : s));
        saveData(STORAGE_KEYS.STUDENTS, this.students);
      } else {
        this.teachers = this.teachers.map((t) => (okIds.has(t.id) ? { ...t, gender: byId.get(t.id) } : t));
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      }
      this.notify();
    }
    return { saved: okIds.size, failed: changes.length - okIds.size, error: lastError || undefined };
  }

  // Hesabı askıya alma / açma: giriş hesabı sunucuda kilitlenir (giriş yapılamaz) ve
  // kayıttaki durum tüm cihazlarda "askıda" görünür.
  public async adminToggleUserSuspension(userId: string, suspend: boolean, _reason?: string): Promise<void> {
    const teacher = this.teachers.find((t) => t.id === userId);
    const student = teacher ? undefined : this.students.find((s) => s.id === userId);
    if (!teacher && !student) throw new Error('Kullanıcı bulunamadı.');

    if (teacher && suspend && (this.isHeadAdminTeacher(teacher) || teacher.isAdmin)) {
      throw new Error('Yönetici hesabı askıya alınamaz. Önce yöneticilik yetkisini kaldırınız.');
    }

    await invokeCreateUserEdgeFunction({
      action: 'set_suspended',
      type: teacher ? 'teacher' : 'student',
      id: userId,
      suspended: suspend,
    });

    if (teacher) {
      this.teachers = this.teachers.map((t) =>
        t.id === userId ? { ...t, isSuspended: suspend, status: suspend ? 'suspended' : 'approved' } : t
      );
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    } else {
      this.students = this.students.map((s) =>
        s.id === userId ? { ...s, isSuspended: suspend, status: suspend ? 'suspended' : 'active' } : s
      );
      saveData(STORAGE_KEYS.STUDENTS, this.students);
    }
    this.notify();
  }

  // =========================================================================
  // ÖĞRETMEN ERİŞİM YETKİLENDİRMESİ (YÖNETİCİ KONTROLÜNDE)
  // =========================================================================
  public async adminUpdateTeacherAuthorizations(
    teacherId: string,
    assignedClassIds: string[],
    assignedStudentIds: string[]
  ): Promise<void> {
    const teacher = this.teachers.find((t) => t.id === teacherId);
    if (!teacher) throw new Error('Öğretmen bulunamadı.');

    // 1. teacher.auth_user_id çözümleme
    let authUserId = teacher.auth_user_id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!authUserId && uuidRegex.test(teacherId)) {
      authUserId = teacherId;
      teacher.auth_user_id = authUserId;
    }

    if (!authUserId) {
      throw new Error(
        `"${teacher.name}" kullanıcısının Supabase Auth ID'si (auth_user_id) bulunamadı. Öğretmenin veritabanında aktif bir Auth hesabı olmalıdır.`
      );
    }

    // 2. Supabase veritabanına yazma: yalnız tek işlemlik (atomik) RPC.
    // Aşama 173: eski "önce hepsini sil, sonra ekle" yedek yolu kaldırıldı. O yol tek işlem değildi (ekleme
    // hata verirse öğretmen bütün yetkisini kaybediyordu) ve mesajında "function" geçen her hatada devreye giriyordu.
    const { error: rpcError } = await supabase.rpc('admin_set_teacher_access', {
      p_teacher_auth_id: authUserId,
      p_class_ids: assignedClassIds,
      p_student_ids: assignedStudentIds,
    });
    if (rpcError) {
      throw new Error(`Yetkiler kaydedilemedi, hiçbir değişiklik yapılmadı: ${rpcError.message || 'bilinmeyen hata'}`);
    }

    // Aşama 180: yetkinin tek kaynağı veritabanıdır. Eskiden burada öğretmenin, sınıfların ve öğrencilerin
    // yerel kopyalarına da yetki listesi yazılıyordu; bu kopyalar yalnız bu cihazda kalıyor ve bir sonraki
    // eşitlemede kayboluyordu. Öğretmenin ekranı kendi yetkisini veritabanından okur (myTeacherAccess).
    this.notify();
  }

  // Aşama 180: yönetici listesindeki "N sınıf / N öğrenci" etiketi için tek seferde tüm öğretmenlerin yetki sayısı.
  // Kademeden gelen sınıflar da sayılır (öğretmenin gerçekte gördüğü sınıf sayısı). Okunamazsa boş döner (etiket gösterilmez).
  public async getTeacherAccessCounts(): Promise<Map<string, { classes: number; students: number }>> {
    const out = new Map<string, { classes: number; students: number }>();
    const PAGE = 1000;
    const readAll = async (table: string, col: string): Promise<Array<Record<string, string>> | null> => {
      const rows: Array<Record<string, string>> = [];
      // Aşama 346: sütun listesi düz metin tipinde verilir; şablon tipi supabase-js'in sorgu çözümleyicisinde
      // "ParserError" tipi üretip tip denetimini bozuyordu (CI'da tip denetimi hatasız geçsin)
      const sutunlar: string = `teacher_auth_id,${col}`;
      for (let from = 0; from < 200000; from += PAGE) {
        const { data, error } = await supabase
          .from(table)
          .select<string, Record<string, string>>(sutunlar)
          .order('teacher_auth_id', { ascending: true })
          .order(col, { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) return null;
        rows.push(...((data || []) as Array<Record<string, string>>));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    };
    const [cls, std] = await Promise.all([readAll('teacher_class_access', 'class_id'), readAll('teacher_student_access', 'student_id')]);
    if (!cls || !std) return out;
    const count = (rows: Array<Record<string, string>>, col: string, key: 'classes' | 'students') => {
      const seen = new Set<string>();
      for (const r of rows) {
        const id = String(r.teacher_auth_id || '');
        const pair = `${id}|${r[col]}`;
        if (!id || seen.has(pair)) continue;
        seen.add(pair);
        const cur = out.get(id) || { classes: 0, students: 0 };
        cur[key]++;
        out.set(id, cur);
      }
    };
    count(cls, 'class_id', 'classes');
    count(std, 'student_id', 'students');
    return out;
  }

  public async getTeacherCloudAccess(teacherAuthId: string): Promise<{ classIds: string[]; studentIds: string[]; gradeClassIds: string[] }> {
    // Aşama 102: kademeden gelen sınıflar (via_grade) ayrı döner; SQL 102 yoksa eski sorgu
    const withFlag = await supabase.from('teacher_class_access').select('class_id,via_grade').eq('teacher_auth_id', teacherAuthId);
    let cData: Array<{ class_id: string; via_grade?: boolean }> | null = withFlag.data;
    let cErr = withFlag.error;
    if (cErr && /via_grade/i.test(cErr.message || '')) {
      const plain = await supabase.from('teacher_class_access').select('class_id').eq('teacher_auth_id', teacherAuthId);
      cData = plain.data;
      cErr = plain.error;
    }

    if (cErr) {
      throw new Error(`Sınıf erişim izinleri veritabanından okunamadı: ${cErr.message}`);
    }

    const { data: sData, error: sErr } = await supabase
      .from('teacher_student_access')
      .select('student_id')
      .eq('teacher_auth_id', teacherAuthId);

    if (sErr) {
      throw new Error(`Öğrenci erişim izinleri veritabanından okunamadı: ${sErr.message}`);
    }

    return {
      classIds: cData ? cData.filter((r: any) => r.via_grade !== true).map((r: any) => r.class_id) : [],
      studentIds: sData ? sData.map((r: any) => r.student_id) : [],
      gradeClassIds: cData ? cData.filter((r: any) => r.via_grade === true).map((r: any) => r.class_id) : [],
    };
  }

  public async adminDeleteUser(userId: string): Promise<void> {
    const teacher = this.teachers.find((t) => t.id === userId);
    if (teacher) {
      if (this.isHeadAdminTeacher(teacher)) {
        throw new Error('Baş yönetici hesabı silinemez.');
      }
      if (teacher.isAdmin) {
        throw new Error('Yönetici hesabı silinemez. Önce yöneticilik yetkisini kaldırınız.');
      }
      if (!this.canManageTeacherAccount(teacher)) {
        throw new Error('Bu öğretmeni silme yetkiniz yok.');
      }
      // 1) Giriş hesabını sil (sunucu). Başarısızsa kayıt silinmez.
      const { failed } = await deleteLoginAccounts('teacher', [userId]);
      if (failed.length > 0) {
        throw new Error(`Öğretmenin giriş hesabı silinemedi: ${failed[0].error || 'bilinmeyen hata'}`);
      }
      // 2) Öğretmen kaydını sil ve silindiğini doğrula
      const { error } = await deleteRowsVerified('teachers', [userId]);
      if (error) {
        throw new Error(`Giriş hesabı silindi ancak öğretmen kaydı silinemedi: ${error.message || 'yetki hatası'}`);
      }
      this.deletedTeacherIds.add(userId);
      saveData(STORAGE_KEYS.DELETED_TEACHERS, Array.from(this.deletedTeacherIds));
      this.teachers = this.teachers.filter((t) => t.id !== userId);
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      this.notify();
      return;
    }

    const student = this.students.find((s) => s.id === userId);
    if (student) {
      await this.deleteStudent(userId);
      return;
    }

    throw new Error('Silinecek kullanıcı bulunamadı.');
  }

  public async adminResetPassword(userId: string, tempPassword?: string): Promise<string> {
    const newPass = tempPassword || this.generatePassword();
    await this.adminUpdateUserProfile(userId, {
      newPassword: newPass,
      mustChangePassword: true,
    });
    return newPass;
  }

  // =========================================================================
  // GİRİŞ HESAPLARI (create-user sunucu fonksiyonu)
  // =========================================================================

  // Okunması kolay, karışan karakterleri (0/O, 1/l/I) içermeyen rastgele şifre
  public generatePassword(length = 8): string {
    // Aşama 145: üretilen şifre de basit şifre kuralına uymalı (pratikte ilk denemede uyar)
    for (let i = 0; i < 20; i++) {
      const pw = generatePasswordOnce(length);
      // Aşama 339: 8+ hanede personel kuralı da sağlanır (harf + rakam); öğretmene verilen şifre her zaman geçer
      if (!sifreSorunu(pw, length >= 8 ? { personel: true } : undefined)) return pw;
    }
    return generatePasswordOnce(length);
  }

  // Öğrenci numarası / kullanıcı adı giriş adresine dönüştürülebilir mi?
  public isValidLoginIdentifier(value: string): boolean {
    return /^[0-9A-Za-z_-]{1,20}$/.test((value || '').trim());
  }

  // Kaydın giriş hesabını oluşturur veya günceller (şifre verilirse şifre de belirlenir).
  // Giriş adı: öğrencide öğrenci numarası, öğretmende kullanıcı adı.
  protected async syncLoginAccount(
    type: 'teacher' | 'student',
    record: Teacher | Student,
    password?: string,
    mustChangePassword?: boolean
  ): Promise<{ auth_user_id: string | null; account: boolean }> {
    if (password && password.length < HesapKatmani.MIN_PASSWORD_LENGTH) {
      throw new Error(`Şifre en az ${HesapKatmani.MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    }
    const identifier =
      type === 'teacher'
        ? ((record as Teacher).username || '').trim()
        : ((record as Student).studentNumber || '').trim();
    if (!identifier) {
      throw new Error(type === 'teacher' ? 'Öğretmenin kullanıcı adı boş olamaz.' : 'Öğrenci numarası boş olamaz (giriş için kullanılır).');
    }
    // Aşama 145: yöneticinin/öğretmenin verdiği şifre de basit olamaz (sunucu da aynı kuralı uygular)
    if (password) {
      const kuralHata = sifreSorunu(password, { identifier, name: record.name, personel: type === 'teacher' }); // Aşama 339
      if (kuralHata) throw new Error(kuralHata);
    }

    const result = await invokeCreateUserEdgeFunction({
      type,
      id: record.id,
      identifier,
      name: record.name,
      password: password || undefined,
      mustChangePassword: mustChangePassword === false ? false : undefined,
    });

    const authUserId = (result?.auth_user_id as string | null) || null;
    if (authUserId) {
      if (type === 'teacher') {
        this.teachers = this.teachers.map((t) => (t.id === record.id ? { ...t, auth_user_id: authUserId } : t));
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      } else {
        this.students = this.students.map((s) => (s.id === record.id ? { ...s, auth_user_id: authUserId } : s));
        saveData(STORAGE_KEYS.STUDENTS, this.students);
      }
      this.notify();
    }
    return { auth_user_id: authUserId, account: !!result?.account };
  }

  // Yönetici: yeni öğretmen hesabı (kayıt + giriş hesabı birlikte; biri başarısızsa hiçbiri kalmaz)
  public async createTeacherAccount(data: {
    name: string;
    username: string;
    branch?: string;
    email?: string;
    phone?: string;
    password: string;
    isAdmin?: boolean;
    gender?: 'K' | 'E';
  }): Promise<{ teacher: Teacher; password: string }> {
    if (!this.canManageTeachers()) {
      throw new Error('Öğretmen hesabını yalnızca yönetici açabilir.');
    }
    // Kurum yöneticisi yönetici yetkisi veremez
    if (data.isAdmin && !this.isHeadAdmin()) data = { ...data, isAdmin: false };
    const name = (data.name || '').trim();
    const username = (data.username || '').trim().toLowerCase();
    const password = (data.password || '').trim();
    if (name.length < 3) throw new Error('Lütfen öğretmenin adını ve soyadını giriniz.');
    if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
      throw new Error('Kullanıcı adı 3-30 karakter olmalı; yalnızca küçük harf, rakam, - ve _ içerebilir (Türkçe karakter ve boşluk kullanılamaz).');
    }
    if (password.length < HesapKatmani.MIN_PASSWORD_LENGTH) {
      throw new Error(`Şifre en az ${HesapKatmani.MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    }
    const kuralHata = sifreSorunu(password, { identifier: username, name, personel: true }); // Aşama 145, 339
    if (kuralHata) throw new Error(kuralHata);
    if (this.teachers.some((t) => (t.username || '').toLowerCase() === username)) {
      throw new Error(`"${username}" kullanıcı adı başka bir öğretmende kullanılıyor.`);
    }

    // Aşama 171: cinsiyet verilmediyse addan tahmin (ad listesi gerektiğinde iner)
    if (!normGender(data.gender)) {
      try {
        data = { ...data, gender: (await import('../../lib/cinsiyetTahmin')).cinsiyetTahmin(name) };
      } catch {
        /* tahmin edilemezse boş kalır */
      }
    }
    const teacher: Teacher = {
      id: `teacher-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      username,
      email: (data.email || '').trim(),
      branch: (data.branch || '').trim() || 'Öğretmen',
      phone: (data.phone || '').trim(),
      avatar: undefined, // Aşama 171: resim seçilene kadar cinsiyete/role göre çizim gösterilir
      gender: normGender(data.gender),
      createdAt: new Date().toISOString(),
      role: 'teacher',
      status: 'approved',
      isAdmin: false,
      kurumId: this.getMyKurumId(),
    };

    const insertTeacher = () =>
      supabase.from('teachers').insert({
        id: teacher.id,
        name: teacher.name,
        username: teacher.username,
        email: teacher.email || null,
        branch: teacher.branch,
        avatar: teacher.avatar || null,
        role: 'teacher',
        status: 'approved',
        is_admin: false,
        created_at: teacher.createdAt,
        ...(teacher.kurumId ? { kurum_id: teacher.kurumId } : {}),
        ...(BulutDepoKatmani.genderMissing.teachers || !teacher.gender ? {} : { gender: teacher.gender }),
      });
    let { error: insertError } = await insertTeacher();
    if (insertError && teacher.gender && isMissingGenderColumn(insertError)) {
      BulutDepoKatmani.genderMissing.teachers = true; // Aşama 171
      ({ error: insertError } = await insertTeacher());
    }
    if (insertError) {
      throw new Error(`Öğretmen kaydı oluşturulamadı: ${insertError.code === '42501' ? 'Bu işlem için yetkiniz yok' : insertError.message}`);
    }

    try {
      const res = await invokeCreateUserEdgeFunction({
        type: 'teacher',
        id: teacher.id,
        identifier: username,
        name,
        password,
      });
      teacher.auth_user_id = (res?.auth_user_id as string) || undefined;
    } catch (err: any) {
      await deleteRowsVerified('teachers', [teacher.id]).catch(() => {});
      throw new Error(`Giriş hesabı açılamadı, kayıt geri alındı: ${err?.message || 'bilinmeyen hata'}`);
    }

    if (data.isAdmin) {
      try {
        await invokeCreateUserEdgeFunction({ action: 'set_role', id: teacher.id, role: 'admin' });
        teacher.isAdmin = true;
      } catch {
        // hesap açıldı; yönetici yetkisi daha sonra verilebilir
      }
    }

    // Anlık güncelleme aynı öğretmeni daha önce eklemiş olabilir: aynı kimlik iki kez listelenmez
    this.teachers = [teacher, ...this.teachers.filter((t) => t.id !== teacher.id)];
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    this.notify();
    return { teacher, password };
  }

  // Yerel öğretmen kaydını, oturumu ve "beni hatırla" bilgisini günceller (bulut yazımı yapmaz)
  protected applyTeacherLocal(teacherId: string, updates: Partial<Teacher>): { previous: Teacher; updated: Teacher } {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx === -1) {
      throw new Error('Öğretmen kaydı bulunamadı.');
    }
    const previous = this.teachers[idx];
    const updated = { ...previous, ...updates };
    this.teachers[idx] = updated;
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    try {
      localStorage.setItem(`edu_sys_teacher_custom_profile_${teacherId}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not write custom teacher profile override:', e);
    }

    const currentSession = this.getAuthSession();
    if (currentSession?.role === 'teacher' && currentSession.user.id === teacherId) {
      this.setAuthSession({ role: 'teacher', user: updated });
    }

    const remembered = this.getRememberedUser('teacher');
    if (
      remembered &&
      (remembered.identifier.toLowerCase() === (previous.username || '').toLowerCase() ||
        remembered.identifier.toLowerCase() === (previous.email || '').toLowerCase())
    ) {
      this.setRememberedUser({
        ...remembered,
        name: updated.name,
        branch: updated.branch,
        avatar: updated.avatar,
        // Aşama 155: e-postayla hatırlanan hesapta e-posta korunur; yalnız kullanıcı adı hatırlanıyorsa güncellenir
        identifier: remembered.identifier.includes('@') ? remembered.identifier : updated.username || remembered.identifier,
      });
    }
    this.notify();
    return { previous, updated };
  }

  // Profil kaydetme: buluta yazılmasını BEKLER; yazılamazsa yerel değişiklik geri alınır ve hata fırlatılır
  public async saveTeacherProfile(teacherId: string, updates: Partial<Teacher>): Promise<Teacher> {
    const { previous, updated } = this.applyTeacherLocal(teacherId, updates);
    const res = await this.writeTeacherRow(updated);
    if (!res.success) {
      this.applyTeacherLocal(teacherId, previous);
      const reason = res.error?.code === '42501' ? 'Bu işlem için yetkiniz yok' : res.error?.message || 'Bağlantı sorunu';
      throw new Error(`Profil bilgileri kaydedilemedi (${reason}). Değişiklikler geri alındı.`);
    }
    return updated;
  }

  public async updateTeacherPassword(_teacherId: string, oldPassword: string, newPassword: string): Promise<void> {
    // Şifre yalnızca Supabase Auth üzerinde değiştirilir (yerel kopya tutulmaz)
    await this.changeOwnPassword(oldPassword, newPassword);
  }

  // =========================================================================
  // ŞİFRE İŞLEMLERİ (Supabase Auth)
  // =========================================================================
  // Aşama 155: "Beni hatırla" kutusuna yazılacak bilgi, hesabın GERÇEK giriş adresiyle birebir tutmalı.
  // Giriş adresi gerçek e-posta olan hesapta (ör. genel yönetici) kullanıcı adından adres üretilemez; bu yüzden
  // e-posta saklanır. Sistemin ürettiği adresi (…@okul.internal.net) olan hesaplarda kullanıcı adı saklanır.
  protected lastTeacherLoginEmail = '';
  public rememberIdentifierForTeacher(teacher: Teacher, typed: string): string {
    const loginEmail = this.lastTeacherLoginEmail;
    if (loginEmail && loginEmail.includes('@') && !loginEmail.endsWith('@okul.internal.net')) return loginEmail;
    return teacher.username || typed;
  }

  // Aşama 173: son öğretmen girişinin GERÇEK e-postası (sistem adresi …@okul.internal.net ise boş döner).
  // "Beni hatırla" kaydına gizli alan olarak yazılır; kutuda kullanıcı adı görünür, giriş bu adresle yapılır.
  public realTeacherLoginEmail(): string {
    const e = this.lastTeacherLoginEmail;
    return e && e.includes('@') && !e.endsWith('@okul.internal.net') ? e : '';
  }

  public static readonly MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH; // Aşama 318: hataMetinleri.ts'te

  // Oturumdaki kullanıcının KENDİ şifresini değiştirir. Önce eski şifre Supabase'de doğrulanır.
  public async changeOwnPassword(oldPassword: string, newPassword: string): Promise<void> {
    this.assertNotPreview(); // Aşama 107: önizlemede öğretmenin kendi şifresi değişmesin
    if (!oldPassword) throw new Error('Lütfen mevcut şifrenizi giriniz.');
    if (!newPassword || newPassword.length < HesapKatmani.MIN_PASSWORD_LENGTH) {
      throw new Error(`Yeni şifreniz en az ${HesapKatmani.MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    }
    if (oldPassword === newPassword) {
      throw new Error('Yeni şifreniz mevcut şifrenizden farklı olmalıdır.');
    }
    const kuralHata = sifreSorunu(newPassword, this.oturumSifreKisi()); // Aşama 145
    if (kuralHata) throw new Error(kuralHata);

    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData?.session?.user?.email;
    if (!email) {
      throw new Error('Oturumunuz bulunamadı. Lütfen çıkış yapıp tekrar giriş yapınız.');
    }

    // 1) Eski şifreyi doğrula (yanlışsa mevcut oturum bozulmaz, işlem burada durur)
    const captchaToken = await robotJetonu(); // Aşama 309: robot koruması açıksa taze doğrulama jetonu
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: oldPassword, options: captchaToken ? { captchaToken } : undefined });
    if (verifyError) {
      if (robotHatasiMi(verifyError)) throw new Error(ROBOT_RED);
      const vm = (verifyError.message || '').toLowerCase();
      if (vm.includes('rate limit') || vm.includes('too many')) {
        throw new Error(translatePasswordError(verifyError.message));
      }
      throw new Error('Mevcut şifreniz hatalı. Lütfen kontrol edip tekrar deneyiniz.');
    }

    // 2) Yeni şifreyi Supabase'e yaz ("ilk girişte şifre değiştir" işaretini de kaldır)
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
    if (updateError) {
      throw new Error(translatePasswordError(updateError.message));
    }
    await markMyInitialPasswordChanged();
    this.basitSifreTemizle(); // Aşama 145: zorunlu şifre penceresi kapanır
  }

  // =========================================================================
  // Aşama 145: BASİT ŞİFRE ENGELİ
  // Girişte yazılan şifre kurala uymuyorsa bu sekmede işaret tutulur; öğrenci ve öğretmen/yönetici yeni şifre
  // belirleyene kadar zorunlu şifre penceresi açık kalır. Şifre saklanmaz, yalnız kullanıcı kimliği tutulur.
  // Sunucuya yazılmaz: her şifreyle girişte yeniden denetlenir (ek ağ isteği yok).
  // =========================================================================
  protected static readonly BASIT_SIFRE_KEY = 'edu_sys_basit_sifre_v6';
  protected basitSifreId: string | null | undefined = undefined;

  protected oturumSifreKisi(): SifreKisi {
    const session = this.getAuthSession();
    if (!session?.user) return {};
    const u = session.user as Teacher & Student;
    // Aşama 339: öğrenci dışındaki herkes (öğretmen, idare, yönetici) personel kuralına tabi
    return { identifier: session.role === 'student' ? u.studentNumber || u.username : u.username, name: u.name, personel: session.role !== 'student' };
  }

  /** Girişte yazılan şifreyi denetler; basitse işaretler. Basitse true döner. */
  public basitSifreDenetle(password: string, userId: string, kisi: SifreKisi): boolean {
    if (!userId || !sifreSorunu(password, kisi)) return false;
    this.basitSifreId = userId;
    try {
      sessionStorage.setItem(HesapKatmani.BASIT_SIFRE_KEY, userId);
    } catch {}
    return true;
  }

  public basitSifreVarMi(userId?: string | null): boolean {
    if (!userId) return false;
    if (this.basitSifreId === undefined) {
      try {
        this.basitSifreId = sessionStorage.getItem(HesapKatmani.BASIT_SIFRE_KEY);
      } catch {
        this.basitSifreId = null;
      }
    }
    return this.basitSifreId === userId;
  }

  public basitSifreTemizle(): void {
    const vardi = !!this.basitSifreId;
    this.basitSifreId = null;
    try {
      sessionStorage.removeItem(HesapKatmani.BASIT_SIFRE_KEY);
    } catch {}
    if (vardi) this.notify();
  }

  // Aşama 25: Yönetici için öğrenci/öğretmen ilk giriş şifreleri (Excel listesi).
  // Anahtar: "student:<kayıt id>" veya "teacher:<kayıt id>"
  public async getInitialCredentials(): Promise<Map<string, InitialCredentialInfo>> {
    if (!this.isHeadAdmin() && !this.isKurumAdmin()) {
      throw new Error('Bu listeyi yalnızca yöneticiler alabilir.');
    }
    const map = new Map<string, InitialCredentialInfo>();
    const PAGE = 1000;
    // Aşama 345: şifreler veritabanında şifreli; liste sunucu işleviyle açılır (kim indirdi: İşlem geçmişi).
    // İşlev kurulu değilse (345 SQL'i henüz çalıştırılmadı) eski yol.
    let eskiYol = false;
    for (let from = 0; from < 100000; from += PAGE) {
      const { data, error } = await supabase.rpc('ilk_sifre_listesi', { p_from: from, p_limit: PAGE });
      if (error) {
        if (from === 0 && (error.code === 'PGRST202' || error.code === '42883')) {
          eskiYol = true;
          break;
        }
        throw new Error(error.message);
      }
      ((data as any[]) || []).forEach((r: any) => {
        map.set(`${r.account_type}:${r.record_id}`, {
          type: r.account_type,
          recordId: String(r.record_id),
          loginId: r.login_id || '',
          password: r.password || '',
          sifreVar: !!r.password,
          mustChange: r.must_change !== false,
          setAt: r.set_at || '',
          changedAt: r.changed_at || null,
        });
      });
      if (!data || (data as any[]).length < PAGE) break;
    }
    if (!eskiYol) return map;
    for (let from = 0; from < 100000; from += PAGE) {
      const { data, error } = await supabase
        .from('initial_credentials')
        .select('account_type,record_id,login_id,password,must_change,set_at,changed_at')
        .range(from, from + PAGE - 1);
      if (error) {
        if (/initial_credentials/i.test(error.message || '') || error.code === '42P01' || error.code === 'PGRST205') {
          throw new Error('İlk şifre tablosu bulunamadı. Supabase\'de 09c_ilk_giris_sifreleri.sql dosyasını çalıştırın.');
        }
        throw new Error(error.message);
      }
      (data || []).forEach((r: any) => {
        map.set(`${r.account_type}:${r.record_id}`, {
          type: r.account_type,
          recordId: String(r.record_id),
          loginId: r.login_id || '',
          password: r.password || '',
          mustChange: r.must_change !== false,
          setAt: r.set_at || '',
          changedAt: r.changed_at || null,
        });
      });
      if (!data || data.length < PAGE) break;
    }
    return map;
  }

  // Aşama 254: tek kişinin yöneticinin verdiği ilk şifresi (öğrenci bilgi ekranında noktalı gösterilir).
  // Yalnız yöneticiler (RLS ile aynı); kişi şifresini değiştirdiyse password boş, changedAt dolu gelir.
  // Kayıt yoksa null. Gerçek (değiştirilmiş) şifre Supabase Auth'ta yalnız özet olarak durur, gösterilemez.
  // Aşama 345: coz = false yalnız durumu getirir (şifre var mı); true şifreyi açar ve İşlem geçmişine "gördü" yazılır.
  public async getInitialCredential(type: 'student' | 'teacher', recordId: string, coz = false): Promise<InitialCredentialInfo | null> {
    if (!this.isHeadAdmin() && !this.isKurumAdmin()) return null;
    const yeni = await supabase.rpc('ilk_sifre_getir', { p_tur: type, p_kayit: recordId, p_coz: coz });
    if (!yeni.error) {
      const r: any = Array.isArray(yeni.data) ? yeni.data[0] : yeni.data;
      if (!r) return null;
      return {
        type: r.account_type,
        recordId: String(r.record_id),
        loginId: r.login_id || '',
        password: r.password || '',
        sifreVar: !!r.sifre_var,
        mustChange: r.must_change !== false,
        setAt: r.set_at || '',
        changedAt: r.changed_at || null,
      };
    }
    if (yeni.error.code !== 'PGRST202' && yeni.error.code !== '42883') throw new Error(yeni.error.message);
    // 345 SQL'i kurulmadıysa eski yol (şifre tabloda düz yazı)
    const { data, error } = await supabase
      .from('initial_credentials')
      .select('account_type,record_id,login_id,password,must_change,set_at,changed_at')
      .eq('account_type', type)
      .eq('record_id', recordId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const r: any = data;
    return {
      type: r.account_type,
      recordId: String(r.record_id),
      loginId: r.login_id || '',
      password: r.password || '',
      sifreVar: !!r.password,
      mustChange: r.must_change !== false,
      setAt: r.set_at || '',
      changedAt: r.changed_at || null,
    };
  }

  // Öğrencinin "ilk girişte şifre değiştir" zorunluluğunu yerelde kaldırır (şifre yerelde saklanmaz)
  public markStudentPasswordChanged(studentId: string): void {
    if (this.isStudentPreview()) return; // Aşama 107
    this.students = this.students.map((s) =>
      s.id === studentId ? { ...s, mustChangePassword: false, password: '' } : s
    );
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    const session = this.getAuthSession();
    if (session?.role === 'student' && session.user.id === studentId) {
      const fresh = this.students.find((s) => s.id === studentId);
      if (fresh) this.setAuthSession({ ...session, user: fresh });
    }
    this.notify();
  }

  // Aşama 262: "Şifremi unuttum" — kullanıcı adı ya da kayıtlı e-posta yazılır; bağlantı sitemizin kendi e-postasıyla
  // (biliredu / kurum adıyla, Türkçe) hesabın kayıtlı adresine gider (api/mail.js sifre-sifirla). Supabase e-postası kullanılmaz.
  // Yanıt her durumda aynıdır (hesabın var olup olmadığı anlaşılmaz).
  public async sendPasswordResetEmail(kimlik: string): Promise<void> {
    const clean = (kimlik || '').trim().toLowerCase();
    if (clean.length < 3) throw new Error('Kullanıcı adınızı ya da kayıtlı e-posta adresinizi yazın.');
    let res: Response;
    try {
      res = await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sifre-sifirla', kimlik: clean }),
      });
    } catch {
      throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
    }
    if (!res.ok) throw new Error('Şifre yenileme e-postası şu an gönderilemiyor. Lütfen biraz sonra tekrar deneyin.');
  }

  // Sıfırlama bağlantısıyla gelen kullanıcının yeni şifresini kaydeder, ardından oturumu kapatır
  public async completePasswordRecovery(newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < HesapKatmani.MIN_PASSWORD_LENGTH) {
      throw new Error(`Yeni şifreniz en az ${HesapKatmani.MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    }
    // Aşama 339: sıfırlama bağlantısıyla gelende uygulama oturumu yok; hesabın türü giriş oturumundan okunur
    const kisi = this.oturumSifreKisi();
    try {
      const rolu = (await supabase.auth.getSession()).data?.session?.user?.app_metadata?.role;
      if (rolu) kisi.personel = rolu !== 'student' && rolu !== 'applicant';
    } catch {
      /* okunamadı: oturumdaki bilgi geçerli */
    }
    const kuralHata = sifreSorunu(newPassword, kisi); // Aşama 145
    if (kuralHata) throw new Error(kuralHata);
    const baglantiHata = await passwordRecoveryLinkReady(); // Aşama 262: kendi bağlantımız doğrulanmış olmalı
    if (baglantiHata) throw new Error(baglantiHata);
    const { error } = await supabase.auth.updateUser({ password: newPassword, data: { must_change_password: false } });
    if (error) {
      throw new Error(translatePasswordError(error.message));
    }
    await markMyInitialPasswordChanged();
    clearPasswordRecovery();
    await supabase.auth.signOut().catch(() => {});
  }

  // --- CLOUD SYNCHRONIZATION FOR TEACHERS (DIRECT public.teachers TABLE) ---

  // Öğretmen satırını buluta yazar.
  //  - Yönetici: tüm alanlarla ekler/günceller.
  //  - Öğretmen: yalnızca KENDİ satırının ad, e-posta, branş ve fotoğrafını günceller
  //    (kullanıcı adı, rol, yetki ve hesap durumu yalnızca yönetici tarafından değiştirilebilir).
  protected async writeTeacherRow(teacher: Teacher): Promise<{ success: boolean; error?: any }> {
    try {
      // Aşama 18: kurum yöneticisi kendi kurumunun öğretmenini yalnızca günceller (yönetici yetkisi ve kurum değişmez)
      const me = this.getCurrentTeacher();
      if (this.isKurumAdmin() && (!me || me.id !== teacher.id)) {
        const { data, error } = await supabase
          .from('teachers')
          .update({
            name: teacher.name,
            username: teacher.username || null,
            email: teacher.email || null,
            branch: teacher.branch || null,
            avatar: teacher.avatar || null,
            status: teacher.status || 'approved',
            ...this.teacherGenderCol(teacher),
          })
          .eq('id', teacher.id)
          .select('id');
        if (error && this.retryWithoutTeacherGender(error)) return this.writeTeacherRow(teacher);
        if (error) return { success: false, error };
        if (!data || data.length === 0) {
          return { success: false, error: { code: '42501', message: 'Bu öğretmenin bilgilerini değiştirme yetkiniz yok' } };
        }
        return { success: true };
      }
      if (this.isHeadAdmin()) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const payload: any = {
          id: teacher.id,
          name: teacher.name,
          username: teacher.username || null,
          email: teacher.email || null,
          branch: teacher.branch || null,
          avatar: teacher.avatar || null,
          role: teacher.role || 'teacher',
          status: teacher.status || 'approved',
          is_admin: Boolean(teacher.isAdmin),
          created_at: teacher.createdAt || new Date().toISOString(),
          ...this.teacherGenderCol(teacher),
        };
        if (teacher.auth_user_id && uuidRegex.test(teacher.auth_user_id)) {
          payload.auth_user_id = teacher.auth_user_id;
        }
        const { error } = await supabase.from('teachers').upsert(payload);
        if (error && this.retryWithoutTeacherGender(error)) return this.writeTeacherRow(teacher);
        return error ? { success: false, error } : { success: true };
      }

      const session = this.getAuthSession();
      if (session?.role !== 'teacher' || session.user.id !== teacher.id) {
        return { success: false, error: { code: '42501', message: 'Başka bir öğretmenin bilgilerini değiştirme yetkiniz yok' } };
      }
      const { data, error } = await supabase
        .from('teachers')
        .update({
          name: teacher.name,
          email: teacher.email || null,
          branch: teacher.branch || null,
          avatar: teacher.avatar || null,
        })
        .eq('id', teacher.id)
        .select('id');
      if (error) return { success: false, error };
      if (!data || data.length === 0) {
        return { success: false, error: { code: '42501', message: 'Kayıt güncellenemedi (yetki yok)' } };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e };
    }
  }

  // Aşama 171: öğretmen cinsiyeti yalnız yönetici yollarında yazılır (öğretmenin kendi satırında değil)
  protected teacherGenderCol(teacher: Teacher): Record<string, unknown> {
    return BulutDepoKatmani.genderMissing.teachers ? {} : { gender: teacher.gender || null };
  }
  protected retryWithoutTeacherGender(error: any): boolean {
    if (BulutDepoKatmani.genderMissing.teachers || !isMissingGenderColumn(error)) return false;
    BulutDepoKatmani.genderMissing.teachers = true;
    return true;
  }

  // Aşama 173: sonuç döner. Yetki yoksa veritabanı hata vermeden 0 satır siler; o zaman kayıt hâlâ duruyor mu bakılır.
  public async deleteTeacherFromCloud(teacherId: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { data, error } = await supabase.from('teachers').delete().eq('id', teacherId).select('id');
      if (error) {
        console.warn('[TeacherSync] Error deleting teacher from public.teachers:', error.message);
        return { success: false, error };
      }
      if (Array.isArray(data) && data.length > 0) return { success: true };
      const still = await supabase.from('teachers').select('id').eq('id', teacherId).maybeSingle();
      if (still.error) return { success: false, error: still.error };
      if (still.data) return { success: false, error: { code: '42501', message: 'Bu öğretmeni silme yetkiniz yok.' } };
      return { success: true }; // bulutta zaten yok (yalnız yerel kopya)
    } catch (e: any) {
      console.warn('[TeacherSync] Exception deleting teacher from cloud:', e?.message || e);
      return { success: false, error: e };
    }
  }

  public async authenticateTeacher(usernameOrEmail: string, password: string): Promise<Teacher | null> {
    const term = usernameOrEmail.trim().toLowerCase();

    // Aday giriş adresleri: e-posta ile giriş, sistemin kullanıcı adından ürettiği adres
    const candidates: string[] = [];
    if (term.includes('@')) {
      candidates.push(term);
    } else {
      const folded = trLoginFold(usernameOrEmail); // Aşama 154
      candidates.push(canonicalAuthEmail('teacher', folded));
      candidates.push(canonicalAuthEmail('teacher', term));
      const known = this.teachers.find(
        (t) => (t.username || '').toLowerCase() === term || (!!folded && trLoginFold(t.username || '') === folded) || t.id.toLowerCase() === term
      );
      if (known?.email) candidates.push(known.email);
      if (known) candidates.push(canonicalAuthEmail('teacher', known.username || known.id));
      // Aşama 173: giriş ekranında öğretmen listesi boştur; gerçek e-postayla açılmış hesap kullanıcı adıyla
      // ancak bu cihazdaki "beni hatırla" kaydındaki gizli adresle bulunur (sunucuya soru yok, e-posta sızmaz).
      const rem = this.getRememberedUser('teacher');
      const remId = (rem?.identifier || '').trim();
      if (rem?.loginEmail && remId && (remId.toLowerCase() === term || trLoginFold(remId) === folded)) {
        candidates.unshift(rem.loginEmail); // önce gerçek adres: boşa giden istek olmaz
      }
      // Aşama 177: gerçek e-postalı TEK hesap genel yöneticidir (7 Kasım tanı CSV'si; create-user her zaman
      // …@okul.internal.net üretir). Adresi zaten ADMIN_EMAIL olarak bu dosyada açık durur, yeni bilgi sızmaz.
      // Beni hatırla kaydı olmayan cihazda da kullanıcı adıyla girilebilsin diye EN SONA eklenir:
      // önce sistem adresleri denenir, yalnız onlar tutmazsa bir istek daha gider.
      candidates.push(ADMIN_EMAIL);
      // Aşama 332 (HIZ): bu cihazda bu kullanıcı adıyla en son tutan adres önce denenir
      const ipucu = girisIpucuOku(folded || term);
      if (ipucu && candidates.includes(ipucu)) candidates.unshift(ipucu);
    }

    // Giriş YALNIZCA Supabase Auth üzerinden yapılır (yerel şifre / arka kapı yoktur).
    const signed = await signInWithCandidates(candidates, password, 'teacher');
    if (!signed) {
      console.warn('Supabase Auth: öğretmen girişi başarısız');
      await girisHatasiniBildir(usernameOrEmail, 'teacher'); // Aşama 339: kayıt; 5. hatada kilit mesajı fırlatır
      return null;
    }
    const authUser = signed.user;
    const kilitDenetimi = girisKilidiDenetle(signed.session); // Aşama 339: kaydın okunmasıyla aynı anda yürür
    // Aşama 332: ilk aday tutmadıysa tutan adres bu cihazda hatırlanır (yalnız sistem adresleri ve yönetici adresi)
    {
      const tutan = (authUser.email || '').trim().toLowerCase();
      if (!term.includes('@') && tutan && tutan !== candidates[0])
        girisIpucuYaz(trLoginFold(usernameOrEmail) || term, tutan, (a) => a === ADMIN_EMAIL || a.endsWith('@okul.internal.net'));
    }
    this.lastTeacherLoginEmail = (authUser.email || '').trim().toLowerCase(); // Aşama 155: beni hatırla gerçek giriş adresini saklar

    const appRole = authUser.app_metadata?.role;
    const isAppAdmin = appRole === 'admin' || authUser.app_metadata?.is_admin === true ||
      (authUser.email || '').trim().toLowerCase() === ADMIN_EMAIL;
    if (appRole !== 'teacher' && !isAppAdmin) {
      await supabase.auth.signOut({ scope: 'local' }); // Aşama 275: yalnız bu sekmedeki sınama oturumu kapanır
      throw new Error(
        appRole === 'student' || appRole === 'applicant'
          ? 'Bu bir öğrenci hesabıdır. Lütfen "Öğrenci Portalı" sekmesinden giriş yapınız.'
          : 'Bu hesabın öğretmen yetkisi bulunmuyor. Lütfen kurum yöneticinize başvurunuz.'
      );
    }

    // Veritabanındaki kendi öğretmen kaydını oku (durum ve yetki bilgisi buradan gelir)
    let row: any = null;
    try {
      const { data } = await supabase.from('teachers').select('*').eq('auth_user_id', authUser.id).maybeSingle();
      row = data || null;
    } catch {
      row = null;
    }

    let teacher = this.teachers.find(
      (t) =>
        (row && t.id === row.id) ||
        (t.auth_user_id && t.auth_user_id === authUser.id) ||
        (t.email && t.email.toLowerCase() === authUser.email?.toLowerCase())
    );

    if (row) {
      const fromRow: Teacher = {
        ...(teacher || ({} as Teacher)),
        id: row.id,
        auth_user_id: authUser.id,
        name: row.name || teacher?.name || authUser.user_metadata?.name || usernameOrEmail,
        username: row.username || teacher?.username || term,
        email: row.email || '',
        branch: row.branch || teacher?.branch || 'Öğretmen',
        avatar: row.avatar || teacher?.avatar,
        gender: normGender(row.gender) ?? teacher?.gender,
        createdAt: row.created_at || teacher?.createdAt || authUser.created_at,
        role: 'teacher',
        status: row.status || 'approved',
        isSuspended: row.status === 'suspended',
        isAdmin: isAppAdmin,
      };
      teacher = fromRow;
      const idx = this.teachers.findIndex((t) => t.id === fromRow.id);
      if (idx === -1) this.teachers.push(fromRow);
      else this.teachers[idx] = fromRow;
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    } else if (!teacher) {
      if (!isAppAdmin) {
        await supabase.auth.signOut({ scope: 'local' }); // Aşama 275: yalnız bu sekmedeki sınama oturumu kapanır
        throw new Error('Öğretmen kaydınız bulunamadı. Lütfen kurum yöneticinize başvurunuz.');
      }
      teacher = {
        id: authUser.user_metadata?.legacy_id || authUser.id,
        auth_user_id: authUser.id,
        name: authUser.user_metadata?.name || usernameOrEmail,
        username: term,
        email: authUser.email || '',
        branch: 'Kurum Yöneticisi',
        createdAt: authUser.created_at,
        role: 'teacher',
        status: 'approved',
        isAdmin: true,
      };
      this.teachers.push(teacher);
    } else {
      teacher.auth_user_id = teacher.auth_user_id || authUser.id;
      teacher.isAdmin = isAppAdmin;
    }

    if (teacher.isSuspended || teacher.status === 'suspended') {
      await supabase.auth.signOut({ scope: 'local' }); // Aşama 275: yalnız bu sekmedeki sınama oturumu kapanır
      throw new Error('Hesabınız askıya alınmıştır. Lütfen kurum yöneticiniz ile iletişime geçiniz.');
    }
    if (teacher.status === 'pending' || teacher.status === 'rejected') {
      await supabase.auth.signOut({ scope: 'local' }); // Aşama 275: yalnız bu sekmedeki sınama oturumu kapanır
      throw new Error('Hesabınız henüz kurum yöneticisi tarafından onaylanmamıştır. Lütfen kurum yöneticinize başvurunuz.');
    }

    // Aşama 339: hesap hatalı girişlerle kilitliyse şifre doğru olsa da oturum açılmaz
    await girisKilidiniUygula(kilitDenetimi);

    // Aşama 103: kilit anahtarı şifreden üretilir, aynı hesabın kilitli önbelleği açılır (ilk eşitleme bunu bekler)
    this.secureDisabled = false;
    this.secureRestore = unlockSecureCache(authUser.id, password)
      .then((p) => this.applySecurePayload(p))
      .catch(() => {});

    return teacher;
  }

  public async authenticateStudent(identifier: string, password: string): Promise<Student | null> {
    const term = identifier.trim().toLowerCase();

    // Aday giriş adresleri: öğrenci numarası (asıl giriş adı), e-posta, bu cihazda bilinen kayıt
    const candidates: string[] = [];
    if (term.includes('@')) {
      candidates.push(term);
    } else {
      const folded = trLoginFold(identifier); // Aşama 154
      candidates.push(canonicalAuthEmail('student', folded));
      candidates.push(canonicalAuthEmail('student', term));
      const known = this.students.find(
        (s) =>
          s.studentNumber?.toLowerCase() === term ||
          (s.username || '').toLowerCase() === term ||
          (!!folded && trLoginFold(s.username || '') === folded) ||
          s.id.toLowerCase() === term
      );
      if (known?.studentNumber) candidates.push(canonicalAuthEmail('student', known.studentNumber));
    }

    const signed = await signInWithCandidates(candidates, password, 'student');
    if (!signed) {
      console.warn('Supabase Auth: öğrenci girişi başarısız');
      await girisHatasiniBildir(identifier, 'student'); // Aşama 339: kayıt; 5. hatada kilit mesajı fırlatır
      return null;
    }
    const kilitDenetimi = girisKilidiDenetle(signed.session); // Aşama 339
    this.stopSecureCache(); // Aşama 103: öğrenci hesabında cihaz önbelleği tutulmaz; önceki hesabın kaydı silinir
    const authUser = signed.user;
    const appRole = authUser.app_metadata?.role;

    if (appRole === 'applicant') {
      await supabase.auth.signOut({ scope: 'local' }); // Aşama 275: yalnız bu sekmedeki sınama oturumu kapanır
      throw new Error('Kayıt başvurunuz henüz onaylanmadı. Yönetici onayladıktan sonra giriş yapabilirsiniz.');
    }
    if (appRole !== 'student') {
      await supabase.auth.signOut({ scope: 'local' }); // Aşama 275: yalnız bu sekmedeki sınama oturumu kapanır
      throw new Error('Bu bir öğretmen/yönetici hesabıdır. Lütfen "Öğretmen" sekmesinden giriş yapınız.');
    }

    // Aşama 252: öğrenci kaydından oturum bilgisi ortak yöntemle kurulur (kullanıcı gözüyle bakışta da kullanılır)
    try {
      const oturum = await this.ogrenciOturumu(authUser);
      await girisKilidiniUygula(kilitDenetimi); // Aşama 339: kayıt okunurken denetlendi; kilitliyse oturum kapanır
      return oturum;
    } catch (e) {
      await supabase.auth.signOut({ scope: 'local' }); // Aşama 275: yalnız bu sekmedeki sınama oturumu kapanır
      throw e;
    }
  }

  /** Aşama 252: giriş hesabından öğrencinin oturum kaydını kurar (kayıt yoksa ya da askıdaysa hata verir).
   *  Öğrenci girişi ve sistem sahibinin "kullanıcı gözüyle bak" geçişi aynı yolu kullanır. */
  public async ogrenciOturumu(authUser: { id: string; user_metadata?: any }): Promise<Student> {
    // Öğrencinin kendi kaydını veritabanından oku (sınıf, numara, durum güncel gelir)
    // Aşama 85: iletişim bilgisi korumalı tablodan (sql/85); SQL çalıştırılmadıysa eski yol
    let first = await supabase
      .from('students')
      .select(BulutDepoKatmani.STUDENT_SAFE_COLUMNS)
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    if (first.error && isMissingGenderColumn(first.error)) {
      BulutDepoKatmani.genderMissing.students = true; // Aşama 171
      first = await supabase.from('students').select(BulutDepoKatmani.STUDENT_SAFE_COLUMNS).eq('auth_user_id', authUser.id).maybeSingle();
    }
    let row: any = first.data;
    const rowError = first.error;
    if (row && !rowError) {
      const own = await supabase.from('student_contacts').select('email,phone').eq('id', (row as any).id).maybeSingle();
      if (!own.error) {
        BulutDepoKatmani.contactsMode = 'table';
        this.contactKnown.add((row as any).id);
        row = { ...(row as any), email: own.data?.email || null, phone: own.data?.phone || null };
      } else if (isMissingTable(own.error)) {
        BulutDepoKatmani.contactsMode = 'legacy';
        const legacy = await supabase.from('students').select('email,phone').eq('id', (row as any).id).maybeSingle();
        if (!legacy.error && legacy.data) row = { ...(row as any), ...(legacy.data as any) };
      }
    }

    if (rowError || !row) {
      throw new Error(
        rowError
          ? 'Öğrenci bilgileriniz okunamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyiniz.'
          : 'Öğrenci kaydınız bulunamadı. Lütfen öğretmeninize veya okul yöneticinize başvurunuz.'
      );
    }
    if (row.status === 'mezun') throw new Error(MEZUN_MESAJI); // Aşama 350 (kanca kurulu değilse de giriş durur)
    if (row.status === 'suspended') {
      throw new Error('Hesabınız askıya alınmıştır. Lütfen öğretmeninize veya okul yöneticinize başvurunuz.');
    }

    const local = this.students.find((s) => s.id === row.id);
    const cls = this.classes.find((c) => c.id === row.class_id);
    const student: Student = {
      ...(local || ({} as Student)),
      id: row.id,
      auth_user_id: authUser.id,
      name: row.name,
      username: row.student_number || local?.username || row.id,
      studentNumber: row.student_number || '',
      email: cleanStudentEmail(row.email),
      phone: row.phone || '',
      avatar: row.avatar || local?.avatar || undefined,
      gender: normGender(row.gender) ?? local?.gender,
      classId: row.class_id || 'class-default',
      className: row.class_name || 'Atanmadı',
      schoolLevel: cls?.schoolLevel || local?.schoolLevel || detectSchoolLevelFromGrade(row.class_name) || 'Ortaokul',
      gradeLevel: cls?.gradeLevel || local?.gradeLevel,
      branch: cls?.branch || local?.branch,
      createdAt: row.registered_at || local?.createdAt || new Date().toISOString(),
      status: 'active',
      isSuspended: false,
      password: undefined,
      mustChangePassword: authUser.user_metadata?.must_change_password === true,
    };

    const idx = this.students.findIndex((s) => s.id === student.id);
    if (idx === -1) this.students.push(student);
    else this.students[idx] = student;
    saveData(STORAGE_KEYS.STUDENTS, this.students);

    return student;
  }

  /**
   * Aşama 290: elle = kullanıcı "Çıkış yap"a bastı. O zaman bu cihazın telefon bildirimi de kapatılır; yoksa ortak
   * bilgisayarda çıkış yapan kişinin bildirimleri sonraki kullanıcıya görünmeye devam eder. Hareketsizlikten ya da
   * süresi dolan oturumdan çıkışta abonelik durur (kişinin kendi telefonu boşta kalınca bildirimleri kesilmesin).
   */
  public logout(elle = false): void {
    // Aşama 343: bekleyen kayıtlar bu oturuma aittir; çıkıştan sonra başka hesapla gönderilmesin diye kutu boşaltılır
    // (elle çıkışta kullanıcıya önceden sorulur, hareketsizlik çıkışı bekleyen kayıt varken yapılmaz)
    this.gidenKutusu = [];
    if (this.gidenZamanlayici) {
      clearTimeout(this.gidenZamanlayici);
      this.gidenZamanlayici = null;
    }
    this.gidenBildir();
    // Aşama 344: elle çıkışta yarım kalan form taslakları da silinir (boşta kalıp kapanan oturumda kalır, aynı hesapla
    // girilince geri yüklenebilir)
    if (elle) taslaklariSil();
    this.unsubscribeAllRealtime();
    this.myTeacherAccess = { classIds: new Set(), studentIds: new Set(), loaded: false };
    this.myKurum = { ...EMPTY_KURUM_STATE };
    this.myKurumRaw = this.myKurum; // Aşama 243
    this.portalSecim = null;
    this.portalAktif = null;
    this.portalDersSiniflari = new Set();
    this.dersErisim = { kurumId: null, program: false, yonetici: false, at: 0 }; // Aşama 234
    try {
      sessionStorage.removeItem(KurumYetkiKatmani.DERS_ERISIM_KEY);
    } catch {}
    this.studentBrand = { name: '', logo: '' };
    setKurumBrand(null);
    resetOgrBolum(); // Aşama 165
    try {
      sessionStorage.removeItem(MY_KURUM_KEY);
      sessionStorage.removeItem(PORTAL_KEY); // Aşama 243
      sessionStorage.removeItem(KurumYetkiKatmani.STUDENT_BRAND_KEY);
    } catch {}
    this.questionLogsFrom = null;
    this.questionLogsLoadedAt = 0;
    this.submissionsSyncedAt = '';
    this.submissionsFullAt = 0;
    this.backgroundSyncedAt = new Map();
    this.questionHistoryLoaded = new Set();
    this.questionLoadPromises = new Map();
    this.pendingApplicationCount = 0;
    this.basitSifreId = null; // Aşama 145
    // Uygulama oturumu kapanınca Supabase oturumu da kapansın.
    // Aşama 275: çıkış (elle ya da hareketsizlikten) YALNIZ bu sekmedeki oturumu kapatır. Eskiden kapsam verilmediği için
    // kişinin bütün cihazlarındaki oturumlar düşüyordu (telefon boşta kalınca bilgisayardaki oturum da kapanıyordu).
    // Şifre değişiminde bütün cihazlardan çıkış aynen sürer (changeOwnPassword).
    // Aşama 290: abonelik silme isteği oturum anahtarıyla gider; bu yüzden oturum ondan SONRA kapanır (en çok 4 sn beklenir)
    acikKalCikis(elle); // Aşama 295: "bu cihazda açık kal" oturumu çıkışta cihazdan da silinir (332: geçişte elle çıkışta da)
    const oturumuKapat = () => supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    if (elle) void Promise.race([disablePush(), new Promise((r) => setTimeout(r, 4000))]).then(oturumuKapat, oturumuKapat);
    else void oturumuKapat();
    this.setAuthSession(null);
    try {
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      sessionStorage.removeItem('edu_sys_last_activity_ts');
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {}
    this.clearUserDataAfterLogout();
    this.notify();
  }

  // Aşama 97: hesap değiştirmeden (kurumlar arası geçiş) önce: anlık kanallar kapanır, bu sekmedeki veriler silinir ve
  // sayfa yenilenene kadar yeni yazma yapılmaz. Supabase oturumu burada kapatılmaz (geçişi çağıran yönetir).
  public prepareAccountSwitch(): void {
    this.stopSecureCache();
    this.unsubscribeAllRealtime();
    if (this.rtFlushTimer) clearTimeout(this.rtFlushTimer);
    this.rtFlushTimer = null;
    clearSessionAppData();
    // Aşama 104: kurum bilgisi ve öğrenci markası önbelleği de silinir; yoksa yenilenen sayfa ilk anda önceki hesabın
    // kurum bilgisiyle açılıyordu (kuruma geçen genel yönetici, Kullanıcılar listesinde kurum öğretmenlerini göremiyordu)
    try {
      sessionStorage.removeItem(MY_KURUM_KEY);
      sessionStorage.removeItem(PORTAL_KEY); // Aşama 243
      sessionStorage.removeItem(KurumYetkiKatmani.STUDENT_BRAND_KEY);
    } catch {}
    purgePersistentPersonalData();
    clearSignedUrlCache();
    freezeAppStorage();
  }

  // Gizlilik: çıkışta bu sekmedeki tüm kişisel veriler bellekten ve tarayıcıdan silinir.
  // Aynı bilgisayarda sonra giriş yapan kişi önceki kullanıcının verilerini göremez.
  protected clearUserDataAfterLogout(): void {
    this.stopSecureCache();
    clearSessionAppData();
    purgePersistentPersonalData();
    clearSignedUrlCache();
    // Aşama 88: bekleyen anlık değişiklikler ve artımlı eşitleme işaretleri de silinir
    if (this.rtFlushTimer) clearTimeout(this.rtFlushTimer);
    this.rtFlushTimer = null;
    this.rtQueue = { messages: [], grades: [], attendance: [] };
    this.deltaState.clear();
    this.rawRows.clear(); // Aşama 193
    this.deltaReady = null;
    this.students = [];
    this.classes = [];
    this.teachers = [];
    this.homeworks = [];
    this.submissions = [];
    this.etuts = [];
    this.etutYoklama.clear(); // Aşama 179
    this.attendance = [];
    this.grades = [];
    this.messages = [];
    this.documents = [];
    this.studentNotifications = [];
    this.sentEmails = [];
    this.questionLogs = [];
    this.weeklyQuestionTargets = [];
    this.deletedTeacherIds = new Set();
    this.deletedStudentIds = new Set();
    this.deletedClassIds = new Set();
    this.deletedHomeworkIds = new Set();
    this.deletedEtutIds = new Set();
    this.deletedQuestionLogIds = new Set();
    this.documentDetailCache.clear();
    this.currentAuthUid = null;
    this.lastFullSyncAt = 0;
  }

  // --- BENİ HATIRLA / KOLAY GİRİŞ ---
  // Aşama 301: kod hatirla.ts'e taşındı (davranış aynı); burada yalnız canlı öğretmen / öğrenci listeleri verilir
  public getRememberedUser(role?: UserRole): HatirlananKisi | null {
    return hatirlananKisiOku(role, this.teachers, this.students);
  }

  public getRememberedTeacher() {
    return this.getRememberedUser('teacher');
  }

  public getRememberedStudent() {
    return this.getRememberedUser('student');
  }

  public setRememberedUser(data: HatirlananKisi | null, targetRole?: UserRole): void {
    hatirlananKisiYaz(data, targetRole);
  }

  // =========================================================================
  // ÖĞRENCİ KAYIT BAŞVURULARI
  // =========================================================================
  protected pendingApplicationCount = 0;

  // Belgenin ağır içeriği (Word önizlemesi, Excel tabloları, eski gömülü dosya) yalnız açılınca yüklenir
  protected documentDetailCache = new Map<string, Pick<TeacherDocument, 'htmlPreview' | 'tableSheets' | 'fileData'>>();
}
