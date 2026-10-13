import { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';

// ============================================================================
// Veri değişince yeniden çiz (Aşama 29)
// dataService (Supabase eşitlemesi, gerçek zamanlı güncelleme, yerel kayıt) her değiştiğinde
// sayıyı artırır. Bu sayıyı bağımlılık olarak kullanan hesaplar anında yenilenir; böylece
// aynı sayfadaki tüm duvarlar aynı veriden, aynı anda beslenir.
// ============================================================================

export function useDataVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => dataService.subscribe(() => setVersion((v) => v + 1)), []);
  return version;
}
