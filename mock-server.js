/**
 * 本地 Mock 服务器 - 模拟 Edge Functions API
 * 运行在 8088 端口,Vite dev server 会把 /api 请求代理到此
 * 使用内存存储(重启后数据清空),仅用于本地 UI 测试
 */
import http from 'node:http'

const PORT = 8088

// === 内存存储 ===
const store = new Map()

function getKV() {
  return {
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : String(value))
    },
    async get(key, options = {}) {
      const raw = store.get(key)
      if (raw === undefined || raw === null) return null
      const type = options.type || (typeof options === 'string' ? options : 'text')
      if (type === 'json') {
        try {
          return JSON.parse(raw)
        } catch {
          return null
        }
      }
      return raw
    },
    async delete(key) {
      store.delete(key)
    },
    async list(options = {}) {
      const prefix = options.prefix || ''
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((key) => ({ key }))
      return { complete: true, cursor: null, blobs: keys.map((k) => ({ key: k })) }
    }
  }
}

// === 工具函数 ===
const SALT = 'nav_personal_2026'
const TOKEN_TTL_SECONDS = 7 * 24 * 3600

function encodePassword(text) {
  return Buffer.from(SALT + ':' + text, 'utf-8').toString('base64')
}

function decodePassword(encoded) {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const idx = decoded.indexOf(':')
    if (idx === -1) return ''
    return decoded.slice(idx + 1)
  } catch {
    return ''
  }
}

function randomToken() {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function shortId() {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function parseCookies(cookieHeader) {
  const out = {}
  if (!cookieHeader) return out
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=')
    if (idx === -1) return
    const k = pair.slice(0, idx).trim()
    const v = pair.slice(idx + 1).trim()
    out[k] = decodeURIComponent(v)
  })
  return out
}

function jsonResponse(res, data, init = {}) {
  const body = JSON.stringify(data)
  res.writeHead(init.status || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...init.headers
  })
  res.end(body)
}

function errorResponse(res, message, status = 400) {
  jsonResponse(res, { error: message }, { status })
}

function imageBytes(res, buf, contentType) {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400'
  })
  res.end(buf)
}

// 二进制缓存(图标/壁纸,内存版,重启清空)
const imgCache = new Map()
const hotCache = new Map() // 热榜缓存: source -> {items, updated, t}
const weatherCache = new Map() // 天气缓存: city -> {data, t}
const holidayCache = new Map() // 节假日缓存: year -> {year, days, t}
let rateCache = null // 汇率缓存: {rates, updated, date, base, t}

// WMO weather code -> [中文文案, 图标 key]
function wmoCode(code) {
  const m = {
    0: ['晴', 'sun'], 1: ['晴', 'sun'], 2: ['多云', 'partly'], 3: ['阴', 'cloud'],
    45: ['雾', 'fog'], 48: ['雾凇', 'fog'],
    51: ['毛毛雨', 'drizzle'], 53: ['毛毛雨', 'drizzle'], 55: ['毛毛雨', 'drizzle'],
    56: ['冻雨', 'rain'], 57: ['冻雨', 'rain'],
    61: ['小雨', 'rain'], 63: ['中雨', 'rain'], 65: ['大雨', 'rain'],
    66: ['冻雨', 'rain'], 67: ['冻雨', 'rain'],
    71: ['小雪', 'snow'], 73: ['中雪', 'snow'], 75: ['大雪', 'snow'], 77: ['雪粒', 'snow'],
    80: ['阵雨', 'showers'], 81: ['阵雨', 'showers'], 82: ['强阵雨', 'showers'],
    85: ['阵雪', 'snow'], 86: ['阵雪', 'snow'],
    95: ['雷阵雨', 'thunder'], 96: ['雷雨冰雹', 'thunder'], 99: ['雷雨冰雹', 'thunder']
  }
  const hit = m[code] || ['未知', 'cloud']
  return { text: hit[0], icon: hit[1] }
}

// 必应图库元数据缓存(12 小时);扩展为最近 30 天(分页 idx=0/8/16/24)
let bingMeta = null
async function getBingMeta() {
  if (bingMeta && Array.isArray(bingMeta.images) && bingMeta.images.length > 0) {
    if (Date.now() - bingMeta.fetchedAt < 12 * 3600 * 1000) return bingMeta
  }
  const seen = new Set()
  const images = []
  const pages = [0, 8, 16, 24]
  const results = await Promise.allSettled(
    pages.map((idx) =>
      fetch(`https://cn.bing.com/HPImageArchive.aspx?format=js&idx=${idx}&n=8`, { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : null))
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
    images.sort((a, b) => (a.d < b.d ? 1 : -1)) // 最新在前
    bingMeta = { fetchedAt: Date.now(), images }
  }
  return bingMeta
}

// 壁纸图库缓存(source+page+q -> {gallery, t},12 小时)
const wpCache = new Map()
async function fetchWallpaperGallery(source, q, page) {
  const key = `${source}|${page}|${q}`
  const cached = wpCache.get(key)
  if (cached && Date.now() - cached.t < 12 * 3600 * 1000) return cached.gallery
  let gallery = null
  if (source === 'bing') {
    const meta = await getBingMeta()
    if (meta) {
      gallery = meta.images.map((im) => {
        // url 形如 /th?id=OHR.xxx_1920x1080.jpg&rf=...;缩略图用 th 服务压缩
        const idm = im.url.match(/th\?id=([^&]+)/)
        const full = `https://cn.bing.com${im.url}`
        const thumb = idm ? `https://cn.bing.com/th?id=${idm[1]}&w=416&h=234&c=7` : full
        return { id: im.d, title: im.copyright || im.title, thumb, url: full }
      })
    }
  } else if (source === 'picsum') {
    // Lorem Picsum(Unsplash 精选镜像),免费无 key
    const r = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=30`, { signal: AbortSignal.timeout(10000) })
    if (r.ok) {
      const list = await r.json()
      gallery = (Array.isArray(list) ? list : []).map((im) => ({
        id: `picsum_${im.id}`,
        title: `${im.author} · ${im.width}x${im.height}`,
        thumb: `https://picsum.photos/id/${im.id}/416/234`,
        url: `https://picsum.photos/id/${im.id}/1920/1080`
      }))
    }
  } else if (source === 'wallhaven') {
    // Wallhaven 搜索(免费无 key;境内直连可能需要网络环境)
    const qs = new URLSearchParams({ q, categories: '100', purity: '100', atleast: '1920x1080', sorting: 'relevancy', page: String(page) })
    const r = await fetch(`https://wallhaven.cc/api/v1/search?${qs}`, { signal: AbortSignal.timeout(12000) })
    if (r.ok) {
      const d = await r.json()
      gallery = ((d && d.data) || []).map((im) => ({
        id: `wh_${im.id}`,
        title: `Wallhaven ${im.id} · ${(im.colors || []).join(' ')}`,
        thumb: (im.thumbs && im.thumbs.small) || '',
        url: im.path
      })).filter((x) => x.thumb)
    }
  }
  if (gallery && gallery.length) wpCache.set(key, { gallery, t: Date.now() })
  return gallery
}

