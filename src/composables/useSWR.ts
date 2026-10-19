// 通用 stale-while-revalidate 缓存:
// 组件重挂载(切换分组/重开页面)时先命中缓存直接显示旧数据,后台静默拉新替换。
// 可选 sessionStorage 持久化:整页刷新后缓存仍在,打开首页直接出数据不闪骨架屏。
export interface SWROptions {
  storageKey?: string // 提供则启用 sessionStorage 持久化
  maxAge?: number // 缓存新鲜度 ms,默认 5 分钟
}

export function createSWR<T>(fetcher: (key: string) => Promise<T>, opts: SWROptions = {}) {
  const maxAge = opts.maxAge ?? 5 * 60_000
  const cache = new Map<string, { data: T; t: number }>()
  const inflight = new Map<string, Promise<T>>()

  // 从 sessionStorage 恢复(仅同 tab 存活,生命周期安全)
  if (opts.storageKey && typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(opts.storageKey)
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, { data: T; t: number }>
        for (const [k, v] of Object.entries(obj)) {
          if (v && typeof v.t === 'number') cache.set(k, v)
        }
      }
    } catch {
      /* 损坏即弃用 */
    }
  }

  function persist() {
    if (!opts.storageKey || typeof sessionStorage === 'undefined') return
    try {
      sessionStorage.setItem(opts.storageKey, JSON.stringify(Object.fromEntries(cache)))
    } catch {
      /* 配额满等异常忽略 */
    }
  }

  // 发起(或合并进行中的)请求;成功后写入缓存
  function load(key: string): Promise<T> {
    const cur = inflight.get(key)
    if (cur) return cur
    const p = fetcher(key)
      .then((data) => {
        cache.set(key, { data, t: Date.now() })
        inflight.delete(key)
        persist()
        return data
      })
      .catch((e) => {
        inflight.delete(key)
        throw e
      })
    inflight.set(key, p)
    return p
  }

  // 读取新鲜缓存(不发起请求);超过新鲜度返回 null(调用方可选择走骨架屏)
  function peek(key: string): T | null {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.t < maxAge) return hit.data
    return null
  }

  // 缓存是否在请求中(避免重复发起)
  function pending(key: string): Promise<T> | undefined {
    return inflight.get(key)
  }

  return { load, peek, pending }
}
