import React, { useEffect, useMemo, useState } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { PARENT_RELATIONS, cleanParents, parentTitle } from '../../lib/parents';
import type { Student, StudentParent } from '../../types';

// ============================================================================
// Aşama 134: ELLE GÖNDERİMDE VELİ SEÇİMİ (karne e-posta / SMS, veli duyurusu)
// • Toplu gönderim → yakınlığa göre: "Tüm veliler · Anne · Baba · Bakıcı…" (yalnız kayıtlarda geçen yakınlıklar)
// • Tek öğrenci   → velilerin adıyla onay kutuları (hepsi işaretli gelir)
// Seçim sunucuya yalnız SÜZGEÇ olarak gider (audience.veliYakinlik / audience.veliSira); telefon ve e-posta
// yine sunucuda öğrencinin kaydından okunur, seçim alıcıyı yalnız daraltır. Seçim yoksa tüm veliler (eski davranış).
// Sıra = cleanParents listesindeki yer (boş veliler sayılmaz, en çok 3) — sunucudaki pickParents ile aynı.
// ============================================================================

export type ParentChannel = 'sms' | 'mail';
export type ParentSelection = { veliYakinlik?: string[]; veliSira?: number[] };

const relKey = (v?: string) => String(v || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');

/** Cep telefonu (05XXXXXXXXX) mı — SMS yalnız cep numarasına gider */
export const isMobile = (raw?: string) => {
  let d = String(raw || '').replace(/\D+/g, '');
  if (d.startsWith('0090')) d = d.slice(4);
  else if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return /^5\d{9}$/.test(d);
};
export const isMail = (raw?: string) => /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(String(raw || '').trim().toLowerCase());
export const parentReachable = (p: StudentParent, ch: ParentChannel) => (ch === 'sms' ? isMobile(p.phone) : isMail(p.email));

/** Sunucudaki pickParents'in istemci karşılığı (önizleme sayıları gerçekte gidenle birebir olsun) */
export function pickParents(parents: StudentParent[] | undefined, sel?: ParentSelection | null): StudentParent[] {
  const list = cleanParents(parents);
  if (sel?.veliSira && sel.veliSira.length) {
    const idx = new Set(sel.veliSira);
    return list.filter((_, i) => idx.has(i));
  }
  if (sel?.veliYakinlik && sel.veliYakinlik.length) {
    const rels = new Set(sel.veliYakinlik.map(relKey));
    return list.filter((p) => rels.has(relKey(p.relation)));
  }
  return list;
}

/** Öğrencilerin kayıtlı velilerinde geçen yakınlıklar (bilinenler önce, sonra alfabetik) — tek geçiş */
export function parentRelations(students: Student[]): string[] {
  const seen = new Map<string, string>();
  for (const s of students) {
    const ps = s.parents;
    if (!ps || !ps.length) continue;
    for (const p of cleanParents(ps)) {
      const k = relKey(p.relation);
      if (k && !seen.has(k)) seen.set(k, p.relation as string);
    }
  }
  const order = new Map(PARENT_RELATIONS.map((r, i) => [relKey(r), i] as const));
  return [...seen.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99) || a.localeCompare(b, 'tr'))
    .map(([, v]) => v);
}

const CHIP = 'ui-btn ui-btn-sm h-8 w-full justify-center truncate';

/** Toplu gönderim: yakınlık düğmeleri. value boş = Tüm veliler */
export const RelationChips: React.FC<{ relations: string[]; value: string[]; onChange: (v: string[]) => void; idPrefix?: string }> = ({
  relations,
  value,
  onChange,
  idPrefix = 'veli-yakinlik',
}) => {
  const on = useMemo(() => new Set(value.map(relKey)), [value]);
  const toggle = (r: string) => {
    const k = relKey(r);
    onChange(on.has(k) ? value.filter((x) => relKey(x) !== k) : [...value, r]);
  };
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" role="group" aria-label="Hangi veliler" id={idPrefix}>
      <button type="button" className={cx(CHIP, value.length ? 'ui-btn-secondary' : 'ui-btn-primary')} aria-pressed={!value.length} onClick={() => onChange([])} data-rel="">
        Tüm veliler
      </button>
      {relations.map((r) => (
        <button key={r} type="button" className={cx(CHIP, on.has(relKey(r)) ? 'ui-btn-primary' : 'ui-btn-secondary')} aria-pressed={on.has(relKey(r))} onClick={() => toggle(r)} data-rel={r}>
          {r}
        </button>
      ))}
    </div>
  );
};

