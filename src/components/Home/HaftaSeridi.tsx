// ============================================================================
// Aşama 404: ORTAK "BU HAFTA" ŞERİDİ (öğretmen, müdür yardımcısı, etüt öğretmeni ana sayfaları)
// Eskiden her sayfa kendi şeridini çiziyordu: başlık altında "etüt, ödev, deneme ve takvim" gibi açıklama yazısı,
// sağ üstte içerikle uyuşmayan tek bağlantı ("Etütler"), her boş günde "Boş gün", bugünün üç ayrı görünümü.
// KURAL: alt yazı yalnız GERÇEK BİLGİ verir (hafta aralığı + kaç kayıt); sağ üstte şeritteki her türün renk
// anahtarı durur, sayfası olan tür o sayfayı açar. Boş gün sessizdir (ince çizgi), bugün her sayfada aynı.
// ============================================================================
import React, { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { GUN_KISA, isoGun } from '../../services/dersService';

export type HaftaTurKod = 'etut' | 'odev' | 'den' | 'akt' | 'tatil' | 'vekil' | 'izin';
export type HaftaOlay = {
  k: string;
  tur: HaftaTurKod;
  yazi: string;
  title?: string;
  /** akademik takvimde okul dışı etkinlik */
  dis?: boolean;
  /** etüt durumu: yoklaması alındı / gecikti */
  durum?: 'ok' | 'bad';
  onClick?: () => void;
};
export type HaftaGun = { g: string; olaylar: HaftaOlay[]; tatil?: boolean };
export type HaftaTur = {
  tur: HaftaTurKod;
  ad: string;
  durum?: 'ok' | 'bad';
  onClick?: () => void;
};

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "23–29 Kasım", ay değişirse "30 Kasım – 6 Aralık" */
export function haftaAraligi(ilk: string, son: string): string {
  const [, a1, g1] = ilk.split('-').map(Number);
  const [, a2, g2] = son.split('-').map(Number);
  return a1 === a2 ? `${g1}–${g2} ${AYLAR[a1 - 1]}` : `${g1} ${AYLAR[a1 - 1]} – ${g2} ${AYLAR[a2 - 1]}`;
}

/** "3 etüt, 2 ödev ve 1 etkinlik" — sayısı 0 olanlar yazılmaz */
export function sayiOzeti(parcalar: [number, string][]): string {
  const l = parcalar.filter(([n]) => n > 0).map(([n, ad]) => `${n} ${ad}`);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} ve ${l[l.length - 1]}` : l[0] || '';
}

type Props = {
  id: string;
  baslik: string;
  /** hafta aralığından sonra gelen sayı özeti; boşsa "planlı bir şey yok" yazılır */
  ozet: string;
  bosYazi?: string;
  turler: HaftaTur[];
  gunler: HaftaGun[];
  bugun: string;
  /** bir günde gösterilecek en çok kayıt; fazlası "+N daha" */
  maks?: number;
  /** sayfanın kart ailesi (od: öğretmen, my: müdür yardımcısı, kl: etüt öğretmeni) — ölçüler aynı, yalnız sınıf adı */
  kart?: 'od' | 'my' | 'kl';
};

export const HaftaSeridi: React.FC<Props> = ({ id, baslik, ozet, bosYazi = 'planlı bir şey yok', turler, gunler, bugun, maks = 4, kart = 'od' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const ilk = gunler[0]?.g || bugun;
  const son = gunler[gunler.length - 1]?.g || bugun;
  // telefonda şerit bugünden başlasın
  // (offsetLeft farklı kaplara göre ölçüldüğünden şerit yanlış güne kayıyordu; ekrandaki konumdan hesaplanır)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = ref.current;
      const b = el?.querySelector<HTMLElement>('.today');
      if (el && b && el.scrollWidth > el.clientWidth) el.scrollLeft += b.getBoundingClientRect().left - el.getBoundingClientRect().left;
    });
    return () => cancelAnimationFrame(id);
  }, [ilk]);
  return (
    <section className={`${kart}-card od-hafta`} aria-labelledby={id}>
      <div className={`${kart}-card-h`}>
        <div>
          <h2 id={id}>{baslik}</h2>
          <p>
            {haftaAraligi(ilk, son)} · {ozet || bosYazi}
          </p>
        </div>
        {turler.length > 0 && (
          <ul className="od-turler" aria-label="Renk anahtarı">
            {turler.map((t) => (
              <li key={t.tur + (t.durum || '')}>
                {t.onClick ? (
                  <button type="button" className="od-tur" onClick={t.onClick} title={`${t.ad} sayfasını aç`}>
                    <i className={`sw ${t.tur}${t.durum ? ` ${t.durum}` : ''}`} aria-hidden="true" />
                    {t.ad}
                    <ArrowRight aria-hidden="true" className="ok" />
                  </button>
                ) : (
                  <span className="od-tur">
                    <i className={`sw ${t.tur}${t.durum ? ` ${t.durum}` : ''}`} aria-hidden="true" />
                    {t.ad}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="od-week" ref={ref}>
        {gunler.map(({ g, olaylar, tatil }) => {
          const gn = isoGun(g);
          const goster = olaylar.slice(0, maks);
          const bos = olaylar.length === 0;
          return (
            <div key={g} className={`od-day${g === bugun ? ' today' : ''}${tatil ? ' tatil' : ''}${bos && gn > 5 ? ' hs' : ''}`}>
              <div className="dh">
                <span>{g === bugun ? 'Bugün' : GUN_KISA[gn - 1]}</span>
                <b className="tnum">{Number(g.slice(8, 10))}</b>
              </div>
              {bos ? (
                <span className="bos" aria-label="Boş gün">
                  —
                </span>
              ) : (
                goster.map((o) => {
                  const cls = `od-ev ${o.tur}${o.dis ? ' dis' : ''}${o.durum ? ` ${o.durum}` : ''}`;
                  return o.onClick ? (
                    <button key={o.k} type="button" className={cls} title={o.title || o.yazi} onClick={o.onClick}>
                      {o.yazi}
                    </button>
                  ) : (
                    <span key={o.k} className={cls} title={o.title || o.yazi}>
                      {o.yazi}
                    </span>
                  );
                })
              )}
              {olaylar.length > maks && <span className="plus">+{olaylar.length - maks} daha</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
};
export default HaftaSeridi;
