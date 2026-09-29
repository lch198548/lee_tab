// GET /api/rate -> 实时汇率(以 CNY 为基准, KV 缓存 1h)
// 上游: open.er-api.com(免费无 key,每日更新) -> frankfurter.app(ECB)兜底。
// rates[CCY] = 1 CNY 兑该币种金额;跨币种换算前端用 rates 相除即可。
import { getKV, kvGetJSON, kvPutJSON, jsonResponse, errorResponse } from '../_lib/kv.js'

const TTL = 60 * 60 * 1000

function timeoutOpt(ms) {
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return { signal: AbortSignal.timeout(ms) }
  } catch { /* 忽略 */ }
  return {}
}

export async function onRequestGet({ env }) {
  const kv = getKV(env)
  const now = Date.now()

  if (kv) {
    const cached = await kvGetJSON(kv, 'rate_cny', null)
    if (cached && cached.rates && now - (cached.t || 0) < TTL) {
      return jsonResponse({ base: 'CNY', rates: cached.rates, updated: cached.updated, date: cached.date })
    }
  }

  let rates = null
  let updated = now
  let date = new Date(now).toISOString().slice(0, 10)

  try {
    const r = await fetch('https://open.er-api.com/v6/latest/CNY', timeoutOpt(10000))
    if (r.ok) {
      const d = await r.json()
      if (d && d.result === 'success' && d.rates && typeof d.rates === 'object') {
        rates = d.rates
        if (d.time_last_update_unix) updated = d.time_last_update_unix * 1000
      }
    }
  } catch { /* 走兜底 */ }

  if (!rates) {
    // 兜底:frankfurter(ECB)。CNY 不可作 base,用 EUR 中转换算。
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR', timeoutOpt(10000)).catch(() => null)
    if (r && r.ok) {
      const d = await r.json().catch(() => null)
      if (d && d.rates && d.rates.CNY) {
        const perEur = d.rates
        rates = { CNY: 1 }
        for (const [ccy, v] of Object.entries(perEur)) rates[ccy] = v / perEur.CNY
        if (d.date) date = d.date
      }
    }
  }

  if (!rates) return errorResponse('汇率上游不可用', 502)

  if (kv) await kvPutJSON(kv, 'rate_cny', { rates, updated, date, t: now })
  return jsonResponse({ base: 'CNY', rates, updated, date })
}
