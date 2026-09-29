// GET /api/fund?codes=161725,005827 -> 基金实时穿透估值 + 多级缓存 (v3)
//
// 背景:官方盘中估值接口(fundgz / GSZ 字段)已按监管要求下线,本接口自行估算。
//
// 按基金类型三路估算:
//   1. 场内 ETF/LOF(代码 15/16/50/51/56/58 开头):自身场内价格涨跌即实时估值,src='etf'
//   2. ETF 联接基金(名称含"联接"):F10 股票穿透失效(直持股票仅 2~3%),映射目标 ETF 后
//      用 ETF 场内涨跌 × 仓位(资产配置 GP,缺失默认 0.9)估算,src='feeder'
//   3. 普通基金:东财 F10 全量持仓穿透,src='f10';失败兜底季报前十大,src='top10'
//      est = 持仓股平均涨跌 × 股票仓位(统一仓位加权:全量持仓时 ≈ Σ(占净值×涨跌);
//      上游缩水/前十大时幅度依然正确)
// 无持仓/无股票仓位(纯债/货币/QDII)时回退为昨日净值涨跌。
// 注意:东财 F10 对同一 URL 会间歇性返回缩水内容(74只->20/10只),故多期尝试取最全一份。
// 缓存:最终结果 60s / 持仓与联接映射 7 天;需登录(全局中间件保证)。
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

// F10 全量持仓:依次尝试 (年,月) 组合,取行数最多的一份。
// 实测东财对同一 URL 会间歇性返回缩水内容(全量 74 只 -> 缩成 20/10 只,疑似限流),
// 故遍历所有候选期取最全;行数 >=60 视为明确全量提前结束。不带 month 只返回季报前十大。
async function fetchF10(code) {
  const y = new Date().getFullYear()
  const tries = [
    [y, 9],
    [y, 6],
    [y, 3],
    [y - 1, 12],
    [y - 1, 6]
  ]
  let best = null
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
    for (const b of text ? parseF10Boxes(text) : []) {
      if (!best || b.rows.length > best.rows.length) best = b
    }
    if (best && best.rows.length >= 60) break
  }
  return best ? { source: 'f10', holdings: best.rows, quarter: best.quarter } : null
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

// 场内基金代码 -> 腾讯行情 secid(ETF/LOF 自身盘中交易,价格涨跌即最准实时估值)
// 深市:15/16 开头;沪市:50/51/56/58(含 588) 开头
function etfSecidOf(code) {
  if (/^(15|16)\d{4}$/.test(code)) return '0.' + code
  if (/^(50|51|56|58)\d{4}$/.test(code)) return '1.' + code
  return ''
}

// 联接基金 -> 目标 ETF:fundsuggest 搜索 + 字符命中率评分。
// 联接基金 90%+ 净值买目标 ETF 份额,F10 股票穿透天然失效(覆盖仅 2~3%),必须映射到 ETF 本尊。
// 搜索链:①原名去联接后缀(如"华夏中证电网设备主题ETF") ②再去掉指数品牌词
//   (如"华夏电网设备ETF",搜索分词匹配不到全名时兜底,实测命中)
async function searchETF(key) {
  try {
    const res = await fetch(
      `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(key)}`,
      { ...timeoutOpt(8000), headers: { 'User-Agent': F10_UA, Referer: 'https://fund.eastmoney.com/' } }
    )
    if (!res.ok) return null
    const j = await res.json().catch(() => null)
    const list = (j && j.Datas) || []
    const chars = [...new Set(key)]
    let best = null
    let bestScore = 0
    for (const d of list) {
      const cname = String(d.NAME || '')
      if (!cname.includes('ETF') || cname.includes('联接')) continue
      if (!etfSecidOf(String(d.CODE || ''))) continue
      let hit = 0
      for (const ch of chars) if (cname.includes(ch)) hit++
      const score = hit / chars.length
      if (score > bestScore) {
        bestScore = score
        best = d
      }
    }
    if (!best || bestScore < 0.5) return null
    return { code: String(best.CODE), name: String(best.NAME) }
  } catch {
    return null
  }
}

async function findTargetETF(name) {
  const stripped = String(name || '')
    .replace(/[ABC]{1,2}(类)?份额?$/, '')
    .replace(/(发起式)?联接(基金)?$/, '')
    .trim()
  if (!stripped) return null
  const key2 = stripped.replace(/中证|国证|上证|深证|恒生|沪港深|A股|主题|指数/g, '')
  for (const key of [...new Set([stripped, key2])]) {
    const hit = await searchETF(key)
    if (hit) return hit
  }
  return null
}

