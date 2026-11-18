
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary'; // Import ErrorBoundary
import './index.css'; 
import { installSafeStorageGlobalPolyfill } from './utils/safeStorage';
import { installGlobalApiFetchInterceptor } from './services/apiService';

// Protect against localStorage QuotaExceededError crashes everywhere
installSafeStorageGlobalPolyfill();
// Ensure relative API calls resolve to real server domain on Tauri Desktop and Capacitor Android
installGlobalApiFetchInterceptor();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

(window as any).__APP_MOUNTED__ = true;

// Lazy-hydrate legacy PDF/canvas globals after initial paint to minimize boot memory on older iPhones
setTimeout(() => {
  import('html2canvas').then((m) => {
    (window as any).html2canvas = m.default || m;
  }).catch(() => {});
  import('jspdf').then((m) => {
    (window as any).jspdf = { jsPDF: m.jsPDF };
  }).catch(() => {});
}, 600);
