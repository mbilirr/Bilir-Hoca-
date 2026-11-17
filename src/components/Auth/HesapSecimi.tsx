import React, { useEffect, useState } from 'react';
import { Crown, GraduationCap, LogOut, Check, ChevronRight, Repeat, Link2, Trash2, Building2, Eye } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import {
  bagliHesabaGec,
  bagliHesaplar,
  bagYonetilenAd,
  gozuBagYonetimi,
  hesapBagKaldir,
  hesapBagla,
  hesapSecildi,
  hesapTercihOku,
  hesapTercihYaz,
  readBagli,
  readGecis,
  sahipKarti,
  sistemSahibineDon,
  type BagliHesap,
} from '../../lib/kurumGecis';

// ============================================================================
// Aşama 256: SİSTEM SAHİBİ ↔ BAĞLI (KENDİ) ÖĞRETMEN HESABI SEÇİMİ
// Aşama 263: her öğretmen kullanır (ör. iki kurumda hesabı olan öğretmen); ana kart giriş yapılan hesaptır.
//  HesapSecimi: girişte tam ekran ("Sistem sahibi" / "<kurum> · Öğretmen"); "hatırla" kutusu baştan boş.
//  HesapSecPencere: içeride kurum logosuna basınca aynı seçim (bağlı hesaptayken sistem sahibine dönüş de burada).
//  BagliHesaplarPencere: hesap menüsünden; kullanıcı adı + o hesabın şifresiyle bağlama, bağı kaldırma.
// ============================================================================

const SAHIP = 'sahip';

// Aşama 308: kartlar yerine sık, renkli satırlar (her kuruma kendi renginde simge + rol etiketi). Satırlar eşit boyda.
const SATIR =
  'group w-full flex items-center gap-3 p-3 text-left rounded-2xl border bg-surface transition-[transform,box-shadow,border-color,background-color] duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none disabled:cursor-wait';

