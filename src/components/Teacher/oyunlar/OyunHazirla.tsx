// ============================================================================
// Aşama 381: Oyunlar — yeni oyun hazırla
// Tür (Soru yarışı / Kelime çarkı), sınıf, bağlantı türü (sınıf QR'ı ya da öğrenciye özel), soru süresi, geçerlilik ve
// soru bankasından sorular seçilir. Sunucu seçimi yeniden denetler; oyun, soruların bir kopyasıyla kaydedilir
// (bankadan silinen soru oyunu bozmaz).
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Gamepad2 } from 'lucide-react';
import { Modal, Segmented, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { FieldLabel, SelectBox } from '../FormParts';
import { dataService } from '../../../services/dataService';
import { listOyunSorulari, type OyunSoru } from '../../../services/oyunService';
import { SoruSecici } from './SoruSecici';
import { GUN_SECENEKLERI, MOD_AD, MOD_LIM, MOD_TUR, SORU_SN, olusturOyun, type OyunKapsam, type OyunMod } from '../../../services/oyunOturumService';

/** Aşama 398: tür açıklamaları */
const MOD_NOT: Record<OyunMod, string> = {
  quiz: 'Her soruda 4 şık ve geri sayım var; hızlı doğru cevap daha çok puan kazandırır.',
  cark: 'İpucundan kelimeyi bulma oyunu: çark çevrilir, harf seçilir, kelime tahmin edilir.',
  bulmaca: 'Kelimeler çengel bulmaca olarak dizilir; öğrenci ipuçlarından kelimeleri yazar, gerekirse harf ipucu alır.',
  hafiza: 'Her kelimenin ipucu ve kelime kartı kapalı dizilir; öğrenci iki kart açarak eşleştirir. Az hamle, çok puan.',
};

const SURELER = [10, 15, 20, 30, 45, 60];

/** Aşama 384: zayıf kazanımlardan yeni oyun — ad, sınıf ve kazanımlar hazır gelir; bankadaki uygun sorular seçili açılır */
export interface OyunBaslangic {
  ad: string;
  classId: string;
  kazanimlar: string[];
  /** Aşama 397: sınıfın zorlandığı konudan (Oyunlar › Öğrenciler): bankada bu ders ve konudaki sorular seçili açılır */
  konu?: { ders: string; konu: string };
}

export const OyunHazirla: React.FC<{ onClose: () => void; onCreated: (oyunId: string) => void; baslangic?: OyunBaslangic | null }> = ({ onClose, onCreated, baslangic }) => {
  const siniflar = useMemo(() => dataService.getClasses(), []);
  const [mod, setMod] = useState<OyunMod>('quiz');
  const [kapsam, setKapsam] = useState<OyunKapsam>('sinif');
  const [ad, setAd] = useState(baslangic?.ad || '');
  const [classId, setClassId] = useState(baslangic && siniflar.some((c) => c.id === baslangic.classId) ? baslangic.classId : siniflar[0]?.id || '');
  const [sureSn, setSureSn] = useState<number>(SORU_SN.varsayilan);
  const [gun, setGun] = useState(7);
  const [bildir, setBildir] = useState(true); // Aşama 385
  const [secili, setSecili] = useState<string[]>([]);
  const [bank, setBank] = useState<OyunSoru[] | null>(null);
  const [bankHata, setBankHata] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediyor, setKaydediyor] = useState(false);

  const yukle = async () => {
    try {
      setBank(await listOyunSorulari());
      setBankHata(null);
    } catch (e) {
      setBankHata(e instanceof Error ? e.message : 'Sorular yüklenemedi.');
    }
  };
  useEffect(() => {
    void yukle();
  }, []);

  const tur = MOD_TUR[mod];
  const lim = MOD_LIM[mod];
  // tür değişince önceki türün soruları seçili kalmasın
  useEffect(() => setSecili([]), [mod]);

  // zayıf kazanımlardan açıldıysa: banka gelince o kazanımların uygun soruları seçilir (tür değişince yeniden)
  const kazanimSorulari = useMemo(() => {
    if (!baslangic || !bank) return [];
    const k = baslangic.konu;
    if (k) return bank.filter((s) => s.tur === tur && s.ders === k.ders && (s.konu || '').trim() === k.konu).slice(0, lim.en_cok);
    const kodlar = new Set(baslangic.kazanimlar);
    return bank.filter((s) => s.tur === tur && s.kazanimKodu && kodlar.has(s.kazanimKodu)).slice(0, lim.en_cok);
  }, [baslangic, bank, tur, lim.en_cok]);
  useEffect(() => {
    if (kazanimSorulari.length) setSecili(kazanimSorulari.map((s) => s.id));
  }, [kazanimSorulari]);

  const sinif = siniflar.find((c) => c.id === classId);
  // bulmacada ve hafızada aynı cevap iki kez olamaz (bulmacada iki kelime aynı yere düşer, hafızada çift karışır)
  const tekrarVar = useMemo(() => {
    if ((mod !== 'bulmaca' && mod !== 'hafiza') || !bank) return false;
    const cevaplar = secili.map((id) => bank.find((s) => s.id === id)?.cevap.toLocaleUpperCase('tr-TR') || id);
    return new Set(cevaplar).size !== cevaplar.length;
  }, [mod, bank, secili]);
  const gecerli = ad.trim().length >= 2 && !!classId && secili.length >= lim.en_az && secili.length <= lim.en_cok && !tekrarVar;

  const kaydet = async () => {
    setHata(null);
    if (!gecerli) {
      setHata(ad.trim().length < 2 ? 'Oyuna bir ad verin.' : !classId ? 'Sınıf seçin.' : tekrarVar ? `${MOD_AD[mod]} oyununda aynı cevap iki kez kullanılamaz.` : `Bu oyun için ${lim.en_az} ile ${lim.en_cok} arasında soru seçin.`);
      return;
    }
    setKaydediyor(true);
    try {
      const r = await olusturOyun({ mod, kapsam, ad: ad.trim(), classId, soruIds: secili, sureSn, gun, bildir });
      onCreated(r.id);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Oyun hazırlanamadı.');
      setKaydediyor(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      icon={Gamepad2}
      title="Yeni oyun hazırla"
      description="Sorularını seç, bağlantıyı öğrencilerine ver."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {tekrarVar ? 'Aynı cevaplı iki kelime seçili' : `${secili.length} soru seçili · ${lim.en_az}-${lim.en_cok} arası olmalı`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={kaydediyor}>
              Vazgeç
            </Button>
            <Button onClick={() => void kaydet()} isLoading={kaydediyor} disabled={!gecerli}>
              Oyunu hazırla
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <FieldLabel>Oyun türü</FieldLabel>
          <Segmented<OyunMod>
            items={[
              { value: 'quiz', label: MOD_AD.quiz },
              { value: 'cark', label: MOD_AD.cark },
              { value: 'bulmaca', label: MOD_AD.bulmaca },
              { value: 'hafiza', label: MOD_AD.hafiza },
            ]}
            value={mod}
            onChange={setMod}
          />
          <p className="text-xs text-muted">{MOD_NOT[mod]}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="oyun-ad">Oyunun adı</FieldLabel>
            <input id="oyun-ad" value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} placeholder="Örn. Hücre bölünmesi tekrarı" className="ui-field w-full" />
          </div>
          <div>
            <FieldLabel htmlFor="oyun-sinif">Sınıf</FieldLabel>
            <SelectBox id="oyun-sinif" value={classId} onChange={(e) => setClassId(e.target.value)} className="ui-field cursor-pointer w-full">
              {siniflar.length === 0 && <option value="">Sınıf yok</option>}
              {siniflar.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <FieldLabel>Bağlantı türü</FieldLabel>
            <Segmented<OyunKapsam>
              items={[
                { value: 'sinif', label: 'Sınıf (QR)' },
                { value: 'kisisel', label: 'Kişisel' },
              ]}
              value={kapsam}
              onChange={setKapsam}
            />
            <p className="mt-1 text-xs text-muted">{kapsam === 'sinif' ? 'Tek bağlantı ve QR kod, sınıfta hızlı başlatmak için; öğrenci listeden adını seçer.' : 'Her öğrenciye kendine özel bağlantı; kimse başkasının yerine oynayamaz.'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {mod === 'quiz' && (
              <div>
                <FieldLabel htmlFor="oyun-sure">Soru süresi</FieldLabel>
                <SelectBox id="oyun-sure" value={String(sureSn)} onChange={(e) => setSureSn(Number(e.target.value))} className="ui-field cursor-pointer w-full">
                  {SURELER.map((n) => (
                    <option key={n} value={n}>
                      {n} sn
                    </option>
                  ))}
                </SelectBox>
              </div>
            )}
            <div className={mod === 'quiz' ? '' : 'col-span-2'}>
              <FieldLabel htmlFor="oyun-gun">Açık kalma süresi</FieldLabel>
              <SelectBox id="oyun-gun" value={String(gun)} onChange={(e) => setGun(Number(e.target.value))} className="ui-field cursor-pointer w-full">
                {GUN_SECENEKLERI.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </SelectBox>
            </div>
          </div>
        </div>
        {sinif && kapsam === 'kisisel' && <p className="text-xs text-muted">{sinif.name} sınıfındaki etkin öğrenciler için ayrı bağlantı üretilir.</p>}
        {/* Aşama 385: oyun her durumda öğrencinin ana sayfasında (Bana gelenler › Oyun) kendi adıyla açılır */}
        <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-fg" id="oyun-bildir">
          <input type="checkbox" checked={bildir} onChange={(ev) => setBildir(ev.target.checked)} className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="font-medium">Öğrencilere bildir</span>
            <span className="block text-xs text-muted">Oyun, öğrencinin ana sayfasında kendi adıyla açılır; bildirimle haber verilir.</span>
          </span>
        </label>

        {baslangic && bank && (
          <p className={cx('rounded-xl px-3.5 py-2.5 text-xs', kazanimSorulari.length >= lim.en_az ? 'bg-brand-soft text-brand-fg' : 'bg-warning-soft text-warning-fg')}>
            {baslangic.konu ? `Sınıfın zorlandığı konu: ${baslangic.konu.konu} (${baslangic.konu.ders}).` : `Zayıf kazanımlar: ${baslangic.kazanimlar.join(', ')}.`}{' '}
            {kazanimSorulari.length
              ? `Bankada ${baslangic.konu ? 'bu konuya' : 'bu kazanımlara'} ait ${kazanimSorulari.length} soru seçildi.`
              : `Bankada ${baslangic.konu ? 'bu konuya' : 'bu kazanımlara'} ait soru yok.`}
            {kazanimSorulari.length < lim.en_az && ` En az ${lim.en_az} soru gerekir: listeden ekleyin ya da Soru bankası › "Yapay zekâ ile öner" ile ${baslangic.konu ? 'bu konuya' : 'bu kazanımlara'} soru üretin.`}
          </p>
        )}
        <SoruSecici bank={bank} bankHata={bankHata} onTekrar={yukle} tur={tur} secili={secili} onChange={setSecili} enCok={lim.en_cok} />

        {hata && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-xs text-danger-fg">
            <AlertCircle className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden />
            {hata}
          </p>
        )}
      </div>
    </Modal>
  );
};
