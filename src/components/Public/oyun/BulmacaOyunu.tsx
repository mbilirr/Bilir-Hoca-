import React, { useMemo, useState } from 'react';
import { Check, Lightbulb, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/kit';
import { OyunHatasi, oyunCagri, type BulmacaKelime, type BulmacaTahta, type OyunEkrani, type OyunOzet } from './istek';

// Aşama 382: BULMACA — kelime sorularından çengel bulmaca. Öğrenci bir kelime seçer, ipucuna bakıp yazar.
// Doğru kelime 100 puan; her yanlış tahmin 25, her harf ipucu 20 puan düşürür (en az 20). Bir kelimede 3 yanlış: kelime
// açılır, puan yok. Kesişen kelimelerde açılan harfler ötekine de geçer. Cevapları sunucu bilir; tarayıcıya yalnız açılmış harf gelir.
interface Olay {
  tur: 'dogru' | 'yanlis' | 'kacti' | 'ipucu' | 'bitti';
  kazanilan?: number;
  kalanHak?: number;
  cevap?: string;
  aciklama?: string;
}
interface Yanit {
  olay: Olay;
  puan: number;
  bulmaca: BulmacaTahta;
  bitti: boolean;
  ozet?: OyunOzet;
}
const hucreAnahtar = (x: number, y: number) => `${x},${y}`;
const hucreleri = (k: BulmacaKelime) => Array.from({ length: k.n }, (_, j) => (k.yon === 'y' ? [k.x + j, k.y] : [k.x, k.y + j]) as [number, number]);
const trBuyuk = (v: string) => v.replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR');

export const BulmacaOyunu: React.FC<{
  token: string;
  studentId: string;
  ilk: { bulmaca: BulmacaTahta; puan: number };
  onBitti: (o: OyunOzet) => void;
}> = ({ token, studentId, ilk, onBitti }) => {
  const [tahta, setTahta] = useState<BulmacaTahta>(ilk.bulmaca);
  const [puan, setPuan] = useState(ilk.puan);
  const [secili, setSecili] = useState<number>(() => ilk.bulmaca.kelimeler.find((k) => k.durum === 'acik')?.k ?? 0);
  const [tahmin, setTahmin] = useState('');
  const [olay, setOlay] = useState<{ k: number; o: Olay } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bitirSor, setBitirSor] = useState(false);
  const [sonOzet, setSonOzet] = useState<OyunOzet | null>(null);

  // hücre → harf, numara, ait olduğu kelimeler
  const hucreler = useMemo(() => {
    const m = new Map<string, { harf: string | null; no?: number; kelimeler: number[] }>();
    for (const k of tahta.kelimeler) {
      hucreleri(k).forEach(([x, y], j) => {
        const key = hucreAnahtar(x, y);
        const c = m.get(key) || { harf: null, kelimeler: [] };
        c.harf = c.harf || k.harfler[j];
        c.kelimeler.push(k.k);
        if (j === 0) c.no = k.no;
        m.set(key, c);
      });
    }
    return m;
  }, [tahta]);
  const aktif = tahta.kelimeler.find((k) => k.k === secili) || tahta.kelimeler[0];
  const aktifHucre = useMemo(() => new Set(hucreleri(aktif).map(([x, y]) => hucreAnahtar(x, y))), [aktif]);
  const acilan = tahta.kelimeler.filter((k) => k.durum !== 'acik').length;

  const sec = (k: number) => {
    setSecili(k);
    setTahmin('');
    setHata(null);
    setBitirSor(false);
  };
  const hucreTikla = (key: string) => {
    const c = hucreler.get(key);
    if (!c) return;
    // iki kelimenin kesiştiği hücrede ikinci tıklama öbür kelimeye geçer
    const sira = c.kelimeler;
    sec(sira.includes(secili) && sira.length > 1 ? sira[(sira.indexOf(secili) + 1) % sira.length] : sira[0]);
  };

  const cagir = async (op: string, ek: Record<string, unknown> = {}) => {
    setMesgul(true);
    setHata(null);
    try {
      const r = await oyunCagri<Yanit>(token, op, { studentId, ...ek });
      setTahta(r.bulmaca);
      setPuan(r.puan);
      setOlay({ k: Number(ek.k ?? -1), o: r.olay });
      if (r.bitti && r.ozet) setSonOzet(r.ozet);
      else if (r.olay.tur === 'dogru' || r.olay.tur === 'kacti') {
        // sıradaki açık kelimeye geç
        const sonraki = r.bulmaca.kelimeler.find((k) => k.durum === 'acik' && k.k > secili) || r.bulmaca.kelimeler.find((k) => k.durum === 'acik');
        if (sonraki) setSecili(sonraki.k);
      }
      return r;
    } catch (e) {
      if (e instanceof OyunHatasi && e.kod !== 'ag') {
        try {
          const g = await oyunCagri<OyunEkrani>(token, 'durum', { studentId });
          if (g.tur === 'bulmaca') setTahta(g.bulmaca);
          else if (g.tur === 'bitti') onBitti(g.sonuc);
        } catch {
          /* hata aşağıda */
        }
      }
      setHata(e instanceof Error ? e.message : 'İşlem yapılamadı.');
      return null;
    } finally {
      setMesgul(false);
    }
  };

  const dene = async () => {
    const t = trBuyuk(tahmin.replace(/\s+/g, ''));
    if (!t) return;
    if (Array.from(t).length !== aktif.n) return setHata(`Bu kelime ${aktif.n} harfli.`);
    const r = await cagir('kelime', { k: aktif.k, tahmin: t });
    if (r) setTahmin('');
  };

  const mesaj = (() => {
    if (!olay) return null;
    const o = olay.o;
    if (o.tur === 'dogru') return { ton: 'ok', yazi: `Doğru! +${o.kazanilan} puan${o.aciklama ? ` · ${o.aciklama}` : ''}` };
    if (o.tur === 'yanlis') return { ton: 'kotu', yazi: `Olmadı. Bu kelime için ${o.kalanHak} hakkın kaldı.` };
    if (o.tur === 'kacti') return { ton: 'kotu', yazi: `Hakların bitti. Cevap: ${o.cevap}${o.aciklama ? ` · ${o.aciklama}` : ''}` };
    if (o.tur === 'ipucu') return { ton: 'bilgi', yazi: 'Bir harf açıldı.' };
    return null;
  })();

  const liste = (yon: 'y' | 'd', baslik: string) => {
    const ks = tahta.kelimeler.filter((k) => k.yon === yon);
    if (!ks.length) return null;
    return (
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold text-muted">{baslik}</h3>
        <ul className="space-y-1">
          {ks.map((k) => (
            <li key={k.k}>
              <button
                type="button"
                onClick={() => sec(k.k)}
                className={cx(
                  'flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                  k.k === aktif.k ? 'bg-brand-soft text-fg' : 'hover:bg-surface-2 text-fg-2',
                  k.durum !== 'acik' && 'opacity-60'
                )}
              >
                <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-muted">{k.no}</span>
                <span className="min-w-0 flex-1 break-words">
                  {k.ipucu} <span className="text-xs text-subtle">({k.n})</span>
                </span>
                {k.durum === 'bildi' && <Check className="mt-0.5 w-3.5 h-3.5 shrink-0 text-success-fg" aria-label="Bildin" />}
                {k.durum === 'kacti' && <X className="mt-0.5 w-3.5 h-3.5 shrink-0 text-danger-fg" aria-label="Kaçtı" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-4" id="oyun-bulmaca">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span>
          {acilan} / {tahta.kelimeler.length} kelime
        </span>
        <span className="tabular-nums text-fg">{puan} puan</span>
      </div>

      <div className="ui-card p-4 sm:p-5">
        <div className="mx-auto grid gap-0.5" style={{ gridTemplateColumns: `repeat(${tahta.gen}, minmax(0, 1fr))`, width: `min(100%, ${tahta.gen * 2.75}rem)` }} role="grid" aria-label="Bulmaca">
          {Array.from({ length: tahta.yuk * tahta.gen }, (_, i) => {
            const x = i % tahta.gen;
            const y = Math.floor(i / tahta.gen);
            const key = hucreAnahtar(x, y);
            const c = hucreler.get(key);
            if (!c) return <span key={key} aria-hidden className="aspect-square" />;
            const kaciyor = c.kelimeler.every((k) => tahta.kelimeler[k]?.durum === 'kacti');
            return (
              <button
                key={key}
                type="button"
                onClick={() => hucreTikla(key)}
                aria-label={c.harf ? `Harf ${c.harf}` : 'Boş kare'}
                className={cx(
                  'relative flex aspect-square items-center justify-center rounded-lg border text-sm font-bold sm:text-base',
                  aktifHucre.has(key) ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface',
                  c.harf ? (kaciyor ? 'text-danger-fg' : 'text-fg') : 'text-transparent'
                )}
              >
                {c.no !== undefined && <span className="absolute left-0.5 top-0 text-3xs font-semibold leading-none text-muted">{c.no}</span>}
                {c.harf || '·'}
              </button>
            );
          })}
        </div>
      </div>

      {sonOzet ? (
        <div className="ui-card space-y-3 p-5 text-center" role="status">
          <p className="text-sm font-semibold text-fg">Bulmaca bitti!</p>
          {mesaj && <p className={cx('text-xs', mesaj.ton === 'ok' ? 'text-success-fg' : 'text-muted')}>{mesaj.yazi}</p>}
          <Button genislik="uzun" onClick={() => onBitti(sonOzet)}>
            Sonucu gör
          </Button>
        </div>
      ) : (
        <div className="ui-card space-y-3 p-5">
          <p className="flex items-baseline gap-2 text-sm text-fg">
            <span className="shrink-0 text-xs font-bold text-muted">
              {aktif.no} {aktif.yon === 'y' ? 'soldan sağa' : 'yukarıdan aşağı'}
            </span>
            <span className="min-w-0 break-words font-semibold">{aktif.ipucu}</span>
          </p>
          {aktif.durum === 'acik' ? (
            <>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void dene();
                }}
              >
                <input
                  value={tahmin}
                  onChange={(e) => setTahmin(e.target.value)}
                  aria-label={`${aktif.no} numaralı kelime, ${aktif.n} harf`}
                  placeholder={`${aktif.n} harfli kelime`}
                  maxLength={aktif.n + 4}
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="ui-field min-w-0 flex-1 uppercase tracking-widest"
                />
                <Button type="submit" disabled={mesgul || !tahmin.trim()}>
                  Dene
                </Button>
              </form>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  Bu kelime {aktif.deger} puan · {tahta.hak - aktif.yanlis} hak
                </span>
                <Button variant="secondary" size="sm" leftIcon={<Lightbulb className="w-3.5 h-3.5" />} onClick={() => void cagir('ipucu', { k: aktif.k })} disabled={mesgul || aktif.harfler.filter((h) => !h).length <= 1}>
                  Harf al (−20)
                </Button>
              </div>
            </>
          ) : (
            <p className={cx('text-xs font-semibold', aktif.durum === 'bildi' ? 'text-success-fg' : 'text-danger-fg')}>{aktif.durum === 'bildi' ? 'Bu kelimeyi bildin.' : 'Bu kelime kaçtı.'}</p>
          )}
          {mesaj && olay?.k === aktif.k && (
            <p role="status" className={cx('rounded-xl px-3.5 py-2.5 text-sm', mesaj.ton === 'ok' ? 'bg-success-soft text-success-fg' : mesaj.ton === 'kotu' ? 'bg-danger-soft text-danger-fg' : 'bg-surface-2 text-fg-2')}>
              {mesaj.yazi}
            </p>
          )}
          {mesaj && olay && olay.k !== aktif.k && (olay.o.tur === 'dogru' || olay.o.tur === 'kacti') && (
            <p role="status" className={cx('rounded-xl px-3.5 py-2.5 text-sm', mesaj.ton === 'ok' ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg')}>
              {mesaj.yazi}
            </p>
          )}
          {hata && (
            <p role="alert" className="text-xs text-danger-fg">
              {hata}
            </p>
          )}
        </div>
      )}

      {!sonOzet && (
        <div className="ui-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {liste('y', 'Soldan sağa')}
          {liste('d', 'Yukarıdan aşağı')}
        </div>
      )}

      {!sonOzet && (
        <div className="flex flex-col items-center gap-2">
          {bitirSor ? (
            <>
              <p className="text-center text-xs text-muted">Açılmamış kelimeler bilinmemiş sayılır ve oyun biter.</p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setBitirSor(false)}>
                  Vazgeç
                </Button>
                <Button variant="danger-soft" onClick={() => void cagir('bitir')} disabled={mesgul}>
                  Evet, bitir
                </Button>
              </div>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setBitirSor(true)} disabled={mesgul}>
              Bulmacayı bitir
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
