// Aşama 381: panoya kopyalama (izin yoksa eski yol); başarı / hata bildirimi çağıranda
export async function panoyaKopyala(metin: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(metin);
    return true;
  } catch {
    try {
      const t = document.createElement('textarea');
      t.value = metin;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(t);
      return ok;
    } catch {
      return false;
    }
  }
}
