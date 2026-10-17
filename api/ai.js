// ============================================================================
// YAPAY ZEKÂ SERVİSİ (Aşama 48) — Vercel sunucu fonksiyonu: /api/ai
//
// Deneme Analizi için üç iş yapar:
//   program  : MEB öğretim programı metninden (PDF'ten tarayıcıda çıkarılır) 8. sınıf kazanımlarını çıkarır
//   pages    : taranmış kitapçığın küçük sayfa resimlerinden hangi sayfanın hangi derse ait olduğunu
//              ve sayfada görünen soru numaralarını bulur
//   classify : tek bir kitapçık sayfasındaki her soru için kazanım, konu ve alt kazanım önerir
//
// Mahremiyet: Bu servise öğrenci adı, numarası, cevabı ya da sonucu GÖNDERİLMEZ ve kabul edilmez.
// Yalnızca öğretim programı metni, kitapçık sayfası resimleri, ders adları ve kazanım listesi gider.
//
// Yetki: Yalnızca Deneme Analizi'ni kullanabilen kişiler (genel yönetici ve bölümü açılmış kurum
// yöneticileri) çağırabilir. Yetki, kişinin kendi oturumuyla veritabanındaki deneme_can_manage()
// işleviyle denetlenir.
//
// Vercel ortam değişkenleri (Settings > Environment Variables):
//   GEMINI_API_KEY   (ana seçenek)  aistudio.google.com > Get API key
//   MISTRAL_API_KEY  (yedek)        console.mistral.ai > API Keys
//   İsteğe bağlı: GEMINI_MODEL (varsayılan gemini-flash-latest), MISTRAL_MODEL (varsayılan mistral-small-latest)
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY zaten tanımlı (uygulamanın kendi ayarları)
//
// Anahtarlar yalnızca sunucuda kalır; tarayıcıya hiçbir zaman gönderilmez.
// Hiçbir ek paket gerektirmez.
// ============================================================================

export const config = { maxDuration: 60 };

const DEFAULT_SUPABASE_URL = 'https://zzdchsxfjzedgciejuxd.supabase.co';
const PROVIDER_TIMEOUT_MS = 54000;
const MAX_IMAGES_BYTES = 3_300_000; // bir istekteki resimlerin toplamı (Vercel isteği en çok ~4,5 MB olabilir)
const MAX_IMAGES = 10;
const MAX_PROGRAM_CHARS = 40000;
const MAX_KAZANIM = 400;
const PER_MINUTE_LIMIT = 40; // bir kişinin dakikada en çok bu kadar istek göndermesi (kötüye kullanıma karşı)

// LGS dersleri (anahtarlar uygulamadaki ile aynı)
const SUBJECTS = {
  tr: 'Türkçe',
  sos: 'T.C. İnkılap Tarihi ve Atatürkçülük',
  din: 'Din Kültürü ve Ahlak Bilgisi',
  ing: 'Yabancı Dil (İngilizce)',
  mat: 'Matematik',
  fen: 'Fen Bilimleri',
};

