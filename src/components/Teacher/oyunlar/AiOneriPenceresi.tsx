// ============================================================================
// Aşama 380: Oyunlar — yapay zekâ ile soru önerisi
// Kazanımları (en çok 5) seçersiniz; yapay zekâ o kazanımlara bağlı sorular önerir. Önerileri okuyup beğendiklerinizi
// seçersiniz; yalnız seçilenler soru bankasına eklenir. Yapay zekâya yalnız kazanım metni gider (öğrenci bilgisi yok).
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Sparkles } from 'lucide-react';
import { Modal, Segmented, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { FieldLabel, SelectBox } from '../FormParts';
import { KazanimDurumu, KazanimSecici, dersKazanimlari, useKazanimBankasi } from './KazanimSecici';
import { bankSubjectKey } from '../../../lib/deneme/kazanimBank';
import { basariBildir } from '../../../lib/bildirim';
import { aiCall, aiOyunSoru, aiStatus, newAiState, type AiOyunSoru, type AiProvider } from '../../../lib/aiApi';
import { SIK_HARF, TOPLU_EN_COK, ZORLUKLAR, topluEkleOyunSorulari, type OyunSoruGirdi, type OyunZorluk } from '../../../services/oyunService';
import { OYUN_DERSLERI, varsayilanDers } from './ortak';

type TurSecim = 'coktan' | 'kelime' | 'karisik';
interface Oneri extends AiOyunSoru {
  no: number;
  secili: boolean;
}

const SAYILAR = [3, 5, 8, 10];

export const AiOneriPenceresi: React.FC<{
  baslangic?: { ders?: string; sinif?: number | null };
  onClose: () => void;
  onSaved: () => void;
}> = ({ baslangic, onClose, onSaved }) => {
  const [ders, setDers] = useState(baslangic?.ders || varsayilanDers());
  const [sinif, setSinif] = useState<number | null>(baslangic?.sinif ?? null);
  const [kodlar, setKodlar] = useState<string[]>([]);
  const [tur, setTur] = useState<TurSecim>('karisik');
  const [sayi, setSayi] = useState(5);
  const [zorluk, setZorluk] = useState<OyunZorluk | ''>('');
  const [ai, setAi] = useState<{ provider: AiProvider; keys: { gemini: boolean; mistral: boolean } } | null | 'yok'>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [bekleme, setBekleme] = useState<string | null>(null);
  const [oneriler, setOneriler] = useState<Oneri[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediyor, setKaydediyor] = useState(false);
  const durdur = useRef(false);
  const { bank, hata: bankHata } = useKazanimBankasi();

  useEffect(() => {
    let canli = true;
    void aiStatus().then((r) => {
      if (!canli) return;
      if (r.ok && (r.gemini || r.mistral)) setAi({ provider: !r.gemini && r.mistral ? 'mistral' : 'gemini', keys: { gemini: !!r.gemini, mistral: !!r.mistral } });
      else setAi('yok');
    });
    return () => {
      canli = false;
      durdur.current = true; // pencere kapanınca süren istek sonucu yok sayılır
    };
  }, []);

  const dersVar = !!bankSubjectKey(ders);
  const adaylar = useMemo(() => (bank && dersVar ? dersKazanimlari(bank, ders, sinif) : []), [bank, ders, dersVar, sinif]);
  const secilenSatirlar = useMemo(() => (bank ? kodlar.map((k) => bank.find((r) => r.code === k)).filter((r): r is NonNullable<typeof r> => !!r) : []), [bank, kodlar]);

  const dersDegisti = (v: string) => {
    setDers(v);
    setKodlar([]);
    setOneriler(null);
  };

  const oner = async () => {
    if (!ai || ai === 'yok' || !secilenSatirlar.length) return;
    setHata(null);
    setOneriler(null);
    setCalisiyor(true);
    setBekleme(null);
    durdur.current = false;
    try {
      const grade = sinif ? String(sinif) : undefined;
      const r = await aiCall(
        newAiState(ai.provider, true, ai.keys),
        (p, avoid) =>
          aiOyunSoru({
            provider: p,
            subject: { name: ders },
            items: secilenSatirlar.map((k) => ({ kod: k.code, konu: k.konu, kazanim: k.text, alt: k.alt })),
            tur,
            sayi,
            zorluk,
            avoid,
            grade,
          }),
        { stop: () => durdur.current, onWait: (w) => setBekleme(w) }
      );
      if (durdur.current) return;
      if (!r.ok) {
        setHata(r.error || 'Yapay zekâ soru öneremedi. Biraz sonra tekrar deneyin.');
        return;
      }
      const liste = ((r.items || []) as AiOyunSoru[]).map((x, i) => ({ ...x, no: i + 1, secili: true }));
      if (!liste.length) setHata('Yapay zekâ kullanılabilir soru üretemedi. Kazanımı değiştirip ya da sayıyı azaltıp tekrar deneyin.');
      else setOneriler(liste);
    } finally {
      if (!durdur.current) {
        setCalisiyor(false);
        setBekleme(null);
      }
    }
  };

  const secilenSayi = oneriler ? oneriler.filter((o) => o.secili).length : 0;

  const ekle = async () => {
    if (!oneriler) return;
    const secilenler = oneriler.filter((o) => o.secili);
    if (!secilenler.length) return setHata('Eklemek için en az bir soru seçin.');
    if (secilenler.length > TOPLU_EN_COK) return setHata(`Bir seferde en çok ${TOPLU_EN_COK} soru eklenir.`);
    setHata(null);
    setKaydediyor(true);
    try {
      const girdiler: OyunSoruGirdi[] = secilenler.map((o) => ({
        tur: o.tur,
        sinif,
        ders,
        konu: o.konu,
        kazanimKodu: o.kod,
        zorluk: o.zorluk,
        metin: o.metin,
        siklar: o.siklar,
        dogru: o.tur === 'coktan' ? o.dogru : null,
        cevap: o.cevap,
        aciklama: o.aciklama,
      }));
      const n = await topluEkleOyunSorulari(girdiler);
      basariBildir(`${n} soru eklendi`);
      onSaved();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Sorular eklenemedi.');
    } finally {
      setKaydediyor(false);
    }
  };

  const aiHazir = ai !== null && ai !== 'yok';

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={Sparkles}
      title="Yapay zekâ ile soru öner"
      description="Kazanımı seçin; öneriler soru bankasına siz onaylayınca eklenir. Yapay zekâya yalnız kazanım metni gider."
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">{oneriler ? `${secilenSayi} / ${oneriler.length} soru seçili` : ''}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={kaydediyor}>
              Kapat
            </Button>
            {oneriler ? (
              <Button onClick={() => void ekle()} isLoading={kaydediyor} loadingText="Ekleniyor…" disabled={!secilenSayi}>
                Seçilenleri ekle
              </Button>
            ) : (
              <Button onClick={() => void oner()} isLoading={calisiyor} loadingText="Hazırlanıyor…" disabled={!aiHazir || !secilenSatirlar.length}>
                Soru öner
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {ai === 'yok' && (
          <p role="alert" className="rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-warning-fg">
            Yapay zekâ bu sunucuda kurulu değil (Vercel ayarlarında GEMINI_API_KEY ya da MISTRAL_API_KEY yok). Soruları elle ekleyebilirsiniz.
          </p>
        )}

        {!oneriler && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="ai-ders">Ders</FieldLabel>
                <SelectBox id="ai-ders" value={ders} onChange={(e) => dersDegisti(e.target.value)} className="ui-field cursor-pointer w-full">
                  <option value="">Seçin</option>
                  {OYUN_DERSLERI.filter((d) => bankSubjectKey(d)).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </SelectBox>
              </div>
              <div>
                <FieldLabel htmlFor="ai-sinif">Sınıf</FieldLabel>
                <SelectBox
                  id="ai-sinif"
                  value={sinif === null ? '' : String(sinif)}
                  onChange={(e) => {
                    setSinif(e.target.value ? Number(e.target.value) : null);
                    setKodlar([]);
                  }}
                  className="ui-field cursor-pointer w-full"
                >
                  <option value="">Tüm sınıflar</option>
                  {[5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}. sınıf
                    </option>
                  ))}
                </SelectBox>
              </div>
            </div>

            <div>
              <FieldLabel>Kazanım (en çok 5)</FieldLabel>
              {!ders ? (
                <p className="text-xs text-muted">Önce dersi seçin.</p>
              ) : !dersVar ? (
                <p className="text-xs text-muted">Bu ders için kazanım bankası yok.</p>
              ) : !bank ? (
                <KazanimDurumu hata={bankHata} />
              ) : (
                <KazanimSecici satirlar={adaylar} secili={kodlar} onChange={setKodlar} enCok={5} />
              )}
              {kodlar.length > 0 && <p className="mt-1.5 text-2xs text-muted">{kodlar.length} kazanım seçili</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <FieldLabel>Soru türü</FieldLabel>
                <Segmented<TurSecim>
                  items={[
                    { value: 'karisik', label: 'Karışık' },
                    { value: 'coktan', label: 'Çoktan seçmeli' },
                    { value: 'kelime', label: 'Kelime' },
                  ]}
                  value={tur}
                  onChange={setTur}
                />
              </div>
              <div>
                <FieldLabel htmlFor="ai-sayi">Soru sayısı</FieldLabel>
                <SelectBox id="ai-sayi" value={String(sayi)} onChange={(e) => setSayi(Number(e.target.value))} className="ui-field cursor-pointer w-full">
                  {SAYILAR.map((n) => (
                    <option key={n} value={n}>
                      {n} soru
                    </option>
                  ))}
                </SelectBox>
              </div>
              <div>
                <FieldLabel htmlFor="ai-zorluk">Zorluk</FieldLabel>
                <SelectBox id="ai-zorluk" value={zorluk} onChange={(e) => setZorluk(e.target.value as OyunZorluk | '')} className="ui-field cursor-pointer w-full">
                  <option value="">Karışık</option>
                  {ZORLUKLAR.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </SelectBox>
              </div>
            </div>
            {calisiyor && <p className="text-xs text-muted">{bekleme || 'Yapay zekâ soruları hazırlıyor, bu yarım dakika sürebilir…'}</p>}
          </>
        )}

        {oneriler && (
          <div className="space-y-2.5">
            <p className="text-xs text-muted">Yapay zekâ hata yapabilir: eklemeden önce her soruyu ve doğru cevabı kontrol edin.</p>
            {oneriler.map((o) => (
              <button
                key={o.no}
                type="button"
                aria-pressed={o.secili}
                onClick={() => setOneriler((l) => (l ? l.map((x) => (x.no === o.no ? { ...x, secili: !x.secili } : x)) : l))}
                className={cx(
                  'w-full text-left rounded-xl border p-3 flex items-start gap-3 transition-colors',
                  o.secili ? 'border-brand bg-brand-soft/40' : 'border-line bg-surface opacity-70 hover:opacity-100'
                )}
              >
                <span aria-hidden className={cx('mt-0.5 grid place-items-center size-4 shrink-0 rounded border', o.secili ? 'bg-brand border-brand text-white' : 'border-line-strong bg-surface')}>
                  {o.secili && <Check className="w-3 h-3" />}
                </span>
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block text-2xs font-semibold text-muted">
                    {o.tur === 'kelime' ? 'Kelime' : 'Çoktan seçmeli'} · {o.kod} · {ZORLUKLAR.find((z) => z.value === o.zorluk)?.label}
                  </span>
                  <span className="block text-sm text-fg leading-snug">{o.metin}</span>
                  {o.tur === 'coktan' ? (
                    <span className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {o.siklar.map((s, i) => (
                        <span key={i} className={cx('text-xs rounded-lg px-2 py-1', i === o.dogru ? 'bg-success-soft text-success-fg font-semibold' : 'bg-surface-2 text-fg-2')}>
                          {SIK_HARF[i]}) {s}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="block text-xs">
                      Cevap: <span className="font-semibold tracking-widest text-success-fg">{o.cevap}</span>
                    </span>
                  )}
                  {o.aciklama && <span className="block text-2xs text-muted">{o.aciklama}</span>}
                </span>
              </button>
            ))}
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOneriler(null);
                  setHata(null);
                }}
                disabled={kaydediyor}
              >
                Ayarlara dön
              </Button>
            </div>
          </div>
        )}

        {hata && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-fg">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
            {hata}
          </p>
        )}
      </div>
    </Modal>
  );
};
