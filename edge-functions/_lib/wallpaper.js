// 必应壁纸元数据 + 图片下载/Blob 缓存(供 /api/wallpaper* 路由共用)
// 图库 = 最近 8 天必应每日一图,全部经边缘代理缓存,前端直连无跨域/墙问题
import { getKV, kvGetJSON, kvPutJSON, sha256, bytesToBase64, imageResponse } from './kv.js'

const BING_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx={IDX}&n=8'
const BING_HOST = 'https://cn.bing.com'
const META_TTL = 12 * 60 * 60 * 1000 // 元数据 12 小时刷新
const GALLERY_TTL = 12 * 60 * 60 * 1000 // 第三方源图库缓存 12 小时
const IMG_TTL = 7 * 24 * 60 * 60 * 1000 // 图片缓存 7 天
const MAX_BYTES = 2 * 1024 * 1024 // 单图上限 2MB

// 拉取必应元数据(最近 30 天,分页 idx=0/8/16/24;带 Blob 缓存,失败时回退旧缓存)
async function fetchMeta(kv) {
  let meta = await kvGetJSON(kv, 'wallpaper_meta', null)
  if (meta && Array.isArray(meta.images) && meta.images.length > 0) {
    if (Date.now() - (meta.fetchedAt || 0) < META_TTL) return meta
  }
  try {
    const seen = new Set()
    const images = []
    const results = await Promise.allSettled(
      [0, 8, 16, 24].map((idx) =>
        fetch(BING_API.replace('{IDX}', String(idx)), timeoutOpt()).then((r) => (r.ok ? r.json() : null))
      )
    )
    for (const res of results) {
      if (res.status !== 'fulfilled' || !res.value) continue
      for (const im of res.value.images || []) {
        if (!im.startdate || !im.url || seen.has(im.startdate)) continue
        seen.add(im.startdate)
        images.push({ d: im.startdate, url: im.url, urlbase: im.urlbase || '', title: im.title || '', copyright: im.copyright || '' })
      }
    }
    if (images.length > 0) {
      images.sort((a, b) => (a.d < b.d ? 1 : -1))
      meta = { fetchedAt: Date.now(), images }
      kvPutJSON(kv, 'wallpaper_meta', meta).catch(() => {})
    }
  } catch (_e) {
    // 网络失败:沿用旧缓存
  }
  return meta
}

function timeoutOpt() {
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return { signal: AbortSignal.timeout(12000) }
  } catch { /* 忽略 */ }
  return {}
}

// 多源图库列表(供设置面板选择;图片前端直连,后端只出元数据)
// source: bing(最近30天) / picsum(Lorem Picsum) / wallhaven(搜索)
export async function getGallery(kv, source, q, page) {
  // 搜索词需 URL 编码:COS 对含空格等特殊字符的对象键会 502
  const key = `wp_gallery_${source}_${page}_${encodeURIComponent(String(q || ''))}`
  const cached = await kvGetJSON(kv, key, null)
  if (cached && Array.isArray(cached.gallery) && cached.gallery.length && Date.now() - (cached.t || 0) < GALLERY_TTL) {
    return cached.gallery
  }
  let gallery = null
  if (source === 'bing') {
    const meta = await fetchMeta(kv)
    if (meta && Array.isArray(meta.images)) {
      gallery = meta.images.map((im) => {
        const idm = im.url.match(/th\?id=([^&]+)/)
        const full = BING_HOST + im.url
        const thumb = idm ? `${BING_HOST}/th?id=${idm[1]}&w=416&h=234&c=7` : full
        return { id: im.d, title: im.copyright || im.title, thumb, url: full }
      })
    }
  } else if (source === 'picsum') {
    const r = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=30`, timeoutOpt()).catch(() => null)
    if (r && r.ok) {
      const list = await r.json().catch(() => null)
      gallery = (Array.isArray(list) ? list : []).map((im) => ({
        id: `picsum_${im.id}`,
        title: `${im.author} · ${im.width}x${im.height}`,
        thumb: `https://picsum.photos/id/${im.id}/416/234`,
        url: `https://picsum.photos/id/${im.id}/1920/1080`
      }))
    }
  } else if (source === 'wallhaven') {
    const qs = new URLSearchParams({ q, categories: '100', purity: '100', atleast: '1920x1080', sorting: 'relevancy', page: String(page) })
    const r = await fetch(`https://wallhaven.cc/api/v1/search?${qs}`, timeoutOpt()).catch(() => null)
    if (r && r.ok) {
      const d = await r.json().catch(() => null)
      gallery = ((d && d.data) || []).map((im) => ({
        id: `wh_${im.id}`,
        title: `Wallhaven ${im.id} · ${(im.colors || []).join(' ')}`,
        thumb: (im.thumbs && im.thumbs.small) || '',
        url: im.path
      })).filter((x) => x.thumb)
    }
  }
  if (gallery && gallery.length) {
    kvPutJSON(kv, key, { gallery, t: Date.now() }).catch(() => {})
    return gallery
  }
  // 失败回退旧缓存
  return cached && Array.isArray(cached.gallery) ? cached.gallery : null
}

// 按日期下载必应图并写入 Blob
async function downloadBingImage(kv, key, date8) {
  const meta = await fetchMeta(kv)
  const item = meta?.images?.find((im) => im.d === date8)
  if (!item) return null

  const res = await fetch(BING_HOST + item.url)
  if (!res.ok) return null
  const buf = await res.arrayBuffer()
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null

  const rec = {
    d: bytesToBase64(buf),
    ct: (res.headers.get('content-type') || 'image/jpeg').split(';')[0],
    t: Date.now()
  }
  kvPutJSON(kv, key, rec).catch(() => {})
  return rec
}

// 输出某天必应壁纸(缓存未过期直出;过期先刷新,失败回退旧缓存)
export async function serveBingImage(kv, date8) {
  if (!kv || !/^\d{8}$/.test(date8)) return null
  const key = `wallpaper_img_${date8}`
  const cached = await kvGetJSON(kv, key, null)
  if (cached && cached.d) {
    if (Date.now() - (cached.t || 0) < IMG_TTL) return imageResponse(cached.d, cached.ct)
    const fresh = await downloadBingImage(kv, key, date8).catch(() => null)
    if (fresh) return imageResponse(fresh.d, fresh.ct)
    return imageResponse(cached.d, cached.ct)
  }
  const fresh = await downloadBingImage(kv, key, date8).catch(() => null)
  return fresh ? imageResponse(fresh.d, fresh.ct) : null
}

// 通用图片代理(自定义壁纸 URL,任意 http/https 图片,缓存 7 天)
export async function serveProxiedImage(kv, rawUrl) {
  if (!kv || !rawUrl) return null
  let u
  try {
    u = new URL(String(rawUrl))
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  ) {
    return null // 阻断内网地址
  }

  const hash = await sha256(String(rawUrl))
  const key = `wallpaper_u_${hash.slice(0, 32)}`
  const cached = await kvGetJSON(kv, key, null)
  if (cached && cached.d && Date.now() - (cached.t || 0) < IMG_TTL) {
    return imageResponse(cached.d, cached.ct)
  }

  try {
    const res = await fetch(u.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NavWallpaperBot/1.0)' }
    })
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok || !ct.startsWith('image/')) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null

    const rec = { d: bytesToBase64(buf), ct: ct.split(';')[0], t: Date.now() }
    kvPutJSON(kv, key, rec).catch(() => {})
    return imageResponse(rec.d, rec.ct)
  } catch (_e) {
    // 拉取失败时回退旧缓存
    if (cached && cached.d) return imageResponse(cached.d, cached.ct)
    return null
  }
}
