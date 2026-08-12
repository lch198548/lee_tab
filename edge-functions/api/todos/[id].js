import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../../_lib/kv.js'

export async function onRequestPut({ request, env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }

  const todoId = params?.id
  const todos = await kvGetJSON(kv, 'todos', [])
  const idx = todos.findIndex((t) => t.id === todoId)
  if (idx === -1) return errorResponse('任务不存在', 404)

  if (body.text !== undefined) todos[idx].text = body.text
  if (body.done !== undefined) {
    todos[idx].done = body.done
    todos[idx].completedAt = body.done ? Date.now() : null
  }

  await kvPutJSON(kv, 'todos', todos)
  return jsonResponse({ ok: true })
}

export async function onRequestDelete({ env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const todoId = params?.id
  if (!todoId) return errorResponse('缺少任务ID', 400)

  const todos = await kvGetJSON(kv, 'todos', [])
  const idx = todos.findIndex((t) => t.id === todoId)
  if (idx === -1) return errorResponse('任务不存在', 404)

  todos.splice(idx, 1)
  await kvPutJSON(kv, 'todos', todos)
  return jsonResponse({ ok: true })
}
