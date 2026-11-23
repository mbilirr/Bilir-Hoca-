// ============================================================================
// Aşama 375: AKADEMİK TAKVİM — ETKİNLİK DURUMU (Yapıldı / Yapılmadı / Ertelendi / İptal edildi)
// Etkinlik penceresinin altında. Zümre üyesi ya da idare işaretler (veritabanı denetler, sql/375); işaretleyince
// zümre başkanı + idareye e-posta gider (SMS yalnız Ertelendi / İptal edildi). Ertelendi: etkinlik yeni tarihe taşınır.
// ============================================================================
import React, { useCallback, useEffect, useState } from "react";
import { Ban, CalendarClock, Check, X } from "lucide-react";
import { cx } from "../../ui/kit";
import { dataService } from "../../../services/dataService";
import { useBildirimKanali } from "../../../lib/bildirim";
import {
  takvimCanliDinle,
  AY_KISA,
  DURUM_AD,
  DURUM_TON,
  DURUMLAR,
  durumKaydet,
  durumIsaretleyebilir,
  etkinlikDurumu,
  gunAraligiYazi,
  tarihCoz,
  tarihYaz,
  bugun,
  gunEkle,
  type AktDurum,
  type AktDurumKod,
  type AktEtkinlik,
} from "../../../services/akademikTakvimService";
import { BTN } from "./ortak";

const IKON: Record<
  AktDurumKod,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  yapildi: Check,
  yapilmadi: X,
  ertelendi: CalendarClock,
  iptal: Ban,
};

