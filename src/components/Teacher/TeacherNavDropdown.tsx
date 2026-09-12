import React, { useState, useRef, useEffect } from 'react';
import {
  Users,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  MessageSquare,
  FolderArchive,
  ChevronDown,
  Check,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import { Teacher, UserRole } from '../../types';
import { dataService } from '../../services/dataService';

export type TeacherTabType =
  | 'home'
  | 'students'
  | 'homework'
  | 'etuts'
  | 'grades'
  | 'messages'
  | 'archive';

interface TeacherNavDropdownProps {
  activeTab: TeacherTabType;
  onSelectTab: (tab: TeacherTabType) => void;
  unreadMessagesCount: number;
  documentsCount: number;
  teacher?: Teacher | null;
  role?: UserRole;
  onRoleSwitch?: (role: UserRole) => void;
}

interface NavItemConfig {
  id: TeacherTabType;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'students',
    title: 'Öğrenci & Sınıf Yönetimi',
    icon: Users,
    accentColor: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
  },
  {
    id: 'homework',
    title: 'Kazanım Odaklı Ödev Çizelgesi',
    icon: BookOpen,
    accentColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  },
  {
    id: 'etuts',
    title: 'Etüt & Birebir Takip',
    icon: CalendarDays,
    accentColor: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30',
  },
  {
    id: 'grades',
    title: 'Ders Notları & Devamsızlık',
    icon: FileSpreadsheet,
    accentColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  },
  {
    id: 'messages',
    title: 'Öğrenci Soruları & Mesajlaşma',
    icon: MessageSquare,
    accentColor: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
  },
  {
    id: 'archive',
    title: 'Plan & Zümre Arşivi',
    icon: FolderArchive,
    accentColor: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
  },
];

export const TeacherNavDropdown: React.FC<TeacherNavDropdownProps> = ({
  activeTab,
  onSelectTab,
  unreadMessagesCount,
  documentsCount,
  role = 'teacher',
  onRoleSwitch,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const activeItem = NAV_ITEMS.find((item) => item.id === activeTab) || NAV_ITEMS[0];
  const ActiveIcon = activeItem.icon;

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (tab: TeacherTabType) => {
    onSelectTab(tab);
    setIsOpen(false);
  };

  return (
    /* Tek Duvar İçinde: Üstte Öğretmen Paneli - Öğrenci Paneli, Altına Sağ Tarafta Öğretmen Çalışma Modülü Butonu */
    <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl shadow-xl w-full">
      {/* 1. Üst Kısım: Öğretmen Paneli - Öğrenci Paneli Seçici Butonları */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-800/80">
        <div className="flex items-center space-x-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/90 w-fit">
          <button
            type="button"
            onClick={() => onRoleSwitch && onRoleSwitch('teacher')}
            id="wall-role-teacher-btn"
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              role === 'teacher'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-indigo-200" />
            <span>Öğretmen Paneli</span>
          </button>

          <button
            type="button"
            onClick={() => onRoleSwitch && onRoleSwitch('student')}
            id="wall-role-student-btn"
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              role === 'student'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-300" />
            <span>Öğrenci Paneli</span>
          </button>
        </div>

        {/* Aktif Modül İpucu */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium text-slate-300">
            Mevcut Alan: <strong className="text-white font-bold">{activeItem.title}</strong>
          </span>
        </div>
      </div>

      {/* 2. Alt Kısım: Sağ Tarafta Öğretmen Çalışma Modülü Butonu */}
      <div className="pt-3.5 flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-slate-400 flex items-center space-x-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-medium">Hızlı modül geçişi için butonu kullanabilirsiniz:</span>
        </div>

        {/* Altına Sağ Tarafa: Öğretmen Çalışma Modülleri Açılır Butonu */}
        <div ref={dropdownRef} className="relative ml-auto">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-haspopup="true"
            id="teacher-module-dropdown-button"
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between space-x-3 transition-all duration-200 cursor-pointer ${
              isOpen
                ? 'bg-indigo-600 border-2 border-indigo-400 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-indigo-600 border-2 border-indigo-200 text-white animate-beacon hover:brightness-110 shadow-md'
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              {/* Yanıp sönen ışık göstergesi */}
              {isOpen ? (
                <span className="h-2.5 w-2.5 rounded-full bg-white/70 shrink-0 inline-block" />
              ) : (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-90"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]"></span>
                </span>
              )}

              <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <ActiveIcon className="w-3.5 h-3.5 text-white" />
              </div>

              <span className="tracking-wide">
                Öğretmen Çalışma Modülleri: <span className="underline underline-offset-2 ml-1">{activeItem.title}</span>
              </span>

              {activeItem.id === 'messages' && unreadMessagesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-extrabold">
                  {unreadMessagesCount}
                </span>
              )}
              {activeItem.id === 'archive' && documentsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-purple-500 text-white text-[10px] font-extrabold">
                  {documentsCount}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1.5 shrink-0 pl-1.5">
              <ChevronDown
                className={`w-4 h-4 text-white/90 transition-transform duration-200 shrink-0 ${
                  isOpen ? 'rotate-180 text-white' : ''
                }`}
              />
            </div>
          </button>

          {/* Dropdown Menu - Aligned to Right under the button */}
          {isOpen && (
            <div
              role="menu"
              className="absolute z-50 right-0 w-80 sm:w-88 mt-2 bg-slate-950 border border-slate-700/90 rounded-2xl shadow-2xl p-2.5 backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <div className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between mb-1.5">
                <span>Öğretmen Çalışma Modülleri</span>
                <span className="text-[10px] text-indigo-400 font-semibold">6 Modül</span>
              </div>

              <div className="space-y-1">
                {NAV_ITEMS.map((item, index) => {
                  const ItemIcon = item.icon;
                  const isSelected = item.id === activeTab;

                  return (
                    <button
                      key={item.id}
                      role="menuitem"
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between group cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-500/50 shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-slate-850 hover:bg-slate-800/80 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className="text-[11px] font-mono text-slate-500 font-bold w-3 text-center">
                          {index + 1}
                        </span>
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${item.accentColor}`}
                        >
                          <ItemIcon className="w-3.5 h-3.5" />
                        </div>
                        <span className="truncate">{item.title}</span>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                        {item.id === 'messages' && unreadMessagesCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                            {unreadMessagesCount} Soru
                          </span>
                        )}
                        {item.id === 'archive' && documentsCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[10px] font-bold">
                            {documentsCount}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="w-4 h-4 text-indigo-400 font-black shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
