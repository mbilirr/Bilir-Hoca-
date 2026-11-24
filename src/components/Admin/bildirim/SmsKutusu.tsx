// ============================================================================
// Aşama 73 → 377: SMS durumu ve sınama (sağlayıcı, deneme modu, bugünkü sayılar) ve SMS kayıtları penceresi.
// Aşama 377: Bildirim izinleri panelinin içinden çıktı; Yönetim › Bildirim ve SMS'te E-posta kutusuyla yan yana.
// Durum bir üst bileşende okunur (sayı kartları da aynı veriyi kullanır); kayıt listesi ayrı pencerede.
// ============================================================================
import React, { useMemo, useState } from 'react';
import { Loader2, MessageSquareText, RefreshCw, Send, Trash2, List } from 'lucide-react';
import { callMail } from '../../../lib/mailApi';
import { Modal, Segmented, cx } from '../../ui/kit';
import { useAutoDismiss } from '../../../lib/useAutoDismiss';
import { useBildirimKanali } from '../../../lib/bildirim';
import { olayAdi } from '../../../lib/gonderimOlaylari';

export interface SmsKaydi {
  id?: number;
  created_at: string;
  event: string;
  recipient_role: string;
  phone_masked: string;
  status: string;
  error: string | null;
}
export interface SmsStatus {
  provider: string | null;
  sender: string | null;
  configured: boolean;
  live: boolean;
  dailyLimit: number;
  today: { sent: number; dry: number; failed: number };
  recent: SmsKaydi[];
  tableMissing: boolean;
  canHide?: boolean; // Aşama 129: kayıtlar listeden kaldırılabilir (sql/129 çalıştı)
  diag?: { providerValue: string; missing: string[] };
}

const ROLE_LABEL: Record<string, string> = { ogrenci: 'Öğrenci', veli: 'Veli', ogretmen: 'Öğretmen' };
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  sent: { text: 'Gönderildi', cls: 'ui-chip ui-chip-success' },
  dry: { text: 'Deneme (gitmedi)', cls: 'ui-chip ui-chip-info' },
  sending: { text: 'Gönderiliyor', cls: 'ui-chip ui-chip-neutral' },
  failed: { text: 'Hata', cls: 'ui-chip ui-chip-danger' },
};
export const SAGLAYICI_AD: Record<string, string> = { goldmesaj: 'Gold Mesaj', netgsm: 'Netgsm', iletimerkezi: 'İleti Merkezi' };
/** 5 dakikadan eski "Gönderiliyor" kaydı takılı kalmış sayılır */
export const smsTakili = (r: SmsKaydi) => r.status === 'sending' && Date.now() - new Date(r.created_at).getTime() > 5 * 60000;