function env() {
  return {
    url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    anon: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    gemini: (process.env.GEMINI_API_KEY || '').trim(),
    mistral: (process.env.MISTRAL_API_KEY || '').trim(),
    geminiModel: (process.env.GEMINI_MODEL || '').trim(),
    mistralModel: (process.env.MISTRAL_MODEL || '').trim(),
  };
}

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// ----------------------------------------------------------------------------- Yetki
async function getCaller(req) {
  const e = env();
  if (!e.anon) throw new HttpError(503, 'Sunucu ayarları eksik (VITE_SUPABASE_ANON_KEY).');
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Oturum bulunamadı. Lütfen yeniden giriş yapın.');
  const ur = await fetch(`${e.url}/auth/v1/user`, { headers: { apikey: e.anon, Authorization: `Bearer ${token}` } });
  if (!ur.ok) throw new HttpError(401, 'Oturum süresi dolmuş. Lütfen yeniden giriş yapın.');
  const user = await ur.json();
  if (!user || !user.id) throw new HttpError(401, 'Oturum süresi dolmuş. Lütfen yeniden giriş yapın.');
  // Deneme Analizi yetkisi: kişinin kendi oturumuyla veritabanı işlevi
  const cr = await fetch(`${e.url}/rest/v1/rpc/deneme_can_manage`, {
    method: 'POST',
    headers: { apikey: e.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  let can = false;
  try {
    can = cr.ok && (await cr.json()) === true;
  } catch {
    can = false;
  }
  if (!can) throw new HttpError(403, 'Bu işlem için Deneme Analizi yetkiniz yok.');
  return { id: user.id };
}

// Basit hız sınırı (sunucu örneği başına)
const hits = new Map();
function rateLimit(userId) {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter((t) => now - t < 60000);
  if (list.length >= PER_MINUTE_LIMIT) throw new HttpError(429, 'Çok hızlı istek gönderildi. Bir dakika bekleyip tekrar deneyin.', { code: 'rate' });
  list.push(now);
  hits.set(userId, list);
  if (hits.size > 500) for (const k of hits.keys()) if (k !== userId) hits.delete(k);
}

// ----------------------------------------------------------------------------- Yardımcılar
const clean = (v, max) =>
  String(v === null || v === undefined ? '' : v)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const codeKey = (c) => clean(c, 80).replace(/\s+/g, '').replace(/\.+$/, '').toLocaleUpperCase('tr-TR');
const subjectKeyOf = (v) => {
  const k = clean(v, 10).toLowerCase();
  return Object.prototype.hasOwnProperty.call(SUBJECTS, k) ? k : '';
};

async function withTimeout(url, opts) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new HttpError(504, 'Yapay zekâ zamanında yanıt vermedi.', { code: 'timeout' });
    throw new HttpError(502, 'Yapay zekâ servisine ulaşılamadı.', { code: 'network' });
  } finally {
    clearTimeout(t);
  }
}

function parseJsonLoose(text) {
  const s = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '');
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function readImages(list) {
  const arr = Array.isArray(list) ? list.slice(0, MAX_IMAGES) : [];
  let total = 0;
  const out = [];
  for (const img of arr) {
    const mime = img && img.mime === 'image/png' ? 'image/png' : img && img.mime === 'image/jpeg' ? 'image/jpeg' : '';
    const data = img && typeof img.data === 'string' ? img.data.replace(/^data:[^,]*,/, '') : '';
    if (!mime || !data || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) throw new HttpError(400, 'Sayfa görüntüsü eksik ya da hatalı.');
    total += Math.floor((data.length * 3) / 4);
    out.push({ mime, data, page: Math.max(0, Math.min(999, Number(img.page) || 0)) });
  }
  if (!out.length) throw new HttpError(400, 'Sayfa görüntüsü eksik.');
  if (total > MAX_IMAGES_BYTES) throw new HttpError(413, 'Sayfa görüntüleri çok büyük.', { code: 'size' });
  return out;
}

// ----------------------------------------------------------------------------- Sağlayıcılar
// Düşünme süresi ayarları (hız için). Model sürümüne göre farklı ayar kabul edilir:
// Gemini 3: thinkingLevel; Gemini 2.5: thinkingBudget. Kabul edilmeyen ayar atlanır ve hatırlanır.
const THINKING = {
  fast: [{ thinkingLevel: 'minimal' }, { thinkingBudget: 0 }, null],
  normal: [{ thinkingLevel: 'low' }, { thinkingBudget: 512 }, null],
};
const thinkingStart = new Map(); // `${model}|${mode}` → ilk denenecek ayarın sırası

// Ortak çağrı: sistem metni + kullanıcı metni + resimler → yapay zekânın metin yanıtı
async function callGemini(e, system, prompt, images, mode = 'normal') {
  const models = Array.from(new Set([e.geminiModel, 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean)));
  const options = THINKING[mode] || THINKING.normal;
  let lastErr = null;
  for (const model of models) {
    const memo = `${model}|${mode}`;
    for (let ti = thinkingStart.get(memo) || 0; ti < options.length; ti++) {
      const generationConfig = { responseMimeType: 'application/json' };
      if (options[ti]) generationConfig.thinkingConfig = options[ti];
      const parts = [{ text: prompt }];
      for (const img of images) parts.push({ inlineData: { mimeType: img.mime, data: img.data } });
      const r = await withTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': e.gemini },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig }),
      });
      const text = await r.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      if (r.ok) {
        const cand = data && data.candidates && data.candidates[0];
        const out = ((cand && cand.content && cand.content.parts) || [])
          .filter((p) => p && typeof p.text === 'string' && !p.thought)
          .map((p) => p.text)
          .join('');
        if (!out) {
          const reason = data && data.promptFeedback && data.promptFeedback.blockReason;
          throw new HttpError(502, reason ? 'Gemini bu içeriği işlemeyi reddetti.' : 'Gemini boş yanıt verdi.', { code: 'empty' });
        }
        thinkingStart.set(memo, ti);
        return { model, text: out, truncated: !!(cand && cand.finishReason === 'MAX_TOKENS') };
      }
      const msg = String((data && data.error && data.error.message) || text || '').slice(0, 300);
      if (options[ti] && r.status === 400 && /think|budget|level/i.test(msg)) {
        thinkingStart.set(memo, ti + 1); // bu düşünme ayarı desteklenmiyor: sıradakini dene
        continue;
      }
      if (r.status === 404) {
        lastErr = new HttpError(502, `Gemini modeli bulunamadı (${model}).`, { code: 'model' });
        break; // sıradaki modeli dene
      }
      if (r.status === 429) throw new HttpError(429, 'Gemini ücretsiz kullanım sınırı doldu.', { code: 'quota' });
      if (r.status === 400 && /api key/i.test(msg)) throw new HttpError(503, 'Gemini API anahtarı geçersiz. Vercel\'deki GEMINI_API_KEY değerini kontrol edin.', { code: 'no-key' });
      if (r.status === 401 || r.status === 403) throw new HttpError(503, 'Gemini anahtarı bu işlem için yetkili değil. Vercel\'deki GEMINI_API_KEY değerini kontrol edin.', { code: 'no-key' });
      if (r.status >= 500) throw new HttpError(502, 'Gemini şu an yanıt veremiyor.', { code: 'provider' });
      console.error('[ai] gemini', r.status, msg);
      throw new HttpError(502, 'Gemini isteği kabul etmedi.', { code: 'provider' });
    }
  }
  throw lastErr || new HttpError(502, 'Gemini modeli bulunamadı.', { code: 'model' });
}

