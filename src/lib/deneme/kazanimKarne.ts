// ============================================================================
// DENEME ANALİZİ (Aşama 54) — KAZANIM TAKİP, ÇALIŞMA PLANI, ISI TABLOSU, ORTALAMALAR, MADDE ANALİZİ
// Bütün hesaplar yalnızca deneme sonuçlarından yapılır (öğrenci bilgisi dışarı gönderilmez).
//
//  * Kazanım takip: öğrencinin seçilen denemelerdeki her kazanımı için durum
//      Kazanıldı  : son sorulduğu denemede %70+ VE bütün denemelerde %60+
//      Eksik      : son sorulduğu denemede %50 altı VE bütün denemelerde %50 altı
//      Gelişiyor  : ikisinin arası (kısmen öğrenilmiş, yükselen ya da düşen)
//      Henüz sorulmadı : kazanım bankasında var, seçilen denemelerde sorulmamış
//  * Çalışma planı: deneme başına en çok PUAN kaybettiren kazanımlar (yanlış: 1 + 1/3 net, boş: 1 net;
//    ders katsayısı ve LGS puan çarpanıyla) + önerilen soru sayısı.
//  * Madde analizi: soru başına doğru/yanlış/boş, şık dağılımı (çeldirici), kurum farkı, ayırt edicilik.
// ============================================================================
import type { BankRow, DenemeExam, DenemeResult } from '../../services/denemeService';
import { LGS_SCORING, LGS_SUBJECTS, markOf, round2, type ExamQuestion, type ExamSubject } from './lgs';
import { LEVEL_INFO, levelOf, topicLabels } from './analiz';
import { bankSubjectKey, codeKey, isBadKonu } from './kazanimBank';

export type KazStatus = 'kazanildi' | 'gelisiyor' | 'eksik' | 'sorulmadi';
export type KazTone = 'success' | 'info' | 'warning' | 'danger' | 'muted';

export const KAZ_STATUS_INFO: Record<KazStatus, { label: string; tone: KazTone; rule: string }> = {
  kazanildi: { label: 'Kazanıldı', tone: 'success', rule: 'Son sorulduğu denemede %70 ve üstü, bütün denemelerde %60 ve üstü' },
  gelisiyor: { label: 'Gelişiyor', tone: 'info', rule: 'Kısmen öğrenilmiş: başarı %50-69 arasında ya da denemeden denemeye değişiyor' },
  eksik: { label: 'Eksik', tone: 'danger', rule: 'Son sorulduğu denemede ve bütün denemelerde %50 altı' },
  sorulmadi: { label: 'Henüz sorulmadı', tone: 'muted', rule: 'Kazanım bankasında var; seçilen denemelerde bu kazanımdan soru gelmedi' },
};
export const KAZ_STATUS_ORDER: KazStatus[] = ['kazanildi', 'gelisiyor', 'eksik', 'sorulmadi'];
/** Kazanım takip karnesinin "neye göre" açıklaması (ekran ve PDF ortak) */
export const KAZ_RULE_LINE = 'Kazanıldı: son sorulduğu denemede %70+ ve genel %60+ | Gelişiyor: arada | Eksik: son denemede ve genelde %50 altı | Henüz sorulmadı';

/** Deneme dersinin haftalık plandaki adı */
export const PLAN_SUBJECT_NAME: Record<string, string> = {
  tr: 'Türkçe',
  mat: 'Matematik',
  fen: 'Fen Bilimleri',
  sos: 'T.C. İnkılap Tarihi',
  din: 'Din Kültürü',
  ing: 'İngilizce',
};

const keyOf = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
export const NO_TOPIC = 'Konusu belirtilmemiş';

/** Kısa kazanım adı (ısı tablosu, plan görevi): "M.8.1.2.1 Üslü İfadeler" ya da kısaltılmış kazanım metni */
export function shortKazanim(code: string | undefined, title: string | undefined, text: string | undefined, max = 70): string {
  const c = (code || '').trim();
  const tt = (title || '').trim();
  const tx = (text || '').trim();
  const cut = (s: string) => (s.length > max ? `${s.slice(0, max - 1).trim()}…` : s);
  if (tt && !(tx && isBadKonu(tt, tx))) return cut(c && !tt.startsWith(c) ? `${c} ${tt}` : tt);
  if (tx) return cut(c && !tx.startsWith(c) ? `${c} ${tx}` : tx);
  return c || NO_TOPIC;
}

