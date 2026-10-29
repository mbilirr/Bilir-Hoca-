import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  Plus,
  Edit2,
  Trash2,
  CalendarCheck,
  Calendar as CalendarIcon,
  MessageCircle,
  CheckCircle2,
  Copy,
  Search,
  X,
  AlertCircle,
  LayoutGrid,
  List,
  Lock,
  Eye,
  ChevronDown,
} from 'lucide-react';
import { Etut, Student, ClassGroup } from '../../types';
import { createGoogleCalendarUrlForEtut, downloadIcsFile } from '../../lib/calendar';
import { isEtutAttendanceMissing } from '../../lib/etutTiming';
import { ETUT_STATUS_STYLE, etutTeacherNames, getEtutStatus, subjectDot } from '../../lib/etutStatus';
import { EtutStatusLegend } from './EtutStatusLegend';

// ============================================================================
// HAFTALIK PLAN (Aşama 28)
// Çok etüt girildiğinde sayfa aşağı uzamasın diye yeniden tasarlandı:
//  • "Hafta" görünümü: 7 gün yan yana, her etüt TEK KÜÇÜK satır; gün sütunu kendi içinde kayar.
//  • "Gün" görünümü: seçilen günün tüm etütleri geniş kartlarla (telefonda varsayılan).
//  • Etüde tıklayınca ayrıntı penceresi açılır (yoklama, bildir, düzenle, kopyala, sil…).
//  • Ders / öğretmen süzgeci Etütler sayfasındaki ortak süzgeç çubuğundan gelir; burada arama kutusu var.
//  • Renkler: Yaklaşan (mavi), Devam eden (sarı), Yapıldı (yeşil), Geçmiş (gri).
// ============================================================================

