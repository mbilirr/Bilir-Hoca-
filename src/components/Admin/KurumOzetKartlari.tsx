import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { ClassGroup, Student, Teacher } from '../../types';
import { dataService } from '../../services/dataService';
import { cx } from '../ui/kit';

// ============================================================================
// Aşama 336: Yönetim › kurum üst kartları (kurum yöneticisi / kuruma geçmiş sistem sahibi)
//  Eski dört küçük sayı (biri hiç oluşmayan "Onay bekleyen öğretmen") yerine işe yarayan dört kart:
//  Öğretmenler · Öğrenciler · Sınıflar · Yapılacaklar. Hepsi ekrandaki veriden hesaplanır (yeni tablo yok);
//  yalnız kurum e-postasının bağlı olup olmadığı bir kez sorulur. Karta basınca ilgili alt sekme açılır.
// ============================================================================

export type KurumKartHedef = 'genel' | 'ogretmen' | 'ogrenci' | 'bolumler';

const SISTEM_ADRESI = '@okul.internal.net';
const gercekEposta = (e?: string | null) => {
  const v = (e || '').trim().toLowerCase();
  return v.includes('@') && !v.endsWith(SISTEM_ADRESI);
};
const veliyeUlasilir = (s: Student) => (s.parents || []).some((p) => (p.phone || '').replace(/\D/g, '').length >= 10 || gercekEposta(p.email));
const sinifEtiketi = (g?: string) => {
  const v = (g || '').trim();
  if (!v) return 'Diğer';
  return /^\d+$/.test(v) ? `${v}. sınıf` : v;
};

// Kurum e-postası durumu: sayfa her açıldığında değil, oturumda kurum başına bir kez sorulur
const mailOnbellek = new Map<string, boolean | null>();
const useKurumMailBagli = (kurumId: string): boolean | null | undefined => {
  const [v, setV] = useState<boolean | null | undefined>(() => (mailOnbellek.has(kurumId) ? mailOnbellek.get(kurumId) : undefined));
  useEffect(() => {
    if (!kurumId) return;
    if (mailOnbellek.has(kurumId)) {
      setV(mailOnbellek.get(kurumId));
      return;
    }
    let iptal = false;
    import('../../lib/mailApi')
      .then(({ callMail }) => callMail('kurum-mail-status', { kurumId }))
      .then((r) => {
        const bagli = r.ok ? !!(r.account as any)?.gmail : null; // okunamazsa satır gösterilmez
        mailOnbellek.set(kurumId, bagli);
        if (!iptal) setV(bagli);
      })
      .catch(() => {
        if (!iptal) setV(null);
      });
    return () => {
      iptal = true;
    };
  }, [kurumId]);
  return v;
};

const Kart: React.FC<{ id: string; baslik: string; onClick: () => void; children: React.ReactNode }> = ({ id, baslik, onClick, children }) => (
  <button
    type="button"
    id={id}
    onClick={onClick}
    className="group ui-card text-left p-3.5 flex flex-col gap-2.5 min-w-0 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
  >
    <span className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-bold tracking-wide uppercase text-muted">{baslik}</span>
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-subtle group-hover:text-brand-fg">
        Aç <ArrowRight className="w-3 h-3" />
      </span>
    </span>
    {children}
  </button>
);

const Buyuk: React.FC<{ sayi: React.ReactNode; yazi: string }> = ({ sayi, yazi }) => (
  <span className="flex items-baseline gap-2 min-w-0">
    <b className="text-[1.75rem] leading-none font-bold tracking-tight tabular-nums text-fg">{sayi}</b>
    <span className="text-xs text-muted truncate">{yazi}</span>
  </span>
);

const Cubuk: React.FC<{ parcalar: Array<{ n: number; renk: string }> }> = ({ parcalar }) => {
  const top = parcalar.reduce((a, p) => a + p.n, 0);
  return (
    <span className="flex h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden="true">
      {top > 0 && parcalar.map((p, i) => (p.n > 0 ? <i key={i} className={cx('block h-full', p.renk)} style={{ width: `${(p.n / top) * 100}%` }} /> : null))}
    </span>
  );
};

