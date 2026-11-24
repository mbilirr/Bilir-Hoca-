// Aşama 347: TASARIM DENETİMİ. Paket öncesi ve GitHub denetiminde çalışır (npm run denetim:tasarim).
// Kurallar (index.css'teki ölçekler):
//   1) Sabit piksel punto yok: text-[11px] yerine text-3xs / 2xs / xs / sm / base …
//   2) Rastgele katman sayısı yok: z-[80] / z-[9999] yerine z-(--z-pencere) gibi katman adları
//      (sayfa içi küçük sayılar z-10…z-50 serbest)
//   3) transition-all yok (transition, transition-colors, transition-[width] …)
//   4) Köşe ölçüsü: rounded-md ve rounded-3xl yok (kutu xl/2xl, düğme lg, hap full)
//   5) Aşama 352: DÜĞME AİLESİ. Her <button> ortak sınıflardan birini taşır (.ui-btn ailesi, .ui-btn-mini,
//      .ui-input-btn, .ui-link, .ui-chip-x, .ui-seg-btn, .ui-secim; ana sayfa ak-btn / od-link / lnk; giriş auth-…).
//      Boy her zaman 32 px: düğmede h-7 / h-9 / h-10 / h-11 / h-12 yok (telefonda h-9 + sm:h-8 menü satırı hariç).
//      Elle yazılmış eylem düğmesi (iç boşluk + zemin/çerçeve + köşe, ortak sınıf yok) yasak.
//      Satır, kart, takvim hücresi gibi tıklanan YÜZEYLER düğme sayılmaz (w-full / text-left / flex-col / grid);
//      ailenin dışında kalması gereken özel düğme data-serbest="neden" taşır.
//   6) Aşama 351: elle pencere yok. "fixed inset-0" yalnız ortak kabukta ve pencere olmayan katmanlarda
//      (açılır menü zemini, alt menü çekmecesi, komut paleti, geçiş perdesi). Yeni pencere = ui/kit Modal.
//   7) Aşama 353: sayfa içi geçici yazı ("Kaydedildi", "E-posta gönderildi") ortak bildirimdedir:
//      const setNotice = useBildirimKanali() (lib/bildirim). useAutoDismiss ile kendi şeridini tutmak yasak
//      (yalnız SMS deneme sonucu gibi uzun teknik çıktı istisna). Formdaki alan hataları yerinde kalır.
//   8) Aşama 370: düz React.lazy yok. Parçalar lazyNamed (lib/lazyLoad) ile yüklenir: yeni sürüm yayınlanınca eski
//      parça sunucuda yoksa sayfa bir kez kendiliğinden yenilenir (düz lazy'de bölüm boş / hata ekranı kalırdı).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const KOK = new URL('..', import.meta.url).pathname;

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

const PENCERE_IZINLI = new Set([
  'src/components/ui/kit.tsx', // Modal kabuğu
  'src/components/ui/MoreMenu.tsx', // açılır menü zemini
  'src/components/Layout/BottomNav.tsx', // alt menü çekmecesi
  'src/components/Layout/CommandPalette.tsx', // komut paleti
  'src/components/Layout/KullaniciGozuSeridi.tsx', // geçiş perdesi
  'src/components/Layout/KurumSecici.tsx', // geçiş perdesi
]);

// ---- Aşama 352: düğme etiketleri (çok satırlı etiketler de bütün olarak okunur)
const ORTAK_DUGME = /(?<![\w-])(ui-[\w-]+|ak-btn[\w-]*|od-link|lnk|auth-[\w-]+)(?![\w-])/;
const YUZEY = /(?<![\w:-])(w-full|text-left|flex-col|flex-1|block|grid|aspect-square)(?![\w-])/;
const DOLU = /(?<![\w:-])bg-(brand|success|danger|warning|fg)(?![\w/-])[\s\S]*text-(white|canvas)\b|text-(white|canvas)\b[\s\S]*(?<![\w:-])bg-(brand|success|danger|warning|fg)(?![\w/-])/;
const ELLE = (c) =>
  /(?<![\w:-])px-\d/.test(c) && /(?<![\w:-])(bg-(?!transparent)[\w-]+|border)(?![\w-])/.test(c) && /rounded-(lg|xl|full)\b/.test(c);
