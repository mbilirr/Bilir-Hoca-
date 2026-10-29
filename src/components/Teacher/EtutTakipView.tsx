import React, { useDeferredValue, useMemo, useState } from 'react';
import { CalendarCheck, AlertCircle, UserX, MessageSquareQuote, ChevronDown, Download, Eye, Users, GraduationCap, Search } from 'lucide-react';
import type { ClassGroup, Etut, Student } from '../../types';
import { Modal, cx } from '../ui/kit';
import { usePagedList, ShowMoreBar, useMediaQuery } from '../../lib/listPaging';
import { matchTurkishSearch, turkishCompare } from '../../utils/turkishSearch';
import { normalizeSubject } from '../../lib/subjects';
import { etutTeacherNames, NO_TEACHER_LABEL } from '../../lib/etutStatus';
import { isEtutEnded, etutExpectsAttendance, hasEtutAttendance } from '../../lib/etutTiming';
import { localDateStr } from './FormParts';
import {
  DATE_PRESETS,
  STATUS_LABEL,
  attendanceRate,
  buildStudentInfo,
  classify,
  formatRate,
  inRange,
  presetRange,
  rangeLabel,
  trDate,
  type AttStatus,
  type DatePreset,
  type StudentInfo,
} from './EtutAnalysisData';

// ============================================================================
// Aşama 111: ETÜT TAKİP (genel yönetici, idare, Rehberlik)
// Kurumun tüm etütleri, yoklamaları ve öğrenci yorumları. Veri çoğaldığında karışmaması için ekran her zaman
// bir dönemle açılır (varsayılan: bu hafta) ve özetten ayrıntıya iner. Hesap kuralları Etüt Analizi ile aynıdır
// (classify / attendanceRate), böylece iki ekran aynı sayıyı verir.
// ============================================================================

type Status = 'all' | 'missing' | 'absent' | 'comment';
type GroupBy = 'teacher' | 'student';

/** Etüt başına bir kez hesaplanan özet (aynı etüt nesnesi değişmedikçe yeniden hesaplanmaz) */
interface EtutFacts {
  studentIds: string[];
  present: number;
  late: number;
  absent: number;
  excused: number;
  comments: number;
  missing: boolean;
  teachers: string[];
  subject: string;
}
const factsCache = new WeakMap<Etut, EtutFacts>();
function factsOf(e: Etut): EtutFacts {
  let f = factsCache.get(e);
  if (f) return f;
  const att = e.studentAttendance || {};
  const ids = new Set<string>(Object.keys(att));
  if (Array.isArray(e.assignedStudentIds)) for (const id of e.assignedStudentIds) ids.add(id);
  let present = 0, late = 0, absent = 0, excused = 0, comments = 0;
  for (const id of Object.keys(att)) {
    const r = att[id];
    if (!r) continue;
    if (r.status === 'present') present++;
    else if (r.status === 'late') late++;
    else if (r.status === 'absent') absent++;
    else if (r.status === 'excused') excused++;
    if ((r.note || '').trim() || (r.topic || '').trim()) comments++;
  }
  if ((e.teacherFeedback || '').trim()) comments++;
  const names = etutTeacherNames(e);
  f = {
    studentIds: Array.from(ids),
    present,
    late,
    absent,
    excused,
    comments,
    missing: isEtutEnded(e) && etutExpectsAttendance(e) && !hasEtutAttendance(e),
    teachers: names.length ? names : [NO_TEACHER_LABEL],
    subject: normalizeSubject(e.subject) || 'Belirtilmemiş',
  };
  factsCache.set(e, f);
  return f;
}

const byDateDesc = (a: Etut, b: Etut) => (a.date === b.date ? (b.time || '').localeCompare(a.time || '') : a.date < b.date ? 1 : -1);

const SELECT = 'ui-input h-8 py-0 text-xs';
const STATUS_TONE: Record<AttStatus, string> = {
  present: 'ui-chip-success',
  late: 'ui-chip-warning',
  absent: 'ui-chip-danger',
  excused: 'ui-chip-info',
  unrecorded: 'ui-chip-neutral',
  upcoming: 'ui-chip-neutral',
};

