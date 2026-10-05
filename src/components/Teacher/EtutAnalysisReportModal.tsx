import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ClipboardX,
  FileSpreadsheet,
  Filter,
  Percent,
  Printer,
  Search,
  User,
  UserX,
} from 'lucide-react';
import type { ClassGroup, Etut, Student } from '../../types';
import { dataService } from '../../services/dataService';
import { subjectsForLevel } from '../../lib/subjects';
import { EmptyState, Modal, Segmented, StatCard, cx, type Tone } from '../ui/kit';
import { localDateStr } from './FormParts';
import {
  DATE_PRESETS,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_SHORT,
  buildStudentInfo,
  buildStudentReport,
  buildSummary,
  classLabelOf,
  classLevelOf,
  countsPairs,
  etutTable,
  fileSafe,
  formatRate,
  groupTable,
  inRange,
  isMine,
  prepareEtuts,
  presetRange,
  rangeLabel,
  rateTone,
  sortStudentRows,
  studentEtutTable,
  studentTable,
  trDate,
  type AttStatus,
  type Counts,
  type DatePreset,
  type GroupRow,
  type StudentInfo,
  type StudentSort,
} from './EtutAnalysisData';
import { EtutAnalysisPrint, type PrintReportProps } from './EtutAnalysisPrint';
import { downloadExcel, type ExcelSheet } from './EtutAnalysisExport';

// ============================================================================
// ETÜT ANALİZİ
// Genel özet (sınıf / okul) ve öğrenci raporu. Durumlar ve katılım oranı tek
// kuraldan (EtutAnalysisData) gelir; ekran, yazdırma ve Excel aynı sayıları gösterir.
// ============================================================================

interface EtutAnalysisReportModalProps {
  onClose: () => void;
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
  preselectedStudentId?: string;
  defaultScope?: 'all' | 'mine'; // Etütler sayfasındaki "Tüm Okul / Benim Etütlerim" seçimi
}

type Mode = 'summary' | 'student';
type Detail = 'students' | 'breakdown' | 'etuts';

const STATUS_TONE: Record<AttStatus, Tone> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
  excused: 'info',
  unrecorded: 'neutral',
  upcoming: 'brand',
};

const toneSoft: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-fg',
  success: 'bg-success-soft text-success-fg',
  warning: 'bg-warning-soft text-warning-fg',
  danger: 'bg-danger-soft text-danger-fg',
  info: 'bg-info-soft text-info-fg',
  neutral: 'bg-surface-2 text-fg-2',
};

const RATE_HINT = 'Oran = (geldi + geç) ÷ (geldi + geç + gelmedi). İzinli, yoklama alınmamış ve yaklaşan etütler orana girmez.';

const fold = (v: string) => v.toLocaleLowerCase('tr-TR').trim();

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2);
  return s.toLocaleUpperCase('tr-TR');
};

// ----------------------------------------------------------------------------- Küçük parçalar
const StatusChip: React.FC<{ status: AttStatus }> = ({ status }) => (
  <span className={cx('ui-chip', toneSoft[STATUS_TONE[status]])}>{STATUS_LABEL[status]}</span>
);

const RateBadge: React.FC<{ rate: number | null }> = ({ rate }) =>
  rate == null ? (
    <span className="text-subtle" title="Değerlendirilecek yoklama yok">
      —
    </span>
  ) : (
    <span className={cx('ui-chip tabular-nums', toneSoft[rateTone(rate)])}>{formatRate(rate)}</span>
  );

const StatusStrip: React.FC<{ counts: Counts }> = ({ counts }) => (
  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2" aria-label="Durum dağılımı">
    {STATUS_ORDER.map((k) => (
      <div key={k} className={cx('rounded-xl px-3 py-2', toneSoft[STATUS_TONE[k]])}>
        <div className="text-lg font-bold tabular-nums leading-tight">{counts[k]}</div>
        <div className="text-[11px] font-semibold leading-tight">{STATUS_LABEL[k]}</div>
      </div>
    ))}
  </div>
);

