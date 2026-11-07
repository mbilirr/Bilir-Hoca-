import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImageUp, Shapes, Check, Trash2, AlertCircle, Sparkles } from 'lucide-react';
import { Modal, Segmented, cx } from './ui/kit';
import { compressImageToDataUrl } from '../lib/imageCompressor';
import {
  otomatikResim,
  cizimSecenekleri,
  kendiResmiMi,
  type Cinsiyet,
  type ProfilRol,
} from '../lib/profilResmi';

// ============================================================================
// AŞAMA 171 — PROFİL RESMİ SEÇ (öğretmen + öğrenci ortak pencere)
// Eski emoji / karikatür / hazır stok fotoğraf seçenekleri kaldırıldı.
//  • Çizimler: kişinin cinsiyetine göre (Tümü ile hepsi); öğretmende yalnız kendi unvanının rozetli çizimi.
//  • Fotoğraf yükle: telefondan / bilgisayardan; 200 px'e küçültülüp sıkıştırılır (Aşama 17 kuralı).
//  • Otomatik: kendi resmi kaldırılır, cinsiyet + role göre çizim (ya da baş harf) görünür.
// Çizimler statik dosya (/av/…svg): veritabanına yalnız kısa yol yazılır.
// ============================================================================

export interface ProfilResmiKisi {
  id: string;
  name: string;
  avatar?: string;
  gender?: Cinsiyet;
}

type Sekme = 'cizim' | 'foto';

export const ProfilResmiSecModal: React.FC<{
  open: boolean;
  onClose: () => void;
  kind: 'student' | 'teacher';
  rol: ProfilRol;
  person: ProfilResmiKisi;
  /** undefined = otomatik (kendi resmi yok) */
  onSave: (avatar: string | undefined) => Promise<void>;
}> = ({ open, onClose, kind, rol, person, onSave }) => {
  const ilk = kendiResmiMi(person.avatar) ? (person.avatar as string) : '';
  const [secili, setSecili] = useState<string>(ilk); // '' = otomatik
  const [sekme, setSekme] = useState<Sekme>(ilk.startsWith('data:image/') && !ilk.startsWith('data:image/svg') ? 'foto' : 'cizim');
  const [cins, setCins] = useState<Cinsiyet | 'all'>(person.gender || 'all');
  const [busy, setBusy] = useState(false);
  const [isleniyor, setIsleniyor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSecili(ilk);
    setCins(person.gender || 'all');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person.id]);

  const secenekler = useMemo(() => cizimSecenekleri(kind, rol, cins), [kind, rol, cins]);
  const otomatik = useMemo(() => otomatikResim(person, rol), [person, rol]);
  const onizleme = secili || otomatik;
  const fotoMu = secili.startsWith('data:image/') && !secili.startsWith('data:image/svg');
  const kadin = kind === 'student' ? 'Kız' : 'Kadın';
  const degisti = secili !== ilk;

  const dosyaSec = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setError('Lütfen PNG, JPG veya WebP biçiminde bir fotoğraf seçin.');
      return;
    }
    setError(null);
    setIsleniyor(true);
    try {
      setSecili(await compressImageToDataUrl(file, 200, 200, 0.8));
    } catch {
      setError('Fotoğraf işlenemedi. Başka bir dosya deneyin.');
    } finally {
      setIsleniyor(false);
    }
  };

  const kaydet = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(secili || undefined);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Profil resmi kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const durum = !secili ? 'Otomatik (cinsiyet ve role göre)' : fotoMu ? 'Kendi fotoğrafınız' : 'Seçilen çizim';

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      id="profil-resmi-modal"
      icon={Sparkles}
      tone="brand"
      size="md"
      layerClass="z-[10000]"
      title="Profil resmi"
      description="Size uygun bir çizim seçin ya da kendi fotoğrafınızı yükleyin."
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28 justify-center">
            Vazgeç
          </button>
          <button
            type="button"
            id="profil-resmi-kaydet"
            onClick={kaydet}
            disabled={busy || isleniyor || !degisti}
            className="ui-btn ui-btn-primary ui-btn-sm h-8 w-28 justify-center"
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Önizleme */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-2 border border-line">
          <img
            src={onizleme}
            alt=""
            decoding="async"
            className="w-16 h-16 rounded-full object-cover shrink-0 ring-2 ring-surface shadow-sm"
            id="profil-resmi-onizleme"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-fg truncate">{person.name}</div>
            <div className="text-[11px] text-muted">{durum}</div>
          </div>
          {secili && (
            <button
              type="button"
              id="profil-resmi-otomatik"
              onClick={() => setSecili('')}
              className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-28 justify-center"
              title="Kendi resmini kaldır; cinsiyet ve role göre otomatik çizim görünsün"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Kaldır</span>
            </button>
          )}
        </div>

        <Segmented<Sekme>
          size="sm"
          className="w-full [&>button]:flex-1"
          value={sekme}
          onChange={setSekme}
          items={[
            { value: 'cizim', label: 'Çizimler', icon: Shapes, id: 'profil-resmi-sekme-cizim' },
            { value: 'foto', label: 'Fotoğraf yükle', icon: ImageUp, id: 'profil-resmi-sekme-foto' },
          ]}
        />

        {error && (
          <div role="alert" className="p-2 rounded-lg bg-danger-soft text-danger-fg text-xs font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {sekme === 'cizim' ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Çizimleri süz">
              {(
                [
                  { v: 'K', l: kadin },
                  { v: 'E', l: 'Erkek' },
                  { v: 'all', l: 'Tümü' },
                ] as Array<{ v: Cinsiyet | 'all'; l: string }>
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  role="radio"
                  aria-checked={cins === o.v}
                  onClick={() => setCins(o.v)}
                  className={cx(
                    'h-8 w-20 rounded-lg text-xs font-semibold border transition-colors',
                    cins === o.v ? 'bg-brand text-white border-brand' : 'bg-surface text-fg-2 border-line hover:bg-surface-2'
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <ul className="grid grid-cols-4 sm:grid-cols-6 gap-2" id="profil-resmi-cizimler">
              {secenekler.map((src) => {
                const on = secili === src;
                return (
                  <li key={src}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label="Bu çizimi seç"
                      onClick={() => setSecili(src)}
                      className={cx(
                        'profil-cizim relative block w-full aspect-square rounded-full p-0.5 transition-[box-shadow,transform] duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                        on ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : 'hover:ring-2 hover:ring-line-strong'
                      )}
                    >
                      <img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full rounded-full object-cover" />
                      {on && (
                        <span className="absolute -top-0.5 -left-0.5 w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center shadow">
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={dosyaSec} className="hidden" id="profil-resmi-dosya" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isleniyor}
              className="w-full rounded-xl border-2 border-dashed border-line-strong bg-surface-2 hover:bg-surface-3 hover:border-brand transition-colors px-4 py-6 flex flex-col items-center gap-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ImageUp className="w-7 h-7 text-brand-fg" />
              <span className="text-sm font-bold text-fg">{isleniyor ? 'Fotoğraf hazırlanıyor…' : 'Fotoğraf seç'}</span>
              <span className="text-[11px] text-muted">Telefonunuzdan ya da bilgisayarınızdan · PNG, JPG, WebP · otomatik küçültülür</span>
            </button>
            {fotoMu && (
              <p className="text-[11px] font-semibold text-success-fg flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Fotoğraf hazır. Kaydet'e basın.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
