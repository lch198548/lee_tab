import {
  getKV,
  withGroupsMutation,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../../../_lib/kv.js'

// POST /api/groups/:id/move  -> 跨分组移动书签(单次原子写入)
// 旧版由前端分两次全量保存,中途失败会导致书签在两个分组中重复
// body: { bookmarkId: string, toGroupId: string }
export async function onRequestPost({ request, env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const { id } = params
  if (!id) return errorResponse('缺少源分组 id', 400)

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }
  const bookmarkId = body?.bookmarkId || ''
  const toGroupId = body?.toGroupId || ''
  if (!bookmarkId || !toGroupId) {
    return errorResponse('缺少 bookmarkId 或 toGroupId', 400)
  }
  if (toGroupId === id) {
    return jsonResponse({ ok: true }) // 同分组,无需处理
  }

  const outcome = await withGroupsMutation(kv, (groups) => {
    const fromG = groups.find((g) => g.id === id)
    const toG = groups.find((g) => g.id === toGroupId)
    if (!fromG || !toG) return { notFound: true }

    const idx = (fromG.bookmarks || []).findIndex((b) => b.id === bookmarkId)
    if (idx === -1) return { notFound: true }

    const [moved] = fromG.bookmarks.splice(idx, 1)
    moved.favorite = false
    moved.sort = (toG.bookmarks || []).length
    toG.bookmarks = [...(toG.bookmarks || []), moved]

    return { ok: true }
  })

  if (outcome.notFound) return errorResponse('分组或书签不存在', 404)
  if (outcome.conflict) return errorResponse('操作冲突,请刷新后重试', 409)
  return jsonResponse({ ok: true })
}
