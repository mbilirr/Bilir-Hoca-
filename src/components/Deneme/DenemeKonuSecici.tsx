import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { cx } from '../ui/kit';
import type { Student } from '../../types';
import { dataService } from '../../services/dataService';
import { getExamsFull, listExams, listResultsFor, type DenemeExam, type DenemeResult } from '../../services/denemeService';
import { studentTopicRows, topicLabels } from '../../lib/deneme/analiz';
import { guessSubjectKey } from '../../lib/deneme/optik';
import { LGS_SUBJECTS } from '../../lib/deneme/lgs';

// ============================================================================
// Aşama 50 — ETÜT OLUŞTURURKEN DENEME KONULARI
// Etüt formundaki derse ait deneme konuları (kazanımlar) açılır listede gelir. Konu seçilince etüt konusu
// olarak yazılır; öğrenci listesinde her öğrencinin o konudaki deneme başarısı renkle gösterilir:
//   %30 altı kırmızı · %30-49 turuncu · %50-59 mavi.
// Yalnızca Deneme Analizi yetkisi olanlar görür (deneme sonuçları veritabanı kurallarıyla korunur).
// Aşama 98: optiği henüz okunmamış (taslak) denemelerin konuları da listelenir; bu konularda öğrenci başarısı
// sonuçlar yüklenince görünür (kuruma aktarılan denemeler taslak olarak gelir).
// Aşama 98b: etüt dersi deneme dersi değilse (ör. Rehberlik) panelde deneme dersi seçilir; konu o dersten alınır
// ve etüt konusuna "Ders: konu" olarak yazılır (etüdün dersi değişmez).
// ============================================================================

type Scope = 'son' | 'son3' | 'son5' | 'tum';
export type KonuRates = Record<string, { rate: number; total: number }>;

