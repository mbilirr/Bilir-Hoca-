import React from 'react';
import { CalendarRange } from 'lucide-react';
import { Modal } from '../ui/kit';
import { dataService } from '../../services/dataService';
import { setQuickFocus } from '../../lib/quickFocus';
import { adParca, baslik, gunAraligiYazi, siniflarYazi, type AktEtkinlik } from '../../services/akademikTakvimService';

// ============================================================================
// Aşama 337: ana sayfalarda akademik takvim etkinliğine basınca
//  · idare (kurum yöneticisi, Müdür, Müdür Yrd.): Akademik takvim sayfası yalnız o etkinlikle açılır
//  · öğretmen: ayrı takvim sayfası yok; etkinliğin ayrıntısı küçük pencerede
// Hangi etkinliklerin geldiğini veritabanı belirler (sql/337: öğretmen yalnız kendi zümresi + zümresi yazılmamışlar).
// ============================================================================

/** İdare için: takvim sayfasını yalnız bu etkinlikle açar; sayfa yoksa false döner (ayrıntı penceresi açılmalı) */
export function takvimdeGoster(g: Pick<AktEtkinlik, 'key' | 'tarih'>, git: (tab: 'akademik_takvim') => void): boolean {
  if (!dataService.akademikTakvimSayfasi()) return false;
  setQuickFocus('takvim', g.key, g.tarih);
  git('akademik_takvim');
  return true;
}

const Satir: React.FC<{ ad: string; children: React.ReactNode }> = ({ ad, children }) => (
  <div className="flex items-baseline gap-3 py-2 border-b border-line last:border-b-0">
    <dt className="w-24 shrink-0 text-xs text-muted">{ad}</dt>
    <dd className="min-w-0 text-sm text-fg">{children}</dd>
  </div>
);

export const AktEtkinlikPencere: React.FC<{ etkinlik: AktEtkinlik | null; onClose: () => void }> = ({ etkinlik, onClose }) => {
  if (!etkinlik) return null;
  const [ana, konu] = adParca(etkinlik.ad);
  return (
    <Modal open onClose={onClose} icon={CalendarRange} title={baslik(ana)} description={konu || undefined} size="sm" id="akt-etkinlik-pencere">
      <dl className="-mt-1">
        <Satir ad="Tarih">{gunAraligiYazi(etkinlik)}</Satir>
        <Satir ad="Sınıf">{siniflarYazi(etkinlik.siniflar) || 'Bütün okul'}</Satir>
        {etkinlik.zumre && <Satir ad="Zümre">{baslik(etkinlik.zumre)}</Satir>}
        <Satir ad="Kapsam">{etkinlik.kapsam === 'veli' ? 'Veli etkinliği' : 'Öğrenci etkinliği'}</Satir>
        <Satir ad="Yer">
          {etkinlik.yer === 'dis' ? 'Okul dışı' : 'Okul içi'}
          {etkinlik.salon ? ' · konferans salonu' : ''}
        </Satir>
      </dl>
    </Modal>
  );
};
