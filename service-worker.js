/* =========================================================
   Al-Atmawi Sweets — Service Worker (العمل بدون إنترنت)
   - ملفات الموقع: من النت أولًا (عشان التحديثات توصل فورًا)،
     ولو ما في نت بتنفتح النسخة المحفوظة.
   - صور المنتجات والخطوط: من الذاكرة أولًا (أسرع وبتشتغل بدون نت).
   - طلبات Firebase (Firestore / تسجيل الدخول) ما بنلمسها أبدًا.
========================================================= */
const SHELL_CACHE = "atmawi-shell-v1";
const IMAGE_CACHE = "atmawi-images-v1"; // نفس الاسم المستعمل بـ script.js
const MAX_IMAGES = 600;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./firebase/firebase-app.js",
  "./firebase/firebase-firestore.js",
  "./firebase/firebase-auth.js",
  "./firebase/firebase-analytics.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // ملف ناقص ما بيوقف التثبيت
    await Promise.allSettled(SHELL_FILES.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, IMAGE_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith("atmawi-") && !keep.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

function isFirebaseApi(url) {
  return /(^|\.)googleapis\.com$/.test(url.hostname) && !url.hostname.startsWith("fonts.")
    || url.hostname.endsWith("firebaseio.com")
    || url.hostname.endsWith("firebaseapp.com")
    || url.hostname.includes("google-analytics.com")
    || url.hostname.includes("googletagmanager.com");
}

function isCacheFirstAsset(url) {
  return url.hostname === "res.cloudinary.com"
    || url.hostname === "fonts.googleapis.com"
    || url.hostname === "fonts.gstatic.com";
}

async function trimImageCache() {
  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_IMAGES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map(k => cache.delete(k)));
}

async function cacheFirst(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request.url, { ignoreVary: true });
  if (cached) return cached;
  let response;
  try {
    // نجيبها بوضع CORS عشان تنحفظ بحجمها الحقيقي (الردود المخفية بتاكل مساحة كبيرة)
    response = await fetch(request.url, { mode: "cors", credentials: "omit" });
  } catch {
    response = await fetch(request);
  }
  if (response && response.ok) {
    cache.put(request.url, response.clone()).then(trimImageCache).catch(() => {});
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const page = await cache.match("./index.html") || await cache.match("./");
      if (page) return page;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (isFirebaseApi(url)) return; // Firestore و Auth بيتعاملوا مع النت بنفسهم

  if (isCacheFirstAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  }
});
