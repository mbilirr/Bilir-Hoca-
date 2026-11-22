// Deneme sihirbazı: sayfanın bütün durumu ve işlemleri (Aşama 363). Görünüm parçaları bunu useSihirbazBaglam() ile okur.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { keyBProblems } from '../../../lib/deneme/bKitapcik';
import { checkFields, decodeOptikFile, formatFitsTxt, parseTxt, shiftFields, suggestShift, type OptikField, type OptikRow, type TxtParseResult } from '../../../lib/deneme/optik';
import { otomatikAlanlar } from '../../../lib/deneme/optikOtomatik';
import { HAZIR_FORMATLAR, hazirMi } from '../../../lib/deneme/hazirFormatlar';
import { checkBlocksWithKey, remapFields, remapRows, suggestionMap, type KeySuggestion } from '../../../lib/deneme/oturum';
import { aliasKeyOf, applyMerge, findSessionPairs, groupRows, matchGroups, nameSimilarity, resultNumber, type MatchItem, type SessionPair } from '../../../lib/deneme/eslestir';
import { computeResult, examScoring, isLgsGrade, scoringFor, sinifNo, type ExamSubject, normalizeQuestions, rankAndSummarize, recomputeFromAnswers, type ExamQuestions } from '../../../lib/deneme/lgs';
import { listFormats, listResults, loadAliases, saveAliases, saveExam, saveFormat, deleteFormat, saveResults, listStudentTcHashes, deleteExam, type DenemeDraft, type DenemeFormat, type DenemeResult, type DraftFile } from '../../../services/denemeService';
import { newId } from '../../../lib/ids';
import { hashTcs, validTc } from '../../../lib/tcApi';
import { gradeOf } from '../../../lib/teacherGrades';
import { type ExcelKeyResult } from '../../../lib/deneme/anahtarExcel';
import { wizardSubjects, YANLIS_SECENEK, Step, todayStr, filled, TxtSrc, OTO, OTO_AD, DenemeWizardProps } from './ortak';

