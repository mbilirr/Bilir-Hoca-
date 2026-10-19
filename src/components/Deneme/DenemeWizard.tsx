import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Save, Trash2, Upload, Users } from 'lucide-react';
import { Panel, Segmented, cx } from '../ui/kit';
import type { ClassGroup, Student } from '../../types';
import { OptikFormatEditor } from './OptikFormatEditor';
import { AnahtarEditor } from './AnahtarEditor';
import { OgrenciSecici } from './OgrenciSecici';
import { checkFields, decodeOptikFile, formatFitsTxt, parseTxt, shiftFields, suggestShift, type OptikField, type TxtParseResult } from '../../lib/deneme/optik';
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
  type DenemeExam,
  type DenemeFormat,
  type DenemeResult,
} from '../../services/denemeService';
import { newId } from '../../lib/ids';
import { hashTcs, validTc } from '../../lib/tcApi';

// ============================================================================
// Yeni deneme / optik yükleme sihirbazı (Aşama 47)
// 1) Bilgiler + cevap anahtarı/kazanım  2) Optik format + TXT  3) Öğrenci eşleştirme  4) Kontrol ve kayıt
// Var olan bir denemeye sonradan başka oturumun TXT'si yüklenirse, öğrencinin diğer derslerdeki cevapları korunur.
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

