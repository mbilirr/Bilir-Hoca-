import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, BookOpen, CalendarCheck, CalendarDays, ClipboardList, Landmark, MessageSquare, UserX } from 'lucide-react';
import type { AttendanceRecord, ClassGroup, Etut, GradeRecord, Homework, HomeworkSubmission, Student, StudentMessage, Teacher, TeacherTabType } from '../../types';
import { dataService } from '../../services/dataService';
import type { setQuickFocus } from '../../lib/quickFocus';
import { isEtutAttendanceMissing, hasEtutAttendance } from '../../lib/etutTiming';
import { Panel, cx } from '../ui/kit';

// ============================================================================
// KURUM ÖZETİ (Aşama 98) — idarenin (kurum yöneticisi, Müdür, Müdür Yrd.) ana sayfası
//  * Bugün: etüt sayısı, yoklaması eksik etüt, bugün teslim edilecek ödev, son 14 günde devamsızlık, son deneme
//  * Öğretmen etkinliği (7 / 30 gün): ödev, etüt, yoklama, not, cevaplanmamış mesaj — sayıya basınca o öğretmenin
//    kayıtları ilgili bölümde süzülü açılır
//  * Ödev teslim oranları (sınıfa ve öğretmene göre), son 14 günde en çok devamsızlık yapan öğrenciler
// Bütün sayılar tek geçişte, bellekteki verilerden hesaplanır (yeni sorgu yok); yalnızca son deneme özeti
// sayfa açıldıktan sonra tek, küçük bir sorguyla okunur. Bu dosya yalnızca idarede yüklenir.
// ============================================================================

type Go = (tab: TeacherTabType, focus?: Parameters<typeof setQuickFocus>) => void;
type Win = 7 | 30;
const ROWS = 8;
const DAY = 86400000;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
// Aynı girdilerle (aynı dizi nesneleri) yeniden hesaplanmaz: ana sayfaya her dönüşte sonuç hazırdır
function memoLast<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R {
  let lastArgs: A | null = null;
  let last: R;
  return (...a: A) => {
    if (lastArgs && lastArgs.length === a.length && lastArgs.every((v, i) => v === a[i])) return last;
    lastArgs = a;
    last = fn(...a);
    return last;
  };
}
const fmt1 = (n: number | null) => (n === null ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 1 }));

interface Props {
  etuts: Etut[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  students: Student[];
  classes: ClassGroup[];
  messages: StudentMessage[];
  onGo: Go;
}

interface DenemeBrief {
  name: string;
  count: number;
  avgScore: number | null;
}

interface TeacherRow {
  id: string;
  name: string;
  hw: number;
  etut: number;
  yoklama: number;
  not: number;
  mesaj: number;
}

const TILE_COLS: Record<number, string> = { 3: '@3xl:grid-cols-3', 4: '@3xl:grid-cols-4', 5: '@3xl:grid-cols-5' };
// Kurumun öğretmenleri (ders vermeyen idare kendisi listede yer almaz)
const kurumTeachers = memoLast((all: Teacher[], kurumId: string | null, skipId: string) =>
  all.filter((t) => t.kurumId === kurumId && t.id !== skipId && (t.status || 'approved') === 'approved')
);

const calcToday = memoLast((etuts: Etut[], homeworks: Homework[], attendance: AttendanceRecord[], students: Student[], todayStr: string) => {
    const now = new Date();
    let etutCount = 0;
    let missing = 0;
    for (const e of etuts) {
      if (e.date !== todayStr) continue;
      etutCount++;
      if (isEtutAttendanceMissing(e, now)) missing++;
    }
    let due = 0;
    for (const h of homeworks) if (h.dueDate && h.dueDate.slice(0, 10) === todayStr) due++;
    // Son 14 gün devamsızlık: ders yoklaması + etüt yoklaması "gelmedi"
    const from = ymd(new Date(Date.now() - 13 * DAY));
    const absent = new Map<string, number>();
    const add = (sid: string) => absent.set(sid, (absent.get(sid) || 0) + 1);
    for (const a of attendance) {
      if (a.date < from || a.date > todayStr) continue;
      for (const r of a.records) if (r.status === 'absent') add(r.studentId);
    }
    for (const e of etuts) {
      if (e.date < from || e.date > todayStr || !e.studentAttendance) continue;
      for (const [sid, r] of Object.entries(e.studentAttendance)) if (r && r.status === 'absent') add(sid);
    }
    const byId = new Map(students.map((s) => [s.id, s] as const));
    const top = Array.from(absent.entries())
      .filter(([sid]) => byId.has(sid))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([sid, n]) => ({ id: sid, name: byId.get(sid)!.name, className: byId.get(sid)!.className || '', n }));
    let total = 0;
    absent.forEach((n, sid) => {
      if (byId.has(sid)) total += n;
    });
    return { etutCount, missing, due, absentTotal: total, absentStudents: absent.size, top };
});