async function callMistral(e, system, prompt, images) {
  const models = Array.from(new Set([e.mistralModel, 'mistral-small-latest', 'mistral-medium-latest'].filter(Boolean)));
  let lastErr = null;
  for (const model of models) {
    const content = images.length
      ? [{ type: 'text', text: prompt }, ...images.map((img) => ({ type: 'image_url', image_url: `data:${img.mime};base64,${img.data}` }))]
      : prompt;
    const r = await withTimeout('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.mistral}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 12000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
      }),
    });
    const text = await r.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (r.ok) {
      const ch = data && data.choices && data.choices[0];
      const c = ch && ch.message && ch.message.content;
      const out = Array.isArray(c) ? c.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('') : String(c || '');
      if (!out) throw new HttpError(502, 'Mistral boş yanıt verdi.', { code: 'empty' });
      return { model, text: out, truncated: !!(ch && ch.finish_reason === 'length') };
    }
    const msg = String((data && (data.message || (data.error && data.error.message))) || text || '').slice(0, 300);
    if (r.status === 404 || (r.status === 400 && /invalid model|model.*not/i.test(msg))) {
      lastErr = new HttpError(502, `Mistral modeli bulunamadı (${model}).`, { code: 'model' });
      continue;
    }
    if (r.status === 429) throw new HttpError(429, 'Mistral kullanım sınırı doldu.', { code: 'quota' });
    if (r.status === 401 || r.status === 403) throw new HttpError(503, 'Mistral API anahtarı geçersiz. Vercel\'deki MISTRAL_API_KEY değerini kontrol edin.', { code: 'no-key' });
    if (r.status >= 500) throw new HttpError(502, 'Mistral şu an yanıt veremiyor.', { code: 'provider' });
    console.error('[ai] mistral', r.status, msg);
    throw new HttpError(502, 'Mistral isteği kabul etmedi.', { code: 'provider' });
  }
  throw lastErr || new HttpError(502, 'Mistral modeli bulunamadı.', { code: 'model' });
}

