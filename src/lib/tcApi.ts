// ============================================================================
// TC KİMLİK PARMAK İZİ (Aşama 50) — /api/tc istemcisi
// TC numarası tarayıcıda yalnızca geçici olarak bellekte durur; sunucu geri çevrilemez parmak izi döndürür.
// TC hiçbir yere kaydedilmez, ekranda gösterilmez, yapay zekâya gönderilmez.
// ============================================================================
import { supabase } from './supabase';

/** Resmî TC kimlik numarası denetimi (11 hane, kontrol haneleri). Geçerliyse rakamları, değilse '' döner. */
export function validTc(v: unknown): string {
  const s = String(v ?? '').replace(/\D/g, '');
  if (!/^[1-9]\d{10}$/.test(s)) return '';
  const d = s.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if (((((odd * 7 - even) % 10) + 10) % 10) !== d[9]) return '';
  if (d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 !== d[10]) return '';
  return s;
}

/** TC'lerin parmak izleri (aynı sırayla; geçersiz olanlar null). 1000'lik parçalar halinde. */
export async function hashTcs(tcs: string[]): Promise<{ ok: true; hashes: Array<string | null> } | { ok: false; error: string }> {
  let token: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token || null;
  } catch {
    token = null;
  }
  if (!token) return { ok: false, error: 'Oturum bulunamadı. Lütfen yeniden giriş yapın.' };
  const out: Array<string | null> = [];
  for (let i = 0; i < tcs.length; i += 1000) {
    const part = tcs.slice(i, i + 1000).map((t) => validTc(t));
    let res: Response;
    try {
      res = await fetch('/api/tc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tcs: part }),
      });
    } catch {
      return { ok: false, error: 'TC servisine ulaşılamadı (internet bağlantısını kontrol edin).' };
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || !data || !data.ok || !Array.isArray(data.hashes)) {
      if (res.status === 404) return { ok: false, error: 'TC servisi bulunamadı (api/tc.js yüklenmemiş).' };
      return { ok: false, error: (data && data.error) || `TC servisi hata verdi (${res.status}).` };
    }
    out.push(...data.hashes.map((h: unknown) => (typeof h === 'string' && h ? h : null)));
  }
  return { ok: true, hashes: out };
}
