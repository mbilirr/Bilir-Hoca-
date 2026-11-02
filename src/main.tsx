import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UpdateAvailableBanner } from './components/Common/UpdateAvailableBanner';
import './index.css';
import { installAvatarGuard } from './lib/localAvatar';
import { installEscClose } from './lib/escClose';
import { installIntlCache } from './lib/intlCache';
import { installAutofillGuard } from './lib/autofillGuard';

// Aşama 84: tarih biçimlendirme ve Türkçe sıralama için kurulan biçimlendiriciler tekrar kullanılır (listeler hızlanır)
installIntlCache();

// Aşama 17: avatarlar dış servise gitmeden tarayıcıda çizilir; eski pencereler Esc ile kapanır
installAvatarGuard();
installEscClose();

// Aşama 136: arama ve form kutularında tarayıcı kayıtlı e-posta/şifre önermesin (giriş ekranı hariç)
installAutofillGuard();

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
// Aşama 22: e-postadaki haftalık plan bağlantısı (…/?plan=…) öğrencinin giriş yapmadan görev işaretlediği sayfayı açar
const planToken = (() => {
  try {
    return attendanceToken ? null : new URLSearchParams(window.location.search).get('plan');
  } catch {
    return null;
  }
})();
const PlanMarkPage = lazy(() => import('./components/Public/PlanMarkPage').then((m) => ({ default: m.PlanMarkPage })));
const isPublicPage = !!(attendanceToken || planToken);

// Aşama 124: uygulama dosyaları (/assets) cihazda tutulsun diye servis çalışanı açılışta (boşta) kaydedilir.
// Bildirim izni İSTEMEZ; yalnız kayıt. Sayfanın kendisi (index.html) her zaman sunucudan gelir.
if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext) {
  const registerSw = () => {
    navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => reg || navigator.serviceWorker.register('/sw.js', { scope: '/' }))
      .catch(() => {
        /* desteklenmiyor / engelli: site normal çalışır */
      });
  };
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => number);
  window.addEventListener('load', () => (ric ? ric(registerSw, { timeout: 8000 }) : setTimeout(registerSw, 3000)), { once: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {attendanceToken ? (
        <Suspense fallback={null}>
          <EtutAttendancePage token={attendanceToken} />
        </Suspense>
      ) : planToken ? (
        <Suspense fallback={null}>
          <PlanMarkPage token={planToken} />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
    {!isPublicPage && <UpdateAvailableBanner />}
  </StrictMode>,
);

