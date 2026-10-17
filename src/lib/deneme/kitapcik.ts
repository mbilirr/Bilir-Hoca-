// ============================================================================
// DENEME ANALİZİ (Aşama 48) — PDF İŞLEMLERİ (tamamen tarayıcıda)
//  * Taranmış soru kitapçığı: sayfalar resme çevrilir. Birden çok PDF (ör. sözel + sayısal) ya da
//    sayfa fotoğrafları (JPG/PNG) seçilebilir; sayfalar tek bir sırada numaralanır.
//  * MEB öğretim programı PDF'i: sayfaların metni çıkarılır.
// Dosyalar hiçbir yere yüklenmez; yapay zekâya yalnızca gereken sayfa resmi ya da metin gider.
// ============================================================================

export interface PageImage {
  mime: 'image/jpeg';
  data: string; // base64 (data: öneki olmadan)
  dataUrl: string;
  bytes: number;
}

export interface Kitapcik {
  name: string;
  pageCount: number;
  render: (page: number, maxWidth: number, quality?: number) => Promise<PageImage>;
  destroy: () => void;
}

let pdfLib: Promise<any> | null = null;

/** pdf.js yalnızca gerektiğinde yüklenir (uygulamanın açılışını yavaşlatmaz) */
function loadPdfJs(): Promise<any> {
  if (!pdfLib) {
    pdfLib = (async () => {
      const mod: any = await import('pdfjs-dist');
      const lib = mod && mod.getDocument ? mod : mod.default;
      const worker: any = await import('pdfjs-dist/build/pdf.worker.min.js?url');
      lib.GlobalWorkerOptions.workerSrc = worker.default || worker;
      return lib;
    })().catch((e) => {
      pdfLib = null;
      throw e;
    });
  }
  return pdfLib;
}

async function openPdfDoc(file: File): Promise<any> {
  const lib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    // isEvalSupported: false → güvenlik (pdf.js'in yazı tipi için kod üretmesi kapalı)
    return await lib.getDocument({ data, isEvalSupported: false }).promise;
  } catch (e: any) {
    if (e && /password/i.test(String(e.name || e.message))) throw new Error(`${file.name}: PDF dosyası şifreli. Şifresiz bir kopya seçin.`);
    throw new Error(`${file.name}: PDF dosyası açılamadı. Dosyanın bozuk olmadığından emin olun.`);
  }
}

function canvasToImage(canvas: HTMLCanvasElement, quality: number, maxBytes = 2_400_000): PageImage {
  let q = quality;
  let dataUrl = canvas.toDataURL('image/jpeg', q);
  // Sunucu sınırı için: büyükse kaliteyi düşür
  while (dataUrl.length * 0.75 > maxBytes && q > 0.4) {
    q -= 0.15;
    dataUrl = canvas.toDataURL('image/jpeg', q);
  }
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { mime: 'image/jpeg', data, dataUrl, bytes: Math.floor(data.length * 0.75) };
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(w));
  canvas.height = Math.max(1, Math.floor(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tarayıcı sayfayı çizemedi.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} açılamadı.`));
    };
    img.src = url;
  });
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
const byName = (a: File, b: File) => a.name.localeCompare(b.name, 'tr', { numeric: true });

type PageRef = { kind: 'pdf'; doc: any; n: number } | { kind: 'img'; file: File };

/** Seçilen dosyalardan kitapçık açar: bir ya da birden çok PDF ve/veya sayfa resimleri (ad sırasıyla) */
export async function openKitapcik(files: File[]): Promise<Kitapcik> {
  const list = files.filter((f) => isPdf(f) || isImage(f)).sort(byName);
  if (!list.length) throw new Error('PDF ya da resim (JPG/PNG) dosyası seçin.');
  const docs: any[] = [];
  const pages: PageRef[] = [];
  try {
    for (const f of list) {
      if (isPdf(f)) {
        const doc = await openPdfDoc(f);
        docs.push(doc);
        for (let n = 1; n <= doc.numPages; n++) pages.push({ kind: 'pdf', doc, n });
      } else pages.push({ kind: 'img', file: f });
    }
  } catch (e) {
    for (const d of docs) void Promise.resolve(d.destroy()).catch(() => undefined);
    throw e;
  }
  return {
    name: list.length === 1 ? list[0].name : `${list.length} dosya`,
    pageCount: pages.length,
    render: async (p, maxWidth, quality = 0.85) => {
      const ref = pages[p - 1];
      if (!ref) throw new Error('Sayfa bulunamadı.');
      if (ref.kind === 'img') {
        const img = await loadImage(ref.file);
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const { canvas, ctx } = makeCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvasToImage(canvas, quality);
      }
      const page = await ref.doc.getPage(ref.n);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.max(0.1, Math.min(4, maxWidth / base.width));
        const vp = page.getViewport({ scale });
        const { canvas, ctx } = makeCanvas(vp.width, vp.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        return canvasToImage(canvas, quality);
      } finally {
        try {
          page.cleanup();
        } catch {
          /* yok say */
        }
      }
    },
    destroy: () => {
      for (const d of docs) void Promise.resolve(d.destroy()).catch(() => undefined);
    },
  };
}

/** PDF'in her sayfasının metni (öğretim programı gibi metin içeren PDF'ler için) */
export async function extractPdfText(file: File, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const doc = await openPdfDoc(file);
  const out: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      try {
        const tc = await page.getTextContent();
        let s = '';
        for (const it of tc.items as any[]) {
          if (typeof it.str !== 'string') continue;
          s += it.str + (it.hasEOL ? '\n' : ' ');
        }
        out.push(
          s
            .replace(/[ \t]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        );
      } finally {
        try {
          page.cleanup();
        } catch {
          /* yok say */
        }
      }
      onProgress?.(n, doc.numPages);
    }
  } finally {
    void Promise.resolve(doc.destroy()).catch(() => undefined);
  }
  return out;
}

/** "2-5, 7" → [2,3,4,5,7] (sayfa sayısı içinde) */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const out = new Set<number>();
  for (const part of (input || '').split(/[,;\s]+/)) {
    if (!part) continue;
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.replace(/[–—]/g, '-'));
    if (!m) continue;
    let a = Number(m[1]);
    let b = m[2] ? Number(m[2]) : a;
    if (a > b) [a, b] = [b, a];
    for (let i = Math.max(1, a); i <= Math.min(pageCount, b); i++) out.add(i);
  }
  return Array.from(out).sort((x, y) => x - y);
}

/** [2,3,4,5,7] → "2-5, 7" */
export function formatPageRanges(pages: number[]): string {
  const s = Array.from(new Set(pages)).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j > i ? `${s[i]}-${s[j]}` : String(s[i]));
    i = j;
  }
  return parts.join(', ');
}
