import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../_lib/kv.js'
import { s3Request, parseListXml } from '../_lib/s3.js'

// 云盘备份到中科院数据胶囊(S3 协议,UA 模拟 rclone)
// 配置存 KV 'cloud_backup'(SK 脱敏返回);备份对象为全量 KV 快照(纯 JSON 文本,网关安全)

const CONFIG_KEY = 'cloud_backup'
const KEEP_DEFAULT = 30

const DEFAULTS = {
  endpoint: 'https://s3.cstcloud.cn',
  region: 'us-east-1',
  bucket: '',
  ak: '',
  sk: '',
  ua: 'rclone/v1.66.0',
  prefix: 'personal-tab/',
  auto: false, // 每日自动备份
  keep: KEEP_DEFAULT,
  lastBackupAt: 0
}

function maskSk(sk) {
  if (!sk) return ''
  if (sk.length <= 8) return '****'
  return sk.slice(0, 4) + '****' + sk.slice(-4)
}

function s3Cfg(c) {
  return { endpoint: c.endpoint, region: c.region, bucket: c.bucket, ak: c.ak, sk: c.sk, ua: c.ua }
}

// 快照时排除的键:会话 token、备份配置自身、含空白字符的坏键(COS 无法读写,如历史遗留的图库缓存)
function excluded(key) {
  return (
    key.startsWith('token_') ||
    key === CONFIG_KEY ||
    /[\s\u0000-\u001f\u007f]/.test(key)
  )
}

async function loadCfg(kv) {
  const saved = await kvGetJSON(kv, CONFIG_KEY, {})
  return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) }
}

// 全量 KV 快照:{ key: 文本值 };单键读取失败跳过(坏键只影响自身,不阻塞整单备份)
async function snapshot(kv) {
  const listed = await kv.list({ prefix: '' })
  const data = {}
  let skipped = 0
  for (const { key } of listed) {
    if (!key || excluded(key)) continue
    try {
      const v = await kv.get(key)
      if (v != null) data[key] = typeof v === 'string' ? v : String(v)
    } catch (_e) {
      skipped++
    }
  }
  return { data, skipped }
}

function tsName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  )
}

// 列出备份对象(按时间倒序),超出 keep 的旧对象删除
async function listAndPrune(cfg, kv) {
  const prefix = cfg.prefix || DEFAULTS.prefix
  const res = await s3Request(s3Cfg(cfg), {
    method: 'GET',
    query: { 'list-type': 2, prefix, 'max-keys': 1000 }
  })
  if (!res.ok) throw new Error('列取备份失败(' + res.status + '): ' + res.text.slice(0, 120))
  const { objects } = parseListXml(res.text)
  const mine = objects
    .filter((o) => o.key.startsWith(prefix) && o.key.endsWith('.json'))
    .sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1))

  // 清理超出保留数的旧备份(失败不阻塞)
  const keep = Number(cfg.keep) || KEEP_DEFAULT
  const extra = mine.slice(keep)
  for (const o of extra) {
    await s3Request(s3Cfg(cfg), { method: 'DELETE', key: o.key })
  }
  return mine
}

// GET /api/cloud -> 配置(SK 脱敏)
export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const cfg = await loadCfg(kv)
  const { sk, ...rest } = cfg
  return jsonResponse({ ...rest, skSet: !!sk, skMask: maskSk(sk) })
}

// PUT /api/cloud -> 保存配置(sk 传空串表示保持不变)
export async function onRequestPut({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }
  if (!body || typeof body !== 'object') return errorResponse('配置必须是对象', 400)

  const cur = await loadCfg(kv)
  const next = {
    ...cur,
    endpoint: (body.endpoint || cur.endpoint).toString().trim().replace(/\/+$/, ''),
    region: (body.region || cur.region).toString().trim(),
    bucket: (body.bucket != null ? body.bucket : cur.bucket).toString().trim(),
    ak: (body.ak != null ? body.ak : cur.ak).toString().trim(),
    sk: body.sk ? body.sk.toString() : cur.sk,
    ua: (body.ua || cur.ua).toString().trim() || DEFAULTS.ua,
    prefix: ((body.prefix != null ? body.prefix : cur.prefix).toString().trim().replace(/^\/+/, '') || DEFAULTS.prefix),
    auto: !!body.auto
  }
  if (!next.prefix.endsWith('/')) next.prefix += '/'
  await kvPutJSON(kv, CONFIG_KEY, next)
  const { sk, ...rest } = next
  return jsonResponse({ ok: true, ...rest, skSet: !!sk, skMask: maskSk(sk) })
}

