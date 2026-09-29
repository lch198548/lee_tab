// GET /api/fund?codes=161725,005827 -> 基金实时穿透估值 + 多级缓存 (v2)
//
// 背景:官方盘中估值接口(fundgz / GSZ 字段)已按监管要求下线,本接口自行估算。
//
// v2(当前):主源 = 东财 F10 全量持仓
//   1. 全量持仓(半年报/年报披露,覆盖度 90%+)  -> fundf10.eastmoney.com FundArchivesDatas(type=jjcc)
//   2. 持仓股实时行情涨跌幅                     -> qt.gtimg.cn(腾讯)
//   3. 估算涨跌 est = Σ(占净值% × 个股涨跌%)     (未覆盖的现金/债券部分按 0 涨跌)
// v1(兜底):F10 失败时回退季报前十大
//   est = (Σ 占比×涨跌 / Σ 占比) × 股票仓位占比(FundMNInverstPosition + FundMNAssetAllocationNew)
// 无持仓/无股票仓位(纯债/货币/QDII)时回退为昨日净值涨跌。
// 缓存:最终结果 60s / 持仓资料 7 天;需登录(全局中间件保证)。
import { getKV, kvGetJSON, kvPutJSON, jsonResponse, errorResponse } from '../_lib/kv.js'

const EST_TTL = 60 * 1000
const STATIC_TTL = 7 * 24 * 60 * 60 * 1000
const MAX_CODES = 20
const MOBILE_BASE = 'https://fundmobapi.eastmoney.com/FundMNewApi'
const MOBILE_QS = 'deviceid=Wap&plat=Wap&product=EFund&version=6.2.8'
const F10_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function timeoutOpt(ms) {
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return { signal: AbortSignal.timeout(ms) }
  } catch {
    /* 边缘环境可能不支持,忽略 */
  }
  return {}
}

// F10 持仓代码 -> 腾讯行情 secid(1=沪 0=深 116=港);无法定价的(美股/债券等)返回空跳过
function f10Secid(code) {
  if (/^\d{6}$/.test(code)) {
    const p = code[0]
    if (p === '6') return '1.' + code
    if (p === '0' || p === '3') return '0.' + code
    return ''
  }
  if (/^\d{5}$/.test(code)) return '116.' + code
  return ''
}

// 解析 F10 响应(var apidata={content:"<html>"}) -> [{quarter, rows:[{secid,weight}]}]
// 行结构(去标签后): 序号|代码|名称|变动详情|股吧|行情|占净值比%|...
function parseF10Boxes(text) {
  const boxes = []
  for (const chunk of text.split('boxitem').slice(1)) {
    const qM = chunk.match(/(\d{4}年[1-4]季度)/)
    const rows = []
    for (const tr of chunk.match(/<tr[\s\S]*?<\/tr>/g) || []) {
      const cells = tr
        .replace(/<[^>]+>/g, '|')
        .replace(/&nbsp;/g, ' ')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
      if (cells.length < 3) continue
      const secid = f10Secid(cells[1] || '')
      const wM = cells.map((c) => c.match(/^(\d+(?:\.\d+)?)%$/)).find(Boolean)
      if (!secid || !wM) continue
      const weight = parseFloat(wM[1])
      if (weight > 0) rows.push({ secid, weight })
    }
    if (rows.length > 0) boxes.push({ quarter: qM ? qM[1] : '', rows })
  }
  return boxes
}

// F10 全量持仓:依次尝试 (年,月) 组合,取最新一期 rows>=20 的全量披露(半年报/年报);
// 都找不到时退回最新一期(季报前十大)。注意不带 month 参数时只返回季报前十大。
async function fetchF10(code) {
  const y = new Date().getFullYear()
  const tries = [
    [y, 9],
    [y, 6],
    [y, 3],
    [y - 1, 12],
    [y - 1, 6]
  ]
  let firstTop10 = null
  for (const [yy, mm] of tries) {
    let text = ''
    try {
      const res = await fetch(
        `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}&topline=200&year=${yy}&month=${mm}`,
        { ...timeoutOpt(10000), headers: { 'User-Agent': F10_UA, Referer: `https://fundf10.eastmoney.com/ccmx_${code}.html` } }
      )
      if (res.ok) text = await res.text()
    } catch {
      /* 尝试下一期 */
    }
    const boxes = text ? parseF10Boxes(text) : []
    if (boxes.length === 0) continue
    if (firstTop10 === null) firstTop10 = boxes[0]
    const full = boxes.find((b) => b.rows.length >= 20)
    if (full) return { source: 'f10', holdings: full.rows, quarter: full.quarter }
  }
  if (firstTop10) return { source: 'f10', holdings: firstTop10.rows, quarter: firstTop10.quarter }
  return null
}