const BOY_DISI = /(?<![\w:-])h-(7|9|10|11|12)(?![\w-])/;
/** yorumları aynı uzunlukta boşlukla değiştir (satır numarası kaymaz) */
const yorumsuz = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^(\s*)\/\/.*$/gm, (m) => m.replace(/[^\n]/g, ' '));
function etiketSonu(t, i) {
  let d = 0;
  let q = null;
  for (; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === q && t[i - 1] !== '\\') q = null;
    } else if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '{') d++;
    else if (c === '}') d--;
    else if (c === '>' && d === 0) return i;
  }
  return -1;
}
function dugmeDenetimi(rel, metin, hatalar) {
  const t = yorumsuz(metin);
  const ortakKit = rel.split('\\').join('/').startsWith('src/components/ui/');
  for (const m of t.matchAll(/<button\b/g)) {
    const son = etiketSonu(t, m.index + 7);
    if (son < 0) continue;
    const etiket = t.slice(m.index, son + 1);
    const satir = t.slice(0, m.index).split('\n').length;
    const serbest = etiket.match(/data-serbest=(?:"([^"]*)"|\{)/);
    if (serbest) {
      if (serbest[1] !== undefined && !serbest[1].trim()) hatalar.push(`${rel}:${satir}  data-serbest boş  → nedenini yazın ("takvim hücresi" gibi)`);
      continue;
    }
    const sinif = (etiket.match(/className=(?:"[^"]*"|\{[\s\S]*)/) || [''])[0];
    if (BOY_DISI.test(sinif) && !/\bsm:h-8\b/.test(sinif)) {
      hatalar.push(`${rel}:${satir}  düğme boyu: ${sinif.match(BOY_DISI)[0]}  → .ui-btn (32 px) ya da ui-btn-mini / ui-input-btn`);
    }
    if (!ortakKit && !ORTAK_DUGME.test(sinif) && ELLE(sinif) && (!YUZEY.test(sinif) || (/\bw-full\b/.test(sinif) && /\bsm:w-auto\b/.test(sinif)) || (DOLU.test(sinif) && !/\btext-left\b/.test(sinif)))) {
      hatalar.push(`${rel}:${satir}  elle düğme  → Button / .ui-btn, seçim için .ui-secim ya da .ui-seg-btn`);
    }
  }
}

// Aşama 353: kendi geçici şeridini tutmasına izin verilen dosyalar (gerekçeli)
const GECICI_YAZI_IZINLI = new Set([
  'src/components/Admin/bildirim/SmsKutusu.tsx', // Aşama 377 (eski NotificationPolicyPanel) SMS deneme sonucu: ham sağlayıcı yanıtı 90 sn ekranda kalır
]);

const hatalar = [];
for (const p of dosyalar(join(KOK, 'src'))) {
  const rel = relative(KOK, p);
  const metin = readFileSync(p, 'utf8');
  if (p.endsWith('.tsx')) dugmeDenetimi(rel, metin, hatalar);
  const satirlar = metin.split('\n');
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
    // sınıf sabitlerindeki ortak düğme de 32 px kalır (const BTN = 'ui-btn … h-9' gibi)
    if (p.endsWith(".tsx") === false || !/<button/.test(satir)) if (/\bui-btn\b/.test(satir) && BOY_DISI.test(satir) && !/\bsm:h-8\b/.test(satir)) {
      hatalar.push(`${rel}:${i + 1}  düğme boyu: ${satir.match(BOY_DISI)[0]}  → .ui-btn kendi boyunu verir (32 px)`);
    }
    if (/\.tsx?$/.test(p) && /(?<![\w.])lazy\(/.test(satir) && rel.split('\\').join('/') !== 'src/lib/lazyLoad.tsx') {
      hatalar.push(`${rel}:${i + 1}  düz React.lazy  → lazyNamed(() => import('…'), 'Ad') (lib/lazyLoad)`);
    }
    if (p.endsWith('.tsx') && /\buseAutoDismiss\(/.test(satir) && !GECICI_YAZI_IZINLI.has(rel.split('\\').join('/'))) {
      hatalar.push(`${rel}:${i + 1}  sayfa içi geçici yazı: useAutoDismiss  → const setNotice = useBildirimKanali() (lib/bildirim)`);
    }
    if (p.endsWith('.tsx') && /\bfixed inset-0\b/.test(satir) && !PENCERE_IZINLI.has(rel.split('\\').join('/'))) {
      hatalar.push(`${rel}:${i + 1}  elle pencere: fixed inset-0  → ui/kit Modal (ust, baslikSag, footer, govdeClass)`);
    }
  });
}

if (hatalar.length) {
  console.error(`Tasarım denetimi: ${hatalar.length} sorun\n` + hatalar.join('\n'));
  process.exit(1);
}
console.log('Tasarım denetimi geçti (düğme ailesi tam, elle pencere yok, geçici yazılar ortak bildirimde).');