export const DenemeKonuSecici: React.FC<{
  subjectName: string;
  classIds: string[]; // öğrenci listesindeki sınıf süzgeci
  students: Student[];
  initialTopic?: string;
  selectedIds: string[];
  onPickTopic: (label: string) => void;
  onRates: (rates: KonuRates | null) => void;
  onSelectIds: (ids: string[]) => void;
}> = ({ subjectName, classIds, students, initialTopic, selectedIds, onPickTopic, onRates, onSelectIds }) => {
  const allowed = dataService.canUseDeneme();
  const baseKey = useMemo(() => guessSubjectKey(subjectName || ''), [subjectName]);
  const [altKey, setAltKey] = useState('');
  const subjectKey = baseKey || altKey || null;
  const altName = !baseKey && altKey ? LGS_SUBJECTS.find((x) => x.key === altKey)?.name || '' : '';
  const [scope, setScope] = useState<Scope>('son3');
  const [list, setList] = useState<DenemeExam[] | null>(null);
  const [exams, setExams] = useState<DenemeExam[]>([]);
  const [konu, setKonu] = useState('');
  const [results, setResults] = useState<DenemeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Deneme listesi (bir kez, panel açılınca)
  useEffect(() => {
    if (!allowed || !open || list) return;
    let alive = true;
    listExams({ drafts: true })
      .then((l) => alive && setList(l))
      .catch((e) => alive && setError(e?.message || 'Denemeler yüklenemedi.'));
    return () => {
      alive = false;
    };
  }, [allowed, open, list]);

  // Etüt "Deneme yönlendirme"den açıldıysa panel kendiliğinden açılır
  useEffect(() => {
    if (allowed && initialTopic) setOpen(true);
  }, [allowed, initialTopic]);

  const scoped = useMemo(() => {
    if (!list) return [] as DenemeExam[];
    const withSubject = list.filter((e) => !subjectKey || e.subjects.some((s) => s.key === subjectKey));
    const n = scope === 'son' ? 1 : scope === 'son3' ? 3 : scope === 'son5' ? 5 : withSubject.length;
    return withSubject.slice(0, n); // liste en yeni önce
  }, [list, scope, subjectKey]);
  const scopedIds = scoped.map((e) => e.id).join(',');
  const draftIds = useMemo(() => new Set((list || []).filter((e) => e.draftInfo).map((e) => e.id)), [list]);
  const doneExams = useMemo(() => exams.filter((e) => !draftIds.has(e.id)), [exams, draftIds]);

  useEffect(() => {
    if (!allowed || !open || !scoped.length) {
      setExams([]);
      return;
    }
    let alive = true;
    setLoading(true);
    getExamsFull(scoped.map((e) => e.id))
      .then((ex) => alive && setExams(ex))
      .catch((e) => alive && setError(e?.message || 'Denemeler yüklenemedi.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, open, scopedIds]);

  // Bu dersin deneme konuları (soru sayısıyla)
  const topics = useMemo(() => {
    if (!subjectKey) return [] as Array<{ label: string; count: number; pending: boolean }>;
    const m = new Map<string, { count: number; done: boolean }>();
    for (const e of exams) {
      const done = !draftIds.has(e.id);
      for (const q of e.questions[subjectKey] || []) {
        if (!q.answer || !(q.konu || q.kazanim)) continue;
        const { konu: k } = topicLabels(q);
        const cur = m.get(k) || { count: 0, done: false };
        m.set(k, { count: cur.count + 1, done: cur.done || done });
      }
    }
    return Array.from(m.entries())
      .map(([label, v]) => ({ label, count: v.count, pending: !v.done }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }));
  }, [exams, subjectKey, draftIds]);
  const konuPending = !!konu && !!topics.find((t) => t.label === konu)?.pending;

  // Etüt yönlendirmeden gelen konu listede varsa seçili gelir
  useEffect(() => {
    if (!initialTopic || konu || initialTopic.length < 8) return;
    const hit = topics.find((t) => t.label === initialTopic || t.label.startsWith(initialTopic));
    if (hit) setKonu(hit.label);
  }, [initialTopic, topics, konu]);

  // Seçilen sınıf(lar)ın sonuçları
  const classKey = classIds.join(',');
  useEffect(() => {
    if (!allowed || !open || !konu || !doneExams.length || konuPending) {
      setResults([]);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const ids = doneExams.map((e) => e.id);
        const rs = classIds.length
          ? (await Promise.all(classIds.map((cid) => listResultsFor({ examIds: ids, classId: cid })))).flat()
          : await listResultsFor({ examIds: ids });
        if (alive) setResults(rs);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Deneme sonuçları yüklenemedi.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, open, konu, doneExams, classKey, konuPending]);

  const rates: KonuRates | null = useMemo(() => {
    if (!konu || !subjectKey || !results.length) return null;
    const out: KonuRates = {};
    const studentIds = new Set(students.map((s) => s.id));
    for (const r of studentTopicRows(doneExams, results, subjectKey, 'konu')) {
      if (r.konu !== konu || !studentIds.has(r.studentId)) continue;
      out[r.studentId] = { rate: r.rate, total: r.total };
    }
    return out;
  }, [konu, subjectKey, results, doneExams, students]);

  useEffect(() => {
    onRates(rates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);

  if (!allowed) return null;

  const bands = rates
    ? {
        red: Object.entries(rates).filter(([, v]) => v.rate < 30).map(([k]) => k),
        orange: Object.entries(rates).filter(([, v]) => v.rate >= 30 && v.rate < 50).map(([k]) => k),
        blue: Object.entries(rates).filter(([, v]) => v.rate >= 50 && v.rate < 60).map(([k]) => k),
      }
    : null;
  const addSel = (ids: string[]) => onSelectIds(Array.from(new Set([...selectedIds, ...ids])));

  return (
    <div className="rounded-xl border border-brand/25 bg-brand-soft/40 p-3 space-y-2" id="etut-deneme-konu">
      <div className="flex flex-wrap items-center gap-2">
        <BarChart3 className="w-4 h-4 text-brand-fg" />
        <span className="text-xs font-bold text-fg">Deneme konusundan seç</span>
        {!open ? (
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm ml-auto" onClick={() => setOpen(true)}>
            Deneme konularını göster
          </button>
        ) : (
          <select className="ui-input w-auto py-1 text-xs ml-auto" value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="Deneme kapsamı">
            <option value="son">Son deneme</option>
            <option value="son3">Son 3 deneme</option>
            <option value="son5">Son 5 deneme</option>
            <option value="tum">Tüm denemeler</option>
          </select>
        )}
      </div>
      {open && (
        <>
          {!baseKey && (
            <div className="flex flex-wrap items-center gap-2" id="etut-deneme-ders">
              <span className="text-[11px] text-muted flex-1 min-w-[12rem]">
                "{subjectName || 'Bu ders'}" deneme dersi değil; konulara bakmak için deneme dersini seçin.
              </span>
              <select
                className="ui-input h-8 py-0 text-xs w-44"
                value={altKey}
                onChange={(e) => {
                  setAltKey(e.target.value);
                  setKonu('');
                }}
                aria-label="Deneme dersi"
                id="etut-deneme-ders-sec"
              >
                <option value="">Deneme dersi seçin</option>
                {LGS_SUBJECTS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!subjectKey ? null : (
            <select
              className="ui-input text-xs"
              value={konu}
              onChange={(e) => {
                setKonu(e.target.value);
                if (e.target.value) onPickTopic((altName ? `${altName}: ${e.target.value}` : e.target.value).slice(0, 160));
              }}
              aria-label="Deneme konusu"
              disabled={loading && !topics.length}
            >
              <option value="">{loading && !topics.length ? 'Yükleniyor…' : topics.length ? '— Deneme konusu / kazanım seçin —' : 'Bu derste kazanımı girilmiş deneme sorusu yok'}</option>
              {topics.map((t) => (
                <option key={t.label} value={t.label}>
                  {t.label} ({t.count} soru{t.pending ? ' · optik okunmamış' : ''})
                </option>
              ))}
            </select>
          )}
          {error && <p className="text-[11px] font-semibold text-danger-fg">{error}</p>}
          {konuPending && (
            <p className="text-[11px] font-semibold text-warning-fg" id="etut-deneme-konu-bekliyor">
              Bu konunun denemesi henüz optik okunmamış. Konu etüde yazılır; öğrenci başarısı sonuçlar yüklenince görünür.
            </p>
          )}
          {konu && !konuPending && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-md bg-danger px-1.5 py-0.5 font-bold text-white">%30 altı {bands ? `· ${bands.red.length}` : ''}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-warning px-1.5 py-0.5 font-bold text-white">%30-49 {bands ? `· ${bands.orange.length}` : ''}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-info px-1.5 py-0.5 font-bold text-white">%50-59 {bands ? `· ${bands.blue.length}` : ''}</span>
                <span className="text-muted">{loading ? 'Sonuçlar yükleniyor…' : classIds.length ? 'Seçili sınıfın öğrencileri renklendirildi.' : 'Bütün sınıfların öğrencileri renklendirildi; aşağıdan sınıf seçerek daraltabilirsiniz.'}</span>
              </div>
              {bands && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={cx('ui-btn ui-btn-sm', bands.red.length ? 'ui-btn-secondary' : 'ui-btn-ghost')} disabled={!bands.red.length} onClick={() => addSel(bands.red)}>
                    Kırmızıları seç ({bands.red.length})
                  </button>
                  <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!bands.red.length && !bands.orange.length} onClick={() => addSel([...bands.red, ...bands.orange])}>
                    %50 altını seç ({bands.red.length + bands.orange.length})
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                    disabled={!bands.red.length && !bands.orange.length && !bands.blue.length}
                    onClick={() => addSel([...bands.red, ...bands.orange, ...bands.blue])}
                  >
                    %60 altını seç ({bands.red.length + bands.orange.length + bands.blue.length})
                  </button>
                </div>
              )}
              {rates && !Object.keys(rates).length && !loading && <p className="text-[11px] text-muted">Seçili sınıflarda bu konuda deneme sonucu olan öğrenci yok.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
};
