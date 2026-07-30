import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../../_lib/kv.js'

// 更新分组(重命名 / 排序)
export async function onRequestPut({ request, env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const { id } = params
  if (!id) return errorResponse('缺少分组 id', 400)

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }

  const groupsIndex = await kvGetJSON(kv, 'groups_index', [])
  const idx = groupsIndex.findIndex((g) => g.id === id)
  if (idx === -1) return errorResponse('分组不存在', 404)

  if (typeof body?.name === 'string' && body.name.trim()) {
    groupsIndex[idx].name = body.name.trim()
  }
  if (typeof body?.sort === 'number') {
    groupsIndex[idx].sort = body.sort
  }
  // 全量重排:body.allSorts = [{id, sort}]
  if (Array.isArray(body?.allSorts)) {
    body.allSorts.forEach((s) => {
      const target = groupsIndex.find((g) => g.id === s.id)
      if (target) target.sort = s.sort
    })
  }

  // 并行写入:更新 groups_index 和 group_<id>
  const newName = groupsIndex[idx].name
  const newSort = groupsIndex[idx].sort
  const groupDataPromise = kvGetJSON(kv, `group_${id}`, { bookmarks: [] }).catch(() => ({ bookmarks: [] }))

  const [groupData] = await Promise.all([groupDataPromise, kvPutJSON(kv, 'groups_index', groupsIndex)])

  if (groupData) {
    groupData.name = newName
    groupData.sort = newSort
    await kvPutJSON(kv, `group_${id}`, groupData)
  }

  return jsonResponse({ ok: true })
}

// 删除分组(含书签)
export async function onRequestDelete({ env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const { id } = params
  if (!id) return errorResponse('缺少分组 id', 400)

  // 并行读取:同时获取 groups_index 和当前分组数据
  const [groupsIndex] = await Promise.all([
    kvGetJSON(kv, 'groups_index', [])
  ])

  const idx = groupsIndex.findIndex((g) => g.id === id)
  if (idx === -1) return errorResponse('分组不存在', 404)

  groupsIndex.splice(idx, 1)
  // 重新编号 sort(连续)
  groupsIndex.forEach((g, i) => (g.sort = i))

  // 并行写入:同时更新 groups_index 和删除分组数据
  await Promise.all([
    kvPutJSON(kv, 'groups_index', groupsIndex),
    kv.delete(`group_${id}`).catch(() => {})
  ])

  return jsonResponse({ ok: true })
}
