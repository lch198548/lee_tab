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

// 更新分组(重命名/排序)
export async function onRequestPut({ request, env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }

  const groupId = params?.id
  if (!groupId) return errorResponse('缺少分组ID', 400)

  const groupsIndex = await kvGetJSON(kv, 'groups_index', [])

  // 如果传了 allSorts,批量更新所有分组的排序
  if (body?.allSorts && Array.isArray(body.allSorts)) {
    for (const s of body.allSorts) {
      const item = groupsIndex.find((g) => g.id === s.id)
      if (item) item.sort = s.sort
    }
    groupsIndex.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    await kvPutJSON(kv, 'groups_index', groupsIndex)
    return jsonResponse({ ok: true })
  }

  // 单个分组重命名/排序
  const item = groupsIndex.find((g) => g.id === groupId)
  if (!item) return errorResponse('分组不存在', 404)

  if (body?.name !== undefined) item.name = body.name
  if (body?.sort !== undefined) item.sort = body.sort

  await kvPutJSON(kv, 'groups_index', groupsIndex)

  // 同步更新 group_{id} 里的 name/sort
  const groupData = await kvGetJSON(kv, `group_${groupId}`, null)
  if (groupData) {
    if (body?.name !== undefined) groupData.name = body.name
    if (body?.sort !== undefined) groupData.sort = body.sort
    await kvPutJSON(kv, `group_${groupId}`, groupData)
  }

  return jsonResponse({ ok: true })
}

// 删除分组
export async function onRequestDelete({ request, env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const groupId = params?.id
  if (!groupId) return errorResponse('缺少分组ID', 400)

  const groupsIndex = await kvGetJSON(kv, 'groups_index', [])
  const idx = groupsIndex.findIndex((g) => g.id === groupId)
  if (idx === -1) return errorResponse('分组不存在', 404)

  groupsIndex.splice(idx, 1)
  // 重排 sort
  for (let i = 0; i < groupsIndex.length; i++) {
    groupsIndex[i].sort = i
  }

  await kvPutJSON(kv, 'groups_index', groupsIndex)
  await kv.delete(`group_${groupId}`)

  return jsonResponse({ ok: true })
}
