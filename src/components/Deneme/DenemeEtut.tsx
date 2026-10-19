import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Download, Users } from 'lucide-react';
import { Segmented, cx } from '../ui/kit';
import type { ClassGroup, Etut, Student } from '../../types';
import { dataService } from '../../services/dataService';
import { byUploadOrder, getExamsFull, listResultsFor, type DenemeExam, type DenemeResult } from '../../services/denemeService';
import { LEVEL_INFO, levelOf, studentTopicRows, type StudentTopicRow } from '../../lib/deneme/analiz';
import { LGS_SUBJECTS } from '../../lib/deneme/lgs';
import { SCOPES, dateTr, pickScope, scopeLabel, usedSubjects, type ScopeKey } from '../../lib/deneme/karneModel';
import { downloadKarnePdf, type PdfBlock } from '../../lib/deneme/karnePdf';
import { callMail, describeMailResult } from '../../lib/mailApi';
import { EtutFormModal, type EtutFormSaved } from '../Teacher/EtutFormModal';

// ============================================================================
// Etüt yönlendirme (Aşama 47)
// Seçilen denemelerde bir konuda / alt kazanımda başarısı belirlenen yüzdenin altında kalan öğrenciler
// listelenir; konu başına "Etüde yönlendir" ile etüt formu öğrenciler seçili olarak açılır; liste PDF olarak alınır.
// ============================================================================

interface TopicGroup {
  label: string;
  konu: string;
  rows: StudentTopicRow[];
}

