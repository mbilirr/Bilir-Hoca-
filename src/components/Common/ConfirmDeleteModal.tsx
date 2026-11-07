import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from '../ui/kit';

// Aşama 190: ortak Modal üzerine taşındı. Esc ve arka plana tıklama yalnız bu pencereyi kapatır,
// arka plan kaymaz, düğmeler sistemdeki alt düğmelerle aynı boyda. Onay penceresi her zaman en üstte açılır.
interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  itemBadge?: string;
  confirmButtonText?: string;
  isDanger?: boolean;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemBadge,
  confirmButtonText = 'Evet, Sil',
  isDanger = true,
}) => (
  <Modal
    open={isOpen}
    onClose={onClose}
    size="sm"
    icon={AlertTriangle}
    tone={isDanger ? 'danger' : 'warning'}
    title={title}
    description={
      itemBadge ? (
        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-2 text-fg-2 border border-line">{itemBadge}</span>
      ) : undefined
    }
    layerClass="z-[10001]"
    footer={
      <>
        <button type="button" autoFocus onClick={onClose} className="ui-btn ui-btn-secondary">
          Vazgeç
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={isDanger ? 'ui-btn ui-btn-danger' : 'ui-btn ui-btn-warning'}
        >
          <Trash2 /> {confirmButtonText}
        </button>
      </>
    }
  >
    <p className="text-xs text-fg-2 leading-relaxed">{description}</p>
  </Modal>
);
