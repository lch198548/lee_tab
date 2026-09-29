// GET /api/wallpaper/daily -> 今日必应每日一图(边缘抓取 + Blob 缓存)
// 前端「每日一图」背景模式的图片源
import { getKV, errorResponse } from '../../_lib/kv.js'
import { getBingGallery, serveBingImage } from '../../_lib/wallpaper.js'

export async function onRequestGet({ env }) {
  const kv = getKV(env)
  if (!kv) return errorResponse('Blob 存储未就绪', 500)

  const gallery = await getBingGallery(kv)
  const latest = gallery?.[0]?.date
  if (!latest) return errorResponse('壁纸元数据获取失败', 502)

  const res = await serveBingImage(kv, latest).catch(() => null)
  if (!res) return errorResponse('壁纸获取失败', 404)
  return res
}
