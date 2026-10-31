// Service Worker for Runyankore Translator PWA - FIXED (Preserves offline)
const CACHE_NAME = 'runyankore-translator-v3.2';
const OFFLINE_CACHE = 'offline-db-v3';

// URLs to cache for offline use
const urlsToCache = [
  '/',
  '/about-developer',  // Cache this page too
  '/static/css/style.css',
  '/static/css/about-developer.css', 
  '/static/css/admin.css',
  '/static/js/script.js',
  '/static/js/pwa-install.js',
  '/static/js/admin.js',
  '/static/js/trash.js',
  '/static/js/offline-database-simple.js',
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  '/static/images/david.jpg',
  '/static/manifest.webmanifest',
  // Add offline database files
  '/static/data/offline_dictionary.json',
  '/static/data/offline_dictionary_version.json',
];

// Install event - Cache ALL critical assets (UNCHANGED)
self.addEventListener('install', event => {
  console.log('📦 Service Worker: Installing v3.2...');
  
  event.waitUntil(
    self.skipWaiting().then(() => {
      console.log('✅ Skipped waiting, claiming clients');
      
      return Promise.all([
        // Cache app shell
        caches.open(CACHE_NAME).then(cache => {
          console.log('📦 Caching app shell for offline');
          
          return Promise.all(urlsToCache.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`⚠️ Could not cache ${url}:`, err);
            });
          }));
        }),
        
        // Cache offline database
        caches.open(OFFLINE_CACHE).then(cache => {
          console.log('📦 Caching offline database');
          return cache.addAll([
            '/static/data/offline_dictionary.json',
            '/static/data/offline_dictionary_version.json',
          ]);
        })
      ]);
    })
    .then(() => {
      console.log('✅ All resources cached successfully');
    })
    .catch(error => {
      console.error('❌ Install failed:', error);
    })
  );
});

// Activate event - Clean up old caches (UNCHANGED)
self.addEventListener('activate', event => {
  console.log('✨ Service Worker: Activating v3.2...');
  
  event.waitUntil(
    Promise.all([
      // Delete old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_CACHE) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Claim clients immediately
      self.clients.claim()
    ])
    .then(() => {
      console.log('✅ Service Worker activated and claiming clients');
    })
  );
});

// ========== FIXED FETCH HANDLER - Preserves offline, fixes navigation ==========
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const request = event.request;
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip chrome extensions and non-HTTP protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  
  // ========== FIX: Handle navigation requests SMARTLY ==========
  if (request.mode === 'navigate') {
    console.log('🌐 Navigation request detected:', url.pathname);
    
    // For the main app pages (/, /about-developer), use cache-first
    if (url.pathname === '/' || url.pathname === '/about-developer') {
      event.respondWith(
        caches.match(request).then(cachedResponse => {
          if (cachedResponse) {
            console.log('📁 Serving cached page:', url.pathname);
            
            // Try to fetch fresh content in background
            if (navigator.onLine) {
              fetch(request)
                .then(networkResponse => {
                  if (networkResponse.ok) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                      cache.put(request, responseClone);
                      console.log('🔄 Updated cache for:', url.pathname);
                    });
                  }
                })
                .catch(() => {
                  // Network failed - that's okay, we have cache
                });
            }
            
            return cachedResponse;
          }
          
          // If no cache, fetch from network
          return fetch(request)
            .then(networkResponse => {
              // Cache for next time
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone);
              });
              return networkResponse;
            })
            .catch(error => {
              console.error('❌ Network failed for:', url.pathname);
              
              // For main page (/), return the simple offline fallback
              if (url.pathname === '/') {
                return new Response(`
                  <!DOCTYPE html>
                  <html lang="en">
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Runyankore Translator - Offline</title>
                    <style>
                      body {
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 50px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                      }
                      .offline-icon {
                        font-size: 48px;
                        margin-bottom: 20px;
                      }
                      h1 { font-size: 2.5rem; margin-bottom: 20px; }
                      p { font-size: 1.2rem; margin-bottom: 30px; max-width: 500px; }
                      .reload-btn {
                        background: white;
                        color: #667eea;
                        border: none;
                        padding: 12px 30px;
                        font-size: 1rem;
                        border-radius: 25px;
                        cursor: pointer;
                        font-weight: bold;
                        margin-top: 20px;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="offline-icon">📱</div>
                    <h1>You're Offline</h1>
                    <p>The Runyankore Translator requires an initial internet connection to load.</p>
                    <p>Please connect to the internet, reload the app once, then you can use it offline.</p>
                    <button class="reload-btn" onclick="window.location.reload()">Reload App</button>
                  </body>
                  </html>
                `, {
                  headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-cache'
                  }
                });
              }
              
              // For other pages, try to serve index.html as fallback
              return caches.match('/').then(fallbackResponse => {
                return fallbackResponse || new Response('Offline', { status: 503 });
              });
            });
        })
      );
      return; // Exit early
    }
    
    // ========== FIX: For admin pages, DON'T intercept - let them go to server ==========
    if (url.pathname.startsWith('/admin')) {
      console.log('🔓 Allowing admin navigation to:', url.pathname);
      return; // Let the browser handle this normally
    }
    
    // For any other navigation, use cache-first strategy
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request))
        .catch(() => caches.match('/'))
        .catch(() => new Response('Offline', { status: 503 }))
    );
    return;
  }
  
  // ========== OFFLINE DICTIONARY - Cache busting (UNCHANGED) ==========
  if (url.pathname.includes('offline_dictionary')) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        return fetch(request, {cache: 'no-cache'})
          .then(networkResponse => {
            const responseClone = networkResponse.clone();
            caches.open(OFFLINE_CACHE)
              .then(cache => cache.put(request, responseClone));
            return networkResponse;
          })
          .catch(() => {
            if (cachedResponse) {
              console.log('📁 Serving offline dictionary from cache');
              return cachedResponse;
            }
            throw new Error('Offline dictionary not available');
          });
      })
    );
    return;
  }
  
  // ========== STATIC ASSETS - Cache First (UNCHANGED) ==========
  if (url.pathname.startsWith('/static/') || 
      url.pathname === '/manifest.webmanifest' ||
      url.pathname === '/service-worker.js') {
    
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(request).then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // ========== API REQUESTS - Network First (UNCHANGED) ==========
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => response)
        .catch(() => {
          return new Response(JSON.stringify({
            success: false,
            error: 'offline',
            message: 'You are offline. Using offline features only.'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  // ========== DEFAULT STRATEGY (UNCHANGED) ==========
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
      .catch(() => {
        return new Response('Offline - Please check your connection', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});

// ========== MESSAGE HANDLER FOR KEEP-ALIVE (UNCHANGED) ==========
self.addEventListener('message', event => {
  if (event.data === 'keepAlive' || event.data === 'wakeUp') {
    console.log('💓 Keep-alive message received');
    event.ports[0].postMessage({ alive: true });
  }
});

// ========== BACKGROUND SYNC (OPTIONAL ENHANCEMENT) (UNCHANGED) ==========
self.addEventListener('sync', event => {
  if (event.tag === 'sync-translations') {
    console.log('🔄 Background sync triggered');
    event.waitUntil(syncPendingTranslations());
  }
});

async function syncPendingTranslations() {
  console.log('Syncing pending translations...');
  return Promise.resolve();
}