// Öğretmen ana sayfası › Bu hafta şeridi (Aşama 364: ayrı parça · Aşama 404: ortak HaftaSeridi)
import { HaftaSeridi } from '../HaftaSeridi';
import { useOgretmenAnaBaglam } from './useOgretmenAnaSayfa';

export function BuHafta() {
  const { bugun, haftaGunleri, haftaOzet, haftaTurleri } = useOgretmenAnaBaglam();
  if (!haftaTurleri.length) return null;
  return <HaftaSeridi id="og-h-hafta" baslik="Bu Hafta" ozet={haftaOzet} turler={haftaTurleri} gunler={haftaGunleri} bugun={bugun} />;
}
export default BuHafta;
