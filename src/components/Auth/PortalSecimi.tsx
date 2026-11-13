import React, { useState } from 'react';
import { GraduationCap, Building2, Settings2, LogOut, Check, Repeat, HeartHandshake, ClipboardCheck, CalendarClock } from 'lucide-react';
import { Modal } from '../ui/kit';
import { dataService, PORTAL_ADI, type PortalKod } from '../../services/dataService';

// Aşama 243 / 257: kurumda birden çok görevi olan kişiye girişte portal seçimi
export const PORTAL_BILGI: Record<PortalKod, { icon: React.ComponentType<{ className?: string }>; aciklama: string }> = {
  idare: { icon: Building2, aciklama: 'Okul geneli, ders programı, devamsızlık ve öğretmen takibi.' },
  rehberlik: { icon: HeartHandshake, aciklama: 'Okulun nabzı, aranacak veliler, etütler ve denemede düşenler.' },
  olcme: { icon: ClipboardCheck, aciklama: 'Denemeler, karneler, sonuç ve kazanım analizi.' },
  ogretmen: { icon: GraduationCap, aciklama: 'Kendi derslerim, ödev, etüt, yoklama ve öğrencilerim.' },
  etut: { icon: CalendarClock, aciklama: 'Bana verilen etütler ve o etütteki öğrenciler.' },
  yonetici: { icon: Settings2, aciklama: 'Kurulum, hesaplar, yetkiler, kurum ayarları ve yedek.' },
};

// Aşama 254c: kartlar giriş ekranında ve logoya basınca açılan değişim penceresinde ortak
const PortalKartlari: React.FC<{ onSec: (p: PortalKod) => void; aktif?: PortalKod | null; sik?: boolean }> = ({ onSec, aktif = null, sik = false }) => {
  const portallar = dataService.getPortallar();
  return (
    // Aşama 257: giriş ekranında 3 portal tek sırada, 2 ve 4 ikişerli; pencerede tek sayıda kalan son kart iki sütun kaplar
    <div
      className={`grid ${sik ? 'gap-3' : 'gap-4'} sm:grid-cols-2 ${!sik && portallar.length % 3 === 0 ? 'lg:grid-cols-3' : ''} ${
        sik && portallar.length % 2 === 1 ? 'sm:[&>*:last-child]:col-span-2' : ''
      }`}
    >
      {portallar.map((p) => {
        const { icon: Icon, aciklama } = PORTAL_BILGI[p];
        const on = p === aktif;
        return (
          <button
            key={p}
            type="button"
            id={`portal-sec-${p}`}
            aria-current={on ? 'true' : undefined}
            onClick={() => onSec(p)}
            className={`group flex flex-col gap-3 text-left ${sik ? 'p-5 min-h-[11rem] rounded-2xl' : 'p-6 min-h-[13rem] rounded-3xl'} bg-surface border ${on ? 'border-brand ring-1 ring-brand/30' : 'border-line'} shadow-card cursor-pointer transition-[transform,box-shadow,border-color] duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-0.5 hover:shadow-pop hover:border-line-strong active:scale-[.985] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand motion-reduce:transition-none`}
          >
            <span className="w-11 h-11 rounded-xl bg-surface-2 grid place-items-center">
              <Icon className="w-[22px] h-[22px]" />
            </span>
            <span className="text-lg font-bold">{PORTAL_ADI[p]}</span>
            <span className="flex-1 text-sm leading-relaxed text-muted">{aciklama}</span>
            {on ? (
              <span className="w-28 h-8 rounded-full bg-brand-soft text-brand-fg text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                Buradasınız
              </span>
            ) : (
              <span className="w-28 h-8 rounded-full bg-fg text-surface text-sm font-semibold grid place-items-center">Gir</span>
            )}
          </button>
        );
      })}
    </div>
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
    <Modal open={open} onClose={onClose} id="portal-degistir" icon={Repeat} title="Portal değiştir" description="Çalışmak istediğiniz portalı seçin." size="lg">
      <PortalKartlari onSec={sec} aktif={aktif} sik />
      <label className="mt-5 flex items-center justify-center gap-2 text-sm text-muted cursor-pointer select-none">
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
  const [hatirla, setHatirla] = useState(false); // Aşama 254c: varsayılan her girişte sor
  const sec = (p: PortalKod) => {
    dataService.setPortal(p, hatirla);
    onSec(p);
  };

  return (
    <div className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-3xl" aria-labelledby="portal-baslik">
        <header className="text-center mb-8">
          {ad && <p className="text-sm text-muted">Hoş geldiniz, {ad}</p>}
          <h1 id="portal-baslik" className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
            Hangi <span className="text-brand-fg">portalda</span> çalışmak istersiniz?
          </h1>
        </header>

        <PortalKartlari onSec={sec} />

        <label className="mt-6 flex items-center justify-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 accent-[var(--color-brand)]" checked={hatirla} onChange={(e) => setHatirla(e.target.checked)} />
          Bu cihazda seçimimi hatırla, bir dahaki girişte sorma
        </label>
        <p className="mt-2 text-center text-xs text-subtle">Portalı içeride sol üstteki kurum logosuna basarak istediğiniz an değiştirebilirsiniz.</p>

        <div className="mt-6 flex justify-center">
          <button type="button" onClick={onCikis} className="ui-btn ui-btn-ghost ui-btn-sm w-28 text-muted">
            <LogOut className="w-3.5 h-3.5" />
            Çıkış
          </button>
        </div>
      </main>
    </div>
  );
};
