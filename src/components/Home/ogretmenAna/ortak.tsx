// Öğretmen ana sayfası: sayfanın ortak yardımcıları (Aşama 364, OgretmenAnaSayfa.tsx bölündü)
import React, { useEffect, useState } from 'react';
import { lazyNamed } from '../../../lib/lazyLoad'; // Aşama 370: yeni sürümde eksik parça → sayfa bir kez yenilenir
import { Bell } from 'lucide-react';
import { type ClassGroup, type Etut, type Homework, type HomeworkSubmission, type Student, type StudentMessage, type TeacherTabType, type Teacher } from '../../../types';
import { GUN_ADLARI, isoGun, tarihUzun } from '../../../services/dersService';
import { enablePush, getPushState, resyncPush, testPush, type PushState } from '../../../lib/push';
import { pushOptInErtele, pushOptInErtelendi } from '../../Common/PushOptInCard';
import { setQuickFocus } from '../../../lib/quickFocus';
import { useBildirimKanali } from '../../../lib/bildirim';


// Ders ve etüt yoklaması pencereleri ayrı parça (yalnız açılınca iner)
export const DersYoklamaModal = lazyNamed<React.ComponentProps<typeof import('../../Teacher/DersYoklamaModal').DersYoklamaModal>>(() => import('../../Teacher/DersYoklamaModal'), 'DersYoklamaModal');

export const EtutAttendanceModal = lazyNamed<React.ComponentProps<typeof import('../../Teacher/EtutAttendanceModal').EtutAttendanceModal>>(() => import('../../Teacher/EtutAttendanceModal'), 'EtutAttendanceModal');

export type Go = (tab: TeacherTabType, focus?: Parameters<typeof setQuickFocus>) => void;

export interface Props {
  currentTeacher: Teacher | null;
  students: Student[];
  classes: ClassGroup[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  etuts: Etut[];
  messages: StudentMessage[];
  unreadMessages: number;
  onNavigateTab: (tab: TeacherTabType) => void;
  onOpenStudentView?: () => void;
}

// ---------------------------------------------------------------- küçük yardımcılar
export const trSirala = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

export const gunNo = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
};

export const gunFark = (eski: string, yeni: string) => gunNo(yeni) - gunNo(eski);

export const sure = (dk: number) => {
  const d = Math.max(0, Math.round(dk));
  if (d < 60) return `${d} dk`;
  const s = Math.floor(d / 60);
  const k = d % 60;
  return k ? `${s} sa ${k} dk` : `${s} sa`;
};

export const ymdYerel = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Aşama 251: ders adı ile branş eşleşmesi (büyük/küçük harf ve boşluk farkı yok; "Matematik" ~ "TYT Matematik")
export const dersNorm = (x: string) => (x || '').toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '');

export const dersUyar = (a: string, b: string) => {
  const x = dersNorm(a);
  const y = dersNorm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const etutBas = (e: Etut): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.date || '');
  const t = /^(\d{1,2}):(\d{2})/.exec(e.time || '');
  if (!m || !t) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
};

export const ogrSayi = (e: Etut, toplam: number) => (e.assignedStudentIds === 'all' ? toplam : e.assignedStudentIds.length);

export const gunYazi = (t: string) => `${GUN_ADLARI[isoGun(t) - 1]}, ${tarihUzun(t)}`;

export const yasYazi = (n: number) => (n <= 0 ? 'Bugün' : `${n} gün`);

// ---------------------------------------------------------------- telefon bildirimi satırı
// PushOptInCard ile aynı kurallar ve aynı "şimdi değil" kaydı (7 gün); görünüm taslaktaki tek satır.
export const BildirimNotu: React.FC<{ yazi: string }> = ({ yazi }) => {
  const [st, setSt] = useState<PushState | null>(null);
  const [gizli, setGizli] = useState(pushOptInErtelendi);
  const [mesgul, setMesgul] = useState(false);
  const setSonuc = useBildirimKanali(); // Aşama 353: ortak bildirim
  useEffect(() => {
    let canli = true;
    void getPushState().then((s) => {
      if (!canli) return;
      setSt(s);
      if (s === 'on') void resyncPush();
    });
    return () => {
      canli = false;
    };
  }, []);
  if (!st || st === 'unsupported' || st === 'not-configured') return null;
  if (st === 'on') return null; // Aşama 353: "açıldı" yazısı ortak bildirimde
  if (gizli) return null;
  const ertele = () => {
    pushOptInErtele();
    setGizli(true);
  };
  const ac = async () => {
    setMesgul(true);
    const r = await enablePush();
    setMesgul(false);
    if (r.ok) {
      setSt('on');
      setSonuc({ ok: true, text: 'Telefon bildirimleri açıldı. Bir deneme bildirimi gönderildi.' });
      void testPush();
    } else {
      setSt(await getPushState());
      setSonuc({ ok: false, text: r.error || 'Bildirimler açılamadı.' });
    }
  };
  const metin =
    st === 'ios-install'
      ? 'iPhone’da önce Safari’de Paylaş › Ana Ekrana Ekle’yi seçin; ana ekrandaki simgeden açınca bildirimleri buradan açabilirsiniz.'
      : st === 'denied'
        ? 'Bu cihazda bildirim izni kapalı. Telefon ayarlarından izin verip sayfayı yenileyin.'
        : yazi;
  return (
    <div className="od-note" id="push-optin" data-state={st}>
      <span className="ic">
        <Bell aria-hidden="true" />
      </span>
      <span>
        {metin}
      </span>
      {st === 'off' && (
        <button type="button" className="ak-btn w-24 primary" id="push-enable" disabled={mesgul} onClick={() => void ac()}>
          {mesgul ? 'Açılıyor…' : 'Aç'}
        </button>
      )}
      <button type="button" className="x" aria-label="Şimdi değil" title="Şimdi değil (7 gün sonra tekrar sorulur)" onClick={ertele}>
        ×
      </button>
    </div>
  );
};
