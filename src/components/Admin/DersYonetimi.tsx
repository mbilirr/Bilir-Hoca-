import React, { Suspense, useState } from 'react';
import type { ClassGroup } from '../../types';
import { Segmented } from '../ui/kit';
import { lazyNamed, PageLoading } from '../../lib/lazyLoad';

// ============================================================================
// Aşama 217: Yönetim › Ders programı — kurulum sırası: Ders saatleri → Sınıf öğretmenleri → Program.
// Yalnız açık bölüm yüklenir. Bütün veriler veritabanından (sql/217) okunur ve canlı güncellenir.
// ============================================================================

const DersSaatleriPanel = lazyNamed(() => import('./DersSaatleriPanel'), 'DersSaatleriPanel');

type Bolum = 'saatler';

const STORE_KEY = 'edu_ders_yonetim_v1';
const okunan = (): Bolum => {
  try {
    const v = window.sessionStorage.getItem(STORE_KEY);
    return v === 'saatler' ? v : 'saatler';
  } catch {
    return 'saatler';
  }
};

export const DersYonetimi: React.FC<{ kurumId: string; classes: ClassGroup[] }> = ({ kurumId }) => {
  const [bolum, setBolumState] = useState<Bolum>(okunan);
  const setBolum = (b: Bolum) => {
    setBolumState(b);
    try {
      window.sessionStorage.setItem(STORE_KEY, b);
    } catch {
      /* depolama kapalı */
    }
  };
  const bolumler: Array<{ value: Bolum; label: string; id: string }> = [{ value: 'saatler', label: 'Ders saatleri', id: 'ders-yonetim-saatler' }];

  return (
    <div className="space-y-3" id="ders-yonetimi">
      {bolumler.length > 1 && <Segmented size="sm" value={bolum} onChange={setBolum} items={bolumler} />}
      <Suspense fallback={<PageLoading />}>{bolum === 'saatler' && <DersSaatleriPanel kurumId={kurumId} />}</Suspense>
    </div>
  );
};
