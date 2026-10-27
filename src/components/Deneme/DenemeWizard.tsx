import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileText, Save, Trash2, Upload, Users } from 'lucide-react';
import { Modal, Panel, Segmented, cx } from '../ui/kit';
import type { ClassGroup, Student } from '../../types';
import { OptikFormatEditor } from './OptikFormatEditor';
import { AnahtarEditor } from './AnahtarEditor';
import { keyBProblems } from '../../lib/deneme/bKitapcik';
import { OgrenciSecici } from './OgrenciSecici';
import { checkFields, decodeOptikFile, formatFitsTxt, parseTxt, shiftFields, suggestShift, type OptikField, type OptikRow, type TxtParseResult } from '../../lib/deneme/optik';
import { checkBlocksWithKey, fixSessionSubjects, remapFields, remapRows, suggestionMap, type KeySuggestion } from '../../lib/deneme/oturum';
import { aliasKeyOf, groupRows, matchGroups, normNumber, type MatchItem } from '../../lib/deneme/eslestir';
import {
  LGS_SCORING,
  LGS_SUBJECTS,
  computeResult,
  fmtNet,
  fmtScore,
  normalizeQuestions,
  rankAndSummarize,
  recomputeFromAnswers,
  type ExamQuestions,
} from '../../lib/deneme/lgs';
import {
  listFormats,
  listResults,
  loadAliases,
  saveAliases,
  saveExam,
  saveFormat,
  deleteFormat,
  saveResults,
  listStudentTcHashes,
  deleteExam,
  type DenemeDraft,
  type DenemeExam,
  type DenemeFormat,
  type DenemeResult,
  type DraftFile,
} from '../../services/denemeService';
import { newId } from '../../lib/ids';
import { hashTcs, validTc } from '../../lib/tcApi';

// ============================================================================
// Yeni deneme / optik yükleme sihirbazı (Aşama 47)
// 1) Bilgiler + cevap anahtarı/kazanım  2) Optik format + TXT  3) Öğrenci eşleştirme  4) Kontrol ve kayıt
// Var olan bir denemeye sonradan başka oturumun TXT'si yüklenirse, öğrencinin diğer derslerdeki cevapları korunur.
// Aşama 90: her TXT kendi formatıyla okunur (sözel ve sayısal için ayrı FMT); okunan derslerin doğruluğu cevap
// anahtarıyla denetlenir. Yeni deneme her adımda kaydedilebilir (taslak); "Devam" da kaydeder, çıkınca kaldığı
// yerden sürer. Taslakta TC tutulmaz: TC ile bulunan öğrenci yalnızca kimliğiyle saklanır.
// ============================================================================

type Step = 1 | 2 | 3 | 4;
const STEPS: Array<{ n: Step; title: string }> = [
  { n: 1, title: 'Bilgiler ve cevap anahtarı' },
  { n: 2, title: 'Optik dosyaları' },
  { n: 3, title: 'Öğrenci eşleştirme' },
  { n: 4, title: 'Kontrol ve kayıt' },
];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const filled = (s?: string) => !!s && /[A-E*]/.test(s);

/** Aşama 90: yüklenen TXT (text) ya da taslaktan gelen okunmuş satırlar (rows). fmt: '' = yukarıda düzenlenen format */
type TxtSrc = { name: string; text?: string; fmt: string; rows?: DraftFile['rows']; fmtName?: string };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const SQ_BTN = 'ui-btn ui-btn-sm w-32 justify-center';
// Aşama 63: "Denemelere dön" düğmesi deneme sonuçları ekranındakiyle aynı görünümde
const BACK_BTN =
  'ui-btn ui-btn-lg border border-brand/40 bg-brand-soft text-brand-fg shadow-sm hover:bg-brand hover:text-white hover:border-brand focus-visible:ring-2 focus-visible:ring-brand/40';

