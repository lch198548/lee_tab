// 通用 stale-while-revalidate 缓存:
// 组件重挂载(切换分组/重开页面)时先命中缓存直接显示旧数据,后台静默拉新替换。
// 解决磁贴每次挂载都闪骨架屏的问题。
export function createSWR<T>(fetcher: (key: string) => Promise<T>) {
  const cache = new Map<string, { data: T; t: number }>()
  const inflight = new Map<string, Promise<T>>()

  // 发起(或合并进行中的)请求;成功后写入缓存
  function load(key: string): Promise<T> {
    const cur = inflight.get(key)
    if (cur) return cur
    const p = fetcher(key)
      .then((data) => {
        cache.set(key, { data, t: Date.now() })
        inflight.delete(key)
        return data
      })
      .catch((e) => {
        inflight.delete(key)
        throw e
      })
    inflight.set(key, p)
    return p
  }

  // 读取缓存(不发起请求);maxAge 内才算新鲜,过期返回 null 迫使走骨架屏
  function peek(key: string, maxAge = 5 * 60_000): T | null {
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
