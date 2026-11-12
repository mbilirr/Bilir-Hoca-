import React, { useState } from 'react';
import { GraduationCap, Building2, Settings2, LogOut } from 'lucide-react';
import { dataService, PORTAL_ADI, type PortalKod } from '../../services/dataService';

// Aşama 243: birden çok görevi olan kurum yöneticisine girişte portal seçimi (İdare + Yönetici ya da Öğretmen + Yönetici)
const PORTAL_BILGI: Record<PortalKod, { icon: React.ComponentType<{ className?: string }>; aciklama: string }> = {
  ogretmen: { icon: GraduationCap, aciklama: 'Kendi derslerim, ödev, etüt, yoklama ve öğrencilerim.' },
  idare: { icon: Building2, aciklama: 'Okul geneli, ders programı, devamsızlık ve öğretmen takibi.' },
  yonetici: { icon: Settings2, aciklama: 'Kurulum, hesaplar, yetkiler, kurum ayarları ve yedek.' },
};

export const PortalSecimi: React.FC<{ ad?: string; onSec: (p: PortalKod) => void; onCikis: () => void }> = ({ ad, onSec, onCikis }) => {
  const portallar = dataService.getPortallar();
  const [hatirla, setHatirla] = useState(true);
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

        <div className="grid gap-4 sm:grid-cols-2">
          {portallar.map((p) => {
            const { icon: Icon, aciklama } = PORTAL_BILGI[p];
            return (
              <button
                key={p}
                type="button"
                id={`portal-sec-${p}`}
                onClick={() => sec(p)}
                className="group flex flex-col gap-3 text-left p-6 min-h-[13rem] rounded-3xl bg-surface border border-line shadow-card cursor-pointer transition-[transform,box-shadow,border-color] duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-0.5 hover:shadow-pop hover:border-line-strong active:scale-[.985] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand motion-reduce:transition-none"
              >
                <span className="w-11 h-11 rounded-xl bg-surface-2 grid place-items-center">
                  <Icon className="w-[22px] h-[22px]" />
                </span>
                <span className="text-lg font-bold">{PORTAL_ADI[p]}</span>
                <span className="flex-1 text-sm leading-relaxed text-muted">{aciklama}</span>
                <span className="w-28 h-8 rounded-full bg-fg text-surface text-sm font-semibold grid place-items-center">Gir</span>
              </button>
            );
          })}
        </div>

        <label className="mt-6 flex items-center justify-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 accent-[var(--color-brand)]" checked={hatirla} onChange={(e) => setHatirla(e.target.checked)} />
          Bu cihazda seçimimi hatırla, bir dahaki girişte sorma
        </label>
        <p className="mt-2 text-center text-xs text-subtle">Portalı içeride sağ üstteki hesap menüsünden istediğiniz an değiştirebilirsiniz.</p>

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
