// ============================================================================
// Aşama 393: Oyunlar — soru görseli hazırlama (tamamen tarayıcıda)
// Sayfa resminden seçilen bölge kesilir, en çok GORSEL_EN_GENIS piksel genişliğe küçültülür ve JPEG'e çevrilir.
// Veritabanı sınırı (sql/393: data URL en çok 700.000 karakter) aşılırsa kalite, sonra boyut düşürülür.
// ============================================================================

/** Seçilen bölge: sayfa resmine göre 0-1 arası oran */
export interface KesimKutusu {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const GORSEL_EN_GENIS = 1100;
/** sql/393 ogr393_veri_chk ile aynı sınırın biraz altı */
export const GORSEL_EN_COK_KARAKTER = 690_000;
/** çok küçük seçim (yanlışlıkla dokunma) kabul edilmez: sayfa genişliğinin / yüksekliğinin %3'ü */
export const KESIM_EN_AZ = 0.03;

function resimYukle(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Resim açılamadı.'));
    img.src = src;
  });
}

/** Resmi (data URL ya da adres) keser ve küçültür; JPEG data URL döner */
export async function gorselHazirla(src: string, kutu?: KesimKutusu): Promise<string> {
  const img = await resimYukle(src);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const k = kutu || { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.max(0, Math.round(k.x * W));
  const sy = Math.max(0, Math.round(k.y * H));
  const sw = Math.max(1, Math.min(W - sx, Math.round(k.w * W)));
  const sh = Math.max(1, Math.min(H - sy, Math.round(k.h * H)));
  let genis = Math.min(GORSEL_EN_GENIS, sw);
  for (let deneme = 0; deneme < 4; deneme++) {
    const olcek = genis / sw;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * olcek));
    canvas.height = Math.max(1, Math.round(sh * olcek));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Tarayıcı resmi hazırlayamadı.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.75, 0.62, 0.5]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= GORSEL_EN_COK_KARAKTER) return url;
    }
    genis = Math.round(genis * 0.75);
  }
  throw new Error('Seçilen bölge çok büyük. Daha küçük bir bölge seçin.');
}

/** Bilgisayardan seçilen JPG / PNG resmi soru görseline çevirir */
export async function dosyadanGorsel(file: File): Promise<string> {
  if (!/^image\/(jpeg|png)$/.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) throw new Error('JPG ya da PNG resim seçin.');
  const url = URL.createObjectURL(file);
  try {
    return await gorselHazirla(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** data URL → yapay zekâya giden resim (base64) */
export const gorselAiResmi = (dataUrl: string) => ({ mime: 'image/jpeg' as const, data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