export const EtutTakipView: React.FC<{
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
  onOpenEtut: (e: Etut) => void;
}> = ({ etuts, students, classes, onOpenEtut }) => {
  const phone = useMediaQuery('(max-width: 639px)');
  const today = localDateStr(new Date());
  const [preset, setPreset] = useState<DatePreset>('thisWeek');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [teacher, setTeacher] = useState('all');
  const [subject, setSubject] = useState('all');
  const [classId, setClassId] = useState('all');
  const [status, setStatus] = useState<Status>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('teacher');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const info = useMemo(() => buildStudentInfo(students, classes), [students, classes]);
  const range = useMemo(() => presetRange(preset, today, { from: from || null, to: to || null }), [preset, today, from, to]);

  // 1) Dönem (tek geçiş) — sonraki süzgeçler yalnız bu dönemi tarar
  const inPeriod = useMemo(() => etuts.filter((e) => inRange(String(e.date || '').slice(0, 10), range)), [etuts, range]);

  // Süzgeç seçenekleri dönemdeki etütlerden (sayılarıyla)
  const options = useMemo(() => {
    const t = new Map<string, number>();
    const s = new Map<string, number>();
    const c = new Set<string>();
    for (const e of inPeriod) {
      const f = factsOf(e);
      for (const n of f.teachers) t.set(n, (t.get(n) || 0) + 1);
      s.set(f.subject, (s.get(f.subject) || 0) + 1);
      for (const id of f.studentIds) {
        const ci = info.get(id)?.classId;
        if (ci) c.add(ci);
      }
    }
    const sortEntries = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => turkishCompare(a[0], b[0]));
    const cls = classes.filter((x) => c.has(x.id)).map((x) => [x.id, info.get(students.find((st) => st.classId === x.id)?.id || '')?.classLabel || x.name] as [string, string]);
    cls.sort((a, b) => turkishCompare(a[1], b[1]));
    return { teachers: sortEntries(t), subjects: sortEntries(s), classes: cls };
  }, [inPeriod, info, classes, students]);
  const effTeacher = teacher !== 'all' && options.teachers.some(([n]) => n === teacher) ? teacher : 'all';
  const effSubject = subject !== 'all' && options.subjects.some(([n]) => n === subject) ? subject : 'all';
  const effClass = classId !== 'all' && options.classes.some(([id]) => id === classId) ? classId : 'all';

  // 2) Öğretmen / ders / sınıf
  const scoped = useMemo(
    () =>
      inPeriod.filter((e) => {
        const f = factsOf(e);
        if (effTeacher !== 'all' && !f.teachers.includes(effTeacher)) return false;
        if (effSubject !== 'all' && f.subject !== effSubject) return false;
        if (effClass !== 'all' && !f.studentIds.some((id) => info.get(id)?.classId === effClass)) return false;
        return true;
      }),
    [inPeriod, effTeacher, effSubject, effClass, info]
  );

  // Özet kutuları süzgeçten bağımsız olarak "durum" seçimini gösterir
  const summary = useMemo(() => {
    let missing = 0, absent = 0, comments = 0;
    for (const e of scoped) {
      const f = factsOf(e);
      if (f.missing) missing++;
      absent += f.absent;
      comments += f.comments;
    }
    return { count: scoped.length, missing, absent, comments };
  }, [scoped]);

  // 3) Durum
  const shown = useMemo(() => {
    const list =
      status === 'all'
        ? scoped.slice()
        : scoped.filter((e) => {
            const f = factsOf(e);
            return status === 'missing' ? f.missing : status === 'absent' ? f.absent > 0 : f.comments > 0;
          });
    return list.sort(byDateDesc);
  }, [scoped, status]);

  // Öğretmene göre satırlar
  const teacherRows = useMemo(() => {
    const m = new Map<string, { name: string; etuts: Etut[]; missing: number; present: number; late: number; absent: number }>();
    for (const e of shown) {
      const f = factsOf(e);
      for (const n of f.teachers) {
        let r = m.get(n);
        if (!r) m.set(n, (r = { name: n, etuts: [], missing: 0, present: 0, late: 0, absent: 0 }));
        r.etuts.push(e);
        if (f.missing) r.missing++;
        r.present += f.present;
        r.late += f.late;
        r.absent += f.absent;
      }
    }
    return Array.from(m.values()).sort((a, b) => b.missing - a.missing || b.etuts.length - a.etuts.length || turkishCompare(a.name, b.name));
  }, [shown]);

  // Öğrenciye göre satırlar (arama gecikmeli; satır içinde find yok, dizin bir kez kurulur)
  const studentRows = useMemo(() => {
    const m = new Map<string, { info: StudentInfo; etuts: Etut[]; absent: number; comments: number; present: number; late: number }>();
    for (const e of shown) {
      const f = factsOf(e);
      for (const id of f.studentIds) {
        const si = info.get(id);
        if (!si || (effClass !== 'all' && si.classId !== effClass)) continue;
        let r = m.get(id);
        if (!r) m.set(id, (r = { info: si, etuts: [], absent: 0, comments: 0, present: 0, late: 0 }));
        r.etuts.push(e);
        const a = e.studentAttendance?.[id];
        if (a?.status === 'absent') r.absent++;
        else if (a?.status === 'present') r.present++;
        else if (a?.status === 'late') r.late++;
        if (a && ((a.note || '').trim() || (a.topic || '').trim())) r.comments++;
      }
    }
    let rows = Array.from(m.values());
    const q = deferredQuery.trim();
    if (q) rows = rows.filter((r) => matchTurkishSearch(r.info.student.name, q) || matchTurkishSearch(String(r.info.student.studentNumber || ''), q));
    return rows.sort((a, b) => b.absent - a.absent || b.comments - a.comments || turkishCompare(a.info.student.name, b.info.student.name));
  }, [shown, info, deferredQuery, effClass]);

  const resetKey = `${preset}|${from}|${to}|${effTeacher}|${effSubject}|${effClass}|${status}|${groupBy}|${deferredQuery}`;
  const pagedTeachers = usePagedList(teacherRows, resetKey, 50, phone ? 15 : undefined);
  const pagedStudents = usePagedList(studentRows, resetKey, 50, phone ? 15 : undefined);

  const filtersOn = preset !== 'thisWeek' || effTeacher !== 'all' || effSubject !== 'all' || effClass !== 'all' || status !== 'all' || !!query;
  const clear = () => {
    setPreset('thisWeek');
    setFrom('');
    setTo('');
    setTeacher('all');
    setSubject('all');
    setClassId('all');
    setStatus('all');
    setQuery('');
  };

  const exportExcel = async () => {
    const { downloadExcel } = await import('./EtutAnalysisExport');
    const head = ['Tarih', 'Saat', 'Ders', 'Öğretmen', 'Öğrenci', 'Geldi', 'Geç', 'Gelmedi', 'İzinli', 'Yorum', 'Yoklama'];
    const rows = shown.map((e) => {
      const f = factsOf(e);
      return [trDate(e.date), e.time || '', f.subject, f.teachers.join(', '), f.studentIds.length, f.present, f.late, f.absent, f.excused, f.comments, f.missing ? 'Alınmadı' : hasEtutAttendance(e) ? 'Alındı' : '-'];
    });
    await downloadExcel(`etut-takip-${today}`, [{ name: 'Etüt Takip', table: { title: 'Etüt Takip', head, rows, numericFrom: 4 }, meta: [['Dönem', rangeLabel(range)]] }]);
  };

  const box = (key: Status, icon: React.ReactNode, label: string, value: number, tone: string) => (
    <button
      type="button"
      key={key}
      id={`etut-takip-box-${key}`}
      onClick={() => setStatus(status === key ? 'all' : key)}
      aria-pressed={status === key}
      className={cx(
        'ui-card h-16 px-3 flex items-center gap-3 text-left cursor-pointer transition-colors',
        status === key ? 'ring-2 ring-brand border-transparent' : 'hover:bg-surface-2'
      )}
    >
      <span className={cx('w-8 h-8 rounded-lg grid place-items-center shrink-0', tone)}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-lg font-bold text-fg tabular-nums leading-tight">{value}</span>
        <span className="block text-[11px] text-muted truncate">{label}</span>
      </span>
    </button>
  );

  const etutLine = (e: Etut, extra?: React.ReactNode) => {
    const f = factsOf(e);
    return (
      <button
        type="button"
        key={e.id}
        onClick={() => onOpenEtut(e)}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-xs hover:bg-surface-2 cursor-pointer"
        data-etut-takip-row={e.id}
      >
        <span className="w-24 shrink-0 tabular-nums text-fg-2">{trDate(e.date)} {e.time || ''}</span>
        <span className="font-semibold text-fg min-w-0 truncate basis-full order-first sm:order-none sm:basis-auto sm:flex-1">{f.subject}{e.topic ? ` · ${e.topic}` : ''}</span>
        <span className="text-muted truncate max-w-[12rem]">{f.teachers.join(', ')}</span>
        {extra ?? (
          <span className="flex items-center gap-2 tabular-nums">
            {f.missing ? (
              <span className="ui-chip ui-chip-danger">Yoklama yok</span>
            ) : (
              <>
                <span className="text-emerald-700 dark:text-emerald-300">{f.present + f.late} geldi</span>
                <span className="text-rose-600 dark:text-rose-300">{f.absent} gelmedi</span>
              </>
            )}
            {f.comments > 0 && (
              <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-300" title="Yorumlu kayıt">
                <MessageSquareQuote className="w-3.5 h-3.5" />
                {f.comments}
              </span>
            )}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-3" id="etut-takip">
      {/* Süzgeçler: eşit kutular, yazıyla aynı yükseklik */}
      <div className="ui-card p-3 space-y-2" id="etut-takip-filters">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
          <label className="min-w-0 text-[11px] font-semibold text-muted">
            Dönem
            <select id="etut-takip-period" className={SELECT} value={preset} onChange={(e) => setPreset(e.target.value as DatePreset)}>
              {DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-muted">
            Öğretmen
            <select id="etut-takip-teacher" className={SELECT} value={effTeacher} onChange={(e) => setTeacher(e.target.value)}>
              <option value="all">Tümü ({inPeriod.length})</option>
              {options.teachers.map(([n, c]) => (
                <option key={n} value={n}>{n} ({c})</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-muted">
            Ders
            <select id="etut-takip-subject" className={SELECT} value={effSubject} onChange={(e) => setSubject(e.target.value)}>
              <option value="all">Tümü</option>
              {options.subjects.map(([n, c]) => (
                <option key={n} value={n}>{n} ({c})</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-muted">
            Sınıf
            <select id="etut-takip-class" className={SELECT} value={effClass} onChange={(e) => setClassId(e.target.value)}>
              <option value="all">Tümü</option>
              {options.classes.map(([id, n]) => (
                <option key={id} value={id}>{n}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-muted">
            Durum
            <select id="etut-takip-status" className={SELECT} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="all">Tümü</option>
              <option value="missing">Yoklama eksik</option>
              <option value="absent">Devamsız var</option>
              <option value="comment">Yorumlu</option>
            </select>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-muted">
            Öğrenci ara
            <span className="relative block">
              <Search className="w-3.5 h-3.5 text-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="etut-takip-search"
                type="search"
                className={cx(SELECT, 'pl-8')}
                placeholder="Ad veya numara"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value) setGroupBy('student');
                }}
              />
            </span>
          </label>
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-2" id="etut-takip-range">
            <label className="text-[11px] font-semibold text-muted">
              Başlangıç
              <input type="date" className={cx(SELECT, 'w-40')} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-[11px] font-semibold text-muted">
              Bitiş
              <input type="date" className={cx(SELECT, 'w-40')} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted" id="etut-takip-range-label">{rangeLabel(range)} · {shown.length} etüt</span>
          <div className="flex items-center gap-2">
            {filtersOn && (
              <button type="button" id="etut-takip-clear" className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-28" onClick={clear}>
                Temizle
              </button>
            )}
            <button type="button" id="etut-takip-excel" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28" disabled={!shown.length} onClick={() => void exportExcel()}>
              <Download /> Excel
            </button>
          </div>
        </div>
      </div>

      {/* Özet: 4 eşit kutu; tıklayınca durum süzgeci */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" id="etut-takip-summary">
        {box('all', <CalendarCheck className="w-4 h-4" />, 'Etüt', summary.count, 'bg-brand-soft text-brand-fg')}
        {box('missing', <AlertCircle className="w-4 h-4" />, 'Yoklama eksik', summary.missing, 'bg-danger-soft text-danger-fg')}
        {box('absent', <UserX className="w-4 h-4" />, 'Devamsız öğrenci', summary.absent, 'bg-warning-soft text-warning-fg')}
        {box('comment', <MessageSquareQuote className="w-4 h-4" />, 'Yorumlu kayıt', summary.comments, 'bg-success-soft text-success-fg')}
      </div>

      {/* Görünüm seçici: iki eşit düğme */}
      <div className="flex items-center gap-2" role="tablist" id="etut-takip-groupby">
        {(
          [
            ['teacher', 'Öğretmene göre', Users],
            ['student', 'Öğrenciye göre', GraduationCap],
          ] as const
        ).map(([v, label, Icon]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={groupBy === v}
            id={`etut-takip-by-${v}`}
            className={cx('ui-btn ui-btn-sm h-8 w-36', groupBy === v ? 'ui-btn-primary' : 'ui-btn-secondary')}
            onClick={() => {
              setGroupBy(v);
              setOpenKey(null);
            }}
          >
            <Icon /> {label}
          </button>
        ))}
      </div>

      <div className="ui-card overflow-hidden" id="etut-takip-list">
        {groupBy === 'teacher' ? (
          teacherRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Bu seçimde etüt yok.</p>
          ) : (
            <>
              <div className="divide-y divide-line">
                {pagedTeachers.visible.map((r) => {
                  const open = openKey === `t:${r.name}`;
                  const rate = attendanceRate({ present: r.present, late: r.late, absent: r.absent, excused: 0, unrecorded: 0, upcoming: 0 });
                  return (
                    <div key={r.name} data-etut-takip-teacher={r.name}>
                      <button
                        type="button"
                        className="cv-row w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 cursor-pointer"
                        aria-expanded={open}
                        onClick={() => setOpenKey(open ? null : `t:${r.name}`)}
                      >
                        <span className="font-semibold text-sm text-fg flex-1 min-w-0 truncate">{r.name}</span>
                        <span className="text-xs tabular-nums text-fg-2 w-16 text-right">{r.etuts.length} etüt</span>
                        <span className={cx('ui-chip w-24 justify-center', r.missing ? 'ui-chip-danger' : 'ui-chip-success')}>
                          {r.missing ? `${r.missing} eksik` : 'Tamam'}
                        </span>
                        <span className="text-xs tabular-nums text-muted w-12 text-right" title="Katılım oranı">{formatRate(rate)}</span>
                        <ChevronDown className={cx('w-4 h-4 text-subtle transition-transform', open && 'rotate-180')} />
                      </button>
                      {open && <div className="bg-surface-2/40 divide-y divide-line border-t border-line">{r.etuts.map((e) => etutLine(e))}</div>}
                    </div>
                  );
                })}
              </div>
              <ShowMoreBar remaining={pagedTeachers.remaining} total={teacherRows.length} shown={pagedTeachers.visible.length} onMore={pagedTeachers.showMore} onAll={pagedTeachers.showAll} step={50} />
            </>
          )
        ) : studentRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{query ? 'Aramaya uyan öğrenci yok.' : 'Bu seçimde öğrenci yok.'}</p>
        ) : (
          <>
            <div className="divide-y divide-line">
              {pagedStudents.visible.map((r) => {
                const id = r.info.student.id;
                const open = openKey === `s:${id}`;
                return (
                  <div key={id} data-etut-takip-student={id}>
                    <button
                      type="button"
                      className="cv-row w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 cursor-pointer"
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? null : `s:${id}`)}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-sm text-fg truncate">{r.info.student.name}</span>
                        <span className="block text-[11px] text-muted truncate">{r.info.classLabel}</span>
                      </span>
                      <span className="text-xs tabular-nums text-fg-2 w-16 text-right">{r.etuts.length} etüt</span>
                      <span className={cx('ui-chip w-24 justify-center', r.absent ? 'ui-chip-danger' : 'ui-chip-neutral')}>{r.absent} gelmedi</span>
                      <span className="text-xs tabular-nums text-amber-700 dark:text-amber-300 w-12 text-right inline-flex items-center justify-end gap-0.5" title="Yorum">
                        <MessageSquareQuote className="w-3.5 h-3.5" />
                        {r.comments}
                      </span>
                      <ChevronDown className={cx('w-4 h-4 text-subtle transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <div className="bg-surface-2/40 divide-y divide-line border-t border-line">
                        {r.etuts.map((e) => {
                          const a = e.studentAttendance?.[id];
                          const st = classify(e, id, today);
                          const note = [a?.topic ? `Konu: ${a.topic}` : '', a?.note || ''].filter(Boolean).join(' · ');
                          return etutLine(
                            e,
                            <span className="flex items-center gap-2 min-w-0">
                              <span className={cx('ui-chip', STATUS_TONE[st])}>{STATUS_LABEL[st]}</span>
                              {note && <span className="text-fg-2 italic truncate max-w-[16rem]" title={note}>{note}</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <ShowMoreBar remaining={pagedStudents.remaining} total={studentRows.length} shown={pagedStudents.visible.length} onMore={pagedStudents.showMore} onAll={pagedStudents.showAll} step={50} />
          </>
        )}
      </div>
    </div>
  );
};

/** Aşama 111: etüdün yoklaması ve yorumları — küçük, salt okunur pencere (idare ise "Yoklamayı düzenle") */
export const EtutDetayModal: React.FC<{
  etut: Etut;
  students: Student[];
  classes: ClassGroup[];
  canEdit: boolean;
  onClose: () => void;
  onEditAttendance: (e: Etut) => void;
}> = ({ etut, students, classes, canEdit, onClose, onEditAttendance }) => {
  const today = localDateStr(new Date());
  const info = useMemo(() => buildStudentInfo(students, classes), [students, classes]);
  const f = factsOf(etut);
  const rows = useMemo(
    () =>
      f.studentIds
        .map((id) => ({ id, info: info.get(id), a: etut.studentAttendance?.[id], st: classify(etut, id, today) }))
        .sort((x, y) => turkishCompare(x.info?.student.name || x.a?.studentName || '', y.info?.student.name || y.a?.studentName || '')),
    [f, info, etut, today]
  );
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={Eye}
      tone="brand"
      id="etut-detay-modal"
      title={`${f.subject} · ${trDate(etut.date)} ${etut.time || ''}`}
      description={`Öğretmen: ${f.teachers.join(', ')}${etut.attendanceTakenBy?.name ? ` · Yoklamayı alan: ${etut.attendanceTakenBy.name}` : ''}`}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28" onClick={onClose}>
            Kapat
          </button>
          {canEdit && (
            <button type="button" id="etut-detay-edit" className="ui-btn ui-btn-primary ui-btn-sm h-8 w-28" onClick={() => onEditAttendance(etut)}>
              Düzenle
            </button>
          )}
        </>
      }
    >
      <div className="space-y-2 text-xs">
        {etut.topic && <p className="text-fg-2"><span className="font-semibold">Konu:</span> {etut.topic}</p>}
        {etut.teacherFeedback && (
          <p className="p-2 rounded-lg bg-warning-soft text-fg-2 italic">
            <span className="font-semibold not-italic">Öğretmen görüşü:</span> {etut.teacherFeedback}
          </p>
        )}
        {f.missing && <p className="ui-chip ui-chip-danger">Yoklama alınmadı</p>}
        {!canEdit && <p className="text-[11px] text-muted">Salt okunur: yoklamayı etüdün öğretmeni ve idare değiştirebilir.</p>}
        <ul className="divide-y divide-line border border-line rounded-lg max-h-[50vh] overflow-y-auto" id="etut-detay-list">
          {rows.length === 0 && <li className="px-3 py-3 text-muted">Öğrenci listesi yok.</li>}
          {rows.map((r) => (
            <li key={r.id} className="px-3 py-2 space-y-0.5" data-etut-detay-student={r.id}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-fg flex-1 min-w-0 truncate">{r.info?.student.name || r.a?.studentName || 'Öğrenci'}</span>
                <span className="text-[11px] text-muted">{r.info?.classLabel || ''}</span>
                <span className={cx('ui-chip', STATUS_TONE[r.st])}>{STATUS_LABEL[r.st]}</span>
              </div>
              {r.a?.topic && <p className="text-fg-2"><span className="font-semibold">Anlatılan konu:</span> {r.a.topic}</p>}
              {r.a?.note && <p className="text-fg-2 italic">{r.a.note}</p>}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
};
