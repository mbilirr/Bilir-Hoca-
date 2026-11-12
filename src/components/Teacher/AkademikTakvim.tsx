import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarRange, Check, Download, FileSpreadsheet, MapPin, Mic2, Plus, Trash2, Upload } from 'lucide-react';
import { EmptyState, Modal, PageHeader, Panel, Segmented, StatCard, cx } from '../ui/kit';
import { SelectBox } from './FormParts';
import { appConfirm } from '../../lib/appDialog';
import { dataService } from '../../services/dataService';
import {
  AY_ADLARI,
  AY_KISA,
  BIRIMLER,
  GUN_KISA_PAZAR,
  OKUL_AYLARI,
  SINIFLAR,
  ZUMRELER,
  baslik,
  bugun,
  buyuk,
  egitimYili,
  etkinlikKaydet,
  etkinlikler,
  gunEkle,
  kontrolIsaretle,
  pazartesi,
  satirAnahtari,
  sinifAdi,
  siniflarYazi,
  takvimCanliDinle,
  takvimListesi,
  takvimYukle,
  tarihCoz,
  tarihYaz,
  yilAdi,
  yilAraligi,
  type AktEtkinlik,
  type AktKapsam,
  type AktKayit,
  type AktSatir,
  type AktYer,
} from '../../services/akademikTakvimService';
import { takvimExcelOku, takvimSablonIndir, type OkunanSatir } from '../../lib/akademikTakvimExcel';

// ============================================================================
// Aşama 242: AKADEMİK TAKVİM sayfası (kurum bölümü "Akademik takvim" açıksa menüde görünür)
//  * Herkes okur; kurum yöneticisi (Müdür, Müdür Yrd.) Excel yükler, etkinlik ekler / düzenler / siler, "kontrol" işaretler.
//  * Excel: kurumun kendi biçimi (her ay ayrı sayfa). Önce ekranda okunur ve gösterilir; "Kaydet"e basılınca yazılır.
//  * Ana sayfadaki "Haftanın faaliyetleri" aynı kayıtları okur; değişiklik anlık güncellemeyle her ekrana yayılır.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 justify-center';
type Bildirim = { tone: 'ok' | 'err'; text: string } | null;

const DtKutu: React.FC<{ tarih: string; vurgu?: boolean }> = ({ tarih, vurgu }) => {
  const d = tarihCoz(tarih);
  return (
    <span className={cx('w-12 h-12 shrink-0 rounded-xl flex flex-col items-center justify-center leading-none', vurgu ? 'bg-brand text-white' : 'bg-surface-2 text-fg')}>
      <b className="text-lg font-bold tabular-nums">{d.getDate()}</b>
      <span className={cx('text-[10px] font-semibold uppercase tracking-wide mt-0.5', vurgu ? 'text-white/80' : 'text-muted')}>{GUN_KISA_PAZAR[d.getDay()]}</span>
    </span>
  );
};

