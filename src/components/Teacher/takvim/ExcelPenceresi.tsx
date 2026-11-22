// Akademik takvim › Excel'den yükleme penceresi (Aşama 364: AkademikTakvim.tsx'ten ayrı parça, yalnız açılınca yüklenir)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Modal, Segmented, cx } from '../../ui/kit';
import { appConfirm } from '../../../lib/appDialog';
import {
  baslik,
  buyuk,
  satirAnahtari,
  siniflarYazi,
  takvimYukle,
  yilAdi,
  zumreAdi,
  type AktKayit,
  type AktSatir,
  type YuklemeSonucu,
} from '../../../services/akademikTakvimService';
import { takvimExcelOku, takvimSablonIndir, type OkunanSatir } from '../../../lib/akademikTakvimExcel';
import { BTN, DtKutu } from './ortak';

// ---------------------------------------------------------------------------- Excel'den yükleme
export const ExcelPenceresi: React.FC<{
  acik: boolean;
  yil: number;
  kayitlar: AktKayit[];
  onClose: () => void;
  onYazildi: () => Promise<void>; // Aşama 329: yazınca takvim yeniden okunur, pencere sonucu gösterir
}> = ({ acik, yil, kayitlar, onClose, onYazildi }) => {
  const [dosyaAd, setDosyaAd] = useState('');
  const [sonuc, setSonuc] = useState<{ satirlar: OkunanSatir[]; durum: YuklemeSonucu[]; silinen: number; mod: 'ekle' | 'degistir' } | null>(null);
  const [sayfa, setSayfa] = useState(0);
  const [satirlar, setSatirlar] = useState<OkunanSatir[] | null>(null);
  const [mod, setMod] = useState<'ekle' | 'degistir'>('ekle');
  const [mesgul, setMesgul] = useState<'' | 'oku' | 'yaz'>('');
  const [hata, setHata] = useState<string | null>(null);
  const [surukle, setSurukle] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!acik) return;
    setDosyaAd('');
    setSatirlar(null);
    setSonuc(null);
    setMod('ekle');
    setHata(null);
    setMesgul('');
  }, [acik]);

  const oku = async (f?: File | null) => {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) return setHata('Lütfen .xlsx uzantılı Excel dosyası seçin.');
    setMesgul('oku');
    setHata(null);
    try {
      const r = await takvimExcelOku(f, yil);
      if (!r.sayfaSayisi) throw new Error('Ay adlı sayfa bulunamadı (EYLÜL … HAZİRAN).');
      setDosyaAd(f.name);
      setSayfa(r.sayfaSayisi);
      setSatirlar(r.satirlar);
      setSonuc(null);
    } catch (e: any) {
      setHata(e?.message || 'Dosya okunamadı.');
    } finally {
      setMesgul('');
      if (input.current) input.current.value = '';
    }
  };

  // Aşama 329: dosyadaki her satır takvimle karşılaştırılır: yeni | güncellenecek (bilgisi farklı) | aynı | hatalı
  const mevcut = useMemo(() => new Map(kayitlar.map((k) => [satirAnahtari(k), k])), [kayitlar]);
  const durumOf = useCallback(
    (s: OkunanSatir): 'hatali' | 'yeni' | 'guncel' | 'ayni' => {
      if (s.durum === 'hatali') return 'hatali';
      const k = mevcut.get(satirAnahtari({ tarih: s.tarih!, ad: s.ad!, sinif: s.sinif || '' }));
      if (!k) return 'yeni';
      const z = zumreAdi(s.zumre, s.birim);
      const esit =
        (k.bitis || '') === (s.bitis || '') && k.ayIcinde === !!s.ayIcinde && buyuk(k.birim) === buyuk(s.birim) && buyuk(k.zumre) === z &&
        k.kapsam === (s.kapsam || 'ogrenci') && k.yer === (s.yer || 'ic') && k.salon === !!s.salon;
      return esit ? 'ayni' : 'guncel';
    },
    [mevcut]
  );
  const hesap = useMemo(() => {
    const l = satirlar || [];
    const say = { hatali: 0, yeni: 0, guncel: 0, ayni: 0 };
    l.forEach((s) => say[durumOf(s)]++);
    return { l, gecerli: l.filter((s) => s.durum !== 'hatali'), say, duzeltilen: l.filter((s) => s.durum === 'duzeltildi').length };
  }, [satirlar, durumOf]);
  const yazilacakSay = mod === 'ekle' ? hesap.say.yeni + hesap.say.guncel : hesap.gecerli.length;

  const kaydet = async () => {
    if (!yazilacakSay || mesgul) return;
    if (mod === 'degistir') {
      const ok = await appConfirm({
        title: 'Takvim baştan yazılsın mı?',
        message: `${yilAdi(yil)} takvimindeki ${kayitlar.length} kayıt silinip dosyadaki ${hesap.gecerli.length} satır yazılacak. Elle eklenen etkinlikler de silinir.`,
        confirmText: 'Baştan yaz',
        danger: true,
      });
      if (!ok) return;
    }
    setMesgul('yaz');
    setHata(null);
    try {
      const gonder = hesap.gecerli;
      const veri: AktSatir[] = gonder.map((s) => ({
        tarih: s.tarih!, bitis: s.bitis || '', ayIcinde: !!s.ayIcinde, ad: s.ad!, sinif: s.sinif || '', birim: s.birim || '', zumre: s.zumre || '',
        kapsam: s.kapsam || 'ogrenci', yer: s.yer || 'ic', salon: !!s.salon, kontrol: !!s.kontrol,
      }));
      const r = await takvimYukle(mod, yil, veri);
      // 329 kurulu değilse satır sonucu gelmez: önizlemedeki tahmin kullanılır
      const durum: YuklemeSonucu[] = r.sonuclar.length === gonder.length ? r.sonuclar : gonder.map((s) => (mod === 'degistir' ? 'yeni' : (durumOf(s) as YuklemeSonucu)));
      await onYazildi();
      setSonuc({ satirlar: gonder, durum, silinen: r.silinen, mod });
    } catch (e: any) {
      setHata(e?.message || 'Yüklenemedi.');
    } finally {
      setMesgul('');
    }
  };

  // Yazıldıktan sonra: dosyadaki satırların takvimde gerçekten olduğu (yeniden okunan kayıtlarla) doğrulanır
  const dogrulama = useMemo(() => {
    if (!sonuc) return null;
    const yazilan = sonuc.satirlar.filter((_, i) => sonuc.durum[i] === 'yeni' || sonuc.durum[i] === 'guncel' || sonuc.durum[i] === 'ayni');
    const bulunan = yazilan.filter((s) => mevcut.has(satirAnahtari({ tarih: s.tarih!, ad: s.ad!, sinif: s.sinif || '' }))).length;
    const say = (d: YuklemeSonucu) => sonuc.durum.filter((x) => x === d).length;
    return { yazilan: yazilan.length, bulunan, yeni: say('yeni'), guncel: say('guncel'), ayni: say('ayni'), yazilamadi: say('yil_disi') + say('bos') };
  }, [sonuc, mevcut]);

  // Önizleme sırası: hatalı → güncellenecek → yeni → aynı; sonuçta: yazılamayan → yeni → güncellenen → aynı
  const ONCE: Record<string, number> = { hatali: 0, yil_disi: 0, bos: 0, guncel: 1, yeni: 2, ayni: 3 };
  const liste = sonuc
    ? sonuc.satirlar.map((s, i) => ({ s, d: sonuc.durum[i] as string }))
    : hesap.l.map((s) => ({ s, d: mod === 'degistir' && s.durum !== 'hatali' ? 'yeni' : (durumOf(s) as string) }));
  const sirali = [...liste].sort((a, b) => ONCE[a.d] - ONCE[b.d] || String(a.s.tarih || '').localeCompare(String(b.s.tarih || '')));
  const ETIKET: Record<string, [string, string]> = sonuc
    ? { yeni: ['ui-chip-success', 'Eklendi'], guncel: ['ui-chip-brand', 'Güncellendi'], ayni: ['ui-chip-neutral', 'Zaten vardı'], yil_disi: ['ui-chip-danger', 'Yıl dışında'], bos: ['ui-chip-danger', 'Yazılamadı'] }
    : { yeni: ['ui-chip-success', mod === 'ekle' ? 'Yeni' : 'Yazılacak'], guncel: ['ui-chip-brand', 'Güncellenecek'], ayni: ['ui-chip-neutral', 'Aynısı var'], hatali: ['ui-chip-danger', 'Hatalı'] };
  // Aşama 329: aynı tarih, ad, kapsam ve yerdeki sınıf satırları takvimdeki gibi TEK etkinlik olarak gösterilir ("5, 6, 7. sınıf")
  type Grup = { key: string; s: OkunanSatir; d: string; siniflar: string[]; satir: number };
  const gruplar: Grup[] = [];
  const gm = new Map<string, Grup>();
  for (const { s: r, d } of sirali) {
    const k = r.tarih ? `${r.tarih}|${r.bitis || ''}|${r.ayIcinde ? 'ay' : ''}|${buyuk(r.ad)}|${r.kapsam}|${r.yer}` : `${r.sayfa}-${r.satirNo}`;
    let g = gm.get(k);
    if (!g) {
      g = { key: k, s: r, d, siniflar: [], satir: 0 };
      gm.set(k, g);
      gruplar.push(g);
    } else if (ONCE[d] < ONCE[g.d]) g.d = d;
    if (r.sinif && !g.siniflar.includes(r.sinif)) g.siniflar.push(r.sinif);
    g.satir++;
  }
  const gs = (...ds: string[]) => gruplar.filter((g) => ds.includes(g.d)).length;
  const yazilacakEtkinlik = mod === 'ekle' ? gs('yeni', 'guncel') : gruplar.length - gs('hatali');
  const kutular: [string, number, string][] = sonuc
    ? [
        ['Eklendi', gs('yeni'), 'text-success-fg'],
        ['Güncellendi', gs('guncel'), 'text-brand-fg'],
        ['Zaten vardı', gs('ayni'), 'text-fg'],
        ['Yazılamadı', gs('yil_disi', 'bos'), 'text-danger-fg'],
      ]
    : [
        ['Yeni', gs('yeni'), 'text-success-fg'],
        ['Güncellenecek', gs('guncel'), 'text-brand-fg'],
        ['Aynısı var', gs('ayni'), 'text-fg'],
        ['Hatalı', gs('hatali'), 'text-danger-fg'],
      ];

  return (
    <Modal
      open={acik}
      onClose={onClose}
      size="lg"
      icon={FileSpreadsheet}
      title="Excel'den takvim yükle"
      description={`${yilAdi(yil)} · her ay ayrı sayfa. Önce okunur ve gösterilir; Kaydet'e basınca yazılır.`}
      id="akt-excel-pencere"
      footer={
        <>
          {sonuc ? (
            <button type="button" id="akt-excel-kapat" className={cx(BTN, 'w-28 ui-btn-primary')} onClick={onClose}>
              Tamam
            </button>
          ) : (
            <>
              <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={onClose} disabled={mesgul === 'yaz'}>
                Vazgeç
              </button>
              <button type="button" id="akt-excel-kaydet" className={cx(BTN, 'min-w-28 px-4 ui-btn-primary')} onClick={() => void kaydet()} disabled={!satirlar || !yazilacakSay || !!mesgul}>
                {mesgul === 'yaz' ? 'Yazılıyor…' : satirlar && yazilacakSay ? `${yazilacakEtkinlik} etkinliği yaz` : 'Kaydet'}
              </button>
            </>
          )}
        </>
      }
    >
      <input ref={input} type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => void oku(e.target.files?.[0])} />
      {!satirlar ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setSurukle(true);
            }}
            onDragLeave={() => setSurukle(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurukle(false);
              void oku(e.dataTransfer.files?.[0]);
            }}
            className={cx(
              'w-full flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors cursor-pointer',
              surukle ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface-2 hover:border-brand hover:bg-brand-soft'
            )}
          >
            <span className="w-12 h-12 rounded-xl bg-surface shadow-card grid place-items-center text-brand-fg mb-1">
              <Upload className="w-5 h-5" />
            </span>
            <b className="text-sm text-fg">{mesgul === 'oku' ? 'Dosya okunuyor…' : 'Excel dosyasını buraya bırakın'}</b>
            <span className="text-xs text-muted">
              ya da <u className="no-underline font-semibold text-brand-fg">bilgisayardan seçin</u> · .xlsx
            </span>
          </button>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-fg-2">Okunan sütunlar</p>
            <div className="flex flex-wrap gap-1.5">
              {['Etkinlik adı', 'Tarih', 'Sınıf', 'Etkinlik kapsamı', 'Okul içi / dışı', 'Konferans salonu', 'Birim', 'Zümre', 'Kontrol'].map((s) => (
                <span key={s} className="ui-chip ui-chip-neutral">
                  {s}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted">Sayfa adları ay adıdır (EYLÜL … HAZİRAN). Boş satırlar atlanır. Yıl yanlış yazılmışsa ay sayfasına göre düzeltilir.</p>
            <button type="button" className="ui-link inline-flex items-center gap-1" onClick={() => void takvimSablonIndir(yil)}>
              <Download className="w-3.5 h-3.5" /> Boş şablonu indir
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="w-9 h-9 rounded-lg bg-success-soft text-success-fg grid place-items-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm text-fg truncate">{dosyaAd}</b>
              <span className="text-xs text-muted">
                {sayfa} ay sayfası · {gruplar.length} etkinlik · {hesap.l.length} sınıf satırı
              </span>
            </div>
            <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={() => input.current?.click()} disabled={!!mesgul}>
              Başka dosya
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" id="akt-excel-ozet">
            {kutular.map(([k, v, c]) => (
              <div key={k} className="rounded-xl bg-surface-2 border border-line px-3 py-2.5">
                <b className={cx('block text-xl font-bold tabular-nums', v ? c : 'text-subtle')}>{v}</b>
                <span className="text-xs font-medium text-muted">{k} etkinlik</span>
              </div>
            ))}
          </div>
          {sonuc && dogrulama ? (
            <p
              role="status"
              className={cx(
                'flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold',
                dogrulama.bulunan === dogrulama.yazilan ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-warning-fg'
              )}
            >
              {dogrulama.bulunan === dogrulama.yazilan ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {dogrulama.bulunan === dogrulama.yazilan
                ? `Takvim yeniden okundu: dosyadaki ${gruplar.length - gs('yil_disi', 'bos')} etkinliğin (${dogrulama.yazilan} sınıf satırı) hepsi takvimde.${sonuc.silinen ? ` (${sonuc.silinen} eski kayıt silindi)` : ''}`
                : `Takvim yeniden okundu: ${dogrulama.yazilan} satırdan ${dogrulama.bulunan} tanesi görünüyor. Sayfayı yenileyip tekrar bakın.`}
            </p>
          ) : (
            <>
              <Segmented
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
                value={mod}
                onChange={setMod}
                items={[
                  { value: 'ekle', label: 'Ekle ve güncelle', id: 'akt-mod-ekle' },
                  { value: 'degistir', label: 'Takvimi baştan yaz', id: 'akt-mod-degistir' },
                ]}
              />
              <p className="text-xs text-muted">
                {mod === 'ekle'
                  ? yazilacakSay
                    ? `Takvimde olmayan ${gs('yeni')} etkinlik eklenir, bilgisi değişen ${gs('guncel')} etkinlik güncellenir; diğer etkinliklere dokunulmaz.`
                    : 'Dosyadaki satırların hepsi takvimde aynen var.'
                  : `${yilAdi(yil)} takvimindeki ${kayitlar.length} kayıt silinir, dosyadaki ${yazilacakEtkinlik} etkinlik yazılır.`}
                {gs('hatali') > 0 && ' Hatalı satırlar yazılmaz.'}
                {hesap.duzeltilen > 0 && ` ${hesap.duzeltilen} satırın yılı ay sayfasına göre düzeltildi.`}
              </p>
            </>
          )}
          <ul className="rounded-xl border border-line divide-y divide-line max-h-[42vh] overflow-y-auto" id="akt-excel-liste">
            {gruplar.map(({ key, s, d, siniflar, satir }) => {
              const [cls, et] = ETIKET[d] || ['ui-chip-neutral', d];
              return (
                <li key={key} className={cx('flex items-center gap-3 px-3 py-2', d === 'ayni' && 'opacity-60')}>
                  {s.tarih ? <DtKutu tarih={s.tarih} bitis={s.bitis} ayIcinde={s.ayIcinde} /> : <span className="w-12 h-12 rounded-xl bg-surface-2 grid place-items-center text-muted shrink-0">?</span>}
                  <span className="min-w-0 flex-1">
                    <b className="block text-xs font-semibold text-fg truncate">{s.ad ? baslik(s.ad) : '(adsız)'}</b>
                    <span className="block text-xs text-muted truncate">
                      {siniflar.length ? siniflarYazi(siniflar) : 'Sınıf yok'}
                      {s.zumre && ` · ${baslik(s.zumre)}`} · {s.sayfa}
                      {satir > 1 ? ` · ${satir} satır` : ` · satır ${s.satirNo}`}
                      {s.not && <span className="text-warning-fg"> · {s.not}</span>}
                    </span>
                  </span>
                  <span className={cx('ui-chip shrink-0 w-28 justify-center', cls)}>{et}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {hata && <p className="mt-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold px-3 py-2.5">{hata}</p>}
    </Modal>
  );
};
export default ExcelPenceresi;
