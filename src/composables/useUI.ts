import { reactive } from 'vue'
import { api } from '@/api'

export interface UIState {
  todoPanelX: number
  todoPanelY: number
}

const defaults: UIState = {
  todoPanelX: -16,   // 负数表示距离右边(right: 16px)
  todoPanelY: 60     // top: 60px
}

const state = reactive<UIState>({ ...defaults })
let loaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

export function useUI() {
  async function loadUI() {
    if (loaded) return
    try {
      const res = await api.getUIState()
      Object.assign(state, defaults, res || {})
    } catch {
      Object.assign(state, defaults)
    }
    loaded = true
  }

  // 防抖保存
  async function saveUI() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await api.saveUIState({ ...state })
      } catch {
        /* ignore */
      }
    }, 400)
  }

  function setPanelPos(key: 'todoPanelX' | 'todoPanelY', value: number) {
    state[key] = value
    saveUI()
  }

  return {
    ui: state,
    loadUI,
    setPanelPos
  }
}
