import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, ImagePlus, Pause, RefreshCw, ShieldCheck, Sparkles, ZoomIn } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import type { ExamQuestion, ExamQuestions, ExamSubject } from '../../lib/deneme/lgs';
import { listKazanimlar, type BankRow } from '../../services/denemeService';
import { bankSubjectKey, codeKey } from '../../lib/deneme/kazanimBank';
import { formatPageRanges, openKitapcik, parsePageRanges, type Kitapcik } from '../../lib/deneme/kitapcik';
import {
  AI_CONCURRENCY,
  AI_PROVIDERS,
  DAY_DONE_MSG,
  aiCall,
  aiClassifyPage,
  aiPages,
  aiStatus,
  newAiState,
  runPool,
  type AiImage,
  type AiPageInfo,
  type AiProvider,
  type AiSuggestion,
} from '../../lib/aiApi';

// ============================================================================
// Kitapçıktan yapay zekâ ile kazanım bulma (Aşama 48)
// 1) Kitapçığın tamamı seçilir (bir ya da birden çok PDF, ör. sözel + sayısal; ya da sayfa resimleri).
//    Sayfalar bilgisayarda resme çevrilir.
// 2) Yapay zekâ küçük sayfa resimlerinden hangi sayfanın hangi derse ait olduğunu ve sayfadaki soru
//    numaralarını bulur; öğretmen haritaya bakıp gerekirse düzeltir.
// 3) Her sayfa, o sayfadaki derslerin kazanım listesiyle birlikte gönderilir; her soru için kazanım,
//    konu ve alt kazanım önerilir.
// 4) Öğretmen önerileri onaylar ya da değiştirir; cevap anahtarına yazılır.
// Öğrenci bilgisi bu işleme hiç girmez.
// ============================================================================

type Step = 'pick' | 'scan' | 'map' | 'run' | 'review';

interface Found {
  sug: AiSuggestion;
  page: number;
  provider: AiProvider;
}

interface Decision {
  apply: boolean;
  code: string;
  code2: string;
  konu: string;
  alt: string;
}

type PageMap = Record<number, Array<{ ders: string; sorular: number[] }>>;

const SCAN_BATCH = 8; // sayfa tanımada bir istekteki sayfa sayısı
const confTone = (g: number) => (g >= 75 ? 'ui-chip-success' : g >= 50 ? 'ui-chip-info' : 'ui-chip-warning');
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const numsText = (n: number[]) => (n.length > 2 && n[n.length - 1] - n[0] === n.length - 1 ? `${n[0]}-${n[n.length - 1]}` : n.join(', '));

