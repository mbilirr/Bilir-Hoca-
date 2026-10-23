import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, Save, RotateCcw, CheckCircle2, AlertTriangle, Info, MessageSquareText, Send, RefreshCw } from 'lucide-react';
import { callMail } from '../../lib/mailApi';
import { supabase } from '../../lib/supabase';
import { dataService } from '../../services/dataService';
import { Panel, Segmented, cx } from '../ui/kit';
import { useAutoDismiss } from '../../lib/useAutoDismiss';
import {
  POLICY_CATEGORIES,
  POLICY_CHANNELS,
  POLICY_RECIPIENTS,
  defaultPolicy,
  normalizePolicy,
  type NotificationPolicy,
  type PolicyRecipient,
  type PolicyChannel,
  type PolicyCategory,
} from '../../lib/notificationPolicy';

// ============================================================================
// Aşama 72: Yönetim › Bildirim izinleri
// Etüt, ödev, haftalık plan, soru takibi, deneme sonucu, mesaj ve tebrik bilgilerinin kime (öğrenci, veli,
// öğretmen) hangi yolla (e-posta, telefon bildirimi, SMS, WhatsApp) gideceği buradan açılır / kapatılır.
// E-posta ve telefon bildirimi bu ayara hemen uyar. SMS ve WhatsApp için ayar saklanır; otomatik gönderim
// bir SMS / WhatsApp hizmeti bağlandığında kullanılır.
// ============================================================================

const SQL_MSG = 'Bildirim izinleri tablosu bulunamadı. Supabase SQL Editor\'de sql/72_bildirim_izinleri.sql dosyasını çalıştırın.';

