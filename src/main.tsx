import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { lazyNamed } from './lib/lazyLoad'; // Aşama 370: yeni sürümde eksik parça → sayfa bir kez yenilenir
import { ErrorBoundary } from './components/ErrorBoundary';
import { UpdateAvailableBanner } from './components/Common/UpdateAvailableBanner';
import './index.css';
import { installAvatarGuard } from './lib/localAvatar';
import { installEscClose } from './lib/escClose';
import { installIntlCache } from './lib/intlCache';
import { installAutofillGuard } from './lib/autofillGuard';
import { installHataKaydi } from './lib/hataKaydi';
import { acikKalDevam } from './lib/kurumGecis';

// Aşama 293: yakalanmamış hatalar kendi veritabanımıza yazılır (sistem sahibi Yönetim › Yedek ve bakım'da görür)
installHataKaydi();

// Aşama 84: tarih biçimlendirme ve Türkçe sıralama için kurulan biçimlendiriciler tekrar kullanılır (listeler hızlanır)
installIntlCache();

// Aşama 17: avatarlar dış servise gitmeden tarayıcıda çizilir; eski pencereler Esc ile kapanır
installAvatarGuard();
installEscClose();

// Aşama 225 (HIZ): sayfa kaydırılırken sürekli yanıp sönen ışıklar (yeni bilgi parıltısı, canlı nokta) duraklatılır;
// kaydırma bitince ~0,2 sn sonra kaldıkları yerden devam eder. Ölçümde bu ışıklar kaydırırken her karede yeniden
// hesaplanıyordu (telefonda ana sayfa kaydırmasında boşa iş). Görünüm aynı.
(() => {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    timer = null;
    root.removeAttribute('data-scrolling');
  };
  const onScroll = () => {
    if (!timer) root.setAttribute('data-scrolling', '');
    else clearTimeout(timer);
    timer = setTimeout(stop, 200);
  };
  // capture: sayfa içindeki kaydırılan kutular (listeler, pencereler) da sayılır
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
})();

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
const EtutAttendancePage = lazyNamed(() => import('./components/Public/EtutAttendancePage'), 'EtutAttendancePage');
// Aşama 22: e-postadaki haftalık plan bağlantısı (…/?plan=…) öğrencinin giriş yapmadan görev işaretlediği sayfayı açar
const planToken = (() => {
  try {
    return attendanceToken ? null : new URLSearchParams(window.location.search).get('plan');
  } catch {
    return null;
  }
})();
const PlanMarkPage = lazyNamed(() => import('./components/Public/PlanMarkPage'), 'PlanMarkPage');
// Aşama 381: öğretmenin oyun bağlantısı (…/?oyun=…) öğrencinin giriş yapmadan oynadığı sayfayı açar
const oyunToken = (() => {
  try {
    return attendanceToken || planToken ? null : new URLSearchParams(window.location.search).get('oyun');
  } catch {
    return null;
  }
})();
const OyunOynaPage = lazyNamed(() => import('./components/Public/OyunOynaPage'), 'OyunOynaPage');
const isPublicPage = !!(attendanceToken || planToken || oyunToken);

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

// Aşama 295: "Bu cihazda açık kal" oturumu varsa yeni sekmede önce o kurulur (giriş ekranı bir an bile görünmez).
// Öbür bütün açılışlarda (kutu işaretsiz, sayfa yenileme, herkese açık sayfalar) beklemeden hemen çizilir.
const ciz = () =>
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
      ) : oyunToken ? (
        <Suspense fallback={null}>
          <OyunOynaPage token={oyunToken} />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
    {!isPublicPage && <UpdateAvailableBanner />}
  </StrictMode>,
);
if (isPublicPage) ciz();
else void acikKalDevam().then(ciz, ciz);
