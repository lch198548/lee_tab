// GET /api/wallpaper/image?d=YYYYMMDD -> 指定日期的必应壁纸(边缘抓取 + Blob 缓存 7 天)
import { getKV, errorResponse } from '../../_lib/kv.js'
import { serveBingImage } from '../../_lib/wallpaper.js'

export async function onRequestGet({ request, env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const url = new URL(request.url)
  const date = url.searchParams.get('d') || ''
  if (!/^\d{8}$/.test(date)) return errorResponse('缺少有效的日期参数 d', 400)

  const res = await serveBingImage(kv, date).catch(() => null)
  if (!res) return errorResponse('壁纸获取失败', 404)
  return res
}
