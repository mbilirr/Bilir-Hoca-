// Aşama 375: kurumun etkinlik durumları (liste ekranları için; anlık güncellenir). 375 kurulu değilse boş harita.
import { useCallback, useEffect, useState } from 'react';
import { dataService } from '../../../services/dataService';
import { durumHaritasi, durumListesi, egitimYili, takvimCanliDinle, yilAraligi, type DurumHaritasi } from '../../../services/akademikTakvimService';

export function useAktDurumlar(acik = true): DurumHaritasi | null {
  const kurumId = dataService.getMyKurumId();
  const [harita, setHarita] = useState<DurumHaritasi | null>(null);
  const yukle = useCallback(async () => {
    if (!kurumId || !acik) return;
    try {
      setHarita(durumHaritasi(await durumListesi(kurumId, yilAraligi(egitimYili()).bas)));
    } catch {
      setHarita(durumHaritasi([]));
    }
  }, [kurumId, acik]);
  useEffect(() => {
    if (!acik) setHarita(null);
    else void yukle();
  }, [acik, yukle]);
  useEffect(() => (acik ? takvimCanliDinle(kurumId, () => void yukle()) : undefined), [acik, kurumId, yukle]);
  return harita;
}
