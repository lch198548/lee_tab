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
let rateCache = null // 汇率缓存: {rates, updated, date, base, t}

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
