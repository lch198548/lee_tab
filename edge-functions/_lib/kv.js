// Edge Functions 共享工具库
// 注意:V8 运行时,不可使用 Node 内置模块(fs/path/Buffer/process)
// 仅可使用 Web 标准 API

// KV 命名空间变量名(在 Makers 控制台绑定命名空间时,变量名必须与此一致)
// 本地通过 edgeone makers dev 调试时,在 .env 中配置同名变量
const KV_NAME = 'NAV_KV'

// 安全获取 KV 绑定(本地开发或未绑定时返回 null,便于排错)
export function getKV(env) {
  // 在 EdgeOne Makers 中,KV 通过同名的全局变量暴露
  // 也可通过 env 访问(取决于绑定方式)
  const target = (typeof globalThis !== 'undefined' && globalThis[KV_NAME]) || (env && env[KV_NAME])
  return target || null
}

// JSON 读取
export async function kvGetJSON(kv, key, fallback = null) {
  if (!kv) return fallback
  try {
    const v = await kv.get(key, { type: 'json' })
    return v === null || v === undefined ? fallback : v
  } catch (e) {
    // value 不是合法 JSON 时降级为 text
    try {
      const text = await kv.get(key)
      return text === null || text === undefined ? fallback : JSON.parse(text)
    } catch (_e) {
      return fallback
    }
  }
}

// JSON 写入
export async function kvPutJSON(kv, key, value) {
  if (!kv) throw new Error('KV not bound')
  await kv.put(key, JSON.stringify(value))
}

// SHA-256 哈希(返回 hex 字符串)
export async function sha256(text) {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 生成随机 token(32 字节 hex)
export function randomToken() {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 生成短 ID(8 字节 hex,足够个人书签去重用)
export function shortId() {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 解析 Cookie 头
export function parseCookies(cookieHeader) {
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

// 统一 JSON 响应
export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(init.headers || {})
    }
  })
}

// 错误响应
export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, { status })
}

// CORS 头(同源部署一般用不到,联调时方便)
export function withCorsHeaders(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...headers
  }
}

// 解析 JSON body,带大小限制(Edge Functions body 上限 1MB)
export async function parseJSONBody(request, maxBytes = 1024 * 1024) {
  const cl = Number(request.headers.get('content-length') || 0)
  if (cl > maxBytes) {
    throw new Error('请求体过大')
  }
  const text = await request.text()
  if (!text) return null
  return JSON.parse(text)
}

// 是否已登录(供中间件复用)
export async function isAuthenticated(request, env) {
  const kv = getKV(env)
  if (!kv) return { ok: false, reason: 'KV 未绑定' }
  const cookies = parseCookies(request.headers.get('cookie') || '')
  const token = cookies.nav_token
  if (!token) return { ok: false, reason: '未登录' }
  // token key 仅允许 [a-zA-Z0-9_],已为 hex,合法
  const record = await kvGetJSON(kv, `token_${token}`, null)
  if (!record) return { ok: false, reason: 'token 无效' }
  // 校验过期
  const now = Date.now()
  if (record.expiresAt && record.expiresAt < now) {
    await kv.delete(`token_${token}`)
    return { ok: false, reason: 'token 已过期' }
  }
  return { ok: true, record }
}
