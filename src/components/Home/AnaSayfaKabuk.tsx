import React, { useEffect, useRef } from 'react';
import { dataService } from '../../services/dataService';
import { teacherNavFor } from '../Layout/navItems';
import type { Teacher, TeacherTabType } from '../../types';
import './anaSayfaKabuk.css';
import './odakKabuk.css'; // Aşama 246

// ============================================================================
// Aşama 244: ANA SAYFA KABUĞU (yönetici ana sayfaları: sistem sahibi, kurum yöneticisi)
// Taslak "Koyu panel + kâğıt": solda yalnız simge menü (üzerine gelince hayalet etiket), ortada koyu panel, sağda kâğıt.
// Aşama 246: tema="odak" (müdür, müdür yrd., öğretmen): Odak renkleri, açık menü şeridi, koyu panel yok, içerik ortada (en çok 1240 px).
// Menü, üst menüyle AYNI listedir (teacherNavFor + canUseTab): kapalı bölüm burada da görünmez.
// Telefonda (900 px altı) sol menü gizlenir; alttaki menü çalışmaya devam eder.
// ============================================================================

const SERIF_ID = 'ak-serif-font';
const loadSerif = () => {
  try {
    if (document.getElementById(SERIF_ID)) return;
    const link = document.createElement('link');
    link.id = SERIF_ID;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap';
    document.head.appendChild(link);
  } catch {
    /* yazı tipi gelmezse başlık ve rakamlar Georgia ile görünür */
  }
};

/** Panelin arkasındaki silik halkalar (taslaktaki gibi) */
export const AkHalkalar: React.FC = () => (
  <svg className="rings" width="520" height="520" viewBox="0 0 520 520" fill="none" aria-hidden="true">
    {[250, 200, 150, 100].map((r) => (
      <circle key={r} cx="260" cy="260" r={r} stroke="#9fd8bd" />
    ))}
  </svg>
);

/** "Perşembe · 12 Kasım" (Türkiye saati) */
export const akTarih = (d = new Date()) => {
  const gun = d.toLocaleDateString('tr-TR', { weekday: 'long', timeZone: 'Europe/Istanbul' });
  const tarih = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' });
  return `${gun} · ${tarih}`;
};

/** "Günaydın" / "İyi günler" / "İyi akşamlar" ve "Mustafa Bey" (cinsiyet kayıtlı değilse yalnız ad) */
export const akSelam = (t?: Teacher | null) => {
  const saat = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' }));
  const selam = saat < 12 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar';
  const ad = (t?.name || '').trim().split(/\s+/)[0] || '';
  const hitap = t?.gender === 'E' ? ' Bey' : t?.gender === 'K' ? ' Hanım' : '';
  return { selam, ad: ad ? ad + hitap : '' };
};

/** Baş harfler (ör. "Bilir Koleji" → "BK") */
export const akBasHarf = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || '')
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('tr-TR');

interface Props {
  currentTeacher: Teacher | null;
  unreadMessages?: number;
  onNavigate: (tab: TeacherTabType) => void;
  /** Koyu panel (yönetici teması). Odak temasında kullanılmaz. */
  panelLabel?: string;
  panel?: React.ReactNode;
  /** 'yonetici' (vars.): kâğıt + koyu panel · 'odak': Odak renkleri, panelsiz */
  tema?: 'yonetici' | 'odak';
  /** Sayfaya özel ek sınıf (taslağa özgü küçük farklar için) */
  sinif?: string;
  children: React.ReactNode;
  /** Sağdan açılan iş paneli gibi kabuğun renklerini kullanan katmanlar */
  overlay?: React.ReactNode;
}

export const AnaSayfaKabuk: React.FC<Props> = ({ currentTeacher, unreadMessages = 0, onNavigate, panelLabel, panel, tema = 'yonetici', sinif, children, overlay }) => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(loadSerif, []);

  // Sol menü ve panel üst menünün hemen altında sabit durur: üst menünün yüksekliği ölçülür (kurum şeridi vb. dahil)
  useEffect(() => {
    const header = document.querySelector('header');
    const root = rootRef.current;
    if (!header || !root) return;
    const set = () => root.style.setProperty('--ak-top', `${Math.round(header.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const isAdmin = dataService.isTeacherAdmin(currentTeacher);
  const items = teacherNavFor((tab) => (tab === 'user_management' ? isAdmin && dataService.canUseTab(tab) : dataService.canUseTab(tab)));
  const home = items.find((i) => i.id === 'home');
  const yonetim = items.find((i) => i.id === 'user_management');
  const rest = items.filter((i) => i.id !== 'home' && i.id !== 'user_management');

  const link = (item: (typeof items)[number], current = false) => {
    const Icon = item.icon;
    const badge = item.id === 'messages' && unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : String(unreadMessages)) : '';
    return (
      <button
        key={item.id}
        type="button"
        aria-label={badge ? `${item.title} (${badge} okunmamış)` : item.title}
        aria-current={current ? 'page' : undefined}
        onClick={() => {
          if (current) return;
          onNavigate(item.id);
          window.scrollTo({ top: 0 });
        }}
      >
        <Icon />
        {badge && (
          <span className="badge tnum" aria-hidden="true">
            {badge}
          </span>
        )}
        <span className="tip" aria-hidden="true">
          {item.title}
        </span>
      </button>
    );
  };

  return (
    <div className={(tema === 'odak' ? 'ak ak-odak' : 'ak') + (sinif ? ' ' + sinif : '')} ref={rootRef} id="ana-sayfa-kabuk">
      {/* Aşama 250: şerit ve koyu panel sayfanın sonuna kadar uzanır; içerikleri ekranda sabit kalır (yarıda kesik görünmez) */}
      <nav className="ak-rail" aria-label="Bölümler">
        <div className="ak-rail-in">
          {home && link(home, true)}
          {yonetim && link(yonetim)}
          {rest.length > 0 && <span className="sep" aria-hidden="true" />}
          {rest.map((i) => link(i))}
        </div>
      </nav>
      {tema !== 'odak' && (
        <aside className="ak-panel" aria-label={panelLabel}>
          <div className="ak-panel-in">
            <AkHalkalar />
            {panel}
          </div>
        </aside>
      )}
      <main className="ak-main">{children}</main>
      {overlay}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sağdan açılan iş paneli (kabuğun içinde çizilir; Esc ve arka plana tıklama kapatır, odak geri döner)
// ---------------------------------------------------------------------------
export const AkSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  locked?: boolean; // iş sürerken kapanmasın
  kicker: string;
  title: string;
  desc?: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, locked, kicker, title, desc, footer, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('.x')?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      lastFocus.current?.focus?.();
    };
  }, [open, locked, onClose]);
  return (
    <>
      <div className={'ak-scrim' + (open ? ' on' : '')} onClick={() => !locked && onClose()} aria-hidden="true" />
      <div ref={ref} className={'ak-sheet' + (open ? ' on' : '')} role="dialog" aria-modal="true" aria-label={title} aria-hidden={!open}>
        <div className="sh-h">
          <div className="tt">
            <small>{kicker}</small>
            <h3>{title}</h3>
            {desc && <p>{desc}</p>}
          </div>
          <button type="button" className="x" aria-label="Kapat" onClick={onClose} disabled={locked}>
            ✕
          </button>
        </div>
        <div className="sh-b">{children}</div>
        <div className="sh-f">{footer}</div>
      </div>
    </>
  );
};
