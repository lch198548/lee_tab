import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  getGroupsData,
  saveGroupsData,
  shortId,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../_lib/kv.js'

// GET /api/backup -> 导出全部数据为 JSON
export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const config = await kvGetJSON(kv, 'config', null)
  const groups = await getGroupsData(kv)

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    config: config || {},
    groups
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="nav-backup.json"',
      'Cache-Control': 'no-store'
    }
  })
}

// POST /api/backup -> 导入 JSON 覆盖现有数据
export async function onRequestPost({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  let body
  try {
    body = await parseJSONBody(request, 2 * 1024 * 1024) // 导入放宽到 2MB
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }
  if (!body || !body.groups) {
    return errorResponse('备份文件格式不正确: 缺少 groups 字段', 400)
  }

  // 写入 config(若有)
  if (body.config && typeof body.config === 'object') {
    await kvPutJSON(kv, 'config', body.config)
  }

  // 写入分组及书签(单 Blob),逐项清洗防坏数据
  const groups = body.groups
    .filter((g) => g && typeof g === 'object')
    .map((g, i) => ({
      id: typeof g.id === 'string' && g.id ? g.id : shortId(),
      name: (g.name || '未命名').toString().slice(0, 100),
      sort: typeof g.sort === 'number' ? g.sort : i,
      bookmarks: (Array.isArray(g.bookmarks) ? g.bookmarks : [])
        .filter((b) => b && typeof b === 'object')
        .map((b) => ({
          id: typeof b.id === 'string' && b.id ? b.id : shortId(),
          name: (b.name || '').toString(),
          url: (b.url || '').toString(),
          icon: (b.icon || '').toString(),
          desc: (b.desc || '').toString(),
          sort: typeof b.sort === 'number' ? b.sort : 0,
          clicks: Number(b.clicks) || 0,
          createdAt: Number(b.createdAt) || Date.now(),
          favorite: !!b.favorite
        }))
    }))
  await saveGroupsData(kv, groups)

  return jsonResponse({ ok: true, count: groups.length })
}