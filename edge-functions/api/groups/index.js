import {
  getKV,
  getGroupsData,
  saveGroupsData,
  jsonResponse,
  errorResponse,
  parseJSONBody,
  shortId
} from '../../_lib/kv.js'

// 获取所有分组及书签(单 Blob 读取,替代原 N+1 次读取)
export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const groups = await getGroupsData(kv)
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

  const groups = await getGroupsData(kv)
  const id = shortId()
  const sort = groups.length
  const newGroup = { id, name, sort, bookmarks: [] }
  groups.push(newGroup)

  await saveGroupsData(kv, groups)
  return jsonResponse({ ok: true, group: newGroup })
}

// 分组删除/更新由 [id].js 处理