const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode; className?: string }> = ({
  label,
  htmlFor,
  children,
  className,
}) => (
  <div className={cx('min-w-0', className)}>
    <label htmlFor={htmlFor} className="ui-label">
      {label}
    </label>
    {children}
  </div>
);

const selectCls = 'ui-input cursor-pointer';
const thCls = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap';
const thNum = 'px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap';
const tdCls = 'px-3 py-2 text-fg-2 align-top';
const tdNum = 'px-3 py-2 text-right tabular-nums text-fg-2 align-top';

const TableWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="overflow-x-auto rounded-xl border border-line">
    <table className="w-full text-sm">{children}</table>
  </div>
);

const SortTh: React.FC<{
  label: string;
  k: StudentSort['key'];
  sort: StudentSort;
  onSort: (s: StudentSort) => void;
  numeric?: boolean;
}> = ({ label, k, sort, onSort, numeric }) => {
  const active = sort.key === k;
  const nextDir: StudentSort['dir'] = active ? (sort.dir === 'asc' ? 'desc' : 'asc') : k === 'name' ? 'asc' : k === 'rate' ? 'asc' : 'desc';
  return (
    <th className={numeric ? thNum : thCls} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort({ key: k, dir: nextDir })}
        className={cx('inline-flex items-center gap-1 uppercase cursor-pointer hover:text-fg', active && 'text-fg')}
      >
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );
};

const StatusThs: React.FC = () => (
  <>
    {STATUS_ORDER.map((k) => (
      <th key={k} className={thNum}>
        {STATUS_SHORT[k]}
      </th>
    ))}
  </>
);

const StatusTds: React.FC<{ counts: Counts }> = ({ counts }) => (
  <>
    {STATUS_ORDER.map((k) => (
      <td key={k} className={cx(tdNum, counts[k] === 0 && 'text-subtle', k === 'absent' && counts[k] > 0 && 'text-danger-fg font-semibold')}>
        {counts[k]}
      </td>
    ))}
  </>
);

const GroupTable: React.FC<{ title: string; firstCol: string; rows: GroupRow[] }> = ({ title, firstCol, rows }) => (
  <section className="space-y-2">
    <h3 className="ui-eyebrow">{title}</h3>
    <TableWrap>
      <thead className="bg-surface-2">
        <tr>
          <th className={thCls}>{firstCol}</th>
          <th className={thNum}>Etüt</th>
          <StatusThs />
          <th className={thNum}>Katılım</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-line">
            <td className={cx(tdCls, 'font-semibold text-fg whitespace-nowrap')}>{r.label}</td>
            <td className={tdNum}>{r.etutCount}</td>
            <StatusTds counts={r.counts} />
            <td className={tdNum}>
              <RateBadge rate={r.rate} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  </section>
);