type RolTon = 'sahip' | 'ogretmen' | 'yonetici' | 'gozu';
const ROL_ETIKET: Record<RolTon, string> = {
  sahip: 'bg-warning-soft text-warning-fg',
  ogretmen: 'bg-info-soft text-info-fg',
  yonetici: 'bg-success-soft text-success-fg',
  gozu: 'bg-brand-soft text-brand-fg',
};
// Simge renkleri: göz yormayan, birbirinden ayrışan tonlar (kurum adına göre hep aynı renk)
const TONLAR = [222, 172, 199, 152, 262, 190, 240, 280];
const ton = (ad: string) => {
  let h = 0;
  for (const c of ad.toLocaleLowerCase('tr-TR')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONLAR[h % TONLAR.length];
};
const gradyan = (h: number) => ({ backgroundImage: `linear-gradient(135deg, hsl(${h} 68% 56%), hsl(${(h + 18) % 360} 72% 40%))` });
interface Secenek {
  id: string;
  ad: string;
  rol: string;
  rolTon: RolTon;
  alt: string;
  icon: React.ComponentType<{ className?: string }>;
  renk: number;
}

const HesapSimge: React.FC<{ s: Secenek }> = ({ s }) => (
  <span className="w-10 h-10 shrink-0 rounded-xl grid place-items-center text-white shadow-sm ring-1 ring-black/5" style={gradyan(s.renk)} aria-hidden="true">
    <s.icon className="w-[18px] h-[18px]" />
  </span>
);

const GECIS = 'gecis';

/** Aşama 266: sistem sahibi bir kuruma geçtiyse ya da gözüyle bakıyorsa o anki hesabın satırı (logodan geri dönüş için) */
function gecisKarti(): Secenek | null {
  const g = readGecis();
  if (!g || g.bagli) return null;
  if (g.gozu) return { id: GECIS, ad: g.gozu.kurumAd, rol: 'Gözüyle bakış', rolTon: 'gozu', alt: `${g.gozu.ad} · yaptığınız işlemler kayda geçer`, icon: Eye, renk: 222 };
  if (g.active) return { id: GECIS, ad: g.active.name, rol: 'Kurum yöneticisi', rolTon: 'yonetici', alt: 'Kuruma geçtiniz, yöneticinin ekranındasınız', icon: Building2, renk: 152 };
  return null;
}

const HesapKartlari: React.FC<{
  liste: BagliHesap[];
  aktif: string | null; // SAHIP | GECIS | bağlı hesap kimliği
  busy: string | null;
  onSec: (id: string) => void;
}> = ({ liste, aktif, busy, onSec }) => {
  const sahip = sahipKarti(); // Aşama 263: sistem sahibi ya da giriş yapılan öğretmen hesabı
  const gecis = gecisKarti();
  const [sahipKurum, sahipRol] = sahip.baslik.split(' · ');
  const secenekler: Secenek[] = [
    sahip.head
      ? { id: SAHIP, ad: 'Sistem sahibi', rol: 'Kendi panelim', rolTon: 'sahip', alt: 'Kurumlar, hesaplar, yedek ve sistem ayarları', icon: Crown, renk: 32 }
      : { id: SAHIP, ad: sahipKurum, rol: sahipRol || 'Öğretmen', rolTon: 'ogretmen', icon: GraduationCap, alt: sahip.aciklama.replace(/ olarak giriş yaptığınız hesap\.?$/, ' · giriş yaptığınız hesap').replace(/\.$/, ''), renk: ton(sahipKurum) },
    ...(gecis ? [gecis] : []),
    ...liste.map((h): Secenek =>
      h.head
        ? { id: h.authUserId, ad: 'Sistem sahibi', rol: 'Şifre sorulur', rolTon: 'sahip', alt: 'Kurumlar, hesaplar ve sistem ayarları', icon: Crown, renk: 32 } // Aşama 269
        : { id: h.authUserId, ad: h.kurumAd, rol: 'Öğretmen', rolTon: 'ogretmen', icon: GraduationCap, alt: `${h.ad} · dersler, ödev ve etüt`, renk: ton(h.kurumAd) }
    ),
  ];
  return (
    <ul className="space-y-2" aria-label="Hesaplar">
      {secenekler.map((s) => {
        const on = s.id === aktif;
        return (
          <li key={s.id}>
            <button
              type="button"
              id={`hesap-sec-${s.id === SAHIP ? 'sahip' : s.id.slice(0, 8)}`}
              aria-current={on ? 'true' : undefined}
              disabled={!!busy}
              onClick={() => !on && onSec(s.id)}
              className={cx(
                SATIR,
                on
                  ? 'border-brand/40 bg-brand-soft/50 ring-1 ring-brand/20 cursor-default'
                  : 'border-line shadow-card cursor-pointer hover:-translate-y-px hover:shadow-pop hover:border-line-strong active:scale-[.99]',
                busy && busy !== s.id && 'opacity-60'
              )}
            >
              <HesapSimge s={s} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-sm font-bold text-fg" title={s.ad}>
                    {s.ad}
                  </span>
                  <span className={cx('shrink-0 h-5 px-2 rounded-full text-[11px] font-semibold inline-flex items-center', ROL_ETIKET[s.rolTon])}>{s.rol}</span>
                </span>
                <span className="block truncate text-xs text-muted mt-0.5" title={s.alt}>
                  {s.alt}
                </span>
              </span>
              {on ? (
                <span className="shrink-0 w-14 sm:w-[6.5rem] h-7 rounded-full bg-surface border border-brand/30 text-brand-fg text-xs font-semibold inline-flex items-center justify-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {/* telefonda yalnız işaret (satır zaten vurgulu); ekran okuyucu yine "Buradasınız" der */}
                  <span className="sr-only sm:not-sr-only">Buradasınız</span>
                </span>
              ) : (
                <span className="shrink-0 w-14 sm:w-[6.5rem] h-7 rounded-full bg-fg text-canvas text-xs font-semibold inline-flex items-center justify-center gap-1 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none">
                  {busy === s.id ? (
                    'Açılıyor…'
                  ) : (
                    <>
                      Gir
                      <ChevronRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/** Aşama 269: öğretmen hesabından sistem sahibine geçerken şifre (saklanmaz; sunucuda doğrulanır) */
const SahipSifre: React.FC<{ busy: boolean; onGir: (sifre: string) => void; onVazgec: () => void }> = ({ busy, onGir, onVazgec }) => {
  const [sifre, setSifre] = useState('');
  return (
    <form
      className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-surface-2 p-2 pl-3"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && sifre.length >= 6) onGir(sifre);
      }}
    >
      <Crown className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
      <input
        className="ui-field flex-1 min-w-0 h-8"
        type="password"
        value={sifre}
        onChange={(e) => setSifre(e.target.value)}
        placeholder="Sistem sahibi şifreniz"
        aria-label="Sistem sahibi şifreniz"
        autoComplete="current-password"
        autoFocus
      />
      <button type="button" onClick={onVazgec} disabled={busy} className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-24 justify-center shrink-0">
        Vazgeç
      </button>
      <button type="submit" disabled={busy || sifre.length < 6} className="ui-btn ui-btn-primary ui-btn-sm h-8 w-24 justify-center shrink-0">
        {busy ? 'Açılıyor…' : 'Gir'}
      </button>
    </form>
  );
};

const HatirlaKutusu: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <label className="mt-4 flex items-center justify-center gap-2 text-xs text-muted cursor-pointer select-none">
    <input type="checkbox" className="w-4 h-4 accent-[var(--color-brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    Bu cihazda seçimimi hatırla, bir dahaki girişte sorma
  </label>
);

/** Girişte tam ekran seçim (yalnız sistem sahibi, bağlı hesabı varsa) */
export const HesapSecimi: React.FC<{ ad?: string; liste: BagliHesap[]; onSahip: () => void; onCikis: () => void }> = ({ ad, liste, onSahip, onCikis }) => {
  // Aşama 315: kutu baştan işaretli (portal seçimindeki gibi); ilk seçimden sonra bu cihazda doğrudan o hesap açılır
  const [hatirla, setHatirla] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sifreHedef, setSifreHedef] = useState<string | null>(null); // Aşama 269: sistem sahibi kartı seçildi
  const sec = async (id: string, sifre?: string) => {
    setErr(null);
    if (id === SAHIP) {
      hesapTercihYaz(hatirla ? id : null);
      hesapSecildi();
      onSahip();
      return;
    }
    if (liste.some((h) => h.authUserId === id && h.head) && !sifre) {
      setSifreHedef(id);
      return;
    }
    hesapTercihYaz(hatirla ? id : null);
    setBusy(id);
    try {
      await bagliHesabaGec(id, sifre);
    } catch (e: any) {
      setBusy(null);
      setErr(e?.message || 'Hesaba geçilemedi.');
    }
  };
  return (
    <div className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-xl" aria-labelledby="hesap-baslik">
        <header className="text-center mb-6">
          <span className="mx-auto mb-3 w-11 h-11 rounded-2xl bg-brand-soft text-brand-fg grid place-items-center">
            <Repeat className="w-5 h-5" />
          </span>
          {ad && <p className="text-xs text-muted">Hoş geldiniz, {ad}</p>}
          <h1 id="hesap-baslik" className="mt-1 text-xl sm:text-2xl font-bold tracking-tight">
            Hangi <span className="text-brand-fg">hesapla</span> çalışmak istersiniz?
          </h1>
        </header>
        <HesapKartlari liste={liste} aktif={null} busy={busy} onSec={(id) => void sec(id)} />
        {sifreHedef && <SahipSifre busy={!!busy} onGir={(p) => void sec(sifreHedef, p)} onVazgec={() => setSifreHedef(null)} />}
        {err && (
          <p role="alert" className="mt-3 text-center text-xs font-semibold text-danger-fg">
            {err}
          </p>
        )}
        <HatirlaKutusu checked={hatirla} onChange={setHatirla} />
        <p className="mt-2 text-center text-xs text-subtle">Seçiminiz hatırlanır; sol üstteki logoya basarak istediğiniz an başka hesaba geçebilirsiniz.</p>
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

/** İçeride logodan açılan seçim penceresi */
export const HesapSecPencere: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [liste, setListe] = useState<BagliHesap[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hatirla, setHatirla] = useState(false);
  const bagli = readBagli();
  const aktif = bagli ? bagli.authUserId : gecisKarti() ? GECIS : SAHIP;
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setHatirla(!!hesapTercihOku());
    let iptal = false;
    bagliHesaplar()
      .then((l) => !iptal && setListe(l))
      .catch((e) => !iptal && setErr(e?.message || 'Hesaplar okunamadı.'));
    return () => {
      iptal = true;
    };
  }, [open]);
  const [sifreHedef, setSifreHedef] = useState<string | null>(null); // Aşama 269
  useEffect(() => {
    if (!open) setSifreHedef(null);
  }, [open]);
  const sec = async (id: string, sifre?: string) => {
    setErr(null);
    if (id !== SAHIP && !sifre && (liste || []).some((h) => h.authUserId === id && h.head)) {
      setSifreHedef(id);
      return;
    }
    setBusy(id);
    if (hatirla) hesapTercihYaz(id);
    try {
      if (id === SAHIP) await sistemSahibineDon();
      else await bagliHesabaGec(id, sifre);
    } catch (e: any) {
      setBusy(null);
      setErr(e?.message || 'Hesaba geçilemedi.');
    }
  };
  return (
    <Modal open={open} onClose={() => !busy && onClose()} id="hesap-degistir" icon={Repeat} title="Hesap değiştir" description="Çalışmak istediğiniz hesabı seçin.">
      {liste ? <HesapKartlari liste={liste} aktif={aktif} busy={busy} onSec={(id) => void sec(id)} /> : <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 rounded-2xl bg-surface-2 animate-pulse" />)}</div>}
      {sifreHedef && <SahipSifre busy={!!busy} onGir={(p) => void sec(sifreHedef, p)} onVazgec={() => setSifreHedef(null)} />}
      {err && (
        <p role="alert" className="mt-3 text-center text-sm font-semibold text-danger-fg">
          {err}
        </p>
      )}
      {aktif !== GECIS && (
        <HatirlaKutusu
          checked={hatirla}
          onChange={(v) => {
            setHatirla(v);
            hesapTercihYaz(v ? aktif : null);
          }}
        />
      )}
    </Modal>
  );
};

/** Hesap menüsünden: bağlı hesapları yönet (giriş yapılan ana hesapta) */
export const BagliHesaplarPencere: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [liste, setListe] = useState<BagliHesap[] | null>(null);
  const [kullanici, setKullanici] = useState('');
  const [sifre, setSifre] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Aşama 267: sistem sahibi öğretmenin gözüyle bakıyorsa onun adına bağlar (bağlanacak hesabın şifresiyle, kayda geçer; geçiş yok)
  const gozu = gozuBagYonetimi() ? { ad: bagYonetilenAd() } : null; // 267b: kuruma geçişte de
  const yukle = () =>
    bagliHesaplar(true)
      .then(setListe)
      .catch((e) => setNote({ ok: false, text: e?.message || 'Hesaplar okunamadı.' }));
  useEffect(() => {
    if (!open) return;
    setNote(null);
    setKullanici('');
    setSifre('');
    void yukle();
  }, [open]);
  const bagla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const h = await hesapBagla(kullanici, sifre);
      setNote({
        ok: true,
        text: gozu
          ? `${h.kurumAd} · ${h.ad} hesabı ${gozu.ad} hesabına bağlandı.`
          : `${h.kurumAd} · ${h.ad} hesabı bağlandı. Bir dahaki girişte seçim sorulur.`,
      });
      setKullanici('');
      setSifre('');
      await yukle();
    } catch (er: any) {
      setNote({ ok: false, text: er?.message || 'Hesap bağlanamadı.' });
    } finally {
      setBusy(false);
    }
  };
  const kaldir = async (h: BagliHesap) => {
    setNote(null);
    try {
      await hesapBagKaldir(h.authUserId);
      await yukle();
    } catch (er: any) {
      setNote({ ok: false, text: er?.message || 'Bağ kaldırılamadı.' });
    }
  };
  return (
    <Modal open={open} onClose={() => !busy && onClose()} id="bagli-hesaplar" icon={Link2} title={gozu ? `${gozu.ad} · Bağlı hesaplar` : 'Bağlı hesaplarım'} description={
        gozu
          ? 'Bu öğretmenin başka kurumdaki kendi hesabını, o hesabın kullanıcı adı ve şifresiyle bağlayın ya da bağı kaldırın. İşlem kayda geçer; geçiş buradan yapılmaz.'
          : sahipKarti().head
          ? 'Başka kurumdaki kendi öğretmen hesabınızı bağlayın; girişte hangi hesapla çalışacağınız sorulur.'
          : 'Başka kurumdaki kendi öğretmen hesabınızı bağlayın; iki hesaptan da ötekine şifresiz geçersiniz.'
      }
      size="sm"
    >
      <div className="space-y-4 text-xs">
        <div className="space-y-1.5">
          {liste === null ? (
            <div className="h-9 rounded-lg bg-surface-2 animate-pulse" />
          ) : liste.length ? (
            liste.map((h) => (
              <div key={h.authUserId} className="flex items-center gap-2 h-10 px-3 rounded-lg border border-line bg-surface">
                {h.head ? <Crown className="w-4 h-4 text-muted shrink-0" /> : <GraduationCap className="w-4 h-4 text-muted shrink-0" />}
                <span className="flex-1 min-w-0 truncate">
                  {h.head ? <b className="text-fg">Sistem sahibi</b> : <><b className="text-fg">{h.kurumAd}</b> <span className="text-muted">· {h.ad}</span></>}
                </span>
                <button type="button" onClick={() => void kaldir(h)} className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-20 justify-center" title="Bağı kaldır (hesap silinmez)">
                  <Trash2 className="w-3.5 h-3.5" />
                  Kaldır
                </button>
              </div>
            ))
          ) : (
            <p className="text-muted">Henüz bağlı hesap yok.</p>
          )}
        </div>
        <form onSubmit={(e) => void bagla(e)} className="space-y-2 pt-3 border-t border-line" autoComplete="off">
          <p className="font-bold text-fg">Hesap bağla</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="ui-field font-mono"
              value={kullanici}
              onChange={(e) => setKullanici(e.target.value)}
              placeholder="Kullanıcı adı"
              aria-label="Bağlanacak hesabın kullanıcı adı"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <input
              className="ui-field"
              type="password"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              placeholder="O hesabın şifresi"
              aria-label="Bağlanacak hesabın şifresi"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">
              {gozu ? 'Şifre yalnız doğrulama için sorulur, saklanmaz. Bağ iki yönlüdür.' : 'Şifre yalnız hesabın size ait olduğunu doğrulamak için bir kez sorulur, saklanmaz.'}
            </span>
            <button type="submit" disabled={busy || kullanici.trim().length < 3 || sifre.length < 6} className="ui-btn ui-btn-primary ui-btn-sm h-8 w-24 justify-center shrink-0">
              {busy ? 'Bağlanıyor…' : 'Bağla'}
            </button>
          </div>
        </form>
        {note && <p className={cx('rounded-lg px-2.5 py-1.5 font-semibold', note.ok ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg')}>{note.text}</p>}
      </div>
    </Modal>
  );
};
