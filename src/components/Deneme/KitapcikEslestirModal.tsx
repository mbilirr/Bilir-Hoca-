import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, FileText, Sparkles } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import type { ExamQuestions, ExamSubject } from '../../lib/deneme/lgs';
import { extractPdfItems, openKitapcik } from '../../lib/deneme/kitapcik';
import { applyMatch, bookletFromAi, bookletQuestions, coverage, matchSubject, type BookletQuestions, type SubjectMatch } from '../../lib/deneme/kitapcikEslestir';
import { bookletKey } from '../../lib/deneme/anahtarCikti';
import { AI_CONCURRENCY, DAY_DONE_MSG, aiCall, aiSorular, aiStatus, newAiState, runPool, type AiImage, type AiSoru } from '../../lib/aiApi';

// ============================================================================
// Aşama 93-94: A / B kitapçık PDF'lerinden soru eşleştirme penceresi.
//  1) Önce PDF'in yazı katmanı okunur (dijital kitapçık: yapay zekâ gerekmez, ücretsiz ve hızlı).
//  2) Kitapçık taranmışsa ya da yazıdan soruların çoğu bulunamazsa "Yapay zekâ ile oku" önerilir: sayfa resimlerinden
//     her sorunun dersi, numarası ve metninin başı okunur (öğrenci bilgisi gitmez).
//  Eşleştirme ve cevap harfi kontrolü her iki yolda da tarayıcıda yapılır.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm w-28 justify-center';
type Side = 'A' | 'B';
const AI_BATCH = 3; // bir istekteki sayfa

