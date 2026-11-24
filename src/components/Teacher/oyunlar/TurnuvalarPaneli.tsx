// ============================================================================
// Aşama 389: Oyunlar — "Turnuvalar" sekmesi
// Öğretmen 2–12 oyununu bir turnuvada toplar; öğrenciler bu oyunlardan aldıkları puanların toplamıyla, sınıflar da
// oynayan öğrencilerinin ortalamasıyla sıralanır. Sıralama canlıdır (öğrenci oyunu bitirince tazelenir) ve
// "Tahtada göster" ile tam ekranda yansıtılır (tahtada yalnız kısa ad: "Ayşe Y.").
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Maximize2, Minimize2, Pencil, Plus, Presentation, Trash2, Trophy } from 'lucide-react';
import { EmptyState, Modal, Panel, Segmented, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { Yukleniyor, YuklemeHatasi } from '../../ui/Durum';
import { FieldLabel } from '../FormParts';
import { appConfirm } from '../../../lib/appDialog';
import { basariBildir, hataBildir } from '../../../lib/bildirim';
import { useTabloSurumu } from '../../../lib/tabloSurumu';
import { MOD_AD, OYUN_LISTE_TABLOSU, listOyunlar, type OyunKaydi } from '../../../services/oyunOturumService';
import {
  TURNUVA_LISTE_TABLOSU,
  TURNUVA_OYUN,
  TURNUVA_SIRA_TABLOSU,
  guncelleTurnuva,
  kisaAd,
  listTurnuvalar,
  olusturTurnuva,
  silTurnuva,
  sinifSirasi,
  turnuvaSirasi,
  type Turnuva,
  type TurnuvaSatiri,
} from '../../../services/oyunTurnuvaService';
import { MOD_SIMGE, tarihYaz } from './ortak';

type Gorunum = 'ogrenci' | 'sinif';
const GORUNUMLER: Array<{ value: Gorunum; label: string }> = [
  { value: 'ogrenci', label: 'Öğrenciler' },
  { value: 'sinif', label: 'Sınıflar' },
];
/** ilk üç: altın (uyarı tonu), gümüş (nötr), bronz (marka tonu); kırmızı kullanılmaz (hata gibi okunur) */
const MADALYA = ['bg-warning-soft text-warning-fg', 'bg-surface-2 text-fg', 'bg-brand-soft text-brand-fg'];

export const TurnuvalarPaneli: React.FC<{ yeniAc: boolean; onYeniKapandi: () => void }> = ({ yeniAc, onYeniKapandi }) => {
  const [liste, setListe] = useState<Turnuva[] | null>(null);
  const [oyunlar, setOyunlar] = useState<OyunKaydi[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState<string | null>(null);
  const [duzenle, setDuzenle] = useState<Turnuva | 'yeni' | null>(null);

  const yukle = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([listTurnuvalar(), listOyunlar()]);
      setListe(t);
      setOyunlar(o);
      setHata(null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Turnuvalar yüklenemedi.');
    }
  }, []);
  // turnuva ya da oyun eklenince / silinince liste kendiliğinden tazelenir (sql/386 + 389)
  const surumT = useTabloSurumu(TURNUVA_LISTE_TABLOSU);
  const surumO = useTabloSurumu(OYUN_LISTE_TABLOSU);
  useEffect(() => {
    void yukle();
  }, [yukle, surumT, surumO]);

  useEffect(() => {
    if (yeniAc) setDuzenle('yeni');
  }, [yeniAc]);
  const formKapat = () => {
    setDuzenle(null);
    onYeniKapandi();
  };

  const oyunHaritasi = useMemo(() => new Map((oyunlar || []).map((o) => [o.id, o])), [oyunlar]);
  const secili = liste?.find((t) => t.id === acik) || null;

  return (
    <>
      {hata && <YuklemeHatasi mesaj={hata} onTekrar={yukle} />}
      {!hata && liste === null && <Yukleniyor satir={3} metin="Turnuvalar yükleniyor…" />}
      {liste && (
        <Panel title="Turnuvalar" description={`${liste.length} turnuva · birkaç oyunun toplam puanıyla sıralama`}>
          {liste.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="Henüz turnuva yok"
              description="Hazırladığın oyunlardan en az ikisini seç; öğrenciler toplam puanla, sınıflar ortalamayla sıralansın."
              action={
                <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setDuzenle('yeni')}>
                  Yeni turnuva
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {liste.map((t) => {
                const var_ = t.oyunIds.filter((id) => oyunHaritasi.has(id));
                const siniflar = [...new Set(var_.map((id) => oyunHaritasi.get(id)!.classAd).filter(Boolean))];
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => setAcik(t.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:bg-surface-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning-fg">
                        <Trophy className="w-4 h-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fg">{t.ad}</span>
                        <span className="block truncate text-xs text-muted">
                          {var_.length} oyun{siniflar.length ? ` · ${siniflar.length > 3 ? `${siniflar.length} sınıf` : siniflar.join(', ')}` : ''} · {tarihYaz(t.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {duzenle && oyunlar && (
        <TurnuvaFormu
          turnuva={duzenle === 'yeni' ? null : duzenle}
          oyunlar={oyunlar}
          onClose={formKapat}
          onSaved={(id) => {
            formKapat();
            void yukle().then(() => setAcik(id));
          }}
        />
      )}
      {secili && !duzenle && (
        <TurnuvaDetay
          key={secili.id}
          turnuva={secili}
          oyunHaritasi={oyunHaritasi}
          onClose={() => setAcik(null)}
          onDuzenle={() => setDuzenle(secili)}
          onSilindi={() => {
            setAcik(null);
            void yukle();
          }}
        />
      )}
    </>
  );
};

// ----------------------------------------------------------------------------- oluştur / düzenle
const TurnuvaFormu: React.FC<{ turnuva: Turnuva | null; oyunlar: OyunKaydi[]; onClose: () => void; onSaved: (id: string) => void }> = ({ turnuva, oyunlar, onClose, onSaved }) => {
  const [ad, setAd] = useState(turnuva?.ad || '');
  const [secim, setSecim] = useState<string[]>(() => (turnuva ? turnuva.oyunIds.filter((id) => oyunlar.some((o) => o.id === id)) : []));
  const [kaydediyor, setKaydediyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const degistir = (id: string) =>
    setSecim((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length >= TURNUVA_OYUN.en_cok ? l : [...l, id]));

  const kaydet = async () => {
    setHata(null);
    setKaydediyor(true);
    try {
      if (turnuva) {
        await guncelleTurnuva(turnuva.id, ad, secim);
        basariBildir('Turnuva güncellendi');
        onSaved(turnuva.id);
      } else {
        const t = await olusturTurnuva(ad, secim);
        basariBildir('Turnuva hazırlandı');
        onSaved(t.id);
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Turnuva kaydedilemedi.');
    } finally {
      setKaydediyor(false);
    }
  };

  const hazir = ad.trim().length >= 2 && secim.length >= TURNUVA_OYUN.en_az;

  return (
    <Modal
      open
      onClose={onClose}
      icon={Trophy}
      size="md"
      title={turnuva ? 'Turnuvayı düzenle' : 'Yeni turnuva'}
      description={`${TURNUVA_OYUN.en_az}-${TURNUVA_OYUN.en_cok} oyun seç. Yalnız bitirilen oyunların puanı sayılır.`}
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted tabular-nums">
            {secim.length} / {TURNUVA_OYUN.en_cok} oyun seçili
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" genislik="kisa" onClick={onClose} disabled={kaydediyor}>
              Vazgeç
            </Button>
            <Button genislik="kisa" onClick={() => void kaydet()} isLoading={kaydediyor} loadingText="Kaydediliyor…" disabled={!hazir}>
              Kaydet
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="tur-ad">Turnuva adı</FieldLabel>
          <input id="tur-ad" value={ad} maxLength={80} onChange={(e) => setAd(e.target.value)} placeholder="Ör. Kasım Fen turnuvası" className="ui-field w-full" />
        </div>
        <div>
          <FieldLabel>Oyunlar</FieldLabel>
          {oyunlar.length < TURNUVA_OYUN.en_az ? (
            <p className="text-xs text-muted">Turnuva için en az {TURNUVA_OYUN.en_az} oyun hazırlamış olmalısın. Önce Oyunlarım sekmesinden oyun hazırla.</p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-line p-1.5">
              {oyunlar.map((o) => {
                const on = secim.includes(o.id);
                const dolu = !on && secim.length >= TURNUVA_OYUN.en_cok;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={dolu}
                      onClick={() => degistir(o.id)}
                      className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', on ? 'bg-brand-soft/50' : 'hover:bg-surface-2', dolu && 'opacity-50')}
                    >
                      <span aria-hidden className={cx('grid place-items-center size-4 shrink-0 rounded border', on ? 'bg-brand border-brand text-white' : 'border-line-strong bg-surface')}>
                        {on && <Check className="w-3 h-3" />}
                      </span>
                      {React.createElement(MOD_SIMGE[o.mod], { className: 'w-3.5 h-3.5 shrink-0 text-muted', 'aria-hidden': true })}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{o.ad}</span>
                        <span className="block truncate text-2xs text-muted">
                          {MOD_AD[o.mod]} · {o.classAd} · {tarihYaz(o.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {hata && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-fg">
            {hata}
          </p>
        )}
      </div>
    </Modal>
  );
};

// ----------------------------------------------------------------------------- sıralama (canlı)
function useTurnuvaSirasi(id: string) {
  const [satirlar, setSatirlar] = useState<TurnuvaSatiri[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const surum = useTabloSurumu(TURNUVA_SIRA_TABLOSU);
  const yukle = useCallback(async () => {
    try {
      setSatirlar(await turnuvaSirasi(id));
      setHata(null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Sıralama yüklenemedi.');
    }
  }, [id]);
  useEffect(() => {
    void yukle();
  }, [yukle, surum]);
  return { satirlar, hata, yukle };
}

const TurnuvaDetay: React.FC<{
  turnuva: Turnuva;
  oyunHaritasi: Map<string, OyunKaydi>;
  onClose: () => void;
  onDuzenle: () => void;
  onSilindi: () => void;
}> = ({ turnuva, oyunHaritasi, onClose, onDuzenle, onSilindi }) => {
  const { satirlar, hata, yukle } = useTurnuvaSirasi(turnuva.id);
  const [gorunum, setGorunum] = useState<Gorunum>('ogrenci');
  const [tahta, setTahta] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const oyunlar = turnuva.oyunIds.map((id) => oyunHaritasi.get(id)).filter((o): o is OyunKaydi => !!o);
  const siniflar = useMemo(() => sinifSirasi(satirlar || []), [satirlar]);

  const sil = async () => {
    const onay = await appConfirm({ title: 'Turnuva silinsin mi?', message: `"${turnuva.ad}" silinir. Oyunlar ve sonuçları silinmez.`, danger: true });
    if (!onay) return;
    setMesgul(true);
    try {
      await silTurnuva(turnuva.id);
      basariBildir('Turnuva silindi');
      onSilindi();
    } catch (e) {
      hataBildir('Turnuva silinemedi', e instanceof Error ? e.message : undefined);
    } finally {
      setMesgul(false);
    }
  };

  if (tahta) return <TurnuvaTahta turnuva={turnuva} satirlar={satirlar} gorunum={gorunum} onGorunum={setGorunum} onClose={() => setTahta(false)} />;

  return (
    <Modal open onClose={onClose} icon={Trophy} title={turnuva.ad} description={`${oyunlar.length} oyun · ${turnuva.olusturanAd || 'Yönetici'} · ${tarihYaz(turnuva.createdAt)}`} size="lg">
      <div className="space-y-6">
        {hata && <YuklemeHatasi mesaj={hata} onTekrar={yukle} />}
        {!hata && satirlar === null && <Yukleniyor satir={4} metin="Sıralama hazırlanıyor…" />}

        {satirlar && (
          <section className="space-y-3" aria-labelledby="tur-sira">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="tur-sira" className="text-sm font-semibold text-fg">
                Sıralama
              </h3>
              <Segmented<Gorunum> items={GORUNUMLER} value={gorunum} onChange={setGorunum} />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { ad: 'Katılımcı', deger: satirlar.length },
                { ad: 'Sınıf', deger: siniflar.length },
                { ad: 'En yüksek puan', deger: satirlar[0]?.puan ?? 0 },
              ].map((x) => (
                <div key={x.ad} className="rounded-xl bg-surface-2 px-3 py-2.5 text-center">
                  <p className="text-xl font-bold tabular-nums text-fg">{x.deger}</p>
                  <p className="text-2xs font-semibold text-muted">{x.ad}</p>
                </div>
              ))}
            </div>
            {satirlar.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">Henüz turnuvadaki bir oyunu bitiren yok.</p>
            ) : gorunum === 'ogrenci' ? (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {satirlar.map((s) => (
                  <li key={s.studentId} className="flex items-center gap-3 px-3 py-2">
                    <SiraRozet sira={s.sira} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{s.ad}</span>
                      <span className="block truncate text-2xs text-muted">
                        {s.classAd} · {s.oyunSayisi}/{oyunlar.length} oyun · {s.toplam} sorudan {s.dogru} doğru
                      </span>
                    </span>
                    <span className="w-14 text-right text-sm font-bold tabular-nums text-fg">{s.puan}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {siniflar.map((c) => (
                  <li key={c.classId || c.classAd} className="flex items-center gap-3 px-3 py-2">
                    <SiraRozet sira={c.sira} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{c.classAd || 'Sınıf'}</span>
                      <span className="block text-2xs text-muted">{c.oynayan} öğrenci · toplam {c.toplamPuan} puan</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-bold tabular-nums text-fg">{c.ortalama}</span>
                      <span className="block text-2xs text-muted">ortalama</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-2xs text-subtle">Öğrenci sırası: toplam puan, eşitlikte bitirilen oyun ve doğru sayısı. Sınıf sırası: oynayan öğrencilerin ortalama puanı. Sıralama kendiliğinden güncellenir.</p>
          </section>
        )}

        <section className="space-y-2" aria-labelledby="tur-oyun">
          <h3 id="tur-oyun" className="text-sm font-semibold text-fg">
            Oyunlar ({oyunlar.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {oyunlar.map((o) => (
              <span key={o.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-xs text-fg-2">
                {React.createElement(MOD_SIMGE[o.mod], { className: 'w-3.5 h-3.5 shrink-0', 'aria-hidden': true })}
                <span className="truncate">
                  {o.ad} · {o.classAd}
                </span>
              </span>
            ))}
          </div>
          {oyunlar.length < turnuva.oyunIds.length && <p className="text-2xs text-subtle">{turnuva.oyunIds.length - oyunlar.length} oyun silindiği için sayılmıyor.</p>}
        </section>

        <section className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button leftIcon={<Presentation className="w-3.5 h-3.5" />} onClick={() => setTahta(true)} disabled={!satirlar?.length}>
            Tahtada göster
          </Button>
          <Button variant="secondary" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={onDuzenle} disabled={mesgul}>
            Düzenle
          </Button>
          <Button variant="danger-soft" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => void sil()} disabled={mesgul}>
            Sil
          </Button>
        </section>
      </div>
    </Modal>
  );
};

const SiraRozet: React.FC<{ sira: number; buyuk?: boolean }> = ({ sira, buyuk }) => (
  <span
    className={cx(
      'grid shrink-0 place-items-center rounded-full font-bold tabular-nums',
      buyuk ? 'size-12 text-xl' : 'size-7 text-xs',
      sira <= 3 ? MADALYA[sira - 1] : 'text-subtle'
    )}
  >
    {sira}
  </span>
);

// ----------------------------------------------------------------------------- tahtada göster (tam ekran)
const TAHTA_ILK = 10;

const TurnuvaTahta: React.FC<{
  turnuva: Turnuva;
  satirlar: TurnuvaSatiri[] | null;
  gorunum: Gorunum;
  onGorunum: (g: Gorunum) => void;
  onClose: () => void;
}> = ({ turnuva, satirlar, gorunum, onGorunum, onClose }) => {
  const [tamEkran, setTamEkran] = useState(false);
  useEffect(() => {
    const dinle = () => setTamEkran(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', dinle);
    return () => {
      document.removeEventListener('fullscreenchange', dinle);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  const tamEkranDegistir = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const satir = useMemo(() => {
    const l = satirlar || [];
    if (gorunum === 'sinif') return sinifSirasi(l).slice(0, TAHTA_ILK).map((c) => ({ k: c.classId || c.classAd, sira: c.sira, ad: c.classAd || 'Sınıf', alt: `${c.oynayan} öğrenci`, puan: c.ortalama }));
    return l.slice(0, TAHTA_ILK).map((s) => ({ k: s.studentId, sira: s.sira, ad: kisaAd(s.ad), alt: s.classAd, puan: s.puan }));
  }, [satirlar, gorunum]);

  return (
    <Modal
      open
      onClose={onClose}
      tamEkran
      closeOnBackdrop={false}
      icon={Trophy}
      title={turnuva.ad}
      baslikSag={
        <div className="flex items-center gap-2">
          <Segmented<Gorunum> items={GORUNUMLER} value={gorunum} onChange={onGorunum} />
          <Button variant="ghost" size="sm" ikon aria-label={tamEkran ? 'Tam ekrandan çık' : 'Tam ekran'} title={tamEkran ? 'Tam ekrandan çık' : 'Tam ekran'} onClick={tamEkranDegistir}>
            {tamEkran ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      }
      govdeClass="px-4 py-5 sm:px-8"
    >
      <div className="mx-auto w-full max-w-3xl space-y-2.5">
        {satir.length === 0 && <p className="py-10 text-center text-sm text-muted">Henüz sıralama yok.</p>}
        {satir.map((s) => (
          <div key={s.k} className={cx('flex items-center gap-4 rounded-2xl border px-4 py-3 sm:px-5', s.sira === 1 ? 'border-warning/40 bg-warning-soft/40' : 'border-line bg-surface')}>
            <SiraRozet sira={s.sira} buyuk />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-bold text-fg sm:text-2xl">{s.ad}</p>
              {s.alt && <p className="truncate text-sm text-muted">{s.alt}</p>}
            </div>
            <p className="shrink-0 text-2xl font-bold tabular-nums text-fg sm:text-3xl">{s.puan}</p>
          </div>
        ))}
        {gorunum === 'ogrenci' && (satirlar?.length || 0) > TAHTA_ILK && <p className="pt-1 text-center text-sm text-muted">ve {(satirlar?.length || 0) - TAHTA_ILK} öğrenci daha</p>}
        {gorunum === 'sinif' && <p className="pt-1 text-center text-xs text-subtle">Sınıf puanı: oynayan öğrencilerin ortalaması</p>}
      </div>
    </Modal>
  );
};
