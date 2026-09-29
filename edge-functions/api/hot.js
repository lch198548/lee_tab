// GET /api/hot?source=zhihu -> 热榜聚合(多源代理 + KV 缓存 10min)
// 源: zhihu / bilibili / baidu / toutiao;单源失败互不影响。
// 注:微博(匿名 403 需登录态)/V2EX(境内直连超时)不可用,故未收录。
// 返回 { items: [{title,url,hot}], updated };hot 为原始热度值(可空),格式化在前端做。
import { getKV, kvGetJSON, kvPutJSON, jsonResponse, errorResponse } from '../_lib/kv.js'

const TTL = 10 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function timeoutOpt(ms) {
  const opt = { headers: { 'User-Agent': UA } }
  try {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opt.signal = AbortSignal.timeout(ms)
  } catch { /* 边缘环境可能不支持,忽略 */ }
  return opt
}

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[,，\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

// 知乎热榜(api.zhihu.com 匿名可用)
async function zhihu() {
  const r = await fetch('https://api.zhihu.com/topstory/hot-list?limit=30', timeoutOpt(8000))
  if (!r.ok) throw new Error('上游 ' + r.status)
  const data = await r.json()
  const list = (data && data.data) || []
  return list.slice(0, 30).map((x) => {
    const t = x.target || {}
    const m = String(t.url || '').match(/questions\/(\d+)/)
    return {
      title: String(t.title || '').trim(),
      url: m ? `https://www.zhihu.com/question/${m[1]}` : 'https://www.zhihu.com/hot',
      // detail_text 形如 "2576 万热度"
      hot: num(String(x.detail_text || '').replace(/万\s*热度?/, 'e4').replace(/热度/, ''))
    }
  }).filter((x) => x.title)
}

// B站热门
async function bilibili() {
  const r = await fetch('https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1', { ...timeoutOpt(8000), headers: { ...timeoutOpt(8000).headers, Referer: 'https://www.bilibili.com/' } })
  if (!r.ok) throw new Error('上游 ' + r.status)
  const data = await r.json()
  const list = (data.data && data.data.list) || []
  return list.slice(0, 30).map((x) => ({
    title: String(x.title || '').trim(),
    url: `https://www.bilibili.com/video/${x.bvid}`,
    hot: x.stat ? num(x.stat.view) : null
  })).filter((x) => x.title)
}

// 百度热搜(卡片为 tabTextList 双层嵌套结构)
async function baidu() {
  const r = await fetch('https://top.baidu.com/api/board?platform=wise&tab=realtime', timeoutOpt(8000))
  if (!r.ok) throw new Error('上游 ' + r.status)
  const data = await r.json()
  const cards = (data.data && data.data.cards) || []
  // content[].content[] 双层嵌套展平
  const leaves = cards.flatMap((c) => (c.content || []).flatMap((inner) => inner.content || [inner]))
  return leaves.slice(0, 30).map((x) => ({
    title: String(x.word || '').trim(),
    url: x.rawUrl || x.url || `https://www.baidu.com/s?wd=${encodeURIComponent(x.word || '')}`,
    hot: num(x.hotScore)
  })).filter((x) => x.title)
}

// 头条热榜(hot-event 公开接口)
async function toutiao() {
  const r = await fetch('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', timeoutOpt(8000))
  if (!r.ok) throw new Error('上游 ' + r.status)
  const data = await r.json()
  const list = (data && data.data) || []
  return list.slice(0, 30).map((x) => ({
    title: String(x.Title || '').trim(),
    url: x.Url || `https://www.toutiao.com/trending/${x.ClusterId}/`,
    hot: num(x.HotValue)
  })).filter((x) => x.title)
}

// 抖音热点榜(iesdouyin billboard 匿名可用)
async function douyin() {
  const r = await fetch('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/', timeoutOpt(8000))
  if (!r.ok) throw new Error('上游 ' + r.status)
  const data = await r.json()
  const list = (data && data.word_list) || []
  return list.slice(0, 30).map((x) => ({
    title: String(x.word || '').trim(),
    url: `https://www.douyin.com/search/${encodeURIComponent(x.word || '')}`,
    hot: num(x.hot_value)
  })).filter((x) => x.title)
}

// 贴吧热议榜
async function tieba() {
  const r = await fetch('https://tieba.baidu.com/hottopic/browse/topicList', timeoutOpt(8000))
  if (!r.ok) throw new Error('上游 ' + r.status)
  const data = await r.json()
  const list = ((data.data || {}).bang_topic || {}).topic_list || []
  return list.slice(0, 30).map((x) => ({
    title: String(x.topic_name || '').trim(),
    url: String(x.topic_url || `https://tieba.baidu.com/hottopic/browse/topicList?topic_id=${x.topic_id}`).replace(/&amp;/g, '&'),
    hot: num(x.discuss_num)
  })).filter((x) => x.title)
}

const FETCHERS = { zhihu, bilibili, baidu, toutiao, douyin, tieba }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const source = url.searchParams.get('source') || 'zhihu'
  const fn = FETCHERS[source]
  if (!fn) return errorResponse(`未知热榜源: ${source}`, 400)

  const kv = getKV(env)
  const key = `hot_${source}`
  const cached = kv ? await kvGetJSON(kv, key, null) : null
  if (cached && Array.isArray(cached.items) && cached.items.length && Date.now() - (cached.t || 0) < TTL) {
    return jsonResponse({ items: cached.items, updated: cached.updated })
  }

  try {
    const items = await fn()
    if (!items.length) throw new Error('上游返回空数据')
    const rec = { items, updated: new Date().toISOString(), t: Date.now() }
    if (kv) await kvPutJSON(kv, key, rec)
    return jsonResponse({ items: rec.items, updated: rec.updated })
  } catch (e) {
    // 失败时旧缓存兜底(即使过期)
    if (cached && Array.isArray(cached.items) && cached.items.length) {
      return jsonResponse({ items: cached.items, updated: cached.updated })
    }
    return errorResponse(`「${source}」热榜获取失败: ${e.message}`, 502)
  }
}