// 联接映射(7 天缓存)
async function getFeeder(kv, code, name) {
  const key = `fund_feeder_${code}`
  const cached = await kvGetJSON(kv, key, null)
  if (cached && cached.secid && Date.now() - (cached.t || 0) < STATIC_TTL) return cached
  const etf = await findTargetETF(name)
  if (!etf) return null
  const rec = { etfCode: etf.code, etfName: etf.name, secid: etfSecidOf(etf.code), t: Date.now() }
  await kvPutJSON(kv, key, rec).catch(() => {})
  return rec
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

// 股票占净值比例(资产配置最新期 GP/100)。全量持仓缩水时,靠它保证估算幅度正确
async function fetchStockRatio(code) {
  const res = await fetch(`${MOBILE_BASE}/FundMNAssetAllocationNew?FCODE=${code}&${MOBILE_QS}`, timeoutOpt(8000)).catch(() => null)
  if (res && res.ok) {
    const data = await res.json().catch(() => null)
    const latest = data && Array.isArray(data.Datas) ? data.Datas[0] : null
    const gp = latest ? parseFloat(latest.GP) : NaN
    if (Number.isFinite(gp) && gp > 0) return gp / 100
  }
  return null
}

// 持仓资料(7 天缓存):v2 = F10 全量持仓(取最全一份)+ 股票仓位;失败兜底 v1 季报前十大。
// 空结果不缓存(下次重试);旧版无 stockRatio 的缓存视为无效(强制刷新)
async function getStatic(kv, code) {
  // 1) F10 全量持仓
  const f10Key = `fund_f10_${code}`
  const f10Cached = await kvGetJSON(kv, f10Key, null)
  const f10Valid =
    f10Cached && Array.isArray(f10Cached.holdings) && f10Cached.holdings.length > 0 && typeof f10Cached.stockRatio === 'number' && Date.now() - (f10Cached.t || 0) < (f10Cached.ttl || STATIC_TTL)
  if (f10Valid) return f10Cached
  const [f10, stockRatio] = await Promise.all([fetchF10(code).catch(() => null), fetchStockRatio(code)])
  if (f10 && f10.holdings.length > 0) {
    // 缩水数据(<30 只)只缓存 6h,到期自动重试抓全量;全量缓存 7 天
    const ttl = f10.holdings.length < 30 ? 6 * 60 * 60 * 1000 : STATIC_TTL
    const rec = { ...f10, stockRatio: stockRatio ?? NaN, t: Date.now(), ttl }
    if (stockRatio !== null) {
      await kvPutJSON(kv, f10Key, rec).catch(() => {})
    }
    return rec
  }

  // 2) 兜底:季报前十大 + 股票仓位
  const key = `fund_static_${code}`
  const cached = await kvGetJSON(kv, key, null)
  if (cached && Array.isArray(cached.holdings) && Date.now() - (cached.t || 0) < STATIC_TTL) {
    return cached
  }
  const posRes = await fetch(`${MOBILE_BASE}/FundMNInverstPosition?FCODE=${code}&${MOBILE_QS}`, timeoutOpt(8000)).catch(() => null)

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

  const rec = { source: 'top10', holdings, stockRatio: stockRatio ?? NaN, t: Date.now() }
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

  // 2. 未命中的:基本信息 -> 分类(场内ETF/联接基金/普通基金) -> 对应资料
  const bases = new Map()
  const statics = new Map()
  const secids = new Set()
  await Promise.all(
    pending.map(async (code) => {
      const base = await fetchFundBase(code)
      bases.set(code, base)
      if (!base) {
        statics.set(code, {})
        return
      }
      // a) 场内 ETF/LOF:自身价格即实时估值
      const self = etfSecidOf(code)
      if (self) {
        statics.set(code, { source: 'etf', holdings: [{ secid: self, weight: 100 }], stockRatio: 1, quarter: '' })
        secids.add(self)
        return
      }
      // b) ETF 联接基金:映射目标 ETF,用 ETF 场内涨跌 × 仓位估算
      if (/联接/.test(base.name)) {
        const feeder = await getFeeder(kv, code, base.name)
        if (feeder) {
          // 仓位:资产配置 GP 若 >50% 视为含 ETF 仓位可用;否则(新基金未披露/只披露直持股票)用默认 90%
          const gp = await fetchStockRatio(code).catch(() => null)
          const ratio = gp && gp > 0.5 ? gp : 0.9
          statics.set(code, { source: 'feeder', holdings: [{ secid: feeder.secid, weight: ratio * 100 }], stockRatio: ratio, quarter: '', feederName: feeder.etfName })
          secids.add(feeder.secid)
          return
        }
      }
      // c) 普通基金:F10 全量持仓穿透
      const stat = await getStatic(kv, code)
      statics.set(code, stat)
      for (const h of stat.holdings || []) secids.add(h.secid)
    })
  )

  // 3. 一次批量拉所有持仓股行情
  const quoteMap = await fetchQuotes([...secids])

  // 4. 穿透估算:统一仓位加权公式 est = 持仓股平均涨跌 × 股票仓位
  //    全量持仓时数学上 ≈ Σ(占净值×涨跌);持仓缩水/前十大时幅度依然正确(不低估)
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
      const stockAvg = wSum > 0 ? vSum / wSum : null
      // 股票仓位:优先资产配置接口;缺失时假设 = 已覆盖权重(全量持仓时二者相等)
      const gp = stat.stockRatio != null && Number.isFinite(stat.stockRatio) && stat.stockRatio > 0 ? stat.stockRatio : wSum / 100
      const live = stockAvg !== null && gp > 0
      // 诊断字段:估值来源与持仓期,前端展示徽标用于定位降级
      const rec = {
        ...base,
        est: round2(live ? stockAvg * gp : base.navChg),
        live,
        coverage: round2(wSum),
        src: stat.source || 'top10',
        quarter: stat.quarter || '',
        holds: holdings.filter((h) => quoteMap.has(h.secid.split('.').pop())).length,
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