/** Kod sırası: "M.8.1.10.2" doğal sayı sırasıyla */
export const codeCompare = (a?: string, b?: string) => {
  if (a && b) return a.localeCompare(b, 'tr', { numeric: true });
  if (a) return -1;
  if (b) return 1;
  return 0;
};

// ============================================================================ Kazanım takip
export interface KazAppearance {
  examId: string;
  questions: number[]; // soru numaraları
  d: number;
  y: number;
  b: number;
  total: number;
  rate: number;
}

export interface KazRow {
  key: string;
  subjectKey: string;
  code?: string;
  label: string; // tam ad (karnedeki konu adı)
  short: string; // kısa ad
  text?: string; // MEB kazanım metni
  title?: string; // konu başlığı
  questions: number; // sorulan soru sayısı (toplam)
  d: number;
  y: number;
  b: number;
  total: number;
  rate: number; // genel başarı
  per: Record<string, KazAppearance>; // deneme → sonuç
  examCount: number; // sorulduğu deneme sayısı
  firstRate: number | null;
  lastRate: number | null;
  lastExamId: string | null;
  trend: 'up' | 'down' | 'flat' | null;
  status: KazStatus;
  lostNet: number; // ham kayıp net (yanlış 1 + 1/3, boş 1)
  lostPoints: number; // yaklaşık LGS puanı kaybı (katsayı × puan çarpanı)
  perExamLoss: number; // kapsamdaki deneme başına puan kaybı
  fewData: boolean; // 3'ten az soru: sonuç kesin değil
}

export interface KazSubject {
  subject: ExamSubject;
  rows: KazRow[];
  counts: Record<KazStatus, number>;
  asked: number; // sorulan kazanım sayısı
  all: number; // bankadakiler dahil
  pctAsked: number; // sorulanların % kaçı kazanıldı
  pctAll: number | null; // bankadaki bütün kazanımların % kaçı kazanıldı (banka yoksa null)
  bankUsed: boolean;
}

function statusOf(rate: number, last: number | null): KazStatus {
  const l = last ?? rate;
  if (l >= 70 && rate >= 60) return 'kazanildi';
  if (l < 50 && rate < 50) return 'eksik';
  return 'gelisiyor';
}

function trendOf(list: KazAppearance[]): 'up' | 'down' | 'flat' | null {
  if (list.length < 2) return null;
  const last = list[list.length - 1];
  const prev = list.slice(0, -1);
  const pd = prev.reduce((a, x) => a + x.d, 0);
  const pt = prev.reduce((a, x) => a + x.total, 0);
  if (!pt) return null;
  const diff = last.rate - Math.round((pd / pt) * 100);
  return diff >= 15 ? 'up' : diff <= -15 ? 'down' : 'flat';
}

/** Kazanımın kimliği: kodu varsa kod, yoksa ad */
export const kazKey = (code: string | undefined, label: string) => (code ? `c:${codeKey(code)}` : `k:${keyOf(label)}`);

/**
 * Öğrencinin seçilen denemelerdeki kazanım durumları (ders ders).
 * results: YALNIZCA bir öğrencinin sonuçları. bank verilirse sorulmayan kazanımlar da listelenir.
 */
