import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, FileSpreadsheet, FileText, Pause, Search, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { EmptyState, Modal, Panel, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import { deleteKazanimlar, listKazanimlar, saveKazanimBank, type BankRow } from '../../services/denemeService';
import { LGS_SUBJECTS } from '../../lib/deneme/lgs';
import {
  bankSubjectKey,
  chunkProgram,
  gradePages,
  mergeProgramItems,
  parseKazanimText,
  readKazanimFile,
  type BankKazanim,
  type BankParseResult,
} from '../../lib/deneme/kazanimBank';
import { foldTr, guessSubjectKey } from '../../lib/deneme/optik';
import { extractPdfText } from '../../lib/deneme/kitapcik';
import { AI_CONCURRENCY, AI_PROVIDERS, DAY_DONE_MSG, aiCall, aiProgram, aiStatus, newAiState, runPool, type AiProgramItem, type AiProvider } from '../../lib/aiApi';

// ============================================================================
// Kazanım bankası (Aşama 48)
//  * Asıl yol: MEB öğretim programı PDF'leri (tek ders ya da hepsi birden) seçilir; yapay zekâ
//    8. sınıf kazanımlarını kod, metin ve konu olarak çıkarır; öğretmen kontrol edip kaydeder.
//  * İsteğe bağlı: kazanımları elle yapıştırma ya da Excel/CSV ile yükleme.
// Bankada kişisel bilgi yoktur.
// ============================================================================

type Msg = { tone: 'success' | 'warning' | 'danger'; text: string } | null;

const MsgLine: React.FC<{ msg: Msg }> = ({ msg }) =>
  msg ? (
    <p
      role="status"
      className={cx(
        'text-xs font-semibold rounded-xl px-3 py-2',
        msg.tone === 'success' && 'bg-success-soft text-success-fg',
        msg.tone === 'warning' && 'bg-warning-soft text-warning-fg',
        msg.tone === 'danger' && 'bg-danger-soft text-danger-fg'
      )}
    >
      {msg.text}
    </p>
  ) : null;

interface ProgFile {
  id: string;
  file: File;
  pages: string[];
  relevant: number[]; // 8. sınıf kazanımı geçen sayfalar (0'dan başlar)
  subject: string; // '' = yapay zekâ belirlesin
  all: boolean; // bütün sayfaları gönder
  scanned: boolean; // metin yok (taranmış PDF)
}

/** Zaman aşımında parçayı ikiye böler (sayfa sınırından) */
function splitChunk(text: string): [string, string] | null {
  if (text.length < 4000) return null;
  const mid = Math.floor(text.length / 2);
  const marks: number[] = [];
  const re = /\n--- Sayfa \d+ ---\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) marks.push(m.index);
  const cut = marks.length ? marks.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a)) : text.lastIndexOf('\n', mid);
  if (cut <= 200 || cut >= text.length - 200) return [text.slice(0, mid), text.slice(mid)];
  return [text.slice(0, cut), text.slice(cut)];
}

