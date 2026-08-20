<template>
  <div
    class="todo-panel"
    :style="panelStyle"
    ref="panelRef"
  >
    <div class="todo-header" @mousedown="onStartDrag">
      <span class="todo-title">待办</span>
      <button class="todo-tab-btn" :class="{ active: tab === 'active' }" @click.stop="tab = 'active'">
        进行中 ({{ activeTodos.length }})
      </button>
      <button class="todo-tab-btn" :class="{ active: tab === 'done' }" @click.stop="tab = 'done'">
        已完成 ({{ doneTodos.length }})
      </button>
      <button class="todo-add-btn" title="新建待办" @click.stop="$emit('add')">
        <PlusIcon />
      </button>
    </div>

    <div class="todo-list">
      <!-- 进行中 -->
      <template v-if="tab === 'active'">
        <div v-if="activeTodos.length === 0" class="todo-empty">暂无待办</div>
        <div v-for="t in activeTodos" :key="t.id" class="todo-item" @mousedown.stop>
          <button class="todo-check" @click.stop="onToggle(t.id)" title="标记完成">
            <CheckIcon />
          </button>
          <span class="todo-text">{{ t.text }}</span>
          <span class="todo-date">{{ formatDate(t.createdAt) }}</span>
        </div>
      </template>

      <!-- 已完成 -->
      <template v-if="tab === 'done'">
        <div v-if="doneTodos.length === 0" class="todo-empty">暂无已完成任务</div>
        <div v-for="t in doneTodos" :key="t.id" class="todo-item done" @mousedown.stop>
          <span class="todo-check done-check">
            <CheckIcon />
          </span>
          <span class="todo-text done-text">{{ t.text }}</span>
          <span class="todo-date">{{ formatDate(t.completedAt || t.createdAt) }}</span>
          <button class="todo-del" @click.stop="onDelete(t.id)" title="删除">
            <TrashIcon />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useTodos } from '@/composables/useTodos'
import { useUI } from '@/composables/useUI'
import { CheckIcon, TrashIcon, PlusIcon } from './icons'

defineEmits<{ (e: 'add'): void }>()

const { activeTodos, doneTodos, toggleTodo, deleteTodo } = useTodos()
const { ui, setPanelPos } = useUI()
const tab = ref<'active' | 'done'>('active')
const panelRef = ref<HTMLElement | null>(null)

const PANEL_W = 300
const PANEL_H = 400
const TOOLBAR_H = 60

// 视口尺寸(响应式,窗口变化时用于把面板拉回可视区)
const viewportW = ref(typeof window !== 'undefined' ? window.innerWidth : 1440)
const viewportH = ref(typeof window !== 'undefined' ? window.innerHeight : 900)

function onViewportResize() {
  if (typeof window === 'undefined') return
  // 窗口大小变化后,把面板位置修正到当前浏览器视口内,保证始终可见
  let l = ui.todoPanelX
  if (l < 0 && l > -9999) {
    // 初始负值表示相对右边
    l = viewportW.value - PANEL_W + l
  }
  viewportW.value = window.innerWidth
  viewportH.value = window.innerHeight
  l = Math.max(0, Math.min(viewportW.value - PANEL_W, l))
  const t = Math.max(0, Math.min(viewportH.value - PANEL_H, ui.todoPanelY))
  if (l !== ui.todoPanelX || t !== ui.todoPanelY) {
    setPanelPos('todoPanelX', Math.round(l))
    setPanelPos('todoPanelY', Math.round(t))
  }
}

onMounted(() => {
  window.addEventListener('resize', onViewportResize)
  onViewportResize() // 首次挂载即按当前窗口修正
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportResize)
})

const panelStyle = computed(() => {
  // 与便签一致:针对当前浏览器视口定位并限制在窗口内
  let leftPx = ui.todoPanelX
  if (leftPx < 0 && leftPx > -9999) {
    leftPx = viewportW.value - PANEL_W + leftPx
  }
  leftPx = Math.max(0, Math.min(viewportW.value - PANEL_W, leftPx))
  const topPx = Math.max(TOOLBAR_H, Math.min(viewportH.value - 40, ui.todoPanelY))
  return {
    left: `${leftPx}px`,
    top: `${topPx}px`
  }
})

function formatDate(ts: number) {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

async function onToggle(id: string) {
  await toggleTodo(id)
}

async function onDelete(id: string) {
  await deleteTodo(id)
}

// 拖拽
let dragging = false
let startX = 0
let startY = 0
let startLeft = 0
let startTop = 0

function onStartDrag(e: MouseEvent) {
  const target = e.target as HTMLElement
  // 如果点在按钮/颜色选择器/输入框上, 不触发
  if (target.closest('button') || target.closest('input') || target.closest('a')) return
  e.preventDefault()

  dragging = true
  startX = e.clientX
  startY = e.clientY

  // 从 style.left / style.top 取当前像素值
  const rect = panelRef.value?.getBoundingClientRect()
  startLeft = rect?.left ?? 0
  startTop = rect?.top ?? 0

  const onMove = (ev: MouseEvent) => {
    if (!dragging) return
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    let newLeft = startLeft + dx
    let newTop = startTop + dy
    // 限制在窗口内
    const w = window.innerWidth
    const h = window.innerHeight
    newLeft = Math.max(-PANEL_W + 40, Math.min(w - 40, newLeft))
    const panelH = panelRef.value?.offsetHeight || 400
    newTop = Math.max(0, Math.min(h - 40, newTop))
    setPanelPos('todoPanelX', Math.round(newLeft))
    setPanelPos('todoPanelY', Math.round(newTop))
  }

  const onUp = () => {
    dragging = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.todo-panel {
  position: fixed;
  z-index: 900;
  width: 300px;
  max-height: 60vh;
  background: rgba(30, 41, 59, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  cursor: move;
  user-select: none;
}

.todo-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-right: auto;
}

.todo-tab-btn {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.todo-tab-btn.active {
  background: rgba(96, 165, 250, 0.2);
  color: rgba(147, 197, 253, 1);
}

.todo-add-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(96, 165, 250, 0.15);
  color: rgba(147, 197, 253, 1);
  cursor: pointer;
  border: none;
  transition: all 0.15s;
  flex-shrink: 0;
}

.todo-add-btn:hover {
  background: rgba(96, 165, 250, 0.3);
}

.todo-add-btn svg {
  width: 14px;
  height: 14px;
}

.todo-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.todo-list::-webkit-scrollbar {
  width: 4px;
}

.todo-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.todo-empty {
  text-align: center;
  padding: 24px 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  transition: background 0.15s;
}

.todo-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.todo-check {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
  color: transparent;
}

.todo-check:hover {
  border-color: #22c55e;
  color: #22c55e;
}

.done-check {
  border-color: #22c55e;
  background: #22c55e;
  color: #fff;
  cursor: default;
}

.todo-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.done-text {
  text-decoration: line-through;
  color: rgba(255, 255, 255, 0.4);
}

.todo-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.todo-del {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  flex-shrink: 0;
  border: none;
  transition: all 0.15s;
}

.todo-del:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.todo-del svg {
  width: 13px;
  height: 13px;
}
</style>