export function kazanimTracking(exams: DenemeExam[], results: DenemeResult[], subjects: ExamSubject[] = LGS_SUBJECTS, bank?: BankRow[] | null): KazSubject[] {
  const rByExam = new Map<string, DenemeResult>();
  for (const r of results) if (!rByExam.has(r.examId)) rByExam.set(r.examId, r);
  const used = exams.filter((e) => rByExam.has(e.id));
  const examCount = used.length;
  const grades = new Set(used.map((e) => String(e.grade || '')).filter(Boolean));
  const out: KazSubject[] = [];
  for (const sub of subjects) {
    const rows = new Map<string, KazRow>();
    const order: string[] = []; // denemelerin sırası (son görünüm için)
    for (const ex of used) {
      if (!ex.subjects.some((s) => s.key === sub.key)) continue;
      const r = rByExam.get(ex.id)!;
      const ans = r.answers[sub.key] || '';
      order.push(ex.id);
      (ex.questions[sub.key] || []).forEach((q: ExamQuestion, i: number) => {
        if (!q.answer) return;
        const { konu } = topicLabels(q);
        const code = (q.kazanimCode || '').trim() || undefined;
        const k = kazKey(code, konu);
        let row = rows.get(k);
        if (!row) {
          row = {
            key: k,
            subjectKey: sub.key,
            code,
            label: konu,
            short: shortKazanim(code, q.konu, q.kazanim || (q.konu ? undefined : konu)),
            text: q.kazanim,
            title: q.konu,
            questions: 0,
            d: 0,
            y: 0,
            b: 0,
            total: 0,
            rate: 0,
            per: {},
            examCount: 0,
            firstRate: null,
            lastRate: null,
            lastExamId: null,
            trend: null,
            status: 'gelisiyor',
            lostNet: 0,
            lostPoints: 0,
            perExamLoss: 0,
            fewData: false,
          };
          rows.set(k, row);
        } else {
          // en son denemedeki ad kullanılır (banka güncellenmiş olabilir)
          row.label = konu;
          row.short = shortKazanim(code, q.konu, q.kazanim || (q.konu ? undefined : konu));
          row.text = q.kazanim || row.text;
          row.title = q.konu || row.title;
        }
        const ap = (row.per[ex.id] = row.per[ex.id] || { examId: ex.id, questions: [], d: 0, y: 0, b: 0, total: 0, rate: 0 });
        const m = markOf(ans[i], q);
        ap.questions.push(q.no);
        ap.total++;
        row.total++;
        row.questions++;
        if (m === 'D') {
          ap.d++;
          row.d++;
        } else if (m === 'Y') {
          ap.y++;
          row.y++;
          row.lostNet += 1 + (LGS_SCORING.wrongPerCorrect > 0 ? 1 / LGS_SCORING.wrongPerCorrect : 0);
        } else {
          ap.b++;
          row.b++;
          row.lostNet += 1;
        }
      });
    }
    const list = Array.from(rows.values());
    if (!list.length) continue;
    for (const row of list) {
      const aps = order.map((id) => row.per[id]).filter((x): x is KazAppearance => !!x);
      aps.forEach((a) => (a.rate = a.total ? Math.round((a.d / a.total) * 100) : 0));
      row.rate = row.total ? Math.round((row.d / row.total) * 100) : 0;
      row.examCount = aps.length;
      row.firstRate = aps.length ? aps[0].rate : null;
      row.lastRate = aps.length ? aps[aps.length - 1].rate : null;
      row.lastExamId = aps.length ? aps[aps.length - 1].examId : null;
      row.trend = trendOf(aps);
      row.status = statusOf(row.rate, row.lastRate);
      row.lostNet = round2(row.lostNet);
      row.lostPoints = round2(row.lostNet * sub.coef * LGS_SCORING.perWeighted);
      row.perExamLoss = examCount ? round2(row.lostPoints / examCount) : 0;
      row.fewData = row.questions < 3;
    }
    // Kazanım bankasından sorulmamış kazanımlar (yalnızca kodlu kazanımlar eşleşebildiğinde)
    let bankUsed = false;
    if (bank && bank.length && list.some((r) => r.code)) {
      const askedCodes = new Set(list.filter((r) => r.code).map((r) => codeKey(r.code!)));
      const subBank = bank.filter((b) => bankSubjectKey(b.subject) === sub.key && (!grades.size || !b.grade || grades.has(String(b.grade))));
      if (subBank.length) {
        bankUsed = true;
        for (const b of subBank) {
          if (!b.code || askedCodes.has(codeKey(b.code))) continue;
          askedCodes.add(codeKey(b.code));
          const label = topicLabels({ kazanim: b.text, kazanimCode: b.code, konu: b.konu }).konu;
          list.push({
            key: kazKey(b.code, label),
            subjectKey: sub.key,
            code: b.code,
            label,
            short: shortKazanim(b.code, b.konu, b.text),
            text: b.text,
            title: b.konu,
            questions: 0,
            d: 0,
            y: 0,
            b: 0,
            total: 0,
            rate: 0,
            per: {},
            examCount: 0,
            firstRate: null,
            lastRate: null,
            lastExamId: null,
            trend: null,
            status: 'sorulmadi',
            lostNet: 0,
            lostPoints: 0,
            perExamLoss: 0,
            fewData: false,
          });
        }
      }
    }
    list.sort((a, b) => codeCompare(a.code, b.code) || a.label.localeCompare(b.label, 'tr'));
    const counts: Record<KazStatus, number> = { kazanildi: 0, gelisiyor: 0, eksik: 0, sorulmadi: 0 };
    for (const r of list) counts[r.status]++;
    const asked = list.length - counts.sorulmadi;
    out.push({
      subject: sub,
      rows: list,
      counts,
      asked,
      all: list.length,
      pctAsked: asked ? Math.round((counts.kazanildi / asked) * 100) : 0,
      pctAll: bankUsed && list.length ? Math.round((counts.kazanildi / list.length) * 100) : null,
      bankUsed,
    });
  }
  return out;
}

