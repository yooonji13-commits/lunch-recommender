const CACHE_NAME = "lunch-app-shell-v3";
const SHELL_FILES = [
  "./index.html",
  "./manifest.json",
  "./css/style.css?v=2",
  "./js/app.js?v=2",
  "./js/config.js?v=2",
  "./icons/icon-192-v2.png",
  "./icons/icon-512-v2.png",
  "./icons/apple-touch-icon-v2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 앱 셸(정적 파일)은 네트워크 우선(항상 최신 버전 시도) + 오프라인일 때만 캐시로 대체
// 카카오 API 등 외부 요청은 그대로 네트워크로 통과
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
