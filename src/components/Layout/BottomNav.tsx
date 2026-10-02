import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Search, LogOut, X, Home, BookOpen, CalendarDays, HelpCircle, Award } from 'lucide-react';
import type { TeacherTabType } from '../../types';
import { teacherNavFor, BOTTOM_NAV_PRIMARY, findTeacherNav } from './navItems';
import { IconBox, cx } from '../ui/kit';
import { openCommandPalette } from './CommandPalette';

// Telefon için alt menü (yalnızca dar ekranlarda görünür)
export const TeacherBottomNav: React.FC<{
  activeTab: TeacherTabType;
  isAdmin: boolean;
  unreadMessages: number;
  onSelect: (tab: TeacherTabType) => void;
  onLogout: () => void;
}> = ({ activeTab, isAdmin, unreadMessages, onSelect, onLogout }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const all = teacherNavFor(isAdmin);
  const primary = BOTTOM_NAV_PRIMARY.map((id) => findTeacherNav(id)!).filter(Boolean);
  const more = all.filter((i) => !BOTTOM_NAV_PRIMARY.includes(i.id));
  const moreActive = more.some((i) => i.id === activeTab);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const pick = (tab: TeacherTabType) => {
    setMoreOpen(false);
    onSelect(tab);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <nav
        id="mobile-bottom-nav"
        aria-label="Alt menü"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-5 h-16">
          {primary.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                id={`bottom-nav-${item.id}`}
                onClick={() => pick(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex flex-col items-center justify-center gap-1 text-[11px] font-semibold cursor-pointer transition-colors',
                  active ? 'text-brand-fg' : 'text-muted hover:text-fg'
                )}
              >
                <span className={cx('flex items-center justify-center w-12 h-7 rounded-full transition-colors', active && 'bg-brand-soft')}>
                  <Icon className="w-5 h-5" />
                </span>
                {item.title}
              </button>
            );
          })}
          <button
            type="button"
            id="bottom-nav-more"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={cx(
              'relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold cursor-pointer transition-colors',
              moreActive ? 'text-brand-fg' : 'text-muted hover:text-fg'
            )}
          >
            <span className={cx('relative flex items-center justify-center w-12 h-7 rounded-full', moreActive && 'bg-brand-soft')}>
              <MoreHorizontal className="w-5 h-5" />
              {unreadMessages > 0 && (
                <span className="absolute -top-1 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </span>
            Diğer
          </button>
        </div>
      </nav>

      {moreOpen &&
        createPortal(
          <div
            className="md:hidden fixed inset-0 z-[70] bg-slate-950/50 backdrop-blur-[2px] flex items-end"
            onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)}
          >
            <div
              id="bottom-nav-more-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Diğer bölümler"
              className="w-full bg-surface border-t border-line rounded-t-3xl shadow-pop p-3"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
            >
              <div className="flex items-center justify-between px-2 pt-1 pb-2">
                <span className="text-sm font-semibold text-fg">Diğer bölümler</span>
                <button type="button" onClick={() => setMoreOpen(false)} className="ui-btn ui-btn-ghost ui-btn-icon" aria-label="Kapat">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {more.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pick(item.id)}
                    className={cx(
                      'flex items-center gap-3 px-3 py-3 rounded-2xl text-left cursor-pointer',
                      item.id === activeTab ? 'bg-brand-soft' : 'hover:bg-surface-2'
                    )}
                  >
                    <IconBox icon={item.icon} tone={item.tone} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-fg">{item.title}</span>
                      <span className="block text-xs text-muted truncate">{item.description}</span>
                    </span>
                    {item.id === 'messages' && unreadMessages > 0 && (
                      <span className="ui-chip ui-chip-danger">{unreadMessages} yeni</span>
                    )}
                  </button>
                ))}
                <div className="ui-divider my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    openCommandPalette();
                  }}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-surface-2 cursor-pointer"
                >
                  <IconBox icon={Search} tone="neutral" size="sm" />
                  <span className="text-sm font-semibold text-fg">Hızlı Ara</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onLogout();
                  }}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-danger-soft cursor-pointer"
                >
                  <IconBox icon={LogOut} tone="danger" size="sm" />
                  <span className="text-sm font-semibold text-danger-fg">Çıkış Yap</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

// Öğrenci portalı için telefon alt menüsü
export type StudentBottomTab = 'home' | 'homework' | 'etuts' | 'questions' | 'grades' | 'messages';

const STUDENT_ITEMS: Array<{ id: StudentBottomTab; title: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', title: 'Ana Sayfa', icon: Home },
  { id: 'homework', title: 'Ödevler', icon: BookOpen },
  { id: 'etuts', title: 'Etütler', icon: CalendarDays },
  { id: 'questions', title: 'Sorular', icon: HelpCircle },
  { id: 'grades', title: 'Notlar', icon: Award },
];

export const StudentBottomNav: React.FC<{
  activeTab: string;
  onSelect: (tab: StudentBottomTab) => void;
  badges?: Partial<Record<StudentBottomTab, number>>;
}> = ({ activeTab, onSelect, badges = {} }) => (
  <nav
    id="student-mobile-bottom-nav"
    aria-label="Alt menü"
    className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line"
    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
  >
    <div className="grid grid-cols-5 h-16">
      {STUDENT_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeTab;
        const badge = badges[item.id] || 0;
        return (
          <button
            key={item.id}
            type="button"
            id={`student-bottom-nav-${item.id}`}
            onClick={() => {
              onSelect(item.id);
              window.scrollTo({ top: 0 });
            }}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex flex-col items-center justify-center gap-1 text-[11px] font-semibold cursor-pointer transition-colors',
              active ? 'text-brand-fg' : 'text-muted hover:text-fg'
            )}
          >
            <span className={cx('relative flex items-center justify-center w-12 h-7 rounded-full transition-colors', active && 'bg-brand-soft')}>
              <Icon className="w-5 h-5" />
              {badge > 0 && (
                <span className="absolute -top-1 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            {item.title}
          </button>
        );
      })}
    </div>
  </nav>
);