const calcActivity = memoLast((teachers: Teacher[], homeworks: Homework[], etuts: Etut[], attendance: AttendanceRecord[], grades: GradeRecord[], messages: StudentMessage[], win: Win, todayStr: string) => {
    const fromMs = Date.now() - win * DAY;
    const fromStr = ymd(new Date(fromMs));
    const rows = new Map<string, TeacherRow>();
    const byAuth = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const t of teachers) {
      rows.set(t.id, { id: t.id, name: t.name, hw: 0, etut: 0, yoklama: 0, not: 0, mesaj: 0 });
      if (t.auth_user_id) byAuth.set(t.auth_user_id, t.id);
      if (t.name) byName.set(t.name.trim().toLocaleLowerCase('tr-TR'), t.id);
    }
    const row = (id?: string | null) => (id ? rows.get(id) : undefined);
    for (const h of homeworks) {
      const at = new Date(h.createdAt || h.assignedDate || 0).getTime();
      if (!(at >= fromMs)) continue;
      const r = row(dataService.homeworkOwner(h).id);
      if (r) r.hw++;
    }
    for (const e of etuts) {
      if (e.date < fromStr || e.date > todayStr) continue;
      const ids = new Set<string>([...(e.teacherIds || []), ...(e.teacherId ? [e.teacherId] : [])]);
      if (!ids.size && e.teacherName) {
        const id = byName.get(e.teacherName.trim().toLocaleLowerCase('tr-TR'));
        if (id) ids.add(id);
      }
      const took = hasEtutAttendance(e);
      ids.forEach((id) => {
        const r = row(id);
        if (!r) return;
        r.etut++;
        if (took) r.yoklama++;
      });
    }
    for (const a of attendance) {
      if (a.date < fromStr || a.date > todayStr) continue;
      const r = row(byAuth.get(a.createdBy || ''));
      if (r) r.yoklama++;
    }
    for (const g of grades) {
      if ((g.date || '') < fromStr) continue;
      const r = row(byAuth.get(g.createdBy || ''));
      if (r) r.not++;
    }
    let openGeneral = 0;
    for (const m of messages) {
      if ((m.kind && m.kind !== 'student') || m.teacherReply) continue;
      const r = row(m.toTeacherId);
      if (r) r.mesaj++;
      else openGeneral++;
    }
    const list = Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const idle = list.filter((r) => r.hw + r.etut + r.yoklama + r.not === 0).length;
    return { list, openGeneral, idle };
});