const BankTable: React.FC<{ rows: Array<{ code: string; text: string; konu: string }> }> = ({ rows }) => (
  <table className="w-full text-left text-xs text-fg-2">
    <tbody className="divide-y divide-line">
      {rows.map((r) => (
        <tr key={r.code}>
          <td className="px-3 py-1.5 align-top whitespace-nowrap">
            <span className="ui-chip ui-chip-neutral">{r.code}</span>
          </td>
          <td className="px-3 py-1.5 align-top">
            <p className="text-fg">{r.text}</p>
            {r.konu && <p className="text-[11px] text-muted">Konu: {r.konu}</p>}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const KazanimBankasi: React.FC = () => {
  const [rows, setRows] = useState<BankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [delTarget, setDelTarget] = useState<{ name: string; codes: string[] } | null>(null);
  const isHead = dataService.isHeadAdmin();

  // Yapay zekâ ile programdan
  const [keys, setKeys] = useState<{ gemini: boolean; mistral: boolean } | null>(null);
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [fallback, setFallback] = useState(true);
  const [files, setFiles] = useState<ProgFile[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string; wait?: string | null } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [extracted, setExtracted] = useState<BankKazanim[] | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [openPrev, setOpenPrev] = useState<string | null>(null);
  const stopRef = useRef(false);
  const progRef = useRef<HTMLInputElement | null>(null);

  // Elle yükleme
  const [manualOpen, setManualOpen] = useState(false);
  const [subject, setSubject] = useState(LGS_SUBJECTS[0].name);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<BankParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listKazanimlar());
    } catch (e: any) {
      setError(e?.message || 'Kazanım bankası yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    void aiStatus().then((r) => {
      if (r.ok) {
        setKeys({ gemini: !!r.gemini, mistral: !!r.mistral });
        if (!r.gemini && r.mistral) setProvider('mistral');
      }
    });
    return () => {
      stopRef.current = true;
    };
  }, []);

  // Derslere göre gruplama (bilinmeyen ders adları "Diğer" altında)
  const groups = useMemo(() => {
    const m = new Map<string, BankRow[]>();
    for (const r of rows) {
      const key = bankSubjectKey(r.subject) || 'diger';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    const list = LGS_SUBJECTS.map((s) => ({ key: s.key, name: s.name, rows: m.get(s.key) || [] }));
    if (m.get('diger')?.length) list.push({ key: 'diger', name: 'Diğer', rows: m.get('diger')! });
    return list;
  }, [rows]);
  const existing = useMemo(() => new Set(rows.map((r) => r.code.replace(/\s+/g, '').replace(/\.+$/, '').toLocaleUpperCase('tr-TR'))), [rows]);

  const q = foldTr(query.trim());
  const match = (r: BankRow) => !q || foldTr(`${r.code} ${r.konu} ${r.text}`).includes(q);

  // ----------------------------------------------------------------------------- Program PDF'leri
  const onProgramFiles = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setMsg(null);
    setExtracted(null);
    const added: ProgFile[] = [];
    for (const file of Array.from(list)) {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') continue;
      try {
        setReading(`${file.name} okunuyor…`);
        const pages = await extractPdfText(file, (d, t) => setReading(`${file.name} okunuyor… ${d}/${t}`));
        const chars = pages.reduce((a, p) => a + p.length, 0);
        const relevant = gradePages(pages, '8');
        const guess = guessSubjectKey(file.name);
        added.push({
          id: `${file.name}-${file.size}-${Date.now()}`,
          file,
          pages,
          relevant,
          subject: guess || '',
          all: relevant.length === 0,
          scanned: chars < pages.length * 150,
        });
      } catch (e: any) {
        setMsg({ tone: 'danger', text: e?.message || `${file.name} okunamadı.` });
      }
    }
    setReading(null);
    setFiles((f) => [...f, ...added]);
  };

  const runProgram = async () => {
    const usable = files.filter((f) => !f.scanned);
    if (!usable.length) return;
    stopRef.current = false;
    setRunning(true);
    setNotes([]);
    setExtracted(null);
    const jobs: Array<{ f: ProgFile; text: string }> = [];
    for (const f of usable) {
      const idx = f.all || !f.relevant.length ? f.pages.map((_, i) => i).filter((i) => f.pages[i].trim()) : f.relevant;
      for (const text of chunkProgram(f.pages, idx)) jobs.push({ f, text });
    }
    const state = newAiState(provider, fallback, keys);
    const lists: AiProgramItem[][] = [];
    const note: string[] = [];
    let total = jobs.length;
    let done = 0;
    let noKey = false;
    const queue = [...jobs];
    const progressOf = () => ({ done, total, label: `Kazanımlar çıkarılıyor (aynı anda ${AI_CONCURRENCY} bölüm)` });
    setProgress(progressOf());
    const work = (job: { f: ProgFile; text: string }) => async () => {
      const r = await aiCall(state, (p, avoid) => aiProgram({ provider: p, text: job.text, grade: '8', subject: job.f.subject || undefined, avoid }), {
        stop: () => stopRef.current,
        onWait: (w) => setProgress({ ...progressOf(), wait: w }),
        onNote: (n) => note.push(n),
      });
      done++;
      const parts = !r.ok && (r.code === 'timeout' || r.code === 'long') ? splitChunk(job.text) : null;
      if (r.ok) {
        lists.push((r.items || []) as AiProgramItem[]);
        setExtracted(mergeProgramItems(lists));
      } else if (parts) {
        // Uzun bölüm: ikiye bölünüp yeniden sıraya girer
        queue.unshift({ f: job.f, text: parts[0] }, { f: job.f, text: parts[1] });
        total += 2;
      } else if (!stopRef.current) {
        if (r.code === 'quota-day') {
          if (!note.includes(DAY_DONE_MSG)) note.push(DAY_DONE_MSG);
        } else note.push(`${job.f.file.name}: bir bölüm işlenemedi (${r.error || 'bilinmeyen hata'}).`);
        if (r.code === 'no-key' || r.code === 'quota-day') noKey = true;
      }
      setProgress(progressOf());
    };
    await runPool(
      AI_CONCURRENCY,
      () => {
        const j = !noKey ? queue.shift() : undefined;
        return j ? work(j) : null;
      },
      () => stopRef.current
    );
    const merged = mergeProgramItems(lists);
    setExtracted(merged);
    const subjects = Array.from(new Set(merged.map((r) => r.subject)));
    setPick(Object.fromEntries(subjects.map((s) => [s, true])));
    setNotes(note);
    setProgress(null);
    setRunning(false);
    if (!merged.length && !stopRef.current) setMsg({ tone: 'danger', text: 'Yapay zekâ 8. sınıf kazanımı bulamadı. Doğru öğretim programını seçtiğinizden emin olun ya da "Bütün sayfalar"ı işaretleyip tekrar deneyin.' });
  };

  const saveExtracted = async () => {
    if (!extracted) return;
    const list = extracted.filter((r) => pick[r.subject]);
    if (!list.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = await saveKazanimBank(list);
      setMsg({ tone: 'success', text: `${n} kazanım bankaya kaydedildi. Aynı kodlu eski kazanımlar güncellendi.` });
      setExtracted(null);
      setFiles([]);
      await load();
    } catch (e: any) {
      setMsg({ tone: 'danger', text: e?.message || 'Kaydedilemedi.' });
    } finally {
      setBusy(false);
    }
  };

  // ----------------------------------------------------------------------------- Elle yükleme
  const doPreview = () => {
    setMsg(null);
    const r = parseKazanimText(text, subject);
    setPreview(r);
    if (!r.rows.length) setMsg({ tone: 'danger', text: r.warnings.join(' ') });
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await readKazanimFile(file, subject);
      setPreview(r);
      if (!r.rows.length) setMsg({ tone: 'danger', text: r.warnings.join(' ') || 'Dosyada kazanım bulunamadı.' });
    } catch {
      setMsg({ tone: 'danger', text: 'Dosya okunamadı. Excel (.xlsx) ya da CSV dosyası seçin.' });
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    if (!preview?.rows.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = await saveKazanimBank(preview.rows);
      setMsg({ tone: 'success', text: `${n} kazanım bankaya kaydedildi. Aynı kodlu eski kazanımlar güncellendi.` });
      setPreview(null);
      setText('');
      await load();
    } catch (e: any) {
      setMsg({ tone: 'danger', text: e?.message || 'Kaydedilemedi.' });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!delTarget) return;
    setBusy(true);
    try {
      await deleteKazanimlar(delTarget.codes);
      setDelTarget(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Silinemedi.');
      setDelTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const noKeys = keys && !keys.gemini && !keys.mistral;
  const extractedGroups = extracted
    ? LGS_SUBJECTS.map((s) => ({ key: s.key, name: s.name, rows: extracted.filter((r) => r.subject === s.name) })).filter((g) => g.rows.length)
    : [];
  const pickedCount = extracted ? extracted.filter((r) => pick[r.subject]).length : 0;

  return (
    <div className="space-y-5" id="deneme-kazanim-bankasi">
      <Panel
        icon={Sparkles}
        title="Öğretim programından yükle (yapay zekâ)"
        description="MEB öğretim programı PDF'lerini seçin: tek ders ya da hepsi birden. Yapay zekâ 8. sınıf kazanımlarını kodu, metni ve konusuyla çıkarır; siz kontrol edip kaydedersiniz."
      >
        <div className="space-y-3">
          <p className="text-[11px] text-muted flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-success-fg" />
            <span>PDF bilgisayarınızda metne çevrilir; yapay zekâya yalnızca 8. sınıf kazanımlarının geçtiği sayfaların metni gider. Kazanımlar bir kez çıkarılıp bankaya kaydedilir, sonraki denemelerde yeniden yükleme gerekmez.</span>
          </p>
          {noKeys && (
            <p className="text-xs font-semibold rounded-xl px-3 py-2 bg-warning-soft text-warning-fg">
              Sunucuda yapay zekâ anahtarı tanımlı değil. Vercel'de GEMINI_API_KEY (ve isteğe bağlı MISTRAL_API_KEY) ekleyip yeniden dağıtın.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!!reading || running} onClick={() => progRef.current?.click()} id="kb-program-pick">
              <FileText /> {files.length ? 'Başka program PDF\'i ekle' : 'Öğretim programı PDF\'lerini seç'}
            </button>
            <input
              ref={progRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                void onProgramFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <span className="flex-1" />
            <div>
              <label className="ui-label" htmlFor="kb-provider">
                Yapay zekâ
              </label>
              <select id="kb-provider" className="ui-input py-1 text-xs w-auto" value={provider} disabled={running} onChange={(e) => setProvider(e.target.value as AiProvider)}>
                {AI_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value} disabled={!!keys && !keys[p.value]}>
                    {p.label} — {keys && !keys[p.value] ? 'anahtar tanımlı değil' : p.hint}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-fg-2 pb-1.5">
              <input type="checkbox" checked={fallback} disabled={running} onChange={(e) => setFallback(e.target.checked)} />
              Sorun olursa diğerine geç
            </label>
          </div>
          {reading && <p className="text-xs text-muted">{reading}</p>}

          {files.length > 0 && (
            <div className="rounded-xl border border-line divide-y divide-line">
              {files.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                  <FileText className="w-4 h-4 text-subtle" />
                  <span className="font-semibold text-fg min-w-40 flex-1 truncate" title={f.file.name}>
                    {f.file.name}
                  </span>
                  <span className="ui-chip ui-chip-neutral">{f.pages.length} sayfa</span>
                  {f.scanned ? (
                    <span className="ui-chip ui-chip-danger">Metin yok (taranmış PDF)</span>
                  ) : (
                    <span className={cx('ui-chip', f.relevant.length ? 'ui-chip-success' : 'ui-chip-warning')}>
                      {f.relevant.length ? `8. sınıf: ${f.relevant.length} sayfa` : '8. sınıf kodu bulunamadı'}
                    </span>
                  )}
                  <select
                    className="ui-input py-1 text-xs w-auto"
                    value={f.subject}
                    disabled={running || f.scanned}
                    aria-label={`${f.file.name} dersi`}
                    onChange={(e) => setFiles((l) => l.map((x) => (x.id === f.id ? { ...x, subject: e.target.value } : x)))}
                  >
                    <option value="">Ders: yapay zekâ belirlesin</option>
                    {LGS_SUBJECTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-fg-2">
                    <input
                      type="checkbox"
                      checked={f.all}
                      disabled={running || f.scanned}
                      onChange={(e) => setFiles((l) => l.map((x) => (x.id === f.id ? { ...x, all: e.target.checked } : x)))}
                    />
                    Bütün sayfalar
                  </label>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={running} onClick={() => setFiles((l) => l.filter((x) => x.id !== f.id))} aria-label={`${f.file.name} dosyasını çıkar`}>
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
          )}
          {files.some((f) => f.scanned) && (
            <p className="text-[11px] text-warning-fg">
              Taranmış PDF'lerde metin yoktur. MEB'in sitesindeki (mufredat.meb.gov.tr) metin içeren program PDF'ini indirip onu seçin.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!running ? (
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm"
                disabled={!files.some((f) => !f.scanned) || !!reading || !!noKeys}
                onClick={() => void runProgram()}
                id="kb-program-run"
              >
                <Sparkles /> Kazanımları çıkar
              </button>
            ) : (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => (stopRef.current = true)}>
                <Pause /> Durdur (bulunanları göster)
              </button>
            )}
          </div>

          {progress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span>{progress.label}</span>
                <span className="tabular-nums">
                  {progress.done}/{progress.total} · {extracted?.length ?? 0} kazanım
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
              </div>
              {progress.wait && <p className="text-xs font-semibold text-warning-fg">{progress.wait}</p>}
              <p className="text-[11px] text-muted">Ücretsiz planda bölümler arasında birkaç saniye beklenir. Sayfadan ayrılmayın.</p>
            </div>
          )}

          {notes.length > 0 && (
            <div className="text-[11px] rounded-xl px-3 py-2 bg-warning-soft text-warning-fg space-y-0.5">
              {notes.slice(0, 6).map((n, i) => (
                <p key={i}>{n}</p>
              ))}
            </div>
          )}

          {!running && extracted && extracted.length > 0 && (
            <div className="rounded-xl border border-line overflow-hidden" id="kb-program-preview">
              <div className="px-3 py-2 bg-surface-2/60 border-b border-line flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-fg flex-1">Bulunan kazanımlar: kontrol edip kaydedin</span>
                <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy || !pickedCount} onClick={() => void saveExtracted()} id="kb-program-save">
                  {busy ? 'Kaydediliyor…' : `${pickedCount} kazanımı bankaya kaydet`}
                </button>
              </div>
              <div className="divide-y divide-line">
                {extractedGroups.map((g) => {
                  const isOpen = openPrev === g.key;
                  const konuCount = new Set(g.rows.map((r) => r.konu).filter(Boolean)).size;
                  const updates = g.rows.filter((r) => existing.has(r.code.replace(/\.+$/, '').toLocaleUpperCase('tr-TR'))).length;
                  return (
                    <div key={g.key}>
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                        <label className="flex items-center gap-2 font-semibold text-fg min-w-48 flex-1">
                          <input type="checkbox" checked={!!pick[g.name]} onChange={(e) => setPick((p) => ({ ...p, [g.name]: e.target.checked }))} />
                          {g.name}
                        </label>
                        <span className="ui-chip ui-chip-info">{g.rows.length} kazanım</span>
                        {konuCount > 0 && <span className="ui-chip ui-chip-neutral">{konuCount} konu</span>}
                        {updates > 0 && <span className="ui-chip ui-chip-warning">{updates} kazanım güncellenecek</span>}
                        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setOpenPrev(isOpen ? null : g.key)} aria-expanded={isOpen}>
                          {isOpen ? <ChevronUp /> : <ChevronDown />} Göster
                        </button>
                      </div>
                      {isOpen && (
                        <div className="border-t border-line max-h-80 overflow-y-auto">
                          <BankTable rows={g.rows} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!manualOpen && <MsgLine msg={msg} />}
        </div>
      </Panel>

      <Panel
        icon={Upload}
        title="Elle ekle (isteğe bağlı)"
        description="Kazanımları metin olarak yapıştırabilir ya da Excel/CSV dosyasıyla yükleyebilirsiniz."
        actions={
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setManualOpen((v) => !v)} aria-expanded={manualOpen}>
            {manualOpen ? <ChevronUp /> : <ChevronDown />} {manualOpen ? 'Gizle' : 'Aç'}
          </button>
        }
      >
        {manualOpen && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56">
                <label className="ui-label" htmlFor="kb-subject">
                  Ders
                </label>
                <select
                  id="kb-subject"
                  className="ui-input"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setPreview(null);
                  }}
                >
                  {LGS_SUBJECTS.map((s) => (
                    <option key={s.key} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <FileSpreadsheet /> Excel / CSV yükle
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <div>
              <label className="ui-label" htmlFor="kb-text">
                ya da kazanımları buraya yapıştırın
              </label>
              <textarea
                id="kb-text"
                className="ui-input min-h-40 font-mono text-xs"
                placeholder={'F.8.1. Mevsimler ve İklim\nF.8.1.1. Mevsimlerin Oluşumu\nF.8.1.1.1. Mevsimlerin oluşumuna yönelik tahminlerde bulunur.\n…'}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPreview(null);
                }}
              />
              <p className="text-[11px] text-muted mt-1">
                Her kazanım kendi koduyla başlamalı. Kısa kodlu satırlar (ör. F.8.1.1.) ve kodsuz başlıklar konu olarak kullanılır. "a)", "b)" ile başlayan açıklamalar atlanır.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || !text.trim()} onClick={doPreview}>
                Önizle
              </button>
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy || !preview?.rows.length} onClick={() => void doSave()} id="kb-save">
                {busy ? 'Kaydediliyor…' : preview?.rows.length ? `${preview.rows.length} kazanımı bankaya kaydet` : 'Bankaya kaydet'}
              </button>
            </div>
            <MsgLine msg={msg} />
            {preview && preview.rows.length > 0 && (
              <div className="rounded-xl border border-line overflow-hidden">
                <div className="px-3 py-2 bg-surface-2/60 border-b border-line flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-fg">Önizleme</span>
                  <span className="ui-chip ui-chip-info">{preview.rows.length} kazanım</span>
                  <span className={cx('ui-chip', preview.rows.some((r) => r.konu) ? 'ui-chip-success' : 'ui-chip-warning')}>
                    {new Set(preview.rows.map((r) => r.konu).filter(Boolean)).size} konu
                  </span>
                </div>
                {preview.warnings.length > 0 && <p className="px-3 py-2 text-[11px] text-warning-fg bg-warning-soft">{preview.warnings.join(' ')}</p>}
                <div className="max-h-72 overflow-y-auto">
                  <BankTable rows={preview.rows.slice(0, 200)} />
                  {preview.rows.length > 200 && <p className="px-3 py-2 text-[11px] text-muted">… ve {preview.rows.length - 200} kazanım daha.</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel
        icon={BookOpen}
        title="Bankadaki kazanımlar"
        description="Yayınevi Excel'inden gelen kazanımlar da buraya otomatik eklenir."
        actions={
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input className="ui-input py-1 pl-8 text-xs w-48" placeholder="Kod ya da kelime ara" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Kazanım ara" />
          </div>
        }
      >
        {error && <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2 mb-3">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted">Yükleniyor…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={BookOpen} title="Banka boş" description="Yukarıdan öğretim programı PDF'lerini seçip kazanımları yapay zekâyla çıkarın." />
        ) : (
          <div className="space-y-2">
            {groups.map((g) => {
              const shown = g.rows.filter(match);
              const isOpen = open === g.key || (!!q && shown.length > 0);
              const konuCount = new Set(g.rows.map((r) => r.konu).filter(Boolean)).size;
              return (
                <div key={g.key} className="border border-line rounded-xl bg-surface">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="text-sm font-semibold text-fg min-w-40">{g.name}</span>
                    <span className={cx('ui-chip', g.rows.length ? 'ui-chip-success' : 'ui-chip-neutral')}>{g.rows.length} kazanım</span>
                    {konuCount > 0 && <span className="ui-chip ui-chip-info">{konuCount} konu</span>}
                    <span className="flex-1" />
                    {isHead && g.rows.length > 0 && (
                      <button type="button" className="ui-btn ui-btn-danger-soft ui-btn-sm" onClick={() => setDelTarget({ name: g.name, codes: g.rows.map((r) => r.code) })}>
                        <Trash2 /> Sil
                      </button>
                    )}
                    {g.rows.length > 0 && (
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setOpen(open === g.key ? null : g.key)} aria-expanded={isOpen}>
                        {isOpen ? <ChevronUp /> : <ChevronDown />} Kazanımlar
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="border-t border-line max-h-96 overflow-y-auto">
                      <BankTable rows={shown} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Modal
        open={!!delTarget}
        onClose={() => !busy && setDelTarget(null)}
        title="Kazanımlar silinsin mi?"
        description={delTarget ? `${delTarget.name}: ${delTarget.codes.length} kazanım bankadan silinir.` : ''}
        icon={Trash2}
        tone="danger"
        size="sm"
        footer={
          <>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={() => setDelTarget(null)}>
              Vazgeç
            </button>
            <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" disabled={busy} onClick={() => void doDelete()}>
              Sil
            </button>
          </>
        }
      >
        <p className="text-sm text-fg-2">Kaydedilmiş denemelerdeki kazanımlar etkilenmez; yalnızca banka listesi silinir. Ardından doğru listeyi yeniden yükleyebilirsiniz.</p>
      </Modal>
    </div>
  );
};