// ----------------------------------------------------------------------------- Ana bileşen
export const EtutAnalysisReportModal: React.FC<EtutAnalysisReportModalProps> = ({
  onClose,
  etuts,
  students,
  classes,
  preselectedStudentId,
  defaultScope = 'all',
}) => {
  const [today] = useState(() => localDateStr(new Date()));
  const me = useMemo(() => dataService.getCurrentTeacher(), []);
  const isAdmin = useMemo(() => dataService.isCurrentUserAdmin(), []);

  const infoMap = useMemo(() => buildStudentInfo(students, classes), [students, classes]);
  const allInfos = useMemo(
    () => Array.from(infoMap.values()).sort((a, b) => a.student.name.localeCompare(b.student.name, 'tr')),
    [infoMap]
  );
  const prepared = useMemo(() => prepareEtuts(etuts, today), [etuts, today]);
  const sortedClasses = useMemo(() => [...classes].sort((a, b) => classLabelOf(a).localeCompare(classLabelOf(b), 'tr', { numeric: true })), [classes]);

  // ---- Başlangıç durumu (pencere her açılışta yeniden kurulur)
  const pre = preselectedStudentId ? infoMap.get(preselectedStudentId) : undefined;
  const [mode, setMode] = useState<Mode>(() => (pre ? 'student' : 'summary'));
  const [teacherFilter, setTeacherFilter] = useState<string>(() => {
    if (!me) return 'all';
    if (pre) return defaultScope === 'mine' ? 'me' : 'all';
    return !isAdmin || defaultScope === 'mine' ? 'me' : 'all';
  });
  const [subject, setSubject] = useState('all');
  const [classId, setClassId] = useState<string>(() => (pre && classes.some((c) => c.id === pre.classId) ? pre.classId : 'all'));
  const [preset, setPreset] = useState<DatePreset>('term');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState<string>(() => pre?.student.id || '');
  const [detail, setDetail] = useState<Detail>('students');
  const [sort, setSort] = useState<StudentSort>({ key: 'rate', dir: 'asc' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const range = useMemo(() => presetRange(preset, today, { from: customFrom || null, to: customTo || null }), [preset, today, customFrom, customTo]);

  // ---- Seçenek listeleri
  const teacherOptions = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const pe of prepared) {
      const t = m.get(pe.teacherKey) || { name: pe.teacherName, count: 0 };
      t.count++;
      m.set(pe.teacherKey, t);
    }
    return Array.from(m.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [prepared]);
  const myCount = useMemo(() => prepared.filter((pe) => isMine(pe, me)).length, [prepared, me]);

  const selectedClass = classId === 'all' ? null : classes.find((c) => c.id === classId) || null;

  const selectableStudents = useMemo(() => {
    const q = fold(search);
    return allInfos.filter((i) => {
      if (classId !== 'all' && i.classId !== classId) return false;
      if (!q) return true;
      return fold(i.student.name).includes(q) || (i.student.studentNumber || '').includes(q);
    });
  }, [allInfos, classId, search]);

  // Seçili öğrenci filtrelenen listede yoksa ilk öğrenciye geçilir (açılır liste ile rapor hep aynı öğrenciyi gösterir)
  const effectiveStudentId = selectableStudents.some((i) => i.student.id === studentId) ? studentId : selectableStudents[0]?.student.id || '';
  const currentInfo: StudentInfo | undefined = effectiveStudentId ? infoMap.get(effectiveStudentId) : undefined;

  const subjectLevel = mode === 'student' ? currentInfo?.level : classLevelOf(selectedClass);
  const subjectOptions = useMemo(() => {
    const set = new Set<string>(subjectsForLevel(subjectLevel ?? null));
    prepared.forEach((pe) => set.add(pe.subject));
    if (subject !== 'all') set.add(subject);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [prepared, subjectLevel, subject]);

  // ---- Filtrelenmiş etütler (öğretmen + ders + tarih)
  const scoped = useMemo(
    () =>
      prepared.filter((pe) => {
        if (teacherFilter === 'me') {
          if (!isMine(pe, me)) return false;
        } else if (teacherFilter !== 'all' && pe.teacherKey !== teacherFilter) return false;
        if (subject !== 'all' && pe.subject !== subject) return false;
        return inRange(pe.etut.date, range);
      }),
    [prepared, teacherFilter, me, subject, range]
  );

  const scopeStudents = useMemo(() => (classId === 'all' ? allInfos : allInfos.filter((i) => i.classId === classId)), [allInfos, classId]);

  const summary = useMemo(
    () => (mode === 'summary' ? buildSummary(scoped, scopeStudents, classId !== 'all', today) : null),
    [mode, scoped, scopeStudents, classId, today]
  );
  // Sınıf seçili değilken yalnızca etüde atanmış öğrenciler listelenir
  const reportStudentRows = useMemo(() => {
    if (!summary) return [];
    const rows = classId === 'all' ? summary.studentRows.filter((r) => r.assigned > 0) : summary.studentRows;
    return sortStudentRows(rows, sort);
  }, [summary, classId, sort]);
  const visibleStudentRows = useMemo(() => {
    const q = fold(search);
    if (!q) return reportStudentRows;
    return reportStudentRows.filter((r) => fold(r.info.student.name).includes(q) || (r.info.student.studentNumber || '').includes(q));
  }, [reportStudentRows, search]);

  const studentReport = useMemo(
    () => (mode === 'student' && currentInfo ? buildStudentReport(scoped, currentInfo, today) : null),
    [mode, currentInfo, scoped, today]
  );

  // ---- Filtre açıklamaları (ekran, yazdırma, Excel)
  const teacherLabel =
    teacherFilter === 'all'
      ? 'Tüm öğretmenler'
      : teacherFilter === 'me'
        ? `Benim etütlerim${me?.name ? ` (${me.name})` : ''}`
        : teacherOptions.find((t) => t.key === teacherFilter)?.name || 'Seçili öğretmen';
  const subjectLabel = subject === 'all' ? 'Tüm dersler' : subject;
  const classLabel = selectedClass ? classLabelOf(selectedClass) : 'Tüm sınıflar';
  const presetLabel = DATE_PRESETS.find((p) => p.value === preset)?.label || '';
  const dateLabel = `${presetLabel}: ${rangeLabel(range)}`;

  const levelUnknownCount = summary?.levelUnknownCount ?? studentReport?.levelUnknownCount ?? 0;
  const levelNote =
    levelUnknownCount > 0
      ? `${levelUnknownCount} etüt "tüm öğrenciler" olarak atanmış ve kademe/sınıf bilgisi yok; bu etütler tüm öğrencilere sayıldı.`
      : null;

  const metaPairs: Array<[string, string]> = [
    ['Tarih aralığı', dateLabel],
    ['Öğretmen', teacherLabel],
    ['Ders', subjectLabel],
    ['Sınıf', classLabel],
  ];

  const hasData = mode === 'summary' ? !!summary && summary.etutCount > 0 : !!studentReport && studentReport.rows.length > 0;

  const printProps: PrintReportProps | null = useMemo(() => {
    if (mode === 'summary' && summary) {
      return {
        title: 'Etüt Katılım Raporu',
        subtitle: selectedClass ? `Sınıf: ${classLabel}` : 'Genel özet',
        meta: metaPairs,
        kpis: [
          ['Etüt', String(summary.etutCount)],
          ['Katılım oranı', formatRate(summary.rate)],
          ['Gelmedi', String(summary.totals.absent)],
          ['Yoklama alınmamış etüt', String(summary.unrecordedEtuts)],
        ],
        countsLine: countsPairs(summary.totals)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · '),
        notes: [RATE_HINT, ...(levelNote ? [levelNote] : [])],
        tables: [
          studentTable(reportStudentRows),
          groupTable('Ders bazında', 'Ders', summary.bySubject),
          groupTable('Öğretmen bazında', 'Öğretmen', summary.byTeacher),
          etutTable(summary.etutRows),
        ],
      };
    }
    if (mode === 'student' && studentReport && currentInfo) {
      const s = currentInfo.student;
      return {
        title: 'Öğrenci Etüt Raporu',
        subtitle: `${s.name}${s.studentNumber ? ` · No ${s.studentNumber}` : ''} · ${currentInfo.classLabel}`,
        meta: metaPairs.filter(([k]) => k !== 'Sınıf'),
        kpis: [
          ['Atanan etüt', String(studentReport.rows.length)],
          ['Katılım oranı', formatRate(studentReport.rate)],
          ['Gelmedi', String(studentReport.counts.absent)],
          ['Yoklama alınmadı', String(studentReport.counts.unrecorded)],
        ],
        countsLine: countsPairs(studentReport.counts)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · '),
        notes: [RATE_HINT, ...(levelNote ? [levelNote] : [])],
        tables: [studentEtutTable(studentReport.rows)],
      };
    }
    return null;
    // metaPairs / etiketler yukarıdaki durumlardan türetilir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, summary, studentReport, currentInfo, reportStudentRows, dateLabel, teacherLabel, subjectLabel, classLabel, levelNote]);

  // ---- Çıktılar
  const handlePrint = () => window.print();

  const handleExcel = async () => {
    if (!printProps) return;
    setExporting(true);
    setFeedback(null);
    try {
      const rangePart = range.from || range.to ? `${range.from || 'baslangic'}_${range.to || 'bugun'}` : 'Tum_kayitlar';
      const meta: Array<[string, string]> = [['Rapor', printProps.title], ['Kapsam', printProps.subtitle], ...printProps.meta, ['Oluşturma', new Date().toLocaleString('tr-TR')]];
      const overview = {
        title: 'Özet',
        head: ['Gösterge', 'Değer'],
        rows: [...printProps.kpis, ...(mode === 'summary' && summary ? countsPairs(summary.totals) : studentReport ? countsPairs(studentReport.counts) : [])],
      };
      let sheets: ExcelSheet[];
      let name: string;
      if (mode === 'summary' && summary) {
        sheets = [
          { name: 'Özet', table: overview, meta },
          { name: 'Öğrenciler', table: studentTable(reportStudentRows) },
          { name: 'Etütler', table: etutTable(summary.etutRows) },
          { name: 'Dersler', table: groupTable('Ders bazında', 'Ders', summary.bySubject) },
          { name: 'Öğretmenler', table: groupTable('Öğretmen bazında', 'Öğretmen', summary.byTeacher) },
        ];
        name = `Etut_Analizi_${selectedClass ? `${fileSafe(classLabel)}_` : ''}${rangePart}.xlsx`;
      } else {
        sheets = [
          { name: 'Özet', table: overview, meta },
          { name: 'Etütler', table: studentEtutTable(studentReport?.rows || []) },
        ];
        name = `Etut_Analizi_${fileSafe(currentInfo?.student.name || 'Ogrenci')}_${rangePart}.xlsx`;
      }
      await downloadExcel(name, sheets);
      setFeedback('Excel dosyası indirildi.');
    } catch (err) {
      console.error('Etüt analizi Excel hatası:', err);
      setFeedback('Excel dosyası oluşturulamadı.');
    } finally {
      setExporting(false);
    }
  };

  const openStudent = (id: string) => {
    setStudentId(id);
    setSearch('');
    setMode('student');
  };

  // ---- Boş durum (filtrelere göre etüt yok)
  const noEtutState = (
    <EmptyState
      icon={CalendarDays}
      title="Bu filtrelerle etüt bulunamadı"
      description={`${dateLabel} · ${teacherLabel} · ${subjectLabel}${mode === 'summary' ? ` · ${classLabel}` : ''}`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {teacherFilter !== 'all' && (
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setTeacherFilter('all')}>
              Tüm öğretmenleri göster
            </button>
          )}
          {preset !== 'all' && (
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setPreset('all')}>
              Tüm tarihleri göster
            </button>
          )}
          {subject !== 'all' && (
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setSubject('all')}>
              Tüm dersler
            </button>
          )}
        </div>
      }
    />
  );

  const searchInput = (id: string, placeholder: string) => (
    <div className="relative">
      <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        id={id}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
        className="ui-input pl-9"
        autoComplete="off"
      />
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="full"
      icon={BarChart3}
      tone="info"
      title="Etüt Analizi"
      description="Etüt katılımı, yoklama durumu ve öğrenci bazında rapor"
      id="etut-analysis-modal"
      footer={
        <>
          {feedback && (
            <span role="status" className="mr-auto self-center text-xs font-semibold text-muted">
              {feedback}
            </span>
          )}
          <button
            type="button"
            id="etut-analysis-excel"
            className="ui-btn ui-btn-secondary"
            onClick={handleExcel}
            disabled={!hasData || exporting}
            title="Raporu Excel dosyası olarak indir"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{exporting ? 'Hazırlanıyor…' : "Excel'e aktar"}</span>
          </button>
          <button
            type="button"
            id="etut-analysis-print"
            className="ui-btn ui-btn-primary"
            onClick={handlePrint}
            disabled={!hasData}
            title="Yazdır veya yazdırma penceresinden PDF olarak kaydet"
          >
            <Printer className="w-4 h-4" />
            <span>Yazdır / PDF</span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ---- Rapor türü + (telefonda) filtre düğmesi */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            items={[
              { value: 'summary', label: 'Genel özet', icon: BarChart3, id: 'etut-analysis-mode-summary' },
              { value: 'student', label: 'Öğrenci raporu', icon: User, id: 'etut-analysis-mode-student' },
            ]}
          />
          <button
            type="button"
            className="sm:hidden ui-btn ui-btn-secondary ui-btn-sm"
            aria-expanded={filtersOpen}
            aria-controls="etut-analysis-filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtreler</span>
            <ChevronDown className={cx('w-3.5 h-3.5 transition-transform', filtersOpen && 'rotate-180')} />
          </button>
        </div>

        {/* ---- Filtreler */}
        <div className="rounded-2xl border border-line bg-surface-2 p-3 sm:p-4 space-y-3">
          {!filtersOpen && (
            <p className="sm:hidden text-xs text-muted leading-relaxed">
              {presetLabel} · {teacherLabel} · {subjectLabel} · {classLabel}
            </p>
          )}
          <div id="etut-analysis-filters" className={cx(filtersOpen ? 'grid' : 'hidden', 'sm:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3')}>
            <Field label="Etüt öğretmeni" htmlFor="etut-analysis-teacher">
              <select id="etut-analysis-teacher" className={selectCls} value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
                <option value="all">Tüm öğretmenler ({prepared.length})</option>
                {me && <option value="me">Benim etütlerim ({myCount})</option>}
                {teacherOptions.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name} ({t.count})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ders" htmlFor="etut-analysis-subject">
              <select id="etut-analysis-subject" className={selectCls} value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="all">Tüm dersler</option>
                {subjectOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sınıf" htmlFor="etut-analysis-class">
              <select id="etut-analysis-class" className={selectCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="all">Tüm sınıflar</option>
                {sortedClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabelOf(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tarih aralığı" htmlFor="etut-analysis-range">
              <select id="etut-analysis-range" className={selectCls} value={preset} onChange={(e) => setPreset(e.target.value as DatePreset)}>
                {DATE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            {preset === 'custom' && (
              <>
                <Field label="Başlangıç" htmlFor="etut-analysis-from">
                  <input id="etut-analysis-from" type="date" className="ui-input" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </Field>
                <Field label="Bitiş" htmlFor="etut-analysis-to">
                  <input id="etut-analysis-to" type="date" className="ui-input" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </Field>
              </>
            )}
          </div>

          {/* Öğrenci seçimi her zaman görünür */}
          {mode === 'student' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:pt-3 sm:border-t sm:border-line">
              <Field label="Öğrenci ara" htmlFor="etut-analysis-search">
                {searchInput('etut-analysis-search', 'Ad veya numara')}
              </Field>
              <Field label={`Öğrenci (${selectableStudents.length})`} htmlFor="select-student-analysis">
                <select
                  id="select-student-analysis"
                  className={selectCls}
                  value={effectiveStudentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  disabled={selectableStudents.length === 0}
                >
                  {selectableStudents.length === 0 && <option value="">Öğrenci bulunamadı</option>}
                  {selectableStudents.map((i) => (
                    <option key={i.student.id} value={i.student.id}>
                      {i.student.name}
                      {i.student.studentNumber ? ` · ${i.student.studentNumber}` : ''} · {i.classLabel}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            {rangeLabel(range)}
          </span>
          <span>Bugün: {trDate(today)}</span>
        </p>
        {levelNote && (
          <div className="flex items-start gap-2 rounded-xl bg-info-soft text-info-fg px-3 py-2 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{levelNote}</span>
          </div>
        )}

        {/* ================= GENEL ÖZET ================= */}
        {mode === 'summary' && summary && (
          summary.etutCount === 0 ? (
            noEtutState
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  label="Etüt"
                  value={summary.etutCount}
                  hint={summary.upcomingEtuts ? `${summary.upcomingEtuts} yaklaşan` : 'Yaklaşan etüt yok'}
                  icon={CalendarDays}
                  tone="info"
                />
                <StatCard label="Katılım oranı" value={formatRate(summary.rate)} hint="geldi + geç / yoklaması alınan" icon={Percent} tone="success" />
                <StatCard label="Gelmedi" value={summary.totals.absent} hint="öğrenci · etüt" icon={UserX} tone="danger" />
                <StatCard label="Yoklama alınmamış" value={summary.unrecordedEtuts} hint="geçmiş / bugünkü etüt" icon={ClipboardX} tone="warning" />
              </div>
              <StatusStrip counts={summary.totals} />
              <p className="text-[11px] text-muted">{RATE_HINT}</p>

              <Segmented<Detail>
                size="sm"
                value={detail}
                onChange={setDetail}
                items={[
                  { value: 'students', label: `Öğrenciler (${reportStudentRows.length})` },
                  { value: 'breakdown', label: 'Ders ve öğretmen' },
                  { value: 'etuts', label: `Etütler (${summary.etutCount})` },
                ]}
              />

              {detail === 'students' && (
                <section className="space-y-2">
                  <div className="max-w-sm">{searchInput('etut-analysis-table-search', 'Tabloda öğrenci ara')}</div>
                  {visibleStudentRows.length === 0 ? (
                    <EmptyState icon={User} title="Öğrenci yok" description={search ? 'Aramaya uyan öğrenci yok.' : 'Bu etütlere atanmış öğrenci bulunamadı.'} className="py-6" />
                  ) : (
                    <TableWrap>
                      <thead className="bg-surface-2">
                        <tr>
                          <SortTh label="Öğrenci" k="name" sort={sort} onSort={setSort} />
                          <th className={thCls}>Sınıf</th>
                          <SortTh label="Atanan" k="assigned" sort={sort} onSort={setSort} numeric />
                          <StatusThs />
                          <SortTh label="Katılım" k="rate" sort={sort} onSort={setSort} numeric />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleStudentRows.map((r) => (
                          <tr key={r.info.student.id} className="border-t border-line hover:bg-surface-2/60">
                            <td className={cx(tdCls, 'min-w-[10rem]')}>
                              <button
                                type="button"
                                onClick={() => openStudent(r.info.student.id)}
                                className="text-left font-semibold text-fg hover:text-brand-fg hover:underline cursor-pointer"
                                title="Öğrenci raporunu aç"
                              >
                                {r.info.student.name}
                              </button>
                              {r.info.student.studentNumber && <span className="block text-[11px] text-subtle">No {r.info.student.studentNumber}</span>}
                            </td>
                            <td className={cx(tdCls, 'whitespace-nowrap')}>{r.info.classLabel}</td>
                            <td className={tdNum}>{r.assigned}</td>
                            <StatusTds counts={r.counts} />
                            <td className={tdNum}>
                              <RateBadge rate={r.rate} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  )}
                </section>
              )}

              {detail === 'breakdown' && (
                <div className="space-y-5">
                  <GroupTable title="Ders bazında" firstCol="Ders" rows={summary.bySubject} />
                  <GroupTable title="Öğretmen bazında" firstCol="Öğretmen" rows={summary.byTeacher} />
                </div>
              )}

              {detail === 'etuts' && (
                <TableWrap>
                  <thead className="bg-surface-2">
                    <tr>
                      <th className={thCls}>Tarih</th>
                      <th className={thCls}>Ders / konu</th>
                      <th className={thCls}>Öğretmen</th>
                      <th className={thNum}>Öğrenci</th>
                      <StatusThs />
                      <th className={thNum}>Katılım</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.etutRows.map((r) => (
                      <tr key={r.pe.etut.id} className="border-t border-line">
                        <td className={cx(tdCls, 'whitespace-nowrap')}>
                          <span className="font-semibold text-fg tabular-nums">{trDate(r.pe.etut.date)}</span>
                          <span className="block text-[11px] text-subtle tabular-nums">{r.pe.etut.time || '—'}</span>
                        </td>
                        <td className={cx(tdCls, 'min-w-[12rem]')}>
                          <span className="font-semibold text-fg">{r.pe.subject}</span>
                          {r.pe.etut.topic && <span className="block text-xs text-muted">{r.pe.etut.topic}</span>}
                          {r.pe.past && !r.pe.rollCallTaken && <span className="ui-chip ui-chip-warning mt-1">Yoklama alınmadı</span>}
                        </td>
                        <td className={cx(tdCls, 'whitespace-nowrap')}>{r.pe.teacherName}</td>
                        <td className={tdNum}>{r.assigned}</td>
                        <StatusTds counts={r.counts} />
                        <td className={tdNum}>
                          <RateBadge rate={r.rate} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </div>
          )
        )}

        {/* ================= ÖĞRENCİ RAPORU ================= */}
        {mode === 'student' &&
          (!currentInfo ? (
            <EmptyState icon={User} title="Öğrenci bulunamadı" description="Sınıf filtresini veya aramayı değiştirin." />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-brand-soft text-brand-fg inline-flex items-center justify-center font-bold text-sm shrink-0" aria-hidden="true">
                  {initials(currentInfo.student.name)}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-fg truncate">{currentInfo.student.name}</p>
                  <p className="text-xs text-muted">
                    {currentInfo.classLabel}
                    {currentInfo.student.studentNumber ? ` · No ${currentInfo.student.studentNumber}` : ''}
                    {currentInfo.level ? ` · ${currentInfo.level}` : ''}
                  </p>
                </div>
              </div>

              {studentReport && studentReport.rows.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard label="Atanan etüt" value={studentReport.rows.length} hint={`${studentReport.counts.upcoming} yaklaşan`} icon={CalendarDays} tone="info" />
                    <StatCard label="Katılım oranı" value={formatRate(studentReport.rate)} hint="geldi + geç / yoklaması alınan" icon={Percent} tone="success" />
                    <StatCard label="Gelmedi" value={studentReport.counts.absent} icon={UserX} tone="danger" />
                    <StatCard label="Yoklama alınmadı" value={studentReport.counts.unrecorded} icon={ClipboardX} tone="warning" />
                  </div>
                  <StatusStrip counts={studentReport.counts} />
                  <p className="text-[11px] text-muted">{RATE_HINT}</p>
                  <TableWrap>
                    <thead className="bg-surface-2">
                      <tr>
                        <th className={thCls}>Tarih</th>
                        <th className={thCls}>Ders / konu</th>
                        <th className={thCls}>Öğretmen</th>
                        <th className={thCls}>Durum</th>
                        <th className={thCls}>Not</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentReport.rows.map((r) => (
                        <tr key={r.pe.etut.id} className="border-t border-line">
                          <td className={cx(tdCls, 'whitespace-nowrap')}>
                            <span className="font-semibold text-fg tabular-nums">{trDate(r.pe.etut.date)}</span>
                            <span className="block text-[11px] text-subtle tabular-nums">{r.pe.etut.time || '—'}</span>
                          </td>
                          <td className={cx(tdCls, 'min-w-[12rem]')}>
                            <span className="font-semibold text-fg">{r.pe.subject}</span>
                            {r.pe.etut.topic && <span className="block text-xs text-muted">{r.pe.etut.topic}</span>}
                          </td>
                          <td className={cx(tdCls, 'whitespace-nowrap')}>{r.pe.teacherName}</td>
                          <td className={tdCls}>
                            <StatusChip status={r.status} />
                          </td>
                          <td className={cx(tdCls, 'text-xs min-w-[8rem]')}>{r.note || <span className="text-subtle">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </>
              ) : (
                noEtutState
              )}
            </div>
          ))}
      </div>

      {printProps && hasData && <EtutAnalysisPrint {...printProps} />}
    </Modal>
  );
};
