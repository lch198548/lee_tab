import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  sha256,
  randomToken,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../../_lib/kv.js'

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 天

export async function onRequestPost({ request, env }) {
  const kv = getKV(env)
  if (!kv) {
    return errorResponse('Blob 存储未就绪,请检查 @edgeone/pages-blob 依赖是否安装', 500)
  }

  const requestUrl = new URL(request.url)
  const isSecure = requestUrl.protocol === 'https:'

  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }
  if (!body || !body.password) {
    return errorResponse('请输入密码', 400)
  }

  // 读取已存密码哈希
  const stored = await kvGetJSON(kv, 'auth_password', null)

  // 首次部署:尚未设置密码 -> 把传入的密码设为初始密码
  if (!stored || !stored.hash) {
    const hash = await sha256(body.password)
    await kvPutJSON(kv, 'auth_password', {
      hash,
      updatedAt: Date.now()
    })
    return issueToken(kv, body.password, true)
  }

  // 校验密码
  const inputHash = await sha256(body.password)
  if (inputHash !== stored.hash) {
    return errorResponse('密码错误', 401)
  }

  return issueToken(kv, body.password, false)
}

async function issueToken(kv, password, firstSetup) {
  const token = randomToken()
  const now = Date.now()
  await kvPutJSON(kv, `token_${token}`, {
    createdAt: now,
    expiresAt: now + TOKEN_TTL_SECONDS * 1000
  })

  return jsonResponse(
    {
      ok: true,
      firstSetup,
      expiresAt: now + TOKEN_TTL_SECONDS * 1000
    },
    {
      headers: {
        'Set-Cookie': `nav_token=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Strict${
          // 生产环境建议启用 Secure,本地 http 调试时自动放宽
          isSecure ? '; Secure' : ''
        }`
      }
    }
  )
}
