import {
  getKV,
  kvGetJSON,
  kvPutJSON,
  jsonResponse,
  errorResponse,
  parseJSONBody
} from '../_lib/kv.js'

const DEFAULT_CONFIG = {
  title: '我的导航',
  background: { type: 'color', value: '#1f2937' },
  backgroundBlur: 0, // 背景图模糊值(px)
  backgroundMask: 0.35, // 背景遮罩透明度(0-1)
  theme: 'dark', // dark | light | auto
  defaultEngine: 'baidu',
  engines: [
    { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=' },
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
    { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=' },
    { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com/search?q=' },
    { id: 'bilibili', name: '哔哩哔哩', url: 'https://search.bilibili.com/all?keyword=' },
    { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=' }
  ],
  openInNewTab: true
}

export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  const config = await kvGetJSON(kv, 'config', null)
  if (!config) {
    // 首次访问,写入默认配置
    await kvPutJSON(kv, 'config', DEFAULT_CONFIG)
    return jsonResponse(DEFAULT_CONFIG)
  }
  // 合并默认值,避免老数据缺少新字段
  return jsonResponse({ ...DEFAULT_CONFIG, ...config })
}

export async function onRequestPut({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)
  let body
  try {
    body = await parseJSONBody(request)
  } catch (e) {
    return errorResponse('请求体格式错误: ' + e.message, 400)
  }
  // 整体替换 config
  await kvPutJSON(kv, 'config', body)
  return jsonResponse({ ok: true })
}