// POST /api/cloud { action: test | run | list | restore }
export async function onRequestPost({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }
  const action = body && body.action
  const cfg = await loadCfg(kv)
  if (!cfg.bucket || !cfg.ak || !cfg.sk) {
    return errorResponse('尚未配置云盘信息(端点/Bucket/AK/SK)', 400)
  }

  try {
    // === 连通性测试 ===
    if (action === 'test') {
      const res = await s3Request(s3Cfg(cfg), {
        method: 'GET',
        query: { 'list-type': 2, prefix: cfg.prefix, 'max-keys': 1 }
      })
      if (!res.ok) {
        return jsonResponse({ ok: false, error: `连接失败(HTTP ${res.status}) ${res.text.slice(0, 120)}` })
      }
      return jsonResponse({ ok: true, message: '连接成功' })
    }

    // === 执行备份:全量快照 -> 单 JSON 对象 -> 清理旧版 ===
    if (action === 'run') {
      const { data, skipped } = await snapshot(kv)
      const meta = {
        app: 'personal-tab',
        version: 1,
        exportedAt: new Date().toISOString(),
        keys: Object.keys(data).length,
        skipped
      }
      const payload = JSON.stringify({ meta, data })
      const key = `${cfg.prefix}backup-${tsName()}.json`
      const res = await s3Request(s3Cfg(cfg), { method: 'PUT', key, body: payload })
      if (!res.ok) {
        return jsonResponse({ ok: false, error: `上传失败(HTTP ${res.status}) ${res.text.slice(0, 120)}` })
      }
      const size = new TextEncoder().encode(payload).length
      const list = await listAndPrune(cfg, kv)
      const next = { ...cfg, lastBackupAt: Date.now() }
      await kvPutJSON(kv, CONFIG_KEY, next)
      return jsonResponse({
        ok: true,
        key,
        size,
        count: meta.keys,
        skipped,
        lastBackupAt: next.lastBackupAt,
        backups: list.slice(0, 50)
      })
    }

    // === 备份列表 ===
    if (action === 'list') {
      const list = await listAndPrune(cfg, kv)
      return jsonResponse({ ok: true, backups: list.slice(0, 50) })
    }

    // === 恢复:读回快照并覆盖写回 KV ===
    if (action === 'restore') {
      const key = (body.key || '').toString()
      const prefix = cfg.prefix || DEFAULTS.prefix
      if (!key.startsWith(prefix) || key.includes('..')) {
        return errorResponse('非法的备份文件名', 400)
      }
      const res = await s3Request(s3Cfg(cfg), { method: 'GET', key })
      if (!res.ok) {
        return jsonResponse({ ok: false, error: `读取备份失败(HTTP ${res.status}) ${res.text.slice(0, 120)}` })
      }
      let parsed
      try {
        parsed = JSON.parse(res.text)
      } catch {
        return errorResponse('备份文件损坏(非合法 JSON)', 400)
      }
      const data = parsed && parsed.data
      if (!data || typeof data !== 'object') {
        return errorResponse('备份文件格式不正确', 400)
      }
      let count = 0
      let skipped = 0
      for (const [k, v] of Object.entries(data)) {
        if (excluded(k) || typeof v !== 'string') continue
        try {
          await kv.put(k, v)
          count++
        } catch (_e) {
          skipped++
        }
      }
      return jsonResponse({ ok: true, count, skipped, exportedAt: parsed.meta && parsed.meta.exportedAt })
    }

    return errorResponse('未知操作: ' + action, 400)
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message || String(e) })
  }
}