// ---------------------------------------------------------------- kutu
export const SmsKutusu: React.FC<{
  st: SmsStatus | null;
  err: string | null;
  loading: boolean;
  onYenile: () => void;
  onKayitlar: () => void;
}> = ({ st, err, loading, onYenile, onKayitlar }) => {
  const [phone, setPhone] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ type: 'ok' | 'err'; text: string; raw?: string } | null>(null);
  useAutoDismiss(testMsg, () => setTestMsg(null), 90_000);
  const [infoBusy, setInfoBusy] = useState(false);
  const [info, setInfo] = useState<{ credit: string | number | null; creditRaw: string; senderListed: boolean | null; sendersRaw: string; error: string } | null>(null);

  const handleTest = async () => {
    if (testBusy) return;
    setTestBusy(true);
    setTestMsg(null);
    const r = await callMail('sms-test', { phone });
    setTestMsg(
      r.ok
        ? { type: 'ok', text: "Deneme SMS'i gönderildi. Birkaç dakika içinde telefonunuza gelmeli.", raw: r.raw ? String(r.raw) : undefined }
        : { type: 'err', text: r.error || 'SMS gönderilemedi.', raw: r.raw ? String(r.raw) : undefined }
    );
    setTestBusy(false);
    onYenile();
  };

  const handleInfo = async () => {
    if (infoBusy) return;
    setInfoBusy(true);
    setInfo(null);
    const r = await callMail('sms-info');
    if (r.ok && r.info) setInfo(r.info as any);
    else setTestMsg({ type: 'err', text: r.error || 'Kontör bilgisi alınamadı.' });
    setInfoBusy(false);
  };

  const providerName = SAGLAYICI_AD[st?.provider || ''] || '—';
  const takili = (st?.recent || []).filter(smsTakili).length;

  return (
    <section className="ui-card ui-card-pad h-full flex flex-col gap-3" id="admin-sms-status" aria-labelledby="admin-sms-baslik">
      <div className="flex items-center justify-between gap-2">
        <h3 id="admin-sms-baslik" className="text-sm font-bold text-fg flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-brand-fg" aria-hidden /> SMS
        </h3>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-28" onClick={onYenile} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
        </button>
      </div>

      {err && <p className="text-xs font-semibold text-danger-fg">{err}</p>}
      {!st && !err && <p className="text-xs text-muted">SMS durumu okunuyor…</p>}

      {st && (
        <>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted">Sağlayıcı</dt>
            <dd className={cx('font-semibold', st.configured ? 'text-fg' : 'text-warning-fg')}>{st.configured ? providerName : 'Ayarlanmamış'}</dd>
            <dt className="text-muted">Başlık</dt>
            <dd className="font-semibold text-fg">{st.sender || '—'}</dd>
            <dt className="text-muted">Gönderim</dt>
            <dd className={cx('font-semibold', st.live ? 'text-success-fg' : 'text-info-fg')}>{st.live ? 'Gerçek gönderim açık' : 'Deneme modu (gitmez)'}</dd>
            <dt className="text-muted">Bugün</dt>
            <dd className="font-semibold text-fg tabular-nums">
              {st.today.sent} gönderildi · {st.today.dry} deneme · {st.today.failed} hata
            </dd>
            <dt className="text-muted">Günlük sınır</dt>
            <dd className="font-semibold text-fg tabular-nums">{st.dailyLimit || '—'}</dd>
            {takili > 0 && (
              <>
                <dt className="text-muted">Takılı</dt>
                <dd className="font-semibold text-danger-fg tabular-nums">{takili} gönderim (kayıtlardan kapatın)</dd>
              </>
            )}
          </dl>

          {!st.configured && st.diag && (
            <p className="text-xs font-semibold text-warning-fg">
              Sunucunun gördüğü: SMS_PROVIDER = "{st.diag.providerValue || 'boş'}". {st.diag.missing.length ? `Eksik ya da hatalı: ${st.diag.missing.join(', ')}.` : ''}
            </p>
          )}
          {!st.configured && (
            <p className="text-xs text-muted">
              Vercel › Settings › Environment Variables bölümüne <b>SMS_PROVIDER</b>, <b>SMS_SENDER</b> ve sağlayıcının bilgilerini ekleyip siteyi yeniden yayınlayın (rehberde adım adım yazıyor).
            </p>
          )}
          {st.tableMissing && <p className="text-xs font-semibold text-warning-fg">SMS kayıt tablosu yok: Supabase SQL Editor'de sql/73_sms.sql dosyasını çalıştırın.</p>}

          {st.configured && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Kendi cep telefonunuz"
                aria-label="Sınama için cep telefonu"
                className="ui-field h-8 text-xs w-44"
              />
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28" onClick={handleTest} disabled={testBusy || !phone.trim()} title="Deneme modunda da gerçek bir SMS gönderir (günde en çok 5)">
                {testBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Sına
              </button>
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-line bg-surface-2 p-2 text-xs space-y-1">
              <p className="text-fg">
                <b>Kalan kontör:</b>{' '}
                {info.credit !== null ? (typeof info.credit === 'number' ? info.credit.toLocaleString('tr-TR') : String(info.credit)) : 'okunamadı (aşağıdaki ham cevaba bakın)'}
              </p>
              <p className="text-fg">
                <b>Gönderen başlığı{st.sender ? ` (${st.sender})` : ''}:</b>{' '}
                {info.senderListed === true ? 'onaylı listede bulundu' : info.senderListed === false ? 'listede BULUNAMADI, Gold Mesaj panelinden başlığı kontrol edin' : 'kontrol edilemedi'}
              </p>
              {info.error && <p className="text-danger-fg">{info.error}</p>}
              <details className="text-muted">
                <summary className="cursor-pointer font-semibold">Sağlayıcının ham cevabı (şifre içermez)</summary>
                <p className="break-all mt-1">Kontör: {info.creditRaw || '—'}</p>
                <p className="break-all mt-1">Başlıklar: {info.sendersRaw || '—'}</p>
              </details>
            </div>
          )}
          {testMsg && (
            <div className="space-y-1">
              <p className={cx('text-xs font-semibold', testMsg.type === 'ok' ? 'text-success-fg' : 'text-danger-fg')}>{testMsg.text}</p>
              {testMsg.raw && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer font-semibold">Sağlayıcının ham cevabı (şifre içermez)</summary>
                  <p className="break-all mt-1">{testMsg.raw}</p>
                </details>
              )}
            </div>
          )}

          <div className="mt-auto pt-1 flex flex-wrap items-center gap-2">
            <button type="button" id="admin-sms-kayitlar" className="ui-btn ui-btn-primary ui-btn-sm h-8 w-36" onClick={onKayitlar}>
              <List className="w-3.5 h-3.5" /> SMS kayıtları
            </button>
            {st.configured && st.provider === 'goldmesaj' && (
              <button
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-36"
                onClick={handleInfo}
                disabled={infoBusy}
                title="SMS göndermez; kalan kontörü ve gönderen başlığınızın onaylı olup olmadığını gösterir"
              >
                {infoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Kontör sorgula
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};

// ---------------------------------------------------------------- kayıtlar penceresi
export type SmsFiltre = 'all' | 'sent' | 'failed';

export const SmsKayitlariPenceresi: React.FC<{
  st: SmsStatus;
  filtre: SmsFiltre;
  onClose: () => void;
  onYenile: () => void;
}> = ({ st, filtre: ilkFiltre, onClose, onYenile }) => {
  const [filtre, setFiltre] = useState<SmsFiltre>(ilkFiltre);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [logBusy, setLogBusy] = useState(false);
  const setLogMsg = useBildirimKanali();
  const liste = useMemo(
    () => st.recent.filter((r) => (filtre === 'sent' ? r.status === 'sent' : filtre === 'failed' ? r.status === 'failed' || smsTakili(r) : true)),
    [st.recent, filtre]
  );
  const hataSay = st.recent.filter((r) => r.status === 'failed' || smsTakili(r)).length;

  const logAction = async (payload: Record<string, unknown>, okText: (n: number) => string) => {
    if (logBusy) return;
    setLogBusy(true);
    setLogMsg(null);
    const r = await callMail('sms-log', payload);
    setLogMsg(r.ok ? { type: 'ok', text: okText(Number(r.changed) || 0) } : { type: 'err', text: r.error || 'İşlem yapılamadı.' });
    setLogBusy(false);
    if (r.ok) {
      setPick(new Set());
      onYenile();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      id="sms-kayitlari"
      icon={MessageSquareText}
      size="lg"
      title="SMS kayıtları"
      description="Son gönderilen SMS'ler. Öğrenci adı ve numaranın tamamı gösterilmez."
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-secondary w-28" onClick={onYenile}>
            <RefreshCw className="w-3.5 h-3.5" /> Yenile
          </button>
          <button type="button" className="ui-btn ui-btn-primary w-28" onClick={onClose}>
            Kapat
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            size="sm"
            value={filtre}
            onChange={setFiltre}
            items={[
              { value: 'all', label: 'Tümü' },
              { value: 'sent', label: 'Gönderilen' },
              { value: 'failed', label: `Hata${hataSay ? ` (${hataSay})` : ''}` },
            ]}
          />
          {st.canHide && st.recent.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-36"
                disabled={logBusy || pick.size === 0}
                onClick={() => void logAction({ op: 'hide', ids: Array.from(pick) }, (n) => `${n} kayıt listeden kaldırıldı.`)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Seçilenleri kaldır
              </button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm h-8 w-36" disabled={logBusy} onClick={() => void logAction({ op: 'hide', all: true }, (n) => `${n} kayıt listeden kaldırıldı.`)}>
                <Trash2 className="w-3.5 h-3.5" /> Listeyi temizle
              </button>
            </div>
          )}
        </div>
        {st.recent.length > 0 && !st.canHide && (
          <p className="text-xs text-muted">Kayıtları listeden kaldırmak için Supabase SQL Editor'de sql/129_yillik_plan_ve_sms_kayit.sql dosyasını çalıştırın.</p>
        )}
        {liste.length === 0 ? (
          <p className="text-xs text-muted py-8 text-center">{filtre === 'failed' ? 'Hatalı SMS yok.' : 'Henüz SMS kaydı yok.'}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs min-w-[30rem]">
              <thead className="text-fg-2 bg-surface-2">
                <tr>
                  {st.canHide && (
                    <th className="px-2 py-1.5 w-6">
                      <input
                        type="checkbox"
                        aria-label="Listedeki bütün kayıtları seç"
                        checked={liste.length > 0 && liste.every((r) => r.id !== undefined && pick.has(r.id))}
                        onChange={(e) => setPick(e.target.checked ? new Set(liste.map((r) => r.id).filter((x): x is number => typeof x === 'number')) : new Set())}
                      />
                    </th>
                  )}
                  <th className="text-left font-bold px-2 py-1.5">Zaman</th>
                  <th className="text-left font-bold px-2 py-1.5">Bilgi</th>
                  <th className="text-left font-bold px-2 py-1.5">Alıcı</th>
                  <th className="text-left font-bold px-2 py-1.5">Numara</th>
                  <th className="text-left font-bold px-2 py-1.5">Durum</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((r, i) => {
                  const s = STATUS_LABEL[r.status] || { text: r.status, cls: 'ui-chip ui-chip-neutral' };
                  return (
                    <tr key={r.id ?? i} className="border-t border-line align-top">
                      {st.canHide && (
                        <td className="px-2 py-1.5">
                          {typeof r.id === 'number' && (
                            <input
                              type="checkbox"
                              aria-label="Kaydı seç"
                              checked={pick.has(r.id)}
                              onChange={(e) =>
                                setPick((p) => {
                                  const n = new Set(p);
                                  if (e.target.checked) n.add(r.id as number);
                                  else n.delete(r.id as number);
                                  return n;
                                })
                              }
                            />
                          )}
                        </td>
                      )}
                      <td className="px-2 py-1.5 whitespace-nowrap tabular-nums text-muted">
                        {new Date(r.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-2 py-1.5">{olayAdi(r.event)}</td>
                      <td className="px-2 py-1.5">{ROLE_LABEL[r.recipient_role] || r.recipient_role || '—'}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.phone_masked || '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className={s.cls}>{s.text}</span>
                        {r.error && <div className="mt-0.5 text-danger-fg break-words">{r.error}</div>}
                        {st.canHide && typeof r.id === 'number' && smsTakili(r) && (
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost ui-btn-sm mt-0.5"
                            disabled={logBusy}
                            title="Sağlayıcıdan cevap gelmeden yarıda kalan kayıt. Kayıt 'Hata' yapılır; SMS sağlayıcıya iletildiyse geri alınamaz."
                            onClick={() => void logAction({ op: 'close', id: r.id }, (n) => (n ? 'Takılı kayıt kapatıldı.' : 'Kayıt değişmedi (gönderim tamamlanmış olabilir).'))}
                          >
                            Kapat
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">
          SMS'ler sırada beklemez, hemen gönderilir. "Deneme (gitmedi)" kayıtları hiç gönderilmemiştir. Kaldırılan kayıt yalnız listeden çıkar; aynı mesajın ikinci kez gitmemesi ve günlük sınır sayımı korunur.
        </p>
      </div>
    </Modal>
  );
};