export const DenemeWizard: React.FC<{
  students: Student[];
  classes: ClassGroup[];
  existing?: DenemeExam | null; // varsa: optik yükleme bu denemeye yapılır (1. adım düzenleme olarak açılır)
  draft?: DenemeExam | null; // Aşama 90: yarım kalmış yeni deneme (kaldığı adımdan açılır)
  startStep?: Step;
  onCancel: () => void;
  onSaved: (examId: string) => void;
  onDraftChange?: () => void; // taslak kaydedildi / silindi (liste yenilenir)
}> = ({ students, classes, existing, draft, startStep = 1, onCancel, onSaved, onDraftChange }) => {
  const subjects = LGS_SUBJECTS;
  const src = existing || draft || null;
  const draftData: DenemeDraft | undefined = draft?.draft;
  const [step, setStep] = useState<Step>(() => (draft ? (Math.min(3, Math.max(1, draftData?.step || draft.draftInfo?.step || 1)) as Step) : startStep));
  const [error, setError] = useState<string | null>(null);

  // 1) Bilgiler
  const [name, setName] = useState(src?.name || '');
  const [publisher, setPublisher] = useState(src?.publisher || '');
  const [examDate, setExamDate] = useState(src?.examDate || todayStr());
  const [questions, setQuestions] = useState<ExamQuestions>(() => normalizeQuestions(subjects, src?.questions || {}));

  // 2) Optik
  const [formats, setFormats] = useState<DenemeFormat[]>([]);
  const [formatId, setFormatId] = useState<string>('');
  const [fields, setFields] = useState<OptikField[]>([]);
  const [fmtText, setFmtText] = useState('');
  const [sequential, setSequential] = useState(true);
  const [formatName, setFormatName] = useState('');
  const [formatMsg, setFormatMsg] = useState<string | null>(null);
  const [txtFiles, setTxtFiles] = useState<TxtSrc[]>(() => (draftData?.files || []).map((f) => ({ name: f.name, fmt: '__kayit', rows: f.rows, fmtName: f.fmtName })));
  const txtRef = useRef<HTMLInputElement | null>(null);

  // 3) Eşleştirme
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [matchFilter, setMatchFilter] = useState<'all' | 'pending' | 'none'>('all');
  const [matchMsg, setMatchMsg] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // 4) Kayıt
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');

  // Aşama 90: taslak (yeni denemede adım adım kayıt)
  const canDraft = !existing;
  const [draftId, setDraftId] = useState<string | null>(draft?.id || null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(draft?.draftInfo?.at ? new Date(draft.draftInfo.at) : null);
  const [draftNote, setDraftNote] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const skipDirty = useRef(true);
  const left = useRef(false); // bilerek çıkıldı / kaydedildi: çıkışta kendiliğinden kayıt yapılmaz
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState(false);
  const [aliasesReady, setAliasesReady] = useState(false);

  useEffect(() => {
    listFormats()
      .then((list) => {
        setFormats(list);
        if (list.length && !formatId) {
          setFormatId(list[0].id);
          setFields(list[0].fields);
          setFmtText(list[0].fmtText);
          setFormatName(list[0].name);
        }
      })
      .catch(() => setFormats([]));
    loadAliases()
      .then(setAliases)
      .catch(() => setAliases({}))
      .finally(() => setAliasesReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keyComplete = (k: string) => (questions[k] || []).length > 0 && (questions[k] || []).every((q) => !!q.answer);
  const completeSubjects = subjects.filter((s) => keyComplete(s.key));

  // Aşama 90: her TXT kendi formatıyla okunur. '' ya da düzenlenen kayıtlı format = yukarıdaki (canlı) alanlar
  const usesEditor = (f: TxtSrc) => !f.rows && (f.fmt === '' || f.fmt === formatId);
  const fieldsFor = (f: TxtSrc): OptikField[] | null => (usesEditor(f) ? fields : formats.find((x) => x.id === f.fmt)?.fields || null);
  // TXT'ler format değişince yeniden okunur
  const parsed: Array<TxtParseResult | null> = useMemo(
    () =>
      txtFiles.map((f) => {
        if (f.rows) return { rows: f.rows as OptikRow[], errors: [], warnings: [], expectedLength: 0 };
        const fl = fieldsFor(f);
        if (!fl || !f.text || checkFields(fl).length) return null;
        return parseTxt(f.text, fl, f.name);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txtFiles, fields, formats, formatId]
  );
  const allRows = useMemo(() => parsed.flatMap((p) => (p ? p.rows : [])), [parsed]);
  const parseErrors = parsed.flatMap((p, i) => (p ? p.errors : [`${txtFiles[i]?.name}: formatı seçin ya da tamamlayın.`]));
  // Aşama 49c: TXT seçili formatla uyuşmuyorsa öneri: uyuşan kayıtlı format ya da alanları topluca kaydırma
  const fixHints = useMemo(
    () =>
      txtFiles.map((f, i) => {
        const p = parsed[i];
        if (!f.text || (p && !p.errors.length)) return null;
        const fits = formats.filter((x) => x.id !== f.fmt && !(usesEditor(f) && x.id === formatId) && formatFitsTxt(f.text!, x.fields)).slice(0, 3);
        const shift = fits.length || !p || !usesEditor(f) ? null : suggestShift(f.text, fields);
        return fits.length || shift !== null ? { fits, shift } : null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txtFiles, parsed, formats, formatId, fields]
  );
  // Aşama 90: okunan derslerin doğruluğu cevap anahtarıyla denetlenir (yanlış etiketli optik blokları)
  const keySugs: KeySuggestion[][] = useMemo(
    () => parsed.map((p) => (p && !p.errors.length ? checkBlocksWithKey(p.rows, subjects, questions, keyComplete) : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, questions]
  );
  const applyShift = (n: number) => {
    setSequential(false);
    setFields(shiftFields(fields, n));
    setFormatMsg(
      `Alanlar ${Math.abs(n)} karakter ${n > 0 ? 'sağa' : 'sola'} kaydırıldı. Tablodaki "İlk satırda okunan" sütununu kontrol edin; doğruysa "Formatı güncelle" deyin.`
    );
  };
  const editorFile = txtFiles.find((f) => usesEditor(f) && f.text);
  const sampleLine = editorFile?.text?.split(/\r?\n/).find((l) => l.trim());
  const answeredSubjects = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) for (const k of Object.keys(r.answers)) if (filled(r.answers[k])) set.add(k);
    return subjects.filter((s) => set.has(s.key));
  }, [allRows, subjects]);
  const keyMissingForAnswered = answeredSubjects.filter((s) => !keyComplete(s.key));

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const sortedStudents = useMemo(
    () => students.slice().sort((a, b) => (a.className || '').localeCompare(b.className || '', 'tr') || a.name.localeCompare(b.name, 'tr')),
    [students]
  );

  const onTxt = async (list: FileList | null) => {
    if (!list?.length) return;
    const add: TxtSrc[] = [];
    for (const f of Array.from(list)) {
      const text = decodeOptikFile(await f.arrayBuffer());
      // Aşama 90: dosyaya uyan format kendiliğinden seçilir (önce yukarıdaki format, sonra kayıtlı formatlar)
      const editorFits = fields.length > 0 && !checkFields(fields).length && formatFitsTxt(text, fields);
      const fit = editorFits ? null : formats.find((x) => formatFitsTxt(text, x.fields));
      add.push({ name: f.name, text, fmt: fit ? fit.id : '' });
    }
    setTxtFiles((cur) => [...cur.filter((c) => !add.some((a) => a.name === c.name)), ...add]);
  };
  const setFileFmt = (name: string, fmt: string) => setTxtFiles((cur) => cur.map((f) => (f.name === name ? { ...f, fmt } : f)));

  /** Aşama 90: anahtarla bulunan ders düzeltmesini uygular (format ya da kayıtlı satırlar) */
  const applyKeyFix = async (i: number) => {
    const f = txtFiles[i];
    const sug = keySugs[i];
    if (!f || !sug?.length) return;
    const map = suggestionMap(sug);
    const names = sug.map((x) => `${subjects.find((s) => s.key === x.from)?.short} → ${subjects.find((s) => s.key === x.to)?.short}`).join(', ');
    if (f.rows) {
      setTxtFiles((cur) => cur.map((x) => (x.name === f.name ? { ...x, rows: remapRows(x.rows as OptikRow[], map) } : x)));
      setFormatMsg(`${f.name}: dersler düzeltildi (${names}).`);
      return;
    }
    if (usesEditor(f)) {
      const nf = remapFields(fields, map);
      setFields(nf);
      const cur = formatId ? formats.find((x) => x.id === formatId) : null;
      if (!cur) {
        setFormatMsg(`Format düzeltildi (${names}). Sonraki denemeler için "Formatı kaydet" deyin.`);
        return;
      }
      // Kayıtlı format düzenleniyorsa düzeltme formata da kaydedilir (sonraki denemelerde tekrar çıkmaz)
      try {
        const saved = await saveFormat({ id: cur.id, name: formatName || cur.name, fmtText, fields: nf });
        setFormats((list) => list.map((x) => (x.id === saved.id ? saved : x)));
        setFormatMsg(`"${saved.name}" formatı düzeltildi ve kaydedildi (${names}).`);
      } catch (e: any) {
        setFormatMsg(`Düzeltildi (${names}) ama format kaydedilemedi: ${e?.message || 'hata'}`);
      }
      return;
    }
    const fm = formats.find((x) => x.id === f.fmt);
    if (!fm) return;
    const nf = remapFields(fm.fields, map);
    setFormats((cur) => cur.map((x) => (x.id === fm.id ? { ...x, fields: nf } : x)));
    try {
      await saveFormat({ id: fm.id, name: fm.name, fmtText: fm.fmtText, fields: nf });
      setFormatMsg(`"${fm.name}" formatı düzeltildi ve kaydedildi (${names}).`);
    } catch (e: any) {
      setFormatMsg(`Düzeltildi (${names}) ama format kaydedilemedi: ${e?.message || 'hata'}`);
    }
  };

  const pickFormat = (id: string) => {
    setFormatId(id);
    setFormatMsg(null);
    const f = formats.find((x) => x.id === id);
    if (f) {
      setFields(f.fields);
      setFmtText(f.fmtText);
      setFormatName(f.name);
    } else {
      setFields([]);
      setFmtText('');
      setFormatName('');
    }
  };

  const doSaveFormat = async (asNew: boolean) => {
    setFormatMsg(null);
    try {
      const saved = await saveFormat({ id: asNew ? undefined : formatId || undefined, name: formatName || 'Optik formatı', fmtText, fields });
      setFormats((cur) => [...cur.filter((x) => x.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
      // Aşama 90: bu formatla okunan dosyalar kayıtlı formata bağlanır (başka format düzenlenince değişmesinler)
      const prevId = formatId;
      setTxtFiles((cur) => cur.map((x) => (!x.rows && (x.fmt === '' || x.fmt === prevId) ? { ...x, fmt: saved.id } : x)));
      setFormatId(saved.id);
      setFormatMsg('Format kaydedildi. Sonraki denemelerde listeden seçebilirsiniz.');
    } catch (e: any) {
      setFormatMsg(e?.message || 'Format kaydedilemedi.');
    }
  };

  const doDeleteFormat = async () => {
    if (!formatId) return;
    setFormatMsg(null);
    try {
      await deleteFormat(formatId);
      setFormats((cur) => cur.filter((x) => x.id !== formatId));
      pickFormat('');
    } catch (e: any) {
      setFormatMsg(e?.message || 'Format silinemedi.');
    }
  };

  // Aşama 50: optikte TC varsa ve öğrencilerin TC parmak izi kayıtlıysa önce TC ile eşleştirilir.
  // TC'ler sunucuda parmak izine çevrilir; TC'nin kendisi kaydedilmez, eşleştirmeden sonra bellekten atılır.
  const [matching, setMatching] = useState(false);
  const [tcNote, setTcNote] = useState<string | null>(null);
  /** TC'leri parmak izine çevirip kayıtlı öğrencilerle eşler: TC → öğrenci kimliği (TC kaydedilmez) */
  const linkTcs = async (tcs: string[]): Promise<{ map: Map<string, string>; error?: string }> => {
    const map = new Map<string, string>();
    const list = Array.from(new Set(tcs.filter((t) => !!t && !!validTc(t))));
    if (!list.length) return { map };
    try {
      const existingHashes = await listStudentTcHashes();
      const allowed = new Set(students.map((s) => s.id));
      const byHash = new Map<string, string>();
      const dupHash = new Set<string>();
      for (const [sid, h] of existingHashes) {
        if (!allowed.has(sid)) continue;
        if (byHash.has(h)) dupHash.add(h);
        else byHash.set(h, sid);
      }
      if (!byHash.size) return { map };
      const res = await hashTcs(list);
      if (!res.ok) return { map, error: res.error };
      list.forEach((tc, i) => {
        const h = res.hashes[i];
        const sid = h && !dupHash.has(h) ? byHash.get(h) : undefined;
        if (sid) map.set(tc, sid);
      });
      return { map };
    } catch (e: any) {
      return { map, error: e?.message || 'hata' };
    }
  };

  /** Satırları gruplayıp eşleştirir. Taslaktan gelen satırlarda TC yerine TC ile bulunmuş öğrenci (sid) vardır. */
  const buildMatches = async (rows: OptikRow[]): Promise<MatchItem[]> => {
    const groups = groupRows(rows);
    const tcMatch = new Map<string, string>();
    setTcNote(null);
    const withTc = groups.filter((g) => !!g.tc && g.tc !== '-' && !!validTc(g.tc));
    if (withTc.length) {
      const r = await linkTcs(withTc.map((g) => g.tc || ''));
      for (const g of withTc) {
        const sid = r.map.get(g.tc || '');
        if (sid) tcMatch.set(g.key, sid);
      }
      if (r.error) setTcNote(`TC ile eşleştirme yapılamadı: ${r.error} Numara ve ad soyadla devam edildi.`);
    }
    const bySrc = new Map<string, string>();
    for (const r of rows as Array<OptikRow & { sid?: string }>) if (r.sid) bySrc.set(`${r.file} ${r.line}. satır`, r.sid);
    if (bySrc.size) {
      for (const g of groups) {
        if (tcMatch.has(g.key)) continue;
        const sid = g.sources.map((x) => bySrc.get(x)).find(Boolean);
        if (sid) tcMatch.set(g.key, sid);
      }
    }
    if (tcMatch.size) setTcNote((n) => n || `${tcMatch.size} öğrenci TC ile eşleşti (TC'ler kaydedilmedi).`);
    for (const g of groups) delete g.tc; // TC bellekten atılır
    return matchGroups(groups, students, classes, aliases, tcMatch.size ? tcMatch : undefined);
  };
  const runMatching = async (): Promise<MatchItem[]> => {
    const list = await buildMatches(allRows);
    setMatches(list);
    setManual(new Set());
    return list;
  };

  // Aşama 90: taslak 3. adımda bırakıldıysa eşleştirme yeniden kurulur ve kayıtlı seçimler uygulanır
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !draftData?.match || step !== 3 || !aliasesReady || !allRows.length) return;
    resumed.current = true;
    void buildMatches(allRows).then((list) => {
      const saved = new Map(draftData.match!.map((m) => [m.k, m]));
      const man = new Set<string>();
      const next = list.map((m) => {
        const x = saved.get(m.group.key);
        if (!x) return m;
        if (x.m) man.add(m.group.key);
        return { ...m, studentId: x.s, status: x.st, skip: x.sk, method: x.me || m.method };
      });
      skipDirty.current = true;
      setMatches(next);
      setManual(man);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aliasesReady, step, allRows]);

  const setMatch = (key: string, p: Partial<MatchItem>, isManual = true) => {
    setMatches((cur) => cur.map((m) => (m.group.key === key ? { ...m, ...p } : m)));
    if (isManual) setManual((cur) => new Set(cur).add(key));
  };

  const counts = useMemo(() => {
    const c = { ok: 0, check: 0, none: 0, skip: 0 };
    for (const m of matches) {
      if (m.skip) c.skip++;
      else c[m.status]++;
    }
    return c;
  }, [matches]);

  const duplicateIds = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of matches) if (!m.skip && m.studentId) n.set(m.studentId, (n.get(m.studentId) || 0) + 1);
    return new Set(Array.from(n.entries()).filter(([, v]) => v > 1).map(([k]) => k));
  }, [matches]);

  // ----------------------------------------------------------------------------- Aşama 90: taslak kaydı
  // Bilgiler + cevap anahtarı + okunmuş optik satırları (TC'siz) + eşleştirme seçimleri saklanır.
  // TXT'nin kendisi saklanmaz; TC'li satırlarda TC ile bulunan öğrencinin yalnızca kimliği tutulur.
  const saveDraft = async (opt: { silent?: boolean; step?: number; matches?: MatchItem[] } = {}): Promise<boolean> => {
    if (!canDraft || draftBusy) return false;
    if (!name.trim()) {
      if (!opt.silent) setError('Kaydetmek için deneme adını yazın.');
      return false;
    }
    setDraftBusy(true);
    if (!opt.silent) setError(null);
    try {
      const skipped: string[] = [];
      const files: DraftFile[] = [];
      for (let i = 0; i < txtFiles.length; i++) {
        const f = txtFiles[i];
        const p = parsed[i];
        if (!p || p.errors.length) {
          skipped.push(f.name);
          continue;
        }
        const tcs = p.rows.map((r) => r.tc || '').filter(Boolean);
        const links = tcs.length ? (await linkTcs(tcs)).map : new Map<string, string>();
        const fm = f.rows ? null : usesEditor(f) ? { name: formatName } : formats.find((x) => x.id === f.fmt);
        files.push({
          name: f.name,
          fmtName: f.fmtName || fm?.name || '',
          rows: p.rows.map((r) => {
            const { tc, ...rest } = r as OptikRow & { sid?: string };
            const sid = (tc && links.get(tc)) || rest.sid;
            return sid ? { ...rest, sid } : { ...rest, sid: undefined };
          }),
        });
      }
      const stepNow = Math.min(3, opt.step ?? step);
      const ms = opt.matches ?? matches;
      const d: DenemeDraft = {
        v: 1,
        step: stepNow,
        files,
        ...(stepNow >= 3 && ms.length
          ? { match: ms.map((m) => ({ k: m.group.key, s: m.studentId, st: m.status, sk: m.skip, m: manual.has(m.group.key), me: m.method })) }
          : {}),
      };
      const at = new Date();
      const id = draftId || newId('dnm');
      await saveExam({
        id,
        name: name.trim(),
        publisher: publisher.trim(),
        examDate,
        grade: '8',
        examType: 'LGS',
        subjects: completeSubjects,
        questions: normalizeQuestions(subjects, questions),
        scoring: LGS_SCORING,
        summary: {},
        published: false,
        draftInfo: { step: stepNow, at: at.toISOString() },
        draft: d,
      });
      setDraftId(id);
      setSavedAt(at);
      setDirty(false);
      setDraftNote(
        skipped.length
          ? { tone: 'warning', text: `Kaydedildi; formatı uymayan dosya kaydedilmedi: ${skipped.join(', ')}.` }
          : opt.silent
            ? null
            : { tone: 'success', text: 'Kaydedildi. Çıkıp sonra Deneme listesinden kaldığınız yerden devam edebilirsiniz.' }
      );
      onDraftChange?.();
      return true;
    } catch (e: any) {
      if (opt.silent) setDraftNote({ tone: 'warning', text: `Otomatik kayıt yapılamadı: ${e?.message || 'hata'}` });
      else setError(e?.message || 'Kaydedilemedi.');
      return false;
    } finally {
      setDraftBusy(false);
    }
  };

  // Değişiklik izleme (ilk açılış ve taslaktan geri yükleme sayılmaz)
  useEffect(() => {
    if (skipDirty.current) {
      skipDirty.current = false;
      return;
    }
    setDirty(true);
  }, [name, publisher, examDate, questions, txtFiles, matches]);

  // Sayfadan ayrılırken (sekme değişimi, başka bölüm) kaydedilmemiş değişiklik kendiliğinden kaydedilir
  const latest = useRef({ dirty, save: saveDraft });
  latest.current = { dirty, save: saveDraft };
  useEffect(() => {
    if (!canDraft) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!latest.current.dirty || left.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (!left.current && latest.current.dirty) void latest.current.save({ silent: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** "Denemelere dön" / "Vazgeç": kaydedilmemiş değişiklik varsa sorulur */
  const leave = () => {
    if (canDraft && dirty && (name.trim() || txtFiles.length)) {
      setLeaveAsk(true);
      return;
    }
    left.current = true;
    onCancel();
  };
  const saveAndLeave = async () => {
    if (await saveDraft()) {
      left.current = true;
      setLeaveAsk(false);
      onCancel();
    } else setLeaveAsk(false);
  };
  const doDeleteDraft = async () => {
    if (!draftId) return;
    setDraftBusy(true);
    try {
      await deleteExam(draftId);
      left.current = true;
      setDeleteAsk(false);
      onDraftChange?.();
      onCancel();
    } catch (e: any) {
      setDeleteAsk(false);
      setError(e?.message || 'Taslak silinemedi.');
    } finally {
      setDraftBusy(false);
    }
  };

  // ----------------------------------------------------------------------------- adım geçişleri
  const next = () => {
    setError(null);
    if (step === 1) {
      if (!name.trim()) return setError('Deneme adını yazın.');
      if (!completeSubjects.length) return setError('En az bir dersin cevap anahtarı eksiksiz olmalı (Excel yükleyin ya da elle yazın).');
      // Aşama 62: B kitapçığı eşleşmesi geçerli olmalı (her B numarası bir kez)
      const bp = keyBProblems(subjects, questions);
      if (bp.length) return setError(`B kitapçığı eşleşmesinde sorun var: ${bp[0]}${bp.length > 1 ? ` (+${bp.length - 1} sorun daha)` : ''} Ders satırındaki "Sorular" bölümünden düzeltin.`);
      setStep(2);
      if (canDraft) void saveDraft({ silent: true, step: 2 });
      return;
    }
    if (step === 2) {
      if (!txtFiles.length) return setError('En az bir TXT dosyası yükleyin.');
      if (txtFiles.some((f) => usesEditor(f))) {
        const fe = checkFields(fields);
        if (fe.length) return setError(fe[0]);
      }
      if (parseErrors.length) return setError(parseErrors[0]);
      if (keyMissingForAnswered.length) {
        return setError(`TXT'de cevabı olan ama cevap anahtarı eksik dersler var: ${keyMissingForAnswered.map((s) => s.name).join(', ')}. 1. adıma dönüp anahtarı tamamlayın.`);
      }
      if (matching) return;
      setMatching(true);
      void runMatching()
        .then((list) => {
          if (canDraft) void saveDraft({ silent: true, step: 3, matches: list });
        })
        .finally(() => {
          setMatching(false);
          setStep(3);
        });
      return;
    }
    if (step === 3) {
      const open = matches.filter((m) => !m.skip && (m.status !== 'ok' || !m.studentId));
      if (open.length) {
        setMatchFilter('pending');
        return setError(`${open.length} satır onay bekliyor; liste yalnızca onları gösterecek şekilde süzüldü. Öğrenciyi seçin, "Onayla" deyin ya da "Atla" işaretleyin.`);
      }
      if (duplicateIds.size) {
        setMatchFilter('pending');
        return setError('Aynı öğrenci birden fazla satıra seçilmiş. Lütfen düzeltin.');
      }
      if (canDraft && dirty) void saveDraft({ silent: true, step: 3 });
      setStep(4);
    }
  };

  // Onay bekleyen satır: atlanmamış ve (eşleşmemiş ya da öğrencisi seçilmemiş ya da aynı öğrenci başka satırda)
  const isPending = (m: MatchItem) => !m.skip && (m.status !== 'ok' || !m.studentId || duplicateIds.has(m.studentId));
  const pendingCount = matches.filter(isPending).length;

  // "Önerileri onayla": öğrencisi seçili "kontrol" satırları onaylanır; seçili değilse ilk öneri seçilir
  // (aynı öğrenci başka satırda kullanılıyorsa o satır elle seçime bırakılır)
  const confirmSuggestions = () => {
    const used = new Map<string, number>();
    for (const m of matches) if (!m.skip && m.studentId) used.set(m.studentId, (used.get(m.studentId) || 0) + 1);
    let done = 0;
    const next = matches.map((m) => {
      if (m.skip || m.status === 'ok') return m;
      if (m.studentId) {
        if ((used.get(m.studentId) || 0) > 1) return m;
        done++;
        return { ...m, status: 'ok' as const };
      }
      const first = m.candidates.find((id) => !used.has(id));
      if (m.status === 'check' && first) {
        used.set(first, 1);
        done++;
        return { ...m, studentId: first, status: 'ok' as const };
      }
      return m;
    });
    setMatches(next);
    const left = next.filter((m) => !m.skip && (m.status !== 'ok' || !m.studentId)).length;
    setMatchMsg(
      `${done} öneri onaylandı.` +
        (left ? ` ${left} satırda öneri yok ya da öğrenci başka satırda kullanılıyor; bunları elle seçin ya da "Atla" işaretleyin.` : ' Onay bekleyen satır kalmadı.')
    );
    if (left) setMatchFilter('pending');
  };

  // ----------------------------------------------------------------------------- 4) sonuçların hesaplanması
  const computed = useMemo(() => {
    if (step !== 4) return null;
    const active = subjects.filter((s) => keyComplete(s.key));
    const qs = normalizeQuestions(subjects, questions);
    const list: DenemeResult[] = [];
    let guessed = 0;
    for (const m of matches) {
      if (m.skip || !m.studentId) continue;
      const st = studentById.get(m.studentId);
      if (!st) continue;
      const r = computeResult(m.group.answers, m.group.booklet, active, qs, LGS_SCORING);
      if (r.stats.bookletGuessed) guessed++;
      list.push({
        id: '',
        examId: '',
        studentId: st.id,
        studentName: st.name,
        classId: st.classId || null,
        className: st.className || classes.find((c) => c.id === st.classId)?.name || null,
        booklet: r.booklet,
        answers: r.answers,
        stats: r.stats,
        totalNet: r.totalNet,
        score: r.score,
        matchedBy: manual.has(m.group.key) ? 'elle' : m.method,
        optik: { number: normNumber(m.group.number), name: m.group.name, grade: m.group.grade, section: m.group.section },
      });
    }
    return { list, guessed, active };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, matches, questions]);

  const doSave = async () => {
    if (!computed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const qs = normalizeQuestions(subjects, questions);
      const active = subjects.filter((s) => keyComplete(s.key));
      const examId = existing?.id || draftId || newId('dnm');
      let results: DenemeResult[] = computed.list.map((r) => ({ ...r, examId, id: `${examId}:${r.studentId}`.slice(0, 120) }));

      // Var olan denemeye ek yükleme: öğrencinin önceki derslerdeki cevapları korunur
      if (existing) {
        setProgress('Önceki sonuçlar okunuyor…');
        const old = await listResults(existing.id);
        const byStudent = new Map(old.map((r) => [r.studentId, r]));
        results = results.map((r) => {
          const prev = byStudent.get(r.studentId);
          if (!prev) return r;
          const answers: Record<string, string> = {};
          for (const s of active) answers[s.key] = filled(r.answers[s.key]) ? r.answers[s.key] : prev.answers[s.key] || r.answers[s.key] || '';
          const re = recomputeFromAnswers(answers, r.booklet || prev.booklet, active, qs, LGS_SCORING);
          return { ...r, answers: re.answers, stats: re.stats, totalNet: re.totalNet, score: re.score };
        });
        const newIds = new Set(results.map((r) => r.studentId));
        for (const prev of old) {
          if (newIds.has(prev.studentId)) continue;
          const re = recomputeFromAnswers(prev.answers, prev.booklet, active, qs, LGS_SCORING);
          results.push({ ...prev, answers: re.answers, stats: re.stats, totalNet: re.totalNet, score: re.score });
        }
      }

      const summary = rankAndSummarize(results, active, qs);
      setProgress('Deneme kaydediliyor…');
      await saveExam({
        id: examId,
        kurumId: existing ? existing.kurumId : undefined,
        name: name.trim(),
        publisher: publisher.trim(),
        examDate,
        grade: '8',
        examType: 'LGS',
        subjects: active,
        questions: qs,
        scoring: LGS_SCORING,
        summary,
        published: existing?.published || false,
      });
      await saveResults(examId, results, false, (d, t) => setProgress(`Sonuçlar kaydediliyor… ${d}/${t}`));

      // Elle onaylanan eşleştirmeler sonraki denemeler için hatırlanır
      const remember = matches
        .filter((m) => !m.skip && m.studentId && (manual.has(m.group.key) || m.status === 'ok') && m.method !== 'hafıza' && m.method !== 'numara')
        .map((m) => ({ aliasKey: aliasKeyOf(m.group), studentId: m.studentId as string }));
      try {
        await saveAliases(remember);
      } catch {
        /* hafıza kaydedilemese de sonuçlar kaydedildi */
      }
      // Aşama 48d: Excel'deki kazanımlar artık bankaya EKLENMEZ; banka yalnızca MEB kazanımlarından oluşur
      left.current = true; // taslak sonuçlarla birlikte kesin kayda dönüştü
      onSaved(examId);
    } catch (e: any) {
      setError(e?.message || 'Kaydedilemedi.');
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  // ----------------------------------------------------------------------------- görünüm
  // Aynı öğrencinin seçildiği satırlar listede alt alta gelir (ilk satırın yerinde toplanır)
  const shownMatches = useMemo(() => {
    const list = matches.filter((m) => (matchFilter === 'all' ? true : matchFilter === 'pending' ? isPending(m) : !m.skip && m.status === 'none'));
    const firstIdx = new Map<string, number>();
    list.forEach((m, i) => {
      if (!m.skip && m.studentId && duplicateIds.has(m.studentId) && !firstIdx.has(m.studentId)) firstIdx.set(m.studentId, i);
    });
    return list
      .map((m, i) => ({ m, i, k: !m.skip && m.studentId && firstIdx.has(m.studentId) ? (firstIdx.get(m.studentId) as number) : i }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .map((x) => x.m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, matchFilter, duplicateIds]);

  const otherRowsOf = (m: MatchItem) => matches.filter((o) => o !== m && !o.skip && !!m.studentId && o.studentId === m.studentId);

  // "Başka satırda da seçili" yazısına tıklanınca diğer satıra kayılır ve satır kısa süre vurgulanır
  const jumpToTwin = (m: MatchItem) => {
    const twin = otherRowsOf(m)[0];
    if (!twin) return;
    const go = () => {
      const el = rowRefs.current.get(twin.group.key);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashKey(twin.group.key);
      window.setTimeout(() => setFlashKey((k) => (k === twin.group.key ? null : k)), 1800);
    };
    if (!shownMatches.includes(twin)) {
      setMatchFilter('all');
      window.setTimeout(go, 60);
    } else go();
  };

  return (
    <div className="space-y-4" id="deneme-wizard">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BACK_BTN} onClick={leave} id="deneme-wizard-geri">
          <ArrowLeft /> Denemelere dön
        </button>
        <h2 className="text-base font-semibold text-fg">{existing ? `${existing.name}: optik yükleme` : draftId ? name.trim() || 'Yeni deneme' : 'Yeni deneme'}</h2>
        {draftId && (
          <span className="ui-chip ui-chip-warning" id="deneme-taslak-chip">
            Taslak
          </span>
        )}
        {draftId && (
          <button type="button" className="ui-btn ui-btn-danger-soft ui-btn-sm ml-auto" disabled={draftBusy} onClick={() => setDeleteAsk(true)} id="deneme-taslak-sil">
            <Trash2 /> Taslağı sil
          </button>
        )}
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Adımlar">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border',
              s.n === step ? 'bg-brand-soft text-brand-fg border-brand/30' : s.n < step ? 'bg-success-soft text-success-fg border-transparent' : 'bg-surface-2 text-muted border-line'
            )}
            aria-current={s.n === step ? 'step' : undefined}
          >
            {s.n < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="tabular-nums">{s.n}</span>}
            {s.title}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Panel title="Deneme bilgileri" icon={FileText} tone="brand">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="ui-label" htmlFor="dn-name">Deneme adı</label>
              <input id="dn-name" className="ui-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="Örn. Turuncu Kuşak Deneme 1" />
            </div>
            <div>
              <label className="ui-label" htmlFor="dn-pub">Yayınevi</label>
              <input id="dn-pub" className="ui-input" value={publisher} maxLength={120} onChange={(e) => setPublisher(e.target.value)} placeholder="Örn. Doğru Tahmin" />
            </div>
            <div>
              <label className="ui-label" htmlFor="dn-date">Sınav tarihi</label>
              <input id="dn-date" type="date" className="ui-input" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <p className="ui-eyebrow mb-2">Cevap anahtarı ve kazanımlar (8. sınıf LGS)</p>
            <AnahtarEditor
              subjects={subjects}
              questions={questions}
              onChange={(q) => setQuestions(normalizeQuestions(subjects, q))}
              onExcelMeta={(r) => {
                if (!name.trim() && r.examName) setName(r.examName.slice(0, 200));
                if (r.examDate && !existing) setExamDate(r.examDate);
              }}
            />
          </div>
        </Panel>
      )}

      {step === 2 && (
        <>
          <Panel
            title="Optik formatı"
            description="FMT dosyasını yükleyin, kayıtlı bir formatı seçin ya da alanları elle girin. Sözel ve sayısal için ayrı FMT varsa ikisini de ayrı adla kaydedin; her TXT kendi formatıyla okunur."
            icon={FileText}
            tone="info"
          >
            <div className="flex flex-wrap items-end gap-2 mb-3">
              <div className="min-w-48">
                <label className="ui-label" htmlFor="dn-fmt">Kayıtlı format</label>
                <select id="dn-fmt" className="ui-input" value={formatId} onChange={(e) => pickFormat(e.target.value)}>
                  <option value="">Yeni format</option>
                  {formats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-48 flex-1">
                <label className="ui-label" htmlFor="dn-fmt-name">Format adı</label>
                <input id="dn-fmt-name" className="ui-input" value={formatName} maxLength={120} onChange={(e) => setFormatName(e.target.value)} placeholder="Örn. Sekonic LGS sözel-sayısal" />
              </div>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!fields.length || checkFields(fields).length > 0} onClick={() => void doSaveFormat(!formatId)}>
                <Save /> {formatId ? 'Formatı güncelle' : 'Formatı kaydet'}
              </button>
              {formatId && (
                <>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => void doSaveFormat(true)}>
                    Yeni olarak kaydet
                  </button>
                  <button type="button" className="ui-btn ui-btn-danger-soft ui-btn-sm" onClick={() => void doDeleteFormat()}>
                    <Trash2 /> Sil
                  </button>
                </>
              )}
            </div>
            {formatMsg && <p className="text-xs font-semibold text-info-fg bg-info-soft rounded-xl px-3 py-2 mb-3">{formatMsg}</p>}
            <OptikFormatEditor
              fields={fields}
              sequential={sequential}
              onSequentialChange={setSequential}
              sampleLine={editorFile ? sampleLine || '' : undefined}
              onChange={(f, text, fileName) => {
                if (text === undefined) {
                  setFields(f);
                  return;
                }
                // Aşama 90: FMT yüklendi. Oturumu karışık bloklar (sözelde "FEN", sayısalda "SOSYAL") düzeltilir
                const fx = fixSessionSubjects(f, subjects);
                setFields(fx.fields);
                setFmtText(text);
                // Yeni format: dosyaları önceki formata bağlı kalsın
                if (formatId) setTxtFiles((cur) => cur.map((x) => (x.fmt === '' ? { ...x, fmt: formatId } : x)));
                setFormatId('');
                if (fileName) setFormatName(fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120));
                const nm = (k: string) => subjects.find((s) => s.key === k)?.name || k;
                setFormatMsg(
                  fx.changes.length
                    ? `FMT okundu. ${fx.changes.map((c) => `"${c.label}" bloğu ${nm(c.to)} olarak ayarlandı (formda ${nm(c.from)} yazıyor ama bu oturumda o ders yok)`).join('; ')}. Kontrol edip "Formatı kaydet" deyin.`
                    : 'FMT okundu. Alanları kontrol edip "Formatı kaydet" deyin.'
                );
              }}
            />
          </Panel>

          <Panel
            title="Optik sonuç dosyaları (TXT)"
            description="Sözel ve sayısal TXT'leri birlikte yükleyin; her dosya kendi formatıyla okunur (uyan kayıtlı format kendiliğinden seçilir), aynı öğrencinin satırları birleştirilir."
            icon={Upload}
            tone="success"
            actions={
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => txtRef.current?.click()}>
                <Upload /> TXT yükle
              </button>
            }
          >
            <input
              ref={txtRef}
              type="file"
              accept=".txt,.TXT,.dat"
              multiple
              className="hidden"
              onChange={(e) => {
                void onTxt(e.target.files);
                e.target.value = '';
              }}
            />
            {txtFiles.length === 0 ? (
              <p className="text-sm text-muted">Henüz dosya yüklenmedi.</p>
            ) : (
              <div className="space-y-2">
                {txtFiles.map((f, i) => {
                  const p = parsed[i];
                  const read = p ? subjects.filter((s) => p.rows.some((r) => filled(r.answers[s.key]))) : [];
                  const sug = keySugs[i] || [];
                  const nm = (k: string) => subjects.find((s) => s.key === k)?.name || k;
                  return (
                    <div key={f.name} className="flex flex-wrap items-start gap-2 border border-line rounded-xl px-3 py-2" data-txt-file={f.name}>
                      <FileText className="w-4 h-4 text-muted mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-fg truncate min-w-0">{f.name}</p>
                          {f.rows ? (
                            <span className="ui-chip ui-chip-neutral" title="Taslakta kayıtlı okunmuş satırlar (TXT'nin kendisi saklanmaz)">
                              Kayıtlı{f.fmtName ? ` · ${f.fmtName}` : ''}
                            </span>
                          ) : (
                            <select
                              className="ui-input py-1 text-xs w-auto max-w-56"
                              value={usesEditor(f) ? '' : f.fmt}
                              onChange={(e) => setFileFmt(f.name, e.target.value)}
                              aria-label={`${f.name} optik formatı`}
                            >
                              <option value="">{formatId ? `${formatName || 'Format'} (düzenlenen)` : `${formatName || 'Yukarıdaki format'} (düzenlenen)`}</option>
                              {formats
                                .filter((x) => x.id !== formatId)
                                .map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.name}
                                  </option>
                                ))}
                            </select>
                          )}
                        </div>
                        {p ? (
                          <>
                            <p className="text-xs text-muted">
                              {p.rows.length} öğrenci satırı{read.length ? ` · ${read.map((s) => s.short).join(' · ')}` : ''}
                            </p>
                            {sug.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-fg">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span className="min-w-0 flex-1">
                                  {sug.map((x) => `"${nm(x.from)}" olarak okunan cevaplar ${x.rateFrom >= 0 ? `kendi anahtarıyla %${x.rateFrom}, ` : ''}${nm(x.to)} anahtarıyla %${x.rateTo} uyuşuyor`).join('; ')}. Optik formdaki ders blokları yanlış adlandırılmış olabilir.
                                </span>
                                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void applyKeyFix(i)}>
                                  Düzelt
                                </button>
                              </div>
                            )}
                            {p.errors.map((x) => (
                              <p key={x} className="text-xs font-semibold text-danger-fg">{x}</p>
                            ))}
                            {p.warnings.map((x) => (
                              <p key={x} className="text-xs text-warning-fg">{x}</p>
                            ))}
                          </>
                        ) : (
                          <p className="text-xs text-warning-fg">Önce optik formatını tamamlayın.</p>
                        )}
                        {fixHints[i] && (
                          <div className="mt-1.5 rounded-xl bg-info-soft px-3 py-2 text-xs text-info-fg space-y-1.5">
                            {fixHints[i]!.fits.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold">Bu dosya kayıtlı formatla uyuşuyor:</span>
                                {fixHints[i]!.fits.map((x) => (
                                  <button key={x.id} type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setFileFmt(f.name, x.id)}>
                                    “{x.name}” formatını kullan
                                  </button>
                                ))}
                              </div>
                            )}
                            {fixHints[i]!.shift !== null && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span>
                                  Alanlar <strong>{Math.abs(fixHints[i]!.shift!)}</strong> karakter {fixHints[i]!.shift! > 0 ? 'sağa' : 'sola'} kaydırılınca dosya formatla
                                  uyuşuyor (FMT'de TXT'ye yazılmayan ya da tarif edilmeyen bir alan olabilir).
                                </span>
                                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => applyShift(fixHints[i]!.shift!)}>
                                  Alanları kaydır
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon hover:text-danger-fg" aria-label="Dosyayı kaldır" onClick={() => setTxtFiles((cur) => cur.filter((x) => x.name !== f.name))}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                {allRows.length > 0 && !parseErrors.length && (
                  <div className="bg-surface border border-line rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-fg-2">
                        <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                          <tr>
                            <th className="px-3 py-2 font-semibold">No</th>
                            <th className="px-3 py-2 font-semibold">Ad soyad (optik)</th>
                            <th className="px-3 py-2 font-semibold">Sınıf</th>
                            <th className="px-3 py-2 font-semibold">Kitapçık</th>
                            {subjects.map((s) => (
                              <th key={s.key} className="px-3 py-2 font-semibold text-center">{s.short}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {allRows.slice(0, 6).map((r) => (
                            <tr key={`${r.file}-${r.line}`}>
                              <td className="px-3 py-1.5 tabular-nums">{r.number || '—'}</td>
                              <td className="px-3 py-1.5 font-semibold text-fg">{r.name || '—'}</td>
                              <td className="px-3 py-1.5">{[r.grade, r.section].filter(Boolean).join('/') || '—'}</td>
                              <td className="px-3 py-1.5">{r.booklet || '—'}</td>
                              {subjects.map((s) => (
                                <td key={s.key} className="px-3 py-1.5 text-center tabular-nums text-muted">
                                  {filled(r.answers[s.key]) ? (r.answers[s.key].match(/[A-E*]/g) || []).length : '·'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="px-3 py-2 text-[11px] text-muted border-t border-line">
                      İlk 6 satır gösteriliyor (toplam {allRows.length}). Ders sütunları işaretlenen cevap sayısıdır. Ad ve sınıf doğru görünmüyorsa format alanlarını kontrol edin.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </>
      )}

      {step === 3 && (
        <Panel
          title="Öğrenci eşleştirme"
          description="Öğrenciler önce numarayla, bulunamazsa ad soyadla bulunur; sınıf ve şube kontrol edilir. Emin olunamayanları siz onaylarsınız."
          icon={Users}
          tone="brand"
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="ui-chip ui-chip-success">{counts.ok} eşleşti</span>
            <span className={cx('ui-chip', counts.check ? 'ui-chip-warning' : 'ui-chip-neutral')}>{counts.check} kontrol</span>
            <span className={cx('ui-chip', counts.none ? 'ui-chip-danger' : 'ui-chip-neutral')}>{counts.none} bulunamadı</span>
            {counts.skip > 0 && <span className="ui-chip ui-chip-neutral">{counts.skip} atlandı</span>}
            <Segmented
              size="sm"
              className="ml-auto"
              value={matchFilter}
              onChange={setMatchFilter}
              items={[
                { value: 'all', label: `Tümü (${matches.length})` },
                { value: 'pending', label: `Onay bekleyenler (${pendingCount})`, id: 'dn-match-pending' },
                { value: 'none', label: `Bulunamayanlar (${counts.none})` },
              ]}
            />
            {counts.check > 0 && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={confirmSuggestions} id="dn-match-confirm">
                <CheckCircle2 /> Önerileri onayla
              </button>
            )}
          </div>
          {tcNote && <p className="text-xs font-semibold rounded-xl px-3 py-2 mb-3 bg-info-soft text-info-fg">{tcNote}</p>}
          {matchMsg && (
            <p role="status" className={cx('text-xs font-semibold rounded-xl px-3 py-2 mb-3', pendingCount ? 'bg-warning-soft text-warning-fg' : 'bg-success-soft text-success-fg')}>
              {matchMsg}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-danger-soft border border-danger/30" /> Tanınmayan öğrenci
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-warning-soft border border-warning/30" /> Kontrol edilmeli
            </span>
          </div>
          <div className="bg-surface border border-line rounded-2xl overflow-hidden">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs text-fg-2">
                <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Optikteki bilgi</th>
                    <th className="px-3 py-2 font-semibold">Durum</th>
                    <th className="px-3 py-2 font-semibold min-w-64">Sistemdeki öğrenci</th>
                    <th className="px-3 py-2 font-semibold text-center">Atla</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shownMatches.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-subtle">Bu filtrede satır yok.</td>
                    </tr>
                  ) : (
                    shownMatches.map((m) => {
                      const g = m.group;
                      const dup = !!m.studentId && duplicateIds.has(m.studentId) && !m.skip;
                      const st = m.skip ? 'skip' : dup ? 'check' : m.status;
                      return (
                        <tr
                          key={g.key}
                          ref={(el) => {
                            if (el) rowRefs.current.set(g.key, el);
                            else rowRefs.current.delete(g.key);
                          }}
                          className={cx(
                            'transition-shadow',
                            m.skip && 'opacity-55',
                            !m.skip && st === 'none' && 'bg-danger-soft/60',
                            !m.skip && st === 'check' && 'bg-warning-soft/50',
                            dup && 'border-l-4 border-l-warning',
                            flashKey === g.key && 'ring-2 ring-inset ring-brand'
                          )}
                        >
                          <td className="px-3 py-1.5">
                            <p className="font-semibold text-fg">{g.name || '—'}</p>
                            <p className="text-muted">
                              No {g.number || '—'} · {[g.grade, g.section].filter(Boolean).join('/') || 'sınıf yok'} · {g.booklet || '?'} kitapçığı
                            </p>
                            {g.warnings.map((w) => (
                              <p key={w} className="text-warning-fg">{w}</p>
                            ))}
                          </td>
                          <td className="px-3 py-1.5">
                            <span
                              className={cx(
                                'ui-chip',
                                st === 'ok' && 'ui-chip-success',
                                st === 'check' && 'ui-chip-warning',
                                st === 'none' && 'ui-chip-danger',
                                st === 'skip' && 'ui-chip-neutral'
                              )}
                            >
                              {st === 'ok' ? `Eşleşti${m.method ? ` (${manual.has(g.key) ? 'elle' : m.method})` : ''}` : st === 'check' ? 'Kontrol edin' : st === 'none' ? 'Bulunamadı' : 'Atlandı'}
                            </span>
                            {dup && (
                              <button
                                type="button"
                                className="block mt-0.5 text-left text-warning-fg underline underline-offset-2 hover:text-fg"
                                onClick={() => jumpToTwin(m)}
                                title="Aynı öğrencinin seçildiği diğer satıra git"
                              >
                                Aynı öğrenci başka satırda da seçili: {otherRowsOf(m).map((o) => o.group.name || `No ${o.group.number || '—'}`).join(', ')} →
                              </button>
                            )}
                            {!dup && m.reason && st !== 'ok' && <p className="text-muted mt-0.5">{m.reason}</p>}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 min-w-56">
                                <OgrenciSecici
                                  students={sortedStudents}
                                  byId={studentById}
                                  candidates={m.candidates}
                                  value={m.studentId}
                                  disabled={m.skip}
                                  onChange={(id) => setMatch(g.key, { studentId: id, status: id ? 'ok' : 'none', method: 'elle' })}
                                />
                              </div>
                              {st === 'check' && m.studentId && !dup && (
                                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setMatch(g.key, { status: 'ok' })}>
                                  Onayla
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input type="checkbox" checked={m.skip} aria-label="Bu satırı atla" onChange={(e) => setMatch(g.key, { skip: e.target.checked }, false)} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-muted mt-2">Elle seçtiğiniz ve ad soyadla bulunan eşleştirmeler hatırlanır; sonraki denemelerde otomatik eşleşir.</p>
        </Panel>
      )}

      {step === 4 && computed && (
        <Panel title="Kontrol ve kayıt" icon={CheckCircle2} tone="success">
          {(() => {
            const n = computed.list.length;
            const scores = computed.list.map((r) => r.score ?? 0);
            const avg = n ? scores.reduce((a, b) => a + b, 0) / n : 0;
            const missingSozel = computed.list.filter((r) => r.stats.missing?.includes('sozel')).length;
            const missingSayisal = computed.list.filter((r) => r.stats.missing?.includes('sayisal')).length;
            return (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-line px-3 py-2">
                    <p className="ui-eyebrow">Öğrenci</p>
                    <p className="text-xl font-bold text-fg tabular-nums">{n}</p>
                  </div>
                  <div className="rounded-xl border border-line px-3 py-2">
                    <p className="ui-eyebrow">Ortalama puan</p>
                    <p className="text-xl font-bold text-fg tabular-nums">{fmtScore(avg)}</p>
                  </div>
                  <div className="rounded-xl border border-line px-3 py-2">
                    <p className="ui-eyebrow">Değerlendirilen dersler</p>
                    <p className="text-sm font-semibold text-fg">{computed.active.map((s) => s.short).join(', ')}</p>
                  </div>
                  <div className="rounded-xl border border-line px-3 py-2">
                    <p className="ui-eyebrow">Atlanan satır</p>
                    <p className="text-xl font-bold text-fg tabular-nums">{counts.skip}</p>
                  </div>
                </div>
                {(missingSozel > 0 || missingSayisal > 0 || computed.guessed > 0) && (
                  <ul className="text-xs text-warning-fg bg-warning-soft rounded-xl px-3 py-2 space-y-0.5">
                    {missingSozel > 0 && <li>• {missingSozel} öğrencinin sözel oturumunda hiç cevap yok (girmemiş olabilir).</li>}
                    {missingSayisal > 0 && <li>• {missingSayisal} öğrencinin sayısal oturumunda hiç cevap yok (girmemiş olabilir).</li>}
                    {computed.guessed > 0 && <li>• {computed.guessed} öğrencinin kitapçık türü boştu; cevaplarına göre tahmin edildi.</li>}
                  </ul>
                )}
                {existing && (
                  <p className="text-xs text-info-fg bg-info-soft rounded-xl px-3 py-2">
                    Bu denemede daha önce kaydedilmiş sonuçlar korunur; yeni yüklenen derslerin cevapları eklenir ve sıralamalar yeniden hesaplanır.
                  </p>
                )}
                <div className="bg-surface border border-line rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-left text-xs text-fg-2">
                      <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Öğrenci</th>
                          <th className="px-3 py-2 font-semibold">Sınıf</th>
                          {computed.active.map((s) => (
                            <th key={s.key} className="px-3 py-2 font-semibold text-center">{s.short} net</th>
                          ))}
                          <th className="px-3 py-2 font-semibold text-right">Puan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {computed.list
                          .slice()
                          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                          .map((r) => (
                            <tr key={r.studentId}>
                              <td className="px-3 py-1.5 font-semibold text-fg">{r.studentName}</td>
                              <td className="px-3 py-1.5">{r.className || '—'}</td>
                              {computed.active.map((s) => (
                                <td key={s.key} className="px-3 py-1.5 text-center tabular-nums">{fmtNet(r.stats.subjects[s.key]?.net)}</td>
                              ))}
                              <td className="px-3 py-1.5 text-right font-bold text-fg tabular-nums">{fmtScore(r.score)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="text-[11px] text-muted">
                  Puan yaklaşık LGS puanıdır (194,75 + ağırlıklı net × 1,13; 3 yanlış 1 doğruyu götürür). Gerçek LGS puanı Türkiye geneli ortalamalarla hesaplanır.
                </p>
              </div>
            );
          })()}
        </Panel>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      {draftNote && !error && (
        <p role="status" className={cx('text-xs font-semibold rounded-xl px-3 py-2', draftNote.tone === 'success' ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-warning-fg')}>
          {draftNote.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={saving} onClick={() => (step === 1 || (existing && step === startStep) ? leave() : setStep((step - 1) as Step))}>
          <ArrowLeft /> {step === 1 || (existing && step === startStep) ? 'Vazgeç' : 'Geri'}
        </button>
        {progress && <span className="text-xs text-muted">{progress}</span>}
        {step < 4 ? (
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {canDraft && (
              <span className="text-[11px] text-muted" id="deneme-taslak-durum">
                {draftBusy ? 'Kaydediliyor…' : dirty ? 'Kaydedilmemiş değişiklik var' : savedAt ? `Kaydedildi · ${hhmm(savedAt)}` : ''}
              </span>
            )}
            {canDraft && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void saveDraft()} disabled={draftBusy || matching} id="deneme-taslak-kaydet">
                <Save /> Kaydet
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={next} disabled={matching}>
              {matching ? 'Eşleştiriliyor…' : 'Devam'} <ArrowRight />
            </button>
          </div>
        ) : (
          <button type="button" className="ui-btn ui-btn-success ui-btn-sm" disabled={saving || !computed?.list.length} onClick={() => void doSave()}>
            <Save /> {saving ? 'Kaydediliyor…' : 'Sonuçları kaydet'}
          </button>
        )}
      </div>

      {/* Aşama 90: kaydedilmemiş değişiklikle çıkış */}
      <Modal
        open={leaveAsk}
        onClose={() => !draftBusy && setLeaveAsk(false)}
        title="Değişiklikler kaydedilmedi"
        description="Kaydederseniz sonra Deneme listesinden kaldığınız yerden devam edersiniz."
        icon={Save}
        tone="warning"
        size="sm"
        footer={
          <>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-secondary')} disabled={draftBusy} onClick={() => setLeaveAsk(false)}>
              Vazgeç
            </button>
            <button
              type="button"
              className={cx(SQ_BTN, 'ui-btn-danger-soft')}
              disabled={draftBusy}
              onClick={() => {
                left.current = true;
                setLeaveAsk(false);
                onCancel();
              }}
            >
              Kaydetmeden çık
            </button>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-primary')} disabled={draftBusy || !name.trim()} onClick={() => void saveAndLeave()} id="deneme-kaydet-cik">
              <Save /> {draftBusy ? 'Kaydediliyor…' : 'Kaydet ve çık'}
            </button>
          </>
        }
      >
        <p className="text-xs text-fg-2">
          {name.trim() ? 'Deneme bilgileri, cevap anahtarı ve okunan optik dosyaları saklanır. TXT dosyasının kendisi ve TC numaraları saklanmaz.' : 'Kaydetmek için önce deneme adını yazın.'}
        </p>
      </Modal>

      <Modal
        open={deleteAsk}
        onClose={() => !draftBusy && setDeleteAsk(false)}
        title="Taslak silinsin mi?"
        description={`"${name.trim() || 'Yeni deneme'}" taslağı kalıcı olarak silinir.`}
        icon={Trash2}
        tone="danger"
        size="sm"
        footer={
          <>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-secondary')} disabled={draftBusy} onClick={() => setDeleteAsk(false)}>
              Vazgeç
            </button>
            <button type="button" className={cx(SQ_BTN, 'ui-btn-danger')} disabled={draftBusy} onClick={() => void doDeleteDraft()}>
              <Trash2 /> Sil
            </button>
          </>
        }
      >
        <p className="text-xs text-fg-2">Cevap anahtarı ve okunan optik verisi de silinir. Kayıtlı optik formatları silinmez.</p>
      </Modal>
    </div>
  );
};