/** Aşama 50: "Tüm sınıflar" seçiliyken kazanım altındaki öğrenciler sınıf sınıf ayrılır */
function splitByClass(rows: StudentTopicRow[]): Array<{ className: string; rows: StudentTopicRow[] }> {
  const m = new Map<string, StudentTopicRow[]>();
  for (const r of rows) {
    const k = r.className || 'Sınıfsız';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return Array.from(m.entries())
    .map(([className, list]) => ({ className, rows: list.slice().sort((a, b) => a.rate - b.rate || a.studentName.localeCompare(b.studentName, 'tr')) }))
    .sort((a, b) => a.className.localeCompare(b.className, 'tr', { numeric: true }));
}

/** Aşama 53: öğrencinin o konudaki cevaplarından kısa tanı notu (öğretmene etütte yol gösterir) */
export function studentNote(r: StudentTopicRow): string {
  if (r.total < 3) return 'Az soru: sonuç kesin değil';
  if (r.d === 0 && r.y === 0) return 'Hiç cevaplamamış: konu eksik';
  if (r.b >= r.y && r.b > r.d) return 'Çoğunu boş bırakmış: konu bilgisi eksik';
  if (r.y > r.d) return 'Yanlışı çok: kavram yanılgısı olabilir';
  return 'Soru çözümüyle pekiştirilmeli';
}

/** Aşama 53: bir konunun etüt özet sayıları */
function groupStats(g: TopicGroup) {
  const kritik = g.rows.filter((r) => levelOf(r.rate) === 'kritik').length;
  const etut = g.rows.filter((r) => levelOf(r.rate) === 'etut').length;
  const avg = g.rows.length ? Math.round(g.rows.reduce((a, r) => a + r.rate, 0) / g.rows.length) : 0;
  return { kritik, etut, avg };
}

/** Aşama 53: öncelik sırası — kritik öğrencisi çok olan, sonra öğrencisi çok olan, sonra ortalaması düşük olan konu önce */
function prioritized(groups: TopicGroup[]): TopicGroup[] {
  return groups
    .slice()
    .sort((a, b) => groupStats(b).kritik - groupStats(a).kritik || b.rows.length - a.rows.length || groupStats(a).avg - groupStats(b).avg);
}

export const DenemeEtut: React.FC<{ exams: DenemeExam[]; students: Student[]; classes: ClassGroup[] }> = ({ exams, students, classes }) => {
  const [scope, setScope] = useState<ScopeKey>('last3');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('mat');
  const [level, setLevel] = useState<'konu' | 'alt'>('konu');
  const [threshold, setThreshold] = useState(50);
  const [minQ, setMinQ] = useState(2);
  const [fullExams, setFullExams] = useState<DenemeExam[]>([]);
  const [results, setResults] = useState<DenemeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger' | 'info'; text: string } | null>(null);
  const [etutSource, setEtutSource] = useState<Etut | null>(null);

  const asc = useMemo(() => exams.slice().sort(byUploadOrder), [exams]); // Aşama 51: yükleniş sırası
  const scoped = useMemo(() => pickScope(asc, scope, (e) => picked.has(e.id)), [asc, scope, picked]);
  const scopedIds = scoped.map((e) => e.id).join(',');

  useEffect(() => {
    let alive = true;
    const ids = scoped.map((e) => e.id);
    if (!ids.length) {
      setFullExams([]);
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [ex, rs] = await Promise.all([getExamsFull(ids), listResultsFor({ examIds: ids, classId: classId || undefined })]);
        if (!alive) return;
        setFullExams(ex);
        setResults(rs);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Veriler yüklenemedi.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedIds, classId]);

  const subjects = usedSubjects(fullExams.length ? fullExams : exams);
  const subjectInfo = LGS_SUBJECTS.find((s) => s.key === subject);

  // Aşama 51: konu / alt kazanım açılır listesi
  const [topicKey, setTopicKey] = useState('');
  useEffect(() => {
    setTopicKey('');
  }, [subject, level]);

  const allRows = useMemo(() => studentTopicRows(fullExams, results, subject, level), [fullExams, results, subject, level]);
  const labelOf = (r: StudentTopicRow) => (level === 'alt' && r.alt ? r.alt : r.konu);

  /** Denemelerde geçen tüm konular (ölçütün altında kalan öğrenci sayısıyla) */
  const topicOptions = useMemo(() => {
    const m = new Map<string, { key: string; label: string; below: number }>();
    for (const r of allRows) {
      const label = labelOf(r);
      const key = label.toLocaleLowerCase('tr-TR');
      if (!m.has(key)) m.set(key, { key, label, below: 0 });
      if (r.total >= minQ && r.rate < threshold) m.get(key)!.below += 1;
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, minQ, threshold, level]);

  // Seçili konu artık listede yoksa (ör. kapsam değişti) "Tüm konular"a dön
  useEffect(() => {
    if (topicKey && !topicOptions.some((o) => o.key === topicKey)) setTopicKey('');
  }, [topicOptions, topicKey]);

  const groups: TopicGroup[] = useMemo(() => {
    const rows = allRows.filter((r) => r.total >= minQ && r.rate < threshold);
    const m = new Map<string, TopicGroup>();
    for (const r of rows) {
      const label = labelOf(r);
      const k = label.toLocaleLowerCase('tr-TR');
      if (topicKey && k !== topicKey) continue;
      if (!m.has(k)) m.set(k, { label, konu: r.konu, rows: [] });
      m.get(k)!.rows.push(r);
    }
    const list = Array.from(m.values());
    list.forEach((g) => g.rows.sort((a, b) => a.rate - b.rate || a.studentName.localeCompare(b.studentName, 'tr')));
    return list.sort((a, b) => b.rows.length - a.rows.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, level, threshold, minQ, topicKey]);

  const topicName = topicKey ? topicOptions.find((o) => o.key === topicKey)?.label || '' : '';

  const allClasses = !classId; // Aşama 50: tüm sınıflar seçiliyse sınıf sınıf liste

  const openEtut = (g: TopicGroup, onlyRows?: StudentTopicRow[]) => {
    const ids = Array.from(new Set((onlyRows || g.rows).map((r) => r.studentId)));
    const pseudo = {
      id: `deneme-etut-${Date.now()}`,
      subject: subjectInfo?.name || '',
      topic: g.label.slice(0, 150),
      notes: `Deneme analizi: ${scopeLabel(scope).toLocaleLowerCase('tr-TR')} içinde bu konuda başarısı %${threshold} altında kalan öğrenciler.`,
      assignedStudentIds: ids,
      date: '',
      time: '',
      duration: 40,
      location: '',
    } as unknown as Etut;
    setEtutSource(pseudo);
  };

  const onEtutSaved = async (r: EtutFormSaved) => {
    setEtutSource(null);
    const base = r.etuts.length > 1 ? `${r.etuts.length} etüt kaydedildi.` : 'Etüt kaydedildi; Etütler bölümünde görebilirsiniz.';
    if (!r.sendMail) {
      setNotice({ tone: r.failedCount ? 'warning' : 'success', text: base });
      return;
    }
    setNotice({ tone: 'info', text: `${base} E-postalar gönderiliyor…` });
    let sent = 0;
    let lastText = '';
    for (const e of r.etuts) {
      const res = await callMail('etut-created', { etutId: e.id });
      const d = describeMailResult(res);
      lastText = d.text;
      if (res.ok) sent += res.sent || 0;
      if (!res.ok || res.notConfigured || res.authError) break;
    }
    setNotice({ tone: sent ? 'success' : 'warning', text: `${base} ${lastText}` });
  };

  // ---------------------------------------------------------------------------------------------
  // Aşama 53: ETÜT YÖNLENDİRME RAPORU (PDF) — öğretmenin elinde gerçekten kullanacağı bir çalışma belgesi:
  //  1. Özet: ders, sınıf, ölçüt, denemeler + sayılar (kaç konu, kaç öğrenci, kaç kritik, ortalama başarı)
  //  2. "Durum nasıl belirlenir?" açıklaması (Kritik / Etüt / Tekrar / Başarılı aralıkları ve anlamları)
  //  3. Öncelik tablosu: kritik öğrencisi en çok olan konudan başlayarak, önerilen etüt grubu sayısıyla
  //  4. Her konu / kazanım için sınıf sınıf öğrenci listesi: öğrencinin durumu, kısa tanı notu
  //     (boş mu bırakıyor, yanlış mı yapıyor) ve etütte doldurulacak "Katıldı / İmza" sütunu
  //  5. Etüt sonrası izleme önerisi
  // ---------------------------------------------------------------------------------------------
  const onPdf = async () => {
    const subjectName = subjectInfo?.name || '';
    const bazinda = level === 'alt' ? 'alt kazanım' : 'konu';
    const uniq = new Set(groups.flatMap((g) => g.rows.map((r) => r.studentId)));
    const kritikSet = new Set(groups.flatMap((g) => g.rows.filter((r) => levelOf(r.rate) === 'kritik').map((r) => r.studentId)));
    const allRows = groups.flatMap((g) => g.rows);
    const avg = allRows.length ? Math.round(allRows.reduce((a, r) => a + r.rate, 0) / allRows.length) : 0;
    const ordered = prioritized(groups);

    const blocks: PdfBlock[] = [
      { kind: 'title', text: 'Etüt Yönlendirme Raporu', sub: `${subjectName} · ${bazinda} bazında · ${new Date().toLocaleDateString('tr-TR')}` },
      {
        kind: 'kv',
        rows: [
          ['Ders', subjectName],
          ['Sınıf', classes.find((c) => c.id === classId)?.name || 'Tüm sınıflar'],
          ['Ölçüt', `Başarı %${threshold} altında, en az ${minQ} soru`],
          ['Kapsam', `${scopeLabel(scope)} (${fullExams.length} deneme)`],
          [level === 'alt' ? 'Alt kazanım' : 'Konu', topicName || (level === 'alt' ? 'Tüm alt kazanımlar' : 'Tüm konular')],
          ['Denemeler', fullExams.map((e) => `${e.name} (${dateTr(e.examDate)})`).join(' · ') || '-'],
        ],
      },
      {
        kind: 'tiles',
        items: [
          { label: level === 'alt' ? 'Alt kazanım' : 'Konu', value: String(groups.length), sub: 'etüt gerektiren' },
          { label: 'Öğrenci', value: String(uniq.size), sub: 'en az bir konuda yönlendirilen', tone: 'info' },
          { label: 'Kritik öğrenci', value: String(kritikSet.size), sub: 'en az bir konuda %30 altı', tone: 'danger' },
          { label: 'Ortalama başarı', value: `%${avg}`, sub: 'listedeki öğrencilerin', tone: avg < 30 ? 'danger' : 'warning' },
        ],
      },
      {
        kind: 'callout',
        title: 'Durum nasıl belirlenir?',
        tone: 'muted',
        lines: [
          'Başarı = öğrencinin o konudaki doğru sayısı / o konuda gördüğü soru sayısı (seçilen denemelerin toplamı). Yanlış ve boş ayrı gösterilir.',
          { label: 'Kritik (%0–29)', text: LEVEL_INFO.kritik.advice, tone: 'danger' },
          { label: 'Etüt (%30–49)', text: LEVEL_INFO.etut.advice, tone: 'warning' },
          ...(threshold > 50 ? [{ label: 'Tekrar (%50–69)', text: LEVEL_INFO.tekrar.advice, tone: 'info' as const }] : []),
          { label: 'Başarılı (%70+)', text: LEVEL_INFO.iyi.advice, tone: 'success' },
          'Not sütunu: "Boş bırakmış" konu bilgisinin eksik olduğunu, "Yanlışı çok" kavram yanılgısını gösterebilir. 3\'ten az soruyla verilen sonuç kesin değildir.',
        ],
      },
    ];

    if (ordered.length) {
      blocks.push({ kind: 'heading', text: 'Öncelik sırası', sub: 'Kritik öğrencisi en çok olan konudan başlayarak etüt planlayın. Önerilen grup: en fazla 12 öğrenci.' });
      blocks.push({
        kind: 'table',
        head: ['#', level === 'alt' ? 'Alt kazanım' : 'Konu', 'Öğrenci', 'Kritik', 'Etüt', 'Ort. başarı', 'Önerilen'],
        rows: ordered.map((g, i) => {
          const s = groupStats(g);
          return [i + 1, g.label, g.rows.length, s.kritik, s.etut, `%${s.avg}`, `${Math.max(1, Math.ceil(g.rows.length / 12))} etüt grubu`];
        }),
        rowTones: ordered.map((g) => (groupStats(g).kritik ? 'danger' : 'warning')),
        toneColumn: 3,
        align: ['center', 'left', 'center', 'center', 'center', 'center', 'center'],
        widths: [7, 'auto', 15, 13, 12, 17, 24],
        fontSize: 7.6,
      });
    }

    ordered.forEach((g, gi) => {
      const s = groupStats(g);
      const subParts = [
        level === 'alt' && g.konu !== g.label ? `Konu: ${g.konu}` : '',
        `${g.rows.length} öğrenci (${s.kritik} kritik, ${s.etut} etüt)`,
        `Ortalama başarı %${s.avg}`,
        `Öneri: ${s.kritik >= s.etut ? LEVEL_INFO.kritik.advice : LEVEL_INFO.etut.advice}`,
      ].filter(Boolean);
      blocks.push({ kind: 'heading', text: `${gi + 1}. ${g.label}`, sub: subParts.join(' · '), minFollow: 26 });
      // Aşama 50: tüm sınıflarda her sınıf ayrı tablo
      const parts = allClasses ? splitByClass(g.rows) : [{ className: '', rows: g.rows }];
      for (const p of parts) {
        if (allClasses) {
          const pk = p.rows.filter((r) => levelOf(r.rate) === 'kritik').length;
          blocks.push({ kind: 'text', text: `${p.className} · ${p.rows.length} öğrenci${pk ? ` · ${pk} kritik` : ''}` });
        }
        blocks.push({
          kind: 'table',
          head: ['#', 'Öğrenci', 'Sınıf', 'Soru', 'D', 'Y', 'B', 'Başarı', 'Durum', 'Not', 'Katıldı / İmza'],
          rows: p.rows.map((r, i) => [i + 1, r.studentName, r.className || '-', r.total, r.d, r.y, r.b, `%${r.rate}`, LEVEL_INFO[levelOf(r.rate)].label, studentNote(r), '']),
          rowTones: p.rows.map((r) => LEVEL_INFO[levelOf(r.rate)].tone),
          toneColumn: 8,
          align: ['center', 'left', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'left', 'center'],
          widths: [6, 'auto', 12, 10, 7, 7, 7, 12, 13, 36, 20],
          fontSize: 7.2,
        });
      }
    });

    if (!groups.length) blocks.push({ kind: 'text', tone: 'success', text: 'Bu ölçütte etüde yönlendirilecek öğrenci yok.' });
    else
      blocks.push({
        kind: 'callout',
        title: 'Etüt sonrası izleme',
        tone: 'info',
        lines: [
          'Etüdün sonunda aynı konudan 3-5 soruluk kısa bir kontrol yapın; doğru sayısını bu listenin yanına not edin.',
          'Bir sonraki denemeden sonra bu raporu yeniden alın: öğrencinin durumu Kritik, Etüt, Tekrar sırasıyla yükseliyorsa çalışma işe yarıyor demektir.',
          'Aynı öğrenci birden çok konuda kritikse önce en çok sorunun geldiği konuya odaklanın; veliyle paylaşmak için öğrenci karnesini kullanın.',
        ],
      });
    const fileTopic = topicName ? `-${topicName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40)}` : '';
    await downloadKarnePdf(blocks, 'Etüt yönlendirme listesi', `Etut-Listesi-${subjectInfo?.short || ''}${fileTopic}-%${threshold}`);
  };

  return (
    <div className="space-y-4" id="deneme-etut">
      <div className="ui-card ui-card-pad space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={scope} onChange={(v) => setScope(v)} size="sm" items={SCOPES} />
          <Segmented
            value={level}
            onChange={(v) => setLevel(v)}
            size="sm"
            items={[
              { value: 'konu', label: 'Konu bazında' },
              { value: 'alt', label: 'Alt kazanım bazında' },
            ]}
          />
        </div>
        {scope === 'custom' && (
          <div className="flex flex-wrap gap-1.5">
            {asc.map((e) => {
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
                  className={cx('ui-chip cursor-pointer border', on ? 'ui-chip-brand border-brand/30' : 'ui-chip-neutral border-line')}
                >
                  {e.name} · {dateTr(e.examDate)}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-4">
          <div>
            <label className="ui-label" htmlFor="etut-subject">Ders</label>
            <select id="etut-subject" className="ui-input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {(subjects.length ? subjects : LGS_SUBJECTS).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label" htmlFor="etut-class">Sınıf</label>
            <select id="etut-class" className="ui-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Tüm sınıflar</option>
              {classes
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="ui-label" htmlFor="etut-th">Başarı yüzdesi altında</label>
            <select id="etut-th" className="ui-input" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
              {[30, 40, 50, 60, 70, 80].map((n) => (
                <option key={n} value={n}>
                  %{n} altı{n === 30 ? ' (kritik)' : n === 50 ? ' (etüt)' : n === 70 ? ' (tekrar)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label" htmlFor="etut-minq">En az soru</label>
            <select id="etut-minq" className="ui-input" value={minQ} onChange={(e) => setMinQ(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} soru
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="ui-label" htmlFor="etut-topic">{level === 'alt' ? 'Alt kazanım' : 'Konu'}</label>
          <select
            id="etut-topic"
            className="ui-input"
            value={topicKey}
            disabled={loading || !topicOptions.length}
            onChange={(e) => setTopicKey(e.target.value)}
          >
            <option value="">
              {level === 'alt' ? 'Tüm alt kazanımlar' : 'Tüm konular'} ({topicOptions.length})
            </option>
            {topicOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label.length > 110 ? `${o.label.slice(0, 110)}…` : o.label} — {o.below ? `${o.below} öğrenci %${threshold} altında` : 'ölçüt altında öğrenci yok'}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={loading || !fullExams.length} onClick={() => void onPdf()}>
            <Download /> Listeyi PDF indir
          </button>
          <span className="text-[11px] text-muted">"En az soru": o konudan en az bu kadar soru çözmüş öğrenciler değerlendirilir (tek soruyla yanlış karar verilmesin).</span>
        </div>
        {/* Aşama 53: durum etiketlerinin anlamı */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" id="etut-level-legend">
          <span className="font-semibold text-fg-2">Durum:</span>
          <span className="ui-chip ui-chip-danger" title={LEVEL_INFO.kritik.advice}>Kritik %0–29</span>
          <span className="ui-chip ui-chip-warning" title={LEVEL_INFO.etut.advice}>Etüt %30–49</span>
          <span className="ui-chip ui-chip-info" title={LEVEL_INFO.tekrar.advice}>Tekrar %50–69</span>
          <span className="ui-chip ui-chip-success" title={LEVEL_INFO.iyi.advice}>Başarılı %70+</span>
          <span className="text-muted">Başarı = doğru ÷ o konudaki soru (seçili denemelerin toplamı)</span>
        </div>
        {notice && (
          <p
            role="status"
            className={cx(
              'text-xs font-semibold rounded-xl px-3 py-2',
              notice.tone === 'success' && 'bg-success-soft text-success-fg',
              notice.tone === 'info' && 'bg-info-soft text-info-fg',
              notice.tone === 'warning' && 'bg-warning-soft text-warning-fg',
              notice.tone === 'danger' && 'bg-danger-soft text-danger-fg'
            )}
          >
            {notice.text}
          </p>
        )}
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted">Yükleniyor…</p>
      ) : !scoped.length ? (
        <p className="text-sm text-muted">Kapsamda deneme yok.</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-success-fg bg-success-soft rounded-xl px-3 py-2">Bu ölçütte etüde yönlendirilecek öğrenci yok.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.label} className="rounded-2xl border border-line bg-surface">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line">
                <Users className="w-4 h-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{g.label}</p>
                  {level === 'alt' && g.konu !== g.label && <p className="text-[11px] text-muted">Konu: {g.konu}</p>}
                </div>
                <span className="ui-chip ui-chip-warning">{g.rows.length} öğrenci</span>
                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => openEtut(g)}>
                  <CalendarPlus /> Etüde yönlendir
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-fg-2">
                  <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Öğrenci</th>
                      <th className="px-2 py-2 font-semibold">Sınıf</th>
                      <th className="px-2 py-2 font-semibold text-center">Soru</th>
                      <th className="px-2 py-2 font-semibold text-center">D</th>
                      <th className="px-2 py-2 font-semibold text-center">Y</th>
                      <th className="px-2 py-2 font-semibold text-center">B</th>
                      <th className="px-3 py-2 font-semibold text-center">Başarı</th>
                      <th className="px-3 py-2 font-semibold">Not</th>
                    </tr>
                  </thead>
                  {(allClasses ? splitByClass(g.rows) : [{ className: '', rows: g.rows }]).map((p) => (
                    <tbody key={p.className || 'tek'} className="divide-y divide-line">
                      {allClasses && (
                        <tr className="bg-brand-soft/50">
                          <td colSpan={8} className="px-3 py-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-brand-fg">{p.className}</span>
                              <span className="ui-chip ui-chip-neutral">{p.rows.length} öğrenci</span>
                              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm ml-auto" onClick={() => openEtut(g, p.rows)}>
                                <CalendarPlus /> Bu sınıfı etüde yönlendir
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {p.rows.map((r) => (
                        <tr key={r.studentId}>
                          <td className="px-3 py-1.5 font-semibold text-fg">{r.studentName}</td>
                          <td className="px-2 py-1.5">{r.className || '—'}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{r.total}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums text-success-fg">{r.d}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums text-danger-fg">{r.y}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums text-muted">{r.b}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`ui-chip ui-chip-${LEVEL_INFO[levelOf(r.rate)].tone}`} title={LEVEL_INFO[levelOf(r.rate)].label}>
                              %{r.rate} · {LEVEL_INFO[levelOf(r.rate)].label}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-muted">{studentNote(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <EtutFormModal
        open={!!etutSource}
        mode="create"
        source={etutSource}
        students={students}
        classes={classes}
        etuts={dataService.getEtuts()}
        onClose={() => setEtutSource(null)}
        onSaved={(r) => void onEtutSaved(r)}
      />
    </div>
  );
};
