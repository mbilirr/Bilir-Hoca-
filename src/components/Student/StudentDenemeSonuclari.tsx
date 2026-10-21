import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { EmptyState, PageHeader, Segmented } from '../ui/kit';
import type { Student } from '../../types';
import { getTarget, isSetupError, listKazanimlar, loadMyDenemeler, type BankRow, type DenemeExam, type DenemeResult } from '../../services/denemeService';
import { SCOPES, kazanimKarneBlocks, oncelikKarneBlocks, pickScope, scopeLabel, studentKarneBlocks, studyPlanKarneBlocks, type ScopeKey } from '../../lib/deneme/karneModel';
import { priorityKarne } from '../../lib/deneme/veliKurumKarne';
import { OncelikKarneView } from '../Deneme/VeliKurumKarneleri';
import { downloadKarnePdf } from '../../lib/deneme/karnePdf';
import { StudentKarneView } from '../Deneme/KarneViews';
import { CalismaPlaniView, KARNE_TURLERI, KazanimTakipView, type KarneTur } from '../Deneme/KarneIleri';

// ============================================================================
// Öğrenci: Deneme Sonuçlarım (Aşama 47)
// Öğrenci yalnızca öğretmeninin "öğrencilere açtığı" denemelerdeki KENDİ sonucunu görür
// (veritabanı kuralı: 38 numaralı SQL). Başka öğrencilerin sonuçları hiçbir zaman gelmez;
// sınıf ortalaması ve sıralaması yalnızca sayı olarak görünür.
// ============================================================================

export const StudentDenemeSonuclari: React.FC<{ currentStudent: Student; /** Aşama 66: açılışta gösterilecek karne türü */ initialTur?: KarneTur }> = ({ currentStudent, initialTur }) => {
  const [exams, setExams] = useState<DenemeExam[]>([]);
  const [results, setResults] = useState<DenemeResult[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeKey>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [detailExamId, setDetailExamId] = useState(''); // Aşama 50: ayrıntılı karnesi görülen deneme
  const [tur, setTur] = useState<KarneTur>(initialTur || 'genel'); // Aşama 54: birleştirilmiş / kazanım takip / çalışma planı
  const [bank, setBank] = useState<BankRow[] | null | undefined>(undefined);

  // Aşama 54: "Henüz sorulmadı" için kazanım bankası (okunamazsa yalnızca sorulan kazanımlar gösterilir)
  useEffect(() => {
    if (tur !== 'kazanim' || bank !== undefined) return;
    let alive = true;
    listKazanimlar()
      .then((b) => alive && setBank(b))
      .catch(() => alive && setBank(null));
    return () => {
      alive = false;
    };
  }, [tur, bank]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await loadMyDenemeler();
        let tg: number | null = null;
        try {
          tg = await getTarget(currentStudent.id);
        } catch {
          tg = null;
        }
        if (!alive) return;
        setExams(r.exams);
        setResults(r.results.filter((x) => x.studentId === currentStudent.id));
        setTarget(tg);
      } catch (e: any) {
        if (alive) setError(isSetupError(e) ? null : e?.message || 'Deneme sonuçların yüklenemedi.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentStudent.id]);

  const scoped = useMemo(() => pickScope(exams, scope, (e) => picked.has(e.id)), [exams, scope, picked]);

  const onPdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const base = { studentName: currentStudent.name, className: currentStudent.className || '', exams: scoped, results, scopeLabel: scopeLabel(scope) };
      if (tur === 'kazanim') await downloadKarnePdf(kazanimKarneBlocks({ ...base, bank }), `${currentStudent.name} kazanım takip karnesi`, `Kazanim-Takip-Karnem-${currentStudent.name}`);
      else if (tur === 'plan') await downloadKarnePdf(studyPlanKarneBlocks(base), `${currentStudent.name} çalışma planı karnesi`, `Calisma-Plani-Karnem-${currentStudent.name}`);
      else if (tur === 'oncelik')
        await downloadKarnePdf(
          oncelikKarneBlocks(priorityKarne(scoped, results), { studentName: base.studentName, className: base.className, scopeLabel: base.scopeLabel, exams: scoped.filter((e) => results.some((r) => r.examId === e.id)) }),
          `${currentStudent.name} öncelikli konu karnesi`,
          `Oncelikli-Konular-${currentStudent.name}`
        );
      else await downloadKarnePdf(studentKarneBlocks({ ...base, target, detailExamId }), `${currentStudent.name} deneme karnesi`, `Deneme-Karnem-${currentStudent.name}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" id="student-deneme">
      <PageHeader
        icon={BarChart3}
        tone="brand"
        title="Deneme Sonuçlarım"
        description="Deneme puanların, ders netlerin ve konu analizin"
        actions={
          results.length > 0 ? (
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy} onClick={() => void onPdf()}>
              <Download /> {busy ? 'Hazırlanıyor…' : 'Karnemi indir (PDF)'}
            </button>
          ) : undefined
        }
      />
      {loading ? (
        <p className="text-sm text-muted">Yükleniyor…</p>
      ) : error ? (
        <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{error}</p>
      ) : !results.length ? (
        <div className="ui-card ui-card-pad">
          <EmptyState icon={BarChart3} title="Henüz deneme sonucun yok" description="Öğretmenin deneme sonuçlarını açtığında burada göreceksin." />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={tur} onChange={(v) => setTur(v)} size="sm" items={KARNE_TURLERI.filter((t) => t.value !== 'veli')} />
            <Segmented value={scope} onChange={(v) => setScope(v)} size="sm" items={SCOPES} />
          </div>
          {scope === 'custom' && (
            <div className="flex flex-wrap gap-1.5">
              {exams.map((e) => {
                const on = picked.has(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((cur) => {
                        const n = new Set(cur);
                        if (on) n.delete(e.id);
                        else n.add(e.id);
                        return n;
                      })
                    }
                    className={`ui-chip cursor-pointer border ${on ? 'ui-chip-brand border-brand/30' : 'ui-chip-neutral border-line'}`}
                  >
                    {e.name}
                  </button>
                );
              })}
            </div>
          )}
          {tur === 'kazanim' ? (
            <KazanimTakipView exams={scoped} results={results} bank={bank} bankLoading={bank === undefined} />
          ) : tur === 'plan' ? (
            <CalismaPlaniView exams={scoped} results={results} />
          ) : tur === 'oncelik' ? (
            <OncelikKarneView pk={priorityKarne(scoped, results)} />
          ) : (
          <StudentKarneView
            exams={scoped}
            results={results}
            target={target}
            studentName={currentStudent.name}
            className={currentStudent.className || ''}
            detailExamId={detailExamId}
            onDetailExamChange={setDetailExamId}
          />
          )}
        </>
      )}
    </div>
  );
};
