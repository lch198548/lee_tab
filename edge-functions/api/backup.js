import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../_lib/kv.js'

// GET /api/backup -> 导出全部数据为 JSON
export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const config = await kvGetJSON(kv, 'config', null)
  const groupsIndex = await kvGetJSON(kv, 'groups_index', [])

  const groups = await Promise.all(
    (Array.isArray(groupsIndex) ? groupsIndex : []).map(async (g) => {
      const data = await kvGetJSON(kv, `group_${g.id}`, { bookmarks: [] })
      return {
        id: g.id,
        name: g.name,
        sort: g.sort,
        bookmarks: data.bookmarks || []
      }
    })
  )

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

  // 写入分组及书签
  const groupsIndex = []
  for (const g of body.groups) {
    const id = g.id || Math.random().toString(36).slice(2, 10)
    groupsIndex.push({ id, name: g.name || '未命名', sort: typeof g.sort === 'number' ? g.sort : groupsIndex.length })
    await kvPutJSON(kv, `group_${id}`, {
      id,
      name: g.name || '未命名',
      sort: groupsIndex[groupsIndex.length - 1].sort,
      bookmarks: Array.isArray(g.bookmarks) ? g.bookmarks : []
    })
  }
  await kvPutJSON(kv, 'groups_index', groupsIndex)

  return jsonResponse({ ok: true, count: groupsIndex.length })
}
