import {
  getKV,
  getGroupsData,
  withGroupsMutation,
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

// 新建分组(带乐观锁,冲突自动重试)
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

  const id = shortId()
  const icon = typeof body?.icon === 'string' ? body.icon.slice(0, 32) : ''
  const outcome = await withGroupsMutation(kv, (groups) => {
    const newGroup = { id, name, icon, sort: groups.length, bookmarks: [] }
    groups.push(newGroup)
    return { group: newGroup }
  })

  if (outcome.conflict) return errorResponse('操作冲突,请刷新后重试', 409)
  return jsonResponse({ ok: true, group: outcome.result.group })
}
