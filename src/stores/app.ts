// 全局响应式状态(不引入 Pinia,使用 Vue3 reactive)
import { reactive, toRefs } from 'vue'
import type { AppConfig, Group } from '@/api'

interface AppState {
  loggedIn: boolean | null // null = 检测中
  loading: boolean
  config: AppConfig | null
  groups: Group[]
  settingsOpen: boolean
}

const state = reactive<AppState>({
  loggedIn: null,
  loading: true,
  config: null,
  groups: [],
  settingsOpen: false
})

export function useAppStore() {
  return {
    ...toRefs(state),
    state
  }
}