async function parseBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf-8')
  if (!text) return null
  return JSON.parse(text)
}

async function isAuthenticated(req) {
  const kv = getKV()
  const cookies = parseCookies(req.headers.cookie || '')
  const token = cookies.nav_token
  if (!token) return { ok: false, reason: '未登录' }
  const record = await kv.get(`token_${token}`, { type: 'json' })
  if (!record) return { ok: false, reason: 'token 无效' }
  const now = Date.now()
  if (record.expiresAt && record.expiresAt < now) {
    await kv.delete(`token_${token}`)
    return { ok: false, reason: 'token 已过期' }
  }
  return { ok: true, record }
}

// === 默认配置 ===
const DEFAULT_CONFIG = {
  title: '我的导航',
  background: { type: 'color', value: '#1f2937' },
  backgroundBlur: 0,
  backgroundMask: 0.35,
  theme: 'dark',
  defaultEngine: 'baidu',
  engines: [
    { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=' },
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
    { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=' },
    { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com/search?q=' },
    { id: 'bilibili', name: '哔哩哔哩', url: 'https://search.bilibili.com/all?keyword=' },
    { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=' }
  ],
  openInNewTab: true
}

// === 数据胶囊 S3 客户端(SigV4,Web Crypto;与 edge-functions/_lib/s3.js 同源) ===
const S3_EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

function s3ToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function s3Sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return s3ToHex(await crypto.subtle.digest('SHA-256', buf))
}

async function s3Hmac(keyData, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    typeof keyData === 'string' ? new TextEncoder().encode(keyData) : keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return new Uint8Array(sig)
}

function amzEncode(str, encodeSlash = true) {
  let out = ''
  for (const ch of str) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch
    } else if (ch === '/') {
      out += encodeSlash ? '%2F' : '/'
    } else {
      const bytes = new TextEncoder().encode(ch)
      for (const b of bytes) out += '%' + b.toString(16).toUpperCase().padStart(2, '0')
    }
  }
  return out
}

// 对象键路径编码:斜杠保留,仅编码段内字符
function encodeKeyPath(key) {
  return key.split('/').map((s) => amzEncode(s)).join('/')
}

function s3AmzDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z'
  )
}

