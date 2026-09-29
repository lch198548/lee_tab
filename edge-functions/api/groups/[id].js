import {
  getKV,
  withGroupsMutation,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../../_lib/kv.js'

// 更新分组(重命名/排序),带乐观锁
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

  const outcome = await withGroupsMutation(kv, (groups) => {
    const g = groups.find((x) => x.id === id)
    if (!g) return { notFound: true }

    if (typeof body?.name === 'string' && body.name.trim()) {
      g.name = body.name.trim()
    }
    // 分组图标(内置图标集 id;空字符串 = 清除图标)
    if (typeof body?.icon === 'string') {
      g.icon = body.icon.slice(0, 32)
    }
    if (typeof body?.sort === 'number') {
      g.sort = body.sort
    }
    // 全量重排:body.allSorts = [{id, sort}]
    if (Array.isArray(body?.allSorts)) {
      body.allSorts.forEach((s) => {
        const target = groups.find((x) => x.id === s.id)
        if (target) target.sort = s.sort
      })
    }
    return { ok: true }
  })

  if (outcome.notFound) return errorResponse('分组不存在', 404)
  if (outcome.conflict) return errorResponse('操作冲突,请刷新后重试', 409)
  return jsonResponse({ ok: true })
}

// 删除分组(含书签),带乐观锁
export async function onRequestDelete({ env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const { id } = params
  if (!id) return errorResponse('缺少分组 id', 400)

  const outcome = await withGroupsMutation(kv, (groups) => {
    const idx = groups.findIndex((g) => g.id === id)
    if (idx === -1) return { notFound: true }

    groups.splice(idx, 1)
    // 重新编号 sort(连续)
    groups.forEach((g, i) => (g.sort = i))
    return { ok: true }
  })

  if (outcome.notFound) return errorResponse('分组不存在', 404)
  if (outcome.conflict) return errorResponse('操作冲突,请刷新后重试', 409)
  return jsonResponse({ ok: true })
}