/** Bütün dersler toplamı */
export function trackingTotals(t: KazSubject[]) {
  const counts: Record<KazStatus, number> = { kazanildi: 0, gelisiyor: 0, eksik: 0, sorulmadi: 0 };
  for (const s of t) for (const k of KAZ_STATUS_ORDER) counts[k] += s.counts[k];
  const asked = counts.kazanildi + counts.gelisiyor + counts.eksik;
  return { counts, asked, all: asked + counts.sorulmadi, pctAsked: asked ? Math.round((counts.kazanildi / asked) * 100) : 0 };
}

/** Sayıdan sonra gelen iyelik eki: 62'si, 50'si, 40'ı, 3'ü, 100'ü (sayının okunuşuna göre) */
export function sayiEki(n: number): string {
  const v = Math.abs(Math.round(n));
  const ONES = ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u']; // bir iki üç dört beş altı yedi sekiz dokuz
  const TENS = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı']; // on yirmi otuz kırk elli altmış yetmiş seksen doksan
  if (v === 0) return 'ı'; // sıfır
  if (v % 10) return ONES[v % 10];
  if (v % 100) return TENS[(v % 100) / 10];
  if (v % 1000) return 'ü'; // yüz
  return 'i'; // bin
}
/** "%62'si", "3'ü" */
export const withEk = (n: number, pct = false) => `${pct ? '%' : ''}${n}'${sayiEki(n)}`;

/** "Matematik kazanımlarının %62'si kazanıldı" cümlesi */
export function subjectProgressText(s: KazSubject): string {
  const base = `${s.subject.name}: sorulan ${s.asked} kazanımın ${withEk(s.pctAsked, true)} kazanıldı (${s.counts.kazanildi} kazanıldı, ${s.counts.gelisiyor} gelişiyor, ${s.counts.eksik} eksik)`;
  return s.pctAll !== null ? `${base}; müfredattaki ${s.all} kazanımın ${s.counts.sorulmadi} tanesi henüz sorulmadı.` : `${base}.`;
}

// ============================================================================ Çalışma planı önerisi
export interface StudySuggestion {
  row: KazRow;
  subject: ExamSubject;
  planSubject: string;
  questions: number; // önerilen soru sayısı (haftalık)
  advice: string;
  reason: string;
  priority: number;
}

/** Önerilen haftalık soru sayısı: başarı düştükçe artar; 1 katsayılı derslerde biraz azdır */
export function suggestedQuestionCount(rate: number, coef: number): number {
  const base = rate < 30 ? 40 : rate < 50 ? 30 : 20;
  const n = coef >= 4 ? base : Math.round((base * 0.75) / 5) * 5;
  return Math.max(10, n);
}

