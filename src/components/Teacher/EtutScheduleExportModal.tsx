import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, ListChecks } from 'lucide-react';
import type { ClassGroup, Etut, Student } from '../../types';
import { EmptyState, Modal, Segmented } from '../ui/kit';
import {
  SORT_LABEL,
  addDaysYmd,
  buildSchedule,
  classLabelOf,
  downloadScheduleExcel,
  downloadSchedulePdf,
  periodRange,
  todayYmd,
  type ScheduleMeta,
  type SchedulePeriod,
  type ScheduleSort,
} from '../../lib/etutScheduleExport';

// Aşama 27: sınıfa ve döneme (günlük / haftalık) göre etüt listesi — Excel ve PDF olarak indirilir.
// Bu pencere yalnızca okur ve dosya üretir; etüt, öğrenci ya da sınıf kayıtlarını değiştirmez.
interface Props {
  onClose: () => void;
  etuts: Etut[]; // Etütler sayfasında görünen (seçili kapsamdaki) etütler
  students: Student[];
  classes: ClassGroup[];
}

const PREVIEW_ROWS = 12;
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export const EtutScheduleExportModal: React.FC<Props> = ({ onClose, etuts, students, classes }) => {
  const [period, setPeriod] = useState<SchedulePeriod>('week');
  const [anchor, setAnchor] = useState<string>(() => todayYmd());
  const [classPick, setClassPick] = useState<string>('all');
  const [sort, setSort] = useState<ScheduleSort>('time');
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null);
  const [feedback, setFeedback] = useState('');

  const classOptions = useMemo(
    () =>
      classes
        .map((c) => ({ id: c.id, label: classLabelOf(c) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true })),
    [classes]
  );
  // Seçili sınıf listeden kalktıysa "tüm sınıflar"a dön
  const classId = classPick === 'all' || classOptions.some((o) => o.id === classPick) ? classPick : 'all';
  const range = useMemo(() => periodRange(period, anchor), [period, anchor]);
  const result = useMemo(
    () => buildSchedule(etuts, students, classes, { from: range.from, to: range.to, classId, sort }),
    [etuts, students, classes, range.from, range.to, classId, sort]
  );
  const rows = result.rows;
  const classLabel = classId === 'all' ? 'Tüm sınıflar' : classOptions.find((o) => o.id === classId)?.label || '-';
  const meta: ScheduleMeta = { classLabel, allClasses: classId === 'all', periodLabel: range.label, period, sort, from: range.from, to: range.to };

  const shift = (dir: -1 | 1) => setAnchor((a) => addDaysYmd(a, dir * (period === 'day' ? 1 : 7)));

  const run = async (kind: 'excel' | 'pdf') => {
    setBusy(kind);
    setFeedback('');
    try {
      if (kind === 'excel') await downloadScheduleExcel(rows, meta);
      else await downloadSchedulePdf(rows, meta);
      setFeedback('Dosya indirildi.');
    } catch (err) {
      console.error('[etüt listesi] dosya hazırlanamadı', err);
      setFeedback('Dosya hazırlanamadı. Lütfen tekrar deneyin.');
    } finally {
      setBusy(null);
    }
  };

  const inputCls = 'w-full bg-surface border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-brand';

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={ListChecks}
      tone="info"
      title="Etüt listesi indir"
      description="Sınıfa göre: hangi öğrenci, hangi saatte, hangi öğretmenle, hangi konudan etüt alıyor"
      id="etut-schedule-export-modal"
      footer={
        <>
          {feedback && (
            <span role="status" id="etut-schedule-feedback" className="mr-auto self-center text-xs font-semibold text-muted">
              {feedback}
            </span>
          )}
          <button type="button" id="etut-schedule-excel" className="ui-btn ui-btn-secondary" onClick={() => run('excel')} disabled={!rows.length || !!busy}>
            <FileSpreadsheet className="w-4 h-4" />
            <span>{busy === 'excel' ? 'Hazırlanıyor…' : 'Excel indir'}</span>
          </button>
          <button type="button" id="etut-schedule-pdf" className="ui-btn ui-btn-primary" onClick={() => run('pdf')} disabled={!rows.length || !!busy}>
            <FileText className="w-4 h-4" />
            <span>{busy === 'pdf' ? 'Hazırlanıyor…' : 'PDF indir'}</span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="etut-schedule-class" className="block text-xs font-semibold text-muted mb-1">
              Sınıf
            </label>
            <select id="etut-schedule-class" value={classId} onChange={(e) => setClassPick(e.target.value)} className={inputCls}>
              <option value="all">Tüm sınıflar</option>
              {classOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-xs font-semibold text-muted mb-1">Dönem</span>
            <Segmented<SchedulePeriod>
              value={period}
              onChange={setPeriod}
              items={[
                { value: 'day', label: 'Günlük', id: 'etut-schedule-day' },
                { value: 'week', label: 'Haftalık', id: 'etut-schedule-week' },
              ]}
            />
          </div>
          <div>
            <label htmlFor="etut-schedule-date" className="block text-xs font-semibold text-muted mb-1">
              {period === 'day' ? 'Gün' : 'Haftadan bir gün'}
            </label>
            <div className="flex items-center gap-1.5">
              <button type="button" id="etut-schedule-prev" onClick={() => shift(-1)} aria-label={period === 'day' ? 'Önceki gün' : 'Önceki hafta'} className="ui-btn ui-btn-secondary !px-2">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input id="etut-schedule-date" type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className={inputCls} />
              <button type="button" id="etut-schedule-next" onClick={() => shift(1)} aria-label={period === 'day' ? 'Sonraki gün' : 'Sonraki hafta'} className="ui-btn ui-btn-secondary !px-2">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div>
            <span className="block text-xs font-semibold text-muted mb-1">Sıralama</span>
            <Segmented<ScheduleSort>
              value={sort}
              onChange={setSort}
              items={[
                { value: 'time', label: SORT_LABEL.time, id: 'etut-schedule-sort-time' },
                { value: 'student', label: SORT_LABEL.student, id: 'etut-schedule-sort-student' },
              ]}
            />
          </div>
        </div>

        <p className="text-sm text-fg-2" id="etut-schedule-summary">
          <strong>{classLabel}</strong> · {range.label} · <strong>{result.etutCount}</strong> etüt · <strong>{result.studentCount}</strong> öğrenci · <strong>{rows.length}</strong> satır
        </p>

        {result.missingCount > 0 && (
          <div role="alert" id="etut-schedule-missing" className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              Etütlere atanmış {result.missingCount} öğrenci kaydına ulaşılamadı (kayıt silinmiş olabilir ya da bu öğrenciyi görme yetkiniz yok). Bu kayıtlar listeye alınamadı.
            </span>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState title="Bu seçimde etüt yok" description="Başka bir sınıf ya da tarih seçin." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs" id="etut-schedule-preview">
              <thead className="bg-surface-2 text-muted text-left">
                <tr>
                  {['Tarih', 'Saat', 'Öğrenci', 'Sınıf', 'Ders / Konu', 'Öğretmen', 'Yer', 'Açıklama'].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PREVIEW_ROWS).map((r) => (
                  <tr key={`${r.etutId}:${r.studentId}`} className="border-t border-line align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.dateText} <span className="text-muted">{r.dayName}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.time}</td>
                    <td className="px-3 py-2 font-semibold">{r.student}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.className || '-'}</td>
                    <td className="px-3 py-2">
                      {r.subject}
                      {r.topic ? ` – ${r.topic}` : ''}
                    </td>
                    <td className="px-3 py-2">{r.teacher}</td>
                    <td className="px-3 py-2">{r.place || '-'}</td>
                    <td className="px-3 py-2 max-w-[14rem] truncate" title={r.note}>
                      {r.note ? oneLine(r.note) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > PREVIEW_ROWS && <p className="text-xs text-muted">İlk {PREVIEW_ROWS} satır gösteriliyor; indirilen dosyada tüm satırlar bulunur.</p>}
        <p className="text-xs text-muted">
          Liste, Etütler sayfasında seçili kapsamdaki etütlerden (Tüm okul / Benim etütlerim) hazırlanır. “Tüm sınıflar” seçilirse dosya sınıf sınıf bölünür.
        </p>
      </div>
    </Modal>
  );
};