export const DenemeWizard: React.FC<{
  students: Student[];
  classes: ClassGroup[];
  existing?: DenemeExam | null; // varsa: optik yükleme bu denemeye yapılır (1. adım düzenleme olarak açılır)
  startStep?: Step;
  onCancel: () => void;
  onSaved: (examId: string) => void;
}> = ({ students, classes, existing, startStep = 1, onCancel, onSaved }) => {
  const subjects = LGS_SUBJECTS;
  const [step, setStep] = useState<Step>(startStep);
  const [error, setError] = useState<string | null>(null);

  // 1) Bilgiler
  const [name, setName] = useState(existing?.name || '');
  const [publisher, setPublisher] = useState(existing?.publisher || '');
  const [examDate, setExamDate] = useState(existing?.examDate || todayStr());
  const [questions, setQuestions] = useState<ExamQuestions>(() => normalizeQuestions(subjects, existing?.questions || {}));

  // 2) Optik
  const [formats, setFormats] = useState<DenemeFormat[]>([]);
  const [formatId, setFormatId] = useState<string>('');
  const [fields, setFields] = useState<OptikField[]>([]);
  const [fmtText, setFmtText] = useState('');
  const [sequential, setSequential] = useState(true);
  const [formatName, setFormatName] = useState('');
  const [formatMsg, setFormatMsg] = useState<string | null>(null);
  const [txtFiles, setTxtFiles] = useState<Array<{ name: string; text: string }>>([]);
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
      .catch(() => setAliases({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keyComplete = (k: string) => (questions[k] || []).length > 0 && (questions[k] || []).every((q) => !!q.answer);
  const completeSubjects = subjects.filter((s) => keyComplete(s.key));

  // TXT'ler format değişince yeniden okunur
  const parsed: TxtParseResult[] = useMemo(() => (checkFields(fields).length ? [] : txtFiles.map((f) => parseTxt(f.text, fields, f.name))), [txtFiles, fields]);
  const allRows = useMemo(() => parsed.flatMap((p) => p.rows), [parsed]);
  const parseErrors = parsed.flatMap((p) => p.errors);
  // Aşama 49c: TXT seçili formatla uyuşmuyorsa öneri: uyuşan kayıtlı format ya da alanları topluca kaydırma
  const fixHints = useMemo(
    () =>
      txtFiles.map((f, i) => {
        const p = parsed[i];
        if (p && !p.errors.length) return null;
        const fits = formats.filter((x) => x.id !== formatId && formatFitsTxt(f.text, x.fields)).slice(0, 3);
        const shift = fits.length || !p ? null : suggestShift(f.text, fields);
        return fits.length || shift !== null ? { fits, shift } : null;
      }),
    [txtFiles, parsed, formats, formatId, fields]
  );
  const applyShift = (n: number) => {
    setSequential(false);
    setFields(shiftFields(fields, n));
    setFormatMsg(
      `Alanlar ${Math.abs(n)} karakter ${n > 0 ? 'sağa' : 'sola'} kaydırıldı. Tablodaki "İlk satırda okunan" sütununu kontrol edin; doğruysa "Formatı güncelle" deyin.`
    );
  };
  const sampleLine = txtFiles[0]?.text.split(/\r?\n/).find((l) => l.trim());
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
    const add: Array<{ name: string; text: string }> = [];
    for (const f of Array.from(list)) add.push({ name: f.name, text: decodeOptikFile(await f.arrayBuffer()) });
    setTxtFiles((cur) => [...cur.filter((c) => !add.some((a) => a.name === c.name)), ...add]);
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
  const runMatching = async () => {
    const groups = groupRows(allRows);
    let tcMatch: Map<string, string> | undefined;
    setTcNote(null);
    const withTc = groups.filter((g) => !!g.tc && !!validTc(g.tc));
    if (withTc.length) {
      try {
        const existing = await listStudentTcHashes();
        const allowed = new Set(students.map((s) => s.id));
        const byHash = new Map<string, string>();
        const dupHash = new Set<string>();
        for (const [sid, h] of existing) {
          if (!allowed.has(sid)) continue;
          if (byHash.has(h)) dupHash.add(h);
          else byHash.set(h, sid);
        }
        if (byHash.size) {
          const res = await hashTcs(withTc.map((g) => g.tc || ''));
          if (res.ok) {
            tcMatch = new Map();
            withTc.forEach((g, i) => {
              const h = res.hashes[i];
              const sid = h && !dupHash.has(h) ? byHash.get(h) : undefined;
              if (sid) tcMatch!.set(g.key, sid);
            });
            setTcNote(`${tcMatch.size} öğrenci TC ile eşleşti (TC'ler kaydedilmedi).`);
          } else setTcNote(`TC ile eşleştirme yapılamadı: ${res.error} Numara ve ad soyadla devam edildi.`);
        }
      } catch (e: any) {
        setTcNote(`TC ile eşleştirme yapılamadı: ${e?.message || 'hata'} Numara ve ad soyadla devam edildi.`);
      }
    }
    for (const g of groups) delete g.tc; // TC bellekten atılır
    setMatches(matchGroups(groups, students, classes, aliases, tcMatch));
    setManual(new Set());
  };

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

  // ----------------------------------------------------------------------------- adım geçişleri
  const next = () => {
    setError(null);
    if (step === 1) {
      if (!name.trim()) return setError('Deneme adını yazın.');
      if (!completeSubjects.length) return setError('En az bir dersin cevap anahtarı eksiksiz olmalı (Excel yükleyin ya da elle yazın).');
      setStep(2);
      return;
    }
    if (step === 2) {
      const fe = checkFields(fields);
      if (fe.length) return setError(fe[0]);
      if (!txtFiles.length) return setError('En az bir TXT dosyası yükleyin.');
      if (parseErrors.length) return setError(parseErrors[0]);
      if (keyMissingForAnswered.length) {
        return setError(`TXT'de cevabı olan ama cevap anahtarı eksik dersler var: ${keyMissingForAnswered.map((s) => s.name).join(', ')}. 1. adıma dönüp anahtarı tamamlayın.`);
      }
      if (matching) return;
      setMatching(true);
      void runMatching().finally(() => {
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
      const examId = existing?.id || newId('dnm');
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
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onCancel}>
          <ArrowLeft /> Denemelere dön
        </button>
        <h2 className="text-base font-semibold text-fg">{existing ? `${existing.name}: optik yükleme` : 'Yeni deneme'}</h2>
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
          <Panel title="Optik formatı" description="FMT dosyasını yükleyin, kayıtlı bir formatı seçin ya da alanları elle girin." icon={FileText} tone="info">
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
              sampleLine={txtFiles.length ? sampleLine || '' : undefined}
              onChange={(f, text) => {
                setFields(f);
                if (text !== undefined) {
                  setFmtText(text);
                  setFormatId('');
                }
              }}
            />
          </Panel>

          <Panel
            title="Optik sonuç dosyaları (TXT)"
            description="Sözel ve sayısal oturumların TXT dosyalarını birlikte yükleyebilirsiniz; aynı öğrencinin satırları birleştirilir."
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
                  return (
                    <div key={f.name} className="flex flex-wrap items-start gap-2 border border-line rounded-xl px-3 py-2">
                      <FileText className="w-4 h-4 text-muted mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg truncate">{f.name}</p>
                        {p ? (
                          <>
                            <p className="text-xs text-muted">{p.rows.length} öğrenci satırı</p>
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
                                  <button key={x.id} type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => pickFormat(x.id)}>
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={saving} onClick={() => (step === 1 || (existing && step === startStep) ? onCancel() : setStep((step - 1) as Step))}>
          <ArrowLeft /> {step === 1 || (existing && step === startStep) ? 'Vazgeç' : 'Geri'}
        </button>
        {progress && <span className="text-xs text-muted">{progress}</span>}
        {step < 4 ? (
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={next} disabled={matching}>
            {matching ? 'Eşleştiriliyor…' : 'Devam'} <ArrowRight />
          </button>
        ) : (
          <button type="button" className="ui-btn ui-btn-success ui-btn-sm" disabled={saving || !computed?.list.length} onClick={() => void doSave()}>
            <Save /> {saving ? 'Kaydediliyor…' : 'Sonuçları kaydet'}
          </button>
        )}
      </div>
    </div>
  );
};
