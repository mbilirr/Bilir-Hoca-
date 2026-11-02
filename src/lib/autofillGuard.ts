// ============================================================================
// TARAYICI OTOMATİK DOLDURMA KORUMASI (Aşama 136)
// Sorun: Uygulamadaki arama ve form kutularının çoğunda (204 kutudan 153'ü) "autocomplete"
// işareti yoktu. Tarayıcı bu kutuları kullanıcı adı / e-posta alanı sanıp kayıtlı e-postaları
// ve şifreleri öneriyordu (öğrenci arama gibi kutulara tıklayınca).
// Çözüm: Sayfaya eklenen her yazı kutusuna, kendi işareti yoksa "autocomplete=off" ve şifre
// yöneticisi eklentilerinin (LastPass, 1Password, Bitwarden, Dashlane) tanıdığı "yok say" işaretleri
// konur. Giriş ekranındaki gerçek kullanıcı adı / şifre alanları (autocomplete="username" ve
// "current-password") ile şifre yenileme alanlarına (new-password) dokunulmaz; orada otomatik
// doldurma çalışmaya devam eder.
// Hız: Yalnız sayfaya yeni eklenen düğümlere bakılır, her kutu bir kez işaretlenir.
// ============================================================================

const SKIP_TYPES = new Set(['checkbox', 'radio', 'file', 'hidden', 'range', 'color', 'submit', 'button', 'reset', 'image']);
const CREDENTIAL_AC = new Set(['username', 'current-password', 'new-password', 'one-time-code']);
const MARK = 'data-ac-guard';

function guardInput(el: HTMLInputElement): void {
  if (el.hasAttribute(MARK)) return;
  el.setAttribute(MARK, '');
  if (SKIP_TYPES.has(el.type)) return;
  const ac = (el.getAttribute('autocomplete') || '').trim().toLowerCase();
  // Gerçek kimlik alanları (giriş, şifre yenileme): tarayıcı burada yardımcı olmaya devam eder
  if (CREDENTIAL_AC.has(ac)) return;
  if (!ac) el.setAttribute('autocomplete', el.type === 'password' ? 'new-password' : 'off');
  if (!el.hasAttribute('data-lpignore')) el.setAttribute('data-lpignore', 'true');
  if (!el.hasAttribute('data-1p-ignore')) el.setAttribute('data-1p-ignore', 'true');
  if (!el.hasAttribute('data-bwignore')) el.setAttribute('data-bwignore', 'true');
  if (!el.hasAttribute('data-form-type')) el.setAttribute('data-form-type', 'other');
}

function scan(node: Node): void {
  if (node.nodeType !== 1) return;
  const el = node as Element;
  if (el.tagName === 'INPUT') {
    guardInput(el as HTMLInputElement);
    return;
  }
  if (!el.firstElementChild) return;
  const list = el.getElementsByTagName('input');
  for (let i = 0; i < list.length; i++) guardInput(list[i]);
}

let installed = false;

export function installAutofillGuard(): void {
  if (installed || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  installed = true;
  const observer = new MutationObserver((records) => {
    for (let r = 0; r < records.length; r++) {
      const added = records[r].addedNodes;
      for (let i = 0; i < added.length; i++) scan(added[i]);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan(document.documentElement);
}
