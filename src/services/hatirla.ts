import type { Student, Teacher, UserRole } from '../types';
import { STORAGE_KEYS, appStorage, getLocalDeviceId, loadData, saveData } from './depo';

// ============================================================================
// Aşama 301: "BENİ HATIRLA" (veri servisinden ayrıldı, ayırmanın 3. parçası)
// Giriş ekranında bu cihazda en son giren öğretmen / öğrencinin kullanıcı adı, adı ve resmi. Şifre ASLA saklanmaz.
// Kayıt yalnız bu cihazın kimliğiyle geçerlidir (başka cihaza kopyalanan kayıt yok sayılır ve silinir).
// Kod dataService.ts'ten kelimesi kelimesine taşındı; davranış aynıdır. Yalnız, eskiden beş yerde tekrar yazılan
// kayıt biçimi tek bir tür (HatirlananKisi) oldu ve canlı öğretmen / öğrenci listeleri parametre olarak gelir.
// ============================================================================

// Bu dosyada "localStorage" adı depodaki yönlendiriciyi ifade eder (veri servisinde olduğu gibi)
const localStorage = appStorage;

export interface HatirlananKisi {
  role: UserRole;
  identifier: string;
  name: string;
  avatar?: string;
  branch?: string;
  className?: string;
  savedPassword?: string;
  deviceId?: string;
  loginEmail?: string; // Aşama 173: gerçek giriş e-postası (yalnız bu cihazda, kutuda görünmez)
}

/** Hatırlanan kişi (rol verilirse o rolün kaydı). Kişi canlı listelerdeyse güncel ad / resim kullanılır. */
export function hatirlananKisiOku(role: UserRole | undefined, ogretmenler: Teacher[], ogrenciler: Student[]): HatirlananKisi | null {
  const currentDeviceId = getLocalDeviceId();
  let saved: HatirlananKisi | null = null;

  if (role === 'teacher') {
    saved = loadData(STORAGE_KEYS.REMEMBER_ME_TEACHER, null);
    if (!saved) {
      const general = loadData<HatirlananKisi | null>(STORAGE_KEYS.REMEMBER_ME, null);
      if (general?.role === 'teacher') saved = general;
    }
  } else if (role === 'student') {
    saved = loadData(STORAGE_KEYS.REMEMBER_ME_STUDENT, null);
    if (!saved) {
      const general = loadData<HatirlananKisi | null>(STORAGE_KEYS.REMEMBER_ME, null);
      if (general?.role === 'student') saved = general;
    }
  } else {
    saved = loadData(STORAGE_KEYS.REMEMBER_ME, null);
    if (!saved) {
      saved = loadData(STORAGE_KEYS.REMEMBER_ME_TEACHER, null) || loadData(STORAGE_KEYS.REMEMBER_ME_STUDENT, null);
    }
  }

  if (!saved) return null;

  // Cihaz Bağımlılığı Kontrolü:
  // Eğer kaydedilen bilginin deviceId'si bu cihazın benzersiz ID'si ile eşleşmiyorsa
  // veya daha önce eski sistemden kalma sahte/otomatik atanmış veri ise, KESİNLİKLE null dönülür.
  // Böylece başka bilgisayar veya telefondan açıldığında Mustafa Bilir veya başka kullanıcı asla otomatik çıkmaz!
  if (!saved.deviceId || saved.deviceId !== currentDeviceId) {
    if (role === 'teacher') {
      try { localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_TEACHER); } catch {}
    } else if (role === 'student') {
      try { localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_STUDENT); } catch {}
    } else {
      try {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_TEACHER);
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_STUDENT);
      } catch {}
    }
    return null;
  }

  // Aşama 145: "Beni hatırla" düzeltmesi. Giriş ekranında öğretmen/öğrenci listeleri boştur (çıkışta silinir,
  // giriş yapılmadan bulut verisi gelmez). Eskiden kişi listede bulunamayınca kayıt yok sayılıyordu; artık
  // kaydedilen bilgiler kullanılır. Kişi listedeyse (ör. oturum açıkken) güncel ad/avatar gösterilir.
  // Eşleştirme yalnız kimlikle yapılır (aynı adlı başka kişinin bilgisi gelmesin).
  const key = (saved.identifier || '').toLowerCase();
  if (saved.role === 'teacher') {
    const liveTeacher = key
      ? ogretmenler.find(
          (t) =>
            (t.username && t.username.toLowerCase() === key) ||
            (t.email && t.email.toLowerCase() === key) ||
            t.id === saved!.identifier
        )
      : undefined;
    if (liveTeacher) {
      return {
        role: 'teacher',
        // Aşama 155: kayıtlı e-posta (gerçek giriş adresi) kullanıcı adıyla ezilmez
        identifier: saved.identifier.includes('@') ? saved.identifier : liveTeacher.username || saved.identifier,
        name: liveTeacher.name,
        avatar: liveTeacher.avatar,
        branch: liveTeacher.branch,
        deviceId: saved.deviceId,
        loginEmail: saved.loginEmail, // Aşama 173
      };
    }
  } else if (saved.role === 'student') {
    const liveStudent = key
      ? ogrenciler.find(
          (s) =>
            (s.studentNumber && s.studentNumber.toLowerCase() === key) ||
            (s.username && s.username.toLowerCase() === key) ||
            (s.email && s.email.toLowerCase() === key) ||
            s.id === saved!.identifier
        )
      : undefined;
    if (liveStudent) {
      return {
        role: 'student',
        identifier: liveStudent.studentNumber || liveStudent.username || saved.identifier,
        name: liveStudent.name,
        avatar: liveStudent.avatar,
        className: liveStudent.className,
        deviceId: saved.deviceId,
      };
    }
  }
  if (!saved.identifier) return null;
  const { savedPassword: _eskiKalinti, ...guvenli } = saved; // eski sürüm kalıntısı şifre alanı asla dönmez
  return guvenli;
}

