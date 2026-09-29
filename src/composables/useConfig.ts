import { computed, watch } from 'vue'
import { api } from '@/api'
import { useAppStore } from '@/stores/app'
import { cacheConfig } from '@/utils/cache'

export function useConfig() {
  const { state } = useAppStore()

  async function loadConfig() {
    // 优先从缓存加载
    const cached = cacheConfig.get<typeof state.config>()
    if (cached && !cached.expired) {
      state.config = cached.data
    } else if (cached) {
      state.config = cached.data
      // 后台异步刷新
      api.getConfig().then((config) => {
        state.config = config
        cacheConfig.set(config)
      }).catch(() => {})
      return
    }
    // 无缓存,从后端加载
    const config = await api.getConfig()
    state.config = config
    cacheConfig.set(config)
  }

  async function saveConfig(partial: Partial<typeof state.config>) {
    if (!state.config) return
    const merged = { ...state.config, ...partial }
    state.config = merged
    await api.saveConfig(merged)
    cacheConfig.set(merged)
  }

  // 背景层样式(图片/必应壁纸/渐变/纯色),应用到一个独立的背景 div 上
  // 内容层不应用模糊,以保证文字清晰
  const backgroundLayerStyle = computed(() => {
    const bg = state.config?.background
    if (!bg) return { backgroundColor: 'var(--bg-page)' }
    if (bg.type === 'image') {
      return {
        backgroundImage: `url("${bg.value}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }
    }
    if (bg.type === 'bing') {
      // value 为空 = 今日必应每日一图;为日期 = 固定某天壁纸(均走边缘代理缓存)
      const src = bg.value ? `/api/wallpaper/image?d=${bg.value}` : '/api/wallpaper/daily'
      return {
        backgroundImage: `url("${src}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }
    }
    if (bg.type === 'video') {
      // 视频由独立的 <video> 元素渲染,此层只提供底色
      return { backgroundColor: '#000' }
    }
    if (bg.type === 'gradient') {
      return { backgroundImage: bg.value }
    }
    return { backgroundColor: bg.value }
  })

  // 是否为视频背景
  const isVideoBg = computed(() => state.config?.background?.type === 'video')

  // 视频背景 URL
  const backgroundVideoSrc = computed(() => {
    const bg = state.config?.background
    return bg && bg.type === 'video' ? bg.value : ''
  })

  // 背景模糊值(对图片/必应壁纸/视频背景生效)
  const backgroundBlurPx = computed(() => {
    const bg = state.config?.background
    if (!bg || (bg.type !== 'image' && bg.type !== 'video' && bg.type !== 'bing')) return 0
    const v = Number((state.config as any)?.backgroundBlur)
    return Number.isFinite(v) && v > 0 ? v : 0
  })

  // 背景遮罩透明度(对图片/必应壁纸/视频背景生效,0-1)
  const backgroundMaskAlpha = computed(() => {
    const bg = state.config?.background
    if (!bg || (bg.type !== 'image' && bg.type !== 'video' && bg.type !== 'bing')) return 0
    const v = Number((state.config as any)?.backgroundMask)
    if (!Number.isFinite(v)) return 0.35
    return Math.max(0, Math.min(1, v))
  })

  // 兼容旧 App.vue 的 backgroundStyle(不再使用,返回空对象)
  const backgroundStyle = computed(() => ({}))

  // 页面标题同步到浏览器标签页
  watch(
    () => state.config?.title,
    (t) => {
      document.title = t || '导航'
    },
    { immediate: true }
  )

  return {
    loadConfig,
    saveConfig,
    backgroundStyle,
    backgroundLayerStyle,
    isVideoBg,
    backgroundVideoSrc,
    backgroundBlurPx,
    backgroundMaskAlpha
  }
}
