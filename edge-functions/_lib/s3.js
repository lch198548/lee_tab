// 中科院数据胶囊 S3 客户端(AWS SigV4 签名,纯 Web Crypto 实现)
// 同时兼容 EdgeOne Edge Functions(V8)与 Node 18+(均有 crypto.subtle/atob/btoa/TextEncoder)
//
// 数据胶囊网关关键坑(来自 capsule_memory_s3.py 实战验证):
//  1. 网关按注册应用校验 User-Agent,必须以 rclone/ 开头,否则 401
//  2. 网关会把二进制请求体按 UTF-8 转码,非 UTF-8 字节被替换成 U+FFFD 导致损坏
//     -> 只上传 UTF-8 文本(JSON)绝对安全;二进制必须 base64
//  3. 偶发 429 限流 -> 指数退避重试
//  4. get_object 不返回 ETag(本项目未用到 IfMatch,无影响)

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

function toHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return toHex(await crypto.subtle.digest('SHA-256', buf))
}

async function hmac(keyData, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    typeof keyData === 'string' ? new TextEncoder().encode(keyData) : keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return new Uint8Array(sig)
}

// AWS URI 编码:仅 A-Za-z0-9-._~ 保留(比 encodeURIComponent 更严格)
function amzEncode(str, encodeSlash = true) {
  let out = ''
  for (const ch of str) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch
    } else if (ch === '/') {
      out += encodeSlash ? '%2F' : '/'
    } else {
      const bytes = new TextEncoder().encode(ch)
      for (const b of bytes) out += '%' + b.toString(16).toUpperCase().padStart(2, '0')
    }
  }
  return out
}

// 对象键路径编码:斜杠是路径分隔符必须保留,仅编码段内字符
function encodeKeyPath(key) {
  return key.split('/').map((s) => amzEncode(s)).join('/')
}

function amzDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z'
  )
}

/**
 * 发起一次 S3 请求(自动 SigV4 签名 + 429/5xx 退避重试)
 * cfg: { endpoint, region, bucket, ak, sk, ua }
 * opts: { method, key, query: {k:v}, body: string, contentType, tries }
 * 返回 { ok, status, text }
 */
export async function s3Request(cfg, opts = {}) {
  const { endpoint, region, bucket, ak, sk, ua } = cfg
  const method = (opts.method || 'GET').toUpperCase()
  const key = (opts.key || '').replace(/^\/+/, '')
  const tries = opts.tries || 3
  const host = endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const canonicalUri = '/' + bucket + (key ? '/' + encodeKeyPath(key) : '')

  // 规范化查询串(按 key 排序)
  const query = opts.query || {}
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => amzEncode(k) + '=' + amzEncode(String(query[k])))
    .join('&')

  const body = opts.body != null ? String(opts.body) : ''
  const payloadHash = body ? await sha256Hex(body) : EMPTY_SHA
  const url = `${endpoint}/${bucket}${key ? '/' + encodeKeyPath(key) : ''}` +
    (canonicalQuery ? '?' + canonicalQuery : '')

  let lastErr = null
  for (let i = 0; i < tries; i++) {
    const now = new Date()
    const xAmzDate = amzDate(now)
    const dateStamp = xAmzDate.slice(0, 8)

    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${xAmzDate}\n`

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n')

    const scope = `${dateStamp}/${region}/s3/aws4_request`
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      xAmzDate,
      scope,
      await sha256Hex(canonicalRequest)
    ].join('\n')

    // 派生签名密钥: kDate -> kRegion -> kService -> kSigning
    const kDate = await hmac('AWS4' + sk, dateStamp)
    const kRegion = await hmac(kDate, region)
    const kService = await hmac(kRegion, 's3')
    const kSigning = await hmac(kService, 'aws4_request')
    const signature = toHex(await hmac(kSigning, stringToSign))

    const headers = {
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': xAmzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${ak}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
    if (ua) headers['User-Agent'] = ua // 网关校验:必须以 rclone/ 开头
    if (body) headers['Content-Type'] = opts.contentType || 'application/json; charset=utf-8'
    if (body) headers['Content-Length'] = String(new TextEncoder().encode(body).length)

    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null
      let res
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body || undefined,
          signal: ctrl ? ctrl.signal : undefined
        })
      } finally {
        if (timer) clearTimeout(timer)
      }
      const text = await res.text()

      // 429 限流 / 5xx 网关抖动 -> 退避重试
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`S3 ${res.status}: ${text.slice(0, 200)}`)
        if (i < tries - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1) * (i + 1)))
        continue
      }
      return { ok: res.ok, status: res.status, text }
    } catch (e) {
      lastErr = e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1) * (i + 1)))
    }
  }
  return { ok: false, status: 0, text: 'S3 请求失败: ' + (lastErr ? lastErr.message : String(lastErr)) }
}

// 解析 ListObjectsV2 的 XML 响应(运行时无 DOMParser,正则解析足够)
export function parseListXml(xml) {
  const out = []
  const re = /<Contents>([\s\S]*?)<\/Contents>/g
  let m
  while ((m = re.exec(xml))) {
    const block = m[1]
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
      return t ? t[1] : ''
    }
    out.push({
      key: pick('Key'),
      size: Number(pick('Size')) || 0,
      lastModified: pick('LastModified')
    })
  }
  const trunc = xml.match(/<IsTruncated>true<\/IsTruncated>/)
  const next = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)
  return {
    objects: out,
    truncated: !!trunc,
    nextToken: next ? next[1] : null
  }
}
