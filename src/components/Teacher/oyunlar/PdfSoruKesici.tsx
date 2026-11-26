// ============================================================================
// Aşama 393 + 407: Oyunlar — kitaptan (PDF / sayfa resmi) soru ekleme
// Kitap tarayıcıda açılır, sunucuya yüklenmez. 300 MB'lık taranmış kitap bile parça parça okunur (yalnız bakılan
// sayfalar belleğe girer). Öğretmen soruları çerçeveler ya da "Soruları bul" ile yapay zekâ kutuları önerir; her kutu
// kesilip görselli soru taslağı olur, yazısı arka planda okunur. Doğru şık tek dokunuşla seçilir ya da kitabın cevap
// anahtarı sayfasından doldurulur (yapay zekâ yalnız sayfada YAZANI aktarır, soru çözmez). Ders, sınıf, kazanım ve
// son sayfa bu kitap için cihazda hatırlanır. "Ekle" görselleri yükler ve soruları toplu kaydeder.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, ChevronLeft, ChevronRight, FileUp, KeyRound, ScanSearch, SquarePlus, X } from 'lucide-react';
import { Modal, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { FieldLabel, SelectBox } from '../FormParts';
import { KazanimDurumu, KazanimSecici, dersKazanimlari, useKazanimBankasi } from './KazanimSecici';
import { bankGradeOf, bankSubjectKey } from '../../../lib/deneme/kazanimBank';
import { openKitapcik, type Kitapcik } from '../../../lib/deneme/kitapcik';
import { gorselAiResmi, gorselHazirla, type KesimKutusu } from '../../../lib/oyunGorsel';
import {
  anahtarUygula,
  eklenenOku,
  eklenenYaz,
  kitapAnahtari,
  kitapOku,
  kitapYaz,
  kutuCevir,
  okumaSirasi,
  siklarDuzelt,
  yedekMetin,
  yeniKutular,
} from '../../../lib/oyunKitap';
import { aiCall, aiOyunAnahtarOku, aiOyunGorselOku, aiOyunSoruKutu, aiStatus, newAiState, type AiAnahtarTesti, type AiCallState, type AiSoruKutusu } from '../../../lib/aiApi';
import { TOPLU_EN_COK, ZORLUKLAR, topluEkleOyunSorulari, yukleOyunGorsel, type OyunZorluk } from '../../../services/oyunService';
import { basariBildir } from '../../../lib/bildirim';
import { OYUN_DERSLERI, OYUN_SINIFLARI, varsayilanDers } from './ortak';
import { SayfaSeridi } from './kitap/SayfaSeridi';
import { SayfaKutulari } from './kitap/SayfaKutulari';
import { TaslakListesi, taslakEtiketi, type Taslak } from './kitap/TaslakListesi';

/** ekrandaki sayfa resmi genişliği (kesilen parça bundan küçültülür; okunaklı kalsın diye geniş) */
const SAYFA_GENIS = 1600;
/** yapay zekâya giden sayfa resmi (sunucu sınırı 3,3 MB) */
const AI_SAYFA_GENIS = 1280;
/** bellekte tutulan sayfa resmi sayısı (300 sayfalık kitapta bellek dolmasın) */
const SAYFA_BELLEK = 12;
/** kutu kenarına küçük pay: yapay zekâ kutusu sıkı çizebilir */
const KUTU_PAY = 0.008;

const payEkle = (k: KesimKutusu): KesimKutusu => {
  const x = Math.max(0, k.x - KUTU_PAY);
  const y = Math.max(0, k.y - KUTU_PAY);
  return { x, y, w: Math.min(1 - x, k.w + 2 * KUTU_PAY), h: Math.min(1 - y, k.h + 2 * KUTU_PAY) };
};

export const PdfSoruKesici: React.FC<{
  baslangic?: { ders?: string; sinif?: number | null };
  onClose: () => void;
  /** her kayıttan sonra (liste yenilenir; pencere açık kalır) */
  onEklendi: () => void;
}> = ({ baslangic, onClose, onEklendi }) => {
  const [kitap, setKitap] = useState<Kitapcik | null>(null);
  const [anahtar, setAnahtar] = useState('');
  const [sayfa, setSayfa] = useState(1);
  const [sayfaYazi, setSayfaYazi] = useState('1');
  const [resim, setResim] = useState<string | null>(null);
  const [taslaklar, setTaslaklar] = useState<Taslak[]>([]);
  const [secili, setSecili] = useState<string | null>(null);
  const [durum, setDurum] = useState<string | null>(null);
  const [is, setIs] = useState<'bul' | 'anahtar' | 'kaydet' | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [testler, setTestler] = useState<AiAnahtarTesti[] | null>(null);
  const [test, setTest] = useState(0);
  const [eklenen, setEklenen] = useState(0);
  const [kapatSor, setKapatSor] = useState(false);
  // soru bilgileri (bütün taslaklara)
  const [ders, setDers] = useState(baslangic?.ders || varsayilanDers());
  const [sinif, setSinif] = useState<number | null>(baslangic?.sinif ?? null);
  const [zorluk, setZorluk] = useState<OyunZorluk>('orta');
  const [konu, setKonu] = useState('');
  const [kod, setKod] = useState<string | null>(null);
  // Aşama 407: bu kitaptan daha önce eklenen soruların kutuları (sayfada yeşil görünür, "Soruları bul" onları atlar)
  const [eklenmis, setEklenmis] = useState<Map<number, KesimKutusu[]>>(() => new Map());
  const [ayarAcik, setAyarAcik] = useState(false);
  const { bank, hata: bankHata } = useKazanimBankasi();

  const dosyaRef = useRef<HTMLInputElement>(null);
  const sayfaKapRef = useRef<HTMLDivElement>(null);
  const onbellek = useRef(new Map<number, string>());
  const sayac = useRef(0);
  const kapali = useRef(false);
  const ai = useRef<{ st: AiCallState | null; yok: boolean } | null>(null);
  const okunuyor = useRef(false);

  useEffect(
    () => () => {
      kapali.current = true;
    },
    []
  );
  useEffect(() => () => kitap?.destroy(), [kitap]);

  // ---------------------------------------------------------------- yapay zekâ durumu (bir kez sorulur)
  const aiHazirla = useCallback(async () => {
    if (ai.current) return ai.current;
    const st = await aiStatus().catch(() => ({ ok: false, gemini: false, mistral: false }) as { ok: boolean; gemini?: boolean; mistral?: boolean });
    const var_ = !!st.ok && (!!st.gemini || !!st.mistral);
    ai.current = { st: var_ ? newAiState(!st.gemini && st.mistral ? 'mistral' : 'gemini', true, { gemini: !!st.gemini, mistral: !!st.mistral }) : null, yok: !var_ };
    return ai.current;
  }, []);

  // ---------------------------------------------------------------- dosya
  const dosyaSec = async (file: File | undefined) => {
    if (!file) return;
    if (taslaklar.length) return setHata(`Önce bu kitaptaki ${taslaklar.length} soruyu ekleyin ya da kaldırın.`);
    setHata(null);
    setBilgi(null);
    setDurum(file.size > 50 * 1024 * 1024 ? `Kitap açılıyor (${Math.round(file.size / 1048576)} MB)…` : 'Dosya açılıyor…');
    try {
      const k = await openKitapcik([file]);
      const a = kitapAnahtari(file.name, file.size);
      const h = kitapOku(a);
      onbellek.current = new Map();
      setTestler(null);
      setResim(null);
      setSecili(null);
      const s = Math.max(1, Math.min(k.pageCount, Number(h?.sayfa) || 1));
      setSayfa(s);
      setSayfaYazi(String(s));
      setEklenmis(eklenenOku(h?.eklenen));
      if (h) {
        if (h.ders) setDers(h.ders);
        if (h.sinif !== undefined) setSinif(h.sinif ?? null);
        if (h.zorluk && ZORLUKLAR.some((z) => z.value === h.zorluk)) setZorluk(h.zorluk as OyunZorluk);
        setKonu(h.konu || '');
        setKod(h.kod || null);
        if (s > 1) setBilgi(`Kaldığınız yerden açıldı: sayfa ${s}.`);
      }
      setAnahtar(a);
      setKitap(k);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Dosya açılamadı.');
    } finally {
      setDurum(null);
    }
  };

  // kitap ayarları ve son sayfa cihazda hatırlanır
  useEffect(() => {
    if (anahtar) kitapYaz(anahtar, { sayfa, ders, sinif, zorluk, konu, kod, eklenen: eklenenYaz(eklenmis) });
  }, [anahtar, sayfa, ders, sinif, zorluk, konu, kod, eklenmis]);

  // ---------------------------------------------------------------- sayfa resmi (bellekte en çok SAYFA_BELLEK sayfa)
  useEffect(() => {
    if (!kitap) return;
    let canli = true;
    const hazir = onbellek.current.get(sayfa);
    if (hazir) {
      setResim(hazir);
      return;
    }
    setResim(null);
    setDurum('Sayfa hazırlanıyor…');
    void kitap
      .render(sayfa, SAYFA_GENIS, 0.92, 8_000_000)
      .then((r) => {
        const b = onbellek.current;
        b.set(sayfa, r.dataUrl);
        while (b.size > SAYFA_BELLEK) b.delete(b.keys().next().value as number);
        if (canli) setResim(r.dataUrl);
      })
      .catch((e) => canli && setHata(e instanceof Error ? e.message : 'Sayfa açılamadı.'))
      .finally(() => canli && setDurum(null));
    return () => {
      canli = false;
    };
  }, [kitap, sayfa]);

  const git = useCallback(
    (n: number) => {
      if (!kitap) return;
      const s = Math.max(1, Math.min(kitap.pageCount, Math.round(n) || 1));
      setSayfa(s);
      setSayfaYazi(String(s));
      setSecili(null);
    },
    [kitap]
  );

  // ← → ile sayfa değişir (yazı alanında değil)
  useEffect(() => {
    if (!kitap) return;
    const tus = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[role=radiogroup]')) return;
      if (e.key === 'ArrowLeft') git(sayfa - 1);
      if (e.key === 'ArrowRight') git(sayfa + 1);
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [kitap, sayfa, git]);

  // ---------------------------------------------------------------- taslak: kes, sonra yazısını sırayla oku
  const guncelle = (id: string, f: (t: Taslak) => Partial<Taslak>) => setTaslaklar((l) => l.map((t) => (t.id === id ? { ...t, ...f(t) } : t)));

  const kes = async (id: string, kaynak: string, kutu: KesimKutusu, surum: number) => {
    try {
      const g = await gorselHazirla(kaynak, kutu);
      setTaslaklar((l) => l.map((t) => (t.id === id && t.surum === surum ? { ...t, gorsel: g, okuma: 'bekliyor' } : t)));
    } catch (e) {
      setTaslaklar((l) => l.filter((t) => t.id !== id));
      setHata(e instanceof Error ? e.message : 'Kesilemedi.');
    }
  };

  const ekleKutular = (gelen: Array<{ kutu: KesimKutusu; no: number | null }>) => {
    if (!resim) return [];
    const yeni: Taslak[] = gelen.map((g) => ({
      id: `t${++sayac.current}`,
      sayfa,
      kutu: g.kutu,
      gorsel: null,
      no: g.no,
      metin: '',
      siklar: [],
      dogru: null,
      okuma: 'bekliyor',
      surum: 0,
    }));
    setTaslaklar((l) => [...l, ...yeni]);
    for (const t of yeni) void kes(t.id, resim, t.kutu, 0);
    return yeni;
  };

  // dokunmatik ekranda yeni kutu: görünen bölgenin ortasına gelir, öğretmen taşıyıp boyutlar
  const kutuEkle = () => {
    const el = sayfaKapRef.current;
    const ust = el && el.scrollHeight > 0 ? el.scrollTop / el.scrollHeight : 0;
    const boy = el && el.scrollHeight > 0 ? Math.min(0.3, (el.clientHeight / el.scrollHeight) * 0.6) : 0.25;
    const [t] = ekleKutular([{ kutu: { x: 0.08, y: Math.min(1 - boy, ust + 0.04), w: 0.42, h: Math.max(0.08, boy) }, no: null }]);
    if (t) setSecili(t.id);
  };

  const kutuDegisti = (id: string, kutu: KesimKutusu) => {
    if (!resim) return;
    const surum = ++sayac.current; // her değişiklikte yeni sürüm: eski kesme / okuma sonucu yazılmaz
    setTaslaklar((l) => l.map((t) => (t.id === id ? { ...t, kutu, surum, gorsel: null, metin: '', siklar: [], okuma: 'bekliyor' } : t)));
    void kes(id, resim, kutu, surum);
  };

  // okuma kuyruğu: aynı anda tek istek (ücretsiz kota için); kutusu değişen taslağın eski sonucu yazılmaz
  useEffect(() => {
    if (okunuyor.current) return;
    const t = taslaklar.find((x) => x.okuma === 'bekliyor' && x.gorsel);
    if (!t) return;
    okunuyor.current = true;
    const { id, surum, gorsel } = t;
    guncelle(id, () => ({ okuma: 'okuyor' }));
    void (async () => {
      let sonuc: Partial<Taslak> = { okuma: 'olmadi' };
      try {
        const a = await aiHazirla();
        if (a.st && !kapali.current) {
          const r = await aiCall(a.st, (p) => aiOyunGorselOku({ provider: p, image: gorselAiResmi(gorsel!) }), { stop: () => kapali.current });
          if (r.ok && r.item) sonuc = { okuma: 'bitti', metin: r.item.metin || '', siklar: r.item.siklar || [], ...(r.item.no ? { no: r.item.no } : {}) };
        }
      } catch {
        /* okunamadı: görsel olduğu gibi eklenir */
      }
      if (kapali.current) return;
      setTaslaklar((l) => l.map((x) => (x.id === id && x.surum === surum ? { ...x, ...sonuc, no: x.no ?? (sonuc.no as number | undefined) ?? null } : x)));
      okunuyor.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taslaklar]);

  // ---------------------------------------------------------------- yapay zekâ: sayfadaki soruları bul
  const sorulariBul = async () => {
    if (!kitap || !resim) return;
    setHata(null);
    setBilgi(null);
    setIs('bul');
    try {
      const a = await aiHazirla();
      if (!a.st) return setHata('Yapay zekâ bu sunucuda kurulu değil. Soruları sayfada sürükleyerek çerçeveleyin.');
      const img = await kitap.render(sayfa, AI_SAYFA_GENIS, 0.8, 1_600_000);
      const r = await aiCall(a.st, (p) => aiOyunSoruKutu({ provider: p, image: { mime: 'image/jpeg', data: img.data } }), { stop: () => kapali.current, onWait: setDurum });
      if (kapali.current) return;
      if (!r.ok) return setHata(r.error || 'Sorular bulunamadı. Biraz sonra tekrar deneyin ya da elle çerçeveleyin.');
      const gelen = ((r.items || []) as AiSoruKutusu[])
        .map((x) => ({ kutu: kutuCevir(x.kutu), no: x.no || null }))
        .filter((x): x is { kutu: KesimKutusu; no: number | null } => !!x.kutu)
        .map((x) => ({ ...x, kutu: payEkle(x.kutu) }));
      const mevcut = [...taslaklar.filter((t) => t.sayfa === sayfa).map((t) => t.kutu), ...(eklenmis.get(sayfa) || [])];
      const kabul = okumaSirasi(yeniKutular(mevcut, gelen));
      if (!gelen.length) setBilgi('Bu sayfada çoktan seçmeli soru bulunamadı. Gerekirse elle çerçeveleyin.');
      else if (!kabul.length) setBilgi('Bu sayfadaki sorular zaten işaretli ya da daha önce eklendi.');
      else {
        ekleKutular(kabul);
        setBilgi(`${kabul.length} soru bulundu. Kutuları kontrol edin; gerekirse taşıyın ya da boyutlayın.`);
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Sorular bulunamadı.');
    } finally {
      setIs(null);
      setDurum(null);
    }
  };

  // ---------------------------------------------------------------- yapay zekâ: cevap anahtarı sayfasını oku
  const anahtarOku = async () => {
    if (!kitap) return;
    setHata(null);
    setBilgi(null);
    setIs('anahtar');
    try {
      const a = await aiHazirla();
      if (!a.st) return setHata('Yapay zekâ bu sunucuda kurulu değil. Doğru şıkları listeden seçin.');
      const img = await kitap.render(sayfa, AI_SAYFA_GENIS, 0.85, 1_600_000);
      const r = await aiCall(a.st, (p) => aiOyunAnahtarOku({ provider: p, image: { mime: 'image/jpeg', data: img.data } }), { stop: () => kapali.current, onWait: setDurum });
      if (kapali.current) return;
      if (!r.ok) return setHata(r.error || 'Cevap anahtarı okunamadı.');
      const l = (r.items || []) as AiAnahtarTesti[];
      if (!l.length) return setHata(`Sayfa ${sayfa} cevap anahtarı gibi görünmüyor. Kitabın cevap anahtarı sayfasını açıp tekrar deneyin.`);
      setTestler(l);
      setTest(0);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Cevap anahtarı okunamadı.');
    } finally {
      setIs(null);
      setDurum(null);
    }
  };

  const anahtariUygula = () => {
    const t = testler?.[test];
    if (!t) return;
    const { liste, uygulanan } = anahtarUygula(taslaklar, t.cevaplar);
    setTaslaklar(liste);
    setBilgi(uygulanan ? `${t.ad}: ${uygulanan} sorunun doğru şıkkı dolduruldu. Kontrol edin.` : `${t.ad}: numarası eşleşen, şıkkı boş soru yok.`);
  };

  // ---------------------------------------------------------------- kaydet
  const eksik = taslaklar.filter((t) => t.dogru === null).length;
  const hazirlaniyor = taslaklar.some((t) => !t.gorsel);

  const ekle = async () => {
    if (!taslaklar.length || !kitap) return;
    if (!ders) {
      setAyarAcik(true);
      return setHata('Dersi seçin.');
    }
    if (eksik) return setHata(`${eksik} sorunun doğru şıkkı seçilmedi. Seçin, cevap anahtarından doldurun ya da soruyu kaldırın.`);
    if (hazirlaniyor) return setHata('Kesilen görseller hazırlanıyor, birkaç saniye bekleyin.');
    setHata(null);
    setBilgi(null);
    setIs('kaydet');
    let toplam = 0;
    try {
      const sira = [...taslaklar];
      for (let i = 0; i < sira.length; i += TOPLU_EN_COK) {
        const parca = sira.slice(i, i + TOPLU_EN_COK);
        const girdiler = [];
        for (const [j, t] of parca.entries()) {
          setDurum(`Görseller yükleniyor… ${i + j + 1} / ${sira.length}`);
          const gorselId = await yukleOyunGorsel(t.gorsel!);
          girdiler.push({
            tur: 'coktan' as const,
            sinif,
            ders,
            konu: konu.trim(),
            kazanimKodu: kod,
            zorluk,
            metin: t.metin.trim().length >= 3 ? t.metin.trim() : yedekMetin(kitap.name, t.sayfa, t.no),
            siklar: siklarDuzelt(t.siklar),
            dogru: t.dogru!,
            cevap: '',
            aciklama: '',
            gorselId,
          });
        }
        setDurum('Sorular kaydediliyor…');
        toplam += await topluEkleOyunSorulari(girdiler);
        const bitenler = new Set(parca.map((t) => t.id));
        setTaslaklar((l) => l.filter((t) => !bitenler.has(t.id)));
        setEklenmis((m) => {
          const y = new Map(m);
          for (const t of parca) y.set(t.sayfa, [...(y.get(t.sayfa) || []), t.kutu]);
          return y;
        });
      }
      setEklenen((n) => n + toplam);
      setSecili(null);
      basariBildir(`${toplam} soru eklendi`);
      onEklendi();
    } catch (e) {
      if (toplam) {
        setEklenen((n) => n + toplam);
        onEklendi();
      }
      setHata(`${toplam ? `${toplam} soru eklendi; kalanlar eklenemedi. ` : ''}${e instanceof Error ? e.message : 'Sorular eklenemedi.'}`);
    } finally {
      setIs(null);
      setDurum(null);
    }
  };

  const kapat = () => {
    if (taslaklar.length && !kapatSor) return setKapatSor(true);
    onClose();
  };

  // ---------------------------------------------------------------- görünüm hesapları
  const sayilar = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of taslaklar) m.set(t.sayfa, (m.get(t.sayfa) || 0) + 1);
    return m;
  }, [taslaklar]);
  const sayfaKutulari = useMemo(
    () => taslaklar.map((t, i) => ({ t, i })).filter((x) => x.t.sayfa === sayfa).map(({ t, i }) => ({ id: t.id, kutu: t.kutu, etiket: taslakEtiketi(t, i) })),
    [taslaklar, sayfa]
  );
  const dersVar = !!bankSubjectKey(ders);
  const adaylar = useMemo(() => (bank && dersVar ? dersKazanimlari(bank, ders, sinif) : []), [bank, ders, dersVar, sinif]);
  const kazanim = kod && bank ? bank.find((r) => r.code === kod) || null : null;
  const ozet = [ders || 'Ders seçilmedi', sinif ? `${sinif}. sınıf` : 'Tüm sınıflar', ZORLUKLAR.find((z) => z.value === zorluk)?.label, kazanim ? kazanim.code : konu.trim() || null]
    .filter(Boolean)
    .join(' · ');
  const mesgul = !!is || !!durum;

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

  const mesaj = (hata || bilgi) && (
    <p
      role={hata ? 'alert' : 'status'}
      className={cx('flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold', !kitap && 'mt-3', hata ? 'bg-danger-soft text-danger-fg' : 'bg-brand-soft text-brand-fg')}
    >
      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{hata || bilgi}</span>
      <button type="button" className="ui-chip-x" aria-label="Kapat" onClick={() => (hata ? setHata(null) : setBilgi(null))}>
        <X className="w-3 h-3" />
      </button>
    </p>
  );

  const footer = kapatSor ? (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold text-warning-fg">Eklenmemiş {taslaklar.length} soru silinecek.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setKapatSor(false)}>
          Vazgeç
        </Button>
        <Button variant="danger-soft" onClick={onClose}>
          Sil ve kapat
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted" role="status">
        {durum ||
          (taslaklar.length
            ? eksik
              ? `${eksik} soruda doğru şık seçilmedi`
              : `${taslaklar.length} soru eklenmeye hazır`
            : eklenen
              ? `Bu kitaptan ${eklenen} soru eklendi`
              : kitap
                ? 'Soruyu çerçevelemek için sayfada sürükleyin'
                : '')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={kapat} disabled={is === 'kaydet'}>
          {eklenen > 0 && !taslaklar.length ? 'Bitti' : 'Kapat'}
        </Button>
        {kitap && (
          <Button onClick={() => void ekle()} isLoading={is === 'kaydet'} loadingText="Ekleniyor…" disabled={!taslaklar.length || mesgul}>
            {taslaklar.length ? `${taslaklar.length} soruyu ekle` : 'Soruları ekle'}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal open onClose={kapat} size="full" yukseklik={kitap ? 'tam' : 'icerik'} icon={BookOpen} title="Kitaptan soru" description={kitap ? kitap.name : 'Test kitabı ya da sayfa resmi; dosya hiçbir yere yüklenmez.'} footer={footer}>
      <input ref={dosyaRef} type="file" accept=".pdf,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => void dosyaSec(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      {!kitap ? (
        <button
          type="button"
          onClick={() => dosyaRef.current?.click()}
          disabled={!!durum}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-12 text-center transition-colors hover:bg-surface"
        >
          <FileUp className="h-7 w-7 text-muted" aria-hidden />
          <span className="text-sm font-semibold text-fg">{durum || 'Kitap PDF’i ya da sayfa resmi seçin'}</span>
          <span className="text-xs text-muted">Taranmış test kitabı (300 MB’a kadar), çalışma kâğıdı ya da sayfa fotoğrafı</span>
        </button>
      ) : (
        <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_21rem]">
          {/* ---------------------------------------------------- sol: sayfa */}
          <section className="flex min-w-0 flex-col gap-2.5 lg:min-h-0" aria-label="Kitap sayfası">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" ikon aria-label="Önceki sayfa" disabled={sayfa <= 1} onClick={() => git(sayfa - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <label className="flex items-center gap-1 text-xs font-semibold tabular-nums text-fg">
                  <span className="sr-only">Sayfa numarası</span>
                  <input
                    value={sayfaYazi}
                    inputMode="numeric"
                    onChange={(e) => setSayfaYazi(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    onBlur={() => git(Number(sayfaYazi))}
                    onKeyDown={(e) => e.key === 'Enter' && git(Number(sayfaYazi))}
                    className="ui-field w-14 text-center tabular-nums"
                    aria-label="Sayfaya git"
                  />
                  <span className="text-muted">/ {kitap.pageCount}</span>
                </label>
                <Button variant="secondary" size="sm" ikon aria-label="Sonraki sayfa" disabled={sayfa >= kitap.pageCount} onClick={() => git(sayfa + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap sm:items-center pointer-fine:grid-cols-3 sm:pointer-fine:flex">
                <Button variant="secondary" size="sm" genislik="orta" className="hidden pointer-coarse:inline-flex" leftIcon={<SquarePlus className="w-3.5 h-3.5" />} onClick={kutuEkle} disabled={!resim || mesgul}>
                  Kutu ekle
                </Button>
                <Button variant="secondary" size="sm" genislik="orta" leftIcon={<ScanSearch className="w-3.5 h-3.5" />} onClick={() => void sorulariBul()} isLoading={is === 'bul'} loadingText="Aranıyor…" disabled={!resim || mesgul}>
                  Soruları bul
                </Button>
                <Button variant="secondary" size="sm" genislik="orta" leftIcon={<KeyRound className="w-3.5 h-3.5" />} onClick={() => void anahtarOku()} isLoading={is === 'anahtar'} loadingText="Okunuyor…" disabled={!resim || mesgul}>
                  Cevap anahtarı
                </Button>
                <Button variant="secondary" size="sm" genislik="orta" onClick={() => dosyaRef.current?.click()} disabled={mesgul}>
                  Başka kitap
                </Button>
              </div>
            </div>

            {mesaj}

            {kitap.pageCount > 1 && <SayfaSeridi kitap={kitap} sayfa={sayfa} sayilar={sayilar} eklenen={eklenmis} onSec={git} />}

            <div ref={sayfaKapRef} className="max-h-[60dvh] min-h-72 overflow-auto rounded-xl border border-line bg-surface-2 lg:max-h-none lg:flex-1">
              {resim ? (
                <SayfaKutulari
                  resim={resim}
                  sayfa={sayfa}
                  kutular={sayfaKutulari}
                  eklenen={eklenmis.get(sayfa) || []}
                  secili={secili}
                  onSec={(id) => {
                    setSecili(id);
                    if (id) document.getElementById(`taslak-${id}`)?.scrollIntoView({ block: 'nearest' });
                  }}
                  onYeni={(k) => {
                    const [t] = ekleKutular([{ kutu: k, no: null }]);
                    if (t) setSecili(t.id);
                  }}
                  onDegisti={kutuDegisti}
                  onSil={(id) => setTaslaklar((l) => l.filter((t) => t.id !== id))}
                />
              ) : (
                <div className="flex h-72 items-center justify-center text-xs text-muted">{durum || ''}</div>
              )}
            </div>
          </section>

          {/* ---------------------------------------------------- sağ: soru bilgileri + eklenecek sorular */}
          <aside className="flex min-w-0 flex-col gap-3 lg:min-h-0" aria-label="Eklenecek sorular">
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <b className="block text-2xs font-bold uppercase tracking-wider text-brand-fg">Soru bilgileri</b>
                  {!ayarAcik && (
                    <span className="block truncate text-xs text-fg-2" title={ozet}>
                      {ozet}
                    </span>
                  )}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setAyarAcik((v) => !v)} aria-expanded={ayarAcik}>
                  {ayarAcik ? 'Tamam' : 'Değiştir'}
                </Button>
              </div>
              {ayarAcik && (
                <div className="mt-2.5 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <FieldLabel htmlFor="ks-ders">Ders</FieldLabel>
                      <SelectBox id="ks-ders" value={ders} onChange={(e) => {
                          setDers(e.target.value);
                          setKod(null);
                        }} className="ui-field w-full cursor-pointer">
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
                      <FieldLabel htmlFor="ks-sinif" optional>
                        Sınıf
                      </FieldLabel>
                      <SelectBox id="ks-sinif" value={sinif === null ? '' : String(sinif)} onChange={(e) => setSinif(e.target.value ? Number(e.target.value) : null)} className="ui-field w-full cursor-pointer">
                        <option value="">Tümü</option>
                        {OYUN_SINIFLARI.map((n) => (
                          <option key={n} value={n}>
                            {n}. sınıf
                          </option>
                        ))}
                      </SelectBox>
                    </div>
                    <div>
                      <FieldLabel htmlFor="ks-zorluk">Zorluk</FieldLabel>
                      <SelectBox id="ks-zorluk" value={zorluk} onChange={(e) => setZorluk(e.target.value as OyunZorluk)} className="ui-field w-full cursor-pointer">
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
                    {kazanim && (
                      <div className="mb-2 flex items-start gap-2 rounded-lg bg-brand-soft px-2.5 py-1.5 text-xs text-brand-fg">
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{kazanim.code}</span> · {kazanim.text}
                        </span>
                        <button type="button" className="ui-chip-x" aria-label="Kazanımı kaldır" onClick={() => setKod(null)}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {!ders ? (
                      <p className="text-xs text-muted">Önce dersi seçin.</p>
                    ) : !dersVar ? (
                      <p className="text-xs text-muted">Bu ders için kazanım bankası yok.</p>
                    ) : !bank ? (
                      <KazanimDurumu hata={bankHata} />
                    ) : (
                      <KazanimSecici satirlar={adaylar} secili={kod ? [kod] : []} onChange={kazanimSec} enCok={1} />
                    )}
                  </div>
                  <div>
                    <FieldLabel htmlFor="ks-konu" optional>
                      Konu
                    </FieldLabel>
                    <input id="ks-konu" value={konu} maxLength={300} onChange={(e) => setKonu(e.target.value)} className="ui-field w-full" placeholder="Örn. Güneş'in yapısı" />
                  </div>
                </div>
              )}
            </div>

            {testler && (
              <div className="rounded-xl border border-line bg-surface p-3" id="kitap-anahtar">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-2xs font-bold uppercase tracking-wider text-brand-fg">Cevap anahtarı · sayfa okundu</b>
                  <button type="button" className="ui-chip-x" aria-label="Cevap anahtarını kapat" onClick={() => setTestler(null)}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <SelectBox aria-label="Test" value={String(test)} onChange={(e) => setTest(Number(e.target.value))} className="ui-field min-w-0 flex-1 cursor-pointer">
                    {testler.map((t, i) => (
                      <option key={i} value={i}>
                        {t.ad} ({t.cevaplar.length})
                      </option>
                    ))}
                  </SelectBox>
                  <Button size="sm" onClick={anahtariUygula} disabled={!taslaklar.length}>
                    Uygula
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">Eklenecek sorular</h3>
              <span className="text-xs tabular-nums text-subtle">{taslaklar.length}</span>
            </div>
            <div className="min-h-0 lg:flex-1 lg:overflow-y-auto">
              {taslaklar.length ? (
                <TaslakListesi
                  taslaklar={taslaklar}
                  secili={secili}
                  onAc={(t) => {
                    if (t.sayfa !== sayfa) git(t.sayfa);
                    setSecili(t.id);
                  }}
                  onDogru={(id, i) => guncelle(id, () => ({ dogru: i }))}
                  onSil={(id) => setTaslaklar((l) => l.filter((t) => t.id !== id))}
                />
              ) : (
                <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs leading-relaxed text-muted">
                  “Soruları bul” ile sayfadaki soruları işaretleyin ya da soruyu sayfada sürükleyerek çerçeveleyin.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}

      {!kitap && mesaj}
    </Modal>
  );
};
