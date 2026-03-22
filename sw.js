const CACHE_NAME = "gider-takip-v2";
const CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js";

const PRECACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  CHART_JS_URL,
];

self.addEventListener("install", (event) => {
  const local = PRECACHE.filter((u) => u.startsWith(".") || u.startsWith("/"));
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(local).then(() => cache.add(CHART_JS_URL).catch(() => {}))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (url.href === CHART_JS_URL) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(CHART_JS_URL).then((cached) =>
          cached || fetch(event.request).then((res) => {
            if (res.ok) cache.put(CHART_JS_URL, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }

  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith(".json") && !url.pathname.includes("manifest")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((res) => {
          if (res.ok && event.request.method === "GET") {
            cache.put(event.request, res.clone());
          }
          return res;
        });
        return cached || fetchPromise;
      })
    )
  );
});
