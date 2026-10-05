import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Search, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal, cx } from '../ui/kit';
import { chipCls } from './FormParts';

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

const EVENT_LABEL: Record<string, string> = {
  'homework-created': 'Yeni ödev',
  'homework-reminder': 'Ödev hatırlatma',
  'etut-created': 'Yeni etüt',
  'question-target': 'Soru hedefi',
  'etut-assigned': 'Etüt atandı',
  'etut-changed': 'Etüt değişti',
  'etut-cancelled': 'Etüt iptal',
  'etut-unassigned': 'Etüt başkasına verildi',
  test: 'Deneme',
};
type Filter = 'all' | 'homework' | 'etut' | 'failed';

interface SentCommunicationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SentCommunicationsModal: React.FC<SentCommunicationsModalProps> = ({ isOpen, onClose }) => {
  const [rows, setRows] = useState<MailLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

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
    if (isOpen) load();
  }, [isOpen]);

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return (rows || []).filter((r) => {
      if (filter === 'homework' && !r.event.startsWith('homework')) return false;
      if (filter === 'etut' && !r.event.startsWith('etut')) return false;
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
      description="Sistemin otomatik gönderdiği ödev ve etüt e-postaları (son 300)"
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
              placeholder="Alıcı, konu veya ödev/etüt adı ara"
              className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-fg placeholder:text-subtle focus:outline-none focus:border-brand"
            />
          </div>
          {(
            [
              ['all', 'Tümü'],
              ['homework', 'Ödev'],
              ['etut', 'Etüt'],
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
          <p className="text-xs text-muted py-6 text-center">Yükleniyor…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted py-8 text-center">Henüz gönderilmiş e-posta yok.</p>
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
                    <span className="text-[11px] text-muted truncate">{r.recipient}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-surface-2 text-fg-2">{EVENT_LABEL[r.event] || r.event}</span>
                    {r.recipient_role === 'ogretmen' && <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-info-soft text-info-fg">öğretmen</span>}
                  </div>
                  <p className="text-xs text-fg-2 truncate">{r.subject}</p>
                  {r.status === 'failed' && r.error && <p className="text-[11px] text-danger-fg mt-0.5">{r.error}</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-muted">
                    {new Date(r.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className={cx('text-[10px]', r.via === 'ogretmen' ? 'text-brand-fg' : 'text-subtle')}>
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
