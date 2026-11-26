// ============================================================================
// Aşama 394: Oyunlar — "Soru ekle" tek giriş
// Soru eklemenin bütün yolları tek pencerede, büyük kartlarla: elle yaz, yapay zekâya ürettir, ders notundan üret,
// kitaptan ekle (Aşama 407), metin yapıştır, Excel ile yükle (Aşama 395). Seçim ilgili pencereyi açar; bu pencere kapanır.
// ============================================================================
import React from 'react';
import { BookOpen, ClipboardPaste, FileSpreadsheet, FileText, PenLine, Plus, Sparkles, type LucideIcon } from 'lucide-react';
import { Modal } from '../../ui/kit';

export type SoruEkleYolu = 'yaz' | 'ai' | 'not' | 'pdf' | 'yapistir' | 'excel';

const KARTLAR: Array<{ yol: SoruEkleYolu; ad: string; acik: string; simge: LucideIcon }> = [
  { yol: 'yaz', ad: 'Elle yaz', acik: 'Soruyu ve şıkları kendin yaz. Art arda eklerken ayarlar kalır.', simge: PenLine },
  { yol: 'pdf', ad: 'Kitaptan ekle', acik: 'Test kitabı PDF’ini aç (300 MB’a kadar); sorular bulunur, doğru şıkkı işaretle.', simge: BookOpen },
  { yol: 'yapistir', ad: 'Metin yapıştır', acik: 'Word ya da kitaptan soruları yapıştır; yapay zekâ soru ve şıklara ayırsın.', simge: ClipboardPaste },
  { yol: 'excel', ad: 'Excel ile yükle', acik: 'Şablonu indir, sorularını doldur, tek seferde yükle.', simge: FileSpreadsheet },
  { yol: 'ai', ad: 'Yapay zekâ üretsin', acik: 'Kazanımı seç, sorular önerilsin; beğendiklerini ekle.', simge: Sparkles },
  { yol: 'not', ad: 'Ders notumdan üret', acik: 'Ders notu PDF’ini ver; sorular yalnız o nottan hazırlansın.', simge: FileText },
];

export const SoruEkleSecici: React.FC<{ onSec: (y: SoruEkleYolu) => void; onClose: () => void }> = ({ onSec, onClose }) => (
  <Modal open onClose={onClose} size="md" icon={Plus} title="Soru ekle" description="Soruyu nasıl eklemek istersin?">
    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {KARTLAR.map((k) => (
        <li key={k.yol}>
          <button
            type="button"
            onClick={() => onSec(k.yol)}
            className="flex h-full w-full items-start gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:border-brand hover:bg-brand-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-2">
              <k.simge className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-fg">{k.ad}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{k.acik}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  </Modal>
);