async function ask(body, system, prompt, images, mode = 'normal') {
  const e = env();
  const provider = body.provider === 'mistral' ? 'mistral' : 'gemini';
  if (provider === 'gemini' && !e.gemini) throw new HttpError(503, 'Gemini anahtarı tanımlı değil (Vercel > GEMINI_API_KEY).', { code: 'no-key' });
  if (provider === 'mistral' && !e.mistral) throw new HttpError(503, 'Mistral anahtarı tanımlı değil (Vercel > MISTRAL_API_KEY).', { code: 'no-key' });
  const out = provider === 'mistral' ? await callMistral(e, system, prompt, images) : await callGemini(e, system, prompt, images, mode);
  const parsed = parseJsonLoose(out.text);
  if (!parsed || typeof parsed !== 'object') {
    throw new HttpError(502, out.truncated ? 'Yapay zekânın yanıtı çok uzun olduğu için kesildi.' : 'Yapay zekânın yanıtı okunamadı.', { code: out.truncated ? 'long' : 'parse' });
  }
  return { provider, model: out.model, parsed };
}

const SUBJECT_LIST = Object.entries(SUBJECTS)
  .map(([k, v]) => `${k} = ${v}`)
  .join(', ');

// ----------------------------------------------------------------------------- 1) Öğretim programından kazanımlar
const PROGRAM_SYSTEM = [
  'Sen MEB öğretim programlarını çok iyi bilen bir eğitim uzmanısın.',
  'Sana bir öğretim programı PDF\'inden çıkarılmış metnin bir bölümü verilir (satırlar bozuk ya da bölünmüş olabilir).',
  'Görevin: metinde geçen, istenen sınıf düzeyine ait KAZANIMLARI eksiksiz ve aynen çıkarmak.',
  'Kurallar:',
  '- Yalnızca metinde gerçekten bulunan kazanımları yaz; kendinden kazanım uydurma.',
  '- "kod": kazanımın programdaki kodu, aynen (ör. F.8.1.1.1., T.8.3.5., M.8.1.2.3., İTA.8.2.1., 8.1.1., E8.1.R1.).',
  '- "kazanim": kazanım cümlesinin tamamı; a), b), c) ile başlayan açıklamaları ve sınırlamaları EKLEME.',
  '- "konu": kazanımın bağlı olduğu konu ya da ünite adı, kısa (ör. "Mevsimler ve İklim", "Çarpanlar ve Katlar", "Söz Varlığı").',
  '- "ders": şu anahtarlardan biri: ' + SUBJECT_LIST + '.',
  '- Başka sınıfların kazanımlarını, genel amaçları, açıklamaları ve tabloları alma.',
  '- Yalnızca şu biçimde JSON döndür: {"kazanimlar":[{"ders":"fen","kod":"","kazanim":"","konu":""}]}',
].join('\n');

async function actionProgram(body) {
  const text = String(body.text || '').slice(0, MAX_PROGRAM_CHARS);
  if (text.replace(/\s+/g, '').length < 50) throw new HttpError(400, 'Öğretim programı metni boş.');
  const grade = clean(body.grade, 4) || '8';
  const hint = subjectKeyOf(body.subject);
  const prompt = [
    `Sınıf düzeyi: ${grade}. sınıf. Yalnızca ${grade}. sınıf kazanımlarını çıkar.`,
    hint ? `Bu metin "${SUBJECTS[hint]}" öğretim programıdır; "ders" alanına "${hint}" yaz.` : 'Dersi metinden anla.',
    '',
    'Metin:',
    text,
  ].join('\n');
  const { provider, model, parsed } = await ask(body, PROGRAM_SYSTEM, prompt, []);
  const raw = Array.isArray(parsed.kazanimlar) ? parsed.kazanimlar : [];
  const seen = new Set();
  const items = [];
  for (const it of raw.slice(0, 500)) {
    const ders = hint || subjectKeyOf(it && it.ders);
    const kod = clean(it && it.kod, 60).replace(/\s+/g, '');
    const kazanim = clean(it && it.kazanim, 2000);
    if (!ders || !kod || !/\d/.test(kod) || kazanim.length < 8) continue;
    const k = codeKey(kod);
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ ders, kod: kod.replace(/\.+$/, ''), kazanim, konu: clean(it.konu, 200) });
  }
  return { ok: true, provider, model, items };
}