/** Konu adı ya da kazanım bilgisi olmayan soruları öneri dışında bırak */
const plannable = (r: KazRow) => r.label !== NO_TOPIC && r.status !== 'kazanildi' && r.status !== 'sorulmadi' && r.lostPoints > 0;

export function studySuggestions(tracking: KazSubject[], max = 5): StudySuggestion[] {
  const all: StudySuggestion[] = [];
  for (const st of tracking) {
    for (const r of st.rows) {
      if (!plannable(r)) continue;
      const f = (r.status === 'eksik' ? 1.25 : 1) * (r.trend === 'down' ? 1.15 : r.trend === 'up' ? 0.85 : 1);
      const lv = levelOf(r.lastRate ?? r.rate);
      all.push({
        row: r,
        subject: st.subject,
        planSubject: PLAN_SUBJECT_NAME[st.subject.key] || st.subject.name,
        questions: suggestedQuestionCount(r.lastRate ?? r.rate, st.subject.coef),
        advice: LEVEL_INFO[lv].advice,
        reason: `${r.examCount} denemede ${r.questions} soru: ${r.d} doğru, ${r.y} yanlış, ${r.b} boş · deneme başına yaklaşık ${String(r.perExamLoss).replace('.', ',')} puan kaybettiriyor`,
        priority: r.perExamLoss * f,
      });
    }
  }
  all.sort((a, b) => b.priority - a.priority || a.row.rate - b.row.rate);
  return all.slice(0, max);
}

// ----------------------------------------------------------------------------- Önceki önerilerin takibi
export type FollowVerdict = 'kazanildi' | 'gelisti' | 'ayni' | 'geriledi' | 'sorulmadi';
export const FOLLOW_INFO: Record<FollowVerdict, { label: string; tone: KazTone }> = {
  kazanildi: { label: 'Kazanıldı', tone: 'success' },
  gelisti: { label: 'Gelişti', tone: 'info' },
  ayni: { label: 'Değişmedi', tone: 'warning' },
  geriledi: { label: 'Geriledi', tone: 'danger' },
  sorulmadi: { label: 'Sorulmadı', tone: 'muted' },
};

export interface FollowUpRow {
  subject: ExamSubject;
  short: string;
  label: string;
  before: number;
  after: number | null;
  change: number | null;
  verdict: FollowVerdict;
}

/**
 * Son denemeden ÖNCEKİ denemelere göre yapılacak öneriler, son denemede ne oldu?
 * (Öneri kaydı tutmadan "plan işe yaradı mı" sorusunu yanıtlar.)
 */
export function suggestionFollowUp(exams: DenemeExam[], results: DenemeResult[], subjects: ExamSubject[], max = 5): { exam: DenemeExam; rows: FollowUpRow[] } | null {
  const done = exams.filter((e) => results.some((r) => r.examId === e.id));
  if (done.length < 2) return null;
  const lastExam = done[done.length - 1];
  const before = studySuggestions(kazanimTracking(done.slice(0, -1), results, subjects), max);
  if (!before.length) return null;
  const now = kazanimTracking([lastExam], results, subjects);
  const rows: FollowUpRow[] = before.map((s) => {
    const r = now.find((x) => x.subject.key === s.subject.key)?.rows.find((x) => x.key === s.row.key);
    const after = r && r.total ? r.rate : null;
    const prev = s.row.lastRate ?? s.row.rate;
    const change = after === null ? null : after - prev;
    const verdict: FollowVerdict = after === null ? 'sorulmadi' : after >= 70 ? 'kazanildi' : change! >= 15 ? 'gelisti' : change! <= -15 ? 'geriledi' : 'ayni';
    return { subject: s.subject, short: s.row.short, label: s.row.label, before: prev, after, change, verdict };
  });
  return { exam: lastExam, rows };
}

// ============================================================================ Seçili denemeler ortalaması
export interface AverageRow {
  subject: ExamSubject;
  n: number;
  d: number;
  y: number;
  b: number;
  net: number;
  clsNet: number | null;
  kurumNet: number | null;
  best: number;
  worst: number;
  rate: number; // ortalama doğru oranı
}

