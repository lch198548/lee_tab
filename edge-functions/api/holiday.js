// GET /api/holiday?year=2026 -> 法定节假日 + 调休补班(holiday-cn 开源数据集)
// 数据源:cdn.jsdelivr.net/gh/NateScarlet/holiday-cn(境内可达) -> raw.githubusercontent 兜底
// 返回 { year, days: [{ date, name, off }] };off=true 休息 / false 调休补班。KV 缓存 24h。
import { getKV, kvGetJSON, kvPutJSON, jsonResponse, errorResponse } from '../_lib/kv.js'

const TTL = 24 * 3600 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function timeoutOpt(ms) {
  const opt = { headers: { 'User-Agent': UA } }
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opt.signal = AbortSignal.timeout(ms)
  } catch { /* 边缘环境可能不支持,忽略 */ }
  return opt
}

async function fetchYear(year) {
  const sources = [
    `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
    `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`
  ]
  let lastErr
  for (const url of sources) {
    try {
      const r = await fetch(url, timeoutOpt(8000))
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const d = await r.json()
      if (!Array.isArray(d.days)) throw new Error('数据格式无效')
      return {
        year: d.year || year,
        days: d.days
          .filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date || ''))
          .map((x) => ({ date: x.date, name: String(x.name || ''), off: x.isOffDay !== false }))
      }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('节假日数据获取失败')
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const y = parseInt(url.searchParams.get('year') || '', 10)
  if (!y || y < 2004 || y > 2100) return errorResponse('参数 year 无效', 400)

  const kv = getKV(env)
  const key = `holiday_${y}`
  const cached = kv ? await kvGetJSON(kv, key, null) : null
  if (cached && Array.isArray(cached.days) && Date.now() - (cached.t || 0) < TTL) {
    return jsonResponse({ year: cached.year, days: cached.days })
  }

  try {
    const data = await fetchYear(y)
    if (kv) await kvPutJSON(kv, key, { ...data, t: Date.now() })
    return jsonResponse({ year: data.year, days: data.days })
  } catch (e) {
    // 过期缓存兜底
    if (cached && Array.isArray(cached.days)) {
      return jsonResponse({ year: cached.year, days: cached.days })
    }
    return errorResponse('节假日数据获取失败: ' + e.message, 502)
  }
}
