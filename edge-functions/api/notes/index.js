import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody,
  shortId
} from '../../_lib/kv.js'

export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const notes = await kvGetJSON(kv, 'notes', [])
  return jsonResponse({ notes: Array.isArray(notes) ? notes : [] })
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
  const notes = await kvGetJSON(kv, 'notes', [])
  const note = {
    id: shortId(),
    content: (body?.content || '').trim(),
    bgColor: body.bgColor || '#fef08a',
    textColor: body.textColor || '#1e293b',
    x: body.x ?? 100,
    y: body.y ?? 100,
    width: body.width ?? 200,
    height: body.height ?? 180,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  notes.push(note)
  await kvPutJSON(kv, 'notes', notes)
  return jsonResponse({ ok: true, note })
}

export async function onRequestPut({ request, env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }

  const noteId = params?.id
  const notes = await kvGetJSON(kv, 'notes', [])

  // 全量保存(批量更新位置)
  if (Array.isArray(body?.notes)) {
    await kvPutJSON(kv, 'notes', body.notes)
    return jsonResponse({ ok: true })
  }

  // 单个更新
  const idx = notes.findIndex((n) => n.id === noteId)
  if (idx === -1) return errorResponse('便利贴不存在', 404)

  if (body.content !== undefined) notes[idx].content = body.content
  if (body.bgColor !== undefined) notes[idx].bgColor = body.bgColor
  if (body.textColor !== undefined) notes[idx].textColor = body.textColor
  if (body.x !== undefined) notes[idx].x = body.x
  if (body.y !== undefined) notes[idx].y = body.y
  if (body.width !== undefined) notes[idx].width = body.width
  if (body.height !== undefined) notes[idx].height = body.height
  notes[idx].updatedAt = Date.now()

  await kvPutJSON(kv, 'notes', notes)
  return jsonResponse({ ok: true })
}

export async function onRequestDelete({ env, params }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const noteId = params?.id
  if (!noteId) return errorResponse('缺少便利贴ID', 400)

  const notes = await kvGetJSON(kv, 'notes', [])
  const idx = notes.findIndex((n) => n.id === noteId)
  if (idx === -1) return errorResponse('便利贴不存在', 404)

  notes.splice(idx, 1)
  await kvPutJSON(kv, 'notes', notes)
  return jsonResponse({ ok: true })
}
