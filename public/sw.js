// Service Worker:静态资源离线缓存
// 策略:
//   - /api/* 一律不缓存(数据实时性 + Cookie 鉴权)
//   - 页面导航 network-first,离线回退缓存
//   - 静态资源(带 hash 的 js/css/图标)cache-first
// 更新方式:修改本文件时同步递增 CACHE_NAME 版本号,activate 时自动清理旧缓存
const CACHE_NAME = 'nav-static-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(['/']).catch(() => {})) // 首次预缓存失败不阻塞安装
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // 页面导航:network-first,离线回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches
            .open(CACHE_NAME)
            .then((c) => c.put('/', copy))
            .catch(() => {})
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // 静态资源:cache-first,未命中则抓取并写入缓存
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches
              .open(CACHE_NAME)
              .then((c) => c.put(req, copy))
              .catch(() => {})
          }
          return res
        })
    )
  )
})
