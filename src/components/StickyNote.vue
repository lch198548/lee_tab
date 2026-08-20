<template>
  <div
    class="sticky-note"
    :data-id="note.id"
    :style="noteStyle"
  >
    <div class="note-header" @mousedown="onStartDrag">
      <div class="color-tools" @mousedown.stop>
        <div class="color-picker-wrap">
          <input
            type="color"
            :value="note.bgColor"
            class="color-input"
            @input="onBgColorChange"
            title="背景色"
          />
        </div>
        <div class="color-picker-wrap">
          <input
            type="color"
            :value="note.textColor"
            class="color-input"
            @input="onTextColorChange"
            title="文字颜色"
          />
        </div>
      </div>
      <div class="note-actions" @mousedown.stop>
        <button class="note-btn" title="编辑" @click="toggleEdit">
          <EditIcon />
        </button>
        <button class="note-btn danger" title="删除" @click="onDelete">
          <TrashIcon />
        </button>
      </div>
    </div>
    <div class="note-body">
      <textarea
        v-if="editing"
        v-model="editContent"
        class="note-editor"
        :style="{ color: note.textColor }"
        @blur="onSaveEdit"
        @keydown.ctrl.enter.prevent="onSaveEdit"
      />
      <div
        v-else
        class="note-text"
        :style="{ color: note.textColor }"
        @dblclick="toggleEdit"
      >
        {{ note.content || '双击编辑...' }}
      </div>
    </div>
    <!-- 缩放手柄:右下角 -->
    <div class="resize-handle resize-se" @mousedown.stop="onStartResize('se', $event)" />
    <!-- 缩放手柄:右边 -->
    <div class="resize-handle resize-e" @mousedown.stop="onStartResize('e', $event)" />
    <!-- 缩放手柄:下边 -->
    <div class="resize-handle resize-s" @mousedown.stop="onStartResize('s', $event)" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Note } from '@/api'
import { useNotes } from '@/composables/useNotes'
import { EditIcon, TrashIcon } from './icons'

const props = defineProps<{ note: Note }>()
const { updateNote, deleteNote } = useNotes()

const editing = ref(false)
const editContent = ref(props.note.content)

watch(() => props.note.content, (v) => {
  if (!editing.value) editContent.value = v
})

const noteStyle = computed(() => {
  const w = props.note.width || 220
  const h = props.note.height || 200
  // 百分比定位:left/top 用百分比,配合 min() 确保不超出右/下边界,max(0%) 防止超出左/上
  return {
    left: `max(0%, min(${props.note.x}%, calc(100vw - ${w}px)))`,
    top: `max(0%, min(${props.note.y}%, calc(100vh - ${h}px)))`,
    width: `${w}px`,
    height: `${h}px`,
    backgroundColor: props.note.bgColor,
    color: props.note.textColor
  }
})

function toggleEdit() {
  editing.value = !editing.value
  if (editing.value) {
    nextTick(() => {
      const ta = document.querySelector(`.sticky-note[data-id="${props.note.id}"] textarea`) as HTMLTextAreaElement
      if (ta) {
        ta.focus()
        ta.select()
      }
    })
  }
}

// === 拖拽 ===
let dragging = false
let startX = 0
let startY = 0
let noteStartX = 0
let noteStartY = 0

