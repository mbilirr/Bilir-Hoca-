import React, { useEffect, useState } from 'react';
import { Crown, GraduationCap, LogOut, Check, Repeat, Link2, Trash2, Building2, Eye } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import {
  bagliHesabaGec,
  bagliHesaplar,
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

const KART =
  'group flex flex-col gap-3 text-left bg-surface border shadow-card cursor-pointer transition-[transform,box-shadow,border-color] duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-0.5 hover:shadow-pop hover:border-line-strong active:scale-[.985] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand motion-reduce:transition-none disabled:opacity-60 disabled:cursor-wait';

const GECIS = 'gecis';

/** Aşama 266: sistem sahibi bir kuruma geçtiyse ya da gözüyle bakıyorsa o anki hesabın kartı (logodan geri dönüş için) */
function gecisKarti(): { id: string; icon: React.ComponentType<{ className?: string }>; baslik: string; aciklama: string } | null {
  const g = readGecis();
  if (!g || g.bagli) return null;
  if (g.gozu) return { id: GECIS, icon: Eye, baslik: `${g.gozu.kurumAd} · ${g.gozu.ad}`, aciklama: 'Bu kişinin gözüyle bakıyorsunuz. Yaptığınız işlemler kayda geçer.' };
  if (g.active) return { id: GECIS, icon: Building2, baslik: `${g.active.name} · Kurum yöneticisi`, aciklama: 'Kuruma geçtiniz; kurum yöneticisinin ekranındasınız.' };
  return null;
}

const HesapKartlari: React.FC<{
  liste: BagliHesap[];
  aktif: string | null; // SAHIP | GECIS | bağlı hesap kimliği
  busy: string | null;
  sik?: boolean;
  onSec: (id: string) => void;
}> = ({ liste, aktif, busy, sik = false, onSec }) => {
  const sahip = sahipKarti(); // Aşama 263: sistem sahibi ya da giriş yapılan öğretmen hesabı
  const gecis = gecisKarti();
  const secenekler = [
    { id: SAHIP, icon: sahip.head ? Crown : Building2, baslik: sahip.head ? 'Sistem sahibi · Kendi panelim' : sahip.baslik, aciklama: sahip.aciklama },
    ...(gecis ? [gecis] : []),
    ...liste.map((h) => ({ id: h.authUserId, icon: GraduationCap, baslik: `${h.kurumAd} · Öğretmen`, aciklama: `${h.ad} olarak öğretmen hesabınız: dersler, ödev ve etüt.` })),
  ];
  return (
    <div className={cx('grid sm:grid-cols-2', sik ? 'gap-3' : 'gap-4')}>
      {secenekler.map(({ id, icon: Icon, baslik, aciklama }) => {
        const on = id === aktif;
        return (
          <button
            key={id}
            type="button"
            id={`hesap-sec-${id === SAHIP ? 'sahip' : id.slice(0, 8)}`}
            aria-current={on ? 'true' : undefined}
            disabled={!!busy}
            onClick={() => !on && onSec(id)}
            className={cx(KART, sik ? 'p-5 min-h-[11rem] rounded-2xl' : 'p-6 min-h-[13rem] rounded-3xl', on ? 'border-brand ring-1 ring-brand/30' : 'border-line')}
          >
            <span className="w-11 h-11 rounded-xl bg-surface-2 grid place-items-center">
              <Icon className="w-[22px] h-[22px]" />
            </span>
            <span className="text-lg font-bold truncate">{baslik}</span>
            <span className="flex-1 text-sm leading-relaxed text-muted">{aciklama}</span>
            {on ? (
              <span className="w-28 h-8 rounded-full bg-brand-soft text-brand-fg text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                Buradasınız
              </span>
            ) : (
              <span className="w-28 h-8 rounded-full bg-fg text-surface text-sm font-semibold grid place-items-center">{busy === id ? 'Açılıyor…' : 'Gir'}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

const HatirlaKutusu: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <label className="mt-5 flex items-center justify-center gap-2 text-sm text-muted cursor-pointer select-none">
    <input type="checkbox" className="w-4 h-4 accent-[var(--color-brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    Bu cihazda seçimimi hatırla, bir dahaki girişte sorma
  </label>
);

/** Girişte tam ekran seçim (yalnız sistem sahibi, bağlı hesabı varsa) */
export const HesapSecimi: React.FC<{ ad?: string; liste: BagliHesap[]; onSahip: () => void; onCikis: () => void }> = ({ ad, liste, onSahip, onCikis }) => {
  const [hatirla, setHatirla] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sec = async (id: string) => {
    setErr(null);
    hesapTercihYaz(hatirla ? id : null);
    if (id === SAHIP) {
      hesapSecildi();
      onSahip();
      return;
    }
    setBusy(id);
    try {
      await bagliHesabaGec(id);
    } catch (e: any) {
      setBusy(null);
      setErr(e?.message || 'Hesaba geçilemedi.');
    }
  };
  return (
    <div className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-3xl" aria-labelledby="hesap-baslik">
        <header className="text-center mb-8">
          {ad && <p className="text-sm text-muted">Hoş geldiniz, {ad}</p>}
          <h1 id="hesap-baslik" className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
            Hangi <span className="text-brand-fg">hesapla</span> çalışmak istersiniz?
          </h1>
        </header>
        <HesapKartlari liste={liste} aktif={null} busy={busy} onSec={(id) => void sec(id)} />
        {err && (
          <p role="alert" className="mt-4 text-center text-sm font-semibold text-danger-fg">
            {err}
          </p>
        )}
        <HatirlaKutusu checked={hatirla} onChange={setHatirla} />
        <p className="mt-2 text-center text-xs text-subtle">Hesabı içeride sol üstteki logoya basarak istediğiniz an değiştirebilirsiniz.</p>
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
  const sec = async (id: string) => {
    setErr(null);
    setBusy(id);
    if (hatirla) hesapTercihYaz(id);
    try {
      if (id === SAHIP) await sistemSahibineDon();
      else await bagliHesabaGec(id);
    } catch (e: any) {
      setBusy(null);
      setErr(e?.message || 'Hesaba geçilemedi.');
    }
  };
  return (
    <Modal open={open} onClose={() => !busy && onClose()} id="hesap-degistir" icon={Repeat} title="Hesap değiştir" description="Çalışmak istediğiniz hesabı seçin." size="lg">
      {liste ? <HesapKartlari liste={liste} aktif={aktif} busy={busy} sik onSec={(id) => void sec(id)} /> : <div className="h-44 rounded-2xl bg-surface-2 animate-pulse" />}
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
  const gozu = gozuBagYonetimi() ? readGecis()?.gozu || null : null;
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
                <GraduationCap className="w-4 h-4 text-muted shrink-0" />
                <span className="flex-1 min-w-0 truncate">
                  <b className="text-fg">{h.kurumAd}</b> <span className="text-muted">· {h.ad}</span>
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
