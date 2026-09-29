import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  sha256,
  decodePassword,
  randomToken,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../../_lib/kv.js'

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 天

// 登录防爆破:连续失败 5 次锁定 15 分钟
const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000

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

  // 防爆破检查
  const guard = await kvGetJSON(kv, 'login_guard', null)
  const now = Date.now()
  if (guard && guard.lockedUntil && guard.lockedUntil > now) {
    const mins = Math.ceil((guard.lockedUntil - now) / 60000)
    return errorResponse(`失败次数过多,已锁定,请 ${mins} 分钟后再试`, 429)
  }

  // 读取已存密码(1 次 Blob 读)
  const stored = await kvGetJSON(kv, 'auth_password', null)

  // 首次部署:尚未设置密码,直接以 SHA-256 存储
  if (!stored || (!stored.value && !stored.hash)) {
    const hash = await sha256(body.password)
    await kvPutJSON(kv, 'auth_password', {
      value: hash,
      method: 'sha256',
      updatedAt: now
    })
    await resetGuard(kv)
    return await issueToken(kv, true, isSecure)
  }

  // 校验密码:sha256 新格式 / base64 旧格式 / 旧版无 method 字段的裸 hash
  let ok = false
  let needMigrate = false
  if (stored.method === 'sha256') {
    ok = (await sha256(body.password)) === stored.value
  } else if (stored.method === 'base64') {
    // 旧版可逆格式:校验通过后无感迁移为 SHA-256
    ok = decodePassword(stored.value) === body.password
    needMigrate = ok
  } else {
    // 兼容最早的裸 SHA-256 格式
    ok = (await sha256(body.password)) === stored.value
    needMigrate = ok && stored.method !== 'sha256'
  }

  if (!ok) {
    await recordFail(kv, guard)
    return errorResponse('密码错误', 401)
  }

  // 无感迁移:base64/裸 hash → sha256
  if (needMigrate) {
    try {
      await kvPutJSON(kv, 'auth_password', {
        value: await sha256(body.password),
        method: 'sha256',
        updatedAt: now
      })
    } catch (_e) {
      // 迁移失败不影响本次登录,下次登录再试
    }
  }

  await resetGuard(kv)
  return await issueToken(kv, false, isSecure)
}

async function resetGuard(kv) {
  try {
    await kvPutJSON(kv, 'login_guard', { failCount: 0, lockedUntil: 0, updatedAt: Date.now() })
  } catch (_e) {
    /* 忽略 */
  }
}

async function recordFail(kv, guard) {
  // 距上次失败超过锁定窗口则重新计数
  const prev = guard && guard.updatedAt && Date.now() - guard.updatedAt < LOCK_MS ? guard : null
  const failCount = (prev?.failCount || 0) + 1
  const lockedUntil = failCount >= MAX_FAILS ? Date.now() + LOCK_MS : 0
  try {
    await kvPutJSON(kv, 'login_guard', { failCount, lockedUntil, updatedAt: Date.now() })
  } catch (_e) {
    /* 忽略 */
  }
}

// 写入 token 后再返回响应(必须同步落盘)
// 旧版异步写入会导致:响应先返回 -> 前端立刻调 /api/init -> token 尚未落盘 -> 401 弹回登录页
async function issueToken(kv, firstSetup, isSecure) {
  const token = randomToken()
  const now = Date.now()

  try {
    await kvPutJSON(kv, `token_${token}`, {
      createdAt: now,
      expiresAt: now + TOKEN_TTL_SECONDS * 1000
    })
  } catch (e) {
    return errorResponse('登录态写入失败,请重试', 500)
  }

  const headers = {
    'Set-Cookie': `nav_token=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Strict${
      isSecure ? '; Secure' : ''
    }`
  }

  return jsonResponse(
    {
      ok: true,
      firstSetup,
      expiresAt: now + TOKEN_TTL_SECONDS * 1000
    },
    { headers }
  )
}
