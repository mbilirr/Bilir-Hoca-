import { supabase } from './supabase';
import { dataService } from '../services/dataService';
import { updateKurumIdentity } from './kurumSettings';
import type { KurumModule } from '../types';

// ============================================================================
// Aşama 95: YENİ KURUM AÇMA SİHİRBAZI (yalnızca genel yönetici)
// Kurum, bir öğretmen kurum yöneticisi yapılınca veritabanında kendiliğinden açılır (Aşama 18). Sihirbaz bu
// bilinen ve denenmiş yolları sırayla çalıştırır; yeni SQL gerekmez:
//   1) yöneticinin giriş hesabı (createTeacherAccount)   2) yönetici yetkisi (set_role → kurum açılır)
//   3) açılan kurumun bulunması                          4) ad + bölümler (saveKurum)   5) logo (isteğe bağlı)
// 2. adım başarısız olursa açılan hesap silinir (yarım kayıt kalmaz). 4-5. adımda hata olursa kurum açılmış
// sayılır; eksik ayar "Kurumlar" bölümünden tamamlanır (sonuç ekranı bunu söyler).
// ============================================================================

export type KurumAcStep = 'hesap' | 'yetki' | 'kurum' | 'ayar' | 'logo';

export const KURUM_AC_STEPS: Record<KurumAcStep, string> = {
  hesap: 'Giriş hesabı açılıyor…',
  yetki: 'Yönetici yetkisi veriliyor…',
  kurum: 'Kurum kaydı bekleniyor…',
  ayar: 'Kurum adı ve bölümler kaydediliyor…',
  logo: 'Logo kaydediliyor…',
};

export interface KurumAcInput {
  kurumName: string;
  adminName: string;
  username: string;
  email: string;
  password: string;
  modules: Partial<Record<KurumModule, boolean>>;
  logo?: string; // data URL (imageFileToLogo)
}

export interface KurumAcResult {
  kurumId: string;
  teacherId: string;
  adminName: string;
  username: string;
  password: string;
  warnings: string[]; // kurum açıldı ama bir ayar kaydedilemedi
}

const norm = (s: string) => (s || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Aynı adda kurum var mı (büyük / küçük harf ve boşluk farkı sayılmaz) */
export async function kurumNameTaken(name: string): Promise<boolean> {
  const n = norm(name);
  const list = await dataService.listKurumlar();
  return list.some((k) => norm(k.name) === n);
}

/** Yönetici yapılan öğretmenin kurumunu bulur: önce kaydındaki kurum, olmazsa listeye yeni eklenen tek kurum */
async function findNewKurum(teacherId: string, before: Set<string>): Promise<string | null> {
  for (const delay of [0, 400, 900, 1800]) {
    if (delay) await wait(delay);
    const { data } = await supabase.from('teachers').select('kurum_id').eq('id', teacherId).maybeSingle();
    const id = (data as { kurum_id?: string | null } | null)?.kurum_id;
    if (id) return String(id);
    const fresh = (await dataService.listKurumlar()).filter((k) => !before.has(k.id));
    if (fresh.length === 1) return fresh[0].id;
  }
  return null;
}

export async function openKurum(input: KurumAcInput, onStep: (s: KurumAcStep) => void): Promise<KurumAcResult> {
  if (!dataService.isHeadAdmin()) throw new Error('Yeni kurumu yalnızca genel yönetici açabilir.');
  const kurumName = input.kurumName.trim().replace(/\s+/g, ' ');
  if (kurumName.length < 2) throw new Error('Kurum adı en az 2 karakter olmalıdır.');
  if (kurumName.length > 120) throw new Error('Kurum adı en çok 120 karakter olabilir.');
  if (!Object.values(input.modules).some(Boolean)) throw new Error('Kurum için en az bir bölüm seçin.');

  const existing = await dataService.listKurumlar();
  if (existing.some((k) => norm(k.name) === norm(kurumName))) throw new Error(`"${kurumName}" adında bir kurum zaten var.`);
  const before = new Set(existing.map((k) => k.id));

  // 1) giriş hesabı (ad, kullanıcı adı ve şifre denetimi burada yapılır)
  onStep('hesap');
  const { teacher, password } = await dataService.createTeacherAccount({
    name: input.adminName,
    username: input.username,
    email: input.email,
    branch: 'Kurum Yöneticisi',
    password: input.password,
  });

  // 2) yönetici yetkisi → kurum veritabanında açılır; olmazsa hesap geri alınır
  onStep('yetki');
  try {
    await dataService.adminChangeUserRole(teacher.id, 'admin');
  } catch (e: any) {
    await dataService.adminDeleteUser(teacher.id).catch(() => {});
    throw new Error(`Yönetici yetkisi verilemedi, açılan hesap geri alındı: ${e?.message || 'bilinmeyen hata'}`);
  }

  // 3) açılan kurum
  onStep('kurum');
  const kurumId = await findNewKurum(teacher.id, before);
  if (!kurumId) {
    throw new Error(
      `"${teacher.name}" kurum yöneticisi yapıldı ama kurum kaydı bulunamadı. "Kurumlar" listesini yenileyin; kurum görünürse adını ve bölümlerini oradan düzenleyin.`
    );
  }

  const warnings: string[] = [];
  // 4) ad + bölümler
  onStep('ayar');
  try {
    await dataService.saveKurum({ id: kurumId, name: kurumName, modules: input.modules, grantedClassIds: [] });
  } catch (e: any) {
    warnings.push(`Kurum adı ve bölümler kaydedilemedi (${e?.message || 'hata'}); "Kurumlar" bölümünden kaydedin.`);
  }
  // 5) logo
  if (input.logo) {
    onStep('logo');
    try {
      await updateKurumIdentity(kurumId, kurumName, input.logo);
    } catch (e: any) {
      warnings.push(`Logo kaydedilemedi (${e?.message || 'hata'}); "Kurum Ayarları" bölümünden yükleyin.`);
    }
  }
  // Yönetici listesinde yeni kurumun görünmesi için öğretmen kayıtları arka planda yenilenir
  void dataService.syncTeachersFromSupabase(true).catch(() => {});
  return { kurumId, teacherId: teacher.id, adminName: teacher.name, username: teacher.username || input.username, password, warnings };
}