const calcRates = memoLast((homeworks: Homework[], submissions: HomeworkSubmission[], students: Student[], classes: ClassGroup[], todayStr: string) => {
    const fromStr = ymd(new Date(Date.now() - 30 * DAY));
    const classOf = new Map<string, string>();
    const size = new Map<string, number>();
    for (const s of students) {
      classOf.set(s.id, s.classId);
      size.set(s.classId, (size.get(s.classId) || 0) + 1);
    }
    // ödev|sınıf → teslim eden öğrenci sayısı
    const done = new Map<string, number>();
    for (const s of submissions) {
      if (s.status !== 'on_time' && s.status !== 'late') continue;
      const k = `${s.homeworkId}|${classOf.get(s.studentId) || ''}`;
      done.set(k, (done.get(k) || 0) + 1);
    }
    const cls = new Map<string, { exp: number; done: number }>();
    const tch = new Map<string, { name: string; exp: number; done: number }>();
    for (const h of homeworks) {
      const d = (h.dueDate || '').slice(0, 10);
      if (!d || d < fromStr || d > todayStr) continue;
      // beklenen öğrenci sayısı sınıf sınıf (seçili öğrencili ödevde öğrencilerin sınıfları)
      const expBy = new Map<string, number>();
      if (Array.isArray(h.assignedTo)) {
        for (const sid of h.assignedTo) {
          const c = classOf.get(sid);
          if (c) expBy.set(c, (expBy.get(c) || 0) + 1);
        }
      } else {
        const ids = h.targetClassIds && h.targetClassIds.length ? h.targetClassIds : h.classId ? [h.classId] : [];
        for (const c of new Set(ids)) if (size.get(c)) expBy.set(c, size.get(c)!);
      }
      if (!expBy.size) continue;
      const o = dataService.homeworkOwner(h);
      const t = tch.get(o.id) || { name: o.name, exp: 0, done: 0 };
      expBy.forEach((exp, c) => {
        const dn = Math.min(exp, done.get(`${h.id}|${c}`) || 0);
        const cur = cls.get(c) || { exp: 0, done: 0 };
        cur.exp += exp;
        cur.done += dn;
        cls.set(c, cur);
        t.exp += exp;
        t.done += dn;
      });
      tch.set(o.id, t);
    }
    const cName = new Map(classes.map((c) => [c.id, c.name] as const));
    const byClass = Array.from(cls.entries())
      .filter(([id]) => cName.has(id))
      .map(([id, v]) => ({ id, name: cName.get(id)!, rate: pct(v.done, v.exp) }))
      .sort((a, b) => a.rate - b.rate);
    const byTeacher = Array.from(tch.entries())
      .map(([id, v]) => ({ id, name: v.name, rate: pct(v.done, v.exp) }))
      .sort((a, b) => a.rate - b.rate);
    return { byClass, byTeacher };
});

