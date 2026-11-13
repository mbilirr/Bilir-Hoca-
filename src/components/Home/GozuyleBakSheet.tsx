import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ROLE_BY_CODE } from '../../lib/teacherRoles';
import { gozuKisiAra, gozuyleBak, type GozuAday } from '../../lib/kurumGecis';
import { AkSheet, akBasHarf } from './AnaSayfaKabuk';

// ============================================================================
// Aşama 252: KULLANICI GÖZÜYLE BAK (sistem sahibi ana sayfası, sağdan açılan panel)
// Kişi aranır (bütün kurumlar, tek kurum ya da kendi alanı), "Bak" ile sekme o kişinin hesabıyla açılır.
// Altta son bakışlar ve bakış sırasında yapılan işlem sayısı (kullanici_gozu_oturumlari, sql/252) görünür.
// ============================================================================

// Görev sırası: en üst görev gösterilir
const ROL_SIRA = ['mudur', 'mudur_yardimcisi', 'rehberlik', 'olcme_degerlendirme', 'zumre_baskani', 'etut_ogretmeni', 'ogretmen'];
const rolKisa = (code: string) => (ROLE_BY_CODE as Record<string, { short: string }>)[code]?.short;
const gorev = (k: GozuAday) => {
  if (k.tur === 'ogrenci') return 'Öğrenci';
  const r = ROL_SIRA.find((x) => k.roller.includes(x));
  if (r) return (rolKisa(r) || 'Öğretmen') + (k.yonetici ? ' · Kurum yön.' : '');
  return k.yonetici ? 'Kurum yöneticisi' : 'Öğretmen';
};

interface SonBakis {
  session_id: string;
  hedef_ad: string;
  hedef_tur: string;
  kurum_ad: string;
  basladi: string;
  bitti: string | null;
  kullanici_gozu_islemleri: Array<{ count: number }>;
}
// Aşama 252b: aynı arama ikinci kez sunucuya gitmez; harf eklenince önceki sonuç hemen süzülerek gösterilir
const anahtar = (q: string, kurum: string) => `${kurum}|${q.trim().toLocaleLowerCase('tr')}`;
const katla = (x: string) => x.toLocaleLowerCase('tr');