async function s3Request(cfg, opts = {}) {
  const { endpoint, region, bucket, ak, sk, ua } = cfg
  const method = (opts.method || 'GET').toUpperCase()
  const key = (opts.key || '').replace(/^\/+/, '')
  const tries = opts.tries || 3
  const host = endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const canonicalUri = '/' + bucket + (key ? '/' + encodeKeyPath(key) : '')
  const query = opts.query || {}
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => amzEncode(k) + '=' + amzEncode(String(query[k])))
    .join('&')
  const body = opts.body != null ? String(opts.body) : ''
  const payloadHash = body ? await s3Sha256Hex(body) : S3_EMPTY_SHA
  const url = `${endpoint}/${bucket}${key ? '/' + encodeKeyPath(key) : ''}` +
    (canonicalQuery ? '?' + canonicalQuery : '')

  let lastErr = null
  for (let i = 0; i < tries; i++) {
    const now = new Date()
    const xAmzDate = s3AmzDate(now)
    const dateStamp = xAmzDate.slice(0, 8)
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${xAmzDate}\n`
    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
    const scope = `${dateStamp}/${region}/s3/aws4_request`
    const stringToSign = ['AWS4-HMAC-SHA256', xAmzDate, scope, await s3Sha256Hex(canonicalRequest)].join('\n')
    const kDate = await s3Hmac('AWS4' + sk, dateStamp)
    const kRegion = await s3Hmac(kDate, region)
    const kService = await s3Hmac(kRegion, 's3')
    const kSigning = await s3Hmac(kService, 'aws4_request')
    const signature = s3ToHex(await s3Hmac(kSigning, stringToSign))

    const headers = {
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': xAmzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${ak}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
    if (ua) headers['User-Agent'] = ua
    if (body) {
      headers['Content-Type'] = opts.contentType || 'application/json; charset=utf-8'
      headers['Content-Length'] = String(new TextEncoder().encode(body).length)
    }

    try {
      const res = await fetch(url, { method, headers, body: body || undefined })
      const text = await res.text()
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`S3 ${res.status}: ${text.slice(0, 200)}`)
        if (i < tries - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1) * (i + 1)))
        continue
      }
      return { ok: res.ok, status: res.status, text }
    } catch (e) {
      lastErr = e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1) * (i + 1)))
    }
  }
  return { ok: false, status: 0, text: 'S3 请求失败: ' + (lastErr ? lastErr.message : String(lastErr)) }
}

function parseListXml(xml) {
  const out = []
  const re = /<Contents>([\s\S]*?)<\/Contents>/g
  let m
  while ((m = re.exec(xml))) {
    const block = m[1]
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
      return t ? t[1] : ''
    }
    out.push({ key: pick('Key'), size: Number(pick('Size')) || 0, lastModified: pick('LastModified') })
  }
  return { objects: out }
}

// === 云备份共享逻辑 ===
const CLOUD_CONFIG_KEY = 'cloud_backup'
const CLOUD_DEFAULTS = {
  endpoint: 'https://s3.cstcloud.cn',
  region: 'us-east-1',
  bucket: '',
  ak: '',
  sk: '',
  ua: 'rclone/v1.66.0',
  prefix: 'personal-tab/',
  auto: false,
  keep: 30,
  lastBackupAt: 0
}

function cloudMaskSk(sk) {
  if (!sk) return ''
  if (sk.length <= 8) return '****'
  return sk.slice(0, 4) + '****' + sk.slice(-4)
}

function cloudS3Cfg(c) {
  return { endpoint: c.endpoint, region: c.region, bucket: c.bucket, ak: c.ak, sk: c.sk, ua: c.ua }
}

function cloudExcluded(key) {
  return key.startsWith('token_') || key === CLOUD_CONFIG_KEY
}

async function cloudLoadCfg(kv) {
  const saved = await kv.get(CLOUD_CONFIG_KEY, { type: 'json' })
  return { ...CLOUD_DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) }
}

async function cloudSnapshot(kv) {
  const data = {}
  for (const key of Array.from(store.keys())) {
    if (cloudExcluded(key)) continue
    const v = store.get(key)
    if (v != null) data[key] = v
  }
  return data
}

function cloudTsName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  )
}

async function cloudListAndPrune(cfg) {
  const prefix = cfg.prefix || CLOUD_DEFAULTS.prefix
  const res = await s3Request(cloudS3Cfg(cfg), {
    method: 'GET',
    query: { 'list-type': 2, prefix, 'max-keys': 1000 }
  })
  if (!res.ok) throw new Error('列取备份失败(' + res.status + '): ' + res.text.slice(0, 120))
  const mine = parseListXml(res.text).objects
    .filter((o) => o.key.startsWith(prefix) && o.key.endsWith('.json'))
    .sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1))
  const keep = Number(cfg.keep) || 30
  for (const o of mine.slice(keep)) {
    await s3Request(cloudS3Cfg(cfg), { method: 'DELETE', key: o.key })
  }
  return mine
}

// === 路由处理 ===
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname
  const method = req.method

  // 鉴权检查(除登录/检查外)
  const publicPaths = ['/api/auth/login', '/api/auth/check', '/api/auth/logout', '/api/health', '/api/init']
  if (!publicPaths.includes(path)) {
    const auth = await isAuthenticated(req)
    if (!auth.ok) {
      // 登录页需要检查密码状态,特殊处理
      if (path === '/api/auth/check') {
        // 允许未登录时访问
      } else {
        // 对于 API 请求返回 401
        if (path.startsWith('/api/')) {
          return errorResponse(res, '未登录', 401)
        }
      }
    }
  }

  try {
    // === 健康检查 ===
    if (path === '/api/health' && method === 'GET') {
      return jsonResponse(res, { ok: true, mode: 'mock' })
    }

    // === 认证 ===
    if (path === '/api/auth/check' && method === 'GET') {
      const auth = await isAuthenticated(req)
      const kv = getKV()
      let passwordSet = false
      const stored = await kv.get('auth_password', { type: 'json' })
      passwordSet = !!(stored && stored.value)
      return jsonResponse(res, {
        loggedIn: auth.ok,
        reason: auth.ok ? null : auth.reason,
        passwordSet
      })
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req)
      const password = (body?.password || '').trim()
      if (!password) return errorResponse(res, '密码不能为空')
      const kv = getKV()
      const stored = await kv.get('auth_password', { type: 'json' })

      if (!stored || !stored.value) {
        // 首次设置密码
        await kv.put('auth_password', JSON.stringify({ value: encodePassword(password), createdAt: Date.now() }))
        const token = randomToken()
        const now = Date.now()
        await kv.put(`token_${token}`, JSON.stringify({ createdAt: now, expiresAt: now + TOKEN_TTL_SECONDS * 1000 }))
        const cookie = `nav_token=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Strict`
        return jsonResponse(res, { ok: true, firstSetup: true, expiresAt: now + TOKEN_TTL_SECONDS * 1000 }, {
          headers: { 'Set-Cookie': cookie }
        })
      }

      // 校验密码
      const decoded = decodePassword(stored.value)
      if (decoded !== password) {
        // 兼容旧版 SHA-256 密码
        if (stored.sha256) {
          const data = new TextEncoder().encode(password)
          const hashBuffer = await crypto.subtle.digest('SHA-256', data)
          const hash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
          if (hash === stored.value) {
            // 密码正确,升级为 base64 格式
            await kv.put('auth_password', JSON.stringify({ value: encodePassword(password), createdAt: Date.now() }))
          } else {
            return errorResponse(res, '密码错误', 401)
          }
        } else {
          return errorResponse(res, '密码错误', 401)
        }
      }

      // 登录成功
      const token = randomToken()
      const now = Date.now()
      // 后台写入 token(不阻塞)
      kv.put(`token_${token}`, JSON.stringify({ createdAt: now, expiresAt: now + TOKEN_TTL_SECONDS * 1000 }))
      const cookie = `nav_token=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Strict`
      return jsonResponse(res, { ok: true, firstSetup: false, expiresAt: now + TOKEN_TTL_SECONDS * 1000 }, {
        headers: { 'Set-Cookie': cookie }
      })
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const auth = await isAuthenticated(req)
      if (auth.ok && auth.record) {
        const cookies = parseCookies(req.headers.cookie || '')
        const token = cookies.nav_token
        if (token) {
          const kv = getKV()
          kv.delete(`token_${token}`)
        }
      }
      const cookie = 'nav_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict'
      return jsonResponse(res, { ok: true }, { headers: { 'Set-Cookie': cookie } })
    }

    // === 一次请求返回登录态 + 配置 + 全部分组(与边缘版 /api/init 对齐) ===
    if (path === '/api/init' && method === 'GET') {
      const auth = await isAuthenticated(req)
      const kv = getKV()
      const stored = await kv.get('auth_password', { type: 'json' })
      const passwordSet = !!(stored && stored.value)
      if (!auth.ok) {
        return jsonResponse(res, { loggedIn: false, reason: auth.reason, passwordSet, config: null, groups: [] })
      }
      const config = await kv.get('config', { type: 'json' })
      const groupsIndex = ((await kv.get('groups_index', { type: 'json' })) || []).sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0)
      )
      const groups = []
      for (const g of groupsIndex) {
        const data = await kv.get(`group_${g.id}`, { type: 'json' })
        groups.push({
          id: g.id,
          name: g.name,
          sort: g.sort,
          bookmarks: Array.isArray(data?.bookmarks) ? data.bookmarks : []
        })
      }
      return jsonResponse(res, {
        loggedIn: true,
        reason: null,
        passwordSet,
        config: { ...DEFAULT_CONFIG, ...(config || {}) },
        groups
      })
    }

    // === 配置 ===
    if (path === '/api/config' && method === 'GET') {
      const kv = getKV()
      const config = await kv.get('config', { type: 'json' })
      if (!config) {
        await kv.put('config', JSON.stringify(DEFAULT_CONFIG))
        return jsonResponse(res, DEFAULT_CONFIG)
      }
      return jsonResponse(res, { ...DEFAULT_CONFIG, ...config })
    }

    if (path === '/api/config' && method === 'PUT') {
      const body = await parseBody(req)
      const kv = getKV()
      await kv.put('config', JSON.stringify(body))
      return jsonResponse(res, { ok: true })
    }

    // === 分组 ===
    if (path === '/api/groups' && method === 'GET') {
      const kv = getKV()
      const groupsIndex = await kv.get('groups_index', { type: 'json' })
      if (!Array.isArray(groupsIndex) || groupsIndex.length === 0) {
        return jsonResponse(res, { groups: [] })
      }
      groupsIndex.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      const groups = []
      for (const g of groupsIndex) {
        const data = await kv.get(`group_${g.id}`, { type: 'json' })
        groups.push({
          id: g.id,
          name: g.name,
          sort: g.sort,
          icon: data?.icon || '',
          bookmarks: Array.isArray(data?.bookmarks) ? data.bookmarks : []
        })
      }
      return jsonResponse(res, { groups })
    }

    if (path === '/api/groups' && method === 'POST') {
      const body = await parseBody(req)
      const name = (body?.name || '').trim()
      if (!name) return errorResponse(res, '分组名称不能为空', 400)
      const icon = typeof body?.icon === 'string' ? body.icon.slice(0, 32) : ''
      const kv = getKV()
      const groupsIndex = (await kv.get('groups_index', { type: 'json' })) || []
      const id = shortId()
      const sort = groupsIndex.length
      groupsIndex.push({ id, name, sort })
      await kv.put('groups_index', JSON.stringify(groupsIndex))
      await kv.put(`group_${id}`, JSON.stringify({ id, name, icon, sort, bookmarks: [] }))
      return jsonResponse(res, { ok: true, group: { id, name, icon, sort, bookmarks: [] } })
    }

    // 分组操作 (按 ID)
    const groupMatch = path.match(/^\/api\/groups\/([^/]+)$/)
    if (groupMatch) {
      const id = groupMatch[1]
      if (method === 'PUT') {
        const body = await parseBody(req)
        const kv = getKV()
        const groupsIndex = (await kv.get('groups_index', { type: 'json' })) || []
        if (body.name !== undefined) {
          const g = groupsIndex.find((x) => x.id === id)
          if (g) g.name = body.name
        }
        if (typeof body.icon === 'string') {
          // 图标存在 group 详情里
          const data = await kv.get(`group_${id}`, { type: 'json' })
          if (data) {
            await kv.put(`group_${id}`, JSON.stringify({ ...data, icon: body.icon.slice(0, 32) }))
          }
        }
        if (body.sort !== undefined) {
          const g = groupsIndex.find((x) => x.id === id)
          if (g) g.sort = body.sort
        }
        if (body.allSorts) {
          for (const s of body.allSorts) {
            const g = groupsIndex.find((x) => x.id === s.id)
            if (g) g.sort = s.sort
          }
        }
        await kv.put('groups_index', JSON.stringify(groupsIndex))
        return jsonResponse(res, { ok: true })
      }
      if (method === 'DELETE') {
        const kv = getKV()
        const groupsIndex = (await kv.get('groups_index', { type: 'json' })) || []
        const idx = groupsIndex.findIndex((g) => g.id === id)
        if (idx === -1) return errorResponse(res, '分组不存在', 404)
        groupsIndex.splice(idx, 1)
        // 重新排序
        groupsIndex.forEach((g, i) => (g.sort = i))
        await kv.put('groups_index', JSON.stringify(groupsIndex))
        await kv.delete(`group_${id}`)
        return jsonResponse(res, { ok: true })
      }
    }

    // 书签操作
    const bookmarkMatch = path.match(/^\/api\/groups\/([^/]+)\/bookmarks$/)
    if (bookmarkMatch) {
      const id = bookmarkMatch[1]
      if (method === 'POST') {
        const body = await parseBody(req)
        const name = (body?.name || '').trim()
        const url = (body?.url || '').trim()
        if (!name || !url) return errorResponse(res, '名称和 URL 不能为空', 400)
        const kv = getKV()
        const group = await kv.get(`group_${id}`, { type: 'json' })
        if (!group) return errorResponse(res, '分组不存在', 404)
        const bookmarks = Array.isArray(group.bookmarks) ? group.bookmarks : []
        const bid = shortId()
        bookmarks.push({
          id: bid,
          name,
          url,
          icon: body?.icon || '',
          desc: body?.desc || '',
          sort: bookmarks.length,
          clicks: 0,
          createdAt: Date.now(),
          favorite: !!body?.favorite
        })
        await kv.put(`group_${id}`, JSON.stringify({ ...group, bookmarks }))
        return jsonResponse(res, { ok: true, bookmark: bookmarks[bookmarks.length - 1] })
      }
      if (method === 'PUT') {
        const body = await parseBody(req)
        if (!Array.isArray(body?.bookmarks)) {
          return errorResponse(res, 'bookmarks 必须是数组', 400)
        }
        const kv = getKV()
        const group = await kv.get(`group_${id}`, { type: 'json' })
        if (!group) return errorResponse(res, '分组不存在', 404)
        const cleaned = body.bookmarks.map((b, i) => ({
          id: b.id || shortId(),
          name: (b.name || '').toString(),
          url: (b.url || '').toString(),
          icon: b.icon || '',
          desc: b.desc || '',
          sort: i,
          clicks: Number(b.clicks) || 0,
          createdAt: b.createdAt || Date.now(),
          favorite: !!b.favorite
        }))
        await kv.put(`group_${id}`, JSON.stringify({ ...group, bookmarks: cleaned }))
        return jsonResponse(res, { ok: true, bookmarks: cleaned })
      }
    }

    // === 备份 ===
    if (path === '/api/backup' && method === 'GET') {
      const kv = getKV()
      const config = (await kv.get('config', { type: 'json' })) || DEFAULT_CONFIG
      const groupsIndex = (await kv.get('groups_index', { type: 'json' })) || []
      const groups = []
      for (const g of groupsIndex) {
        const data = await kv.get(`group_${g.id}`, { type: 'json' })
        groups.push({
          id: g.id,
          name: g.name,
          sort: g.sort,
          bookmarks: Array.isArray(data?.bookmarks) ? data.bookmarks : []
        })
      }
      const backup = {
        version: 2,
        exportedAt: new Date().toISOString(),
        config,
        groups
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="nav-backup-${Date.now()}.json"`
      })
      res.end(JSON.stringify(backup, null, 2))
      return
    }

    if (path === '/api/backup' && method === 'POST') {
      const body = await parseBody(req)
      if (!body) return errorResponse(res, '请求体为空', 400)
      const kv = getKV()
      if (body.config) await kv.put('config', JSON.stringify(body.config))
      if (body.groups && Array.isArray(body.groups)) {
        const groupsIndex = body.groups.map((g, i) => ({ id: g.id, name: g.name, sort: i }))
        await kv.put('groups_index', JSON.stringify(groupsIndex))
        for (const g of body.groups) {
          await kv.put(`group_${g.id}`, JSON.stringify(g))
        }
      }
      return jsonResponse(res, { ok: true, count: body.groups?.length || 0 })
    }

    // === 云盘备份(数据胶囊 S3) ===
    if (path === '/api/cloud' && method === 'GET') {
      const cfg = await cloudLoadCfg(getKV())
      const { sk, ...rest } = cfg
      return jsonResponse(res, { ...rest, skSet: !!sk, skMask: cloudMaskSk(sk) })
    }

    if (path === '/api/cloud' && method === 'PUT') {
      const body = await parseBody(req)
      if (!body || typeof body !== 'object') return errorResponse(res, '配置必须是对象', 400)
      const kv = getKV()
      const cur = await cloudLoadCfg(kv)
      const next = {
        ...cur,
        endpoint: (body.endpoint || cur.endpoint).toString().trim().replace(/\/+$/, ''),
        region: (body.region || cur.region).toString().trim(),
        bucket: (body.bucket != null ? body.bucket : cur.bucket).toString().trim(),
        ak: (body.ak != null ? body.ak : cur.ak).toString().trim(),
        sk: body.sk ? body.sk.toString() : cur.sk,
        ua: (body.ua || cur.ua).toString().trim() || CLOUD_DEFAULTS.ua,
        prefix: ((body.prefix != null ? body.prefix : cur.prefix).toString().trim().replace(/^\/+/, '') || CLOUD_DEFAULTS.prefix),
        auto: !!body.auto
      }
      if (!next.prefix.endsWith('/')) next.prefix += '/'
      await kv.put(CLOUD_CONFIG_KEY, JSON.stringify(next))
      const { sk, ...rest } = next
      return jsonResponse(res, { ok: true, ...rest, skSet: !!sk, skMask: cloudMaskSk(sk) })
    }

    if (path === '/api/cloud' && method === 'POST') {
      const body = await parseBody(req)
      const action = body && body.action
      const kv = getKV()
      const cfg = await cloudLoadCfg(kv)
      if (!cfg.bucket || !cfg.ak || !cfg.sk) {
        return errorResponse(res, '尚未配置云盘信息(端点/Bucket/AK/SK)', 400)
      }
      try {
        if (action === 'test') {
          const r = await s3Request(cloudS3Cfg(cfg), {
            method: 'GET',
            query: { 'list-type': 2, prefix: cfg.prefix, 'max-keys': 1 }
          })
          if (!r.ok) return jsonResponse(res, { ok: false, error: `连接失败(HTTP ${r.status}) ${r.text.slice(0, 120)}` })
          return jsonResponse(res, { ok: true, message: '连接成功' })
        }

        if (action === 'run') {
          const data = await cloudSnapshot(kv)
          const meta = { app: 'personal-tab', version: 1, exportedAt: new Date().toISOString(), keys: Object.keys(data).length }
          const payload = JSON.stringify({ meta, data })
          const key = `${cfg.prefix}backup-${cloudTsName()}.json`
          const r = await s3Request(cloudS3Cfg(cfg), { method: 'PUT', key, body: payload })
          if (!r.ok) return jsonResponse(res, { ok: false, error: `上传失败(HTTP ${r.status}) ${r.text.slice(0, 120)}` })
          const size = new TextEncoder().encode(payload).length
          const list = await cloudListAndPrune(cfg)
          const next = { ...cfg, lastBackupAt: Date.now() }
          await kv.put(CLOUD_CONFIG_KEY, JSON.stringify(next))
          return jsonResponse(res, { ok: true, key, size, count: meta.keys, lastBackupAt: next.lastBackupAt, backups: list.slice(0, 50) })
        }

        if (action === 'list') {
          const list = await cloudListAndPrune(cfg)
          return jsonResponse(res, { ok: true, backups: list.slice(0, 50) })
        }

        if (action === 'restore') {
          const key = (body.key || '').toString()
          const prefix = cfg.prefix || CLOUD_DEFAULTS.prefix
          if (!key.startsWith(prefix) || key.includes('..')) return errorResponse(res, '非法的备份文件名', 400)
          const r = await s3Request(cloudS3Cfg(cfg), { method: 'GET', key })
          if (!r.ok) return jsonResponse(res, { ok: false, error: `读取备份失败(HTTP ${r.status}) ${r.text.slice(0, 120)}` })
          let parsed
          try {
            parsed = JSON.parse(r.text)
          } catch {
            return errorResponse(res, '备份文件损坏(非合法 JSON)', 400)
          }
          const data = parsed && parsed.data
          if (!data || typeof data !== 'object') return errorResponse(res, '备份文件格式不正确', 400)
          let count = 0
          for (const [k, v] of Object.entries(data)) {
            if (cloudExcluded(k) || typeof v !== 'string') continue
            await kv.put(k, v)
            count++
          }
          return jsonResponse(res, { ok: true, count, exportedAt: parsed.meta && parsed.meta.exportedAt })
        }

        return errorResponse(res, '未知操作: ' + action, 400)
      } catch (e) {
        return jsonResponse(res, { ok: false, error: e.message || String(e) })
      }
    }

    // === 跨分组移动书签(后端单次原子完成) ===
    const moveMatch = path.match(/^\/api\/groups\/([^/]+)\/move$/)
    if (moveMatch && method === 'POST') {
      const body = await parseBody(req)
      const fromId = moveMatch[1]
      const toId = body?.toGroupId
      const bid = body?.bookmarkId
      if (!toId || !bid) return errorResponse(res, '缺少 bookmarkId 或 toGroupId', 400)
      if (fromId === toId) return errorResponse(res, '源分组与目标分组相同', 400)
      const kv = getKV()
      const from = await kv.get(`group_${fromId}`, { type: 'json' })
      const to = await kv.get(`group_${toId}`, { type: 'json' })
      if (!from || !to) return errorResponse(res, '分组不存在', 404)
      const fromBm = Array.isArray(from.bookmarks) ? from.bookmarks : []
      const idx = fromBm.findIndex((b) => b.id === bid)
      if (idx === -1) return errorResponse(res, '书签不存在', 404)
      const [moved] = fromBm.splice(idx, 1)
      const toBm = Array.isArray(to.bookmarks) ? to.bookmarks : []
      toBm.push({ ...moved, favorite: false, sort: toBm.length })
      await kv.put(`group_${fromId}`, JSON.stringify({ ...from, bookmarks: fromBm }))
      await kv.put(`group_${toId}`, JSON.stringify({ ...to, bookmarks: toBm }))
      return jsonResponse(res, { ok: true })
    }

    // === 便签 ===
    if (path === '/api/notes' && method === 'GET') {
      const kv = getKV()
      const notes = (await kv.get('notes', { type: 'json' })) || []
      return jsonResponse(res, { notes: Array.isArray(notes) ? notes : [] })
    }
    if (path === '/api/notes' && method === 'POST') {
      const body = await parseBody(req)
      const kv = getKV()
      const notes = (await kv.get('notes', { type: 'json' })) || []
      const note = {
        id: shortId(),
        content: (body?.content || '').trim(),
        bgColor: body.bgColor || '#fef08a',
        textColor: body.textColor || '#1e293b',
        x: body.x ?? 100,
        y: body.y ?? 100,
        width: body.width ?? 200,
        height: body.height ?? 180,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      notes.push(note)
      await kv.put('notes', JSON.stringify(notes))
      return jsonResponse(res, { ok: true, note })
    }
    if (path === '/api/notes' && method === 'PUT') {
      const body = await parseBody(req)
      if (!Array.isArray(body?.notes)) return errorResponse(res, 'notes 必须是数组', 400)
      const cleaned = body.notes
        .filter((n) => n && typeof n === 'object' && typeof n.id === 'string' && n.id)
        .slice(0, 500)
      await getKV().put('notes', JSON.stringify(cleaned))
      return jsonResponse(res, { ok: true })
    }
    const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/)
    if (noteMatch && method === 'PUT') {
      const body = await parseBody(req)
      const kv = getKV()
      const notes = (await kv.get('notes', { type: 'json' })) || []
      const idx = notes.findIndex((n) => n.id === noteMatch[1])
      if (idx === -1) return errorResponse(res, '便利贴不存在', 404)
      for (const k of ['content', 'bgColor', 'textColor', 'x', 'y', 'width', 'height']) {
        if (body[k] !== undefined) notes[idx][k] = body[k]
      }
      notes[idx].updatedAt = Date.now()
      await kv.put('notes', JSON.stringify(notes))
      return jsonResponse(res, { ok: true })
    }
    if (noteMatch && method === 'DELETE') {
      const kv = getKV()
      const notes = (await kv.get('notes', { type: 'json' })) || []
      const idx = notes.findIndex((n) => n.id === noteMatch[1])
      if (idx === -1) return errorResponse(res, '便利贴不存在', 404)
      notes.splice(idx, 1)
      await kv.put('notes', JSON.stringify(notes))
      return jsonResponse(res, { ok: true })
    }

    // === 待办 ===
    if (path === '/api/todos' && method === 'GET') {
      const todos = (await getKV().get('todos', { type: 'json' })) || []
      const lists = (await getKV().get('todo_lists', { type: 'json' })) || []
      return jsonResponse(res, {
        todos: Array.isArray(todos) ? todos : [],
        lists: Array.isArray(lists) ? lists : []
      })
    }
    if (path === '/api/todos' && method === 'POST') {
      const body = await parseBody(req)
      const text = (body?.text || '').trim()
      if (!text) return errorResponse(res, '内容不能为空', 400)
      const kv = getKV()
      const todos = (await kv.get('todos', { type: 'json' })) || []
      const todo = {
        id: shortId(),
        text,
        done: false,
        important: !!body?.important,
        listId: body?.listId || null,
        createdAt: Date.now(),
        completedAt: null
      }
      todos.push(todo)
      await kv.put('todos', JSON.stringify(todos))
      return jsonResponse(res, { ok: true, todo })
    }
    // === 清单 CRUD ===
    if (path === '/api/todos/lists' && method === 'GET') {
      const lists = (await getKV().get('todo_lists', { type: 'json' })) || []
      return jsonResponse(res, { lists: Array.isArray(lists) ? lists : [] })
    }
    if (path === '/api/todos/lists' && method === 'POST') {
      const body = await parseBody(req)
      const name = (body?.name || '').trim()
      if (!name) return errorResponse(res, '清单名称不能为空', 400)
      const kv = getKV()
      const lists = (await kv.get('todo_lists', { type: 'json' })) || []
      const list = { id: shortId(), name }
      lists.push(list)
      await kv.put('todo_lists', JSON.stringify(lists))
      return jsonResponse(res, { ok: true, list })
    }
    if (path === '/api/todos/lists' && method === 'PUT') {
      const body = await parseBody(req)
      const id = new URL(req.url, 'http://x').searchParams.get('id')
      const name = (body?.name || '').trim()
      if (!id || !name) return errorResponse(res, '缺少清单ID或名称', 400)
      const kv = getKV()
      const lists = (await kv.get('todo_lists', { type: 'json' })) || []
      const list = lists.find((l) => l.id === id)
      if (!list) return errorResponse(res, '清单不存在', 404)
      list.name = name
      await kv.put('todo_lists', JSON.stringify(lists))
      return jsonResponse(res, { ok: true })
    }
    if (path === '/api/todos/lists' && method === 'DELETE') {
      const id = new URL(req.url, 'http://x').searchParams.get('id')
      if (!id) return errorResponse(res, '缺少清单ID', 400)
      const kv = getKV()
      const lists = (await kv.get('todo_lists', { type: 'json' })) || []
      const idx = lists.findIndex((l) => l.id === id)
      if (idx === -1) return errorResponse(res, '清单不存在', 404)
      lists.splice(idx, 1)
      await kv.put('todo_lists', JSON.stringify(lists))
      // 清单下待办移回默认
      const todos = (await kv.get('todos', { type: 'json' })) || []
      let changed = false
      for (const t of todos) {
        if (t.listId === id) {
          t.listId = null
          changed = true
        }
      }
      if (changed) await kv.put('todos', JSON.stringify(todos))
      return jsonResponse(res, { ok: true })
    }
    const todoMatch = path.match(/^\/api\/todos\/([^/]+)$/)
    if (todoMatch && method === 'PUT') {
      const body = await parseBody(req)
      const kv = getKV()
      const todos = (await kv.get('todos', { type: 'json' })) || []
      const t = todos.find((x) => x.id === todoMatch[1])
      if (!t) return errorResponse(res, '待办不存在', 404)
      if (body.text !== undefined) t.text = body.text
      if (body.done !== undefined) {
        t.done = !!body.done
        t.completedAt = t.done ? Date.now() : null
      }
      if (body.important !== undefined) t.important = !!body.important
      if (body.listId !== undefined) t.listId = body.listId || null
      await kv.put('todos', JSON.stringify(todos))
      return jsonResponse(res, { ok: true })
    }
    if (todoMatch && method === 'DELETE') {
      const kv = getKV()
      const todos = (await kv.get('todos', { type: 'json' })) || []
      const idx = todos.findIndex((x) => x.id === todoMatch[1])
      if (idx === -1) return errorResponse(res, '待办不存在', 404)
      todos.splice(idx, 1)
      await kv.put('todos', JSON.stringify(todos))
      return jsonResponse(res, { ok: true })
    }

    // === UI 状态 ===
    if (path === '/api/ui' && method === 'GET') {
      const ui = (await getKV().get('ui_state', { type: 'json' })) || {}
      return jsonResponse(res, ui)
    }
    if (path === '/api/ui' && method === 'PUT') {
      const body = await parseBody(req)
      if (!body || typeof body !== 'object') return errorResponse(res, '请求体格式错误', 400)
      await getKV().put('ui_state', JSON.stringify(body))
      return jsonResponse(res, { ok: true })
    }

    // === favicon 代理(内存缓存) ===
    if (path === '/api/favicon' && method === 'GET') {
      const u = url.searchParams.get('u')
      if (!u || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u)) return errorResponse(res, '参数 u 无效', 400)
      const key = `favicon_${u}`
      const cached = imgCache.get(key)
      if (cached) return imageBytes(res, cached.buf, cached.ct)
      const upstreams = [
        `https://a.favicon.im/${u}`,
        `https://favicon.cccyun.cc/${u}`,
        `https://${u}/favicon.ico`
      ]
      for (const src of upstreams) {
        try {
          const r = await fetch(src, { signal: AbortSignal.timeout(8000) })
          if (!r.ok) continue
          const ct = (r.headers.get('content-type') || '').toLowerCase()
          if (!ct.startsWith('image/')) continue
          const ab = await r.arrayBuffer()
          if (ab.byteLength === 0 || ab.byteLength > 1024 * 1024) continue
          const rec = { buf: Buffer.from(ab), ct: ct.split(';')[0] }
          imgCache.set(key, rec)
          return imageBytes(res, rec.buf, rec.ct)
        } catch {
          // 尝试下一个上游
        }
      }
      return errorResponse(res, '图标获取失败', 404)
    }

    // === 法定节假日+调休(holiday-cn 开源数据,jsdelivr -> raw 兜底;内存缓存 24h) ===
    if (path === '/api/holiday' && method === 'GET') {
      const y = parseInt(url.searchParams.get('year') || '', 10)
      if (!y || y < 2004 || y > 2100) return errorResponse(res, '参数 year 无效', 400)
      const hc = holidayCache.get(y)
      if (hc && Date.now() - hc.t < 24 * 3600 * 1000) return jsonResponse(res, { year: hc.year, days: hc.days })
      const timeoutOpt = () => ({ signal: AbortSignal.timeout(8000) })
      const sources = [
        `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
        `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${y}.json`
      ]
      let lastErr = null
      for (const src of sources) {
        try {
          const r = await fetch(src, timeoutOpt())
          if (!r.ok) throw new Error('HTTP ' + r.status)
          const d = await r.json()
          if (!Array.isArray(d.days)) throw new Error('数据格式无效')
          const days = d.days
            .filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date || ''))
            .map((x) => ({ date: x.date, name: String(x.name || ''), off: x.isOffDay !== false }))
          const rec = { year: d.year || y, days }
          holidayCache.set(y, { ...rec, t: Date.now() })
          return jsonResponse(res, rec)
        } catch (e) {
          lastErr = e
        }
      }
      if (hc && Array.isArray(hc.days)) return jsonResponse(res, { year: hc.year, days: hc.days })
      return errorResponse(res, '节假日数据获取失败: ' + (lastErr && lastErr.message), 502)
    }

    // === 天气(Open-Meteo 免 key 代理;内存缓存 30min) ===
    if (path === '/api/weather' && method === 'GET') {
      const city = (url.searchParams.get('city') || '').trim()
      if (!city || city.length > 40) return errorResponse(res, '参数 city 无效', 400)
      const ck = city.toLowerCase()
      const wc = weatherCache.get(ck)
      if (wc && Date.now() - wc.t < 30 * 60 * 1000) return jsonResponse(res, wc.data)

      const timeoutOpt = () => ({ signal: AbortSignal.timeout(8000) })
      try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`
        const gr = await fetch(geoUrl, timeoutOpt())
        if (!gr.ok) throw new Error('城市定位失败(' + gr.status + ')')
        const gd = await gr.json()
        const g = gd && Array.isArray(gd.results) ? gd.results[0] : null
        if (!g || typeof g.latitude !== 'number') throw new Error(`未找到城市「${city}」`)

        const qs = new URLSearchParams({
          latitude: String(g.latitude),
          longitude: String(g.longitude),
          current: 'temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m,surface_pressure,precipitation',
          hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
          timezone: 'auto',
          forecast_days: '7',
          forecast_hours: '24'
        })
        const wr = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`, timeoutOpt())
        if (!wr.ok) throw new Error('天气获取失败(' + wr.status + ')')
        const wd = await wr.json()
        const c = wd.current || {}
        const cw = wmoCode(c.weather_code)
        const hTimes = (wd.hourly && wd.hourly.time) || []
        const hourly = hTimes.map((t, i) => {
          const hw = wmoCode(wd.hourly.weather_code[i])
          const pop = wd.hourly.precipitation_probability ? wd.hourly.precipitation_probability[i] : null
          return {
            time: t,
            temp: Math.round(wd.hourly.temperature_2m[i]),
            text: hw.text,
            icon: hw.icon,
            pop: typeof pop === 'number' ? pop : null,
            isDay: wd.hourly.is_day ? wd.hourly.is_day[i] === 1 : true
          }
        })
        const daily = ((wd.daily && wd.daily.time) || []).map((t, i) => {
          const dw = wmoCode(wd.daily.weather_code[i])
          return {
            date: t,
            text: dw.text,
            icon: dw.icon,
            max: Math.round(wd.daily.temperature_2m_max[i]),
            min: Math.round(wd.daily.temperature_2m_min[i]),
            sunrise: (wd.daily.sunrise && wd.daily.sunrise[i]) || '',
            sunset: (wd.daily.sunset && wd.daily.sunset[i]) || '',
            pop: typeof wd.daily.precipitation_probability_max[i] === 'number' ? wd.daily.precipitation_probability_max[i] : null,
            windMax: typeof wd.daily.wind_speed_10m_max[i] === 'number' ? Math.round(wd.daily.wind_speed_10m_max[i]) : null,
            uv: typeof wd.daily.uv_index_max[i] === 'number' ? Math.round(wd.daily.uv_index_max[i]) : null
          }
        })
        const data = {
          city: g.name,
          admin: g.admin1 || '',
          current: {
            temp: Math.round(c.temperature_2m),
            feels: Math.round(c.apparent_temperature),
            text: cw.text,
            icon: cw.icon,
            humidity: Math.round(c.relative_humidity_2m),
            wind: Math.round(c.wind_speed_10m),
            pressure: typeof c.surface_pressure === 'number' ? Math.round(c.surface_pressure) : null,
            rain: typeof c.precipitation === 'number' ? c.precipitation : null
          },
          hourly,
          daily,
          updated: new Date().toISOString()
        }
        weatherCache.set(ck, { data, t: Date.now() })
        return jsonResponse(res, data)
      } catch (e) {
        if (wc && wc.data) return jsonResponse(res, wc.data)
        return errorResponse(res, e.message || '天气获取失败', 502)
      }
    }

    // === 热榜聚合(内存缓存 10min;单源失败互不影响) ===
    if (path === '/api/hot' && method === 'GET') {
      const source = url.searchParams.get('source') || 'weibo'
      const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      const cached = hotCache.get(source)
      if (cached && Date.now() - cached.t < 10 * 60 * 1000) {
        return jsonResponse(res, { items: cached.items, updated: cached.updated })
      }
      const num = (v) => {
        const n = parseFloat(String(v ?? '').replace(/[,，\s]/g, ''))
        return Number.isFinite(n) && n > 0 ? n : null
      }
      // 每个源返回 HotItem[];title/url 必有,hot 可空
      // 注:微博(匿名 403)/V2EX(本地直连超时)不可用,故未收录
      const fetchers = {
        // 知乎热榜(api.zhihu.com 匿名可用)
        async zhihu() {
          const r = await fetch('https://api.zhihu.com/topstory/hot-list?limit=30', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
          if (!r.ok) throw new Error('上游 ' + r.status)
          const data = await r.json()
          const list = (data && data.data) || []
          return list.slice(0, 30).map((x) => {
            const t = x.target || {}
            const m = String(t.url || '').match(/questions\/(\d+)/)
            return {
              title: String(t.title || '').trim(),
              url: m ? `https://www.zhihu.com/question/${m[1]}` : 'https://www.zhihu.com/hot',
              // detail_text 形如 "2576 万热度"
              hot: num(String(x.detail_text || '').replace(/万\s*热度?/, 'e4').replace(/热度/, ''))
            }
          }).filter((x) => x.title)
        },
        // B站热门
        async bilibili() {
          const r = await fetch('https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1', { headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' }, signal: AbortSignal.timeout(8000) })
          if (!r.ok) throw new Error('上游 ' + r.status)
          const data = await r.json()
          const list = (data.data && data.data.list) || []
          return list.slice(0, 30).map((x) => ({
            title: String(x.title || '').trim(),
            url: `https://www.bilibili.com/video/${x.bvid}`,
            hot: x.stat ? num(x.stat.view) : null
          })).filter((x) => x.title)
        },
        // 百度热搜(卡片为 tabTextList 双层嵌套结构)
        async baidu() {
          const r = await fetch('https://top.baidu.com/api/board?platform=wise&tab=realtime', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
          if (!r.ok) throw new Error('上游 ' + r.status)
          const data = await r.json()
          const cards = (data.data && data.data.cards) || []
          // content[].content[] 双层嵌套展平
          const leaves = cards.flatMap((c) => (c.content || []).flatMap((inner) => inner.content || [inner]))
          return leaves.slice(0, 30).map((x) => ({
            title: String(x.word || '').trim(),
            url: x.rawUrl || x.url || `https://www.baidu.com/s?wd=${encodeURIComponent(x.word || '')}`,
            hot: num(x.hotScore)
          })).filter((x) => x.title)
        },
        // 头条热榜(hot-event 公开接口)
        async toutiao() {
          const r = await fetch('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
          if (!r.ok) throw new Error('上游 ' + r.status)
          const data = await r.json()
          const list = (data && data.data) || []
          return list.slice(0, 30).map((x) => ({
            title: String(x.Title || '').trim(),
            url: x.Url || `https://www.toutiao.com/trending/${x.ClusterId}/`,
            hot: num(x.HotValue)
          })).filter((x) => x.title)
        },
        // 抖音热点榜(iesdouyin billboard 匿名可用)
        async douyin() {
          const r = await fetch('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
          if (!r.ok) throw new Error('上游 ' + r.status)
          const data = await r.json()
          const list = (data && data.word_list) || []
          return list.slice(0, 30).map((x) => ({
            title: String(x.word || '').trim(),
            url: `https://www.douyin.com/search/${encodeURIComponent(x.word || '')}`,
            hot: num(x.hot_value)
          })).filter((x) => x.title)
        },
        // 贴吧热议榜
        async tieba() {
          const r = await fetch('https://tieba.baidu.com/hottopic/browse/topicList', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
          if (!r.ok) throw new Error('上游 ' + r.status)
          const data = await r.json()
          const list = ((data.data || {}).bang_topic || {}).topic_list || []
          return list.slice(0, 30).map((x) => ({
            title: String(x.topic_name || '').trim(),
            url: String(x.topic_url || `https://tieba.baidu.com/hottopic/browse/topicList?topic_id=${x.topic_id}`).replace(/&amp;/g, '&'),
            hot: num(x.discuss_num)
          })).filter((x) => x.title)
        }
      }
      const fn = fetchers[source]
      if (!fn) return errorResponse(res, `未知热榜源: ${source}`, 400)
      try {
        const items = await fn()
        if (!items.length) throw new Error('上游返回空数据')
        const updated = new Date().toISOString()
        hotCache.set(source, { items, updated, t: Date.now() })
        return jsonResponse(res, { items, updated })
      } catch (e) {
        // 失败时若有旧数据(即使过期)兜底返回,避免整块报错
        if (cached) return jsonResponse(res, { items: cached.items, updated: cached.updated })
        return errorResponse(res, `「${source}」热榜获取失败: ${e.message}`, 502)
      }
    }

    // === 汇率(以 CNY 为基准,内存缓存 1h;上游: open.er-api.com -> frankfurter.app 兜底) ===
    if (path === '/api/rate' && method === 'GET') {
      const now = Date.now()
      if (rateCache && now - rateCache.t < 60 * 60 * 1000) {
        return jsonResponse(res, { base: rateCache.base, rates: rateCache.rates, updated: rateCache.updated, date: rateCache.date })
      }
      const opt = { signal: AbortSignal.timeout(10000) }
      let rates = null
      let updated = now
      let date = new Date(now).toISOString().slice(0, 10)
      try {
        const r = await fetch('https://open.er-api.com/v6/latest/CNY', opt)
        if (r.ok) {
          const d = await r.json()
          if (d && d.result === 'success' && d.rates && typeof d.rates === 'object') {
            rates = d.rates
            if (d.time_last_update_unix) updated = d.time_last_update_unix * 1000
          }
        }
      } catch { /* 走兜底 */ }
      if (!rates) {
        // 兜底:frankfurter(ECB);CNY 不可作 base 时用 EUR 换算
        const r = await fetch('https://api.frankfurter.app/latest?from=EUR', opt).catch(() => null)
        if (r && r.ok) {
          const d = await r.json()
          if (d && d.rates && d.rates.CNY) {
            const perEur = d.rates // 各币种 per 1 EUR
            rates = {}
            for (const [ccy, v] of Object.entries(perEur)) rates[ccy] = v / perEur.CNY // per 1 CNY
            rates.CNY = 1
            if (d.date) date = d.date
          }
        }
      }
      if (!rates) return errorResponse(res, '汇率上游不可用', 502)
      rateCache = { rates, updated, date, base: 'CNY', t: now }
      return jsonResponse(res, { base: 'CNY', rates, updated, date })
    }

    // === 壁纸图库(多源:bing/picsum/wallhaven;元数据缓存,图片前端直连) ===
    if (path === '/api/wallpaper' && method === 'GET') {
      const source = url.searchParams.get('source') || 'bing'
      const q = (url.searchParams.get('q') || 'nature landscape').slice(0, 60)
      const page = Math.min(50, Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1))
      if (!['bing', 'picsum', 'wallhaven'].includes(source)) return errorResponse(res, `未知壁纸源: ${source}`, 400)
      const gallery = await fetchWallpaperGallery(source, q, page).catch(() => null)
      if (!gallery || !gallery.length) return errorResponse(res, '壁纸图库获取失败', 502)
      return jsonResponse(res, { gallery })
    }
    if ((path === '/api/wallpaper/daily' || path === '/api/wallpaper/image') && method === 'GET') {
      const meta = await getBingMeta()
      if (!meta) return errorResponse(res, '必应图库获取失败', 502)
      const date8 = path === '/api/wallpaper/daily' ? meta.images[0].d : url.searchParams.get('d')
      if (!date8 || !/^\d{8}$/.test(date8)) return errorResponse(res, '参数 d 无效', 400)
      const item = meta.images.find((im) => im.d === date8)
      if (!item) return errorResponse(res, '该日期壁纸不存在', 404)
      const key = `wallpaper_${date8}`
      const cached = imgCache.get(key)
      if (cached) return imageBytes(res, cached.buf, cached.ct)
      try {
        const r = await fetch('https://cn.bing.com' + item.url, { signal: AbortSignal.timeout(15000) })
        if (!r.ok) return errorResponse(res, '壁纸下载失败', 502)
        const ab = await r.arrayBuffer()
        if (ab.byteLength === 0 || ab.byteLength > 2 * 1024 * 1024) return errorResponse(res, '壁纸尺寸异常', 502)
        const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0]
        const rec = { buf: Buffer.from(ab), ct }
        imgCache.set(key, rec)
        return imageBytes(res, rec.buf, rec.ct)
      } catch (e) {
        return errorResponse(res, '壁纸下载失败: ' + e.message, 502)
      }
    }

    // 未知路由
    return errorResponse(res, `接口不存在: ${method} ${path}`, 404)
  } catch (e) {
    console.error('[Mock Server Error]', e)
    return errorResponse(res, '服务器内部错误: ' + e.message, 500)
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers (for local dev)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  try {
    await handleRequest(req, res)
  } catch (err) {
    console.error(err)
    errorResponse(res, '服务器错误', 500)
  }
})

server.listen(PORT, () => {
  console.log(`[Mock API Server] 运行在 http://localhost:${PORT}`)
  console.log('[Mock API Server] 使用内存存储,重启后数据清空')
  console.log('[Mock API Server] 配合 Vite dev server (端口 5173) 使用')
})
