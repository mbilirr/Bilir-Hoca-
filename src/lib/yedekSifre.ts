// ============================================================================
// Aşama 345: ŞİFRELİ YEDEK DOSYASI (.biliryedek)
// Yedeğin içinde bütün öğrenci bilgisi, telefonlar, notlar ve yoklama var; eskiden .xlsx ve .json açık iniyordu.
// Artık iki dosya tek bir şifreli dosyaya konur. Şifreleme tarayıcıda yapılır, parola hiçbir yere gönderilmez ve
// saklanmaz; unutulursa dosya açılamaz.
//  - Anahtar: PBKDF2-SHA256 (600.000 tur, rastgele 16 bayt tuz) → AES-256-GCM (rastgele 12 bayt iv).
//    GCM, dosyada tek bayt değişse bile açmayı reddeder (bozulma / kurcalama fark edilir).
//  - Sıkıştırma: tarayıcı destekliyorsa gzip (yedek çoğunlukla 5–10 kat küçülür).
// Dosya düzeni: "BILIRYEDEK1\n" + başlık (JSON, tek satır) + "\n" + şifreli veri.
// Başlıkta kişisel bilgi yoktur (yalnız tarih, sürüm, tuz, iv). Yönetim › Yedek ve bakım › "Şifreli yedeği aç".
// ============================================================================

const SIHIR = 'BILIRYEDEK1\n';
const TUR = 600_000;
export const YEDEK_PAROLA_EN_AZ = 10;

export interface YedekDosya {
  ad: string;
  tur: string;
  veri: Uint8Array;
}

interface Baslik {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  tur: number;
  tuz: string;
  iv: string;
  gz: boolean;
  tarih: string;
}

const yaz = new TextEncoder();
const oku = new TextDecoder();

const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64Coz = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function akisla(veri: Uint8Array, akis: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const cikti = new Blob([veri as BlobPart]).stream().pipeThrough(akis as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(cikti).arrayBuffer());
}

async function anahtarTuret(parola: string, tuz: Uint8Array, tur: number): Promise<CryptoKey> {
  const ham = await crypto.subtle.importKey('raw', yaz.encode(parola.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: tuz as BufferSource, iterations: tur },
    ham,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Parola kuralı: en az 10 karakter; boşluk olabilir (cümle parolası). Hata yazısı ya da null. */
export function yedekParolaHatasi(parola: string, tekrar: string): string | null {
  if (parola.length < YEDEK_PAROLA_EN_AZ) return `Parola en az ${YEDEK_PAROLA_EN_AZ} karakter olmalı.`;
  if (parola !== tekrar) return 'İki parola aynı değil.';
  return null;
}

/** Dosyaları tek şifreli pakete koyar. */
export async function sifreliPaketle(dosyalar: YedekDosya[], parola: string): Promise<Blob> {
  if (!crypto?.subtle) throw new Error('Bu tarayıcı şifrelemeyi desteklemiyor; güncel Chrome, Edge ya da Safari kullanın.');
  const liste = dosyalar.map((d) => ({ ad: d.ad, tur: d.tur, boy: d.veri.length }));
  const listeBayt = yaz.encode(JSON.stringify(liste));
  const ham = new Uint8Array(4 + listeBayt.length + dosyalar.reduce((a, d) => a + d.veri.length, 0));
  new DataView(ham.buffer).setUint32(0, listeBayt.length);
  ham.set(listeBayt, 4);
  let yer = 4 + listeBayt.length;
  for (const d of dosyalar) {
    ham.set(d.veri, yer);
    yer += d.veri.length;
  }
  const gz = typeof CompressionStream !== 'undefined';
  const duz = gz ? await akisla(ham, new CompressionStream('gzip')) : ham;
  const tuz = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const anahtar = await anahtarTuret(parola, tuz, TUR);
  const sifreli = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, anahtar, duz as BufferSource));
  const baslik: Baslik = { v: 1, kdf: 'PBKDF2-SHA256', tur: TUR, tuz: b64(tuz), iv: b64(iv), gz, tarih: new Date().toISOString() };
  return new Blob([SIHIR, JSON.stringify(baslik), '\n', sifreli as BlobPart], { type: 'application/octet-stream' });
}

/** Şifreli yedeği açar; parola yanlışsa ya da dosya bozuksa anlaşılır bir hata verir. */
export async function sifreliAc(dosya: Blob, parola: string): Promise<{ tarih: string; dosyalar: YedekDosya[] }> {
  const tum = new Uint8Array(await dosya.arrayBuffer());
  if (oku.decode(tum.subarray(0, SIHIR.length)) !== SIHIR) throw new Error('Bu dosya bir biliredu şifreli yedeği değil.');
  const satirSonu = tum.indexOf(10, SIHIR.length);
  if (satirSonu < 0) throw new Error('Yedek dosyası bozuk.');
  let baslik: Baslik;
  try {
    baslik = JSON.parse(oku.decode(tum.subarray(SIHIR.length, satirSonu)));
  } catch {
    throw new Error('Yedek dosyası bozuk.');
  }
  if (baslik.v !== 1 || baslik.kdf !== 'PBKDF2-SHA256') throw new Error('Bu yedek daha yeni bir sürümle alınmış; sistemi güncelleyin.');
  const anahtar = await anahtarTuret(parola, b64Coz(baslik.tuz), Number(baslik.tur) || TUR);
  let duz: Uint8Array;
  try {
    duz = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64Coz(baslik.iv) as BufferSource }, anahtar, tum.subarray(satirSonu + 1) as BufferSource)
    );
  } catch {
    throw new Error('Parola yanlış ya da dosya bozulmuş.');
  }
  if (baslik.gz) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Bu tarayıcı yedeği açamıyor; güncel Chrome, Edge ya da Safari kullanın.');
    duz = await akisla(duz, new DecompressionStream('gzip'));
  }
  const listeBoy = new DataView(duz.buffer, duz.byteOffset, duz.byteLength).getUint32(0);
  const liste = JSON.parse(oku.decode(duz.subarray(4, 4 + listeBoy))) as Array<{ ad: string; tur: string; boy: number }>;
  let yer = 4 + listeBoy;
  const dosyalar = liste.map((l) => {
    const veri = duz.slice(yer, yer + l.boy);
    yer += l.boy;
    return { ad: l.ad, tur: l.tur, veri };
  });
  return { tarih: baslik.tarih, dosyalar };
}