/** "24 Kas 10:12" */
function zamanYazi(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${AY_KISA[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** "Ayşe Yılmaz" → "Ayşe Y." */
const kisaAd = (ad: string) => {
  const p = ad.trim().split(/\s+/);
  return p.length > 1
    ? `${p.slice(0, -1).join(" ")} ${p[p.length - 1].charAt(0)}.`
    : ad;
};

export const DurumCip: React.FC<{ durum: AktDurumKod; className?: string }> = ({
  durum,
  className,
}) => {
  const Ik = IKON[durum];
  return (
    <span className={cx("ui-chip", `ui-chip-${DURUM_TON[durum]}`, className)}>
      <Ik className="w-3 h-3" aria-hidden />
      {DURUM_AD[durum]}
    </span>
  );
};

export const DurumBolumu: React.FC<{ etkinlik: AktEtkinlik }> = ({
  etkinlik: g,
}) => {
  const kurumId = dataService.getMyKurumId();
  const setBildirim = useBildirimKanali();
  const [mevcut, setMevcut] = useState<AktDurum | null>(null);
  const [ertelendiden, setErtelendiden] = useState<AktDurum | null>(null);
  const [kurulu, setKurulu] = useState(true);
  const [yetki, setYetki] = useState<boolean | null>(null); // Aşama 375b: sorumlu öğretmen ya da idare
  const [secim, setSecim] = useState<AktDurumKod | null>(null);
  const [yeniTarih, setYeniTarih] = useState("");
  const [yeniBitis, setYeniBitis] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");

  const bugunS = tarihYaz(bugun());
  const basladi = g.tarih <= bugunS;
  const sureli = !!g.bitis && !g.ayIcinde;

  const oku = useCallback(async () => {
    if (!kurumId) return;
    try {
      const r = await etkinlikDurumu(kurumId, g);
      setMevcut(r.durum);
      setErtelendiden(r.ertelendiden);
      setKurulu(r.kurulu);
    } catch {
      /* durum okunamazsa düğmeler yine çalışır */
    }
  }, [kurumId, g]);
  useEffect(() => {
    void oku();
  }, [oku]);
  const idler = g.ids.join(",");
  useEffect(() => {
    let canli = true;
    void durumIsaretleyebilir(idler.split(",")).then(
      (v) => canli && setYetki(v),
    );
    return () => {
      canli = false;
    };
  }, [idler]);
  useEffect(() => takvimCanliDinle(kurumId, () => void oku()), [kurumId, oku]);

  const sec = (d: AktDurumKod) => {
    setHata("");
    setSecim((s) => (s === d ? null : d));
    if (d === "ertelendi" && !yeniTarih) {
      const ilk = tarihYaz(gunEkle(bugun(), 1));
      setYeniTarih(ilk);
      if (sureli)
        setYeniBitis(
          tarihYaz(
            gunEkle(
              tarihCoz(ilk),
              Math.round(
                (tarihCoz(g.bitis).getTime() - tarihCoz(g.tarih).getTime()) /
                  86400000,
              ),
            ),
          ),
        );
    }
  };

  const kaydet = async () => {
    if (!secim) return;
    if (secim === "ertelendi" && !yeniTarih)
      return setHata("Yeni tarihi seçin.");
    if (secim === "ertelendi" && yeniBitis && yeniBitis <= yeniTarih)
      return setHata("Bitiş günü yeni tarihten sonra olmalı.");
    setMesgul(true);
    setHata("");
    try {
      await durumKaydet(
        g.ids,
        secim,
        secim === "ertelendi" ? yeniTarih : "",
        secim === "ertelendi" && sureli ? yeniBitis : "",
        aciklama,
      );
      setBildirim({
        tone: "ok",
        text:
          secim === "ertelendi"
            ? `Etkinlik ${gunAraligiYazi({ tarih: yeniTarih, bitis: sureli ? yeniBitis : "" })} tarihine taşındı. Zümre başkanına ve idareye bildirilecek.`
            : `"${DURUM_AD[secim]}" olarak işaretlendi. Zümre başkanına ve idareye bildirilecek.`,
      });
      setSecim(null);
      setAciklama("");
      await oku();
    } catch (e: any) {
      setHata(e?.message || "Kaydedilemedi.");
    } finally {
      setMesgul(false);
    }
  };

  if (!g.zumre || !kurulu) return null;

  return (
    <section
      className="mt-4 pt-4 border-t border-line"
      id="akt-durum"
      aria-label="Etkinliğin durumu"
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <p className="ui-eyebrow">Durum</p>
        {mevcut && <DurumCip durum={mevcut.durum} />}
      </div>
      {mevcut ? (
        <p className="text-xs text-muted pb-3">
          {mevcut.isaretleyen ? `${kisaAd(mevcut.isaretleyen)} · ` : ""}
          {zamanYazi(mevcut.zaman)}
          {mevcut.durum === "ertelendi" && mevcut.yeniTarih
            ? ` · yeni tarih ${gunAraligiYazi({ tarih: mevcut.yeniTarih, bitis: mevcut.yeniBitis })}`
            : ""}
          {mevcut.aciklama ? (
            <span className="block mt-1 text-fg-2">“{mevcut.aciklama}”</span>
          ) : null}
        </p>
      ) : yetki === false ? (
        <p className="text-xs text-muted">
          {ertelendiden
            ? `${gunAraligiYazi({ tarih: ertelendiden.tarih, bitis: "" })} tarihinden ertelendi. `
            : ""}
          Durumu bu sınıf düzeyine giren zümre öğretmeni işaretler; sonuç zümre
          başkanına ve idareye bildirilir.
        </p>
      ) : (
        <p className="text-xs text-muted pb-3">
          {ertelendiden
            ? `${gunAraligiYazi({ tarih: ertelendiden.tarih, bitis: "" })} tarihinden ertelendi. `
            : ""}
          {basladi
            ? "Etkinlik yapıldı mı? İşaretleyince zümre başkanına ve idareye bildirilir."
            : "Etkinlik henüz başlamadı; şimdilik Ertelendi ya da İptal edildi seçilebilir."}
        </p>
      )}

      {yetki && (
        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label="Durum seçin"
        >
          {DURUMLAR.map((d) => {
            const Ik = IKON[d];
            const kapali = !basladi && (d === "yapildi" || d === "yapilmadi");
            return (
              <button
                key={d}
                type="button"
                id={`akt-durum-${d}`}
                className="ui-secim w-full"
                aria-pressed={secim === d}
                disabled={mesgul || kapali}
                title={kapali ? "Etkinlik başlayınca seçilebilir" : undefined}
                onClick={() => sec(d)}
              >
                <Ik aria-hidden />
                {DURUM_AD[d]}
              </button>
            );
          })}
        </div>
      )}

      {secim === "ertelendi" && (
        <div
          className={cx(
            "grid gap-2 mt-3",
            sureli ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <div>
            <label htmlFor="akt-durum-yeni" className="ui-label">
              Yeni tarih
            </label>
            <input
              id="akt-durum-yeni"
              type="date"
              className="ui-field w-full"
              min={bugunS}
              value={yeniTarih}
              onChange={(e) => setYeniTarih(e.target.value)}
            />
          </div>
          {sureli && (
            <div>
              <label htmlFor="akt-durum-bitis" className="ui-label">
                Bitiş
              </label>
              <input
                id="akt-durum-bitis"
                type="date"
                className="ui-field w-full"
                min={yeniTarih || bugunS}
                value={yeniBitis}
                onChange={(e) => setYeniBitis(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {secim && (
        <>
          <div className="mt-3">
            <label htmlFor="akt-durum-not" className="ui-label">
              Not <span className="text-muted font-normal">(isteğe bağlı)</span>
            </label>
            <input
              id="akt-durum-not"
              type="text"
              className="ui-field w-full"
              maxLength={300}
              placeholder={
                secim === "yapildi" ? "Örn. 3 sınıf katıldı" : "Kısa neden"
              }
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
            />
          </div>
          {hata && <p className="text-xs text-danger-fg mt-2">{hata}</p>}
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              className={cx(BTN, "w-28 ui-btn-secondary")}
              disabled={mesgul}
              onClick={() => (setSecim(null), setHata(""))}
            >
              Vazgeç
            </button>
            <button
              type="button"
              id="akt-durum-kaydet"
              className={cx(BTN, "w-28 ui-btn-primary")}
              disabled={mesgul}
              onClick={() => void kaydet()}
            >
              {mesgul ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
