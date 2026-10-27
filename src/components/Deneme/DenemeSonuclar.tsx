import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Eye, EyeOff, KeyRound, KeySquare, Trash2, Upload } from 'lucide-react';
import { downloadKarnePdf, type PdfBlock } from '../../lib/deneme/karnePdf';
import { Modal, Segmented, StatCard, cx } from '../ui/kit';
import { getExam, listResults, saveExam, saveResults, setExamPublished, deleteExam, deleteResult, type DenemeExam, type DenemeResult } from '../../services/denemeService';
import { LGS_SCORING, fmtNet, fmtScore, normalizeQuestions, rankAndSummarize, recomputeFromAnswers, type ExamQuestions } from '../../lib/deneme/lgs';
import { dateTr } from '../../lib/deneme/karneModel';
import { AnahtarEditor } from './AnahtarEditor';
import { MaddeAnalizi } from './MaddeAnalizi';
import { BOOKLET_MIN, bookletConsistency, keyBProblems } from '../../lib/deneme/bKitapcik';
import { useHistoryState } from '../../lib/useHistoryState';

// Aşama 91: A / B anahtarı penceresi yalnızca açılınca yüklenir (deneme ekranı hafif kalır)
const CevapAnahtariModal = lazy(() => import('./CevapAnahtariModal').then((m) => ({ default: m.CevapAnahtariModal })));

// Aşama 59: "Denemelere dön" belirgin düğme (marka renginde çerçeveli; üzerine gelince dolu)
const BACK_BTN =
  'ui-btn ui-btn-lg border border-brand/40 bg-brand-soft text-brand-fg shadow-sm hover:bg-brand hover:text-white hover:border-brand focus-visible:ring-2 focus-visible:ring-brand/40';

// ============================================================================
// Deneme ayrıntısı (Aşama 47): sonuç listesi, soru analizi, öğrencilere açma, anahtar düzeltme.
// ============================================================================

