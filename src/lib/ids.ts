// ============================================================================
// Kayıt kimliği üretimi (Aşama 17, rapor ÖR7)
// Yalnızca saate dayalı kimlikler aynı milisaniyede üretilen iki kaydı birbirine ezdirebiliyordu.
// Tarayıcının güvenli rastgele üreticisi kullanılır; okunabilirlik için başa tür eki konur.
// ============================================================================
export function newId(prefix: string): string {
  let rand = '';
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') rand = crypto.randomUUID();
  } catch {
    rand = '';
  }
  if (!rand) rand = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}