export interface AverageSummary {
  n: number;
  rows: AverageRow[];
  totalNet: number;
  score: number | null;
  clsScore: number | null;
  kurumScore: number | null;
  best: { exam: DenemeExam; score: number } | null;
  worst: { exam: DenemeExam; score: number } | null;
  first: number | null;
  last: number | null;
}

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function selectedAverages(exams: DenemeExam[], results: DenemeResult[], subjects: ExamSubject[]): AverageSummary | null {
  const rByExam = new Map<string, DenemeResult>();
  for (const r of results) if (!rByExam.has(r.examId)) rByExam.set(r.examId, r);
  const used = exams.filter((e) => rByExam.has(e.id));
  if (!used.length) return null;
  const rows: AverageRow[] = [];
  for (const s of subjects) {
    const xs = used.map((e) => ({ e, r: rByExam.get(e.id)!, x: rByExam.get(e.id)!.stats.subjects?.[s.key] })).filter((v) => !!v.x);
    if (!xs.length) continue;
    const nets = xs.map((v) => v.x!.net);
    const cls = xs
      .map((v) => (v.r.classId ? (v.e.summary.classes || {})[v.r.classId]?.avgNet?.[s.key] : undefined))
      .filter((v): v is number => typeof v === 'number');
    const kur = xs.map((v) => v.e.summary.avgNet?.[s.key]).filter((v): v is number => typeof v === 'number');
    const d = avgOf(xs.map((v) => v.x!.d)) ?? 0;
    const y = avgOf(xs.map((v) => v.x!.y)) ?? 0;
    const b = avgOf(xs.map((v) => v.x!.b)) ?? 0;
    rows.push({
      subject: s,
      n: xs.length,
      d: round2(d),
      y: round2(y),
      b: round2(b),
      net: round2(avgOf(nets) ?? 0),
      clsNet: cls.length ? round2(avgOf(cls)!) : null,
      kurumNet: kur.length ? round2(avgOf(kur)!) : null,
      best: Math.max(...nets),
      worst: Math.min(...nets),
      rate: d + y + b ? Math.round((d / (d + y + b)) * 100) : 0,
    });
  }
  const scored = used.map((e) => ({ e, s: rByExam.get(e.id)!.score })).filter((v): v is { e: DenemeExam; s: number } => typeof v.s === 'number');
  const clsScores = used
    .map((e) => {
      const r = rByExam.get(e.id)!;
      return r.classId ? (e.summary.classes || {})[r.classId]?.avgScore : undefined;
    })
    .filter((v): v is number => typeof v === 'number');
  const kurScores = used.map((e) => e.summary.avgScore).filter((v): v is number => typeof v === 'number');
  const best = scored.length ? scored.reduce((a, b) => (b.s > a.s ? b : a)) : null;
  const worst = scored.length ? scored.reduce((a, b) => (b.s < a.s ? b : a)) : null;
  return {
    n: used.length,
    rows,
    totalNet: round2(avgOf(used.map((e) => rByExam.get(e.id)!.totalNet ?? 0)) ?? 0),
    score: scored.length ? round2(avgOf(scored.map((v) => v.s))!) : null,
    clsScore: clsScores.length ? round2(avgOf(clsScores)!) : null,
    kurumScore: kurScores.length ? round2(avgOf(kurScores)!) : null,
    best: best ? { exam: best.e, score: best.s } : null,
    worst: worst ? { exam: worst.e, score: worst.s } : null,
    first: scored.length ? scored[0].s : null,
    last: scored.length ? scored[scored.length - 1].s : null,
  };
}

// ============================================================================ Konu ısı tablosu
export interface HeatRow {
  row: KazRow;
  cells: Array<number | null>; // deneme sırasıyla başarı (sorulmadıysa null)
}
export interface HeatSubject {
  subject: ExamSubject;
  rows: HeatRow[];
  examRates: Array<number | null>; // dersin deneme başarısı
}

