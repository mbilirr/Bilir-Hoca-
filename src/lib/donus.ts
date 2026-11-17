// ============================================================================
// Aşama 303: SEKMEYE / UYGULAMAYA DÖNÜŞ TEK YERDEN
// Sekmeye dönünce tarayıcı art arda hem "görünür oldu" (visibilitychange) hem "odaklandı" (focus) olayı verir.
// Ekranlar bu olayları ayrı ayrı dinlediğinde aynı veri bir dönüşte iki kez okunuyordu. Bu modül iki olayı TEK
// "dönüş"e indirir ve her dinleyiciye ne kadar süre uzakta kalındığını verir. Böylece canlı kanalı açık ekranlar
// kısa dönüşlerde (değişiklik zaten kanaldan gelir) boşuna okuma yapmaz, uzun aradan sonra yine okur.
// ============================================================================

/** Bu süreden uzun ayrılıkta canlı kanal kopmuş olabilir; dönüşte veri yeniden okunur (dataService ile aynı eşik). */
export const UZUN_AYRILIK_MS = 30_000;

type Dinleyici = { fn: (uzaktaMs: number) => void; odak: boolean; son: number };
const dinleyiciler = new Set<Dinleyici>();
let gizlendi = 0; // sekmenin gizlendiği an (0: bu oturumda gizlenmedi)
let odakGitti = 0; // pencere odağının gittiği an
let bagli = false;

function yay(uzakta: number, odakDonusu: boolean) {
  const simdi = Date.now();
  for (const d of Array.from(dinleyiciler)) {
    if (odakDonusu && !d.odak) continue;
    // Aynı dönüşün ikinci olayı (ör. önce odak, hemen ardından görünürlük) dinleyiciyi bir daha çağırmaz
    if (simdi - d.son < 1000) continue;
    d.son = simdi;
    try {
      d.fn(uzakta);
    } catch {
      /* bir dinleyicinin hatası ötekileri durdurmaz */
    }
  }
}

function bagla() {
  if (bagli || typeof document === 'undefined' || typeof window === 'undefined') return;
  bagli = true;
  if (document.visibilityState === 'hidden') gizlendi = Date.now();
  document.addEventListener('visibilitychange', () => {
    const simdi = Date.now();
    if (document.visibilityState !== 'visible') {
      if (!gizlendi) gizlendi = simdi;
      return;
    }
    // Gizlenme görülmediyse (sayfa arka planda açıldıysa) süre bilinmez: uzun ayrılık sayılır
    const uzakta = gizlendi ? simdi - gizlendi : Number.POSITIVE_INFINITY;
    gizlendi = 0;
    odakGitti = 0; // sekme dönüşünün ardından gelen odak olayı ayrı bir dönüş sayılmaz
    yay(uzakta, false);
  });
  window.addEventListener('blur', () => {
    if (!odakGitti) odakGitti = Date.now();
  });
  window.addEventListener('focus', () => {
    // Sekme hâlâ gizliyse görünürlük olayı gelince dönüş oradan sayılır
    if (!odakGitti || document.visibilityState !== 'visible') return;
    const uzakta = Date.now() - odakGitti;
    odakGitti = 0;
    yay(uzakta, true);
  });
}

bagla();

/**
 * Sekmeye (ve `odak: true` ise pencereye) her dönüşte `fn(uzaktaMs)` çağrılır; bir dönüşte en fazla BİR kez.
 * Dönen işlev dinlemeyi bırakır.
 */
export function donusteCalistir(fn: (uzaktaMs: number) => void, secenek: { odak?: boolean } = {}): () => void {
  bagla();
  const d: Dinleyici = { fn, odak: !!secenek.odak, son: 0 };
  dinleyiciler.add(d);
  return () => {
    dinleyiciler.delete(d);
  };
}