export const NotificationPolicyPanel: React.FC = () => {
  const [policy, setPolicy] = useState<NotificationPolicy>(defaultPolicy());
  const [saved, setSaved] = useState<string>(JSON.stringify(defaultPolicy()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [rec, setRec] = useState<PolicyRecipient>('ogrenci');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  useAutoDismiss(msg, () => setMsg(null));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('notification_policy').select('policy,updated_at').eq('id', 'default').maybeSingle();
        if (!alive) return;
        if (error) {
          if (/notification_policy|does not exist|schema cache|PGRST205|42P01/i.test(`${error.code || ''} ${error.message || ''}`)) setMissing(true);
          else setMsg({ type: 'err', text: error.message || 'Ayar okunamadı.' });
          return;
        }
        const p = normalizePolicy(data?.policy);
        setPolicy(p);
        setSaved(JSON.stringify(p));
        setUpdatedAt(data?.updated_at || null);
      } catch (e: any) {
        if (alive) setMsg({ type: 'err', text: e?.message || 'Ayar okunamadı.' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dirty = JSON.stringify(policy) !== saved;

  const toggle = (cat: PolicyCategory, ch: PolicyChannel) =>
    setPolicy((p) => ({ ...p, [cat]: { ...p[cat], [rec]: { ...p[cat][rec], [ch]: !p[cat][rec][ch] } } }));

  const setColumn = (ch: PolicyChannel, on: boolean) =>
    setPolicy((p) => {
      const next = { ...p } as NotificationPolicy;
      for (const c of POLICY_CATEGORIES) {
        if (!c.channels[rec].includes(ch)) continue;
        next[c.id] = { ...next[c.id], [rec]: { ...next[c.id][rec], [ch]: on } };
      }
      return next;
    });

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from('notification_policy').upsert(
        { id: 'default', policy, updated_at: new Date().toISOString(), updated_by: dataService.getCurrentTeacher()?.name || 'Yönetici' },
        { onConflict: 'id' }
      );
      if (error) {
        if (/notification_policy|does not exist|schema cache|PGRST205|42P01/i.test(`${error.code || ''} ${error.message || ''}`)) {
          setMissing(true);
          throw new Error(SQL_MSG);
        }
        throw new Error(error.message || 'Kaydedilemedi.');
      }
      setSaved(JSON.stringify(policy));
      setUpdatedAt(new Date().toISOString());
      setMsg({ type: 'ok', text: 'Bildirim izinleri kaydedildi. E-posta ve telefon bildirimleri en geç 1 dakika içinde bu ayara uyar.' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'Kaydedilemedi.' });
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => POLICY_CATEGORIES.filter((c) => c.channels[rec].length > 0), [rec]);
  const onCount = (r: PolicyRecipient) =>
    POLICY_CATEGORIES.reduce((a, c) => a + c.channels[r].filter((ch) => policy[c.id][r][ch]).length, 0);

  return (
    <Panel
      id="admin-notification-policy"
      icon={BellRing}
      tone="info"
      title="Bildirim izinleri"
      description="Hangi bilgi kime, hangi yolla gitsin? (etüt, ödev, plan, soru, deneme, mesaj, tebrik)"
      actions={
        <>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm"
            disabled={busy || loading || !dirty}
            onClick={() => setPolicy(JSON.parse(saved))}
            title="Kaydedilmemiş değişiklikleri geri al"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Geri al
          </button>
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy || loading || !dirty || missing} onClick={handleSave}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Kaydet
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Ayarlar okunuyor…
        </div>
      ) : (
        <div className="space-y-3">
          {missing && (
            <div className="p-3 rounded-xl bg-warning-soft text-warning-fg text-xs font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{SQL_MSG} O zamana kadar sistem eskisi gibi çalışır (veliye gönderim yapılmaz).</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              size="sm"
              value={rec}
              onChange={setRec}
              items={POLICY_RECIPIENTS.map((r) => ({
                value: r.id,
                id: `policy-tab-${r.id}`,
                label: r.label,
                badge: <span className="ml-0.5 text-[10px] font-bold text-muted tabular-nums">{onCount(r.id)}</span>,
              }))}
            />
            {updatedAt && (
              <span className="text-[11px] text-muted">
                Son kayıt: {new Date(updatedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs min-w-[34rem]" id="policy-table">
              <thead className="bg-surface-2 text-fg-2">
                <tr>
                  <th className="text-left font-bold px-3 py-2">Bilgi</th>
                  {POLICY_CHANNELS.map((ch) => {
                    const usable = rows.some((c) => c.channels[rec].includes(ch.id));
                    const allOn = usable && rows.every((c) => !c.channels[rec].includes(ch.id) || policy[c.id][rec][ch.id]);
                    return (
                      <th key={ch.id} className="px-2 py-2 font-bold text-center w-[5.5rem]">
                        <div className="leading-tight">{ch.short}</div>
                        {!ch.live && <div className="text-[9.5px] font-semibold text-muted leading-tight">hizmet gerekli</div>}
                        {usable && (
                          <button
                            type="button"
                            className="mt-0.5 text-[10px] font-semibold text-brand-fg hover:underline cursor-pointer"
                            onClick={() => setColumn(ch.id, !allOn)}
                          >
                            {allOn ? 'Tümünü kapat' : 'Tümünü aç'}
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-fg">{c.label}</div>
                      <div className="text-[10.5px] text-muted leading-snug">{c.hint}</div>
                    </td>
                    {POLICY_CHANNELS.map((ch) => {
                      const has = c.channels[rec].includes(ch.id);
                      if (!has)
                        return (
                          <td key={ch.id} className="text-center text-subtle" title="Bu alıcı için bu yol yok">
                            —
                          </td>
                        );
                      const on = !!policy[c.id][rec][ch.id];
                      return (
                        <td key={ch.id} className="text-center px-2 py-2">
                          <label className="inline-flex items-center justify-center cursor-pointer p-1">
                            <input
                              type="checkbox"
                              className="w-4 h-4 cursor-pointer accent-indigo-600"
                              checked={on}
                              disabled={missing}
                              onChange={() => toggle(c.id, ch.id)}
                              aria-label={`${c.label} · ${POLICY_RECIPIENTS.find((r) => r.id === rec)?.label} · ${ch.label}`}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SmsStatusBox />

          <ul className="text-[11px] text-muted space-y-1">
            <li className="flex gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <b>E-posta</b> ve <b>telefon bildirimi</b> bu ayara hemen uyar. Kapalı olan bilgi o kişiye gönderilmez.
              </span>
            </li>
            <li className="flex gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <b>Veli e-postası</b> açıksa öğrenciye giden e-postanın bir kopyası öğrenci kaydındaki velilerin e-posta adreslerine
                "[Veli]" başlığıyla gider. Velinin telefon bildirimi yoktur (veli hesabı bulunmaz).
              </span>
            </li>
            <li className="flex gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <b>SMS</b>, e-postası olan bilgilerle birlikte (ödev, etüt, plan, soru hedefi, deneme karnesi, yoklama) kısa bir cümle ve
                site bağlantısı olarak gider; öğrenci adı ya da puan yazılmaz. Öğretmen "e-posta gönder" dediğinde ve otomatik
                hatırlatmalarda çalışır. <b>WhatsApp</b> seçimi saklanır; otomatik gönderim için ayrı hizmet gerekir.
              </span>
            </li>
            <li className="flex gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Giriş bilgileri, şifre ve hesap e-postaları bu ayardan etkilenmez; her zaman gönderilir.</span>
            </li>
          </ul>

          {msg && (
            <div
              role="status"
              className={cx(
                'p-3 rounded-xl text-xs font-semibold flex items-center gap-2',
                msg.type === 'ok' ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'
              )}
            >
              {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

// ============================================================================
// Aşama 73: SMS durumu ve sınama (sağlayıcı, deneme modu, bugünkü sayılar, son kayıtlar)
// ============================================================================
const EVENT_LABEL: Record<string, string> = {
  'homework-created': 'Yeni ödev',
  'homework-reminder': 'Ödev hatırlatma',
  'etut-created': 'Yeni etüt',
  'etut-scheduled': 'Etüt hatırlatma',
  'etut-changed': 'Etüt değişti',
  'etut-cancelled': 'Etüt iptal',
  'etut-attendance': 'Yoklama bağlantısı',
  'etut-no-attendance': 'Yoklama uyarısı',
  'question-target': 'Soru hedefi',
  'plan-sent': 'Haftalık plan',
  'plan-report': 'Plan raporu',
  'deneme-karne': 'Deneme karnesi',
  'sms-test': 'Sınama',
};
const ROLE_LABEL: Record<string, string> = { ogrenci: 'Öğrenci', veli: 'Veli', ogretmen: 'Öğretmen' };
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  sent: { text: 'Gönderildi', cls: 'ui-chip ui-chip-success' },
  dry: { text: 'Deneme (gitmedi)', cls: 'ui-chip ui-chip-info' },
  sending: { text: 'Gönderiliyor', cls: 'ui-chip ui-chip-neutral' },
  failed: { text: 'Hata', cls: 'ui-chip ui-chip-danger' },
};

interface SmsStatus {
  provider: string | null;
  sender: string | null;
  configured: boolean;
  live: boolean;
  dailyLimit: number;
  today: { sent: number; dry: number; failed: number };
  recent: Array<{ created_at: string; event: string; recipient_role: string; phone_masked: string; status: string; error: string | null }>;
  tableMissing: boolean;
  diag?: { providerValue: string; missing: string[] };
}

const SmsStatusBox: React.FC = () => {
  const [st, setSt] = useState<SmsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ type: 'ok' | 'err'; text: string; raw?: string } | null>(null);
  useAutoDismiss(testMsg, () => setTestMsg(null), 90_000);
  const [infoBusy, setInfoBusy] = useState(false);
  const [info, setInfo] = useState<{ credit: string | number | null; creditRaw: string; senderListed: boolean | null; sendersRaw: string; error: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const r = await callMail('sms-status');
    if (r.ok && r.sms) setSt(r.sms as SmsStatus);
    else setErr(r.error || 'SMS durumu okunamadı.');
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const handleTest = async () => {
    if (testBusy) return;
    setTestBusy(true);
    setTestMsg(null);
    const r = await callMail('sms-test', { phone });
    setTestMsg(
      r.ok
        ? { type: 'ok', text: 'Deneme SMS\'i gönderildi. Birkaç dakika içinde telefonunuza gelmeli.', raw: r.raw ? String(r.raw) : undefined }
        : { type: 'err', text: r.error || 'SMS gönderilemedi.', raw: r.raw ? String(r.raw) : undefined }
    );
    setTestBusy(false);
    load();
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

  const providerName = st?.provider === 'goldmesaj' ? 'Gold Mesaj' : st?.provider === 'netgsm' ? 'Netgsm' : st?.provider === 'iletimerkezi' ? 'İleti Merkezi' : '—';

  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3 space-y-2.5" id="admin-sms-status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-fg flex items-center gap-1.5">
          <MessageSquareText className="w-4 h-4 text-brand-fg" /> SMS durumu
        </span>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
        </button>
      </div>

      {err && <p className="text-[11px] font-semibold text-danger-fg">{err}</p>}

      {st && (
        <>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className={st.configured ? 'ui-chip ui-chip-success' : 'ui-chip ui-chip-warning'}>
              {st.configured ? `Sağlayıcı: ${providerName}` : 'Sağlayıcı ayarlanmamış'}
            </span>
            {st.sender && <span className="ui-chip ui-chip-neutral">Başlık: {st.sender}</span>}
            <span className={st.live ? 'ui-chip ui-chip-danger' : 'ui-chip ui-chip-info'}>{st.live ? 'Gerçek gönderim açık' : 'Deneme modu (SMS gitmez)'}</span>
            <span className="ui-chip ui-chip-neutral">
              Bugün: {st.today.sent} gönderildi · {st.today.dry} deneme · {st.today.failed} hata · sınır {st.dailyLimit}
            </span>
          </div>

          {!st.configured && st.diag && (
            <p className="text-[11px] font-semibold text-warning-fg">
              Sunucunun gördüğü: SMS_PROVIDER = "{st.diag.providerValue || 'boş'}".{' '}
              {st.diag.missing.length ? `Eksik ya da hatalı: ${st.diag.missing.join(', ')}.` : ''}
            </p>
          )}
          {!st.configured && (
            <p className="text-[11px] text-muted">
              Vercel › Settings › Environment Variables bölümüne <b>SMS_PROVIDER</b>, <b>SMS_SENDER</b> ve sağlayıcının bilgilerini ekleyip
              siteyi yeniden yayınlayın (rehberde adım adım yazıyor).
            </p>
          )}
          {st.tableMissing && (
            <p className="text-[11px] font-semibold text-warning-fg">SMS kayıt tablosu yok: Supabase SQL Editor'de sql/73_sms.sql dosyasını çalıştırın.</p>
          )}

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
                className="ui-input h-8 text-xs px-2.5 py-1 rounded-lg w-44"
              />
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={handleTest} disabled={testBusy || !phone.trim()}>
                {testBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} SMS bağlantısını sına
              </button>
              <span className="text-[10.5px] text-muted">Sınama, deneme modunda da gerçek bir SMS gönderir (günde en çok 5).</span>
            </div>
          )}
          {st.configured && st.provider === 'goldmesaj' && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={handleInfo} disabled={infoBusy}>
                {infoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Kontör ve başlığı sorgula
              </button>
              <span className="text-[10.5px] text-muted">SMS göndermez; kalan kontörü ve gönderen başlığınızın onaylı olup olmadığını gösterir.</span>
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-line bg-surface p-2 text-[11px] space-y-1">
              <p className="text-fg">
                <b>Kalan kontör:</b> {info.credit !== null ? String(info.credit) : 'okunamadı (aşağıdaki ham cevaba bakın)'}
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
              <p className={cx('text-[11px] font-semibold', testMsg.type === 'ok' ? 'text-success-fg' : 'text-danger-fg')}>{testMsg.text}</p>
              {testMsg.raw && (
                <details className="text-[11px] text-muted">
                  <summary className="cursor-pointer font-semibold">Sağlayıcının ham cevabı (şifre içermez)</summary>
                  <p className="break-all mt-1">{testMsg.raw}</p>
                </details>
              )}
            </div>
          )}

          {st.recent.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-[11px] min-w-[30rem]">
                <thead className="text-fg-2 bg-surface-2">
                  <tr>
                    <th className="text-left font-bold px-2 py-1.5">Zaman</th>
                    <th className="text-left font-bold px-2 py-1.5">Bilgi</th>
                    <th className="text-left font-bold px-2 py-1.5">Alıcı</th>
                    <th className="text-left font-bold px-2 py-1.5">Numara</th>
                    <th className="text-left font-bold px-2 py-1.5">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {st.recent.map((r, i) => {
                    const s = STATUS_LABEL[r.status] || { text: r.status, cls: 'ui-chip ui-chip-neutral' };
                    return (
                      <tr key={i} className="border-t border-line align-top">
                        <td className="px-2 py-1.5 whitespace-nowrap tabular-nums text-muted">
                          {new Date(r.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="px-2 py-1.5">{EVENT_LABEL[r.event] || r.event}</td>
                        <td className="px-2 py-1.5">{ROLE_LABEL[r.recipient_role] || r.recipient_role || '—'}</td>
                        <td className="px-2 py-1.5 tabular-nums">{r.phone_masked || '—'}</td>
                        <td className="px-2 py-1.5">
                          <span className={s.cls}>{s.text}</span>
                          {r.error && <div className="mt-0.5 text-danger-fg break-words">{r.error}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
