// ============================================================================
// Aşama 380: Oyunlar — yapay zekâ ile soru önerisi
// Kazanımları (en çok 5) seçersiniz; yapay zekâ o kazanımlara bağlı sorular önerir. Önerileri okuyup beğendiklerinizi
// seçersiniz; yalnız seçilenler soru bankasına eklenir. Yapay zekâya yalnız kazanım metni gider (öğrenci bilgisi yok).
// Aşama 388: Kaynak "Ders notu (PDF)" seçilirse PDF tarayıcıda okunur, seçilen sayfaların METNİ kazanımlarla birlikte gider;
// sorular yalnız o nottaki bilgiye dayanır. Dosya hiçbir yere yüklenmez. Taranmış (metinsiz) PDF kabul edilmez.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, FileText, Sparkles, X } from 'lucide-react';
import { Modal, Segmented, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { FieldLabel, SelectBox } from '../FormParts';
import { KazanimDurumu, KazanimSecici, dersKazanimlari, useKazanimBankasi } from './KazanimSecici';
import { bankSubjectKey } from '../../../lib/deneme/kazanimBank';
import { basariBildir } from '../../../lib/bildirim';
import { OYUN_NOT_EN_AZ, OYUN_NOT_EN_COK, aiCall, aiOyunSoru, aiStatus, newAiState, type AiOyunSoru, type AiProvider } from '../../../lib/aiApi';
import { extractPdfText } from '../../../lib/deneme/kitapcik';
import { SIK_HARF, TOPLU_EN_COK, ZORLUKLAR, topluEkleOyunSorulari, type OyunSoruGirdi, type OyunZorluk } from '../../../services/oyunService';
import { OYUN_DERSLERI, varsayilanDers } from './ortak';

type TurSecim = 'coktan' | 'kelime' | 'karisik';
type KaynakSecim = 'kazanim' | 'not';
interface DersNotu {
  ad: string;
  sayfalar: string[];
}
interface Oneri extends AiOyunSoru {
  no: number;
  secili: boolean;
}

const SAYILAR = [3, 5, 8, 10];
const sayiYaz = (n: number) => n.toLocaleString('tr-TR');

/** Baştan başlayıp sınıra sığan son sayfa (en az 1) */
function sigan(sayfalar: string[], bas: number): number {
  let top = 0;
  let son = bas;
  for (let i = bas - 1; i < sayfalar.length; i++) {
    top += sayfalar[i].length + 2;
    if (top > OYUN_NOT_EN_COK && i > bas - 1) break;
    son = i + 1;
  }
  return son;
}

export const AiOneriPenceresi: React.FC<{
  baslangic?: { ders?: string; sinif?: number | null };
  /** Aşama 394: "Notumdan üret" kartı ders notu kaynağıyla açar */
  baslangicKaynak?: 'kazanim' | 'not';
  onClose: () => void;
  onSaved: () => void;
}> = ({ baslangic, baslangicKaynak, onClose, onSaved }) => {
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
  const [kaynak, setKaynak] = useState<KaynakSecim>(baslangicKaynak || 'kazanim');
  const [not, setNot] = useState<DersNotu | null>(null);
  const [aralik, setAralik] = useState({ bas: 1, son: 1 });
  const [notOkunuyor, setNotOkunuyor] = useState<string | null>(null);
  const dosyaRef = useRef<HTMLInputElement>(null);
  const durdur = useRef(false);
  const { bank, hata: bankHata } = useKazanimBankasi();

  const notMetni = useMemo(() => (not ? not.sayfalar.slice(aralik.bas - 1, aralik.son).join('\n\n').trim() : ''), [not, aralik]);
  const notUzun = notMetni.length > OYUN_NOT_EN_COK;
  const notKisa = !!not && notMetni.length < OYUN_NOT_EN_AZ;
  const notHazir = kaynak === 'kazanim' || (!!not && !notUzun && !notKisa);

  const notSec = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return setHata('Yalnız PDF dosyası seçin.');
    setHata(null);
    setOneriler(null);
    setNotOkunuyor('PDF okunuyor…');
    try {
      const sayfalar = await extractPdfText(file, (n, t) => setNotOkunuyor(`PDF okunuyor… ${n} / ${t} sayfa`));
      if (!sayfalar.some((x) => x.length > 20)) {
        setNot(null);
        setHata('Bu PDF\'te okunabilir metin yok (taranmış ya da resim). Metin içeren bir PDF seçin.');
        return;
      }
      setNot({ ad: file.name, sayfalar });
      setAralik({ bas: 1, son: sigan(sayfalar, 1) });
    } catch (e) {
      setNot(null);
      setHata(e instanceof Error ? e.message : 'PDF okunamadı.');
    } finally {
      setNotOkunuyor(null);
    }
  };

  const aralikDegis = (alan: 'bas' | 'son', deger: number) => {
    if (!not) return;
    const n = not.sayfalar.length;
    const v = Math.max(1, Math.min(n, Math.round(deger) || 1));
    setAralik((a) => (alan === 'bas' ? { bas: v, son: Math.max(v, Math.min(a.son, n)) } : { bas: Math.min(a.bas, v), son: v }));
  };

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
    if (!ai || ai === 'yok' || !secilenSatirlar.length || !notHazir) return;
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
            ...(kaynak === 'not' ? { kaynak: notMetni } : {}),
          }),
        { stop: () => durdur.current, onWait: (w) => setBekleme(w) }
      );
      if (durdur.current) return;
      if (!r.ok) {
        setHata(r.error || 'Yapay zekâ soru öneremedi. Biraz sonra tekrar deneyin.');
        return;
      }
      const liste = ((r.items || []) as AiOyunSoru[]).map((x, i) => ({ ...x, no: i + 1, secili: true }));
      if (!liste.length)
        setHata(
          kaynak === 'not'
            ? 'Ders notunda seçilen kazanımlara uygun bilgi bulunamadı. Kazanımı ya da sayfa aralığını değiştirip tekrar deneyin.'
            : 'Yapay zekâ kullanılabilir soru üretemedi. Kazanımı değiştirip ya da sayıyı azaltıp tekrar deneyin.'
        );
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
      description={
        kaynak === 'not'
          ? 'Sorular ders notunuzdan hazırlanır. Dosya yüklenmez; yapay zekâya yalnız kazanım ve seçtiğiniz sayfaların metni gider.'
          : 'Kazanımı seçin; öneriler soru bankasına siz onaylayınca eklenir. Yapay zekâya yalnız kazanım metni gider.'
      }
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
              <Button onClick={() => void oner()} isLoading={calisiyor} loadingText="Hazırlanıyor…" disabled={!aiHazir || !secilenSatirlar.length || !notHazir || !!notOkunuyor}>
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
            <div>
              <FieldLabel>Kaynak</FieldLabel>
              <Segmented<KaynakSecim>
                items={[
                  { value: 'kazanim', label: 'Kazanım' },
                  { value: 'not', label: 'Ders notu (PDF)' },
                ]}
                value={kaynak}
                onChange={(v) => {
                  setKaynak(v);
                  setHata(null);
                }}
              />
            </div>

            {kaynak === 'not' && (
              <div className="rounded-xl border border-line bg-surface-2/60 p-3 space-y-3">
                <input
                  ref={dosyaRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    void notSec(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                {!not ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" size="sm" leftIcon={<FileText className="w-3.5 h-3.5" aria-hidden />} onClick={() => dosyaRef.current?.click()} disabled={!!notOkunuyor}>
                      PDF seç
                    </Button>
                    <span className="text-xs text-muted">{notOkunuyor || 'Metin içeren ders notu, konu özeti ya da çalışma kâğıdı.'}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg" title={not.ad}>
                        {not.ad}
                      </span>
                      <span className="shrink-0 text-2xs text-muted">{not.sayfalar.length} sayfa</span>
                      <Button variant="ghost" ikon aria-label="PDF'i kaldır" onClick={() => setNot(null)} className="shrink-0">
                        <X className="w-4 h-4" aria-hidden />
                      </Button>
                    </div>
                    {not.sayfalar.length > 1 && (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-24">
                          <FieldLabel htmlFor="ai-not-bas">İlk sayfa</FieldLabel>
                          <input
                            id="ai-not-bas"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={not.sayfalar.length}
                            value={aralik.bas}
                            onChange={(e) => aralikDegis('bas', Number(e.target.value))}
                            className="ui-field w-full tabular-nums"
                          />
                        </div>
                        <div className="w-24">
                          <FieldLabel htmlFor="ai-not-son">Son sayfa</FieldLabel>
                          <input
                            id="ai-not-son"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={not.sayfalar.length}
                            value={aralik.son}
                            onChange={(e) => aralikDegis('son', Number(e.target.value))}
                            className="ui-field w-full tabular-nums"
                          />
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => dosyaRef.current?.click()} disabled={!!notOkunuyor}>
                          Başka PDF
                        </Button>
                      </div>
                    )}
                    <p className={cx('text-2xs', notUzun || notKisa ? 'font-semibold text-warning-fg' : 'text-muted')}>
                      {notUzun
                        ? `Seçilen sayfalar çok uzun (${sayiYaz(notMetni.length)} karakter). En çok ${sayiYaz(OYUN_NOT_EN_COK)} karakter: aralığı daraltın.`
                        : notKisa
                          ? 'Seçilen sayfalarda yeterli metin yok. Aralığı genişletin ya da başka PDF seçin.'
                          : `${aralik.son - aralik.bas + 1} sayfa · ${sayiYaz(notMetni.length)} karakter gönderilecek`}
                    </p>
                  </>
                )}
              </div>
            )}

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
