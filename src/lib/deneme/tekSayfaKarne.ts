// ============================================================================
// Aşama 135: TEK SAYFA DENEME SONUÇ KARNESİ — veri
// Bir öğrencinin TEK denemedeki sonucu A4 tek sayfada: puan, net, D/Y/B, sınıf ve kurum sırası,
// ders tablosu, son 3 yıl LGS yüzdelik dilimi, ders netleri, son denemelerdeki puan gelişimi,
// kısa değerlendirme ve bütün soruların kazanım listesi.
// Yeni veri okunmaz: mevcut deneme özeti (summary) ve öğrencinin sonuçları kullanılır.
// Çizimi karnePdf.ts yapar ('tekSayfa' bloğu).
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { examKarneData } from './karneDetay';
import { round2 } from './lgs';
import { isLgsExam, lgsPercentiles } from './lgsYuzdelik';
import { denemeKarneAdi } from './karneAdi';

/** Ders renkleri (başlık mor değil; her ders kendi rengini kullanır) */
export const TEK_DERS_RENK: Record<string, [number, number, number]> = {
  tr: [225, 29, 72],
  sos: [217, 119, 6],
  din: [5, 150, 105],
  ing: [8, 145, 178],
  mat: [37, 99, 235],
  fen: [124, 58, 237],
};
const YEDEK_RENK: Array<[number, number, number]> = [
  [71, 85, 105],
  [190, 24, 93],
  [13, 148, 136],
];
/** Aşama 135: dersin rengi (tek sayfa ve birleştirilmiş karnede aynı) */
export const dersRengi = (key: string, i: number): [number, number, number] => TEK_DERS_RENK[key] || YEDEK_RENK[i % YEDEK_RENK.length];
/** Kısa ders adı (tablo, grafik ve kazanım başlığı) */
const KISA_AD: Record<string, string> = {
  tr: 'Türkçe',
  sos: 'İnkılap Tarihi',
  din: 'Din Kültürü',
  ing: 'Yabancı Dil',
  mat: 'Matematik',
  fen: 'Fen Bilimleri',
};
/** Kurumun bu oranından fazlasının doğru yaptığı soruyu kaçırmak "dikkat" işaretidir */
export const TEK_KACAN_ORAN = 60;
/** Puan gelişimi grafiğinde gösterilen deneme sayısı */
const GELISIM_SAYI = 5;

export interface TekSoru {
  no: number;
  given: string;
  key: string;
  mark: 'D' | 'Y' | 'B';
  kazanim: string;
  kurumRate: number | null;
  /** kurumun çoğunluğu doğru yaptı, öğrenci kaçırdı */
  kacan: boolean;
}
export interface TekDers {
  key: string;
  name: string;
  short: string;
  color: [number, number, number];
  count: number;
  d: number;
  y: number;
  b: number;
  net: number;
  rate: number;
  clsAvgNet: number | null;
  kurumAvgNet: number | null;
  sorular: TekSoru[];
}
export interface TekSayfaData {
  /** Karnenin başlığı: "Hız Denemesi Karnesi" (yayınevi yoksa deneme adı + Karnesi) */
  title: string;
  studentName: string;
  className: string;
  studentNo: string;
  examName: string;
  examDate: string;
  publisher: string;
  booklet: string;
  score: number | null;
  prevScore: number | null;
  totalNet: number | null;
  totals: { count: number; d: number; y: number; b: number };
  clsAvgScore: number | null;
  kurumAvgScore: number | null;
  clsTotalNet: number | null;
  kurumTotalNet: number | null;
  rank: { cls: number; clsCount: number; overall: number; overallCount: number } | null;
  /** Son 3 yıl LGS yüzdelik dilimi (LGS dışı denemede boş) */
  yuzdelik: Array<{ year: number; value: number; below: boolean }>;
  dersler: TekDers[];
  /** Son denemelerdeki puan (eski → yeni, en çok 5); kurum: o denemenin kurum ortalaması */
  gelisim: Array<{ name: string; score: number | null; kurum: number | null }>;
  degerlendirme: Array<{ tone: 'success' | 'danger' | 'warning' | 'info'; label: string; text: string }>;
}

/** denemeService.byUploadOrder ile aynı sıra (veri katmanını içe aktarmamak için burada) */
const byUploadOrder = (a: { createdAt: string; examDate?: string }, b: { createdAt: string; examDate?: string }) =>
  (a.createdAt || '').localeCompare(b.createdAt || '') || (a.examDate || '').localeCompare(b.examDate || '');
/** Grafikte deneme etiketi: tarih (gg.aa); tarih yoksa kısaltılmış ad */
const shortName = (e: DenemeExam) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(e.examDate || '');
  return m ? `${m[2]}.${m[1]}` : e.name.length > 12 ? `${e.name.slice(0, 11)}…` : e.name;
};
const sum = (xs: Array<number | null>) => (xs.some((x) => x === null) ? null : round2(xs.reduce<number>((a, b) => a + (b as number), 0)));

/**
 * Seçili denemenin tek sayfa karnesi. exams: kapsamdaki denemeler (gelişim grafiği için),
 * results: yalnız bu öğrencinin sonuçları. Öğrenci denemeye girmediyse null.
 */
