import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../../_lib/kv.js'

export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const state = await kvGetJSON(kv, 'ui_state', {})
  return jsonResponse(state)
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

  await kvPutJSON(kv, 'ui_state', body || {})
  return jsonResponse({ ok: true })
}
