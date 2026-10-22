import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, Save, RotateCcw, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
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
                <b>SMS</b> ve <b>WhatsApp</b> seçimleri saklanır; otomatik gönderim için ücretli bir SMS / WhatsApp hizmeti bağlanması
                gerekir. Hizmet bağlanana kadar bu yollardan bir şey gönderilmez.
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
