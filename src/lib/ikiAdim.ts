import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// ============================================================================
// İKİ ADIMLI GİRİŞ (Aşama 294) — yalnız sistem sahibi
// Şifreden sonra telefondaki kod uygulamasının (Google Authenticator, Microsoft Authenticator, 1Password…)
// ürettiği 6 haneli kod istenir. Supabase'in kendi çok adımlı doğrulaması kullanılır; dış servis yoktur.
//  - Açma / kapatma: Yönetim › Yedek ve bakım › İki adımlı giriş.
//  - Denetim ekranda değil veritabanında: kod girilmemiş oturumu veritabanı sistem sahibi saymaz (SQL 294),
//    sunucu işlevleri reddeder (api/_ikiAdim.js). Buradaki ekran yalnız kodu sorar.
//  - Açık değilse giriş bugünkü gibidir; öğretmen ve öğrenci girişine hiç dokunulmaz.
// ============================================================================

export type IkiAdimDurum = 'bilinmiyor' | 'gerekmez' | 'gerekli';

/** Bu oturum kod bekliyor mu? (yerel: oturum bilgisinden okunur, istek atılmaz) */
async function durumOku(): Promise<IkiAdimDurum> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return 'gerekmez';
    return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' ? 'gerekli' : 'gerekmez';
  } catch {
    return 'gerekmez'; // okunamazsa giriş engellenmez; yetkiyi zaten veritabanı denetler
  }
}

/** Oturum açıkken iki adım durumunu izler (giriş, kod doğrulama, oturum yenileme) */
export function useIkiAdim(oturumVar: boolean): IkiAdimDurum {
  const [durum, setDurum] = useState<IkiAdimDurum>('bilinmiyor');
  useEffect(() => {
    if (!oturumVar) {
      setDurum('bilinmiyor');
      return;
    }
    let canli = true;
    const oku = () => void durumOku().then((d) => canli && setDurum(d));
    oku();
    const { data } = supabase.auth.onAuthStateChange((ev) => {
      // Geri çağrının içinde auth çağrısı yapılmaz (kilitlenir); bir sonraki turda okunur
      if (ev === 'SIGNED_IN' || ev === 'MFA_CHALLENGE_VERIFIED' || ev === 'USER_UPDATED' || ev === 'TOKEN_REFRESHED') setTimeout(oku, 0);
    });
    return () => {
      canli = false;
      data.subscription.unsubscribe();
    };
  }, [oturumVar]);
  return durum;
}

const hataMetni = (e: { message?: string; status?: number; code?: string } | null | undefined, varsayilan: string) => {
  const m = String(e?.message || '');
  if (e?.status === 429 || /rate limit|too many/i.test(m)) return 'Çok fazla deneme yapıldı. Birkaç dakika sonra yeniden deneyin.';
  if (/invalid totp|invalid code|code.*(invalid|expired)|mfa_verification_failed/i.test(m) || e?.code === 'mfa_verification_failed') return 'Kod yanlış ya da süresi geçmiş. Uygulamadaki yeni kodu girin.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Bağlantı yok. İnternetinizi kontrol edip tekrar deneyin.';
  return varsayilan;
};

const kodTemiz = (kod: string) => kod.replace(/\D/g, '').slice(0, 6);

/** Girişte: doğrulanmış kod uygulamasına karşı 6 haneli kodu doğrular (oturum aal2 olur) */
export async function ikiAdimDogrula(kod: string): Promise<void> {
  const code = kodTemiz(kod);
  if (code.length !== 6) throw new Error('6 haneli kodu girin.');
  const { data, error } = await supabase.auth.mfa.listFactors();
  const factor = !error && data ? data.totp.find((f) => f.status === 'verified') : null;
  if (!factor) throw new Error('Kod uygulaması kaydı okunamadı. Çıkış yapıp yeniden giriş yapın.');
  const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (e2) throw new Error(hataMetni(e2, 'Kod doğrulanamadı.'));
}

export interface IkiAdimKurulum {
  factorId: string;
  qr: string; // <img src> olarak kullanılacak SVG (Supabase üretir)
  gizli: string; // QR okutulamazsa elle yazılacak anahtar
}

/** Bu hesapta iki adımlı giriş açık mı? */
export async function ikiAdimAcik(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(hataMetni(error, 'Durum okunamadı.'));
  return (data?.totp || []).some((f) => f.status === 'verified');
}

/**
 * Supabase QR kodunu "data:image/svg+xml;utf-8,<svg…>" biçiminde, ham SVG olarak verir. Ham SVG içindeki # ve boşluk
 * bazı tarayıcılarda resmi bozar; adres güvenli biçime (yüzde kodlu) çevrilir. Zaten kodluysa önce çözülür.
 */
function qrAdresi(ham: string): string {
  const i = ham.indexOf(',');
  if (!ham.startsWith('data:image/svg+xml') || i < 0) return ham;
  let svg = ham.slice(i + 1);
  if (!svg.trimStart().startsWith('<')) {
    try {
      svg = decodeURIComponent(svg);
    } catch {
      return ham;
    }
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Açma, 1. adım: QR kodu üretir. Yarım kalmış eski denemeler önce temizlenir. */
export async function ikiAdimBaslat(): Promise<IkiAdimKurulum> {
  const { data: liste } = await supabase.auth.mfa.listFactors();
  for (const f of liste?.all || []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `bilirEdu ${Date.now().toString(36)}`, issuer: 'bilirEdu' });
  if (error || !data) throw new Error(hataMetni(error, 'İki adımlı giriş başlatılamadı. Supabase > Authentication > Multi-Factor bölümünde "TOTP" açık olmalı.'));
  return { factorId: data.id, qr: qrAdresi(data.totp.qr_code), gizli: data.totp.secret };
}

/** Açma, 2. adım: uygulamadaki ilk kod doğrulanınca iki adımlı giriş açılır (bu oturum da aal2 olur) */
export async function ikiAdimTamamla(factorId: string, kod: string): Promise<void> {
  const code = kodTemiz(kod);
  if (code.length !== 6) throw new Error('6 haneli kodu girin.');
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new Error(hataMetni(error, 'Kod doğrulanamadı.'));
}

/** Yarım bırakılan kurulumu geri alır */
export async function ikiAdimVazgec(factorId: string): Promise<void> {
  await supabase.auth.mfa.unenroll({ factorId }).catch(() => undefined);
}

/** Kapatma: önce güncel kod doğrulanır (oturum açık bırakılmış bilgisayardan başkası kapatamasın), sonra kayıt silinir */
export async function ikiAdimKapat(kod: string): Promise<void> {
  const code = kodTemiz(kod);
  if (code.length !== 6) throw new Error('6 haneli kodu girin.');
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(hataMetni(error, 'Durum okunamadı.'));
  const dogrulanmis = (data?.totp || []).filter((f) => f.status === 'verified');
  if (!dogrulanmis.length) return;
  const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId: dogrulanmis[0].id, code });
  if (e2) throw new Error(hataMetni(e2, 'Kod doğrulanamadı.'));
  for (const f of dogrulanmis) {
    const { error: e3 } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (e3) throw new Error(hataMetni(e3, 'Kapatılamadı.'));
  }
}
