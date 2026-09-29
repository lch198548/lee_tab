// Edge Functions 共享工具库(基于 EdgeOne Makers Blob 存储)
// 注意:V8 运行时,不可使用 Node 内置模块(fs/path/Buffer/process)
// 仅可使用 Web 标准 API + @edgeone/pages-blob SDK

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
    async put(key, value) {
      await store.set(key, typeof value === 'string' ? value : String(value))
    },
    async get(key, options = {}) {
      const type = options.type || (typeof options === 'string' ? options : 'text')
      return await store.get(key, { type })
    },
    async delete(key) {
      await store.delete(key)
    },
    async list(options = {}) {
      // 枚举键(分页循环,防御性解析 SDK 返回结构)
      const prefix = options.prefix || ''
      const out = []
      let cursor
      for (let i = 0; i < 50; i++) {
        const resp = await store.list({ prefix, cursor })
        const blobs = (resp && (resp.blobs || resp.keys)) || []
        for (const b of blobs) out.push(typeof b === 'string' ? { key: b } : { key: b.key })
        if (!resp || resp.complete !== false) break
        cursor = resp.cursor || resp.nextCursor
        if (!cursor) break
      }
      return out
    }
  }
}

// === 密码处理 ===
// 统一使用 SHA-256 哈希存储(crypto.subtle 开销极低,远在 200ms CPU 限制内)
// 旧版 base64 可逆格式在登录成功时自动迁移为 SHA-256(无感升级)

export async function sha256(text) {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 解码旧版 base64 格式密码(仅用于迁移校验)
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

// === 通用工具 ===

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

// === 二进制工具(base64 编解码,供 favicon / wallpaper 代理共用) ===

export function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function base64ToBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// 图片字节响应(统一 Cache-Control,浏览器侧缓存 6 小时)
export function imageResponse(data, contentType, maxAge = 21600) {
  return new Response(base64ToBytes(data), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${maxAge}`
    }
  })
}

// === 分组数据辅助函数(单 Blob + 乐观锁) ===

// 读取全部分组文档 { groups, rev }
// rev 为版本号,每次写入 +1,用于乐观锁防并发覆盖
export async function getGroupsDoc(kv) {
  if (!kv) return { groups: [], rev: 0 }
  const data = await kvGetJSON(kv, 'nav_groups', null)
  if (data && Array.isArray(data.groups)) {
    return { groups: data.groups, rev: Number(data.rev) || 0 }
  }

  // 迁移:从旧格式(groups_index + group_{id})读取
  const groupsIndex = await kvGetJSON(kv, 'groups_index', [])
  if (!Array.isArray(groupsIndex) || groupsIndex.length === 0) {
    return { groups: [], rev: 0 }
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

  await saveGroupsData(kv, groups, undefined, 0)
  return { groups, rev: 0 }
}

// 兼容接口:仅取分组数组
export async function getGroupsData(kv) {
  const doc = await getGroupsDoc(kv)
  return doc.groups
}

// 保存全部分组及书签(单 Blob 写入)
// expectedRev 传入时启用乐观锁:当前版本不匹配则抛出 conflict 错误
export async function saveGroupsData(kv, groups, expectedRev, baseRev) {
  if (!kv) throw new Error('Blob 存储未就绪')
  if (expectedRev !== undefined) {
    const cur = await kvGetJSON(kv, 'nav_groups', null)
    const curRev = cur && Number.isFinite(cur.rev) ? cur.rev : 0
    if (curRev !== expectedRev) {
      const err = new Error('数据已被其他窗口修改,请刷新重试')
      err.conflict = true
      throw err
    }
  }
  const nextRev = (baseRev ?? expectedRev ?? 0) + 1
  await kvPutJSON(kv, 'nav_groups', { groups, rev: nextRev })
}

// 分组数据原子变更:读 → 变更 → 带乐观锁写,冲突自动重试(最多 3 次)
// mutator(groups) 直接原地修改 groups 数组:
//   - 分组不存在时返回 { notFound: true }
//   - 正常时返回任意结果(将透传给调用方)
export async function withGroupsMutation(kv, mutator) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await getGroupsDoc(kv)
    const result = mutator(doc.groups)
    if (result && result.notFound) {
      return { ok: false, notFound: true }
    }
    try {
      await saveGroupsData(kv, doc.groups, doc.rev)
      return { ok: true, result }
    } catch (e) {
      if (e && e.conflict) continue // 并发冲突,重读重试
      throw e
    }
  }
  return { ok: false, conflict: true }
}
