import { Home, Users, BookOpen, CalendarDays, MessageSquare, FolderArchive, HelpCircle, ShieldCheck, ClipboardCheck, BarChart3, CalendarRange } from 'lucide-react';
import type { ComponentType } from 'react';
import type { TeacherTabType } from '../../types';
import type { Tone } from '../ui/kit';

// Öğretmen menüsü: üst menü, telefon alt menüsü ve hızlı arama aynı listeyi kullanır
export interface TeacherNavItem {
  id: TeacherTabType;
  title: string; // menüde görünen kısa ad
  description: string; // hızlı aramada ve sayfa başlığında açıklama
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  adminOnly?: boolean;
  keywords?: string; // hızlı arama için ek kelimeler
}

export const TEACHER_NAV: TeacherNavItem[] = [
  { id: 'home', title: 'Ana Sayfa', description: 'Bugünün özeti ve ajanda', icon: Home, tone: 'brand', keywords: 'bugün ajanda özet takvim' },
  { id: 'students', title: 'Öğrenciler', description: 'Öğrenci ve sınıf yönetimi', icon: Users, tone: 'brand', keywords: 'sınıf öğrenci ekle excel veli' },
  { id: 'homework', title: 'Ödevler', description: 'Ödev oluşturma ve kontrol', icon: BookOpen, tone: 'success', keywords: 'ödev kontrol teslim kazanım' },
  { id: 'etuts', title: 'Etütler', description: 'Etüt ve birebir çalışma takibi', icon: CalendarDays, tone: 'info', keywords: 'etüt birebir takvim yoklama' },
  { id: 'messages', title: 'Mesajlar', description: 'Öğrenci soruları ve mesajlaşma', icon: MessageSquare, tone: 'danger', keywords: 'mesaj soru cevap' },
  { id: 'archive', title: 'Arşiv', description: 'Plan ve zümre evrakları', icon: FolderArchive, tone: 'warning', keywords: 'evrak belge plan zümre yıllık' },
  // Aşama 17 (rapor Ö13): not ve devamsızlık girişi menüye bağlandı · Aşama 220: adı "Dersler" (program + yoklama + notlar)
  { id: 'grades', title: 'Dersler', description: 'Ders programı, yoklama ve notlar', icon: ClipboardCheck, tone: 'success', keywords: 'ders program yoklama saat not yazılı sınav puan devamsızlık' },
  { id: 'question_tracking', title: 'Soru Takibi', description: 'Çözülen soru sayıları ve analiz', icon: HelpCircle, tone: 'info', keywords: 'soru sayısı analiz hedef grafik' },
  // Aşama 47: yalnızca genel yönetici ve izinli kurum yöneticileri görür (dataService.canUseTab)
  // Aşama 242: yalnız "Akademik takvim" bölümü açık kurumda görünür (dataService.canUseTab)
  { id: 'akademik_takvim', title: 'Akademik Takvim', description: 'Yıllık öğrenci ve veli etkinlikleri', icon: CalendarRange, tone: 'brand', keywords: 'akademik takvim etkinlik yıllık gezi veli sergi excel' },
  { id: 'deneme', title: 'Deneme Analizi', description: 'Optik sonuçları, LGS puanı ve kazanım analizi', icon: BarChart3, tone: 'brand', keywords: 'deneme lgs optik txt fmt karne net puan kazanım' },
  {
    id: 'user_management',
    title: 'Yönetim',
    description: 'Kullanıcılar, yetkiler ve veri yedeği',
    icon: ShieldCheck,
    tone: 'warning',
    adminOnly: true,
    keywords: 'yönetici yetki kullanıcı öğretmen yedek başvuru',
  },
];

// Aşama 18: menü, kullanıcının erişebildiği sekmelere göre süzülür (kurum bölüm izinleri ve yönetim yetkisi).
// Eski kullanım (true/false) yönetici olup olmadığını belirtir.
export const teacherNavFor = (access: boolean | ((tab: TeacherTabType) => boolean)) =>
  TEACHER_NAV.filter((i) => (typeof access === 'function' ? access(i.id) : !i.adminOnly || access));

export const findTeacherNav = (id: TeacherTabType) => TEACHER_NAV.find((i) => i.id === id);

// Telefon alt menüsünde doğrudan görünenler (gerisi "Diğer" altında)
export const BOTTOM_NAV_PRIMARY: TeacherTabType[] = ['home', 'students', 'homework', 'etuts'];
