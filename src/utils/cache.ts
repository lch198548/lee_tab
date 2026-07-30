// 浏览器本地缓存工具 - 缓存分组和配置数据,减少网络请求
// 数据变动时写入新缓存,加载时优先使用缓存再后台刷新

const CACHE_KEY_GROUPS = 'nav_cache_groups'
const CACHE_KEY_CONFIG = 'nav_cache_config'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24小时过期

interface CacheEntry<T> {
  data: T
  timestamp: number
}

function get<T>(key: string): { data: T; fromCache: true; expired: boolean } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    const expired = Date.now() - entry.timestamp > CACHE_TTL
    return { data: entry.data, fromCache: true, expired }
  } catch {
    return null
  }
}

function set<T>(key: string, data: T) {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // 忽略 localStorage 写入失败(如隐私模式)
  }
}

export const cacheGroups = {
  get<T>(): { data: T; expired: boolean } | null {
    return get<T>(CACHE_KEY_GROUPS) as { data: T; expired: boolean } | null
  },
  set<T>(data: T) {
    set(CACHE_KEY_GROUPS, data)
  }
}

export const cacheConfig = {
  get<T>(): { data: T; expired: boolean } | null {
    return get<T>(CACHE_KEY_CONFIG) as { data: T; expired: boolean } | null
  },
  set<T>(data: T) {
    set(CACHE_KEY_CONFIG, data)
  }
}

export function clearAllCache() {
  localStorage.removeItem(CACHE_KEY_GROUPS)
  localStorage.removeItem(CACHE_KEY_CONFIG)
}
