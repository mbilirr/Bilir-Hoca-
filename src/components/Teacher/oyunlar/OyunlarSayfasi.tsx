// ============================================================================
// Aşama 380: OYUNLAR sayfası — kazanıma bağlı soru bankası
// Kurumun öğretmenleri ve idaresi ortak bir soru bankası kurar (elle ya da yapay zekâ önerisiyle). Soruyu yazan
// kendisininkini, kurum yöneticisi / Müdür / Müdür Yrd. hepsini düzenler ve siler. Öğrenci bu bankayı görmez.
// Yalnız genel yöneticinin "Kurum bölümleri"nden Oyunlar'ı açtığı kurumda görünür.
// Aşama 383: "Tahtada oyna" (Düello / Grup; öğretmenin ekranında, kayıtsız).
// Aşama 381: iki sekme — Oyunlarım (oyun hazırla, bağlantı / QR, sonuçlar) ve Soru bankası.
// Aşama 389: üçüncü sekme Turnuvalar (birkaç oyunun toplam puanıyla sıralama).
// Aşama 394: tek "Soru ekle" girişi (elle, PDF'den kes, metin yapıştır, yapay zekâ, ders notu).
// Aşama 393: "PDF'den soru" (sayfada soruyu kesip görselli soru ekleme); görselli sorularda "Görselli" etiketi.
// ============================================================================
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Gamepad2, Image as ImageIcon, Plus, Presentation, Search, Sparkles, Trash2, Trophy } from 'lucide-react';
import { lazyNamed, useEverTrue } from '../../../lib/lazyLoad';
import { EmptyState, PageHeader, Panel, Segmented, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { Yukleniyor, YuklemeHatasi } from '../../ui/Durum';
import { SelectBox } from '../FormParts';
import { appConfirm } from '../../../lib/appDialog';
import { basariBildir, hataBildir } from '../../../lib/bildirim';
import { dataService } from '../../../services/dataService';
import { SIK_HARF, TUR_AD, ZORLUK_AD, listOyunSorulari, silOyunSorulari, type OyunSoru, type OyunSoruTur } from '../../../services/oyunService';
import { OYUN_SINIFLARI, tarihYaz } from './ortak';

const TahtaKurulum = lazyNamed<React.ComponentProps<typeof import('./tahta/TahtaKurulum').TahtaKurulum>>(() => import('./tahta/TahtaKurulum'), 'TahtaKurulum');
const OyunlarimPaneli = lazyNamed<React.ComponentProps<typeof import('./OyunlarimPaneli').OyunlarimPaneli>>(() => import('./OyunlarimPaneli'), 'OyunlarimPaneli');
const TurnuvalarPaneli = lazyNamed<React.ComponentProps<typeof import('./TurnuvalarPaneli').TurnuvalarPaneli>>(() => import('./TurnuvalarPaneli'), 'TurnuvalarPaneli');

const SoruFormu = lazyNamed<React.ComponentProps<typeof import('./SoruFormu').SoruFormu>>(() => import('./SoruFormu'), 'SoruFormu');
const SoruEkleSecici = lazyNamed<React.ComponentProps<typeof import('./SoruEkleSecici').SoruEkleSecici>>(() => import('./SoruEkleSecici'), 'SoruEkleSecici');
const TopluYapistir = lazyNamed<React.ComponentProps<typeof import('./TopluYapistir').TopluYapistir>>(() => import('./TopluYapistir'), 'TopluYapistir');
const PdfSoruKesici = lazyNamed<React.ComponentProps<typeof import('./PdfSoruKesici').PdfSoruKesici>>(() => import('./PdfSoruKesici'), 'PdfSoruKesici');
const AiOneriPenceresi = lazyNamed<React.ComponentProps<typeof import('./AiOneriPenceresi').AiOneriPenceresi>>(() => import('./AiOneriPenceresi'), 'AiOneriPenceresi');

const SAYFA = 30;
type TurSuzgec = '' | OyunSoruTur;
const norm = (v: string) => v.toLocaleLowerCase('tr-TR');

export const OyunlarSayfasi: React.FC = () => {
  const [liste, setListe] = useState<OyunSoru[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [fDers, setFDers] = useState('');
  const [fSinif, setFSinif] = useState('');
  const [fTur, setFTur] = useState<TurSuzgec>('');
  const [fBenim, setFBenim] = useState(false);
  const [ara, setAra] = useState('');
  const [adet, setAdet] = useState(SAYFA);
  const [sekme, setSekme] = useState<'oyunlarim' | 'turnuva' | 'banka'>('oyunlarim');
  const [yeniOyun, setYeniOyun] = useState(false);
  const [yeniTurnuva, setYeniTurnuva] = useState(false);
  const [tahta, setTahta] = useState(false);
  const tahtaVar = useEverTrue(tahta);
  const [form, setForm] = useState<OyunSoru | 'yeni' | null>(null);
  const [aiAcik, setAiAcik] = useState(false);
  const [pdfAcik, setPdfAcik] = useState(false);
  const [ekleAcik, setEkleAcik] = useState(false);
  const [yapistirAcik, setYapistirAcik] = useState(false);
  const [aiKaynak, setAiKaynak] = useState<'kazanim' | 'not'>('kazanim');
  const ekleVar = useEverTrue(ekleAcik);
  const yapistirVar = useEverTrue(yapistirAcik);
  const pdfVar = useEverTrue(pdfAcik);
  const formVar = useEverTrue(form !== null);
  const aiVar = useEverTrue(aiAcik);

  const benimId = dataService.getCurrentTeacher()?.auth_user_id || '';
  const hepsiniYonet = dataService.oyunTumunuYonetir();

  const yukle = useCallback(async () => {
    try {
      setListe(await listOyunSorulari());
      setHata(null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Sorular yüklenemedi.');
    }
  }, []);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  const dersler = useMemo(() => Array.from(new Set((liste || []).map((s) => s.ders))).sort((a, b) => a.localeCompare(b, 'tr')), [liste]);
  const suzulen = useMemo(() => {
    const q = norm(ara.trim());
    return (liste || []).filter((s) => {
      if (fDers && s.ders !== fDers) return false;
      if (fSinif && String(s.sinif ?? '') !== fSinif) return false;
      if (fTur && s.tur !== fTur) return false;
      if (fBenim && s.olusturan !== benimId) return false;
      if (q && !norm(`${s.metin} ${s.cevap} ${s.konu} ${s.kazanimKodu || ''} ${s.siklar.join(' ')}`).includes(q)) return false;
      return true;
    });
  }, [liste, fDers, fSinif, fTur, fBenim, ara, benimId]);

  // süzgeç değişince liste başa döner
  useEffect(() => setAdet(SAYFA), [fDers, fSinif, fTur, fBenim, ara]);

  const duzenleyebilir = (s: OyunSoru) => hepsiniYonet || (!!benimId && s.olusturan === benimId);

  const sil = async (s: OyunSoru) => {
    const onay = await appConfirm({ title: 'Soru silinsin mi?', message: `"${s.metin.length > 90 ? `${s.metin.slice(0, 90)}…` : s.metin}" soru bankasından kalıcı olarak silinir.` });
    if (!onay) return;
    try {
      await silOyunSorulari([s.id]);
      setListe((l) => (l ? l.filter((x) => x.id !== s.id) : l));
      basariBildir('Soru silindi');
    } catch (e) {
      hataBildir('Soru silinemedi', e instanceof Error ? e.message : undefined);
      void yukle();
    }
  };

  const kaydedildi = () => {
    setForm(null);
    setAiAcik(false);
    setYapistirAcik(false);
    void yukle();
  };

  const baslangic = { ders: fDers || undefined, sinif: fSinif ? Number(fSinif) : null };
  const coktan = (liste || []).filter((s) => s.tur === 'coktan').length;
  const kelime = (liste || []).length - coktan;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Gamepad2}
        tone="info"
        title="Oyunlar"
        description="Soru bankasından oyun hazırla, bağlantıyı öğrencilerine ver"
        actions={
          sekme === 'banka' ? (
            <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setEkleAcik(true)}>
              Soru ekle
            </Button>
          ) : sekme === 'turnuva' ? (
            <Button leftIcon={<Trophy className="w-3.5 h-3.5" />} onClick={() => setYeniTurnuva(true)}>
              Yeni turnuva
            </Button>
          ) : (
            <>
              <Button variant="secondary" leftIcon={<Presentation className="w-3.5 h-3.5" />} onClick={() => setTahta(true)}>
                Tahtada oyna
              </Button>
              <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setYeniOyun(true)}>
                Yeni oyun
              </Button>
            </>
          )
        }
      />

      <Segmented<'oyunlarim' | 'turnuva' | 'banka'>
        items={[
          { value: 'oyunlarim', label: 'Oyunlarım' },
          { value: 'turnuva', label: 'Turnuvalar' },
          { value: 'banka', label: 'Soru bankası' },
        ]}
        value={sekme}
        onChange={setSekme}
      />

      {sekme === 'oyunlarim' && (
        <Suspense fallback={<Yukleniyor satir={4} metin="Oyunlar yükleniyor…" />}>
          <OyunlarimPaneli yeniAc={yeniOyun} onYeniKapandi={() => setYeniOyun(false)} />
        </Suspense>
      )}

      {sekme === 'turnuva' && (
        <Suspense fallback={<Yukleniyor satir={3} metin="Turnuvalar yükleniyor…" />}>
          <TurnuvalarPaneli yeniAc={yeniTurnuva} onYeniKapandi={() => setYeniTurnuva(false)} />
        </Suspense>
      )}

      {sekme === 'banka' && hata && <YuklemeHatasi mesaj={hata} onTekrar={yukle} />}
      {sekme === 'banka' && !hata && liste === null && <Yukleniyor satir={5} metin="Sorular yükleniyor…" />}

      {sekme === 'banka' && liste && (
        <Panel
          title="Soru bankası"
          description={`${liste.length} soru · ${coktan} çoktan seçmeli · ${kelime} kelime`}
          actions={
            <label className={cx('ui-secim', fBenim && 'is-on')}>
              <input type="checkbox" className="sr-only" checked={fBenim} onChange={(e) => setFBenim(e.target.checked)} />
              Yalnız benimkiler
            </label>
          }
        >
          {liste.length === 0 ? (
            <EmptyState
              icon={Gamepad2}
              title="Soru bankası boş"
              description="İlk soruyu elle yazın, PDF'ten kesin, metin yapıştırın ya da yapay zekâdan öneri isteyin."
              action={
                <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setEkleAcik(true)}>
                  Soru ekle
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <SelectBox aria-label="Ders" value={fDers} onChange={(e) => setFDers(e.target.value)} className="ui-field cursor-pointer w-full">
                  <option value="">Bütün dersler</option>
                  {dersler.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </SelectBox>
                <SelectBox aria-label="Sınıf" value={fSinif} onChange={(e) => setFSinif(e.target.value)} className="ui-field cursor-pointer w-full">
                  <option value="">Bütün sınıflar</option>
                  {OYUN_SINIFLARI.map((n) => (
                    <option key={n} value={n}>
                      {n}. sınıf
                    </option>
                  ))}
                </SelectBox>
                <div className="sm:col-span-2 lg:col-span-1 relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle" aria-hidden />
                  <input type="search" aria-label="Soru ara" value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Soru, kelime ya da kazanım ara" className="ui-field w-full pl-9" />
                </div>
                <Segmented<'tum' | OyunSoruTur>
                  items={[
                    { value: 'tum', label: 'Tümü' },
                    { value: 'coktan', label: 'Çoktan seçmeli' },
                    { value: 'kelime', label: 'Kelime' },
                  ]}
                  value={fTur || 'tum'}
                  onChange={(v) => setFTur(v === 'tum' ? '' : v)}
                />
              </div>

              {suzulen.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">Bu süzgece uyan soru yok.</p>
              ) : (
                <ul className="space-y-2.5">
                  {suzulen.slice(0, adet).map((s) => (
                    <li key={s.id} className="rounded-xl border border-line bg-surface p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs font-semibold text-muted">
                            <span className="rounded-lg bg-surface-2 px-1.5 py-0.5 text-fg-2">{s.ders}</span>
                            <span>{s.sinif ? `${s.sinif}. sınıf` : 'Tüm sınıflar'}</span>
                            <span aria-hidden>·</span>
                            <span>{TUR_AD[s.tur]}</span>
                            <span aria-hidden>·</span>
                            <span>{ZORLUK_AD[s.zorluk]}</span>
                            {s.kazanimKodu && (
                              <>
                                <span aria-hidden>·</span>
                                <span title={s.konu || undefined}>{s.kazanimKodu}</span>
                              </>
                            )}
                            {s.gorselId && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-info-soft px-1.5 py-0.5 text-info-fg">
                                <ImageIcon className="w-3 h-3" aria-hidden />
                                Görselli
                              </span>
                            )}
                            {s.kaynak === 'yapay_zeka' && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-1.5 py-0.5 text-brand-fg">
                                <Sparkles className="w-3 h-3" aria-hidden />
                                Yapay zekâ
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-fg leading-snug">{s.metin}</p>
                          {s.tur === 'coktan' ? (
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {s.siklar.map((o, i) => (
                                <li key={i} className={cx('text-xs rounded-lg px-2 py-1', i === s.dogru ? 'bg-success-soft text-success-fg font-semibold' : 'bg-surface-2 text-fg-2')}>
                                  {SIK_HARF[i]}) {o}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-fg-2">
                              Cevap: <span className="font-semibold tracking-widest text-success-fg">{s.cevap}</span>
                            </p>
                          )}
                          {s.aciklama && <p className="text-2xs text-muted">{s.aciklama}</p>}
                          <p className="text-2xs text-subtle">
                            {s.olusturanAd || 'Yönetici'} · {tarihYaz(s.createdAt)}
                          </p>
                        </div>
                        {duzenleyebilir(s) && (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Button variant="secondary" size="sm" ikon aria-label="Soruyu düzenle" title="Düzenle" onClick={() => setForm(s)}>
                              <Edit3 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="danger-soft" size="sm" ikon aria-label="Soruyu sil" title="Sil" onClick={() => void sil(s)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {suzulen.length > adet && (
                <div className="flex justify-center">
                  <Button variant="secondary" genislik="uzun" onClick={() => setAdet((n) => n + SAYFA)}>
                    Daha fazla göster ({suzulen.length - adet})
                  </Button>
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      <Suspense fallback={null}>
        {ekleVar && ekleAcik && (
          <SoruEkleSecici
            onClose={() => setEkleAcik(false)}
            onSec={(y) => {
              setEkleAcik(false);
              if (y === 'yaz') setForm('yeni');
              else if (y === 'pdf') setPdfAcik(true);
              else if (y === 'yapistir') setYapistirAcik(true);
              else {
                setAiKaynak(y === 'not' ? 'not' : 'kazanim');
                setAiAcik(true);
              }
            }}
          />
        )}
        {yapistirVar && yapistirAcik && <TopluYapistir baslangic={baslangic} onClose={() => setYapistirAcik(false)} onSaved={kaydedildi} />}
        {formVar && form !== null && <SoruFormu key={form === 'yeni' ? 'yeni' : form.id} soru={form === 'yeni' ? null : form} baslangic={baslangic} onEklendi={() => void yukle()} onClose={() => setForm(null)} onSaved={kaydedildi} />}
        {tahtaVar && tahta && <TahtaKurulum onClose={() => setTahta(false)} />}
        {pdfVar && pdfAcik && <PdfSoruKesici baslangic={baslangic} onClose={() => setPdfAcik(false)} onEklendi={() => void yukle()} />}
        {aiVar && aiAcik && <AiOneriPenceresi baslangic={baslangic} baslangicKaynak={aiKaynak} onClose={() => setAiAcik(false)} onSaved={kaydedildi} />}
      </Suspense>
    </div>
  );
};