/** Satır: kazanım, sütun: deneme. Yalnızca sorulan kazanımlar; en çok sorulan / en zayıf üstte değil, müfredat sırasıyla. */
export function topicHeat(tracking: KazSubject[], exams: DenemeExam[]): HeatSubject[] {
  return tracking
    .map((st) => {
      const rows = st.rows.filter((r) => r.status !== 'sorulmadi').map((r) => ({ row: r, cells: exams.map((e) => (r.per[e.id] ? r.per[e.id].rate : null)) }));
      const examRates = exams.map((e) => {
        let d = 0;
        let t = 0;
        for (const r of st.rows) {
          const a = r.per[e.id];
          if (a) {
            d += a.d;
            t += a.total;
          }
        }
        return t ? Math.round((d / t) * 100) : null;
      });
      return { subject: st.subject, rows, examRates };
    })
    .filter((h) => h.rows.length > 0);
}

// ============================================================================ Soru (madde) analizi
export interface ItemStat {
  no: number;
  index: number;
  answer: string;
  cancelled: boolean;
  konu: string;
  alt: string | null;
  n: number;
  d: number;
  y: number;
  b: number;
  multi: number; // birden çok işaretleme
  rate: number; // doğru %
  wrongRate: number;
  blankRate: number;
  kurumRate: number; // bütün kurumda doğru %
  diff: number; // rate - kurumRate
  options: Record<string, number>; // şık → kaç öğrenci
  topWrong: { option: string; count: number; pct: number } | null;
  disc: number | null; // ayırt edicilik (üst %27 - alt %27), -1..1
  flags: Array<{ key: string; text: string; tone: KazTone }>;
}

export interface ItemSubject {
  subject: ExamSubject;
  options: string[]; // A B C D (E)
  items: ItemStat[];
}

const DISC_MIN = 10; // ayırt edicilik için en az öğrenci

/** Ebel ölçütü: 0,40+ çok iyi · 0,30-0,39 iyi · 0,20-0,29 geliştirilmeli · 0,20 altı zayıf */
export function discLabel(d: number | null): { label: string; tone: KazTone } {
  if (d === null) return { label: '-', tone: 'muted' };
  if (d >= 0.4) return { label: 'Çok iyi', tone: 'success' };
  if (d >= 0.3) return { label: 'İyi', tone: 'info' };
  if (d >= 0.2) return { label: 'Orta', tone: 'warning' };
  return { label: 'Zayıf', tone: 'danger' };
}

export const fmtDisc = (d: number | null) => (d === null ? '-' : d.toFixed(2).replace('.', ','));

/**
 * Soru analizi. `results`: incelenen grup (sınıf ya da kurum), `allResults`: kurumun bütün sonuçları (karşılaştırma için).
 */
