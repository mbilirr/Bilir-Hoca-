import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { cx } from './kit';
import { dataService } from '../../services/dataService';

// ============================================================================
// Aşama 262: KAYITLI GİRİŞ ŞİFRESİ (öğrenci ve öğretmen düzenleme ekranları ortak)
// Yöneticinin verdiği son şifre (initial_credentials) noktalı görünür; göz ile açılır, kopyalanır.
// Yalnız yöneticiler görür (veritabanı kuralıyla aynı). Kişi şifresini kendisi değiştirdiyse gerçek şifre
// Supabase'de yalnız özet (hash) olarak durur: kimse göremez; o zaman "Yeni şifre" verilir.
// ============================================================================

type Durum = { durum: 'yukleniyor' } | { durum: 'var'; sifre: string } | { durum: 'degisti' } | { durum: 'yok' } | null;

export function kayitliSifreGorebilir(): boolean {
  return dataService.isHeadAdmin() || dataService.isKurumAdmin();
}

export const KayitliSifre: React.FC<{ tur: 'student' | 'teacher'; kayitId: string; className?: string }> = ({ tur, kayitId, className }) => {
  const gorebilir = kayitliSifreGorebilir();
  const [d, setD] = useState<Durum>(gorebilir ? { durum: 'yukleniyor' } : null);
  const [acik, setAcik] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  const istek = useRef(0);

  useEffect(() => {
    setAcik(false);
    setKopyalandi(false);
    if (!gorebilir || !kayitId) {
      setD(null);
      return;
    }
    const n = ++istek.current;
    setD({ durum: 'yukleniyor' });
    dataService
      .getInitialCredential(tur, kayitId)
      .then((c) => {
        if (n === istek.current) setD(!c ? { durum: 'yok' } : c.password ? { durum: 'var', sifre: c.password } : { durum: 'degisti' });
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
      <p className={cx('text-[12px] font-semibold text-muted', className)}>
        {d.durum === 'degisti'
          ? `${kim} şifresini kendisi değiştirdi; güvenlik gereği kimse göremez. Unuttuysa Yeni şifre verin.`
          : 'Kayıtlı şifre yok. Gerekirse Yeni şifre verin.'}
      </p>
    );
  }
  const kopyala = () => {
    void navigator.clipboard?.writeText(d.sifre).then(
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
          'flex-1 min-w-0 h-9 px-3 flex items-center rounded-lg border border-line bg-surface-2 font-mono text-[13px] font-bold text-fg truncate',
          acik ? 'tracking-wider' : 'tracking-[0.2em]'
        )}
        aria-label={acik ? 'Giriş şifresi' : 'Giriş şifresi gizli'}
      >
        {acik ? d.sifre : '•'.repeat(Math.max(6, Math.min(d.sifre.length, 12)))}
      </span>
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        className="ui-btn ui-btn-secondary ui-btn-sm h-9 w-9 p-0 justify-center"
        title={acik ? 'Gizle' : 'Göster'}
        aria-label={acik ? 'Şifreyi gizle' : 'Şifreyi göster'}
      >
        {acik ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button
        type="button"
        onClick={kopyala}
        className="ui-btn ui-btn-secondary ui-btn-sm h-9 w-9 p-0 justify-center"
        title={kopyalandi ? 'Kopyalandı' : 'Kopyala'}
        aria-label="Şifreyi kopyala"
      >
        {kopyalandi ? <Check className="w-4 h-4 text-success-fg" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default KayitliSifre;
