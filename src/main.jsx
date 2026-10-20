import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// A refused or locked sign-in comes back to the site with an error in the web address (for example
// an email with no invitation, or a deactivated account). The router redirects before the login
// page loads and would drop it, so keep the details for the login page to explain, then tidy the
// address. Only runs when an error is present, so a normal sign-in is never touched.
try {
  const fromQuery = new URLSearchParams(window.location.search);
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const pick = (key) => fromQuery.get(key) || fromHash.get(key);
  if (pick('error') || pick('error_description')) {
    sessionStorage.setItem(
      'mymadrich:auth_error',
      JSON.stringify({
        error: pick('error'),
        code: pick('error_code'),
        description: pick('error_description'),
      }),
    );
    window.history.replaceState(null, '', window.location.pathname);
  }
} catch {
  // Storage unavailable (some private modes): the login page just shows no extra detail
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register service worker for PWA installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.warn('SW registration failed:', err);
      });
  });
}