export const KurumOzeti: React.FC<Props> = ({ etuts, homeworks, submissions, students, classes, messages, onGo }) => {
  const [win, setWin] = useState<Win>(7);
  const [showAll, setShowAll] = useState(false);
  const [rateBy, setRateBy] = useState<'class' | 'teacher'>('class');
  // Not / yoklama kayıtları ve öğretmenler bellekteki önbellekten (değişince yenilenir)
  const [ver, setVer] = useState(0);
  useEffect(() => dataService.subscribe(() => setVer((v) => v + 1)), []);
  const attendance: AttendanceRecord[] = useMemo(() => dataService.getAttendance(), [ver]);
  const grades: GradeRecord[] = useMemo(() => dataService.getGrades(), [ver]);
  const kurumId = dataService.getMyKurumId();
  const allTeachers = useMemo(() => dataService.getTeachers(), [ver]);
  const teachers = kurumTeachers(allTeachers, kurumId, dataService.idareDersKapali() ? dataService.getCurrentTeacher()?.id || '' : '');

  const can = {
    etuts: dataService.canUseTab('etuts'),
    homework: dataService.canUseTab('homework'),
    grades: dataService.canUseTab('grades'),
    messages: dataService.canUseTab('messages'),
    deneme: dataService.canUseDeneme(),
  };

  // Son deneme: açılış bittikten sonra tek küçük sorgu
  const [deneme, setDeneme] = useState<DenemeBrief | null | undefined>(undefined);
  useEffect(() => {
    if (!can.deneme) return;
    let alive = true;
    const t = setTimeout(() => {
      import('../../services/denemeService')
        .then((m) => m.lastExamBrief())
        .then((r) => alive && setDeneme(r))
        .catch(() => alive && setDeneme(null));
    }, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [can.deneme]);

  const todayStr = ymd(new Date());

  // ---- Bugün + devamsızlık (tek geçiş)
  const today = useMemo(() => calcToday(etuts, homeworks, attendance, students, todayStr), [etuts, homeworks, attendance, students, todayStr]);
  const activity = useMemo(
    () => calcActivity(teachers, homeworks, etuts, attendance, grades, messages, win, todayStr),
    [teachers, homeworks, etuts, attendance, grades, messages, win, todayStr]
  );
  const rates = useMemo(() => calcRates(homeworks, submissions, students, classes, todayStr), [homeworks, submissions, students, classes, todayStr]);
  const shownRows = showAll ? activity.list : activity.list.slice(0, ROWS);
  const focusTeacher = (tab: TeacherTabType, r: TeacherRow) => onGo(tab, ['teacher', r.id, r.name]);
  const rateList = rateBy === 'class' ? rates.byClass : rates.byTeacher;

  const tiles = [
    can.etuts && { id: 'ko-etut', icon: CalendarDays, tone: 'info', label: 'Bugün etüt', value: today.etutCount, hint: 'Etütler', onClick: () => onGo('etuts') },
    can.etuts && {
      id: 'ko-yoklama',
      icon: CalendarCheck,
      tone: today.missing ? 'danger' : 'success',
      label: 'Yoklaması eksik',
      value: today.missing,
      hint: today.missing ? 'Bugün biten etütler' : 'Eksik yok',
      onClick: () => onGo('etuts'),
    },
    can.homework && { id: 'ko-odev', icon: BookOpen, tone: 'success', label: 'Bugün teslim', value: today.due, hint: 'Ödev', onClick: () => onGo('homework') },
    (can.grades || can.etuts) && {
      id: 'ko-devamsiz',
      icon: UserX,
      tone: 'warning',
      label: 'Devamsızlık (14 gün)',
      value: today.absentTotal,
      hint: `${today.absentStudents} öğrenci`,
      onClick: () => onGo(can.grades ? 'grades' : 'etuts'),
    },
    can.deneme && {
      id: 'ko-deneme',
      icon: BarChart3,
      tone: 'brand',
      label: 'Son deneme ort.',
      value: deneme === undefined ? '…' : deneme ? fmt1(deneme.avgScore) : '—',
      hint: deneme ? `${deneme.name} · ${deneme.count} öğrenci` : deneme === null ? 'Sonuçlu deneme yok' : 'Okunuyor',
      onClick: () => onGo('deneme'),
    },
  ].filter(Boolean) as Array<{ id: string; icon: React.ComponentType<{ className?: string }>; tone: string; label: string; value: React.ReactNode; hint: string; onClick: () => void }>;

  const TONE: Record<string, string> = {
    info: 'text-info-fg bg-info-soft',
    success: 'text-success-fg bg-success-soft',
    danger: 'text-danger-fg bg-danger-soft',
    warning: 'text-warning-fg bg-warning-soft',
    brand: 'text-brand-fg bg-brand-soft',
  };

  const cell = (n: number, onClick: (() => void) | null, warn = false) =>
    onClick && n > 0 ? (
      <button type="button" onClick={onClick} className={cx('h-7 min-w-[2rem] px-1.5 rounded-md text-xs font-bold tabular-nums hover:bg-surface-3 cursor-pointer', warn ? 'text-danger-fg' : 'text-fg')}>
        {n}
      </button>
    ) : (
      <span className={cx('inline-flex h-7 min-w-[2rem] items-center justify-center text-xs tabular-nums', n > 0 ? (warn ? 'font-bold text-danger-fg' : 'font-bold text-fg') : 'text-subtle')}>{n}</span>
    );

  return (
    <Panel
      id="kurum-ozeti"
      icon={Landmark}
      tone="brand"
      title="Kurum Özeti"
      description={`${teachers.length} öğretmen · ${students.length} öğrenci · ${classes.length} sınıf`}
    >
      <div className="space-y-4">
        {/* Bugün */}
        {tiles.length > 0 && (
          <div className={cx('grid grid-cols-2 gap-2', TILE_COLS[tiles.length] || '@3xl:grid-cols-5')} id="kurum-ozeti-bugun">
            {tiles.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  id={t.id}
                  type="button"
                  onClick={t.onClick}
                  className="rounded-xl border border-line bg-surface-2/60 hover:border-line-strong px-3 py-2.5 text-left cursor-pointer transition-colors min-w-0"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted truncate">{t.label}</span>
                    <span className={cx('w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0', TONE[t.tone])}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                  </span>
                  <span className="block mt-1 text-xl font-bold text-fg tabular-nums">{t.value}</span>
                  <span className="block text-[11px] text-muted truncate">{t.hint}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 @5xl:grid-cols-3 gap-4">
          {/* Öğretmen etkinliği */}
          <section className="@5xl:col-span-2 rounded-xl border border-line p-3 space-y-2 min-w-0" id="kurum-ozeti-etkinlik">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-brand-fg" /> Öğretmen etkinliği
                {activity.idle > 0 && <span className="ui-chip ui-chip-warning">{activity.idle} öğretmende hareket yok</span>}
              </h3>
              <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="group" aria-label="Dönem">
                {([7, 30] as Win[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    id={`kurum-ozeti-win-${w}`}
                    aria-pressed={win === w}
                    onClick={() => setWin(w)}
                    className={cx('h-7 w-16 rounded-md text-xs font-semibold cursor-pointer', win === w ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}
                  >
                    {w} gün
                  </button>
                ))}
              </div>
            </div>
            {activity.list.length === 0 ? (
              <p className="text-xs text-muted">Kurumda kayıtlı öğretmen yok.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs min-w-[30rem]">
                  <thead>
                    <tr className="text-[11px] text-muted">
                      <th className="text-left font-semibold px-1 py-1">Öğretmen</th>
                      {can.homework && <th className="font-semibold px-1 py-1 w-14">Ödev</th>}
                      {can.etuts && <th className="font-semibold px-1 py-1 w-14">Etüt</th>}
                      {(can.grades || can.etuts) && <th className="font-semibold px-1 py-1 w-16">Yoklama</th>}
                      {can.grades && <th className="font-semibold px-1 py-1 w-14">Not</th>}
                      {can.messages && <th className="font-semibold px-1 py-1 w-20" title="Öğretmene yazılmış, cevaplanmamış öğrenci mesajları">Cevapsız</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shownRows.map((r) => {
                      const idle = r.hw + r.etut + r.yoklama + r.not === 0;
                      return (
                        <tr key={r.id} data-teacher={r.id} className="text-center">
                          <td className="text-left px-1 py-0.5 max-w-0 w-full">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className={cx('truncate font-semibold', idle ? 'text-muted' : 'text-fg')}>{r.name}</span>
                              {idle && <AlertTriangle className="w-3.5 h-3.5 text-warning-fg shrink-0" aria-label="Bu dönemde kayıt yok" />}
                            </span>
                          </td>
                          {can.homework && <td className="px-1">{cell(r.hw, () => focusTeacher('homework', r))}</td>}
                          {can.etuts && <td className="px-1">{cell(r.etut, () => focusTeacher('etuts', r))}</td>}
                          {(can.grades || can.etuts) && <td className="px-1">{cell(r.yoklama, can.grades ? () => focusTeacher('grades', r) : () => focusTeacher('etuts', r))}</td>}
                          {can.grades && <td className="px-1">{cell(r.not, () => focusTeacher('grades', r))}</td>}
                          {can.messages && <td className="px-1">{cell(r.mesaj, () => onGo('messages'), true)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
              <span>
                Yoklama: ders yoklaması + yoklaması alınan etüt.
                {can.messages && activity.openGeneral > 0 ? ` Öğretmen seçilmeden yazılmış ${activity.openGeneral} cevapsız mesaj var.` : ''}
              </span>
              {activity.list.length > ROWS && (
                <button type="button" id="kurum-ozeti-tumu" onClick={() => setShowAll((v) => !v)} className="font-semibold text-brand-fg hover:underline cursor-pointer">
                  {showAll ? 'Daralt' : `+${activity.list.length - ROWS} öğretmen daha`}
                </button>
              )}
            </div>
          </section>

          <div className="space-y-4 min-w-0">
            {/* Teslim oranları */}
            {can.homework && (
              <section className="rounded-xl border border-line p-3 space-y-2" id="kurum-ozeti-teslim">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-fg flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-brand-fg" /> Ödev teslim oranı
                  </h3>
                  <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="group" aria-label="Teslim oranı">
                    {(['class', 'teacher'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        id={`kurum-ozeti-oran-${k}`}
                        aria-pressed={rateBy === k}
                        onClick={() => setRateBy(k)}
                        className={cx('h-7 w-16 rounded-md text-xs font-semibold cursor-pointer', rateBy === k ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}
                      >
                        {k === 'class' ? 'Sınıf' : 'Öğretmen'}
                      </button>
                    ))}
                  </div>
                </div>
                {rateList.length === 0 ? (
                  <p className="text-xs text-muted">Son 30 günde teslim tarihi gelen ödev yok.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {rateList.slice(0, 6).map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-xs">
                        <span className="w-24 truncate text-fg-2" title={r.name}>
                          {r.name}
                        </span>
                        <span className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                          <span className={cx('block h-full rounded-full', r.rate < 50 ? 'bg-danger' : r.rate < 75 ? 'bg-warning' : 'bg-success')} style={{ width: `${r.rate}%` }} />
                        </span>
                        <span className="w-9 text-right font-bold tabular-nums text-fg">%{r.rate}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {rateList.length > 6 && <p className="text-[11px] text-muted">En düşük 6 gösteriliyor · toplam {rateList.length}</p>}
              </section>
            )}

            {/* Devamsızlık */}
            {(can.grades || can.etuts) && (
              <section className="rounded-xl border border-line p-3 space-y-2" id="kurum-ozeti-devamsizlik">
                <h3 className="text-xs font-bold text-fg flex items-center gap-1.5">
                  <UserX className="w-3.5 h-3.5 text-warning-fg" /> Son 14 gün devamsızlık
                </h3>
                {today.top.length === 0 ? (
                  <p className="text-xs text-muted">Son 14 günde devamsızlık kaydı yok.</p>
                ) : (
                  <ul className="space-y-1">
                    {today.top.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => onGo('students', ['student', s.id, s.name])}
                          className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-surface-2 text-left text-xs cursor-pointer"
                        >
                          <span className="flex-1 min-w-0 truncate text-fg">
                            {s.name}
                            {s.className && <span className="text-muted"> · {s.className}</span>}
                          </span>
                          <span className="ui-chip ui-chip-warning tabular-nums">{s.n} gün/etüt</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Cevaplanmamış mesajlar özeti */}
            {can.messages && (
              <button
                type="button"
                id="kurum-ozeti-mesaj"
                onClick={() => onGo('messages')}
                className="w-full rounded-xl border border-line p-3 flex items-center gap-2 text-left text-xs hover:border-line-strong cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-danger-fg shrink-0" />
                <span className="flex-1 text-fg-2">Cevaplanmamış öğrenci mesajı</span>
                <span className="font-bold tabular-nums text-fg">{activity.list.reduce((n, r) => n + r.mesaj, 0) + activity.openGeneral}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
};
