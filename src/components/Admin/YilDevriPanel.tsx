import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowRight, Check, Info, RefreshCw, RotateCcw, TriangleAlert, Undo2, UserCheck } from 'lucide-react';
import { Modal, Panel, Segmented, cx } from '../ui/kit';
import { Button } from '../ui/Button';
import { SelectBox } from '../Teacher/FormParts';
import { Yukleniyor, YuklemeHatasi } from '../ui/Durum';
import { basariBildir, hataBildir } from '../../lib/bildirim';
import { dataService } from '../../services/dataService';
import {
  devirDurumu,
  devirHesapla,
  devirUygula,
  devriGeriAl,
  geriAlmaDurumu,
  mezunuGeriAl,
  onerilenHedef,
  ustAd,
  yilArsivi,
  type DevirAtama,
  type DevirDurum,
  type DevirHedef,
  type DevirKaydi,
  type DevirOzet,
  type GeriAlmaDurumu,
  type YilArsivi,
  type ArsivSinif,
} from '../../lib/yilDevri';

// ============================================================================
// Aşama 350: YENİ EĞİTİM YILINA GEÇİŞ (Yönetim › Eğitim Yılı, yalnız kurum yöneticisi)
//  Sihirbaz: 1) sınıflar nereye geçiyor (+ sınıfta kalanlar)  2) öğretmen atamaları  3) son kontrol + kurum adıyla onay
//  Devirden Sonra: sonuç, 7 gün içinde geri alma (yeni yıla kayıt girildiyse veritabanı engeller), sıradaki işler
//  Geçmiş Yıllar: arşive geçen sınıflar, o günkü öğrencileri ve nereye gittikleri; mezunu yeniden açma
//  Bütün kurallar veritabanında (sql/350); ekran yalnız seçimleri toplar ve son adımda veritabanının deneme sonucunu gösterir.
// ============================================================================

type Sekme = 'sihirbaz' | 'sonra' | 'gecmis';