export function tekSayfaData(
  exam: DenemeExam,
  exams: DenemeExam[],
  results: DenemeResult[],
  s: { name: string; className: string; no?: string }
): TekSayfaData | null {
  const result = results.find((r) => r.examId === exam.id);
  if (!result) return null;
  const k = examKarneData(exam, result);
  if (!k.subjects.length) return null;

  const dersler: TekDers[] = k.subjects.map((sr, i) => {
    const qs = exam.questions[sr.subject.key] || [];
    const sorular: TekSoru[] = sr.answers.map((a, qi) => {
      const q = qs[qi];
      const kazanim = (q?.kazanim || q?.konu || '').replace(/\s+/g, ' ').trim();
      return {
        no: a.no,
        given: a.given,
        key: a.key,
        mark: a.mark,
        kazanim: kazanim || 'Kazanım eklenmemiş',
        kurumRate: a.kurumRate,
        kacan: a.mark !== 'D' && a.kurumRate !== null && a.kurumRate >= TEK_KACAN_ORAN,
      };
    });
    return {
      key: sr.subject.key,
      name: sr.subject.name,
      short: KISA_AD[sr.subject.key] || sr.subject.short,
      color: dersRengi(sr.subject.key, i),
      count: sr.count,
      d: sr.d,
      y: sr.y,
      b: sr.b,
      net: sr.net,
      rate: sr.rate,
      clsAvgNet: sr.clsAvgNet,
      kurumAvgNet: sr.kurumAvgNet,
      sorular,
    };
  });

  // Puan gelişimi: kapsamdaki denemelerden öğrencinin girdikleri, seçili denemeye kadar (yükleniş sırası)
  const byExam = new Map(results.map((r) => [r.examId, r] as const));
  const sorted = exams.filter((e) => byExam.has(e.id)).sort(byUploadOrder);
  const upto = sorted.slice(0, Math.max(1, sorted.findIndex((e) => e.id === exam.id) + 1));
  const gelisim = upto.slice(-GELISIM_SAYI).map((e) => ({
    name: shortName(e),
    score: byExam.get(e.id)?.score ?? null,
    kurum: typeof e.summary.avgScore === 'number' ? e.summary.avgScore : null,
  }));
  const prev = upto.length > 1 ? byExam.get(upto[upto.length - 2].id)?.score ?? null : null;

  const yuzdelik = isLgsExam(exam) ? lgsPercentiles(k.score).map((p) => ({ year: p.year, value: p.value, below: p.below })) : [];

  // Kısa değerlendirme (yalnız var olan veriden)
  const degerlendirme: TekSayfaData['degerlendirme'] = [];
  const guclu = dersler.filter((d) => d.rate >= 80).map((d) => d.short);
  const zayif = dersler.filter((d) => d.rate < 60).sort((a, b) => a.rate - b.rate);
  if (guclu.length) degerlendirme.push({ tone: 'success', label: 'Güçlü dersler:', text: `${guclu.join(', ')} (başarı %80 ve üzeri).` });
  if (zayif.length) {
    const kayip = zayif.reduce((a, d) => a + d.y + d.b, 0);
    degerlendirme.push({ tone: 'danger', label: 'Öncelik:', text: `${zayif.map((d) => d.short).join(', ')}. ${kayip} soru kaybı var; yanlış ve boş kazanımlar aşağıda işaretli.` });
  }
  const kacan = dersler.reduce((a, d) => a + d.sorular.filter((q) => q.kacan).length, 0);
  if (kacan) degerlendirme.push({ tone: 'warning', label: 'Dikkat:', text: `Kurumun çoğunluğunun doğru yaptığı ${kacan} soru kaçırıldı (turuncu nokta).` });
  if (k.score !== null && k.kurumAvgScore !== null) {
    const fk = round2(k.score - k.kurumAvgScore);
    const fs = k.clsAvgScore !== null ? round2(k.score - k.clsAvgScore) : null;
    const yon = (n: number) => (n >= 0 ? 'üzerinde' : 'altında');
    const fmt = (n: number) => Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    degerlendirme.push({
      tone: 'info',
      label: 'Puan:',
      text: `Kurum ortalamasının ${fmt(fk)} puan ${yon(fk)}${fs !== null ? `, sınıf ortalamasının ${fmt(fs)} puan ${yon(fs)}` : ''}.`,
    });
  }
  if (!degerlendirme.length) degerlendirme.push({ tone: 'info', label: 'Durum:', text: 'Dengeli bir sonuç; yanlış ve boş sorular aşağıda işaretli.' });

  return {
    title: denemeKarneAdi(exam),
    studentName: s.name,
    className: s.className || result.className || '',
    studentNo: s.no || '',
    examName: exam.name,
    examDate: exam.examDate,
    publisher: exam.publisher,
    booklet: result.booklet || '',
    score: k.score,
    prevScore: prev,
    totalNet: k.totalNet,
    totals: k.totals,
    clsAvgScore: k.clsAvgScore,
    kurumAvgScore: k.kurumAvgScore,
    clsTotalNet: sum(k.subjects.map((x) => x.clsAvgNet)),
    kurumTotalNet: sum(k.subjects.map((x) => x.kurumAvgNet)),
    rank: k.rank,
    yuzdelik,
    dersler,
    gelisim,
    degerlendirme,
  };
}

/** Kapsamdaki son deneme (yükleniş sırası) — "Tek sayfa" türünde varsayılan */
export function sonDeneme(exams: DenemeExam[]): DenemeExam | null {
  const s = exams.slice().sort(byUploadOrder);
  return s.length ? s[s.length - 1] : null;
}
