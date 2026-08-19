import {
  getKV,
  getGroupsData,
  saveGroupsData,
  jsonResponse,
  errorResponse,
  parseJSONBody,
  shortId
} from '../../../_lib/kv.js'

// POST /api/groups/:id/bookmarks  -> 添加书签到指定分组
export async function onRequestPost({ request, env, params }) {
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
  const name = (body?.name || '').trim()
  const url = (body?.url || '').trim()
  if (!name || !url) return errorResponse('名称和 URL 不能为空', 400)

  const groups = await getGroupsData(kv)
  const group = groups.find((g) => g.id === id)
  if (!group) return errorResponse('分组不存在', 404)

  const bookmarks = Array.isArray(group.bookmarks) ? group.bookmarks : []
  const bid = shortId()
  bookmarks.push({
    id: bid,
    name,
    url,
    icon: body?.icon || '',
    desc: body?.desc || '',
    sort: bookmarks.length,
    clicks: 0,
    createdAt: Date.now(),
    favorite: !!body?.favorite
  })

  group.bookmarks = bookmarks
  await saveGroupsData(kv, groups)
  return jsonResponse({
    ok: true,
    bookmark: bookmarks[bookmarks.length - 1]
  })
}

// PUT /api/groups/:id/bookmarks  -> 全量替换分组的书签数组(用于排序、修改、删除)
// body: { bookmarks: Bookmark[] }
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
  if (!Array.isArray(body?.bookmarks)) {
    return errorResponse('bookmarks 必须是数组', 400)
  }

  const groups = await getGroupsData(kv)
  const group = groups.find((g) => g.id === id)
  if (!group) return errorResponse('分组不存在', 404)

  // 重排 sort
  const cleaned = body.bookmarks.map((b, i) => ({
    id: b.id || shortId(),
    name: (b.name || '').toString(),
    url: (b.url || '').toString(),
    icon: b.icon || '',
    desc: b.desc || '',
    sort: i,
    clicks: Number(b.clicks) || 0,
    createdAt: b.createdAt || Date.now(),
    favorite: !!b.favorite
  }))

  group.bookmarks = cleaned
  await saveGroupsData(kv, groups)
  return jsonResponse({ ok: true, bookmarks: cleaned })
}