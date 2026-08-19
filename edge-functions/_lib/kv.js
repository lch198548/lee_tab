// Edge Functions 共享工具库(基于 EdgeOne Makers Blob 存储)
// 注意:V8 运行时,不可使用 Node 内置模块(fs/path/Buffer/process)
// 仅可使用 Web 标准 API + @edgeone/pages-blob SDK
//
// 与 KV 版本的区别:
// 1. Blob 不需要在控制台绑定命名空间,首次 getStore() 时自动创建
// 2. Blob 支持强一致模式(consistency: "strong"),登录 token 立即生效
// 3. Key 可包含任意字符(包括 /),但本项目仍保留纯字母+下划线格式以兼容旧数据

import { getStore } from '@edgeone/pages-blob'

// Blob 命名空间名称(首次调用时自动创建,无需控制台操作)
const STORE_NAME = 'nav_data'

// 单例 store(强一致模式,确保登录 token / 密码校验立即生效)
let _store = null
function getStoreInstance() {
  if (_store) return _store
  try {
    _store = getStore({ name: STORE_NAME, consistency: 'strong' })
    return _store
  } catch (e) {
    console.error('Blob store init failed:', e)
    return null
  }
}

// 适配原 KV 接口,业务代码无需改动
export function getKV(_env) {
  const store = getStoreInstance()
  if (!store) return null
  return {
    // 写入:Blob.set 接收 string/ArrayBuffer/Blob/ReadableStream
    // 我们统一存 JSON 字符串,与 KV 行为一致
    async put(key, value) {
      await store.set(key, typeof value === 'string' ? value : String(value))
    },
    // 读取:type 支持 text/json/arrayBuffer/stream,与 KV 兼容(Blob 多一个 blob 类型)
    async get(key, options = {}) {
      const type = options.type || (typeof options === 'string' ? options : 'text')
      return await store.get(key, { type })
    },
    async delete(key) {
      await store.delete(key)
    },
    // 列举:适配 KV 的 ListResult 结构 { complete, cursor, keys:[{key}] }
    async list(options = {}) {
      const res = await store.list({
        prefix: options.prefix,
        cursor: options.cursor,
        paginate: false // 单页模式,便于适配 KV 接口
      })
      return {
        complete: !res.cursor,
        cursor: res.cursor || null,
        keys: (res.blobs || []).map((b) => ({ key: b.key }))
      }
    }
  }
}

// === 以下工具函数与原 KV 版本完全一致,业务代码无需改动 ===

// 密码编码:使用 base64 + 简单加盐混淆
// 不使用 SHA-256(会消耗大量 CPU,Edge Functions 有 200ms 限制)
// 单人使用场景下 base64 已足够防止明文存储
const SALT = 'nav_personal_2026'

export function encodePassword(text) {
  // 先加 salt 再 base64,防止简单反查
  return btoa(unescape(encodeURIComponent(SALT + ':' + text)))
}

export function decodePassword(encoded) {
  try {
    const decoded = decodeURIComponent(escape(atob(encoded)))
    const idx = decoded.indexOf(':')
    if (idx === -1) return ''
    return decoded.slice(idx + 1)
  } catch {
    return ''
  }
}

// 兼容旧版 SHA-256 密码(如果用户之前已设置过)
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
// 注意:使用强一致模式,token 校验立即生效,避免登录后立刻 401
export async function isAuthenticated(request, env) {
  const kv = getKV(env)
  if (!kv) return { ok: false, reason: 'Blob 存储未就绪' }
  const cookies = parseCookies(request.headers.get('cookie') || '')
  const token = cookies.nav_token
  if (!token) return { ok: false, reason: '未登录' }
  // token key 仅允许 [a-zA-Z0-9_],已为 hex,合法
  const record = await kv.get(`token_${token}`, { type: 'json' })
  if (!record) return { ok: false, reason: 'token 无效' }
  // 校验过期
  const now = Date.now()
  if (record.expiresAt && record.expiresAt < now) {
    await kv.delete(`token_${token}`)
    return { ok: false, reason: 'token 已过期' }
  }
  return { ok: true, record }
}

// JSON 读取(直接基于 Blob 的 JSON 模式)
export async function kvGetJSON(kv, key, fallback = null) {
  if (!kv) return fallback
  try {
    const v = await kv.get(key, { type: 'json' })
    return v === null || v === undefined ? fallback : v
  } catch (_e) {
    // value 不是合法 JSON 时降级为 text 再解析
    try {
      const text = await kv.get(key)
      return text === null || text === undefined ? fallback : JSON.parse(text)
    } catch (_e2) {
      return fallback
    }
  }
}

// JSON 写入(序列化后存为文本)
export async function kvPutJSON(kv, key, value) {
  if (!kv) throw new Error('Blob 存储未就绪')
  await kv.put(key, JSON.stringify(value))
}

// === 分组数据辅助函数(单 Blob 替代 N+1 次读取) ===

// 获取全部分组及书签,自动从旧格式(groups_index + group_{id})迁移
export async function getGroupsData(kv) {
  if (!kv) return []
  // 优先读取新格式(单 Blob)
  const data = await kvGetJSON(kv, 'nav_groups', null)
  if (data && Array.isArray(data.groups)) {
    return data.groups
  }

  // 迁移:从旧格式读取
  const groupsIndex = await kvGetJSON(kv, 'groups_index', [])
  if (!Array.isArray(groupsIndex) || groupsIndex.length === 0) {
    return []
  }

  groupsIndex.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))

  const groups = await Promise.all(
    groupsIndex.map(async (g) => {
      const d = await kvGetJSON(kv, `group_${g.id}`, { bookmarks: [] })
      return {
        id: g.id,
        name: g.name,
        sort: g.sort,
        bookmarks: Array.isArray(d.bookmarks) ? d.bookmarks : []
      }
    })
  )

  // 写入新格式
  await kvPutJSON(kv, 'nav_groups', { groups })
  return groups
}

// 保存全部分组及书签(单 Blob 写入)
export async function saveGroupsData(kv, groups) {
  if (!kv) throw new Error('Blob 存储未就绪')
  await kvPutJSON(kv, 'nav_groups', { groups })
}
