// ============================================================================
// Aşama 383: TAHTADA OYNA — kurulum: Düello ya da Grup, takım adları, soru süresi, sorular (çoktan seçmeli)
// Kayıt yok; oyun öğretmenin ekranında tam ekran oynanır.
// ============================================================================
import React, { Suspense, useEffect, useState } from 'react';
import { AlertCircle, Presentation } from 'lucide-react';
import { lazyNamed } from '../../../../lib/lazyLoad';
import { Modal, Segmented } from '../../../ui/kit';
import { Button } from '../../../ui/Button';
import { FieldLabel, SelectBox } from '../../FormParts';
import { listOyunSorulari, type OyunSoru } from '../../../../services/oyunService';
import { SoruSecici } from '../SoruSecici';
import { GRUP_SAYISI, TAHTA_SORU, type TahtaMod } from './kurallar';

const TahtaSahne = lazyNamed<React.ComponentProps<typeof import('./TahtaSahne').TahtaSahne>>(() => import('./TahtaSahne'), 'TahtaSahne');

const SURELER = [10, 15, 20, 30, 45, 60];
const varsayilanAd = (mod: TahtaMod, i: number) => (mod === 'duello' ? ['Mavi takım', 'Turuncu takım'][i] : `${i + 1}. grup`);

export const TahtaKurulum: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [mod, setMod] = useState<TahtaMod>('duello');
  const [grupSayisi, setGrupSayisi] = useState(4);
  const [adlar, setAdlar] = useState<string[]>([]);
  const [sureSn, setSureSn] = useState(20);
  const [secili, setSecili] = useState<string[]>([]);
  const [bank, setBank] = useState<OyunSoru[] | null>(null);
  const [bankHata, setBankHata] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [oyun, setOyun] = useState<{ adlar: string[]; sorular: OyunSoru[] } | null>(null);

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

  const sayi = mod === 'duello' ? 2 : grupSayisi;
  const ad = (i: number) => (adlar[i] ?? '').trim() || varsayilanAd(mod, i);
  const gecerli = secili.length >= TAHTA_SORU.en_az && secili.length <= TAHTA_SORU.en_cok;

  const baslat = () => {
    if (!gecerli || !bank) return setHata(`${TAHTA_SORU.en_az} ile ${TAHTA_SORU.en_cok} arasında soru seçin.`);
    setHata(null);
    setOyun({ adlar: Array.from({ length: sayi }, (_, i) => ad(i)), sorular: secili.map((id) => bank.find((s) => s.id === id)).filter((s): s is OyunSoru => !!s) });
  };

  if (oyun) {
    return (
      <Suspense fallback={null}>
        <TahtaSahne mod={mod} takimAdlari={oyun.adlar} sorular={oyun.sorular} sureSn={sureSn} onClose={onClose} onKur={() => setOyun(null)} />
      </Suspense>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      icon={Presentation}
      title="Tahtada oyna"
      description="Sınıfça akıllı tahtada ya da projeksiyonda oynanır; kayıt tutulmaz."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {secili.length} soru seçili · {TAHTA_SORU.en_az}-{TAHTA_SORU.en_cok} arası olmalı
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Vazgeç
            </Button>
            <Button onClick={baslat} disabled={!gecerli}>
              Başlat
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <FieldLabel>Oyun biçimi</FieldLabel>
          <Segmented<TahtaMod>
            items={[
              { value: 'duello', label: 'Düello' },
              { value: 'grup', label: 'Grup' },
            ]}
            value={mod}
            onChange={(v) => {
              setMod(v);
              setAdlar([]);
            }}
          />
          <p className="text-xs text-muted">
            {mod === 'duello'
              ? 'İki takım tahtanın iki yanında aynı soruyu cevaplar. İlk doğru cevaplayan puanı alır; yanlış yapan o soruda bekler.'
              : 'Gruplar sırayla cevaplar. Sırası gelen grubun tek hakkı var; istersen pas geçebilirsin.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mod === 'grup' && (
            <div>
              <FieldLabel htmlFor="tahta-grup">Grup sayısı</FieldLabel>
              <SelectBox id="tahta-grup" value={String(grupSayisi)} onChange={(e) => setGrupSayisi(Number(e.target.value))} className="ui-field cursor-pointer w-full">
                {Array.from({ length: GRUP_SAYISI.en_cok - GRUP_SAYISI.en_az + 1 }, (_, i) => i + GRUP_SAYISI.en_az).map((n) => (
                  <option key={n} value={n}>
                    {n} grup
                  </option>
                ))}
              </SelectBox>
            </div>
          )}
          <div>
            <FieldLabel htmlFor="tahta-sure">Soru süresi</FieldLabel>
            <SelectBox id="tahta-sure" value={String(sureSn)} onChange={(e) => setSureSn(Number(e.target.value))} className="ui-field cursor-pointer w-full">
              {SURELER.map((n) => (
                <option key={n} value={n}>
                  {n} sn
                </option>
              ))}
            </SelectBox>
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>{mod === 'duello' ? 'Takım adları' : 'Grup adları'}</FieldLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: sayi }, (_, i) => (
              <input
                key={`${mod}-${i}`}
                aria-label={`${i + 1}. ${mod === 'duello' ? 'takım' : 'grup'} adı`}
                value={adlar[i] ?? ''}
                placeholder={varsayilanAd(mod, i)}
                maxLength={24}
                onChange={(e) => setAdlar((l) => {
                  const y = [...l];
                  y[i] = e.target.value;
                  return y;
                })}
                className="ui-field w-full"
              />
            ))}
          </div>
        </div>

        <SoruSecici bank={bank} bankHata={bankHata} onTekrar={yukle} tur="coktan" secili={secili} onChange={setSecili} enCok={TAHTA_SORU.en_cok} />

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
