// GET /api/fund?codes=161725,005827 -> 基金实时穿透估值 + 多级缓存
//
// 背景:官方盘中估值接口(fundgz / GSZ 字段)已按监管要求下线,
// 本接口按"养基宝"同款原理自行估算:
//   1. 基金最新公示重仓股(季报)        -> FundMNInverstPosition
//   2. 股票占净值比例(资产配置季报)    -> FundMNAssetAllocationNew
//   3. 重仓股实时行情涨跌幅             -> qt.gtimg.cn(腾讯)
//   4. 估算涨跌 = (Σ 占比×个股涨跌 / Σ 占比) × 股票仓位占比
//      (重仓股内部平均涨跌 × 总股票仓位;未披露持仓按同涨跌假设)
// 无持仓/无股票仓位(纯债/货币/QDII)时回退为昨日净值涨跌。
// 缓存:最终结果 60s / 静态资料(持仓+仓位)7 天;需登录(全局中间件保证)。
import { getKV, kvGetJSON, kvPutJSON, jsonResponse, errorResponse } from '../_lib/kv.js'

const EST_TTL = 60 * 1000
const STATIC_TTL = 7 * 24 * 60 * 60 * 1000
const MAX_CODES = 20
const MOBILE_BASE = 'https://fundmobapi.eastmoney.com/FundMNewApi'
const MOBILE_QS = 'deviceid=Wap&plat=Wap&product=EFund&version=6.2.8'

function timeoutOpt(ms) {
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return { signal: AbortSignal.timeout(ms) }
  } catch {
    /* 边缘环境可能不支持,忽略 */
  }
  return {}
}

// GPDM 股票代码 + 交易所标记 -> 内部 secid
// NEWTEXCH(推荐,东财市场码:1=沪 0=深 116=港) / TEXCH(1=沪 2=深 5/3=港)
// 仅接受明确的股票交易所标记;债券/转债等非股票持仓返回空(不参与估算)
function secidOf(gpdm, texch, newTexch) {
  const code = String(gpdm || '').trim()
  if (!/^\d{5,6}$/.test(code)) return ''
  const t = String(newTexch || texch || '')
  if (t === '1') return `1.${code}`
  if (t === '0') return `0.${code}`
  if (t === '116' || t === '5' || t === '3') return `116.${code}`
  return ''
}

// 基金基本信息(名称/净值/昨日涨跌)
async function fetchFundBase(code) {
  const url = `${MOBILE_BASE}/FundMNFInfo?Fcodes=${code}&${MOBILE_QS}`
  const res = await fetch(url, timeoutOpt(8000))
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  const d = data && Array.isArray(data.Datas) ? data.Datas[0] : null
  if (!d || !d.FCODE) return null
  const chg = parseFloat(d.NAVCHGRT)
  return {
    code: String(d.FCODE),
    name: d.SHORTNAME || code,
    nav: d.NAV || '',
    navChg: Number.isFinite(chg) ? chg : 0,
    navDate: d.PDATE || ''
  }
}

// 静态资料(季报,7 天缓存):重仓股 + 股票仓位占比。空结果不缓存(瞬时失败下次重试)
async function getStatic(kv, code) {
  const key = `fund_static_${code}`
  const cached = await kvGetJSON(kv, key, null)
  if (cached && Array.isArray(cached.holdings) && Date.now() - (cached.t || 0) < STATIC_TTL) {
    return cached
  }
  const [posRes, assetRes] = await Promise.all([
    fetch(`${MOBILE_BASE}/FundMNInverstPosition?FCODE=${code}&${MOBILE_QS}`, timeoutOpt(8000)).catch(() => null),
    fetch(`${MOBILE_BASE}/FundMNAssetAllocationNew?FCODE=${code}&${MOBILE_QS}`, timeoutOpt(8000)).catch(() => null)
  ])

  let holdings = []
  if (posRes && posRes.ok) {
    const data = await posRes.json().catch(() => null)
    const stocks = data && data.Datas && data.Datas.fundStocks
    if (Array.isArray(stocks)) {
      holdings = stocks
        .map((s) => ({ secid: secidOf(s.GPDM, s.TEXCH, s.NEWTEXCH), weight: parseFloat(s.JZBL) || 0 }))
        .filter((s) => s.secid && s.weight > 0)
    }
  }

  let stockRatio = null // 股票占净值比例(0-1)
  if (assetRes && assetRes.ok) {
    const data = await assetRes.json().catch(() => null)
    const latest = data && Array.isArray(data.Datas) ? data.Datas[0] : null
    const gp = latest ? parseFloat(latest.GP) : NaN
    if (Number.isFinite(gp) && gp > 0) stockRatio = gp / 100
  }

  const rec = { holdings, stockRatio, t: Date.now() }
  if (holdings.length > 0 && stockRatio !== null) {
    await kvPutJSON(kv, key, rec)
  }
  return rec
}

