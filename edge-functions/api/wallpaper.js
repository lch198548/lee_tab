// GET /api/wallpaper?source=bing|picsum|wallhaven&q=&page= -> 壁纸图库 JSON(元数据,图片前端直连)
// GET /api/wallpaper?u=<图片URL>                           -> 通用图片代理(自定义壁纸,缓存 7 天)
import { getKV, jsonResponse, errorResponse } from '../_lib/kv.js'
import { getGallery, serveProxiedImage } from '../_lib/wallpaper.js'

export async function onRequestGet({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const url = new URL(request.url)
  const custom = url.searchParams.get('u')
  if (custom) {
    const res = await serveProxiedImage(kv, custom).catch(() => null)
    if (!res) return errorResponse('图片获取失败', 404)
    return res
  }

  const source = url.searchParams.get('source') || 'bing'
  if (!['bing', 'picsum', 'wallhaven'].includes(source)) return errorResponse(`未知壁纸源: ${source}`, 400)
  const q = (url.searchParams.get('q') || 'nature landscape').slice(0, 60)
  const page = Math.min(50, Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1))

  const gallery = await getGallery(kv, source, q, page).catch(() => null)
  if (!gallery || !gallery.length) return errorResponse('壁纸图库获取失败', 502)
  return jsonResponse({ gallery })
}
