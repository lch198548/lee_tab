import { getKV, parseCookies, jsonResponse } from '../../_lib/kv.js'

export async function onRequestPost({ request, env }) {
  const kv = getKV(env)
  const cookies = parseCookies(request.headers.get('cookie') || '')
  const token = cookies.nav_token
  if (kv && token) {
    try {
      await kv.delete(`token_${token}`)
    } catch (_e) {
      /* 忽略 */
    }
  }
  return jsonResponse(
    { ok: true },
    {
      headers: {
        'Set-Cookie': 'nav_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict'
      }
    }
  )
}
