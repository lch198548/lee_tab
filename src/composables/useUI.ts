import { reactive } from 'vue'
import { api } from '@/api'

export interface UIState {
  // 待办面板位置,使用百分比(0-100)表示距视口左上角的位置
  // 百分比定位使窗口缩放时面板始终保持相似相对位置,min/max 保护确保始终可见
  todoPanelX: number
  todoPanelY: number
}

// 待办面板近似宽度,用于旧像素坐标换算
const PANEL_W = 300

const defaults: UIState = {
  todoPanelX: 68,   // 距左 68%(右侧区域)
  todoPanelY: 12    // 距顶 12%
}

const state = reactive<UIState>({ ...defaults })
let loaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

// 旧数据兼容:负数表示距右距离的像素值,换算成百分比
function migrateValue(v: number, vw: number, fromRight: boolean): number {
  if (fromRight) {
    // 例:-16 表示 right:16px => left = vw - PANEL_W + 16
    const leftPx = Math.max(0, vw - PANEL_W + v)
    return (leftPx / vw) * 100
  }
  return v
}

export function useUI() {
  async function loadUI() {
    if (loaded) return
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
    try {
      const res = await api.getUIState()
      const s = res || {}
      // 旧负数(距右)迁移为百分比
      if (typeof s.todoPanelX === 'number' && s.todoPanelX < 0) {
        s.todoPanelX = migrateValue(s.todoPanelX, vw, true)
      }
      Object.assign(state, defaults, s)
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

  // value 为百分比(已经过拖动换算直接赋值)
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