function onStartDrag(e: MouseEvent) {
  // 只在点击 header 空白处或 color-tools 区域触发(按钮区域已 stop)
  if (editing.value) return
  const target = e.target as HTMLElement
  // 如果点在按钮或颜色选择器上,不触发拖拽
  if (target.closest('.note-btn') || target.closest('.color-input')) return
  e.preventDefault()
  dragging = true
  startX = e.clientX
  startY = e.clientY
  noteStartX = props.note.x
  noteStartY = props.note.y

  const onMove = (ev: MouseEvent) => {
    if (!dragging) return
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    const w = window.innerWidth
    const h = window.innerHeight
    // 换算成百分比增量,clamp 0-100 保证不出界
    const newX = Math.min(100, Math.max(0, noteStartX + (dx / w) * 100))
    const newY = Math.min(100, Math.max(0, noteStartY + (dy / h) * 100))
    props.note.x = newX
    props.note.y = newY
  }

  const onUp = () => {
    dragging = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    updateNote(props.note.id, { x: props.note.x, y: props.note.y }).catch(() => {})
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// === 缩放 ===
let resizing = false
let resizeDir = ''
let resizeStartX = 0
let resizeStartY = 0
let resizeStartW = 0
let resizeStartH = 0

function onStartResize(dir: string, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  resizing = true
  resizeDir = dir
  resizeStartX = e.clientX
  resizeStartY = e.clientY
  resizeStartW = props.note.width
  resizeStartH = props.note.height

  const onMove = (ev: MouseEvent) => {
    if (!resizing) return
    const dx = ev.clientX - resizeStartX
    const dy = ev.clientY - resizeStartY
    let newW = resizeStartW
    let newH = resizeStartH
    const minW = 120
    const minH = 100

    if (dir.includes('e')) {
      newW = Math.max(minW, resizeStartW + dx)
    }
    if (dir.includes('s')) {
      newH = Math.max(minH, resizeStartH + dy)
    }
    props.note.width = newW
    props.note.height = newH
  }

  const onUp = () => {
    resizing = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    updateNote(props.note.id, { width: props.note.width, height: props.note.height }).catch(() => {})
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function onBgColorChange(e: Event) {
  const color = (e.target as HTMLInputElement).value
  props.note.bgColor = color
  updateNote(props.note.id, { bgColor: color }).catch(() => {})
}

function onTextColorChange(e: Event) {
  const color = (e.target as HTMLInputElement).value
  props.note.textColor = color
  updateNote(props.note.id, { textColor: color }).catch(() => {})
}

function onSaveEdit() {
  editing.value = false
  const content = editContent.value
  if (content !== props.note.content) {
    props.note.content = content
    updateNote(props.note.id, { content }).catch(() => {})
  }
}

async function onDelete() {
  if (!confirm('删除这条便利贴?')) return
  await deleteNote(props.note.id)
}
</script>

<style scoped>
.sticky-note {
  position: fixed;
  z-index: 1000;
  border-radius: 6px;
  box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  font-family: 'Segoe UI', 'PingFang SC', sans-serif;
  transition: box-shadow 0.2s;
  user-select: none;
}

.sticky-note:hover {
  box-shadow: 3px 6px 18px rgba(0, 0, 0, 0.35);
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 6px 6px 0 0;
  cursor: move;
  flex-shrink: 0;
}

.color-tools {
  display: flex;
  gap: 4px;
  align-items: center;
}

.color-picker-wrap {
  position: relative;
}

.color-input {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.color-input::-webkit-color-swatch-wrapper {
  padding: 1px;
}

.color-input::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}

.note-actions {
  display: flex;
  gap: 2px;
}

.note-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: rgba(0, 0, 0, 0.5);
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
}

.note-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.8);
}

.note-btn.danger:hover {
  color: #ef4444;
}

.note-btn svg {
  width: 13px;
  height: 13px;
}

.note-body {
  flex: 1;
  padding: 10px 12px;
  overflow: hidden;
  min-height: 0;
}

.note-text {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
  height: 100%;
}

.note-editor {
  width: 100%;
  height: 100%;
  font-size: 14px;
  line-height: 1.5;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 缩放手柄 */
.resize-handle {
  position: absolute;
  z-index: 10;
}

.resize-se {
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: se-resize;
  background: linear-gradient(
    135deg,
    transparent 0%,
    transparent 40%,
    rgba(0, 0, 0, 0.2) 40%,
    rgba(0, 0, 0, 0.2) 55%,
    transparent 55%,
    transparent 70%,
    rgba(0, 0, 0, 0.2) 70%,
    rgba(0, 0, 0, 0.2) 85%,
    transparent 85%
  );
  border-radius: 0 0 6px 0;
}

.resize-e {
  right: 0;
  top: 24px;
  bottom: 14px;
  width: 6px;
  cursor: e-resize;
  border-radius: 0 3px 3px 0;
}

.resize-e:hover {
  background: rgba(0, 0, 0, 0.15);
}

.resize-s {
  left: 24px;
  right: 14px;
  bottom: 0;
  height: 6px;
  cursor: s-resize;
  border-radius: 0 0 3px 3px;
}

.resize-s:hover {
  background: rgba(0, 0, 0, 0.15);
}
</style>
