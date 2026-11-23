import React, { useState } from 'react';
import { GraduationCap, Building2, Settings2, LogOut, Check, ChevronRight, Repeat, HeartHandshake, ClipboardCheck, CalendarClock } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { dataService, PORTAL_ADI, type PortalKod } from '../../services/dataService';

// Aşama 243 / 257: kurumda birden çok görevi olan kişiye girişte portal seçimi
// Aşama 311: büyük kartlar yerine sık, renkli satırlar (Hesap değiştir ile aynı dil): her portalın kendi renginde simgesi, eşit boy.
export const PORTAL_BILGI: Record<PortalKod, { icon: React.ComponentType<{ className?: string }>; aciklama: string; renk: number }> = {
  idare: { icon: Building2, aciklama: 'Okul geneli, ders programı ve devamsızlık.', renk: 222 },
  rehberlik: { icon: HeartHandshake, aciklama: 'Aranacak veliler, etütler ve denemede düşenler.', renk: 338 },
  olcme: { icon: ClipboardCheck, aciklama: 'Denemeler, karneler, sonuç ve kazanım analizi.', renk: 262 },
  ogretmen: { icon: GraduationCap, aciklama: 'Derslerim, ödev, etüt, yoklama ve öğrencilerim.', renk: 172 },
  etut: { icon: CalendarClock, aciklama: 'Bana verilen etütler ve o etütteki öğrenciler.', renk: 32 },
  yonetici: { icon: Settings2, aciklama: 'Kurulum, hesaplar, yetkiler, ayarlar ve yedek.', renk: 152 },
};

const SATIR =
  'group w-full h-[4.5rem] flex items-center gap-3 p-3 text-left rounded-2xl border bg-surface transition-[transform,box-shadow,border-color,background-color] duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none';
const gradyan = (h: number) => ({ backgroundImage: `linear-gradient(135deg, hsl(${h} 68% 56%), hsl(${(h + 18) % 360} 72% 40%))` });

// Aşama 254c: satırlar giriş ekranında ve logoya basınca açılan değişim penceresinde ortak
export const PortalKartlari: React.FC<{ onSec: (p: PortalKod) => void; aktif?: PortalKod | null }> = ({ onSec, aktif = null }) => {
  const portallar = dataService.getPortallar();
  return (
    <ul className="space-y-2" aria-label="Portallar">
      {portallar.map((p) => {
        const { icon: Icon, aciklama, renk } = PORTAL_BILGI[p];
        const on = p === aktif;
        return (
          <li key={p}>
            <button
              type="button"
              id={`portal-sec-${p}`}
              aria-current={on ? 'true' : undefined}
              onClick={() => !on && onSec(p)}
              className={cx(
                SATIR,
                on
                  ? 'border-brand/40 bg-brand-soft/50 ring-1 ring-brand/20 cursor-default'
                  : 'border-line shadow-card cursor-pointer hover:-translate-y-px hover:shadow-pop hover:border-line-strong active:scale-[.99]'
              )}
            >
              <span className="w-10 h-10 shrink-0 rounded-xl grid place-items-center text-white shadow-sm ring-1 ring-black/5" style={gradyan(renk)} aria-hidden="true">
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-fg">{PORTAL_ADI[p]}</span>
                <span className="block text-xs text-muted mt-0.5 line-clamp-2">{aciklama}</span>
              </span>
              {on ? (
                <span className="shrink-0 w-14 sm:w-[6.5rem] h-7 rounded-full bg-surface border border-brand/30 text-brand-fg text-xs font-semibold inline-flex items-center justify-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span className="sr-only sm:not-sr-only">Buradasınız</span>
                </span>
              ) : (
                <span className="shrink-0 w-14 sm:w-[6.5rem] h-7 rounded-full bg-fg text-canvas text-xs font-semibold inline-flex items-center justify-center gap-1 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none">
                  Gir
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/** Aşama 254c: içeride kurum logosuna basınca açılan portal değişim penceresi ("hatırla" seçimi de buradan değişir) */
export const PortalDegistirPencere: React.FC<{ open: boolean; onClose: () => void; onSec: (p: PortalKod) => void }> = ({ open, onClose, onSec }) => {
  const [hatirla, setHatirla] = useState(() => dataService.portalHatirlaniyor());
  React.useEffect(() => {
    if (open) setHatirla(dataService.portalHatirlaniyor());
  }, [open]);
  const aktif = dataService.getPortal();
  const sec = (p: PortalKod) => {
    dataService.setPortal(p, hatirla);
    onClose();
    onSec(p);
  };
  return (
    <Modal open={open} onClose={onClose} id="portal-degistir" icon={Repeat} title="Portal değiştir" description="Çalışmak istediğiniz portalı seçin.">
      <PortalKartlari onSec={sec} aktif={aktif} />
      <label className="mt-4 flex items-center justify-center gap-2 text-xs text-muted cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-4 h-4 accent-[var(--color-brand)]"
          checked={hatirla}
          onChange={(e) => {
            const v = e.target.checked;
            setHatirla(v);
            if (aktif) dataService.setPortal(aktif, v);
          }}
        />
        Bu cihazda seçimimi hatırla, bir dahaki girişte sorma
      </label>
    </Modal>
  );
};

export const PortalSecimi: React.FC<{ ad?: string; onSec: (p: PortalKod) => void; onCikis: () => void }> = ({ ad, onSec, onCikis }) => {
  // Aşama 314: kutu baştan işaretli; ilk seçimden sonra bu hesap bu cihazda doğrudan o portalla açılır (her hesap kendi seçimini hatırlar)
  const [hatirla, setHatirla] = useState(true);
  const sec = (p: PortalKod) => {
    dataService.setPortal(p, hatirla);
    onSec(p);
  };

  return (
    <div className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-xl" aria-labelledby="portal-baslik">
        <header className="text-center mb-6">
          <span className="mx-auto mb-3 w-11 h-11 rounded-2xl bg-brand-soft text-brand-fg grid place-items-center">
            <Repeat className="w-5 h-5" />
          </span>
          {ad && <p className="text-xs text-muted">Hoş geldiniz, {ad}</p>}
          <h1 id="portal-baslik" className="mt-1 text-xl sm:text-2xl font-bold tracking-tight">
            Hangi <span className="text-brand-fg">portalda</span> çalışmak istersiniz?
          </h1>
        </header>

        <PortalKartlari onSec={sec} />

        <label className="mt-4 flex items-center justify-center gap-2 text-xs text-muted cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 accent-[var(--color-brand)]" checked={hatirla} onChange={(e) => setHatirla(e.target.checked)} />
          Bu cihazda seçimimi hatırla, bir dahaki girişte sorma
        </label>
        <p className="mt-2 text-center text-xs text-subtle">Seçiminiz hatırlanır; sol üstteki kurum logosuna basarak istediğiniz an başka portala geçebilirsiniz.</p>

        <div className="mt-5 flex justify-center">
          <button type="button" onClick={onCikis} className="ui-btn ui-btn-ghost ui-btn-sm w-28 text-muted">
            <LogOut className="w-3.5 h-3.5" />
            Çıkış
          </button>
        </div>
      </main>
    </div>
  );
};