interface WeeklyEtutCalendarProps {
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
  onAddEtutForDate?: (dateStr: string) => void;
  onEditEtut?: (etut: Etut) => void;
  onCopyEtut?: (etut: Etut) => void;
  onDeleteEtut?: (etut: Etut) => void;
  onNotifyEtut?: (etut: Etut) => void;
  onAttendanceEtut?: (etut: Etut) => void;
  readOnly?: boolean;
  /** Aşama 111: etüdü düzenleyebilir mi (Rehberlik / Zümre başkasınınkini yalnız görür) */
  canEditEtut?: (etut: Etut) => boolean;
  /** Aşama 111: salt okunur yoklama / yorum penceresi */
  onViewEtut?: (etut: Etut) => void;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Farklı yazılmış tarihleri (2026-10-05, 5.10.2026, 05/10/2026…) YYYY-MM-DD yapar
function normalizeDateKey(raw: string): string {
  let dKey = String(raw || '').trim().split('T')[0].replace(/\//g, '-').replace(/\./g, '-');
  const parts = dKey.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) dKey = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    else if (parts[2].length === 4) dKey = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dKey;
}

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

// Dakikada bir güncellenen "şimdi": renkler (yaklaşan → devam ediyor → geçmiş) kendiliğinden değişir
function useNow(intervalMs = 60000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export const WeeklyEtutCalendar: React.FC<WeeklyEtutCalendarProps> = ({
  etuts,
  students,
  onAddEtutForDate,
  onEditEtut,
  onCopyEtut,
  onDeleteEtut,
  onNotifyEtut,
  onAttendanceEtut,
  readOnly = false,
  canEditEtut,
  onViewEtut,
}) => {
  const now = useNow();
  const todayKey = formatDateKey(now);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [mode, setMode] = useState<'week' | 'day'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'
  );
  const [selectedKey, setSelectedKey] = useState<string>(() => formatDateKey(new Date()));
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // Aşama 111: hafta görünümünde saat grupları — kapatılan gruplar ve "+N etüt daha" ile açılanlar (gün|saat)
  const [closedSlots, setClosedSlots] = useState<Set<string>>(() => new Set());
  const [openSlots, setOpenSlots] = useState<Set<string>>(() => new Set());
  const toggleIn = (set: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, index) => {
        const dayDate = new Date(currentWeekStart);
        dayDate.setDate(currentWeekStart.getDate() + index);
        const dateKey = formatDateKey(dayDate);
        return { date: dayDate, dateKey, dayName: DAY_NAMES[index], isToday: dateKey === todayKey };
      }),
    [currentWeekStart, todayKey]
  );

  // Seçili gün bu haftada değilse haftanın ilk günü (ya da bugün) gösterilir
  const effectiveSelectedKey = weekDays.some((d) => d.dateKey === selectedKey)
    ? selectedKey
    : weekDays.find((d) => d.isToday)?.dateKey || weekDays[0].dateKey;

  const goToPreviousWeek = () => {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(prev);
  };
  const goToNextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next);
  };
  const goToToday = () => {
    setCurrentWeekStart(getMonday(new Date()));
    setSelectedKey(formatDateKey(new Date()));
  };

  const studentNameById = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [students]);

  // Arama: ders, konu, yer, öğretmen, öğrenci adı
  const searchedEtuts = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return etuts;
    return etuts.filter((e) => {
      const names = !e.privacyRedacted && Array.isArray(e.assignedStudentIds) ? e.assignedStudentIds.map((id) => studentNameById.get(id) || '') : [];
      const hay = [e.subject, e.topic, e.location, e.notes, ...etutTeacherNames(e), ...names].join(' ').toLocaleLowerCase('tr-TR');
      return hay.includes(q);
    });
  }, [etuts, query, studentNameById]);

  const etutsByDay = useMemo(() => {
    const map: Record<string, Etut[]> = {};
    weekDays.forEach((day) => {
      map[day.dateKey] = [];
    });
    searchedEtuts.forEach((etut) => {
      if (!etut.date) return;
      const k = normalizeDateKey(etut.date);
      if (map[k]) map[k].push(etut);
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => (a?.time || '').localeCompare(b?.time || '')));
    return map;
  }, [weekDays, searchedEtuts]);

  // Aşama 111: aynı saatteki etütler tek grupta (gün sütunu etüt sayısına göre değil saat sayısına göre uzar)
  const slotsByDay = useMemo(() => {
    const out: Record<string, Array<{ time: string; items: Etut[] }>> = {};
    Object.entries(etutsByDay).forEach(([k, list]) => {
      const groups: Array<{ time: string; items: Etut[] }> = [];
      for (const e of list) {
        const t = e.time || '--:--';
        const last = groups[groups.length - 1];
        if (last && last.time === t) last.items.push(e);
        else groups.push({ time: t, items: [e] });
      }
      out[k] = groups;
    });
    return out;
  }, [etutsByDay]);

  const totalEtutsThisWeek = weekDays.reduce((c, d) => c + (etutsByDay[d.dateKey]?.length || 0), 0);
  const totalMinutesThisWeek = weekDays.reduce(
    (mins, d) => mins + (etutsByDay[d.dateKey] || []).reduce((s, e) => s + (e.duration || 45), 0),
    0
  );
  const totalHoursStr = (totalMinutesThisWeek / 60).toFixed(1);
  const missingThisWeek = weekDays.reduce(
    (c, d) => c + (etutsByDay[d.dateKey] || []).filter((e) => isEtutAttendanceMissing(e, now)).length,
    0
  );

  const weekEnd = weekDays[6].date;
  const weekLabel = `${currentWeekStart.getDate()} ${currentWeekStart.toLocaleDateString('tr-TR', { month: 'short' })} - ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}`;

  const studentsSummary = (assigned: 'all' | string[], short = false) => {
    if (assigned === 'all') return 'Tüm sınıf / grup';
    if (!Array.isArray(assigned) || assigned.length === 0) return 'Öğrenci yok';
    if (assigned.length === 1) return studentNameById.get(assigned[0]) || '1 öğrenci';
    if (short) return `${assigned.length} öğrenci`;
    const names = assigned.map((id) => studentNameById.get(id)?.split(' ')[0]).filter(Boolean) as string[];
    return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ') || `${assigned.length} öğrenci`;
  };

  const openEtut = openId ? etuts.find((e) => e.id === openId) || null : null;
  // Etüt silinir / filtrelenirse açık pencere kapanır
  useEffect(() => {
    if (openId && !openEtut) setOpenId(null);
  }, [openId, openEtut]);
  // Esc tuşu ayrıntı penceresini kapatır
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  // ---------------------------------------------------------------------
  // Etüt işlem düğmeleri (kart altı ve ayrıntı penceresi ortak)
  // ---------------------------------------------------------------------
  const ActionBar: React.FC<{ etut: Etut; afterAction?: () => void; labels?: boolean }> = ({ etut, afterAction, labels }) => {
    const base = 'inline-flex items-center gap-1 rounded-lg transition-colors cursor-pointer text-[11px] font-semibold';
    const pad = labels ? 'px-2.5 py-1.5 border border-line bg-surface hover:bg-surface-2 text-fg-2' : 'p-1.5 hover:bg-surface-2 text-muted';
    const run = (fn?: (e: Etut) => void) => (ev: React.MouseEvent) => {
      ev.stopPropagation();
      fn?.(etut);
      afterAction?.();
    };
    // Aşama 40: başka öğretmenin etüdü — yalnızca takvime ekleme; yoklama/düzenleme/silme/kopyalama/bildirim yok
    const viewOnly = !etut.privacyRedacted && !!canEditEtut && !canEditEtut(etut);
    const locked = readOnly || !!etut.privacyRedacted || viewOnly;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {viewOnly && onViewEtut && (
          <button type="button" onClick={run(onViewEtut)} className={`${base} ${pad}`} title="Yoklama ve yorumlar (salt okunur)" data-etut-view>
            <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
            {labels && 'Görüntüle'}
          </button>
        )}
        {etut.privacyRedacted && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted" data-etut-private title="Konu, yorumlar ve yoklama yalnızca etüdü veren öğretmen ve yöneticiye görünür">
            <Lock className="w-3.5 h-3.5" />
            {labels && 'Başka öğretmenin etüdü'}
          </span>
        )}
        {!locked && onAttendanceEtut && (
          <button type="button" onClick={run(onAttendanceEtut)} className={`${base} ${pad}`} title="Yoklama al / devamsızlık">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
            {labels && 'Yoklama'}
          </button>
        )}
        {!locked && onNotifyEtut && (
          <button type="button" onClick={run(onNotifyEtut)} className={`${base} ${pad}`} title="WhatsApp ve mail ile ilet">
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
            {labels && 'Bildir'}
          </button>
        )}
        <a
          href={createGoogleCalendarUrlForEtut(etut)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`${base} ${pad}`}
          title="Google Takvime ekle"
        >
          <CalendarCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-300" />
          {labels && 'Google Takvim'}
        </a>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            downloadIcsFile(
              `etut-${etut.id}`,
              `[ETÜT] ${etut.subject}: ${etut.topic}`,
              etut.notes || `${etut.location || 'Derslik'}`,
              `${etut.date}T${etut.time || '14:00'}:00`,
              etut.duration || 45,
              etut.location || 'Okul'
            );
          }}
          className={`${base} ${pad}`}
          title="iCal / Outlook takvim dosyası (.ics)"
        >
          <CalendarIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
          {labels && '.ics'}
        </button>
        {!locked && onCopyEtut && (
          <button type="button" onClick={run(onCopyEtut)} className={`${base} ${pad}`} title="Kopyala (başka tarihe yeniden tanımla)">
            <Copy className="w-3.5 h-3.5" />
            {labels && 'Kopyala'}
          </button>
        )}
        {!locked && onEditEtut && (
          <button type="button" onClick={run(onEditEtut)} className={`${base} ${pad}`} title="Düzenle">
            <Edit2 className="w-3.5 h-3.5" />
            {labels && 'Düzenle'}
          </button>
        )}
        {!locked && onDeleteEtut && (
          <button type="button" onClick={run(onDeleteEtut)} className={`${base} ${pad}`} title="Sil">
            <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            {labels && 'Sil'}
          </button>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------
  // Aşama 111: saat grubu — Hafta görünümü. Grup en fazla 3 satır gösterir, gerisi "+N etüt daha".
  // Satır kısa ama anlaşılır: ders · öğretmen · öğrenci (tek öğrenciyse adı)
  // ---------------------------------------------------------------------
  const SLOT_ROWS = 3;
  const shortTeacher = (e: Etut) => {
    const names = etutTeacherNames(e);
    if (!names[0]) return '';
    const parts = names[0].trim().split(/\s+/);
    const short = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
    return names.length > 1 ? `${short} +${names.length - 1}` : short;
  };
  const renderSlotRow = (etut: Etut, withTime: boolean) => {
    const status = getEtutStatus(etut, now);
    const st = ETUT_STATUS_STYLE[status];
    const missing = isEtutAttendanceMissing(etut, now);
    const who = etut.privacyRedacted ? '' : studentsSummary(etut.assignedStudentIds, true);
    return (
      <button
        key={etut.id}
        type="button"
        data-etut-status={status}
        data-etut-row={etut.id}
        onClick={() => setOpenId(etut.id)}
        title={[`${st.label} · ${etut.time || ''} ${etut.subject}`, etut.topic, etutTeacherNames(etut).join(', '), who].filter(Boolean).join('\n')}
        className={`w-full text-left border-l-4 px-1.5 py-1 hover:bg-surface-2 cursor-pointer ${st.accent}`}
      >
        <span className="flex items-center gap-1 min-w-0">
          {withTime && <span className="font-mono text-[10px] font-bold tabular-nums text-fg-2 shrink-0">{etut.time || '--:--'}</span>}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${subjectDot(etut.subject)}`} />
          <span className="text-[11px] font-bold text-fg truncate">{etut.subject}</span>
          {missing && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" aria-label="Yoklama alınmadı" />}
          {status === 'done' && <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" aria-label="Yoklaması alındı" />}
        </span>
        <span className="block text-[10px] text-muted truncate leading-tight">{[shortTeacher(etut), who].filter(Boolean).join(' · ')}</span>
      </button>
    );
  };
  const renderSlot = (dayKey: string, slot: { time: string; items: Etut[] }) => {
    if (slot.items.length === 1) {
      return (
        <div key={slot.time} className="rounded-lg border border-line overflow-hidden bg-surface">
          {renderSlotRow(slot.items[0], true)}
        </div>
      );
    }
    const key = `${dayKey}|${slot.time}`;
    const closed = closedSlots.has(key);
    const all = openSlots.has(key);
    const shown = all ? slot.items : slot.items.slice(0, SLOT_ROWS);
    const missing = slot.items.some((e) => isEtutAttendanceMissing(e, now));
    return (
      <div key={slot.time} className="rounded-lg border border-line overflow-hidden bg-surface" data-etut-slot={key}>
        <button
          type="button"
          onClick={() => toggleIn(setClosedSlots, key)}
          aria-expanded={!closed}
          className="w-full flex items-center gap-1 px-1.5 py-1 bg-canvas/60 hover:bg-surface-2 cursor-pointer text-left"
          title={closed ? 'Etütleri göster' : 'Grubu kapat'}
        >
          <span className="font-mono text-[10px] font-bold tabular-nums text-fg-2">{slot.time}</span>
          <span className="text-[10px] font-semibold text-muted">· {slot.items.length} etüt</span>
          {missing && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Yoklaması alınmamış etüt var" />}
          <ChevronDown className={`w-3 h-3 ml-auto text-subtle transition-transform ${closed ? '-rotate-90' : ''}`} />
        </button>
        {!closed && (
          <div className="divide-y divide-line border-t border-line">
            {shown.map((e) => renderSlotRow(e, false))}
            {slot.items.length > SLOT_ROWS && (
              <button
                type="button"
                onClick={() => toggleIn(setOpenSlots, key)}
                className="w-full py-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300 hover:bg-surface-2 cursor-pointer"
                data-etut-slot-more
              >
                {all ? 'Daha az göster' : `+${slot.items.length - SLOT_ROWS} etüt daha`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------
  // Geniş etüt kartı — Gün görünümü
  // ---------------------------------------------------------------------
  const renderDetailed = (etut: Etut) => {
    const status = getEtutStatus(etut, now);
    const st = ETUT_STATUS_STYLE[status];
    const missing = isEtutAttendanceMissing(etut, now);
    const teachers = etutTeacherNames(etut);
    return (
      <div
        key={etut.id}
        data-etut-status={status}
        onClick={() => setOpenId(etut.id)}
        className={`rounded-xl border border-l-4 p-3 text-xs cursor-pointer hover:shadow-md transition-shadow ${st.card} ${st.accent}`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${subjectDot(etut.subject)}`} />
            <span className="font-bold text-fg truncate">{etut.subject}</span>
            {etut.lessonPeriod && etut.lessonPeriod !== 'Ders' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-2 text-fg-2">{etut.lessonPeriod}</span>
            )}
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-fg-2">
            <Clock className="w-3 h-3" />
            {etut.time || 'Saat yok'} · {etut.duration || 45} dk
          </span>
        </div>
        {etut.topic && <h5 className="font-semibold text-fg text-[12px] leading-snug mb-1.5 line-clamp-2">{etut.topic}</h5>}
        <div className="space-y-0.5 text-[11px] text-muted">
          {teachers.length > 0 && <div className="truncate">👨‍🏫 {teachers.join(', ')}</div>}
          {etut.location && (
            <div className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
              <span className="truncate">{etut.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1 truncate">
            <Users className="w-3 h-3 text-indigo-500 shrink-0" />
            <span className="truncate">{etut.privacyRedacted ? 'Başka öğretmenin etüdü' : studentsSummary(etut.assignedStudentIds)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap mt-2 pt-2 border-t border-black/5 dark:border-white/10">
          <span className="flex items-center gap-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${st.chip}`}>{st.label}</span>
            {missing && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">Yoklama yok</span>}
          </span>
          <ActionBar etut={etut} />
        </div>
      </div>
    );
  };

  const selectedDay = weekDays.find((d) => d.dateKey === effectiveSelectedKey) || weekDays[0];
  const selectedEtuts = etutsByDay[selectedDay.dateKey] || [];

  return (
    <div className="space-y-3" id="weekly-etut-calendar">
      {/* ===== Üst çubuk: hafta gezinmesi, görünüm, arama, istatistik ===== */}
      <div className="bg-surface border border-line p-3 sm:p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-line">
              <button type="button" onClick={goToPreviousWeek} className="p-1.5 hover:bg-surface-2 text-fg-2 rounded-lg cursor-pointer" title="Önceki hafta" aria-label="Önceki hafta">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" onClick={goToToday} className="px-2.5 py-1 text-xs font-semibold hover:bg-surface-2 text-indigo-600 dark:text-indigo-400 rounded-lg cursor-pointer">
                Bugün
              </button>
              <button type="button" onClick={goToNextWeek} className="p-1.5 hover:bg-surface-2 text-fg-2 rounded-lg cursor-pointer" title="Sonraki hafta" aria-label="Sonraki hafta">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-bold text-fg tracking-tight">{weekLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Görünüm: Hafta / Gün */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-canvas border border-line" role="tablist" aria-label="Takvim görünümü">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'week'}
                id="etut-cal-mode-week"
                onClick={() => setMode('week')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${mode === 'week' ? 'bg-indigo-600 text-white' : 'text-fg-2 hover:bg-surface-2'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Hafta
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'day'}
                id="etut-cal-mode-day"
                onClick={() => setMode('day')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${mode === 'day' ? 'bg-indigo-600 text-white' : 'text-fg-2 hover:bg-surface-2'}`}
              >
                <List className="w-3.5 h-3.5" /> Gün
              </button>
            </div>

            {/* Arama */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="etut-cal-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Konu, öğretmen, öğrenci ara…"
                className="w-full sm:w-56 pl-8 pr-7 py-1.5 bg-canvas border border-line rounded-xl text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-fg cursor-pointer" aria-label="Aramayı temizle">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <EtutStatusLegend />
          <div className="flex items-center gap-2 text-xs text-fg-2">
            <strong className="text-indigo-600 dark:text-indigo-400">{totalEtutsThisWeek} etüt</strong>
            <span className="text-subtle">•</span>
            <strong className="text-amber-700 dark:text-amber-400">{totalHoursStr} saat</strong>
            {missingThisWeek > 0 && (
              <>
                <span className="text-subtle">•</span>
                <strong className="text-rose-600 dark:text-rose-400">{missingThisWeek} yoklama eksik</strong>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== Gün sekmeleri (Gün görünümünde) ===== */}
      {mode === 'day' && (
        <div className="flex flex-wrap items-stretch gap-1.5 pb-1">
          {weekDays.map((day) => {
            const count = (etutsByDay[day.dateKey] || []).length;
            const sel = day.dateKey === selectedDay.dateKey;
            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => setSelectedKey(day.dateKey)}
                className={`flex-1 min-w-[56px] py-1.5 px-1 rounded-xl text-center flex flex-col items-center cursor-pointer transition-all ${
                  sel
                    ? 'bg-indigo-600 text-white shadow-md'
                    : day.isToday
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-500/40'
                    : 'bg-surface text-muted border border-line hover:bg-surface-2'
                }`}
              >
                <span className="text-[10px] uppercase font-semibold">{day.dayName.slice(0, 3)}</span>
                <span className="text-sm font-bold">{day.date.getDate()}</span>
                <span className={`text-[9px] px-1.5 rounded-full font-bold ${sel ? 'bg-white/25' : count ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' : 'text-subtle'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ===== HAFTA GÖRÜNÜMÜ: 7 sütun, her sütun kendi içinde kayar ===== */}
      {mode === 'week' && (
        <div className="grid grid-cols-7 gap-2 overflow-x-auto" style={{ minWidth: 0 }}>
          {weekDays.map((day) => {
            const dayEtuts = etutsByDay[day.dateKey] || [];
            return (
              <div
                key={day.dateKey}
                className={`min-w-[132px] flex flex-col rounded-xl border ${
                  day.isToday ? 'bg-surface border-indigo-500/60 ring-1 ring-indigo-500/30' : 'bg-surface/60 border-line'
                }`}
              >
                <div
                  className={`px-2 py-1.5 border-b flex items-center justify-between rounded-t-xl ${
                    day.isToday ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/30' : 'bg-canvas/60 border-line'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKey(day.dateKey);
                      setMode('day');
                    }}
                    className="text-left cursor-pointer"
                    title="Bu günü ayrıntılı göster"
                  >
                    <span className={`block text-[11px] font-bold ${day.isToday ? 'text-indigo-700 dark:text-indigo-300' : 'text-fg-2'}`}>{day.dayName}</span>
                    <span className="block text-[10px] text-muted">{day.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${dayEtuts.length ? (day.isToday ? 'bg-indigo-500 text-white' : 'bg-surface-2 text-fg-2') : 'text-subtle'}`}>
                      {dayEtuts.length}
                    </span>
                    {!readOnly && onAddEtutForDate && (
                      <button
                        type="button"
                        onClick={() => onAddEtutForDate(day.dateKey)}
                        className="p-1 hover:bg-surface-2 text-muted hover:text-indigo-600 rounded-md cursor-pointer"
                        title={`${day.dayName} gününe etüt ekle`}
                        aria-label={`${day.dayName} gününe etüt ekle`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Sabit yükseklik: çok etüt olsa da sayfa uzamaz, sütun içinde kayar */}
                <div className="p-1.5 space-y-1.5 overflow-y-auto max-h-[62vh] min-h-[120px]">
                  {dayEtuts.length === 0 ? (
                    <p className="text-[10px] text-subtle text-center py-6">Etüt yok</p>
                  ) : (
                    (slotsByDay[day.dateKey] || []).map((slot) => renderSlot(day.dateKey, slot))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== GÜN GÖRÜNÜMÜ ===== */}
      {mode === 'day' && (
        <div className="bg-surface/60 border border-line rounded-2xl p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold text-fg">
              {selectedDay.dayName}, {selectedDay.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
              {selectedDay.isToday && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white align-middle">Bugün</span>}
              <span className="ml-2 text-xs font-normal text-muted">{selectedEtuts.length} etüt</span>
            </h3>
            {!readOnly && onAddEtutForDate && (
              <button
                type="button"
                onClick={() => onAddEtutForDate(selectedDay.dateKey)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300 px-2.5 py-1.5 rounded-lg border border-dashed border-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Etüt ekle
              </button>
            )}
          </div>
          {selectedEtuts.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted">
              <CalendarIcon className="w-6 h-6 mx-auto mb-2 text-subtle" />
              Bu günde planlı etüt yok{query ? ' (aramaya uyan)' : ''}.
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{selectedEtuts.map(renderDetailed)}</div>
          )}
        </div>
      )}

      {/* ===== Etüt ayrıntı penceresi ===== */}
      {openEtut && (() => {
        const status = getEtutStatus(openEtut, now);
        const st = ETUT_STATUS_STYLE[status];
        const missing = isEtutAttendanceMissing(openEtut, now);
        const teachers = etutTeacherNames(openEtut);
        const assignedList = openEtut.privacyRedacted
          ? []
          : openEtut.assignedStudentIds === 'all'
            ? null
            : (openEtut.assignedStudentIds as string[]).map((id) => ({ id, name: studentNameById.get(id) || 'Öğrenci', att: openEtut.studentAttendance?.[id]?.status }));
        const dateText = (() => {
          const [y, m, d] = normalizeDateKey(openEtut.date).split('-').map(Number);
          return y && m && d ? new Date(y, m - 1, d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) : openEtut.date;
        })();
        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setOpenId(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Etüt ayrıntısı"
          >
            <div
              className={`w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-l-4 bg-surface shadow-2xl ${st.accent} border-line`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 p-4 border-b border-line">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2.5 h-2.5 rounded-full ${subjectDot(openEtut.subject)}`} />
                    <h3 className="text-base font-bold text-fg">{openEtut.subject}</h3>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${st.chip}`}>{st.label}</span>
                    {missing && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">Yoklama alınmadı</span>}
                  </div>
                  {openEtut.topic && <p className="text-sm text-fg-2 mt-1">{openEtut.topic}</p>}
                </div>
                <button type="button" onClick={() => setOpenId(null)} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted cursor-pointer" aria-label="Kapat" autoFocus>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 text-xs text-fg-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300 shrink-0" />
                  <span>
                    {dateText} · {openEtut.time ? `${openEtut.time} (${openEtut.duration || 45} dk)` : 'Saat belirtilmedi'}
                    {openEtut.lessonPeriod && openEtut.lessonPeriod !== 'Ders' ? ` · ${openEtut.lessonPeriod}` : ''}
                  </span>
                </div>
                {openEtut.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>{openEtut.location}</span>
                  </div>
                )}
                {teachers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>
                      Öğretmen: <strong className="text-fg">{teachers.join(', ')}</strong>
                      {openEtut.teacherBranch ? ` (${openEtut.teacherBranch})` : ''}
                    </span>
                  </div>
                )}
                {openEtut.notes && (
                  <p className="italic text-muted">
                    <span className="font-semibold not-italic text-fg-2">Açıklama:</span> {openEtut.notes}
                  </p>
                )}
                {openEtut.teacherFeedback && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200">
                    💬 {openEtut.teacherFeedback}
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                    Katılacak öğrenciler {assignedList ? `(${assignedList.length})` : ''}
                  </p>
                  {assignedList === null ? (
                    <p className="text-fg">Tüm sınıf / grup</p>
                  ) : assignedList.length === 0 ? (
                    <p className="text-muted">Öğrenci seçilmemiş</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {assignedList.map((s) => (
                        <span key={s.id} className="inline-flex items-center gap-1 text-[11px] bg-surface-2 border border-line rounded-md px-2 py-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${s.att === 'present' ? 'bg-emerald-500' : s.att === 'absent' ? 'bg-rose-500' : s.att === 'late' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-line">
                <ActionBar etut={openEtut} labels afterAction={() => setOpenId(null)} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