export const DenemeSonuclar: React.FC<{
  examId: string;
  onBack: () => void;
  onUploadMore: (exam: DenemeExam) => void;
  onDeleted: () => void;
  /** Aşama 82: salt okunur (Rehberlik / Öğretmen / Zümre Başkanı) — düzenleme düğmeleri gizlenir */
  readOnly?: boolean;
}> = ({ examId, onBack, onUploadMore, onDeleted, readOnly = false }) => {
  const [exam, setExam] = useState<DenemeExam | null>(null);
  const [results, setResults] = useState<DenemeResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState('');
  const [view, setView] = useHistoryState<'list' | 'questions'>('deneme.results.view', 'list'); // Aşama 52: geri tuşu
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyView, setKeyView] = useState(false); // Aşama 91: A / B anahtarı görüntüleme ve indirme
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
  // Aşama 62: B kitapçığı uyum kontrolü (A ve B kitapçıklı öğrencilerin soru soru doğru oranları)
  const bCheck = useMemo(() => (exam && results.length ? bookletConsistency(exam, results) : null), [exam, results]);
  const [bOpen, setBOpen] = useState(false);

  if (loading) return <p className="text-sm text-muted">Yükleniyor…</p>;
  if (error || !exam)
    return (
      <div className="space-y-3">
        <button type="button" className={BACK_BTN} onClick={onBack} id="deneme-geri">
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
      // Aşama 62: B kitapçığı eşleşmesi geçerli olmalı
      const bp = keyBProblems(subs, qs);
      if (bp.length) throw new Error(`B kitapçığı eşleşmesinde sorun var: ${bp[0]}${bp.length > 1 ? ` (+${bp.length - 1} sorun daha)` : ''}`);
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

  // ----------------------------------------------------------------------------- Aşama 50: sonuç listesi PDF
  // toplu: tüm öğrenciler tek liste (kurum sırası) · siniflar: her sınıf ayrı sayfada (sınıf sırası) · sinif: yalnızca seçili sınıf
  const resultsPdf = async (mode: 'toplu' | 'siniflar' | 'sinif') => {
    setBusy(true);
    setNotice(null);
    try {
      const head = ['Sıra', 'Öğrenci', 'Sınıf', 'Kit.', ...subs.map((s) => `${s.short} D/Y/N`), 'Top. net', 'Puan', mode === 'toplu' ? 'Sınıf sırası' : 'Kurum sırası'];
      const align = ['center', 'left', 'left', 'center', ...subs.map(() => 'center' as const), 'center', 'center', 'center'] as Array<'left' | 'center' | 'right'>;
      const rowOf = (r: DenemeResult, rank: number | undefined) => [
        rank ?? '-',
        r.studentName,
        r.className || '-',
        r.booklet || '-',
        ...subs.map((s) => {
          const x = r.stats.subjects?.[s.key];
          return x ? `${x.d}/${x.y}/${fmtNet(x.net)}` : '-';
        }),
        fmtNet(r.totalNet),
        fmtScore(r.score),
        mode === 'toplu' ? (r.stats.rank ? `${r.stats.rank.cls}/${r.stats.rank.clsCount}` : '-') : r.stats.rank ? `${r.stats.rank.overall}/${r.stats.rank.overallCount}` : '-',
      ];
      const sorted = results.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.totalNet ?? 0) - (a.totalNet ?? 0));
      const info = [exam.publisher, dateTr(exam.examDate), `${exam.grade}. sınıf ${exam.examType}`].filter(Boolean).join(' · ');
      const classBlock = (id: string, name: string, list: DenemeResult[]): PdfBlock[] => {
        const c = (sum.classes || {})[id];
        return [
          { kind: 'title', text: `${exam.name} — ${name}`, sub: info },
          {
            kind: 'kv',
            rows: [
              ['Öğrenci', String(list.length)],
              ['Ortalama puan', fmtScore(c?.avgScore)],
              ['Ortalama net', fmtNet(c?.avgTotalNet)],
              ['En yüksek puan', fmtScore(Math.max(0, ...list.map((r) => r.score ?? 0)))],
              ...subs.map((s) => [`${s.short} ort. net`, fmtNet(c?.avgNet?.[s.key])] as [string, string]),
            ],
          },
          { kind: 'table', head, rows: list.map((r) => rowOf(r, r.stats.rank?.cls)), align, fontSize: 7.4 },
        ];
      };
      let blocks: PdfBlock[] = [];
      let file = `Sonuc-Listesi-${exam.name}`;
      if (mode === 'toplu') {
        blocks = [
          { kind: 'title', text: `${exam.name} — Sonuç listesi`, sub: info },
          {
            kind: 'kv',
            rows: [
              ['Öğrenci', String(results.length)],
              ['Ortalama puan', fmtScore(sum.avgScore)],
              ['Ortalama net', fmtNet(sum.avgTotalNet)],
              ['En yüksek puan', fmtScore(sum.maxScore)],
            ],
          },
          { kind: 'table', head, rows: sorted.map((r) => rowOf(r, r.stats.rank?.overall)), align, fontSize: 7.2 },
        ];
      } else if (mode === 'siniflar') {
        classes.forEach(([id, name], i) => {
          const list = sorted.filter((r) => (r.classId || '-') === id);
          if (!list.length) return;
          if (i > 0 && blocks.length) blocks.push({ kind: 'pagebreak' });
          blocks.push(...classBlock(id, name, list));
        });
        file = `Sonuc-Listesi-Sinif-Sinif-${exam.name}`;
      } else {
        const name = classes.find(([id]) => id === classFilter)?.[1] || 'Sınıf';
        blocks = classBlock(classFilter, name, sorted.filter((r) => (r.classId || '-') === classFilter));
        file = `Sonuc-Listesi-${name}-${exam.name}`;
      }
      await downloadKarnePdf(blocks, `${exam.name} sonuç listesi`, file, 'landscape');
    } catch (e: any) {
      setNotice(e?.message || 'PDF hazırlanamadı.');
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
        <button type="button" className={BACK_BTN} onClick={onBack} id="deneme-geri">
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

      {readOnly && (
        <p className="text-xs font-semibold text-info-fg bg-info-soft rounded-xl px-3 py-2" id="deneme-readonly-note">
          Bu denemeyi yalnızca görüntüleyebilirsiniz; optik yükleme, cevap anahtarı ve silme işlemlerini Ölçme Değerlendirme ve yöneticiler yapar.
        </p>
      )}
      {readOnly && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setKeyView(true)} id="anahtar-goster">
            <KeySquare /> A / B anahtarı
          </button>
        </div>
      )}
      {!readOnly && (
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
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setKeyView(true)} id="anahtar-goster">
          <KeySquare /> A / B anahtarı
        </button>
        <button type="button" className="ui-btn ui-btn-danger-soft ui-btn-sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 /> Denemeyi sil
        </button>
      </div>
      )}
      {notice && <p role="status" className="text-xs font-semibold text-info-fg bg-info-soft rounded-xl px-3 py-2">{notice}</p>}

      {!readOnly && bCheck && bCheck.issues.length > 0 && (
        <div role="alert" id="b-kitapcik-uyum" className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs text-warning-fg space-y-1.5">
          <p className="font-bold">
            B kitapçığı uyum kontrolü: {bCheck.issues.length} soruda A ve B kitapçıklı öğrencilerin doğru oranları çok farklı. B eşleşmesi yanlış girilmiş olabilir.
          </p>
          {bCheck.wholeSubjects.length > 0 && (
            <p className="font-semibold">
              {bCheck.wholeSubjects.join(', ')}: sorunların çoğu bu derste; B sırası bütünüyle yanlış seçilmiş olabilir ("A'nın tersi" / "A ile aynı sıra" / soru soru).
            </p>
          )}
          <p className="text-fg-2">
            A kitapçığı {bCheck.nA}, B kitapçığı {bCheck.nB} öğrenci. Doğru eşleşmede bir sorunun zorluğu iki kitapçıkta da benzer çıkar; yanlış eşleşmede B'deki doğru oranı rastgele seviyesine düşer.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setBOpen((v) => !v)} aria-expanded={bOpen}>
              {bOpen ? 'Soruları gizle' : 'Soruları göster'}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-warning ui-btn-sm"
              disabled={busy}
              onClick={() => {
                setDraftKey(exam.questions);
                setKeyOpen(true);
              }}
            >
              <KeyRound /> Cevap anahtarını düzelt
            </button>
          </div>
          {bOpen && (
            <ul className="rounded-lg bg-surface border border-line divide-y divide-line text-fg-2">
              {bCheck.issues.slice(0, 40).map((it) => (
                <li key={`${it.subject.key}-${it.no}`} className="px-2.5 py-1.5 flex flex-wrap gap-x-2">
                  <b className="text-fg">
                    {it.subject.short} {it.no}. soru (B'de {it.bNo}.)
                  </b>
                  <span>
                    A kitapçığında doğru %{it.rateA} · B kitapçığında %{it.rateB}
                  </span>
                  {it.suggest && (
                    <span className="font-semibold text-info-fg">
                      Muhtemel B numarası: {it.suggest.bNo} (doğru cevap B'nin {it.suggest.bNo}. sorusunda %{it.suggest.rate} oranında işaretlenmiş)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {bCheck && !bCheck.enough && bCheck.nB > 0 && (
        <p className="text-[11px] text-muted">
          B kitapçığı uyum kontrolü için kitapçık başına en az {BOOKLET_MIN} öğrenci gerekir (A: {bCheck.nA}, B: {bCheck.nB}).
        </p>
      )}

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
            { value: 'questions', label: 'Soru ve çeldirici analizi' },
          ]}
        />
        {results.length > 0 && (
          <select className="ui-input w-auto py-1 text-xs" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Sınıf">
            <option value="">Tüm sınıflar</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        {view === 'list' && results.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5" id="deneme-sonuc-pdf">
            <span className="text-[11px] text-muted">PDF:</span>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => void resultsPdf('toplu')} title="Bütün öğrenciler tek listede, kurum sırasıyla">
              <Download /> Toplu liste
            </button>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || classes.length < 1} onClick={() => void resultsPdf('siniflar')} title="Her sınıf ayrı sayfada, sınıf sırasıyla">
              <Download /> Sınıf sınıf
            </button>
            {classFilter && (
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy} onClick={() => void resultsPdf('sinif')}>
                <Download /> {classes.find(([id]) => id === classFilter)?.[1] || 'Bu sınıf'}
              </button>
            )}
          </div>
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
                        {!readOnly && (
                          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon hover:text-danger-fg" title="Bu öğrenciyi denemeden çıkar" aria-label="Bu öğrenciyi denemeden çıkar" onClick={() => setRemoveTarget(r)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // Aşama 54: soru (madde) analizi + çeldirici analizi; sınıf seçilince kurumla karşılaştırma
        <MaddeAnalizi exam={exam} results={results} classId={classFilter} className={classes.find(([id]) => id === classFilter)?.[1] || 'Sınıf'} />
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

      {keyView && (
        <Suspense fallback={null}>
          <CevapAnahtariModal exam={exam} open={keyView} onClose={() => setKeyView(false)} />
        </Suspense>
      )}

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
