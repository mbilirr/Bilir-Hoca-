// Öğretmen ana sayfası › Bu hafta şeridi (Aşama 364: ayrı parça)
import { ArrowRight } from 'lucide-react';
import { GUN_KISA, isoGun } from '../../../services/dersService';
import { useOgretmenAnaBaglam } from './useOgretmenAnaSayfa';

export function BuHafta() {
  const { can, go, etkinlikAc, bugun, dersHazir, haftaGunleri, haftaRef, haftaParcalar } = useOgretmenAnaBaglam();
  return (
    <>
      {/* ===== Bu hafta ===== */}
      {haftaParcalar.length > 0 && (
        <section className="od-card" aria-labelledby="og-h-hafta">
          <div className="od-card-h">
            <div>
              <h2 id="og-h-hafta">Bu Hafta</h2>
              <p>
                {haftaParcalar
                  .join(', ')
                  .replace(/, ([^,]*)$/, ' ve $1')
                  .replace(/^./, (c) => c.toLocaleUpperCase('tr-TR'))}
                {dersHazir ? ' · dersler üstteki kartta' : ''}
              </p>
            </div>
            {can.etut && (
              <button type="button" className="od-link" onClick={() => go('etuts')}>
                Etütler
                <ArrowRight aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="og-week" ref={haftaRef}>
            {haftaGunleri.map(({ g, l, tatil }) => {
              const goster = l.slice(0, 4);
              return (
                <div key={g} className={`og-day${g === bugun ? ' today' : ''}${tatil ? ' tatil' : ''}`}>
                  <div className="dh">
                    <span>{GUN_KISA[isoGun(g) - 1]}</span>
                    <b className="tnum">{Number(g.slice(8, 10))}</b>
                  </div>
                  {goster.length ? (
                    goster.map((o) =>
                      o.akt ? (
                        // Aşama 337: zümre etkinliği basılabilir (öğretmende ayrıntı, idarede takvimde yalnız o etkinlik)
                        <button key={o.k} type="button" className={`og-ev akt${o.akt.yer === 'dis' ? ' dis' : ''}`} title={o.yazi} onClick={() => etkinlikAc(o.akt!)}>
                          {o.yazi}
                        </button>
                      ) : (
                        <span key={o.k} className={`og-ev ${o.tur}`} title={o.yazi}>
                          {o.yazi}
                        </span>
                      ),
                    )
                  ) : (
                    <span className="none">Boş gün</span>
                  )}
                  {l.length > 4 && <span className="plus">+{l.length - 4} daha</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
export default BuHafta;
