// GÜVENLİK: Kullanıcıdan gelen HTML'i (ör. Word belgesinden üretilen önizleme) ekrana basmadan önce temizler.
// Yalnızca biçimlendirme etiketlerine ve güvenli özniteliklere izin verilir; betik, olay (on*) öznitelikleri,
// javascript: bağlantıları, iframe/object/form gibi etiketler tamamen kaldırılır.
// Harici bağımlılık gerektirmez; tarayıcının kendi HTML ayrıştırıcısını (DOMParser) kullanır.
// DOMParser ile ayrıştırılan belge "etkisiz"dir: içindeki betikler çalışmaz, resimler yüklenmez.

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'article', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del', 'div',
  'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i',
  'img', 'ins', 'li', 'mark', 'ol', 'p', 'pre', 's', 'section', 'small', 'span', 'strong', 'sub', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);

// Bu etiketler içerikleriyle birlikte tamamen silinir
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'template', 'noscript',
  'form', 'input', 'button', 'select', 'textarea', 'option', 'link', 'meta', 'base', 'svg', 'math', 'video',
  'audio', 'source', 'track', 'canvas', 'dialog', 'portal',
]);

const ALLOWED_ATTRS = new Set([
  'class', 'style', 'title', 'alt', 'align', 'colspan', 'rowspan', 'width', 'height', 'href', 'src', 'id',
]);

function isSafeUrl(value: string, forImage: boolean): boolean {
  const v = value.trim().toLowerCase().replace(/[\u0000- ]/g, '');
  if (!v) return false;
  if (v.startsWith('#')) return !forImage;
  if (v.startsWith('https:') || v.startsWith('http:')) return true;
  if (!forImage && v.startsWith('mailto:')) return true;
  // Word önizlemesindeki gömülü resimler (svg hariç, raster formatlar)
  if (forImage && /^data:image\/(png|jpe?g|gif|webp|bmp);/.test(v)) return true;
  return false;
}

function isSafeStyle(value: string): boolean {
  const v = value.toLowerCase();
  return !/(expression\s*\(|javascript:|url\s*\(|@import|behavior\s*:)/.test(v);
}

function cleanNode(node: Node): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.parentNode?.removeChild(child);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (DROP_WITH_CONTENT.has(tag)) {
      el.parentNode?.removeChild(el);
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Bilinmeyen etiketi kaldır, içindeki metni koru
      cleanNode(el);
      while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
      el.parentNode?.removeChild(el);
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      let keep = ALLOWED_ATTRS.has(name);
      if (keep && name === 'href') keep = tag === 'a' && isSafeUrl(value, false);
      if (keep && name === 'src') keep = tag === 'img' && isSafeUrl(value, true);
      if (keep && name === 'style') keep = isSafeStyle(value);
      if (!keep) el.removeAttribute(attr.name);
    }

    if (tag === 'a' && el.hasAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }

    cleanNode(el);
  }
}

export function sanitizeHtml(dirty: string | undefined | null): string {
  if (!dirty) return '';
  if (typeof DOMParser === 'undefined') return '';
  try {
    const doc = new DOMParser().parseFromString(`<div>${dirty}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return '';
    cleanNode(root);
    return root.innerHTML;
  } catch {
    return '';
  }
}
