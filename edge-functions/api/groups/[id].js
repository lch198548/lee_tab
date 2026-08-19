import {
  getKV,
  getGroupsData,
  saveGroupsData,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../../_lib/kv.js'

// 更新分组(重命名/排序)
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

  const groups = await getGroupsData(kv)
  const idx = groups.findIndex((g) => g.id === id)
  if (idx === -1) return errorResponse('分组不存在', 404)

  if (typeof body?.name === 'string' && body.name.trim()) {
    groups[idx].name = body.name.trim()
  }
  if (typeof body?.sort === 'number') {
    groups[idx].sort = body.sort
  }
  // 全量重排:body.allSorts = [{id, sort}]
  if (Array.isArray(body?.allSorts)) {
    body.allSorts.forEach((s) => {
      const target = groups.find((g) => g.id === s.id)
      if (target) target.sort = s.sort
    })
  }

  await saveGroupsData(kv, groups)
  return jsonResponse({ ok: true })
}

// 删除分组(含书签)
export async function onRequestDelete({ env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const { id } = params
  if (!id) return errorResponse('缺少分组 id', 400)

  const groups = await getGroupsData(kv)
  const idx = groups.findIndex((g) => g.id === id)
  if (idx === -1) return errorResponse('分组不存在', 404)

  groups.splice(idx, 1)
  // 重新编号 sort(连续)
  groups.forEach((g, i) => (g.sort = i))

  await saveGroupsData(kv, groups)
  return jsonResponse({ ok: true })
}