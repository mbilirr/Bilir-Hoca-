// ============================================================================
// Aşama 395: Oyunlar — Excel ile toplu soru yükleme
// Şablonu indir › doldur › yükle. Dosya tarayıcıda okunur; geçerli satırlar listelenir, hatalı satırlar satır
// numarası ve nedeniyle gösterilir. "Ekle" yalnız geçerli satırları 30'arlı parçalarla soru bankasına yazar.
// ============================================================================
import React, { useRef, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, FileUp } from 'lucide-react';
import { Modal } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { FieldLabel, SelectBox } from '../FormParts';
import { basariBildir } from '../../../lib/bildirim';
import { EXCEL_BASLIKLAR, EXCEL_EN_COK, EXCEL_ORNEK, excelSorulariCoz, type ExcelSonuc } from '../../../lib/oyunExcel';
import { SIK_HARF, TOPLU_EN_COK, topluEkleOyunSorulari } from '../../../services/oyunService';
import { OYUN_DERSLERI, OYUN_SINIFLARI, varsayilanDers } from './ortak';

export const ExcelSoruYukle: React.FC<{
  baslangic?: { ders?: string; sinif?: number | null };
  onClose: () => void;
  onSaved: () => void;
}> = ({ baslangic, onClose, onSaved }) => {
  const [ders, setDers] = useState(baslangic?.ders || varsayilanDers());
  const [sinif, setSinif] = useState<number | null>(baslangic?.sinif ?? null);
  const [tablo, setTablo] = useState<{ ad: string; satirlar: unknown[][] } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [durum, setDurum] = useState<string | null>(null);
  const dosyaRef = useRef<HTMLInputElement>(null);

  const sonuc: ExcelSonuc | null = tablo && ders ? excelSorulariCoz(tablo.satirlar, ders, sinif) : null;

  const sablonIndir = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([[...EXCEL_BASLIKLAR], EXCEL_ORNEK]);
    ws['!cols'] = [{ wch: 48 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 8 }, { wch: 36 }, { wch: 9 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sorular');
    XLSX.writeFile(wb, 'oyun-sorulari-sablon.xlsx');
  };

  const dosyaSec = async (file: File | undefined) => {
    if (!file) return;
    setHata(null);
    setDurum('Dosya okunuyor…');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('Dosyada sayfa yok.');
      setTablo({ ad: file.name, satirlar: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' }) });
    } catch (e) {
      setTablo(null);
      setHata(e instanceof Error && e.message === 'Dosyada sayfa yok.' ? e.message : 'Dosya okunamadı. Şablondaki gibi bir Excel (.xlsx) dosyası seçin.');
    } finally {
      setDurum(null);
    }
  };

  const ekle = async () => {
    if (!sonuc || !sonuc.gecerli.length) return;
    setHata(null);
    let eklenen = 0;
    try {
      for (let i = 0; i < sonuc.gecerli.length; i += TOPLU_EN_COK) {
        setDurum(`Ekleniyor… ${eklenen} / ${sonuc.gecerli.length}`);
        eklenen += await topluEkleOyunSorulari(sonuc.gecerli.slice(i, i + TOPLU_EN_COK));
      }
      basariBildir(`${eklenen} soru eklendi`);
      onSaved();
    } catch (e) {
      setHata(`${eklenen ? `${eklenen} soru eklendi, kalanı eklenemedi: ` : ''}${e instanceof Error ? e.message : 'Sorular eklenemedi.'}`);
      if (eklenen) onSaved();
    } finally {
      setDurum(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={FileSpreadsheet}
      title="Excel ile soru yükle"
      description={`Şablonu indirip doldurun, sonra yükleyin. Bir dosyada en çok ${EXCEL_EN_COK} soru. Dosya tarayıcıda okunur.`}
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">{durum || (sonuc && !sonuc.eksikSutunlar.length ? `${sonuc.gecerli.length} soru hazır${sonuc.hatali.length ? ` · ${sonuc.hatali.length} satır hatalı` : ''}` : '')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={!!durum}>
              Kapat
            </Button>
            <Button onClick={() => void ekle()} disabled={!sonuc || !sonuc.gecerli.length || !!durum} isLoading={!!durum && !!sonuc} loadingText="Ekleniyor…">
              {sonuc && sonuc.gecerli.length ? `${sonuc.gecerli.length} soruyu ekle` : 'Soruları ekle'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="ex-ders">Ders</FieldLabel>
            <SelectBox id="ex-ders" value={ders} onChange={(e) => setDers(e.target.value)} className="ui-field cursor-pointer w-full">
              <option value="">Seçin</option>
              {OYUN_DERSLERI.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <FieldLabel htmlFor="ex-sinif" optional>
              Sınıf
            </FieldLabel>
            <SelectBox id="ex-sinif" value={sinif === null ? '' : String(sinif)} onChange={(e) => setSinif(e.target.value ? Number(e.target.value) : null)} className="ui-field cursor-pointer w-full">
              <option value="">Tüm sınıflar</option>
              {OYUN_SINIFLARI.map((n) => (
                <option key={n} value={n}>
                  {n}. sınıf
                </option>
              ))}
            </SelectBox>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Button variant="secondary" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={() => void sablonIndir()}>
            Şablonu indir
          </Button>
          <Button variant="secondary" leftIcon={<FileUp className="w-3.5 h-3.5" />} onClick={() => dosyaRef.current?.click()} disabled={!!durum}>
            {tablo ? 'Başka dosya seç' : 'Dosyayı yükle'}
          </Button>
          <input ref={dosyaRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void dosyaSec(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        </div>
        <p className="text-2xs text-subtle">Sütunlar: Soru, A, B, C, D, Doğru (A-D), Açıklama, Zorluk (Kolay/Orta/Zor), Konu. Son üçü isteğe bağlı.</p>

        {tablo && !ders && <p className="text-xs font-semibold text-warning-fg">Soruları görmek için dersi seçin.</p>}

        {sonuc && sonuc.eksikSutunlar.length > 0 && (
          <p role="alert" className="rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-warning-fg">
            {tablo?.ad}: şu sütunlar bulunamadı: {sonuc.eksikSutunlar.join(', ')}. İlk satır başlık olmalı; şablonu kullanın.
          </p>
        )}

        {sonuc && !sonuc.eksikSutunlar.length && (
          <div className="space-y-3">
            {sonuc.hatali.length > 0 && (
              <div className="rounded-xl border border-warning bg-warning-soft/30 p-3">
                <p className="text-xs font-semibold text-warning-fg">{sonuc.hatali.length} satır eklenmeyecek; düzeltip dosyayı yeniden yükleyebilirsiniz:</p>
                <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-xs text-fg-2">
                  {sonuc.hatali.map((h) => (
                    <li key={h.satir}>
                      <span className="font-semibold tabular-nums">Satır {h.satir}:</span> {h.hata}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sonuc.kesildi && <p className="text-xs font-semibold text-warning-fg">Dosyada {EXCEL_EN_COK}'den fazla soru var; ilk {EXCEL_EN_COK} soru okundu.</p>}
            {sonuc.gecerli.length > 0 ? (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-line p-1.5">
                {sonuc.gecerli.map((g, i) => (
                  <li key={i} className="rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2">
                    <span className="block break-words text-fg">{g.metin}</span>
                    <span className="block text-xs text-muted">
                      Doğru: <span className="font-semibold text-success-fg">{SIK_HARF[g.dogru ?? 0]}) {g.siklar[g.dogru ?? 0]}</span>
                      {g.konu ? ` · ${g.konu}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">Eklenebilecek soru yok.</p>
            )}
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