// ----------------------------------------------------------------------------- 2) Kitapçık sayfalarını tanıma
const PAGES_SYSTEM = [
  'Sen LGS deneme kitapçıklarını inceleyen bir uzmansın.',
  'Sana kitapçıktan sırayla birkaç sayfanın resmi verilir; her resmin sayfa numarası metinde yazılıdır.',
  'Görevin: her sayfada HANGİ DERSİN sorularının bulunduğunu ve sayfada görünen SORU NUMARALARINI bulmak.',
  'Kurallar:',
  '- Ders anahtarları: ' + SUBJECT_LIST + '.',
  '- Ders başlığı sayfada yazmasa da soruların içeriğinden dersi anla.',
  '- Kapak, açıklama, cevap kâğıdı gibi soru olmayan sayfalarda "dersler" boş liste olsun.',
  '- Bir sayfada iki dersin soruları varsa ikisini de yaz.',
  '- "sorular": sayfada numarası görünen soruların numaraları (kitapçıkta yazdığı gibi).',
  '- Yalnızca şu biçimde JSON döndür: {"sayfalar":[{"sayfa":1,"dersler":[{"ders":"tr","sorular":[1,2,3]}]}]}',
].join('\n');

async function actionPages(body) {
  const images = readImages(body.images);
  const prompt = [`Resimler sırasıyla şu sayfalardır: ${images.map((i) => i.page).join(', ')}.`, 'Her sayfa için dersleri ve soru numaralarını yaz.'].join('\n');
  const { provider, model, parsed } = await ask(body, PAGES_SYSTEM, prompt, images, 'fast');
  const raw = Array.isArray(parsed.sayfalar) ? parsed.sayfalar : [];
  const allowedPages = new Set(images.map((i) => i.page));
  const pages = [];
  for (const p of raw.slice(0, 20)) {
    const page = Number(p && p.sayfa);
    if (!allowedPages.has(page)) continue;
    const dersler = [];
    for (const d of Array.isArray(p.dersler) ? p.dersler.slice(0, 4) : []) {
      const ders = subjectKeyOf(d && d.ders);
      if (!ders || dersler.some((x) => x.ders === ders)) continue;
      const nums = (Array.isArray(d.sorular) ? d.sorular : [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0 && n <= 200)
        .slice(0, 40);
      dersler.push({ ders, sorular: Array.from(new Set(nums)).sort((a, b) => a - b) });
    }
    pages.push({ page, dersler });
  }
  return { ok: true, provider, model, pages };
}

// ----------------------------------------------------------------------------- 3) Soru → kazanım
const CLASSIFY_SYSTEM = [
  'Sen Türkiye\'de 8. sınıf (LGS) sorularını MEB öğretim programı kazanımlarına göre sınıflandıran deneyimli bir ölçme-değerlendirme uzmanısın.',
  'Sana bir deneme kitapçığının bir ya da iki sayfasının resmi (sayfa numaraları metinde yazılı), sayfalardaki derslerin bilgisi ve her dersin kazanım listesi verilir.',
  'Görevin: sayfalarda numarası görünen HER soru için sorunun ölçtüğü kazanımı listeden seçmek.',
  '- "sayfa": sorunun bulunduğu sayfanın numarası (metinde verilen sayfa numaralarından biri).',
  'Kurallar:',
  '- Kazanım kodunu YALNIZCA o dersin listesinden seç; listede uygun kazanım yoksa "kod" alanını boş bırak.',
  '- Soru birden çok kazanımı ölçüyorsa en baskın olanı "kod", ikincisini "kod2" yaz (yoksa boş bırak).',
  '- "no": sorunun dersin KENDİ sırasındaki numarası (ders içinde 1\'den başlar). Kitapçıktaki numara farklıysa verilen eşleştirmeyi kullan.',
  '- "konu": sorunun konusu, kısa (en çok 6 kelime), ör. "Mevsimlerin Oluşumu", "Üslü İfadeler", "Paragrafta Anlam".',
  '- "alt": sorunun ölçtüğü beceriyi anlatan kısa ifade (en çok 12 kelime).',
  '- "guven": seçiminden ne kadar eminsin, 0-100 arası tam sayı.',
  '- Soruyu çözme, cevabı yazma. Sayfada soru yoksa boş liste döndür.',
  '- Yalnızca şu biçimde JSON döndür: {"sorular":[{"sayfa":1,"ders":"fen","no":1,"kod":"","kod2":"","konu":"","alt":"","guven":0}]}',
].join('\n');

async function actionClassify(body) {
  const images = readImages(body.image ? [body.image] : body.images).slice(0, 2);
  const subjects = (Array.isArray(body.subjects) ? body.subjects : body.subject ? [body.subject] : []).slice(0, 4);
  const prepared = [];
  for (const s of subjects) {
    const key = subjectKeyOf(s && s.key) || 'x' + prepared.length;
    const name = clean(s && s.name, 80);
    const count = Math.max(1, Math.min(100, Number(s && s.count) || 20));
    if (!name) continue;
    const kaz = (Array.isArray(s.kazanimlar) ? s.kazanimlar.slice(0, MAX_KAZANIM) : [])
      .map((k) => ({ code: clean(k && k.code, 60), konu: clean(k && k.konu, 120), text: clean(k && k.text, 400) }))
      .filter((k) => k.code && k.text);
    prepared.push({ key, name, count, kaz, hint: clean(s.hint, 500) });
  }
  if (!prepared.length) throw new HttpError(400, 'Ders bilgisi eksik.');

  const blocks = prepared.map((s) =>
    [
      `### Ders: ${s.name} (ders anahtarı: "${s.key}")`,
      `Bu dersin soruları ders içinde 1-${s.count} arasında numaralıdır.`,
      s.hint ? `Numara bilgisi: ${s.hint}` : '',
      'Kazanım listesi (kod | konu | kazanım):',
      s.kaz.length ? s.kaz.map((k) => `${k.code} | ${k.konu || '-'} | ${k.text}`).join('\n') : '(liste boş: "kod" alanlarını boş bırak, konu ve alt kazanımı yaz)',
    ]
      .filter(Boolean)
      .join('\n')
  );
  const pageNos = images.map((i) => i.page);
  const prompt = [
    images.length > 1 ? `Resimler sırasıyla şu sayfalardır: ${pageNos.join(', ')}.` : `Resim ${pageNos[0] || 1}. sayfadır.`,
    prepared.length > 1 ? 'Sayfalarda birden çok dersin soruları var. Her sorunun "ders" alanına doğru ders anahtarını yaz.' : `Yalnızca "${prepared[0].name}" dersinin sorularını değerlendir.`,
    '',
    ...blocks,
  ].join('\n');
  const { provider, model, parsed } = await ask(body, CLASSIFY_SYSTEM, prompt, images, 'normal');
  const raw = Array.isArray(parsed.sorular) ? parsed.sorular : Array.isArray(parsed) ? parsed : [];
  const byKey = new Map(prepared.map((s) => [s.key, s]));
  const seen = new Set();
  const items = [];
  for (const it of raw.slice(0, 120)) {
    const s = byKey.get(clean(it && it.ders, 10).toLowerCase()) || (prepared.length === 1 ? prepared[0] : null);
    if (!s) continue;
    const no = Number(it && it.no);
    const sk = `${s.key}:${no}`;
    if (!Number.isInteger(no) || no < 1 || no > s.count || seen.has(sk)) continue;
    seen.add(sk);
    const allowed = new Map(s.kaz.map((k) => [codeKey(k.code), k.code]));
    const kod = allowed.get(codeKey(it.kod)) || '';
    let kod2 = allowed.get(codeKey(it.kod2)) || '';
    if (kod2 === kod) kod2 = '';
    const g = Math.round(Number(it.guven));
    const sp = Number(it.sayfa);
    items.push({
      sayfa: pageNos.includes(sp) ? sp : pageNos[0] || 0,
      ders: s.key,
      no,
      kod,
      kod2,
      konu: clean(it.konu, 120),
      alt: clean(it.alt, 160),
      guven: Number.isFinite(g) ? Math.max(0, Math.min(100, g)) : 50,
    });
  }
  items.sort((a, b) => (a.ders === b.ders ? a.no - b.no : a.ders.localeCompare(b.ders)));
  return { ok: true, provider, model, items };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'ai' });
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Desteklenmeyen istek' });
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body && typeof body === 'object' ? body : {};
    const caller = await getCaller(req);
    if (body.action === 'status') {
      const e = env();
      return res.status(200).json({ ok: true, gemini: !!e.gemini, mistral: !!e.mistral });
    }
    rateLimit(caller.id);
    if (body.action === 'program') return res.status(200).json(await actionProgram(body));
    if (body.action === 'pages') return res.status(200).json(await actionPages(body));
    if (body.action === 'classify') return res.status(200).json(await actionClassify(body));
    throw new HttpError(400, 'Bilinmeyen işlem.');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (!(err instanceof HttpError)) console.error('[ai]', err && err.stack ? err.stack : err);
    return res.status(status).json({
      ok: false,
      error: err instanceof HttpError ? err.message : 'Beklenmeyen bir sunucu hatası oluştu. Lütfen tekrar deneyin.',
      ...((err && err.extra) || {}),
    });
  }
}
