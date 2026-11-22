// Öğretmen ana sayfası › Şimdi kartı (günün tek odağı) (Aşama 364: ayrı parça)
import { basHarf } from '../../../lib/dersKisa';
import { useOgretmenAnaBaglam } from './useOgretmenAnaSayfa';

export function SimdiKarti() {
  const { saatOf, bugunDersler, durumOf, setDersHedef, kart, dersSayi } = useOgretmenAnaBaglam();
  return (
    <>
      {/* ===== Şimdi: günün tek odağı ===== */}
      {kart && (
        <article className={`og-now ${kart.cls}${kart.periods && bugunDersler.length ? '' : ' tek'}`} aria-label="Şu an" id="home-now">
          <div>
            <div className="eye">
              {kart.live && <span className="og-live" aria-hidden="true" />}
              <span>{kart.eye}</span>
            </div>
            <h3>{kart.title}</h3>
            <div className="meta tnum">{kart.meta}</div>
            {kart.prog !== null && (
              <div className="og-prog" aria-hidden="true">
                <i style={{ transform: `scaleX(${kart.prog})` }} />
              </div>
            )}
            <div className="og-now-row">
              {kart.btn && (
                <button type="button" className="ak-btn on-ink" onClick={kart.btn.on}>
                  {kart.btn.yazi}
                </button>
              )}
              <span className="rem tnum">{kart.rem}</span>
            </div>
          </div>
          {kart.periods && bugunDersler.length > 0 && (
            <div className="og-periods" aria-label="Bugünkü derslerim">
              <div className="ttl">
                <span>Bugünkü derslerim</span>
                <span className="tnum">{dersSayi} ders</span>
              </div>
              {bugunDersler.map((h) => {
                const d = durumOf(h);
                const s = h.oturum?.sayilar || {};
                const yok = (s.absent || 0) + (s.excused || 0);
                return (
                  <div key={`${h.classId}|${h.sira}`} className={`og-pr ${d}`}>
                    <span className="tnum">{h.sira}</span>
                    <span className="tnum">{saatOf(h.sira).bas}</span>
                    <b title={`${h.classAd} ${h.ders}`}>
                      {h.classAd} <small>{h.ders}</small>
                      {h.benimVekil && <span className="vk">V</span>}
                    </b>
                    {d === 'miss' ? (
                      <button type="button" onClick={() => setDersHedef({ classId: h.classId, tarih: h.tarih, sira: h.sira })}>
                        Yoklama al
                      </button>
                    ) : (
                      <span className="st">
                        {d === 'ok' ? `✓ Alındı${yok ? ` · ${yok} yok` : ''}` : d === 'cur' ? 'Şimdi' : d === 'vk' ? `Vekil: ${basHarf(h.vekilAd)}` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </article>
      )}
    </>
  );
}
export default SimdiKarti;
