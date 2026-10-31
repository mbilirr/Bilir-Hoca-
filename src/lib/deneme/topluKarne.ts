// ============================================================================
// Aşama 101: SINIFA TOPLU KARNE — tek PDF ya da zip olarak indirme; e-posta / SMS döngüsü
// Karneler sırayla üretilir; her öğrenciden sonra tarayıcıya sıra verilir (telefon kasmaz) ve "Durdur" çalışır.
// Zip kütüphanesi (fflate) yalnızca zip istenince yüklenir.
// ============================================================================
import type { Student } from '../../types';
import type { DenemeResult } from '../../services/denemeService';
import { TUR_NAME, buildStudentKarne, type BuiltKarne, type KarneContext, type KarneExtra } from './karneBuilder';
import { buildKarnePdfParts, karnePdfBlob, safeFileName } from './karnePdf';

export type TopluProgress = (done: number, total: number, name: string) => void;
export type TopluOpts = { signal?: AbortSignal; onProgress?: TopluProgress; loadExtra: (s: Student) => Promise<KarneExtra> };
export type TopluOutcome = { done: number; skipped: number; aborted: boolean };

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** Sonucu olan her öğrencinin karnesini sırayla üretip fn'e verir (ada göre sıralı) */
export async function forEachStudentKarne(
  ctx: KarneContext,
  students: Student[],
  data: { results: DenemeResult[] },
  opts: TopluOpts,
  fn: (s: Student, k: BuiltKarne) => Promise<void>
): Promise<TopluOutcome> {
  const byStudent = new Map<string, DenemeResult[]>();
  for (const r of data.results) {
    const list = byStudent.get(r.studentId);
    if (list) list.push(r);
    else byStudent.set(r.studentId, [r]);
  }
  // Aşama 119: "Tüm sınıflar"da önce sınıf, sonra ad (tek sınıfta sıra değişmez)
  const list = students
    .filter((s) => byStudent.has(s.id))
    .sort((a, b) => (a.className || '').localeCompare(b.className || '', 'tr', { numeric: true }) || a.name.localeCompare(b.name, 'tr'));
  let done = 0;
  let skipped = 0;
  for (let i = 0; i < list.length; i++) {
    if (opts.signal?.aborted) return { done, skipped, aborted: true };
    const s = list[i];
    opts.onProgress?.(i, list.length, s.name);
    const extra = await opts.loadExtra(s);
    const k = buildStudentKarne(ctx, { id: s.id, name: s.name, className: s.className || '' }, byStudent.get(s.id) || [], extra);
    if (k) {
      await fn(s, k);
      done++;
    } else skipped++;
    await yieldToUi();
  }
  opts.onProgress?.(list.length, list.length, '');
  return { done, skipped, aborted: !!opts.signal?.aborted };
}

const bundleName = (ctx: KarneContext, className: string) => safeFileName(`Karneler-${className}-${TUR_NAME[ctx.tur]}`);

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Bütün sınıf tek PDF: her öğrenci yeni sayfadan başlar, alt yazı ve sayfa numarası öğrenciye göre */
export async function downloadClassPdf(ctx: KarneContext, className: string, students: Student[], data: { results: DenemeResult[] }, opts: TopluOpts): Promise<TopluOutcome> {
  const parts: Array<{ blocks: BuiltKarne['blocks']; footer: string }> = [];
  let orientation: BuiltKarne['orientation'] = 'portrait';
  const r = await forEachStudentKarne(ctx, students, data, opts, async (_s, k) => {
    parts.push({ blocks: k.blocks, footer: k.footer });
    orientation = k.orientation;
  });
  if (r.aborted || !parts.length) return r;
  const doc = await buildKarnePdfParts(parts, orientation);
  saveBlob(doc.output('blob'), `${bundleName(ctx, className)}.pdf`);
  return r;
}

/** Zip içinde aynı ad iki kez çıkarsa -2, -3 eklenir */
export function uniqueName(used: Set<string>, base: string): string {
  let name = `${base}.pdf`;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}.pdf`;
  used.add(name);
  return name;
}

/** Her öğrenci ayrı PDF, hepsi tek zip (PDF zaten sıkıştırılmış: level 0) */
export async function buildClassZip(ctx: KarneContext, students: Student[], data: { results: DenemeResult[] }, opts: TopluOpts): Promise<{ zip: Uint8Array | null } & TopluOutcome> {
  const { zipSync } = await import('fflate');
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  const used = new Set<string>();
  const r = await forEachStudentKarne(ctx, students, data, opts, async (_s, k) => {
    const blob = await karnePdfBlob(k.blocks, k.footer, k.orientation);
    files[uniqueName(used, safeFileName(k.file))] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  });
  if (r.aborted || !used.size) return { zip: null, ...r };
  return { zip: zipSync(files), ...r };
}

export async function downloadClassZip(ctx: KarneContext, className: string, students: Student[], data: { results: DenemeResult[] }, opts: TopluOpts): Promise<TopluOutcome> {
  const { zip, ...r } = await buildClassZip(ctx, students, data, opts);
  if (zip) saveBlob(new Blob([zip], { type: 'application/zip' }), `${bundleName(ctx, className)}.zip`);
  return r;
}
