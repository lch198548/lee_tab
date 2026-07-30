import { isAuthenticated, jsonResponse } from '../../_lib/kv.js'

// 检查登录态:前端启动时调用,决定显示登录页还是主界面
export async function onRequestGet({ request, env }) {
  const auth = await isAuthenticated(request, env)
  return jsonResponse({
    loggedIn: auth.ok,
    reason: auth.ok ? null : auth.reason
  })
}