const Anahtar: React.FC<{ ogeler: Array<{ yazi: string; renk: string }> }> = ({ ogeler }) => (
  <span className="flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-muted">
    {ogeler.map((o) => (
      <span key={o.yazi} className="inline-flex items-center gap-1">
        <i className={cx('w-[7px] h-[7px] rounded-[2px]', o.renk)} />
        {o.yazi}
      </span>
    ))}
  </span>
);

const Alt: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="mt-auto flex flex-wrap items-center gap-1.5 min-h-6">{children}</span>;

export const KurumOzetKartlari: React.FC<{
  kurumId: string;
  classes: ClassGroup[];
  acikBolum: number;
  tick: number;
  onGit: (hedef: KurumKartHedef) => void;
}> = ({ kurumId, classes, acikBolum, tick, onGit }) => {
  const mailBagli = useKurumMailBagli(kurumId);

  const o = useMemo(() => {
    const ogretmenler = dataService
      .getAllTeachersInternal()
      .filter((t: Teacher) => (t.kurumId || '') === kurumId && t.status !== 'rejected' && t.status !== 'pending');
    const askida = ogretmenler.filter((t) => t.isSuspended || t.status === 'suspended').length;
    const yonetici = ogretmenler.filter((t) => t.isAdmin && !(t.isSuspended || t.status === 'suspended')).length;
    const epostasiz = ogretmenler.filter((t) => !(t.isSuspended || t.status === 'suspended') && !gercekEposta(t.email)).length;

    const siniflar = classes.filter((c) => (c.kurumId || '') === kurumId);
    const sinifIdleri = new Set(siniflar.map((c) => c.id));
    const ogrenciler = dataService.getAllStudents().filter((s) => (s.kurumId || '') === kurumId);
    const ulasilir = ogrenciler.filter(veliyeUlasilir).length;
    const sinifsiz = ogrenciler.filter((s) => !s.classId || !sinifIdleri.has(s.classId)).length;
    const doluSinif = new Set(ogrenciler.map((s) => s.classId));
    const bosSinif = siniflar.filter((c) => !doluSinif.has(c.id)).length;

    const kademe = new Map<string, number>();
    siniflar.forEach((c) => kademe.set(sinifEtiketi(c.gradeLevel), (kademe.get(sinifEtiketi(c.gradeLevel)) || 0) + 1));
    const kademeler = Array.from(kademe.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr', { numeric: true }));

    return {
      ogretmen: ogretmenler.length,
      askida,
      yonetici,
      aktif: ogretmenler.length - askida - yonetici,
      epostasiz,
      ogrenci: ogrenciler.length,
      ulasilir,
      ulasilmaz: ogrenciler.length - ulasilir,
      sinifsiz,
      sinif: siniflar.length,
      sinifBasina: siniflar.length ? Math.round((ogrenciler.length - sinifsiz) / siniflar.length) : 0,
      bosSinif,
      kademeler,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, kurumId, classes]);

  type Is = { id: string; yazi: string; n: number; hedef: KurumKartHedef };
  const isler = ([
    { id: 'veli', yazi: 'Veli iletişimi eksik', n: o.ulasilmaz, hedef: 'ogrenci' },
    { id: 'eposta', yazi: 'E-postası olmayan öğretmen', n: o.epostasiz, hedef: 'ogretmen' },
    { id: 'sinifsiz', yazi: 'Sınıfsız öğrenci', n: o.sinifsiz, hedef: 'ogrenci' },
    { id: 'bos', yazi: 'Öğrencisi olmayan sınıf', n: o.bosSinif, hedef: 'bolumler' },
  ] as Is[]).filter((x) => x.n > 0);
  const mailIsi = mailBagli === false;
  const isSayisi = isler.length + (mailIsi ? 1 : 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch" id="yonetim-kurum-kartlari">
      <Kart id="yonetim-sayi-ogretmen" baslik="Öğretmenler" onClick={() => onGit('ogretmen')}>
        <Buyuk sayi={o.ogretmen} yazi="hesap" />
        <Cubuk
          parcalar={[
            { n: o.yonetici, renk: 'bg-brand' },
            { n: o.aktif, renk: 'bg-success' },
            { n: o.askida, renk: 'bg-danger' },
          ]}
        />
        <Anahtar
          ogeler={[
            { yazi: `${o.yonetici} yönetici`, renk: 'bg-brand' },
            { yazi: `${o.aktif} aktif`, renk: 'bg-success' },
            ...(o.askida ? [{ yazi: `${o.askida} askıda`, renk: 'bg-danger' }] : []),
          ]}
        />
        <Alt>
          {o.epostasiz ? (
            <span className="ui-chip ui-chip-warning">{o.epostasiz} kişinin e-postası yok</span>
          ) : (
            <span className="ui-chip ui-chip-success">Hepsinin e-postası var</span>
          )}
        </Alt>
      </Kart>

      <Kart id="yonetim-sayi-ogrenci" baslik="Öğrenciler" onClick={() => onGit('ogrenci')}>
        <Buyuk sayi={o.ogrenci} yazi={o.sinif ? `öğrenci · sınıf başına ${o.sinifBasina}` : 'öğrenci'} />
        <Cubuk
          parcalar={[
            { n: o.ulasilir, renk: 'bg-success' },
            { n: o.ulasilmaz, renk: 'bg-warning' },
          ]}
        />
        <Anahtar
          ogeler={[
            { yazi: `${o.ulasilir} velisine ulaşılır`, renk: 'bg-success' },
            ...(o.ulasilmaz ? [{ yazi: `${o.ulasilmaz} veli iletişimi yok`, renk: 'bg-warning' }] : []),
          ]}
        />
        <Alt>
          {o.sinifsiz ? (
            <span className="ui-chip ui-chip-warning">{o.sinifsiz} öğrenci sınıfsız</span>
          ) : (
            <span className="ui-chip ui-chip-success">Hepsi bir sınıfta</span>
          )}
        </Alt>
      </Kart>

      <Kart id="yonetim-sayi-sinif" baslik="Sınıflar" onClick={() => onGit('bolumler')}>
        <Buyuk sayi={o.sinif} yazi={`sınıf · ${acikBolum} açık bölüm`} />
        <span className="flex flex-wrap gap-1.5">
          {o.kademeler.slice(0, 6).map(([ad, n]) => (
            <span key={ad} className="ui-chip ui-chip-neutral">
              {ad} {n}
            </span>
          ))}
        </span>
        <Alt>
          {o.bosSinif ? (
            <span className="ui-chip ui-chip-warning">{o.bosSinif} sınıfta öğrenci yok</span>
          ) : (
            <span className="ui-chip ui-chip-success">Boş sınıf yok</span>
          )}
        </Alt>
      </Kart>

      <div className="ui-card p-3.5 flex flex-col gap-2.5 min-w-0" id="yonetim-yapilacaklar">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold tracking-wide uppercase text-muted">Yapılacaklar</span>
          <span className="text-[11px] font-semibold text-subtle tabular-nums">{isSayisi ? `${isSayisi} iş` : ''}</span>
        </span>
        <span className="flex flex-col gap-1">
          {isler.map((x) => (
            <button
              key={x.id}
              type="button"
              id={`yonetim-is-${x.id}`}
              onClick={() => onGit(x.hedef)}
              className="h-7 flex items-center gap-2 px-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-xs font-semibold text-fg-2 hover:text-fg text-left min-w-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
              <span className="truncate">{x.yazi}</span>
              <span className="ml-auto min-w-6 h-[18px] px-1.5 rounded-md grid place-items-center text-[11px] tabular-nums bg-warning-soft text-warning-fg">{x.n}</span>
            </button>
          ))}
          {mailBagli !== undefined && mailBagli !== null && (
            <button
              type="button"
              id="yonetim-is-mail"
              onClick={() => onGit('genel')}
              className="h-7 flex items-center gap-2 px-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-xs font-semibold text-fg-2 hover:text-fg text-left min-w-0"
            >
              <span className={cx('w-1.5 h-1.5 rounded-full shrink-0', mailBagli ? 'bg-success' : 'bg-warning')} />
              <span className="truncate">{mailBagli ? 'Kurum e-postası bağlı' : 'Kurum e-postası bağlı değil'}</span>
              <span
                className={cx(
                  'ml-auto min-w-6 h-[18px] px-1.5 rounded-md grid place-items-center text-[11px]',
                  mailBagli ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-warning-fg'
                )}
              >
                {mailBagli ? <Check className="w-3 h-3" /> : '!'}
              </span>
            </button>
          )}
        </span>
        {!isSayisi && (
          <Alt>
            <span className="ui-chip ui-chip-success">Her şey tamam</span>
          </Alt>
        )}
      </div>
    </div>
  );
};