// GPDM 股票代码 + 交易所标记 -> 内部 secid(v1 兜底用)
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

// 持仓资料(7 天缓存):v2 = F10 全量持仓;失败兜底 v1 季报前十大。空结果不缓存(下次重试)
async function getStatic(kv, code) {
  // 1) F10 全量持仓
  const f10Key = `fund_f10_${code}`
  const f10Cached = await kvGetJSON(kv, f10Key, null)
  if (f10Cached && Array.isArray(f10Cached.holdings) && f10Cached.holdings.length > 0 && Date.now() - (f10Cached.t || 0) < STATIC_TTL) {
    return f10Cached
  }
  const f10 = await fetchF10(code).catch(() => null)
  if (f10 && f10.holdings.length > 0) {
    const rec = { ...f10, t: Date.now() }
    await kvPutJSON(kv, f10Key, rec).catch(() => {})
    return rec
  }

  // 2) 兜底:季报前十大 + 股票仓位
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

  const rec = { source: 'top10', holdings, stockRatio, t: Date.now() }
  if (holdings.length > 0 && stockRatio !== null) {
    await kvPutJSON(kv, key, rec)
  }
  return rec
}

// 批量股票实时涨跌幅(腾讯行情,分批每 50 只)。key = 裸代码。
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
  const chunks = []
  for (let i = 0; i < symbols.length; i += 50) chunks.push(symbols.slice(i, i + 50))
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(`https://qt.gtimg.cn/q=${chunk.join(',')}`, timeoutOpt(8000))
        if (!res.ok) return
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
        /* 单批失败忽略,用已拉到的 */
      }
    })
  )
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

  // 2. 未命中的:基本信息 + 持仓资料(7 天缓存)
  const bases = new Map()
  const statics = new Map()
  const secids = new Set()
  await Promise.all(
    pending.map(async (code) => {
      const [base, stat] = await Promise.all([fetchFundBase(code), getStatic(kv, code)])
      bases.set(code, base)
      statics.set(code, stat)
      for (const h of stat.holdings || []) secids.add(h.secid)
    })
  )

  // 3. 一次批量拉所有持仓股行情
  const quoteMap = await fetchQuotes([...secids])

  // 4. 穿透估算
  //    v2(f10 全量): est = Σ(占净值% × 涨跌%) / 100
  //    v1(前十大兜底): est = 重仓股平均涨跌 × 股票仓位占比
  await Promise.all(
    pending.map(async (code) => {
      const base = bases.get(code)
      if (!base) {
        results.set(code, { code, name: code, est: 0, live: false, coverage: 0, nav: '', navChg: 0, navDate: '', estTime, err: true, t: now })
        return
      }
      const stat = statics.get(code) || {}
      const holdings = stat.holdings || []
      let wSum = 0
      let vSum = 0
      for (const h of holdings) {
        const q = quoteMap.get(h.secid.split('.').pop())
        if (q === undefined) continue
        wSum += h.weight
        vSum += h.weight * q
      }
      let live
      let est
      if (stat.source === 'f10') {
        live = wSum > 0
        est = live ? vSum / 100 : base.navChg
      } else {
        const stockAvg = wSum > 0 ? vSum / wSum : null
        live = stockAvg !== null && stat.stockRatio !== null && stat.stockRatio > 0
        est = live ? stockAvg * stat.stockRatio : base.navChg
      }
      const rec = {
        ...base,
        est: round2(est),
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
