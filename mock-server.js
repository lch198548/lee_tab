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
  const publicPaths = ['/api/auth/login', '/api/auth/check', '/api/auth/logout', '/api/health']
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
          bookmarks: Array.isArray(data?.bookmarks) ? data.bookmarks : []
        })
      }
      return jsonResponse(res, { groups })
    }

    if (path === '/api/groups' && method === 'POST') {
      const body = await parseBody(req)
      const name = (body?.name || '').trim()
      if (!name) return errorResponse(res, '分组名称不能为空', 400)
      const kv = getKV()
      const groupsIndex = (await kv.get('groups_index', { type: 'json' })) || []
      const id = shortId()
      const sort = groupsIndex.length
      groupsIndex.push({ id, name, sort })
      await kv.put('groups_index', JSON.stringify(groupsIndex))
      await kv.put(`group_${id}`, JSON.stringify({ id, name, sort, bookmarks: [] }))
      return jsonResponse(res, { ok: true, group: { id, name, sort, bookmarks: [] } })
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
