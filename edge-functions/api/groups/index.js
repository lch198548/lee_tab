import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody,
  shortId
} from '../../_lib/kv.js'

// 获取所有分组及书签(完整数据)
export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const groupsIndex = await kvGetJSON(kv, 'groups_index', [])
  if (!Array.isArray(groupsIndex) || groupsIndex.length === 0) {
    return jsonResponse({ groups: [] })
  }

  // 按 sort 排序
  groupsIndex.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))

  // 并行拉取每个分组的书签
  const groups = await Promise.all(
    groupsIndex.map(async (g) => {
      const data = await kvGetJSON(kv, `group_${g.id}`, { id: g.id, name: g.name, sort: g.sort, bookmarks: [] })
      return {
        id: g.id,
        name: g.name,
        sort: g.sort,
        bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : []
      }
    })
  )

  return jsonResponse({ groups })
}

// 新建分组
export async function onRequestPost({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }
  const name = (body?.name || '').trim()
  if (!name) return errorResponse('分组名称不能为空', 400)

  const groupsIndex = await kvGetJSON(kv, 'groups_index', [])
  const id = shortId()
  const sort = groupsIndex.length // 新分组默认排到最后
  groupsIndex.push({ id, name, sort })

  await kvPutJSON(kv, 'groups_index', groupsIndex)
  await kvPutJSON(kv, `group_${id}`, { id, name, sort, bookmarks: [] })

  return jsonResponse({ ok: true, group: { id, name, sort, bookmarks: [] } })
}
