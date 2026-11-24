// ============================================================================
// Aşama 380: Oyunlar — soru ekle / düzenle penceresi
// İki tür: çoktan seçmeli (4 şık) ve kelime (ipucu + tek kelimelik cevap; Bulmaca ve Çark için).
// Kazanım isteğe bağlıdır; seçilirse ders, sınıf ve konu kazanımdan doldurulur. Kayıt sunucuda yeniden denetlenir.
// ============================================================================
import React, { useMemo, useState } from 'react';
import { AlertCircle, Gamepad2, X } from 'lucide-react';
import { Modal, Segmented, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { FieldLabel, SelectBox } from './../FormParts';
import { KazanimDurumu, KazanimSecici, dersKazanimlari, useKazanimBankasi } from './KazanimSecici';
import { bankGradeOf, bankSubjectKey } from '../../../lib/deneme/kazanimBank';
import { basariBildir } from '../../../lib/bildirim';
import {
  SIK_HARF,
  ZORLUKLAR,
  kaydetOyunSoru,
  soruHatasi,
  type OyunSoru,
  type OyunSoruGirdi,
  type OyunSoruTur,
  type OyunZorluk,
} from '../../../services/oyunService';
import { OYUN_DERSLERI, OYUN_SINIFLARI, varsayilanDers } from './ortak';

interface Props {
  /** düzenlenecek soru; boşsa yeni soru */
  soru: OyunSoru | null;
  /** yeni soruda ders / sınıf başlangıcı (listedeki süzgeçten) */
  baslangic?: { ders?: string; sinif?: number | null };
  onClose: () => void;
  onSaved: () => void;
}

export const SoruFormu: React.FC<Props> = ({ soru, baslangic, onClose, onSaved }) => {
  const [tur, setTur] = useState<OyunSoruTur>(soru?.tur || 'coktan');
  const [ders, setDers] = useState(soru?.ders || baslangic?.ders || varsayilanDers());
  const [sinif, setSinif] = useState<number | null>(soru ? soru.sinif : (baslangic?.sinif ?? null));
  const [zorluk, setZorluk] = useState<OyunZorluk>(soru?.zorluk || 'orta');
  const [kod, setKod] = useState<string | null>(soru?.kazanimKodu || null);
  const [konu, setKonu] = useState(soru?.konu || '');
  const [metin, setMetin] = useState(soru?.metin || '');
  const [siklar, setSiklar] = useState<string[]>(soru && soru.siklar.length === 4 ? soru.siklar : ['', '', '', '']);
  const [dogru, setDogru] = useState<number | null>(soru?.dogru ?? null);
  const [cevap, setCevap] = useState(soru?.cevap || '');
  const [aciklama, setAciklama] = useState(soru?.aciklama || '');
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediyor, setKaydediyor] = useState(false);
  const { bank, hata: bankHata } = useKazanimBankasi();

  const dersVar = !!bankSubjectKey(ders);
  const adaylar = useMemo(() => (bank && dersVar ? dersKazanimlari(bank, ders, sinif) : []), [bank, ders, dersVar, sinif]);
  const secilen = useMemo(() => (kod && bank ? bank.find((r) => r.code === kod) || null : null), [bank, kod]);

  const kazanimSec = (kodlar: string[]) => {
    const k = kodlar[0] || null;
    setKod(k);
    const r = k && bank ? bank.find((x) => x.code === k) : null;
    if (r) {
      if (r.konu) setKonu(r.konu);
      const g = parseInt(bankGradeOf(r), 10);
      if (sinif === null && g >= 1 && g <= 12) setSinif(g);
    }
  };

  const dersDegisti = (v: string) => {
    setDers(v);
    if (kod && bank) {
      const r = bank.find((x) => x.code === kod);
      if (!r || bankSubjectKey(r.subject) !== bankSubjectKey(v)) setKod(null); // başka dersin kazanımı kalmaz
    }
  };

  const girdi = (): OyunSoruGirdi => ({
    id: soru?.id,
    tur,
    sinif,
    ders: ders.trim(),
    konu: konu.trim(),
    kazanimKodu: kod,
    zorluk,
    metin: metin.trim(),
    siklar: siklar.map((s) => s.trim()),
    dogru,
    cevap: cevap.trim(),
    aciklama: aciklama.trim(),
  });

  const kaydet = async () => {
    const g = girdi();
    const h = soruHatasi(g);
    if (h) return setHata(h);
    setHata(null);
    setKaydediyor(true);
    try {
      await kaydetOyunSoru(g);
      basariBildir(soru ? 'Soru güncellendi' : 'Soru eklendi');
      onSaved();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Soru kaydedilemedi.');
    } finally {
      setKaydediyor(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={Gamepad2}
      title={soru ? 'Soruyu düzenle' : 'Yeni soru'}
      description="Soru, kurumunuzdaki öğretmenlerin kullanabileceği ortak soru bankasına eklenir."
      footer={
        <div className="w-full flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={kaydediyor}>
            Vazgeç
          </Button>
          <Button onClick={() => void kaydet()} isLoading={kaydediyor} loadingText="Kaydediliyor…">
            {soru ? 'Kaydet' : 'Soruyu ekle'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Segmented<OyunSoruTur>
          items={[
            { value: 'coktan', label: 'Çoktan seçmeli' },
            { value: 'kelime', label: 'Kelime (bulmaca, çark)' },
          ]}
          value={tur}
          onChange={setTur}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <FieldLabel htmlFor="oy-ders">Ders</FieldLabel>
            <SelectBox id="oy-ders" value={ders} onChange={(e) => dersDegisti(e.target.value)} className="ui-field cursor-pointer w-full">
              <option value="">Seçin</option>
              {ders && !OYUN_DERSLERI.includes(ders) && <option value={ders}>{ders}</option>}
              {OYUN_DERSLERI.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <FieldLabel htmlFor="oy-sinif" optional>
              Sınıf
            </FieldLabel>
            <SelectBox id="oy-sinif" value={sinif === null ? '' : String(sinif)} onChange={(e) => setSinif(e.target.value ? Number(e.target.value) : null)} className="ui-field cursor-pointer w-full">
              <option value="">Tüm sınıflar</option>
              {OYUN_SINIFLARI.map((n) => (
                <option key={n} value={n}>
                  {n}. sınıf
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <FieldLabel htmlFor="oy-zorluk">Zorluk</FieldLabel>
            <SelectBox id="oy-zorluk" value={zorluk} onChange={(e) => setZorluk(e.target.value as OyunZorluk)} className="ui-field cursor-pointer w-full">
              {ZORLUKLAR.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>

        <div>
          <FieldLabel optional>Kazanım</FieldLabel>
          {secilen && (
            <div className="mb-2 flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-xs text-brand-fg">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{secilen.code}</span> · {secilen.text}
              </span>
              <button type="button" className="ui-chip-x shrink-0" aria-label="Kazanımı kaldır" onClick={() => setKod(null)}>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {!ders ? (
            <p className="text-xs text-muted">Kazanım seçmek için önce dersi seçin.</p>
          ) : !dersVar ? (
            <p className="text-xs text-muted">Bu ders için kazanım bankası yok; soru kazanımsız kaydedilir.</p>
          ) : !bank ? (
            <KazanimDurumu hata={bankHata} />
          ) : (
            <KazanimSecici satirlar={adaylar} secili={kod ? [kod] : []} onChange={kazanimSec} enCok={1} />
          )}
        </div>

        <div>
          <FieldLabel htmlFor="oy-konu" optional>
            Konu
          </FieldLabel>
          <input id="oy-konu" value={konu} maxLength={300} onChange={(e) => setKonu(e.target.value)} className="ui-field w-full" placeholder="Örn. Mevsimlerin oluşumu" />
        </div>

        <div>
          <FieldLabel htmlFor="oy-metin">{tur === 'kelime' ? 'İpucu' : 'Soru'}</FieldLabel>
          <textarea
            id="oy-metin"
            value={metin}
            maxLength={600}
            rows={3}
            onChange={(e) => setMetin(e.target.value)}
            className="ui-field w-full"
            placeholder={tur === 'kelime' ? 'Cevabı söylemeyen kısa bir ipucu yazın' : 'Soru metnini yazın'}
          />
          <p className="mt-1 text-right text-2xs text-subtle">{metin.length}/600</p>
        </div>

        {tur === 'coktan' ? (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-fg-2 mb-1">Şıklar (doğru olanı işaretleyin)</legend>
            {SIK_HARF.map((h, i) => (
              <div key={h} className="flex items-center gap-2">
                <label className={cx('ui-secim w-9 px-0 shrink-0', dogru === i && 'is-on')} title={`${h} şıkkı doğru`}>
                  <input type="radio" name="oy-dogru" className="sr-only" checked={dogru === i} onChange={() => setDogru(i)} aria-label={`${h} şıkkı doğru cevap`} />
                  {h}
                </label>
                <input
                  value={siklar[i]}
                  maxLength={200}
                  aria-label={`${h} şıkkı`}
                  onChange={(e) => setSiklar((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
                  className="ui-field w-full"
                />
              </div>
            ))}
          </fieldset>
        ) : (
          <div>
            <FieldLabel htmlFor="oy-cevap">Cevap (tek kelime)</FieldLabel>
            <input
              id="oy-cevap"
              value={cevap}
              maxLength={15}
              onChange={(e) => setCevap(e.target.value.replace(/\s+/g, ''))}
              className="ui-field w-full uppercase tracking-widest"
              placeholder="ÇEKİRDEK"
              autoComplete="off"
            />
            <p className="mt-1 text-2xs text-subtle">2 ile 15 harf; boşluk, rakam ve işaret olmaz.</p>
          </div>
        )}

        <div>
          <FieldLabel htmlFor="oy-acik" optional>
            Açıklama
          </FieldLabel>
          <input id="oy-acik" value={aciklama} maxLength={300} onChange={(e) => setAciklama(e.target.value)} className="ui-field w-full" placeholder="Cevaptan sonra gösterilecek kısa not" />
        </div>

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
