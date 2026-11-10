import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Modal, Segmented, cx } from '../ui/kit';
import { DersAyar, ProgramSatiri, TopluSatir, TopluSonuc, programTopluYukle } from '../../services/dersService';
import { ExcelSonuc, excelSayfalari, programOku, programSablonIndir } from '../../lib/dersProgramExcel';

// ============================================================================
// Aşama 231: EXCEL'DEN DERS PROGRAMI YÜKLEME (toplu ya da tek sınıf).
// Akış: kapsam seç → (isteğe bağlı) şablon / mevcut programı indir → dosya seç → ekranda okunur →
// veritabanında DENEME yapılır (hiçbir şey yazılmaz, ne değişeceği gösterilir) → "Programı yükle".
// Okunamayan satır varsa yükleme yapılmaz (yarım dosya bir sınıfın saatlerini yanlışlıkla boşaltmasın).
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 justify-center';
type Kapsam = 'okul' | 'sinif';

export const ProgramExcelModal: React.FC<{
  open: boolean;
  onClose: () => void;
  ayar: DersAyar;
  siniflar: Array<{ id: string; name: string }>;
  ogretmenler: Array<{ id: string; name: string }>;
  program: ProgramSatiri[];
  dersAdlari: string[];
  baslangicSinif?: string;
  onDone: () => void;
}> = ({ open, onClose, ayar, siniflar, ogretmenler, program, dersAdlari, baslangicSinif, onDone }) => {
  const [kapsam, setKapsam] = useState<Kapsam>('okul');
  const [sinif, setSinif] = useState(baslangicSinif || siniflar[0]?.id || '');
  const [dosyaAd, setDosyaAd] = useState('');
  const [okunan, setOkunan] = useState<ExcelSonuc | null>(null);
  const [deneme, setDeneme] = useState<TopluSonuc | null>(null);
  const [ogretmenEkle, setOgretmenEkle] = useState(true);
  const [mesgul, setMesgul] = useState<'' | 'oku' | 'deneme' | 'yukle' | 'indir'>('');
  const [hata, setHata] = useState<string | null>(null);
  const [bitti, setBitti] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDosyaAd('');
    setOkunan(null);
    setDeneme(null);
    setHata(null);
    setBitti(null);
    setMesgul('');
    if (baslangicSinif) setSinif(baslangicSinif);
  }, [open, baslangicSinif]);

  const sinifAd = useMemo(() => new Map(siniflar.map((c) => [c.id, c.name])), [siniflar]);

  // Kapsama göre yüklenecek satırlar (tek sınıfta yalnız o sınıf)
  const satirlar: TopluSatir[] = useMemo(() => {
    if (!okunan) return [];
    return kapsam === 'sinif' ? okunan.satirlar.filter((s) => s.classId === sinif) : okunan.satirlar;
  }, [okunan, kapsam, sinif]);
  const disarida = useMemo(
    () => (okunan && kapsam === 'sinif' ? okunan.siniflar.filter((c) => c !== sinif).length : 0),
    [okunan, kapsam, sinif]
  );

  // Kapsam / dosya / eşleşme seçeneği değişince deneme yeniden yapılır
  useEffect(() => {
    setDeneme(null);
    setBitti(null);
    if (!open || !okunan || okunan.hatalar.length || !satirlar.length) return;
    let canli = true;
    setMesgul('deneme');
    programTopluYukle(satirlar, { deneme: true, ogretmenEkle })
      .then((r) => canli && setDeneme(r))
      .catch((e) => canli && setHata(e?.message || 'Kontrol edilemedi.'))
      .finally(() => canli && setMesgul(''));
    return () => {
      canli = false;
    };
  }, [open, okunan, satirlar, ogretmenEkle]);

  const dosyaSec = async (f: File | undefined) => {
    if (!f) return;
    setHata(null);
    setOkunan(null);
    setDosyaAd(f.name);
    setMesgul('oku');
    try {
      const sayfalar = await excelSayfalari(f);
      setOkunan(programOku(sayfalar, { ayar, siniflar, ogretmenler, dersAdlari }));
    } catch (e: any) {
      setHata(e?.message ? `Dosya okunamadı: ${e.message}` : 'Dosya okunamadı.');
    } finally {
      setMesgul('');
      if (input.current) input.current.value = '';
    }
  };

  const indir = async () => {
    setMesgul('indir');
    try {
      const ad = kapsam === 'sinif' ? sinifAd.get(sinif) || 'sinif' : 'okul';
      await programSablonIndir({
        ayar,
        program,
        siniflar,
        ogretmenler,
        classIds: kapsam === 'sinif' ? [sinif] : undefined,
        dosyaAdi: `ders-programi-${ad.replace(/[^\p{L}\p{N}]+/gu, '-')}.xlsx`,
      });
    } catch (e: any) {
      setHata(e?.message || 'Excel hazırlanamadı.');
    } finally {
      setMesgul('');
    }
  };

  const yukle = async () => {
    if (deneme?.ok !== true || mesgul) return;
    setMesgul('yukle');
    setHata(null);
    try {
      const r = await programTopluYukle(satirlar, { deneme: false, ogretmenEkle });
      if (r.ok === false) {
        setDeneme(r);
        return;
      }
      setBitti(
        `Yüklendi: ${r.sinif} sınıf, ${r.eklenen} ders saati yazıldı${r.kaldirilan ? `, ${r.kaldirilan} saat boşaldı` : ''}${r.degismeyen ? `, ${r.degismeyen} saat aynı kaldı` : ''}.`
      );
      setOkunan(null);
      setDosyaAd('');
      onDone();
    } catch (e: any) {
      setHata(e?.message || 'Yüklenemedi.');
    } finally {
      setMesgul('');
    }
  };

  const sinifSayisi = new Set(satirlar.map((s) => s.classId)).size;

  return (
    <Modal
      open={open}
      onClose={() => mesgul !== 'yukle' && onClose()}
      size="lg"
      icon={FileSpreadsheet}
      tone="success"
      title="Excel'den ders programı"
      description="Dosyadaki her sınıfın programı dosyadakiyle değiştirilir. Dosyada olmayan sınıflar değişmez."
      id="program-excel-modal"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={onClose} disabled={mesgul === 'yukle'}>
            Kapat
          </button>
          <button
            type="button"
            className={cx(BTN, 'w-36 ui-btn-primary')}
            onClick={() => void yukle()}
            disabled={deneme?.ok !== true || !!mesgul}
            id="program-excel-yukle"
          >
            <Upload className="w-3.5 h-3.5" /> {mesgul === 'yukle' ? 'Yükleniyor…' : 'Programı yükle'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={kapsam}
            onChange={setKapsam}
            items={[
              { value: 'okul', label: 'Bütün okul', id: 'program-excel-okul' },
              { value: 'sinif', label: 'Tek sınıf', id: 'program-excel-sinif' },
            ]}
          />
          {kapsam === 'sinif' && (
            <select className="ui-field w-40" aria-label="Sınıf" value={sinif} onChange={(e) => setSinif(e.target.value)}>
              {siniflar.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => void indir()} disabled={!!mesgul} id="program-excel-sablon">
            <Download className="w-3.5 h-3.5" /> {mesgul === 'indir' ? 'Hazırlanıyor…' : kapsam === 'sinif' ? 'Sınıfın programını indir' : 'Şablonu / programı indir'}
          </button>
          <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={() => input.current?.click()} disabled={!!mesgul} id="program-excel-sec">
            <FileSpreadsheet className="w-3.5 h-3.5" /> {mesgul === 'oku' ? 'Okunuyor…' : 'Excel dosyası seç'}
          </button>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void dosyaSec(e.target.files?.[0])} />
          {dosyaAd && <span className="text-xs text-fg-2 truncate max-w-[16rem]">{dosyaAd}</span>}
        </div>
        <p className="text-[11px] text-muted">
          Sütunlar: Sınıf · Gün · Ders saati · Ders · Öğretmen (ortak derste öğretmenleri virgülle yazın). Sınıf başına bir sayfa olan çizelge de
          okunur. Bugün başlamış ders saatleri değişmez; değişiklik o saatin bir sonraki dersinden geçerli olur.
        </p>

        {hata && (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {hata}
          </p>
        )}
        {bitti && (
          <p role="status" className="text-xs font-semibold text-success-fg">
            {bitti}
          </p>
        )}

        {okunan && okunan.hatalar.length > 0 && (
          <div className="rounded-xl border border-danger/30 bg-danger-soft p-3 space-y-1" role="alert" id="program-excel-okuma-hata">
            <p className="text-xs font-semibold text-danger-fg">
              {okunan.hatalar.length} satır okunamadı. Dosyayı düzeltip yeniden seçin (yarım yükleme yapılmaz).
            </p>
            <ul className="text-[11px] text-danger-fg max-h-48 overflow-y-auto list-disc pl-4">
              {okunan.hatalar.slice(0, 60).map((h, i) => (
                <li key={i}>
                  {h.yer}: {h.mesaj}
                </li>
              ))}
            </ul>
          </div>
        )}

        {okunan && !okunan.hatalar.length && (
          <div className="space-y-2" id="program-excel-ozet">
            <p className="text-xs text-fg-2">
              {okunan.bicim === 'cizelge' ? 'Çizelge biçimi' : 'Liste biçimi'} okundu: <b>{sinifSayisi}</b> sınıf, <b>{satirlar.length}</b> ders saati.
              {disarida > 0 && <span className="text-warning-fg"> Dosyadaki diğer {disarida} sınıf yüklenmeyecek (Tek sınıf seçili).</span>}
            </p>
            {!satirlar.length && <p className="text-xs font-semibold text-warning-fg">Seçili sınıf için dosyada satır yok.</p>}
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <input type="checkbox" checked={ogretmenEkle} onChange={(e) => setOgretmenEkle(e.target.checked)} />
              Sınıf öğretmenlerinde olmayan ders–öğretmen eşleşmelerini ekle
            </label>
            {mesgul === 'deneme' && <p className="text-xs text-muted">Veritabanında kontrol ediliyor (henüz bir şey yazılmadı)…</p>}
            {deneme && deneme.ok === false && (
              <div className="rounded-xl border border-danger/30 bg-danger-soft p-3 space-y-1" role="alert">
                <p className="text-xs font-semibold text-danger-fg">Yüklenemez: {deneme.hataSayisi} sorun var. Hiçbir şey değişmedi.</p>
                <ul className="text-[11px] text-danger-fg max-h-48 overflow-y-auto list-disc pl-4">
                  {deneme.hatalar.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
            {deneme && deneme.ok === true && (
              <div className="rounded-xl border border-success/30 bg-success-soft p-3 text-xs text-success-fg" role="status">
                Kontrol tamam. Yüklenince: <b>{deneme.eklenen}</b> ders saati yazılır, <b>{deneme.kaldirilan}</b> saat boşalır,{' '}
                <b>{deneme.degismeyen}</b> saat aynı kalır{deneme.yeniEslesme ? `, ${deneme.yeniEslesme} yeni ders–öğretmen eşleşmesi eklenir` : ''}.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
