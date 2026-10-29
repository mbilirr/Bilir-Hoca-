// ============================================================================
// UYGULAMA İÇİ ONAY / KOPYALAMA PENCERESİ (Aşama 105)
// Tarayıcının kendi confirm() / prompt() kutuları yerine sistemin küçük penceresi (ui/kit Modal, sm).
// Pencere kökü ilk kullanımda bir kez kurulur; hiç çağrılmayan oturumda hiçbir maliyeti yoktur.
// ============================================================================
import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import { Modal } from '../components/ui/kit';

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';

type Req =
  | { kind: 'confirm'; title: string; message: string; confirmText: string; danger: boolean; done: (ok: boolean) => void }
  | { kind: 'copy'; title: string; text: string; done: () => void };

let root: Root | null = null;

function show(req: Req) {
  if (!root) {
    const el = document.createElement('div');
    el.id = 'app-dialog-root';
    document.body.appendChild(el);
    root = createRoot(el);
  }
  root.render(<DialogView key={Date.now()} req={req} />);
}
function hide() {
  root?.render(null);
}

const DialogView: React.FC<{ req: Req }> = ({ req }) => {
  const [copied, setCopied] = useState(false);
  if (req.kind === 'confirm') {
    const close = (ok: boolean) => {
      hide();
      req.done(ok);
    };
    return (
      <Modal
        open
        size="sm"
        id="app-confirm"
        icon={AlertTriangle}
        tone={req.danger ? 'danger' : 'warning'}
        title={req.title}
        onClose={() => close(false)}
        footer={
          <>
            <button type="button" className={`${BTN} ui-btn-secondary`} onClick={() => close(false)}>
              Vazgeç
            </button>
            <button type="button" autoFocus className={`${BTN} ${req.danger ? 'ui-btn-danger' : 'ui-btn-primary'}`} onClick={() => close(true)} id="app-confirm-ok">
              {req.confirmText}
            </button>
          </>
        }
      >
        <p className="text-xs text-fg-2 leading-relaxed">{req.message}</p>
      </Modal>
    );
  }
  const close = () => {
    hide();
    req.done();
  };
  return (
    <Modal
      open
      size="sm"
      id="app-copy"
      icon={Copy}
      title={req.title}
      onClose={close}
      footer={
        <>
          <button type="button" className={`${BTN} ui-btn-secondary`} onClick={close}>
            Kapat
          </button>
          <button
            type="button"
            className={`${BTN} ui-btn-primary`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(req.text);
                setCopied(true);
              } catch {
                const ta = document.getElementById('app-copy-text') as HTMLTextAreaElement | null;
                ta?.select();
              }
            }}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </>
      }
    >
      <p className="text-xs text-muted mb-2">Otomatik kopyalanamadı. Metni seçip kopyalayabilirsiniz.</p>
      <textarea
        id="app-copy-text"
        readOnly
        rows={Math.min(8, req.text.split('\n').length + 1)}
        className="ui-input w-full text-xs font-mono"
        value={req.text}
        onFocus={(e) => e.currentTarget.select()}
      />
    </Modal>
  );
};

/** Onay penceresi: "Evet" ise true döner */
export function appConfirm(opts: { title: string; message: string; confirmText?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) =>
    show({ kind: 'confirm', title: opts.title, message: opts.message, confirmText: opts.confirmText || 'Evet, sil', danger: opts.danger !== false, done: resolve })
  );
}

/** Pano kullanılamadığında metni seçilebilir kutuda gösterir */
export function appCopyFallback(title: string, text: string): Promise<void> {
  return new Promise((resolve) => show({ kind: 'copy', title, text, done: resolve }));
}
