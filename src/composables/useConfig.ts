import { computed, watch } from 'vue'
import { api } from '@/api'
import { useAppStore } from '@/stores/app'

export function useConfig() {
  const { state } = useAppStore()

  async function loadConfig() {
    state.config = await api.getConfig()
  }

  async function saveConfig(partial: Partial<typeof state.config>) {
    if (!state.config) return
    const merged = { ...state.config, ...partial }
    state.config = merged
    await api.saveConfig(merged)
  }

  // 应用主题到 <html>
  function applyTheme(theme: 'dark' | 'light' | 'auto') {
    const root = document.documentElement
    let actual = theme
    if (theme === 'auto') {
      actual = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    root.setAttribute('data-theme', actual)
  }

  // 应用背景
  const backgroundStyle = computed(() => {
    const bg = state.config?.background
    if (!bg) return {}
    if (bg.type === 'image') {
      return {
        backgroundImage: `url("${bg.value}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }
    }
    if (bg.type === 'gradient') {
      return { backgroundImage: bg.value, backgroundAttachment: 'fixed' }
    }
    return { backgroundColor: bg.value }
  })

  // 监听 config 变化,应用主题
  watch(
    () => state.config?.theme,
    (t) => {
      if (t) applyTheme(t)
    }
  )

  // 监听系统主题(仅 auto 模式)
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.config?.theme === 'auto') applyTheme('auto')
    })
  }

  return { loadConfig, saveConfig, applyTheme, backgroundStyle }
}
