import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  encodePassword,
  decodePassword,
  randomToken,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../../_lib/kv.js'

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 天

export async function onRequestPost({ request, env }) {
  const kv = getKV(env)
  if (!kv) {
    return errorResponse('Blob 存储未就绪', 500)
  }

  const requestUrl = new URL(request.url)
  const isSecure = requestUrl.protocol === 'https:'

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误', 400)
  }
  if (!body || !body.password) {
    return errorResponse('请输入密码', 400)
  }

  // 读取已存密码(1 次 Blob 读)
  const stored = await kvGetJSON(kv, 'auth_password', null)

  // 首次部署:尚未设置密码
  if (!stored || !stored.value) {
    const encoded = encodePassword(body.password)
    await kvPutJSON(kv, 'auth_password', {
      value: encoded,
      method: 'base64',
      updatedAt: Date.now()
    })
    return issueToken(kv, true, isSecure)
  }

  // 校验密码(支持 base64 新格式和 SHA-256 旧格式)
  if (stored.method === 'base64') {
    const decoded = decodePassword(stored.value)
    if (decoded !== body.password) {
      return errorResponse('密码错误', 401)
    }
  } else {
    // 旧版 SHA-256 格式兼容
    const hash = await sha256(body.password)
    if (hash !== stored.value) {
      return errorResponse('密码错误', 401)
    }
    // 升级为新格式
    const encoded = encodePassword(body.password)
    kvPutJSON(kv, 'auth_password', { value: encoded, method: 'base64', updatedAt: Date.now() }).catch(() => {})
  }

  return issueToken(kv, false, isSecure)
}

// 后台异步写入 token,不阻塞响应(避免 CPU 超时)
function issueToken(kv, firstSetup, isSecure) {
  const token = randomToken()
  const now = Date.now()

  // 立即返回,不等待 Blob 写入
  const headers = {
    'Set-Cookie': `nav_token=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Strict${
      isSecure ? '; Secure' : ''
    }`
  }

  // 后台异步写入(浏览器已收到 Cookie,即使写入失败下次登录也可恢复)
  kvPutJSON(kv, `token_${token}`, {
    createdAt: now,
    expiresAt: now + TOKEN_TTL_SECONDS * 1000
  }).catch(() => {
    // 写入失败不阻塞,前端已登录
  })

  return jsonResponse(
    {
      ok: true,
      firstSetup,
      expiresAt: now + TOKEN_TTL_SECONDS * 1000
    },
    { headers }
  )
}
