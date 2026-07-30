import { getKV, kvGetJSON, isAuthenticated, jsonResponse } from '../../_lib/kv.js'

// 检查登录态 + 密码是否已设置
// 前端据此决定:显示登录页(已有密码)还是首次设置密码界面
export async function onRequestGet({ request, env }) {
  const auth = await isAuthenticated(request, env)

  // 检测密码是否已设置
  const kv = getKV(env)
  let passwordSet = false
  if (kv) {
    const stored = await kvGetJSON(kv, 'auth_password', null)
    passwordSet = !!(stored && stored.hash)
  }

  return jsonResponse({
    loggedIn: auth.ok,
    reason: auth.ok ? null : auth.reason,
    passwordSet
  })
}
