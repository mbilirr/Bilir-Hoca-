// ============================================================================
// Aşama 381: Oyunlar — yeni oyun hazırla
// Tür (Soru yarışı / Kelime çarkı), sınıf, bağlantı türü (sınıf QR'ı ya da öğrenciye özel), soru süresi, geçerlilik ve
// soru bankasından sorular seçilir. Sunucu seçimi yeniden denetler; oyun, soruların bir kopyasıyla kaydedilir
// (bankadan silinen soru oyunu bozmaz).
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Gamepad2, Search } from 'lucide-react';
import { Modal, Segmented, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { Yukleniyor, YuklemeHatasi } from '../../ui/Durum';
import { FieldLabel, SelectBox } from '../FormParts';
import { dataService } from '../../../services/dataService';
import { listOyunSorulari, TUR_AD, type OyunSoru } from '../../../services/oyunService';
import { BULMACA_KELIME, CARK_KELIME, GUN_SECENEKLERI, MOD_AD, QUIZ_SORU, SORU_SN, olusturOyun, type OyunKapsam, type OyunMod } from '../../../services/oyunOturumService';

const norm = (v: string) => v.toLocaleLowerCase('tr-TR');
const SURELER = [10, 15, 20, 30, 45, 60];

export const OyunHazirla: React.FC<{ onClose: () => void; onCreated: (oyunId: string) => void }> = ({ onClose, onCreated }) => {
  const siniflar = useMemo(() => dataService.getClasses(), []);
  const [mod, setMod] = useState<OyunMod>('quiz');
  const [kapsam, setKapsam] = useState<OyunKapsam>('sinif');
  const [ad, setAd] = useState('');
  const [classId, setClassId] = useState(siniflar[0]?.id || '');
  const [sureSn, setSureSn] = useState<number>(SORU_SN.varsayilan);
  const [gun, setGun] = useState(7);
  const [secili, setSecili] = useState<string[]>([]);
  const [bank, setBank] = useState<OyunSoru[] | null>(null);
  const [bankHata, setBankHata] = useState<string | null>(null);
  const [fDers, setFDers] = useState('');
  const [ara, setAra] = useState('');
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

  const tur = mod === 'quiz' ? 'coktan' : 'kelime';
  const lim = mod === 'quiz' ? QUIZ_SORU : mod === 'bulmaca' ? BULMACA_KELIME : CARK_KELIME;
  const uygun = useMemo(() => (bank || []).filter((s) => s.tur === tur), [bank, tur]);
  const dersler = useMemo(() => Array.from(new Set(uygun.map((s) => s.ders))).sort((a, b) => a.localeCompare(b, 'tr')), [uygun]);
  const gorunen = useMemo(() => {
    const q = norm(ara.trim());
    return uygun.filter((s) => (!fDers || s.ders === fDers) && (!q || norm(`${s.metin} ${s.cevap} ${s.konu} ${s.kazanimKodu || ''}`).includes(q)));
  }, [uygun, fDers, ara]);

  // tür değişince önceki türün soruları seçili kalmasın
  useEffect(() => {
    setSecili([]);
    setFDers('');
  }, [mod]);

  const degistir = (id: string) => setSecili((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length >= lim.en_cok ? l : [...l, id]));
  const gorunenleriSec = () =>
    setSecili((l) => {
      const yeni = [...l];
      for (const s of gorunen) if (!yeni.includes(s.id) && yeni.length < lim.en_cok) yeni.push(s.id);
      return yeni;
    });

  const sinif = siniflar.find((c) => c.id === classId);
  // bulmacada aynı cevap iki kez olamaz (iki kelime aynı yere düşer)
  const tekrarVar = useMemo(() => {
    if (mod !== 'bulmaca' || !bank) return false;
    const cevaplar = secili.map((id) => bank.find((s) => s.id === id)?.cevap.toLocaleUpperCase('tr-TR') || id);
    return new Set(cevaplar).size !== cevaplar.length;
  }, [mod, bank, secili]);
  const gecerli = ad.trim().length >= 2 && !!classId && secili.length >= lim.en_az && secili.length <= lim.en_cok && !tekrarVar;

  const kaydet = async () => {
    setHata(null);
    if (!gecerli) {
      setHata(ad.trim().length < 2 ? 'Oyuna bir ad verin.' : !classId ? 'Sınıf seçin.' : tekrarVar ? 'Bulmacada aynı cevap iki kez kullanılamaz.' : `Bu oyun için ${lim.en_az} ile ${lim.en_cok} arasında soru seçin.`);
      return;
    }
    setKaydediyor(true);
    try {
      const r = await olusturOyun({ mod, kapsam, ad: ad.trim(), classId, soruIds: secili, sureSn, gun });
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
            ]}
            value={mod}
            onChange={setMod}
          />
          <p className="text-xs text-muted">
            {mod === 'quiz'
              ? 'Her soruda 4 şık ve geri sayım var; hızlı doğru cevap daha çok puan kazandırır.'
              : mod === 'cark'
                ? 'İpucundan kelimeyi bulma oyunu: çark çevrilir, harf seçilir, kelime tahmin edilir.'
                : 'Kelimeler çengel bulmaca olarak dizilir; öğrenci ipuçlarından kelimeleri yazar, gerekirse harf ipucu alır.'}
          </p>
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
            <p className="mt-1 text-xs text-muted">{kapsam === 'sinif' ? 'Tek bağlantı ve QR kod; öğrenci listeden adını seçer.' : 'Her öğrenciye kendine özel bağlantı; kimse başkasının yerine oynayamaz.'}</p>
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

        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <FieldLabel>Sorular ({TUR_AD[tur]})</FieldLabel>
            {gorunen.length > 0 && (
              <button type="button" onClick={gorunenleriSec} className="text-xs font-semibold text-brand-fg hover:underline">
                Görünenleri seç
              </button>
            )}
          </div>
          {bankHata && <YuklemeHatasi mesaj={bankHata} onTekrar={yukle} />}
          {!bankHata && bank === null && <Yukleniyor satir={3} metin="Soru bankası yükleniyor…" />}
          {bank && uygun.length === 0 && (
            <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-xs text-muted">
              Soru bankasında {mod === 'quiz' ? 'çoktan seçmeli' : 'kelime'} soru yok. Önce "Soru bankası" sekmesinden soru ekleyin.
            </p>
          )}
          {bank && uygun.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <SelectBox aria-label="Ders" value={fDers} onChange={(e) => setFDers(e.target.value)} className="ui-field cursor-pointer w-full">
                  <option value="">Bütün dersler</option>
                  {dersler.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </SelectBox>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle" aria-hidden />
                  <input type="search" aria-label="Soru ara" value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Soru ya da kazanım ara" className="ui-field w-full pl-9" />
                </div>
              </div>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-line p-1.5">
                {gorunen.length === 0 && <li className="py-6 text-center text-xs text-muted">Bu süzgece uyan soru yok.</li>}
                {gorunen.map((s) => {
                  const on = secili.includes(s.id);
                  return (
                    <li key={s.id}>
                      <label className={cx('flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm', on ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                        <input type="checkbox" checked={on} onChange={() => degistir(s.id)} className="mt-1 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-2xs font-semibold text-muted">
                            {s.ders}
                            {s.sinif ? ` · ${s.sinif}. sınıf` : ''}
                            {s.kazanimKodu ? ` · ${s.kazanimKodu}` : ''}
                          </span>
                          <span className="block break-words text-fg">{s.metin}</span>
                          {s.tur === 'kelime' && <span className="block text-xs text-muted">Cevap: {s.cevap}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

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
