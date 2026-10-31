import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, ListOrdered } from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { Modal, Segmented, cx } from '../ui/kit';
import { byUploadOrder, listResultsLite, type DenemeExam, type DenemeResult } from '../../services/denemeService';
import { dateTr, pickScope, scopeLabel, type ScopeKey } from '../../lib/deneme/karneModel';
import { buildSiralama, downloadSiralamaExcel } from '../../lib/deneme/ortalamaSiralama';
import { gradeOf } from '../../lib/teacherGrades';

// ============================================================================
// Aşama 115: Denemeler › "Ortalama sıralama" — Son 3 / Son 5 / seçilen denemelerin ortalamasıyla öğrenci
// sıralaması (sınıf sınıf ya da toplu), Excel. Öğretmen, Zümre Başkanı ve Etüt Öğretmeni bu pencereyi açamaz
// (DenemeAnalizi düğmeyi göstermez). Sonuçlar yalnız "Excel indir"e basınca, hafif sütunlarla okunur.
// ============================================================================

const sel = 'h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500';
const lbl = 'block text-xs font-semibold text-muted mb-1';
type Kapsam = Extract<ScopeKey, 'last3' | 'last5' | 'custom'>;
const gradeOfExam = (e: DenemeExam) => String(parseInt(String(e.grade), 10) || e.grade || '');