export function useSihirbaz({ students, classes, existing, draft, startStep = 1, onCancel, onSaved, onDraftChange, grade: gradeProp }: DenemeWizardProps) {
  const src = existing || draft || null;
  // Aşama 271: sınıf düzeyi denemeyle birlikte kaydedilir ve sonradan değişmez
  const grade = sinifNo(src?.grade || gradeProp || '8') || '8';
  const lgs = isLgsGrade(grade);
  const [subjects, setSubjects] = useState<ExamSubject[]>(() => wizardSubjects(grade, src?.subjects));
  const subjectsRef = useRef(subjects);
  subjectsRef.current = subjects;
  // 8'de LGS puanı (değişmez); 5-7'de yanlış etkisi yayınevine göre seçilir (Excel'de yazıyorsa oradan)
  const [yanlis, setYanlis] = useState<number>(() => examScoring(src).wrongPerCorrect);
  const scoring = existing ? examScoring(existing) : scoringFor(subjects, lgs ? 3 : yanlis);
  const [countNote, setCountNote] = useState<string | null>(null);
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
  // Aşama 118: farklı numarayla kodlanmış oturumlar için "aynı öğrenci mi?" onayı
  const [pairs, setPairs] = useState<SessionPair[]>([]);
  const [pairIdx, setPairIdx] = useState(0);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairStudent, setPairStudent] = useState<string | null>(null);
  const pairMerged = useRef(0);

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

  // Aşama 335: kurumun kayıtlı formatları + hazır formatlar (önce kurumunki denenir)
  const tumFormatlar = useMemo(() => [...formats, ...HAZIR_FORMATLAR], [formats]);
  // Aşama 90: her TXT kendi formatıyla okunur. '' ya da düzenlenen kayıtlı format = yukarıdaki (canlı) alanlar
  const usesEditor = (f: TxtSrc) => !f.rows && (f.fmt === '' || f.fmt === formatId);
  const fieldsFor = (f: TxtSrc): OptikField[] | null =>
    f.fmt === OTO && f.oto ? f.oto.fields : usesEditor(f) ? fields : tumFormatlar.find((x) => x.id === f.fmt)?.fields || null;
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
    [txtFiles, fields, tumFormatlar, formatId]
  );
  const allRows = useMemo(() => parsed.flatMap((p) => (p ? p.rows : [])), [parsed]);
  const parseErrors = parsed.flatMap((p, i) => (p ? p.errors : [`${txtFiles[i]?.name}: formatı seçin ya da tamamlayın.`]));
  // Aşama 49c: TXT seçili formatla uyuşmuyorsa öneri: uyuşan kayıtlı format ya da alanları topluca kaydırma
  const fixHints = useMemo(
    () =>
      txtFiles.map((f, i) => {
        const p = parsed[i];
        if (!f.text || (p && !p.errors.length)) return null;
        const fits = tumFormatlar.filter((x) => x.id !== f.fmt && !(usesEditor(f) && x.id === formatId) && formatFitsTxt(f.text!, x.fields)).slice(0, 3);
        const shift = fits.length || !p || !usesEditor(f) ? null : suggestShift(f.text, fields);
        return fits.length || shift !== null ? { fits, shift } : null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txtFiles, parsed, tumFormatlar, formatId, fields]
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

  // Aşama 271: eşleştirmede yalnız bu sınıf düzeyindeki öğrenciler aday olur (5. sınıftaki adaş 8. sınıfa yazılmaz).
  // Sınıfının düzeyi bilinmeyen öğrenci de aday kalır; sınıf düzeyi sayı değilse (ör. "Mezun") süzülmez.
  const adaylar = useMemo(() => {
    if (!/^\d+$/.test(grade)) return students;
    const byId = new Map(classes.map((c) => [c.id, c]));
    return students.filter((st) => {
      const c = byId.get(st.classId);
      const g = c ? gradeOf(c) : gradeOf({ gradeLevel: st.gradeLevel, name: st.className });
      return g === null || String(g) === grade;
    });
  }, [students, classes, grade]);
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const sortedStudents = useMemo(
    () => adaylar.slice().sort((a, b) => (a.className || '').localeCompare(b.className || '', 'tr') || a.name.localeCompare(b.name, 'tr')),
    [adaylar]
  );
  // Aşama 271: optikte SINIF alanı varsa seçilen sınıfla uyuşmalı (yanlış sınıfın TXT'si yüklenmesin)
  const sinifUyumsuz = useMemo(() => {
    if (!/^\d+$/.test(grade)) return 0;
    let n = 0;
    for (const r of allRows) {
      const g = (r.grade || '').replace(/\D/g, '');
      if (g && g !== grade) n++;
    }
    return n;
  }, [allRows, grade]);

  // Aşama 271: 5-7'de yayınevlerinin soru sayısı farklı olabilir. Okunan dosyada bir dersin soruları 1'den N'ye
  // eksiksizse soru sayısı N yapılır (cevap anahtarı kesilmeden). Excel'de "Sınıf" ve "Yanlış Etkisi" yazıyorsa
  // sınıf denetlenir, yanlış etkisi alınır. 8. sınıf (LGS) ve kayıtlı deneme değişmez.
  const fileMeta = (r: ExcelKeyResult) => {
    const notes: string[] = [];
    if (r.grade && /^\d+$/.test(grade) && r.grade !== grade) notes.push(`Dosyada "${r.grade}. sınıf" yazıyor, bu deneme ${grade}. sınıf. Doğru dosyayı yüklediğinizden emin olun.`);
    if (!lgs && !existing) {
      if (typeof r.wrongPerCorrect === 'number' && r.wrongPerCorrect !== yanlis) {
        setYanlis(r.wrongPerCorrect);
        notes.push(`Yanlış etkisi dosyadan alındı: ${YANLIS_SECENEK.find((x) => x.v === r.wrongPerCorrect)?.label || r.wrongPerCorrect}.`);
      }
      const changed: string[] = [];
      const nextSubs = subjectsRef.current.map((sub) => {
        const list = r.questions[sub.key] || [];
        if (!list.length) return sub;
        const nos = new Set(list.map((q) => q.no));
        const max = Math.max(...Array.from(nos));
        if (max === sub.count || max < 5 || max > 40 || nos.size !== max) return sub;
        changed.push(`${sub.short} ${sub.count} → ${max}`);
        return { ...sub, count: max };
      });
      if (changed.length) {
        subjectsRef.current = nextSubs;
        setSubjects(nextSubs);
        notes.push(`Soru sayıları dosyaya göre ayarlandı: ${changed.join(', ')}.`);
      }
    }
    setCountNote(notes.length ? notes.join(' ') : null);
  };
  /** 5-7: soru sayısı elle (dosyada başlık yoksa ya da yayınevi farklıysa) */
  const setCount = (key: string, n: number) => {
    const c = Math.max(1, Math.min(40, Math.round(n) || 0));
    const nextSubs = subjects.map((x) => (x.key === key ? { ...x, count: c } : x));
    subjectsRef.current = nextSubs;
    setSubjects(nextSubs);
    setQuestions((q) => normalizeQuestions(nextSubs, q));
  };

  const onTxt = async (list: FileList | null) => {
    if (!list?.length) return;
    const add: TxtSrc[] = [];
    for (const f of Array.from(list)) {
      const text = decodeOptikFile(await f.arrayBuffer());
      // Aşama 90: dosyaya uyan format kendiliğinden seçilir (önce yukarıdaki format, sonra kayıtlı, sonra hazır formatlar)
      const editorFits = fields.length > 0 && !checkFields(fields).length && formatFitsTxt(text, fields);
      const fit = editorFits ? null : tumFormatlar.find((x) => formatFitsTxt(text, x.fields));
      // Aşama 271: uyan FMT yoksa dosyanın kendisinden okunur (FMT'siz okuma); sonuç ekranda kontrol edilir
      const oto = editorFits || fit ? null : otomatikAlanlar(text, subjectsRef.current, grade);
      add.push({ name: f.name, text, fmt: fit ? fit.id : oto ? OTO : '', oto: oto || undefined, fmtName: oto ? OTO_AD : undefined });
    }
    setTxtFiles((cur) => [...cur.filter((c) => !add.some((a) => a.name === c.name)), ...add]);
  };
  const setFileFmt = (name: string, fmt: string) =>
    setTxtFiles((cur) =>
      cur.map((f) => {
        if (f.name !== name) return f;
        if (fmt !== OTO) return { ...f, fmt, fmtName: f.rows ? f.fmtName : undefined };
        // Aşama 271: FMT'siz okuma seçildi (daha önce çözülmediyse şimdi çözülür)
        const oto = f.oto || (f.text ? otomatikAlanlar(f.text, subjectsRef.current, grade) : null);
        return oto ? { ...f, fmt: OTO, oto, fmtName: OTO_AD } : f;
      })
    );
  /** Aşama 271: FMT'siz okunan alanları format düzenleyicisine alır (düzeltip kaydetmek için) */
  const otoDuzenle = (name: string) => {
    const f = txtFiles.find((x) => x.name === name);
    if (!f?.oto) return;
    if (formatId) setTxtFiles((cur) => cur.map((x) => (x.fmt === '' ? { ...x, fmt: formatId } : x)));
    setFields(f.oto.fields);
    setSequential(true);
    setFmtText('');
    setFormatId('');
    setFormatName(`${name.replace(/\.[^.]+$/, '').slice(0, 100)} (FMT'siz)`);
    setTxtFiles((cur) => cur.map((x) => (x.name === name ? { ...x, fmt: '', fmtName: undefined } : x)));
    setFormatMsg('Dosyadan çözülen alanlar aşağıda. "İlk satırda okunan" sütununu kontrol edin; sonraki denemeler için "Formatı kaydet" deyin.');
  };

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
      const cur = formatId && !hazirMi(formatId) ? formats.find((x) => x.id === formatId) : null;
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
    const fm = tumFormatlar.find((x) => x.id === f.fmt);
    if (!fm) return;
    const nf = remapFields(fm.fields, map);
    if (hazirMi(fm.id)) {
      // Aşama 335: hazır format değişmez; düzeltilmiş hâli düzenleyiciye alınır, kuruma yeni format olarak kaydedilir
      if (formatId) setTxtFiles((cur) => cur.map((x) => (x.fmt === '' ? { ...x, fmt: formatId } : x)));
      setFields(nf);
      setSequential(false);
      setFmtText('');
      setFormatId('');
      setFormatName(`${fm.name.replace(/^Hazır · /, '')} (düzeltilmiş)`.slice(0, 120));
      setTxtFiles((cur) => cur.map((x) => (x.name === f.name ? { ...x, fmt: '', fmtName: undefined } : x)));
      setFormatMsg(`Dersler düzeltildi (${names}). Sonraki denemeler için "Formatı kaydet" deyin.`);
      return;
    }
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
    const f = tumFormatlar.find((x) => x.id === id);
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
      // Aşama 335: hazır format üzerine yazılmaz, kuruma yeni format olarak kaydedilir
      const saved = await saveFormat({ id: asNew || hazirMi(formatId) ? undefined : formatId || undefined, name: (formatName || 'Optik formatı').replace(/^Hazır · /, ''), fmtText, fields });
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
    if (!formatId || hazirMi(formatId)) return;
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
      const allowed = new Set(adaylar.map((s) => s.id));
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
    return matchGroups(groups, adaylar, classes, aliases, tcMatch.size ? tcMatch : undefined);
  };
  /** Aşama 118: birleşebilecek oturum satırları. Daha önce onaylananlar (hafıza / TC) sormadan birleşir, kalanlar sorulur. */
  const studentNo = (id: string | null) => (id ? studentById.get(id)?.studentNumber : undefined);
  const withPairs = (list: MatchItem[], ask: boolean): MatchItem[] => {
    const ps = findSessionPairs(list, subjects);
    let next = list;
    for (const p of ps) if (p.auto) next = applyMerge(next, p.a, p.b, p.studentId, studentNo(p.studentId));
    const rest = ps.filter((p) => !p.auto);
    pairMerged.current = 0;
    setPairs(rest);
    setPairIdx(0);
    setPairStudent(rest[0]?.studentId ?? null);
    setPairOpen(ask && rest.length > 0);
    return next;
  };
  const runMatching = async (): Promise<MatchItem[]> => {
    const list = withPairs(await buildMatches(allRows), true);
    setMatches(list);
    setManual(new Set());
    return list;
  };

  // Aşama 90: taslak 3. adımda bırakıldıysa eşleştirme yeniden kurulur ve kayıtlı seçimler uygulanır
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !draftData?.match || step !== 3 || !aliasesReady || !allRows.length) return;
    resumed.current = true;
    void buildMatches(allRows).then((built) => {
      const saved = new Map(draftData.match!.map((m) => [m.k, m]));
      // Aşama 118: taslakta onaylanmış birleştirmeler yeniden kurulur
      let list = built;
      for (const x of draftData.match!) {
        const i = x.k.indexOf('+');
        if (i > 0) list = applyMerge(list, x.k.slice(0, i), x.k.slice(i + 1), x.s, studentNo(x.s));
      }
      list = withPairs(list, false);
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
        const fm = f.rows ? null : usesEditor(f) ? { name: formatName } : tumFormatlar.find((x) => x.id === f.fmt);
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
        grade,
        examType: lgs ? 'LGS' : 'ARA', // Aşama 271: 5-7 (ara sınıf) denemesi
        subjects: completeSubjects,
        questions: normalizeQuestions(subjects, questions),
        scoring,
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
      if (bp.length) return setError(`Kitapçık eşleşmesinde sorun var: ${bp[0]}${bp.length > 1 ? ` (+${bp.length - 1} sorun daha)` : ''} Ders satırındaki "Sorular" bölümünden düzeltin.`);
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
      if (pairs.length) {
        setPairOpen(true);
        return setError(`${pairs.length} oturum birleştirme önerisi onay bekliyor. "Birleştir" ya da "Ayrı kalsın" seçin.`);
      }
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
    let weak = 0;
    // Aşama 213: optikteki ad önerilen öğrencinin adına %50'den az benziyorsa toplu onay yapılmaz (tek tek onaylanır);
    // örn. başka öğrenci "123" gibi bir numarayı kodladığında puan yanlış öğrenciye yazılmasın.
    const weakName = (m: MatchItem, id: string) => {
      const st = studentById.get(id);
      return !!m.group.name && !!st && nameSimilarity(m.group.name, st.name) < 0.5;
    };
    const next = matches.map((m) => {
      if (m.skip || m.status === 'ok') return m;
      if (m.studentId) {
        if ((used.get(m.studentId) || 0) > 1) return m;
        if (weakName(m, m.studentId)) {
          weak++;
          return m;
        }
        done++;
        return { ...m, status: 'ok' as const };
      }
      const first = m.candidates.find((id) => !used.has(id));
      if (m.status === 'check' && first && !weakName(m, first)) {
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
        (weak ? ` ${weak} satırda ad %50'den az benziyor; bunları tek tek onaylayın.` : '') +
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
      const r = computeResult(m.group.answers, m.group.booklet, active, qs, scoring);
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
        // Aşama 94: kâğıttaki sırayla cevaplar da saklanır (B eşleşmesi sonradan düzeltilirse sonuçlar bundan kurulur)
        optik: {
          number: resultNumber(m.group, st.studentNumber), // Aşama 118: kayıtlı numara kodlananlar arasındaysa o
          name: m.group.name,
          grade: m.group.grade,
          section: m.group.section,
          kag: Object.fromEntries(active.filter((s) => filled(m.group.answers[s.key])).map((s) => [s.key, (m.group.answers[s.key] || '').slice(0, s.count)])),
        },
      });
    }
    return { list, guessed, active };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, matches, questions, scoring.perWeighted, scoring.wrongPerCorrect]);

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
          const re = recomputeFromAnswers(answers, r.booklet || prev.booklet, active, qs, scoring);
          const kag = { ...(prev.optik?.kag || {}), ...(r.optik?.kag || {}) };
          return { ...r, answers: re.answers, stats: re.stats, totalNet: re.totalNet, score: re.score, optik: { ...prev.optik, ...r.optik, kag } };
        });
        const newIds = new Set(results.map((r) => r.studentId));
        for (const prev of old) {
          if (newIds.has(prev.studentId)) continue;
          const re = recomputeFromAnswers(prev.answers, prev.booklet, active, qs, scoring);
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
        grade,
        examType: existing?.examType || (lgs ? 'LGS' : 'ARA'),
        subjects: active,
        questions: qs,
        scoring,
        summary,
        published: existing?.published || false,
      });
      await saveResults(examId, results, false, (d, t) => setProgress(`Sonuçlar kaydediliyor… ${d}/${t}`));

      // Elle onaylanan eşleştirmeler sonraki denemeler için hatırlanır
      const remember = matches
        .filter((m) => !m.skip && m.studentId && (manual.has(m.group.key) || m.status === 'ok') && m.method !== 'hafıza' && m.method !== 'numara')
        .flatMap((m) => (m.group.aliasKeys || [aliasKeyOf(m.group)]).map((aliasKey) => ({ aliasKey, studentId: m.studentId as string })));
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

  // ----------------------------------------------------------------------------- Aşama 118: oturum birleştirme
  const sessionLabel = (g: MatchItem['group']) => {
    const ss = new Set(subjects.filter((x) => filled(g.answers[x.key])).map((x) => x.session));
    return ss.size === 2 ? 'Sözel + Sayısal' : ss.has('sozel') ? 'Sözel' : ss.has('sayisal') ? 'Sayısal' : 'Cevap yok';
  };
  /** İki satır birbirini tamamlıyor mu (biri yalnız sözel, diğeri yalnız sayısal) */
  const complementary = (a: MatchItem, b: MatchItem) => {
    const sa = sessionLabel(a.group);
    const sb = sessionLabel(b.group);
    return (sa === 'Sözel' && sb === 'Sayısal') || (sa === 'Sayısal' && sb === 'Sözel');
  };
  const pair = pairs[pairIdx] || null;
  const pairA = pair ? matches.find((m) => m.group.key === pair.a) : undefined;
  const pairB = pair ? matches.find((m) => m.group.key === pair.b) : undefined;

  /** Öneriyi uygular (Birleştir) ya da geçer (Ayrı kalsın), sonra sıradaki öneriye geçer */
  const resolvePair = (merge: boolean) => {
    if (!pair) return;
    if (merge && pairA && pairB) {
      const sid = pairStudent;
      setMatches((cur) => applyMerge(cur, pair.a, pair.b, sid, studentNo(sid)));
      setManual((cur) => new Set(cur).add(`${pair.a}+${pair.b}`));
      pairMerged.current++;
    }
    const rest = pairs.filter((_, i) => i !== pairIdx);
    const ni = Math.max(0, Math.min(pairIdx, rest.length - 1));
    setPairs(rest);
    setPairIdx(ni);
    setPairStudent(rest[ni]?.studentId ?? null);
    if (!rest.length) {
      setPairOpen(false);
      setError(null);
      if (pairMerged.current) setMatchMsg(`${pairMerged.current} öğrencinin sözel ve sayısal satırları birleştirildi.`);
    }
  };
  /** Listede "aynı öğrenci başka satırda" uyarısından birleştirme penceresini açar */
  const askMerge = (m: MatchItem, twin: MatchItem) => {
    const p: SessionPair = { a: m.group.key, b: twin.group.key, studentId: m.studentId, reason: 'Bu iki satıra aynı öğrenci seçildi.', auto: false };
    const rest = [p, ...pairs.filter((x) => x.a !== p.a && x.b !== p.a && x.a !== p.b && x.b !== p.b)];
    setPairs(rest);
    setPairIdx(0);
    setPairStudent(p.studentId);
    setPairOpen(true);
  };

  return {
    students,
    classes,
    existing,
    draft,
    startStep,
    onCancel,
    onSaved,
    onDraftChange,
    gradeProp,
    src,
    grade,
    lgs,
    subjects,
    setSubjects,
    subjectsRef,
    yanlis,
    setYanlis,
    scoring,
    countNote,
    setCountNote,
    draftData,
    step,
    setStep,
    error,
    setError,
    name,
    setName,
    publisher,
    setPublisher,
    examDate,
    setExamDate,
    questions,
    setQuestions,
    formats,
    setFormats,
    formatId,
    setFormatId,
    fields,
    setFields,
    fmtText,
    setFmtText,
    sequential,
    setSequential,
    formatName,
    setFormatName,
    formatMsg,
    setFormatMsg,
    txtFiles,
    setTxtFiles,
    txtRef,
    aliases,
    setAliases,
    matches,
    setMatches,
    manual,
    setManual,
    matchFilter,
    setMatchFilter,
    matchMsg,
    setMatchMsg,
    flashKey,
    setFlashKey,
    rowRefs,
    pairs,
    setPairs,
    pairIdx,
    setPairIdx,
    pairOpen,
    setPairOpen,
    pairStudent,
    setPairStudent,
    pairMerged,
    saving,
    setSaving,
    progress,
    setProgress,
    canDraft,
    draftId,
    setDraftId,
    draftBusy,
    setDraftBusy,
    savedAt,
    setSavedAt,
    draftNote,
    setDraftNote,
    dirty,
    setDirty,
    skipDirty,
    left,
    leaveAsk,
    setLeaveAsk,
    deleteAsk,
    setDeleteAsk,
    aliasesReady,
    setAliasesReady,
    keyComplete,
    completeSubjects,
    tumFormatlar,
    usesEditor,
    fieldsFor,
    parsed,
    allRows,
    parseErrors,
    fixHints,
    keySugs,
    applyShift,
    editorFile,
    sampleLine,
    answeredSubjects,
    keyMissingForAnswered,
    adaylar,
    studentById,
    sortedStudents,
    sinifUyumsuz,
    fileMeta,
    setCount,
    onTxt,
    setFileFmt,
    otoDuzenle,
    applyKeyFix,
    pickFormat,
    doSaveFormat,
    doDeleteFormat,
    matching,
    setMatching,
    tcNote,
    setTcNote,
    linkTcs,
    buildMatches,
    studentNo,
    withPairs,
    runMatching,
    resumed,
    setMatch,
    counts,
    duplicateIds,
    saveDraft,
    latest,
    leave,
    saveAndLeave,
    doDeleteDraft,
    next,
    isPending,
    pendingCount,
    confirmSuggestions,
    computed,
    doSave,
    shownMatches,
    otherRowsOf,
    jumpToTwin,
    sessionLabel,
    complementary,
    pair,
    pairA,
    pairB,
    resolvePair,
    askMerge,
  };
}

export type SihirbazBaglamDegeri = ReturnType<typeof useSihirbaz>;
export const SihirbazBaglam = createContext<SihirbazBaglamDegeri | null>(null);
export function useSihirbazBaglam(): SihirbazBaglamDegeri {
  const d = useContext(SihirbazBaglam);
  if (!d) throw new Error('SihirbazBaglam sağlayıcısı yok');
  return d;
}
