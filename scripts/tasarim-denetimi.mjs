// Aşama 347: TASARIM DENETİMİ. Paket öncesi ve GitHub denetiminde çalışır (npm run denetim:tasarim).
// Kurallar (index.css'teki ölçekler):
//   1) Sabit piksel punto yok: text-[11px] yerine text-3xs / 2xs / xs / sm / base …
//   2) Rastgele katman sayısı yok: z-[80] / z-[9999] yerine z-(--z-pencere) gibi katman adları
//      (sayfa içi küçük sayılar z-10…z-50 serbest)
//   3) transition-all yok (transition, transition-colors, transition-[width] …)
//   4) Köşe ölçüsü: rounded-md ve rounded-3xl yok (kutu xl/2xl, düğme lg, hap full)
//   5) Düğme boyu: elle h-7/h-9/h-10/h-11/h-12 düğme sayısı artamaz (eskiler sayfa paketlerinde düzelir)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const KOK = new URL('..', import.meta.url).pathname;
const DUGME_SAPMA_TAVAN = 19; // 21 Kas 2026 ölçümü; sayfa paketleri düzelttikçe düşürülür

function dosyalar(dir, out = []) {
  for (const ad of readdirSync(dir)) {
    const p = join(dir, ad);
    const st = statSync(p);
    if (st.isDirectory()) dosyalar(p, out);
    else if (/\.(tsx?|css)$/.test(ad)) out.push(p);
  }
  return out;
}

const KURALLAR = [
  { ad: 'sabit piksel punto', re: /\btext-\[\d+(\.\d+)?px\]/g, oneri: 'text-3xs / text-2xs / text-xs / text-sm / text-base' },
  { ad: 'rastgele katman', re: /\bz-\[\d{2,}\]/g, oneri: 'z-(--z-pencere) / z-(--z-pencere-ust) / z-(--z-acilir) / z-(--z-bildirim)' },
  { ad: 'transition-all', re: /\btransition-all\b/g, oneri: 'transition / transition-colors / transition-[width]' },
  { ad: 'köşe ölçüsü', re: /\brounded(-[trblse]{1,2})?-(md|3xl)\b/g, oneri: 'rounded-lg / rounded-xl / rounded-2xl / rounded-full' },
];
const CSS_KATMAN = /z-index:\s*(\d{2,})\s*;/g; // css'te 60 ve üstü sayı yasak (var(--z-…) kullanılır)

const hatalar = [];
let dugmeSapma = 0;
for (const p of dosyalar(join(KOK, 'src'))) {
  const rel = relative(KOK, p);
  const satirlar = readFileSync(p, 'utf8').split('\n');
  satirlar.forEach((satir, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(satir)) return; // açıklama satırları
    for (const k of KURALLAR) {
      for (const m of satir.matchAll(k.re)) hatalar.push(`${rel}:${i + 1}  ${k.ad}: ${m[0]}  → ${k.oneri}`);
    }
    if (p.endsWith('.css')) {
      for (const m of satir.matchAll(CSS_KATMAN)) {
        if (Number(m[1]) >= 60) hatalar.push(`${rel}:${i + 1}  rastgele katman: z-index ${m[1]}  → var(--z-…)`);
      }
    }
    if (/<button|ui-btn/.test(satir) && /\bh-(7|9|10|11|12)\b/.test(satir)) dugmeSapma++;
  });
}

if (dugmeSapma > DUGME_SAPMA_TAVAN) {
  hatalar.push(`düğme boyu: elle h-7/h-9/h-10/h-11/h-12 düğme ${dugmeSapma} (tavan ${DUGME_SAPMA_TAVAN}) → Button bileşeni ya da .ui-btn (h-8)`);
}

if (hatalar.length) {
  console.error(`Tasarım denetimi: ${hatalar.length} sorun\n` + hatalar.join('\n'));
  process.exit(1);
}
console.log(`Tasarım denetimi geçti (elle boylu düğme: ${dugmeSapma}/${DUGME_SAPMA_TAVAN}).`);
