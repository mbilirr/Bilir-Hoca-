// ============================================================================
// Aşama 248: ÖĞRETMEN ANA SAYFASI (taslak: "ogretmen 2.html", Odak renkleri)
// Kimde: derse giren öğretmen (rolü Öğretmen / Zümre Başkanı ya da rol yetkisi kapalı kurumda yönetici olmayan öğretmen);
//   kurum yöneticisi Öğretmen portalında. İdare, Rehberlik, Ölçme ve yalnız Etüt Öğretmeni bu sayfayı görmez.
// Günün tek odağı "Şimdi" kartı (ders sürüyor / sıradaki / yarın / tatil / ders programı yoksa etüt), yeni gelenler,
// sizi bekleyenler (yoklama, etüt yoklaması, ödev kontrolü, mesaj), bugün ders dışında, ödevlerim, bu hafta.
// KURAL (12 Kas, Mustafa): yalnız kurumun AÇIK bölümleri. Dersler kapalıysa ders kartı / ders yoklaması / tatil yok;
//   Etütler, Ödevler, Soru takibi, Mesajlar, Deneme, Akademik takvim kapalıysa o parçalar hiç çizilmez.
// Kaynaklar (ilgili sayfayla aynı): ders_programi_hafta (Dersler › Programım), ders_bekleyenlerim, etüt / ödev / teslim /
//   mesaj / soru kayıtları (dataService, ilgili sayfalarla aynı süzgeç), deneme_exams, akademik takvim.
// Senkron: ders tabloları canlı; diğer kayıtlar dataService bildirimiyle; saat her dakika ilerler; 5 dakikada bir ve
//   sekmeye dönünce sunucudan yeniden okunur.
// ============================================================================
// Aşama 364: SAYFA BÖLÜNDÜ (eskiden 1.342 satır). Bütün durum ve hesaplar ogretmenAna/useOgretmenAnaSayfa.tsx'te
// (davranış aynı), görünüm ogretmenAna/ içindeki parçalarda. Ana sayfanın hepsi ilk anda göründüğü için parçalar
// ayrı yüklenmez (ekranda bekleme ya da kayma olmaz); bölme bakımı kolaylaştırmak içindir.
// ============================================================================
import React from 'react';
import { AnaSayfaKabuk } from './AnaSayfaKabuk';
import './ogretmen.css';
import { AktEtkinlikPencere } from './AktEtkinlikPencere'; // Aşama 337
import type { Props } from './ogretmenAna/ortak';
import { OgretmenAnaBaglam, useOgretmenAnaSayfa } from './ogretmenAna/useOgretmenAnaSayfa';
import { Selamlama } from './ogretmenAna/Selamlama';
import { SimdiKarti } from './ogretmenAna/SimdiKarti';
import { AnaIzgara } from './ogretmenAna/AnaIzgara';
import { BuHafta } from './ogretmenAna/BuHafta';
import { AktDurumBekleyen } from './ogretmenAna/AktDurumBekleyen'; // Aşama 375

export const OgretmenAnaSayfa: React.FC<Props> = (props) => {
  const s = useOgretmenAnaSayfa(props);
  return (
    <OgretmenAnaBaglam.Provider value={s}>
      <AnaSayfaKabuk currentTeacher={s.currentTeacher} unreadMessages={s.unreadMessages} onNavigate={s.onNavigateTab} tema="odak" sinif="ak-ogrt" overlay={s.katman}>
        <Selamlama />
        <AktDurumBekleyen />
        <SimdiKarti />
        <AnaIzgara />
        <BuHafta />
        <AktEtkinlikPencere etkinlik={s.aktSecili} onClose={() => s.setAktSecili(null)} />
      </AnaSayfaKabuk>
    </OgretmenAnaBaglam.Provider>
  );
};