export const KitapcikEslestirModal: React.FC<{
  open: boolean;
  onClose: () => void;
  subjects: ExamSubject[];
  questions: ExamQuestions;
  onApply: (qs: ExamQuestions, summary: string) => void;
}> = ({ open, onClose, subjects, questions, onApply }) => {
  const refs = { A: useRef<HTMLInputElement | null>(null), B: useRef<HTMLInputElement | null>(null) };
  const [files, setFiles] = useState<Record<Side, File[]>>({ A: [], B: [] });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<SubjectMatch[] | null>(null);
  const [via, setVia] = useState<'yazi' | 'ai'>('yazi');
  const [offer, setOffer] = useState<string | null>(null); // yapay zekâ önerisi (neden)
  const stopRef = useRef(false);
  useEffect(
    () => () => {
      stopRef.current = true;
    },
    []
  );

  const keyed = subjects.filter((s) => (questions[s.key] || []).some((q) => q.answer));

  const matchAll = (A: BookletQuestions, B: BookletQuestions): SubjectMatch[] => {
    const out: SubjectMatch[] = [];
    for (const s of keyed) {
      const a = A.bySubject[s.key];
      const b = B.bySubject[s.key];
      if (!a || !b) continue;
      const list = questions[s.key] || [];
      const mapped = list.some((q) => q.bNo && q.bNo !== q.no);
      out.push(matchSubject(s, list, a, b, mapped ? bookletKey(s, questions, 'B') : null));
    }
    return out;
  };

  const reset = () => {
    setRes(null);
    setOffer(null);
    setErr(null);
  };

  // 1) Yazı katmanından
  const run = async () => {
    setBusy(true);
    reset();
    setProgress('Kitapçıklar okunuyor…');
    try {
      const read = (fs: File[]) => Promise.all(fs.map((f) => extractPdfItems(f, 80)));
      const [pa, pb] = await Promise.all([read(files.A), read(files.B)]);
      const A = bookletQuestions(pa, keyed);
      const B = bookletQuestions(pb, keyed);
      const cv = coverage(A, B, keyed);
      if (A.textless || B.textless || cv.ratio < 0.9) {
        setOffer(
          A.textless || B.textless
            ? 'Kitapçık taranmış (resim); PDF\'te okunabilir yazı yok.'
            : `Kitapçık taranmış görünüyor: yazıdan ${cv.total} sorunun yalnızca ${cv.found} tanesi güvenle bulunabildi.`
        );
        return;
      }
      setVia('yazi');
      setRes(matchAll(A, B));
    } catch (e: any) {
      setErr(e?.message || 'Kitapçıklar okunamadı.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  // 2) Yapay zekâ ile (taranmış kitapçık)
  const runAi = async () => {
    setBusy(true);
    setErr(null);
    stopRef.current = false;
    const books: Array<{ side: Side; book: Awaited<ReturnType<typeof openKitapcik>> }> = [];
    try {
      const st = await aiStatus();
      const keys = st.ok ? { gemini: !!st.gemini, mistral: !!st.mistral } : null;
      if (!keys || (!keys.gemini && !keys.mistral)) throw new Error(st.error || 'Yapay zekâ anahtarı tanımlı değil (Vercel > GEMINI_API_KEY).');
      const state = newAiState(keys.gemini ? 'gemini' : 'mistral', true, keys);
      for (const side of ['A', 'B'] as Side[]) books.push({ side, book: await openKitapcik(files[side]) });
      const jobs: Array<{ side: Side; pages: number[] }> = [];
      for (const { side, book } of books) for (let p = 1; p <= book.pageCount; p += AI_BATCH) jobs.push({ side, pages: Array.from({ length: Math.min(AI_BATCH, book.pageCount - p + 1) }, (_, i) => p + i) });
      const got: Record<Side, AiSoru[]> = { A: [], B: [] };
      const fails: string[] = [];
      let done = 0;
      let ji = 0;
      let fatal = '';
      const show = (wait?: string | null) => setProgress(`Yapay zekâ kitapçıkları okuyor: ${done} / ${jobs.length}${wait ? ` · ${wait}` : ''}`);
      show();
      await runPool(
        AI_CONCURRENCY,
        () => {
          if (ji >= jobs.length || fatal) return null;
          const job = jobs[ji++];
          return async () => {
            const book = books.find((b) => b.side === job.side)!.book;
            const images: AiImage[] = [];
            for (const p of job.pages) {
              const img = await book.render(p, 1000, 0.72, 600_000).catch(() => null);
              if (img) images.push({ mime: img.mime, data: img.data, page: p });
            }
            if (images.length) {
              const r = await aiCall(state, (pv, avoid) => aiSorular({ provider: pv, images, avoid }), { stop: () => stopRef.current, onWait: (w) => show(w) });
              if (r.ok) got[job.side].push(...((r.items || []) as AiSoru[]));
              else if (!stopRef.current) {
                if (r.code === 'quota-day') fatal = DAY_DONE_MSG;
                else if (r.code === 'no-key') fatal = r.error || 'Yapay zekâ anahtarı tanımlı değil.';
                else fails.push(`${job.side} kitapçığı ${job.pages[0]}-${job.pages[job.pages.length - 1]}. sayfalar`);
              }
            }
            done++;
            show();
          };
        },
        () => stopRef.current
      );
      if (stopRef.current) return;
      if (fatal) throw new Error(fatal);
      const A = bookletFromAi(got.A, keyed);
      const B = bookletFromAi(got.B, keyed);
      const out = matchAll(A, B);
      if (!out.length) throw new Error('Yapay zekâ kitapçıklarda soru bulamadı. Doğru dosyaları seçtiğinizden emin olun.');
      setVia('ai');
      setOffer(null);
      setRes(out);
      if (fails.length) setErr(`Okunamayan sayfalar: ${fails.join(', ')}. Bu sayfalardaki sorular sarı görünür; tekrar deneyebilirsiniz.`);
    } catch (e: any) {
      if (!stopRef.current) setErr(e?.message || 'Yapay zekâ ile okunamadı.');
    } finally {
      for (const b of books) b.book.destroy();
      setBusy(false);
      setProgress('');
    }
  };

  const close = () => {
    stopRef.current = true;
    onClose();
  };

  const apply = () => {
    if (!res) return;
    const next = { ...questions };
    for (const m of res) next[m.subject.key] = applyMatch(questions[m.subject.key] || [], m);
    const changed = res.reduce((a, m) => a + m.changed, 0);
    const check = res.reduce((a, m) => a + m.pairs.filter((p) => p.status !== 'kesin').length, 0);
    onApply(
      next,
      `Kitapçık eşleşmesi uygulandı${via === 'ai' ? ' (yapay zekâ ile okundu)' : ''}: ${res.map((m) => m.subject.short).join(', ')} · ${changed} sorunun B numarası değişti${check ? ` · ${check} soruyu kontrol edin` : ''}.`
    );
    onClose();
  };

  const pick = (side: Side) => (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-semibold text-fg">{side} kitapçığı</span>
      <button type="button" className={cx(BTN, 'ui-btn-secondary')} disabled={busy} onClick={() => refs[side].current?.click()} id={`kit-${side}`}>
        <FileText /> PDF seç
      </button>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{files[side].length ? files[side].map((f) => f.name).join(', ') : 'Seçilmedi'}</span>
      <input
        ref={refs[side]}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files || []);
          setFiles((cur) => ({ ...cur, [side]: fs }));
          reset();
          e.target.value = '';
        }}
      />
    </div>
  );

  const total = res ? res.reduce((a, m) => a + m.pairs.length, 0) : 0;
  const sure = res ? res.reduce((a, m) => a + m.sure, 0) : 0;
  const ready = !!files.A.length && !!files.B.length;

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      id="kitapcik-eslestir"
      icon={ArrowLeftRight}
      title="Kitapçıkla soru eşleştir"
      description="A ve B kitapçığındaki aynı sorular metinlerinden bulunur."
      footer={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={close}>
            Vazgeç
          </button>
          {res ? (
            <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={apply} id="kit-uygula">
              Uygula
            </button>
          ) : offer ? (
            <button type="button" className={cx(BTN, 'ui-btn-primary')} disabled={busy} onClick={() => void runAi()} id="kit-ai">
              <Sparkles /> {busy ? 'Okunuyor' : 'Yapay zekâ'}
            </button>
          ) : (
            <button type="button" className={cx(BTN, 'ui-btn-primary')} disabled={busy || !ready} onClick={() => void run()} id="kit-eslestir">
              {busy ? 'Okunuyor' : 'Eşleştir'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-2">
          {pick('A')}
          {pick('B')}
        </div>
        <p className="text-[11px] text-muted">
          Sözel ve sayısal ayrı dosyaysa ikisini birlikte seçin. Dijital kitapçık bu bilgisayarda okunur. Taranmış kitapçıkta sayfa resimleri yapay zekâya gönderilir (yalnızca kitapçık; öğrenci bilgisi gitmez).
        </p>
        {offer && !res && (
          <div className="rounded-lg bg-warning-soft px-2.5 py-2 text-xs text-warning-fg space-y-1" id="kit-ai-oneri">
            <p className="font-semibold">{offer}</p>
            <p>
              "Yapay zekâ" düğmesiyle sayfa resimlerinden her sorunun numarası ve metninin başı okunur; eşleştirme ve cevap harfi kontrolü yine bu bilgisayarda yapılır. İki kitapçık için birkaç dakika sürebilir.
            </p>
          </div>
        )}
        {progress && (
          <p className="text-xs text-info-fg bg-info-soft rounded-lg px-2.5 py-1.5" role="status">
            {progress}
          </p>
        )}
        {err && (
          <p role="alert" className="text-xs font-semibold text-danger-fg bg-danger-soft rounded-lg px-2.5 py-1.5">
            {err}
          </p>
        )}
        {res && (
          <div className="space-y-2" id="kit-sonuc">
            <p className={cx('text-xs font-semibold rounded-lg px-2.5 py-1.5', sure === total ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-warning-fg')}>
              {sure === total ? `${total} sorunun hepsi kesin eşleşti.` : `${total} sorudan ${sure} tanesi kesin eşleşti; sarı soruları kitapçıktan kontrol edin.`}
              {via === 'ai' && ' (Yapay zekâ ile okundu.)'}
            </p>
            <ul className="rounded-lg border border-line divide-y divide-line text-xs">
              {res.map((m) => {
                const odd = m.pairs.filter((p) => p.status !== 'kesin');
                const moved = m.pairs.filter((p) => p.bNo && p.bNo !== p.oldBNo);
                return (
                  <li key={m.subject.key} className="px-2.5 py-1.5 space-y-1" data-ders={m.subject.key}>
                    <div className="flex items-center gap-2">
                      <b className="text-fg min-w-0 flex-1 truncate">{m.subject.name}</b>
                      <span className="tabular-nums text-muted">
                        {m.sure}/{m.pairs.length} kesin
                      </span>
                      <span className={cx('ui-chip', moved.length ? 'ui-chip-brand' : 'ui-chip-neutral')}>{moved.length ? `${moved.length} değişiklik` : 'Değişiklik yok'}</span>
                    </div>
                    {moved.length > 0 && (
                      <p className="text-[11px] text-fg-2">
                        {moved.map((p) => `${p.aNo}. soru: B'de ${p.bNo} (şimdi ${p.oldBNo})`).join(' · ')}
                      </p>
                    )}
                    {odd.length > 0 && (
                      <p className="text-[11px] font-semibold text-warning-fg">
                        Kontrol: {odd.map((p) => `${p.aNo}. soru${p.status === 'harf' ? ' (cevap harfi uyuşmuyor)' : p.status === 'yok' ? ' (okunamadı; numarası değişmez)' : ` (benzerlik %${p.sim})`}`).join(' · ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {keyed.some((s) => !res.some((m) => m.subject.key === s.key)) && (
              <p className="text-[11px] text-muted">
                Kitapçıklarda bulunamayan dersler: {keyed.filter((s) => !res.some((m) => m.subject.key === s.key)).map((s) => s.short).join(', ')} (B numaraları değişmez).
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
