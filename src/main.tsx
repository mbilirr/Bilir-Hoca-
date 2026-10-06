import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UpdateAvailableBanner } from './components/Common/UpdateAvailableBanner';
import './index.css';
import { installAvatarGuard } from './lib/localAvatar';
import { installEscClose } from './lib/escClose';

// Aşama 17: avatarlar dış servise gitmeden tarayıcıda çizilir; eski pencereler Esc ile kapanır
installAvatarGuard();
installEscClose();

// Sanal DOM (Virtual DOM) ve Google Translate / Browser eklentisi çakışmalarını kalıcı olarak önleme:
// 'NotFoundError: Failed to execute removeChild on Node: The node to be removed is not a child of this node'
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (console && console.warn) {
        console.warn('DOM Protection: Prevented removeChild on non-child node', child, this);
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (console && console.warn) {
        console.warn('DOM Protection: Prevented insertBefore on non-child reference node', referenceNode, this);
      }
      if (referenceNode.parentNode) {
        return referenceNode.parentNode.insertBefore(newNode, referenceNode) as T;
      }
      return this.appendChild(newNode) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

// Aşama 16: e-postadaki yoklama bağlantısı (…/?yoklama=…) giriş gerektirmeyen ayrı bir sayfa açar
const attendanceToken = (() => {
  try {
    return new URLSearchParams(window.location.search).get('yoklama');
  } catch {
    return null;
  }
})();
const EtutAttendancePage = lazy(() =>
  import('./components/Public/EtutAttendancePage').then((m) => ({ default: m.EtutAttendancePage }))
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {attendanceToken ? (
        <Suspense fallback={null}>
          <EtutAttendancePage token={attendanceToken} />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
    {!attendanceToken && <UpdateAvailableBanner />}
  </StrictMode>,
);