export function itemAnalysis(exam: DenemeExam, results: DenemeResult[], allResults: DenemeResult[]): ItemSubject[] {
  const out: ItemSubject[] = [];
  const isGroup = results.length !== allResults.length;
  for (const s of exam.subjects) {
    const qs = exam.questions[s.key] || [];
    if (!qs.length) continue;
    // şıklar: anahtarda ya da cevaplarda E varsa E de gösterilir
    const letters = new Set(['A', 'B', 'C', 'D']);
    for (const q of qs) if (q.answer === 'E') letters.add('E');
    for (const r of results) if ((r.answers[s.key] || '').includes('E')) letters.add('E');
    const options = Array.from(letters).sort();
    // ayırt edicilik grupları: ders netine göre sıralı üst ve alt %27
    const byNet = results
      .map((r) => ({ r, v: r.stats.subjects?.[s.key]?.net ?? -999 }))
      .filter((x) => x.v > -999)
      .sort((a, b) => b.v - a.v);
    const g = byNet.length >= DISC_MIN ? Math.max(1, Math.round(byNet.length * 0.27)) : 0;
    const top = byNet.slice(0, g).map((x) => x.r);
    const bottom = g ? byNet.slice(-g).map((x) => x.r) : [];
    const items: ItemStat[] = qs.map((q, i) => {
      const cancelled = (q.answer || '').toUpperCase() === 'X';
      const opt: Record<string, number> = Object.fromEntries(options.map((o) => [o, 0]));
      let d = 0;
      let y = 0;
      let b = 0;
      let multi = 0;
      for (const r of results) {
        const g0 = (r.answers[s.key] || '')[i];
        const m = markOf(g0, q);
        if (m === 'D') d++;
        else if (m === 'Y') y++;
        else b++;
        if (g0 === '*') multi++;
        else if (g0 && g0 !== ' ' && opt[g0] !== undefined) opt[g0]++;
      }
      const n = results.length;
      const kd = allResults.filter((r) => markOf((r.answers[s.key] || '')[i], q) === 'D').length;
      const rate = n ? Math.round((d / n) * 100) : 0;
      const kurumRate = allResults.length ? Math.round((kd / allResults.length) * 100) : 0;
      let topWrong: ItemStat['topWrong'] = null;
      if (!cancelled) {
        for (const o of options) {
          if (o === (q.answer || '').toUpperCase()) continue;
          if (opt[o] > 0 && (!topWrong || opt[o] > topWrong.count)) topWrong = { option: o, count: opt[o], pct: n ? Math.round((opt[o] / n) * 100) : 0 };
        }
      }
      const pOf = (list: DenemeResult[]) => (list.length ? list.filter((r) => markOf((r.answers[s.key] || '')[i], q) === 'D').length / list.length : 0);
      const disc = g && !cancelled ? Math.round((pOf(top) - pOf(bottom)) * 100) / 100 : null;
      const t = topicLabels(q);
      const flags: ItemStat['flags'] = [];
      const blankRate = n ? Math.round((b / n) * 100) : 0;
      if (!cancelled && n) {
        if (isGroup && kurumRate - rate >= 25) flags.push({ key: 'geride', text: `Sınıf kurumun ${kurumRate - rate} puan gerisinde`, tone: 'danger' });
        if (topWrong && (topWrong.pct >= rate || topWrong.pct >= 35)) flags.push({ key: 'celdirici', text: `Güçlü çeldirici: ${topWrong.option} şıkkı (%${topWrong.pct})`, tone: 'warning' });
        if (blankRate >= 40) flags.push({ key: 'bos', text: `Çok boş bırakılmış (%${blankRate})`, tone: 'warning' });
        if (rate < 30) flags.push({ key: 'zor', text: 'Çok zor (%30 altı)', tone: 'danger' });
        if (disc !== null && disc < 0) flags.push({ key: 'negatif', text: 'Başarılı öğrenciler daha çok yanlış yapmış: cevap anahtarını kontrol edin', tone: 'danger' });
        else if (disc !== null && disc < 0.2 && rate < 90) flags.push({ key: 'ayirt', text: 'Ayırt ediciliği düşük', tone: 'muted' });
      }
      return {
        no: q.no,
        index: i,
        answer: cancelled ? 'X' : (q.answer || '').toUpperCase(),
        cancelled,
        konu: q.konu || q.kazanim ? t.konu : '',
        alt: t.alt,
        n,
        d,
        y,
        b,
        multi,
        rate,
        wrongRate: n ? Math.round((y / n) * 100) : 0,
        blankRate,
        kurumRate,
        diff: rate - kurumRate,
        options: opt,
        topWrong,
        disc,
        flags,
      };
    });
    out.push({ subject: s, options, items });
  }
  return out;
}

/** Sınıfın kuruma göre en çok geride kaldığı sorular (dikkat listesi) */
export function itemWatchList(data: ItemSubject[], max = 10): Array<{ subject: ExamSubject; item: ItemStat }> {
  const all: Array<{ subject: ExamSubject; item: ItemStat; score: number }> = [];
  for (const s of data)
    for (const it of s.items) {
      if (it.cancelled || !it.flags.length) continue;
      const score = (it.flags.some((f) => f.key === 'geride') ? 100 : 0) + (it.flags.some((f) => f.key === 'negatif') ? 80 : 0) + (100 - it.rate) + Math.max(0, -it.diff);
      all.push({ subject: s.subject, item: it, score });
    }
  return all.sort((a, b) => b.score - a.score).slice(0, max);
}