/** Tek öğrenci: velilerin listesi (onay kutuları). channels: hangi yolla gidecek (bilgisi olmayan veli seçilemez) */
export const ParentChecklist: React.FC<{
  parents: StudentParent[];
  channels: ParentChannel[];
  value: number[];
  onChange: (v: number[]) => void;
  idPrefix?: string;
}> = ({ parents, channels, value, onChange, idPrefix = 'veli-sec' }) => {
  const list = useMemo(() => cleanParents(parents), [parents]);
  const on = new Set(value);
  return (
    <div className="space-y-1.5" id={idPrefix}>
      {list.map((p, i) => {
        const reach = channels.some((ch) => parentReachable(p, ch));
        const contact = channels
          .map((ch) => (ch === 'sms' ? (isMobile(p.phone) ? p.phone : '') : isMail(p.email) ? p.email : ''))
          .filter(Boolean)
          .join(' · ');
        return (
          <label
            key={i}
            className={cx(
              'flex h-8 items-center gap-2 rounded-xl border px-3 text-xs',
              !reach ? 'cursor-not-allowed border-line opacity-50' : on.has(i) ? 'cursor-pointer border-brand/40 bg-brand-soft text-fg' : 'cursor-pointer border-line text-fg-2'
            )}
            title={reach ? undefined : channels.includes('sms') && channels.length === 1 ? 'Cep telefonu kayıtlı değil' : 'E-posta adresi kayıtlı değil'}
          >
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={reach && on.has(i)}
              disabled={!reach}
              onChange={() => onChange(on.has(i) ? value.filter((x) => x !== i) : [...value, i].sort())}
              data-veli={i}
            />
            <span className="shrink-0 font-semibold text-fg">{parentTitle(p, i)}</span>
            <span className="min-w-0 truncate">{[p.name, contact || (reach ? '' : 'iletişim bilgisi yok')].filter(Boolean).join(' · ')}</span>
          </label>
        );
      })}
    </div>
  );
};

/** Bu kanalda ulaşılabilen velilerin sıraları (varsayılan seçim: hepsi) */
export const reachableIndexes = (parents: StudentParent[] | undefined, channels: ParentChannel[]) =>
  cleanParents(parents)
    .map((p, i) => (channels.some((ch) => parentReachable(p, ch)) ? i : -1))
    .filter((i) => i >= 0);

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';

/** Tek öğrenci için küçük pencere: "Veliye e-posta / SMS" düğmesinden açılır */
export const ParentPickModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSend: (veliSira: number[]) => void;
  studentName: string;
  parents: StudentParent[];
  channel: ParentChannel;
}> = ({ open, onClose, onSend, studentName, parents, channel }) => {
  const [sel, setSel] = useState<number[]>([]);
  useEffect(() => {
    if (open) setSel(reachableIndexes(parents, [channel]));
  }, [open, parents, channel]);
  const sms = channel === 'sms';
  const Icon = sms ? MessageSquare : Mail;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Icon}
      title={`Veliye ${sms ? 'SMS' : 'e-posta'}: ${studentName}`}
      size="sm"
      id="veli-sec-modal"
      footer={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose}>
            Vazgeç
          </button>
          <button type="button" id="veli-sec-gonder" className={cx(BTN, 'ui-btn-primary')} disabled={!sel.length} onClick={() => onSend(sel)}>
            <Icon className="w-3.5 h-3.5" /> Gönder
          </button>
        </>
      }
    >
      <div className="space-y-2 text-xs text-fg-2">
        <p className="font-semibold text-fg">Hangi velilere gitsin?</p>
        <ParentChecklist parents={parents} channels={[channel]} value={sel} onChange={setSel} />
        <p className="leading-relaxed">Karne yalnız işaretli velilere gider.</p>
      </div>
    </Modal>
  );
};