export const KazanimAI: React.FC<{
  open: boolean;
  onClose: () => void;
  subjects: ExamSubject[];
  questions: ExamQuestions;
  onApply: (qs: ExamQuestions, summary: string) => void;
}> = ({ open, onClose, subjects, questions, onApply }) => {
  const [step, setStep] = useState<Step>('pick');
  const [book, setBook] = useState<Kitapcik | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [opening, setOpening] = useState(false);
  const [zoom, setZoom] = useState<{ page: number; url: string | null } | null>(null);
  const [pageMap, setPageMap] = useState<PageMap>({});
  const [ranges, setRanges] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [fallback, setFallback] = useState(true);
  const [keys, setKeys] = useState<{ gemini: boolean; mistral: boolean } | null>(null);
  const [bank, setBank] = useState<BankRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string; wait?: string | null } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [found, setFound] = useState<Record<string, Record<number, Found>>>({});
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bookRef = useRef<Kitapcik | null>(null);
  const keysRef = useRef<{ gemini: boolean; mistral: boolean } | null>(null);

  // Pencere açılınca: anahtar durumu ve kazanım bankası
  useEffect(() => {
    if (!open) return;
    setError(null);
    void aiStatus().then((r) => {
      if (r.ok) {
        const k = { gemini: !!r.gemini, mistral: !!r.mistral };
        keysRef.current = k;
        setKeys(k);
        if (!r.gemini && r.mistral) setProvider('mistral');
      } else setError(r.error || 'Yapay zekâ servisine ulaşılamadı.');
    });
    listKazanimlar()
      .then(setBank)
      .catch(() => setBank([]));
  }, [open]);

  // Kapatınca kitapçığı bellekten çıkar
  useEffect(() => {
    bookRef.current = book;
  }, [book]);
  useEffect(
    () => () => {
      stopRef.current = true;
      bookRef.current?.destroy();
    },
    []
  );

  const bankBySubject = useMemo(() => {
    const m: Record<string, BankRow[]> = {};
    for (const r of bank) {
      const k = bankSubjectKey(r.subject);
      if (!k) continue;
      (m[k] = m[k] || []).push(r);
    }
    return m;
  }, [bank]);
  const bankByCode = useMemo(() => new Map(bank.map((r) => [codeKey(r.code), r])), [bank]);
  const subjectKeys = useMemo(() => new Set(subjects.map((s) => s.key)), [subjects]);

  const pagesOf = (key: string) => (book ? parsePageRanges(ranges[key] || '', book.pageCount) : []);
  const selected = subjects.filter((s) => pagesOf(s.key).length > 0);

  // ----------------------------------------------------------------------------- 1) Kitapçığı aç
  const onFiles = async (list: FileList | null) => {
    if (!list || !list.length) return;
    stopRef.current = false;
    setOpening(true);
    setError(null);
    setThumbs([]);
    setPageMap({});
    setRanges({});
    book?.destroy();
    setBook(null);
    let b: Kitapcik | null = null;
    try {
      const opened = await openKitapcik(Array.from(list));
      if (opened.pageCount > 120) {
        opened.destroy();
        throw new Error('Kitapçık 120 sayfadan uzun olamaz.');
      }
      b = opened;
      setBook(opened);
      const out: string[] = [];
      for (let p = 1; p <= opened.pageCount; p++) {
        const img = await opened.render(p, 180, 0.6);
        out.push(img.dataUrl);
        setThumbs([...out]);
      }
    } catch (e: any) {
      setError(e?.message || 'Kitapçık açılamadı.');
    }
    setOpening(false);
    if (!b) return;
    if (keysRef.current && (keysRef.current.gemini || keysRef.current.mistral)) await scan(b);
    else setStep('map');
  };

  // ----------------------------------------------------------------------------- 2) Sayfa tanıma
  const scan = async (b: Kitapcik) => {
    stopRef.current = false;
    setStep('scan');
    setError(null);
    const notes: string[] = [];
    const map: PageMap = {};
    const state = newAiState(provider, fallback, keysRef.current);
    const total = Math.ceil(b.pageCount / SCAN_BATCH);
    let done = 0;
    let bi = 0;
    let noKey = false;
    const progressOf = () => ({ done, total, label: `Sayfalar tanınıyor (aynı anda ${AI_CONCURRENCY} istek)` });
    setProgress(progressOf());

    const job = (i: number) => async () => {
      const from = i * SCAN_BATCH + 1;
      const to = Math.min(b.pageCount, from + SCAN_BATCH - 1);
      // Sayfa tanıma için küçük resim yeterli (istek hızlı gider)
      const images: AiImage[] = [];
      for (let p = from; p <= to; p++) {
        const img = await b.render(p, 800, 0.65, 350_000).catch(() => null);
        if (img) images.push({ mime: img.mime, data: img.data, page: p });
      }
      if (images.length) {
        const r = await aiCall(state, (pv, avoid) => aiPages({ provider: pv, images, avoid }), {
          stop: () => stopRef.current,
          onWait: (w) => setProgress({ ...progressOf(), wait: w }),
          onNote: (n) => notes.push(n),
        });
        if (r.ok) {
          for (const pg of (r.pages || []) as AiPageInfo[]) map[pg.page] = pg.dersler.filter((d) => subjectKeys.has(d.ders));
          setPageMap({ ...map });
        } else if (!stopRef.current) {
          if (r.code === 'quota-day') {
            if (!notes.includes(DAY_DONE_MSG)) notes.push(DAY_DONE_MSG);
          } else notes.push(`${from}-${to}. sayfalar tanınamadı (${r.error || 'hata'}); bu sayfaları elle yazabilirsiniz.`);
          if (r.code === 'no-key' || r.code === 'quota-day') noKey = true;
        }
      }
      done++;
      setProgress(progressOf());
    };
    await runPool(AI_CONCURRENCY, () => (bi < total && !noKey ? job(bi++) : null), () => stopRef.current);
    // Ders sayfa aralıklarını otomatik doldur
    const next: Record<string, string> = {};
    for (const s of subjects) {
      const pages = Object.keys(map)
        .map(Number)
        .filter((p) => map[p].some((d) => d.ders === s.key));
      if (pages.length) next[s.key] = formatPageRanges(pages);
    }
    setRanges(next);
    setPageMap(map);
    setLog(notes);
    setProgress(null);
    setProvider(state.provider);
    setStep('map');
  };

  const openZoom = async (page: number) => {
    if (!book) return;
    setZoom({ page, url: null });
    try {
      const img = await book.render(page, 1100, 0.85);
      setZoom({ page, url: img.dataUrl });
    } catch {
      setZoom(null);
    }
  };

  // Ders kitapçıkta 21-30 gibi devam eden numaralarla basıldıysa: dersin kendi sırasına çevirme farkı
  const offsetOf = (s: ExamSubject): number => {
    const nums: number[] = [];
    for (const p of pagesOf(s.key)) for (const d of pageMap[p] || []) if (d.ders === s.key) nums.push(...d.sorular);
    if (!nums.length) return 0;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return min > 1 && max - min + 1 <= s.count ? min - 1 : 0;
  };

  // ----------------------------------------------------------------------------- 3) Kazanım bulma
  const run = async () => {
    if (!book || !selected.length) return;
    const bk: Kitapcik = book;
    stopRef.current = false;
    setError(null);
    setStep('run');
    const offsets: Record<string, number> = {};
    for (const s of selected) offsets[s.key] = offsetOf(s);
    // Sayfa → o sayfadaki dersler
    const byPage = new Map<number, ExamSubject[]>();
    for (const s of selected) for (const p of pagesOf(s.key)) byPage.set(p, [...(byPage.get(p) || []), s]);
    const pageList = Array.from(byPage.keys()).sort((a, b) => a - b);
    // Hız için ardışık iki sayfa tek istekte gönderilir
    const groups: number[][] = [];
    for (let i = 0; i < pageList.length; i++) {
      if (i + 1 < pageList.length && pageList[i + 1] === pageList[i] + 1) {
        groups.push([pageList[i], pageList[i + 1]]);
        i++;
      } else groups.push([pageList[i]]);
    }

    const result: Record<string, Record<number, Found>> = {};
    const notes: string[] = [...log];
    const state = newAiState(provider, fallback, keysRef.current);
    let done = 0;
    let gi = 0;
    let noKey = false;
    const usedModels = new Set<string>();
    const progressOf = () => ({ done, total: groups.length, label: `Sorular inceleniyor (aynı anda ${AI_CONCURRENCY} istek)` });
    setProgress(progressOf());

    const job = (pages: number[]) => async () => {
      const images: AiImage[] = [];
      for (const p of pages) {
        const img = await bk.render(p, 1400, 0.8, 1_400_000).catch(() => null);
        if (img) images.push({ mime: img.mime, data: img.data, page: p });
        else notes.push(`${p}. sayfa resme çevrilemedi.`);
      }
      if (images.length) {
        const subs = Array.from(new Set(pages.flatMap((p) => byPage.get(p) || []))).slice(0, 4);
        const payloadSubjects = subs.map((s) => {
          const off = offsets[s.key] || 0;
          const parts: string[] = [];
          for (const p of pages) {
            const seen = (pageMap[p] || []).find((d) => d.ders === s.key)?.sorular || [];
            if (!seen.length) continue;
            parts.push(
              `${p}. sayfada görünen numaralar: ${numsText(seen)}${off ? ` (dersin kendi sırasıyla ${numsText(seen.map((n) => n - off))})` : ''}.`
            );
          }
          let hint = parts.join(' ');
          if (off) hint += ` Bu ders kitapçıkta ${off + 1}. sorudan başlar; "no" alanına dersin kendi sırasını yaz (kitapçıktaki numaradan ${off} çıkar).`;
          return {
            key: s.key,
            name: s.name,
            count: s.count,
            hint: hint.trim(),
            kazanimlar: (bankBySubject[s.key] || []).slice(0, 400).map((k) => ({ code: k.code, konu: k.konu, text: k.text, alt: k.alt || [] })),
          };
        });
        const r = await aiCall(state, (pv, avoid) => aiClassifyPage({ provider: pv, images, subjects: payloadSubjects, avoid }), {
          stop: () => stopRef.current,
          onWait: (w) => setProgress({ ...progressOf(), wait: w }),
          onNote: (n) => notes.push(n),
        });
        if (r.ok) {
          if (r.model) usedModels.add(r.model);
          for (const it of (r.items || []) as AiSuggestion[]) {
            const map = (result[it.ders] = result[it.ders] || {});
            const prev = map[it.no];
            if (!prev || it.guven > prev.sug.guven) map[it.no] = { sug: it, page: it.sayfa || pages[0], provider: (r.provider as AiProvider) || state.provider };
          }
          setFound({ ...result });
        } else if (!stopRef.current) {
          if (r.code === 'quota-day') {
            if (!notes.includes(DAY_DONE_MSG)) notes.push(DAY_DONE_MSG);
          } else notes.push(`${pages.join('-')}. sayfa işlenemedi: ${r.error || 'hata'}`);
          if (r.code === 'no-key' || r.code === 'quota-day') noKey = true;
        }
      }
      done++;
      setProgress(progressOf());
    };
    await runPool(AI_CONCURRENCY, () => (gi < groups.length && !noKey ? job(groups[gi++]) : null), () => stopRef.current);
    if (usedModels.size > 1) notes.push(`Sınırlar nedeniyle birden çok model kullanıldı: ${Array.from(usedModels).join(', ')}. Güveni düşük satırları kontrol edin.`);
    setProgress(null);
    setLog(notes);
    setFound(result);

    // Karar tablosu
    const dec: Record<string, Decision> = {};
    for (const s of selected) {
      for (const q of questions[s.key] || []) {
        const f = result[s.key]?.[q.no];
        const b = f && f.sug.kod ? bankByCode.get(codeKey(f.sug.kod)) : undefined;
        const had = !!(q.kazanimCode || q.kazanim || q.konu);
        dec[`${s.key}:${q.no}`] = {
          apply: !!f && (!!f.sug.kod || !!f.sug.konu) && f.sug.guven >= 50 && !had,
          code: f?.sug.kod || '',
          code2: f?.sug.kod2 || '',
          konu: (b && b.konu) || f?.sug.konu || '',
          // Aşama 48g: alt kazanım = seçilen kazanımın açıklama maddesi (yapay zekânın seçtiği numara)
          alt: b && f && f.sug.altNo ? (b.alt || [])[f.sug.altNo - 1] || '' : '',
        };
      }
    }
    setDecisions(dec);
    setStep('review');
  };

  // ----------------------------------------------------------------------------- 4) Uygulama
  const reviewSubjects = selected;
  const applyCount = Object.values(decisions).filter((d) => d.apply && (d.code || d.konu)).length;

  const handleClose = () => {
    stopRef.current = true;
    onClose();
  };

  const apply = () => {
    const next: ExamQuestions = { ...questions };
    let n = 0;
    for (const s of reviewSubjects) {
      next[s.key] = (questions[s.key] || []).map((q): ExamQuestion => {
        const d = decisions[`${s.key}:${q.no}`];
        if (!d || !d.apply || (!d.code && !d.konu)) return q;
        n++;
        const b = d.code ? bankByCode.get(codeKey(d.code)) : undefined;
        const b2 = d.code2 ? bankByCode.get(codeKey(d.code2)) : undefined;
        const f = found[s.key]?.[q.no];
        return {
          ...q,
          kazanimCode: d.code || undefined,
          kazanim: b ? b.text : undefined,
          konu: (d.konu || (b && b.konu) || '').trim().slice(0, 120) || undefined,
          alt: d.alt && b && (b.alt || []).includes(d.alt) ? d.alt : undefined,
          kazanimCode2: d.code2 || undefined,
          kazanim2: b2 ? b2.text : undefined,
          ai: f ? f.provider : q.ai,
        };
      });
    }
    onApply(next, `${n} soruya kazanım yazıldı.`);
    handleClose();
  };

  const setDec = (k: string, p: Partial<Decision>) => setDecisions((m) => ({ ...m, [k]: { ...m[k], ...p } }));
  const noKeys = keys && !keys.gemini && !keys.mistral;
  const busyStep = step === 'scan' || step === 'run';
  const totalPages = selected.reduce((a, s) => a + pagesOf(s.key).length, 0);

  // ----------------------------------------------------------------------------- Görünüm
  const footer =
    step === 'pick' || step === 'map' ? (
      <>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={handleClose}>
          Vazgeç
        </button>
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!book || !selected.length || opening || !!noKeys} onClick={() => void run()} id="kai-run">
          <Sparkles /> {selected.length ? `Kazanımları bul (${selected.length} ders, ${totalPages} sayfa)` : 'Kazanımları bul'}
        </button>
      </>
    ) : busyStep ? (
      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => (stopRef.current = true)}>
        <Pause /> {step === 'scan' ? 'Durdur' : 'Durdur (bulunanları göster)'}
      </button>
    ) : (
      <>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setStep('map')}>
          <ArrowLeft /> Sayfalara dön
        </button>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={handleClose}>
          Vazgeç
        </button>
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!applyCount} onClick={apply} id="kai-apply">
          <CheckCircle2 /> {applyCount} soruya uygula
        </button>
      </>
    );

  const progressBox = progress && (
    <div className="space-y-2 py-4 max-w-xl mx-auto text-center">
      <p className="text-sm font-semibold text-fg">{progress.label}</p>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
      </div>
      <p className="text-xs text-muted">
        {progress.done}/{progress.total} {step === 'scan' ? 'grup' : 'sayfa'}
        {step === 'run' ? ` · ${Object.values(found).reduce((a, m) => a + Object.keys(m).length, 0)} soru bulundu` : ''}
      </p>
      {progress.wait && <p className="text-xs font-semibold text-warning-fg">{progress.wait}</p>}
      <p className="text-[11px] text-muted">Ücretsiz planda istekler arasında birkaç saniye beklenir. Pencereyi kapatmayın.</p>
    </div>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={() => !busyStep && handleClose()}
        closeOnBackdrop={false}
        title="Kitapçıktan kazanım bul (yapay zekâ)"
        description="Kitapçığın tamamını seçin: yapay zekâ sayfaların derslerini bulur, sonra her soruya kazanım, konu ve alt kazanım önerir; siz onaylarsınız."
        icon={Sparkles}
        size="full"
        footer={footer}
        id="kazanim-ai"
      >
        <div className="space-y-4">
          <p className="text-[11px] text-muted flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-success-fg" />
            <span>
              Yapay zekâya yalnızca kitapçık sayfalarının resmi ve derslerin kazanım listesi gönderilir; öğrenci adı, numarası ya da cevabı gönderilmez. Kitapçık
              bilgisayarınızda resme çevrilir, sisteme kaydedilmez. Ücretsiz planlarda Google ve Mistral gönderilen içeriği hizmetlerini geliştirmek için kullanabilir.
            </span>
          </p>
          {error && <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{error}</p>}
          {noKeys && (
            <p className="text-xs font-semibold rounded-xl px-3 py-2 bg-warning-soft text-warning-fg">
              Sunucuda yapay zekâ anahtarı tanımlı değil. Vercel'de GEMINI_API_KEY (ve isteğe bağlı MISTRAL_API_KEY) ekleyip yeniden dağıtın.
            </p>
          )}

          {(step === 'pick' || step === 'map' || step === 'scan') && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={opening || busyStep} onClick={() => fileRef.current?.click()} id="kai-pick">
                  <ImagePlus /> {book ? 'Başka kitapçık seç' : 'Kitapçığı seç (PDF ya da sayfa resimleri)'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void onFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                {book && (
                  <span className="ui-chip ui-chip-info">
                    <FileText className="w-3.5 h-3.5" /> {short(book.name, 40)} · {book.pageCount} sayfa
                  </span>
                )}
                {book && step === 'map' && (
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={!!noKeys} onClick={() => void scan(book)}>
                    <RefreshCw /> Sayfaları yeniden tanı
                  </button>
                )}
                <span className="flex-1" />
                <div>
                  <label className="ui-label" htmlFor="kai-provider">
                    Yapay zekâ
                  </label>
                  <select id="kai-provider" className="ui-input py-1 text-xs w-auto" value={provider} disabled={busyStep} onChange={(e) => setProvider(e.target.value as AiProvider)}>
                    {AI_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value} disabled={!!keys && !keys[p.value]}>
                        {p.label} — {keys && !keys[p.value] ? 'anahtar tanımlı değil' : p.hint}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-fg-2 pb-1.5">
                  <input type="checkbox" checked={fallback} disabled={busyStep} onChange={(e) => setFallback(e.target.checked)} />
                  Sorun olursa diğerine geç
                </label>
              </div>

              {opening && <p className="text-xs text-muted">Sayfalar hazırlanıyor… {thumbs.length ? `${thumbs.length}/${book?.pageCount ?? '?'}` : ''}</p>}
              {step === 'scan' && progressBox}
              {step === 'map' && log.length > 0 && (
                <div className="text-[11px] rounded-xl px-3 py-2 bg-warning-soft text-warning-fg space-y-0.5">
                  {log.slice(0, 6).map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
              )}

              {book && (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-7 gap-2 content-start max-h-[52vh] overflow-y-auto pr-1">
                    {thumbs.map((url, i) => {
                      const page = i + 1;
                      const tags = subjects.filter((s) => pagesOf(s.key).includes(page));
                      const seen = pageMap[page] || [];
                      return (
                        <button
                          key={page}
                          type="button"
                          onClick={() => void openZoom(page)}
                          className={cx('relative rounded-lg border bg-white overflow-hidden text-left transition-colors', tags.length ? 'border-brand' : 'border-line hover:border-fg-2')}
                          title={`${page}. sayfayı büyüt`}
                        >
                          <img src={url} alt={`${page}. sayfa`} className={cx('w-full h-auto block', !tags.length && Object.keys(pageMap).length > 0 && 'opacity-50')} />
                          <span className="absolute top-1 left-1 ui-chip ui-chip-neutral">{page}</span>
                          <ZoomIn className="absolute top-1 right-1 w-4 h-4 text-subtle" />
                          {tags.length > 0 && (
                            <span className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                              {tags.map((s) => {
                                const nums = seen.find((d) => d.ders === s.key)?.sorular || [];
                                return (
                                  <span key={s.key} className="ui-chip ui-chip-info">
                                    {s.short}
                                    {nums.length ? ` ${numsText(nums)}` : ''}
                                  </span>
                                );
                              })}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-fg">Derslerin sayfaları</p>
                    <p className="text-[11px] text-muted">
                      {Object.keys(pageMap).length
                        ? 'Yapay zekâ sayfaları tanıdı. Kontrol edin; yanlış varsa düzeltin (örn. "2-5, 7"). Kazanımı zaten olan dersi boş bırakabilirsiniz.'
                        : 'Her dersin sayfalarını yazın (örn. "2-5, 7"). Sayfayı büyütmek için üzerine tıklayın.'}
                    </p>
                    {subjects.map((s) => {
                      const list = questions[s.key] || [];
                      const has = list.filter((q) => q.kazanimCode || q.kazanim || q.konu).length;
                      const nBank = (bankBySubject[s.key] || []).length;
                      const pages = pagesOf(s.key);
                      const off = pages.length ? offsetOf(s) : 0;
                      return (
                        <div key={s.key} className="rounded-xl border border-line px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-fg flex-1">{s.name}</span>
                            <input
                              className="ui-input py-1 text-xs w-28"
                              placeholder="sayfalar"
                              value={ranges[s.key] || ''}
                              disabled={busyStep}
                              onChange={(e) => setRanges((m) => ({ ...m, [s.key]: e.target.value }))}
                              aria-label={`${s.name} sayfaları`}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <span className={cx('ui-chip', nBank ? 'ui-chip-success' : 'ui-chip-warning')}>{nBank ? `bankada ${nBank} kazanım` : 'bankada kazanım yok'}</span>
                            {has > 0 && (
                              <span className="ui-chip ui-chip-neutral">
                                {has}/{list.length} soruda kazanım var
                              </span>
                            )}
                            {pages.length > 0 && <span className="ui-chip ui-chip-info">{pages.length} sayfa</span>}
                            {off > 0 && <span className="ui-chip ui-chip-neutral">kitapçıkta {off + 1}. sorudan başlıyor</span>}
                          </div>
                        </div>
                      );
                    })}
                    {Object.values(bankBySubject).length === 0 && (
                      <p className="text-[11px] text-warning-fg">Kazanım bankası boş: yapay zekâ yalnızca konu ve alt kazanım önerir. Önce "Kazanım bankası" sekmesinden öğretim programlarını yükleyin.</p>
                    )}
                  </div>
                </div>
              )}
              {!book && !opening && (
                <p className="text-xs text-muted">
                  Kitapçığın tamamını seçin; sözel ve sayısal kitapçıkları birlikte seçebilirsiniz. A kitapçığı olmalı (soru numaraları cevap anahtarındaki A sırasıyla eşleşir).
                  Yapay zekâ önce hangi sayfanın hangi derse ait olduğunu bulur.
                </p>
              )}
            </>
          )}

          {step === 'run' && progressBox}

          {step === 'review' && (
            <div className="space-y-3">
              {log.length > 0 && (
                <div className="text-[11px] rounded-xl px-3 py-2 bg-warning-soft text-warning-fg space-y-0.5">
                  {log.slice(0, 8).map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                  {log.length > 8 && <p>… {log.length - 8} not daha.</p>}
                </div>
              )}
              <p className="text-[11px] text-muted">
                Konu = seçilen MEB kazanımı (parantez içinde konu başlığıyla); alt kazanım = o kazanımın açıklama maddelerinden biri. Güveni %50'nin altındakiler ve zaten kazanımı olan
                sorular işaretsiz gelir.
              </p>
              {reviewSubjects.map((s) => {
                const list = questions[s.key] || [];
                const options = bankBySubject[s.key] || [];
                const nFound = Object.keys(found[s.key] || {}).length;
                const keysOf = list.map((q) => `${s.key}:${q.no}`);
                const allOn = keysOf.every((k) => decisions[k]?.apply || !(decisions[k]?.code || decisions[k]?.konu));
                return (
                  <div key={s.key} className="rounded-2xl border border-line bg-surface">
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line">
                      <span className="text-sm font-semibold text-fg flex-1">{s.name}</span>
                      <span className={cx('ui-chip', nFound >= list.length ? 'ui-chip-success' : 'ui-chip-warning')}>
                        {nFound}/{list.length} soru bulundu
                      </span>
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost ui-btn-sm"
                        onClick={() =>
                          setDecisions((m) => {
                            const n = { ...m };
                            for (const k of keysOf) if (n[k] && (n[k].code || n[k].konu)) n[k] = { ...n[k], apply: !allOn };
                            return n;
                          })
                        }
                      >
                        {allOn ? 'Hiçbirini seçme' : 'Hepsini seç'}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-fg-2">
                        <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                          <tr>
                            <th className="px-2 py-2 font-semibold w-10 text-center">Uygula</th>
                            <th className="px-2 py-2 font-semibold w-10">No</th>
                            <th className="px-2 py-2 font-semibold min-w-72">Konu (kazanım)</th>
                            <th className="px-2 py-2 font-semibold min-w-56">Alt kazanım</th>
                            <th className="px-2 py-2 font-semibold w-20 text-center">Güven</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {list.map((q) => {
                            const k = `${s.key}:${q.no}`;
                            const d = decisions[k] || { apply: false, code: '', code2: '', konu: '', alt: '' };
                            const f = found[s.key]?.[q.no];
                            const known = !d.code || options.some((o) => codeKey(o.code) === codeKey(d.code));
                            const second = d.code2 ? bankByCode.get(codeKey(d.code2)) : undefined;
                            return (
                              <tr key={q.no} className={cx(d.apply && 'bg-brand-soft/30')}>
                                <td className="px-2 py-1.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={d.apply}
                                    disabled={!d.code && !d.konu}
                                    onChange={(e) => setDec(k, { apply: e.target.checked })}
                                    aria-label={`${s.name} ${q.no}. soruya uygula`}
                                  />
                                </td>
                                <td className="px-2 py-1.5 font-bold text-fg tabular-nums">{q.no}</td>
                                <td className="px-2 py-1.5">
                                  <select
                                    className="ui-input py-0.5 text-xs"
                                    value={d.code}
                                    onChange={(e) => {
                                      const code = e.target.value;
                                      const b = code ? bankByCode.get(codeKey(code)) : undefined;
                                      setDec(k, { code, konu: (b && b.konu) || d.konu, alt: '', apply: !!code || !!d.konu });
                                    }}
                                    aria-label={`${s.name} ${q.no}. soru kazanımı`}
                                  >
                                    <option value="">{options.length ? '— kazanım seçin —' : '— bankada kazanım yok —'}</option>
                                    {!known && <option value={d.code}>{d.code}</option>}
                                    {options.map((o) => (
                                      <option key={o.code} value={o.code}>
                                        {o.code} — {short(o.text, 90)}
                                      </option>
                                    ))}
                                  </select>
                                  {d.code2 && (
                                    <p className="text-[11px] text-muted mt-0.5">
                                      İkincil: {d.code2}
                                      {second ? ` — ${short(second.text, 70)}` : ''}
                                    </p>
                                  )}
                                  {(q.kazanimCode || q.konu) && <p className="text-[11px] text-warning-fg mt-0.5">Şu an: {[q.kazanimCode, q.konu].filter(Boolean).join(' · ')}</p>}
                                  {!f && <p className="text-[11px] text-muted mt-0.5">Yapay zekâ bu soruyu bulamadı; isterseniz elle seçin.</p>}
                                </td>
                                <td className="px-2 py-1.5">
                                  {(() => {
                                    const alts = (d.code && bankByCode.get(codeKey(d.code))?.alt) || [];
                                    return alts.length ? (
                                      <select
                                        className="ui-input py-0.5 text-xs"
                                        value={alts.includes(d.alt) ? d.alt : ''}
                                        onChange={(e) => setDec(k, { alt: e.target.value })}
                                        aria-label={`${s.name} ${q.no}. soru alt kazanımı`}
                                      >
                                        <option value="">— alt kazanım yok —</option>
                                        {alts.map((a, ai) => (
                                          <option key={ai} value={a}>
                                            {ai + 1}) {short(a, 90)}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-subtle">{d.code ? 'Bu kazanımın alt maddesi yok' : '—'}</span>
                                    );
                                  })()}
                                  {d.konu && <p className="text-[11px] text-muted mt-0.5">Konu başlığı: {d.konu}</p>}
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  {f ? <span className={cx('ui-chip', confTone(f.sug.guven))}>%{f.sug.guven}</span> : <span className="text-subtle">—</span>}
                                  {f && <p className="text-[10px] text-subtle mt-0.5">s.{f.page}</p>}
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
              <p className="text-[11px] text-muted">
                Uygulamadan sonra cevap anahtarı penceresindeki "Kaydet" ile değişiklikler kalıcı olur. Yapay zekâ yanılabilir: özellikle güveni düşük satırları kontrol edin.
              </p>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={!!zoom} onClose={() => setZoom(null)} title={zoom ? `${zoom.page}. sayfa` : ''} icon={ZoomIn} size="lg">
        {zoom && (zoom.url ? <img src={zoom.url} alt={`${zoom.page}. sayfa`} className="w-full h-auto rounded-lg border border-line bg-white" /> : <p className="text-sm text-muted">Hazırlanıyor…</p>)}
      </Modal>
    </>
  );
};