const saat = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const GozuyleBakSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  kurumlar: Array<{ id: string; name: string }>;
}> = ({ open, onClose, kurumlar }) => {
  const [q, setQ] = useState('');
  const [kurum, setKurum] = useState('');
  const [sonuc, setSonuc] = useState<GozuAday[] | null>(null);
  const [araniyor, setAraniyor] = useState(false);
  const [hata, setHata] = useState('');
  const [acilan, setAcilan] = useState('');
  const [son, setSon] = useState<SonBakis[] | null | 'yok'>(null);
  const sira = useRef(0);
  const onbellek = useRef(new Map<string, GozuAday[]>());

  // Panel her açılışta temiz başlar; son bakışlar okunur; sunucu ısıtılır (ilk aramada bekleme olmasın)
  useEffect(() => {
    if (!open) return;
    setHata('');
    setAcilan('');
    onbellek.current.clear();
    void gozuKisiAra('', '').catch(() => null);
    let iptal = false;
    supabase
      .from('kullanici_gozu_oturumlari')
      .select('session_id,hedef_ad,hedef_tur,kurum_ad,basladi,bitti,kullanici_gozu_islemleri(count)')
      .order('basladi', { ascending: false })
      .limit(8)
      .then(({ data, error }) => {
        if (!iptal) setSon(error ? 'yok' : ((data || []) as unknown as SonBakis[]));
      });
    return () => {
      iptal = true;
    };
  }, [open]);

  // Yazdıkça arar. Aşama 252b: önbellekte varsa beklemeden gösterir; yoksa önceki (daha kısa) aramanın sonucunu hemen
  // süzer, 200 ms sonra sunucuya sorar. Yeni harf yazılınca eski istek iptal edilir (yanıtlar sıra bozmaz).
  useEffect(() => {
    if (!open) return;
    const metin = q.trim();
    if (metin.length < 2) {
      setSonuc(null);
      setAraniyor(false);
      return;
    }
    const no = ++sira.current;
    const key = anahtar(metin, kurum);
    const hazir = onbellek.current.get(key);
    if (hazir) {
      setSonuc(hazir);
      setAraniyor(false);
      setHata('');
      return;
    }
    // Önceki kısa aramanın sonucundan anında süzme (sunucu yanıtı gelince yerine geçer)
    const kf = katla(metin);
    for (let n = metin.length - 1; n >= 2; n--) {
      const onceki = onbellek.current.get(anahtar(metin.slice(0, n), kurum));
      if (onceki) {
        setSonuc(onceki.filter((k) => katla(k.ad).includes(kf) || katla(k.ek).includes(kf)));
        break;
      }
    }
    setAraniyor(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const list = await gozuKisiAra(metin, kurum, ctrl.signal);
        onbellek.current.set(key, list);
        if (no === sira.current) {
          setSonuc(list);
          setHata('');
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (no === sira.current) setHata(e?.message || 'Arama yapılamadı.');
      } finally {
        if (no === sira.current) setAraniyor(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, kurum, open]);

  const bak = async (k: GozuAday) => {
    if (acilan) return;
    setAcilan(k.authUserId);
    setHata('');
    try {
      await gozuyleBak(k.authUserId); // sayfa o kişinin hesabıyla yeniden açılır
    } catch (e: any) {
      setHata(e?.message || 'Açılamadı.');
      setAcilan('');
    }
  };

  return (
    <AkSheet
      open={open}
      onClose={onClose}
      locked={!!acilan}
      kicker="Destek"
      title="Gözüyle bak"
      desc="Sorun yaşayan kişinin ekranını şifresiz açın. Yaptığınız işlemler o kişi adına işlenir ve kayda geçer."
      footer={
        <>
          <span className="cnt">{acilan ? 'Ekran açılıyor…' : 'Her bakış kayda geçer.'}</span>
          <button type="button" className="ak-btn w-24" onClick={onClose} disabled={!!acilan}>
            Kapat
          </button>
        </>
      }
    >
      <div className="ak-fgrid">
        <label className="ak-fld">
          Kişi
          <input
            className="ak-inp"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ad ya da öğrenci no"
            maxLength={40}
            autoComplete="off"
            aria-label="Kişi ara"
          />
        </label>
        <label className="ak-fld">
          Kurum
          <select className="ak-sel ak-gz-sel" value={kurum} onChange={(e) => setKurum(e.target.value)} aria-label="Kurum">
            <option value="">Bütün kurumlar</option>
            <option value="kendi">Kendi alanım</option>
            {kurumlar.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hata && (
        <p className="ak-err" role="alert">
          {hata}
        </p>
      )}

      <div aria-live="polite">
        {q.trim().length < 2 && <p className="ak-empty">Aramak için en az 2 harf yazın.</p>}
        {q.trim().length >= 2 && araniyor && !sonuc && <p className="ak-empty">Aranıyor…</p>}
        {sonuc && !sonuc.length && !araniyor && <p className="ak-empty">Bu aramayla kişi bulunamadı.</p>}
        {sonuc && sonuc.length > 0 && (
          <div className={'ak-gz-list' + (araniyor ? ' dim' : '')}>
            {sonuc.map((k) => (
              <div className="ak-frow" key={k.authUserId}>
                <span className="ak-av" aria-hidden="true">
                  {akBasHarf(k.ad)}
                </span>
                <span className="w">
                  <b title={k.ad}>{k.ad}</b>
                  <span title={[gorev(k), k.ek, k.kurumAd].filter(Boolean).join(' · ')}>
                    {[gorev(k), k.ek, k.kurumAd].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {k.askida ? (
                  <span className="ak-tag off">Askıda</span>
                ) : (
                  <button type="button" className="ak-btn dark w-24" onClick={() => bak(k)} disabled={!!acilan}>
                    {acilan === k.authUserId ? 'Açılıyor…' : 'Bak'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {Array.isArray(son) && son.length > 0 && (
        <>
          <p className="ak-sub ak-gz-h">Son bakışlar</p>
          <div className="ak-gz-list">
            {son.map((b) => {
              const n = b.kullanici_gozu_islemleri?.[0]?.count || 0;
              return (
                <div className="ak-frow" key={b.session_id}>
                  <span className="w">
                    <b title={b.hedef_ad}>{b.hedef_ad}</b>
                    <span>
                      {(b.hedef_tur === 'ogrenci' ? 'Öğrenci' : 'Personel') + ' · ' + b.kurum_ad + ' · ' + saat(b.basladi)}
                    </span>
                  </span>
                  <span className={'ak-tag ' + (n ? 'warn' : 'off')}>{n ? `${n} işlem` : 'İşlem yok'}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {son === 'yok' && <p className="ak-sub">Son bakışlar okunamadı. Aşama 252 SQL dosyası çalıştırıldı mı?</p>}
    </AkSheet>
  );
};
