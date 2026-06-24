/**
 * MyMadrich Service Worker
 *
 * Minimal service worker for PWA installability (Add to Home Screen).
 * Caches the app shell (HTML, CSS, JS, fonts, emblem assets) using a
 * network-first strategy so updates always arrive promptly.
 *
 * CRITICAL: Supabase auth, REST API, and realtime endpoints are never
 * cached. All requests to the Supabase domain pass straight through
 * to the network. This prevents stale auth tokens, expired sessions,
 * or cached API responses from breaking the app.
 */

const CACHE_NAME = 'mymadrich-v1';

// Only cache the app shell and static assets
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './chizuk-emblem-gold.png',
];

// Domains and URL patterns that must NEVER be cached
const BYPASS_PATTERNS = [
  'supabase.co',
  'supabase.in',
  '/auth/',
  '/rest/',
  '/realtime/',
  '/storage/',
  '/functions/',
  'googleapis.com',
  'accounts.google.com',
];

function shouldBypass(url) {
  return BYPASS_PATTERNS.some((pattern) => url.includes(pattern));
}

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLS);
    })
  );
  // Activate immediately (don't wait for old SW to finish)
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch: network-first for everything, fallback to cache for navigation
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never intercept non-GET requests
  if (event.request.method !== 'GET') return;

  // Never cache Supabase, auth, or API requests
  if (shouldBypass(url)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for app shell resources
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache on network failure
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, return the cached index.html (SPA)
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
