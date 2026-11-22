import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { cx } from './kit';
import { dataService } from '../../services/dataService';

// ============================================================================
// Aşama 262: KAYITLI GİRİŞ ŞİFRESİ (öğrenci ve öğretmen düzenleme ekranları ortak)
// Yöneticinin verdiği son şifre (initial_credentials) noktalı görünür; göz ile açılır, kopyalanır.
// Yalnız yöneticiler görür (veritabanı kuralıyla aynı). Kişi şifresini kendisi değiştirdiyse gerçek şifre
// Supabase'de yalnız özet (hash) olarak durur: kimse göremez; o zaman "Yeni şifre" verilir.
// Aşama 345: şifre veritabanında şifreli durur. Açılışta yalnız "şifre var mı" sorulur; şifre ancak göz ya da
// kopyala düğmesine basınca açılır ve İşlem geçmişine "kim, kimin şifresini gördü" yazılır.
// ============================================================================

type Durum = { durum: 'yukleniyor' } | { durum: 'var'; sifre: string | null } | { durum: 'degisti' } | { durum: 'yok' } | null;

export function kayitliSifreGorebilir(): boolean {
  return dataService.isHeadAdmin() || dataService.isKurumAdmin();
}

export const KayitliSifre: React.FC<{ tur: 'student' | 'teacher'; kayitId: string; className?: string }> = ({ tur, kayitId, className }) => {
  const gorebilir = kayitliSifreGorebilir();
  const [d, setD] = useState<Durum>(gorebilir ? { durum: 'yukleniyor' } : null);
  const [acik, setAcik] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [aciliyor, setAciliyor] = useState(false);
  const [hata, setHata] = useState(false);
  const istek = useRef(0);

  useEffect(() => {
    setAcik(false);
    setKopyalandi(false);
    setHata(false);
    if (!gorebilir || !kayitId) {
      setD(null);
      return;
    }
    const n = ++istek.current;
    setD({ durum: 'yukleniyor' });
    dataService
      .getInitialCredential(tur, kayitId)
      .then((c) => {
        if (n !== istek.current) return;
        if (!c) setD({ durum: 'yok' });
        else if (c.password) setD({ durum: 'var', sifre: c.password });
        else if (c.sifreVar) setD({ durum: 'var', sifre: null });
        else setD(c.changedAt ? { durum: 'degisti' } : { durum: 'yok' });
      })
      .catch(() => {
        if (n === istek.current) setD(null);
      });
  }, [tur, kayitId, gorebilir]);

  if (!d) return null;
  if (d.durum === 'yukleniyor') return <div className={cx('h-9 rounded-lg bg-surface-2 animate-pulse', className)} aria-label="Şifre yükleniyor" />;
  if (d.durum !== 'var') {
    const kim = tur === 'student' ? 'Öğrenci' : 'Öğretmen';
    return (
      <p className={cx('text-xs font-semibold text-muted', className)}>
        {d.durum === 'degisti'
          ? `${kim} şifresini kendisi değiştirdi; güvenlik gereği kimse göremez. Unuttuysa Yeni şifre verin.`
          : 'Bu şifre, sistem şifre saklamaya başlamadan önce verilmiş; görülemez. Bir kez "Yeni şifre" verin, bundan sonra burada görünür.'}
      </p>
    );
  }
  // Aşama 345: şifre yalnız istenince açılır (bir kez; sonra bellekte kalır, sayfa değişince silinir)
  const sifreAl = async (): Promise<string | null> => {
    if (d.sifre) return d.sifre;
    if (aciliyor) return null;
    const n = istek.current;
    setAciliyor(true);
    setHata(false);
    try {
      const c = await dataService.getInitialCredential(tur, kayitId, true);
      if (n !== istek.current) return null;
      if (c?.password) {
        setD({ durum: 'var', sifre: c.password });
        return c.password;
      }
      setD(c?.changedAt ? { durum: 'degisti' } : { durum: 'yok' });
      return null;
    } catch {
      if (n === istek.current) setHata(true);
      return null;
    } finally {
      if (n === istek.current) setAciliyor(false);
    }
  };
  const goster = async () => {
    if (acik) return setAcik(false);
    if (await sifreAl()) setAcik(true);
  };
  const kopyala = async () => {
    const sifre = await sifreAl();
    if (!sifre) return;
    void navigator.clipboard?.writeText(sifre).then(
      () => {
        setKopyalandi(true);
        window.setTimeout(() => setKopyalandi(false), 1600);
      },
      () => setAcik(true)
    );
  };
  return (
    <div className={cx('flex items-center gap-1.5', className)}>
      <span
        className={cx(
          'flex-1 min-w-0 h-8 px-3 flex items-center rounded-lg border border-line bg-surface-2 font-mono text-sm font-bold text-fg truncate',
          acik ? 'tracking-wider' : 'tracking-[0.2em]'
        )}
        aria-label={acik ? 'Giriş şifresi' : 'Giriş şifresi gizli'}
        aria-busy={aciliyor}
      >
        {hata ? <span className="font-sans text-xs font-semibold text-danger-fg tracking-normal">Açılamadı, tekrar deneyin</span> : acik && d.sifre ? d.sifre : '•'.repeat(d.sifre ? Math.max(6, Math.min(d.sifre.length, 12)) : 8)}
      </span>
      <button
        type="button"
        onClick={() => void goster()}
        disabled={aciliyor}
        className="ui-btn ui-btn-secondary ui-btn-icon"
        title={acik ? 'Gizle' : 'Göster'}
        aria-label={acik ? 'Şifreyi gizle' : 'Şifreyi göster'}
      >
        {acik ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button
        type="button"
        onClick={() => void kopyala()}
        disabled={aciliyor}
        className="ui-btn ui-btn-secondary ui-btn-icon"
        title={kopyalandi ? 'Kopyalandı' : 'Kopyala'}
        aria-label="Şifreyi kopyala"
      >
        {kopyalandi ? <Check className="w-4 h-4 text-success-fg" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default KayitliSifre;
