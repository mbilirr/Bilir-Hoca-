// ============================================================================
// Aşama 394: Oyunlar — metin yapıştırarak toplu soru ekleme
// Word / kitap / test metni yapıştırılır; yapay zekâ metni sorulara ve şıklara AYIRIR (çözmez). Doğru cevap metinde
// yazılıysa (ör. "Cevap: B") işaretlenir; yazılı değilse öğretmen seçer. Seçilmeyen soru eklenemez.
// ============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ClipboardPaste, Trash2 } from 'lucide-react';
import { Modal, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { FieldLabel, SelectBox } from '../FormParts';
import { basariBildir } from '../../../lib/bildirim';
import { OYUN_YAPISTIR_EN_COK, aiCall, aiOyunMetinCoz, aiStatus, newAiState, type AiAyrilanSoru } from '../../../lib/aiApi';
import { SIK_HARF, TOPLU_EN_COK, ZORLUKLAR, topluEkleOyunSorulari, type OyunZorluk } from '../../../services/oyunService';
import { OYUN_DERSLERI, OYUN_SINIFLARI, varsayilanDers } from './ortak';

interface Satir extends AiAyrilanSoru {
  no: number;
}

export const TopluYapistir: React.FC<{
  baslangic?: { ders?: string; sinif?: number | null };
  onClose: () => void;
  onSaved: () => void;
}> = ({ baslangic, onClose, onSaved }) => {
  const [metin, setMetin] = useState('');
  const [ders, setDers] = useState(baslangic?.ders || varsayilanDers());
  const [sinif, setSinif] = useState<number | null>(baslangic?.sinif ?? null);
  const [zorluk, setZorluk] = useState<OyunZorluk>('orta');
  const [satirlar, setSatirlar] = useState<Satir[] | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [bekleme, setBekleme] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const durdur = useRef(false);
  useEffect(
    () => () => {
      durdur.current = true;
    },
    []
  );

  const ayir = async () => {
    setHata(null);
    if (metin.trim().length < 20) return setHata('Soruları içeren metni yapıştırın.');
    setCalisiyor(true);
    durdur.current = false;
    try {
      const st = await aiStatus();
      if (!st.ok || (!st.gemini && !st.mistral)) return setHata('Yapay zekâ bu sunucuda kurulu değil. Soruları tek tek ekleyebilirsiniz.');
      const r = await aiCall(newAiState(!st.gemini && st.mistral ? 'mistral' : 'gemini', true, { gemini: !!st.gemini, mistral: !!st.mistral }), (p) => aiOyunMetinCoz({ provider: p, metin }), {
        stop: () => durdur.current,
        onWait: setBekleme,
      });
      if (durdur.current) return;
      if (!r.ok) return setHata(r.error || 'Metin sorulara ayrılamadı. Biraz sonra tekrar deneyin.');
      const liste = ((r.items || []) as AiAyrilanSoru[]).map((x, i) => ({ ...x, no: i + 1 }));
      if (!liste.length) return setHata('Metinde 4 şıklı soru bulunamadı. Her sorunun A, B, C, D şıkları olmalı.');
      setSatirlar(liste);
    } finally {
      if (!durdur.current) {
        setCalisiyor(false);
        setBekleme(null);
      }
    }
  };

  const eksik = satirlar ? satirlar.filter((s) => s.dogru < 0).length : 0;

  const ekle = async () => {
    if (!satirlar || !satirlar.length) return;
    if (!ders) return setHata('Dersi seçin.');
    if (eksik) return setHata(`${eksik} sorunun doğru şıkkı seçilmedi. Seçin ya da soruyu kaldırın.`);
    if (satirlar.length > TOPLU_EN_COK) return setHata(`Bir seferde en çok ${TOPLU_EN_COK} soru eklenir. Fazlasını kaldırın.`);
    setHata(null);
    setKaydediyor(true);
    try {
      const n = await topluEkleOyunSorulari(
        satirlar.map((s) => ({ tur: 'coktan' as const, sinif, ders, konu: '', kazanimKodu: null, zorluk, metin: s.metin, siklar: s.siklar, dogru: s.dogru, cevap: '', aciklama: s.aciklama }))
      );
      basariBildir(`${n} soru eklendi`);
      onSaved();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Sorular eklenemedi.');
    } finally {
      setKaydediyor(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={ClipboardPaste}
      title="Metinden soru ekle"
      description="Word ya da kitaptaki soruları yapıştırın; yapay zekâ soru ve şıklara ayırır. Doğru cevap metinde yazılıysa işaretler, değilse siz seçersiniz."
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">{satirlar ? (eksik ? `${eksik} soruda doğru şık seçilmedi` : `${satirlar.length} soru hazır`) : ''}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={kaydediyor}>
              Kapat
            </Button>
            {satirlar ? (
              <Button onClick={() => void ekle()} isLoading={kaydediyor} loadingText="Ekleniyor…" disabled={!satirlar.length}>
                Soruları ekle
              </Button>
            ) : (
              <Button onClick={() => void ayir()} isLoading={calisiyor} loadingText="Ayrılıyor…" disabled={metin.trim().length < 20}>
                Soruları ayır
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <FieldLabel htmlFor="ty-ders">Ders</FieldLabel>
            <SelectBox id="ty-ders" value={ders} onChange={(e) => setDers(e.target.value)} className="ui-field cursor-pointer w-full">
              <option value="">Seçin</option>
              {OYUN_DERSLERI.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <FieldLabel htmlFor="ty-sinif" optional>
              Sınıf
            </FieldLabel>
            <SelectBox id="ty-sinif" value={sinif === null ? '' : String(sinif)} onChange={(e) => setSinif(e.target.value ? Number(e.target.value) : null)} className="ui-field cursor-pointer w-full">
              <option value="">Tüm sınıflar</option>
              {OYUN_SINIFLARI.map((n) => (
                <option key={n} value={n}>
                  {n}. sınıf
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <FieldLabel htmlFor="ty-zorluk">Zorluk</FieldLabel>
            <SelectBox id="ty-zorluk" value={zorluk} onChange={(e) => setZorluk(e.target.value as OyunZorluk)} className="ui-field cursor-pointer w-full">
              {ZORLUKLAR.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>

        {!satirlar ? (
          <div>
            <FieldLabel htmlFor="ty-metin">Sorular</FieldLabel>
            <textarea
              id="ty-metin"
              value={metin}
              maxLength={OYUN_YAPISTIR_EN_COK}
              rows={10}
              onChange={(e) => setMetin(e.target.value)}
              className="ui-field w-full font-mono text-xs"
              placeholder={'1. Mevsimlerin oluşmasının nedeni nedir?\nA) Eksen eğikliği\nB) Dünya\'nın dönmesi\nC) Ay\'ın çekimi\nD) Güneş lekeleri\nCevap: A'}
            />
            <p className="mt-1 text-2xs text-subtle">
              {metin.length.toLocaleString('tr-TR')} / {OYUN_YAPISTIR_EN_COK.toLocaleString('tr-TR')} karakter · yapay zekâya yalnız bu metin gider
            </p>
            {calisiyor && <p className="mt-2 text-xs text-muted">{bekleme || 'Yapay zekâ metni sorulara ayırıyor…'}</p>}
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-muted">Yapay zekâ hata yapabilir: eklemeden önce soruları ve doğru şıkları kontrol edin.</p>
            {satirlar.map((s) => (
              <div key={s.no} className={cx('rounded-xl border p-3 space-y-2', s.dogru < 0 ? 'border-warning bg-warning-soft/30' : 'border-line bg-surface')}>
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm text-fg leading-snug">
                    <span className="font-semibold text-muted">{s.no}. </span>
                    {s.metin}
                  </p>
                  <Button variant="danger-soft" size="sm" ikon aria-label="Soruyu kaldır" title="Kaldır" onClick={() => setSatirlar((l) => (l ? l.filter((x) => x.no !== s.no) : l))}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div role="radiogroup" aria-label={`${s.no}. soru doğru şık`} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {s.siklar.map((o, i) => (
                    <label key={i} className={cx('ui-secim justify-start text-left', s.dogru === i && 'is-on')}>
                      <input type="radio" className="sr-only" name={`ty-dogru-${s.no}`} checked={s.dogru === i} onChange={() => setSatirlar((l) => (l ? l.map((x) => (x.no === s.no ? { ...x, dogru: i } : x)) : l))} />
                      <span className="font-semibold">{SIK_HARF[i]})</span> {o}
                    </label>
                  ))}
                </div>
                {s.dogru < 0 && <p className="text-2xs font-semibold text-warning-fg">Metinde doğru cevap yazmıyor: doğru şıkkı seçin.</p>}
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSatirlar(null);
                setHata(null);
              }}
              disabled={kaydediyor}
            >
              Metne dön
            </Button>
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
