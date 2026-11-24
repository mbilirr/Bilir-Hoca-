import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Search, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal, cx } from '../ui/kit';
import { Yukleniyor } from '../ui/Durum'; // Aşama 305
import { chipCls } from './FormParts';
import { olayAdi, olayGrubu } from '../../lib/gonderimOlaylari';

// ============================================================================
// Giden e-postalar (Aşama 9): sunucunun gerçekten gönderdiği / gönderemediği e-postaların kaydı.
// Öğretmen yalnızca kendi gönderdiklerini, yönetici tümünü görür (veritabanı kuralı).
// ============================================================================

interface MailLogRow {
  id: number;
  created_at: string;
  sender_name: string | null;
  via: string | null;
  event: string;
  ref_title: string | null;
  recipient: string;
  recipient_name: string | null;
  recipient_role: string | null;
  subject: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}

// Aşama 377: bütün olayların Türkçesi ortak listede (lib/gonderimOlaylari); Takvim ve Gönderilen süzgeci
export type GidenFiltre = 'all' | 'sent' | 'homework' | 'etut' | 'takvim' | 'failed';
type Filter = GidenFiltre;

interface SentCommunicationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Aşama 377: açılışta seçili süzgeç (ör. sayı kartından "ulaşmadı") */
  filtre?: GidenFiltre;
}

export const SentCommunicationsModal: React.FC<SentCommunicationsModalProps> = ({ isOpen, onClose, filtre: ilkFiltre = 'all' }) => {
  const [rows, setRows] = useState<MailLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(ilkFiltre);

  const load = async () => {
    setError(null);
    setRows(null);
    const { data, error: err } = await supabase.from('mail_log').select('*').order('created_at', { ascending: false }).limit(300);
    if (err) {
      setRows([]);
      setError(/mail_log/.test(err.message || '') ? 'E-posta kaydı tablosu bulunamadı (13 numaralı SQL çalıştırılmalı).' : err.message);
      return;
    }
    setRows((data || []) as MailLogRow[]);
  };
  useEffect(() => {
    if (isOpen) {
      setFilter(ilkFiltre);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return (rows || []).filter((r) => {
      if (filter === 'sent' && r.status !== 'sent') return false;
      if (filter === 'homework' && olayGrubu(r.event) !== 'odev') return false;
      if (filter === 'etut' && olayGrubu(r.event) !== 'etut') return false;
      if (filter === 'takvim' && olayGrubu(r.event) !== 'takvim') return false;
      if (filter === 'failed' && r.status !== 'failed') return false;
      if (!q) return true;
      return [r.recipient, r.recipient_name, r.subject, r.ref_title, r.sender_name].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(q);
    });
  }, [rows, query, filter]);
  const failedCount = (rows || []).filter((r) => r.status === 'failed').length;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      id="sent-mails-modal"
      icon={Mail}
      tone="brand"
      size="lg"
      title="Giden E-postalar"
      description="Sistemin gönderdiği ve gönderemediği e-postalar (son 300)"
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={load}>
            <RefreshCw className="w-4 h-4" />
            Yenile
          </button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={onClose}>
            Kapat
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Alıcı, konu ya da başlık ara"
              className="ui-field w-full pl-9 pr-3"
            />
          </div>
          {(
            [
              ['all', 'Tümü'],
              ['sent', 'Gönderilen'],
              ['homework', 'Ödev'],
              ['etut', 'Etüt'],
              ['takvim', 'Takvim'],
              ['failed', `Gönderilemeyen${failedCount ? ` (${failedCount})` : ''}`],
            ] as Array<[Filter, string]>
          ).map(([k, label]) => (
            <button key={k} type="button" className={chipCls(filter === k)} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        {error && <div className="p-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold">{error}</div>}
        {rows === null ? (
          <div>
            <Yukleniyor satir={4} />
          </div>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted py-8 text-center">{rows.length ? 'Bu süzgece uyan e-posta yok.' : 'Henüz gönderilmiş e-posta yok.'}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line" id="sent-mails-list">
            {list.map((r) => (
              <li key={r.id} className="px-3 py-2.5 flex items-start gap-3">
                {r.status === 'sent' ? (
                  <CheckCircle2 className="w-4 h-4 text-success-fg shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-danger-fg shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-fg truncate">{r.recipient_name || r.recipient}</span>
                    <span className="text-xs text-muted truncate">{r.recipient}</span>
                    <span className="text-2xs font-semibold px-1.5 py-px rounded bg-surface-2 text-fg-2">{olayAdi(r.event)}</span>
                    {r.recipient_role === 'ogretmen' && <span className="text-2xs font-semibold px-1.5 py-px rounded bg-info-soft text-info-fg">öğretmen</span>}
                  </div>
                  <p className="text-xs text-fg-2 truncate">{r.subject}</p>
                  {r.status === 'failed' && r.error && <p className="text-xs text-danger-fg mt-0.5">{r.error}</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted">
                    {new Date(r.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className={cx('text-2xs', r.via === 'ogretmen' ? 'text-brand-fg' : 'text-subtle')}>
                    {r.via === 'ogretmen' ? 'kendi Gmail' : r.via === 'okul' ? 'okul hesabı' : ''}
                    {r.sender_name ? ` · ${r.sender_name}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
