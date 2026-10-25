// ============================================================================
// HIZ (Aşama 84): TARİH BİÇİMLENDİRME VE TÜRKÇE SIRALAMA ÖNBELLEĞİ
// Tarayıcı, `tarih.toLocaleDateString('tr-TR', {...})` ve `a.localeCompare(b, 'tr')` her çağrıldığında
// arka planda yeni bir biçimlendirici / karşılaştırıcı kurar. Listelerde (yüzlerce ödev, öğrenci) bu
// her çizimde binlerce kez olur ve telefonu kasar (ölçümde tek bir aramada ~1,2 sn).
// Burada aynı dil ve seçenekler için kurulan biçimlendirici bir kez oluşturulup tekrar kullanılır.
// Sonuçlar birebir aynıdır; beklenmeyen bir durumda tarayıcının kendi yöntemi kullanılır.
// ============================================================================

const MAX_ENTRIES = 200;
const dtfCache = new Map<string, Intl.DateTimeFormat>();
const collatorCache = new Map<string, Intl.Collator>();

const DATE_FIELDS = ['weekday', 'year', 'month', 'day'];
const TIME_FIELDS = ['dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits'];

function isPlainOptions(o: unknown): o is Record<string, unknown> | undefined {
  return o === undefined || (o !== null && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype);
}
function isSimpleLocale(l: unknown): l is string | undefined {
  return l === undefined || typeof l === 'string';
}
function keyOf(locale: string | undefined, kind: string, opts: Record<string, unknown> | undefined): string {
  return `${kind}|${locale || ''}|${opts ? JSON.stringify(opts) : ''}`;
}
function remember<T>(map: Map<string, T>, key: string, make: () => T): T {
  let v = map.get(key);
  if (v === undefined) {
    if (map.size >= MAX_ENTRIES) map.clear();
    v = make();
    map.set(key, v);
  }
  return v;
}

/** ECMA-402 ToDateTimeOptions: toLocaleDateString / TimeString / String varsayılan alanları */
function withDefaults(opts: Record<string, unknown> | undefined, required: 'date' | 'time' | 'any', defaults: 'date' | 'time' | 'all') {
  const o: Record<string, unknown> = { ...(opts || {}) };
  if (o.dateStyle !== undefined || o.timeStyle !== undefined) return null; // nadir: tarayıcının kendi yöntemi
  let need = true;
  if (required === 'date' || required === 'any') for (const f of DATE_FIELDS) if (o[f] !== undefined) need = false;
  if (required === 'time' || required === 'any') for (const f of TIME_FIELDS) if (o[f] !== undefined) need = false;
  if (need && (defaults === 'date' || defaults === 'all')) {
    o.year = 'numeric';
    o.month = 'numeric';
    o.day = 'numeric';
  }
  if (need && (defaults === 'time' || defaults === 'all')) {
    o.hour = 'numeric';
    o.minute = 'numeric';
    o.second = 'numeric';
  }
  return o;
}

let installed = false;
export function installIntlCache(): void {
  if (installed || typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') return;
  installed = true;

  const dp = Date.prototype as any;
  const origDate = dp.toLocaleDateString as (l?: any, o?: any) => string;
  const origTime = dp.toLocaleTimeString as (l?: any, o?: any) => string;
  const origString = dp.toLocaleString as (l?: any, o?: any) => string;

  const make = (orig: (l?: any, o?: any) => string, kind: 'date' | 'time' | 'any', defaults: 'date' | 'time' | 'all') =>
    function (this: Date, locales?: any, options?: any): string {
      try {
        if (!(this instanceof Date) || !isSimpleLocale(locales) || !isPlainOptions(options) || isNaN(this.getTime())) {
          return orig.call(this, locales, options);
        }
        const key = keyOf(locales, kind, options);
        let fmt = dtfCache.get(key);
        if (fmt === undefined) {
          const o = withDefaults(options, kind, defaults);
          if (!o) return orig.call(this, locales, options);
          fmt = remember(dtfCache, key, () => new Intl.DateTimeFormat(locales, o));
        }
        return fmt.format(this);
      } catch {
        return orig.call(this, locales, options);
      }
    };

  dp.toLocaleDateString = make(origDate, 'date', 'date');
  dp.toLocaleTimeString = make(origTime, 'time', 'time');
  dp.toLocaleString = make(origString, 'any', 'all');

  if (typeof Intl.Collator === 'function') {
    const sp = String.prototype as any;
    const origCompare = sp.localeCompare as (that: string, l?: any, o?: any) => number;
    sp.localeCompare = function (this: string, that: string, locales?: any, options?: any): number {
      try {
        // Dil verilmeyen çağrılar tarayıcının kendi (hızlı) yolundan gider
        if (locales === undefined || typeof locales !== 'string' || !isPlainOptions(options)) {
          return origCompare.call(this, that, locales, options);
        }
        const key = keyOf(locales, 'cmp', options);
        const col = remember(collatorCache, key, () => new Intl.Collator(locales, options));
        return col.compare(String(this), String(that));
      } catch {
        return origCompare.call(this, that, locales, options);
      }
    };
  }
}
