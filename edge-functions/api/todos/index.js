import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody,
  shortId
} from '../../_lib/kv.js'

// GET /api/todos -> { todos, lists }
export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const todos = await kvGetJSON(kv, 'todos', [])
  const lists = await kvGetJSON(kv, 'todo_lists', [])
  return jsonResponse({
    todos: Array.isArray(todos) ? todos : [],
    lists: Array.isArray(lists) ? lists : []
  })
}

// POST /api/todos { text, listId?, important? }
export async function onRequestPost({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }

  const text = (body?.text || '').trim()
  if (!text) return errorResponse('任务内容不能为空', 400)

  const todos = await kvGetJSON(kv, 'todos', [])
  const todo = {
    id: shortId(),
    text,
    done: false,
    important: !!body?.important,
    listId: body?.listId || null,
    createdAt: Date.now(),
    completedAt: null
  }
  todos.push(todo)
  await kvPutJSON(kv, 'todos', todos)
  return jsonResponse({ ok: true, todo })
}

// PUT /api/todos/:id { text?, done?, important? }
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
  if (body.important !== undefined) todos[idx].important = !!body.important
  if (body.listId !== undefined) todos[idx].listId = body.listId || null

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