// 批量股票实时涨跌幅(腾讯行情)。key = 裸代码。
// 注:东财 push2 会拒绝 node/undici 的 TLS 指纹(UND_ERR_SOCKET),故用腾讯源。
// GBK 编码,只解析 ASCII 数值字段;gbk 解码器不可用时回退 latin1(名称乱码不影响数值)。
// A 股涨跌幅 = f[32];港股字段布局不同,由 现价(f[3])/昨收(f[4]) 计算。
async function fetchQuotes(secids) {
  const map = new Map()
  if (!secids.length) return map
  const symbols = secids.map((s) => {
    const [mkt, code] = s.split('.')
    return (mkt === '1' ? 'sh' : mkt === '0' ? 'sz' : 'hk') + code
  })
  try {
    const res = await fetch(`https://qt.gtimg.cn/q=${symbols.join(',')}`, timeoutOpt(8000))
    if (!res.ok) return map
    const buf = await res.arrayBuffer()
    let text
    try {
      text = new TextDecoder('gbk').decode(buf)
    } catch {
      text = new TextDecoder('latin1').decode(buf)
    }
    for (const line of text.split(';')) {
      const m = line.match(/v_(sh|sz|hk)(\d+)="([^"]*)"/)
      if (!m) continue
      const f = m[3].split('~')
      let pct = parseFloat(f[32])
      if (m[1] === 'hk' || !Number.isFinite(pct)) {
        const price = parseFloat(f[3])
        const prev = parseFloat(f[4])
        if (Number.isFinite(price) && Number.isFinite(prev) && prev > 0) {
          pct = ((price - prev) / prev) * 100
        }
      }
      if (Number.isFinite(pct)) map.set(m[2], pct)
    }
  } catch (_e) {
    /* 返回空 map,上层回退净值涨跌 */
  }
  return map
}

const round2 = (v) => Math.round(v * 100) / 100

export async function onRequestGet({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const url = new URL(request.url)
  const raw = url.searchParams.get('codes') || ''
  const codes = [...new Set(raw.split(',').map((c) => c.trim()).filter((c) => /^\d{6}$/.test(c)))].slice(0, MAX_CODES)
  if (codes.length === 0) return errorResponse('参数 codes 无效(需逗号分隔的 6 位基金代码)', 400)

  const now = Date.now()
  const estTime = new Date(now).toTimeString().slice(0, 5)

  // 1. 命中结果缓存的部分直接用
  const results = new Map()
  const pending = []
  for (const code of codes) {
    const key = `fund_est_${code}`
    const cached = await kvGetJSON(kv, key, null)
    if (cached && cached.name && now - (cached.t || 0) < EST_TTL) {
      results.set(code, cached)
    } else {
      pending.push(code)
    }
  }

  // 2. 未命中的:基本信息 + 静态资料(7 天缓存)
  const bases = new Map()
  const statics = new Map()
  const secids = new Set()
  await Promise.all(
    pending.map(async (code) => {
      const [base, stat] = await Promise.all([fetchFundBase(code), getStatic(kv, code)])
      bases.set(code, base)
      statics.set(code, stat)
      for (const h of stat.holdings) secids.add(h.secid)
    })
  )

  // 3. 一次批量拉所有重仓股行情
  const quoteMap = await fetchQuotes([...secids])

  // 4. 穿透估算:重仓股平均涨跌 × 股票仓位占比
  await Promise.all(
    pending.map(async (code) => {
      const base = bases.get(code)
      if (!base) {
        results.set(code, { code, name: code, est: 0, live: false, coverage: 0, nav: '', navChg: 0, navDate: '', estTime, err: true, t: now })
        return
      }
      const { holdings, stockRatio } = statics.get(code) || { holdings: [], stockRatio: null }
      let wSum = 0
      let vSum = 0
      for (const h of holdings) {
        const q = quoteMap.get(h.secid.split('.').pop())
        if (q === undefined) continue
        wSum += h.weight
        vSum += h.weight * q
      }
      const stockAvg = wSum > 0 ? vSum / wSum : null
      const live = stockAvg !== null && stockRatio !== null && stockRatio > 0
      const rec = {
        ...base,
        est: live ? round2(stockAvg * stockRatio) : base.navChg,
        live,
        coverage: round2(wSum),
        estTime,
        t: now
      }
      results.set(code, rec)
      await kvPutJSON(kv, `fund_est_${code}`, rec)
    })
  )

  // 保持请求顺序输出
  return jsonResponse({ funds: codes.map((c) => results.get(c)).filter(Boolean) })
}
