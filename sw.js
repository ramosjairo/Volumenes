// Incremento de versión a v5.6 para refrescar la caché tras la separación modular
const CACHE_NAME = 'cuadrilla-cache-v5.6';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icono-192.png',
  './icono-512.png',
  './logo.png',
  './novedades.json'
];

// 1. Instalar el Service Worker y almacenar los archivos esenciales en la caché local
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Guardando archivos en caché local para uso offline...');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activar el Service Worker y limpiar cachés antiguas si las hubiera
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Eliminando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Interceptar las peticiones: Estrategia Cache First (Priorizar Caché sobre Internet)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Devuelve el archivo local inmediatamente
      }
      
      // Si no está en caché, intenta buscarlo en la red
      return fetch(event.request).catch(() => {
        // Fallback estricto fuera de línea: si es una petición de navegación/HTML, sirve index.html
        if (event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
        console.log('El recurso solicitado no está disponible offline:', event.request.url);
      });
    })
  );
});