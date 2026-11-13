import React, { useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { teacherNavFor } from './navItems';
import type { Teacher, TeacherTabType } from '../../types';
import './solMenu.css';

// ============================================================================
// Aşama 260: SOL SİMGE MENÜ — her oturumun (öğretmen, idare, yönetici, öğrenci) her bölümünde aynı menü.
// Ana sayfalar kendi kabuğunda (AnaSayfaKabuk) aynı öğelerle çizer; diğer bütün sayfalarda bu bileşen ekranın solunda
// sabit durur. Yalnız simge; üzerine gelince ya da klavyeyle odaklanınca sağında yarı saydam cam etiket ("hayalet").
// Öğeler tek kaynaktan gelir (ogretmenMenuOgeleri / öğrenci listesi): kapalı bölüm hiçbir yerde görünmez.
// 900 px ve altında gizlenir; orada üst sıra (tablet) ve alt menü (telefon) çalışır.
// ============================================================================

/** Menü öğesi (ana sayfa kabuğu ve sol menü ortak). sep = öncesine ayraç */
export interface AkMenuOge {
  id: string;
  title: string;
  icon: React.ComponentType;
  badge?: number;
  current?: boolean;
  sep?: boolean;
  onClick: () => void;
}

/** Öğretmen / idare / yönetici menüsü: Ana sayfa, Yönetim, ayraç, diğer açık bölümler */
export function ogretmenMenuOgeleri(
  currentTeacher: Teacher | null,
  aktif: TeacherTabType,
  onNavigate: (tab: TeacherTabType) => void,
  unreadMessages = 0
): AkMenuOge[] {
  const isAdmin = dataService.isTeacherAdmin(currentTeacher);
  const items = teacherNavFor((tab) => (tab === 'user_management' ? isAdmin && dataService.canUseTab(tab) : dataService.canUseTab(tab)));
  const sirali = [...items.filter((i) => i.id === 'home'), ...items.filter((i) => i.id === 'user_management'), ...items.filter((i) => i.id !== 'home' && i.id !== 'user_management')];
  const ilkDiger = sirali.findIndex((i) => i.id !== 'home' && i.id !== 'user_management');
  return sirali.map((i, n) => ({
    id: i.id,
    title: i.title,
    icon: i.icon as React.ComponentType,
    badge: i.id === 'messages' ? unreadMessages : undefined,
    current: i.id === aktif,
    sep: n === ilkDiger && n > 0,
    onClick: () => {
      onNavigate(i.id);
      window.scrollTo({ top: 0 });
    },
  }));
}

/** Simge düğmeleri (rozet + hayalet etiket). Kabuk ve sol menü aynı çizimi kullanır */
export const SolMenuDugmeleri: React.FC<{ ogeler: AkMenuOge[]; idOnEk?: string }> = ({ ogeler, idOnEk = 'sol-menu' }) => (
  <>
    {ogeler.map((m) => {
      const Icon = m.icon;
      const badge = m.badge && m.badge > 0 ? (m.badge > 99 ? '99+' : String(m.badge)) : '';
      return (
        <React.Fragment key={m.id}>
          {m.sep && <span className="sep" aria-hidden="true" />}
          <button
            type="button"
            id={`${idOnEk}-${m.id}`}
            aria-label={badge ? `${m.title} (${badge} yeni)` : m.title}
            aria-current={m.current ? 'page' : undefined}
            onClick={() => {
              if (!m.current) m.onClick();
            }}
          >
            <Icon />
            {badge && (
              <span className="badge tnum" aria-hidden="true">
                {badge}
              </span>
            )}
            <span className="tip" aria-hidden="true">
              {m.title}
            </span>
          </button>
        </React.Fragment>
      );
    })}
  </>
);

/** Üst menünün yüksekliği (sol menü onun hemen altından başlar) */
function useUstMenuYuksekligi() {
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const set = () => document.documentElement.style.setProperty('--sol-menu-ust', `${Math.round(header.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
}

/** Ekranın solunda sabit simge menü (ana sayfa dışındaki bütün sayfalar) */
export const SolMenu: React.FC<{ ogeler: AkMenuOge[] }> = ({ ogeler }) => {
  useUstMenuYuksekligi();
  // içerik menünün sağından başlasın: sayfa kökü işaretlenir (yalnız 901 px ve üstünde etkili)
  useEffect(() => {
    document.documentElement.classList.add('sol-menu-var');
    return () => document.documentElement.classList.remove('sol-menu-var');
  }, []);
  if (ogeler.length === 0) return null;
  return (
    <nav className="sol-menu" aria-label="Bölümler" id="sol-menu">
      <div className="sol-menu-in">
        <SolMenuDugmeleri ogeler={ogeler} />
      </div>
    </nav>
  );
};

export default SolMenu;
