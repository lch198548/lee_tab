// 全局共享的数据缓存实例:磁贴与弹窗读同一份,互相预热、切换零骨架
import { createSWR } from './useSWR'
import { api } from '@/api'

// 天气:30 分钟新鲜度(与后端缓存 TTL 一致),sessionStorage 持久化(整页刷新仍在)
export const wxSWR = createSWR((city: string) => api.getWeather(city), {
  storageKey: 'swr_weather_v1',
  maxAge: 30 * 60_000
})

// 热榜:10 分钟新鲜度(与后端缓存一致)
export const hotSWR = createSWR((src: string) => api.getHot(src), {
  storageKey: 'swr_hot_v1',
  maxAge: 10 * 60_000
})
