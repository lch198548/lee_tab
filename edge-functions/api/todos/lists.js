import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody,
  shortId
} from '../../../_lib/kv.js'

// 清单 CRUD:GET 列表 / POST 新建 / PUT 重命名(?id=) / DELETE 删除(?id=,其下待办移回默认)

async function readLists(kv) {
  const lists = await kvGetJSON(kv, 'todo_lists', [])
  return Array.isArray(lists) ? lists : []
}

export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  return jsonResponse({ lists: await readLists(kv) })
}

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
  if (!name) return errorResponse('清单名称不能为空', 400)

  const lists = await readLists(kv)
  if (lists.length >= 20) return errorResponse('清单数量已达上限(20)', 400)
  const list = { id: shortId(), name }
  lists.push(list)
  await kvPutJSON(kv, 'todo_lists', lists)
  return jsonResponse({ ok: true, list })
}

export async function onRequestPut({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }

  const id = new URL(request.url).searchParams.get('id')
  const name = (body?.name || '').trim()
  if (!id || !name) return errorResponse('缺少清单ID或名称', 400)

  const lists = await readLists(kv)
  const list = lists.find((l) => l.id === id)
  if (!list) return errorResponse('清单不存在', 404)
  list.name = name
  await kvPutJSON(kv, 'todo_lists', lists)
  return jsonResponse({ ok: true })
}

export async function onRequestDelete({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return errorResponse('缺少清单ID', 400)

  const lists = await readLists(kv)
  const idx = lists.findIndex((l) => l.id === id)
  if (idx === -1) return errorResponse('清单不存在', 404)
  lists.splice(idx, 1)
  await kvPutJSON(kv, 'todo_lists', lists)

  // 该清单下的待办移回默认(无清单)
  const todos = await kvGetJSON(kv, 'todos', [])
  if (Array.isArray(todos)) {
    let changed = false
    for (const t of todos) {
      if (t.listId === id) {
        t.listId = null
        changed = true
      }
    }
    if (changed) await kvPutJSON(kv, 'todos', todos)
  }
  return jsonResponse({ ok: true })
}
