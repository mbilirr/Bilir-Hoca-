import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Trash2, Upload } from 'lucide-react';
import { Modal, Segmented, StatCard, cx } from '../ui/kit';
import { getExam, listResults, saveExam, saveResults, setExamPublished, deleteExam, deleteResult, type DenemeExam, type DenemeResult } from '../../services/denemeService';
import { LGS_SCORING, fmtNet, fmtScore, markOf, normalizeQuestions, rankAndSummarize, recomputeFromAnswers, type ExamQuestions } from '../../lib/deneme/lgs';
import { dateTr } from '../../lib/deneme/karneModel';
import { topicLabels } from '../../lib/deneme/analiz';
import { AnahtarEditor } from './AnahtarEditor';

// ============================================================================
// Deneme ayrıntısı (Aşama 47): sonuç listesi, soru analizi, öğrencilere açma, anahtar düzeltme.
// ============================================================================

export const DenemeSonuclar: React.FC<{
  examId: string;
  onBack: () => void;
  onUploadMore: (exam: DenemeExam) => void;
  onDeleted: () => void;
}> = ({ examId, onBack, onUploadMore, onDeleted }) => {
  const [exam, setExam] = useState<DenemeExam | null>(null);
  const [results, setResults] = useState<DenemeResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState('');
  const [view, setView] = useState<'list' | 'questions'>('list');
  const [keyOpen, setKeyOpen] = useState(false);
  const [draftKey, setDraftKey] = useState<ExamQuestions>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<DenemeResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ex, rs] = await Promise.all([getExam(examId), listResults(examId)]);
      setExam(ex);
      setResults(rs);
    } catch (e: any) {
      setError(e?.message || 'Deneme yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of results) m.set(r.classId || '-', r.className || 'Sınıfsız');
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'tr', { numeric: true }));
  }, [results]);
  const shown = useMemo(
    () => results.filter((r) => !classFilter || (r.classId || '-') === classFilter).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [results, classFilter]
  );

  if (loading) return <p className="text-sm text-muted">Yükleniyor…</p>;
  if (error || !exam)
    return (
      <div className="space-y-3">
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onBack}>
          <ArrowLeft /> Denemelere dön
        </button>
        <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{error || 'Deneme bulunamadı.'}</p>
      </div>
    );

  const subs = exam.subjects;
  const sum = exam.summary;
  const clsSum = classFilter ? (sum.classes || {})[classFilter] : undefined;

  const togglePublish = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await setExamPublished(exam.id, !exam.published);
      setExam({ ...exam, published: !exam.published });
      setNotice(!exam.published ? 'Sonuçlar öğrencilere açıldı: her öğrenci yalnızca kendi sonucunu ve karnesini görür.' : 'Sonuçlar öğrencilerden gizlendi.');
    } catch (e: any) {
      setNotice(e?.message || 'Değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  };

  // Cevap anahtarı düzeltilince bütün sonuçlar kayıtlı cevaplardan yeniden hesaplanır
  const saveKey = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const qs = normalizeQuestions(subs, draftKey);
      const missing = subs.filter((s) => (qs[s.key] || []).some((q) => !q.answer));
      if (missing.length) throw new Error(`Cevap anahtarı eksik: ${missing.map((s) => s.name).join(', ')}`);
      const next = results.map((r) => {
        const re = recomputeFromAnswers(r.answers, r.booklet, subs, qs, exam.scoring && exam.scoring.base ? exam.scoring : LGS_SCORING);
        return { ...r, stats: re.stats, totalNet: re.totalNet, score: re.score };
      });
      const summary = rankAndSummarize(next, subs, qs);
      const saved = await saveExam({ ...exam, questions: qs, summary });
      await saveResults(exam.id, next, false);
      setExam(saved);
      setResults(next);
      setKeyOpen(false);
      setNotice('Cevap anahtarı kaydedildi ve bütün sonuçlar yeniden hesaplandı.');
    } catch (e: any) {
      setNotice(e?.message || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deleteExam(exam.id);
      onDeleted();
    } catch (e: any) {
      setNotice(e?.message || 'Silinemedi.');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const doRemoveResult = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      await deleteResult(removeTarget.id);
      const rest = results.filter((r) => r.id !== removeTarget.id);
      const summary = rankAndSummarize(rest, subs, exam.questions);
      const saved = await saveExam({ ...exam, summary });
      await saveResults(exam.id, rest, false);
      setExam(saved);
      setResults(rest);
      setNotice(`${removeTarget.studentName} bu denemeden çıkarıldı; sıralamalar yeniden hesaplandı.`);
    } catch (e: any) {
      setNotice(e?.message || 'Çıkarılamadı.');
    } finally {
      setBusy(false);
      setRemoveTarget(null);
    }
  };

  return (
    <div className="space-y-4" id="deneme-detail">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onBack}>
          <ArrowLeft /> Denemelere dön
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-fg truncate">{exam.name}</h2>
          <p className="text-xs text-muted">
            {[exam.publisher, dateTr(exam.examDate), `${exam.grade}. sınıf ${exam.examType}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={cx('ui-chip', exam.published ? 'ui-chip-success' : 'ui-chip-neutral')}>{exam.published ? 'Öğrencilere açık' : 'Öğrencilere kapalı'}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={cx('ui-btn ui-btn-sm', exam.published ? 'ui-btn-secondary' : 'ui-btn-success')} disabled={busy} onClick={() => void togglePublish()}>
          {exam.published ? <EyeOff /> : <Eye />} {exam.published ? 'Öğrencilerden gizle' : 'Öğrencilere aç'}
        </button>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => onUploadMore(exam)}>
          <Upload /> Optik yükle (ek / düzeltme)
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-secondary ui-btn-sm"
          disabled={busy}
          onClick={() => {
            setDraftKey(exam.questions);
            setKeyOpen(true);
          }}
        >
          <KeyRound /> Cevap anahtarı ve kazanımlar
        </button>
        <button type="button" className="ui-btn ui-btn-danger-soft ui-btn-sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 /> Denemeyi sil
        </button>
      </div>
      {notice && <p role="status" className="text-xs font-semibold text-info-fg bg-info-soft rounded-xl px-3 py-2">{notice}</p>}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Öğrenci" value={classFilter ? clsSum?.count ?? 0 : sum.count ?? results.length} />
        <StatCard label="Ortalama puan" value={fmtScore(classFilter ? clsSum?.avgScore : sum.avgScore)} />
        <StatCard label="Ortalama toplam net" value={fmtNet(classFilter ? clsSum?.avgTotalNet : sum.avgTotalNet)} />
        <StatCard label="En yüksek puan" value={fmtScore(classFilter ? Math.max(0, ...shown.map((r) => r.score ?? 0)) : sum.maxScore)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          items={[
            { value: 'list', label: 'Sonuç listesi' },
            { value: 'questions', label: 'Soru analizi' },
          ]}
        />
        {view === 'list' && (
          <select className="ui-input w-auto py-1 text-xs" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Sınıf">
            <option value="">Tüm sınıflar</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {view === 'list' ? (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-fg-2">
              <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                <tr>
                  <th className="px-3 py-2.5 font-semibold text-center w-12">Sıra</th>
                  <th className="px-3 py-2.5 font-semibold">Öğrenci</th>
                  <th className="px-2 py-2.5 font-semibold">Sınıf</th>
                  <th className="px-2 py-2.5 font-semibold text-center">Kit.</th>
                  {subs.map((s) => (
                    <th key={s.key} className="px-2 py-2.5 font-semibold text-center" title={s.name}>
                      {s.short}
                      <span className="block normal-case tracking-normal font-normal text-[10px]">D/Y/N</span>
                    </th>
                  ))}
                  <th className="px-2 py-2.5 font-semibold text-center">Net</th>
                  <th className="px-2 py-2.5 font-semibold text-center">Puan</th>
                  <th className="px-3 py-2.5 font-semibold text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={subs.length + 7} className="px-4 py-8 text-center text-subtle">Sonuç yok.</td>
                  </tr>
                ) : (
                  shown.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/30 transition-colors">
                      <td className="px-3 py-1.5 text-center tabular-nums font-semibold">{classFilter ? r.stats.rank?.cls : r.stats.rank?.overall}</td>
                      <td className="px-3 py-1.5">
                        <p className="font-semibold text-fg">{r.studentName}</p>
                        {(r.stats.missing?.length || r.stats.bookletGuessed) && (
                          <p className="text-[10px] text-warning-fg">
                            {r.stats.missing?.length ? `${r.stats.missing.map((m) => (m === 'sozel' ? 'Sözel' : 'Sayısal')).join(', ')} oturumu boş` : ''}
                            {r.stats.bookletGuessed ? `${r.stats.missing?.length ? ' · ' : ''}Kitapçık tahmin edildi` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{r.className || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{r.booklet || '—'}</td>
                      {subs.map((s) => {
                        const x = r.stats.subjects?.[s.key];
                        return (
                          <td key={s.key} className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                            {x ? (
                              <>
                                <span className="text-success-fg">{x.d}</span>/<span className="text-danger-fg">{x.y}</span>/<b className="text-fg">{fmtNet(x.net)}</b>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center tabular-nums font-semibold text-fg">{fmtNet(r.totalNet)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums font-bold text-fg">{fmtScore(r.score)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon hover:text-danger-fg" title="Bu öğrenciyi denemeden çıkar" aria-label="Bu öğrenciyi denemeden çıkar" onClick={() => setRemoveTarget(r)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => {
            const qs = exam.questions[s.key] || [];
            return (
              <div key={s.key} className="rounded-2xl border border-line bg-surface">
                <p className="px-3 py-2 border-b border-line text-sm font-semibold text-fg">{s.name}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-fg-2">
                    <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                      <tr>
                        <th className="px-3 py-2 font-semibold w-12">Soru</th>
                        <th className="px-2 py-2 font-semibold w-14 text-center">Cevap</th>
                        <th className="px-2 py-2 font-semibold w-44">Doğru oranı</th>
                        <th className="px-2 py-2 font-semibold text-center w-24">D / Y / B</th>
                        <th className="px-3 py-2 font-semibold">Konu / kazanım</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {qs.map((q, i) => {
                        let d = 0;
                        let y = 0;
                        let b = 0;
                        for (const r of results) {
                          const m = markOf((r.answers[s.key] || '')[i], q);
                          if (m === 'D') d++;
                          else if (m === 'Y') y++;
                          else b++;
                        }
                        const n = d + y + b;
                        const rate = n ? Math.round((d / n) * 100) : 0;
                        return (
                          <tr key={q.no}>
                            <td className="px-3 py-1.5 font-bold text-fg tabular-nums">{q.no}</td>
                            <td className="px-2 py-1.5 text-center font-semibold">{q.answer === 'X' ? 'İptal' : q.answer}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 rounded-full bg-surface-2 overflow-hidden">
                                  <div className={cx('h-full rounded-full', rate >= 70 ? 'bg-success' : rate >= 50 ? 'bg-info' : rate >= 30 ? 'bg-warning' : 'bg-danger')} style={{ width: `${rate}%` }} />
                                </div>
                                <span className="tabular-nums w-9 text-right">%{rate}</span>
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-center tabular-nums">
                              {d} / {y} / {b}
                            </td>
                            <td className="px-3 py-1.5">
                              {(() => {
                                // Aşama 48g: karneyle aynı konu / alt kazanım ayrımı
                                const t = topicLabels(q);
                                return (
                                  <>
                                    <span className="text-fg">{q.konu || q.kazanim ? t.konu : '—'}</span>
                                    {t.alt && <span className="block text-[11px] text-muted">{t.alt}</span>}
                                  </>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={keyOpen}
        onClose={() => !busy && setKeyOpen(false)}
        title="Cevap anahtarı ve kazanımlar"
        description="Yayınevi düzeltme yaptıysa anahtarı değiştirin; bütün sonuçlar yeniden hesaplanır."
        icon={KeyRound}
        size="xl"
        footer={
          <>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setKeyOpen(false)}>
              Vazgeç
            </button>
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy} onClick={() => void saveKey()}>
              {busy ? 'Kaydediliyor…' : 'Kaydet ve yeniden hesapla'}
            </button>
          </>
        }
      >
        <AnahtarEditor subjects={subs} questions={draftKey} onChange={(q) => setDraftKey(normalizeQuestions(subs, q))} />
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => !busy && setConfirmDelete(false)}
        title="Deneme silinsin mi?"
        description={`"${exam.name}" ve ${results.length} öğrencinin sonucu kalıcı olarak silinir.`}
        icon={Trash2}
        tone="danger"
        size="sm"
        footer={
          <>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setConfirmDelete(false)}>
              Vazgeç
            </button>
            <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" disabled={busy} onClick={() => void doDelete()}>
              Sil
            </button>
          </>
        }
      >
        <p className="text-sm text-fg-2">Bu işlem geri alınamaz. Öğrencilerin karnelerinden de bu deneme kalkar.</p>
      </Modal>

      <Modal
        open={!!removeTarget}
        onClose={() => !busy && setRemoveTarget(null)}
        title="Öğrenci denemeden çıkarılsın mı?"
        description={removeTarget ? `${removeTarget.studentName} bu denemenin sonuçlarından çıkarılır.` : ''}
        icon={Trash2}
        tone="danger"
        size="sm"
        footer={
          <>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setRemoveTarget(null)}>
              Vazgeç
            </button>
            <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" disabled={busy} onClick={() => void doRemoveResult()}>
              Çıkar
            </button>
          </>
        }
      >
        <p className="text-sm text-fg-2">Yanlış öğrenciyle eşleşmiş bir satırı düzeltmek için kullanın; ardından "Optik yükle" ile doğru öğrenciye yeniden yükleyebilirsiniz.</p>
      </Modal>
    </div>
  );
};