export const AkademikTakvim: React.FC = () => {
  const kurumId = dataService.getMyKurumId();
  const yonetir = dataService.canManageAkademikTakvim();
  const [yil, setYil] = useState(() => egitimYili());
  const [kayitlar, setKayitlar] = useState<AktKayit[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [ay, setAy] = useState(0);
  const [fSinif, setFSinif] = useState('');
  const [fKapsam, setFKapsam] = useState<'' | AktKapsam>('');
  const [fYer, setFYer] = useState<'' | AktYer>('');
  const [duzenle, setDuzenle] = useState<AktEtkinlik | 'yeni' | null>(null);
  const [excelAcik, setExcelAcik] = useState(false);

  const yukle = useCallback(async () => {
    if (!kurumId) return;
    const { bas, bit } = yilAraligi(yil);
    try {
      setKayitlar(await takvimListesi(kurumId, bas, bit));
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Takvim okunamadı.');
    } finally {
      setYukleniyor(false);
    }
  }, [kurumId, yil]);
  useEffect(() => {
    setYukleniyor(true);
    void yukle();
  }, [yukle]);
  useEffect(() => takvimCanliDinle(kurumId, () => void yukle()), [kurumId, yukle]);
  useEffect(() => {
    if (!bildirim) return;
    const t = setTimeout(() => setBildirim(null), 3200);
    return () => clearTimeout(t);
  }, [bildirim]);

  const hepsi = useMemo(() => etkinlikler(kayitlar), [kayitlar]);
  const bugunS = tarihYaz(bugun());
  const hafta = useMemo(() => {
    const p = pazartesi(bugun());
    return { bas: tarihYaz(p), bit: tarihYaz(gunEkle(p, 6)) };
  }, []);
  const salonGun = useMemo(() => {
    const c: Record<string, number> = {};
    hepsi.forEach((g) => g.salon && (c[g.tarih] = (c[g.tarih] || 0) + 1));
    return c;
  }, [hepsi]);
  const uyar = (g: AktEtkinlik) => (!fSinif || g.siniflar.includes(fSinif)) && (!fKapsam || g.kapsam === fKapsam) && (!fYer || g.yer === fYer);
  const ayOf = (g: AktEtkinlik) => tarihCoz(g.tarih).getMonth() + 1;
  const gorunen = hepsi.filter((g) => uyar(g) && (!ay || ayOf(g) === ay));

  const kontrolDegis = async (g: AktEtkinlik) => {
    try {
      await kontrolIsaretle(g.ids, !g.kontrol);
      await yukle();
    } catch (e: any) {
      setBildirim({ tone: 'err', text: e?.message || 'Kaydedilemedi.' });
    }
  };

  if (!kurumId) {
    return <EmptyState icon={CalendarRange} title="Akademik takvim kuruma bağlı çalışır" description="Bu bölüm yalnız açıldığı kurumda kullanılır." />;
  }

  const yillar = [egitimYili() - 1, egitimYili(), egitimYili() + 1];
  const say = (f: (g: AktEtkinlik) => boolean) => hepsi.filter(f).length;

  return (
    <div className="space-y-5" id="akademik-takvim">
      <PageHeader
        icon={CalendarRange}
        title="Akademik takvim"
        description={`${yilAdi(yil)} eğitim öğretim yılı · öğrenci ve veli etkinlikleri. Ana sayfadaki "Haftanın faaliyetleri" buradan gelir.`}
        actions={
          <>
            <div className="w-36">
              <SelectBox id="akt-yil" aria-label="Eğitim öğretim yılı" value={yil} onChange={(e) => setYil(Number(e.target.value))}>
                {yillar.map((y) => (
                  <option key={y} value={y}>
                    {yilAdi(y)}
                  </option>
                ))}
              </SelectBox>
            </div>
            {yonetir && (
              <>
                <button type="button" id="akt-sablon" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={() => void takvimSablonIndir(yil)}>
                  <Download className="w-3.5 h-3.5" /> Şablon
                </button>
                <button type="button" id="akt-ekle" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={() => setDuzenle('yeni')}>
                  <Plus className="w-3.5 h-3.5" /> Etkinlik ekle
                </button>
                <button type="button" id="akt-excel" className={cx(BTN, 'w-28 ui-btn-primary')} onClick={() => setExcelAcik(true)}>
                  <Upload className="w-3.5 h-3.5" /> Excel yükle
                </button>
              </>
            )}
          </>
        }
      />

      {bildirim && (
        <div role="status" className={cx('rounded-xl px-4 py-2.5 text-xs font-semibold', bildirim.tone === 'ok' ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg')}>
          {bildirim.text}
        </div>
      )}
      {hata && (
        <div role="alert" className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-danger-soft text-danger-fg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {hata}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Etkinlik" value={hepsi.length} hint={`${kayitlar.length} sınıf kaydı`} />
        <StatCard label="Öğrenci etkinliği" value={say((g) => g.kapsam === 'ogrenci')} hint="öğrencilere yönelik" />
        <StatCard label="Veli etkinliği" value={say((g) => g.kapsam === 'veli')} hint={`${say((g) => g.salon)} tanesi konferans salonunda`} />
        <StatCard label="Okul dışı" value={say((g) => g.yer === 'dis')} hint="gezi ve ziyaret" />
      </div>

      <Panel padded={false}>
        <div className="p-4 sm:p-5 space-y-3 border-b border-line">
          {/* Aylar: eşit genişlikte, altında etkinlik sayısı */}
          <div className="grid grid-flow-col auto-cols-[64px] sm:auto-cols-fr gap-1 p-1 rounded-xl bg-surface-2 border border-line overflow-x-auto" role="tablist" aria-label="Ay">
            {[0, ...OKUL_AYLARI].map((m) => {
              const n = hepsi.filter((g) => uyar(g) && (!m || ayOf(g) === m)).length;
              const aktif = ay === m;
              const simdi = m === tarihCoz(bugunS).getMonth() + 1;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={aktif}
                  id={`akt-ay-${m}`}
                  onClick={() => setAy(m)}
                  className={cx(
                    'h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors cursor-pointer',
                    aktif ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
                    !n && !aktif && 'opacity-50'
                  )}
                >
                  <span className="flex items-center gap-1">
                    {m ? AY_KISA[m - 1] : 'Tümü'}
                    {simdi && <span className="w-1 h-1 rounded-full bg-brand" aria-label="bu ay" />}
                  </span>
                  <span className={cx('text-[10px] tabular-nums', aktif ? 'text-brand-fg' : 'text-subtle')}>{n || '–'}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <SelectBox id="akt-sinif" aria-label="Sınıf" value={fSinif} onChange={(e) => setFSinif(e.target.value)}>
                <option value="">Bütün sınıflar</option>
                {SINIFLAR.map((s) => (
                  <option key={s} value={s}>
                    {sinifAdi(s)}
                  </option>
                ))}
              </SelectBox>
            </div>
            <Segmented
              size="sm"
              value={fKapsam}
              onChange={setFKapsam}
              items={[
                { value: '', label: 'Tümü', id: 'akt-kapsam-tumu' },
                { value: 'ogrenci', label: 'Öğrenci', id: 'akt-kapsam-ogrenci' },
                { value: 'veli', label: 'Veli', id: 'akt-kapsam-veli' },
              ]}
            />
            <Segmented
              size="sm"
              value={fYer}
              onChange={setFYer}
              items={[
                { value: '', label: 'Tümü', id: 'akt-yer-tumu' },
                { value: 'ic', label: 'Okul içi', id: 'akt-yer-ic' },
                { value: 'dis', label: 'Okul dışı', id: 'akt-yer-dis' },
              ]}
            />
          </div>
        </div>

        {yukleniyor ? (
          <p className="p-5 text-xs text-muted">Takvim yükleniyor…</p>
        ) : !gorunen.length ? (
          <EmptyState
            icon={CalendarRange}
            title={hepsi.length ? 'Bu seçimde etkinlik yok' : `${yilAdi(yil)} takvimi henüz yüklenmedi`}
            description={hepsi.length ? 'Ayı ya da süzgeci değiştirin.' : yonetir ? 'Kurumun Excel takvimini yükleyin ya da etkinlikleri tek tek ekleyin.' : 'Takvim kurum yönetimi tarafından yüklenecek.'}
            action={
              !hepsi.length && yonetir ? (
                <button type="button" className={cx(BTN, 'w-28 ui-btn-primary')} onClick={() => setExcelAcik(true)}>
                  <Upload className="w-3.5 h-3.5" /> Excel yükle
                </button>
              ) : undefined
            }
          />
        ) : (
          OKUL_AYLARI.map((m) => {
            const liste = gorunen.filter((g) => ayOf(g) === m);
            if (!liste.length) return null;
            return (
              <section key={m} className="px-4 sm:px-5 py-3 border-b border-line last:border-b-0" aria-labelledby={`akt-ay-baslik-${m}`}>
                <h3 id={`akt-ay-baslik-${m}`} className="flex items-baseline gap-2 py-1">
                  <span className="text-base font-bold text-fg">{AY_ADLARI[m - 1]}</span>
                  <span className="text-xs text-muted">
                    {m >= 9 ? yil : yil + 1} · {liste.length} etkinlik
                  </span>
                </h3>
                <ul className="divide-y divide-line">
                  {liste.map((g) => {
                    const buHafta = g.tarih >= hafta.bas && g.tarih <= hafta.bit;
                    const gecti = g.tarih < bugunS && !buHafta;
                    const meta = [siniflarYazi(g.siniflar), g.birim && baslik(g.birim), g.zumre && baslik(g.zumre)].filter(Boolean).join(' · ');
                    const icerik = (
                      <>
                        <DtKutu tarih={g.tarih} vurgu={buHafta} />
                        <span className="min-w-0 flex-1">
                          <b className="block text-sm font-semibold text-fg truncate">{baslik(g.ad)}</b>
                          <span className="block text-xs text-muted truncate mt-0.5">{meta}</span>
                        </span>
                        <span className="hidden md:flex flex-wrap justify-end gap-1.5">
                          {buHafta && <span className="ui-chip ui-chip-brand">Bu hafta</span>}
                          {gecti && <span className="ui-chip ui-chip-neutral">Geçti</span>}
                          {g.salon && salonGun[g.tarih] > 1 && <span className="ui-chip ui-chip-warning">Salon çakışıyor</span>}
                          <span className={cx('ui-chip', g.kapsam === 'veli' ? 'ui-chip-warning' : 'ui-chip-brand')}>{g.kapsam === 'veli' ? 'Veli' : 'Öğrenci'}</span>
                          <span className="ui-chip ui-chip-neutral">
                            {g.yer === 'dis' && <MapPin className="w-3 h-3" />}
                            {g.yer === 'dis' ? 'Okul dışı' : 'Okul içi'}
                          </span>
                          {g.salon && (
                            <span className="ui-chip ui-chip-info">
                              <Mic2 className="w-3 h-3" /> Salon
                            </span>
                          )}
                        </span>
                      </>
                    );
                    return (
                      <li key={g.key} className={cx('flex items-center gap-3 py-2.5', gecti && 'opacity-60')}>
                        {yonetir ? (
                          <button
                            type="button"
                            className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl -mx-1 px-1 py-1 hover:bg-surface-2 transition-colors cursor-pointer"
                            onClick={() => setDuzenle(g)}
                            aria-label={`${baslik(g.ad)}, düzenle`}
                          >
                            {icerik}
                          </button>
                        ) : (
                          <div className="flex items-center gap-3 min-w-0 flex-1">{icerik}</div>
                        )}
                        {yonetir ? (
                          <button
                            type="button"
                            aria-pressed={g.kontrol}
                            onClick={() => void kontrolDegis(g)}
                            className={cx(BTN, 'w-28 shrink-0', g.kontrol ? 'ui-btn-success' : 'ui-btn-secondary')}
                            title="Etkinlik kontrol edildi mi"
                          >
                            <Check className="w-3.5 h-3.5" /> {g.kontrol ? 'Kontrol edildi' : 'Kontrol'}
                          </button>
                        ) : (
                          g.kontrol && <span className="ui-chip ui-chip-success shrink-0">Kontrol edildi</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </Panel>

      {yonetir && (
        <EtkinlikPenceresi
          acik={duzenle !== null}
          etkinlik={duzenle && duzenle !== 'yeni' ? duzenle : null}
          yil={yil}
          hepsi={hepsi}
          onClose={() => setDuzenle(null)}
          onBitti={async (text) => {
            setDuzenle(null);
            setBildirim({ tone: 'ok', text });
            await yukle();
          }}
        />
      )}
      {yonetir && (
        <ExcelPenceresi
          acik={excelAcik}
          yil={yil}
          kayitlar={kayitlar}
          onClose={() => setExcelAcik(false)}
          onBitti={async (text) => {
            setExcelAcik(false);
            setBildirim({ tone: 'ok', text });
            await yukle();
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------- etkinlik ekle / düzenle
const EtkinlikPenceresi: React.FC<{
  acik: boolean;
  etkinlik: AktEtkinlik | null;
  yil: number;
  hepsi: AktEtkinlik[];
  onClose: () => void;
  onBitti: (text: string) => void | Promise<void>;
}> = ({ acik, etkinlik, yil, hepsi, onClose, onBitti }) => {
  const [ad, setAd] = useState('');
  const [tarih, setTarih] = useState('');
  const [birim, setBirim] = useState('ORTAOKUL');
  const [zumre, setZumre] = useState('');
  const [siniflar, setSiniflar] = useState<string[]>([]);
  const [kapsam, setKapsam] = useState<AktKapsam>('ogrenci');
  const [yer, setYer] = useState<AktYer>('ic');
  const [salon, setSalon] = useState<'0' | '1'>('0');
  const [denendi, setDenendi] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const { bas, bit } = yilAraligi(yil);

  useEffect(() => {
    if (!acik) return;
    setAd(etkinlik ? baslik(etkinlik.ad) : '');
    setTarih(etkinlik?.tarih || '');
    setBirim(etkinlik?.birim || 'ORTAOKUL');
    setZumre(etkinlik?.zumre || '');
    setSiniflar(etkinlik ? etkinlik.siniflar.filter(Boolean) : []);
    setKapsam(etkinlik?.kapsam || 'ogrenci');
    setYer(etkinlik?.yer || 'ic');
    setSalon(etkinlik?.salon ? '1' : '0');
    setDenendi(false);
    setHata(null);
  }, [acik, etkinlik]);

  const okAd = ad.trim().length > 0;
  const okTarih = !!tarih && tarih >= bas && tarih <= bit;
  const okSinif = siniflar.length > 0;
  const salonCakisma = salon === '1' && tarih ? hepsi.find((g) => g.salon && g.tarih === tarih && g.key !== etkinlik?.key) : undefined;

  const kaydet = async () => {
    setDenendi(true);
    if (!okAd || !okTarih || !okSinif || mesgul) return;
    setMesgul(true);
    setHata(null);
    const ortak = { tarih, ad: buyuk(ad), birim, zumre, kapsam, yer, salon: salon === '1', kontrol: etkinlik?.kontrol || false };
    try {
      await etkinlikKaydet(etkinlik?.ids || [], siniflar.map((s) => ({ ...ortak, sinif: s })));
      await onBitti(etkinlik ? 'Etkinlik güncellendi.' : 'Etkinlik takvime eklendi.');
    } catch (e: any) {
      setHata(e?.message || 'Kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };
  const sil = async () => {
    if (!etkinlik || mesgul) return;
    const ok = await appConfirm({ title: 'Etkinlik silinsin mi?', message: `"${baslik(etkinlik.ad)}" (${siniflarYazi(etkinlik.siniflar)}) takvimden silinecek.`, confirmText: 'Sil', danger: true });
    if (!ok) return;
    setMesgul(true);
    try {
      await etkinlikKaydet(etkinlik.ids, []);
      await onBitti('Etkinlik takvimden silindi.');
    } catch (e: any) {
      setHata(e?.message || 'Silinemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const hataCls = (bad: boolean) => cx('ui-field w-full', denendi && bad && 'border-danger');
  return (
    <Modal
      open={acik}
      onClose={onClose}
      icon={CalendarRange}
      title={etkinlik ? 'Etkinliği düzenle' : 'Etkinlik ekle'}
      description="Akademik takvime yazılır; ana sayfada haftasında görünür."
      id="akt-etkinlik-pencere"
      footer={
        <>
          {etkinlik && (
            <button type="button" className={cx(BTN, 'ui-btn-danger-soft mr-auto')} onClick={() => void sil()} disabled={mesgul}>
              <Trash2 className="w-3.5 h-3.5" /> Sil
            </button>
          )}
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose} disabled={mesgul}>
            Vazgeç
          </button>
          <button type="button" id="akt-etkinlik-kaydet" className={cx(BTN, 'ui-btn-primary')} onClick={() => void kaydet()} disabled={mesgul}>
            {mesgul ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="akt-ad" className="ui-label">Etkinlik adı</label>
          <input id="akt-ad" className={hataCls(!okAd)} maxLength={200} value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Örn. Bilim Merkezi gezisi" />
          {denendi && !okAd && <p className="text-[11px] font-semibold text-danger-fg mt-1">Etkinlik adını yazın.</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="akt-tarih" className="ui-label">Tarih</label>
            <input id="akt-tarih" type="date" className={hataCls(!okTarih)} min={bas} max={bit} value={tarih} onChange={(e) => setTarih(e.target.value)} />
            {denendi && !okTarih && <p className="text-[11px] font-semibold text-danger-fg mt-1">{yilAdi(yil)} yılı içinde bir tarih seçin.</p>}
          </div>
          <div>
            <label htmlFor="akt-birim" className="ui-label">Birim</label>
            <SelectBox id="akt-birim" className="ui-field w-full cursor-pointer" value={birim} onChange={(e) => setBirim(e.target.value)}>
              {BIRIMLER.map((b) => (
                <option key={b} value={b}>
                  {baslik(b)}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
        <div>
          <span className="ui-label flex items-center justify-between">
            Sınıf <span className="text-[10px] font-normal text-subtle">birden çok seçilebilir</span>
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5" role="group" aria-label="Sınıf">
            {SINIFLAR.map((s) => {
              const on = siniflar.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSiniflar((p) => (on ? p.filter((x) => x !== s) : [...p, s]))}
                  className={cx(
                    'h-8 rounded-full border text-xs font-semibold transition-colors cursor-pointer',
                    on ? 'bg-brand text-white border-brand' : 'bg-surface text-fg-2 border-line hover:border-line-strong hover:bg-surface-2'
                  )}
                >
                  {sinifAdi(s)}
                </button>
              );
            })}
          </div>
          {denendi && !okSinif && <p className="text-[11px] font-semibold text-danger-fg mt-1">En az bir sınıf seçin.</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="ui-label">Kapsam</span>
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={kapsam} onChange={setKapsam} items={[{ value: 'ogrenci', label: 'Öğrenci' }, { value: 'veli', label: 'Veli' }]} />
          </div>
          <div>
            <span className="ui-label">Yer</span>
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={yer} onChange={setYer} items={[{ value: 'ic', label: 'Okul içi' }, { value: 'dis', label: 'Okul dışı' }]} />
          </div>
          <div>
            <span className="ui-label">Konferans salonu</span>
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={salon} onChange={setSalon} items={[{ value: '0', label: 'Hayır' }, { value: '1', label: 'Evet' }]} />
          </div>
          <div>
            <label htmlFor="akt-zumre" className="ui-label flex items-center justify-between">
              Zümre <span className="text-[10px] font-normal text-subtle">isteğe bağlı</span>
            </label>
            <SelectBox id="akt-zumre" className="ui-field w-full cursor-pointer" value={zumre} onChange={(e) => setZumre(e.target.value)}>
              <option value="">Seçilmedi</option>
              {ZUMRELER.map((z) => (
                <option key={z} value={z}>
                  {baslik(z)}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
        {salonCakisma && (
          <p className="rounded-xl bg-warning-soft text-warning-fg text-xs font-medium px-3 py-2.5">
            Bu tarihte konferans salonu "{baslik(salonCakisma.ad)}" için ayrılmış. Yine de kaydedebilirsiniz.
          </p>
        )}
        {hata && <p className="rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold px-3 py-2.5">{hata}</p>}
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------- Excel'den yükleme
const ExcelPenceresi: React.FC<{
  acik: boolean;
  yil: number;
  kayitlar: AktKayit[];
  onClose: () => void;
  onBitti: (text: string) => void | Promise<void>;
}> = ({ acik, yil, kayitlar, onClose, onBitti }) => {
  const [dosyaAd, setDosyaAd] = useState('');
  const [sayfa, setSayfa] = useState(0);
  const [satirlar, setSatirlar] = useState<OkunanSatir[] | null>(null);
  const [mod, setMod] = useState<'ekle' | 'degistir'>('ekle');
  const [mesgul, setMesgul] = useState<'' | 'oku' | 'yaz'>('');
  const [hata, setHata] = useState<string | null>(null);
  const [surukle, setSurukle] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!acik) return;
    setDosyaAd('');
    setSatirlar(null);
    setMod('ekle');
    setHata(null);
    setMesgul('');
  }, [acik]);

  const oku = async (f?: File | null) => {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) return setHata('Lütfen .xlsx uzantılı Excel dosyası seçin.');
    setMesgul('oku');
    setHata(null);
    try {
      const r = await takvimExcelOku(f, yil);
      if (!r.sayfaSayisi) throw new Error('Ay adlı sayfa bulunamadı (EYLÜL … HAZİRAN).');
      setDosyaAd(f.name);
      setSayfa(r.sayfaSayisi);
      setSatirlar(r.satirlar);
    } catch (e: any) {
      setHata(e?.message || 'Dosya okunamadı.');
    } finally {
      setMesgul('');
      if (input.current) input.current.value = '';
    }
  };

  const mevcut = useMemo(() => new Set(kayitlar.map(satirAnahtari)), [kayitlar]);
  const hesap = useMemo(() => {
    const l = satirlar || [];
    const gecerli = l.filter((s) => s.durum !== 'hatali');
    const var_ = (s: OkunanSatir) => mevcut.has(satirAnahtari({ tarih: s.tarih!, ad: s.ad!, sinif: s.sinif || '' }));
    const yeni = gecerli.filter((s) => !var_(s));
    return { l, gecerli, yeni, var_, duzeltilen: l.filter((s) => s.durum === 'duzeltildi').length, hatali: l.length - gecerli.length };
  }, [satirlar, mevcut]);
  const yazilacak = mod === 'ekle' ? hesap.yeni : hesap.gecerli;

  const kaydet = async () => {
    if (!yazilacak.length || mesgul) return;
    if (mod === 'degistir') {
      const ok = await appConfirm({
        title: 'Takvim değiştirilsin mi?',
        message: `${yilAdi(yil)} takvimindeki ${kayitlar.length} kayıt silinip dosyadaki ${hesap.gecerli.length} etkinlik yazılacak.`,
        confirmText: 'Değiştir',
        danger: true,
      });
      if (!ok) return;
    }
    setMesgul('yaz');
    setHata(null);
    try {
      const veri: AktSatir[] = yazilacak.map((s) => ({
        tarih: s.tarih!, ad: s.ad!, sinif: s.sinif || '', birim: s.birim || '', zumre: s.zumre || '',
        kapsam: s.kapsam || 'ogrenci', yer: s.yer || 'ic', salon: !!s.salon, kontrol: !!s.kontrol,
      }));
      const r = await takvimYukle(mod, yil, veri);
      await onBitti(`${r.eklenen} etkinlik satırı takvime yazıldı${r.atlanan ? ` · ${r.atlanan} satır zaten vardı` : ''}.`);
    } catch (e: any) {
      setHata(e?.message || 'Yüklenemedi.');
    } finally {
      setMesgul('');
    }
  };

  const sirali = [...hesap.l].sort((a, b) => {
    const o = (s: OkunanSatir) => (s.durum === 'hatali' ? 0 : s.durum === 'duzeltildi' ? 1 : 2);
    return o(a) - o(b) || String(a.tarih || '').localeCompare(String(b.tarih || ''));
  });

  return (
    <Modal
      open={acik}
      onClose={onClose}
      size="lg"
      icon={FileSpreadsheet}
      title="Excel'den takvim yükle"
      description={`${yilAdi(yil)} · her ay ayrı sayfa. Önce okunur ve gösterilir; Kaydet'e basınca yazılır.`}
      id="akt-excel-pencere"
      footer={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose} disabled={mesgul === 'yaz'}>
            Vazgeç
          </button>
          <button type="button" id="akt-excel-kaydet" className={cx(BTN, 'ui-btn-primary')} onClick={() => void kaydet()} disabled={!satirlar || !yazilacak.length || !!mesgul}>
            {mesgul === 'yaz' ? 'Yazılıyor…' : satirlar && yazilacak.length ? `${yazilacak.length} satırı yaz` : 'Kaydet'}
          </button>
        </>
      }
    >
      <input ref={input} type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => void oku(e.target.files?.[0])} />
      {!satirlar ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setSurukle(true);
            }}
            onDragLeave={() => setSurukle(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurukle(false);
              void oku(e.dataTransfer.files?.[0]);
            }}
            className={cx(
              'w-full flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors cursor-pointer',
              surukle ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface-2 hover:border-brand hover:bg-brand-soft'
            )}
          >
            <span className="w-12 h-12 rounded-xl bg-surface shadow-card grid place-items-center text-brand-fg mb-1">
              <Upload className="w-5 h-5" />
            </span>
            <b className="text-sm text-fg">{mesgul === 'oku' ? 'Dosya okunuyor…' : 'Excel dosyasını buraya bırakın'}</b>
            <span className="text-xs text-muted">
              ya da <u className="no-underline font-semibold text-brand-fg">bilgisayardan seçin</u> · .xlsx
            </span>
          </button>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-fg-2">Okunan sütunlar</p>
            <div className="flex flex-wrap gap-1.5">
              {['Etkinlik adı', 'Tarih', 'Sınıf', 'Etkinlik kapsamı', 'Okul içi / dışı', 'Konferans salonu', 'Birim', 'Zümre', 'Kontrol'].map((s) => (
                <span key={s} className="ui-chip ui-chip-neutral">
                  {s}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted">Sayfa adları ay adıdır (EYLÜL … HAZİRAN). Boş satırlar atlanır. Yıl yanlış yazılmışsa ay sayfasına göre düzeltilir.</p>
            <button type="button" className="text-xs font-semibold text-brand-fg hover:underline inline-flex items-center gap-1 cursor-pointer" onClick={() => void takvimSablonIndir(yil)}>
              <Download className="w-3.5 h-3.5" /> Boş şablonu indir
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="w-9 h-9 rounded-lg bg-success-soft text-success-fg grid place-items-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm text-fg truncate">{dosyaAd}</b>
              <span className="text-xs text-muted">
                {sayfa} ay sayfası · {hesap.l.length} etkinlik satırı
              </span>
            </div>
            <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={() => input.current?.click()} disabled={!!mesgul}>
              Başka dosya
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Okunan satır', hesap.l.length, 'text-fg'],
              [mod === 'ekle' ? 'Yeni' : 'Yazılacak', yazilacak.length, 'text-success-fg'],
              ['Yılı düzeltilen', hesap.duzeltilen, 'text-warning-fg'],
              ['Hatalı', hesap.hatali, 'text-danger-fg'],
            ].map(([k, v, c]) => (
              <div key={k as string} className="rounded-xl bg-surface-2 px-3 py-2.5">
                <b className={cx('block text-xl font-bold tabular-nums', c as string)}>{v as number}</b>
                <span className="text-[11px] font-medium text-muted">{k as string}</span>
              </div>
            ))}
          </div>
          <Segmented
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            value={mod}
            onChange={setMod}
            items={[
              { value: 'ekle', label: 'Yenileri ekle', id: 'akt-mod-ekle' },
              { value: 'degistir', label: 'Takvimi değiştir', id: 'akt-mod-degistir' },
            ]}
          />
          <p className="text-xs text-muted">
            {mod === 'ekle'
              ? hesap.yeni.length
                ? `${hesap.yeni.length} yeni satır eklenir; takvimde zaten olan ${hesap.gecerli.length - hesap.yeni.length} satır atlanır.`
                : 'Dosyadaki etkinliklerin hepsi takvimde zaten var. Baştan yazmak için "Takvimi değiştir"i seçin.'
              : `${yilAdi(yil)} takvimindeki ${kayitlar.length} kayıt silinir, dosyadaki ${hesap.gecerli.length} etkinlik yazılır.`}
            {hesap.hatali > 0 && ' Hatalı satırlar yazılmaz.'}
          </p>
          <ul className="rounded-xl border border-line divide-y divide-line max-h-[42vh] overflow-y-auto">
            {sirali.map((s, i) => {
              const atla = mod === 'ekle' && s.durum !== 'hatali' && hesap.var_(s);
              const [cls, et] =
                s.durum === 'hatali'
                  ? ['ui-chip-danger', 'Hatalı']
                  : atla
                    ? ['ui-chip-neutral', 'Zaten var']
                    : s.durum === 'duzeltildi'
                      ? ['ui-chip-warning', 'Yıl düzeltildi']
                      : ['ui-chip-success', mod === 'ekle' ? 'Yeni' : 'Yazılacak'];
              return (
                <li key={`${s.sayfa}-${s.satirNo}-${i}`} className={cx('flex items-center gap-3 px-3 py-2', atla && 'opacity-55')}>
                  {s.tarih ? <DtKutu tarih={s.tarih} /> : <span className="w-12 h-12 rounded-xl bg-surface-2 grid place-items-center text-muted shrink-0">?</span>}
                  <span className="min-w-0 flex-1">
                    <b className="block text-xs font-semibold text-fg truncate">{s.ad ? baslik(s.ad) : '(adsız)'}</b>
                    <span className="block text-[11px] text-muted truncate">
                      {s.sayfa} · satır {s.satirNo} · {sinifAdi(s.sinif || '')}
                      {s.not && <span className="text-warning-fg"> · {s.not}</span>}
                    </span>
                  </span>
                  <span className={cx('ui-chip shrink-0 w-24 justify-center', cls)}>{et}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {hata && <p className="mt-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold px-3 py-2.5">{hata}</p>}
    </Modal>
  );
};
