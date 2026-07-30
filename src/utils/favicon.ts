// 图标 URL 工具:基于书签 URL 生成在线 favicon 服务地址

const FAVICON_SERVICES = [
  // 优先级:Google s2(稳定) -> OneAPI(国内备用) -> 直接站点 favicon
  (domain: string) => `https://www.google.com/s2/favicons?sz=64&domain=${domain}`,
  (domain: string) => `https://favicon.cccyun.cc/${domain}`,
  (domain: string) => `https://${domain}/favicon.ico`
]

export function getDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname
  } catch {
    return ''
  }
}

// 获取首选 favicon URL(可换为用户配置的服务)
export function faviconUrl(url: string, serviceIndex = 0): string {
  const domain = getDomain(url)
  if (!domain) return ''
  const fn = FAVICON_SERVICES[serviceIndex] || FAVICON_SERVICES[0]
  return fn(domain)
}

// 图片加载失败时切换到下一个服务(在 onerror 中调用)
export function nextFavicon(url: string, currentSrc: string): string {
  const domain = getDomain(url)
  if (!domain) return ''
  const idx = FAVICON_SERVICES.findIndex((fn) => fn(domain) === currentSrc)
  if (idx === -1 || idx >= FAVICON_SERVICES.length - 1) {
    // 全部失败,返回空,前端展示首字母占位
    return ''
  }
  return FAVICON_SERVICES[idx + 1](domain)
}
