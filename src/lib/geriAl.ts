// ============================================================================
// Aşama 306: "GERİ AL"
// Basit kayıtlar silinince ya da öğrenci bilgisi düzenlenince ekranın altında 10 sn "Geri al" görünür:
//   not, soru kaydı, soru hedefi, haftalık plan görevi (tek öğrenci ya da sınıf; öğrencinin henüz görmediği),
//   deneme sonucundan öğrenci çıkarma, öğrenci bilgisi (ad, numara, sınıf, iletişim, veliler).
// İşlem HEMEN yapılır (her cihazda hemen görünür); "Geri al" eski hâli her zamanki kaydetme yoluyla (aynı yetki ve
// denetimlerle) yeniden yazar. Geri alınamayacak işler kapsam dışıdır ve onay penceresiyle korunur: e-posta/SMS giden
// (etüt iptali, veli duyurusu), hesap ya da dosya silen (öğrenci, öğretmen, ödev, belge), çok kayıt birden silen
// (deneme, plan temizleme), şifre ve TC değişikliği (eskisi okunamaz).
// Bu dosya her sayfada yüklenir (çubuk App'te); yalnız ana pakette zaten olan dataService'e dayanır. Ayrı paketteki
// bölümler (plan, deneme) geri alma işini kendi dosyalarında geriAlGoster ile verir.
// Aynı anda tek "Geri al" durur: yeni işlem bir öncekinin yerini alır.
// ============================================================================
import { useSyncExternalStore } from 'react';
import type { GradeRecord, Student, StudentQuestionLog, WeeklyQuestionTarget } from '../types';
import { dataService } from '../services/dataService';

export const GERI_AL_MS = 10_000;

export interface GeriAlKaydi {
  no: number;
  metin: string;
  geriAl: () => Promise<unknown>;
}

let aktif: GeriAlKaydi | null = null;
let sayac = 0;
const dinleyiciler = new Set<() => void>();
const duyur = () => dinleyiciler.forEach((d) => d());

/** Silme başarıyla bittikten sonra çağrılır */
export function geriAlGoster(metin: string, geriAl: () => Promise<unknown>): void {
  aktif = { no: ++sayac, metin, geriAl };
  duyur();
}

/** Yalnız o kayıt hâlâ gösteriliyorsa kapatır (arada yeni silme geldiyse ona dokunmaz) */
export function geriAlKapat(no: number): void {
  if (aktif?.no !== no) return;
  aktif = null;
  duyur();
}

export function useGeriAl(): GeriAlKaydi | null {
  return useSyncExternalStore(
    (d) => {
      dinleyiciler.add(d);
      return () => dinleyiciler.delete(d);
    },
    () => aktif,
    () => null,
  );
}

// ---------------------------------------------------------------- kapsamdaki kayıtlar
// Geri alma her zamanki kaydetme yoludur: aynı doğrulama, aynı yetki, diğer cihazlara anında gider.

/** Not: aynı içerikle yeniden yazılır (yeni kimlikle) */
export function notSilindi(g: GradeRecord): void {
  const { id: _id, ...veri } = g;
  geriAlGoster('Not silindi', () => dataService.addGrade(veri));
}

/** Soru kaydı: silinen kimlik bütün cihazlarda "silindi" listesinde kaldığı için YENİ kimlikle, aynı içerikle yazılır
 *  (o güne ait plan payları da kaydın içinde olduğundan birlikte döner). */
export function soruKaydiSilindi(log: StudentQuestionLog): void {
  const { id: _id, createdAt: _c, ...veri } = log;
  geriAlGoster('Soru kaydı silindi', () => dataService.saveQuestionLog(veri));
}

/** Soru hedefi: aynı kimlikle yeniden yazılır (hedeflerde silindi listesi yok) */
export function soruHedefiSilindi(t: WeeklyQuestionTarget): void {
  const kopya = { ...t };
  geriAlGoster('Soru hedefi silindi', () => dataService.saveQuestionTarget(kopya));
}


/** Öğrenci bilgisi düzenlemesi (ad, numara, sınıf, iletişim, veliler, cinsiyet, simge): YALNIZ değişen alanlar eski
 *  değerine döner. Şifre ve TC bu kapsamda değildir (ikisi de geri okunamaz); onlar değiştiyse çağıran sunmaz. */
const OGRENCI_ALANLARI = ['name', 'email', 'classId', 'studentNumber', 'phone', 'parents', 'avatar', 'gender'] as const;
export function ogrenciGuncellendi(eski: Student): void {
  const yeni = dataService.getAllStudents().find((s) => s.id === eski.id);
  if (!yeni) return;
  const geri: Partial<Student> = {};
  for (const k of OGRENCI_ALANLARI) {
    if (JSON.stringify(eski[k] ?? null) !== JSON.stringify(yeni[k] ?? null)) (geri as Record<string, unknown>)[k] = eski[k];
  }
  if (!Object.keys(geri).length) return;
  geriAlGoster(`${yeni.name} güncellendi`, () => dataService.updateStudent(eski.id, geri));
}
