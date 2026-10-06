// ============================================================================
// ESC İLE PENCERE KAPATMA (Aşama 17)
// Yeni pencere bileşeni (ui/kit Modal) Esc ile kapanıyordu; eski pencerelerin çoğu kapanmıyordu.
// Bu küçük yardımcı, Esc'ye basıldığında en üstteki açık pencereyi bulur. Pencereyi kendi kodu
// kapatmadıysa, penceredeki "Kapat / X / İptal / Vazgeç" düğmesine basar; düğme yoksa arka plana
// tıklar. Hiçbir pencereyi değiştirmeden hepsine Esc desteği gelir.
// ============================================================================

const CLOSE_WORDS = /^(kapat|iptal|vazgeç|vazgec|close|cancel|×|x)$/i;
const CLOSE_LABEL = /^\s*(kapat|close|iptal|vazgeç)/i;

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected || el.getClientRects().length === 0) return false;
  const cs = window.getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.position === 'fixed';
}

// Ekranın tamamını kaplayan, en üstte duran pencere arka planı (ekranda gerçekten en önde olan)
function topOverlay(): HTMLElement | null {
  const points: Array<[number, number]> = [
    [window.innerWidth / 2, window.innerHeight / 2],
    [4, 4],
    [window.innerWidth - 4, window.innerHeight - 4],
  ];
  for (const [x, y] of points) {
    const hit = document.elementFromPoint(x, y);
    const el = hit && (hit.closest('.fixed.inset-0') as HTMLElement | null);
    if (el && isVisible(el)) return el;
  }
  return null;
}

function findCloseButton(overlay: HTMLElement): HTMLElement | null {
  const buttons = Array.from(overlay.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(
    (b) => !(b as HTMLButtonElement).disabled && b.getClientRects().length > 0,
  );
  // 1) Adı/ipucu "Kapat" olan düğme
  for (const b of buttons) {
    if (CLOSE_LABEL.test(b.getAttribute('aria-label') || '') || CLOSE_LABEL.test(b.getAttribute('title') || '')) return b;
  }
  // 2) Yalnızca X simgesi taşıyan düğme (lucide-x)
  for (const b of buttons) {
    if (b.querySelector('svg.lucide-x') && (b.textContent || '').trim().length <= 1) return b;
  }
  // 3) Yazısı "Kapat / İptal / Vazgeç" olan düğme
  for (const b of buttons) {
    if (CLOSE_WORDS.test((b.textContent || '').trim())) return b;
  }
  return null;
}

let installed = false;

export function installEscClose() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  // Yakalama aşamasında dinlenir: diğer kodlar Esc'yi işlemeden önce pencere izlenmeye başlar
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      const overlay = topOverlay();
      if (!overlay) return;
      // Pencerenin kendi kodu Esc'yi işliyorsa (yeni pencereler, "kaydedilmemiş değişiklik" onayı
      // soran formlar, menüler) ona fırsat ver: kısa süre içinde pencerede bir değişiklik olduysa
      // (kapandı ya da onay sorusu çıktı) hiçbir şey yapma; pencere hiç tepki vermediyse kapat.
      let changed = false;
      let observer: MutationObserver | null = null;
      try {
        observer = new MutationObserver(() => {
          changed = true;
        });
        observer.observe(overlay, { subtree: true, childList: true, attributes: true, characterData: true });
      } catch {}
      window.setTimeout(() => {
        if (observer) observer.disconnect();
        if (e.defaultPrevented || changed || !overlay.isConnected || !isVisible(overlay)) return;
        if (topOverlay() !== overlay) return;
        const btn = findCloseButton(overlay);
        if (btn) {
          btn.click();
          return;
        }
        // Düğme yoksa arka plana tıkla (arka plana tıklayınca kapanan pencereler için)
        overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }, 60);
    },
    true,
  );
}
