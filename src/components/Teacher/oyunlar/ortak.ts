// Aşama 380: Oyunlar — ortak tanımlar (ders ve sınıf listeleri, varsayılan ders)
import { ALL_SUBJECTS, subjectsForBranch } from '../../../lib/subjects';
import { dataService } from '../../../services/dataService';
import { Brain, Castle, Disc3, Grid3x3, ListChecks, type LucideIcon } from 'lucide-react';
import type { OyunMod } from '../../../services/oyunOturumService';

/** Aşama 386: oyun türü simgesi (listede türler ilk bakışta ayrılsın) */
export const MOD_SIMGE: Record<OyunMod, LucideIcon> = { quiz: ListChecks, cark: Disc3, bulmaca: Grid3x3, hafiza: Brain, savunma: Castle };

/** Soru bankasında seçilebilen dersler (Rehberlik ve "Genel" soru dersi değildir) */
export const OYUN_DERSLERI = ALL_SUBJECTS.filter((d) => d !== 'Rehberlik' && d !== 'Genel');

/** Sınıf düzeyleri (kazanım bankası 5-8. sınıfı kapsar; lise için de 9-12 seçilebilir) */
export const OYUN_SINIFLARI = Array.from({ length: 12 }, (_, i) => i + 1);

/** Öğretmenin branşına uyan ders (yoksa boş: kişi seçer) */
export function varsayilanDers(): string {
  const dersler = subjectsForBranch(dataService.getCurrentTeacher()?.branch);
  return dersler.find((d) => OYUN_DERSLERI.includes(d)) || '';
}

export const tarihYaz = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
};
