import { isAuthenticated, jsonResponse } from './_lib/kv.js'

// 全局中间件:仅对 /api/* 进行鉴权,排除 login 与健康检查
const PUBLIC_PATHS = ['/api/auth/login', '/api/health', '/api/init']

export async function onRequest(context) {
  const { request, env, next } = context
  const url = new URL(request.url)

  // 处理 CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    })
  }

  // 非 API 路径放行(静态资源)
  if (!url.pathname.startsWith('/api/')) {
    return next()
  }

  // 公开 API 放行
  if (PUBLIC_PATHS.includes(url.pathname)) {
    return next()
  }

  // 其余 API 必须登录
  const auth = await isAuthenticated(request, env)
  if (!auth.ok) {
    return jsonResponse({ error: auth.reason, needLogin: true }, { status: 401 })
  }

  return next()
}