/** Kişiyi hatırlar (data) ya da unutur (data = null; targetRole verilirse yalnız o rolün kaydı) */
export function hatirlananKisiYaz(data: HatirlananKisi | null, targetRole?: UserRole): void {
  if (data) {
    // GÜVENLİK: şifre asla tarayıcıya kaydedilmez; yalnızca kullanıcı adı ve görünen bilgiler hatırlanır
    const { savedPassword: _neverStored, ...safeData } = data;
    const payload = {
      ...safeData,
      deviceId: getLocalDeviceId(),
    };
    saveData(STORAGE_KEYS.REMEMBER_ME, payload);
    if (data.role === 'teacher') {
      saveData(STORAGE_KEYS.REMEMBER_ME_TEACHER, payload);
    } else if (data.role === 'student') {
      saveData(STORAGE_KEYS.REMEMBER_ME_STUDENT, payload);
    }
  } else {
    if (targetRole === 'teacher') {
      try {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_TEACHER);
        const general = loadData<any>(STORAGE_KEYS.REMEMBER_ME, null);
        if (general?.role === 'teacher') {
          const studentSaved = loadData<any>(STORAGE_KEYS.REMEMBER_ME_STUDENT, null);
          if (studentSaved) {
            saveData(STORAGE_KEYS.REMEMBER_ME, studentSaved);
          } else {
            localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
          }
        }
      } catch (e) {
        console.error(e);
      }
    } else if (targetRole === 'student') {
      try {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_STUDENT);
        const general = loadData<any>(STORAGE_KEYS.REMEMBER_ME, null);
        if (general?.role === 'student') {
          const teacherSaved = loadData<any>(STORAGE_KEYS.REMEMBER_ME_TEACHER, null);
          if (teacherSaved) {
            saveData(STORAGE_KEYS.REMEMBER_ME, teacherSaved);
          } else {
            localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
          }
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      try {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_TEACHER);
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_STUDENT);
      } catch (e) {
        console.error(e);
      }
    }
  }
}