export const OrtalamaSiralamaModal: React.FC<{
  onClose: () => void;
  exams: DenemeExam[]; // sonuçlu denemeler (taslak yok)
  students: Student[];
  classes: ClassGroup[];
}> = ({ onClose, exams, students, classes }) => {
  const asc = useMemo(() => exams.slice().sort(byUploadOrder), [exams]);
  const grades = useMemo(() => Array.from(new Set(asc.map(gradeOfExam).filter(Boolean))).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)), [asc]);
  const [grade, setGrade] = useState(() => (asc.length ? gradeOfExam(asc[asc.length - 1]) : ''));
  const [kapsam, setKapsam] = useState<Kapsam>('last3');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [classId, setClassId] = useState('all');
  const [duzen, setDuzen] = useState<'sinif' | 'toplu'>('sinif');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Aynı pencerede tekrar indirmede aynı denemelerin sonuçları yeniden okunmaz
  const [cache, setCache] = useState<{ key: string; results: DenemeResult[] } | null>(null);

  const inGrade = useMemo(() => asc.filter((e) => !grade || gradeOfExam(e) === grade), [asc, grade]);
  const scoped = useMemo(() => pickScope(inGrade, kapsam, (e) => picked.has(e.id)), [inGrade, kapsam, picked]);
  const classOptions = useMemo(
    () =>
      classes
        .filter((c) => {
          const g = gradeOf(c);
          return !grade || g === null || String(g) === grade;
        })
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true })),
    [classes, grade]
  );
  const cls = classId === 'all' || classOptions.some((c) => c.id === classId) ? classId : 'all';

  const download = async () => {
    if (!scoped.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const ids = scoped.map((e) => e.id);
      const key = ids.join(',');
      let results = cache?.key === key ? cache.results : null;
      if (!results) {
        results = await listResultsLite(ids);
        setCache({ key, results });
      }
      const res = buildSiralama(scoped, results, students, classes);
      if (!res.rows.length) {
        setMsg({ ok: false, text: 'Seçilen denemelerde sonuç yok.' });
        return;
      }
      const label = kapsam === 'custom' ? `Seçilen ${scoped.length} deneme` : scopeLabel(kapsam);
      const clsName = cls === 'all' ? 'Tum-Siniflar' : classOptions.find((c) => c.id === cls)?.name || 'Sinif';
      await downloadSiralamaExcel(res, {
        duzen,
        classId: cls,
        scopeLabel: label,
        grade,
        exams: scoped,
        fileBase: `Deneme-Ortalama-Siralama-${label}-${clsName}`.replace(/[^\p{L}\p{N}]+/gu, '-'),
      });
      setMsg({ ok: true, text: 'Excel indirildi.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Liste hazırlanamadı.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      size="sm"
      icon={ListOrdered}
      tone="brand"
      id="deneme-siralama-modal"
      title="Ortalama sıralama"
      description="Seçilen denemelerin ortalamasıyla sınıf ve genel sıralama"
      footer={
        <>
          {msg && (
            <span role="status" id="deneme-siralama-msg" className={cx('mr-auto self-center text-xs font-semibold', msg.ok ? 'text-success-fg' : 'text-danger-fg')}>
              {msg.text}
            </span>
          )}
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center" disabled={busy} onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            id="deneme-siralama-excel"
            className="ui-btn ui-btn-primary ui-btn-sm h-8 w-28 justify-center"
            disabled={busy || !scoped.length}
            onClick={() => void download()}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> {busy ? 'Hazırlanıyor' : 'Excel indir'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="deneme-siralama-grade" className={lbl}>Kademe</label>
            <select
              id="deneme-siralama-grade"
              className={sel}
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setPicked(new Set());
                setClassId('all');
              }}
            >
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}. sınıf
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="deneme-siralama-class" className={lbl}>Sınıf</label>
            <select id="deneme-siralama-class" className={sel} value={cls} onChange={(e) => setClassId(e.target.value)}>
              <option value="all">Tüm sınıflar</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={lbl}>Denemeler</span>
            <Segmented<Kapsam>
              size="sm"
              value={kapsam}
              onChange={setKapsam}
              items={[
                { value: 'last3', label: 'Son 3', id: 'deneme-siralama-son3' },
                { value: 'last5', label: 'Son 5', id: 'deneme-siralama-son5' },
                { value: 'custom', label: 'Seçerek', id: 'deneme-siralama-secerek' },
              ]}
            />
          </div>
          <div>
            <span className={lbl}>Liste düzeni</span>
            <Segmented<'sinif' | 'toplu'>
              size="sm"
              value={duzen}
              onChange={setDuzen}
              items={[
                { value: 'sinif', label: 'Sınıf sınıf', id: 'deneme-siralama-sinif' },
                { value: 'toplu', label: 'Toplu', id: 'deneme-siralama-toplu' },
              ]}
            />
          </div>
        </div>

        {kapsam === 'custom' && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-line divide-y divide-line" id="deneme-siralama-liste" aria-label="Denemeler">
            {inGrade
              .slice()
              .reverse()
              .map((e) => {
                const on = picked.has(e.id);
                return (
                  <label key={e.id} className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-surface-2/50">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-indigo-600"
                      checked={on}
                      onChange={() =>
                        setPicked((cur) => {
                          const n = new Set(cur);
                          if (on) n.delete(e.id);
                          else n.add(e.id);
                          return n;
                        })
                      }
                    />
                    <span className="flex-1 min-w-0 truncate text-fg">{e.name}</span>
                    <span className="text-muted tabular-nums">{dateTr(e.examDate)}</span>
                  </label>
                );
              })}
            {!inGrade.length && <p className="px-2.5 py-2 text-muted">Bu kademede deneme yok.</p>}
          </div>
        )}

        <p id="deneme-siralama-ozet" className="rounded-lg bg-surface-2 px-3 py-2 text-fg-2">
          {scoped.length ? (
            <>
              <strong>{scoped.length}</strong> deneme: {scoped.map((e) => e.name).join(' · ')}
            </>
          ) : kapsam === 'custom' ? (
            'Listeden en az bir deneme seçin.'
          ) : (
            'Bu kademede deneme yok.'
          )}
        </p>
        <p className="text-[11px] text-muted">
          Sıralama ortalama puana göredir (eşitlikte toplam net). Ortalama, öğrencinin girdiği denemelerden alınır; Excel'deki "Deneme" sütunu kaç denemeye girdiğini gösterir.
          {duzen === 'sinif' ? ' Her sınıf ayrı sayfadır.' : ' Tüm öğrenciler tek sayfada genel sıraya göre listelenir.'}
        </p>
      </div>
    </Modal>
  );
};
