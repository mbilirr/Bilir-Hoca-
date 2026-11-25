// Öğretmen ana sayfası › sizi bekleyenler, bugün ders dışında, ödevlerim, yeni gelenler ızgarası (Aşama 364: ayrı parça)
import React from 'react';
import { ArrowRight, BookOpen, Check, HelpCircle, MessageSquare } from 'lucide-react';
import { yasYazi } from './ortak';
import { OkIsareti } from '../AnaSayfaKabuk'; // Aşama 404
import { useOgretmenAnaBaglam } from './useOgretmenAnaSayfa';

export function AnaIzgara() {
  const { disOzet, can, go, yerelBugun, odevDurum, odevGun, soruGoruldu, teslimGoruldu, yeniTeslimler, isler, tumIsler, setTumIsler, isKarti, disOlay, disKarti, simdiHm, cizgiOnce, odevlerim, sonGunYazi, akis, akisYeni, tumAkis, setTumAkis, akisKarti, once, gorunenIsler } = useOgretmenAnaBaglam();
  return (
    <>
      {/* Aşama 268: düzenli ızgara — satır satır: Sizi bekleyenler | Bugün ders dışında, Ödevlerim | Öğrencilerden.
          Aynı satırdaki duvarlar eşit boy; tek kalan duvar satırı boydan boya kaplar. */}
      {(isKarti || can.odev || disKarti || akisKarti) && (
        <div className="og-grid">
          {isKarti && (
            <section className="od-card" aria-labelledby="og-h-bek">
              <div className="od-card-h">
                <div>
                  <h2 id="og-h-bek">
                    Sizi Bekleyenler <span className={`og-count${isler.length ? '' : ' ok'}`}>{isler.length}</span>
                  </h2>
                  <p>{isler.length ? 'Geciken ya da unutulan işler' : 'Gecikmiş işiniz yok'}</p>
                </div>
              </div>
              {isler.length ? (
                <>
                  <ul className="og-todo">
                    {gorunenIsler.map((x) => (
                      <li key={x.k}>
                        <span className={`bar${x.uyari ? ' w' : ''}`} />
                        <span className="t">
                          <b title={x.baslik}>{x.baslik}</b>
                          <span title={x.alt}>{x.alt}</span>
                        </span>
                        <span className={`age${x.uyari ? ' w' : ''}`}>{yasYazi(x.yas)}</span>
                        <button type="button" className={`ak-btn w-24${x.uyari ? '' : ' primary'}`} onClick={x.on}>
                          {x.btn}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {isler.length > 5 && (
                    <button type="button" className="od-link og-more" onClick={() => setTumIsler((v) => !v)}>
                      {tumIsler ? 'Daha az göster' : `+${isler.length - 5} iş daha`}
                    </button>
                  )}
                </>
              ) : (
                <div className="og-empty">
                  <span className="ok">
                    <Check aria-hidden="true" />
                  </span>
                  <b>Her şey yolunda</b>
                  Bekleyen işiniz kalmadı. İyi dersler!
                </div>
              )}
            </section>
          )}

          {disKarti && (
            <section className="od-card" aria-labelledby="og-h-dis">
              <div className="od-card-h">
                <div>
                  <h2 id="og-h-dis">Bugün Ders Dışında</h2>
                  <p>{disOzet || 'Bugün'}</p>
                </div>
              </div>
              {disOlay.length ? (
                <ol className="og-tl">
                  {disOlay.map((o, i) => (
                    <React.Fragment key={o.k}>
                      {i === cizgiOnce && (
                        <li className="nowline" aria-label={`Şu an ${simdiHm}`}>
                          <span className="tnum">{simdiHm}</span>
                          <i />
                        </li>
                      )}
                      <li className={o.gecti ? 'gecti' : undefined}>
                        <span className="h tnum">{o.saat || 'Gün'}</span>
                        <span className="node">
                          <i className={o.tur} />
                        </span>
                        <button type="button" className="x" onClick={o.on}>
                          <b>{o.b}</b>
                          {o.alt && <span>{o.alt}</span>}
                        </button>
                        <span className={`og-tag ${o.tur}`}>{o.etiket}</span>
                      </li>
                    </React.Fragment>
                  ))}
                </ol>
              ) : (
                <div className="od-empty">
                  <OkIsareti />
                  Bugün ders dışında planlı işiniz yok.
                </div>
              )}
            </section>
          )}

          {/* ===== Ödevlerim ===== */}
          {can.odev && (
            <section className="od-card" aria-labelledby="og-h-odev">
              <div className="od-card-h">
                <div>
                  <h2 id="og-h-odev">Ödevlerim</h2>
                  <p>
                    {odevlerim.aktif ? `Aktif ${odevlerim.aktif} ödev` : 'Aktif ödeviniz yok'}
                    {odevlerim.oran !== null ? ` · teslim oranı %${odevlerim.oran}` : ''}
                  </p>
                </div>
                <button type="button" className="od-link" onClick={() => go('homework')}>
                  Ödevler
                  <ArrowRight aria-hidden="true" />
                </button>
              </div>
              {odevlerim.liste.length ? (
                <>
                  <ul className="og-hw">
                    {odevlerim.liste.map((h) => {
                      const d = odevDurum.get(h.id) || { exp: 0, kontrol: 0, teslim: 0, teslimTum: 0, isaretsiz: 0, siniflar: '' };
                      const gecti = odevGun(h) < yerelBugun;
                      const yuz = (n: number) => (d.exp ? `${Math.min(100, (n / d.exp) * 100)}%` : '0%');
                      return (
                        <li key={h.id}>
                          <button type="button" onClick={() => go('homework', ['homework', h.id, h.title])}>
                            <span style={{ minWidth: 0 }}>
                              <b title={h.title}>{h.title}</b>
                              <span className={`s${gecti ? ' bad' : ''}`}>
                                {[d.siniflar, sonGunYazi(h), gecti && d.isaretsiz ? `${d.isaretsiz} işaretlenmedi` : ''].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            <span className="og-bar2" aria-label={`${d.exp} öğrenciden ${d.kontrol} kontrol edildi, ${d.teslim} teslim edildi`}>
                              <i className="a" style={{ width: yuz(d.kontrol) }} />
                              <i className="b" style={{ width: yuz(d.teslim) }} />
                            </span>
                            <span className="n tnum">
                              {d.kontrol + d.teslim}/{d.exp}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="og-legend" aria-hidden="true">
                    <span>
                      <i className="a" />
                      Kontrol edildi
                    </span>
                    <span>
                      <i className="b" />
                      Teslim edildi
                    </span>
                  </div>
                </>
              ) : (
                <div className="od-empty">
                  <OkIsareti />
                  Teslimi süren ödeviniz yok.
                </div>
              )}
            </section>
          )}

          {/* ===== Öğrencilerden (Aşama 250) ===== */}
          {akisKarti && (
            <section className="od-card" aria-labelledby="og-h-akis" id="home-ogrencilerden">
              <div className="od-card-h">
                <div>
                  <h2 id="og-h-akis">Öğrencilerden {akisYeni > 0 && <span className="og-count hi">{akisYeni} yeni</span>}</h2>
                  <p>Son 3 gün{akis.length ? ` · ${akis.length} kayıt` : ''}</p>
                </div>
                {akisYeni > 0 && (
                  <button
                    type="button"
                    className="od-link"
                    onClick={() => {
                      teslimGoruldu(yeniTeslimler);
                      soruGoruldu(akis.flatMap((a) => (a.tur === 'soru' && a.ids ? a.ids : [])));
                    }}
                  >
                    Hepsini gördüm
                  </button>
                )}
              </div>
              {akis.length ? (
                <>
                  <ul className="og-feed">
                    {(tumAkis ? akis : akis.slice(0, 5)).map((a) => (
                      <li key={a.k}>
                        <button type="button" onClick={a.on}>
                          <span className={`ic ${a.tur}`}>
                            {a.tur === 'teslim' ? (
                              <BookOpen aria-hidden="true" />
                            ) : a.tur === 'soru' ? (
                              <HelpCircle aria-hidden="true" />
                            ) : (
                              <MessageSquare aria-hidden="true" />
                            )}
                          </span>
                          <span className="t">
                            <b title={a.ad}>{a.ad}</b>
                            <span title={a.alt}>{a.alt}</span>
                          </span>
                          <span className="tm tnum">
                            {a.yeni && <i aria-label="yeni" />}
                            {once(a.t)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {akis.length > 5 && (
                    <button type="button" className="od-link og-more" onClick={() => setTumAkis((v) => !v)}>
                      {tumAkis ? 'Daha az göster' : `+${akis.length - 5} kayıt daha`}
                    </button>
                  )}
                </>
              ) : (
                <div className="od-empty">
                  <OkIsareti />
                  Son 3 günde öğrencilerden yeni bir şey gelmedi.
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
export default AnaIzgara;
