// GET /api/favicon?u=<域名或URL>  -> 站点图标服务端代理 + Blob 缓存
// 解决国内直连 Google s2 / favicon 服务慢的问题:
// 首次由边缘节点抓取并缓存到 Blob(7 天 TTL),之后所有客户端直接命中缓存
// 需登录(由全局中间件保证),<img> 同源请求自动携带 Cookie
import { getKV, kvGetJSON, kvPutJSON, bytesToBase64, base64ToBytes, errorResponse } from '../_lib/kv.js'

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 缓存 7 天
const MAX_BYTES = 300 * 1024 // 上游图标最大 300KB
const UPSTREAMS = [
  (host) => `https://a.favicon.im/${host}`,
  (host) => `https://favicon.cccyun.cc/${host}`,
  (host) => `https://${host}/favicon.ico`
]

// 提取并校验域名,阻断内网地址(SSRF)
function extractHost(raw) {
  if (!raw) return ''
  let host = String(raw).trim()
  try {
    if (host.includes('://')) host = new URL(host).hostname
  } catch {
    return ''
  }
  host = host.toLowerCase().replace(/:\d+$/, '')
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return ''
  }
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  ) {
    return ''
  }
  return host
}

function iconResponse(data, contentType) {
  return new Response(base64ToBytes(data), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400' // 浏览器侧再缓存 1 天
    }
  })
}

export async function onRequestGet({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const url = new URL(request.url)
  const host = extractHost(url.searchParams.get('u'))
  if (!host) return errorResponse('无效的域名参数 u', 400)

  const key = `favicon_${host}`
  const cached = await kvGetJSON(kv, key, null)
  if (cached && cached.d && cached.ct) {
    if (Date.now() - (cached.t || 0) < CACHE_TTL) {
      return iconResponse(cached.d, cached.ct)
    }
    // 缓存过期:尝试刷新,失败则回退旧缓存
    const fresh = await fetchAndCache(kv, key, host).catch(() => null)
    if (fresh) return iconResponse(fresh.d, fresh.ct)
    return iconResponse(cached.d, cached.ct)
  }

  const fresh = await fetchAndCache(kv, key, host).catch(() => null)
  if (!fresh) return errorResponse('图标获取失败', 404)
  return iconResponse(fresh.d, fresh.ct)
}

// 依次尝试上游服务,成功则写入 Blob 缓存
async function fetchAndCache(kv, key, host) {
  for (const build of UPSTREAMS) {
    try {
      const res = await fetch(build(host), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NavFaviconBot/1.0)' }
      })
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (!res.ok || !ct.startsWith('image/')) continue
      const buf = await res.arrayBuffer()
      if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) continue

      const record = { d: bytesToBase64(buf), ct, t: Date.now() }
      await kvPutJSON(kv, key, record)
      return record
    } catch (_e) {
      continue
    }
  }
  return null
}