/** Büyük rakam ve başlıklar: sitenin serif yazı tipi (ana sayfalardaki rakamlarla aynı) */
const SERIF: React.CSSProperties = { fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif", letterSpacing: '-0.02em', fontWeight: 400 };
type Adim = 1 | 2 | 3;

const tarihYaz = (iso: string, saat = false) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', saat ? { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Okul yılı biterken (Haziran–Eylül) sihirbaz uyarısız açılır; yıl ortasında bir uyarı gösterilir */
const devirMevsimi = () => {
  const ay = new Date().getMonth() + 1;
  return ay >= 6 && ay <= 9;
};

const ATAMALAR: { k: DevirAtama; ad: string; acik: string; ornek: (o: { eski: string; yeni: string }) => React.ReactNode }[] = [
  {
    k: 'ogrenci',
    ad: 'Öğrencilerle Devam',
    acik: 'Öğretmen geçen yıl girdiği öğrencilerle devam eder.',
    ornek: () => (
      <>
        7/A Matematik öğretmeni <ArrowRight className="inline w-3 h-3 mx-0.5" aria-hidden /> yeni <b className="text-fg">8/A</b>
      </>
    ),
  },
  {
    k: 'ad',
    ad: 'Sınıf Adıyla Kalsın',
    acik: 'Öğretmen aynı adlı sınıfa girmeye devam eder.',
    ornek: () => (
      <>
        8/A Matematik öğretmeni <ArrowRight className="inline w-3 h-3 mx-0.5" aria-hidden /> yeni <b className="text-fg">8/A</b>
      </>
    ),
  },
  {
    k: 'bos',
    ad: 'Boş Başla',
    acik: 'Atamalar Ders programı › Sınıf öğretmenleri bölümünden yeniden yapılır.',
    ornek: () => <>Yeni sınıflarda ders ataması yok</>,
  },
];

const Sayac: React.FC<{ deger: React.ReactNode; ad: string; ton?: 'uyari' }> = ({ deger, ad, ton }) => (
  <div className={cx('rounded-xl px-3.5 py-3 border', ton === 'uyari' ? 'bg-warning-soft/60 border-transparent' : 'bg-surface-2 border-line')}>
    <div style={SERIF} className={cx('text-3xl leading-none tabular-nums', ton === 'uyari' ? 'text-warning-fg' : 'text-fg')}>
      {deger}
    </div>
    <div className="mt-1.5 text-xs text-muted">{ad}</div>
  </div>
);

const Satir: React.FC<{ ton: 'ok' | 'arsiv' | 'yeni'; children: React.ReactNode }> = ({ ton, children }) => (
  <li className="flex items-start gap-2.5 text-xs text-fg-2 leading-5">
    <span
      aria-hidden
      className={cx(
        'mt-0.5 grid place-items-center w-5 h-5 rounded-lg shrink-0',
        ton === 'ok' ? 'bg-success-soft text-success-fg' : ton === 'arsiv' ? 'bg-warning-soft text-warning-fg' : 'bg-brand-soft text-brand-fg'
      )}
    >
      {ton === 'ok' ? <Check className="w-3 h-3" /> : ton === 'arsiv' ? <Archive className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
    </span>
    <span className="min-w-0">{children}</span>
  </li>
);

export const YilDevriPanel: React.FC = () => {
  const [durum, setDurum] = useState<DevirDurum | null>(null);
  const [yukHata, setYukHata] = useState<string | null>(null);
  const [sekme, setSekme] = useState<Sekme>('sihirbaz');
  const [adim, setAdim] = useState<Adim>(1);
  const [hedef, setHedef] = useState<Record<string, DevirHedef>>({});
  const [kalan, setKalan] = useState<Record<string, string[]>>({});
  const [acikKalan, setAcikKalan] = useState<string | null>(null);
  const [atama, setAtama] = useState<DevirAtama>('ogrenci');
  const [bosAc, setBosAc] = useState(true);
  const [onizleme, setOnizleme] = useState<DevirOzet | null>(null);
  const [onizlemeHata, setOnizlemeHata] = useState<string | null>(null);
  const [onay, setOnay] = useState('');
  const [mesgul, setMesgul] = useState(false);

  const oku = useCallback(async (sekmeSec = false) => {
    setYukHata(null);
    try {
      const d = await devirDurumu();
      setDurum(d);
      const h: Record<string, DevirHedef> = {};
      d.siniflar.forEach((c) => (h[c.id] = onerilenHedef(c, d.siniflar)));
      setHedef(h);
      setKalan({});
      setAdim(1);
      setOnay('');
      setOnizleme(null);
      if (sekmeSec) {
        const son = d.devirler[0];
        if (son && !son.geriAlindi && Date.now() < new Date(son.geriAlmaSon).getTime()) setSekme('sonra');
      }
    } catch (e: any) {
      setYukHata(e?.message || 'Okunamadı.');
    }
  }, []);
  useEffect(() => {
    void oku(true);
  }, [oku]);

  const siniflar = durum?.siniflar || [];
  const hesap = useMemo(() => devirHesapla(siniflar, hedef, kalan, bosAc), [siniflar, hedef, kalan, bosAc]);
  const enAltlar = useMemo(() => {
    const ustler = siniflar.filter((c) => (hedef[c.id] || 'ust') === 'ust');
    if (!ustler.length) return [] as string[];
    const min = Math.min(...ustler.map((c) => c.seviye));
    return siniflar.filter((c) => c.seviye === min).map((c) => c.ad);
  }, [siniflar, hedef]);
  const gecerliDevirler = (durum?.devirler || []).filter((d) => !d.geriAlindi);
  const sonDevir = durum?.devirler[0] || null;

  const plan = () =>
    siniflar.map((c) => ({ class_id: c.id, hedef: hedef[c.id] || 'ust', kalan: (kalan[c.id] || []).filter((id) => c.ogrenciler.some((s) => s.id === id)) }));

  // 3. adıma geçince veritabanı devri DENER (hiçbir şey değişmez) ve gerçek sayıları verir
  const onizle = async () => {
    setOnizleme(null);
    setOnizlemeHata(null);
    try {
      setOnizleme(await devirUygula(plan(), atama, bosAc, '', true));
    } catch (e: any) {
      setOnizlemeHata(e?.message || 'Denetlenemedi.');
    }
  };
  const adimaGit = (a: Adim) => {
    setAdim(a);
    if (a === 3) void onizle();
  };

  const verileriTazele = () => {
    void dataService.syncClassesFromSupabase(true);
    void dataService.syncStudentsFromSupabase(true);
  };

  const uygula = async () => {
    if (!durum || mesgul) return;
    setMesgul(true);
    try {
      const s = await devirUygula(plan(), atama, bosAc, onay, false);
      basariBildir(`${s.yeniYil} başladı`, `${s.tasinan} öğrenci üst sınıfa geçti, ${s.mezun} öğrenci mezun oldu.`);
      verileriTazele();
      await oku();
      setSekme('sonra');
    } catch (e: any) {
      hataBildir('Yeni yıla geçilemedi', e?.message || 'İşlem yapılamadı.');
    } finally {
      setMesgul(false);
    }
  };

  if (yukHata) return <YuklemeHatasi mesaj={yukHata} onTekrar={() => oku(true)} />;
  if (!durum) return <Yukleniyor metin="Sınıflar okunuyor…" satir={4} />;

  const onayTamam = onay.trim().toLocaleLowerCase('tr') === durum.kurumAd.trim().toLocaleLowerCase('tr');
  const sekmeler = [
    { value: 'sihirbaz' as Sekme, label: 'Sihirbaz', id: 'yil-sekme-sihirbaz' },
    ...(sonDevir ? [{ value: 'sonra' as Sekme, label: 'Devirden Sonra', id: 'yil-sekme-sonra' }] : []),
    ...(gecerliDevirler.length ? [{ value: 'gecmis' as Sekme, label: 'Geçmiş Yıllar', id: 'yil-sekme-gecmis' }] : []),
  ];
  const aktifSekme: Sekme = sekmeler.some((s) => s.value === sekme) ? sekme : 'sihirbaz';

  return (
    <div className="space-y-3" id="yil-devri">
      <section className="ui-card ui-card-pad flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 style={SERIF} className="text-3xl leading-tight text-fg">
              Yeni Eğitim Yılına <i className="text-brand-fg">Geç</i>
            </h2>
            <p className="text-xs text-muted mt-1">Sınıflar bir üst sınıfa taşınır, son sınıflar mezun olur, geçen yılın kayıtları arşive geçer.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" aria-label={`${durum.eskiYil} yılından ${durum.yeniYil} yılına`}>
            <span className="ui-chip ui-chip-neutral tabular-nums">{durum.eskiYil}</span>
            <ArrowRight className="w-3.5 h-3.5 text-muted" aria-hidden />
            <span className="ui-chip ui-chip-brand tabular-nums">{durum.yeniYil}</span>
          </span>
        </div>
        {sekmeler.length > 1 && <Segmented size="sm" className="self-start" value={aktifSekme} onChange={setSekme} items={sekmeler} />}
      </section>

      {aktifSekme === 'sihirbaz' && (
        <>
          {!devirMevsimi() && (
            <p className="flex items-start gap-2 rounded-xl bg-info-soft text-info-fg px-3 py-2 text-xs font-semibold" id="yil-mevsim-uyari">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
              Eğitim yılı sürüyor. Yeni yıla geçiş genelde Haziran–Eylül arasında, karneler verildikten sonra yapılır.
            </p>
          )}

          {siniflar.length === 0 ? (
            <Panel>
              <p className="text-xs text-muted text-center py-6">Devredilecek sınıf yok. {durum.yeniYil} sınıfları zaten açık olabilir.</p>
            </Panel>
          ) : (
            <>
              {/* adımlar */}
              <ol className="grid grid-cols-3 gap-2" aria-label="Adımlar">
                {(['Sınıflar', 'Öğretmen Atamaları', 'Onay'] as const).map((ad, i) => {
                  const n = (i + 1) as Adim;
                  const bitti = n < adim;
                  const simdi = n === adim;
                  return (
                    <li key={ad}>
                      <button
                        type="button"
                        disabled={n > adim || mesgul}
                        onClick={() => adimaGit(n)}
                        aria-current={simdi ? 'step' : undefined}
                        className={cx(
                          'w-full h-10 flex items-center justify-center sm:justify-start gap-2 px-3 rounded-xl border bg-surface text-xs font-semibold transition-colors',
                          simdi ? 'border-brand text-fg shadow-card' : 'border-line text-muted',
                          bitti && 'hover:border-line-strong cursor-pointer',
                          n > adim && 'cursor-default'
                        )}
                      >
                        <span
                          className={cx(
                            'grid place-items-center w-5 h-5 rounded-full text-2xs tabular-nums shrink-0',
                            bitti ? 'bg-success text-white' : simdi ? 'bg-brand text-canvas' : 'bg-surface-2 text-muted'
                          )}
                        >
                          {bitti ? <Check className="w-3 h-3" aria-hidden /> : n}
                        </span>
                        <span className="hidden sm:inline truncate">{ad}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {adim === 1 && (
                <Panel title="Sınıflar Nereye Geçiyor" description="Önerilen eşleme hazır. Değiştirmek istediğiniz satırı seçin; sınıfta kalan öğrenciyi satırın yanından işaretleyin.">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Sayac deger={hesap.tasinan} ad="Üst sınıfa geçen" />
                      <Sayac deger={hesap.mezun} ad="Mezun olan" ton={hesap.mezun ? 'uyari' : undefined} />
                      <Sayac deger={hesap.kalan} ad="Sınıfta kalan" />
                      <Sayac deger={hesap.yeniSiniflar.length} ad="Açılacak yeni sınıf" />
                    </div>

                    <div className="border border-line rounded-xl overflow-hidden">
                      <div className="hidden sm:grid grid-cols-[5.5rem_4.5rem_1rem_minmax(0,1fr)_9rem] gap-3 px-3 py-2 bg-surface-2 ui-eyebrow">
                        <span>Bu yıl</span>
                        <span>Öğrenci</span>
                        <span />
                        <span>{durum.yeniYil}</span>
                        <span>Sınıfta kalan</span>
                      </div>
                      <ul className="divide-y divide-line">
                        {siniflar.map((c) => {
                          const h = hedef[c.id] || 'ust';
                          const k = kalan[c.id] || [];
                          const acik = acikKalan === c.id;
                          return (
                            <li key={c.id} className="bg-surface">
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[5.5rem_4.5rem_1rem_minmax(0,1fr)_9rem] items-center gap-x-3 gap-y-2 px-3 py-2">
                                <span className="min-w-0">
                                  <b className="block text-sm text-fg">{c.ad}</b>
                                  <span className="block text-xs text-muted tabular-nums">{c.yil}</span>
                                </span>
                                <span className="hidden sm:block text-xs text-muted tabular-nums">{c.ogrenciler.length} öğr.</span>
                                <ArrowRight className="hidden sm:block w-3.5 h-3.5 text-subtle" aria-hidden />
                                <div className={cx('col-span-2 sm:col-span-1 order-3 sm:order-none', h === 'mezun' && '[&_select]:bg-warning-soft [&_select]:text-warning-fg [&_select]:border-transparent')}>
                                  <SelectBox
                                    aria-label={`${c.ad} yeni yılda`}
                                    value={h}
                                    onChange={(e) => setHedef((x) => ({ ...x, [c.id]: e.target.value as DevirHedef }))}
                                  >
                                    {c.seviye < 12 && <option value="ust">Üst sınıfa: {ustAd(c.ad, c.seviye)}</option>}
                                    <option value="ayni">Aynı adla kalsın: {c.ad}</option>
                                    <option value="mezun">Mezun</option>
                                  </SelectBox>
                                </div>
                                <button
                                  type="button"
                                  className={cx('justify-self-end sm:justify-self-start h-8 px-2 rounded-lg text-xs font-semibold transition-colors', k.length ? 'text-brand-fg bg-brand-soft' : 'text-brand-fg hover:bg-surface-2')}
                                  aria-expanded={acik}
                                  aria-controls={`kalan-${c.id}`}
                                  onClick={() => setAcikKalan(acik ? null : c.id)}
                                  disabled={!c.ogrenciler.length}
                                >
                                  {k.length ? `${k.length} öğrenci kalıyor` : c.ogrenciler.length ? 'Kalan öğrenci seç' : 'Öğrenci yok'}
                                </button>
                              </div>
                              {acik && (
                                <div id={`kalan-${c.id}`} className="mx-3 mb-3 rounded-xl bg-surface-2 p-3">
                                  <p className="text-xs text-fg-2">
                                    <b className="text-fg">{c.ad}: sınıfta kalacak öğrenciler.</b> <span className="text-muted">Yeni yılda yine {c.ad} olurlar.</span>
                                  </p>
                                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                    {c.ogrenciler.map((s) => {
                                      const secili = k.includes(s.id);
                                      return (
                                        <label
                                          key={s.id}
                                          className={cx(
                                            'flex items-center gap-2 h-8 px-2.5 rounded-lg border text-xs cursor-pointer transition-colors',
                                            secili ? 'bg-warning-soft border-transparent text-fg' : 'bg-surface border-line text-fg-2 hover:border-line-strong'
                                          )}
                                        >
                                          <input
                                            type="checkbox"
                                            className="accent-current"
                                            checked={secili}
                                            onChange={() =>
                                              setKalan((x) => ({ ...x, [c.id]: secili ? k.filter((id) => id !== s.id) : [...k, s.id] }))
                                            }
                                          />
                                          <span className="truncate" title={s.ad}>
                                            {s.ad}
                                          </span>
                                          {s.no && <span className="ml-auto text-muted tabular-nums">{s.no}</span>}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {enAltlar.length > 0 && (
                      <label className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 cursor-pointer">
                        <input type="checkbox" className="mt-0.5" checked={bosAc} onChange={(e) => setBosAc(e.target.checked)} />
                        <span className="text-xs">
                          <b className="text-fg">Boş {enAltlar.join(', ')} sınıflarını da aç.</b>
                          <span className="block text-muted">Yeni gelen öğrenciler devirden sonra bu sınıflara eklenir.</span>
                        </span>
                      </label>
                    )}
                  </div>
                </Panel>
              )}

              {adim === 2 && (
                <>
                  <Panel title="Öğretmen Atamaları" description="Hangi öğretmenin hangi sınıfa hangi derse gireceği yeni yıla nasıl taşınsın?">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5" role="radiogroup" aria-label="Öğretmen atamaları">
                      {ATAMALAR.map((a) => {
                        const secili = atama === a.k;
                        return (
                          <label
                            key={a.k}
                            className={cx(
                              'relative flex flex-col gap-1.5 rounded-xl border p-3.5 cursor-pointer transition-[border-color,box-shadow] duration-200',
                              secili ? 'border-brand shadow-card bg-surface' : 'border-line bg-surface hover:border-line-strong'
                            )}
                          >
                            <input type="radio" name="yil-atama" className="sr-only" checked={secili} onChange={() => setAtama(a.k)} />
                            <span className="flex items-center justify-between gap-2">
                              <b className="text-sm text-fg">{a.ad}</b>
                              <span
                                aria-hidden
                                className={cx('w-4 h-4 rounded-full border-2 transition-colors', secili ? 'border-brand bg-brand shadow-[inset_0_0_0_3px_var(--color-surface)]' : 'border-line-strong')}
                              />
                            </span>
                            <span className="text-xs text-muted min-h-8">{a.acik}</span>
                            <span className="mt-auto rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-fg-2">{a.ornek({ eski: durum.eskiYil, yeni: durum.yeniYil })}</span>
                          </label>
                        );
                      })}
                    </div>
                  </Panel>
                  <Panel title="Neler Aynen Kalır, Neler Yenilenir">
                    <ul className="space-y-2">
                      <Satir ton="ok">
                        <b className="text-fg">Aynen kalır:</b> öğretmen ve öğrenci hesapları, şifreler, ders saatleri ve zil çizelgesi, kurum ayarları, belgeler;
                        öğrencinin denemeleri, soru kayıtları ve çalışma planları.
                      </Satir>
                      <Satir ton="yeni">
                        <b className="text-fg">Yeni yıl için yeniden girilir:</b> haftalık ders programı (geçen yılınki kapanır), akademik takvim.
                      </Satir>
                      <Satir ton="arsiv">
                        <b className="text-fg">Arşive geçer (silinmez):</b> geçen yılın sınıfları ve onlara verilen ödevler, yoklamalar. Geçmiş Yıllar bölümünden açılır.
                      </Satir>
                    </ul>
                  </Panel>
                </>
              )}

              {adim === 3 && (
                <Panel title="Son Kontrol" description="Onaylayınca hepsi tek seferde yapılır. 7 gün içinde, yeni yıla kayıt girilmeden geri alınabilir.">
                  {onizlemeHata ? (
                    <YuklemeHatasi mesaj={onizlemeHata} onTekrar={onizle} />
                  ) : !onizleme ? (
                    <Yukleniyor metin="Veritabanında deneniyor…" satir={4} />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ul className="space-y-2" id="yil-ozet">
                        <Satir ton="ok">
                          <b className="text-fg tabular-nums">{onizleme.tasinan}</b> öğrenci üst sınıfa geçer
                        </Satir>
                        <Satir ton="arsiv">
                          <b className="text-fg tabular-nums">{onizleme.mezun}</b> öğrenci mezun olur
                        </Satir>
                        <Satir ton="yeni">
                          <b className="text-fg tabular-nums">{onizleme.kalan}</b> öğrenci sınıfta kalır
                        </Satir>
                        <Satir ton="yeni">
                          <b className="text-fg tabular-nums">{onizleme.yeniSinif}</b> sınıf açılır ({onizleme.yeniYil}):{' '}
                          <span className="text-muted">{onizleme.yeniSiniflar.join(', ')}</span>
                        </Satir>
                        <Satir ton="ok">
                          Öğretmen atamaları: <b className="text-fg">{ATAMALAR.find((a) => a.k === atama)?.ad}</b>
                          {atama !== 'bos' && <span className="text-muted"> ({onizleme.atama} ders ataması taşınır)</span>}
                        </Satir>
                        <Satir ton="arsiv">
                          {onizleme.eskiYil} yılının <b className="text-fg tabular-nums">{onizleme.arsivSinif}</b> sınıfı arşive geçer
                          {onizleme.programKapanan > 0 && <span className="text-muted">, {onizleme.programKapanan} ders programı saati kapanır</span>}
                        </Satir>
                      </ul>
                      <div className="space-y-3">
                        {onizleme.mezun > 0 && (
                          <div className="rounded-xl bg-warning-soft px-3 py-2.5 text-xs text-warning-fg">
                            <b className="flex items-center gap-1.5">
                              <TriangleAlert className="w-3.5 h-3.5" aria-hidden /> Mezun olan {onizleme.mezun} öğrencinin girişi kapanır.
                            </b>
                            <span className="block mt-0.5">Kayıtları arşivde kalır; gerekirse Geçmiş Yıllar bölümünden tek tek yeniden açılabilir.</span>
                          </div>
                        )}
                        <label className="block">
                          <span className="block text-xs font-semibold text-fg mb-1.5">Onaylamak için kurum adını yazın</span>
                          <input
                            className="ui-input w-full"
                            value={onay}
                            onChange={(e) => setOnay(e.target.value)}
                            placeholder={durum.kurumAd}
                            autoComplete="off"
                            id="yil-onay"
                          />
                          <span className="block mt-1 text-xs text-muted">Büyük küçük harf fark etmez.</span>
                        </label>
                      </div>
                    </div>
                  )}
                </Panel>
              )}

              <div className="flex items-center gap-3">
                {adim > 1 ? (
                  <Button variant="secondary" genislik="orta" onClick={() => adimaGit((adim - 1) as Adim)} disabled={mesgul}>
                    Geri
                  </Button>
                ) : (
                  <span className="text-xs text-muted flex-1">Henüz hiçbir şey değişmedi; son adımda onaylayınca uygulanır.</span>
                )}
                {adim > 1 && <span className="flex-1" />}
                {adim < 3 ? (
                  <Button genislik="orta" onClick={() => adimaGit((adim + 1) as Adim)} rightIcon={<ArrowRight className="w-3.5 h-3.5" />} id="yil-devam">
                    Devam
                  </Button>
                ) : (
                  <Button genislik="uzun" onClick={() => void uygula()} disabled={!onayTamam || !onizleme} isLoading={mesgul} loadingText="Geçiliyor…" id="yil-uygula">
                    Yeni Yıla Geç
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {aktifSekme === 'sonra' && sonDevir && <DevirdenSonra devir={sonDevir} onDegisti={() => { verileriTazele(); void oku(); }} />}

      {aktifSekme === 'gecmis' && <GecmisYillar devirler={gecerliDevirler} aktifSiniflar={siniflar.map((c) => ({ id: c.id, ad: c.ad }))} onDegisti={verileriTazele} />}
    </div>
  );
};

// ---------------------------------------------------------------- Devirden sonra
const DevirdenSonra: React.FC<{ devir: DevirKaydi; onDegisti: () => void }> = ({ devir, onDegisti }) => {
  const [geri, setGeri] = useState<GeriAlmaDurumu | null>(null);
  const [geriHata, setGeriHata] = useState<string | null>(null);
  const [onayAcik, setOnayAcik] = useState(false);
  const [mesgul, setMesgul] = useState(false);

  useEffect(() => {
    if (devir.geriAlindi) return;
    let iptal = false;
    setGeri(null);
    geriAlmaDurumu(devir.id).then(
      (g) => !iptal && setGeri(g),
      (e) => !iptal && setGeriHata(e?.message || 'Okunamadı.')
    );
    return () => {
      iptal = true;
    };
  }, [devir.id, devir.geriAlindi]);

  const geriAl = async () => {
    setMesgul(true);
    try {
      await devriGeriAl(devir.id);
      basariBildir('Devir geri alındı', `Sınıflar ve öğrenciler ${devir.eskiYil} hâline döndü.`);
      setOnayAcik(false);
      onDegisti();
    } catch (e: any) {
      hataBildir('Geri alınamadı', e?.message || 'İşlem yapılamadı.');
    } finally {
      setMesgul(false);
    }
  };

  const o = devir.ozet;
  if (devir.geriAlindi) {
    return (
      <Panel>
        <p className="flex items-center justify-center gap-2 text-xs text-muted py-6">
          <Undo2 className="w-4 h-4" aria-hidden /> {devir.eskiYil} → {devir.yeniYil} devri {tarihYaz(devir.geriAlindi, true)} tarihinde geri alındı.
        </p>
      </Panel>
    );
  }
  return (
    <>
      <Panel>
        <div className="text-center pt-4 pb-2">
          <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-success-soft text-success-fg">
            <Check className="w-5 h-5" aria-hidden />
          </span>
          <h3 style={SERIF} className="text-3xl text-fg mt-3">
            {devir.yeniYil} Başladı
          </h3>
          <p className="text-xs text-fg-2 mt-1.5">
            {o.tasinan} öğrenci üst sınıfa geçti, {o.mezun} öğrenci mezun oldu{o.kalan ? `, ${o.kalan} öğrenci sınıfında kaldı` : ''}, {o.yeniSinif} sınıf açıldı.
          </p>
          <p className="text-xs text-muted mt-0.5">
            {tarihYaz(devir.yapildi, true)}
            {devir.yapan ? ` · ${devir.yapan}` : ''}
          </p>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
          <div className="flex-1 text-xs text-fg-2 min-w-0">
            {geriHata ? (
              <span className="text-danger-fg">{geriHata}</span>
            ) : !geri ? (
              <span className="text-muted">Geri alma durumu okunuyor…</span>
            ) : geri.ok ? (
              <>
                <b className="text-fg">Bir yanlışlık mı var?</b> {tarihYaz(geri.son)} tarihine kadar, yeni yıla kayıt girilmediği sürece her şey önceki hâline döner.
              </>
            ) : (
              <>
                <b className="text-fg">Bu devir artık geri alınamaz.</b>{' '}
                {geri.engel.map((e) => (e.sayi ? `${e.ad} (${e.sayi})` : e.ad)).join(', ')}
                {geri.engel.some((e) => e.sayi) && ' yeni yılın sınıflarına girildi.'}
              </>
            )}
          </div>
          <Button variant="danger-soft" genislik="orta" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} disabled={!geri?.ok} onClick={() => setOnayAcik(true)} id="yil-geri-al">
            Devri Geri Al
          </Button>
        </div>
      </Panel>
      <Panel title="Sıradaki İşler">
        <ol className="space-y-2">
          {[
            'Yeni gelen öğrencileri ekleyin (Öğrenciler › Excel ile ekle).',
            'Haftalık ders programını girin (Ders programı › Program).',
            'Akademik takvimi yükleyin.',
            ...(o.mezun ? ['Mezunların listesine Geçmiş Yıllar bölümünden bakabilirsiniz.'] : []),
          ].map((m, i) => (
            <li key={m} className="flex items-start gap-2.5 text-xs text-fg-2 leading-5">
              <span className="grid place-items-center w-5 h-5 rounded-lg bg-brand-soft text-brand-fg text-2xs font-semibold tabular-nums shrink-0">{i + 1}</span>
              {m}
            </li>
          ))}
        </ol>
      </Panel>
      <Modal
        open={onayAcik}
        onClose={() => !mesgul && setOnayAcik(false)}
        size="sm"
        icon={RotateCcw}
        tone="danger"
        title="Devri Geri Al"
        footer={
          <>
            <Button variant="secondary" genislik="orta" onClick={() => setOnayAcik(false)} disabled={mesgul}>
              Vazgeç
            </Button>
            <Button variant="danger" genislik="orta" onClick={() => void geriAl()} isLoading={mesgul} loadingText="Geri alınıyor…">
              Geri Al
            </Button>
          </>
        }
      >
        <p className="text-xs text-fg-2">
          {devir.yeniYil} sınıfları silinir, öğrenciler {devir.eskiYil} sınıflarına ve mezunlar eski durumlarına döner, geçen yılın ders atamaları ve
          programı yeniden açılır.
        </p>
      </Modal>
    </>
  );
};

// ---------------------------------------------------------------- Geçmiş yıllar
const GecmisYillar: React.FC<{ devirler: DevirKaydi[]; aktifSiniflar: { id: string; ad: string }[]; onDegisti: () => void }> = ({
  devirler,
  aktifSiniflar,
  onDegisti,
}) => {
  const [secili, setSecili] = useState<string>(devirler[0]?.id || '');
  const [arsiv, setArsiv] = useState<YilArsivi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState<ArsivSinif | null>(null);

  const oku = useCallback(async () => {
    if (!secili) return;
    setArsiv(null);
    setHata(null);
    try {
      setArsiv(await yilArsivi(secili));
    } catch (e: any) {
      setHata(e?.message || 'Okunamadı.');
    }
  }, [secili]);
  useEffect(() => {
    void oku();
  }, [oku]);

  return (
    <>
      <Panel
        icon={Archive}
        tone="neutral"
        title="Geçmiş Yıllar"
        description="Devirde arşive geçen sınıflar, o günkü öğrencileri ve nereye gittikleri. Arşiv yalnız okunur."
        actions={
          devirler.length > 1 ? (
            <Segmented size="sm" value={secili} onChange={setSecili} items={devirler.map((d) => ({ value: d.id, label: d.eskiYil }))} />
          ) : (
            <span className="ui-chip ui-chip-neutral">{devirler[0]?.eskiYil}</span>
          )
        }
      >
        {hata ? (
          <YuklemeHatasi mesaj={hata} onTekrar={oku} />
        ) : !arsiv ? (
          <Yukleniyor metin="Arşiv okunuyor…" satir={3} />
        ) : arsiv.siniflar.length === 0 ? (
          <p className="text-xs text-muted text-center py-6">Bu yılda arşive geçen sınıf yok.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {arsiv.siniflar.map((c) => {
              const mezun = c.ogrenciler.filter((s) => s.gittigi === 'Mezun').length;
              return (
                <li key={c.id} className="flex flex-col rounded-xl border border-dashed border-line-strong bg-surface p-3">
                  <span style={SERIF} className="text-2xl leading-none text-fg">
                    {c.ad}
                  </span>
                  <span className="mt-1 text-xs text-muted tabular-nums">
                    {c.ogrenciler.length} öğrenci
                    {c.odev != null && ` · ${c.odev} ödev`}
                  </span>
                  <span className="mt-2.5 flex items-center justify-between gap-2">
                    <span className={cx('ui-chip', mezun ? 'ui-chip-warning' : 'ui-chip-neutral')}>{mezun ? `${mezun} mezun` : 'Arşivde'}</span>
                    <Button variant="secondary" size="sm" onClick={() => setAcik(c)}>
                      Aç
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {acik && arsiv && (
        <ArsivSinifPenceresi
          sinif={acik}
          yil={arsiv.eskiYil}
          aktifSiniflar={aktifSiniflar}
          onClose={() => setAcik(null)}
          onDegisti={() => {
            onDegisti();
            void oku().then(() => setAcik(null));
          }}
        />
      )}
    </>
  );
};

const ArsivSinifPenceresi: React.FC<{
  sinif: ArsivSinif;
  yil: string;
  aktifSiniflar: { id: string; ad: string }[];
  onClose: () => void;
  onDegisti: () => void;
}> = ({ sinif, yil, aktifSiniflar, onClose, onDegisti }) => {
  const [acilan, setAcilan] = useState<string | null>(null);
  const [hedefSinif, setHedefSinif] = useState('');
  const [mesgul, setMesgul] = useState(false);

  const ac = async (id: string, ad: string) => {
    if (!hedefSinif) return;
    setMesgul(true);
    try {
      const s = await mezunuGeriAl(id, hedefSinif);
      basariBildir(`${ad} yeniden açıldı`, `${s} sınıfına eklendi; giriş yapabilir.`);
      onDegisti();
    } catch (e: any) {
      hataBildir('Açılamadı', e?.message || 'İşlem yapılamadı.');
    } finally {
      setMesgul(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" icon={Archive} tone="neutral" title={`${sinif.ad} · ${yil}`} description="Devir günündeki öğrenciler ve yeni yıldaki yerleri.">
      <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden">
        {sinif.ogrenciler.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted">Bu sınıfta öğrenci yoktu.</li>}
        {sinif.ogrenciler.map((s) => (
          <li key={s.id} className="bg-surface px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-fg truncate" title={s.ad}>
                  {s.ad}
                </span>
                {s.no && <span className="block text-xs text-muted tabular-nums">{s.no}</span>}
              </span>
              <span className={cx('ui-chip w-28 justify-center', s.gittigi === 'Mezun' ? (s.mezunSimdi ? 'ui-chip-warning' : 'ui-chip-neutral') : s.kaldi ? 'ui-chip-info' : 'ui-chip-success')}>
                {s.gittigi === 'Mezun' ? (s.mezunSimdi ? 'Mezun' : 'Yeniden açıldı') : s.kaldi ? `Kaldı · ${s.gittigi}` : s.gittigi}
              </span>
              {s.mezunSimdi ? (
                <Button variant="secondary" size="sm" genislik="kisa" leftIcon={<UserCheck className="w-3.5 h-3.5" />} onClick={() => { setAcilan(acilan === s.id ? null : s.id); setHedefSinif(''); }}>
                  Aç
                </Button>
              ) : (
                <span className="w-24 shrink-0" aria-hidden />
              )}
            </div>
            {acilan === s.id && (
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg bg-surface-2 p-2">
                <span className="text-xs text-fg-2 sm:flex-1">Hangi sınıfa eklensin? Girişi yeniden açılır.</span>
                <div className="sm:w-40">
                  <SelectBox aria-label="Sınıf" value={hedefSinif} onChange={(e) => setHedefSinif(e.target.value)}>
                    <option value="">Sınıf seçin</option>
                    {aktifSiniflar.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ad}
                      </option>
                    ))}
                  </SelectBox>
                </div>
                <Button size="sm" genislik="kisa" disabled={!hedefSinif} isLoading={mesgul} loadingText="Açılıyor…" onClick={() => void ac(s.id, s.ad)}>
                  Aktife Al
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {(sinif.odev != null || sinif.yoklama != null) && (
        <p className="mt-3 text-xs text-muted">
          Bu sınıfa geçen yıl {sinif.odev ?? 0} ödev verildi{sinif.yoklama != null ? `, ${sinif.yoklama} ders yoklaması alındı` : ''}. Kayıtlar arşivde durur.
        </p>
      )}
    </Modal>
  );
};
