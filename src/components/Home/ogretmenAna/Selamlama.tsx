// Öğretmen ana sayfası › selamlama ve günün özeti (Aşama 364: ayrı parça)
import { Eye, MoreHorizontal, Plus } from 'lucide-react';
import { gunYazi, BildirimNotu } from './ortak';
import { useOgretmenAnaBaglam } from './useOgretmenAnaSayfa';

export function Selamlama() {
  const { onOpenStudentView, can, go, bugun, menu, setMenu, menuRef, selam, ad, brans, lede, menuIsleri } = useOgretmenAnaBaglam();
  return (
    <>
      {/* ===== Selamlama ===== */}
      <div className="od-hero">
        <div>
          <div className="od-eyebrow">
            {gunYazi(bugun)}
            {brans ? ` · ${brans}` : ''}
          </div>
          <h1>
            {selam} {ad && <em>{ad}</em>} Öğretmenim
          </h1>
          <p className="od-lede">{lede}</p>
        </div>
        <div className="og-acts">
          {can.odevVer && (
            <button type="button" className="ak-btn w-24 primary" id="home-action-homework" onClick={() => go('homework', ['action', 'homework-create', ''])}>
              <Plus aria-hidden="true" />
              Ödev
            </button>
          )}
          {can.etutPlan && (
            <button type="button" className="ak-btn w-24" id="home-action-etut" onClick={() => go('etuts', ['action', 'etut-create', ''])}>
              <Plus aria-hidden="true" />
              Etüt
            </button>
          )}
          {onOpenStudentView && (
            <button type="button" className="od-iconbtn" aria-label="Öğrenci görünümünü incele" title="Öğrenci görünümünü incele" onClick={onOpenStudentView}>
              <Eye aria-hidden="true" />
            </button>
          )}
          {menuIsleri.length > 0 && (
            <div className="og-menu" ref={menuRef}>
              <button type="button" className="od-iconbtn" aria-label="Diğer işler" title="Diğer işler" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <MoreHorizontal aria-hidden="true" />
              </button>
              {menu && (
                <div className="og-pop" role="menu">
                  {menuIsleri.map((m) => (
                    <button
                      key={m.k}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        m.on();
                      }}
                    >
                      <m.ikon aria-hidden={true} />
                      {m.yazi}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(can.ders || can.etut || can.mesaj) && (
        <BildirimNotu
          yazi={can.ders || can.etut ? 'Yoklamayı unutursanız telefonunuza hatırlatma gelsin mi?' : 'Öğrenci mesajları telefonunuza bildirim olarak gelsin mi?'}
        />
      )}
    </>
  );
}
export default Selamlama;
